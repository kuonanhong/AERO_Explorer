# 裝置預檢與自動降級

`device.mjs` 沒有載入 3D 引擎、地圖、材質或網路服務。先 `await probeDevice()`，顯示結果後才動態載入對應遊戲模組。

```js
import { probeDevice, PROFILES, AdaptiveQuality } from './device.mjs';
const result = await probeDevice();
const profile = PROFILES[result.tier];
const quality = new AdaptiveQuality(result.tier);
// Run this with measured FPS, roughly once per second during active play:
const nextTier = quality.observe({ fps: measuredFPS, visible: !document.hidden, running: isPlaying });
// If nextTier is non-null, apply PROFILES[nextTier] and recreate the renderer
// when changing from WebGL to Canvas 2D. Release the former renderer first.
```

- `navigator.deviceMemory` 是瀏覽器提供、刻意粗略化的裝置 RAM 容量提示；**不是目前可用記憶體**。Safari 等瀏覽器未提供時保留 `null`，不以機型名稱推測記憶體。
- `hardwareConcurrency` 是瀏覽器可用的邏輯執行緒提示；不是 CPU 分數。
- `probeMs` 是 64×64 WebGL 畫布、最多 96 次小三角形繪製的每輪耗時中位數。這個很小的計時代理不能確認 VRAM、散熱、電池省電模式、其他分頁負載或真實遊戲 FPS。120 ms 為兩輪間的軟預算，無法中止瀏覽器正在執行的同步 GPU 呼叫。
- 預檢釋放 WebGL buffer、shader、program，並使用 `WEBGL_lose_context` 釋放暫時 context。Canvas 未加入文件中。
- `verified: false` 明確表示結果為保守分級提示，不能保證裝置永不崩潰。初始化失敗、WebGL context lost 仍須在遊戲本體切換到 Canvas 2D。
- 手機／平板（coarse pointer）最高自動選 balanced；已知 RAM ≤2 GB、邏輯執行緒 ≤2、無 WebGL 或明顯慢速代理選 lite。WebGL 正常但 RAM 未知（包含 Safari）選 balanced。
- 正常遊戲 FPS 持續低於門檻至少 4.5 秒才降級，降級後有 9 秒冷卻。隱藏分頁、暫停、無效資料及觀測間隔過長會清除累積證據。只自動降級，不在兩個版本間反覆升降。

分級：lite＝Canvas 2D／30 FPS／DPR ≤1；balanced＝WebGL／45 FPS／DPR ≤1／減少樹木與特效；full＝WebGL／60 FPS／DPR ≤1.5。渲染器應實際遵循這些上限，`targetFPS` 並不表示已測得裝置可達該速度。

驗證：`node --test device.test.mjs`。分類、未知 RAM、GPU 關閉、低資源、並行預檢、短暫掉幀、持續掉幀及暫停情境都有測試。
