import test from 'node:test';
import assert from 'node:assert/strict';
import {detectLocale, parseCoordinate, googleMapURL, embedURL, LiveLocationMap,
  fetchWikiNearby, searchWikiDestinations} from '../dist/navigation.js';

function response(pages, options = {}) {
  return {ok: true, status: 200, headers: new Headers(),
    json: async () => ({query: {pages}}), ...options};
}
function place(pageid = 1, overrides = {}) {
  return {pageid, index: pageid, title: 'Test place',
    coordinates: [{lat: 25.1024, lon: 121.5485, primary: true, globe: 'earth'}],
    extract: 'A short sourced description.\n\nThe second paragraph is omitted.',
    fullurl: 'https://en.wikipedia.org/wiki/Test_place', ...overrides};
}
async function mockedFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try { return await run(); } finally { globalThis.fetch = original; }
}

test('browser locale preferences preserve scripts, aliases and preference order', () => {
  for (const tag of ['zh-TW', 'zh-HK', 'zh-MO', 'zh_Hant_TW']) assert.equal(detectLocale([tag]), 'zh-Hant');
  for (const tag of ['zh-CN', 'zh-SG', 'zh-Hans']) assert.equal(detectLocale([tag]), 'zh-Hans');
  assert.equal(detectLocale(['zh-Hans-TW']), 'zh-Hans');
  assert.equal(detectLocale(['tl-PH']), 'fil');
  assert.equal(detectLocale(['fil-PH']), 'fil');
  assert.equal(detectLocale(['xx', 'pt-BR', 'en-US']), 'pt');
  assert.equal(detectLocale(['de-AT']), 'de');
  assert.equal(detectLocale([]), 'en');
  assert.equal(detectLocale(['xx'], ['ja', 'fr']), 'ja');
  assert.equal(detectLocale('fr-CA', ['en-US', 'fr-FR']), 'fr-FR');
});

test('coordinate parser accepts useful separators and rejects unsafe or out-of-range input', () => {
  for (const value of ['25.1,121.5', '25.1，121.5', '(25.1, 121.5)', '25.1 121.5', '+25.1; +121.5']) {
    assert.deepEqual(parseCoordinate(value), {lat: 25.1, lon: 121.5});
  }
  assert.deepEqual(parseCoordinate('-85,-180'), {lat: -85, lon: -180});
  assert.deepEqual(parseCoordinate('85,180'), {lat: 85, lon: 180});
  for (const value of ['', 'Yellowstone', 'NaN,1', 'Infinity,1', '85.001,0', '0,180.001', '1,2,3', '1e2,4', '25<script>,121']) {
    assert.equal(parseCoordinate(value), null, value);
  }
});

test('Google links remain official external URLs; embedding needs an owner key', () => {
  const p = {lat: 25.1024, lon: 121.5485};
  const map = new URL(googleMapURL(p, 'zh-Hant'));
  assert.equal(map.pathname, '/maps/search/');
  assert.equal(map.searchParams.get('api'), '1');
  assert.equal(map.searchParams.get('query'), '25.102400,121.548500');
  assert.equal(map.searchParams.get('hl'), 'zh-TW');
  assert.equal(embedURL(p, 'zh-Hans'), null);
  assert.equal(embedURL(p, 'en', '  '), null);
  const official = new URL(embedURL(p, 'ja', ' owner-key '));
  assert.equal(official.pathname, '/maps/embed/v1/view');
  assert.equal(official.searchParams.get('key'), 'owner-key');
  assert.equal(official.searchParams.get('center'), '25.102400,121.548500');
  assert.equal(official.searchParams.get('language'), 'ja');
  assert.equal(official.searchParams.get('maptype'), 'satellite');
  assert.throws(() => googleMapURL({lat: NaN, lon: 0}), RangeError);
});

test('nearby endpoint requests six articles in 10 km and safely normalizes real-coordinate items', async () => {
  let called;
  await mockedFetch(async (url, init) => {
    called = {url: new URL(url), init};
    return response([
      place(1, {title: '故宮', fullurl: 'https://zh.wikipedia.org/wiki/國立故宮博物院', extract: '歷史介紹。\n\n第二段。'}),
      place(2, {title: 'No coordinate', coordinates: []}),
      place(3, {coordinates: [{lat: 91, lon: 5}]}),
      place(4, {coordinates: [{lat: 25, lon: 121, globe: 'moon'}]}),
      place(5, {fullurl: 'javascript:alert(1)', extract: 'x'.repeat(1000)}),
    ]);
  }, async () => {
    const results = await fetchWikiNearby({lat: 25.1024, lon: 121.5485}, 'zh-Hant');
    assert.equal(results.length, 2);
    assert.equal(results[0].name['zh-Hant'], '故宮');
    assert.equal(results[0].description['zh-Hant'], '歷史介紹。');
    assert.equal(results[0].wiki, true);
    assert.equal(results[0].waterProfile, 'land');
    assert.equal(results[1].sourceUrls[0], 'https://zh.wikipedia.org/?curid=5');
    assert.equal(results[1].description['zh-Hant'].length, 500);
  });
  assert.equal(called.url.hostname, 'zh.wikipedia.org');
  assert.equal(called.url.searchParams.get('generator'), 'geosearch');
  assert.equal(called.url.searchParams.get('ggsradius'), '10000');
  assert.equal(called.url.searchParams.get('ggslimit'), '6');
  assert.equal(called.url.searchParams.get('origin'), '*');
  assert.equal(called.url.searchParams.get('explaintext'), '1');
  assert.equal(called.url.searchParams.get('coprimary'), 'primary');
  assert.equal(called.init.credentials, 'omit');
  assert.ok(called.init.headers['Api-User-Agent'].includes('AEROExplorer/4.0'));
});

