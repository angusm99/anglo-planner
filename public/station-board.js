"use strict";
const $=id=>document.getElementById(id), master=location.pathname==="/foreman-board";
const station=Number(master?new URLSearchParams(location.search).get("station")||4:location.pathname.split("/").pop());
let board, config, loading=false, editing=null;
const done=s=>station===8?(s==="DONE"||/BEADS|ALL READY/.test(s)):["DONE","DONE-NO PW"].includes(s);
const issue=s=>/SHORT|DEFECT|REDO/.test(s);
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
async function api(url,body){const r=await fetch(url,body?{signal:AbortSignal.timeout(180000),method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{signal:AbortSignal.timeout(30000)});const v=await r.json();if(!r.ok)throw Error(v.error||"Request failed");return v;}
function actor(){const a=$("actor").value.trim();if(!a)throw Error("Type your name before making a change");return a;}
async function act(body){try{body.station=station;body.actor=actor();await api("/api/board/"+(body.action?"allocate":"change"),body);await load();}catch(e){$("notice").textContent=e.message;}}
function render(){
 $("add").disabled=false;
 const selected=new Map([...document.querySelectorAll('select[data-job]')].map(n=>[n.dataset.job,n.value]));
 $("title").textContent=`${master?"FOREMAN · ":""}${board.name.toUpperCase()}`;
 $("stationNumber").textContent=`STATION ${station}`;
 $("single").href=`/station/${station}?regular=1`; $("operator").href=master?"/cover.html?station=foreman":`/station/${station}`;
 const connected=!board.preview&&!board.wipError&&!board.wipStale&&board.connection?.sheet&&board.connection?.health?.status==="ready";
 $("notice").className=connected?"connected":"disconnected";
 $("notice").textContent=board.preview?"REVIEW PREVIEW — confirmations disabled; allocations affect this preview only.":board.wipError|| (board.wipStale?"Job list is stale; changes paused.":connected?"Connected · confirmations save to the master planner":"Connection needs attention · check each save result");
 $("source").textContent=board.updated+" · Read "+new Date(board.wipReadAt).toLocaleTimeString()+ (station===5?" · SAW 2 uses its own master planner status; WIP TV has no SAW 2 column.":"");
 $("login").hidden=board.foreman;
 $("metrics").replaceChildren();
 const counts=[board.jobs.length,board.jobs.filter(j=>!done(j.status)&&!issue(j.status)).length,board.jobs.filter(j=>done(j.status)).length,board.jobs.filter(j=>issue(j.status)).length];
 ["JOBS ON BOARD","QUEUED","COMPLETED HERE","SHORTS / ISSUES"].forEach((name,i)=>{const c=el("div",name,"metric");c.append(el("strong",counts[i]));$("metrics").append(c);});
 $("days").replaceChildren();
 const days=[...board.days,...new Set(board.jobs.filter(j=>!board.days.includes(j.day)).map(j=>j.day))];
 for(const day of days){const rows=board.jobs.filter(j=>j.day===day);const section=el("section",undefined,"day");section.append(el("h2",`${day}${board.days.includes(day)?"":" · Earlier manual allocation"} · ${rows.length} jobs`));
 const completed=rows.filter(j=>done(j.status)).length,percent=rows.length?Math.round(100*completed/rows.length):0;
 const bar=el("div",rows.length?`${completed} / ${rows.length} COMPLETE · ${percent}%`:"NO JOBS","day-progress");
 bar.style.backgroundColor=rows.length?`hsl(${percent*1.2} 65% 25%)`:"#343125";
 bar.setAttribute("role","progressbar");bar.setAttribute("aria-label",`${day}: completed jobs`);bar.setAttribute("aria-valuemin","0");bar.setAttribute("aria-valuemax","100");bar.setAttribute("aria-valuenow",String(percent));section.append(bar);
 if(!rows.length)section.append(el("p","No jobs allocated."));
 for(const j of rows){const row=el("article",undefined,"job");row.append(el("div",j.biz_ref||j.task_no,"ref"));const info=el("div",j.customer);info.append(el("div",`${j.colour||""} · ${j.units??""} units${j.source==="WIP TV"?"":" · "+j.source}${j.issuer?" · Issued by "+j.issuer:""}${j.note?" · "+j.note:""}`,"detail"));row.append(info);const status=el("div",j.status||"QUEUED","status "+(done(j.status)?"done":issue(j.status)?"problem":""));row.append(status);const controls=el("div",undefined,"controls");const select=el("select");select.setAttribute("aria-label","Status for "+(j.biz_ref||j.task_no));for(const v of config.buttons.filter(v=>v!=="REDO")){const o=el("option",v);o.value=v;select.append(o);}select.dataset.job=String(j.id);select.value=selected.get(String(j.id))||config.defaultStatus;
 const save=el("button","CONFIRM");save.disabled=!j.id||board.preview||board.wipStale||!!board.wipError;save.onclick=async()=>{try{const a=actor();if(confirm(`${a}: set ${j.biz_ref||j.task_no} to ${select.value}? Normal production cascade applies.`)){save.disabled=true;await act({jobId:j.id,value:select.value});}}catch(e){$("notice").textContent=e.message;}};controls.append(select,save);
 if(j.undoId){const undo=el("button","Unconfirm");undo.disabled=save.disabled;undo.onclick=()=>{if(confirm("Restore the previous status and this confirmation's cascade changes? Later changes will block undo."))act({jobId:j.id,undoId:j.undoId});};controls.append(undo);}
 if(master&&board.foreman){const edit=el("button","Edit allocation");edit.onclick=()=>openAllocation(j);const remove=el("button","Remove");remove.onclick=()=>{if(confirm("Remove this job from this station board?"))act({action:"remove",jobId:j.id});};controls.append(edit,remove);}
 if(!j.id)controls.append(el("span","Master job unavailable; ask foreman","problem"));row.append(controls);section.append(row);}$("days").append(section);}
}
async function load(){if(loading)return;loading=true;try{if(!config)config=(await api("/api/stations"))[station];const [list,connection]=await Promise.all([api("/api/board?station="+station),api("/api/capabilities")]);board={...list,connection};render();}catch(e){$("notice").className="disconnected";$("notice").textContent="Disconnected · "+e.message;}finally{loading=false;}}
function openAllocation(j){editing=j||null;$("allocationForm").reset();$("allocationError").textContent="";$("job").replaceChildren();$("day").replaceChildren();for(const d of board.days){const o=el("option",d);o.value=d;$("day").append(o);}if(j){const o=el("option",`${j.biz_ref} · ${j.customer}`);o.value=j.id;$("job").append(o);$("day").value=board.days.includes(j.day)?j.day:board.days[0];$("issuer").value=j.issuer||"";$("note").value=j.note||"";}$("allocation").showModal();}
$("find").onclick=async()=>{ $("find").disabled=true; $("allocationError").textContent="Finding job…"; try{const q=$("search").value.trim();if(q.length<2)throw Error("Enter at least two characters");const jobs=await api("/api/search?q="+encodeURIComponent(q));$("job").replaceChildren();for(const j of jobs.filter(j=>j.source_tab!=="OFFICE")){const o=el("option",`${j.biz_ref} · ${j.customer} · ${j.source_tab}`);o.value=j.id;$("job").append(o);}if(!$("job").options.length)throw Error("No master planner job found"); $("allocationError").textContent=`Found ${$("job").options.length} matching job(s). Select the correct one below.`;}catch(e){$("allocationError").textContent=e.message;}finally{$("find").disabled=false;}};
$("search").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("find").click();}});
$("allocationForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/board/allocate",{station,actor:actor(),action:"allocate",jobId:Number($("job").value),day:$("day").value,reason:"MANUAL ISSUE",issuer:$("issuer").value,note:$("note").value});$("allocation").close();await load();}catch(err){$("allocationError").textContent=err.message;}};
$("cancel").onclick=()=>$("allocation").close();$("add").onclick=()=>{if(board)openAllocation();};$("refresh").onclick=load;$("stations").hidden=!master;
$("login").onclick=async()=>{const password=prompt("Existing Factory Terminal admin password");if(password===null)return;try{await api("/api/board/login",{password});await load();}catch(e){$("notice").textContent=e.message;}};
try { if(!master) $("actor").value=sessionStorage.getItem(`board-operator-${station}`)||""; } catch (_) {}
load();setInterval(load,30000);
