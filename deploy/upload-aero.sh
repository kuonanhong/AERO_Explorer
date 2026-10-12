#!/usr/bin/env bash
# AERO 一鍵上傳；macOS Bash 3.2+ / Linux / Git Bash, Git, Python 3.9+, GitHub CLI.
# Put beside AERO_Explorer/ (or in deploy/), then: bash upload-aero.sh
set -euo pipefail
if command -v python3 >/dev/null 2>&1; then
  aero_python=python3
elif command -v python >/dev/null 2>&1; then
  aero_python=python
else
  printf '%s\n' '請先安裝 Python 3.9+；macOS 可執行 brew install python。' >&2
  exit 1
fi
AERO_UPLOAD_SCRIPT=$(cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")
export AERO_UPLOAD_SCRIPT
if command -v cygpath >/dev/null 2>&1; then
  AERO_UPLOAD_SCRIPT=$(cygpath -w "$AERO_UPLOAD_SCRIPT")
fi
aero_args=()
aero_path_next=0
for aero_arg in "$@"; do
  if [ "$aero_path_next" -eq 1 ] && command -v cygpath >/dev/null 2>&1; then
    aero_arg=$(cygpath -w "$aero_arg")
  fi
  aero_args+=("$aero_arg")
  aero_path_next=0
  case "$aero_arg" in --release|--workdir) aero_path_next=1 ;; esac
done
"$aero_python" - "${aero_args[@]}" <<'AERO_PYTHON'
import argparse, base64, hashlib, json, os, re, shutil, subprocess, sys, tempfile, zlib
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

# Only release files are staged. Credentials are never placed in URLs or printed.
P = argparse.ArgumentParser(description='AERO 一鍵上傳：自動找網站資料夾、接續中斷、登入 GitHub，然後上傳。')
P.add_argument('--release', help='含 index.html 的 AERO_Explorer 資料夾；通常不必指定')
P.add_argument('--workdir', help='專用發布 clone；通常不必指定')
P.add_argument('--repo', default='https://github.com/kuonanhong/AERO_Explorer.git')
P.add_argument('--branch', default='main')
P.add_argument('--message', default='Publish AERO Explorer update')
A = P.parse_args()
ROOT = Path(os.environ['AERO_UPLOAD_SCRIPT']).resolve().parent
MANIFEST = '.aero-release-manifest.json'
STATE = 'aero-upload-state.json'
LEGACY = json.loads(zlib.decompress(base64.b64decode('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')))['files']
MAXFILE = 100 * 1024 * 1024
work = None

def stop(message):
    raise SystemExit('\n停止：' + message)

def say(message):
    print(message, flush=True)

