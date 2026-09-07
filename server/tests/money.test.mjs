// ชุดทดสอบ "เส้นทางเงิน" ของ PPSD ERP — รันด้วย `npm test`
// เปิดเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว (ไม่แตะข้อมูลจริง) แล้วยิง API ตรวจทุกจุดสำคัญ:
// เงินเดือน (OT ตามงวด/บล็อกงวดปิด/บัญชีสมดุล) · จัดซื้อ→รับของ→จ่าย→บัญชี · ยอดเจ้าหนี้ · งวดบัญชีล็อก
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 3299
const BASE = `http://localhost:${PORT}/api`
const serverDir = dirname(dirname(fileURLToPath(import.meta.url)))
let child, tmp, token

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const today = new Date()
const period = iso(today).slice(0, 7)
const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 15)
const prevPeriod = iso(lastMonth).slice(0, 7)

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
  tmp = mkdtempSync(join(tmpdir(), 'ppsd-test-'))
  child = spawn(process.execPath, [join(serverDir, 'index.js')], {
    env: { ...process.env, PORT: String(PORT), PPSD_DB: join(tmp, 'test.sqlite') },
    stdio: 'ignore',
  })
  // รอเซิร์ฟเวอร์พร้อม
  for (let i = 0; i < 60; i++) {
    try {
      const r = await POST('/login', { username: 'thawat', pin: '1234' })
      if (r.status === 200 && r.data?.token) { token = r.data.token; return }
    } catch { /* ยังไม่ขึ้น */ }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error('เซิร์ฟเวอร์ทดสอบไม่ขึ้นภายใน 24 วินาที')
})
after(() => {
  try { child?.kill('SIGKILL') } catch { /* ignore */ }
  try { rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
})

// ---------- เตรียมระบบ ----------
test('ตั้งค่า: ปิด enforce_approval_flow / block_dup_pay เพื่อทดสอบสายเงินตรงๆ', async () => {
  const r = await PUT('/controls', { enforce_approval_flow: false, block_dup_pay: false })
  assert.equal(r.status, 200)
})

// ---------- เงินเดือน ----------
let empCode
test('เงินเดือน: OT นับเฉพาะงวดปัจจุบัน (ของเดือนก่อนต้องไม่โผล่ซ้ำ)', async () => {
  const e = await POST('/employees', { name: 'ทดสอบ เงินเดือน', role: 'ธุรการ', pay_type: 'รายเดือน', base: 30000 })
  assert.equal(e.status, 201, JSON.stringify(e.data))
  empCode = e.data.code
  // OT เดือนก่อน 2000 (อนุมัติ) + เดือนนี้ 500 (อนุมัติ)
  const ot1 = await POST('/ot', { emp_code: empCode, amount: 2000, date: iso(lastMonth) })
  await POST(`/ot/${ot1.data.id}/approve`)
  const ot2 = await POST('/ot', { emp_code: empCode, amount: 500, date: iso(today) })
  await POST(`/ot/${ot2.data.id}/approve`)
  const p = await GET(`/payroll?period=${period}`)
  const row = p.data.rows.find((x) => x.code === empCode)
  assert.equal(row.ot, 500, `OT งวดนี้ต้องเป็น 500 ไม่ใช่ ${row.ot} (ถ้า 2500 = บั๊กนับตลอดกาลกลับมา)`)
  const prev = await GET(`/payroll?period=${prevPeriod}`)
  const prow = prev.data.rows.find((x) => x.code === empCode)
  assert.equal(prow.ot, 2000, 'OT เดือนก่อนต้องอยู่ในงวดเดือนก่อน')
})

test('เงินเดือน: แถวข้อมูลต้องไม่มี PIN/ลายเซ็นหลุดมา', async () => {
  const p = await GET(`/payroll?period=${period}`)
  const row = p.data.rows[0]
  assert.ok(!('pin' in row) && !('signature' in row) && !('track_token' in row), 'ข้อมูลลับหลุดในแถวเงินเดือน')
})

test('เงินเดือน: ห้ามปิดงวดที่มีเงินสุทธิติดลบ', async () => {
  const d = await POST('/deductions', { emp_code: empCode, amount: 999999, reason: 'ทดสอบติดลบ', period })
  assert.equal(d.status, 201)
  const c = await POST('/payroll/close', { period })
  assert.equal(c.status, 400, 'ต้องบล็อกการปิดงวดที่มีคนติดลบ')
  assert.match(c.data.error, /ติดลบ/)
  await DEL(`/deductions/${d.data.id}`)
})

test('เงินเดือน: ปิดงวดแล้วลงบัญชีสมดุล (เดบิต = เครดิต) และห้ามบันทึกเบิก/หักย้อนเข้างวดปิด', async () => {
  const c = await POST('/payroll/close', { period })
  assert.equal(c.status, 200, JSON.stringify(c.data))
  assert.equal(c.data.journal?.posted, true, 'ปิดงวดต้องลงบัญชีอัตโนมัติ')
  const j = await GET('/journal?source=payroll')
  const entry = (Array.isArray(j.data) ? j.data : j.data.rows || []).find((e) => e.source === 'payroll')
  assert.ok(entry, 'ต้องมีรายการบัญชีเงินเดือน')
  const dr = entry.lines.reduce((s, l) => s + (l.debit || 0), 0)
  const cr = entry.lines.reduce((s, l) => s + (l.credit || 0), 0)
  assert.equal(Math.round(dr * 100), Math.round(cr * 100), 'บัญชีเงินเดือนต้องสมดุล')
  // งวดปิดแล้ว → เบิก/หักเข้าไปไม่ได้
  const adv = await POST('/salary-advances', { emp_code: empCode, amount: 100, period })
  assert.equal(adv.status, 400)
  assert.match(adv.data.error, /ปิดแล้ว/)
  const ded = await POST('/deductions', { emp_code: empCode, amount: 100, reason: 'x', period })
  assert.equal(ded.status, 400)
  assert.match(ded.data.error, /ปิดแล้ว/)
})

// ---------- จัดซื้อ → รับของ → จ่าย → บัญชี ----------
let poId
test('จัดซื้อ: PO เครดิตรับของแล้วตั้งเจ้าหนี้ 2010 · จ่ายก่อนรับของ/จ่ายเกิน ถูกบล็อก', async () => {
  await POST('/houses', { code: 'TS-01', name: 'บ้านเทสต์', project: 'เทสต์', value: 500000 })
  const po = await POST('/purchase-orders', { vendor: 'ร้านเทสต์', item: 'ปูน 100 ถุง', amount: 10000, payment_type: 'credit', credit_days: 30, house_code: 'TS-01' })
  assert.equal(po.status, 201, JSON.stringify(po.data))
  poId = po.data.id
  // จ่ายก่อนรับของ → บล็อก
  const early = await POST('/payments', { payee: 'ร้านเทสต์', gross: 10000, po_id: poId })
  assert.equal(early.status, 400)
  assert.match(early.data.error, /ยังไม่รับของ/)
  // รับของ (PO แบบเหมารวม — ใบส่งของแตกจำนวน×ราคา ต้องผ่านด้วยยอดรวม)
  const rc = await POST(`/purchase-orders/${poId}/receive`, { delivery_items: [{ name: 'ปูน 100 ถุง', qty: 100, unit: 'ถุง', price: 100, amount: 10000 }] })
  assert.equal(rc.data.result, 'ผ่าน', JSON.stringify(rc.data.detail?.lines))
  // บัญชี: ต้องมี Cr 2010 10000
  const j = await GET('/journal?source=exp')
  const rows = Array.isArray(j.data) ? j.data : j.data.rows || []
  const acc = rows.find((e) => e.lines.some((l) => l.account === '2010' && l.credit === 10000))
  assert.ok(acc, 'รับของ PO เครดิตต้องลง Cr เจ้าหนี้การค้า 2010')
  // จ่ายเกินยอดค้าง → บล็อก
  const over = await POST('/payments', { payee: 'ร้านเทสต์', gross: 15000, po_id: poId })
  assert.equal(over.status, 400)
  assert.match(over.data.error, /เกินยอดค้าง/)
})

test('จัดซื้อ: PO เงินสดห้ามทำใบจ่ายซ้ำ (ตัดเงินไปแล้วตอนรับของ)', async () => {
  const po = await POST('/purchase-orders', { vendor: 'ร้านเงินสด', item: 'ทราย', amount: 3000, payment_type: 'cash' })
  const pay = await POST('/payments', { payee: 'ร้านเงินสด', gross: 3000, po_id: po.data.id })
  assert.equal(pay.status, 400)
  assert.match(pay.data.error, /เงินสด/)
})

test('เจ้าหนี้: จ่ายครบ → ค้าง 0 · ปฏิเสธใบจ่าย → ยอดค้างกลับมา + บัญชีถูกถอน · เช็คยอดตรงเสมอ', async () => {
  const pay = await POST('/payments', { payee: 'ร้านเทสต์', gross: 10000, po_id: poId })
  assert.equal(pay.status, 201, JSON.stringify(pay.data))
  let pb = (await GET('/payables')).data.find((r) => r.po_id === poId)
  assert.equal(pb.remaining, 0)
  assert.equal(pb.status, 'จ่ายครบ')
  let chk = (await GET('/payables/check')).data
  assert.equal(chk.ok, true, `เจ้าหนี้ต้องตรงบัญชี: ${JSON.stringify(chk)}`)
  // ปฏิเสธใบจ่าย → ยอดค้างกลับมา และรายการบัญชีถูกถอน
  const rj = await POST(`/reject/payment/${pay.data.id}`, { note: 'ทดสอบ' })
  assert.equal(rj.status, 200)
  pb = (await GET('/payables')).data.find((r) => r.po_id === poId)
  assert.equal(pb.remaining, 10000, 'ปฏิเสธแล้วยอดค้างต้องกลับมา')
  chk = (await GET('/payables/check')).data
  assert.equal(chk.ok, true, `หลังปฏิเสธ ยอดยังต้องตรง: ${JSON.stringify(chk)}`)
})

test('ต้นทุนบ้าน: ใบจ่ายชำระ PO ต้องไม่ถูกนับซ้ำในรายงาน', async () => {
  // จ่าย PO อีกครั้ง (ใบใหม่หลังปฏิเสธ) — ต้นทุนบ้าน TS-01 ต้องเท่ากับรายจ่าย 10000 ไม่ใช่ 20000
  const pay = await POST('/payments', { payee: 'ร้านเทสต์', gross: 10000, po_id: poId })
  assert.equal(pay.status, 201)
  const rep = (await GET('/reports')).data
  const row = rep.budget.find((b) => b.code === 'TS-01')
  assert.equal(row.actualMaterial, 10000)
  assert.equal(row.actualOther, 0, 'ใบจ่ายชำระ PO ต้องไม่โผล่เป็นต้นทุนซ้ำ')
})

// ---------- งวดบัญชีที่ปิดแล้ว ----------
test('ปิดงวดบัญชี: ห้ามล็อกวันนี้/อนาคต · รายการที่ติดงวดปิดถูกบันทึกเป็นเรื่องค้าง แล้วหายเมื่อแก้', async () => {
  const future = await POST('/closing/lock', { date: iso(new Date(today.getFullYear() + 1, 0, 1)) })
  assert.equal(future.status, 400, 'ล็อกอนาคตต้องถูกปฏิเสธ')
  const yesterday = new Date(today.getTime() - 86400000)
  const lk = await POST('/closing/lock', { date: iso(yesterday) })
  assert.equal(lk.status, 200)
  // รายจ่ายลงวันที่ในงวดปิด → แถวบันทึกได้ แต่บัญชีลงไม่ได้ → ต้องมีธงเตือน
  const twoDaysAgo = new Date(today.getTime() - 2 * 86400000)
  const ex = await POST('/expenses', { item: 'ของย้อนหลัง', amount: 700, date: iso(twoDaysAgo) })
  assert.equal(ex.status, 201)
  let issues = (await GET('/accounting/journal-issues')).data
  assert.ok(issues.some((i) => i.source === 'exp' && i.source_id === String(ex.data.id)), 'ต้องมีธง "ลงบัญชีไม่สำเร็จ"')
  // ปลดล็อก + rebuild → ลงสำเร็จ ธงหาย
  await POST('/closing/lock', { date: '' })
  const rb = await POST('/accounting/rebuild', {})
  assert.equal(rb.status, 200)
  assert.equal(rb.data.errors.length, 0, JSON.stringify(rb.data.errors))
  issues = (await GET('/accounting/journal-issues')).data
  assert.equal(issues.length, 0, 'ลงสำเร็จแล้วธงต้องหายเอง')
})

test('เลขเอกสาร: ล้างข้อมูลจัดซื้อแล้ว เลข PO ใหม่ต้องไม่ซ้ำเลขเดิม', async () => {
  const a = await POST('/purchase-orders', { vendor: 'ร้านเลข', item: 'ของ A', amount: 100, payment_type: 'cash' })
  const noA = a.data.no
  await POST('/procurement/clear', {})
  const b = await POST('/purchase-orders', { vendor: 'ร้านเลข', item: 'ของ B', amount: 100, payment_type: 'cash' })
  assert.notEqual(b.data.no, noA, `เลข PO ซ้ำหลังล้างข้อมูล: ${b.data.no}`)
  const nA = Number(noA.match(/(\d+)$/)[1]), nB = Number(b.data.no.match(/(\d+)$/)[1])
  assert.ok(nB > nA, 'เลขต้องเดินหน้าต่อ ไม่ย้อนกลับ')
})

test('ภาษีซื้อ: คิดจากใบกำกับจริง ไม่เดา 7/107 จากทุกใบ', async () => {
  await POST('/expenses', { item: 'ของมี VAT', amount: 1070, vat_amount: 70, tax_invoice_no: 'INV-001' })
  await POST('/expenses', { item: 'ของไม่มี VAT', amount: 500 })
  const t = (await GET('/tax-summary')).data
  // ภาษีซื้อรวมต้องเท่ากับ VAT ที่กรอกจริงเท่านั้น (70) ไม่รวมใบที่ไม่มี VAT
  assert.equal(Math.round(t.inputVat), 70, `inputVat = ${t.inputVat} (ต้องเป็น 70)`)
  const bad = await POST('/expenses', { item: 'VAT เกินยอด', amount: 100, vat_amount: 200 })
  assert.equal(bad.status, 400)
})

test('เอกสารขาย: ใบเสนอราคา → ใบแจ้งหนี้ → ใบเสร็จ (อ้างอิงต่อกัน · ห้ามออกซ้ำ)', async () => {
  const q = await POST('/sales-docs', { type: 'quote', customer: 'ลูกค้าเทสต์', items: [{ desc: 'งานสร้าง', qty: 1, price: 100000 }] })
  assert.equal(q.status, 201)
  const inv = await POST(`/sales-docs/${q.data.id}/derive`, { to: 'invoice' })
  assert.equal(inv.status, 201)
  assert.equal(inv.data.ref, q.data.no)
  assert.equal(inv.data.total, q.data.total)
  const dup = await POST(`/sales-docs/${q.data.id}/derive`, { to: 'invoice' })
  assert.equal(dup.status, 409, 'ออกใบแจ้งหนี้ซ้ำจากใบเดิมต้องถูกบล็อก')
  const rc = await POST(`/sales-docs/${inv.data.id}/derive`, { to: 'receipt' })
  assert.equal(rc.status, 201)
  assert.equal(rc.data.ref, inv.data.no)
  assert.equal(rc.data.status, 'ชำระแล้ว')
})

test('สิทธิ์รายโมดูล: ปิด "จัดซื้อ" แล้วผู้ใช้นั้นเข้าเส้นทางจัดซื้อไม่ได้ (403)', async () => {
  const nu = await POST('/users', { name: 'บัญชีเทสต์', username: 'acctest', pin: '5555', role: 'accounting', position: 'บัญชี' })
  assert.equal(nu.status, 201, JSON.stringify(nu.data))
  const upd = await PUT(`/users/${nu.data.id}`, { deny_mods: ['procurement'] })
  assert.equal(upd.status, 200)
  const adminToken = token
  token = (await POST('/login', { username: 'acctest', pin: '5555' })).data.token
  const blocked = await GET('/payables')
  assert.equal(blocked.status, 403, 'โมดูลจัดซื้อต้องถูกปิด')
  const ok = await GET('/journal?limit=1')
  assert.equal(ok.status, 200, 'โมดูลบัญชียังต้องเข้าได้')
  token = adminToken
})

test('เอกสารราชการ: ไฟล์ สปส. และ ภงด.1ก ดาวน์โหลดได้', async () => {
  const sso = await fetch(`${BASE}/payroll/sso-file?period=${period}`, { headers: { Authorization: 'Bearer ' + token } })
  assert.equal(sso.status, 200)
  assert.match(await sso.text(), /เงินสมทบ/)
  const p1k = await fetch(`${BASE}/payroll/pnd1k?year=${period.slice(0, 4)}`, { headers: { Authorization: 'Bearer ' + token } })
  assert.equal(p1k.status, 200)
  assert.match(await p1k.text(), /เงินได้พึงประเมิน/)
  const ann = await GET(`/payroll/annual-emp?year=${period.slice(0, 4)}`)
  assert.equal(ann.status, 200)
  assert.ok(ann.data.rows.length >= 1, 'ต้องมียอดสะสมจากงวดที่ปิดไปแล้ว')
})

test('สต๊อกวัสดุ: PO ไม่ผูกบ้านรับเข้าอัตโนมัติ · เบิกออกตัดยอด · เบิกเกินถูกบล็อก', async () => {
  const po = await POST('/purchase-orders', { vendor: 'ร้านสต๊อก', item: 'อิฐมอญ', amount: 2000, payment_type: 'cash', items: [{ desc: 'อิฐมอญ', qty: 500, unit: 'ก้อน', price: 4 }] })
  assert.equal(po.status, 201)
  const rc = await POST(`/purchase-orders/${po.data.id}/receive`, { delivery_items: [{ name: 'อิฐมอญ', qty: 500, unit: 'ก้อน', price: 4, amount: 2000 }] })
  assert.equal(rc.data.result, 'ผ่าน')
  let stock = (await GET('/stock')).data
  const brick = stock.find((s) => s.name === 'อิฐมอญ')
  assert.ok(brick, 'ของจาก PO ไม่ผูกบ้านต้องเข้าสต๊อกอัตโนมัติ')
  assert.equal(brick.qty, 500)
  // เบิกเกิน → บล็อก
  const over = await POST('/stock/moves', { kind: 'out', item_id: brick.id, qty: 600, house_code: 'TS-01' })
  assert.equal(over.status, 400)
  // เบิกออกไปบ้าน → ตัดยอด
  const out = await POST('/stock/moves', { kind: 'out', item_id: brick.id, qty: 200, house_code: 'TS-01', note: 'ก่อกำแพง' })
  assert.equal(out.status, 201)
  stock = (await GET('/stock')).data
  assert.equal(stock.find((s) => s.id === brick.id).qty, 300)
  // เบิกโดยไม่บอกปลายทาง → บล็อก
  const noDest = await POST('/stock/moves', { kind: 'out', item_id: brick.id, qty: 10 })
  assert.equal(noDest.status, 400)
})

test('สลิปพนักงาน: PIN ถูกเห็นเฉพาะของตัวเอง · PIN ผิดถูกปฏิเสธ', async () => {
  // พนักงานจากเทสต์เงินเดือนยังไม่มี PIN — ตั้งให้ก่อน
  const emp = (await GET('/employees')).data.find((e) => e.code === empCode)
  await PUT(`/employees/${emp.id}/pin`, { pin: '7777' })
  const bad = await POST('/kiosk/my-slip', { emp_code: empCode, pin: '0000' })
  assert.equal(bad.status, 401)
  const ok = await POST('/kiosk/my-slip', { emp_code: empCode, pin: '7777' })
  assert.equal(ok.status, 200, JSON.stringify(ok.data))
  assert.ok(ok.data.periods.length >= 1, 'ต้องเห็นงวดที่ปิดแล้ว')
  assert.equal(ok.data.slip.code, empCode, 'ต้องได้สลิปของตัวเองเท่านั้น')
  assert.ok(!('pin' in ok.data.slip) && !('signature' in ok.data.slip), 'สลิปต้องไม่พ่วงข้อมูลลับ')
})

test('รายงานผู้บริหารรายเดือน: ตัวเลขครบและสอดคล้อง', async () => {
  const r = await GET(`/reports/monthly?period=${period}`)
  assert.equal(r.status, 200)
  const d = r.data
  assert.equal(d.period, period)
  assert.ok(typeof d.pnl.netProfit === 'number')
  assert.ok(typeof d.cash.closing === 'number')
  assert.ok(d.spend.payroll != null, 'เดือนนี้ปิดงวดเงินเดือนแล้ว ต้องมียอด')
  assert.ok(d.ap.total >= 0 && d.ar.total >= 0)
})

test('ภาษีขาย: สายใบเสนอราคา→แจ้งหนี้→ใบเสร็จ นับ VAT ครั้งเดียว (ไม่ใช่ 3 เท่า)', async () => {
  const before = (await GET('/tax-summary')).data.outputVat
  const q = await POST('/sales-docs', { type: 'quote', customer: 'ลูกค้า VAT', items: [{ desc: 'งาน', qty: 1, price: 100000 }] })
  const inv = await POST(`/sales-docs/${q.data.id}/derive`, { to: 'invoice' })
  await POST(`/sales-docs/${inv.data.id}/derive`, { to: 'receipt' })
  const after = (await GET('/tax-summary')).data.outputVat
  assert.equal(Math.round(after - before), 7000, `VAT ขายต้องเพิ่ม 7,000 (ครั้งเดียว) แต่เพิ่ม ${after - before}`)
})

test('สต๊อก: ตรวจนับเป็น 0 ต้องบันทึกจริง (ของหมด)', async () => {
  const brick = (await GET('/stock')).data.find((s) => s.name === 'อิฐมอญ')
  const r = await POST('/stock/moves', { kind: 'adjust', item_id: brick.id, qty: 0, note: 'นับแล้วหมด' })
  assert.equal(r.status, 201)
  const after = (await GET('/stock')).data.find((s) => s.id === brick.id)
  assert.equal(after.qty, 0, 'ตรวจนับ 0 ต้องตั้งยอดเป็น 0 จริง')
})

test('kiosk: เดา PIN ผิด 5 ครั้งถูกล็อก (ทุกช่องทาง)', async () => {
  for (let i = 0; i < 5; i++) await POST('/kiosk/punch', { emp_code: empCode, pin: '1111', kind: 'in' })
  const locked = await POST('/kiosk/punch', { emp_code: empCode, pin: '1111', kind: 'in' })
  assert.equal(locked.status, 429, 'ครั้งที่ 6 ต้องถูกล็อก')
  const slipLocked = await POST('/kiosk/my-slip', { emp_code: empCode, pin: '7777' })
  assert.equal(slipLocked.status, 429, 'การล็อกต้องคุมทุกช่องทาง kiosk ร่วมกัน')
})

test('สิทธิ์รายโมดูล: ปิดจัดซื้อแล้ว อนุมัติ PO/PR ไม่ได้ด้วย', async () => {
  const po = await POST('/purchase-orders', { vendor: 'ร้านอนุมัติ', item: 'ของ', amount: 100, payment_type: 'cash' })
  const adminToken = token
  token = (await POST('/login', { username: 'acctest', pin: '5555' })).data.token
  const blocked = await POST(`/approve/po/${po.data.id}`, {})
  assert.equal(blocked.status, 403, 'คนถูกปิดโมดูลจัดซื้อต้องอนุมัติ PO ไม่ได้')
  token = adminToken
})

test('โหมดจัดซื้อเต็มรูปแบบ: PO ไม่อ้าง PR ถูกบล็อก (เดิมไม่กรอก = ข้ามกติกา)', async () => {
  await PUT('/controls', { enforce_approval_flow: true })
  const noPr = await POST('/purchase-orders', { vendor: 'ร้านลัด', item: 'ของ', amount: 500, payment_type: 'cash' })
  assert.equal(noPr.status, 409, 'เปิดโหมดเต็มรูปแบบแล้ว PO ต้องอ้าง PR เสมอ')
  assert.match(noPr.data.error, /ใบขอซื้อ/)
  await PUT('/controls', { enforce_approval_flow: false })
})

test('เบิกล่วงหน้า: รายวันที่กรอกวันทำงานมือ (ไม่ตอกบัตร) ต้องมีเพดานเบิก', async () => {
  const e = await POST('/employees', { name: 'แม่บ้าน ทดสอบ', role: 'แม่บ้าน', pay_type: 'รายวัน', base: 400, work_days: 20 })
  assert.equal(e.status, 201)
  const lim = await GET(`/salary-advances/limit?emp_code=${e.data.code}&period=${period}`)
  assert.ok(lim.data.limit > 0, `รายวันกรอกวันมือ เพดานต้องไม่เป็น 0 (ได้ ${lim.data.limit})`)
  assert.equal(lim.data.limit, Math.floor(400 * 20 / 2), 'เพดาน = ค่าแรง × วันทำงาน ÷ 2')
})

test('งวดงาน: แก้มูลค่าต่ำกว่ายอดที่เก็บแล้วถูกบล็อก · ตั้งสถานะ "เก็บแล้ว" มือไม่ได้', async () => {
  const ins = await POST('/houses/TS-01/installments', { no: 5, detail: 'งวดทดสอบแก้ไข', amount: 10000, side: 'customer' })
  assert.equal(ins.status, 201)
  // ตั้งสถานะเงินด้วยมือ (ยังไม่เก็บจริง) → สถานะต้องไม่เปลี่ยนเป็นเก็บแล้ว
  const st = await PUT(`/installments/${ins.data.id}`, { status: 'เก็บแล้ว' })
  assert.notEqual(st.data.status, 'เก็บแล้ว', 'ห้ามตั้ง "เก็บแล้ว" โดยไม่เก็บเงินจริง')
  // เก็บเงินจริง (ปิดกติกาตรวจรับงวดชั่วคราว) แล้วลดมูลค่าต่ำกว่ายอดเก็บ → บล็อก
  await PUT('/controls', { require_acceptance: false })
  const col = await POST(`/installments/${ins.data.id}/collect`, {})
  assert.equal(col.status, 200, JSON.stringify(col.data))
  const cut = await PUT(`/installments/${ins.data.id}`, { amount: 5000 })
  assert.equal(cut.status, 400, 'ลดมูลค่าต่ำกว่ายอดเก็บแล้วต้องถูกบล็อก')
})

test('ซ่อมข้อมูล: เติมภาษีซื้อย้อนหลังตามผู้ขายที่จด VAT', async () => {
  const noVendor = await POST('/accounting/backfill-vat', {})
  assert.equal(noVendor.status, 400, 'ยังไม่ติ๊กผู้ขายจด VAT ต้องเตือน')
  const v = await POST('/vendors', { name: 'ร้านจดแวต', type: 'นิติบุคคล', tax_id: '0105500000000' })
  assert.equal(v.status, 201)
  await PUT(`/vendors/${v.data.id}`, { vat_registered: 1 })
  await POST('/expenses', { item: 'ของเก่าไม่มี VAT', amount: 2140, vendor: 'ร้านจดแวต' })
  const before = (await GET('/tax-summary')).data.inputVat
  const r = await POST('/accounting/backfill-vat', {})
  assert.equal(r.status, 200)
  assert.ok(r.data.expenses >= 1, 'ต้องเติมให้อย่างน้อย 1 ใบ')
  const after = (await GET('/tax-summary')).data.inputVat
  assert.equal(Math.round(after - before), 140, `2,140 × 7/107 = 140 (ได้ ${after - before})`)
})

test('ซ่อมข้อมูล: งวดงานสถานะแย้งยอด — ยืนยันเก็บจริง/แก้สถานะกลับ', async () => {
  // ข้อมูลยุคเก่า: สร้างงวดที่สถานะบอก "เก็บแล้ว" แต่ยอดในระบบเป็น 0
  const a = await POST('/houses/TS-01/installments', { no: 90, detail: 'งวดเก่าแย้ง A', amount: 20000, side: 'customer', status: 'เก็บแล้ว' })
  const b = await POST('/houses/TS-01/installments', { no: 91, detail: 'งวดเก่าแย้ง B', amount: 30000, side: 'customer', status: 'เก็บแล้ว' })
  let list = (await GET('/repair/installments')).data
  assert.ok(list.some((r) => r.id === a.data.id) && list.some((r) => r.id === b.data.id), 'ทั้งสองงวดต้องโผล่ในรายการข้อมูลแย้ง')
  // A: ยืนยันเก็บจริง → ยอดเต็ม + ลงบัญชี
  const ca = await POST(`/repair/installments/${a.data.id}`, { action: 'confirm' })
  assert.equal(ca.data.paid, 20000)
  assert.equal(ca.data.status, 'เก็บแล้ว')
  const j = await GET('/journal?source=inst')
  const rows = Array.isArray(j.data) ? j.data : j.data.rows || []
  assert.ok(rows.some((e) => e.source_id === String(a.data.id)), 'ยืนยันเก็บจริงต้องลงบัญชีรายได้')
  // B: ยังไม่เก็บ → สถานะกลับตามยอดจริง
  const cb = await POST(`/repair/installments/${b.data.id}`, { action: 'reset' })
  assert.equal(cb.data.status, 'รอเก็บเงิน')
  list = (await GET('/repair/installments')).data
  assert.ok(!list.some((r) => r.id === a.data.id) && !list.some((r) => r.id === b.data.id), 'ซ่อมแล้วต้องหายจากรายการ')
})

test('ราคากลาง: แปลงราคาแพ็คเป็นราคาต่อ 1 ชิ้น (หารทุกช่อง + ไม่ถูก recompute ทับ)', async () => {
  const mk = await POST('/material-prices', { name: 'ลูกบิดทดสอบ', unit: '3 ชิ้น', central: 450, min: 420, max: 480, latest: 450 })
  assert.equal(mk.status, 201)
  const bad = await POST(`/material-prices/${mk.data.id}/per-piece`, { pack: 1 })
  assert.equal(bad.status, 400, 'ตัวหารต้อง >= 2')
  const r = await POST(`/material-prices/${mk.data.id}/per-piece`, { pack: 3 })
  assert.equal(r.status, 200)
  assert.equal(r.data.central, 150, `450 ÷ 3 = 150 (ได้ ${r.data.central})`)
  assert.equal(r.data.min, 140)
  assert.equal(r.data.max, 160)
  assert.equal(r.data.unit, 'ชิ้น', 'หน่วยต้องถูกตัดตัวเลขออก')
  assert.equal(r.data.source, 'กำหนดเอง', 'ต้องกันไม่ให้ recompute จากประวัติทับราคาที่แปลงแล้ว')
  assert.match(r.data.note, /หาร 3/)
})

test('ผู้ขาย: กรอกที่อยู่+หมวดสินค้าตั้งแต่แรก และแก้ไขเพิ่มภายหลังได้', async () => {
  const v = await POST('/vendors', { name: 'ร้านไฟฟ้ารุ่งแสง', kind: 'ผู้ขาย', category: 'ไฟฟ้า', address: '99 ถ.เพชรเกษม ราชบุรี', tax_id: '0705500009999' })
  assert.equal(v.status, 201)
  assert.equal(v.data.category, 'ไฟฟ้า')
  assert.equal(v.data.address, '99 ถ.เพชรเกษม ราชบุรี')
  // รายเดิมที่ไม่มีที่อยู่ → แก้ไขเพิ่มได้
  const upd = await PUT(`/vendors/${v.data.id}`, { address: '111 ม.9 โพธาราม ราชบุรี', category: 'วัสดุก่อสร้าง' })
  assert.equal(upd.data.address, '111 ม.9 โพธาราม ราชบุรี')
  assert.equal(upd.data.category, 'วัสดุก่อสร้าง')
  assert.equal(upd.data.name, 'ร้านไฟฟ้ารุ่งแสง', 'แก้ที่อยู่ต้องไม่กระทบชื่อ')
})

test('ผู้ขาย/ผู้รับเหมา: แยกหมวดได้ · ค่าเริ่มต้นเป็นผู้ขาย · สลับหมวดได้', async () => {
  const sub = await POST('/vendors', { name: 'ทีมช่างปูน ก.', kind: 'ผู้รับเหมา', type: 'บุคคลธรรมดา' })
  assert.equal(sub.status, 201)
  assert.equal(sub.data.kind, 'ผู้รับเหมา')
  const shop = await POST('/vendors', { name: 'ร้านวัสดุ ข.' })
  assert.equal(shop.data.kind, 'ผู้ขาย', 'ไม่ระบุหมวด = ผู้ขาย')
  const flip = await PUT(`/vendors/${shop.data.id}`, { kind: 'ผู้รับเหมา' })
  assert.equal(flip.data.kind, 'ผู้รับเหมา', 'สลับหมวดได้')
  const bad = await PUT(`/vendors/${shop.data.id}`, { kind: 'อย่างอื่น' })
  assert.equal(bad.data.kind, 'ผู้ขาย', 'ค่าประหลาดถูกบังคับเป็นผู้ขาย')
})

test('สิทธิ์: role site ต้องไม่เห็นตัวเลขเงินรวมบริษัทบนแดชบอร์ด', async () => {
  await POST('/users', { name: 'ช่างเทสต์', username: 'sitetest', pin: '9999', role: 'site', position: 'ช่าง' })
  const adminToken = token
  const lg = await POST('/login', { username: 'sitetest', pin: '9999' })
  token = lg.data.token
  const d = (await GET('/dashboard')).data
  assert.equal(d.collected, null)
  assert.equal(d.net, null)
  token = adminToken
})

test('โฟร์แมน (site): คีย์ใบขอซื้อได้ + เห็นราคากลาง แต่แตะเงินจริงไม่ได้', async () => {
  const adminToken = token
  token = (await POST('/login', { username: 'sitetest', pin: '9999' })).data.token
  // คีย์ PR ได้
  const pr = await POST('/purchase-requests', { house: 'บ้านเทสต์', item: 'อิฐมวลเบา 200 ก้อน', amount: 3000 })
  assert.equal(pr.status, 201, JSON.stringify(pr.data))
  const list = await GET('/purchase-requests')
  assert.equal(list.status, 200)
  assert.ok(list.data.some((r) => r.id === pr.data.id), 'ต้องเห็น PR ที่ตัวเองคีย์')
  // เห็นราคากลาง (ใช้เดาคำ + เตือนราคาแพง)
  assert.equal((await GET('/material-prices')).status, 200)
  // แต่ส่วนเงินจริงยังเข้าไม่ได้
  assert.equal((await GET('/payments')).status, 403, 'ใบจ่ายเงินต้องเข้าไม่ได้')
  assert.equal((await GET('/payables')).status, 403, 'ยอดค้างจ่ายต้องเข้าไม่ได้')
  assert.equal((await POST('/purchase-orders', { vendor: 'x', item: 'y', amount: 1 })).status, 403, 'ออก PO ต้องไม่ได้')
  token = adminToken
})

test('ราคากลางค่าแรง: มีตารางตั้งต้นครบ · จ้างช่างเลือกหมวดแล้วระบบเทียบราคาถูกกว่า/ตาม/สูงกว่า', async () => {
  const rates = (await GET('/labor-rates')).data
  assert.ok(Array.isArray(rates) && rates.length >= 28, `ต้องมีราคากลางตั้งต้นจากใบเทียบราคา (ได้ ${rates?.length})`)
  const brick = rates.find((r) => r.name === 'งานก่อผนังอิฐแดง')
  assert.ok(brick, 'ต้องมีงานก่อผนังอิฐแดง')
  assert.equal(brick.price_min, 120); assert.equal(brick.price_max, 150); assert.equal(brick.unit, 'ตร.ม.')
  const roof = rates.find((r) => r.grp === 'เหมายกหลัง' && r.price_max === 13500)
  assert.ok(roof && /VAT/.test(roof.note), 'เหมายกหลังค่าของ+ค่าแรง ต้องมีหมายเหตุ VAT')
  const elec = rates.find((r) => r.name === 'งานระบบไฟฟ้า')
  assert.equal(elec.price_max, 0, 'งานเสนอราคาต้องไม่มีราคากลาง')

  // จ้างช่างในราคาตามราคากลาง → ชื่องานเติมจากหมวด + ยอดรวม = ปริมาณ × ราคา
  const h = 'H-LABOR'
  const ok = await POST(`/houses/${h}/contractors`, { name: 'ทีมก่อ ก.', labor_rate_id: brick.id, qty: 100, unit_price: 140 })
  assert.equal(ok.status, 201, JSON.stringify(ok.data))
  assert.equal(ok.data.price_vs, 'ตามราคากลาง')
  assert.equal(ok.data.role, 'งานก่อผนังอิฐแดง', 'ไม่พิมพ์งาน → ใช้ชื่อหมวด')
  assert.equal(ok.data.contract_total, 14000)
  // ถูกกว่า
  const cheap = await POST(`/houses/${h}/contractors`, { name: 'ทีมก่อ ข.', labor_rate_id: brick.id, qty: 50, unit_price: 110 })
  assert.equal(cheap.data.price_vs, 'ถูกกว่า')
  // สูงกว่า → ยังบันทึกได้ (เตือน + ลงประวัติตรวจสอบ) และแก้ราคาลงมาทีหลังได้
  const high = await POST(`/houses/${h}/contractors`, { name: 'ทีมก่อ ค.', labor_rate_id: brick.id, qty: 10, unit_price: 200, price_note: 'งานเร่ง' })
  assert.equal(high.data.price_vs, 'สูงกว่า')
  const fixed = await PUT(`/contractors/${high.data.id}`, { unit_price: 150 })
  assert.equal(fixed.status, 200, JSON.stringify(fixed.data))
  assert.equal(fixed.data.price_vs, 'ตามราคากลาง')
  assert.equal(fixed.data.contract_total, 10 * 150, 'ยอดรวมต้องคำนวณใหม่ตามราคาที่แก้')
  // งานเสนอราคา → ไม่เทียบ
  const q = await POST(`/houses/${h}/contractors`, { name: 'ช่างไฟ ง.', labor_rate_id: elec.id, contract_total: 85000 })
  assert.equal(q.data.price_vs, 'เสนอราคา')
  // รายการช่างของบ้านต้องมีชื่อหมวด + ผลเทียบ
  const list = (await GET(`/houses/${h}/contractors`)).data
  const a = list.find((c) => c.name === 'ทีมก่อ ก.')
  assert.equal(a.rate_label, 'งานก่อผนังอิฐแดง'); assert.equal(a.rate_unit, 'ตร.ม.'); assert.equal(a.price_vs, 'ตามราคากลาง')

  // เปลี่ยนชื่อช่าง → งวดงานช่างที่ผูกชื่อเดิมต้องตามไป
  const inst = await POST(`/houses/${h}/installments`, { no: 1, detail: 'ก่อผนังชั้น 1', amount: 7000, side: 'contractor', contractor: 'ทีมก่อ ก.' })
  assert.equal(inst.status, 201, JSON.stringify(inst.data))
  await PUT(`/contractors/${ok.data.id}`, { name: 'ทีมก่อ ก. (สมชาย)' })
  const after = (await GET(`/houses/${h}/contractors`)).data.find((c) => c.id === ok.data.id)
  assert.equal(after.work_total, 7000, 'ยอดงวดงานต้องยังผูกกับช่างหลังเปลี่ยนชื่อ')

  // การเงินแก้ราคากลางได้ · ลบ = ปิดใช้งาน (ช่างที่จ้างไปแล้วยังเห็นชื่อหมวด)
  const add = await POST('/labor-rates', { name: 'งานทดสอบ', price_min: 90, price_max: 80, unit: 'จุด' })
  assert.equal(add.status, 201); assert.equal(add.data.price_max, 90, 'สูงสุดต้องไม่ต่ำกว่าต่ำสุด')
  assert.ok(add.data.seq > 24, 'ลำดับต่อท้ายอัตโนมัติ')
  await DEL(`/labor-rates/${add.data.id}`)
  assert.ok(!(await GET('/labor-rates')).data.some((r) => r.id === add.data.id), 'ลบแล้วต้องหายจากรายการ')
  // โฟร์แมนเห็นราคากลางค่าแรง (ต้องใช้ตอนจ้างช่าง) แต่แก้ไม่ได้
  const adminToken = token
  token = (await POST('/login', { username: 'sitetest', pin: '9999' })).data.token
  assert.equal((await GET('/labor-rates')).status, 200)
  assert.equal((await POST('/labor-rates', { name: 'x', price_min: 1 })).status, 403)
  token = adminToken
})

test('จ้างช่าง: ผู้รับเหมาที่ลงทะเบียนไว้ (ผู้ค้า หมวดผู้รับเหมา) ต้องมาให้เลือก — โฟร์แมนเห็นด้วย แต่ไม่เห็นตัวเลขเงิน', async () => {
  const v = await POST('/vendors', { name: 'ทีมช่างฉาบ ลุงหมาน', kind: 'ผู้รับเหมา', type: 'บุคคลธรรมดา', category: 'งานฉาบ', address: 'โพธาราม' })
  assert.equal(v.status, 201)
  await POST('/vendors', { name: 'ร้านวัสดุไม่ใช่ช่าง', kind: 'ผู้ขาย' })
  const reg = (await GET('/contractor-registry')).data
  assert.ok(reg.some((r) => r.id === v.data.id && r.category === 'งานฉาบ'), 'ผู้รับเหมาต้องอยู่ในทะเบียนให้เลือก')
  assert.ok(!reg.some((r) => r.name === 'ร้านวัสดุไม่ใช่ช่าง'), 'ผู้ขายวัสดุต้องไม่ปน')
  assert.ok(!('outstanding' in reg[0]) && !('total' in reg[0]), 'ทะเบียนต้องไม่มีตัวเลขเงิน')
  // จ้างโดยอ้างทะเบียน → ชื่อ + หมวดตามมา
  const c = await POST('/houses/H-LABOR/contractors', { name: 'ทีมช่างฉาบ ลุงหมาน', vendor_id: v.data.id, unit_price: 110 })
  assert.equal(c.status, 201, JSON.stringify(c.data))
  assert.equal(c.data.vendor_id, v.data.id)
  const row = (await GET('/houses/H-LABOR/contractors')).data.find((x) => x.id === c.data.id)
  assert.equal(row.vendor_category, 'งานฉาบ')
  // vendor_id ที่ไม่ใช่ผู้รับเหมา → ไม่ผูก
  const shop = (await GET('/vendors')).data.find((x) => x.name === 'ร้านวัสดุไม่ใช่ช่าง')
  const bad = await POST('/houses/H-LABOR/contractors', { name: 'x', vendor_id: shop.id })
  assert.equal(bad.data.vendor_id, null)
  // โฟร์แมนใช้ทะเบียนได้ (แต่ /vendors เต็มยังเข้าไม่ได้)
  const adminToken = token
  token = (await POST('/login', { username: 'sitetest', pin: '9999' })).data.token
  assert.equal((await GET('/contractor-registry')).status, 200)
  assert.equal((await GET('/vendors')).status, 403)
  token = adminToken
})

test('ใบขอซื้อ (PR): อนุมัติคนเดียวพอ — แต่ PO/ใบจ่ายเงินยังใช้จำนวนผู้อนุมัติเดิม', async () => {
  const ctrl = (await GET('/controls')).data
  assert.equal(ctrl.approvers_pr, 1, 'ค่าตั้งต้น PR = 1 คน')
  // ปิดกติกาห้ามอนุมัติใบตัวเองชั่วคราว (ทดสอบด้วยผู้ใช้คนเดียว)
  await PUT('/controls', { block_self_approve: false, approvers_required: 3 })
  const pr = await POST('/purchase-requests', { house: 'บ้านเทสต์', item: 'ทรายหยาบ 5 คิว', amount: 4000 })
  assert.equal(pr.status, 201, JSON.stringify(pr.data))
  const a = await POST(`/approve/pr/${pr.data.id}`)
  assert.equal(a.status, 200, JSON.stringify(a.data))
  assert.equal(a.data.required, 1)
  assert.equal(a.data.done, true, 'อนุมัติครั้งเดียวต้องครบ')
  const again = await POST(`/approve/pr/${pr.data.id}`)
  assert.equal(again.status, 409, 'อนุมัติครบแล้วต้องกดซ้ำไม่ได้')
  const row = (await GET('/purchase-requests')).data.find((r) => r.id === pr.data.id)
  assert.equal(row.status, 'อนุมัติ')
  // PO ยังต้องครบตาม approvers_required (3)
  const po = await POST('/purchase-orders', { vendor: 'ร้านทดสอบ', item: 'ทรายหยาบ', amount: 4000, pr_no: pr.data.no })
  assert.equal(po.status, 201, JSON.stringify(po.data))
  const pa = await POST(`/approve/po/${po.data.id}`)
  assert.equal(pa.data.required, 3)
  assert.equal(pa.data.done, false, 'PO อนุมัติคนเดียวยังไม่ครบ')
  // ปรับ PR เป็น 2 คนได้ (แอดมินตั้งในหน้าตรวจสอบ)
  await PUT('/controls', { approvers_pr: 2 })
  const pr2 = await POST('/purchase-requests', { house: 'บ้านเทสต์', item: 'หิน 3 คิว', amount: 3000 })
  const b = await POST(`/approve/pr/${pr2.data.id}`)
  assert.equal(b.data.required, 2); assert.equal(b.data.done, false)
  await PUT('/controls', { approvers_pr: 1, block_self_approve: true })
})
