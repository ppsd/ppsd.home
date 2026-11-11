// อัปเดตเว็บลูกค้าบน Cloudflare Pages (ppsd-web.pages.dev) — รันหลัง `npm run build`: node scripts/deploy-web.mjs
// รวม dist/web (หน้าเว็บ + ตัวแสดงแปลน/3D) + cloudflare/ppsd-web/functions (ตัวเรียก AI) + server/house-concept.js (กติกาจัดผังห้อง)
// ลงโฟลเดอร์ชั่วคราว แล้วอัปขึ้นด้วย wrangler 4.20.0 (ห้ามใช้รุ่นใหม่ — จะพยายามย้ายไป Workers)
import { cpSync, mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
if (!existsSync(join(root, 'dist/web/house/viewer.js'))) { console.error('ยังไม่มี dist/web/house/viewer.js — รัน npm run build ก่อน'); process.exit(1) }
const out = mkdtempSync(join(tmpdir(), 'ppsd-web-'))
try {
  cpSync(join(root, 'dist/web'), join(out, 'web'), { recursive: true })
  cpSync(join(root, 'cloudflare/ppsd-web/functions'), join(out, 'functions'), { recursive: true })
  cpSync(join(root, 'server/house-concept.js'), join(out, 'functions/_lib/house-concept.js'))
  cpSync(join(root, 'cloudflare/ppsd-web/wrangler.toml'), join(out, 'wrangler.toml'))
  execSync('npx -y wrangler@4.20.0 pages deploy web --project-name ppsd-web --branch main --commit-dirty=true', { cwd: out, stdio: 'inherit' })
} finally { rmSync(out, { recursive: true, force: true }) }
