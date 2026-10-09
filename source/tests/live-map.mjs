import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveLocationMap, DEFAULT_TILE_URL, projectMap, unprojectMap, visibleTilePlan, tileURLFor, officialGoogleEmbedURL} from '../dist/live-map.js';

class Element {
  constructor(tag, document) { this.tagName = tag.toUpperCase(); this.ownerDocument = document; this.children = []; this.style = {}; this.dataset = {}; this.attrs = {}; this.hidden = false; this.classList = {add: name => this.className = `${this.className || ''} ${name}`}; }
  append(...nodes) { for (const node of nodes) { node.remove(); this.children.push(node); node.parentNode = this; } }
  replaceChildren(...nodes) { for (const node of this.children) node.parentNode = null; this.children = []; this.append(...nodes); }
  remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter(n => n !== this); this.parentNode = null; } }
  setAttribute(name, value) { this.attrs[name] = value; }
  addEventListener(name, callback) { this[`on_${name}`] = callback; }
  getBoundingClientRect() { const d = this.ownerDocument; return {left: 0, top: d.top, width: d.width, height: d.height, right: d.width, bottom: d.top + d.height}; }
  set src(url) { this._src = url; const d = this.ownerDocument;
    if (!url.startsWith('https:')) { d.pending.delete(this); return; }
    d.requests.push({url, tag: this.tagName, referrerPolicy: this.referrerPolicy});
    if (this.tagName === 'IMG') { d.pending.add(this); d.highWater = Math.max(d.highWater, d.pending.size); }
  }
  get src() { return this._src || ''; }
}
function environment({width = 600, height = 260, top = 0, protocol = 'https:'} = {}) {
  const document = {width, height, top, requests: [], pending: new Set(), highWater: 0, visibilityState: 'visible',
    addEventListener() {}, removeEventListener() {}, createElement(tag) { return new Element(tag, this); }};
  document.defaultView = {innerHeight: 900, innerWidth: 1200, location: {protocol}, addEventListener() {}, removeEventListener() {}};
  const container = new Element('div', document);
  function completeOne(success = true) { const image = document.pending.values().next().value; if (!image) return false;
    document.pending.delete(image); (success ? image.onload : image.onerror)?.(); return true; }
  function completeAll(success = true) { let count = 0; while (completeOne(success)) { if (++count > 100) throw Error('Unbounded requests'); } }
  return {document, container, completeOne, completeAll};
}
function descendants(root, tag) { return root.children.flatMap(node => [...(node.tagName === tag ? [node] : []), ...descendants(node, tag)]); }

test('Web Mercator is reversible and tile plans only cover visible regions with at most nine tiles', () => {
  for (const position of [{lat: 22.65, lon: 120.35}, {lat: -40, lon: -175}, {lat: 85, lon: 179.999}]) {
    const recovered = unprojectMap(projectMap(position, 16), 16);
    assert.ok(Math.abs(recovered.lat - position.lat) < 1e-8);
    assert.ok(Math.abs(recovered.lon - position.lon) < 1e-8);
    for (const [width, height] of [[320, 245], [600, 260], [1920, 1080]]) {
      const plan = visibleTilePlan(position, 16, width, height);
      assert.ok(plan.tiles.length > 0 && plan.tiles.length <= 9);
      for (const tile of plan.tiles) {
        assert.ok(tile.x >= 0 && tile.x < 2 ** 16 && tile.y >= 0 && tile.y < 2 ** 16);
        assert.ok(tile.left < width && tile.top < height && tile.left + tile.size > 0 && tile.top + tile.size > 0);
      }
    }
  }
});

test('tile URL stays configurable and HTTPS; no undocumented Google iframe remains', () => {
  const tile = {z: 12, x: 1024, y: 2048};
  assert.equal(tileURLFor(DEFAULT_TILE_URL, tile), 'https://tile.openstreetmap.org/12/1024/2048.png');
  for (const template of ['http://tiles.test/{z}/{x}/{y}', 'javascript:{z}/{x}/{y}', 'https://tiles.test/no-template']) assert.equal(tileURLFor(template, tile), null);
  assert.equal(officialGoogleEmbedURL({lat: 25, lon: 121}), null);
  const url = new URL(officialGoogleEmbedURL({lat: 25, lon: 121}, 'zh-Hant', 'owner-key'));
  assert.equal(url.pathname, '/maps/embed/v1/view'); assert.equal(url.searchParams.get('language'), 'zh-TW');
});

test('default local map creates no iframe, uses at most three concurrent loads and retains visible attribution', () => {
  const env = environment(), map = new LiveLocationMap(env.container, {key: 'optional-key'});
  try {
    map.update({lat: 22.65, lon: 120.35}, 'zh-Hant', {now: 0});
    assert.equal(descendants(env.container, 'IFRAME').length, 0);
    assert.equal(env.document.pending.size, 3);
    assert.ok(env.document.requests.every(r => r.url.startsWith('https://tile.openstreetmap.org/') && r.referrerPolicy === 'strict-origin-when-cross-origin'));
    env.completeAll();
    assert.ok(env.document.highWater <= 3); assert.ok(env.document.requests.length <= 9);
    assert.equal(env.container.dataset.mapState, 'ready');
    assert.equal(map.creditLink.textContent, '© OpenStreetMap contributors');
    assert.equal(map.creditLink.href, 'https://www.openstreetmap.org/copyright');
    assert.equal(map.credits.hidden, false);
  } finally { map.dispose(); }
});

