#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AERO Studio · step 1 — fetch.   Runs on YOUR computer (Python 3.8+, no extra packages needed).

  python3 aero_fetch.py all          # everything below, resumable (safe to run again after an interruption)
  python3 aero_fetch.py drive        # download the class's aerial clips from the shared Google Drive folder
  python3 aero_fetch.py wikidata     # harvest 30,000+ sights of the world (names in 40 languages) from Wikidata
  python3 aero_fetch.py taiwan       # Taiwan Tourism Administration scenic-spot open data
  python3 aero_fetch.py proxies      # small 720p preview copies + contact sheets of the clips (needs ffmpeg)

Why this runs on your computer: Claude's own workspace has no access to Google Drive, Wikidata or map servers.
Everything is written inside the class folder; nothing is uploaded anywhere. Public data only, no accounts, no keys.
Progress is printed here and written to studio/work/fetch-log.txt.
"""
import argparse, html, json, os, re, shutil, subprocess, sys, time, urllib.error, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
V7 = os.path.dirname(HERE)
CLASS_DIR = os.path.dirname(V7)
WORK = os.path.join(HERE, 'work')
WD = os.path.join(WORK, 'wd')
FOOTAGE = os.path.join(CLASS_DIR, '無人機空拍題材', '蒜頭素材ㄧ')
UA = 'AERO-Explorer-Studio/7.0 (https://github.com/kuonanhong/AERO_Explorer; educational non-commercial) Python-urllib'
BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
DRIVE_ROOT = '1xbrQbAMI2UmI3upp3HOnJt_UL5TmdfAG'          # 蒜頭素材 (shared "anyone with the link")
LOG = None
USE_CURL = False


def say(*a):
    line = ' '.join(str(x) for x in a)
    print(line, flush=True)
    if LOG:
        try:
            LOG.write(time.strftime('%H:%M:%S ') + line + '\n'); LOG.flush()
        except Exception:
            pass


# ----------------------------------------------------------------------------------------------- HTTP
def _curl(url, data=None, headers=None, timeout=90):
    cmd = ['curl', '-sS', '-L', '--max-time', str(timeout), '-A', (headers or {}).get('User-Agent', UA), '-w', '\n%{http_code}']
    for k, v in (headers or {}).items():
        if k.lower() != 'user-agent': cmd += ['-H', f'{k}: {v}']
    if data is not None: cmd += ['--data-binary', '@-']
    cmd.append(url)
    p = subprocess.run(cmd, input=data, capture_output=True, timeout=timeout + 15)
    if p.returncode != 0: raise IOError('curl: ' + p.stderr.decode('utf-8', 'replace')[:200])
    body, _, code = p.stdout.rpartition(b'\n')
    return int(code or 0), body, {}


def http(url, data=None, headers=None, timeout=90, tries=6, accept_status=(200,)):
    """GET/POST with retries, 429/503 back-off and a curl fallback when Python's TLS setup is broken."""
    global USE_CURL
    h = {'User-Agent': UA, 'Accept-Encoding': 'identity'}
    h.update(headers or {})
    wait = 3
    for attempt in range(tries):
        try:
            if USE_CURL:
                code, body, hdr = _curl(url, data, h, timeout)
            else:
                req = urllib.request.Request(url, data=data, headers=h)
                try:
                    with urllib.request.urlopen(req, timeout=timeout) as r:
                        code, body, hdr = r.status, r.read(), dict(r.headers)
                except urllib.error.HTTPError as e:
                    code, body, hdr = e.code, e.read(), dict(e.headers)
            if code in accept_status: return body
            if code in (429, 500, 502, 503, 504):
                ra = 0
                try: ra = int(float(hdr.get('Retry-After', 0)))
                except Exception: pass
                pause = min(120, max(wait, ra + 1))
                say(f'   server busy (HTTP {code}); waiting {pause}s …'); time.sleep(pause); wait = min(90, wait * 2); continue
            raise IOError(f'HTTP {code}: {body[:160]!r}')
        except (urllib.error.URLError, OSError, subprocess.TimeoutExpired) as e:
            msg = str(e)
            if not USE_CURL and ('CERTIFICATE' in msg.upper() or 'SSL' in msg.upper()) and shutil.which('curl'):
                say('   Python cannot verify TLS certificates here; switching to the system curl'); USE_CURL = True; continue
            if isinstance(e, IOError) and msg.startswith('HTTP 4'): raise
            if attempt == tries - 1: raise
            say(f'   network problem ({msg[:90]}); retry {attempt + 1}/{tries - 1} in {wait}s'); time.sleep(wait); wait = min(90, wait * 2)
    raise IOError('no response: ' + url[:120])


def jget(url, **kw):
    return json.loads(http(url, **kw).decode('utf-8'))


def save_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f: json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, path)


def load_json(path, default=None):
    try:
        with open(path, encoding='utf-8') as f: return json.load(f)
    except Exception:
        return default


