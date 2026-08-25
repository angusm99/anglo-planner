"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { open } = require("./db");
const { STATIONS, applyCascade, norm } = require("./cascade");
const { cleanRedoInput, redoChanges, redoneChanges } = require("./redo");
const {
  pushStationUpdateConfirmed, pushIssueLog, pushRepickDone,
  fetchSheetJobs, fetchSheetCapabilities, sheetEnabled,
} = require("./sheet");

const PORT = process.env.PORT || 3300;
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const db = open();
let redoBridgeReady = false;
const redoInFlight = new Set();
const COVER_ADMIN_HASH = 6454293043924497;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ttf": "font/ttf",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
};

const sseClients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    if (res.writableEnded || res.destroyed) { sseClients.delete(res); continue; }
    res.write(payload);
  }
}

// Keep-alive comment so idle dashboard connections aren't dropped by the OS/browser.
setInterval(() => {
  for (const res of sseClients) {
    if (res.writableEnded || res.destroyed) { sseClients.delete(res); continue; }
    res.write(": ping\n\n");
  }
}, 25000).unref();

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (c) => {
      buf += c;
      if (buf.length > 1e6) {
        req.destroy();
        reject(new Error("body too large"));
      }
    });
    req.on("end", () => {
      try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function adb(args, timeout = 5000) {
  return new Promise((resolve, reject) => {
    execFile("adb", args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        err.message = [err.message, stderr].filter(Boolean).join("\n");
        reject(err);
        return;
      }
      resolve(String(stdout || "").trim());
    });
  });
}

async function adbDevices() {
  const out = await adb(["devices"]);
  return out.split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2)
    .map(([serial, state]) => ({ serial, state }));
}

async function findTabletForStation(station) {
  const needle = `Station ${station} -`;
  const devices = (await adbDevices()).filter((device) => device.state === "device");
  for (const device of devices) {
    try {
      const name = await adb(["-s", device.serial, "shell", "settings", "get", "global", "device_name"]);
      if (name.includes(needle)) return { ...device, name };
    } catch (_) {
      // Keep probing the remaining tablets; one stale transport should not block admin exit.
    }
  }
  return null;
}

async function sendTabletHome(body) {
  const station = Number(body?.station);
  const passwordHash = Number(body?.passwordHash);
  if (!Number.isInteger(station) || station < 1 || station > 8) return { error: "Valid station required" };
  if (passwordHash !== COVER_ADMIN_HASH) return { error: "Wrong password" };

  const tablet = await findTabletForStation(station);
  if (!tablet) return { error: `Station ${station} is not reachable by authorized ADB` };

  await adb(["-s", tablet.serial, "shell", "am", "task", "lock", "stop"], 5000).catch(() => "");
  await adb(["-s", tablet.serial, "shell", "input", "keyevent", "HOME"], 5000);
  return { ok: true, station, serial: tablet.serial, name: tablet.name };
}

const JOB_COLS = `id, task_no, biz_ref, customer, colour, install_date, send_to_dash,
  qty_windows, qty_hinged, qty_folding, qty_palace, qty_specials, qty_elite, glasslist,
  s1, s2, s3, s4, s5, s6, s7, job_status, install_team, rep, source_tab, active, updated_at`;

function getJob(id) {
  return db.prepare(`SELECT ${JOB_COLS} FROM jobs WHERE id = ?`).get(id);
}

function lookup(ref) {
  const q = norm(ref);
  if (!q) return [];
  return db.prepare(
    `SELECT ${JOB_COLS} FROM jobs
     WHERE active = 1 AND (UPPER(TRIM(biz_ref)) = ? OR UPPER(TRIM(task_no)) = ?)
     ORDER BY install_date IS NULL, install_date DESC LIMIT 10`
  ).all(q, q);
}

function activeJobs(days) {
  const lookback = Math.min(Math.max(Number(days) || 45, 1), 365);
  return db.prepare(
    `SELECT ${JOB_COLS} FROM jobs
     WHERE active = 1
       AND UPPER(job_status) <> 'DONE'
       AND install_date IS NOT NULL
       AND install_date >= date('now', ?)
     ORDER BY install_date ASC, biz_ref ASC LIMIT 200`
  ).all(`-${lookback} days`);
}

