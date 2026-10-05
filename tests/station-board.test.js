"use strict";
const test=require("node:test"), assert=require("node:assert/strict"), {DatabaseSync}=require("node:sqlite");
const {createBoard,parseWip}=require("../src/stationBoard");
test("station board allocation, acknowledged cascade, and safe undo",async()=>{
 const db=new DatabaseSync(":memory:");
 db.exec("CREATE TABLE jobs(id INTEGER PRIMARY KEY,task_no TEXT,source_tab TEXT,s1 TEXT,s3 TEXT,s4 TEXT,s5 TEXT,s6 TEXT,s7 TEXT,job_status TEXT); CREATE TABLE events(id INTEGER PRIMARY KEY,job_id INTEGER,field TEXT); INSERT INTO jobs VALUES(1,'100','OCTOBER','QUEUED','PICK TROLLEY','JOB PICKED','W.I.P','QUEUED','QUEUED','GLASS READY'),(2,'200','OCTOBER','','','','','','','');");
 let ack=false;
 const b=createBoard(db,{live:async j=>db.prepare("SELECT * FROM jobs WHERE id=?").get(j.id),push:async()=>ack,apply:(j,c)=>{for(const [f,v]of Object.entries(c)){db.prepare(`UPDATE jobs SET ${f}=? WHERE id=?`).run(v,j.id);db.prepare("INSERT INTO events(job_id,field) VALUES(?,?)").run(j.id,f);}}});
 const rows=[["ANGLO WINDOWS FACTORY W.I.P BOARD"],["Updated"],["INSTALL DAY: TUESDAY — 1 JOB"],["100","D100","Customer","","","WHITE","2","","DONE","","","GLASS READY"],["INSTALL DAY: WEDNESDAY — 0"],["INSTALL DAY: FRIDAY — 0"]];
 const w=parseWip(rows);assert.equal(w.days.length,3);assert.equal(b.list(5,w).jobs[0].status,"W.I.P");assert.throws(()=>parseWip([]));
 const allocation={station:4,jobId:2,actor:"Operator",action:"allocate",day:"TUESDAY",reason:"MANUAL ISSUE"};
 assert.throws(()=>b.manage(allocation,w,false),/issuer/);b.manage({...allocation,issuer:"Angus"},w,false);assert.equal(b.list(4,w).jobs.length,2);assert.throws(()=>b.manage({...allocation,action:"remove"},w,false),/foreman/);b.manage({...allocation,action:"remove"},w,true);assert.equal(b.list(4,w).jobs.length,1);
 const body={station:4,jobId:1,actor:"Mimmy",value:"DONE"};await assert.rejects(()=>b.change(body,w),/did not confirm/);assert.equal(db.prepare("SELECT s4 FROM jobs WHERE id=1").get().s4,"JOB PICKED");
 ack=true;await b.change(body,w);let undoId=b.list(4,w).jobs[0].undoId;assert.equal(db.prepare("SELECT s6 FROM jobs WHERE id=1").get().s6,"SCHEDULED");await b.change({...body,undoId},w);assert.equal(db.prepare("SELECT s6 FROM jobs WHERE id=1").get().s6,"QUEUED");assert.equal(db.prepare("SELECT s4 FROM jobs WHERE id=1").get().s4,"JOB PICKED");
 await b.change(body,w);undoId=b.list(4,w).jobs[0].undoId;db.exec("INSERT INTO events(job_id,field) VALUES(1,'s4')");await assert.rejects(()=>b.change({...body,undoId},w),/later recorded/);
 await b.change({station:8,jobId:1,actor:"Tebello",value:"DONE"},w);assert.equal(db.prepare("SELECT job_status FROM jobs WHERE id=1").get().job_status,"BEADS+GLASS");db.close();
});
