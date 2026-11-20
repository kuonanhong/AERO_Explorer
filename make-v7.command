#!/usr/bin/env bash
cd "$(dirname "$0")"
bash make-v7.sh "$@"
echo; read -r -n 1 -p "完成。按任意鍵關閉視窗…" _
