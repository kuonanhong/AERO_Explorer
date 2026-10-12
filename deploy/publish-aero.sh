#!/usr/bin/env bash
# AERO Explorer release publisher. Bash 3.2+, Git, Python 3.9+.
# Default is a read-only deployment preview; --apply commits and pushes.
set -euo pipefail
if command -v python3 >/dev/null 2>&1; then
  aero_python=python3
elif command -v python >/dev/null 2>&1; then
  aero_python=python
else
  printf '%s\n' 'Please install Python 3.9 or newer, then run this script again.' >&2
  exit 1
fi
# Python on Windows expects native paths. Convert only path option arguments.
aero_args=()
aero_path_next=0
for aero_arg in "$@"; do
  if [ "$aero_path_next" -eq 1 ] && command -v cygpath >/dev/null 2>&1; then
    aero_arg=$(cygpath -w "$aero_arg")
  fi
  aero_args+=("$aero_arg")
  aero_path_next=0
  case "$aero_arg" in --release|--workdir|--models|--cleanup-manifest) aero_path_next=1 ;; esac
done
"$aero_python" - "${aero_args[@]}" <<'PY'
import argparse, hashlib, json, os, re, shutil, subprocess, sys
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

if sys.version_info < (3, 9):
    raise SystemExit('Python 3.9 or newer is required.')

parser = argparse.ArgumentParser(description='Preview or publish a flattened AERO release. No force-push, automatic stash, or arbitrary directory deletion.')
parser.add_argument('--release', required=True, help='Directory containing the ready-to-publish index.html')
parser.add_argument('--workdir', default='AERO_Explorer-publish', help='Dedicated clean clone, outside the release directory')
parser.add_argument('--repo', default='https://github.com/kuonanhong/AERO_Explorer.git')
parser.add_argument('--branch', default='main')
parser.add_argument('--models', help='Optional SMALL model directory copied under models/; larger weights belong on HF/R2')
parser.add_argument('--cleanup-manifest', help='Optional hash-verified legacy-file list supplied with this release')
parser.add_argument('--message', default='Publish AERO Explorer release')
parser.add_argument('--apply', action='store_true', help='Copy, commit, and push the previewed changes')
args = parser.parse_args()
MANIFEST = '.aero-release-manifest.json'
MAX_FILE = 100 * 1024 * 1024
MAX_SITE = 1_000_000_000  # Conservative decimal 1 GB guard for published Pages content.

def stop(message):
    raise SystemExit('STOP: ' + message)

def run(cmd, cwd=None, capture=False):
    result = subprocess.run(cmd, cwd=cwd, text=True, stdout=subprocess.PIPE if capture else None, stderr=subprocess.PIPE if capture else None)
    if result.returncode:
        if capture and result.stderr:
            print(result.stderr.strip(), file=sys.stderr)
        stop('Command failed: ' + cmd[0] + ' ' + (' '.join(cmd[1:3])))
    return result.stdout.strip() if capture else ''

def git(*cmd, capture=False):
    return run(['git', *cmd], cwd=work, capture=capture)

def normalize_remote(remote):
    if remote.startswith('git@github.com:'):
        return 'github.com/' + remote.split(':', 1)[1].removesuffix('.git').lower()
    if '://' in remote:
        value = urlsplit(remote)
        if value.scheme in ('http', 'https') and (value.username or value.password):
            stop('Do not put a token or password in a Git URL. Use gh auth login, SSH, or a credential manager.')
        if value.scheme in ('http', 'https', 'ssh'):
            if value.hostname == 'github.com':
                return 'github.com/' + value.path.strip('/').removesuffix('.git').lower()
            return remote.rstrip('/').removesuffix('.git')
        if value.scheme == 'file':
            return str(Path(value.path).resolve())
        stop('Unsupported repository URL scheme.')
    return str(Path(remote).expanduser().resolve())

def safe_name(name):
    p = PurePosixPath(name)
    if not name or p.is_absolute() or '..' in p.parts or any(c in name for c in ('\\', '\n', '\r', '\0', ':')):
        stop('Unsafe relative path in release/manifest: ' + repr(name))
    if any(part in ('.git', '.github', 'node_modules', '__pycache__') for part in p.parts):
        stop('Forbidden release/manifest path: ' + name)
    return name

