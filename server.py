"""
Name plate server — FastAPI + Microsoft Graph (app-only auth)

Azure app registration requirements:
  - API permissions: User.Read.All (application), Presence.Read.All (application),
                     Calendars.Read (application, optional — for "Free After")
  - Admin consent:   Required — click "Grant admin consent" after adding permissions
  - Client secret:   Certificates & secrets → New client secret → copy value immediately

Hosting model:
  - Single instance serves all users via  GET /<username>
  - Username is the UPN prefix (e.g. "dkoch" for dkoch@company.com)
  - PYPILLAR_DOMAIN resolves UPN:  dkoch → dkoch@company.com
  - Pollers start on first request for a username and run forever
  - Access can be restricted to specific subnets via PYPILLAR_ALLOWED_SUBNETS
"""

from __future__ import annotations

import asyncio
import ipaddress
import os
import re
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import msal
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

load_dotenv()

CLIENT_ID     = os.environ["PYPILLAR_CLIENT_ID"]
TENANT_ID     = os.environ["PYPILLAR_TENANT_ID"]
CLIENT_SECRET = os.environ["PYPILLAR_CLIENT_SECRET"]
DOMAIN        = os.environ["PYPILLAR_DOMAIN"]          # e.g. "company.com"
COMPANY_NAME  = os.environ["PYPILLAR_COMPANY_NAME"]

# Optional subnet restriction — comma-separated CIDRs, empty/unset = allow all
_raw_subnets  = os.environ.get("PYPILLAR_ALLOWED_SUBNETS", "").strip()
ALLOWED_NETS: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = [
    ipaddress.ip_network(s.strip(), strict=False)
    for s in _raw_subnets.split(",")
    if s.strip()
]
TRUST_PROXY   = os.environ.get("PYPILLAR_TRUST_PROXY", "0") == "1"

SCOPES        = ["https://graph.microsoft.com/.default"]
GRAPH_BASE    = "https://graph.microsoft.com/v1.0"
POLL_INTERVAL = 30   # seconds
HTTP_TIMEOUT  = httpx.Timeout(10.0)

# username slug → {profile, presence, workLocation, freeAfter}
state: dict[str, dict] = {}
# slugs that already have a running poller task
_pollers: set[str] = set()

SLUG_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9\-]{0,63}$")

STATIC_DIR = Path(__file__).parent / "static"


# ── MSAL ──────────────────────────────────────────────

_msal_app = msal.ConfidentialClientApplication(
    CLIENT_ID,
    authority=f"https://login.microsoftonline.com/{TENANT_ID}",
    client_credential=CLIENT_SECRET,
)

def _get_token() -> str:
    result = _msal_app.acquire_token_for_client(scopes=SCOPES)
    if "access_token" not in result:
        raise RuntimeError(f"Auth failed: {result.get('error_description')}")
    return result["access_token"]


# ── Graph helpers ─────────────────────────────────────

def _parse_name(me: dict) -> tuple[str, str]:
    first = me.get("givenName") or ""
    last  = me.get("surname") or ""
    if first or last:
        return first.strip().upper(), last.strip().upper()
    parts = me.get("displayName", "").rsplit(" ", 1)
    if len(parts) == 2:
        return parts[0].upper(), parts[1].upper()
    return me.get("displayName", "").upper(), ""


async def _get_free_after(
    client: httpx.AsyncClient, headers: dict, upn: str
) -> str | None:
    # calendarView accepts UPN directly (unlike presence, which requires OID)
    try:
        now        = datetime.now(timezone.utc)
        end_window = now + timedelta(hours=8)
        resp = await client.get(
            f"{GRAPH_BASE}/users/{upn}/calendarView",
            headers={**headers, "Prefer": 'outlook.timezone="UTC"'},
            params={
                "startDateTime": now.strftime("%Y-%m-%dT%H:%M:%S"),
                "endDateTime":   end_window.strftime("%Y-%m-%dT%H:%M:%S"),
                "$select":       "start,end,showAs",
                "$orderby":      "start/dateTime",
                "$top":          "20",
            },
        )
        if resp.status_code != 200:
            return None

        busy_events = [
            e for e in resp.json().get("value", [])
            if e.get("showAs") in ("busy", "tentative", "oof", "workingElsewhere")
        ]

        def _parse_dt(s: str) -> datetime:
            # Graph returns 7-digit fractional seconds; Python 3.9 fromisoformat
            # only handles up to 6 — truncate to the seconds boundary to be safe.
            return datetime.fromisoformat(s[:19]).replace(tzinfo=timezone.utc)

        block_end: datetime | None = None
        for e in busy_events:
            e_start = _parse_dt(e["start"]["dateTime"])
            e_end   = _parse_dt(e["end"]["dateTime"])

            if block_end is None:
                if e_start <= now < e_end:
                    block_end = e_end
                elif e_start > now:
                    break
            else:
                if e_start <= block_end + timedelta(minutes=5):
                    block_end = max(block_end, e_end)
                else:
                    break

        if not block_end or block_end <= now:
            return None

        local_end = block_end.astimezone()
        h    = local_end.hour % 12 or 12
        m    = local_end.strftime("%M")
        ampm = "PM" if local_end.hour >= 12 else "AM"
        return f"{h}:{m} {ampm}"

    except Exception:
        return None


