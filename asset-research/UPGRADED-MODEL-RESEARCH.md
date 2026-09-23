# Refined companion model candidates

Research date: 2026-09-22. Three candidates were downloaded, their GLB declared byte lengths matched against the downloaded sizes, embedded license metadata extracted, and embedded thumbnail images inspected. Official creator pages were checked independently. No site files were changed.

## Best choice: Victoria Rubin

Use `Victoria_Rubin-curl.vrm` (15,479,480 bytes, VRM 0.x). It is the official pixiv / VRoid beta sample now called **β Ver AvatarSample_4**. It has a complete pink/white/gold dress design, flared layered skirt, detailed sleeves and cuffs, gold buttons, white stockings, pink shoes, blonde-to-pink hair and a green side-ponytail ribbon. It better matches a polished anime companion than the plain technical example model.

- Verified official full-body reference: `Victoria-full.png`
- Extracted model thumbnail: `Victoria_Rubin-thumbnail.png`
- Extracted model license: `Victoria_Rubin-meta.json`
- Download mirror: https://cdn.jsdelivr.net/gh/madjin/vrm-samples@master/vroid/beta/Victoria_Rubin.vrm
- Mirror source: https://github.com/madjin/vrm-samples/blob/master/vroid/beta/Victoria_Rubin.vrm
- Author's license page: https://vroid.pixiv.help/hc/en-us/articles/360014900233
- Official naming history identifying Victoria_Rubin: https://vroid.pixiv.help/hc/en-us/articles/4402035114777
- Embedded license: `licenseName: CC0`, `allowedUserName: Everyone`, `commercialUssageName: Allow`
- Official creator page independently confirms CC0 and pixiv Inc.'s copyright waiver.
- Suggested optional attribution: `Victoria Rubin — VRoid / pixiv Inc., CC0 1.0`.
- SHA256: `B1372131BDBF233F46320146D565F342A7E4F6F4B8F2AEFB301F1A283EC07E1E`
- 54 humanoid bones, 15 blend shape groups, 28,928 triangles.

## Alternative: AvatarSample_A

Use `AvatarSample_A-curl.vrm` (15,096,320 bytes, VRM 0.0). More detailed contemporary anime face, short brown hair with pink tips, iris detail and blush. Suitable if the user prefers a modern casual companion rather than a costume.

- Extracted thumbnail and license: `AvatarSample_A-thumbnail.png`, `AvatarSample_A-meta.json`
- Download mirror: https://cdn.jsdelivr.net/gh/madjin/vrm-samples@master/vroid/stable/AvatarSample_A.vrm
- Official model page: https://hub.vroid.com/en/characters/2843975675147313744/models/5644550979324015604
- Official conditions: https://vroid.pixiv.help/hc/en-us/articles/4402394424089
- Embedded author: `VRoid`; embedded license: `Other` (no URL in this exported copy), Everyone, commercial use allowed.
- The official Hub page explicitly allows redistribution, modification and commercial use, attribution not required. It is **not CC0**. The linked terms prohibit charging for redistributing the original model and using its data for a character creation service. A normal free companion demo is within the allowed usage.
- SHA256: `B86B0B8A66D48911431D6F920A5211A974226F83AA672ECA3F3DFADE58AC346E`
- 54 humanoid bones, 15 blend shape groups, 24,854 triangles.

## Alternative: Vita

Use `Vita-curl.vrm` (14,359,044 bytes, VRM 0.x). Silver/blue bob, heterochromia, electronic cat ears, cyan/navy futuristic performance outfit. Strong design identity, but cooler and more futuristic than a gentle desktop companion.

- Verified official full-body reference: `Vita-full.png`
- Extracted thumbnail and license: `Vita-thumbnail.png`, `Vita-meta.json`
- Download mirror: https://cdn.jsdelivr.net/gh/madjin/vrm-samples@master/vroid/beta/Vita.vrm
- Author's license page: https://vroid.pixiv.help/hc/en-us/articles/360014900113
- Embedded `licenseName: CC0`, Everyone, commercial use allowed. Official pixiv page independently confirms CC0.
- SHA256: `F2BF78F28A24E2F75F5CA0B6C3B646654C394E4B03592DFAA0D0633EF0972B4D`
- 54 humanoid bones, 15 blend shape groups, 26,130 triangles.

## Integration detail for all three

These are VRM 0.x files, with forward direction -Z. Call `VRMUtils.rotateVRM0(vrm)` after loading to use the same +Z convention as the prior VRM 1.0 model. Continue using current three-vrm's normalized humanoid APIs and expression manager, which handle VRM0 compatibility. Inspect `vrm.expressionManager.expressionMap` rather than assuming unsupported names such as surprised exist. Source preset names include neutral/a/i/u/e/o/blink/blink_l/blink_r/angry/fun/joy/sorrow plus two custom groups.

The model files are downloaded from a community mirror of official VRoid samples; the actual licenses are established by the creator's official pages and the embedded metadata, not by the mirror README alone. Author fields are blank in the two beta exports, but official creator attribution is pixiv Inc. The embedded portraits were checked for consistency with official images. No claims are made that the mirror binaries match an inaccessible official Hub download byte-for-byte.
