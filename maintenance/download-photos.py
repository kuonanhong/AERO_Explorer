#!/usr/bin/env python3
"""Reproduce the bounded, individually licensed AERO v5 photograph set.

Requires Pillow. Reads frozen Commons imageinfo evidence in raw/.
Never assumes that a UNESCO or tourism image URL grants an image license.
"""
from pathlib import Path
import concurrent.futures, hashlib, html, io, json, re, urllib.request
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent
CONFIG = {
    'San Diego Panorama DSC 2349-DSC 2362.jpg': ('v5-san-diego-360', '聖地牙哥 Los Peñasquitos 自然步道・360°', 'Los Peñasquitos Canyon Preserve, San Diego — 360°', 32.938486, -117.152701),
    'Alte Nationalgalerie, Berlin-Mitte, 360 Grad Panorama, 160101, ako.jpg': ('v5-berlin-gallery-360', '柏林舊國家美術館外部・360°', 'Alte Nationalgalerie exterior, Berlin — 360°', 52.520433, 13.399413),
    'Great Barrier Reef Corals.jpg': ('v5-gbr-corals', '大堡礁 Michaelmas 礁珊瑚', 'Great Barrier Reef corals near Michaelmas Reef', -16.587599, 145.996449),
    'Coral2.JPG': ('v5-gbr-mackay', '大堡礁 Mackay 礁珊瑚', 'Corals at Mackay Reef, Great Barrier Reef', -16.045937, 145.644073),
    'Coral community at Norman Reef.jpg': ('v5-gbr-norman', '大堡礁 Norman 礁珊瑚群', 'Coral community at Norman Reef', -16.4333, 145.99),
    'Spotted unicornfish green island.jpg': ('v5-green-island-fish', '臺灣綠島的點斑鼻魚', 'Spotted unicornfish near Green Island, Taiwan', 22.65577, 121.47454),
    'Tomato clownfish.jpg': ('v5-green-island-clownfish', '臺灣綠島石朗的白條海葵魚', 'Tomato clownfish at Shilang, Green Island, Taiwan', 22.65577, 121.47454),
    'Coral in Raja Ampat.jpg': ('v5-raja-ampat-arborek', '印尼四王群島 Arborek 水下珊瑚', 'Underwater corals at Arborek, Raja Ampat', -0.562, 130.518),
    'Corals of Gam, Raja Ampat.jpg': ('v5-raja-ampat-gam', '印尼四王群島 Gam 島珊瑚', 'Corals of Gam, Raja Ampat', -0.493, 130.606),
    'Brain Coral, Belize.jpg': ('v5-belize-coral', '貝里斯大藍洞珊瑚', 'Corals of the Great Blue Hole, Belize', 17.316, -87.534),
    'Silfra.jpg': ('v5-silfra', '冰島 Silfra 裂隙', 'Silfra fissure, Iceland', 64.255, -21.116),
    'Sun Moon Lake, Taiwan.jpg': ('v5-sun-moon-lake', '臺灣日月潭', 'Sun Moon Lake, Taiwan', 23.853, 120.916),
    'Alishan Forest Park 01.jpg': ('v5-alishan-forest', '臺灣阿里山森林', 'Alishan Forest Park, Taiwan', 23.512, 120.807),
    'Taroko Gorge, Taiwan.jpg': ('v5-taroko-gorge', '臺灣太魯閣峽谷・2014 年照片', 'Taroko Gorge, Taiwan — photograph from 2014', 24.18, 121.495),
    'Taroko Archway, Taroko National Park, Hualien (Taiwan).jpg': ('v5-taroko-gate', '臺灣太魯閣牌樓', 'Taroko National Park archway, Taiwan', 24.158, 121.623),
}

def text(value):
    return html.unescape(re.sub('<[^>]+>', '', str(value or ''))).strip()

def download(page):
    title = page['title'].removeprefix('File:')
    if title not in CONFIG:
        return None
    i = page['imageinfo'][0]
    m = i['extmetadata']
    val = lambda k: text(m.get(k, {}).get('value'))
    license_name = val('LicenseShortName')
    if not re.match(r'^(CC BY(?:-SA)? [\d.]+(?: de)?|CC0|Public domain)$', license_name):
        raise ValueError(f'Unapproved license: {title}: {license_name}')
    slug, zh, en, lat, lon = CONFIG[title]
    is_pano = slug.endswith('-360')
    target = ROOT / 'images' / f'{slug}.webp'
    url = (i.get('thumburl') or i['url']).split('?')[0]
    if not target.exists() or target.stat().st_size < 100:
        request = urllib.request.Request(url, headers={'User-Agent': 'AEROExplorer/5.0 (licensed educational image collection)'})
        with urllib.request.urlopen(request, timeout=40) as response:
            data = response.read(30_000_000)
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert('RGB')
        im.thumbnail((2400, 1200) if is_pano else (1280, 960), Image.Resampling.LANCZOS)
        target.parent.mkdir(exist_ok=True)
        encoded = io.BytesIO()
        im.save(encoded, 'WEBP', quality=82, method=6)
        target.write_bytes(encoded.getvalue())
    im = Image.open(target)
    author = val('Artist')
    license_url = val('LicenseUrl') or 'https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain'
    return {
        'id': slug, 'file': f'images/{slug}.webp', 'title': {'zh-TW': zh, 'zh-Hant': zh, 'en': en},
        'commonsTitle': page['title'], 'sourcePage': i['descriptionurl'], 'downloadUrl': url,
        'originalUrl': i['url'].split('?')[0], 'author': author, 'credit': val('Credit'),
        'license': license_name, 'licenseUrl': license_url,
        'changes': 'Resized proportionally and encoded as WebP. No generative editing.',
        'dateTaken': val('DateTimeOriginal'), 'retrieved': '2026-10-11',
        'coordinates': {'lat': float(val('GPSLatitude') or lat), 'lon': float(val('GPSLongitude') or lon), 'kind': 'Source camera coordinate when provided; otherwise approximate destination anchor, not a surveyed camera position'},
        'category': 'underwater' if any(s in slug for s in ['coral', 'gbr', 'island', 'raja']) else 'landscape',
        'underwater': any(s in slug for s in ['coral', 'gbr', 'island', 'raja']),
        'is360': is_pano, 'projection': 'equirectangular' if is_pano else 'rectilinear photograph',
        'originalDimensions': [i['width'], i['height']], 'dimensions': list(im.size),
        'bytes': target.stat().st_size, 'sourceDescription': val('ImageDescription'),
        'facts': {'zh-TW': zh, 'en': en}, 'factSources': [i['descriptionurl']],
        'attribution': 'Ansgar Koreng / CC BY-SA 3.0 (DE)' if slug == 'v5-berlin-gallery-360' else f'{author} / {license_name}', 'derivativeLicense': license_name,
        'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
    }

if __name__ == '__main__':
    pages = []
    for file in sorted((ROOT / 'raw').glob('commons-*.json')):
        pages.extend(json.loads(file.read_text())['query']['pages'].values())
    assets = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        for result in executor.map(download, pages):
            if result:
                assets.append(result)
                print(result['id'], result['bytes'], flush=True)
    (ROOT / 'photo-additions.json').write_text(json.dumps({'version': 3, 'assets': assets}, ensure_ascii=False, indent=2))
    print('Downloaded', len(assets), 'licensed photographs')
