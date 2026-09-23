import {sampleGesture} from './gesture-poses.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};

// v0.4 animateBody restored from the source read before the motion rewrite.
// Walking/idle formulas and the original gesture envelopes are preserved.
// The corrected v0.4 carry/take/point poses are retained. `place` is a clearly
// isolated compatibility addition: that action did not exist in v0.4.
export function animateBody(a,delta){
  const t=a.elapsed,w=a.gait?.movingWeight??a.walkWeight??0,phase=a.gait?.phaseAngle??a.gaitPhase??0;
  const step=Math.sin(phase),breathe=a.reduceMotion?0:Math.sin(t*1.6);
  a.pose={};
  a.poseBone('hips',0,0,.018*(1-w));
  a.poseBone('spine',-.018,Math.sin(phase)*.026*w,.013*(1-w));
  a.poseBone('chest',breathe*.012,0,-.01*(1-w));
  a.poseBone('neck',a.look.y*.25,a.look.x*.2,0);
  a.poseBone('head',a.look.y*.7,a.look.x*.8,.022*(1-w));
  a.poseBone('leftUpperArm',-.1+step*.28*w,.07,-1.34);
  a.poseBone('rightUpperArm',-.08-step*.28*w,-.04,1.3);
  a.poseBone('leftLowerArm',-.18,0,-.08);a.poseBone('rightLowerArm',-.22,0,.075);
  a.poseBone('leftHand',.04,.03,-.06);a.poseBone('rightHand',.025,-.03,.05);
  for(const side of ['left','right'])for(const part of ['UpperLeg','LowerLeg','Foot'])a.poseBone(side+part);
  for(const side of ['left','right'])for(const finger of ['Index','Middle','Ring','Little']){
    const sign=side==='left'?-1:1;a.poseBone(`${side}${finger}Proximal`,0,0,.12*sign);a.poseBone(`${side}${finger}Intermediate`,0,0,.17*sign);a.poseBone(`${side}${finger}Distal`,0,0,.09*sign);
  }
  const age=t-a.gestureStart,remaining=a.gestureUntil-t;
  const gestureWeight=a.reduceMotion?0:smooth(age/.32)*smooth(remaining/.35);
  if(gestureWeight>0){
    if(a.gesture==='wave'){
      a.blendBone('rightUpperArm',[-.12,.05,-.78],gestureWeight);
      a.blendBone('rightLowerArm',[-.12,.05,-.9+Math.sin(age*8)*.17],gestureWeight);
      a.blendBone('rightHand',[0,0,Math.sin(age*8)*.16],gestureWeight);
      a.blendBone('head',[-.02,.035,-.07],gestureWeight);
      for(const finger of ['Index','Middle','Ring','Little'])for(const joint of ['Proximal','Intermediate','Distal'])a.blendBone(`right${finger}${joint}`,[0,0,.025],gestureWeight);
    }
    if(a.gesture==='reach'){
      a.blendBone('rightUpperArm',[-.3,0,.42],gestureWeight);a.blendBone('rightLowerArm',[-.48,0,.16],gestureWeight);a.blendBone('head',[.055,-.22,0],gestureWeight);a.blendBone('chest',[0,-.075,0],gestureWeight);
    }
    if(a.gesture==='receive'||a.gesture==='read'){
      a.blendBone('leftUpperArm',[.16,-.41,-.95],gestureWeight);a.blendBone('rightUpperArm',[.16,.41,.95],gestureWeight);a.blendBone('leftLowerArm',[0,-1.47,.13],gestureWeight);a.blendBone('rightLowerArm',[0,1.47,-.13],gestureWeight);
      a.blendBone('head',a.gesture==='read'?[.12,.06,0]:[.13,0,0],gestureWeight);
    }
    if(a.gesture==='nod')a.blendBone('head',[Math.sin(age*6)*.15+.07,0,0],gestureWeight);
    if(a.gesture==='think'){
      a.blendBone('rightUpperArm',[-.32,-.12,1.05],gestureWeight);a.blendBone('rightLowerArm',[-2.05,-.15,-.25],gestureWeight);a.blendBone('head',[.07,-.15,-.09],gestureWeight);
    }
    if(a.gesture==='stretch'){
      a.blendBone('leftUpperArm',[-.15,0,.85],gestureWeight);a.blendBone('rightUpperArm',[-.15,0,-.85],gestureWeight);a.blendBone('leftLowerArm',[-.4,0,.1],gestureWeight);a.blendBone('rightLowerArm',[-.4,0,-.1],gestureWeight);a.blendBone('chest',[-.07,0,0],gestureWeight);a.blendBone('head',[-.09,0,0],gestureWeight);
    }
    if(a.gesture==='take'){
      a.blendBone('rightUpperArm',[-.2,.6,.8],gestureWeight);a.blendBone('rightLowerArm',[0,.55,0],gestureWeight);a.blendBone('head',[.06,-.2,0],gestureWeight);
    }
    if(a.gesture==='point'){
      a.blendBone('leftUpperArm',[.1,-.25,.05],gestureWeight);a.blendBone('leftLowerArm',[0,-.3,0],gestureWeight);a.blendBone('head',[-.06,.12,0],gestureWeight);
    }
    if(a.gesture==='place')for(const[name,angles]of Object.entries(sampleGesture('place',age/Math.max(.1,a.gestureUntil-a.gestureStart))))a.blendBone(name,angles,gestureWeight);
  }
  if(a.carrying){
    const carry={leftUpperArm:[.16,-.41,-.95],rightUpperArm:[.16,.41,.95],leftLowerArm:[0,-1.47,.13],rightLowerArm:[0,1.47,-.13]};
    for(const[name,angles]of Object.entries(carry))a.blendBone(name,angles,a.gesture==='place'?1-gestureWeight:1);
  }
  if(a.bones.hips){
    a.bones.hips.position.copy(a.hipPosition);a.bones.hips.position.y-=.026+.018*w;a.bones.hips.position.y+=Math.abs(Math.sin(phase*2))*.005*w;
  }
  const alpha=1-Math.exp(-delta*12);
  for(const[name,bone]of Object.entries(a.bones)){
    const angles=a.pose[name]||[0,0,0];a.targetEuler.set(...angles);a.targetQuaternion.setFromEuler(a.targetEuler);
    if(a.legacyVRM){a.targetQuaternion.x*=-1;a.targetQuaternion.z*=-1;}
    bone.quaternion.slerp(a.targetQuaternion,alpha);
  }
  a.gestureMix=gestureWeight;a.carryWeight=a.carrying?1:0;
  return gestureWeight;
}
