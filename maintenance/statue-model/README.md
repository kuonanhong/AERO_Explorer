# 自由女神像模型：可重製轉換工具

這個目錄是維護工具，不是網頁執行時需要的檔案。GitHub／原生示範站的平面發布只需要 `dist/assets/models/` 中的六個輸出檔案。

## 來源與授權

- 作品：**Statue Of Liberty**，作者 **Gravity Jack**。
- 作者作品頁：https://sketchfab.com/3d-models/statue-of-liberty-84094e8d5e724b5c882cf576ca12e44e
- 作者頁：https://sketchfab.com/gravityjack
- 授權：**Creative Commons Attribution 4.0 International（CC BY 4.0）**。
- 授權條款：https://creativecommons.org/licenses/by/4.0/
- 取得管道：Allen Institute for AI 的 **Objaverse 1.0** 公開資料集。
- 原始檔下載：https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-115/84094e8d5e724b5c882cf576ca12e44e.glb
- 原始檔 SHA256：`581d99fd34e0ec5c1423cccccf9b0fb9f564f2d134bbb99d16a9e7ba8f1ee792`
- 原始檔大小：**5,854,228 bytes**。

附帶 `source/statue-liberty-original.glb`，因此重製時不需要登入、註冊或下載其他模型。原始 GLB 自帶作者、來源、CC BY 4.0 授權 metadata；作者公開作品頁另顯示 CC Attribution。`SOURCE-LICENSE.txt` 保留完整署名與修改說明。若重新分發原始檔或衍生物，請一起保留署名、來源、授權連結及修改說明。

**這是作者使用 ZBrush、Maya 與 Substance Painter 建立的寫實藝術模型，不是紐約現場測繪、雷射掃描或攝影測量資料。** 材質貼圖來自原作者的 PBR 模型，並非把單張旅遊照片貼在平面上；材質本身也不應宣稱為現場照片。模型有完整正面、背面及側面幾何，但不能作為工程測量或實際飛行導航依據。

## 一次安裝、重製

以下指令從專案根目錄執行；Python 3.12 已驗證。先建立獨立環境安裝維護依賴：

```bash
python3 -m venv .venv-model-tools
source .venv-model-tools/bin/activate
python -m pip install -r maintenance/statue-model/requirements.txt
python maintenance/statue-model/rebuild_statue.py --output ./rebuilt-statue-model
```

Windows 可使用 Python 3.12，啟用環境的指令改成 PowerShell 的 `.venv-model-tools\Scripts\Activate.ps1`；後兩行 Python 指令相同。這些依賴只在重建資產時需要，玩家不用安裝 Python。

`rebuild_statue.py` 的預設輸入是本目錄附帶的 GLB，預設輸出是目前工作目錄下的 `rebuilt-statue-model/`。可以自訂：

```bash
python maintenance/statue-model/rebuild_statue.py \
  --source ./maintenance/statue-model/source/statue-liberty-original.glb \
  --output ./rebuilt-statue-model
```

工具會先核對原始檔 SHA256 與內嵌授權；來源不符即停止。輸出已存在時也會停止，避免無意覆蓋。確認後要重建正式資產，可明確指定：

```bash
python maintenance/statue-model/rebuild_statue.py \
  --output ./dist/assets/models \
  --overwrite
```

工具只會替換自己的六個固定輸出名稱，不會刪除目錄內的其他檔案。

## 六個輸出

| 檔案 | 用途 |
|---|---|
| `statue-liberty.mesh.json` | 34,977 個頂點、56,931 個三角形，含三組 mesh 的位置、法線、UV 與索引 |
| `statue-liberty-body.jpg` | 原模型頭部、手臂與火炬等部位的底色貼圖 |
| `statue-liberty-robes.jpg` | 原模型衣袍的底色貼圖 |
| `statue-liberty-lite.mesh.json` | Canvas 簡化版：974 個頂點、1,800 個三角形、逐面法線與顏色 |
| `model-manifest.json` | 作者、來源、授權、修改步驟、尺寸、檔案大小及 SHA256 |
| `MODEL-CREDITS.txt` | 隨發布檔保留的署名 |

輸出合計約 4.41 MB。`expected-sha256.json` 是本次交付的 manifest 快照，可比對其中 `models[0].files` 的 SHA256。固定套件版本及本次平台下已重製並逐檔比對；更換 JPEG 函式庫或浮點／網格簡化工具版本時，二進位雜湊可能改變，請重新檢查視覺效果並保留新的 manifest。

## 轉換與座標

1. 套用原 GLB 的節點座標轉換。
2. 水平包圍盒置中、雕像底面設為 y=0。
3. 等比例縮放至 **46.05 公尺**，保留原雕像比例。
4. 將原本朝 +X 的正面旋轉至 **+Z**；上方為 **+Y**。
5. 位置、法線保留五位小數，UV 保留六位小數；貼圖採原底色圖、至多 1024 像素、JPEG quality 88。
6. 為輕量瀏覽器省略原 normal／metallic-roughness 貼圖，以固定 PBR 參數替代。
7. 焊接同位置頂點，以二次誤差邊收縮產生 1,800 三角形 Canvas LOD，從原底色圖取樣每個面的顏色。

完整模型 texture 應設定 `flipY=false`。JSON 內貼圖與 Lite URL 是與模型 JSON **同目錄**的相對檔名；平面發布時請把這些檔案一起搬到網站根目錄。

雕像模型**不含建築基座及紐約港環境**。遊戲場景應把雕像底面放在模擬基座頂端 **46.94 公尺**，讓地面至火炬頂端為 **92.99 公尺**。三個尺寸及雕像實際朝東南的資料來源是美國國家公園管理處：

https://www.nps.gov/stli/learn/historyculture/statue-statistics.htm

依官方高度等比縮放不代表每個細部都已實測校準。正面／背面／左右側面的幾何外觀已用離線軟體渲染檢查；Canvas LOD 明顯較低精細度，僅供低運算裝置導航顯示。

## 維護範圍

這個轉換器特別鎖定附帶且已驗證授權的原始 GLB，不是一般模型匯入器。更換另一個模型需要重新確認作者、授權、來源、座標與幾何格式；不要直接繞過 SHA256 檢查套用未知檔案。
