/** Optional browser CPU models; no model is loaded at page startup. */
export const MODEL_CATALOG = [
  {
    "id": "qwen",
    "repo": "onnx-community/Qwen2.5-0.5B-Instruct",
    "revision": "22942cb7d7ba4cc81bb4673549ca4d4614469b5e",
    "baseModel": "Qwen/Qwen2.5-0.5B-Instruct",
    "name": "Qwen2.5 0.5B · multilingual",
    "languages": "multilingual",
    "dtype": "q8",
    "minimumMemoryGB": 4,
    "mobileMemoryGB": 8,
    "modelBytes": 512096557,
    "files": [
      {
        "path": "config.json",
        "bytes": 678,
        "sha256": "777e01f0fbb3346eb229cb6fb278ed6533c1e4dcb9ebf4bed0f6e94ef17fa1b5"
      },
      {
        "path": "generation_config.json",
        "bytes": 242,
        "sha256": "f7e7ce458658b2d40d9eb213b91b77a8bf698845ab89360976722d7ac46928a3"
      },
      {
        "path": "tokenizer.json",
        "bytes": 7031673,
        "sha256": "a8506e7111b80c6d8635951a02eab0f4e1a8e4e5772da83846579e97b16f61bf"
      },
      {
        "path": "tokenizer_config.json",
        "bytes": 7849,
        "sha256": "6a14243f0ae04884e597b3f032c05e15de9f417318fdcac24ab4e2680e691430"
      },
      {
        "path": "special_tokens_map.json",
        "bytes": 613,
        "sha256": "76862e765266b85aa9459767e33cbaf13970f327a0e88d1c65846c2ddd3a1ecd"
      },
      {
        "path": "onnx/model_quantized.onnx",
        "bytes": 512096557,
        "sha256": "41834041ab1b29eff9fc592f1a29a1844133aea35832ea9fa91682be13016100"
      }
    ],
    "downloadBytes": 519137612,
    "license": "Apache-2.0",
    "licenseURL": "https://www.apache.org/licenses/LICENSE-2.0"
  },
  {
    "id": "smol",
    "repo": "onnx-community/SmolLM2-135M-Instruct-ONNX",
    "revision": "b8a5c0f183b78c55955a5364f610c36668b5e681",
    "baseModel": "HuggingFaceTB/SmolLM2-135M-Instruct",
    "name": "SmolLM2 135M · English",
    "languages": "en",
    "dtype": "q8",
    "minimumMemoryGB": 2,
    "mobileMemoryGB": 4,
    "modelBytes": 135658354,
    "files": [
      {
        "path": "config.json",
        "bytes": 976,
        "sha256": "88f5d2bbac13e61d28787184fa1aa13b7f81f7bda7c3869ece8a8930c27cc5ed"
      },
      {
        "path": "generation_config.json",
        "bytes": 132,
        "sha256": "3a6555a034b32bf2fc6d35cc16207dc95c8af520b2d45febe48a1ad6cb46ff63"
      },
      {
        "path": "tokenizer.json",
        "bytes": 3522656,
        "sha256": "7d27c493c729a66ecefc837280b05d948b1ed50d130eebdbf911b1b36cf38ed7"
      },
      {
        "path": "tokenizer_config.json",
        "bytes": 3794,
        "sha256": "7b85619980209ca801effcd87e5df7084a21abc3d8b8d27003a6b4ffcce170ef"
      },
      {
        "path": "special_tokens_map.json",
        "bytes": 655,
        "sha256": "2b7379f3ae813529281a5c602bc5a11c1d4e0a99107aaa597fe936c1e813ca52"
      },
      {
        "path": "onnx/model_quantized.onnx",
        "bytes": 135658354,
        "sha256": "0fab87142e3eb1fcacb881f8282e7473e62ad66920c347b81f088da6fda2da37"
      }
    ],
    "downloadBytes": 139186567,
    "license": "Apache-2.0",
    "licenseURL": "https://www.apache.org/licenses/LICENSE-2.0"
  }
];
// Optional public model-storage base URL. Layout: <base>/<repo>/config.json, onnx/…
export const AI_MODEL_BASE = globalThis.AERO_CONFIG?.aiModelBase || "";
export const AI_RUNTIME_VERSION = "3.8.1";
