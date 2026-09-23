import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.core.js';
import {Footwork} from '../dist/locomotion.js';

function rig(){
  const actor=new THREE.Group(),hips=new THREE.Bone();hips.position.y=.9;actor.add(hips);const bones={hips};
  for(const [side,x]of [['left',.055],['right',-.055]]){
    const upper=new THREE.Bone(),lower=new THREE.Bone(),foot=new THREE.Bone();upper.position.set(x,-.025,0);lower.position.y=-.39;foot.position.set(0,-.395,0);hips.add(upper);upper.add(lower);lower.add(foot);
    Object.assign(bones,{[side+'UpperLeg']:upper,[side+'LowerLeg']:lower,[side+'Foot']:foot});
  }
  actor.rotation.y=Math.PI/2;actor.updateMatrixWorld(true);
  const neutral=hips.position.clone(),gait=new Footwork(THREE,actor,bones,neutral,1.6);
  function frame(v=.44,{turn=0,stopping=false}={}){
    const dt=1/60;actor.position.x+=v*dt;actor.rotation.y+=turn*dt;
    const state=gait.advance(dt,{velocity:new THREE.Vector3(v,0,0),turnRate:turn,moving:Math.abs(v)>.001,stopping});
    hips.position.copy(neutral);hips.position.y-=state.pelvisDrop;hips.position.x+=state.lateral;actor.updateMatrixWorld(true);gait.solve();
    return state;
  }
  return{actor,bones,gait,frame};
}

test('walking alternates feet with a deliberate cadence',()=>{
  const {gait,frame}=rig();let last=0;const sides=[];
  for(let i=0;i<300;i++){frame();if(gait.stepNumber!==last){sides.push(gait.lastFoot);last=gait.stepNumber;}}
  assert.ok(sides.length>=10&&sides.length<=13,`five-second footfalls: ${sides.length}`);
  for(let i=1;i<sides.length;i++)assert.notEqual(sides[i],sides[i-1]);
});
test('support anchors remain fixed and the IK feet reach their targets',()=>{
  const {gait,frame,bones}=rig();let maxError=0;
  for(let i=0;i<360;i++){
    const before=gait.feet.map(foot=>foot.flat.clone()),oldSwing=gait.swing?.index;frame();
    for(let index=0;index<2;index++){
      if(index!==oldSwing&&index!==gait.swing?.index)assert.ok(gait.feet[index].flat.distanceTo(before[index])<1e-8);
      const actual=bones[gait.feet[index].side+'Foot'].getWorldPosition(new THREE.Vector3());maxError=Math.max(maxError,actual.distanceTo(gait.feet[index].position));
    }
  }
  assert.ok(maxError<.004,`largest endpoint error ${maxError}`);
});
test('a cancelled mid-step walk lands and settles under the body',()=>{
  const {gait,frame}=rig();for(let i=0;i<67;i++)frame();
  assert.ok(gait.swing);let state;
  for(let i=0;i<150;i++)state=frame(0,{stopping:true});
  assert.equal(state.settled,true);assert.equal(gait.swing,null);
  assert.ok(state.pelvisDrop<.014);assert.ok(Math.abs(state.stepWave)<.001);
});
test('a turn in place replants feet without translating the root',()=>{
  const {gait,frame,actor}=rig();for(let i=0;i<90;i++)frame(0,{turn:-1});
  let state;for(let i=0;i<120;i++)state=frame(0,{stopping:true});
  assert.equal(state.settled,true);assert.equal(actor.position.x,0);assert.ok(gait.stepNumber>=3);
  for(const foot of gait.feet)assert.ok(foot.heading.angleTo(actor.quaternion)<.13);
});
test('toe-off and heel landing change foot pitch while idle returns flat',()=>{
  const {gait,frame}=rig();let min=0,max=0;
  for(let i=0;i<90;i++){frame();for(const foot of gait.feet){min=Math.min(min,foot.pitch);max=Math.max(max,foot.pitch);}}
  assert.ok(max>.12);assert.ok(min<-.07);
  for(let i=0;i<120;i++)frame(0,{stopping:true});
  for(const foot of gait.feet)assert.ok(Math.abs(foot.pitch)<.001);
});

for(const model of ['modern','gentle','future'])test(`actual ${model} VRM reaches its footsteps and settles upright`,async()=>{
  const {loadVrmFixture}=await import('./helpers/vrm-fixture.mjs');
  const {actor,vrm,bones,hipPosition,modelHeight}=await loadVrmFixture(model);actor.rotation.y=Math.PI/2;
  const gait=new Footwork(THREE,actor,bones,hipPosition,modelHeight);let maxError=0,state;
  for(let frame=0;frame<480;frame++){
    const speed=frame<300?.46:0;actor.position.x+=speed/60;
    state=gait.advance(1/60,{velocity:new THREE.Vector3(speed,0,0),moving:speed>0,stopping:speed===0});
    bones.hips.position.copy(hipPosition);bones.hips.position.y-=state.pelvisDrop;bones.hips.position.x+=state.lateral;
    actor.updateMatrixWorld(true);gait.solve();vrm.update(1/60);actor.updateMatrixWorld(true);
    for(const foot of gait.feet){const actual=vrm.humanoid.getRawBoneNode(foot.side+'Foot').getWorldPosition(new THREE.Vector3());maxError=Math.max(maxError,actual.distanceTo(foot.position));}
  }
  assert.ok(maxError<.005,`${model} greatest ankle target residual ${maxError}`);
  assert.equal(state.settled,true);assert.ok(state.pelvisDrop<.012,`${model} idle drop ${state.pelvisDrop}`);
});
