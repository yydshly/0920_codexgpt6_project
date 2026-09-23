const KEY='qiban.workspace.v1';
const clone=value=>JSON.parse(JSON.stringify(value));
const id=prefix=>`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
const starter=()=>({version:1,notes:[{id:'welcome',title:'灵感便签',body:'想做一个能陪我工作，也能帮我处理小事的桌面伙伴。\n\n她能看向我选中的文件。\n我说“陪我开工”，她就打开我的项目。\n不需要帮忙时，她安静地待在一旁。',updated:Date.now()}],todos:[{id:'todo-start',title:'打开项目，开始工作',done:false},{id:'todo-idea',title:'记下一个新灵感',done:false}],documents:[],positions:{},preferences:{avatar:'modern',nickname:'',quiet:false,size:1},lastDocument:null});

export class WorkspaceStore {
  constructor(storage){
    this.storage=storage;this.listeners=new Set();this.lastUndo=null;this.loadWarning='';
    try{this.storage=storage===undefined?globalThis.localStorage:storage;const raw=this.storage?.getItem(KEY);const parsed=raw?JSON.parse(raw):null;if(parsed&&parsed.version!==1)throw new Error('不支持的保存版本');this.data=parsed||starter();this.validate(this.data);}
    catch{this.data=starter();this.loadWarning='本地记录暂时无法读取，已打开临时工作区；不会自动覆盖旧记录。';this.storage=null;}
  }
  validate(data){if(!Array.isArray(data.notes)||!Array.isArray(data.todos)||!Array.isArray(data.documents)||!data.preferences||!data.positions)throw new Error('本地记录不完整');}
  subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  commit(change,{undo=true}={}){
    const next=clone(this.data);change(next);this.validate(next);
    if(!this.storage)throw new Error('浏览器暂时无法保存本地数据。请允许此页面使用本地存储后重试。');
    try{this.storage.setItem(KEY,JSON.stringify(next));}catch{throw new Error('本地存储空间不足或被禁用，这次修改没有保存。');}
    if(undo)this.lastUndo=clone(this.data);else if(this.lastUndo){this.lastUndo.preferences=clone(next.preferences);this.lastUndo.positions=clone(next.positions);}this.data=next;for(const listener of this.listeners)listener(this.data);return next;
  }
  undo(){if(!this.lastUndo)return false;const previous=this.lastUndo;this.commit(next=>{for(const k of Object.keys(next))delete next[k];Object.assign(next,clone(previous));},{undo:false});this.lastUndo=null;return true;}
  addNote(title,body){const note={id:id('note'),title:String(title||'新笔记').trim().slice(0,80),body:String(body).slice(0,200000),updated:Date.now()};this.commit(data=>data.notes.push(note));return note;}
  saveNote(noteId,title,body){let result;this.commit(data=>{const note=data.notes.find(n=>n.id===noteId);if(!note)throw new Error('这条笔记不存在');note.title=String(title).trim().slice(0,80)||'未命名笔记';note.body=String(body).slice(0,200000);note.updated=Date.now();result=note;});return result;}
  addTodo(title){const text=String(title).trim();if(!text)throw new Error('请填写待办内容');const todo={id:id('todo'),title:text.slice(0,240),done:false};this.commit(data=>data.todos.push(todo));return todo;}
  setTodo(todoId,done){this.commit(data=>{const todo=data.todos.find(t=>t.id===todoId);if(!todo)throw new Error('没有找到这条待办');todo.done=Boolean(done);});}
  removeTodo(todoId){this.commit(data=>{const i=data.todos.findIndex(t=>t.id===todoId);if(i<0)throw new Error('没有找到这条待办');data.todos.splice(i,1);});}
  importDocument(name,text){if(String(text).length>200000)throw new Error('请使用 20 万字以内的文本文件');const doc={id:id('doc'),name:String(name).slice(0,120),text:String(text),added:Date.now()};this.commit(data=>{data.documents.push(doc);data.lastDocument=doc.id;});return doc;}
  preference(name,value){if(!['avatar','nickname','quiet','size','scene','walkStyle'].includes(name))throw new Error('不支持的偏好');if(name==='scene'&&!['classic','studio'].includes(value))throw new Error('不支持的场景');if(name==='walkStyle'&&!['v1','v2','v3'].includes(value))throw new Error('不支持的走路效果');this.commit(data=>{data.preferences[name]=value;},{undo:false});}
  positions(items){this.commit(data=>{data.positions=Object.fromEntries(items.map(i=>[i.id,{x:i.x,y:i.y}]));},{undo:false});}
  search(query){const q=String(query).trim().toLocaleLowerCase();if(!q)return[];const all=[...this.data.notes.map(n=>({id:n.id,type:'note',name:n.title,text:n.body})),...this.data.documents.map(d=>({id:d.id,type:'document',name:d.name,text:d.text})),...this.data.todos.map(t=>({id:t.id,type:'todo',name:t.title,text:t.done?'已完成':'待完成'}))];return all.filter(item=>(item.name+'\n'+item.text).toLocaleLowerCase().includes(q)).map(item=>{const index=Math.max(0,item.text.toLocaleLowerCase().indexOf(q));return{...item,text:undefined,snippet:item.text.slice(Math.max(0,index-35),index+100)};});}
  document(documentId){return this.data.documents.find(d=>d.id===documentId)||null;}
}

export function extractKeyPoints(text){
  const lines=String(text).split(/\r?\n/).map((text,index)=>({text:text.trim(),line:index+1})).filter(item=>item.text);
  const ranked=lines.map((item,index)=>({...item,score:(/^(?:#{1,4}\s|[-*•]\s|\d+[.、)]|目标|结论|需要|下一步|注意|计划)/.test(item.text)?5:0)+(item.text.length>=16&&item.text.length<=180?2:0)+(index===0?1:0)}));
  const picked=ranked.sort((a,b)=>b.score-a.score||a.line-b.line).slice(0,5).sort((a,b)=>a.line-b.line);
  return{characters:Array.from(String(text)).length,lines:lines.length,points:picked.map(item=>({line:item.line,text:item.text.slice(0,300)}))};
}
