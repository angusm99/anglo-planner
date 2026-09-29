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
const configuredTimeout = Number(process.env.SHEET_REQUEST_TIMEOUT_MS);
const REQUEST_TIMEOUT_MS = Number.isFinite(configuredTimeout) && configuredTimeout > 0
  ? configuredTimeout
  : 15000;
// The full-sheet read (all rows, ~13 s and growing) routinely brushed the
// normal limit; tablet lookups keep the short one.
const FULL_READ_TIMEOUT_MS = REQUEST_TIMEOUT_MS * 4;
const readHealth = {
  fullRead: { lastSuccessAt: null, lastError: null },
  capabilities: { lastSuccessAt: null, lastError: null },
};

function sheetHealth(now = Date.now()) {
  const checks = Object.values(readHealth);
  const stale = checks.some(c => c.lastSuccessAt && now - Date.parse(c.lastSuccessAt) > 15 * 60e3);
  const status = !URL_STR ? "disabled" : checks.some(c => c.lastError) ? "degraded"
    : stale ? "stale" : checks.some(c => !c.lastSuccessAt) ? "checking" : "ready";
  return { status, fullRead: { ...readHealth.fullRead }, capabilities: { ...readHealth.capabilities } };
}

function safeError(error) {
  let message = String(error.message || error);
  if (TOKEN) message = message.split(TOKEN).join("[redacted]");
  return message.replace(/https?:\/\/\S+/g, "[url]").replace(/[\r\n]/g, " ").slice(0, 240);
}

function responseJson(response) {
  const type = String(response.headers["content-type"] || "unknown").replace(/[^\w/;= .-]/g, "").slice(0, 80);
  const detail = `HTTP ${response.status}; type=${type}; bytes=${Buffer.byteLength(response.body)}`;
  if (response.status < 200 || response.status >= 300) {
    const error = new Error(detail);
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }
  try { return JSON.parse(response.body); }
  catch {
    // Log response metadata, never raw HTML/JSON: it can contain tokens or job data.
    const kind = !response.body.trim() ? "empty response" : /^\s*</.test(response.body) ? "HTML/XML instead of JSON" : "invalid JSON";
    throw new Error(`${detail}; ${kind}`);
  }
}

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

function requestText(target, options = {}, body = null, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const req = https.request(target, options, (res) => {
      let responseBody = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (responseBody += chunk));
      res.on("end", () => finish(resolve, {
        status: res.statusCode,
        headers: res.headers,
        body: responseBody,
        url: String(target),
      }));
      res.on("error", (err) => finish(reject, err));
      res.on("aborted", () => finish(reject, new Error("Sheet response interrupted before completion")));
    });
    const timer = setTimeout(() => {
      req.destroy(new Error(`Sheet request timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    req.on("error", (err) => finish(reject, err));
    if (body) req.write(body);
    req.end();
  });
}

async function followRedirects(response, deadline) {
  // Google sometimes redirects content back through script.google.com before
  // returning JSON. Follow the GET chain without ever resending a POST body.
  for (let hops = 0; [301, 302, 303, 307, 308].includes(response.status) && response.headers.location; hops++) {
    if (hops >= 5) throw new Error("Sheet redirect limit exceeded (5)");
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Sheet request timed out during redirects");
    const target = new URL(response.headers.location, response.url);
    if (target.protocol !== "https:") throw new Error("Sheet returned a non-HTTPS redirect");
    response = await requestText(target, {}, null, remaining);
  }
  return response;
}

async function post(urlStr, data) {
  const body = Buffer.from(JSON.stringify(data));
  const deadline = Date.now() + REQUEST_TIMEOUT_MS * 2;
  const response = await requestText(new URL(urlStr), {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": body.length },
  }, body);
  // A method-preserving redirect is not the Apps Script acknowledgement
  // protocol. Fail it rather than replaying a possibly completed write.
  if (response.status === 307 || response.status === 308) return response;
  return followRedirects(response, deadline);
}

async function get(params, timeoutMs = REQUEST_TIMEOUT_MS) {
  const u = new URL(URL_STR);
  u.searchParams.set("token", TOKEN);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const deadline = Date.now() + timeoutMs;
  const response = await requestText(u, {}, null, timeoutMs);
  return responseJson(await followRedirects(response, deadline));
}

async function read(params, field, timeoutMs, healthKey) {
  const state = healthKey && readHealth[healthKey];
  // One retry for background reads only. A lookup should not hold a tablet open.
  const attempts = healthKey ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const body = await get(params, timeoutMs);
      if (body?.ok !== true || !Array.isArray(body[field])) {
        const error = new Error(body?.ok === false ? `Sheet rejected read: ${safeError(body.error || "unknown error")}` : "Invalid Sheet response shape");
        error.retryable = false;
        throw error;
      }
      if (state) { state.lastSuccessAt = new Date().toISOString(); state.lastError = null; }
      return body[field];
    } catch (error) {
      const detail = safeError(error);
      if (state) state.lastError = detail;
      const retry = attempt + 1 < attempts && error.retryable !== false;
      console.error(`[sheet] ${healthKey || "lookup"} failed: ${detail}${retry ? "; retrying once" : ""}`);
      if (!retry) return null;
      await new Promise(resolve => setTimeout(resolve, Math.min(2000, REQUEST_TIMEOUT_MS)));
    }
  }
}

// Live read from the sheet. Returns [] on any failure so lookups never break.
async function fetchSheetJobs(params) {
  if (!URL_STR) return [];
  return await read(params, "jobs", params.all ? FULL_READ_TIMEOUT_MS : REQUEST_TIMEOUT_MS, params.all ? "fullRead" : null) || [];
}

async function fetchSheetCapabilities() {
  if (!URL_STR) return null;
  return read({ capabilities: "1" }, "capabilities", REQUEST_TIMEOUT_MS * 2, "capabilities");
}

const sheetEnabled = () => Boolean(URL_STR);

async function postConfirmed(payload, label) {
  if (!URL_STR || !payload) return false;
  const body = { ...payload, token: TOKEN };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await post(URL_STR, body);
      const parsed = responseJson(response);
      if (parsed?.ok === true) return true;
      if (attempt === 2) {
        const detail = parsed?.error ? `: ${safeError(parsed.error)}` : "";
        console.error(`[sheet] ${label} not confirmed (${response.status})${detail}`);
      }
    } catch (e) {
      if (attempt === 2) console.error(`[sheet] ${label} failed: ${safeError(e)}`);
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
  fetchSheetJobs, fetchSheetCapabilities, sheetEnabled, sheetHealth,
};
