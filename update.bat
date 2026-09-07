@echo off
chcp 65001 >nul
title PPSD ERP - อัปเดตเวอร์ชันล่าสุด
cd /d "%~dp0"

REM ============================================================
REM  PPSD ERP — อัปเดตคลิกเดียว
REM  ดึงโค้ดล่าสุดจาก GitHub -> ติดตั้งแพ็กเกจ -> build -> รีสตาร์ท
REM  ข้อมูลใน server\data ไม่ถูกแตะต้อง
REM ============================================================

where node >nul 2>nul
if errorlevel 1 (
  echo   X ไม่พบ Node.js — ติดตั้งจาก https://nodejs.org ก่อน แล้วรันไฟล์นี้ใหม่
  pause & exit /b 1
)

echo [1/4] ดึงโค้ดล่าสุดจาก GitHub...
if not exist ".git" (
  echo   - โฟลเดอร์นี้ไม่ได้มาจาก git clone ^(แตก zip มา^) — ข้ามขั้นตอนดึงโค้ด
  echo   - ถ้าต้องการอัปเดตอัตโนมัติในอนาคต: git clone https://github.com/ppsd/ppsd.home
  echo     แล้วย้ายโฟลเดอร์ server\data ของเดิมไปไว้ในโฟลเดอร์ใหม่
  goto :install
)
where git >nul 2>nul
if errorlevel 1 (
  echo   X ไม่พบ git — ติดตั้งจาก https://git-scm.com แล้วรันไฟล์นี้ใหม่
  pause & exit /b 1
)
git pull origin master
if errorlevel 1 (
  echo   X ดึงโค้ดไม่สำเร็จ — เช็คอินเทอร์เน็ต หรือมีไฟล์ที่แก้ไว้ในเครื่องชนกับของใหม่
  echo     ถ้าแก้ไฟล์ในเครื่องไว้: git stash  แล้วรันไฟล์นี้ใหม่
  pause & exit /b 1
)

:install
echo.
echo [2/4] ติดตั้งแพ็กเกจ ^(ถ้ามีของใหม่^)...
call npm install
if errorlevel 1 ( echo   X ติดตั้งแพ็กเกจไม่สำเร็จ & pause & exit /b 1 )

echo.
echo [3/4] Build หน้าเว็บ...
call npm run build
if errorlevel 1 ( echo   X build ไม่ผ่าน & pause & exit /b 1 )

echo.
echo [4/4] รีสตาร์ทระบบ...
where pm2 >nul 2>nul
if errorlevel 1 goto :restart_plain
call pm2 describe ppsd-erp >nul 2>nul
if errorlevel 1 goto :restart_plain
call pm2 restart ppsd-erp
goto :verify

:restart_plain
REM ไม่ได้ติดตั้งเป็น service — ปิด node ตัวที่รัน server\index.js อยู่
REM ถ้าเปิดผ่าน run-server.bat มันจะเปิดตัวใหม่ให้เองใน 5 วินาที
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*server\index.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>nul
timeout /t 8 >nul

:verify
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://localhost:3001 -TimeoutSec 5; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if errorlevel 1 (
  echo.
  echo  ============================================
  echo   อัปเดตโค้ดเสร็จแล้ว แต่ระบบยังไม่ได้เปิดขึ้นมา
  echo   ให้ดับเบิลคลิก start.bat หรือ run-server.bat เพื่อเปิดระบบ
  echo  ============================================
) else (
  echo.
  echo  ============================================
  echo   เสร็จแล้ว — ระบบทำงานอยู่ที่ http://localhost:3001
  echo   ทุกคนกด F5 ในเบราว์เซอร์ได้เลย
  echo  ============================================
)
echo.
pause
