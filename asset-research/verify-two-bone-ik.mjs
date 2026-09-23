import * as THREE from '../companion-web/dist/vendor/three.core.js';
import {makeTwoBoneIK} from './two-bone-ik-example.mjs';

let maximumError=0;
for(const importedYaw of [0,Math.PI])for(const actorYaw of [0,Math.PI/2,-Math.PI/2,2.8]) {
  const actor=new THREE.Group(),model=new THREE.Group(),hip=new THREE.Group();
  const upper=new THREE.Bone(),lower=new THREE.Bone(),foot=new THREE.Bone();
  actor.add(model);model.add(hip);hip.add(upper);upper.add(lower);lower.add(foot);
  model.rotation.y=importedYaw;actor.rotation.y=actorYaw;
  actor.position.set(.8,.2,-.1);hip.position.y=.86;upper.position.x=.08;
  lower.position.y=-.42;foot.position.y=-.40;
  actor.updateMatrixWorld(true);
  const ik=makeTwoBoneIK(THREE,upper,lower,foot);
  const hipWorld=upper.getWorldPosition(new THREE.Vector3());
  const forward=new THREE.Vector3(0,0,1).applyQuaternion(actor.quaternion);
  const side=new THREE.Vector3(1,0,0).applyQuaternion(actor.quaternion);
  const pole=hipWorld.clone().add(forward);
  const footOrientation=foot.getWorldQuaternion(new THREE.Quaternion());
  for(let i=0;i<100;i++) {
    const target=hipWorld.clone().add(new THREE.Vector3(0,-.73,0))
      .addScaledVector(forward,.18*Math.sin(i*.31))
      .addScaledVector(side,.045*Math.cos(i*.21));
    ik.solve(target,pole,footOrientation);
    const error=foot.getWorldPosition(new THREE.Vector3()).distanceTo(target);
    maximumError=Math.max(maximumError,error);
    if(error>1e-7)throw new Error(`Endpoint drift ${error}`);
    const qerror=foot.getWorldQuaternion(new THREE.Quaternion()).angleTo(footOrientation);
    if(qerror>1e-7)throw new Error(`Foot orientation drift ${qerror}`);
  }
}
console.log(JSON.stringify({cases:800,maximumEndpointErrorMetres:maximumError}));
