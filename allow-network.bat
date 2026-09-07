@echo off
title PPSD ERP - Allow Network Access
:: --- self-elevate to Administrator (needed to change the firewall) ---
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting Administrator permission...
  powershell -Command "Start-Process '%~f0' -Verb RunAs"
  exit /b
)

echo ============================================
echo    PPSD ERP - open port 3001 on this PC
echo ============================================
echo.
echo Adding Windows Firewall rule so phones/other PCs
echo on the same Wi-Fi/LAN can open this server...
echo.

netsh advfirewall firewall delete rule name="PPSD ERP 3001" >nul 2>&1
netsh advfirewall firewall add rule name="PPSD ERP 3001" dir=in action=allow protocol=TCP localport=3001 profile=private,domain

echo.
echo Done. This computer's addresses on the network:
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo        http://%%a:3001
echo.
echo Give one of the http://192.168.x.x:3001 lines above to
echo other people. They open it in their phone/PC browser
echo (this computer must keep start.bat running).
echo.
pause
