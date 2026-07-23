"use strict";

// Mirrors station taps back into the Google Sheet (the sheet stays master).
// Disabled unless SHEET_WEBAPP_URL is set, so the app runs fine without it.
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

// Fire-and-forget: never blocks or breaks the station tap. Retries a couple of
// times to ride out a WiFi blip, then logs.
// ponytail: in-memory retry x2 only — an update lost to 3 failures or a server
// restart mid-retry is missing from the sheet until re-tapped. Add a persistent
// outbox table if same-day sheet accuracy ever has to be guaranteed.
function pushStationUpdate(job, applied, attempt = 0) {
  if (!URL_STR) return; // writeback disabled — safe default
  const payload = buildPayload(job, applied);
  if (!payload) return;
  payload.token = TOKEN;

  const retry = () => {
    if (attempt < 2) setTimeout(() => pushStationUpdate(job, applied, attempt + 1), 2000 * (attempt + 1));
    return attempt >= 2;
  };
  post(URL_STR, payload)
    .then((r) => {
      if (r.body && r.body.indexOf('"ok":true') !== -1) return;
      if (retry()) console.error(`[sheet] push not confirmed (${r.status}): ${String(r.body).slice(0, 140)}`);
    })
    .catch((e) => { if (retry()) console.error(`[sheet] push failed: ${e.message}`); });
}

module.exports = { buildPayload, pushStationUpdate };
