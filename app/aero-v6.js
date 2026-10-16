import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
/* ======================= core: utils, geo frame, data ======================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rad = Math.PI / 180, deg = 180 / Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pad2 = n => String(n).padStart(2, '0');
const hhmm = m => `${pad2(Math.floor((((m % 1440) + 1440) % 1440) / 60))}:${pad2(Math.floor(((m % 60) + 60) % 60))}`;
const LS = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { } } };
const UA = 'AERO-RealWorld/1.0 (https://github.com/kuonanhong/AERO_Explorer)';
const strip = (() => { const p = new DOMParser(); return s => s ? (p.parseFromString(String(s), 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim() : ''; })();
async function fetchJSON(url, { timeout = 15000, headers, signal } = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout); const on = () => c.abort(); signal?.addEventListener('abort', on, { once: true });
  try { const r = await fetch(url, { signal: c.signal, headers, credentials: 'omit' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); signal?.removeEventListener('abort', on); }
}
function haversine(a, b, c, d) { const R = 6371000, p = (c - a) * rad, q = (d - b) * rad; const h = Math.sin(p / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(q / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
function hexLerp(a, b, t) { const A = new THREE.Color(a), B = new THREE.Color(b); return '#' + A.lerp(B, clamp(t, 0, 1)).getHexString(); }

/* Local frame: Web-Mercator scaled by cos(lat0) so ground distances are true near the origin; tiles are axis-aligned squares. */
const R_E = 6378137, WORLD_M = 2 * Math.PI * R_E;
const GEO = { lat0: 0, lon0: 0, mx0: 0, my0: 0, k: 1 };
const mercX = lon => lon * rad * R_E, mercY = lat => Math.log(Math.tan(Math.PI / 4 + clamp(lat, -85, 85) * rad / 2)) * R_E;
function setOrigin(lat, lon) { Object.assign(GEO, { lat0: lat, lon0: lon, mx0: mercX(lon), my0: mercY(lat), k: Math.cos(lat * rad) }); }
const toLocal = (lat, lon) => [(mercX(lon) - GEO.mx0) * GEO.k, -(mercY(lat) - GEO.my0) * GEO.k];
function toLatLon(X, Z) { const mx = X / GEO.k + GEO.mx0, my = -Z / GEO.k + GEO.my0; return [(2 * Math.atan(Math.exp(my / R_E)) - Math.PI / 2) * deg, mx / R_E * deg]; }
const tileSize = z => WORLD_M / 2 ** z;
function tileBounds(z, x, y) { const s = tileSize(z), mx = -Math.PI * R_E + x * s, my = Math.PI * R_E - y * s; const X0 = (mx - GEO.mx0) * GEO.k, Z0 = -(my - GEO.my0) * GEO.k; return { X0, X1: X0 + s * GEO.k, Z0, Z1: Z0 + s * GEO.k }; }
function localToTile(X, Z, z) { const s = tileSize(z), mx = X / GEO.k + GEO.mx0, my = -Z / GEO.k + GEO.my0; return [(mx + Math.PI * R_E) / s, (Math.PI * R_E - my) / s]; }

/* Destinations (2776, same catalogue as the 4D viewer). Row: [id, lat, lon, zh, en, cc, region, cat, desc, src, mission, zhHans, detailShard] */
const RAW = $('#places-data') ? JSON.parse($('#places-data').textContent) : await fetchJSON('data/places.json', { timeout: 30000 });
const PLACES = RAW.map((r, i) => ({ i, id: r[0], lat: r[1], lon: r[2], zh: r[3], en: r[4], cc: r[5], region: r[6], cat: r[7], desc: r[8], src: r[9], mission: !!r[10], zhs: r[11] || '', shard: r[12] || '' }));
const PLACE_BY_ID = new Map(PLACES.map(p => [p.id, p]));
const CAT = { scenic: '風景', heritage: '人文古蹟', mountain: '山岳', lake: '湖泊', museum: '博物館', forest: '森林', diving: '潛點', park: '公園', cave: '洞穴', warehouse: '倉庫', reef: '珊瑚礁', statue: '雕像', bridge: '橋梁', grain: '穀倉', rubble: '災後紀錄', medical: '醫院', solar: '太陽能場', wreck: '沉船', cable: '纜線', harbor: '港區', mission: '任務場景' };
const QUICK = [
  ['tw-376550000a_003128', 'drone'], ['tw-376480000a_000382', 'boat'], ['tw-376550000a_001176', 'plane'], ['tw-376420000a_000348', 'boat'],
  ['tw-382000000a_109990', 'drone'], ['tw-345040000g_000010', 'car'], ['tw-379000000a_000023', 'drone'], ['tw-382000000a_109751', 'drone'],
  ['tw-a15010100h_000041', 'boat'], ['mission-place-air-statue', 'drone'], ['mission-place-air-bridge', 'plane'], ['unesco-1418', 'plane'],
  ['unesco-75', 'plane'], ['unesco-166', 'boat'], ['unesco-394', 'boat'], ['unesco-274', 'drone'],
].map(([id, v]) => ({ p: PLACE_BY_ID.get(id), v })).filter(x => x.p);
const VEHICLE_KINDS = ['drone', 'plane', 'boat', 'car', 'ugv', 'rov'];
const DEFAULT_PLACE = 'tw-376480000a_000382';   // Sun Moon Lake, Ita Thao pier: lake, mountains, village
const suggestVehicle = p => ['lake', 'diving', 'reef', 'harbor', 'wreck'].includes(p.cat) ? 'boat' : 'drone';

/* Sun & moon positions (SunCalc algorithms, V. Agafonkin, BSD-2) and local-time helpers */
const J1970 = 2440588, J2000 = 2451545, OBL = rad * 23.4397;
const toDays = date => date.valueOf() / 864e5 - 0.5 + J1970 - J2000;
const raOf = (l, b) => Math.atan2(Math.sin(l) * Math.cos(OBL) - Math.tan(b) * Math.sin(OBL), Math.cos(l));
const decOf = (l, b) => Math.asin(Math.sin(b) * Math.cos(OBL) + Math.cos(b) * Math.sin(OBL) * Math.sin(l));
const sidereal = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;
const azOf = (H, phi, dec) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
const altOf = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
function sunCoords(d) { const M = rad * (357.5291 + 0.98560028 * d), L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI; return { dec: decOf(L, 0), ra: raOf(L, 0) }; }
function sunPos(date, lat, lng) { const lw = rad * -lng, phi = rad * lat, d = toDays(date), c = sunCoords(d), H = sidereal(d, lw) - c.ra; return { alt: altOf(H, phi, c.dec) * deg, az: (azOf(H, phi, c.dec) * deg + 180 + 360) % 360 }; }
function moonCoords(d) { const L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.229350 * d); const l = L + rad * 6.289 * Math.sin(M), b = rad * 5.128 * Math.sin(F); return { ra: raOf(l, b), dec: decOf(l, b), dist: 385001 - 20905 * Math.cos(M) }; }
function moonPos(date, lat, lng) { const lw = rad * -lng, phi = rad * lat, d = toDays(date), c = moonCoords(d), H = sidereal(d, lw) - c.ra; let h = altOf(H, phi, c.dec); h += 0.0002967 / Math.tan(Math.max(h, 0) + 0.00312536 / (Math.max(h, 0) + 0.08901179)); return { alt: h * deg, az: (azOf(H, phi, c.dec) * deg + 180 + 360) % 360 }; }
function moonIllum(date) {
  const d = toDays(date), s = sunCoords(d), m = moonCoords(d), sd = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sd * Math.sin(phi), m.dist - sd * Math.cos(phi));
  const ang = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (ang < 0 ? -1 : 1) / Math.PI };
}
const tzFor = p => p.cc === 'TW' ? 8 : Math.round(p.lon / 15);
function localToDate(p, date, min) { const [y, mo, d] = date.split('-').map(Number); return new Date(Date.UTC(y, mo - 1, d) + (min - tzFor(p) * 60) * 6e4); }
function nowAt(p) { const t = new Date(Date.now() + tzFor(p) * 36e5); return { date: t.toISOString().slice(0, 10), min: t.getUTCHours() * 60 + t.getUTCMinutes() }; }
const ymdUTC = t => t.toISOString().slice(0, 10);
const addDays = (date, n) => ymdUTC(new Date(Date.parse(date + 'T00:00:00Z') + n * 864e5));
function sunTimesOf(p, date) { let rise = 360, set = 1080, best = -90, noon = 720, prev = sunPos(localToDate(p, date, 0), p.lat, p.lon).alt; for (let m = 4; m <= 1440; m += 4) { const a = sunPos(localToDate(p, date, m), p.lat, p.lon).alt; if (prev < -0.83 && a >= -0.83) rise = m; if (prev >= -0.83 && a < -0.83) set = m; if (a > best) { best = a; noon = m; } prev = a; } return { rise, set, noon, noonAlt: best }; }
/* seasons follow the hemisphere: "summer" is July in the north and January in the south */
function seasonDate(season, p) {
  const today = nowAt(p).date; if (!season || season === 'today') return today;
  const y = +today.slice(0, 4), south = p.lat < 0, flip = { spring: 'autumn', summer: 'winter', autumn: 'spring', winter: 'summer' };
  const s = south ? flip[season] : season, md = { spring: '04-20', summer: '07-20', autumn: '10-25', winter: '01-20' }[s];   // mid-season: foliage and snow look typical
  return `${y}-${md}`;
}
/* resolve a time-of-day preset into a concrete local date + minute at this place */
function resolveTime(preset, season, p) {
  let date = seasonDate(season, p); const st = sunTimesOf(p, date);
  if (preset === 'now') { const n = nowAt(p); return { date: season && season !== 'today' ? date : n.date, min: n.min, live: true }; }
  if (preset === 'dawn') return { date, min: st.rise + 12 };
  if (preset === 'morning') return { date, min: Math.round(st.rise + (st.noon - st.rise) * 0.45) };
  if (preset === 'noon') return { date, min: st.noon };
  if (preset === 'afternoon') return { date, min: Math.round(st.noon + (st.set - st.noon) * 0.55) };
  if (preset === 'dusk') return { date, min: st.set - 14 };
  const wantFull = preset === 'nightMoon'; let best = date, bv = wantFull ? -1 : 2;
  for (let k = -16; k <= 16; k++) { const dd = addDays(date, k), f = moonIllum(localToDate(p, dd, 1440)).fraction; if (wantFull ? f > bv : f < bv) { bv = f; best = dd; } }
  date = best; const st2 = sunTimesOf(p, date);
  if (!wantFull) return { date, min: Math.min(1430, st2.set + 150) };
  let bm = 1380, ba = -90; for (let m = st2.set + 60; m <= 1440 + st2.rise - 60; m += 10) { const mm = m % 1440, dd = m >= 1440 ? addDays(date, 1) : date, a = moonPos(localToDate(p, dd, mm), p.lat, p.lon).alt; if (a > ba) { ba = a; bm = m; } }
  return bm >= 1440 ? { date: addDays(date, 1), min: bm - 1440 } : { date, min: bm };
}
/* compass bearing (deg, clockwise from north) -> local unit vector */
const bearingVec = (b, out = new THREE.Vector3()) => out.set(Math.sin(b * rad), 0, -Math.cos(b * rad));
/* foliage season weights for a local date: {spring, summer, autumn, winter} (sum 1), southern hemisphere shifted half a year */
function seasonWeights(date, lat) {
  let doy = (Date.parse(date + 'T00:00:00Z') - Date.parse(date.slice(0, 4) + '-01-01T00:00:00Z')) / 864e5; if (lat < 0) doy = (doy + 182.5) % 365;
  const peak = { winter: 15, spring: 110, summer: 196, autumn: 298 }, w = {}; let sum = 0;
  for (const k in peak) { let d = Math.abs(doy - peak[k]); d = Math.min(d, 365 - d); w[k] = Math.max(0, Math.cos(Math.min(d, 91) / 91 * Math.PI / 2)) ** 2; sum += w[k]; }
  for (const k in w) w[k] /= sum || 1; return w;
}

/* ======================= i18n: viewer's language, RTL, localized place names ======================= */
const LANGS = ['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko', 'vi', 'th', 'id', 'ms', 'fil', 'km', 'my', 'hi', 'bn', 'mr', 'ta', 'te', 'ur', 'ar', 'fa', 'he', 'tr',
  'ru', 'uk', 'pl', 'cs', 'ro', 'hu', 'el', 'de', 'nl', 'da', 'sv', 'nb', 'fi', 'fr', 'es', 'it', 'pt', 'sw'];
const I18N = { lang: 'en', dict: {}, en: {}, names: {}, loaded: {} };
const ALIAS = { 'zh-tw': 'zh-Hant', 'zh-hk': 'zh-Hant', 'zh-mo': 'zh-Hant', 'zh-hant': 'zh-Hant', 'zh-cn': 'zh-Hans', 'zh-sg': 'zh-Hans', 'zh-hans': 'zh-Hans', 'zh-my': 'zh-Hans', zh: 'zh-Hans',
  no: 'nb', nn: 'nb', tl: 'fil', iw: 'he', in: 'id', 'pt-br': 'pt', 'pt-pt': 'pt' };
const TZ_LANG = { 'Asia/Taipei': 'zh-Hant', 'Asia/Hong_Kong': 'zh-Hant', 'Asia/Macau': 'zh-Hant', 'Asia/Shanghai': 'zh-Hans', 'Asia/Singapore': 'zh-Hans', 'Asia/Tokyo': 'ja', 'Asia/Seoul': 'ko',
  'Asia/Ho_Chi_Minh': 'vi', 'Asia/Bangkok': 'th', 'Asia/Jakarta': 'id', 'Asia/Kuala_Lumpur': 'ms', 'Asia/Manila': 'fil', 'Asia/Phnom_Penh': 'km', 'Asia/Yangon': 'my', 'Asia/Kolkata': 'hi',
  'Asia/Dhaka': 'bn', 'Asia/Karachi': 'ur', 'Asia/Tehran': 'fa', 'Asia/Jerusalem': 'he', 'Europe/Istanbul': 'tr', 'Europe/Moscow': 'ru', 'Europe/Kyiv': 'uk', 'Europe/Kiev': 'uk', 'Europe/Warsaw': 'pl',
  'Europe/Prague': 'cs', 'Europe/Bucharest': 'ro', 'Europe/Budapest': 'hu', 'Europe/Athens': 'el', 'Europe/Berlin': 'de', 'Europe/Vienna': 'de', 'Europe/Zurich': 'de', 'Europe/Amsterdam': 'nl',
  'Europe/Brussels': 'nl', 'Europe/Copenhagen': 'da', 'Europe/Stockholm': 'sv', 'Europe/Oslo': 'nb', 'Europe/Helsinki': 'fi', 'Europe/Paris': 'fr', 'Europe/Madrid': 'es', 'Europe/Rome': 'it',
  'Europe/Lisbon': 'pt', 'America/Sao_Paulo': 'pt', 'America/Mexico_City': 'es', 'America/Bogota': 'es', 'America/Lima': 'es', 'America/Argentina/Buenos_Aires': 'es', 'Africa/Nairobi': 'sw',
  'Africa/Dar_es_Salaam': 'sw', 'Africa/Cairo': 'ar', 'Asia/Riyadh': 'ar', 'Asia/Dubai': 'ar' };
function pickLang() {
  const q = new URLSearchParams(location.search).get('lang'); if (q && LANGS.includes(q)) return q;   // an explicit ?lang= wins
  const saved = LS.get('aero:lang'); if (saved && LANGS.includes(saved)) return saved;
  for (const raw of (navigator.languages?.length ? navigator.languages : [navigator.language || 'en'])) {
    const l = String(raw).toLowerCase(); if (ALIAS[l]) return ALIAS[l];
    const exact = LANGS.find(x => x.toLowerCase() === l); if (exact) return exact;
    const base = l.split('-')[0]; if (ALIAS[base]) return ALIAS[base]; const b = LANGS.find(x => x.toLowerCase() === base); if (b) return b;
  }
  try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (TZ_LANG[tz]) return TZ_LANG[tz]; } catch { }
  return 'en';
}
async function loadDict(lang) {
  if (I18N.loaded[lang]) return I18N.loaded[lang];
  let d = globalThis.AERO_I18N?.[lang];
  if (!d) { try { const r = await fetch(`i18n/${lang}.json`, { cache: 'no-cache' }); if (r.ok) d = await r.json(); } catch { } }
  I18N.loaded[lang] = d || {}; return I18N.loaded[lang];
}
function t(key, vars) {
  let s = I18N.dict[key] ?? I18N.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return s;
}
async function loadCrewDict(lang) {   // Crew Lab mission texts (crew mode only)
  let d = globalThis.AERO_CREW_I18N?.[lang];
  if (!d) { try { const r = await fetch(`i18n/crew/${lang}.json`, { cache: 'no-cache' }); if (r.ok) d = await r.json(); } catch { } }
  return d || {};
}
async function setLang(lang) {
  I18N.en = await loadDict('en'); I18N.dict = await loadDict(lang); I18N.lang = lang;
  if (globalThis.AERO_CREW) { const ce = await loadCrewDict('en'), cl = lang === 'en' ? ce : await loadCrewDict(lang); for (const [k, v] of Object.entries(ce)) if (k[0] !== '_') I18N.en[k] = v; for (const [k, v] of Object.entries(cl)) if (k[0] !== '_') I18N.dict[k] = v; }
  const dir = I18N.dict._dir || 'ltr'; document.documentElement.lang = lang; document.documentElement.dir = dir; document.documentElement.dataset.dir = dir;
  applyI18n(document); document.title = t('app.title');
}
function applyI18n(root) {
  for (const el of $$('[data-i18n]', root)) el.textContent = t(el.dataset.i18n);
  for (const el of $$('[data-i18n-ph]', root)) el.placeholder = t(el.dataset.i18nPh);
  for (const el of $$('[data-i18n-title]', root)) { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', el.title); }
}
const isZh = () => I18N.lang.startsWith('zh');
/* Place names: Chinese names for Chinese readers, English otherwise; UNESCO sites get a Wikidata label in the viewer's language. */
function placeName(p) {
  if (!p) return '';
  if (I18N.lang === 'zh-Hans' && p.zhs) return p.zhs;
  if (isZh()) return p.zh;
  return I18N.names[p.id + '|' + I18N.lang] || p.en || p.zh;
}
async function localizePlace(p) {
  const key = p.id + '|' + I18N.lang; if (isZh() || I18N.names[key] !== undefined || !p.id.startsWith('unesco-')) return placeName(p);
  I18N.names[key] = '';
  try {
    const n = p.id.split('-')[1];
    const s = await fetchJSON(`https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=haswbstatement:P757=${n}&format=json&origin=*&srlimit=1`, { timeout: 8000 });
    const q = s.query?.search?.[0]?.title; if (!q) return placeName(p);
    const e = await fetchJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${q}&props=labels&languages=${encodeURIComponent(I18N.lang.split('-')[0])}&format=json&origin=*`, { timeout: 8000 });
    const lab = Object.values(e.entities?.[q]?.labels || {})[0]?.value; if (lab) I18N.names[key] = lab;
  } catch { }
  return placeName(p);
}
const catName = c => t('cat.' + c) !== 'cat.' + c ? t('cat.' + c) : (CAT[c] && isZh() ? CAT[c] : c);
/* Regions: Taiwan counties in Chinese for Chinese readers and in English otherwise; other countries via Intl in the viewer's language */
const TW_COUNTY = { '南投縣': ['南投县', 'Nantou County'], '嘉義市': ['嘉义市', 'Chiayi City'], '嘉義縣': ['嘉义县', 'Chiayi County'], '基隆市': ['基隆市', 'Keelung City'], '宜蘭縣': ['宜兰县', 'Yilan County'],
  '屏東縣': ['屏东县', 'Pingtung County'], '彰化縣': ['彰化县', 'Changhua County'], '新北市': ['新北市', 'New Taipei City'], '新竹市': ['新竹市', 'Hsinchu City'], '新竹縣': ['新竹县', 'Hsinchu County'],
  '桃園市': ['桃园市', 'Taoyuan City'], '澎湖縣': ['澎湖县', 'Penghu County'], '臺中市': ['台中市', 'Taichung City'], '臺北市': ['台北市', 'Taipei City'], '臺南市': ['台南市', 'Tainan City'],
  '臺東縣': ['台东县', 'Taitung County'], '花蓮縣': ['花莲县', 'Hualien County'], '苗栗縣': ['苗栗县', 'Miaoli County'], '連江縣': ['连江县', 'Lienchiang County (Matsu)'], '金門縣': ['金门县', 'Kinmen County'],
  '雲林縣': ['云林县', 'Yunlin County'], '高雄市': ['高雄市', 'Kaohsiung City'] };
const _dn = {};
function regionName(cc) {
  if (!cc) return ''; const L = I18N.lang;
  try { _dn[L] ||= new Intl.DisplayNames([L], { type: 'region' }); return cc.split(/,\s*/).map(c => { try { return _dn[L].of(c) || c; } catch { return c; } }).join(', '); } catch { return cc; }
}
function placeRegion(p) {
  if (!p) return '';
  if (p.cc === 'TW' && TW_COUNTY[p.region]) { const c = TW_COUNTY[p.region]; return I18N.lang === 'zh-Hant' ? p.region : I18N.lang === 'zh-Hans' ? c[0] : `${c[1]}, ${regionName('TW')}`; }
  return regionName(p.cc) || p.region || '';
}
/* the other script of the name, shown small under the main one (e.g. Chinese under an English name) */
function placeAltName(p) { const n = placeName(p); if (isZh()) return p.en && p.en !== n ? p.en : ''; return p.zh && p.zh !== n ? p.zh : ''; }
function placeLine(p) { return [placeRegion(p), catName(p.cat)].filter(Boolean).join(' · '); }
const fmtDist = m => m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
const COMPASS8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compassWord = deg => t('dir.' + COMPASS8[Math.round(((deg % 360) + 360) % 360 / 45) % 8]);

/* ======================= DEM (Terrarium) + chunked LOD terrain with satellite imagery ======================= */
const DEM_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const IMG_URL = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
const DEM_MAX_Z = 14;
const DEM = {
  cache: new Map(), pending: new Map(), canvas: null, ctx: null, fails: 0,
  key: (z, x, y) => z + '/' + x + '/' + y,
  async load(z, x, y) {
    const k = this.key(z, x, y); if (this.cache.has(k)) return this.cache.get(k); if (this.pending.has(k)) return this.pending.get(k);
    const p = (async () => {
      try {
        const r = await fetch(DEM_URL(z, x, y), { credentials: 'omit' }); if (!r.ok) throw new Error('DEM ' + r.status);
        const bmp = await createImageBitmap(await r.blob());
        if (!this.ctx) { this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = 256; this.ctx = this.canvas.getContext('2d', { willReadFrequently: true }); }
        this.ctx.clearRect(0, 0, 256, 256); this.ctx.drawImage(bmp, 0, 0, 256, 256); bmp.close?.();
        const d = this.ctx.getImageData(0, 0, 256, 256).data, h = new Float32Array(65536);
        for (let i = 0; i < 65536; i++) h[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
        this.cache.set(k, h); return h;
      } catch (e) { this.fails++; const h = null; this.cache.set(k, h); return h; }
      finally { this.pending.delete(k); }
    })();
    this.pending.set(k, p); return p;
  },
  /* bilinear sample of tile data at global fractional tile coords */
  sampleTile(h, fx, fy) {
    const px = clamp(fx * 256 - 0.5, 0, 255), py = clamp(fy * 256 - 0.5, 0, 255);
    const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(255, x0 + 1), y1 = Math.min(255, y0 + 1), tx = px - x0, ty = py - y0;
    const a = h[y0 * 256 + x0], b = h[y0 * 256 + x1], c = h[y1 * 256 + x0], d = h[y1 * 256 + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  },
  heightAt(X, Z) {
    for (let z = DEM_MAX_Z; z >= 6; z--) {
      const [gx, gy] = localToTile(X, Z, z), tx = Math.floor(gx), ty = Math.floor(gy), h = this.cache.get(this.key(z, tx, ty));
      if (h) return this.sampleTile(h, gx - tx, gy - ty);
    }
    return 0;
  },
  prefetch(X, Z, z = DEM_MAX_Z, r = 1) { const [gx, gy] = localToTile(X, Z, z); const tx = Math.floor(gx), ty = Math.floor(gy); const ps = []; for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) ps.push(this.load(z, tx + i, ty + j)); return Promise.all(ps); },
};

/* Terrain material: unlit satellite imagery + DEM-normal relief lit by the real sun/moon, tinted by time of day,
   with season-dependent foliage colour, snow above the snow line, wet ground in rain and caustics under water. */
const TERRAIN_U = {
  uSun: { value: new THREE.Vector3(0, 1, 0) }, uRelief: { value: 0.55 }, uTint: { value: new THREE.Color(1, 1, 1) },
  uSeason: { value: new THREE.Vector4(0, 0, 0, 0) },      // x: autumn colour, y: winter dormancy, z: spring freshness, w: summer lushness
  uSnow: { value: new THREE.Vector2(9000, 0) },           // x: snow line (m), y: amount
  uWet: { value: 0 }, uWaterLevel: { value: -1e4 }, uUnder: { value: 0 }, uTime: { value: 0 },
  uCloud: { value: new THREE.Vector4(0, 2600, 1, 1500) },    // moving cloud shadows: cover, noise scale, sharpness, cloud base (m)
  uCloudOff: { value: new THREE.Vector2() }, uCloudShade: { value: 0 },
  uLamp: { value: new THREE.Vector4(0, -1e4, 0, 30) }, uLampDir: { value: new THREE.Vector4(0, 0, -1, 0.8) }, uLampI: { value: 0 },   // headlight / ROV floodlight on the terrain
};
function terrainMaterial(tex) {
  const m = new THREE.MeshBasicMaterial({ map: tex });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, TERRAIN_U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTN; varying vec3 vTW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTN = normal; vTW = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vTN; varying vec3 vTW; uniform vec3 uSun; uniform float uRelief; uniform vec3 uTint; uniform vec4 uSeason; uniform vec2 uSnow; uniform float uWet, uWaterLevel, uUnder, uTime; uniform vec4 uCloud; uniform vec2 uCloudOff; uniform float uCloudShade; uniform vec4 uLamp, uLampDir; uniform float uLampI;
      float th(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float tn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(th(i), th(i + vec2(1,0)), f.x), mix(th(i + vec2(0,1)), th(i + vec2(1,1)), f.x), f.y); }
      float cfbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * tn(p); p *= 2.03; a *= 0.5; } return s; }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec3 c = diffuseColor.rgb; float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
        float veg = smoothstep(0.02, 0.10, c.g - max(c.r, c.b) * 0.92) * smoothstep(0.02, 0.10, mx - mn);
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        vec3 autumn = mix(vec3(l * 1.25, l * 0.85, l * 0.35), vec3(l * 1.1, l * 0.55, l * 0.25), tn(vTW.xz * 0.02));
        vec3 dormant = mix(vec3(l), vec3(l * 1.05, l * 0.95, l * 0.75), 0.6);
        vec3 spring = c * vec3(1.06, 1.12, 0.92);
        vec3 lush = mix(vec3(l), c, 1.25) * vec3(0.95, 1.04, 0.92);
        vec3 sc = c;
        sc = mix(sc, spring, uSeason.z); sc = mix(sc, lush, uSeason.w);
        sc = mix(sc, autumn, uSeason.x * (0.45 + 0.55 * tn(vTW.xz * 0.006))); sc = mix(sc, dormant, uSeason.y);
        c = mix(c, sc, veg);
        float slope = clamp(normalize(vTN).y, 0.0, 1.0);
        float sn = smoothstep(uSnow.x - 120.0, uSnow.x + 260.0, vTW.y + (tn(vTW.xz * 0.01) - 0.5) * 260.0) * smoothstep(0.55, 0.85, slope) * uSnow.y;
        c = mix(c, vec3(0.93, 0.95, 0.98), sn);
        c *= 1.0 - 0.28 * uWet * (1.0 - sn);
        if (uUnder > 0.5 && vTW.y < uWaterLevel) {
          vec2 q = vTW.xz * 0.18; float k = abs(sin(q.x + uTime * 1.3 + tn(q * 0.7) * 6.0) + sin(q.y * 1.1 - uTime * 1.1 + tn(q * 0.9 + 3.0) * 6.0));
          c = c * vec3(0.55, 0.85, 0.9) + vec3(0.25, 0.32, 0.3) * pow(clamp(1.0 - k * 0.5, 0.0, 1.0), 6.0) * clamp(1.0 - (uWaterLevel - vTW.y) / 40.0, 0.15, 1.0);
        }
        diffuseColor.rgb = c;
      }
      vec3 aeroAlbedo = diffuseColor.rgb;
      float ndl = dot(normalize(vTN), uSun);
      float sunUp = max(uSun.y, 0.08);
      float shade = clamp(0.35 + 0.65 * max(ndl, 0.0) / max(sunUp, 0.35), 0.25, 1.35);
      diffuseColor.rgb *= mix(1.0, shade, uRelief) * uTint;
      if (uCloudShade > 0.0 && uSun.y > 0.05) {             // the same cloud field as the sky deck, projected along the sun
        vec2 cp = vTW.xz + uSun.xz / uSun.y * max(uCloud.w - vTW.y, 0.0);
        float cn = cfbm((cp - uCloudOff) / uCloud.y), cw = mix(0.3, 0.08, uCloud.z);
        float cd = smoothstep(1.0 - uCloud.x - cw * 0.4, 1.0 - uCloud.x + cw, cn);
        diffuseColor.rgb *= 1.0 - cd * uCloudShade;
      }
      if (uLampI > 0.0) { vec3 LL = vTW - uLamp.xyz; float ld = max(length(LL), 0.01);
        float sp = smoothstep(uLampDir.w, mix(uLampDir.w, 1.0, 0.35), dot(LL / ld, uLampDir.xyz)), fall = clamp(1.0 - ld / uLamp.w, 0.0, 1.0);
        diffuseColor.rgb += aeroAlbedo * vec3(1.0, 0.96, 0.88) * uLampI * sp * fall * fall; }`);
  };
  m.customProgramCacheKey = () => 'aero-terrain-v6';
  return m;
}
const TEX_LOADER = new THREE.TextureLoader().setCrossOrigin('anonymous');
let MAX_ANISO = 4;
class TNode {
  constructor(z, x, y, parent) { this.z = z; this.x = x; this.y = y; this.parent = parent; this.b = tileBounds(z, x, y); this.size = this.b.X1 - this.b.X0; this.children = null; this.mesh = null; this.state = 0; this.hmin = 0; this.hmax = 0; this.last = 0; this.noSplit = false; }
}
const TERRAIN = {
  group: new THREE.Group(), roots: [], loaded: new Set(), queue: new Set(), active: 0, maxActive: 8, maxZ: 18, factor: 2.2, seg: 32, frame: 0, ready: false,
  imgFails: 0, imgOK: 0,
  init(rootZ = 9) {
    this.dispose(); this.roots = [];
    const [gx, gy] = localToTile(0, 0, rootZ), cx = Math.floor(gx), cy = Math.floor(gy);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const n = new TNode(rootZ, cx + i, cy + j, null); n.root = true; this.roots.push(n); this.request(n); }
  },
  dispose() { for (const n of this.loaded) this.unload(n); this.loaded.clear(); this.queue.clear(); this.group.clear(); },
  request(n) { if (n.state === 0) { n.state = 1; this.queue.add(n); } },
  async load(n) {
    this.active++;
    try {
      const dz = Math.min(n.z, DEM_MAX_Z), s = n.z - dz, ax = n.x >> s, ay = n.y >> s;
      const [h, tex] = await Promise.all([DEM.load(dz, ax, ay), n.z <= 19 ? TEX_LOADER.loadAsync(IMG_URL(n.z, n.x, n.y)).then(t => (this.imgOK++, t)).catch(() => (this.imgFails++, null)) : null]);
      if (!tex) { this.fail(n); return; }
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = MAX_ANISO; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      n.mesh = new THREE.Mesh(this.geometry(n, h, dz, s, ax, ay), terrainMaterial(tex)); n.mesh.matrixAutoUpdate = false; n.mesh.visible = false; n.mesh.renderOrder = 0;
      this.group.add(n.mesh); this.loaded.add(n); n.state = 2;
    } catch (e) { this.fail(n); console.warn('terrain', e); }
    finally { this.active--; }
  },
  fail(n) { n.fails = (n.fails || 0) + 1; n.state = 3; n.retryAt = performance.now() + (n.z >= 17 && n.fails >= 2 ? 1e12 : 3000 * n.fails); },
  geometry(n, h, dz, s, ax, ay) {
    const N = this.seg, n1 = N + 1, { X0, Z0 } = n.b, size = n.size, k = 2 ** s;
    const H = new Float32Array(n1 * n1); let hmin = 1e9, hmax = -1e9;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      let v = 0; if (h) { const fx = ((n.x - ax * k) + i / N) / k, fy = ((n.y - ay * k) + j / N) / k; v = DEM.sampleTile(h, fx, fy); }
      H[j * n1 + i] = v; if (v < hmin) hmin = v; if (v > hmax) hmax = v;
    }
    n.hmin = hmin; n.hmax = hmax;
    const skirt = Math.max(8, size * 0.015), vc = n1 * n1 + 4 * n1;
    const pos = new Float32Array(vc * 3), nrm = new Float32Array(vc * 3), uv = new Float32Array(vc * 2), d = size / N;
    const put = (vi, i, j, y) => {
      pos[vi * 3] = X0 + i * d; pos[vi * 3 + 1] = y; pos[vi * 3 + 2] = Z0 + j * d; uv[vi * 2] = i / N; uv[vi * 2 + 1] = 1 - j / N;
      const hl = H[j * n1 + Math.max(0, i - 1)], hr = H[j * n1 + Math.min(N, i + 1)], hu = H[Math.max(0, j - 1) * n1 + i], hd = H[Math.min(N, j + 1) * n1 + i];
      const dx = (hr - hl) / ((Math.min(N, i + 1) - Math.max(0, i - 1)) * d), dzz = (hd - hu) / ((Math.min(N, j + 1) - Math.max(0, j - 1)) * d);
      const l = Math.hypot(dx, 1, dzz); nrm[vi * 3] = -dx / l; nrm[vi * 3 + 1] = 1 / l; nrm[vi * 3 + 2] = -dzz / l;
    };
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) put(j * n1 + i, i, j, H[j * n1 + i]);
    const edges = [[0, 0, 1, 0], [N, 0, 0, 1], [N, N, -1, 0], [0, N, 0, -1]]; let vi = n1 * n1; const skirtStart = [];
    for (const [i0, j0, di, dj] of edges) { skirtStart.push(vi); for (let t = 0; t <= N; t++) { const i = i0 + di * t, j = j0 + dj * t; put(vi++, i, j, H[j * n1 + i] - skirt); } }
    const idx = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * n1 + i, b = a + 1, c = a + n1, e = c + 1; idx.push(a, c, b, b, c, e); }
    edges.forEach(([i0, j0, di, dj], q) => { for (let t = 0; t < N; t++) { const i = i0 + di * t, j = j0 + dj * t, a = j * n1 + i, b = (j + dj) * n1 + (i + di), sa = skirtStart[q] + t, sb = sa + 1; idx.push(a, b, sa, sa, b, sb, a, sa, b, b, sa, sb); } });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeBoundingSphere(); return g;
  },
  unload(n) { if (n.mesh) { this.group.remove(n.mesh); n.mesh.geometry.dispose(); n.mesh.material.map?.dispose(); n.mesh.material.dispose(); n.mesh = null; } n.state = 0; this.loaded.delete(n); },
  dist(n, p) { const b = n.b; const dx = Math.max(b.X0 - p.x, 0, p.x - b.X1), dz = Math.max(b.Z0 - p.z, 0, p.z - b.Z1), dy = Math.max(n.hmin - p.y, 0, p.y - n.hmax); return Math.hypot(dx, dy, dz); },
  update(cam) {
    const f = ++this.frame, p = cam.position;
    for (const n of this.loaded) n.mesh.visible = false;
    const visit = n => {
      n.last = f;
      const d = this.dist(n, p);
      if (n.z < this.maxZ && d < n.size * this.factor) {
        if (!n.children) n.children = [0, 1, 2, 3].map(q => new TNode(n.z + 1, n.x * 2 + (q & 1), n.y * 2 + (q >> 1), n));
        let ready = true, blocked = false; const now = performance.now();
        for (const c of n.children) {
          if (c.state === 3) { if (c.fails < 3 && now > c.retryAt) c.state = 0; else if (c.fails >= 3 || c.retryAt > 1e11) blocked = true; }
          if (c.state === 0) this.request(c);
          if (c.state !== 2) ready = false;
        }
        if (ready && !blocked) { for (const c of n.children) visit(c); return; }
      }
      if (n.mesh) n.mesh.visible = true;
    };
    let rootsReady = 0;
    for (const r of this.roots) { if (r.state === 2) { rootsReady++; visit(r); } }
    this.ready = rootsReady > 0;
    // start loads, nearest first
    if (this.queue.size && this.active < this.maxActive) {
      const list = [...this.queue].sort((a, b) => this.dist(a, p) - this.dist(b, p));
      for (const n of list) { if (this.active >= this.maxActive) break; this.queue.delete(n); if (n.parent && n.parent.last < f - 2 && !n.root) { n.state = 0; continue; } this.load(n); }
    }
    if (f % 120 === 0) this.prune(f);
  },
  prune(f) {
    for (const n of [...this.loaded]) if (!n.root && f - n.last > 360) this.unload(n);
    const clean = n => { if (!n.children) return; for (const c of n.children) clean(c); if (n.children.every(c => c.state === 0 && !c.children) && f - n.last > 360) n.children = null; };
    for (const r of this.roots) clean(r);
  },
  stats() { let vis = 0; for (const n of this.loaded) if (n.mesh.visible) vis++; return { loaded: this.loaded.size, visible: vis, queue: this.queue.size, active: this.active }; },
};

