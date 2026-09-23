import {readFileSync,writeFileSync} from 'node:fs';
import {loadVrmFixture,THREE} from '../companion-web/tests/helpers/vrm-fixture.mjs';
import {AuthoredMotionLibrary} from '../companion-web/dist/authored-motion.js';
import {animateBody} from '../companion-web/dist/avatar-body.js';

const data=JSON.parse(readFileSync(new URL('../companion-web/dist/assets/motions/companion-motion.json',import.meta.url),'utf8'));
const motion=new AuthoredMotionLibrary(data),deg=180/Math.PI;
const stats=values=>({mean:values.reduce((s,v)=>s+v,0)/values.length,min:Math.min(...values),max:Math.max(...values)});
const summary={localEuler:{},realModels:{}};

for(const name of ['walk','carry','idle']){
  const samples=[];
  for(let i=0;i<120;i++)samples.push(motion.sample(name,i/120));
  const entries={};
  for(const bone of ['spine','chest','upperChest','neck','head','leftShoulder','rightShoulder','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm']){
    const eulers=samples.map(pose=>new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(pose[bone]),'XYZ'));
    entries[bone]={pitch:stats(eulers.map(e=>e.x*deg)),yaw:stats(eulers.map(e=>e.y*deg)),roll:stats(eulers.map(e=>e.z*deg))};
  }
  summary.localEuler[name]=entries;
}

function bodyState(rig,authored=true,carry=false){
  return{...rig,elapsed:0,legacyVRM:rig.vrm.meta.metaVersion==='0',authoredMotion:authored?motion:null,reduceMotion:false,
    gait:{movingWeight:1,stepWave:0,forwardLean:.46*.038,pelvisDrop:0,lateral:0},
    look:{x:0,y:0},gesture:'idle',gestureStart:-100,gestureUntil:-99,gestureMix:0,carryWeight:carry?1:0,carrying:carry,
    targetEuler:new THREE.Euler(),targetQuaternion:new THREE.Quaternion(),
    footwork:{lastFoot:0,swing:{index:0,age:0,duration:1}},
    poseBone(name,x=0,y=0,z=0){this.pose[name]=[x,y,z];},
    blendBone(name,angles,weight){const original=this.pose[name]||[0,0,0];this.pose[name]=original.map((v,i)=>v+(angles[i]-v)*weight);}
  };
}

function reset(rig){for(const bone of Object.values(rig.bones))bone.quaternion.identity();rig.bones.hips.position.copy(rig.hipPosition);rig.actor.updateMatrixWorld(true);rig.vrm.update(0);rig.actor.updateMatrixWorld(true);rig.restHeadQuaternion??=rig.vrm.humanoid.getRawBoneNode('head').getWorldQuaternion(new THREE.Quaternion());}
function position(rig,name){return rig.vrm.humanoid.getRawBoneNode(name)?.getWorldPosition(new THREE.Vector3());}
function measure(rig){
  const hips=position(rig,'hips'),head=position(rig,'head'),l=position(rig,'leftUpperArm'),r=position(rig,'rightUpperArm'),shoulders=l.clone().add(r).multiplyScalar(.5);
  const result={headForwardCM:(head.z-hips.z)*100,shoulderForwardCM:(shoulders.z-hips.z)*100,
    headLean:Math.atan2(head.z-hips.z,head.y-hips.y)*deg,shoulderLean:Math.atan2(shoulders.z-hips.z,shoulders.y-hips.y)*deg};
  const headRotation=rig.vrm.humanoid.getRawBoneNode('head').getWorldQuaternion(new THREE.Quaternion()).multiply(rig.restHeadQuaternion.clone().invert());
  const facing=new THREE.Vector3(0,0,1).applyQuaternion(headRotation);
  result.headLookDownDegrees=Math.atan2(-facing.y,Math.hypot(facing.x,facing.z))*deg;
  for(const side of ['left','right']){
    const shoulder=position(rig,side+'UpperArm'),elbow=position(rig,side+'LowerArm'),hand=position(rig,side+'Hand');
    const upper=elbow.clone().sub(shoulder),forearm=hand.clone().sub(elbow);
    result[side+'ArmForward']=Math.atan2(upper.z,-upper.y)*deg;
    result[side+'ArmSide']=Math.atan2(Math.abs(upper.x),-upper.y)*deg;
    result[side+'ElbowFlex']=upper.angleTo(forearm)*deg;
    result[side+'HandForwardCM']=(hand.z-hips.z)*100;
  }
  return result;
}

