import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, normalize } from 'node:path'

// หน้าถอดแบบ + BOQ บน Cloudflare (ppsd-office.pages.dev/takeoff) → dist/takeoff/
// ใช้หน้าจอ BOQ ตัวเดียวกับ ERP (src/components/cost/*) แต่สลับ src/api.ts / src/store.tsx เป็นของ Cloudflare (src/cloud-takeoff/)
// scripts/deploy-office.mjs คัดลอก dist/takeoff + ไฟล์ WebAssembly ตัวแปลง DWG ขึ้นไปให้
const here = (p: string) => normalize(resolve(__dirname, p)).toLowerCase()
const SWAP: Record<string, string> = { [here('src/api.ts')]: resolve(__dirname, 'src/cloud-takeoff/api.ts'), [here('src/store.tsx')]: resolve(__dirname, 'src/cloud-takeoff/store.tsx') }
const shimDir = here('src/cloud-takeoff')
function swapErpModules(): Plugin {
  return {
    name: 'ppsd-cloud-takeoff-swap',
    enforce: 'pre',
    async resolveId(source, importer, opts) {
      if (!importer || normalize(importer).toLowerCase().startsWith(shimDir)) return null // ตัวแทนเองยังอ้างของจริงได้ (เฉพาะ type)
      const r = await this.resolve(source, importer, { ...opts, skipSelf: true })
      const to = r && SWAP[normalize(r.id).toLowerCase()]
      return to || null
    },
  }
}

export default defineConfig({
  root: 'src/cloud-takeoff',
  base: '/takeoff/',
  plugins: [swapErpModules(), react()],
  publicDir: false,
  define: { __BUILD_STAMP__: JSON.stringify('cloud') },
  worker: { format: 'es' },
  build: { outDir: resolve(__dirname, 'dist/takeoff'), emptyOutDir: true, chunkSizeWarningLimit: 3000 },
})
