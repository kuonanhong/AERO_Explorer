#!/usr/bin/env bash
# =====================================================================================================
#  AERO Explorer v6 · one-command upload of site updates and AI models / weights
#  macOS (bash 3.2+), Linux, WSL, Git Bash on Windows.   Needs: git.   Optional: gh, hf, aws, curl.
#
#  What it does
#    1. Website: finds every file you changed or added in this folder (SHA-256 against the last upload),
#       copies only those into a dedicated clone of github.com/<repo>, commits and pushes with retries,
#       keeps the old AERO v5.1 entry page as classic-v5.html, and turns on GitHub Pages if needed.
#    2. Models / weights: files you put under models/ (ONNX, safetensors, GGUF, tokenizer files …) are
#       checked and uploaded to Hugging Face (hf CLI) or Cloudflare R2 / S3 (aws CLI) – never to GitHub
#       Pages. Only new or changed files are sent; interrupted runs resume. With --set-model-base the
#       mirror URL is written into config.js and published, so the in-app AI tutor downloads from it.
#    The site never contains API keys: cloud-AI keys typed into the tutor stay in each viewer's browser.
#
#  Usage
#    bash upload-aero-v6.sh                    plan, ask once, upload site + models
#    bash upload-aero-v6.sh --dry-run          show the plan only, change nothing
#    bash upload-aero-v6.sh --yes              no questions (CI / scheduled jobs)
#    bash upload-aero-v6.sh --site-only        or --models-only
#    bash upload-aero-v6.sh --fetch-models     download the two default on-device tutor models into models/
#                                              (Qwen2.5-0.5B-Instruct q8, SmolLM2-135M-Instruct q8; SHA-256 verified)
#    bash upload-aero-v6.sh --models-only --models-to hf --hf-repo <user>/AERO-models --set-model-base
#    bash upload-aero-v6.sh --models-to r2 --r2-account <32-hex id> --r2-bucket aero-models --r2-public-url https://models.example.org
#
#  Options (environment variable in brackets)
#    --repo OWNER/NAME     GitHub repository              [AERO_REPO, default kuonanhong/AERO_Explorer]
#    --branch NAME         branch served by Pages         [AERO_BRANCH, default main]
#    --target DIR          folder inside the repo         [AERO_TARGET, default . = site root]
#    --remote URL          explicit git remote (ssh/https/file) [AERO_REMOTE]
#    --workdir DIR         dedicated publish clone        [AERO_WORKDIR, default ~/.cache/aero-upload/<repo>]
#    --message TEXT        commit message
#    --prune               also delete site files you removed locally (only files a previous v6 upload added)
#    --no-pages            do not touch the GitHub Pages setting
#    --no-classic          do not keep the old v5.1 index.html as classic-v5.html
#    --models-to hf|r2     model destination (default: hf when the hf CLI is logged in, else r2 when configured)
#    --hf-repo ID          Hugging Face model repo        [AERO_HF_REPO, default <github owner>/AERO-models]
#    --r2-account ID --r2-bucket BUCKET[/PREFIX] --aws-profile NAME (default aero-r2) --r2-public-url URL
#    --set-model-base      write the model mirror URL into config.js and publish it
#    -h | --help
# =====================================================================================================
set -Eeuo pipefail
VERSION_TAG="aero-v6-upload 1.0"
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]:-$0}")" && pwd)"

