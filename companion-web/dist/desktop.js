export const artwork={
  folder:'<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#b3dff0" d="M3 13a4 4 0 014-4h12l5 5h17a4 4 0 014 4v21H3z"/><path fill="#78b9d8" d="M3 20a4 4 0 014-4h34a4 4 0 014 4v17a4 4 0 01-4 4H7a4 4 0 01-4-4z"/><path fill="#a4d7eb" d="M3 21h42v5H3z" opacity=".45"/></svg>',
  note:'<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#f1e5c9" d="M10 4h23l7 8v29a3 3 0 01-3 3H10a3 3 0 01-3-3V7a3 3 0 013-3"/><path fill="#d4bf96" d="M32 4v9h8"/><path d="M15 21h17M15 27h17M15 33h11" stroke="#a9906a" stroke-width="2" stroke-linecap="round"/></svg>',
  todo:'<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="5" width="34" height="39" rx="5" fill="#d4e9df"/><rect x="17" y="2" width="14" height="7" rx="3" fill="#7dab9b"/><path d="m13 19 2 2 4-4m-6 12 2 2 4-4" fill="none" stroke="#578675" stroke-width="2" stroke-linecap="round"/><path d="M24 20h10M24 30h10" stroke="#8fae9f" stroke-width="2" stroke-linecap="round"/></svg>',
  box:'<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#a6a2d3" d="M6 18h36v22a3 3 0 01-3 3H9a3 3 0 01-3-3z"/><rect x="3" y="9" width="42" height="12" rx="3" fill="#c1bce7"/><rect x="18" y="27" width="12" height="4" rx="2" fill="#ede9ff"/></svg>'
};
export const escapeHTML=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const makeItems=()=>[
  {id:'projects',name:'我的项目',type:'folder',art:'folder',x:34,y:20},
  {id:'notes',name:'灵感便签.txt',type:'file',art:'note',x:34,y:136},
  {id:'todos',name:'今日待办',type:'file',art:'todo',x:151,y:35},
  {id:'collection',name:'收纳盒',type:'folder',art:'box',x:157,y:155}
];

