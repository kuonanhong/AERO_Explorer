# AERO Explorer 一鍵上傳

這一版使用單一 `upload-aero.sh`。不用輸入多行參數、不用 `--apply`，也不必自行操作 `git add`、`commit` 或 `push`。執行後會將 `AERO_Explorer/` 裡的網站檔案提交到 `kuonanhong/AERO_Explorer` 的 `main` 分支。

## Mac 使用方式

1. 解壓完整套件。套件中應有 `AERO_Explorer/`（內含 `index.html`）與 `upload-aero.sh`。腳本放在 `deploy/` 也可以。
2. 在終端機切換到解壓後的套件資料夾。您可以先輸入 `cd `（含最後一個空格），把 Finder 中的套件資料夾拖進終端機，再按 Enter。
3. 第一次使用需有 Git、Python 3.9+、GitHub CLI。若已安裝 Homebrew，可執行：

```bash
brew install git python gh
```

若沒有 Homebrew，不需要為了腳本輸入網路下載管線；可分別從 [Git](https://git-scm.com/downloads)、[Python](https://www.python.org/downloads/) 與 [GitHub CLI](https://cli.github.com/) 官方網站安裝。macOS 的 Git 也可透過 `xcode-select --install` 安裝。

4. 執行：

```bash
bash upload-aero.sh
```

若腳本仍放在 `deploy/`，改為：

```bash
bash deploy/upload-aero.sh
```

這兩種方式擇一即可。**這次會真正上傳，不是預覽。** 初次或憑證失效時，依終端機提示開啟瀏覽器、輸入 GitHub 一次性驗證碼並登入 `kuonanhong`。若使用其他帳號，該帳號必須有這個儲存庫的寫入權限。腳本會先檢查登入帳號與倉庫權限，再處理發布檔案。

## 為什麼「denied to kuonanhong」仍可能出現？

`Permission to kuonanhong/AERO_Explorer.git denied to kuonanhong`／HTTP 403 表示 GitHub 拒絕本次寫入。即使顯示正確帳號，憑證也可能缺少這個倉庫的 Contents 寫入授權，或尚未完成組織授權；不是檔案中的行尾空白造成。

腳本會使用 GitHub CLI 的登入資訊，並在**專用發布 clone** 指定 GitHub CLI 為憑證來源，以免舊的鑰匙圈憑證優先被使用。它不會刪除整台電腦的 GitHub 憑證，不會把 token 寫進 Git 網址或套件。若真正推送時仍遇 403，會嘗試開啟瀏覽器重新授權一次，再接續推送。

如果您的終端機設定過 `GH_TOKEN` 或 `GITHUB_TOKEN`，它們會優先於瀏覽器登入；當這類 token 權限不足時，腳本會請您先執行：

```bash
unset GH_TOKEN GITHUB_TOKEN
bash upload-aero.sh
```

不要把 PAT 貼到聊天、腳本或 Git URL。以 GitHub CLI 瀏覽器登入通常不必手動申請 PAT。若您自行選擇 PAT，fine-grained token 需選取 `AERO_Explorer`，並授予 **Contents: Read and write**；組織倉庫可能另有 SSO／核准要求。請參考 [GitHub PAT 官方說明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)。

## 前次已 commit／已暫存，不必重新開始

腳本預設尋找套件上一層的 `AERO_Explorer-publish`，因此可接續舊腳本留下的專用發布資料夾。

- 已 commit、但 push 遇 403：核對每個待上傳 commit 的 AERO 檔案清單後，保留原 commit 並接續。
- 已完整暫存、尚未 commit：核對暫存區清單後接續。
- 新腳本在複製／暫存途中中斷：會以保存在 `.git` 裡的更新記錄核對舊／新檔案內容，再接續。
- 有其他自行修改、額外暫存或非 AERO commit：會保留資料並停止，不會把它們夾帶上傳，也不會自動 stash、reset、強制 push 或刪除整個資料夾。

若出現最後一種情況，最簡單的方式是保留原發布資料夾，另建專用 clone：

```bash
bash upload-aero.sh --workdir ../AERO_Explorer-publish-new
```

這會從遠端最新版本開始上傳手上的網站套件；舊資料夾與其中的未完成工作完全保留。只有遠端未收錄的額外個人修改不會自動搬到新 clone，需要您自行比對後放入網站原始檔。

若網站與腳本放在不同位置，也可明確指定：

```bash
bash upload-aero.sh --release "/完整路徑/AERO_Explorer" --workdir "/完整路徑/AERO_Explorer-publish"
```

## 會上傳、保留與清理哪些內容？

- 來源是 `AERO_Explorer/` 中的網站 HTML、JavaScript、CSS、資料、圖片與必要執行檔。
- 不會把完整 ZIP、部署工具、原始碼開發資料夾或個人密鑰當作網站發布。
- 只暫存這個版本需要更新的網站檔案與可核對歸屬的舊檔刪除；儲存庫其他檔案（例如未包含於網站套件的個人 README）會保留。
- 舊 v4.1 重複檔案清單已內嵌；只有符合已知 SHA-256 的舊檔才會清除。改過的舊檔會使腳本停止，避免誤刪。
- 超過 GitHub 一般 Git 單檔 100 MiB 限制的模型會停止上傳，並提示改用 Hugging Face／物件儲存。GitHub Pages 也不是大型模型運算主機。
- `trailing whitespace` 不再阻擋產生的套件碼；真正的衝突標記仍會停止提交。

## 上傳完成後

腳本顯示「上傳成功」代表 Git 推送成功；GitHub Pages 的建置可能尚未結束。請開啟：

- [部署進度](https://github.com/kuonanhong/AERO_Explorer/actions)
- [網站](https://kuonanhong.github.io/AERO_Explorer/)

若尚未啟用 Pages，在儲存庫 **Settings → Pages → Build and deployment** 選 **Deploy from a branch → main → /(root)**。若已有自訂 GitHub Actions 發布流程，請沿用並確認該流程發布的是根目錄網站。

Mac Chrome 可按 `Command + Shift + R` 強制重新載入。網站快取更新與 Pages 建置是不同步驟；先確認 GitHub Actions 已完成，再檢查畫面。

## 跨平台與測試範圍

支援 macOS Bash 3.2+、Linux Bash 與 Windows Git Bash（需 Python 3.9+、Git、GitHub CLI）。本次以本機 bare Git 倉庫測試新發布、冪等更新、已提交／已暫存接續、中斷重跑、403 登入重試、錯誤 origin、遠端分歧與未提交個人檔案保護；沒有在使用者的 Mac 上代為登入或推送。Windows 路徑與控制台登入已納入程式，尚未以實體 Windows 驗證。
