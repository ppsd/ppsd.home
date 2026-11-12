// อัปเดตเงินเดือนบน Cloudflare Pages (https://ppsd-payroll.pages.dev) — รันบนเครื่องเซิร์ฟเวอร์ออฟฟิศ: node scripts/deploy-payroll.mjs
// 1) คัดลอกสูตรเงินเดือนกลาง server/payroll-core.js → functions/_lib (สูตรเดียวกับ ERP เสมอ)
// 2) อ่าน/สร้างรหัสซิงก์ (cloud_payroll_token) จาก ERP → ตั้งเป็นความลับบน Cloudflare (ไม่พิมพ์ออกจอ)
// 3) อัปขึ้นด้วย wrangler 4.20.0 (ห้ามใช้รุ่นใหม่) แล้วตั้งลิงก์ใน ERP → ERP ส่งข้อมูลขึ้นทุก 1 นาทีเอง (รีสตาร์ต 3001 หลังรันครั้งแรก)
import { cpSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const PROJECT = 'ppsd-payroll', URL = 'https://ppsd-payroll.pages.dev'
const W = 'npx -y wrangler@4.20.0'
const Database = createRequire(join(root, 'package.json'))('better-sqlite3')
const db = new Database(process.env.PPSD_DB || join(root, 'server', 'data', 'ppsd.sqlite'))
const get = (k) => db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value || ''
const set = (k, v) => db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, v)
const secret = (k) => { let v = get(k); if (!v) { v = randomBytes(32).toString('hex'); set(k, v) } return v }
const syncToken = secret('cloud_payroll_token')
const sessionKey = secret('cloud_payroll_session_key') // ลงชื่อเข้าใช้บน Cloudflare (ขั้น 3)
const pinKey = secret('cloud_payroll_pin_key') // รหัสตรวจ PIN เฉพาะเงินเดือน (ขั้น 3)

const out = mkdtempSync(join(tmpdir(), 'ppsd-payroll-'))
try {
  cpSync(join(root, 'cloudflare', PROJECT), out, { recursive: true })
  mkdirSync(join(out, 'functions', '_lib'), { recursive: true })
  cpSync(join(root, 'server', 'payroll-core.js'), join(out, 'functions', '_lib', 'payroll-core.js'))
  const run = (cmd, input) => execSync(cmd, { cwd: out, stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit', input })
  const projects = execSync(`${W} pages project list`, { cwd: out, encoding: 'utf8' })
  if (!projects.includes(PROJECT + '.pages.dev')) run(`${W} pages project create ${PROJECT} --production-branch main`)
  run(`${W} d1 execute ${PROJECT} --remote --file schema.sql -y`)
  run(`${W} pages secret put SYNC_TOKEN --project-name ${PROJECT}`, syncToken)
  run(`${W} pages secret put SESSION_KEY --project-name ${PROJECT}`, sessionKey)
  run(`${W} pages secret put PIN_KEY --project-name ${PROJECT}`, pinKey)
  run(`${W} pages deploy public --project-name ${PROJECT} --branch main --commit-dirty=true`)
  if (get('cloud_payroll_url') !== URL) set('cloud_payroll_url', URL)
  console.log('\nเสร็จ — ' + URL + ' · ERP ส่งข้อมูลขึ้นทุก 1 นาที (ถ้าเพิ่งรันครั้งแรก ให้รีสตาร์ตเซิร์ฟเวอร์ 3001)')
} finally { rmSync(out, { recursive: true, force: true }); db.close() }
