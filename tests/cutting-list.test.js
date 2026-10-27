const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),{cuttingList}=require('../src/cuttingList');
test('cutting viewer validates exact task, PDF bytes and source version, and renders original pages',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'factory-cutting-'));
 const db={prepare:()=>({get:task=>task==='123'?{id:1}:undefined})},read=cuttingList(db,dir);
 try{
  await assert.rejects(read('../123'),/Job unavailable/);await assert.rejects(read('124'),/Job unavailable/);
  await assert.rejects(read('123'),/not available on the PC/);
  const bytes=execFileSync('python',['-c','import fitz,sys; d=fitz.open(); p=d.new_page(); p.insert_text((72,72),"Factory source fixture"); sys.stdout.buffer.write(d.tobytes())'],{timeout:10000});
  const meta={task:'123',filename:'D1 CL.pdf',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  await fs.writeFile(path.join(dir,'123.pdf'),bytes);await fs.writeFile(path.join(dir,'123.json'),JSON.stringify(meta));
  const result=await read('123');assert.equal(result.task,'123');assert.equal(result.version,meta.sha256);assert.equal(result.pages.length,1);assert.match(result.pages[0],/^data:image\/jpeg;base64,/);
  const pending=read('123');await assert.rejects(read('123'),/Another cutting list/);await pending;
  await fs.writeFile(path.join(dir,'123.json'),JSON.stringify({...meta,task:'999'}));await assert.rejects(read('123'),/source check/);
  await fs.writeFile(path.join(dir,'123.json'),JSON.stringify(meta));bytes[20]^=1;await fs.writeFile(path.join(dir,'123.pdf'),bytes);await assert.rejects(read('123'),/source check/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('viewer stays in one dialog, clears on close, and trusts only its own station frame',async()=>{
 const source=await fs.readFile('public/cutting-list.js','utf8');
 assert.doesNotMatch(source,/window.open|localStorage|indexedDB|download=/);
 assert.match(source,/cuttingDialog.close\(\)/);assert.match(source,/view.replaceChildren\(\);dialog.remove\(\)/);assert.match(source,/cache:"no-store"/);
 assert.match(source,/event.origin!==location.origin/);assert.match(source,/event.source!==document.getElementById\("stationSchedule"\)/);
});
