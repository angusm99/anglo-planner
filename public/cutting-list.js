"use strict";
let cuttingDialog;
async function openCuttingList(task,ref){
 if(!/^\d{1,12}$/.test(String(task)))return;
 if(cuttingDialog)cuttingDialog.close();
 const dialog=document.createElement("dialog");cuttingDialog=dialog;
 dialog.style.cssText="position:fixed;inset:8px;width:calc(100% - 16px);height:calc(100% - 16px);max-width:none;max-height:none;margin:0;padding:12px;background:#211f18;color:white;border:2px solid #f6c945;box-sizing:border-box;";
 const title=document.createElement("h2");title.textContent=`Cutting list · ${ref||task}`;
 const close=document.createElement("button");close.textContent="← Back to jobs";close.onclick=()=>dialog.close();
 const status=document.createElement("p");status.setAttribute("role","status");status.textContent="Opening original cutting list…";
 const nav=document.createElement("div"),view=document.createElement("div");nav.style.cssText="display:flex;gap:8px;margin-bottom:8px;";view.style.cssText="overflow:auto;height:calc(100% - 230px);background:#444;";
 const styleButton=button=>{button.style.cssText="min-height:44px;padding:8px 14px;border:1px solid #f6c945;border-radius:6px;background:#29261d;color:#f6c945;font:inherit;";};styleButton(close);
 dialog.append(close,title,status,nav,view);document.body.append(dialog);dialog.showModal();
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),40000);
 dialog.addEventListener("close",()=>{controller.abort();clearTimeout(timer);view.replaceChildren();dialog.remove();if(cuttingDialog===dialog)cuttingDialog=null;});
 try{
  const response=await fetch(`/api/cutting-list/${task}`,{cache:"no-store",signal:controller.signal}),data=await response.json();
  if(!response.ok)throw Error(data.error||"Cutting list unavailable.");
  if(!dialog.open)return;
  let page=0,zoom=false;
  const image=document.createElement("img");image.style.cssText="display:block;width:100%;height:auto;max-width:none;";
  const previous=document.createElement("button"),next=document.createElement("button"),size=document.createElement("button");
  previous.textContent="← Previous";next.textContent="Next →";size.textContent="Enlarge";[previous,next,size].forEach(styleButton);nav.append(previous,next,size);view.append(image);
  const show=()=>{image.src=data.pages[page];image.alt=`Original cutting list ${ref||task}, page ${page+1}`;status.textContent=`${data.filename} · Page ${page+1} of ${data.pages.length}`;previous.disabled=page===0;next.disabled=page===data.pages.length-1;view.scrollTo(0,0);};
  previous.onclick=()=>{page--;show();};next.onclick=()=>{page++;show();};size.onclick=()=>{zoom=!zoom;image.style.width=zoom?"1800px":"100%";size.textContent=zoom?"Fit page":"Enlarge";};show();
 }catch(error){if(dialog.open)status.textContent=error.name==="AbortError"?"Opening timed out. Close and try again.":error.message;}
 finally{clearTimeout(timer);}
}
window.addEventListener("message",event=>{
 if(event.origin!==location.origin||event.source!==document.getElementById("stationSchedule")?.contentWindow||event.data?.type!=="station-cutting-list")return;
 openCuttingList(event.data.task,event.data.ref);
});
