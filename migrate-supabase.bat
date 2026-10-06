@echo off
chcp 65001 >nul
title PPSD ERP - ย้ายข้อมูลขึ้น Supabase
cd /d "%~dp0"

REM ============================================================
REM  PPSD ERP — ย้ายข้อมูล SQLite (server\data\ppsd.sqlite) + ไฟล์แนบ ขึ้น Supabase
REM  ค่าเชื่อมต่ออ่านจาก server\data\supabase.env (ไม่อยู่ใน git) — ดูตัวอย่างที่ supabase.env.example
REM  ตัวเลือก (พิมพ์ต่อท้ายชื่อไฟล์ใน cmd):
REM    migrate-supabase.bat --dry-run     ดูแผน/จำนวนแถว ไม่เขียนอะไร
REM    migrate-supabase.bat --verify      เทียบจำนวนแถว SQLite กับ Supabase
REM    migrate-supabase.bat               ย้ายทุกตาราง + ไฟล์แนบ (ลบตารางชื่อเดียวกันใน Supabase แล้วสร้างใหม่ — รันซ้ำได้)
REM    migrate-supabase.bat --no-files    เฉพาะตาราง   |   --files-only   เฉพาะไฟล์แนบ   |   --files-only --skip-existing   อัปโหลดเฉพาะไฟล์ที่ยังไม่ขึ้น
REM  ระบบยังใช้ SQLite ตามปกติ การย้ายนี้ไม่แตะข้อมูลในเครื่อง
REM ============================================================

where node >nul 2>nul
if errorlevel 1 (
  echo   X ไม่พบ Node.js — ติดตั้งจาก https://nodejs.org ก่อน
  pause & exit /b 1
)

if not exist "server\data\supabase.env" (
  echo   ยังไม่มีไฟล์ server\data\supabase.env — สร้างให้จากตัวอย่างแล้ว กรุณาใส่ค่าจริง 3 ค่า บันทึก แล้วรันไฟล์นี้ใหม่
  if not exist "server\data" mkdir "server\data"
  copy /y supabase.env.example "server\data\supabase.env" >nul
  start notepad "server\data\supabase.env"
  pause & exit /b 1
)

for /f "usebackq eol=# tokens=1,* delims==" %%a in ("server\data\supabase.env") do set "%%a=%%b"
if "%DATABASE_URL%"=="" (
  echo   X DATABASE_URL ว่าง — เปิด server\data\supabase.env แล้วใส่ Session pooler connection string ของ Supabase
  pause & exit /b 1
)

if not exist "node_modules\pg" (
  echo [เตรียม] ติดตั้งแพ็กเกจที่ต้องใช้...
  call npm install
  if errorlevel 1 ( echo   X ติดตั้งแพ็กเกจไม่สำเร็จ & pause & exit /b 1 )
)

echo.
echo ============================================
echo   ย้ายข้อมูลขึ้น Supabase   ตัวเลือก: %*
echo   ต้นทาง: server\data\ppsd.sqlite + server\data\files
echo ============================================
echo.
node server\migrate-to-supabase.js %*
set RC=%errorlevel%
echo.
if "%RC%"=="0" (
  echo  ============================================
  echo   เสร็จแล้ว — ตรวจซ้ำได้ด้วย: migrate-supabase.bat --verify
  echo  ============================================
) else (
  echo  ============================================
  echo   มีข้อผิดพลาด ^(รหัส %RC%^) — อ่านข้อความด้านบน แก้แล้วรันใหม่ได้ ^(รันซ้ำปลอดภัย^)
  echo  ============================================
)
pause
