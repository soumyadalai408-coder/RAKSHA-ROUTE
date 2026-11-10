# RAKSHA ROUTE

RAKSHA ROUTE is a React/Vite emergency and transit coordination interface backed by FastAPI, SQLAlchemy, SQLite, and WebSockets.

## Windows 11 LAN setup

1. Install Node.js 20+ and Python 3.11+.
2. From the project folder, install dependencies:

```powershell
npm install
py -m pip install -r .\backend\requirements.txt
```

3. Optional: copy `.env.example` to `.env`. Leave `VITE_API_URL` empty for automatic LAN host detection. For background Web Push, generate VAPID keys and set all three VAPID variables.
4. Open two PowerShell windows in the project folder:

```powershell
py -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
npm run dev -- --host 0.0.0.0
```

5. Allow the ports through Windows Firewall in an elevated PowerShell:

```powershell
New-NetFirewallRule -DisplayName "RAKSHA ROUTE API 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
New-NetFirewallRule -DisplayName "RAKSHA ROUTE Web 5173" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow
```

6. On the host computer, run `ipconfig` and find its Wi-Fi IPv4 address. On every computer or phone connected to the same Wi-Fi, open:

```
http://HOST_IPV4_ADDRESS:5173
```

The frontend derives the API and WebSocket host from the page hostname, so remote devices do not use `localhost`.

## Realtime behavior

- Every incident is stored in `backend/raksha_route.db`.
- FastAPI broadcasts incident creation and update events to every connected WebSocket client.
- Reconnecting clients receive a complete incident and notification snapshot, including incidents created while disconnected.
- Clearing or verifying an incident updates the SQLite record and synchronizes every map, list, and alert view.
- The Alerts page shows notification history and an unread counter. Critical and high alerts show a visible red popup and sound (sound can be muted).
- Browser notifications are requested when the app opens. They work while the page is open or backgrounded.
- The included service worker supports Web Push when VAPID keys are configured and the site is served from HTTPS. Plain HTTP LAN pages cannot use Web Push in most browsers; WebSockets remain the live LAN mechanism while the page is open.

## Validation

```powershell
npm run build
python -m py_compile .\backend\main.py
```

To test multiple clients, open the LAN URL on two devices, report a `Road Blocked` incident on one, and confirm the red alert, unread count, browser notification, sound, and map marker appear on the other without refresh. Clear it from either device and confirm the update propagates.
