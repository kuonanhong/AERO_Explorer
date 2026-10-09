# Licensed nearby photographs

Copy `place-photos.js` into `dist/` and import `resolvePlacePhotos` from the game controller. Copy the test beside repository tests and change its import to `../dist/place-photos.js`.

## Card integration

1. Prefer the curated local photograph matched to the actual place. Do not make API requests for those cards.
2. For remaining nearby/results cards, call `resolvePlacePhotos(unknownPlaces, {signal, onPhoto})`. It accepts at most the first 8 items, runs at most 2 jobs concurrently, and caps each active job at 6 seconds. It uses a bounded 64-entry memory cache.
3. Create a new AbortController per rendered list. Abort the previous controller when the list, locale, or origin changes. In `onPhoto`, ensure the original card is still connected and belongs to the current render before adding it. Catch AbortError without showing an error banner.
4. Insert `<img loading="lazy" decoding="async">` with `asset.url` and `asset.title` as alt text. Use intrinsic `asset.width` and `asset.height` for layout; use `object-fit:contain` if preserving the full image. Do not claim success until `load` fires. On image error remove that image and keep the actual place's source link.
5. Set all metadata with `textContent`. Show `asset.author`, `asset.attribution` if provided, `asset.credit` if provided, a source link (`asset.sourcePage`), and license link (`asset.licenseUrl`, label `asset.license`). These fields belong beside the image; an article's CC license cannot be substituted for an image's license.
6. The returned asset is a representative image attached to that Wikipedia article. It is not a 360-degree panorama, current live imagery, depth map, or survey of the location. `is360` is always false.
7. A missing image or rejected license returns null. Do not insert an unrelated landscape as if it belonged to the place. The main game keeps working offline or if Wikimedia blocks/rate-limits requests.

`resolvePlacePhoto(place, {signal})` is also exported for an individually selected destination. `createPlacePhotoResolver` exposes fetch injection and bounded cache/concurrency options for tests.

## Verification performed

- `node --test place-photos.test.mjs`: 14 tests passed.
- Cases cover metadata injection, accepted/rejected licenses, source/host validation, shared Commons versus same-name local Wikipedia files, article-original identity, missing files, queue/concurrency limits, cache eviction, timeout, cancellation, and Retry-After cooldown without retries.
- A read-only live API check resolved the English Wikipedia main image for Cheng Shiu University (正修科技大學) and Commons metadata: `Gate and Building of Cheng Shiu University.JPG`, photographer SSR2000, CC BY-SA 3.0. The actual current thumbnail host was `thumb.wikimedia.org`; this exact host is supported along with `upload.wikimedia.org`. Response fixture is `live-sample.json`. This verifies the live API response contract, not actual LINE-browser rendering or a 100,000-user capacity test.

## Primary API documentation

- https://www.mediawiki.org/wiki/API:Pageimages — main image name/original and `pilicense=free`.
- https://www.mediawiki.org/wiki/API:Imageinfo — per-file source, thumbnail, mime, and extended metadata.
- https://www.mediawiki.org/wiki/Extension:CommonsMetadata — HTML-formatted Artist, Credit, Attribution and individually assigned image licenses; ambiguous multiple-license data is deliberately rejected.
- https://www.mediawiki.org/wiki/API:Etiquette — bounded requests, caching, identifiable Api-User-Agent.
- https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits — concurrency at most 3 and respect for Retry-After.

For a large public launch, use curated self-hosted images as the primary experience. These dynamic calls are a best-effort supplementary service with no capacity guarantee. No Wikimedia tiles/images are bulk-downloaded or prefetched by this resolver.
