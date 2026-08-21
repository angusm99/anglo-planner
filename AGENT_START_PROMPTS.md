# Factory Terminal milestone prompts for new agent chats

Use these prompts when starting fresh Manus or Claude chats for this project.
They are intentionally blunt because this project has had parallel-build drift
before.

## Manus start prompt

```text
You are working on the canonical Anglo Windows Factory Terminal project only.

Current milestone: the working app is live-field-test ready. Tablet 1 / HTC AT01
has successfully updated the master Google Sheet through the app, REDO / REPICK
has been proven, and the tablet runs over factory Wi-Fi at:

http://192.168.0.84:3300/

Do not create a new Factory Terminal build, sandbox replacement, or parallel app.
The canonical local repository is:

C:\Users\angusm\CLAUDE MASTER\anglo-planner

GitHub:

https://github.com/angusm99/anglo-planner

Branch:

master

Before suggesting or changing anything, read:

1. C:\Users\angusm\CLAUDE MASTER\anglo-planner\README.md
2. C:\Users\angusm\CLAUDE MASTER\anglo-planner\TABLET_ROLLOUT.md
3. C:\Users\angusm\CLAUDE MASTER\anglo-planner\AGENT_START_PROMPTS.md
4. C:\Users\angusm\Documents\Obsidian Vault\ANGLO WINDOWS\ANGLO CORE\06 - Software and Systems\Material Planner Dashboard.md

The Google Sheet remains the master. SQLite is only a cache. Tablet updates must
write to the deployed Apps Script bridge first and only update the local cache
after Sheet confirmation.

Live bridge facts:

- Server is local on the planner PC at port 3300.
- Floor tablets use the LAN URL, not USB reverse:
  http://192.168.0.84:3300/
- Live startup is:
  C:\Users\angusm\CLAUDE MASTER\anglo-planner\tools\start-live-server.ps1
- Do not ask Angus to paste secrets in chat.
- Do not redeploy Apps Script unless explicitly asked.

Tablet rollout facts:

- Tablet 1 / HTC AT01 serial FS44BPC01070 is the golden baseline.
- Home shortcut: Factory Terminal — Anglo Windows.
- Repeat setup helper:
  C:\Users\angusm\CLAUDE MASTER\anglo-planner\tools\setup-factory-tablet.ps1
- Rollout runbook:
  C:\Users\angusm\CLAUDE MASTER\anglo-planner\TABLET_ROLLOUT.md

Known infrastructure risk:

- Reserve router DHCP for the planner PC:
  IP: 192.168.0.84
  MAC: 3C-AB-72-4A-CD-FF
  Adapter: USB2.0 Ethernet Adapter

Current field-test instruction:

Do not work on new features right now. Angus is testing Tablet 1 again. Limit
work to diagnostics, documentation, or tablet recovery unless he explicitly asks
for code changes.

Next improvement to park, not implement yet:

Add a length field to REDO materials. The material needed for REDO must include
a length option so the replacement metal/glass requirement is clearer.
```

## Claude Code start prompt

```text
Start in the shared Anglo protocol, then work only in the canonical Factory
Terminal repo.

Canonical vault:

C:\Users\angusm\Documents\Obsidian Vault

Canonical repo:

C:\Users\angusm\CLAUDE MASTER\anglo-planner

GitHub:

https://github.com/angusm99/anglo-planner

Branch:

master

Read in order:

1. C:\Users\angusm\Documents\Obsidian Vault\Systems & Processes\SESSION_START.md
2. C:\Users\angusm\CLAUDE MASTER\anglo-planner\README.md
3. C:\Users\angusm\CLAUDE MASTER\anglo-planner\TABLET_ROLLOUT.md
4. C:\Users\angusm\CLAUDE MASTER\anglo-planner\AGENT_START_PROMPTS.md
5. C:\Users\angusm\Documents\Obsidian Vault\ANGLO WINDOWS\ANGLO CORE\06 - Software and Systems\Material Planner Dashboard.md
6. Last ~20 lines of:
   C:\Users\angusm\Documents\Obsidian Vault\Systems & Processes\AGENT_CHANNEL.jsonl

Milestone state:

- One working path now: anglo-planner is canonical.
- The old Manus build is retired as an implementation target.
- The live app is in field test with Tablet 1.
- Google Sheet remains the source of truth.
- Factory staff update the master Google Sheet from tablets.
- Tablet updates must be Sheet-confirmed before the local cache changes.
- Tests currently pass at 55/55 after the REDO / REPICK work.

Live tablet facts:

- Tablet 1: HTC AT01, serial FS44BPC01070.
- Tablet URL: http://192.168.0.84:3300/
- Shortcut: Factory Terminal — Anglo Windows.
- Tablet is hardened with stay-awake while powered, Wi-Fi sleep disabled,
  max screen timeout, and Android lock task pinned.
- Repeatable setup helper:
  C:\Users\angusm\CLAUDE MASTER\anglo-planner\tools\setup-factory-tablet.ps1

Router/DHCP target:

- Reserve 192.168.0.84 for the planner PC USB2.0 Ethernet Adapter.
- MAC address: 3C-AB-72-4A-CD-FF.
- Gateway discovered: 192.168.0.1.
- Router admin was not reachable on 80/443; port 8080 is open but needs manual
  admin access or further controlled investigation.

Do not expose or request secrets in chat. Angus enters the PLANNER_TOKEN locally
into PowerShell when running tools/start-live-server.ps1.

Do not work on the next feature during Tablet 1 testing unless Angus explicitly
authorises it. Park this next improvement:

REDO material details need a length field / length option. The material needed
for REDO should record length, probably in both the tablet issue form and the
ISSUE LOG payload/header contract, but this requires a deliberate Sheet bridge
change and live-test plan.
```

