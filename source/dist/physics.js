// A deterministic, fixed-step training model. SI units, +Y up, heading 0 points -Z.
export const MODES={beginner:{speed:7,response:3.6,climb:3,yaw:1.15,drag:3.4,wind:0},sport:{speed:15,response:1.6,climb:5,yaw:1.6,drag:1.5,wind:.5},expert:{speed:25,response:3,climb:8,yaw:2,drag:.3,wind:1.6}};
export const RINGS=[{x:0,y:4,z:-9},{x:0,y:7,z:-35},{x:16,y:9,z:-58},{x:37,y:7,z:-72},{x:56,y:5,z:-49},{x:39,y:8,z:-21},{x:15,y:5,z:-2}];
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function createState(vehicle='air'){const y=vehicle==='water'?-2:.6;return {vehicle,x:0,y,z:15,vx:0,vy:0,vz:0,yaw:0,pitch:0,roll:0,throttle:.5,time:0,ring:0,score:0,crashed:false,complete:false,landed:vehicle!=='water',landingTime:0,previous:{x:0,y,z:15}};}
export function setVehicle(s,vehicle){if(!['air','land','water'].includes(vehicle))return;s.vehicle=vehicle;s.vx=0;s.vy=0;s.vz=0;s.pitch=0;s.roll=0;s.crashed=false;s.complete=false;s.y=vehicle==='water'?-2:Math.max(.6,s.y);if(vehicle==='land')s.y=.6;s.landed=vehicle==='land';}
export function step(s,input,dt,mode='beginner',mission='course',obstacles=[],weatherWind=null){
 if(s.crashed||s.complete)return;
 if(s.vehicle&&s.vehicle!=='air'){stepSurface(s,input,dt,mode,obstacles);return;}
 const c=MODES[mode]||MODES.beginner;
 s.previous.x=s.x;s.previous.y=s.y;s.previous.z=s.z;
 s.time+=dt;s.yaw=(s.yaw+input.yaw*c.yaw*dt)%(Math.PI*2);
 const windX=weatherWind?.x??c.wind*Math.sin(s.time*.5),windZ=weatherWind?.z??c.wind*Math.cos(s.time*.5);
 const sn=Math.sin(s.yaw),cs=Math.cos(s.yaw),blend=1-Math.exp(-c.response*dt);
 s.pitch+=(input.forward*(mode==='beginner'?.24:mode==='sport'?.4:.62)-s.pitch)*blend;
 s.roll+=(input.right*(mode==='beginner'?.24:mode==='sport'?.4:.62)-s.roll)*blend;
 if(mode==='expert'){
  s.throttle=clamp(.5+input.lift*.5,0,1);
  const thrust=19.62*s.throttle;
  s.vx+=(thrust*(Math.sin(s.pitch)*sn+Math.sin(s.roll)*cs)-c.drag*(s.vx-windX))*dt;
  s.vz+=(thrust*(-Math.sin(s.pitch)*cs+Math.sin(s.roll)*sn)-c.drag*(s.vz-windZ))*dt;
  s.vy+=(thrust*Math.cos(s.pitch)*Math.cos(s.roll)-9.81-.3*s.vy)*dt;
 }else{
  const norm=Math.max(1,Math.hypot(input.forward,input.right));
  const vx=(input.forward*sn+input.right*cs)*c.speed/norm+windX;
  const vz=(-input.forward*cs+input.right*sn)*c.speed/norm+windZ;
  const a=1-Math.exp(-c.drag*dt);
  s.vx+=(vx-s.vx)*a;
  s.vz+=(vz-s.vz)*a;
  s.vy+=(input.lift*c.climb-s.vy)*(1-Math.exp(-4*dt));
  s.throttle=clamp(.5+input.lift*.18,.1,.9);
 }
 s.vx=clamp(s.vx,-35,35);s.vz=clamp(s.vz,-35,35);s.vy=clamp(s.vy,-18,18);
 s.x+=s.vx*dt;s.y+=s.vy*dt;s.z+=s.vz*dt;
 if(s.y<=.6){
  const impact=-s.vy;
  if(mode!=='beginner'&&impact>4)s.crashed=true;
  s.y=.6;s.vy=0;s.vx*=Math.exp(-8*dt);s.vz*=Math.exp(-8*dt);s.landed=true;
 }else s.landed=false;
 if(s.y>500){s.y=500;s.vy=Math.min(0,s.vy);}
 const bound=mission==='free'?1000:185;
 if(Math.abs(s.x)>bound||Math.abs(s.z)>bound){s.x=clamp(s.x,-bound,bound);s.z=clamp(s.z,-bound,bound);s.vx*=.5;s.vz*=.5;}
 for(const o of obstacles){
  if(Math.abs(s.x-o.x)<o.rx+.45&&Math.abs(s.z-o.z)<o.rz+.45&&s.y<o.height+.4){
   if(mode==='beginner'){s.x=s.previous.x;s.z=s.previous.z;s.vx=0;s.vz=0;}
   else s.crashed=true;
  }
 }
 if(mission==='course'&&s.ring<RINGS.length){
  const r=RINGS[s.ring],prev=s.previous;
  // Swept crossing of the ring plane, preventing tunnelling and drive-by scoring.
  const dz=s.z-prev.z;
  if(Math.abs(dz)>1e-9){const t=(r.z-prev.z)/dz;
   if(t>=0&&t<=1){const x=prev.x+(s.x-prev.x)*t,y=prev.y+(s.y-prev.y)*t;
    if(Math.hypot(x-r.x,y-r.y)<2.85){s.ring++;s.score+=100;}
   }
  }
 }
 if(mission==='course'&&s.ring===RINGS.length&&s.landed&&Math.hypot(s.x,s.z-15)<4&&Math.hypot(s.vx,s.vz)<1){
  s.landingTime+=dt;
  if(s.landingTime>.8){s.complete=true;s.score+=Math.max(100,Math.round(1000-s.time*2));}
 }else s.landingTime=0;
}
function stepSurface(s,input,dt,mode,obstacles){
 const water=s.vehicle==='water',speed=water?(mode==='beginner'?3:5):(mode==='beginner'?5:10),response=water?2.5:5;
 s.previous.x=s.x;s.previous.y=s.y;s.previous.z=s.z;s.time+=dt;s.yaw=(s.yaw+input.yaw*(water?.8:1.3)*dt)%(Math.PI*2);
 const sn=Math.sin(s.yaw),cs=Math.cos(s.yaw),norm=Math.max(1,Math.hypot(input.forward,input.right));
 const tx=(input.forward*sn+input.right*cs)*speed/norm,tz=(-input.forward*cs+input.right*sn)*speed/norm,a=1-Math.exp(-response*dt);
 s.vx+=(tx-s.vx)*a;s.vz+=(tz-s.vz)*a;s.vy=water?s.vy+(input.lift*1.8-s.vy)*a:0;
 s.x+=s.vx*dt;s.z+=s.vz*dt;s.y=water?clamp(s.y+s.vy*dt,-20,-.4):.6;
 if(water&&(s.y===-20||s.y===-.4))s.vy=0;
 s.pitch+=(water?input.forward*.12-s.pitch:-s.pitch)*a;s.roll+=(water?input.right*.15-s.roll:-s.roll)*a;s.throttle=.5;s.landed=!water;
 if(!water)for(const o of obstacles){if(Math.abs(s.x-o.x)<o.rx+.6&&Math.abs(s.z-o.z)<o.rz+.6){s.x=s.previous.x;s.z=s.previous.z;s.vx=0;s.vz=0;}}
 s.x=clamp(s.x,-1000,1000);s.z=clamp(s.z,-1000,1000);
}
