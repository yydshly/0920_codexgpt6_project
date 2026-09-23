// Authored normalized VRM poses, in radians. The renderer applies the VRM 0
// X/Z quaternion conversion. Anatomical left is screen-right at front view.
// These are procedural keyframes, not motion-capture recordings.
const clamp01=n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
const ease=t=>t*t*(3-2*t);
const REST={
  spine:[-.018,0,.013],chest:[0,0,-.01],neck:[0,0,0],head:[0,0,.022],
  leftShoulder:[0,0,0],rightShoulder:[0,0,0],
  leftUpperArm:[-.1,.07,-1.34],rightUpperArm:[-.08,-.04,1.3],
  leftLowerArm:[-.18,0,-.08],rightLowerArm:[-.22,0,.075],
  leftHand:[.04,.03,-.06],rightHand:[.025,-.03,.05],
};
const fingers=['Index','Middle','Ring','Little'];
function hand(side,curl=.12,indexCurl=curl){
  const sign=side==='left'?-1:1,pose={};
  for(const finger of fingers){
    const amount=finger==='Index'?indexCurl:curl;
    pose[`${side}${finger}Proximal`]=[0,0,sign*amount];
    pose[`${side}${finger}Intermediate`]=[0,0,sign*amount*1.3];
    pose[`${side}${finger}Distal`]=[0,0,sign*amount*.75];
  }
  return pose;
}
Object.assign(REST,hand('left'),hand('right'));

const CARRY={
  leftUpperArm:[.16,-.41,-.95],rightUpperArm:[.16,.41,.95],
  leftLowerArm:[0,-1.47,.13],rightLowerArm:[0,1.47,-.13],
  leftHand:[.035,.02,-.035],rightHand:[.035,-.02,.035],
  ...hand('left',.3),...hand('right',.3),
};
const WAVE={
  rightUpperArm:[.17,.21,-.18],rightLowerArm:[0,.32,-1.4],
  rightHand:[.04,.015,.02],rightShoulder:[0,0,-.025],
  chest:[0,-.018,-.018],head:[-.025,.025,-.055],...hand('right',.025),
};
const THINK={
  rightUpperArm:[-.7,.73,.93],rightLowerArm:[0,2.24,-.4],
  rightHand:[.06,-.07,-.055],head:[.065,-.095,-.065],
  chest:[.025,-.03,0],...hand('right',.3,.11),
};
const TAKE={
  rightUpperArm:[-.2,.6,.8],rightLowerArm:[0,.55,0],
  rightHand:[.035,0,.025],chest:[.025,-.055,.012],
  head:[.05,-.16,0],...hand('right',.075),
};
const POINT={
  leftUpperArm:[.1,-.25,.05],leftLowerArm:[0,-.3,0],
  leftHand:[.015,-.035,.015],chest:[0,.025,-.018],
  head:[-.025,.12,.018],...hand('left',.23,.025),
};
const READ={...CARRY,head:[.12,.025,.012],neck:[.025,0,0],chest:[.025,0,-.008]};
const PLACE={
  leftUpperArm:[-.03,-.85,-.79],rightUpperArm:[-.03,.85,.79],
  leftLowerArm:[0,-.79,.115],rightLowerArm:[0,.79,-.115],
  leftHand:[.015,.02,-.035],rightHand:[.015,-.02,.035],
  chest:[.015,0,-.008],head:[.1,0,.012],
  ...hand('left',.3),...hand('right',.3),
};
const STRETCH={
  leftUpperArm:[-.12,-.3,.33],rightUpperArm:[-.12,.3,-.33],
  leftLowerArm:[0,-.5,.65],rightLowerArm:[0,.5,-.65],
  leftHand:[.04,0,-.05],rightHand:[.04,0,.05],
  leftShoulder:[0,0,.035],rightShoulder:[0,0,-.035],
  chest:[-.055,0,0],spine:[-.035,0,0],head:[-.06,0,.018],
  ...hand('left',.18),...hand('right',.18),
};

