import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadVrmFixture,THREE} from './helpers/vrm-fixture.mjs';
import {AuthoredMotionLibrary} from '../dist/authored-motion.js';
import {animateBody as animateV2} from '../dist/avatar-body.js';
import {animateBody as animateV3} from '../dist/avatar-body-v3.js';

const library=new AuthoredMotionLibrary(JSON.parse(readFileSync(new URL('../dist/assets/motions/companion-motion.json',import.meta.url),'utf8')));
const degrees=180/Math.PI;
const summarize=values=>({mean:values.reduce((sum,value)=>sum+value,0)/values.length,min:Math.min(...values),max:Math.max(...values)});
const reports={};

function point(a,name){return a.vrm.humanoid.getRawBoneNode(name).getWorldPosition(new THREE.Vector3());}
function metrics(a,restHead){
  const hips=point(a,'hips'),head=point(a,'head'),direction=head.clone().sub(hips);
  const headRotation=a.vrm.humanoid.getRawBoneNode('head').getWorldQuaternion(new THREE.Quaternion()).multiply(restHead.clone().invert());
  const facing=new THREE.Vector3(0,0,1).applyQuaternion(headRotation);
  const result={headLean:Math.atan2(direction.z,direction.y)*degrees,
    headPitch:Math.atan2(-facing.y,Math.hypot(facing.x,facing.z))*degrees,
    upright:direction.normalize().y,facingForward:facing.z};
  for(const side of ['left','right']){
    const shoulder=point(a,side+'UpperArm'),elbow=point(a,side+'LowerArm'),hand=point(a,side+'Hand');
    const upper=elbow.clone().sub(shoulder),lower=hand.clone().sub(elbow);
    result[side+'Elbow']=upper.angleTo(lower)*degrees;
    result[side+'ArmSide']=Math.atan2(Math.abs(upper.x),-upper.y)*degrees;
  }
  return result;
}

async function simulate(model,version,carrying){
  const rig=await loadVrmFixture(model);
  rig.vrm.update(0);rig.actor.updateMatrixWorld(true);
  const restHead=rig.vrm.humanoid.getRawBoneNode('head').getWorldQuaternion(new THREE.Quaternion());
  const neutral=metrics(rig,restHead);
  const a={...rig,elapsed:0,legacyVRM:rig.vrm.meta.metaVersion==='0',authoredMotion:library,reduceMotion:false,
    gait:{movingWeight:1,stepWave:0,forwardLean:.013,pelvisDrop:.012,lateral:0},
    look:{x:0,y:0},gesture:'idle',gestureStart:-100,gestureUntil:-99,gestureMix:0,carryWeight:carrying?1:0,carrying,
    targetEuler:new THREE.Euler(),targetQuaternion:new THREE.Quaternion(),footwork:{lastFoot:0,swing:null},
    poseBone(name,x=0,y=0,z=0){this.pose[name]=[x,y,z];},
    blendBone(name,angles,weight){const base=this.pose[name]||[0,0,0];this.pose[name]=base.map((value,i)=>value+(angles[i]-value)*weight);}
  };
  const update=version===3?animateV3:animateV2,frames=[];
  // Drive both actual body modules with the same walking/dual-support inputs.
  // This isolates their posture change from the separate locomotion tests.
  for(let frame=0;frame<540;frame++){
    a.elapsed=frame/60;
    const foot=Math.floor(a.elapsed/.63)%2,age=a.elapsed%.63;
    a.footwork.swing=age<.50?{index:foot,age,duration:.50}:null;a.footwork.lastFoot=foot;
    a.gait.stepWave=(foot===0?-1:1)*Math.cos(Math.PI*Math.min(1,age/.50));
    update(a,1/60);a.vrm.update(1/60);a.actor.updateMatrixWorld(true);
    for(const [name,bone]of Object.entries(a.bones)){
      assert(bone.quaternion.toArray().every(Number.isFinite),`${model} v${version} ${name}: nonfinite rotation`);
      assert(Math.abs(bone.quaternion.lengthSq()-1)<1e-4,`${model} v${version} ${name}: nonunit rotation`);
      assert(bone.getWorldPosition(new THREE.Vector3()).toArray().every(Number.isFinite),`${model} v${version} ${name}: nonfinite position`);
    }
    if(frame>=120)frames.push(metrics(a,restHead));
  }
  return{neutral,stats:Object.fromEntries(Object.keys(frames[0]).map(key=>[key,summarize(frames.map(frame=>frame[key]))]))};
}