for(const model of ['modern','gentle','future']){
  const rig=await loadVrmFixture(model);reset(rig);const neutral=measure(rig);const modes={neutral};
  for(const mode of ['authored-walk','mixed-walk','procedural-walk','authored-carry','mixed-carry','authored-idle']){
    const clip=mode.endsWith('carry')?'carry':mode.endsWith('idle')?'idle':'walk';
    const state=bodyState(rig,!mode.startsWith('procedural'),clip==='carry'),frames=[];
    for(let i=0;i<120;i++){
      reset(rig);const phase=i/120;
      if(mode.startsWith('authored')){
        const pose=motion.sample(clip,phase,state.legacyVRM);
        for(const [bone,q]of Object.entries(pose))if(rig.bones[bone]&&!/hips|Leg|Foot|Toes/.test(bone))rig.bones[bone].quaternion.fromArray(q);
      }else{
        const footPhase=(phase+.5)%1,foot=footPhase<.5?0:1;
        state.footwork.swing={index:foot,age:(footPhase% .5)*2,duration:1};
        state.gait.stepWave=(foot===0?-1:1)*Math.cos(Math.PI*state.footwork.swing.age);
        state.elapsed=phase*motion.duration(clip);animateBody(state,1);
      }
      rig.vrm.update(0);rig.actor.updateMatrixWorld(true);frames.push(measure(rig));
    }
    modes[mode]=Object.fromEntries(Object.keys(frames[0]).map(key=>[key,stats(frames.map(frame=>frame[key]))]));
  }
  summary.realModels[model]=modes;
}

const dest=new URL('./upper-body-v3-analysis.json',import.meta.url);writeFileSync(dest,JSON.stringify(summary,null,2));
console.log(JSON.stringify({local:summary.localEuler.walk,modern:summary.realModels.modern},null,2));

// Two possible v3 approaches, tested on the same actual modern skeleton.
// A: keep the source mean and merely reduce its excursions.
// B: preserve the excursions but center them on a relaxed anatomical baseline.
const centers={};
for(const clip of ['walk','carry','idle']){
  const sums={},reference=motion.sample(clip,0);
  for(let i=0;i<240;i++)for(const[bone,values]of Object.entries(motion.sample(clip,i/240))){
    const sign=values.reduce((sum,v,j)=>sum+v*reference[bone][j],0)<0?-1:1;
    const sum=sums[bone]??=[0,0,0,0];for(let j=0;j<4;j++)sum[j]+=values[j]*sign;
  }
  centers[clip]=Object.fromEntries(Object.entries(sums).map(([bone,q])=>[bone,new THREE.Quaternion().fromArray(q).normalize()]));
}
const candidateRig=await loadVrmFixture('modern');
const candidateResults={};
for(const mode of ['source-mean-amplitude-055-weight-065','neutral-mean-amplitude-055-weight-065']){
  const frames=[];
  for(let i=0;i<120;i++){
    reset(candidateRig);const phase=i/120,source=motion.sample('walk',phase),step=Math.cos(phase*Math.PI*2);
    const base={
      leftUpperArm:[-.045+step*.14,.065,-1.40],rightUpperArm:[-.045-step*.14,-.065,1.40],
      leftLowerArm:[0,-.25,-.035],rightLowerArm:[0,.25,.035],leftShoulder:[0,0,0],rightShoulder:[0,0,0],
      leftHand:[.015,0,-.045],rightHand:[.015,0,.045]
    };
    const neutral={...base,leftUpperArm:[-.045,.065,-1.40],rightUpperArm:[-.045,-.065,1.40]};
    for(const[bone,values]of Object.entries(source)){
      if(!candidateRig.bones[bone]||/hips|Leg|Foot|Toes/.test(bone))continue;
      const sourceQ=new THREE.Quaternion().fromArray(values),mean=centers.walk[bone];let target=new THREE.Quaternion();
      if(['spine','chest','upperChest'].includes(bone)){
        const residual=mean.clone().invert().multiply(sourceQ),euler=new THREE.Euler().setFromQuaternion(residual);
        target.setFromEuler(new THREE.Euler(0,euler.y*.35,euler.z*.35));
      }else if(base[bone]){
        const sourceResidual=mean.clone().invert().multiply(sourceQ),scaled=new THREE.Quaternion().slerp(sourceResidual,.55);
        const center=mode.startsWith('source')?mean.clone():new THREE.Quaternion().setFromEuler(new THREE.Euler(...neutral[bone]));
        target.setFromEuler(new THREE.Euler(...base[bone])).slerp(center.multiply(scaled),.65);
      }else if(/Index|Middle|Ring|Little|Thumb/.test(bone))continue;
      if(candidateRig.vrm.meta.metaVersion==='0'){target.x*=-1;target.z*=-1;}
      candidateRig.bones[bone].quaternion.copy(target);
    }
    candidateRig.vrm.update(0);candidateRig.actor.updateMatrixWorld(true);frames.push(measure(candidateRig));
  }
  candidateResults[mode]=Object.fromEntries(Object.keys(frames[0]).map(key=>[key,stats(frames.map(frame=>frame[key]))]));
}
writeFileSync(new URL('./upper-body-v3-candidates.json',import.meta.url),JSON.stringify({means:centers,candidates:candidateResults},null,2));
console.log('CANDIDATES',JSON.stringify(candidateResults,null,2));
