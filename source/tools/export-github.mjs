// Rebuild relative URLs and SEO metadata for the user's exact GitHub Pages root.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=process.cwd(),out=path.join(root,'.aero-output'),stage=path.join(out,'github-build'),target=path.join(out,'AERO_Explorer');
if(!fs.existsSync(path.join(root,'node_modules','esbuild')))throw Error('Run npm ci first.');
fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(path.join(stage,'tools'),{recursive:true});
fs.cpSync(path.join(root,'dist'),path.join(stage,'dist'),{recursive:true});
for(const file of ['package.json','package-lock.json'])fs.copyFileSync(path.join(root,file),path.join(stage,file));
fs.copyFileSync(path.join(root,'tools','build-locales.mjs'),path.join(stage,'tools','build-locales.mjs'));
fs.symlinkSync(path.join(root,'node_modules'),path.join(stage,'node_modules'),process.platform==='win32'?'junction':'dir');
try{
 const result=spawnSync(process.execPath,['tools/build-locales.mjs'],{cwd:stage,env:{...process.env,AERO_ORIGIN:'https://kuonanhong.github.io/AERO_Explorer'},stdio:'inherit'});
 if(result.status!==0)throw Error('GitHub build failed.');
 fs.rmSync(target,{recursive:true,force:true});fs.mkdirSync(path.dirname(target),{recursive:true});fs.cpSync(path.join(stage,'dist'),target,{recursive:true});
 fs.writeFileSync(path.join(target,'.nojekyll'),'');
 console.log('Ready folder: '+target);
}finally{fs.rmSync(stage,{recursive:true,force:true})}
