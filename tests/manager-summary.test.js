"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { DatabaseSync } = require("node:sqlite");
const {
  blockerForStatus,
  freshnessFor,
  installHorizon,
  isCompleteStatus,
  isReadyStatus,
  managerSummary,
  stationForSource,
} = require("../src/managerSummary");

function makeDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE jobs (
      id INTEGER PRIMARY KEY, task_no TEXT, biz_ref TEXT, customer TEXT, colour TEXT,
      install_date TEXT, s1 TEXT DEFAULT '', s2 TEXT DEFAULT '', s3 TEXT DEFAULT '',
      s4 TEXT DEFAULT '', s5 TEXT DEFAULT '', s6 TEXT DEFAULT '', s7 TEXT DEFAULT '',
      job_status TEXT DEFAULT '', active INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, field TEXT,
      old_value TEXT, new_value TEXT, actor TEXT, source TEXT, created_at TEXT
    );
    CREATE TABLE issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, biz_ref TEXT,
      station INTEGER, operator TEXT, unit TEXT, issue TEXT, material TEXT,
      cycle INTEGER, repick_done INTEGER DEFAULT 0, created_at TEXT
    );
  `);
  return db;
}

test("manager blocker rules use the approved attention vocabulary", () => {
  for (const value of ["PICK SHORT", "DEFECT-M", "ORDER DUE", "BEAD SHORT", "NOT PICKED", "REDO", "REDO2", "REPICK3", "RC-X", "CHANGES"]) {
    assert.ok(blockerForStatus(value), `${value} should be an attention state`);
  }
  assert.strictEqual(blockerForStatus("ALL DONE"), null);
  assert.strictEqual(blockerForStatus("GLASS READY"), null);
});

test("ready, complete and partial job-status values stay distinct", () => {
  assert.ok(isReadyStatus("ALL READY"));
  assert.ok(isReadyStatus("READY FOR INSTALL"));
  assert.ok(isReadyStatus("DELIVERED"));
  assert.ok(isCompleteStatus("DONE"));

  for (const partial of ["GLASS READY", "BEADS+GLASS", "FRAMES+BEADS", "FRAMES-WINDOW", "FRAMES-SHOP", "FRAMES-SLIDER"]) {
    assert.ok(!isReadyStatus(partial), `${partial} must remain partial`);
    assert.ok(!isCompleteStatus(partial), `${partial} must not be treated as DONE`);
  }
});

test("freshness uses confirmed event age with 90-minute amber and four-hour red thresholds", () => {
  const now = new Date("2026-08-28T12:00:00");
  assert.deepStrictEqual(freshnessFor("2026-08-28 10:30:00", now), { state: "fresh", ageMinutes: 90 });
  assert.deepStrictEqual(freshnessFor("2026-08-28 10:29:00", now), { state: "amber", ageMinutes: 91 });
  assert.deepStrictEqual(freshnessFor("2026-08-28 07:59:00", now), { state: "red", ageMinutes: 241 });
  assert.deepStrictEqual(freshnessFor(null, now), { state: "none", ageMinutes: null });
});

test("install horizon separates overdue, today, next 48 hours and upcoming work", () => {
  const today = "2026-08-28";
  assert.strictEqual(installHorizon("2026-08-27", today), "overdue");
  assert.strictEqual(installHorizon("2026-08-28", today), "today");
  assert.strictEqual(installHorizon("2026-08-30", today), "next48h");
  assert.strictEqual(installHorizon("2026-09-03", today), "upcoming");
  assert.strictEqual(installHorizon("2026-09-10", today), "later");
});

test("event source parsing resolves normal and REDO station activity", () => {
  assert.strictEqual(stationForSource("station-4"), 4);
  assert.strictEqual(stationForSource("redo-station-5"), 5);
  assert.strictEqual(stationForSource("office"), null);
});

test("manager summary is read-only, event-derived and keeps Station 8 on job_status", () => {
  const db = makeDb();
  db.prepare(`INSERT INTO jobs
    (id, task_no, biz_ref, customer, colour, install_date, s1, s2, s3, s4, s5, s6, s7, job_status, active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`)
    .run(1, "1001", "D1001", "Blocked Customer", "Bronze", "2026-08-28", "DONE", "DONE", "DONE", "PICK SHORT", "QUEUED", "SCHEDULED", "ORDER DUE", "FRAMES-WINDOW", "2026-08-28 11:59:00");
  db.prepare(`INSERT INTO jobs
    (id, task_no, biz_ref, customer, colour, install_date, s1, s2, s3, s4, s5, s6, s7, job_status, active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`)
    .run(2, "1002", "D1002", "Ready Customer", "White", "2026-08-29", "DONE", "DONE", "DONE", "DONE", "DONE", "ALL DONE", "DELIVERED", "ALL READY", "2026-08-28 11:59:00");
  db.prepare(`INSERT INTO jobs
    (id, task_no, biz_ref, customer, colour, install_date, s1, s2, s3, s4, s5, s6, s7, job_status, active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`)
    .run(3, "1003", "D1003", "Future Customer", "Black", "2026-09-02", "QUEUED", "QUEUED", "QUEUED", "QUEUED", "QUEUED", "QUEUED", "QUEUE OUT", "", "2026-08-28 11:59:00");

  db.prepare(`INSERT INTO events (job_id, field, old_value, new_value, actor, source, created_at)
              VALUES (1, 's4', 'JOB PICKED', 'PICK SHORT', 'Mimmy', 'station-4', '2026-08-28 10:00:00')`).run();
  db.prepare(`INSERT INTO events (job_id, field, old_value, new_value, actor, source, created_at)
              VALUES (2, 'job_status', 'BEADS DONE', 'ALL READY', 'Tebello', 'station-8', '2026-08-28 11:50:00')`).run();
  db.prepare(`INSERT INTO issues (job_id, biz_ref, station, operator, unit, issue, material, cycle, repick_done, created_at)
              VALUES (1, 'D1001', 4, 'Mimmy', 'W1', 'MATERIAL SHORT', 'SASH', 1, 0, '2026-08-28 10:01:00')`).run();

  const summary = managerSummary(db, { now: new Date("2026-08-28T12:00:00"), days: 45 });
  const blocked = summary.priorityJobs.find((job) => job.id === 1);
  const noEvent = summary.priorityJobs.find((job) => job.id === 3);
  const station8 = summary.stations.find((station) => station.number === 8);

  assert.strictEqual(summary.readOnly, true);
  assert.strictEqual(summary.managerInstructions.enabled, false);
  assert.strictEqual(summary.managerInstructions.items.length, 0);
  assert.strictEqual(summary.metrics.activeJobs, 3);
  assert.strictEqual(summary.metrics.blockedJobs, 1);
  assert.strictEqual(summary.metrics.attentionJobs, 2);
  assert.strictEqual(summary.metrics.readyJobs, 1);
  assert.strictEqual(summary.metrics.openIssues, 1);
  assert.strictEqual(blocked.freshness.state, "amber");
  assert.strictEqual(blocked.openIssues, 1);
  assert.ok(blocked.blockers.some((item) => item.status === "PICK SHORT"));
  assert.strictEqual(noEvent.freshness.state, "none");
  assert.strictEqual(station8.key, "job_status");
  assert.strictEqual(station8.updatesToday, 1);
  assert.strictEqual(summary.recentUpdates[0].station, 8);
});
