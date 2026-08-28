"use strict";

const { STATIONS, norm } = require("./cascade");

const JOB_FIELDS = `j.id, j.task_no, j.biz_ref, j.customer, j.colour, j.install_date,
  j.s1, j.s2, j.s3, j.s4, j.s5, j.s6, j.s7, j.job_status`;

const QUEUE_STATUSES = new Set([
  "", "0", "QUEUED", "QUEUE OUT", "QUEUE IN", "SCHEDULED", "JOB PICKED",
  "ALLOCATED", "PICK TROLLEY", "SASH PICKED",
]);

const STATION_COMPLETE = {
  1: new Set(["DONE", "DONE-NO PW"]),
  2: new Set(["DONE", "DONE-NO PW", "ALL DLVD", "CUTPLAN RUN"]),
  3: new Set(["DONE", "DONE-NO PW"]),
  4: new Set(["DONE", "DONE-NO PW"]),
  5: new Set(["DONE", "DONE-NO PW"]),
  6: new Set(["ALL DONE", "DONE-NO PW"]),
  7: new Set(["DONE", "DONE-NO PW", "DELIVERED", "SLATTED UNITS"]),
  8: new Set(["DONE", "BEADS DONE", "FRAMES+BEADS", "BEADS+FRAMES", "BEADS+GLASS", "ALL READY"]),
};

const MANAGER_INSTRUCTIONS_CONTRACT = Object.freeze({
  enabled: false,
  readOnly: true,
  storage: "manager_instructions",
  foreignKey: "job_id -> jobs.id",
  statuses: ["queued", "acknowledged", "done", "cancelled"],
  fields: [
    "id", "job_id", "target_station", "priority", "instruction_text", "created_by",
    "created_at", "acknowledged_at", "completed_at", "status",
  ],
});

