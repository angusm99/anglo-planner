"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),vm=require("node:vm");
test("WIP defaults to tomorrow and can select a previous day",()=>{
 const elements=new Map(),calls=[],document={getElementById:id=>{if(!elements.has(id))elements.set(id,{value:"",classList:{add(){},remove(){}}});return elements.get(id);}};
 const c=vm.createContext({document,todayISO:()=>"2026-10-14",startClock(){},themeButtonLabel(){return "Light";},fetch:url=>{calls.push(url);return new Promise(()=>{});},setInterval(){},EventSource:class{addEventListener(){}},URLSearchParams,location:{search:""}});
 const html=fs.readFileSync("public/dashboard.html","utf8");vm.runInContext(html.slice(html.lastIndexOf("<script>")+8,html.lastIndexOf("</script>")),c);
 assert.equal(elements.get("from").value,"2026-10-15");assert.equal(elements.get("to").value,"2026-10-15");
 elements.get("previous").onclick();assert.equal(elements.get("from").value,"2026-10-14");assert.equal(calls.at(-1),"/api/jobs?from=2026-10-14&to=2026-10-14");
});
test("date-range API returns all matching active jobs including past completed jobs; rejects invalid ranges",async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"planner-range-"));process.env.PLANNER_DB_PATH=path.join(dir,"test.db");process.env.PORT="0";delete process.env.SHEET_WEBAPP_URL;
 const db=require("../src/db").open();const add=db.prepare("INSERT INTO jobs(biz_ref,install_date,job_status,active) VALUES(?,?,?,?)");
 for(let i=0;i<205;i++)add.run(`OLD${i}`,"2026-08-31","ALL READY",1);
 add.run("TOMORROW","2026-10-15","QUEUED",1);add.run("PAST","2026-10-14","DONE",1);add.run("INACTIVE","2026-10-15","QUEUED",0);db.close();
 const {server}=require("../src/server");if(!server.listening)await new Promise(resolve=>server.once("listening",resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const r=await fetch(base+"/api/jobs?from=2026-10-15&to=2026-10-15");assert.equal(r.status,200);assert.deepEqual((await r.json()).map(j=>j.biz_ref),["TOMORROW"]);
  const past=await fetch(base+"/api/jobs?from=2026-10-14&to=2026-10-15");assert.deepEqual((await past.json()).map(j=>j.biz_ref),["PAST","TOMORROW"]);
  for(const range of ["from=2026-10-15&to=2026-10-14","from=2026-02-30&to=2026-03-01","from=2026-10-14","from=2020-01-01&to=2026-10-14"]){const bad=await fetch(base+"/api/jobs?"+range);assert.equal(bad.status,400);}
 }finally{await new Promise(resolve=>server.close(resolve));}
});
