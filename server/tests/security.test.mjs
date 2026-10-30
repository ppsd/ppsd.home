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
  assert.deepEqual(readdirSync(join(tmp, 'backups')).filter((f) => /-wal$|-shm$|\.tmp$/.test(f)), [], 'ไม่มีไฟล์ชั่วคราว/ไฟล์ข้างค้างในโฟลเดอร์สำรอง')
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

test('ดูข้อมูลในไฟล์สำรอง: เทียบกับตอนนี้ (ถูกลบ/ถูกแก้) · ไม่ทับข้อมูลปัจจุบัน · กู้คืนเฉพาะรายการที่ถูกลบ · เอกสารการเงินดูได้อย่างเดียว · ไม่ส่ง PIN', async () => {
  // ข้อมูลก่อนสำรอง: บ้าน + งวด + ไฟล์แนบ
  assert.equal((await api('POST', '/houses', { code: 'H-BV', name: 'บ้านดูไฟล์สำรอง' })).status, 201)
  const inst = await api('POST', '/houses/H-BV/installments', { no: 1, detail: 'งวดที่จะลบ', amount: 5000, side: 'customer' })
  assert.ok(inst.data?.id || inst.status < 300, JSON.stringify(inst.data))
  const instId = (await api('GET', '/installments')).data.find((i) => i.house_code === 'H-BV').id
  const file = await (await fetch(`${BASE}/files?name=${encodeURIComponent('สัญญา.pdf')}&mime=application/pdf&house=H-BV`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' }, body: Buffer.from('%PDF-1.4 สัญญา') })).json()
  assert.equal((await api('PUT', '/backup-mirror', { dir: join(tmp, 'mirror') })).status, 200)
  const run = await api('POST', '/backup-mirror/run')
  assert.equal(run.status, 200, JSON.stringify(run.data))
  const name = (await api('GET', '/backups')).data[0].name
  // หลังสำรอง: ลบงวด + ลบไฟล์ + แก้ชื่อบ้าน
  const house = (await api('GET', '/houses')).data.find((h) => h.code === 'H-BV')
  assert.equal((await api('PUT', '/houses/' + house.id, { name: 'บ้านดูไฟล์สำรอง (แก้แล้ว)' })).status, 200)
  assert.equal((await api('DELETE', '/installments/' + instId)).status, 200)
  assert.equal((await api('DELETE', '/files/' + file.id)).status, 200)
  const base = '/backups/' + encodeURIComponent(name)
  const tables = (await api('GET', base + '/browse')).data.tables
  assert.ok(tables.some((t) => t.key === 'installments' && t.restore) && tables.some((t) => t.key === 'payments' && !t.restore))
  assert.equal(tables.some((t) => t.key === 'settings' || t.key === 'users'), false, 'ตารางตั้งค่า/ผู้ใช้ (มีกุญแจ/PIN) ต้องไม่เปิดให้ดู')
  // งวดที่ลบ → สถานะ deleted · บ้านที่แก้ชื่อ → changed (ช่อง name)
  const del = (await api('GET', `${base}/browse/installments?status=deleted`)).data
  assert.ok(del.rows.some((r) => r.id === instId), JSON.stringify(del))
  const hv = (await api('GET', `${base}/browse/houses?q=H-BV`)).data.rows[0]
  assert.equal(hv._status, 'changed')
  const hd = (await api('GET', `${base}/browse/houses/${hv.id}`)).data
  assert.ok(hd.changed.includes('name')); assert.equal(hd.backup.name, 'บ้านดูไฟล์สำรอง'); assert.equal(hd.current.name, 'บ้านดูไฟล์สำรอง (แก้แล้ว)')
  // แค่เปิดดู → ข้อมูลปัจจุบันไม่เปลี่ยน
  assert.equal((await api('GET', '/houses')).data.find((h) => h.code === 'H-BV').name, 'บ้านดูไฟล์สำรอง (แก้แล้ว)')
  assert.equal((await api('POST', `${base}/browse/houses/${hv.id}/restore`)).status, 409, 'รายการที่ยังอยู่ ห้ามทับ')
  // กู้งวดที่ถูกลบ → กลับมา · กู้ซ้ำไม่ได้
  const rs = await api('POST', `${base}/browse/installments/${instId}/restore`)
  assert.equal(rs.status, 200, JSON.stringify(rs.data))
  assert.ok((await api('GET', '/installments')).data.some((i) => i.id === instId && i.detail === 'งวดที่จะลบ'))
  assert.equal((await api('POST', `${base}/browse/installments/${instId}/restore`)).status, 409)
  // กู้ไฟล์ → ตัวไฟล์กลับมาเปิดได้ · ดาวน์โหลดจากชุดสำรองได้ด้วยชื่อจริง
  const dl = await fetch(`${BASE}${base}/file/${file.id}`, { headers: { Authorization: 'Bearer ' + token } })
  assert.equal(dl.status, 200); assert.match(decodeURIComponent(dl.headers.get('content-disposition')), /สัญญา\.pdf/)
  assert.equal((await api('POST', `${base}/browse/files/${file.id}/restore`)).status, 200)
  const view = await fetch(`${BASE}/files/${file.id}/view`, { headers: { Authorization: 'Bearer ' + token } })
  assert.equal(view.status, 200); assert.equal(Buffer.from(await view.arrayBuffer()).toString(), '%PDF-1.4 สัญญา')
  // เอกสารการเงินกู้ทีละรายการไม่ได้ · ตารางที่ไม่อนุญาต 400 · ไม่ส่ง PIN ออกมา
  assert.equal((await api('POST', `${base}/browse/payments/1/restore`)).status, 400)
  assert.equal((await api('GET', `${base}/browse/settings`)).status, 400)
  const emp = (await api('GET', `${base}/browse/employees`)).data.rows[0]
  const empD = (await api('GET', `${base}/browse/employees/${emp.id}`)).data
  assert.equal('pin' in empD.backup, false); assert.equal('track_token' in empD.backup, false)
  assert.equal((await api('GET', '/backups/evil.sqlite/browse')).status, 400)
})
