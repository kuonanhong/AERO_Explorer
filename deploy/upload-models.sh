#!/usr/bin/env bash
# Upload reusable model files to Hugging Face or R2, never through GitHub Pages.
# Preview by default. Authentication stays in hf/AWS credential stores.
set -euo pipefail
if command -v python3 >/dev/null 2>&1; then aero_python=python3; else aero_python=python; fi
aero_args=()
aero_path_next=0
for aero_arg in "$@"; do
  if [ "$aero_path_next" -eq 1 ] && command -v cygpath >/dev/null 2>&1; then aero_arg=$(cygpath -w "$aero_arg"); fi
  aero_args+=("$aero_arg")
  aero_path_next=0
  case "$aero_arg" in --models) aero_path_next=1 ;; esac
done
"$aero_python" - "${aero_args[@]}" <<'PY'
import argparse, re, subprocess
from pathlib import Path
p=argparse.ArgumentParser(description='Preview or upload models to public Hugging Face model hosting or an existing R2 bucket. Never deletes remote files.')
p.add_argument('--provider', required=True, choices=['hf','r2'])
p.add_argument('--models', required=True)
p.add_argument('--target', required=True, help='HF: owner/model-repo; R2: bucket/prefix')
p.add_argument('--account-id', help='R2 account ID, not a secret')
p.add_argument('--profile', default='aero-r2', help='Named AWS credential profile for R2')
p.add_argument('--apply', action='store_true')
a=p.parse_args()
folder=Path(a.models).expanduser().resolve()
if not folder.is_dir(): raise SystemExit('Model directory does not exist.')
if a.provider=='hf' and not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',a.target):
    raise SystemExit('Use an HF owner/model-repo ID, not a token or URL.')
if a.provider=='r2':
    if not a.account_id or not re.fullmatch(r'[a-fA-F0-9]{32}',a.account_id): raise SystemExit('Supply a valid 32-character R2 --account-id.')
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]+(?:/[A-Za-z0-9._/-]+)?',a.target) or '..' in a.target.split('/'):
        raise SystemExit('Use bucket/prefix without a URL or parent-directory segments.')
files=[]
for file in sorted(folder.rglob('*')):
    parts=file.relative_to(folder).parts
    if '.git' in parts or '.cache' in parts: continue
    if file.is_symlink(): raise SystemExit('Symlink is not allowed: '+str(file))
    if not file.is_file(): continue
    if any(s.startswith('.env') for s in parts) or file.suffix.lower() in ('.pem','.key'):
        raise SystemExit('Remove credentials from the model folder: '+str(file))
    size=file.stat().st_size
    limit=500_000_000_000 if a.provider=='hf' else 5*1024**4-5*1024**3
    if size>limit: raise SystemExit('File exceeds provider single-object limit: '+str(file))
    with file.open('rb') as handle:
        if handle.read(150).startswith(b'version https://git-lfs.github.com/spec/v1'):
            raise SystemExit('Download actual model bytes before uploading; found LFS pointer: '+str(file))
    files.append((file,size))
if not files: raise SystemExit('No model files to upload.')
if not (folder/'README.md').is_file():
    raise SystemExit('Add README.md with model identity, origin, license, revision, and required files before redistribution.')
print('Model upload:',a.provider,a.target)
print('Files:',len(files),'| bytes:',sum(size for _,size in files))
for file,size in files: print(str(file.relative_to(folder))+'\t'+str(size))
if a.provider=='hf':
    command=['hf','upload',a.target,str(folder),'.','--repo-type','model','--exclude','.git/*','.cache/*']
    print('Destination is a public model repository when newly created. Existing repository visibility is unchanged.')
else:
    command=['aws','s3','sync',str(folder),'s3://'+a.target.rstrip('/')+'/', '--endpoint-url','https://'+a.account_id+'.r2.cloudflarestorage.com','--profile',a.profile,'--exclude','.git/*','--exclude','.cache/*']
if not a.apply:
    print('Preview only. Re-run with --apply to upload. No account, bucket, or public access has been created.')
else:
    if a.provider=='hf': subprocess.run(['hf','auth','whoami'],check=True)
    subprocess.run(command,check=True)
    print('Upload complete. Update the app model manifest URL/revision to match the uploaded model; model hosting does not provide inference compute.')
    if a.provider=='r2': print('For browser downloads configure the bucket CORS and a production custom domain. Upload credentials must never be put in the website.')
PY
