import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AuthoredMotionLibrary} from '../dist/authored-motion.js';

const data=JSON.parse(await readFile(new URL('../dist/assets/motions/companion-motion.json',import.meta.url),'utf8'));
const motion=new AuthoredMotionLibrary(data);
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
// Rotate a rest-pose bone's anatomical direction using its normalized pose.
function direction(q,side){
  const [x,y,z,w]=q;
  return [(1-2*(y*y+z*z))*side,2*(x*y+w*z)*side,2*(x*z-w*y)*side];
}

test('authored animation preserves normalized bone rotations through the whole cycle',()=>{
  for(const name of ['walk','carry','idle']) for(let step=0;step<137;step++){
    const pose=motion.sample(name,step/137);
    for(const q of Object.values(pose)){
      assert(q.every(Number.isFinite));
      assert(Math.abs(dot(q,q)-1)<1e-8);
    }
  }
});

test('walk and idle rest axes yield hanging arms instead of a T-pose or inverted arms',()=>{
  for(const name of ['walk','idle']) for(let step=0;step<32;step++){
    const pose=motion.sample(name,step/32);
    assert(direction(pose.leftUpperArm,1)[1]<-.7);
    assert(direction(pose.rightUpperArm,-1)[1]<-.7);
  }
});

test('stride offset puts the opposite arm forward at left and right foot contacts',()=>{
  const offset=data.clips.walk.footworkPhaseOffset;
  // Foot planner phase .5 ends the left swing, so the right arm leads there.
  const leftContact=motion.sample('walk',.5+offset);
  const rightContact=motion.sample('walk',offset);
  assert(direction(leftContact.rightUpperArm,-1)[2]>.2);
  assert(direction(leftContact.leftUpperArm,1)[2]<0);
  assert(direction(rightContact.leftUpperArm,1)[2]>.2);
  assert(direction(rightContact.rightUpperArm,-1)[2]<0);
});

test('loop boundaries are continuous and reusable samples do not retain invalid rotations',()=>{
  const out={};
  for(const name of ['walk','carry','idle']){
    const before=motion.sample(name,1-1e-7),after=motion.sample(name,1e-7);
    for(const bone of Object.keys(before)) assert(Math.abs(dot(before[bone],after[bone]))>1-1e-6);
    assert.equal(motion.sample(name,100.25,false,out),out);
    assert.deepEqual(out,motion.sample(name,.25));
  }
});

test('VRM 0 handedness correction preserves y/w and mirrors x/z without changing rotation magnitude',()=>{
  const canonical=motion.sample('walk',.317),legacy=motion.sample('walk',.317,true);
  for(const bone of Object.keys(canonical)){
    for(let i=0;i<4;i++) assert.equal(legacy[bone][i],canonical[bone][i]*(i===0||i===2?-1:1));
    assert(Math.abs(dot(legacy[bone],legacy[bone])-1)<1e-8);
  }
});
