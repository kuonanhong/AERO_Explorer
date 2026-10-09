import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWeatherHandler} from './weather-worker.mjs';

const env = {ALLOWED_ORIGINS: 'https://example.com,https://user.github.io'};
const original = {current: {time: '2026-10-07T12:00', temperature_2m: 27.5,
  cloud_cover: 44, wind_speed_10m: 3.4, wind_direction_10m: 150},
  current_units: {wind_speed_10m: 'm/s'}};
function request(query = 'lat=22.64954&lon=120.35363', origin = 'https://example.com', method = 'GET') {
  return new Request('https://weather.example.com/weather?' + query,
    {method, headers: origin ? {Origin: origin} : {}});
}
function mockCache(now = Date.now) {
  const entries = new Map();
  return {
    entries,
    async match(key) {
      const entry = entries.get(key.url);
      if (!entry || entry.expires <= now()) return undefined;
      return entry.response.clone();
    },
    async put(key, response) {
      const ttl = Number(response.headers.get('Cache-Control').match(/max-age=(\d+)/)[1]);
      entries.set(key.url, {response: response.clone(), expires: now() + ttl * 1000});
    }
  };
}
function upstream(data = original) { return new Response(JSON.stringify(data)); }

test('same grid shares a cache entry, preserves m/s, and stores no CORS or secrets', async () => {
  let calls = 0, fetchedUrl;
  const cache = mockCache();
  const handler = createWeatherHandler({cache, fetchFn: async url => { calls++; fetchedUrl = url; return upstream(); }});
  const first = await handler.fetch(request(), env);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('Access-Control-Allow-Origin'), 'https://example.com');
  const body = await first.json();
  assert.equal(body.latitude, 22.65);
  assert.equal(body.longitude, 120.35);
  assert.equal(body.current.wind_speed_10m, 3.4);
  assert.equal(body.current_units.wind_speed_10m, 'm/s');
  assert.equal(fetchedUrl.searchParams.get('wind_speed_unit'), 'ms');
  assert.equal(fetchedUrl.searchParams.get('latitude'), '22.65');
  assert.equal(fetchedUrl.searchParams.get('timezone'), 'UTC');
  const second = await handler.fetch(request('lat=22.65111&lon=120.35444', 'https://user.github.io'), env);
  assert.equal(calls, 1);
  assert.equal(second.headers.get('Access-Control-Allow-Origin'), 'https://user.github.io');
  assert.equal(second.headers.get('X-AERO-Cache'), 'LOCAL');
  for (const entry of cache.entries.values()) assert.equal(entry.response.headers.get('Access-Control-Allow-Origin'), null);
  const otherIsolate = createWeatherHandler({cache, fetchFn: async () => { throw new Error('Must not fetch'); }});
  assert.equal((await otherIsolate.fetch(request(), env)).headers.get('X-AERO-Cache'), 'HIT');
});

test('fifty concurrent requests to a cold grid make one upstream call in the same isolate', async () => {
  let calls = 0, release;
  const blocker = new Promise(resolve => { release = resolve; });
  const handler = createWeatherHandler({cache: mockCache(), fetchFn: async () => { calls++; await blocker; return upstream(); }});
  const pending = Array.from({length: 50}, () => handler.fetch(request(), env));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  release();
  const replies = await Promise.all(pending);
  assert.ok(replies.every(x => x.status === 200));
  assert.equal(calls, 1);
});

test('invalid coordinates, unwanted origins, parameters and methods never fetch upstream', async () => {
  let calls = 0;
  const handler = createWeatherHandler({cache: mockCache(), fetchFn: async () => { calls++; return upstream(); }});
  for (const query of ['', 'lat=&lon=2', 'lat=91&lon=2', 'lat=2&lon=181',
    'lat=22&lat=23&lon=120', 'lat=NaN&lon=120', 'lat=22&lon=120&url=https://evil.example']) {
    assert.equal((await handler.fetch(request(query), env)).status, 400);
  }
  assert.equal((await handler.fetch(request(undefined, 'https://evil.example'), env)).status, 403);
  assert.equal((await handler.fetch(request(undefined, undefined, 'POST'), env)).status, 405);
  assert.equal(calls, 0);
});

