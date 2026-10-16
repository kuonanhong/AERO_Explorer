# AERO Explorer v6 · Real World

**繁體中文** · [English](#english)

在 2,776 個世界目的地（台灣 1,509 處），用真實地形、真實衛星影像、OpenStreetMap 建物與道路、真實天氣與太陽／月亮位置，駕駛無人機、輕航機、快艇、汽車、地面機器人與水下無人機。手機、平板、筆電、桌機（Windows / macOS / Linux / Android / iOS / iPadOS）都能用，介面 40 種語言、依觀看者所在地自動選擇。

## v6 新增
| 項目 | 內容 |
|---|---|
| 畫面配置 | 3D 畫面全寬、佔螢幕高度 85% 以上；左手 W A S D（升降與轉向）、右手方向鍵（前後與橫移）與控制鍵在畫面正下方（Mode 2，同 v5.1）。電腦可用鍵盤或滑鼠按畫面上的鍵；手機、平板預設觸控搖桿（設定可改方向鍵）。橫向手機控制鍵浮在畫面底部，畫面保持全高。 |
| 廣角 | 視野預設 100°（60–130° 可調），可開超廣角魚眼；拖曳畫面可環顧上下左右，滾輪或兩指縮放。 |
| 開啟即飛 | 預設直接到「日月潭伊達邵碼頭」、上午、晴朗少雲，按「開始飛行」（空白鍵）自動起飛到約 3 m。 |
| 時辰 | 現在（當地時間）、清晨日出（太陽在東，並以真實地形計算太陽越過山稜的時刻，正對太陽會刺眼、有光暈與鏡頭鬼影）、上午、正午、下午、黃昏（太陽在西）、滿月夜（依天文算出滿月日與月亮最高時刻，微弱藍色月光）、無月夜。另有分鐘級時間滑桿。 |
| 天候 | 即時天氣（Open-Meteo）、晴朗無雲、晴朗少雲（雲隨風飄、地面有移動雲影）、多雲時晴、多雲、陰天、小雨、大雨、雷雨（閃電與延遲雷聲）、霧、強風、下雪；風速、陣風、浪高同時影響飛行與船艇。 |
| 季節 | 今天、春、夏、秋、冬（南半球自動相反）：植被顏色、落葉樹、雪線依日期與緯度變化。 |
| 後處理 | HDR 光暈（太陽、月亮、夜間窗燈、水面反光）、太陽遮蔽判斷（地形／建物／雲）、眩光與鏡頭鬼影、相機曝光與白平衡、雨滴落在鏡頭、夜間感光雜訊、暗角、水下色偏與焦散、魚眼。 |
| 寫實地景 | 依衛星影像判斷森林位置種下 3D 樹（高山為針葉林）；屋頂、水面、雲影、濕地面、雪地；夜間建物窗燈；汽車與地面機器人夜間頭燈、水下無人機探照燈。 |
| 載具 | 多旋翼（N / S / A 模式、120 m 與風速警示）、輕型固定翼、快艇（真實浪高）、汽車（道路摩擦）、**地面機器人 UGV**、**水下無人機 ROV**（水面、海床、最大深度）。 |
| 任務 | AERO v5.1 的 30 個情境（空中、陸地、水域各 10 個；初級／進階／專家 3／4／5 站；計分：目標 70、穩定 20、效率 10）改到真實地形上；另有「實景照片點」（Wikimedia Commons 真實照片與你的畫面並排比對）與「環繞光環」。 |
| 按鍵 | F 拍照、G 投放浮標、C 我在哪裡（座標、航向、離目的地方向、附近目的地）、B 景點故事（觀光署資料＋觀看者語言的維基百科＋附近照片）、V 視角、空白鍵 開始／暫停、R 重置、M 飛行模式、T 切換時辰、P 設定、H 說明、Z／X 雲台。 |
| AI 助教 | 回答學徒問題並引用當下飛行資料（地點、天氣、載具、任務、法規）：裝置上模型（Qwen2.5 0.5B 多語、SmolLM2 135M 英文，按下才下載），或用自己的 Claude／OpenAI／Gemini 金鑰（只存在該瀏覽器），或不用 AI 的內建導覽。 |
| 語言 | 40 種：繁中、简中、English、日本語、한국어、Tiếng Việt、ไทย、Indonesia、Melayu、Filipino、ខ្មែរ、မြန်မာ、हिन्दी、বাংলা、मराठी、தமிழ்、తెలుగు、اردو、العربية、فارسی、עברית、Türkçe、Русский、Українська、Polski、Čeština、Română、Magyar、Ελληνικά、Deutsch、Nederlands、Dansk、Svenska、Norsk、Suomi、Français、Español、Italiano、Português、Kiswahili。依瀏覽器語言，其次依時區自動選擇；設定可改。阿拉伯文等右至左語言自動鏡像。 |
| 離線 | PWA：第一次開啟後，程式本體可離線啟動；地圖、天氣與 AI 仍需網路。 |

## 開始使用
- **線上**：`https://kuonanhong.github.io/AERO_Explorer/`（上傳後）。網址可帶地點與載具，例如 `#tw-376550000a_003128/drone`，或任務 `#mission/air-gates/beginner`。
- **本機**：解壓縮後執行 `start.sh`（Linux）、`start.command`（macOS 雙擊）、`start.bat`（Windows 雙擊）。需 Python 3 或 Node.js，會開啟 `http://localhost:8080/`。
- **單一檔案**：`standalone/AERO_RealWorld_Sim.html` 直接雙擊即可（程式庫走 CDN）。

## 上傳更新（`upload-aero-v6.sh`）
```bash
bash upload-aero-v6.sh --dry-run          # 只列出會上傳什麼
bash upload-aero-v6.sh                    # 比對 SHA-256，只上傳修改或新增的檔案，確認一次後推送
bash upload-aero-v6.sh --yes              # 不詢問（排程或 CI）
bash upload-aero-v6.sh --fetch-models     # 下載兩個預設 AI 模型到 models/（固定版本、SHA-256 驗證）
bash upload-aero-v6.sh --models-only --hf-repo <帳號>/AERO-models --set-model-base   # 上傳模型／權重到 Hugging Face，並把鏡像網址寫入 config.js
bash upload-aero-v6.sh --models-to r2 --r2-account <ID> --r2-bucket aero-models --r2-public-url https://models.example.org
```
- 需要 git；建議先 `gh auth login`（GitHub CLI）或設定 SSH 金鑰。腳本使用專用 clone（`~/.cache/aero-upload/`），中斷後再執行會接續；推送失敗自動重試並同步。
- 第一次上傳時，原本 v5.1 的 `index.html` 會保留為 `classic-v5.html`（設定裡有連結），舊的 `README.md` 保留為 `README_v5.md`；網站上已有的 `config.js`（v5.1 的設定）不會被覆蓋，只會同步 `aiModelBase`。
- 檔案會分批（每批約 20 MB，可用 `AERO_BATCH_MB=10 bash upload-aero-v6.sh` 調整）提交與推送，並自動設定 `http.postBuffer` 與 HTTP/1.1，避免 `RPC failed; HTTP 400 … unexpected disconnect` 這類大型推送錯誤。上傳中斷時直接再執行一次即可，未推送的部分會從你的資料夾重新整理後接著傳。
- 單檔超過 100 MB 不會送到 GitHub；模型與權重放 `models/`，只會送到 Hugging Face 或 R2/S3，並檢查不可含金鑰檔、不可是 Git LFS 指標檔、需有 `models/README.md` 說明來源與授權。
- `--prune` 只會刪除先前 v6 上傳過、而你已在本機刪掉的檔案。
- 網站裡沒有任何 API 金鑰；學徒在 AI 助教輸入的雲端金鑰只存在他自己的瀏覽器。

## 資料來源與授權
衛星影像 © Esri, Maxar, Earthstar Geographics（Esri World Imagery，流量大或商業用途請確認 Esri 條款）；地形 AWS Terrain Tiles（Terrarium，含 SRTM、GMTED 等來源）；建物、道路、水域 © OpenStreetMap contributors（ODbL），向量圖磚 OpenFreeMap；天氣與海況 Open-Meteo（CC BY 4.0）；照片與條目 Wikimedia Commons／Wikipedia（各檔授權，條目 CC BY-SA）；台灣景點資料 交通部觀光署（政府資料開放授權條款）；世界遺產 UNESCO。程式庫：three.js（MIT）、3d-tiles-renderer（Apache-2.0）、transformers.js（Apache-2.0）、ONNX Runtime（MIT）；模型 Qwen2.5、SmolLM2（Apache-2.0）；AERO（MIT）。可選的 Google Photorealistic 3D Tiles 需使用者自己的金鑰並適用 Google 條款。

## 誠實說明
地形是約 10–30 m 解析度的高程資料加衛星影像；建物是 OSM 的高度與輪廓配上程序化外牆；樹是依影像顏色推估。想看到真實立體建物，可在設定貼上自己的 Google Map Tiles API 金鑰。天候預設是視覺與物理上的近似，「即時天氣」才是當地實測。物理模型為訓練用的簡化版本。

---

<a id="english"></a>
# English

Fly a drone, light aircraft, speedboat, car, ground robot or underwater drone at 2,776 destinations (1,509 in Taiwan) over real terrain, satellite imagery, OpenStreetMap buildings and roads, with the real sun, moon and weather. Runs on phones, tablets, laptops and desktops; 40 UI languages chosen from the viewer's browser language (then time zone).

**Highlights** — 3D view ≥ 85% of the screen height with Mode 2 pads below it (left W A S D: climb/turn, right arrows: forward/slide); 100° wide view, optional fisheye, drag to look around; starts ready to fly at Sun Moon Lake (morning, few clouds). Time presets (now, sunrise with terrain-aware sun and lens glare, morning, noon, afternoon, sunset, full-moon night, moonless night), 4 seasons + today, 11 weather presets + live weather, cinematic post-processing, 3D trees from imagery, 6 vehicles, the 30 AERO scenarios on real terrain plus real-photo spots and ring circuits, F photo · G buoy · C where am I · B place story, and an AI tutor (on-device Qwen2.5/SmolLM2, or your own Claude/OpenAI/Gemini key, or a built-in guide).

**Run** — online on GitHub Pages; locally with `start.sh` / `start.command` / `start.bat`; or open `standalone/AERO_RealWorld_Sim.html` directly.

**Upload** — `bash upload-aero-v6.sh` (see `--help`): SHA-256 diff, only changed/new files pushed in ~20 MB parts (HTTP/1.1, large post buffer), resumable dedicated clone, retries, keeps v5.1 as `classic-v5.html` / `README_v5.md` and the site's existing `config.js`, enables Pages; models/weights from `models/` go to Hugging Face or R2/S3 (never GitHub Pages) and `--set-model-base` points the tutor at your mirror. No API keys are ever stored in the site.

**Data & licences** — see the Chinese section above (Esri World Imagery, AWS Terrain Tiles, OpenStreetMap/OpenFreeMap, Open-Meteo, Wikimedia, Taiwan Tourism Administration, UNESCO; three.js, 3d-tiles-renderer, transformers.js, ONNX Runtime, Qwen2.5, SmolLM2, AERO MIT).
