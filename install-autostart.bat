@echo off
title PPSD ERP - enable auto-start on login
pushd "%~dp0"

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET=%~dp0run-server.bat"
set "LNK=%STARTUP%\PPSD ERP Server.lnk"

echo ============================================
echo   Enable PPSD ERP to auto-start on login
echo   (this PC must stay logged in as the server)
echo ============================================
echo.
echo App folder: %~dp0
echo.

:: remove old method (scheduled task) if it exists - ignore errors
schtasks /delete /tn "PPSD ERP Server" /f >nul 2>&1

:: create a shortcut in the Windows Startup folder (runs minimized, no admin needed)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%LNK%'); $s.TargetPath='%TARGET%'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Description='PPSD ERP Server auto-start'; $s.Save()"

if exist "%LNK%" (
  echo [OK] Auto-start created:
  echo      %LNK%
  echo.
  echo   Next time you log in, the server starts automatically
  echo   at http://localhost:3001  (window stays minimized).
  echo.
  echo   * First time only: run allow-network.bat once so other PCs can connect.
  echo   * To test now: log off and log back in, or restart the PC.
) else (
  echo [ERROR] Could not create the shortcut. Manual way:
  echo   1^) Press Win+R, type  shell:startup  and press Enter
  echo   2^) Drag run-server.bat there ^(right-click ^> Create shortcut here^)
)
echo.
echo ============================================
echo   Press any key to START THE SERVER NOW,
echo   or close this window (it will start next login).
echo ============================================
pause >nul
start "PPSD ERP" /min "%TARGET%"
echo Server started - open your browser at http://localhost:3001
timeout /t 4 >nul
