import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ตัวแสดงแปลน + 3D ของเว็บลูกค้า (src/web-house/viewer.tsx) → dist/web/house/viewer.js
// ไฟล์เดียว ไม่มี hash · เว็บลูกค้าโหลดด้วย <script> เฉพาะตอนได้ผลแบบแล้ว
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist/web/house',
    emptyOutDir: true,
    lib: { entry: 'src/web-house/viewer.tsx', formats: ['iife'], name: 'PPSDHouseViewer', fileName: () => 'viewer.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
    chunkSizeWarningLimit: 2000,
  },
})
