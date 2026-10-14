"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const {STATIONS}=require("../src/cascade"),{stationState}=require("../src/factoryManager");
test("WIP dots agree with manager station states; manager dates are inclusive and preserve filters",()=>{
 const dashboard=fs.readFileSync("public/dashboard.html","utf8"),dot=dashboard.slice(dashboard.indexOf("function stationDot"),dashboard.indexOf("async function refresh"));
 const c=vm.createContext({});vm.runInContext(fs.readFileSync("public/station-status.js","utf8")+dot,c);
 for(const [n,st] of Object.entries(STATIONS)) for(const value of [...st.buttons,"BEADS+GLASS","ALL READY","GLASS READY","O","N/A",""]){
  const state=stationState(n,value),actual=vm.runInContext(`stationDot(${n},${JSON.stringify(value)})`,c);
  assert.equal(actual==="done",state==="done",`Station ${n}: ${value}`);
  assert.equal(actual==="bad",state==="blocked",`Station ${n}: ${value}`);
 }
 const elements=new Map(),document={getElementById:id=>{if(!elements.has(id))elements.set(id,{value:"",classList:{add(){},remove(){}},reportValidity(){return true;},setCustomValidity(v){this.validation=v;}});return elements.get(id);}};
 const page=fs.readFileSync("public/factory-manager.html","utf8"),script=page.split("<script>")[1].split("</script>")[0];
 const m=vm.createContext({document,fetch:()=>new Promise(()=>{}),setInterval(){},addEventListener(){},EventSource:class{addEventListener(){}},innerWidth:1400});vm.runInContext(script,m);
 const jobs=["2026-10-13","2026-10-14","2026-10-15","2026-10-20","2026-10-21"].map((date,i)=>({id:i,bizRef:`D${i}`,customer:"Test",taskNo:"",colour:"",installDate:date,overdue:date<"2026-10-14",ready:false,openIssues:0,blockers:[],units:{total:1},stations:Array.from({length:8},(_,i)=>({state:i===3?"todo":"done",status:"DONE",name:"Station"})),progress:{done:7,needed:8}}));
 vm.runInContext(`st.data=${JSON.stringify({today:"2026-10-14",window:{overdueLookbackDays:30,aheadDays:120},jobs,stations:Object.entries(STATIONS).map(([n,s])=>({number:Number(n),name:s.name,updatesToday:0,operatorsToday:[]}))})};render()`,m);
 assert.equal(elements.get("from").value,"2026-10-14");assert.equal(elements.get("to").value,"2026-10-20");assert.equal(elements.get("tJobs").textContent,3);
 elements.get("from").value="2026-10-13";elements.get("to").value="2026-10-15";elements.get("applyRange").onclick();assert.equal(elements.get("tJobs").textContent,3);
 vm.runInContext('st.station=4;st.q="D1";render()',m);assert.equal(elements.get("tJobs").textContent,1);assert.equal(elements.get("from").value,"2026-10-13");
 elements.get("from").value="2026-10-20";elements.get("to").value="2026-10-14";elements.get("applyRange").onclick();assert.match(elements.get("to").validation,/End date/);
});