def command(cmd, cwd=None, check=True, interactive=False):
    kwargs = dict(cwd=cwd, env=os.environ.copy())
    tty = None
    if interactive:
        try:
            tty = open('CONIN$' if os.name == 'nt' else '/dev/tty', 'r')
            kwargs['stdin'] = tty
        except OSError:
            stop('需要在您電腦的互動式終端機完成登入。請先執行 gh auth login --hostname github.com --git-protocol https --web，再重新執行本檔。')
    else:
        kwargs.update(stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        result = subprocess.run(cmd, **kwargs)
    finally:
        if tty:
            tty.close()
    if check and result.returncode:
        # Never echo command arguments, remote URLs or credential-helper output.
        if cmd[0] == 'git':
            stop('Git 操作未完成。您的檔案與 commit 均保留。請先檢查網路、GitHub 權限或分支狀態，再執行本檔重試。')
        stop(cmd[0] + ' 操作未完成；請依上方訊息處理後再執行本檔。')
    return result

def git(*args, check=True):
    return command(['git', *args], cwd=work, check=check)

def gout(*args, check=True):
    return git(*args, check=check).stdout.decode('utf-8', 'replace').strip()

def names(data):
    return [v.decode('utf-8') for v in data.split(b'\0') if v]

def sha(data):
    return hashlib.sha256(data).hexdigest()

def file_sha(path):
    if not path.exists():
        return None
    if not path.is_file() or path.is_symlink():
        stop('檔案類型或符號連結不符合發布要求：' + path.name)
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def safe_name(name):
    p = PurePosixPath(name)
    if not name or p.is_absolute() or '..' in p.parts or any(c in name for c in ('\\', '\n', '\r', '\0', ':')):
        stop('套件含不安全的檔案路徑。')
    if any(v in ('.git', '.github', 'node_modules', '__pycache__') for v in p.parts):
        stop('此檔案不屬於可發布的網站：' + name)
    return name

def target(name):
    path = work / safe_name(name)
    for parent in [path, *path.parents]:
        if parent == work:
            break
        if parent.is_symlink():
            stop('發布位置含符號連結：' + name)
    return path

def normalize(url):
    if url.startswith('git@github.com:'):
        return 'github.com/' + url.split(':', 1)[1].removesuffix('.git').lower()
    if '://' in url:
        u = urlsplit(url)
        if u.scheme in ('http', 'https') and (u.username or u.password):
            stop('Git 網址不應包含 token 或密碼；請使用 gh 登入。')
        if u.hostname == 'github.com':
            return 'github.com/' + u.path.strip('/').removesuffix('.git').lower()
        if u.scheme == 'file':
            return str(Path(u.path).resolve())
        stop('僅支援 GitHub 或本機測試用 Git 倉庫。')
    return str(Path(url).expanduser().resolve())

def blob(ref, name):
    r = git('show', ref + ':' + name, check=False)
    return r.stdout if r.returncode == 0 else None

def manifest(data):
    if data is None:
        return {}
    try:
        obj = json.loads(data)
        files = obj['files']
        assert obj['format'] == 'aero-owned-files-v1' and isinstance(files, dict)
        for name, value in files.items():
            safe_name(name)
            assert name != MANIFEST and re.fullmatch('[0-9a-f]{64}', value)
        return files
    except (ValueError, KeyError, AssertionError, TypeError):
        stop('AERO 檔案清單格式不正確，未修改檔案。')

def exact_tree_manifest(ref):
    raw = blob(ref, MANIFEST)
    owned = manifest(raw)
    if not owned:
        stop('未完成的提交缺少 AERO 檔案清單，因此不自動上傳。請保留原資料夾，使用 --workdir 指定另一個新資料夾。')
    for name, expected in owned.items():
        data = blob(ref, name)
        if data is None or sha(data) != expected:
            stop('未完成的 AERO 提交與檔案清單不一致：' + name)
    return owned

def validate_transition(old_ref, new_ref, changed):
    before = manifest(blob(old_ref, MANIFEST))
    after = exact_tree_manifest(new_ref)
    for name in changed:
        if name == MANIFEST:
            continue
        safe_name(name)
        new = blob(new_ref, name)
        old = blob(old_ref, name)
        if new is not None:
            if name not in after or sha(new) != after[name]:
                stop('未完成的提交含非 AERO 更新，未自動上傳：' + name)
        elif name not in before and (old is None or LEGACY.get(name) != sha(old)):
            stop('未完成的提交含無法確認歸屬的刪除：' + name)
        elif name in before and (old is None or sha(old) != before[name]):
            stop('未完成的提交刪除了已另行修改的 AERO 檔案：' + name)
    return after

def auth_status():
    user = command(['gh', 'api', 'user'], check=False)
    repo = command(['gh', 'api', 'repos/' + github_repo], check=False)
    try:
        u = json.loads(user.stdout or b'{}')
        r = json.loads(repo.stdout or b'{}')
        permission = r.get('permissions', {})
        return user.returncode == repo.returncode == 0 and bool(permission.get('push') or permission.get('admin') or permission.get('maintain')), u
    except ValueError:
        return False, {}

def login():
    if os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN'):
        stop('終端機的 GH_TOKEN／GITHUB_TOKEN 正在覆蓋登入，但權限不足。請先執行 unset GH_TOKEN GITHUB_TOKEN，再執行本檔，以瀏覽器重新登入。請勿把 token 貼在聊天或 Git 網址中。')
    say('請在瀏覽器登入 kuonanhong（或有本倉庫寫入權限的帳號），並完成 GitHub 授權。')
    command(['gh', 'auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web'], interactive=True)
    valid, user = auth_status()
    if not valid:
        stop('登入成功，但此帳號或 token 仍無 AERO_Explorer 寫入權限。若使用 PAT，需授權此倉庫的 Contents: Read and write。原有 commit 已保留。')
    return user

def fetch():
    r = git('fetch', 'origin', A.branch, check=False)
    if r.returncode:
        stop('無法取得 GitHub 最新分支；請檢查網路與登入後再執行。本機更動皆已保留。')

if sys.version_info < (3, 9):
    stop('請安裝 Python 3.9 或更新版本。macOS 可使用 brew install python。')
if not shutil.which('git'):
    stop('請安裝 Git。macOS 可執行 xcode-select --install。')
remote = normalize(A.repo)
github_repo = remote.split('/', 1)[1] if remote.startswith('github.com/') else None
command(['git', 'check-ref-format', '--branch', A.branch])
if A.release:
    release = Path(A.release).expanduser().resolve()
else:
    options = [ROOT/'AERO_Explorer', ROOT.parent/'AERO_Explorer', Path.cwd()/'AERO_Explorer', ROOT, Path.cwd()]
    release = next((v.resolve() for v in options if (v/'index.html').is_file()), None)
    if release is None:
        stop('找不到 AERO_Explorer/index.html。請把本檔放在解壓後的完整套件根目錄（與 AERO_Explorer 資料夾並列），再執行 bash upload-aero.sh。')
if not release.is_dir() or not (release/'index.html').is_file():
    stop('網站資料夾必須直接含有 index.html。')
package = release.parent
work = Path(A.workdir).expanduser().resolve() if A.workdir else (package.parent/'AERO_Explorer-publish').resolve()
if work == release or work in release.parents or release in work.parents:
    stop('發布 clone 必須與網站原始檔放在不同、互不包含的資料夾。')
sources = {}
for path in sorted(release.rglob('*')):
    if path.is_symlink():
        stop('套件含符號連結，請改用原始檔案：' + path.name)
    if not path.is_file():
        continue
    name = path.relative_to(release).as_posix()
    if name == MANIFEST or path.name in ('.DS_Store', 'Thumbs.db'):
        continue
    safe_name(name)
    if any(v.startswith('.env') for v in PurePosixPath(name).parts) or path.suffix.lower() in ('.zip', '.pem', '.key'):
        stop('請勿將壓縮包、私密金鑰或環境密碼放入網站資料夾：' + name)
    if name.split('/')[0] in ('source', 'deploy', 'tools', 'tests', 'node_modules'):
        stop('請使用 AERO_Explorer 網站資料夾，不是完整原始碼資料夾。')
    if path.stat().st_size > MAXFILE:
        stop('單檔超過 GitHub 100 MiB 限制：' + name + '。大型模型請放 Hugging Face 或物件儲存服務。')
    with path.open('rb') as f:
        if f.read(100).startswith(b'version https://git-lfs.github.com/spec/v1'):
            stop('Git LFS 指標不能直接作為 Pages 素材：' + name)
    sources[name] = {'path': path, 'sha': file_sha(path), 'size': path.stat().st_size}
sources['.nojekyll'] = {'path': None, 'sha': sha(b''), 'size': 0}
if sum(v['size'] for v in sources.values()) > 1_000_000_000:
    stop('網站超過 1 GB，請將大型模型／照片另行託管。')
# Check existing clone identity before authentication or any repo mutation.
if work.exists():
    if not (work/'.git').is_dir():
        stop('發布位置已存在，但不是一般 Git clone。請保留它，改用 --workdir 指定新的資料夾。')
    if normalize(gout('config', '--get', 'remote.origin.url')) != remote:
        stop('發布資料夾 origin 指向其他倉庫；未修改檔案。請使用 --workdir 指定新的資料夾。')
    if gout('branch', '--show-current') != A.branch:
        stop('發布資料夾不在 ' + A.branch + ' 分支，未切换或修改它。')
    for marker in ('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply'):
        if (work/'.git'/marker).exists():
            stop('發布資料夾有未完成的 merge/rebase，請先自行處理或另選 --workdir。')
user = {}
if github_repo:
    if not shutil.which('gh'):
        stop('需要 GitHub CLI 修復本機 403 登入。Mac 請先執行 brew install gh；其他系統請依 https://cli.github.com 安裝。安裝後只要重新執行本檔。')
    valid, user = auth_status()
    if not valid:
        user = login()
    say('GitHub 帳號：' + str(user.get('login', '')) + '；已確認倉庫寫入角色。')
    # Configure GitHub CLI integration, then override only this clone to avoid a
    # stale macOS keychain credential taking precedence. No credential is erased.
    command(['gh', 'auth', 'setup-git', '--hostname', 'github.com'])
if not work.exists():
    work.parent.mkdir(parents=True, exist_ok=True)
    say('建立專用發布資料夾：' + str(work))
    cwd_save = work
    work = None
    result = command(['git', 'clone', '--branch', A.branch, '--single-branch', A.repo, str(cwd_save)], check=False)
    work = cwd_save
    if result.returncode:
        stop('建立發布 clone 失敗。請檢查網路與倉庫權限；沒有刪除任何既有資料夾。')
if github_repo:
    # Keep the upstream URL credential-free and use HTTPS for browser login.
    if A.repo.startswith('https://'):
        git('remote', 'set-url', 'origin', 'https://github.com/' + github_repo + '.git')
    git('config', '--local', '--replace-all', 'credential.https://github.com.helper', '')
    git('config', '--local', '--add', 'credential.https://github.com.helper', '!gh auth git-credential')
    git('config', '--local', 'credential.https://github.com.useHttpPath', 'true')
fetch()
remote_ref = 'origin/' + A.branch
if git('merge-base', '--is-ancestor', remote_ref, 'HEAD', check=False).returncode != 0:
    if git('merge-base', '--is-ancestor', 'HEAD', remote_ref, check=False).returncode == 0 and not gout('status', '--porcelain', '--untracked-files=all'):
        git('merge', '--ff-only', remote_ref)
    else:
        stop('遠端已有其他更新，且本機有尚未上傳的變更。為避免覆蓋，請保留此資料夾；用 --workdir ../AERO_Explorer-publish-new 重新執行，會從最新遠端發布本套件。')
ahead = gout('rev-list', '--reverse', remote_ref + '..HEAD').splitlines()
for rev in ahead:
    parents = gout('rev-list', '--parents', '-n', '1', rev).split()
    if len(parents) != 2:
        stop('待上傳記錄含合併提交，不自動上傳；請另選新的 --workdir。')
    changed = names(git('diff', '--name-only', '-z', parents[1], rev).stdout)
    validate_transition(parents[1], rev, changed)
if ahead:
    say('找到 ' + str(len(ahead)) + ' 個已 commit 的 AERO 更新，將保留並接續上傳。')
base_owned = manifest(blob('HEAD', MANIFEST))
index_owned = manifest(blob('', MANIFEST))
staged = names(git('diff', '--cached', '--name-only', '-z').stdout)
journal_path = work/'.git'/STATE
journal = None
if journal_path.exists():
    try:
        journal = json.loads(journal_path.read_text())
        assert journal['base'] == gout('rev-parse', 'HEAD') and isinstance(journal['files'], dict)
    except (ValueError, KeyError, AssertionError, TypeError):
        # Successful commit may have happened immediately before interruption.
        if journal and journal.get('base') in gout('rev-list', 'HEAD').splitlines() and not gout('status', '--porcelain', '--untracked-files=all'):
            journal_path.unlink()
            journal = None
        else:
            stop('中斷記錄與目前 Git 狀態不同；原檔已保留，請另選 --workdir。')
if staged:
    if journal:
        for name in staged:
            data = blob('', name)
            current = sha(data) if data is not None else None
            if name not in journal['files'] or current not in journal['files'][name]:
                stop('中斷後的暫存區含額外變更：' + name + '。未自動上傳。')
    else:
        index_owned = validate_transition('HEAD', '', staged)
    say('已核對前次暫存內容，將接續發布。')
unstaged = set(names(git('diff', '--name-only', '-z').stdout))
untracked = set(names(git('ls-files', '--others', '--exclude-standard', '-z').stdout))
for name in sorted(unstaged | untracked):
    current = file_sha(target(name))
    allowed = journal.get('files', {}).get(name, []) if journal else []
    if current not in allowed or not journal or name not in journal['files']:
        stop('發布資料夾有非本腳本中斷造成的變更：' + name + '。已保留，未自動暫存或覆蓋；可用 --workdir ../AERO_Explorer-publish-new 重新發布。')
# New clones can inherit identity; otherwise use the authenticated account's
# public noreply address locally (never alter global author settings).
if not gout('config', 'user.name', check=False):
    if user.get('login'):
        git('config', '--local', 'user.name', user['login'])
    else:
        stop('請先設定 git config --global user.name "您的姓名"。')
if not gout('config', 'user.email', check=False):
    if user.get('login') and user.get('id'):
        git('config', '--local', 'user.email', str(user['id']) + '+' + user['login'] + '@users.noreply.github.com')
    else:
        stop('請先設定 git config --global user.email "您的信箱"。')
owned = {**base_owned, **index_owned}
legacy = LEGACY if github_repo == 'kuonanhong/aero_explorer' else {}
# Optional package manifest is useful for offline tests or future releases.
legacy_path = ROOT/'legacy-v41-cleanup.json'
if legacy_path.is_file():
    legacy = {**legacy, **manifest(legacy_path.read_bytes())}
new_manifest = (json.dumps({'format': 'aero-owned-files-v1', 'files': {name: sources[name]['sha'] for name in sorted(sources)}}, ensure_ascii=False, indent=2) + '\n').encode()
changes = {}
for name in sorted(set(sources) | set(owned) | set(legacy) | set(journal.get('files', {}) if journal else {}) | {MANIFEST}):
    path = target(name)
    current = file_sha(path)
    if name == MANIFEST:
        desired = sha(new_manifest)
    elif name in sources:
        desired = sources[name]['sha']
    else:
        if current is not None and current != owned.get(name, legacy.get(name)):
            if not journal or current not in journal.get('files', {}).get(name, []):
                stop('舊版檔案已被您修改，未刪除：' + name + '。請先備份或使用新的 --workdir。')
        desired = None
    if desired != current:
        changes[name] = [current, desired]
# The stage must contain only our validated AERO transition; preserved unrelated
# files count towards the Pages size limit, but are never added to the commit.
preserved = 0
for path in work.rglob('*'):
    if '.git' in path.relative_to(work).parts or path.is_symlink() or not path.is_file():
        continue
    name = path.relative_to(work).as_posix()
    if name not in sources and name != MANIFEST and name not in changes:
        preserved += path.stat().st_size
if preserved + sum(v['size'] for v in sources.values()) + len(new_manifest) > 1_000_000_000:
    stop('保留其他檔案後的網站超過 1 GB；尚未套用新變更。')
# Persist ownership before the first mutation. Accept old/new bytes on a retry;
# any third-party edits cause a stop instead of an overwrite.
if changes:
    state = {'base': gout('rev-parse', 'HEAD'), 'files': changes}
    if journal:
        state['files'] = {**journal['files'], **changes}
    temp_state = journal_path.with_suffix('.tmp')
    temp_state.write_text(json.dumps(state), encoding='utf-8')
    os.replace(temp_state, journal_path)
    say('更新網站檔案：' + str(len(changes)) + ' 筆。')
    for name, (_, desired) in changes.items():
        dest = target(name)
        if desired is None:
            dest.unlink()
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            # Write to a sibling temporary path then rename to avoid half files.
            fd, temporary = tempfile.mkstemp(prefix='.aero-upload-', dir=str(work/'.git'))
            os.close(fd)
            try:
                if name == MANIFEST:
                    Path(temporary).write_bytes(new_manifest)
                elif sources[name]['path'] is None:
                    Path(temporary).write_bytes(b'')
                else:
                    shutil.copyfile(sources[name]['path'], temporary)
                os.replace(temporary, dest)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
for name in sorted(set(changes) | set(staged) | set(journal.get('files', {}) if journal else {})):
    if target(name).exists() or gout('ls-files', '--', name):
        git('--literal-pathspecs', 'add', '-A', '--', name)
if gout('diff', '--cached', '--name-only'):
    # Whitespace in generated third-party code is harmless. --check still detects
    # accidental conflict markers; the actual commit never rewrites file bytes.
    git('-c', 'core.whitespace=-blank-at-eol,-blank-at-eof,-space-before-tab', 'diff', '--cached', '--check')
    git('commit', '-m', A.message)
if journal_path.exists():
    journal_path.unlink()
if gout('rev-list', '--count', remote_ref + '..HEAD') == '0':
    say('網站檔案已是最新版本，沒有需要上傳的更動。')
    sys.exit(0)
say('正在上傳 GitHub；若前次曾出現 403，此步會接續原有 commit。')
result = git('push', 'origin', 'HEAD:refs/heads/' + A.branch, check=False)
if result.returncode and github_repo:
    detail = (result.stderr + result.stdout).decode('utf-8', 'replace').lower()
    if any(v in detail for v in ('403', 'permission', 'authentication failed', 'access denied')):
        say('GitHub 拒絕此次寫入。正在重新登入以取得此倉庫的寫入授權；本機 commit 已保留。')
        user = login()
        result = git('push', 'origin', 'HEAD:refs/heads/' + A.branch, check=False)
if result.returncode:
    stop('GitHub 尚未接受上傳。所有檔案和 commit 都保留在 ' + str(work) + '。若是 403，請確認 PAT Contents: Read and write／組織授權；若是遠端更新，請用新的 --workdir。處理後重新執行本檔即可，請勿 force push。')
say('\n上傳成功！GitHub 仍需完成 Pages 部署，這通常不是即時完成。')
if github_repo:
    say('部署進度：https://github.com/' + github_repo + '/actions')
    say('網站：https://kuonanhong.github.io/AERO_Explorer/')

AERO_PYTHON
