# Actual v3 upper-body validation

2026-09-22. `tests/upper-body-v3.mjs` invokes the actual exported functions from
`dist/avatar-body.js` (v2) and `dist/avatar-body-v3.js`, with the three checked-in
VRM skeletons through `loadVrmFixture`. It does not substitute a proposed
formula. **9/9 tests passed; process exit 0.**

Both modules receive the same alternating swing/dual-support input to isolate
the upper-body change. Each state runs for 540 frames at 60 fps; the first 120
frames are discarded for posture measurements. Source motion sampling,
quaternion centering, posture blending and VRM normalized-to-raw updates all run
through production modules. Tests inspect the final raw bone positions and
head rotation, and assert finite, unit rotations on every frame.

## Final measurements

Angles are degrees. Positive head-facing pitch means looking down. Head-to-hips
lean is measured relative to world vertical, with each model's neutral value
provided separately. Walking and light-folder carrying have the same v3 torso
behavior by design; hands and elbows still use different carry poses.

| Model | Neutral head/hips lean | v2 walk lean | v3 walk/carry lean | v2 carry lean |
| --- | ---: | ---: | ---: | ---: |
| modern | -1.47 | 5.92 | -1.92 | 14.64 |
| gentle | -1.68 | 6.09 | -2.14 | 15.24 |
| future | -1.66 | 6.09 | -2.13 | 15.21 |

All three models' head-facing pitch results:

- v2 walk mean: **14.49° down**.
- v2 carry mean: **20.05° down**.
- v3 walk and carry mean: **-0.62°**, range **-1.18° to +0.13°**.

Empty-hand elbows on all models average approximately **20.2°** flexion, with a
combined range approximately **18.1–22.7°**. Their average upper-arm side angle
stays below 10°. Carry elbows retain the intended two-handed pose within the
50–115° test range. Head/hips alignment remains upright and the head does not
flip away from the walking direction.

The improvements are established for actual model geometry under controlled
inputs. They do not constitute browser visual acceptance, cloth collision
validation, or a complete evaluation of locomotion; those are separate checks.