# ---------------- options ----------------
REPO="${AERO_REPO:-kuonanhong/AERO_Explorer}"; BRANCH="${AERO_BRANCH:-main}"; TARGET="${AERO_TARGET:-.}"; REMOTE="${AERO_REMOTE:-}"
WORKDIR="${AERO_WORKDIR:-}"; HF_REPO="${AERO_HF_REPO:-}"; MSG=""; DRY=0; YES=0; DO_SITE=1; DO_MODELS=1; PRUNE=0; PAGES=1; CLASSIC=1
MODELS_TO=""; R2_ACCOUNT="${AERO_R2_ACCOUNT:-}"; R2_BUCKET="${AERO_R2_BUCKET:-}"; AWS_PROFILE_NAME="${AERO_AWS_PROFILE:-aero-r2}"; R2_PUBLIC="${AERO_R2_PUBLIC_URL:-}"
SET_BASE=0; FETCH=0; SITE="${AERO_SITE:-}"
usage() { sed -n '2,46p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }
need_arg() { [ $# -ge 2 ] && [ -n "$2" ] || die "option $1 needs a value"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) need_arg "$@"; REPO="$2"; shift ;;           --branch) need_arg "$@"; BRANCH="$2"; shift ;;
    --target) need_arg "$@"; TARGET="$2"; shift ;;       --remote) need_arg "$@"; REMOTE="$2"; shift ;;
    --workdir) need_arg "$@"; WORKDIR="$2"; shift ;;     --message) need_arg "$@"; MSG="$2"; shift ;;
    --site) need_arg "$@"; SITE="$2"; shift ;;           --hf-repo) need_arg "$@"; HF_REPO="$2"; shift ;;
    --models-to) need_arg "$@"; MODELS_TO="$2"; shift ;; --r2-account) need_arg "$@"; R2_ACCOUNT="$2"; shift ;;
    --r2-bucket) need_arg "$@"; R2_BUCKET="$2"; shift ;; --aws-profile) need_arg "$@"; AWS_PROFILE_NAME="$2"; shift ;;
    --r2-public-url) need_arg "$@"; R2_PUBLIC="$2"; shift ;;
    --dry-run|-n) DRY=1 ;; --yes|-y) YES=1 ;; --site-only) DO_MODELS=0 ;; --models-only) DO_SITE=0 ;;
    --prune) PRUNE=1 ;; --no-pages) PAGES=0 ;; --no-classic) CLASSIC=0 ;; --set-model-base) SET_BASE=1 ;; --fetch-models) FETCH=1 ;;
    -h|--help) usage ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac; shift