for(const model of ['modern','gentle','future']){
  const computed=Promise.all([simulate(model,2,false),simulate(model,3,false),simulate(model,2,true),simulate(model,3,true)])
    .then(([v2Walk,v3Walk,v2Carry,v3Carry])=>reports[model]={v2Walk,v3Walk,v2Carry,v3Carry});

  test(`${model}: v3 actual walk body removes sustained forward lean and downward head facing`,async()=>{
    const {v2Walk:before,v3Walk:after}=await computed;
    const beforeLean=Math.abs(before.stats.headLean.mean-before.neutral.headLean);
    const afterLean=Math.abs(after.stats.headLean.mean-after.neutral.headLean);
    assert(afterLean<2.5,`relative lean ${afterLean} degrees`);
    assert(afterLean<beforeLean*.4,`lean did not improve: ${beforeLean} -> ${afterLean}`);
    assert(Math.abs(after.stats.headPitch.mean)<3,`head pitch ${after.stats.headPitch.mean}`);
    assert(Math.abs(after.stats.headPitch.mean)<Math.abs(before.stats.headPitch.mean)*.35);
    assert(after.stats.headPitch.min>-5&&after.stats.headPitch.max<5);
  });

  test(`${model}: v3 light-folder posture remains upright instead of inheriting heavy-carry hunch`,async()=>{
    const {v2Carry:before,v3Carry:after}=await computed;
    const beforeLean=Math.abs(before.stats.headLean.mean-before.neutral.headLean);
    const afterLean=Math.abs(after.stats.headLean.mean-after.neutral.headLean);
    assert(afterLean<3.5,`carry relative lean ${afterLean} degrees`);
    assert(afterLean<beforeLean*.35,`carry lean did not improve: ${beforeLean} -> ${afterLean}`);
    assert(Math.abs(after.stats.headPitch.mean)<5,`carry head pitch ${after.stats.headPitch.mean}`);
    assert(Math.abs(after.stats.headPitch.mean)<Math.abs(before.stats.headPitch.mean)*.35);
    assert(after.stats.headPitch.min>-7&&after.stats.headPitch.max<7);
  });

  test(`${model}: v3 actual arms relax while both walking and carrying remain finite and upright`,async t=>{
    const {v2Walk,v2Carry,v3Walk:walk,v3Carry:carry}=await computed;
    for(const side of ['left','right']){
      const elbow=walk.stats[side+'Elbow'];
      assert(elbow.mean>10&&elbow.mean<28,`${side} mean elbow flex ${elbow.mean}`);
      assert(elbow.min>5&&elbow.max<36,`${side} elbow range ${elbow.min}..${elbow.max}`);
      assert(walk.stats[side+'ArmSide'].mean<10,`${side} empty-hand arm abducted too far`);
      assert(carry.stats[side+'Elbow'].mean>50&&carry.stats[side+'Elbow'].mean<115,`${side} invalid two-handed hold`);
    }
    for(const state of [walk,carry]){
      assert(state.stats.upright.min>.98,'head/hips line tipped out of upright range');
      assert(state.stats.facingForward.min>.95,'head facing flipped away from the walking direction');
    }
    t.diagnostic(JSON.stringify({model,v2:{walkPitch:v2Walk.stats.headPitch.mean,walkLean:v2Walk.stats.headLean.mean,carryPitch:v2Carry.stats.headPitch.mean,carryLean:v2Carry.stats.headLean.mean},neutralLean:walk.neutral.headLean,walk:{headPitch:walk.stats.headPitch,headLean:walk.stats.headLean,leftElbow:walk.stats.leftElbow,rightElbow:walk.stats.rightElbow},carry:{headPitch:carry.stats.headPitch,headLean:carry.stats.headLean}}));
  });
}