/* ======================= OpenStreetMap vector tiles (OpenFreeMap / OpenMapTiles schema) ======================= */
/* Minimal Mapbox Vector Tile decoder: layers, features, tags, geometry. */
function decodeMVT(buf, want) {
  const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), td = new TextDecoder();
  let pos = 0;
  const varint = () => { let r = 0, s = 1, b; do { b = u8[pos++]; r += (b & 0x7f) * s; s *= 128; } while (b & 0x80); return r; };
  const skip = wt => { if (wt === 0) varint(); else if (wt === 1) pos += 8; else if (wt === 2) pos += varint(); else if (wt === 5) pos += 4; else throw new Error('wire ' + wt); };
  const zz = n => (n % 2 === 1 ? -(n + 1) / 2 : n / 2);
  const layers = {};
  while (pos < u8.length) {
    const tag = varint(), f = Math.floor(tag / 8), wt = tag & 7;
    if (f === 3 && wt === 2) {
      const len = varint(), end = pos + len; let name = '', extent = 4096; const keys = [], vals = [], feats = [];
      while (pos < end) {
        const t2 = varint(), f2 = Math.floor(t2 / 8), w2 = t2 & 7;
        if (f2 === 1) { const l = varint(); name = td.decode(u8.subarray(pos, pos + l)); pos += l; }
        else if (f2 === 2) { const l = varint(); feats.push([pos, pos + l]); pos += l; }
        else if (f2 === 3) { const l = varint(); keys.push(td.decode(u8.subarray(pos, pos + l))); pos += l; }
        else if (f2 === 4) {
          const l = varint(), e2 = pos + l; let v = null;
          while (pos < e2) {
            const t3 = varint(), f3 = Math.floor(t3 / 8), w3 = t3 & 7;
            if (f3 === 1) { const l3 = varint(); v = td.decode(u8.subarray(pos, pos + l3)); pos += l3; }
            else if (f3 === 2) { v = dv.getFloat32(pos, true); pos += 4; } else if (f3 === 3) { v = dv.getFloat64(pos, true); pos += 8; }
            else if (f3 === 4 || f3 === 5) v = varint(); else if (f3 === 6) v = zz(varint()); else if (f3 === 7) v = !!varint(); else skip(w3);
          }
          vals.push(v);
        }
        else if (f2 === 5) extent = varint(); else skip(w2);
      }
      if (!want || want.includes(name)) {
        const out = [];
        for (const [s, e] of feats) {
          pos = s; let type = 0, tags = [], geom = [];
          while (pos < e) {
            const t2 = varint(), f2 = Math.floor(t2 / 8), w2 = t2 & 7;
            if (f2 === 2 || f2 === 4) { const l = varint(), e2 = pos + l, arr = []; while (pos < e2) arr.push(varint()); if (f2 === 2) tags = arr; else geom = arr; }
            else if (f2 === 3) type = varint(); else skip(w2);
          }
          const props = {}; for (let i = 0; i + 1 < tags.length; i += 2) props[keys[tags[i]]] = vals[tags[i + 1]];
          const rings = []; let x = 0, y = 0, ring = null;
          for (let i = 0; i < geom.length;) {
            const c = geom[i++], cmd = c & 7, cnt = c >> 3;
            if (cmd === 1 || cmd === 2) { for (let k = 0; k < cnt; k++) { x += zz(geom[i++]); y += zz(geom[i++]); if (cmd === 1) { ring = [[x, y]]; rings.push(ring); } else ring.push([x, y]); } }
            else if (cmd === 7 && ring) ring.push([ring[0][0], ring[0][1]]);
          }
          out.push({ type, props, rings });
        }
        layers[name] = { extent, features: out };
      }
      pos = end;
    } else skip(wt);
  }
  return layers;
}
const ringArea = r => { let a = 0; for (let i = 0, n = r.length; i < n - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };
function polygonsOf(rings) { const polys = []; for (const r of rings) { if (r.length < 4) continue; const a = ringArea(r); if (a > 0 || !polys.length) polys.push([r]); else polys[polys.length - 1].push(r); } return polys; }
function pointInRing(x, z, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; }

/* Facade texture: one 4×4 block of bays/floors; roofs sample the solid corner. */
function facadeTextures() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const e = document.createElement('canvas'); e.width = e.height = S; const ge = e.getContext('2d');
  g.fillStyle = '#e6e2da'; g.fillRect(0, 0, S, S); ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 4; fx++) {
    const x = fx * 64, y = fy * 64; if (fx === 0 && fy === 3) continue;
    g.fillStyle = '#3a4650'; g.fillRect(x + 14, y + 14, 36, 34); g.fillStyle = 'rgba(160,190,210,.35)'; g.fillRect(x + 14, y + 14, 36, 10);
    g.fillStyle = '#cfcac0'; g.fillRect(x + 10, y + 50, 44, 4);
    if (rnd() < 0.45) { ge.fillStyle = rnd() < 0.7 ? '#ffd28a' : '#cfe3ff'; ge.fillRect(x + 14, y + 14, 36, 34); }
  }
  const t = new THREE.CanvasTexture(c), te = new THREE.CanvasTexture(e);
  for (const x of [t, te]) { x.wrapS = x.wrapT = THREE.RepeatWrapping; x.colorSpace = THREE.SRGBColorSpace; x.anisotropy = MAX_ANISO; }
  return { map: t, emissive: te };
}
let FACADE = null;
const BUILDING_MAT = () => new THREE.MeshLambertMaterial({ map: FACADE.map, emissiveMap: FACADE.emissive, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, vertexColors: true, side: THREE.DoubleSide });
const ROOF_UV = [0.05, 0.05];
const WALL_TINTS = ['#d9d4c9', '#c9c2b4', '#bdb6aa', '#d6cfc0', '#b9bec4', '#c4b3a2', '#a9b4bd'], ROOF_TINTS = ['#8c8a86', '#9b9790', '#7d7f80', '#a3998c', '#86786b', '#6f7d86'];
const WATER_CLASSES = new Set(['lake', 'river', 'pond', 'dock', 'swimming_pool', 'ocean', 'canal', 'reservoir', 'basin', 'lagoon', 'water']);

const VEC = {
  group: new THREE.Group(), tiles: new Map(), url: null, z: 14, radius: 1, enabled: true, mat: null, waterMat: null, last: 0,
  bgrid: new Map(), rgrid: new Map(), waters: [], cell: 60, status: '',
  async init() {
    if (this.url) return;
    try { const tj = await fetchJSON('https://tiles.openfreemap.org/planet', { timeout: 15000 }); this.url = tj.tiles?.[0] || null; this.status = this.url ? '' : 'no tiles'; }
    catch (e) { this.status = 'OpenFreeMap: ' + e.message; }
  },
  reset() { for (const t of this.tiles.values()) this.drop(t); this.tiles.clear(); this.bgrid.clear(); this.rgrid.clear(); this.waters = []; },
  drop(t) { if (t.mesh) { this.group.remove(t.mesh); t.mesh.geometry.dispose(); } if (t.water) { this.group.remove(t.water); t.water.geometry.dispose(); } },
  update(px, pz, agl) {
    if (!this.url || !this.enabled) return;
    const [gx, gy] = localToTile(px, pz, this.z), cx = Math.floor(gx), cy = Math.floor(gy), r = agl > 1500 ? 0 : this.radius;
    const keep = new Set();
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const k = `${cx + i}/${cy + j}`; keep.add(k); if (!this.tiles.has(k)) { const t = { x: cx + i, y: cy + j, state: 1 }; this.tiles.set(k, t); this.load(t); } }
    if (this.tiles.size > 30) for (const [k, t] of this.tiles) if (!keep.has(k) && t.state === 2) { this.drop(t); this.unindex(t); this.tiles.delete(k); }
  },
  async load(t) {
    try {
      const u = this.url.replace('{z}', this.z).replace('{x}', t.x).replace('{y}', t.y);
      const r = await fetch(u, { credentials: 'omit' }); if (!r.ok) throw new Error('MVT ' + r.status);
      let buf = await r.arrayBuffer(); const b8 = new Uint8Array(buf);
      if (b8[0] === 0x1f && b8[1] === 0x8b) buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      const L = decodeMVT(buf, ['building', 'transportation', 'transportation_name', 'water']);
      await DEM.load(Math.min(this.z, DEM_MAX_Z), t.x, t.y);
      this.build(t, L); t.state = 2;
    } catch (e) { t.state = 3; console.warn('vector tile', e.message); }
  },
  build(t, L) {
    const b = tileBounds(this.z, t.x, t.y), W = b.X1 - b.X0;
    const toXZ = (ext, p) => [b.X0 + p[0] / ext * W, b.Z0 + p[1] / ext * W];
    t.buildings = []; t.roads = []; t.waterPolys = [];
    // ---- buildings
    const bl = L.building; const P = [], N = [], U = [], C = []; const col = new THREE.Color();
    if (bl) for (const f of bl.features) {
      if (f.type !== 3 || f.props.hide_3d) continue;
      const h = +f.props.render_height || (+f.props.levels ? +f.props.levels * 3.2 : 8), mh = +f.props.render_min_height || 0;
      for (const poly of polygonsOf(f.rings)) {
        const rings = poly.map(r => r.map(p => toXZ(bl.extent, p))); const outer = rings[0];
        let base = 1e9, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
        for (const [x, z] of outer) { base = Math.min(base, DEM.heightAt(x, z)); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
        if (maxX - minX > 600 || maxZ - minZ > 600) continue;
        base -= 0.6; const y0 = base + mh, y1 = base + h + 0.6;
        const seed = Math.abs(Math.round(minX * 7 + maxZ * 13)) % 997;
        const wall = col.set(h > 45 ? '#a9b8c4' : WALL_TINTS[seed % WALL_TINTS.length]).clone(), roof = col.set(ROOF_TINTS[seed % ROOF_TINTS.length]).clone();
        for (const r of rings) {
          let acc = 0;
          for (let i = 0; i < r.length - 1; i++) {
            const [ax, az] = r[i], [bx, bz] = r[i + 1], len = Math.hypot(bx - ax, bz - az); if (len < 0.05) continue;
            const nx = (bz - az) / len, nz = -(bx - ax) / len, u0 = acc / 14.4, u1 = (acc + len) / 14.4, v0 = (y0 - base) / 12.8, v1 = (y1 - base) / 12.8; acc += len;
            const quad = [[ax, y0, az, u0, v0], [bx, y0, bz, u1, v0], [bx, y1, bz, u1, v1], [ax, y0, az, u0, v0], [bx, y1, bz, u1, v1], [ax, y1, az, u0, v1]];
            for (const [x, y, z, u, v] of quad) { P.push(x, y, z); N.push(nx, 0, nz); U.push(u, v); C.push(wall.r, wall.g, wall.b); }
          }
        }
        const contour = outer.slice(0, -1).map(([x, z]) => new THREE.Vector2(x, z)), holes = rings.slice(1).map(r => r.slice(0, -1).map(([x, z]) => new THREE.Vector2(x, z)));
        try {
          const tris = THREE.ShapeUtils.triangulateShape(contour, holes), all = contour.concat(...holes);
          for (const tri of tris) for (const k of [tri[0], tri[2], tri[1]]) { const v = all[k]; P.push(v.x, y1, v.y); N.push(0, 1, 0); U.push(ROOF_UV[0], ROOF_UV[1]); C.push(roof.r, roof.g, roof.b); }   // wound to face up (+Y)
        } catch { }
        t.buildings.push({ ring: outer, minX, maxX, minZ, maxZ, top: y1, base: y0 });
      }
    }
    if (P.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.computeBoundingSphere();
      t.mesh = new THREE.Mesh(g, this.mat); t.mesh.matrixAutoUpdate = false; this.group.add(t.mesh);
    }
    // ---- roads (for the car: on-road friction, road names, spawn)
    const names = new Map();
    for (const f of (L.transportation_name?.features || [])) for (const r of f.rings) { const P = f.props, lb = I18N.lang.split('-')[0], n = (isZh() ? P['name:' + I18N.lang] || P['name:zh-Hant'] || P['name:zh'] : P['name:' + lb] || P['name:en'] || P.name_en || P['name:latin']) || P.name || P.ref; if (n) for (const p of r) names.set((p[0] >> 4) + ',' + (p[1] >> 4), (f.props.ref && f.props.name && f.props.ref !== f.props.name) ? `${n} (${f.props.ref})` : n); }
    const tl = L.transportation;
    if (tl) for (const f of tl.features) {
      if (f.type !== 2 || ['rail', 'transit', 'ferry', 'path', 'aerialway'].includes(f.props.class) || f.props.brunnel === 'tunnel') continue;
      for (const r of f.rings) for (let i = 0; i < r.length - 1; i++) {
        const a = toXZ(tl.extent, r[i]), c = toXZ(tl.extent, r[i + 1]);
        const nm = names.get((r[i][0] >> 4) + ',' + (r[i][1] >> 4)) || names.get((r[i + 1][0] >> 4) + ',' + (r[i + 1][1] >> 4)) || '';
        t.roads.push({ ax: a[0], az: a[1], bx: c[0], bz: c[1], cls: f.props.class, name: nm });
      }
    }
    // ---- inland water polygons (lakes, rivers, reservoirs); level from the DEM
    const wl = L.water; const WP = [];
    if (wl) for (const f of wl.features) {
      if (f.type !== 3) continue; const cls = f.props.class || 'water'; if (!WATER_CLASSES.has(cls)) continue;
      for (const poly of polygonsOf(f.rings)) {
        const rings = poly.map(r => r.map(p => toXZ(wl.extent, p))); const outer = rings[0];
        const hs = outer.map(([x, z]) => DEM.heightAt(x, z)).sort((a, b) => a - b); const level = cls === 'ocean' ? 0 : hs[Math.floor(hs.length * 0.3)] ?? 0;
        let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9; for (const [x, z] of outer) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
        t.waterPolys.push({ rings, level, cls, minX, maxX, minZ, maxZ, tb: b });
        if (cls === 'ocean' || level < 0.6) continue;
        try {
          const contour = outer.slice(0, -1).map(([x, z]) => new THREE.Vector2(x, z)), holes = rings.slice(1).map(r => r.slice(0, -1).map(([x, z]) => new THREE.Vector2(x, z)));
          const tris = THREE.ShapeUtils.triangulateShape(contour, holes), all = contour.concat(...holes);
          for (const tri of tris) for (const k of [tri[0], tri[2], tri[1]]) { const v = all[k]; WP.push(v.x, level + 0.35, v.y); }
        } catch { }
      }
    }
    if (WP.length && this.waterMat) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(WP, 3)); g.computeBoundingSphere(); t.water = new THREE.Mesh(g, this.waterMat); t.water.matrixAutoUpdate = false; t.water.renderOrder = 1; this.group.add(t.water); }
    this.index(t);
  },
  index(t) {
    const c = this.cell, add = (grid, item, minX, maxX, minZ, maxZ) => { for (let i = Math.floor(minX / c); i <= Math.floor(maxX / c); i++) for (let j = Math.floor(minZ / c); j <= Math.floor(maxZ / c); j++) { const k = i + ',' + j; let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(item); } };
    for (const bd of t.buildings) add(this.bgrid, bd, bd.minX, bd.maxX, bd.minZ, bd.maxZ);
    for (const rd of t.roads) add(this.rgrid, rd, Math.min(rd.ax, rd.bx), Math.max(rd.ax, rd.bx), Math.min(rd.az, rd.bz), Math.max(rd.az, rd.bz));
    for (const w of t.waterPolys) this.waters.push(w);
  },
  unindex(t) {
    const rm = (grid, set) => { for (const [k, a] of grid) { const f = a.filter(x => !set.has(x)); if (f.length) grid.set(k, f); else grid.delete(k); } };
    rm(this.bgrid, new Set(t.buildings || [])); rm(this.rgrid, new Set(t.roads || [])); const ws = new Set(t.waterPolys || []); this.waters = this.waters.filter(w => !ws.has(w));
    for (const w of ws) if (w.bed) { this.group.remove(w.bed.mesh); w.bed.mesh.geometry.dispose(); }
  },
  /* Lake beds: elevation data only has the lake surface, so a plausible basin is synthesised (deeper away from the real
     shoreline, max depth from the lake size: ~28 m for Sun Moon Lake). Built on demand for the underwater drone. */
  bedTex: null,
  lakeBed(w) {
    if (w.bed !== undefined) return w.bed;
    if (w.cls === 'ocean' || w.level < 0.6) return (w.bed = null);
    const eps = 2, tb = w.tb, segs = [], near = this.waters.filter(o => o.cls !== 'ocean' && Math.abs(o.level - w.level) < 1.5 && o.maxX > w.minX - 3000 && o.minX < w.maxX + 3000 && o.maxZ > w.minZ - 3000 && o.minZ < w.maxZ + 3000);
    let area = 0;
    for (const o of near) for (const r of o.rings) { area += Math.abs(ringArea(r)) * (r === o.rings[0] ? 1 : -1);   // the whole lake, also the parts in neighbouring tiles
      for (let i = 0; i < r.length - 1; i++) { const [ax, az] = r[i], [bx, bz] = r[i + 1], b = o.tb;   // skip the straight cuts along vector-tile borders: they are not shore
        if ((ax <= b.X0 + eps && bx <= b.X0 + eps) || (ax >= b.X1 - eps && bx >= b.X1 - eps) || (az <= b.Z0 + eps && bz <= b.Z0 + eps) || (az >= b.Z1 - eps && bz >= b.Z1 - eps)) continue;
        segs.push(ax, az, bx, bz); } }
    const R = Math.sqrt(Math.max(area, 100) / Math.PI), maxD = clamp(R * 0.018, 2, 40), k = Math.max(15, R * 0.25);
    const N = 48, X0 = w.minX - 4, Z0 = w.minZ - 4, sx = (w.maxX - w.minX + 8) / N, sz = (w.maxZ - w.minZ + 8) / N, H = new Float32Array((N + 1) * (N + 1));
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = X0 + i * sx, z = Z0 + j * sz; let d = 1e9;
      for (let q = 0; q < segs.length; q += 4) { const ax = segs[q], az = segs[q + 1], dx = segs[q + 2] - ax, dz = segs[q + 3] - az, L2 = dx * dx + dz * dz || 1, tt = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1), e = Math.hypot(ax + dx * tt - x, az + dz * tt - z); if (e < d) d = e; }
      const inside = pointInRing(x, z, w.rings[0]) && !w.rings.slice(1).some(h => pointInRing(x, z, h));
      const y = inside ? w.level - Math.max(0.4, maxD * (1 - Math.exp(-d / k))) : w.level - 0.3;
      H[j * (N + 1) + i] = y; pos.push(x, y, z); uv.push(x / 9, z / 9);
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
    if (!this.bedTex) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#6f6a52'; x.fillRect(0, 0, 64, 64); for (let i = 0; i < 700; i++) { const v = 70 + Math.random() * 60; x.fillStyle = `rgb(${v + 20},${v + 14},${v - 10})`; x.fillRect(Math.random() * 64, Math.random() * 64, 1 + Math.random() * 2, 1 + Math.random() * 2); } this.bedTex = new THREE.CanvasTexture(c); this.bedTex.wrapS = this.bedTex.wrapT = THREE.RepeatWrapping; this.bedTex.colorSpace = THREE.SRGBColorSpace; }
    const mesh = new THREE.Mesh(g, terrainMaterial(this.bedTex)); mesh.matrixAutoUpdate = false; this.group.add(mesh);
    return (w.bed = { mesh, H, X0, Z0, sx, sz, N, maxD });
  },
  bedAt(x, z) {
    const w = this.waterAt(x, z); if (!w) return null; const b = this.lakeBed(w); if (!b) return null;
    const fx = clamp((x - b.X0) / b.sx, 0, b.N - 1e-6), fz = clamp((z - b.Z0) / b.sz, 0, b.N - 1e-6), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, n = b.N + 1, H = b.H;
    return (H[j * n + i] * (1 - u) + H[j * n + i + 1] * u) * (1 - v) + (H[(j + 1) * n + i] * (1 - u) + H[(j + 1) * n + i + 1] * u) * v;
  },
  roofAt(x, z) {
    const a = this.bgrid.get(Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell)); if (!a) return null; let best = null;
    for (const b of a) if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && pointInRing(x, z, b.ring)) if (!best || b.top > best.top) best = b;
    return best;
  },
  road(x, z) {
    const c = this.cell, ci = Math.floor(x / c), cj = Math.floor(z / c); let best = null, bd = 1e9;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = this.rgrid.get((ci + i) + ',' + (cj + j)); if (!a) continue;
      for (const s of a) { const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1, t = clamp(((x - s.ax) * dx + (z - s.az) * dz) / L2, 0, 1), d = Math.hypot(s.ax + dx * t - x, s.az + dz * t - z); if (d < bd) { bd = d; best = s; } } }
    return best ? { dist: bd, name: best.name, cls: best.cls, seg: best } : null;
  },
  waterAt(x, z) { for (const w of this.waters) { if (x < w.minX || x > w.maxX || z < w.minZ || z > w.maxZ) continue; if (pointInRing(x, z, w.rings[0]) && !w.rings.slice(1).some(h => pointInRing(x, z, h))) return w; } return null; },
  nearestRoadPoint(x, z, maxR = 1500) {
    let best = null, bd = 1e9; const pri = { motorway: 3, trunk: 2.5, primary: 2, secondary: 1.6, tertiary: 1.3, minor: 1, service: .6, track: .3 };
    for (const a of this.rgrid.values()) for (const s of a) { const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2, d = Math.hypot(mx - x, mz - z) / (pri[s.cls] || .5); if (d < bd && d < maxR) { bd = d; best = s; } }
    return best ? { x: (best.ax + best.bx) / 2, z: (best.az + best.bz) / 2, h: Math.atan2(-(best.bx - best.ax), -(best.bz - best.az)), seg: best } : null;
  },
};

/* ======================= 3D vegetation from the real imagery ======================= */
/* For terrain tiles near a low-flying camera, read the satellite tile's pixels, find forest-coloured cells and plant
   instanced low-poly trees there (never on OSM buildings, roads or water). Conifers dominate above ~1800 m. */
function treeGeometry(kind) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.035, 0.05, 0.3, 5); trunk.translate(0, 0.15, 0); parts.push([trunk, [0.36, 0.27, 0.19]]);
  if (kind === 'conifer') {
    const c1 = new THREE.ConeGeometry(0.34, 0.62, 7); c1.translate(0, 0.52, 0); parts.push([c1, [1, 1, 1]]);
    const c2 = new THREE.ConeGeometry(0.24, 0.45, 7); c2.translate(0, 0.8, 0); parts.push([c2, [1, 1, 1]]);
  } else {
    const b = new THREE.IcosahedronGeometry(0.36, 0); b.scale(1, 0.85, 1); b.translate(0, 0.62, 0); parts.push([b, [1, 1, 1]]);
    const b2 = new THREE.IcosahedronGeometry(0.24, 0); b2.translate(0.14, 0.82, 0.06); parts.push([b2, [1, 1, 1]]);
  }
  const geos = parts.map(([g, col]) => { const ng = g.index ? g.toNonIndexed() : g; const n = ng.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.set(col, i * 3); ng.setAttribute('color', new THREE.BufferAttribute(c, 3)); ng.deleteAttribute('uv'); return ng; });
  const merged = mergeGeometries(geos); merged.computeVertexNormals(); return merged;
}
const TREES = {
  group: new THREE.Group(), nodes: new Map(), enabled: true, radius: 900, perNode: 1100, canvas: null, ctx: null, geo: {}, mat: null, season: 'summer', lat: 24, buildBudget: 1,
  init() { this.geo.conifer = treeGeometry('conifer'); this.geo.broad = treeGeometry('broad'); this.mat = new THREE.MeshLambertMaterial({ vertexColors: true }); this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = 96; this.ctx = this.canvas.getContext('2d', { willReadFrequently: true }); },
  clear() { for (const v of this.nodes.values()) this.dropEntry(v); this.nodes.clear(); },
  dropEntry(e) { for (const m of e.meshes) { this.group.remove(m); m.dispose(); } },
  setSeason(s, lat) { if (s === this.season && Math.abs(lat - this.lat) < 1) return; this.season = s; this.lat = lat; this.clear(); },
  update(cam, agl) {
    if (!this.mat) this.init();
    const show = this.enabled && agl < 900; this.group.visible = show; if (!show) return;
    const p = cam.position, want = new Set(); let budget = this.buildBudget;
    for (const n of TERRAIN.loaded) {
      if (n.z !== 16 || n.state !== 2 || !n.mesh?.material?.map?.image) continue;
      if (TERRAIN.dist(n, p) > this.radius) continue;
      want.add(n);
      if (!this.nodes.has(n) && budget > 0) { budget--; this.nodes.set(n, this.build(n)); }
    }
    for (const [n, e] of this.nodes) if (!want.has(n)) { this.dropEntry(e); this.nodes.delete(n); }
  },
  build(n) {
    const img = n.mesh.material.map.image, e = { meshes: [] };
    try { this.ctx.clearRect(0, 0, 96, 96); this.ctx.drawImage(img, 0, 0, 96, 96); } catch { return e; }
    let data; try { data = this.ctx.getImageData(0, 0, 96, 96).data; } catch { return e; }
    const { X0, Z0 } = n.b, cell = n.size / 96; let seed = (n.x * 73856093) ^ (n.y * 19349663); const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pts = { conifer: [], broad: [] }, al = Math.abs(this.lat), deciduous = al > 35 ? 0.45 : al > 26 ? 0.25 : 0.06;   // subtropical forests are mostly evergreen
    for (let j = 0; j < 96; j++) for (let i = 0; i < 96; i++) {
      const k = (j * 96 + i) * 4, r = data[k], g = data[k + 1], b = data[k + 2], l = (r + g + b) / 3, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const green = g > r * 1.04 && g > b * 1.08 && mx - mn > 14;
      if (!green) continue;
      const dens = l < 70 ? 0.75 : l < 105 ? 0.42 : l < 140 ? 0.12 : 0.03;
      if (rnd() > dens) continue;
      const x = X0 + (i + rnd()) * cell, z = Z0 + (j + rnd()) * cell;
      if (VEC.roofAt(x, z)) continue; const rd = VEC.road(x, z); if (rd && rd.dist < 6) continue;
      const y = DEM.heightAt(x, z); if (y < 0.5 || VEC.waterAt(x, z)) continue;
      const conifer = y > 1800 ? rnd() < 0.85 : rnd() < 0.2;
      (conifer ? pts.conifer : pts.broad).push([x, y, z, rnd(), rnd(), conifer]);
    }
    const col = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const kind of ['conifer', 'broad']) {
      let list = pts[kind]; if (!list.length) continue;
      if (list.length > this.perNode) { list = list.filter((_, i) => i % Math.ceil(list.length / this.perNode) === 0); }
      const im = new THREE.InstancedMesh(this.geo[kind], this.mat, list.length); im.frustumCulled = true;
      list.forEach(([x, y, z, a, b, conifer], i) => {
        const h = conifer ? 9 + a * 16 : 6 + a * 12, w = h * (conifer ? 0.42 : 0.62);
        q.setFromAxisAngle(up, b * 6.283); sc.set(w, h, w); ps.set(x, y - 0.3, z); m4.compose(ps, q, sc); im.setMatrixAt(i, m4);
        const decid = !conifer && (b < deciduous || (y > 1500 && b < 0.3)); let hex = conifer ? (a < .5 ? '#2f4a2c' : '#3a5432') : (a < .33 ? '#4d6b34' : a < .66 ? '#5a7a3a' : '#466432');
        if (this.season === 'spring' && !conifer) hex = a < .5 ? '#6f9a3e' : '#7fa84a';
        if (this.season === 'autumn' && decid) hex = ['#b8742a', '#c9a13a', '#a3462a', '#8a6a2a'][Math.floor(a * 4)];
        if (this.season === 'winter' && decid) hex = '#6b5a45';
        im.setColorAt(i, col.set(hex));
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere();
      this.group.add(im); e.meshes.push(im);
    }
    return e;
  },
};

/* ======================= sky, sun, moon, weather, clouds, rain, snow, water ======================= */
const SKY_KEYS = [
  { a: -18, zen: '#02040a', hor: '#060a14', sun: '#000000', light: 0.00, amb: 0.06, tint: '#2c3a62', relief: 0.12 },
  { a: -6, zen: '#0e1a3c', hor: '#3a3a5e', sun: '#ff6a3a', light: 0.03, amb: 0.20, tint: '#6a72a8', relief: 0.25 },
  { a: 0, zen: '#2c4a86', hor: '#f08a4b', sun: '#ff8a40', light: 0.40, amb: 0.42, tint: '#f6b088', relief: 0.70 },
  { a: 6, zen: '#3b68b4', hor: '#f6c08a', sun: '#ffb468', light: 0.72, amb: 0.52, tint: '#ffdcb6', relief: 0.65 },
  { a: 20, zen: '#2f6cc9', hor: '#b6d3ec', sun: '#fff0d6', light: 0.95, amb: 0.60, tint: '#fff7ee', relief: 0.52 },
  { a: 50, zen: '#2465c6', hor: '#aecde9', sun: '#ffffff', light: 1.0, amb: 0.64, tint: '#ffffff', relief: 0.45 },
];
function skyAt(alt) {
  const K = SKY_KEYS; if (alt <= K[0].a) return { ...K[0] }; if (alt >= K[K.length - 1].a) return { ...K[K.length - 1] };
  let i = 0; while (alt > K[i + 1].a) i++; const A = K[i], B = K[i + 1], t = (alt - A.a) / (B.a - A.a), o = {};
  for (const k in A) o[k] = typeof A[k] === 'number' ? lerp(A[k], B[k], t) : hexLerp(A[k], B[k], t); return o;
}
const WX = { ok: false, src: 'default', temp: 26, dew: 18, cloud: 20, vis: 30000, wind: 3, windDir: 90, gust: 5, precip: 0, code: 1, isDay: 1, hs: 0.6, wDir: 90, tp: 6, sst: null, time: '', marineOK: false };
/* cloud: % cover · kind: cumulus (puffy, sharp) / stratus (flat, soft) · rain: mm/h · storm: lightning */
const WEATHER_PRESETS = {
  live: {},
  clear: { cloud: 0, vis: 45000, wind: 2, gust: 3, precip: 0, hs: 0.4, kind: 'cumulus' },
  few: { cloud: 18, vis: 38000, wind: 4, gust: 6, precip: 0, hs: 0.6, kind: 'cumulus', base: 1100 },
  partly: { cloud: 42, vis: 28000, wind: 5, gust: 8, precip: 0, hs: 0.8, kind: 'cumulus', base: 900 },
  mostly: { cloud: 72, vis: 20000, wind: 6, gust: 10, precip: 0, hs: 1.0, kind: 'mixed', base: 800 },
  overcast: { cloud: 100, vis: 11000, wind: 6, gust: 10, precip: 0, hs: 1.2, kind: 'stratus', base: 450 },
  lightRain: { cloud: 100, vis: 6000, wind: 6, gust: 11, precip: 1.2, hs: 1.3, kind: 'stratus', base: 380 },
  heavyRain: { cloud: 100, vis: 1800, wind: 10, gust: 17, precip: 12, hs: 2.0, kind: 'stratus', base: 260 },
  storm: { cloud: 100, vis: 2500, wind: 12, gust: 22, precip: 20, hs: 2.6, kind: 'stratus', base: 300, storm: true },
  fog: { cloud: 100, vis: 500, wind: 1, gust: 2, precip: 0, hs: 0.3, kind: 'stratus', base: 60 },
  windy: { cloud: 35, vis: 30000, wind: 13, gust: 20, precip: 0, hs: 2.8, kind: 'cumulus', base: 1000 },
  snow: { cloud: 100, vis: 2500, wind: 5, gust: 9, precip: 2, hs: 1.0, kind: 'stratus', base: 350, snow: true, temp: -2, dew: -4 },
};
const WX_ORDER = ['few', 'clear', 'partly', 'mostly', 'overcast', 'lightRain', 'heavyRain', 'storm', 'fog', 'windy', 'snow', 'live'];
async function fetchWeather(lat, lon) {
  const q = `latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}`;
  const cur = 'temperature_2m,dew_point_2m,precipitation,weather_code,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day';
  const out = { ok: false, marineOK: false };
  try {
    const j = await fetchJSON(`https://api.open-meteo.com/v1/forecast?${q}&current=${cur}&wind_speed_unit=ms&timezone=auto`, { timeout: 12000 });
    const c = j.current || {};
    Object.assign(out, { ok: true, temp: c.temperature_2m, dew: c.dew_point_2m, cloud: c.cloud_cover, vis: c.visibility ?? 25000, wind: c.wind_speed_10m, windDir: c.wind_direction_10m, gust: c.wind_gusts_10m ?? c.wind_speed_10m * 1.5, precip: c.precipitation || 0, code: c.weather_code, isDay: c.is_day, time: c.time });
    out.kind = out.cloud > 85 ? 'stratus' : out.cloud > 55 ? 'mixed' : 'cumulus';
    out.storm = [95, 96, 99].includes(out.code); out.snow = [71, 73, 75, 77, 85, 86].includes(out.code);
  } catch (e) { out.err = e.message; }
  try {
    const m = await fetchJSON(`https://marine-api.open-meteo.com/v1/marine?${q}&current=wave_height,wave_direction,wave_period,sea_surface_temperature`, { timeout: 12000 });
    const c = m.current || {}; if (Number.isFinite(c.wave_height)) Object.assign(out, { marineOK: true, hs: c.wave_height, wDir: c.wave_direction ?? out.windDir, tp: c.wave_period || 6, sst: c.sea_surface_temperature });
  } catch { }
  return out;
}

/* ---- sky dome: HDR sun & moon discs (bloom turns them into glare), stars, lightning flash ---- */
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uMoon: { value: new THREE.Vector3(0, -1, 0) }, uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
      uStars: { value: 0 }, uCloud: { value: 0 }, uMoonLit: { value: 0 }, uFlash: { value: 0 }, uHdr: { value: 1 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 uSun,uMoon,uZen,uHor,uSunCol; uniform float uStars,uCloud,uMoonLit,uFlash,uHdr; varying vec3 vD;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
      void main(){ vec3 d = normalize(vD); float h = d.y;
        vec3 c = mix(uHor, uZen, pow(clamp(h,0.0,1.0), 0.42));
        float sd = max(dot(d, uSun), 0.0), md = max(dot(d, uMoon), 0.0), clear = 1.0 - 0.85 * uCloud;
        c += uSunCol * (pow(sd, 5.0) * 0.22 + pow(sd, 60.0) * 0.5) * (1.0 - 0.6*uCloud);
        c += uSunCol * smoothstep(0.99935, 0.99965, sd) * mix(1.0, 18.0, uHdr) * clear;          // sun disc (HDR)
        float moonA = uMoon.y > -0.05 ? 1.0 : 0.0;
        c += vec3(0.82,0.86,1.0) * smoothstep(0.99955, 0.9998, md) * mix(1.0, 3.0, uHdr) * (0.25 + 0.75*uMoonLit) * clear * moonA;  // moon disc
        c += vec3(0.5,0.58,0.8) * pow(md, 40.0) * 0.18 * uMoonLit * clear * moonA;                 // moon halo
        if (h < 0.0) c = mix(uHor, uHor * 0.75, clamp(-h * 3.0, 0.0, 1.0));
        if (uStars > 0.0 && h > 0.0) { vec3 q = floor(d * 700.0); float s = hash(q); c += vec3(step(0.9982, s) * uStars * (0.4 + 0.6 * hash(q + 1.7))) * clamp(h * 4.0, 0.0, 1.0) * clear; }
        c += vec3(0.75,0.8,1.0) * uFlash * (0.6 + 0.4 * clamp(h * 2.0, 0.0, 1.0));
        gl_FragColor = vec4(uHdr > 0.5 ? c : min(c, vec3(1.0)), 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat); m.renderOrder = -10; m.frustumCulled = false; return m;
}

/* ---- water shader shared by ocean & lakes (Gerstner swell + ripple normals, fresnel sky reflection, sun glint) ---- */
const WAVES = { comps: [], hs: 0.6, time: 0 };
function setWaves(hs, dirFrom, tp) {
  const base = (dirFrom + 180) * rad, g = 9.81, comps = [];
  const specs = [[1, 0, 1], [0.65, 0.42, 0.7], [0.5, -0.5, 0.55], [0.3, 0.9, 0.35]];
  for (const [ar, dA, lr] of specs) { const T = Math.max(2, tp * Math.sqrt(lr)), L = g * T * T / (2 * Math.PI), k = 2 * Math.PI / L; const a = hs / 2 * ar / 1.6; const b = base + dA; comps.push({ dx: Math.sin(b), dz: -Math.cos(b), k, w: Math.sqrt(g * k), a, ph: (comps.length * 1.7) % 6.28 }); }
  WAVES.comps = comps; WAVES.hs = hs;
  if (WATER_U) { WATER_U.uW.value = comps.map(c => new THREE.Vector4(c.dx, c.dz, c.k, c.w)); WATER_U.uA.value = comps.map(c => new THREE.Vector2(c.a, c.ph)); }
}
function waveHeight(x, z, t, scale = 1) { let h = 0; for (const c of WAVES.comps) h += c.a * scale * Math.sin(c.k * (c.dx * x + c.dz * z) - c.w * t + c.ph); return h; }
let WATER_U = null;
function makeWaterMaterial(displace) {
  if (!WATER_U) WATER_U = { uTime: { value: 0 }, uW: { value: [0, 0, 0, 0].map(() => new THREE.Vector4(1, 0, .1, 1)) }, uA: { value: [0, 0, 0, 0].map(() => new THREE.Vector2(0, 0)) }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uSky: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uDeep: { value: new THREE.Color('#0b3550') }, uLight: { value: 1 }, uRipple: { value: 1 }, uRain: { value: 0 } };
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]), fog: true, side: THREE.DoubleSide,
    vertexShader: `#include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      uniform float uTime; uniform vec4 uW[4]; uniform vec2 uA[4]; varying vec3 vW; varying vec3 vN;
      void main(){ vec3 p = (modelMatrix * vec4(position,1.0)).xyz; vec3 n = vec3(0.0,1.0,0.0);
        ${displace ? `float fade = clamp(1.0 - length(p.xz - cameraPosition.xz) / 1400.0, 0.0, 1.0);
        for (int i=0;i<4;i++){ float th = uW[i].z * dot(uW[i].xy, p.xz) - uW[i].w * uTime + uA[i].y; float a = uA[i].x * fade;
          p.y += a * sin(th); p.x -= a * 0.6 * uW[i].x * cos(th); p.z -= a * 0.6 * uW[i].y * cos(th);
          n.x -= a * uW[i].z * uW[i].x * cos(th); n.z -= a * uW[i].z * uW[i].y * cos(th); }` : ''}
        vW = p; vN = normalize(n); vec4 mvPosition = viewMatrix * vec4(p,1.0); gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: `#include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      uniform float uTime, uLight, uRipple, uRain; uniform vec3 uSun, uSunCol, uSky, uHor, uDeep; varying vec3 vW; varying vec3 vN;
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); float a=fract(sin(dot(i,vec2(127.1,311.7)))*43758.5), b=fract(sin(dot(i+vec2(1,0),vec2(127.1,311.7)))*43758.5), c=fract(sin(dot(i+vec2(0,1),vec2(127.1,311.7)))*43758.5), d=fract(sin(dot(i+vec2(1,1),vec2(127.1,311.7)))*43758.5); return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
      void main(){
        #include <logdepthbuf_fragment>
        vec2 q = vW.xz * 0.35; float e = 0.15;
        float r0 = n2(q + uTime*0.6) + 0.5*n2(q*2.3 - uTime*0.9);
        float rx = n2(q + vec2(e,0.0) + uTime*0.6) + 0.5*n2((q+vec2(e,0.0))*2.3 - uTime*0.9);
        float rz = n2(q + vec2(0.0,e) + uTime*0.6) + 0.5*n2((q+vec2(0.0,e))*2.3 - uTime*0.9);
        vec3 n = normalize(vN + vec3((r0-rx), 0.0, (r0-rz)) * (0.9 * uRipple + 1.4 * uRain));
        vec3 v = normalize(cameraPosition - vW);
        bool below = cameraPosition.y < vW.y - 0.05;
        if (below) { n = -n; }
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 refl = mix(uHor, uSky, clamp(reflect(-v, n).y * 2.0, 0.0, 1.0));
        vec3 base = uDeep * (0.25 + 0.75 * uLight);
        vec3 c = mix(base, refl, clamp(fres, 0.0, 1.0));
        float spec = pow(max(dot(reflect(-uSun, n), v), 0.0), 220.0);
        c += uSunCol * spec * 6.0 * uLight;
        if (below) c = mix(vec3(0.05,0.32,0.36), vec3(0.6,0.85,0.9), fres) * (0.35 + 0.65*uLight);    // seen from below (ROV)
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}
function bindWater(m) { Object.assign(m.uniforms, WATER_U); return m; }

