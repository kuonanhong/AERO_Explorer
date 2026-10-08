import {createState,setVehicle,step,MODES,RINGS,clamp} from './physics.js';
import {createLiteWorld} from './lite-scene.js';
import {probeDevice,PROFILES,AdaptiveQuality} from './device.js';
import {DEFAULT_ORIGIN,validCoordinate,toGeographic,closestPlaces,placesData,GoogleViews,searchGoogleNearby} from './geo.js';
import {fetchWeather} from './weather.js';
import {detectLocale,parseCoordinate,googleMapURL,LiveLocationMap,fetchWikiNearby,searchWikiDestinations} from './navigation.js';
import photoManifest from './assets/photos/manifest.json';
import destinations from './assets/destinations.json';
import {translations} from './assets/i18n.js';
const $=id=>document.getElementById(id);
// Progressive dialog support for older mobile Safari; focus and Escape stay usable.
for(const dialog of document.querySelectorAll('dialog')){
 if(typeof dialog.showModal!=='function'){
  dialog.showModal=function(){this.setAttribute('open','');this.classList.add('fallback-dialog');this.querySelector('button')?.focus();};
  dialog.close=function(){this.removeAttribute('open');this.classList.remove('fallback-dialog');this.dispatchEvent(new Event('close'));};
 }
}
function pointerEvents(element,handlers){
 if(window.PointerEvent){for(const [type,handler]of Object.entries(handlers))element.addEventListener(type,handler);return;}
 for(const [type,pointerType]of [['touchstart','pointerdown'],['touchmove','pointermove'],['touchend','pointerup'],['touchcancel','pointercancel']]){
  element.addEventListener(type,e=>{for(const touch of e.changedTouches)handlers[pointerType]?.({pointerId:touch.identifier,clientX:touch.clientX,clientY:touch.clientY,preventDefault:()=>e.preventDefault()});},{passive:false});
 }
 element.setPointerCapture=()=>{};
}
const localeNames={'zh-Hant':'繁體中文','zh-Hans':'简体中文',en:'English',ja:'日本語',ko:'한국어',ar:'العربية',ms:'Bahasa Melayu',th:'ไทย',vi:'Tiếng Việt',id:'Bahasa Indonesia',fil:'Filipino',de:'Deutsch',pl:'Polski',cs:'Čeština',pt:'Português',fi:'Suomi',sv:'Svenska',ru:'Русский',fr:'Français',es:'Español',it:'Italiano',hi:'हिन्दी'};
let locale=document.documentElement.dataset.locale||'zh-Hant';
function storageGet(key,fallback){try{return localStorage.getItem(key)||fallback;}catch{return fallback;}}
function save(key,value){try{localStorage.setItem(key,value);}catch{}}
if(document.documentElement.dataset.autoLocale==='true'||!document.documentElement.dataset.locale)locale=storageGet('aero.language',detectLocale(navigator.languages||[navigator.language],Object.keys(translations)));if(!translations[locale])locale='en';
const config=globalThis.AERO_CONFIG||{};
const photoById=new Map(photoManifest.assets.map(asset=>[asset.id,asset]));
let mapTracker=null,sceneryId=null,searchController=null,nearbyController=null,originRevision=0,beaconSerial=0,nearbyTimer=null;
let passport=[];try{const saved=JSON.parse(storageGet('aero.passport','[]'));if(Array.isArray(saved))passport=saved.filter(x=>x&&typeof x.id==='string').slice(-100);}catch{}
let beacons=[];