# ----------------------------------------------------------------------------------------------- Google Drive (public folder)
SEED = {  # files seen in the shared folder on 2026-11-20 (used when the folder listing cannot be read)
 '第一組/2': [('1p3E8v1q0HwB0c_yPApnUio21aRT1aBjm', 'DJI_20261114103750_0047_D.MP4')],
 '第一組/E': [('1QoSF5esEOkTYsKShTl5iHrGn24MMj8Km', 'DJI_20261114102236_0046_D.MP4')],
 '第二組': [('1UnartouIPCZ-IlB2HaOMdHasfwbSQokd', 'DJI_20261114101926_0024_D.MP4'), ('15ZuJKae8SpeEOVrlfblsDjUHb1278N5y', 'DJI_20261114102014_0025_D.MP4'),
          ('1afNv07iCxRjej7_B8Tzh3JJ5iLcKOHFk', 'DJI_20261114102321_0026_D.DNG'), ('1Pn7urTon35lgVoIaznjsqz4bVxtIGOT_', 'DJI_20261114102831_0027_D.DNG'),
          ('1MxgGUQa2rDsdsW23cA1pjuVD0Tt82fvT', 'DJI_20261114102845_0028_D.DNG'), ('1QGl-WonRs7L9_ReGcTAPyCoiZRJoXL6U', 'DJI_20261114103041_0029_D.MP4')],
 '第三組/srt': [('1Km7ms-mZPSm8tcyA5U5095amsrvLBo9q', 'DJI_20261107112007_0003_D.SRT'), ('1bu4C-JZPk-s3NrKghTQqfMVrFE5gPXFX', 'DJI_20261114135453_0033_D.SRT'),
              ('125aZCWLaaXfzTz11xdVzizssEoaCNYB0', 'DJI_20261114135535_0034_D.SRT')],
}


def drive_list(folder_id):
    """[(id, name, is_folder)] of a public Drive folder, read from the embeddable folder view (no login)."""
    page = http('https://drive.google.com/embeddedfolderview?id=' + folder_id, headers={'User-Agent': BROWSER_UA}, timeout=60).decode('utf-8', 'replace')
    out = []
    for chunk in page.split('id="entry-')[1:]:
        fid = chunk.split('"', 1)[0]
        m_t = re.search(r'flip-entry-title">(.*?)</div>', chunk, re.S)
        m_h = re.search(r'href="([^"]+)"', chunk)
        if not (fid and m_t): continue
        name = html.unescape(re.sub(r'<[^>]+>', '', m_t.group(1))).strip()
        out.append((fid, name, bool(m_h and '/folders/' in m_h.group(1))))
    return out


def safe_name(n):
    return re.sub(r'[\\/:*?"<>|\x00-\x1f]', '_', n).strip() or 'file'


def drive_walk(folder_id, rel='', depth=0):
    files = []
    try:
        items = drive_list(folder_id)
    except Exception as e:
        say(f'   cannot list {rel or "folder"}: {e}'); return files
    for fid, name, is_dir in items:
        if is_dir and depth < 4: files += drive_walk(fid, os.path.join(rel, safe_name(name)), depth + 1)
        elif not is_dir: files.append((fid, os.path.join(rel, safe_name(name))))
    return files


def drive_download(fid, dest):
    """Resumable download of one public Drive file. Returns bytes on disk, or raises."""
    if os.path.exists(dest) and os.path.getsize(dest) > 0: return os.path.getsize(dest)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    part = dest + '.part'
    url = 'https://drive.usercontent.google.com/download?id=' + fid + '&export=download&confirm=t'
    for attempt in range(5):
        have = os.path.getsize(part) if os.path.exists(part) else 0
        req = urllib.request.Request(url, headers={'User-Agent': BROWSER_UA, **({'Range': f'bytes={have}-'} if have else {})})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                ctype = r.headers.get('Content-Type', '')
                if 'text/html' in ctype:           # confirmation page for large files, or an error page
                    page = r.read(400000).decode('utf-8', 'replace')
                    m = re.search(r'<form[^>]+id="download-form"[^>]+action="([^"]+)"', page)
                    if m:
                        params = dict(re.findall(r'<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"', page))
                        url = html.unescape(m.group(1)) + '?' + urllib.parse.urlencode(params); continue
                    if 'quota' in page.lower() or '下載配額' in page:
                        raise IOError('Google Drive download quota for this file is used up; try again in 24 hours or use 全部下載 in the browser')
                    raise IOError('Drive returned a web page instead of the file (is the link still shared with "anyone with the link"?)')
                if have and r.status != 206: have = 0     # server ignored the range: start over
                total = have + int(r.headers.get('Content-Length') or 0)
                t0 = time.time(); last = t0; done = have
                with open(part, 'ab' if have else 'wb') as f:
                    while True:
                        buf = r.read(1 << 20)
                        if not buf: break
                        f.write(buf); done += len(buf)
                        if time.time() - last > 5:
                            last = time.time(); mb = done / 1048576
                            print(f'      {mb:8.0f} MB' + (f' / {total / 1048576:.0f} MB ({100 * done / total:.0f}%)' if total else '') + f'  {((done - have) / 1048576) / max(1, last - t0):.1f} MB/s', flush=True)
                if total and done < total: raise IOError('connection closed early')
            os.replace(part, dest); return os.path.getsize(dest)
        except (urllib.error.URLError, OSError) as e:
            if isinstance(e, urllib.error.HTTPError) and e.code == 416 and os.path.exists(part):   # already complete
                os.replace(part, dest); return os.path.getsize(dest)
            if 'quota' in str(e) or 'web page' in str(e): raise
            say(f'      interrupted ({str(e)[:80]}); resuming in {5 * (attempt + 1)}s'); time.sleep(5 * (attempt + 1))
    raise IOError('gave up after 5 attempts')


def step_drive(args):
    say('\n▶ Google Drive: 蒜頭素材 → ' + FOOTAGE)
    files = drive_walk(DRIVE_ROOT)
    seen = {f[0] for f in files}
    for rel, items in SEED.items():
        for fid, name in items:
            if fid not in seen: files.append((fid, os.path.join(rel, name)))
    if not files: say('  ✗ the folder listing is empty — check the share link'); return False
    order = {'.srt': 0, '.jpg': 1, '.mp4': 2, '.mov': 2, '.dng': 3}       # small telemetry first, raw photos last
    files.sort(key=lambda f: (order.get(os.path.splitext(f[1])[1].lower(), 2), f[1]))
    if args.no_raw: files = [f for f in files if not f[1].lower().endswith('.dng')]
    say(f'  {len(files)} files in the shared folder')
    manifest = load_json(os.path.join(FOOTAGE, 'drive-manifest.json'), {}) or {}
    ok = bad = 0; total = 0
    for i, (fid, rel) in enumerate(files, 1):
        dest = os.path.join(FOOTAGE, rel)
        try:
            existed = os.path.exists(dest)
            if not existed: say(f'  [{i}/{len(files)}] {rel}')
            n = drive_download(fid, dest); total += n; ok += 1
            manifest[rel] = {'id': fid, 'bytes': n}
            save_json(os.path.join(FOOTAGE, 'drive-manifest.json'), manifest)
        except Exception as e:
            bad += 1; say(f'      ✗ {rel}: {e}')
    say(f'  ✓ {ok} files on disk ({total / 1073741824:.1f} GB)' + (f', {bad} failed — run again to retry' if bad else ''))
    return bad == 0


