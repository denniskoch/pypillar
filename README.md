# PyPillar

A workplace nameplate and presence display for a Raspberry Pi 4 connected to a 480×1920 portrait LCD. Shows your name, job title, and real-time Microsoft Teams availability — pulled live from Microsoft Graph.

![Dark themed display showing name, status, clock, and IT facts]

---

## Features

- **Live presence** — reflects your Teams status (Available, Busy, Do Not Disturb, Away, etc.)
- **Free After** — shows end of current busy block when in a meeting (requires `Calendars.Read`)
- **Ambient glow** — background color shifts with your status
- **Clock** — 12-hour time with blinking colon and full date
- **Rotating facts** — IT trivia cycles every 12 seconds
- **Multi-user** — single server instance handles multiple nameplates via `/{username}`
- **Zero interaction** — fully automated after boot

---

## Hardware

| Component | Details |
|---|---|
| SBC | Raspberry Pi 4 |
| Display | 480×1920 portrait LCD via HDMI |

---

## Prerequisites

- Python 3.11+
- An Azure app registration with the following **application** permissions (admin consent required):
  - `User.Read.All`
  - `Presence.Read.All`
  - `Calendars.Read` *(optional — enables the "Free After" indicator; omit to skip it)*

### Azure app registration setup

1. Go to **Entra ID → App registrations → New registration**
2. Add API permissions: `User.Read.All` and `Presence.Read.All` (both **Application** type)
3. Optionally add `Calendars.Read` (**Application** type) for the Free After feature
4. Click **Grant admin consent**
5. Go to **Certificates & secrets → New client secret** — copy the value immediately
6. Note the **Application (client) ID** and **Directory (tenant) ID** from the Overview page

---

## Installation

```bash
cd /opt
git clone https://github.com/denniskoch/pypillar.git
cd pypillar
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

`.env` variables:

| Variable | Description |
|---|---|
| `PYPILLAR_CLIENT_ID` | Azure app registration client ID |
| `PYPILLAR_TENANT_ID` | Azure tenant (directory) ID |
| `PYPILLAR_CLIENT_SECRET` | Client secret value |
| `PYPILLAR_DOMAIN` | UPN domain suffix, e.g. `company.com` |
| `PYPILLAR_COMPANY_NAME` | Company name shown at the top of the display |
| `PYPILLAR_ALLOWED_SUBNETS` | *(optional)* Comma-separated CIDRs to restrict access, e.g. `10.0.0.0/8,192.168.1.0/24`. Empty = allow all. |
| `PYPILLAR_TRUST_PROXY` | *(optional)* Set to `1` if behind a reverse proxy to trust `X-Forwarded-For` for subnet checks |

---

## Running

```bash
uvicorn server:app --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000/{username}` in a browser, where `{username}` is the UPN prefix (e.g. `jsmith` for `jsmith@company.com`). On the Pi, point a fullscreen Chromium window at this address.

Append `?layout=h` for the horizontal layout variant.

### Autostart on the Pi

Create a systemd service at `/etc/systemd/system/pypillar.service`:

```ini
[Unit]
Description=pypillar nameplate
After=network-online.target
Wants=network-online.target

[Service]
User=pi
WorkingDirectory=/home/pi/pypillar
EnvironmentFile=/home/pi/pypillar/.env
ExecStart=/home/pi/pypillar/.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8000
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable pypillar
sudo systemctl start pypillar
```

For a fullscreen Chromium kiosk at boot, add to `/etc/xdg/lxsession/LXDE-pi/autostart`:

```
@chromium-browser --kiosk --noerrdialogs --disable-infobars http://localhost:8000/jsmith
```

---

## Presence mapping

| Teams status | Display label | Color |
|---|---|---|
| Available | Available | Green |
| Busy | In a Meeting | Red |
| DoNotDisturb | Do Not Disturb | Red |
| BeRightBack | Be Right Back | Amber |
| Away | Away | Amber |
| Offline | Offline | Amber |
| PresenceUnknown | Offline | Amber |
| Out of Office* | Out of Office | Purple |

\* OOF is detected via `outOfOfficeSettings.isOutOfOffice` and takes precedence over the reported availability value, so it displays correctly even when Teams reports a different underlying status (e.g. Offline with OOO left on).

When `workLocation` is `remote`, a **Remote** badge is appended to the label for: Available, Busy, DoNotDisturb, BeRightBack, and Away.

When presence is Busy or DoNotDisturb and `Calendars.Read` is granted, a **Free After** time is shown beneath the status label indicating the end of the current contiguous busy block.

---

## Project structure

```
pypillar/
├── server.py            # FastAPI backend — MSAL auth, Graph polling, routing
├── requirements.txt
├── .env.example
└── static/
    ├── index-v.html     # Portrait layout (480×1920)
    ├── index-h.html     # Landscape layout
    ├── style-v.css      # Portrait styles
    ├── style-h.css      # Landscape styles
    ├── script.js        # API polling, clock, fact rotation, name auto-fit
    ├── error.html       # Shown at / when no username is provided
    └── facts.json       # IT trivia
```
