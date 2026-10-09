// A preview remains usable even when an embedded browser rejects downloads.
export function isInAppBrowser(ua=navigator.userAgent){return /\bLine\/|\bFBAN\b|\bFBAV\b|Instagram|MicroMessenger/i.test(ua);}
export async function creditPhoto(blob,lines=[]){
 if(!lines.length)return blob;
 const url=URL.createObjectURL(blob);
 try{
  const source=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=url;});
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  canvas.width=source.naturalWidth;const size=Math.max(11,Math.min(16,canvas.width/55));ctx.font=size+'px sans-serif';
  const wrapped=[];for(const line of lines){let part='';for(const ch of line){if(ctx.measureText(part+ch).width>canvas.width-24){wrapped.push(part);part=ch;}else part+=ch;}if(part)wrapped.push(part);}
  canvas.height=source.naturalHeight+Math.ceil(wrapped.length*size*1.45+18);
  ctx.drawImage(source,0,0);ctx.fillStyle='#102a2d';ctx.fillRect(0,source.naturalHeight,canvas.width,canvas.height-source.naturalHeight);ctx.fillStyle='#f4f8f2';ctx.font=size+'px sans-serif';ctx.textBaseline='top';
  wrapped.forEach((line,i)=>ctx.fillText(line,12,source.naturalHeight+9+i*size*1.45));
  return await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('PNG export failed')),'image/png'));
 }finally{URL.revokeObjectURL(url);}
}
export function createPhotoExporter({dialog,image,download,share,status,hint,close,t}){
 let blob=null,file=null,url=null,serial=0;
 const embedded=isInAppBrowser();
 function release(){if(url)URL.revokeObjectURL(url);url=null;blob=null;file=null;image.removeAttribute('src');download.removeAttribute('href');}
 function dismiss(){dialog.close();}
 close.onclick=dismiss;
 dialog.addEventListener('close',()=>{serial++;release();});
 download.onclick=e=>{if(!url){e.preventDefault();return;}status.textContent=t('photoDownloadRequested');};
 share.onclick=async()=>{if(!file)return;share.disabled=true;try{await navigator.share({files:[file]});status.textContent=t('photoShareHandedOff');}catch(error){if(error?.name!=='AbortError')status.textContent=t('photoShareFailed');}finally{share.disabled=false;}};
 return {
  async open(captured,name){
   const request=++serial;release();blob=captured;
   // A data URL is intentional: mobile long-press menus handle a plain PNG image
   // more consistently than a short-lived blob URL. The download uses the blob.
   const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(captured);});
   if(request!==serial)return;
   url=URL.createObjectURL(captured);image.src=data;image.alt=t('photoPreview');download.href=url;download.download=name;
   try{file=new File([blob],name,{type:'image/png'});}catch{file=null;}
   let canShare=false;try{canShare=!!(file&&navigator.share&&navigator.canShare?.({files:[file]}));}catch{}
   share.hidden=!canShare;share.disabled=false;download.hidden=embedded;
   hint.hidden=!embedded;hint.textContent=t('photoInAppHint');status.textContent=t('photoSaved');
   if(!dialog.open)dialog.showModal();
  },
  dispose(){serial++;release();}
 };
}
