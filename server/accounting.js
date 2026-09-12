// ระบบบัญชีคู่ (Double-entry accounting) — เฟส 1
// เครื่องยนต์ลงบัญชี + ผังบัญชี + สมุดรายวัน + แยกประเภท + งบทดลอง + งบการเงินเบื้องต้น
// หลักการ: ทุกรายการต้อง เดบิตรวม = เครดิตรวม เสมอ
import { db } from './db.js'

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
function todayISO() { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
function thFromISO(iso) { const d = new Date(String(iso) + 'T00:00:00'); if (Number.isNaN(d.getTime())) return iso || ''; return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${String((d.getFullYear() + 543) % 100).padStart(2, '0')}` }
function nowTS() { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` }
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// เครื่องหมายยอดปกติ: สินทรัพย์/ต้นทุน/ค่าใช้จ่าย = เดบิต ; หนี้สิน/ทุน/รายได้ = เครดิต
const DEBIT_NORMAL = new Set(['asset', 'cost', 'expense'])
export function accountBalance(type, debit, credit) {
  return DEBIT_NORMAL.has(type) ? r2(debit - credit) : r2(credit - debit)
}

// ค่าตั้งต้นบัญชีเงินที่ใช้ชำระ (ตั้งค่าได้ — รองรับหลายบัญชีธนาคาร/เงินสดย่อย)
function getSetting(k, def) { return db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value ?? def }
function setSettingRaw(k, v) { db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v)) }
export function defaultBank() { return getSetting('acct_bank_default', '1020') }
export function defaultCash() { return getSetting('acct_cash_default', '1010') }
export const PETTY_ACCOUNT = '1030' // เงินสดย่อย
export const FUEL_ACCOUNT = '1031' // เงินสดย่อย-ค่าน้ำมันรถ (กองแยก วงเงินแยก)
export function setDefaults({ bank, cash }) {
  const up = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
  if (bank) up.run('acct_bank_default', String(bank))
  if (cash) up.run('acct_cash_default', String(cash))
}
// บัญชีเงินสด/ธนาคารทั้งหมด (รหัส 10xx ประเภทสินทรัพย์) — สำหรับหลายบัญชี + กระทบยอด
export function cashAccounts() {
  return db.prepare("SELECT * FROM accounts WHERE is_active=1 AND type='asset' AND code >= '1000' AND code < '1100' ORDER BY code").all()
}

// รหัสบัญชีตามหมวดค่าใช้จ่าย/รายจ่าย
export function expenseAccountFor(cat = '') {
  const c = String(cat)
  if (c.includes('วัสดุ')) return '5010'
  if (c.includes('แรง')) return '5020'
  if (c.includes('เหมาช่วง') || c.includes('ผู้รับเหมา')) return '5030'
  if (c.includes('เครื่องจักร') || c.includes('อุปกรณ์')) return '5040'
  if (c.includes('ขนส่ง') || c.includes('น้ำมัน')) return '6030'
  if (c.includes('บริการ') || c.includes('ธรรมเนียม') || c.includes('วิชาชีพ')) return '6040'
  if (c.includes('ดำเนินการ') || c.includes('สำนักงาน') || c.includes('office') || c.includes('Office')) return '6020'
  return '6090'
}
// บัญชีเงินที่ใช้ชำระ ตามวิธีชำระ (default = ธนาคาร)
export function cashAccountFor(method = '') {
  const m = String(method)
  if (m.includes('สด')) return '1010'
  return '1020'
}

// เลขที่ใบสำคัญ = JV-{ปีพ.ศ.2หลัก}-{id} — อิง id ที่ไม่ซ้ำ (AUTOINCREMENT) จึงไม่ชนกันแม้ลบแล้วลงใหม่
function jvNo(id) {
  const be2 = String((new Date().getFullYear() + 543) % 100).padStart(2, '0')
  return `JV-${be2}-${String(id).padStart(4, '0')}`
}

// ลงบัญชี 1 รายการ (idempotent เมื่อระบุ source+source_id): ลบของเดิมแล้วลงใหม่
// entry = { date_iso, memo, house_code, source, source_id, by, lines:[{account,debit,credit,memo}] }
export const postJournal = db.transaction((entry) => {
  const lines = (entry.lines || []).filter((l) => (Number(l.debit) || 0) !== 0 || (Number(l.credit) || 0) !== 0)
  const dr = r2(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0))
  const cr = r2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0))
  if (lines.length < 2) throw new Error('รายการบัญชีต้องมีอย่างน้อย 2 บรรทัด')
  if (dr !== cr) throw new Error(`เดบิต (${dr}) ไม่เท่ากับ เครดิต (${cr}) — รายการไม่สมดุล`)
  if (dr === 0) throw new Error('ยอดเงินต้องไม่เป็นศูนย์')
  const entryIso = entry.date_iso || todayISO()
  if (isDateLocked(entryIso, entry.source)) throw new Error(`งวดบัญชีถึงวันที่ ${closedThrough()} ถูกปิดแล้ว — ลงรายการวันที่ ${entryIso} ไม่ได้`)

  // idempotent: ถ้ามี source+source_id เดิม ลบทิ้งก่อน
  if (entry.source && entry.source !== 'manual' && entry.source_id != null) {
    const old = db.prepare('SELECT id FROM journal_entries WHERE source=? AND source_id=?').all(entry.source, String(entry.source_id))
    for (const o of old) { db.prepare('DELETE FROM journal_lines WHERE entry_id=?').run(o.id); db.prepare('DELETE FROM journal_entries WHERE id=?').run(o.id) }
  }
  const iso = entry.date_iso || todayISO()
  const info = db.prepare('INSERT INTO journal_entries (no,date,date_iso,memo,house_code,source,source_id,by,created,ref) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run('', thFromISO(iso), iso, entry.memo || '', entry.house_code || '', entry.source || 'manual', entry.source_id != null ? String(entry.source_id) : null, entry.by || '', nowTS(), entry.ref || '')
  const id = info.lastInsertRowid
  db.prepare('UPDATE journal_entries SET no=? WHERE id=?').run(entry.no || jvNo(id), id)
  const li = db.prepare('INSERT INTO journal_lines (entry_id,account,debit,credit,memo) VALUES (?,?,?,?,?)')
  for (const l of lines) li.run(id, l.account, r2(l.debit), r2(l.credit), l.memo || '')
  // ลงสำเร็จ → เคลียร์ธงเตือน "ลงบัญชีไม่สำเร็จ" ของเอกสารนี้ (ถ้ามี)
  if (entry.source && entry.source_id != null)
    try { db.prepare('DELETE FROM journal_issues WHERE source=? AND source_id=?').run(entry.source, String(entry.source_id)) } catch { /* ignore */ }
  return id
})