let vehicle='air',tier='balanced',capabilities=null,adaptive=null,bootReady=false,switchingWorld=false,rendererLoading=null;
let origin={...DEFAULT_ORIGIN,...config.initialOrigin},selectedPlace=null,nearbyItems=[],sceneSource='sim',googleKey=config.googleMapsKey||'',weatherEndpoint=config.weatherEndpoint||'',activeWeather=null,originKind='example',originAccuracy=null,noticeTimer,geoViews=null;
let state=createState(),running=false,hasStarted=false,view='chase',mode='beginner',mission='course',world=null,learned=false;
const keys=new Set(),padPointers=new Map(),sticks={left:{x:0,y:0},right:{x:0,y:0}};
let soundContext,osc,gain;
const t=key=>translations[locale]?.[key]||translations.en[key]||key;
for(const [code,name]of Object.entries(localeNames)){const option=document.createElement('option');option.value=code;option.textContent=name;$('language').append(option);}
function applyLanguage(code){if(!translations[code])return;locale=code;document.documentElement.lang=code;document.documentElement.dir=code==='ar'?'rtl':'ltr';$('language').value=code;document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));document.querySelectorAll('[data-label]').forEach(el=>{el.title=t(el.dataset.label);el.setAttribute('aria-label',t(el.dataset.label));});document.title=t('title')+' | AERO';$('sceneLabel').textContent=t($('scene').value);document.querySelectorAll('[data-placeholder]').forEach(el=>el.placeholder=t(el.dataset.placeholder));updateLabels();refreshExplorer();renderDestinations();renderPhotoGallery();renderPassport();updateLocationMap(true);save('aero.language',code);if(bootReady)scheduleNearby();}
function updateLabels(){
 $('startText').textContent=t(running?'pause':hasStarted?'resume':'start');$('flightPause').textContent=running?'Ⅱ':'▷';$('flightPause').title=t(running?'pause':'resume');$('flightPause').setAttribute('aria-label',t(running?'pause':'resume'));$('viewButton').textContent=t(view==='chase'?'fpv':'chase');
 $('difficultyHint').textContent=t(mode==='expert'?'expertHint':'beginnerHint');
 $('status').textContent=t(state.crashed?'crash':state.complete?'completed':running?(state.landed?'landed':'flying'):hasStarted?'paused':'ready');
 $('objective').textContent=t(mission==='free'?(vehicle==='air'?'freeFlight':vehicle==='water'?'waterVehicle':'landVehicle'):state.ring===RINGS.length?'returnPad':'objective');
 $('missionHint').textContent=t(vehicle==='water'?'waterControls':vehicle==='land'?'landControls':mission==='free'?'beginHint':state.ring===RINGS.length?'returnPad':state.ring?'nextRing':'beginHint');
 $('centerMessage').hidden=!(state.crashed||state.complete);$('centerTitle').textContent=t(state.crashed?'crash':'completed');
}
function clearInputs(){keys.clear();padPointers.clear();sticks.left={x:0,y:0};sticks.right={x:0,y:0};document.querySelectorAll('.stick-knob').forEach(el=>el.style.transform='');document.querySelectorAll('.pressed').forEach(el=>el.classList.remove('pressed'));}
function setRunning(next){running=!!next&&!!world&&bootReady&&!state.crashed&&!state.complete;if(running){hasStarted=true;$('world').focus({preventScroll:true});}else clearInputs();updateLabels();}
function reset(){const was=running;state=createState(vehicle);beacons=[];state.beacons=beacons;world?.resetCamera();clearInputs();updateLabels();setRunning(was);world?.draw(state,0,view,mission);hud();}
function openTutorial(){setRunning(false);if(!$('tutorial').open)$('tutorial').showModal();}
function start(){if(!learned){openTutorial();return;}setRunning(!running);}
$('startButton').onclick=start;$('flightPause').onclick=start;$('flightReset').onclick=reset;$('helpButton').onclick=openTutorial;
$('closeTutorial').onclick=()=>{$('tutorial').close();};
$('tutorialStart').onclick=()=>{learned=true;save('aero.tutorial','1');$('tutorial').close();setRunning(true);};
$('resetButton').onclick=reset;$('recover').onclick=()=>{reset();setRunning(true);};
$('viewButton').onclick=()=>{view=view==='chase'?'fpv':'chase';$('crosshair').hidden=view!=='fpv';world?.resetCamera();updateLabels();};
$('difficulty').onchange=()=>{mode=$('difficulty').value;reset();updateLabels();};
$('mission').onchange=()=>{mission=$('mission').value;reset();};
$('scene').onchange=()=>{setScenery(null);world?.build($('scene').value);$('sceneLabel').textContent=t($('scene').value);$('worldNumber').textContent=String(['coast','alpine','dusk'].indexOf($('scene').value)+1).padStart(2,'0');reset();};
$('quality').onchange=()=>{const value=$('quality').value;setProfile(value==='auto'?capabilities?.tier||'lite':value==='low'?'lite':value==='high'?'full':'balanced').catch(()=>setProfile('lite'));};
$('language').onchange=()=>{const code=$('language').value;applyLanguage(code);const base=new URL('.',document.baseURI);const target=new URL(code+'/',base);if(/^https?:$/.test(location.protocol))history.replaceState(null,'',target);};
const coarse=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>1;
$('inputMode').value=coarse?'sticks':'keyboard';
function changeInput(){clearInputs();document.body.dataset.input=$('inputMode').value;resizeScene();}
$('inputMode').onchange=changeInput;changeInput();
$('fullButton').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('flightColumn').requestFullscreen)await $('flightColumn').requestFullscreen();else $('flight').scrollIntoView({behavior:'smooth'});}catch{}};
$('mapButton').onclick=()=>{setRunning(false);$('mapDialog').showModal();};$('closeMap').onclick=()=>{$('mapDialog').close();};
$('googleLink').onclick=e=>{const a=$('lat').value.trim(),b=$('lon').value.trim(),lat=Number(a),lon=Number(b);const valid=a!==''&&b!==''&&Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=-85&&lat<=85&&lon>=-180&&lon<=180;$('mapError').hidden=valid;if(!valid){e.preventDefault();return;}$('googleLink').href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(lat+','+lon);};
const bindings={KeyW:['lift',1],KeyS:['lift',-1],KeyA:['yaw',-1],KeyD:['yaw',1],ArrowUp:['forward',1],ArrowDown:['forward',-1],ArrowLeft:['right',-1],ArrowRight:['right',1]};
function editing(){return /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)||$('tutorial').open||$('mapDialog').open;}
addEventListener('keydown',e=>{if(editing())return;if(bindings[e.code]){e.preventDefault();if(running)keys.add(e.code);}else if(['Space','KeyV','KeyR','KeyF','KeyG','KeyC','KeyB'].includes(e.code)){e.preventDefault();if(!e.repeat){if(e.code==='Space')start();if(e.code==='KeyV')$('viewButton').click();if(e.code==='KeyR')reset();if(e.code==='KeyF')$('photoButton').click();if(e.code==='KeyG')$('dropButton').click();if(e.code==='KeyC')$('whereButton').click();if(e.code==='KeyB')$('storyButton').click();}}});
addEventListener('keyup',e=>{if(bindings[e.code]){keys.delete(e.code);if(!editing())e.preventDefault();}});
addEventListener('blur',()=>setRunning(false));addEventListener('keydown',e=>{if(e.code==='Escape'){if($('tutorial').open)$('tutorial').close();if($('mapDialog').open)$('mapDialog').close();}});document.addEventListener('visibilitychange',()=>{if(document.hidden)setRunning(false);});
$('world').addEventListener('pointerdown',()=>{$('world').focus({preventScroll:true});});
function setupStick(id,side){const area=$(id),knob=area.querySelector('.stick-knob');let active=null;
 const update=e=>{const rect=area.getBoundingClientRect(),radius=rect.width*.34;let x=(e.clientX-rect.left-rect.width/2)/radius,y=(e.clientY-rect.top-rect.height/2)/radius;const len=Math.max(1,Math.hypot(x,y));x/=len;y/=len;sticks[side]={x,y};knob.style.transform=`translate(${x*radius}px,${y*radius}px)`;};
 const down=e=>{if(active!==null)return;e.preventDefault();active=e.pointerId;area.setPointerCapture(e.pointerId);if(running)update(e);};
 const move=e=>{if(active===e.pointerId&&running){e.preventDefault();update(e);}};
 const end=e=>{if(e.pointerId!==active)return;active=null;sticks[side]={x:0,y:0};knob.style.transform='';};
 pointerEvents(area,{pointerdown:down,pointermove:move,pointerup:end,pointercancel:end,lostpointercapture:end});
}
setupStick('leftStick','left');setupStick('rightStick','right');
for(const b of document.querySelectorAll('.keypad button')){
 const down=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);if(running){padPointers.set(e.pointerId,{axis:b.dataset.control,sign:Number(b.dataset.sign),button:b});b.classList.add('pressed');}};
 const end=e=>{padPointers.delete(e.pointerId);if(![...padPointers.values()].some(v=>v.button===b))b.classList.remove('pressed');};pointerEvents(b,{pointerdown:down,pointerup:end,pointercancel:end,lostpointercapture:end});
}
const controlSnapshot={lift:0,yaw:0,forward:0,right:0};
function getControls(){const v=controlSnapshot;v.lift=0;v.yaw=0;v.forward=0;v.right=0;for(const key of keys){const [axis,sign]=bindings[key];v[axis]+=sign;}for(const p of padPointers.values())v[p.axis]+=p.sign;
 v.lift-=sticks.left.y;v.yaw+=sticks.left.x;v.forward-=sticks.right.y;v.right+=sticks.right.x;for(const k of Object.keys(v))v[k]=clamp(v[k],-1,1);return v;}
