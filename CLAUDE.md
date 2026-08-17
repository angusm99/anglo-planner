# anglo-planner

Anglo Windows production floor planner — station tablets + live W.I.P dashboard. **This is the sole Factory Terminal build** (see [[project_anglo_planner_app]] for cross-session history). A parallel Manus-hosted build existed Mar–Jul 2026 and was retired 2026-07-23 — do not let a new one start under any name; if asked to build "the factory terminal," this repo is it.

Business/company context lives in the vault, not here: `C:\Users\angusm\Documents\Obsidian Vault\ANGLO WINDOWS\ANGLO CORE\README.md`

## Structure
```
src/            server.js (entry point) + app logic
tools/          import.js — data import scripts
tests/          node --test suite
public/         static frontend
data/           local data store
design-export/  UI export snapshots
```

## Commands
```
npm start    # node src/server.js
npm run import
npm test     # node --test tests/*.test.js
```

## Notes
- Two-way sync with the Google Sheet planner (id `111LJiZGBg8_HaT3ruWWx9RmY_UTheTUzFFYcCOj0Umw`) — see [[project_anglo_planner_suite]].
- The Google Apps Script side of this system lives separately in `PROJECTS\Anglo-Windows-Sheets-Suite` — **live GAS ≠ that local archive**, can drift either direction. Fingerprint the live script before deploying changes from here.
- **Before concluding "no newer work exists" on this project:** this repo having no new commits is not the whole picture. The Google Sheet is shared infrastructure — grep `Systems & Processes\AGENT_CHANNEL.jsonl` for `planner`/`factory`/`sheet`, and check `PROJECTS\Anglo-Windows-Sheets-Suite\CLAUDE.md`, before reporting the project quiet. Missed a week of relevant GAS work this way on 2026-08-17 (WIP TV fork, Bizman-ref row-integrity fix) — see the Material Planner Dashboard vault note for what that turned up.
