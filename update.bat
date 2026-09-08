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
if errorlevel 1 goto :plain
call pm2 describe ppsd-erp >nul 2>nul
if errorlevel 1 goto :plain
call pm2 restart ppsd-erp
timeout /t 5 >nul
goto :verify

:plain
REM ไม่ได้ติดตั้งเป็น service — ปิดตัวเก่าให้หมด: ทั้ง node ที่รัน server\index.js และตัวที่ถือพอร์ต 3001 อยู่
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*server\index.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>nul
timeout /t 3 >nul
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>nul
timeout /t 3 >nul
REM ถ้า run-server.bat เปิดลูปไว้ มันจะเปิดตัวใหม่เองใน 5 วิ — ถ้าไม่มีใครเปิด ให้เปิด run-server.bat ในหน้าต่างใหม่ให้เลย
timeout /t 6 >nul
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo   - ไม่มีเซิร์ฟเวอร์เปิดอยู่ — เปิด run-server.bat ให้ในหน้าต่างใหม่ ^(อย่าปิดหน้าต่างนั้น^)
  start "PPSD ERP Server" cmd /c run-server.bat
  timeout /t 12 >nul
)

:verify
REM เช็คว่าตัวที่รันอยู่เป็นโค้ดใหม่จริง (ไม่ใช่ process เก่าที่ยังค้าง) ผ่าน /api/version
powershell -NoProfile -Command "try { $v = Invoke-RestMethod -UseBasicParsing http://localhost:3001/api/version -TimeoutSec 5; if ($v.stale) { exit 2 } else { exit 0 } } catch { exit 1 }"
if errorlevel 2 (
  echo.
  echo  ============================================
  echo   อัปเดตโค้ดแล้ว แต่เซิร์ฟเวอร์ที่รันอยู่ยังเป็นตัวเก่า
  echo   ให้ปิดหน้าต่าง PPSD ERP Server ทุกอัน แล้วดับเบิลคลิก run-server.bat
  echo   ^(หรือกดปุ่ม "รีสตาร์ทเซิร์ฟเวอร์" ที่มุมล่างซ้ายของเมนูในเว็บ^)
  echo  ============================================
  goto :done
)
if errorlevel 1 (
  echo.
  echo  ============================================
  echo   อัปเดตโค้ดเสร็จแล้ว แต่ระบบยังไม่ได้เปิดขึ้นมา
  echo   ให้ดับเบิลคลิก run-server.bat เพื่อเปิดระบบ
  echo  ============================================
  goto :done
)
echo.
echo  ============================================
echo   เสร็จแล้ว — ระบบทำงานอยู่ที่ http://localhost:3001 ^(เวอร์ชันใหม่^)
echo   ทุกคนกด F5 ในเบราว์เซอร์ได้เลย
echo  ============================================

:done
echo.
pause