// ลบรายการบัญชีอัตโนมัติของเอกสารต้นทาง (เมื่อยอด = 0 หรือยกเลิก)
// รายการที่อยู่ในงวดที่ปิดแล้ว: ห้ามลบ — ลง "กลับรายการ" (สลับเดบิต/เครดิต) วันที่วันนี้แทน
// เพื่อให้ยอดสุทธิถูกต้องโดยไม่แก้ประวัติงวดที่ปิดไปแล้ว
export function removeAutoJournal(source, source_id) {
  const old = db.prepare('SELECT * FROM journal_entries WHERE source=? AND source_id=?').all(source, String(source_id))
  for (const o of old) {
    if (isDateLocked(o.date_iso, source)) {
      const lines = db.prepare('SELECT account, debit, credit, memo FROM journal_lines WHERE entry_id=?').all(o.id)
        .map((l) => ({ account: l.account, debit: l.credit, credit: l.debit, memo: l.memo }))
      postJournal({ memo: `กลับรายการ (ต้นทางถูกยกเลิก แต่งวดบัญชีปิดแล้ว): ${o.memo || o.no}`, house_code: o.house_code, source: 'rev', source_id: `${source}:${source_id}:${o.id}`, ref: o.no, lines })
      // ตัดการอ้างอิงเอกสารต้นทาง เพื่อไม่ให้ถูกลบ/ทับตอน sync ครั้งถัดไป (ตัวรายการเดิมคงอยู่ในงวดปิด)
      db.prepare('UPDATE journal_entries SET source_id=NULL WHERE id=?').run(o.id)
    } else {
      db.prepare('DELETE FROM journal_lines WHERE entry_id=?').run(o.id)
      db.prepare('DELETE FROM journal_entries WHERE id=?').run(o.id)
    }
  }
  try { db.prepare('DELETE FROM journal_issues WHERE source=? AND source_id=?').run(source, String(source_id)) } catch { /* ignore */ }
}

// ---- ลงบัญชีอัตโนมัติจากเอกสารการเงินที่มีอยู่ ----
// วันที่ของรายการบัญชีเดิม (ถ้าเคยลงไว้แล้ว) — เวลาลงซ้ำ (แก้ไข/rebuild) วันที่ต้องไม่เลื่อนมาเป็นวันนี้
function existingEntryDate(source, source_id) {
  return db.prepare('SELECT date_iso FROM journal_entries WHERE source=? AND source_id=?').get(source, String(source_id))?.date_iso || undefined
}
// งวดงาน: ลูกค้า = รับเงิน (Dr ธนาคาร / Cr รายได้) · ช่าง = จ่าย (Dr ต้นทุนผู้รับเหมาช่วง / Cr ธนาคาร)
export function syncInstallmentJournal(inst) {
  const amt = r2(inst.paid || 0)
  if (amt <= 0) { removeAutoJournal('inst', inst.id); return }
  const memo = `งวด ${inst.no} ${inst.detail || ''} (${inst.house_code || ''})`.trim()
  const bank = defaultBank()
  const lines = inst.side === 'contractor'
    ? [{ account: '5030', debit: amt, credit: 0, memo }, { account: bank, debit: 0, credit: amt, memo }]
    : [{ account: bank, debit: amt, credit: 0, memo }, { account: '4010', debit: 0, credit: amt, memo }]
  postJournal({ date_iso: existingEntryDate('inst', inst.id), memo, house_code: inst.house_code, source: 'inst', source_id: inst.id, lines })
}
// รายจ่าย: Dr บัญชีต้นทุน/ค่าใช้จ่าย ตามหมวด / Cr เงินสด (หรือ Cr เจ้าหนี้การค้า 2010 ถ้าซื้อเครดิต — จ่ายทีหลังค่อยตัดเจ้าหนี้)
export function syncExpenseJournal(exp, opts = {}) {
  const amt = r2(exp.amount || 0)
  if (amt <= 0) { removeAutoJournal('exp', exp.id); return }
  const acc = expenseAccountFor(exp.cat || exp.category)
  const creditAcc = opts.credit ? '2010' : defaultCash()
  const memo = `${exp.item || 'รายจ่าย'} ${exp.vendor ? '· ' + exp.vendor : ''}`.trim()
  postJournal({ date_iso: exp.date_iso || existingEntryDate('exp', exp.id), memo, house_code: exp.house_code, source: 'exp', source_id: exp.id, lines: [{ account: acc, debit: amt, credit: 0, memo }, { account: creditAcc, debit: 0, credit: amt, memo: opts.credit ? memo + ' (เครดิต)' : memo }] })
}

// จ่ายเงิน (ใบสำคัญจ่าย): ถ้าจ่ายชำระ PO เครดิต → Dr เจ้าหนี้การค้า / Cr ภาษีหัก ณ ที่จ่ายค้างนำส่ง + ธนาคาร
// จ่ายทั่วไป (ค่าจ้าง/บริการ) → Dr ต้นทุนค่าแรง (ผูกบ้าน) หรือ ค่าใช้จ่ายอื่น / Cr เดียวกัน
export function syncPaymentJournal(pay) {
  const gross = r2(pay.gross || 0)
  if (gross <= 0) { removeAutoJournal('pay', pay.id); return }
  const wht = r2(pay.wht || 0)
  const net = r2(gross - wht)
  const drAcc = pay.po_id ? '2010' : (pay.house_code ? '5020' : '6090')
  const memo = `จ่ายเงิน ${pay.payee || ''}${pay.note ? ' · ' + pay.note : ''}`.trim()
  const lines = [
    { account: drAcc, debit: gross, credit: 0, memo },
    { account: '2040', debit: 0, credit: wht, memo: 'ภาษีหัก ณ ที่จ่าย' },
    { account: defaultBank(), debit: 0, credit: net, memo: 'จ่ายสุทธิ' },
  ]
  postJournal({ date_iso: pay.date_iso || existingEntryDate('pay', pay.id), memo, house_code: pay.house_code, source: 'pay', source_id: pay.id, lines })
}

