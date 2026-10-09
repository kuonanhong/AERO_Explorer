import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const moduleURL=process.env.AERO_PHOTO_MOTION_MODULE?pathToFileURL(process.env.AERO_PHOTO_MOTION_MODULE):new URL('../dist/photo-motion.js',import.meta.url);
const {createPhotoMotion,photoSample,panoramaSample,photoDepth,fitPhotoFrame,PHOTO_MOTION_LIMITS}=await import(moduleURL);
const start={x:0,y:.6,z:15,yaw:0,pitch:0},motion=createPhotoMotion();
const baseline={...motion.update(start)},forward={...motion.update({...start,z:9})},backward={...motion.update({...start,z:21})},right={...motion.update({...start,x:6})},returned={...motion.update(start)};
assert.deepEqual(returned,baseline,'Return to origin restores identical reprojection');
for(const rawSample of[photoSample,panoramaSample]){
 const sample=rawSample===photoSample?(u,v,m,a,im)=>photoSample(u,v,fitPhotoFrame({...m},a,im),a,im):(u,v,m,a)=>panoramaSample(u,v,m,a);
 const near=rawSample===photoSample?[.78,.20]:[.78,.24],far=[.78,.80],b=sample(...near,baseline,1.5,1.5),f=sample(...near,forward,1.5,1.5),r=sample(...near,right,1.5,1.5),rev=sample(...near,backward,1.5,1.5);
 // For inverse sampling: smaller source U causes a source feature to move outward/right.
 assert(f.u<b.u,'Advance increases apparent scale');assert(rev.u>b.u,'Reverse decreases apparent scale');assert(r.u>b.u,'Strafe right moves source samples right and image features left');
 if(rawSample===photoSample){const bf=sample(...far,baseline,1.5,1.5),ff=sample(...far,forward,1.5,1.5);assert(b.u-f.u>bf.u-ff.u,'Near region has stronger parallax than distant region');}
}
assert(photoDepth(.1)<photoDepth(.8));
const edge=motion.update({...start,x:10000,z:-10000,y:1000});assert(edge.limited);assert(Math.abs(edge.forward)<=PHOTO_MOTION_LIMITS.forward&&Math.abs(edge.side)<=PHOTO_MOTION_LIMITS.side&&Math.abs(edge.lift)<=PHOTO_MOTION_LIMITS.lift);
motion.reset();const yaw0={...motion.update(start)},yawFull={...motion.update({...start,yaw:Math.PI*2})};assert(Math.abs(panoramaSample(.3,.4,yaw0,1.5).u-panoramaSample(.3,.4,yawFull,1.5).u)<1e-12,'360 angular view wraps continuously');
console.log('Photo reprojection: coherent forward/back/strafe, stronger near flow, reversible position, finite bounds and full-turn wrapping passed.');

// No edge-pixel stretching: every visible ray samples strictly inside the image.
let frameChecks=0;
for(const view of ['fpv','chase'])for(const aspect of [.5,1.333,2.4])for(const imageAspect of [.66,1.333,2])for(const x of [-12,0,12])for(const dz of [-22,0,22])for(const dy of [-8,0,8])for(const yaw of [-1.2,0,1.2]){
 const m=createPhotoMotion();m.update(start,'fpv');const pose=m.update({...start,x,z:start.z+dz,y:start.y+dy,yaw},view);fitPhotoFrame(pose,aspect,imageAspect);
 for(let row=0;row<=256;row++)for(const u of [0,1]){const uv=photoSample(u,row/256,pose,aspect,imageAspect);assert(uv.u>.003&&uv.u<.997&&uv.v>.003&&uv.v<.997,'Photo footprint stays within real image pixels: '+JSON.stringify({view,aspect,imageAspect,x,dz,dy,yaw,uv}));frameChecks++;}
}
console.log('Valid photo framing: '+frameChecks+' visible UV samples stay inside the source photograph (both cameras, varied aspects and movements).');
