# AERO Explorer v3 交付驗證

日期：2026-10-07。環境：Node24.19.0、Playwright1.62.1、Chromium軟體圖形渲染器。原始程式與產出檔已一起交付。

## 已執行

- `npm run build`：成功產生核心／延後載入3D模組、完整單檔HTML、22語言頁及搜尋資料。
- `npm test`：原有11項物理行為與7項新增載具／邊界檢查、9項硬體／持續FPS降級測試均通過。地理距離、原點、起點座標一致、Google介面契約／相機映射與天氣資料驗證通過。
- 內容檢查：22語言每種166鍵、13處地點每處22語名稱／介紹／官方來源；SEO schema／canonical／hreflang、相對資產、單檔內嵌、延後3D與自有資產快取界線通過。
- 天氣後端：10項mocked測試通過；包括同網格快取、單isolate的50並行請求合併、15分鐘到期、舊資料、超時、來源、單位及secret不回傳。
- `tests/browser.mjs`：桌面1440×1050，真實鍵盤事件起飛／前進、空中／陸地／水下、湖泊介紹與場景、Lite／Full穩定切換、當前WebGL畫布實際觸發WEBGL_lose_context後降級並繼續操作、定位測試替身允許、手動座標、多語／RTL、照片PNG實際下載均通過。
- 同一瀏覽器套件：390×844手機尺寸、低記憶體提示自動Lite且不下載3D引擎、CDP雙點觸控同時操作搖桿及方向鍵、取消觸控清輸入、載具切換、定位測試替身拒絕與示例備用均通過；沒有水平溢出，桌面／手機無未處理JavaScript錯誤。
- `tests/delivery.mjs`：独立開啟standalone.html，没有下載其他遊戲檔案／外部資產；停用WebGL、PointerEvent與原生dialog時仍能啟動輕量版和教學。以本機HTTP的 `/aero-explorer/ja/` 子路徑載入與切英文導航通過，資產無404。
- 人工閱看空中、陸地、海洋、淡水湖泊與手機截圖；海洋使用原創AI背景，湖泊不顯示海洋背景或珊瑚。修正舊畫布延遲context事件誤降級與Lite resize清空畫面問題後重測通過。

## 重要驗證界線

上述測試不是10萬人正式站點連線、CDN吞吐或所有實體裝置的證明；軟體GPU的FPS也不能當成真實手機效能。未在實體iPhone、Android、iPod、macOS Safari或Firefox逐臺測試。

Google Places／3D適配器以測試SDK驗證符合目前官方參數。沒有Google API Key、沒有呼叫付費實景API、沒有逐點確認Kaohsiung3D／Street View覆蓋，也沒有把測試替身放入遊戲正式程式。GPS允許／拒絕由瀏覽器測試替身控制，不是本次工作環境的實體GPS。原生WebMCP註冊由測試環境注入，只提供可選唯讀工具，不影響遊戲。

天氣Worker沒有部署到您的Cloudflare，也沒有正式上游或全球資料中心的壓測。附带 `tools/cdn-load-test.js` 是可選k6腳本與示例閾值；未對正式主機／第三方服務執行大量負載。22語翻譯為初稿，仍需要母語者校閱。未執行Unity或Phoenix Windows二進位程式。

## 重現測試

```bash
npm ci
npm run build
npm test
```

瀏覽器測試是額外開發工具；遊戲不需要Playwright。要重現本次相同版本：

```bash
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium
npm run test:browser
npm run test:delivery
```

一般本機使用Playwright預設Chromium即可；本次環境指定AERO_CHROMIUM_EXECUTABLE／AERO_CHROMIUM_MODULE／AERO_PLAYWRIGHT_MODULE作軟體渲染器適配。這些環境路徑不是遊戲依赖。瀏覽器QA結果預設寫入 `.qa-output`，不需發布。
