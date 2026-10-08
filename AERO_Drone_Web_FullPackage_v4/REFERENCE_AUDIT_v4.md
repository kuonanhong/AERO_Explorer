# v4 本次輸入核對

日期：2026-10-08 UTC。

- 本次上傳的 `AERO_Drone_Web_FullPackage_v3(1).zip` 共 78 個檔案，與修改前 v3 checkout 相同；v4 在此基礎上修改。
- 三張手機／筆電截圖均以本次上傳的本機檔案讀取及檢視。v4 將儀表、任務、提示、景點故事、拍照及搖桿全部移出 `#flight`；視窗只含渲染 canvas、可選 Google 畫面與十字準星。
- 三個 ChatGPT 對話網址在本次公開網頁擷取回傳 DisabledError，不能宣稱完整讀取該處內容。實作依據本次明列需求、可讀取的 v3 原始碼與截圖。
- `翱祥模擬器v2(3).zip` 為先前核對過的編譯 Unity 程式；未執行未知 EXE、未將其封閉資產拆出再散布。Phoenix 僅作操作類型參考，未複製受保護模型、照片或程式碼。
- 新增 14 張外部真實照片，來源、作者、授權、改作、拍攝日期（可得時）及 SHA256 均列於 `dist/assets/photos/manifest.json`；署名頁為 `dist/assets/photos/PHOTO_CREDITS.html`。
- 兩張 360 圖是原始來源明確標記的 360×180／等距柱狀投影；不是以一般照片假冒全景。奧地利森林與竹南公園保留各自真實座標。
- 太平山景點座標依官方森林旅遊頁的定位點；一般照片 manifest 仍保留來源近似錨點說明。目的地代表入口或地標位置，並非照片拍攝機位的測量成果。
- Google 無金鑰 consumer embed 相容端點與正式 Maps URL 有區別；正式 Embed API 和 Google 3D 需站主設定。HTTP 回傳成功不等於瀏覽器成功繪圖，實際測試結果另列驗證報告。
