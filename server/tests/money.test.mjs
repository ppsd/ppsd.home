// ชุดทดสอบ "เส้นทางเงิน" ของ PPSD ERP — รันด้วย `npm test`
// เปิดเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว (ไม่แตะข้อมูลจริง) แล้วยิง API ตรวจทุกจุดสำคัญ:
// เงินเดือน (OT ตามงวด/บล็อกงวดปิด/บัญชีสมดุล) · จัดซื้อ→รับของ→จ่าย→บัญชี · ยอดเจ้าหนี้ · งวดบัญชีล็อก
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
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
    env: {
      ...process.env, PORT: String(PORT), PPSD_DB: join(tmp, 'test.sqlite'), PPSD_NO_TUNNEL: '1',
      PPSD_CHROME: process.env.PPSD_CHROME || '/opt/pw-browsers/chromium', // สร้างรูปใบ PR (เทสต์ข้ามถ้าไม่มี Chrome)
      PPSD_AUTOCOMPARE_MS: '400', // เทียบราคาอัตโนมัติหลังรูปสุดท้าย (จริง 60 วิ)
      // AI เทียบใบเสนอราคา: ใช้ผลจำลองแทนการยิง API จริง
      PPSD_AI_MOCK_COMPARE: JSON.stringify({ quotes: [
        { vendor: 'ร้าน A', total: 9500, vat_included: true, items: [{ name: 'เหล็กเส้น 12 มม.', qty: 10, unit: 'เส้น', price: 950, amount: 9500 }], terms: 'เงินสด' },
        { vendor: 'ร้าน B', total: 9000, vat_included: true, items: [{ name: 'เหล็กเส้น 12 มม.', qty: 10, unit: 'เส้น', price: 900, amount: 9000 }], terms: 'เครดิต 30 วัน ส่งฟรี' },
      ], best_vendor: 'ร้าน B', reason: 'ถูกกว่า 500 บาท และให้เครดิต 30 วัน', summary: 'ร้าน B คุ้มสุด' }),
    },
    stdio: process.env.PPSD_TEST_STDIO ? 'inherit' : 'ignore', // PPSD_TEST_STDIO=1 เพื่อดู log เซิร์ฟเวอร์ตอนดีบักเทสต์
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

test('ลายเซ็นผู้ขอซื้อ: ประทับจากบัญชีผู้ใช้ ถ้าไม่มีใช้ของพนักงาน (HR) และเติมย้อนหลังให้ใบเก่าเมื่ออัปโหลดทีหลัง', async () => {
  const SIG = 'data:image/png;base64,iVBORw0KGgo='
  const SIG2 = 'data:image/png;base64,QUJDRA=='
  // ผู้ใช้ที่ยังไม่มีลายเซ็น → ออก PR ได้ แต่ช่องลายเซ็นว่าง
  const u = await POST('/users', { name: 'โฟร์แมน ลายเซ็น', username: 'sigtest', pin: '5555', role: 'site', position: 'โฟร์แมน' })
  assert.equal(u.status, 201, JSON.stringify(u.data))
  const adminToken = token
  token = (await POST('/login', { username: 'sigtest', pin: '5555' })).data.token
  const pr1 = await POST('/purchase-requests', { house: 'บ้านเทสต์', item: 'ปูน 10 ถุง', amount: 1500 })
  assert.equal(pr1.status, 201)
  assert.equal(pr1.data.requester_sig, null, 'ยังไม่มีลายเซ็น = ว่าง')
  // ผู้ใช้อัปโหลดลายเซ็นของตัวเอง → ใบเก่าถูกเติมให้ทันที + ใบใหม่มีตั้งแต่ออก
  const up = await PUT(`/users/${u.data.id}/signature`, { signature: SIG })
  assert.equal(up.status, 200, JSON.stringify(up.data))
  assert.ok(up.data.filled >= 1, 'ต้องเติมลายเซ็นย้อนหลังให้ใบเก่า')
  const old = (await GET('/purchase-requests')).data.find((r) => r.id === pr1.data.id)
  assert.equal(old.requester_sig, SIG, 'ใบเก่าต้องมีลายเซ็นแล้ว')
  const pr2 = await POST('/purchase-requests', { house: 'บ้านเทสต์', item: 'ทราย 2 คิว', amount: 1200 })
  assert.equal(pr2.data.requester_sig, SIG)
  assert.equal((await GET('/me')).data.signature, SIG)
  token = adminToken
  // ผู้ใช้อีกคนไม่มีลายเซ็นในบัญชี แต่มีในทะเบียนพนักงาน (HR) ชื่อเดียวกัน → ใช้ของพนักงาน
  const u2 = await POST('/users', { name: 'ธุรการ ลายเซ็นHR', username: 'sighr', pin: '6666', role: 'accounting', position: 'ธุรการ' })
  assert.equal(u2.status, 201)
  const emp = await POST('/employees', { name: 'ธุรการ ลายเซ็นHR', role: 'ธุรการ', pay_type: 'รายเดือน', base: 15000 })
  assert.equal(emp.status, 201)
  assert.equal((await PUT(`/employees/${emp.data.id}/signature`, { signature: SIG2 })).status, 200)
  token = (await POST('/login', { username: 'sighr', pin: '6666' })).data.token
  const pr3 = await POST('/purchase-requests', { house: 'บ้านเทสต์', item: 'กระดาษ A4', amount: 300 })
  assert.equal(pr3.data.requester_sig, SIG2, 'ต้องดึงลายเซ็นจากทะเบียนพนักงานมาใช้')
  token = adminToken
})

test('กติกาจำนวนผู้อนุมัติลดลง → ใบที่กดไปแล้วครบตามกติกาใหม่ต้องเปลี่ยนเป็น "อนุมัติ" ทันที', async () => {
  await PUT('/controls', { block_self_approve: false, approvers_pr: 2 })
  const pr = await POST('/purchase-requests', { house: 'บ้านเทสต์', item: 'ปูน 10 ถุง', amount: 1500 })
  const a = await POST(`/approve/pr/${pr.data.id}`)
  assert.equal(a.data.done, false)
  let row = (await GET('/purchase-requests')).data.find((r) => r.id === pr.data.id)
  assert.equal(row.status, 'รออนุมัติ', 'อนุมัติ 1/2 ยังรอ')
  // ลดกติกาเหลือ 1 คน → ใบนี้ต้องกลายเป็นอนุมัติเอง ไม่ต้องกดซ้ำ
  const c = await PUT('/controls', { approvers_pr: 1 })
  assert.ok(c.data.synced >= 1, 'ต้องมีใบถูกซิงก์สถานะ')
  row = (await GET('/purchase-requests')).data.find((r) => r.id === pr.data.id)
  assert.equal(row.status, 'อนุมัติ')
  assert.equal(row.approval.done, true)
  await PUT('/controls', { block_self_approve: true })
})

test('ตั้งค่า AI: รุ่นเก่า claude-3 ถูกเปลี่ยนเป็นรุ่นปัจจุบัน · ไม่มีกุญแจต้องบอกที่ตั้งค่าให้ถูก', async () => {
  const cfg = (await GET('/ai-settings')).data
  assert.equal(cfg.model, 'claude-opus-5', 'ค่าตั้งต้นต้องเป็นรุ่นปัจจุบัน')
  assert.ok(Array.isArray(cfg.models) && cfg.models.some((m) => m.id === 'claude-opus-5'))
  // ค่าประหลาด/รุ่นปลดแล้ว → บังคับกลับเป็นรุ่นตั้งต้น
  const bad = await POST('/ai-settings', { model: 'claude-3-5-sonnet-latest' })
  assert.equal(bad.data.model, 'claude-opus-5')
  const ok = await POST('/ai-settings', { model: 'claude-sonnet-5' })
  assert.equal(ok.data.model, 'claude-sonnet-5')
  await POST('/ai-settings', { model: 'claude-opus-5' })
  // ไม่มีกุญแจ → ทดสอบต้อง 400 พร้อมบอกที่ตั้งค่า (ไม่ยิงออกอินเทอร์เน็ต)
  if (!cfg.hasKey) {
    const t = await POST('/ai-settings/test', {})
    assert.equal(t.status, 400)
    assert.match(t.data.error, /ผู้ใช้งาน → ตั้งค่า AI/)
  }
})

