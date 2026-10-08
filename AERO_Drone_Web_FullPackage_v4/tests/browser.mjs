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
 if(round===39)throw Error('v4 bundle was not rebuilt within the QA startup window');
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
const results={photos:[],desktop:{},mobile:{},language:{},map:{}};
const read=page=>page.evaluate(()=>window.flightTool.execute({}));
const pause=async page=>{if((await read(page)).running)await page.locator('#startButton').click();};
const resume=async page=>{if(!(await read(page)).running)await page.locator('#startButton').click();};
async function setup({width=1440,height=1000,mobile=false,locale='en-US',memory=8,pathname='en/'}={}){
 const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale,acceptDownloads:true,serviceWorkers:'block',ignoreHTTPSErrors:true});
 // Wikipedia nearby/search network is bounded separately; local library search is tested here.
 await context.route('**.wikipedia.org/w/api.php?*',route=>route.abort('blockedbyclient'));
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
 const initialMap=new URL(await page.locator('#locationMap').getAttribute('src'));
 assert.equal(initialMap.searchParams.get('q'),'22.659012,120.347891');
 assert.equal(initialMap.searchParams.has('key'),false);assert.equal(await page.evaluate(()=>window.__gpsRequests),1);
 results.desktop.gps={lat:22.659012,lon:120.347891,accuracy:7,requests:1};
 await settings(page);await page.locator('#mission').selectOption('free');
 await resume(page);await page.keyboard.down('w');await page.waitForFunction(()=>window.flightTool.execute({}).altitude>2,null,{timeout:16000});await page.keyboard.up('w');
 await page.keyboard.down('ArrowUp');await page.waitForFunction(()=>window.flightTool.execute({}).speed>2,null,{timeout:12000});await page.keyboard.up('ArrowUp');
 await page.locator('#viewButton').click();assert.equal((await read(page)).view,'fpv');await capture(page,'v4-fpv.png');
 await page.locator('#viewButton').click();
 await page.locator('#world').focus();await page.keyboard.press('g');assert.equal(await page.locator('#beaconCount').textContent(),'1');
 const downloadPromise=page.waitForEvent('download');await page.keyboard.press('f');const download=await downloadPromise;await download.saveAs(path.join(output,'v4-camera-photo.png'));assert(fs.statSync(path.join(output,'v4-camera-photo.png')).size>2000);
 await page.keyboard.press('c');await page.waitForTimeout(250);assert.match(await page.locator('#locationMap').getAttribute('src'),/output=embed/);
 await page.locator('#world').focus();await page.keyboard.press('b');assert((await page.locator('#guideAnswer').textContent()).length>40);
 const beaconCount=await page.locator('#beaconCount').textContent(),downloadCount=downloads.length;
 await page.locator('#destinationQuery').fill('');await page.locator('#destinationQuery').pressSequentially('fgcb');await page.waitForTimeout(150);
 assert.equal(await page.locator('#destinationQuery').inputValue(),'fgcb');assert.equal(await page.locator('#beaconCount').textContent(),beaconCount);assert.equal(downloads.length,downloadCount,'Typing F must not take a photo');
 results.desktop.shortcuts={F:true,G:true,C:true,B:true,inputFocus:true};
 await page.locator('#destinationQuery').fill('');
 await cleanViewport(page);
 await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(150);await page.screenshot({path:path.join(output,'v4-desktop.png')});

 // An honest real iframe attempt: inspect the loaded document, but do not assert provider availability.
 await page.locator('#locationMap').scrollIntoViewIfNeeded();
 let mapResponseStatus=null;const mapFailures=[];page.on('response',response=>{if(response.url().startsWith('https://www.google.com/maps'))mapResponseStatus=response.status();});
 page.on('requestfailed',request=>{if(request.url().includes('google.com/maps'))mapFailures.push({url:request.url(),error:request.failure()?.errorText});});
 await page.locator('#mapRecenter').click();await page.waitForTimeout(1800);
 const frame=await (await page.locator('#locationMap').elementHandle()).contentFrame();
 try{await frame.waitForLoadState('domcontentloaded',{timeout:10000});}catch{}
 try{results.map={url:frame.url(),responseStatus:mapResponseStatus,failures:mapFailures,text:(await frame.locator('body').textContent({timeout:1500})).trim().slice(0,600),mapElements:await frame.locator('.gm-style,canvas,[aria-label="Map"]').count()};}catch(error){results.map={url:frame?.url(),failures:mapFailures,unavailable:error.message.slice(0,200)};}
 await page.locator('#locationMap').screenshot({path:path.join(output,'v4-google-iframe.png')});

 // All 14 shipped photographs must decode at their stated resolution.
 results.photos=await page.evaluate(async assets=>Promise.all(assets.map(asset=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve({id:asset.id,width:image.naturalWidth,height:image.naturalHeight,is360:asset.is360,okay:image.naturalWidth===asset.dimensions[0]&&image.naturalHeight===asset.dimensions[1]});image.onerror=()=>resolve({id:asset.id,okay:false});image.src=new URL('assets/photos/'+asset.file,document.baseURI).href;}))),manifest.assets);
 assert.equal(results.photos.length,14);assert(results.photos.every(photo=>photo.okay),'Every shipped photo decodes with declared dimensions');assert.equal(results.photos.filter(photo=>photo.is360).length,2);
 await selectDestination(page,'Yellowstone',/^Old Faithful$/,'yellowstone-old-faithful');
 assert.match(await page.locator('#vehicleCoordinates').textContent(),/44\.460500, -110\.828100/);assert.equal((await read(page)).renderer.sceneryType,'photo');
 await selectDestination(page,'太平山',/^Jancing Historic Trail$/,'taipingshan-jancing');
 assert.match(await page.locator('#vehicleCoordinates').textContent(),/24\.505409, 121\.525758/);
 await selectDestination(page,'故宮',/^National Palace Museum$/,'taipei-npm');
 assert.equal(await page.locator('#photoGallery .photo-card').count(),3,'Museum exterior and two artifacts shown');assert.equal(await page.locator('#photoGallery img.artwork').count(),2,'Artifacts are artwork cards');
 await selectDestination(page,'博愛公園',/^Boai Park/,'taiwan-boai-park-360');assert.match((await read(page)).renderer.sceneryType,/panorama/);await capture(page,'v4-panorama-360.png');
 results.desktop.localSearch={Yellowstone:true,Taipingshan:true,PalaceMuseum:true,panorama360:true,photos:14};
 await settings(page);await page.locator('#vehicle').selectOption('land');assert.equal((await read(page)).vehicle,'land');await resume(page);await page.locator('#world').focus();await page.keyboard.down('ArrowUp');await page.waitForFunction(()=>window.flightTool.execute({}).speed>1,null,{timeout:10000});await page.keyboard.up('ArrowUp');assert.equal((await read(page)).altitude,0);await capture(page,'v4-land.png');
 await page.locator('#vehicle').selectOption('water');assert.equal((await read(page)).vehicle,'water');await resume(page);await page.locator('#world').focus();await page.keyboard.down('s');await page.waitForFunction(()=>window.flightTool.execute({}).depth>3,null,{timeout:12000});await page.keyboard.up('s');await capture(page,'v4-submarine.png');
 results.desktop.vehicles={air:true,land:true,water:true};assert.deepEqual(errors,[]);results.desktop.errors=errors;await desktop.context.close();

 const mobile=await setup({width:375,height:812,mobile:true,memory:1});const mp=mobile.page;
 assert.equal((await read(mp)).tier,'lite');assert.equal(await mp.locator('body').getAttribute('data-input'),'sticks');await cleanViewport(mp);
 await settings(mp);await mp.locator('#mission').selectOption('free');await mp.locator('#flightReset').click();await mp.locator('#touchControls').scrollIntoViewIfNeeded();await resume(mp);await mp.locator('#touchControls').scrollIntoViewIfNeeded();
 const left=await mp.locator('#leftStick').boundingBox(),right=await mp.locator('#rightStick').boundingBox();const session=await mobile.context.newCDPSession(mp);
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:left.x+left.width/2,y:left.y+left.height*.18,id:1},{x:right.x+right.width/2,y:right.y+right.height*.18,id:2}]});
 await mp.waitForFunction(()=>{const s=window.flightTool.execute({});return s.altitude>1&&s.speed>1;},null,{timeout:16000});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await mp.waitForFunction(()=>Object.values(window.flightTool.execute({}).controls).every(value=>value===0));await pause(mp);await mp.locator('#viewButton').click();assert.equal((await read(mp)).view,'fpv');await cleanViewport(mp);await capture(mp,'v4-mobile-fpv.png');
 await mp.locator('#fullButton').click();await mp.waitForFunction(()=>document.fullscreenElement?.id==='flightColumn',null,{timeout:5000});await cleanViewport(mp);assert(await mp.locator('#leftStick').isVisible(),'Touch deck remains visible in fullscreen');
 const fullscreenRects=await mp.evaluate(()=>Object.fromEntries(['leftStick','rightStick','photoButton','dropButton','whereButton','storyButton'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return[id,{top:r.top,bottom:r.bottom,viewportHeight:innerHeight}]})));
 for(const [id,rect] of Object.entries(fullscreenRects))assert(rect.top>=0&&rect.bottom<=rect.viewportHeight+1,`${id} fits completely inside mobile fullscreen`);
 await mp.screenshot({path:path.join(output,'v4-mobile-fullscreen.png')});await mp.evaluate(()=>document.exitFullscreen());
 await mp.locator('#settings').evaluate(element=>element.open=false);await mp.evaluate(()=>window.scrollTo(0,0));await mp.waitForTimeout(300);await mp.screenshot({path:path.join(output,'v4-mobile.png')});
 assert.equal(await mp.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(mobile.errors,[]);results.mobile={viewport:'375×812',dualTouch:true,FPV:true,noControlOverlay:true,fullscreenControls:true,fullscreenRects,noOverflow:true,errors:mobile.errors};await mobile.context.close();

 const japanese=await setup({locale:'ja-JP',memory:1,pathname:''});assert.equal((await read(japanese.page)).locale,'ja');assert.equal(await japanese.page.locator('html').getAttribute('lang'),'ja');assert.deepEqual(japanese.errors,[]);await japanese.context.close();
 const traditional=await setup({locale:'ja-JP',memory:1,pathname:'zh-Hant/'});assert.equal((await read(traditional.page)).locale,'zh-Hant');assert.equal(await traditional.page.locator('html').getAttribute('lang'),'zh-Hant');assert.deepEqual(traditional.errors,[]);await traditional.context.close();results.language={autoJapanese:true,explicitTraditionalChinese:true};
 fs.writeFileSync(path.join(output,'qa-v4-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser?.close();server?.kill('SIGTERM');}
