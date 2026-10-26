const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function page({foreman=true,stale=false,fail=false,verify=true,days=['MONDAY','TUESDAY','WEDNESDAY']}={}){
 const elements=new Map(),requests=[];
 const get=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',hidden:false,disabled:false,classList:{toggle(){},add(){},remove(){}},setAttribute(){},reportValidity:()=>true});return elements.get(id);};
 const board={foreman,days,jobs:[],wipStale:stale};
 let allocated=false;
 const ctx=vm.createContext({document:{getElementById:get,body:{classList:{toggle(){}}}},AbortController,setTimeout,clearTimeout,setInterval(){},addEventListener(){},EventSource:function(){this.addEventListener=()=>{};},prompt:()=> 'test-password',fetch:async(url,options)=>{
  if(url==='/api/factory-manager')return new Promise(()=>{});
  const body=options?.body?JSON.parse(options.body):null;requests.push({url,body});
  if(url==='/api/board/login'){board.foreman=true;return{ok:true,json:async()=>({ok:true})};}
  if(url==='/api/board/allocate'){if(fail)return{ok:false,json:async()=>({error:'WIP TV is stale'})};allocated=true;return{ok:true,json:async()=>({ok:true})};}
  return{ok:true,json:async()=>({...board,jobs:allocated&&verify?[{id:99,day:'MONDAY'}]:[]})};
 }});
 vm.runInContext(fs.readFileSync(require.resolve('../public/factory-manager.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],ctx);
 vm.runInContext("st.sel=99;st.data={today: '2026-10-26'};setupAllocation({id:99,stations:[1,2,3,4,5,6,7,8].map(n=>({name:'Station '+n}))})",ctx);
 get('sendStation').value='4';get('sendDay').value='MONDAY';get('sendActor').value='Manager';
 return{get,requests};
}
test('send uses existing allocation route and exact job ID, verifies station readback, no status/date writes',async()=>{
 const p=page();await p.get('sendStation').onchange();await p.get('sendForm').onsubmit({preventDefault(){}});
 const writes=p.requests.filter(r=>r.body);
 assert.deepEqual(writes,[{url:'/api/board/allocate',body:{station:4,jobId:99,action:'allocate',day:'MONDAY',actor:'Manager',issuer:'Manager',reason:'MANUAL ISSUE'}}]);
 assert.match(p.get('sendResult').innerHTML,/Sent to Station 4/);
 assert.match(p.get('sendResult').innerHTML,/\/board\/4/);
 assert.equal(p.requests.at(-1).url,'/api/board?station=4');
});
test('existing foreman sign-in is required, successful login reloads board permissions',async()=>{
 const p=page({foreman:false});await p.get('sendStation').onchange();assert.equal(p.get('sendJob').disabled,true);assert.equal(p.get('sendLogin').hidden,false);
 await p.get('sendForm').onsubmit({preventDefault(){}});assert.equal(p.requests.filter(r=>r.url==='/api/board/allocate').length,0);
 await p.get('sendLogin').onclick();assert.equal(p.get('sendJob').disabled,false);
});
test('stale board and blank manager name prevent allocation',async()=>{
 const p=page({stale:true});await p.get('sendStation').onchange();assert.equal(p.get('sendJob').disabled,true);await p.get('sendForm').onsubmit({preventDefault(){}});assert.equal(p.requests.length,1);
 const q=page();await q.get('sendStation').onchange();q.get('sendActor').value=' ';await q.get('sendForm').onsubmit({preventDefault(){}});assert.equal(q.requests.length,1);
});
test('rejected or unverified send never claims success; form stays available',async()=>{
 for(const options of [{fail:true},{verify:false}]){const p=page(options);await p.get('sendStation').onchange();await p.get('sendForm').onsubmit({preventDefault(){}});assert.match(p.get('sendResult').textContent,/Not confirmed:/);assert.equal(p.get('sendJob').disabled,false);assert.equal(p.get('sendActor').value,'Manager');}
});
test('double submission sends once while pending',async()=>{
 const p=page();await p.get('sendStation').onchange();await Promise.all([p.get('sendForm').onsubmit({preventDefault(){}}),p.get('sendForm').onsubmit({preventDefault(){}})]);assert.equal(p.requests.filter(r=>r.url==='/api/board/allocate').length,1);
});
test('work day defaults to today, never the first older WIP day',async()=>{
 const p=page({days:['SATURDAY 24 OCTOBER 2026','MONDAY 26 OCTOBER 2026','TUESDAY 27 OCTOBER 2026']});await p.get('sendStation').onchange();assert.match(p.get('sendDay').innerHTML,/<option value="MONDAY 26 OCTOBER 2026" selected>/);assert.doesNotMatch(p.get('sendDay').innerHTML,/<option value="SATURDAY 24 OCTOBER 2026" selected>/);
 const q=page({days:['SATURDAY 24 OCTOBER 2026']});await q.get('sendStation').onchange();assert.doesNotMatch(q.get('sendDay').innerHTML,/ selected/);assert.match(q.get('sendDay').innerHTML,/Choose work day/);
});