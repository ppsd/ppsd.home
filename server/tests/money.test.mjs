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
