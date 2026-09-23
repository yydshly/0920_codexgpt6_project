# Companion avatar asset

Selected: `VRM1_Constraint_Twist_Sample.vrm` v1.0.1, from pixiv's official three-vrm example models. VRM 1.0, real skinned 3D humanoid, long brown hair and feminine anime styling. The embedded thumbnail is extracted as `thumbnail.png` for identification; use the VRM itself for rendering.

- Download URL: https://raw.githubusercontent.com/pixiv/three-vrm/release/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm
- Source page: https://github.com/pixiv/three-vrm/blob/release/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm
- Model public license: https://vrm.dev/licenses/1.0/
- Model SHA256: `12C2B97E95E700783A6A550DC0EEE2D7880AEEDCCEF9AE67BC4C5A2F0F2631A2`

## Verified embedded license settings

Read directly from the downloaded model's GLB JSON chunk, at `extensions.VRMC_vrm.meta`, and exported separately to `model-meta.json`:

- authors: `pixiv Inc.`
- copyrightInformation: `(c) 2022 pixiv Inc.`
- licenseUrl: `https://vrm.dev/licenses/1.0/`
- avatarPermission: `everyone`
- commercialUsage: `corporation`
- allowRedistribution: `true`
- modification: `allowModificationRedistribution`
- creditNotation: `unnecessary`
- allowAntisocialOrHateUsage: `false`

These settings allow the normal companion prototype/demo use, and redistribution of the asset. The model is governed by its embedded VRM public license settings; do not incorrectly label the model as MIT merely because the loader code is MIT.

Suggested optional credit: **3D sample avatar: pixiv Inc. © 2022. VRM Public License 1.0.** Link the model source and license.

## Runtime recommendation

Use `three@0.180.0` and `@pixiv/three-vrm@3.5.5`, a matching pairing currently used by the official release repository. Use the WebGL renderer, which supports the MToon materials without an additional WebGPU material integration.

Official version evidence: https://raw.githubusercontent.com/pixiv/three-vrm/release/packages/three-vrm/package.json

Loading flow:

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

const loader = new GLTFLoader();
loader.register(parser => new VRMLoaderPlugin(parser));
const gltf = await loader.loadAsync('/models/companion.vrm');
const vrm = gltf.userData.vrm;
scene.add(vrm.scene);

// Modify normalized bones, not raw bones, while autoUpdateHumanBones is enabled.
const head = vrm.humanoid.getNormalizedBoneNode('head');
if (head) head.rotation.y = 0.1;
vrm.expressionManager?.setValue('happy', 0.25);
vrm.expressionManager?.setValue('blink', 0.0);

// Every animation frame: update programmatic animation first, then the VRM.
vrm.update(deltaSeconds);
renderer.render(scene, camera);
```

The asset contains a complete humanoid skeleton (including fingers and eye bones), 18 preset expression entries, MToon materials, spring bones, and node constraints. It contains no animation clips, so idle breathing, head tracking, waves, and simple pose transitions should be implemented procedurally using normalized humanoid bones. Its expression presets include `happy`, `relaxed`, `sad`, `surprised`, `angry`, `blink`, `blinkLeft`, `blinkRight`, and phonemes `aa`, `ih`, `ou`, `ee`, `oh`. Look direction uses a bone-based `lookAt` controller; its directional expression entries have no morph bindings.

For a desktop portrait: load once; clamp frame delta after hidden tabs; add directional and hemisphere light; use transparent WebGL canvas over the room/background; set a relaxed arm pose before displaying the character, and show loading progress while downloading the 10.3 MB asset. Set `vrm.lookAt.target` to a `THREE.Object3D` placed near the camera/pointer direction for eye tracking. Cap expression and bone movement amplitudes for subtle idle behavior. Keep the VRM metadata intact.

Official API references:

- Loading / render loop: https://github.com/pixiv/three-vrm/blob/release/packages/three-vrm/examples/basic.html
- Humanoid bones / normalized poses: https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMHumanoid.html
- Expression weights: https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMExpressionManager.html
- Eye target: https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMLookAt.html

Research completed 2026-09-22. Download and embedded metadata verified; no browser rendering test was performed in this asset-only research task.
