"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { open } = require("./db");
const { STATIONS, applyCascade, norm } = require("./cascade");

const PORT = process.env.PORT || 3300;
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const db = open();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};

const sseClients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) res.write(payload);
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (c) => {
      buf += c;
      if (buf.length > 1e6) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); }
    });
  });
}

const JOB_COLS = `id, task_no, biz_ref, customer, colour, install_date, send_to_dash,
  qty_windows, qty_hinged, qty_folding, qty_palace, qty_specials, qty_elite, glasslist,
  s1, s2, s3, s4, s5, s6, s7, job_status, install_team, rep, source_tab, updated_at`;

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

function updateStation(body) {
  const { jobId, station, value, actor, source } = body;
  const job = getJob(jobId);
  if (!job) return { error: "Job not found" };

  let changes;
  if (station === "job_status") {
    changes = { job_status: norm(value) };
  } else {
    const stNum = Number(station);
    if (!STATIONS[stNum]) return { error: "Invalid station" };
    changes = applyCascade(job, stNum, value);
  }

  const applied = [];
  const insertEvent = db.prepare(
    `INSERT INTO events (job_id, field, old_value, new_value, actor, source) VALUES (?,?,?,?,?,?)`
  );
  for (const [field, newValue] of Object.entries(changes)) {
    const oldValue = norm(job[field]);
    if (oldValue === newValue) continue;
    db.prepare(`UPDATE jobs SET ${field} = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
      .run(newValue, jobId);
    insertEvent.run(jobId, field, oldValue, newValue, String(actor || ""), String(source || ""));
    applied.push({ field, from: oldValue, to: newValue });
  }

  const fresh = getJob(jobId);
  broadcast("job-updated", { jobId, applied });
  return { job: fresh, applied };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  try {
    if (p === "/api/stations") {
      return json(res, 200, STATIONS);
    }
    if (p === "/api/lookup") {
      return json(res, 200, lookup(url.searchParams.get("ref")));
    }
    if (p === "/api/jobs") {
      return json(res, 200, activeJobs(url.searchParams.get("days")));
    }
    if (p.startsWith("/api/events/")) {
      const jobId = Number(p.split("/")[3]);
      const rows = db.prepare(
        "SELECT field, old_value, new_value, actor, source, created_at FROM events WHERE job_id = ? ORDER BY id DESC LIMIT 50"
      ).all(jobId);
      return json(res, 200, rows);
    }
    if (p === "/api/update" && req.method === "POST") {
      const body = await readBody(req);
      const result = updateStation(body);
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
    const full = path.join(PUBLIC_DIR, path.normalize(file));
    if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream" });
    fs.createReadStream(full).pipe(res);
  } catch (err) {
    json(res, 500, { error: String(err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`Anglo planner running at http://localhost:${PORT}`);
  console.log(`Stations: http://localhost:${PORT}/station/1 .. /station/7`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
});