def safe_target(name):
    safe_name(name)
    path = work / name
    for ancestor in [path, *path.parents]:
        if ancestor == work:
            break
        if ancestor.is_symlink():
            stop('Destination is a symlink: ' + name)
    return path

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def read_manifest(path):
    if not path.exists():
        return {}
    if path.is_symlink():
        stop('Manifest may not be a symlink.')
    data = json.loads(path.read_text(encoding='utf-8'))
    if data.get('format') != 'aero-owned-files-v1' or not isinstance(data.get('files'), dict):
        stop('Unrecognized manifest: ' + str(path))
    for name, sha in data['files'].items():
        safe_name(name)
        if name == MANIFEST or not re.fullmatch('[0-9a-f]{64}', str(sha)):
            stop('Invalid ownership manifest entry: ' + name)
    return data['files']

release = Path(args.release).expanduser().resolve()
work = Path(args.workdir).expanduser().resolve()
if not release.is_dir() or not (release / 'index.html').is_file():
    stop('--release must contain index.html at its root. Unzip the package and use its AERO_Explorer folder.')
if release == work or work in release.parents or release in work.parents:
    stop('--release and --workdir must be separate, non-nested directories.')
expected_remote = normalize_remote(args.repo)
run(['git', 'check-ref-format', '--branch', args.branch], capture=True)

# Validate the release BEFORE any clone, fetch, or write.
sources = {}
def collect(folder, prefix=''):
    folder = folder.resolve()
    for path in sorted(folder.rglob('*')):
        if path.is_symlink():
            stop('Release/model symlinks are not supported: ' + str(path))
        if not path.is_file():
            continue
        name = safe_name(prefix + path.relative_to(folder).as_posix())
        if name == MANIFEST:
            continue  # Generated below from the bytes actually published.
        if any(part.startswith('.env') for part in PurePosixPath(name).parts) or Path(name).suffix.lower() in ('.zip', '.pem', '.key'):
            stop('Remove archives or credentials from the release: ' + name)
        if name.split('/')[0] in ('source', 'tests', 'tools', 'deploy', 'docs') or path.name == '.DS_Store':
            stop('Use the slim website release, not the full source/package folder: ' + name)
        size = path.stat().st_size
        if size > MAX_FILE:
            stop(name + ' exceeds 100 MiB. Upload this weight to Hugging Face/R2 using upload-models.sh; keep only its URL/config here.')
        with path.open('rb') as f:
            if f.read(150).startswith(b'version https://git-lfs.github.com/spec/v1'):
                stop('Git LFS pointer is not a usable Pages asset: ' + name)
        if name in sources:
            stop('Duplicate release/model file: ' + name)
        sources[name] = {'path': path, 'sha': digest(path), 'size': size}
collect(release)
if args.models:
    model_dir = Path(args.models).expanduser().resolve()
    if not model_dir.is_dir():
        stop('--models directory does not exist.')
    collect(model_dir, 'models/')
sources['.nojekyll'] = {'path': None, 'sha': hashlib.sha256(b'').hexdigest(), 'size': 0}
if sum(v['size'] for v in sources.values()) > MAX_SITE:
    stop('Release exceeds the 1 GB GitHub Pages site guard. Move model/photo bulk storage to HF/R2.')

if not work.exists():
    work.parent.mkdir(parents=True, exist_ok=True)
    run(['git', 'clone', '--branch', args.branch, '--single-branch', args.repo, str(work)])
elif not (work / '.git').is_dir():
    stop('--workdir already exists but is not a normal Git clone. Choose an unused directory.')
if normalize_remote(git('remote', 'get-url', 'origin', capture=True)) != expected_remote:
    stop('The workdir origin does not match --repo; no files were changed.')
if git('status', '--porcelain', '--untracked-files=all', capture=True):
    stop('Workdir has local changes or untracked files. Commit/back up them yourself, or choose a new --workdir. Nothing was stashed or reset.')
if git('branch', '--show-current', capture=True) != args.branch:
    stop('Workdir is not on the requested branch.')
git('fetch', 'origin', args.branch)
# Refuse to publish pre-existing local commits as an accidental side effect.
if git('rev-list', '--count', 'origin/' + args.branch + '..HEAD', capture=True) != '0':
    stop('Workdir contains local commits not on origin. Resolve/push them yourself or use a fresh workdir.')
