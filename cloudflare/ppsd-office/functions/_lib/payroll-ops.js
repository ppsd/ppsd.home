// คำสั่งแก้ไขเงินเดือนบน Cloudflare — ทำได้เฉพาะเมื่อเปิดใช้จริงแล้ว (meta.mode = 'live')
// กติกาทุกข้อเหมือน ERP (server/index.js): ทำจ่ายแล้ว = แก้ไม่ได้ (ต้องเปิดแก้ไขรอบ) · ลาออกไปแล้วก่อนงวด = บันทึกไม่ได้ · เงินติดลบ = ทำจ่ายไม่ได้
// ข้อมูลเงินเดือนเก็บเป็นชุด JSON ในตาราง ds (ชื่อเดียวกับตารางใน ERP) → ERP ดึงกลับไปลงตาราง/ลงบัญชี/ส่งสลิป
import * as core from './payroll-core.js'

export const OWNED = ['payroll_inputs', 'salary_advances', 'deductions', 'other_income', 'payroll_batches', 'payroll_runs']
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const shaOf = async (x) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(x))))
export const bkkTs = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace('T', ' ')
const bkkDate = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)
const todayTH = () => { const d = new Date(Date.now() + 7 * 3600e3); return `${d.getUTCDate()} ${core.TH_MONTHS[d.getUTCMonth()]} ${String((d.getUTCFullYear() + 543) % 100).padStart(2, '0')}` }
export class OpError extends Error { constructor(msg, status = 400) { super(msg); this.status = status } }

export async function getDs(db, name) { const r = await db.prepare('SELECT data FROM ds WHERE name=?').bind(name).first(); return r ? JSON.parse(r.data) : null }
export async function putDs(db, name, data) {
  await db.prepare('INSERT INTO ds (name, sha, data, at) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET sha=excluded.sha, data=excluded.data, at=excluded.at').bind(name, await shaOf(data), JSON.stringify(data), bkkTs()).run()
}
export async function getMeta(db, k, def = '') { return (await db.prepare('SELECT v FROM meta WHERE k=?').bind(k).first())?.v ?? def }
export async function setMeta(db, k, v) { await db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').bind(k, String(v)).run() }
async function audit(db, u, action, detail) { await db.prepare('INSERT INTO audit (at, who, action, detail) VALUES (?, ?, ?, ?)').bind(bkkTs(), u.name, action, String(detail || '').slice(0, 500)).run() }
const nextId = (rows) => rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1
const okPeriod = (p) => { if (!/^\d{4}-\d{2}$/.test(String(p || ''))) throw new OpError('ระบุงวด'); return p }

// รายชื่อคนที่ทำจ่ายแล้วในงวด (จากรอบที่ปิด)
async function paidMap(db, period) {
  const m = new Map()
  for (const b of ((await getDs(db, 'payroll_batches')) || []).filter((x) => x.period === period && x.status === 'closed').sort((a, c) => a.seq - c.seq)) for (const row of b.data || []) m.set(row.code, b)
  return m
}
async function empOf(db, code) {
  const e = ((await getDs(db, 'employees')) || []).find((x) => x.code === code)
  if (!e) throw new OpError('ไม่พบพนักงาน — เลือกใหม่', 404)
  return e
}
function resignedBefore(e, period) {
  if (e.status !== 'ลาออก') return
  const { from } = core.periodBounds(period)
  if (!(String(e.resign_date || '') >= from)) throw new OpError(`${e.name} ลาออกแล้ว${e.resign_date ? ' (' + e.resign_date + ')' : ''} — บันทึกเข้างวด ${core.periodLabelTH(period)} ไม่ได้ เลือกงวดที่ยังทำงานอยู่`)
}
async function notPaid(db, period, e, what) {
  if ((await paidMap(db, period)).has(e.code)) throw new OpError(`${e.name} ทำจ่ายงวด ${core.periodLabelTH(period)} ไปแล้ว — ${what} ไม่ได้ (กด "เปิดแก้ไข" ที่รอบจ่ายก่อน)`)
}
// ข้อมูลที่สูตรต้องใช้ของงวด (เหมือน payrollData() ใน ERP)
export async function payrollData(db, period) {
  const names = ['employees', 'att:' + period, 'time_adjustments', 'leaves', 'holidays', 'ot', 'payroll_inputs', 'salary_advances', 'deductions', 'other_income', 'payroll_runs']
  const d = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await getDs(db, n)])))
  const { from, to } = core.periodBounds(period)
  const inP = (x) => x.period === period
  return {
    employees: d.employees || [], attendance: d['att:' + period] || [], time_adjustments: d.time_adjustments || [], leaves: d.leaves || [],
    holidays: (d.holidays || []).filter((h) => h.date >= from && h.date <= to), ot: d.ot || [],
    payroll_inputs: (d.payroll_inputs || []).filter(inP), salary_advances: (d.salary_advances || []).filter(inP),
    deductions: (d.deductions || []).filter(inP), other_income: (d.other_income || []).filter(inP),
    runs: (d.payroll_runs || []).map((r) => ({ period: r.period, rows: r.rows || [] })),
  }
}