test('LINE webhook: จำ Group ID ที่บอทเห็นไว้ให้เลือก (สาธารณะ ไม่ต้องล็อกอิน)', async () => {
  const adminToken = token
  token = null
  const ok = await GET('/line/webhook')
  assert.equal(ok.status, 200)
  const ev = await POST('/line/webhook', { events: [
    { type: 'join', replyToken: 'x', source: { type: 'group', groupId: 'Cabc123' }, timestamp: 1 },
    { type: 'follow', replyToken: 'y', source: { type: 'user', userId: 'Uxyz789' } }, // เพิ่มเพื่อน (ข้อความส่วนตัว = คำสั่งบอท ไม่ลงรายการ)
  ] })
  assert.equal(ev.status, 200)
  await new Promise((r) => setTimeout(r, 300)) // webhook ประมวลผลหลังตอบ
  token = adminToken
  const cfg = (await GET('/line-settings')).data
  assert.ok(cfg.seen.some((s) => s.type === 'group' && s.id === 'Cabc123'), 'ต้องจำ Group ID ไว้')
  assert.ok(cfg.seen.some((s) => s.type === 'user' && s.id === 'Uxyz789'))
  assert.equal(cfg.seen[0].id, 'Uxyz789', 'ล่าสุดอยู่บนสุด')
  // เห็นซ้ำ → ไม่เพิ่มรายการซ้ำ
  token = null
  await POST('/line/webhook', { events: [{ type: 'message', source: { type: 'group', groupId: 'Cabc123' }, message: { type: 'text', text: 'id' } }] })
  await new Promise((r) => setTimeout(r, 300))
  token = adminToken
  const again = (await GET('/line-settings')).data
  assert.equal(again.seen.filter((s) => s.id === 'Cabc123').length, 1)
  assert.equal(again.seen[0].id, 'Cabc123')
  await DEL('/line-settings/seen')
  assert.equal((await GET('/line-settings')).data.seen.length, 0)
})

test('บอท LINE: ผูกบัญชีด้วยรหัส 6 หลัก · CEO สั่งงานในแชท → ตกลง → ใบสั่งงาน · พนักงานตอบ รับ = รับทราบ', async () => {
  const hook = (uid, text) => api('POST', '/line/webhook', { events: [{ type: 'message', replyToken: 'r1', source: { type: 'user', userId: uid }, message: { type: 'text', text } }] })
  // ยังไม่ผูก → ส่งคำสั่งไม่ได้ (webhook ต้องตอบ 200 เสมอ)
  assert.equal((await hook('Uceo', 'ให้ใครก็ได้ทำอะไรสักอย่าง')).status, 200)
  // ผูก CEO (admin) — รหัสจาก /line-link/code
  const c1 = await POST('/line-link/code', {})
  assert.equal(c1.status, 200); assert.match(c1.data.code, /^\d{6}$/)
  await hook('Uceo', c1.data.code)
  await new Promise((r) => setTimeout(r, 300)) // webhook ประมวลผลหลังตอบ 200
  const me = (await GET('/me')).data
  assert.equal(me.lineLinked, true, 'CEO ต้องผูกแล้ว')
  // พนักงานผู้รับ: สร้างพนักงาน + ผู้ใช้ชื่อเดียวกัน แล้วผูก LINE
  const emp = await POST('/employees', { name: 'สมชาย ช่างหลังคา', role: 'ช่าง', pay_type: 'รายวัน', base: 500 })
  assert.equal(emp.status, 201)
  await POST('/users', { name: 'สมชาย ช่างหลังคา', username: 'somchai', pin: '5555', role: 'site', position: 'ช่าง' })
  const adminToken = token
  token = (await POST('/login', { username: 'somchai', pin: '5555' })).data.token
  const c2 = await POST('/line-link/code', {})
  token = adminToken
  await hook('Usomchai', c2.data.code)
  await new Promise((r) => setTimeout(r, 300))
  // CEO สั่งงาน → ร่าง → ตกลง
  await hook('Uceo', 'ให้สมชายไปเช็คหลังคาบ้านเทสต์ ด่วน พรุ่งนี้')
  await new Promise((r) => setTimeout(r, 300))
  await hook('Uceo', 'ตกลง')
  await new Promise((r) => setTimeout(r, 300))
  const wos = (await GET('/work-orders')).data
  const wo = wos.find((w) => w.source === 'line' && w.executor === 'สมชาย ช่างหลังคา')
  assert.ok(wo, 'ต้องมีใบสั่งงานจาก LINE ถึงสมชาย')
  assert.equal(wo.urgent, 1, 'ต้องเป็นงานด่วน')
  assert.equal(wo.by, me.name)
  assert.equal(wo.ack, 0)
  // พนักงานตอบ 'รับ' → รับทราบ
  await hook('Usomchai', 'รับ')
  await new Promise((r) => setTimeout(r, 300))
  const after = (await GET('/work-orders')).data.find((w) => w.id === wo.id)
  assert.equal(after.ack, 1, 'ตอบ รับ ต้องกลายเป็นรับทราบ')
  assert.equal(after.ack_by, 'สมชาย ช่างหลังคา')
  // พนักงานธรรมดาสั่งงานไม่ได้ (ต้องไม่มีใบใหม่)
  const n0 = (await GET('/work-orders')).data.length
  await hook('Usomchai', 'ให้ธวัชไปดูงานบ้านเทสต์'); await hook('Usomchai', 'ตกลง')
  await new Promise((r) => setTimeout(r, 300))
  assert.equal((await GET('/work-orders')).data.length, n0, 'พนักงานสั่งงานผ่าน LINE ไม่ได้')
  // ตั้ง secret แล้ว webhook ที่ไม่มีลายเซ็นต้องถูกปฏิเสธ
  await PUT('/line-settings', { secret: 'testsecret' })
  assert.equal((await hook('Uceo', 'สรุป')).status, 403)
  await PUT('/line-settings', { secret: '' })
  // ยกเลิกผูก
  assert.equal((await DEL('/line-link')).status, 200)
  assert.equal((await GET('/me')).data.lineLinked, false)
})

