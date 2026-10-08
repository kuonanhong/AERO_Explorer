import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve('dist'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const dictionary=JSON.parse(read('assets/i18n.json')),places=JSON.parse(read('assets/places.json'));
const keys=Object.keys(dictionary.en).sort();assert.equal(Object.keys(dictionary).length,22);assert.equal(keys.length,233);assert.equal(places.pois.length,13);
for(const [locale,strings]of Object.entries(dictionary)){
 assert.deepEqual(Object.keys(strings).sort(),keys,locale+' complete keys');for(const [key,value]of Object.entries(strings))assert.equal(typeof value==='string'&&value.trim().length>0,true,locale+'/'+key);
 const page=read(locale+'/index.html');assert(page.includes('lang="'+locale+'"'));assert(page.includes('data-locale="'+locale+'"'));assert(page.includes('<base href="../">'));
 assert.equal((page.match(/hreflang=/g)||[]).length,23);assert.equal((page.match(/rel="canonical"/g)||[]).length,1);assert.equal((page.match(/<base /g)||[]).length,1);
 const data=JSON.parse(page.match(/<script type="application\/ld\+json" id="schema">([\s\S]*?)<\/script>/)[1]);assert.equal(data['@graph'][0].inLanguage,locale);
 for(const place of places.pois){assert(place.name[locale]?.trim(),place.id+' name '+locale);assert(place.description[locale]?.trim(),place.id+' description '+locale);assert(place.sourceUrls[0].startsWith('https://'));}
}
for(const url of [...read('index.html').matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1])){if(/^(https?:|#|data:)/.test(url))continue;assert(fs.existsSync(path.join(root,url)),url+' exists');}
const standalone=read('standalone.html');assert(!/<(?:script|link)[^>]+(?:src|href)="(?:config\.js|game\.bundle\.js|assets\/|renderer3d)/.test(standalone),'single HTML includes all required game assets');assert(standalone.includes('data:image/webp;base64,'));assert(standalone.includes('AERO_STANDALONE=true'));
const core=read('game.bundle.js'),renderer=read('renderer3d.bundle.js');assert(!core.includes('THREE.WebGLRenderer'),'lite startup excludes 3D renderer');assert(renderer.includes('WebGLRenderer'),'separate lazy engine exists');
const sw=read('sw.js');assert(sw.includes("new URL(e.request.url).origin!==location.origin"));assert(sw.includes('!allowed.has(e.request.url)'));assert(!sw.includes('maps.googleapis.com'));
const config=read('config.js');assert(config.includes("googleMapsKey:''"),'no supplied Google credential');assert(config.includes("weatherEndpoint:''"),'no mass startup weather requests');
console.log('Content: 22 complete locales × 233 keys; 13 × 22 sourced places; SEO/relative assets; standalone embedding; lazy renderer and owned cache boundary passed.');
