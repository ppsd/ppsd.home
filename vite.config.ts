import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// ตราเวอร์ชัน: วัน-เวลาที่ build (แสดงมุมล่างซ้ายของเมนู ใช้เช็คว่าเครื่องรันเวอร์ชันล่าสุดหรือยัง)
const buildStamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_STAMP__: JSON.stringify(buildStamp) },
  // ไม่ลบ dist ก่อน build — ระหว่างที่ update.bat กำลัง build ผู้ใช้ยังเปิดหน้าเว็บเวอร์ชันเดิมได้ (ไฟล์ใหม่มีชื่อ hash ต่างกัน ไม่ทับกัน)
  build: { emptyOutDir: false },
  server: {
    host: true, // expose the dev server on the LAN too
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
