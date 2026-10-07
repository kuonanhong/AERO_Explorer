import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Run from any folder: AERO_SITE_ROOT is useful when this file is staged outside tests/.
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch(error){
 if(!process.env.AERO_PLAYWRIGHT_MODULE)throw error;
 playwright=require(process.env.AERO_PLAYWRIGHT_MODULE);
}
const {chromium}=playwright;
const projectRoot=process.env.AERO_SITE_ROOT||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dictionary=JSON.parse(fs.readFileSync(path.join(projectRoot,'dist','assets','i18n.json'),'utf8'));
const qaOutput=process.env.AERO_QA_OUTPUT||path.resolve(projectRoot,'.qa-output');
const entry=process.env.AERO_TEST_URL||pathToFileURL(path.join(projectRoot,'dist','en','index.html')).href;
fs.mkdirSync(qaOutput,{recursive:true});
const packaged=process.env.AERO_CHROMIUM_MODULE?(await import(process.env.AERO_CHROMIUM_MODULE)).default:null;
const browser=await chromium.launch({
 executablePath:process.env.AERO_CHROMIUM_EXECUTABLE||undefined,headless:true,
 args:[...(packaged?.args||[]).filter(arg=>arg!=='--single-process'),'--allow-file-access-from-files','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
});
const results={};
const read=page=>page.evaluate(()=>window.flightTool.execute({}));
const rendererName=state=>typeof state.renderer==='string'?state.renderer:state.renderer?.renderer;
const pause=async page=>{if((await read(page)).running)await page.locator('#startButton').click();};
const resume=async page=>{if(!(await read(page)).running)await page.locator('#startButton').click();};
const setQuality=async(page,value,tier)=>{
 await pause(page);await page.locator('#quality').selectOption(value);
 await page.waitForFunction(expected=>window.flightTool.execute({}).tier===expected,tier,{timeout:20000});
 await page.waitForTimeout(500);
 assert.equal((await read(page)).tier,tier,'Requested tier remains stable after old renderer disposal');
};
const screenshot=async(page,name)=>{
 await pause(page);await page.locator('#flight').scrollIntoViewIfNeeded();
 await page.locator('#flight').screenshot({path:path.join(qaOutput,name)});
};

async function initialize(context,{memory=8,cores=8,gps='grant'}={}){
 await context.addInitScript(({memory,cores,gps})=>{
  Object.defineProperty(navigator,'deviceMemory',{configurable:true,value:memory});
  Object.defineProperty(navigator,'hardwareConcurrency',{configurable:true,value:cores});
  Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool(tool){if(tool.name==='read_flight_state')window.flightTool=tool;}}});
  window.__gpsCalls=0;
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(success,error){
   window.__gpsCalls++;
   setTimeout(()=>gps==='grant'?success({coords:{latitude:22.64954,longitude:120.35363,accuracy:17.4},timestamp:Date.now()}):error({code:1,message:'Permission denied'}),20);
  }}});
 },{memory,cores,gps});
 const page=await context.newPage();const errors=[],requests=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>requests.push(request.url()));
 await page.goto(entry);
 await page.waitForFunction(()=>window.flightTool&&document.getElementById('preflight')?.hidden,{timeout:30000});
 assert.equal(await page.locator('#unsupported').isVisible(),false,'Renderer startup must succeed');
 assert.equal(await page.evaluate(()=>window.__gpsCalls),0,'Location must not run before a user action');
 if(await page.locator('#tutorialStart').isVisible())await page.locator('#tutorialStart').click();
 else await resume(page);
 return{page,errors,requests};
}