// ---- live sheet cache -----------------------------------------------------
// The sheet is master. SQLite is just a cache of it (plus OFFICE-only jobs).
// Rows arrive from the GAS web app in exactly the import.js field shape.

const SHEET_FIELDS = ["task_no", "biz_ref", "customer", "colour", "install_date",
  "send_to_dash", "qty_windows", "qty_hinged", "qty_folding", "qty_palace",
  "qty_specials", "qty_elite", "glasslist", "s1", "s2", "s3", "s4", "s5", "s6", "s7",
  "job_status", "source_tab"];

const upsertUpdate = db.prepare(
  `UPDATE jobs SET ${SHEET_FIELDS.map((f) => `${f} = ?`).join(", ")}, updated_at = datetime('now','localtime') WHERE id = ?`
);
const upsertInsert = db.prepare(
  `INSERT INTO jobs (${SHEET_FIELDS.join(",")}) VALUES (${SHEET_FIELDS.map(() => "?").join(",")})`
);

function upsertSheetJob(r) {
  const existing = r.task_no
    ? db.prepare("SELECT id FROM jobs WHERE task_no = ? AND source_tab <> 'OFFICE'").get(r.task_no)
    : db.prepare("SELECT id FROM jobs WHERE biz_ref = ? AND source_tab <> 'OFFICE'").get(r.biz_ref);
  const vals = SHEET_FIELDS.map((f) => r[f] ?? null);
  if (existing) { upsertUpdate.run(...vals, existing.id); return existing.id; }
  return Number(upsertInsert.run(...vals).lastInsertRowid);
}

// ponytail: upsert-only — rows deleted from the sheet linger in the cache
// until archived in /office. Add delete-sync if that ever actually bites.
async function refreshFromSheet() {
  const jobs = await fetchSheetJobs({ all: "1" });
  if (!jobs.length) return 0;
  for (const r of jobs) upsertSheetJob(r);
  console.log(`[sheet] cache refreshed: ${jobs.length} jobs`);
  broadcast("job-updated", { jobId: null, applied: [] }); // nudge dashboards
  return jobs.length;
}

async function refreshSheetCapabilities() {
  const capabilities = await fetchSheetCapabilities();
  if (capabilities === null) {
    console.log(`[sheet] REDO bridge: ${redoBridgeReady ? "READY" : "NOT READY"} (last known; capability check failed)`);
    return [];
  }
  redoBridgeReady = capabilities.includes("issue_log") && capabilities.includes("repick_done");
  console.log(`[sheet] REDO bridge: ${redoBridgeReady ? "READY" : "NOT READY"}`);
  return capabilities;
}

const EDITABLE_FIELDS = [
  "task_no", "biz_ref", "customer", "colour", "install_date", "send_to_dash",
  "qty_windows", "qty_hinged", "qty_folding", "qty_palace", "qty_specials", "qty_elite",
  "glasslist", "job_status", "install_team", "rep", "active",
];
const QTY_FIELDS = new Set(["qty_windows", "qty_hinged", "qty_folding", "qty_palace", "qty_specials", "qty_elite"]);
const UPPER_FIELDS = new Set(["biz_ref", "task_no", "colour", "job_status", "send_to_dash"]);

