# Companion motion data

`companion-motion.json` contains three animation clips from the official
[Mesh2Motion animation library](https://github.com/Mesh2Motion/mesh2motion-app/tree/main/static/animations),
downloaded on 2026-09-22. Mesh2Motion's [README](https://github.com/Mesh2Motion/mesh2motion-app#licenses)
and [asset license](https://github.com/Mesh2Motion/mesh2motion-app/blob/main/LICENSE-CC0.MD)
expressly release its animations under **CC0 1.0 Universal**. Credits: Mesh2Motion
contributors. The app does not distribute any third-party character mesh from
this animation bundle.

Original file: `static/animations/human-base-animations.glb` (5,656,648 bytes).
Its SHA-256 is recorded in the compact file. Selected source clips:

| Runtime name | Source clip | Duration | Use |
| --- | --- | --- | --- |
| walk | Walk | 1.666667 s | Relaxed full stride cycle |
| carry | Walk_Carry | 2.0 s | Walking with hands held in front |
| idle | Idle_A | 3.125 s | Standing idle |

The compact file preserves authored local rotations for 52 VRM human bones.
Meshes, textures, scale tracks and root translations are omitted. Rotations are
transformed to the VRM 1 normalized humanoid frame using the source rig's world
rest rotations. The source saved skeleton is the true T-pose: its transform times
each skin inverse-bind matrix differs from identity by at most 0.000000732.
The separate current `rig-human.glb` file has different rest proportions and is
deliberately **not** used as the reference.

The source walk and carry cycles have left heel contact at phase 0, right heel
contact at .5; right/left swing midpoints are .25/.75. The app's foot planner
starts phase 0 with left toe-off, so sample with `footworkPhase + .5`.
Sample phase is one full two-foot stride. Source keyframes are 24 fps; the
sampler interpolates quaternions between keys. Both loops have matching first
and last poses. `legacyVRM=true` flips quaternion x and z as required when
applying VRM 1 normalized rotations to VRM 0 normalized bones.

Reproducible extraction script: `asset-research/prepare-companion-motion.py`
in the parent workspace. Runtime sampling requires no additional libraries.

## CC0 1.0 Universal

All 3d models, blend files, rigs, animations.

By marking the work with a CC0 public domain dedication, the creator is giving
up their copyright and allowing reusers to distribute, remix, adapt, and build
upon the material in any medium or format, even for commercial purposes.

Full legal text: https://creativecommons.org/publicdomain/zero/1.0/legalcode
