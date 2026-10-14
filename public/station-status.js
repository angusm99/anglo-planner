"use strict";
const STATION_COMPLETE = {
  1: new Set(["DONE", "DONE-NO PW"]),
  2: new Set(["DONE", "DONE-NO PW", "ALL DLVD", "CUTPLAN RUN"]),
  3: new Set(["DONE", "DONE-NO PW"]),
  4: new Set(["DONE", "DONE-NO PW"]),
  5: new Set(["DONE", "DONE-NO PW"]),
  6: new Set(["ALL DONE", "DONE-NO PW"]),
  7: new Set(["DONE", "DONE-NO PW", "DELIVERED", "SLATTED UNITS"]),
  8: new Set(["DONE", "BEADS DONE", "FRAMES+BEADS", "BEADS+FRAMES", "BEADS+GLASS", "ALL READY"]),
};

function stationIsComplete(stationNum, value) {
  return STATION_COMPLETE[stationNum]?.has(String(value || "").toUpperCase().trim()) || false;
}
if (typeof module !== "undefined") module.exports = { stationIsComplete };