# ----------------------------------------------------------------------------------------------- footage proxies (optional, needs ffmpeg)
def step_proxies(args):
    ff = shutil.which('ffmpeg'); fp = shutil.which('ffprobe')
    say('\n▶ Preview copies of the clips (1280×720) and telemetry')
    if not ff:
        say('  ffmpeg is not installed on this computer — skipped (Claude can make the previews in its own workspace, more slowly)'); return True
    out_dir = os.path.join(FOOTAGE, '_proxy'); os.makedirs(out_dir, exist_ok=True)
    clips = []
    for root, _, fs in os.walk(FOOTAGE):
        if os.path.basename(root).startswith('_'): continue
        for f in sorted(fs):
            if f.lower().endswith(('.mp4', '.mov')) and not f.startswith('.'): clips.append(os.path.join(root, f))
    info = load_json(os.path.join(out_dir, 'clips.json'), {}) or {}
    for i, src in enumerate(sorted(clips), 1):
        rel = os.path.relpath(src, FOOTAGE); key = rel.replace(os.sep, '__')
        dst = os.path.join(out_dir, os.path.splitext(key)[0] + '.mp4')
        meta = {}
        if fp:
            try:
                pr = subprocess.run([fp, '-v', 'error', '-show_entries', 'format=duration,bit_rate:stream=codec_name,width,height,r_frame_rate:format_tags=creation_time,location', '-of', 'json', src], capture_output=True, timeout=60)
                meta = json.loads(pr.stdout.decode('utf-8', 'replace') or '{}')
            except Exception: pass
        if not (os.path.exists(dst) and os.path.getsize(dst) > 10000):
            say(f'  [{i}/{len(clips)}] {rel}')
            tmp = dst + '.tmp.mp4'
            cmd = [ff, '-y', '-v', 'error', '-stats', '-i', src, '-map', '0:v:0', '-vf', 'scale=-2:720,fps=30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', tmp]
            r = subprocess.run(cmd)
            if r.returncode != 0:      # some builds have no libx264 (e.g. videotoolbox only)
                r = subprocess.run([ff, '-y', '-v', 'error', '-i', src, '-map', '0:v:0', '-vf', 'scale=-2:720,fps=30', '-c:v', 'h264_videotoolbox', '-b:v', '5M', '-an', tmp])
            if r.returncode == 0 and os.path.exists(tmp): os.replace(tmp, dst)
            else: say('      ✗ could not convert this clip'); continue
        try:      # DJI clips carry their flight log as a subtitle stream: save it as .srt
            srt = os.path.splitext(dst)[0] + '.srt'
            if not os.path.exists(srt): subprocess.run([ff, '-y', '-v', 'error', '-i', src, '-map', '0:s:0', srt], timeout=120)
            if os.path.exists(srt) and os.path.getsize(srt) == 0: os.remove(srt)
        except Exception: pass
        info[key] = {'src': rel, 'bytes': os.path.getsize(src), 'probe': meta}
        save_json(os.path.join(out_dir, 'clips.json'), info)
    say(f'  ✓ {len(info)} previews in {out_dir}')
    return True


