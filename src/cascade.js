"use strict";

// Direct port of applyCascadeLogic_ from the Google Sheets
// "MATERIAL PLANNER CORE SCRIPT - v7 FINAL". Field names s1..s7 map to
// Station 1..7 columns; Station 8 uses the existing JOB STATUS column.

const STATIONS = {
  1: { key: "s1", name: "Planning",          responsible: "Elvis",           buttons: ["DONE", "RC-X", "CHANGES"] },
  2: { key: "s2", name: "Material control",  responsible: "Joyce",           buttons: ["RECEIVED CL", "W.O.D", "DONE", "CHANGES"] },
  3: { key: "s3", name: "Material despatch", responsible: "Phoni",           buttons: ["PICK TROLLEY", "SASH PICKED", "PICK SHORT", "SASH SHORT", "DONE"] },
  4: { key: "s4", name: "Saw 1",             responsible: "Mimmy",           buttons: ["JOB PICKED", "PICK SHORT", "DONE"] },
  5: { key: "s5", name: "Saw 2",             responsible: "Richard",         buttons: ["JOB PICKED", "PICK SHORT", "DONE"] },
  6: { key: "s6", name: "Assembly",          responsible: "Portia",          buttons: ["WINDOWS DONE", "S-FRONT DONE", "SLIDERS DONE", "ALL DONE"] },
  7: { key: "s7", name: "Glass dept",        responsible: "Thabatso/Vierra", buttons: ["DONE", "SLATTED UNITS", "DELIVERED", "FRAMES ONLY"] },
  8: { key: "job_status", name: "Bead saw",  responsible: "Kerabo",          buttons: ["DONE", "BEAD SHORT", "NOT PICKED"] },
};

const QUEUE_VALUES = ["", "QUEUED", "QUEUE OUT", "0"];
const S1_SETTLED = ["DONE", "DONE-NO PW", "RC-X", "CHANGES"];

function norm(v) {
  return String(v == null ? "" : v).toUpperCase().trim();
}

// Returns { field: newValue, ... } including the edited field itself.
function applyCascade(job, stationNum, rawValue) {
  const value = norm(rawValue);
  const st = STATIONS[stationNum];
  if (!st) throw new Error("Unknown station " + stationNum);
  if (stationNum === 8 && !st.buttons.includes(value)) {
    throw new Error("Invalid Bead Saw status");
  }

  const changes = { [st.key]: value };
  const get = (key) => (key in changes ? changes[key] : norm(job[key]));
  const set = (key, v) => { changes[key] = v; };

  const s1 = () => get("s1"), s3 = () => get("s3"),
        s6 = () => get("s6"), s7 = () => get("s7"),
        jobStatus = () => get("job_status");

  const backfillS1 = () => {
    if (!S1_SETTLED.includes(s1())) set("s1", "DONE-NO PW");
  };
  const scheduleDownstream = () => {
    if (QUEUE_VALUES.includes(s6())) set("s6", "SCHEDULED");
    if (QUEUE_VALUES.includes(s7())) set("s7", "SCHEDULED");
  };

  // Station 8 has no dedicated sheet column. Its visible DONE choice means
  // "beads complete" in the shared Job Status field, retaining any existing
  // frames/glass component so either completion order produces a combination.
  if (stationNum === 8) {
    if (value !== "DONE") return changes;

    const js = norm(job.job_status);
    if (["FRAMES-WINDOW", "FRAMES-SHOP", "FRAMES-SLIDER"].includes(js)) {
      changes.job_status = "FRAMES+BEADS";
    } else if (js === "GLASS READY") {
      changes.job_status = "BEADS+GLASS";
    } else if (["DONE", "BEADS DONE", "FRAMES+BEADS", "BEADS+FRAMES", "BEADS+GLASS", "ALL READY"].includes(js)) {
      changes.job_status = js;
    } else {
      changes.job_status = "BEADS DONE";
    }
    return changes;
  }

  if (stationNum === 1) {
    if (value === "DONE" || value === "RC-X") set("s2", "RECEIVED CL");
    else if (value === "CHANGES") set("s2", "CHANGES");
    return changes;
  }

  if (stationNum === 2) {
    if (value === "RECEIVED CL" || value === "DONE") set("s3", "SCHEDULED");
    return changes;
  }

  if (stationNum === 3) {
    if (value === "PICK TROLLEY") set("s4", "JOB PICKED");
    else if (value === "SASH PICKED") set("s5", "JOB PICKED");
    else if (value === "PICK SHORT") set("s4", "PICK SHORT");
    else if (value === "SASH SHORT") set("s5", "PICK SHORT");
    else if (value === "DONE") { set("s4", "JOB PICKED"); set("s5", "JOB PICKED"); }
    return changes;
  }

  if (stationNum === 4) {
    if (value === "DONE") {
      if (s3() === "PICK TROLLEY") set("s3", "DONE");
      scheduleDownstream();
      backfillS1();
    }
    return changes;
  }

  if (stationNum === 5) {
    if (value === "DONE") {
      if (s3() === "SASH PICKED") set("s3", "DONE");
      scheduleDownstream();
      backfillS1();
    }
    return changes;
  }

  if (stationNum === 6) {
    const frameDone = ["WINDOWS DONE", "S-FRONT DONE", "SLIDERS DONE"].includes(value);
    const allDone = value === "ALL DONE";

    if (frameDone) {
      const js = jobStatus();
      const isCombined = ["FRAMES+BEADS", "FRAMES+GLASS", "FRAMES-WINDOW", "FRAMES-SHOP",
                          "FRAMES-SLIDER", "BEADS+GLASS", "BEADS+FRAMES"].includes(js);
      if (!isCombined) {
        if (js === "BEADS DONE") set("job_status", "FRAMES+BEADS");
        else if (js === "GLASS READY") set("job_status", "FRAMES+GLASS");
        else if (QUEUE_VALUES.includes(js)) {
          if (value === "WINDOWS DONE") set("job_status", "FRAMES-WINDOW");
          else if (value === "S-FRONT DONE") set("job_status", "FRAMES-SHOP");
          else if (value === "SLIDERS DONE") set("job_status", "FRAMES-SLIDER");
        }
      }
    }

    if (frameDone || allDone) backfillS1();
    return changes;
  }

  if (stationNum === 7) {
    const glassDone = ["DONE", "SLATTED UNITS", "DELIVERED", "FRAMES ONLY"].includes(value);

    if (glassDone) {
      const js = jobStatus();
      let next = null;

      if (s6() === "ALL DONE") {
        next = "ALL READY";
        if (!["BEADS DONE", "BEADS+GLASS", "FRAMES+BEADS", "BEADS+FRAMES",
              "FRAMES-SHOP", "FRAMES-SLIDER", "FRAMES-WINDOW", "FRAMES+GLASS"].includes(js)) {
          next = "GLASS READY";
        }
      } else if (js === "FRAMES+GLASS") {
        next = null;
      } else if (js === "FRAMES+BEADS") {
        next = "FRAMES+GLASS";
      } else if (["FRAMES-SHOP", "FRAMES-SLIDER", "FRAMES-WINDOW"].includes(js)) {
        next = "FRAMES+GLASS";
      } else if (js === "BEADS DONE") {
        next = "BEADS+GLASS";
      } else {
        next = "GLASS READY";
      }

      if (next) set("job_status", next);
      backfillS1();
    }
    return changes;
  }

  return changes;
}

module.exports = { STATIONS, applyCascade, norm };
