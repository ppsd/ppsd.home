// ทดสอบโค้ดเงินเดือนฝั่ง Cloudflare (cloudflare/ppsd-office/functions/api/payroll) ในเครื่อง — D1 จำลองด้วย SQLite
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, cpSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHmac, createHash } from 'node:crypto'
import { createRequire } from 'node:module'

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const Database = createRequire(join(root, 'package.json'))('better-sqlite3')
const core = await import(pathToFileURL(join(root, 'server', 'payroll-core.js')).href)

// D1 จำลอง (prepare/bind/first/all/run/batch)
class Stmt { constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args } bind(...a) { return new Stmt(this.db, this.sql, a) }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null } async all() { return { results: this.db.prepare(this.sql).all(...this.args) } } async run() { this.db.prepare(this.sql).run(...this.args); return {} } }
class D1 { constructor(db) { this.db = db } prepare(sql) { return new Stmt(this.db, sql) } async batch(st) { this.db.transaction(() => st.forEach((s) => this.db.prepare(s.sql).run(...s.args)))() } }

async function loadFn() {
  const tmp = mkdtempSync(join(tmpdir(), 'ppsd-fn-'))
  mkdirSync(join(tmp, 'functions', 'api', 'payroll'), { recursive: true }); mkdirSync(join(tmp, 'functions', '_lib'), { recursive: true })
  cpSync(join(root, 'cloudflare', 'ppsd-office', 'functions', 'api', 'payroll', '[[path]].js'), join(tmp, 'functions', 'api', 'payroll', 'fn.mjs'))
  cpSync(join(root, 'server', 'payroll-core.js'), join(tmp, 'functions', '_lib', 'payroll-core.js'))
  const mod = await import(pathToFileURL(join(tmp, 'functions', 'api', 'payroll', 'fn.mjs')).href)
  return { mod, tmp }
}

test('เงินเดือนฝั่ง Cloudflare: รับข้อมูลจาก ERP · ล็อกอินด้วย PIN · ล็อกเมื่อผิด 5 ครั้ง · ดูเงินเดือนงวด (ตรงกับสูตรกลาง) · โทเคนปลอม/ถอดสิทธิ์ = เข้าไม่ได้', async () => {
  const { mod, tmp } = await loadFn()
  const sq = new Database(':memory:'); sq.exec(readFileSync(join(root, 'cloudflare', 'ppsd-office', 'schema', 'payroll.sql'), 'utf8'))
  const env = { PAY_DB: new D1(sq), PAY_SYNC_TOKEN: 'sync-t', SESSION_KEY: 'sess-k', PIN_KEY: 'pin-k' }
  const call = async (method, path, body, tok) => {
    const req = new Request('https://x.test/api/payroll' + path, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined })
    const r = await mod.onRequest({ request: req, env, params: { path: path.split('?')[0].split('/').filter(Boolean) } })
    return { status: r.status, data: await r.json() }
  }
  const hash = (u, pin) => createHmac('sha256', 'pin-k').update(u + ':' + pin).digest('hex')
  const period = '2035-04'
  const employees = [{ id: 1, code: 'E1', name: 'สมชาย', role: 'ช่าง', pay_type: 'รายเดือน', base: 20000, sso: 750, tax: 100, status: 'ทำงาน', retention: 500, retention_opening: 0, student_loan: 0 },
    { id: 2, code: 'E2', name: 'สมหญิง', role: 'ช่าง', pay_type: 'รายวัน', base: 400, sso: 0, tax: 0, status: 'ทำงาน', retention: 0, retention_opening: 0, student_loan: 0 }]
  const att = [{ emp_code: 'E2', date: '2035-04-02', check_in: '08:00' }, { emp_code: 'E2', date: '2035-04-03', check_in: '08:00' }]
  const users = [{ id: 7, username: 'acc', name: 'บัญชี', can_view: true, can_edit: true, hash: hash('acc', '1357') }, { id: 8, username: 'nohash', name: 'ยังไม่เปิด', can_view: true, can_edit: false, hash: null }]
  const ds = { users, employees, ['att:' + period]: att, salary_advances: [{ emp_code: 'E1', period, amount: 2000 }], deductions: [], other_income: [], payroll_inputs: [], payroll_runs: [], payroll_batches: [], leaves: [], ot: [], holidays: [], time_adjustments: [] }
  const sha = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex')
  assert.equal((await call('POST', '/sync', { datasets: [] }, 'wrong')).status, 401, 'ซิงก์ต้องมีรหัส')
  const s = await call('POST', '/sync', { datasets: Object.entries(ds).map(([name, data]) => ({ name, sha: sha(data), data })) }, 'sync-t')
  assert.equal(s.status, 200); assert.equal(Object.keys(s.data.have).length, Object.keys(ds).length)
  // ล็อกอิน
  assert.equal((await call('POST', '/login', { username: 'acc', pin: '0000' })).status, 401)
  const nh = await call('POST', '/login', { username: 'nohash', pin: '1111' })
  assert.equal(nh.status, 403); assert.match(nh.data.error, /ล็อกอิน ERP/)
  const ok = await call('POST', '/login', { username: 'ACC', pin: '1357' })
  assert.equal(ok.status, 200); assert.equal(ok.data.user.can_edit, true)
  const tok = ok.data.token
  assert.equal((await call('GET', '/payroll?period=' + period, null, null)).status, 401, 'ไม่ล็อกอิน = เข้าไม่ได้')
  assert.equal((await call('GET', '/payroll?period=' + period, null, tok.slice(0, -2) + 'aa')).status, 401, 'โทเคนปลอม')
  const p = await call('GET', '/payroll?period=' + period, null, tok)
  assert.equal(p.status, 200)
  const expect = core.computePayroll({ employees, attendance: att, time_adjustments: [], leaves: [], holidays: [], ot: [], payroll_inputs: [], salary_advances: ds.salary_advances, deductions: [], other_income: [], runs: [] }, period)
  for (const e of expect) assert.equal(p.data.rows.find((r) => r.code === e.code).net, core.r2(core.netOf(e)), 'ยอดสุทธิต้องตรงสูตรกลาง')
  assert.equal(p.data.rows.find((r) => r.code === 'E2').base, 800, 'รายวัน 2 วัน × 400')
  // ผิด 5 ครั้ง → ล็อก
  for (let i = 0; i < 5; i++) await call('POST', '/login', { username: 'acc', pin: '9999' })
  assert.equal((await call('POST', '/login', { username: 'acc', pin: '1357' })).status, 429)
  // ถอดสิทธิ์ใน ERP (ไม่อยู่ในรายชื่อ users) → โทเคนเดิมใช้ไม่ได้
  await call('POST', '/sync', { datasets: [{ name: 'users', sha: 'x', data: [] }] }, 'sync-t')
  assert.equal((await call('GET', '/payroll?period=' + period, null, tok)).status, 401)
  rmSync(tmp, { recursive: true, force: true })
})
