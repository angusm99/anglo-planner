"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { STATIONS, applyCascade } = require("../src/cascade");

const blank = { s1: "", s2: "", s3: "", s4: "", s5: "", s6: "", s7: "", job_status: "" };

test("S1 DONE sends cutting list to material control", () => {
  const c = applyCascade(blank, 1, "DONE");
  assert.deepStrictEqual(c, { s1: "DONE", s2: "RECEIVED CL" });
});

test("S1 CHANGES propagates CHANGES", () => {
  const c = applyCascade(blank, 1, "CHANGES");
  assert.deepStrictEqual(c, { s1: "CHANGES", s2: "CHANGES" });
});

test("S2 RECEIVED CL schedules despatch", () => {
  const c = applyCascade(blank, 2, "RECEIVED CL");
  assert.deepStrictEqual(c, { s2: "RECEIVED CL", s3: "SCHEDULED" });
});

test("S3 DONE marks both saws picked", () => {
  const c = applyCascade(blank, 3, "DONE");
  assert.deepStrictEqual(c, { s3: "DONE", s4: "JOB PICKED", s5: "JOB PICKED" });
});

test("S3 PICK SHORT flags saw 1 short", () => {
  const c = applyCascade(blank, 3, "PICK SHORT");
  assert.deepStrictEqual(c, { s3: "PICK SHORT", s4: "PICK SHORT" });
});

test("S4 DONE closes trolley pick, schedules assembly+glass, backfills planning", () => {
  const job = { ...blank, s1: "", s3: "PICK TROLLEY", s6: "QUEUED", s7: "QUEUE OUT" };
  const c = applyCascade(job, 4, "DONE");
  assert.deepStrictEqual(c, {
    s4: "DONE", s3: "DONE", s6: "SCHEDULED", s7: "SCHEDULED", s1: "DONE-NO PW",
  });
});

test("S4 DONE does not touch settled S1 or busy S6/S7", () => {
  const job = { ...blank, s1: "DONE", s3: "SASH PICKED", s6: "WINDOWS DONE", s7: "DONE" };
  const c = applyCascade(job, 4, "DONE");
  assert.deepStrictEqual(c, { s4: "DONE" });
});

test("S6 WINDOWS DONE with queued status sets FRAMES-WINDOW", () => {
  const job = { ...blank, s1: "DONE", job_status: "QUEUED" };
  const c = applyCascade(job, 6, "WINDOWS DONE");
  assert.deepStrictEqual(c, { s6: "WINDOWS DONE", job_status: "FRAMES-WINDOW" });
});

test("S6 frame done over BEADS DONE combines to FRAMES+BEADS", () => {
  const job = { ...blank, s1: "DONE", job_status: "BEADS DONE" };
  const c = applyCascade(job, 6, "S-FRONT DONE");
  assert.deepStrictEqual(c, { s6: "S-FRONT DONE", job_status: "FRAMES+BEADS" });
});

test("S6 guard: never overwrites combined job status", () => {
  const job = { ...blank, s1: "DONE", job_status: "FRAMES+GLASS" };
  const c = applyCascade(job, 6, "WINDOWS DONE");
  assert.deepStrictEqual(c, { s6: "WINDOWS DONE" });
});

test("S7 DONE with assembly ALL DONE and beads gives ALL READY", () => {
  const job = { ...blank, s1: "DONE", s6: "ALL DONE", job_status: "FRAMES+BEADS" };
  const c = applyCascade(job, 7, "DONE");
  assert.deepStrictEqual(c, { s7: "DONE", job_status: "ALL READY" });
});

test("S7 DONE with assembly ALL DONE but plain status gives GLASS READY", () => {
  const job = { ...blank, s1: "DONE", s6: "ALL DONE", job_status: "QUEUED" };
  const c = applyCascade(job, 7, "DONE");
  assert.deepStrictEqual(c, { s7: "DONE", job_status: "GLASS READY" });
});

test("S7 DELIVERED over BEADS DONE gives BEADS+GLASS", () => {
  const job = { ...blank, s1: "DONE", job_status: "BEADS DONE" };
  const c = applyCascade(job, 7, "DELIVERED");
  assert.deepStrictEqual(c, { s7: "DELIVERED", job_status: "BEADS+GLASS" });
});

test("S7 glass done leaves FRAMES+GLASS unchanged", () => {
  const job = { ...blank, s1: "DONE", job_status: "FRAMES+GLASS" };
  const c = applyCascade(job, 7, "FRAMES ONLY");
  assert.deepStrictEqual(c, { s7: "FRAMES ONLY" });
});

