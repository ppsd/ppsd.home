@echo off
chcp 65001 >nul
REM ============================================================
REM  PPSD ERP — ติดตั้งเป็น Service (Windows)
REM  คลิกขวาไฟล์นี้ > Run as administrator
REM  ผลลัพธ์: ระบบเปิดเองตอนเปิดเครื่อง · ล่มแล้วฟื้นเอง · มี log
REM ============================================================
cd /d "%~dp0"

echo [1/5] ตรวจว่ามี Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo   X ไม่พบ Node.js — ติดตั้งจาก https://nodejs.org ก่อน แล้วรันไฟล์นี้ใหม่
  pause & exit /b 1
)

echo [2/5] Build หน้าเว็บเวอร์ชันล่าสุด...
call npm run build
if errorlevel 1 ( echo   X build ไม่ผ่าน & pause & exit /b 1 )

echo [3/5] ติดตั้ง PM2 (ตัวคุม service)...
call npm install -g pm2 pm2-windows-startup
if errorlevel 1 ( echo   X ติดตั้ง PM2 ไม่สำเร็จ & pause & exit /b 1 )

echo [4/5] เริ่มระบบ + ตั้งให้เปิดเองตอนบูตเครื่อง...
call pm2 start ecosystem.config.cjs
call pm2 save
call pm2-startup install
call pm2 save

echo [5/5] เสร็จแล้ว! ตรวจสถานะ...
call pm2 status
echo.
echo  ============================================
echo   PPSD ERP ทำงานอยู่ที่ http://localhost:3001
echo   คำสั่งที่ใช้บ่อย:
echo     pm2 status        ดูสถานะ
echo     pm2 logs ppsd-erp ดู log สด
echo     pm2 restart ppsd-erp  รีสตาร์ท (หลังอัปเดตโปรแกรม)
echo  ============================================
pause
