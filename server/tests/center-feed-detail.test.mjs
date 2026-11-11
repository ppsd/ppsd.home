// กดรายการในหน้าความเคลื่อนไหวบ้าน → รายละเอียดเรื่อง + รูปแนบ + สิทธิ์ตามหน้าต้นทาง
// เปิดเซิร์ฟเวอร์บนฐานข้อมูลชั่วคราว (ไม่แตะ server/data)
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 3312
const ROOT = `http://localhost:${PORT}/api`
const serverDir = dirname(dirname(fileURLToPath(import.meta.url)))
let child, tmp, admin, site, viewer, noProc

// รูป PNG 1×1 จุด
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const PNG_URL = 'data:image/png;base64,' + PNG_B64
const PNG = Buffer.from(PNG_B64, 'base64')

async function call(tok, method, path, body) {
  const res = await fetch(ROOT + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try { data = await res.json() } catch { /* ไม่ใช่ JSON */ }
  return { status: res.status, data }
}
const bytes = async (tok, path) => {
  const res = await fetch(ROOT + path, { headers: tok ? { Authorization: 'Bearer ' + tok } : {} })
  return { status: res.status, type: res.headers.get('content-type'), body: Buffer.from(await res.arrayBuffer()) }
}
const A = (m, p, b) => call(admin, m, p, b)
const login = async (username, pin) => (await call(null, 'POST', '/login', { username, pin })).data?.token
async function addUser(name, username, role, extra = {}) {
  const u = await A('POST', '/users', { system_only: true, name, username, pin: '5678', role, position: 'พนักงาน' })
  assert.ok(u.status < 300, JSON.stringify(u.data))
  if (extra.deny_mods) assert.equal((await A('PUT', '/users/' + u.data.id, { deny_mods: extra.deny_mods })).status, 200)
  const t = await login(username, '5678')
  assert.ok(t, 'ล็อกอินไม่ได้ ' + username)
  return t
}

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'ppsd-feeddetail-'))
  child = spawn(process.execPath, [join(serverDir, 'index.js')], {
    env: { ...process.env, PORT: String(PORT), PPSD_DB: join(tmp, 'test.sqlite'), PPSD_NO_TUNNEL: '1' },
    stdio: process.env.PPSD_TEST_STDIO ? 'inherit' : 'ignore',
  })
  for (let i = 0; i < 60; i++) {
    try { admin = await login('thawat', '1234'); if (admin) break } catch { /* ยังไม่ขึ้น */ }
    await new Promise((r) => setTimeout(r, 400))
  }
  if (!admin) throw new Error('เซิร์ฟเวอร์ทดสอบไม่ขึ้น')
  site = await addUser('สมชาย หน้างาน', 'somchai', 'site')
  viewer = await addUser('วิภา ดูอย่างเดียว', 'wipa', 'viewer')
  noProc = await addUser('ปิติ ไม่เห็นจัดซื้อ', 'piti', 'site', { deny_mods: ['procurement'] })
  assert.equal((await A('POST', '/houses', { code: H, name: 'บ้านทดสอบกดดูเรื่อง', customer: 'คุณทดสอบ', value: 1000000 })).status, 201)
})
after(() => {
  try { child?.kill('SIGKILL') } catch { /* ignore */ }
  try { rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
})

const H = 'FD-01'
let rfiNo
// หารายการในหน้าความเคลื่อนไหวจากข้อความ → คืนเรื่องและส่วนย่อย
async function find(tok, needle) {
  const f = await call(tok, 'GET', `/center/feed?house=${H}&limit=100`)
  assert.equal(f.status, 200)
  const it = f.data.items.find((e) => e.parts.some((p) => p.text.includes(needle)))
  assert.ok(it, 'ไม่เจอรายการ: ' + needle + ' ใน ' + f.data.items.flatMap((e) => e.parts.map((p) => p.text)).join(' | '))
  return { it, part: it.parts.find((p) => p.text.includes(needle)) }
}
const detailOf = async (tok, id, needle) => {
  const d = await call(tok, 'GET', `/center/feed/${id}/detail`)
  assert.equal(d.status, 200, JSON.stringify(d.data))
  return d.data.parts.find((p) => p.text.includes(needle))
}

test('รูปที่ฝังในเอกสารหน้างาน: เห็นจำนวนรูป เปิดรายละเอียด และดูรูปได้', async () => {
  const doc = await A('POST', '/site-docs', { kind: 'rfi', title: 'สอบถามแบบหลังคา', detail: 'รายละเอียดคำถาม', house_code: H, image: PNG_URL })
  assert.equal(doc.status, 201, JSON.stringify(doc.data))
  rfiNo = doc.data.no
  const { it, part } = await find(site, rfiNo)
  assert.equal(part.photos, 1)
  const p = await detailOf(site, it.id, rfiNo)
  assert.equal(p.exists, true)
  assert.equal(p.restricted, false)
  assert.deepEqual(p.target, { type: 'house', tab: 'sitedocs', label: 'เอกสารหน้างาน' })
  assert.ok(p.fields.some((f) => f.v === 'รายละเอียดคำถาม'))
  assert.equal(p.attachments.length, 1)
  assert.equal(p.attachments[0].image, true)
  const img = await bytes(site, `/center/feed/${p.hid}/file/0`)
  assert.equal(img.status, 200)
  assert.equal(img.type, 'image/png')
  assert.ok(img.body.equals(PNG))
  assert.equal((await bytes(null, `/center/feed/${p.hid}/file/0`)).status, 401, 'ไม่ล็อกอินต้องเปิดไม่ได้')
  assert.equal((await bytes(site, `/center/feed/${p.hid}/file/9`)).status, 404)
})

test('ไฟล์ที่อัปโหลดเข้าบ้าน: เปิดรูปจากรายการได้ และไฟล์ที่ไม่ใช่รูปเป็นไฟล์แนบ', async () => {
  const up = (name, mime, buf) => fetch(`${ROOT}/files?house=${H}&name=${encodeURIComponent(name)}&mime=${encodeURIComponent(mime)}`, { method: 'POST', headers: { Authorization: 'Bearer ' + admin, 'Content-Type': 'application/octet-stream' }, body: buf })
  assert.equal((await up('หน้างาน.png', 'image/png', PNG)).status, 201)
  const { it, part } = await find(site, 'หน้างาน.png')
  assert.equal(part.photos, 1)
  const p = await detailOf(site, it.id, 'หน้างาน.png')
  const img = await bytes(site, `/center/feed/${p.hid}/file/0`)
  assert.equal(img.status, 200)
  assert.ok(img.body.equals(PNG))
  await new Promise((r) => setTimeout(r, 1100)) // คนละวินาที จะได้ไม่รวมเป็นเรื่องเดียวกัน
  assert.equal((await up('สัญญา.pdf', 'application/pdf', Buffer.from('%PDF-1.4'))).status, 201)
  const pdf = await find(site, 'สัญญา.pdf')
  assert.equal(pdf.part.photos, 0)
  assert.equal(pdf.part.docs, 1)
})

test('รายการที่ถูกลบ: ยังเปิดเรื่องได้จากประวัติ แต่รูปหายแล้ว', async () => {
  const c = await A('POST', '/site-docs', { kind: 'ncr', title: 'งานจะถูกลบ', house_code: H, image: PNG_URL })
  assert.equal(c.status, 201, JSON.stringify(c.data))
  await new Promise((r) => setTimeout(r, 1100))
  assert.equal((await A('DELETE', '/site-docs/' + c.data.id)).status, 200)
  const f = await call(site, 'GET', `/center/feed?house=${H}&limit=100`)
  const del = f.data.items.find((e) => e.parts.some((p) => p.text.startsWith('ลบ') && p.text.includes(c.data.no)))
  assert.ok(del, 'ต้องมีเรื่องลบ')
  const p = await detailOf(site, del.id, c.data.no)
  assert.equal(p.exists, false)
  assert.equal(p.attachments.length, 0)
  assert.equal((await bytes(site, `/center/feed/${p.hid}/file/0`)).status, 404)
})

test('สิทธิ์ตามหน้าต้นทาง: ใบขอซื้อเปิดไม่ได้สำหรับคนดูอย่างเดียวและคนที่ถูกปิดโมดูลจัดซื้อ', async () => {
  const pr = await A('POST', '/purchase-requests', { house: 'บ้านทดสอบกดดูเรื่อง', house_code: H, item: 'ปูนทดสอบสิทธิ์', amount: 500, images: [PNG_URL] })
  assert.equal(pr.status, 201, JSON.stringify(pr.data))
  const needle = 'ใบขอซื้อ'
  const asSite = await find(site, needle)
  assert.equal(asSite.part.photos, 1, 'โฟร์แมนเปิดหน้าใบขอซื้อได้')
  const ok = await detailOf(site, asSite.it.id, needle)
  assert.equal(ok.restricted, false)
  assert.equal((await bytes(site, `/center/feed/${ok.hid}/file/0`)).status, 200)
  for (const [who, tok] of [['viewer', viewer], ['ปิดโมดูล', noProc]]) {
    const r = await find(tok, needle)
    assert.equal(r.part.photos, 0, who + ' ต้องไม่เห็นจำนวนรูป')
    const p = await detailOf(tok, r.it.id, needle)
    assert.equal(p.restricted, true, who)
    assert.deepEqual(p.fields, [], who)
    assert.deepEqual(p.attachments, [], who)
    assert.equal(p.target, null, who)
    assert.equal((await bytes(tok, `/center/feed/${ok.hid}/file/0`)).status, 403, who + ' เปิดรูปตรงๆ ต้องไม่ได้')
  }
})

test('ยอดเงินฝั่งช่างไม่ออกในช่องรายละเอียดของคนที่ไม่ใช่ผู้จัดการ', async () => {
  assert.equal((await A('POST', `/houses/${H}/installments`, { no: 9, detail: 'งวดจ่ายช่างทดสอบ', amount: 77000, side: 'contractor' })).status, 201)
  const { it } = await find(site, 'เพิ่มงวดงาน · งวด 9')
  const asSite = await detailOf(site, it.id, 'งวด 9')
  assert.ok(!asSite.fields.some((f) => f.v.includes('77,000')), JSON.stringify(asSite.fields))
  const asAdmin = await detailOf(admin, it.id, 'งวด 9')
  assert.ok(asAdmin.fields.some((f) => f.v.includes('77,000')), JSON.stringify(asAdmin.fields))
})

test('เรื่องที่แอดมินซ่อน: พนักงานเปิดรายละเอียดไม่ได้ · เลขที่ไม่ใช่รายการบ้านเปิดไม่ได้', async () => {
  const { it } = await find(site, rfiNo)
  assert.equal((await A('POST', '/center/feed/hide', { keys: [it.key] })).status, 200)
  assert.equal((await call(site, 'GET', `/center/feed/${it.id}/detail`)).status, 404)
  assert.equal((await A('GET', `/center/feed/${it.id}/detail`)).status, 200)
  assert.equal((await A('POST', '/center/feed/hide', { keys: [it.key], unhide: true })).status, 200)
  assert.equal((await call(site, 'GET', '/center/feed/99999999/detail')).status, 404)
})
