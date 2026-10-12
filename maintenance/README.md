# 景點資料維護

這個資料夾不需要發布到網站。

安裝維護依賴：`python3 -m pip install Pillow opencc-python-reimplemented==0.1.7`。

重建本次快照：先在本目錄解開 source-snapshots.zip，再執行以下指令；除公開資料外沒有原簡報 PDF。

```bash
python3 -m zipfile -e source-snapshots.zip .
python3 -c "from zipfile import ZipFile; from pathlib import Path; Path('raw/taiwan-zh.json').write_bytes(ZipFile('raw/taiwan-zh.zip').read('AttractionList.json'))"
python3 build-catalogue.py
```

更新官方資料可用 `bash refresh-catalogue.sh`。資料庫內容可能變動，請檢查座標、重複、文字與授權；腳本不會自動發布。石朗列為潛點練習，對應水下照片及潛艦。

照片維護：`python3 download-photos.py` 使用附帶 Commons metadata，下載並轉 WebP；輸出 images/ 和 photo-additions.json。每次更新需重新核對作者與授權，不要直接使用原資料表中未核准的 sourceImages。新照片不要重複追加 manifest 的同一 ID。

審核後將 catalogue-index.json、16 個 catalogue-details-?.json 放 source/dist/assets；照片放 source/dist/assets/photos/images 並合併 manifest；重新建置/匯出。完整歷史 catalogue-details.json 只供維護，不必部署。