/* ---- cloud deck: cumulus (puffy, drifting with the real wind) or stratus (flat, low) ---- */
function makeClouds(scaleM = 2600) {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uCover: { value: .3 }, uWind: { value: new THREE.Vector2() }, uSunCol: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3() }, uScale: { value: scaleM }, uSharp: { value: 1 }, uFlash: { value: 0 }, uAlpha: { value: 0.92 } }]),
    fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `#include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <logdepthbuf_vertex>
      #include <fog_vertex>
      }`,
    fragmentShader: `#include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      uniform float uTime, uCover, uScale, uSharp, uFlash, uAlpha; uniform vec2 uWind; uniform vec3 uSunCol, uShade, uSun; varying vec3 vW;
      float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }
      void main(){
        #include <logdepthbuf_fragment>
        vec2 p = (vW.xz - uWind * uTime) / uScale;
        float n = fbm(p); float w = mix(0.3, 0.08, uSharp);
        float d = uCover >= 0.99 ? 1.0 : smoothstep(1.0 - uCover - w * 0.4, 1.0 - uCover + w, n);
        float thick = fbm(p * 1.7 + 3.1);
        float lit = clamp(0.5 + 0.55 * (thick - 0.35) * uSharp + 0.25 * uSun.y - 0.25 * (1.0 - uSharp) * uCover, 0.0, 1.0);
        float edge = clamp(1.0 - length(vW.xz - cameraPosition.xz) / 38000.0, 0.0, 1.0);
        vec3 col = mix(uShade, uSunCol, lit) + vec3(0.8,0.85,1.0) * uFlash * 1.5;
        gl_FragColor = vec4(col, d * uAlpha * edge);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000, 1, 1).rotateX(-Math.PI / 2), mat); m.renderOrder = 5; m.frustumCulled = false; return m;
}
/* ---- precipitation around the camera: rain streaks or snow flakes ---- */
function makeRain(n = 3500) {
  const g = new THREE.BufferGeometry(), p = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) { const x = (Math.random() - .5) * 120, y = Math.random() * 80, z = (Math.random() - .5) * 120; p.set([x, y, z, x, y - 1.4, z], i * 6); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#c7d3dc', transparent: true, opacity: 0.45, depthWrite: false })); m.frustumCulled = false; m.visible = false; return m;
}
function makeSnow(n = 3000) {
  const g = new THREE.BufferGeometry(), p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) p.set([(Math.random() - .5) * 90, Math.random() * 60, (Math.random() - .5) * 90], i * 3);
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 0.12, transparent: true, opacity: 0.9, depthWrite: false })); m.frustumCulled = false; m.visible = false; return m;
}
/* ---- lightning: random flashes, thunder delayed by distance ---- */
const STORM = { next: 4, flash: 0, pending: [] };
function stormTick(dt, active, onThunder) {
  STORM.flash = Math.max(0, STORM.flash - dt * 5);
  if (!active) return 0;
  STORM.next -= dt;
  if (STORM.next <= 0) { STORM.flash = 1 + Math.random() * 1.5; STORM.next = 4 + Math.random() * 11; const dist = 600 + Math.random() * 5000; STORM.pending.push({ at: dist / 343, gain: clamp(2500 / dist, 0.15, 1) }); }
  for (const p of STORM.pending) p.at -= dt;
  const due = STORM.pending.filter(p => p.at <= 0); STORM.pending = STORM.pending.filter(p => p.at > 0); due.forEach(p => onThunder?.(p.gain));
  return STORM.flash * (0.6 + 0.4 * Math.sin(performance.now() * 0.05));
}

/* ======================= post-processing ======================= */
/* RenderPass → bloom (only HDR sun/moon discs, sun glints, lit windows exceed 1.0) → grade (glare, flare, colour, lens rain,
   grain, fisheye, underwater) → OutputPass (sRGB). The sun glare is gated by a real occlusion test against the DEM,
   OSM buildings and cloud cover, so facing the rising sun at dawn is dazzling only when the sun is actually visible. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uExposure: { value: 1 }, uContrast: { value: 1 }, uSat: { value: 1 }, uTint: { value: new THREE.Vector3(1, 1, 1) },
    uVignette: { value: 0.22 }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uSunVis: { value: 0 }, uGlare: { value: 1 }, uAspect: { value: 1 },
    uTime: { value: 0 }, uRain: { value: 0 }, uGrain: { value: 0 }, uFlash: { value: 0 }, uUnder: { value: 0 }, uFish: { value: 0 }, uTanMax: { value: 1.73 }, uLift: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uExposure,uContrast,uSat,uVignette,uSunVis,uGlare,uAspect,uTime,uRain,uGrain,uFlash,uUnder,uFish,uTanMax,uLift;
    uniform vec3 uTint; uniform vec2 uSun; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    vec2 fisheye(vec2 uv){                       // equidistant fisheye from a rectilinear render
      vec2 c = uv * 2.0 - 1.0; c.y /= uAspect; float r = length(c); if (r < 1e-4) return uv;
      float th = r * atan(uTanMax); float ri = tan(min(th, 1.45)) / uTanMax;
      vec2 o = c / r * ri; o.y *= uAspect; return o * 0.5 + 0.5;
    }
    vec2 lensRain(vec2 uv){
      vec2 o = vec2(0.0);
      for (int L = 0; L < 2; L++) {
        float sc = L == 0 ? 6.0 : 13.0; vec2 g = vec2(uv.x * uAspect, uv.y) * sc; g.y += uTime * (L == 0 ? 0.05 : 0.11);
        vec2 id = floor(g), f = fract(g) - 0.5; float h = hash(id + float(L) * 7.1);
        if (h < 0.08 + 0.4 * uRain) { vec2 p = (vec2(hash(id + 1.3), hash(id + 2.7)) - 0.5) * 0.6; vec2 dv = f - p; float r = 0.1 + 0.13 * hash(id + 5.1);
          float dd = length(dv / vec2(1.0, 1.3)); if (dd < r) o += dv * (1.0 - dd / r) * 0.09 / sc; }
      }
      return o * min(uRain, 1.0);
    }
    vec3 softClip(vec3 x){ vec3 k = vec3(0.85); return mix(x, k + 0.15 * (1.0 - exp(-(x - k) / 0.15)), step(k, x)); }
    void main(){
      vec2 uv = vUv; float outside = 0.0;
      if (uFish > 0.5) { uv = fisheye(uv); outside = step(1.0, max(abs(uv.x - 0.5), abs(uv.y - 0.5)) * 2.0); }
      if (uUnder > 0.0) uv += vec2(sin(uv.y * 38.0 + uTime * 2.1), cos(uv.x * 31.0 + uTime * 1.7)) * 0.0022 * uUnder;
      if (uRain > 0.0) uv += lensRain(vUv);
      vec3 c = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb;
      c *= uExposure * (1.0 + uFlash * 0.6);
      // sun glare: halo, veiling glare, anamorphic streak, ghosts mirrored through the image centre
      vec2 d = vUv - uSun; d.x *= uAspect; float r = length(d), g = uSunVis * uGlare;
      c *= 1.0 - 0.28 * g;                                   // the camera exposes for the bright sun: scene darkens
      c += vec3(1.0, 0.9, 0.74) * g * (0.05 / (r * r * 10.0 + 0.05));
      c += vec3(1.0, 0.95, 0.86) * g * 0.12;
      c += vec3(1.0, 0.88, 0.7) * g * exp(-abs(d.y) * 110.0) * exp(-abs(d.x) * 2.6) * 0.55;
      vec2 axis = vec2(0.5) - uSun;
      for (int i = 1; i <= 6; i++) { float fi = float(i); vec2 gp = uSun + axis * (0.28 * fi); vec2 gd = vUv - gp; gd.x *= uAspect;
        float rr = length(gd), size = 0.018 + 0.03 * fract(fi * 0.618); vec3 gc = mix(vec3(0.35, 0.75, 1.0), vec3(1.0, 0.55, 0.25), fract(fi * 0.37));
        c += gc * g * 0.10 * smoothstep(size, size * 0.55, rr); }
      // colour grading in linear light
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = max((c - 0.18) * uContrast + 0.18, 0.0);
      c = c * uTint + uLift;
      if (uUnder > 0.0) { float depthFade = 0.55 + 0.45 * vUv.y; c = mix(c, c * vec3(0.22, 0.72, 0.82) * depthFade + vec3(0.0, 0.035, 0.05), uUnder); }
      vec2 vv = vUv - 0.5; c *= 1.0 - uVignette * dot(vv, vv) * 2.2;
      c += (hash(vUv * vec2(1931.0, 1087.0) + fract(uTime * 7.0)) - 0.5) * uGrain;
      c = softClip(c);
      c = mix(c, vec3(0.0), outside);
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};
const POST = {
  composer: null, grade: null, bloom: null, enabled: false, size: new THREE.Vector2(),
  init(renderer, scene, camera, tier) {
    this.dispose(); if (tier === 'low') { this.enabled = false; return; }
    const w = innerWidth, h = innerHeight, dpr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(w * dpr, h * dpr, { type: THREE.HalfFloatType, samples: tier === 'high' ? 4 : 2 });
    const c = this.composer = new EffectComposer(renderer, rt);
    c.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), tier === 'high' ? 0.55 : 0.45, 0.55, 1.0); c.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader); c.addPass(this.grade);
    c.addPass(new OutputPass());
    this.enabled = true; this.resize(renderer);
  },
  dispose() { if (this.composer) { this.composer.renderTarget1?.dispose(); this.composer.renderTarget2?.dispose(); this.composer.passes.forEach(p => p.dispose?.()); } this.composer = null; this.grade = null; this.enabled = false; },
  resize(renderer) { if (!this.composer) return; renderer.getSize(this.size); this.composer.setPixelRatio(renderer.getPixelRatio()); this.composer.setSize(this.size.x, this.size.y); this.grade.uniforms.uAspect.value = this.size.x / Math.max(1, this.size.y); },
  render(renderer, scene, camera) { if (this.enabled && this.composer) this.composer.render(); else renderer.render(scene, camera); },
  set(u) { if (!this.grade) return; const U = this.grade.uniforms; for (const k in u) { if (U[k]?.value?.set && Array.isArray(u[k])) U[k].value.set(...u[k]); else if (U[k]) U[k].value = u[k]; } },
};
/* Is the real sun visible from the camera? Projects it to the screen and tests DEM terrain, OSM buildings and clouds. */
const _sp = new THREE.Vector3(), _cf = new THREE.Vector3();
function sunVisibility(camera, sunDir, cloudCover, demAt, roofAt) {
  if (sunDir.y < -0.03) return { vis: 0, x: 0.5, y: 0.5 };
  camera.getWorldDirection(_cf); const facing = _cf.dot(sunDir);
  _sp.copy(camera.position).addScaledVector(sunDir, 5000).project(camera);
  if (facing <= 0.05 || _sp.z > 1) return { vis: 0, x: 0.5, y: 0.5 };
  const x = _sp.x * 0.5 + 0.5, y = _sp.y * 0.5 + 0.5, edge = Math.max(Math.abs(_sp.x), Math.abs(_sp.y));
  let vis = clamp((1.25 - edge) / 0.35, 0, 1) * clamp((facing - 0.05) / 0.35, 0, 1);
  if (vis <= 0) return { vis: 0, x, y };
  const p = camera.position;
  for (const dd of [15, 35, 70, 140, 280, 560, 1100, 2200, 4400, 8800, 17000, 30000]) {
    const qx = p.x + sunDir.x * dd, qy = p.y + sunDir.y * dd, qz = p.z + sunDir.z * dd;
    if (demAt(qx, qz) > qy) return { vis: 0, x, y };
    if (dd < 600) { const r = roofAt(qx, qz); if (r && qy < r.top && qy > r.base) return { vis: 0, x, y }; }
  }
  vis *= clamp(1 - (cloudCover - 0.15) / 0.7, 0, 1);
  vis *= clamp((sunDir.y + 0.03) / 0.06, 0, 1);
  return { vis, x, y };
}

/* ======================= vehicle physics =======================
   Frame: X east, Y up, Z south (north = -Z). Heading h: forward = (-sin h, 0, -cos h); +h turns left.
   env interface: groundAt(X,Z) terrain height (m), roofAt(X,Z) -> {top,base}|null, wind(pos) -> Vector3,
   isWater(X,Z) -> bool, waterLevel, wave(X,Z,t) -> height, road(X,Z) -> {dist,name,cls}|null           */
const G0 = 9.81;
const fwdOf = (h, out = new THREE.Vector3()) => out.set(-Math.sin(h), 0, -Math.cos(h));
const rightOf = (h, out = new THREE.Vector3()) => out.set(Math.cos(h), 0, -Math.sin(h));
const airDensity = y => 1.225 * Math.exp(-Math.max(0, y) / 8500);

/* ---------- multirotor (DJI-style N / S / A modes) ---------- */
const DRONE_MODES = {
  N: { label: 'mode.N', vmax: 15, vup: 5, vdn: 4, tilt: 25 * Math.PI / 180, yaw: 100 * Math.PI / 180, hold: true },
  S: { label: 'mode.S', vmax: 21, vup: 6, vdn: 5, tilt: 35 * Math.PI / 180, yaw: 150 * Math.PI / 180, hold: true },
  A: { label: 'mode.A', vmax: 21, vup: 5, vdn: 4, tilt: 30 * Math.PI / 180, yaw: 100 * Math.PI / 180, hold: false },
};
class DronePhysics {
  constructor() {
    this.kind = 'drone'; this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.heading = 0;
    this.pitch = 0; this.roll = 0; this.mode = 'N'; this.landed = true; this.crashed = false; this.battery = 1; this.gimbal = -0.25;
    this.aCmd = new THREE.Vector3(); this.thrust = 0; this.warn = ''; this.agl = 0; this.cd = 0.0119; this._f = new THREE.Vector3(); this._r = new THREE.Vector3();
  }
  spawn(X, Y, Z, h) { this.pos.set(X, Y, Z); this.vel.set(0, 0, 0); this.heading = h; this.landed = true; this.crashed = false; this.battery = 1; this.pitch = this.roll = 0; }
  step(dt, inp, env, t) {
    if (this.crashed) return;
    const P = DRONE_MODES[this.mode] || DRONE_MODES.N, g = env.groundAt(this.pos.x, this.pos.z), roof = env.roofAt?.(this.pos.x, this.pos.z);
    const floor = Math.max(g, roof ? roof.top : -1e9);
    if (this.landed) {
      this.pos.y = floor + 0.15; this.vel.set(0, 0, 0); this.thrust = 0; this.pitch *= .9; this.roll *= .9;
      if (inp.up > 0.3 && this.battery > 0) this.landed = false; else { this.agl = 0; return; }
    }
    this.heading += inp.yaw * P.yaw * dt;
    const f = fwdOf(this.heading, this._f), r = rightOf(this.heading, this._r);
    const w = env.wind(this.pos), aMax = G0 * Math.tan(P.tilt);
    const rx = this.vel.x - w.x, rz = this.vel.z - w.z, rs = Math.hypot(rx, rz);
    const dragX = -this.cd * rx * rs, dragZ = -this.cd * rz * rs;
    let ax, az;
    if (P.hold) {
      const tx = (f.x * inp.fwd + r.x * inp.right) * P.vmax, tz = (f.z * inp.fwd + r.z * inp.right) * P.vmax;
      ax = (tx - this.vel.x) * 2.2 - dragX; az = (tz - this.vel.z) * 2.2 - dragZ;
    } else { ax = (f.x * inp.fwd + r.x * inp.right) * aMax; az = (f.z * inp.fwd + r.z * inp.right) * aMax; }
    const am = Math.hypot(ax, az); if (am > aMax) { ax *= aMax / am; az *= aMax / am; }
    if (this.battery <= 0) { ax = az = 0; }
    this.aCmd.set(ax, 0, az);
    this.vel.x += (ax + dragX) * dt; this.vel.z += (az + dragZ) * dt;
    let vyT = this.battery <= 0 ? -3 : (inp.up >= 0 ? inp.up * P.vup : inp.up * P.vdn);
    const aglNow = this.pos.y - floor; if (P.hold && aglNow < 6) vyT = Math.max(vyT, -0.8 - aglNow * 0.45);   // landing protection
    const ay = clamp((vyT - this.vel.y) * 3, -6, 6); this.vel.y += ay * dt;
    this.pos.addScaledVector(this.vel, dt);
    // attitude follows commanded horizontal acceleration (body tilts into the motion)
    const pT = -Math.atan((ax * f.x + az * f.z) / G0), rT = -Math.atan((ax * r.x + az * r.z) / G0);
    this.pitch += (pT - this.pitch) * Math.min(1, dt * 8); this.roll += (rT - this.roll) * Math.min(1, dt * 8);
    this.thrust = clamp(Math.hypot(am, G0 + ay) / G0 * .5, 0, 1);
    this.battery = Math.max(0, this.battery - dt / (28 * 60) * (0.85 + 0.6 * am / aMax));
    const g2 = env.groundAt(this.pos.x, this.pos.z), roof2 = env.roofAt?.(this.pos.x, this.pos.z);
    const fl = Math.max(g2, roof2 ? roof2.top : -1e9);
    this.agl = this.pos.y - g2;
    if (roof2 && this.pos.y < roof2.top - 0.5 && this.pos.y > roof2.base) { this.crash('warn.crashBuilding'); return; }
    if (this.pos.y < fl + 0.15) {
      const impact = -this.vel.y, hs = Math.hypot(this.vel.x, this.vel.z);
      if (impact > 3.5 || hs > 5) { this.crash(roof2 ? 'warn.crashRoof' : 'warn.crashGround'); return; }
      this.pos.y = fl + 0.15; this.vel.set(0, 0, 0); if (inp.up <= 0) this.landed = true;
    }
    if (env.isWater?.(this.pos.x, this.pos.z) && this.pos.y < env.waterLevel + 0.2) { this.crash('warn.crashWater'); return; }
    this.warn = this.battery <= 0 ? 'warn.battOut' : this.battery < .15 ? 'warn.battLow' : this.agl > 120 ? 'warn.altLegal' : Math.hypot(w.x, w.z) > 10.7 ? 'warn.windLimit' : '';
  }
  crash(why) { this.crashed = true; this.vel.set(0, 0, 0); this.warn = 'warn.crashed'; this.why = why; }
}

/* ---------- light fixed-wing (Cessna-class) ---------- */
class PlanePhysics {
  constructor() {
    this.kind = 'plane'; this.m = 1100; this.S = 16.2; this.CL0 = 0.25; this.CLa = 5.0; this.aStall = 15 * Math.PI / 180;
    this.CD0 = 0.028; this.kInd = 0.05; this.Tmax = 3200;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.quat = new THREE.Quaternion(); this.w = new THREE.Vector3();
    this.throttle = 0.8; this.trim = 1.5 * Math.PI / 180; this.crashed = false; this.onGround = false; this.alpha = 0; this.beta = 0; this.airspeed = 0; this.agl = 0; this.warn = ''; this.heading = 0; this.pitch = 0; this.roll = 0;
    this._v = new THREE.Vector3(); this._f = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
  }
  spawn(X, Y, Z, h, speed = 50) {
    this.pos.set(X, Y, Z); this.quat.setFromEuler(new THREE.Euler(0, h, 0, 'YXZ'));
    this.vel.copy(fwdOf(h)).multiplyScalar(speed); this.w.set(0, 0, 0); this.crashed = false; this.onGround = false; this.throttle = 0.8; this.trim = 1.5 * Math.PI / 180;
  }
  step(dt, inp, env) {
    if (this.crashed) return;
    this.throttle = clamp(this.throttle + inp.throttle * dt * 0.5, 0, 1);
    const qi = this._q.copy(this.quat).invert();
    const wind = env.wind(this.pos);
    const va = this._v.copy(this.vel).sub(wind).applyQuaternion(qi);
    const u = -va.z, V = Math.max(0.1, va.length());
    const alpha = Math.atan2(-va.y, Math.max(0.1, u)), beta = Math.atan2(va.x, Math.max(0.1, u));
    this.alpha = alpha; this.beta = beta; this.airspeed = V;
    const rho = airDensity(this.pos.y), qbar = 0.5 * rho * V * V, s = qbar / (0.5 * 1.225 * 55 * 55);
    const aAbs = Math.abs(alpha), CLmax = this.CL0 + this.CLa * this.aStall;
    const CL = aAbs < this.aStall ? this.CL0 + this.CLa * alpha : Math.sign(alpha) * CLmax * Math.max(0.45, 1 - (aAbs - this.aStall) * 2.5);
    const CD = this.CD0 + this.kInd * CL * CL + (aAbs > this.aStall ? 0.5 * (aAbs - this.aStall) : 0);
    const F = this._f.set(0, 0, 0);
    const ln = Math.hypot(u, va.y) || 1;
    F.y += qbar * this.S * CL * (u / ln); F.z += qbar * this.S * CL * (va.y / ln);       // lift ⟂ airflow in symmetry plane
    F.addScaledVector(va, -qbar * this.S * CD / V);                                        // drag
    F.x += -qbar * this.S * 0.6 * beta;                                                     // side force
    F.z += -this.throttle * this.Tmax * Math.max(0, 1 - Math.max(0, u) / 90);               // propeller thrust
    F.applyQuaternion(this.quat); F.y -= this.m * G0;
    // control + stability moments (angular accelerations, body frame)
    const de = inp.pitch, da = inp.roll, dr = inp.yaw;
    if (inp.assist && Math.abs(de) < 0.05) this.trim += clamp(-this.vel.y * 0.004, -0.02, 0.02) * dt;
    this.trim = clamp(this.trim, -0.05, 0.2);
    const w = this.w, ss = Math.max(s, 0.02);
    w.x += (ss * (2.5 * de + 8 * (this.trim - alpha)) - 3 * Math.sqrt(ss) * w.x) * dt;
    w.z += (ss * (-4 * da + 0.8 * beta) - 3.5 * Math.sqrt(ss) * w.z) * dt;
    w.y += (ss * (-1.5 * dr - 3 * beta) - 1.5 * Math.sqrt(ss) * w.y) * dt;
    if (inp.assist && Math.abs(da) < 0.05) { const e = this._e.setFromQuaternion(this.quat, 'YXZ'); w.z += -e.z * 0.8 * dt * ss; }
    const ang = w.length() * dt;
    if (ang > 0) { this._q.setFromAxisAngle(this._v.copy(w).normalize(), ang); this.quat.multiply(this._q).normalize(); }
    this.vel.addScaledVector(F, dt / this.m);
    this.pos.addScaledVector(this.vel, dt);
    const e = this._e.setFromQuaternion(this.quat, 'YXZ'); this.heading = e.y; this.pitch = e.x; this.roll = e.z;
    const g = env.groundAt(this.pos.x, this.pos.z); this.agl = this.pos.y - g;
    const roof = env.roofAt?.(this.pos.x, this.pos.z);
    if (roof && this.pos.y < roof.top && this.pos.y > roof.base) { this.crash('warn.crashBuilding'); return; }
    if (env.isWater?.(this.pos.x, this.pos.z) && this.pos.y < env.waterLevel + 1) { this.crash('warn.crashSea'); return; }
    if (this.pos.y < g + 1.2) {
      const vs = -this.vel.y;
      if (!this.onGround && (vs > 3 || Math.abs(this.roll) > 0.2 || this.pitch < -0.1)) { this.crash('warn.crashGround'); return; }
      this.onGround = true; this.pos.y = g + 1.2; this.vel.y = Math.max(0, this.vel.y);
      const hs = Math.hypot(this.vel.x, this.vel.z), dec = (0.04 + (inp.brake ? 0.35 : 0)) * G0 * dt;
      if (hs > 0) { const k = Math.max(0, hs - dec) / hs; this.vel.x *= k; this.vel.z *= k; }
      w.z *= 0.8; w.x = Math.max(w.x, -0.2);
    } else if (this.agl > 3) this.onGround = false;
    this.warn = aAbs > this.aStall - 0.035 && !this.onGround ? 'warn.stall' : (this.agl < 60 && this.vel.y < -6 && !this.onGround ? 'warn.pullUp' : '');
  }
  crash(why) { this.crashed = true; this.vel.set(0, 0, 0); this.w.set(0, 0, 0); this.warn = 'warn.crashed'; this.why = why; }
}

/* ---------- planing speedboat ---------- */
class BoatPhysics {
  constructor() {
    this.kind = 'boat'; this.m = 1800; this.pos = new THREE.Vector3(); this.heading = 0; this.u = 0; this.v = 0; this.r = 0; this.throttle = 0;
    this.pitch = 0; this.roll = 0; this.heave = 0; this.crashed = false; this.warn = ''; this.agl = 0; this.vel = new THREE.Vector3(); this.grounded = 0;
    this._f = new THREE.Vector3(); this._r = new THREE.Vector3();
  }
  spawn(X, Y, Z, h) { this.pos.set(X, Y, Z); this.heading = h; this.u = this.v = this.r = 0; this.crashed = false; }
  step(dt, inp, env, t) {
    this.throttle += (inp.fwd - this.throttle) * Math.min(1, dt * 1.5);
    const T = this.throttle > 0 ? this.throttle * 9000 : this.throttle * 3500;
    const hs = env.waveHs || 0;
    const drag = 60 * this.u + 14 * this.u * Math.abs(this.u) * (1 + hs * 0.25);
    this.u += (T - drag) / this.m * dt;
    const rud = -inp.steer * 0.6;
    this.r += (rud * this.u * 0.08 - this.r * 1.8) * dt;
    this.heading += this.r * dt;
    this.v += (-this.v * 2.5 + this.r * this.u * 0.15) * dt;
    const f = fwdOf(this.heading, this._f), rt = rightOf(this.heading, this._r), w = env.wind(this.pos);
    const vx = f.x * this.u + rt.x * this.v + w.x * 0.025, vz = f.z * this.u + rt.z * this.v + w.z * 0.025;
    const nx = this.pos.x + vx * dt, nz = this.pos.z + vz * dt;
    const bowX = nx + f.x * 3, bowZ = nz + f.z * 3;
    if (env.isWater(nx, nz) && env.isWater(bowX, bowZ)) { this.pos.x = nx; this.pos.z = nz; this.grounded = Math.max(0, this.grounded - dt); }
    else { this.u *= -0.25; this.v = 0; this.grounded = 1.5; }
    this.vel.set(vx, 0, vz);
    const L = env.waterLevel, wv = (x, z) => env.wave ? env.wave(x, z, t) : 0;
    const hC = wv(this.pos.x, this.pos.z), hF = wv(this.pos.x + f.x * 3, this.pos.z + f.z * 3), hB = wv(this.pos.x - f.x * 3, this.pos.z - f.z * 3);
    const hR = wv(this.pos.x + rt.x * 1.2, this.pos.z + rt.z * 1.2), hL = wv(this.pos.x - rt.x * 1.2, this.pos.z - rt.z * 1.2);
    const plane = clamp(this.u / 10, 0, 1), trim = (0.07 * plane - 0.035 * clamp((this.u - 14) / 10, 0, 1));
    const targetY = L + (hF + hB + hR + hL + hC) / 5 + 0.15 + 0.12 * plane;
    this.pos.y += (targetY - this.pos.y) * Math.min(1, dt * 6);
    this.pitch += (Math.atan2(hF - hB, 6) + trim - this.pitch) * Math.min(1, dt * 5);
    this.roll += (Math.atan2(hR - hL, 2.4) + this.r * this.u * 0.012 - this.roll) * Math.min(1, dt * 5);
    this.agl = 0;
    this.warn = this.grounded > 0 ? 'warn.aground' : (hs > 2.5 ? 'warn.waves' : ''); this.warnP = { h: hs.toFixed(1) };
  }
}

/* ---------- car ---------- */
class CarPhysics {
  constructor() {
    this.kind = 'car'; this.m = 1500; this.L = 2.7; this.pos = new THREE.Vector3(); this.heading = 0; this.v = 0; this.steer = 0; this.vy = 0; this.air = false;
    this.pitch = 0; this.roll = 0; this.crashed = false; this.warn = ''; this.onRoad = false; this.roadName = ''; this.agl = 0; this.rpm = 900; this.vel = new THREE.Vector3();
    this._f = new THREE.Vector3(); this._r = new THREE.Vector3();
  }
  spawn(X, Y, Z, h) { this.pos.set(X, Y, Z); this.heading = h; this.v = 0; this.vy = 0; this.steer = 0; this.air = false; }
  step(dt, inp, env) {
    const f = fwdOf(this.heading, this._f), rt = rightOf(this.heading, this._r), g = (x, z) => env.groundAt(x, z);
    const rd = env.road ? env.road(this.pos.x, this.pos.z) : null;
    this.onRoad = !!rd && rd.dist < 7; this.roadName = rd && rd.dist < 25 ? rd.name || '' : '';
    const mu = this.onRoad ? 0.95 : 0.6, crr = this.onRoad ? 0.015 : 0.09;
    const hF = g(this.pos.x + f.x * 1.4, this.pos.z + f.z * 1.4), hB = g(this.pos.x - f.x * 1.4, this.pos.z - f.z * 1.4);
    const sinT = clamp((hF - hB) / 2.8, -0.6, 0.6);
    const thr = Math.max(0, inp.fwd), brk = Math.max(0, -inp.fwd);
    let Fe = thr * Math.min(6500, 110000 / Math.max(Math.abs(this.v), 1)), Fb = 0;
    if (brk > 0) { if (this.v > 0.4) Fb = -brk * 12000; else Fe = -brk * (this.v > -6 ? 3000 : 0); }
    if (this.air) Fe = Fb = 0;
    const Fr = -Math.sign(this.v) * (crr * this.m * G0 + 0.5 * 1.2 * 0.65 * 2.2 * this.v * this.v) - this.m * G0 * sinT;
    const dv = (Fe + Fb + Fr) / this.m * dt;
    if (Fb !== 0 && this.v + dv < 0) this.v = 0; else this.v += dv;
    if (Math.abs(this.v) < 0.05 && thr === 0 && brk === 0 && Math.abs(sinT) < 0.35) this.v = 0;
    const maxSteer = 0.6 / (1 + Math.abs(this.v) / 12);
    this.steer += clamp(inp.steer * maxSteer - this.steer, -2.5 * dt, 2.5 * dt);
    let yr = this.v / this.L * Math.tan(-this.steer); const lim = mu * G0 / Math.max(Math.abs(this.v), 1);
    yr = clamp(yr, -lim, lim); if (!this.air) this.heading += yr * dt;
    const nx = this.pos.x + f.x * this.v * dt, nz = this.pos.z + f.z * this.v * dt;
    const roof = env.roofAt?.(nx + f.x * 2 * Math.sign(this.v), nz + f.z * 2 * Math.sign(this.v));
    if (roof && this.pos.y < roof.top) { this.v *= -0.2; this.warn = 'warn.crashBuilding'; }
    else if (env.isWater?.(nx, nz) && g(nx, nz) < env.waterLevel + 0.3) { this.v = 0; this.warn = 'warn.waterAhead'; }
    else { this.pos.x = nx; this.pos.z = nz; this.warn = ''; }
    const ground = g(this.pos.x, this.pos.z) + 0.02;
    if (this.air || this.pos.y > ground + 0.6) { this.air = true; this.vy -= G0 * dt; this.pos.y += this.vy * dt; if (this.pos.y <= ground) { this.air = false; this.pos.y = ground; if (this.vy < -8) this.warn = 'warn.hardLanding'; this.vy = 0; } }
    else { this.pos.y = ground; this.vy = 0; }
    const hR = g(this.pos.x + rt.x * 0.8, this.pos.z + rt.z * 0.8), hL = g(this.pos.x - rt.x * 0.8, this.pos.z - rt.z * 0.8);
    this.pitch += (Math.asin(sinT) - this.pitch) * Math.min(1, dt * 6);
    this.roll += (Math.atan2(hR - hL, 1.6) + this.steer * this.v * 0.004 - this.roll) * Math.min(1, dt * 6);
    this.vel.set(f.x * this.v, this.vy, f.z * this.v);
    const gear = Math.min(5, Math.floor(Math.abs(this.v) / 9)); this.rpm = 900 + (Math.abs(this.v) - gear * 9) / 9 * 4200 + gear * 300 + thr * 400;
    if (!this.warn && !this.onRoad && Math.abs(this.v) > 3) this.warn = 'warn.offroad';
    if (!this.warn && sinT > 0.3) { this.warn = 'warn.slope'; this.warnP = { deg: Math.round(Math.asin(sinT) * 180 / Math.PI) }; }
  }
}

/* ---------- ground robot (UGV): skid steer, low speed, can pivot in place ---------- */
class UgvPhysics {
  constructor() { this.kind = 'ugv'; this.pos = new THREE.Vector3(); this.heading = 0; this.v = 0; this.vy = 0; this.pitch = 0; this.roll = 0; this.crashed = false; this.warn = ''; this.warnP = {}; this.agl = 0; this.rpm = 0; this.vel = new THREE.Vector3(); this.onRoad = false; this.roadName = ''; this._f = new THREE.Vector3(); this._r = new THREE.Vector3(); }
  spawn(X, Y, Z, h) { this.pos.set(X, Y, Z); this.heading = h; this.v = 0; this.vy = 0; }
  step(dt, inp, env) {
    const f = fwdOf(this.heading, this._f), rt = rightOf(this.heading, this._r), g = (x, z) => env.groundAt(x, z);
    const hF = g(this.pos.x + f.x * 0.7, this.pos.z + f.z * 0.7), hB = g(this.pos.x - f.x * 0.7, this.pos.z - f.z * 0.7), sinT = clamp((hF - hB) / 1.4, -0.9, 0.9);
    const target = inp.fwd >= 0 ? inp.fwd * 4.5 : inp.fwd * 2;
    this.v += clamp(target - this.v, -3 * dt, 2 * dt) - G0 * sinT * 0.05 * dt;
    if (sinT > 0.62 && this.v > 0) { this.v = 0; this.warn = 'warn.slope'; this.warnP = { deg: Math.round(Math.asin(sinT) * 180 / Math.PI) }; } else this.warn = '';
    this.heading += -inp.steer * 1.0 * dt;
    const nx = this.pos.x + f.x * this.v * dt, nz = this.pos.z + f.z * this.v * dt;
    const roof = env.roofAt?.(nx + f.x * Math.sign(this.v), nz + f.z * Math.sign(this.v));
    if (roof && this.pos.y < roof.top) { this.v = 0; this.warn = 'warn.crashBuilding'; }
    else if (env.isWater?.(nx, nz) && g(nx, nz) < env.waterLevel + 0.3) { this.v = 0; this.warn = 'warn.waterAhead'; }
    else { this.pos.x = nx; this.pos.z = nz; }
    this.pos.y = g(this.pos.x, this.pos.z) + 0.02;
    const hR = g(this.pos.x + rt.x * 0.5, this.pos.z + rt.z * 0.5), hL = g(this.pos.x - rt.x * 0.5, this.pos.z - rt.z * 0.5);
    this.pitch += (Math.asin(sinT) - this.pitch) * Math.min(1, dt * 6); this.roll += (Math.atan2(hR - hL, 1) - this.roll) * Math.min(1, dt * 6);
    const rd = env.road ? env.road(this.pos.x, this.pos.z) : null; this.onRoad = !!rd && rd.dist < 6; this.roadName = rd && rd.dist < 25 ? rd.name || '' : '';
    this.vel.set(f.x * this.v, 0, f.z * this.v); this.rpm = 600 + Math.abs(this.v) * 500;
  }
}

/* ---------- underwater drone (ROV): thrusters, neutral buoyancy, seabed and surface limits ---------- */
class RovPhysics {
  constructor() { this.kind = 'rov'; this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.heading = 0; this.pitch = 0; this.roll = 0; this.crashed = false; this.warn = ''; this.warnP = {}; this.agl = 0; this.depth = 0; this.depthMax = 150; this.thrust = 0; this.gimbal = -0.15; this._f = new THREE.Vector3(); this._r = new THREE.Vector3(); }
  spawn(X, Y, Z, h) { this.pos.set(X, Y, Z); this.vel.set(0, 0, 0); this.heading = h; }
  step(dt, inp, env, t) {
    this.heading += inp.yaw * 1.2 * dt;
    const f = fwdOf(this.heading, this._f), r = rightOf(this.heading, this._r), k = Math.min(1, dt * 1.6), L = env.waterLevel;
    const tx = f.x * inp.fwd * 1.8 + r.x * inp.right * 1.0, tz = f.z * inp.fwd * 1.8 + r.z * inp.right * 1.0, ty = inp.up * 0.9;
    const w = env.wind(this.pos);
    this.vel.x += (tx - this.vel.x) * k + w.x * 0.004 * dt; this.vel.z += (tz - this.vel.z) * k + w.z * 0.004 * dt; this.vel.y += (ty - this.vel.y) * k;
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    if (env.isWater(nx, nz)) { this.pos.x = nx; this.pos.z = nz; } else { this.vel.x *= -0.3; this.vel.z *= -0.3; }
    this.pos.y += this.vel.y * dt;
    const floor = env.groundAt(this.pos.x, this.pos.z); this.warn = '';
    if (this.pos.y > L - 0.35) { this.pos.y = L - 0.35; this.vel.y = Math.min(0, this.vel.y); this.warn = 'warn.surface'; }
    if (L - this.pos.y > this.depthMax) { this.pos.y = L - this.depthMax; this.vel.y = Math.max(0, this.vel.y); this.warn = 'warn.depthLimit'; this.warnP = { m: this.depthMax }; }
    if (this.pos.y < floor + 0.4) { this.pos.y = floor + 0.4; this.vel.y = Math.max(0, this.vel.y); this.warn = 'warn.seabed'; }
    this.depth = Math.max(0, L - this.pos.y); this.agl = this.pos.y - floor;
    this.pitch += (-(inp.fwd * 0.12) + inp.up * 0.1 - this.pitch) * Math.min(1, dt * 3); this.roll += (-inp.right * 0.1 - this.roll) * Math.min(1, dt * 3);
    this.thrust = clamp(Math.abs(inp.fwd) + Math.abs(inp.up) * 0.6 + Math.abs(inp.right) * 0.5, 0, 1);
  }
}

/* ======================= procedural vehicle models (metres, forward = -Z) ======================= */
const MAT = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .55, metalness: .1, ...o });
function droneModel() {
  const g = new THREE.Group(), body = MAT('#2b2f33', { roughness: .4 }), arm = MAT('#1f2326'), prop = new THREE.MeshBasicMaterial({ color: '#9aa4ab', transparent: true, opacity: .35, depthWrite: false });
  const core = new THREE.Mesh(new THREE.BoxGeometry(.22, .09, .32), body); g.add(core);
  const top = new THREE.Mesh(new THREE.BoxGeometry(.16, .04, .22), MAT('#3c4248')); top.position.y = .06; g.add(top);
  const cam = new THREE.Mesh(new THREE.SphereGeometry(.035, 12, 8), MAT('#111', { metalness: .6 })); cam.position.set(0, -.05, -.17); g.add(cam);
  const props = [];
  for (const [x, z] of [[-.19, -.16], [.19, -.16], [-.19, .16], [.19, .16]]) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(.03, .02, .02 + Math.hypot(x, z)), arm); a.position.set(x / 2, 0, z / 2); a.rotation.y = Math.atan2(x, z); g.add(a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .04, 10), arm); m.position.set(x, .02, z); g.add(m);
    const d = new THREE.Mesh(new THREE.CircleGeometry(.13, 24).rotateX(-Math.PI / 2), prop); d.position.set(x, .045, z); g.add(d); props.push(d);
  }
  const led = (c, x, z) => { const l = new THREE.Mesh(new THREE.SphereGeometry(.012, 8, 6), new THREE.MeshBasicMaterial({ color: c })); l.position.set(x, -.01, z); g.add(l); };
  led('#ff3030', -.19, .19); led('#ff3030', .19, .19); led('#30ff60', -.19, -.19); led('#30ff60', .19, -.19);
  g.userData.props = props; g.userData.scale = 1; return g;
}
function planeModel() {
  const g = new THREE.Group(), white = MAT('#f2f2ef'), stripe = MAT('#b5301f'), glass = MAT('#24323c', { roughness: .1, metalness: .4 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(.55, .35, 7.6, 14).rotateX(Math.PI / 2), white); fus.position.z = .4; g.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.55, 1.1, 14).rotateX(-Math.PI / 2), white); nose.position.z = -3.9; g.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11, .12, 1.5), white); wing.position.set(0, .75, -.6); g.add(wing);
  const ws = new THREE.Mesh(new THREE.BoxGeometry(11, .13, .25), stripe); ws.position.set(0, .76, -.05); g.add(ws);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.0, .6, 1.6), glass); cab.position.set(0, .55, -1.2); g.add(cab);
  const hs = new THREE.Mesh(new THREE.BoxGeometry(3.4, .08, .9), white); hs.position.set(0, .2, 3.9); g.add(hs);
  const vs = new THREE.Mesh(new THREE.BoxGeometry(.08, 1.4, 1.1), stripe); vs.position.set(0, .85, 3.8); g.add(vs);
  const prop = new THREE.Mesh(new THREE.CircleGeometry(.95, 24), new THREE.MeshBasicMaterial({ color: '#555', transparent: true, opacity: .25, depthWrite: false, side: THREE.DoubleSide })); prop.position.z = -4.5; g.add(prop);
  for (const x of [-1.2, 1.2]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, .15, 12).rotateZ(Math.PI / 2), MAT('#222')); w.position.set(x, -1.0, -.4); g.add(w); }
  const nl = new THREE.Mesh(new THREE.SphereGeometry(.07), new THREE.MeshBasicMaterial({ color: '#ff2a2a' })); nl.position.set(-5.5, .75, -.6); g.add(nl);
  const nr = new THREE.Mesh(new THREE.SphereGeometry(.07), new THREE.MeshBasicMaterial({ color: '#2aff6a' })); nr.position.set(5.5, .75, -.6); g.add(nr);
  g.userData.props = [prop]; return g;
}
function boatModel() {
  const g = new THREE.Group(), hullM = MAT('#f4f4f2', { roughness: .35 }), deck = MAT('#c9b28c'), blue = MAT('#1d4f7a');
  const shape = new THREE.Shape(); shape.moveTo(0, -3.4); shape.quadraticCurveTo(1.25, -1.6, 1.15, 1.2); shape.lineTo(1.05, 2.6); shape.lineTo(-1.05, 2.6); shape.lineTo(-1.15, 1.2); shape.quadraticCurveTo(-1.25, -1.6, 0, -3.4);
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .8, bevelEnabled: false }).rotateX(Math.PI / 2), hullM); hull.position.y = .45; g.add(hull);
  const band = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .14, bevelEnabled: false }).rotateX(Math.PI / 2), blue); band.position.y = -.2; band.scale.set(1.01, 1, 1.01); g.add(band);
  deck.side = THREE.DoubleSide; const top = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2), deck); top.position.y = .46; top.scale.set(.92, 1, .92); g.add(top);
  const con = new THREE.Mesh(new THREE.BoxGeometry(1.1, .7, .7), hullM); con.position.set(0, .8, .2); g.add(con);
  const wsg = new THREE.Mesh(new THREE.BoxGeometry(1.2, .45, .06), MAT('#7fa6bd', { transparent: true, opacity: .55, roughness: .05 })); wsg.position.set(0, 1.3, -.1); wsg.rotation.x = -.5; g.add(wsg);
  const mot = new THREE.Mesh(new THREE.BoxGeometry(.45, .8, .5), MAT('#222')); mot.position.set(0, .35, 2.85); g.add(mot);
  return g;
}
function carModel() {
  const g = new THREE.Group(), paint = MAT('#c33b2a', { roughness: .3, metalness: .4 }), glass = MAT('#1f2a33', { roughness: .1, metalness: .5 }), tire = MAT('#151515', { roughness: .9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, .6, 4.4), paint); body.position.y = .62; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, .55, 2.2), glass); cab.position.set(0, 1.18, .25); g.add(cab);
  const wheels = [];
  for (const [x, z] of [[-.85, -1.35], [.85, -1.35], [-.85, 1.35], [.85, 1.35]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .25, 16).rotateZ(Math.PI / 2), tire); w.position.set(x, .34, z); g.add(w); wheels.push(w); }
  const hl = new THREE.MeshBasicMaterial({ color: '#fff6dd' }), tl = new THREE.MeshBasicMaterial({ color: '#ff2020' });
  for (const x of [-.6, .6]) { const a = new THREE.Mesh(new THREE.BoxGeometry(.35, .12, .05), hl); a.position.set(x, .72, -2.21); g.add(a); const b = new THREE.Mesh(new THREE.BoxGeometry(.35, .12, .05), tl); b.position.set(x, .75, 2.21); g.add(b); }
  g.userData.wheels = wheels; return g;
}
function shadowBlob() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })); m.renderOrder = 2; return m;
}
function beaconMesh(color = '#f0c879') {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 160, 16, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .28, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  beam.position.y = 80; g.add(beam);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(9, .6, 8, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color })); ring.position.y = 1.5; g.add(ring);
  return g;
}
function gateMesh(r = 9, color = '#f0c879') { const m = new THREE.Mesh(new THREE.TorusGeometry(r, .5, 8, 48), new THREE.MeshBasicMaterial({ color })); return m; }

function ugvModel() {
  const g = new THREE.Group(), body = MAT('#d9b23a', { roughness: .5 }), dark = MAT('#1d2226'), tire = MAT('#141414', { roughness: .95 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.32, 1.15), body); b.position.y = 0.42; g.add(b);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.8), dark); deck.position.y = 0.61; g.add(deck);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8), dark); mast.position.set(0, 0.88, -0.35); g.add(mast);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.14), dark); head.position.set(0, 1.15, -0.37); g.add(head);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), new THREE.MeshBasicMaterial({ color: '#7fd4ff' })); lens.position.set(0, 1.15, -0.445); lens.rotation.y = Math.PI; g.add(lens);
  const wheels = [];
  for (const z of [-0.45, 0, 0.45]) for (const x of [-0.46, 0.46]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 14).rotateZ(Math.PI / 2), tire); w.position.set(x, 0.17, z); g.add(w); wheels.push(w); }
  g.userData.wheels = wheels; g.userData.wheelR = 0.17; return g;
}
function rovModel() {
  const g = new THREE.Group(), frame = MAT('#f2c230', { roughness: .45 }), dark = MAT('#22282c'), dome = MAT('#9fd3ea', { transparent: true, opacity: .45, roughness: .05 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.34, 0.9), frame); g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.84), MAT('#e9e9e4')); top.position.y = 0.22; g.add(top);
  const d = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), dome); d.position.set(0, 0, -0.45); g.add(d);
  const props = [];
  for (const [x, z] of [[-0.36, 0.3], [0.36, 0.3], [-0.36, -0.3], [0.36, -0.3]]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 12).rotateX(Math.PI / 2), dark); t.position.set(x, 0, z); g.add(t); }
  for (const x of [-0.18, 0.18]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 10).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff8e0' })); l.position.set(x, 0.1, -0.47); g.add(l); }
  const light = new THREE.PointLight('#e8f6ff', 6, 18, 1.6); light.position.set(0, 0.1, -1.0); g.add(light); g.userData.light = light;
  g.userData.props = props; return g;
}

/* ======================= application state, renderer, environment ======================= */
const QUALITY = {
  low: { dpr: 1, factor: 1.4, seg: 24, maxActive: 6, bld: 0, rain: 1500, maxZ: 17, post: 'low', trees: false, treeR: 0 },
  mid: { dpr: 1.5, factor: 1.9, seg: 32, maxActive: 8, bld: 1, rain: 3000, maxZ: 18, post: 'mid', trees: true, treeR: 700 },
  high: { dpr: 2, factor: 2.4, seg: 40, maxActive: 12, bld: 1, rain: 4500, maxZ: 18, post: 'high', trees: true, treeR: 1000 },
};
const IS_TOUCH = matchMedia('(pointer:coarse)').matches;
const IS_MOBILE = IS_TOUCH && Math.min(screen.width, screen.height) < 820;
function autoQuality() { if (IS_MOBILE) return 'mid'; return (navigator.hardwareConcurrency || 4) >= 8 && (navigator.deviceMemory || 8) >= 8 ? 'high' : 'mid'; }
/* user settings (persisted per browser) */
const SET = {
  timeMode: 'morning', season: 'today', wxMode: 'few', kind: 'drone', fov: 100, fisheye: false, quality: 'auto', controls: IS_TOUCH ? 'sticks' : 'keys',
  assist: true, sound: true, buildings: true, trees: true, effects: true, droneMode: 'N', gkey: '',
};
try { Object.assign(SET, JSON.parse(LS.get('aero6:settings') || '{}')); } catch { }
const saveSettings = () => LS.set('aero6:settings', JSON.stringify(SET));
const APP = {
  state: 'boot', place: null, kind: 'drone', veh: null, model: null, cam: 'chase', t: 0, quality: 'mid', paused: true, started: false,
  sun: { date: '2026-01-01', min: 720 }, live: false, sunDir: new THREE.Vector3(0, 1, 0), sunAlt: 45, sunAz: 90, moonDir: new THREE.Vector3(0, -1, 0), moonAlt: -10, moonFrac: 0,
  capture: false, origin: { h: 0 }, spawnAt: null, toastUntil: 0, google: null, gust: new THREE.Vector3(), windBase: new THREE.Vector3(), isSea: true, frameN: 0,
  look: { yaw: 0, pitch: 0, idle: 0, drag: false }, zoom: 1, sunVis: 0, under: 0, cloudBase: 1500, vis: 25000, W: null, night: 0, moonLight: 0, autoTakeoff: false,
  fps: 60, fpsLow: 0, lastLoad: 0,
};
let renderer, scene, camera, sky, sunLight, hemi, ocean, oceanFar, clouds, rain, snow, blob, oceanMat, lakeMat;

function initRenderer() {
  const Q = QUALITY[APP.quality];
  if (renderer) { renderer.setPixelRatio(Math.min(devicePixelRatio, IS_MOBILE ? Math.min(Q.dpr, 1.5) : Q.dpr)); resize(); POST.init(renderer, scene, camera, Q.post); return; }
  renderer = new THREE.WebGLRenderer({ canvas: $('#view'), antialias: Q.post === 'low', logarithmicDepthBuffer: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, IS_MOBILE ? Math.min(Q.dpr, 1.5) : Q.dpr)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
  MAX_ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(70, 1, 0.08, 250000); camera.rotation.order = 'YXZ';
  scene.fog = new THREE.FogExp2(0xbfd6ea, 1 / 30000);
  sky = makeSky(); scene.add(sky);
  scene.add(TERRAIN.group, VEC.group, TREES.group);
  sunLight = new THREE.DirectionalLight(0xffffff, 2); scene.add(sunLight, sunLight.target);
  hemi = new THREE.HemisphereLight(0xbcd8f0, 0x4a4136, 1.5); scene.add(hemi);
  FACADE = facadeTextures(); VEC.mat = BUILDING_MAT();
  oceanMat = bindWater(makeWaterMaterial(true)); lakeMat = bindWater(makeWaterMaterial(false)); VEC.waterMat = lakeMat;
  ocean = new THREE.Mesh(new THREE.PlaneGeometry(2800, 2800, 320, 320).rotateX(-Math.PI / 2), oceanMat); ocean.frustumCulled = false; ocean.renderOrder = 1;
  oceanFar = new THREE.Mesh(new THREE.RingGeometry(1350, 240000, 96, 1).rotateX(-Math.PI / 2), bindWater(makeWaterMaterial(false))); oceanFar.frustumCulled = false; oceanFar.renderOrder = 1;
  clouds = makeClouds(); rain = makeRain(Q.rain); snow = makeSnow(); blob = shadowBlob();
  scene.add(ocean, oceanFar, clouds, rain, snow, blob, BUOYS.group);
  POST.init(renderer, scene, camera, Q.post);
  addEventListener('resize', resize); new ResizeObserver(resize).observe($('#stage')); resize();
}
function resize() {
  if (!renderer) return; const st = $('#stage'), w = st.clientWidth || innerWidth, h = st.clientHeight || innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; applyFov(); POST.resize(renderer); APP.google?.tiles.setResolutionFromRenderer(camera, renderer);
}
/* horizontal field of view (the setting) -> vertical camera FOV; the fisheye lens renders wider and bends it in post */
function applyFov() {
  if (!camera) return; const fish = SET.fisheye && POST.enabled, base = (APP.cam === 'fpv' ? SET.fov + 5 : SET.fov) / APP.zoom;
  const h = clamp(fish ? Math.min(150, base + 30) : base, 20, 150) * rad, a = camera.aspect || 1;
  camera.fov = clamp(2 * Math.atan(Math.tan(h / 2) / a) * deg, 18, 118); camera.updateProjectionMatrix();
  POST.set({ uFish: fish ? 1 : 0, uTanMax: Math.tan(Math.min(h, 2.6) / 2) });
}

/* ---------- environment seen by the physics ---------- */
const ENV = {
  waterLevel: 0.25, waveHs: 0,
  groundAt(x, z) { let h = DEM.heightAt(x, z); if (APP.google?.corr != null && (APP.kind === 'drone' || APP.kind === 'plane')) h += APP.google.corr; if (APP.kind === 'rov') { const b = VEC.bedAt(x, z); if (b != null) h = Math.min(h, b); } return h; },
  roofAt(x, z) { return SET.buildings ? VEC.roofAt(x, z) : null; },
  wind(p) { const agl = Math.max(2, p.y - DEM.heightAt(p.x, p.z)); const k = Math.min(2.2, Math.pow(agl / 10, 0.14)); return new THREE.Vector3(APP.windBase.x * k + APP.gust.x, APP.gust.y * 0.3, APP.windBase.z * k + APP.gust.z); },
  isWater(x, z) { const w = VEC.waterAt(x, z); if (w) return true; return DEM.heightAt(x, z) < 0.2; },
  levelAt(x, z) { const w = VEC.waterAt(x, z); if (w && w.cls !== 'ocean' && w.level > 0.6) return { level: w.level + 0.35, sea: false }; return { level: 0.25, sea: true }; },
  wave(x, z, t) { return waveHeight(x, z, t, APP.isSea ? 1 : clamp(0.04 + (APP.W?.wind ?? WX.wind) * 0.015, 0.04, 0.25)); },
  road(x, z) { return VEC.road(x, z); },
};

/* ---------- weather ---------- */
function effectiveWeather() {
  const p = WEATHER_PRESETS[SET.wxMode]; if (SET.wxMode === 'live' || !p) return { ...WX, kind: WX.kind || 'cumulus' };
  return { ...WX, ...p, temp: p.temp ?? (WX.ok ? WX.temp : 24), dew: p.dew ?? (p.base ? (p.temp ?? 24) - p.base / 125 : WX.dew), windDir: WX.windDir, wDir: WX.wDir, tp: Math.max(3, Math.sqrt(p.hs) * 4.5), storm: !!p.storm, snow: !!p.snow, code: p.precip > 0 ? (p.snow ? 73 : p.storm ? 95 : 61) : 1 };
}
function applyWeather() {
  const W = APP.W = effectiveWeather(), Q = QUALITY[APP.quality];
  const d = (W.windDir ?? 90) * rad; APP.windBase.set(-Math.sin(d) * W.wind, 0, Math.cos(d) * W.wind);   // wind blows FROM windDir
  APP.vis = clamp(W.vis ?? 25000, 250, 60000);
  APP.cloudBase = APP.origin.h + clamp((W.base ?? 125 * Math.max(1, (W.temp ?? 25) - (W.dew ?? 18))), 60, 3200);
  const cov = clamp((W.cloud ?? 20) / 100, 0, 1), kind = W.kind || 'cumulus', sharp = kind === 'cumulus' ? 1 : kind === 'mixed' ? 0.55 : 0.12, scale = kind === 'stratus' ? 5200 : kind === 'mixed' ? 3400 : 2300;
  const cu = clouds.material.uniforms; clouds.position.y = APP.cloudBase; cu.uCover.value = cov; cu.uSharp.value = sharp; cu.uScale.value = scale; cu.uAlpha.value = kind === 'stratus' ? 0.97 : 0.93;
  clouds.visible = cov > 0.03;
  TERRAIN_U.uCloud.value.set(cov, scale, sharp, APP.cloudBase); TERRAIN_U.uCloudShade.value = SET.effects && cov > 0.03 && cov < 0.92 ? 0.42 * (0.4 + 0.6 * sharp) : 0;
  const precip = W.precip ?? 0, isSnow = !!W.snow || (precip > 0.1 && (W.temp ?? 10) < 0.5);
  rain.visible = precip > 0.1 && !isSnow; snow.visible = isSnow;
  rain.geometry.setDrawRange(0, Math.round(rain.geometry.attributes.position.count * clamp(0.25 + precip / 14, 0.25, 1)));
  rain.material.opacity = clamp(0.28 + precip / 40, 0.28, 0.6);
  TERRAIN_U.uWet.value = rain.visible ? clamp(0.45 + precip / 10, 0, 1) : 0; WATER_U.uRain.value = rain.visible ? clamp(precip / 8, 0.15, 1) : 0;
  setWaves(clamp(W.hs ?? 0.5, 0.05, 6), W.wDir ?? W.windDir ?? 90, W.tp ?? 6); ENV.waveHs = W.hs ?? 0.5;
  STORM.active = !!W.storm;
  applyTime();
}

/* ---------- time of day, moon, season: lighting, sky, colour grade ---------- */
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function setTimePreset(mode) { SET.timeMode = mode; const r = resolveTime(mode, SET.season, APP.place); APP.sun.date = r.date; APP.sun.min = r.min; APP.live = !!r.live; refineSunTime(mode); applyTime(); }
/* dawn / dusk: the moment the real sun clears (or meets) the local terrain horizon seen from the destination — valleys see it later */
function sunBlocked(date, min, p, eyeY) {
  const s = sunPos(localToDate(p, date, min), p.lat, p.lon); if (s.alt < -0.5) return true;
  const h = bearingVec(s.az, _v3), ca = Math.cos(s.alt * rad), sa = Math.sin(s.alt * rad);
  for (const dd of [60, 120, 250, 500, 1000, 2000, 3500, 5000, 7500, 10000, 14000, 20000, 28000, 40000]) if (DEM.heightAt(h.x * ca * dd, h.z * ca * dd) > eyeY + sa * dd) return true;
  return false;
}
function refineSunTime(mode) {
  const p = APP.place; if (!p || (mode !== 'dawn' && mode !== 'dusk') || !DEM.cache.size) return;
  const st = sunTimesOf(p, APP.sun.date), eye = APP.origin.h + 40;
  if (mode === 'dawn') { for (let m = st.rise - 6; m < st.rise + 240; m += 3) if (!sunBlocked(APP.sun.date, m, p, eye)) { APP.sun.min = m + 9; return; } }
  else { for (let m = st.set + 6; m > st.set - 240; m -= 3) if (!sunBlocked(APP.sun.date, m, p, eye)) { APP.sun.min = m - 12; return; } }
}
function applyTime() {
  const p = APP.place; if (!p || !sky) return;
  const when = localToDate(p, APP.sun.date, APP.sun.min);
  const s = sunPos(when, p.lat, p.lon); APP.sunAlt = s.alt; APP.sunAz = s.az;
  APP.sunDir.copy(bearingVec(s.az)).multiplyScalar(Math.cos(s.alt * rad)); APP.sunDir.y = Math.sin(s.alt * rad); APP.sunDir.normalize();
  const m = moonPos(when, p.lat, p.lon), mi = moonIllum(when); APP.moonAlt = m.alt; APP.moonFrac = mi.fraction;
  APP.moonDir.copy(bearingVec(m.az)).multiplyScalar(Math.cos(m.alt * rad)); APP.moonDir.y = Math.sin(m.alt * rad); APP.moonDir.normalize();
  const W = APP.W || WX, cov = clamp((W.cloud ?? 20) / 100, 0, 1), haze = clamp(1 - APP.vis / 25000, 0, 1), K = skyAt(s.alt);
  const night = APP.night = clamp((-s.alt - 2) / 10, 0, 1);
  const moonLight = APP.moonLight = night * mi.fraction * clamp(m.alt / 18, 0, 1) * (1 - 0.8 * cov);
  const dayK = clamp((s.alt + 6) / 20, 0, 1);
  // sky colours: overcast greys by day, moon-lifted blues by night
  const zen = _c1.set(K.zen).lerp(_c2.set('#8b949c').multiplyScalar(0.25 + 0.75 * dayK), cov * 0.65).lerp(_c2.set('#14244a'), moonLight * 0.8).clone();
  const hor = _c1.set(K.hor).lerp(_c2.set('#a7b0b6').multiplyScalar(0.2 + 0.8 * dayK), Math.max(cov * 0.5, haze * 0.8)).lerp(_c2.set('#25335a'), moonLight * 0.7).clone();
  const U = sky.material.uniforms; U.uSun.value.copy(APP.sunDir); U.uMoon.value.copy(APP.moonDir); U.uZen.value.copy(zen); U.uHor.value.copy(hor); U.uSunCol.value.set(K.sun);
  U.uStars.value = clamp((-s.alt - 5) / 9, 0, 1) * (1 - 0.65 * moonLight / Math.max(night, 0.01) * night); U.uCloud.value = cov; U.uMoonLit.value = mi.fraction; U.uHdr.value = POST.enabled ? 1 : 0;
  scene.fog.color.copy(hor); renderer.setClearColor(hor);
  const dim = 1 - 0.55 * cov, sunUp = s.alt > -1;
  // key light: the sun by day, the moon by night (faint, blue)
  if (sunUp || moonLight < 0.02) { sunLight.color.set(K.sun); sunLight.intensity = Math.PI * 0.85 * K.light * dim; }
  else { sunLight.color.set('#a9bbe6'); sunLight.intensity = Math.PI * 0.16 * moonLight; }
  hemi.color.copy(zen).lerp(_c2.set('#ffffff'), 0.4); hemi.groundColor.set('#4a4136'); hemi.intensity = Math.PI * 0.75 * (K.amb + 0.1 * moonLight);
  const keyDir = sunUp ? APP.sunDir : moonLight > 0.02 ? APP.moonDir : new THREE.Vector3(0, 1, 0);
  TERRAIN_U.uSun.value.copy(keyDir); TERRAIN_U.uRelief.value = sunUp ? K.relief * (1 - 0.7 * cov) : 0.12 + 0.3 * moonLight;
  const tint = _c1.set(K.tint).multiplyScalar(lerp(1, 0.8, cov) * (s.alt < -6 ? 0.55 : 1)).lerp(_c2.set('#6878a6'), moonLight * 0.85);
  TERRAIN_U.uTint.value.copy(tint);
  WATER_U.uSun.value.copy(sunUp ? APP.sunDir : APP.moonDir); WATER_U.uSunCol.value.set(sunUp ? K.sun : '#9fb0d8').multiplyScalar(sunUp ? 1 - 0.85 * cov : moonLight * 0.6); WATER_U.uSky.value.copy(zen); WATER_U.uHor.value.copy(hor);
  WATER_U.uLight.value = clamp(K.light * dim + 0.12 + moonLight * 0.25, 0.04, 1);
  const cu = clouds.material.uniforms; cu.uSunCol.value.set('#ffffff').lerp(_c2.set(K.sun), 0.35).multiplyScalar(clamp(0.22 + K.light * 0.85 + moonLight * 0.25, 0.08, 1)); cu.uShade.value.copy(hor).multiplyScalar(0.62); cu.uSun.value.copy(APP.sunDir);
  VEC.mat.emissiveIntensity = night * 0.9;
  applySeason(); applyGrade();
}
/* foliage colour, deciduous trees and snow line follow the real date and latitude */
function applySeason() {
  const p = APP.place, w = seasonWeights(APP.sun.date, p.lat), lat = Math.abs(p.lat), A = clamp((lat - 18) / 25, 0.08, 1);   // subtropics change little
  TERRAIN_U.uSeason.value.set(w.autumn * A, w.winter * A * 0.85, w.spring * A * 0.8, w.summer * 0.6);
  const name = Object.entries(w).sort((a, b) => b[1] - a[1])[0][0]; APP.seasonName = name;
  TREES.setSeason(name, p.lat);
  const lineW = clamp(3600 - (lat - 20) * 90, 0, 5200), lineS = clamp(5200 - (lat - 20) * 80, 300, 6000);
  let line = lineS * (1 - w.winter) + lineW * w.winter - (w.autumn + w.spring) * (lineS - lineW) * 0.25, amt = lat < 18 ? 0.4 : 1;
  if (snow?.visible) { line = Math.min(line, APP.origin.h - 80); amt = 1; }
  TERRAIN_U.uSnow.value.set(line, amt);
}
/* colour grade: a real camera's exposure, white balance and contrast for this light and weather */
function applyGrade() {
  if (!POST.enabled) return;
  const W = APP.W || WX, cov = clamp((W.cloud ?? 20) / 100, 0, 1), alt = APP.sunAlt, night = APP.night, ml = APP.moonLight, precip = W.precip ?? 0;
  const golden = clamp(1 - Math.abs(alt - 4) / 12, 0, 1) * (1 - cov * 0.7);
  let exposure = lerp(1, ml > 0.05 ? 1.9 : 1.45, night), contrast = lerp(1.06, 0.92, cov) - 0.06 * clamp(precip / 6, 0, 1), sat = lerp(1.06, 0.82, cov) - 0.45 * night;
  const tint = [1 + 0.07 * golden - 0.08 * night, 1 - 0.01 * golden - 0.02 * night, 1 - 0.08 * golden + 0.14 * night];
  if (precip > 0.1) exposure *= lerp(0.95, 0.8, clamp(precip / 12, 0, 1));
  if (W.storm) exposure *= 0.85;
  if (W.snow) { exposure *= 1.06; sat *= 0.9; }
  POST.set({ uExposure: exposure, uContrast: contrast, uSat: Math.max(0.35, sat), uTint: tint, uGrain: SET.effects ? 0.012 + 0.03 * night : 0, uVignette: SET.effects ? 0.2 + 0.1 * night : 0.08, uLift: 0.004 * night,
    uGlare: SET.effects ? 1 : 0, uRain: SET.effects && rain.visible ? clamp(0.35 + precip / 10, 0, 1) : 0 });
  if (POST.bloom) { POST.bloom.strength = (IS_MOBILE ? 0.38 : 0.5) + 0.25 * night; POST.bloom.threshold = night > 0.5 ? 0.85 : 1.0; }
}

/* ---------- spawning ---------- */
const VEH_CLASS = { drone: DronePhysics, plane: PlanePhysics, boat: BoatPhysics, car: CarPhysics, ugv: UgvPhysics, rov: RovPhysics };
const VEH_MODEL = { drone: droneModel, plane: planeModel, boat: boatModel, car: carModel, ugv: ugvModel, rov: rovModel };
function openWater(x, z, r) { for (let a = 0; a < 8; a++) if (!ENV.isWater(x + Math.sin(a * Math.PI / 4) * r, z + Math.cos(a * Math.PI / 4) * r)) return false; return ENV.isWater(x, z); }
function findWater(maxR = 8000) {
  for (const clear of [35, 15]) for (let r = 0; r <= maxR; r += r < 400 ? 25 : 60) { const n = r === 0 ? 1 : Math.max(8, Math.round(2 * Math.PI * r / 60)); for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI, x = Math.sin(a) * r, z = -Math.cos(a) * r; if (openWater(x, z, clear)) return { x, z }; } }
  return null;
}
function openHeading(x, z) {
  let best = 0, score = -1; const toO = Math.atan2(x, z);
  for (let k = 0; k < 24; k++) { const h = k / 24 * 2 * Math.PI, f = fwdOf(h); let run = 0; for (let d = 10; d <= 500; d += 15) { if (!ENV.isWater(x + f.x * d, z + f.z * d)) break; run = d; }
    const s = Math.min(run, 300) - Math.abs(Math.atan2(Math.sin(h - toO), Math.cos(h - toO))) * 40; if (s > score) { score = s; best = h; } }
  return best;
}
function dryGround(minR, maxR) {
  for (let r = minR; r <= maxR; r += 6) for (let a = 0; a < 16; a++) { const an = a / 16 * Math.PI * 2 + r * 0.01, x = Math.sin(an) * r, z = -Math.cos(an) * r; if (!VEC.roofAt(x, z) && !ENV.isWater(x, z) && !ENV.isWater(x * 0.8, z * 0.8)) return { x, z }; }
  return { x: 0, z: minR };
}
async function spawn(kind) {
  APP.kind = kind; SET.kind = kind; if (APP.model) scene.remove(APP.model);
  const v = new VEH_CLASS[kind](); APP.veh = v; APP.model = VEH_MODEL[kind](); scene.add(APP.model);
  const g0 = DEM.heightAt(0, 0); let msg = '';
  if (kind === 'drone') {
    const sp = dryGround(22, 160); v.spawn(sp.x, DEM.heightAt(sp.x, sp.z) + 0.15, sp.z, Math.atan2(sp.x, sp.z)); v.mode = SET.droneMode in DRONE_MODES ? SET.droneMode : 'N';
  } else if (kind === 'ugv') {
    const r = VEC.nearestRoadPoint(0, 0, 220); const sp = r && !ENV.isWater(r.x, r.z) ? r : dryGround(12, 200);
    v.spawn(sp.x, DEM.heightAt(sp.x, sp.z), sp.z, Math.atan2(sp.x, sp.z));
  } else if (kind === 'plane') {
    const ang = 200 * rad, d = 2600, x = Math.sin(ang) * d, z = -Math.cos(ang) * d; let hmax = g0;
    for (let s = 0; s <= 1; s += 0.05) hmax = Math.max(hmax, DEM.heightAt(x * (1 - s), z * (1 - s)));
    v.spawn(x, hmax + 380, z, Math.atan2(x, z), 52);
  } else if (kind === 'boat' || kind === 'rov') {
    const w = findWater(); if (!w) { msg = 'toast.noWater'; return spawn('drone').then(() => msg); }
    const lv = ENV.levelAt(w.x, w.z); APP.isSea = lv.sea; ENV.waterLevel = lv.level;
    if (kind === 'boat') v.spawn(w.x, lv.level, w.z, openHeading(w.x, w.z));
    else { APP.kind = 'rov'; const floor = ENV.groundAt(w.x, w.z); v.spawn(w.x, Math.max(floor + 1, lv.level - 3), w.z, openHeading(w.x, w.z)); }
  } else if (kind === 'car') {
    const r = VEC.nearestRoadPoint(0, 0, 3000);
    if (r) v.spawn(r.x, DEM.heightAt(r.x, r.z), r.z, r.h); else { const sp = dryGround(20, 300); v.spawn(sp.x, DEM.heightAt(sp.x, sp.z), sp.z, 0); msg = 'toast.noRoad'; }
  }
  APP.spawnAt = { x: v.pos.x, y: v.pos.y, z: v.pos.z, h: v.heading };
  APP.cam = 'chase'; camSmooth.init = false; APP.look.yaw = APP.look.pitch = 0; APP.autoTakeoff = false;
  AUDIO.setKind(kind); onVehicleChanged?.();
  return msg;
}

/* ---------- camera rigs (chase / first person / orbit / top) with free look ---------- */
const CAMS = ['chase', 'fpv', 'orbit', 'top'];
const camSmooth = { init: false, pos: new THREE.Vector3(), look: new THREE.Vector3(), orbitA: 0 };
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _e1 = new THREE.Euler(0, 0, 0, 'YXZ');
function vehicleQuat(v, out) { if (v.kind === 'plane') return out.copy(v.quat); return out.setFromEuler(_e1.set(v.pitch || 0, v.heading, v.roll || 0, 'YXZ')); }
const CAM_DIST = { drone: [3.4, 1.15], plane: [19, 5], boat: [13, 4.2], car: [8.5, 2.8], ugv: [3.6, 1.6], rov: [3.2, 0.9] };
function updateCamera(dt) {
  const v = APP.veh, p = v.pos, k = 1 - Math.exp(-dt * 5), f = fwdOf(v.heading, _v1), L = APP.look;
  if (!L.drag) { L.idle += dt; if (L.idle > 1.6) { const d = 1 - Math.exp(-dt * 2.5); L.yaw -= L.yaw * d; L.pitch -= L.pitch * d; } }
  if (APP.cam === 'fpv') {
    if (v.kind === 'drone' || v.kind === 'rov') { camera.position.set(p.x, p.y - 0.06, p.z); camera.rotation.set(clamp(v.gimbal + L.pitch, -1.55, 1.2), v.heading + L.yaw, 0, 'YXZ'); }
    else {
      const off = { plane: [0, 0.95, -1.2], boat: [0, 1.75, 0.7], car: [-0.35, 1.2, 0.2], ugv: [0, 1.15, -0.42] }[v.kind]; vehicleQuat(v, _q1);
      camera.position.copy(p).add(_v2.set(...off).applyQuaternion(_q1)); camera.quaternion.copy(_q1); if (v.kind === 'plane') camera.rotateX(-0.05);
      camera.rotateY(L.yaw); camera.rotateX(L.pitch);
    }
    camSmooth.init = false; return;
  }
  if (APP.cam === 'top') { camera.position.set(p.x, p.y + (v.kind === 'plane' ? 600 : 140), p.z + 0.01); camera.rotation.set(-Math.PI / 2, -L.yaw, 0, 'YXZ'); camSmooth.init = false; return; }
  const D = CAM_DIST[v.kind]; let want;
  if (APP.cam === 'orbit') { camSmooth.orbitA += dt * 0.25; const a = camSmooth.orbitA + L.yaw; want = _v2.set(p.x + Math.sin(a) * D[0] * 2.2, p.y + D[1] * 2 + L.pitch * D[0] * -2, p.z + Math.cos(a) * D[0] * 2.2); }
  else {
    let dir = f; if (v.kind === 'plane') { dir = _v3.set(0, 0, -1).applyQuaternion(v.quat); dir.y *= 0.5; dir.normalize(); }
    const a = Math.atan2(-dir.x, -dir.z) + L.yaw, cp = Math.cos(L.pitch * 0.9), sp = Math.sin(-L.pitch * 0.9);
    want = _v2.set(p.x + Math.sin(a) * D[0] * cp, p.y + D[1] - (v.kind === 'plane' ? dir.y * D[0] : 0) + sp * D[0], p.z + Math.cos(a) * D[0] * cp);
  }
  if (!camSmooth.init) { camSmooth.pos.copy(want); camSmooth.init = true; } else camSmooth.pos.lerp(want, L.drag ? 1 - Math.exp(-dt * 14) : v.kind === 'plane' ? 1 - Math.exp(-dt * 8) : k);
  const gmin = (v.kind === 'rov' ? DEM.heightAt(camSmooth.pos.x, camSmooth.pos.z) + 0.6 : ENV.groundAt(camSmooth.pos.x, camSmooth.pos.z) + 1.2); if (camSmooth.pos.y < gmin) camSmooth.pos.y = gmin;
  if (v.kind === 'rov') { const L0 = ENV.waterLevel - 0.4; if (camSmooth.pos.y > L0 && p.y < L0) camSmooth.pos.y = L0; }
  const cr = VEC.roofAt(camSmooth.pos.x, camSmooth.pos.z); if (cr && camSmooth.pos.y < cr.top + 1.5 && camSmooth.pos.y > cr.base - 1) camSmooth.pos.y = cr.top + 1.5;
  camera.position.copy(camSmooth.pos);
  if (APP.cam === 'orbit') camera.lookAt(p.x, p.y, p.z); else camera.lookAt(p.x + f.x * 2, p.y + D[1] * 0.25, p.z + f.z * 2);
}

/* ---------- synthesized audio: motor/engine, wind, rain, thunder ---------- */
const AUDIO = {
  ctx: null, nodes: null, kind: 'drone',
  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    try {
      const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)(); const master = ctx.createGain(); master.gain.value = SET.sound ? 0.5 : 0; master.connect(ctx.destination);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500; const eg = ctx.createGain(); eg.gain.value = 0; lp.connect(eg).connect(master);
      const oscs = [['sawtooth', 0], ['sawtooth', 9], ['square', -7], ['triangle', 3]].map(([t, det]) => { const o = ctx.createOscillator(); o.type = t; o.detune.value = det; const gg = ctx.createGain(); gg.gain.value = t === 'square' ? .25 : .35; o.connect(gg).connect(lp); o.start(); return o; });
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = .6; const wg = ctx.createGain(); wg.gain.value = 0; noise.connect(bp).connect(wg).connect(master); noise.start();
      const noise2 = ctx.createBufferSource(); noise2.buffer = buf; noise2.loop = true; noise2.playbackRate.value = 0.7; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500; const rg = ctx.createGain(); rg.gain.value = 0; noise2.connect(hp).connect(rg).connect(master); noise2.start();
      this.nodes = { master, lp, eg, oscs, bp, wg, rg, buf };
    } catch { }
  },
  setKind(k) { this.kind = k; },
  setMute(m) { if (this.nodes) this.nodes.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05); },
  thunder(gain) {
    const n = this.nodes; if (!n || !SET.sound) return; const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = n.buf; src.playbackRate.value = 0.35 + Math.random() * 0.2; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180 + gain * 260;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9 * gain, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 2.5 + gain * 2); src.connect(lp).connect(g).connect(n.master); src.start(t); src.stop(t + 5);
  },
  update(v, paused) {
    const n = this.nodes; if (!n) return; const t = this.ctx.currentTime;
    let f = 100, load = 0.2, cut = 1500, wind = 0;
    if (paused) load = 0;
    else if (v.kind === 'drone') { f = 150 + v.thrust * 170; load = v.landed || v.crashed ? 0 : 0.12 + v.thrust * 0.22; cut = 2600; wind = Math.hypot(v.vel.x, v.vel.z) / 25; }
    else if (v.kind === 'plane') { f = 62 + v.throttle * 46; load = v.crashed ? 0 : 0.2 + v.throttle * 0.25; cut = 900; wind = v.airspeed / 60; }
    else if (v.kind === 'boat') { f = 55 + Math.abs(v.throttle) * 120 + Math.abs(v.u) * 2; load = 0.12 + Math.abs(v.throttle) * 0.3; cut = 1300; wind = Math.abs(v.u) / 30; }
    else if (v.kind === 'car') { f = v.rpm / 60 * 2; load = 0.12 + Math.max(0, APP.lastIn?.fwd || 0) * 0.25; cut = 1100; wind = Math.abs(v.v) / 45; }
    else if (v.kind === 'ugv') { f = 220 + Math.abs(v.v) * 90; load = 0.04 + Math.abs(v.v) * 0.04; cut = 2200; }
    else if (v.kind === 'rov') { f = 260 + v.thrust * 220; load = 0.03 + v.thrust * 0.1; cut = 700; }
    n.oscs.forEach((o, i) => o.frequency.setTargetAtTime(f * (i === 3 ? 2 : 1), t, 0.06));
    n.lp.frequency.setTargetAtTime(cut, t, 0.1); n.eg.gain.setTargetAtTime(load * 0.6, t, 0.08);
    const under = APP.under > 0.5;
    n.wg.gain.setTargetAtTime(under ? 0.05 : clamp(wind * wind, 0, 1) * 0.5 + (APP.W?.wind ?? 0) / 60, t, 0.2); n.bp.frequency.setTargetAtTime(under ? 160 : 300 + wind * 900, t, 0.2);
    n.rg.gain.setTargetAtTime(rain.visible && !under ? clamp(0.04 + (APP.W?.precip ?? 0) / 60, 0, 0.3) : 0, t, 0.3);
  },
};

/* ---------- vehicle model pose, contact shadow, lamps ---------- */
function updateModel(dt) {
  const v = APP.veh, m = APP.model; m.position.copy(v.pos); vehicleQuat(v, m.quaternion);
  if (v.kind === 'boat') m.position.y -= 0.1;
  if (m.userData.props) for (const pr of m.userData.props) pr.rotation.z += dt * (APP.paused ? 0 : 60);
  if (m.userData.wheels) for (const w of m.userData.wheels) w.rotation.x -= (v.v || 0) * dt / (m.userData.wheelR || 0.34);
  m.visible = !(APP.cam === 'fpv' && v.kind !== 'car' && v.kind !== 'boat');
  const sd = APP.sunDir, size = { drone: 0.7, plane: 11, boat: 6.5, car: 4.8, ugv: 1.3, rov: 1 }[v.kind];
  let gx = v.pos.x, gz = v.pos.z; const onWater = v.kind === 'boat', g0 = onWater ? v.pos.y : ENV.groundAt(gx, gz), hgt = onWater ? 0 : Math.max(0, v.pos.y - g0);
  if (sd.y > 0.1) { gx -= sd.x / sd.y * hgt; gz -= sd.z / sd.y * hgt; }
  const roof = VEC.roofAt(gx, gz), gy = onWater ? v.pos.y + 0.05 : Math.max(ENV.groundAt(gx, gz), roof && roof.top < v.pos.y ? roof.top : -1e9) + 0.08;
  blob.position.set(gx, gy, gz); blob.rotation.y = v.heading; blob.scale.set(size * (['car', 'boat', 'ugv'].includes(v.kind) ? 0.5 : 1), 1, size);
  blob.material.opacity = sd.y > 0.05 && v.kind !== 'rov' ? clamp(1 - hgt / (size * 40), 0, 1) * (1 - 0.6 * clamp((APP.W?.cloud ?? 0) / 100, 0, 1)) : 0;
  // lamps: ROV floodlight under water, headlights at night (the terrain is lit in its shader, buildings by a real light)
  const lampOn = v.kind === 'rov' ? APP.under > 0.5 || APP.night > 0.3 : (v.kind === 'car' || v.kind === 'ugv') && APP.night > 0.35;
  if (m.userData.light) m.userData.light.visible = lampOn;
  if (lampOn) { const f = fwdOf(v.heading, _v1); TERRAIN_U.uLamp.value.set(v.pos.x + f.x * 0.5, v.pos.y + (v.kind === 'rov' ? 0.1 : 0.8), v.pos.z + f.z * 0.5, v.kind === 'car' ? 70 : 28); TERRAIN_U.uLampDir.value.set(f.x, v.kind === 'rov' ? -0.35 : -0.12, f.z, v.kind === 'rov' ? 0.55 : 0.82).normalize(); TERRAIN_U.uLampDir.value.w = v.kind === 'rov' ? 0.55 : 0.82; TERRAIN_U.uLampI.value = v.kind === 'rov' ? 2.2 : 3.0; }
  else TERRAIN_U.uLampI.value = 0;
}

/* ---------- dropped marker buoys (G) ---------- */
const BUOYS = {
  group: new THREE.Group(), list: [],
  mesh() {
    const g = new THREE.Group(), body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.7, 12), MAT('#ff6a1f', { roughness: 0.5 })); body.position.y = 0.2; g.add(body);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.12, 12), MAT('#f5f5f0')); band.position.y = 0.2; g.add(band);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff3a0' })); lamp.position.y = 0.62; g.add(lamp); g.userData.lamp = lamp; return g;
  },
  drop(v) {
    const o = this.mesh(); o.position.copy(v.pos); o.position.y -= 0.2; this.group.add(o); const b = { o, vy: 0, landed: false, t: 0 }; this.list.push(b);
    if (this.list.length > 24) { const old = this.list.shift(); this.group.remove(old.o); }
    return b;
  },
  update(dt, t) {
    for (const b of this.list) {
      const p = b.o.position, water = ENV.isWater(p.x, p.z), lv = water ? ENV.levelAt(p.x, p.z).level + waveHeight(p.x, p.z, t, APP.isSea ? 1 : 0.15) : -1e9, roof = VEC.roofAt(p.x, p.z), floor = Math.max(DEM.heightAt(p.x, p.z), roof ? roof.top : -1e9, lv - 0.15);
      if (!b.landed) { b.vy -= G0 * dt; p.y += b.vy * dt; if (p.y <= floor) { p.y = floor; b.landed = true; b.vy = 0; } }
      else if (water) p.y += (lv - 0.15 - p.y) * Math.min(1, dt * 4);
      b.o.userData.lamp.visible = Math.floor(t * 2) % 2 === 0;
    }
  },
  clear() { for (const b of this.list) this.group.remove(b.o); this.list = []; },
};

/* ======================= input: keyboard, on-screen pads & sticks, gamepad, free look ======================= */
/* Mode 2 (as AERO v5.1): left hand W A S D = climb/descend & turn, right hand arrows = forward/back & slide.
   Plane: W/S throttle, A/D rudder, arrows pitch & roll. Car, boat, UGV: W/S or ↑/↓ throttle, A/D or ←/→ steer. ROV like the drone. */
const KEYS = new Set(), PADKEYS = new Map(), SM = {};
const typing = el => !!el?.closest?.('input,textarea,select,[contenteditable]') && el.offsetParent !== null;
addEventListener('keydown', e => {
  if (typing(e.target)) { if (e.code === 'Escape') { e.target.blur(); closeOverlays(); } return; }
  KEYS.add(e.code);
  if (APP.state === 'sim' && !e.repeat) hotkey(e);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code) && APP.state === 'sim') e.preventDefault();
});
addEventListener('keyup', e => KEYS.delete(e.code));
addEventListener('blur', () => { KEYS.clear(); PADKEYS.clear(); $$('.pad b.on').forEach(b => b.classList.remove('on')); });
const keyDown = c => KEYS.has(c) || [...PADKEYS.values()].includes(c);

/* on-screen key pads: press and hold with mouse or fingers, slide between keys, multi-touch */
function bindPad(pad) {
  const update = (id, x, y) => {
    const el = document.elementFromPoint(x, y)?.closest?.('.pad b[data-k]'); const code = el && pad.contains(el) ? el.dataset.k : null;
    const prev = PADKEYS.get(id); if (prev === code) return;
    if (code) PADKEYS.set(id, code); else PADKEYS.delete(id);
    $$('b[data-k]', pad).forEach(b => b.classList.toggle('on', [...PADKEYS.values()].includes(b.dataset.k)));
  };
  pad.addEventListener('pointerdown', e => { if (!e.target.closest('b[data-k]')) return; e.preventDefault(); pad.setPointerCapture(e.pointerId); AUDIO.start(); update(e.pointerId, e.clientX, e.clientY); });
  pad.addEventListener('pointermove', e => { if (PADKEYS.has(e.pointerId) || pad.hasPointerCapture(e.pointerId)) update(e.pointerId, e.clientX, e.clientY); });
  const up = e => { PADKEYS.delete(e.pointerId); $$('b[data-k]', pad).forEach(b => b.classList.toggle('on', [...PADKEYS.values()].includes(b.dataset.k))); };
  pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up); pad.addEventListener('lostpointercapture', up);
  pad.addEventListener('contextmenu', e => e.preventDefault());
}
/* analog sticks (touch default): the knob springs back to centre */
const STICK = { L: { x: 0, y: 0 }, R: { x: 0, y: 0 } };
function bindStick(el, s) {
  const knob = el.querySelector('i'); let id = null, cx = 0, cy = 0, rr = 50;
  el.addEventListener('pointerdown', e => { e.preventDefault(); id = e.pointerId; el.setPointerCapture(id); AUDIO.start(); const r = el.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; rr = r.width * 0.36; move(e); });
  const move = e => { if (e.pointerId !== id) return; let dx = (e.clientX - cx) / rr, dy = (e.clientY - cy) / rr; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; } s.x = dx; s.y = -dy; knob.style.transform = `translate(${dx * rr}px,${dy * rr}px)`; };
  el.addEventListener('pointermove', move);
  const up = e => { if (e.pointerId !== id) return; id = null; s.x = 0; s.y = 0; knob.style.transform = ''; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
const dz = v => Math.abs(v) < 0.08 ? 0 : v;
const pick = (...vals) => vals.reduce((a, b) => Math.abs(b) > Math.abs(a) ? b : a, 0);
function ramp(name, target, dt, rate = 3.5) { const c = SM[name] || 0; const n = c + clamp(target - c, -rate * dt, rate * dt); SM[name] = Math.abs(target) < 1e-3 && Math.abs(n) < 0.02 ? 0 : n; return SM[name]; }
/* gamepads are optional: some embedded viewers forbid the Gamepad API (permissions policy) and throw */
let GP_OK = true;
function gamepad() { if (!GP_OK) return null; try { return navigator.getGamepads?.()[0] || null; } catch { GP_OK = false; return null; } }
function readInput(dt) {
  const k = c => keyDown(c) ? 1 : 0, gp = gamepad(), ax = i => gp ? dz(gp.axes[i] || 0) : 0, bt = i => gp?.buttons[i]?.value || 0;
  const kind = APP.kind, L = STICK.L, R = STICK.R;
  const W = k('KeyW'), S = k('KeyS'), A = k('KeyA'), D = k('KeyD'), U = k('ArrowUp'), Dn = k('ArrowDown'), Lf = k('ArrowLeft'), Rt = k('ArrowRight');
  if (kind === 'drone' || kind === 'rov') {
    const inp = {
      up: pick(ramp('u', W - S + k('PageUp') - k('PageDown'), dt), L.y, -ax(1)), yaw: pick(ramp('y', A - D + k('KeyQ') - k('KeyE'), dt, 4), -L.x, -ax(0)),
      fwd: pick(ramp('f', U - Dn, dt), R.y, -ax(3)), right: pick(ramp('r', Rt - Lf, dt), R.x, ax(2)),
    };
    if (APP.autoTakeoff && kind === 'drone') { if (APP.veh.landed || APP.veh.agl < 2.5) inp.up = Math.max(inp.up, 0.7); else APP.autoTakeoff = false; }
    return inp;
  }
  if (kind === 'plane') return {
    throttle: pick(W - S, L.y, -ax(1)), yaw: pick(ramp('y', D - A, dt), L.x, ax(0)),
    pitch: pick(ramp('p', Dn - U, dt, 2.5), -R.y, ax(3)), roll: pick(ramp('o', Rt - Lf, dt, 3), R.x, ax(2)),
    brake: (S && APP.veh?.throttle < 0.05) || bt(6) > .5, assist: SET.assist,
  };
  return { fwd: pick(ramp('f', W + U - S - Dn, dt, 2.5), L.y, R.y, bt(7) - bt(6), -ax(1)), steer: pick(ramp('s', D + Rt - A - Lf, dt, 3), R.x, L.x, ax(0), ax(2)) };
}
function hotkey(e) {
  const c = e.code;
  if (c === 'Space') togglePause();
  else if (c === 'KeyV') cycleCam();
  else if (c === 'KeyF') takePhoto();
  else if (c === 'KeyG') dropBuoy();
  else if (c === 'KeyC') showWhere();
  else if (c === 'KeyB') showStory();
  else if (c === 'KeyR') respawn();
  else if (c === 'KeyM') cycleMode();
  else if (c === 'KeyT') { const ks = Object.keys(TIME_ORDER_KEYS()); const i = ks.indexOf(SET.timeMode); setTimePreset(ks[(i + 1) % ks.length]); syncSettings(); toast(t('time.' + SET.timeMode)); }
  else if (c === 'KeyH') toggleHelp();
  else if (c === 'KeyP') { if (!closeOverlays()) toggleDrawer(); }
  else if (c === 'Escape') closeOverlays();
  else if (c === 'KeyZ' && APP.veh?.gimbal != null) APP.veh.gimbal = clamp(APP.veh.gimbal - 0.1, -Math.PI / 2, 0.35);
  else if (c === 'KeyX' && APP.veh?.gimbal != null) APP.veh.gimbal = clamp(APP.veh.gimbal + 0.1, -Math.PI / 2, 0.35);
  else if (c === 'Enter' && APP.veh?.crashed) respawn();
  else if (c === 'Equal' || c === 'NumpadAdd') setZoom(APP.zoom * 1.15);
  else if (c === 'Minus' || c === 'NumpadSubtract') setZoom(APP.zoom / 1.15);
}
const TIME_ORDER_KEYS = () => ({ dawn: 1, morning: 1, noon: 1, afternoon: 1, dusk: 1, nightMoon: 1, nightDark: 1, now: 1 });
function setZoom(z) { APP.zoom = clamp(z, 0.7, 4); applyFov(); const zs = $('#zoom'); if (zs) zs.value = APP.zoom; }

/* free look: drag the view to look around (springs back), wheel or pinch to zoom, double-click to recentre */
function bindLook(el) {
  const pts = new Map(); let pinch0 = 0, zoom0 = 1;
  el.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); el.setPointerCapture(e.pointerId); APP.look.drag = true; AUDIO.start(); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = APP.zoom; } });
  el.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 2) { p.x = e.clientX; p.y = e.clientY; const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 20) setZoom(zoom0 * d / pinch0); return; }
    const k = (SET.fov / APP.zoom) * rad / Math.max(300, el.clientWidth);
    APP.look.yaw += (e.clientX - p.x) * k * 1.4; APP.look.pitch = clamp(APP.look.pitch + (e.clientY - p.y) * k * 1.4, -1.2, 1.2); APP.look.idle = 0;
    p.x = e.clientX; p.y = e.clientY;
  });
  const up = e => { pts.delete(e.pointerId); if (!pts.size) { APP.look.drag = false; APP.look.idle = 0; } };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', e => { e.preventDefault(); setZoom(APP.zoom * Math.exp(-e.deltaY * 0.0012)); }, { passive: false });
  el.addEventListener('dblclick', () => { APP.look.yaw = APP.look.pitch = 0; setZoom(1); });
}

/* ======================= quick missions at any destination: real photo spots & checkpoint circuit ======================= */
const MIS = { kind: 'free', items: [], idx: 0, t0: 0, album: [], done: false, objs: [] };
function clearMission() { for (const o of MIS.objs) scene.remove(o); MIS.objs = []; MIS.items = []; MIS.idx = 0; MIS.done = false; MIS.kind = 'free'; if (!AM.active) $('#mission').hidden = true; }
function nearWater(x, z) { for (let a = 0; a < 8; a++) { const xx = x + Math.sin(a) * 60, zz = z + Math.cos(a) * 60; if (ENV.isWater(xx, zz)) return true; } return false; }
/* golden beams where real Wikimedia Commons photos were taken; reaching one shows the real photo next to your view */
async function startPhotoSpots() {
  clearAeroMission(); clearMission(); MIS.kind = 'photos'; MIS.t0 = APP.t; const kind = APP.kind, el = $('#mission');
  el.hidden = false; el.innerHTML = `<span>${esc(t('mis.loading'))}</span>`;
  try {
    const u = new URL('https://commons.wikimedia.org/w/api.php'); const p = APP.place;
    u.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', generator: 'geosearch', ggscoord: `${p.lat}|${p.lon}`, ggsradius: kind === 'plane' ? '8000' : '2500', ggslimit: '60', ggsnamespace: '6', prop: 'imageinfo|coordinates', iiprop: 'url|extmetadata|mediatype', iiurlwidth: '640', iiextmetadatafilter: 'DateTimeOriginal|Artist|LicenseShortName', uselang: I18N.lang });
    const j = await fetchJSON(u.href, { timeout: 15000, headers: { 'Api-User-Agent': UA } });
    const pages = (j.query?.pages || []).filter(pg => pg.coordinates?.[0] && pg.imageinfo?.[0]?.mediatype === 'BITMAP');
    const pts = pages.map(pg => { const [x, z] = toLocal(pg.coordinates[0].lat, pg.coordinates[0].lon); const em = pg.imageinfo[0].extmetadata || {}; return { x, z, d: Math.hypot(x, z), title: pg.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, ''), img: pg.imageinfo[0].thumburl || pg.imageinfo[0].url, page: pg.imageinfo[0].descriptionurl || ('https://commons.wikimedia.org/wiki/' + encodeURIComponent(pg.title)), date: strip(em.DateTimeOriginal?.value).slice(0, 10), artist: strip(em.Artist?.value).slice(0, 60), lic: strip(em.LicenseShortName?.value) }; }).sort((a, b) => a.d - b.d);
    const chosen = [], minSep = kind === 'plane' ? 600 : 90;
    for (const q of pts) { if ((kind === 'boat' || kind === 'rov') && !ENV.isWater(q.x, q.z) && !nearWater(q.x, q.z)) continue; if (chosen.every(c => Math.hypot(c.x - q.x, c.z - q.z) > minSep)) chosen.push(q); if (chosen.length >= 8) break; }
    if (MIS.kind !== 'photos') return;
    if (!chosen.length) return startGates();
    for (const c of chosen) { const b = beaconMesh(); b.position.set(c.x, DEM.heightAt(c.x, c.z), c.z); if (kind === 'plane') b.scale.set(4, 3, 4); scene.add(b); MIS.objs.push(b); c.obj = b; }
    MIS.items = chosen; updateMissionHud();
  } catch (e) { if (MIS.kind === 'photos') startGates(); }
}
function startGates() {
  clearAeroMission(); clearMission(); MIS.kind = 'gates'; MIS.t0 = APP.t; const kind = APP.kind, R = { drone: 320, plane: 2200, boat: 420, car: 650, ugv: 120, rov: 160 }[kind], n = 8;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2; let x = Math.sin(a) * R, z = -Math.cos(a) * R, y, r = 9;
    if (kind === 'car') { const rd = VEC.road(x, z); if (!rd || rd.dist > 250) continue; const s = rd.seg; x = (s.ax + s.bx) / 2; z = (s.az + s.bz) / 2; y = DEM.heightAt(x, z) + 3; r = 14; }
    else if (kind === 'ugv') { if (VEC.roofAt(x, z) || ENV.isWater(x, z)) continue; y = DEM.heightAt(x, z) + 1.6; r = 4; }
    else if (kind === 'boat' || kind === 'rov') { let ok = false; for (let rr = R; rr > 40 && !ok; rr -= 30) { const xx = Math.sin(a) * rr, zz = -Math.cos(a) * rr; if (ENV.isWater(xx, zz)) { x = xx; z = zz; ok = true; } } if (!ok) continue; const L = ENV.levelAt(x, z).level; y = kind === 'boat' ? L + 4 : Math.max(DEM.heightAt(x, z) + 2.5, L - 4); r = kind === 'boat' ? 16 : 4; }
    else { const gh = DEM.heightAt(x, z), ro = VEC.roofAt(x, z); y = Math.max(gh, ro ? ro.top : gh) + (kind === 'plane' ? 320 : 45); r = kind === 'plane' ? 60 : 9; }
    const g = gateMesh(r); g.position.set(x, y, z); g.rotation.y = Math.PI / 2 - a; scene.add(g); MIS.objs.push(g);
    MIS.items.push({ x, y, z, r, obj: g });
  }
  if (!MIS.items.length) { MIS.kind = 'free'; $('#mission').hidden = true; return; }
  updateMissionHud();
}
function updateMission() {
  if (MIS.kind === 'free' || MIS.done || !MIS.items.length) return; const v = APP.veh, p = v.pos;
  if (MIS.kind === 'photos') {
    for (const it of MIS.items) {
      if (it.done) continue; const hd = Math.hypot(p.x - it.x, p.z - it.z); const ok = hd < (v.kind === 'plane' ? 250 : 35) && (v.kind !== 'drone' || p.y - DEM.heightAt(it.x, it.z) < 250);
      it.obj.children[0].material.opacity = hd < 400 ? 0.45 : 0.28;
      if (ok) { it.done = true; it.obj.children.forEach(c => c.material.color?.set('#6fb7a5')); APP.capture = it; }
    }
    if (MIS.items.every(i => i.done)) MIS.done = true;
  } else {
    const it = MIS.items[MIS.idx]; if (!it) return;
    MIS.items.forEach((g, i) => g.obj.material.color.set(i < MIS.idx ? '#5a6a70' : i === MIS.idx ? '#f0c879' : '#6fb7a5'));
    const ground = ['car', 'boat', 'ugv'].includes(v.kind);
    if (Math.hypot(p.x - it.x, p.y - it.y, p.z - it.z) < it.r * 1.15 || ground && Math.hypot(p.x - it.x, p.z - it.z) < it.r) { MIS.idx++; if (MIS.idx >= MIS.items.length) MIS.done = true; }
  }
  updateMissionHud();
}
function updateMissionHud() {
  const el = $('#mission'); if (AM.active) return; if (MIS.kind === 'free') { el.hidden = true; return; } el.hidden = false; const tm = Math.round(APP.t - MIS.t0);
  if (MIS.kind === 'photos') {
    const n = MIS.items.filter(i => i.done).length, next = MIS.items.filter(i => !i.done).map(i => ({ i, d: Math.hypot(i.x - APP.veh.pos.x, i.z - APP.veh.pos.z) })).sort((a, b) => a.d - b.d)[0];
    el.innerHTML = MIS.done ? `<b>${esc(t('mis.photos'))}</b><span>${esc(t('mis.photosDone', { n, t: tm }))}</span>` : `<b>${esc(t('mis.photos'))}</b><span>${esc(t('mis.photosHud', { n, total: MIS.items.length, d: next ? fmtDist(next.d) : '' }))}</span><span class="mut">${esc(t('mis.photosHint'))}</span>`;
  } else {
    const it = MIS.items[MIS.idx];
    el.innerHTML = MIS.done ? `<b>${esc(t('mis.gates'))}</b><span>${esc(t('mis.gatesDone', { t: tm }))}</span>` : `<b>${esc(t('mis.gates'))}</b><span>${esc(t('mis.gatesHud', { n: MIS.idx + 1, total: MIS.items.length, d: fmtDist(Math.hypot(it.x - APP.veh.pos.x, it.z - APP.veh.pos.z)) }))}</span>`;
  }
}
function showCompare(it, shot) {
  const card = openCard('compare');
  const real = it.img ? `<figure><img src="${esc(it.img)}" alt="${esc(t('mis.compareReal'))}" loading="lazy"><figcaption>${esc(t('mis.compareReal'))} ${esc(it.date || '')} · ${esc(it.artist || '')} · ${esc(it.lic || '')}</figcaption></figure>` : '';
  card.innerHTML = `<header><h3>${esc(it.title || t('btn.photo'))}</h3><button class="x" data-close aria-label="${esc(t('btn.close'))}">×</button></header>
    <div class="pair">${real}<figure><img src="${shot}" alt="${esc(t('mis.compareSim'))}"><figcaption>${esc(t('mis.compareSim'))} · ${esc(APP.sun.date)} ${hhmm(APP.sun.min)} · ${esc(t('wx.' + SET.wxMode))}</figcaption></figure></div>
    <div class="row">${it.page ? `<a class="btn sm" href="${esc(it.page)}" target="_blank" rel="noopener">${esc(t('btn.source'))}</a>` : ''}<button class="btn sm" id="cmpSave">${esc(t('btn.download'))}</button></div>`;
  $('#cmpSave').onclick = () => { const a = document.createElement('a'); a.href = shot; a.download = `AERO_${APP.place.id}_${Date.now()}.jpg`; a.click(); };
}

/* ======================= UI: HUD, bottom dock, settings drawer, destination & mission sheets, cards ======================= */
const ICON = {
  play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>', pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none"/>',
  photo: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13.2" r="3.6"/>', buoy: '<path d="M9 21h6M10 21l1-9h2l1 9M8 12h8M12 12V6"/><circle cx="12" cy="4.5" r="1.5"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 18.5 10c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>', book: '<path d="M4 5.5C6.5 4 9.5 4 12 6c2.5-2 5.5-2 8-.5V19c-2.5-1.5-5.5-1.5-8 .5-2.5-2-5.5-2-8-.5z"/><path d="M12 6v13.5"/>',
  view: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>', target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.1.9-1.1 1.8M12 16.8v.2"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/>',
};
const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
const DOCK = [
  ['start', 'play', 'btn.start', 'Space'], ['photo', 'photo', 'btn.photo', 'F'], ['buoy', 'buoy', 'btn.buoy', 'G'], ['where', 'pin', 'btn.whereami', 'C'], ['story', 'book', 'btn.story', 'B'],
  ['view', 'view', 'btn.camera', 'V'], ['missions', 'target', 'btn.missions', ''], ['tutor', 'chat', 'btn.tutor', ''], ['places', 'globe', 'btn.places', ''], ['settings', 'gear', 'btn.settings', 'P'],
  ['reset', 'reset', 'btn.respawn', 'R'], ['full', 'full', 'btn.fullscreen', ''],
];
function buildDock() {
  $('#ctrls').innerHTML = `<div class="btns">${DOCK.map(([a, ic, key, kb]) => `<button data-act="${a}" data-i18n-title="${key}">${svg(ic)}<span class="lbl" data-i18n="${key}"></span>${kb ? `<kbd>${kb === 'Space' ? '␣' : kb}</kbd>` : ''}</button>`).join('')}</div>
    <label class="zoomrow"><span data-i18n="set.fov"></span><input id="zoom" type="range" min="0.7" max="4" step="0.05" value="1" aria-label="zoom"></label>`;
  $('#ctrls').addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (!b) return; AUDIO.start(); dockAction(b.dataset.act); setTimeout(() => b.blur(), 0); });
  $('#zoom').addEventListener('input', e => setZoom(+e.target.value));
  for (const side of ['L', 'R']) {
    const pad = $('#pad' + side), keys = side === 'L' ? [['KeyW', 'W'], ['KeyA', 'A'], ['KeyS', 'S'], ['KeyD', 'D']] : [['ArrowUp', '↑'], ['ArrowLeft', '←'], ['ArrowDown', '↓'], ['ArrowRight', '→']];
    pad.innerHTML = `<div class="keys">${keys.map(([k, l]) => `<b data-k="${k}">${l}</b>`).join('')}</div><div class="stick"><i></i></div><div class="padLabel"><kbd>${side === 'L' ? 'W A S D' : '↑ ← ↓ →'}</kbd><span></span>${side === 'L' ? '<em id="modeBadge"></em>' : ''}</div>`;
    bindPad(pad); bindStick($('.stick', pad), STICK[side]);
  }
  applyControlsMode(); applyI18n($('#dock')); updateDock();
}
function applyControlsMode() { document.body.dataset.controls = SET.controls; }
function dockAction(a) {
  if (globalThis.CREW_ACT?.[a]) return CREW_ACT[a]();
  ({ start: togglePause, photo: takePhoto, buoy: dropBuoy, where: showWhere, story: showStory, view: cycleCam, missions: () => openSheet('missions'), tutor: () => openSheet('tutor'),
    places: () => openSheet('places'), settings: toggleDrawer, reset: respawn, full: toggleFullscreen, help: toggleHelp })[a]?.();
}
function updateDock() {
  const b = $('#ctrls [data-act="start"]'); if (!b) return; const air = ['drone', 'plane', 'rov'].includes(APP.kind);
  const key = !APP.started ? (air ? 'btn.start' : 'btn.startDrive') : APP.paused ? 'btn.resume' : 'btn.pause';
  b.querySelector('svg').outerHTML = svg(APP.paused ? 'play' : 'pause'); b.querySelector('.lbl').textContent = t(key); b.title = t(key); b.classList.toggle('primary', !APP.started || APP.paused);
  const lab = { drone: ['pad.drone.L', 'pad.drone.R'], rov: ['pad.drone.L', 'pad.drone.R'], plane: ['pad.plane.L', 'pad.plane.R'] }[APP.kind] || ['pad.ground.L', 'pad.ground.R'];
  $('#padL .padLabel span').textContent = t(lab[0]); $('#padR .padLabel span').textContent = t(lab[1]);
  $('#modeBadge').textContent = APP.kind === 'drone' ? `${t('pad.mode2')} · ${APP.veh?.mode || 'N'}` : APP.kind === 'plane' || APP.kind === 'rov' ? t('pad.mode2') : '';
}
function toggleFullscreen() { const d = document; try { if (!d.fullscreenElement && !d.webkitFullscreenElement) (d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen)?.call(d.documentElement)?.catch?.(() => { }); else (d.exitFullscreen || d.webkitExitFullscreen)?.call(d)?.catch?.(() => { }); } catch { } }

/* ---------- start / pause ---------- */
function togglePause(force) {
  if (APP.state !== 'sim' || !APP.veh) return;
  if (!APP.started && globalThis.CREW_GATE && !CREW_GATE()) return;
  if (!APP.started) { APP.started = true; APP.paused = false; if (APP.kind === 'drone' && APP.veh.landed) APP.autoTakeoff = true; toggleHelp(false); }
  else APP.paused = force ?? !APP.paused;
  $('#startOverlay').hidden = APP.started; AUDIO.start(); updateDock();
}
function cycleCam() { APP.cam = CAMS[(CAMS.indexOf(APP.cam) + 1) % CAMS.length]; camSmooth.init = false; APP.look.yaw = APP.look.pitch = 0; applyFov(); toast(t('btn.camera') + ': ' + t('cam.' + APP.cam), 1600); }
function cycleMode() { const v = APP.veh; if (v?.kind !== 'drone') return; const ms = Object.keys(DRONE_MODES); v.mode = ms[(ms.indexOf(v.mode) + 1) % ms.length]; SET.droneMode = v.mode; saveSettings(); syncSettings(); updateDock(); toast(t(DRONE_MODES[v.mode].label), 1600); }
function takePhoto() { if (APP.state !== 'sim') return; const hit = aeroMissionAction('photo'); APP.capture = hit ? 'mission' : 'album'; }
function dropBuoy() {
  if (APP.state !== 'sim' || !APP.veh) return; BUOYS.drop(APP.veh); const hit = aeroMissionAction('beacon');
  toast(hit ? t('mis.step.beacon') + ' ✓' : t('toast.buoy', { n: BUOYS.list.length }), 1800);
}
async function respawn() { $('#warn').hidden = true; const keep = APP.started; const msg = await spawn(APP.kind); if (msg) toast(t(msg)); if (keep && APP.kind === 'drone') { APP.paused = false; } updateDock(); }

/* ---------- overlays ---------- */
function closeOverlays() {
  let any = false; for (const id of ['card', 'sheet', 'drawer']) if (!$('#' + id).hidden) { $('#' + id).hidden = true; any = true; }
  if (!$('#help').hidden) { toggleHelp(false); any = true; }
  if (APP.pausedBySheet) { APP.pausedBySheet = false; if (APP.started) APP.paused = false; updateDock(); }
  return any;
}
function openCard(kind) { const c = $('#card'); c.hidden = false; c.dataset.kind = kind; c.onclick = e => { if (e.target.closest('[data-close]')) c.hidden = true; }; return c; }
function toggleDrawer(force) { const d = $('#drawer'), show = force ?? d.hidden; d.hidden = !show; if (show) { syncSettings(); $('#sheet').hidden = true; } else document.activeElement?.blur?.(); }
function openSheet(kind) {
  const s = $('#sheet'); s.hidden = false; s.dataset.kind = kind; $('#drawer').hidden = true;
  if (kind !== 'tutor' && APP.started && !APP.paused) { APP.paused = true; APP.pausedBySheet = true; updateDock(); }
  if (kind === 'places') renderPlacesSheet(); else if (kind === 'missions') renderMissionsSheet(); else if (kind === 'tutor') renderTutor(s);
}
function closeSheet() { $('#sheet').hidden = true; if (APP.pausedBySheet) { APP.pausedBySheet = false; if (APP.started) APP.paused = false; updateDock(); } }
function toggleHelp(force) {
  const show = force ?? $('#help').hidden, el = $('#help'); el.hidden = !show; if (!show) return;
  const k = APP.kind === 'rov' ? 'rov' : APP.kind;
  el.innerHTML = `<header><h3>${esc(t('help.title'))}</h3><button class="x" data-close aria-label="${esc(t('btn.close'))}">×</button></header><p>${esc(t('help.' + k))}</p><p class="mut">${esc(t('help.common'))}</p><p class="mut">${esc(t('help.look'))}</p>`;
  el.onclick = e => { if (e.target.closest('[data-close]')) el.hidden = true; };
}
function toast(msg, ms = 5000) { const el = $('#toast'); el.hidden = false; el.textContent = msg; APP.toastUntil = performance.now() + ms; clearTimeout(toast.tm); toast.tm = setTimeout(() => { if (performance.now() >= APP.toastUntil - 20) el.hidden = true; }, ms); }

/* ---------- settings drawer ---------- */
const opt = (v, label, sel) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(label)}</option>`;
function buildDrawer() {
  const d = $('#drawer');
  d.innerHTML = `<header><h3 data-i18n="set.title"></h3><button class="x" data-close aria-label="close">×</button></header>
    <div class="grid">
      <label><span data-i18n="set.time"></span><select id="sTime"></select></label>
      <label class="range"><span id="sMinOut"></span><input id="sMin" type="range" min="0" max="1439" step="5"></label>
      <label><span data-i18n="set.season"></span><select id="sSeason"></select></label>
      <label><span data-i18n="set.weather"></span><select id="sWx"></select><small id="sWxSrc" class="mut"></small></label>
      <label><span data-i18n="set.vehicle"></span><select id="sVeh"></select><small id="sVehD" class="mut"></small></label>
      <label id="sModeRow"><span data-i18n="btn.mode"></span><select id="sMode"></select></label>
      <label class="range"><span><span data-i18n="set.fov"></span> <output id="sFovOut"></output></span><input id="sFov" type="range" min="60" max="130" step="5"></label>
      <label class="chk"><input id="sFish" type="checkbox"><span data-i18n="set.fisheye"></span></label>
      <label><span data-i18n="set.controls"></span><select id="sCtrl"></select></label>
      <label><span data-i18n="set.quality"></span><select id="sQual"></select></label>
      <label><span data-i18n="set.language"></span><select id="sLang"></select></label>
      <label class="chk"><input id="sAssist" type="checkbox"><span data-i18n="set.assist"></span></label>
      <label class="chk"><input id="sBld" type="checkbox"><span data-i18n="set.buildings"></span></label>
      <label class="chk"><input id="sTrees" type="checkbox"><span data-i18n="set.trees"></span></label>
      <label class="chk"><input id="sFx" type="checkbox"><span data-i18n="set.effects"></span></label>
      <label class="chk"><input id="sSound" type="checkbox"><span data-i18n="btn.sound"></span></label>
    </div>
    <details><summary data-i18n="set.google"></summary><p class="mut" data-i18n="set.googleHint"></p><div class="row"><input id="gkey" type="password" autocomplete="off" spellcheck="false" placeholder="AIza…"><button class="btn sm" id="gApply" data-i18n="btn.apply"></button></div></details>
    <div class="links"><a id="l4d" href="AERO_4D_Explorer.html" target="_blank" rel="noopener" data-i18n="set.link4d"></a><a id="lClassic" href="classic-v5.html" data-i18n="set.linkClassic"></a><a href="https://github.com/kuonanhong/AERO_Explorer" target="_blank" rel="noopener">GitHub</a></div>
    <p id="pStats" class="mut"></p>`;
  applyI18n(d); d.addEventListener('click', e => { if (e.target.closest('[data-close]')) toggleDrawer(false); });
  for (const [id, url] of [['#lClassic', 'classic-v5.html'], ['#l4d', 'AERO_4D_Explorer.html']]) {   // hide links to pages this copy does not have
    if (location.protocol === 'file:') { if (id === '#lClassic') $(id).hidden = true; continue; }
    fetch(url, { method: 'HEAD', cache: 'no-store' }).then(r => { if (!r.ok) $(id).hidden = true; }).catch(() => { $(id).hidden = true; });
  }
  const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
  on('#sTime', 'change', e => { setTimePreset(e.target.value); saveSettings(); syncSettings(); });
  on('#sMin', 'input', e => { APP.sun.min = +e.target.value; APP.live = false; SET.timeMode = 'custom'; applyTime(); syncSettings(); });
  on('#sSeason', 'change', e => { SET.season = e.target.value; setTimePreset(SET.timeMode === 'custom' ? 'morning' : SET.timeMode); saveSettings(); syncSettings(); });
  on('#sWx', 'change', async e => { SET.wxMode = e.target.value; saveSettings(); if (SET.wxMode === 'live' && !WX.ok) await refreshLiveWeather(); applyWeather(); syncSettings(); });
  on('#sVeh', 'change', async e => { const msg = await spawn(e.target.value); saveSettings(); if (msg) toast(t(msg)); APP.started = false; APP.paused = true; $('#startOverlay').hidden = false; updateDock(); restartMission(); });
  on('#sMode', 'change', e => { if (APP.veh?.kind === 'drone') { APP.veh.mode = e.target.value; SET.droneMode = e.target.value; saveSettings(); updateDock(); } });
  on('#sFov', 'input', e => { SET.fov = +e.target.value; $('#sFovOut').textContent = SET.fov + '°'; applyFov(); saveSettings(); });
  on('#sFish', 'change', e => { SET.fisheye = e.target.checked; applyFov(); saveSettings(); });
  on('#sCtrl', 'change', e => { SET.controls = e.target.value; applyControlsMode(); saveSettings(); setStartHint(); });
  on('#sQual', 'change', e => { SET.quality = e.target.value; saveSettings(); setQuality(SET.quality === 'auto' ? autoQuality() : SET.quality); });
  on('#sLang', 'change', async e => { LS.set('aero:lang', e.target.value); await setLang(e.target.value); relabelAll(); });
  on('#sAssist', 'change', e => { SET.assist = e.target.checked; saveSettings(); });
  on('#sBld', 'change', e => { SET.buildings = e.target.checked; VEC.group.visible = SET.buildings && !APP.google; saveSettings(); });
  on('#sTrees', 'change', e => { SET.trees = e.target.checked; TREES.enabled = SET.trees && QUALITY[APP.quality].trees; saveSettings(); });
  on('#sFx', 'change', e => { SET.effects = e.target.checked; saveSettings(); applyWeather(); });
  on('#sSound', 'change', e => { SET.sound = e.target.checked; AUDIO.start(); AUDIO.setMute(!SET.sound); saveSettings(); });
  on('#gApply', 'click', async () => { const k = $('#gkey').value.trim(); SET.gkey = k; saveSettings(); disableGoogle(); if (k) { toast(t('load.google')); await enableGoogle(k); } });
}
function fillSelects() {
  $('#sTime').innerHTML = ['now', 'dawn', 'morning', 'noon', 'afternoon', 'dusk', 'nightMoon', 'nightDark'].map(k => opt(k, t('time.' + k), SET.timeMode)).join('') + (SET.timeMode === 'custom' ? opt('custom', t('time.custom'), 'custom') : '');
  $('#sSeason').innerHTML = ['today', 'spring', 'summer', 'autumn', 'winter'].map(k => opt(k, t('season.' + k), SET.season)).join('');
  $('#sWx').innerHTML = WX_ORDER.map(k => opt(k, t('wx.' + k), SET.wxMode)).join('');
  $('#sVeh').innerHTML = VEHICLE_KINDS.map(k => opt(k, t('veh.' + k), APP.kind)).join('');
  $('#sMode').innerHTML = Object.keys(DRONE_MODES).map(k => opt(k, t(DRONE_MODES[k].label), APP.veh?.mode || SET.droneMode)).join('');
  $('#sCtrl').innerHTML = ['keys', 'sticks'].map(k => opt(k, t('ctrl.' + k), SET.controls)).join('');
  $('#sQual').innerHTML = ['auto', 'low', 'mid', 'high'].map(k => opt(k, t('quality.' + k), SET.quality)).join('');
  $('#sLang').innerHTML = LANGS.map(l => opt(l, (globalThis.AERO_LANG_NAMES?.[l] || I18N.loaded[l]?._lang || LANG_NAME[l] || l), I18N.lang)).join('');
}
const LANG_NAME = { 'zh-Hant': '繁體中文', 'zh-Hans': '简体中文', en: 'English', ja: '日本語', ko: '한국어', vi: 'Tiếng Việt', th: 'ไทย', id: 'Bahasa Indonesia', ms: 'Bahasa Melayu', fil: 'Filipino', km: 'ខ្មែរ', my: 'မြန်မာ',
  hi: 'हिन्दी', bn: 'বাংলা', mr: 'मराठी', ta: 'தமிழ்', te: 'తెలుగు', ur: 'اردو', ar: 'العربية', fa: 'فارسی', he: 'עברית', tr: 'Türkçe', ru: 'Русский', uk: 'Українська', pl: 'Polski', cs: 'Čeština',
  ro: 'Română', hu: 'Magyar', el: 'Ελληνικά', de: 'Deutsch', nl: 'Nederlands', da: 'Dansk', sv: 'Svenska', nb: 'Norsk bokmål', fi: 'Suomi', fr: 'Français', es: 'Español', it: 'Italiano', pt: 'Português', sw: 'Kiswahili' };
