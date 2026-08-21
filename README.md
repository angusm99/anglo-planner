# Anglo Windows production planner — Factory Terminal

**This is the one and only Factory Terminal build.** If you are an AI session
(Manus included) picking this up without prior context: this repo is
canonical, do not start a parallel build under any name. Run `git log
--oneline -10` before proposing changes — it is more current than any doc.
Background/decisions live in the Obsidian vault note "Material Planner
Dashboard" (`ANGLO WINDOWS/ANGLO CORE/06 - Software and Systems/`), but if you
don't have access to that vault, this README plus the code is enough to work
from — don't reconstruct the app from memory of an earlier chat session.

Factory-floor planner app: station tablets + live W.I.P dashboard, replacing
direct factory-floor edits to the Google Sheets planner. The Google Sheet
remains the system of record. Zero npm
dependencies — plain Node (v22+) with the built-in SQLite module.

## Run

```
node src/server.js
```

- Home / station picker: http://localhost:3300/
- Station screens: http://localhost:3300/station/1 … /station/8
- Live dashboard: http://localhost:3300/dashboard (add `?days=N` to widen/narrow
  the install-date lookback, default 45)
- Legacy office admin: http://localhost:3300/office — retained in the codebase,
  but deliberately not linked from the factory landing page or included in the
  current rollout scope.

Each tablet on the floor gets pinned (kiosk mode) to its own station URL.
For repeatable setup of Tablet 1 through Tablet 5, use
`TABLET_ROLLOUT.md` and `tools/setup-factory-tablet.ps1`.

Theme: dark (black/Anglo yellow) by default; the Light/Dark button in the header
toggles per device and is remembered in localStorage.

Dashboard interactions:
- Hover a station dot → tooltip with station name + current status.
- Click a station dot → opens that station's screen.
- Click the "Shorts / changes" card → jumps to the first flagged job and cycles
  through the rest on each click (highlighted with a yellow flash).

## Design files

`design-export/anglo-dashboard.html` and `design-export/anglo-station.html` are
fully self-contained single-file versions (inline CSS, static sample data, both
themes via the toggle) for importing into Open Design, Google Stitch, Figma
import tools, or just opening in a browser. No server needed.

## Import data from the spreadsheet export (legacy / offline fallback)

Superseded by the live sheet sync above — only needed if the web app isn't
deployed or you want a bulk load from an offline xlsx:

```
python tools/export_xlsx.py "C:\path\to\planner_source.xlsx"
node tools/import.js
```

Reads all monthly tabs (e.g. `MAY-2026`) plus `JOBS IN QUEUE`, dedupes by task
no (monthly tabs win over the queue, later months win), and **replaces all
sheet-imported jobs**. Jobs added in the office app survive a re-import.

## How it works

| Piece | File | Notes |
|---|---|---|
| Cascade engine | `src/cascade.js` | Line-for-line port of the sheet's "MATERIAL PLANNER CORE SCRIPT v7" `applyCascadeLogic_`, incl. the combined job-status guard logic. Station button sets live here too. |
| API + SSE server | `src/server.js` | REST endpoints + `GET /api/stream` server-sent events; dashboard updates the moment any station posts. |
| Database | `src/db.js` → `data/planner.db` | Local cache only. `jobs` mirrors planner columns; `events` audits changes; `issues` tracks numbered REDO cycles. |
| Station UI | `public/station.html` | Ref/QR lookup → operator confirmation → only that station's approved status buttons. Updates are disabled when the Sheet bridge is unavailable. |
| Dashboard UI | `public/dashboard.html` | Due-date sorted active jobs, 8 station dots per job, counters, shorts alert. |
| REDO rules | `src/redo.js` | Validates issue reports and produces numbered `REPICKn` / `REDONEn` transitions. |
| Office UI | `public/office.html` | Legacy utility retained but not exposed on the factory landing page. |

Tests: `npm test` (55 cascade, QR, Sheet-payload, REDO, station-workflow and bridge-contract checks).

## Sheet sync (sheet stays master)

Two-way, via one GAS web app on the sheet (`tools/standalone-tablet-bridge.gs`):

- **Confirmed writeback** — every station tap (plus its cascade) is written to
  the Sheet first. The tablet reports success and updates the local cache only
  after Apps Script returns `{ "ok": true }`. If the bridge is unavailable,
  status buttons are disabled and the API changes nothing.
- **Live read** — lookups that miss the local cache query the sheet directly,
  so a job added to the sheet five minutes ago is findable on the floor with
  no import step. The full cache also re-pulls from the sheet every 10 minutes
  (keeps the dashboard fresh). SQLite is just a cache; the sheet is master.

Off by default — set two env vars to enable:

```
SHEET_WEBAPP_URL = <the /exec URL of the deployed web app>
SHEET_TOKEN      = <shared secret, same as the sheet's PLANNER_TOKEN>
```

The older `tools/sheet-writeback.gs` is retained for reference, but the current
go-live bridge is `tools/standalone-tablet-bridge.gs` because it also supports
REDO, `ISSUE LOG`, and numbered `REPICKn` / `REDONEn`. Deploy the endpoint once:
paste it into the sheet's Apps Script project and publish it as a Web App (full
steps in that file). It runs as you, so it can write protected ranges; the
planner posts to it with Node's built-in `https` — no extra dependency. Column
mapping matches `tools/export_xlsx.py` (A = task no, O–U = stations 1–7, V =
job status).

Office edits are **not** pushed (office-only jobs have no Sheet row).

### REDO / REPICK workflow

`tools/standalone-tablet-bridge.gs` is the reviewed v2 replacement bridge. It
adds the exact nine-column `ISSUE LOG`, idempotent issue submission, numbered
`REPICKn` / `REDONEn`, plus a named optional `handleIssueLogEdit` trigger. The
normal completion path is now the deliberate **Confirm REPICK complete** action
on the Station 3 tablet; it writes `REDONEn` through the confirmed Sheet bridge
and marks the matching ISSUE LOG checkbox. The trigger is retained only as an
optional spreadsheet-side fallback. It does **not** define another `onEdit`, so
it cannot replace or conflict with the planner's existing `plannerCore.gs`
trigger.

`ISSUE LOG` is initialised automatically: the bridge creates the tab and writes
the exact nine headers on first REDO transfer if the tab is missing or row 1 is
empty. For a cleaner go-live first pass, call the deployed web app with
`?token=<PLANNER_TOKEN>&setup=1`; this checks/creates the headers without adding
an issue row. If row 1 already contains different headers, it fails loudly with
`ISSUE LOG headers do not match bridge v2`.

REDO remains visibly locked until the deployed bridge advertises both
`issue_log` and `repick_done` capabilities. To activate it, replace the
standalone bridge code and deploy a new web-app version. Run
`installIssueLogTrigger()` only if the ISSUE LOG checkbox should also work as a
manual fallback. Do not replace `plannerCore.gs`.

## Phase 2

Done:
- Office/admin view: add jobs, edit install dates, send-to-dash, job-status overrides
- Confirmed Station → Sheet writeback (Sheet stays master)
- Cover-sheet QR scanning and Station 8 Bead Saw
- Live Station 3 `REPICKn` → `REDONEn` proof through the Sheet bridge
- Reviewed REDO UI, rules and v2 bridge package

Still to build:
- Cover-sheet QR printing workflow
- Calendar checker sync port; lead-time reports from the events table
- Simple PIN per station / user accounts before factory rollout