# ----------------------------------------------------------------------------------------------- Wikidata
SPARQL = 'https://query.wikidata.org/sparql'
WDAPI = 'https://www.wikidata.org/w/api.php'
# (key, QID, minimum number of Wikipedia language editions, AERO category, weight)
CLASSES = [
 ('natpark', 'Q46169', 4, 'park', 1.5), ('castle', 'Q23413', 5, 'heritage', 1.1), ('palace', 'Q16560', 6, 'heritage', 1.2), ('monastery', 'Q44613', 6, 'heritage', 1.0),
 ('cathedral', 'Q2977', 6, 'heritage', 1.0), ('mosque', 'Q32815', 6, 'heritage', 0.9), ('temple', 'Q44539', 4, 'heritage', 1.1), ('buddhist', 'Q5393308', 4, 'heritage', 1.1),
 ('hindu', 'Q842402', 4, 'heritage', 1.0), ('shinto', 'Q845945', 5, 'heritage', 1.1), ('church', 'Q16970', 10, 'heritage', 0.8), ('synagogue', 'Q34627', 8, 'heritage', 0.8),
 ('archsite', 'Q839954', 5, 'heritage', 1.1), ('ancientcity', 'Q15661340', 6, 'heritage', 1.1), ('ruins', 'Q109607', 5, 'heritage', 1.0), ('pyramid', 'Q12516', 5, 'heritage', 1.3),
 ('monument', 'Q4989906', 6, 'heritage', 1.0), ('memorial', 'Q5003624', 6, 'heritage', 0.9), ('statue', 'Q179700', 6, 'heritage', 1.0), ('historic', 'Q1081138', 4, 'heritage', 1.0),
 ('heritagesite', 'Q358', 4, 'heritage', 1.0), ('histdistrict', 'Q15243209', 5, 'heritage', 1.0), ('oldtown', 'Q676050', 5, 'heritage', 1.1), ('ensemble', 'Q1497375', 6, 'heritage', 1.0),
 ('fort', 'Q1785071', 5, 'heritage', 0.9), ('fortification', 'Q57821', 6, 'heritage', 0.9), ('square', 'Q174782', 6, 'scenic', 0.9), ('attraction', 'Q570116', 2, 'scenic', 1.3),
 ('museum', 'Q33506', 8, 'museum', 0.8), ('artmuseum', 'Q207694', 8, 'museum', 0.8), ('opera', 'Q153562', 8, 'scenic', 0.8), ('theatre', 'Q24354', 12, 'scenic', 0.6),
 ('bridge', 'Q12280', 6, 'bridge', 1.1), ('tower', 'Q12518', 6, 'scenic', 1.0), ('obstower', 'Q1440300', 5, 'scenic', 1.0), ('skyscraper', 'Q11303', 10, 'scenic', 0.8),
 ('lighthouse', 'Q39715', 4, 'lighthouse', 1.2), ('dam', 'Q12323', 6, 'lake', 0.9), ('harbor', 'Q283202', 6, 'harbor', 0.9), ('port', 'Q44782', 10, 'harbor', 0.7),
 ('mountain', 'Q8502', 10, 'mountain', 1.0), ('volcano', 'Q8072', 6, 'mountain', 1.2), ('stratovolcano', 'Q169358', 5, 'mountain', 1.2), ('range', 'Q46831', 10, 'mountain', 0.9),
 ('pass', 'Q133056', 6, 'mountain', 1.0), ('hill', 'Q54050', 8, 'mountain', 0.8), ('glacier', 'Q35666', 6, 'mountain', 1.0), ('canyon', 'Q150784', 4, 'mountain', 1.3),
 ('valley', 'Q39816', 8, 'mountain', 1.0), ('cave', 'Q35509', 5, 'cave', 1.1), ('desert', 'Q8514', 8, 'scenic', 1.0),
 ('lake', 'Q23397', 10, 'lake', 1.0), ('reservoir', 'Q131681', 8, 'lake', 0.8), ('waterfall', 'Q34038', 4, 'waterfall', 1.3), ('island', 'Q23442', 10, 'island', 1.0),
 ('beach', 'Q40080', 4, 'coast', 1.1), ('cape', 'Q185113', 6, 'coast', 1.1),
 ('park', 'Q22698', 6, 'park', 0.9), ('botgarden', 'Q167346', 5, 'park', 1.0), ('garden', 'Q1107656', 5, 'park', 1.0), ('zoo', 'Q43501', 8, 'park', 0.7),
 ('naturereserve', 'Q179049', 6, 'forest', 1.0), ('protected', 'Q473972', 6, 'forest', 1.0), ('biosphere', 'Q158454', 5, 'forest', 1.1),
]
CLASS_BY_KEY = {c[0]: c for c in CLASSES}
# the app's 40 interface languages → Wikidata label codes (first that exists wins) and Wikipedia site
LANGS = {'zh-Hant': ['zh-tw', 'zh-hant', 'zh-hk'], 'zh-Hans': ['zh-cn', 'zh-hans', 'zh-sg'], 'en': ['en', 'en-gb'], 'ja': ['ja'], 'ko': ['ko'], 'vi': ['vi'], 'th': ['th'],
         'id': ['id'], 'ms': ['ms'], 'fil': ['tl', 'fil'], 'km': ['km'], 'my': ['my'], 'hi': ['hi'], 'bn': ['bn'], 'mr': ['mr'], 'ta': ['ta'], 'te': ['te'], 'ur': ['ur'], 'ar': ['ar'],
         'fa': ['fa'], 'he': ['he'], 'tr': ['tr'], 'ru': ['ru'], 'uk': ['uk'], 'pl': ['pl'], 'cs': ['cs'], 'ro': ['ro'], 'hu': ['hu'], 'el': ['el'], 'de': ['de'], 'nl': ['nl'],
         'da': ['da'], 'sv': ['sv'], 'nb': ['nb', 'no'], 'fi': ['fi'], 'fr': ['fr'], 'es': ['es'], 'it': ['it'], 'pt': ['pt', 'pt-br'], 'sw': ['sw']}
WIKI = {'zh-Hant': 'zhwiki', 'zh-Hans': 'zhwiki', 'fil': 'tlwiki', 'nb': 'nowiki'}
ALL_CODES = sorted({c for v in LANGS.values() for c in v} | {'zh'})
ALL_SITES = sorted({WIKI.get(k, k + 'wiki') for k in LANGS})


def sparql(query, timeout=75):
    body = http(SPARQL, data=urllib.parse.urlencode({'query': query, 'format': 'json'}).encode(), timeout=timeout, tries=7,
                headers={'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/sparql-results+json'})
    return json.loads(body.decode('utf-8'))['results']['bindings']


def wkt_point(s):
    m = re.match(r'Point\(([-0-9.eE]+) ([-0-9.eE]+)\)', s or '')
    return (float(m.group(2)), float(m.group(1))) if m else None      # (lat, lon)


def qid(uri): return uri.rsplit('/', 1)[-1]


