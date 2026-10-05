const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('primary operators enter boards, guests and regular updates stay on the original screen',()=>{
 const station=fs.readFileSync('public/station.html','utf8');
 assert.match(station,/type === "primary" && \[4,5,8\]\.includes\(stationNum\)/);
 assert.match(station,/has\("regular"\)/);
 assert.match(station,/sessionStorage.setItem\(`board-operator-/);
 const cover=fs.readFileSync('public/cover.html','utf8');assert.match(cover,/location.href = "\/foreman-board"/);assert.doesNotMatch(cover,/id="jobBoard"/);
 const board=fs.readFileSync('public/station-board.js','utf8');assert.doesNotMatch(board,/"WIP TV: "/);assert.match(board,/select.value=selected.get/);
});
test('dashboard connection colours, completion bars and save outcomes reflect actual responses',async()=>{
 const vm=require('node:vm');
 class Element {
  constructor(){this.children=[];this.style={};this.dataset={};this.attributes={};this.value='';}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(){}
 }
 for(const station of [4,5,8]){
  const elements=new Map(),document={getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement:()=>new Element(),querySelectorAll:()=>[]};
  let response=null,requests=0;
  let expire;
  const context=vm.createContext({document,location:{pathname:`/board/${station}`},sessionStorage:{getItem:()=>''},fetch:()=>{requests++;return response?Promise.resolve(response):new Promise(()=>{});},AbortController,setTimeout:f=>{expire=f;return 0;},clearTimeout:()=>{},setInterval:()=>{}});
  vm.runInContext(fs.readFileSync('public/station-board.js','utf8'),context);
  const data={name:'Saw 2',station,days:['TODAY'],updated:'Updated',wipReadAt:new Date().toISOString(),jobs:[],connection:{sheet:true,health:{status:'ready'}}};
  const completed=station===8?'BEADS+GLASS':'DONE';
  for(const [statuses,percent]of [[['QUEUED','QUEUED'],0],[[completed,'QUEUED'],50],[[completed,completed],100],[[],0]]){
   data.jobs=statuses.map((status,i)=>({id:i+1,day:'TODAY',status,biz_ref:`D${i}`,customer:'Customer',source:'WIP TV',units:1}));
   vm.runInContext(`board=${JSON.stringify(data)};config={buttons:['DONE'],defaultStatus:'DONE'};render();`,context);
   const bar=elements.get('days').children[0].children[1];
   assert.equal(bar.attributes['aria-valuenow'],String(percent));
   assert.equal(bar.style.backgroundColor,statuses.length?`hsl(${percent*1.2} 65% 25%)`:'#343125');
   assert.equal(elements.get('notice').className,'connected');
   if(statuses.length)assert.doesNotMatch(elements.get('days').children[0].children[2].children[1].children[0].textContent,/WIP TV/);
  }
  for(const health of ['degraded','checking']){
   data.connection.health.status=health;
   vm.runInContext(`board=${JSON.stringify(data)};render();`,context);
   assert.equal(elements.get('notice').className,'disconnected');
  }
  assert.equal(elements.get('stationNumber').textContent,`STATION ${station}`);
  assert.equal(elements.get('title').textContent,'SAW 2');
  data.jobs=[{id:1,day:'TODAY',status:completed,biz_ref:'D1',source:'WIP TV',units:1}];
  vm.runInContext(`board=${JSON.stringify(data)};render();`,context);
  elements.get('actor').value='Operator';
  response={ok:true,json:async()=>({ok:true,message:'Already at that status; nothing changed'})};
  await vm.runInContext('act({jobId:1,value:"DONE"})',context);
  assert.equal(vm.runInContext('saveResults.get(1).state',context),'unchanged');
  assert.match(vm.runInContext('saveResults.get(1).message',context),/^UNCHANGED/);
  response={ok:false,json:async()=>({error:'Sheet did not confirm'})};
  await vm.runInContext('act({jobId:1,value:"DONE"})',context);
  assert.equal(vm.runInContext('saveResults.get(1).state',context),'failed');
  assert.equal(elements.get('notice').className,'disconnected');
  let finish;
  response={ok:true,json:()=>new Promise(resolve=>{finish=resolve;})};
  const pending=vm.runInContext('act({jobId:1,value:"DONE"})',context);
  vm.runInContext('render()',context);
  assert.equal(elements.get('days').children[0].children[2].children[3].children[1].disabled,true);
  const previousRequests=requests;
  await vm.runInContext('act({jobId:1,value:"DONE"})',context);
  assert.equal(requests,previousRequests);
  finish({ok:true});await pending;
  assert.equal(vm.runInContext('saveResults.get(1).state',context),'saved');
  response=null;
  const stalled=vm.runInContext('act({jobId:1,value:"DONE"})',context);
  expire();await stalled;
  assert.equal(vm.runInContext('saveResults.get(1).state',context),'failed');
  assert.match(vm.runInContext('saveResults.get(1).message',context),/timed out; refresh and check/);
 }
});
