// เงินเดือนบน Cloudflare ขั้น 2: ERP ส่งข้อมูลขึ้น (เฉพาะที่เปลี่ยน · ไม่มี PIN/ลายเซ็น) แล้ว "Cloudflare ปลอม" คำนวณด้วยสูตรกลาง → เทียบกับ ERP ต้องตรงทุกคน
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const core = await import(pathToFileURL(join(root, 'server', 'payroll-core.js')).href)
const Database = createRequire(join(root, 'package.json'))('better-sqlite3')
const PORT = 3291, CLOUD = 3292, BASE = `http://localhost:${PORT}/api`
let child, tmp, dbFile, token, cloud
const ds = new Map() // ชื่อ → { sha, data } (เหมือนตาราง ds บน Cloudflare)
const posts = []
const OWNED = ['payroll_inputs', 'salary_advances', 'deductions', 'other_income', 'payroll_batches', 'payroll_runs']
let cloudMode = 'mirror'
const patches = []
const api = async (m, p, b) => { const r = await fetch(BASE + p, { method: m, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: b === undefined ? undefined : JSON.stringify(b) }); let d = null; try { d = await r.json() } catch {} return { status: r.status, data: d } }
// สำเนาของ payrollData() ใน cloudflare/ppsd-office/ (หน้า /payroll)functions/api/[[path]].js
function cloudData(period) {
  const g = (n) => ds.get(n)?.data ?? null
  const { from, to } = core.periodBounds(period)
  return {
    employees: g('employees') || [], attendance: g('att:' + period) || [], time_adjustments: g('time_adjustments') || [], leaves: g('leaves') || [],
    holidays: (g('holidays') || []).filter((h) => h.date >= from && h.date <= to), ot: g('ot') || [],
    payroll_inputs: (g('payroll_inputs') || []).filter((x) => x.period === period), salary_advances: (g('salary_advances') || []).filter((x) => x.period === period),
    deductions: (g('deductions') || []).filter((x) => x.period === period), other_income: (g('other_income') || []).filter((x) => x.period === period),
    runs: (g('payroll_runs') || []).map((r) => ({ period: r.period, rows: r.rows || [] })),
  }
}
before(async () => {
  cloud = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      if (req.headers.authorization !== 'Bearer pay-test') { res.writeHead(401); return res.end('{"error":"unauthorized"}') }
      const b = JSON.parse(body || '{}')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      if (req.url === '/api/payroll/sync') {
        posts.push(b)
        for (const x of b.datasets || []) { if (cloudMode === 'live' && OWNED.includes(x.name)) continue; if (x.data === null) ds.delete(x.name); else ds.set(x.name, { sha: x.sha, data: JSON.parse(JSON.stringify(x.data)) }) }
        return res.end(JSON.stringify({ ok: true, have: Object.fromEntries([...ds].map(([k, v]) => [k, v.sha])) }))
      }
      if (req.url === '/api/payroll/mode') { cloudMode = b.mode; return res.end(JSON.stringify({ ok: true, mode: cloudMode })) }
      if (req.url === '/api/payroll/pull') return res.end(JSON.stringify({ mode: cloudMode, datasets: OWNED.filter((n) => ds.has(n)).map((n) => ({ name: n, sha: ds.get(n).sha, data: ds.get(n).data })), patches: patches.filter((x) => !x.synced), audit: [] }))
      if (req.url === '/api/payroll/ack') { for (const x of patches) if ((b.patches || []).includes(x.id)) x.synced = 1; return res.end('{"ok":true}') }
      if (req.url === '/api/payroll/compare') return res.end(JSON.stringify({ period: b.period, rows: core.computePayroll(cloudData(b.period), b.period) }))
      res.end('{}')
    })
  }).listen(CLOUD)
  tmp = mkdtempSync(join(tmpdir(), 'ppsd-cloudpay-')); dbFile = join(tmp, 't.sqlite')
  child = spawn(process.execPath, [join(root, 'server', 'index.js')], { cwd: root, env: { ...process.env, PORT: String(PORT), PPSD_DB: dbFile, PPSD_NO_TUNNEL: '1' }, stdio: 'ignore' })
  for (let i = 0; i < 80 && !token; i++) { try { const r = await api('POST', '/login', { username: 'thawat', pin: '1234' }); token = r.data?.token } catch {} if (!token) await new Promise((r) => setTimeout(r, 300)) }
})
after(() => { child?.kill('SIGKILL'); cloud?.close(); try { rmSync(tmp, { recursive: true, force: true }) } catch {} })

