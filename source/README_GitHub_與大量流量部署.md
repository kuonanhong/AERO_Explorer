> **4.1 更新：**目前目標是 AERO_Explorer；最新步驟與街道圖設定見 [4.1 教程](docs/AERO_v4_1_更新與部署.html)。下文保留舊版部署背景，Google consumer iframe 已停用。

# AERO v4：SmartAction 與大量流量部署

請閱讀最新完整教學：

- [繁體中文使用及部署說明](README_繁體中文.md)
- [可直接開啟的14章HTML教學](docs/AERO_v4_部署教程.html)
- [本次測試與限制](VALIDATION_繁體中文.md)

v4 交付包已有 `SmartAction/games/aero/` 可直接複製至既有 SmartAction repository。不要以遊戲工作流程覆蓋整站原有發布流程。根目錄 `.github/workflows/pages.yml` 是獨立遊戲 repository 的範本，使用前需調整 AERO_ORIGIN。

若修改原始碼，`npm ci` 後執行 `npm run export:smartaction`，會在 `.aero-output/SmartAction/games/aero/` 產生正確 canonical 的新網站，不改動既有原生預覽版。

每位玩家在自己的裝置執行物理與繪圖。這降低伺服器模擬負載，但外部地圖／百科／天氣仍有各自的容量、網路與條款限制。本套件未做10萬人同時連線驗證，亦未提供GitHub Pages流量SLA。

v3歷史教學保留於 `docs/archive/README_GitHub_v3.md`。
