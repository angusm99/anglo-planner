# Factory Terminal agent pickup prompts

Use this file when starting fresh Manus or Claude Code chats for the Anglo
Windows Factory Terminal / Material Planner tablet project.

This is the current working-version handoff after the 2026-08-26 four-tablet
floor deployment. Keep the live app stable unless Angus explicitly asks for
changes.

## Current milestone

- Canonical repo: `C:\Users\angusm\CLAUDE MASTER\anglo-planner`
- GitHub: `https://github.com/angusm99/anglo-planner`
- Branch: `master`
- Live-tested runtime baseline: `1c00aba` (`Bound Sheet bridge request time`)
- Before changing anything, run `git log -1 --oneline` and confirm the checkout
  matches `origin/master`; the handoff and rollout safeguards were added after
  the runtime baseline
- Live tablet URL: `http://192.168.0.84:3300/`
- Station 4 / Saw 1: HTC AT01, serial `FS44BPC01070`
- Station 5 / Saw 2: HTC AT01, serial `FS44BPC00401`
- Station 6 / Assembly: HTC AT01, serial `FS44BPC01500`
- Station 8 / Bead Saw: HTC AT01, serial `FS44BPC01356`
- Factory Manager Control: HTC AT01, serial `FS44BPC01077`, parked on the
  landing page pending a future manager dashboard
- All four station tablets have branded station shortcuts, charging covers,
  portrait lock, stay-awake settings, and pinned Chrome operation

The Google Sheet is the master. The tablets are only a clean factory-floor
interface for writing back to that Sheet. SQLite is a local cache, not the
source of truth.

## Current field-test boundary

Angus is field-testing normal station updates from Tablet 1. REDO / REPICK has
been proven, but it is not being used as the active workflow right now.

Do not implement the next REDO improvement during this field test unless Angus
explicitly asks. The parked improvement is:

Add a length field/option to REDO material details. This will need a deliberate
Sheet bridge and ISSUE LOG contract change, plus tests and a controlled live
test.

## Current operational state

The live server was restarted on 2026-08-26 and is running commit `1c00aba`.
Google Sheet GET, redirect, and writeback requests now time out after 15 seconds
instead of accumulating indefinitely and eventually freezing the local server.
The stalled-endpoint regression test passes and the full suite is `56/56`.

The PowerShell server window must remain open. Restart only during an approved
operator break:

```powershell
cd "C:\Users\angusm\CLAUDE MASTER\anglo-planner"
.\tools\start-live-server.ps1 -WebAppUrl "https://script.google.com/macros/s/AKfycbxpSODFH2FRTYETSmHsOl185USvyqtAuez5EIfFcOAM5JjSa7x7aa5S-rcGw5LTfFyyBg/exec"
```

Angus enters `PLANNER_TOKEN` locally. Do not ask him to paste secrets in chat.

Package boundary verified on 2026-08-26: Chrome, WebView, Play Services,
Services Framework, and the launcher are enabled on all four station tablets.
Photos may be disabled during normal operation but must be enabled before
wallpaper changes. Play Store may be disabled during floor use, but it must be
temporarily enabled for planned Chrome/WebView update maintenance.

## Manus start prompt

```text
You are working on the canonical Anglo Windows Factory Terminal repository only.

Do not create a new build, sandbox replacement, parallel Factory Terminal app,
or standalone redesign. The current working path is:

C:\Users\angusm\CLAUDE MASTER\anglo-planner

GitHub:

https://github.com/angusm99/anglo-planner

Branch:

master

Live-tested runtime baseline:

1c00aba

Before changing anything, verify the current origin/master HEAD with git log.

Read these before advising or changing anything:

1. C:\Users\angusm\CLAUDE MASTER\anglo-planner\README.md
2. C:\Users\angusm\CLAUDE MASTER\anglo-planner\TABLET_ROLLOUT.md
3. C:\Users\angusm\CLAUDE MASTER\anglo-planner\AGENT_START_PROMPTS.md
4. C:\Users\angusm\Documents\Obsidian Vault\ANGLO WINDOWS\ANGLO CORE\06 - Software and Systems\Material Planner Dashboard.md

Milestone state:

- Stations 4, 5, 6, and 8 are provisioned and deployed for floor testing.
- The tablets use factory Wi-Fi at http://192.168.0.84:3300/.
- The Google Sheet remains master.
- Tablet writes must be confirmed by the Apps Script Sheet bridge before the local cache changes.
- Normal station updates are the current field-test workflow.
- REDO / REPICK is proven but not being used right now.
- Do not work on the REDO material length field unless Angus explicitly asks.
- Commit 1c00aba bounds every Sheet bridge request to 15 seconds so a stalled
  Google response cannot indefinitely consume local server connections.

Live server startup:

C:\Users\angusm\CLAUDE MASTER\anglo-planner\tools\start-live-server.ps1

Do not request, print, store, or repeat PLANNER_TOKEN. Angus enters it locally.

Known infrastructure risk:

Reserve planner PC IP 192.168.0.84 for MAC 3C-AB-72-4A-CD-FF on the USB2.0 Ethernet Adapter. Until IT/router reservation is done, all tablets depend on that IP staying stable.

If Angus asks you to open the tablet, remember Manus cannot directly reach his USB-connected HTC tablet or his local server from a sandbox. Tell him to use Codex/local ADB or give file patches only.
```

