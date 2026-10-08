import * as T from './vendor/three.module.js';
import {RINGS} from './physics.js';
import {createEcology} from './ecology.js';
import {createTransformVehicle} from './transform-vehicle.js';
import {createFisheyePass} from './fisheye-pass.js';
export function createWorld(canvas,profile={tier:'balanced',maxDPR:1,treeLimit:72,effects:false}){
 const renderer=new T.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.setPixelRatio(Math.min(devicePixelRatio,profile.maxDPR));
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(62,1,.1,1000);
 const skyColor=new T.Color('#9cc9da');scene.background=skyColor;scene.fog=new T.Fog('#9cc9da',120,550);
 scene.add(new T.HemisphereLight(0xeaf7ff,0x668046,2));const sun=new T.DirectionalLight(0xffedce,2.4);sun.position.set(-100,170,80);scene.add(sun);
 const environment=new T.Group();scene.add(environment);const noObstacles=[];
 const meshes=[],materials=[],geometries=[];let water,ringMeshes=[],obstacles=[];
 const material=(color,extra={})=>{const m=new T.MeshLambertMaterial({color,...extra});materials.push(m);return m;};
 const geo=g=>{geometries.push(g);return g;};
 const mesh=(g,m,x=0,y=0,z=0,sx=1,sy=1,sz=1)=>{const o=new T.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);environment.add(o);meshes.push(o);return o;};
 let seed=53;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 function build(kind='coast'){
  environment.children.forEach(o=>{if(o.isInstancedMesh)o.dispose()});environment.clear();materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());materials.length=0;geometries.length=0;meshes.length=0;ringMeshes=[];obstacles=[];seed=53;
  const dusk=kind==='dusk',alpine=kind==='alpine';
  skyColor.set(dusk?'#e1ae93':alpine?'#a0bdce':'#9cc9da');scene.background=skyColor;scene.fog.color.copy(skyColor);sun.color.set(dusk?'#ffc187':'#ffedce');sun.intensity=dusk?1.7:2.4;
  const plane=geo(new T.PlaneGeometry(2500,2500));const ground=mesh(plane,material(alpine?0x91a47b:dusk?0x9f9e6f:0x9aa978));ground.rotation.x=-Math.PI/2;
  const waterGeo=geo(new T.PlaneGeometry(600,800,1,1));water=mesh(waterGeo,material(dusk?0xb78683:0x6096a5),368,-.08,0);water.rotation.x=-Math.PI/2;
  // Ocean bands are static shared geometry; no displacement or per-pixel water simulation.
  const stripe=geo(new T.PlaneGeometry(500,1.1));const stripeMat=material(0xbcd9d5,{transparent:true,opacity:.25});
  for(let i=0;i<23;i++){const w=mesh(stripe,stripeMat,330,.015,-280+i*26,1,1,1);w.rotation.x=-Math.PI/2;}
  if(alpine){water.position.set(230,-.08,-50);}
  const hillGeo=geo(new T.SphereGeometry(1,12,8)),hillMat=material(alpine?0x6f8475:0x87956e),farMat=material(alpine?0x849c99:0x899d8a);
  for(let i=0;i<20;i++){const angle=i/20*Math.PI*2;const radius=245+random()*80;const x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;if(!alpine&&x>80)continue;mesh(hillGeo,i%2?hillMat:farMat,x,-12,z,45+random()*85,35+random()*(alpine?90:40),60+random()*65);}
  const trunkGeo=geo(new T.CylinderGeometry(.35,.6,7,5)),crownGeo=geo(new T.ConeGeometry(3,12,7));
  const trunkMat=material(0x69614b),treeMat=material(alpine?0x385e55:0x546b49),treeMat2=material(0x6d8257);
  const count=profile.treeLimit,trunks=new T.InstancedMesh(trunkGeo,trunkMat,count),crowns=new T.InstancedMesh(crownGeo,treeMat,count),tops=new T.InstancedMesh(crownGeo,treeMat2,count);
  const matrix=new T.Matrix4();let n=0;
  for(let i=0;i<count;i++){let x=-190+random()*245,z=-190+random()*380;if(Math.abs(x)<65&&z>-95&&z<40){x-=85;}const scale=.6+random()*.9;
   matrix.compose(new T.Vector3(x,3.5*scale,z),new T.Quaternion(),new T.Vector3(scale,scale,scale));trunks.setMatrixAt(n,matrix);
   matrix.compose(new T.Vector3(x,10*scale,z),new T.Quaternion(),new T.Vector3(scale,scale,scale));crowns.setMatrixAt(n,matrix);
   matrix.compose(new T.Vector3(x,13*scale,z),new T.Quaternion(),new T.Vector3(scale*.72,scale*.72,scale*.72));tops.setMatrixAt(n,matrix);n++;
  }environment.add(trunks,crowns,tops);
  const cube=geo(new T.BoxGeometry(1,1,1)),concrete=material(0xc8c6b5),roof=material(0x697b7e);
  for(const b of [{x:-29,z:22,rx:6,rz:8,height:4},{x:-48,z:28,rx:5,rz:5,height:6},{x:-38,z:-22,rx:4,rz:6,height:3}]){mesh(cube,concrete,b.x,b.height/2,b.z,b.rx*2,b.height,b.rz*2);mesh(cube,roof,b.x,b.height+.2,b.z,b.rx*2+1,.4,b.rz*2+1);obstacles.push(b);}
  const pad=mesh(geo(new T.CylinderGeometry(5,5,.18,48)),material(0x344f56),0,.09,15);
  const markMat=material(0xd6f06d);mesh(cube,markMat,-.8,.19,15,.35,.01,2.6);mesh(cube,markMat,.8,.19,15,.35,.01,2.6);mesh(cube,markMat,0,.2,15,1.6,.01,.35);
  const padRing=mesh(geo(new T.TorusGeometry(4.1,.06,5,48)),markMat,0,.2,15);padRing.rotation.x=-Math.PI/2;
  const ringGeo=geo(new T.TorusGeometry(3.3,.15,8,44));
  for(const r of RINGS){const m=material(0xffffff,{emissive:0x456063});const ring=mesh(ringGeo,m,r.x,r.y,r.z);ringMeshes.push(ring);mesh(cube,material(0x819195),r.x,Math.max(.1,(r.y-3.3)/2),r.z,.1,Math.max(.2,r.y-3.3),.1);}
  // A thin ground trail makes orientation easier without changing physics.
  const trail=[];for(const r of [{x:0,y:0,z:15},...RINGS,{x:0,y:0,z:15}])trail.push(new T.Vector3(r.x,.04,r.z));
  const pathGeo=geo(new T.BufferGeometry().setFromPoints(trail)),pathMat=new T.LineDashedMaterial({color:0xdfebbf,dashSize:1,gapSize:2,transparent:true,opacity:.55});materials.push(pathMat);const line=new T.Line(pathGeo,pathMat);line.computeLineDistances();environment.add(line);
 }
 const vehicle=createTransformVehicle(T),drone=vehicle.group;scene.add(drone);
 let fisheye=null,lastView='';
 const shadow=new T.Mesh(new T.CircleGeometry(1,20),new T.MeshBasicMaterial({color:0x163e38,transparent:true,opacity:.18,depthWrite:false}));shadow.rotation.x=-Math.PI/2;scene.add(shadow);
 const ecology=createEcology(scene,profile);let habitat='sea',oldRing=-1,oldMission='',disposed=false;
 const desiredCamera=new T.Vector3(),target=new T.Vector3();let initial=true;
 let sceneryTexture=null,sceneryId=null,scenery360=false,sceneryRequest=0,sceneryState='none';
 const sceneryLoader=new T.TextureLoader();
 function setScenery(asset){
  const request=++sceneryRequest;scene.background=skyColor;
  sceneryTexture?.dispose();sceneryTexture=null;sceneryId=null;scenery360=false;
  if(disposed||!asset?.url){sceneryState='none';return Promise.resolve(false)}
  sceneryState='loading';
  return new Promise(resolve=>{sceneryLoader.load(asset.url,texture=>{
   if(disposed||request!==sceneryRequest){texture.dispose();resolve(false);return}
   texture.colorSpace=T.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=T.LinearFilter;texture.magFilter=T.LinearFilter;
   texture.mapping=asset.is360?T.EquirectangularReflectionMapping:T.UVMapping;
   sceneryTexture=texture;sceneryId=asset.id||null;scenery360=!!asset.is360;sceneryState='ready';resolve(true);
  },undefined,()=>{if(!disposed&&request===sceneryRequest)sceneryState='error';resolve(false)})});
 }
 const beaconGeo=new T.OctahedronGeometry(.25),beaconMat=new T.MeshBasicMaterial({color:0xff883e});
 const beaconMesh=new T.InstancedMesh(beaconGeo,beaconMat,8);beaconMesh.count=0;beaconMesh.frustumCulled=false;beaconMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(beaconMesh);
 const beaconMatrix=new T.Matrix4(),beaconPosition=new T.Vector3(),beaconRotation=new T.Quaternion(),beaconScale=new T.Vector3(1,1,1);
 function updateBeacons(s){let n=0;for(let i=0;i<Math.min(8,s.beacons?.length||0);i++){const b=s.beacons[i];if(!b||b.life<=0||(!Number.isFinite(b.x)||!Number.isFinite(b.y)||!Number.isFinite(b.z)))continue;beaconPosition.set(b.x,b.y,b.z);beaconMatrix.compose(beaconPosition,beaconRotation,beaconScale);beaconMesh.setMatrixAt(n++,beaconMatrix)}beaconMesh.count=n;beaconMesh.visible=n>0;beaconMesh.instanceMatrix.needsUpdate=true;}

 function resize(){const r=canvas.getBoundingClientRect();renderer.setPixelRatio(Math.min(devicePixelRatio,profile.maxDPR));renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();}
 function draw(s,dt,view='chase',mission='course'){
  const underwater=s.vehicle==='water';environment.visible=!underwater&&!sceneryTexture;ecology.update(s);
  skyColor.set(underwater?(habitat==='lake'?'#2e5c4b':'#0f5369'):kindColor());const backdrop=underwater?ecology.backdropTexture:sceneryTexture;scene.background=backdrop||skyColor;if(backdrop&&(underwater||!scenery360)){const ratio=backdrop.image.width/backdrop.image.height,a=camera.aspect;backdrop.repeat.set(Math.min(1,a/ratio),Math.min(1,ratio/a));backdrop.offset.set((1-backdrop.repeat.x)/2,(1-backdrop.repeat.y)/2);backdrop.updateMatrix();}scene.fog.color.copy(skyColor);scene.fog.near=underwater?8:120;scene.fog.far=underwater?65:550;
  vehicle.update(s,dt);updateBeacons(s);drone.visible=view!=='fpv';
  if(lastView!==view){camera.fov=view==='fpv'?68:62;camera.updateProjectionMatrix();lastView=view;}
  shadow.visible=!underwater&&!sceneryTexture;shadow.position.set(s.x,.025,s.z);shadow.scale.setScalar(1+s.y*.015);shadow.material.opacity=Math.max(.03,.22-s.y*.004);
  const sn=Math.sin(s.yaw),cs=Math.cos(s.yaw);
  if(view==='fpv'){desiredCamera.set(s.x+sn*.7,s.y+.16,s.z-cs*.7);target.set(s.x+sn*35,s.y+1-s.pitch*7,s.z-cs*35);camera.position.copy(desiredCamera);camera.up.set(0,1,0);camera.lookAt(target);camera.rotateZ(-s.roll*.6);}
  else{desiredCamera.set(s.x-sn*10,s.y+4.6,s.z+cs*10);target.set(s.x+sn*3,s.y+.4,s.z-cs*3);camera.up.set(0,1,0);if(initial)camera.position.copy(desiredCamera);else camera.position.lerp(desiredCamera,1-Math.exp(-5*dt));camera.lookAt(target);}
  initial=false;if(oldRing!==s.ring||oldMission!==mission){ringMeshes.forEach((r,i)=>{r.visible=mission==='course';r.material.color.set(i<s.ring?0x769681:i===s.ring?0xd6f06d:0xe3efec);r.material.emissive.set(i===s.ring?0x657a20:0x172c27);});oldRing=s.ring;oldMission=mission;}
  if(view==='fpv'){fisheye ||= createFisheyePass(T,renderer);fisheye.render(scene,camera,.05)}else renderer.render(scene,camera);
 }
 let currentKind='coast';const originalBuild=build;function kindColor(){return currentKind==='dusk'?'#e1ae93':currentKind==='alpine'?'#a0bdce':'#9cc9da'}
 function changeScene(kind){currentKind=kind;originalBuild(kind);oldRing=-1;oldMission='';initial=true}
 build();resize();return {draw,resize,setScenery,build:changeScene,setHabitat(v){habitat=v;ecology.setHabitat(v)},get obstacles(){return sceneryTexture?noObstacles:obstacles;},get stats(){return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,renderer:'WebGL',profile:profile.tier,textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries,scenery:sceneryState,sceneryId,sceneryType:sceneryTexture?(scenery360?'panorama':'photo'):null,beacons:beaconMesh.count};},resetCamera(){initial=true},capture(s,view,mission){draw(s,0,view,mission);return new Promise(resolve=>canvas.toBlob(resolve,'image/png'))},dispose(){if(disposed)return;disposed=true;++sceneryRequest;scene.background=null;sceneryTexture?.dispose();sceneryTexture=null;beaconMesh.dispose();vehicle.dispose();fisheye?.dispose();ecology.dispose();environment.traverse(o=>{if(o.isInstancedMesh)o.dispose()});const gs=new Set(),ms=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>ms.add(m))});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();}};
}