// backfill จากข้อมูลเดิมทั้งหมด (idempotent) — คืน { n, errors }
// สำคัญ: รายจ่ายที่มาจาก PO เครดิต ต้องลงเป็นเจ้าหนี้ (Cr 2010) เหมือนตอนรับของ ไม่ใช่เงินสด
export function retroPostAll() {
  let n = 0
  const errors = []
  const safe = (fn, label) => { try { fn(); n++ } catch (e) { errors.push(`${label}: ${e.message}`) } }
  for (const inst of db.prepare('SELECT * FROM installments WHERE COALESCE(paid,0) > 0').all()) safe(() => syncInstallmentJournal(inst), `งวด#${inst.id}`)
  const poType = db.prepare('SELECT payment_type FROM purchase_orders WHERE id=?')
  for (const exp of db.prepare('SELECT * FROM expenses WHERE COALESCE(amount,0) > 0').all()) {
    if ((exp.status || '') === 'ปฏิเสธ') { safe(() => removeAutoJournal('exp', exp.id), `ถอนรายจ่าย#${exp.id}`); continue }
    const credit = exp.po_id ? poType.get(exp.po_id)?.payment_type === 'credit' : false
    safe(() => syncExpenseJournal(exp, { credit }), `รายจ่าย#${exp.id}`)
  }
  for (const pay of db.prepare('SELECT * FROM payments WHERE COALESCE(gross,0) > 0').all()) {
    if ((pay.status || '') === 'ปฏิเสธ') { safe(() => removeAutoJournal('pay', pay.id), `ถอนใบจ่าย#${pay.id}`); continue }
    safe(() => syncPaymentJournal(pay), `ใบจ่าย#${pay.id}`)
  }
  return { n, errors }
}