// Each frame is a complete pose for the bones used by its clip. Unspecified
// bones return to REST, never to a T pose. Holds can still contain a small
// head/wrist adjustment; the shoulder remains quiet while the hand waves.
function clip(frames){
  const names=[...new Set(frames.flatMap(([,pose])=>Object.keys(pose)))];
  return frames.map(([time,pose])=>[time,Object.fromEntries(names.map(name=>[name,pose[name]||REST[name]||[0,0,0]]))]);
}
const clips={
  wave:clip([
    [0,{}],
    [.13,{rightUpperArm:[-.06,.07,1.15],rightLowerArm:[0,.2,-.2],head:[-.01,.015,-.02]}],
    [.32,WAVE],
    [.43,{...WAVE,rightLowerArm:[0,.32,-1.33],rightHand:[.04,.015,.16]}],
    [.55,{...WAVE,rightLowerArm:[0,.32,-1.46],rightHand:[.04,.015,-.14]}],
    [.67,{...WAVE,rightLowerArm:[0,.32,-1.35],rightHand:[.04,.015,.13]}],
    [.77,{...WAVE,rightHand:[.04,.015,-.055]}],
    [1,{}],
  ]),
  nod:clip([
    [0,{}],[.17,{head:[-.035,0,.022],neck:[-.008,0,0]}],
    [.37,{head:[.16,0,.012],neck:[.028,0,0],chest:[.014,0,-.01]}],
    [.56,{head:[-.012,0,.018],neck:[0,0,0]}],
    [.71,{head:[.07,0,.018],neck:[.012,0,0]}],[1,{}],
  ]),
  think:clip([
    [0,{}],
    [.18,{rightUpperArm:[-.22,.25,1.14],rightLowerArm:[0,.9,-.12],head:[.025,-.035,-.025]}],
    [.41,THINK],[.67,{...THINK,head:[.08,-.115,-.06]}],
    [.78,{...THINK,head:[.035,-.08,-.03]}],[1,{}],
  ]),
  stretch:clip([
    [0,{}],
    [.16,{leftUpperArm:[-.12,-.12,-1.1],rightUpperArm:[-.12,.12,1.1],chest:[.025,0,0],head:[.025,0,.01]}],
    [.43,STRETCH],
    [.66,{...STRETCH,chest:[-.065,.02,0],head:[-.07,.035,.035]}],
    [.78,{...STRETCH,chest:[-.04,0,0],head:[-.025,0,.018]}],[1,{}],
  ]),
  take:clip([
    [0,{}],
    [.18,{rightUpperArm:[-.12,.18,1.18],rightLowerArm:[0,.45,.025],head:[.025,-.1,0]}],
    [.43,TAKE],[.61,{...TAKE,...hand('right',.28)}],
    [.78,{rightUpperArm:[-.06,.38,1.08],rightLowerArm:[0,1.05,-.055],rightHand:[.035,0,.025],head:[.08,-.07,.01],...hand('right',.28)}],
    [1,{}],
  ]),
  point:clip([
    [0,{}],
    [.17,{leftUpperArm:[-.04,-.13,-1.1],leftLowerArm:[0,-.6,-.015],head:[-.012,.07,.018]}],
    [.43,POINT],[.67,{...POINT,head:[-.01,.15,.012]}],
    [.8,{...POINT,leftLowerArm:[0,-.38,.035],head:[-.005,.08,.018]}],[1,{}],
  ]),
  read:clip([
    [0,{}],
    [.16,{leftUpperArm:[.02,-.12,-1.2],rightUpperArm:[.02,.12,1.2],leftLowerArm:[0,-.5,0],rightLowerArm:[0,.5,0],head:[.025,0,.018]}],
    [.38,READ],[.6,{...READ,head:[.13,-.045,.01]}],
    [.78,{...READ,head:[.105,.045,.014]}],[1,{}],
  ]),
  receive:clip([
    [0,{}],
    [.18,{leftUpperArm:[.04,-.12,-1.2],rightUpperArm:[.04,.12,1.2],leftLowerArm:[0,-.6,0],rightLowerArm:[0,.6,0],head:[.045,0,.018]}],
    [.43,{...CARRY,head:[.07,0,.01],...hand('left',.09),...hand('right',.09)}],
    [.63,{...CARRY,head:[.105,0,.01]}],[.78,{...CARRY,head:[.035,0,.015]}],[1,{}],
  ]),
  // Placement starts from the established grip. Extend the hands about 10 cm
  // forward and 3 cm down, open the fingers, then recover without the prop.
  place:clip([
    [0,CARRY],[.16,{...CARRY,head:[.045,0,.012],chest:[.008,0,-.008]}],
    [.43,PLACE],
    [.54,{...PLACE,...hand('left',.025),...hand('right',.025)}],
    [.64,{...PLACE,...hand('left',.04),...hand('right',.04)}],
    [.81,{...CARRY,head:[.075,0,.012],...hand('left',.09),...hand('right',.09)}],
    [1,{}],
  ]),
};
clips.reach=clips.take;

function mix(a,b,t){
  return Object.fromEntries(Object.keys(b).map(name=>{
    const from=a[name]||REST[name]||[0,0,0];
    return[name,b[name].map((angle,i)=>from[i]+(angle-from[i])*t)];
  }));
}

/** Absolute Euler XYZ poses. normalizedTime is elapsed / total gesture time.
 * All clips recover to rest; place starts from the existing carrying pose. */
export function sampleGesture(name,normalizedTime){
  if(name==='carry')return sampleCarry();
  const frames=clips[name];if(!frames)return{};
  const t=clamp01(normalizedTime);
  let next=1;while(next<frames.length-1&&t>frames[next][0])next++;
  const [a,from]=frames[next-1],[b,to]=frames[next];
  return mix(from,to,ease(clamp01((t-a)/(b-a))));
}

/** Persistent holding pose; weight may be smoothly damped by the renderer. */
export function sampleCarry(weight=1){return mix(REST,CARRY,clamp01(weight));}

export const gestureNames=Object.freeze(Object.keys(clips));
