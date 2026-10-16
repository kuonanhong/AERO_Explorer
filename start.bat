@echo off
rem AERO Explorer v6 - local start (Windows). Serves this folder on http://localhost:8080/ and opens the browser.
cd /d "%~dp0"
set PORT=8080
echo AERO Explorer v6 - http://localhost:%PORT%/   (close this window to stop)
start "" "http://localhost:%PORT%/"
where py >nul 2>nul && (py -3 -m http.server %PORT% --bind 127.0.0.1 & goto :eof)
where python >nul 2>nul && (python -m http.server %PORT% --bind 127.0.0.1 & goto :eof)
where npx >nul 2>nul && (npx --yes http-server -p %PORT% -a 127.0.0.1 -c-1 . & goto :eof)
echo Python 3 or Node.js is needed. You can also open standalone\AERO_RealWorld_Sim.html directly.
pause
