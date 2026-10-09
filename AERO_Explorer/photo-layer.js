import {createPhotoMotion,fitPhotoFrame} from './photo-motion.js';
// A one-triangle photograph reprojection. No image-derived geometry is asserted.
export function createPhotoLayer(T,scene,profile={}){
 const motion=createPhotoMotion(),waterMotion=createPhotoMotion(),geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
 geometry.setAttribute('uv',new T.Float32BufferAttribute([0,0,2,0,0,2],2));
 const uniforms={image:{value:null},aspect:{value:1},imageAspect:{value:1},offset:{value:new T.Vector3()},frame:{value:new T.Vector3(1,0,0)},yaw:{value:0},anchorYaw:{value:0},pitch:{value:0},panorama:{value:0}};
 const material=new T.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,toneMapped:false,fog:false,
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,.999999,1.0);}',
  fragmentShader:`uniform sampler2D image;uniform float aspect,imageAspect,yaw,anchorYaw,pitch,panorama;uniform vec3 offset,frame;varying vec2 vUv;
   const float PI=3.141592653589793;void main(){
    float t=clamp((vUv.y-.08)/.74,0.0,1.0);float depth=38.0+282.0*t*t*(3.0-2.0*t);float fy=.6745085168;
    vec2 uv;
    if(panorama>.5){
     vec3 ray=vec3((2.0*vUv.x-1.0)*fy*aspect,(2.0*vUv.y-1.0)*fy,1.0);
     float cp=cos(pitch),sp=sin(pitch),cy=cos(yaw),sy=sin(yaw);
     ray=vec3(ray.x,ray.y*cp+ray.z*sp,ray.z*cp-ray.y*sp);ray=normalize(vec3(ray.x*cy+ray.z*sy,ray.y,ray.z*cy-ray.x*sy));
     float dotCR=dot(offset,ray);float hit=max(1.0,-dotCR+sqrt(max(1.0,dotCR*dotCR+depth*depth-dot(offset,offset))));
     vec3 point=offset+hit*ray;uv=vec2(fract(.5+(atan(point.x,point.z)+anchorYaw)/(2.0*PI)),.5+asin(clamp(point.y/length(point),-1.0,1.0))/PI);
    }else{
     float k=1.0-offset.z/depth;float limitedYaw=.42*(2.0/(1.0+exp(-2.0*yaw/.42))-1.0);float limitedPitch=.30*(2.0/(1.0+exp(-2.0*pitch/.30))-1.0);
     vec2 crop=.88*vec2(min(1.0,aspect/imageAspect),min(1.0,imageAspect/aspect));
     uv=.5+((vUv-.5)*k+vec2(offset.x/depth+tan(limitedYaw),offset.y/depth+tan(limitedPitch))/(2.0*fy*vec2(aspect,1.0)))*crop;
     uv=.5+(uv-.5)*frame.x+frame.yz;
    }
    gl_FragColor=texture2D(image,clamp(uv,vec2(.0001),vec2(.9999)));
    #include <colorspace_fragment>
   }`});
 const screen=new T.Mesh(geometry,material);screen.frustumCulled=false;screen.renderOrder=-1000;screen.visible=false;scene.add(screen);
 // Sparse, explicitly simulated reference crosses provide continuous world-space flow
 // after reaching the safe photo reprojection envelope. They are not photographed objects.
 const points=[],extent=profile.effects?12:8,spacing=6;
 for(let x=-extent;x<=extent;x++)for(let z=-extent;z<=extent;z++)points.push(x*spacing-.24,0,z*spacing,x*spacing+.24,0,z*spacing,x*spacing,0,z*spacing-.24,x*spacing,0,z*spacing+.24);
 const guideGeometry=new T.BufferGeometry();guideGeometry.setAttribute('position',new T.Float32BufferAttribute(points,3));
 const guideMaterial=new T.LineBasicMaterial({color:0xb8edf2,transparent:true,opacity:.17,depthWrite:false});
 const guide=new T.LineSegments(guideGeometry,guideMaterial);guide.visible=false;guide.frustumCulled=false;scene.add(guide);
 let texture=null,is360=false,disposed=false,activeMotion=motion,activeMethod=null,lastWater=null;
 return{setTexture(value,panorama=false){texture=value;is360=panorama;motion.reset();if(!value&&!lastWater){uniforms.image.value=null;screen.visible=guide.visible=false}},
  update(s,view,aspect,waterTexture=null){const water=s.vehicle==='water',activeTexture=water?waterTexture:texture;screen.visible=!!activeTexture;guide.visible=!!activeTexture&&!water;
   if(lastWater!==water){(water?waterMotion:motion).reset();lastWater=water}activeMotion=water?waterMotion:motion;
   if(!activeTexture){activeMethod=null;uniforms.image.value=null;return}
   activeMethod=water?'underwater-2.5d':is360?'panorama-reprojection':'photo-2.5d';
   uniforms.image.value=activeTexture;uniforms.panorama.value=!water&&is360?1:0;uniforms.imageAspect.value=activeTexture.image.width/activeTexture.image.height;
   const m=activeMotion.update(s,view);if(water||!is360)fitPhotoFrame(m,aspect,uniforms.imageAspect.value);
   uniforms.frame.value.set(m.frameScale,m.frameX,m.frameY);uniforms.aspect.value=aspect;uniforms.offset.value.set(m.side,m.lift,m.forward);uniforms.yaw.value=m.yaw;uniforms.anchorYaw.value=m.anchorYaw;uniforms.pitch.value=m.pitch;
   guide.position.set(Math.floor(s.x/spacing)*spacing,m.groundY+.018,Math.floor(s.z/spacing)*spacing);
  },get stats(){return activeMethod?{method:activeMethod,limited:activeMotion.current.limited,distance:activeMotion.current.distance}:null},
  dispose(){if(disposed)return;disposed=true;scene.remove(screen,guide);geometry.dispose();material.dispose();guideGeometry.dispose();guideMaterial.dispose();texture=null;uniforms.image.value=null;}
 };
}
