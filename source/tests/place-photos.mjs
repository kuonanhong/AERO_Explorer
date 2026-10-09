import test from 'node:test';
import assert from 'node:assert/strict';
import {commonsPhotoAsset, metadataText, createPlacePhotoResolver} from '../dist/place-photos.js';

const place = id => ({id: `wiki-en-${id}`, sourceUrls: [`https://en.wikipedia.org/?curid=${id}`]});
const response = (data, overrides = {}) => ({ok: true, status: 200, headers: new Headers(), json: async () => data, ...overrides});
const article = (file, source = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Landmark.jpg') => ({query: {pages: [{pageid: 1, title: 'An actual landmark', pageimage: file, original: {source}}]}});
function filePage({meta = {}, info = {}, page = {}} = {}) {
  return {title: 'File:Landmark.jpg', imageinfo: [{mime: 'image/jpeg', size: 100000, width: 1200, height: 800,
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Landmark.jpg',
    thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Landmark.jpg/640px-Landmark.jpg',
    thumbwidth: 640, thumbheight: 427,
    descriptionurl: 'https://commons.wikimedia.org/wiki/File:Landmark.jpg',
    extmetadata: {Artist: {value: '<a href="https://example.org">Photographer &amp; Co</a>'},
      Attribution: {value: 'Special required credit'}, Credit: {value: 'Own work'},
      LicenseShortName: {value: 'CC BY-SA 4.0'}, LicenseUrl: {value: 'https://creativecommons.org/licenses/by-sa/4.0/'},
      Copyrighted: {value: 'True'}, ObjectName: {value: 'Real landmark'}, ...meta}, ...info}], ...page};
}
const commons = options => ({query: {pages: [filePage(options)]}});

test('metadata is reduced to inert plain text, including numeric entities, and never executes markup', () => {
  assert.equal(metadataText('<script>alert(1)</script><b>Author</b> &amp; &#x738B; &#29579;'), 'Author & 王 王');
  assert.equal(metadataText('&lt;img src=x onerror=alert(1)&gt;'), '<img src=x onerror=alert(1)>');
  assert.equal(metadataText('x'.repeat(21000)), '');
});

test('Commons assets retain all attribution fields and use a bounded thumbnail URL', () => {
  const result = commonsPhotoAsset(filePage(), 'Landmark.jpg');
  assert.equal(result.author, 'Photographer & Co');
  assert.equal(result.title, 'Real landmark');
  assert.equal(result.attribution, 'Special required credit');
  assert.equal(result.credit, 'Own work');
  assert.equal(result.license, 'CC BY-SA 4.0');
  assert.equal(result.width, 640);
  assert.equal(result.height, 427);
  assert.equal(result.is360, false);
  assert.ok(Object.isFrozen(result));
  assert.ok(commonsPhotoAsset(filePage({info: {thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Landmark.jpg/640px-Landmark.jpg?utm_source=commons.wikimedia.org'}}), 'Landmark.jpg'));
});

test('license allowlist accepts CC BY, CC BY-SA, CC0 and explicitly marked public domain', () => {
  for (const [label, url, copyrighted] of [
    ['CC BY 2.0', 'http://creativecommons.org/licenses/by/2.0/', 'True'],
    ['CC BY-SA 3.0', 'https://creativecommons.org/licenses/by-sa/3.0/deed.en', 'True'],
    ['CC BY-SA 2.5 TW', 'https://creativecommons.org/licenses/by-sa/2.5/tw/', 'True'],
    ['CC0', 'https://creativecommons.org/publicdomain/zero/1.0/', 'False'],
    ['Public domain', 'https://commons.wikimedia.org/wiki/Help:Public_domain', 'False'],
  ]) {
    const result = commonsPhotoAsset(filePage({meta: {LicenseShortName: {value: label}, LicenseUrl: {value: url}, Copyrighted: {value: copyrighted}}}), 'Landmark.jpg');
    assert.ok(result, label); assert.ok(result.licenseUrl.startsWith('https://'));
  }
});

test('unverified, ambiguous, restricted or mismatched licenses are rejected', () => {
  for (const meta of [
    {LicenseShortName: {value: 'Fair use'}},
    {LicenseShortName: {value: 'CC BY-NC 4.0'}},
    {LicenseShortName: {value: 'CC BY-SA 4.0 / GFDL'}},
    {LicenseUrl: {value: 'https://creativecommons.org.evil.example/licenses/by-sa/4.0/'}},
    {LicenseUrl: {value: 'https://creativecommons.org/licenses/by/4.0/'}},
    {LicenseUrl: {value: 'javascript:alert(1)'}},
    {Restrictions: {value: 'Permission required'}},
    {Artist: {value: ''}},
    {LicenseShortName: {value: 'Public domain'}, LicenseUrl: {value: 'https://commons.wikimedia.org/wiki/Help:Public_domain'}, Copyrighted: {value: 'True'}},
  ]) assert.equal(commonsPhotoAsset(filePage({meta}), 'Landmark.jpg'), null);
});

test('unsafe image URLs, local Wikipedia files, SVG and invalid source pages are rejected', () => {
  for (const info of [
    {thumburl: 'http://upload.wikimedia.org/wikipedia/commons/a/ab/Landmark.jpg'},
    {thumburl: 'https://upload.wikimedia.org.evil.example/Landmark.jpg'},
    {thumburl: 'https://user:password@upload.wikimedia.org/wikipedia/commons/a/ab/Landmark.jpg'},
    {thumburl: 'https://upload.wikimedia.org/wikipedia/en/a/ab/Landmark.jpg'},
    {thumburl: 'data:image/jpeg,hello'},
    {thumburl: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Landmark.svg', mime: 'image/svg+xml'},
    {descriptionurl: 'https://commons.wikimedia.org/wiki/User:Person'},
    {descriptionurl: 'https://en.wikipedia.org/wiki/File:Landmark.jpg'},
    {thumburl: '', size: 5000000},
  ]) assert.equal(commonsPhotoAsset(filePage({info}), 'Landmark.jpg'), null);
  assert.equal(commonsPhotoAsset(filePage({page: {missing: true}}), 'Landmark.jpg'), null);
});

test('resolver uses only official article and Commons APIs, reads a free main image, then verifies its license', async () => {
  const calls = [];
  const resolver = createPlacePhotoResolver({fetchImpl: async (url, init) => {
    calls.push({url: new URL(url), init}); return response(calls.length === 1 ? article('Landmark.jpg') : commons());
  }});
  assert.ok(await resolver.resolve(place(1)));
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.hostname, 'en.wikipedia.org');
  assert.equal(calls[0].url.searchParams.get('pageids'), '1');
  assert.equal(calls[0].url.searchParams.get('pilicense'), 'free');
  assert.equal(calls[0].url.searchParams.get('piprop'), 'name|original');
  assert.equal(calls[1].url.hostname, 'commons.wikimedia.org');
  assert.equal(calls[1].url.searchParams.get('titles'), 'File:Landmark.jpg');
  assert.equal(calls[1].url.searchParams.get('iiurlwidth'), '640');
  for (const {url, init} of calls) {
    assert.equal(url.searchParams.get('origin'), '*');
    assert.equal(url.searchParams.get('maxlag'), '5');
    assert.equal(init.credentials, 'omit');
    assert.ok(init.headers['Api-User-Agent'].includes('AERO_Explorer'));
  }
});

test('source URL lookup supports real article titles but rejects arbitrary source hosts', async () => {
  let calls = 0;
  const resolver = createPlacePhotoResolver({fetchImpl: async url => {
    calls++; assert.equal(new URL(url).searchParams.get('titles'), '國立故宮博物院');
    return response({query: {pages: []}});
  }});
  assert.equal(await resolver.resolve({sourceUrls: ['https://example.com', 'https://zh.wikipedia.org/wiki/國立故宮博物院']}), null);
  for (const source of ['https://en.wikipedia.org.evil.example/wiki/Place', 'javascript:alert(1)', 'https://en.wikipedia.org/wiki/File:Fake.jpg']) {
    assert.equal(await resolver.resolve({sourceUrls: [source]}), null);
  }
  assert.equal(calls, 1);
});

test('unavailable main image or Commons metadata returns null without using a mismatched fallback', async () => {
  let calls = 0;
  const noImage = createPlacePhotoResolver({fetchImpl: async () => { calls++; return response({query: {pages: [{title: 'No photo'}]}}); }});
  assert.equal(await noImage.resolve(place(1)), null); assert.equal(calls, 1);
  const fairUse = createPlacePhotoResolver({fetchImpl: async url => response(new URL(url).hostname === 'commons.wikimedia.org'
    ? commons({page: {missing: true}}) : article('Local-only.jpg'))});
  assert.equal(await fairUse.resolve(place(2)), null);
});

test('a Wikipedia local file cannot be confused with a same-name Commons file', async () => {
  let calls = 0;
  const local = createPlacePhotoResolver({fetchImpl: async () => {
    calls++; return response(article('Landmark.jpg', 'https://upload.wikimedia.org/wikipedia/en/a/ab/Landmark.jpg'));
  }});
  assert.equal(await local.resolve(place(1)), null); assert.equal(calls, 1);
  const mismatch = createPlacePhotoResolver({fetchImpl: async url => response(new URL(url).hostname === 'commons.wikimedia.org'
    ? commons() : article('Landmark.jpg', 'https://upload.wikimedia.org/wikipedia/commons/c/cd/Other.jpg'))});
  assert.equal(await mismatch.resolve(place(2)), null);
});

test('nearby loading caps the batch at eight and concurrent network requests at two', async () => {
  let active = 0, peak = 0, calls = 0, photos = 0;
  const resolver = createPlacePhotoResolver({fetchImpl: async url => {
    active++; peak = Math.max(peak, active); calls++;
    await new Promise(resolve => setTimeout(resolve, 2)); active--;
    return response(new URL(url).hostname === 'commons.wikimedia.org' ? commons() : article('Landmark.jpg'));
  }});
  const results = await resolver.resolveMany(Array.from({length: 20}, (_, i) => place(i + 1)), {onPhoto: () => photos++, limit: 100});
  assert.equal(results.size, 8); assert.equal(photos, 8); assert.equal(calls, 16); assert.equal(peak, 2);
});

test('bounded LRU caches both verified and missing images and reuses queued duplicate results', async () => {
  let calls = 0;
  const resolver = createPlacePhotoResolver({cacheLimit: 2, concurrency: 1, fetchImpl: async () => { calls++; return response({query: {pages: []}}); }});
  await Promise.all([resolver.resolve(place(1)), resolver.resolve(place(1))]); assert.equal(calls, 1);
  await resolver.resolve(place(2)); await resolver.resolve(place(3)); assert.equal(calls, 3);
  await resolver.resolve(place(3)); assert.equal(calls, 3);
  await resolver.resolve(place(1)); assert.equal(calls, 4);
});

test('timeout and network failure settle to unavailable thumbnails without breaking the game', async () => {
  let aborted = false;
  const resolver = createPlacePhotoResolver({timeout: 10, fetchImpl: (_url, {signal}) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('Aborted', 'AbortError')); });
  })});
  assert.equal(await resolver.resolve(place(1)), null); assert.ok(aborted);
  const offline = createPlacePhotoResolver({fetchImpl: async () => { throw new TypeError('Network unavailable'); }});
  assert.equal(await offline.resolve(place(2)), null);
});

test('caller abort cancels queued and active requests and produces no photo callback', async () => {
  let calls = 0, photos = 0;
  const resolver = createPlacePhotoResolver({fetchImpl: (_url, {signal}) => new Promise((_resolve, reject) => {
    calls++; signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  })});
  const controller = new AbortController();
  const pending = resolver.resolveMany(Array.from({length: 8}, (_, i) => place(i + 1)), {signal: controller.signal, onPhoto: () => photos++});
  controller.abort();
  await assert.rejects(pending, {name: 'AbortError'});
  assert.equal(calls, 2); assert.equal(photos, 0);
  await assert.rejects(resolver.resolve(place(20), {signal: controller.signal}), {name: 'AbortError'});
});

test('HTTP rate limits respect Retry-After without retries or queued request storms', async () => {
  let calls = 0;
  const resolver = createPlacePhotoResolver({concurrency: 1, fetchImpl: async () => {
    calls++; return response({}, {ok: false, status: 429, headers: new Headers({'Retry-After': '120'})});
  }});
  const results = await resolver.resolveMany(Array.from({length: 8}, (_, i) => place(i + 1)));
  assert.equal(calls, 1); assert.ok([...results.values()].every(value => value === null));
});
