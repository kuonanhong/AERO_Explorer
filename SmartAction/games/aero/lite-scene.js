// No WebGL or Three.js dependency: deterministic projection for modest devices.
import {RINGS} from './physics.js';
import {drawLiteVehicle} from './lite-vehicle.js';
import {createPhotoMotion,fitPhotoFrame,photoSample,panoramaSample} from './photo-motion.js';
export function createLiteWorld(canvas,{waterProfile='sea'}={}){
 const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('Canvas2D is unavailable');
 let width=640,height=480,kind='coast',habitat=waterProfile,reef=null,disposed=false,scenery=null,sceneryId=null,scenery360=false,sceneryRequest=0,sceneryState='none';
 const photoMotion=createPhotoMotion(),waterMotion=createPhotoMotion();let activeMotion=photoMotion,activeMethod=null,lastWater=null;const uvA={u:0,v:0},uvB={u:0,v:0},uvC={u:0,v:0},uvD={u:0,v:0};
 function setScenery(asset){photoMotion.reset();const request=++sceneryRequest;scenery=null;sceneryId=null;scenery360=false;
  if(disposed||!asset?.url){sceneryState='none';return Promise.resolve(false)}sceneryState='loading';
  return new Promise(resolve=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>{img.onload=img.onerror=null;if(disposed||request!==sceneryRequest){resolve(false);return}scenery=img;sceneryId=asset.id||null;scenery360=!!asset.is360;sceneryState='ready';resolve(true)};img.onerror=()=>{img.onload=img.onerror=null;if(!disposed&&request===sceneryRequest)sceneryState='error';resolve(false)};img.src=asset.url});
 }
 function drawScenery(s,view,image=scenery,panorama=scenery360){
  if(!image?.naturalWidth){activeMethod=null;return}
  const underwater=s.vehicle==='water';if(lastWater!==underwater){(underwater?waterMotion:photoMotion).reset();lastWater=underwater}
  activeMotion=underwater?waterMotion:photoMotion;const m=activeMotion.update(s,view),iw=image.naturalWidth,ih=image.naturalHeight,aspect=width/height;if(!panorama)fitPhotoFrame(m,aspect,iw/ih);
  activeMethod=underwater?'underwater-2.5d':panorama?'panorama-reprojection':'photo-2.5d';
  const sample=panorama?(u,v,out)=>panoramaSample(u,v,m,aspect,out):(u,v,out)=>photoSample(u,v,m,aspect,iw/ih,out);
  const rows=panorama?28:32;
  for(let row=0;row<rows;row++){
   const y0=Math.floor(row*height/rows),y1=Math.ceil((row+1)*height/rows),v0=1-y0/height,v1=1-y1/height,vm=(v0+v1)/2;
   sample(0,vm,uvA);sample(1,vm,uvB);sample(.5,v0,uvC);sample(.5,v1,uvD);
   const sy=Math.max(0,Math.min(ih-1,(1-Math.max(uvC.v,uvD.v))*ih)),sh=Math.max(1,Math.min(ih-sy,Math.abs(uvC.v-uvD.v)*ih));
   if(panorama){
    const sx=((uvA.u%1+1)%1)*iw,sw=Math.max(1,((uvB.u-uvA.u+1)%1)*iw),first=Math.min(sw,iw-sx),dw=width*first/sw;
    ctx.drawImage(image,sx,sy,first,sh,0,y0,dw,y1-y0);
    if(first<sw)ctx.drawImage(image,0,sy,sw-first,sh,dw,y0,width-dw,y1-y0);
   }else{
    const sw=Math.max(1,Math.min(iw,(uvB.u-uvA.u)*iw)),sx=Math.max(0,Math.min(iw-sw,uvA.u*iw));
    ctx.drawImage(image,sx,sy,sw,sh,0,y0,width,y1-y0);
   }
  }
 }
 function drawPhotoReference(s,view){
  if(!scenery||s.vehicle==='water')return;const baseX=Math.floor(s.x/6)*6,baseZ=Math.floor(s.z/6)*6,ground=photoMotion.current.groundY;
  ctx.strokeStyle='rgba(184,237,242,.17)';ctx.lineWidth=1;ctx.beginPath();
  for(let x=-7;x<=7;x++)for(let z=-9;z<=9;z++){const p=project(baseX+x*6,ground,baseZ+z*6,s,view);if(!p||p.depth>100||p.x<0||p.x>width||p.y<0||p.y>height)continue;const r=Math.max(.3,Math.min(12,p.scale*.22));ctx.moveTo(p.x-r,p.y);ctx.lineTo(p.x+r,p.y);ctx.moveTo(p.x,p.y-r*.3);ctx.lineTo(p.x,p.y+r*.3)}ctx.stroke();
 }
 const noObstacles=[],obstacles=[{x:-29,z:22,rx:6,rz:8,height:4},{x:-48,z:28,rx:5,rz:5,height:6},{x:-38,z:-22,rx:4,rz:6,height:3}];
 function resize(){const r=canvas.getBoundingClientRect();width=Math.max(1,Math.round(r.width));height=Math.max(1,Math.round(r.height));if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;}
 function project(x,y,z,s,view){const dx=x-s.x,dz=z-s.z,sn=Math.sin(s.yaw),cs=Math.cos(s.yaw);const camY=s.y+(view==='fpv'?.2:4),depth=-(dz*cs-dx*sn)+(view==='fpv'?1:11);if(depth<.5)return null;const scale=width*(view==='fpv'?.66:.72)/depth;return{x:width/2+(dx*cs+dz*sn)*scale,y:height*.49-(y-camY)*scale,scale,depth};}
 function draw(s,dt,view='chase',mission='course'){
  const water=s.vehicle==='water',horizon=height*.49;
  const gradient=ctx.createLinearGradient(0,0,0,height);gradient.addColorStop(0,water?'#063d59':kind==='dusk'?'#bf9d9a':'#8ccadd');gradient.addColorStop(1,water?'#032d3a':'#dde8d2');ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
  activeMethod=null;if(!water)drawScenery(s,view);
  if(water&&habitat==='sea'&&reef?.complete&&reef.naturalWidth)drawScenery(s,view,reef,false);
  drawPhotoReference(s,view);
  if(!water&&!scenery){ctx.fillStyle=kind==='alpine'?'#718979':'#779980';ctx.beginPath();ctx.moveTo(0,horizon);for(let x=0;x<=width;x+=width/12)ctx.lineTo(x,horizon-15-Math.sin(x/width*12+s.yaw)*30);ctx.lineTo(width,horizon+35);ctx.lineTo(0,horizon+35);ctx.fill();ctx.fillStyle='#8aab85';ctx.fillRect(0,horizon+35,width,height);ctx.strokeStyle='#dce7c044';for(let n=1;n<10;n++){const yy=horizon+35+(height-horizon)*Math.pow(n/10,2);ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(width,yy);ctx.stroke();}for(let n=-5;n<=5;n++){ctx.beginPath();ctx.moveTo(width/2+n*8,horizon+35);ctx.lineTo(width/2+n*width*.25,height);ctx.stroke();}}
  const points=[];
  if(water){for(let i=0;i<20;i++){const baseZ=-15-(i%8)*11+Math.sin(s.time*.13+i)*2,fishZ=baseZ+Math.floor((s.z+18-baseZ)/96)*96;const p=project(Math.sin(i*4+s.time*.2)*25,-3-(i%5)*2,fishZ,s,view);if(p)points.push({...p,type:'fish',i});}}
  else if(!scenery){for(let i=0;i<32;i++){const x=(i%8)*30-120,z=Math.floor(i/8)*-50-35;const p=project(x,0,z,s,view);if(p)points.push({...p,type:'tree'});}for(const o of obstacles){const p=project(o.x,o.height/2,o.z,s,view);if(p)points.push({...p,type:'building',o});}if(mission==='course'&&s.vehicle==='air')RINGS.forEach((r,i)=>{const p=project(r.x,r.y,r.z,s,view);if(p)points.push({...p,type:'ring',i})});}
  for(let i=0;i<Math.min(8,s.beacons?.length||0);i++){const b=s.beacons[i];if(!b||b.life<=0||!Number.isFinite(b.x)||!Number.isFinite(b.y)||!Number.isFinite(b.z))continue;const p=project(b.x,b.y,b.z,s,view);if(p)points.push({...p,type:'beacon'});}
  points.sort((a,b)=>b.depth-a.depth);for(const p of points){if(p.x<-300||p.x>width+300||p.y<-300||p.y>height+300)continue;const scale=Math.min(p.scale,100);if(p.type==='tree'){ctx.fillStyle='#426953';ctx.beginPath();ctx.moveTo(p.x,p.y-12*scale);ctx.lineTo(p.x-3*scale,p.y);ctx.lineTo(p.x+3*scale,p.y);ctx.fill();}else if(p.type==='building'){ctx.fillStyle='#c4c3b0';ctx.fillRect(p.x-p.o.rx*scale,p.y-p.o.height/2*scale,p.o.rx*2*scale,p.o.height*scale);}else if(p.type==='ring'){ctx.strokeStyle=p.i===s.ring?'#d6f06d':p.i<s.ring?'#6e9a86':'#f0f8e5';ctx.lineWidth=Math.max(1,scale*.1);ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1,3.3*scale),0,Math.PI*2);ctx.stroke();}else if(p.type==='beacon'){const r=Math.max(3,Math.min(16,scale*.25));ctx.fillStyle='#ff883e';ctx.strokeStyle='#562800';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.x,p.y-r);ctx.lineTo(p.x+r,p.y);ctx.lineTo(p.x,p.y+r);ctx.lineTo(p.x-r,p.y);ctx.closePath();ctx.fill();ctx.stroke();}else{ctx.fillStyle=habitat==='lake'?'#afbf9c':'#efce82';ctx.beginPath();ctx.ellipse(p.x,p.y,Math.max(2,scale*.45),Math.max(1,scale*.16),0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(p.x-scale*.35,p.y);ctx.lineTo(p.x-scale*.65,p.y-scale*.25);ctx.lineTo(p.x-scale*.65,p.y+scale*.25);ctx.fill();}}
  if(view!=='fpv')drawLiteVehicle(ctx,s,width*.5,height*.69,Math.min(1.3,Math.max(.85,width/700)));
 }
 resize();return{draw,resize,setScenery,build(v){kind=v},resetCamera(){},setHabitat(v){habitat=v;if(v==='sea'&&!reef){reef=new Image();reef.src=globalThis.AERO_REEF_ASSET||new URL('assets/reef-training.webp',document.baseURI).href}},capture(s,view,mission){draw(s,0,view,mission);return new Promise(resolve=>canvas.toBlob(resolve,'image/png'))},dispose(){if(disposed)return;disposed=true;++sceneryRequest;scenery=null;reef=null;},get obstacles(){return scenery?noObstacles:obstacles},get stats(){return{calls:0,triangles:0,renderer:'Canvas2D',photoMotion:activeMethod?{method:activeMethod,limited:activeMotion.current.limited,distance:activeMotion.current.distance}:null,scenery:sceneryState,sceneryId,sceneryType:scenery?(scenery360?'panorama-strip':'photo'):null}}};
}
