# v3 upper-body motion analysis

2026-09-22. Read-only analysis of the local Mesh2Motion clips and current v0.5
upper-body blending. Product code was not changed. Executable research:
`analyze-upper-body-v3.mjs`. Raw outputs: `upper-body-v3-analysis.json` and
`upper-body-v3-candidates.json`.

## Main causes

1. The source walk is forward-curled rather than neutral: chest and upperChest
   each carry approximately +9 degrees of local pitch. Carry doubles that to
   approximately +20 degrees each. Idle also has approximately +10.6 degrees
   at each chest joint. These absolute postures should not be transferred to
   the relaxed studio character without neutralizing them.
2. Current blending weights torso at 90% and neck/head at only 45%. This does
   not preserve the source's compensating neck/head chain. Carry's head facing
   points down by 21.4 degrees on average instead of the source's 7.9 degrees.
3. Source Walk duration is 1.667 seconds. Current approximate stride duration is
   2 × (.367-second swing + .08-second double support) = .894 seconds. Its upper
   body plays approximately 2.27 times faster during each swing, then freezes
   for double support, averaging approximately 1.86 times source speed.
4. Walk's arm mean includes substantially bent elbows and abducted upper arms.
   Compressing variation around that mean alone keeps the braced posture.

## Source local Euler XYZ pitch (degrees)

| Bone | Walk mean (min…max) | Carry mean (min…max) | Idle mean |
| --- | --- | --- | --- |
| spine | 0 | 0 | 0 |
| chest | 9.07 (8.16…9.97) | 19.90 (16.40…23.35) | 10.63 |
| upperChest | 9.16 (8.30…10.00) | 19.96 (16.46…23.36) | 10.63 |
| neck | -9.10 (-9.98…-8.19) | -19.91 (-23.33…-16.40) | -10.63 |
| head | 5.74 (4.31…7.21) | -11.93 (-18.51…-5.11) | 0 |

These are diagnostic Euler values, not recommended interpolation coordinates.

## Actual modern VRM measurements

The reference T-pose's head-to-hips line is already -1.47 degrees (very slightly
rearward), so 0 degrees is not the only valid neutral target. Tests use raw
bones after `vrm.update(0)`, actor facing +Z, 120 uniformly spaced clip phases,
no mouse-look and no gesture. Head facing pitch is calibrated against the same
model's neutral head quaternion. Positive means looking down.

| State | Head-to-hips forward lean | Head facing down | Elbow flex mean | Upper-arm side angle mean |
| --- | ---: | ---: | ---: | ---: |
| Current mixed walk | 6.06° | 14.77° | 36.3° | 13.1° |
| Current mixed carry | 15.11° | 21.43° | 88.9° | 33.4° |
| Source walk upper body | 6.27° | 14.77° | 38.3° | 13.7° |
| Source carry upper body | 15.53° | 7.94° | 58.3° | 23.7° |

Gentle and Future agree with the main conclusion: current mixed walk forward
lean is approximately 6.23 degrees; mixed carry is approximately 15.7 degrees.
Carry elbow flex here is mainly the app's two-handed prop pose and is not the
target to apply to empty-hand walking.

## Candidate comparison

Both candidates remove source absolute torso pitch, preserve torso relative
yaw/roll at .35 amplitude, and keep neck/head on the neutral look direction.
Both reduce source arm excursions to .55 and blend them at .65. The difference
is the center of those excursions.

| Actual modern VRM result | Preserve source mean | Recenter onto relaxed baseline |
| --- | ---: | ---: |
| Elbow flex mean | 31.4° | 18.6° |
| Elbow flex range | 29.6…33.5° | 16.5…21.2° |
| Upper-arm side angle mean | 12.1° | 6.9° |
| Hand ahead of hips mean | approximately 15 cm | 8.35 cm |
| Hand ahead of hips peak | approximately 22 cm | approximately 16 cm |
| Head-to-hips forward lean | -1.48° | -1.48° |
| Head facing down | approximately 0° | approximately 0° |

The recentered candidate is the more useful starting point. These are geometric
predictions from a real model, not a browser visual acceptance result.

## Quaternion mean and correction

Use one-time hemisphere-aligned quaternion averages for each clip and bone.
With these clips' modest excursions, normalized quaternion sums are sufficient;
there is no need for a matrix eigen-solver. Euler averages couple axes for arms
that are already rolled approximately 70–80 degrees and are less robust.

```
mean = normalize(sum(dot(sample, firstSample) < 0 ? -sample : sample))
delta = inverse(mean) * sample
softened = slerp(identity, delta, 0.55)
target = relaxedNeutral * softened
result = slerp(proceduralBase, target, 0.65)
```

Keep this calculation in canonical VRM 1 normalized coordinates; flip quaternion
x/z once at the final boundary for VRM 0. The order of multiplication matters:
the relative excursion is expressed in the mean posture's local frame.

The tested relaxed neutral uses Euler XYZ radians:

- leftUpperArm: `[-.045, .065, -1.40]`
- rightUpperArm: `[-.045, -.065, 1.40]`
- leftLowerArm: `[0, -.25, -.035]`
- rightLowerArm: `[0, .25, .035]`
- shoulders: `[0, 0, 0]`
- left/right hand: `[.015, 0, -.045]` / `[.015, 0, .045]`

The procedural base then adds opposite `step * .14` pitch to the two upper
arms. Hand-carrying should keep the existing intentional two-handed pose and
use the same upright torso behavior as normal walking, not the source carry
clip's load-bearing torso curl.

## Historic v0.4 recovery

This agent's conversation retained only the first 140 lines of v0.4 character.js
and small fragments of animateBody, not a complete plantFeet implementation.
Workspace searches found no old character.js copy. `inspect-vrm-feet.mjs` reads
the current Avatar and retains only old experiment parameters; it is not an
archived implementation. Disabling authoredMotion alone keeps v0.5 Footwork and
state transitions and must not be presented as an exact v0.4 restoration.
