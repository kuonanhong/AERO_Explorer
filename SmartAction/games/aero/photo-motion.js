// Bounded single-image reprojection; the depth profile is a visual prior, not measured terrain.
export const PHOTO_MOTION_LIMITS = Object.freeze({forward:22,side:12,lift:8});
const bounded=(v,r)=>r*Math.tanh(v/r);
export function photoDepth(v){const u=Math.max(0,Math.min(1,(v-.08)/.74)),t=u*u*(3-2*u);return 38+282*t;}
export function createPhotoMotion(){
 let anchor=null;
 const motion={forward:0,side:0,lift:0,yaw:0,anchorYaw:0,pitch:0,limited:false,distance:0,groundY:0,frameScale:1,frameX:0,frameY:0};
 return{reset(){anchor=null},update(s,view='fpv'){
  if(!anchor)anchor={x:s.x,y:s.y,z:s.z,yaw:s.yaw||0};
  const yaw=(s.yaw||0)-anchor.yaw,dx=s.x-anchor.x,dz=s.z-anchor.z,sn=Math.sin(anchor.yaw),cs=Math.cos(anchor.yaw),chase=view!=='fpv';
  const rawForward=dx*sn-dz*cs-(chase?10.7*Math.cos(yaw):0),rawSide=dx*cs+dz*sn-(chase?10.7*Math.sin(yaw):0),rawLift=s.y-anchor.y+(chase?4.44:0);
  motion.forward=bounded(rawForward,PHOTO_MOTION_LIMITS.forward);motion.side=bounded(rawSide,PHOTO_MOTION_LIMITS.side);motion.lift=bounded(rawLift,PHOTO_MOTION_LIMITS.lift);
  motion.yaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));motion.anchorYaw=anchor.yaw;motion.pitch=chase?-.312:Math.atan2(.84-(s.pitch||0)*7,34.3);
  motion.limited=Math.abs(rawForward)>PHOTO_MOTION_LIMITS.forward||Math.abs(rawSide)>PHOTO_MOTION_LIMITS.side||Math.abs(rawLift)>PHOTO_MOTION_LIMITS.lift;
  motion.distance=Math.hypot(dx,dz,s.y-anchor.y);motion.groundY=anchor.y-.6;motion.frameScale=1;motion.frameX=0;motion.frameY=0;return motion;
 },get current(){return motion}};
}
// UV sample for a rectilinear photograph (UV v is up). Shared by Canvas and numerical QA.
export function photoSample(u,v,motion,aspect,imageAspect,out={u:0,v:0}){
 const d=photoDepth(v),scale=1-motion.forward/d,fy=Math.tan(34*Math.PI/180),fx=fy*aspect;
 const cx=Math.min(1,aspect/imageAspect)*.88,cy=Math.min(1,imageAspect/aspect)*.88;
 const yaw=.42*Math.tanh(motion.yaw/.42),pitch=.30*Math.tanh(motion.pitch/.30);
 out.u=.5+((u-.5)*scale+(motion.side/d+Math.tan(yaw))/(2*fx))*cx;
 out.v=.5+((v-.5)*scale+(motion.lift/d+Math.tan(pitch))/(2*fy))*cy;
 const fit=motion.frameScale??1;out.u=.5+(out.u-.5)*fit+(motion.frameX||0);out.v=.5+(out.v-.5)*fit+(motion.frameY||0);return out;
}
// Fit the complete reprojection footprint inside the available photograph. This is
// camera framing (one uniform scale/translation), not repeated edge pixels or invented
// scenery. A small safety border covers extrema between the sampled depth rows.
export function fitPhotoFrame(motion,aspect,imageAspect){
 const fy=Math.tan(34*Math.PI/180),fx=fy*aspect,cx=Math.min(1,aspect/imageAspect)*.88,cy=Math.min(1,imageAspect/aspect)*.88;
 const yaw=.42*Math.tanh(motion.yaw/.42),pitch=.30*Math.tanh(motion.pitch/.30),yawShift=Math.tan(yaw),pitchShift=Math.tan(pitch);
 let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity;
 for(let row=0;row<=64;row++){const v=row/64,d=photoDepth(v),k=1-motion.forward/d,center=.5+(motion.side/d+yawShift)/(2*fx)*cx,half=.5*k*cx;
  minU=Math.min(minU,center-half);maxU=Math.max(maxU,center+half);
  const sourceV=.5+((v-.5)*k+(motion.lift/d+pitchShift)/(2*fy))*cy;minV=Math.min(minV,sourceV);maxV=Math.max(maxV,sourceV);
 }
 const guard=.004,margin=.008;minU-=guard;maxU+=guard;minV-=guard;maxV+=guard;
 const scale=Math.min(1,(1-2*margin)/(maxU-minU),(1-2*margin)/(maxV-minV));
 const lowU=.5+(minU-.5)*scale,highU=.5+(maxU-.5)*scale,lowV=.5+(minV-.5)*scale,highV=.5+(maxV-.5)*scale;
 motion.frameScale=scale;motion.frameX=lowU<margin?margin-lowU:highU>1-margin?1-margin-highU:0;
 motion.frameY=lowV<margin?margin-lowV:highV>1-margin?1-margin-highV:0;return motion;
}
// Perspective ray -> bounded translated spherical shell -> equirectangular UV.
// The radius prior varies by latitude, so this is an approximation, not a 3D scan.
export function panoramaSample(u,v,motion,aspect,out={u:0,v:0}){
 const fy=Math.tan(34*Math.PI/180);let x=(2*u-1)*fy*aspect,y=(2*v-1)*fy,z=1;
 const cp=Math.cos(motion.pitch),sp=Math.sin(motion.pitch),ny=y*cp+z*sp;z=z*cp-y*sp; y=ny;
 const cy=Math.cos(motion.yaw),sy=Math.sin(motion.yaw),nx=x*cy+z*sy;z=z*cy-x*sy;x=nx;
 const n=Math.hypot(x,y,z);x/=n;y/=n;z/=n;
 const px=motion.side,py=motion.lift,pz=motion.forward,r=photoDepth(v),dot=px*x+py*y+pz*z,t=Math.max(1,-dot+Math.sqrt(Math.max(1,dot*dot+r*r-px*px-py*py-pz*pz)));
 x=px+x*t;y=py+y*t;z=pz+z*t;
 out.u=((.5+(Math.atan2(x,z)+motion.anchorYaw)/(2*Math.PI))%1+1)%1;
 out.v=.5+Math.asin(Math.max(-1,Math.min(1,y/Math.hypot(x,y,z))))/Math.PI;return out;
}