$('sound').onchange=()=>{if($('sound').checked&&!soundContext){try{soundContext=new(window.AudioContext||window.webkitAudioContext)();osc=soundContext.createOscillator();gain=soundContext.createGain();osc.type='sawtooth';gain.gain.value=0;osc.connect(gain);gain.connect(soundContext.destination);osc.start();}catch{$('sound').checked=false;}}soundContext?.resume();};
for(let i=0;i<RINGS.length;i++)$('ringProgress').append(document.createElement('i'));
$('best').textContent=storageGet('aero.best.'+mode,'0');applyLanguage(locale);
function resizeScene(){world?.resize();if(world&&sceneSource==='sim')world.draw(state,0,view,mission)}
const resizeObserver=window.ResizeObserver?new ResizeObserver(resizeScene):null;resizeObserver?.observe($('flight'));addEventListener('resize',resizeScene);
const radar=$('radar').getContext('2d');
function drawRadar(){if(!radar)return;radar.clearRect(0,0,160,160);radar.strokeStyle='#ffffff28';for(const radius of [25,50,73]){radar.beginPath();radar.arc(80,80,radius,0,Math.PI*2);radar.stroke();}const point=(x,z)=>[80+x*.65,93+(z-15)*.65];radar.strokeStyle='#d6f06d55';radar.beginPath();let points=[{x:0,z:15},...RINGS];points.forEach((r,i)=>{const [x,y]=point(r.x,r.z);if(i)radar.lineTo(x,y);else radar.moveTo(x,y);});if(mission==='course')radar.stroke();radar.font='11px monospace';radar.fillStyle='#d6f06d';radar.fillText('H',77,96);if(mission==='course')RINGS.forEach((r,i)=>{const [x,y]=point(r.x,r.z);radar.fillStyle=i===state.ring?'#d6f06d':i<state.ring?'#719687':'#ffffff66';radar.beginPath();radar.arc(x,y,i===state.ring?4:2.5,0,Math.PI*2);radar.fill();});const [x,y]=point(state.x,state.z);radar.save();radar.translate(clamp(x,9,151),clamp(y,9,151));radar.rotate(state.yaw);radar.fillStyle='#ffffff';radar.beginPath();radar.moveTo(0,-5);radar.lineTo(4,4);radar.lineTo(0,2);radar.lineTo(-4,4);radar.fill();radar.restore();}
function hud(){
 $('altitudeLabel').textContent=t(vehicle==='water'?'depth':'altitude');$('altitude').innerHTML=(vehicle==='water'?Math.abs(state.y):Math.max(0,state.y-.6)).toFixed(1)+'<small>m</small>';$('speed').innerHTML=Math.hypot(state.vx,state.vz).toFixed(1)+'<small>m/s</small>';
 $('wind').innerHTML=MODES[mode].wind.toFixed(1)+'<small>m/s</small>';$('heading').textContent=String(Math.round((state.yaw*180/Math.PI+360)%360)).padStart(3,'0')+'°';
 $('score').textContent=String(state.score).padStart(4,'0');$('best').textContent=storageGet('aero.best.'+mode,'0');$('distanceHome').textContent=Math.round(Math.hypot(state.x,state.z-15));
 [...$('ringProgress').children].forEach((el,i)=>el.className=i<state.ring?'done':i===state.ring?'current':'');$('ringProgress').hidden=mission==='free';$('beaconCount').textContent=String(beacons.length);updateLabels();drawRadar();updateLocationMap();
}
let last=performance.now(),accumulator=0,hudTime=0,frameTime=0,frames=0,idleRender=0,lastRender=0;
function frame(now){const wallDelta=Math.max(0,(now-last)/1000),delta=Math.min(wallDelta,.0667);last=now;
 if(document.hidden){requestAnimationFrame(frame);return;}
 frameTime+=wallDelta;idleRender+=delta;
 if(running){updateBeacons(delta);accumulator+=delta;const input=getControls();let n=0;while(accumulator>=1/120&&n<8){step(state,input,1/120,mode,mission,sceneSource==='sim'?world.obstacles:[]);accumulator-=1/120;n++;}if(state.crashed||state.complete){if(state.complete){const best=Number(storageGet('aero.best.'+mode,'0'));if(state.score>best)save('aero.best.'+mode,String(state.score));}setRunning(false);}}
 else accumulator=0;
 const target=PROFILES[tier].targetFPS;
 if(world&&((running&&now-lastRender>=1000/target-1)||(!running&&idleRender>=.2))){if(sceneSource==='sim')world.draw(state,running?delta:0,view,mission);else geoViews?.update(state,origin,view,locale,now);frames++;idleRender=0;lastRender=now;}
 hudTime+=delta;if(hudTime>.2){hud();hudTime=0;}
 if(frameTime>=2){const fps=Math.round(frames/frameTime);$('fps').textContent=sceneSource==='sim'?fps+' FPS':'Google';const next=sceneSource==='sim'?adaptive?.observe({fps,visible:!document.hidden,running,now}):null;if(next&&!switchingWorld){notice(t('profileReduced'));setProfile(next,true).catch(()=>setProfile('lite'));}frameTime=0;frames=0;}
 if(gain){gain.gain.setTargetAtTime(($('sound').checked&&running)? .012 : 0,soundContext.currentTime,.08);osc.frequency.setTargetAtTime(55+state.throttle*85,soundContext.currentTime,.1);}
 requestAnimationFrame(frame);
}requestAnimationFrame(frame);
// Browser WebMCP is optional. Read-only state helps agents explain the current exercise.
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'read_flight_state',title:'Read flight state',description:'Read the visible drone simulation status, settings and progress.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected empty object');return {running,mode,mission,view,locale,vehicle,tier,x:state.x,z:state.z,depth:vehicle==='water'?Math.abs(state.y):0,renderer:world?.stats||null,altitude:Math.max(0,state.y-.6),speed:Math.hypot(state.vx,state.vz),rings:state.ring,score:state.score,controls:getControls()};}})).catch(()=>{});}catch{}}
function notice(message){$('noticeToast').textContent=message;$('noticeToast').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('noticeToast').hidden=true,6500);}
function placeText(place,field){return place?.[field]?.[locale]||place?.[field]?.en||place?.[field]?.['zh-Hant']||Object.values(place?.[field]||{})[0]||''}
function updateProfileLabel(){if(!capabilities)return;$('profileStatus').textContent=t(tier==='full'?'fullTier':tier==='balanced'?'balancedTier':'liteTier');$('deviceHints').textContent=(capabilities.memoryGB?capabilities.memoryGB+' GB · ':'RAM ? · ')+(capabilities.cores?capabilities.cores+' cores · ':'')+(tier==='lite'?'Canvas 2D':'WebGL')+' · '+t('probeLimit');}
function refreshExplorer(){
 updateProfileLabel();$('vehicleHint').textContent=t(vehicle==='water'?'waterControls':vehicle==='land'?'landControls':'airControls');$('sourceHint').textContent=vehicle==='water'?t('simUnderwater')+' '+t(selectedPlace?.waterProfile==='lake'?'lakeHabitat':selectedPlace?.waterProfile==='land'?'landHabitat':'seaHabitat'):t(sceneSource==='street'?'streetHint':sceneSource==='google'?'googlePowered':'simAir');$('sceneDisclosure').textContent=t(sceneSource==='sim'?'simulationLabel':'realSurfaceLabel');$('scene').disabled=sceneSource!=='sim';$('mission').disabled=vehicle!=='air'||sceneSource!=='sim';$('tutorialVehicle').textContent=t(vehicle==='water'?'waterControls':vehicle==='land'?'landControls':'airControls');
 $('originDisplay').textContent=origin.lat.toFixed(5)+', '+origin.lon.toFixed(5)+' · '+(originKind==='gps'?'GPS ±'+originAccuracy+' m':t(originKind==='manual'?'manualOrigin':'locationApprox'));$('lat').value=origin.lat.toFixed(5);$('lon').value=origin.lon.toFixed(5);$('originAltitude').value=origin.altitude;
 if(!nearbyItems.length)nearbyItems=nearestLocal(origin);renderPlaces();
 if(selectedPlace){$('placeOverlay').hidden=false;$('placeOverlayName').textContent=placeText(selectedPlace,'name');$('placeOverlayDescription').textContent=placeText(selectedPlace,'description');$('placeOverlaySource').href=selectedPlace.sourceUrls?.[0]||'https://maps.google.com';}
 if(!activeWeather)$('weatherStatus').textContent=t('weatherOff');
 $('sourceHint').textContent=vehicle==='water'?t('simUnderwater'):sceneSource==='sim'?t(sceneryId?(photoById.get(sceneryId)?.is360?'panoramaHint':'photoDepthHint'):'simAir'):t(sceneSource==='street'?'streetHint':'googlePowered');
 $('sceneDisclosure').textContent=t(sceneryId?(photoById.get(sceneryId)?.is360?'panoramaScene':'photoScene'):'trainingScene');
 $('currentPlace').textContent=selectedPlace?placeText(selectedPlace,'name'):'';
}
function renderPlaces(){const list=$('nearbyList');list.replaceChildren();for(const place of nearbyItems){const card=document.createElement('article');card.className='place-card'+(selectedPlace?.id===place.id?' selected':'');const title=document.createElement('h3');title.textContent=placeText(place,'name');const dist=document.createElement('span');dist.className='place-distance';dist.textContent=t('distance')+' · '+(place.distance/1000).toFixed(1)+' km';const body=document.createElement('p');body.textContent=placeText(place,'description');const source=document.createElement('a');source.href=place.sourceUrls?.[0]||'https://maps.google.com';source.target='_blank';source.rel='noopener';source.textContent=t('placeSource');const go=document.createElement('button');go.textContent=t('goHere');go.onclick=()=>selectPlace(place);card.append(title,dist,body,source,go);if(place.wiki){const attribution=document.createElement('small');attribution.textContent=t('wikiAttribution');card.append(attribution);const license=document.createElement('a');license.href='https://creativecommons.org/licenses/by-sa/4.0/';license.target='_blank';license.rel='noopener';license.textContent='CC BY-SA 4.0';card.append(license)}if(place.live){const attribution=document.createElement('small');attribution.textContent='Google Maps';card.append(attribution);for(const entry of place.attributions||[]){const a=document.createElement('a');a.textContent=entry.provider||'Attribution';a.href=entry.providerURI||'https://maps.google.com';a.target='_blank';a.rel='noopener';card.append(a)}}list.append(card)}}
function setOrigin(next,keepPlace=false){
 if(!validCoordinate(next.lat,next.lon))throw Error(t('mapError'));
 originRevision++;nearbyController?.abort();activeWeather=null;originKind='manual';originAccuracy=null;
 origin={lat:next.lat,lon:next.lon,altitude:next.altitude??20};
 if(!keepPlace){selectedPlace=null;$('placeOverlay').hidden=true;setScenery(null)}
 nearbyItems=nearestLocal(origin);refreshExplorer();reset();updateLocationMap(true);
 if(sceneSource!=='sim')setSceneSource(sceneSource).catch(()=>{});scheduleNearby();
}
function selectPlace(place){setRunning(false);selectedPlace=place;setOrigin({lat:place.lat,lon:place.lon,altitude:20},true);mission='free';$('mission').value='free';
 if(vehicle==='water')world?.setHabitat(place.waterProfile==='lake'?'lake':'sea');
 setScenery(place.photoId||null);refreshExplorer();renderDestinations();renderPhotoGallery();showGuide('history');notice(t('travelReady'));$('flight').scrollIntoView({behavior:'smooth',block:'start'});
}
async function locate(){if(!navigator.geolocation){notice(t('gpsDeniedShort'));return}const button=$('locateButton');button.disabled=true;$('locationStatus').textContent=t('locationAuto');const requestRevision=originRevision;
 navigator.geolocation.getCurrentPosition(position=>{button.disabled=false;if(originRevision!==requestRevision)return;
 if(!validCoordinate(position.coords.latitude,position.coords.longitude)){$('locationStatus').textContent=t('gpsDeniedShort');return}
 setOrigin({lat:position.coords.latitude,lon:position.coords.longitude,altitude:20});originKind='gps';originAccuracy=Math.round(position.coords.accuracy);$('locationStatus').textContent=t('accuracy')+' ±'+originAccuracy+' m';refreshExplorer();if(config.autoNearby!==false)findNearby();
 },()=>{button.disabled=false;$('locationStatus').textContent=t('gpsDeniedShort');notice(t('gpsDeniedShort'));},{enableHighAccuracy:true,timeout:12000,maximumAge:60000});}
