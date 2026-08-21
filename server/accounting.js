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
export function defaultBank() { return getSetting('acct_bank_default', '1020') }
export function defaultCash() { return getSetting('acct_cash_default', '1010') }
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

  // idempotent: ถ้ามี source+source_id เดิม ลบทิ้งก่อน
  if (entry.source && entry.source !== 'manual' && entry.source_id != null) {
    const old = db.prepare('SELECT id FROM journal_entries WHERE source=? AND source_id=?').all(entry.source, String(entry.source_id))
    for (const o of old) { db.prepare('DELETE FROM journal_lines WHERE entry_id=?').run(o.id); db.prepare('DELETE FROM journal_entries WHERE id=?').run(o.id) }
  }
  const iso = entry.date_iso || todayISO()
  const info = db.prepare('INSERT INTO journal_entries (no,date,date_iso,memo,house_code,source,source_id,by,created) VALUES (?,?,?,?,?,?,?,?,?)')
    .run('', thFromISO(iso), iso, entry.memo || '', entry.house_code || '', entry.source || 'manual', entry.source_id != null ? String(entry.source_id) : null, entry.by || '', nowTS())
  const id = info.lastInsertRowid
  db.prepare('UPDATE journal_entries SET no=? WHERE id=?').run(entry.no || jvNo(id), id)
  const li = db.prepare('INSERT INTO journal_lines (entry_id,account,debit,credit,memo) VALUES (?,?,?,?,?)')
  for (const l of lines) li.run(id, l.account, r2(l.debit), r2(l.credit), l.memo || '')
  return id
})

// ลบรายการบัญชีอัตโนมัติของเอกสารต้นทาง (เมื่อยอด = 0 หรือยกเลิก)
export function removeAutoJournal(source, source_id) {
  const old = db.prepare('SELECT id FROM journal_entries WHERE source=? AND source_id=?').all(source, String(source_id))
  for (const o of old) { db.prepare('DELETE FROM journal_lines WHERE entry_id=?').run(o.id); db.prepare('DELETE FROM journal_entries WHERE id=?').run(o.id) }
}

// ---- ลงบัญชีอัตโนมัติจากเอกสารการเงินที่มีอยู่ ----
// งวดงาน: ลูกค้า = รับเงิน (Dr ธนาคาร / Cr รายได้) · ช่าง = จ่าย (Dr ต้นทุนผู้รับเหมาช่วง / Cr ธนาคาร)
export function syncInstallmentJournal(inst) {
  const amt = r2(inst.paid || 0)
  if (amt <= 0) { removeAutoJournal('inst', inst.id); return }
  const memo = `งวด ${inst.no} ${inst.detail || ''} (${inst.house_code || ''})`.trim()
  const bank = defaultBank()
  const lines = inst.side === 'contractor'
    ? [{ account: '5030', debit: amt, credit: 0, memo }, { account: bank, debit: 0, credit: amt, memo }]
    : [{ account: bank, debit: amt, credit: 0, memo }, { account: '4010', debit: 0, credit: amt, memo }]
  postJournal({ memo, house_code: inst.house_code, source: 'inst', source_id: inst.id, lines })
}
// รายจ่าย: Dr บัญชีต้นทุน/ค่าใช้จ่าย ตามหมวด / Cr เงินสด
export function syncExpenseJournal(exp) {
  const amt = r2(exp.amount || 0)
  if (amt <= 0) { removeAutoJournal('exp', exp.id); return }
  const acc = expenseAccountFor(exp.cat || exp.category)
  const memo = `${exp.item || 'รายจ่าย'} ${exp.vendor ? '· ' + exp.vendor : ''}`.trim()
  postJournal({ date_iso: exp.date_iso || undefined, memo, house_code: exp.house_code, source: 'exp', source_id: exp.id, lines: [{ account: acc, debit: amt, credit: 0, memo }, { account: defaultCash(), debit: 0, credit: amt, memo }] })
}

// backfill จากข้อมูลเดิมทั้งหมด (idempotent) — คืนจำนวนรายการที่ลง
export function retroPostAll() {
  let n = 0
  for (const inst of db.prepare('SELECT * FROM installments WHERE COALESCE(paid,0) > 0').all()) { syncInstallmentJournal(inst); n++ }
  for (const exp of db.prepare('SELECT * FROM expenses WHERE COALESCE(amount,0) > 0').all()) { syncExpenseJournal(exp); n++ }
  return n
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
  const rows = db.prepare(`SELECT e.id entry_id, e.no, e.date, e.date_iso, e.memo, e.house_code, l.debit, l.credit
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
const CASH_ACCOUNTS = ['1010', '1020', '1030']
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
  const r = db.prepare(`SELECT SUM(l.debit - l.credit) v FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id
    WHERE e.void=0 AND e.date_iso < ? AND l.account IN (${CASH_ACCOUNTS.map(() => '?').join(',')})`).get(iso, ...CASH_ACCOUNTS)
  return r2(r?.v || 0)
}
export function cashFlow({ from, to } = {}) {
  const where = ['e.void=0']
  const args = []
  if (from) { where.push('e.date_iso >= ?'); args.push(from) }
  if (to) { where.push('e.date_iso <= ?'); args.push(to) }
  // ทุก entry ที่แตะเงินสด: หายอดเงินสดสุทธิของ entry + ฝั่งตรงข้ามที่ใหญ่สุดเพื่อจัดหมวด
  const entries = db.prepare(`SELECT DISTINCT e.id FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id
    WHERE ${where.join(' AND ')} AND l.account IN (${CASH_ACCOUNTS.map(() => '?').join(',')})`).all(...args, ...CASH_ACCOUNTS)
  const buckets = {} // key act|label -> amount
  const lineStmt = db.prepare('SELECT account, debit, credit FROM journal_lines WHERE entry_id=?')
  for (const { id } of entries) {
    const ls = lineStmt.all(id)
    const cashDelta = r2(ls.filter((l) => CASH_ACCOUNTS.includes(l.account)).reduce((s, l) => s + (l.debit - l.credit), 0))
    if (cashDelta === 0) continue
    const others = ls.filter((l) => !CASH_ACCOUNTS.includes(l.account))
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