def phase1(args):
    os.makedirs(WD, exist_ok=True)
    say(f'\n▶ Wikidata 1/4: sights by type ({len(CLASSES)} types + World Heritage + Taiwan)')
    for i, (key, q, n, cat, w) in enumerate(CLASSES, 1):
        path = os.path.join(WD, f'p1_{key}.json')
        if os.path.exists(path): continue
        query = f'SELECT ?i ?s ?co WHERE {{ ?i wdt:P31 wd:{q}; wikibase:sitelinks ?s; wdt:P625 ?co. FILTER(?s >= {n}) }}'
        try: rows = sparql(query)
        except Exception as e:
            say(f'  [{i}/{len(CLASSES)}] {key}: too large in one piece ({str(e)[:60]}); asking in smaller parts')
            rows = []
            try:
                for lo, hi in ((n, n + 1), (n + 1, n + 3), (n + 3, n + 8), (n + 8, n + 20), (n + 20, 100000)):
                    rows += sparql(f'SELECT ?i ?s ?co WHERE {{ ?i wdt:P31 wd:{q}; wikibase:sitelinks ?s; wdt:P625 ?co. FILTER(?s >= {lo} && ?s < {hi}) }}'); time.sleep(1.5)
            except Exception as e2:
                say(f'  [{i}/{len(CLASSES)}] {key}: skipped for now ({str(e2)[:80]})'); continue
        out = {}
        for b in rows:
            p = wkt_point(b['co']['value'])
            if p and abs(p[0]) <= 90 and abs(p[1]) <= 180: out[qid(b['i']['value'])] = [int(b['s']['value']), round(p[0], 5), round(p[1], 5)]
        save_json(path, out); say(f'  [{i}/{len(CLASSES)}] {key}: {len(out)}'); time.sleep(1.5)
    extra = {
        'whs': 'SELECT ?i ?s ?co WHERE { ?i wdt:P1435 wd:Q9259; wikibase:sitelinks ?s; wdt:P625 ?co. }',
        'tw_heritage': 'SELECT ?i ?s ?co WHERE { ?i wdt:P17 wd:Q865; wdt:P1435 ?h; wikibase:sitelinks ?s; wdt:P625 ?co. }',
        'tw_all': 'SELECT ?i ?s ?co ?k WHERE { ?i wdt:P17 wd:Q865; wdt:P625 ?co; wikibase:sitelinks ?s. ?a schema:about ?i; schema:isPartOf <https://zh.wikipedia.org/>. OPTIONAL { ?i wdt:P31 ?k } }',
    }
    for key, query in extra.items():
        path = os.path.join(WD, f'p1_{key}.json')
        if os.path.exists(path): continue
        try: rows = sparql(query)
        except Exception as e:
            say(f'  {key}: skipped for now ({str(e)[:80]})'); continue
        out = {}
        for b in rows:
            p = wkt_point(b['co']['value'])
            if not p: continue
            rec = out.setdefault(qid(b['i']['value']), [int(b['s']['value']), round(p[0], 5), round(p[1], 5), []])
            if 'k' in b and qid(b['k']['value']) not in rec[3]: rec[3].append(qid(b['k']['value']))
        save_json(path, out); say(f'  {key}: {len(out)}'); time.sleep(1.5)
    # English names of the types used by Taiwan items (to keep sights and drop schools, stations, villages …)
    tw = load_json(os.path.join(WD, 'p1_tw_all.json'), {}) or {}
    cpath = os.path.join(WD, 'p1_tw_classes.json'); labels = load_json(cpath, {}) or {}
    todo = sorted({k for v in tw.values() for k in v[3]} - set(labels))
    for start in range(0, len(todo), 50):
        chunk = todo[start:start + 50]
        try:
            d = jget(WDAPI + '?' + urllib.parse.urlencode({'action': 'wbgetentities', 'format': 'json', 'ids': '|'.join(chunk), 'props': 'labels', 'languages': 'en'}), timeout=60)
            for q, e in (d.get('entities') or {}).items(): labels[q] = ((e.get('labels') or {}).get('en') or {}).get('value', '')
        except Exception as e:
            say(f'  type names {start}: {str(e)[:70]}')
        time.sleep(0.12)
    if todo: save_json(cpath, labels); say(f'  Taiwan: {len(tw)} places with a Chinese Wikipedia article, {len(labels)} types')


TW_DENY = re.compile(r'school|universit|college|academy|institute|station|\bstop\b|village|district|township|settlement|\bcounty|\bcity\b|municipalit|\broad\b|highway|thoroughfare|interchange|'
                     r'constituency|hospital|medical|clinic|company|business|enterprise|agency|organi[sz]ation|ministry|bureau|\boffice|hotel|shopping|\bmall\b|\bbank\b|earthquake|typhoon|election|'
                     r'\bline\b|railway|\briver\b|stream|creek|tunnel|power|airport|air base|military|naval|\barmy|prison|newspaper|\bteam\b|event|disaster|accident|incident|protest|campus|dormitor|'
                     r'library|\bcourt|police|fire dep|factory|substation|depot|parking|constituenc|neighbou?rhood|borough|subdivision|\bcanal\b|\bdrain|industrial|television|radio|embassy|consulate', re.I)
TW_KEEP = re.compile(r'sugar|brewery|winery|distillery|old street|night market|heritage|historic', re.I)


def tw_sights():
    tw = load_json(os.path.join(WD, 'p1_tw_all.json'), {}) or {}
    labels = load_json(os.path.join(WD, 'p1_tw_classes.json'), {}) or {}
    out = {}
    for q, v in tw.items():
        names = [labels.get(k, '') for k in v[3]]; names = [n for n in names if n]
        if not names: continue
        ok = [n for n in names if TW_KEEP.search(n) or not TW_DENY.search(n)]
        if not ok or (len(ok) < len(names) and not any(TW_KEEP.search(n) for n in names)): continue
        out[q] = (v[0], v[1], v[2], ok[0])
    return out