test('preflight uses exact configured origins and no wildcard', async () => {
  const handler = createWeatherHandler({cache: mockCache()});
  const preflight = new Request('https://weather.example.com/weather', {method: 'OPTIONS',
    headers: {Origin: 'https://example.com', 'Access-Control-Request-Method': 'GET'}});
  const response = await handler.fetch(preflight, env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://example.com');
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
  assert.equal((await handler.fetch(request(), {})).status, 503);
});

test('configured bounds and fixed upstream prevent out-of-area use and URL proxying', async () => {
  let calls = 0;
  const handler = createWeatherHandler({cache: mockCache(), fetchFn: async () => { calls++; return upstream(); }});
  assert.equal((await handler.fetch(request('lat=45&lon=120'), {...env, ALLOWED_BOUNDS: '21,26,119,123'})).status, 400);
  for (const base of ['http://api.open-meteo.com', 'https://evil.example', 'https://api.open-meteo.com/path',
    'https://api.open-meteo.com?url=x', 'https://user:pass@api.open-meteo.com']) {
    assert.equal((await handler.fetch(request(), {...env, UPSTREAM_BASE: base})).status, 503);
  }
  assert.equal(calls, 0);
});

test('commercial endpoint accepts server secret without returning it', async () => {
  let called;
  const handler = createWeatherHandler({cache: mockCache(), fetchFn: async url => { called = url; return upstream(); }});
  const commercial = {...env, UPSTREAM_BASE: 'https://customer-api.open-meteo.com', OPENMETEO_API_KEY: 'TEST_SERVER_SECRET'};
  const response = await handler.fetch(request(), commercial);
  assert.equal(called.hostname, 'customer-api.open-meteo.com');
  assert.equal(called.searchParams.get('apikey'), 'TEST_SERVER_SECRET');
  assert.ok(!(await response.text()).includes('TEST_SERVER_SECRET'));
  assert.equal((await handler.fetch(request(), {...env, UPSTREAM_BASE: commercial.UPSTREAM_BASE})).status, 503);
  assert.equal((await handler.fetch(request(), {...env, OPENMETEO_API_KEY: 'WRONG_ENDPOINT'})).status, 503);
});

test('fifteen-minute freshness expires; upstream failure serves clearly marked one-hour stale copy', async () => {
  let clock = Date.parse('2026-10-07T12:00:00Z'), calls = 0, fail = false;
  const now = () => clock;
  const handler = createWeatherHandler({cache: mockCache(now), now,
    fetchFn: async () => { calls++; return fail ? new Response('limited', {status: 429}) : upstream(); }});
  assert.equal((await handler.fetch(request(), env)).status, 200);
  clock += 901_000;
  fail = true;
  const response = await handler.fetch(request(), env);
  assert.equal(response.headers.get('X-AERO-Cache'), 'STALE');
  assert.equal((await response.json()).stale, true);
  assert.equal(calls, 2);
  await handler.fetch(request(), env);
  assert.equal(calls, 2); // Thirty-second failure backoff.
  clock += 2_700_000;
  assert.equal((await handler.fetch(request(), env)).status, 503);
});

test('wrong units and absent numeric fields are rejected and briefly backed off', async () => {
  let calls = 0;
  const handler = createWeatherHandler({cache: mockCache(), fetchFn: async () => {
    calls++; return upstream({...original, current_units: {wind_speed_10m: 'km/h'}});
  }});
  const response = await handler.fetch(request(), env);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Retry-After'), '30');
  await handler.fetch(request(), env);
  assert.equal(calls, 1);
});

test('timeout aborts upstream request and returns a bounded generic error', async () => {
  let aborted = false;
  const handler = createWeatherHandler({cache: mockCache(), timeoutMs: 5,
    fetchFn: (_, options) => new Promise((_, reject) => options.signal.addEventListener('abort', () => {
      aborted = true; reject(new Error('TEST_SECRET_OR_INTERNAL_URL'));
    }, {once: true}))});
  const response = await handler.fetch(request(), env);
  assert.equal(aborted, true);
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('TEST_SECRET'));
});

test('parallel distinct-grid misses are bounded; cache failures still reuse in-isolate result', async () => {
  let calls = 0, release;
  const blocker = new Promise(resolve => { release = resolve; });
  const handler = createWeatherHandler({cache: mockCache(), fetchFn: async () => { calls++; await blocker; return upstream(); }});
  const pending = [1, 2, 3, 4].map(n => handler.fetch(request(`lat=${n}&lon=120`), env));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await handler.fetch(request('lat=5&lon=120'), env)).status, 503);
  assert.equal(calls, 4);
  release();
  await Promise.all(pending);
  let fallbackCalls = 0;
  const failingCache = {async match() {throw new Error('cache down');}, async put() {throw new Error('cache down');}};
  const fallback = createWeatherHandler({cache: failingCache, fetchFn: async () => {fallbackCalls++; return upstream();}});
  assert.equal((await fallback.fetch(request(), env)).status, 200);
  await fallback.fetch(request(), env);
  assert.equal(fallbackCalls, 1);
});
