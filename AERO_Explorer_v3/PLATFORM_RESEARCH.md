# AERO v3：容量、地圖、天氣與 GitHub 交付查核

查核日期：2026-10-07。本文只使用 Google、GitHub、Git、Open-Meteo、W3C、WHATWG 的第一手文件。網路檢索識別碼供主代理重開來源後引用；交付附件應保留 URL。

## 可實作的產品邊界

每名訪客的載具物理、景物及操作在自己的瀏覽器計算，靜態主機只提供程式檔。10 萬人同時「各自玩」不等於 10 萬個載具在同一世界互相同步。後者需要另設區域房間、權威伺服器、狀態同步、容量與費用設計，不能由 GitHub Pages 的 HTML 單獨完成。

把首次載入的核心控制在數 MB，壓縮並固定版本、延後載入 Google/外部服務、離線緩存自有程式及素材，可減少主機與玩家負擔。但任何網站、裝置、網路與第三方 API 都不能由原始碼保證永不當機、完全零延遲。正式容量需部署後，以獲授權的自身資源進行階段負載測試，測試報告應分清推算及實測。

## GitHub Pages 已核實限制

官方限制是：發布網站不超過 1 GB，來源 repository 建議不超過 1 GB，部署超過 10 分鐘逾時；每月 100 GB 軟性流量，通常每小時 10 次建置（自訂 Actions 建置例外）。Pages 可能限流並返回 HTTP 429；超量可被要求加 CDN 或改用適當主機。因此 github.io 可做展示/低量部署，不能承諾 10 萬同時訪客 SLA。

来源：<https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits>；refs `turn23view0`, `turn22search0`。

以下是自算的容量情境，並非負載實測（十進位 MB/GB）：

| 核心首次下載量 | 10 萬次冷啟動流量 | 若在 1 分鐘內下載完的平均外送速率 |
|---|---:|---:|
| 1 MB | 100 GB | 13.3 Gbit/s |
| 5 MB | 500 GB | 66.7 Gbit/s |
| 10 MB | 1,000 GB | 133.3 Gbit/s |

公式：流量 = 每次下載 bytes × 人数；速率 = 流量 × 8 ÷ 秒数。這只包括自有靜態程式，Google 地圖串流另計。瀏覽器緩存能減少回訪流量，不能消除首次下載；CDN 有用但不產生无限免費資源。

普通 Git 檔案大於 50 MiB 會警告，大於 100 MiB 被拒絕；網頁直接上傳最大 25 MiB。Release 用來交付附件，不是 Pages 遊戲執行檔的替代來源。Release 文件目前寫每件小於 2 GiB、至多 1,000 件；另一 large-file 頁對各方案限額的表述不同，保守依 Release 自己的 2 GiB 上限。LFS 文件明確說不能用於 Pages 網站：不能把頁面所需 GLB/影像移到 LFS 後期待 Pages 自動供應真檔案。

来源：<https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github> (`turn37view1` / `turn39view0` / `turn39view1`)

<https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage> (`turn23view1`)

<https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases> (`turn37view4` / `turn39view3`)

## Google Maps 實景接線

必須由網站擁有者建立 Google Cloud 專案、啟用 Maps JavaScript API 及 Places API (New)、有效 API key，並完成適用帳單設定。Google 提供各 SKU 免費使用門檻但不是无限免費。不要自動開通付費、不把任意可用別人的 key 放入程式。

來源：<https://developers.google.com/maps/billing-and-pricing/billing-overview> (`turn23search8`)

截至查核日，3D Maps JavaScript 对应 **Immersive Maps** SKU，按成功 map load 计费；全球 pay-as-you-go 免费门槛每月 5,000，之后前一档 USD 7/1,000，不能套用 2D Dynamic Maps 每月 10,000 的门槛。一次 100,000 个成功 3D load、无其他使用或优惠，第一档推算约 USD 665，另加 Places、StreetView、税金等；这只是所列定价的推算，非正式账单。地图内部 pan/zoom 不是重新 map load，但重建地图元件可能产生新 load。官方FAQ说明地图载入后互动本身不增加 load计数。

來源：<https://developers.google.com/maps/billing-and-pricing/sku-details> (`turn43search0`)

<https://developers.google.com/maps/billing-and-pricing/pricing> (`turn43view1`, `turn43search1`)

<https://developers.google.com/maps/faq> (`turn43view2`, `turn42search7`)

### Loader 與 3D Camera

2026-10-05 官方最新教學直接使用 `libraries=maps3d`，不需要沿用過期 `v=alpha` 教學；可設定 `v=weekly`。採單一 Promise loader，按使用者選擇實景時才下載一次。使用 callback 完成載入，接著 `importLibrary()`。

