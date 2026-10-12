#!/usr/bin/env python3
"""Verify delivered mission imagery; optionally restore missing v5.1 WebP files.

Python 3.9+ and Pillow are required. Run from any directory:
  python3 tools/verify-mission-photos.py
  python3 tools/verify-mission-photos.py --restore-missing
Existing files are never overwritten. Restores require exact manifest SHA-256.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--restore-missing', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent / 'dist/assets'
    photos = json.loads((root / 'photos/manifest.json').read_text())['assets']
    scenes = json.loads((root / 'mission-scenes.json').read_text())['scenes']
    by_id = {p['id']: p for p in photos}
    checked = set()
    for scene in scenes:
        for photo_id in [scene['photoId'], scene.get('contextPhotoId')]:
            if not photo_id or photo_id in checked:
                continue
            photo = by_id[photo_id]
            path = root / 'photos' / photo['file']
            if not path.exists() and args.restore_missing and photo_id.startswith('v51-'):
                request = Request(photo['downloadUrl'], headers={'User-Agent': 'AERO-Explorer/5.1 photo-attribution restoration'})
                with urlopen(request, timeout=45) as response:
                    content = response.read(20 * 1024 * 1024)
                picture = Image.open(io.BytesIO(content)).convert('RGB')
                picture.thumbnail((1600, 1200))
                output = io.BytesIO()
                picture.save(output, 'WEBP', quality=86, method=6)
                encoded = output.getvalue()
                if hashlib.sha256(encoded).hexdigest() != photo['sha256']:
                    raise RuntimeError(f'{photo_id}: regenerated hash differs; retain the delivered asset. Pillow/libwebp versions or remote contents may differ.')
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(encoded)
            content = path.read_bytes()
            assert hashlib.sha256(content).hexdigest() == photo['sha256'], photo_id
            assert len(content) == photo['bytes'], photo_id
            with Image.open(io.BytesIO(content)) as picture:
                picture.load()
                assert list(picture.size) == photo['dimensions'], photo_id
            assert photo['author'] and photo['license'] and photo['sourcePage'], photo_id
            checked.add(photo_id)
        if scene['missionId'].startswith('water-'):
            assert by_id[scene['photoId']].get('underwater') is True, scene['missionId']
    assert len(scenes) == 30
    print(f'PASS: {len(scenes)} mission scenes; {len(checked)} real reference/context photos; hashes, dimensions, attribution and underwater flags verified.')


if __name__ == '__main__':
    main()
