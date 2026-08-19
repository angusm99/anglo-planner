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
