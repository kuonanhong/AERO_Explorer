# AERO models / weights

Put model files for the in-app AI flight tutor here, keeping the original repository folder names, e.g.

    models/onnx-community/Qwen2.5-0.5B-Instruct/config.json
    models/onnx-community/Qwen2.5-0.5B-Instruct/onnx/model_quantized.onnx

`bash upload-aero-v6.sh --fetch-models` downloads the two default tutor models here (pinned revisions, SHA-256 verified).
`bash upload-aero-v6.sh --models-only --set-model-base` uploads new or changed files to your Hugging Face model repo
(or Cloudflare R2 with `--models-to r2`) and writes the mirror URL into `config.js`. Weights are never pushed to GitHub Pages.

Describe every model you add below: origin repository, revision, base model and licence.

## Default tutor models (downloaded on request in the browser; not bundled)
- onnx-community/Qwen2.5-0.5B-Instruct @ 22942cb7d7ba4cc81bb4673549ca4d4614469b5e — base Qwen/Qwen2.5-0.5B-Instruct — Apache-2.0 — multilingual, ~520 MB (q8)
- onnx-community/SmolLM2-135M-Instruct-ONNX @ b8a5c0f183b78c55955a5364f610c36668b5e681 — base HuggingFaceTB/SmolLM2-135M-Instruct — Apache-2.0 — English, ~140 MB (q8)
