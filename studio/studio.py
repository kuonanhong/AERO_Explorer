#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AERO Studio — record the guided tours of AERO Explorer v7 as video files on this computer.

It serves this folder's site on 127.0.0.1, opens it in Chrome (its own window and profile), lets the page fly each
five-minute tour over the real terrain and satellite imagery, and saves the recordings to  ../tours_out/ .
Each tour takes about 6-7 minutes (pre-loading the scenery, then 5 minutes in real time). Leave the window visible.

  python3 studio.py                       every researched tour (40 at the 10 featured places), captions in 繁體中文
  python3 studio.py --langs zh-Hant,en    also an English edition
  python3 studio.py --only suantou        one place (part of its id or name)        --tour t1   one tour
  python3 studio.py --list                show what would be recorded and stop
  python3 studio.py --serve               only serve the site (http://127.0.0.1:8777/), no recording
  python3 studio.py --size 1920x1080 --mbps 8 --quality high

Run it again at any time: finished tours are skipped. Python 3.8+, standard library only; nothing is uploaded.
The map tiles come from the internet (Esri, AWS, OpenFreeMap), so the computer must stay online while recording."""
import argparse, json, os, re, shutil, subprocess, sys, threading, time, unicodedata, urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__)); V7 = os.path.dirname(HERE)
OUT = os.path.join(V7, 'tours_out'); WORK = os.path.join(HERE, 'work')
STATE = {'jobs': [], 'opts': {}, 'done': threading.Event(), 'results': [], 'last': time.time(), 'log': None, 'skip': set(), 'total': 0, 'attempted': set(), 'lost': None}


def next_jobs():
    """The films the page should record now. Normally one: every film gets a browser window of its own, so a graphics failure in one
    film (a lost WebGL context, which Chrome does not give back to that window) cannot freeze the films after it (--same-window: all)."""
    left = [j for j in STATE['jobs'] if j['name'] not in STATE['attempted'] and j['name'] not in STATE['skip']]
    return left if STATE['opts'].get('same_window') else left[:1]
HANG = int(os.environ.get('AERO_STUDIO_HANG') or 300)   # seconds of silence from the page before the browser is restarted


def say(*a):
    line = ' '.join(str(x) for x in a); print(line, flush=True)
    try:
        if STATE['log']: STATE['log'].write(time.strftime('%H:%M:%S ') + line + '\n'); STATE['log'].flush()
    except Exception: pass


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode(); return re.sub(r'[^A-Za-z0-9]+', '_', s).strip('_')[:40] or 'place'


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm',
                      '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4', '.webm': 'video/webm', '.svg': 'image/svg+xml'}
    def __init__(self, *a, **k): super().__init__(*a, directory=V7, **k)
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def _json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode('utf-8'); self.send_response(code); self.send_header('Content-Type', 'application/json; charset=utf-8'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == '/studio/jobs': return self._json({'jobs': next_jobs(), 'pos': len(STATE['attempted'] & {j['name'] for j in STATE['jobs']}) + 1, 'of': len(STATE['jobs']), **STATE['opts']})
        if path == '/studio/status': return self._json({'results': STATE['results'], 'jobs': len(STATE['jobs'])})
        rng = self.headers.get('Range'); fs = self.translate_path(self.path)
        if rng and os.path.isfile(fs):                       # byte ranges, so recorded videos can be scrubbed when played from this server
            m = re.match(r'bytes=(\d*)-(\d*)$', rng.strip()); size = os.path.getsize(fs)
            if m and (m.group(1) or m.group(2)):
                a = int(m.group(1)) if m.group(1) else max(0, size - int(m.group(2))); b = min(size - 1, int(m.group(2))) if m.group(1) and m.group(2) else size - 1
                if a <= b < size:
                    self.send_response(206); self.send_header('Content-Type', self.guess_type(fs)); self.send_header('Accept-Ranges', 'bytes')
                    self.send_header('Content-Range', f'bytes {a}-{b}/{size}'); self.send_header('Content-Length', str(b - a + 1)); self.end_headers()
                    with open(fs, 'rb') as f:
                        f.seek(a); left = b - a + 1
                        while left > 0:
                            chunk = f.read(min(1 << 16, left))
                            if not chunk: break
                            try: self.wfile.write(chunk)
                            except Exception: return
                            left -= len(chunk)
                    return
        return super().do_GET()
    def do_POST(self):
        u = urllib.parse.urlparse(self.path); n = int(self.headers.get('Content-Length') or 0); STATE['last'] = time.time()
        if u.path == '/studio/put':
            name = os.path.basename(urllib.parse.parse_qs(u.query).get('name', ['tour.bin'])[0]); name = re.sub(r'[^\w.\-+()一-鿿]', '_', name)
            os.makedirs(OUT, exist_ok=True); tmp = os.path.join(OUT, name + '.part'); left = n
            with open(tmp, 'wb') as f:
                while left > 0:
                    chunk = self.rfile.read(min(1 << 20, left))
                    if not chunk: break
                    f.write(chunk); left -= len(chunk)
            if left: return self._json({'ok': False, 'error': 'incomplete upload'}, 400)
            os.replace(tmp, os.path.join(OUT, name)); bad = picture_stops(os.path.join(OUT, name))
            if bad:                               # checked at once: a film whose picture stopped early is set aside and recorded again at the end
                set_aside(os.path.join(OUT, name), f'the picture stops at {bad[0]:.0f} s of {bad[1]:.0f} s' if bad[2] == 'stops' else 'the picture is frozen (the 3D view stopped updating)'); STATE.setdefault('retry', []).append(os.path.splitext(name)[0])
                return self._json({'ok': False, 'error': 'the picture ' + (f'stopped at {bad[0]:.0f} s of {bad[1]:.0f} s' if bad[2] == 'stops' else 'froze') + ' (it will be recorded again)'}, 500)
            return self._json({'ok': True, 'name': name, 'bytes': n})
        body = self.rfile.read(n) if n else b'{}'
        try: data = json.loads(body.decode('utf-8') or '{}')
        except ValueError: data = {}
        if u.path == '/studio/log': say('  ·', data.get('msg', '')); return self._json({'ok': True})
        if u.path == '/studio/lost':          # the page lost its graphics (WebGL) context: this film is spoiled; start a fresh browser window on it at once
            say(f"  ✗ {data.get('name') or '?'}: the graphics context was lost; recording this film again in a fresh browser window"); STATE['lost'] = data.get('name') or '?'; return self._json({'ok': True})
        if u.path == '/studio/done':
            if data.get('all'): STATE['done'].set(); return self._json({'ok': True})
            job, res = data.get('job') or {}, data.get('result') or {}; STATE['results'].append({'job': job, 'result': res})
            if job.get('name'): STATE['attempted'].add(job['name'])
            if res.get('error') or not res.get('name'): say(f"  ✗ {job.get('name')}: {res.get('error') or 'nothing recorded'}")
            else: say(f"  ✓ {res['name']}  {res.get('bytes', 0) / 1e6:.0f} MB   ({sum(1 for r in STATE['results'] if r['result'].get('name') and not r['result'].get('error'))}/{STATE['total']})")
            json.dump(STATE['results'], open(os.path.join(OUT, 'studio-status.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            return self._json({'ok': True})
        return self._json({'ok': False}, 404)


def find_chrome():
    c = []
    if sys.platform == 'darwin':
        for app in ('Google Chrome', 'Microsoft Edge', 'Brave Browser', 'Chromium', 'Google Chrome Beta'):
            n = {'Google Chrome Beta': 'Google Chrome Beta'}.get(app, app)
            c += [f'/Applications/{app}.app/Contents/MacOS/{n}', os.path.expanduser(f'~/Applications/{app}.app/Contents/MacOS/{n}')]
    elif os.name == 'nt':
        for base in (os.environ.get('PROGRAMFILES', ''), os.environ.get('PROGRAMFILES(X86)', ''), os.environ.get('LOCALAPPDATA', '')):
            if base: c += [os.path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'), os.path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe')]
    else: c += [shutil.which(x) or '' for x in ('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge')]
    return next((p for p in c if p and os.path.exists(p)), None)


def no_record():
    """Kinds of film left out of the recording for now: "no_record" in the film package's _tools/upload_hold.json (for example films whose
    scenes the simulator on this computer cannot draw yet). A kind named with --tour is recorded all the same."""
    try: return {str(x) for x in (json.load(open(os.path.join(os.path.dirname(V7), 'AERO導覽影片_20景點80部', '_tools', 'upload_hold.json'), encoding='utf-8')).get('no_record') or [])}
    except Exception: return set()


def make_jobs(args):
    idx = json.load(open(os.path.join(V7, 'data', 'tours', 'index.json'), encoding='utf-8')); jobs = []; langs = [l.strip() for l in args.langs.split(',') if l.strip()]
    off = no_record(); left_out = {}
    for k, (pid, e) in enumerate(idx.get('places', {}).items(), 1):
        try: d = json.load(open(os.path.join(V7, 'data', 'tours', e['file']), encoding='utf-8')); name = d.get('name', {})
        except Exception: name = {}
        label = f"{name.get('zh-Hant', '')} {name.get('en', '')} {pid}"
        if args.only and args.only.lower() not in label.lower() and args.only != str(k): continue
        for t in e['tours']:
            if args.tour and args.tour != t['id']: continue
            kind = t.get('theme') or t['id']
            if kind in off and args.tour != t['id']: left_out[kind] = left_out.get(kind, 0) + len(langs); continue
            for lang in langs:
                base = f"{k:02d}_{slug(name.get('en') or pid)}__{t['id']}__{lang}"
                jobs.append({'place': pid, 'tour': t['id'], 'lang': lang, 'name': base, 'title': (t['title'].get('zh-Hant') or t['title'].get('en') or ''), 'k': k, 'kind': kind})
    if left_out: say('(not recorded for now, _tools/upload_hold.json "no_record": ' + ', '.join(f'{n} {k}' for k, n in sorted(left_out.items())) + ' film(s))')
    # route films (data/routes): two views each, R01_<name>__window__zh-Hant …
    ridx = os.path.join(V7, 'data', 'routes', 'index.json')
    if not args.no_routes and os.path.exists(ridx):
        for rid, e in sorted(json.load(open(ridx, encoding='utf-8')).get('routes', {}).items(), key=lambda kv: kv[1]['num']):
            name = e.get('name', {}); label = f"{name.get('zh-Hant', '')} {name.get('en', '')} route {rid} R{e['num']:02d}"
            if args.only and args.only.lower() not in label.lower(): continue
            for view in ('window', 'chase'):
                if args.tour and args.tour != view: continue
                for lang in langs:
                    base = f"R{e['num']:02d}_{slug(name.get('en') or rid)}__{view}__{lang}"
                    jobs.append({'route': rid, 'view': view, 'place': 'route-' + rid, 'tour': view, 'lang': lang, 'name': base, 'title': name.get('zh-Hant') or name.get('en') or '', 'k': 100 + e['num'], 'kind': 'route'})
    return jobs


def long_jobs(args):
    """the long editions (data/tours_long, YouTube only; 93_long.js): --long <place id, its name, its number, "all" or "daily">.
    They are recorded into tours_out/long/. "daily" (the daily run, the user's plan of 2026-11-27): the next long film in Taiwan and the next
    one abroad that are not recorded yet, in the order of data/tours_long/index.json."""
    try: lidx = json.load(open(os.path.join(V7, 'data', 'tours_long', 'index.json'), encoding='utf-8')).get('places', {})
    except Exception: return []
    idx = json.load(open(os.path.join(V7, 'data', 'tours', 'index.json'), encoding='utf-8')).get('places', {}); num = {pid: k for k, pid in enumerate(idx, 1)}
    langs = [l.strip() for l in args.langs.split(',') if l.strip()]; jobs = []
    for pid, e in lidx.items():
        try: name = json.load(open(os.path.join(V7, 'data', 'tours_long', e['file']), encoding='utf-8')).get('name', {})
        except Exception: name = {}
        label = f"{name.get('zh-Hant', '')} {name.get('en', '')} {pid} {num.get(pid, '')}"
        if args.long not in ('all', 'daily') and args.long.lower() not in label.lower() and args.long != str(num.get(pid)): continue
        for t in e['tours']:
            for lang in langs:
                base = f"{num.get(pid, 0):02d}_{slug(name.get('en') or pid)}__{t['id']}__{lang}"
                jobs.append({'place': pid, 'tour': t['id'], 'lang': lang, 'name': base, 'title': t['title'].get('zh-Hant') or t['title'].get('en') or '', 'k': num.get(pid, 0), 'kind': 'long', 'long': e['file'], 'dur': t.get('dur')})
    return jobs


SCENIC = ('history', 'culture', 'nature', 'geography')
# each evening (the user, 2026-11-27): one place in Taiwan and one abroad (their four films each), one other film, and two long films (one each)
PER_EVENING = {'tw': int(os.environ.get('AERO_TW_PER_EVENING') or 1), 'world': int(os.environ.get('AERO_WORLD_PER_EVENING') or 1), 'other': int(os.environ.get('AERO_OTHER_PER_EVENING') or 1)}
LONG_PER_EVENING = {'tw': int(os.environ.get('AERO_LONG_TW_PER_EVENING') or 1), 'world': int(os.environ.get('AERO_LONG_WORLD_PER_EVENING') or 1)}
def is_tw(place): return str(place).startswith('tw-')
PKG = os.path.join(os.path.dirname(V7), 'AERO導覽影片_20景點80部')


def look():
    """The film look in force: the film package's _tools/look.json, {"since": "<UTC time the look last changed>", "redo_per_day": 5}.
    Films recorded before `since` have the old look: they are not uploaded any more, and those already on YouTube are recorded again,
    a few a day, and replaced there (youtube_upload.py --replace new-look)."""
    try: d = json.load(open(os.path.join(PKG, '_tools', 'look.json'), encoding='utf-8'))
    except Exception: d = {}
    try:
        import datetime
        since = datetime.datetime.fromisoformat(str(d.get('since')).replace('Z', '+00:00')).timestamp()
    except Exception: since = 0
    return since, int(os.environ.get('AERO_REDO_PER_DAY') or d.get('redo_per_day') or 5)


def on_youtube():
    try: up = json.load(open(os.path.join(PKG, '_tools', 'youtube_uploaded.json'), encoding='utf-8'))
    except Exception: up = {}
    return {f for f, e in up.items() if e.get('id') and not e.get('gone')}


def rec_time(name):
    p = os.path.join(OUT, name + '.mp4')
    return os.path.getmtime(p) if os.path.exists(p) else None


def short_sources():
    """Films that a YouTube Short is cut from (the package's _tools/promo/spec.json) and whose Short is up (youtube_shorts.json): recorded
    again first, so each Short is remade with the new look and its 「相關影片」 points at the new film (2026-11-26)"""
    try:
        spec = json.load(open(os.path.join(PKG, '_tools', 'promo', 'spec.json'), encoding='utf-8')).get('shorts', [])
        up = json.load(open(os.path.join(PKG, '_tools', 'youtube_shorts.json'), encoding='utf-8'))
    except Exception: return set()
    return {s['source'] for s in spec if (up.get(s['file']) or {}).get('id')}


def one_run(allj, todo, limit):
    """What one daily run records: one evening's new films (a place in Taiwan and one abroad, their four films together, + 1 other film; in the order
    youtube_upload.py --schedule evening publishes them), then up to redo_per_day films that are on YouTube but have the old look
    (or are missing here), to be replaced, those a Short is cut from first. Films recorded with an old look that never went up are new
    films again."""
    since, redo = look(); yt = on_youtube(); want = {j['name'] for j in todo}
    old = {j['name'] for j in allj if j['name'] not in want and since and (rec_time(j['name']) or since) < since}
    groups, other, again = [], [], []
    for j in allj:
        if j['name'] not in want and j['name'] not in old: continue
        if j['name'] in yt: again.append(j); continue
        if str(j.get('kind')) in SCENIC:
            if groups and groups[-1][0]['place'] == j['place']: groups[-1].append(j)
            else: groups.append([j])
        else: other.append(j)
    pick = [g for g in groups if is_tw(g[0]['place'])][:PER_EVENING['tw']] + [g for g in groups if not is_tw(g[0]['place'])][:PER_EVENING['world']]
    ev = [j for g in sorted(pick, key=groups.index) for j in g] + other[:PER_EVENING['other']]
    src = short_sources()                     # films a Short is cut from first (the user, 2026-11-26), then the ones already set aside here
    again.sort(key=lambda j: (j['name'] not in src, j['name'] in old))
    run = ev[:limit] + again[:redo]
    for j in run:
        if j['name'] in old: set_aside_old(j['name'], since)
    return run


def set_aside_old(name, since):
    """Move an old-look recording (and its subtitled and web copies, and the package's copy) to _old_look/<date>/, so it is recorded
    again; nothing is deleted."""
    stamp = time.strftime('%Y%m%d', time.localtime(since)); moved = []
    for sub in ('', 'web', 'bilingual'):
        p = os.path.join(OUT, sub, name + '.mp4')
        if os.path.exists(p):
            d = os.path.join(OUT, '_old_look', stamp, sub or 'raw'); os.makedirs(d, exist_ok=True); t = os.path.join(d, name + '.mp4')
            if os.path.exists(t): t = os.path.join(d, name + time.strftime('.%H%M%S', time.localtime()) + '.mp4')
            os.replace(p, t); moved.append(sub or 'raw')
    try:
        folder = next((m['folder'] for m in json.load(open(os.path.join(PKG, 'youtube_metadata.json'), encoding='utf-8'))['videos'] if m['file'] == name), None)
        p = folder and os.path.join(PKG, folder, name + '.mp4')
        if p and os.path.exists(p):
            d = os.path.join(PKG, '_old_look', stamp, folder); os.makedirs(d, exist_ok=True); t = os.path.join(d, name + '.mp4')
            if os.path.exists(t): t = os.path.join(d, name + time.strftime('.%H%M%S', time.localtime()) + '.mp4')
            os.replace(p, t); moved.append('package')
    except Exception as e: say(f'  (package copy of {name} not moved: {e})')
    say(f'  old look, recorded again: {name} (earlier version kept in _old_look/{stamp}: {", ".join(moved)})')


PROBE = shutil.which('ffprobe') or next((p for p in ('/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe') if os.path.exists(p)), None)
_CK = {}


def picture_stops(p):
    """(seconds of picture, seconds in all) when the recording's picture stops early — the browser stopped delivering frames while the sound
    went on (it has happened on long sessions with a hidden window); None when the file is whole or cannot be checked (no ffprobe).
    Each file version is checked once (tours_out/video_check.json)."""
    if not PROBE or STATE.get('min', 2_000_000) < 2_000_000: return None
    ck = os.path.join(OUT, 'video_check.json')
    if not _CK:
        try: _CK.update(json.load(open(ck, encoding='utf-8')))
        except (OSError, ValueError): _CK['_'] = 1
    st = os.stat(p); sig = f'{st.st_size}:{int(st.st_mtime)}'; e = _CK.get(os.path.basename(p))
    if not (e and e.get('sig') == sig):
        try:
            j = json.loads(subprocess.run([PROBE, '-v', 'error', '-show_entries', 'stream=codec_type,duration:format=duration', '-of', 'json', p], capture_output=True, text=True, timeout=90).stdout or '{}')
            fd = float((j.get('format') or {}).get('duration') or 0); vd = max([float(x.get('duration') or 0) for x in j.get('streams', []) if x.get('codec_type') == 'video'] or [0])
        except Exception: return None
        e = _CK[os.path.basename(p)] = {'sig': sig, 'video': round(vd, 1), 'all': round(fd, 1)}
        try: t = ck + '.tmp'; json.dump(_CK, open(t, 'w', encoding='utf-8')); os.replace(t, ck)
        except OSError: pass
    if e['all'] > 30 and e['video'] < 0.95 * e['all']: return (e['video'], e['all'], 'stops')
    if 'still' not in e:                     # the picture runs to the end but never changes: the 3D view froze (lost graphics context) while captions went on
        e['still'] = frozen(p, e['video']); _CK[os.path.basename(p)] = e
        try: t = ck + '.tmp'; json.dump(_CK, open(t, 'w', encoding='utf-8')); os.replace(t, ck)
        except OSError: pass
    return (e['video'], e['all'], 'frozen') if e.get('still') else None


def frozen(p, dur):
    """True when five frames spread over the film are practically the same picture in the middle of the frame (captions and badges excluded)"""
    ff = shutil.which('ffmpeg') or next((x for x in ('/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg') if os.path.exists(x)), None)
    if not ff or dur < 60: return False
    W, H = 64, 36; frames = []
    for k in (0.15, 0.35, 0.55, 0.75, 0.92):
        try: b = subprocess.run([ff, '-v', 'error', '-ss', f'{dur * k:.1f}', '-i', p, '-frames:v', '1', '-vf', f'scale={W}:{H},format=gray', '-f', 'rawvideo', '-'], capture_output=True, timeout=60).stdout
        except Exception: return False
        if len(b) < W * H: return False
        frames.append(b)
    def diff(a, b):
        n = 0; s = 0
        for y in range(8, 26):
            for x in range(6, 58): s += abs(a[y * W + x] - b[y * W + x]); n += 1
        return s / n
    return max(diff(frames[i], frames[i + 1]) for i in range(len(frames) - 1)) < 2.0


def set_aside(p, why):
    """move a broken recording to tours_out/_bad/ (kept, not deleted), so the film is recorded again"""
    d = os.path.join(OUT, '_bad'); os.makedirs(d, exist_ok=True); b, x = os.path.splitext(os.path.basename(p))
    q = os.path.join(d, f"{b}.{time.strftime('%Y%m%d-%H%M%S')}{x}")
    try: os.replace(p, q); say(f'  ！{os.path.basename(p)}: {why}; moved to tours_out/_bad/ and it will be recorded again')
    except OSError as e: say(f'  ！{os.path.basename(p)}: {why}; could not move it aside ({e})')


def recorded(base):
    for ext in ('.mp4', '.webm'):
        p = os.path.join(OUT, base + ext)
        if os.path.exists(p) and os.path.getsize(p) > STATE.get('min', 2_000_000):
            bad = picture_stops(p)
            if bad: set_aside(p, f'the picture stops at {bad[0]:.0f} s of {bad[1]:.0f} s' if bad[2] == 'stops' else 'the picture is frozen (the 3D view stopped updating)'); return None
            return p
    return None


def finish(args, all_jobs):
    """media list for the local site, and web-ready copies when ffmpeg is installed"""
    items, ff = {}, shutil.which('ffmpeg'); web = os.path.join(OUT, 'web'); n = 0; mpath = os.path.join(V7, 'data', 'tours', 'media-local.json')
    try:                                                     # keep what is already listed and still on disk (for example a film cut from real footage)
        for k, v in (json.load(open(mpath, encoding='utf-8')).get('items') or {}).items():
            keep = {l: f for l, f in v.items() if os.path.exists(os.path.join(OUT, f))}
            if keep: items[k] = keep
    except Exception: pass
    for j in all_jobs:
        src = recorded(j['name'])
        if not src: continue
        rel = os.path.basename(src)
        if ff:
            os.makedirs(web, exist_ok=True); dst = os.path.join(web, j['name'] + '.mp4')
            if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src):
                codec = ''
                if shutil.which('ffprobe'): codec = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', src], capture_output=True, text=True).stdout.strip()
                copy = src.endswith('.mp4') and codec in ('h264', '')
                cmd = [ff, '-y', '-v', 'error', '-i', src] + (['-c', 'copy'] if copy else ['-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k']) + ['-movflags', '+faststart', dst + '.tmp.mp4']
                if subprocess.run(cmd).returncode == 0: os.replace(dst + '.tmp.mp4', dst)
                elif os.path.exists(dst + '.tmp.mp4'): os.remove(dst + '.tmp.mp4')
            if os.path.exists(dst): rel = 'web/' + os.path.basename(dst)
        items.setdefault(j['place'] + '/' + j['tour'], {})[j['lang']] = rel; n += 1
    json.dump({'base': 'tours_out/', 'items': items}, open(mpath, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    say(f'\n{n} video(s) in {OUT}' + ('' if ff else '  (ffmpeg not found: files are kept exactly as recorded)'))
    say('They now play inside the story card when the site is opened from this computer (start.command).')


def main():
    global OUT
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--langs', default='zh-Hant'); ap.add_argument('--only', default=''); ap.add_argument('--tour', default=''); ap.add_argument('--list', action='store_true')
    ap.add_argument('--serve', action='store_true'); ap.add_argument('--force', action='store_true'); ap.add_argument('--port', type=int, default=8777)
    ap.add_argument('--size', default='1280x720'); ap.add_argument('--mbps', type=float, default=5.0); ap.add_argument('--fps', type=int, default=30)
    ap.add_argument('--quality', default='high', choices=['low', 'mid', 'high']); ap.add_argument('--from', dest='start', type=float, default=0, help=argparse.SUPPRESS)
    ap.add_argument('--chrome', default=''); ap.add_argument('--no-browser', action='store_true'); ap.add_argument('--no-prewarm', action='store_true', help=argparse.SUPPRESS)
    ap.add_argument('--limit', type=int, default=0, help='record at most this many tours in this run (0 = all that are left)')
    ap.add_argument('--no-routes', action='store_true', help='leave out the route films (data/routes)')
    ap.add_argument('--same-window', action='store_true', help='record every film in one browser window (by default each film gets a fresh window)')
    ap.add_argument('--long', default='', help='record a long edition (data/tours_long, YouTube only) into tours_out/long/: a place id, name or number, or "all"')
    args = ap.parse_args()
    if not os.path.exists(os.path.join(V7, 'index.html')): sys.exit('✗ run this from the studio/ folder inside the AERO Explorer v7 package')
    os.makedirs(OUT, exist_ok=True); os.makedirs(WORK, exist_ok=True); STATE['log'] = open(os.path.join(OUT, 'studio-log.txt'), 'a', encoding='utf-8')
    w, h = (int(x) for x in args.size.lower().split('x'))
    if args.start: STATE['min'] = 50_000                      # partial test recordings are small
    if args.long:                                             # long editions: their own folder, never mixed with the daily films
        OUT = os.path.join(V7, 'tours_out', 'long'); os.makedirs(OUT, exist_ok=True); allj = long_jobs(args)
        if not allj:
            if args.long == 'daily': say('no long edition to record (data/tours_long/index.json)'); return
            sys.exit(f'✗ no long edition matches "{args.long}" (data/tours_long/index.json)')
    else: allj = [] if args.serve else make_jobs(args)
    todo = [j for j in allj if args.force or not recorded(j['name'])]
    left = len(todo)
    if args.long == 'daily':                                  # one long film in Taiwan and one abroad each evening
        todo = [j for j in todo if is_tw(j['place'])][:LONG_PER_EVENING['tw']] + [j for j in todo if not is_tw(j['place'])][:LONG_PER_EVENING['world']]
        if not todo: say('every long edition is recorded (tours_out/long)'); return
    if args.limit > 0: todo = one_run(allj, todo, args.limit)       # one evening's new films + a few old-look films to replace
    if args.list or (not args.serve and not todo):
        for j in allj: say(('  done ' if recorded(j['name']) else '  todo '), j['name'], '·', j['title'])
        say(f'{len(allj)} tour(s), {len(todo)} to record (about {len(todo) * 6.5 / 60:.1f} h)');
        if not args.list and allj and not args.long: finish(args, allj)
        return
    STATE['jobs'] = todo; STATE['all_jobs'] = list(todo); STATE['total'] = len(todo); STATE['opts'] = {'w': w, 'h': h, 'bps': int(args.mbps * 1e6), 'fps': args.fps, 'quality': args.quality, 'from': args.start, 'prewarm': not args.no_prewarm, 'same_window': bool(args.same_window)}
    try: srv = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    except OSError as e: sys.exit(f'✗ port {args.port} is busy ({e}); try --port 8778')
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{args.port}/index.html'
    if args.serve:
        say(f'AERO Explorer v7 is served at {url}\nPress Ctrl+C to stop.')
        try:
            while True: time.sleep(3600)
        except KeyboardInterrupt: return
    hours = sum((j.get('dur') or 300) * 1.3 + 90 for j in todo) / 3600
    say(f'AERO Studio: {len(todo)} tour(s) to record, {w}x{h} at {args.mbps:g} Mbit/s — about {hours:.1f} hours. Output: {OUT}')
    if len(todo) < left: say(f'(--limit {args.limit}: {left - len(todo)} more tour(s) are left for the next run)')
    url += '?studio=1&lang='; chrome = args.chrome or find_chrome(); proc = None
    if not chrome or args.no_browser: STATE['opts']['same_window'] = True     # a window opened by hand records the whole list
    prof = os.path.join(WORK, 'chrome-profile')
    def launch(lang):
        os.makedirs(prof, exist_ok=True)
        cmd = [chrome, f'--app={url}{urllib.parse.quote(lang)}', f'--user-data-dir={prof}', f'--window-size={w},{h + 40}', '--window-position=40,40', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
               '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion,MacWebContentsOcclusion,IntensiveWakeUpThrottling',
               '--disable-background-media-suspend', '--force-device-scale-factor=1', '--no-first-run',
               '--no-default-browser-check', '--disable-session-crashed-bubble', '--hide-crash-restore-bubble']
        pr = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if sys.platform == 'darwin' and shutil.which('caffeinate'):          # keep the display and the computer awake while the window is open
            try: subprocess.Popen(['caffeinate', '-dims', '-w', str(pr.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception: pass
        return pr
    def close(pr):
        if pr and pr.poll() is None:
            try:
                pr.terminate(); pr.wait(15)
            except Exception:
                try: pr.kill()
                except Exception: pass
    if chrome and not args.no_browser:
        say('Opening', os.path.basename(chrome), '— keep that window open and visible; do not minimise it.')
        proc = launch(todo[0]['lang'])
        say('A line of progress appears here every 15 seconds. The first video is ready after about 7 minutes.')
    else: say(f'Chrome was not found. Open this address in Chrome or Edge and click once inside the page:\n  {url}{urllib.parse.quote(todo[0]["lang"])}')
    tries = {}
    try:
      while True:
        while not STATE['done'].wait(5):
              if proc and proc.poll() is not None: say('The browser window was closed; stopping.'); STATE['stopped'] = True; break
              if STATE['lost'] and proc:          # graphics lost in the page: the same film again, in a fresh window (twice at most)
                  n = STATE['lost']; STATE['lost'] = None; tries[n] = tries.get(n, 0) + 1
                  if tries[n] >= 2: STATE['skip'].add(n); STATE['attempted'].add(n); say(f'  ✗ {n}: the graphics were lost twice on this film; it is left for the next run')
                  if not next_jobs(): break
                  close(proc); STATE['last'] = time.time(); proc = launch(next_jobs()[0]['lang']); continue
              quiet = time.time() - STATE['last']
              if proc and quiet > HANG:   # the page reports every 15 s: this long a silence means it has stopped (crashed tab, stuck graphics); start the browser again
                  left = [j for j in STATE['jobs'] if not recorded(j['name']) and j['name'] not in STATE['skip']]
                  if left:
                      n = left[0]['name']; tries[n] = tries.get(n, 0) + 1
                      if tries[n] >= 2: STATE['skip'].add(n); say(f'  ✗ {n}: the page stopped twice on this film; it is left for the next run'); left = left[1:]
                  if not left: break
                  say(f'The page has said nothing for {quiet / 60:.0f} minutes; restarting the browser and going on with {left[0]["name"]}')
                  close(proc); STATE['jobs'] = left; STATE['attempted'] -= {j['name'] for j in left}; STATE['last'] = time.time(); proc = launch(left[0]['lang']); continue
              if quiet > 600: say('No sign of life from the page for 10 minutes; stopping. Run the same command again to continue.'); STATE['stopped'] = True; break
        # one film per window: the page has finished its film; the next one starts in a fresh window
        if proc and not STATE.get('stopped') and next_jobs() and not STATE['opts'].get('same_window'):
            STATE['done'].clear(); close(proc); STATE['last'] = time.time(); proc = launch(next_jobs()[0]['lang']); continue
        # films whose picture stopped early were set aside: record them once more, in a fresh browser window
        again = [j for j in STATE.get('all_jobs', []) if j['name'] in set(STATE.get('retry', []))] if not STATE.get('retried') else []
        if not again or not proc or STATE.get('stopped'): break
        STATE['retried'] = True; STATE['retry'] = []; say(f'Recording {len(again)} film(s) again whose picture stopped early: ' + ', '.join(j['name'] for j in again))
        close(proc); STATE['jobs'] = again; STATE['attempted'] -= {j['name'] for j in again}; STATE['total'] += len(again); STATE['done'].clear(); STATE['last'] = time.time(); proc = launch(again[0]['lang'])
    except KeyboardInterrupt: say('\nStopped. Run the same command again to continue with the remaining tours.')
    close(proc)
    srv.shutdown()
    if not args.long: finish(args, allj)
    bad = [r for r in STATE['results'] if r['result'].get('error') or not r['result'].get('name')]
    if bad: say(f'{len(bad)} tour(s) failed; run the command again to retry them.')
    if STATE['skip']: say(f"{len(STATE['skip'])} film(s) were left out after the page stopped twice on them; run the command again to retry them.")


if __name__ == '__main__': main()
