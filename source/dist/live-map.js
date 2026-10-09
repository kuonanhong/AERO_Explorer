// Local map presentation: no iframe is created in the default "tiles" mode.
// Standard OSM tiles are for ordinary interactive viewing, not bulk/offline use.
export const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const EARTH_RADIUS = 6378137, TILE_SIZE = 256, MAX_TILES = 9, MAX_REQUESTS = 3;
const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function validMapPosition(value) {
  const lat = Number(value?.lat), lon = Number(value?.lon ?? value?.lng);
  if (value?.lat == null || (value?.lon == null && value?.lng == null) || !Number.isFinite(lat)
      || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) throw new RangeError('Invalid map coordinates.');
  return {lat, lon};
}

export function projectMap(position, zoom) {
  const {lat, lon} = validMapPosition(position), size = 2 ** zoom * TILE_SIZE;
  const sine = Math.sin(lat * Math.PI / 180);
  return {x: (lon + 180) / 360 * size, y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size};
}

export function unprojectMap(point, zoom) {
  const size = 2 ** zoom * TILE_SIZE, n = Math.PI - 2 * Math.PI * point.y / size;
  return {lat: Math.atan(Math.sinh(n)) * 180 / Math.PI, lon: ((point.x / size * 360) % 360 + 360) % 360 - 180};
}

export function visibleTilePlan(position, zoom, width, height) {
  const z = clamp(Math.round(zoom), 3, 18), w = Math.max(1, width), h = Math.max(1, height);
  // At most 512 source pixels per axis -> at most 3×3 intersecting viewport tiles.
  const scale = Math.max(1, w / 512, h / 512), center = projectMap(position, z), n = 2 ** z;
  const left = center.x - w / (2 * scale), top = center.y - h / (2 * scale);
  const right = left + w / scale, bottom = top + h / scale;
  const tiles = [];
  for (let ty = Math.floor(top / TILE_SIZE); ty <= Math.floor((bottom - 1e-7) / TILE_SIZE); ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(left / TILE_SIZE); tx <= Math.floor((right - 1e-7) / TILE_SIZE); tx++) {
      const x = ((tx % n) + n) % n;
      tiles.push({z, x, y: ty, key: `${z}/${x}/${ty}`, left: (tx * TILE_SIZE - left) * scale,
        top: (ty * TILE_SIZE - top) * scale, size: TILE_SIZE * scale});
    }
  }
  tiles.sort((a, b) => Math.hypot(a.left + a.size / 2 - w / 2, a.top + a.size / 2 - h / 2)
    - Math.hypot(b.left + b.size / 2 - w / 2, b.top + b.size / 2 - h / 2));
  return {tiles: tiles.slice(0, MAX_TILES), scale, center, width: w, height: h, zoom: z,
    northWest: unprojectMap({x: left, y: top}, z), southEast: unprojectMap({x: right, y: bottom}, z)};
}