done
case "$REPO" in */*) ;; *) die "--repo must look like owner/name" ;; esac
case "$MODELS_TO" in ""|hf|r2) ;; *) die "--models-to must be hf or r2" ;; esac

# ---------------- helpers ----------------
if [ -t 1 ]; then B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; C=$'\033[36m'; R=$'\033[31m'; N=$'\033[0m'; else B=; G=; Y=; C=; R=; N=; fi
say()  { printf '%s\n' "$*"; }
step() { printf '\n%s▶ %s%s\n' "$B$C" "$*" "$N"; }
ok()   { printf '%s✓%s %s\n' "$G" "$N" "$*"; }
warn() { printf '%s! %s%s\n' "$Y" "$*" "$N" >&2; }
have() { command -v "$1" >/dev/null 2>&1; }
trap 'printf "\n%s✗ stopped at line %s. Nothing already committed is lost; run the script again to resume.%s\n" "$R" "$LINENO" "$N" >&2' ERR
sha256_of() { if have sha256sum; then sha256sum "$1" | cut -d' ' -f1; elif have shasum; then shasum -a 256 "$1" | cut -d' ' -f1; else openssl dgst -sha256 "$1" | sed 's/.*= //'; fi; }
filesize() { wc -c < "$1" | tr -d ' '; }
human() { awk -v b="$1" 'BEGIN{ s="B KB MB GB TB"; split(s,u," "); i=1; while (b>=1024 && i<5) { b/=1024; i++ } printf (i==1?"%d %s":"%.1f %s"), b, u[i] }'; }
confirm() { [ "$YES" = 1 ] && return 0; [ -t 0 ] || die "no terminal to ask; re-run with --yes"; printf '%s? %s [y/N] %s' "$B" "$1" "$N"; read -r a; case "$a" in y|Y|yes|YES|是|好) return 0 ;; *) return 1 ;; esac; }
retry() { local n=0 max=4 delay=4; until "$@"; do n=$((n+1)); [ $n -ge $max ] && return 1; warn "retry $n/$((max-1)) in ${delay}s: $*"; sleep $delay; delay=$((delay*3)); done; }
STATE_ROOT="${XDG_CACHE_HOME:-$HOME/.cache}/aero-upload"; mkdir -p "$STATE_ROOT"

# ---------------- locate the site folder ----------------
if [ -z "$SITE" ]; then
  if [ -f "$here/index.html" ] && grep -q 'data-aero="v6"' "$here/index.html"; then SITE="$here"
  elif [ -f "$here/AERO_Explorer_v6/index.html" ]; then SITE="$here/AERO_Explorer_v6"
  else die "cannot find the AERO v6 site folder next to this script (use --site DIR)"; fi
fi
SITE="$(cd "$SITE" && pwd)"; MODELS_DIR="$SITE/models"
say "${B}AERO Explorer v6 uploader${N}  ($VERSION_TAG)"
say "site folder : $SITE"
say "repository  : github.com/$REPO  branch $BRANCH  target ${TARGET}"
[ "$DRY" = 1 ] && say "${Y}dry run: nothing will be changed${N}"
have git || die "git is required: https://git-scm.com/downloads"

# =====================================================================================================
#  optional: download the default on-device tutor models (pinned revisions, verified)
# =====================================================================================================
MODEL_LIST='onnx-community/Qwen2.5-0.5B-Instruct 22942cb7d7ba4cc81bb4673549ca4d4614469b5e config.json 777e01f0fbb3346eb229cb6fb278ed6533c1e4dcb9ebf4bed0f6e94ef17fa1b5
onnx-community/Qwen2.5-0.5B-Instruct 22942cb7d7ba4cc81bb4673549ca4d4614469b5e generation_config.json f7e7ce458658b2d40d9eb213b91b77a8bf698845ab89360976722d7ac46928a3
onnx-community/Qwen2.5-0.5B-Instruct 22942cb7d7ba4cc81bb4673549ca4d4614469b5e tokenizer.json a8506e7111b80c6d8635951a02eab0f4e1a8e4e5772da83846579e97b16f61bf
onnx-community/Qwen2.5-0.5B-Instruct 22942cb7d7ba4cc81bb4673549ca4d4614469b5e tokenizer_config.json 6a14243f0ae04884e597b3f032c05e15de9f417318fdcac24ab4e2680e691430
onnx-community/Qwen2.5-0.5B-Instruct 22942cb7d7ba4cc81bb4673549ca4d4614469b5e special_tokens_map.json 76862e765266b85aa9459767e33cbaf13970f327a0e88d1c65846c2ddd3a1ecd
onnx-community/Qwen2.5-0.5B-Instruct 22942cb7d7ba4cc81bb4673549ca4d4614469b5e onnx/model_quantized.onnx 41834041ab1b29eff9fc592f1a29a1844133aea35832ea9fa91682be13016100
onnx-community/SmolLM2-135M-Instruct-ONNX b8a5c0f183b78c55955a5364f610c36668b5e681 config.json 88f5d2bbac13e61d28787184fa1aa13b7f81f7bda7c3869ece8a8930c27cc5ed
onnx-community/SmolLM2-135M-Instruct-ONNX b8a5c0f183b78c55955a5364f610c36668b5e681 generation_config.json 3a6555a034b32bf2fc6d35cc16207dc95c8af520b2d45febe48a1ad6cb46ff63
onnx-community/SmolLM2-135M-Instruct-ONNX b8a5c0f183b78c55955a5364f610c36668b5e681 tokenizer.json 7d27c493c729a66ecefc837280b05d948b1ed50d130eebdbf911b1b36cf38ed7
onnx-community/SmolLM2-135M-Instruct-ONNX b8a5c0f183b78c55955a5364f610c36668b5e681 tokenizer_config.json 7b85619980209ca801effcd87e5df7084a21abc3d8b8d27003a6b4ffcce170ef
onnx-community/SmolLM2-135M-Instruct-ONNX b8a5c0f183b78c55955a5364f610c36668b5e681 special_tokens_map.json 2b7379f3ae813529281a5c602bc5a11c1d4e0a99107aaa597fe936c1e813ca52
onnx-community/SmolLM2-135M-Instruct-ONNX b8a5c0f183b78c55955a5364f610c36668b5e681 onnx/model_quantized.onnx 0fab87142e3eb1fcacb881f8282e7473e62ad66920c347b81f088da6fda2da37'
if [ "$FETCH" = 1 ]; then
  step "Downloading the default tutor models into models/ (about 660 MB, resumable)"
  have curl || die "curl is required for --fetch-models"
  printf '%s\n' "$MODEL_LIST" | while read -r repo rev path sum; do
    dst="$MODELS_DIR/$repo/$path"; mkdir -p "$(dirname "$dst")"
    if [ -f "$dst" ] && [ "$(sha256_of "$dst")" = "$sum" ]; then ok "$repo/$path (already here)"; continue; fi
    [ "$DRY" = 1 ] && { say "  would download $repo/$path"; continue; }
    retry curl -fL --retry 3 -C - -o "$dst.part" "https://huggingface.co/$repo/resolve/$rev/$path" || die "download failed: $repo/$path"
    [ "$(sha256_of "$dst.part")" = "$sum" ] || { rm -f "$dst.part"; die "checksum mismatch: $repo/$path"; }
    mv "$dst.part" "$dst"; ok "$repo/$path"
  done
  if [ ! -f "$MODELS_DIR/README.md" ] || ! grep -q 'Qwen2.5-0.5B' "$MODELS_DIR/README.md"; then
    cat >> "$MODELS_DIR/README.md" <<'EOF'

## Mirrored default models
- onnx-community/Qwen2.5-0.5B-Instruct @ 22942cb7d7ba4cc81bb4673549ca4d4614469b5e — base model Qwen/Qwen2.5-0.5B-Instruct, Apache-2.0
- onnx-community/SmolLM2-135M-Instruct-ONNX @ b8a5c0f183b78c55955a5364f610c36668b5e681 — base model HuggingFaceTB/SmolLM2-135M-Instruct, Apache-2.0
EOF
  fi
fi

# =====================================================================================================
#  1. website
# =====================================================================================================
SITE_CHANGED=0
BATCH_BYTES="${AERO_BATCH_MB:-20}"; BATCH_BYTES=$((BATCH_BYTES * 1024 * 1024))
publish_site() {
  step "Website: comparing your folder with the last upload"
  local slug; slug="$(printf '%s' "$REPO" | tr '/' '_')"
  [ -n "$WORKDIR" ] || WORKDIR="$STATE_ROOT/$slug"
  # remote and authentication (credentials stay in gh / ssh-agent / the OS keychain; never in URLs)
  if [ -z "$REMOTE" ]; then
    if have gh && gh auth status -h github.com >/dev/null 2>&1; then REMOTE="https://github.com/$REPO.git"; gh auth setup-git -h github.com >/dev/null 2>&1 || true; say "auth        : GitHub CLI"
    elif ssh -o BatchMode=yes -o ConnectTimeout=8 -T git@github.com 2>&1 | grep -i 'successfully authenticated' >/dev/null; then REMOTE="git@github.com:$REPO.git"; say "auth        : SSH key"
    else
      REMOTE="https://github.com/$REPO.git"
      if have gh && [ "$DRY" = 0 ] && [ -t 0 ]; then warn "not logged in to GitHub; opening the GitHub CLI login"; gh auth login --hostname github.com --git-protocol https --web && gh auth setup-git -h github.com || die "GitHub login did not finish"
      else warn "no GitHub CLI login or SSH key found; git will ask for credentials (or install gh: https://cli.github.com)"; fi
    fi
  fi
  # dedicated publish clone, reused between runs. Anything an earlier run committed but could not push is rebuilt
  # from your site folder (it is only a copy of it), so a failed upload is simply finished by running this again.
  if [ -d "$WORKDIR/.git" ]; then
    git -C "$WORKDIR" remote set-url origin "$REMOTE"
    retry git -C "$WORKDIR" fetch --quiet origin "$BRANCH" || die "cannot reach $REMOTE"
    local ahead; ahead="$(git -C "$WORKDIR" rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo 0)"
    [ "$ahead" -gt 0 ] && say "resuming: $ahead unpushed commit(s) from an earlier run are rebuilt from your site folder in smaller parts"
    git -C "$WORKDIR" checkout --quiet -B "$BRANCH" "origin/$BRANCH" 2>/dev/null || true
    git -C "$WORKDIR" reset --quiet --hard "origin/$BRANCH"; git -C "$WORKDIR" clean -qfd
  else
    mkdir -p "$(dirname "$WORKDIR")"
    if ! retry git clone --quiet --branch "$BRANCH" "$REMOTE" "$WORKDIR" 2>/dev/null; then
      say "branch $BRANCH not found; cloning default branch"; rm -rf "$WORKDIR"; retry git clone --quiet "$REMOTE" "$WORKDIR" || die "cannot clone $REMOTE (check the repository name and your access)"
      git -C "$WORKDIR" checkout --quiet -B "$BRANCH"
    fi
  fi
  # large uploads over HTTPS: a bigger buffer and HTTP/1.1 avoid "RPC failed; HTTP 400 … unexpected disconnect"
  git -C "$WORKDIR" config http.postBuffer 524288000; git -C "$WORKDIR" config http.version HTTP/1.1
  local dest="$WORKDIR/$TARGET"; mkdir -p "$dest"; dest="$(cd "$dest" && pwd)"
  local keep_index=0 keep_readme=0
  if [ "$CLASSIC" = 1 ] && [ -f "$dest/index.html" ] && ! grep -q 'data-aero="v6"' "$dest/index.html" && [ ! -f "$dest/classic-v5.html" ]; then keep_index=1; say "keeping the current (v5.1) index.html as classic-v5.html"; fi
  if [ -f "$dest/README.md" ] && ! grep -q 'AERO Explorer v6' "$dest/README.md" && [ ! -f "$dest/README_v5.md" ]; then keep_readme=1; say "keeping the current README.md as README_v5.md"; fi
  # compare file by file (SHA-256); models/ weights never go to GitHub Pages
  local list="$STATE_ROOT/$slug.files" changes="$STATE_ROOT/$slug.changes" big="$STATE_ROOT/$slug.big" n_new=0 n_mod=0 bytes=0 tab; tab="$(printf '\t')"
  : > "$changes"; : > "$big"
  ( cd "$SITE" && find . -type f ! -path './.git/*' ! -name '.DS_Store' ! -name 'Thumbs.db' ! -name '*.part' ! -name '*.tmp' \
      \( ! -path './models/*' -o -name 'README.md' -o -name 'model-manifest.json' \) | sed 's|^\./||' | LC_ALL=C sort ) > "$list"
  while IFS= read -r f; do
    local s="$SITE/$f" d="$dest/$f" sz; sz="$(filesize "$s")"
    if [ "$sz" -gt 99000000 ]; then printf '%s\t%s\n' "$f" "$sz" >> "$big"; continue; fi
    if [ "$f" = config.js ] && [ -f "$d" ] && ! grep -q 'AERO Explorer v6' "$d"; then
      # the site already has its own settings (e.g. AERO v5.1 keys used by the classic pages): keep them, only follow your aiModelBase
      local lb rb; lb="$(sed -n "s/.*aiModelBase: *'\([^']*\)'.*/\1/p" "$s" | awk 'NR==1')"; rb="$(sed -n "s/.*aiModelBase: *'\([^']*\)'.*/\1/p" "$d" | awk 'NR==1')"
      if [ -n "$lb" ] && [ "$lb" != "$rb" ]; then printf 'C\t%s\t0\n' "$f" >> "$changes"; n_mod=$((n_mod+1)); fi
      continue
    fi
    if [ ! -f "$d" ]; then printf 'A\t%s\t%s\n' "$f" "$sz" >> "$changes"; n_new=$((n_new+1)); bytes=$((bytes+sz))
    elif [ "$(filesize "$d")" != "$sz" ] || [ "$(sha256_of "$s")" != "$(sha256_of "$d")" ]; then printf 'M\t%s\t%s\n' "$f" "$sz" >> "$changes"; n_mod=$((n_mod+1)); bytes=$((bytes+sz)); fi
  done < "$list"
  if [ -s "$big" ]; then warn "these files are larger than GitHub's 100 MB limit and are skipped (put weights under models/ and use the model upload):"; sed 's/^/    /' "$big" >&2; fi
  # optional prune: only files that a previous v6 upload added and that you deleted locally
  local n_del=0; if [ "$PRUNE" = 1 ] && [ -f "$dest/.aero-v6-files.txt" ]; then
    while IFS= read -r f; do [ -n "$f" ] || continue; if ! grep -qxF "$f" "$list" && [ -f "$dest/$f" ]; then printf 'D\t%s\t0\n' "$f" >> "$changes"; n_del=$((n_del+1)); fi; done < "$dest/.aero-v6-files.txt"
  fi
  say "new files: $n_new   changed: $n_mod   deleted: $n_del   upload size: $(human "$bytes")"
  if [ $((n_new+n_mod+n_del)) -eq 0 ]; then ok "website is already up to date"; return 0; fi
  head -n 40 "$changes" | cut -f1,2 | sed 's/^/    /'; [ "$(wc -l < "$changes")" -gt 40 ] && say "    … $(( $(wc -l < "$changes") - 40 )) more"
  [ "$DRY" = 1 ] && return 0
  confirm "Publish these website changes to github.com/$REPO ($BRANCH)?" || { warn "website upload skipped"; return 0; }
  if [ -z "$(git -C "$WORKDIR" config user.email || true)" ]; then
    local login=""; have gh && login="$(gh api user --jq '.login' 2>/dev/null || true)"
    git -C "$WORKDIR" config user.name "${login:-AERO uploader}"; git -C "$WORKDIR" config user.email "${login:-aero-uploader}@users.noreply.github.com"
  fi
  local base_msg="${MSG:-AERO v6 update: $n_new new, $n_mod changed, $n_del deleted ($(date +%Y-%m-%d))}" part=1 acc=0
  [ "$keep_index" = 1 ] && cp -p "$dest/index.html" "$dest/classic-v5.html" && git -C "$WORKDIR" add -- "$TARGET/classic-v5.html"
  [ "$keep_readme" = 1 ] && cp -p "$dest/README.md" "$dest/README_v5.md" && git -C "$WORKDIR" add -- "$TARGET/README_v5.md"
  # send in parts of about $AERO_BATCH_MB MB (default 20): each part is committed and pushed on its own
  while IFS="$tab" read -r k f sz; do
    case "$k" in
      A|M) mkdir -p "$(dirname "$dest/$f")"; cp -p "$SITE/$f" "$dest/$f"; git -C "$WORKDIR" add -- "$TARGET/$f"; acc=$((acc + sz)) ;;
      C) local lb; lb="$(sed -n "s/.*aiModelBase: *'\([^']*\)'.*/\1/p" "$SITE/$f" | awk 'NR==1')"
         sed -i.bak "s|aiModelBase: *'[^']*'|aiModelBase: '$lb'|" "$dest/$f" && rm -f "$dest/$f.bak"; git -C "$WORKDIR" add -- "$TARGET/$f" ;;
      D) git -C "$WORKDIR" rm -q --ignore-unmatch -- "$TARGET/$f" ;;
    esac
    if [ "$acc" -ge "$BATCH_BYTES" ]; then commit_part "$base_msg (part $part)"; push_pending; part=$((part+1)); acc=0; fi
  done < "$changes"
  cp "$list" "$dest/.aero-v6-files.txt"; [ -f "$dest/.nojekyll" ] || : > "$dest/.nojekyll"
  git -C "$WORKDIR" add -- "$TARGET/.aero-v6-files.txt" "$TARGET/.nojekyll"
  if [ "$part" -gt 1 ]; then commit_part "$base_msg (part $part, last)"; else commit_part "$base_msg"; fi
  push_pending
  SITE_CHANGED=1; enable_pages
  return 0
}
commit_part() { git -C "$WORKDIR" diff --cached --quiet && return 0; git -C "$WORKDIR" commit --quiet -m "$1"; return 0; }
push_pending() {
  [ "$DRY" = 1 ] && return 0
  local ahead; ahead="$(git -C "$WORKDIR" rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || git -C "$WORKDIR" rev-list --count HEAD)"
  [ "$ahead" -gt 0 ] || return 0
  step "Pushing $(git -C "$WORKDIR" log -1 --format=%s)"
  local i=0 err="$STATE_ROOT/push.err"
  until git -C "$WORKDIR" push --quiet origin "HEAD:$BRANCH" 2> "$err"; do
    tail -n 4 "$err" >&2
    i=$((i+1)); [ $i -ge 4 ] && die "push failed; nothing is lost — run the script again to finish the upload"
    if grep -qiE 'RPC failed|HTTP 4[0-9][0-9]|HTTP 5[0-9][0-9]|sideband|hung up|unexpected disconnect|early EOF|curl (18|52|55|56|92)' "$err"; then
      warn "upload connection dropped; retrying with a fresh connection ($i/3)"; git -C "$WORKDIR" config http.lowSpeedLimit 1000; git -C "$WORKDIR" config http.lowSpeedTime 60
    else
      warn "push rejected; syncing with the remote and retrying ($i/3)"
      git -C "$WORKDIR" fetch --quiet origin "$BRANCH" && git -C "$WORKDIR" rebase --quiet "origin/$BRANCH" || { git -C "$WORKDIR" rebase --abort 2>/dev/null || true; die "the remote has conflicting changes; run the script again (it rebuilds the upload from your folder)"; }
    fi
    sleep $((i*5))
  done
  git -C "$WORKDIR" fetch --quiet origin "$BRANCH" 2>/dev/null || true
  case "$REMOTE" in *github.com*) ok "pushed to github.com/$REPO ($BRANCH)" ;; *) ok "pushed to ${REMOTE##*@} ($BRANCH)" ;; esac
  return 0
}
enable_pages() {
  [ "$PAGES" = 1 ] && have gh || return 0
  case "$REMOTE" in *github.com*) ;; *) return 0 ;; esac
  if ! gh api "repos/$REPO/pages" >/dev/null 2>&1; then
    say "turning on GitHub Pages for $BRANCH"; gh api -X POST "repos/$REPO/pages" -f "source[branch]=$BRANCH" -f "source[path]=/" >/dev/null 2>&1 || warn "could not enable Pages automatically (Settings → Pages)"
  fi
  local url; url="$(gh api "repos/$REPO/pages" --jq '.html_url' 2>/dev/null || true)"
  if [ -n "$url" ]; then ok "site: ${url%/}/${TARGET#.}"; say "  (GitHub Pages usually updates within 1–3 minutes)"; fi
  return 0
}

