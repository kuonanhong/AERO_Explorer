// AERO Explorer: browser-only navigation helpers. No player API key is required.
// Wikipedia extracts are CC BY-SA: retain the article/source and license links in UI.
export const SUPPORTED_LOCALES = Object.freeze([
  'zh-Hant', 'zh-Hans', 'en', 'ja', 'ko', 'ar', 'ms', 'th', 'vi', 'id',
  'fil', 'de', 'pl', 'cs', 'pt', 'fi', 'sv', 'ru', 'fr', 'es', 'it', 'hi',
]);

const normalizeTag = value => String(value || '').trim().replaceAll('_', '-').toLowerCase();

export function detectLocale(preferences = [], supportedLocales = SUPPORTED_LOCALES) {
  const available = [...supportedLocales].filter(value => typeof value === 'string' && value);
  const lookup = new Map(available.map(value => [normalizeTag(value), value]));
  for (const preference of typeof preferences === 'string' ? [preferences] : preferences || []) {
    const tag = normalizeTag(preference);
    if (!tag) continue;
    const primary = tag.split('-')[0];
    let candidates;
    if (primary === 'zh') {
      const traditional = /(?:^|-)hant(?:-|$)|(?:^|-)(?:tw|hk|mo)(?:-|$)/.test(tag);
      const simplified = /(?:^|-)hans(?:-|$)|(?:^|-)(?:cn|sg)(?:-|$)/.test(tag);
      // Script is a stronger preference than a region when both are specified.
      const script = tag.includes('-hant') ? 'zh-hant' : tag.includes('-hans') ? 'zh-hans'
        : traditional ? 'zh-hant' : simplified ? 'zh-hans' : 'zh-hant';
      candidates = [script, tag, script === 'zh-hant' ? 'zh-tw' : 'zh-cn', 'zh'];
    } else if (primary === 'tl' || primary === 'fil') {
      candidates = ['fil', tag, 'tl'];
    } else {
      candidates = [tag, primary];
    }
    for (const candidate of candidates) if (lookup.has(candidate)) return lookup.get(candidate);
    const languageMatch = available.find(value => normalizeTag(value).split('-')[0] === primary);
    if (languageMatch) return languageMatch;
  }
  return lookup.get('en') || available[0] || 'en';
}

function checkedPosition(position) {
  const lat = Number(position?.lat), lon = Number(position?.lon ?? position?.lng);
  if (position?.lat == null || (position?.lon == null && position?.lng == null)
      || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) {
    throw new RangeError('Coordinates must be finite latitude ±85 and longitude ±180.');
  }
  return {lat, lon};
}

export function parseCoordinate(query) {
  const text = String(query || '').trim();
  const match = text.match(/^\(?\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:[,，;；|]|\s)\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\)?$/);
  if (!match) return null;
  try { return checkedPosition({lat: Number(match[1]), lon: Number(match[2])}); }
  catch { return null; }
}

function googleLanguage(locale) {
  const tag = detectLocale([locale]);
  return tag === 'zh-Hant' ? 'zh-TW' : tag === 'zh-Hans' ? 'zh-CN' : tag;
}

function coordinateText(position) {
  const {lat, lon} = checkedPosition(position);
  return `${lat.toFixed(6)},${lon.toFixed(6)}`;
}

export function googleMapURL(position, locale = 'en') {
  const url = new URL('https://www.google.com/maps/search/');
  url.search = new URLSearchParams({api: '1', query: coordinateText(position), hl: googleLanguage(locale)});
  return url.href;
}

export function embedURL(position, locale = 'en', ownerEmbedKey = '') {
  const coordinates = coordinateText(position), language = googleLanguage(locale);
  if (String(ownerEmbedKey).trim()) {
    const url = new URL('https://www.google.com/maps/embed/v1/view');
    url.search = new URLSearchParams({key: String(ownerEmbedKey).trim(), center: coordinates,
      zoom: '16', maptype: 'satellite', language});
    return url.href;
  }
  // Google consumer-map compatibility endpoint, not the supported keyed Embed API.
  // Keep a documented googleMapURL link next to the iframe in case this stops working.
  const url = new URL('https://www.google.com/maps');
  url.search = new URLSearchParams({q: coordinates, z: '16', t: 'k', hl: language, output: 'embed'});
  return url.href;
}

