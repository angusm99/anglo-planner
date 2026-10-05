"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "tools", "standalone-tablet-bridge.gs"), "utf8");

test("bridge v2 contains the exact nine ISSUE LOG headers and actions", () => {
  for (const value of ["Date", "Biz Ref", "Station", "Operator", "Unit", "Issue", "Material", "Repick Done", "Cycle"]) {
    assert.match(source, new RegExp(`['\"]${value}['\"]`));
  }
  assert.match(source, /issue_log/);
  assert.match(source, /repick_done/);
  assert.match(source, /setup\s*===\s*['"]1['"]/);
  assert.match(source, /function\s+_setup_\s*\(\)\s*{/);
  assert.match(source, /var sheet = _issueSheet_\(\);/);
  assert.match(source, /_findIssueRow_/);
  assert.match(source, /planner\.getRange\(plannerRow, COL\.s3\)\.setValue\(repick\)/);
});

test("ISSUE LOG uses a named installable trigger, not a competing onEdit", () => {
  assert.match(source, /newTrigger\(['\"]handleIssueLogEdit['\"]\)/);
  assert.doesNotMatch(source, /function\s+onEdit\s*\(/);
});

test("standalone ISSUE LOG uses a script lock, never a document lock", () => {
  // getDocumentLock() returns null in this standalone web app, which caused
  // every live REDO submission to fail before ISSUE LOG could append a row.
  assert.match(source, /LockService\.getScriptLock\(\)/);
  assert.doesNotMatch(source, /LockService\.getDocumentLock\(\)/);
});

test("ISSUE LOG accepts Station 8 without trying to write a nonexistent s8 column", () => {
  assert.match(source, /station > 8/);
  assert.match(source, /station !== 3 && station <= 7/);
});

test("uses SpreadsheetApp.openById everywhere, never getActive", () => {
  // FACTORY TERMINAL is a standalone script (not bound to the sheet) --
  // getActive() has no "active" spreadsheet in a doGet/doPost web-app call
  // and returns null there, so every SpreadsheetApp call must go through
  // openById(SPREADSHEET_ID) instead. Can't be caught by running the code
  // (no real SpreadsheetApp in Node), only by checking it's not there.
  assert.doesNotMatch(source, /SpreadsheetApp\.getActive/);
  assert.match(source, /SPREADSHEET_ID\s*=\s*'111LJiZGBg8_HaT3ruWWx9RmY_UTheTUzFFYcCOj0Umw'/);
  assert.match(source, /function _ss_\(\)\s*{\s*return SpreadsheetApp\.openById\(SPREADSHEET_ID\);/);
});

test("ref lookup and row-finding check D, N and W, never the M glass-list checkbox", () => {
  // Confirmed live 2026-08-20: a ref can sit in column N on JOBS IN QUEUE
  // (index 13) with D still blank. M (index 12) is the glass-list checkbox
  // (Angus, 2026-10-05): reading it as a ref gave 14 jobs the ref "false"/
  // "true", which then matched every unticked row.
  assert.match(source, /getRange\(DATA_START_ROW, 1, last - DATA_START_ROW \+ 1, 23\)/);
  assert.match(source, /getRange\(DATA_START_ROW, 1, count, 23\)/);
  const findRow = source.slice(source.indexOf("function _findRow_"), source.indexOf("function _isPlannerTab_"));
  assert.match(findRow, /keys\[j\]\[3\]/);
  assert.match(findRow, /keys\[j\]\[13\]/);
  assert.match(findRow, /keys\[j\]\[22\]/);
  assert.doesNotMatch(source, /\[12\]\) ===|mRef/);
  assert.match(source, /glasslist: String\(r\[12\]\)/);
  // Task number is matched across the whole tab before any ref fallback.
  assert.ok(findRow.indexOf("keys[i][0]") < findRow.indexOf("keys[j][3]"));
});
