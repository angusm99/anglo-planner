"use strict";
const { STATIONS, applyCascade, norm } = require("./cascade");
const SUPPORTED = [4, 5, 8];

function parseWip(values) {
  const days = [], jobs = [];
  let day = null;
  for (const row of values) {
    if (/INSTALL DAY:/.test(String(row[0]))) {
      day = String(row[0]).split("INSTALL DAY:")[1].split("—")[0].trim();
      days.push(day);
    } else if (day && /^\d+$/.test(String(row[0])) && row[2]) {
      jobs.push({ task_no: String(row[0]), biz_ref: String(row[1] || ""), customer: row[2], colour: row[5], units: row[6], day,
        s4: norm(row[8]), job_status: norm(row[11]) });
    }
  }
  if (!values[0]?.[0]?.includes("FACTORY W.I.P BOARD") || days.length !== 3) throw Error("WIP TV layout changed; list not loaded");
  return { days, jobs, updated: String(values[1]?.[0] || "") };
}

function createBoard(db, deps) {
  db.exec(`CREATE TABLE IF NOT EXISTS station_board_entries (
    station INTEGER NOT NULL, job_id INTEGER NOT NULL REFERENCES jobs(id), day TEXT NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0, reason TEXT NOT NULL, issuer TEXT NOT NULL, actor TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '', PRIMARY KEY(station,job_id));
    CREATE TABLE IF NOT EXISTS station_board_audit (
    id INTEGER PRIMARY KEY, station INTEGER NOT NULL, job_id INTEGER NOT NULL, action TEXT NOT NULL,
    actor TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT DEFAULT(datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS station_board_changes (
    id INTEGER PRIMARY KEY, station INTEGER NOT NULL, job_id INTEGER NOT NULL,
    actor TEXT NOT NULL, changes TEXT NOT NULL, event_id INTEGER NOT NULL DEFAULT 0, undone INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT(datetime('now','localtime')));`);
  const station = n => { n = Number(n); if (!SUPPORTED.includes(n)) throw Error("Only stations 4, 5 and 8 are supported"); return n; };
  const actor = a => { a = String(a || "").trim(); if (!a || a.length > 100) throw Error("Enter the operator's name"); return a; };
  const getJob = id => db.prepare("SELECT * FROM jobs WHERE id=?").get(Number(id));
  const audit = (s,id,action,a,details) => db.prepare("INSERT INTO station_board_audit(station,job_id,action,actor,details) VALUES(?,?,?,?,?)").run(s,id,action,a,JSON.stringify(details));
  function list(s, wip) {
    s = station(s);
    const planned = wip.jobs.map(row => {
      const job = db.prepare("SELECT * FROM jobs WHERE task_no=? AND source_tab <> 'OFFICE' ORDER BY source_tab='JOBS IN QUEUE', id DESC LIMIT 1").get(row.task_no);
      return { ...row, ...(job || {}), id: job?.id || null, day: row.day, wipStatus: s === 5 ? null : row[STATIONS[s].key], source: "WIP TV" };
    });
    const overrides = db.prepare("SELECT * FROM station_board_entries WHERE station=?").all(s);
    for (const e of overrides) {
      const index = planned.findIndex(j => j.id === e.job_id);
      if (e.hidden) { if (index >= 0) planned.splice(index,1); continue; }
      const job = getJob(e.job_id);
      if (!job) continue;
      if (index >= 0) Object.assign(planned[index], { day:e.day, note:e.note });
      else planned.push({ ...job, day:e.day, source:e.reason, issuer:e.issuer, note:e.note });
    }
    return { station:s, name:STATIONS[s].name, days:wip.days, updated:wip.updated, jobs:planned.map(j => ({ ...j,
      status:norm(j[STATIONS[s].key]), undoId:db.prepare("SELECT id FROM station_board_changes WHERE station=? AND job_id=? AND undone=0 ORDER BY id DESC LIMIT 1").get(s,j.id)?.id || null })) };
  }
  function manage(body, wip, foreman) {
    if (!["allocate","remove"].includes(body.action)) throw Error("Invalid allocation action");
    const s = station(body.station), a = actor(body.actor), job = getJob(body.jobId);
    if (!job || job.source_tab === "OFFICE") throw Error("Select an existing master-planner job");
    const onWip = wip.jobs.some(j => j.task_no === job.task_no);
    const remove = body.action === "remove";
    if (remove && !foreman) throw Error("Only the foreman can remove a job");
    if (!remove && !wip.days.includes(body.day)) throw Error("Choose one of the displayed WIP TV days");
    const issuer = String(body.issuer || "").trim();
    if (!remove && !onWip && (body.reason !== "MANUAL ISSUE" || !issuer || issuer.length > 100)) throw Error("Outside WIP TV: select MANUAL ISSUE and type the issuer's name");
    if (!foreman && onWip) throw Error("This job is already scheduled; only the foreman can change its allocation");
    if (!foreman && db.prepare("SELECT 1 FROM station_board_entries WHERE station=? AND job_id=?").get(s,job.id)) throw Error("Only the foreman can edit an existing allocation");
    const reason = onWip ? "FOREMAN ALLOCATION" : "MANUAL ISSUE";
    const note = String(body.note || "").trim().slice(0,500);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(`INSERT INTO station_board_entries(station,job_id,day,hidden,reason,issuer,actor,note) VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(station,job_id) DO UPDATE SET day=excluded.day,hidden=excluded.hidden,reason=excluded.reason,issuer=excluded.issuer,actor=excluded.actor,note=excluded.note`)
        .run(s,job.id,body.day || "",remove?1:0,reason,issuer,a,note);
      audit(s,job.id,remove?"remove":"allocate",a,{ day:body.day, reason,issuer,note,foreman });
      db.exec("COMMIT");
    } catch(e) { db.exec("ROLLBACK"); throw e; }
    return { ok:true };
  }
  async function change(body, wip) {
    const s = station(body.station), a = actor(body.actor), job = getJob(body.jobId);
    if (!job || !list(s,wip).jobs.some(j => j.id===job.id)) throw Error("Job is not on this station board");
    const live = await deps.live(job);
    if (!live) throw Error("Could not verify the current master status; retry");
    let changes, undo;
    if (body.undoId) {
      undo = db.prepare("SELECT * FROM station_board_changes WHERE id=? AND station=? AND job_id=? AND undone=0").get(Number(body.undoId),s,job.id);
      if (!undo) throw Error("This confirmation was already undone");
      if (list(s,wip).jobs.find(j=>j.id===job.id).undoId !== undo.id) throw Error("Undo the latest confirmation first");
      const snapshot = JSON.parse(undo.changes);
      const later = db.prepare("SELECT field FROM events WHERE job_id=? AND id>?").all(job.id,undo.event_id);
      if (later.some(e=>snapshot.some(c=>c.field===e.field))) throw Error("A later recorded update blocks undo; ask the foreman to reconcile");
      if (snapshot.some(c => norm(live[c.field]) !== norm(c.to))) throw Error("Another update followed this confirmation. Undo is blocked to protect later work.");
      changes = snapshot.map(c => ({ field:c.field,from:c.to,to:c.from }));
    } else {
      const next = applyCascade(live,s,body.value);
      if (next._redo) throw Error("Use the existing REDO issue screen");
      changes = Object.entries(next).filter(([f,v])=>norm(live[f])!==norm(v)).map(([field,to])=>({field,from:norm(live[field]),to}));
      if (!changes.length) return { ok:true, message:"Already at that status; nothing changed" };
    }
    if (!await deps.push(live,changes)) throw Error("Google Sheet did not confirm this change; check the result before retrying");
    db.exec("BEGIN IMMEDIATE");
    try {
      deps.apply(live,Object.fromEntries(changes.map(c=>[c.field,c.to])),a,`station-${s}-board`);
      if (undo) db.prepare("UPDATE station_board_changes SET undone=1 WHERE id=?").run(undo.id);
      else db.prepare("INSERT INTO station_board_changes(station,job_id,actor,changes,event_id) VALUES(?,?,?,?,?)").run(s,job.id,a,JSON.stringify(changes),db.prepare("SELECT COALESCE(MAX(id),0) AS id FROM events").get().id);
      audit(s,job.id,undo?"unconfirm":"confirm",a,changes);
      db.exec("COMMIT");
    } catch(e) { db.exec("ROLLBACK"); throw Error("Sheet acknowledged the update but local recording failed. Refresh and ask the foreman to reconcile."); }
    return { ok:true };
  }
  return { list,manage,change };
}
module.exports = { parseWip, createBoard };