def candidates(limit):
    """Merge the per-type lists, score and keep the best `limit` (always keeping World Heritage and Taiwan)."""
    by_q = {}; qkey = {c[1]: c[0] for c in CLASSES}
    def add(q, s, lat, lon, key, keep=False):
        c = CLASS_BY_KEY.get(key); w = c[4] if c else 1.2
        r = by_q.get(q)
        score = (s + 1) * w
        if r is None: by_q[q] = {'q': q, 's': s, 'lat': lat, 'lon': lon, 'types': [key], 'score': score, 'keep': keep}
        else:
            if key not in r['types']: r['types'].append(key)
            r['score'] = max(r['score'], score); r['keep'] = r['keep'] or keep
    for key, *_ in CLASSES:
        for q, v in (load_json(os.path.join(WD, f'p1_{key}.json'), {}) or {}).items(): add(q, v[0], v[1], v[2], key)
    for q, v in (load_json(os.path.join(WD, 'p1_whs.json'), {}) or {}).items(): add(q, v[0], v[1], v[2], 'whs', keep=v[0] >= 3)
    for q, v in (load_json(os.path.join(WD, 'p1_tw_heritage.json'), {}) or {}).items(): add(q, v[0], v[1], v[2], 'tw_heritage', keep=True)
    for q, v in tw_sights().items(): add(q, v[0], v[1], v[2], 'tw:' + v[3], keep=True)
    rows = sorted(by_q.values(), key=lambda r: (not r['keep'], -r['score']))
    return rows[:limit]


