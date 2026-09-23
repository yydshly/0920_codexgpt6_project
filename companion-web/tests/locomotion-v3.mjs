import test from 'node:test';
import assert from 'node:assert/strict';
import {loadVrmFixture,THREE} from './helpers/vrm-fixture.mjs';
import {Footwork} from '../dist/locomotion-v3.js';
import {Footwork as PreviousFootwork} from '../dist/locomotion.js';

const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
async function rig(model='gentle',Gait=Footwork){
  const fixture=await loadVrmFixture(model),{actor,vrm,bones,hipPosition,modelHeight}=fixture;
  actor.rotation.y=Math.PI/2;const gait=new Gait(THREE,actor,bones,hipPosition,modelHeight);
  function frame(speed=.46,{turn=0,stopping=false}={}){
    actor.position.x+=speed/60;actor.rotation.y+=turn/60;
    const state=gait.advance(1/60,{velocity:new THREE.Vector3(speed,0,0),turnRate:turn,moving:Math.abs(speed)>.001,stopping});
    bones.hips.position.copy(hipPosition);bones.hips.position.y-=state.pelvisDrop;bones.hips.position.x+=state.lateral;
    actor.updateMatrixWorld(true);gait.solve();vrm.update(1/60);actor.updateMatrixWorld(true);
    return state;
  }
  return{...fixture,gait,frame};
}
function measureWalking(subject,frames=360){
  const {frame,gait,bones,vrm}=subject,drops=[],centers=[],supportOffsets=[],kneeFlex=[],steps=[];
  let bothBehind=0,samples=0,maxResidual=0,previousStep=gait.stepNumber;
  for(let tick=0;tick<frames;tick++){
    const state=frame();if(gait.stepNumber!==previousStep){steps.push(gait.lastFoot);previousStep=gait.stepNumber;}
    if(tick<120)continue;
    const hip=bones.hips.getWorldPosition(new THREE.Vector3()),offsets=gait.feet.map(foot=>foot.position.x-hip.x);
    drops.push(state.pelvisDrop);centers.push(mean(offsets));samples++;
    if(offsets.every(offset=>offset<0))bothBehind++;
    if(gait.swing)supportOffsets.push(offsets[1-gait.swing.index]);
    for(const foot of gait.feet){
      const upper=bones[foot.side+'UpperLeg'].getWorldPosition(new THREE.Vector3()),knee=bones[foot.side+'LowerLeg'].getWorldPosition(new THREE.Vector3());
      const ankle=vrm.humanoid.getRawBoneNode(foot.side+'Foot').getWorldPosition(new THREE.Vector3());
      maxResidual=Math.max(maxResidual,ankle.distanceTo(foot.position));
      kneeFlex.push(Math.PI-knee.clone().sub(upper).angleTo(knee.clone().sub(ankle)));
    }
  }
  return{meanDrop:mean(drops),maxDrop:Math.max(...drops),meanCenter:mean(centers),meanSupport:mean(supportOffsets),bothBehind:bothBehind/samples,meanKnee:mean(kneeFlex),maxResidual,steps};
}

for(const model of ['modern','gentle','future'])test(`v3 ${model}: balanced support, near-upright pelvis, reachable feet and stable stop`,async()=>{
  const subject=await rig(model),metrics=measureWalking(subject);
  assert.ok(Math.abs(metrics.meanCenter)<.018,`${model}: mean ankle center offset ${metrics.meanCenter}`);
  assert.ok(Math.abs(metrics.meanSupport)<.018,`${model}: mean support offset ${metrics.meanSupport}`);
  assert.ok(metrics.bothBehind<.15,`${model}: both ankles behind pelvis ${metrics.bothBehind}`);
  assert.ok(metrics.meanDrop<.011,`${model}: average pelvis drop ${metrics.meanDrop}`);
  assert.ok(metrics.maxDrop<.02,`${model}: maximum pelvis drop ${metrics.maxDrop}`);
  assert.ok(metrics.maxResidual<.002,`${model}: ankle residual ${metrics.maxResidual}`);
  for(let index=1;index<metrics.steps.length;index++)assert.notEqual(metrics.steps[index],metrics.steps[index-1]);
  let state;for(let tick=0;tick<180;tick++)state=subject.frame(0,{stopping:true});
  assert.equal(state.settled,true);assert.equal(subject.gait.swing,null);assert.ok(state.pelvisDrop<.007);
  const steps=subject.gait.stepNumber;for(let tick=0;tick<120;tick++)subject.frame(0);
  assert.equal(subject.gait.stepNumber,steps,'standing idle must not keep shuffling');
});

test('v3 materially reduces gentle rig forward-loaded stance against preserved v2',async()=>{
  const previous=measureWalking(await rig('gentle',PreviousFootwork));
  const next=measureWalking(await rig('gentle'));
  assert.ok(Math.abs(next.meanCenter)<Math.abs(previous.meanCenter)*.3);
  assert.ok(next.meanDrop<previous.meanDrop*.65);
  assert.ok(next.bothBehind<previous.bothBehind*.3);
  assert.ok(next.meanKnee<previous.meanKnee*.85);
});

test('v3 locks support anchors through a full walk',async()=>{
  const {gait,frame}=await rig();
  for(let tick=0;tick<240;tick++){
    const before=gait.feet.map(foot=>foot.flat.clone()),oldSwing=gait.swing?.index;frame();
    for(let index=0;index<2;index++)if(index!==oldSwing&&index!==gait.swing?.index)assert.ok(gait.feet[index].flat.distanceTo(before[index])<1e-8);
  }
});

test('v3 cancels in mid-step then completes a turn without root drift',async()=>{
  const {gait,frame,actor}=await rig();let tick=0;
  do{frame();tick++;}while((!gait.swing||gait.swing.age/gait.swing.duration<.4)&&tick<150);
  assert.ok(gait.swing);const stoppedX=actor.position.x;let state;
  for(let i=0;i<130;i++)state=frame(0,{stopping:true});
  assert.equal(state.settled,true);assert.equal(actor.position.x,stoppedX);
  for(let i=0;i<90;i++)frame(0,{turn:-1});
  for(let i=0;i<130;i++)state=frame(0,{stopping:true});
  assert.equal(state.settled,true);assert.equal(actor.position.x,stoppedX);
  for(const foot of gait.feet)assert.ok(foot.heading.angleTo(actor.quaternion)<.13);
});

test('v3 keeps cruise torso lean zero and uses restrained toe/heel roll',async()=>{
  const {gait,frame}=await rig();let smallest=0,largest=0,state;
  for(let tick=0;tick<180;tick++){
    state=frame();for(const foot of gait.feet){smallest=Math.min(smallest,foot.pitch);largest=Math.max(largest,foot.pitch);}
  }
  assert.ok(Math.abs(state.forwardLean)<.0001);
  assert.ok(largest>.10&&largest<=.131);assert.ok(smallest<-.05&&smallest>=-.066);
});