```js
// 本例是自行撰寫的接線示意。Google 的 callback 必須置於 window。
function loadGoogleMaps(key, language = 'zh-TW') {
  if (window.google?.maps?.importLibrary) return Promise.resolve();
  if (window.aeroMapLoad) return window.aeroMapLoad;
  window.aeroMapLoad = new Promise((resolve, reject) => {
    window.aeroMapsReady = resolve;
    const script = document.createElement('script');
    const q = new URLSearchParams({
      key, loading: 'async', callback: 'aeroMapsReady',
      v: 'weekly', language, region: 'TW',
      auth_referrer_policy: 'origin'
    });
    script.src = 'https://maps.googleapis.com/maps/api/js?' + q;
    script.onerror = () => reject(new Error('Google Maps failed to load'));
    document.head.append(script);
  });
  return window.aeroMapLoad;
}

await loadGoogleMaps(browserRestrictedKey, 'zh-TW');
const {Map3DElement} = await google.maps.importLibrary('maps3d');
const realMap = new Map3DElement({
  center: {lat: 22.66, lng: 120.35, altitude: 40},
  range: 1000, tilt: 65, heading: 0, mode: 'satellite'
});
container.replaceChildren(realMap);
// 相機座標式：模擬載具地理位置，不等於實際無人機即時直播。
realMap.cameraPosition = {lat, lng, altitude: altitudeAboveSeaLevel};
realMap.heading = headingDegrees;
realMap.tilt = 80;
realMap.fov = 55;
```

`cameraPosition` 是目前 API 的直接相機座標；`center` 是相機對準點，兩者不要混淆。`range` 是距離，不是 zoom。更新攝影機適度節流，暫停模式不移動；位置更新可能引發圖資載入。場景地形、海平面或高度基準應清楚區分，不能把遊戲 `y=0` 當任意真實地點的海拔。

版本陷阱：旧 reference3.63 的 center 描述写 above ground，当前3.65/3.66 改为 mean sea level。最新 `cameraPosition` 及 `gmp-error` 已在正常 reference，不需为了它加alpha。`gmp-error` 应触发错误提示与退出实景，不要仅监听script.onerror。`language` 和 `region` 现在亦是 Map3DElement 属性，能在相同 loader 上调整地图语言，但仍须针对各API正确请求语言。

最新版参考：<https://developers.google.com/maps/documentation/javascript/reference/3.65/3d-map> (`turn43view0`)

來源：<https://developers.google.com/maps/documentation/javascript/3d/get-started> (`turn25view0`)

<https://developers.google.com/maps/documentation/javascript/load-maps-js-api> (`turn29view1`)

<https://developers.google.com/maps/documentation/javascript/3d/camera-position> (`turn25view1`)

### 附近景點：確切 JS API 形狀

```js
const {Place, SearchNearbyRankPreference} =
  await google.maps.importLibrary('places');
const {places} = await Place.searchNearby({
  fields: ['id', 'displayName', 'location', 'formattedAddress',
           'googleMapsURI', 'primaryType'],
  locationRestriction: {center: {lat, lng}, radius: 6000},
  includedTypes: ['tourist_attraction', 'museum', 'park',
    'buddhist_temple', 'hindu_temple', 'cultural_landmark',
    'historical_landmark', 'scenic_spot', 'lake', 'hospital'],
  maxResultCount: 8,
  rankPreference: SearchNearbyRankPreference.POPULARITY,
  language: 'zh-TW'
});
const items = places.map(p => ({
  id: p.id, name: p.displayName,
  lat: p.location?.lat(), lng: p.location?.lng(),
  address: p.formattedAddress, googleMapsURI: p.googleMapsURI,
  kind: p.primaryType, attributions: p.attributions
}));
```

JS request 的語言欄位是 `language`，不是 REST 的 `languageCode`；回傳 `Place.displayName` 是字串、`Place.location` 是 LatLng。半徑最多 50,000 m、結果数 1–20，不要在每幀或每次輸入時搜尋。搜索名稱與地址可以本地顯示；有介紹需另外透過有效來源或可信靜態資料，不應把 Google 名稱結果當成已取得歷史故事。

以上 includedTypes 均在当前 Table A，包括 2026 新增 `buddhist_temple`、`lake`、`scenic_spot`。不要把 Table B 的 `place_of_worship`、`point_of_interest` 當 Nearby filter。若希望找到澄清湖、長庚、果嶺等指定點，使用 `Place.searchByText` 帶名稱及位置偏好，再顯示 API 真正回傳；不能用模糊地名假造精確定位。

來源：<https://developers.google.com/maps/documentation/javascript/nearby-search> (`turn23search0`)

