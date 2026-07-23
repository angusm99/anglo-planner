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
