"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { applyCascade } = require("../src/cascade");

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