// ---- รายงาน ----
export function listAccounts() {
  return db.prepare('SELECT * FROM accounts WHERE is_active=1 ORDER BY code').all()
}
// ยอดคงเหลือรายบัญชี (งบทดลอง) — กรองช่วงวันได้ (from/to = ISO)
export function trialBalance({ from, to } = {}) {
  const where = ['e.void=0']
  const args = []
  if (from) { where.push('e.date_iso >= ?'); args.push(from) }
  if (to) { where.push('e.date_iso <= ?'); args.push(to) }
  const rows = db.prepare(`SELECT l.account, SUM(l.debit) dr, SUM(l.credit) cr
    FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id
    WHERE ${where.join(' AND ')} GROUP BY l.account`).all(...args)
  const byAcc = Object.fromEntries(rows.map((r) => [r.account, r]))
  const accts = listAccounts()
  const out = accts.map((a) => {
    const r = byAcc[a.code] || { dr: 0, cr: 0 }
    const bal = accountBalance(a.type, r.dr, r.cr)
    return { code: a.code, name: a.name, type: a.type, debit: r2(r.dr), credit: r2(r.cr), balance: bal }
  }).filter((r) => r.debit || r.credit)
  return out
}
// บัญชีแยกประเภทของบัญชีเดียว (running balance)
export function ledgerOf(account, { from, to } = {}) {
  const acc = db.prepare('SELECT * FROM accounts WHERE code=?').get(account)
  if (!acc) return { account: null, rows: [] }
  const where = ['l.account=?', 'e.void=0']
  const args = [account]
  if (from) { where.push('e.date_iso >= ?'); args.push(from) }
  if (to) { where.push('e.date_iso <= ?'); args.push(to) }
  const rows = db.prepare(`SELECT e.id entry_id, e.no, e.ref, e.date, e.date_iso, e.memo, e.house_code, l.debit, l.credit
    FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id
    WHERE ${where.join(' AND ')} ORDER BY e.date_iso, e.id`).all(...args)
  let run = 0
  const sign = DEBIT_NORMAL.has(acc.type) ? 1 : -1
  const out = rows.map((r) => { run = r2(run + sign * ((r.debit || 0) - (r.credit || 0))); return { ...r, balance: run } })
  return { account: acc, rows: out }
}
// งบกำไรขาดทุน (Income Statement) — คิดจาก รายได้ − ต้นทุน − ค่าใช้จ่าย
export function incomeStatement(range = {}) {
  const tb = trialBalance(range)
  const pick = (t) => tb.filter((r) => r.type === t)
  const sum = (t) => r2(pick(t).reduce((s, r) => s + r.balance, 0))
  const revenue = sum('revenue'), cost = sum('cost'), expense = sum('expense')
  const grossProfit = r2(revenue - cost)
  const netProfit = r2(grossProfit - expense)
  return { revenue: pick('revenue'), cost: pick('cost'), expense: pick('expense'),
    totalRevenue: revenue, totalCost: cost, totalExpense: expense, grossProfit, netProfit }
}
// งบแสดงฐานะการเงิน (Balance Sheet) ณ วันที่ (to)
export function balanceSheet({ to } = {}) {
  const range = to ? { to } : {}
  const tb = trialBalance(range)
  const assets = tb.filter((r) => r.type === 'asset')
  const liabilities = tb.filter((r) => r.type === 'liability')
  const equity = tb.filter((r) => r.type === 'equity')
  const totalAssets = r2(assets.reduce((s, r) => s + r.balance, 0))
  const totalLiabilities = r2(liabilities.reduce((s, r) => s + r.balance, 0))
  const equityBooked = r2(equity.reduce((s, r) => s + r.balance, 0))
  // กำไร(ขาดทุน)สะสมจากงบกำไรขาดทุน (ยังไม่ปิดเข้าบัญชีทุน)
  const netProfit = incomeStatement(range).netProfit
  const totalEquity = r2(equityBooked + netProfit)
  return { assets, liabilities, equity, totalAssets, totalLiabilities, equityBooked, netProfit, totalEquity,
    balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.5 }
}
// ---- เฟส 2: งบกระแสเงินสด (Cash Flow — วิธีตรง) ----
// บัญชีเงินสด/ธนาคารทั้งหมดแบบไดนามิก (รองรับบัญชีธนาคารที่ผู้ใช้เพิ่มเอง 10xx)
function cashCodes() {
  try { const c = cashAccounts().map((a) => a.code); if (c.length) return c } catch { /* ignore */ }
  return ['1010', '1020', '1030', '1031']
}
// ยอดเงินสด+ธนาคารคงเหลือรวม (ตามบัญชี) — ใช้โชว์ "เงินสดสุทธิ" หน้าแรก
export function cashBalance() {
  const codes = cashCodes()
  const r = db.prepare(`SELECT SUM(l.debit - l.credit) v FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id
    WHERE e.void=0 AND l.account IN (${codes.map(() => '?').join(',')})`).get(...codes)
  return r2(r?.v || 0)
}
// จัดหมวดกระแสเงินสดจากบัญชีคู่ (ฝั่งที่ไม่ใช่เงินสด)
function cashCategory(otherCode) {
  const c = String(otherCode || '')
  if (c.startsWith('12')) return { act: 'investing', label: 'ซื้อ/ขายสินทรัพย์ถาวร' }
  if (c === '3010' || c === '3020') return { act: 'financing', label: 'เงินทุน/เงินของเจ้าของ' }
  if (c.startsWith('4')) return { act: 'operating', label: 'รับเงินจากงานก่อสร้าง/รายได้' }
  if (c.startsWith('5')) return { act: 'operating', label: 'จ่ายต้นทุนงานก่อสร้าง' }
  if (c.startsWith('6')) return { act: 'operating', label: 'จ่ายค่าใช้จ่ายดำเนินงาน' }
  if (c === '2010' || c === '2020') return { act: 'operating', label: 'จ่ายชำระเจ้าหนี้' }
  if (c === '1140' || c === '2070') return { act: 'operating', label: 'รับ-จ่ายกับลูกค้า' }
  if (c.startsWith('2')) return { act: 'operating', label: 'ภาษี/หนี้สินหมุนเวียน' }
  return { act: 'operating', label: 'อื่นๆ' }
}
// ยอดเงินสดคงเหลือก่อนวันที่ (iso) — ยอดยกมา
function cashBalanceBefore(iso) {
  if (!iso) return 0
  const codes = cashCodes()
  const r = db.prepare(`SELECT SUM(l.debit - l.credit) v FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id
    WHERE e.void=0 AND e.date_iso < ? AND l.account IN (${codes.map(() => '?').join(',')})`).get(iso, ...codes)
  return r2(r?.v || 0)
}
export function cashFlow({ from, to } = {}) {
  const where = ['e.void=0']
  const args = []
  if (from) { where.push('e.date_iso >= ?'); args.push(from) }
  if (to) { where.push('e.date_iso <= ?'); args.push(to) }
  // ทุก entry ที่แตะเงินสด: หายอดเงินสดสุทธิของ entry + ฝั่งตรงข้ามที่ใหญ่สุดเพื่อจัดหมวด
  const codes = cashCodes()
  const entries = db.prepare(`SELECT DISTINCT e.id FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id
    WHERE ${where.join(' AND ')} AND l.account IN (${codes.map(() => '?').join(',')})`).all(...args, ...codes)
  const buckets = {} // key act|label -> amount
  const lineStmt = db.prepare('SELECT account, debit, credit FROM journal_lines WHERE entry_id=?')
  for (const { id } of entries) {
    const ls = lineStmt.all(id)
    const cashDelta = r2(ls.filter((l) => codes.includes(l.account)).reduce((s, l) => s + (l.debit - l.credit), 0))
    if (cashDelta === 0) continue
    const others = ls.filter((l) => !codes.includes(l.account))
    const main = others.sort((a, b) => Math.abs(b.debit - b.credit) - Math.abs(a.debit - a.credit))[0]
    const cat = cashCategory(main?.account)
    const key = cat.act + '|' + cat.label
    buckets[key] = r2((buckets[key] || 0) + cashDelta)
  }
  const mk = (act) => Object.entries(buckets).filter(([k]) => k.startsWith(act + '|')).map(([k, v]) => ({ label: k.split('|')[1], amount: v }))
  const operating = mk('operating'), investing = mk('investing'), financing = mk('financing')
  const sum = (arr) => r2(arr.reduce((s, r) => s + r.amount, 0))
  const netOperating = sum(operating), netInvesting = sum(investing), netFinancing = sum(financing)
  const netChange = r2(netOperating + netInvesting + netFinancing)
  const opening = cashBalanceBefore(from)
  return { opening, operating, investing, financing, netOperating, netInvesting, netFinancing, netChange, closing: r2(opening + netChange) }
}

// ---- เฟส 2: งบกำไรขาดทุนรายโครงการ (per-house P&L) ----
export function projectPnl({ from, to } = {}) {
  const where = ['e.void=0', "a.type IN ('revenue','cost','expense')"]
  const args = []
  if (from) { where.push('e.date_iso >= ?'); args.push(from) }
  if (to) { where.push('e.date_iso <= ?'); args.push(to) }
  const rows = db.prepare(`SELECT e.house_code, a.type, SUM(l.debit) dr, SUM(l.credit) cr
    FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id JOIN accounts a ON a.code=l.account
    WHERE ${where.join(' AND ')} GROUP BY e.house_code, a.type`).all(...args)
  const houses = {}
  for (const r of rows) {
    const hc = r.house_code || '(ไม่ระบุบ้าน)'
    houses[hc] = houses[hc] || { house_code: r.house_code || '', revenue: 0, cost: 0, expense: 0 }
    const val = r.type === 'revenue' ? r2(r.cr - r.dr) : r2(r.dr - r.cr)
    houses[hc][r.type] = val
  }
  const nameOf = (code) => code ? (db.prepare('SELECT name FROM houses WHERE code=?').get(code)?.name || code) : '(ไม่ระบุบ้าน)'
  return Object.values(houses).map((h) => ({ ...h, house_name: nameOf(h.house_code), profit: r2(h.revenue - h.cost - h.expense) }))
    .sort((a, b) => b.revenue - a.revenue)
}

