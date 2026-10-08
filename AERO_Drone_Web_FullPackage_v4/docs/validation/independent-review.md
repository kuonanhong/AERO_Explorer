# AERO Explorer v4 獨立瀏覽器驗證

2026-10-08。測試環境：Chromium + SwiftShader，桌面1440×1000、手機375×812。僅唯讀操作專案；staged測試檔已與專案tests/browser.mjs位元組相同。

## 最終通過

- 正式頁面的WebMCP讀取狀態回傳正常，啟動等待preflight完成。
- 裝置mock提供座標22.659012,120.347891、誤差7m，顯示GPS ±7m且只要求一次位置；iframe中心与外部地图链接采用坐标，非以IP猜测位置。
- 鍵盤起飛／前進、FPV／第三人稱，air／land／water實際操作；land維持地面，water控制深度。
- F真正下載相機PNG；G增加可見beacon數；C更新位置地圖；B顯示有來源的guide文字。輸入搜尋框fgcb不觸發上述快捷鍵。
- 14張本機照片逐一由瀏覽器解碼，尺寸均與manifest一致；2張真360°照片，實際選博愛公園後renderer回報panorama。
- 本機搜尋Yellowstone→Old Faithful、太平山→Jancing Historic Trail、故宮→National Palace Museum均可選入場景；故宮展示1張外觀+2張文物卡，文物不假裝三維房間。
- 手機真正CDP雙點touch同時升高和前進，放開全部controls歸零；Lite啟動、FPV、無水平溢出。
- 以DOM ancestry、可見文字與控制元件矩形檢查，桌面、375px手機及手機fullscreen都沒有文字／按鈕／搖桿覆蓋#flight。
- fullscreen目標是#flightColumn，控制deck保留；375×812所有六個搖桿／動作按鈕完整在螢幕範圍：左右搖桿bottom733.39/743.39px，F/G779.39px，C/B789.39px，均<812px。
- root首頁在ja-JP瀏覽器自動日文；明確zh-Hant路徑維持繁體中文。
- 玩家頁面沒有GoogleKey、weatherEndpoint輸入欄。
- 桌面與手機沒有未處理JavaScript錯誤。修正null景觀清除後，GPS初始畫面不再錯誤顯示照片載入失敗。

## 地圖／Wikipedia真實網路驗證與限制

- Direct Chromium：Google consumer iframe請求與實際navigation.fetchWikiNearby均net::ERR_EMPTY_RESPONSE，沒有HTTP回應。
- 獨立Chrome啟用環境HTTPS proxy（未輸出任何憑證）：Google iframe得到301→/maps/embed HTTP200，但是等待20秒後仍白色、mapElements=0，不能稱已驗證地圖可視渲染／瓦片。
- 同一proxy與localhostorigin下，真正fetchWikiNearby保留Api-User-Agent標頭，8秒受控逾時後net::ERR_ABORTED；沒有取得API回應，因此也不能稱已驗證跨來源CORS成功。
- 地圖中心URL、public外連與consumeriframefallback介面已驗證。實際Google provider覆蓋、呈現、穩定性及付費API尚未完成有效key實測。
- 主功能測試對Wikipedia網路設明確abort，验证內附景點library；另以liveprobe嘗試真正網路，不把mock結果當即時資料。

## 檔案

- `qa-v4.mjs`：portable腳本，支援AERO_SITE_ROOT、AERO_QA_OUTPUT、AERO_TEST_URL、AERO_CHROMIUM_EXECUTABLE、AERO_CHROMIUM_MODULE、AERO_PLAYWRIGHT_MODULE、AERO_PYTHON；無指定URL時用臨時隨機port啟動localhostserver，測完關閉。
- `qa-results/qa-v4-results.json`：最終結果、fullscreen矩形、14照片尺寸及網路錯誤。
- `qa-results/map-live-probe.json`：direct/proxy真實Google/Wikipedia診斷。
- `qa-results/source-hashes.json`：最後驗證來源檔SHA256。
- 截圖：v4-desktop、v4-mobile、v4-mobile-fullscreen、v4-fpv、v4-panorama-360、v4-land、v4-submarine；另存真正v4-camera-photo.png。

沒有在實體iOS/Android/Safari逐一驗證，沒有進行10萬連線CDN壓测；不能由此測試承諾全部裝置效能或第三方服務SLA。
