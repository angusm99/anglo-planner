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
  assert.throws(() => cleanRedoInput({ jobId: 1, station: 8, unit: "D1", issue: "x" }), /Stations 1 to 7/);
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

test("completion uses numbered REDONE", () => {
  assert.strictEqual(cycleLabel("REPICK", 3), "REPICK3");
  assert.deepStrictEqual(redoneChanges(3), { s3: "REDONE3" });
  assert.throws(() => redoneChanges(0), /Invalid REDO cycle/);
});