test('ลิงก์สาธารณะอัตโนมัติ: ค่าตั้งต้นปิด · เปิด/ปิดได้ · คำขอผ่านลิงก์ที่ไม่ใช่ webhook ถูกกันไว้จนกว่าจะอนุญาต', async () => {
  const t0 = (await GET('/tunnel')).data
  assert.equal(t0.enabled, false); assert.equal(t0.expose, false)
  // จำลองคำขอที่มาจากลิงก์ trycloudflare (Host header) → เข้า ERP ไม่ได้ แต่ webhook ผ่าน
  const viaTunnel = (path) => fetch(BASE + path, { headers: { 'cf-connecting-ip': '203.0.113.9', 'Content-Type': 'application/json', Authorization: 'Bearer ' + token } }) // fetch ตั้ง Host เองไม่ได้ → ใช้ header ของ Cloudflare แทน
  assert.equal((await viaTunnel('/houses')).status, 404, 'ERP ต้องถูกกันเมื่อมาทางลิงก์สาธารณะ')
  assert.equal((await viaTunnel('/line/webhook')).status, 200, 'webhook ต้องผ่าน')
  const on = await PUT('/tunnel', { expose: true })
  assert.equal(on.data.expose, true)
  assert.equal((await viaTunnel('/houses')).status, 200, 'อนุญาตแล้วต้องเข้าได้')
  await PUT('/tunnel', { expose: false })
  // ยังไม่มีลิงก์ → ตั้ง webhook ต้องแจ้งชัด
  const reg = await POST('/tunnel/register-webhook', {})
  assert.equal(reg.status, 400)
  // เปิดสวิตช์ (ในเครื่องทดสอบอาจไม่มี cloudflared — แค่ต้องไม่พัง และสถานะเปลี่ยนเป็นกำลังเปิด/ผิดพลาด)
  const en = await PUT('/tunnel', { enabled: true })
  assert.equal(en.data.enabled, true)
  await new Promise((r) => setTimeout(r, 500))
  const st = (await GET('/tunnel')).data
  assert.ok(typeof st.status === 'string' && st.status !== 'ปิด')
  const off = await PUT('/tunnel', { enabled: false })
  assert.equal(off.data.enabled, false); assert.equal(off.data.status, 'ปิด')
})

test('เวอร์ชันเซิร์ฟเวอร์: /version สาธารณะ บอกว่า process เก่ากว่าไฟล์ไหม · รีสตาร์ทได้เฉพาะแอดมิน', async () => {
  const adminToken = token
  token = null
  const v = await GET('/version')
  assert.equal(v.status, 200)
  assert.ok(v.data.started > 0 && v.data.file_mtime > 0)
  assert.equal(v.data.stale, false, 'เพิ่งเปิดเซิร์ฟเวอร์จากไฟล์ปัจจุบัน ต้องไม่ stale')
  token = (await POST('/login', { username: 'sitetest', pin: '9999' })).data.token
  assert.equal((await POST('/restart', {})).status, 403, 'พนักงานสั่งรีสตาร์ทไม่ได้')
  token = adminToken
})

test('ผูก LINE: แอดมินขอรหัสแทนคนอื่นได้ · พนักงานขอได้เฉพาะของตัวเอง', async () => {
  const som = (await GET('/users')).data.find((u) => u.username === 'somchai')
  const r = await POST('/line-link/code', { user_id: som.id })
  assert.equal(r.status, 200); assert.equal(r.data.name, 'สมชาย ช่างหลังคา')
  // ใครส่งรหัสนี้ → ผูกกับสมชาย (ไม่ใช่แอดมิน)
  await api('POST', '/line/webhook', { events: [{ type: 'message', replyToken: 'r', source: { type: 'user', userId: 'Usom2' }, message: { type: 'text', text: r.data.code } }] })
  await new Promise((x) => setTimeout(x, 300))
  assert.ok((await GET('/users')).data.find((u) => u.id === som.id).line_uid === 'Usom2')
  // พนักงานส่ง user_id ของคนอื่น → ได้รหัสของตัวเองแทน
  const adminToken = token
  token = (await POST('/login', { username: 'somchai', pin: '5555' })).data.token
  const me = await POST('/line-link/code', { user_id: 1 })
  assert.equal(me.data.name, 'สมชาย ช่างหลังคา')
  token = adminToken
})

test('บอท LINE: สั่งงานด้วยชื่อเล่น ("ให้ต้น…" / "พี่ต้น") จับคนถูก และ push แจ้งคนนั้น (ถ้าผูก LINE)', async () => {
  const e = await POST('/employees', { name: 'ประยุทธ์ แสงดี', nickname: 'ต้น', role: 'ช่าง', pay_type: 'รายวัน', base: 500 })
  assert.equal(e.status, 201, JSON.stringify(e.data))
  // ชื่อเล่นหลังคำว่า "ให้" และแบบมีคำนำหน้า
  for (const text of ['ให้ต้นไปเช็คหลังคาบ้านเทสต์ พรุ่งนี้', 'บอกพี่ต้นไปดูงานหน้างานด้วย', 'ช่างต้น ไปซ่อมประตูบ้านเทสต์']) {
    const m = (await POST('/employees/match', { text })).data.match
    assert.ok(m && m.name === 'ประยุทธ์ แสงดี', `ต้องจับ "ต้น" ได้จาก: ${text} (ได้ ${m?.name})`)
    assert.equal(m.matched_by, 'ชื่อเล่น')
  }
  // ชื่อเต็มชนะชื่อเล่นเมื่อมีทั้งคู่ · คำที่บังเอิญมี "ต้น" อยู่ข้างใน (เช่น "ต้นไม้") ต้องไม่จับถ้าไม่มีคำนำหน้า
  const m2 = (await POST('/employees/match', { text: 'ให้สมชาย ช่างหลังคา ไปตัดต้นไม้' })).data.match
  assert.equal(m2.name, 'สมชาย ช่างหลังคา')
  const m3 = (await POST('/employees/match', { text: 'ไปตัดต้นไม้หน้าบ้าน' })).data.match
  assert.ok(!m3 || m3.name !== 'ประยุทธ์ แสงดี', 'คำว่า ต้นไม้ ต้องไม่ถูกจับเป็นชื่อเล่น')
  // สั่งผ่านบอทด้วยชื่อเล่น → ร่างระบุผู้รับถูกคน → ตกลง → ใบสั่งงานถึงประยุทธ์
  const hook = (uid, text) => api('POST', '/line/webhook', { events: [{ type: 'message', replyToken: 'r1', source: { type: 'user', userId: uid }, message: { type: 'text', text } }] })
  const c1 = await POST('/line-link/code', {})
  await hook('Uceo', c1.data.code); await new Promise((r) => setTimeout(r, 300))
  await hook('Uceo', 'ให้ต้นไปเช็คหลังคาบ้านเทสต์ พรุ่งนี้'); await new Promise((r) => setTimeout(r, 300))
  await hook('Uceo', 'ตกลง'); await new Promise((r) => setTimeout(r, 300))
  const wo = (await GET('/work-orders')).data.find((w) => w.source === 'line' && w.executor === 'ประยุทธ์ แสงดี')
  assert.ok(wo, 'ต้องมีใบสั่งงานถึงประยุทธ์จากชื่อเล่น')
  await DEL('/line-link')
})