// สมุดรายวัน (list)
export function listJournal({ from, to, source, limit = 500 } = {}) {
  const where = []
  const args = []
  if (from) { where.push('e.date_iso >= ?'); args.push(from) }
  if (to) { where.push('e.date_iso <= ?'); args.push(to) }
  if (source) { where.push('e.source = ?'); args.push(source) }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : ''
  const entries = db.prepare(`SELECT * FROM journal_entries e ${w} ORDER BY e.date_iso DESC, e.id DESC LIMIT ?`).all(...args, limit)
  const li = db.prepare('SELECT jl.*, a.name AS account_name FROM journal_lines jl LEFT JOIN accounts a ON a.code=jl.account WHERE jl.entry_id=? ORDER BY jl.id')
  return entries.map((e) => ({ ...e, lines: li.all(e.id) }))
}

// ---- เฟส 3: กระทบยอดธนาคาร (Bank Reconciliation) ----
// รายการเดินบัญชีของบัญชีเงินสด/ธนาคารเดียว พร้อมสถานะกระทบยอด
export function reconcileLines(account) {
  const acc = db.prepare('SELECT * FROM accounts WHERE code=?').get(account)
  if (!acc) return { account: null, rows: [], bookBalance: 0, clearedBalance: 0, unclearedCount: 0 }
  const rows = db.prepare(`SELECT l.id, e.no, e.date, e.date_iso, e.memo, e.house_code, l.debit, l.credit, COALESCE(l.reconciled,0) reconciled
    FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id
    WHERE l.account=? AND e.void=0 ORDER BY e.date_iso, e.id`).all(account)
  const bookBalance = r2(rows.reduce((s, r) => s + (r.debit - r.credit), 0))
  const clearedBalance = r2(rows.filter((r) => r.reconciled).reduce((s, r) => s + (r.debit - r.credit), 0))
  const unclearedCount = rows.filter((r) => !r.reconciled).length
  return { account: acc, rows, bookBalance, clearedBalance, unclearedCount }
}
export const setReconciled = db.transaction((ids, val) => {
  const up = db.prepare('UPDATE journal_lines SET reconciled=? WHERE id=?')
  for (const id of ids) up.run(val ? 1 : 0, id)
  return ids.length
})

