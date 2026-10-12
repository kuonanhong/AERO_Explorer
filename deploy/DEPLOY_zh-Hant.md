# AERO Explorer：GitHub 上傳、整理舊檔與模型託管

查核日期：2026-10-11。目標儲存庫：[kuonanhong/AERO_Explorer](https://github.com/kuonanhong/AERO_Explorer)。網站：[AERO Explorer](https://kuonanhong.github.io/AERO_Explorer/)。

**將完成建置的 `AERO_Explorer/` 內容發布到儲存庫根目錄，再啟用 GitHub Pages。** `git diff` 只顯示差異；`git push` 才上傳提交。`git pull` 是把遠端更新抓回本地。

## 1. 本次觀察到的 GitHub 結構

以唯讀 Git clone 檢查 main，提交為 `097a217148a013b6d4bfae33c2760958cf93aa22`：319 個追蹤檔案，共 60,580,757 bytes。根目錄的 `index.html` 是 7,943,036 bytes 的單檔版；另有三份重複或開發用資料：

| 路徑 | 檔案數 | 本次發布處理 |
|---|---:|---|
| `AERO_Explorer/` | 88 | 新版執行檔改放根目錄，移除舊副本 |
| `SmartAction/games/aero/` | 88 | 此儲存庫不需要第二個網站副本 |
| `source/` | 138 | 完整原始碼保留在交付 ZIP；網站發布目錄不放開發副本 |
| `PACKAGE.json`、`SHA256SUMS.txt`、`START.html` | 3 | 舊版交付包索引，不是新網站執行所需 |
| `README.md` | 1 | 保留 |
| 根目錄 `index.html` | 1 | 更新為新版入口 |

附帶 `legacy-v41-cleanup.json` 列出上面 317 個可清理檔案與各自 SHA-256。**只有執行時內容仍完全相同的舊檔才會刪除；若已修改，脚本停止，保留您的修改供檢查。** 未列出的其他檔案不刪除。這是一般 Git 提交，舊內容仍可從歷史取回；不重寫歷史、不強制推送。儲存庫之後若已由您更新，請以執行時的預覽為準。

新版的 HTML 與必要 JavaScript 位於發布根目錄。圖片、模型或語系若有相依路徑，依發布包內容一起複製；不要只取 `index.html`，也不要手動改引用檔名。`source/`、本份教學、測試、上傳腳本、ZIP 不需要放進網站。

## 2. 準備終端機與登入

macOS/Linux 使用 Terminal；Windows 使用 **Git Bash**。手機和平板可以玩網頁，但此上傳腳本請在有 Bash、Git、Python 3.9+ 的電腦執行。若 Windows 顯示找不到 `python3`，腳本會嘗試 `python`；需要先安裝 Python 並加入 PATH。

檢查工具：

```bash
git --version
python3 --version
gh --version
```

`gh` 是選用的 GitHub CLI，從 [官方安裝頁](https://cli.github.com/) 安裝。已有 GitHub Desktop/Git Credential Manager 登入或 SSH 金鑰者，可以沿用。用 CLI 登入通常不必自己申請 PAT：

```bash
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git --hostname github.com
gh auth status
```

依瀏覽器畫面登入 `kuonanhong`。腳本不要求把 token 寫進網址、HTML、命令歷史或設定檔；Git 使用已配置的認證方式。[GitHub CLI 登入說明](https://cli.github.com/manual/gh_auth_login)

## 3. 首次發布：預覽，再上傳

先解壓縮完整交付包。以下假設解壓後的目前資料夾內同時有 `AERO_Explorer/` 和 `deploy/`。`--workdir` 是獨立的發布用 clone，不是原始碼資料夾。

```bash
cd "/請改成解壓後完整套件的路徑"

bash deploy/publish-aero.sh \
  --release ./AERO_Explorer \
  --workdir ../AERO_Explorer-publish \
  --cleanup-manifest ./deploy/legacy-v41-cleanup.json
```

第一次執行會 clone 儲存庫並顯示 `ADD / UPDATE / DELETE owned` 清單，**尚未替換網站或上傳**。檢查清單後，設定這個 clone 的提交者名稱及信箱；信箱請使用您在 GitHub Settings → Emails 顯示的正確信箱或 noreply 信箱：

```bash
git -C ../AERO_Explorer-publish config user.name "kuonanhong"
git -C ../AERO_Explorer-publish config user.email "請填您的GitHub信箱"
```

正式發布：

```bash
bash deploy/publish-aero.sh \
  --release ./AERO_Explorer \
  --workdir ../AERO_Explorer-publish \
  --cleanup-manifest ./deploy/legacy-v41-cleanup.json \
  --message "Publish AERO Explorer v5" \
  --apply
```

腳本依序驗證檔案大小與路徑、檢查遠端來源/分支/未提交修改、fetch、只允許 fast-forward 同步、複製新版、清理清單內且雜湊相符的舊檔、顯示 staged diff 摘要、commit、push。每次發布會記錄新一版的自有檔案清單，後續僅移除本工具原先發布且新版已不再需要的檔案。

若要保留所有舊副本，兩次指令都省略 `--cleanup-manifest`。若使用已設定的 SSH，兩次指令皆加上：

```bash
--repo git@github.com:kuonanhong/AERO_Explorer.git
```

腳本預設只操作 main。已存在的發布 clone 必須乾淨且 origin 正確；遇到未提交檔案，腳本不替您丟棄或 stash。可以另選新的 `--workdir` 來保留原工作區。

## 4. GitHub Pages 一次性設定

開啟 [儲存庫 Pages 設定](https://github.com/kuonanhong/AERO_Explorer/settings/pages)：

1. **Build and deployment → Source → Deploy from a branch**。
2. Branch 選 **main**，資料夾選 **/ (root)**，按 Save。
3. 到 Actions 查看 `pages build and deployment` 結果。
4. 成功後開啟 [https://kuonanhong.github.io/AERO_Explorer/](https://kuonanhong.github.io/AERO_Explorer/)。

發布腳本會加上 `.nojekyll`，讓已建置的静態檔案直接發布。若之前設定為 GitHub Actions 自訂部署，請明確切換成上述分支來源，或由您維護既有 workflow。脚本不刪除既有 workflows，也不更動帳號/Pages 設定。[官方分支發布設定](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

`git push` 成功只表示 Git 儲存庫收到檔案，不能當作 Pages 已部署成功。更新後若仍見舊畫面，先查看 Actions，然後重新載入頁面；必要時清除該網站舊版快取。

## 5. 以後有更新

在新版交付包目錄再次執行：

```bash
bash deploy/publish-aero.sh \
  --release ./AERO_Explorer \
  --workdir ../AERO_Explorer-publish

bash deploy/publish-aero.sh \
  --release ./AERO_Explorer \
  --workdir ../AERO_Explorer-publish \
  --message "Update AERO Explorer" \
  --apply
```

此時通常不再需要 `--cleanup-manifest`。沒有差異就不建立空提交。若預覽提示 clone 落後，先在乾淨 clone 更新：

```bash
git -C ../AERO_Explorer-publish pull --ff-only
```

常用檢查：

```bash
git -C ../AERO_Explorer-publish status
git -C ../AERO_Explorer-publish diff
git -C ../AERO_Explorer-publish diff --cached
git -C ../AERO_Explorer-publish log -5 --oneline
```

`git diff` 不會上傳，也不包含未追蹤檔案。腳本在 commit 前顯示 diff 摘要；上傳後可用 `git show --stat HEAD` 看本次已提交的變更。

若 push 因認證失敗，提交仍保留在 clone。修好登入後，在該 clone 執行 `git push origin main`。若別人同時更新遠端造成拒絕，先檢查 `git status`、`git fetch origin` 與雙方提交，處理衝突後再推送；不要加 `--force`。

需要撤回時，先確認錯誤版本的提交 SHA，再用 `git revert 那個SHA` 產生反向提交、`git push origin main`；請勿直接重設遠端歷史。

## 6. 需要申請 GitHub PAT 嗎？

**已有 GitHub CLI 瀏覽器登入、SSH 或 Credential Manager 認證就不必另外手動申請。** 如果您要用 HTTPS + PAT：

1. GitHub 右上角頭像 → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token。
2. Token name 填 `AERO Explorer publish`；設定合適到期日。
3. Resource owner 選 `kuonanhong`。
4. Repository access 選 **Only select repositories**，只勾 `AERO_Explorer`。
5. Repository permissions：**Contents → Read and write**；Metadata 讀取通常會自動加入。
6. 本腳本不修改 `.github/workflows`，所以不需要 Workflows 寫入權限；若日後確實要推送 workflow 才另外授權。
7. Generate token，妥善保存。使用 HTTPS Git 提示帳號時填 `kuonanhong`，提示密碼時貼上 token，而非 GitHub 登入密碼；讓作業系統的 Credential Manager 管理。

不要把 PAT 放進公開網頁或模型 manifest，不要寫成 `https://TOKEN@github.com/...`。Fine-grained PAT 可限定儲存庫，不需要為此開放所有儲存庫。[GitHub 官方 PAT 教學](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

## 7. 模型、權重怎麼上傳？

**靜態網頁託管只提供下載檔案，不會執行 Python/伺服器推論。** 瀏覽器模型由玩家的 CPU/WASM 或支援的 GPU 執行；真正的伺服器推論需要獨立後端。GitHub Pages 不支援 server-side Python 等程式。[Pages 說明](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)

一般 Git 單檔超過 **100 MiB** 會被 GitHub 拒絕；Pages 已發布網站不可超過 **1 GB**。**Git LFS 不能直接用於 GitHub Pages**，把大權重改成 LFS 指標不會使瀏覽器自動取得實際模型。因此本腳本會拒絕過大的檔案與 LFS 指標，保護發布結果。[大檔限制](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github) · [Pages 限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) · [LFS 與 Pages](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage)

小模型所有單檔都不超過 100 MiB、整個網站小於 1 GB 時，可額外加入：

```bash
bash deploy/publish-aero.sh \
  --release ./AERO_Explorer \
  --workdir ../AERO_Explorer-publish \
  --models ./my-small-model \
  --apply
```

它會保留模型內部結構，放入網站 `models/`。之後每次發布要保留這些模型，就要繼續提供相同 `--models`。如果原本就已在 `AERO_Explorer/models/` 裡，不要重複指定。更改模型下載位置後，也要更新網站模型設定，不能只上傳權重卻保留舊網址。

較大的權重建議放 Hugging Face 模型儲存庫或 R2，網站只放模型識別、版本、授權與下載網址。需保留模型卡、原始作者、授權與所需 tokenizer/config/ONNX 等完整相依檔案；分割檔案只有在推論程式支援該格式時才有用。

### Hugging Face：公開模型儲存庫

安裝 CLI 並登入；請自行完成網站帳號與相關授權條款：

```bash
python3 -m pip install -U huggingface_hub
hf auth login
```

將已下載、確定可再散布的完整模型放進 `./model-files`，加入含模型來源/授權/版本的 `README.md`。把下面 `您的HF帳號` 換成真正帳號：

```bash
bash deploy/upload-models.sh \
  --provider hf --models ./model-files \
  --target 您的HF帳號/aero-guide-model

bash deploy/upload-models.sh \
  --provider hf --models ./model-files \
  --target 您的HF帳號/aero-guide-model --apply
```

第一次沒有同名 repo 時，`hf upload` 會建立公開模型儲存庫；既有 repo 可見性不變。腳本不刪除遠端檔案。公開網站需要可匿名讀取的權重；私有權重需要有認證的後端，不能把讀取 token 寫進前端。

模型檔案網址格式為 `https://huggingface.co/帳號/模型名/resolve/固定提交SHA/檔案路徑`。發布時建議固定 SHA，避免上游更新導致格式變動。下載或上傳後的本機快取不必發布。[HF CLI 官方說明](https://huggingface.co/docs/huggingface_hub/en/guides/cli)

### Cloudflare R2：自有大型資產儲存空間

在 Cloudflare 建立專用 bucket、建立僅可寫入該 bucket 的 S3 API 憑證，安裝 AWS CLI。以命名 profile 設定；此過程在您本機輸入憑證：

```bash
aws configure --profile aero-r2
```

Region 可填 `auto`，output 填 `json`。下面填入 Cloudflare 的 32 字元 Account ID 與實際 bucket 名稱：

```bash
bash deploy/upload-models.sh \
  --provider r2 --models ./model-files \
  --target 您的bucket/models/aero-guide \
  --account-id 您的32字元AccountID

bash deploy/upload-models.sh \
  --provider r2 --models ./model-files \
  --target 您的bucket/models/aero-guide \
  --account-id 您的32字元AccountID --apply
```

上傳使用 `aws s3 sync`，不帶 `--delete`。正式提供下載請接上自己的網域並配置 CORS；`r2.dev` 是有流量限制的測試入口，不適合高流量正式服務。附帶的 `r2-cors.example.json` 限定 `https://kuonanhong.github.io` 可 GET/HEAD，若網站改網域請同步調整。CORS 設定的 Origin 是主機名稱，不含 `/AERO_Explorer/` 路徑。模型 MIME/type、壓縮、Range/快取策略請與使用的推論 runtime 相容。[R2 AWS CLI](https://developers.cloudflare.com/r2/examples/aws/aws-cli/) · [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)

## 8. 免費與付費平台比較

沒有可承諾「任何大小單檔、永久免費、無限頻寬、無限 CPU/GPU」的通用平台。容量、單檔、建置、下載流量、運算和費用是不同限制。以下為 2026-10-11 官方文件查核；購買或大量部署前請重新查看方案。

| 平台 | 適用用途 | 免費/付費與重要限制 |
|---|---|---|
| GitHub Pages | 本遊戲靜態 HTML/JS/CSS | 公開 repo 可用；已發布網站 ≤1 GB；月頻寬軟限制 100 GB；一般 Git 單檔 ≤100 MiB；不能執行後端或直接用 LFS 承載 Pages 資產。 |
| Cloudflare Pages | 靜態遊戲與選用 Functions | Free 每月 500 builds、20,000 檔；單一靜態資產 ≤25 MiB。Functions 另計 Workers 額度；大權重放 R2。 |
| Cloudflare R2 | 模型、照片、影片等大型物件 | Standard 有每月 10 GB-month 儲存免費額度；超額依儲存/操作計費。Multipart 實際單物件上限約 4.995 TiB；不是任意大小。提供儲存，不執行模型。 |
| Hugging Face 模型 repo | 模型/權重、版本與模型卡 | 公開免費容量採 best-effort，受帳號方案與使用政策限制；單檔硬上限 500 GB，建議分塊 <200 GB。儲存模型本身不等於免費推論。 |
| Hugging Face Spaces | 靜態展示、Gradio/Docker AI 服務 | Static Spaces 免費；**目前建立 Gradio/Docker compute Space 需付費計畫**（免費個人帳號另有合資格 ZeroGPU 例外）。CPU Basic 本身無每小時計費，但不能據此宣稱任意帳號免費建立 CPU 服務；硬體、持續運作另看方案。 |
| Render | 靜態網站與 Node/Python 後端 | 有免費靜態/網頁服務；免費 web service 閒置 15 分鐘會休眠、重啟約一分鐘；檔案系統暫存，持久磁碟需付費。後端可用付費規格運行小模型；依 RAM/CPU 評估。 |
| Vercel | 靜態網站、前後端 API | Hobby/Pro；CLI 上傳「全部來源檔案合計」上限 Hobby 100 MB / Pro 1 GB，這不是每個檔案額度。Functions 另有時間/記憶體/流量限制；大模型用物件儲存或專用推論後端。 |

對本遊戲的配置建議：**網頁用 GitHub Pages 或 Cloudflare Pages；大權重用 HF/R2；只有需要伺服器生成回答时再接付費 CPU/GPU 後端。** 低階手機保留資料導覽，模型按需下載，避免進站即下載整個模型。

10 萬名訪客各自運行遊戲可把模擬運算分散到裝置，但下載、照片、地圖與 AI API 仍受配額限制。例如每人首次下載 400 MB 權重，10 萬人就是約 40 TB 傳輸；這只是容量算例，不是本包模型的宣告大小。公開服務承諾需實際負載測試、CDN 快取、供應商配額與成本監控，不能用靜態架構保證「10 萬人不當機」。

官方參考：

- [GitHub Pages 限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [Cloudflare Pages 限制](https://developers.cloudflare.com/pages/platform/limits/)
- [Cloudflare R2 限制](https://developers.cloudflare.com/r2/platform/limits/)；[R2 費用](https://developers.cloudflare.com/r2/pricing/)
- [Hugging Face 儲存限制](https://huggingface.co/docs/hub/en/storage-limits)；[Spaces Overview](https://huggingface.co/docs/hub/en/spaces-overview)
- [Render 免費方案](https://render.com/docs/free)
- [Vercel 平台限制](https://vercel.com/docs/limits)

## 9. 腳本驗證範圍

`test-publish.py` 使用暫存的本機 bare Git repository 驗證預覽、commit/push、重複執行、舊自有檔案清理、保留無關檔案、拒絕髒工作區、錯誤 origin、未推送本機提交、雜湊不符清理、大檔、LFS 指標、憑證網址及符號連結。沒有對您的 GitHub 儲存庫實際推送。

```bash
python3 deploy/test-publish.py
```

腳本在 Linux Bash + Python 下完成整合測試；macOS Bash 3.2 與 Windows Git Bash 的路徑相容處理已納入，但未以您的實體電腦執行。模型上傳需您自己的 HF/R2 帳號與已設定的 CLI，交付時沒有替您建立帳號、付費資源或上傳模型。
