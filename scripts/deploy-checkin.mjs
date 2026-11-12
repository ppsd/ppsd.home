// อัปเดตหน้าลงเวลาบน Cloudflare Pages (https://ppsd-checkin.pages.dev) — รันบนเครื่องเซิร์ฟเวอร์ออฟฟิศ: node scripts/deploy-checkin.mjs
// 1) อ่าน/สร้างกุญแจตรวจ PIN (cloud_checkin_key) + รหัสซิงก์ (cloud_checkin_token) จากฐานข้อมูล ERP → ตั้งเป็นความลับบน Cloudflare (ไม่พิมพ์ออกจอ)
// 2) อัปขึ้น Pages ด้วย wrangler 4.20.0 (ห้ามใช้รุ่นใหม่ — จะพยายามย้ายไป Workers)
// 3) ตั้งลิงก์ใน ERP → ERP ซิงก์ทุก 1 นาทีเอง (รีสตาร์ตเซิร์ฟเวอร์ 3001 หลังรันครั้งแรก)
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const PROJECT = 'ppsd-checkin', URL = 'https://ppsd-checkin.pages.dev'
const W = 'npx -y wrangler@4.20.0'
const Database = createRequire(join(root, 'package.json'))('better-sqlite3')
const db = new Database(process.env.PPSD_DB || join(root, 'server', 'data', 'ppsd.sqlite'))
const get = (k) => db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value || ''
const set = (k, v) => db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, v)
let key = get('cloud_checkin_key'); if (!key) { key = randomBytes(32).toString('hex'); set('cloud_checkin_key', key) }
let tok = get('cloud_checkin_token'); if (!tok) { tok = randomBytes(32).toString('hex'); set('cloud_checkin_token', tok) }

const out = mkdtempSync(join(tmpdir(), 'ppsd-checkin-'))
try {
  cpSync(join(root, 'cloudflare', PROJECT), out, { recursive: true })
  const run = (cmd, input) => execSync(cmd, { cwd: out, stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit', input })
  const projects = execSync(`${W} pages project list`, { cwd: out, encoding: 'utf8' })
  if (!projects.includes(PROJECT + '.pages.dev')) run(`${W} pages project create ${PROJECT} --production-branch main`)
  run(`${W} d1 execute ${PROJECT} --remote --file schema.sql -y`)
  run(`${W} pages secret put CLOUD_KEY --project-name ${PROJECT}`, key)
  run(`${W} pages secret put SYNC_TOKEN --project-name ${PROJECT}`, tok)
  run(`${W} pages deploy public --project-name ${PROJECT} --branch main --commit-dirty=true`)
  if (get('cloud_checkin_url') !== URL) set('cloud_checkin_url', URL)
  console.log('\nเสร็จ — ' + URL + ' · ERP ซิงก์ทุก 1 นาที (ถ้าเพิ่งรันครั้งแรก ให้รีสตาร์ตเซิร์ฟเวอร์ 3001)')
} finally { rmSync(out, { recursive: true, force: true }); db.close() }