function distanceMetres(a, b) {
  const radians = Math.PI / 180, dLat = (b.lat - a.lat) * radians, dLon = (b.lon - a.lon) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export class LiveLocationMap {
  constructor(iframe, {key = '', interval = 15000, distance = 50} = {}) {
    if (!iframe) throw new TypeError('A map iframe is required.');
    this.iframe = iframe;
    this.key = key;
    this.interval = Number.isFinite(interval) && interval >= 0 ? interval : 15000;
    this.distance = Number.isFinite(distance) && distance >= 0 ? distance : 50;
    this.last = null;
    this.lastAt = -Infinity;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  }

  update(position, locale = 'en', {force = false, now = performance.now()} = {}) {
    const current = checkedPosition(position);
    if (!Number.isFinite(now)) throw new TypeError('Map update time must be finite.');
    if (!force && this.last && (now - this.lastAt < this.interval || distanceMetres(this.last, current) < this.distance)) return false;
    this.iframe.src = embedURL(current, locale, this.key);
    this.last = current;
    this.lastAt = now;
    // A navigation was requested. This does not claim that the remote map rendered.
    return true;
  }
}

const wikiCache = new Map();
const CACHE_TTL = 5 * 60 * 1000, CACHE_LIMIT = 64;
const API_UA = 'AEROExplorer/4.0 (https://kuonanhong.github.io/SmartAction/)';

function wikiLanguage(locale) {
  const chosen = detectLocale([locale]);
  return chosen.startsWith('zh-') ? 'zh' : chosen === 'fil' ? 'tl' : chosen;
}

function abortError() {
  const error = new Error('Wikipedia request was cancelled.');
  error.name = 'AbortError';
  return error;
}

function clonePlaces(places) {
  return places.map(place => ({...place, name: {...place.name}, description: {...place.description}, sourceUrls: [...place.sourceUrls]}));
}

function getCached(key) {
  const entry = wikiCache.get(key);
  if (!entry) return null;
  if (entry.expires <= Date.now()) { wikiCache.delete(key); return null; }
  wikiCache.delete(key);
  wikiCache.set(key, entry);
  return clonePlaces(entry.places);
}

function cachePlaces(key, places) {
  wikiCache.delete(key);
  wikiCache.set(key, {expires: Date.now() + CACHE_TTL, places: clonePlaces(places)});
  while (wikiCache.size > CACHE_LIMIT) wikiCache.delete(wikiCache.keys().next().value);
}

function textExcerpt(value) {
  const paragraph = String(value || '').split(/\n\s*\n/)[0]
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return paragraph.length <= 500 ? paragraph : paragraph.slice(0, 499).replace(/[\ud800-\udbff]$/, '') + '…';
}

function normalizedPages(data, language, locale) {
  const pages = Array.isArray(data?.query?.pages) ? data.query.pages : Object.values(data?.query?.pages || {});
  return pages.sort((a, b) => (a.index ?? Infinity) - (b.index ?? Infinity)).flatMap(page => {
    if (page.missing || !page.title || !Number.isInteger(page.pageid) || page.pageid <= 0) return [];
    const coords = page.coordinates?.find(coordinate => 'primary' in coordinate && coordinate.primary !== false)
      || page.coordinates?.[0];
    if (!coords || (coords.globe && coords.globe !== 'earth')) return [];
    let position;
    try { position = checkedPosition(coords); } catch { return []; }
    const fallback = `https://${language}.wikipedia.org/?curid=${page.pageid}`;
    let source = fallback;
    try {
      const provided = new URL(page.canonicalurl || page.fullurl || fallback);
      if (provided.protocol === 'https:' && provided.hostname === `${language}.wikipedia.org`) source = provided.href;
    } catch { /* Use the stable, known-origin article ID link. */ }
    return [{id: `wiki-${language}-${page.pageid}`, ...position,
      name: {[locale]: String(page.title)}, description: {[locale]: textExcerpt(page.extract)},
      sourceUrls: [source], wiki: true, waterProfile: 'land'}];
  }).slice(0, 6);
}

async function queryWikipedia(parameters, locale, signal, cacheKey) {
  if (signal?.aborted) throw abortError();
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const language = wikiLanguage(locale), controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, {once: true});
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 8000);
  const endpoint = new URL(`https://${language}.wikipedia.org/w/api.php`);
  endpoint.search = new URLSearchParams({action: 'query', format: 'json', formatversion: '2', origin: '*',
    maxlag: '5', prop: 'coordinates|extracts|info', coprimary: 'primary', exintro: '1', explaintext: '1', exlimit: '6', exchars: '500',
    inprop: 'url', ...parameters});
  try {
    const response = await fetch(endpoint.href, {signal: controller.signal,
      headers: {'Api-User-Agent': API_UA}, credentials: 'omit'});
    if (!response.ok) {
      const error = new Error(`Wikipedia HTTP ${response.status}`);
      error.status = response.status;
      error.retryAfter = response.headers.get('Retry-After');
      throw error;
    }
    const data = await response.json();
    if (data.error) {
      const error = new Error(`Wikipedia: ${data.error.code || 'unknown error'}`);
      error.code = data.error.code;
      throw error;
    }
    if (signal?.aborted || controller.signal.aborted) throw abortError();
    const places = normalizedPages(data, language, locale);
    cachePlaces(cacheKey, places);
    return places;
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error('Wikipedia request exceeded 8 seconds.');
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    if (signal?.aborted) throw abortError();
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export function fetchWikiNearby(origin, locale = 'en', signal) {
  const position = checkedPosition(origin), language = detectLocale([locale]);
  const rounded = `${position.lat.toFixed(2)}|${position.lon.toFixed(2)}`;
  return queryWikipedia({generator: 'geosearch', ggscoord: `${position.lat}|${position.lon}`,
    ggsradius: '10000', ggslimit: '6', ggsnamespace: '0'}, language, signal, `near:${language}:${rounded}`);
}

export function searchWikiDestinations(query, locale = 'en', signal) {
  const search = String(query || '').trim().replace(/\s+/g, ' ').slice(0, 180);
  if (!search) return Promise.resolve([]);
  const language = detectLocale([locale]);
  return queryWikipedia({generator: 'search', gsrsearch: search, gsrlimit: '6', gsrnamespace: '0'},
    language, signal, `search:${language}:${search.toLocaleLowerCase('en')}`);
}
