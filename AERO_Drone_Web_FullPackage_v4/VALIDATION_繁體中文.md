# AERO v4 驗證紀錄

日期：2026-10-08 UTC。平台：Linux／Node 24／Chromium headless；以軟體 WebGL、桌面視窗與手機觸控模擬測試。這不是所有實體手機或作業系統的認證。

## 已通過

- `npm run build`：22 語言、每語233個介面字串；23個 SEO 頁面與單檔HTML。
- `npm test`：原有18項物理／載具行為、9項裝置分級與降級測試、座標與天氣契約、10項共用天氣後端測試、10項導覽／節流／API正規化／逾時／取消／快取上限測試，以及內容驗證。
- 14 張真實 WebP 的尺寸、檔頭、位元組數、SHA256與作者／來源／授權欄位核對；兩張360全景為2:1等距柱狀投影。11個新增目的地×22語言、13個既有高雄地點×22語言均完整。
- 手機375×812全螢幕：兩個搖桿與四個動作按鈕完整位於可見範圍內，最下緣789.39px，小於視窗812px。
- 桌面1440×1000、手機375×812：文字與操作元件皆在 `#flight` 外，雙手同時觸控、FPV、空／陸／水三型、F/G/C/B及輸入框不攔截快捷鍵正常。
- 黃石、太平山、故宮與竹南全景的本機目的地搜尋、座標／地圖網址同步、博物館文物卡與PNG下載正常。
- 語言自動偵測日文及明確繁體中文URL正常；玩家介面沒有Google金鑰或天氣端點輸入框。
- 注入已知GPS結果，確認啟動只請求一次、顯示座標及±7m誤差；這是可重現的測試位置，不是讀取使用者實際位置。
- 單檔 `file://` 離線模式：只讀一個HTML，沒有其他本機附件请求；14張內嵌照片全部解碼、11景點與2張360切換、14筆授權說明、PNG拍照成功。
- 停用WebGL、PointerEvent及原生dialog時，Canvas2D、雙指TouchEvent控制與對話框備援仍可使用。
- 隔離重建的 `SmartAction/games/aero/ja/` 與 `/en/`：語言、重新整理、canonical及相對CSS／JS／照片路徑正常，本機404=0。
- 改良載具模型測試空／陸／水共11／12／14次draw call（含測試地板／格線）；魚眼額外一次繪製。反覆全景↔空白4回合紋理數固定，沒有持續增加；過期載入與dispose後的回呼不會覆寫新場景。

## 外部地圖與 API 的驗證界線

- 已驗證網址、座標编码、地圖15秒＋50公尺雙條件節流，以及正式 Maps URLs 外開備援。消費者相容 iframe 的HTTP請求可回傳地圖初始化內容。
- 本環境直接 Chromium 存取Google iframe出現 `net::ERR_EMPTY_RESPONSE`；代理HTTP可到200，但等待後仍未取得可見圖磚。因此**未宣稱Google實際地圖繪圖已通過本環境瀏覽器驗證**。發布環境需有正常Google網路；若內嵌受阻，可用旁邊官方外開連結。
- 真實Wikipedia HTTP API測試取得6筆故宮周邊主要座標條目並有CORS標頭；本環境瀏覽器直接連線失敗／代理逾時，所以**未宣稱瀏覽器端線上搜尋端到端已完成外部連線驗證**。本機目的地可離線使用；線上失敗不會製造座標。
- Google 3D／Street View／Places保留站主設定介面；沒有私人Key、沒有啟用帳務、未驗證付費實景。GoogleSDK契約測試使用明確標示的測試替身。
- 地理定位依HTTPS與瀏覽器許可；沒有以IP地址冒充精確GPS。

## 不作的保證

一般照片與定點360不是可任意移動的真實三維測量地形；水下仍為模擬。未做10萬人同時連線測試、Google或GitHub Pages容量承諾、所有iPhone/Android/Safari實機測試、當日展品或餐廳营业確認。22語言內容可用，但正式文宣仍建議母語校閱。

重現方式：`npm ci`、`npm run build`、`npm test`。瀏覽器測試需要Playwright與可執行Chromium；可依環境提供 `AERO_PLAYWRIGHT_MODULE`、`AERO_CHROMIUM_EXECUTABLE`、`AERO_CHROMIUM_MODULE`。執行 `npm run test:browser` 和 `npm run test:delivery`。交付版另由 `npm run export:smartaction` 產生。
