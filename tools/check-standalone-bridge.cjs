'use strict';
// Regression check for the standalone FACTORY TERMINAL bridge (2026-10-26).
//   node tools/check-standalone-bridge.cjs [tools/standalone-tablet-bridge.gs]
// Runs the REAL bridge functions against in-memory sheets. Planner Tools >
// Send marked jobs moves job rows between tabs, so a tablet's cached tab can be
// stale and a move can land between the bridge's lookup and its write.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const file = process.argv[2] || path.join(__dirname, 'standalone-tablet-bridge.gs');
const START = 4;

function makeSheet(name, rows) {          // rows: { rowNumber: [A, B, C, D ...] }
  const data = {};
  Object.entries(rows).forEach(([r, v]) => { data[r] = v.slice(); });
  const sheet = {
    name, data, onSet: null,
    getName: () => name,
    getLastRow: () => Math.max(START - 1, ...Object.keys(data).map(Number)),
    getRange(r, c, n = 1, w = 1) {
      return {
        getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: w }, (_, j) => ((data[r + i] || [])[c - 1 + j] ?? ''))),
        getValue: () => ((data[r] || [])[c - 1] ?? ''),
        setValue: (v) => {
          if (sheet.onSet) { const f = sheet.onSet; sheet.onSet = null; f(); }   // simulate a move landing mid-write
          (data[r] = data[r] || [])[c - 1] = v;
        },
      };
    },
  };
  return sheet;
}

function load(sheets) {
  const ctx = vm.createContext({
    SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => sheets.find((s) => s.name === n) || null, getSheets: () => sheets }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'x' }) },
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t), MimeType: {} }), MimeType: { JSON: 'json' } },
    Utilities: { formatDate: (d) => String(d) },
    Session: { getScriptTimeZone: () => 'Africa/Johannesburg' },
    console,
  });
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: path.basename(file) });
  return ctx;
}
const S2 = 16; // station 2 column P
const row = (task, ref) => [task, '02/11/2026', 'QUEUED', ref, 'Customer ' + task];
const run = (ctx, body) => JSON.parse(JSON.stringify(ctx._writeStationUpdate_(Object.assign({ updates: { s2: 'done' } }, body))));

const results = [];
function check(name, fn) { try { fn(); results.push('ok   ' + name); } catch (e) { results.push('FAIL ' + name + ' - ' + e.message); } }

check('normal write lands on the cached-tab row', () => {
  const q = makeSheet('JOBS IN QUEUE', { 5: row('551529', 'D2848') });
  const out = run(load([q]), { tab: 'JOBS IN QUEUE', task_no: '551529', biz_ref: 'D2848' });
  assert.ok(out.ok, JSON.stringify(out)); assert.strictEqual(q.data[5][S2 - 1], 'DONE');
});

check('stale cached tab: a moved job is found by task number in its new month tab', () => {
  const q = makeSheet('JOBS IN QUEUE', { 5: [] });
  const nov = makeSheet('NOVEMBER-2026', { 4: row('551529', 'D2848') });
  const out = run(load([q, nov]), { tab: 'JOBS IN QUEUE', task_no: '551529', biz_ref: 'D2848' });
  assert.ok(out.ok, JSON.stringify(out));
  assert.strictEqual(nov.data[4][S2 - 1], 'DONE'); assert.strictEqual(out.tab, 'NOVEMBER-2026');
  assert.ok(!(q.data[5] || [])[S2 - 1], 'nothing written into the blank queue row');
});

check('a move landing between lookup and write: blank-row write is undone and re-made at the new row', () => {
  const q = makeSheet('JOBS IN QUEUE', { 5: row('551529', 'D2848') });
  const nov = makeSheet('NOVEMBER-2026', {});
  q.onSet = () => { nov.data[4] = q.data[5].slice(); q.data[5] = []; };   // native cutPaste mid-write
  const out = run(load([q, nov]), { tab: 'JOBS IN QUEUE', task_no: '551529', biz_ref: 'D2848' });
  assert.ok(out.ok, JSON.stringify(out));
  assert.strictEqual(nov.data[4][S2 - 1], 'DONE', 'update reached the moved job');
  assert.ok(!(q.data[5] || [])[S2 - 1], 'stray value cleared from the blank source row');
});

check('original Bizman-ref fallback still works when the task number is nowhere', () => {
  const q = makeSheet('JOBS IN QUEUE', { 6: ['', '', '', 'D3000', 'Ref-only row'] });
  const out = run(load([q]), { tab: 'JOBS IN QUEUE', task_no: '999999', biz_ref: 'D3000' });
  assert.ok(out.ok, JSON.stringify(out)); assert.strictEqual(q.data[6][S2 - 1], 'DONE');
});

check('task number elsewhere beats a ref match in the cached tab (no wrong-row write)', () => {
  const q = makeSheet('JOBS IN QUEUE', { 6: ['777777', '', '', 'D2848', 'Different job, same ref'] });
  const nov = makeSheet('NOVEMBER-2026', { 4: row('551529', 'D2848') });
  const out = run(load([q, nov]), { tab: 'JOBS IN QUEUE', task_no: '551529', biz_ref: 'D2848' });
  assert.ok(out.ok); assert.strictEqual(nov.data[4][S2 - 1], 'DONE'); assert.ok(!q.data[6][S2 - 1]);
});

check('non-planner tabs are never written', () => {
  const q = makeSheet('JOBS IN QUEUE', {});
  const mp = makeSheet('MATERIAL PLANNER', { 4: row('551529', 'D2848') });
  const out = run(load([q, mp]), { tab: 'JOBS IN QUEUE', task_no: '551529', biz_ref: 'ZZZ' });
  assert.ok(!out.ok); assert.strictEqual(out.error, 'row not found'); assert.ok(!mp.data[4][S2 - 1]);
});

check('missing job reports row not found', () => {
  const out = run(load([makeSheet('JOBS IN QUEUE', {})]), { tab: 'JOBS IN QUEUE', task_no: '1', biz_ref: 'X' });
  assert.strictEqual(out.ok, false); assert.strictEqual(out.error, 'row not found');
});

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(failed ? `${failed} FAILED` : `PASS - ${results.length} bridge checks`);
process.exit(failed ? 1 : 0);
