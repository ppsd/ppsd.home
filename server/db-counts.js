// เปรียบเทียบไฟล์ฐานข้อมูลหลายไฟล์ — นับจำนวนแถวของตารางหลัก + รายการล่าสุด (ใช้หาว่าไฟล์ไหนมีข้อมูลครบกว่า)
// วิธีใช้ (ในโฟลเดอร์โปรแกรม): node server/db-counts.js <ไฟล์1.sqlite> [ไฟล์2.sqlite ...]
// ไม่แก้ไขไฟล์ใดๆ (เปิดแบบอ่านอย่างเดียว)
import Database from 'better-sqlite3'

const files = process.argv.slice(2)
if (!files.length) { console.log('ใช้: node server/db-counts.js <ไฟล์.sqlite> [ไฟล์2.sqlite ...]'); process.exit(1) }

const TABLES = [
  ['houses', null], ['installments', null], ['customers', null], ['employees', null],
  ['leaves', 'start_date'], ['ot', 'date'], ['attendance', 'date'], ['payroll_runs', 'period'],
  ['purchase_requests', 'date'], ['purchase_orders', 'date'], ['goods_receipts', null],
  ['expenses', 'date'], ['payments', 'date'], ['petty_expenses', 'date_iso'], ['journal_entries', 'date_iso'],
  ['sales_docs', 'date'], ['work_orders', 'issued_date'], ['qc_inspections', null], ['issues', null],
  ['files', 'uploaded'], ['audit', 'ts'],
]

const rows = {}
for (const f of files) {
  let db
  try { db = new Database(f, { readonly: true, fileMustExist: true }) } catch (e) { console.log(`เปิดไม่ได้: ${f} (${e.message})`); continue }
  const exists = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name))
  for (const [t, dateCol] of TABLES) {
    if (!exists.has(t)) { (rows[t] ||= []).push('-'); continue }
    const c = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c
    let last = ''
    if (dateCol) { try { last = db.prepare(`SELECT MAX(${dateCol}) m FROM ${t}`).get().m || '' } catch { /* ignore */ } }
    (rows[t] ||= []).push(last ? `${c} (ล่าสุด ${String(last).slice(0, 16)})` : String(c))
  }
  db.close()
}

const w = 20
console.log('ตาราง'.padEnd(w) + files.map((f, i) => `[${i + 1}] ${f}`).join('  |  '))
for (const [t] of TABLES) if (rows[t]) console.log(t.padEnd(w) + rows[t].map((v, i) => `[${i + 1}] ${v}`).join('  |  '))
