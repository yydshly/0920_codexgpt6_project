# Minimal planted-foot locomotion for the current VRM desktop prototype

Research example only. No website file was changed.

## Immediate integration choice

Use the bounded analytic helper in `two-bone-ik-example.mjs` with the VRM **normalized** `leftUpperLeg`, `leftLowerLeg`, `leftFoot` (and right equivalents). These world-space calculations account for each node's actual parents. Do **not** apply the existing VRM0 quaternion X/Z sign conversion to the IK result a second time. That conversion can remain for hand-authored Euler poses elsewhere.

`verify-two-bone-ik.mjs` checked 800 reachable targets across imported model yaw 0/180 degrees and actor yaw 0/90/-90/160 degrees. Maximum ankle endpoint error was 4.62e-16 m. This proves the analytic endpoint solve, not model-specific skinning, joint comfort, or visual quality.

## Why the current gait slides

`character.js` drives body translation in screen XY, leg angles with a sine, and heading with a capped `direction * 1.18`. A foot is never stored as a fixed world-space contact. The foot correction only changes overall Y. Therefore even a tuned stride cannot guarantee that the support foot stays put. Also, returning heading to -0.12 as soon as movement stops rotates both soles against the floor.

## Coordinate contract

- Three.js world Y is height. Walking belongs on the XZ plane.
- Actor +Z is its visual forward after the VRM0 scene correction; validate once by turning it right. Use `atan2(vx, vz)` for the heading, **not** sign(vx) times a fixed angle.
- The knee pole is `hipWorld + forwardWorld * 1m`, where `forwardWorld = (0,0,1).applyQuaternion(actorWorldQuaternion)`.
- Capture each neutral ankle position in actor-local coordinates, plus its world quaternion relative to the actor, after setting a neutral standing pose.
- Ground contact height is floorY plus the ankle-to-sole height measured once from the model. Neutral foot orientation is also captured once; do not assume foot local identity means horizontal.

The current camera looks straight at the XY plane, so screen Y cannot represent walking into depth. The smallest honest fix is horizontal walking, treating the few pixels of UI baseline motion as a shared floor-height offset for **both** foot contacts. Preserve planted X/Z; add the floor delta to both planted/swing endpoints before solving. For actual diagonal desktop walking, introduce camera pitch and raycast each screen target to a horizontal ground plane. This is a separate visual-mapping change; do not interpret screen Y as world height while claiming a fixed 3D floor.

## Fixed contact targets and one swing at a time

Store this for each foot:

```js
{
  position: new THREE.Vector3(),  // actual desired ankle in world
  quaternion: new THREE.Quaternion(), // desired world foot orientation
  planted: true
}
```

Keep at most one `swing = { side, age, duration, from, to, fromQ, toQ }`. During support, **never recompute foot.position from actor.position**. It remains locked while the actor moves. Recompute only a separate candidate landing target:

```js
const neutral = restLocalAnkle.clone().applyQuaternion(actorQ).add(actorWorldPosition);
const landing = neutral.addScaledVector(worldVelocity, duration * 0.55);
landing.y = floorY + soleHeight;
const landingQ = actorQ.clone().multiply(restFootQuaternionRelativeToActor);
```

First-step constants for a roughly 1.6 m character: root speed <= 0.55 m/s, swing duration 0.28–0.34 s, lift 0.035–0.055 m, double support 0.04 s. Use actual model height to scale these. A distant click increases travel time, not speed beyond the gait's bound.

After the double-support delay, choose the trailing foot if walking. It is the smaller value of `(foot.position - root.position).dot(forward)`. On a standing turn or settling, choose the foot with greatest neutral-target discrepancy. Start a step when positional error exceeds 0.05 m (walking), 0.035 m (settling), or foot orientation differs from current neutral by > 0.26 rad. When starting, cache `to` and `toQ`: chasing a moving landing target during the swing looks like skating. Alternate when errors are tied.

```js
// Update the swing target; do NOT interpolate solved bone rotations afterward.
swing.age += dt;
const u = Math.min(1, swing.age / swing.duration);
const e = u*u*(3-2*u);
foot.position.lerpVectors(swing.from, swing.to, e);
foot.position.y += Math.sin(Math.PI*u) * lift;
foot.quaternion.slerpQuaternions(swing.fromQ, swing.toQ, e);
if (u === 1) {
  foot.position.copy(swing.to);
  foot.quaternion.copy(swing.toQ);
  foot.planted = true;
  swing = null;
  doubleSupportRemaining = 0.04;
}
```

Floor-height changes are applied to *both* from and to before this interpolation; do not add cumulative lift to a persistent position.

## Two-bone IK call

```js
// Once after loading and posing:
const leftIK = makeTwoBoneIK(THREE, bones.leftUpperLeg, bones.leftLowerLeg, bones.leftFoot);

// Each frame after setting actor/root, hips, and upper-body pose:
actor.updateMatrixWorld(true);
const hipWorld = bones.leftUpperLeg.getWorldPosition(tempHip);
const pole = tempPole.copy(hipWorld).add(forwardWorld);
const reachError = leftIK.solve(leftFootTarget.position, pole, leftFootTarget.quaternion);
// Repeat right, then vrm.update(dt), then render.
```

Do not run the sine leg poses **after** IK. Do not slerp the final upper/lower leg quaternions: that moves the ankle off its fixed contact. Smooth root velocity and foot targets instead. Remove the old post-solve `actor.position.y += floor - lowest` correction because it would move the solved contacts. Keep pelvis sufficiently low that both targets remain reachable (about 0.02–0.03 m knee flexion from full extension). The helper clamps impossible targets; `reachError > 0.01m` is a signal to stop root progression/lower the pelvis/replant a foot, not permission to stretch the leg.

## Turning, stopping and cancellation

- Before translating, rotate toward the travel direction with a bounded angular speed around 1.2–1.6 rad/s. If heading error > 0.5 rad, remain in turn-in-place. Root translation ramps up after alignment; planted ankles remain world-locked and the step planner places them under the new heading.
- Stop walking in its current heading. Then request a separate turn-in-place to face the user. Do not blend the whole actor to frontal while both feet remain in their old local positions.
- Foot world orientation stays locked during support. Update it during the swing with the interpolation above. This prevents the sole spinning against the floor.
- `cancel()` resolves the current command as false immediately and clears its destination. Freeze world root translation, retain contact state, finish the active swing using a safe landing near the stopped root, then at most one settling step. Do not zero the gait state or reset bones mid-air.
- Explicit 360-degree spin should be represented by an unwrapped yaw goal, with the same alternating contact steps. A shortest-angle interpolator alone treats +2π as no turn.
- A resize, close-up mode switch, home reset, or reduced-motion teleport changes the coordinate mapping. Clear the gait and seed both foot contacts from the new neutral pose immediately; never drag old world targets into the new coordinate system.

## Scope recommendation

Implement this helper and planted contacts now. Imported walk clips still require matching root speed and foot locks, so an unverified generic clip does not fix this bug. The previously checked official VRoid pack has no idle/walk and prohibits extractable redistribution. No external clip was downloaded or introduced in this research step.