function syncSettings() {
  if (!$('#sTime')) return; fillSelects();
  $('#sMin').value = Math.round(APP.sun.min); $('#sMinOut').textContent = `${t('set.localTime')} ${APP.sun.date} ${hhmm(APP.sun.min)}`;
  $('#sFov').value = SET.fov; $('#sFovOut').textContent = SET.fov + '°'; $('#sFish').checked = SET.fisheye; $('#sFish').disabled = !POST.enabled;
  $('#sAssist').checked = SET.assist; $('#sBld').checked = SET.buildings; $('#sTrees').checked = SET.trees; $('#sFx').checked = SET.effects; $('#sSound').checked = SET.sound;
  $('#sModeRow').hidden = APP.kind !== 'drone'; $('#gkey').value = SET.gkey || '';
  $('#sWxSrc').textContent = SET.wxMode === 'live' ? (WX.ok ? t('hud.liveSrc', { time: (WX.time || '').replace('T', ' ') }) : t('hud.liveFail')) : t('hud.presetSrc', { name: t('wx.' + SET.wxMode) });
  $('#sVehD').textContent = t('veh.' + APP.kind + '.d');
  if (APP.place) $('#l4d').href = 'AERO_4D_Explorer.html#' + encodeURIComponent(APP.place.id);
  updateEnvChip();
}
function relabelAll() { applyI18n(document); syncSettings(); updateDock(); updatePlaceChip(); updateEnvChip(); globalThis.CREW_RELABEL?.(); if (!$('#sheet').hidden) openSheet($('#sheet').dataset.kind); if (!$('#help').hidden) toggleHelp(true); }

