// ชุดทดสอบความปลอดภัย/สำรองข้อมูล — กันเดา PIN ตาม IP · รายชื่อ kiosk จากนอกออฟฟิศ · ไฟล์แนบอันตราย · ดิสก์ · log · สำรอง/กู้คืน
// เปิดเซิร์ฟเวอร์บนฐานข้อมูลชั่วคราว · "คำขอจากนอกออฟฟิศ" จำลองด้วย header cf-connecting-ip (แบบที่ cloudflared ส่งมา)
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 3311
const BASE = `http://localhost:${PORT}/api`
const serverDir = dirname(dirname(fileURLToPath(import.meta.url)))
let child, tmp, token

async function api(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try { data = await res.json() } catch { /* ไม่ใช่ JSON */ }
  return { status: res.status, data, res }
}
const ext = (ip) => ({ 'cf-connecting-ip': ip }) // คำขอผ่านลิงก์สาธารณะ

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'ppsd-sec-'))
  child = spawn(process.execPath, [join(serverDir, 'index.js')], {
    env: { ...process.env, PORT: String(PORT), PPSD_DB: join(tmp, 'test.sqlite'), PPSD_NO_TUNNEL: '1' },
    stdio: process.env.PPSD_TEST_STDIO ? 'inherit' : 'ignore',
  })
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'thawat', pin: '1234' }) })
      const d = await r.json()
      if (r.status === 200 && d?.token) { token = d.token; break }
    } catch { /* ยังไม่ขึ้น */ }
    await new Promise((r) => setTimeout(r, 400))
  }
  if (!token) throw new Error('เซิร์ฟเวอร์ทดสอบไม่ขึ้น')
  // เปิด "ERP ผ่านลิงก์สาธารณะ" ไว้ เพื่อทดสอบคำขอจากนอกออฟฟิศ
  assert.equal((await api('PUT', '/tunnel', { expose: true })).status, 200)
})
after(() => {
  try { child?.kill('SIGKILL') } catch { /* ignore */ }
  try { rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
})

test('กันเดา PIN ตาม IP: จากนอกออฟฟิศผิด 10 ครั้ง → IP ถูกล็อก (แม้เดาคนละบัญชี) · IP อื่นยังเข้าได้', async () => {
  const saved = token; token = null
  for (let i = 0; i < 10; i++) {
    const r = await api('POST', '/login', { username: 'user' + i, pin: '0000' }, ext('203.0.113.7'))
    assert.equal(r.status, 401, `ครั้งที่ ${i + 1}`)
  }
  const locked = await api('POST', '/login', { username: 'thawat', pin: '1234' }, ext('203.0.113.7'))
  assert.equal(locked.status, 429, 'ถึงจะใส่ PIN ถูกก็ต้องถูกล็อกจาก IP นี้'); assert.match(locked.data.error, /เครื่องนี้/)
  const other = await api('POST', '/login', { username: 'thawat', pin: '1234' }, ext('198.51.100.9'))
  assert.equal(other.status, 200, 'IP อื่นไม่โดนลูกหลง')
  token = saved
})

test('kiosk จากนอกออฟฟิศโดยไม่ล็อกอิน: ไม่เห็นรหัสพนักงานจริง แต่ลงเวลาด้วยรหัสอ้างอิงได้', async () => {
  const e = await api('POST', '/employees', { name: 'ช่างลงเวลานอก', role: 'ช่าง', base: 12000, pin: '7272' })
  assert.equal(e.status, 201, JSON.stringify(e.data))
  const saved = token; token = null
  const outside = (await api('GET', '/kiosk/employees', undefined, ext('198.51.100.20'))).data
  const me = outside.find((x) => x.name === 'ช่างลงเวลานอก')
  assert.ok(me, 'ต้องยังเห็นชื่อให้เลือก')
  assert.match(me.code, /^r:[0-9a-f]{20}$/); assert.equal(outside.some((x) => !String(x.code).startsWith('r:')), false, 'ต้องไม่มีรหัสจริงหลุด')
  const inOffice = (await api('GET', '/kiosk/employees')).data
  assert.equal(inOffice.find((x) => x.name === 'ช่างลงเวลานอก').code, e.data.code, 'ในออฟฟิศยังเห็นรหัสจริง')
  const punch = await api('POST', '/kiosk/punch', { emp_code: me.code, pin: '7272', kind: 'in' }, ext('198.51.100.20'))
  assert.equal(punch.status, 200, JSON.stringify(punch.data))
  assert.equal((await api('POST', '/kiosk/punch', { emp_code: 'r:00000000000000000000', pin: '7272', kind: 'in' }, ext('198.51.100.20'))).status, 404)
  token = saved
  // ล็อกอินแล้ว (หน้า kiosk ในระบบ) เปิดจากนอกก็เห็นรหัสจริง
  assert.equal((await api('GET', '/kiosk/employees', undefined, ext('198.51.100.20'))).data.find((x) => x.name === 'ช่างลงเวลานอก').code, e.data.code)
})

test('ไฟล์แนบ: html/svg ถูกบังคับดาวน์โหลด (ไม่รันในเบราว์เซอร์) · PDF/รูปยังเปิดดูได้', async () => {
  const up = async (name, mime, body) => (await (await fetch(`${BASE}/files?name=${encodeURIComponent(name)}&mime=${encodeURIComponent(mime)}&house=H-SEC`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' }, body: Buffer.from(body) })).json())
  const view = (id) => fetch(`${BASE}/files/${id}/view`, { headers: { Authorization: 'Bearer ' + token } })
  for (const [name, mime] of [['evil.html', 'text/html'], ['evil.svg', 'image/svg+xml']]) {
    const f = await up(name, mime, '<script>alert(1)</script>')
    const r = await view(f.id)
    assert.equal(r.headers.get('content-type'), 'application/octet-stream', name)
    assert.match(r.headers.get('content-disposition'), /^attachment/, name)
    assert.match(r.headers.get('content-security-policy') || '', /sandbox/, name)
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
  }
  const pdf = await view((await up('ok.pdf', 'application/pdf', '%PDF-1.4')).id)
  assert.equal(pdf.headers.get('content-type'), 'application/pdf'); assert.match(pdf.headers.get('content-disposition'), /^inline/)
})

test('สุขภาพระบบแสดงพื้นที่ดิสก์ · มี log ไฟล์ของเซิร์ฟเวอร์และ access log', async () => {
  const h = await api('GET', '/health')
  assert.equal(h.status, 200)
  assert.ok(h.data.disk && h.data.disk.free_gb > 0 && h.data.disk.total_gb > 0, JSON.stringify(h.data.disk))
  await api('POST', '/login', { username: 'nobody', pin: '9999' }) // คำขอผิด → ต้องลง access log
  await new Promise((r) => setTimeout(r, 200))
  const dir = join(tmp, 'logs') // ชุดทดสอบเขียน log ข้างฐานข้อมูลทดสอบ
  const files = readdirSync(dir)
  assert.ok(files.some((f) => /^server-\d{4}-\d{2}-\d{2}\.log$/.test(f)), 'ต้องมี log ของเซิร์ฟเวอร์')
  const access = files.filter((f) => /^access-\d{4}-\d{2}-\d{2}\.log$/.test(f)).sort().pop()
  assert.ok(access, 'ต้องมี access log')
  assert.match(readFileSync(join(dir, access), 'utf8'), /401 POST \/login/)
})

test('สำรองข้อมูล: ไฟล์สำรองอัตโนมัติผ่านการตรวจ · กู้คืนจากไฟล์ binary ได้ · ไฟล์เสียถูกปฏิเสธโดยข้อมูลเดิมไม่หาย', async () => {
  const m = await api('GET', '/backup-mirror')
  assert.equal(m.status, 200)
  assert.equal(m.data.last?.ok, true, JSON.stringify(m.data.last)); assert.equal(m.data.last?.check, 'ok')
  const list = (await api('GET', '/backups')).data
  assert.ok(list.length >= 1 && list.every((b) => b.name.endsWith('.sqlite')))
  // ดาวน์โหลดไฟล์สำรอง → เพิ่มบ้าน → กู้คืนจากไฟล์ (ส่ง binary) → บ้านที่เพิ่งเพิ่มต้องหายไป
  const bak = Buffer.from(await (await fetch(BASE + '/backup', { headers: { Authorization: 'Bearer ' + token } })).arrayBuffer())
  assert.ok(bak.length > 10000)
  assert.equal((await api('POST', '/houses', { code: 'H-AFTER-BAK', name: 'บ้านหลังสำรอง' })).status, 201)
  const bad = await fetch(BASE + '/restore', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' }, body: Buffer.from('ไม่ใช่ฐานข้อมูล'.repeat(100)) })
  assert.equal(bad.status, 400)
  assert.ok((await api('GET', '/houses')).data.some((h) => h.code === 'H-AFTER-BAK'), 'ไฟล์เสีย → ข้อมูลเดิมต้องอยู่ครบ')
  const ok = await fetch(BASE + '/restore', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' }, body: bak })
  assert.equal(ok.status, 200, await ok.text())
  assert.equal((await api('GET', '/houses')).data.some((h) => h.code === 'H-AFTER-BAK'), false, 'กู้คืนแล้วต้องกลับไปเหมือนตอนสำรอง')
  assert.ok(readdirSync(join(tmp, 'backups')).includes('ppsd-before-restore.sqlite'), 'ต้องสำรองข้อมูลก่อนกู้คืนไว้ให้')
})
