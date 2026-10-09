# AERO Explorer 4.1 驗證

- `npm test`：物理、裝置、座標與天氣、22語言×256鍵值、14個附近地點、26張已授權照片雜湊、9導航、9地圖、14線上照片來源/授權條件與位移方向檢查通過。
- `tests/browser.mjs`：桌面與手機375×812、LINE Android User-Agent、預覽無自動下載、明確PNG下载、分享成功／拒絕／取消與不支援、照片位移、地圖正常／失敗、手機視野無文字遮擋與全螢幕控制通過。
- `tests/delivery.mjs`：離線single-file26張照片解碼、舊式觸控與dialogfallback、內嵌圖片授權、PNG預覽匯出及SmartAction路徑語言刷新通過。
- 獨立renderer像素測試：WebGL近景紅點516.5px→前進6m546.1px、後退499.9px、右移483.9px；Lite510.5px→541.1px/494.2px/478.1px。近景視差較大，返回原位恢復；360及海底移動成立。
- 渲染資源循環：貼圖load/clear保持3/2，没有逐次累積；無JavaScript或GLSL錯誤。
- Public OSM圖磚在自動測試使用受控fixture與失敗攔截，不用公開圖磚進行headless批次測試。百科照片resolver另有一次真實API核對正修科大Commons來源成功。

以上為Chromium行動模擬、受控API狀態與數學驗證；不等於實體LINE／iOS／Android全面測試，也未進行10萬人負載測試。照片不是實測3D，底圖服务 availability與硬體效能不同装置會有差異。

- 實際GitHub產物 `/AERO_Explorer/ja/ → en/ → reload`、canonical、相對資產均無404；單檔放 `/single/index.html` 切換語言與refresh保留路徑，全26圖解碼及PNG預覽成功。
- 使用者截圖GPS `22.6463,120.34966` 的LINE-UA情境：最近8景點全部有可解碼本地照片及授權；正修科大選擇載入成功，高雄長庚咖啡店歷史照片標示正確。

- 最終目視修正：自動將重投影取景限制在原照片有效區域；749,412個UV樣本不越界。第三人稱近景點WebGL 483.39→前進499.75／後退474.96／右移458.68；Lite方向相同。照片底部不再重複最後一列形成拉伸。Lite魚群已改世界座標，向前潛行會經過魚群。