try{
 const desktop=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});
 const {page,errors}=await initialize(desktop);
 await page.locator('#mission').selectOption('free');
 await page.keyboard.down('w');
 await page.waitForFunction(()=>window.flightTool.execute({}).altitude>3,null,{timeout:16000});
 await page.keyboard.up('w');
 await page.keyboard.down('ArrowUp');
 await page.waitForFunction(()=>window.flightTool.execute({}).speed>2,null,{timeout:12000});
 await page.keyboard.up('ArrowUp');
 assert.equal((await read(page)).vehicle,'air');
 await page.locator('#viewButton').click();assert.equal((await read(page)).view,'fpv');
 await screenshot(page,'aero-v3-air.png');
 await page.locator('#viewButton').click();
 await page.locator('#resetButton').click();
 assert.equal((await read(page)).altitude,0);
 await page.locator('#difficulty').selectOption('expert');assert.equal((await read(page)).mode,'expert');
 await page.locator('#difficulty').selectOption('beginner');
 for(const scene of ['alpine','dusk','coast'])await page.locator('#scene').selectOption(scene);

 // Switching engines must preserve the simulation and use a fresh compatible canvas.
 await setQuality(page,'low','lite');assert.equal(rendererName(await read(page)),'Canvas2D');
 const beforeLite=await read(page);await resume(page);await page.keyboard.down('w');
 await page.waitForFunction(()=>window.flightTool.execute({}).altitude>1,null,{timeout:12000});
 await page.keyboard.up('w');await pause(page);
 const beforeFull=await read(page);
 await setQuality(page,'high','full');assert.equal(rendererName(await read(page)),'WebGL');
 const afterFull=await read(page);assert(Math.abs(afterFull.altitude-beforeFull.altitude)<.05,'Tier switches preserve altitude');
 assert.equal(afterFull.vehicle,beforeLite.vehicle);

 await page.locator('#vehicle').selectOption('land');
 assert.equal((await read(page)).vehicle,'land');assert.equal(await page.locator('#mission').isDisabled(),true);
 await resume(page);await page.keyboard.down('ArrowUp');
 await page.waitForFunction(()=>window.flightTool.execute({}).speed>2,null,{timeout:12000});
 await page.keyboard.up('ArrowUp');assert.equal((await read(page)).altitude,0,'Land mode remains on ground');
 await screenshot(page,'aero-v3-land.png');
 await page.locator('#vehicle').selectOption('water');assert.equal((await read(page)).vehicle,'water');
 assert.equal(await page.locator('#sceneSource').inputValue(),'sim');
 const initialDepth=Number.parseFloat(await page.locator('#altitude').textContent());
 await resume(page);await page.keyboard.down('s');
 await page.waitForFunction(depth=>Number.parseFloat(document.getElementById('altitude').textContent)>depth+1,initialDepth,{timeout:12000});
 await page.keyboard.up('s');
 await screenshot(page,'aero-v3-water.png');

 // Nearby facts and position are local until the player requests provider/location data.
 assert((await page.locator('#nearbyList .place-card').count())>=4,'Bundled nearby facts are shown');
 await page.locator('#language').selectOption('zh-Hant');
 assert.match(await page.locator('#nearbyList').textContent(),/澄清湖/);
 const lakeCard=page.locator('#nearbyList .place-card').filter({has:page.locator('h3').filter({hasText:/^澄清湖風景區$/})}).first();
 await lakeCard.locator('button').click();
 await page.waitForFunction(()=>!document.getElementById('placeOverlay').hidden);
 assert.match(await page.locator('#placeOverlayName').textContent(),/澄清湖/);
 await page.locator('#language').selectOption('en');
 assert.match(await page.locator('#placeOverlayName').textContent(),/Chengcing/);
 assert((await page.locator('#placeOverlayDescription').textContent()).length>20,'Selected POI has factual explanation');
 const sourceUrl=await page.locator('#placeOverlaySource').getAttribute('href');
 assert(/^https:\/\//.test(sourceUrl),'POI has a public source link');
 await screenshot(page,'aero-v3-lake.png');

 const downloadPromise=page.waitForEvent('download');await page.locator('#photoButton').click();
 const download=await downloadPromise;
 assert.match(download.suggestedFilename(),/^AERO-water-\d+\.png$/);
 const photoPath=path.join(qaOutput,'aero-v3-photo.png');await download.saveAs(photoPath);
 const png=fs.readFileSync(photoPath);assert(png.length>2000,'Capture contains rendered pixels');
 assert.equal(png.subarray(1,4).toString(),'PNG');assert(png.readUInt32BE(16)>300&&png.readUInt32BE(20)>200,'Capture has viewport dimensions');

 await page.locator('#mapButton').click();
 await page.locator('#lat').fill('91');await page.locator('#applyMap').click();
 assert.equal(await page.locator('#mapError').isVisible(),true,'Out-of-range manual coordinates rejected');
 await page.locator('#lat').fill('22.7012');await page.locator('#lon').fill('120.3023');
 await page.locator('#originAltitude').fill('25');await page.locator('#applyMap').click();
 assert.equal(await page.locator('#mapDialog').isVisible(),false);
 assert.match(await page.locator('#originDisplay').textContent(),/22\.70120, 120\.30230/);
 await page.locator('#mapButton').click();await page.locator('#locateButton').click();
 await page.waitForFunction(()=>document.getElementById('locationStatus').textContent.includes('17'));
 assert.match(await page.locator('#originDisplay').textContent(),/GPS ±17 m/);
 assert.equal(await page.evaluate(()=>window.__gpsCalls),1,'GPS requested only on click');
 await page.locator('#closeMap').click();

 // Missing provider credentials expose a usable setup dialog and leave local scenes usable.
 await page.locator('#vehicle').selectOption('air');
 await resume(page);
 await page.locator('#sceneSource').selectOption('google');
 assert.equal(await page.locator('#mapDialog').isVisible(),true);
 assert.equal(await page.locator('#sceneSource').inputValue(),'sim');
 assert.equal((await read(page)).running,false,'Missing-key dialog pauses the simulation');
 await page.locator('#closeMap').click();

 // Real WEBGL_lose_context exercises the recovery branch, not just a synthetic event.
 await setQuality(page,'high','full');
 const lost=await page.evaluate(()=>{const canvas=document.getElementById('world');const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');const extension=gl?.getExtension('WEBGL_lose_context');if(!extension)return false;extension.loseContext();return true;});
 assert(lost,'QA renderer must support context-loss simulation');
 await page.waitForFunction(()=>window.flightTool.execute({}).tier==='lite',null,{timeout:15000});
 assert.equal(rendererName(await read(page)),'Canvas2D');
 await resume(page);await page.keyboard.down('w');await page.waitForFunction(()=>window.flightTool.execute({}).altitude>1,null,{timeout:12000});await page.keyboard.up('w');
 await pause(page);await page.locator('#language').selectOption('ar');
 assert.equal(await page.locator('html').getAttribute('dir'),'rtl');assert.match(await page.locator('#startText').textContent(),/[\u0600-\u06ff]/);
 await page.locator('#language').selectOption('en');
 assert(await page.evaluate(()=>{try{window.flightTool.execute({unexpected:true});return false;}catch{return true;}}),'WebMCP rejects invalid extra parameters');
 await page.screenshot({path:path.join(qaOutput,'aero-v3-desktop.png'),fullPage:true});
 assert.deepEqual(errors,[],'Desktop has no unhandled errors');
 results.desktop={air:true,land:true,water:true,lake:true,qualitySwitch:true,contextLoss:true,gpsGranted:true,manualCoordinate:true,photoBytes:png.length,errors};
 await desktop.close();

 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const {page:mp,errors:mobileErrors,requests}=await initialize(mobile,{memory:1,cores:2,gps:'deny'});
 assert.equal((await read(mp)).tier,'lite','Low-memory device starts with lite renderer');
 assert.equal(rendererName(await read(mp)),'Canvas2D');
 assert.equal(requests.some(url=>url.includes('renderer3d.bundle.js')),false,'Lite startup avoids loading the 3D engine');
 assert.equal(await mp.locator('body').getAttribute('data-input'),'sticks');
 await mp.locator('#mission').selectOption('free');await mp.locator('#resetButton').click();
 await mp.locator('#leftStick').scrollIntoViewIfNeeded();await resume(mp);
 const left=await mp.locator('#leftStick').boundingBox(),right=await mp.locator('#rightStick').boundingBox();
 const session=await mobile.newCDPSession(mp);
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:left.x+left.width/2,y:left.y+left.height*.18,id:1},{x:right.x+right.width/2,y:right.y+right.height*.18,id:2}]});
 await mp.waitForFunction(()=>{const s=window.flightTool.execute({});return s.altitude>1&&s.speed>2;},null,{timeout:18000});
 await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await mp.waitForFunction(()=>window.flightTool.execute({}).speed<1,null,{timeout:12000});
 await mp.locator('#inputMode').selectOption('keypad');await mp.locator('#leftPad').scrollIntoViewIfNeeded();
 const up=await mp.locator('#leftPad button').first().boundingBox(),forward=await mp.locator('#rightPad button').first().boundingBox();
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:up.x+up.width/2,y:up.y+up.height/2,id:1},{x:forward.x+forward.width/2,y:forward.y+forward.height/2,id:2}]});
 await mp.waitForFunction(()=>window.flightTool.execute({}).speed>2,null,{timeout:12000});
 await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 await mp.waitForFunction(()=>Object.values(window.flightTool.execute({}).controls).every(value=>value===0),null,{timeout:5000});
 await mp.locator('#vehicle').selectOption('water');assert.equal((await read(mp)).vehicle,'water');
 await mp.locator('#vehicle').selectOption('land');assert.equal((await read(mp)).vehicle,'land');
 await mp.locator('#mapButton').click();await mp.locator('#locateButton').click();
 await mp.waitForFunction(message=>document.getElementById('locationStatus').textContent===message,dictionary.en.locationDenied);
 assert.equal(await mp.evaluate(()=>window.__gpsCalls),1);
 await mp.locator('#exampleButton').click();await mp.locator('#closeMap').click();
 await mp.locator('#language').selectOption('ja');assert.equal(await mp.locator('html').getAttribute('lang'),'ja');
 await mp.locator('#language').selectOption('en');await mp.locator('#inputMode').selectOption('sticks');
 await pause(mp);await mp.locator('#resetButton').click();await mp.evaluate(()=>window.scrollTo(0,0));
 await mp.waitForTimeout(500); // Let the paused Canvas2D redraw after resize/scroll observers.
 assert(await mp.evaluate(()=>{const canvas=document.getElementById('world');const pixel=canvas.getContext('2d').getImageData(100,100,1,1).data;return pixel[0]+pixel[1]+pixel[2]>0;}),'Paused Lite viewport still contains painted scenery');
 await mp.screenshot({path:path.join(qaOutput,'aero-v3-mobile.png'),fullPage:true});
 assert.equal(await mp.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No mobile horizontal overflow');
 assert.deepEqual(mobileErrors,[],'Mobile has no unhandled errors');
 results.mobile={lowMemoryLite:true,noThreeDownload:true,dualSticks:true,dualKeys:true,cancelClears:true,vehicles:true,gpsDenied:true,rtlAndLocales:true,errors:mobileErrors};
 await mobile.close();
 fs.writeFileSync(path.join(qaOutput,'browser-results.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({results,qaOutput}));
}finally{await browser.close();}
