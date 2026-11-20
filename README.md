# AERO Explorer v7 — 真實世界無人機模擬飛行 · 兩萬個以上景點 · 每個景點的五分鐘導覽

網站：https://kuonanhong.github.io/AERO_Explorer/ ・ 原始碼：https://github.com/kuonanhong/AERO_Explorer

## v7 新增了什麼
- **導覽影片（每部 5 分鐘）**：每個景點的「景點故事」（鍵盤 **B**，或起始畫面的「▶ 導覽影片」）最上方列出導覽。
  按「播放」後，模擬器依腳本在**真實地形、衛星影像、OpenStreetMap 建物、當地太陽／月亮／季節／天氣**上自動運鏡（環繞、拉升揭示、飛越、俯視、推近、橫移…），
  搭配字幕、程式合成的配樂與可關閉的旁白（使用觀看者裝置的語音）。
  - **專題導覽**：10 個精選景點各 4 部，共 40 部，腳本逐句依查證來源撰寫（來源列在 `data/tours/<景點>.json` 的 `sources`）。
    1 蒜頭生態公園（四個題材：土地的深呼吸／時光的軌道／上帝的調色盤／尋光之蛙）2 太魯閣 3 日月潭 4 清水斷崖 5 龜山島 6 九份 7 合歡山 8 中正紀念堂 9 野柳 10 三仙台
  - **自動導覽**：其餘每個景點自動產生 3–6 部（總覽、地形與地理、歷史、人文、自然、周邊巡禮、飛行前簡報）。
    運鏡依該地真實地形計算；字幕取自該景點的維基百科條目（觀看者的語言，CC BY-SA，片尾標示）、Wikidata 簡介、景點目錄與現場計算的數據。
  - 播放列：播放／暫停（空白鍵）、上一／下一鏡頭（← →）、字幕 中／EN（C）、旁白（N）、配樂（M）、**錄影（R）**、離開（Esc）。網址 `#<景點>/tour/<導覽>` 可直接分享。
- **世界景點目錄 20,000+**：原有 2,777 個目的地之外，由 Wikidata（CC0）整理兩萬多個世界名勝古蹟與自然景觀，含 40 種語言的名稱；
  進站後背景載入，選單可搜尋、依類型篩選、依距離或知名度排序。每個景點都用同一套真實地形與影像合成，擬真程度相同。
- 畫面是即時合成的模擬畫面，不是實拍；片中與片尾都有標示。實際飛行前請用民航局「Drone Map」等官方管道查詢並遵守空域規定。

## 第一次使用（在這台電腦的終端機）
```bash
cd "<這個資料夾>"
bash make-v7.sh                      # 1. 下載世界景點資料與蒜頭空拍素材，建立 20,000+ 景點目錄（可中斷、可重跑）
./start.command                      # 2. 本機預覽（或 bash start.sh）
bash upload-aero-v7.sh --dry-run     # 3. 看看會上傳什麼；確認後： bash upload-aero-v7.sh
python3 studio/studio.py --list      # 4. 要把導覽錄成影片檔： python3 studio/studio.py
```
- `make-v7.sh` 只讀公開資料（Wikidata、觀光署開放資料、公開的 Google 雲端硬碟資料夾），不需帳號，也不會上傳任何東西。
  景點資料約 10–20 分鐘；空拍素材視檔案大小而定，存到 `無人機空拍題材/蒜頭素材ㄧ/`。只要景點資料：`bash make-v7.sh wikidata`。
- 沒有先建立目錄也能上傳，網站會顯示 2,777 個目的地與全部導覽；建立後再上傳一次即可。

## AERO Studio：把導覽錄成影片
`python3 studio/studio.py` 會在本機開一個 Chrome 視窗，逐部飛完導覽並錄影（畫面含片名、字幕、片尾與配樂），存到 `tours_out/`。
每部約 6–7 分鐘（先預載場景，再即時錄 5 分鐘），40 部約 4.5 小時；可中斷，重跑會跳過已完成的。錄影期間請保持連網、視窗不要最小化。
- `--only suantou`（只錄某景點）、`--tour t1`、`--langs zh-Hant,en`（另錄英文字幕版）、`--size 1920x1080 --mbps 8`、`--list`。
- 錄好的影片會出現在本機網站該景點的「景點故事」裡（「影片」按鈕）。要放到公開網站：把影片上傳到 YouTube 或其他空間後，
  在 `data/tours/media.json` 的 `items` 寫入 `"<景點id>/<導覽id>": {"zh-Hant": "<YouTube 影片 id 或影片網址>"}` 再上傳網站。
  GitHub Pages 單檔上限 100 MB、整站建議 1 GB 以內，40 部 5 分鐘影片不適合直接放進同一個儲存庫。
- 公開分享的影片只含字幕與程式合成的配樂，不含系統語音。

## 資料與授權
影像 © Esri, Maxar, Earthstar Geographics（World Imagery）・地形 AWS Terrain Tiles（Mapzen/Tilezen）・建物與道路 © OpenStreetMap 貢獻者／OpenFreeMap・
天氣 Open-Meteo・景點名稱與簡介 Wikidata（CC0）・條目文字 維基百科（CC BY-SA）・照片 Wikimedia Commons（各檔授權）・台灣景點 交通部觀光署開放資料。
網站不含任何 API 金鑰；AI 導師的雲端金鑰只存在各使用者自己的瀏覽器。內容為民用、教育用途。

## 檔案
`index.html`、`app/aero-v7.js`（主程式）、`data/places.json`（2,777）、`data/catx/`（世界目錄，由 `studio/build_catalogue.py` 產生）、
`data/tours/`（專題導覽腳本與影片清單）、`i18n/`（40 種語言；v7 新增的導覽文字目前有繁中、簡中、英文，其他語言暫以英文顯示）、
`studio/`（`aero_fetch.py` 下載資料、`build_catalogue.py` 建目錄、`studio.py` 錄影）、`upload-aero-v7.sh`（上傳）、`standalone/`（v6 單檔離線版，未含 v7 功能）。

---
**English summary.** v7 adds five-minute guided aerial tours flown live over the real scene for every destination (40 researched films at 10 featured
places in Taiwan, automatic tours everywhere else), a world catalogue of 20,000+ sights built from Wikidata, an in-browser recorder and a batch
recorder (`studio/studio.py`). Run `bash make-v7.sh`, preview with `./start.command`, publish with `bash upload-aero-v7.sh`.