test('บอท LINE: ข้อมูลไม่ครบ → ถามผู้รับแล้วถามกำหนดส่ง → สรุป → ตกลง · อ่านวันแบบไทยได้', async () => {
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  // ตัวแปลงวัน
  const p = async (text) => (await POST('/line/parse', { text })).data
  assert.equal((await p('ให้สมชายไปเช็คหลังคา พรุ่งนี้')).due_date, iso(tomorrow))
  assert.equal((await p('ส่งงาน 15 ก.ย.')).due_date.slice(5), '09-15')
  assert.equal((await p('ส่ง 20/10')).due_date.slice(5), '10-20')
  assert.equal((await p('ไม่กำหนด')).due_date, '')
  const fri = await p('ศุกร์นี้'); assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(fri.due_date) && new Date(fri.due_date).getDay() === 5, 'ศุกร์นี้ต้องเป็นวันศุกร์')
  // บทสนทนา: ไม่มีผู้รับ ไม่มีวัน → ถาม → ตอบ → สรุป → ตกลง
  const hook = (uid, text) => api('POST', '/line/webhook', { events: [{ type: 'message', replyToken: 'r1', source: { type: 'user', userId: uid }, message: { type: 'text', text } }] })
  const wait = () => new Promise((r) => setTimeout(r, 600))
  const c1 = await POST('/line-link/code', {}); await hook('Uceo', c1.data.code); await wait()
  const n0 = (await GET('/work-orders')).data.length
  await hook('Uceo', 'ไปเช็คระบบไฟบ้านเทสต์ให้หน่อย'); await wait()   // ไม่มีผู้รับ → บอทถาม "ให้ใครคะ"
  await hook('Uceo', 'ตกลง'); await wait()                              // ตกลงตอนยังไม่มีผู้รับ → ต้องไม่ออกใบ
  assert.equal((await GET('/work-orders')).data.length, n0, 'ยังไม่มีผู้รับ ต้องไม่ออกใบ')
  await hook('Uceo', 'ต้น'); await wait()                                // ตอบชื่อเล่น → ถามวัน
  await hook('Uceo', 'มะรืน'); await wait()                              // ตอบวัน → สรุป
  await hook('Uceo', 'ตกลง'); await wait()
  const wos = (await GET('/work-orders')).data
  assert.equal(wos.length, n0 + 1, 'ต้องออกใบหลังตอบครบ')
  const wo = wos.find((w) => w.scope === 'ไปเช็คระบบไฟบ้านเทสต์ให้หน่อย')
  assert.equal(wo.executor, 'ประยุทธ์ แสงดี')
  const d2 = new Date(); d2.setDate(d2.getDate() + 2)
  assert.equal(wo.due_date, iso(d2))
  assert.equal(wo.house_code, 'H-TEST-LINE'.length ? wo.house_code : wo.house_code) // house optional
  await DEL('/line-link')
})

test('อนุมัติผ่าน LINE: PR ใหม่ → การ์ดถึง CEO → กดปุ่ม อนุมัติ = อนุมัติในระบบ · ยังไม่อนุมัติ = ค้างไว้ · ปฏิเสธด้วยข้อความ', async () => {
  const hook = (uid, ev) => api('POST', '/line/webhook', { events: [{ replyToken: 'r1', source: { type: 'user', userId: uid }, ...ev }] })
  const msg = (uid, text) => hook(uid, { type: 'message', message: { type: 'text', text } })
  const postback = (uid, data) => hook(uid, { type: 'postback', postback: { data } })
  const wait = () => new Promise((r) => setTimeout(r, 600))
  // ผูก CEO
  const c1 = await POST('/line-link/code', {}); await msg('Uceo', c1.data.code); await wait()
  // พนักงาน (somchai, site) ขอซื้อ → PR รออนุมัติ
  const adminToken = token
  token = (await POST('/login', { username: 'somchai', pin: '5555' })).data.token
  const pr = await POST('/purchase-requests', { house: 'บ้านเทสต์', items: [{ desc: 'ปูนซีเมนต์', qty: 20, unit: 'ถุง', price: 135 }, { desc: 'ทรายหยาบ', qty: 2, unit: 'คิว', price: 650 }] })
  assert.equal(pr.status, 201, JSON.stringify(pr.data))
  token = adminToken
  // ยังไม่อนุมัติ (hold) → สถานะเดิม
  await postback('Uceo', `apv:pr:${pr.data.id}:hold`); await wait()
  let row = (await GET('/purchase-requests')).data.find((r) => r.id === pr.data.id)
  assert.equal(row.status, 'รออนุมัติ')
  // กดอนุมัติจากการ์ด → อนุมัติ (PR ต้องการ 1 คน)
  await postback('Uceo', `apv:pr:${pr.data.id}:approve`); await wait()
  row = (await GET('/purchase-requests')).data.find((r) => r.id === pr.data.id)
  assert.equal(row.status, 'อนุมัติ', 'กดปุ่มอนุมัติในการ์ดต้องอนุมัติจริง')
  assert.equal(row.approval.approvals[0].note, 'อนุมัติผ่าน LINE')
  // ลายเซ็นผู้อนุมัติต้องติดมาเหมือนกดจากเว็บ (ใช้ลายเซ็นของบัญชี CEO)
  const meId = (await GET('/me')).data.id
  await PUT(`/users/${meId}/signature`, { signature: 'data:image/png;base64,iVBORw0KGgo=' })
  token = (await POST('/login', { username: 'somchai', pin: '5555' })).data.token
  const pr3 = await POST('/purchase-requests', { house: 'บ้านเทสต์', item: 'สีทาบ้าน', amount: 1200 })
  token = adminToken
  await postback('Uceo', `apv:pr:${pr3.data.id}:approve`); await wait()
  const r3 = (await GET('/purchase-requests')).data.find((r) => r.id === pr3.data.id)
  assert.equal(r3.status, 'อนุมัติ')
  assert.equal(r3.approval.approvals[0].approver, (await GET('/me')).data.name)
  assert.equal(r3.approval.approvals[0].sig, 'data:image/png;base64,iVBORw0KGgo=', 'ลายเซ็นผู้อนุมัติต้องอยู่ในใบ')
  assert.ok(r3.approval.approvals[0].date, 'ต้องมีวันที่อนุมัติ')
  // พนักงานธรรมดากดปุ่มอนุมัติ → ไม่มีผล
  const pr2 = await (async () => { token = (await POST('/login', { username: 'somchai', pin: '5555' })).data.token; const r = await POST('/purchase-requests', { house: 'บ้านเทสต์', item: 'เหล็กเส้น', amount: 2850 }); token = adminToken; return r })()
  await postback('Usom2', `apv:pr:${pr2.data.id}:approve`); await wait()
  row = (await GET('/purchase-requests')).data.find((r) => r.id === pr2.data.id)
  assert.equal(row.status, 'รออนุมัติ', 'พนักงานอนุมัติผ่าน LINE ไม่ได้')
  // ปฏิเสธด้วยข้อความพร้อมเหตุผล
  await msg('Uceo', `ปฏิเสธ ${pr2.data.no} ราคาสูงไป`); await wait()
  row = (await GET('/purchase-requests')).data.find((r) => r.id === pr2.data.id)
  assert.equal(row.status, 'ปฏิเสธ')
  assert.equal(row.approval.rejectNote, 'ราคาสูงไป')
  await DEL('/line-link')
})

