# Walk experiments — 2026-09-22

The app exposes all three styles through **走路效果**. Selecting a style saves
`preferences.walkStyle`; it does not change the character or workspace records.
Use **走一段看看** for a comparable crossing, or click a blank part of the room.

| Style | Preserved implementation | Provenance |
| --- | --- | --- |
| 01 最初步态 | `dist/locomotion-v1.js`, `dist/avatar-body-v1.js` | v0.4 foot planning/body methods restored from the original source read in this task, adapted to the current Footwork API. |
| 02 上一版步态 | `dist/locomotion.js`, `dist/avatar-body.js` | Unmodified v0.5 gait/body implementation. Source snapshot in `v2-20260922/`. |
| 03 轻松步态 | `dist/locomotion-v3.js`, `dist/avatar-body-v3.js` | New experiment; pelvis-centered contact planning, upright torso, relaxed arm rotations. |

01 preserves the original .29 s swing / .035 s double-support, velocity × .16
foot chasing, flat feet, fixed crouch and independent distance-driven arm phase.
The restored core is also snapshotted in `v1-restored-20260922/`.
The old movement controller is not restored wholesale: all styles use the
current cancellable navigation controller. The later `place` gesture is a
compatibility addition for the current studio workflow. This is a restored gait
core, not an exact full-application snapshot.

02 includes a pre-change copy of character.js and its motion modules for further
comparison. Snapshot text normalizes line endings only. The files are archival
source, not a standalone hosted app; shared models, vendor modules and motion
assets remain in dist. The current 02 gait/body modules are kept unchanged.

03 removes the source walk/carry clip's sustained torso bend using normalized
hemisphere-aligned quaternion means. Arms are centered on a relaxed pose rather
than the source's bent elbows. Upper-body phase is damped across double support.
Foot targets compensate for the avatar rig's rest ankles sitting behind the
hips; grounded support remains fixed, with minimal reach correction after the
body pose is applied. Full cloth/prop collision remains outside this prototype.

Future experiments should add a new pair of modules and a new style ID, leaving
these comparison implementations available.
