# AERO v4.1：LINE 內嵌瀏覽器地圖修正

## 變更目的

預設地圖不再嵌入 `maps?q=...&output=embed`。該 Google 消費者介面不是正式 SDK，在 LINE Android 被回應策略阻擋時，iframe 會顯示整片錯誤。v4.1 改用本地 DOM 呈現街道圖磚，失敗時保留明確標示的座標示意格線、載具及附近地點標記；不把這幅圖稱為 Google 地圖。

Google 地圖改保留正式外部 `Maps URLs` 連結。只有網站方設定 Key 並明確選擇 Google 模式時，才建立正式 `/maps/embed/v1/view` iframe；玩家預設不會遇到 Google iframe。

## 檔案整合

1. 複製 `live-map.js` 至 `dist/live-map.js`。
2. 複製已更新的 `navigation.js` 至 `dist/navigation.js`。它保留原有定位／語系／百科功能，改為重匯出新 `LiveLocationMap` 與正式 `embedURL`。無 Key 時 `embedURL()` 回傳 `null`；不再產生相容 Google iframe URL。
3. 將 `live-map.css` 加到 `dist/assets/style.css`；它不依賴外部字型或 CSS。
4. 將 HTML 的舊 iframe 換成：

```html
<div id="locationMap" role="region" aria-label="目前位置地圖"></div>
```

5. 建立元件：

```js
mapTracker = new LiveLocationMap($('locationMap'), {
  key: config.googleEmbedKey || '',
  mode: config.mapProvider === 'google' ? 'google' : 'tiles',
  tileURL: config.mapTileURL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: config.mapAttribution || '© OpenStreetMap contributors',
  attributionURL: config.mapAttributionURL || 'https://www.openstreetmap.org/copyright',
  interval: 15000,
  distance: 50,
  labels: () => ({
    loading: t('mapTilesLoading'), ready: t('mapTilesReady'),
    partial: t('mapTilesPartial'), fallback: t('mapGridFallback'),
    file: t('mapFileGrid'), idle: t('mapLoadVisible'),
    grid: t('mapGrid'), position: t('positionLabel'),
    zoomIn: t('mapZoomIn'), zoomOut: t('mapZoomOut'),
    google: t('mapGoogleOwner'), issue: t('mapReportIssue')
  }),
  onPlace: place => {
    const entry = nearbyItems.find(item => item.id === place.id);
    if (entry) selectPlace(entry);
  }
});
```

上述翻譯 key 名稱可依主專案調整，傳入元件的 12 個 property 名称固定；英／繁中種子見 `map-labels-seed.json`。`mapTileURL: ''` 可停用網路圖磚，只保留座標格線。

每次 HUD 更新都呼叫：

```js
mapTracker.update(toGeographic(origin, state), locale, {
  force,
  follow: $('mapFollow').checked
});
```

`follow: false` 仍移動載具標記及更新座標，保留地圖中心；`force: true` 會立即置中。中心跟隨保留「至少 15 秒且移動至少 50 m」雙重條件，標記本身即時更新。縮放按鈕有短暫合併，避免連點觸發過多中間圖層。

附近資料整理完後：

```js
mapTracker.setPlaces(nearbyItems.slice(0, 8).map(place => ({
  id: place.id, lat: place.lat, lon: place.lon,
  label: placeText(place, 'name')
})));
```

最多 8 個實際座標標記；無效座標丟棄。超出目前地圖範圍的標記隱藏，不擠到邊缘冒充位置。所有標記保留可讀名稱；可設定 `onPlace` 點選，也可只显示編號。跨日期變更線採最短的世界座標差。

保留現有 `externalMap.href = googleMapURL(position, locale)`；地圖名稱與外開 Google CTA 應清楚區分。

## 載入與失敗行為

- 只載入目前可見地圖範圍所需圖磚，最多 9 張，最多 3 個同時請求；離開畫面或背景分頁不開始新請求。
- 容器採 IntersectionObserver／幾何檢查，不預抓未觀看區域，也不預抓下一層 zoom。
- 預設使用瀏覽器正常 HTTP cache，沒有 no-cache、時間戳記破快取或離線下載功能。Service Worker 不應加入圖磚。
- 每張 8 秒逾時，失敗後 60 秒冷卻，不自動快速重試；失敗紀錄最多 64 個。舊目的地的在途請求仍計入同一個 3 請求上限。
- 預設 OSM 圖磚需要有效 HTTP Referer；`file://` 單檔版只显示座標格線，開啟 HTTPS 網站才載入街道圖。Google 外開連結仍可用。
- 使用者可放大／縮小；範圍 3–18。較大容器會放大圖磚顯示以維持 9 張上限，可能較模糊，避免桌面圖面過大增加請求。
- 局部失敗顯示 `partial`，全部失敗顯示 `fallback`。座標示意格線沒有假道路；圖磚失敗不會替換成另一處城市圖片。

## DOM 與 QA

`#locationMap` 是 div。`data-map-state` 為 `idle`、`loading`、`ready`、`partial`、`fallback`、`file` 或 `google`。

- `.aero-map-viewport`：地图視窗
- `.aero-map-tile`：目前圖磚 img
- `.aero-map-marker`：載具標記
- `.aero-map-place`：最多 8 個附近地點
- `.aero-map-reading`：即時模擬座標
- `.aero-map-status`：文字狀態；`role=status`
- `.aero-map-credits a`：永遠在地圖下方可見的供應者／授權連結（tiles 模式）

`live-map.test.mjs` 9 個 mocked 測試；`navigation.test.mjs` 9 個 mocked 測試，共 18 個通過。複製至主專案 tests 時，把匯入改成 `../dist/live-map.js` 與 `../dist/navigation.js`。測試涵蓋投影往返、9 張可見上限、3 個請求上限、錯誤格線、file／背景／畫外不載入、反日期線與附近標記、follow false、Google Key 限制，以及舊請求併發。

瀏覽器測試應以本地 mocked PNG／SVG 回應或阻擋圖磚測試，不能用 headless 不斷拖動／縮放抓取真實 OSM 圖磚。模擬 Android UA 的 Chromium 測試不等於已在實際 LINE Android 裝置驗證。

## 官方查核與大量流量

查核：2026-10-09。OSMF 標準圖磚政策允許一般互動式地圖，但它是捐款支持的有限服務，沒有 SLA，過量使用可能被封鎖。要求官方 HTTPS 模板、可見署名、有效 Referer、遵循 HTTP cache，禁止 bulk／prefetch／下載離線地圖。**不能把預設社群圖磚當作免費 10 萬人保證後端**；活動前改成自己有權使用且有相應容量的供應者或自架圖磚，並填正確 attribution。更換供應者時也查核其條款。

來源：

- https://operations.osmfoundation.org/policies/tiles/ （正式圖磚政策）
- https://www.openstreetmap.org/copyright （資料與署名授權）
- https://developers.google.com/maps/documentation/urls/get-started （免 Key 外開 Maps URLs）
- https://developers.google.com/maps/documentation/embed/embedding-map （正式有 Key Embed）

沒有下載、打包或代理任何 OSM 地圖圖磚，也沒有建立 Google Key 或繞過 LINE 的回應限制。
