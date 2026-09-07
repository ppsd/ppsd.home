@echo off
title PPSD ERP - update (run after extracting a new version)
pushd "%~dp0"

:: Run this ONCE after extracting a new version over the old folder.
:: It reinstalls dependencies and rebuilds the app to the latest version.
:: Your data in server\data is NOT touched - safe.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found - install from https://nodejs.org  then try again.
  pause
  exit /b
)

echo [1/2] Installing / updating dependencies...
call npm install
if errorlevel 1 ( echo [ERROR] Install failed. & pause & exit /b )

echo [2/2] Building the latest version...
call npm run build
if errorlevel 1 ( echo [ERROR] Build failed. & pause & exit /b )

echo.
echo ============================================
echo   Update done.
echo   - If auto-start is on: restart the PC, or double-click run-server.bat
echo   - Otherwise: double-click start.bat
echo ============================================
echo.
pause
