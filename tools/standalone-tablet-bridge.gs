/**
 * FACTORY TERMINAL bridge v2.
 *
 * Keeps the Material Planner as master for live job reads, station writes,
 * REDO issue logging, and numbered REPICK/REDONE completion.
 *
 * Deployment:
 *   1. Replace the FACTORY TERMINAL web-app Code.gs with this file.
 *   2. Preserve the existing PLANNER_TOKEN Script Property.
 *   3. Deploy a new web-app version (execute as owner; access Anyone).
 *   4. Run installIssueLogTrigger() once from the editor and authorise it.
 *      This uses a named installable trigger and does NOT conflict with the
 *      plannerCore.gs onEdit(e) function.
 */

var SPREADSHEET_ID = '111LJiZGBg8_HaT3ruWWx9RmY_UTheTUzFFYcCOj0Umw';
var DATA_START_ROW = 4;
var COL = { s1: 15, s2: 16, s3: 17, s4: 18, s5: 19, s6: 20, s7: 21, job_status: 22 };
var MONTH_TAB = /^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)-\d{4}$/;
var ISSUE_LOG_NAME = 'ISSUE LOG';
var ISSUE_LOG_HEADERS = ['Date', 'Biz Ref', 'Station', 'Operator', 'Unit', 'Issue', 'Material', 'Repick Done', 'Cycle'];
var CAPABILITIES = ['station_update', 'issue_log', 'repick_done'];

// This is a standalone script -- not bound to the Material Planner sheet --
// so SpreadsheetApp's "get the active spreadsheet" call has no active
// spreadsheet to resolve in a doGet/doPost web-app call and returns null.
// Always open by ID instead.
function _ss_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function doGet(e) {
  try {
    if (!_tokenOk_(e.parameter.token)) return _json_({ ok: false, error: 'bad token' });
    if (e.parameter.capabilities === '1') return _json_({ ok: true, capabilities: CAPABILITIES });
    if (e.parameter.setup === '1') return _setup_();

    var q = _u_(e.parameter.ref);
    var all = e.parameter.all === '1';
    if (!q && !all) return _json_({ ok: false, error: 'ref or all=1 required' });

    var ss = _ss_();
    var tz = Session.getScriptTimeZone();
    var jobs = [];
    ss.getSheets().forEach(function (sheet) {
      var tab = sheet.getName();
      if (!_isPlannerTab_(tab)) return;
      var last = sheet.getLastRow();
      if (last < DATA_START_ROW) return;
      var rows = sheet.getRange(DATA_START_ROW, 1, last - DATA_START_ROW + 1, 23).getValues();
      rows.forEach(function (r) {
        var taskNo = _s_(r[0]);
        var bizRef = _s_(r[3]);
        // D is primary. N sometimes mirrors it via formula on JOBS IN QUEUE
        // before D itself is filled in (confirmed live 2026-08-20 -- a ref
        // can sit in N with D still blank).
        // W is the third ref column. M is NOT a ref: it is the glass-list
        // checkbox (Angus, 2026-10-05) - using it gave jobs with a blank D
        // the ref "false"/"true", which then matched unticked rows.
        var nRef = _s_(r[13]);
        var wRef = _s_(r[22]);
        var effectiveRef = bizRef || nRef || wRef;
        var customer = _s_(r[4]);
        if (!taskNo && !effectiveRef) return;
        if (taskNo.toUpperCase().indexOf('REF') !== -1 || effectiveRef.toUpperCase().indexOf('BIZMAN') !== -1 || !customer) return;
        if (!all && taskNo.toUpperCase() !== q && _u_(bizRef) !== q && _u_(nRef) !== q && _u_(wRef) !== q) return;
        jobs.push({
          task_no: taskNo, biz_ref: effectiveRef, customer: customer,
          install_date: _date_(r[1], tz), send_to_dash: _s_(r[2]), colour: _s_(r[5]),
          qty_windows: _num_(r[6]), qty_hinged: _num_(r[7]), qty_folding: _num_(r[8]),
          qty_palace: _num_(r[9]), qty_specials: _num_(r[10]), qty_elite: _num_(r[11]),
          glasslist: String(r[12]).toUpperCase() === 'TRUE' ? 1 : 0,
          s1: _u_(r[14]), s2: _u_(r[15]), s3: _u_(r[16]), s4: _u_(r[17]),
          s5: _u_(r[18]), s6: _u_(r[19]), s7: _u_(r[20]), job_status: _u_(r[21]),
          source_tab: tab,
        });
      });
    });
    return _json_({ ok: true, jobs: jobs });
  } catch (err) {
    return _json_({ ok: false, error: String(err) });
  }
}

