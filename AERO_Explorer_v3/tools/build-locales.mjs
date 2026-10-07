import {build} from 'esbuild';
import fs from 'node:fs';import path from 'node:path';
const translations=JSON.parse(fs.readFileSync(new URL('../dist/assets/i18n.json',import.meta.url),'utf8'));
fs.writeFileSync(new URL('../dist/assets/i18n.js',import.meta.url),'export const translations='+JSON.stringify(translations)+';\n');
const root=path.resolve('dist');const origin=(process.env.AERO_ORIGIN||'https://aero-drone-flight.kuonanhong.chatgpt.site').replace(/\/+$/,'');
await build({entryPoints:[path.join(root,'game.js')],outfile:path.join(root,'game.bundle.js'),bundle:true,minify:true,format:'iife',target:'es2018',legalComments:'inline'});
await build({entryPoints:[path.join(root,'render-entry.js')],outfile:path.join(root,'renderer3d.bundle.js'),bundle:true,minify:true,format:'iife',target:'es2018',legalComments:'inline'});
const template=fs.readFileSync(path.join(root,'index.html'),'utf8');
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const alternatives=Object.keys(translations).map(lang=>`<link rel="alternate" hreflang="${lang}" href="${origin}/${lang}/">`).join('\n')+`\n<link rel="alternate" hreflang="x-default" href="${origin}/">`;
function generate(locale,isRoot=false){const t=translations[locale];let html=template;
 html=html.replace(/<html[^>]*>/,`<html lang="${locale}" dir="${locale==='ar'?'rtl':'ltr'}" data-locale="${locale}">`);
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
fs.writeFileSync(path.join(root,'llms.txt'),`# AERO Explorer v3

Free browser-based air, land and underwater vehicle simulator in 22 languages. Each visitor runs a separate simulation locally. Keyboard Mode 2, multitouch sticks and on-screen directional keys. Beginner assisted, Sport and manual-throttle Expert modes. FPV and third-person cameras. Hardware hints and a small graphics probe select Canvas 2D, balanced WebGL or full WebGL; sustained low FPS and graphics context loss reduce quality.

- [Play](${origin}/)
- [English](${origin}/en/)
- [繁體中文](${origin}/zh-Hant/)
- [CAA reference](https://drone.caa.gov.tw/zh-TW/Default/WebGuide)

## Controls
Left: W/S rise or dive, A/D yaw. Right: arrows forward/back and sideways. W/S do not change height in land mode. V camera, Space pause, R reset. Mobile: two simultaneous virtual sticks or directional keypads. No account, background click or telemetry service is required. Language, tutorial and best-score preferences remain in local browser storage. Coordinates and runtime API keys remain in memory.

## Maps and places
Optional, permission-based geolocation sets the simulation origin; accuracy is displayed. Manual coordinates and a Kaohsiung example are available. Thirteen built-in nearby place descriptions use official tourism/hospital sources, translated into 22 languages. Google Maps JavaScript 3D, Street View and nearby Places adapters are provided. These optional live services require the owner's restricted browser API key, enabled APIs, billing, quotas and available geographic coverage. There is no bundled key and live billed imagery has not been validated. Street View uses existing covered photo points. No live CAA overlay is embedded.

## Simulation and limits
Procedural scenery, birds, clouds and underwater ecology are simulated, not current aerial photography or a seabed survey. Marine training includes an original AI reef background; freshwater lake training excludes coral. Google map assets are not downloaded or cached by the game. Weather is an optional shared cached reference; game wind remains simplified. This is a training game, not flight permission or a certified flight model. Hardware hints do not measure available RAM/VRAM. No 100,000-user test or hosting SLA is claimed. Language drafts need native review for formal publication. Search ranking and AI search inclusion are not guaranteed.
`);
const css=fs.readFileSync(path.join(root,'assets/style.css'),'utf8');
const bundle=fs.readFileSync(path.join(root,'game.bundle.js'),'utf8').replaceAll('</script','<\\/script');
const renderer=fs.readFileSync(path.join(root,'renderer3d.bundle.js'),'utf8').replaceAll('</script','<\\/script');
const reef='data:image/webp;base64,'+fs.readFileSync(path.join(root,'assets/reef-training.webp')).toString('base64');
const configuration=fs.readFileSync(path.join(root,'config.js'),'utf8');
let standalone=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('<link rel="stylesheet" href="assets/style.css">',()=>`<style>${css}</style>`).replace('<link rel="manifest" href="manifest.webmanifest">','').replace('<script src="config.js"></script>',()=>`<script>${configuration};globalThis.AERO_STANDALONE=true;globalThis.AERO_REEF_ASSET=${JSON.stringify(reef)};</script>`).replace('<script defer src="game.bundle.js"></script>',()=>`<script>${renderer}</script><script>${bundle}</script>`);
standalone=standalone.replace('href="assets/icon.svg"','href="data:image/svg+xml,'+encodeURIComponent(fs.readFileSync(path.join(root,'assets/icon.svg'),'utf8'))+'"');
standalone=standalone.replace('</head>',()=>`<!-- Three.js MIT License\n${fs.readFileSync(path.join(root,'vendor/THREE-LICENSE.txt'),'utf8')}\n-->\n</head>`);
fs.writeFileSync(path.join(root,'standalone.html'),standalone);
// Cache only same-origin, owned assets. Never intercept Google/weather services.
const digest=(await import('node:crypto')).createHash('sha256').update(bundle+renderer+css).digest('hex').slice(0,12);
const sw=`const CACHE='aero-v3-${digest}';const OWN=['game.bundle.js','renderer3d.bundle.js','assets/style.css','assets/reef-training.webp','assets/icon.svg','assets/i18n.json'];const allowed=new Set(OWN.map(p=>new URL(p,self.registration.scope).href));self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('aero-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin||!allowed.has(e.request.url))return;e.respondWith(caches.open(CACHE).then(async c=>{try{const response=await fetch(e.request);if(response.ok){e.waitUntil(c.put(e.request,response.clone()));return response;}const hit=await c.match(e.request);return hit||response;}catch(error){const hit=await c.match(e.request);if(hit)return hit;throw error;}}));});\n`;
fs.writeFileSync(path.join(root,'sw.js'),sw);
const sizeReport={coreBytes:fs.statSync(path.join(root,'game.bundle.js')).size,renderer3DBytes:fs.statSync(path.join(root,'renderer3d.bundle.js')).size,reefBytes:fs.statSync(path.join(root,'assets/reef-training.webp')).size,locales:Object.keys(translations).length,poiCount:JSON.parse(fs.readFileSync(path.join(root,'assets/places.json'))).pois.length};
fs.writeFileSync(path.join(root,'build-size.json'),JSON.stringify(sizeReport,null,2)+'\n');
console.log(JSON.stringify({locales:Object.keys(translations).length,keys:Object.keys(translations.en).length,pages:23,origin}));