# ── Per-user poller ───────────────────────────────────

async def _poll_user(username: str) -> None:
    upn     = f"{username}@{DOMAIN}"
    loop    = asyncio.get_running_loop()
    # Object ID is resolved on first successful profile fetch and reused after
    oid: str | None = None
    while True:
        try:
            token   = await loop.run_in_executor(None, _get_token)
            headers = {"Authorization": f"Bearer {token}"}

            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
                entry = state.setdefault(username, {
                    "profile": None, "presence": "Unknown",
                    "workLocation": None, "freeAfter": None, "outOfOffice": False,
                })

                # Presence endpoint requires object ID (UPN returns PresenceUnknown).
                # Resolve OID from profile on first call, then fetch in parallel after.
                if oid is None:
                    me_res = await client.get(f"{GRAPH_BASE}/users/{upn}", headers=headers)
                    if me_res.status_code == 404:
                        print(f"[{username}] UPN not found in directory: {upn}", flush=True)
                    if me_res.status_code == 200:
                        oid = me_res.json().get("id")
                    presence_res = await client.get(
                        f"{GRAPH_BASE}/users/{oid or upn}/presence", headers=headers
                    )
                else:
                    me_res, presence_res = await asyncio.gather(
                        client.get(f"{GRAPH_BASE}/users/{upn}", headers=headers),
                        client.get(f"{GRAPH_BASE}/users/{oid}/presence", headers=headers),
                    )

                if me_res.status_code == 200:
                    me = me_res.json()
                    first, last = _parse_name(me)
                    entry["profile"] = {
                        "firstName": first,
                        "lastName":  last,
                        "title":     me.get("jobTitle", ""),
                    }

                if presence_res.status_code == 200:
                    presence = presence_res.json()
                    entry["presence"]     = presence.get("availability", "Unknown")
                    entry["workLocation"] = (presence.get("workLocation") or {}).get("workLocationType")
                    entry["outOfOffice"]  = (
                        presence.get("availability") == "OutOfOffice"
                        or bool((presence.get("outOfOfficeSettings") or {}).get("isOutOfOffice"))
                    )

                entry["freeAfter"] = await _get_free_after(client, headers, upn)

        except Exception as exc:
            print(f"[{username}] Poll error: {exc}", flush=True)

        await asyncio.sleep(POLL_INTERVAL)


def _ensure_poller(username: str) -> None:
    """Start a background poller for username if one isn't already running."""
    if username not in _pollers:
        _pollers.add(username)
        state.setdefault(username, {
            "profile": None, "presence": "Unknown",
            "workLocation": None, "freeAfter": None, "outOfOffice": False,
        })
        asyncio.create_task(_poll_user(username))


# ── Subnet middleware ─────────────────────────────────

class SubnetMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not ALLOWED_NETS:
            return await call_next(request)

        if TRUST_PROXY:
            forwarded = request.headers.get("X-Forwarded-For", "")
            raw_ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "")
        else:
            raw_ip = request.client.host if request.client else ""

        try:
            addr = ipaddress.ip_address(raw_ip)
        except ValueError:
            return JSONResponse({"detail": "Forbidden"}, status_code=403)

        if any(addr in net for net in ALLOWED_NETS):
            return await call_next(request)

        return JSONResponse({"detail": "Forbidden"}, status_code=403)


# ── App lifecycle ─────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(SubnetMiddleware)


# ── Routes ────────────────────────────────────────────

@app.get("/")
def index():
    return HTMLResponse((STATIC_DIR / "error.html").read_text())


@app.get("/api/status/{username}")
def get_status(username: str):
    if username not in state:
        return JSONResponse({"detail": "Not found"}, status_code=404)
    entry = state[username]
    return JSONResponse({
        "company":      COMPANY_NAME,
        "profile":      entry["profile"],
        "presence":     entry["presence"],
        "workLocation": entry["workLocation"],
        "freeAfter":    entry["freeAfter"],
        "outOfOffice":  entry["outOfOffice"],
    })


@app.get("/{username}")
async def nameplate(username: str, request: Request, layout: str = "v", background: str = ""):
    if not SLUG_RE.match(username):
        return JSONResponse({"detail": "Invalid username"}, status_code=400)

    _ensure_poller(username)

    template = "index-h.html" if layout == "h" else "index-v.html"
    css_file  = "style-h.css" if layout == "h" else "style-v.css"
    html = (STATIC_DIR / template).read_text()

    # Cache-bust version = file mtime (changes whenever file is saved)
    def _v(name: str) -> str:
        return str(int((STATIC_DIR / name).stat().st_mtime))

    # Sanitise background value — alphanumeric only
    bg = background.lower() if re.match(r'^[a-z0-9-]+$', background) else ""

    # Inject username + replace asset URLs with versioned equivalents
    injection = f'<script>window.PYPILLAR_USERNAME = "{username}"; window.PYPILLAR_BACKGROUND = "{bg}";</script>\n'
    html = html.replace("<script src=\"script.js\"></script>",
                        injection + f'    <script src="/static/script.js?v={_v("script.js")}"></script>')
    html = html.replace(f'href="/static/{css_file}"',
                        f'href="/static/{css_file}?v={_v(css_file)}"')

    return HTMLResponse(html)


# Static assets — served under /static/
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
