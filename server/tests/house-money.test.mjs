// แท็บ "การเงิน & สัญญา" ของบ้าน — สัญญา 2 ฝั่ง + ประวัติเงินเข้า-ออกทีละครั้ง
// เปิดเซิร์ฟเวอร์บนฐานข้อมูลชั่วคราว (ไม่แตะ server/data)
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 3293
const BASE = `http://localhost:${PORT}/api`
const serverDir = dirname(dirname(fileURLToPath(import.meta.url)))
let child, tmp, token

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try { data = await res.json() } catch { /* ไม่ใช่ JSON */ }
  return { status: res.status, data }
}
const GET = (p) => api('GET', p)
const POST = (p, b = {}) => api('POST', p, b)
const PUT = (p, b = {}) => api('PUT', p, b)
const DEL = (p) => api('DELETE', p)

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'ppsd-hm-'))
  child = spawn(process.execPath, [join(serverDir, 'index.js')], {
    env: { ...process.env, PORT: String(PORT), PPSD_DB: join(tmp, 'test.sqlite'), PPSD_NO_TUNNEL: '1' },
    stdio: process.env.PPSD_TEST_STDIO ? 'inherit' : 'ignore',
  })
  for (let i = 0; i < 60; i++) {
    try {
      const r = await POST('/login', { username: 'thawat', pin: '1234' })
      if (r.status === 200 && r.data?.token) { token = r.data.token; return }
    } catch { /* ยังไม่ขึ้น */ }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error('เซิร์ฟเวอร์ทดสอบไม่ขึ้น')
})
after(() => {
  try { child?.kill('SIGKILL') } catch { /* ignore */ }
  try { rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
})

const H = 'HM-01'
let custInst, conInst

test('เตรียมบ้าน + งวดลูกค้า/ช่าง', async () => {
  assert.equal((await PUT('/controls', { require_acceptance: false })).status, 200)
  assert.equal((await POST('/houses', { code: H, name: 'บ้านทดสอบการเงิน', customer: 'คุณสมใจ', value: 1000000 })).status, 201)
  const c = await POST(`/houses/${H}/contractors`, { name: 'ช่างเอก', role: 'โครงสร้าง', type: 'เหมา', advance: 0, deducted: 0, paid: 0 })
  assert.ok(c.status < 300, JSON.stringify(c.data))
  custInst = (await POST(`/houses/${H}/installments`, { no: 1, detail: 'มัดจำ', amount: 100000, side: 'customer' })).data
  conInst = (await POST(`/houses/${H}/installments`, { no: 1, detail: 'ฐานราก', amount: 40000, side: 'contractor', contractor: 'ช่างเอก' })).data
  assert.ok(custInst?.id && conInst?.id)
})

test('เก็บเงิน/จ่ายช่าง → มีประวัติทีละครั้ง พร้อมวันที่ วิธีจ่าย เลขที่', async () => {
  assert.equal((await POST(`/installments/${custInst.id}/pay`, { amount: 30000, date_iso: '2026-10-01', method: 'โอน', ref_no: 'RC-001' })).status, 200)
  assert.equal((await POST(`/installments/${custInst.id}/pay`, { amount: 70000 })).status, 200)
  assert.equal((await POST(`/installments/${conInst.id}/collect`, {})).status, 200)
  const m = (await GET(`/houses/${H}/money`)).data
  const cust = m.log.filter((r) => r.side === 'customer')
  assert.equal(cust.length, 2)
  assert.deepEqual(cust.map((r) => r.amount), [30000, 70000])
  assert.equal(cust[0].date_iso, '2026-10-01')
  assert.equal(cust[0].method, 'โอน')
  assert.equal(cust[0].ref_no, 'RC-001')
  assert.equal(cust[0].party, 'คุณสมใจ')
  const con = m.log.filter((r) => r.side === 'contractor')
  assert.equal(con.length, 1)
  assert.equal(con[0].amount, 40000)
  assert.equal(con[0].party, 'ช่างเอก')
  assert.equal(m.summary.customer.received, 100000)
  assert.equal(m.summary.contractor.paid, 40000)
  assert.ok(!m.log.some((r) => r.carry), 'ไม่มียอดยกมาเมื่อทุกครั้งมีประวัติ')
})

test('ยกเลิกการจ่าย → บันทึกยอดติดลบ · ผลรวมประวัติตรงกับยอดงวดเสมอ', async () => {
  assert.equal((await POST(`/installments/${conInst.id}/collect`, { uncollect: true })).status, 200)
  const m = (await GET(`/houses/${H}/money`)).data
  const con = m.log.filter((r) => r.side === 'contractor')
  assert.deepEqual(con.map((r) => r.amount), [40000, -40000])
  assert.equal(con.reduce((s, r) => s + r.amount, 0), m.summary.contractor.paid)
})

test('แก้รายละเอียดรายการเงินได้ แต่ยอดเงินไม่เปลี่ยน', async () => {
  const m = (await GET(`/houses/${H}/money`)).data
  const row = m.log.find((r) => r.side === 'customer' && r.amount === 70000)
  const r = await PUT(`/houses/${H}/money-log/${row.id}`, { date_iso: '2026-10-15', method: 'เงินสด', ref_no: 'RC-002', amount: 1 })
  assert.equal(r.status, 200)
  assert.equal(r.data.amount, 70000)
  assert.equal(r.data.method, 'เงินสด')
  assert.equal((await PUT(`/houses/${H}/money-log/${row.id}`, { date_iso: '15/10/2569' })).status, 400)
  assert.equal((await PUT(`/houses/${H}/money-log/${row.id}`, { method: 'บัตรเครดิต' })).status, 400)
})

test('สัญญา 2 ฝั่ง: สัญญาหลัก + แก้ไข + งานเพิ่ม/ลด → มูลค่าล่าสุด', async () => {
  const add = (b) => POST(`/houses/${H}/contracts`, b)
  assert.equal((await add({ side: 'customer', kind: 'main', amount: 1000000, no: 'CT-01', sign_date: '2026-09-01' })).status, 200)
  assert.equal((await add({ side: 'customer', kind: 'amend', amount: -50000, title: 'เซ็นครั้งที่ 2' })).status, 200)
  assert.equal((await add({ side: 'customer', kind: 'add', amount: 80000, title: 'เพิ่มห้องน้ำ' })).status, 200)
  const red = await add({ side: 'customer', kind: 'reduce', amount: 30000, title: 'ตัดรั้ว' })
  assert.equal(red.status, 200)
  assert.equal(red.data.amount, -30000, 'งานลดเก็บเป็นยอดติดลบเสมอ')
  assert.equal((await add({ side: 'contractor', kind: 'main', party: 'ช่างเอก', amount: 400000 })).status, 200)
  const m = (await GET(`/houses/${H}/money`)).data
  assert.equal(m.contracts.find((x) => x.side === 'customer').party, 'คุณสมใจ', 'ฝั่งลูกค้าไม่ใส่ชื่อ = ใช้ชื่อลูกค้าของบ้าน')
  assert.equal(m.summary.customer.contract_value, 1000000)
  assert.equal(m.summary.contractor.contract_value, 400000)
  assert.equal(m.summary.parties.find((p) => p.name === 'ช่างเอก').contract_value, 400000)
})

test('สัญญา: ข้อมูลผิดถูกปฏิเสธ', async () => {
  const add = (b) => POST(`/houses/${H}/contracts`, b)
  assert.equal((await add({ side: 'x', kind: 'main', amount: 1 })).status, 400)
  assert.equal((await add({ side: 'customer', kind: 'zzz', amount: 1 })).status, 400)
  assert.equal((await add({ side: 'customer', kind: 'main', amount: 0 })).status, 400)
  assert.equal((await add({ side: 'contractor', kind: 'main', amount: 100 })).status, 400, 'ฝั่งช่างต้องมีชื่อช่าง')
  assert.equal((await add({ side: 'customer', kind: 'main', amount: 100, sign_date: '1/9/2569' })).status, 400)
  assert.equal((await add({ side: 'customer', kind: 'main', amount: 100, file_id: 999999 })).status, 400)
  assert.equal((await POST('/houses/NO-SUCH/contracts', { side: 'customer', kind: 'main', amount: 1 })).status, 404)
})

test('แก้ไข/ลบสัญญา', async () => {
  const m = (await GET(`/houses/${H}/money`)).data
  const c = m.contracts.find((x) => x.side === 'contractor')
  const r = await PUT(`/houses/${H}/contracts/${c.id}`, { ...c, amount: 420000 })
  assert.equal(r.status, 200)
  assert.equal(r.data.amount, 420000)
  assert.equal((await PUT(`/houses/OTHER/contracts/${c.id}`, { ...c })).status, 404, 'แก้สัญญาข้ามบ้านไม่ได้')
  assert.equal((await DEL(`/houses/${H}/contracts/${c.id}`)).status, 200)
  const m2 = (await GET(`/houses/${H}/money`)).data
  assert.equal(m2.summary.contractor.contract_value, null)
})

test('เงินที่เก็บก่อนมีประวัติ → ขึ้นเป็นยอดยกมา · ผลรวมประวัติ = ยอดจริงเสมอ', async () => {
  // จำลองข้อมูลเก่า: ลบประวัติของงวดลูกค้าออกตรงๆ ในฐานข้อมูลทดสอบ (เหมือนเงินที่เก็บก่อนมีฟีเจอร์นี้)
  const { default: Database } = await import('better-sqlite3')
  const raw = new Database(join(tmp, 'test.sqlite'))
  raw.prepare('DELETE FROM house_money_log WHERE installment_id=?').run(custInst.id)
  raw.close()
  const m = (await GET(`/houses/${H}/money`)).data
  const carry = m.log.filter((r) => r.carry)
  assert.equal(carry.length, 1)
  assert.equal(carry[0].installment_id, custInst.id)
  assert.equal(carry[0].amount, 100000)
  assert.equal(carry[0].date_iso, null)
  for (const side of ['customer', 'contractor']) {
    const sum = m.log.filter((r) => r.side === side).reduce((s, r) => s + r.amount, 0)
    assert.equal(sum, side === 'customer' ? m.summary.customer.received : m.summary.contractor.paid)
  }
})