export function tileURLFor(template, tile) {
  if (typeof template !== 'string' || !template || !['{z}', '{x}', '{y}'].every(part => template.includes(part))) return null;
  const value = template.replaceAll('{z}', tile.z).replaceAll('{x}', tile.x).replaceAll('{y}', tile.y);
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

export function officialGoogleEmbedURL(position, locale = 'en', key = '') {
  if (!String(key).trim()) return null;
  const p = validMapPosition(position), url = new URL('https://www.google.com/maps/embed/v1/view');
  const language = /^zh-(?:Hant|TW|HK|MO)/i.test(locale) ? 'zh-TW' : /^zh/i.test(locale) ? 'zh-CN' : locale;
  url.search = new URLSearchParams({key: String(key).trim(), center: `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`,
    zoom: '16', maptype: 'satellite', language});
  return url.href;
}

function distanceMetres(a, b) {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const TEXT = {
  en: {loading: 'Loading street map', ready: 'OpenStreetMap street map', partial: 'Some map tiles unavailable; grid shown in gaps',
    fallback: 'Coordinate grid — street map unavailable', file: 'Coordinate grid — open the HTTPS website to load the street map',
    idle: 'Street map loads when visible', grid: 'Coordinate grid', position: 'Simulated position', zoomIn: 'Zoom in', zoomOut: 'Zoom out',
    google: 'Google Maps (owner-configured embed)', issue: 'Report a map issue'},
  zh: {loading: '載入街道地圖', ready: 'OpenStreetMap 街道地圖', partial: '部分地圖未載入；空白區顯示座標格線',
    fallback: '座標示意格線：街道地圖暫不可用', file: '座標示意格線：請開啟 HTTPS 網站載入街道地圖',
    idle: '捲動到地圖時載入街道圖', grid: '座標示意格線', position: '模擬位置', zoomIn: '放大地圖', zoomOut: '縮小地圖',
    google: 'Google 地圖（網站方設定的嵌入版）', issue: '回報地圖問題'},
};

export class LiveLocationMap {
  constructor(container, {key = '', mode = 'tiles', tileURL = DEFAULT_TILE_URL,
    attribution = '© OpenStreetMap contributors', attributionURL = 'https://www.openstreetmap.org/copyright',
    interval = 15000, distance = 50, zoom = 16, labels = null, onPlace = null} = {}) {
    if (!container?.ownerDocument?.createElement || container.tagName?.toLowerCase() === 'iframe') {
      throw new TypeError('LiveLocationMap needs a DIV container, not an iframe.');
    }
    this.container = container; this.document = container.ownerDocument; this.window = this.document.defaultView;
    this.key = key; this.mode = mode === 'google' && String(key).trim() ? 'google' : 'tiles';
    this.tileURL = tileURL; this.attribution = attribution; this.attributionURL = attributionURL;
    this.interval = Number.isFinite(interval) && interval >= 0 ? interval : 15000;
    this.distance = Number.isFinite(distance) && distance >= 0 ? distance : 50;
    this.zoom = clamp(Math.round(zoom), 3, 18); this.labels = labels; this.locale = 'en'; this.onPlace = onPlace; this.placeItems = [];
    this.position = null; this.center = null; this.lastAt = -Infinity; this.tiles = new Map();
    this.failures = new Map(); this.queue = []; this.active = new Set(); this.plan = null; this.disposed = false;
    this.observedVisible = !this.window?.IntersectionObserver;
    const make = (tag, className) => { const element = this.document.createElement(tag); element.className = className; return element; };
    this.viewport = make('div', 'aero-map-viewport');
    this.layer = make('div', 'aero-map-tiles'); this.layer.setAttribute('aria-hidden', 'true');
    this.grid = make('div', 'aero-map-grid-note'); this.north = make('span', 'aero-map-north'); this.south = make('span', 'aero-map-south');
    this.marker = make('span', 'aero-map-marker'); this.marker.setAttribute('role', 'img');
    this.placesLayer = make('div', 'aero-map-places');
    this.zoomControls = make('div', 'aero-map-zoom');
    for (const [symbol, delta] of [['+', 1], ['−', -1]]) {
      const button = make('button', 'aero-map-zoom-button'); button.type = 'button'; button.textContent = symbol;
      button.addEventListener('click', () => this.setZoom(this.zoom + delta)); this.zoomControls.append(button);
    }
    this.viewport.append(this.layer, this.grid, this.north, this.south, this.placesLayer, this.marker, this.zoomControls);
    this.reading = make('p', 'aero-map-reading'); this.status = make('p', 'aero-map-status'); this.status.setAttribute('role', 'status');
    this.credits = make('div', 'aero-map-credits'); this.creditLink = make('a', ''); this.creditLink.target = '_blank'; this.creditLink.rel = 'noopener';
    this.creditLink.textContent = attribution;
    try { const url = new URL(attributionURL); this.creditLink.href = url.protocol === 'https:' ? url.href : 'https://www.openstreetmap.org/copyright'; }
    catch { this.creditLink.href = 'https://www.openstreetmap.org/copyright'; }
    this.issueLink = make('a', ''); this.issueLink.href = 'https://www.openstreetmap.org/fixthemap'; this.issueLink.target = '_blank'; this.issueLink.rel = 'noopener';
    this.credits.append(this.creditLink, this.issueLink);
    container.classList.add('aero-live-map'); container.replaceChildren(this.viewport, this.reading, this.status, this.credits);
    this._onVisibility = () => { if (this._visible()) this._render(); };
    if (this.window?.IntersectionObserver) {
      this.observer = new this.window.IntersectionObserver(entries => { this.observedVisible = entries.some(entry => entry.isIntersecting); this._onVisibility(); }, {rootMargin: '0px'});
      this.observer.observe(container);
    } else this.window?.addEventListener('scroll', this._onVisibility, {passive: true});
    if (this.window?.ResizeObserver) { this.resizeObserver = new this.window.ResizeObserver(() => this._render()); this.resizeObserver.observe(this.viewport); }
    else this.window?.addEventListener('resize', this._onVisibility);
    this.document.addEventListener('visibilitychange', this._onVisibility);
    this._labels(); this._setStatus('idle');
  }

  _labels() {
    this.text = {...TEXT[/^zh/i.test(this.locale) ? 'zh' : 'en'], ...(typeof this.labels === 'function' ? this.labels(this.locale) : this.labels || {})};
    this.grid.textContent = this.text.grid;
    this.marker.setAttribute('aria-label', this.text.position);
    this.zoomControls.children[0].setAttribute('aria-label', this.text.zoomIn);
    this.zoomControls.children[1].setAttribute('aria-label', this.text.zoomOut);
    this.issueLink.textContent = this.text.issue;
  }

  _visible() {
    if (this.disposed || this.document.visibilityState === 'hidden' || !this.observedVisible) return false;
    const box = this.container.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0
      && box.top < (this.window?.innerHeight || Infinity) && box.left < (this.window?.innerWidth || Infinity);
  }

  update(position, locale = 'en', {force = false, follow = true, now = performance.now()} = {}) {
    const current = validMapPosition(position);
    if (!Number.isFinite(now)) throw new TypeError('Map update time must be finite.');
    if (this.disposed) return false;
    const languageChanged = locale !== this.locale; this.locale = locale; this.position = current;
    if (languageChanged) this._labels();
    this.reading.textContent = `${this.text.position} · ${current.lat.toFixed(6)}, ${current.lon.toFixed(6)}`;
    this._marker();
    if (!force && !follow && this.center) return false;
    if (!force && this.center && (now - this.lastAt < this.interval || distanceMetres(this.center, current) < this.distance)) return false;
    this.center = current; this.lastAt = now; this._render();
    return true; // The local map center changed; this does not claim successful remote imagery.
  }

  setPlaces(places = []) {
    this.placesLayer.replaceChildren(); this.placeItems = [];
    for (const place of places) {
      if (this.placeItems.length >= 8) break;
      let position; try { position = validMapPosition(place); } catch { continue; }
      const marker = this.document.createElement(typeof this.onPlace === 'function' ? 'button' : 'span');
      marker.className = 'aero-map-place'; marker.textContent = String(this.placeItems.length + 1);
      marker.title = `${marker.textContent}. ${String(place.label || place.id || '')}`;
      marker.setAttribute('aria-label', marker.title);
      if (typeof this.onPlace === 'function') { marker.type = 'button'; marker.addEventListener('click', () => this.onPlace(place)); }
      else marker.setAttribute('role', 'img');
      this.placesLayer.append(marker); this.placeItems.push({position, marker});
    }
    this._marker();
  }

  setMode(mode) {
    if (!['tiles', 'google'].includes(mode) || (mode === 'google' && !String(this.key).trim())) return false;
    this.mode = mode; this._render(); return true;
  }

  setZoom(value) {
    const next = clamp(Math.round(Number(value)), 3, 18);
    if (!Number.isFinite(next) || this.disposed || next === this.zoom) return false;
    this.zoom = next; clearTimeout(this.zoomTimer);
    this.zoomTimer = setTimeout(() => this._render(), 160); return true;
  }

  _marker() {
    if (!this.position || !this.plan) return;
    const project = (element, position) => {
      const point = projectMap(position, this.plan.zoom), world = 2 ** this.plan.zoom * TILE_SIZE;
      let dx = point.x - this.plan.center.x; if (dx > world / 2) dx -= world; if (dx < -world / 2) dx += world;
      const x = this.plan.width / 2 + dx * this.plan.scale, y = this.plan.height / 2 + (point.y - this.plan.center.y) * this.plan.scale;
      element.style.left = `${x}px`; element.style.top = `${y}px`;
      element.hidden = this.mode === 'google' || x < 0 || y < 0 || x > this.plan.width || y > this.plan.height;
    };
    project(this.marker, this.position);
    for (const item of this.placeItems) project(item.marker, item.position);
  }

  _setStatus(state) {
    this.container.dataset.mapState = state;
    const loaded = [...this.tiles.values()].filter(tile => tile.state === 'loaded').length;
    this.status.textContent = (this.text[state] || this.text.fallback) + (state === 'loading' ? ` · ${loaded}/${this.tiles.size}` : '');
  }

  _render() {
    if (!this.center || this.disposed) return;
    this._labels();
    const box = this.viewport.getBoundingClientRect();
    this.plan = visibleTilePlan(this.center, this.zoom, box.width || 320, box.height || 260);
    this.north.textContent = `NW ${this.plan.northWest.lat.toFixed(4)}, ${this.plan.northWest.lon.toFixed(4)}`;
    this.south.textContent = `SE ${this.plan.southEast.lat.toFixed(4)}, ${this.plan.southEast.lon.toFixed(4)}`;
    this._marker();
    const google = this.mode === 'google';
    this.layer.hidden = google; this.zoomControls.hidden = google; this.credits.hidden = google;
    this.grid.hidden = google; this.north.hidden = google; this.south.hidden = google; this.marker.hidden = google; this.placesLayer.hidden = google;
    if (this.iframe) this.iframe.hidden = !google;
    if (!this._visible()) { this._setStatus('idle'); return; }
    if (google) {
      this.queue = [];
      if (!this.iframe) {
        this.iframe = this.document.createElement('iframe'); this.iframe.className = 'aero-map-google';
        this.iframe.title = 'Google Maps'; this.iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        this.iframe.setAttribute('allowfullscreen', ''); this.viewport.append(this.iframe);
      }
      const url = officialGoogleEmbedURL(this.center, this.locale, this.key);
      if (this.iframe.src !== url) this.iframe.src = url;
      this._setStatus('google'); return;
    }
    if (!/^https?:$/.test(this.window?.location?.protocol || '')) { this._setStatus('file'); return; }
    if (!tileURLFor(this.tileURL, this.plan.tiles[0])) { this._setStatus('fallback'); return; }
    const wanted = new Set(this.plan.tiles.map(tile => tile.key));
    for (const [key, record] of this.tiles) if (!wanted.has(key)) { record.image.remove(); this.tiles.delete(key); }
    const now = Date.now();
    for (const tile of this.plan.tiles) {
      let record = this.tiles.get(tile.key);
      if (!record) {
        const image = this.document.createElement('img'); image.alt = ''; image.draggable = false; image.decoding = 'async';
        image.referrerPolicy = 'strict-origin-when-cross-origin'; image.className = 'aero-map-tile';
        record = {image, key: tile.key, url: tileURLFor(this.tileURL, tile), state: 'queued'};
        if ((this.failures.get(record.url) || 0) > now) record.state = 'failed';
        this.tiles.set(tile.key, record);
      }
      if (record.state === 'failed' && (this.failures.get(record.url) || 0) <= now) record.state = 'queued';
      Object.assign(record.image.style, {left: `${tile.left}px`, top: `${tile.top}px`, width: `${tile.size + .5}px`, height: `${tile.size + .5}px`});
      if (record.state !== 'failed' && record.image.parentNode !== this.layer) this.layer.append(record.image);
    }
    this.queue = [...this.tiles.values()].filter(record => record.state === 'queued'); this._pump(); this._status();
  }

  _pump() {
    if (!this._visible() || this.mode !== 'tiles') return;
    while (this.active.size < MAX_REQUESTS && this.queue.length) {
      const record = this.queue.shift(); if (record.state !== 'queued' || !this.tiles.has(record.key)) continue;
      record.state = 'loading'; this.active.add(record);
      const finish = failed => {
        if (!this.active.delete(record)) return;
        clearTimeout(record.timer); record.image.onload = null; record.image.onerror = null;
        record.state = failed ? 'failed' : 'loaded';
        if (failed) {
          record.image.remove(); this.failures.set(record.url, Date.now() + 60000);
          while (this.failures.size > 64) this.failures.delete(this.failures.keys().next().value);
        }
        if (!this.disposed) { this._pump(); this._status(); }
      };
      record.image.onload = () => finish(false); record.image.onerror = () => finish(true);
      record.timer = setTimeout(() => { finish(true); record.image.src = TRANSPARENT_PIXEL; }, 8000);
      record.image.src = record.url; // Let normal browser HTTP caching honor provider headers.
    }
  }

  _status() {
    if (this.mode !== 'tiles' || this.disposed) return;
    const all = [...this.tiles.values()], loaded = all.filter(tile => tile.state === 'loaded').length;
    const pending = all.some(tile => tile.state === 'queued' || tile.state === 'loading');
    this.grid.hidden = loaded === all.length && loaded > 0;
    this._setStatus(pending ? 'loading' : loaded === all.length && loaded ? 'ready' : loaded ? 'partial' : 'fallback');
  }

  dispose() {
    if (this.disposed) return; this.disposed = true; clearTimeout(this.zoomTimer);
    this.observer?.disconnect(); this.resizeObserver?.disconnect();
    this.window?.removeEventListener('scroll', this._onVisibility); this.window?.removeEventListener('resize', this._onVisibility);
    this.document.removeEventListener('visibilitychange', this._onVisibility);
    for (const record of this.active) { clearTimeout(record.timer); record.image.onload = null; record.image.onerror = null; record.image.src = TRANSPARENT_PIXEL; }
    this.active.clear(); this.tiles.clear(); this.queue = []; this.failures.clear();
    if (this.iframe) this.iframe.src = 'about:blank';
    this.container.replaceChildren();
  }
}
