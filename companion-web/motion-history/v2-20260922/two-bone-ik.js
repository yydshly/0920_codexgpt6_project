// Research helper, deliberately outside the website. THREE is dependency-injected.
// Works with normalized VRM nodes and arbitrary rest orientations.
// Solve AFTER body/root transforms, BEFORE vrm.update(delta).
export function makeTwoBoneIK(THREE, upper, lower, end) {
  const v = () => new THREE.Vector3();
  const h=v(), k=v(), e=v(), axis=v(), bend=v(), kneeGoal=v(), endGoal=v();
  const from=v(), to=v(), fallback=v();
  const qDelta=new THREE.Quaternion(), qWorld=new THREE.Quaternion();
  const qParent=new THREE.Quaternion();
  upper.updateWorldMatrix(true, true);
  upper.getWorldPosition(h); lower.getWorldPosition(k); end.getWorldPosition(e);
  const a=h.distanceTo(k), b=k.distanceTo(e);
  if(a < 1e-6 || b < 1e-6) throw new Error('IK requires non-zero leg segments');
  const epsilon=(a+b)*0.002;

  function setWorldRotation(node, quaternion) {
    if(node.parent) {
      node.parent.getWorldQuaternion(qParent).invert();
      node.quaternion.copy(qParent).multiply(quaternion);
    } else node.quaternion.copy(quaternion);
    node.updateWorldMatrix(false, true);
  }

  function aim(node, currentDirection, desiredDirection) {
    if(currentDirection.lengthSq()<1e-12 || desiredDirection.lengthSq()<1e-12)return;
    qDelta.setFromUnitVectors(currentDirection.normalize(), desiredDirection.normalize());
    node.getWorldQuaternion(qWorld);
    qWorld.premultiply(qDelta);
    setWorldRotation(node,qWorld);
  }

  return {
    upperLength:a, lowerLength:b, reach:a+b-epsilon,
    // ankleTarget/polePoint/footWorldQuaternion are WORLD coordinates.
    // polePoint = hipWorld + characterForwardWorld * 1 metre.
    // Returns endpoint clamping error, not the residual numerical IK error.
    solve(ankleTarget,polePoint,footWorldQuaternion=null) {
      upper.updateWorldMatrix(true,true);
      upper.getWorldPosition(h);
      axis.subVectors(ankleTarget,h);
      const requested=axis.length();
      if(requested<1e-9)axis.set(0,-1,0);else axis.divideScalar(requested);
      const d=THREE.MathUtils.clamp(requested,Math.abs(a-b)+epsilon,a+b-epsilon);
      endGoal.copy(h).addScaledVector(axis,d);
      // Project the knee pole onto the plane perpendicular to hip->ankle.
      bend.subVectors(polePoint,h);
      bend.addScaledVector(axis,-bend.dot(axis));
      if(bend.lengthSq()<1e-10) {
        lower.getWorldPosition(k);
        bend.subVectors(k,h).addScaledVector(axis,-from.subVectors(k,h).dot(axis));
      }
      if(bend.lengthSq()<1e-10) {
        fallback.set(Math.abs(axis.x)<0.8?1:0,Math.abs(axis.x)<0.8?0:1,0);
        bend.copy(fallback).addScaledVector(axis,-fallback.dot(axis));
      }
      bend.normalize();
      const along=(a*a+d*d-b*b)/(2*d);
      const height=Math.sqrt(Math.max(0,a*a-along*along));
      kneeGoal.copy(h).addScaledVector(axis,along).addScaledVector(bend,height);
      lower.getWorldPosition(k);
      aim(upper,from.subVectors(k,h),to.subVectors(kneeGoal,h));
      lower.getWorldPosition(k);end.getWorldPosition(e);
      aim(lower,from.subVectors(e,k),to.subVectors(endGoal,k));
      if(footWorldQuaternion)setWorldRotation(end,footWorldQuaternion);
      return Math.abs(requested-d);
    }
  };
}