/* ---------- HUD ---------- */
const brg = h => ((-h * deg) % 360 + 360) % 360;
function updatePlaceChip() {
  const p = APP.place; if (!p) return;
  $('#hpT').textContent = placeName(p); $('#hpK').textContent = placeLine(p);
  document.title = `${placeName(p)} · ${t('app.title')}`;
}
function updateEnvChip() {
  const W = APP.W || WX, el = $('#hudEnv'); if (!el || !APP.place) return;
  const wdir = W.windDir ?? 0;
  el.innerHTML = `<b>${hhmm(APP.sun.min)}</b><span>${esc(t('time.' + SET.timeMode) !== 'time.custom' ? t('time.' + SET.timeMode) : '')}</span><span>${esc(t('wx.' + SET.wxMode))}</span><span>${W.temp != null ? Math.round(W.temp) + '°C' : ''} <i class="arrow" style="transform:rotate(${wdir + 180}deg)">↑</i> ${(W.wind ?? 0).toFixed(1)} m/s</span>`;
}
function updateHUD() {
  const v = APP.veh, p = v.pos, [lat, lon] = toLatLon(p.x, p.z), dDest = Math.hypot(p.x, p.z), b = brg(v.heading);
  $('#hpM').innerHTML = `<span dir="ltr">${lat.toFixed(4)}, ${lon.toFixed(4)}</span> · ${esc(t('hud.toDest', { d: fmtDist(dDest) }))}`;
  $('#tape').innerHTML = `<b>${String(Math.round(b)).padStart(3, '0')}°</b> ${esc(compassWord(b))}`;
  const kmh = s => Math.round(s * 3.6), cells = [];
  if (v.kind === 'drone') { const hs = Math.hypot(v.vel.x, v.vel.z); cells.push(['hud.speed', kmh(hs) + ' km/h'], ['hud.agl', v.agl.toFixed(1) + ' m'], ['hud.vs', v.vel.y.toFixed(1) + ' m/s'], ['hud.battery', Math.round(v.battery * 100) + '%'], ['hud.gimbal', Math.round(v.gimbal * deg) + '°']); }
  else if (v.kind === 'plane') cells.push(['hud.airspeed', kmh(v.airspeed) + ' km/h'], ['hud.agl', Math.round(v.agl) + ' m'], ['hud.climb', v.vel.y.toFixed(1) + ' m/s'], ['hud.throttle', Math.round(v.throttle * 100) + '%'], ['hud.aoa', (v.alpha * deg).toFixed(1) + '°']);
  else if (v.kind === 'boat') cells.push(['hud.speed', (v.u * 1.944).toFixed(1) + ' ' + t('hud.knots')], ['hud.throttle', Math.round(v.throttle * 100) + '%'], ['hud.waves', (APP.W?.hs ?? 0).toFixed(1) + ' m']);
  else if (v.kind === 'rov') cells.push(['hud.depth', v.depth.toFixed(1) + ' m'], ['hud.agl', v.agl.toFixed(1) + ' m'], ['hud.speed', Math.hypot(v.vel.x, v.vel.z).toFixed(1) + ' m/s']);
  else cells.push(['hud.speed', Math.abs(kmh(v.v)) + ' km/h'], ['hud.alt', Math.round(p.y) + ' m'], ['', v.onRoad ? t('hud.road', { name: v.roadName || t('hud.unnamedRoad') }) : t('hud.offroad')]);
  $('#hudInst').innerHTML = cells.map(([l, val]) => l ? `<div><small>${esc(t(l).replace(/\{.*?\}/g, '').trim())}</small><b>${esc(val)}</b></div>` : `<div class="wide">${esc(val)}</div>`).join('');
  const w = v.warn, el = $('#warn');
  if (w) { el.hidden = false; el.textContent = t(w, { ...(v.warnP || {}), why: v.why ? t(v.why) : '' }) + (v.crashed ? '  ⏎' : ''); el.classList.toggle('amber', !v.crashed && !/aground|crash/.test(w)); } else el.hidden = true;
  if (APP.frameN % 8 === 0) { updateMini(); updateEnvChip(); }
  const st = TERRAIN.stats(), ps = $('#pStats'); if (ps && !$('#drawer').hidden) ps.textContent = `terrain ${st.visible}/${st.loaded} · queue ${st.queue} · OSM ${VEC.tiles.size}${VEC.status ? ' · ' + VEC.status : ''} · ${Math.round(APP.fps)} fps · ${APP.quality}`;
}
const MINI = { z: 15, key: '' };
function updateMini() {
  const v = APP.veh, [gx, gy] = localToTile(v.pos.x, v.pos.z, MINI.z), tx = Math.floor(gx), ty = Math.floor(gy), key = tx + ',' + ty;
  if (key !== MINI.key) { MINI.key = key; let h = ''; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) h += `<img alt="" src="${IMG_URL(MINI.z, tx + i, ty + j)}" style="left:${(i + 1) * 256}px;top:${(j + 1) * 256}px">`; $('#miniTiles').innerHTML = h; }
  const ox = (gx - tx) * 256 + 256, oy = (gy - ty) * 256 + 256, box = $('#mini').clientWidth || 120, scale = box / 300;
  $('#miniRot').style.transform = `scale(${scale}) rotate(${-brg(v.heading)}deg) translate(${-ox}px,${-oy}px)`;
  const dots = [{ x: 0, z: 0, c: 'dest' }, ...MIS.items.map((i, k) => ({ x: i.x, z: i.z, c: i.done || (MIS.kind === 'gates' && k < MIS.idx) ? 'done' : '' })), ...AM.steps.map((s, k) => ({ x: s.x, z: s.z, c: s.done ? 'done' : k === AM.idx ? 'next' : '' })), ...BUOYS.list.map(b => ({ x: b.o.position.x, z: b.o.position.z, c: 'buoy' }))];
  $('#miniDots').innerHTML = dots.map(d => { const [dx, dy] = localToTile(d.x, d.z, MINI.z); return `<div class="dot ${d.c}" style="left:${(dx - tx) * 256 + 256}px;top:${(dy - ty) * 256 + 256}px"></div>`; }).join('');
  $('#miniN').style.transform = `rotate(${-brg(v.heading)}deg) translateY(-${box / 2 - 10}px) rotate(${brg(v.heading)}deg)`;
}