<https://developers.google.com/maps/documentation/javascript/reference/place> (`turn32view2`, `turn34view0`, `turn34view1`, `turn34view2`)

<https://developers.google.com/maps/documentation/places/web-service/place-types> (`turn37view0`)

### Street View 與覆蓋

```js
const {StreetViewService, StreetViewPanorama} =
  await google.maps.importLibrary('streetView');
const service = new StreetViewService();
const panorama = new StreetViewPanorama(panoElement);
try {
  const {data} = await service.getPanorama({location: {lat,lng}, radius: 50});
  panorama.setPano(data.location.pano);
  panorama.setPov({heading: headingDegrees, pitch: 0});
} catch {
  showNoStreetView();
}
```

Street View 是已拍攝的全景、非即時相機；可走訪的點受已有全景位置限制。無全景時應顯示缺圖並回退 3D/衛星/模擬，不虛構圖片。3D terrain 全球可用，立體表面建物只覆蓋部分區域；鳳山指定地點有否完整立體建物需按官方 coverage 或實測確認。

來源：<https://developers.google.com/maps/documentation/javascript/streetview> (`turn25view3`, `turn27view3`)

<https://developers.google.com/maps/documentation/javascript/3d/coverage> (`turn29view2`)

### 容量、key、安全及素材政策

目前 Maps JS 的 2D/3D map-load 預設上限为每 project 每分鐘 30,000 次、每 IP 每分鐘 300 次。10 萬人同时開始 map-load 會超过 project 默认上限；官方允许申请调整额度但影響費用。Map/Places 應選擇性載入，失敗不應讓本機遊戲停掉。

來源：<https://developers.google.com/maps/documentation/javascript/usage-and-billing> (`turn25view2`, `turn27view0`, `turn27view2`)

瀏覽器 Maps key 本來就會公開，使用 Websites / HTTP referrer 限制及 API 限制；不要宣稱「藏在 HTML」安全。不要用同一 key 同時做伺服器 REST：另用限服務及 server IP 的 key，不放前端。`file://` 沒可靠 Referer；發布到自己的 HTTPS 來源後才測受限制 key。搭配 `auth_referrer_policy=origin` 時，Cloud referrer restriction 必須匹配 origin，而非只限路徑。

來源：<https://developers.google.com/maps/api-security-best-practices> (`turn23search6`)

使用 Google 保留其內建 Google Maps 及第三方 attribution，HUD 不遮住；應提供公開使用條款、隱私說明。不要在 service worker 預取或永久保存 Google tiles/StreetView/Places 內容，不能把圖資打包交付離線。place IDs 是可保存例外。自有遊戲 SW 只缓存同來源且白名单自有資產。若呈現 Google 名稱結果而暫不顯示地圖，仍依 Google Maps 標誌/归属规则处理。

來源：<https://developers.google.com/maps/documentation/javascript/policies> (`turn25view4`, `turn27view5`)

<https://developers.google.com/maps/documentation/tile/policies> (`turn25view5`, `turn27view6`)

魚、珊瑚、湖底、鳥、雲與載具可以是自創程序景物，但 Google 資料只描述其官方覆蓋的地形/表面；不可標成「此地真實即時海底/鳥群」。任意位置海底實景需要有授權的 underwater 360 影片、攝影測量或海測資料。Google 資料不提供任意水下可自由巡航的寫實網格。這是從官方產品資料範圍作的工程推論；若某景點另有水下 StreetView，亦只是在該已拍全景位置。

## 天氣接線及高併發模式

公開免費 Open-Meteo API 只供非商業，限少於 10,000/day、5,000/hour、600/min；有广告、订阅、推广用途按其条款算商業。資料按 CC BY 4.0，需 attribution。免費沒有不中断保證。10 萬玩家每人啟動请求一次會超过免费配额，不能这样实作。

來源：<https://open-meteo.com/en/terms> (`turn23view2`)

<https://open-meteo.com/en/pricing> (`turn22search15`)

單次 API URL 範例（`wind_speed_unit=ms`，免除 km/h 与 m/s 混用）：

```text
https://api.open-meteo.com/v1/forecast?latitude=22.66&longitude=120.35&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=auto
```

响应含 `current.time`, `current.interval`, current 各值及 `current_units`，应保留更新时间与单位。模型天气不是玩家现场传感器，也不是每片云的实时坐标。10m wind 作场景风向示意，不可说准确模拟任意空高/街谷气流。

