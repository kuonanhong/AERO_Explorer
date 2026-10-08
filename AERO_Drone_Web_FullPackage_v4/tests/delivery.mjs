import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import os from 'node:os';
import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.AERO_PLAYWRIGHT_MODULE||'playwright');
const projectRoot=path.resolve(process.env.AERO_SITE_ROOT||process.cwd()),root=path.join(projectRoot,'dist');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/photos/manifest.json'),'utf8'));
const destinations=JSON.parse(fs.readFileSync(path.join(root,'assets/destinations.json'),'utf8'));
assert.equal(manifest.assets.length,14,'v4 contains 14 attributed photographs');
assert(fs.readFileSync(path.join(root,'standalone.html'),'utf8').includes('photoCreditsDialog'),'Rebuild standalone after adding in-page photo credits');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'aero-v4-delivery-'));
const prefix='/SmartAction/games/aero/',publishedOrigin='https://kuonanhong.github.io'+prefix.slice(0,-1);
const packaged=process.env.AERO_CHROMIUM_MODULE?(await import(process.env.AERO_CHROMIUM_MODULE)).default:null;
const browser=await chromium.launch({headless:true,executablePath:process.env.AERO_CHROMIUM_EXECUTABLE||undefined,args:[...(packaged?.args||[]).filter(a=>a!=='--single-process'),'--allow-file-access-from-files','--enable-unsafe-swiftshader']});
const errors=[],results={};let server;
const read=page=>page.evaluate(()=>window.flightTool.execute({}));
async function setup({legacy=false,localOrigin=null}={}){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'en-US',acceptDownloads:true,serviceWorkers:'block'});
 await context.route('**/*',route=>{const url=route.request().url();if(/^(file:|data:|blob:)/.test(url)||localOrigin&&url.startsWith(localOrigin+'/'))return route.continue();return route.abort('internetdisconnected')});
 await context.addInitScript(({legacy})=>{
  Object.defineProperty(document,'modelContext',{value:{registerTool(tool){window.flightTool=tool}}});
  Object.defineProperty(navigator,'deviceMemory',{value:1});
  Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(success,error){setTimeout(()=>error({code:1,message:'Offline delivery test'}),0)}}});
  if(legacy){window.PointerEvent=undefined;HTMLDialogElement.prototype.showModal=undefined;HTMLDialogElement.prototype.close=undefined;const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).includes('webgl')?null:get.call(this,type,...args)}}
 },{legacy});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));return{context,page};
}
async function ready(page){await page.waitForFunction(()=>window.flightTool&&document.getElementById('preflight')?.hidden,null,{timeout:30000});if(await page.locator('#tutorialStart').isVisible())await page.locator('#tutorialStart').click();}
async function openSettings(page){if(!await page.locator('#settings').getAttribute('open').then(x=>x!==null))await page.locator('#settings > summary').click();}
try{
 // The standalone must work from file:// while all Internet access is unavailable.
 const {context,page}=await setup({legacy:true}),requests=[];
 page.on('request',r=>requests.push(r.url()));const entry=pathToFileURL(path.join(root,'standalone.html')).href;
 await page.goto(entry);await page.waitForFunction(()=>window.flightTool&&document.getElementById('preflight')?.hidden);
 assert.equal((await read(page)).tier,'lite');assert.equal((await read(page)).renderer.renderer,'Canvas2D');
 assert(await page.locator('#tutorial').evaluate(el=>el.classList.contains('fallback-dialog')),'Tutorial uses native-dialog fallback');
 await ready(page);assert.equal(await page.locator('#tutorial').getAttribute('open'),null);
 assert.equal(await page.locator('#settings').getAttribute('open'),null,'Mobile settings start collapsed');
 await openSettings(page);await page.locator('#vehicle').selectOption('water');assert.equal((await read(page)).vehicle,'water');
 // Exercise real touch fallback handlers with two independent simultaneous fingers.
 await page.locator('#startButton').click();if(!(await read(page)).running)await page.locator('#startButton').click();
 await page.evaluate(()=>{const touches=['leftStick','rightStick'].map((id,i)=>{const target=document.getElementById(id),r=target.getBoundingClientRect();return new Touch({identifier:i+1,target,clientX:r.x+r.width/2,clientY:r.y+r.height*.1})});for(const touch of touches)touch.target.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches,changedTouches:[touch],targetTouches:[touch]}));window.__testTouches=touches;});
 let controls=(await read(page)).controls;assert(controls.lift>.8&&controls.forward>.8,'Both legacy touch sticks independently supply controls');
 await page.evaluate(()=>{for(const touch of window.__testTouches)touch.target.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,touches:[],changedTouches:[touch],targetTouches:[]}));});
 controls=(await read(page)).controls;assert.equal(controls.lift,0);assert.equal(controls.forward,0);
 if((await read(page)).running)await page.locator('#startButton').click();
 await openSettings(page);await page.locator('#vehicle').selectOption('air');
 const inline=await page.evaluate(async()=>{const photos=globalThis.AERO_PHOTO_ASSETS||{};return Promise.all(Object.entries(photos).map(async([id,url])=>{const image=new Image();image.src=url;await image.decode();return{id,data:url.startsWith('data:image/webp;base64,'),width:image.naturalWidth,height:image.naturalHeight}}))});
 assert.deepEqual(inline.map(a=>a.id).sort(),manifest.assets.map(a=>a.id).sort());assert(inline.every(a=>a.data&&a.width>0&&a.height>0),'All 14 inline photos decode');
 for(let i=0;i<destinations.length;i++){
  await page.locator('#destinationList .destination-card').nth(i).locator('button').click();
  await page.waitForFunction(id=>window.flightTool.execute({}).renderer.scenery==='ready'&&window.flightTool.execute({}).renderer.sceneryId===id,destinations[i].photoId,{timeout:15000});
  if(manifest.assets.find(a=>a.id===destinations[i].photoId).is360)assert.equal((await read(page)).renderer.sceneryType,'panorama-strip');
 }
 // Curated museum's artwork links also point at embedded local copies.
 const museumIndex=destinations.findIndex(p=>p.id==='taipei-npm');await page.locator('#destinationList .destination-card').nth(museumIndex).locator('button').click();
 await page.waitForFunction(()=>document.querySelectorAll('#photoGallery .photo-card').length===3);
 const artifactURLs=await page.locator('#photoGallery .photo-card a[href^="data:"]').evaluateAll(links=>links.map(a=>a.href));
 assert.equal(artifactURLs.length,2);assert(artifactURLs.every(url=>url.startsWith('data:image/webp;base64,')));
 await page.locator('a[data-i18n="photoCredit"]').click();
 assert.equal(await page.locator('#photoCreditsDialog').getAttribute('open'),'');
 assert.equal(await page.locator('#photoCreditsDialog h3').count(),14);
 const licenseLinks=await page.locator('#photoCreditsDialog a').evaluateAll(links=>links.map(a=>a.href));assert.equal(licenseLinks.length,28);assert(licenseLinks.every(url=>url.startsWith('https://')));
 await page.locator('#photoCreditsDialog button').first().click();assert.equal(await page.locator('#photoCreditsDialog').getAttribute('open'),null);
 const downloadPromise=page.waitForEvent('download');await page.locator('#photoButton').click();const download=await downloadPromise;
 const filename=await download.path();assert.equal(fs.readFileSync(filename).subarray(0,8).toString('hex'),'89504e470d0a1a0a','Standalone photo capture downloads a PNG');
 const localRequests=requests.filter(url=>url.startsWith('file:'));
 assert.deepEqual([...new Set(localRequests)],[entry],'Standalone requests no other local file');
 assert.equal(requests.filter(url=>/^https?:/.test(url)&&new URL(url).pathname.includes('/assets/')).length,0,'Standalone game assets do not come from external hosts');
 const mapSrc=await page.locator('#locationMap').getAttribute('src');assert(mapSrc&&new URL(mapSrc).hostname.endsWith('google.com'),'Google iframe is an expected optional online map');
 results.standalone={tier:'lite',legacyTouch:true,dialogFallback:true,inlinePhotos:inline.length,selectedDestinations:destinations.length,panoramas:manifest.assets.filter(a=>a.is360).length,credits:14,localFiles:[path.basename(new URL(entry).pathname)],externalMapBlocked:true,photoPNG:true};
 await context.close();

 // Rebuild an isolated fixture for the real intended GitHub nested URL. Source stays untouched.
 fs.cpSync(root,path.join(fixture,'dist'),{recursive:true});fs.mkdirSync(path.join(fixture,'tools'));
 fs.copyFileSync(path.join(projectRoot,'tools/build-locales.mjs'),path.join(fixture,'tools/build-locales.mjs'));
 fs.symlinkSync(path.join(projectRoot,'node_modules'),path.join(fixture,'node_modules'),'junction');
 const build=spawnSync(process.execPath,[path.join(fixture,'tools/build-locales.mjs')],{cwd:fixture,env:{...process.env,AERO_ORIGIN:publishedOrigin},encoding:'utf8'});
 assert.equal(build.status,0,'Isolated SmartAction build failed: '+build.stderr);
 const servedRoot=path.join(fixture,'dist');
 server=http.createServer((req,res)=>{let relative;try{const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith(prefix)){res.writeHead(404).end();return}relative=decodeURIComponent(url.pathname.slice(prefix.length));}catch{res.writeHead(400).end();return}if(relative.endsWith('/')||!relative)relative+='index.html';const file=path.resolve(servedRoot,relative);if(!file.startsWith(servedRoot+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return}const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.webmanifest':'application/manifest+json'};res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file))});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const localOrigin='http://127.0.0.1:'+server.address().port;
 const hosted=await setup({localOrigin}),missing=[],served=[];
 hosted.page.on('response',response=>{if(response.url().startsWith(localOrigin+'/')){served.push(response.url());if(response.status()>=400)missing.push(response.url())}});
 await hosted.page.goto(localOrigin+prefix+'ja/');await ready(hosted.page);
 assert.equal(await hosted.page.locator('html').getAttribute('lang'),'ja');assert.equal((await read(hosted.page)).locale,'ja');
 assert.equal(await hosted.page.locator('link[rel="canonical"]').getAttribute('href'),publishedOrigin+'/ja/');
 assert.equal(await hosted.page.evaluate(()=>document.baseURI),localOrigin+prefix);
 assert.equal(await hosted.page.locator('link[rel="alternate"][hreflang="ja"]').getAttribute('href'),publishedOrigin+'/ja/');
 const panoramaIndex=destinations.findIndex(p=>manifest.assets.find(a=>a.id===p.photoId)?.is360);
 await hosted.page.locator('#destinationList .destination-card').nth(panoramaIndex).locator('button').click();
 await hosted.page.waitForFunction(id=>window.flightTool.execute({}).renderer.sceneryId===id&&window.flightTool.execute({}).renderer.scenery==='ready',destinations[panoramaIndex].photoId);
 await hosted.page.locator('#language').selectOption('en');assert.equal(hosted.page.url(),localOrigin+prefix+'en/');assert.equal((await read(hosted.page)).locale,'en');
 await hosted.page.reload();await ready(hosted.page);
 assert.equal(await hosted.page.locator('link[rel="canonical"]').getAttribute('href'),publishedOrigin+'/en/');assert.equal(await hosted.page.locator('html').getAttribute('lang'),'en');
 assert(served.some(url=>url.endsWith(prefix+'assets/style.css')));assert(served.some(url=>url.endsWith(prefix+'game.bundle.js')));assert(served.some(url=>url.includes(prefix+'assets/photos/images/')));
 assert.deepEqual(missing,[],'Nested deployment has no missing same-origin assets');
 results.smartAction={prefix,localeRoutes:['ja','en'],canonical:publishedOrigin+'/en/',relativeAssets:true,panoramaLoaded:true,local404:missing};
 await hosted.context.close();assert.deepEqual(errors,[]);console.log(JSON.stringify(results,null,2));
 console.log('Delivery v4 passed: offline single-file assets/photos/credits, legacy controls/dialogs, PNG capture, and actual rebuilt SmartAction nested URL.');
}finally{if(server)await new Promise(resolve=>server.close(resolve));await browser.close();fs.rmSync(fixture,{recursive:true,force:true});}
