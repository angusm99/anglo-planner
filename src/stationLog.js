"use strict";

const { STATIONS } = require("./cascade");

// Read-only history of what a station actually did, pulled from the events
// table every confirmed tap already writes to (see writeJobChanges in server.js).
function stationLog(db, stationNum, days) {
  const num = Number(stationNum);
  const st = STATIONS[num];
  if (!st) return { error: "Invalid station" };
  const window = Number.isFinite(Number(days)) && Number(days) > 0 ? Number(days) : 30;

  const rows = db.prepare(`
    SELECT e.created_at, e.actor, e.field, e.old_value, e.new_value, e.source,
           j.biz_ref, j.customer, j.task_no
    FROM events e JOIN jobs j ON j.id = e.job_id
    WHERE (e.source = ? OR e.source = ?)
      AND e.created_at >= datetime('now', 'localtime', '-' || ? || ' days')
    ORDER BY e.id DESC
    LIMIT 500
  `).all(`station-${num}`, `redo-station-${num}`, window);

  return { station: { number: num, name: st.name, responsible: st.responsible }, days: window, rows };
}

module.exports = { stationLog };
