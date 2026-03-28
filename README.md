# PyPillar

A workplace nameplate and presence display for a Raspberry Pi 4 connected to a 480×1920 portrait LCD. Shows your name, job title, and real-time Microsoft Teams availability — pulled live from Microsoft Graph.

![Dark themed display showing name, status, clock, and IT facts]

---

## Features

- **Live presence** — reflects your Teams status (Available, Busy, Do Not Disturb, Away, etc.)
- **Ambient glow** — background color shifts with your status
- **Clock** — 12-hour time with blinking colon and full date
- **Rotating facts** — IT trivia cycles every 12 seconds
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
3. Click **Grant admin consent**
4. Go to **Certificates & secrets → New client secret** — copy the value immediately
5. Note the **Application (client) ID** and **Directory (tenant) ID** from the Overview page
6. Find the target user's **Object ID** under **Entra ID → Users → [user] → Overview**

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
| `PYPILLAR_USER_ID` | Object ID of the user to display |
| `PYPILLAR_COMPANY_NAME` | Company name shown at the top of the display |

---

## Running

```bash
uvicorn server:app --host 0.0.0.0 --port 8000
```

Then open `http://localhost:8000` in a browser. On the Pi, point a fullscreen Chromium window at this address.

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
@chromium-browser --kiosk --noerrdialogs --disable-infobars http://localhost:8000
```

---

## Presence mapping

| Teams status | Display label | Color |
|---|---|---|
| Available | Available | Green |
| Busy | In a Meeting | Red |
| DoNotDisturb | Do Not Disturb | Red |
| BeRightBack | Be Right Back | Amber |
| OutOfOffice | Out of Office | Amber |
| Away | Away | Amber |
| Offline | Offline | Amber |
| PresenceUnknown | Offline | Amber |

When `workLocation` is `remote`, a **Remote** badge is appended to the label for: Available, Busy, DoNotDisturb, BeRightBack, and Away.

---

## Project structure

```
pypillar/
├── server.py          # FastAPI backend — MSAL auth + Graph polling
├── requirements.txt
├── .env.example
└── static/
    ├── index.html     # Layout
    ├── style.css      # Dark theme, 480×1920 fixed viewport
    ├── script.js      # API polling, clock, fact rotation
    └── facts.json     # IT trivia
```
