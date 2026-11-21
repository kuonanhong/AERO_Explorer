#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AERO Explorer v7 — build the world catalogue (data/catx) from the Wikidata harvest.

  python3 build_catalogue.py                 uses studio/work/wikidata_places.jsonl  →  ../data/catx/
  python3 build_catalogue.py --target 30000  keep more (or fewer) sights

Input : work/wikidata_places.jsonl (written by aero_fetch.py; Wikidata, CC0)
        ../data/places.json        (the 2,777 destinations that ship with the app; never changed here)
Output: ../data/catx/index.json, c00.json …  (rows the app streams in after start-up)
        ../data/catx/names-<lang>.json        (place names in the other interface languages)
Python 3.8+, standard library only. Nothing is uploaded."""
import argparse, json, math, os, re, sys, time, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__)); V7 = os.path.dirname(HERE)
WORK = os.path.join(HERE, 'work'); OUT = os.path.join(V7, 'data', 'catx')

# type key (aero_fetch.CLASSES) -> app category, weight
TYPES = {
 'natpark': ('park', 1.5), 'castle': ('heritage', 1.1), 'palace': ('heritage', 1.2), 'monastery': ('heritage', 1.0), 'cathedral': ('heritage', 1.0), 'mosque': ('heritage', 0.9),
 'temple': ('heritage', 1.1), 'buddhist': ('heritage', 1.1), 'hindu': ('heritage', 1.0), 'shinto': ('heritage', 1.1), 'church': ('heritage', 0.8), 'synagogue': ('heritage', 0.8),
 'archsite': ('heritage', 1.1), 'ancientcity': ('heritage', 1.1), 'ruins': ('heritage', 1.0), 'pyramid': ('heritage', 1.3), 'monument': ('heritage', 1.0), 'memorial': ('heritage', 0.9),
 'statue': ('statue', 1.0), 'historic': ('heritage', 1.0), 'heritagesite': ('heritage', 1.0), 'histdistrict': ('heritage', 1.0), 'oldtown': ('heritage', 1.1), 'ensemble': ('heritage', 1.0),
 'fort': ('heritage', 0.9), 'fortification': ('heritage', 0.9), 'square': ('scenic', 0.9), 'attraction': ('scenic', 1.3), 'museum': ('museum', 0.8), 'artmuseum': ('museum', 0.8),
 'opera': ('scenic', 0.8), 'theatre': ('scenic', 0.6), 'bridge': ('bridge', 1.1), 'tower': ('scenic', 1.0), 'obstower': ('scenic', 1.0), 'skyscraper': ('scenic', 0.8),
 'lighthouse': ('lighthouse', 1.2), 'dam': ('lake', 0.9), 'harbor': ('harbor', 0.9), 'port': ('harbor', 0.7), 'mountain': ('mountain', 1.0), 'volcano': ('mountain', 1.2),
 'stratovolcano': ('mountain', 1.2), 'range': ('mountain', 0.9), 'pass': ('mountain', 1.0), 'hill': ('mountain', 0.8), 'glacier': ('mountain', 1.0), 'canyon': ('mountain', 1.3),
 'valley': ('mountain', 1.0), 'cave': ('cave', 1.1), 'desert': ('scenic', 1.0), 'lake': ('lake', 1.0), 'reservoir': ('lake', 0.8), 'waterfall': ('waterfall', 1.3), 'island': ('island', 1.0),
 'beach': ('coast', 1.1), 'cape': ('coast', 1.1), 'park': ('park', 0.9), 'botgarden': ('park', 1.0), 'garden': ('park', 1.0), 'zoo': ('park', 0.7),
 'naturereserve': ('forest', 1.0), 'protected': ('forest', 1.0), 'biosphere': ('forest', 1.1), 'whs': ('heritage', 1.6), 'tw_heritage': ('heritage', 1.2),
}
# the most specific type names the category
PRIORITY = ['waterfall', 'lighthouse', 'cave', 'bridge', 'statue', 'museum', 'island', 'coast', 'lake', 'mountain', 'park', 'forest', 'harbor', 'heritage', 'scenic']
# Taiwan places come from "everything in Taiwan with a Chinese Wikipedia article", so their type label decides: a label must
# match one of these (and none of TW_NOT) for the place to count as a sight. Unknown labels are left out.
TW_WORDS = [
 (r'waterfall', 'waterfall'), (r'lighthouse', 'lighthouse'), (r'\bcave', 'cave'), (r'bridge', 'bridge'), (r'museum|gallery|memorial hall|exhibition hall', 'museum'), (r'island|islet|archipelago', 'island'),
 (r'beach|\bcape\b|coast|\bbay\b|peninsula|headland|cliff', 'coast'), (r'lake|reservoir|\bdam\b|\bweir\b|pond|lagoon', 'lake'), (r'mountain|summit|\bpeak|\bhill\b|volcano|canyon|gorge|valley|ridge', 'mountain'),
 (r'national park|\bpark\b|garden|\bzoo\b|recreation area', 'park'), (r'forest|nature reserve|wetland|protected area|refuge|habitat', 'forest'), (r'harbo|\bport\b', 'harbor'),
 (r'temple|shrine|church|cathedral|mosque|monaster|pagoda|miao\b|gwaneumsa|konkai|monument|memorial|historic|heritage|\bfort|castle|ruins|archaeolog|\btomb|mausoleum|stele|paifang|cenotaph|ancestral|'
  r'sanheyuan|mansion|old street|academy of classical|sugar|brewery|winery|distillery', 'heritage'),
 (r'hot spring|\bspring\b|night market|remarkable tree|wish tree|\brock\b|sea cave|statue|tower\b|scenic|tourist attraction|suspension', 'scenic'),
]
TW_NOT = re.compile(r'language|\bregion\b|country|\bsea\b|strait|ocean|murder|battle|\bwar\b|conflagration|\bfire\b|list article|toponym|latitude|tribe|legislature|executive|diocese|province|institution|'
                    r'restaurant|department store|commercial|incinerator|oil refinery|rail yard|classification yard|staff halt|wind farm|roundabout|urban roads|science park|sports|\bgym\b|stadium|baseball|'
                    r'rest area|mountain hut|cemeter|convention|movie theater|k\u014dban|seminary|\u014daza|(?<!night )market|power|park and ride|parking|industrial park|tower block|'
                    r'radio|television|telecom|residential|skyscraper|company|school|universit|station', re.I)
# descriptions of things that are not places to fly to (found among protected areas, islands and Taiwan-related items)
NOT_A_SIGHT = re.compile(r'^(?:an? |the )?(?:(?!(?:in|on|of|at|for|from|near|by|within)\b)[\w-]+ ){0,4}?(?:sovereign state|country|language|macrolanguage|dialect|continent|subregion|region of (?:asia|africa|europe|the americas|oceania)|marginal sea|ocean|'
                         r'unincorporated territory|overseas (?:department|territory|region|collectivity)|federal subject|constituent country)\b', re.I)
LANGS = ['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko', 'vi', 'th', 'id', 'ms', 'fil', 'km', 'my', 'hi', 'bn', 'mr', 'ta', 'te', 'ur', 'ar', 'fa', 'he', 'tr', 'ru', 'uk', 'pl', 'cs', 'ro', 'hu', 'el',
         'de', 'nl', 'da', 'sv', 'nb', 'fi', 'fr', 'es', 'it', 'pt', 'sw']
SHARD = 3000


def say(*a): print(*a, flush=True)
def hav(a, b, c, d):
    p, q = math.radians(c - a), math.radians(d - b); h = math.sin(p / 2) ** 2 + math.cos(math.radians(a)) * math.cos(math.radians(c)) * math.sin(q / 2) ** 2
    return 12742000 * math.asin(min(1, math.sqrt(h)))
def norm(s): return re.sub(r'[\W_]+', '', unicodedata.normalize('NFKC', s or '').lower().replace('臺', '台'))
def clean(s, n=160):
    s = re.sub(r'\s+', ' ', (s or '').strip()); return s if len(s) <= n else s[:n - 1].rstrip() + '…'


def category(types):
    cats, w = set(), 0.6
    for t in types:
        if t.startswith('tw:'):
            lab = t[3:].lower()
            if TW_NOT.search(lab): continue
            hit = next((c for rx, c in TW_WORDS if re.search(rx, lab)), None)
            if hit: cats.add(hit); w = max(w, 1.2)
        elif t in TYPES: cats.add(TYPES[t][0]); w = max(w, TYPES[t][1])
    if not cats: return None, 0
    for c in PRIORITY:
        if c in cats: return c, w
    return 'scenic', w


class Grid:
    """places bucketed by 0.02° cells, to find near neighbours quickly"""
    def __init__(self): self.g = {}
    def key(self, lat, lon): return (int(math.floor(lat / 0.02)), int(math.floor(lon / 0.02)))
    def add(self, lat, lon, item): self.g.setdefault(self.key(lat, lon), []).append((lat, lon, item))
    def near(self, lat, lon, r=1):
        a, b = self.key(lat, lon)
        for i in range(-r, r + 1):
            for j in range(-r, r + 1):
                for it in self.g.get((a + i, b + j), ()): yield it


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--input', default=os.path.join(WORK, 'wikidata_places.jsonl')); ap.add_argument('--target', type=int, default=26000)
    ap.add_argument('--min', type=int, default=20000, help='warn when fewer sights than this are available'); ap.add_argument('--out', default=OUT)
    args = ap.parse_args()
    if not os.path.exists(args.input): sys.exit(f'✗ {args.input} not found — run  python3 aero_fetch.py wikidata  first')
    base = json.load(open(os.path.join(V7, 'data', 'places.json'), encoding='utf-8'))
    G = Grid()
    for r in base: G.add(r[1], r[2], (norm(r[3]), norm(r[4]), r[0].startswith('unesco')))
    recs, bad, dup, junk = [], 0, 0, 0
    with open(args.input, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line: continue
            try: r = json.loads(line)
            except ValueError: bad += 1; continue
            n = r.get('n') or {}; lat, lon = r.get('lat'), r.get('lon')
            if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)) or abs(lat) > 85 or abs(lon) > 180 or (lat == 0 and lon == 0): bad += 1; continue
            zh, en = clean(n.get('zh-Hant', ''), 60), clean(n.get('en', ''), 90)
            if not en: en = clean(next((n[l] for l in ('fr', 'es', 'de', 'it', 'pt', 'nl', 'id', 'tr', 'ja') if n.get(l)), ''), 90)
            if not zh and not en: bad += 1; continue
            if re.fullmatch(r'Q\d+', en or zh): bad += 1; continue
            nz, ne = norm(zh), norm(en); is_dup = False
            for la, lo, (bz, be, whs) in G.near(lat, lon, 2 if r.get('whs') else 1):
                d = hav(lat, lon, la, lo)
                same = bool(nz and bz and (nz == bz or (min(len(nz), len(bz)) > 2 and (nz in bz or bz in nz)))) or bool(ne and be and (ne == be or (min(len(ne), len(be)) > 6 and (ne in be or be in ne))))
                if d < 60 or (same and d < 900) or (whs and r.get('whs') and d < 2500 and same): is_dup = True; break
            if is_dup: dup += 1; continue
            cat, w = category(r.get('types') or []); s = int(r.get('s') or 0)
            if not cat or (not r.get('whs') and NOT_A_SIGHT.search((r.get('d') or {}).get('en', ''))): junk += 1; continue
            recs.append({'r': r, 'zh': zh, 'en': en, 'cat': cat, 'score': (s + 1) * w, 'keep': bool(r.get('whs')) or r.get('cc') == 'TW'})
    # the same sight can be listed twice in Wikidata (a building and its institution): keep the better known one
    recs.sort(key=lambda x: -x['score']); G2 = Grid(); uniq = []
    for x in recs:
        r = x['r']; nz, ne = norm(x['zh']), norm(x['en']); clash = False
        for la, lo, (bz, be) in G2.near(r['lat'], r['lon']):
            if hav(r['lat'], r['lon'], la, lo) < 120 and ((nz and nz == bz) or (ne and ne == be)): clash = True; break
        if clash: dup += 1; continue
        G2.add(r['lat'], r['lon'], (nz, ne)); uniq.append(x)
    # balance: a country's 400th sight competes at half its score, so no single country crowds out the rest
    seen = {}
    for x in uniq:
        cc = x['r'].get('cc') or '??'; k = seen.get(cc, 0); seen[cc] = k + 1; x['adj'] = x['score'] / (1 + k / 400.0)
    keep = [x for x in uniq if x['keep']]; rest = sorted((x for x in uniq if not x['keep']), key=lambda x: -x['adj'])
    chosen = keep + rest[:max(0, args.target - len(keep))]
    chosen.sort(key=lambda x: -(x['r'].get('s') or 0))
    if not chosen: sys.exit('✗ no usable sights in the input')
    os.makedirs(args.out, exist_ok=True)
    for f in os.listdir(args.out):
        if re.fullmatch(r'(c\d+|names-[\w-]+|index)\.json', f):
            try: os.remove(os.path.join(args.out, f))
            except OSError: pass
    rows, names = [], {l: {} for l in LANGS if l not in ('zh-Hant', 'zh-Hans', 'en')}
    for x in chosen:
        r = x['r']; n = r.get('n') or {}; d = r.get('d') or {}; w = r.get('w') or {}; zh, en = x['zh'], x['en']; zhs = clean(n.get('zh-Hans', ''), 60)
        wz, we = w.get('zhwiki', ''), w.get('enwiki', ''); adm = r.get('adm') or {}
        region = clean(adm.get('zh-Hant') or adm.get('zh-tw') or adm.get('en') or '', 40)
        cc = r.get('cc') or ''
        if {'range', 'desert'} & set(r.get('types') or []) and (r.get('s') or 0) >= 40: cc, region = '', ''   # a mountain system or desert spans countries; Wikidata's first country would mislead
        rows.append([r['q'], round(r['lat'], 5), round(r['lon'], 5), zh, en, cc, region, x['cat'], clean(d.get('zh-Hant', ''), 120), clean(d.get('en', ''), 160),
                     '' if zhs == zh else zhs, int(r.get('s') or 0), '', '=' if wz and wz == zh else wz, '=' if we and we == en else we])
        for l, m in names.items():
            v = clean(n.get(l, ''), 90)
            if v and v != en: m[r['q']] = v
    shards = []
    for i in range(0, len(rows), SHARD):
        fn = 'c%02d.json' % (i // SHARD); shards.append(fn)
        json.dump(rows[i:i + SHARD], open(os.path.join(args.out, fn), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    have = []
    for l, m in names.items():
        if len(m) >= 200: json.dump(m, open(os.path.join(args.out, f'names-{l}.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':')); have.append(l)
    cats, ccs = {}, {}
    for row in rows: cats[row[7]] = cats.get(row[7], 0) + 1; ccs[row[5] or '??'] = ccs.get(row[5] or '??', 0) + 1
    index = {'v': 1, 'count': len(rows), 'shards': shards, 'names': have, 'built': time.strftime('%Y-%m-%d'), 'source': 'Wikidata (CC0)', 'categories': cats, 'countries': len(ccs)}
    json.dump(index, open(os.path.join(args.out, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    pkg = os.path.join(V7, 'PACKAGE.json')
    try:
        P = json.load(open(pkg, encoding='utf-8')); P['destinations_world'] = len(rows); P['destinations'] = len(base) + len(rows); json.dump(P, open(pkg, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    except Exception: pass
    size = sum(os.path.getsize(os.path.join(args.out, f)) for f in os.listdir(args.out))
    say(f'✓ world catalogue: {len(rows):,} sights in {len(ccs)} countries ({len(shards)} files, {size / 1e6:.1f} MB) → {args.out}')
    say(f'  with the {len(base):,} built-in destinations: {len(base) + len(rows):,} in total · Taiwan {ccs.get("TW", 0) + sum(1 for r in base if r[5] == "TW"):,}')
    say('  by type: ' + ', '.join(f'{k} {v:,}' for k, v in sorted(cats.items(), key=lambda kv: -kv[1])))
    say('  top countries: ' + ', '.join(f'{k} {v:,}' for k, v in sorted(ccs.items(), key=lambda kv: -kv[1])[:14]))
    say(f'  names in {len(have) + 3} languages · left out: {dup:,} duplicates of existing places, {junk:,} that are not sights, {bad:,} unusable records')
    if len(base) + len(rows) < args.min: say(f'  ! fewer than {args.min:,} in total — run  python3 aero_fetch.py wikidata --limit 60000  and build again')


if __name__ == '__main__': main()
