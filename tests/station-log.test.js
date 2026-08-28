"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { DatabaseSync } = require("node:sqlite");
const { stationLog } = require("../src/stationLog");

function makeDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE jobs (id INTEGER PRIMARY KEY, biz_ref TEXT, customer TEXT, task_no TEXT);
    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, field TEXT,
      old_value TEXT, new_value TEXT, actor TEXT, source TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
  db.prepare("INSERT INTO jobs (id, biz_ref, customer, task_no) VALUES (1, 'D1234', 'Test Customer', '1001')").run();
  return db;
}

test("station log returns only this station's events, newest first", () => {
  const db = makeDb();
  db.prepare(`INSERT INTO events (job_id, field, old_value, new_value, actor, source)
              VALUES (1, 's4', 'QUEUED', 'DONE', 'Mimmy', 'station-4')`).run();
  db.prepare(`INSERT INTO events (job_id, field, old_value, new_value, actor, source)
              VALUES (1, 's5', 'QUEUED', 'DONE', 'Richard', 'station-5')`).run();
  db.prepare(`INSERT INTO events (job_id, field, old_value, new_value, actor, source)
              VALUES (1, 's4', 'DONE', 'REDO', 'Mimmy', 'redo-station-4')`).run();

  const result = stationLog(db, 4, 30);

  assert.strictEqual(result.station.name, "Saw 1");
  assert.strictEqual(result.rows.length, 2);
  assert.ok(result.rows.every((r) => r.source === "station-4" || r.source === "redo-station-4"));
  assert.strictEqual(result.rows[0].new_value, "REDO"); // most recent first
});

test("station log rejects an unknown station number", () => {
  const db = makeDb();
  assert.strictEqual(stationLog(db, 99, 30).error, "Invalid station");
});

test("station log respects the day window", () => {
  const db = makeDb();
  db.prepare(`INSERT INTO events (job_id, field, old_value, new_value, actor, source, created_at)
              VALUES (1, 's4', 'QUEUED', 'DONE', 'Mimmy', 'station-4', datetime('now', '-40 days'))`).run();

  assert.strictEqual(stationLog(db, 4, 30).rows.length, 0);
  assert.strictEqual(stationLog(db, 4, 60).rows.length, 1);
});
