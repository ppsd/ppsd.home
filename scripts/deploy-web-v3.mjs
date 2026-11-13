// ขึ้นเว็บลูกค้าเวอร์ชันใหม่ (v3 จากทีมเว็บ) บน Cloudflare Pages: node scripts/deploy-web-v3.mjs
//   ค่าเริ่ม = ลิงก์ทดลอง https://v3.ppsd-web.pages.dev (เว็บจริง ppsd-web.pages.dev ไม่เปลี่ยน)
//   node scripts/deploy-web-v3.mjs --live  = ขึ้นแทนเว็บจริง (ทำเมื่อผู้บริหารอนุมัติแล้วเท่านั้น)
// หน้าเว็บอยู่ที่ cloudflare/ppsd-web-v3/site (HTML/JS ล้วน ไม่ต้อง build) · ใช้ตัวเรียก AI ชุดเดียวกับเว็บเดิม
// (cloudflare/ppsd-web/functions) จึงใช้ปุ่ม "ออกแบบบ้านให้ดูเลย" และห้องรวมไอเดียได้เหมือนเดิม
// ต้องใช้ wrangler 4.20.0 เท่านั้น (รุ่นใหม่จะพยายามย้ายไป Workers)
import { cpSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const live = process.argv.includes('--live')
const branch = live ? 'main' : 'v3'
const out = mkdtempSync(join(tmpdir(), 'ppsd-web-v3-'))
try {
  cpSync(join(root, 'cloudflare/ppsd-web-v3/site'), join(out, 'web'), { recursive: true })
  cpSync(join(root, 'cloudflare/ppsd-web/functions'), join(out, 'functions'), { recursive: true })
  cpSync(join(root, 'server/house-concept.js'), join(out, 'functions/_lib/house-concept.js'))
  // ห้องรวมไอเดีย: ส่งออกจาก ERP ที่รันอยู่ในเครื่องนี้ (เปิดไม่ได้ใช้ชุดตั้งต้น) — เหมือน deploy-web.mjs
  let ideas = null
  try { const r = await fetch('http://localhost:' + (process.env.PORT || 3001) + '/api/public/house-ideas', { signal: AbortSignal.timeout(10000) }); if (r.ok) ideas = await r.json() } catch { /* ใช้ชุดตั้งต้น */ }
  if (!Array.isArray(ideas) || !ideas.length) {
    ideas = JSON.parse(readFileSync(join(root, 'server/house-ideas-seed.json'), 'utf8')).filter((x) => x.image_url).map((x, i) => ({ id: i + 1, ...x }))
    console.log('ห้องรวมไอเดีย: เปิด ERP ไม่ได้ — ใช้ชุดตั้งต้น ' + ideas.length + ' รายการ')
  } else console.log('ห้องรวมไอเดีย: ส่งออกจาก ERP ' + ideas.length + ' รายการ')
  writeFileSync(join(out, 'web/ideas.json'), JSON.stringify(ideas))
  cpSync(join(root, 'cloudflare/ppsd-web/wrangler.toml'), join(out, 'wrangler.toml'))
  console.log(live ? 'ขึ้นแทนเว็บจริง ppsd-web.pages.dev' : 'ขึ้นลิงก์ทดลอง v3.ppsd-web.pages.dev')
  execSync(`npx -y wrangler@4.20.0 pages deploy web --project-name ppsd-web --branch ${branch} --commit-dirty=true`, { cwd: out, stdio: 'inherit' })
} finally { rmSync(out, { recursive: true, force: true }) }