function _setup_() {
  var sheet = _issueSheet_();
  return _json_({
    ok: true,
    issue_log: sheet.getName(),
    headers: ISSUE_LOG_HEADERS,
    capabilities: CAPABILITIES,
  });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (!_tokenOk_(body.token)) return _json_({ ok: false, error: 'bad token' });

    if (body.action === 'issue_log') return _appendIssue_(body);
    if (body.action === 'repick_done') return _completeRepick_(body);
    return _writeStationUpdate_(body);
  } catch (err) {
    return _json_({ ok: false, error: String(err) });
  }
}

function _writeStationUpdate_(body) {
  var updates = body.updates || {};
  var cells = [], wrote = [];
  Object.keys(updates).forEach(function (field) {
    var col = COL[field];
    if (col) { cells.push({ col: col, value: _u_(updates[field]) }); wrote.push(field); }
  });
  var at = _writeVerified_(body.tab, body.task_no, body.biz_ref, cells);
  if (at.error) return _json_({ ok: false, error: at.error });
  return _json_({ ok: true, row: at.row, tab: at.tab, wrote: wrote });
}

function _appendIssue_(body) {
  var bizRef = _u_(body.biz_ref);
  var station = Number(body.station);
  var unit = _u_(body.unit);
  var issue = _s_(body.issue);
  var cycle = Number(body.cycle);
  if (!bizRef || station < 1 || station > 8 || !unit || !issue || !cycle) {
    return _json_({ ok: false, error: 'invalid issue_log payload' });
  }

  var found = _locate_(body.tab, body.task_no, bizRef);
  if (found.error) return _json_({ ok: false, error: found.error });

  // FACTORY TERMINAL is standalone, so getDocumentLock() returns null.
  // A script lock safely serialises concurrent web-app issue submissions.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return _json_({ ok: false, error: 'issue log busy; retry' });
  try {
    var sheet = _issueSheet_();
    var row = _findIssueRow_(sheet, bizRef, unit, cycle);
    if (row < 0) {
      var date = new Date(body.date || new Date());
      if (isNaN(date.getTime())) date = new Date();
      sheet.appendRow([
        date, _plain_(bizRef), 'Station ' + station, _plain_(body.operator), _plain_(unit),
        _plain_(issue), _plain_(body.material), false, cycle,
      ]);
      row = sheet.getLastRow();
      sheet.getRange(row, 8).insertCheckboxes().setValue(false);
      sheet.getRange(row, 1).setNumberFormat('dd/mm/yyyy hh:mm');
    }

    var repick = 'REPICK' + cycle;
    var cells = [], wrote = [];
    // Stations 1–7 have their own sheet columns. Station 8 (Bead Saw) uses
    // Job Status for normal work, but REDO must only notify Despatch via REPICK.
    if (station !== 3 && station <= 7) {
      cells.push({ col: COL['s' + station], value: 'REDO' });
      wrote.push('s' + station);
    }
    cells.push({ col: COL.s3, value: repick });
    wrote.push('s3');
    var at = _writeVerified_(body.tab, body.task_no, bizRef, cells);
    if (at.error) return _json_({ ok: false, error: at.error, row: row });
    return _json_({ ok: true, row: row, planner_row: at.row, planner_tab: at.tab, cycle: cycle, wrote: wrote });
  } finally {
    lock.releaseLock();
  }
}

function _findIssueRow_(sheet, bizRef, unit, cycle) {
  if (sheet.getLastRow() < 2) return -1;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (_u_(rows[i][1]) === bizRef && _u_(rows[i][4]) === unit && Number(rows[i][8]) === cycle) return i + 2;
  }
  return -1;
}

