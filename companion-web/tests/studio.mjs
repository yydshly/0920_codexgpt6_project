import assert from 'node:assert/strict';
import {Studio} from '../dist/studio.js';
import {roomFrame,stationPoint,stationForView,STATIONS} from '../dist/studio-layout.js';
import {WorkspaceStore} from '../dist/workspace-store.js';

let passed=0,failed=0;
async function test(name,run){try{await run();passed++;console.log(`PASS ${name}`);}catch(error){failed++;console.log(`FAIL ${name}: ${error.stack}`);}}
const memory=()=>({items:new Map(),getItem(key){return this.items.get(key)||null;},setItem(key,value){this.items.set(key,value);}});
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

// These fakes model only the browser interfaces used by the controller. The
// avatar deliberately leaves movement unresolved until arrival or cancellation.
function fixture(){
  const originals={document:globalThis.document,ResizeObserver:globalThis.ResizeObserver,setTimeout:globalThis.setTimeout};
  const nodes=new Map(),events=new Map(),timers=[];let now=0;
  function element(){return{hidden:false,dataset:{},innerHTML:'',textContent:'',style:{setProperty(key,value){this[key]=value;}},classList:{items:new Set(),add(v){this.items.add(v);},remove(v){this.items.delete(v);}},listeners:new Map(),addEventListener(type,handler){this.listeners.set(type,handler);},setAttribute(key,value){this[key]=value;}};}
  const node=selector=>{if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);};
  globalThis.document={querySelector:node,body:element(),addEventListener(type,handler){events.set(type,handler);}};
  globalThis.ResizeObserver=class{constructor(callback){this.callback=callback;}observe(){}};
  globalThis.setTimeout=(callback,delay)=>{timers.push({at:now+delay,callback});return timers.length;};
  const calls=[],messages=[],opened=[],running=[];
  const avatar={loaded:true,studio:false,x:0,y:0,pending:null,cancel(){if(this.pending){this.pending.resolve(false);this.pending=null;}},setStudio(value){this.studio=value;},setRoomFrame(){},setCarrying(value){calls.push(['carrying',value,now]);},updatePosition(){},seedFeet(){},home(){calls.push(['home']);},play(name,duration){calls.push(['play',name,duration,now]);},moveTo(x,y){calls.push(['move',x,y,now]);return new Promise(resolve=>{this.pending={x,y,resolve};});},arrive(){const pending=this.pending;assert.ok(pending,'expected a pending walk');this.pending=null;this.x=pending.x;this.y=pending.y;pending.resolve(true);}};
  const storage=memory(),store=new WorkspaceStore(storage);
  const studio=new Studio({clientWidth:1440,clientHeight:1024},store,{open:id=>opened.push(id),onRunning:value=>running.push(value),onMessage:message=>messages.push(message),onError:message=>{throw new Error(message);},onToggleTodo:(id,done)=>store.setTodo(id,done)});
  studio.attach(avatar);studio.setActive(true);calls.length=0;running.length=0;
  return{studio,avatar,store,storage,calls,messages,opened,running,node,events,
    async advance(ms){const target=now+ms;await flush();for(;;){timers.sort((a,b)=>a.at-b.at);if(!timers.length||timers[0].at>target)break;const timer=timers.shift();now=timer.at;timer.callback();await flush();}now=target;await flush();},
    restore(){for(const[key,value]of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
  };
}
async function withFixture(run){const f=fixture();try{await run(f);}finally{f.restore();}}

await test('scene switch persists all content and classic icon positions',()=>{
  const storage=memory(),store=new WorkspaceStore(storage);
  store.addNote('保留的笔记','这里有正文');const todo=store.addTodo('保留的待办');store.setTodo(todo.id,true);store.importDocument('资料.md','原始内容');store.positions([{id:'notes',x:167,y:250}]);
  const before=structuredClone(store.data);
  store.preference('scene','studio');store.preference('scene','classic');store.preference('scene','studio');
  const fresh=new WorkspaceStore(storage);assert.equal(fresh.data.preferences.scene,'studio');
  for(const key of ['notes','todos','documents','positions','lastDocument'])assert.deepEqual(fresh.data[key],before[key],key);
});
await test('changing scenes keeps the last content edit undoable',()=>{
  const store=new WorkspaceStore(memory()),todo=store.addTodo('撤销这条');store.preference('scene','studio');assert.equal(store.undo(),true);
  assert.equal(store.data.todos.some(t=>t.id===todo.id),false);assert.equal(store.data.preferences.scene,'studio');
});
await test('invalid scene cannot change saved or live content',()=>{
  const storage=memory(),store=new WorkspaceStore(storage);store.preference('scene','classic');const before=JSON.stringify(store.data),saved=storage.getItem('qiban.workspace.v1');
  assert.throws(()=>store.preference('scene','unknown'),/场景/);assert.equal(JSON.stringify(store.data),before);assert.equal(storage.getItem('qiban.workspace.v1'),saved);
});
await test('all room stations remain on one floor within portrait and landscape frames',()=>{
  for(const[width,height]of[[1440,1024],[390,844],[1920,1080]]){
    const frame=roomFrame(width,height),points=Object.keys(STATIONS).map(name=>stationPoint(frame,name));
    assert.ok(frame.x>=0&&frame.y>=0&&frame.x+frame.width<=width+.001&&frame.y+frame.height<=height+.001);
    for(const point of points){assert.ok(point.x>=frame.x&&point.x<=frame.x+frame.width);assert.ok(point.y>=frame.y&&point.y<=frame.y+frame.height);assert.equal(point.y,points[0].y);}
  }
});
await test('record views route to their associated furniture',()=>{
  assert.equal(stationForView('projects'),'cabinet');assert.equal(stationForView('collection'),'cabinet');assert.equal(stationForView('todos'),'board');assert.equal(stationForView('notes'),'desk');assert.equal(stationForView('detail'),'desk');
});
await test('clicking a room object invokes opening synchronously',()=>withFixture(async f=>{
  f.events.get('click')({target:{closest:selector=>selector==='[data-studio-open]'?{dataset:{studioOpen:'todos'}}:null}});
  assert.deepEqual(f.opened,['todos']);assert.equal(f.avatar.pending,null);
}));
await test('the physical whiteboard shows current saved todos and escapes their text',()=>withFixture(async f=>{
  const todo=f.store.addTodo('<img src=x onerror=alert(1)>');f.store.setTodo(todo.id,true);
  const board=f.node('#board-items').innerHTML;assert.ok(board.includes('&lt;img src=x onerror=alert(1)&gt;'));assert.ok(board.includes(`data-board-todo="${todo.id}" checked`));assert.equal(f.node('#board-count').textContent,`1/${f.store.data.todos.length}`);
  f.studio.setActive(false);f.studio.setActive(true);assert.equal(f.node('#board-items').innerHTML,board);
}));
await test('failed whiteboard checkbox save restores its previous check state',()=>withFixture(async f=>{
  const before=structuredClone(f.store.data),errors=[];f.studio.onError=message=>errors.push(message);f.storage.setItem=()=>{throw new Error('quota');};
  const target={matches:()=>true,dataset:{boardTodo:f.store.data.todos[0].id},checked:true};f.node('#studio-layer').listeners.get('change')({target});
  assert.equal(target.checked,false);assert.deepEqual(f.store.data,before);assert.equal(errors.length,1);assert.equal(f.avatar.pending,null);
}));
await test('changing scene retains the open editor and unsaved content',()=>withFixture(async f=>{
  f.node('#app-window').hidden=false;f.node('#window-content').innerHTML='<textarea>还没保存的灵感</textarea>';
  f.studio.setActive(false);f.studio.setActive(true);
  assert.equal(f.node('#app-window').hidden,false);assert.equal(f.node('#window-content').innerHTML,'<textarea>还没保存的灵感</textarea>');
}));
await test('immediate stop suppresses a tour pose at the current station',()=>withFixture(async f=>{
  const tour=f.studio.tour();f.studio.cancel();await f.advance(10000);await tour;
  assert.equal(f.calls.some(([kind])=>kind==='play'),false);assert.equal(f.studio.running,false);
}));
await test('immediate scene switch suppresses a queued presentation pose',()=>withFixture(async f=>{
  const presentation=f.studio.present('cabinet');f.studio.setActive(false);await f.advance(10000);assert.equal(await presentation,false);
  assert.equal(f.calls.some(([kind])=>kind==='play'),false);assert.equal(f.studio.active,false);
}));
await test('stop during the pickup pause cannot later carry or walk',()=>withFixture(async f=>{
  const tour=f.studio.tour();await flush();assert.ok(f.calls.some(c=>c[0]==='play'&&c[1]==='take'));
  f.studio.cancel();await f.advance(10000);await tour;
  assert.equal(f.calls.some(c=>c[0]==='carrying'&&c[1]),false);assert.equal(f.calls.some(c=>c[0]==='move'),false);assert.deepEqual(f.messages,[]);assert.equal(f.studio.carrying,false);
}));
await test('stop during a walk releases the folder and cancels all later tour actions',()=>withFixture(async f=>{
  const tour=f.studio.tour();await f.advance(2850);assert.ok(f.avatar.pending);assert.equal(f.studio.carrying,true);
  f.studio.cancel();await f.advance(10000);await tour;
  assert.equal(f.avatar.pending,null);assert.equal(f.studio.carrying,false);assert.equal(f.studio.running,false);assert.equal(f.calls.some(c=>c[0]==='play'&&['read','point','place'].includes(c[1])),false);assert.deepEqual(f.messages,[]);
}));
await test('a cancelled arrival cannot stop or pose over its replacement',()=>withFixture(async f=>{
  const old=f.studio.present('board'),replacement=f.studio.present('desk');await flush();assert.equal(await old,false);
  assert.equal(f.studio.running,true);assert.equal(f.studio.destination,'desk');f.avatar.arrive();await flush();
  assert.deepEqual(f.calls.filter(c=>c[0]==='play').map(c=>c[1]),['read']);assert.equal(f.studio.running,true);
  await f.advance(2400);assert.equal(await replacement,true);assert.equal(f.studio.station,'desk');assert.equal(f.studio.running,false);
}));
await test('switching to classic during a tour preserves records and suppresses delayed actions',()=>withFixture(async f=>{
  const before=structuredClone(f.store.data),tour=f.studio.tour();await f.advance(2850);assert.ok(f.avatar.pending);
  f.studio.setActive(false);const callsBefore=f.calls.length;await f.advance(10000);await tour;
  assert.equal(f.calls.length,callsBefore);assert.equal(f.studio.active,false);assert.equal(f.studio.running,false);assert.deepEqual(f.store.data,before);assert.deepEqual(f.messages,[]);
}));
await test('skip arrives at the pending station without delayed gestures',()=>withFixture(async f=>{
  const presentation=f.studio.present('board');assert.equal(f.studio.destination,'board');f.studio.skip();await f.advance(10000);assert.equal(await presentation,false);
  assert.equal(f.studio.station,'board');assert.equal(f.studio.running,false);assert.equal(f.calls.some(c=>c[0]==='play'),false);assert.equal(f.avatar.x,stationPoint(f.studio.frame,'board').x);
}));
await test('successful tour visits cabinet, desk, and board while preserving actual content',()=>withFixture(async f=>{
  const before=structuredClone(f.store.data),tour=f.studio.tour();await f.advance(2850);f.avatar.arrive();await f.advance(6000);f.avatar.arrive();await f.advance(3020);await tour;
  assert.deepEqual(f.calls.filter(c=>c[0]==='play').map(c=>c[1]),['take','place','read','point']);assert.equal(f.studio.station,'board');assert.equal(f.studio.running,false);assert.equal(f.studio.carrying,false);assert.deepEqual(f.store.data,before);assert.equal(f.messages.length,1);
}));
await test('tour waits for pickup recovery, placement release, reading and pointing to complete',()=>withFixture(async f=>{
  const tour=f.studio.tour();await f.advance(1869);
  assert.equal(f.studio.carrying,false);assert.equal(f.avatar.pending,null);
  await f.advance(1);assert.equal(f.studio.carrying,true);
  await f.advance(979);assert.equal(f.avatar.pending,null);
  await f.advance(1);assert.ok(f.avatar.pending);
  const take=f.calls.find(c=>c[0]==='play'&&c[1]==='take'),firstMove=f.calls.find(c=>c[0]==='move');
  assert.ok(firstMove[3]>=take[3]+take[2]*1000+400,'walking begins after pickup recovery');
  f.avatar.arrive();await flush();assert.equal(f.studio.carrying,true);
  await f.advance(1299);assert.equal(f.studio.carrying,true);
  await f.advance(1);assert.equal(f.studio.carrying,false);
  await f.advance(1279);assert.equal(f.calls.some(c=>c[0]==='play'&&c[1]==='read'),false);
  await f.advance(1);assert.equal(f.calls.at(-1)[1],'read');
  const place=f.calls.find(c=>c[0]==='play'&&c[1]==='place'),read=f.calls.find(c=>c[0]==='play'&&c[1]==='read');
  assert.ok(read[3]>=place[3]+place[2]*1000,'reading cannot cut off placement');
  await f.advance(3419);assert.equal(f.avatar.pending,null);
  await f.advance(1);assert.ok(f.avatar.pending);f.avatar.arrive();await flush();
  await f.advance(3019);assert.equal(f.studio.running,true);assert.deepEqual(f.messages,[]);
  await f.advance(1);await tour;assert.equal(f.studio.running,false);assert.equal(f.messages.length,1);
}));
await test('cancellation during placement suppresses reading and completion',()=>withFixture(async f=>{
  const tour=f.studio.tour();await f.advance(2850);f.avatar.arrive();await f.advance(900);
  assert.equal(f.studio.carrying,true);f.studio.cancel();const count=f.calls.length;
  await f.advance(10000);await tour;
  assert.equal(f.calls.length,count);assert.equal(f.studio.carrying,false);assert.equal(f.studio.running,false);assert.deepEqual(f.messages,[]);
}));
await test('cancellation during pointing suppresses a late completion message',()=>withFixture(async f=>{
  const tour=f.studio.tour();await f.advance(2850);f.avatar.arrive();await f.advance(6000);f.avatar.arrive();await f.advance(1000);
  f.studio.cancel();await f.advance(10000);await tour;
  assert.equal(f.studio.running,false);assert.deepEqual(f.messages,[]);
}));

await test('free room clicks preserve the horizontal target on the floor and clamp only at room edges',()=>withFixture(async f=>{
  const frame=f.studio.frame,floor=stationPoint(frame,'cabinet').y;
  for(const [requested,expected]of[[frame.x+frame.width*.523,frame.x+frame.width*.523],[frame.x-100,frame.x+frame.width*.22],[frame.x+frame.width+100,frame.x+frame.width*.83]]){
    const walk=f.studio.walkToPoint(requested);
    assert.equal(f.avatar.pending.x,expected);assert.equal(f.avatar.pending.y,floor);
    assert.deepEqual(f.studio.destinationPoint,{x:expected,y:floor});
    assert.ok(Object.keys(STATIONS).every(name=>Math.abs(stationPoint(frame,name).x-expected)>1),'a free click must not snap to a furniture station');
    assert.equal(f.node('#room-destination').style.top,'76.5%');
    f.avatar.arrive();assert.equal(await walk,true);
    assert.equal(f.avatar.x,expected);assert.equal(f.avatar.y,floor);assert.equal(f.studio.running,false);
  }
  assert.equal(f.calls.some(([kind])=>kind==='play'),false);
}));
await test('a replacement free click keeps its marker and running state after the old walk finishes cancelling',()=>withFixture(async f=>{
  const frame=f.studio.frame,old=f.studio.walkToPoint(frame.x+frame.width*.72);
  const x=frame.x+frame.width*.48,replacement=f.studio.walkToPoint(x);
  await flush();assert.equal(await old,false);
  assert.equal(f.avatar.pending.x,x);assert.equal(f.studio.destinationPoint.x,x);assert.equal(f.studio.running,true);
  assert.equal(f.node('#room-destination').classList.items.has('active'),true);
  assert.ok(Math.abs(parseFloat(f.node('#room-destination').style.left)-48)<1e-9);
  assert.equal(f.node('#studio-layer').dataset.target,'floor');assert.equal(f.node('#skip-scene').hidden,false);
  f.avatar.arrive();assert.equal(await replacement,true);
  assert.equal(f.studio.running,false);assert.equal(f.studio.destinationPoint,null);
  assert.equal(f.node('#room-destination').classList.items.has('active'),false);
}));
await test('stop and scene changes cancel free walking without delayed movement or gestures',()=>withFixture(async f=>{
  const before=structuredClone(f.store.data);
  for(const changeScene of[false,true]){
    const walk=f.studio.walkToPoint(f.studio.frame.x+f.studio.frame.width*.57);
    assert.ok(f.avatar.pending);
    if(changeScene)f.studio.setActive(false);else f.studio.cancel();
    const callCount=f.calls.length;await f.advance(10000);assert.equal(await walk,false);
    assert.equal(f.calls.length,callCount);assert.equal(f.avatar.pending,null);assert.equal(f.studio.running,false);
    assert.equal(f.studio.destinationPoint,null);assert.equal(f.node('#room-destination').classList.items.has('active'),false);
  }
  assert.equal(f.calls.some(([kind])=>kind==='play'),false);assert.deepEqual(f.messages,[]);assert.deepEqual(f.store.data,before);
}));
await test('skipping a free walk arrives at the clicked point instead of the previous furniture station',()=>withFixture(async f=>{
  const frame=f.studio.frame,previous=stationPoint(frame,'cabinet'),x=frame.x+frame.width*.56;
  const walk=f.studio.walkToPoint(x);f.studio.skip();await f.advance(10000);
  assert.equal(await walk,false);assert.equal(f.avatar.pending,null);assert.equal(f.avatar.x,x);assert.equal(f.avatar.y,previous.y);
  assert.notEqual(f.avatar.x,previous.x);assert.notEqual(f.avatar.x,stationPoint(frame,'board').x);
  assert.equal(f.studio.station,'board');assert.equal(f.avatar.yaw,-.12);assert.equal(f.studio.running,false);
  assert.equal(f.studio.destinationPoint,null);assert.equal(f.calls.some(([kind])=>kind==='play'),false);
  assert.equal(f.node('#room-destination').classList.items.has('active'),false);
}));

console.log(JSON.stringify({passed,failed,total:passed+failed}));process.exitCode=failed?1:0;
