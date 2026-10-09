import {build} from 'esbuild';
import fs from 'node:fs';import path from 'node:path';
const translations=JSON.parse(fs.readFileSync(new URL('../dist/assets/i18n.json',import.meta.url),'utf8'));
fs.writeFileSync(new URL('../dist/assets/i18n.js',import.meta.url),'export const translations='+JSON.stringify(translations)+';\n');
const root=path.resolve('dist');const origin=(process.env.AERO_ORIGIN||'https://aero-drone-flight.kuonanhong.chatgpt.site').replace(/\/+$/,'');
await build({entryPoints:[path.join(root,'game.js')],outfile:path.join(root,'game.bundle.js'),bundle:true,minify:true,format:'iife',target:'es2018',legalComments:'inline'});
await build({entryPoints:[path.join(root,'render-entry.js')],outfile:path.join(root,'renderer3d.bundle.js'),bundle:true,minify:true,format:'iife',target:'es2018',legalComments:'inline'});
const template=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<meta\s+content="([^"]*)"\s+(name|property)="([^"]*)"\s*\/?>/g,(_,value,type,key)=>`<meta ${type}="${key}" content="${value}">`);

const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const alternatives=Object.keys(translations).map(lang=>`<link rel="alternate" hreflang="${lang}" href="${origin}/${lang}/">`).join('\n')+`\n<link rel="alternate" hreflang="x-default" href="${origin}/">`;
function generate(locale,isRoot=false){const t=translations[locale];let html=template.replace(/<link\b(?=[^>]*\brel="(?:canonical|alternate)")[^>]*>\s*/g,'');
 html=html.replace(/<html[^>]*>/,`<html lang="${locale}" dir="${locale==='ar'?'rtl':'ltr'}" data-locale="${locale}"${isRoot?' data-auto-locale="true"':''}>`);
 html=html.replace(/<title>.*?<\/title>/,`<title>${escape(t.title)} | AERO</title>`);
 html=html.replace(/(<meta name="description" content=")[^"]*(">)/,(_,a,b)=>a+escape(t.searchBody)+b);
 html=html.replace(/(<meta property="og:title" content=")[^"]*(">)/,(_,a,b)=>a+escape(t.title)+b);
 html=html.replace(/(<meta property="og:description" content=")[^"]*(">)/,(_,a,b)=>a+escape(t.searchBody)+b);
 html=html.replace(/(<([a-z0-9-]+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g,(_,open,tag,key,old,close)=>open+escape(t[key]||old)+close);
 html=html.replace(/<link rel="canonical"[^>]*>\s*/g,'').replace(/<link rel="alternate"[^>]*>\s*/g,'');
 const url=isRoot?origin+'/':origin+'/'+locale+'/';
 if(!isRoot)html=html.replace('<head>','<head><base href="../">');
 html=html.replace('</head>',`\n<link rel="canonical" href="${url}">\n${alternatives}\n</head>`);
 const schema={'@context':'https://schema.org','@graph':[{'@type':'VideoGame',name:t.title,description:t.searchBody,url,inLanguage:locale,applicationCategory:'GameApplication',operatingSystem:'Web browser',gamePlatform:['Web browser','Mobile browser'],isAccessibleForFree:true,offers:{'@type':'Offer',price:'0',priceCurrency:'TWD'}},{'@type':'FAQPage',inLanguage:locale,mainEntity:[{'@type':'Question',name:t.faqQuestion,acceptedAnswer:{'@type':'Answer',text:t.faqAnswer}},{'@type':'Question',name:t.zoneQuestion,acceptedAnswer:{'@type':'Answer',text:t.zoneAnswer}}]}]};
 html=html.replace(/(<script type="application\/ld\+json" id="schema">)[\s\S]*?(<\/script>)/,(_,a,b)=>a+JSON.stringify(schema).replaceAll('<','\\u003c')+b);
 if(isRoot)fs.writeFileSync(path.join(root,'index.html'),html);else{fs.mkdirSync(path.join(root,locale),{recursive:true});fs.writeFileSync(path.join(root,locale,'index.html'),html);}
}
for(const locale of Object.keys(translations))generate(locale);generate('zh-Hant',true);
fs.writeFileSync(path.join(root,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['',...Object.keys(translations)].map(l=>`<url><loc>${origin}/${l?l+'/':''}</loc></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(root,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
fs.writeFileSync(path.join(root,'llms.txt'),`# AERO Explorer v4.1

Free browser-based air, land and underwater vehicle simulator in 22 languages. Each visitor runs a separate simulation locally. Keyboard Mode 2, multitouch sticks and on-screen directional keys. Beginner assisted, Sport and manual-throttle Expert modes. FPV and third-person cameras. Hardware hints and a small graphics probe select Canvas 2D, balanced WebGL or full WebGL; sustained low FPS and graphics context loss reduce quality.

- [Play](${origin}/)
- [English](${origin}/en/)
- [繁體中文](${origin}/zh-Hant/)
- [CAA reference](https://drone.caa.gov.tw/zh-TW/Default/WebGuide)

## Controls
Left: W/S rise or dive, A/D yaw. Right: arrows forward/back and sideways. W/S do not change height in land mode. V camera, Space pause, R reset. Mobile: two simultaneous virtual sticks or directional keypads. No account, background click or telemetry service is required. Language, tutorial and best-score preferences remain in local browser storage. Coordinates remain in memory; owner browser API configuration is public. Location requests go to selected external map/encyclopedia services. Photo passport stamps remain in local browser storage.

## Maps and places
The default location map uses visible OpenStreetMap raster tiles with explicit attribution, up to nine displayed tiles and three concurrent requests. No Google consumer iframe is used. Unavailable tiles leave a labeled coordinate grid and nearby markers. Standard public tiles have no high-traffic SLA; configure an appropriately provisioned provider before large-scale deployment. An official external Google Maps URL is always available. Owners may explicitly configure the supported Embed API via googleEmbedKey and mapMode. file:// uses the local coordinate grid without tile requests. Vehicle coordinates update at 5 Hz; map recentering requires both 15 seconds and 50 metres except explicit travel/recenter. Startup geolocation requests browser permission once; refusal keeps a clearly labeled example. GPS accuracy and simulated vehicle coordinates are distinct. Browser language preferences choose among 22 locales; explicit locale URLs and user choices override that default.

Eleven curated destinations include Yellowstone, Taipingshan, the National Palace Museum and Kaohsiung. Twenty-six downloaded, attributed photographs use public-domain, CC0 or CC BY/SA licenses; photo files and licenses are included. Two actual 360-degree photographs are at Boai Park in Zhunan, Taiwan, and Wilder Kaiser in Austria. Photos use bounded estimated-depth reprojection: forward expansion, reversed backward flow and opposite-direction lateral parallax; 360 images also support rotation. Photo extent is finite, not reconstructed or surveyed 3D terrain. The game separately renders original 3D vehicles and ecology. Museum photos do not promise current exhibitions. Fourteen Kaohsiung POIs have mapped local images, including Cheng Shiu University. The hospital image is explicitly a historical 2013 on-site cafe interior, not an exterior or current photograph. Online Wikipedia nearby/search supplies real primary coordinates, credited CC BY-SA excerpts and article links. Nearby article thumbnails are loaded on demand only after Commons origin and explicit image licensing are verified, with visible author and license. Missing results are never invented. The place guide uses sourced text and keyword topics, not an AI chatbot or current restaurant review service.

Google Maps JavaScript 3D, Street View and Places are optional owner-configured services with API restrictions, billing, quotas and regional coverage. No key is bundled; billed 3D imagery has not been validated. Water ecology and its original AI reef training background remain simulated; estimated-depth reprojection adds forward/back and lateral movement to that background too. No Google imagery is downloaded or cached by the game. Coordinates sent to Google and Wikipedia support requested mapping and search. Weather is an optional shared cached reference; game wind remains simplified.

## Controls and limits
All text, status, controls and guides are outside the flight viewport. F pauses and previews a simulation photograph with explicit download or supported file sharing; no download success is assumed, and LINE users get long-press/system-browser guidance. Real-photo captures include attribution.  G drops a bounded temporary beacon, C opens the current coordinate map, B opens sourced stories. Both hands have two action buttons. The same chassis morphs between air, car and submarine modes. WebGL FPV uses 5% radial fisheye; the Canvas fallback has a widened perspective approximation. Photographed curated places create local passport stamps. No image uploads, hidden clicks or account registration occur.

This is a training and exploration game, not flight permission or a certified flight model. Hardware hints do not measure free RAM/VRAM. No 100,000-user test or hosting SLA is claimed. External map/API capacity differs from static game asset capacity. Language drafts need native review for formal publication. Search ranking and AI search inclusion are not guaranteed.
`);
const css=fs.readFileSync(path.join(root,'assets/style.css'),'utf8');
const bundle=fs.readFileSync(path.join(root,'game.bundle.js'),'utf8').replaceAll('</script','<\\/script');
const renderer=fs.readFileSync(path.join(root,'renderer3d.bundle.js'),'utf8').replaceAll('</script','<\\/script');
const reef='data:image/webp;base64,'+fs.readFileSync(path.join(root,'assets/reef-training.webp')).toString('base64');
const photoManifest=JSON.parse(fs.readFileSync(path.join(root,'assets/photos/manifest.json'),'utf8'));
const photoData=Object.fromEntries(photoManifest.assets.map(asset=>[asset.id,'data:image/webp;base64,'+fs.readFileSync(path.join(root,'assets/photos',asset.file)).toString('base64')]));
const configuration=fs.readFileSync(path.join(root,'config.js'),'utf8');
let standalone=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('<link rel="stylesheet" href="assets/style.css">',()=>`<style>${css}</style>`).replace('<link rel="manifest" href="manifest.webmanifest">','').replace('<script src="config.js"></script>',()=>`<script>${configuration};globalThis.AERO_STANDALONE=true;globalThis.AERO_REEF_ASSET=${JSON.stringify(reef)};globalThis.AERO_PHOTO_ASSETS=${JSON.stringify(photoData)};</script>`).replace('<script defer src="game.bundle.js"></script>',()=>`<script>${renderer}</script><script>${bundle}</script>`);
standalone=standalone.replace(/<link\b(?=[^>]*\brel="alternate")[^>]*>\s*/g,'');
standalone=standalone.replace('href="assets/icon.svg"','href="data:image/svg+xml,'+encodeURIComponent(fs.readFileSync(path.join(root,'assets/icon.svg'),'utf8'))+'"');
standalone=standalone.replace('href="assets/photos/PHOTO_CREDITS.html"','href="#photoCredits"');
standalone=standalone.replace('</head>',()=>`<!-- Three.js MIT License\n${fs.readFileSync(path.join(root,'vendor/THREE-LICENSE.txt'),'utf8')}\n-->\n</head>`);
fs.writeFileSync(path.join(root,'standalone.html'),standalone);
// Cache only same-origin, owned assets. Never intercept Google/weather services.
const digest=(await import('node:crypto')).createHash('sha256').update(bundle+renderer+css).digest('hex').slice(0,12);
const sw=`const CACHE='aero-v41-${digest}';const OWN=['game.bundle.js','renderer3d.bundle.js','assets/style.css','assets/reef-training.webp','assets/icon.svg','assets/i18n.json'];const allowed=new Set(OWN.map(p=>new URL(p,self.registration.scope).href));self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('aero-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin||!allowed.has(e.request.url))return;e.respondWith(caches.open(CACHE).then(async c=>{try{const response=await fetch(e.request);if(response.ok){e.waitUntil(c.put(e.request,response.clone()));return response;}const hit=await c.match(e.request);return hit||response;}catch(error){const hit=await c.match(e.request);if(hit)return hit;throw error;}}));});\n`;
fs.writeFileSync(path.join(root,'sw.js'),sw);
const sizeReport={coreBytes:fs.statSync(path.join(root,'game.bundle.js')).size,renderer3DBytes:fs.statSync(path.join(root,'renderer3d.bundle.js')).size,reefBytes:fs.statSync(path.join(root,'assets/reef-training.webp')).size,locales:Object.keys(translations).length,photoCount:photoManifest.assets.length,photoBytes:photoManifest.assets.reduce((sum,a)=>sum+a.bytes,0),destinationCount:JSON.parse(fs.readFileSync(path.join(root,'assets/destinations.json'))).length,poiCount:JSON.parse(fs.readFileSync(path.join(root,'assets/places.json'))).pois.length};
fs.writeFileSync(path.join(root,'build-size.json'),JSON.stringify(sizeReport,null,2)+'\n');
console.log(JSON.stringify({locales:Object.keys(translations).length,keys:Object.keys(translations.en).length,pages:23,origin}));