## Claude Code start prompt

```text
Start in the shared Anglo protocol, then work only in the canonical Factory Terminal repo.

Canonical vault:

C:\Users\angusm\Documents\Obsidian Vault

Canonical repo:

C:\Users\angusm\CLAUDE MASTER\anglo-planner

GitHub:

https://github.com/angusm99/anglo-planner

Branch:

master

Live-tested runtime baseline:

1c00aba

Before changing anything, verify the current origin/master HEAD with git log.

Read in order:

1. C:\Users\angusm\Documents\Obsidian Vault\Systems & Processes\SESSION_START.md
2. C:\Users\angusm\CLAUDE MASTER\anglo-planner\README.md
3. C:\Users\angusm\CLAUDE MASTER\anglo-planner\TABLET_ROLLOUT.md
4. C:\Users\angusm\CLAUDE MASTER\anglo-planner\AGENT_START_PROMPTS.md
5. C:\Users\angusm\Documents\Obsidian Vault\ANGLO WINDOWS\ANGLO CORE\06 - Software and Systems\Material Planner Dashboard.md
6. Last ~20 lines of:
   C:\Users\angusm\Documents\Obsidian Vault\Systems & Processes\AGENT_CHANNEL.jsonl

Current working path:

- One canonical app only: anglo-planner.
- The old Manus build is retired as an implementation target.
- Stations 4, 5, 6, and 8 are live in floor testing.
- Google Sheet is the source of truth.
- Tablets write to the Sheet bridge first; cache updates only after confirmation.
- Tests passed 56/56 after commit 1c00aba.

Current field-test boundary:

- Normal station status updates are the active workflow.
- REDO / REPICK is proven but not in active use right now.
- Do not change REDO during Tablet 1 testing unless Angus explicitly authorises it.
- Parked next improvement: add REDO material length field/option, including tablet form, server validation, Apps Script bridge, ISSUE LOG headers/payload, and tests.

Live facts:

- Station 4 / Saw 1: FS44BPC01070.
- Station 5 / Saw 2: FS44BPC00401.
- Station 6 / Assembly: FS44BPC01500.
- Station 8 / Bead Saw: FS44BPC01356.
- Factory Manager Control: FS44BPC01077, landing page only for now.
- Tablet cover URLs: http://192.168.0.84:3300/cover.html?station=4, station=5, station=6, and station=8.
- Home shortcuts: station-labelled Chrome shortcuts (`Station 4`, `Station 5`, `Station 6`, `Station 8`) that open the matching cover page.
- Rollout helper: C:\Users\angusm\CLAUDE MASTER\anglo-planner\tools\setup-factory-tablet.ps1
- Runbook: C:\Users\angusm\CLAUDE MASTER\anglo-planner\TABLET_ROLLOUT.md

Current runtime and package boundary:

- Commit 1c00aba is pushed and the live server was restarted on it on 2026-08-26.
- Sheet bridge requests have a 15-second timeout; preserve last-known REDO readiness on transient Google HTML/empty responses.
- Chrome, WebView, Play Services, Services Framework, and launcher must remain enabled.
- Photos is optional for runtime but required before changing wallpaper.
- Play Store is optional for runtime but must be temporarily enabled for planned Chrome/WebView updates.
- Do not change live tablet packages while operators are using the terminals.

Router/DHCP target:

- Reserve 192.168.0.84 for MAC 3C-AB-72-4A-CD-FF.
- Adapter: USB2.0 Ethernet Adapter / Ethernet 2.
- Gateway discovered: 192.168.0.1.
- IT may need to create this reservation; no internet port forwarding is required.

Do not expose secrets. Angus enters PLANNER_TOKEN locally.
```
