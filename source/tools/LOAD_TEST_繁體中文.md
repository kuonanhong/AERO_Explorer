# 自有CDN／staging的下載容量測試

這是可選k6 HTTP腳本，本次沒有執行正式主機壓測。它不操作瀏覽器，不能證明手機FPS、Google圖資或10萬玩家都穩定。

在已獲您及供應商授權的staging使用，外部Google／Open-Meteo API未納入腳本。安裝k6後，替換範例網址：

```bash
k6 run -e AERO_LOAD_URL=https://staging.example.com/aero -e AERO_FULL=1 -e AERO_WATER=1 tools/cdn-load-test.js
```

Windows PowerShell也可使用相同命令。AERO_LOAD_URL需包含專案子路徑，不加語言路徑。腳本預設從1個VU升到10、100再回0，每個VU重複抓取核心資產；每輪含1秒等待。它不是一位訪客只載入一次的冷啟動模型，k6也不執行本遊戲Service Worker。用它測HTTP供應與重複請求，將總bytes、VU、請求數和CDN的暖／冷快取狀態一起記錄。

AERO_FULL=1增加3D模組，AERO_WATER=1增加海洋圖。移除兩個旗標可測輕量核心。若要1000、10000、100000 VU，先獲供應者容量與费用安排，再修改stages，使用合適分散式負載來源；單臺電腦不保證產生這種負載。先從較小規模找出瓶頸，不把產生器不足誤判為主機不足。

預設錯誤率<1%、p95<1500ms只是示範閾值，請按目標調整。記錄p50/p95/p99、timeout、429/5xx、CDNhit/miss、來源負載、實際壓縮bytes、總流量與費用；也另外做真實裝置的長時間遊戲測試。

官方文件：
- https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/ramping-vus/
- https://grafana.com/docs/k6/latest/javascript-api/k6-http/batch/
