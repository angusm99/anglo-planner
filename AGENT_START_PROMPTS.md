# Factory Terminal agent pickup prompts

Use this file when starting fresh Manus or Claude Code chats for the Anglo
Windows Factory Terminal / Material Planner tablet project.

This is a milestone handoff. Tablet 1 is in live field testing. Keep the app
stable unless Angus explicitly asks for changes.

## Current milestone

- Canonical repo: `C:\Users\angusm\CLAUDE MASTER\anglo-planner`
- GitHub: `https://github.com/angusm99/anglo-planner`
- Branch: `master`
- Latest pushed app commit at this handoff: `539a4495125409de422edc4588e2c54398f75c2b`
- Live tablet URL: `http://192.168.0.84:3300/`
- Tablet Station 4 / Saw 1: HTC AT01, serial `FS44BPC01070`
- Tablet Station 8 / Bead Saw: HTC AT01, serial `FS44BPC01356`
- Shortcut on Tablet 1: `Factory Terminal - Anglo Windows`
- Current tablet labels: `Station 4 - SAW 1`, `Station 8 - BEAD SAW`
- Next charging tablets for this rollout: `Station 5 - SAW 2` and
  `Station 6 - ASSEMBLY`

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

## Pending operational action

A hardening fix was pushed in commit `539a449` so transient Google HTML/empty
responses do not knock a previously READY REDO bridge back to NOT READY. It
will only affect the live tablet after the local server is restarted.

Angus plans to restart at lunchtime when the operator takes a break:

```powershell
cd "C:\Users\angusm\CLAUDE MASTER\anglo-planner"
.\tools\start-live-server.ps1 -WebAppUrl "https://script.google.com/macros/s/AKfycbxpSODFH2FRTYETSmHsOl185USvyqtAuez5EIfFcOAM5JjSa7x7aa5S-rcGw5LTfFyyBg/exec"
```

Angus enters `PLANNER_TOKEN` locally. Do not ask him to paste secrets in chat.

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

Latest pushed commit at handoff:

539a4495125409de422edc4588e2c54398f75c2b

Read these before advising or changing anything:

1. C:\Users\angusm\CLAUDE MASTER\anglo-planner\README.md
2. C:\Users\angusm\CLAUDE MASTER\anglo-planner\TABLET_ROLLOUT.md
3. C:\Users\angusm\CLAUDE MASTER\anglo-planner\AGENT_START_PROMPTS.md
4. C:\Users\angusm\Documents\Obsidian Vault\ANGLO WINDOWS\ANGLO CORE\06 - Software and Systems\Material Planner Dashboard.md

Milestone state:

- Tablet 1 / HTC AT01 serial FS44BPC01070 is the working field-test baseline.
- Station 8 / HTC AT01 serial FS44BPC01356 has been set up for the bead saw
  operator.
- The tablet uses factory Wi-Fi at http://192.168.0.84:3300/.
- The Google Sheet remains master.
- Tablet writes must be confirmed by the Apps Script Sheet bridge before the local cache changes.
- Normal station updates are the current field-test workflow.
- REDO / REPICK is proven but not being used right now.
- Do not work on the REDO material length field unless Angus explicitly asks.

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

Latest pushed commit at handoff:

539a4495125409de422edc4588e2c54398f75c2b

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
- Tablet 1 is live in field testing.
- Google Sheet is the source of truth.
- Tablets write to the Sheet bridge first; cache updates only after confirmation.
- Tests passed 55/55 after commit 539a449.

Current field-test boundary:

- Normal station status updates are the active workflow.
- REDO / REPICK is proven but not in active use right now.
- Do not change REDO during Tablet 1 testing unless Angus explicitly authorises it.
- Parked next improvement: add REDO material length field/option, including tablet form, server validation, Apps Script bridge, ISSUE LOG headers/payload, and tests.

Live facts:

- Tablet 1: HTC AT01, serial FS44BPC01070.
- Station 8 tablet: HTC AT01, serial FS44BPC01356.
- Tablet cover URLs: http://192.168.0.84:3300/cover.html?station=4, station=5, station=6, and station=8.
- Home shortcuts: station-labelled Chrome shortcuts (`Station 4`, `Station 5`, `Station 6`, `Station 8`) that open the matching cover page.
- Rollout helper: C:\Users\angusm\CLAUDE MASTER\anglo-planner\tools\setup-factory-tablet.ps1
- Runbook: C:\Users\angusm\CLAUDE MASTER\anglo-planner\TABLET_ROLLOUT.md

Pending operation:

Commit 539a449 is pushed but the running PowerShell server may still need a lunchtime restart with tools/start-live-server.ps1 before Tablet 1 sees that hardening patch.

Router/DHCP target:

- Reserve 192.168.0.84 for MAC 3C-AB-72-4A-CD-FF.
- Adapter: USB2.0 Ethernet Adapter / Ethernet 2.
- Gateway discovered: 192.168.0.1.
- IT may need to create this reservation; no internet port forwarding is required.

Do not expose secrets. Angus enters PLANNER_TOKEN locally.
```