function cleanField(field, value) {
  if (field === "install_date") {
    const v = String(value || "").trim();
    if (!v) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error("install_date must be YYYY-MM-DD");
    return v;
  }
  if (QTY_FIELDS.has(field)) {
    const v = String(value ?? "").trim();
    if (!v) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${field} must be a number`);
    return n;
  }
  if (field === "glasslist" || field === "active") return value ? 1 : 0;
  if (UPPER_FIELDS.has(field)) return norm(value);
  return String(value ?? "").trim();
}

function searchJobs(q) {
  const term = String(q || "").trim().toUpperCase();
  if (!term) {
    // Office default list: undated jobs first (they need dates), then newest
    return db.prepare(
      `SELECT ${JOB_COLS} FROM jobs WHERE active = 1
       ORDER BY install_date IS NOT NULL, install_date DESC LIMIT 100`
    ).all();
  }
  const like = `%${term}%`;
  return db.prepare(
    `SELECT ${JOB_COLS} FROM jobs
     WHERE UPPER(biz_ref) LIKE ? OR UPPER(task_no) LIKE ? OR UPPER(customer) LIKE ?
     ORDER BY active DESC, install_date IS NULL, install_date DESC LIMIT 50`
  ).all(like, like, like);
}

function createJob(body) {
  const bizRef = norm(body.biz_ref);
  if (!bizRef) return { error: "Biz ref is required" };

  const fields = { biz_ref: bizRef, source_tab: "OFFICE" };
  for (const f of EDITABLE_FIELDS) {
    if (f === "biz_ref" || f === "active" || !(f in body)) continue;
    fields[f] = cleanField(f, body[f]);
  }
  const cols = Object.keys(fields);
  const stmt = db.prepare(
    `INSERT INTO jobs (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`
  );
  const info = stmt.run(...cols.map((c) => fields[c]));
  const id = Number(info.lastInsertRowid);
  db.prepare(`INSERT INTO events (job_id, field, old_value, new_value, actor, source) VALUES (?,?,?,?,?,?)`)
    .run(id, "created", "", bizRef, String(body.actor || ""), "office");
  const job = getJob(id);
  broadcast("job-updated", { jobId: id, applied: [{ field: "created", to: bizRef }] });
  return { job };
}

function editJob(id, body) {
  const job = getJob(id);
  if (!job) return { error: "Job not found" };

  const applied = [];
  const insertEvent = db.prepare(
    `INSERT INTO events (job_id, field, old_value, new_value, actor, source) VALUES (?,?,?,?,?,?)`
  );
  for (const field of EDITABLE_FIELDS) {
    if (!(field in body)) continue;
    const newValue = cleanField(field, body[field]);
    const oldCmp = job[field] == null ? "" : String(job[field]);
    const newCmp = newValue == null ? "" : String(newValue);
    if (oldCmp === newCmp) continue;
    db.prepare(`UPDATE jobs SET ${field} = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
      .run(newValue, id);
    insertEvent.run(id, field, oldCmp, newCmp, String(body.actor || ""), "office");
    applied.push({ field, from: oldCmp, to: newCmp });
  }

  const fresh = getJob(id);
  if (applied.length) broadcast("job-updated", { jobId: id, applied });
  return { job: fresh, applied };
}

const STATION_FIELDS = new Set(["s1", "s2", "s3", "s4", "s5", "s6", "s7", "job_status"]);

function writeJobChanges(job, changes, actor, source) {
  const applied = [];
  const insertEvent = db.prepare(
    `INSERT INTO events (job_id, field, old_value, new_value, actor, source) VALUES (?,?,?,?,?,?)`
  );
  for (const [field, newValue] of Object.entries(changes)) {
    if (!STATION_FIELDS.has(field)) throw new Error(`Invalid station field: ${field}`);
    const oldValue = norm(job[field]);
    if (oldValue === newValue) continue;
    db.prepare(`UPDATE jobs SET ${field} = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
      .run(newValue, job.id);
    insertEvent.run(job.id, field, oldValue, newValue, String(actor || ""), String(source || ""));
    applied.push({ field, from: oldValue, to: newValue });
  }
  return applied;
}

function applyJobChanges(job, changes, actor, source) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const applied = writeJobChanges(job, changes, actor, source);
    db.exec("COMMIT");
    return applied;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

async function updateStation(body) {
  const { jobId, station, value, actor, source } = body;
  const job = getJob(jobId);
  if (!job) return { error: "Job not found" };
  if (!sheetEnabled()) return { error: "Live Google Sheet bridge is unavailable; nothing was changed" };

  let changes;
  const stNum = Number(station);
  if (!STATIONS[stNum]) return { error: "Invalid station" };
  changes = applyCascade(job, stNum, value);
  if (changes._redo) return { error: "Use the REDO issue report instead" };

  const planned = Object.entries(changes).map(([field, newValue]) => ({
    field, from: norm(job[field]), to: newValue,
  })).filter((change) => change.from !== change.to);
  if (planned.length && !await pushStationUpdateConfirmed(job, planned)) {
    return { error: "Google Sheet did not confirm the update; nothing was changed" };
  }

  const applied = applyJobChanges(job, changes, actor, source);

  const fresh = getJob(jobId);
  broadcast("job-updated", { jobId, applied });
  return { job: fresh, applied };
}

async function submitRedo(body) {
  if (!sheetEnabled()) return { error: "REDO requires the live Sheet bridge" };
  if (!redoBridgeReady) return { error: "REDO is locked until the v2 ISSUE LOG bridge is deployed" };

  let input;
  try { input = cleanRedoInput(body); } catch (err) { return { error: err.message }; }
  const job = getJob(input.jobId);
  if (!job) return { error: "Job not found" };
  const bizRef = norm(job.biz_ref);
  if (!bizRef) return { error: "REDO requires a Biz Ref" };
  if (!job.source_tab || job.source_tab === "OFFICE") return { error: "REDO requires a job from the live Sheet" };

  const lockKey = `${bizRef}|${input.unit}`;
  if (redoInFlight.has(lockKey)) return { error: "This REDO is already being submitted" };
  redoInFlight.add(lockKey);
  try {
    const row = db.prepare(
      "SELECT COALESCE(MAX(cycle), 0) + 1 AS cycle FROM issues WHERE UPPER(biz_ref) = ? AND UPPER(unit) = ?"
    ).get(bizRef, input.unit);
    const cycle = Number(row.cycle);
    const issueForSheet = {
      source_tab: job.source_tab, task_no: job.task_no || "",
      biz_ref: bizRef, station: input.station, operator: input.actor,
      unit: input.unit, issue: input.issue, material: input.material,
      cycle, created_at: new Date().toISOString(),
    };

    if (!await pushIssueLog(issueForSheet)) {
      return { error: "ISSUE LOG did not confirm the report; nothing was changed" };
    }

    let issueId;
    let applied;
    db.exec("BEGIN IMMEDIATE");
    try {
      const info = db.prepare(
        `INSERT INTO issues (job_id, biz_ref, station, operator, unit, issue, material, cycle)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(job.id, bizRef, input.station, input.actor, input.unit, input.issue, input.material, cycle);
      issueId = Number(info.lastInsertRowid);
      applied = writeJobChanges(job, redoChanges(input.station, cycle), input.actor, `redo-station-${input.station}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }

    const fresh = getJob(job.id);
    broadcast("job-updated", { jobId: job.id, applied });
    return { job: fresh, issueId, cycle, applied };
  } finally {
    redoInFlight.delete(lockKey);
  }
}

async function completeRepick(body) {
  const issueId = Number(body?.issueId);
  if (!Number.isInteger(issueId) || issueId < 1) return { error: "Valid issueId required" };
  if (!sheetEnabled() || !redoBridgeReady) return { error: "REDO bridge is not ready" };

  const issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(issueId);
  if (!issue) return { error: "Issue not found" };
  const job = getJob(issue.job_id);
  if (!job) return { error: "Job not found" };
  const expected = `REDONE${issue.cycle}`;
  if (issue.repick_done || norm(job.s3) === expected) {
    if (!issue.repick_done) db.prepare("UPDATE issues SET repick_done = 1 WHERE id = ?").run(issueId);
    return { job, issue: { ...issue, repick_done: 1 }, applied: [] };
  }

  if (!await pushRepickDone(job, issue)) {
    return { error: "Sheet did not confirm REPICK completion; nothing was changed" };
  }

  let applied;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE issues SET repick_done = 1 WHERE id = ?").run(issueId);
    applied = writeJobChanges(job, redoneChanges(issue.cycle), String(body.actor || issue.operator), "redo-complete");
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  const fresh = getJob(job.id);
  broadcast("job-updated", { jobId: job.id, applied });
  return { job: fresh, issue: { ...issue, repick_done: 1 }, applied };
}

function listIssues(ref) {
  const bizRef = norm(ref);
  if (!bizRef) return null;
  return db.prepare(
    `SELECT i.id, i.job_id, i.biz_ref, i.station, i.operator, i.unit, i.issue,
            i.material, i.cycle,
            CASE WHEN i.repick_done = 1 OR UPPER(COALESCE(j.s3, '')) = ('REDONE' || i.cycle)
                 THEN 1 ELSE 0 END AS repick_done,
            i.created_at
     FROM issues i JOIN jobs j ON j.id = i.job_id
     WHERE UPPER(i.biz_ref) = ? ORDER BY i.id DESC LIMIT 100`
  ).all(bizRef);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  try {
    if (p === "/api/stations") {
      return json(res, 200, STATIONS);
    }
    if (p === "/api/capabilities") {
      if (sheetEnabled()) await refreshSheetCapabilities();
      return json(res, 200, { sheet: sheetEnabled(), redo: redoBridgeReady });
    }
    if (p === "/api/lookup") {
      const ref = url.searchParams.get("ref");
      let rows = lookup(ref);
      if (!rows.length && sheetEnabled()) {
        // Not in the cache — ask the live sheet, cache what comes back.
        const remote = await fetchSheetJobs({ ref: norm(ref) });
        for (const r of remote) upsertSheetJob(r);
        if (remote.length) rows = lookup(ref);
      }
      return json(res, 200, rows);
    }
    if (p === "/api/jobs") {
      if (req.method === "POST") {
        const result = createJob(await readBody(req));
        return json(res, result.error ? 400 : 200, result);
      }
      return json(res, 200, activeJobs(url.searchParams.get("days")));
    }
    const jobMatch = p.match(/^\/api\/jobs\/(\d+)$/);
    if (jobMatch) {
      const id = Number(jobMatch[1]);
      if (req.method === "PATCH" || req.method === "POST") {
        const result = editJob(id, await readBody(req));
        return json(res, result.error ? 400 : 200, result);
      }
      const job = getJob(id);
      return job ? json(res, 200, job) : json(res, 404, { error: "Job not found" });
    }
    if (p === "/api/search") {
      return json(res, 200, searchJobs(url.searchParams.get("q")));
    }
    if (p.startsWith("/api/events/")) {
      const jobId = Number(p.split("/")[3]);
      const rows = db.prepare(
        "SELECT field, old_value, new_value, actor, source, created_at FROM events WHERE job_id = ? ORDER BY id DESC LIMIT 50"
      ).all(jobId);
      return json(res, 200, rows);
    }
    if (p === "/api/issues") {
      const rows = listIssues(url.searchParams.get("ref"));
      return rows === null ? json(res, 400, { error: "ref required" }) : json(res, 200, rows);
    }
    if (p === "/api/redo/complete" && req.method === "POST") {
      const result = await completeRepick(await readBody(req));
      return json(res, result.error ? 400 : 200, result);
    }
    if (p === "/api/redo" && req.method === "POST") {
      const result = await submitRedo(await readBody(req));
      return json(res, result.error ? 400 : 200, result);
    }
    if (p === "/api/update" && req.method === "POST") {
      const body = await readBody(req);
      const result = await updateStation(body);
      return json(res, result.error ? 400 : 200, result);
    }
    if (p === "/api/tablet/admin-home" && req.method === "POST") {
      const result = await sendTabletHome(await readBody(req));
      return json(res, result.error ? 400 : 200, result);
    }
    if (p === "/api/stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("retry: 3000\n\n");
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    // Static files
    let file = p === "/" ? "/index.html" : p;
    if (/^\/station\/\d+$/.test(p)) file = "/station.html";
    if (p === "/dashboard") file = "/dashboard.html";
    if (p === "/office") file = "/office.html";
    const full = path.join(PUBLIC_DIR, path.normalize(file));
    if (!full.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(full)] || "application/octet-stream",
      // Tablets must revalidate so UI updates land without a manual cache clear
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(full).pipe(res);
  } catch (err) {
    json(res, 500, { error: String(err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`Anglo planner running at http://localhost:${PORT}`);
  console.log(`Stations: http://localhost:${PORT}/station/1 .. /station/8`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
  if (sheetEnabled()) {
    refreshFromSheet();
    refreshSheetCapabilities();
    setInterval(refreshFromSheet, 10 * 60e3).unref(); // sheet is master; re-pull every 10 min
    setInterval(refreshSheetCapabilities, 10 * 60e3).unref();
    console.log("Sheet sync: ON (live lookup fallback + 10-min cache refresh + tap writeback)");
  } else {
    console.log("Sheet sync: OFF — set SHEET_WEBAPP_URL and SHEET_TOKEN to enable");
  }
});
