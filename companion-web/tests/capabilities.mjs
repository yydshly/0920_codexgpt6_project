import assert from 'node:assert/strict';
import {planCommand} from '../dist/planner.js';
import {WorkspaceStore,extractKeyPoints} from '../dist/workspace-store.js';

let passed=0,failed=0;
function test(name,run){try{run();passed++;console.log(`PASS ${name}`);}catch(error){failed++;console.log(`FAIL ${name}: ${error.message}`);}}
const kinds=text=>planCommand(text).map(step=>step.kind);
const memory=()=>({items:new Map(),getItem(key){return this.items.get(key)||null;},setItem(key,value){this.items.set(key,value);}});

test('negative preserves state',()=>assert.deepEqual(kinds('请不要整理桌面。'),['reply']));
test('undo does not arrange',()=>assert.deepEqual(kinds('撤销整理'),['undo']));
test('stop punctuation',()=>assert.deepEqual(kinds('停止！'),['stop']));
test('three step composition',()=>assert.deepEqual(kinds('先提取要点，然后保存为笔记，再添加待办：检查要点'),['summarize','save_summary','add_todo']));
test('negative step in composition',()=>assert.deepEqual(kinds('打开项目，然后不要整理桌面'),['open','reply']));
test('note body protects task words and punctuation',()=>assert.deepEqual(planCommand('记下：不要整理桌面，然后打开项目；这是正文')[0].args,{body:'不要整理桌面，然后打开项目；这是正文'}));
test('todo body protects separators',()=>assert.deepEqual(planCommand('添加待办：检查任务，然后打开项目')[0].args,{title:'检查任务，然后打开项目'}));
test('freeform note preserves trailing punctuation',()=>assert.equal(planCommand('记下：这段话很重要！')[0].args.body,'这段话很重要！'));
test('empty todo colon is not task content',()=>assert.notEqual(planCommand('添加待办：')[0]?.kind,'add_todo'));
test('search colon payload protects separators',()=>assert.deepEqual(kinds('搜索：整理，然后打开项目'),['search']));
test('completion colon payload protects separators',()=>assert.deepEqual(kinds('完成待办：检查任务，然后打开项目'),['complete_todo']));
test('deletion colon payload protects separators',()=>assert.deepEqual(kinds('删除待办：检查任务，然后打开项目'),['remove_todo']));
test('single first-prefixed command',()=>assert.deepEqual(kinds('先整理桌面'),['arrange']));
test('compound final payload preserves subsequent separators and punctuation',()=>assert.deepEqual(planCommand('打开项目，然后记下：先读书，然后休息！').map(s=>s.args),[{id:'projects'},{body:'先读书，然后休息！'}]));
test('step cap',()=>assert.deepEqual(kinds(Array(9).fill('打开项目').join('；')),['reply']));

