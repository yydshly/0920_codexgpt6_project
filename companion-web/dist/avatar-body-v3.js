import {sampleGesture,sampleCarry} from './gesture-poses.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
const relaxedArms={leftUpperArm:[-.025,.035,-1.49],rightUpperArm:[-.025,-.035,1.49],leftLowerArm:[0,-.27,-.025],rightLowerArm:[0,.27,.025],leftShoulder:[0,0,0],rightShoulder:[0,0,0]};

// Remove the source clip's sustained bent-back posture. Keep its small
// rotational variations around our upright base, including during idle.
function meanRotations(a,name){
  const key=`${name}:${a.legacyVRM}`;a.v3ClipMeans??={};
  if(a.v3ClipMeans[key])return a.v3ClipMeans[key];
  const sums={},sample={};
  for(let i=0;i<32;i++)for(const[bone,q]of Object.entries(a.authoredMotion.sample(name,i/32,a.legacyVRM,sample))){
    if(!sums[bone])sums[bone]=[0,0,0,0];const sum=sums[bone],sign=sum.reduce((n,v,j)=>n+v*q[j],0)<0?-1:1;
    q.forEach((v,j)=>sum[j]+=v*sign);
  }
  return a.v3ClipMeans[key]=Object.fromEntries(Object.entries(sums).map(([bone,q])=>[bone,a.targetQuaternion.clone().fromArray(q).normalize()]));
}

// The same planted-foot phase drives the arms, pelvis and counter-rotation.
export function animateBody(avatar,delta){
  const a=avatar,t=a.elapsed,g=a.gait||{},w=g.movingWeight||0;
  const swing=a.footwork?.swing;
  const cycle=swing?(swing.index===0?0:.5)+clamp(swing.age/swing.duration,0,1)*.5:a.footwork?.lastFoot===0?.5:0;
  a.v3BodyCycle??=cycle;
  const cycleDelta=((cycle-a.v3BodyCycle)%1+1.5)%1-.5;
  a.v3BodyCycle+=cycleDelta*(1-Math.exp(-delta*12));
  const step=-Math.cos(a.v3BodyCycle*Math.PI*2),breathe=a.reduceMotion?0:Math.sin(t*1.55);
  const idleShift=a.reduceMotion?0:Math.sin(t*.48)*.009*(1-w);
  a.pose={};
  a.poseBone('hips',0,-step*.025*w,idleShift-step*.013*w);
  a.poseBone('spine',-(g.forwardLean||0)*.35,step*.024*w,-idleShift*.5);
  a.poseBone('chest',breathe*.005-(g.forwardLean||0)*.35,step*.027*w,step*.006*w);
  a.poseBone('neck',a.look.y*.22,a.look.x*.24,0);
  a.poseBone('head',a.look.y*.6,a.look.x*.7,.014*(1-w));
  a.poseBone('leftShoulder',0,0,step*.016*w);
  a.poseBone('rightShoulder',0,0,step*.016*w);
  a.poseBone('leftUpperArm',-.025+step*.14*w,.035,-1.49);
  a.poseBone('rightUpperArm',-.025-step*.14*w,-.035,1.49);
  a.poseBone('leftLowerArm',0,-.27-.02*w,-.025);
  a.poseBone('rightLowerArm',0,.27+.02*w,.025);
  a.poseBone('leftHand',.015,0,-.045);a.poseBone('rightHand',.015,0,.045);
  for(const side of ['left','right'])for(const finger of ['Index','Middle','Ring','Little']){
    const sign=side==='left'?-1:1;
    a.poseBone(`${side}${finger}Proximal`,0,0,.16*sign);
    a.poseBone(`${side}${finger}Intermediate`,0,0,.20*sign);
    a.poseBone(`${side}${finger}Distal`,0,0,.10*sign);
  }
  const duration=Math.max(.1,a.gestureUntil-a.gestureStart),age=t-a.gestureStart;
  const progress=clamp(age/duration,0,1),active=t<a.gestureUntil;
  const targetMix=active?smooth(age/.23)*smooth((a.gestureUntil-t)/.3):0;
  a.gestureMix=mix(a.gestureMix||0,targetMix,1-Math.exp(-delta*10));
  if(a.gestureMix>.001){
    const pose=sampleGesture(a.gesture,progress);
    for(const[name,angles]of Object.entries(pose))a.blendBone(name,angles,a.gestureMix*(1-w*.78));
  }
  a.carryWeight=mix(a.carryWeight||0,a.carrying?1:0,1-Math.exp(-delta*8));
  const holdWeight=a.carryWeight*(['receive','place'].includes(a.gesture)?1-a.gestureMix:1);
  if(holdWeight>.001)for(const[name,angles]of Object.entries(sampleCarry()))a.blendBone(name,angles,holdWeight);
  if(a.bones.hips){
    a.bones.hips.position.copy(a.hipPosition);
    a.bones.hips.position.y-=g.pelvisDrop??.006;
    a.bones.hips.position.x+=g.lateral||0;
  }
  let motionPose=null,motionMeans=null;
  if(a.authoredMotion&&!a.reduceMotion){
    // A light folder does not need the library's hunched load-carrying torso.
    const name=w>.035?'walk':'idle';
    const phase=name==='idle'?t/a.authoredMotion.duration('idle'):a.v3BodyCycle+.5;
    a.authoredPose??={};motionPose=a.authoredMotion.sample(name,phase,a.legacyVRM,a.authoredPose);
    a.motionQuaternion??=a.targetQuaternion.clone();
    a.v3Residual??=a.targetQuaternion.clone();motionMeans=meanRotations(a,name);
  }
  const alpha=1-Math.exp(-delta*13);
  for(const[name,bone]of Object.entries(a.bones)){
    const angles=a.pose[name]||[0,0,0];a.targetEuler.set(...angles);a.targetQuaternion.setFromEuler(a.targetEuler);
    if(a.legacyVRM){a.targetQuaternion.x*=-1;a.targetQuaternion.z*=-1;}
    // Authored shoulder/arm motion follows the same left/right foot phase.
    // The IK legs own contact; gestures and the two-handed prop take priority.
    if(motionPose?.[name]&&!/hips|Leg|Foot|Toes|head|neck/.test(name)){
      const limb=/Arm|Hand|Shoulder|Index|Middle|Ring|Little|Thumb/.test(name);
      const weight=(w>.035?w: .28)*(1-a.gestureMix)*(limb?1-a.carryWeight:1);
      a.motionQuaternion.fromArray(motionPose[name]);
      a.v3Residual.copy(motionMeans[name]).invert().multiply(a.motionQuaternion);
      if(limb){
        a.motionQuaternion.identity().slerp(a.v3Residual,.55);
        a.v3Neutral??=a.targetQuaternion.clone();
        a.targetEuler.set(...(relaxedArms[name]||angles));a.v3Neutral.setFromEuler(a.targetEuler);
        if(a.legacyVRM){a.v3Neutral.x*=-1;a.v3Neutral.z*=-1;}
        a.v3Neutral.multiply(a.motionQuaternion);a.targetQuaternion.slerp(a.v3Neutral,weight*.65);
      }else{
        a.motionQuaternion.identity().slerp(a.v3Residual,weight*.3);a.targetQuaternion.multiply(a.motionQuaternion);
      }
    }
    bone.quaternion.slerp(a.targetQuaternion,alpha);
  }
  return a.gestureMix;
}
