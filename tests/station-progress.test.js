const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('needle and readable count track 0, half, full, empty and unavailable board states',()=>{
 const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{style:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;}});return nodes.get(id);};
 const code=fs.readFileSync('public/station.html','utf8');
 const ctx=vm.createContext({$});vm.runInContext(code.slice(code.indexOf('function updateStationProgress('),code.indexOf('function openSchedule(')),ctx);
 for(const[complete,total,angle,label]of [[0,10,-90,'0%'],[5,10,0,'50%'],[10,10,90,'100%'],[0,0,-90,'—']]){
 vm.runInContext(`updateStationProgress({complete:${complete},total:${total},ready:true})`,ctx);
 assert.equal($('progressNeedle').attrs.transform,`rotate(${angle} 50 48)`);assert.equal($('progressPercent').textContent,label);assert.equal($('progressCount').textContent,`${complete}/${total} jobs complete`);
 }
 vm.runInContext('updateStationProgress({complete:5,total:10,ready:false})',ctx);assert.equal($('progressPercent').textContent,'—');assert.equal($('progressNeedle').style.visibility,'hidden');assert.equal($('progressCount').textContent,'Board unavailable');
 vm.runInContext('updateStationProgress({complete:12,total:10,ready:true})',ctx);assert.equal($('progressCount').textContent,'Board unavailable');
});