import DATA from './assets/places.json';
export const DEFAULT_ORIGIN={lat:22.64954,lon:120.35363,altitude:20};
export function validCoordinate(lat,lon){return Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=-85&&lat<=85&&lon>=-180&&lon<=180}
export function haversine(a,b){const r=Math.PI/180,dlat=(b.lat-a.lat)*r,dlon=(b.lon-a.lon)*r,k=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(k),Math.sqrt(Math.max(0,1-k)))}
export function toGeographic(origin,state){return {lat:Math.max(-85,Math.min(85,origin.lat-(state.z-15)/111320)),lon:((origin.lon+state.x/(111320*Math.max(.087,Math.cos(origin.lat*Math.PI/180)))+540)%360)-180,altitude:(origin.altitude||0)+state.y};}
export function closestPlaces(origin,limit=8){return DATA.pois.map(p=>({...p,distance:haversine(origin,p)})).sort((a,b)=>a.distance-b.distance).slice(0,limit)}
export const placesData=DATA;
export function languageCode(locale){return {'zh-Hant':'zh-TW','zh-Hans':'zh-CN',fil:'fil'}[locale]||locale;}
let loader=null,loadedKey='',authReject=null;
export function loadGoogle(key,locale){
 if(!key)throw Error('Google Maps API Key required');
 if(globalThis.google?.maps?.importLibrary){if(loadedKey&&loadedKey!==key)throw Error('Reload the page before changing the loaded Google API key.');return Promise.resolve()}
 if(loader)return loader;loadedKey=key;
 loader=new Promise((resolve,reject)=>{authReject=reject;let completed=false;const timer=setTimeout(()=>{if(!completed){completed=true;loader=null;reject(Error('Google Maps load timed out'))}},20000);globalThis.aeroGoogleReady=()=>{if(completed)return;completed=true;clearTimeout(timer);resolve()};globalThis.gm_authFailure=()=>{clearTimeout(timer);loader=null;authReject?.(Error('Google Maps authorization failed'))};const script=document.createElement('script');script.src='https://maps.googleapis.com/maps/api/js?'+new URLSearchParams({key,loading:'async',callback:'aeroGoogleReady',v:'weekly',language:languageCode(locale),region:'TW',auth_referrer_policy:'origin'});script.onerror=()=>{clearTimeout(timer);loader=null;reject(Error('Google Maps network error'))};document.head.append(script)});return loader;
}
export async function searchGoogleNearby(origin,key,locale){
 await loadGoogle(key,locale);const {Place,SearchNearbyRankPreference}=await google.maps.importLibrary('places');
 const {places}=await Place.searchNearby({fields:['id','displayName','location','formattedAddress','googleMapsURI','primaryType','attributions'],locationRestriction:{center:{lat:origin.lat,lng:origin.lon},radius:6000},includedTypes:['tourist_attraction','museum','park','buddhist_temple','hindu_temple','cultural_landmark','historical_landmark','scenic_spot','lake','hospital'],maxResultCount:8,rankPreference:SearchNearbyRankPreference.POPULARITY,language:languageCode(locale)});
 return places.filter(p=>p.location).map(p=>({id:p.id,name:{[locale]:p.displayName,en:p.displayName},lat:p.location.lat(),lon:p.location.lng(),category:p.primaryType,description:{[locale]:p.formattedAddress||'',en:p.formattedAddress||''},sourceUrls:[p.googleMapsURI||'https://maps.google.com'],waterProfile:p.primaryType==='lake'?'lake':'land',live:true,attributions:p.attributions||[],distance:haversine(origin,{lat:p.location.lat(),lon:p.location.lng()})}));
}
export class GoogleViews{
 constructor(container,onError){this.container=container;this.onError=onError;this.map=null;this.street=null;this.streetService=null;this.mode='sim';this.lastUpdate=0;this.lastStreetPosition=null;this.marker=null;this.openSequence=0;}
 async open(mode,key,locale,position){const sequence=++this.openSequence;await loadGoogle(key,locale);if(sequence!==this.openSequence)return false;
  if(mode==='google'){
   if(!this.map){const {Map3DElement}=await google.maps.importLibrary('maps3d');if(sequence!==this.openSequence)return false;this.map=new Map3DElement({center:{lat:position.lat,lng:position.lon,altitude:position.altitude},range:220,tilt:65,heading:0,mode:'satellite',language:languageCode(locale),region:'TW'});this.map.style.width='100%';this.map.style.height='100%';this.map.addEventListener('gmp-error',()=>this.onError(Error('Google 3D map could not initialize')));}
   this.map.language=languageCode(locale);this.container.replaceChildren(this.map);
  }else{
   const {StreetViewService,StreetViewPanorama}=await google.maps.importLibrary('streetView');if(sequence!==this.openSequence)return false;
   if(!this.street){this.streetElement=document.createElement('div');this.streetElement.style.cssText='width:100%;height:100%';this.street=new StreetViewPanorama(this.streetElement,{addressControl:true,fullscreenControl:false,motionTracking:false});this.streetService=new StreetViewService();this.street.addListener('status_changed',()=>{if(this.street.getStatus()==='ZERO_RESULTS')this.onError(Error('No Street View coverage at this location'))});}
   this.container.replaceChildren(this.streetElement);this.street.setVisible(true);await this.moveStreet(position,true);
  }
  if(sequence!==this.openSequence)return false;this.mode=mode;this.container.hidden=false;return true;
 }
 async moveStreet(position,force=false){if(!this.streetService||this.streetBusy)return;if(!force&&this.lastStreetPosition&&haversine(this.lastStreetPosition,position)<35)return;this.streetBusy=true;try{const {data}=await this.streetService.getPanorama({location:{lat:position.lat,lng:position.lon},radius:100});this.street.setPano(data.location.pano);this.lastStreetPosition={...position};}finally{this.streetBusy=false}}
 update(state,origin,view,locale,now){if(this.mode==='sim'||now-this.lastUpdate<100)return;this.lastUpdate=now;const position=toGeographic(origin,state),heading=((state.yaw*180/Math.PI)%360+360)%360;if(this.mode==='google'&&this.map){this.map.language=languageCode(locale);if(view==='fpv'){this.map.cameraPosition={lat:position.lat,lng:position.lon,altitude:Math.max(origin.altitude+1.8,position.altitude+1)};this.map.heading=heading;this.map.tilt=88+state.pitch*18;this.map.roll=-state.roll*15;this.map.fov=62;}else{this.map.center={lat:position.lat,lng:position.lon,altitude:Math.max(origin.altitude,position.altitude)};this.map.range=state.vehicle==='land'?35:90;this.map.heading=heading;this.map.tilt=68;}}
  else if(this.mode==='street'&&this.street){this.street.setPov({heading,pitch:Math.max(-30,Math.min(30,-state.pitch*25))});if(now-(this.lastStreetCheck||0)>3000){this.lastStreetCheck=now;this.moveStreet(position).catch(()=>this.onError(Error('Street View coverage is unavailable')))}}
 }
 hide(){this.mode='sim';this.openSequence++;this.container.hidden=true;if(this.street)this.street.setVisible(false)}
}