# =====================================================================================================
#  2. models / weights
# =====================================================================================================
MODEL_BASE=""
upload_models() {
  step "Models: checking $MODELS_DIR"
  [ -d "$MODELS_DIR" ] || { say "no models/ folder — nothing to upload"; return 0; }
  local list="$STATE_ROOT/models.local" n=0 total=0
  ( cd "$MODELS_DIR" && find . -type f ! -path './.git/*' ! -path './.cache/*' ! -name '.DS_Store' ! -name '*.part' ! -name '.gitkeep' ! -name 'model-manifest.json*' | sed 's|^\./||' | LC_ALL=C sort ) > "$list"
  # safety: no credentials, no Git-LFS pointer stubs, a README with origin and licence
  while IFS= read -r f; do
    case "$f" in .env*|*/.env*|*.pem|*.key|*credentials*|*token*.txt) die "remove credentials from models/: $f" ;; esac
    if case "$(head -c 120 "$MODELS_DIR/$f" 2>/dev/null | LC_ALL=C tr -d '\000')" in *git-lfs.github.com/spec*) true ;; *) false ;; esac; then die "models/$f is a Git LFS pointer, not the real weights (download the actual file)"; fi
  done < "$list"
  local weights; weights="$(grep -vE '^README\.md$' "$list" || true)"
  [ -n "$weights" ] || { say "models/ holds no weight files (use --fetch-models or copy your own) — nothing to upload"; return 0; }
  [ -f "$MODELS_DIR/README.md" ] || die "add models/README.md describing each model's origin, revision and licence before publishing"
  # destination
  if [ -z "$MODELS_TO" ]; then
    if { have hf && hf auth whoami >/dev/null 2>&1; } || { have huggingface-cli && huggingface-cli whoami >/dev/null 2>&1; }; then MODELS_TO=hf
    elif [ -n "$R2_BUCKET" ]; then MODELS_TO=r2
    else MODELS_TO=hf; fi
  fi
  local dest_id; if [ "$MODELS_TO" = hf ]; then [ -n "$HF_REPO" ] || HF_REPO="${REPO%%/*}/AERO-models"; dest_id="hf_$(printf '%s' "$HF_REPO" | tr '/' '_')"; else [ -n "$R2_BUCKET" ] || die "--r2-bucket is required for R2"; dest_id="r2_$(printf '%s' "$R2_BUCKET" | tr '/' '_')"; fi
  local state="$STATE_ROOT/models.$dest_id.sha" now="$STATE_ROOT/models.$dest_id.now" todo="$STATE_ROOT/models.$dest_id.todo"
  : > "$now"; : > "$todo"; [ -f "$state" ] || : > "$state"
  while IFS= read -r f; do
    local sz sum; sz="$(filesize "$MODELS_DIR/$f")"; sum="$(sha256_of "$MODELS_DIR/$f")"; printf '%s %s %s\n' "$sum" "$sz" "$f" >> "$now"; total=$((total+sz))
    grep -qxF "$sum $sz $f" "$state" || { printf '%s\t%s\n' "$sz" "$f" >> "$todo"; n=$((n+1)); }
  done < "$list"
  # a manifest next to the weights, used by the app/tools to verify downloads
  { printf '{\n "files": [\n'; awk 'BEGIN{f=1}{ if(!f) printf(",\n"); f=0; printf("  {\"path\": \"%s\", \"bytes\": %s, \"sha256\": \"%s\"}", $3, $2, $1) } END{ printf("\n") }' "$now"; printf ' ]\n}\n'; } > "$MODELS_DIR/model-manifest.json.tmp"
  if [ "$DRY" = 1 ]; then rm -f "$MODELS_DIR/model-manifest.json.tmp"; else mv "$MODELS_DIR/model-manifest.json.tmp" "$MODELS_DIR/model-manifest.json"; fi
  say "destination : $MODELS_TO $( [ "$MODELS_TO" = hf ] && printf '%s' "huggingface.co/$HF_REPO" || printf '%s' "$R2_BUCKET")"
  say "model files : $(wc -l < "$list" | tr -d ' ') ($(human "$total")); new or changed: $n"
  if [ "$n" -eq 0 ]; then ok "models are already up to date"; model_base; return 0; fi
  head -n 30 "$todo" | awk -F'\t' '{ printf "    %s  (%s bytes)\n", $2, $1 }'
  [ "$DRY" = 1 ] && { model_base; return 0; }
  confirm "Upload $n model file(s) to $MODELS_TO?" || { warn "model upload skipped"; return 0; }
  if [ "$MODELS_TO" = hf ]; then
    local HF=hf; have hf || HF=huggingface-cli; have "$HF" || die "install the Hugging Face CLI: curl -LsSf https://hf.co/cli/install.sh | bash   (or: pip install -U huggingface_hub)"
    if [ "$HF" = hf ]; then hf auth whoami >/dev/null 2>&1 || { [ -t 0 ] && hf auth login || die "log in first: hf auth login"; }; else huggingface-cli whoami >/dev/null 2>&1 || die "log in first: huggingface-cli login"; fi
    if [ "$HF" = hf ]; then hf repos create "$HF_REPO" --repo-type model --exist-ok >/dev/null 2>&1 || hf repo create "$HF_REPO" --repo-type model --exist-ok >/dev/null 2>&1 || true; fi
    # hf uploads only content it does not already hold (content-addressed), resumes large files, and keeps other files
    retry "$HF" upload "$HF_REPO" "$MODELS_DIR" . --repo-type model --exclude '.cache/*' --exclude '*.part' --commit-message "AERO models update ($(date +%Y-%m-%d), $n file(s))" || die "Hugging Face upload failed; run again to resume"
  else
    have aws || die "install the AWS CLI (used for Cloudflare R2 / S3): https://aws.amazon.com/cli/"
    [ -n "$R2_ACCOUNT" ] || die "--r2-account <32-hex account id> is required for R2"
    retry aws s3 sync "$MODELS_DIR" "s3://${R2_BUCKET%/}/" --endpoint-url "https://$R2_ACCOUNT.r2.cloudflarestorage.com" --profile "$AWS_PROFILE_NAME" --exclude '.cache/*' --exclude '*.part' --no-progress || die "R2 upload failed; run again to resume"
    say "  remember: the bucket needs a public URL and CORS allowing GET from your site (see deploy notes in README)"
  fi
  cp "$now" "$state"; ok "models uploaded"
  model_base
  return 0
}
model_base() {
  if [ "$MODELS_TO" = hf ]; then MODEL_BASE="https://huggingface.co/$HF_REPO/resolve/main/"
  elif [ -n "$R2_PUBLIC" ]; then local p=""; case "$R2_BUCKET" in */*) p="${R2_BUCKET#*/}/" ;; esac; MODEL_BASE="${R2_PUBLIC%/}/$p"; fi
  if [ -n "$MODEL_BASE" ]; then say "model base URL: $MODEL_BASE"; fi
  if [ "$SET_BASE" = 1 ] && [ -n "$MODEL_BASE" ]; then
    if grep -qE "aiModelBase: *'$MODEL_BASE'" "$SITE/config.js"; then ok "config.js already uses this mirror"
    elif [ "$DRY" = 1 ]; then say "would set aiModelBase in config.js"
    else sed -i.bak "s|aiModelBase: *'[^']*'|aiModelBase: '$MODEL_BASE'|" "$SITE/config.js" && rm -f "$SITE/config.js.bak"; ok "config.js → aiModelBase = $MODEL_BASE"; NEED_SITE_AGAIN=1; fi
  fi
  return 0
}

# =====================================================================================================
NEED_SITE_AGAIN=0
if [ "$DO_MODELS" = 1 ]; then upload_models; fi
if [ "$DO_SITE" = 1 ] || [ "$NEED_SITE_AGAIN" = 1 ]; then publish_site; fi
step "Done"
[ "$DRY" = 1 ] && say "dry run finished — run without --dry-run to upload" || say "Open the site, press Ctrl+F5 (or pull to refresh on phones) to see the new version."
