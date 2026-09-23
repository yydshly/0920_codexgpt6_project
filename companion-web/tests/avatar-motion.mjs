import test from 'node:test';
import assert from 'node:assert/strict';
import {loadVrmFixture,THREE} from './helpers/vrm-fixture.mjs';
import {readFileSync} from 'node:fs';
import {AuthoredMotionLibrary} from '../dist/authored-motion.js';
const {Avatar}=await import('../dist/character.js');
globalThis.requestAnimationFrame=()=>0;
globalThis.document={hidden:false};

async function fixture(model,walkStyle='v2'){
  const rig=await loadVrmFixture(model),a=Object.create(Avatar.prototype);
  Object.assign(a,rig,{walkStyle,elapsed:0,x:200,y:640,width:1200,areaHeight:900,height:570,unit:rig.modelHeight/570,
    yaw:-.9,turnOffset:0,angularSpeed:0,movementSpeed:0,direction:1,manual:0,loaded:true,
    faceHeading:-.9,gesture:'idle',gestureStart:0,gestureUntil:0,gestureMix:0,carryWeight:0,
    walkWeight:0,gaitPhase:0,reduceMotion:false,pointer:{active:false},look:{x:0,y:0},
    targetEuler:new THREE.Euler(),targetQuaternion:new THREE.Quaternion(),worldPoint:new THREE.Vector3(),
    legacyVRM:rig.vrm.meta.metaVersion==='0',eyeTarget:new THREE.Object3D(),
    nextBlink:2.8,blinkStart:-10,expression:{},clock:{getDelta:()=>1/60},renderer:{render(){}},
    folder:{material:{opacity:0,map:null}},updatePosition(){this.actor.position.set(this.x*this.unit,(this.areaHeight-this.y)*this.unit-this.modelFloor,0);}});
  a.authoredMotion=new AuthoredMotionLibrary(JSON.parse(readFileSync(new URL('../dist/assets/motions/companion-motion.json',import.meta.url),'utf8')));
  a.updatePosition();a.seedFeet();return a;
}

for(const style of ['v2','v3'])for(const model of ['modern','gentle','future'])test(`${style} ${model}: arrive only after braking, turning and planting both feet`,async()=>{
  const a=await fixture(model,style),done=a.moveTo(650,640,{heading:.2});
  let reachedAt=null,maxSpeed=0,preArrivalSpeed=0,maxError=0;
  for(let frame=0;frame<1200&&a.walk;frame++){
    if(!a.walk.arrived)preArrivalSpeed=a.movementSpeed;
    a.tick();maxSpeed=Math.max(maxSpeed,a.velocity.length());
    if(a.walk?.arrived&&reachedAt===null)reachedAt=a.elapsed;
    for(const foot of a.contacts){const raw=a.vrm.humanoid.getRawBoneNode(foot.side+'Foot').getWorldPosition(new THREE.Vector3());maxError=Math.max(maxError,raw.distanceTo(foot.position));}
  }
  assert.equal(a.walk,null,`${model} did not finish: ${a.motionState}, gait ${JSON.stringify(a.gait)}`);
  assert.equal(await done,true);assert.equal(a.x,650);assert.ok(a.gait.settled);
  assert.ok(a.elapsed-reachedAt>.08);assert.ok(Math.abs(a.yaw-.2)<.03);
  assert.ok(maxSpeed>.35);assert.ok(preArrivalSpeed<.15,`hard stop speed ${preArrivalSpeed}`);
  assert.ok(maxError<.009,`${model} ankle target error ${maxError}`);
});
test('cancelling mid-stride stops travel and settles without late arrival or gesture',async()=>{
  const a=await fixture('gentle'),done=a.moveTo(900,640,{heading:.2});
  for(let i=0;i<140;i++)a.tick();assert.ok(a.walk);a.play('point',2.4);a.cancel();const stoppedX=a.x;
  assert.equal(await done,false);
  for(let i=0;i<240;i++)a.tick();assert.equal(a.x,stoppedX);assert.equal(a.pendingGesture,null);assert.ok(a.gait.settled);
});
test('a gesture requested after walking waits for the stance to settle',async()=>{
  const a=await fixture('modern');a.manual=1;
  for(let i=0;i<140;i++)a.tick();a.manual=0;a.play('wave',2.8);
  assert.equal(a.pendingGesture?.name,'wave');
  for(let i=0;i<240&&a.pendingGesture;i++)a.tick();
  assert.equal(a.pendingGesture,null);assert.equal(a.gesture,'wave');assert.ok(a.gait.settled);
});
test('all three preserved styles can be selected and finish a walk after interrupting another style',async()=>{
  const a=await fixture('gentle');
  for(const style of ['v1','v2','v3']){
    const cancelled=a.moveTo(850,640);for(let i=0;i<80;i++)a.tick();
    assert.equal(a.setWalkStyle(style),style);assert.equal(await cancelled,false);assert.equal(a.walk,null);
    const target=a.x>450?300:650,done=a.moveTo(target,640,{heading:-.12});
    for(let i=0;i<1200&&a.walk;i++)a.tick();
    assert.equal(a.walk,null,`${style} never settled`);assert.equal(await done,true);assert.equal(a.x,target);assert.ok(a.gait.settled);
  }
});