function parseSqliteLocal(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDateISO(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysISO(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function installHorizon(installDate, today) {
  if (!installDate || !/^\d{4}-\d{2}-\d{2}$/.test(installDate)) return "unscheduled";
  if (installDate < today) return "overdue";
  if (installDate === today) return "today";
  if (installDate <= addDaysISO(today, 2)) return "next48h";
  if (installDate <= addDaysISO(today, 7)) return "upcoming";
  return "later";
}

function isReadyStatus(value) {
  const status = norm(value);
  return status === "ALL READY" || status === "DELIVERED" || status.startsWith("READY");
}

function isCompleteStatus(value) {
  return norm(value) === "DONE";
}

function blockerForStatus(value) {
  const status = norm(value);
  if (!status) return null;
  if (status === "RC-X") return "RC-X";
  if (status === "CHANGES") return "Changes required";
  if (status.includes("SHORT")) return status;
  if (status.includes("DEFECT")) return status;
  if (status === "ORDER DUE") return "Order due";
  if (status === "NOT PICKED") return "Not picked";
  if (/^REDO\d*$/.test(status)) return status;
  if (/^REPICK\d*$/.test(status)) return status;
  return null;
}

function jobBlockers(job) {
  const fields = [
    ["s1", "Planning"], ["s2", "Material control"], ["s3", "Material despatch"],
    ["s4", "Saw 1"], ["s5", "Saw 2"], ["s6", "Assembly"],
    ["s7", "Glass dept"], ["job_status", "Bead saw / job status"],
  ];
  return fields.flatMap(([field, label]) => {
    const reason = blockerForStatus(job[field]);
    return reason ? [{ field, station: label, status: norm(job[field]), reason }] : [];
  });
}

function freshnessFor(lastEventAt, now = new Date()) {
  const eventDate = parseSqliteLocal(lastEventAt);
  if (!eventDate) return { state: "none", ageMinutes: null };
  const ageMinutes = Math.max(0, Math.floor((now.getTime() - eventDate.getTime()) / 60000));
  if (ageMinutes > 240) return { state: "red", ageMinutes };
  if (ageMinutes > 90) return { state: "amber", ageMinutes };
  return { state: "fresh", ageMinutes };
}

function stationIsComplete(stationNum, value) {
  return STATION_COMPLETE[stationNum]?.has(norm(value)) || false;
}

function stationHasLoad(stationNum, value) {
  const status = norm(value);
  if (!status || stationIsComplete(stationNum, status)) return false;
  return true;
}

function stationForSource(source) {
  const match = String(source || "").match(/(?:^|-)station-(\d+)$/);
  return match ? Number(match[1]) : null;
}

function toPriorityJob(job, today, now) {
  const blockers = jobBlockers(job);
  const horizon = installHorizon(job.install_date, today);
  const freshness = freshnessFor(job.last_event_at, now);
  const ready = isReadyStatus(job.job_status);
  const complete = isCompleteStatus(job.job_status);
  const openIssues = Number(job.open_issue_count || 0);
  const blocked = blockers.length > 0 || openIssues > 0;
  const installRisk = !ready && !complete && ["overdue", "today", "next48h"].includes(horizon);
  const atRisk = blocked || installRisk;
  const noActivityRisk = freshness.state === "none";
  const needsAttention = atRisk || freshness.state === "amber" || freshness.state === "red" || noActivityRisk;

  let score = 0;
  if (blocked) score += 100;
  if (horizon === "overdue") score += 80;
  else if (horizon === "today") score += 60;
  else if (horizon === "next48h") score += 40;
  else if (horizon === "upcoming") score += 15;
  if (freshness.state === "red") score += 30;
  else if (freshness.state === "amber") score += 15;
  else if (noActivityRisk) score += 20;
  score += Math.min(openIssues, 3) * 15;

  return {
    id: job.id,
    taskNo: job.task_no || "",
    bizRef: job.biz_ref || job.task_no || "—",
    customer: job.customer || "",
    colour: job.colour || "",
    installDate: job.install_date,
    horizon,
    jobStatus: norm(job.job_status),
    stationStatuses: Object.fromEntries(Object.entries(STATIONS).map(([number, station]) => [number, norm(job[station.key])])),
    lastActivityAt: job.last_event_at || null,
    freshness,
    blockers,
    openIssues,
    ready,
    complete,
    blocked,
    atRisk,
    needsAttention,
    score,
  };
}

function loadStationActivity(db, todayStart) {
  const rows = db.prepare(`
    SELECT source, MAX(created_at) AS last_activity_at,
           SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS updates_today
    FROM events
    WHERE source LIKE 'station-%' OR source LIKE 'redo-station-%'
    GROUP BY source
  `).all(todayStart);

  const activity = new Map();
  for (const row of rows) {
    const station = stationForSource(row.source);
    if (!STATIONS[station]) continue;
    const current = activity.get(station) || { lastActivityAt: null, updatesToday: 0 };
    if (!current.lastActivityAt || row.last_activity_at > current.lastActivityAt) {
      current.lastActivityAt = row.last_activity_at;
    }
    current.updatesToday += Number(row.updates_today || 0);
    activity.set(station, current);
  }
  return activity;
}

function managerSummary(db, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const today = localDateISO(now);
  const days = Math.min(Math.max(Number(options.days) || 45, 1), 365);
  const lookbackStart = addDaysISO(today, -days);
  const todayStart = `${today} 00:00:00`;

  const rows = db.prepare(`
    WITH last_operator_event AS (
      SELECT job_id, MAX(created_at) AS last_event_at
      FROM events
      WHERE source LIKE 'station-%' OR source LIKE 'redo-station-%'
      GROUP BY job_id
    ), open_issues AS (
      SELECT job_id, COUNT(*) AS open_issue_count
      FROM issues
      WHERE repick_done = 0
      GROUP BY job_id
    )
    SELECT ${JOB_FIELDS}, e.last_event_at, COALESCE(i.open_issue_count, 0) AS open_issue_count
    FROM jobs j
    LEFT JOIN last_operator_event e ON e.job_id = j.id
    LEFT JOIN open_issues i ON i.job_id = j.id
    WHERE j.active = 1
      AND UPPER(TRIM(COALESCE(j.job_status, ''))) <> 'DONE'
      AND j.install_date IS NOT NULL
      AND j.install_date >= ?
    ORDER BY j.install_date ASC, j.biz_ref ASC
    LIMIT 500
  `).all(lookbackStart);

  const jobs = rows.map((job) => toPriorityJob(job, today, now));
  const freshness = { fresh: 0, amber: 0, red: 0, none: 0 };
  const install = { overdue: 0, today: 0, next48h: 0, upcoming: 0, later: 0, unscheduled: 0 };
  for (const job of jobs) {
    freshness[job.freshness.state] += 1;
    install[job.horizon] += 1;
  }

  const activity = loadStationActivity(db, todayStart);
  const stations = Object.entries(STATIONS).map(([numberText, station]) => {
    const number = Number(numberText);
    let load = 0;
    let queue = 0;
    let inProgress = 0;
    let attention = 0;
    for (const job of rows) {
      const status = norm(job[station.key]);
      if (!stationHasLoad(number, status)) continue;
      load += 1;
      if (blockerForStatus(status)) attention += 1;
      else if (QUEUE_STATUSES.has(status)) queue += 1;
      else inProgress += 1;
    }
    const stationActivity = activity.get(number) || { lastActivityAt: null, updatesToday: 0 };
    return {
      number,
      key: station.key,
      name: station.name,
      responsible: station.responsible,
      load,
      queue,
      inProgress,
      attention,
      updatesToday: stationActivity.updatesToday,
      lastActivityAt: stationActivity.lastActivityAt,
    };
  });

  const recentUpdates = db.prepare(`
    SELECT e.id, e.job_id, e.created_at, e.source, e.actor, e.field,
           e.old_value, e.new_value, j.biz_ref, j.customer, j.task_no
    FROM events e
    JOIN jobs j ON j.id = e.job_id
    WHERE e.source LIKE 'station-%' OR e.source LIKE 'redo-station-%'
    ORDER BY e.id DESC
    LIMIT 18
  `).all().map((event) => ({ ...event, station: stationForSource(event.source) }));

  const openIssueTotal = Number(db.prepare("SELECT COUNT(*) AS count FROM issues WHERE repick_done = 0").get().count || 0);
  const openIssues = db.prepare(`
    SELECT i.id, i.job_id, i.biz_ref, i.station, i.operator, i.unit, i.issue,
           i.material, i.cycle, i.created_at, j.customer, j.task_no
    FROM issues i
    LEFT JOIN jobs j ON j.id = i.job_id
    WHERE i.repick_done = 0
    ORDER BY i.id DESC
    LIMIT 20
  `).all();

  const attentionJobs = jobs.filter((job) => job.needsAttention);
  const priorityJobs = attentionJobs
    .sort((a, b) => b.score - a.score || String(a.installDate).localeCompare(String(b.installDate)) || a.bizRef.localeCompare(b.bizRef))
    .slice(0, 18);

  const healthy = jobs.length ? Math.round((freshness.fresh / jobs.length) * 100) : 100;
  return {
    generatedAt: now.toISOString(),
    readOnly: true,
    windowDays: days,
    thresholds: { amberMinutes: 90, redMinutes: 240 },
    metrics: {
      activeJobs: jobs.length,
      atRiskJobs: jobs.filter((job) => job.atRisk).length,
      blockedJobs: jobs.filter((job) => job.blocked).length,
      attentionJobs: attentionJobs.length,
      readyJobs: jobs.filter((job) => job.ready).length,
      openIssues: openIssueTotal,
      updateHealthPercent: healthy,
    },
    freshness,
    installHorizon: install,
    stations,
    priorityJobs,
    recentUpdates,
    openIssues,
    managerInstructions: { ...MANAGER_INSTRUCTIONS_CONTRACT, items: [] },
  };
}

module.exports = {
  MANAGER_INSTRUCTIONS_CONTRACT,
  addDaysISO,
  blockerForStatus,
  freshnessFor,
  installHorizon,
  isCompleteStatus,
  isReadyStatus,
  jobBlockers,
  managerSummary,
  stationForSource,
  stationHasLoad,
  stationIsComplete,
};
