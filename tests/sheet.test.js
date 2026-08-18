"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { buildPayload } = require("../src/sheet");

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
