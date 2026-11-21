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
STATE = {'jobs': [], 'opts': {}, 'done': threading.Event(), 'results': [], 'last': time.time(), 'log': None}


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
        if path == '/studio/jobs': return self._json({'jobs': STATE['jobs'], **STATE['opts']})
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
            os.replace(tmp, os.path.join(OUT, name)); return self._json({'ok': True, 'name': name, 'bytes': n})
        body = self.rfile.read(n) if n else b'{}'
        try: data = json.loads(body.decode('utf-8') or '{}')
        except ValueError: data = {}
        if u.path == '/studio/log': say('  ·', data.get('msg', '')); return self._json({'ok': True})
        if u.path == '/studio/done':
            if data.get('all'): STATE['done'].set(); return self._json({'ok': True})
            job, res = data.get('job') or {}, data.get('result') or {}; STATE['results'].append({'job': job, 'result': res})
            if res.get('error') or not res.get('name'): say(f"  ✗ {job.get('name')}: {res.get('error') or 'nothing recorded'}")
            else: say(f"  ✓ {res['name']}  {res.get('bytes', 0) / 1e6:.0f} MB   ({len(STATE['results'])}/{len(STATE['jobs'])})")
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


def make_jobs(args):
    idx = json.load(open(os.path.join(V7, 'data', 'tours', 'index.json'), encoding='utf-8')); jobs = []; langs = [l.strip() for l in args.langs.split(',') if l.strip()]
    for k, (pid, e) in enumerate(idx.get('places', {}).items(), 1):
        try: d = json.load(open(os.path.join(V7, 'data', 'tours', e['file']), encoding='utf-8')); name = d.get('name', {})
        except Exception: name = {}
        label = f"{name.get('zh-Hant', '')} {name.get('en', '')} {pid}"
        if args.only and args.only.lower() not in label.lower() and args.only != str(k): continue
        for t in e['tours']:
            if args.tour and args.tour != t['id']: continue
            for lang in langs:
                base = f"{k:02d}_{slug(name.get('en') or pid)}__{t['id']}__{lang}"
                jobs.append({'place': pid, 'tour': t['id'], 'lang': lang, 'name': base, 'title': (t['title'].get('zh-Hant') or t['title'].get('en') or ''), 'k': k})
    return jobs


def recorded(base):
    for ext in ('.mp4', '.webm'):
        p = os.path.join(OUT, base + ext)
        if os.path.exists(p) and os.path.getsize(p) > STATE.get('min', 2_000_000): return p
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
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--langs', default='zh-Hant'); ap.add_argument('--only', default=''); ap.add_argument('--tour', default=''); ap.add_argument('--list', action='store_true')
    ap.add_argument('--serve', action='store_true'); ap.add_argument('--force', action='store_true'); ap.add_argument('--port', type=int, default=8777)
    ap.add_argument('--size', default='1280x720'); ap.add_argument('--mbps', type=float, default=5.0); ap.add_argument('--fps', type=int, default=30)
    ap.add_argument('--quality', default='high', choices=['low', 'mid', 'high']); ap.add_argument('--from', dest='start', type=float, default=0, help=argparse.SUPPRESS)
    ap.add_argument('--chrome', default=''); ap.add_argument('--no-browser', action='store_true'); ap.add_argument('--no-prewarm', action='store_true', help=argparse.SUPPRESS)
    args = ap.parse_args()
    if not os.path.exists(os.path.join(V7, 'index.html')): sys.exit('✗ run this from the studio/ folder inside the AERO Explorer v7 package')
    os.makedirs(OUT, exist_ok=True); os.makedirs(WORK, exist_ok=True); STATE['log'] = open(os.path.join(OUT, 'studio-log.txt'), 'a', encoding='utf-8')
    w, h = (int(x) for x in args.size.lower().split('x'))
    if args.start: STATE['min'] = 50_000                      # partial test recordings are small
    allj = [] if args.serve else make_jobs(args); todo = [j for j in allj if args.force or not recorded(j['name'])]
    if args.list or (not args.serve and not todo):
        for j in allj: say(('  done ' if recorded(j['name']) else '  todo '), j['name'], '·', j['title'])
        say(f'{len(allj)} tour(s), {len(todo)} to record (about {len(todo) * 6.5 / 60:.1f} h)');
        if not args.list and allj: finish(args, allj)
        return
    STATE['jobs'] = todo; STATE['opts'] = {'w': w, 'h': h, 'bps': int(args.mbps * 1e6), 'fps': args.fps, 'quality': args.quality, 'from': args.start, 'prewarm': not args.no_prewarm}
    try: srv = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    except OSError as e: sys.exit(f'✗ port {args.port} is busy ({e}); try --port 8778')
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{args.port}/index.html'
    if args.serve:
        say(f'AERO Explorer v7 is served at {url}\nPress Ctrl+C to stop.')
        try:
            while True: time.sleep(3600)
        except KeyboardInterrupt: return
    say(f'AERO Studio: {len(todo)} tour(s) to record, {w}x{h} at {args.mbps:g} Mbit/s — about {len(todo) * 6.5 / 60:.1f} hours. Output: {OUT}')
    url += f'?studio=1&lang={urllib.parse.quote(todo[0]["lang"])}'; chrome = args.chrome or find_chrome(); proc = None
    if chrome and not args.no_browser:
        prof = os.path.join(WORK, 'chrome-profile'); os.makedirs(prof, exist_ok=True)
        cmd = [chrome, f'--app={url}', f'--user-data-dir={prof}', f'--window-size={w},{h + 40}', '--window-position=40,40', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
               '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion,MacWebContentsOcclusion,IntensiveWakeUpThrottling',
               '--disable-background-media-suspend', '--force-device-scale-factor=1', '--no-first-run',
               '--no-default-browser-check', '--disable-session-crashed-bubble', '--hide-crash-restore-bubble']
        say('Opening', os.path.basename(chrome), '— keep that window open and visible; do not minimise it.')
        proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if sys.platform == 'darwin' and shutil.which('caffeinate'):          # keep the display and the computer awake while the window is open
            try: subprocess.Popen(['caffeinate', '-dims', '-w', str(proc.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception: pass
        say('A line of progress appears here every 15 seconds. The first video is ready after about 7 minutes.')
    else: say(f'Chrome was not found. Open this address in Chrome or Edge and click once inside the page:\n  {url}')
    try:
        while not STATE['done'].wait(5):
            if proc and proc.poll() is not None: say('The browser window was closed; stopping.'); break
            if time.time() - STATE['last'] > 600: say('No sign of life from the page for 10 minutes; stopping. Run the same command again to continue.'); break
    except KeyboardInterrupt: say('\nStopped. Run the same command again to continue with the remaining tours.')
    if proc and proc.poll() is None:
        try: proc.terminate()
        except Exception: pass
    srv.shutdown(); finish(args, allj)
    bad = [r for r in STATE['results'] if r['result'].get('error') or not r['result'].get('name')]
    if bad: say(f'{len(bad)} tour(s) failed; run the command again to retry them.')


if __name__ == '__main__': main()
