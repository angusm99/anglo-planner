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

For a named, dashboard-only station tablet:

```powershell
.\tools\setup-factory-tablet.ps1 -Serial <ADB_SERIAL> -Station 8 -DeviceLabel "Station 8 - BEAD SAW" -WallpaperPath "C:\Users\angusm\CLAUDE MASTER\anglo-planner\design-export\assets\anglo-factory-wallpaper-from-tablet1.jpg" -CleanDashboardOnly
```

For the big charging identification cover page:

```powershell
.\tools\setup-factory-tablet.ps1 -Serial <ADB_SERIAL> -Station 5 -Cover
```

Cover URLs:

| Station | Cover URL |
|---|---|
| Station 4 | `http://192.168.0.84:3300/cover.html?station=4` |
| Station 5 | `http://192.168.0.84:3300/cover.html?station=5` |
| Station 6 | `http://192.168.0.84:3300/cover.html?station=6` |
| Station 8 | `http://192.168.0.84:3300/cover.html?station=8` |

The cover page is for identifying tablets while charging. It shows only the
station label and factory use, for example `STATION-5` / `SAW-2`; operator names
are deliberately not shown. `START NORMAL OPERATION` does not require a password
and opens the station screen. `ADMIN / NORMAL TABLET MODE` asks for the admin
password, then asks the local planner PC to unpin that station over authorized
ADB and send Android `HOME`. The live server must be restarted after deploying
the admin-home endpoint before this button can work. The admin password is not
documented here.

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

Current station tablet names:

| ADB serial | Android tablet name | Factory use |
|---|---|---|
| `FS44BPC01070` | `Station 4 - SAW 1` | Saw 1 |
| `FS44BPC01356` | `Station 8 - BEAD SAW` | Bead saw operator |
| `FS44BPC00401` | `Station 5 - SAW 2` | Saw 2 |
| `FS44BPC01500` | `Station 6 - ASSEMBLY` | Assembly |

Current tablet Wi-Fi observations from the planner PC. These are useful for IT
asset tracking, but the critical DHCP reservation is still the planner PC at
`192.168.0.84`; tablets browse to the PC, so their IPs are not part of the app
contract.

| Station | Current IP | Current Wi-Fi MAC observed | Notes |
|---|---:|---|---|
| Station 4 - SAW 1 | `192.168.0.160` | `D6-D2-A5-7D-B6-E0` | Verified by ADB IP readback and PC ARP on 2026-08-24. |
| Station 5 - SAW 2 | `192.168.0.167` | `7A-D7-05-6F-23-8C` | Verified by ADB IP readback and PC ARP on 2026-08-24. |
| Station 6 - ASSEMBLY | `192.168.0.176` | `3A-22-F8-62-D1-D4` | Verified by ADB IP readback and PC ARP on 2026-08-24. |
| Station 8 - BEAD SAW | `192.168.0.131` | `1A-AE-B9-77-7B-C1` | Verified by ADB IP readback and PC ARP on 2026-08-24. |

Expected:

- Tablet pings `192.168.0.84`.
- Chrome opens the Factory Terminal.
- Android reports `mLockTaskModeState=PINNED`.
- `adb_allowed_connection_time=0`.
- `adb_enabled=1`.
- `adb_wifi_enabled=1`.
- `development_settings_enabled=1`.
- `stay_on_while_plugged_in=3`.
- `wifi_sleep_policy=2`.
- `screen_off_timeout=2147483647`.
- `screensaver_enabled=0`.
- `accelerometer_rotation=0`.
- `user_rotation=0`.
- Optional dashboard-only cleanup disables weather, launcher/search tips, video,
  music, maps, mail/calendar/keep, Android Auto, and the OTA updater for the
  current Android user via reversible `pm disable-user --user 0`.

Avoid enabling risky/noisy developer options for floor testing: OEM unlocking,
mock locations, show taps, pointer location, strict mode, GPU debugging, and
`Don't keep activities` should stay off.

The wallpaper image is copied to `/sdcard/Pictures/anglo-factory-wallpaper.jpg`.
This HTC build does not expose a silent ADB wallpaper setter, so setting it as
the visible launcher wallpaper may still need one manual Android wallpaper
confirmation on each new tablet.

### 4. Add a home-screen shortcut once

If the shortcut is missing on a new tablet:

