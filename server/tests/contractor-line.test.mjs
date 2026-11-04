// บอท LINE ช่าง/ผู้รับเหมา: ผูกรหัส → แจ้งปัญหา / ขอเบิกงวด ทาง LINE → เข้าคิวรออนุมัติ → อนุมัติแล้วมีผล
// ยิง webhook จำลอง (ไม่มี LINE token จริง — บอทตอบไม่ได้ แต่ข้อมูลต้องเข้าระบบถูก) · ฐานข้อมูลชั่วคราว ไม่แตะ server/data
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 3298
const BASE = `http://localhost:${PORT}/api`
const serverDir = dirname(dirname(fileURLToPath(import.meta.url)))
let child, tmp, admin, site

async function api(tok, method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
  let data = null
  try { data = await res.json() } catch { /* ไม่ใช่ JSON */ }
  return { status: res.status, data, pending: res.headers.get('x-ppsd-pending') }
}
const A = (m, p, b) => api(admin, m, p, b)
const S = (m, p, b) => api(site, m, p, b)
const UID = 'U' + 'c'.repeat(32)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function line(text) { // ช่างพิมพ์ในแชท
  await api(null, 'POST', '/line/webhook', { events: [{ type: 'message', replyToken: 'r' + Math.random(), source: { type: 'user', userId: UID }, message: { type: 'text', text } }] })
  await wait(150) // webhook ตอบก่อนแล้วค่อยประมวลผล
}

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'ppsd-conline-'))
  child = spawn(process.execPath, [join(serverDir, 'index.js')], {
    env: { ...process.env, PORT: String(PORT), PPSD_DB: join(tmp, 'test.sqlite'), PPSD_NO_TUNNEL: '1' },
    stdio: process.env.PPSD_TEST_STDIO ? 'inherit' : 'ignore',
  })
  for (let i = 0; i < 60 && !admin; i++) {
    try { const r = await api(null, 'POST', '/login', { username: 'thawat', pin: '1234' }); if (r.data?.token) admin = r.data.token } catch { /* ยังไม่ขึ้น */ }
    if (!admin) await wait(400)
  }
  if (!admin) throw new Error('เซิร์ฟเวอร์ทดสอบไม่ขึ้น')
  await A('POST', '/users', { system_only: true, name: 'บัญชี ทดสอบ', username: 'acc1', pin: '5678', role: 'accounting', position: 'บัญชี' })
  site = (await api(null, 'POST', '/login', { username: 'acc1', pin: '5678' })).data.token
  assert.ok(site)
})
after(() => {
  try { child?.kill('SIGKILL') } catch { /* ignore */ }
  try { rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
})

const H = 'CL-01'
let conInst

test('เตรียมบ้าน + จ้างช่าง + งวดช่าง (แอดมิน)', async () => {
  assert.equal((await A('POST', '/houses', { code: H, name: 'บ้านทดสอบช่างไลน์', customer: 'คุณดี' })).status, 201)
  assert.ok((await A('POST', `/houses/${H}/contractors`, { name: 'ช่างเอก', role: 'โครงสร้าง' })).status < 300)
  const r = await A('POST', `/houses/${H}/installments`, { no: 1, detail: 'ฐานราก', amount: 40000, side: 'contractor', contractor: 'ช่างเอก' })
  conInst = r.data
  assert.equal(r.status, 201)
})

test('ออกรหัส → ช่างส่งรหัสในแชท → ผูกแล้ว', async () => {
  const r = await A('POST', '/contractor-line/code', { name: 'ช่างเอก' })
  assert.equal(r.status, 200)
  assert.match(r.data.code, /^\d{6}$/)
  await line(r.data.code)
  const l = await A('GET', '/contractor-line')
  assert.ok(l.data.linked.some((c) => c.name === 'ช่างเอก' && c.houses.includes('บ้านทดสอบช่างไลน์')))
})

test('ช่างแจ้งปัญหา → เข้าคิวรออนุมัติ (ยังไม่เปิดเรื่องปัญหา) → อนุมัติแล้วขึ้นในหน้าปัญหาหน้างาน', async () => {
  await line('แจ้งปัญหา ท่อน้ำรั่วห้องน้ำชั้น 2')
  await line('ส่ง')
  const q = (await A('GET', '/approvals')).data.find((x) => x.title.includes('แจ้งปัญหา') && x.title.includes('ช่างเอก'))
  assert.ok(q, 'ต้องมีคำขอแจ้งปัญหา')
  assert.ok(!(await A('GET', '/issues')).data.some((i) => i.title.includes('ท่อน้ำรั่ว')), 'ยังไม่อนุมัติ ต้องยังไม่มีเรื่อง')
  assert.equal((await A('POST', `/approvals/${q.id}/approve`, {})).status, 200)
  assert.ok((await A('GET', '/issues')).data.some((i) => i.title.includes('ท่อน้ำรั่ว') && i.house_code === H))
})

test('ช่างขอเบิกงวด → อนุมัติ → บัญชีจ่ายได้ทันทีไม่ต้องขออนุมัติซ้ำ', async () => {
  // ก่อนมีการขอเบิก: บัญชีจ่ายช่าง = ต้องรออนุมัติ
  const before = await S('POST', `/installments/${conInst.id}/pay`, { amount: 1000 })
  assert.equal(before.status, 202)
  await line('เบิกงวด')
  await line('1')
  await line('ส่ง')
  const q = (await A('GET', '/approvals')).data.find((x) => x.title.includes('ขอเบิกงวด'))
  assert.ok(q, 'ต้องมีคำขอเบิกงวด')
  assert.equal((await A('POST', `/approvals/${q.id}/approve`, {})).status, 200)
  const inst = (await A('GET', '/installments')).data.find((i) => i.id === conInst.id)
  assert.equal(inst.claim_status, 'อนุมัติเบิก')
  const pay = await S('POST', `/installments/${conInst.id}/pay`, { amount: 40000 })
  assert.equal(pay.status, 200, JSON.stringify(pay.data))
  assert.equal(pay.pending, null)
  assert.equal((await A('GET', '/installments')).data.find((i) => i.id === conInst.id).paid, 40000)
})

test('ตีกลับรายงานความคืบหน้า + ความเคลื่อนไหวบ้านเห็นเรื่องจากช่าง · ยกเลิกการผูกแล้วบอทไม่รับคำสั่ง', async () => {
  await line('รายงาน เทพื้นชั้น 1 เสร็จแล้ว')
  await line('ส่ง')
  const q = (await A('GET', '/approvals')).data.find((x) => x.title.includes('รายงานความคืบหน้า'))
  assert.ok(q)
  assert.equal((await A('POST', `/approvals/${q.id}/reject`, { note: 'ขอรูปเพิ่ม' })).status, 200)
  const f = await A('GET', `/center/feed?house=${H}`)
  const texts = f.data.items.flatMap((e) => e.parts.map((p) => p.text)).join(' | ')
  assert.ok(texts.includes('รายงานจากช่าง'), texts)
  const linked = (await A('GET', '/contractor-line')).data.linked.find((c) => c.name === 'ช่างเอก')
  assert.equal((await A('POST', `/contractor-line/${linked.id}/disable`)).status, 200)
  const n0 = (await A('GET', '/approvals?status=all')).data.length
  await line('แจ้งปัญหา ทดสอบหลังยกเลิก')
  await line('ส่ง')
  assert.equal((await A('GET', '/approvals?status=all')).data.length, n0, 'ยกเลิกผูกแล้วต้องไม่สร้างคำขอ')
})
