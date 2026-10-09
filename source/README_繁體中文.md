# AERO Explorer 4.1

本次修正 LINE 內建瀏覽器的地圖錯誤與照片下載誤報，加入附近景點照片、照片估計深度視差及 22 種語言。主目標是 https://kuonanhong.github.io/AERO_Explorer/ 。

請先閱讀 [完整更新與部署教程](docs/AERO_v4_1_更新與部署.html)。這份套件並不表示已直接修改您的 GitHub 儲存庫。

## 使用與建置

- 交付 ZIP 的 `AERO_Explorer/` 內容可直接放儲存庫根目錄；所有資產均使用相對路徑。
- 單檔 `AERO_Explorer_v4_1.html` 可改名 index.html；切換語言不跳到不存在的目錄。
- 原始碼中的 `dist/game.js`、`scene.js`、`lite-scene.js` 可修改；bundle 是建置產物。
- `npm ci`、`npm test`、`npm run build`、`npm run export:github`。
- GitHub 成品輸出到 `.aero-output/AERO_Explorer/`。
- `npm run export:smartaction` 另外輸出舊 SmartAction 子路徑。

## 控制

左手 W/S 升降、A/D 轉向；右手方向鍵前後與橫移。F 拍照、G 投放浮標、C 位置地圖、B 景點故事；V 第一／第三視角、空白鍵暫停、R 重置。手機提供雙手觸控搖桿及方向鍵。文字和功能鍵位於飛行視窗外。

## 畫面、圖片與服務

26 張本地照片各自附作者與授權，14 個高雄地點有對應圖片。單張圖片以有界 2.5D 重投影模擬視差；沒有還原未拍到的背面，也不是現場即時 3D。360°照片保留環視。潛水礁石與魚群仍屬模擬；生成水下背景也有位移視差。地圖預設 OpenStreetMap，Google Maps 另開正式連結；不再使用被 LINE 擋住的 consumer iframe。

照片先预覽、再由玩家選擇下載／分享。LINE 等內建瀏覽器若限制儲存，請使用右上角選單轉 Safari／Chrome 或裝置截圖；網頁不宣稱確認儲存成功。

主模擬在每位裝置獨立運行。十萬人同時上線未經驗證，公共圖磚与百科API也不保證此容量；大量發布前設定合適的 mapTileURL 及授權文字。瀏覽器硬體探測只估計效能，不能量出剩餘RAM。Google進階3D／StreetView需網站方另設可用的API金鑰、相關服務及額度。

## 驗證與授權

`npm test` 覆蓋物理、裝置降級、地理座標、內容與照片雜湊、地圖負載邊界、授權核對及照片位移方向。`npm run test:browser`、`npm run test:delivery` 是可選Playwright驗證，參數見測試檔；實體LINE／iOS仍需發布後試玩。驗證報告見 `docs/validation/`。

遊戲原創程式採 MIT；Third-party Three.js 及所有照片使用各自授權。照片資料見 `dist/assets/photos/PHOTO_CREDITS.html`。`docs/README_v4_歷史版本.md`、其他v3/v4文件為歷史說明，4.1以本文件及最新教程為準。
