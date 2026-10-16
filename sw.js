/* AERO Explorer v6 service worker: the app shell works offline after the first visit; map tiles, weather and AI APIs stay live. */
const VERSION = '6.0.0-1dfce44c0c';
const SHELL = 'aero6-shell-' + VERSION, LIB = 'aero6-lib-v1';
const PRECACHE = ["./", "index.html", "app/aero-v6.js", "config.js", "manifest.webmanifest", "data/places.json", "data/missions.json", "data/mission-scenes.json", "vendor/three/build/three.module.js", "icons/icon-192.png", "icons/icon-512.png", "icons/icon.svg", "vendor/three/examples/jsm/postprocessing/EffectComposer.js", "vendor/three/examples/jsm/postprocessing/RenderPass.js", "vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js", "vendor/three/examples/jsm/postprocessing/ShaderPass.js", "vendor/three/examples/jsm/postprocessing/OutputPass.js", "vendor/three/examples/jsm/postprocessing/Pass.js", "vendor/three/examples/jsm/postprocessing/MaskPass.js", "vendor/three/examples/jsm/shaders/CopyShader.js", "vendor/three/examples/jsm/shaders/LuminosityHighPassShader.js", "vendor/three/examples/jsm/shaders/OutputShader.js", "vendor/three/examples/jsm/utils/BufferGeometryUtils.js"];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => /^aero/i.test(k) && k !== SHELL && k !== LIB).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;            // tiles, weather, Wikipedia, AI: always network
  if (/\/(models)\//.test(url.pathname)) return;                                         // large weights: browser/transformers.js cache
  const lib = /\/vendor\//.test(url.pathname) || /\/data\/catalogue-details-/.test(url.pathname);
  if (lib) {                                                                             // versioned libraries and data: cache first
    e.respondWith(caches.open(LIB).then(async c => { const hit = await c.match(req); if (hit) return hit; const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; }));
    return;
  }
  e.respondWith((async () => {                                                            // app shell: network first, cache fallback
    const c = await caches.open(SHELL);
    try { const r = await fetch(req); if (r.ok && r.type === 'basic') c.put(req, r.clone()); return r; }
    catch { return (await c.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? c.match('index.html') : Response.error()); }
  })());
});