// ---- ข้อมูลกรอกต่อคนต่อเดือน: วันทำงาน · หมายเหตุ · คืนเงินประกัน ----
export async function setInput(db, u, b) {
  const period = okPeriod(b.period), e = await empOf(db, b.emp_code)
  await notPaid(db, period, e, 'แก้ไข')
  const all = (await getDs(db, 'payroll_inputs')) || []
  const cur = all.find((x) => x.period === period && x.emp_code === e.code) || { period, emp_code: e.code, work_days: null, note: '', retention_refund: 0 }
  const next = { ...cur }
  const { dim } = core.periodBounds(period)
  if ('work_days' in b) {
    if (b.work_days === null || b.work_days === '') next.work_days = null
    else {
      const wd = Number(b.work_days)
      if (!Number.isFinite(wd) || wd < 0) throw new OpError('จำนวนวันทำงานต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป')
      if (wd > dim) throw new OpError(`จำนวนวันทำงานเกินจำนวนวันในเดือน — ${core.periodLabelTH(period)} มี ${dim} วัน`)
      next.work_days = core.r2(wd)
    }
  }
  if ('note' in b) next.note = String(b.note || '').trim().slice(0, 300)
  if ('retention_refund' in b) { const v = Number(b.retention_refund) || 0; if (v < 0) throw new OpError('ยอดคืนเงินประกันต้องไม่ติดลบ'); next.retention_refund = core.r2(v) }
  await putDs(db, 'payroll_inputs', [...all.filter((x) => x !== cur), next])
  await audit(db, u, 'แก้ข้อมูลเงินเดือนรายคน', `${e.name} · ${core.periodLabelTH(period)} · ${Object.keys(b).filter((k) => !['period', 'emp_code'].includes(k)).join(', ')}`)
  return next
}
// ดึงวันทำงานจากลงเวลา ให้ทุกคนที่ยังไม่ทำจ่าย
export async function autofill(db, u, b) {
  const period = okPeriod(b.period)
  const D = await payrollData(db, period), paid = await paidMap(db, period)
  const all = (await getDs(db, 'payroll_inputs')) || []
  const changed = []
  for (const e of core.payrollEmployees(D, period)) {
    if (paid.has(e.code)) continue
    const wd = core.suggestWorkDays(D, e, period)
    const i = all.findIndex((x) => x.period === period && x.emp_code === e.code)
    if (i >= 0) all[i] = { ...all[i], work_days: wd }; else all.push({ period, emp_code: e.code, work_days: wd, note: '', retention_refund: 0 })
    changed.push({ code: e.code, name: e.name, work_days: wd })
  }
  await putDs(db, 'payroll_inputs', all)
  await audit(db, u, 'ดึงวันทำงานจากลงเวลา', `${core.periodLabelTH(period)} · ${changed.length} คน`)
  return { ok: true, changed }
}
// ---- เบิกล่วงหน้า / หักอื่นๆ / รายได้อื่นๆ ----
const ITEMS = { advance: ['salary_advances', 'เบิกเงินเดือนล่วงหน้า', 'note'], deduction: ['deductions', 'หักอื่นๆ', 'reason'], income: ['other_income', 'รายได้อื่นๆ', 'reason'] }
export async function addItem(db, u, kind, b) {
  const [ds, label, textCol] = ITEMS[kind]
  const period = okPeriod(b.period), e = await empOf(db, b.emp_code)
  resignedBefore(e, period)
  await notPaid(db, period, e, 'บันทึก' + label)
  const amount = core.r2(Number(b.amount) || 0)
  if (amount <= 0) throw new OpError('กรุณากรอกจำนวนเงิน')
  const text = String(b[textCol] || '').trim().slice(0, 300)
  if (kind !== 'advance' && !text) throw new OpError(kind === 'deduction' ? 'กรุณาใส่เหตุผลการหัก' : 'กรุณาใส่รายละเอียด')
  const all = (await getDs(db, ds)) || []
  const row = { id: nextId(all), emp_code: e.code, emp_name: e.name, period, date: todayTH(), amount, [textCol]: text, by: u.name, created: todayTH() }
  await putDs(db, ds, [...all, row])
  await audit(db, u, label, `${e.name} ${amount.toLocaleString()} บาท · ${core.periodLabelTH(period)}${text ? ' · ' + text : ''}`)
  return row
}
export async function delItem(db, u, kind, id) {
  const [ds, label] = ITEMS[kind]
  const all = (await getDs(db, ds)) || []
  const row = all.find((x) => Number(x.id) === Number(id))
  if (!row) throw new OpError('ไม่พบรายการ', 404)
  if ((await paidMap(db, row.period)).has(row.emp_code)) throw new OpError(`งวด ${core.periodLabelTH(row.period)} ของ ${row.emp_name} ทำจ่ายแล้ว — ยกเลิกไม่ได้ (เปิดแก้ไขรอบจ่ายก่อน)`)
  await putDs(db, ds, all.filter((x) => x !== row))
  await audit(db, u, 'ยกเลิก' + label, `${row.emp_name} ${Number(row.amount).toLocaleString()} บาท · ${core.periodLabelTH(row.period)}`)
  return { ok: true }
}
// ---- ยอดหักต่อเดือนของพนักงาน (ภาษี / กยศ. / เงินประกันผลงาน) — ส่งกลับไปแก้ทะเบียนใน ERP ----
const EMP_FIELDS = { tax: 'ภาษี/เดือน', student_loan: 'กยศ./เดือน', retention: 'เงินประกันผลงาน หัก/เดือน' }
export async function patchEmp(db, u, b) {
  const field = String(b.field || '')
  if (!EMP_FIELDS[field]) throw new OpError('แก้ช่องนี้ไม่ได้')
  const v = core.r2(Number(b.value) || 0)
  if (v < 0) throw new OpError('ตัวเลขต้องไม่ติดลบ')
  const emps = (await getDs(db, 'employees')) || []
  const e = emps.find((x) => x.code === b.emp_code)
  if (!e) throw new OpError('ไม่พบพนักงาน', 404)
  e[field] = v
  await putDs(db, 'employees', emps)
  await db.prepare('INSERT INTO emp_patches (emp_code, field, value, at, by) VALUES (?, ?, ?, ?, ?)').bind(e.code, field, v, bkkTs(), u.name).run()
  await audit(db, u, 'แก้' + EMP_FIELDS[field], `${e.name} → ${v.toLocaleString()} บาท`)
  return { ok: true }
}
// ---- รอบจ่าย ----
async function rebuildRun(db, period) {
  const bs = ((await getDs(db, 'payroll_batches')) || []).filter((b) => b.period === period && b.status === 'closed').sort((a, c) => a.seq - c.seq)
  const runs = ((await getDs(db, 'payroll_runs')) || []).filter((r) => r.period !== period)
  if (bs.length) {
    const rows = bs.flatMap((b) => (b.data || []).map((r) => ({ ...r, batch_no: b.no, pay_date: b.pay_date, batch_note: b.note || '' })))
    const last = bs[bs.length - 1]
    runs.push({ period, rows, total: rows.reduce((s, p) => s + core.netOf(p), 0), created: last.closed_at || todayTH(), by: last.closed_by || '' })
  }
  await putDs(db, 'payroll_runs', runs.sort((a, c) => (a.period < c.period ? -1 : 1)))
}
const payDateOf = (b, period) => { const { from, to } = core.periodBounds(period); if (/^\d{4}-\d{2}-\d{2}$/.test(String(b?.pay_date || ''))) return b.pay_date; const t = bkkDate(); return t >= from && t <= to ? t : to }
async function closeRows(db, u, period, codes, batch, payDate, note) {
  const paid = await paidMap(db, period)
  const dup = codes.filter((c) => paid.has(c) && paid.get(c).id !== batch?.id)
  if (dup.length) throw new OpError(`ทำจ่ายเดือนนี้ไปแล้ว: ${dup.join(', ')} — 1 คนรับเงินเดือนของเดือนได้รอบเดียว`)
  const rows = core.computePayroll(await payrollData(db, period), period).filter((r) => codes.includes(r.code))
  if (!rows.length) throw new OpError('เลือกพนักงานที่จะทำจ่ายอย่างน้อย 1 คน')
  const neg = rows.filter((p) => core.netOf(p) < 0)
  if (neg.length) throw new OpError(`ทำจ่ายไม่ได้ — เงินสุทธิติดลบ: ${neg.map((p) => `${p.name} (${core.netOf(p).toLocaleString()})`).join(', ')} กรุณาปรับยอดหัก/เบิกให้ไม่เกินเงินได้ก่อน`)
  const all = (await getDs(db, 'payroll_batches')) || []
  let b = batch ? all.find((x) => x.id === batch.id) : null
  if (!b) {
    const seq = all.filter((x) => x.period === period).reduce((m, x) => Math.max(m, x.seq || 0), 0) + 1
    b = { id: nextId(all), period, seq, no: `PAY-${period.replace('-', '')}-${seq}`, created: todayTH(), by: u.name, journal_sid: Number(period.replace('-', '')) * 100 + seq }
    all.push(b)
  }
  Object.assign(b, { status: 'closed', pay_date: payDate, note, emp_codes: rows.map((r) => r.code), data: rows, total: rows.reduce((s, p) => s + core.netOf(p), 0), closed_at: todayTH(), closed_by: u.name })
  await putDs(db, 'payroll_batches', all)
  await rebuildRun(db, period)
  await audit(db, u, 'ทำจ่ายเงินเดือน', `${b.no} · ${core.periodLabelTH(period)} · ${rows.length} คน · สุทธิ ${core.r2(b.total).toLocaleString()}`)
  return { batch: b, rows }
}
export async function createBatch(db, u, b) {
  const period = okPeriod(b.period)
  const codes = Array.isArray(b.emp_codes) ? b.emp_codes.map(String) : []
  return closeRows(db, u, period, codes, null, payDateOf(b, period), String(b.note || '').trim().slice(0, 300))
}
async function batchOf(db, id) { const b = ((await getDs(db, 'payroll_batches')) || []).find((x) => Number(x.id) === Number(id)); if (!b) throw new OpError('ไม่พบรอบจ่าย', 404); return b }
export async function editBatch(db, u, id, body) {
  const all = (await getDs(db, 'payroll_batches')) || []
  const b = all.find((x) => Number(x.id) === Number(id)); if (!b) throw new OpError('ไม่พบรอบจ่าย', 404)
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(body.pay_date || ''))) b.pay_date = body.pay_date
  if ('note' in body) b.note = String(body.note || '').trim().slice(0, 300)
  await putDs(db, 'payroll_batches', all)
  if (b.status === 'closed') await rebuildRun(db, b.period)
  await audit(db, u, 'แก้รอบจ่ายเงินเดือน', `${b.no} · จ่าย ${b.pay_date}${b.note ? ' · ' + b.note : ''}`)
  return { ok: true, batch: b }
}
export async function reopenBatch(db, u, id) {
  const all = (await getDs(db, 'payroll_batches')) || []
  const b = all.find((x) => Number(x.id) === Number(id)); if (!b) throw new OpError('ไม่พบรอบจ่าย', 404)
  if (b.status !== 'closed') throw new OpError('รอบนี้เปิดแก้ไขอยู่แล้ว')
  b.status = 'reopened'
  await putDs(db, 'payroll_batches', all); await rebuildRun(db, b.period)
  await audit(db, u, 'เปิดแก้ไขรอบจ่ายเงินเดือน', b.no)
  return { ok: true, batch: b }
}
export async function closeBatchAgain(db, u, id, body) {
  const b = await batchOf(db, id)
  if (b.status === 'closed') throw new OpError('รอบนี้ปิดอยู่แล้ว — กด "เปิดแก้ไข" ก่อน')
  const codes = Array.isArray(body.emp_codes) ? body.emp_codes.map(String) : (b.emp_codes || [])
  return closeRows(db, u, b.period, codes, b, payDateOf({ pay_date: body.pay_date ?? b.pay_date }, b.period), 'note' in body ? String(body.note || '').trim().slice(0, 300) : (b.note || ''))
}
export async function deleteBatch(db, u, id) {
  const all = (await getDs(db, 'payroll_batches')) || []
  const b = all.find((x) => Number(x.id) === Number(id)); if (!b) throw new OpError('ไม่พบรอบจ่าย', 404)
  if (b.status === 'closed') throw new OpError('รอบที่ปิดแล้วลบไม่ได้ — กด "เปิดแก้ไข" ก่อน')
  await putDs(db, 'payroll_batches', all.filter((x) => x !== b))
  await audit(db, u, 'ยกเลิกรอบจ่ายเงินเดือน', b.no)
  return { ok: true }
}
// รายการเบิก/หัก/รายได้ของงวด (ให้หน้าจอแสดง)
export async function items(db, period) {
  const f = async (n) => ((await getDs(db, n)) || []).filter((x) => x.period === period)
  return { advances: await f('salary_advances'), deductions: await f('deductions'), other_income: await f('other_income') }
}
