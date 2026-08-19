"use strict";

const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const fs = require("node:fs");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "planner.db");

function open() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_no TEXT,
      biz_ref TEXT,
      customer TEXT DEFAULT '',
      colour TEXT DEFAULT '',
      install_date TEXT,
      send_to_dash TEXT DEFAULT '',
      qty_windows REAL, qty_hinged REAL, qty_folding REAL,
      qty_palace REAL, qty_specials REAL, qty_elite REAL,
      glasslist INTEGER DEFAULT 0,
      s1 TEXT DEFAULT '', s2 TEXT DEFAULT '', s3 TEXT DEFAULT '',
      s4 TEXT DEFAULT '', s5 TEXT DEFAULT '', s6 TEXT DEFAULT '', s7 TEXT DEFAULT '',
      job_status TEXT DEFAULT '',
      install_team TEXT DEFAULT '',
      rep TEXT DEFAULT '',
      source_tab TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_biz_ref ON jobs (biz_ref);
    CREATE INDEX IF NOT EXISTS idx_jobs_task_no ON jobs (task_no);
    CREATE INDEX IF NOT EXISTS idx_jobs_install ON jobs (install_date);

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES jobs (id),
      field TEXT NOT NULL,
      old_value TEXT DEFAULT '',
      new_value TEXT DEFAULT '',
      actor TEXT DEFAULT '',
      source TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_events_job ON events (job_id);

    CREATE TABLE IF NOT EXISTS issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES jobs (id),
      biz_ref TEXT NOT NULL,
      station INTEGER NOT NULL CHECK (station BETWEEN 1 AND 7),
      operator TEXT NOT NULL,
      unit TEXT NOT NULL,
      issue TEXT NOT NULL,
      material TEXT DEFAULT '',
      cycle INTEGER NOT NULL CHECK (cycle > 0),
      repick_done INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_issues_biz_ref ON issues (biz_ref);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_cycle ON issues (biz_ref, unit, cycle);
  `);
  return db;
}

module.exports = { open, DB_PATH };
