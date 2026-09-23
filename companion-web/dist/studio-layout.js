export const ROOM_RATIO=1487/1058;
export const STATIONS={
  cabinet:{name:'项目柜',x:.245,gesture:'take',heading:-.9},
  desk:{name:'工作桌',x:.405,gesture:'read',heading:.4},
  board:{name:'任务白板',x:.637,gesture:'point',heading:.2},
  rest:{name:'窗边',x:.818,gesture:'wave',heading:-.12}
};
export function roomFrame(width,height){const w=Math.min(width,height*ROOM_RATIO),h=w/ROOM_RATIO;return{x:(width-w)/2,y:Math.max(0,(height-h)*.42),width:w,height:h};}
export function stationPoint(frame,name){const station=STATIONS[name];if(!station)throw new Error('未知工作地点');return{x:frame.x+frame.width*station.x,y:frame.y+frame.height*.765};}
export function stationForView(kind){return kind==='todos'?'board':kind==='projects'||kind==='collection'?'cabinet':'desk';}
export function nextStation(name,direction){const names=Object.keys(STATIONS),index=Math.max(0,names.indexOf(name));return names[Math.max(0,Math.min(names.length-1,index+Math.sign(direction)))];}