function scheduleNearby(){clearTimeout(nearbyTimer);if(config.autoNearby!==false)nearbyTimer=setTimeout(()=>findNearby(),400)}
let nearbyBusy=false;
async function findNearby(){if(nearbyBusy)return;nearbyBusy=true;nearbyController=new AbortController();const revision=originRevision,requestOrigin={...origin},requestLocale=locale;$('findNearby').disabled=true;$('placesNotice').textContent=t('loading');
 try{const items=googleKey?await searchGoogleNearby(requestOrigin,googleKey,requestLocale):await fetchWikiNearby(requestOrigin,requestLocale,nearbyController.signal);if(revision!==originRevision||requestLocale!==locale)return;
 nearbyItems=items.length?withDistances(items,requestOrigin):nearestLocal(requestOrigin);$('placesNotice').textContent=t(items.length?(googleKey?'livePlacesNotice':'liveNearby'):'noNearby');renderPlaces();}
 catch(e){if(revision!==originRevision)return;nearbyItems=nearestLocal(requestOrigin);$('placesNotice').textContent=t('placeFallback');renderPlaces();}
 finally{nearbyBusy=false;$('findNearby').disabled=false;}
}
async function setSceneSource(next){if(vehicle==='water'&&next!=='sim'){notice(t('simUnderwater'));next='sim'}if(next==='sim'){sceneSource='sim';geoViews?.hide();$('world').hidden=false;world?.resize();$('flight').classList.remove('real-view');$('sceneSource').value='sim';refreshExplorer();return}if(!googleKey){$('sceneSource').value=sceneSource;notice(t('owner3D'));$('mapCard').scrollIntoView({behavior:'smooth',block:'center'});return}setRunning(false);notice(t('googleLoading'));try{const opened=await geoViews.open(next,googleKey,locale,toGeographic(origin,state));if(!opened)return;sceneSource=next;$('sceneSource').value=next;$('world').hidden=true;$('flight').classList.add('real-view');mission='free';$('mission').value='free';refreshExplorer();if(next==='street')notice(t('streetHint'));else notice(t('googlePowered'))}catch(e){setSceneSource('sim');notice(t('googleFailed'));}}
function load3D(){if(globalThis.AeroRenderer3D)return Promise.resolve();if(rendererLoading)return rendererLoading;rendererLoading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('renderer3d.bundle.js',document.baseURI).href;script.onload=()=>globalThis.AeroRenderer3D?resolve():reject(Error('3D module not available'));script.onerror=()=>{rendererLoading=null;reject(Error('3D module could not load'))};document.head.append(script)});return rendererLoading;}
async function setProfile(next,automatic=false){if(switchingWorld)return;switchingWorld=true;const wasRunning=running;setRunning(false);try{if(next!=='lite'&&!capabilities?.webgl)next='lite';if(next!=='lite')await load3D();world?.dispose();world=null;const old=$('world'),canvas=old.cloneNode(false);old.replaceWith(canvas);canvas.addEventListener('pointerdown',()=>canvas.focus({preventScroll:true}));canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();if(switchingWorld||event.currentTarget!==$('world'))return;notice(t('contextRecovered'));setProfile('lite',true).catch(()=>{});});tier=next;world=tier==='lite'?createLiteWorld(canvas):globalThis.AeroRenderer3D.createWorld(canvas,PROFILES[tier]);world.build($('scene').value);if(sceneryId)world.setScenery?.(photoAsset(sceneryId));state.beacons=beacons;if(vehicle==='water')world.setHabitat(selectedPlace?.waterProfile==='lake'?'lake':'sea');world.resize();world.draw(state,0,view,mission);canvas.hidden=sceneSource!=='sim';if(!adaptive)adaptive=new AdaptiveQuality(tier);else adaptive.setTier(tier);updateProfileLabel();$('unsupported').hidden=true;$('startButton').disabled=false;bootReady=true;}catch(e){if(next!=='lite'){switchingWorld=false;return setProfile('lite',true)}$('unsupported').hidden=false;$('unsupported').textContent=t('lowSupport');$('startButton').disabled=true;throw e;}finally{switchingWorld=false;if(bootReady&&wasRunning)setRunning(true);}}
$('vehicle').onchange=()=>{vehicle=$('vehicle').value;setVehicle(state,vehicle);mission=vehicle==='air'?$('mission').value:'free';if(vehicle!=='air')$('mission').value='free';if(vehicle==='water'){setSceneSource('sim');world?.setHabitat(selectedPlace?.waterProfile==='lake'?'lake':'sea');notice(t('simUnderwater'));}world?.resetCamera();clearInputs();refreshExplorer();updateLabels();world?.draw(state,0,view,mission);hud();};
$('sceneSource').onchange=()=>setSceneSource($('sceneSource').value);$('locateButton').onclick=locate;$('nearbyLocation').onclick=locate;$('findNearby').onclick=findNearby;$('exampleButton').onclick=()=>{setOrigin(DEFAULT_ORIGIN);originKind='example';refreshExplorer();$('locationStatus').textContent=t('locationApprox')};
$('applyMap').onclick=()=>{const lat=Number($('lat').value),lon=Number($('lon').value),alt=Number($('originAltitude').value);if(!$('lat').value.trim()||!$('lon').value.trim()||!validCoordinate(lat,lon)||!Number.isFinite(alt)||alt<-400||alt>9000){$('mapError').hidden=false;return}$('mapError').hidden=true;setOrigin({lat,lon,altitude:alt});$('mapDialog').close();notice(t('coordinateSaved'));};
$('photoButton').onclick=async()=>{if(!world)return;if(sceneSource!=='sim'){notice(t('photoUnavailable'));return}try{const blob=await world.capture(state,view,mission);if(!blob)throw Error('Capture failed');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='AERO-'+vehicle+'-'+Date.now()+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);addPassport();notice(t('photoSaved'));}catch{notice(t('photoUnavailable'))}};
$('weatherRefresh').onclick=async()=>{if(!weatherEndpoint){notice(t('weatherKeyless'));return}$('weatherRefresh').disabled=true;try{activeWeather=await fetchWeather(origin,weatherEndpoint);$('weatherStatus').textContent=(activeWeather.stale?'STALE · '+t('weatherUnavailable')+' · ':'')+activeWeather.temperature.toFixed(1)+' °C · '+activeWeather.windSpeed.toFixed(1)+' m/s · '+activeWeather.cloud+'% · '+activeWeather.time+' · '+activeWeather.attribution;notice(t('weatherHint'));}catch{$('weatherStatus').textContent=t('weatherUnavailable')}finally{$('weatherRefresh').disabled=false}};
geoViews=new GoogleViews($('realView'),()=>{setSceneSource('sim');notice(t('googleFailed'))});refreshExplorer();
async function boot(){try{capabilities=await probeDevice();await setProfile(capabilities.tier);$('preflight').hidden=true;if(!storageGet('aero.tutorial',''))openTutorial();else learned=true;hud();if(config.autoLocate!==false)locate();}catch{$('preflight').hidden=true;$('unsupported').hidden=false;$('unsupported').textContent=t('lowSupport');}}
initializeExplorer();boot();
if(!globalThis.AERO_STANDALONE&&/^https?:$/.test(location.protocol)&&'serviceWorker'in navigator){addEventListener('load',()=>navigator.serviceWorker.register(new URL('sw.js',document.baseURI)).catch(()=>{}));}

