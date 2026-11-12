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
  cpSync(join(root, 'cloudflare', 'ppsd-office', 'functions', '_lib', 'payroll-ops.js'), join(tmp, 'functions', '_lib', 'payroll-ops.js'))
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

test('เงินเดือนฝั่ง Cloudflare: คำสั่งแก้ไข — ช่วงเตรียมระบบห้ามแก้ · เปิดใช้จริงแล้วกรอกวัน/เบิก/หัก/แก้ภาษี/ทำจ่าย/เปิดแก้ไข ได้ตามกติกาเดียวกับ ERP · ERP ดึงผลกลับได้', async () => {
  const { mod, tmp } = await loadFn()
  const sq = new Database(':memory:'); sq.exec(readFileSync(join(root, 'cloudflare', 'ppsd-office', 'schema', 'payroll.sql'), 'utf8'))
  const env = { PAY_DB: new D1(sq), PAY_SYNC_TOKEN: 'sync-t', SESSION_KEY: 'sess-k', PIN_KEY: 'pin-k' }
  const call = async (method, path, body, tok) => {
    const req = new Request('https://x.test/api/payroll' + path, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined })
    const r = await mod.onRequest({ request: req, env, params: { path: path.split('?')[0].split('/').filter(Boolean) } })
    return { status: r.status, data: await r.json() }
  }
  const hash = (u, pin) => createHmac('sha256', 'pin-k').update(u + ':' + pin).digest('hex')
  const period = '2035-05'
  const employees = [{ id: 1, code: 'E1', name: 'สมชาย', role: 'ช่าง', pay_type: 'รายเดือน', base: 15000, sso: 750, tax: 0, status: 'ทำงาน', retention: 500, retention_opening: 0, student_loan: 0 },
    { id: 2, code: 'E9', name: 'ลาออกแล้ว', role: 'ช่าง', pay_type: 'รายเดือน', base: 9000, sso: 450, tax: 0, status: 'ลาออก', resign_date: '2035-01-31', retention: 0, retention_opening: 0, student_loan: 0 }]
  const users = [{ id: 7, username: 'acc', name: 'บัญชี', can_view: true, can_edit: true, hash: hash('acc', '1357') }, { id: 9, username: 'mgr', name: 'ผจก', can_view: true, can_edit: false, hash: hash('mgr', '2468') }]
  const ds = { users, employees, payroll_inputs: [], salary_advances: [], deductions: [], other_income: [], payroll_runs: [], payroll_batches: [], leaves: [], ot: [], holidays: [], time_adjustments: [] }
  await call('POST', '/sync', { datasets: Object.entries(ds).map(([name, data]) => ({ name, sha: 's-' + name, data })) }, 'sync-t')
  const tok = (await call('POST', '/login', { username: 'acc', pin: '1357' })).data.token
  const mtok = (await call('POST', '/login', { username: 'mgr', pin: '2468' })).data.token
  // ช่วงเตรียมระบบ → แก้ไม่ได้
  assert.equal((await call('POST', '/advances', { emp_code: 'E1', amount: 1000, period }, tok)).status, 409)
  assert.equal((await call('POST', '/mode', { mode: 'live' }, 'wrong')).status, 401)
  assert.equal((await call('POST', '/mode', { mode: 'live' }, 'sync-t')).status, 200)
  assert.equal((await call('POST', '/advances', { emp_code: 'E1', amount: 1000, period }, mtok)).status, 403, 'ผู้จัดการดูอย่างเดียว')
  // เบิก / หัก / รายได้
  assert.equal((await call('POST', '/advances', { emp_code: 'E1', amount: 2000, note: 'ค่าเทอมลูก', period }, tok)).status, 201)
  assert.equal((await call('POST', '/deductions', { emp_code: 'E1', amount: 300, period }, tok)).status, 400, 'หักต้องมีเหตุผล')
  assert.equal((await call('POST', '/deductions', { emp_code: 'E1', amount: 300, reason: 'ของหาย', period }, tok)).status, 201)
  assert.equal((await call('POST', '/income', { emp_code: 'E1', amount: 1000, reason: 'เบี้ยขยัน', period }, tok)).status, 201)
  const ro = await call('POST', '/advances', { emp_code: 'E9', amount: 100, period }, tok)
  assert.equal(ro.status, 400); assert.match(ro.data.error, /ลาออกแล้ว/)
  // กรอกวัน / แก้ภาษี
  assert.equal((await call('PUT', '/inputs', { period, emp_code: 'E1', work_days: 40 }, tok)).status, 400, 'เกินวันในเดือน')
  assert.equal((await call('PUT', '/inputs', { period, emp_code: 'E1', work_days: 15 }, tok)).status, 200)
  assert.equal((await call('POST', '/employee', { emp_code: 'E1', field: 'tax', value: 120 }, tok)).status, 200)
  assert.equal((await call('POST', '/employee', { emp_code: 'E1', field: 'base', value: 99999 }, tok)).status, 400, 'แก้เงินเดือนฐานที่นี่ไม่ได้')
  let p = (await call('GET', '/payroll?period=' + period, null, tok)).data
  const r1 = p.rows.find((r) => r.code === 'E1')
  assert.equal(r1.base, 7500, '15 วัน = 15000/30×15'); assert.equal(r1.tax, 120); assert.equal(r1.advance, 2000); assert.equal(r1.other_deduct, 300); assert.equal(r1.other_income, 1000)
  // ทำจ่าย
  const c = await call('POST', '/batches', { period, emp_codes: ['E1'], pay_date: '2035-05-31', note: 'รอบแรก' }, tok)
  assert.equal(c.status, 201); assert.equal(c.data.batch.no, 'PAY-203505-1')
  assert.equal((await call('POST', '/batches', { period, emp_codes: ['E1'] }, tok)).status, 400, 'จ่ายซ้ำไม่ได้')
  assert.equal((await call('POST', '/advances', { emp_code: 'E1', amount: 100, period }, tok)).status, 400, 'ทำจ่ายแล้วเบิกเข้างวดนี้ไม่ได้')
  assert.equal((await call('PUT', '/inputs', { period, emp_code: 'E1', work_days: 10 }, tok)).status, 400)
  p = (await call('GET', '/payroll?period=' + period, null, tok)).data
  assert.equal(p.rows.find((r) => r.code === 'E1').paid, true)
  // เปิดแก้ไข → แก้วัน → ปิดใหม่
  const bid = c.data.batch.id
  assert.equal((await call('DELETE', '/batches/' + bid, null, tok)).status, 400, 'รอบปิดอยู่ลบไม่ได้')
  assert.equal((await call('POST', '/batches/' + bid + '/reopen', {}, tok)).status, 200)
  assert.equal((await call('PUT', '/inputs', { period, emp_code: 'E1', work_days: 20 }, tok)).status, 200)
  const again = await call('POST', '/batches/' + bid + '/close', {}, tok)
  assert.equal(again.status, 200); assert.equal(again.data.rows[0].base, 10000)
  // เงินติดลบทำจ่ายไม่ได้
  await call('POST', '/sync', { datasets: [{ name: 'employees', sha: 'e2', data: [...employees, { id: 3, code: 'E3', name: 'ติดลบ', role: 'ช่าง', pay_type: 'รายวัน', base: 300, sso: 0, tax: 0, status: 'ทำงาน', retention: 0, retention_opening: 0, student_loan: 0, work_days: 1 }] }] }, 'sync-t')
  await call('POST', '/advances', { emp_code: 'E3', amount: 5000, period }, tok)
  const neg = await call('POST', '/batches', { period, emp_codes: ['E3'] }, tok)
  assert.equal(neg.status, 400); assert.match(neg.data.error, /ติดลบ/)
  // ERP ส่งข้อมูลเงินเดือนทับไม่ได้หลังเปิดใช้จริง
  await call('POST', '/sync', { datasets: [{ name: 'salary_advances', sha: 'zz', data: [] }] }, 'sync-t')
  assert.ok((await call('GET', '/items?period=' + period, null, tok)).data.advances.length >= 2, 'ข้อมูลเงินเดือนบน Cloudflare ต้องไม่ถูกทับ')
  // ERP ดึงผลกลับ
  const pull = await call('POST', '/pull', {}, 'sync-t')
  assert.equal(pull.data.mode, 'live')
  const names = pull.data.datasets.map((d) => d.name)
  for (const n of ['payroll_batches', 'payroll_runs', 'salary_advances', 'payroll_inputs']) assert.ok(names.includes(n), n)
  assert.equal(pull.data.patches.length, 1); assert.equal(pull.data.patches[0].field, 'tax')
  assert.ok(pull.data.audit.some((a) => a.action === 'ทำจ่ายเงินเดือน'))
  await call('POST', '/ack', { patches: pull.data.patches.map((x) => x.id), audit: pull.data.audit.map((x) => x.id) }, 'sync-t')
  const pull2 = await call('POST', '/pull', {}, 'sync-t')
  assert.equal(pull2.data.patches.length, 0); assert.equal(pull2.data.audit.length, 0)
  rmSync(tmp, { recursive: true, force: true })
})
