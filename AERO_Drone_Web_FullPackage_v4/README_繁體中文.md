# AERO v4 海陸空探索模擬器：操作與 SmartAction 部署教學

版本：4.0；文件查核：2026 年 10 月 9 日（臺灣）。目標網址：[https://kuonanhong.github.io/SmartAction/games/aero/](https://kuonanhong.github.io/SmartAction/games/aero/)。

本套件將飛行視窗、雙手操作區、地圖及景點介紹分開，適合放入 SmartAction 的「動手動腦」區。您可以直接複製已建好的網站，不必先安裝 Node.js。**這份交付不表示已登入或修改您的 GitHub repository**；依下列步驟推送後才會更新您的 github.io 網頁。

## 1. 先選擇正確的檔案

| 套件內容 | 使用方式 |
|---|---|
| `SmartAction/games/aero/` | 已建好的完整靜態網站；把內容複製到 SmartAction repository 的 `games/aero/` |
| `AERO_Explorer_v4.html` | 單檔版：HTML、程式、樣式及內附素材整合；適合直接開啟示範 |
| 專案根目錄的 `dist/` | 可重新建置的網站輸出；開發修改後由建置工具更新 |
| `dist/game.js`、`scene.js`、`physics.js` 等 | 可維護的模組化原始碼；不要只修改壓縮過的 bundle |
| `dist/assets/photos/` | 14 張已下載的照片、作者授權頁及素材 manifest |
| `tools/`、`tests/` | 建置工具、單元及瀏覽器測試、容量測試範例 |
| `backend/weather-worker/` | 可選的共用天氣快取後端；GitHub Pages 本身不執行後端 |

直接開啟單檔版即可試玩本機模擬。GPS、Google 地圖、Wikipedia 搜尋及可選天氣仍需要網路及相應瀏覽器許可；離線時不會變成即時實景。正式發布建議使用 `SmartAction/games/aero/` 的多檔版本，讓 3D 引擎及照片按需載入。

## 2. 操作：視野、雙手控制與四個新增按鈕

手機的地點名稱、狀態、說明及故事放在飛行視窗外；地圖與導覽在頁面下方。可以捲動查看，按「開始／繼續」回到操作。桌面可展開設定，手機先保留精簡設定。教學視窗只在查看教學時出現。

| 控制 | 鍵盤 | 手機／平板 | 動作 |
|---|---|---|---|
| 左手上下 | `W`／`S` | 左搖桿上下 | 空中升降；水中上浮／下潛；陸地維持地面高度 |
| 左手左右 | `A`／`D` | 左搖桿左右 | 左轉／右轉 |
| 右手上下 | `↑`／`↓` | 右搖桿上下 | 前進／後退 |
| 右手左右 | `←`／`→` | 右搖桿左右 | 左右橫移 |
| 左手附加 1 | `F` | 拍照 | 下載目前模擬畫面的 PNG，並為已選目的地加入旅行紀錄 |
| 左手附加 2 | `G` | 投放浮標 | 投放可觀察落下／漂浮的標記；最多同時 8 個，約 20 秒消失 |
| 右手附加 1 | `C` | 我在哪裡？ | 暫停，顯示下方地圖與目前模擬座標 |
| 右手附加 2 | `B` | 景點故事 | 暫停，開啟下方地點介紹與來源 |
| 視角／暫停／重置 | `V`／空白鍵／`R` | 對應畫面按鈕 | 第一／第三視角、暫停、回起始位置 |

輸入目的地或對話文字時，控制快捷鍵不會搶走文字輸入。背景分頁或視窗失去焦點時會暫停，避免載具持續移動。

新增互動包含投放浮標與旅行紀錄；紀錄只存於這個瀏覽器的本機儲存，不是雲端照片備份。PNG 是您下載的模擬畫面。Google 實景使用不同的跨來源畫面，拍照功能不會將它偽裝成可下載的本機畫布。

## 3. 第一視角、3D 與海陸空變形

標準／完整 WebGL 版提供真正的透視相機、模型移動及近處物件視差。第一視角加入 **0.05 強度的輕微魚眼效果**；這是畫面畸變參數，不是「人眼視野增加 5 度」或光學校正值。第三視角保留共享的載具核心，空中呈現旋翼、地面呈現車輪、水中呈現潛航外形。

輕量版使用 Canvas 2D 與寬視角透視表現，省下 WebGL 與後處理負擔。它的立體感與完整 3D 不相同。若裝置無 WebGL、效能不足、持續低幀率或 WebGL context 中斷，遊戲會降級；硬體資源提示不能精確量出尚可用的 RAM／VRAM。

適用範圍為具備所需 JavaScript、Canvas、觸控或鍵盤功能的現代瀏覽器，可在 Windows、macOS、Linux、Android、iPhone／iPad 上使用。舊 iPod touch、過舊系統、記憶體不足及受到企業限制的瀏覽器不能保證正常執行。遇到問題先改輕量版、關閉其他大量佔用資源的分頁並重新載入。

## 4. 地圖、目前位置與目的地搜尋

開啟網頁後，預設會向瀏覽器請求位置許可。若允許，使用 `navigator.geolocation` 取得座標與誤差估計；**不是透過 IP 推測精確地址**。桌機位置精度可能較低。拒絕、逾時或無定位能力時，使用明確標示的高雄示例，仍能輸入目的地或手動座標。

畫面顯示兩種不同意義的數值：起點可来自裝置定位；之後的「模擬位置」隨載具操作改變。坐在椅子上飛到黃石公園，不代表您的實體裝置已移動。位置不寫入本機儲存，遊戲不建立位置追蹤帳戶。

可輸入「飛去美國黃石公園」「台灣宜蘭太平山」「翠峰湖」「飛去台北故宮看展覽」，也可輸入 `25.1024,121.5485`。程式先比對內附的多語名稱及別名，沒有符合項目才查詢 Wikipedia；多項結果由您選擇。沒有座標或找不到的項目不會擅自生成一個位置。搜尋不是完整全球地理編碼服務，過長的自然語句可改為清楚的地名。

附近功能保留 13 處高雄內附資料，並能請求附近百科條目。Wikipedia 回傳最多 6 個、10 公里內帶地理座標的條目，未必全都是觀光景點或餐廳；查詢失敗時回到內附資料。網路結果會顯示資料來源，故事不代表即時開館、票務、現場展品或飛行許可。

導覽框支援「歷史／特色／附近景點／地方美食」及目的地輸入。這是依既有來源與規則提供的導覽，沒有暗中串接付費生成式 AI。美食按鈕開啟該座標附近的 Google 餐廳搜尋，不宣稱某家餐廳現在營業或一定值得推薦。

地圖在下方顯示；模擬座標持續更新，嵌入地圖只在距上次更新 **至少 15 秒且位移至少 50 公尺** 時重新載入。切換目的地、切換語言或手動置中可立即更新。這樣能减少重繪、網路請求與移動時的閃動。

## 5. 為什麼玩家現在不必輸入 Google API Key？

| 路徑 | 本版安排 | 需要誰的 Key |
|---|---|---|
| 預設位置地圖 | Google 消費者地圖相容 iframe，`q=座標&output=embed` | 玩家不需要 |
| 「在 Google 地圖開啟」 | 官方 Maps URLs：`api=1` 的跨平台連結 | 不需要 |
| 正式 Maps Embed API | 網站擁有者選擇啟用，可替換預設 iframe | 擁有者的一次性設定；玩家不需要 |
| Google 3D／街景 SDK | 保留可選介面，需網站擁有者開通 | 擁有者 Key、API、帳務及相應額度 |

預設相容 iframe 已實際取得 Google 的地圖初始化回應，但它不是目前 Google Maps Platform 文件承諾的正式 Embed API，沒有本套件可保證的 SLA。若瀏覽器、地區、網路或 Google 變更使它無法顯示，使用旁邊正式的「在 Google 地圖開啟」連結。iframe 載入事件也不能單獨證明圖磚完整呈現。本次測試環境的瀏覽器未能載入 Google 圖磚；HTTP 回應與座標連結已核對，實際外部地圖繪圖及 Wikipedia 瀏覽器連線仍須在發布環境確認。

目前正式 Maps Embed API 是免費且不限請求量的產品，仍須啟用 API、有效 Key 及完成 Google Cloud 設定。Google 3D、動態街景及 Places 查詢另有條件與計費；不能因 Embed 免費就視為全部 SDK 免費。這次沒有使用您的私人 Key 驗證付費服務。

若要正式 Embed，在網站資料夾的 `config.js` 設定 `googleEmbedKey`；修改原始專案則編輯 `dist/config.js` 再重新建置：

```js
globalThis.AERO_CONFIG = Object.freeze({
  googleMapsKey: '',       // 只在啟用 Google 3D／街景 SDK 時填寫
  googleEmbedKey: '',      // 可選：網站擁有者的正式 Maps Embed Key
  autoLocate: true,
  weatherEndpoint: '',
  autoNearby: true,
  initialOrigin: {lat: 22.64954, lon: 120.35363, altitude: 20}
});
```

瀏覽器地圖 Key 必然可被瀏覽器看到，請在 Google Cloud 加上**網站來源限制及 API 限制**；不要當成不可見的伺服器密鑰。設定您的 `https://kuonanhong.github.io` 網站來源，依 Google 控制台的格式加入允許的 referrer。不要貼入別人的 Key、OAuth secret、私鑰或付費服務的伺服器 token。不要將 Google 圖磚下載、重包或加入遊戲的離線快取。

## 6. 真實照片、360° 與博物館藏品

本版內附 **14 張照片，合計 3,076,900 bytes（約 3.08 MB）**，已轉成 WebP 並隨套件提供。包括老忠實間歇泉、大稜鏡溫泉、見晴懷古步道、蹦蹦車、翠峰湖、臺北故宮、翠玉白菜、肉形石、澄清湖、鳳儀書院、衛武營，以及兩張 360° 全景。澄清湖另附標明 1973 年的歷史照片，不能拿它當成現在景況。

兩張真實 360° 全景的位置分別為：

| 全景 | 套件所用座標 |
|---|---|
| 奧地利蒂羅爾凱撒山脈森林 | `47.534823, 12.282477` |
| 苗栗竹南博愛公園 | `24.684586, 120.871273` |

360° 圖像可轉頭觀看周圍，但它是拍攝地點的球面影像，不會因為向前移動就提供新的實測三維幾何。普通照片採影像背景／展示方式，不能當作任意方向的實測 3D 建築模型。程序產生的近處物件可以有 3D 視差，但不代表已重建整個景點。

照片採 public domain、CC0、CC BY 或 CC BY-SA 等逐張核對的授權。請一併保留 `assets/photos/PHOTO_CREDITS.html`、manifest 與授權文字，沿用照片時保留作者、來源、授權連結與 WebP／縮圖等修改說明。CC BY-SA 的衍生照片須遵守相同授權條件；程式碼的授權和照片授權分開。

沒有把 Google 圖片搜尋的預覽圖直接當成可任意再利用的素材。故宮藏品照片只說明物件，不代表現在正於故宮某一展廳展出。水下魚群、礁石及湖底是模擬；淡水湖與海洋生態分開，未宣稱是水下測繪或 Google 湖底實景。

## 7. 多國語言與位置資料傳送

介面及內附目的地內容提供 22 語系：繁體中文、簡體中文、英文、日文、韓文、阿拉伯文、馬來文、泰文、越南文、印尼文、菲律賓文、德文、波蘭文、捷克文、葡萄牙文、芬蘭文、瑞典文、俄文、法文、西班牙文、義大利文、印地文。

第一次使用依瀏覽器語言偏好選擇；`zh-TW`／`zh-HK` 對應繁體、`zh-CN` 對應簡體，`tl` 對應菲律賓文。已手動選擇的語言優先。這比用所在地國家強制語言更適合旅客；訪客隨時可改語言。Wikipedia 動態條目依可用語系查詢，不等於對每一段網路內容都有人工翻譯。

當地圖載入時，地圖座標會傳給 Google。允許定位並啟用附近搜尋時，起點座標會傳給 Wikipedia；設定且使用 Google Places 才會依該服務流程請求 Google。停用自動行為可將 `autoLocate` 或 `autoNearby` 改為 `false`。GPS 授權必須由瀏覽器詢問，網站不能繞過；拒絕後仍可選目的地。

Wikipedia 請求設有 8 秒逾時、5 分鐘記憶體快取、最多 64 筆快取；限流或斷線不生成假結果。Google 地圖和動態百科不列入自有素材的 Service Worker 快取。主站沒有用本套件建立玩家帳號或上傳個人照片。

## 8. Mac／Linux：直接部署到現有 SmartAction

先解壓完整套件，找到其中 `SmartAction/games/aero/index.html`。以下假設您把套件解壓到 Downloads；請把 `YOUR_NAME` 及實際資料夾名稱改為自己的。不要把整個 ZIP 丟進網頁根目錄當作遊戲網站。

如果尚未下載 SmartAction repository：

```bash
cd ~/Documents
git clone https://github.com/kuonanhong/SmartAction.git
cd SmartAction
git status
```

如果已經有 SmartAction 的本機 clone，直接 `cd` 到該資料夾；先用 `git status` 確認目前自己的修改，不要覆蓋或丟棄尚未保存的工作。

複製遊戲。這個步驟不需要 Node.js，也不會改動其他網站資料夾：

```bash
AERO_PACKAGE="/Users/YOUR_NAME/Downloads/AERO_Drone_Web_FullPackage_v4"
mkdir -p games/aero
rsync -av "$AERO_PACKAGE/SmartAction/games/aero/" games/aero/
```

編輯主站 `index.html`，在您規劃的「動手動腦」區加入：

```html
<a href="games/aero/">海陸空探索模擬器 AERO</a>
```

若連結放在 `en/index.html` 等語言子目錄，請改成 `../games/aero/`；若放在其他更深的子目錄，依路徑調整相對位置。無需為了放遊戲而覆蓋 SmartAction 原本的整份首頁或 GitHub Actions workflow。

核對、提交、同步及上傳：

```bash
git status
git add games/aero index.html
git diff --cached --stat
git commit -m "Add AERO v4 sea land air explorer"
git pull --rebase
git push
```

`git pull` 是把 GitHub 上的新版本取回並整合；真正上傳的是 `git push`。從 `git clone` 建立的分支通常已有 upstream，所以以上不必硬寫 `main`。若遠端使用 `master`，不要為了套用教學自行改掉遠端分支。

GitHub 若要求登入，使用 GitHub Desktop 或 Git Credential Manager 的瀏覽器登入流程；不要把 GitHub 密碼或 personal access token 寫入 `config.js`、HTML、remote URL 或公開 Git。GitHub 網站不接受以帳戶密碼作 HTTPS Git 認證。

## 9. Windows：PowerShell 複製與發布

先安裝 Git for Windows，並把 ZIP 解壓。開啟 PowerShell：

```powershell
Set-Location "$env:USERPROFILE\Documents"
git clone https://github.com/kuonanhong/SmartAction.git
Set-Location SmartAction
git status

$aeroPackage = 'C:\Users\YOUR_NAME\Downloads\AERO_Drone_Web_FullPackage_v4'
New-Item -ItemType Directory -Path 'games\aero' -Force | Out-Null
Copy-Item -Path "$aeroPackage\SmartAction\games\aero\*" -Destination 'games\aero' -Recurse -Force
```

用文字編輯器修改主站 `index.html`，加入上一節的遊戲連結。然後：

```powershell
git add games/aero index.html
git diff --cached --stat
git commit -m "Add AERO v4 sea land air explorer"
git pull --rebase
git push
```

若已有本機 SmartAction，從該資料夾開始，不必重複 clone。無論哪個系統，若 `git pull --rebase` 出現衝突，先執行 `git status`，編輯有衝突的檔案，保留正確內容後 `git add 該檔案`、`git rebase --continue`。不確定時可 `git rebase --abort` 回到 rebase 前狀態，再人工整理；不要使用 `git push --force` 當作一般解法。

## 10. GitHub Pages 設定與發布後檢查

您的 SmartAction 已有公開網站，先沿用其發布設定。到 repository 的 **Settings → Pages** 檢查目前的來源：

1. 若是從某分支的根目錄發布，`games/aero/` 就放在該根目錄。
2. 若從 `/docs` 發布，遊戲須放在 `docs/games/aero/`，首頁連結仍是發布後的 `games/aero/`。
3. 若使用 GitHub Actions，確認原有 workflow 打包的網站目錄包含新增遊戲；不要用這份獨立專案的 workflow 覆蓋既有主站流程。

推送後查看 **Actions** 或 **Pages deployment** 是否成功。成功後開啟：

```text
https://kuonanhong.github.io/SmartAction/games/aero/
https://kuonanhong.github.io/SmartAction/games/aero/en/
https://kuonanhong.github.io/SmartAction/games/aero/zh-Hant/
```

用手機直式、手機橫式與電腦各測一次：載入遊戲、定位拒絕／允許、地圖、目的地搜尋、兩手同時操控、F/G/C/B、第一／第三視角及海陸空切換。若看到舊畫面，先硬重新整理，必要時在瀏覽器的網站資料設定清除這個站的快取；這也可能刪除本機語言、紀錄與成績。

若頁面 404，確認 `index.html` 直接位於發布目錄的 `games/aero/`，不是多包了一層套件資料夾。若只有圖片 404，檢查檔名大小寫、`assets/photos/images/` 是否完整，以及是否漏傳空白／中文資料夾內檔案。

SEO 的 canonical、hreflang、sitemap 已可由建置工具依目標網址產生。它有助於搜索引擎辨識頁面，但不保證 Google 排名、AI 搜尋引用或收錄時間。`games/aero/robots.txt` 不能取代主站根目錄的 robots.txt；可由主站根目錄額外列出遊戲的 sitemap。

## 11. 修改原始碼後重新建置

這一節只在您要改程式、翻譯或素材時使用。請在套件的**原始專案根目錄**執行，也就是有 `package.json` 的資料夾；不要在 SmartAction 首頁資料夾盲目執行，以免使用錯的專案。

需要 Node.js 20 或較新版本及 npm。Mac／Linux：

```bash
npm ci
npm test
AERO_ORIGIN="https://kuonanhong.github.io/SmartAction/games/aero" npm run build
```

Windows PowerShell：

```powershell
npm ci
npm test
$env:AERO_ORIGIN = 'https://kuonanhong.github.io/SmartAction/games/aero'
npm run build
Remove-Item Env:AERO_ORIGIN
```

建置會更新 `dist/game.bundle.js`、按需載入的 3D bundle、22 語系頁面、SEO 檔案、Service Worker、大小報表及 `dist/standalone.html`。將新 `dist/` 的內容複製到您的 SmartAction `games/aero/` 再提交。若只是直接編輯 ready-to-deploy 版本的 `config.js`，網站可使用新設定；但已生成的單檔 HTML 仍需要重新建置才會包含新設定。

本機可使用 Python HTTP server：

```bash
python3 -m http.server 8080 --directory dist
```

Windows 的 Python Launcher 通常使用：

```powershell
py -m http.server 8080 --directory dist
```

瀏覽 `http://localhost:8080/`；停止伺服器用 Ctrl+C。手機透過區域網路的普通 HTTP 位址開啟時，GPS 可能因非 secure context 無法使用；正式 HTTPS Pages 比較適合定位驗證。

`npm test` 是自動化邏輯／資料檢查。`npm run test:browser` 另需要測試程式所述的 Playwright／Chromium 環境；瀏覽器自動化結果不等於已覆蓋所有實體 iPhone、Android 或 GPU。最終交付的驗證紀錄請一併閱讀。

## 12. 大檔、Git LFS 與 10 萬人的容量規劃

GitHub 目前一般 Git 單檔超過 50 MiB 會警告，超過 100 MiB 會阻擋；網頁上傳單檔上限是 25 MiB。Pages 原始庫建議保持在 1 GB 以內，**這是來源 repository 的建議值**；已發布網站不得超過 1 GB，月流量有 100 GB 軟上限，也可能限流。[GitHub Pages 限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)、[GitHub 大檔說明](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)。

**Git LFS 不能用作 GitHub Pages 的網站素材供應方式。** LFS 在 Git 裡是指標檔；不要把正在遊戲內載入的圖片或模型移去 LFS 後期待 Pages 自動取回。大型可下載 ZIP 可放 Releases；大量執行時素材可用有授權、可設定 CORS 的物件儲存與 CDN。[官方 LFS 說明](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage)。

本版單張照片很小，沒有必要為這 14 張 WebP 引入 LFS。請不要將 `node_modules/`、`.git/`、Windows Unity 發行檔、Phoenix 安裝程式、整個開發環境或重複版本 ZIP 加進 `games/aero/`。完整套件可留在您的下載備份位置，網站只放運行需要的檔案。

本機檢查大檔範例（只列清單，不刪除）：

```bash
find games/aero -type f -size +50M -print
du -sh games/aero
git status
```

Windows PowerShell：

```powershell
Get-ChildItem games\aero -Recurse -File |
  Where-Object Length -gt 50MB |
  Select-Object FullName,Length
```

每個玩家在自己的裝置做物理與渲染，可以減少集中運算，但**不等於已驗證 10 萬人同時在線，也不等於共享世界多人連線**。網站下載、Google 地圖、百科搜尋及選用的天氣服務都有各自的限制。

例如，若每次冷載入實際傳輸 1 MB，10 萬人一波就是約 100 GB；若每人都載入全部約 3.08 MB 照片，僅照片就約 308 GB。這是十進位概算，不是測速或容量承諾；實際會受壓縮、快取、照片是否進入視窗及重訪影響。

公開推廣前，量測 Network 實際傳輸量、p95 載入時間、錯誤率、429、CDN 命中率及行動裝置幀率。先做小量，再對自己有權管理的靜態資源逐步增加負載；使用套件的容量測試說明。不要對 Google、Wikipedia 或免費天氣服務執行大量壓測。若確定要承載大活動，先向 CDN／儲存供應商確認容量與預算，再測試相應規模；這份靜態程式本身不能提供 hosting SLA。

## 13. 可選天氣後端

`weatherEndpoint` 預設空白，遊戲照常使用模擬風。若網站方部署套件內的 Worker 並填上自己的 endpoint，玩家按「更新天氣」才查詢。詳見 `backend/weather-worker/README.md`，包含部署指令、允許來源及上游授權。

範例以約 0.01 度網格、15 分鐘快取和失敗備用資料減少上游請求，但不同資料中心、不同網格或冷啟動仍可能產生多次請求。不要宣稱 10 萬玩家只要一次免費天氣請求。天氣回應是參考資料，未把真實街谷氣流、水流或各空高風場重建到模擬器中。

如果不需要天氣，保留空白即可。勿將 Open-Meteo 的伺服器 secret 放在前端；商業用途、流量額度及 Cloudflare 方案須由網站擁有者依實際用途選擇。

## 14. 常見問題與驗證界線

| 現象 | 先檢查什麼 |
|---|---|
| Google 地圖空白 | 外部網路／瀏覽器阻擋；按「在 Google 地圖開啟」。正式 Embed 另查擁有者 Key、API、referrer 及帳務 |
| 定位不准或拒絕 | 顯示的 ±誤差、HTTPS、瀏覽器及系統位置權限；可改手動座標 |
| 地圖沒有跟每一幀移動 | 這是 15 秒且 50 m 節流；座標本身持續更新；可按手動置中 |
| 搜尋太長句沒有結果 | 改清楚地名，或使用內附目的地／座標；百科不是完整地理編碼服務 |
| 切到水下仍不是實際湖底 | 水下為程序模擬；一般地表地圖沒有提供該處完整湖底測繪 |
| 全景移動沒有新幾何 | 360° 相片固定於原拍攝地點，能看四周但不是體積影片 |
| 手機較慢 | 選輕量模式，減少背景分頁；不必強制最高畫質 |
| Google 3D 選項不可用 | 需網站擁有者配置 `googleMapsKey` 及服務；預設位置地圖可獨立使用 |
| 主站更新後沒有遊戲 | 看 Pages 發布根目錄／Actions 輸出；確認有 `games/aero/index.html` |

已完成的測試以隨附驗證紀錄為準；此文件不宣稱完成 10 萬人壓測、所有系統真機測試、付費 Google 3D 實景驗證或現場地形測量。原 Unity／Phoenix 安裝檔可作功能參考，不是這份網頁套件可合法直接移植的原始碼或素材來源。

## 官方來源與授權入口

- [Google：分享及嵌入地圖](https://support.google.com/maps/answer/7101463?hl=zh-Hant)
- [Google：免 Key 的跨平台 Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
- [Google：正式 Maps Embed API](https://developers.google.com/maps/documentation/embed/embedding-map)
- [Google：Embed 用量與費用](https://developers.google.com/maps/documentation/embed/usage-and-billing)
- [Google：3D Maps 概覽](https://developers.google.com/maps/documentation/javascript/3d/overview)
- [W3C：Geolocation](https://www.w3.org/TR/geolocation/)
- [MediaWiki：GeoSearch](https://www.mediawiki.org/wiki/API:Geosearch)
- [Wikimedia：API 限流](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits)
- [Wikimedia Commons：外部再使用](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)
- [照片作者與逐張授權](SmartAction/games/aero/assets/photos/PHOTO_CREDITS.html)
- [GitHub：Pages 限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [GitHub：大檔與一般 Git](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)
- [GitHub：Git LFS 的 Pages 限制](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage)

照片、地圖、百科及程式碼各有自己的來源與授權；保留套件內相關檔案，日後替換素材時也逐張核對。