/* ---------- where am I (C) ---------- */
function bearingTo(x, z, tx, tz) { return ((Math.atan2(tx - x, -(tz - z)) * deg) + 360) % 360; }
function nearbyPlaces(lat, lon, n = 6, skip) { return PLACES.filter(q => q !== skip).map(q => ({ q, d: haversine(lat, lon, q.lat, q.lon) })).sort((a, b) => a.d - b.d).slice(0, n); }
function showWhere() {
  if (!APP.veh) return; const v = APP.veh, p = v.pos, [lat, lon] = toLatLon(p.x, p.z), P = APP.place, dDest = Math.hypot(p.x, p.z);
  const card = openCard('where'), rd = VEC.road(p.x, p.z), g = DEM.heightAt(p.x, p.z);
  const near = nearbyPlaces(lat, lon, 6, P);
  card.innerHTML = `<header><h3>${esc(t('where.title'))}</h3><button class="x" data-close aria-label="${esc(t('btn.close'))}">×</button></header>
    <p><b>${esc(placeName(P))}</b>${placeAltName(P) ? ` <span class="mut">${esc(placeAltName(P))}</span>` : ''}<br><span class="mut">${esc(placeLine(P))}</span></p>
    <dl>
      <dt>${esc(t('where.coords'))}</dt><dd dir="ltr">${lat.toFixed(5)}, ${lon.toFixed(5)}</dd>
      <dt>${esc(t('hud.alt'))}</dt><dd>${Math.round(p.y)} m · ${esc(t('where.ground', { h: Math.round(g) }))}</dd>
      <dt>${esc(t('where.heading'))}</dt><dd>${Math.round(brg(v.heading))}° ${esc(compassWord(brg(v.heading)))}</dd>
      <dt>${esc(t('where.dest'))}</dt><dd>${dDest < 15 ? esc(t('where.here')) : esc(t('where.destDir', { d: fmtDist(dDest), dir: compassWord(bearingTo(p.x, p.z, 0, 0)) }))}</dd>
      ${rd && rd.dist < 60 ? `<dt>${esc(t('where.road'))}</dt><dd>${esc(rd.name || t('hud.unnamedRoad'))}</dd>` : ''}
      <dt>${esc(t('where.time'))}</dt><dd>${esc(APP.sun.date)} ${hhmm(APP.sun.min)} · ${esc(t('hud.sun', { a: Math.round(APP.sunAlt) }))} · ${esc(t('hud.moon', { a: Math.round(APP.moonAlt), p: Math.round(APP.moonFrac * 100) }))}</dd>
    </dl>
    <h4>${esc(t('where.nearby'))}</h4>
    <div class="list">${near.map(({ q, d }) => `<button class="res" data-id="${esc(q.id)}"><b>${esc(placeName(q))}</b><span>${esc(fmtDist(d))} · ${esc(compassWord(bearingTo(p.x, p.z, ...toLocal(q.lat, q.lon))))} · ${esc(catName(q.cat))}</span></button>`).join('')}</div>
    <div class="row"><a class="btn sm" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lon.toFixed(5)}#map=16/${lat.toFixed(5)}/${lon.toFixed(5)}">OpenStreetMap</a></div>`;
  card.querySelectorAll('.res').forEach(b => b.onclick = () => { card.hidden = true; const q = PLACE_BY_ID.get(b.dataset.id); loadPlace(q, APP.kind === 'plane' ? 'plane' : suggestVehicle(q)); });
}

/* ---------- place story (B): catalogue text + Wikipedia in the viewer's language + nearby photos ---------- */
const WIKI_LANG = { 'zh-Hant': ['zh', 'zh-tw'], 'zh-Hans': ['zh', 'zh-cn'], fil: ['tl'], nb: ['no'] };
const detailCache = new Map();
async function placeDetails(p) {
  if (!p.shard) return null;
  try { if (!detailCache.has(p.shard)) detailCache.set(p.shard, await fetchJSON(`data/catalogue-details-${p.shard}.json`, { timeout: 15000 })); return detailCache.get(p.shard)[p.id] || null; } catch { return null; }
}
async function wikiNearby(p) {
  const [wl, variant] = WIKI_LANG[I18N.lang] || [I18N.lang.split('-')[0]];
  const gs = await fetchJSON(`https://${wl}.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${p.lat}|${p.lon}&gsradius=${p.id.startsWith('unesco') ? 5000 : 1500}&gslimit=5&format=json&origin=*`, { timeout: 10000 });
  const hit = gs.query?.geosearch?.[0]; if (!hit) return null;
  const sm = await fetchJSON(`https://${wl}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title.replace(/ /g, '_'))}`, { timeout: 10000, headers: variant ? { 'Accept-Language': variant } : undefined });
  return { title: sm.title || hit.title, extract: sm.extract || '', url: sm.content_urls?.desktop?.page || `https://${wl}.wikipedia.org/wiki/${encodeURIComponent(hit.title)}`, img: sm.thumbnail?.source || '', dist: hit.dist };
}
async function showStory() {
  const P = APP.place; if (!P) return; const card = openCard('story');
  const src = P.src ? `<a class="btn sm" href="${esc(P.src)}" target="_blank" rel="noopener">${esc(t('story.source'))}</a>` : '';
  card.innerHTML = `<header><h3>${esc(placeName(P))}</h3><button class="x" data-close aria-label="${esc(t('btn.close'))}">×</button></header>
    <p class="mut">${esc([placeAltName(P), placeLine(P)].filter(Boolean).join(' · '))}</p>
    <div id="stDesc"><p>${esc(isZh() ? (I18N.lang === 'zh-Hans' ? P.desc : P.desc) : '')}</p></div>
    <div id="stWiki" class="mut">${esc(t('story.loading'))}</div>
    <div id="stPhotos" class="thumbs"></div>
    <div class="row">${src}<a class="btn sm" href="AERO_4D_Explorer.html#${encodeURIComponent(P.id)}" target="_blank" rel="noopener">${esc(t('set.link4d'))}</a></div>`;
  placeDetails(P).then(d => { if (!d || $('#card').hidden) return; const txt = d.description?.[I18N.lang] || (isZh() ? d.description?.['zh-Hant'] : d.description?.en) || ''; if (txt) $('#stDesc').innerHTML = `<p>${esc(txt)}</p>${d.attribution ? `<p class="mut small">${esc(d.attribution)} · ${esc(d.license || '')}</p>` : ''}`; });
  wikiNearby(P).then(w => {
    const el = $('#stWiki'); if (!el) return;
    if (!w) { el.textContent = t('story.noWiki'); return; }
    el.classList.remove('mut'); el.innerHTML = `<h4>${esc(t('story.wiki'))}: ${esc(w.title)}</h4>${w.img ? `<img class="wimg" src="${esc(w.img)}" alt="" loading="lazy">` : ''}<p>${esc(w.extract)}</p><a href="${esc(w.url)}" target="_blank" rel="noopener">${esc(t('story.readMore'))}</a> <span class="mut small">CC BY-SA · Wikipedia</span>`;
  }).catch(() => { const el = $('#stWiki'); if (el) el.textContent = t('story.noWiki'); });
  (async () => {
    try {
      const u = new URL('https://commons.wikimedia.org/w/api.php'); u.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', generator: 'geosearch', ggscoord: `${P.lat}|${P.lon}`, ggsradius: '1500', ggslimit: '12', ggsnamespace: '6', prop: 'imageinfo', iiprop: 'url|mediatype', iiurlwidth: '320' });
      const j = await fetchJSON(u.href, { timeout: 12000, headers: { 'Api-User-Agent': UA } });
      const imgs = (j.query?.pages || []).filter(pg => pg.imageinfo?.[0]?.mediatype === 'BITMAP').slice(0, 6);
      const el = $('#stPhotos'); if (el) el.innerHTML = imgs.map(pg => `<a href="${esc(pg.imageinfo[0].descriptionurl)}" target="_blank" rel="noopener"><img src="${esc(pg.imageinfo[0].thumburl)}" alt="${esc(pg.title.replace(/^File:/, ''))}" loading="lazy"></a>`).join('');
    } catch { }
  })();
}

/* ---------- destinations sheet ---------- */
const PS = { region: 'tw', veh: null };
function renderPlacesSheet() {
  const s = $('#sheet');
  s.innerHTML = `<header><h3>${esc(t('menu.title'))}</h3><button class="x" data-close aria-label="${esc(t('btn.close'))}">×</button></header>
    <p class="mut">${esc(t('menu.lead'))}</p>
    <input id="q" type="search" placeholder="${esc(t('menu.searchPh'))}" aria-label="${esc(t('menu.search'))}" autocomplete="off">
    <div class="seg" id="regSeg">${['tw', 'world', 'all'].map(r => `<button data-r="${r}" aria-pressed="${PS.region === r}">${esc(t(r === 'tw' ? 'menu.region.tw' : r === 'world' ? 'menu.region.world' : 'menu.allRegions'))}</button>`).join('')}</div>
    <div class="seg" id="vehSeg"><span class="mut">${esc(t('set.vehicle'))}</span>${['auto', ...VEHICLE_KINDS].map(k => `<button data-v="${k}" aria-pressed="${(PS.veh || 'auto') === k}">${esc(k === 'auto' ? t('menu.autoVeh') : t('veh.' + k))}</button>`).join('')}</div>
    <h4>${esc(t('menu.quick'))}</h4><div class="chips" id="quick">${QUICK.map(({ p, v }) => `<button class="res chip" data-id="${esc(p.id)}" data-v="${v}"><b>${esc(placeName(p))}</b><span>${esc(placeRegion(p))} · ${esc(t('veh.' + v))}</span></button>`).join('')}</div>
    <h4 id="resHead"></h4><div class="list" id="results"></div>
    <p class="small mut"><b>${esc(t('menu.real'))}</b>: ${esc(t('menu.realList'))}<br><b>${esc(t('menu.sim'))}</b>: ${esc(t('menu.simList'))}</p>`;
  s.onclick = e => {
    if (e.target.closest('[data-close]')) return closeSheet();
    const r = e.target.closest('#regSeg button'); if (r) { PS.region = r.dataset.r; $$('#regSeg button').forEach(b => b.setAttribute('aria-pressed', b === r)); renderResults(); return; }
    const vb = e.target.closest('#vehSeg button'); if (vb) { PS.veh = vb.dataset.v === 'auto' ? null : vb.dataset.v; $$('#vehSeg button').forEach(b => b.setAttribute('aria-pressed', b === vb)); return; }
    const b = e.target.closest('.res[data-id]'); if (b) { const p = PLACE_BY_ID.get(b.dataset.id); closeSheet(); loadPlace(p, PS.veh || b.dataset.v || suggestVehicle(p)); }
  };
  let qt; $('#q').addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(renderResults, 140); });
  renderResults(); if (!IS_TOUCH) setTimeout(() => $('#q')?.focus(), 50);
}
function renderResults() {
  const q = ($('#q')?.value || '').trim().toLowerCase();
  let list = PLACES.filter(p => PS.region === 'all' || (PS.region === 'tw' ? p.cc === 'TW' : p.cc !== 'TW'));
  if (q) list = list.filter(p => `${p.zh} ${p.zhs} ${p.en} ${p.region} ${placeRegion(p)} ${p.cc} ${catName(p.cat)}`.toLowerCase().includes(q));
  else if (APP.place) { const o = APP.place; list = list.map(p => ({ p, d: haversine(o.lat, o.lon, p.lat, p.lon) })).sort((a, b) => a.d - b.d).map(x => x.p); }
  $('#resHead').textContent = q ? t('menu.found', { n: list.length }) : t('menu.nearest');
  $('#results').innerHTML = list.slice(0, 120).map(p => `<button class="res" data-id="${esc(p.id)}"><b>${esc(placeName(p))}</b><span>${esc(placeLine(p))}${APP.place ? ' · ' + esc(fmtDist(haversine(APP.place.lat, APP.place.lon, p.lat, p.lon))) : ''}</span></button>`).join('') || `<p class="mut">${esc(t('menu.none'))}</p>`;
}

/* ---------- missions sheet ---------- */
const MS = { tier: 'beginner' };
async function renderMissionsSheet() {
  const s = $('#sheet'); await loadMissions();
  const groups = { air: [], land: [], water: [] }; for (const d of MISSIONS.defs) groups[d.vehicle]?.push(d);
  const here = APP.place ? placeName(APP.place) : '';
  s.innerHTML = `<header><h3>${esc(t('mis.title'))}</h3><button class="x" data-close aria-label="${esc(t('btn.close'))}">×</button></header>
    <h4>${esc(t('mis.here', { place: here }))}</h4>
    <div class="chips"><button class="res chip" data-q="free"><b>${esc(t('mis.free'))}</b><span>${esc(t('mis.freeD'))}</span></button><button class="res chip" data-q="photos"><b>${esc(t('mis.photos'))}</b><span>${esc(t('mis.photosHint'))}</span></button><button class="res chip" data-q="gates"><b>${esc(t('mis.gates'))}</b><span>${esc(t('mis.gatesD'))}</span></button></div>
    <h4>${esc(t('mis.aero'))}</h4>
    <div class="seg" id="tierSeg"><span class="mut">${esc(t('mis.tier'))}</span>${Object.keys(MTIER).map(k => `<button data-t="${k}" aria-pressed="${MS.tier === k}">${esc(t('mis.tier.' + k))} · ${MTIER[k].count}</button>`).join('')}</div>
    ${Object.entries(groups).map(([g, list]) => `<h5>${esc(t('mis.list.' + g))}</h5><div class="list">${list.map(d => { const pl = missionPlace(d); return `<button class="res" data-m="${esc(d.id)}"><b>${esc(mtext(d, 'name'))}</b><span>${esc(t('veh.' + missionVehicle(d, sceneOf(d))))} · ${esc(pl ? placeName(pl) : '')}</span><span class="mut">${esc(mtext(d, 'description').slice(0, 140))}</span></button>`; }).join('')}</div>`).join('')}`;
  s.onclick = e => {
    if (e.target.closest('[data-close]')) return closeSheet();
    const tb = e.target.closest('#tierSeg button'); if (tb) { MS.tier = tb.dataset.t; $$('#tierSeg button').forEach(b => b.setAttribute('aria-pressed', b === tb)); return; }
    const q = e.target.closest('[data-q]'); if (q) { closeSheet(); APP.missionKind = q.dataset.q; restartMission(); return; }
    const m = e.target.closest('[data-m]'); if (m) { const d = MISSIONS.defs.find(x => x.id === m.dataset.m); closeSheet(); startAeroAt(d, MS.tier); }
  };
}
function restartMission() { if (AM.active && AM.def) return startAeroMission(AM.def, AM.tier); if (APP.missionKind === 'photos') startPhotoSpots(); else if (APP.missionKind === 'gates') startGates(); else { clearAeroMission(); clearMission(); } }
async function startAeroAt(def, tier) {
  const sc = sceneOf(def), pl = missionPlace(def); if (!pl) return;
  APP.missionKind = 'aero';
  await loadPlace(pl, missionVehicle(def, sc), { mission: def, tier });
}

/* ======================= AERO mission scenarios on real terrain ======================= */
/* The 30 AERO v5.1 scenarios (10 air · 10 land · 10 water) keep their localized titles, step kinds and the
   objectives 70 / stability 20 / efficiency 10 scoring; stations are now laid out around the real place. */
const MISSIONS = { defs: [], scenes: [], loaded: false };
async function loadMissions() {
  if (MISSIONS.loaded) return MISSIONS;
  try {
    const d = globalThis.AERO_MISSIONS || await fetchJSON('data/missions.json', { timeout: 15000 });
    const s = globalThis.AERO_SCENES || await fetchJSON('data/mission-scenes.json', { timeout: 15000 });
    MISSIONS.defs = d.missions || []; MISSIONS.scenes = s.scenes || []; MISSIONS.loaded = true;
  } catch (e) { console.warn('missions', e); }
  return MISSIONS;
}
const mtext = (def, key) => def?.[key]?.[I18N.lang] || def?.[key]?.[isZh() ? 'zh-Hant' : 'en'] || def?.[key]?.en || '';
const sceneOf = def => MISSIONS.scenes.find(s => s.missionId === def.id);
const MTIER = { beginner: { count: 3, radius: 10, gate: 8, dwell: 3, par: 240, form: 8 }, advanced: { count: 4, radius: 8, gate: 6.5, dwell: 4, par: 210, form: 6 }, expert: { count: 5, radius: 6, gate: 5, dwell: 5, par: 180, form: 4 } };
const amP = (tier = AM.tier) => { const P = MTIER[tier], k = AM.k || 1; return k === 1 ? P : { ...P, radius: P.radius * k, gate: P.gate * k, form: P.form * k }; };
function missionVehicle(def, scene) { if (def.vehicle === 'air') return 'drone'; if (def.vehicle === 'land') return 'ugv'; return scene?.place?.underwater ? 'rov' : 'boat'; }
function missionPlace(def) {
  const sc = sceneOf(def); if (!sc) return null; const pl = sc.place;
  const known = PLACES.find(p => p.id === pl.id);
  return known || { i: -1, id: pl.id, lat: pl.lat, lon: pl.lon, zh: pl.name['zh-Hant'] || pl.name.en, zhs: pl.name['zh-Hans'] || '', en: pl.name.en, cc: '', region: '', cat: 'mission', desc: '', src: (pl.sourceUrls || [])[0] || '', mission: true };
}
const AM = { active: false, def: null, scene: null, tier: 'beginner', steps: [], idx: 0, t0: 0, contacts: 0, over: 0, done: false, score: null, objs: [], hold: 0, guide: null, lastWarn: '' };
function clearAeroMission() { for (const o of AM.objs) scene.remove(o); AM.objs = []; AM.active = false; AM.steps = []; AM.guide = null; }
/* Lay out stations around the real landmark: above roofs for drones, on dry passable ground for robots, on/under water for boats and ROVs. */
function layoutStations(def, sc, tier) {
  const P = MTIER[tier], all = def.steps.map(s => s.kind), lm = sc.landmark || { width: 30, height: 20, depth: 30 }, lv = def.layoutVeh || missionVehicle(def, sc), veh = lv === 'car' ? 'ugv' : lv;
  // keep the scenario's variety at every tier: first each distinct step kind (in order), then the rest
  const kinds = [...new Set(all)].slice(0, P.count); for (const k of all) { if (kinds.length >= P.count) break; if (kinds.filter(x => x === k).length < all.filter(x => x === k).length && kinds.length < P.count) kinds.push(k); }
  kinds.sort((a, b) => all.indexOf(a) - all.indexOf(b));
  const size = Math.max(lm.width || 20, lm.depth || 20), seed = def.layoutSeed || 1, out = [];
  const R0 = veh === 'plane' ? clamp(size * 2 + 420, 420, 900) : veh === 'drone' ? clamp(size * 1.1 + 25, 35, 140) : lv === 'car' ? clamp(size * 1.2 + 40, 45, 160) : veh === 'ugv' ? clamp(size * 0.7 + 12, 18, 70) : clamp(size * 1.5 + 40, 50, 220);
  for (let i = 0; i < kinds.length; i++) {
    let best = null;
    for (let tries = 0; tries < 24 && !best; tries++) {
      const a = (i / kinds.length) * Math.PI * 2 + seed * 0.7 + tries * 0.37, R = R0 * (1 + (tries % 4) * 0.25);
      const x = Math.sin(a) * R, z = -Math.cos(a) * R, g = DEM.heightAt(x, z), roof = VEC.roofAt(x, z), water = ENV.isWater(x, z);
      if (veh === 'ugv' && (roof || water)) continue;
      if ((veh === 'boat' || veh === 'rov') && !water) continue;
      let y;
      if (veh === 'plane') { let hm = g; for (let q = 0; q < 6; q++) hm = Math.max(hm, DEM.heightAt(x + Math.sin(q) * 150, z + Math.cos(q) * 150)); y = hm + 110 + (i % 2) * 25; }
      else if (veh === 'drone') y = Math.max(g, roof ? roof.top : g) + clamp((lm.height || 20) * 0.6, 12, 55) + (i % 2) * 4;
      else if (veh === 'ugv') y = g + 1.2;
      else if (veh === 'boat') y = ENV.levelAt(x, z).level + 1.5;
      else { const L = ENV.levelAt(x, z).level; y = Math.max(g + 2, L - clamp((L - g) * 0.5, 2, 18)); }
      best = { x, y, z, a };
    }
    if (!best) { const a = i / kinds.length * Math.PI * 2; best = { x: Math.sin(a) * R0, y: DEM.heightAt(Math.sin(a) * R0, -Math.cos(a) * R0) + 20, z: -Math.cos(a) * R0, a }; }
    out.push({ ...best, kind: kinds[i], done: false, t: 0 });
  }
  return out;
}
function startAeroMission(def, tier) {
  clearAeroMission(); clearMission();
  const sc = def.scene || sceneOf(def); AM.def = def; AM.scene = sc; AM.tier = tier; AM.k = def.scale || 1; AM.idx = 0; AM.t0 = APP.t; AM.contacts = 0; AM.over = 0; AM.done = false; AM.score = null; AM.hold = 0; AM.active = true;
  AM.steps = layoutStations(def, sc, tier);
  const P = amP(tier);
  AM.steps.forEach((s, i) => {
    let o;
    if (s.kind === 'gate') { o = gateMesh(P.gate); o.rotation.y = Math.PI / 2 - s.a; }
    else { o = beaconMesh(s.kind === 'photo' ? '#7fd4ff' : s.kind === 'beacon' ? '#ff9a5a' : s.kind === 'formation' ? '#c7a2ff' : '#f0c879'); o.scale.set(P.radius / 9, APP.kind === 'drone' ? 0.6 : 0.35, P.radius / 9); }
    o.position.set(s.x, s.kind === 'gate' ? s.y : s.y - (APP.kind === 'drone' ? 8 : 1), s.z); scene.add(o); AM.objs.push(o); s.obj = o;
  });
  if (AM.steps.some(s => s.kind === 'formation')) { AM.guide = VEH_MODEL[APP.kind](); AM.guide.traverse(m => { if (m.material) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 0.55; m.material.color?.set?.('#c7a2ff'); } }); scene.add(AM.guide); AM.objs.push(AM.guide); }
  updateAeroHud();
}
function aeroMissionAction(kind) {               // 'photo' (F) or 'beacon' (G)
  if (!AM.active || AM.done) return false; const s = AM.steps[AM.idx]; if (!s || s.kind !== kind) return false;
  const p = APP.veh.pos, P = amP(); if (Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z) > P.radius * 2.2) return false;
  if (kind === 'photo') { camera.getWorldDirection(_v1); _v2.set(-p.x, DEM.heightAt(0, 0) + 10 - p.y, -p.z).normalize(); if (_v1.dot(_v2) < 0.6) { toast(t('mis.step.photo')); return false; } }
  advanceStep(); return true;
}
function advanceStep() { const s = AM.steps[AM.idx]; s.done = true; s.obj.traverse(m => m.material?.color?.set?.('#5a6a70')); AM.idx++; AM.hold = 0; if (AM.idx >= AM.steps.length) finishAero(); updateAeroHud(); }
function finishAero() {
  AM.done = true; const P = amP(), el = APP.t - AM.t0;
  const obj = 70 * AM.steps.filter(s => s.done).length / AM.steps.length, stab = Math.max(0, 20 - AM.contacts * 4 - AM.over * 0.5), eff = 10 * clamp(P.par / Math.max(el, 1), 0, 1);
  AM.score = { obj: Math.round(obj), stab: Math.round(stab), eff: Math.round(eff), total: Math.round(obj + stab + eff), time: Math.round(el) };
}
function updateAeroMission(dt) {
  if (!AM.active || AM.done) return; const v = APP.veh, p = v.pos, s = AM.steps[AM.idx], P = amP(); if (!s) return;
  const w = v.warn || ''; if (w && w !== AM.lastWarn && /crash|Building|seabed|aground|hardLanding/.test(w)) AM.contacts++; AM.lastWarn = w;
  const spd = v.vel ? Math.hypot(v.vel.x, v.vel.y || 0, v.vel.z) : Math.abs(v.u || v.v || 0); if (spd > { drone: 9, ugv: 5, boat: 12, rov: 2.5 }[APP.kind] ?? 99) AM.over += dt;
  AM.steps.forEach((q, i) => { if (!q.done) q.obj.traverse(m => m.material?.color?.set?.(i === AM.idx ? (q.kind === 'gate' ? '#f0c879' : '#ffffff') : '#6fb7a5')); });
  const d3 = Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z), d2 = Math.hypot(p.x - s.x, p.z - s.z);
  if (s.kind === 'gate' && d3 < P.gate * 1.1) advanceStep();
  else if (s.kind === 'hold') { if ((APP.kind === 'drone' || APP.kind === 'rov' ? d3 : d2) < P.radius && spd < 1.5) { AM.hold += dt; if (AM.hold >= P.dwell) advanceStep(); } else AM.hold = Math.max(0, AM.hold - dt); }
  else if (s.kind === 'formation' && AM.guide) {
    const a = APP.t * 0.25; AM.guide.position.set(s.x + Math.sin(a) * P.radius, s.y + (APP.kind === 'drone' ? 0 : 0), s.z + Math.cos(a) * P.radius); AM.guide.rotation.y = a + Math.PI / 2;
    if (AM.guide.position.distanceTo(p) < P.form) { AM.hold += dt; if (AM.hold >= P.dwell * 1.5) advanceStep(); } else AM.hold = Math.max(0, AM.hold - dt * 0.5);
  }
  updateAeroHud();
}
function updateAeroHud() {
  const el = $('#mission'); if (!AM.active) return; el.hidden = false; const P = amP();
  if (AM.done) { const S = AM.score; el.innerHTML = `<b>${esc(mtext(AM.def, 'name'))}</b><span>${esc(t('mis.complete'))} · ${esc(t('mis.score', { s: S.total }))}</span><span class="mut">${esc(t('mis.objectives'))} ${S.obj}/70 · ${esc(t('mis.stability'))} ${S.stab}/20 · ${esc(t('mis.efficiency'))} ${S.eff}/10 · ${S.time} s</span>`; return; }
  const s = AM.steps[AM.idx], d = s ? Math.hypot(APP.veh.pos.x - s.x, APP.veh.pos.z - s.z) : 0;
  const step = t('mis.step.' + s.kind, { s: s.kind === 'formation' ? Math.round(P.dwell * 1.5) : P.dwell, m: P.form });
  el.innerHTML = `<b>${esc(mtext(AM.def, 'name'))}</b><span>${AM.idx + 1}/${AM.steps.length} · ${esc(step)}</span><span class="mut">${fmtDist(d)} · ${Math.round(APP.t - AM.t0)} s${AM.hold > 0 ? ` · ${AM.hold.toFixed(1)} s` : ''}</span>`;
}

