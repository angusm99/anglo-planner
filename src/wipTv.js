"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { parseWip } = require("./stationBoard");
let snapshot = null, checkedAt = null, lastError = null, inflight = null, attemptedAt = 0;
async function refresh() {
  attemptedAt = Date.now();
  try {
    // Reuse the installed Sheets client and existing local account, requesting
    // a read-only token. Never modify WorkPool scripts or write WIP TV.
    const root = process.env.WIP_READER_ROOT || "C:/Automation/WorkpoolSync/workpool-local-sync";
    const env = require(path.join(root,"node_modules/dotenv")).parse(fs.readFileSync(path.join(root,".env")));
    const { google } = require(path.join(root,"node_modules/googleapis"));
    const auth = new google.auth.GoogleAuth({ credentials:JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY), scopes:["https://www.googleapis.com/auth/spreadsheets.readonly"] });
    const client = google.sheets({ version:"v4",auth });
    const response = await client.spreadsheets.values.get({ spreadsheetId:"111LJiZGBg8_HaT3ruWWx9RmY_UTheTUzFFYcCOj0Umw",range:"'WIP TV'!A1:N500",valueRenderOption:"FORMATTED_VALUE" },{ timeout:15000,retry:false });
    snapshot = parseWip(response.data.values || []); checkedAt = new Date().toISOString(); lastError = null;
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
module.exports = { getWip };
