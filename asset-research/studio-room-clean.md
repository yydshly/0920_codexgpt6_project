# Studio room background asset

Output: `studio-room-clean.png` — **1487 × 1058 px**.

Source: `D:/codex/home/generated_images/01a0c871-8297-7770-822a-d569c36049a3/exec-721b62d6-376e-4e47-88da-06f9b9bd6a08.png`.

Generated with the built-in imagegen edit tool; inspected visually. No person, person shadow, walking route, UI, typography, or task-board remnants remain. Composition and major furniture positions are retained.

## Normalized geometry

Coordinates use image top-left `(0, 0)`, bottom-right `(1, 1)`. Rectangles are `[x, y, width, height]` and are approximate visual measurements.

| Surface | Normalized rectangle |
| --- | --- |
| Three file boxes, combined | `[0.055, 0.323, 0.154, 0.112]` |
| First / project box face | `[0.060, 0.325, 0.052, 0.107]` |
| Second / notes box face | `[0.124, 0.347, 0.040, 0.086]` |
| Third box face | `[0.172, 0.348, 0.035, 0.087]` |
| Blank monitor inner screen | `[0.392, 0.251, 0.201, 0.143]` |
| Blank task board inner face | `[0.682, 0.146, 0.189, 0.199]` |
| Whole task board frame | `[0.673, 0.132, 0.218, 0.227]` |
| Cabinet | `[0.000, 0.429, 0.221, 0.318]` |
| Desk, including legs | `[0.305, 0.435, 0.434, 0.239]` |
| Window-side chair | `[0.766, 0.431, 0.234, 0.328]` |

Foreground walkable strip: approximately `y = 0.731–0.807`, `x = 0.150–0.853`. Keep actor feet toward this strip to avoid overlapping the baked desk chair. Suggested standing foot points: cabinet `(0.246, 0.749)`, desk-left `(0.405, 0.752)`, task-board `(0.719, 0.755)`, window `(0.813, 0.770)`. These are placement suggestions; they do not establish a physically navigable 3D room.

## Final prompt

Use case: precise-object-edit.
Asset type: clean room background plate for an interactive 3D companion webpage.
Image 1 is the EDIT TARGET. Edit this exact image, preserving the original room geometry, fixed camera, perspective, composition, framing, colors, daylight, shadows of furniture, and all furniture positions. Output at the same approximately 1488x1056 size/aspect ratio.
Remove the entire woman (head, hair, torso, both arms, legs, feet), her shadow, and any reflected/ghost remnants; naturally reconstruct the wall, plants, cabinet, desktop and floor that she obscures. Remove the dashed walking route and circular target on the floor; leave continuous clean wood flooring.
Remove ALL app/UI overlays including top-left logo and title/tagline, top-right buttons and window controls, every floating furniture label, bottom command input bar, icons and status/caption. Naturally reconstruct the room behind all of them.
Keep the left wooden cabinet and its three upright file boxes in the EXACT same positions, with plain empty paper label areas, no Chinese text, no glowing outlines. Keep the middle desk, chair, keyboard, lamp and computer in the EXACT same positions. Make the computer display a plain unlit dark charcoal blank screen with no interface or text. Keep the large rectangular wood-framed task board in the upper-right EXACT same position and size, but make its entire inner surface clean flat very pale warm cream, no writing, no photos, no colored pins, no sticky notes or drawings. Keep the right window and upholstered armchair/pillow/throw in exactly the same places. Remove decorative poster typography on the back wall, leaving a plain pale beige poster. Remove writing from visible book spines, retaining books.
This is a precise removal/edit pass, not a redesign. Do not move or resize furniture, do not add any furniture or person. Preserve the open walkable band of floor in the foreground. No labels, no watermarks, no UI, no words anywhere. Highest-quality coherent background restoration with no person remnants.