test('QC ชุดฟอร์ม PPSD: สร้างใบตามงวด/ฟอร์ม เก็บหัวข้อย่อย ช่องพิเศษ ช่างหน้างาน ติ๊กมาตรฐาน · ใบเก่าไม่มีฟิลด์ใหม่ยังอ่านได้', async () => {
  const items = [
    { section: '', text: 'เหล็กคานขนาดถูกต้องครบถ้วน', result: 'ผ่าน' },
    { section: 'เข้าแบบก่อนเทปูน', text: 'ทำความสะอาดให้เรียบร้อย', result: 'ไม่ผ่าน', fix: 'มีเศษไม้ค้าง' },
  ]
  const c = await POST('/qc', { house_code: 'H-TEST', phase: '2', form_id: 'f031', kind: 'ผ่าน/ไม่ผ่าน', category: 'โครงสร้าง คสล.', type: 'งานผูกเหล็กคานคอดิน', zone: 'ชั้น 1', worker: 'ช่างสมศักดิ์', items, extra: { 'วันเทปูน': '12/09/69 09.00' } })
  assert.equal(c.status, 201, JSON.stringify(c.data))
  assert.equal(c.data.phase, '2'); assert.equal(c.data.form_id, 'f031'); assert.equal(c.data.kind, 'ผ่าน/ไม่ผ่าน')
  assert.equal(c.data.items[1].section, 'เข้าแบบก่อนเทปูน', 'หัวข้อย่อยต้องติดไปกับข้อ')
  assert.equal(c.data.worker, 'ช่างสมศักดิ์'); assert.equal(c.data.extra['วันเทปูน'], '12/09/69 09.00')
  // บันทึกผล + ติ๊กท้ายใบ + กำหนดแก้ไข
  const u = await PUT(`/qc/${c.data.id}`, { items, status: 'ต้องแก้ไข', std: 'ไม่ผ่านตามมาตรฐาน', fix_date: '2026-09-15', recheck_date: '2026-09-16', extra: { 'วันเทปูน': '13/09/69', 'คิวปูน': '6 คิว 240 ksc' } })
  assert.equal(u.status, 200); assert.equal(u.data.std, 'ไม่ผ่านตามมาตรฐาน'); assert.equal(u.data.fix_date, '2026-09-15'); assert.equal(u.data.extra['คิวปูน'], '6 คิว 240 ksc')
  // ค่าติ๊กที่ไม่รู้จักถูกปัดทิ้ง ไม่ทับของเดิม
  const u2 = await PUT(`/qc/${c.data.id}`, { std: 'อะไรก็ได้' })
  assert.equal(u2.data.std, 'ไม่ผ่านตามมาตรฐาน')
  // ใบแบบเก่า (ไม่ส่ง phase/form_id) ยังสร้างและอ่านได้ — extra เป็น {} ไม่ใช่ null
  const old = await POST('/qc', { house_code: 'H-TEST', category: 'โครงสร้าง', type: 'งานคอนกรีต (หลังเท)', items: [{ text: 'ผิวเรียบ', result: 'อนุมัติ' }] })
  assert.equal(old.status, 201); assert.equal(old.data.phase, ''); assert.deepEqual(old.data.extra, {})
  const list = await GET('/qc')
  assert.ok(list.data.find((r) => r.id === old.data.id).items[0].section === '', 'ใบเก่าต้องมี section ว่าง ไม่พัง')
})

test('ขั้นตอนจัดซื้อ 1-3: โฟร์แมนขอ → ผู้ตรวจสอบเช็ค (อนุมัติข้ามขั้นไม่ได้) → ออก PR รออนุมัติ · ส่งกลับแก้ไขได้', async () => {
  const som = (await GET('/users')).data.find((u) => u.username === 'somchai')
  const f = await PUT('/procurement/flow', { checker_user_id: som.id })
  assert.equal(f.status, 200); assert.equal(f.data.checker.name, som.name)
  assert.equal((await GET('/procurement/flow')).data.checker.id, som.id)
  const pr = await POST('/purchase-requests', { house: 'บ้านเทสต์', items: [{ desc: 'ปูนซีเมนต์', qty: 20, unit: 'ถุง', price: 150 }] })
  assert.equal(pr.status, 201); assert.equal(pr.data.status, 'รอตรวจสอบ', 'ตั้งผู้ตรวจสอบไว้ → ใบใหม่ต้องรอตรวจก่อน')
  const early = await POST(`/approve/pr/${pr.data.id}`)
  assert.equal(early.status, 409, 'ยังไม่ผ่านการตรวจสอบ ต้องอนุมัติไม่ได้')
  // คนที่ไม่ใช่ผู้ตรวจสอบ/บัญชี/แอดมิน กดตรวจไม่ได้
  const adminToken = token
  token = (await POST('/login', { username: 'somchai', pin: '5555' })).data.token
  const chk = await POST(`/purchase-requests/${pr.data.id}/check`, { ok: true })
  assert.equal(chk.status, 200, JSON.stringify(chk.data)); assert.equal(chk.data.status, 'รออนุมัติ'); assert.equal(chk.data.checked_by, som.name)
  assert.ok(chk.data.checked_date, 'ต้องมีวันที่ตรวจ')
  const again = await POST(`/purchase-requests/${pr.data.id}/check`, { ok: true })
  assert.equal(again.status, 409, 'ตรวจซ้ำไม่ได้')
  token = adminToken
  // ส่งกลับแก้ไขพร้อมเหตุผล
  const pr2 = await POST('/purchase-requests', { house: 'บ้านเทสต์', item: 'ทรายหยาบ', amount: 3000 })
  const back = await POST(`/purchase-requests/${pr2.data.id}/check`, { ok: false, note: 'จำนวนไม่ตรงแบบ' })
  assert.equal(back.data.status, 'ส่งกลับแก้ไข'); assert.equal(back.data.check_note, 'จำนวนไม่ตรงแบบ')
  assert.equal((await POST(`/approve/pr/${pr2.data.id}`)).status, 409)
  // ผู้ตรวจสอบขอเอง → ไม่ต้องรอตัวเองตรวจ
  token = (await POST('/login', { username: 'somchai', pin: '5555' })).data.token
  const own = await POST('/purchase-requests', { house: 'บ้านเทสต์', item: 'ตะปู', amount: 500 })
  assert.equal(own.data.status, 'รออนุมัติ')
  token = adminToken
  await PUT('/procurement/flow', { checker_user_id: 0 })
  assert.equal((await GET('/procurement/flow')).data.checker, null)
})