// Explorer interface: map, sourced destinations and interaction stay outside the viewport.
function distanceMetres(a,b){const r=Math.PI/180,x=Math.sin((a.lat-b.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((a.lon-b.lon)*r/2)**2;return 12742000*Math.asin(Math.min(1,Math.sqrt(x)))}
function withDistances(items,point){return items.map(p=>({...p,distance:distanceMetres(point,p)})).sort((a,b)=>a.distance-b.distance)}
function nearestLocal(point){const ids=new Set(destinations.map(p=>p.id));return withDistances([...destinations,...placesData.pois.filter(p=>!ids.has(p.id))],point).slice(0,8)}
function photoURL(asset){return globalThis.AERO_PHOTO_ASSETS?.[asset.id]||new URL('assets/photos/'+asset.file,document.baseURI).href}
function photoAsset(id){const asset=photoById.get(id);return asset?{id:asset.id,url:photoURL(asset),is360:asset.is360}:null}
function photoTitle(asset){return asset.title[locale]||destinations.find(p=>p.photoId===asset.id)?.name[locale]||asset.title[locale.startsWith('zh')?'zh-TW':'en']||asset.id}
async function setScenery(id){sceneryId=photoById.has(id)?id:null;const selectedId=sceneryId;refreshExplorer();if(!world)return;
 try{const okay=await world.setScenery?.(photoAsset(sceneryId));if(selectedId&&okay===false&&selectedId===sceneryId)notice(t('sceneryError'));}catch{if(selectedId&&selectedId===sceneryId)notice(t('sceneryError'))}
}
function updateLocationMap(force=false){if(!$('vehicleCoordinates'))return;const position=toGeographic(origin,state);$('vehicleCoordinates').textContent=position.lat.toFixed(6)+', '+position.lon.toFixed(6);const nearest=withDistances(nearbyItems.length?nearbyItems:nearestLocal(position),position)[0];$('currentPlace').textContent=nearest&&nearest.distance<20000?t('nearbyPlaces')+' · '+placeText(nearest,'name')+' · '+(nearest.distance/1000).toFixed(1)+' km':selectedPlace?placeText(selectedPlace,'name'):'';$('externalMap').href=googleMapURL(position,locale);if(mapTracker&&($('mapFollow').checked||force))mapTracker.update(position,locale,{force});}
function link(href,label){const a=document.createElement('a');a.href=href;a.textContent=label;a.target='_blank';a.rel='noopener noreferrer';return a}
function photoCredit(asset){const credit=document.createElement('div');credit.className='photo-credit';credit.append(document.createTextNode(asset.author+' · '),link(asset.licenseUrl,asset.license),document.createTextNode(' · '),link(asset.sourcePage,t('publicPhoto')),document.createElement('br'),document.createTextNode('WebP · '+asset.dimensions.join(' × ')));return credit}
function renderDestinations(){const list=$('destinationList');if(!list)return;list.replaceChildren();for(const place of destinations){const asset=photoById.get(place.photoId),card=document.createElement('article');card.className='destination-card'+(selectedPlace?.id===place.id?' selected':'');
 if(asset){const img=document.createElement('img');img.src=photoURL(asset);img.alt=photoTitle(asset);img.loading='lazy';img.decoding='async';img.width=asset.dimensions[0];img.height=asset.dimensions[1];card.append(img)}
 const body=document.createElement('div');body.className='card-body';const title=document.createElement('h3');title.textContent=placeText(place,'name');const description=document.createElement('p');description.textContent=placeText(place,'description');const button=document.createElement('button');button.textContent=t(asset?.is360?'panoramaScene':'goHere');button.onclick=()=>selectPlace(place);body.append(title,description,button);if(asset)body.append(photoCredit(asset));card.append(body);list.append(card);
}}
function renderPhotoGallery(){const list=$('photoGallery');if(!list)return;list.replaceChildren();const assets=(selectedPlace?.photoIds||[selectedPlace?.photoId]).map(id=>photoById.get(id)).filter(Boolean);$('photoSection').hidden=!assets.length;$('photoDisclosure').textContent=t(photoById.get(sceneryId)?.is360?'panoramaHint':'photoDepthHint');
 for(const asset of assets){const card=document.createElement('article');card.className='photo-card';const img=document.createElement('img');img.src=photoURL(asset);img.alt=photoTitle(asset);img.loading='lazy';img.decoding='async';img.width=asset.dimensions[0];img.height=asset.dimensions[1];if(asset.category==='artifact')img.className='artwork';const body=document.createElement('div');body.className='card-body';const title=document.createElement('h3');title.textContent=photoTitle(asset);const date=document.createElement('p');date.textContent=asset.dateTaken||'';body.append(title,date,photoCredit(asset));
 if(asset.category!=='artifact'){const button=document.createElement('button');button.textContent=t('viewPhoto');button.onclick=()=>{setRunning(false);setScenery(asset.id);$('photoDisclosure').textContent=t(asset.is360?'panoramaHint':'photoDepthHint');$('flight').scrollIntoView({behavior:'smooth'})};body.append(button)}else body.append(link(photoURL(asset),t('viewArtwork')));
 card.append(img,body);list.append(card);
}}
function normalizedQuery(value){return String(value).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim()}
function localMatches(query){const q=normalizedQuery(query),noise=/^(?:請|想要|我要|我想|可以|帶我|飞去|飛去|前往|去|到|travel to |fly to |go to |visit )+|(?:逛逛|看看|看展覽|看展览|吧|嗎|吗|\?|？)+$/g;const clean=q.replace(noise,'').trim();return destinations.filter(p=>[...Object.values(p.name),...(p.aliases||[])].some(value=>{const v=normalizedQuery(value);return v.includes(clean)||clean.includes(v)})).slice(0,6)}
async function searchDestinations(query){query=String(query||'').trim();if(!query)return;searchController?.abort();searchController=new AbortController();const signal=searchController.signal;$('searchStatus').textContent=t('searching');$('searchResults').replaceChildren();
 const coordinate=parseCoordinate(query);if(coordinate){setOrigin(coordinate);$('searchStatus').textContent=t('coordinateSaved');return}
 let results=localMatches(query);try{if(!results.length)results=await searchWikiDestinations(query,locale,signal);if(signal.aborted)return;renderSearchResults(results);$('searchStatus').textContent=results.length?t('destinationLibrary'):t('searchNoResults');if(results.length===1)selectPlace(results[0]);}
 catch{if(!signal.aborted)$('searchStatus').textContent=t('searchNoResults')}
}
function renderSearchResults(results){$('searchResults').replaceChildren();for(const place of results){const button=document.createElement('button'),name=document.createElement('strong'),coords=document.createElement('small');name.textContent=placeText(place,'name');coords.textContent=place.lat.toFixed(5)+', '+place.lon.toFixed(5);button.append(name,coords);button.onclick=()=>selectPlace(place);$('searchResults').append(button)}}
function guidePlace(){return selectedPlace||nearestLocal(toGeographic(origin,state))[0]}
function showGuide(topic){const place=guidePlace(),answer=$('guideAnswer'),links=$('guideLinks');links.replaceChildren();if(!place){answer.textContent=t('guideIntro');return}
 if(topic==='food'){answer.textContent=t('foodMap')+' · '+placeText(place,'name');const url=new URL('https://www.google.com/maps/search/');url.search=new URLSearchParams({api:'1',query:'restaurants near '+place.lat+','+place.lon});links.append(link(url.href,t('foodMap')));return}
 if(topic==='nearby'){const entries=withDistances(nearbyItems.length?nearbyItems:nearestLocal(place),place).filter(p=>p.id!==place.id).slice(0,4);answer.textContent=t('nearbyPlaces')+' · '+placeText(place,'name')+'\n'+entries.map(p=>placeText(p,'name')+' · '+(p.distance/1000).toFixed(1)+' km').join('\n');for(const entry of entries){const b=document.createElement('button');b.textContent=placeText(entry,'name');b.onclick=()=>selectPlace(entry);links.append(b)}return}
 answer.textContent=placeText(place,'name')+'\n\n'+placeText(place,'description');for(const href of place.sourceUrls||[])links.append(link(href,t('guideSource')));if(place.wiki)links.append(link('https://creativecommons.org/licenses/by-sa/4.0/',t('wikiAttribution')));
}
function askGuide(query){const q=normalizedQuery(query);let topic=null;for(const [name,patterns] of Object.entries({history:['history','歷史','历史','故事'],highlights:['highlights','特色','特殊'],nearby:['nearby','附近','周邊','周边'],food:['food','美食','餐廳','餐厅']}))if(patterns.some(word=>q.includes(word))||q.includes(normalizedQuery(t(name==='nearby'?'nearbyPlaces':name))))topic=name;
 if(topic)showGuide(topic);else{searchDestinations(query);$('guideAnswer').textContent=t('searching');$('travelSection').scrollIntoView({behavior:'smooth'})}}
function renderPassport(){if(!$('passportList'))return;$('passportStatus').textContent=passport.length?String(passport.length):t('passportEmpty');$('passportList').replaceChildren();for(const stamp of passport){const place=destinations.find(p=>p.id===stamp.id);const tag=document.createElement('span');tag.className='passport-stamp';tag.textContent='✦ '+(place?placeText(place,'name'):stamp.name);$('passportList').append(tag)}}
function addPassport(){const place=selectedPlace;if(!place||passport.some(p=>p.id===place.id))return;passport.push({id:place.id,name:placeText(place,'name'),at:Date.now()});passport=passport.slice(-100);save('aero.passport',JSON.stringify(passport));renderPassport();}
function dropBeacon(){if(!world)return;const forward={x:Math.sin(state.yaw),z:-Math.cos(state.yaw)};beacons.push({id:++beaconSerial,x:state.x+forward.x*1.4,z:state.z+forward.z*1.4,y:state.y-.15,vx:state.vx+forward.x*2,vz:state.vz+forward.z*2,vy:vehicle==='water'?0:1,life:20,vehicle});if(beacons.length>8)beacons.shift();state.beacons=beacons;$('beaconCount').textContent=beacons.length;world.draw(state,0,view,mission);notice(t('dropReady'))}
function updateBeacons(dt){for(const b of beacons){b.life-=dt;if(b.vehicle==='water'){b.vy=Math.min(.5,b.vy+dt*.4);b.y=Math.min(-.3,b.y+b.vy*dt)}else if(b.y>.15){b.vy-=9.8*dt;b.y=Math.max(.15,b.y+b.vy*dt)}b.x+=b.vx*dt;b.z+=b.vz*dt;const drag=Math.exp(-dt*(b.y<=.15?6:1));b.vx*=drag;b.vz*=drag}beacons=beacons.filter(b=>b.life>0);state.beacons=beacons}
function initializeExplorer(){
 if(innerWidth>900)$('settings').open=true;
 if(globalThis.AERO_STANDALONE){const creditsLink=document.querySelector('a[data-i18n="photoCredit"]');creditsLink.onclick=e=>{e.preventDefault();setRunning(false);let dialog=$('photoCreditsDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='photoCreditsDialog';const close=document.createElement('button');close.textContent=t('close');close.onclick=()=>{if(dialog.close)dialog.close();else dialog.removeAttribute('open')};dialog.append(close);for(const asset of photoManifest.assets){const heading=document.createElement('h3');heading.textContent=photoTitle(asset);const note=document.createElement('p');note.textContent=asset.changes;dialog.append(heading,photoCredit(asset),note)}document.body.append(dialog);}if(dialog.showModal)dialog.showModal();else{dialog.setAttribute('open','');dialog.classList.add('fallback-dialog')}};}

 mapTracker=new LiveLocationMap($('locationMap'),{key:config.googleEmbedKey||'',interval:15000,distance:50});updateLocationMap(true);
 $('mapRecenter').onclick=()=>updateLocationMap(true);$('mapFollow').onchange=()=>{if($('mapFollow').checked)updateLocationMap(true)};
 $('destinationForm').onsubmit=e=>{e.preventDefault();setRunning(false);searchDestinations($('destinationQuery').value)};
 $('guideForm').onsubmit=e=>{e.preventDefault();setRunning(false);askGuide($('guideQuery').value)};
 document.querySelectorAll('[data-topic]').forEach(button=>button.onclick=()=>showGuide(button.dataset.topic));
 $('dropButton').onclick=dropBeacon;$('whereButton').onclick=()=>{setRunning(false);updateLocationMap(true);$('mapCard').scrollIntoView({behavior:'smooth',block:'center'})};
 $('storyButton').onclick=()=>{setRunning(false);showGuide('history');$('guideCard').scrollIntoView({behavior:'smooth',block:'center'})};
 renderDestinations();renderPassport();
}
