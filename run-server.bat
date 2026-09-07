@echo off
title PPSD ERP Server (running - do not close)
pushd "%~dp0"

:: PPSD ERP - run the server and auto-restart if it stops
:: Used by install-autostart.bat (auto-start on login) or run directly.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found - install from https://nodejs.org  then try again.
  pause
  exit /b
)

if not exist "node_modules" (
  echo [First run] Installing dependencies... please wait 1-2 minutes.
  call npm install
)

if not exist "dist\index.html" (
  echo [First run / after update] Building the app... please wait.
  call npm run build
)

:loop
echo.
echo ============================================
echo   PPSD ERP - server on port 3001
echo   This PC:  http://localhost:3001
echo   Stop:     press Ctrl+C or close this window
echo ============================================
echo.
node server\index.js
echo.
echo [!] Server stopped - restarting in 5 seconds (press Ctrl+C to quit).
timeout /t 5 >nul
goto loop
