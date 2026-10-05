"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { parseWip } = require("./stationBoard");
let snapshot = null, checkedAt = null, lastError = null, inflight = null, attemptedAt = 0;
let client;
const spreadsheetId="111LJiZGBg8_HaT3ruWWx9RmY_UTheTUzFFYcCOj0Umw";
const plannerTab=name=>/^(JOBS IN QUEUE|(?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)-\d{4})$/.test(name);
function sheetsClient() {
  if (!client) {
    const root = process.env.WIP_READER_ROOT || "C:/Automation/WorkpoolSync/workpool-local-sync";
    const env = require(path.join(root,"node_modules/dotenv")).parse(fs.readFileSync(path.join(root,".env")));
    const { google } = require(path.join(root,"node_modules/googleapis"));
    const auth = new google.auth.GoogleAuth({ credentials:JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY), scopes:["https://www.googleapis.com/auth/spreadsheets.readonly"] });
    client = google.sheets({ version:"v4",auth });
  }
  return client;
}
async function readValues(range) {
  const response = await sheetsClient().spreadsheets.values.get({ spreadsheetId,range,valueRenderOption:"FORMATTED_VALUE" },{ timeout:15000,retry:false });
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
  if (!plannerTab(job.source_tab)) throw Error("Invalid master planner tab");
  return masterStatus(job,await readValues(`'${job.source_tab}'!A4:W`));
}
function plannerJobs(tab,rows) {
  const text=v=>v==null?"":String(v).trim(), upper=v=>text(v).toUpperCase();
  return rows.flatMap(r=>{
    const task_no=text(r[0]),biz_ref=text(r[3])||text(r[13])||text(r[22]),customer=text(r[4]);
    if ((!task_no&&!biz_ref)||upper(task_no).includes("REF")||upper(biz_ref).includes("BIZMAN")||!customer) return [];
    const install_date=typeof r[1]==="number" ? new Date(Math.round((r[1]-25569)*86400000)).toISOString().slice(0,10) : /^\d{4}-\d{2}-\d{2}/.exec(text(r[1]))?.[0]||null;
    const job={task_no,biz_ref,customer,install_date,send_to_dash:text(r[2]),colour:text(r[5]),glasslist:upper(r[12])==="TRUE"?1:0,source_tab:tab};
    ["qty_windows","qty_hinged","qty_folding","qty_palace","qty_specials","qty_elite"].forEach((f,i)=>{const n=parseFloat(r[6+i]);job[f]=Number.isNaN(n)?null:n;});
    ["s1","s2","s3","s4","s5","s6","s7","job_status"].forEach((f,i)=>{job[f]=upper(r[14+i]);});
    return [job];
  });
}
async function readMasterJobs() {
  const api=sheetsClient(),options={timeout:15000,retry:false};
  const metadata=await api.spreadsheets.get({spreadsheetId,fields:"sheets.properties.title"},options);
  const tabs=metadata.data.sheets.map(s=>s.properties.title).filter(plannerTab);
  if (!tabs.length) throw Error("No master planner tabs found");
  const response=await api.spreadsheets.values.batchGet({spreadsheetId,ranges:tabs.map(t=>`'${t}'!A4:W`),valueRenderOption:"UNFORMATTED_VALUE",dateTimeRenderOption:"SERIAL_NUMBER"},options);
  if (response.data.valueRanges?.length!==tabs.length) throw Error("Incomplete master read");
  const jobs=response.data.valueRanges.flatMap((r,i)=>plannerJobs(tabs[i],r.values||[]));
  if (!jobs.length) throw Error("Empty master read; keeping previous cache");
  return jobs;
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
module.exports = { getWip,readMasterStatus,masterStatus,readMasterJobs,plannerJobs };
