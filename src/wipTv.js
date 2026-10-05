"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { parseWip } = require("./stationBoard");
let snapshot = null, checkedAt = null, lastError = null, inflight = null, attemptedAt = 0;
let client;
async function readValues(range) {
  if (!client) {
    const root = process.env.WIP_READER_ROOT || "C:/Automation/WorkpoolSync/workpool-local-sync";
    const env = require(path.join(root,"node_modules/dotenv")).parse(fs.readFileSync(path.join(root,".env")));
    const { google } = require(path.join(root,"node_modules/googleapis"));
    const auth = new google.auth.GoogleAuth({ credentials:JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY), scopes:["https://www.googleapis.com/auth/spreadsheets.readonly"] });
    client = google.sheets({ version:"v4",auth });
  }
  const response = await client.spreadsheets.values.get({ spreadsheetId:"111LJiZGBg8_HaT3ruWWx9RmY_UTheTUzFFYcCOj0Umw",range,valueRenderOption:"FORMATTED_VALUE" },{ timeout:15000,retry:false });
  return response.data.values || [];
}
function masterStatus(job, rows) {
  const matches = rows.filter(r => job.task_no
    ? String(r[0] || "").trim() === job.task_no
    : [3,13,22].some(i => String(r[i] || "").trim().toUpperCase() === job.biz_ref));
  if (matches.length !== 1) throw Error("Master job missing or duplicated; ask the foreman to reconcile");
  const row=matches[0], result={...job};
  ["s1","s2","s3","s4","s5","s6","s7","job_status"].forEach((field,i)=>{result[field]=String(row[14+i] || "").trim().toUpperCase();});
  return result;
}
async function readMasterStatus(job) {
  if (!/^(JOBS IN QUEUE|(?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)-\d{4})$/.test(job.source_tab)) throw Error("Invalid master planner tab");
  return masterStatus(job,await readValues(`'${job.source_tab}'!A4:W`));
}
async function refresh() {
  attemptedAt = Date.now();
  try {
    // Reuse the installed Sheets client and existing local account, requesting
    // a read-only token. Never modify WorkPool scripts or write WIP TV.
    snapshot = parseWip(await readValues("'WIP TV'!A1:N500")); checkedAt = new Date().toISOString(); lastError = null;
  } catch (_) { lastError = "WIP TV could not be refreshed; showing the last successful list"; }
  return current();
}
function current() { return { snapshot,checkedAt,error:lastError,stale:!checkedAt || Date.now()-Date.parse(checkedAt)>5*60e3 }; }
async function getWip() {
  if (Date.now()-attemptedAt>60000) {
    if (!inflight) inflight = refresh().finally(()=>{inflight=null;});
    await inflight;
  }
  return current();
}
module.exports = { getWip,readMasterStatus,masterStatus };
