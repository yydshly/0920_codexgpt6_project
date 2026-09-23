import {escapeHTML} from './desktop.js';
import {roomFrame,stationPoint,stationForView,STATIONS,nextStation} from './studio-layout.js';
const $=s=>document.querySelector(s);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export class Studio {
  constructor(workspace,store,{open,onRunning,onMessage,onError,onToggleTodo,onInterrupt}){
    this.workspace=workspace;this.store=store;this.open=open;this.onRunning=onRunning;this.onMessage=onMessage;this.onError=onError;this.onToggleTodo=onToggleTodo;this.onInterrupt=onInterrupt;
    this.active=false;this.generation=0;this.station='cabinet';this.destination=null;this.running=false;this.avatar=null;this.carrying=false;
    $('#studio-layer').innerHTML=`<img class="room-background" src="./assets/studio-room.png" alt="阳光下的工作室：左侧项目柜，中间工作桌，右侧任务白板和窗边座椅" draggable="false">
      <div class="cabinet-files" aria-label="项目柜"><button data-studio-open="projects" aria-label="项目柜：打开我的项目">我的项目</button><button data-studio-open="notes" aria-label="项目柜：打开灵感笔记">灵感笔记</button><button data-studio-open="collection" aria-label="项目柜：打开资料收纳">资料收纳</button></div>
      <div class="room-poster" aria-hidden="true">Good<br>Ideas<br>Better<br>Together</div><section class="room-monitor" aria-label="工作桌显示器"><button class="monitor-title" data-studio-open="projects">我的工作区</button><div id="monitor-content"></div></section>
      <section class="room-board" aria-label="任务白板"><button class="board-heading" data-studio-open="todos">今日待办 <span id="board-count"></span></button><div id="board-items"></div><button class="board-more" data-studio-open="todos">管理待办</button></section>
      <button class="room-label cabinet-label" data-studio-station="cabinet">项目柜</button><button class="room-label desk-label" data-studio-station="desk">工作桌</button><button class="room-label board-label" data-studio-station="board">任务白板</button><button class="room-label rest-label" data-studio-station="rest">休息角</button>
      <span id="room-destination" aria-hidden="true"></span><div id="room-floor-targets">${Object.entries(STATIONS).map(([id,s])=>`<button data-studio-station="${id}" style="left:${s.x*100}%" aria-label="走到${s.name}">${s.name}</button>`).join('')}</div>`;
    document.addEventListener('click',e=>{
      const item=e.target.closest('[data-studio-open]');if(item){this.open(item.dataset.studioOpen);return;}
      const station=e.target.closest('[data-studio-station]');if(station){this.onInterrupt?.();this.present(station.dataset.studioStation);}
    });
    $('#studio-layer').addEventListener('change',e=>{if(!e.target.matches('[data-board-todo]'))return;try{this.onToggleTodo(e.target.dataset.boardTodo,e.target.checked);this.present('board','point');}catch(error){e.target.checked=!e.target.checked;this.onError(error.message);}});
    store.subscribe(()=>this.render());this.render();
    this.resizeObserver=new ResizeObserver(()=>{if(!this.active)return;this.cancel();this.layout();this.positionAt(this.station);});this.resizeObserver.observe(workspace);
  }
  render(){
    const data=this.store.data,done=data.todos.filter(t=>t.done).length;
    $('#board-count').textContent=`${done}/${data.todos.length}`;
    $('#board-items').innerHTML=data.todos.slice(0,3).map(t=>`<label><input type="checkbox" data-board-todo="${t.id}" ${t.done?'checked':''}><span>${escapeHTML(t.title)}</span></label>`).join('')||'<p>把今天的小事写在这里。</p>';
    $('#monitor-content').innerHTML=`<button data-studio-open="notes"><span>灵感笔记</span><small>${data.notes.length} 篇</small></button><button data-studio-open="collection"><span>资料收纳</span><small>${data.documents.length} 份</small></button><button data-studio-open="todos"><span>今日待办</span><small>${data.todos.length-done} 项</small></button>`;
    $('#studio-project-name').textContent=this.projectName||'我的项目';
  }
  attach(avatar){this.avatar=avatar;if(this.active){avatar.setStudio(true);this.layout();this.positionAt(this.station);}}
  setActive(value){
    this.cancel();this.active=Boolean(value);document.body.dataset.scene=this.active?'studio':'classic';
    $('#studio-layer').hidden=!this.active;$('#studio-toolbar').hidden=!this.active;$('#studio-intro').hidden=!this.active;
    $('#scene-button').textContent=this.active?'经典桌面':'进入工作室';$('#scene-button').setAttribute('aria-pressed',String(this.active));
    $('.edition').textContent=this.active?'一起工作的房间':'桌面体验';
    $('#hint').textContent=this.active?'单击空白处走过去 · 点击柜子或白板打开内容':'本地能力 · 内容保存在当前浏览器';
    this.avatar?.setStudio(this.active);if(this.active){this.layout();this.positionAt('cabinet');}else this.avatar?.home();
  }
  layout(){
    this.frame=roomFrame(this.workspace.clientWidth,this.workspace.clientHeight);
    const f=this.frame,layer=$('#studio-layer');Object.assign(layer.style,{left:`${f.x}px`,top:`${f.y}px`,width:`${f.width}px`,height:`${f.height}px`});layer.style.setProperty('--room-unit',`${f.width/1487}px`);
    if(this.avatar?.studio)this.avatar.setRoomFrame(f);
  }
  positionAt(name){if(!this.avatar||!this.frame)return;const p=stationPoint(this.frame,name);this.avatar.x=p.x;this.avatar.y=p.y;this.avatar.faceHeading=STATIONS[name].heading;this.avatar.yaw=STATIONS[name].heading;this.avatar.updatePosition();this.avatar.seedFeet();this.station=name;this.setStage(`在${STATIONS[name].name}陪着你`);}
  setStage(text){$('#studio-state').textContent=text;$('#studio-layer').dataset.station=this.station;}
  setRunning(value){this.running=value;$('#skip-scene').hidden=!value;this.onRunning(value);}
  cancel(){
    this.generation++;this.avatar?.cancel();this.avatar?.setCarrying(false);this.carrying=false;this.touring=false;this.destination=null;this.destinationPoint=null;this.setRunning(false);$('#room-destination').classList.remove('active');$('#studio-layer').dataset.target='';
    if(this.active){
      const point=this.frame&&stationPoint(this.frame,this.station);
      const atStation=point&&this.avatar&&Math.hypot(this.avatar.x-point.x,this.avatar.y-point.y)<5;
      this.setStage(atStation?`在${STATIONS[this.station].name}陪着你`:'停在这里陪着你');
    }
  }
  async arrive(name,token){
    if(!this.avatar?.loaded||!this.active||token!==this.generation)return false;
    const p=stationPoint(this.frame,name),same=Math.abs(this.avatar.x-p.x)<4&&Math.abs(this.avatar.y-p.y)<4;
    this.destination=name;$('#studio-layer').dataset.target=name;const marker=$('#room-destination');marker.style.left=`${STATIONS[name].x*100}%`;marker.style.top='76.5%';marker.classList.add('active');
    if(!same){this.setStage(`去${STATIONS[name].name}`);this.avatar.faceHeading=null;const arrived=await this.avatar.moveTo(p.x,p.y,{heading:STATIONS[name].heading});if(!arrived||token!==this.generation||!this.active)return false;}
    else if(this.avatar.faceTo){const arrived=await this.avatar.faceTo(STATIONS[name].heading);if(!arrived||token!==this.generation||!this.active)return false;}
    this.station=name;this.avatar.faceHeading=STATIONS[name].heading;marker.classList.remove('active');this.setStage(`在${STATIONS[name].name}`);return true;
  }
  async present(name,pose=STATIONS[name]?.gesture){
    if(!this.active||!this.avatar?.loaded)return false;
    this.cancel();const token=this.generation;this.setRunning(true);
    try{if(!await this.arrive(name,token)||token!==this.generation||!this.active)return false;this.avatar.play(pose||'nod',2.4);this.setStage({cabinet:'在项目柜前等你',desk:'在桌前和你一起处理',board:'待办和白板保持同步',rest:'你忙你的，我就在这里'}[name]);await pause(2400);return token===this.generation;}
    finally{if(token===this.generation){this.destination=null;this.setRunning(false);}}
  }
  async walkToPoint(x){
    if(!this.active||!this.avatar?.loaded||!this.frame||!Number.isFinite(x))return false;
    this.cancel();const token=this.generation,f=this.frame;
    const point={x:Math.max(f.x+f.width*.22,Math.min(f.x+f.width*.83,x)),y:stationPoint(f,'cabinet').y};
    const nearest=Object.keys(STATIONS).reduce((a,b)=>Math.abs(stationPoint(f,a).x-point.x)<Math.abs(stationPoint(f,b).x-point.x)?a:b);
    this.destination=nearest;this.destinationPoint=point;this.avatar.faceHeading=null;this.setRunning(true);this.setStage('走到你点的位置');
    const marker=$('#room-destination');marker.style.left=`${(point.x-f.x)/f.width*100}%`;marker.style.top='76.5%';marker.classList.add('active');$('#studio-layer').dataset.target='floor';
    try{
      const arrived=await this.avatar.moveTo(point.x,point.y,{heading:-.12});
      if(!arrived||token!==this.generation||!this.active)return false;
      this.station=nearest;this.avatar.faceHeading=-.12;this.setStage('到啦，我就在这里');return true;
    }finally{if(token===this.generation){this.destination=null;this.destinationPoint=null;marker.classList.remove('active');$('#studio-layer').dataset.target='';this.setRunning(false);}}
  }
  view(kind){
    if(!this.active||this.touring)return;
    const station=stationForView(kind);$('#app-window').dataset.side=station==='board'?'left':'right';
    this.projectName=({projects:'我的项目',notes:'灵感笔记',todos:'今日待办',collection:'资料收纳'})[kind]||'当前资料';this.render();this.present(station);
  }
  async tour(){
    if(!this.active||!this.avatar?.loaded){this.onMessage('人物准备好后，就可以一起体验工作流程。');return;}
    this.cancel();const token=this.generation;this.touring=true;this.setRunning(true);this.projectName='我的项目';this.render();
    const current=()=>token===this.generation&&this.active;
    const wait=async milliseconds=>{await pause(milliseconds);return current();};
    try{
      if(!await this.arrive('cabinet',token)||!current())return;
      this.setStage('从项目柜取资料');this.avatar.play('take',2.4);
      // Establish the grip as the reaching hand returns toward the torso.
      // Finish that recovery, then let both arms settle before taking a step.
      if(!await wait(1870))return;
      this.avatar.setCarrying(true);this.carrying=true;
      if(!await wait(530+450))return;

      if(!await this.arrive('desk',token)||!current())return;
      this.setStage('把资料放到工作桌');this.avatar.play('place',2.4);
      // The placement gesture takes priority over the carrying arm layer. Keep
      // the prop until the hands reach the placement pose, then release it.
      if(!await wait(1300))return;
      this.avatar.setCarrying(false);this.carrying=false;
      if(!await wait(1100+180))return;

      this.avatar.play('read',3.2);this.setStage('在工作桌查看笔记和文件');$('#studio-layer').dataset.stage='reading';
      if(!await wait(3200+220))return;
      if(!await this.arrive('board',token)||!current())return;
      this.setStage('白板显示你的实际待办');this.avatar.play('point',2.8);$('#studio-layer').dataset.stage='board';
      if(!await wait(2800+220))return;
      this.onMessage('项目柜、工作桌和白板已经连起来了。这里的待办和经典桌面使用同一份记录。');
    }finally{if(token===this.generation){this.touring=false;this.destination=null;this.setRunning(false);}}
  }
  skip(){
    const target=this.destination||this.station,point=this.destinationPoint;this.cancel();this.touring=false;
    if(point){this.station=target;this.avatar.x=point.x;this.avatar.y=point.y;this.avatar.faceHeading=-.12;this.avatar.yaw=-.12;this.avatar.updatePosition();this.avatar.seedFeet();}else this.positionAt(target);
    this.setStage('已跳过动作，内容保持原样');
  }
  step(direction){return this.present(nextStation(this.station,direction));}
  snapshot(){return{mode:this.active?'studio':'classic',station:this.station,destination:this.destination,running:this.running,carrying:this.carrying};}
}
