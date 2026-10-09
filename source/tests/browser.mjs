import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch(error){
 const override=process.env.AERO_PLAYWRIGHT_MODULE||(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):null);
 if(!override)throw error;playwright=require(override);
}
const {chromium}=playwright;
const packaged=process.env.AERO_CHROMIUM_MODULE?(await import(process.env.AERO_CHROMIUM_MODULE)).default:null;
const project=process.env.AERO_SITE_ROOT||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=process.env.AERO_QA_OUTPUT||path.join(project,'.qa-output');
let base=process.env.AERO_TEST_URL||null,server=null;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const manifest=JSON.parse(fs.readFileSync(path.join(project,'dist/assets/photos/manifest.json'),'utf8'));
const dictionary=JSON.parse(fs.readFileSync(path.join(project,'dist/assets/i18n.json'),'utf8'));
fs.mkdirSync(output,{recursive:true});
for(let round=0;round<40;round++){
 if(fs.statSync(path.join(project,'dist/game.bundle.js')).mtimeMs>=fs.statSync(path.join(project,'dist/game.js')).mtimeMs)break;
 if(round===39)throw Error('v4.1 bundle was not rebuilt within the QA startup window');
 await delay(1000);
}
if(!base){
 const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
 base='http://127.0.0.1:'+port+'/';
 server=spawn(process.env.AERO_PYTHON||(process.platform==='win32'?'python':'python3'),['-m','http.server',String(port),'--bind','127.0.0.1','--directory',path.join(project,'dist')],{stdio:'ignore'});
}
base=base.replace(/\/?$/,'/');
for(let i=0;i<30;i++){try{const response=await fetch(base);if(response.ok)break;}catch{}await delay(100);}
let browser;
const results={photos:[],desktop:{},mobile:{},line:{},language:{},map:{}};
const lineUA='Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Line/15.0.0';
const mapFixture='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9efe0"/><path d="M0 64H256M0 192H256M64 0V256M192 0V256" stroke="#fff" stroke-width="12"/><path d="M0 128H256" stroke="#9fc7dd" stroke-width="18"/></svg>';

