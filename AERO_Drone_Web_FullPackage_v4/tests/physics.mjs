import assert from 'node:assert/strict';import {createState,setVehicle,step,RINGS} from '../dist/physics.js';
const neutral={lift:0,yaw:0,forward:0,right:0};
const tick=(s,i,seconds,mode='beginner',mission='free',obstacles=[])=>{for(let k=0;k<seconds*120;k++)step(s,i,1/120,mode,mission,obstacles);return s;};
let s=createState();tick(s,{...neutral,lift:1},2);assert(s.y>5.8&&s.y<6.1,'assisted climb response');tick(s,neutral,2);assert(Math.abs(s.vy)<.01,'release holds height');const z=s.z;tick(s,{...neutral,forward:1},2);assert(s.z<z-10,'forward is -Z');tick(s,neutral,3);assert(Math.hypot(s.vx,s.vz)<.01,'assisted brake');
s=createState();tick(s,{...neutral,lift:1},1);tick(s,{...neutral,yaw:1},1);assert(s.yaw>1,'D turns clockwise');tick(s,{...neutral,forward:1},1);assert(s.x>2,'forward follows heading');
s=createState();s.y=20;tick(s,{...neutral,lift:-1},.5,'expert');assert(s.vy<-4,'manual zero-thrust falls');
s=createState();s.y=20;tick(s,neutral,2,'expert');assert(Math.abs(s.y-20)<.01,'level manual half throttle hovers vertically');
s=createState();s.y=5;s.vy=-10;tick(s,neutral,1,'expert');assert(s.crashed,'hard impact marks crash');
s=createState();s.z=-8.99;s.y=4;s.vz=-4;step(s,{...neutral,forward:1},1/120,'beginner','course');assert.equal(s.ring,1,'swept ring plane crossing');
s=createState();s.z=-8.99;s.y=10;s.vz=-4;step(s,{...neutral,forward:1},1/120,'beginner','course');assert.equal(s.ring,0,'out-of-aperture crossing earns no score');
s=createState();s.ring=RINGS.length;tick(s,neutral,1,'beginner','course');assert(s.complete&&s.score>=100,'return pad completion');
s=createState();s.x=184;tick(s,{...neutral,right:1},2,'beginner','course');assert(s.x<=185,'training boundary');
s=createState();s.x=995;tick(s,{...neutral,right:1},2);assert(s.x<=1000,'free exploration boundary');
s=createState('land');tick(s,{...neutral,lift:1,forward:1},2);assert.equal(s.y,.6,'ground vehicle ignores lift');assert(s.z<10,'ground vehicle drives');tick(s,neutral,3);assert(Math.abs(s.vz)<.01,'ground release brakes');
s=createState('water');tick(s,{...neutral,lift:-1,forward:1},4);assert(s.y<-8&&s.z<5,'underwater dive and forward');tick(s,{...neutral,lift:-1},30);assert.equal(s.y,-20,'seabed depth limit');tick(s,{...neutral,lift:1},30);assert.equal(s.y,-.4,'surface limit');
setVehicle(s,'air');assert.equal(s.vehicle,'air');assert(s.y>=.6,'vehicle transition returns above ground');assert.equal(s.vy,0,'transition clears velocity');
for(const m of ['beginner','sport','expert']){s=createState();for(let i=0;i<12000;i++)step(s,{lift:Math.sin(i*.03),yaw:Math.cos(i*.02),forward:Math.sin(i*.01),right:Math.cos(i*.04)},1/120,m,'free');for(const key of ['x','y','z','vx','vy','vz','yaw','pitch','roll'])assert(Number.isFinite(s[key]),m+' state finite');}
console.log('Physics: original 11 behaviors plus 7 vehicle/boundary checks passed.');