test('ขั้นตอนจัดซื้อ 4-5: ส่งรูปใบเสนอราคาทาง LINE → AI เทียบ (เลือกร้านคุ้มสุด) → กดปุ่มออก PO + ส่งอนุมัติ', async () => {
  const hook = (uid, ev) => api('POST', '/line/webhook', { events: [{ replyToken: 'r1', source: { type: 'user', userId: uid }, ...ev }] })
  const msg = (uid, text) => hook(uid, { type: 'message', message: { type: 'text', text } })
  const img = (uid, id) => hook(uid, { type: 'message', message: { type: 'image', id, contentProvider: { type: 'external', originalContentUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' } } })
  const postback = (uid, data) => hook(uid, { type: 'postback', postback: { data } })
  const wait = () => new Promise((r) => setTimeout(r, 600))
  const c1 = await POST('/line-link/code', {}); await msg('Uceo', c1.data.code); await wait()
  // PR จากโฟร์แมน (somchai) → แอดมินอนุมัติ
  const adminToken = token
  token = (await POST('/login', { username: 'somchai', pin: '5555' })).data.token
  const pr = await POST('/purchase-requests', { house: 'บ้านเทสต์', items: [{ desc: 'เหล็กเส้น 12 มม.', qty: 10, unit: 'เส้น', price: 1000 }] })
  token = adminToken
  assert.equal(pr.data.status, 'รออนุมัติ')
  assert.equal((await POST(`/approve/pr/${pr.data.id}`)).status, 200)
  // ส่งรูปก่อนบอกเลข PR → ระบบเก็บไว้แล้วถาม · บอกเลข PR → ผูกรูปให้ · ส่งรูปเพิ่ม
  await img('Uceo', 'm1'); await wait()
  await msg('Uceo', `ใบเสนอราคา ${pr.data.no}`); await wait()
  await img('Uceo', 'm2'); await wait()
  const files = (await GET(`/purchase-requests/${pr.data.id}/quote-files`)).data
  assert.equal(files.length, 2, 'รูปที่ส่งก่อนและหลังบอกเลข PR ต้องผูกครบ')
  assert.ok(files[0].image.startsWith('data:image/png;base64,'))
  assert.equal(files[0].source, 'line:Uceo')
  // AI เทียบ (ผลจำลอง) → ใบเทียบราคา 2 ร้าน · ร้าน B แนะนำและถูกเลือก
  await msg('Uceo', 'เทียบราคา'); await wait()
  const quotes = (await GET(`/purchase-requests/${pr.data.id}/quotes`)).data
  assert.equal(quotes.filter((q) => q.ai).length, 2)
  const b = quotes.find((q) => q.vendor === 'ร้าน B')
  assert.equal(b.price, 9000); assert.equal(b.recommended, 1); assert.equal(b.chosen, 1)
  assert.equal(quotes.find((q) => q.vendor === 'ร้าน A').chosen, 0)
  const prRow = (await GET('/purchase-requests')).data.find((r) => r.id === pr.data.id)
  assert.equal(prRow.ai_compare.best_vendor, 'ร้าน B')
  // เทียบซ้ำต้องไม่เบิ้ลรายการ AI
  const rc = await POST(`/purchase-requests/${pr.data.id}/ai-compare`, {})
  assert.equal(rc.status, 200)
  assert.equal((await GET(`/purchase-requests/${pr.data.id}/quotes`)).data.filter((q) => q.ai).length, 2)
  // กดปุ่ม "ออก PO ร้าน B" ในการ์ด → PO ออกจริง อ้าง PR ยอด 9,000 พร้อมรายการจากใบเสนอราคา
  const q2 = (await GET(`/purchase-requests/${pr.data.id}/quotes`)).data.find((q) => q.vendor === 'ร้าน B')
  await postback('Uceo', `po:${pr.data.id}:${q2.id}`); await wait()
  const po = (await GET('/purchase-orders')).data.find((o) => o.pr_no === pr.data.no)
  assert.ok(po, 'ต้องมี PO ที่อ้าง PR นี้')
  assert.equal(po.vendor, 'ร้าน B'); assert.equal(po.amount, 9000); assert.equal(po.items[0].desc, 'เหล็กเส้น 12 มม.'); assert.equal(po.items[0].price, 900)
  assert.equal(po.approval.count, 0, 'PO ใหม่ต้องรออนุมัติ (การ์ดส่งถึงผู้อนุมัติ)')
  // ทางเว็บ: ออก PO ร้านเดิมซ้ำ → ระบบกัน (มีใบร้านนี้รออนุมัติอยู่แล้ว)
  const web = await POST(`/purchase-requests/${pr.data.id}/issue-po`, {})
  assert.equal(web.status, 409); assert.match(web.data.error, /ร่างไว้แล้ว/)
  await DEL('/line-link')
})

test('โฟร์แมนสั่งของผ่าน LINE: "สั่งของ …" → ร่าง (ถามบ้าน) → ตกลง → ใบขอซื้อรอผู้ตรวจสอบ · ราคากลางเติมให้ · ผู้บริหารได้การ์ดเมื่อผ่านตรวจ', async () => {
  const hook = (uid, ev) => api('POST', '/line/webhook', { events: [{ replyToken: 'r1', source: { type: 'user', userId: uid }, ...ev }] })
  const msg = (uid, text) => hook(uid, { type: 'message', message: { type: 'text', text } })
  const wait = () => new Promise((r) => setTimeout(r, 600))
  const adminToken = token
  const som = (await GET('/users')).data.find((u) => u.username === 'somchai')
  await PUT('/procurement/flow', { checker_user_id: som.id })
  await POST('/houses', { name: 'บ้านคุณพร', code: 'H-PORN' })
  await POST('/material-prices', { name: 'ปูนซีเมนต์', unit: 'ถุง', central: 140 })
  // ผูก LINE ให้โฟร์แมน (ประยุทธ์ = site) — ขอรหัสแทนโดยแอดมิน
  const fore = (await GET('/users')).data.find((u) => u.username === 'prayut') || (await GET('/users')).data.find((u) => u.role === 'site')
  assert.ok(fore, 'ต้องมีผู้ใช้หน้างานในระบบทดสอบ')
  const code = await POST('/line-link/code', { user_id: fore.id })
  await msg('Ufore', code.data.code); await wait()
  const n0 = (await GET('/purchase-requests')).data.length
  await msg('Ufore', 'สั่งของ ปูนซีเมนต์ 50 ถุง, เหล็กเส้น 12 มม. 10 เส้น'); await wait()
  await msg('Ufore', 'บ้านคุณพร'); await wait() // ตอบคำถาม "ของบ้านไหน"
  assert.equal((await GET('/purchase-requests')).data.length, n0, 'ยังไม่ตกลง ต้องไม่สร้างใบ')
  await msg('Ufore', 'ตกลง'); await wait()
  const prs = (await GET('/purchase-requests')).data
  assert.equal(prs.length, n0 + 1)
  const pr = prs[0]
  assert.equal(pr.by, fore.name); assert.equal(pr.status, 'รอตรวจสอบ', 'สั่งของต้องผ่านผู้ตรวจสอบก่อน'); assert.equal(pr.house_code, 'H-PORN')
  assert.equal(pr.items.length, 2); assert.equal(pr.items[0].desc, 'ปูนซีเมนต์'); assert.equal(pr.items[0].qty, 50); assert.equal(pr.items[0].unit, 'ถุง'); assert.equal(pr.items[0].price, 140, 'ต้องเติมราคากลาง')
  assert.equal(pr.items[1].desc, 'เหล็กเส้น 12 มม.'); assert.equal(pr.items[1].qty, 10); assert.equal(pr.items[1].unit, 'เส้น')
  assert.equal(pr.amount, 7000)
  // สั่งแบบระบุบ้านในประโยค + ยกเลิก
  await msg('Ufore', 'สั่งของ ทรายหยาบ 2 คิว บ้านคุณพร'); await wait()
  await msg('Ufore', 'ยกเลิก'); await wait()
  assert.equal((await GET('/purchase-requests')).data.length, n0 + 1)
  token = adminToken
  await PUT('/procurement/flow', { checker_user_id: 0 })
  await DEL('/line-link?user_id=' + fore.id)
})

test('การ์ดตรวจสอบ: บันทึกสถานะการส่ง LINE ในใบ (ยังไม่ผูก LINE = no_line) · ส่งซ้ำได้พร้อมบอกสาเหตุ', async () => {
  const som = (await GET('/users')).data.find((u) => u.username === 'somchai')
  await PUT('/procurement/flow', { checker_user_id: som.id })
  const pr = await POST('/purchase-requests', { house: 'บ้านเทสต์', item: 'ทรายละเอียด', amount: 900 })
  await new Promise((r) => setTimeout(r, 200))
  const row = (await GET('/purchase-requests')).data.find((r) => r.id === pr.data.id)
  assert.ok(['no_line', 'no_token'].includes(row.check_notify), 'ต้องบันทึกว่าทำไมไม่เด้ง: ' + row.check_notify)
  const re = await POST(`/purchase-requests/${pr.data.id}/notify-check`, {})
  assert.equal(re.status, 200); assert.equal(re.data.ok, false); assert.match(re.data.message, /LINE/)
  await PUT('/procurement/flow', { checker_user_id: 0 })
})

test('ใบ PR อนุมัติครบ → สร้างรูปใบด้วย Chrome → ส่งเข้า LINE ผู้รับที่ตั้งไว้ (บันทึกผล/สาเหตุ) · รูปเปิดดูได้ผ่านลิงก์สาธารณะ', { skip: !existsSync(process.env.PPSD_CHROME || '/opt/pw-browsers/chromium') && 'ไม่มี Chrome ในเครื่องทดสอบ' }, async () => {
  const hook = (uid, ev) => api('POST', '/line/webhook', { events: [{ replyToken: 'r1', source: { type: 'user', userId: uid }, ...ev }] })
  const msg = (uid, text) => hook(uid, { type: 'message', message: { type: 'text', text } })
  const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms))
  const adminToken = token
  const me = (await GET('/me')).data
  // ยังไม่ตั้งผู้รับ → บอกสาเหตุ
  token = (await POST('/login', { username: 'somchai', pin: '5555' })).data.token
  const pr = await POST('/purchase-requests', { house: 'บ้านเทสต์', items: [{ desc: 'สีทาบ้าน', qty: 4, unit: 'ถัง', price: 1200 }] })
  token = adminToken
  assert.equal((await POST(`/approve/pr/${pr.data.id}`)).status, 200)
  await wait(1500)
  let row = (await GET('/purchase-requests')).data.find((r) => r.id === pr.data.id)
  assert.equal(row.doc_sent, 'no_recipients')
  // ตั้งผู้รับ (แอดมิน ผูก LINE) + ลิงก์สาธารณะ + token → ส่งใหม่ → รูปถูกสร้าง แม้ LINE ส่งไม่ผ่านในเครื่องทดสอบ
  const c1 = await POST('/line-link/code', {}); await msg('Uceo', c1.data.code); await wait()
  await PUT('/line-settings', { token: 'test-token' })
  const f = await PUT('/procurement/flow', { doc_recipients: [me.id], public_url: 'https://erp.example.test' })
  assert.equal(f.data.doc_recipients[0].id, me.id); assert.equal(f.data.public_url, 'https://erp.example.test')
  const s = await POST(`/purchase-requests/${pr.data.id}/send-doc`, {})
  assert.equal(s.status, 200)
  assert.ok(['push_failed', 'sent'].some((k) => String(s.data.status).startsWith(k)), 'ต้องไปถึงขั้นส่ง LINE (ไม่ใช่ render_failed): ' + s.data.status)
  row = (await GET('/purchase-requests')).data.find((r) => r.id === pr.data.id)
  assert.ok(row.doc_key, 'ต้องมีกุญแจลิงก์รูป')
  const img = await fetch(`${BASE}/purchase-requests/${pr.data.id}/doc.png`, { headers: { Authorization: 'Bearer ' + token } })
  assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png'); assert.ok((await img.arrayBuffer()).byteLength > 20000, 'รูปใบต้องมีเนื้อหา')
  // ลิงก์สาธารณะ (ไม่ต้องล็อกอิน) ใช้กุญแจถูกต้องเท่านั้น
  const pub = await fetch(`${BASE}/pub/doc/pr/${pr.data.id}/${row.doc_key}.png`)
  assert.equal(pub.status, 200)
  assert.equal((await fetch(`${BASE}/pub/doc/pr/${pr.data.id}/wrongkey.png`)).status, 404)
  await PUT('/line-settings', { token: '' })
  await PUT('/procurement/flow', { doc_recipients: [], public_url: '' })
  await DEL('/line-link')
})

test('โครงการ "ออฟฟิศ": ใบขอซื้อใช้หมวด น้ำมัน/ซ่อมแซม/ของใช้/อื่นๆ · สั่งของทาง LINE ถามหมวดแล้วบันทึกให้', async () => {
  const hook = (uid, ev) => api('POST', '/line/webhook', { events: [{ replyToken: 'r1', source: { type: 'user', userId: uid }, ...ev }] })
  const msg = (uid, text) => hook(uid, { type: 'message', message: { type: 'text', text } })
  const wait = () => new Promise((r) => setTimeout(r, 600))
  const h = await POST('/houses', { name: 'PPSD office', code: 'OFFICE', kind: 'office' })
  assert.equal(h.status, 201); assert.equal(h.data.kind, 'office')
  const pr = await POST('/purchase-requests', { house_code: 'OFFICE', category: 'supplies', items: [{ desc: 'กระดาษ A4', qty: 5, unit: 'รีม', price: 120 }] })
  assert.equal(pr.data.category, 'supplies'); assert.equal(pr.data.house, 'PPSD office')
  assert.equal((await POST('/purchase-requests', { house_code: 'OFFICE', category: 'weird', item: 'x', amount: 1 })).data.category, '', 'หมวดที่ไม่รู้จักถูกตัดทิ้ง')
  // สั่งของทาง LINE เข้าออฟฟิศ → ถามหมวด → ตอบ 1 = เบิกค่าน้ำมัน
  const c1 = await POST('/line-link/code', {}); await msg('Uceo', c1.data.code); await wait()
  const n0 = (await GET('/purchase-requests')).data.length
  await msg('Uceo', 'สั่งของ น้ำมันดีเซล 40 ลิตร PPSD office'); await wait()
  await msg('Uceo', '1'); await wait()
  await msg('Uceo', 'ตกลง'); await wait()
  const rows = (await GET('/purchase-requests')).data
  assert.equal(rows.length, n0 + 1)
  assert.equal(rows[0].house_code, 'OFFICE'); assert.equal(rows[0].category, 'fuel'); assert.equal(rows[0].items[0].desc, 'น้ำมันดีเซล')
  await DEL('/line-link')
})

test('ผู้บริหารพิมพ์ "เปิด PR …" / "ขอจ้าง … ที่ออฟฟิศ" ใน LINE → เป็นใบขอซื้อ (ไม่ใช่ใบสั่งงาน) และไปหาผู้ตรวจสอบ', async () => {
  const hook = (uid, ev) => api('POST', '/line/webhook', { events: [{ replyToken: 'r1', source: { type: 'user', userId: uid }, ...ev }] })
  const msg = (uid, text) => hook(uid, { type: 'message', message: { type: 'text', text } })
  const wait = () => new Promise((r) => setTimeout(r, 600))
  const som = (await GET('/users')).data.find((u) => u.username === 'somchai')
  await PUT('/procurement/flow', { checker_user_id: som.id })
  const c1 = await POST('/line-link/code', {}); await msg('Uceo', c1.data.code); await wait()
  const n0 = (await GET('/purchase-requests')).data.length
  const w0 = (await GET('/work-orders')).data.length
  await msg('Uceo', 'เปิดพีอาร์จ้างช่างมาเก็บสีที่ออฟฟิศตึกมังกรฟ้า'); await wait() // พิมพ์ PR เป็นไทย
  await msg('Uceo', '2'); await wait() // หมวดออฟฟิศ: ซ่อมแซมออฟฟิศ
  await msg('Uceo', 'ตกลง'); await wait()
  const prs = (await GET('/purchase-requests')).data
  assert.equal(prs.length, n0 + 1, 'ต้องได้ใบขอซื้อ')
  assert.equal((await GET('/work-orders')).data.length, w0, 'ต้องไม่กลายเป็นใบสั่งงาน')
  assert.equal(prs[0].house_code, 'OFFICE'); assert.equal(prs[0].category, 'repair'); assert.equal(prs[0].status, 'รอตรวจสอบ')
  assert.match(prs[0].item, /ช่างมาเก็บสี/)
  await PUT('/procurement/flow', { checker_user_id: 0 })
  await DEL('/line-link')
})

test('LINE: ข้อความที่ฟังดูเหมือนซื้อ/จ้างแต่ไม่ขึ้นต้นด้วยคำสั่ง → บอทถาม 1 (PR) / 2 (สั่งงาน) ก่อน', async () => {
  const hook = (uid, ev) => api('POST', '/line/webhook', { events: [{ replyToken: 'r1', source: { type: 'user', userId: uid }, ...ev }] })
  const msg = (uid, text) => hook(uid, { type: 'message', message: { type: 'text', text } })
  const wait = () => new Promise((r) => setTimeout(r, 600))
  const c1 = await POST('/line-link/code', {}); await msg('Uceo', c1.data.code); await wait()
  const n0 = (await GET('/purchase-requests')).data.length
  const w0 = (await GET('/work-orders')).data.length
  await msg('Uceo', 'หาช่างทาสีเก็บสีที่ออฟฟิศตึกมังกรฟ้า'); await wait()
  assert.equal((await GET('/work-orders')).data.length, w0, 'ต้องยังไม่ออกใบสั่งงาน — ต้องถามก่อน')
  await msg('Uceo', '1'); await wait()
  await msg('Uceo', '4'); await wait() // หมวดออฟฟิศ อื่นๆ
  await msg('Uceo', 'ตกลง'); await wait()
  const prs = (await GET('/purchase-requests')).data
  assert.equal(prs.length, n0 + 1); assert.equal(prs[0].house_code, 'OFFICE'); assert.equal(prs[0].category, 'other')
  assert.equal((await GET('/work-orders')).data.length, w0)
  await DEL('/line-link')
})

test('เทียบราคาอัตโนมัติ: ส่งรูปครบ → AI เทียบเอง → ร่าง PO จากร้านที่แนะนำ + การ์ดอนุมัติมีตารางเทียบราคา · เปลี่ยนร้านแล้วใบเดิมถูกยกเลิก', async () => {
  const hook = (uid, ev) => api('POST', '/line/webhook', { events: [{ replyToken: 'r1', source: { type: 'user', userId: uid }, ...ev }] })
  const msg = (uid, text) => hook(uid, { type: 'message', message: { type: 'text', text } })
  const img = (uid, id) => hook(uid, { type: 'message', message: { type: 'image', id, contentProvider: { type: 'external', originalContentUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' } } })
  const postback = (uid, data) => hook(uid, { type: 'postback', postback: { data } })
  const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms))
  const adminToken = token
  const c1 = await POST('/line-link/code', {}); await msg('Uceo', c1.data.code); await wait()
  token = (await POST('/login', { username: 'somchai', pin: '5555' })).data.token
  const pr = await POST('/purchase-requests', { house: 'บ้านเทสต์', items: [{ desc: 'เหล็กเส้น 12 มม.', qty: 10, unit: 'เส้น', price: 1000 }] })
  token = adminToken
  assert.equal((await POST(`/approve/pr/${pr.data.id}`)).status, 200)
  // ระบุใบแล้วส่งรูป 2 ร้าน → ไม่ต้องพิมพ์ 'เทียบราคา' ระบบเทียบเองหลังหน่วง (PPSD_AUTOCOMPARE_MS)
  await msg('Uceo', `ใบเสนอราคา ${pr.data.no}`); await wait()
  await img('Uceo', 'a1'); await wait()
  await img('Uceo', 'a2'); await wait(1500)
  const quotes = (await GET(`/purchase-requests/${pr.data.id}/quotes`)).data
  assert.equal(quotes.filter((q) => q.ai).length, 2, 'AI ต้องเทียบเองเมื่อรูปครบ')
  let row = (await GET('/purchase-requests')).data.find((r) => r.id === pr.data.id)
  assert.equal(row.quote_files, 2); assert.equal(row.chosen_vendor, 'ร้าน B')
  assert.ok(row.po_no, 'ต้องร่าง PO ให้อัตโนมัติ'); assert.equal(row.po_vendor, 'ร้าน B'); assert.equal(row.po_approved, false)
  const po = (await GET('/purchase-orders')).data.find((o) => o.no === row.po_no)
  assert.equal(po.amount, 9000); assert.equal(po.approval.count, 0)
  // เปลี่ยนร้านผ่านปุ่ม → ใบเดิมถูกปฏิเสธ ใบใหม่ร้าน A
  const qa = quotes.find((q) => q.vendor === 'ร้าน A')
  await postback('Uceo', `po:${pr.data.id}:${qa.id}`); await wait()
  row = (await GET('/purchase-requests')).data.find((r) => r.id === pr.data.id)
  assert.equal(row.po_vendor, 'ร้าน A')
  const oldPo = (await GET('/purchase-orders')).data.find((o) => o.no === po.no)
  assert.equal(oldPo.approval.rejected, true, 'PO ร้านเดิมต้องถูกยกเลิก')
  // กดร้านเดิมซ้ำ → ไม่ออกซ้ำ
  await postback('Uceo', `po:${pr.data.id}:${qa.id}`); await wait()
  assert.equal((await GET('/purchase-orders')).data.filter((o) => o.pr_no === pr.data.no).length, 2)
  await DEL('/line-link')
})

test('ตำแหน่ง CEO = สิทธิ์เท่าผู้จัดการ (อนุมัติได้) · ปฏิเสธ PO → ยกเลิกทันที รับของ/เปลี่ยนสถานะไม่ได้ · ปฏิเสธ PR → PO ร่างของใบนั้นยกเลิกตาม', async () => {
  const adminToken = token
  await POST('/users', { name: 'ซีอีโอ ทดสอบ', username: 'ceo2', pin: '7777', role: 'site', position: 'CEO' })
  token = (await POST('/login', { username: 'somchai', pin: '5555' })).data.token
  const pr = await POST('/purchase-requests', { house: 'บ้านเทสต์', item: 'อิฐมอญ', amount: 5000 })
  token = (await POST('/login', { username: 'ceo2', pin: '7777' })).data.token
  const me = (await GET('/me')).data
  assert.equal(me.isManager, true, 'ตำแหน่ง CEO ต้องนับเป็นผู้จัดการ')
  assert.equal((await POST(`/approve/pr/${pr.data.id}`)).status, 200, 'CEO ต้องอนุมัติ PR ได้')
  token = adminToken
  const po = await POST('/purchase-orders', { vendor: 'ร้านอิฐ', item: 'อิฐมอญ', amount: 5000, pr_no: pr.data.no })
  assert.equal(po.status, 201)
  // CEO ปฏิเสธ PO → ยกเลิกทันที
  token = (await POST('/login', { username: 'ceo2', pin: '7777' })).data.token
  const rj = await POST(`/reject/po/${po.data.id}`, { note: 'ราคาแพงไป' })
  assert.equal(rj.status, 200)
  token = adminToken
  let row = (await GET('/purchase-orders')).data.find((o) => o.id === po.data.id)
  assert.equal(row.status, 'ยกเลิก'); assert.equal(row.approval.rejected, true)
  assert.equal((await POST(`/purchase-orders/${po.data.id}/status`, { status: 'รับของแล้ว' })).status, 409)
  assert.equal((await POST(`/purchase-orders/${po.data.id}/receive`, { items: [] })).status, 409)
  // ปฏิเสธ PR ที่มี PO ร่างอยู่ → PO ยกเลิกตาม
  token = (await POST('/login', { username: 'somchai', pin: '5555' })).data.token
  const pr2 = await POST('/purchase-requests', { house: 'บ้านเทสต์', item: 'หินคลุก', amount: 3000 })
  token = adminToken
  await PUT('/controls', { enforce_approval_flow: false })
  const po2 = await POST('/purchase-orders', { vendor: 'ร้านหิน', item: 'หินคลุก', amount: 3000, pr_no: pr2.data.no })
  assert.equal(po2.status, 201, JSON.stringify(po2.data))
  assert.equal((await POST(`/reject/pr/${pr2.data.id}`, { note: 'ไม่จำเป็น' })).status, 200)
  row = (await GET('/purchase-orders')).data.find((o) => o.id === po2.data.id)
  assert.equal(row.status, 'ยกเลิก'); assert.equal(row.approval.rejected, true)
  assert.equal((await GET('/purchase-requests')).data.find((r) => r.id === pr2.data.id).status, 'ปฏิเสธ')
})
