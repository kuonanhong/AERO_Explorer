# AERO v4.1 獨立瀏覽器驗證

以下使用實際遊戲程式、Chromium 與 Playwright；原始專案只讀，所有 QA 腳本、結果與截圖存於這個資料夾。browser.mjs 與 delivery.mjs 已與專案 tests/ 下的版本逐位元核對一致。

| 驗證 | 結果 |
|---|---|
| LINE Android 使用者代理、375 × 812、低記憶體分級 | Canvas2D 啟動；雙指搖桿、FPV、無橫向溢位 |
| F 拍照 | 真正產生 PNG、開啟可讀取的 data URI 預覽；沒有自動下載事件 |
| LINE 下載限制 | 下載連結隱藏，顯示長按／截圖／開啟外部瀏覽器提示；不宣稱已下載 |
| Web Share 支援與錯誤 | 不支援隱藏、支援傳遞 PNG 檔案、NotAllowedError 保留預覽、AbortError 不虛報成功、canShare 拋錯可恢復 |
| 桌機明確下載 | 按下下載連結後才產生真實下載事件與 PNG；狀態說明為已提出下載要求 |
| 鍵盤焦點 | 照片對話框的 G/V、輸入欄位的 F/G/C/B 不誤觸遊戲 |
| 地圖 | 預設 DIV DOM 街道圖；6 個受限顯示的模擬測試圖磚載入；没有消費版 Google Maps iframe |
| 地圖失敗 | 圖磚請求被拒絕時，保留有標示的座標格線、載具位置與外部 Google 地圖連結 |
| 26 張附圖 | 所有檔案解碼成功且符合 manifest 尺寸；其中 2 張為 360° 全景 |
| 照片移動 | Yellowstone 實際 FPV 控制前移超過 5 公尺；照片視角像素改變、photoMotion.method=photo-2.5d |
| 景點 | Yellowstone、太平山、故宮搜尋與選取；故宮外觀、兩件文物；博愛公園 360° |
| 海陸空 | 飛行、地面移動、水下深度超過 3 公尺；都有遊戲畫面截圖 |
| 手機全螢幕 | 雙搖桿與 F/G/C/B 六個控制完整落在 812 像素視窗內；最大底部座標 789.39 |
| 定位 22.6463,120.34966 | 顯示 GPS ±7 m；8 張附近景點照片解碼、有作者與授權；選正修科技大學後載入該校照片 |
| 離線單檔 | file:// 且外網阻擋，26 張內嵌附圖與作者授權、舊版 touch/dialog 備援、PNG 預覽與明確下載成功；不需要第二個本機檔案 |
| GitHub 資料夾 | 實際 .aero-output/AERO_Explorer 由 /AERO_Explorer/ja/ 切 en 並重新整理，canonical 正確、同來源資產無 404 |
| 任意單檔路徑 | 實際 standalone.html 以 /single/index.html 提供；切語言不改檔案 URL，重新整理成功、26 張內嵌照片、PNG 預覽成功 |
| 程式錯誤 | 所有受測情境皆無 pageerror |

地圖測試使用固定圖磚回應或明確阻擋外網，避免自動化瀏覽器擷取公共 OSM 圖磚；不代表外部地圖供應商一定能連線。LINE 測試是在 Chromium 中設定 LINE Android 使用者代理；Web Share 使用受控替身驗證應用程式處理，尚不能證明真實 LINE App 與手機作業系統已儲存檔案。此驗證也沒有進行 10 萬人真實壓力測試。

主要證據為 results/qa-v41-results.json、gps-nearby-results.json、github-target-results.json、source-hashes.json，以及 LINE 預覽、定位附近地點、手機全螢幕、地圖失敗、FPV、照片前後移動、海陸場景截圖。GPS 與實際 GitHub/单檔目標測試已在最後視覺調整後重跑；完整功能測試於此前相同 v4.1 核心版本通過。
