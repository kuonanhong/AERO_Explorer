#!/usr/bin/env bash
# AERO v5 optional model weights: Bash + Python 3; macOS/Linux/Windows Git Bash.
# Usage: ./download-models.sh --list
#        ./download-models.sh qwen ./model-storage
#        ./download-models.sh smol ./model-storage
#        ./download-models.sh all ./model-storage
# Models exceed GitHub's regular Git file limit. Store them outside the Pages repo.
set -euo pipefail
AERO_SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AERO_MODEL="${1:---list}"
AERO_DEST="${2:-./model-storage}"
command -v python3 >/dev/null 2>&1 || { echo 'Python 3 is required.' >&2; exit 1; }
python3 - "$AERO_MODEL" "$AERO_DEST" "$AERO_SCRIPT_DIR/ai-models.json" <<'PY'
import hashlib,json,pathlib,sys,time,urllib.request
model_id,dest,manifest=sys.argv[1:]
models=json.loads(pathlib.Path(manifest).read_text())['models']
if model_id=='--list':
 for m in models:print(f"{m['id']}: {m['name']} — {m['downloadBytes']:,} bytes — {m['license']}")
 raise SystemExit(0)
selected=[m for m in models if model_id in (m['id'],'all')]
if not selected:raise SystemExit('Choose qwen, smol, all, or --list.')
license_file=pathlib.Path(manifest).with_name('AI-MODEL-LICENSE.txt')
if not license_file.is_file():raise SystemExit('Keep AI-MODEL-LICENSE.txt beside ai-models.json and this script.')
base=pathlib.Path(dest).expanduser().resolve();base.mkdir(parents=True,exist_ok=True)
def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for chunk in iter(lambda:f.read(4*1024*1024),b''):h.update(chunk)
 return h.hexdigest()
for model in selected:
 print(f"{model['name']} | pinned revision {model['revision']}")
 for item in model['files']:
  target=(base/model['repo']/item['path']).resolve()
  if base not in target.parents:raise SystemExit('Unsafe manifest path.')
  target.parent.mkdir(parents=True,exist_ok=True)
  if target.is_file() and target.stat().st_size==item['bytes'] and digest(target)==item['sha256']:
   print('Verified:',target.relative_to(base));continue
  url=f"https://huggingface.co/{model['repo']}/resolve/{model['revision']}/{item['path']}"
  part=target.with_name(target.name+'.part')
  try:
   req=urllib.request.Request(url,headers={'User-Agent':'AERO-Explorer-model-downloader/5'})
   with urllib.request.urlopen(req,timeout=90) as response,part.open('wb') as out:
    read=0;last=time.monotonic()
    while True:
     block=response.read(1024*1024)
     if not block:break
     out.write(block);read+=len(block)
     if time.monotonic()-last>5:
      print(f"  {item['path']}: {read/item['bytes']:.1%}",flush=True);last=time.monotonic()
   if part.stat().st_size!=item['bytes'] or digest(part)!=item['sha256']:raise RuntimeError('Size/SHA-256 mismatch; file was not installed.')
   part.replace(target);print('Downloaded and verified:',target.relative_to(base))
  except Exception:
   part.unlink(missing_ok=True)
   raise
 (base/model['repo']/'AERO-MODEL-MANIFEST.json').write_text(json.dumps(model,ensure_ascii=False,indent=2)+'\n')
 (base/model['repo']/'LICENSE.txt').write_bytes(license_file.read_bytes())
 (base/model['repo']/'NOTICE.txt').write_text('Base model: '+model['baseModel']+'\nONNX conversion: '+model['repo']+'\nPinned revision: '+model['revision']+'\nLicense: Apache-2.0\n')
 print('Base-model license:',model['licenseURL'])
print('Ready:',base)
print('Host this directory on HTTPS model storage with CORS, then set AI_MODEL_BASE in ai-config.js.')
PY
