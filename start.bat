@echo off
title PPSD Construction ERP
pushd "%~dp0"

echo ============================================
echo    PPSD Construction ERP
echo ============================================
echo.

if not exist "package.json" (
  echo [ERROR] package.json not found here.
  echo Keep start.bat inside the extracted "ppsd-erp" folder
  echo ^(the same folder that contains package.json^), then double-click it again.
  echo.
  pause
  exit /b
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found.
  echo Install it from https://nodejs.org  ^(click the green LTS button^),
  echo then double-click start.bat again.
  echo.
  pause
  exit /b
)

if not exist "node_modules" (
  echo [1/2] First-time setup, installing... ^(wait 1-2 minutes^)
  call npm install
  if errorlevel 1 (
    echo [ERROR] Install failed. Try right-click start.bat ^> Run as administrator.
    echo.
    pause
    exit /b
  )
) else (
  echo [1/2] Already installed - skipping.
)

echo [2/2] Starting server...
echo.
echo   This computer:    http://localhost:3001
echo   Phone / other PC: use the http://192.168.x.x:3001 line shown below
echo   ( first time only: run allow-network.bat once as admin )
echo.
echo   The browser will open automatically in ~20 seconds.
echo   To stop the server: press Ctrl+C or close this window.
echo ============================================
echo.

start "" cmd /c "timeout /t 20 >nul & start http://localhost:3001"
call npm start

echo.
echo Server stopped.
pause