生产配置建议默认手动天气/内建示例，或同来源 `weather.json`。自有定时任务按小范围网格去重每 15–30 分钟抓一次，并缓存给 CDN；加 jitter、单飞请求、短超时、陈旧容忍、错误回退。用户坐标先得到许可再使用，可做约 0.1° 网格避免精确住址传第三方。请求上游仍需合法配额/商业计划，缓存不免除其商用条件。多地点可批量请求，可进一步减少 upstream calls。不要提供任意 URL 代理以免 SSRF/滥用。

來源 API：<https://open-meteo.com/en/docs> (`turn29view3`, `turn39view6`, `turn39view7`)

## 硬體自動分級的可知与不可知

`navigator.deviceMemory` 是粗略 GB 級別，經捨入及隐私上下限，不是目前可用 RAM；Safari/Firefox 或环境可能未提供。`navigator.hardwareConcurrency` 是瀏覽器允許的邏輯 CPU 提示，会為隐私/worker限制而减小。WebGL 能力/纹理限額不等于 GPU RAM，也不能由网页精确读取剩餘 VRAM、CPU 主频/温度。不要大量分配内存「测剩餘 RAM」，那本身会造成 crash。

來源：<https://w3c.github.io/device-memory/> (`turn30search14`, `turn32view0`)

<https://html.spec.whatwg.org/multipage/workers.html#dom-navigator-hardwareconcurrency> (`turn32view1`, `turn34view3`)

建议 WebGL 创建探测 → 粗略 CPU/RAM/saveData/pointer 提示 → 小型真实绘制暖机 → 自动档；未知資源保守中/低档并允许覆盖。启动先不载完整 3D 素材，CPU 渲染基准只几十 ms，绘制基准几百 ms 到一秒；显示这是建议非硬体认证。帧时间持续平均数/95分位数超过约 35ms 数秒降档，恢复需更长稳定期；纹理/阴影/树草密度/分辨率分档。WebGL 无法创建及 context lost 提供真正轻量 2D/CSS退路，隐藏标签暂停 rAF，重返页面限制 dt、清理 input。

性能阈值与各档预算都是工程策略，需要当前游戏真实测试而不是浏览器官方保证。

## GitHub 教程要點（可直接纳入交付说明）

`git pull` 將远端变更取回本机並整合；`git push` 才是把本机提交上传 GitHub。首次上传先建立空 repo（不要预建 README），解压套件后進專案目錄，不要仅上传 ZIP 当网站。命令里的 YOUR_USERNAME 自行替换：

```bash
git --version
git init -b main
git config user.name "Nan-Hong Kuo"
git config user.email "YOUR_GITHUB_EMAIL"
git status
git add .
git commit -m "Publish AERO Explorer v3"
git remote add origin https://github.com/YOUR_USERNAME/aero-explorer.git
git push -u origin main
```

GitHub HTTPS 已不接受帐号密码当 Git password；用 GitHub Desktop、`gh auth login` 的网页登录，或自己的 SSH/PAT，勿将 token 写进代码或复制公开。

Source：<https://git-scm.com/docs/git-pull> (`turn37view2`, `turn39view4`)

<https://git-scm.com/docs/git-push> (`turn37view3`, `turn39view5`)

建議附自訂 Pages workflow，只发布 `dist`，无需把 Python 文件发布到 Pages（Pages不能跑server）。GitHub Settings → Pages → Build and deployment → Source → GitHub Actions。根目錄保留 `.nojekyll` 亦可走 branch发布，但 source/dist時不能直接設定任意 `dist` 分支資料夾，因此 Actions較合適。

```yaml
name: Publish AERO
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
jobs:
  publish:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v6
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v4
        with:
          path: dist
      - uses: actions/deploy-pages@v4
        id: deployment
```

`index.html` 必須位於發布檔案頂層。本機更新後：

```bash
git status
git pull --ff-only
git add .
git commit -m "Update landscapes and controls"
git push
```

来源：<https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages> (`turn30search0`)

<https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site> (`turn30search3`)

大ZIP/EXE、生成影片、素材库不要放网站核心或逐次纳入Git歷史。先移出repo/加入.gitignore；压缩WebP/AVIF，纹理限制分辨率，GLB用Draco/Meshopt并测试兼容；仅一次需要再懒载。如需源码收藏的大文件可放单独LFS archive repo，但不要供Pages运行。

用 Release 分发完整ZIP（需已安装GitHub CLI及已登入，提交并push后）：

```bash
gh release create v3.0.0 ../AERO_Explorer_v3_FullPackage.zip --title "AERO Explorer v3" --notes "Source code and deployment guide"
```

若普通Git已经误提交超过100MiB文件但尚未分享提交，应按官方修复历史方法处理；不要建议 force push 作为默认教程。`.gitignore` 不会自动移除已经tracked的东西。不要把 Phoenix Windows安装器/模型素材未经许可重新发布到网站。
