"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { cleanRedoInput, cycleLabel, redoChanges, redoneChanges } = require("../src/redo");

test("cleans and validates a REDO report", () => {
  assert.deepStrictEqual(cleanRedoInput({
    jobId: 12, station: 4, actor: "  Guest User ", unit: " d1 ",
    issue: "  profile scratched ", material: "  1 x profile ",
  }), {
    jobId: 12, station: 4, actor: "Guest User", unit: "D1",
    issue: "profile scratched", material: "1 x profile",
  });
});

test("requires a valid station, unit, issue, and job", () => {
  assert.throws(() => cleanRedoInput({ jobId: 1, station: 9, unit: "D1", issue: "x" }), /Stations 1 to 8/);
  assert.throws(() => cleanRedoInput({ jobId: 1, station: 0, unit: "D1", issue: "x" }), /Stations 1 to 8/);
  assert.throws(() => cleanRedoInput({ jobId: 0, station: 1, unit: "D1", issue: "x" }), /jobId/);
  assert.throws(() => cleanRedoInput({ jobId: 1, station: 1, unit: "", issue: "x" }), /unit/);
  assert.throws(() => cleanRedoInput({ jobId: 1, station: 1, unit: "D1", issue: "" }), /description/);
});

test("REDO writes its origin plus numbered REPICK", () => {
  assert.deepStrictEqual(redoChanges(4, 2), { s4: "REDO", s3: "REPICK2" });
});

test("Station 3 REDO writes REPICK directly and never plain DONE", () => {
  assert.deepStrictEqual(redoChanges(3, 1), { s3: "REPICK1" });
});

test("Station 8 (Bead Saw) REDO writes REPICK only, never touches Job Status", () => {
  const changes = redoChanges(8, 1);
  assert.deepStrictEqual(changes, { s3: "REPICK1" });
  assert.ok(!("job_status" in changes));
});

test("cleanRedoInput accepts Station 8 with a default actor of Kerabo", () => {
  const input = cleanRedoInput({ jobId: 5, station: 8, unit: "D1", issue: "Bead scratched" });
  assert.strictEqual(input.station, 8);
  assert.strictEqual(input.actor, "Kerabo");
});

test("completion uses numbered REDONE", () => {
  assert.strictEqual(cycleLabel("REPICK", 3), "REPICK3");
  assert.deepStrictEqual(redoneChanges(3), { s3: "REDONE3" });
  assert.throws(() => redoneChanges(0), /Invalid REDO cycle/);
});
