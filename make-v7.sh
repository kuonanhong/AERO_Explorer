#!/usr/bin/env bash
# AERO Explorer v7 · 一鍵準備：世界景點資料（Wikidata）＋蒜頭空拍素材（Google 雲端硬碟）→ 建立 20,000+ 景點目錄
#   bash make-v7.sh              全部（可中斷，重跑會接續）
#   bash make-v7.sh wikidata     只抓景點資料並建立目錄（不下載空拍素材）
# 只讀取公開資料、不需帳號、不會上傳任何東西。需要 python3（macOS 內建或 https://www.python.org/downloads/ ）。
set -uo pipefail
cd "$(dirname "$0")"
command -v python3 >/dev/null 2>&1 || { echo "✗ 找不到 python3"; exit 1; }
steps="${*:-all}"
echo "▶ 1/2 下載資料：python3 studio/aero_fetch.py $steps"
python3 studio/aero_fetch.py $steps || echo "! 有部分資料沒有抓完（上面有說明）；再執行一次會從中斷處接續。"
if [ -f studio/work/wikidata_places.jsonl ]; then
  echo; echo "▶ 2/2 建立世界景點目錄"
  python3 studio/build_catalogue.py || exit 1
  echo; echo "下一步："
  echo "  本機預覽      ./start.command   （或 bash start.sh）"
  echo "  上傳到網站    bash upload-aero-v7.sh --dry-run   → 確認後  bash upload-aero-v7.sh"
  echo "  錄製導覽影片  python3 studio/studio.py --list    → python3 studio/studio.py"
else
  echo "✗ 還沒有 studio/work/wikidata_places.jsonl；請確認網路後再執行一次  bash make-v7.sh"; exit 1
fi