function _completeRepick_(body) {
  var cycle = Number(body.cycle);
  if (!cycle || cycle < 1) return _json_({ ok: false, error: 'invalid cycle' });
  var at = _writeVerified_(body.tab, body.task_no, body.biz_ref, [{ col: COL.s3, value: 'REDONE' + cycle }]);
  if (at.error) return _json_({ ok: false, error: at.error });
  _markIssueDone_(_u_(body.biz_ref), _u_(body.unit), cycle);
  return _json_({ ok: true, row: at.row, tab: at.tab, wrote: ['s3'] });
}

function installIssueLogTrigger() {
  var ss = _ss_();
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'handleIssueLogEdit') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('handleIssueLogEdit').forSpreadsheet(ss).onEdit().create();
}

function handleIssueLogEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() !== ISSUE_LOG_NAME || e.range.getRow() < 2 || e.range.getColumn() !== 8) return;
  if (String(e.value).toUpperCase() !== 'TRUE') return;

  var row = e.range.getRow();
  var values = sheet.getRange(row, 1, 1, 9).getValues()[0];
  var bizRef = _u_(values[1]);
  var cycle = Number(values[8]);
  try {
    if (!bizRef || !cycle) throw new Error('Issue row is missing Biz Ref or Cycle');
    var wrote = _writeRedoneAcrossPlanner_(bizRef, cycle);
    if (!wrote.length) throw new Error('No planner row found for ' + bizRef);
    e.range.setNote('Station 3 updated to REDONE' + cycle + ' on: ' + wrote.join(', '));
  } catch (err) {
    e.range.setValue(false).setNote('Not completed: ' + String(err));
    throw err;
  }
}

function _writeRedoneAcrossPlanner_(bizRef, cycle) {
  var wrote = [];
  _ss_().getSheets().forEach(function (sheet) {
    if (!_isPlannerTab_(sheet.getName())) return;
    var last = sheet.getLastRow();
    if (last < DATA_START_ROW) return;
    // Same D/N/W fallback as _findRow_ -- a ref checked off in ISSUE LOG
    // still needs to resolve even if this row's D is blank.
    var refs = sheet.getRange(DATA_START_ROW, 1, last - DATA_START_ROW + 1, 23).getValues();
    refs.forEach(function (row, i) {
      if (_u_(row[3]) === bizRef || _u_(row[13]) === bizRef || _u_(row[22]) === bizRef) {
        sheet.getRange(DATA_START_ROW + i, COL.s3).setValue('REDONE' + cycle);
        wrote.push(sheet.getName() + ' R' + (DATA_START_ROW + i));
      }
    });
  });
  return wrote;
}

function _markIssueDone_(bizRef, unit, cycle) {
  var sheet = _ss_().getSheetByName(ISSUE_LOG_NAME);
  if (!sheet || sheet.getLastRow() < 2) return;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
  rows.forEach(function (r, i) {
    if (_u_(r[1]) === bizRef && _u_(r[4]) === unit && Number(r[8]) === cycle) {
      sheet.getRange(i + 2, 8).insertCheckboxes().setValue(true);
    }
  });
}

function _issueSheet_() {
  var ss = _ss_();
  var sheet = ss.getSheetByName(ISSUE_LOG_NAME);
  if (!sheet) sheet = ss.insertSheet(ISSUE_LOG_NAME);
  var current = sheet.getRange(1, 1, 1, ISSUE_LOG_HEADERS.length).getValues()[0];
  var empty = current.every(function (v) { return !_s_(v); });
  if (empty) {
    sheet.getRange(1, 1, 1, ISSUE_LOG_HEADERS.length).setValues([ISSUE_LOG_HEADERS]);
    sheet.setFrozenRows(1);
  } else if (current.join('|') !== ISSUE_LOG_HEADERS.join('|')) {
    throw new Error('ISSUE LOG headers do not match bridge v2');
  }
  return sheet;
}