test('เงินเดือนบน Cloudflare (ขั้น 2): ส่งข้อมูลขึ้น · ไม่มี PIN/ลายเซ็น · ส่งเฉพาะที่เปลี่ยน · คำนวณบน Cloudflare ตรงกับ ERP ทุกคน', async () => {
  assert.ok(token)
  const period = '2034-03'
  const m = (await api('POST', '/employees', { name: 'รายเดือนเทียบ', role: 'ช่าง', pay_type: 'รายเดือน', base: 18000, retention_opening: 1000 })).data
  const dly = (await api('POST', '/employees', { name: 'รายวันเทียบ', role: 'ช่าง', pay_type: 'รายวัน', base: 450 })).data
  await api('PUT', `/employees/${m.id}/pin`, { pin: '2468' })
  for (const day of ['2034-03-01', '2034-03-02', '2034-03-04', '2034-03-06']) await api('POST', '/attendance/manual', { emp_code: m.code, date: day, check_in: '08:30', check_out: '17:00' })
  for (const day of ['2034-03-01', '2034-03-02', '2034-03-03']) await api('POST', '/attendance/manual', { emp_code: dly.code, date: day, check_in: '08:00', check_out: '17:00' })
  await api('POST', '/salary-advances', { emp_code: m.code, amount: 3000, period })
  await api('POST', '/other-income', { emp_code: dly.code, amount: 500, reason: 'เบี้ยขยัน', period })
  await api('POST', '/deductions', { emp_code: m.code, amount: 200, reason: 'ของหาย', period })
  assert.equal((await api('GET', '/cloud-payroll')).data.configured, false)
  const db = new Database(dbFile)
  const set = (k, v) => db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, v)
  set('cloud_payroll_url', `http://localhost:${CLOUD}`); set('cloud_payroll_token', 'pay-test')
  const s1 = await api('POST', '/cloud-payroll/sync')
  assert.equal(s1.status, 200); assert.ok(s1.data.result.sent > 5)
  const emps = ds.get('employees').data
  assert.ok(emps.length >= 2 && emps.every((e) => !('pin' in e) && !('signature' in e) && !('track_token' in e)), 'ห้ามส่ง PIN/ลายเซ็น/โทเคน')
  assert.ok(ds.has('att:2034-03'))
  // ไม่มีอะไรเปลี่ยน → ไม่ส่งซ้ำ
  const s2 = await api('POST', '/cloud-payroll/sync')
  assert.equal(s2.data.result.sent, 0)
  // เทียบตัวเลข
  let c = await api('GET', '/cloud-payroll/compare?period=' + period)
  assert.equal(c.status, 200)
  assert.ok(c.data.people >= 2)
  assert.deepEqual(c.data.diffs, [], 'Cloudflare ต้องคำนวณได้ตรงกับ ERP ทุกคนทุกช่อง')
  // แก้ข้อมูลใน ERP → ส่งเฉพาะชุดที่เปลี่ยน แล้วยังตรงกัน
  await api('POST', '/salary-advances', { emp_code: dly.code, amount: 400, period })
  const s3 = await api('POST', '/cloud-payroll/sync')
  assert.equal(s3.data.result.sent, 1, 'ส่งแค่ชุดเบิกล่วงหน้า')
  c = await api('GET', '/cloud-payroll/compare?period=' + period)
  assert.deepEqual(c.data.diffs, [])
  db.close()
  // เฉพาะแอดมิน
  await api('POST', '/users', { name: 'บัญชีเทียบ', username: 'acccp', pin: '7272', role: 'accounting' })
  const t0 = token
  token = (await api('POST', '/login', { username: 'acccp', pin: '7272' })).data.token
  assert.equal((await api('GET', '/cloud-payroll/compare?period=' + period)).status, 403)
  token = t0
})

