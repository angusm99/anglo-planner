# Anglo Windows production planner — Factory Terminal

**This is the one and only Factory Terminal build.** If you are an AI session
(Manus included) picking this up without prior context: this repo is
canonical, do not start a parallel build under any name. Run `git log
--oneline -10` before proposing changes — it is more current than any doc.
Background/decisions live in the Obsidian vault note "Material Planner
Dashboard" (`ANGLO WINDOWS/ANGLO CORE/06 - Software and Systems/`), but if you
don't have access to that vault, this README plus the code is enough to work
from — don't reconstruct the app from memory of an earlier chat session.

Factory-floor planner app: station tablets + live W.I.P dashboard + office
admin, replacing direct edits to the Google Sheets planner. Zero npm
dependencies — plain Node (v22+) with the built-in SQLite module.

## Run

```
node src/server.js
```

- Home / station picker: http://localhost:3300/
- Station screens: http://localhost:3300/station/1 … /station/8
- Live dashboard: http://localhost:3300/dashboard (add `?days=N` to widen/narrow
  the install-date lookback, default 45)
- Office admin: http://localhost:3300/office — add jobs, set install dates
  (inline date picker per row), override job status, archive/restore. Undated
  queue jobs sort first so they get dates. Every change lands in the events
  audit log.

Each tablet on the floor gets pinned (kiosk mode) to its own station URL.

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
| Database | `src/db.js` → `data/planner.db` | `jobs` table mirrors the planner columns; `events` is the audit log (every change: field, old → new, who, which station, when). |
| Station UI | `public/station.html` | Ref lookup (type or USB/QR scanner acting as keyboard) → one job → only that station's valid status buttons. |
| Dashboard UI | `public/dashboard.html` | Due-date sorted active jobs, 7 station dots per job, counters, shorts alert. |
| Office UI | `public/office.html` | Search (ref / task no / customer), add jobs, inline install-date edits, job-status override with suggestions, archive/restore, per-job change history. |

Tests: `npm test` (cascade scenarios, 14 cases).

## Sheet sync (sheet stays master)

Two-way, via one GAS web app on the sheet (`tools/sheet-writeback.gs`):

- **Writeback** — every station tap (plus its cascade) is written straight
  into the sheet's station columns.
- **Live read** — lookups that miss the local cache query the sheet directly,
  so a job added to the sheet five minutes ago is findable on the floor with
  no import step. The full cache also re-pulls from the sheet every 10 minutes
  (keeps the dashboard fresh). SQLite is just a cache; the sheet is master.

Off by default — set two env vars to enable:

```
SHEET_WEBAPP_URL = <the /exec URL of the deployed web app>
SHEET_TOKEN      = <shared secret, same as the sheet's PLANNER_TOKEN>
```

Deploy the endpoint once: paste `tools/sheet-writeback.gs` into the sheet's
Apps Script project and publish it as a Web App (full steps in that file). It
runs as you, so it can write protected ranges; the planner posts to it with
Node's built-in `https` — no extra dependency. Column mapping matches
`tools/export_xlsx.py` (A = task no, O–U = stations 1–7, V = job status).

Office edits are **not** pushed (office-only jobs have no sheet row). If you want
office install-date/status edits to push too, call `pushStationUpdate` from
`editJob` the same way `updateStation` does.

## Phase 2

Done:
- Office/admin view: add jobs, edit install dates, send-to-dash, job-status overrides
- Station → sheet writeback (above)

Still to build:
- Cover-sheet printing with QR codes; camera scanning on tablets
- Calendar checker sync port; lead-time reports from the events table
- Simple PIN per station / user accounts before factory rollout
