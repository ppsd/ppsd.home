// e-Filing exporters — generate the flat text/CSV files used to *upload* into
// the Revenue Department (RD) and Social Security (SSO) e-filing portals.
// These produce standard-shaped files; they do NOT submit on the user's behalf
// (that requires the agency's own credentials and portal).
import { db } from './db.js'

const TAB = '\t'
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

// the tax period the files cover: the latest *closed* payroll period if any,
// otherwise the current calendar month — so the numbers line up with payroll.
function activePeriod() {
  const latest = db.prepare('SELECT period FROM payroll_runs ORDER BY period DESC LIMIT 1').get()
  if (latest) return latest.period
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function parts(period) {
  const [yy, mm] = period.split('-').map(Number)
  const be = yy + 543
  return { yy, mm, be, label: `${TH_MONTHS[mm - 1]} ${be}`, fileTag: `${be}-${String(mm).padStart(2, '0')}` }
}
// due date = given day of the *next* month, in พ.ศ.
function due(period, day) {
  let [yy, mm] = period.split('-').map(Number)
  mm += 1
  if (mm > 12) { mm = 1; yy += 1 }
  return `ภายใน ${day} ${TH_MONTHS[mm - 1]} ${yy + 543}`
}
// payroll rows for the period — the locked snapshot if the period is closed
// (so e-filing matches exactly what was paid), otherwise the live employees.
function payrollRows(period) {
  const run = db.prepare('SELECT data FROM payroll_runs WHERE period=?').get(period)
  if (run) { try { return JSON.parse(run.data) } catch { /* fall through */ } }
  return db.prepare("SELECT * FROM employees WHERE status != 'ลาออก' ORDER BY id").all()
}

// ภงด.1 — ใบแนบภาษีหัก ณ ที่จ่ายเงินเดือน (รูปแบบเต็มตามกรมสรรพากร)
// คอลัมน์: ลำดับ · เลขผู้เสียภาษี(13) · คำนำหน้า · ชื่อ-สกุล · วันที่จ่าย · ประเภทเงินได้ · เงินได้ · ภาษีหัก · เงื่อนไข
export function pnd1() {
  const p = activePeriod(), pp = parts(p)
  // วันที่จ่าย = วันสิ้นเดือนของงวดภาษี (จ่ายเงินเดือนสิ้นเดือน)
  const lastDay = new Date(pp.yy, pp.mm, 0).getDate()
  const payDate = `${String(lastDay).padStart(2, '0')}/${String(pp.mm).padStart(2, '0')}/${pp.be}`
  const rows = payrollRows(p).filter((e) => (e.tax || 0) > 0)
  const header = ['ลำดับ', 'เลขประจำตัวผู้เสียภาษี', 'คำนำหน้า', 'ชื่อ-สกุล', 'วันเดือนปีที่จ่าย', 'ประเภทเงินได้', 'จำนวนเงินได้', 'ภาษีที่หัก', 'เงื่อนไข'].join(TAB)
  const lines = rows.map((e, i) =>
    // ประเภทเงินได้ 1 = เงินเดือน ม.40(1); เงื่อนไข 1 = หัก ณ ที่จ่าย
    [i + 1, e.tax_id || '-', '', e.name, payDate, '1', ((e.base || 0) + (e.ot || 0)).toFixed(2), (e.tax || 0).toFixed(2), '1'].join(TAB)
  )
  const income = rows.reduce((s, e) => s + (e.base || 0) + (e.ot || 0), 0)
  const total = rows.reduce((s, e) => s + (e.tax || 0), 0)
  return {
    filename: `PND1_${pp.fileTag}.txt`,
    content: [
      `แบบ ภ.ง.ด.1 ใบแนบ — ภาษีเงินได้หัก ณ ที่จ่าย (เงินเดือน/ค่าจ้าง ม.40(1)) เดือนภาษี ${pp.label}`,
      `จำนวนผู้มีเงินได้ ${rows.length} ราย`,
      header, ...lines,
      ['', '', '', 'รวมทั้งสิ้น', '', '', income.toFixed(2), total.toFixed(2), ''].join(TAB),
    ].join('\n'),
  }
}

// ภงด.3 — withholding tax, individuals
export function pnd3() {
  return whtFile('ภงด.3', 'PND3')
}
// ภงด.53 — withholding tax, juristic persons
export function pnd53() {
  return whtFile('ภงด.53', 'PND53')
}
function whtFile(type, prefix) {
  const p = activePeriod(), pp = parts(p)
  const rows = db.prepare('SELECT * FROM payments WHERE type = ?').all(type)
  const header = ['ลำดับ', 'วันที่จ่าย', 'ผู้ถูกหัก', 'ยอดก่อนหัก', 'อัตรา(%)', 'ภาษีหัก'].join(TAB)
  const lines = rows.map((r, i) => [i + 1, r.date, r.payee, r.gross.toFixed(2), r.wht_rate, r.wht.toFixed(2)].join(TAB))
  const total = rows.reduce((s, r) => s + r.wht, 0)
  return {
    filename: `${prefix}_${pp.fileTag}.txt`,
    content: [`แบบ ${type} ภาษีหัก ณ ที่จ่าย เดือนภาษี ${pp.label}`, header, ...lines,
      ['', '', 'รวม', '', '', total.toFixed(2)].join(TAB)].join('\n'),
  }
}

// ภพ.30 — VAT return summary (output VAT from sales docs, input VAT from expenses)
export function pp30() {
  const p = activePeriod(), pp = parts(p)
  const outputVat = db.prepare('SELECT COALESCE(SUM(vat),0) v FROM sales_docs').get().v
  const expenseTotal = db.prepare('SELECT COALESCE(SUM(amount),0) a FROM expenses').get().a
  const inputVat = Math.round((expenseTotal * 7) / 107) // VAT-inclusive expenses → input VAT
  const header = `แบบ ภพ.30 สรุปภาษีมูลค่าเพิ่ม เดือนภาษี ${pp.label}`
  const body = [
    `ภาษีขาย (Output VAT)\t${outputVat.toFixed(2)}`,
    `ภาษีซื้อ (Input VAT)\t${inputVat.toFixed(2)}`,
    `ภาษีที่ต้องชำระ/ขอคืน\t${(outputVat - inputVat).toFixed(2)}`,
  ]
  return { filename: `PP30_${pp.fileTag}.txt`, content: [header, ...body].join('\n') }
}

// ประกันสังคม (สปส.1-10) — social security contributions
export function sso() {
  const p = activePeriod(), pp = parts(p)
  const rows = payrollRows(p)
  const header = ['ลำดับ', 'ชื่อ-สกุล', 'ค่าจ้าง', 'เงินสมทบลูกจ้าง(5%)', 'เงินสมทบนายจ้าง(5%)'].join(TAB)
  let totalEmp = 0, totalEmployer = 0
  const lines = rows.map((e, i) => {
    // contribution must match payroll: capped at wage 17,500 → max 875
    const c = e.sso != null ? e.sso : Math.round(Math.min(e.base || 0, 17500) * 0.05)
    totalEmp += c; totalEmployer += c
    return [i + 1, e.name, (e.base || 0).toFixed(2), c.toFixed(2), c.toFixed(2)].join(TAB)
  })
  return {
    filename: `SSO_1-10_${pp.fileTag}.txt`,
    content: [`แบบ สปส.1-10 เงินสมทบประกันสังคม เดือน ${pp.label}`, header, ...lines,
      ['', 'รวม', '', totalEmp.toFixed(2), totalEmployer.toFixed(2)].join(TAB)].join('\n'),
  }
}

const PERIOD = () => parts(activePeriod()).label
export const EFILINGS = {
  pnd1: { label: 'ภงด.1 (ภาษีเงินเดือน)', gen: pnd1, agency: 'กรมสรรพากร', due: (p) => due(p, 7) },
  pnd3: { label: 'ภงด.3 (หัก ณ ที่จ่าย-บุคคล)', gen: pnd3, agency: 'กรมสรรพากร', due: (p) => due(p, 7) },
  pnd53: { label: 'ภงด.53 (หัก ณ ที่จ่าย-นิติบุคคล)', gen: pnd53, agency: 'กรมสรรพากร', due: (p) => due(p, 7) },
  pp30: { label: 'ภพ.30 (ภาษีมูลค่าเพิ่ม)', gen: pp30, agency: 'กรมสรรพากร', due: (p) => due(p, 15) },
  sso: { label: 'สปส.1-10 (ประกันสังคม)', gen: sso, agency: 'สำนักงานประกันสังคม', due: (p) => due(p, 15) },
}

// metadata for the listing endpoint (dynamic period + due)
export function efilingList() {
  const p = activePeriod()
  return Object.entries(EFILINGS).map(([id, v]) => ({
    id, label: `${v.label} — งวด ${PERIOD()}`, agency: v.agency, due: v.due(p),
  }))
}