if args.apply:
    git('merge', '--ff-only', 'origin/' + args.branch)
elif git('rev-parse', 'HEAD', capture=True) != git('rev-parse', 'origin/' + args.branch, capture=True):
    stop('Preview clone is behind origin. Run git pull --ff-only in the clean workdir, then preview again.')

owned = read_manifest(work / MANIFEST)
legacy = read_manifest(Path(args.cleanup_manifest).expanduser().resolve()) if args.cleanup_manifest else {}
deletes = []
for name, old_sha in sorted({**legacy, **owned}.items()):
    if name in sources:
        continue
    path = safe_target(name)
    if not path.exists():
        continue
    if not path.is_file() or digest(path) != old_sha:
        stop('A formerly owned file changed; refusing to delete: ' + name + '. Review it and update the manifest only after making a backup.')
    deletes.append(name)

adds, updates = [], []
for name, data in sources.items():
    path = safe_target(name)
    if path.exists() and not path.is_file():
        stop('A directory conflicts with a release file: ' + name)
    if not path.exists():
        adds.append(name)
    elif digest(path) != data['sha']:
        updates.append(name)

# Include unrelated preserved files in the published-site size calculation.
preserved_size = 0
for path in work.rglob('*'):
    rel = path.relative_to(work)
    if '.git' in rel.parts or not path.is_file() or path.is_symlink():
        continue
    name = rel.as_posix()
    if name not in sources and name not in deletes and name != MANIFEST:
        preserved_size += path.stat().st_size
manifest_data = {'format': 'aero-owned-files-v1', 'files': {k: sources[k]['sha'] for k in sorted(sources)}}
manifest_bytes = (json.dumps(manifest_data, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
site_size = preserved_size + sum(v['size'] for v in sources.values()) + len(manifest_bytes)
if site_size > MAX_SITE:
    stop('Resulting published tree exceeds 1 GB, including unrelated files preserved in the repository.')
if (work / MANIFEST).exists() and (work / MANIFEST).read_bytes() != manifest_bytes:
    updates.append(MANIFEST)
elif not (work / MANIFEST).exists():
    adds.append(MANIFEST)
print('\nAERO deployment plan (' + ('APPLY' if args.apply else 'PREVIEW') + ')')
print('Branch:', args.branch, '| Published tree bytes:', site_size)
for label, names in [('ADD', adds), ('UPDATE', updates), ('DELETE owned', deletes)]:
    print(label + ':', len(names))
    for name in sorted(names):
        print('  ' + name)
if not args.apply:
    print('\nNo release files, commits, or remote content were changed. Re-run with --apply to publish this plan.')
    sys.exit(0)
if not adds and not updates and not deletes:
    print('Already up to date; no commit or push needed.')
    sys.exit(0)
if not git('config', 'user.name', capture=True) or not git('config', 'user.email', capture=True):
    stop('Configure git user.name and user.email before --apply. Use the GitHub noreply email if desired.')

for name in deletes:
    safe_target(name).unlink()
for name in adds + updates:
    if name == MANIFEST:
        continue
    dest = safe_target(name)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if sources[name]['path'] is None:
        dest.write_bytes(b'')
    else:
        shutil.copyfile(sources[name]['path'], dest)
(work / MANIFEST).write_bytes(manifest_bytes)
# Explicit paths only; never stage unrelated content or use git add . / rm -rf.
for name in sorted(set(adds + updates + deletes)):
    git('--literal-pathspecs', 'add', '-A', '--', name)
git('diff', '--cached', '--stat')
git('-c', 'core.whitespace=-blank-at-eol,-blank-at-eof,-space-before-tab', 'diff', '--cached', '--check')
git('commit', '-m', args.message)
try:
    git('push', 'origin', 'HEAD:refs/heads/' + args.branch)
except SystemExit:
    print('Commit is kept locally. Resolve authentication or concurrent remote changes without force-push, then run git push in the workdir.', file=sys.stderr)
    raise
print('\nPush succeeded. Enable GitHub Settings > Pages > Deploy from a branch > ' + args.branch + ' / (root).')
print('Website: https://kuonanhong.github.io/AERO_Explorer/')
print('A successful Git push does not itself confirm that the Pages deployment has finished; check the repository Actions tab.')
PY