test('เงินเดือนบน Cloudflare (เปิดใช้จริง): ERP ดูอย่างเดียว · ผลทำจ่ายบน Cloudflare เข้ามาลงตาราง+ลงบัญชี · แก้ภาษีบน Cloudflare เข้าทะเบียน · เปิดแก้ไข = ถอน · ย้อนกลับมาทำใน ERP ได้', async () => {
  const period = '2034-06'
  const e = (await api('POST', '/employees', { name: 'ทำจ่ายออนไลน์', role: 'ช่าง', pay_type: 'รายเดือน', base: 12000 })).data
  assert.equal((await api('POST', '/cloud-payroll/sync')).status, 200)
  const sw = await api('POST', '/cloud-payroll/mode', { mode: 'live' })
  assert.equal(sw.status, 200); assert.equal(sw.data.mode, 'live'); assert.equal(cloudMode, 'live')
  // ERP ดูอย่างเดียว
  assert.equal((await api('POST', '/salary-advances', { emp_code: e.code, amount: 100, period })).status, 409)
  assert.equal((await api('PUT', '/payroll/inputs', { period, emp_code: e.code, work_days: 10 })).status, 409)
  assert.equal((await api('POST', '/payroll/batches', { period, emp_codes: [e.code] })).status, 409)
  assert.equal((await api('GET', '/payroll?period=' + period)).data.cloud_live, true)
  // Cloudflare ทำจ่าย (คำนวณด้วยสูตรกลางจากข้อมูลที่ ERP ส่งขึ้นไป) + แก้ภาษี
  const rows = core.computePayroll(cloudData(period), period).filter((r) => r.code === e.code)
  assert.equal(rows.length, 1)
  const batch = { id: 900, period, seq: 1, no: 'PAY-203406-1', pay_date: '2034-06-30', note: 'จ่ายออนไลน์', status: 'closed', emp_codes: [e.code], data: rows, total: core.netOf(rows[0]), journal_sid: 20340601, created: '30 มิ.ย. 77', by: 'บัญชี', closed_at: '30 มิ.ย. 77', closed_by: 'บัญชี' }
  ds.set('payroll_batches', { sha: 'b1', data: [...(ds.get('payroll_batches')?.data || []), batch] })
  patches.push({ id: 1, emp_code: e.code, field: 'tax', value: 150, synced: 0 })
  const s1 = await api('POST', '/cloud-payroll/sync')
  assert.equal(s1.status, 200); assert.ok(s1.data.result.pulled.changed >= 2)
  let p = (await api('GET', '/payroll?period=' + period)).data
  const r = p.rows.find((x) => x.code === e.code)
  assert.equal(r.paid, true); assert.equal(r.batch_no, 'PAY-203406-1')
  assert.equal((await api('GET', '/employees')).data.find((x) => x.code === e.code).tax, 150, 'แก้ภาษีบน Cloudflare ต้องเข้าทะเบียน ERP')
  assert.equal(patches[0].synced, 1, 'ยืนยันรับแล้ว')
  const db = new Database(dbFile)
  assert.ok(db.prepare('SELECT 1 FROM payroll_runs WHERE period=?').get(period), 'สรุปงวดต้องสร้างใหม่')
  assert.ok(db.prepare("SELECT 1 FROM journal_entries WHERE source='payroll' AND source_id='20340601'").get(), 'ต้องลงบัญชีให้เอง')
  // Cloudflare เปิดแก้ไขรอบ → ERP ถอนบัญชี + กลับเป็นยังไม่จ่าย
  ds.set('payroll_batches', { sha: 'b2', data: ds.get('payroll_batches').data.map((b) => (b.id === 900 ? { ...b, status: 'reopened' } : b)) })
  await api('POST', '/cloud-payroll/sync')
  p = (await api('GET', '/payroll?period=' + period)).data
  assert.equal(p.rows.find((x) => x.code === e.code).paid, false)
  assert.ok(!db.prepare("SELECT 1 FROM journal_entries WHERE source='payroll' AND source_id='20340601'").get(), 'ต้องถอนบัญชี')
  db.close()
  // กลับมาทำใน ERP
  const back = await api('POST', '/cloud-payroll/mode', { mode: 'mirror' })
  assert.equal(back.data.mode, 'mirror'); assert.equal(cloudMode, 'mirror')
  assert.equal((await api('POST', '/salary-advances', { emp_code: e.code, amount: 100, period })).status, 201, 'ทำใน ERP ได้อีกครั้ง')
})
