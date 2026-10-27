"use strict";
const fs=require("node:fs/promises"),path=require("node:path"),crypto=require("node:crypto");
const {execFile}=require("node:child_process");
function cuttingList(db,dir=path.resolve(__dirname,"../../PROJECTS/SITE FOREMAN TERMINAL/.cutting-pdfs-local")){
 // shortcut: read the existing PC document cache; add Factory-specific refresh only if its coverage proves insufficient.
 let busy=false;
 return async function(task){
  if(!/^\d{1,12}$/.test(task)||!db.prepare("SELECT id FROM jobs WHERE task_no=? AND active=1 AND source_tab!='OFFICE'").get(task))throw Error("Job unavailable in the factory planner.");
  if(busy)throw Error("Another cutting list is opening. Try again shortly.");
  busy=true;
  try{
   let metadata,bytes;
   try{metadata=JSON.parse(await fs.readFile(path.join(dir,task+".json"),"utf8"));bytes=await fs.readFile(path.join(dir,task+".pdf"));}catch{throw Error("Cutting list not available on the PC. Ask the manager to refresh tablet documents.");}
   if(String(metadata.task)!==task||bytes.length!==metadata.bytes||bytes.length>20*1024*1024||bytes.subarray(0,5).toString()!=="%PDF-"||crypto.createHash("sha256").update(bytes).digest("hex")!==metadata.sha256)throw Error("Cutting list failed its source check. Ask the manager to refresh tablet documents.");
   // Pass the verified bytes through stdin so a concurrent cache refresh cannot change the document.
   const result=await new Promise((resolve,reject)=>{
    const child=execFile("python",[path.join(__dirname,"cuttingList.py")],{timeout:30000,maxBuffer:30*1024*1024,windowsHide:true},(error,stdout)=>error?reject(Error("Cutting list could not be displayed. Ask the manager to check the source document.")):resolve(stdout));
    child.stdin.on("error",()=>{});child.stdin.end(bytes);
   });
   return {task,filename:metadata.filename,version:metadata.sha256,pages:JSON.parse(result)};
  }finally{busy=false;}
 };
}
module.exports={cuttingList};
