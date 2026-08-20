"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "station.html"), "utf8");

test("Station 3 exposes deliberate REPICK completion with clear and confirm controls", () => {
  assert.match(source, /if \(stationNum !== 3 \|\| !entry\?\.job\) return;/);
  assert.match(source, /Clear selection/);
  assert.match(source, /Confirm REPICK complete/);
  assert.match(source, /write REDONE\$\{selectedRepick\.cycle\} to the Material Planner/);
});

test("selecting a REPICK never writes; only the explicit confirmation posts completion", () => {
  const selectBody = source.slice(source.indexOf("function selectRepick("), source.indexOf("function clearRepickSelection("));
  const confirmBody = source.slice(source.indexOf('$("confirmRepick").onclick'), source.indexOf("function renderButtons("));
  assert.doesNotMatch(selectBody, /fetch\s*\(/);
  assert.match(confirmBody, /fetch\("\/api\/redo\/complete"/);
  assert.match(confirmBody, /method: "POST"/);
});