test('blocked tiles produce honest coordinate-grid fallback, never an error iframe or retry storm', () => {
  const env = environment(), map = new LiveLocationMap(env.container);
  try {
    map.update({lat: 22.65, lon: 120.35}, 'en', {now: 0}); env.completeAll(false);
    assert.equal(env.container.dataset.mapState, 'fallback');
    assert.match(map.status.textContent, /Coordinate grid/); assert.match(map.reading.textContent, /22.650000, 120.350000/);
    const before = env.document.requests.length;
    map.update({lat: 22.65, lon: 120.35}, 'en', {force: true, now: 1});
    assert.equal(env.document.requests.length, before, 'failed URLs have a cooldown');
    assert.equal(descendants(env.container, 'IFRAME').length, 0);
  } finally { map.dispose(); }
});

test('offscreen, hidden-tab and file mode do not prefetch standard OSM tiles', () => {
  for (const setup of [{top: 2000}, {protocol: 'file:'}, {hidden: true}]) {
    const env = environment(setup); if (setup.hidden) env.document.visibilityState = 'hidden';
    const map = new LiveLocationMap(env.container);
    try { map.update({lat: 25, lon: 121}, 'en', {now: 0}); assert.equal(env.document.requests.length, 0);
      assert.equal(env.container.dataset.mapState, setup.protocol === 'file:' ? 'file' : 'idle');
    } finally { map.dispose(); }
  }
});

test('camera updates require both elapsed time and travel, while unchecked follow still moves the vehicle marker', () => {
  const env = environment(), map = new LiveLocationMap(env.container);
  try {
    assert.equal(map.update({lat: 0, lon: 0}, 'en', {now: 0}), true); env.completeAll();
    assert.equal(map.update({lat: 0, lon: .001}, 'en', {now: 14999}), false);
    assert.equal(map.update({lat: 0, lon: .0001}, 'en', {now: 15000}), false);
    assert.equal(map.update({lat: 0, lon: .001}, 'en', {now: 15000}), true); env.completeAll();
    const originalX = map.marker.style.left, center = {...map.center};
    assert.equal(map.update({lat: 0, lon: .002}, 'en', {now: 31000, follow: false}), false);
    assert.deepEqual(map.center, center); assert.notEqual(map.marker.style.left, originalX);
    assert.match(map.reading.textContent, /0.002000/);
    assert.equal(map.update({lat: 0, lon: .002}, 'en', {now: 31001, follow: false, force: true}), true);
    assert.equal(map.center.lon, .002);
  } finally { map.dispose(); }
});

test('nearby markers use actual coordinates across the dateline, reject invalid places and cap at eight', () => {
  const env = environment(), selected = [], map = new LiveLocationMap(env.container, {onPlace: place => selected.push(place.id)});
  try {
    map.update({lat: 0, lon: 179.999}, 'en', {now: 0}); env.completeAll(false);
    map.setPlaces([{id: 'bad', lat: 90, lon: 0, label: 'Invalid'},
      {id: 'across', lat: 0, lon: -179.999, label: 'Across dateline'},
      ...Array.from({length: 12}, (_, n) => ({id: String(n), lat: 0, lon: 179.999, label: 'Actual place'}))]);
    assert.equal(map.placeItems.length, 8);
    assert.equal(map.placeItems[0].marker.hidden, false);
    assert.equal(map.placeItems[0].marker.attrs['aria-label'], '1. Across dateline');
    map.placeItems[0].marker.on_click(); assert.deepEqual(selected, ['across']);
    assert.equal(env.container.dataset.mapState, 'fallback', 'markers remain available on local grid');
  } finally { map.dispose(); }
});

test('only explicit owner-configured Google mode creates an official iframe', () => {
  const env = environment(), map = new LiveLocationMap(env.container, {key: 'owner-key'});
  try {
    map.update({lat: 25, lon: 121}, 'en', {now: 0}); env.completeAll();
    assert.equal(descendants(env.container, 'IFRAME').length, 0);
    assert.equal(map.setMode('google'), true);
    assert.equal(descendants(env.container, 'IFRAME').length, 1);
    assert.match(map.iframe.src, /^https:\/\/www.google.com\/maps\/embed\/v1\/view\?/);
    assert.equal(env.container.dataset.mapState, 'google');
    map.setMode('tiles'); assert.equal(map.iframe.hidden, true);
  } finally { map.dispose(); }
  const second = environment(), noKey = new LiveLocationMap(second.container);
  try { assert.equal(noKey.setMode('google'), false); assert.equal(descendants(second.container, 'IFRAME').length, 0); }
  finally { noKey.dispose(); }
});

test('old requests stay in the same concurrency budget during rapid destination changes; disposal cancels local work', () => {
  const env = environment(), map = new LiveLocationMap(env.container);
  map.update({lat: 22, lon: 120}, 'en', {now: 0});
  map.update({lat: 44, lon: -110}, 'en', {force: true, now: 1});
  assert.equal(env.document.pending.size, 3);
  env.completeAll(); assert.ok(env.document.highWater <= 3);
  map.dispose(); assert.equal(env.document.pending.size, 0); assert.equal(map.active.size, 0);
  assert.equal(map.update({lat: 0, lon: 0}, 'en'), false);
});
