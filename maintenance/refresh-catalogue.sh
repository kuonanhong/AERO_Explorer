#!/usr/bin/env bash
set -euo pipefail
# Download public source data once during maintenance, never per game player.
# Requires curl, python3, Pillow and opencc-python-reimplemented.
TASK_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$TASK_DIR"
mkdir -p raw
curl --fail --location --retry 2 --max-time 120 \
  'https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Attraction-json.zip' \
  --output raw/taiwan-zh.zip
curl --fail --location --retry 2 --max-time 180 \
  'https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/exports/json?lang=en&timezone=UTC' \
  --output raw/download1.txt
python3 - <<'PY'
from pathlib import Path
from zipfile import ZipFile
with ZipFile('raw/taiwan-zh.zip') as z:
    Path('raw/taiwan-zh.json').write_bytes(z.read('AttractionList.json'))
PY
python3 build-catalogue.py
printf '%s\n' 'Refreshed catalogue. Review changes and source licenses before publishing.'