test("S7 informational statuses never trigger glass completion", () => {
  for (const value of ["FRAMES ONLY", "FRAMELESS", "CNC-DG READY"]) {
    assert.deepStrictEqual(applyCascade(blank, 7, value), { s7: value });
  }
});

test("S7 completion statuses still trigger the glass cascade", () => {
  for (const value of ["DONE", "SLATTED UNITS", "DELIVERED"]) {
    assert.deepStrictEqual(applyCascade({ ...blank, s1: "DONE" }, 7, value), {
      s7: value, job_status: "GLASS READY",
    });
  }
});

test("S8 exposes exactly the approved Bead Saw choices", () => {
  assert.deepStrictEqual(STATIONS[8].buttons, ["DONE", "BEAD SHORT", "NOT PICKED"]);
  assert.strictEqual(STATIONS[8].key, "job_status");
  assert.strictEqual(STATIONS[8].responsible, "Kerabo");
});

test("S8 DONE writes only the Job Status field as beads complete", () => {
  const c = applyCascade(blank, 8, "DONE");
  assert.deepStrictEqual(c, { job_status: "BEADS DONE" });
  assert.ok(!Object.keys(c).some((key) => /^s[1-7]$/.test(key)));
});

test("S8 short and not-picked choices write directly to Job Status", () => {
  assert.deepStrictEqual(applyCascade(blank, 8, "BEAD SHORT"), { job_status: "BEAD SHORT" });
  assert.deepStrictEqual(applyCascade(blank, 8, "NOT PICKED"), { job_status: "NOT PICKED" });
  assert.throws(() => applyCascade(blank, 8, "CHANGES"), /Invalid Bead Saw status/);
});

test("S8 DONE after frame completion combines to FRAMES+BEADS", () => {
  const job = { ...blank, job_status: "FRAMES-WINDOW" };
  assert.deepStrictEqual(applyCascade(job, 8, "DONE"), { job_status: "FRAMES+BEADS" });
});

test("S8 does not downgrade an already completed job", () => {
  const job = { ...blank, job_status: "DONE" };
  assert.deepStrictEqual(applyCascade(job, 8, "DONE"), { job_status: "DONE" });
});

test("S6 frame completion after S8 DONE combines to FRAMES+BEADS", () => {
  const beadChange = applyCascade(blank, 8, "DONE");
  const job = { ...blank, ...beadChange, s1: "DONE" };
  assert.deepStrictEqual(applyCascade(job, 6, "WINDOWS DONE"), {
    s6: "WINDOWS DONE", job_status: "FRAMES+BEADS",
  });
});

test("Stations 1 to 7 expose the approved revised status lists", () => {
  const expected = {
    1: ["QUEUED", "DONE", "RC-X", "CHANGES", "DONE-NO PW", "REDO"],
    2: ["QUEUED", "RECEIVED CL", "DONE", "W.O.D", "ALL DLVD", "MILL PREP", "DONE-NO PW", "CUTPLAN RUN", "0", "REDO"],
    3: ["QUEUED", "DONE", "0", "SCHEDULED", "PICK SHORT", "DEFECT-M", "DONE-NO PW", "ALLOCATED", "SASH PICKED", "SASH SHORT", "REDO"],
    4: ["QUEUED", "DONE", "0", "REDO", "JOB PICKED", "PICK SHORT", "DEFECT", "DONE-NO PW", "W.I.P", "CUT-SHORT", "PICK TROLLEY"],
    5: ["QUEUED", "DONE", "0", "REDO", "SCHEDULED", "JOB PICKED", "W.I.P", "DEFECT-M", "DONE-NO PW", "PICK SHORT", "PICK TROLLEY"],
    6: ["QUEUED", "ALL DONE", "0", "SCHEDULED", "JOB PICKED", "W.I.P", "DONE-NO PW", "WINDOWS DONE", "S-FRONT DONE", "SLIDERS DONE", "REDO"],
    7: ["QUEUE OUT", "QUEUE IN", "DONE", "REDO", "0", "W.I.P", "ORDER DUE", "DONE-NO PW", "SCHEDULED", "FRAMELESS", "CNC-DG READY", "SLATTED UNITS", "DELIVERED", "FRAMES ONLY"],
  };
  for (let station = 1; station <= 7; station++) assert.deepStrictEqual(STATIONS[station].buttons, expected[station]);
});

test("REDO on Stations 1 to 7 is flagged and never cascades", () => {
  for (let station = 1; station <= 7; station++) {
    assert.deepStrictEqual(applyCascade(blank, station, "REDO"), {
      [STATIONS[station].key]: "REDO", _redo: true,
    });
  }
});

test("unsupported station statuses are rejected", () => {
  assert.throws(() => applyCascade(blank, 1, "BEAD SHORT"), /Invalid status/);
});
