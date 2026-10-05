const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('primary operators enter boards, guests and regular updates stay on the original screen',()=>{
 const station=fs.readFileSync('public/station.html','utf8');
 assert.match(station,/type === "primary" && \[4,5,8\]\.includes\(stationNum\)/);
 assert.match(station,/has\("regular"\)/);
 assert.match(station,/sessionStorage.setItem\(`board-operator-/);
 const cover=fs.readFileSync('public/cover.html','utf8');assert.match(cover,/location.href = "\/foreman-board"/);assert.doesNotMatch(cover,/id="jobBoard"/);
 const board=fs.readFileSync('public/station-board.js','utf8');assert.doesNotMatch(board,/"WIP TV: "/);assert.match(board,/select.value=selected.get/);
});
