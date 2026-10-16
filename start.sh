#!/usr/bin/env bash
# AERO Explorer v6 - local start (Linux, macOS, WSL, Git Bash).
# Serves this folder on http://localhost:<port>/ and opens the browser. Ctrl+C to stop.
set -eu
cd "$(dirname "$0")"
PORT="${PORT:-8080}"
PY="$(command -v python3 || command -v python || true)"
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
while port_busy "$PORT"; do PORT=$((PORT + 1)); done
URL="http://localhost:$PORT/"
open_browser() { sleep 1; if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"; elif command -v open >/dev/null 2>&1; then open "$URL"; elif command -v cmd.exe >/dev/null 2>&1; then cmd.exe /c start "" "$URL"; else echo "Open $URL in your browser"; fi >/dev/null 2>&1 || true; }
echo "AERO Explorer v6 → $URL   (Ctrl+C to stop)"
open_browser &
if [ -n "$PY" ]; then exec "$PY" -m http.server "$PORT" --bind 127.0.0.1
elif command -v npx >/dev/null 2>&1; then exec npx --yes http-server -p "$PORT" -a 127.0.0.1 -c-1 .
else echo "Python 3 or Node.js is needed to serve the files (or open standalone/AERO_RealWorld_Sim.html directly)."; exit 1; fi
