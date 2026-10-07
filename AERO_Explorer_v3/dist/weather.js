export function normalizeWeather(data){
 const c=data?.current||data?.weather||data;
 const valid=v=>typeof v==='number'&&Number.isFinite(v);
 if(!c||!valid(c.wind_speed_10m)||c.wind_speed_10m<0||!valid(c.temperature_2m))throw Error('Invalid weather response');
 const a=data.attribution,label=typeof a==='string'?a:typeof a?.name==='string'?a.name+' · '+(a.license||'CC BY 4.0'):'Open-Meteo · CC BY 4.0';
 return {temperature:c.temperature_2m,windSpeed:c.wind_speed_10m,windDirection:valid(c.wind_direction_10m)?c.wind_direction_10m:0,cloud:valid(c.cloud_cover)?c.cloud_cover:0,time:c.time||data.generatedAt||'',receivedAt:Date.now(),fetchedAt:data.fetchedAt||'',stale:!!data.stale,attribution:label};
}
export async function fetchWeather(origin,endpoint){if(!endpoint)throw Error('Configure a shared weather endpoint first');const u=new URL(endpoint,location.href);if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw Error('Weather endpoint must use HTTPS');u.searchParams.set('lat',(Math.round(origin.lat*100)/100).toFixed(2));u.searchParams.set('lon',(Math.round(origin.lon*100)/100).toFixed(2));const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{const response=await fetch(u,{signal:controller.signal});if(!response.ok)throw Error('Weather request failed: '+response.status);return normalizeWeather(await response.json());}finally{clearTimeout(timer)}}
