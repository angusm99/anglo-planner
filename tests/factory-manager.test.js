"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { DatabaseSync } = require("node:sqlite");
const { factoryManager, factoryJobDetail, stationState, workpoolUrl } = require("../src/factoryManager");

function makeDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE jobs (id INTEGER PRIMARY KEY, task_no TEXT, biz_ref TEXT, customer TEXT, colour TEXT, install_date TEXT,
      send_to_dash TEXT, qty_windows REAL, qty_hinged REAL, qty_folding REAL, qty_palace REAL, qty_specials REAL, qty_elite REAL,
      s1 TEXT DEFAULT '', s2 TEXT DEFAULT '', s3 TEXT DEFAULT '', s4 TEXT DEFAULT '', s5 TEXT DEFAULT '',
      s6 TEXT DEFAULT '', s7 TEXT DEFAULT '', job_status TEXT DEFAULT '', active INTEGER DEFAULT 1);
    CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, field TEXT, old_value TEXT,
      new_value TEXT, actor TEXT, source TEXT, created_at TEXT);
    CREATE TABLE issues (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, biz_ref TEXT, station INTEGER, operator TEXT,
      unit TEXT, issue TEXT, material TEXT, cycle INTEGER, repick_done INTEGER DEFAULT 0, created_at TEXT);`);
  const add = db.prepare(`INSERT INTO jobs (id, biz_ref, install_date, qty_windows, qty_hinged, qty_elite, s4, s5, job_status, active)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  add.run(1, "D1", "2026-10-14", 3, 2, 1, "DONE", "O", "QUEUE OUT", 1);      // today, saw 1 done
  add.run(2, "D2", "2026-10-10", 1, 0, 0, "PICK SHORT", "", "GLASS READY", 1); // overdue, blocked
  add.run(3, "D3", "2026-10-09", 1, 0, 0, "DONE", "DONE", "ALL READY", 1);    // past and ready: hidden
  add.run(4, "D4", "2026-10-20", 1, 0, 0, "QUEUED", "", "", 0);              // inactive: hidden
  add.run(5, "D5", "2026-06-01", 1, 0, 0, "QUEUED", "", "", 1);              // older than lookback: hidden
  db.prepare("INSERT INTO events (job_id, field, old_value, new_value, actor, source, created_at) VALUES (?,?,?,?,?,?,?)")
    .run(1, "s4", "QUEUED", "DONE", "Brian", "station-4", "2026-10-14 09:15:00");
  return db;
}
const NOW = new Date("2026-10-14T10:00:00");

test("station states: done, not needed, blocked, to do, blank", () => {
  assert.equal(stationState(4, "DONE-NO PW"), "done");
  assert.equal(stationState(5, "O"), "na");
  assert.equal(stationState(4, "PICK SHORT"), "blocked");
  assert.equal(stationState(4, "JOB PICKED"), "todo");
  assert.equal(stationState(8, "BEADS+GLASS"), "done");
  assert.equal(stationState(8, "GLASS READY"), "todo");
  assert.equal(stationState(6, ""), "empty");
});

test("view keeps today, unfinished overdue; drops ready past, inactive and stale rows", () => {
  const m = factoryManager(makeDb(), { now: NOW });
  assert.deepStrictEqual(m.jobs.map((j) => j.bizRef), ["D2", "D1"]);
  const [d2, d1] = m.jobs;
  assert.ok(d2.overdue && d2.blockers.length === 1 && !d1.overdue);
  assert.deepStrictEqual([d1.units.windows, d1.units.sliding, d1.units.doors, d1.units.total], [3, 1, 2, 6]);
  assert.equal(d1.stations[3].lastBy, "Brian");
  const saw1 = m.stations[3];
  assert.deepStrictEqual([saw1.toDo, saw1.blocked, saw1.updatesToday, saw1.operatorsToday], [1, 1, 1, ["Brian"]]);
  assert.equal(m.readOnly, true);
});

test("job detail returns history and 404s unknown ids", () => {
  const db = makeDb();
  const d = factoryJobDetail(db, 1);
  assert.equal(d.events.length, 1);
  assert.equal(d.events[0].station, 4);
  assert.ok(factoryJobDetail(db, 999).error);
});

test("WorkPool link points at the parent task (W-POOL REF), never at junk refs", () => {
  assert.equal(workpoolUrl("553916"), "https://anglowindows.myworkpool.net/task/view.do?goToViewTask=true&taskId=553916");
  assert.equal(workpoolUrl(" 550230 "), "https://anglowindows.myworkpool.net/task/view.do?goToViewTask=true&taskId=550230");
  for (const bad of ["", null, "D3024", "55 0230", "550230&x=1"]) assert.equal(workpoolUrl(bad), "");
});
