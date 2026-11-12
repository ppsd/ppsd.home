// หน้าลงเวลาบน Cloudflare ↔ ERP: ERP ส่งรายชื่อ/รหัสตรวจ PIN ขึ้นไป แล้วดึงรายการลงเวลากลับมาบันทึก (ใช้ "Cloudflare ปลอม" ในเครื่อง)
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHmac } from 'node:crypto'
import { createRequire } from 'node:module'

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const Database = createRequire(join(root, 'package.json'))('better-sqlite3')
const PORT = 3293, CLOUD = 3294, BASE = `http://localhost:${PORT}/api`
let child, tmp, dbFile, token, cloud
const got = [] // ทุกครั้งที่ ERP ซิงก์มา
let queue = [] // รายการที่ "Cloudflare" ยังไม่ส่งให้ ERP
const api = async (m, p, b) => { const r = await fetch(BASE + p, { method: m, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: b === undefined ? undefined : JSON.stringify(b) }); let d = null; try { d = await r.json() } catch {} return { status: r.status, data: d } }

before(async () => {
  cloud = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      if (req.headers.authorization !== 'Bearer tok-test') { res.writeHead(401); return res.end('{"error":"unauthorized"}') }
      const b = JSON.parse(body || '{}'); got.push(b)
      if (Array.isArray(b.ack)) queue = queue.filter((e) => !b.ack.includes(e.id))
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, events: queue }))
    })
  }).listen(CLOUD)
  tmp = mkdtempSync(join(tmpdir(), 'ppsd-cloudci-')); dbFile = join(tmp, 't.sqlite')
  child = spawn(process.execPath, [join(root, 'server', 'index.js')], { cwd: root, env: { ...process.env, PORT: String(PORT), PPSD_DB: dbFile, PPSD_NO_TUNNEL: '1' }, stdio: 'ignore' })
  for (let i = 0; i < 80 && !token; i++) { try { const r = await api('POST', '/login', { username: 'thawat', pin: '1234' }); token = r.data?.token } catch {} if (!token) await new Promise((r) => setTimeout(r, 300)) }
})
after(() => { child?.kill('SIGKILL'); cloud?.close(); try { rmSync(tmp, { recursive: true, force: true }) } catch {} })

test('ลงเวลาบน Cloudflare: ส่งรายชื่อ+รหัสตรวจ PIN ขึ้นไป · ดึงเข้างาน/ออกงาน/เช็คอินหน้างานกลับมา · ไม่บันทึกซ้ำ · คนลาออกไม่ถูกส่ง', async () => {
  assert.ok(token, 'เซิร์ฟเวอร์ทดสอบต้องเปิดได้')
  const e = (await api('POST', '/employees', { name: 'ช่างออนไลน์', role: 'ช่าง', pay_type: 'รายวัน', base: 500 })).data
  const r2 = (await api('POST', '/employees', { name: 'คนลาออกแล้ว', role: 'ช่าง', pay_type: 'รายวัน', base: 500 })).data
  await api('PUT', `/employees/${r2.id}`, { status: 'ลาออก', resign_date: '2020-01-31' })
  assert.equal((await api('PUT', `/employees/${e.id}/pin`, { pin: '4321' })).status, 200)
  await api('POST', '/houses', { name: 'บ้านทดสอบออนไลน์', code: 'H-CLOUD' })
  // ยังไม่ตั้งลิงก์ → ไม่ซิงก์
  assert.equal((await api('GET', '/cloud-checkin')).data.configured, false)
  const db = new Database(dbFile)
  const set = (k, v) => db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, v)
  set('cloud_checkin_url', `http://localhost:${CLOUD}`); set('cloud_checkin_token', 'tok-test')
  let s = await api('POST', '/cloud-checkin/sync')
  assert.equal(s.status, 200); assert.equal(s.data.result.ok, true)
  const push = got.find((g) => Array.isArray(g.employees))
  const me = push.employees.find((x) => x.code === e.code)
  assert.ok(me && /^r:/.test(me.ref), 'ส่งรหัสอ้างอิง ไม่ใช่รหัสพนักงานเป็นตัวเลือก')
  const key = db.prepare("SELECT value FROM settings WHERE key='cloud_checkin_key'").get().value
  assert.equal(me.hash, createHmac('sha256', key).update(e.code + ':4321').digest('hex'), 'รหัสตรวจ PIN ต้องตรงกับ PIN ที่ตั้ง')
  assert.ok(!push.employees.some((x) => x.code === r2.code), 'คนลาออกต้องไม่ถูกส่งขึ้นไป')
  assert.ok(push.houses.some((h) => h.code === 'H-CLOUD'))
  assert.ok(!JSON.stringify(push).includes(db.prepare('SELECT pin FROM employees WHERE id=?').get(e.id).pin), 'ห้ามส่งรหัส PIN ของ ERP ขึ้นไป')
  // Cloudflare มีรายการรอ: เข้างาน 07:55 · เช็คอินหน้างาน · ออกงาน 17:10
  const d = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)
  queue = [
    { id: 1, type: 'punch', code: e.code, name: e.name, date: d, time: '07:55', kind: 'in', status: 'ปกติ', lat: 13.5, lng: 99.8, acc: 10 },
    { id: 2, type: 'site', code: e.code, name: e.name, date: d, time: '09:30', kind: 'site', lat: 13.6, lng: 99.9, acc: 8, house: 'H-CLOUD', note: 'ตรวจหลังคา' },
    { id: 3, type: 'punch', code: e.code, name: e.name, date: d, time: '17:10', kind: 'out', status: 'ปกติ', lat: 13.5, lng: 99.8, acc: 10 },
  ]
  s = await api('POST', '/cloud-checkin/sync')
  assert.equal(s.data.result.applied, 3)
  assert.equal(queue.length, 0, 'ERP ต้องยืนยันรับ (ack) ครบ')
  let att = db.prepare('SELECT * FROM attendance WHERE emp_code=? AND date=?').all(e.code, d)
  assert.equal(att.length, 1); assert.equal(att[0].check_in, '07:55'); assert.equal(att[0].check_out, '17:10')
  assert.ok(db.prepare("SELECT 1 FROM location_log WHERE emp_code=? AND kind='site' AND house_code='H-CLOUD'").get(e.code), 'เช็คอินหน้างานต้องเข้า ERP')
  // ส่งรายการเดิมซ้ำ → ไม่บันทึกซ้ำ
  queue = [{ id: 1, type: 'punch', code: e.code, name: e.name, date: d, time: '07:55', kind: 'in', status: 'ปกติ', lat: 13.5, lng: 99.8 }]
  s = await api('POST', '/cloud-checkin/sync')
  assert.equal(s.data.result.applied, 0)
  assert.equal(db.prepare("SELECT COUNT(*) c FROM location_log WHERE emp_code=? AND note LIKE 'เข้างาน%'").get(e.code).c, 1)
  // รีเซ็ต PIN ทางอื่น (ไม่รู้ PIN ใหม่) → รหัสตรวจเดิมใช้ไม่ได้ (ไม่ส่งขึ้นไป)
  db.prepare("UPDATE employees SET pin='0000000000000000000000000000000000000000000000000000000000000000' WHERE id=?").run(e.id)
  got.length = 0
  await api('POST', '/cloud-checkin/sync')
  assert.equal(got.find((g) => Array.isArray(g.employees)).employees.find((x) => x.code === e.code).hash, null)
  db.close()
  // หน้าตั้งค่าเฉพาะแอดมิน
  const info = (await api('GET', '/cloud-checkin')).data
  assert.equal(info.configured, true); assert.ok(info.not_ready.includes('ช่างออนไลน์'))
})
