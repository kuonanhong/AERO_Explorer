/* Optional AERO weather reference backend. Original source, MIT licence.
 * It never fetches Google data or logs coordinates/API keys. Cache API is per POP.
 */
const FRESH_TTL = 900;
const STALE_TTL = 3600;
const FAILURE_TTL = 30_000;
const MAX_PARALLEL = 4;
const MAX_MEMORY_KEYS = 64;
const CURRENT_FIELDS = 'temperature_2m,cloud_cover,wind_speed_10m,wind_direction_10m';
const PROVIDERS = new Set(['api.open-meteo.com', 'customer-api.open-meteo.com']);

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders}
  });
}
function error(message, status, retryAfter) {
  return json({error: message}, status, retryAfter ? {'Retry-After': String(retryAfter)} : {});
}
function cors(response, origin) {
  const headers = new Headers(response.headers);
  headers.set('Vary', 'Origin');
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Expose-Headers', 'X-AERO-Cache, Retry-After');
  return new Response(response.body, {status: response.status, headers});
}
function parseOrigins(value) {
  const origins = String(value || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!origins.length || origins.some(x => {
    try { const u = new URL(x); return !/^https?:$/.test(u.protocol) || u.origin !== x; }
    catch { return true; }
  })) throw new Error('Invalid origin configuration');
  return new Set(origins);
}
function coordinate(params, name, limit) {
  const values = params.getAll(name);
  if (values.length !== 1 || !/^[+-]?\d+(?:\.\d+)?$/.test(values[0])) throw new Error('Invalid coordinates');
  const n = Number(values[0]);
  if (!Number.isFinite(n) || Math.abs(n) > limit) throw new Error('Invalid coordinates');
  const rounded = Math.round(n * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}
function permittedBounds(env, lat, lon) {
  if (!env.ALLOWED_BOUNDS) return true;
  const bounds = String(env.ALLOWED_BOUNDS).split(',').map(x => Number(x.trim()));
  if (bounds.length !== 4 || bounds.some(x => !Number.isFinite(x)) ||
    bounds[0] < -90 || bounds[1] > 90 || bounds[2] < -180 || bounds[3] > 180 ||
    bounds[0] >= bounds[1] || bounds[2] >= bounds[3]) throw new Error('Invalid bounds configuration');
  return lat >= bounds[0] && lat <= bounds[1] && lon >= bounds[2] && lon <= bounds[3];
}
function provider(env, lat, lon) {
  const base = new URL(env.UPSTREAM_BASE || 'https://api.open-meteo.com');
  if (base.protocol !== 'https:' || !PROVIDERS.has(base.hostname) || base.port ||
    base.username || base.password || !['', '/'].includes(base.pathname) || base.search || base.hash)
    throw new Error('Invalid upstream configuration');
  const commercial = base.hostname === 'customer-api.open-meteo.com';
  if (commercial !== Boolean(env.OPENMETEO_API_KEY)) throw new Error('Invalid upstream key configuration');
  const url = new URL('/v1/forecast', base.origin);
  url.search = new URLSearchParams({latitude: String(lat), longitude: String(lon),
    current: CURRENT_FIELDS, wind_speed_unit: 'ms', timezone: 'UTC'}).toString();
  if (commercial) url.searchParams.set('apikey', env.OPENMETEO_API_KEY);
  return {url, host: base.hostname};
}
function validNumber(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function normalize(data, lat, lon, fetchedAt) {
  const c = data?.current;
  const u = data?.current_units;
  if (!c || typeof c.time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(c.time) ||
    !Number.isFinite(Date.parse(c.time + 'Z')) ||
    !validNumber(c.wind_speed_10m, 0, 150) || !validNumber(c.wind_direction_10m, 0, 360) ||
    !validNumber(c.cloud_cover, 0, 100) || !validNumber(c.temperature_2m, -100, 80) ||
    u?.wind_speed_10m !== 'm/s') throw new Error('Invalid upstream response');
  return {
    latitude: lat, longitude: lon, gridPrecisionDegrees: 0.01,
    current: {time: c.time, temperature_2m: c.temperature_2m,
      cloud_cover: c.cloud_cover, wind_speed_10m: c.wind_speed_10m,
      wind_direction_10m: c.wind_direction_10m},
    current_units: {time: 'iso8601', temperature_2m: '°C', cloud_cover: '%',
      wind_speed_10m: 'm/s', wind_direction_10m: '°'},
    fetchedAt: new Date(fetchedAt).toISOString(), stale: false,
    attribution: {name: 'Open-Meteo', url: 'https://open-meteo.com/',
      license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/'}
  };
}

/** Dependencies are injectable only for local tests, never by HTTP clients. */
export function createWeatherHandler({cache, fetchFn = globalThis.fetch, now = Date.now, timeoutMs = 5000} = {}) {
  const inFlight = new Map();
  const failures = new Map();
  const recent = new Map();
  function remember(map, key, value) {
    map.delete(key);
    map.set(key, value);
    while (map.size > MAX_MEMORY_KEYS) map.delete(map.keys().next().value);
  }
  async function match(edgeCache, key) {
    try { return await edgeCache.match(key); } catch { return undefined; }
  }
  async function save(edgeCache, key, payload, ttl) {
    try { await edgeCache.put(key, json(payload, 200, {'Cache-Control': `public, max-age=${ttl}`})); }
    catch { /* Recent in-isolate cache still prevents repeated upstream calls. */ }
  }
  function payloadResponse(payload, state) {
    // Browsers may cache for one minute; edge shared entries last fifteen minutes.
    return json(payload, 200, {'Cache-Control': 'private, max-age=60', 'X-AERO-Cache': state});
  }
  async function handle(request, env = {}) {
    const url = new URL(request.url);
    let allowed;
    try { allowed = parseOrigins(env.ALLOWED_ORIGINS); }
    catch { return error('Weather service is not configured', 503); }
    const origin = request.headers.get('Origin');
    if (origin && !allowed.has(origin)) return error('Origin is not allowed', 403);
    const respond = response => cors(response, origin);
    if (!['/', '/weather'].includes(url.pathname)) return respond(error('Not found', 404));
    if (request.method === 'OPTIONS') {
      if (request.headers.get('Access-Control-Request-Method') !== 'GET' ||
        request.headers.get('Access-Control-Request-Headers')) return respond(error('Preflight is not allowed', 403));
      return respond(new Response(null, {status: 204, headers: {
        'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '600'}}));
    }
    if (request.method !== 'GET') return respond(error('Use GET', 405));
    let lat, lon, upstream;
    try {
      if ([...url.searchParams.keys()].some(x => x !== 'lat' && x !== 'lon')) throw new Error('Invalid coordinates');
      lat = coordinate(url.searchParams, 'lat', 90);
      lon = coordinate(url.searchParams, 'lon', 180);
    } catch { return respond(error('Provide one valid lat and lon', 400)); }
    try {
      if (!permittedBounds(env, lat, lon)) return respond(error('Location is outside the configured service area', 400));
      upstream = provider(env, lat, lon);
    } catch { return respond(error('Weather service is not configured', 503)); }
    const edgeCache = cache || globalThis.caches?.default;
    if (!edgeCache) return respond(error('Shared weather cache is unavailable', 503, 30));
    const key = new Request(`${url.origin}/__aero_weather/v1/${upstream.host}/${lat.toFixed(2)}/${lon.toFixed(2)}`);
    const staleKey = new Request(key.url + '/stale');
    const id = key.url;
    const local = recent.get(id);
    if (local && now() - local.at < FRESH_TTL * 1000) return respond(payloadResponse(local.payload, 'LOCAL'));
    const hit = await match(edgeCache, key);
    if (hit) {
      // Stored entries only originate in this worker, without CORS or secrets.
      const payload = await hit.json();
      return respond(payloadResponse(payload, 'HIT'));
    }
    async function fallback() {
      let payload;
      if (local && now() - local.at < STALE_TTL * 1000) payload = local.payload;
      else {
        const staleHit = await match(edgeCache, staleKey);
        if (staleHit) payload = await staleHit.json();
      }
      return payload ? payloadResponse({...payload, stale: true}, 'STALE') : error('Weather temporarily unavailable', 503, 30);
    }
    if ((failures.get(id) || 0) > now()) return respond(await fallback());
    if (!inFlight.has(id)) {
      if (inFlight.size >= MAX_PARALLEL) return respond(await fallback());
      const task = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetchFn(upstream.url, {signal: controller.signal,
            redirect: 'error', headers: {'Accept': 'application/json'}});
          if (!response.ok) throw new Error('Upstream unavailable');
          const body = await response.text();
          if (body.length > 32_768) throw new Error('Upstream response too large');
          const payload = normalize(JSON.parse(body), lat, lon, now());
          remember(recent, id, {at: now(), payload});
          failures.delete(id);
          await Promise.all([save(edgeCache, key, payload, FRESH_TTL), save(edgeCache, staleKey, payload, STALE_TTL)]);
          return payload;
        } catch {
          remember(failures, id, now() + FAILURE_TTL);
          return null;
        } finally { clearTimeout(timer); }
      })();
      inFlight.set(id, task);
      task.finally(() => { if (inFlight.get(id) === task) inFlight.delete(id); });
    }
    const payload = await inFlight.get(id);
    return respond(payload ? payloadResponse(payload, 'MISS') : await fallback());
  }
  return {fetch: handle};
}

export default createWeatherHandler();
