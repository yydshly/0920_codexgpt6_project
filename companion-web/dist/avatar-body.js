import {sampleGesture,sampleCarry} from './gesture-poses.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;

// The same planted-foot phase drives the arms, pelvis and counter-rotation.
export function animateBody(avatar,delta){
  const a=avatar,t=a.elapsed,g=a.gait||{},w=g.movingWeight||0;
  const step=g.stepWave||0,breathe=a.reduceMotion?0:Math.sin(t*1.55);
  const idleShift=a.reduceMotion?0:Math.sin(t*.48)*.009*(1-w);
  a.pose={};
  a.poseBone('hips',0,-step*.025*w,idleShift-step*.013*w);
  a.poseBone('spine',-(g.forwardLean||0)*.5,step*.04*w,-idleShift*.7);
  a.poseBone('chest',breathe*.007-(g.forwardLean||0)*.5,step*.045*w,step*.01*w);
  a.poseBone('neck',a.look.y*.22,a.look.x*.24,0);
  a.poseBone('head',a.look.y*.6,a.look.x*.7,.014*(1-w));
  a.poseBone('leftShoulder',0,0,step*.016*w);
  a.poseBone('rightShoulder',0,0,step*.016*w);
  a.poseBone('leftUpperArm',-.045+step*.24*w,.065,-1.40);
  a.poseBone('rightUpperArm',-.045-step*.24*w,-.065,1.40);
  a.poseBone('leftLowerArm',0,-.16-.09*w,-.035);
  a.poseBone('rightLowerArm',0,.16+.09*w,.035);
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
  let motionPose=null;
  if(a.authoredMotion&&!a.reduceMotion){
    const swing=a.footwork?.swing;
    if(swing)a.motionCycle=(swing.index===0?0:.5)+clamp(swing.age/swing.duration,0,1)*.5;
    else if(a.footwork?.lastFoot!==null)a.motionCycle=a.footwork?.lastFoot===0?.5:1;
    const name=w>.035?(a.carrying?'carry':'walk'):'idle';
    const phase=name==='idle'?t/a.authoredMotion.duration('idle'):(a.motionCycle||0)+.5;
    a.authoredPose??={};motionPose=a.authoredMotion.sample(name,phase,a.legacyVRM,a.authoredPose);
    a.motionQuaternion??=a.targetQuaternion.clone();
  }
  const alpha=1-Math.exp(-delta*13);
  for(const[name,bone]of Object.entries(a.bones)){
    const angles=a.pose[name]||[0,0,0];a.targetEuler.set(...angles);a.targetQuaternion.setFromEuler(a.targetEuler);
    if(a.legacyVRM){a.targetQuaternion.x*=-1;a.targetQuaternion.z*=-1;}
    // Authored shoulder/arm motion follows the same left/right foot phase.
    // The IK legs own contact; gestures and the two-handed prop take priority.
    if(motionPose?.[name]&&!/hips|Leg|Foot|Toes/.test(name)){
      const limb=/Arm|Hand|Shoulder|Index|Middle|Ring|Little|Thumb/.test(name);
      let weight=(w>.035?w*.9:.48)*(1-a.gestureMix)*(limb?1-a.carryWeight:1);
      if(name==='head'||name==='neck')weight*=.5;
      a.motionQuaternion.fromArray(motionPose[name]);a.targetQuaternion.slerp(a.motionQuaternion,weight);
    }
    bone.quaternion.slerp(a.targetQuaternion,alpha);
  }
  return a.gestureMix;
}
