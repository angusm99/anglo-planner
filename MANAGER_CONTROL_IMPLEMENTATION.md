# Factory Manager Control Terminal v1

## Delivered Routes

| Route | Method | Purpose | Write Capability |
|---|---|---|---|
| `/manager` | GET | Factory Manager Operations Command Centre | None |
| `/control` | GET | Alias for the same manager page | None |
| `/api/manager-summary` | GET | Aggregated jobs, confirmed events, issues, stations and horizon data | None |

## Changed Files

| File | Change |
|---|---|
| `src/managerSummary.js` | New read-only classification and SQLite summary module |
| `src/server.js` | Added one module import, one GET endpoint and two static aliases only |
| `public/manager.html` | New manager dashboard with Today, Flow, Attention and Activity views |
| `public/manager.css` | New manager-only responsive Anglo Windows visual system |
| `tests/manager-summary.test.js` | New in-memory tests for data rules, thresholds and Station 8 |
| `todo.md` | Build checklist and safety record for this change |
| `MANAGER_CONTROL_IMPLEMENTATION.md` | This handoff and verification record |

## Safety Boundary

This implementation is isolated from the live production write flow. The existing operator page, Google Apps Script bridge, Sheet writeback helper, `/api/update`, REDO routes, and tablet administration routes remain unchanged. The new manager endpoint is a read-only `GET` route over the local SQLite cache.

The local preview was started with `SHEET_WEBAPP_URL` and `SHEET_TOKEN` explicitly unset. No Google Sheet request or write was made during implementation or verification.

The uploaded `public/station.html` and `tools/standalone-tablet-bridge.gs` were compared byte-for-byte with the working copies and are unchanged. The only `src/server.js` changes are the new read-only import, GET endpoint and static route aliases. The `/api/update` implementation and its Sheet-confirmation-before-cache contract are unchanged.

## Manager Data Rules

| Dashboard Concept | Canonical Source and Rule |
|---|---|
| Active jobs | Active jobs with an install date inside the selected 45-day window and `job_status` not equal to `DONE` |
| Confirmed activity | `events.created_at` where source is `station-N` or `redo-station-N`; `jobs.updated_at` is never used for operator freshness |
| Amber freshness | More than 90 minutes since the last confirmed event |
| Red freshness | More than four hours since the last confirmed event |
| No-event attention | Active jobs with no confirmed station event are explicitly surfaced |
| Blockers | Status values containing `SHORT` or `DEFECT`, plus `ORDER DUE`, `NOT PICKED`, `REDO*`, `REPICK*`, `RC-X` and `CHANGES` |
| Ready | `ALL READY`, `DELIVERED` or a `READY*` job-status value |
| Complete | `DONE` in `job_status`; partial combinations remain incomplete |
| Open issues | `issues.repick_done = 0` |
| Station 8 | Uses `job_status`, resolved through `STATIONS[8]`; no `s8` field is introduced |
| Job identity | SQLite `jobs.id` internally; Bizman reference or task number for display only |

## Test Result

The complete canonical suite passes **65 of 65 tests**. The six new manager tests cover blocker vocabulary, ready versus partial status semantics, freshness thresholds, install horizons, event source parsing, read-only contract output, open issues, and Station 8 mapping.

## Initial Visual Verification

The `/manager` page was loaded from an isolated local server. At a measured browser viewport of 1280 pixels wide, the document reported no horizontal overflow. The route, summary endpoint, and existing `/station/4` route all returned HTTP 200.

The 1280 × 800 landscape capture showed the header, six operational KPIs, all eight station-load tiles, the priority-jobs area, freshness summary, installation horizon, and the beginning of the intentionally unwired manager-instructions panel within the first screen. The 800 × 1280 portrait capture stacked the interface cleanly, changed the side rail into a top navigation bar, retained readable typography, and showed no visible clipping.

The Flow and Attention navigation controls were exercised in the isolated browser. Both views rendered immediately from the same read-only summary payload. The Flow view showed station load and last-activity information; the Attention view showed only the priority-job surface. Neither view exposed an enabled write control or called a write route.

After the final metric refinement, the manager page was reloaded against the restarted **sandbox-only** preview with Sheet integration still disabled. The refined `attentionJobs` metric rendered correctly, and the browser console contained no errors.

## Intentionally Unwired

The Manager Queue / Instructions panel is a read-only placeholder. It does not create urgent flags, queue jobs, send station messages, acknowledge instructions, or complete instructions. Its proposed contract uses `jobs.id` as `job_id` and numeric `target_station` values resolved through the canonical `STATIONS` object.

No new SQLite table or migration was added for manager instructions, because live instruction writes are outside this pass. The page exposes disabled controls only so the future interaction has a deliberate place in the information architecture.

## Before Local Deployment

The files in this package have not been committed, published or copied to the planner PC. When Angus approves a controlled local test, the canonical working tree should be backed up or committed, the changed files copied into `C:\Users\angusm\CLAUDE MASTER\anglo-planner`, and `npm test` run locally. The live Node process will need a planned restart before `/manager` and `/api/manager-summary` can become available; that restart was intentionally not performed by this task.
