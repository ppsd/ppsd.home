@echo off
title PPSD ERP - disable auto-start
pushd "%~dp0"

set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PPSD ERP Server.lnk"

echo Disabling PPSD ERP auto-start on login...
echo.

if exist "%LNK%" ( del /f /q "%LNK%" & echo [OK] Auto-start removed. ) else ( echo - No auto-start found in Startup. )

:: remove old method (scheduled task) if it exists
schtasks /delete /tn "PPSD ERP Server" /f >nul 2>&1

echo.
echo Done - it will no longer start on login (you can still run start.bat).
echo.
pause
