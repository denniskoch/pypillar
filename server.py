"""
Name plate server — FastAPI + Microsoft Graph (app-only auth)

Azure app registration requirements:
  - API permissions: User.Read.All (application), Presence.Read.All (application)
  - Admin consent:   Required — click "Grant admin consent" after adding permissions
  - Client secret:   Certificates & secrets → New client secret → copy value immediately
  - USER_ID:         Entra ID → Users → your profile → Object ID
"""

import asyncio
import os
from contextlib import asynccontextmanager

import httpx
import msal
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

CLIENT_ID     = os.environ["PYPILLAR_CLIENT_ID"]
TENANT_ID     = os.environ["PYPILLAR_TENANT_ID"]
CLIENT_SECRET = os.environ["PYPILLAR_CLIENT_SECRET"]
USER_ID       = os.environ["PYPILLAR_USER_ID"]
COMPANY_NAME  = os.environ["PYPILLAR_COMPANY_NAME"]
SCOPES        = ["https://graph.microsoft.com/.default"]
GRAPH_BASE    = "https://graph.microsoft.com/v1.0"
POLL_INTERVAL = 30  # seconds

state: dict = {"profile": None, "presence": "Unknown"}


# ── MSAL ──────────────────────────────────────────────

def _get_token() -> str:
    client = msal.ConfidentialClientApplication(
        CLIENT_ID,
        authority=f"https://login.microsoftonline.com/{TENANT_ID}",
        client_credential=CLIENT_SECRET,
    )
    result = client.acquire_token_for_client(scopes=SCOPES)
    if "access_token" not in result:
        raise RuntimeError(f"Auth failed: {result.get('error_description')}")
    return result["access_token"]


# ── Graph polling ─────────────────────────────────────

def _parse_name(display_name: str) -> tuple[str, str]:
    """
    Returns (first, last) as uppercase strings.
    Handles both 'John Doe' and 'Doe, John' formats.
    """
    if "," in display_name:
        last, _, first = display_name.partition(",")
        return first.strip().upper(), last.strip().upper()
    parts = display_name.rsplit(" ", 1)
    if len(parts) == 2:
        return parts[0].upper(), parts[1].upper()
    return display_name.upper(), ""


async def _poll_graph() -> None:
    loop = asyncio.get_running_loop()
    while True:
        try:
            token   = await loop.run_in_executor(None, _get_token)
            headers = {"Authorization": f"Bearer {token}"}

            async with httpx.AsyncClient() as client:
                me_res, presence_res = await asyncio.gather(
                    client.get(f"{GRAPH_BASE}/users/{USER_ID}", headers=headers),
                    client.get(f"{GRAPH_BASE}/users/{USER_ID}/presence", headers=headers),
                )

            if me_res.status_code == 200:
                me = me_res.json()
                first, last = _parse_name(me.get("displayName", ""))
                state["profile"] = {
                    "firstName": first,
                    "lastName":  last,
                    "title":     me.get("jobTitle", ""),
                }

            if presence_res.status_code == 200:
                state["presence"] = presence_res.json().get("availability", "Unknown")

        except Exception as exc:
            print(f"Graph poll error: {exc}", flush=True)

        await asyncio.sleep(POLL_INTERVAL)


# ── App lifecycle ─────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(_poll_graph())
    yield


app = FastAPI(lifespan=lifespan)


# ── API ───────────────────────────────────────────────

@app.get("/api/status")
def get_status():
    return JSONResponse({
        "company":  COMPANY_NAME,
        "profile":  state["profile"],
        "presence": state["presence"],
    })


# Static files — must be last so /api routes take priority
app.mount("/", StaticFiles(directory="static", html=True), name="static")
