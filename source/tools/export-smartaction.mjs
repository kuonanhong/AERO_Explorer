// Generate the SmartAction-ready subfolder without changing the native Site build.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=process.cwd(),out=path.join(root,'.aero-output'),stage=path.join(out,'smartaction-build'),target=path.join(out,'SmartAction','games','aero');
if(!fs.existsSync(path.join(root,'node_modules','esbuild')))throw Error('Run npm ci first.');
fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(path.join(stage,'tools'),{recursive:true});
fs.cpSync(path.join(root,'dist'),path.join(stage,'dist'),{recursive:true});
for(const file of ['package.json','package-lock.json'])fs.copyFileSync(path.join(root,file),path.join(stage,file));
fs.copyFileSync(path.join(root,'tools','build-locales.mjs'),path.join(stage,'tools','build-locales.mjs'));
fs.symlinkSync(path.join(root,'node_modules'),path.join(stage,'node_modules'),process.platform==='win32'?'junction':'dir');
try{const result=spawnSync(process.execPath,['tools/build-locales.mjs'],{cwd:stage,env:{...process.env,AERO_ORIGIN:'https://kuonanhong.github.io/SmartAction/games/aero'},stdio:'inherit'});if(result.status!==0)throw Error('SmartAction build failed.');
 fs.rmSync(target,{recursive:true,force:true});fs.mkdirSync(path.dirname(target),{recursive:true});fs.cpSync(path.join(stage,'dist'),target,{recursive:true});
 console.log('Ready folder: '+target);
}finally{fs.rmSync(stage,{recursive:true,force:true})}
