"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { buildPayload, buildIssuePayload, buildRepickDonePayload } = require("../src/sheet");

test("maps changed station fields to sheet updates", () => {
  const job = { source_tab: "MAY-2026", task_no: "526889", biz_ref: "D1738" };
  const applied = [
    { field: "s4", from: "", to: "JOB PICKED" },
    { field: "s3", from: "SCHEDULED", to: "DONE" },
  ];
  const p = buildPayload(job, applied);
  assert.deepStrictEqual(p.updates, { s4: "JOB PICKED", s3: "DONE" });
  assert.strictEqual(p.tab, "MAY-2026");
  assert.strictEqual(p.task_no, "526889");
});

test("maps Bead Saw completion to the existing Job Status sheet field", () => {
  const job = { source_tab: "MAY-2026", task_no: "526889", biz_ref: "D1738" };
  const payload = buildPayload(job, [{ field: "job_status", from: "", to: "BEADS DONE" }]);
  assert.deepStrictEqual(payload.updates, { job_status: "BEADS DONE" });
  assert.ok(!Object.keys(payload.updates).some((key) => /^s[1-7]$/.test(key)));
});

test("skips office-created jobs (they have no sheet row)", () => {
  const job = { source_tab: "OFFICE", task_no: "", biz_ref: "D9001" };
  assert.strictEqual(buildPayload(job, [{ field: "s1", to: "DONE" }]), null);
});

test("skips when nothing pushable changed", () => {
  const job = { source_tab: "MAY-2026", task_no: "1", biz_ref: "D1" };
  assert.strictEqual(buildPayload(job, [{ field: "customer", to: "X" }]), null);
});

test("builds the ISSUE LOG bridge payload without secrets", () => {
  const payload = buildIssuePayload({
    source_tab: "AUGUST-2026", task_no: "123",
    biz_ref: "D1738", station: 4, operator: "Mimmy", unit: "D1",
    issue: "Scratch", material: "Profile", cycle: 2, created_at: "2026-08-19T10:00:00.000Z",
  });
  assert.deepStrictEqual(payload, {
    action: "issue_log", tab: "AUGUST-2026", task_no: "123",
    date: "2026-08-19T10:00:00.000Z", biz_ref: "D1738",
    station: 4, operator: "Mimmy", unit: "D1", issue: "Scratch",
    material: "Profile", cycle: 2,
  });
  assert.ok(!("token" in payload));
});

test("does not build ISSUE LOG payloads for office-only jobs", () => {
  assert.strictEqual(buildIssuePayload({
    source_tab: "OFFICE", biz_ref: "D1", station: 1, unit: "D1", issue: "x", cycle: 1,
  }), null);
});

test("builds numbered repick completion for the correct source row", () => {
  const payload = buildRepickDonePayload(
    { source_tab: "AUGUST-2026", task_no: "123", biz_ref: "D1738" },
    { unit: "D1", cycle: 2 },
  );
  assert.deepStrictEqual(payload, {
    action: "repick_done", tab: "AUGUST-2026", task_no: "123",
    biz_ref: "D1738", unit: "D1", cycle: 2,
  });
});

test("does not build REDONE payloads for office-only jobs", () => {
  assert.strictEqual(buildRepickDonePayload({ source_tab: "OFFICE" }, { cycle: 1 }), null);
});