/* ======================= Resilience Crew Lab · crew mode (missions at real places, mentor, debrief, team bridge) ======================= */
/* Active only when the page sets globalThis.AERO_CREW (sim/index.html of Resilience Crew Lab) and opens #crew/<missionId>.
   The Crew Lab page embeds this simulator in a same-origin frame: telemetry, events and results go to the parent with
   postMessage, and the parent's on-device coach model answers the apprentice's questions ("crew" tutor provider).
   Civilian, non-combat, educational exercises only; the real place is geographic context. */
const CREW_ICONS = {"sar-mountain":["#3f7d5a","M2 20 9 8l4 6 3-4 6 10zM15 5a2 2 0 1 0 0 .1M15 7v3M13.5 8.5h3"],"flood-extent":["#2d6fa3","M3 9l4-3 4 3 4-3 4 3M2 14c2-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0M2 19c2-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0"],"roof-inspect":["#8a5a3c","M3 12 12 4l9 8M5 10v10h14V10M9 20v-5h6v5M16 7V4h2v5"],"medical-delivery":["#c0392b","M4 8h16v12H4zM9 8V5h6v3M12 11v6M9 14h6"],"forest-observe":["#2e7d32","M7 3 3 11h8zM7 11v9M17 6l-4 8h8zM17 14v6M2 20h20"],"solar-inspect":["#d4a017","M3 18 6 9h14l-3 9zM8 9l-2 9M12 9l-1 9M16 9l-1 9M4.5 13.5h15M12 2v3M6 4l1.5 2M18 4l-1.5 2"],"bridge-record":["#5d6d7e","M2 17h20M2 12h20M5 12v8M19 12v8M12 12v8M5 12c2-5 12-5 14 0"],"storm-assess":["#6c5ce7","M4 10c0-4 4-6 8-6s8 2 8 6M2 14h13a3 3 0 1 0-3-3M2 18h17a3 3 0 1 1-3 3"],"landslide-watch":["#a0522d","M2 20 10 6l10 14zM10 6l2 6-3 3 2 5M15 15h2M14 18h3M6 18h2"],"wildfire-watch":["#e67e22","M12 21c-4 0-6-3-6-6 0-4 4-6 4-10 3 2 3 4 3 6 1-1 2-2 2-4 3 2 3 5 3 8 0 3-2 6-6 6zM12 21c-1.5 0-2.5-1-2.5-2.5S12 15 12 15s2.5 2 2.5 3.5S13.5 21 12 21"],"coast-erosion":["#c8a165","M2 8c3 0 4 3 7 3s4-3 7-3 4 2 6 2M2 13c3 0 4 3 7 3s4-3 7-3 4 2 6 2M13 20l3-4 3 4zM5 20l2-3 2 3"],"heritage-record":["#9b2d30","M3 9 12 3l9 6M3 9h18M5 9v9M9 9v9M15 9v9M19 9v9M2 20h20"],"wildlife-census":["#16a085","M4 12c3-4 7-4 10 0-3 4-7 4-10 0zM14 12l4-3v6zM8 12h.1M4 20h16M6 17v3M10 17v3"],"crop-survey":["#7cb342","M2 20 8 8h8l6 12zM6 14h12M4 17h16M10 8l-2 12M14 8l2 12M12 2v4M10 4h4"],"lighthouse-inspect":["#e0a800","M9 21 10 8h4l1 13zM9 8h6M10 8V5l2-2 2 2v3M3 6l4 1M21 6l-4 1M8 14h8"],"relay-comms":["#00838f","M12 10v11M8 21h8M12 10a2 2 0 1 0 0-.1M7 5a7 7 0 0 0 0 9M17 5a7 7 0 0 1 0 9M4 2a11 11 0 0 0 0 15M20 2a11 11 0 0 1 0 15"],"aerial-survey":["#34495e","M2 12h20M12 5l-2 7 2 7M5 9l2 3-2 3M19 12l3-2v4zM8 12l-1-5h2l3 5"],"relief-sorting":["#d35400","M3 10h8v9H3zM13 10h8v9h-8zM8 3h8v7H8zM6 13h2M16 13h2M11 5h2"],"accessible-route":["#2471a3","M12 4a1.5 1.5 0 1 0 0 .1M11 7v6h5l2 5M11 10h5M8 11a6 6 0 1 0 8 6"],"road-obstacle":["#e74c3c","M4 21 10 3h4l6 18zM8 15h8M9 11h6M2 21h20"],"shelter-inspect":["#27ae60","M3 11 12 4l9 7M5 10v10h14V10M10 20v-5h4v5M12 8v1"],"load-balance":["#8e44ad","M12 4v16M5 20h14M4 8h16M4 8l-2 6h4zM20 8l-2 6h4zM12 4a1 1 0 1 0 0 .1"],"vehicle-precheck":["#2c3e50","M3 15l2-6h14l2 6v4H3zM5 9l2-4h10l2 4M7 19v2M17 19v2M7 15h.1M17 15h.1M10 12l2 2 3-4"],"relay-transport":["#117a65","M2 15h7v4H2zM15 15h7v4h-7zM9 17h6M12 14l3 3-3 3M4 15v-3h3l2 3M17 15v-3h3l2 3"],"trail-patrol":["#6d4c41","M3 21c4-4 2-8 6-11s7-2 8-7M14 21c1-3 4-4 7-5M9 9h.1M6 15h.1M17 6l2-2"],"tunnel-portal":["#4e5d6c","M2 20V10a10 7 0 0 1 20 0v10M7 20v-7a5 4 0 0 1 10 0v7M2 20h20M12 15v5"],"market-logistics":["#b9770e","M3 10l2-5h14l2 5M3 10h18v10H3zM9 20v-6h6v6M3 10c0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0"],"marine-litter":["#1abc9c","M2 16c2-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0M9 4h2v3l1 2v5H8V9l1-2zM15 9l3 1-1 4-3-1z"],"harbor-inspect":["#1f618d","M12 3v14M8 7h8M12 3a1.5 1.5 0 1 0 0 .1M4 13a8 8 0 0 0 16 0M4 13l2 2M20 13l-2 2M2 20h20"],"lifebuoy-delivery":["#e74c3c","M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M12 12m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M6.3 6.3l3.2 3.2M17.7 6.3l-3.2 3.2M6.3 17.7l3.2-3.2M17.7 17.7l-3.2-3.2"],"water-sampling":["#3498db","M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7 15h10"],"pier-inspect":["#7f8c8d","M2 10h20M4 10v10M9 10v10M15 10v10M20 10v10M2 16c2-1 3-1 5 0s3 1 5 0 3-1 5 0 3 1 5 0M6 10V6h4v4"],"lake-patrol":["#2e86c1","M3 15h14l3-4H8l-2-3H4zM10 8V5h3l2 3M2 19c2-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0"],"oil-sheen-watch":["#5b2c6f","M12 3c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10zM2 20c2-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0M10 14a2 2 0 0 0 2 2"],"reef-survey":["#ff6f61","M12 21v-8M12 13l-4-4V5M12 13l4-4V6M8 9 5 7M16 9l3-2M12 17l-3-2M12 17l3-2M4 21h16"],"seagrass-record":["#4caf50","M6 21c0-6-2-9-2-14M10 21c0-5 1-8 3-12M14 21c0-4-1-7-3-9M18 21c0-6 1-9 3-13M2 21h20"],"hull-inspect":["#2c3e50","M2 10h20l-3 7H5zM5 10V6h9l3 4M8 6V4M2 20c2-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0M17 13h.1"],"cable-check":["#0e6655","M2 14c4-3 6 3 10 0s6-3 10 0M2 19h20M7 8h4v4H7zM11 10h3M9 8V5M15 4l3 3"],"lake-bottom":["#154360","M2 6c2-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0M2 20h20M5 20l2-3 2 3M15 20l3-5 3 5M10 12h4v3h-4zM12 9v3"],"phishing":["#c0392b","M3 5h18v13H3zM3 5l9 7 9-7M17 12v4a2 2 0 0 1-4 0"],"mfa":["#2980b9","M7 3h10v18H7zM10 18h4M12 7a2 2 0 0 1 2 2v2h-4V9a2 2 0 0 1 2-2zM9.5 11h5v3h-5z"],"backup":["#16a085","M12 3c5 0 8 1.5 8 3s-3 3-8 3-8-1.5-8-3 3-3 8-3zM4 6v6c0 1.5 3 3 8 3M20 6v4M15 17a4 4 0 1 0 1.5-3.2M15 13v2h2"],"fact-check":["#8e44ad","M10 10m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0M14.5 14.5 20 20M7.5 10l2 2 3.5-4"],"permissions":["#d35400","M9 7a3 3 0 1 0 0 .1M3 20v-1a6 6 0 0 1 9-5M16 13v-2a2 2 0 0 1 4 0v2M15 13h6v6h-6z"],"handover":["#2c3e50","M8 4h8v3H8zM6 5H4v16h16V5h-2M8 12h8M8 16h5"],"comms-outage":["#7f8c8d","M12 20h.1M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 14 0M2 9.5a15 15 0 0 1 20 0M3 3l18 18"],"weather-brief":["#f39c12","M7 9a4 4 0 0 1 7.7-1.5A3.5 3.5 0 1 1 17 15H7a3 3 0 0 1 0-6zM9 19l-1 2M13 19l-1 2M17 19l-1 2"],"map-reading":["#27ae60","M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15M12 10a1.5 1.5 0 1 0 0 .1"],"image-privacy":["#34495e","M3 7h4l2-3h6l2 3h4v12H3zM12 13m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M3 3l18 18"]};
const CREW_ROLES = ['pilot', 'navigator', 'observer', 'coordinator'];
const CREW = {
  id: '', mission: null, type: '', T: null, def: null, tier: 'beginner', data: null, phase: 'idle', confirmed: false, checks: new Set(),
  log: [], album0: 0, buoys0: 0, home: null, result: null, report: '', stepView: -1, minimized: false, briefPaused: false, room: '',
  role: (() => { const r = new URLSearchParams(location.search).get('role'); return CREW_ROLES.includes(r) ? r : 'pilot'; })(),
  embedded: (() => { try { return window.parent !== window; } catch { return true; } })(), lastTel: 0, asks: new Map(), askN: 0, lastIdx: 0,
};
const crewIcon = (type, size = 22) => { const [c, d] = CREW_ICONS[type] || ['#7fd4ff', 'M4 4h16v16H4z']; return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`; };
const ct = (k, vars) => t('crew.type.' + CREW.type + '.' + k, vars);
const CREW_TIER = { basic: 'beginner', advanced: 'advanced', expert: 'expert' };
const SPEECH_TAG = { 'zh-Hant': 'zh-TW', 'zh-Hans': 'zh-CN', en: 'en-US', ja: 'ja-JP', ko: 'ko-KR', vi: 'vi-VN', th: 'th-TH', id: 'id-ID', ms: 'ms-MY', fil: 'fil-PH', km: 'km-KH', my: 'my-MM', hi: 'hi-IN', bn: 'bn-BD', mr: 'mr-IN', ta: 'ta-IN', te: 'te-IN', ur: 'ur-PK', ar: 'ar-SA', fa: 'fa-IR', he: 'he-IL', tr: 'tr-TR', ru: 'ru-RU', uk: 'uk-UA', pl: 'pl-PL', cs: 'cs-CZ', ro: 'ro-RO', hu: 'hu-HU', el: 'el-GR', de: 'de-DE', nl: 'nl-NL', da: 'da-DK', sv: 'sv-SE', nb: 'nb-NO', fi: 'fi-FI', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', pt: 'pt-BR', sw: 'sw-KE' };

/* ---- bridge to the Crew Lab page ---- */
function crewPost(type, payload = {}) { if (!CREW.embedded) return; try { window.parent.postMessage({ source: 'aero-crew', type, missionId: CREW.id, ...payload }, location.origin); } catch { } }
addEventListener('message', e => {
  if (e.origin !== location.origin || e.data?.source !== 'rcl') return; const d = e.data;
  if (d.type === 'room') { CREW.room = d.code || ''; if (!$('#crewBrief')?.hidden) renderBrief(); }
  else if (d.type === 'pause' && APP.started && !APP.paused) { APP.paused = true; updateDock(); toast(t('btn.pause')); }
  else if (d.type === 'coach-status' && d.id == null) { CREW_COACH.state = d.state || 'idle'; CREW_COACH.progress = d.progress || 0; for (const w of CREW_COACH.waiters.splice(0)) w(d); }
  else if (d.type === 'answer' || d.type === 'answer-progress' || d.type === 'answer-error' || d.type === 'coach-status') {
    const a = CREW.asks.get(d.id); if (!a) return; a.touch();
    if (d.type === 'coach-status') a.partial(t('crew.coachLoading', { p: Math.round((d.progress || 0) * 100) }));
    else if (d.type === 'answer-progress') a.partial(d.text || '');
    else if (d.type === 'answer') { CREW.asks.delete(d.id); a.resolve(d.text || ''); }
    else { CREW.asks.delete(d.id); a.reject(new Error(d.code || 'coach')); }
  }
});
/* the apprentice's question goes to the Crew Lab coach model running in the parent page (never to a server) */
function crewAsk(q, onPartial) {
  if (!CREW.embedded) return Promise.reject(new Error('standalone'));
  const id = ++CREW.askN, lang = LANG_NAME[I18N.lang] || 'English';
  return new Promise((resolve, reject) => {
    let timer; const touch = () => { clearTimeout(timer); timer = setTimeout(() => { CREW.asks.delete(id); reject(new Error('timeout')); }, 180000); };
    CREW.asks.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); }, partial: onPartial, touch }); touch();
    onPartial(t('crew.coachWait'));
    crewPost('ask', { id, q, language: lang, context: flightContext().slice(0, 3800) });
  });
}
/* load the parent's coach model on request (explicit user action; about 470 MB the first time, then cached by the browser) */
const CREW_COACH = { state: 'unknown', progress: 0, waiters: [] };
function crewLoadModel(onProgress) {
  if (!CREW.embedded) return Promise.reject(new Error('standalone'));
  return new Promise((resolve, reject) => {
    const h = d => { if (d.state === 'ready') resolve(); else if (d.state === 'error' || (d.state === 'idle' && CREW_COACH.started)) reject(new Error(d.code || 'load')); else { onProgress?.(Math.round((d.progress || 0) * 100)); CREW_COACH.waiters.push(h); } };
    CREW_COACH.started = true; CREW_COACH.waiters.push(h); crewPost('coach-load');
  });
}
function crewContext() {
  const objs = [1, 2, 3].map(i => ct('obj' + i)).join(' / ');
  return `Crew Lab mission: ${ct('title')} (${CREW.mission?.level}). Brief: ${ct('brief')} Objectives: ${objs}. Instructor tip: ${ct('tip')} Apprentice role: ${t('crew.role.' + CREW.role)}. Phase: ${CREW.phase}. Educational, non-combat exercise.`;
}

/* ---- data ---- */
async function loadCrewData() {
  if (CREW.data) return CREW.data;
  CREW.data = globalThis.AERO_CREW_DATA || await fetchJSON('data/crew-missions.json', { timeout: 20000 });
  return CREW.data;
}
function crewLog(code, vars) { const e = { at: new Date().toISOString(), t: Math.round(APP.t), code, text: t('crew.ev.' + code, vars) }; CREW.log.push(e); crewPost('event', e); }
const crewHash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

async function startCrew(id) {
  const data = await loadCrewData(); const m = data.missions.find(x => x.id === id) || data.missions.find(x => x.place);
  if (!m) return;
  const T = data.types[m.type]; CREW.id = m.id; CREW.mission = m; CREW.type = m.type; CREW.T = T; CREW.tier = CREW_TIER[m.level] || 'beginner';
  try { history.replaceState(null, '', location.search + '#crew/' + encodeURIComponent(m.id)); } catch { }
  document.body.dataset.crew = T.domain;
  if (T.domain === 'digital' || !T.vehicle) {   // desk exercises run in the Crew Lab page; here: brief over free flight
    crewReset(); CREW.def = null; await loadPlace(PLACE_BY_ID.get(DEFAULT_PLACE), 'drone', { keepHash: true, onReady: crewReady }); return;
  }
  const p = PLACE_BY_ID.get(m.place) || { i: -1, id: m.place, lat: m.p.lat, lon: m.p.lon, zh: m.p.zh, zhs: m.p.zhs, en: m.p.en, cc: m.p.cc, region: m.p.region, cat: m.p.cat, desc: '', src: '' };
  const veh = T.vehicle;
  CREW.def = {
    id: 'crew-' + m.id, crew: true, steps: T.kinds.map(kind => ({ kind })), layoutVeh: veh, scale: veh === 'plane' ? 3.5 : veh === 'car' ? 1.4 : 1, layoutSeed: crewHash(m.id) % 9 + 1,
    scene: { landmark: { width: 30, height: 20, depth: 30 }, place: { underwater: veh === 'rov' } }, name: {}, description: {},
  };
  crewNames(); crewReset();
  APP.missionKind = 'aero';
  const lp = loadPlace(p, veh, { mission: CREW.def, tier: CREW.tier, keepHash: true, quiet: true, onReady: crewReady });
  openBrief(); renderMentor(true);   // read the brief while the real terrain loads
  await lp;
}
function crewNames() { if (!CREW.def) return; CREW.def.name = { [I18N.lang]: ct('title'), en: ct('title') }; CREW.def.description = { [I18N.lang]: ct('brief'), en: ct('brief') }; }
function crewReset() { CREW.phase = 'brief'; CREW.confirmed = false; CREW.checks = new Set(); CREW.log = []; CREW.result = null; CREW.report = ''; CREW.stepView = -1; CREW.lastIdx = 0; $('#crewDebrief') && ($('#crewDebrief').hidden = true); }
function crewReady() {
  CREW.home = APP.spawnAt ? { ...APP.spawnAt } : { x: 0, y: 0, z: 0 }; CREW.album0 = MIS.album.length; CREW.buoys0 = BUOYS.list.length;
  $('#hudPlace').onclick = () => openBrief();
  crewDockLabels(); if (!CREW.confirmed) openBrief(); else { $('#crewBrief') && ($('#crewBrief').hidden = true); $('#startOverlay').hidden = false; }
  renderMentor(true); crewPost('ready', { mtype: CREW.type, place: APP.place?.id, vehicle: APP.kind, role: CREW.role });
}

/* ---- dock: "brief" replaces the AERO mission list, "back" returns to the Crew Lab ---- */
ICON.back = '<path d="M15 5l-7 7 7 7M8 12h12"/>'; ICON.list = '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>';
if (globalThis.AERO_CREW) {
  for (const d of DOCK) { if (d[0] === 'missions') { d[0] = 'brief'; d[1] = 'list'; d[2] = 'crew.brief'; d[3] = ''; } else if (d[0] === 'places') { d[0] = 'back'; d[1] = 'back'; d[2] = 'crew.back'; } }
  globalThis.CREW_ACT = { brief: () => CREW.id ? openBrief() : openSheet('missions'), back: () => crewBack() };
  globalThis.CREW_GATE = () => { if (CREW.confirmed || !CREW.id) return true; openBrief(); toast(t('crew.confirmFirst'), 2500); return false; };
  globalThis.CREW_RELABEL = () => { crewNames(); crewDockLabels(); if (!$('#crewBrief')?.hidden) renderBrief(); renderMentor(true); if (!$('#crewDebrief')?.hidden) renderDebrief(); };
  addEventListener('keydown', e => { if (e.code === 'Escape' && !$('#crewBrief')?.hidden && CREW.confirmed) closeBrief(); }, true);
}
function crewDockLabels() { applyI18n($('#dock')); }
function crewBack() {
  globalThis.speechSynthesis?.cancel?.();
  if (CREW.embedded) { APP.paused = true; updateDock(); crewPost('close'); }
  else location.href = '../index.html#missions';
}

/* ---- briefing: objectives, checklist gate, role, real place ---- */
function crewEl(id, cls) { let el = $('#' + id); if (!el) { el = document.createElement('section'); el.id = id; el.className = cls || 'glass'; el.hidden = true; $('#stage').appendChild(el); } return el; }
function openBrief() {
  const el = crewEl('crewBrief'); el.hidden = false; $('#startOverlay').hidden = true;
  if (APP.started && !APP.paused) { APP.paused = true; CREW.briefPaused = true; updateDock(); }
  renderBrief();
}
function closeBrief() {
  const el = $('#crewBrief'); if (el) el.hidden = true; globalThis.speechSynthesis?.cancel?.();
  if (!APP.started && APP.state === 'sim' && APP.veh) $('#startOverlay').hidden = false;
  if (CREW.briefPaused) { CREW.briefPaused = false; APP.paused = false; updateDock(); }
}
function renderBrief() {
  const el = $('#crewBrief'); if (!el || !CREW.id) return; const m = CREW.mission, T = CREW.T, p = APP.place, digital = !CREW.def;
  const dur = { basic: 8, advanced: 12, expert: 15 }[m.level] || 10, n = digital ? 0 : AM.def === CREW.def && AM.steps.length ? AM.steps.length : Math.min(MTIER[CREW.tier].count, T.kinds.length);
  el.innerHTML = `<header><span class="cbIcon">${crewIcon(CREW.type, 30)}</span><div class="cbTitle"><small>${esc(t('crew.brief'))} · ${esc(m.id.toUpperCase())}</small><h3>${esc(ct('title'))}</h3></div><button class="x" data-cb="close" aria-label="${esc(t('btn.close'))}">×</button></header>
    <div class="cbTags"><span>${esc(t('crew.dom.' + T.domain))}</span><span>${esc(t('crew.lv.' + m.level))}</span>${digital ? '' : `<span>${esc(t('crew.veh.' + T.vehicle))}</span><span>${esc(t('crew.stations', { n }))}</span>`}<span>${esc(t('crew.duration', { m: dur }))}</span></div>
    ${digital ? `<p class="mut">${esc(t('crew.digitalNote'))}</p>` : `<p class="cbPlace"><b>${esc(t('crew.place'))}:</b> ${esc(placeName(p))}${placeRegion(p) ? ' · ' + esc(placeRegion(p)) : ''} <span class="mut">(${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})</span></p>`}
    <p>${esc(ct('brief'))}</p>
    <h4>${esc(t('crew.objectives'))}</h4><ol class="cbList">${[1, 2, 3].map(i => `<li>${esc(ct('obj' + i))}</li>`).join('')}</ol>
    <h4>${esc(t('crew.checklist'))}</h4><div class="cbChecks">${[1, 2, 3].map(i => `<label><input type="checkbox" data-chk="${i}" ${CREW.checks.has(i) || CREW.confirmed ? 'checked' : ''} ${CREW.confirmed ? 'disabled' : ''}><span>${esc(ct('chk' + i))}</span></label>`).join('')}</div>
    <label class="row cbRole"><span>${esc(t('crew.role'))}</span><select id="cbRole">${CREW_ROLES.map(r => opt(r, t('crew.role.' + r), CREW.role)).join('')}</select></label>
    <p class="mut small">${esc(t('crew.roleTip.' + CREW.role))}</p>
    <p class="cbTip"><b>${esc(t('crew.tip'))}:</b> ${esc(ct('tip'))}</p>
    <p class="mut small">${esc(t('crew.fictional'))} ${CREW.room ? '· ' + esc(t('crew.teamOn', { code: CREW.room })) : CREW.embedded ? '' : ''}</p>
    <div class="row cbBtns">${CREW.confirmed ? `<button class="btn primary" data-cb="close">${esc(t(APP.started ? 'btn.resume' : 'btn.start'))}</button>` : `<button class="btn primary" data-cb="confirm">${esc(t('crew.confirm'))}</button>`}<button class="btn" data-cb="speak">🔊 ${esc(t('crew.speak'))}</button>${CREW.embedded ? `<button class="btn" data-cb="back">${esc(t('crew.back'))}</button>` : ''}</div>`;
  el.onclick = e => {
    const b = e.target.closest('[data-cb]'); if (!b) return; const a = b.dataset.cb;
    if (a === 'close') { if (!CREW.confirmed && !digital) { toast(t('crew.confirmFirst'), 2500); return; } closeBrief(); }
    else if (a === 'confirm') {
      if (CREW.checks.size < 3) { toast(t('crew.confirmFirst'), 2500); $$('#crewBrief [data-chk]').forEach(c => { if (!c.checked) c.parentElement.classList.add('crew-hl'); }); return; }
      CREW.confirmed = true; CREW.phase = 'ready'; crewLog('confirm'); closeBrief(); renderMentor(true); crewPost('checklist', { count: 3 });
    }
    else if (a === 'speak') crewSpeak([ct('title'), ct('brief'), ...[1, 2, 3].map(i => ct('obj' + i)), ct('tip')].join('. '));
    else if (a === 'back') crewBack();
  };
  el.onchange = e => {
    const c = e.target.closest('[data-chk]'); if (c) { c.checked ? CREW.checks.add(+c.dataset.chk) : CREW.checks.delete(+c.dataset.chk); c.parentElement.classList.remove('crew-hl'); }
    if (e.target.id === 'cbRole') { CREW.role = e.target.value; crewPost('role', { role: CREW.role }); renderBrief(); renderMentor(true); }
  };
}

/* ---- step-by-step mentor (follows the mission state; can be read aloud; points at the control) ---- */
function crewSteps() {
  if (!CREW.def) return [{ k: 'brief', text: t('crew.step.brief') }, { k: 'report', text: t('crew.digitalNote') }];
  const air = ['drone', 'rov', 'plane'].includes(APP.kind), P = amP(), list = [
    { k: 'brief', text: t('crew.step.brief'), show: '#crewBrief, [data-act="brief"]' },
    { k: 'controls', text: t(air ? 'crew.step.controls' : 'crew.step.controlsGround'), show: '#padL, #padR' },
    { k: 'start', text: t(APP.kind === 'drone' ? 'crew.step.start' : 'crew.step.startOther'), show: '[data-act="start"]' },
  ];
  AM.steps.forEach((s, i) => {
    const v = APP.veh?.pos || { x: 0, z: 0 }, d = Math.hypot(s.x - v.x, s.z - v.z), dir = compassWord(bearingTo(v.x, v.z, s.x, s.z));
    const act = t('crew.step.act.' + s.kind, { s: s.kind === 'formation' ? Math.round(P.dwell * 1.5) : P.dwell, m: Math.round(P.form) });
    list.push({ k: 'st' + i, i, text: t('crew.step.navigate', { n: i + 1, total: AM.steps.length, d: fmtDist(d), dir }) + ' ' + act, show: s.kind === 'photo' ? '[data-act="photo"]' : s.kind === 'beacon' ? '[data-act="buoy"]' : '#mini' });
  });
  list.push({ k: 'return', text: t('crew.step.return'), show: '#mini' }, { k: 'report', text: t('crew.step.report'), show: '#crewDebrief' });
  return list;
}
function crewCurrentStep(list) {
  if (CREW.phase === 'brief') return 0;
  if (!APP.started) return CREW.confirmed ? 2 : 0;
  if (CREW.phase === 'debrief') return list.length - 1;
  if (CREW.phase === 'return') return list.length - 2;
  if (APP.t - AM.t0 < 6 && AM.idx === 0) return 1;
  return 3 + Math.min(AM.idx, AM.steps.length - 1);
}
function renderMentor(full) {
  if (!CREW.id) return; const el = crewEl('crewMentor', 'glass'); el.hidden = false; el.classList.toggle('min', CREW.minimized);
  const list = crewSteps(), cur = crewCurrentStep(list), idx = CREW.stepView >= 0 ? Math.min(CREW.stepView, list.length - 1) : cur, st = list[idx];
  const prog = !CREW.def ? '' : CREW.phase === 'debrief' ? t('crew.missionDone') : !APP.started ? t('crew.notStarted') : `${Math.min(AM.idx + 1, AM.steps.length)}/${AM.steps.length} · ${Math.round(APP.t - AM.t0)} s${AM.hold > 0 ? ` · ${AM.hold.toFixed(1)} s` : ''}`;
  if (full || !el.firstChild) {
    el.innerHTML = `<div class="cmHead"><span class="ic">${crewIcon(CREW.type, 18)}</span><b>${esc(ct('title'))}</b><button class="x sm" data-cm="min" aria-label="${esc(t(CREW.minimized ? 'crew.mentorOn' : 'crew.hide'))}">${CREW.minimized ? '+' : '–'}</button></div>
      <div class="cmProg mut"></div><div class="cmLabel small"><span>${esc(t('crew.mentorTitle'))}</span> <span class="cmN"></span></div><p class="cmStep"></p><p class="cmRole mut small">${esc(t('crew.roleTip.' + CREW.role))}</p>
      <div class="cmBtns"><button class="btn sm" data-cm="prev" aria-label="${esc(t('crew.prev'))}">‹</button><button class="btn sm" data-cm="speak">🔊 ${esc(t('crew.speak'))}</button><button class="btn sm" data-cm="show">⌖ ${esc(t('crew.show'))}</button><button class="btn sm" data-cm="next" aria-label="${esc(t('crew.next'))}">›</button>${CREW.def && APP.started && CREW.phase !== 'debrief' ? `<button class="btn sm" data-cm="finish">${esc(t('crew.finish'))}</button>` : ''}</div>`;
    el.onclick = e => {
      const b = e.target.closest('[data-cm]'); if (!b) return; const a = b.dataset.cm, L = crewSteps(), c = crewCurrentStep(L), i = CREW.stepView >= 0 ? CREW.stepView : c;
      if (a === 'min') { CREW.minimized = !CREW.minimized; renderMentor(true); }
      else if (a === 'prev') { CREW.stepView = Math.max(0, i - 1); renderMentor(); }
      else if (a === 'next') { const n = Math.min(L.length - 1, i + 1); CREW.stepView = n === c ? -1 : n; renderMentor(); }
      else if (a === 'speak') crewSpeak($('#crewMentor .cmStep').textContent + ' ' + t('crew.roleTip.' + CREW.role));
      else if (a === 'show') crewHighlight(L[i]?.show);
      else if (a === 'finish') crewFinish(true);
    };
    el.dataset.key = '';
  }
  const key = `${idx}|${st?.text}|${prog}`; if (el.dataset.key === key) return; el.dataset.key = key;
  $('.cmProg', el).textContent = prog; $('.cmN', el).textContent = `${idx + 1}/${list.length}`; $('.cmStep', el).textContent = st?.text || '';
}
function crewHighlight(sel) {
  if (!sel) return; const els = $$(sel).filter(x => x.offsetParent !== null || x.id === 'mini'); if (!els.length) { toast(t('crew.show') + ' —'); return; }
  for (const x of els) { x.classList.remove('crew-hl'); void x.offsetWidth; x.classList.add('crew-hl'); setTimeout(() => x.classList.remove('crew-hl'), 3200); }
}
function crewSpeak(text) {
  const S = globalThis.speechSynthesis; if (!S || !globalThis.SpeechSynthesisUtterance) { toast(t('crew.noVoice')); return; }
  S.cancel(); const tag = SPEECH_TAG[I18N.lang] || I18N.lang, base = tag.split('-')[0].toLowerCase();
  const voices = S.getVoices() || [], v = voices.find(x => x.lang?.toLowerCase() === tag.toLowerCase()) || voices.find(x => x.lang?.toLowerCase().split(/[-_]/)[0] === base);
  if (voices.length && !v) toast(t('crew.noVoice'), 3500);
  const u = new SpeechSynthesisUtterance(text.slice(0, 1200)); u.lang = tag; if (v) u.voice = v; u.rate = 1; S.speak(u);
}

/* ---- per-frame: stations, return to the start point, telemetry ---- */
function updateCrew(dt, run) {
  if (!CREW.id || !CREW.def || APP.state !== 'sim') return;
  if (APP.started && CREW.phase === 'ready') { CREW.phase = 'run'; crewLog('start'); crewPost('start'); renderMentor(true); }
  if (CREW.phase === 'run' || CREW.phase === 'return') {
    if (AM.idx > CREW.lastIdx) { for (let n = CREW.lastIdx + 1; n <= AM.idx; n++) crewLog('station', { n }); CREW.lastIdx = AM.idx; CREW.stepView = -1; renderMentor(true); }
    const v = APP.veh, w = v?.warn || ''; if (w && w !== CREW.lastWarn && /crash|Building|seabed|aground|hardLanding/.test(w)) crewLog('crash', { w: t(w, { ...(v.warnP || {}), why: v.why ? t(v.why) : '' }) }); CREW.lastWarn = w;
    if (CREW.phase === 'run' && AM.done) { CREW.phase = 'return'; crewLog('done'); CREW.stepView = -1; toast(t('crew.step.return'), 6000); }
    if (CREW.phase === 'return' && run && v) {
      const h = CREW.home, d = Math.hypot(v.pos.x - h.x, v.pos.z - h.z), spd = v.vel ? Math.hypot(v.vel.x, v.vel.y || 0, v.vel.z) : Math.abs(v.u || v.v || 0);
      const ok = APP.kind === 'plane' ? d < 350 : APP.kind === 'drone' ? d < 8 && (v.landed || v.agl < 1.2) : APP.kind === 'rov' ? d < 10 : d < 14 && spd < 1.2;
      if (ok) { crewLog('home'); crewFinish(false); }
    }
  }
  if (performance.now() - (CREW.lastMentor || 0) > 250) { CREW.lastMentor = performance.now(); renderMentor(); }
  if (CREW.embedded && performance.now() - CREW.lastTel > 1000) {
    CREW.lastTel = performance.now(); const v = APP.veh;
    crewPost('telemetry', { phase: CREW.phase, progress: AM.idx, total: AM.steps.length, speed: v?.vel ? Math.hypot(v.vel.x, v.vel.z) : Math.abs(v?.u || 0), altitude: v?.agl ?? 0, battery: v?.battery != null ? v.battery * 100 : 100, score: crewScore().total, vehicle: APP.kind, role: CREW.role });
  }
}
function crewScore() {
  const total = AM.steps.length || 1, done = AM.steps.filter(s => s.done).length, el = AM.t0 != null ? APP.t - AM.t0 : 0;
  const par = (MTIER[CREW.tier]?.par || 240) * (APP.kind === 'plane' || APP.kind === 'car' ? 1.5 : 1);
  const stations = Math.round(60 * done / total), safety = Math.max(0, 20 - AM.contacts * 4), time = Math.round(Math.max(0, 15 - Math.max(0, el - par) / 24));
  const photos = Math.max(0, MIS.album.length - CREW.album0), buoys = Math.max(0, BUOYS.list.length - CREW.buoys0), inspect = Math.min(5, photos + buoys);
  return { stations, safety, time, inspect, total: stations + safety + time + inspect, done, count: total, elapsed: Math.round(el), contacts: AM.contacts, photos, buoys };
}
function crewFinish(early) {
  if (CREW.phase === 'debrief') return; if (early) crewLog('finish');
  CREW.phase = 'debrief'; CREW.result = crewScore(); APP.paused = true; updateDock(); CREW.stepView = -1; renderMentor(true);
  crewPost('complete', { result: CREW.result, early: !!early });
  renderDebrief();
}
function crewRecord() {
  const p = APP.place;
  return { app: 'Resilience Crew Lab', version: '3.0.0', created: new Date().toISOString(), locale: I18N.lang, missionId: CREW.id, type: CREW.type, title: ct('title'), level: CREW.mission?.level, role: CREW.role,
    place: p ? { id: p.id, name: placeName(p), lat: p.lat, lon: p.lon } : null, vehicle: APP.kind, time: { date: APP.sun.date, minute: Math.round(APP.sun.min), preset: SET.timeMode, season: SET.season, weather: SET.wxMode },
    result: CREW.result, events: CREW.log, report: CREW.report, note: 'Educational, non-combat exercise; simulated data.' };
}
function renderDebrief() {
  const el = crewEl('crewDebrief'); el.hidden = false; const S = CREW.result || crewScore();
  el.innerHTML = `<header><span class="cbIcon">${crewIcon(CREW.type, 30)}</span><div class="cbTitle"><small>${esc(t('crew.debrief'))}</small><h3>${esc(ct('title'))}</h3></div><button class="x" data-cd="close" aria-label="${esc(t('btn.close'))}">×</button></header>
    <div class="scoreBig">${esc(t('crew.total', { s: S.total }))}</div>
    <p>${esc(t('crew.scoreLine', { c: S.done, t: S.count, s: S.safety, tm: S.time, i: S.inspect }))}</p>
    <p class="mut">${esc(t('crew.time', { t: S.elapsed + ' s' }))} · ${esc(t('crew.contacts', { n: S.contacts }))} · ${esc(t('crew.photos', { n: S.photos }))}</p>
    <p class="mut small">${esc(t('crew.debriefIntro'))}</p>
    <textarea id="cdReport" rows="4" placeholder="${esc(t('crew.reportPh'))}">${esc(CREW.report)}</textarea>
    <div class="row cbBtns"><button class="btn primary" data-cd="save">${esc(t('crew.saveReport'))}</button><button class="btn" data-cd="export">${esc(t('crew.export'))}</button><button class="btn" data-cd="retry">${esc(t('crew.retry'))}</button><button class="btn" data-cd="next">${esc(t('crew.nextMission'))}</button>${CREW.embedded ? `<button class="btn" data-cd="back">${esc(t('crew.back'))}</button>` : ''}</div>
    <h4>${esc(t('crew.log'))}</h4><ol class="cdLog small">${CREW.log.map(e => `<li><span class="mut">${e.t} s</span> ${esc(e.text)}</li>`).join('')}</ol>`;
  el.onclick = e => {
    const b = e.target.closest('[data-cd]'); if (!b) return; const a = b.dataset.cd; CREW.report = $('#cdReport')?.value || CREW.report;
    if (a === 'close') el.hidden = true;
    else if (a === 'save') { try { const k = 'rcl3:reports', all = JSON.parse(LS.get(k) || '[]'); all.unshift(crewRecord()); LS.set(k, JSON.stringify(all.slice(0, 50))); } catch { } crewLog('report'); crewPost('report', { record: crewRecord() }); toast(t('crew.saved'), 2500); renderDebrief(); }
    else if (a === 'export') { const url = URL.createObjectURL(new Blob([JSON.stringify(crewRecord(), null, 2)], { type: 'application/json' })), l = document.createElement('a'); l.href = url; l.download = `crew-${CREW.id}.json`; l.click(); setTimeout(() => URL.revokeObjectURL(url), 4000); }
    else if (a === 'retry') crewRetry();
    else if (a === 'next') { const L = CREW.data.missions.filter(x => x.place), i = L.findIndex(x => x.id === CREW.id); startCrew(L[(i + 1) % L.length].id); }
    else if (a === 'back') crewBack();
  };
}
async function crewRetry() {
  $('#crewDebrief').hidden = true; crewReset(); CREW.confirmed = true; CREW.phase = 'ready'; CREW.checks = new Set([1, 2, 3]); const msg = await spawn(APP.kind); if (msg) toast(t(msg));
  APP.started = false; APP.paused = true; startAeroMission(CREW.def, CREW.tier); crewReady(); updateDock();
}

/* ======================= loading a destination, main loop, Google 3D tiles, boot ======================= */
function setQuality(q) {
  APP.quality = q; const Q = QUALITY[q]; if (!renderer) return;
  Object.assign(TERRAIN, { factor: Q.factor, seg: Q.seg, maxActive: Q.maxActive, maxZ: Q.maxZ }); VEC.radius = Q.bld;
  TREES.enabled = SET.trees && Q.trees; TREES.radius = Q.treeR || 700; if (!TREES.enabled) TREES.clear();
  initRenderer(); applyFov(); applyTime(); syncSettings();
}
async function refreshLiveWeather() { const p = APP.place; if (!p) return; const w = await Promise.race([fetchWeather(p.lat, p.lon), sleep(12000).then(() => ({ ok: false, err: 'timeout' }))]); Object.assign(WX, w, { fetchedFor: p.id }); }
let LOADSEQ = 0;
async function loadPlace(p, kind = 'drone', opts = {}) {
  if (!p) return; const seq = ++LOADSEQ, say = m => { $('#loadMsg').textContent = m; };
  APP.state = 'loading'; APP.place = p; APP.paused = true; APP.started = false; $('#loading').hidden = false; $('#startOverlay').hidden = true;
  LS.set('aero6:last', JSON.stringify({ id: p.id, v: kind }));
  if (!opts.keepHash) try { history.replaceState(null, '', '#' + encodeURIComponent(p.id) + '/' + kind); } catch { }
  try {
    initRenderer(); const Q = QUALITY[APP.quality];
    Object.assign(TERRAIN, { factor: Q.factor, seg: Q.seg, maxActive: Q.maxActive, maxZ: Q.maxZ }); VEC.radius = Q.bld; TREES.enabled = SET.trees && Q.trees; TREES.radius = Q.treeR || 700;
    setOrigin(p.lat, p.lon); disableGoogle(); clearAeroMission(); clearMission(); BUOYS.clear(); VEC.reset(); TREES.clear(); TERRAIN.init(9); DEM.cache.clear();
    if (APP.model) { scene.remove(APP.model); APP.model = null; } APP.veh = null;
    const r = resolveTime(SET.timeMode === 'custom' ? 'morning' : SET.timeMode, SET.season, p); APP.sun.date = r.date; APP.sun.min = r.min; APP.live = !!r.live;
    updatePlaceChip();
    say(t('load.terrain')); await Promise.race([Promise.all([DEM.prefetch(0, 0, DEM_MAX_Z, 2), DEM.prefetch(0, 0, 12, 1), DEM.prefetch(0, 0, 10, 1)]), sleep(15000)]); if (seq !== LOADSEQ) return;
    APP.origin.h = DEM.heightAt(0, 0); refineSunTime(SET.timeMode);
    if (DEM.fails && ![...DEM.cache.values()].some(Boolean)) say(t('load.blocked'));
    say(t('load.weather')); if (WX.fetchedFor !== p.id) { await refreshLiveWeather(); } if (seq !== LOADSEQ) return;
    say(t('load.osm')); await VEC.init();
    if (VEC.url) {
      const wide = ['boat', 'car', 'ugv', 'rov'].includes(kind); const save = VEC.radius; if (wide) VEC.radius = 2;
      VEC.update(0, 0, 0); const t0 = performance.now(); while ([...VEC.tiles.values()].some(tl => tl.state === 1) && performance.now() - t0 < (wide ? 15000 : 10000)) await sleep(150);
      VEC.radius = save; if (seq !== LOADSEQ) return;
    }
    let seaNear = false; for (let rr = 0; rr <= 20000 && !seaNear; rr += 2500) for (let a = 0; a < 12; a++) if (DEM.heightAt(Math.sin(a / 12 * 6.283) * rr, Math.cos(a / 12 * 6.283) * rr) < 0.3) { seaNear = true; break; }
    APP.oceanNear = seaNear || VEC.waters.some(w => w.cls === 'ocean');
    APP.state = 'sim'; APP.t = 0; applyWeather();
    const msg = await spawn(kind); if (msg) toast(t(msg));
    if (opts.mission) { startAeroMission(opts.mission, opts.tier || 'beginner'); if (!opts.quiet) toast(mtext(opts.mission, 'description'), 9000); }
    else restartMission();
    if (SET.gkey) { say(t('load.google')); await enableGoogle(SET.gkey); }
    $('#startOverlay').hidden = false; updateDock(); syncSettings(); updatePlaceChip(); applyFov();
    $('#startPlace').textContent = placeName(p); setStartHint();
    localizePlace(p).then(() => { updatePlaceChip(); if (!$('#startOverlay').hidden) $('#startPlace').textContent = placeName(p); });
    say(DEM.fails && ![...DEM.cache.values()].some(Boolean) ? t('load.blocked') : '');
    opts.onReady?.();
  } catch (e) { say(t('load.fail', { msg: e.message })); console.error(e); }
}
function setStartHint() {
  const k = ['drone', 'rov'].includes(APP.kind) ? 'drone' : APP.kind === 'plane' ? 'plane' : 'ground', pads = { drone: ['pad.drone.L', 'pad.drone.R'], plane: ['pad.plane.L', 'pad.plane.R'], ground: ['pad.ground.L', 'pad.ground.R'] }[k];
  $('#startHint').textContent = SET.controls === 'sticks' ? `${t('ctrl.sticks')}: ◐ ${t(pads[0])} · ${t(pads[1])} ◑` : t('start.hint.' + k);
}
function onVehicleChanged() { updateDock(); syncSettings(); if (APP.state === 'sim') setStartHint(); }

/* ---------- optional Google Photorealistic 3D Tiles (user's own key, stored only in this browser) ---------- */
async function enableGoogle(key) {
  try {
    const [TR, PL, DR] = await Promise.all([import('3d-tiles-renderer'), import('3d-tiles-renderer/plugins'), import('three/addons/loaders/DRACOLoader.js')]);
    const tiles = new TR.TilesRenderer();
    tiles.registerPlugin(new PL.GoogleCloudAuthPlugin({ apiToken: key, autoRefreshToken: true }));
    tiles.registerPlugin(new PL.GLTFExtensionsPlugin({ dracoLoader: new DR.DRACOLoader().setDecoderPath(globalThis.AERO_DRACO || 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/') }));
    tiles.registerPlugin(new PL.TileCompressionPlugin()); tiles.registerPlugin(new PL.TilesFadePlugin());
    tiles.registerPlugin(new PL.ReorientationPlugin({ lat: GEO.lat0 * rad, lon: GEO.lon0 * rad, height: 0 }));
    const holder = new THREE.Group(); holder.rotation.y = Math.PI; holder.add(tiles.group); scene.add(holder);
    tiles.setCamera(camera); tiles.setResolutionFromRenderer(camera, renderer);
    let failed = false; tiles.addEventListener('load-error', e => { if (!failed && (e.tile == null || /root\.json/i.test(String(e.url || '')))) { failed = true; toast(t('toast.googleFail')); disableGoogle(); } });
    APP.google = { tiles, holder, ray: new THREE.Raycaster(), corr: null, aligned: 0, lastRay: 0 }; APP.google.ray.firstHitOnly = true;
    TERRAIN.group.visible = false; VEC.group.visible = false; TREES.group.visible = false;
  } catch (e) { toast(t('toast.googleModule', { msg: e.message })); APP.google = null; }
}
function disableGoogle() { const g = APP.google; if (!g) return; scene.remove(g.holder); try { g.tiles.dispose(); } catch { } APP.google = null; TERRAIN.group.visible = true; VEC.group.visible = SET.buildings; $('#attrib').textContent = t('attr.line'); }
function googleRay(x, z, fromY) { const g = APP.google; g.ray.set(_v1.set(x, fromY, z), _v2.set(0, -1, 0)); g.ray.far = fromY + 500; const h = g.ray.intersectObject(g.tiles.group, true)[0]; return h ? h.point.y : null; }
function updateGoogle() {
  const g = APP.google; if (!g) return; camera.updateMatrixWorld(); g.tiles.update();
  const v = APP.veh;
  if (g.aligned < 2 && APP.envT > 4 + g.aligned * 8) { const diffs = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const x = i * 120, z = j * 120, y = googleRay(x, z, DEM.heightAt(x, z) + 3000); if (y != null) diffs.push(y - DEM.heightAt(x, z)); } if (diffs.length >= 4) { diffs.sort((a, b) => a - b); g.holder.position.y -= diffs[Math.floor(diffs.length / 2)]; g.aligned++; } }
  if (APP.envT - g.lastRay > 0.08 && g.aligned) { g.lastRay = APP.envT; const y = googleRay(v.pos.x, v.pos.z, v.pos.y + 400); const d = DEM.heightAt(v.pos.x, v.pos.z); g.corr = y != null ? clamp(y - d, -40, 500) : null; }
  if (APP.frameN % 60 === 0) { const at = []; g.tiles.getAttributions?.(at); $('#attrib').textContent = `Google ${at.filter(a => a.type === 'string').map(a => a.value).join(' ')} · AWS Terrain Tiles · Open-Meteo`; }
}

/* ---------- main loop ---------- */
let lastT = performance.now(), acc = 0, lastPrefetch = 0; APP.envT = 0;
const FPSWIN = { t: 0, n: 0 };
let FRAME_ERR = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dtr = Math.max(1e-3, (now - lastT) / 1000), dt = Math.min(0.05, dtr); lastT = now;
  APP.fps = lerp(APP.fps, 1 / dtr, 0.05);
  if (APP.state !== 'sim' || !APP.veh || !renderer) return;
  try { simFrame(dt, dtr); } catch (e) { if (FRAME_ERR++ < 3) console.error('frame', e); }   // one bad frame must not stop the loop
}
function simFrame(dt, dtr) {
  APP.frameN++; APP.envT += dt; const run = !APP.paused, v = APP.veh, envT = APP.envT;
  if (run) APP.t += dt;
  if (APP.live && run) { APP.sun.min += dt / 60; if (APP.frameN % 300 === 0) applyTime(); }
  WAVES.time = envT; WATER_U.uTime.value = envT; TERRAIN_U.uTime.value = envT;
  const cu = clouds.material.uniforms; cu.uTime.value = envT; cu.uWind.value.set(APP.windBase.x * 1.6, APP.windBase.z * 1.6); TERRAIN_U.uCloudOff.value.copy(cu.uWind.value).multiplyScalar(envT);
  const W = APP.W || WX;
  if (run) { const gs = Math.max(0.5, ((W.gust ?? 0) - (W.wind ?? 0)) / 2); for (const a of ['x', 'y', 'z']) APP.gust[a] += (-APP.gust[a] * 0.6 + (Math.random() * 2 - 1) * gs * 1.6) * dt; }
  const inp = readInput(dt); APP.lastIn = inp;
  { const lv = ENV.levelAt(v.pos.x, v.pos.z); ENV.waterLevel = lv.level; APP.isSea = lv.sea; }
  if (run) { acc += dt; let n = 0; while (acc >= 1 / 120 && n < 8) { v.step(1 / 120, inp, ENV, APP.t); acc -= 1 / 120; n++; } }
  updateModel(dt); updateCamera(dt);
  if (APP.google) updateGoogle(); else TERRAIN.update(camera);
  const cp = camera.position, agl = cp.y - DEM.heightAt(cp.x, cp.z);
  VEC.update(v.pos.x, v.pos.z, agl);
  if (TREES.enabled && !APP.google && APP.frameN % 2 === 0) TREES.update(camera, agl); else if (!TREES.enabled) TREES.group.visible = false;
  if (APP.t - lastPrefetch > 0.5 || !run && APP.frameN % 30 === 0) { lastPrefetch = APP.t; DEM.prefetch(v.pos.x, v.pos.z, DEM_MAX_Z, 1); }
  sky.position.copy(cp);
  const sn = 2800 / 320; ocean.position.set(Math.round(cp.x / sn) * sn, 0.25, Math.round(cp.z / sn) * sn); oceanFar.position.set(cp.x, 0.15, cp.z); ocean.visible = oceanFar.visible = APP.oceanNear;
  clouds.position.x = cp.x; clouds.position.z = cp.z;
  // under water? (camera below the lake or sea surface)
  const lvC = ENV.levelAt(cp.x, cp.z), under = ENV.isWater(cp.x, cp.z) && cp.y < lvC.level - 0.05 ? 1 : 0; APP.under = under;
  TERRAIN_U.uUnder.value = under; TERRAIN_U.uWaterLevel.value = lvC.level;
  const inCloud = clouds.visible && Math.abs(cp.y - APP.cloudBase) < 90 && cu.uCover.value > 0.55;
  if (under) { scene.fog.density = 1 / 38; scene.fog.color.set('#0e4f57').multiplyScalar(clamp(0.25 + (APP.W?.cloud != null ? 1 - APP.W.cloud / 160 : 1) * Math.max(0.15, APP.sunDir.y), 0.08, 1)); }
  else { scene.fog.density = inCloud ? 1 / 120 : 1.6 / APP.vis; if (APP.frameN % 30 === 0) scene.fog.color.copy(sky.material.uniforms.uHor.value); }
  // precipitation drifting with the wind
  const wx = APP.windBase.x * dt, wz = APP.windBase.z * dt;
  if (rain.visible) { rain.position.set(cp.x, cp.y - 40, cp.z); const a = rain.geometry.attributes.position.array, fall = dt * 9; for (let i = 0; i < a.length; i += 6) { a[i + 1] -= fall; a[i + 4] -= fall; a[i] += wx; a[i + 3] += wx * 1.15; a[i + 2] += wz; a[i + 5] += wz * 1.15; if (a[i + 1] < 0) { a[i + 1] += 80; a[i + 4] += 80; } for (const o of [0, 2]) { if (a[i + o] > 60) { a[i + o] -= 120; a[i + o + 3] -= 120; } else if (a[i + o] < -60) { a[i + o] += 120; a[i + o + 3] += 120; } } } rain.geometry.attributes.position.needsUpdate = true; }
  if (snow.visible) { snow.position.set(cp.x, cp.y - 30, cp.z); const a = snow.geometry.attributes.position.array; for (let i = 0; i < a.length; i += 3) { a[i + 1] -= dt * (1.1 + (i % 7) * 0.08); a[i] += wx + Math.sin(envT * 1.3 + i) * dt * 0.3; a[i + 2] += wz; if (a[i + 1] < 0) a[i + 1] += 60; if (a[i] > 45) a[i] -= 90; else if (a[i] < -45) a[i] += 90; if (a[i + 2] > 45) a[i + 2] -= 90; else if (a[i + 2] < -45) a[i + 2] += 90; } snow.geometry.attributes.position.needsUpdate = true; }
  // lightning
  const flash = stormTick(dt, STORM.active && !under, g => AUDIO.thunder(g));
  sky.material.uniforms.uFlash.value = flash * 0.5; cu.uFlash.value = flash * 0.6;
  sunLight.position.copy(v.pos).addScaledVector(APP.sunAlt > -1 ? APP.sunDir : APP.moonDir, 500); sunLight.target.position.copy(v.pos);
  // the real sun in front of the lens: glare only if not hidden by terrain, buildings or cloud
  if (POST.enabled) {
    if (APP.frameN % 2 === 0) { const s = SET.effects && !under ? sunVisibility(camera, APP.sunDir, clamp((W.cloud ?? 0) / 100, 0, 1) * (W.kind === 'cumulus' ? 0.75 : 1), (x, z) => DEM.heightAt(x, z), (x, z) => VEC.roofAt(x, z)) : { vis: 0, x: 0.5, y: 0.5 }; APP.sunVis = lerp(APP.sunVis, s.vis, 0.35); APP.sunXY = [s.x, s.y]; }
    POST.set({ uSunVis: APP.sunVis, uSun: APP.sunXY || [0.5, 0.5], uUnder: under, uTime: envT, uFlash: flash * 0.35 });
  }
  BUOYS.update(dt, envT);
  if (run) { updateMission(); updateAeroMission(dt); }
  if (globalThis.AERO_CREW) updateCrew(dt, run);
  if (APP.frameN % 4 === 0) updateHUD();
  AUDIO.update(v, !run);
  $('#loading').hidden = TERRAIN.ready || !!APP.google;
  if (!TERRAIN.ready && envT > 12 && TERRAIN.imgOK === 0 && (TERRAIN.imgFails > 0 || DEM.fails > 0 || envT > 30)) $('#loadMsg').textContent = t('load.blocked');
  POST.render(renderer, scene, camera);
  if (APP.capture) {
    const shot = renderer.domElement.toDataURL('image/jpeg', 0.85), it = APP.capture; APP.capture = false;
    if (it === 'album' || it === 'mission') { MIS.album.push(shot); showCompare({ title: t('btn.photo') + ' · ' + placeName(APP.place) }, shot); toast(t('toast.photoSaved'), 1500); } else showCompare(it, shot);
  }
  // automatic quality: step down when the device cannot keep up
  if (SET.quality === 'auto' && TERRAIN.ready && run) { FPSWIN.t += dtr; FPSWIN.n++; if (FPSWIN.t > 5) { const f = FPSWIN.n / FPSWIN.t; FPSWIN.t = FPSWIN.n = 0; FPSWIN.bad = f < 22 ? (FPSWIN.bad || 0) + 1 : 0; if (FPSWIN.bad >= 2 && APP.quality !== 'low') { FPSWIN.bad = 0; const q = APP.quality === 'high' ? 'mid' : 'low'; setQuality(q); toast(t('toast.quality', { q: t('quality.' + q) }), 3000); } } }
}

/* ---------- boot ---------- */
document.addEventListener('visibilitychange', () => { if (document.hidden && APP.started && !APP.paused) { APP.paused = true; updateDock(); } });
addEventListener('hashchange', async () => {
  const [hid, hv, h3] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (hid === 'crew') { if (hv && globalThis.AERO_CREW && hv !== CREW.id) startCrew(hv); return; }
  if (hid === 'mission' && hv) { await loadMissions(); const d = MISSIONS.defs.find(x => x.id === hv); if (d) startAeroAt(d, MTIER[h3] ? h3 : 'beginner'); return; }
  const p = PLACE_BY_ID.get(hid); if (!p) return; const kind = VEHICLE_KINDS.includes(hv) ? hv : suggestVehicle(p);
  if (p !== APP.place) loadPlace(p, kind); else if (kind !== APP.kind && APP.state === 'sim') { const msg = await spawn(kind); if (msg) toast(t(msg)); APP.started = false; APP.paused = true; $('#startOverlay').hidden = false; updateDock(); restartMission(); }
});
async function boot() {
  await setLang(pickLang());
  buildDock(); buildDrawer(); bindLook($('#view'));
  $('#hudPlace').onclick = () => openSheet('places'); $('#hudEnv').onclick = () => toggleDrawer(true);
  $('#startBtn').onclick = () => togglePause();
  $('#startHelp').onclick = () => toggleHelp(true);
  APP.quality = SET.quality === 'auto' ? autoQuality() : SET.quality;
  $('#attrib').textContent = t('attr.line');
  requestAnimationFrame(frame);
  const [hid, hv, h3] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (hid === 'crew' && hv && globalThis.AERO_CREW) return startCrew(hv);
  if (hid === 'mission' && hv) { await loadMissions(); const d = MISSIONS.defs.find(x => x.id === hv); if (d) return startAeroAt(d, MTIER[h3] ? h3 : 'beginner'); }
  const p = PLACE_BY_ID.get(hid) || PLACE_BY_ID.get(new URLSearchParams(location.search).get('place')) || PLACE_BY_ID.get(DEFAULT_PLACE) || PLACES[0];
  const kind = VEHICLE_KINDS.includes(hv) ? hv : hid && PLACE_BY_ID.get(hid) ? suggestVehicle(p) : 'drone';
  await loadPlace(p, kind);
  if (globalThis.AERO_PWA && 'serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
}

/* ======================= AI flight tutor: answers apprentice questions with the live flight context ======================= */
/* Engines: on-device (Qwen2.5 0.5B multilingual / SmolLM2 135M via transformers.js in a Web Worker, downloaded only on request),
   Claude / OpenAI / Gemini with the user's own API key (kept only in this browser), or the built-in guide without AI. */
const AI_MODELS = {
  qwen: { repo: 'onnx-community/Qwen2.5-0.5B-Instruct', revision: '22942cb7d7ba4cc81bb4673549ca4d4614469b5e', dtype: 'q8', bytes: 512096557 },
  smol: { repo: 'onnx-community/SmolLM2-135M-Instruct-ONNX', revision: 'b8a5c0f183b78c55955a5364f610c36668b5e681', dtype: 'q8', bytes: 135658354 },
};
const CLOUD = {
  claude: { model: 'claude-haiku-5-5', url: 'https://console.anthropic.com/settings/keys' },
  openai: { model: 'gpt-6-luna', url: 'https://platform.openai.com/api-keys' },
  gemini: { model: 'gemini-3.8-flash', url: 'https://aistudio.google.com/apikey' },
};
const TUT_KEY = globalThis.AERO_CREW ? 'rcl3:tutor' : 'aero6:tutor';
const TUT = { provider: LS.get(TUT_KEY) || (globalThis.AERO_CREW ? 'crew' : 'faq'), history: [], worker: null, ready: null, busy: false, loadedModel: null };
const tutKey = p => LS.get('aero6:key:' + p) || '';
const tutModel = p => LS.get('aero6:model:' + p) || CLOUD[p]?.model || '';
/* the worker source is inlined so the same code runs from the package (local vendor files) and from the single-file build (CDN) */
const WORKER_SRC = `let gen = null, rt = null;
self.onmessage = async ({ data }) => {
  const { type, id } = data, send = (t, v = {}) => self.postMessage({ type: t, id, ...v });
  try {
    if (type === 'load') {
      rt ||= await import(data.lib); const { env, pipeline } = rt;
      env.allowLocalModels = false; env.useBrowserCache = true; env.backends.onnx.wasm.numThreads = 1; env.backends.onnx.wasm.proxy = false; env.backends.onnx.wasm.wasmPaths = data.wasm;
      if (data.base) { env.remoteHost = data.base.endsWith('/') ? data.base : data.base + '/'; env.remotePathTemplate = '{model}/'; } else { env.remoteHost = 'https://huggingface.co/'; env.remotePathTemplate = '{model}/resolve/{revision}/'; }
      gen = await pipeline('text-generation', data.model.repo, { device: 'wasm', dtype: data.model.dtype, revision: data.model.revision, progress_callback: p => send('progress', { p: Number(p.progress) || 0, file: p.file || '', loaded: Number(p.loaded) || 0, total: Number(p.total) || 0 }) });
      send('ready');
    } else if (type === 'generate') {
      const st = new rt.TextStreamer(gen.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: text => send('token', { text }) });
      const out = await gen(data.messages, { max_new_tokens: 220, do_sample: false, repetition_penalty: 1.08, streamer: st });
      const g = out?.[0]?.generated_text; send('result', { text: Array.isArray(g) ? g.at(-1)?.content || '' : String(g || '') });
    }
  } catch (e) { send('error', { message: String(e?.message || e).slice(0, 300) }); }
};`;
function aiPaths() {
  const pkg = globalThis.AERO_VENDOR_AI;   // set by the package build: local vendor/ai folder
  return pkg ? { lib: new URL(pkg + 'transformers-3.8.1.min.js', location.href).href, wasm: new URL(pkg, location.href).href }
    : { lib: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js', wasm: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/' };
}
let REQ = 0;
function workerCall(type, payload, onEvent) {
  return new Promise((res, rej) => {
    const id = ++REQ, w = TUT.worker;
    const h = ({ data }) => { if (data.id !== id) return; onEvent?.(data); if (data.type === 'ready' || data.type === 'result') { w.removeEventListener('message', h); res(data); } else if (data.type === 'error') { w.removeEventListener('message', h); rej(new Error(data.message)); } };
    w.addEventListener('message', h); w.postMessage({ type, id, ...payload });
  });
}
async function loadLocalModel(which, onProgress) {
  if (TUT.loadedModel === which && TUT.ready) return TUT.ready;
  if (!isSecureContext) throw new Error('HTTPS required');
  TUT.worker?.terminate(); TUT.worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })), { type: 'module' }); TUT.loadedModel = which;
  const base = globalThis.AERO_CONFIG?.aiModelBase || '', files = {};
  TUT.ready = workerCall('load', { model: AI_MODELS[which], base, ...aiPaths() }, d => {
    if (d.type !== 'progress' || !d.file) return; files[d.file] = d; const tot = Object.values(files).reduce((a, f) => a + (f.total || 0), 0), got = Object.values(files).reduce((a, f) => a + (f.loaded || 0), 0);
    onProgress?.(tot ? Math.min(99, Math.round(got / Math.max(tot, AI_MODELS[which].bytes * 0.98) * 100)) : 0);
  }).catch(e => { TUT.ready = null; TUT.loadedModel = null; throw e; });
  return TUT.ready;
}
/* everything the tutor knows about this moment of the flight */
function flightContext() {
  const p = APP.place, v = APP.veh, W = APP.W || WX; if (!p || !v) return 'No flight loaded.';
  const [lat, lon] = toLatLon(v.pos.x, v.pos.z), lines = [
    `Destination: ${p.en || p.zh} (${p.zh}); ${placeRegion(p)}; category ${p.cat}; lat ${lat.toFixed(4)}, lon ${lon.toFixed(4)}.`,
    p.desc ? `Catalogue note (Chinese): ${p.desc.slice(0, 220)}` : '',
    `Local time ${APP.sun.date} ${hhmm(APP.sun.min)}; sun altitude ${Math.round(APP.sunAlt)}°, azimuth ${Math.round(APP.sunAz)}°; moon ${Math.round(APP.moonFrac * 100)}% lit at ${Math.round(APP.moonAlt)}°; season ${APP.seasonName}.`,
    `Weather (${SET.wxMode === 'live' ? 'live Open-Meteo' : 'preset ' + SET.wxMode}): ${W.temp != null ? Math.round(W.temp) + ' °C, ' : ''}wind ${(W.wind ?? 0).toFixed(1)} m/s from ${Math.round(W.windDir ?? 0)}°, gusts ${(W.gust ?? 0).toFixed(1)} m/s, cloud ${Math.round(W.cloud ?? 0)}%, visibility ${Math.round((W.vis ?? 0) / 100) / 10} km, precipitation ${(W.precip ?? 0).toFixed(1)} mm/h${W.storm ? ', thunderstorm' : ''}${W.snow ? ', snow' : ''}; waves ${(W.hs ?? 0).toFixed(1)} m.`,
    `Vehicle: ${v.kind}${v.kind === 'drone' ? ` mode ${v.mode}, battery ${Math.round(v.battery * 100)}%, height above ground ${v.agl.toFixed(1)} m, ${v.landed ? 'landed' : 'flying'}` : ''}${v.kind === 'plane' ? `, airspeed ${Math.round(v.airspeed * 3.6)} km/h, height ${Math.round(v.agl)} m` : ''}${v.kind === 'rov' ? `, depth ${v.depth.toFixed(1)} m` : ''}; warnings: ${v.warn ? t(v.warn, { ...(v.warnP || {}), why: v.why ? t(v.why) : '' }) : 'none'}.`,
    AM.active && AM.def ? `Mission: ${mtext(AM.def, 'name')} (${AM.tier}); step ${AM.idx + 1}/${AM.steps.length}: ${AM.steps[AM.idx] ? AM.steps[AM.idx].kind : 'done'}. Mission brief: ${mtext(AM.def, 'description')}` : MIS.kind !== 'free' ? `Mission: ${MIS.kind}.` : 'Free flight.',
    globalThis.AERO_CREW && CREW.type ? crewContext() : '',
    `Controls (Mode 2): left hand W/S climb-descend and A/D turn; right hand arrow keys forward/back and slide. F photo, G drop buoy, C where am I, B place story, V camera, Space pause, R restart.`,
  ];
  return lines.filter(Boolean).join('\n');
}
function systemPrompt() {
  const lang = LANG_NAME[I18N.lang] || 'English';
  return `You are the AERO flight tutor in a realistic drone, aircraft, boat, robot and underwater-drone simulator built on real terrain, satellite imagery, OpenStreetMap buildings and real weather. You coach apprentice pilots.
