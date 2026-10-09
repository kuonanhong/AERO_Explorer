// Read-only Wikipedia → Wikimedia Commons photo lookup, independently licensed per image.
// Display author, attribution (if any), sourcePage and license/licenseUrl beside every image.
// Missing metadata, local fair-use files, non-raster files and ambiguous licenses return null.
const API_AGENT = 'AEROExplorer/4.1 (https://kuonanhong.github.io/AERO_Explorer/)';
const META_KEYS = 'Artist|Attribution|Credit|LicenseShortName|LicenseUrl|Copyrighted|Restrictions|ObjectName';
const WIKI_HOST = /^[a-z][a-z0-9-]{0,19}\.wikipedia\.org$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function abortError() { const error = new Error('Photo lookup was cancelled.'); error.name = 'AbortError'; return error; }
function pages(data) { return Array.isArray(data?.query?.pages) ? data.query.pages : Object.values(data?.query?.pages || {}); }
function safeURL(value, allowedHost) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && allowedHost(url.hostname) ? url : null; }
  catch { return null; }
}

// Deliberately never evaluates metadata or assigns it to innerHTML. Consumers use textContent.
export function metadataText(value) {
  const raw = String(value ?? '');
  if (raw.length > 20000) return '';
  const text = raw.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_match, code) => {
      const number = /^x/i.test(code) ? parseInt(code.slice(1), 16) : Number(code);
      return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '';
    })
    .replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_match, entity) => ({amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' '})[entity])
    .replace(CONTROL, '').replace(/\s+/g, ' ').trim();
  return text.length <= 4000 ? text : '';
}

function articleReference(place) {
  const id = String(place?.id || '').match(/^wiki-([a-z][a-z0-9-]{0,19})-([1-9]\d{0,11})$/);
  if (id) return {host: `${id[1]}.wikipedia.org`, pageids: id[2], key: `${id[1]}.wikipedia.org:${id[2]}`};
  for (const candidate of place?.sourceUrls || []) {
    const url = safeURL(candidate, host => WIKI_HOST.test(host));
    if (!url) continue;
    const pageid = url.searchParams.get('curid');
    if (/^[1-9]\d{0,11}$/.test(pageid || '')) return {host: url.hostname, pageids: pageid, key: `${url.hostname}:${pageid}`};
    if (!url.pathname.startsWith('/wiki/')) continue;
    let title; try { title = decodeURIComponent(url.pathname.slice(6)).replaceAll('_', ' '); } catch { continue; }
    if (!title || title.length > 240 || /[|\u0000-\u001f]/.test(title) || /^(File|Image|Special|Category|User|Talk):/i.test(title)) continue;
    return {host: url.hostname, titles: title, key: `${url.hostname}:${title}`};
  }
  return null;
}

