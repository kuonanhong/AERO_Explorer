# AERO v4.1 photograph motion

Copy `scene.js`, `lite-scene.js`, `photo-motion.js`, `photo-layer.js`, and `ecology.js`
into dist. If the initial four files were already copied, only `scene.js` and
`ecology.js` changed afterward: photographic scenery hides the procedural sky clouds
and birds, which would otherwise float in front of a forest/museum photograph. Water
ecology continues unchanged.

## What changes

The former screen-fixed photo and panorama now respond to vehicle translation.
A smooth depth prior places lower image regions at an assumed 38-metre depth and
upper regions at up to 320 metres. Forward motion magnifies the near regions more
than distant regions; reverse motion undoes that; strafe moves scenery opposite to
the vehicle. The prior is deliberately not asserted to be measured depth. The same
position returns the same view. Moving from first to third person uses a camera offset.

WebGL uses one fullscreen triangle with a photo reprojection shader. Normal photos
use an inverse perspective sample; 360 photos intersect a translated, assumed-radius
sphere and retain continuous 360-degree yaw. Canvas2D uses 32 horizontal strips for
photos or 28 wrapped strips for panoramas, with the same motion/depth equations.
There is no image model, GPU compute pass, downloaded depth network, or hidden terrain.

The generated marine reef background uses the same bounded image reprojection with
an independent origin. Lake rocks/plants/fish remain the original 3D ecology. The 3D
fish and vehicle retain their world-space motion. A sparse, low-opacity group of ground
crosses supplies an explicit simulated distance reference when the photo's limited
reprojection envelope is reached; it is absent underwater.

## Limits and labels

Only already photographed pixels are reprojected. This cannot reveal the rear of a
building, create surveyed terrain, or provide unlimited travel through a photograph.
The translation is softly limited (tanh) to forward ±22 m, sideways ±12 m and vertical
±8 m around its reference pose. This is a rendering limit, not a vehicle physics limit.
Near flow remains continuous but becomes progressively weaker as the envelope is
reached. The reference crosses continue to move with the actual vehicle coordinates.

`world.stats.photoMotion` is null when image reprojection is inactive, otherwise:

```js
{ method: 'photo-2.5d' | 'panorama-reprojection' | 'underwater-2.5d',
  limited: true | false,
  distance: /* actual vehicle displacement from the photographic anchor, metres */ }
```

The existing `sceneryType` values remain compatible (`photo`, `panorama`, or
`panorama-strip` in Lite). `resetCamera` preserves photo position; a new `setScenery`
resets its photo origin. Transitioning between surface and water resets the appropriate
independent photo origin. Stats `limited` should trigger a below-viewport notice.

Suggested labels (outside the unobstructed viewport):

- 照片景深模擬：前後與左右移動會產生近遠視差；景深為視覺近似，非實測3D地形。
- 已接近這張照片可重投影的範圍。可返回原位、改選景點，或切換3D訓練場。
- 水下影像與生態為模擬；背景具有移動視差，不代表所選湖泊的實測湖底。
- Photo depth preview: movement creates approximate near/far parallax; this is not a surveyed 3D scene.
- Near this photo's reprojection limit. Return, choose another destination, or switch to the 3D training scene.

## Validation

`photo-motion.test.mjs` is a portable mathematical test; place it in tests and it reads
`../dist/photo-motion.js`, or set AERO_PHOTO_MOTION_MODULE to the module path.

`motion-qa.cjs` / `motion-qa.html` are environment-specific browser QA files and should
not be distributed as portable customer tests without changing their runtime paths.
They render color targets and measure actual pixel centroids for both renderers:

| At 640px width | Base near target x | Forward 6m | Backward 6m | Right 6m |
|---|---:|---:|---:|---:|
| WebGL | 516.5 | 546.1 | 499.9 | 483.9 |
| Canvas2D | 510.5 | 541.1 | 494.2 | 478.1 |

Tests verify correct directions, stronger near vs far flow, exact return to the
starting pose, 360 translation, underwater background translation, the limit flag,
PNG capture, and texture stability over repeated photo/clear cycles (3/2 each cycle,
including the retained reef image and FPV target). No JavaScript or shader errors.
Actual Taipingshan photographs were inspected at initial and forward positions.
Screenshots show nearby rails and plants expanding while more distant areas move less.