// The visual desktop calls this adapter. A desktop build can implement the
// same methods with native object identities, positions and execution results.
export class SimulatedDesktop {
  constructor(workspace,store){this.workspace=workspace;this.store=store;this.items=makeItems().map(i=>({...i,...store.data.positions[i.id]}));this.selection=null;this.previous=null;this.opened=null;this.render();}
  listObjects(){return this.items.map(({id,name,type,x,y})=>({id,name,type,x,y}));}
  find(id){return this.items.find(i=>i.id===id);}
  select(id){this.selection=id;document.querySelectorAll('.desktop-icon').forEach(el=>el.classList.toggle('selected',el.dataset.id===id));}
  render(){const root=document.querySelector('#icons');root.innerHTML=this.items.map(item=>`<button class="desktop-icon" data-id="${item.id}" aria-label="${item.name}" style="left:${item.x}px;top:${item.y}px"><span class="icon-art">${artwork[item.art]}</span><span class="icon-label">${item.name}</span></button>`).join('');this.clampAll();}
  clampAll(){for(const i of this.items)this.moveObject(i.id,i.x,i.y);}
  moveObject(id,x,y,{animate=false}={}){const item=this.find(id);if(!item)throw new Error('没有找到该对象');item.x=Math.max(6,Math.min(this.workspace.clientWidth-90,x));item.y=Math.max(4,Math.min(this.workspace.clientHeight-96,y));const el=document.querySelector(`[data-id="${id}"]`);if(el){el.classList.toggle('animating',animate);el.style.left=`${item.x}px`;el.style.top=`${item.y}px`;}return{id,x:item.x,y:item.y};}
  arrangement(){const narrow=this.workspace.clientWidth<650;return this.items.map((i,n)=>({id:i.id,x:24+(n%2)*(narrow?90:118),y:20+Math.floor(n/2)*120}));}
  savePositions(){this.previous=this.items.map(({id,x,y})=>({id,x,y}));}
  persistPositions(){this.store.positions(this.items);}
  undo(){if(!this.previous)return false;this.store.positions(this.previous);for(const i of this.previous)this.moveObject(i.id,i.x,i.y,{animate:true});this.previous=null;return true;}
  reset(){this.store.positions(makeItems());this.items=makeItems();this.previous=null;this.selection=null;this.render();}
  openObject(id){
    const item=this.find(id);if(!item)throw new Error('没有找到该对象');this.opened=id;this.select(id);
    const win=document.querySelector('#app-window');win.hidden=false;win.style.left='';win.style.top='';document.querySelector('#window-title').textContent=item.name;document.querySelector('#window-icon').innerHTML=artwork[item.art];
    const content=document.querySelector('#window-content');
    const data=this.store.data;
    if(id==='projects')content.innerHTML=`<div class="window-intro"><h2>把小事交给我。</h2><p>你的记录都保存在当前浏览器。</p></div><form id="search-form" class="inline-form"><input aria-label="搜索笔记、待办和文件" name="query" placeholder="搜索笔记、待办和文件" required><button>搜索</button></form><div class="file-grid"><button class="file-tile" data-open="notes">${artwork.note}<span>灵感笔记</span><small>${data.notes.length} 篇记录</small></button><button class="file-tile" data-open="todos">${artwork.todo}<span>今日待办</span><small>${data.todos.filter(t=>!t.done).length} 项待完成</small></button><button class="file-tile" data-open="collection">${artwork.box}<span>收纳盒</span><small>${data.documents.length} 个文件</small></button></div>`;
    if(id==='notes')content.innerHTML=`<div class="window-intro"><h2>灵感笔记</h2><button class="primary-action" data-new-note>＋ 新建笔记</button></div><div class="record-list">${data.notes.map(n=>`<button data-note="${n.id}"><strong>${escapeHTML(n.title)}</strong><span>${escapeHTML(n.body.slice(0,75))}</span><small>${new Date(n.updated).toLocaleDateString('zh-CN')}</small></button>`).join('')}</div>`;
    if(id==='todos')content.innerHTML=`<div class="window-intro"><h2>今天，慢慢来。</h2><p>${data.todos.filter(t=>t.done).length} / ${data.todos.length} 已完成</p></div><form id="todo-form" class="inline-form"><input name="title" maxlength="240" aria-label="新的待办" placeholder="下一件小事…" required><button>添加</button></form><ul class="checklist">${data.todos.map(t=>`<li><label><input type="checkbox" data-todo="${t.id}" ${t.done?'checked':''}><span>${escapeHTML(t.title)}</span></label><button class="remove-todo" data-remove-todo="${t.id}" aria-label="删除待办：${escapeHTML(t.title)}">×</button></li>`).join('')}</ul>`;
    if(id==='collection')content.innerHTML=`<div class="window-intro"><h2>收纳盒</h2><p>导入文本，提取要点，再保存成笔记。</p></div><button class="primary-action" data-import>＋ 导入 TXT / MD</button><div class="record-list">${data.documents.map(d=>`<button data-document="${d.id}"><strong>${escapeHTML(d.name)}</strong><small>${d.text.length.toLocaleString()} 字符 · ${new Date(d.added).toLocaleString('zh-CN')}</small></button>`).join('')||'<p class="empty-folder">也可以直接把文件拖到桌面。</p>'}</div>`;
    this.onViewChange?.(id);return{id,opened:true,name:item.name};
  }
  show(title,html){this.opened='detail';document.querySelector('#app-window').hidden=false;document.querySelector('#window-title').textContent=title;document.querySelector('#window-icon').innerHTML=artwork.note;document.querySelector('#window-content').innerHTML=html;this.onViewChange?.('detail');}
  editNote(id){const note=this.store.data.notes.find(n=>n.id===id);this.show(note?'编辑笔记':'新建笔记',`<form id="note-form" data-note-id="${note?.id||''}"><label class="field-label">标题<input name="title" aria-label="笔记标题" required maxlength="80" value="${escapeHTML(note?.title||'')}" placeholder="给灵感起个名字"></label><label class="field-label">正文<textarea name="body" aria-label="笔记正文" required maxlength="200000" rows="9" placeholder="记下来，之后再慢慢想。">${escapeHTML(note?.body||'')}</textarea></label><div class="form-bottom"><span>保存在当前浏览器</span><button class="primary-action">保存笔记</button></div></form>`);}
  showDocument(id){const doc=this.store.document(id);if(!doc)throw new Error('文件已不存在');this.currentDocument=id;this.show(doc.name,`<article class="note-body"><span class="tag">本地文件 · 未上传</span><h2>${escapeHTML(doc.name)}</h2><button class="primary-action" data-summarize="${id}">提取文件要点</button><pre class="document-text">${escapeHTML(doc.text||'这个文件没有文字。')}</pre></article>`);}
  showSummary(doc,summary){this.currentDocument=doc.id;this.show(`${doc.name} · 要点`,`<article class="note-body"><span class="tag">原文要点 · 可核对来源</span><h2>${escapeHTML(doc.name)}</h2><p class="summary-meta">${summary.characters.toLocaleString()} 字符 · ${summary.lines} 个非空行 · 按标题和条目提取</p><ol class="source-points">${summary.points.map(p=>`<li>${escapeHTML(p.text)}<small>原文第 ${p.line} 行</small></li>`).join('')}</ol><div class="window-actions"><button class="primary-action" data-save-summary>保存为笔记</button><button class="secondary-action" data-document="${doc.id}">查看原文</button></div></article>`);}
  showSearch(query){const results=this.store.search(query);this.show('搜索结果',`<div class="window-intro"><h2>“${escapeHTML(query)}”</h2><p>找到 ${results.length} 条记录</p></div><div class="record-list">${results.map(r=>`<button ${r.type==='note'?`data-note="${r.id}"`:r.type==='document'?`data-document="${r.id}"`:'data-open="todos"'}><strong>${escapeHTML(r.name)}</strong><span>${escapeHTML(r.snippet)}</span><small>${{note:'笔记',todo:'待办',document:'文件'}[r.type]}</small></button>`).join('')||'<p class="empty-folder">换个关键词试试。</p>'}</div>`);return results;}
}