1. Open the desired cover URL in Chrome: `http://192.168.0.84:3300/cover.html?station=<N>`.
2. Tap Chrome menu: three dots.
3. Tap `Add to Home screen`.
4. Keep the station name Chrome suggests, for example `Station 5`.
5. Tap Chrome's `Add`, then Android launcher's `Add to home screen`.
6. Confirm the station-labelled shortcut appears on the launcher.

This is the recovery button for staff if Chrome is closed or the tablet is
restarted.

The station shortcuts must open the charging cover page directly:

| Shortcut label | Opens |
|---|---|
| `Station 4` | `http://192.168.0.84:3300/cover.html?station=4` |
| `Station 5` | `http://192.168.0.84:3300/cover.html?station=5` |
| `Station 6` | `http://192.168.0.84:3300/cover.html?station=6` |
| `Station 8` | `http://192.168.0.84:3300/cover.html?station=8` |

If Chrome's address bar is visible after using the shortcut, tap anywhere on
the cover once. The page requests fullscreen, then `Start Normal Operation`
opens the normal station dashboard without asking the operator for a password.
`Admin / Normal Tablet Mode` is the password-protected route back to Android
home.

The app now serves a web manifest and black/yellow `AW TERMINAL` icons, so
newly created Chrome home-screen shortcuts use the branded station shortcut
icon instead of Chrome's default blank page icon. Existing generic shortcuts
may need to be removed and recreated once for the new icon and station-specific
cover URL to appear.

## One-shot prompt for the next charging tablets

Use this prompt in a fresh Codex/local ADB task when Stations 5, 6, and the
next tablet are plugged in:

```text
Start in the shared Anglo protocol, then use only the canonical anglo-planner
repo at C:\Users\angusm\CLAUDE MASTER\anglo-planner.

Goal: one-shot the next factory tablets over USB ADB using the existing rollout
script. Do not change app business logic or Sheet bridge code.

1. Run adb devices -l and identify the newly connected HTC AT01 serials.
2. Verify http://127.0.0.1:3300/manifest.webmanifest returns HTTP 200 and the
   live server is still reachable.
3. For each new serial, run:
   .\tools\setup-factory-tablet.ps1 -Serial <SERIAL> -Station <N> -DeviceLabel "<LABEL>" -WallpaperPath "C:\Users\angusm\CLAUDE MASTER\anglo-planner\design-export\assets\anglo-factory-wallpaper-from-tablet1.jpg" -CleanDashboardOnly
4. Assign:
   - Station 5: label "Station 5 - SAW 2"
   - Station 6: label "Station 6 - ASSEMBLY"
5. Handle Chrome first-run prompts locally: continue without sync/notifications,
   reopen the station URL, tap LOCK FULLSCREEN, dismiss the Android fullscreen
   education panel if shown, and confirm mLockTaskModeState=PINNED.
6. Create or recreate the Chrome home-screen shortcut manually once per tablet
   so it receives the new AW TERMINAL manifest icon.
7. Take screenshots and report serial, station, label, disabled-package proof,
   wallpaper-file proof, and lock-task state.
```

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

Current reservation target:

| Item | Value |
|---|---|
| Planner PC adapter | `USB2.0 Ethernet Adapter` |
| Windows interface name | `Ethernet 2` |
| MAC address | `3C-AB-72-4A-CD-FF` |
| IP to reserve | `192.168.0.84` |
| Gateway/router discovered | `192.168.0.1` |

Read-only probe on 2026-08-21:

- `192.168.0.1:80` refused.
- `192.168.0.1:443` refused.
- `192.168.0.1:8080` was open, but did not expose a usable admin page through
  the command-line probe.

If using a router UI, look for one of these menu names:

- LAN
- DHCP Server
- Address Reservation
- Static Lease
- Reserved IP

Add the MAC/IP pair above, save/apply, then restart neither the app nor the
tablet unless the router asks for it.

If router access is not available, the fallback is to set a static IP on the
Windows adapter. Do not do that casually during live testing; it can interrupt
the app if the DNS/gateway settings are wrong.

## Parked next improvement

Do not implement during the current Tablet 1 field test. The next planned
feature is to add a length field to REDO materials, so the material needed for
redo records a length as well as issue/material description. This will likely
touch:

- `public/station.html`
- `src/redo.js`
- `src/server.js`
- `tools/standalone-tablet-bridge.gs`
- `ISSUE LOG` headers / payload contract
- REDO and bridge tests

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