def phase2(args):
    rows = candidates(args.limit)
    say(f'\n▶ Wikidata 2/4: names in 40 languages for {len(rows)} sights')
    ids = [r['q'] for r in rows]
    done = 0
    for start in range(0, len(ids), 50):
        path = os.path.join(WD, 'ent', f'{start // 50:05d}.json')
        if os.path.exists(path): done += 1; continue
        chunk = ids[start:start + 50]
        url = WDAPI + '?' + urllib.parse.urlencode({'action': 'wbgetentities', 'format': 'json', 'ids': '|'.join(chunk), 'props': 'labels|descriptions|sitelinks',
                                                   'languages': '|'.join(ALL_CODES), 'sitefilter': '|'.join(ALL_SITES), 'maxlag': '5'})
        try: d = jget(url, timeout=60)
        except Exception as e:
            say(f'  batch {start // 50}: {str(e)[:80]} (will retry on the next run)'); continue
        if 'error' in d:
            pause = 6 if d['error'].get('code') == 'maxlag' else 3
            time.sleep(pause)
            try: d = jget(url, timeout=60)
            except Exception: continue
            if 'error' in d: continue
        out = {}
        for q, e in (d.get('entities') or {}).items():
            if 'missing' in e: continue
            out[q] = {'l': {k: v['value'] for k, v in (e.get('labels') or {}).items()},
                      'd': {k: v['value'] for k, v in (e.get('descriptions') or {}).items() if k in ('en', 'zh', 'zh-tw', 'zh-hant', 'zh-cn', 'zh-hans', 'ja')},
                      'w': {k: v['title'] for k, v in (e.get('sitelinks') or {}).items()}}
        save_json(path, out); done += 1
        if done % 40 == 0: say(f'  {min(len(ids), start + 50)}/{len(ids)}')
        time.sleep(0.15)
    have = set()
    for f in os.listdir(os.path.join(WD, 'ent')): have.update((load_json(os.path.join(WD, 'ent', f), {}) or {}).keys())
    miss = [q for q in ids if q not in have]
    if miss: say(f'  {len(miss)} more sights joined the list; fetching their names')
    for start in range(0, len(miss), 50):
        chunk = miss[start:start + 50]
        url = WDAPI + '?' + urllib.parse.urlencode({'action': 'wbgetentities', 'format': 'json', 'ids': '|'.join(chunk), 'props': 'labels|descriptions|sitelinks',
                                                   'languages': '|'.join(ALL_CODES), 'sitefilter': '|'.join(ALL_SITES), 'maxlag': '5'})
        try:
            d = jget(url, timeout=60)
            if 'error' in d: time.sleep(6); d = jget(url, timeout=60)
            if 'error' in d: continue
        except Exception as e:
            say(f'  extra names {start}: {str(e)[:80]} (will retry on the next run)'); continue
        out = {q: {'l': {}, 'd': {}, 'w': {}} for q in chunk}
        for q, e in (d.get('entities') or {}).items():
            if 'missing' in e or q not in out: continue
            out[q] = {'l': {k: v['value'] for k, v in (e.get('labels') or {}).items()},
                      'd': {k: v['value'] for k, v in (e.get('descriptions') or {}).items() if k in ('en', 'zh', 'zh-tw', 'zh-hant', 'zh-cn', 'zh-hans', 'ja')},
                      'w': {k: v['title'] for k, v in (e.get('sitelinks') or {}).items()}}
        save_json(os.path.join(WD, 'ent', f'x_{chunk[0]}_{len(chunk)}.json'), out); time.sleep(0.15)
    say(f'\n▶ Wikidata 3/4: country, photo, elevation, heritage status')
    for start in range(0, len(ids), 200):
        path = os.path.join(WD, 'fact', f'{start // 200:05d}.json')
        if os.path.exists(path): continue
        chunk = ids[start:start + 200]
        query = ('SELECT ?i ?cc ?img ?elev ?her ?adm WHERE { VALUES ?i { %s } OPTIONAL { ?i wdt:P17 ?c. ?c wdt:P297 ?cc } OPTIONAL { ?i wdt:P18 ?img } '
                 'OPTIONAL { ?i wdt:P2044 ?elev } OPTIONAL { ?i wdt:P1435 ?her } OPTIONAL { ?i wdt:P131 ?adm } }') % ' '.join('wd:' + q for q in chunk)
        try: res = sparql(query)
        except Exception as e:
            say(f'  facts {start}: {str(e)[:80]} (will retry on the next run)'); continue
        out = {}
        for b in res:
            r = out.setdefault(qid(b['i']['value']), {})
            if 'cc' in b and 'cc' not in r: r['cc'] = b['cc']['value']
            if 'img' in b and 'img' not in r: r['img'] = urllib.parse.unquote(b['img']['value'].rsplit('/', 1)[-1])
            if 'elev' in b and 'elev' not in r:
                try: r['elev'] = round(float(b['elev']['value']))
                except Exception: pass
            if 'her' in b:
                h = qid(b['her']['value'])
                if h == 'Q9259': r['whs'] = 1
                else: r['her'] = 1
            if 'adm' in b and 'adm' not in r: r['adm'] = qid(b['adm']['value'])
        save_json(path, out)
        if (start // 200) % 20 == 0: say(f'  {min(len(ids), start + 200)}/{len(ids)}')
        time.sleep(0.6)
    have = set()
    for f in os.listdir(os.path.join(WD, 'fact')): have.update((load_json(os.path.join(WD, 'fact', f), {}) or {}).keys())
    miss = [q for q in ids if q not in have]
    for start in range(0, len(miss), 200):
        chunk = miss[start:start + 200]
        query = ('SELECT ?i ?cc ?img ?elev ?her ?adm WHERE { VALUES ?i { %s } OPTIONAL { ?i wdt:P17 ?c. ?c wdt:P297 ?cc } OPTIONAL { ?i wdt:P18 ?img } '
                 'OPTIONAL { ?i wdt:P2044 ?elev } OPTIONAL { ?i wdt:P1435 ?her } OPTIONAL { ?i wdt:P131 ?adm } }') % ' '.join('wd:' + q for q in chunk)
        try: res = sparql(query)
        except Exception as e:
            say(f'  extra facts {start}: {str(e)[:80]} (will retry on the next run)'); continue
        out = {q: {} for q in chunk}
        for b in res:
            r = out.setdefault(qid(b['i']['value']), {})
            if 'cc' in b and 'cc' not in r: r['cc'] = b['cc']['value']
            if 'img' in b and 'img' not in r: r['img'] = urllib.parse.unquote(b['img']['value'].rsplit('/', 1)[-1])
            if 'elev' in b and 'elev' not in r:
                try: r['elev'] = round(float(b['elev']['value']))
                except Exception: pass
            if 'her' in b:
                h = qid(b['her']['value'])
                if h == 'Q9259': r['whs'] = 1
                else: r['her'] = 1
            if 'adm' in b and 'adm' not in r: r['adm'] = qid(b['adm']['value'])
        save_json(os.path.join(WD, 'fact', f'x_{chunk[0]}_{len(chunk)}.json'), out); time.sleep(0.6)
    return rows


def zh_convert(names, variant):
    """Convert Chinese names to a regional variant with the Chinese Wikipedia language converter (batches)."""
    out = {}
    clean = [n for n in names if n and not re.search(r"[\[\]{}<>|=']", n)]
    for start in range(0, len(clean), 150):
        chunk = clean[start:start + 150]
        text = '\n'.join('* ' + n for n in chunk)
        body = urllib.parse.urlencode({'action': 'parse', 'format': 'json', 'contentmodel': 'wikitext', 'prop': 'text', 'variant': variant, 'disablelimitreport': '1', 'text': text}).encode()
        try:
            d = json.loads(http('https://zh.wikipedia.org/w/api.php', data=body, timeout=60, headers={'Content-Type': 'application/x-www-form-urlencoded'}).decode('utf-8'))
            items = re.findall(r'<li>(.*?)</li>', d['parse']['text']['*'], re.S)
            items = [html.unescape(re.sub(r'<[^>]+>', '', x)).strip() for x in items]
            if len(items) == len(chunk):
                for a, b in zip(chunk, items):
                    if b: out[a] = b
        except Exception as e:
            say(f'  zh {variant} batch {start}: {str(e)[:70]}')
        time.sleep(0.2)
    return out


def phase3(args, rows):
    say('\n▶ Wikidata 4/4: assembling')
    ent, fact = {}, {}
    for d, target in (('ent', ent), ('fact', fact)):
        folder = os.path.join(WD, d)
        for f in sorted(os.listdir(folder)) if os.path.isdir(folder) else []:
            if f.endswith('.json'): target.update(load_json(os.path.join(folder, f), {}) or {})
    # administrative-area names (for "region") — one more label lookup
    adm_ids = sorted({v['adm'] for v in fact.values() if v.get('adm')})
    adm_path = os.path.join(WD, 'adm.json'); adm = load_json(adm_path, {}) or {}
    todo = [a for a in adm_ids if a not in adm]
    for start in range(0, len(todo), 50):
        chunk = todo[start:start + 50]
        url = WDAPI + '?' + urllib.parse.urlencode({'action': 'wbgetentities', 'format': 'json', 'ids': '|'.join(chunk), 'props': 'labels', 'languages': 'en|zh-tw|zh-hant|zh|zh-cn|ja'})
        try:
            d = jget(url, timeout=60)
            for q, e in (d.get('entities') or {}).items(): adm[q] = {k: v['value'] for k, v in (e.get('labels') or {}).items()}
        except Exception as e:
            say(f'  regions {start}: {str(e)[:70]}')
        if start % 2000 == 0: save_json(adm_path, adm)
        time.sleep(0.12)
    save_json(adm_path, adm)
    # Traditional / Simplified names where Wikidata only has a generic "zh" label
    need_t, need_s = set(), set()
    for q, e in ent.items():
        L = e['l']
        if not any(c in L for c in LANGS['zh-Hant']) and L.get('zh'): need_t.add(L['zh'])
        if not any(c in L for c in LANGS['zh-Hans']) and L.get('zh'): need_s.add(L['zh'])
        D = e['d']
        if D.get('zh') and not (D.get('zh-tw') or D.get('zh-hant')): need_t.add(D['zh'])
        if D.get('zh') and not (D.get('zh-cn') or D.get('zh-hans')): need_s.add(D['zh'])
    conv_path = os.path.join(WD, 'zhconv.json'); conv = load_json(conv_path, {'t': {}, 's': {}}) or {'t': {}, 's': {}}
    nt = sorted(n for n in need_t if n not in conv['t']); ns = sorted(n for n in need_s if n not in conv['s'])
    if nt or ns: say(f'  converting Chinese names: {len(nt)} to Traditional (Taiwan), {len(ns)} to Simplified')
    conv['t'].update(zh_convert(nt, 'zh-tw')); conv['s'].update(zh_convert(ns, 'zh-cn')); save_json(conv_path, conv)
    out_path = os.path.join(WORK, 'wikidata_places.jsonl'); n = 0
    with open(out_path + '.tmp', 'w', encoding='utf-8') as f:
        for r in rows:
            e = ent.get(r['q']);
            if not e: continue
            L = e['l']; names = {}
            for lang, codes in LANGS.items():
                v = next((L[c] for c in codes if c in L), None)
                if v is None and lang == 'zh-Hant' and L.get('zh'): v = conv['t'].get(L['zh'], L['zh'])
                if v is None and lang == 'zh-Hans' and L.get('zh'): v = conv['s'].get(L['zh'], L['zh'])
                if v: names[lang] = v
            if not names: continue
            fa = fact.get(r['q'], {}); D = e['d']
            rec = {'q': r['q'], 'lat': r['lat'], 'lon': r['lon'], 's': r['s'], 'types': r['types'], 'n': names,
                   'd': {'en': D.get('en', ''), 'zh-Hant': D.get('zh-tw') or D.get('zh-hant') or conv['t'].get(D.get('zh', ''), D.get('zh', '')), 'zh-Hans': D.get('zh-cn') or D.get('zh-hans') or conv['s'].get(D.get('zh', ''), D.get('zh', '')), 'ja': D.get('ja', '')},
                   'w': e['w'], 'cc': fa.get('cc', ''), 'img': fa.get('img', ''), 'elev': fa.get('elev'), 'whs': fa.get('whs', 0), 'her': fa.get('her', 0),
                   'adm': adm.get(fa.get('adm', ''), {})}
            f.write(json.dumps(rec, ensure_ascii=False, separators=(',', ':')) + '\n'); n += 1
    os.replace(out_path + '.tmp', out_path)
    say(f'  ✓ {n} sights written to {out_path}')
    return n


def step_wikidata(args):
    phase1(args)
    missing = [c[0] for c in CLASSES if not os.path.exists(os.path.join(WD, f'p1_{c[0]}.json'))]
    if missing:
        say(f'  retrying {len(missing)} types the server was too busy for …'); time.sleep(20); phase1(args)
    rows = phase2(args)
    n = phase3(args, rows)
    return n >= min(15000, args.limit // 2)


# ----------------------------------------------------------------------------------------------- Taiwan Tourism Administration open data
def step_taiwan(args):
    say('\n▶ Taiwan Tourism Administration scenic-spot open data')
    path = os.path.join(WORK, 'tw_scenic_spots.json')
    if os.path.exists(path) and os.path.getsize(path) > 100000: say('  already downloaded'); return True
    for url in ('https://media.taiwan.net.tw/XMLReleaseALL_public/scenic_spot_C_f.json', 'https://gis.taiwan.net.tw/XMLReleaseALL_public/scenic_spot_C_f.json'):
        try:
            body = http(url, timeout=120, tries=3, headers={'User-Agent': BROWSER_UA})
            txt = body.decode('utf-8-sig', 'replace'); d = json.loads(txt)
            infos = d.get('XML_Head', {}).get('Infos', {}).get('Info') or d.get('Infos', {}).get('Info') or []
            if len(infos) > 500:
                with open(path, 'w', encoding='utf-8') as f: f.write(txt)
                say(f'  ✓ {len(infos)} spots'); return True
        except Exception as e:
            say(f'  {url.split("/")[2]}: {str(e)[:90]}')
    say('  not available right now — the catalogue will use Wikidata for Taiwan instead'); return True


# ----------------------------------------------------------------------------------------------- main
def main():
    global LOG
    ap = argparse.ArgumentParser(description='AERO Studio fetch step')
    ap.add_argument('steps', nargs='*', default=['all'])
    ap.add_argument('--limit', type=int, default=40000, help='how many Wikidata sights to describe (default 40000)')
    ap.add_argument('--no-raw', action='store_true', help='skip .DNG raw photos from Drive')
    args = ap.parse_args()
    os.makedirs(WORK, exist_ok=True)
    LOG = open(os.path.join(WORK, 'fetch-log.txt'), 'a', encoding='utf-8')
    steps = args.steps if 'all' not in args.steps else ['wikidata', 'taiwan', 'drive', 'proxies']
    say(f'AERO Studio fetch · {time.strftime("%Y-%m-%d %H:%M")} · steps: {", ".join(steps)}')
    say('class folder: ' + CLASS_DIR)
    status = {}
    for s in steps:
        fn = {'drive': step_drive, 'wikidata': step_wikidata, 'taiwan': step_taiwan, 'proxies': step_proxies}.get(s)
        if not fn: say(f'unknown step: {s}'); continue
        try: status[s] = bool(fn(args))
        except KeyboardInterrupt:
            say('\nstopped — run the same command again to continue where it left off'); status[s] = False; break
        except Exception as e:
            say(f'  ✗ {s} stopped: {e}'); status[s] = False
    save_json(os.path.join(WORK, 'fetch-status.json'), {'finished': time.strftime('%Y-%m-%dT%H:%M:%S'), 'steps': status})
    say('\n' + ' · '.join(f'{k}: {"done" if v else "INCOMPLETE"}' for k, v in status.items()))
    say('完成後請回到 Claude 說「抓好了」。 When this finishes, tell Claude it is done.' if all(status.values()) else '有步驟未完成：再執行一次同樣的指令即可接續。 Some steps are incomplete: run the same command again.')


if __name__ == '__main__':
    main()