// ---- เฟส 3: ลูกหนี้/เจ้าหนี้คงค้าง + อายุหนี้ (AR/AP Aging) ----
function todayISO2() { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
function daysBetween(aIso, bIso) { const a = new Date(aIso + 'T00:00:00'), b = new Date(bIso + 'T00:00:00'); if (isNaN(a) || isNaN(b)) return null; return Math.round((b - a) / 86400000) }
function bucketOf(dueIso) {
  if (!dueIso) return 'nodue'
  const od = daysBetween(dueIso, todayISO2())
  if (od == null) return 'nodue'
  if (od <= 0) return 'current'   // ยังไม่ถึงกำหนด
  if (od <= 30) return 'd30'
  if (od <= 60) return 'd60'
  if (od <= 90) return 'd90'
  return 'd90plus'
}
const EMPTY_BUCKETS = () => ({ current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, nodue: 0 })
// side: 'customer' = ลูกหนี้(AR), 'contractor' = เจ้าหนี้(AP)
function agingFor(side) {
  const rows = db.prepare(`SELECT i.*, h.name AS house_name, h.customer FROM installments i
    LEFT JOIN houses h ON h.code=i.house_code WHERE i.side=? AND COALESCE(i.paid,0) < i.amount`).all(side)
  const items = rows.map((r) => {
    const outstanding = r2((r.amount || 0) - (r.paid || 0))
    return { id: r.id, house_code: r.house_code, house_name: r.house_name || r.house_code, party: side === 'customer' ? (r.customer || r.house_name || '') : (r.contractor || ''), no: r.no, detail: r.detail, due: r.due, due_iso: r.due_iso, amount: r.amount, paid: r.paid || 0, outstanding, bucket: bucketOf(r.due_iso), overdue: r.status === 'เลยกำหนด' || ['d30', 'd60', 'd90', 'd90plus'].includes(bucketOf(r.due_iso)) }
  }).filter((r) => r.outstanding > 0)
  const totals = EMPTY_BUCKETS()
  let total = 0
  for (const it of items) { totals[it.bucket] = r2(totals[it.bucket] + it.outstanding); total = r2(total + it.outstanding) }
  return { items, totals, total }
}
export function arAging() { return agingFor('customer') }
export function apAging() { return agingFor('contractor') }

// ========================= เฟส 4 =========================
// ---- ปิดงวด (period lock) ----
export function closedThrough() { return getSetting('acct_closed_through', '') }
export function setClosedThrough(iso) {
  const up = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
  up.run('acct_closed_through', iso ? String(iso) : '')
}
// ตรวจว่าปิดงวดแล้วหรือยัง (ใช้กันการลงบัญชีย้อนเข้าไปในงวดที่ปิด)
export function isDateLocked(iso, source) {
  if (source === 'opening' || source === 'yearclose') return false
  const c = closedThrough()
  return c && iso && iso <= c
}

// ---- สินทรัพย์ถาวร + ค่าเสื่อมราคา (เส้นตรง) ----
function monthsElapsed(fromIso, toIso) {
  const a = new Date(fromIso + 'T00:00:00'), b = new Date(toIso + 'T00:00:00')
  if (isNaN(a) || isNaN(b) || b < a) return 0
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  if (b.getDate() >= a.getDate()) m += 0; // นับเดือนที่ครบแล้ว
  return Math.max(0, m)
}
export function depreciableBase(a) { return r2((a.cost || 0) - (a.salvage || 0)) }
export function accumulatedDep(a, asOfIso) {
  const base = depreciableBase(a)
  const lifeM = Math.max(1, Math.round((a.life_years || 1) * 12))
  const monthly = r2(base / lifeM)
  const elapsed = Math.min(lifeM, monthsElapsed(a.acquire_date, asOfIso))
  // เดือนสุดท้ายปัดเก็บส่วนที่เหลือให้ครบพอดี
  return elapsed >= lifeM ? base : r2(monthly * elapsed)
}
export function listAssets() {
  const asOf = todayISO()
  return db.prepare('SELECT * FROM fixed_assets ORDER BY id DESC').all().map((a) => {
    const acc = a.disposed ? depreciableBase(a) : accumulatedDep(a, asOf)
    return { ...a, base: depreciableBase(a), accumulated: acc, bookValue: r2((a.cost || 0) - acc), monthly: r2(depreciableBase(a) / Math.max(1, Math.round((a.life_years || 1) * 12))) }
  })
}
export function addAsset(a, by) {
  const info = db.prepare(`INSERT INTO fixed_assets (code,name,category,acquire_date,cost,salvage,life_years,method,house_code,note,by,created)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(a.code || '', a.name || '', a.category || '', a.acquire_date || todayISO(),
    Number(a.cost) || 0, Number(a.salvage) || 0, Number(a.life_years) || 5, a.method || 'straight', a.house_code || '', a.note || '', by || '', nowTS())
  const id = info.lastInsertRowid
  // ลงบัญชีซื้อสินทรัพย์: Dr อาคารและอุปกรณ์ / Cr ธนาคาร
  const cost = r2(Number(a.cost) || 0)
  if (cost > 0) postJournal({ date_iso: a.acquire_date || undefined, memo: `ซื้อสินทรัพย์ ${a.name || ''}`, house_code: a.house_code, source: 'asset', source_id: id, lines: [{ account: '1210', debit: cost, credit: 0 }, { account: defaultBank(), debit: 0, credit: cost }] })
  return db.prepare('SELECT * FROM fixed_assets WHERE id=?').get(id)
}
export function disposeAsset(id, date) {
  const a = db.prepare('SELECT * FROM fixed_assets WHERE id=?').get(id)
  if (!a) throw new Error('ไม่พบสินทรัพย์')
  db.prepare('UPDATE fixed_assets SET disposed=1, dispose_date=? WHERE id=?').run(date || todayISO(), id)
  return true
}
// ลงค่าเสื่อมสะสม ณ วันที่ (ปรับปรุงยอดสะสมของแต่ละสินทรัพย์ให้ตรง — idempotent)
export function runDepreciation(asOfIso, by) {
  const asOf = asOfIso || todayISO()
  let posted = 0, total = 0
  for (const a of db.prepare('SELECT * FROM fixed_assets').all()) {
    const acc = a.disposed ? depreciableBase(a) : accumulatedDep(a, asOf)
    if (acc <= 0) { removeAutoJournal('dep', a.id); continue }
    postJournal({ date_iso: asOf, memo: `ค่าเสื่อมราคาสะสม ${a.name || ''}`, house_code: a.house_code, source: 'dep', source_id: a.id, by,
      lines: [{ account: '6050', debit: acc, credit: 0 }, { account: '1220', debit: 0, credit: acc }] })
    posted++; total = r2(total + acc)
  }
  return { assets: posted, totalDepreciation: total, asOf }
}

// ---- ยอดยกมา (Opening balances) ----
// balances = [{account, amount}] amount = ยอดตามธรรมชาติของบัญชี (บวก) — ส่วนต่างลง กำไรสะสม 3020
export function postOpening(balances, dateIso, by) {
  const accts = Object.fromEntries(listAccounts().map((a) => [a.code, a]))
  const lines = []
  let dr = 0, cr = 0
  for (const b of balances || []) {
    const acc = accts[b.account]; const amt = r2(Number(b.amount) || 0)
    if (!acc || amt === 0) continue
    if (DEBIT_NORMAL.has(acc.type)) { lines.push({ account: b.account, debit: amt, credit: 0, memo: 'ยอดยกมา' }); dr = r2(dr + amt) }
    else { lines.push({ account: b.account, debit: 0, credit: amt, memo: 'ยอดยกมา' }); cr = r2(cr + amt) }
  }
  if (!lines.length) throw new Error('ไม่มียอดยกมาให้บันทึก')
  // ส่วนต่างลงกำไรสะสม (3020) เพื่อให้สมดุล
  const diff = r2(dr - cr)
  if (diff > 0) lines.push({ account: '3020', debit: 0, credit: diff, memo: 'ยอดยกมา (ผลต่างเข้ากำไรสะสม)' })
  else if (diff < 0) lines.push({ account: '3020', debit: -diff, credit: 0, memo: 'ยอดยกมา (ผลต่างเข้ากำไรสะสม)' })
  return postJournal({ date_iso: dateIso || todayISO(), memo: 'ยอดยกมา (Opening Balances)', source: 'opening', source_id: 'opening', by, lines })
}

// ---- ปิดปี (year-end closing) — ปิด รายได้/ต้นทุน/ค่าใช้จ่าย เข้ากำไรสะสม ----
export function closeYear(fyEndIso, by) {
  const tb = trialBalance({ to: fyEndIso })
  const pl = tb.filter((r) => ['revenue', 'cost', 'expense'].includes(r.type) && Math.abs(r.balance) > 0.005)
  if (!pl.length) throw new Error('ไม่มียอดรายได้/ค่าใช้จ่ายให้ปิด')
  const lines = []
  let net = 0
  for (const r of pl) {
    if (r.type === 'revenue') { lines.push({ account: r.code, debit: r.balance, credit: 0, memo: 'ปิดบัญชีสิ้นปี' }); net = r2(net + r.balance) }
    else { lines.push({ account: r.code, debit: 0, credit: r.balance, memo: 'ปิดบัญชีสิ้นปี' }); net = r2(net - r.balance) }
  }
  // net = กำไรสุทธิ → เข้ากำไรสะสม (3020)
  if (net > 0) lines.push({ account: '3020', debit: 0, credit: net, memo: 'กำไรสุทธิเข้ากำไรสะสม' })
  else lines.push({ account: '3020', debit: -net, credit: 0, memo: 'ขาดทุนสุทธิเข้ากำไรสะสม' })
  const yr = String(fyEndIso).slice(0, 4)
  return postJournal({ date_iso: fyEndIso, memo: `ปิดบัญชีสิ้นปี ${Number(yr) + 543}`, source: 'yearclose', source_id: yr, by, lines })
}

// ---- สรุปภาษี: ภ.พ.30 (VAT) / หัก ณ ที่จ่าย / ภ.ง.ด.50 (ประมาณการ) ----
export function taxSummary(range = {}) {
  const { from, to } = range
  // กรองตามช่วงเวลา (คอลัมน์ date_iso) — ไม่ระบุช่วง = ทั้งหมด · แถวเก่าที่ไม่มี date_iso จะติดมาเฉพาะตอนดูทั้งหมด
  const rangeWhere = (col) => {
    const w = []; const a = []
    if (from) { w.push(`${col} >= ?`); a.push(from) }
    if (to) { w.push(`${col} <= ?`); a.push(to) }
    return { sql: w.length ? ' AND ' + w.join(' AND ') : '', args: a }
  }
  const rs = rangeWhere('date_iso')
  // ภาษีขาย: นับ ใบแจ้งหนี้ + ใบเสร็จที่ออกเดี่ยวๆ เท่านั้น — ใบเสนอราคาไม่ใช่การขาย และ
  // ใบเสร็จที่ออกต่อจากใบแจ้งหนี้ (ref ชี้ใบแจ้งหนี้) คือการขายเดียวกัน ห้ามนับ VAT ซ้ำ
  const invNos = new Set(db.prepare("SELECT no FROM sales_docs WHERE type='invoice'").all().map((r) => r.no))
  const salesRows = db.prepare(`SELECT type, vat, ref FROM sales_docs WHERE type != 'quote'${rs.sql}`).all(...rs.args)
  const outputVat = r2(salesRows.reduce((sm, r) => sm + ((r.type === 'receipt' && r.ref && invNos.has(r.ref)) ? 0 : (Number(r.vat) || 0)), 0))
  // ภาษีซื้อจาก "ใบกำกับภาษีจริง" ที่กรอกไว้ต่อใบ (เลิกเดา 7/107 จากรายจ่ายทุกใบ — บางร้านไม่จด VAT)
  const inRow = db.prepare(`SELECT COALESCE(SUM(vat_amount),0) v, COUNT(CASE WHEN COALESCE(vat_amount,0) > 0 THEN 1 END) n FROM expenses WHERE COALESCE(status,'') != 'ปฏิเสธ'${rs.sql}`).get(...rs.args)
  const inputVat = r2(inRow.v)
  const inputVatDocs = inRow.n
  const vatPayable = r2(outputVat - inputVat)
  const wht = r2(db.prepare(`SELECT COALESCE(SUM(wht),0) w FROM payments WHERE COALESCE(status,'') != 'ปฏิเสธ'${rs.sql}`).get(...rs.args).w)
  const whtByType = db.prepare(`SELECT type, COALESCE(SUM(gross),0) gross, COALESCE(SUM(wht),0) wht, COUNT(*) n FROM payments WHERE COALESCE(status,'') != 'ปฏิเสธ'${rs.sql} GROUP BY type`).all(...rs.args)
  // ภ.ง.ด.50 ประมาณการภาษีเงินได้นิติบุคคล จากกำไรสุทธิทางบัญชี (อัตรา SME)
  const netProfit = incomeStatement(range).netProfit
  const corpTax = estimateCorpTax(netProfit)
  return { outputVat, inputVat, inputVatDocs, vatPayable, wht, whtByType, netProfit, corpTax }
}
// อัตรา SME: 0-300,000 ยกเว้น · 300,001-3,000,000 = 15% · เกิน 3,000,000 = 20%
export function estimateCorpTax(netProfit) {
  const p = Math.max(0, r2(netProfit))
  if (p <= 300000) return 0
  if (p <= 3000000) return r2((p - 300000) * 0.15)
  return r2((3000000 - 300000) * 0.15 + (p - 3000000) * 0.20)
}

// ========================= เงินสดย่อย (Petty Cash — imprest) =========================
// มี 2 กองแยกกัน แต่ละกองมีบัญชี/วงเงิน (float) ของตัวเอง ปรับเพิ่ม-ลดได้อิสระ · จ่ายแล้วเติมกลับให้เต็มวงเงิน
//   petty = เงินสดย่อยทั่วไป (1030)  ·  fuel = ค่าน้ำมันรถ (1031) แยกออกมาเพื่อคุมลิมิตน้ำมันต่างหาก
export const PETTY_FUNDS = {
  petty: { key: 'petty', account: PETTY_ACCOUNT, label: 'เงินสดย่อย', floatKey: 'petty_float', defaultFloat: 10000, source: 'petty', topupSource: 'petty_topup' },
  fuel: { key: 'fuel', account: FUEL_ACCOUNT, label: 'ค่าน้ำมันรถ', floatKey: 'fuel_float', defaultFloat: 5000, source: 'fuel', topupSource: 'fuel_topup' },
}
export function pettyFund(key) {
  const f = PETTY_FUNDS[String(key || 'petty')]
  if (!f) throw new Error('ไม่รู้จักกองเงินสดย่อย: ' + key)
  return f
}
export function pettyFloat(fund = 'petty') { const f = pettyFund(fund); return Number(getSetting(f.floatKey, String(f.defaultFloat))) || f.defaultFloat }
export function setPettyFloat(n, fund = 'petty') { setSettingRaw(pettyFund(fund).floatKey, Math.max(0, Number(n) || 0)) }
// ชื่อบ้านจากรหัส (ใช้แสดงในรายการเงินสดย่อย) — ไม่พบ = คืนรหัสเดิม
function houseNameOf(code) {
  if (!code) return ''
  try { return db.prepare('SELECT name FROM houses WHERE code=?').get(code)?.name || code } catch { return code }
}
const withHouseName = (r) => ({ ...r, house_code: r.house_code || '', house_name: houseNameOf(r.house_code) })
export function pettyState(fund = 'petty') {
  const f = pettyFund(fund)
  const float = pettyFloat(fund)
  const gl = ledgerOf(f.account)
  const balance = gl.rows.length ? gl.rows[gl.rows.length - 1].balance : 0
  return { fund: f.key, label: f.label, account: f.account, float, balance: r2(balance), toReplenish: r2(Math.max(0, float - balance)), rows: gl.rows.slice(-60).reverse().map(withHouseName) }
}
// สรุปทุกกองในหน้าเดียว (ใช้โชว์ยอดรวม/แจ้งเตือนใกล้หมด)
export function pettyOverview() {
  return Object.keys(PETTY_FUNDS).map((k) => { const s = pettyState(k); return { fund: s.fund, label: s.label, float: s.float, balance: s.balance, toReplenish: s.toReplenish } })
}
// บันทึกจ่ายค่าใช้จ่ายจากกองเงินสดย่อย: Dr ค่าใช้จ่าย(ตามหมวด) / Cr บัญชีของกอง
// ผูกบ้านได้ (house_code) เช่น โฟร์แมนเบิกไปซื้อของเล็กน้อยให้บ้านหลังนั้น → ต้นทุนไปรวมที่บ้าน; ไม่ระบุ = ส่วนกลางบริษัท
// กองน้ำมัน: ระบุทะเบียนรถ (vehicle) ได้ จะต่อท้ายรายการให้
export function pettyExpense({ date_iso, cat, item, amount, ref, by, house_code, fund, vehicle }) {
  const f = pettyFund(fund)
  const amt = r2(Number(String(amount).replace(/,/g, '')) || 0)
  if (amt <= 0) throw new Error('จำนวนเงินไม่ถูกต้อง')
  const hc = String(house_code || '').trim()
  if (hc && !db.prepare('SELECT code FROM houses WHERE code=?').get(hc)) throw new Error('ไม่พบบ้าน ' + hc)
  const acc = f.key === 'fuel' && !cat ? '6030' : expenseAccountFor(cat || (f.key === 'fuel' ? 'ค่าน้ำมัน' : ''))
  const veh = String(vehicle || '').trim()
  const memo = `${item || cat || (f.key === 'fuel' ? 'ค่าน้ำมันรถ' : 'ค่าใช้จ่าย')}${veh ? ' · ทะเบียน ' + veh : ''}`.trim()
  return postJournal({ date_iso, memo, ref: ref || '', house_code: hc, source: f.source, by, lines: [{ account: acc, debit: amt, credit: 0, memo }, { account: f.account, debit: 0, credit: amt, memo }] })
}
// เติมกองให้เต็มวงเงิน: Dr บัญชีของกอง / Cr ธนาคาร (ถ้าไม่ระบุจำนวน = เติมให้เต็ม float)
export function pettyTopup({ date_iso, amount, from, ref, note, by, fund }) {
  const f = pettyFund(fund)
  const st = pettyState(f.key)
  const amt = amount != null && amount !== '' ? r2(Number(String(amount).replace(/,/g, '')) || 0) : st.toReplenish
  if (amt <= 0) throw new Error(`${f.label}เต็มวงเงินอยู่แล้ว ไม่ต้องเติม`)
  const bank = from || defaultBank()
  postJournal({ date_iso, memo: note || `เติม/ทดแทน${f.label}ให้เต็มวงเงิน (${st.float.toLocaleString('en-US')})`, ref: ref || '', source: f.topupSource, by, lines: [{ account: f.account, debit: amt, credit: 0 }, { account: bank, debit: 0, credit: amt }] })
  return { amount: amt, float: st.float, fund: f.key }
}
// ยอดคงเหลือของบัญชีก่อนวันที่ (สินทรัพย์ = เดบิต − เครดิต)
function accountBalanceBefore(account, iso) {
  if (!iso) return 0
  const r = db.prepare('SELECT SUM(l.debit - l.credit) v FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE e.void=0 AND e.date_iso < ? AND l.account=?').get(iso, account)
  return r2(r?.v || 0)
}
// ใบสรุปรายจ่ายเงินสดย่อยตามรอบวันที่ (ยอดยกมา → เข้า/ออก → คงเหลือ → ต้องเติมให้เต็ม)
export function pettyStatement({ from, to, fund } = {}) {
  const f = pettyFund(fund)
  const float = pettyFloat(f.key)
  const opening = accountBalanceBefore(f.account, from)
  const gl = ledgerOf(f.account, { from, to })
  let bal = opening, seq = 0
  const rows = gl.rows.map((r) => {
    const inAmt = r2(r.debit || 0), outAmt = r2(r.credit || 0)
    bal = r2(bal + inAmt - outAmt)
    return { date: r.date, date_iso: r.date_iso || '', ref: r.ref || '', memo: r.memo, house_code: r.house_code || '', house_name: houseNameOf(r.house_code), in: inAmt, out: outAmt, balance: bal, seq: outAmt > 0 ? String(++seq).padStart(3, '0') : '' }
  })
  const totalOut = r2(rows.reduce((s, r) => s + r.out, 0))
  const totalInMoves = r2(rows.reduce((s, r) => s + r.in, 0))
  const closing = r2(opening + totalInMoves - totalOut)
  return { fund: f.key, label: f.label, float, from, to, opening, rows, totalOut, totalInMoves, totalIn: r2(opening + totalInMoves), closing, toReplenish: r2(Math.max(0, float - closing)) }
}
