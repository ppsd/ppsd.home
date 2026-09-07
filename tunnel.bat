@echo off
pushd "%~dp0"
echo ==================================================
echo   PPSD ERP - Public link (Cloudflare Tunnel)
echo ==================================================
echo.
echo Step 1: make sure the app is ALREADY running
echo         (run start.bat or "npm start" in another window).
echo.

if not exist cloudflared.exe (
  echo Downloading cloudflared.exe ...
  powershell -Command "try { Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'cloudflared.exe' } catch { exit 1 }"
)

if not exist cloudflared.exe (
  echo.
  echo Could not download cloudflared automatically.
  echo Please download it manually from:
  echo   https://github.com/cloudflare/cloudflared/releases/latest
  echo Save the file as  cloudflared.exe  in THIS folder, then run tunnel.bat again.
  echo.
  pause
  exit /b
)

echo.
echo Opening a public HTTPS link to http://localhost:3001 ...
echo.
echo  =====================================================================
echo   Look for a line like:  https://something-random.trycloudflare.com
echo   Open THAT link on any phone/computer (any internet, not same WiFi).
echo   Keep this window OPEN. Closing it stops the public link.
echo  =====================================================================
echo.
cloudflared.exe tunnel --url http://localhost:3001
echo.
echo Tunnel stopped.
pause
