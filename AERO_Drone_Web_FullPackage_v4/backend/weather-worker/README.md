# 可選：共用天氣快取服務

遊戲預設使用可自行調整的模擬天氣。只有網站擁有者填入 `dist/config.js` 的 `weatherEndpoint`，並由玩家按天氣查詢按鈕，才連線到這個服務。它是可部署的 Cloudflare Worker 範例，**本套件沒有替您建立帳號、部署 Worker、購買額度或驗證正式 Cloudflare 網站**。

## 功能與界線

- API：`GET /weather?lat=22.65&lon=120.35`（`/` 也可）。回傳 Open-Meteo `current` 的攝氏氣溫、雲量百分比、10 公尺風速 **m/s**、風向角度及 UTC 資料時間。這是氣象模型，並非現場感測器，也沒有各空高及街谷的真實氣流。
- 坐標取到小數點後 2 位；約 1.1 公里緯度、在高雄約 1.0 公里經度的網格。同一格不同玩家共用資料。前端也應先四捨五入，避免把更精確 GPS 發送到此服務。
- 成功結果在 Cloudflare Cache API 中保存 15 分鐘；另外保留最長 1 小時的舊資料。供應者逾時或限流時回傳 `stale: true` 及原資料時間。沒有可用資料時回傳 HTTP 503，遊戲繼續使用模擬天氣。
- 5 秒上游逾時；每個 Worker isolate 最多 4 個不同網格的並行請求；同 isolate、同網格請求合併。失敗後 30 秒內不重試，記憶體資料至多 64 格。無任意 URL 代理、无 Google 圖資代理、不記錄位置及金鑰。
- CORS 僅准許配置的來源，不使用 `*`；公開 GET 可以沒有 `Origin`。**CORS 不是身分驗證，無法阻止腳本偽造 Origin 或直接呼叫。** 若開放大流量，另設定 WAF/Rate Limiting、服務範圍、流量監控與供應者配額。

Cache API 只共用同一個 Cloudflare 資料中心的內容，不自動跨資料中心複製，也不支援 Tiered Cache；同一 isolate 的請求合併不等於全球單一請求。Cache API 無法代替全域速率限制。多地冷啟動、許多不同坐標、快取被移除或 Worker 重啟仍會產生多次上游呼叫。**不能用這個範例承諾 10 萬人同時使用只需一次免費天氣请求。** 更大的服務可改成受控固定地點的定時更新及 CDN 靜態 `weather.json`，或用 Durable Object/另一個中央排程協調上游呼叫。

## 授權與額度

Open-Meteo 免費 API 只供非商業用途，且有少於 10,000 次/日、5,000 次/小時、600 次/分鐘的限制；廣告、推廣或其他商業用途需依供應者條款使用合適的商業方案。快取不會免除商用條件。若預計公開大量流量，先選擇合法的上游計畫及 Worker 計畫，而不是讓所有玩家直接呼叫免費 API。

資料採 CC BY 4.0。回應包含 `attribution`，前端須顯示連到 [Open-Meteo](https://open-meteo.com/) 的歸屬標示及資料時間。舊資料須標示「暫用較舊資料」。此程式採 MIT，與資料授權分開。

## 設定與部署

1. 用您自己的 Cloudflare 帳號及網域，複製 `wrangler.toml` 並改 `routes`，例如 `weather.your-domain.com`。這個範例關閉 `workers_dev`，以自訂網域驗證 Cache API 實際命中；Dashboard/Playground 預覽不應被當成正式快取測試。Cloudflare 計畫與部署費用以官方當日資料為準。
2. `ALLOWED_ORIGINS` 填完整 **origin**，逗號分隔。例如 `https://user.github.io,https://aero.your-domain.com`。GitHub repo 路徑不屬於 origin，勿填 `https://user.github.io/aero/`。本機測試可額外加入 `http://localhost:8080`，正式部署再移除。
3. 範例 `ALLOWED_BOUNDS="21,26,119,123"` 只接受台灣附近網格。格式是 `latMin,latMax,lonMin,lonMax`；要服務其他地區請修改。清空可接受全球有效坐標，但會增加被大量不同地點濫用的可能。
4. 非商業且額度足夠時，保留 `UPSTREAM_BASE="https://api.open-meteo.com"`。商業方案改為 `https://customer-api.open-meteo.com`，並將供應者金鑰設定為 **Worker secret**。

在此資料夾執行（需 Node.js 20 或較新版本，使用 Cloudflare 官方 Wrangler CLI）：

```bash
# 全部是本機 mocked 測試，不打外部天氣服務。
node --test weather-worker.test.mjs

# 您自行登入自己的 Cloudflare 帳號；不會替您註冊。
npx wrangler login

# 只有商業 endpoint 需要這個 server secret。
# 出現提示後貼入金鑰，勿把金鑰寫在指令或 Git。
npx wrangler secret put OPENMETEO_API_KEY

# 檢查完成且決定發佈時執行。
npx wrangler deploy
```

將 `dist/config.js` 改為：

```js
globalThis.AERO_CONFIG = {
  googleMapsKey: '',
  weatherEndpoint: 'https://weather.your-domain.com/weather',
  autoNearby: false,
  initialOrigin: {lat: 22.64954, lon: 120.35363, altitude: 20}
};
```

重新建置與發布前端。不要把 `OPENMETEO_API_KEY` 放在這個前端設定；Worker 不回傳該金鑰。瀏覽器 Google Maps key 則是另一種用途與限制，請按 Google 教學設定。

## 小量驗證

先從正式遊戲網頁按一次天氣查詢，在瀏覽器 Network 檢查成功回應的 `current_units.wind_speed_10m` 是 `m/s`、`fetchedAt`/`current.time`、`attribution` 及 `X-AERO-Cache`。再對同一網格查詢，應出現 `LOCAL` 或 `HIT`（跨資料中心未必命中）。`MISS` 代表向上游取得新資料，`STALE` 代表失敗時使用舊資料。四個位置並行上限只限單 isolate；不應當成供應者每日配額保護。

調整 Cloudflare 速率限制、負載與費用警報，檢查上游限流，先用自己的 stub 服務做容量測試；不要對 Google、免費 Open-Meteo 或第三方服務執行大量壓測。GitHub Pages 只提供靜態檔，不能執行這個 Worker，故它必須是獨立的可選後端。

## 第一手文件（查核 2026-10-07）

- [Cloudflare Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- [Cloudflare 的快取運作與資料中心範圍](https://developers.cloudflare.com/workers/reference/how-the-cache-works/)
- [Cloudflare Cache API 範例](https://developers.cloudflare.com/workers/examples/cache-api/)
- [Open-Meteo API 文件](https://open-meteo.com/en/docs)
- [Open-Meteo 使用條款](https://open-meteo.com/en/terms)
- [Open-Meteo 方案與商業 endpoint](https://open-meteo.com/en/pricing)

驗證範圍：附帶測試使用 mocked Request/Response、Cache 及上游函式，涵蓋分格共用、50 個同 isolate 並發去重、單位、CORS、位置/URL驗證、商業金鑰不外洩、逾時、15 分鐘到期、舊資料與 30 秒重试抑制。這些不是 Cloudflare 10 萬並發或上游正式服務的實測。
