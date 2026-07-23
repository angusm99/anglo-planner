/**
 * Planner writeback endpoint.
 *
 * Receives station taps from the planner app and writes them into the matching
 * monthly / queue tab. Runs as YOU, so it can write even protected ranges.
 *
 * DEPLOY (one time):
 *   1. Open the sheet → Extensions → Apps Script.
 *   2. Add a file, paste this in, Save.
 *   3. Project Settings → Script Properties → add PLANNER_TOKEN = <a long secret>.
 *   4. Deploy → New deployment → type "Web app":
 *        Execute as: Me    ·    Who has access: Anyone
 *      Copy the /exec URL.
 *   5. On the planner PC set two env vars (same secret):
 *        SHEET_WEBAPP_URL = <the /exec URL>
 *        SHEET_TOKEN      = <the PLANNER_TOKEN value>
 *   Re-deploy (Manage deployments → edit → new version) whenever you change this file.
 *
 * Column map matches tools/export_xlsx.py: data starts at row 4,
 * A = task no, D = biz ref, O..U = stations 1..7, V = job status.
 */

var DATA_START_ROW = 4;
var COL = { s1: 15, s2: 16, s3: 17, s4: 18, s5: 19, s6: 20, s7: 21, job_status: 22 };
var MONTH_TAB = /^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)-\d{4}$/;

// ---- live read (GET) ----------------------------------------------------
// ?token=..&ref=D1990   → jobs matching that biz ref / task no
// ?token=..&all=1       → every job row (planner uses this to refresh its cache)
// Row mapping mirrors tools/export_xlsx.py exactly.

function doGet(e) {
  try {
    var token = PropertiesService.getScriptProperties().getProperty('PLANNER_TOKEN');
    if (!token || e.parameter.token !== token) return _json({ ok: false, error: 'bad token' });

    var q = String(e.parameter.ref || '').trim().toUpperCase();
    var all = e.parameter.all === '1';
    if (!q && !all) return _json({ ok: false, error: 'ref or all=1 required' });

    var ss = SpreadsheetApp.getActive();
    var tz = Session.getScriptTimeZone();
    var jobs = [];

    ss.getSheets().forEach(function (sheet) {
      var tab = sheet.getName();
      if (!MONTH_TAB.test(tab) && tab !== 'JOBS IN QUEUE') return;
      var last = sheet.getLastRow();
      if (last < DATA_START_ROW) return;
      var rows = sheet.getRange(DATA_START_ROW, 1, last - DATA_START_ROW + 1, 22).getValues();

      rows.forEach(function (r) {
        var taskNo = _s(r[0]), bizRef = _s(r[3]), customer = _s(r[4]);
        if (!taskNo && !bizRef) return;
        if (taskNo.toUpperCase().indexOf('REF') !== -1 || bizRef.toUpperCase().indexOf('BIZMAN') !== -1 || !customer) return; // in-sheet header rows
        if (!all && taskNo.toUpperCase() !== q && bizRef.toUpperCase() !== q) return;
        jobs.push({
          task_no: taskNo, biz_ref: bizRef, customer: customer,
          install_date: _d(r[1], tz), send_to_dash: _s(r[2]), colour: _s(r[5]),
          qty_windows: _n(r[6]), qty_hinged: _n(r[7]), qty_folding: _n(r[8]),
          qty_palace: _n(r[9]), qty_specials: _n(r[10]), qty_elite: _n(r[11]),
          glasslist: String(r[12]).toUpperCase() === 'TRUE' ? 1 : 0,
          s1: _u(r[14]), s2: _u(r[15]), s3: _u(r[16]), s4: _u(r[17]),
          s5: _u(r[18]), s6: _u(r[19]), s7: _u(r[20]), job_status: _u(r[21]),
          source_tab: tab,
        });
      });
    });
    return _json({ ok: true, jobs: jobs });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function _s(v) { return v == null ? '' : String(v).trim(); }
function _u(v) { return _s(v).toUpperCase(); }
function _n(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
function _d(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var m = _s(v).match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    var token = PropertiesService.getScriptProperties().getProperty('PLANNER_TOKEN');
    if (!token || body.token !== token) return _json({ ok: false, error: 'bad token' });

    var sheet = SpreadsheetApp.getActive().getSheetByName(body.tab);
    if (!sheet) return _json({ ok: false, error: 'no tab: ' + body.tab });

    var last = sheet.getLastRow();
    var n = last - DATA_START_ROW + 1;
    if (n < 1) return _json({ ok: false, error: 'empty tab' });

    var key = String(body.task_no || '').trim();
    var ref = String(body.biz_ref || '').trim();
    var keys = sheet.getRange(DATA_START_ROW, 1, n, 4).getValues(); // A..D

    var rowIdx = -1;
    for (var i = 0; i < keys.length; i++) {
      var a = String(keys[i][0]).trim(); // A = task no
      var d = String(keys[i][3]).trim(); // D = biz ref
      if ((key && a === key) || (!key && ref && d === ref)) { rowIdx = DATA_START_ROW + i; break; }
    }
    if (rowIdx < 0) return _json({ ok: false, error: 'row not found' });

    var updates = body.updates || {};
    var wrote = [];
    for (var field in updates) {
      var col = COL[field];
      if (col) { sheet.getRange(rowIdx, col).setValue(updates[field]); wrote.push(field); }
    }
    return _json({ ok: true, row: rowIdx, wrote: wrote });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
