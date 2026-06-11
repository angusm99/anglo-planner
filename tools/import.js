"use strict";

// Loads data/import.json (produced by tools/export_xlsx.py) into the SQLite db.
// Dedupes by task_no (falling back to biz_ref): monthly tabs win over
// JOBS IN QUEUE, and later months win over earlier ones.

const fs = require("node:fs");
const path = require("node:path");
const { open } = require("../src/db");

const IMPORT_PATH = path.join(__dirname, "..", "data", "import.json");
const records = JSON.parse(fs.readFileSync(IMPORT_PATH, "utf-8"));

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

function tabRank(tab) {
  if (tab === "JOBS IN QUEUE") return 0;
  const [m, y] = tab.split("-");
  return Number(y) * 100 + (MONTHS.indexOf(m) + 1);
}

const byKey = new Map();
for (const r of records) {
  const key = r.task_no || `ref:${r.biz_ref}`;
  const prev = byKey.get(key);
  if (!prev || tabRank(r.source_tab) >= tabRank(prev.source_tab)) byKey.set(key, r);
}

const db = open();
db.exec("DELETE FROM events; DELETE FROM jobs;");
const ins = db.prepare(`INSERT INTO jobs
  (task_no, biz_ref, customer, colour, install_date, send_to_dash,
   qty_windows, qty_hinged, qty_folding, qty_palace, qty_specials, qty_elite, glasslist,
   s1, s2, s3, s4, s5, s6, s7, job_status, source_tab)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

let n = 0;
for (const r of byKey.values()) {
  ins.run(r.task_no, r.biz_ref, r.customer, r.colour, r.install_date, r.send_to_dash,
    r.qty_windows, r.qty_hinged, r.qty_folding, r.qty_palace, r.qty_specials, r.qty_elite,
    r.glasslist, r.s1, r.s2, r.s3, r.s4, r.s5, r.s6, r.s7, r.job_status, r.source_tab);
  n++;
}
console.log(`Imported ${n} unique jobs (${records.length} source rows) into the database.`);
