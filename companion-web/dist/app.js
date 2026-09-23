import {Avatar} from './character.js';
import {SimulatedDesktop} from './desktop.js';
import {WorkspaceStore,extractKeyPoints} from './workspace-store.js';
import {planCommand} from './planner.js';
import {Studio} from './studio.js';
import {WALK_STYLES,validWalkStyle} from './walk-styles.js';

const $=s=>document.querySelector(s),workspace=$('#workspace'),bubble=$('#speech-bubble'),hit=$('#avatar-hit');
const store=new WorkspaceStore(),desktop=new SimulatedDesktop(workspace,store);
let avatar,studio,ready=false,busy=false,sound=false,bubbleTimer,toastTimer,progressTimer,lastDrag=0,controller=null,activeTask=null,lastUndoDomain=null,lastSummary=null,modelChanging=false;
let recognition,listening=false,recognitionGeneration=0;
const preferences=()=>store.data.preferences;
const toast=text=>{clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);};
const setState=text=>{$('#avatar-state').textContent=text;};
const idleState=()=>setState(preferences().quiet?'小栖 · 安静陪伴':'小栖 · 陪着你');
const setBusy=value=>{busy=value;const running=value||studio?.running;$('#stop-button').hidden=!running;document.body.dataset.action=running?'running':'idle';};
const refreshUndo=()=>{$('#undo-button').hidden=!(lastUndoDomain==='layout'?desktop.previous:store.lastUndo);};
function commit(operation){const result=operation();lastUndoDomain='content';refreshUndo();return result;}
function safe(operation){try{return operation();}catch(error){toast(error.message);return null;}}
function speak(text,{keep=false}={}){
  clearTimeout(bubbleTimer);$('#speech-text').textContent=text;bubble.classList.remove('quiet');
  if(!keep)bubbleTimer=setTimeout(()=>bubble.classList.add('quiet'),preferences().quiet?3500:8000);
  if(sound&&!preferences().quiet&&'speechSynthesis'in window){
    speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang='zh-CN';utterance.rate=.98;
    const voice=speechSynthesis.getVoices().find(v=>v.lang.startsWith('zh'));if(voice)utterance.voice=voice;
    utterance.onstart=()=>{if(avatar)avatar.speaking=true;};utterance.onend=utterance.onerror=()=>{if(avatar)avatar.speaking=false;};speechSynthesis.speak(utterance);
  }
}
function progress(label,done,total){clearTimeout(progressTimer);$('#task-progress').hidden=false;$('#task-progress-label').textContent=label;$('#task-count').textContent=`${done} / ${total}`;$('#task-bar').style.width=`${done/Math.max(1,total)*100}%`;if(done===total||label.startsWith('已停止'))progressTimer=setTimeout(()=>{if(!busy)$('#task-progress').hidden=true;},4000);}
function abortVoice(){recognitionGeneration++;recognition?.abort();recognition=null;listening=false;$('#voice-button').classList.remove('listening');$('#voice-button').setAttribute('aria-label','语音输入');}
function stop({notify=false}={}){
  const task=activeTask;controller?.abort();controller=null;activeTask=null;studio?.cancel();avatar?.cancel();abortVoice();setBusy(false);$('#destination').classList.remove('active');
  if('speechSynthesis'in window)speechSynthesis.cancel();if(avatar)avatar.speaking=false;if(ready)idleState();
  if(task)progress('已停止，已完成的内容保留',task.done,task.total);
  if(notify)speak(task?`已停止。完成了 ${task.done} / ${task.total} 步。`:'好，我停下了。');
}
const check=signal=>{if(signal.aborted)throw new DOMException('已取消','AbortError');};
function delay(ms,signal){return new Promise((resolve,reject)=>{check(signal);const abort=()=>{clearTimeout(timer);reject(new DOMException('已取消','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});});}
function updateAvatar(a){
  const bodyWidth=a.height*(a.studio?.22:.4);hit.style.left=`${a.x-bodyWidth/2}px`;hit.style.width=`${bodyWidth}px`;hit.style.top=`${a.y-a.height}px`;hit.style.height=`${Math.min(a.height,workspace.clientHeight-70)}px`;
  const uiFloor=Math.min(a.y,workspace.clientHeight-80);$('#avatar-label').style.left=`${a.x}px`;$('#avatar-label').style.top=`${uiFloor+5}px`;
  const tools=$('#avatar-tools'),inset=(tools.offsetWidth||250)/2+10;
  tools.style.left=`${Math.max(inset,Math.min(workspace.clientWidth-inset,a.x))}px`;tools.style.top=`${uiFloor+32}px`;
  const closeButton=$('#closeup-button'),closeLabel=a.closeup?'回到桌面':'近看人物';if(closeButton.textContent!==closeLabel){closeButton.textContent=closeLabel;closeButton.setAttribute('aria-pressed',String(a.closeup));}
  const width=bubble.offsetWidth||230,right=a.x+bodyWidth*.55,nearBoard=a.studio&&studio?.frame&&a.x>studio.frame.x+studio.frame.width*.58;const left=!nearBoard&&right+width<workspace.clientWidth-12?right:Math.max(12,a.x-bodyWidth*.55-width);
  bubble.style.left=`${left}px`;bubble.style.top=`${Math.max(12,a.y-a.height+20)}px`;
}
function panel(name){for(const key of ['appearance','abilities']){$(`#panel-${key}`).hidden=key!==name;$(`#tab-${key}`).setAttribute('aria-selected',String(key===name));}if(!$('#companion-dialog').open)$('#companion-dialog').showModal();}
function gesture(name,duration=2.2){if(ready&&!studio?.running)avatar.play(name,duration);}
async function walkTo(x,y,signal){
  check(signal);if(!ready)return;
  const p=avatar.clampPoint(x,y);$('#destination').style.left=`${p.x}px`;$('#destination').style.top=`${p.y}px`;$('#destination').classList.add('active');bubble.classList.add('quiet');
  await avatar.moveTo(p.x,p.y);check(signal);$('#destination').classList.remove('active');
}
function matchingTodo(query){
  const exact=store.data.todos.filter(t=>t.title===query),matches=exact.length?exact:store.data.todos.filter(t=>t.title.includes(query));
  if(!matches.length)throw new Error('没有找到这条待办，可以打开待办查看。');
  if(matches.length>1){desktop.openObject('todos');throw new Error('找到多条相似待办，请在清单中选择具体的一条。');}return matches[0];
}
async function runAction(action,signal){
  check(signal);const a=action.args;
  switch(action.kind){
    case 'open_selected':if(!desktop.selection)throw new Error('请先选中桌面图标。');a.id=desktop.selection;
    // falls through
    case 'open':{
      const item=desktop.find(a.id);if(!item)throw new Error('没有找到这个桌面对象');desktop.select(a.id);
      if(studio.active){desktop.openObject(a.id);return`${item.name.replace('.txt','')}打开了。`;}
      await walkTo(item.x+140,avatar?.y||0,signal);gesture('reach',1);await delay(180,signal);desktop.openObject(a.id);return`${item.name.replace('.txt','')}打开了。`;
    }
    case 'arrange':{
      if(studio.active){studio.present('cabinet','take');return'项目柜按项目、笔记和资料分好了入口。';}
      desktop.savePositions();lastUndoDomain='layout';refreshUndo();
      for(const next of desktop.arrangement()){
        const item=desktop.find(next.id);desktop.select(next.id);await walkTo(item.x+145,avatar?.y||0,signal);gesture('reach',.8);await delay(200,signal);
        check(signal);desktop.moveObject(next.id,next.x,next.y,{animate:true});desktop.persistPositions();await delay(300,signal);
      }
      desktop.select(null);gesture('nod');return'图标整理好了，也可以撤销回原来的位置。';
    }
    case 'undo':{
      const ok=lastUndoDomain==='layout'?desktop.undo():store.undo();lastUndoDomain=null;refreshUndo();if(desktop.opened)desktop.openObject('projects');return ok?'已撤销上一步。':'还没有可以撤销的操作。';
    }
    case 'create_note':{const note=commit(()=>store.addNote(a.body.split(/\n/)[0].slice(0,24),a.body));desktop.editNote(note.id);gesture('nod');return'记下来了，刷新页面后也会保留。';}
    case 'add_todo':commit(()=>store.addTodo(a.title));desktop.openObject('todos');gesture('nod');return'已加入待办，我们一件件来。';
    case 'complete_todo':{const todo=matchingTodo(a.query);commit(()=>store.setTodo(todo.id,true));desktop.openObject('todos');gesture('wave');return`完成了：${todo.title}。`;}
    case 'remove_todo':{const todo=matchingTodo(a.query);commit(()=>store.removeTodo(todo.id));desktop.openObject('todos');return'这条待办已移除，可以撤销。';}
    case 'search':{gesture('think');const results=desktop.showSearch(a.query);return`找到了 ${results.length} 条相关记录。`;}
    case 'summarize':{
      const doc=store.document(a.id||desktop.currentDocument||store.data.lastDocument);if(!doc){desktop.openObject('collection');throw new Error('先导入一个 TXT 或 MD 文件，我就能提取原文要点。');}
      gesture('think');await delay(450,signal);const summary=extractKeyPoints(doc.text);if(!summary.points.length)throw new Error('这个文件没有可提取的文字。');
      lastSummary={doc,summary};desktop.showSummary(doc,summary);return`整理了 ${summary.points.length} 条原文要点，每条都标好了来源行号。`;
    }
    case 'save_summary':{
      if(!lastSummary)throw new Error('请先提取文件要点。');const {doc,summary}=lastSummary;
      const body=`来源：${doc.name}\n\n${summary.points.map(p=>`• ${p.text}\n  原文第 ${p.line} 行`).join('\n\n')}`;
      const note=commit(()=>store.addNote(`${doc.name} · 要点`,body));desktop.editNote(note.id);gesture('nod');return'要点已保存为笔记，原文仍在收纳盒里。';
    }
    case 'gesture':gesture(a.gesture,2.8);return{wave:`${preferences().nickname?preferences().nickname+'，':''}我在呢。今天也一起慢慢来。`,nod:'嗯，收到。',stretch:'一起松松肩膀，休息一下吧。',think:'让我想一想…'}[a.gesture];
    case 'quiet':store.preference('quiet',a.enabled);$('#quiet-mode').checked=a.enabled;if(a.enabled&&'speechSynthesis'in window)speechSynthesis.cancel();return a.enabled?'好，我安静陪着你。':'我回来啦，随时叫我。';
    case 'nickname':store.preference('nickname',a.name.slice(0,30));return`记住了，以后叫你${a.name.slice(0,30)}。`;
    case 'closeup':if(ready)avatar.setCloseup(!avatar.closeup);return'';
    case 'turn':if(ready)avatar.turn();return'';
    case 'move':if(ready){if(studio.active)studio.step(a.direction||1);else await walkTo(a.x??avatar.x+a.direction*180,a.y??avatar.y,signal);}return'';
    case 'help':panel('abilities');return'';
    case 'reply':return a.text;
    default:throw new Error('这句话还不能作为本地指令执行。打开“能力”看看可用功能吧。');
  }
}
async function executePlan(actions){
  if(!actions.length)return{ok:false};if(actions.some(a=>a.kind==='stop')){stop({notify:true});return{ok:true};}
  stop();if(actions.some(a=>a.kind==='unknown')){speak('这句话暂时还不能理解。可以试试“记下：一个灵感”“添加待办：读书”，或打开“能力”。');return{ok:false,reason:'unsupported_command'};}
  const taskController=new AbortController();controller=taskController;const signal=taskController.signal;const task={done:0,total:actions.length};activeTask=task;setBusy(true);
  try{
    let message='';for(const action of actions){check(signal);progress(action.label,task.done,task.total);setState(action.label);message=await runAction(action,signal);check(signal);task.done++;progress(task.done===task.total?'完成了':action.label,task.done,task.total);}
    if(message)speak(message);return{ok:true,completed:task.done};
  }catch(error){if(error.name==='AbortError')return{ok:false,cancelled:true,completed:task.done};progress('这一步需要处理',task.done,task.total);speak(error.message);return{ok:false,error:error.message,completed:task.done};}
  finally{if(controller===taskController){controller=null;activeTask=null;setBusy(false);idleState();}}
}
const execute=text=>executePlan(planCommand(text));

studio=new Studio(workspace,store,{open:id=>{stop();desktop.openObject(id);},onRunning:()=>setBusy(busy),onMessage:speak,onError:toast,onInterrupt:()=>stop(),onToggleTodo:(id,value)=>{stop();const result=commit(()=>store.setTodo(id,value));if(desktop.opened==='todos')desktop.openObject('todos');return result;}});
desktop.onViewChange=kind=>studio.view(kind);
studio.setActive(preferences().scene!=='classic');
function switchScene(){stop();const next=!studio.active;safe(()=>store.preference('scene',next?'studio':'classic'));studio.setActive(next);$('#app-window').style.left='';$('#app-window').style.top='';$('#reset-button').textContent=next?'回到项目柜':'还原图标位置';bubble.classList.add('quiet');}
$('#scene-button').addEventListener('click',switchScene);
$('#tour-button').addEventListener('click',()=>{stop();bubble.classList.add('quiet');studio.tour();});
$('#skip-scene').addEventListener('click',()=>studio.skip());
$('#reset-button').textContent=studio.active?'回到项目柜':'还原图标位置';

$('#command-form').addEventListener('submit',e=>{e.preventDefault();const text=$('#command-input').value;$('#command-input').value='';execute(text);});
document.addEventListener('click',e=>{
  const command=e.target.closest('[data-command]');if(command){$('#companion-dialog').close();execute(command.dataset.command);}
  if(e.target.closest('[data-import]')){$('#companion-dialog').close();$('#text-file-input').click();}
});
$('#stop-button').addEventListener('click',()=>stop({notify:true}));hit.addEventListener('click',()=>execute('挥手'));
$('#undo-button').addEventListener('click',()=>execute('撤销'));
$('#reset-button').addEventListener('click',()=>safe(()=>{stop();if(studio.active){studio.positionAt('cabinet');return;}desktop.reset();refreshUndo();if(ready)avatar.home();toast('图标位置已还原，笔记和文件都保留。');}));
$('#closeup-button').addEventListener('click',()=>{stop();if(ready)avatar.setCloseup(!avatar.closeup);bubble.classList.add('quiet');});
$('#turn-button').addEventListener('click',()=>{stop();bubble.classList.add('quiet');if(ready)avatar.turn();});
function refreshWalkStyle(){
  const key=validWalkStyle(preferences().walkStyle),style=WALK_STYLES[key];
  $('#walk-style-button').textContent=`走路效果 · ${style.number}`;
  $('#walk-style-status').textContent=`当前：${style.number} · ${style.name}`;
  document.querySelectorAll('[data-walk-style]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.walkStyle===key)));
}
$('#walk-style-button').addEventListener('click',()=>{stop();refreshWalkStyle();$('#walk-dialog').showModal();});
for(const id of ['close-walk-dialog','done-walk-dialog'])$(`#${id}`).addEventListener('click',()=>$('#walk-dialog').close());
document.querySelectorAll('[data-walk-style]').forEach(button=>button.addEventListener('click',()=>{
  const key=button.dataset.walkStyle;
  try{store.preference('walkStyle',key);stop();avatar?.setWalkStyle(key);refreshWalkStyle();}catch(error){toast(error.message);}
}));
$('#preview-walk').addEventListener('click',()=>{
  $('#walk-dialog').close();if(!ready)return;stop();bubble.classList.add('quiet');
  if(studio.active){const f=studio.frame;studio.walkToPoint(f.x+f.width*(avatar.x<f.x+f.width*.52?.77:.27));}
  else executePlan([{kind:'move',label:'看看这版走路效果',args:{x:workspace.clientWidth*(avatar.x<workspace.clientWidth*.5?.78:.22),y:avatar.y}}]);
});
refreshWalkStyle();
workspace.addEventListener('pointermove',e=>{if(!avatar)return;const r=workspace.getBoundingClientRect();avatar.setPointer((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);});
workspace.addEventListener('pointerleave',()=>{if(avatar)avatar.pointer.active=false;});
$('#close-window').addEventListener('click',()=>{$('#app-window').hidden=true;desktop.opened=null;});
$('#window-content').addEventListener('click',e=>safe(()=>{
  const el=e.target.closest('button');if(!el)return;
  if(el.dataset.open)desktop.openObject(el.dataset.open);
  if(el.hasAttribute('data-new-note'))desktop.editNote();
  if(el.dataset.note)desktop.editNote(el.dataset.note);
  if(el.dataset.document)desktop.showDocument(el.dataset.document);
  if(el.dataset.removeTodo){commit(()=>store.removeTodo(el.dataset.removeTodo));desktop.openObject('todos');}
  if(el.dataset.summarize)executePlan([{kind:'summarize',label:'提取原文要点',args:{id:el.dataset.summarize}}]);
  if(el.hasAttribute('data-save-summary'))execute('保存为笔记');
}));
$('#window-content').addEventListener('change',e=>{if(e.target.matches('[data-todo]')){try{commit(()=>store.setTodo(e.target.dataset.todo,e.target.checked));desktop.openObject('todos');gesture('nod');}catch(error){e.target.checked=!e.target.checked;toast(error.message);}}});
$('#window-content').addEventListener('submit',e=>{e.preventDefault();safe(()=>{
  const form=e.target,data=new FormData(form);
  if(form.id==='note-form'){const title=data.get('title'),body=data.get('body');commit(()=>form.dataset.noteId?store.saveNote(form.dataset.noteId,title,body):store.addNote(title,body));desktop.openObject('notes');toast('笔记已保存');gesture('nod');}
  if(form.id==='todo-form'){commit(()=>store.addTodo(data.get('title')));desktop.openObject('todos');gesture('nod');}
  if(form.id==='search-form')desktop.showSearch(data.get('query'));
});});
$('#help-button').addEventListener('click',()=>$('#help-dialog').showModal());$('#close-help').addEventListener('click',()=>$('#help-dialog').close());
$('#appearance-button').addEventListener('click',()=>panel('appearance'));$('#abilities-button').addEventListener('click',()=>panel('abilities'));
$('#tab-appearance').addEventListener('click',()=>panel('appearance'));$('#tab-abilities').addEventListener('click',()=>panel('abilities'));$('#close-companion').addEventListener('click',()=>$('#companion-dialog').close());
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}}));
$('#sound-button').addEventListener('click',()=>{if(!('speechSynthesis'in window)){toast('当前浏览器没有语音播报，文字互动仍然可用。');return;}sound=!sound;$('#sound-button').setAttribute('aria-pressed',String(sound));$('#sound-button').setAttribute('aria-label',sound?'关闭语音播报':'开启语音播报');if(sound)speak(preferences().quiet?'先关闭安静陪伴，就能听见我的声音。':'现在你可以听到我的声音了。');else{speechSynthesis.cancel();if(avatar)avatar.speaking=false;}});

async function switchAvatar(key,url){
  if(modelChanging)return;modelChanging=true;stop();$('#model-status').textContent='正在准备新形象…';document.querySelectorAll('[data-avatar]').forEach(b=>b.disabled=true);
  try{if(!avatar)avatar=new Avatar(workspace,updateAvatar);await avatar.load(url||`./assets/avatars/${key}.vrm`);ready=true;hit.hidden=false;document.body.dataset.avatar='ready';$('#loading').hidden=true;avatar.setSize(Number(preferences().size)||1);
    avatar.setWalkStyle(validWalkStyle(preferences().walkStyle));studio.attach(avatar);if(key)safe(()=>store.preference('avatar',key));document.querySelectorAll('[data-avatar]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.avatar===key)));
    $('#model-status').textContent=key?'新形象准备好了，关闭面板看看她。':'已加载你的人物，本次打开期间有效。';idleState();if(!preferences().quiet)speak('换好啦。一起试试新的互动吧。');
  }catch(error){console.error('Avatar load failed',error);$('#model-status').textContent='这个人物没能加载，请换一个模型再试。';toast('人物加载失败，笔记和待办仍可使用。');if(!ready){$('#loading-text').textContent='人物加载失败，可在人物面板重试';$('.loader').hidden=true;hit.hidden=true;}}
  finally{modelChanging=false;document.querySelectorAll('[data-avatar]').forEach(b=>b.disabled=false);if(url)URL.revokeObjectURL(url);}
}
document.querySelectorAll('[data-avatar]').forEach(button=>button.addEventListener('click',()=>switchAvatar(button.dataset.avatar)));
$('#avatar-size').value=String(preferences().size);$('#size-output').value=`${Math.round(preferences().size*100)}%`;
$('#avatar-size').addEventListener('input',e=>{const value=Number(e.target.value);avatar?.setSize(value);$('#size-output').value=`${Math.round(value*100)}%`;});
$('#avatar-size').addEventListener('change',e=>safe(()=>store.preference('size',Number(e.target.value))));
$('#quiet-mode').checked=preferences().quiet;$('#quiet-mode').addEventListener('change',e=>execute(e.target.checked?'安静陪我':'互动模式'));
$('#import-avatar').addEventListener('click',()=>$('#vrm-file-input').click());
$('#vrm-file-input').addEventListener('change',e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(!/\.vrm$/i.test(file.name)||file.size>40*1024*1024){toast('请选择 40 MB 以内的 VRM 人物文件。');return;}switchAvatar(null,URL.createObjectURL(file));});

let dragged=null;
$('#icons').addEventListener('pointerdown',e=>{const el=e.target.closest('.desktop-icon');if(!el||e.button!==0)return;stop();desktop.select(el.dataset.id);const item=desktop.find(el.dataset.id);dragged={el,id:item.id,startX:e.clientX,startY:e.clientY,x:item.x,y:item.y,moved:false};el.setPointerCapture(e.pointerId);});
$('#icons').addEventListener('pointermove',e=>{if(!dragged)return;const dx=e.clientX-dragged.startX,dy=e.clientY-dragged.startY;if(Math.hypot(dx,dy)>5)dragged.moved=true;if(!dragged.moved)return;dragged.el.classList.add('dragging');desktop.moveObject(dragged.id,dragged.x+dx,dragged.y+dy);const r=hit.getBoundingClientRect();hit.classList.toggle('drop-ready',ready&&e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom);});
function finishIconDrag(e,cancelled=false){if(!dragged)return;const d=dragged;dragged=null;d.el.classList.remove('dragging');const onAvatar=hit.classList.contains('drop-ready');hit.classList.remove('drop-ready');if(d.moved){lastDrag=Date.now();if(onAvatar&&!cancelled){desktop.moveObject(d.id,d.x,d.y);gesture('receive');desktop.openObject(d.id);speak('收到，我帮你打开了。');}safe(()=>desktop.persistPositions());}}
$('#icons').addEventListener('pointerup',e=>finishIconDrag(e));$('#icons').addEventListener('pointercancel',e=>finishIconDrag(e,true));
$('#icons').addEventListener('dblclick',e=>{const el=e.target.closest('.desktop-icon');if(el&&Date.now()-lastDrag>250)desktop.openObject(el.dataset.id);});
$('#icons').addEventListener('keydown',e=>{if(e.key==='Enter'){const el=e.target.closest('.desktop-icon');if(el){e.preventDefault();desktop.openObject(el.dataset.id);}}});
workspace.addEventListener('click',e=>{
  const surfaces=studio.active?['workspace','studio-layer','room-floor-targets','avatar-canvas']:['workspace','avatar-canvas','icons'];
  if(!ready||!surfaces.includes(e.target.id)||Date.now()-lastDrag<200)return;
  workspace.focus({preventScroll:true});desktop.select(null);const r=workspace.getBoundingClientRect();
  if(studio.active){stop();bubble.classList.add('quiet');studio.walkToPoint(e.clientX-r.left);return;}
  executePlan([{kind:'move',label:'走过来啦',args:{x:e.clientX-r.left,y:e.clientY-r.top}}]);
});
let windowDrag=null;
$('#window-titlebar').addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;const r=$('#app-window').getBoundingClientRect(),p=workspace.getBoundingClientRect();windowDrag={x:r.left-p.left,y:r.top-p.top,px:e.clientX,py:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);});
$('#window-titlebar').addEventListener('pointermove',e=>{if(!windowDrag)return;const w=$('#app-window');w.style.left=`${Math.max(0,Math.min(workspace.clientWidth-w.offsetWidth,windowDrag.x+e.clientX-windowDrag.px))}px`;w.style.top=`${Math.max(0,Math.min(workspace.clientHeight-65,windowDrag.y+e.clientY-windowDrag.py))}px`;});
for(const type of ['pointerup','pointercancel'])$('#window-titlebar').addEventListener(type,()=>windowDrag=null);

async function importText(file){
  if(!/\.(txt|md)$/i.test(file.name)||file.size>1024*1024){toast('请选择 1 MB、20 万字以内的 TXT 或 MD 文件。');return;}
  stop();try{const text=await file.text();const doc=commit(()=>store.importDocument(file.name,text));desktop.showDocument(doc.id);gesture('receive');speak('文件收到了。可以提取要点，也可以搜索里面的内容。');}catch(error){toast(error.message);}
}
$('#text-file-input').addEventListener('change',e=>{const file=e.target.files[0];e.target.value='';if(file)importText(file);});
workspace.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';hit.classList.add('drop-ready');}});
workspace.addEventListener('dragleave',e=>{if(!workspace.contains(e.relatedTarget))hit.classList.remove('drop-ready');});
workspace.addEventListener('drop',e=>{e.preventDefault();hit.classList.remove('drop-ready');const file=e.dataTransfer.files[0];if(file)importText(file);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){stop();return;}if(!ready||e.target.closest('input,textarea,button,dialog')||document.querySelector('dialog[open]'))return;if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();if(studio.active){if(!e.repeat){stop();studio.step(e.key==='ArrowLeft'?-1:1);}return;}if(!e.repeat)stop();bubble.classList.add('quiet');avatar.manual=e.key==='ArrowLeft'?-1:1;setState('跟着你走');}});
document.addEventListener('keyup',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)&&avatar){avatar.manual=0;idleState();}});window.addEventListener('blur',()=>{if(avatar)avatar.manual=0;});
window.addEventListener('resize',()=>{if(!studio.active)desktop.clampAll();if(!$('#app-window').hidden){$('#app-window').style.left='';$('#app-window').style.top='';}});
const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
$('#voice-button').addEventListener('click',()=>{
  if(!SpeechRecognition){toast('当前浏览器暂不支持语音输入，可以直接输入文字指令。');return;}if(listening){recognition?.stop();return;}stop();const generation=++recognitionGeneration;
  try{recognition=new SpeechRecognition();recognition.lang='zh-CN';recognition.interimResults=false;recognition.maxAlternatives=1;
    recognition.onstart=()=>{if(generation!==recognitionGeneration)return;listening=true;$('#voice-button').classList.add('listening');$('#voice-button').setAttribute('aria-label','结束语音输入');toast('正在听，说完后会执行指令。');};
    recognition.onresult=e=>{if(generation!==recognitionGeneration)return;const text=e.results[0][0].transcript;$('#command-input').value=text;execute(text);};
    recognition.onerror=e=>{if(generation!==recognitionGeneration||e.error==='aborted')return;toast(e.error==='not-allowed'?'没有获得麦克风权限，可以继续输入文字。':'这次没有听清，可以重试或输入文字。');};
    recognition.onend=()=>{if(generation!==recognitionGeneration)return;listening=false;$('#voice-button').classList.remove('listening');$('#voice-button').setAttribute('aria-label','语音输入');};recognition.start();
  }catch{toast('语音输入暂时不可用，请使用文字。');}
});
function tickClock(){$('#clock').textContent=new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());}tickClock();setInterval(tickClock,30000);
if(store.loadWarning)toast(store.loadWarning);
// A model failure must not disable local tools.
switchAvatar(['modern','gentle','future'].includes(preferences().avatar)?preferences().avatar:'modern');
const context=document.modelContext;
if(context?.registerTool){
  const lifecycle=new AbortController();const register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(console.warn);}catch(error){console.warn(error);}};
  register({name:'read_simulated_desktop',title:'读取模拟桌面',description:'读取网页对象和本地记录概况，不访问操作系统。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({objects:desktop.listObjects(),selected:desktop.selection,opened:desktop.opened,avatarReady:ready,busy,scene:studio.snapshot(),notes:store.data.notes.map(({id,title})=>({id,title})),todos:store.data.todos,documents:store.data.documents.map(({id,name})=>({id,name})),preferences:preferences()})});
  register({name:'perform_companion_demo_action',title:'执行桌面伴侣动作',description:'执行网页中的本地能力，只影响模拟桌面。',inputSchema:{type:'object',properties:{action:{type:'string',enum:['open_projects','open_notes','arrange','wave','stop']}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false},async execute(input){const commands={open_projects:'打开项目',open_notes:'打开便签',arrange:'整理桌面',wave:'挥手',stop:'停止'};if(!input||!Object.hasOwn(commands,input.action)||Object.keys(input).some(k=>k!=='action'))throw new Error('无效的演示动作');return execute(commands[input.action]);}});
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