test('destination search preserves locale, safe Wiki host, ranking and max six results', async () => {
  await mockedFetch(async url => {
    const parsed = new URL(url);
    assert.equal(parsed.hostname, 'tl.wikipedia.org');
    assert.equal(parsed.searchParams.get('generator'), 'search');
    assert.equal(parsed.searchParams.get('gsrsearch'), 'Yellowstone & lake');
    assert.equal(parsed.searchParams.get('gsrlimit'), '6');
    return response(Array.from({length: 9}, (_, index) => place(20 - index)));
  }, async () => {
    const results = await searchWikiDestinations('  Yellowstone   & lake  ', 'fil');
    assert.equal(results.length, 6);
    assert.equal(results[0].id, 'wiki-tl-12');
    assert.equal(results[0].name.fil, 'Test place');
    assert.equal(results[0].sourceUrls[0], 'https://tl.wikipedia.org/?curid=12');
  });
});

test('memory cache rounds nearby positions, isolates callers, expires at five minutes and respects pre-abort', async () => {
  let requests = 0;
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    await mockedFetch(async () => { requests++; return response([place(801)]); }, async () => {
      const first = await fetchWikiNearby({lat: 12.1201, lon: 31.3101}, 'en');
      first[0].name.en = 'mutated';
      const second = await fetchWikiNearby({lat: 12.1202, lon: 31.3102}, 'en');
      assert.equal(requests, 1);
      assert.equal(second[0].name.en, 'Test place');
      now += 300000;
      await fetchWikiNearby({lat: 12.1202, lon: 31.3102}, 'en');
      assert.equal(requests, 2);
      const abort = new AbortController(); abort.abort();
      await assert.rejects(fetchWikiNearby({lat: 12.1202, lon: 31.3102}, 'en', abort.signal), {name: 'AbortError'});
      assert.equal(requests, 2);
    });
  } finally { Date.now = originalNow; }
});

test('cache has a bounded 64-entry LRU instead of growing without limit', async () => {
  let requests = 0;
  await mockedFetch(async () => { requests++; return response([place(802)]); }, async () => {
    for (let i = 0; i < 65; i++) await searchWikiDestinations(`cache-bound-${i}`, 'de');
    assert.equal(requests, 65);
    await searchWikiDestinations('cache-bound-64', 'de');
    assert.equal(requests, 65, 'newest remains cached');
    await searchWikiDestinations('cache-bound-0', 'de');
    assert.equal(requests, 66, 'oldest was evicted');
  });
});

test('HTTP 429 and API failures reject honestly without fabricated nearby entries or automatic retries', async () => {
  let requests = 0;
  await mockedFetch(async () => {
    requests++;
    return response([], {ok: false, status: 429, headers: new Headers({'Retry-After': '30'})});
  }, async () => {
    await assert.rejects(searchWikiDestinations('rate-error-unique', 'en'), error => error.status === 429 && error.retryAfter === '30');
  });
  assert.equal(requests, 1);
  await mockedFetch(async () => response([], {json: async () => ({error: {code: 'maxlag'}})}), async () => {
    await assert.rejects(searchWikiDestinations('lag-error-unique', 'en'), error => error.code === 'maxlag');
  });
});

test('caller cancellation propagates to fetch; network timeout aborts after configured eight-second bound', async () => {
  const pendingFetch = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once: true});
  });
  await mockedFetch(pendingFetch, async () => {
    const abort = new AbortController();
    const pending = searchWikiDestinations('caller-abort-unique', 'en', abort.signal);
    abort.abort();
    await assert.rejects(pending, {name: 'AbortError'});
  });
  const originalTimeout = globalThis.setTimeout;
  let requestedDelay;
  globalThis.setTimeout = (callback, delay, ...args) => {
    requestedDelay = delay;
    return originalTimeout(callback, delay === 8000 ? 2 : delay, ...args);
  };
  try {
    await mockedFetch(pendingFetch, async () => {
      await assert.rejects(searchWikiDestinations('timeout-unique', 'en'), {name: 'TimeoutError'});
    });
    assert.equal(requestedDelay, 8000);
  } finally { globalThis.setTimeout = originalTimeout; }
});