test('refresh persists note todo document and preferences',()=>{const storage=memory(),store=new WorkspaceStore(storage);const note=store.addNote('笔记','我的正文');const todo=store.addTodo('检查结果');store.setTodo(todo.id,true);const doc=store.importDocument('资料.txt','目标：完成任务');store.preference('nickname','小明');const fresh=new WorkspaceStore(storage);assert.equal(fresh.data.notes.find(n=>n.id===note.id).body,'我的正文');assert.equal(fresh.data.todos.find(t=>t.id===todo.id).done,true);assert.equal(fresh.document(doc.id).text,'目标：完成任务');assert.equal(fresh.data.preferences.nickname,'小明');});
test('storage write failure keeps current state and undo',()=>{const storage=memory(),store=new WorkspaceStore(storage);store.addTodo('成功');const before=JSON.stringify(store.data),undo=JSON.stringify(store.lastUndo);storage.setItem=()=>{throw new Error('quota');};assert.throws(()=>store.addTodo('失败'),/没有保存/);assert.equal(JSON.stringify(store.data),before);assert.equal(JSON.stringify(store.lastUndo),undo);});
test('storage read failure uses nonwriting temporary state',()=>{const store=new WorkspaceStore({getItem(){throw new Error('blocked');},setItem(){throw new Error('should not write');}});assert.ok(store.loadWarning);assert.throws(()=>store.addNote('不能保存','内容'),/无法保存/);});
test('invalid JSON is not overwritten',()=>{const storage=memory();storage.items.set('qiban.workspace.v1','broken');const store=new WorkspaceStore(storage);assert.ok(store.loadWarning);assert.throws(()=>store.addTodo('不应写入'));assert.equal(storage.getItem('qiban.workspace.v1'),'broken');});
test('blocked localStorage getter degrades safely',()=>{const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('SecurityError');}});try{const store=new WorkspaceStore();assert.ok(store.loadWarning);}finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}});
test('duplicate imports keep separate identities and bodies',()=>{const store=new WorkspaceStore(memory());const a=store.importDocument('同名.txt','第一版'),b=store.importDocument('同名.txt','第二版');assert.notEqual(a.id,b.id);assert.equal(store.document(a.id).text,'第一版');assert.equal(store.document(b.id).text,'第二版');assert.equal(store.data.lastDocument,b.id);});
test('duplicate todo titles retain distinct identities',()=>{const store=new WorkspaceStore(memory());const a=store.addTodo('同名'),b=store.addTodo('同名');store.setTodo(a.id,true);assert.notEqual(a.id,b.id);assert.equal(store.data.todos.find(t=>t.id===b.id).done,false);});
test('line numbers track original CRLF and blank lines',()=>{const result=extractKeyPoints('\r\n标题\r\n\r\n目标：记录需求\r\n\r\n- 下一步：完成验证\r\n');assert.deepEqual(result.points.map(p=>p.line),[2,4,6]);assert.equal(result.lines,3);});
test('points are exact original line excerpts',()=>{const input='第一行\n\n目标：本地持久化\n普通行\n- 测试刷新';const result=extractKeyPoints(input);for(const p of result.points)assert.equal(p.text,input.split('\n')[p.line-1].trim().slice(0,300));});
test('undo reverses last edit and survives refresh',()=>{const storage=memory(),store=new WorkspaceStore(storage);const todo=store.addTodo('可撤销');assert.equal(store.undo(),true);assert.equal(store.data.todos.some(t=>t.id===todo.id),false);assert.equal(new WorkspaceStore(storage).data.todos.some(t=>t.id===todo.id),false);assert.equal(store.undo(),false);});
test('undo does not undo nonundoable preferences or positions',()=>{const store=new WorkspaceStore(memory());store.addTodo('可撤销');store.preference('quiet',true);store.positions([{id:'notes',x:100,y:100}]);store.undo();assert.equal(store.data.preferences.quiet,true);assert.deepEqual(store.data.positions.notes,{x:100,y:100});});
test('walk style persists without changing model, records or undoable content',()=>{const storage=memory(),store=new WorkspaceStore(storage),avatar=store.data.preferences.avatar,note=store.addNote('保留的内容','正文');for(const style of ['v1','v2','v3']){store.preference('walkStyle',style);const fresh=new WorkspaceStore(storage);assert.equal(fresh.data.preferences.walkStyle,style);assert.equal(fresh.data.preferences.avatar,avatar);assert.equal(fresh.data.notes.find(n=>n.id===note.id).body,'正文');}store.undo();assert.equal(store.data.preferences.walkStyle,'v3');assert.equal(store.data.notes.some(n=>n.id===note.id),false);});
test('invalid walk style cannot overwrite the selected style',()=>{const storage=memory(),store=new WorkspaceStore(storage);store.preference('walkStyle','v2');const before=JSON.stringify(store.data);assert.throws(()=>store.preference('walkStyle','unknown'),/走路效果/);assert.equal(JSON.stringify(store.data),before);assert.equal(new WorkspaceStore(storage).data.preferences.walkStyle,'v2');});
console.log(JSON.stringify({passed,failed,total:passed+failed}));
process.exitCode=failed?1:0;
