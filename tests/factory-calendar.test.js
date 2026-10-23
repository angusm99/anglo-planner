const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function page() {
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, {innerHTML:'',classList:{toggle(){},add(){},remove(){}},setAttribute(){}}); return elements.get(id); };
  const ctx = vm.createContext({document:{getElementById:get,body:{classList:{toggle(){}}}},addEventListener(){},setInterval(){},EventSource:function(){this.addEventListener=()=>{};},fetch:()=>new Promise(()=>{})});
  const html=fs.readFileSync(require.resolve('../public/factory-manager.html'),'utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],ctx);
  return {elements,get,run:s=>vm.runInContext(s,ctx)};
}
test('calendar handles leap days, Monday alignment and December rollover',()=>{
  const p=page();
  assert.equal(p.run("shiftMonth('2026-12',1)"),'2027-01');
  assert.equal(p.run("shiftMonth('2026-01',-1)"),'2025-12');
  p.run("st.month='2028-02';st.data={today:'2028-02-01'};renderCalendar([], '2028-01-01','2028-05-31')");
  const html=p.get('list').innerHTML;
  assert.equal((html.match(/<section/g)||[]).length,35);
  assert.ok(html.indexOf('Monday, 31 January')<html.indexOf('Tuesday, 01 February'));
  assert.ok(html.includes('Tuesday, 29 February'));
});
test('calendar keeps duplicate refs as separate jobs, escapes text and marks unavailable dates',()=>{
  const p=page();
  p.run(`st.month='2026-10';st.data={today:'2026-10-23'};renderCalendar([1,2].map(id=>({id,installDate:'2026-10-24',bizRef:'D1',customer:'<img onerror=bad>',booking:'CAL-CONF',units:{total:2},jobStatus:'ALL READY',ready:true,blockers:[],openIssues:0})), '2026-10-10','2027-02-20')`);
  const html=p.get('list').innerHTML;
  assert.equal((html.match(/data-id=/g)||[]).length,2);
  assert.ok(html.includes('&lt;img onerror=bad&gt;'));
  assert.ok(!html.includes('<img onerror'));
  assert.ok(html.includes('Outside available range'));
});
test('calendar applies month, search, readiness and outstanding-station filters without changing list dates',()=>{
  const p=page();
  p.run(`st.data={today:'2026-10-23',jobs:[{id:1,installDate:'2026-10-24',bizRef:'D1',customer:'Alice',ready:true,stations:[{state:'done'}]},{id:2,installDate:'2026-10-25',bizRef:'D2',customer:'Bob',ready:false,stations:[{state:'todo'}]},{id:3,installDate:'2026-11-01',bizRef:'D3',customer:'Bob',ready:false,stations:[{state:'todo'}]}]};st.view='calendar';st.month='2026-10'`);
  assert.equal(p.run('visible().length'),2);
  p.run("st.q='Bob';st.show='notready';st.station=1");
  assert.equal(p.run('visible()[0].id'),2);
  p.run("st.view='jobs';st.q='';st.show='all';st.station=0");
  assert.equal(p.run('visible().length'),1);
  assert.equal(p.run('visible()[0].id'),1);
});