function acceptedLicense(metadata) {
  const value = key => metadataText(metadata?.[key]?.value);
  const label = value('LicenseShortName'), url = safeURL(value('LicenseUrl').replace(/^http:\/\//i, 'https://'),
    host => ['creativecommons.org', 'www.creativecommons.org', 'commons.wikimedia.org'].includes(host));
  if (value('Restrictions') || !label || !url) return null;
  const path = url.pathname.replace(/\/$/, '');
  const cc = label.match(/^CC BY(-SA)? (1\.0|2\.0|2\.5|3\.0|4\.0)(?: ([A-Z]{2}))?$/i);
  if (cc && /^(www\.)?creativecommons\.org$/.test(url.hostname)) {
    const kind = cc[1] ? 'by-sa' : 'by';
    const match = path.match(/^\/licenses\/(by|by-sa)\/(1\.0|2\.0|2\.5|3\.0|4\.0)(?:\/([a-z]{2}))?(?:\/deed\.[a-z-]+)?$/i);
    if (match && match[1].toLowerCase() === kind && match[2] === cc[2]
      && (!cc[3] || match[3]?.toLowerCase() === cc[3].toLowerCase())) {
      const country = match[3] ? `/${match[3].toLowerCase()}` : '';
      return {license: `CC BY${cc[1] ? '-SA' : ''} ${cc[2]}${match[3] ? ' ' + match[3].toUpperCase() : ''}`,
        licenseUrl: `https://creativecommons.org/licenses/${kind}/${cc[2]}${country}/`};
    }
  }
  if (/^CC0(?: 1\.0)?$/i.test(label) && /^(www\.)?creativecommons\.org$/.test(url.hostname)
    && /^\/publicdomain\/zero\/1\.0(?:\/deed\.[a-z-]+)?$/i.test(path)) {
    return {license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/'};
  }
  if (/^Public domain$/i.test(label) && /^false$/i.test(value('Copyrighted'))
    && ((url.hostname === 'commons.wikimedia.org' && path === '/wiki/Help:Public_domain')
      || (/^(www\.)?creativecommons\.org$/.test(url.hostname) && /^\/publicdomain\/mark\/1\.0(?:\/deed\.[a-z-]+)?$/i.test(path)))) {
    return {license: 'Public domain', licenseUrl: url.href};
  }
  return null;
}

export function commonsPhotoAsset(page, fileName, articleOriginal = '') {
  if (!page || page.missing || page.invalid) return null;
  const info = page.imageinfo?.[0];
  if (!info || !['image/jpeg', 'image/png', 'image/webp'].includes(info.mime)) return null;
  // A locally uploaded Wikipedia file can have the same name as a Commons file.
  // Require the article's original Commons URL to match the Commons metadata's original.
  if (articleOriginal) {
    const original = safeURL(info.url, host => host === 'upload.wikimedia.org');
    const expected = safeURL(articleOriginal, host => host === 'upload.wikimedia.org');
    if (!original || !expected || !expected.pathname.startsWith('/wikipedia/commons/')) return null;
    try { if (decodeURIComponent(original.pathname) !== decodeURIComponent(expected.pathname)) return null; }
    catch { return null; }
  }
  const metadata = info.extmetadata || {}, license = acceptedLicense(metadata);
  const author = metadataText(metadata.Artist?.value);
  if (!license || !author) return null;
  const thumbnail = info.thumburl || (info.size <= 700000 && info.width <= 1600 && info.height <= 1600 ? info.url : '');
  const url = safeURL(thumbnail, host => host === 'upload.wikimedia.org' || host === 'thumb.wikimedia.org');
  if (!url || !url.pathname.startsWith('/wikipedia/commons/') || !/\.(?:jpg|jpeg|png|webp)$/i.test(url.pathname)) return null;
  if (url.hostname === 'thumb.wikimedia.org' && !url.pathname.startsWith('/wikipedia/commons/thumb/')) return null;
  const source = safeURL(info.descriptionurl, host => host === 'commons.wikimedia.org');
  if (!source || !source.pathname.startsWith('/wiki/File:')) return null;
  const title = metadataText(metadata.ObjectName?.value) || metadataText(fileName);
  return Object.freeze({url: url.href, title, author, ...license, sourcePage: source.href,
    attribution: metadataText(metadata.Attribution?.value), credit: metadataText(metadata.Credit?.value),
    width: Number(info.thumbwidth || info.width) || 640, height: Number(info.thumbheight || info.height) || 400,
    is360: false, remote: true});
}

export function createPlacePhotoResolver({fetchImpl = (...args) => fetch(...args), concurrency = 2,
  timeout = 6000, cacheLimit = 64, cacheTTL = 30 * 60 * 1000} = {}) {
  concurrency = Math.max(1, Math.min(3, Math.floor(Number(concurrency)) || 2));
  timeout = Math.max(10, Math.min(6000, Number(timeout) || 6000));
  cacheLimit = Math.max(1, Math.min(128, Math.floor(Number(cacheLimit)) || 64));
  const cache = new Map(), queue = [], cooldown = new Map();
  let active = 0;
  function cached(key) {
    const item = cache.get(key);
    if (!item || item.until <= Date.now()) { cache.delete(key); return {hit: false}; }
    cache.delete(key); cache.set(key, item); return {hit: true, asset: item.asset};
  }
  function remember(key, asset) {
    cache.delete(key); cache.set(key, {asset, until: Date.now() + Math.max(1000, cacheTTL)});
    while (cache.size > cacheLimit) cache.delete(cache.keys().next().value);
  }
  async function query(host, parameters, signal) {
    if ((cooldown.get(host) || 0) > Date.now()) return null;
    const url = new URL(`https://${host}/w/api.php`);
    url.search = new URLSearchParams({action: 'query', format: 'json', formatversion: '2', origin: '*', maxlag: '5', ...parameters});
    const response = await fetchImpl(url.href, {signal, credentials: 'omit', headers: {'Api-User-Agent': API_AGENT}});
    if (!response.ok) {
      if (response.status === 429 || response.status === 503) {
        const header = response.headers?.get?.('Retry-After');
        const seconds = /^\d+$/.test(header || '') ? Number(header) : Math.max(0, (Date.parse(header) - Date.now()) / 1000);
        cooldown.set(host, Date.now() + Math.max(30, Number.isFinite(seconds) ? Math.min(86400, seconds) : 30) * 1000);
      }
      return null;
    }
    const data = await response.json();
    if (data.error) {
      if (['maxlag', 'ratelimited'].includes(data.error.code)) cooldown.set(host, Date.now() + 30000);
      return null;
    }
    return data;
  }
  async function lookup(reference, signal) {
    const data = await query(reference.host, {prop: 'pageimages', piprop: 'name|original', pilicense: 'free', pilimit: '1',
      redirects: '1', ...(reference.pageids ? {pageids: reference.pageids} : {titles: reference.titles})}, signal);
    if (signal.aborted) throw abortError();
    const page = pages(data).find(item => !item.missing && !item.invalid && item.pageimage);
    const fileName = String(page?.pageimage || '').replace(/^File:/i, '');
    if (!fileName || fileName.length > 240 || /[|\u0000-\u001f]/.test(fileName) || !/\.(?:jpe?g|png|webp)$/i.test(fileName)) return null;
    const original = safeURL(page?.original?.source, host => host === 'upload.wikimedia.org');
    if (!original || !original.pathname.startsWith('/wikipedia/commons/') || original.pathname.startsWith('/wikipedia/commons/thumb/')) return null;
    const file = await query('commons.wikimedia.org', {prop: 'imageinfo', titles: `File:${fileName}`,
      iiprop: 'url|size|mime|extmetadata', iiurlwidth: '640', iiextmetadatalanguage: 'en', iiextmetadatafilter: META_KEYS}, signal);
    if (signal.aborted) throw abortError();
    return commonsPhotoAsset(pages(file)[0], fileName, original.href);
  }
  function pump() {
    while (active < concurrency && queue.length) {
      const job = queue.shift(); job.signal?.removeEventListener('abort', job.cancelQueued);
      if (job.signal?.aborted) { job.reject(abortError()); continue; }
      const item = cached(job.reference.key);
      if (item.hit) { job.resolve(item.asset); continue; }
      active++;
      const controller = new AbortController();
      const abort = () => controller.abort(); job.signal?.addEventListener('abort', abort, {once: true});
      const timer = setTimeout(abort, timeout);
      lookup(job.reference, controller.signal).then(asset => {
        if (job.signal?.aborted) { job.reject(abortError()); return; }
        if (!controller.signal.aborted) remember(job.reference.key, asset);
        job.resolve(controller.signal.aborted ? null : asset);
      }).catch(error => {
        // Remote failure is an unavailable thumbnail, not a game failure. Caller abort stays observable.
        if (job.signal?.aborted) job.reject(abortError()); else job.resolve(null);
      }).finally(() => { clearTimeout(timer); job.signal?.removeEventListener('abort', abort); active--; pump(); });
    }
  }
  function resolve(place, {signal} = {}) {
    if (signal?.aborted) return Promise.reject(abortError());
    const reference = articleReference(place);
    if (!reference) return Promise.resolve(null);
    const item = cached(reference.key); if (item.hit) return Promise.resolve(item.asset);
    if (queue.length >= 24) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const job = {reference, signal, resolve, reject};
      job.cancelQueued = () => { const index = queue.indexOf(job); if (index >= 0) { queue.splice(index, 1); reject(abortError()); } };
      signal?.addEventListener('abort', job.cancelQueued, {once: true});
      queue.push(job); pump();
    });
  }
  async function resolveMany(places, {signal, onPhoto, limit = 8} = {}) {
    const selected = [...places].slice(0, Math.max(0, Math.min(8, Number(limit) || 0)));
    const results = await Promise.all(selected.map(async place => {
      const asset = await resolve(place, {signal});
      if (asset && !signal?.aborted) onPhoto?.(place, asset);
      return [place.id, asset];
    }));
    return new Map(results);
  }
  return Object.freeze({resolve, resolveMany, clearCache: () => cache.clear()});
}

const defaultResolver = createPlacePhotoResolver();
export const resolvePlacePhoto = (place, options) => defaultResolver.resolve(place, options);
export const resolvePlacePhotos = (places, options) => defaultResolver.resolveMany(places, options);
