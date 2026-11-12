// อัปเดตเว็บพนักงานบน Cloudflare (https://ppsd-office.pages.dev — /checkin ลงเวลา · /payroll เงินเดือน)
// รันบนเครื่องเซิร์ฟเวอร์ออฟฟิศ: node scripts/deploy-office.mjs
// 1) คัดลอกสูตรเงินเดือนกลาง server/payroll-core.js → functions/_lib (สูตรเดียวกับ ERP เสมอ)
// 2) อ่าน/สร้างกุญแจจาก ERP → ตั้งเป็นความลับบน Cloudflare (ไม่พิมพ์ออกจอ)
// 3) อัปขึ้นด้วย wrangler 4.20.0 (ห้ามใช้รุ่นใหม่ — จะพยายามย้ายไป Workers) + ลิงก์เก่า ppsd-checkin / ppsd-payroll .pages.dev พาไปลิงก์ใหม่
// 4) ตั้งลิงก์ใน ERP → ERP ซิงก์ทุก 1 นาทีเอง (รีสตาร์ตเซิร์ฟเวอร์ 3001 หลังรันครั้งแรก)
import { cpSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const PROJECT = 'ppsd-office', BASE = 'https://ppsd-office.pages.dev'
const W = 'npx -y wrangler@4.20.0'
const Database = createRequire(join(root, 'package.json'))('better-sqlite3')
const db = new Database(process.env.PPSD_DB || join(root, 'server', 'data', 'ppsd.sqlite'))
const get = (k) => db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value || ''
const set = (k, v) => db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, v)
const secret = (k) => { let v = get(k); if (!v) { v = randomBytes(32).toString('hex'); set(k, v) } return v }
const SECRETS = {
  CLOUD_KEY: secret('cloud_checkin_key'), // รหัสตรวจ PIN ลงเวลา
  CHECKIN_SYNC_TOKEN: secret('cloud_checkin_token'),
  PAY_SYNC_TOKEN: secret('cloud_payroll_token'),
  SESSION_KEY: secret('cloud_payroll_session_key'), // ลงชื่อเข้าใช้หน้าเงินเดือน
  PIN_KEY: secret('cloud_payroll_pin_key'), // รหัสตรวจ PIN ล็อกอินเงินเดือน
}

const tmp = mkdtempSync(join(tmpdir(), 'ppsd-office-'))
try {
  const out = join(tmp, 'site')
  cpSync(join(root, 'cloudflare', PROJECT), out, { recursive: true })
  mkdirSync(join(out, 'functions', '_lib'), { recursive: true })
  cpSync(join(root, 'server', 'payroll-core.js'), join(out, 'functions', '_lib', 'payroll-core.js'))
  const run = (cmd, cwd, input) => execSync(cmd, { cwd, stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit', input })
  const projects = execSync(`${W} pages project list`, { cwd: out, encoding: 'utf8' })
  if (!projects.includes(PROJECT + '.pages.dev')) run(`${W} pages project create ${PROJECT} --production-branch main`, out)
  run(`${W} d1 execute ppsd-checkin --remote --file schema/checkin.sql -y`, out)
  run(`${W} d1 execute ppsd-payroll --remote --file schema/payroll.sql -y`, out)
  for (const [k, v] of Object.entries(SECRETS)) run(`${W} pages secret put ${k} --project-name ${PROJECT}`, out, v)
  run(`${W} pages deploy public --project-name ${PROJECT} --branch main --commit-dirty=true`, out)
  // ลิงก์เก่า → ลิงก์ใหม่
  for (const [proj, dir] of [['ppsd-checkin', 'redirect-checkin'], ['ppsd-payroll', 'redirect-payroll']]) {
    if (!projects.includes(proj + '.pages.dev')) continue
    const r = join(tmp, dir); cpSync(join(root, 'cloudflare', dir), r, { recursive: true })
    run(`${W} pages deploy . --project-name ${proj} --branch main --commit-dirty=true`, r)
  }
  set('cloud_checkin_url', BASE + '/checkin'); set('cloud_payroll_url', BASE + '/payroll')
  console.log('\nเสร็จ — ' + BASE + ' (/checkin · /payroll) · ERP ซิงก์ทุก 1 นาที (ถ้าเพิ่งรันครั้งแรก ให้รีสตาร์ตเซิร์ฟเวอร์ 3001)')
} finally { rmSync(tmp, { recursive: true, force: true }); db.close() }
