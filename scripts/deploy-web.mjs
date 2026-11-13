// ⚠ ตั้งแต่ 13 พ.ย. 2569 เว็บจริง ppsd-web.pages.dev คือเว็บ v3 (node scripts/deploy-web-v3.mjs --live) — สคริปต์นี้ขึ้นเว็บเวอร์ชันเก่า (public/web) ทับเว็บจริง
//   ใช้เฉพาะเมื่อเจ้าของสั่งให้ย้อนกลับไปเว็บเก่า · ต้องพิมพ์ --old-site ยืนยันทุกครั้ง
// อัปเดตเว็บลูกค้าบน Cloudflare Pages (ppsd-web.pages.dev) — รันหลัง `npm run build`: node scripts/deploy-web.mjs
// รวม dist/web (หน้าเว็บ + ตัวแสดงแปลน/3D) + cloudflare/ppsd-web/functions (ตัวเรียก AI) + server/house-concept.js (กติกาจัดผังห้อง)
// ลงโฟลเดอร์ชั่วคราว แล้วอัปขึ้นด้วย wrangler 4.20.0 (ห้ามใช้รุ่นใหม่ — จะพยายามย้ายไป Workers)
import { cpSync, mkdtempSync, existsSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
if (!process.argv.includes('--old-site')) { console.error('เว็บจริงตอนนี้คือ v3 — อัปเดตด้วย node scripts/deploy-web-v3.mjs --live · ถ้าตั้งใจย้อนกลับไปเว็บเก่าจริงๆ ให้ใส่ --old-site'); process.exit(1) }

const root = dirname(dirname(fileURLToPath(import.meta.url)))
if (!existsSync(join(root, 'dist/web/house/viewer.js'))) { console.error('ยังไม่มี dist/web/house/viewer.js — รัน npm run build ก่อน'); process.exit(1) }
const out = mkdtempSync(join(tmpdir(), 'ppsd-web-'))
try {
  cpSync(join(root, 'dist/web'), join(out, 'web'), { recursive: true })
  cpSync(join(root, 'cloudflare/ppsd-web/functions'), join(out, 'functions'), { recursive: true })
  // ห้องรวมไอเดีย: ส่งออกรายการที่พนักงานเปิดให้เว็บเห็นจาก ERP ที่รันอยู่ในเครื่องนี้ (ถ้าเปิดไม่ได้ ใช้ชุดตั้งต้น)
  let ideas = null
  try { const r = await fetch('http://localhost:' + (process.env.PORT || 3001) + '/api/public/house-ideas', { signal: AbortSignal.timeout(10000) }); if (r.ok) ideas = await r.json() } catch { /* ใช้ชุดตั้งต้น */ }
  if (!Array.isArray(ideas) || !ideas.length) {
    ideas = JSON.parse(readFileSync(join(root, 'server/house-ideas-seed.json'), 'utf8')).filter((x) => x.image_url).map((x, i) => ({ id: i + 1, ...x }))
    console.log('ห้องรวมไอเดีย: เปิด ERP ไม่ได้ — ใช้ชุดตั้งต้น ' + ideas.length + ' รายการ')
  } else console.log('ห้องรวมไอเดีย: ส่งออกจาก ERP ' + ideas.length + ' รายการ')
  writeFileSync(join(out, 'web/ideas.json'), JSON.stringify(ideas))
  cpSync(join(root, 'server/house-concept.js'), join(out, 'functions/_lib/house-concept.js'))
  cpSync(join(root, 'cloudflare/ppsd-web/wrangler.toml'), join(out, 'wrangler.toml'))
  execSync('npx -y wrangler@4.20.0 pages deploy web --project-name ppsd-web --branch main --commit-dirty=true', { cwd: out, stdio: 'inherit' })
} finally { rmSync(out, { recursive: true, force: true }) }
