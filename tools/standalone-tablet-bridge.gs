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

var DATA_START_ROW = 4;
var COL = { s1: 15, s2: 16, s3: 17, s4: 18, s5: 19, s6: 20, s7: 21, job_status: 22 };
var MONTH_TAB = /^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)-\d{4}$/;
var ISSUE_LOG_NAME = 'ISSUE LOG';
var ISSUE_LOG_HEADERS = ['Date', 'Biz Ref', 'Station', 'Operator', 'Unit', 'Issue', 'Material', 'Repick Done', 'Cycle'];
var CAPABILITIES = ['station_update', 'issue_log', 'repick_done'];

function doGet(e) {
  try {
    if (!_tokenOk_(e.parameter.token)) return _json_({ ok: false, error: 'bad token' });
    if (e.parameter.capabilities === '1') return _json_({ ok: true, capabilities: CAPABILITIES });
    if (e.parameter.setup === '1') return _setup_();

    var q = _u_(e.parameter.ref);
    var all = e.parameter.all === '1';
    if (!q && !all) return _json_({ ok: false, error: 'ref or all=1 required' });

    var ss = SpreadsheetApp.getActive();
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
        // can sit in N with D still blank). W checked defensively too, per
        // an older, never-verified note flagging it as a possible 3rd ref
        // slot -- exact-match only, so a wrong guess here can't misfire.
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
  var sheet = SpreadsheetApp.getActive().getSheetByName(body.tab);
  if (!sheet) return _json_({ ok: false, error: 'no tab: ' + body.tab });
  var row = _findRow_(sheet, body.task_no, body.biz_ref);
  if (row < 0) return _json_({ ok: false, error: 'row not found' });

  var updates = body.updates || {};
  var wrote = [];
  Object.keys(updates).forEach(function (field) {
    var col = COL[field];
    if (col) {
      sheet.getRange(row, col).setValue(_u_(updates[field]));
      wrote.push(field);
    }
  });
  return _json_({ ok: true, row: row, wrote: wrote });
}

function _appendIssue_(body) {
  var bizRef = _u_(body.biz_ref);
  var station = Number(body.station);
  var unit = _u_(body.unit);
  var issue = _s_(body.issue);
  var cycle = Number(body.cycle);
  if (!bizRef || station < 1 || station > 7 || !unit || !issue || !cycle) {
    return _json_({ ok: false, error: 'invalid issue_log payload' });
  }

  var planner = SpreadsheetApp.getActive().getSheetByName(body.tab);
  if (!planner) return _json_({ ok: false, error: 'no tab: ' + body.tab });
  var plannerRow = _findRow_(planner, body.task_no, bizRef);
  if (plannerRow < 0) return _json_({ ok: false, error: 'row not found' });

  var lock = LockService.getDocumentLock();
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
    var wrote = [];
    if (station !== 3) {
      planner.getRange(plannerRow, COL['s' + station]).setValue('REDO');
      wrote.push('s' + station);
    }
    planner.getRange(plannerRow, COL.s3).setValue(repick);
    wrote.push('s3');
    return _json_({ ok: true, row: row, planner_row: plannerRow, cycle: cycle, wrote: wrote });
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
  var sheet = SpreadsheetApp.getActive().getSheetByName(body.tab);
  if (!sheet) return _json_({ ok: false, error: 'no tab: ' + body.tab });
  var row = _findRow_(sheet, body.task_no, body.biz_ref);
  if (row < 0) return _json_({ ok: false, error: 'row not found' });
  sheet.getRange(row, COL.s3).setValue('REDONE' + cycle);
  _markIssueDone_(_u_(body.biz_ref), _u_(body.unit), cycle);
  return _json_({ ok: true, row: row, wrote: ['s3'] });
}

function installIssueLogTrigger() {
  var ss = SpreadsheetApp.getActive();
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
  SpreadsheetApp.getActive().getSheets().forEach(function (sheet) {
    if (!_isPlannerTab_(sheet.getName())) return;
    var last = sheet.getLastRow();
    if (last < DATA_START_ROW) return;
    var refs = sheet.getRange(DATA_START_ROW, 4, last - DATA_START_ROW + 1, 1).getValues();
    refs.forEach(function (cell, i) {
      if (_u_(cell[0]) === bizRef) {
        sheet.getRange(DATA_START_ROW + i, COL.s3).setValue('REDONE' + cycle);
        wrote.push(sheet.getName() + ' R' + (DATA_START_ROW + i));
      }
    });
  });
  return wrote;
}

function _markIssueDone_(bizRef, unit, cycle) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(ISSUE_LOG_NAME);
  if (!sheet || sheet.getLastRow() < 2) return;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
  rows.forEach(function (r, i) {
    if (_u_(r[1]) === bizRef && _u_(r[4]) === unit && Number(r[8]) === cycle) {
      sheet.getRange(i + 2, 8).insertCheckboxes().setValue(true);
    }
  });
}

function _issueSheet_() {
  var ss = SpreadsheetApp.getActive();
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

function _findRow_(sheet, taskNo, bizRef) {
  var last = sheet.getLastRow();
  var count = last - DATA_START_ROW + 1;
  if (count < 1) return -1;
  var task = _s_(taskNo), ref = _u_(bizRef);
  // Same D/N/W fallback as doGet's job listing -- see the comment there.
  var keys = sheet.getRange(DATA_START_ROW, 1, count, 23).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (task && _s_(keys[i][0]) === task) return DATA_START_ROW + i;
    if (ref && (_u_(keys[i][3]) === ref || _u_(keys[i][13]) === ref || _u_(keys[i][22]) === ref)) {
      return DATA_START_ROW + i;
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
