# AERO v3：附件與現有程式唯讀稽核

2026-10-07。檢查附件目錄與個別文字／PE／Unity metadata，沒有執行 exe／dll、反編譯完整程式或複製原套件商用模型。

## 上傳附件版本

- `AERO_Drone_Web_FullPackage(1).zip`：993,796 bytes，47 項，解壓檔案量 3,952,595 bytes。
- ZIP 內所有專案檔案均與 `/workspace/sites/aero-drone` 相同位元組；僅 ZIP 的 `START.html` 包裝入口在 checkout 不存在。
- `翱祥模擬器v2(2).zip`：71,654,827 bytes，215 項（193 檔、22 目錄），解壓 160,146,638 bytes。Unity asset metadata 明確含 `6000.4.10f1`；`app.info` = DefaultCompany / Drone；Drone.exe PE machine = 0x8664 (Windows x64)，含 MonoBleedingEdge 及 Managed assemblies。
- 沒有 `.cs`、`.unity`、`.prefab`、ProjectSettings、Packages 原始專案資料。因此不能據附件準確重建原 Unity 的 UI、地景或完整物理；可以確認類別與設定名稱作為功能參考。
- 編譯 assembly 的 metadata/string 出現 DroneFlightController、RCControllerInput、CameraSwitcher、AerialPhotoCapture、GimbalStabilizer、FlightTelemetryRecorder、FlightTrailRenderer、FigureEightController、EmergencyReturnController、RectRouteController、SideHoverController、GPS/attitude drag、stick calibration、position hold、wind assist 等名稱。這證明這些符號存在，不能證明所有實際行為與數值。

## 模組與目前功能

- `dist/game.js`：DOM、i18n、輸入、音效、數據、主循環。
- `dist/physics.js`：確定性 fixed-step 簡化物理；SI、Y up、heading0 forward−Z。
- `dist/scene.js`：Three.js r160.1 WebGL1 相容渲染、程序式海岸／山谷／夕陽、無人機、FPV/跟隨相機。
- `dist/assets/i18n.json`：22 語、每語88 keys；Arabic dir RTL。
- `tools/build-locales.mjs`：esbuild IIFE bundle、22 paths、root HTML、sitemap、robots、llms、JSON-LD、standalone。
- `tests/physics.mjs`：11 個主要行為／穩定性檢查；`tests/browser.mjs`：桌面鍵盤、mobile 雙點 touch sticks/keypad、模態、locale、map validation、WebMCP readback。既有驗證紀錄明確不代表實際所有手機/GPU。

### 操控

Mode2：W/S 升降／manual throttle，A/D yaw，箭頭前後 pitch 與橫移 roll；V camera、Space pause、R reset。兩手虛擬 stick 與 keypad 支援多點 simultaneous touch，TouchEvent fallback、dialog fallback、blur/hidden 暫停。

### 飛行與任務

- beginner：target speed7m/s、climb3、auto hold/brake、wind0；sport：15m/s、climb5、wind0.5；expert：簡化 thrust/gravity/tilt/linear drag、wind1.6。
- fixed120Hz/max8steps，frame simulation dt cap0.0667，game boundary ±185m、高度≤90m。
- 七個 rings swept plane-crossing aperture2.85m，回 H 低速 landing 完成；free flight 無rings；localStorage per-difficulty best score。
- collision 三座 axis-aligned building，beginner stop，others crash；無完整 inertia/angular momentum/PID/aerodynamics。

### 地圖與真實資料

只有對話框緯經度 validation + external Google Maps URL / CAA reference。沒有 navigator.geolocation、nearby POI、地理座標 mapping、Google imagery／3D tiles／Street View、weather、underwater、land vehicle 或 photo capture。原程序場景不代表高雄實景。

## 直接測量的 baseline rendering

在隔離 scratch 複本以 headless Chromium + SwiftShader 執行 createWorld/draw，初始跟隨相機、1000×700 viewport：

| scene | draw calls | triangles |
|---|---:|---:|
| coast |60|18,252|
| alpine |63|18,756|
| dusk |60|18,252|
| coast low |60|18,252|
| coast high |60|18,252|

low/high 目前只改 DPR，並不減 geometry complexity。以上只衡量此固定視角，不是全部視角 worst case 或 device FPS 指標。

## 必要修改建議（不改 checkout）

1. `game.js` 初始化 world 位於約83行，renderer 立即使用 high-performance；必須移至 capability probe 之後。navigator.deviceMemory/hardwareConcurrency 僅 hints，無法知道可用記憶體／GPU真實負載，Safari常缺。用小型 timing probe + context ability + conservative default + live frame timing；不要宣稱精準 RAM 檢测。
2. `scene.js resize()` 只 DPR。真正 lite 必須降 geometry count/LOD/detail/particle density，unsupported WebGL 給可玩 Canvas2D fallback，而非目前 disable Start。contextlost 暫停、restored rebuild；不要 endless black frame。
3. `game.js frame()` 計算 FPS 使用 clamped simulation delta，當真實 frame intervals >0.0667 時 FPS 不正確；adaptive 只降一次且沒有 scene complexity 或 restore handling。fps 用 unclamped monotonic wall delta；physics catch-up 上限獨立；長卡頓明確降版。
4. `getControls()` 每120Hz substep 重建 object，keyboard iteration/pad iteration／Object.keys；每 RAF sample 一次、reuse input object，遞交多次 step。hud 每0.1s 多個 DOM innerHTML/textContent + best localStorage read + labels writes；cache display values/state，best 僅 load/change時更新。ring visible/color/emissive 僅 ring/mission變化更新。
5. Scene rebuild 使用環境 clear + geometry/material dispose，但 InstancedMesh instanceMatrix資源可明確 `.dispose()` 後移除；dispose list 當 renderer 交換／fallback 避免累積。地圖 SDK 與 photo-real assets 應 lazyload/on-demand，fallback assets 本機。
6. 本地 camera capture 應在 render 後立即 toBlob/toDataURL 以避 WebGL default preserveDrawingBuffer=false 的空白圖；外部 Google iframe/texture 不能直接假設可畫入 canvas/capture。
7. 10万人“同时打开各自单人游戏”主要是 CDN initial delivery，不能等同100k players共享世界。现版本无服务器 physics/update，每客户端独立GPU；可继续此结构。不增加每帧地图库/天气/POI网络查询；weather/cache低频，附近 POI 一次／移动阈值。实景provider quota/billing与CDN可用性分别说明。
8. 原始 bundle640,126 bytes、stylesheet16,471 bytes、all locales JS100,459 bytes、standalone672,822 bytes；3Dengine source1,272,972 bytes但不同时被index请求。保留带版本hash缓存资源，HTML短TTL，并明确GitHubPages配额不能承诺100k SLA。
9. Build currently defaults fixed production origin且仅域根paths：GitHub `https://username.github.io/repository` 要支持 AERO_ORIGIN including repo path、所有alternate/canonical/manifeststarturl/scope/service worker同repo base。locale html `<base href="../">` 已正确在head前端，勿回归。
10. 新代码需更新 i18n keys、browser editing-modal exemptions、reset/state transfer、vehicle switching、fly-plane boundary/geographic mapping、mission compatibility；新地景光环练习与地理探索可以各自模式，别让任务屏蔽自然POI。

## 审计文件

- manifests：`AERO_Drone_Web_FullPackage(1).manifest.json`、`翱祥模擬器v2(2).manifest.json`
- metadata相关strings：`unity-control-strings.json`
- render stats：`baseline-render-stats.json`
- 隔离 baseline source：`runtime/`；这不是用户交付新版源码。
