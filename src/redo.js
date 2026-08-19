"use strict";

const { STATIONS, norm } = require("./cascade");

function text(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function cleanRedoInput(body) {
  const station = Number(body?.station);
  if (!Number.isInteger(station) || station < 1 || station > 7) {
    throw new Error("REDO is available only for Stations 1 to 7");
  }
  const jobId = Number(body?.jobId);
  if (!Number.isInteger(jobId) || jobId < 1) throw new Error("Valid jobId required");

  const unit = norm(text(body?.unit, 120));
  const issue = text(body?.issue, 2000);
  const material = text(body?.material, 2000);
  const actor = text(body?.actor, 120) || STATIONS[station].responsible;
  if (!unit) throw new Error("Affected unit is required");
  if (!issue) throw new Error("Issue description is required");
  return { jobId, station, unit, issue, material, actor };
}

function cycleLabel(prefix, cycle) {
  const n = Number(cycle);
  if (!Number.isInteger(n) || n < 1) throw new Error("Invalid REDO cycle");
  return `${prefix}${n}`;
}

function redoChanges(station, cycle) {
  const st = STATIONS[station];
  if (!st || station === 8) throw new Error("Invalid REDO station");
  const repick = cycleLabel("REPICK", cycle);
  return station === 3 ? { s3: repick } : { [st.key]: "REDO", s3: repick };
}

function redoneChanges(cycle) {
  return { s3: cycleLabel("REDONE", cycle) };
}

module.exports = { cleanRedoInput, cycleLabel, redoChanges, redoneChanges };
