"use strict";

// Read-only Factory Manager view: jobs by install day with every station's
// state, modelled on the Site Foreman /manager page (days -> work -> pinned
// detail). Reads the local cache + confirmed tablet events only; never writes.

const { STATIONS, norm } = require("./cascade");
const { addDaysISO, blockerForStatus, isReadyStatus, stationIsComplete, stationForSource } = require("./managerSummary");

const NOT_NEEDED = new Set(["O", "0", "N/A"]);
// W-POOL REF (planner column A / task_no) is the WorkPool parent task - the same
// task the calendar booking hangs off. Same URL the planner import hyperlinks.
const WORKPOOL_TASK = "https://anglowindows.myworkpool.net/task/view.do?goToViewTask=true&taskId=";
const workpoolUrl = (taskNo) => (/^\d+$/.test(String(taskNo || "").trim()) ? WORKPOOL_TASK + String(taskNo).trim() : "");
const OVERDUE_LOOKBACK_DAYS = 30; // older unfinished rows are sheet noise, not floor work
const AHEAD_DAYS = 120;

function localDateISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function stationState(num, value) {
  const v = norm(value);
  if (!v) return "empty";
  if (NOT_NEEDED.has(v)) return "na";
  if (stationIsComplete(num, v)) return "done";
  if (blockerForStatus(v)) return "blocked";
  return "todo";
}

const units = (j) => {
  const n = (x) => Number(x) || 0;
  const u = { windows: n(j.qty_windows), sliding: n(j.qty_elite), hinged: n(j.qty_hinged), fold: n(j.qty_folding),
    palace: n(j.qty_palace), specials: n(j.qty_specials) };
  u.doors = u.hinged + u.fold + u.palace;
  u.total = u.windows + u.sliding + u.doors + u.specials;
  return u;
};

function toJob(j, lastByField) {
  const stations = Object.entries(STATIONS).map(([numText, st]) => {
    const num = Number(numText);
    const last = lastByField.get(`${j.id}:${st.key}`);
    return { number: num, name: st.name, status: norm(j[st.key]), state: stationState(num, j[st.key]),
      lastBy: last?.actor || "", lastAt: last?.created_at || "" };
  });
  const needed = stations.filter((s) => s.state !== "na" && s.state !== "empty");
  const ready = isReadyStatus(j.job_status) || norm(j.job_status) === "DONE";
  const blocked = stations.filter((s) => s.state === "blocked");
  return {
    id: j.id, bizRef: j.biz_ref || j.task_no || "—", taskNo: j.task_no || "", customer: j.customer || "",
    colour: j.colour || "", workpoolUrl: workpoolUrl(j.task_no), installDate: j.install_date, booking: norm(j.send_to_dash), jobStatus: norm(j.job_status),
    units: units(j), stations, ready, openIssues: Number(j.open_issues || 0),
    blockers: blocked.map((s) => `${s.name}: ${s.status}`),
    progress: { done: needed.filter((s) => s.state === "done").length, needed: needed.length },
    lastActivityAt: j.last_event_at || "",
  };
}

function factoryManager(db, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const today = localDateISO(now);
  const rows = db.prepare(`
    WITH last_event AS (SELECT job_id, MAX(created_at) AS last_event_at FROM events
                        WHERE source LIKE 'station-%' OR source LIKE 'redo-station-%' GROUP BY job_id),
         open_issues AS (SELECT job_id, COUNT(*) AS open_issues FROM issues WHERE repick_done = 0 GROUP BY job_id)
    SELECT j.*, e.last_event_at, COALESCE(i.open_issues, 0) AS open_issues
    FROM jobs j LEFT JOIN last_event e ON e.job_id = j.id LEFT JOIN open_issues i ON i.job_id = j.id
    WHERE j.active = 1 AND j.install_date IS NOT NULL AND j.install_date BETWEEN ? AND ?
    ORDER BY j.install_date, j.biz_ref`).all(addDaysISO(today, -OVERDUE_LOOKBACK_DAYS), addDaysISO(today, AHEAD_DAYS));

  // last confirmed tablet change per job+field, for "who / when" on each station
  const lastByField = new Map();
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    const evs = db.prepare(`SELECT job_id, field, actor, created_at FROM events
      WHERE job_id IN (${ids.map(() => "?").join(",")}) AND field <> 'confirm-noop' ORDER BY id`).all(...ids);
    for (const e of evs) lastByField.set(`${e.job_id}:${e.field}`, e);
  }

  const jobs = rows.map((r) => toJob(r, lastByField))
    .filter((j) => j.installDate >= today || !j.ready); // past installs only while still unfinished
  for (const j of jobs) j.overdue = j.installDate < today;

  const todayStart = `${today} 00:00:00`;
  const activity = db.prepare(`SELECT source, actor, COUNT(*) AS n, MAX(created_at) AS last_at FROM events
    WHERE created_at >= ? AND field NOT IN ('confirm-noop','s6','s7') AND (source LIKE 'station-%' OR source LIKE 'redo-station-%')
    GROUP BY source, actor`).all(todayStart);
  const lastEver = db.prepare(`SELECT source, MAX(created_at) AS last_at FROM events
    WHERE source LIKE 'station-%' GROUP BY source`).all();
  const stations = Object.entries(STATIONS).map(([numText, st]) => {
    const number = Number(numText);
    const mine = activity.filter((a) => stationForSource(a.source) === number);
    return {
      number, name: st.name,
      toDo: jobs.filter((j) => ["todo", "blocked"].includes(j.stations[number - 1].state)).length,
      blocked: jobs.filter((j) => j.stations[number - 1].state === "blocked").length,
      updatesToday: mine.reduce((s, a) => s + a.n, 0),
      operatorsToday: [...new Set(mine.map((a) => a.actor).filter(Boolean))],
      lastActivityAt: lastEver.find((a) => stationForSource(a.source) === number)?.last_at || "",
    };
  });

  return { generatedAt: now.toISOString(), today, readOnly: true, jobs, stations,
    window: { overdueLookbackDays: OVERDUE_LOOKBACK_DAYS, aheadDays: AHEAD_DAYS } };
}

function factoryJobDetail(db, id) {
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(Number(id));
  if (!job) return { error: "Job not found" };
  const events = db.prepare(`SELECT created_at, actor, source, field, old_value, new_value FROM events
    WHERE job_id = ? ORDER BY id DESC LIMIT 200`).all(job.id)
    .map((e) => ({ ...e, station: stationForSource(e.source) }));
  const issues = db.prepare(`SELECT station, operator, unit, issue, material, cycle, repick_done, created_at
    FROM issues WHERE job_id = ? ORDER BY id DESC`).all(job.id);
  const lastByField = new Map();
  for (const e of [...events].reverse()) if (e.field !== "confirm-noop") lastByField.set(`${job.id}:${e.field}`, e);
  return { job: toJob({ ...job, last_event_at: events[0]?.created_at || "" }, lastByField), events, issues };
}

module.exports = { factoryManager, factoryJobDetail, stationState, workpoolUrl };
