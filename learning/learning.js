'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safe = value => { try { const u = new URL(value, location.href); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : '#'; } catch { return '#'; } };
const link = (url, title, attrs='') => `<a href="${esc(safe(url))}" ${attrs}>${esc(title)}</a>`;
const external = 'target="_blank" rel="noopener noreferrer"';
const size = bytes => bytes >= 1e6 ? (bytes/1e6).toFixed(1)+' MB' : Math.round(bytes/1000)+' KB';
const KEY = 'aero-crew-learning-v1';
let data, state = {steps:{}, notes:{}, preflight:{}, fields:{}};
try { const saved=JSON.parse(localStorage.getItem(KEY)); if(saved && typeof saved==='object') for(const k of ['steps','notes','preflight','fields']) if(saved[k] && typeof saved[k]==='object' && !Array.isArray(saved[k])) state[k]=saved[k]; } catch {}
function save() { try { localStorage.setItem(KEY,JSON.stringify(state)); $('save-status').textContent='已儲存在此瀏覽器。'; } catch { $('save-status').textContent='瀏覽器無法儲存；請匯出紀錄以保留本次內容。'; } }
const checks=['已查詢官方活動區域，閱讀適用限制及公告時間。','已確認操作證、無人機與活動案件是否符合本次任務需求。','已核對天氣、場地與機型限制，列出不確定事項。','已確認團隊分工、通訊、終止條件與現場應變流程。'];
function renderMaterials() {
  const q=$('search').value.trim().toLowerCase(), cat=$('category').value, topic=$('topic').value;
  const rows=data.materials.filter(m=>(cat==='all'||m.category===cat)&&(topic==='all'||m.topics.includes(topic))&&[m.title,m.description,...m.topics,m.originalName].join(' ').toLowerCase().includes(q));
  $('material-count').textContent=`${rows.length} / ${data.materials.length} 項`;
  $('material-list').innerHTML=rows.length?rows.map(m=>`<article class="material" id="material-${esc(m.id)}">${m.preview && ['jpg','png'].includes(m.type)?`<img src="${esc(safe(m.path))}" alt="${esc(m.title)}" loading="lazy">`:`<span class="type">${esc(m.type.toUpperCase())}</span>`}<div><h3>${esc(m.title)}</h3><p>${esc(m.description)}</p><div class="tags">${m.topics.filter(t=>!/^(flight|mapping|gis|assembly)$/.test(t)).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><p>${size(m.bytes)}${m.pages?' · '+m.pages+' 頁':''}</p></div><div class="links">${link(m.path,m.type==='pptx'?'下載簡報 ↓':m.type==='html'?'開啟工具 ↗':'開啟原檔 ↗',external)}${link(m.path,'下載 ↓','download')}</div></article>`).join(''):'<p class="empty">沒有符合條件的教材。請改用其他關鍵字或選擇全部主題。</p>';
}
function renderSources() {
  $('source-list').innerHTML=data.sources.map(s=>`<article class="source" id="source-${esc(s.id)}"><div class="number">${s.screenshot_item}</div><div><h3>${esc(s.title)}</h3><p>${esc(s.summary)}</p><p class="origin">${link(s.url,s.repo,external)}</p><div class="apply"><strong>在模擬飛行中應用</strong><p>${esc(s.applications.aero.join(' '))}</p><strong>在救災實驗中應用</strong><p>${esc(s.applications.resilience.join(' '))}</p></div><details><summary>${esc(s.exercise.title)} · 展開實作</summary><ol>${s.exercise.steps.map(t=>`<li>${esc(t)}</li>`).join('')}</ol><p><b>成果：</b>${esc(s.exercise.deliverable)}</p><div class="related">${s.links.map(l=>link(l.url,l.label,external)).join('')}</div></details><p class="fine">來源授權：${s.license.url?link(s.license.url,s.license.name,external):esc(s.license.name)} · 查閱 ${esc(s.verified_at)}。${s.license.attribution?esc(s.license.attribution):''}${s.license.note?esc(s.license.note):''}應用步驟為本站教學設計。</p></div></article>`).join('');
}
function related(p) {
  return [...p.materialIds.map(id=>{const m=data.materials.find(x=>x.id===id);return m?link(m.path,m.title,external):'';}),...p.sourceIds.map(id=>{const s=data.sources.find(x=>x.id===id);return s?link('#source-'+id,`${s.screenshot_item} · ${s.title}`):'';})].join('');
}
function renderPractice() {
  $('practice-list').innerHTML=data.practices.map((p,n)=>`<article class="practice" id="practice-${esc(p.id)}"><p class="eyebrow">EXERCISE ${String(n+1).padStart(2,'0')}</p><h3>${esc(p.title)}</h3><p>${esc(p.summary)}</p>${p.steps.map((s,i)=>`<label class="check"><input type="checkbox" data-step="${esc(p.id)}:${i}" ${state.steps[p.id+':'+i]?'checked':''}><span>${esc(s)}</span></label>`).join('')}<div class="output"><b>練習成果：</b>${esc(p.output)}</div><div class="related">${related(p)}</div><label>觀察筆記<textarea rows="2" data-note="${esc(p.id)}" placeholder="記下觀察、待確認事項與下次練習重點">${esc(state.notes[p.id]||'')}</textarea></label></article>`).join('');
  document.querySelectorAll('[data-step]').forEach(el=>el.addEventListener('change',()=>{state.steps[el.dataset.step]=el.checked;save();}));
  document.querySelectorAll('[data-note]').forEach(el=>el.addEventListener('input',()=>{state.notes[el.dataset.note]=el.value;save();}));
}
function renderRecord() {
  $('preflight-checks').innerHTML=checks.map((s,i)=>`<label class="check"><input type="checkbox" data-preflight="${i}" ${state.preflight[i]?'checked':''}><span>${esc(s)}</span></label>`).join('');
  document.querySelectorAll('[data-preflight]').forEach(el=>el.addEventListener('change',()=>{state.preflight[el.dataset.preflight]=el.checked;save();}));
  for(const id of ['site-name','checked-at','reference','field-notes']) {$(id).value=state.fields[id]||'';$(id).oninput=()=>{state.fields[id]=$(id).value;save();};}
}
function calculate(v) {
  const limits={height:[1,1000],sensor:[1,100],focal:[1,500],width:[100,50000],heightpx:[100,50000],front:[0,99],side:[0,99],speed:[.1,100]};
  if(Object.entries(limits).some(([k,[lo,hi]])=>!Number.isFinite(v[k])||v[k]<lo||v[k]>hi)) throw new Error('請輸入範圍內的有效數值。');
  const footprint=v.height*v.sensor/v.focal, length=footprint*v.heightpx/v.width;
  return {gsdCm:footprint/v.width*100,footprintWidthM:footprint,footprintLengthM:length,lineSpacingM:footprint*(1-v.side/100),photoSpacingM:length*(1-v.front/100),intervalSeconds:length*(1-v.front/100)/v.speed};
}
function renderCalc(event) {
  event?.preventDefault();const form=$('mapping-form');if(!form.reportValidity())return;
  try {const values=Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,Number(v)]));const r=calculate(values);state.calculation={inputs:values,results:r};
    $('calc-result').innerHTML=`<div><span>地面取樣距離 GSD</span><b>${r.gsdCm.toFixed(2)} cm/px</b></div><div><span>地面影像幅寬 × 航向長度</span><b>${r.footprintWidthM.toFixed(1)} × ${r.footprintLengthM.toFixed(1)} m</b></div><div><span>相鄰航線間距</span><b>${r.lineSpacingM.toFixed(1)} m</b></div><div><span>拍攝間距 / 拍攝時間間隔</span><b>${r.photoSpacingM.toFixed(1)} m / ${r.intervalSeconds.toFixed(1)} s</b></div>`;if(event)save();
  }catch(e){$('calc-result').textContent=e.message;}
}
function downloadRecord() {
  const record={schemaVersion:1,exportedAt:new Date().toISOString(),catalogUpdatedAt:data.updatedAt,purpose:'教學紀錄；非飛行許可、非官方報到',practiceTitles:data.practices.map(p=>({id:p.id,title:p.title,steps:p.steps})),preflightLabels:checks,...state};
  const blob=new Blob([JSON.stringify(record,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='drone-learning-record-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function start() {
  try {
    const response=await fetch('catalog.json');if(!response.ok)throw new Error('HTTP '+response.status);data=await response.json();
    $('load-status').textContent='';
    if(location.pathname.includes('Resilience_Crew_Lab'))$('sim-link').href='../sim/index.html';
    const topic=new URLSearchParams(location.search).get('topic');if(['mapping','flight','assembly','gis'].includes(topic))$('topic').value=topic;
    $('packages').innerHTML=data.packages.map(p=>`<article class="package"><h3>${esc(p.title)}</h3><p>${esc(p.note)}</p>${link(p.path,`下載 ${size(p.bytes)} ↓`,'download')}<details><summary class="fine">SHA-256</summary><p class="fine" style="overflow-wrap:anywhere">${esc(p.sha256)}</p></details></article>`).join('');
    renderMaterials();renderSources();renderPractice();renderRecord();
    $('search').addEventListener('input',renderMaterials);$('category').addEventListener('change',renderMaterials);$('topic').addEventListener('change',renderMaterials);
    $('drone-summary').textContent=data.droneMap.summary;$('drone-version').textContent=data.droneMap.versionNote;
    $('official-links').innerHTML=link(data.droneMap.url,'官方空域與管理系統 ↗',`class="button primary" ${external}`)+link(data.droneMap.android,'Android App ↗',`class="button" ${external}`)+link(data.droneMap.ios,'iPhone App ↗',`class="button" ${external}`);
    $('drone-features').innerHTML=data.droneMap.entries.map(e=>`<article class="feature"><h3>${esc(e.title)}</h3><p>${esc(e.summary)}</p>${link(e.url,'前往官方說明 ↗',external)}</article>`).join('');
    $('drone-sources').innerHTML='<ul>'+data.droneMap.sources.map(s=>`<li>${link(s.url,s.title,external)}</li>`).join('')+'</ul>';
    $('export').addEventListener('click',downloadRecord);
    $('reset-record').addEventListener('click',()=>{if(!confirm('清除這個瀏覽器中的學習勾選、筆記與飛前紀錄？已匯出的檔案不受影響。'))return;state={steps:{},notes:{},preflight:{},fields:{}};save();renderPractice();renderRecord();});
    $('mapping-form').addEventListener('submit',renderCalc);renderCalc();
    // Resolve deep links after asynchronous catalogue rendering.
    if(location.hash){const target=document.getElementById(decodeURIComponent(location.hash.slice(1)));target?.scrollIntoView();}
  }catch(e){$('load-status').innerHTML=`<span class="error">教材載入失敗：${esc(e.message)}。請重新整理，或直接${link('catalog.json','開啟資料目錄')}。</span>`;}
}
window.LearningLab={calculate};
start();