// Planner Tools > Send marked jobs (bound project) moves whole job rows between
// planner tabs. A tablet's cached tab can then be stale for ~10 min, and a move
// can land between this script's row lookup and its write. LockService only
// serialises one project, so the bridge looks a job up in the cached tab first,
// then BY TASK NUMBER across every planner tab, and only then falls back to the
// Bizman ref in the cached tab (the original behaviour). After writing it
// re-reads column A; if the row no longer holds the task, the cells it wrote into
// the now-blank row are cleared and the write is made once more at the job's
// new location. (2026-10-26, for Production Send.)
function _locate_(tab, taskNo, bizRef) {
  var ss = _ss_();
  var task = _s_(taskNo);
  var cached = ss.getSheetByName(tab);
  if (cached && task) {
    var r = _findTaskRow_(cached, task);
    if (r > 0) return { sheet: cached, row: r, by: 'task' };
  }
  if (task) {
    var sheets = ss.getSheets();
    for (var k = 0; k < sheets.length; k++) {
      var name = sheets[k].getName();
      if (name === tab || !_isPlannerTab_(name)) continue;
      var moved = _findTaskRow_(sheets[k], task);
      if (moved > 0) return { sheet: sheets[k], row: moved, by: 'task' };
    }
  }
  if (!cached) return { error: 'no tab: ' + tab };
  var byRef = _findRow_(cached, '', bizRef);
  return byRef > 0 ? { sheet: cached, row: byRef, by: 'ref' } : { error: 'row not found' };
}

function _findTaskRow_(sheet, task) {
  var last = sheet.getLastRow();
  if (last < DATA_START_ROW) return -1;
  var ids = sheet.getRange(DATA_START_ROW, 1, last - DATA_START_ROW + 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (_s_(ids[i][0]) === task) return DATA_START_ROW + i;
  return -1;
}

// Verify with the key that found the row: column A for a task match, the D/N/W
// Bizman ref for a ref match.
function _stillHolds_(at, task, ref) {
  var v = at.sheet.getRange(at.row, 1, 1, 23).getValues()[0];
  if (at.by === 'task') return _s_(v[0]) === task ? 'yes' : (_s_(v[0]) ? 'other' : 'blank');
  if (_u_(v[3]) === ref || _u_(v[13]) === ref || _u_(v[22]) === ref) return 'yes';
  return v.some(function (x) { return _s_(x); }) ? 'other' : 'blank';
}

function _writeVerified_(tab, taskNo, bizRef, cells) {
  var task = _s_(taskNo), ref = _u_(bizRef);
  for (var attempt = 0; attempt < 2; attempt++) {
    var at = _locate_(tab, taskNo, bizRef);
    if (at.error) return at;
    cells.forEach(function (c) { at.sheet.getRange(at.row, c.col).setValue(c.value); });
    var state = _stillHolds_(at, task, ref);
    if (state === 'yes') return { row: at.row, tab: at.sheet.getName() };
    if (state === 'other') return { error: 'row changed during write (' + at.sheet.getName() + ' R' + at.row + '); check before retry' };
    // The row was emptied by a move mid-write: undo our stray values, then find the job again.
    cells.forEach(function (c) { at.sheet.getRange(at.row, c.col).setValue(''); });
  }
  return { error: 'job moved twice during the write; retry' };
}

function _findRow_(sheet, taskNo, bizRef) {
  var last = sheet.getLastRow();
  var count = last - DATA_START_ROW + 1;
  if (count < 1) return -1;
  var task = _s_(taskNo), ref = _u_(bizRef);
  // Same D/N/W fallback as doGet's job listing -- see the comment there.
  var keys = sheet.getRange(DATA_START_ROW, 1, count, 23).getValues();
  // Task number wins over the whole tab before any ref is tried, so a ref
  // match on an earlier row can never take a write meant for this task.
  for (var i = 0; i < keys.length; i++) {
    if (task && _s_(keys[i][0]) === task) return DATA_START_ROW + i;
  }
  for (var j = 0; j < keys.length; j++) {
    if (ref && (_u_(keys[j][3]) === ref || _u_(keys[j][13]) === ref || _u_(keys[j][22]) === ref)) {
      return DATA_START_ROW + j;
    }
  }
  return -1;
}

function _isPlannerTab_(name) { return MONTH_TAB.test(name) || name === 'JOBS IN QUEUE'; }
function _tokenOk_(provided) {
  var token = PropertiesService.getScriptProperties().getProperty('PLANNER_TOKEN');
  return Boolean(token && provided === token);
}
function _plain_(value) {
  var s = _s_(value);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function _s_(v) { return v == null ? '' : String(v).trim(); }
function _u_(v) { return _s_(v).toUpperCase(); }
function _num_(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
function _date_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var match = _s_(v).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}
function _json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
