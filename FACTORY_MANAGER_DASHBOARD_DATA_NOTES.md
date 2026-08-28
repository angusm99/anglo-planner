# Factory Manager Dashboard Data Notes

Date: 2026-08-26
Purpose: explain how to read confirmed factory tablet entries for a manager/control dashboard without disturbing live floor tablets.

## Summary

Use the local SQLite `events` table as the authoritative local activity trail for confirmed operator taps.

Do not use `jobs.updated_at` by itself to detect operator activity. The `jobs` table is also refreshed from the Google Sheet/cache, so many rows can receive the same `updated_at` during a sync even when no operator touched those jobs.

Confirmed tablet writes are logged in:

```text
C:\Users\angusm\CLAUDE MASTER\anglo-planner\data\planner.db
table: events
```

Each confirmed station update writes one or more rows to `events` from `src/server.js` via `writeJobChanges()`.

## Relevant Tables

`events`

```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs (id),
  field TEXT NOT NULL,
  old_value TEXT DEFAULT '',
  new_value TEXT DEFAULT '',
  actor TEXT DEFAULT '',
  source TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
```

`jobs`

Use `jobs` only to enrich event rows with Biz Ref, customer, task number, and current status fields.

Important columns:

- `id`
- `biz_ref`
- `customer`
- `task_no`
- `s1` through `s7`
- `job_status`
- `updated_at`

`issues`

REDO / REPICK issue records live in `issues`. For the normal floor workflow Angus is currently testing, there may be no `issues` rows.

## Source Values

Normal station updates use source names like:

```text
station-4
station-5
station-6
station-8
```

REDO/REPICK paths use:

```text
redo-station-4
redo-station-5
```

Station 8 Bead Saw writes to `job_status`, not `s8`, because Bead Saw uses the existing Sheet job-status field.

## Read-Only Node Query

Run from PowerShell:

```powershell
Set-Location -LiteralPath "C:\Users\angusm\CLAUDE MASTER\anglo-planner"

@'
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("data/planner.db", { readOnly: true });

const rows = db.prepare(`
  SELECT
    e.id,
    e.created_at,
    e.source,
    e.actor,
    e.field,
    e.old_value,
    e.new_value,
    j.biz_ref,
    j.customer,
    j.task_no
  FROM events e
  LEFT JOIN jobs j ON j.id = e.job_id
  WHERE e.source LIKE 'station-%'
     OR e.source LIKE 'redo-station-%'
  ORDER BY e.id DESC
  LIMIT 50
`).all();

console.table(rows);
'@ | node -
```

## Counts By Station Today

```powershell
Set-Location -LiteralPath "C:\Users\angusm\CLAUDE MASTER\anglo-planner"

@'
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("data/planner.db", { readOnly: true });

const rows = db.prepare(`
  SELECT
    source,
    COUNT(*) AS count,
    MIN(created_at) AS first,
    MAX(created_at) AS last
  FROM events
  WHERE date(created_at) = date('now','localtime')
  GROUP BY source
  ORDER BY last DESC
`).all();

console.table(rows);
'@ | node -
```

## Recent Jobs Touched By Operators

This groups event rows into jobs so a manager dashboard can show "what changed" without duplicating every cascade field.

```powershell
Set-Location -LiteralPath "C:\Users\angusm\CLAUDE MASTER\anglo-planner"

@'
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("data/planner.db", { readOnly: true });

const rows = db.prepare(`
  SELECT
    j.biz_ref,
    j.customer,
    j.task_no,
    e.source,
    e.actor,
    COUNT(*) AS changes,
    MIN(e.created_at) AS first_change,
    MAX(e.created_at) AS last_change
  FROM events e
  LEFT JOIN jobs j ON j.id = e.job_id
  WHERE (e.source LIKE 'station-%' OR e.source LIKE 'redo-station-%')
    AND e.created_at >= datetime('now','localtime','-1 day')
  GROUP BY j.id, e.source, e.actor
  ORDER BY last_change DESC
  LIMIT 50
`).all();

console.table(rows);
'@ | node -
```

## REDO / Issue Query

```powershell
Set-Location -LiteralPath "C:\Users\angusm\CLAUDE MASTER\anglo-planner"

@'
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("data/planner.db", { readOnly: true });

const rows = db.prepare(`
  SELECT
    i.id,
    i.created_at,
    i.biz_ref,
    i.station,
    i.operator,
    i.unit,
    i.issue,
    i.material,
    i.cycle,
    i.repick_done,
    j.customer,
    j.task_no
  FROM issues i
  LEFT JOIN jobs j ON j.id = i.job_id
  WHERE date(i.created_at) = date('now','localtime')
  ORDER BY i.id DESC
  LIMIT 50
`).all();

console.table(rows);
'@ | node -
```

## Existing Station Log Work

There is already uncommitted station-log work in this checkout:

```text
src/stationLog.js
public/station-log.html
tests/station-log.test.js
```

The intended endpoint is:

```text
GET /api/station-log?station=4&days=1
```

At the time of this note, the live server had not been restarted with those new files, so `/api/station-log` returned `404` even though the files existed on disk. Direct read-only SQLite queries still worked.

When the live server is restarted from the current working tree, the manager dashboard can use `/api/station-log` instead of opening SQLite directly.

## Example Result From 2026-08-26

Confirmed entries seen locally:

```text
13:48:44 Station 5 / Richard / D2785
  s5: JOB PICKED -> DONE
  s6: QUEUED -> SCHEDULED

12:54:30 Station 5 / Richard / D2873
  s5: JOB PICKED -> DONE
  s6: QUEUED -> SCHEDULED
  s7: QUEUE OUT -> SCHEDULED

12:48:09 Station 4 / Mimmy / D2304
  s4: JOB PICKED -> DONE

12:42:15 Station 8 / Tebello / D2872
  job_status: QUEUE OUT -> BEADS DONE
```

Counts at that point:

```text
station-5: 9 rows today
station-4: 2 rows today
station-8: 1 row today
station-7: 2 rows today
issues: 0 rows today
```

## Dashboard Recommendations

For a Factory Manager dashboard, show:

- latest confirmed operator entries, newest first
- station/source
- operator
- Biz Ref and customer
- changed field
- old value -> new value
- timestamp

Also show grouped cards:

- changes in the last hour
- changes today by station
- last activity time per station
- open REDO/REPICK count from `issues`

Avoid treating every `jobs.updated_at` row as human activity, because cache refresh can update many rows together.

## Safety Boundary

These queries are read-only. Keep the manager dashboard read-only unless Angus explicitly asks for manager controls.

Do not restart the live server, change tablet state, unpin/pin tablets, or write to Google Sheets during active floor testing without Angus approving the timing.
