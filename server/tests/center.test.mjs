// ศูนย์กลางงานบ้าน: คิวรออนุมัติ (เพิ่ม-ลดงาน/แก้ยอดเงิน) + ความเคลื่อนไหวบ้าน + ส่งอัปเดตลูกค้า
// เปิดเซิร์ฟเวอร์บนฐานข้อมูลชั่วคราว (ไม่แตะ server/data)
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 3297
const BASE = `http://localhost:${PORT}/api`
const serverDir = dirname(dirname(fileURLToPath(import.meta.url)))
let child, tmp, admin, site

async function api(tok, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try { data = await res.json() } catch { /* ไม่ใช่ JSON */ }
  return { status: res.status, data, pending: res.headers.get('x-ppsd-pending') }
}
const A = (m, p, b) => api(admin, m, p, b)
const S = (m, p, b) => api(site, m, p, b)

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'ppsd-center-'))
  child = spawn(process.execPath, [join(serverDir, 'index.js')], {
    env: { ...process.env, PORT: String(PORT), PPSD_DB: join(tmp, 'test.sqlite'), PPSD_NO_TUNNEL: '1' },
    stdio: process.env.PPSD_TEST_STDIO ? 'inherit' : 'ignore',
  })
  for (let i = 0; i < 60; i++) {
    try {
      const r = await api(null, 'POST', '/login', { username: 'thawat', pin: '1234' })
      if (r.status === 200 && r.data?.token) { admin = r.data.token; break }
    } catch { /* ยังไม่ขึ้น */ }
    await new Promise((r) => setTimeout(r, 400))
  }
  if (!admin) throw new Error('เซิร์ฟเวอร์ทดสอบไม่ขึ้น')
  const u = await A('POST', '/users', { system_only: true, name: 'สมชาย หน้างาน', username: 'somchai', pin: '5678', role: 'site', position: 'โฟร์แมน' })
  assert.ok(u.status < 300, JSON.stringify(u.data))
  const l = await api(null, 'POST', '/login', { username: 'somchai', pin: '5678' })
  site = l.data?.token
  assert.ok(site, 'ล็อกอินพนักงานหน้างานไม่ได้ ' + JSON.stringify(l.data))
})
after(() => {
  try { child?.kill('SIGKILL') } catch { /* ignore */ }
  try { rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
})

const H = 'CT-01'
let inst, reqId

test('แอดมินทำได้ทันที (ไม่ต้องรออนุมัติ)', async () => {
  assert.equal((await A('POST', '/houses', { code: H, name: 'บ้านทดสอบศูนย์กลาง', customer: 'คุณสมใจ', value: 1000000 })).status, 201)
  const r = await A('POST', `/houses/${H}/installments`, { no: 1, detail: 'มัดจำ', amount: 100000, side: 'customer' })
  assert.equal(r.status, 201)
  assert.equal(r.pending, null)
  inst = r.data
})

test('พนักงานหน้างานเพิ่มงวด → เข้าคิวรออนุมัติ ยังไม่มีผลจริง', async () => {
  const r = await S('POST', `/houses/${H}/installments`, { no: 2, detail: 'งานเพิ่ม โรงจอดรถ', amount: 45000, side: 'customer' })
  assert.equal(r.status, 202, JSON.stringify(r.data))
  assert.ok(r.data.pending && r.data.request_id)
  assert.ok(decodeURIComponent(r.pending).includes('รออนุมัติ') || decodeURIComponent(r.pending).includes('อนุมัติ'))
  reqId = r.data.request_id
  const list = (await A('GET', '/installments')).data.filter((i) => i.house_code === H)
  assert.equal(list.length, 1, 'ต้องยังไม่มีงวดที่ 2')
  const q = await A('GET', '/approvals')
  assert.ok(q.data.some((x) => x.id === reqId && x.status === 'รออนุมัติ'))
  // พนักงานเห็นเฉพาะคำขอของตัวเอง · อนุมัติเองไม่ได้
  assert.equal((await S('POST', `/approvals/${reqId}/approve`)).status, 403)
})

test('แอดมินอนุมัติ → งวดถูกเพิ่มจริงในนามผู้ขอ', async () => {
  const r = await A('POST', `/approvals/${reqId}/approve`, {})
  assert.equal(r.status, 200, JSON.stringify(r.data))
  const list = (await A('GET', '/installments')).data.filter((i) => i.house_code === H)
  assert.equal(list.length, 2)
  assert.ok(list.some((i) => i.amount === 45000))
  assert.equal((await A('POST', `/approvals/${reqId}/approve`)).status, 409, 'อนุมัติซ้ำไม่ได้')
})

test('แก้ยอดงวด: ส่วนอื่นบันทึกเลย ยอดเงินรออนุมัติ · ตีกลับต้องมีเหตุผล', async () => {
  const r = await S('PUT', `/installments/${inst.id}`, { detail: 'มัดจำ (แก้ชื่อ)', amount: 90000 })
  assert.equal(r.status, 200)
  assert.ok(r.pending)
  const cur = (await A('GET', '/installments')).data.find((i) => i.id === inst.id)
  assert.equal(cur.detail, 'มัดจำ (แก้ชื่อ)')
  assert.equal(cur.amount, 100000, 'ยอดต้องยังไม่เปลี่ยน')
  const q = (await A('GET', '/approvals')).data.find((x) => x.status === 'รออนุมัติ')
  assert.equal((await A('POST', `/approvals/${q.id}/reject`, {})).status, 400)
  assert.equal((await A('POST', `/approvals/${q.id}/reject`, { note: 'ยังไม่ได้คุยกับลูกค้า' })).status, 200)
  assert.equal((await A('GET', '/installments')).data.find((i) => i.id === inst.id).amount, 100000)
})

test('แก้ข้อมูลบ้านที่ไม่ใช่เงิน → ไม่ต้องรอ', async () => {
  const h = (await A('GET', '/houses')).data.find((x) => x.code === H)
  const r = await S('PUT', `/houses/${h.id}`, { manager: 'คุณวิชัย' })
  assert.equal(r.status, 200)
  assert.equal(r.pending, null)
})

test('ปิดเรื่อง "เพิ่มงวด" ในตั้งค่า → พนักงานเพิ่มได้ทันที', async () => {
  assert.equal((await S('PUT', '/approvals/gates', { inst_add: false })).status, 403)
  assert.equal((await A('PUT', '/approvals/gates', { inst_add: false })).status, 200)
  const r = await S('POST', `/houses/${H}/installments`, { no: 3, detail: 'งวด 3', amount: 1000, side: 'customer' })
  assert.equal(r.status, 201)
  await A('PUT', '/approvals/gates', { inst_add: true })
})

test('ความเคลื่อนไหวบ้าน: เห็นทุกคน · มีเรื่องอนุมัติ/ตีกลับ · ตัวนับยังไม่ได้ดู', async () => {
  const f = await S('GET', `/center/feed?house=${H}`)
  assert.equal(f.status, 200)
  const texts = f.data.items.flatMap((e) => e.parts.map((p) => p.text))
  assert.ok(texts.some((t) => t.includes('ส่งขออนุมัติ')), texts.join(' | '))
  assert.ok(texts.some((t) => t.includes('ตีกลับ')))
  assert.ok(texts.some((t) => t.includes('งวดงาน')))
  assert.ok(f.data.items.every((e) => e.house_code === H))
  const money = await S('GET', `/center/feed?house=${H}&flag=1`)
  assert.ok(money.data.items.length > 0 && money.data.items.every((e) => e.flag))
  const u1 = await A('GET', '/center/unread')
  assert.equal(u1.status, 200)
  await S('POST', `/houses/${H}/installments`, { no: 4, detail: 'งวด 4', amount: 2000, side: 'customer' }) // คนอื่นทำ → แอดมินเห็นเพิ่ม
  const u2 = await A('GET', '/center/unread')
  assert.ok(u2.data.unread >= 1)
  assert.ok(u2.data.pending >= 1)
  await A('POST', '/center/seen', {})
  assert.equal((await A('GET', '/center/unread')).data.unread, 0)
})

test('ส่งอัปเดตลูกค้า: พนักงานหน้างานส่งไม่ได้ · ลูกค้ายังไม่ผูก LINE → บอกชัดเจน', async () => {
  assert.equal((await S('POST', `/center/customer/${H}/send`, { text: 'สวัสดีค่ะ' })).status, 403)
  const r = await A('POST', `/center/customer/${H}/send`, { text: 'วันนี้ฝนตก ทีมช่างขอเลื่อนเข้าหน้างานเป็นพรุ่งนี้ค่ะ' })
  assert.equal(r.status, 400)
  assert.ok(String(r.data.error).includes('LINE'))
  const g = await A('GET', `/center/customer/${H}`)
  assert.equal(g.status, 200)
  assert.equal(g.data.canSend, true)
})

test('แจ้งเตือนกลุ่ม LINE: ตั้งค่าได้เฉพาะแอดมิน · เปิดแล้วนับเฉพาะเรื่องใหม่ · ตัวอย่างข้อความตามประเภทที่เลือก', async () => {
  assert.equal((await S('GET', '/center/alerts')).status, 403)
  const g = await A('GET', '/center/alerts')
  assert.equal(g.status, 200)
  assert.equal(g.data.on, false)
  assert.ok(g.data.cat_labels.flag)
  const GID = 'C' + 'a'.repeat(32)
  assert.equal((await A('PUT', '/center/alerts', { on: true, targets: [GID, 'ไม่ใช่ไอดี'], cats: { flag: true, approval: true, site: false }, every: 2 })).status, 200)
  const g2 = (await A('GET', '/center/alerts')).data
  assert.deepEqual(g2.targets, [GID], 'ไอดีผิดรูปแบบต้องถูกตัดทิ้ง')
  assert.equal(g2.every, 2)
  // เพิ่งเปิด → ยังไม่มีเรื่องรอส่ง
  assert.equal((await A('GET', '/center/alerts/preview')).data.pending, false)
  // พนักงานเพิ่มงวด (เพิ่มงาน) → เข้าคิว + เป็นเรื่องรอส่งเข้ากลุ่ม
  await S('POST', `/houses/${H}/installments`, { no: 9, detail: 'งานเพิ่ม รั้วหลังบ้าน', amount: 30000, side: 'customer' })
  const p = (await A('GET', '/center/alerts/preview')).data
  assert.equal(p.pending, true)
  assert.ok(p.text.includes('บ้านทดสอบศูนย์กลาง') && p.text.includes('ส่งขออนุมัติ'), p.text)
  // ยังไม่ตั้ง LINE token → ส่งไม่ได้ แต่ไม่ค้างเรื่องไว้ยิงทีหลัง
  const n = (await A('POST', '/center/alerts/send-now')).data
  assert.equal(n.sent, false)
  assert.equal((await A('GET', '/center/alerts/preview')).data.pending, false)
  assert.equal((await A('POST', '/center/alerts/test')).status, 400)
  await A('PUT', '/center/alerts', { on: false })
})

test('ช่วงตรวจข้อความลูกค้า: ลูกค้ายังไม่ผูก LINE ก็ส่งให้ผู้ตรวจได้ (ไม่ติดเงื่อนไขผูก LINE)', async () => {
  const me = (await A('GET', '/center/line-test')).data.users.find((u) => u.name === 'ธวัช วรรณสุข')
  assert.equal((await A('PUT', '/center/line-test', { cust_redirect_user: me.id })).status, 200)
  const g = await A('GET', `/center/customer/${H}`)
  assert.equal(g.data.redirect_to, 'ธวัช วรรณสุข')
  const r = await A('POST', `/center/customer/${H}/send`, { text: 'ทดสอบ' })
  assert.equal(r.status, 400)
  assert.ok(!String(r.data.error).includes('ลูกค้าบ้านนี้ยังไม่ได้ผูก'), r.data.error) // ติดแค่ยังไม่ตั้ง LINE ของระบบทดสอบ
  await A('PUT', '/center/line-test', { cust_redirect_user: 0 })
})