const read=page=>page.evaluate(()=>window.flightTool.execute({}));
const pause=async page=>{if((await read(page)).running)await page.locator('#startButton').click();};
const resume=async page=>{if(!(await read(page)).running)await page.locator('#startButton').click();};
async function setup({width=1440,height=1000,mobile=false,locale='en-US',memory=8,pathname='en/',userAgent=null,tileFailure=false}={}){
 const context=await browser.newContext({viewport:{width,height},...(userAgent?{userAgent}:{}),isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale,acceptDownloads:true,serviceWorkers:'block',ignoreHTTPSErrors:true});
 // Wikipedia nearby/search network is bounded separately; local library search is tested here.
 await context.route('**.wikipedia.org/w/api.php?*',route=>route.abort('blockedbyclient'));
 // Provider tiles are mocked, preventing headless QA from fetching/panning public OSM tiles.
 await context.route('https://tile.openstreetmap.org/**',route=>tileFailure?route.abort('internetdisconnected'):route.fulfill({status:200,contentType:'image/svg+xml',body:mapFixture}));
 await context.addInitScript(({memory})=>{
  Object.defineProperty(navigator,'deviceMemory',{configurable:true,value:memory});
  Object.defineProperty(navigator,'hardwareConcurrency',{configurable:true,value:memory<=2?2:8});
  Object.defineProperty(document,'modelContext',{value:{registerTool(tool){if(tool.name==='read_flight_state')window.flightTool=tool;}}});
  window.__gpsRequests=0;
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(success){window.__gpsRequests++;setTimeout(()=>success({coords:{latitude:22.659012,longitude:120.347891,accuracy:7},timestamp:Date.now()}),30);}}});
 },{memory});
 const page=await context.newPage(),errors=[],downloads=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('download',download=>downloads.push(download));
 await page.goto(base+pathname,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.flightTool&&document.getElementById('preflight')?.hidden,{timeout:30000});
 await page.waitForFunction(()=>document.getElementById('originDisplay')?.textContent.includes('GPS ±7 m'),null,{timeout:10000});
 if(await page.locator('#tutorialStart').isVisible())await page.locator('#tutorialStart').click();
 await page.waitForTimeout(250);
 assert.notEqual(await page.locator('#noticeToast').textContent(),dictionary[(await read(page)).locale].sceneryError,'Clearing scenery during GPS setup must not report a failed photograph');
 return{context,page,errors,downloads};
}
async function settings(page){await page.locator('#settings').evaluate(element=>element.open=true);}
async function cleanViewport(page){
 const violations=await page.evaluate(()=>{
  const flight=document.getElementById('flight'),r=flight.getBoundingClientRect(),overlap=box=>box.width>0&&box.height>0&&box.left<r.right-1&&box.right>r.left+1&&box.top<r.bottom-1&&box.bottom>r.top+1;
  const violations=[];
  for(const element of document.querySelectorAll('button,input,select,summary,a,[data-i18n]')){
   if(document.fullscreenElement&&!document.fullscreenElement.contains(element))continue;
   if(element.closest('dialog')&&!element.closest('dialog').open)continue;
   const style=getComputedStyle(element);if(style.display==='none'||style.visibility==='hidden')continue;
   const box=element.getBoundingClientRect();if(overlap(box))violations.push(element.id||element.tagName+' '+element.textContent.slice(0,30));
  }
  for(const element of flight.querySelectorAll('button,input,select,[data-i18n]'))violations.push('inside viewport: '+element.id);
  const walker=document.createTreeWalker(flight,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode()))if(node.textContent.trim())violations.push('viewport text: '+node.textContent.trim().slice(0,50));
  return violations;
 });
 assert.deepEqual(violations,[],'Gameplay text and controls stay outside the flight rectangle');
}
async function capture(page,name){await pause(page);await page.locator('#flight').scrollIntoViewIfNeeded();await page.waitForTimeout(300);await page.locator('#flight').screenshot({path:path.join(output,name)});}
async function photoReady(page){
 await page.waitForFunction(()=>{const dialog=document.getElementById('photoDialog'),image=document.getElementById('photoPreviewImage');return dialog.open&&image.complete&&image.naturalWidth>0;},null,{timeout:15000});
 const preview=await page.locator('#photoPreviewImage').evaluate(image=>({src:image.src,width:image.naturalWidth,height:image.naturalHeight}));
 assert(preview.src.startsWith('data:image/png;base64,')&&preview.width>0&&preview.height>0,'Captured PNG remains available for embedded-browser longpress saving');
 return preview;
}
async function selectDestination(page,query,heading,photoId){
 await page.locator('#destinationQuery').fill(query);await page.locator('#destinationForm button').click();
 await page.waitForFunction(()=>document.getElementById('searchResults').children.length>0,null,{timeout:10000});
 const choice=page.locator('#searchResults button').filter({has:page.locator('strong').filter({hasText:heading})}).first();
 assert(await choice.count(),`Local destination found: ${query}`);await choice.click();
 await page.waitForFunction(id=>{const s=window.flightTool.execute({});return s.renderer?.scenery==='ready'&&s.renderer?.sceneryId===id;},photoId,{timeout:15000});
 assert.match(await page.locator('#placeOverlayName').textContent(),heading);
}
try{
 browser=await chromium.launch({executablePath:process.env.AERO_CHROMIUM_EXECUTABLE||undefined,headless:true,args:[...(packaged?.args||[]).filter(arg=>arg!=='--single-process'),'--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const desktop=await setup();const {page,errors,downloads}=desktop;
 assert.equal((await read(page)).locale,'en');
 assert.equal(await page.locator('#googleKey,#weatherEndpoint').count(),0,'Players are not asked for API key inputs');
 assert.equal(await page.locator('#locationMap').evaluate(el=>el.tagName),'DIV');
 assert.equal(await page.locator('#locationMap iframe').count(),0,'Default street map does not create a consumer Google iframe');
 assert.match(await page.locator('.aero-map-reading').textContent(),/22\.659012, 120\.347891/);
 assert.equal(await page.evaluate(()=>window.__gpsRequests),1);
 results.desktop.gps={lat:22.659012,lon:120.347891,accuracy:7,requests:1};
 await settings(page);await page.locator('#mission').selectOption('free');
 await resume(page);await page.keyboard.down('w');await page.waitForFunction(()=>window.flightTool.execute({}).altitude>2,null,{timeout:16000});await page.keyboard.up('w');
 await page.keyboard.down('ArrowUp');await page.waitForFunction(()=>window.flightTool.execute({}).speed>2,null,{timeout:12000});await page.keyboard.up('ArrowUp');
 await page.locator('#viewButton').click();assert.equal((await read(page)).view,'fpv');await capture(page,'v41-fpv.png');
 await page.locator('#viewButton').click();
 await page.locator('#world').focus();await page.keyboard.press('g');assert.equal(await page.locator('#beaconCount').textContent(),'1');
 const beforePhotoDownloads=downloads.length;await page.keyboard.press('f');await photoReady(page);await page.waitForTimeout(200);
 assert.equal(downloads.length,beforePhotoDownloads,'F creates a preview and does not automatically download');
 assert.equal(await page.locator('#downloadPhoto').isVisible(),true);
 const modalBeacon=await page.locator('#beaconCount').textContent(),modalState=await read(page);
 await page.keyboard.press('g');await page.keyboard.press('v');assert.equal(await page.locator('#beaconCount').textContent(),modalBeacon);assert.equal((await read(page)).view,modalState.view,'Photo modal blocks game keyboard shortcuts');
 const downloadPromise=page.waitForEvent('download');await page.locator('#downloadPhoto').click();const download=await downloadPromise;await download.saveAs(path.join(output,'v41-camera-photo.png'));assert(fs.statSync(path.join(output,'v41-camera-photo.png')).size>2000);
 assert.equal(await page.locator('#photoStatus').textContent(),dictionary.en.photoDownloadRequested,'An explicit download reports a request rather than falsely guaranteeing a save');
 await page.locator('#closePhoto').click();await page.locator('#world').focus();await page.keyboard.press('c');await page.waitForTimeout(250);assert.match(await page.locator('.aero-map-reading').textContent(),/Simulated position/);
 await page.locator('#world').focus();await page.keyboard.press('b');assert((await page.locator('#guideAnswer').textContent()).length>40);
 const beaconCount=await page.locator('#beaconCount').textContent(),downloadCount=downloads.length;
 await page.locator('#destinationQuery').fill('');await page.locator('#destinationQuery').pressSequentially('fgcb');await page.waitForTimeout(150);
 assert.equal(await page.locator('#destinationQuery').inputValue(),'fgcb');assert.equal(await page.locator('#beaconCount').textContent(),beaconCount);assert.equal(downloads.length,downloadCount,'Typing F must not take a photo');
 results.desktop.shortcuts={F:true,G:true,C:true,B:true,inputFocus:true};
 await page.locator('#destinationQuery').fill('');
 await cleanViewport(page);
 await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(150);await page.screenshot({path:path.join(output,'v41-desktop.png')});

 // Verify local DOM map rendering with deterministic tiles; this does not claim live provider availability.
 await page.locator('#locationMap').scrollIntoViewIfNeeded();await page.locator('#mapRecenter').click();
 await page.waitForFunction(()=>document.getElementById('locationMap').dataset.mapState==='ready',null,{timeout:10000});
 const mapDetails=await page.locator('#locationMap').evaluate(el=>({state:el.dataset.mapState,tiles:el.querySelectorAll('.aero-map-tile').length,loaded:[...el.querySelectorAll('.aero-map-tile')].every(image=>image.complete&&image.naturalWidth>0),reading:el.querySelector('.aero-map-reading').textContent,attribution:el.querySelector('.aero-map-credits a').href}));
 assert(mapDetails.tiles>0&&mapDetails.tiles<=9&&mapDetails.loaded,'Bounded visible map tiles decode');
 assert.equal(mapDetails.attribution,'https://www.openstreetmap.org/copyright');assert.equal(await page.locator('#locationMap iframe').count(),0);
 const externalMap=new URL(await page.locator('#externalMap').getAttribute('href'));assert(externalMap.hostname.endsWith('google.com'));
 results.map={...mapDetails,transport:'mocked deterministic tiles',realProviderRender:'not verified; external transport is separate',consumerIframe:false};
 await page.locator('#locationMap').screenshot({path:path.join(output,'v41-dom-map-fixture.png')});

 // All 14 shipped photographs must decode at their stated resolution.
 results.photos=await page.evaluate(async assets=>Promise.all(assets.map(asset=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve({id:asset.id,width:image.naturalWidth,height:image.naturalHeight,is360:asset.is360,okay:image.naturalWidth===asset.dimensions[0]&&image.naturalHeight===asset.dimensions[1]});image.onerror=()=>resolve({id:asset.id,okay:false});image.src=new URL('assets/photos/'+asset.file,document.baseURI).href;}))),manifest.assets);
 assert.equal(results.photos.length,manifest.assets.length);assert(results.photos.length>=14);assert(results.photos.every(photo=>photo.okay),'Every shipped photo decodes with declared dimensions');assert(results.photos.filter(photo=>photo.is360).length>=2);
 await selectDestination(page,'Yellowstone',/^Old Faithful$/,'yellowstone-old-faithful');
 assert.match(await page.locator('#vehicleCoordinates').textContent(),/44\.460500, -110\.828100/);assert.equal((await read(page)).renderer.sceneryType,'photo');
 const nearbyPhoto=page.locator('#nearbyList .place-card').filter({has:page.locator('img.nearby-photo')}).first();assert(await nearbyPhoto.count(),'Curated nearby cards show real licensed photos');await nearbyPhoto.locator('img.nearby-photo').scrollIntoViewIfNeeded();await nearbyPhoto.locator('img.nearby-photo').evaluate(image=>image.decode());assert(await nearbyPhoto.locator('.photo-credit a').count()>=2,'Nearby image retains author/source and license links');
 if((await read(page)).view!=='fpv')await page.locator('#viewButton').click();await resume(page);await page.locator('#world').focus();await page.keyboard.down('w');await page.waitForFunction(()=>window.flightTool.execute({}).altitude>3,null,{timeout:16000});await page.keyboard.up('w');await pause(page);const photoBefore=await page.locator('#flight').screenshot({path:path.join(output,'v41-photo-motion-before.png')});
 await resume(page);await page.locator('#world').focus();await page.keyboard.down('ArrowUp');await page.waitForFunction(()=>window.flightTool.execute({}).renderer.photoMotion?.distance>5,null,{timeout:14000});await page.keyboard.up('ArrowUp');await pause(page);await page.waitForTimeout(300);const photoAfter=await page.locator('#flight').screenshot({path:path.join(output,'v41-photo-motion-after.png')});assert.notDeepEqual(photoBefore,photoAfter,'Actual flight movement changes the reprojected photo view');const motion=(await read(page)).renderer.photoMotion;assert.equal(motion.method,'photo-2.5d');assert(motion.distance>5);results.desktop.photoMotion={...motion,actualInput:true,pixelsChanged:true,nearbyLicensedPhoto:true};await page.locator('#viewButton').click();
 await selectDestination(page,'太平山',/^Jancing Historic Trail$/,'taipingshan-jancing');
 assert.match(await page.locator('#vehicleCoordinates').textContent(),/24\.505409, 121\.525758/);
 await selectDestination(page,'故宮',/^National Palace Museum$/,'taipei-npm');
 assert.equal(await page.locator('#photoGallery .photo-card').count(),3,'Museum exterior and two artifacts shown');assert.equal(await page.locator('#photoGallery img.artwork').count(),2,'Artifacts are artwork cards');
 await selectDestination(page,'博愛公園',/^Boai Park/,'taiwan-boai-park-360');assert.match((await read(page)).renderer.sceneryType,/panorama/);await capture(page,'v41-panorama-360.png');
 results.desktop.localSearch={Yellowstone:true,Taipingshan:true,PalaceMuseum:true,panorama360:true,photos:manifest.assets.length};
 await settings(page);await page.locator('#vehicle').selectOption('land');assert.equal((await read(page)).vehicle,'land');await resume(page);await page.locator('#world').focus();await page.keyboard.down('ArrowUp');await page.waitForFunction(()=>window.flightTool.execute({}).speed>1,null,{timeout:10000});await page.keyboard.up('ArrowUp');assert.equal((await read(page)).altitude,0);await capture(page,'v41-land.png');
 await page.locator('#vehicle').selectOption('water');assert.equal((await read(page)).vehicle,'water');await resume(page);await page.locator('#world').focus();await page.keyboard.down('s');await page.waitForFunction(()=>window.flightTool.execute({}).depth>3,null,{timeout:12000});await page.keyboard.up('s');await capture(page,'v41-submarine.png');
 results.desktop.vehicles={air:true,land:true,water:true};assert.deepEqual(errors,[]);results.desktop.errors=errors;await desktop.context.close();

 const mobile=await setup({width:375,height:812,mobile:true,memory:1});const mp=mobile.page;
 assert.equal((await read(mp)).tier,'lite');assert.equal(await mp.locator('body').getAttribute('data-input'),'sticks');await cleanViewport(mp);
 await settings(mp);await mp.locator('#mission').selectOption('free');await mp.locator('#flightReset').click();await mp.locator('#touchControls').scrollIntoViewIfNeeded();await resume(mp);await mp.locator('#touchControls').scrollIntoViewIfNeeded();
 const left=await mp.locator('#leftStick').boundingBox(),right=await mp.locator('#rightStick').boundingBox();const session=await mobile.context.newCDPSession(mp);
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:left.x+left.width/2,y:left.y+left.height*.18,id:1},{x:right.x+right.width/2,y:right.y+right.height*.18,id:2}]});
 await mp.waitForFunction(()=>{const s=window.flightTool.execute({});return s.altitude>1&&s.speed>1;},null,{timeout:16000});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await mp.waitForFunction(()=>Object.values(window.flightTool.execute({}).controls).every(value=>value===0));await pause(mp);await mp.locator('#viewButton').click();assert.equal((await read(mp)).view,'fpv');await cleanViewport(mp);await capture(mp,'v41-mobile-fpv.png');
 await mp.locator('#fullButton').click();await mp.waitForFunction(()=>document.fullscreenElement?.id==='flightColumn',null,{timeout:5000});await cleanViewport(mp);assert(await mp.locator('#leftStick').isVisible(),'Touch deck remains visible in fullscreen');
 const fullscreenRects=await mp.evaluate(()=>Object.fromEntries(['leftStick','rightStick','photoButton','dropButton','whereButton','storyButton'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return[id,{top:r.top,bottom:r.bottom,viewportHeight:innerHeight}]})));
 for(const [id,rect] of Object.entries(fullscreenRects))assert(rect.top>=0&&rect.bottom<=rect.viewportHeight+1,`${id} fits completely inside mobile fullscreen`);
 await mp.screenshot({path:path.join(output,'v41-mobile-fullscreen.png')});await mp.evaluate(()=>document.exitFullscreen());
 await mp.locator('#settings').evaluate(element=>element.open=false);await mp.evaluate(()=>window.scrollTo(0,0));await mp.waitForTimeout(300);await mp.screenshot({path:path.join(output,'v41-mobile.png')});
 assert.equal(await mp.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(mobile.errors,[]);results.mobile={viewport:'375×812',dualTouch:true,FPV:true,noControlOverlay:true,fullscreenControls:true,fullscreenRects,noOverflow:true,errors:mobile.errors};await mobile.context.close();

 // LINE Android regression: actual game capture, with supported/unsupported OS-sharing cases stubbed separately.
 const embedded=await setup({width:375,height:812,mobile:true,memory:1,userAgent:lineUA,tileFailure:true});const lp=embedded.page;
 await pause(lp);await cleanViewport(lp);
 await lp.evaluate(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'canShare',{configurable:true,value:undefined});});
 const lineDownloads=embedded.downloads.length;await lp.locator('#photoButton').click();const linePreview=await photoReady(lp);await lp.waitForTimeout(200);
 assert.equal(embedded.downloads.length,lineDownloads,'LINE capture never automatically downloads');assert.equal(await lp.locator('#downloadPhoto').isVisible(),false,'Download link is hidden in LINE');assert.equal(await lp.locator('#sharePhoto').isVisible(),false,'Unsupported file share is hidden');assert.equal(await lp.locator('#photoInAppHint').isVisible(),true);
 assert.equal(await lp.locator('#photoStatus').textContent(),dictionary.en.photoSaved);assert.doesNotMatch(await lp.locator('#photoStatus').textContent(),/downloaded|saved successfully/i,'Photo-ready status does not claim a saved file');
 assert.equal(await lp.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await lp.screenshot({path:path.join(output,'v41-line-preview.png')});await lp.locator('#closePhoto').click();
 await lp.evaluate(()=>{
  window.__shares=[];window.__shareMode='success';
  Object.defineProperty(navigator,'canShare',{configurable:true,value:({files})=>files?.length===1&&files[0].type==='image/png'});
  Object.defineProperty(navigator,'share',{configurable:true,value:async({files})=>{window.__shares.push(files.map(file=>({name:file.name,type:file.type,size:file.size})));if(window.__shareMode!=='success')throw new DOMException('QA '+window.__shareMode,window.__shareMode);}});
 });
 await lp.locator('#photoButton').click();await photoReady(lp);assert.equal(await lp.locator('#sharePhoto').isVisible(),true);assert.equal(await lp.locator('#downloadPhoto').isVisible(),false);
 await lp.locator('#sharePhoto').click();await lp.waitForFunction(()=>document.getElementById('sharePhoto').disabled===false);assert.equal(await lp.locator('#photoStatus').textContent(),dictionary.en.photoShareHandedOff);
 const sharedFiles=await lp.evaluate(()=>window.__shares);assert.equal(sharedFiles.length,1);assert.equal(sharedFiles[0][0].type,'image/png');assert(sharedFiles[0][0].size>2000);assert.match(sharedFiles[0][0].name,/^AERO-air-\d+\.png$/);
 await lp.locator('#closePhoto').click();await lp.evaluate(()=>window.__shareMode='NotAllowedError');await lp.locator('#photoButton').click();await photoReady(lp);await lp.locator('#sharePhoto').click();await lp.waitForFunction(()=>document.getElementById('sharePhoto').disabled===false);assert.equal(await lp.locator('#photoStatus').textContent(),dictionary.en.photoShareFailed);assert(await lp.locator('#photoPreviewImage').evaluate(image=>image.complete&&image.naturalWidth>0),'Rejected sharing preserves the preview');
 await lp.locator('#closePhoto').click();await lp.evaluate(()=>window.__shareMode='AbortError');await lp.locator('#photoButton').click();await photoReady(lp);const beforeCancel=await lp.locator('#photoStatus').textContent();await lp.locator('#sharePhoto').click();await lp.waitForFunction(()=>document.getElementById('sharePhoto').disabled===false);assert.equal(await lp.locator('#photoStatus').textContent(),beforeCancel,'Cancelled share does not claim success or failure');await lp.locator('#closePhoto').click();
 await lp.evaluate(()=>Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>{throw Error('Unsupported file share');}}));await lp.locator('#photoButton').click();await photoReady(lp);assert.equal(await lp.locator('#sharePhoto').isVisible(),false);await lp.locator('#closePhoto').click();
 await lp.locator('#locationMap').scrollIntoViewIfNeeded();await lp.locator('#mapRecenter').click();await lp.waitForFunction(()=>document.getElementById('locationMap').dataset.mapState==='fallback',null,{timeout:10000});assert.equal(await lp.locator('#locationMap iframe').count(),0);assert.match(await lp.locator('.aero-map-reading').textContent(),/22\.659012, 120\.347891/);assert(await lp.locator('.aero-map-status').isVisible());await lp.locator('#locationMap').screenshot({path:path.join(output,'v41-line-map-fallback.png')});
 assert.equal(embedded.downloads.length,lineDownloads);await cleanViewport(lp);assert.deepEqual(embedded.errors,[]);
 results.line={userAgent:lineUA,previewPNG:{width:linePreview.width,height:linePreview.height},noAutomaticDownload:true,downloadHidden:true,unsupportedShare:true,supportedShare:true,sharedFiles,shareRejectedPreviewKept:true,cancelNoFalseSuccess:true,canShareThrowsHandled:true,mapFallbackCoordinates:true,consumerIframe:false,errors:embedded.errors,deviceLimitation:'Synthetic Chromium LINE UA and stubbed Web Share validate app behavior; real LINE/OS saving still requires device QA'};await embedded.context.close();

 const japanese=await setup({locale:'ja-JP',memory:1,pathname:''});assert.equal((await read(japanese.page)).locale,'ja');assert.equal(await japanese.page.locator('html').getAttribute('lang'),'ja');assert.deepEqual(japanese.errors,[]);await japanese.context.close();
 const traditional=await setup({locale:'ja-JP',memory:1,pathname:'zh-Hant/'});assert.equal((await read(traditional.page)).locale,'zh-Hant');assert.equal(await traditional.page.locator('html').getAttribute('lang'),'zh-Hant');assert.deepEqual(traditional.errors,[]);await traditional.context.close();results.language={autoJapanese:true,explicitTraditionalChinese:true};
 fs.writeFileSync(path.join(output,'qa-v41-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser?.close();server?.kill('SIGTERM');}
