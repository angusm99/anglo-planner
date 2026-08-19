"use strict";

// Mirrors station taps back into the Google Sheet (the sheet stays master).
// Disabled unless SHEET_WEBAPP_URL is set. Reads still work from the local
// cache, but station writes are deliberately blocked so the Sheet stays master.
// Deploy tools/sheet-writeback.gs as a Web App, then set two env vars:
//   SHEET_WEBAPP_URL  – the deployment's /exec URL
//   SHEET_TOKEN       – shared secret (same value as Script Property PLANNER_TOKEN)

const https = require("node:https");

const URL_STR = process.env.SHEET_WEBAPP_URL || "";
const TOKEN = process.env.SHEET_TOKEN || "";

// The only fields that exist as columns in the sheet (see tools/sheet-writeback.gs).
const PUSHABLE = new Set(["s1", "s2", "s3", "s4", "s5", "s6", "s7", "job_status"]);

// Pure: decide what (if anything) to send. Returns the payload or null to skip.
function buildPayload(job, applied) {
  if (!job || !job.source_tab || job.source_tab === "OFFICE") return null;
  const updates = {};
  for (const { field, to } of applied || []) {
    if (PUSHABLE.has(field)) updates[field] = to;
  }
  if (!Object.keys(updates).length) return null;
  return { tab: job.source_tab, task_no: job.task_no || "", biz_ref: job.biz_ref || "", updates };
}

function buildIssuePayload(issue) {
  if (!issue?.source_tab || issue.source_tab === "OFFICE" || !issue?.biz_ref || !issue?.station || !issue?.unit || !issue?.issue || !issue?.cycle) return null;
  return {
    action: "issue_log",
    tab: issue.source_tab,
    task_no: issue.task_no || "",
    date: issue.created_at || new Date().toISOString(),
    biz_ref: issue.biz_ref,
    station: Number(issue.station),
    operator: String(issue.operator || ""),
    unit: String(issue.unit),
    issue: String(issue.issue),
    material: String(issue.material || ""),
    cycle: Number(issue.cycle),
  };
}

function buildRepickDonePayload(job, issue) {
  if (!job?.source_tab || job.source_tab === "OFFICE" || !issue?.cycle) return null;
  return {
    action: "repick_done",
    tab: job.source_tab,
    task_no: job.task_no || "",
    biz_ref: job.biz_ref || "",
    unit: issue.unit || "",
    cycle: Number(issue.cycle),
  };
}

function post(urlStr, data) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(data));
    const req = https.request(new URL(urlStr), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": body.length },
    }, (res) => {
      // GAS web apps answer a POST with a 302 to googleusercontent.com; follow it once.
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        res.resume();
        https.get(res.headers.location, (r2) => {
          let b = ""; r2.on("data", (c) => (b += c)); r2.on("end", () => resolve({ status: r2.statusCode, body: b }));
        }).on("error", reject);
        return;
      }
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, body: b }));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function get(params) {
  return new Promise((resolve, reject) => {
    const u = new URL(URL_STR);
    u.searchParams.set("token", TOKEN);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const go = (target, hops) => https.get(target, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && hops < 2) {
        res.resume();
        return go(res.headers.location, hops + 1);
      }
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve(b));
    }).on("error", reject);
    go(u, 0);
  });
}

// Live read from the sheet. Returns [] on any failure so lookups never break.
async function fetchSheetJobs(params) {
  if (!URL_STR) return [];
  try {
    const body = JSON.parse(await get(params));
    if (!body.ok) { console.error(`[sheet] read failed: ${body.error}`); return []; }
    return body.jobs || [];
  } catch (e) {
    console.error(`[sheet] read failed: ${e.message}`);
    return [];
  }
}

async function fetchSheetCapabilities() {
  if (!URL_STR) return [];
  try {
    const body = JSON.parse(await get({ capabilities: "1" }));
    return body.ok && Array.isArray(body.capabilities) ? body.capabilities : [];
  } catch (e) {
    console.error(`[sheet] capability check failed: ${e.message}`);
    return [];
  }
}

const sheetEnabled = () => Boolean(URL_STR);

async function postConfirmed(payload, label) {
  if (!URL_STR || !payload) return false;
  const body = { ...payload, token: TOKEN };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await post(URL_STR, body);
      let parsed = null;
      try { parsed = JSON.parse(response.body || "{}"); } catch (_) { /* handled below */ }
      if (parsed?.ok === true) return true;
      if (attempt === 2) console.error(`[sheet] ${label} not confirmed (${response.status})`);
    } catch (e) {
      if (attempt === 2) console.error(`[sheet] ${label} failed: ${e.message}`);
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
  }
  return false;
}

function pushIssueLog(issue) {
  return postConfirmed(buildIssuePayload(issue), "issue log push");
}

function pushStationUpdateConfirmed(job, applied) {
  return postConfirmed(buildPayload(job, applied), "station update");
}

function pushRepickDone(job, issue) {
  return postConfirmed(buildRepickDonePayload(job, issue), "repick completion push");
}

module.exports = {
  buildPayload, buildIssuePayload, buildRepickDonePayload,
  pushStationUpdateConfirmed, pushIssueLog, pushRepickDone,
  fetchSheetJobs, fetchSheetCapabilities, sheetEnabled,
};