Answer in ${lang}. Be brief (at most 6 short sentences or bullets), concrete and safety-first, and use the flight context below. If something is not in the context and you are unsure, say so instead of guessing.
Real-world rules to mention when relevant: keep within 120 m (400 ft) above ground in Taiwan and most countries; keep visual line of sight; do not fly over crowds, airports or restricted zones; in Taiwan drones of 250 g or more must be registered with the Civil Aviation Administration and operators need the matching licence; check local rules elsewhere. Typical small drones cope with wind up to about 10.7 m/s; land with 20–30% battery left.
FLIGHT CONTEXT
${flightContext()}`;
}
/* built-in guide (no AI): rule-based answers from the same context */
function faqAnswer(q) {
  const W = APP.W || WX, v = APP.veh, s = q.toLowerCase(), wind = W.wind ?? 0, gust = W.gust ?? wind;
  const has = (...ws) => ws.some(w => s.includes(w));
  if (has('wind', '風', 'вет', 'vent', 'viento', 'wind', 'gió', 'ลม', 'angin', 'rüzgar', 'رياح', 'باد', 'רוח', 'वायु', 'हवा') || q === t('tut.s2'))
    return t(gust > 10.7 || wind > 8 ? 'tut.windHigh' : 'tut.windOk', { v: wind.toFixed(1), g: gust.toFixed(1) });
  if (has('take off', 'takeoff', 'land', '起飛', '降落', '起飞', '离陆', '着陸', '이륙', 'decol', 'despeg', 'start') || q === t('tut.s1')) return t('tut.faqTakeoff');
  if (has('mission', '任務', '任务', 'ミッション', '임무', 'misi') || q === t('tut.s4'))
    return AM.active && AM.steps[AM.idx] ? t('tut.faqMission', { step: t('mis.step.' + AM.steps[AM.idx].kind, { s: MTIER[AM.tier].dwell, m: MTIER[AM.tier].form }), n: AM.idx + 1, total: AM.steps.length }) : t('tut.faqNoMission');
  if (has('place', 'where', '這裡', '这里', '地點', '景點', 'ここ', '여기') || q === t('tut.s3')) { const p = APP.place; return `${placeName(p)} · ${placeLine(p)}. ${isZh() ? p.desc : ''} ${t('tut.faqStory')}`.trim(); }
  if (has('battery', '電量', '电量', '電池', 'バッテリー', '배터리')) return t('tut.faqBattery', { b: v?.battery != null ? Math.round(v.battery * 100) : '—' });
  if (has('law', 'rule', 'legal', '法規', '規定', '法规', '登記', '註冊', 'licen', '執照', '120')) return t('tut.faqRules');
  return t('tut.faqDefault');
}
async function askCloud(provider, messages) {
  const key = tutKey(provider), model = tutModel(provider), sys = systemPrompt(); if (!key) throw new Error(t('tut.needKey'));
  if (provider === 'claude') {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model, max_tokens: 700, system: sys, messages }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'HTTP ' + r.status); return (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  }
  if (provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify({ model, max_completion_tokens: 1500, messages: [{ role: 'system', content: sys }, ...messages] }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'HTTP ' + r.status); return j.choices?.[0]?.message?.content || '';
  }
  if (provider === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: 1500 } }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'HTTP ' + r.status); return (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  }
  throw new Error('unknown provider');
}
async function tutorAsk(q, out) {
  if (!q.trim() || TUT.busy) return; TUT.busy = true;
  const add = (role, text) => { const d = document.createElement('div'); d.className = 'msg ' + role; d.textContent = text; out.appendChild(d); out.scrollTop = out.scrollHeight; return d; };
  add('user', q); const ans = add('bot', t('tut.thinking'));
  const msgs = [...TUT.history.slice(-6), { role: 'user', content: q }];
  try {
    let text = '';
    if (TUT.provider === 'faq') text = faqAnswer(q);
    else if (TUT.provider === 'crew') {
      try { text = await crewAsk(q, partial => { ans.textContent = partial; out.scrollTop = out.scrollHeight; }); }
      catch (e) { text = t('crew.coachFail') + '\n\n' + faqAnswer(q); }
    }
    else if (TUT.provider === 'qwen' || TUT.provider === 'smol') {
      if (TUT.loadedModel !== TUT.provider || !TUT.ready) throw new Error(t('tut.notLoaded'));
      await TUT.ready; ans.textContent = '';
      const r = await workerCall('generate', { messages: [{ role: 'system', content: systemPrompt() }, ...msgs] }, d => { if (d.type === 'token') { ans.textContent += d.text; out.scrollTop = out.scrollHeight; } });
      text = r.text || ans.textContent;
    } else text = await askCloud(TUT.provider, msgs);
    ans.textContent = text.trim() || '…'; TUT.history.push({ role: 'user', content: q }, { role: 'assistant', content: ans.textContent });
  } catch (e) { ans.textContent = t('tut.error', { msg: e.message }); ans.classList.add('err'); }
  finally { TUT.busy = false; out.scrollTop = out.scrollHeight; }
}
function renderTutor(s) {
  const pv = TUT.provider, cloud = !!CLOUD[pv], local = pv === 'qwen' || pv === 'smol', crew = pv === 'crew';
  s.innerHTML = `<header><h3>${esc(t('tut.title'))}</h3><button class="x" data-close aria-label="${esc(t('btn.close'))}">×</button></header>
    <label class="row"><span>${esc(t('tut.provider'))}</span><select id="tProv">${[...(globalThis.AERO_CREW ? [['crew', 'crew.ai']] : []), ['faq', 'tut.faq'], ['qwen', 'tut.localQwen'], ['smol', 'tut.localSmol'], ['claude', 'tut.claude'], ['openai', 'tut.openai'], ['gemini', 'tut.gemini']].map(([k, l]) => opt(k, t(l), pv)).join('')}</select></label>
    ${cloud ? `<div class="row"><input id="tKey" type="password" autocomplete="off" spellcheck="false" placeholder="${esc(t('tut.key'))}" value="${esc(tutKey(pv))}"><input id="tModel" type="text" spellcheck="false" placeholder="${esc(t('tut.model'))}" value="${esc(tutModel(pv))}"><a class="btn sm" href="${CLOUD[pv].url}" target="_blank" rel="noopener">${esc(t('tut.getKey'))}</a></div>` : ''}
    ${local || (crew && CREW.embedded) ? `<div class="row"><button class="btn sm" id="tLoad">${esc((crew ? CREW_COACH.state === 'ready' : TUT.loadedModel === pv) ? t('tut.ready') : t('tut.load'))}</button><span id="tProg" class="mut"></span></div>` : ''}
    <p class="mut small" id="tNote">${esc(t(crew ? 'crew.coachLocalNote' : cloud || local ? 'tut.privacy' : 'tut.faqNote'))}</p>
    <div id="tOut" class="chat"></div>
    <div class="chips">${['s1', 's2', 's3', 's4'].map(k => `<button class="chip sugg" data-s="${k}">${esc(t('tut.' + k))}</button>`).join('')}</div>
    <form id="tForm" class="row"><input id="tQ" type="text" autocomplete="off" placeholder="${esc(t('tut.placeholder'))}"><button class="btn primary" type="submit">${esc(t('tut.send'))}</button></form>
    <p class="mut small">${esc(t('tut.disclaimer'))}</p>`;
  const out = $('#tOut'); for (const m of TUT.history.slice(-8)) { const d = document.createElement('div'); d.className = 'msg ' + (m.role === 'user' ? 'user' : 'bot'); d.textContent = m.content; out.appendChild(d); }
  s.onclick = e => { if (e.target.closest('[data-close]')) return closeSheet(); const b = e.target.closest('.sugg'); if (b) tutorAsk(t('tut.' + b.dataset.s), out); };
  $('#tProv').onchange = e => { TUT.provider = e.target.value; LS.set(TUT_KEY, TUT.provider); renderTutor(s); };
  $('#tKey')?.addEventListener('change', e => LS.set('aero6:key:' + pv, e.target.value.trim()));
  $('#tModel')?.addEventListener('change', e => LS.set('aero6:model:' + pv, e.target.value.trim()));
  $('#tLoad')?.addEventListener('click', async e => {
    const btn = e.target; btn.disabled = true;
    try { await (crew ? crewLoadModel(p => { $('#tProg').textContent = t('tut.loading', { p }); }) : loadLocalModel(pv, p => { $('#tProg').textContent = t('tut.loading', { p }); })); $('#tProg').textContent = t('tut.ready'); btn.textContent = t('tut.ready'); }
    catch (err) { $('#tProg').textContent = t('tut.error', { msg: err.message }); btn.disabled = false; }
  });
  $('#tForm').onsubmit = e => { e.preventDefault(); const q = $('#tQ').value; $('#tQ').value = ''; tutorAsk(q, out); };
}

window.__AERO = { APP, SET, TERRAIN, VEC, DEM, ENV, MIS, AM, WX, WAVES, GEO, POST, TREES, BUOYS, I18N, MISSIONS, TUT, loadPlace, spawn, setTimePreset, applyWeather, startAeroAt, t, camSmooth, refineSunTime, updateAeroMission, aeroMissionAction, updateCamera, readInput, loadMissions, CREW, startCrew, crewScore, amP };
boot();
