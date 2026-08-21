# Factory Terminal tablet rollout runbook

Owner: Angus / Anglo Windows  
Frequency: as needed for each factory tablet  
Last updated: 2026-08-21

## Purpose

Set up each HTC AT01 factory tablet so staff can open the Factory Terminal,
keep the screen awake while powered, stay on Wi-Fi, and avoid drifting away
from the live Material Planner screen.

The Google Sheet remains the master. The tablets only work when the planner PC
is running the live bridge server with `Sheet sync: ON`.

## Prerequisites

- Planner PC is on the factory Wi-Fi/LAN.
- Planner PC IP is `192.168.0.84` or the tablet shortcuts/scripts are updated.
- Live server is running from:

```powershell
cd "C:\Users\angusm\CLAUDE MASTER\anglo-planner"
.\tools\start-live-server.ps1 -WebAppUrl "https://script.google.com/macros/s/AKfycbxpSODFH2FRTYETSmHsOl185USvyqtAuez5EIfFcOAM5JjSa7x7aa5S-rcGw5LTfFyyBg/exec"
```

- The server window must show:

```text
Sheet sync: ON
[sheet] REDO bridge: READY
```

- Tablet is connected by USB debug for setup only.
- Tablet is joined to the same factory Wi-Fi as the planner PC.

Never paste or save the `PLANNER_TOKEN` in this file, Git, screenshots, or chat.

## Procedure for each tablet

### 1. Confirm the PC server is reachable

On the planner PC:

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:3300/" -UseBasicParsing
```

Expected: HTTP 200.

If it fails: restart the live server with `tools\start-live-server.ps1`.

### 2. Connect the tablet by USB debug

```powershell
adb devices -l
```

Expected: one HTC AT01 device with status `device`.

If it shows `unauthorized`: unlock the tablet and allow USB debugging.

### 3. Apply the factory-floor settings, open, and pin

For the general landing page:

```powershell
cd "C:\Users\angusm\CLAUDE MASTER\anglo-planner"
.\tools\setup-factory-tablet.ps1
```

For a dedicated station tablet:

```powershell
.\tools\setup-factory-tablet.ps1 -Station 3
```

Station URLs:

| Tablet use | URL |
|---|---|
| Landing picker | `http://192.168.0.84:3300/` |
| Station 1 | `http://192.168.0.84:3300/station/1` |
| Station 2 | `http://192.168.0.84:3300/station/2` |
| Station 3 | `http://192.168.0.84:3300/station/3` |
| Station 4 | `http://192.168.0.84:3300/station/4` |
| Station 5 | `http://192.168.0.84:3300/station/5` |
| Station 6 | `http://192.168.0.84:3300/station/6` |
| Station 7 | `http://192.168.0.84:3300/station/7` |
| Station 8 | `http://192.168.0.84:3300/station/8` |

Expected:

- Tablet pings `192.168.0.84`.
- Chrome opens the Factory Terminal.
- Android reports `mLockTaskModeState=PINNED`.
- `stay_on_while_plugged_in=3`.
- `wifi_sleep_policy=2`.

### 4. Add a home-screen shortcut once

If the shortcut is missing on a new tablet:

1. Open the desired Factory Terminal URL in Chrome.
2. Tap Chrome menu: three dots.
3. Tap `Add to Home screen`.
4. Name it `Factory Terminal — Anglo Windows`.
5. Confirm it appears on the launcher.

This is the recovery button for staff if Chrome is closed or the tablet is
restarted.

## Field verification

Before sending a tablet back out:

- Open the page over Wi-Fi, not `adb reverse`.
- Confirm the screen shows `ONLINE`.
- Confirm the status line does not show a Sheet bridge warning.
- Search one known Biz Ref without saving a status.
- Leave the tablet plugged into power.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `This site can't be reached` on tablet | PC server stopped | Restart `tools\start-live-server.ps1` and reload |
| Tablet can ping PC but page times out | Node server not listening on port 3300 | Restart live server |
| Tablet cannot ping PC | Wi-Fi issue or wrong network | Reconnect tablet to factory Wi-Fi |
| All tablets fail at once | PC IP changed or server stopped | Check router DHCP reservation and live server |
| One tablet fails only | Tablet Wi-Fi/sleep/browser state | Re-run `tools\setup-factory-tablet.ps1` |
| Shortcut opens old/wrong IP | PC IP changed after shortcut creation | Reserve IP, then recreate shortcut |

## Router hardening

Reserve the planner PC's IP address on the router/DHCP server. Use
`192.168.0.84` unless there is a strong reason to change it.

Without this reservation, a future DHCP lease change will break every tablet
shortcut at once and look like an app fault.

## Current Tablet 1 baseline

Tablet 1 / HTC AT01:

- Serial: `FS44BPC01070`
- Field URL: `http://192.168.0.84:3300/`
- Home shortcut: `Factory Terminal — Anglo Windows`
- Verified settings:
  - `stay_on_while_plugged_in=3`
  - `wifi_sleep_policy=2`
  - `screen_off_timeout=2147483647`
- Field state: Chrome pinned to Factory Terminal landing page.
