import { useEffect, useState } from 'react'
import { api as apiClient } from '../api'
import {
  hrTabs,
  positions,
  empStatusStyle,
  attendanceStyle,
  leaveTypeStyle,
  approvalStyle,
} from '../erpData'
import type { DocKind } from '../erpData'
import { baht, unMoney } from '../data'
import { useApp } from '../store'
import MoneyInput from './MoneyInput'
import Pager from './Pager'
import WhtCertDoc, { type AnnualEmpRow } from './WhtCertDoc'
import AllSlipsDoc from './AllSlipsDoc'
import PayrollSummaryDoc from './PayrollSummaryDoc'
import EfilingList from './EfilingList'
import EmpSignatureCell from './EmpSignatureCell'
import LocationTrack from './LocationTrack'

const th: React.CSSProperties = { padding: '9px 12px', fontWeight: 600, color: '#5C6770', fontSize: 12 }
const td: React.CSSProperties = { padding: '10px 12px' }
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '8px 11px', outline: 'none' }

function Pill({ s }: { s: string }) {
  const c = approvalStyle(s)
  return <span style={{ fontSize: 11, fontWeight: 600, color: c.c, background: c.bg, padding: '2px 10px', borderRadius: 20 }}>{s}</span>
}

export default function HR({ onPrint }: { onPrint: (kind: DocKind, data?: unknown) => void }) {
  const [tab, setTab] = useState('employees')
  const app = useApp()
  const { data, user } = app
  const { employees, payroll, payrollMeta, ot: otRecords, leaves, timeAdjustments } = data
  const posList = data.positions.length ? data.positions : positions
  const salaryOk = payroll !== null
  const isMgr = !!user?.isManager
  // สรุปลงเวลารายเดือน
  const nowYM = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
  const [attMonth, setAttMonth] = useState(nowYM())
  const [attSum, setAttSum] = useState<{ periodLabel: string; rows: { code: string; name: string; role: string; present: number; late: number; absent: number; leave: number; came: number; adj?: number; no_attendance?: boolean }[] } | null>(null)
  const loadAttSum = () => apiClient.get<typeof attSum>('/attendance/summary?period=' + attMonth).then(setAttSum).catch(() => setAttSum(null))
  useEffect(() => { if (tab === 'attsummary') loadAttSum() /* eslint-disable-next-line */ }, [tab, attMonth])
  // รายละเอียดลงเวลารายวันต่อคน (เปิดดูว่าวันไหนมา/ขาด + เติมได้)
  type DayCell = { date: string; dow: number; status: string; check_in: string; check_out: string }
  type Detail = { code: string; name: string; role: string; no_attendance?: boolean; days: DayCell[]; counts: { came: number; late: number; adj: number; leave: number; absent: number; holiday: number } }
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const openDetail = (code: string) => { setDetailLoading(true); apiClient.get<Detail>(`/attendance/detail?emp_code=${encodeURIComponent(code)}&period=${attMonth}`).then(setDetail).catch(() => setDetail(null)).finally(() => setDetailLoading(false)) }
  const fillDay = async (code: string, date: string) => {
    try { await apiClient.post('/attendance/manual', { emp_code: code, date, check_in: '08:00', check_out: '17:00' }); openDetail(code); loadAttSum() }
    catch (e) { alert((e as Error).message) }
  }
  // ลงเวลา (kiosk) — ดู/แก้ไขตามเดือน + เพิ่มด้วยมือ (กรณีลืมตอกบัตร/ระบบยังไม่เปิด)
  type AttRow = { id: number; emp_code: string; emp_name: string; date: string; check_in: string; check_out: string; status: string }
  const [attListMonth, setAttListMonth] = useState(nowYM())
  const [attAll, setAttAll] = useState(false) // ดูทั้งหมดทุกเดือน (เผื่อบางรายการวันที่ผิดรูปแบบ)
  const [attList, setAttList] = useState<AttRow[]>([])
  const loadAttList = () => apiClient.get<AttRow[]>('/attendance' + (attAll ? '' : '?period=' + attListMonth)).then(setAttList).catch(() => setAttList([]))
  useEffect(() => { if (tab === 'attendance') loadAttList() /* eslint-disable-next-line */ }, [tab, attListMonth, attAll])
  const [attForm, setAttForm] = useState({ emp_code: '', date: '', check_in: '08:00', check_out: '17:00' })
  const [attMsg, setAttMsg] = useState('')
  const saveManualAtt = async () => {
    setAttMsg('')
    if (!attForm.emp_code || !attForm.date) { setAttMsg('กรุณาเลือกพนักงานและวันที่'); return }
    try { await apiClient.post('/attendance/manual', attForm); setAttMsg('บันทึกแล้ว'); setAttForm({ ...attForm, emp_code: '' }); loadAttList() }
    catch (e) { setAttMsg((e as Error).message) }
  }
  const markAllPresent = async () => {
    setAttMsg('')
    if (!attForm.date) { setAttMsg('เลือกวันที่ก่อน'); return }
    if (!window.confirm(`บันทึก "มาทำงาน" ให้พนักงานทุกคนที่ยังไม่มีบันทึกในวันที่ ${attForm.date}?`)) return
    try { const r = await apiClient.post<{ added: number }>('/attendance/mark-all-present', { date: attForm.date, check_in: attForm.check_in, check_out: attForm.check_out }); setAttMsg(`เพิ่ม “มาทำงาน” ให้ ${r.added} คนแล้ว`); loadAttList() }
    catch (e) { setAttMsg((e as Error).message) }
  }
  const delAtt = async (id: number) => { if (!window.confirm('ลบบันทึกการลงเวลานี้?')) return; try { await apiClient.del('/attendance/' + id); loadAttList() } catch (e) { alert((e as Error).message) } }
  // เงินเดือน: สรุปทั้งปี + เบิกล่วงหน้า
  const [annual, setAnnual] = useState<{ year: string; months: number; net: number; sso: number } | null>(null)
  interface AdvGroup { emp_code: string; emp_name: string; worked: number; limit: number; taken: number; remaining: number; count: number; rounds: { id: number; date: string; amount: number; note: string }[] }
  const [advances, setAdvances] = useState<AdvGroup[]>([])
  const [advForm, setAdvForm] = useState({ emp_code: '', amount: '', note: '' })
  const [advLimit, setAdvLimit] = useState<{ worked: number; limit: number; taken: number; remaining: number } | null>(null)
  const [advErr, setAdvErr] = useState('')
  const loadAdvances = () => { const p = payrollMeta?.period; if (p) apiClient.get<{ rows: AdvGroup[] }>('/salary-advances/summary?period=' + p).then((r) => setAdvances(r.rows || [])).catch(() => setAdvances([])) }
  // สรุป retention สะสมต่อคน (หักไปแล้วเท่าไหร่ / ครบ 5,000 หรือยัง)
  interface RetRow { code: string; name: string; monthly: number; opening: number; paid: number; remaining: number; done: boolean }
  const [retSum, setRetSum] = useState<{ cap: number; rows: RetRow[] } | null>(null)
  const loadRetention = () => apiClient.get<{ cap: number; rows: RetRow[] }>('/payroll/retention').then(setRetSum).catch(() => setRetSum(null))
  // แก้ยอดหัก retention ต่อเดือนของพนักงานตรงตารางเงินเดือนได้เลย (คนที่ครบแล้วตั้ง 0)
  const [retSaving, setRetSaving] = useState<number | null>(null)
  const saveRetentionMonthly = async (id: number, raw: string) => {
    setRetSaving(id)
    try { await app.updateEmployee(id, { retention: unMoney(raw) }); loadRetention() }
    catch (e) { alert((e as Error).message) }
    finally { setRetSaving(null) }
  }
  // แก้ยอดหัก กยศ ต่อคนตรงตารางเงินเดือนได้เลย
  const [loanSaving, setLoanSaving] = useState<number | null>(null)
  const saveStudentLoan = async (id: number, raw: string) => {
    setLoanSaving(id)
    try { await app.updateEmployee(id, { student_loan: unMoney(raw) }) }
    catch (e) { alert((e as Error).message) }
    finally { setLoanSaving(null) }
  }
  // แก้ยอดภาษีต่อคนตรงตารางเงินเดือน (ภาษีกรอกเอง)
  const [taxSaving, setTaxSaving] = useState<number | null>(null)
  const saveTax = async (id: number, raw: string) => {
    setTaxSaving(id)
    try { await app.updateEmployee(id, { tax: unMoney(raw) }) }
    catch (e) { alert((e as Error).message) }
    finally { setTaxSaving(null) }
  }
  // แก้จำนวนวันทำงาน (รายวัน เช่น แม่บ้าน) ตรงตารางเงินเดือน → คิดเงินอัตโนมัติ
  // รองรับครึ่งวัน เช่น 17.5 วัน (parseFloat เก็บจุดทศนิยม)
  const parseDays = (v: string) => { const n = parseFloat(String(v).replace(/[^\d.]/g, '')); return isNaN(n) ? 0 : n }
  const [wdSaving, setWdSaving] = useState<number | null>(null)
  const saveWorkDays = async (id: number, raw: string) => {
    setWdSaving(id)
    try { await app.updateEmployee(id, { work_days: parseDays(raw) }) }
    catch (e) { alert((e as Error).message) }
    finally { setWdSaving(null) }
  }
  useEffect(() => {
    if (tab === 'payroll' && salaryOk) {
      apiClient.get<typeof annual>('/payroll/annual?year=' + new Date().getFullYear()).then(setAnnual).catch(() => setAnnual(null))
      loadAdvances()
      loadRetention()
      loadDeds()
    } /* eslint-disable-next-line */
  }, [tab, salaryOk, payrollMeta?.period, payrollMeta?.locked])
  useEffect(() => {
    if (advForm.emp_code) apiClient.get<typeof advLimit>('/salary-advances/limit?emp_code=' + advForm.emp_code + (payrollMeta?.period ? '&period=' + payrollMeta.period : '')).then(setAdvLimit).catch(() => setAdvLimit(null))
    else setAdvLimit(null)
  }, [advForm.emp_code, advances, payrollMeta?.period])
  const submitAdvance = async () => {
    setAdvErr('')
    if (!advForm.emp_code || !advForm.amount) { setAdvErr('เลือกพนักงานและกรอกจำนวนเงิน'); return }
    try { await apiClient.post('/salary-advances', { emp_code: advForm.emp_code, amount: unMoney(advForm.amount), note: advForm.note, period: payrollMeta?.period }); setAdvForm({ emp_code: '', amount: '', note: '' }); loadAdvances() }
    catch (e) { setAdvErr((e as Error).message) }
  }
  const delAdvance = async (id: number) => { try { await apiClient.del('/salary-advances/' + id); loadAdvances() } catch (e) { alert((e as Error).message) } }
  // หักอื่นๆ ต่อคนต่องวด (พร้อมเหตุผล) → หักจากเงินเดือนงวดนั้น
  interface DedRow { id: number; emp_code: string; emp_name: string; date: string; amount: number; reason: string }
  const [deds, setDeds] = useState<DedRow[]>([])
  const [dedForm, setDedForm] = useState({ emp_code: '', amount: '', reason: '' })
  const [dedErr, setDedErr] = useState('')
  const loadDeds = () => { const p = payrollMeta?.period; if (p) apiClient.get<DedRow[]>('/deductions?period=' + p).then(setDeds).catch(() => setDeds([])) }
  const refreshPayroll = () => { if (payrollMeta?.period) app.viewPayrollPeriod(payrollMeta.period) } // ให้ยอดสุทธิในตารางอัปเดตทันที
  const submitDed = async () => {
    setDedErr('')
    if (!dedForm.emp_code || !dedForm.amount) { setDedErr('เลือกพนักงานและกรอกจำนวนเงิน'); return }
    if (!dedForm.reason.trim()) { setDedErr('กรุณากรอกเหตุผลการหัก'); return }
    try { await apiClient.post('/deductions', { emp_code: dedForm.emp_code, amount: unMoney(dedForm.amount), reason: dedForm.reason, period: payrollMeta?.period }); setDedForm({ emp_code: '', amount: '', reason: '' }); loadDeds(); refreshPayroll() }
    catch (e) { setDedErr((e as Error).message) }
  }
  const delDed = async (id: number) => { try { await apiClient.del('/deductions/' + id); loadDeds(); refreshPayroll() } catch (e) { alert((e as Error).message) } }
  // วันหยุดบริษัท
  const isAdmin = user?.role === 'admin'
  const [holidays, setHolidays] = useState<{ id: number; date: string; name: string }[]>([])
  const [hForm, setHForm] = useState({ date: '', name: '' })
  const loadHolidays = () => apiClient.get<{ id: number; date: string; name: string }[]>('/holidays').then(setHolidays).catch(() => setHolidays([]))
  useEffect(() => { if (tab === 'holidays') loadHolidays() }, [tab])
  const addHoliday = async () => {
    if (!hForm.date) return
    try { await apiClient.post('/holidays', hForm); setHForm({ date: '', name: '' }); loadHolidays() } catch (e) { alert((e as Error).message) }
  }
  const delHoliday = async (id: number) => { try { await apiClient.del('/holidays/' + id); loadHolidays() } catch (e) { alert((e as Error).message) } }
  const thMonth = (iso: string) => { const m = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']; const [y, mo, d] = iso.split('-'); return `${Number(d)} ${m[Number(mo) - 1]} ${(Number(y) + 543) % 100}` }

  // payroll period runs (closed months)
  const [showSummary, setShowSummary] = useState(false)
  const [showAllSlips, setShowAllSlips] = useState(false)
  // หนังสือรับรอง 50 ทวิ — เลือกพนักงานจากยอดสะสมทั้งปี (งวดที่ปิดแล้ว)
  const [whtRows, setWhtRows] = useState<AnnualEmpRow[] | null>(null)
  const [whtPick, setWhtPick] = useState<AnnualEmpRow | null>(null)
  const whtYear = String(new Date().getFullYear())
  const openWhtList = async () => {
    try {
      const r = await apiClient.get<{ rows: AnnualEmpRow[] }>('/payroll/annual-emp?year=' + whtYear)
      if (!r.rows.length) { alert('ยังไม่มีงวดที่ปิดแล้วในปีนี้ — ปิดงวดเงินเดือนก่อนจึงออก 50 ทวิ ได้'); return }
      setWhtRows(r.rows)
    } catch (e) { alert((e as Error).message) }
  }
  const [runs, setRuns] = useState<{ period: string; periodLabel: string }[]>([])
  useEffect(() => { if (salaryOk) apiClient.get<{ period: string; periodLabel: string }[]>('/payroll/runs').then(setRuns).catch(() => {}) }, [salaryOk, payrollMeta?.locked])
  const periodOptions = (() => {
    const TH_MO = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
    const lbl = (p: string) => { const [y, m] = p.split('-').map(Number); return `${TH_MO[m - 1]} ${String((y + 543) % 100).padStart(2, '0')}` }
    const opts = new Map<string, string>()
    // เดือนปัจจุบัน + ย้อนหลัง 6 เดือน — ให้ปิดงวดของเดือนก่อน ๆ ได้ (เช่น วันที่ 1–2 ก.ย. ปิดงวด ส.ค.)
    const now = new Date()
    for (let i = 0; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      opts.set(p, lbl(p))
    }
    if (payrollMeta) opts.set(payrollMeta.period, payrollMeta.periodLabel)
    for (const r of runs) opts.set(r.period, r.periodLabel) // งวดที่ปิดแล้ว (ป้ายจากเซิร์ฟเวอร์)
    return [...opts.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  })()

  // ----- employee form -----
  const blankEmp = { name: '', prefix: '', nickname: '', role: posList[0], pay_type: 'รายเดือน', base: '', start: '', status: 'ทดลองงาน', pin: '', spouse: false, children: '0', sick_used: '0', personal_used: '0', vacation_used: '0', bank_name: '', bank_acct: '', tax_id: '', retention: '500', student_loan: '0', retention_opening: '0', work_days: '0', backup_code: '', no_sso: false }
  const [addingEmp, setAddingEmp] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [emp, setEmp] = useState(blankEmp)
  const [empSig, setEmpSig] = useState('')
  const [empErr, setEmpErr] = useState('')
  const [empPinShown, setEmpPinShown] = useState('')
  const [empQuery, setEmpQuery] = useState('')
  const [empPage, setEmpPage] = useState(1)
  const EMP_PAGE = 25
  const empList = employees.filter((e) => `${e.name} ${e.code} ${e.role}`.toLowerCase().includes(empQuery.trim().toLowerCase()))
  const empPaged = empList.slice((empPage - 1) * EMP_PAGE, empPage * EMP_PAGE)
  // leave entitlement computed from start date: ลากิจ 3 always; พักร้อน 6 if ≥1yr else 3
  const tenureYears = emp.start ? (Date.now() - new Date(emp.start).getTime()) / (365.25 * 86400000) : 0
  const vacQuota = tenureYears >= 1 ? 6 : 3
  const pickEmpSig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) { setEmpErr('ลายเซ็นต้องเป็นรูปภาพ'); return }
    const r = new FileReader(); r.onload = () => setEmpSig(String(r.result)); r.readAsDataURL(f)
  }
  const startEdit = (e: typeof employees[number]) => {
    setEditId(e.id)
    setEmp({ ...blankEmp, name: e.name, prefix: (e as { prefix?: string }).prefix || '', nickname: (e as { nickname?: string }).nickname || '', no_sso: !!(e as { no_sso?: number }).no_sso, role: e.role || posList[0], pay_type: e.pay_type || 'รายเดือน', base: String(e.base ?? ''), status: e.status, spouse: !!(e as { spouse?: number }).spouse, children: String((e as { children?: number }).children ?? 0), bank_name: (e as { bank_name?: string }).bank_name || '', bank_acct: (e as { bank_acct?: string }).bank_acct || '', tax_id: (e as { tax_id?: string }).tax_id || '', retention: String((e as { retention?: number }).retention ?? 500), student_loan: String((e as { student_loan?: number }).student_loan ?? 0), retention_opening: String((e as { retention_opening?: number }).retention_opening ?? 0), work_days: String((e as { work_days?: number }).work_days ?? 0), backup_code: (e as { backup_code?: string }).backup_code || '' })
    setEmpSig(''); setAddingEmp(true); setEmpErr('')
  }
  const submitEmp = async () => {
    setEmpErr('')
    if (emp.pin && !/^\d{4}$/.test(emp.pin)) { setEmpErr('PIN ต้องเป็นตัวเลข 4 หลัก (หรือเว้นว่างให้ระบบสุ่มให้)'); return }
    try {
      const body = { ...emp, base: unMoney(emp.base), children: Number(emp.children) || 0, sick_used: Number(emp.sick_used), personal_used: Number(emp.personal_used), vacation_used: Number(emp.vacation_used), retention: unMoney(emp.retention), student_loan: unMoney(emp.student_loan), retention_opening: unMoney(emp.retention_opening), work_days: Number(emp.work_days) || 0, backup_code: emp.backup_code || '', signature: empSig || undefined }
      if (editId) {
        await app.updateEmployee(editId, body)
        setEmpPinShown('แก้ไขข้อมูลพนักงานเรียบร้อย (ภาษี/ประกันสังคมคำนวณใหม่ให้แล้ว)')
      } else {
        const r = await app.addEmployee(body)
        setEmpPinShown(`เพิ่มพนักงานสำเร็จ · PIN ลงเวลาของพนักงานคนนี้คือ ${r.pin} (โปรดแจ้งพนักงาน)`)
      }
      setAddingEmp(false); setEditId(null); setEmp(blankEmp); setEmpSig('')
    } catch (e) { setEmpErr((e as Error).message) }
  }
  const removeEmp = async (id: number, name: string) => {
    if (window.confirm(`ลบพนักงาน "${name}" ออกจากระบบ?\n(จะไม่ถูกคิดในสรุปเงินเดือนอีก)`)) await app.deleteEmployee(id)
  }
  const dedupEmployees = async () => {
    if (!window.confirm('รวมพนักงานที่ชื่อซ้ำกันให้เหลือชื่อละ 1 รายการ?\nระบบจะเก็บรายการที่ข้อมูลครบที่สุด แล้วย้ายประวัติ (ลงเวลา/เบิก/หัก ฯลฯ) มารวมไว้ให้')) return
    try {
      const r = await apiClient.post<{ mergedGroups: number; removed: number; tidied: number }>('/employees/dedup', {})
      await app.reloadData('employees', '/employees')
      if (payrollMeta?.period) app.viewPayrollPeriod(payrollMeta.period)
      alert((r.removed || r.tidied)
        ? `เรียบร้อย: รวมชื่อซ้ำ ${r.mergedGroups} ชื่อ · ลบรายการซ้ำ ${r.removed} รายการ · จัดคำนำหน้า/ชื่อ ${r.tidied} รายการ`
        : 'ไม่พบพนักงานที่ชื่อซ้ำกัน')
    } catch (e) { alert((e as Error).message) }
  }
  const resetPin = async (id: number, name: string) => {
    const pin = window.prompt(`ตั้ง PIN ลงเวลาใหม่ของ "${name}" (ตัวเลข 4 หลัก)`)
    if (pin == null) return
    try { await app.setEmpPin(id, pin.trim()); setEmpPinShown(`ตั้ง PIN ของ ${name} เป็น ${pin.trim()} แล้ว`) } catch (e) { alert((e as Error).message) }
  }

  // ----- OT form -----
  const [addingOt, setAddingOt] = useState(false)
  const [otForm, setOtForm] = useState({ emp_code: '', date: '', hours: '', rate: '1.5x', amount: '' })
  const [otErr, setOtErr] = useState('')
  const submitOt = async () => {
    setOtErr('')
    if (!otForm.emp_code) { setOtErr('กรุณาเลือกพนักงาน'); return }
    try {
      await app.addOT({ ...otForm, amount: unMoney(otForm.amount) })
      setAddingOt(false); setOtForm({ emp_code: '', date: '', hours: '', rate: '1.5x', amount: '' })
    } catch (e) { setOtErr((e as Error).message) }
  }

  // ----- leave form -----
  const blankLv = { emp_code: '', type: 'ลาป่วย', start_date: '', end_date: '', days: '1', reason: '', unit: 'day', halfPart: 'เช้า', hours: '2' }
  const [lv, setLv] = useState(blankLv)
  const [lvErr, setLvErr] = useState('')
  // จำนวนวันที่จะใช้จริง (สำหรับแสดง/เช็กสิทธิ์)
  const lvDays = lv.unit === 'half' ? 0.5 : lv.unit === 'hour' ? Math.round((Number(lv.hours) || 0) / 8 * 100) / 100 : (Number(lv.days) || 0)
  const submitLeave = async () => {
    setLvErr('')
    const e = employees.find((x) => x.code === lv.emp_code)
    if (!e) { setLvErr('กรุณาเลือกพนักงาน'); return }
    if (!lv.start_date) { setLvErr('กรุณาเลือกวันที่'); return }
    const hours = lv.unit === 'hour' ? (Number(lv.hours) || 0) : 0
    if (lv.unit === 'hour' && (hours <= 0 || hours > 8)) { setLvErr('ลารายชั่วโมงได้ 0.5–8 ชม.'); return }
    const days = lv.unit === 'half' ? 0.5 : lv.unit === 'hour' ? Math.round(hours / 8 * 100) / 100 : (Number(lv.days) || 1)
    const reason = lv.unit === 'half' ? `(ครึ่งวัน${lv.halfPart}) ${lv.reason}`.trim() : lv.unit === 'hour' ? `(${hours} ชม.) ${lv.reason}`.trim() : lv.reason
    try {
      await app.addLeave({ emp_code: lv.emp_code, type: lv.type, start_date: lv.start_date, end_date: lv.unit === 'day' ? (lv.end_date || lv.start_date) : lv.start_date, emp_name: e.name, days, hours, reason })
      setLv(blankLv)
    } catch (ex) { setLvErr((ex as Error).message) }
  }

  // ----- time-adjustment form -----
  const [ta, setTa] = useState({ emp_name: '', date: '', kind: 'เข้างาน', time: '', reason: '' })
  const [taErr, setTaErr] = useState('')
  const submitTa = async () => {
    setTaErr('')
    try {
      await app.addTimeAdj({ ...ta, emp_name: ta.emp_name || user?.name })
      setTa({ emp_name: '', date: '', kind: 'เข้างาน', time: '', reason: '' })
    } catch (ex) { setTaErr((ex as Error).message) }
  }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 2, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 11, padding: '6px 8px', flexWrap: 'wrap' }}>
        {hrTabs.filter((t) => t.id !== 'location' || isMgr).map((t) => {
          const active = tab === t.id
          return <div key={t.id} onClick={() => setTab(t.id)} style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: active ? '#fff' : '#5C6770', background: active ? '#30506A' : 'transparent', padding: '7px 14px', borderRadius: 7, cursor: 'pointer' }}>{t.label}</div>
        })}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        {/* ===== employees ===== */}
        {tab === 'employees' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid #EEF1F4' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>พนักงานทั้งหมด</span>
              <span className="num" style={{ fontSize: 11.5, color: '#94A0A8' }}>{empList.length}/{employees.length}</span>
              <input value={empQuery} onChange={(e) => { setEmpQuery(e.target.value); setEmpPage(1) }} placeholder="ค้นหาชื่อ/รหัส/ตำแหน่ง" style={{ ...field, padding: '6px 10px', fontSize: 12.5, width: 200 }} />
              {isAdmin && <button onClick={dedupEmployees} title="รวมพนักงานที่ชื่อซ้ำกันให้เหลือชื่อละ 1 รายการ" className="hov-f3f5f7" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#C0852C', background: '#fff', border: '1px solid #E8D6AD', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>🧹 ล้างข้อมูลซ้ำ</button>}
              <button onClick={() => { setEditId(null); setEmp(blankEmp); setEmpSig(''); setEmpErr(''); setAddingEmp((v) => !v) }} className="btn-primary" style={{ marginLeft: isAdmin ? 0 : 'auto', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>+ เพิ่มพนักงาน</button>
            </div>
            {empPinShown && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 18px', background: '#E2F1EA', borderBottom: '1px solid #CDE3D6', fontSize: 12.5, color: '#1C5B3A', fontWeight: 500 }}>
                ✓ {empPinShown}
                <button onClick={() => setEmpPinShown('')} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: '#5C6770' }}>✕</button>
              </div>
            )}
            {addingEmp && (
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF1F4', background: '#FAFBFC' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                  <select style={field} value={emp.prefix} onChange={(e) => setEmp({ ...emp, prefix: e.target.value })} title="คำนำหน้า (ใช้ในใบสรุปการจ่ายค่าจ้าง)"><option value="">คำนำหน้า</option><option>นาย</option><option>นาง</option><option>น.ส.</option></select>
                  <input style={field} placeholder="ชื่อ-สกุล *" value={emp.name} onChange={(e) => setEmp({ ...emp, name: e.target.value })} />
                  <input style={field} placeholder="ชื่อเล่น (เช่น พี่แมน)" value={emp.nickname} onChange={(e) => setEmp({ ...emp, nickname: e.target.value })} />
                  <select style={field} value={emp.role} onChange={(e) => setEmp({ ...emp, role: e.target.value })}>{posList.map((p) => <option key={p}>{p}</option>)}</select>
                  <select style={field} value={emp.pay_type} onChange={(e) => setEmp({ ...emp, pay_type: e.target.value })}><option>รายเดือน</option><option>รายวัน</option></select>
                  <MoneyInput decimal style={field} placeholder={emp.pay_type === 'รายวัน' ? 'ค่าแรง/วัน (บาท) เช่น 1,166.67' : 'เงินเดือน (บาท)'} value={emp.base} onChange={(v) => setEmp({ ...emp, base: v })} />
                  {emp.pay_type === 'รายวัน' && (
                    <input style={field} type="number" min={0} step={0.5} placeholder="วันทำงาน/เดือน (เช่น แม่บ้าน) — ใส่ครึ่งวันได้ เช่น 17.5" value={emp.work_days} onChange={(e) => setEmp({ ...emp, work_days: e.target.value })} title="รายวัน: เงิน = ค่าแรง/วัน × วันทำงาน (ใส่ครึ่งวันได้ เช่น 17.5)" />
                  )}
                  <input style={field} type="date" value={emp.start} onChange={(e) => setEmp({ ...emp, start: e.target.value })} />
                  <select style={field} value={emp.status} onChange={(e) => setEmp({ ...emp, status: e.target.value })}>{['ทดลองงาน', 'ทำงาน', 'ลาออก'].map((s) => <option key={s}>{s}</option>)}</select>
                  <input style={field} placeholder="PIN ลงเวลา 4 หลัก (เว้นว่าง=สุ่ม)" maxLength={4} value={emp.pin} onChange={(e) => setEmp({ ...emp, pin: e.target.value.replace(/\D/g, '') })} />
                  <select style={field} value={emp.backup_code} onChange={(e) => setEmp({ ...emp, backup_code: e.target.value })} title="งานด่วน: ถ้าคนนี้ไม่รับใน 5 นาที ระบบไล่ไปหาคนสำรอง">
                    <option value="">คนสำรอง (งานด่วน) — ไม่ระบุ</option>
                    {employees.filter((x) => x.status !== 'ลาออก' && x.name !== emp.name).map((x) => <option key={x.code} value={x.code}>สำรอง: {x.name}</option>)}
                  </select>
                  <label className="hov-f3f5f7" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5, fontWeight: 500, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '8px 11px', cursor: 'pointer' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M5 21h14" /></svg>
                    {empSig ? 'เปลี่ยนลายเซ็น' : 'อัปโหลดลายเซ็น'}
                    <input type="file" accept="image/*" onChange={pickEmpSig} style={{ display: 'none' }} />
                  </label>
                  {empSig && <img src={empSig} alt="ลายเซ็น" style={{ height: 36, maxWidth: '100%', objectFit: 'contain', border: '1px solid #E1E5EA', borderRadius: 6, background: '#fff' }} />}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>ลดหย่อนภาษี:</span>
                  <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}><input type="checkbox" checked={emp.spouse} onChange={(e) => setEmp({ ...emp, spouse: e.target.checked })} /> มีคู่สมรส (60,000)</label>
                  <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>บุตร <input type="number" min={0} value={emp.children} onChange={(e) => setEmp({ ...emp, children: e.target.value })} style={{ ...field, width: 56, padding: '6px 8px' }} /> คน (คนละ 30,000)</label>
                  <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#C0852C' }} title="ติ๊กถ้าคนนี้ไม่อยู่ในระบบประกันสังคม (จะไม่หัก ปกส.)"><input type="checkbox" checked={emp.no_sso} onChange={(e) => setEmp({ ...emp, no_sso: e.target.checked })} /> ไม่หักประกันสังคม</label>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600, margin: '14px 0 3px' }}>ข้อมูลจ่ายเงินเดือน / ภาษี</div>
                <div style={{ fontSize: 11.5, color: '#94A0A8', marginBottom: 8 }}>ใช้สร้างไฟล์จ่ายเงินเดือนผ่านธนาคาร และแบบ ภ.ง.ด.1</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                  <input style={field} placeholder="ธนาคาร (เช่น กสิกรไทย)" value={emp.bank_name} onChange={(e) => setEmp({ ...emp, bank_name: e.target.value })} />
                  <input style={field} placeholder="เลขบัญชีธนาคาร" value={emp.bank_acct} onChange={(e) => setEmp({ ...emp, bank_acct: e.target.value.replace(/[^\d-]/g, '') })} />
                  <input style={field} placeholder="เลขผู้เสียภาษี 13 หลัก" maxLength={13} value={emp.tax_id} onChange={(e) => setEmp({ ...emp, tax_id: e.target.value.replace(/\D/g, '') })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginTop: 10 }}>
                  <div><div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>หัก Retention /เดือน <span style={{ color: '#94A0A8' }}>(ปกติ 500 · หยุดหักเองเมื่อครบ 5,000)</span></div><MoneyInput style={field} placeholder="500" value={emp.retention} onChange={(v) => setEmp({ ...emp, retention: v })} /></div>
                  <div><div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>Retention หักสะสมมาแล้ว <span style={{ color: '#94A0A8' }}>(พนักงานเก่า · ครบแล้วใส่ 5000)</span></div><MoneyInput style={field} placeholder="0" value={emp.retention_opening} onChange={(v) => setEmp({ ...emp, retention_opening: v })} /></div>
                  <div><div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>หัก กยศ /เดือน <span style={{ color: '#94A0A8' }}>(เฉพาะคนที่มี · 0 = ไม่มี)</span></div><MoneyInput style={field} placeholder="0" value={emp.student_loan} onChange={(v) => setEmp({ ...emp, student_loan: v })} /></div>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600, margin: '14px 0 3px' }}>วันลา — กรอกจำนวนที่ “ใช้ไปแล้ว” (เริ่มใช้กลางปี)</div>
                <div style={{ fontSize: 11.5, color: '#94A0A8', marginBottom: 8 }}>
                  โควต้าต่อปี: ลาป่วย 30 วัน · ลากิจ 3 วัน · พักร้อน {vacQuota} วัน
                  {emp.start ? (tenureYears >= 1 ? ' (อายุงานครบ 1 ปี → 6 วัน)' : ' (อายุงานยังไม่ถึง 1 ปี → 3 วัน)') : ' (พักร้อนคำนวณจากวันเริ่มงาน)'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                  {[
                    { key: 'sick_used', label: 'ลาป่วย — ใช้ไปแล้ว (วัน)', q: 30 },
                    { key: 'personal_used', label: 'ลากิจ — ใช้ไปแล้ว (วัน)', q: 3 },
                    { key: 'vacation_used', label: 'พักร้อน — ใช้ไปแล้ว (วัน)', q: vacQuota },
                  ].map((f) => (
                    <div key={f.key}>
                      <div style={{ fontSize: 11.5, color: '#3C4750', marginBottom: 4 }}>{f.label} <span style={{ color: '#94A0A8' }}>· โควต้า {f.q}</span></div>
                      <input style={{ ...field, width: '100%' }} type="number" min={0} value={(emp as unknown as Record<string, string>)[f.key]} onChange={(e) => setEmp({ ...emp, [f.key]: e.target.value })} />
                    </div>
                  ))}
                </div>
                {empErr && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 8 }}>{empErr}</div>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                  <button onClick={() => setAddingEmp(false)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>ยกเลิก</button>
                  <button onClick={submitEmp} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>บันทึก</button>
                </div>
              </div>
            )}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
                <th style={{ ...th, padding: '9px 18px' }}>รหัส</th><th style={th}>ชื่อ-สกุล</th><th style={th}>ตำแหน่ง</th>
                <th style={{ ...th, textAlign: 'center' }}>ประเภทจ้าง</th>
                <th style={{ ...th, textAlign: 'center' }}>ลาป่วย</th><th style={{ ...th, textAlign: 'center' }}>ลากิจ</th><th style={{ ...th, textAlign: 'center' }}>พักร้อน</th>
                <th style={{ ...th, textAlign: 'center' }}>ลายเซ็น</th>
                <th style={{ ...th, textAlign: 'center' }}>สถานะ</th>
                <th style={{ ...th, padding: '9px 18px', textAlign: 'center' }}>จัดการ</th>
              </tr></thead>
              <tbody>
                {empList.length === 0 && <tr><td colSpan={10} style={{ padding: 36, textAlign: 'center', color: '#94A0A8' }}>{employees.length === 0 ? 'ยังไม่มีพนักงาน' : 'ไม่พบพนักงานที่ค้นหา'}</td></tr>}
                {empPaged.map((e) => {
                  const s = empStatusStyle(e.status)
                  return (
                    <tr key={e.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                      <td className="num" style={{ ...td, padding: '10px 18px', fontFamily: 'monospace', color: '#5C6770' }}>{e.code}</td>
                      <td style={{ ...td, fontWeight: 500 }}>{(e as { prefix?: string }).prefix ? <span style={{ color: '#5C6770', fontWeight: 400 }}>{(e as { prefix?: string }).prefix} </span> : ''}{e.name}{(e as { nickname?: string }).nickname ? <span style={{ fontSize: 11, color: '#94A0A8' }}> ({(e as { nickname?: string }).nickname})</span> : ''}</td>
                      <td style={{ ...td, color: '#3C4750' }}>{e.role}</td>
                      <td style={{ ...td, textAlign: 'center' }}><span style={{ fontSize: 11, fontWeight: 600, color: e.pay_type === 'รายวัน' ? '#C0852C' : '#30506A', background: e.pay_type === 'รายวัน' ? '#F6ECD6' : '#E2E9EF', padding: '2px 9px', borderRadius: 20 }}>{e.pay_type || 'รายเดือน'}</span></td>
                      <td className="num" style={{ ...td, textAlign: 'center', color: '#5C6770' }}>{e.sick_used ?? 0}/{e.sick_quota ?? 0}</td>
                      <td className="num" style={{ ...td, textAlign: 'center', color: '#5C6770' }}>{e.personal_used ?? 0}/{e.personal_quota ?? 0}</td>
                      <td className="num" style={{ ...td, textAlign: 'center', color: '#5C6770' }}>{e.vacation_used ?? 0}/{e.vacation_quota ?? 0}</td>
                      <td style={{ ...td, textAlign: 'center' }}><EmpSignatureCell empId={e.id} signature={e.signature} /></td>
                      <td style={{ ...td, textAlign: 'center' }}><span style={{ fontSize: 11, fontWeight: 600, color: s.c, background: s.bg, padding: '2px 10px', borderRadius: 20 }}>{e.status}</span></td>
                      <td style={{ ...td, padding: '10px 18px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button onClick={() => startEdit(e)} title="แก้ไข" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 500, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>แก้ไข</button>
                          <button onClick={() => resetPin(e.id, e.name)} title="ตั้ง PIN ลงเวลา" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 500, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>PIN</button>
                          <button onClick={() => removeEmp(e.id, e.name)} title="ลบพนักงาน" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 500, color: '#C24036', background: '#fff', border: '1px solid #F0D2CE', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>ลบ</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Pager page={empPage} setPage={setEmpPage} total={empList.length} pageSize={EMP_PAGE} />
          </>
        )}

        {/* ===== payroll ===== */}
        {tab === 'payroll' && !salaryOk && (
          <div style={{ padding: '54px 40px', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1C2730' }}>ไม่มีสิทธิ์ดูข้อมูลเงินเดือน</div>
            <div style={{ fontSize: 13, color: '#5C6770', marginTop: 6 }}>เปิดเฉพาะบทบาท <b>ผู้ดูแล</b> และ <b>บัญชี</b></div>
          </div>
        )}
        {tab === 'payroll' && salaryOk && (
          <>
          {showSummary && payroll && payrollMeta && <PayrollSummaryDoc rows={payroll} periodLabel={payrollMeta.periodLabel} onClose={() => setShowSummary(false)} />}
          {showAllSlips && payroll && payrollMeta && <AllSlipsDoc rows={payroll} periodLabel={payrollMeta.periodLabel} onClose={() => setShowAllSlips(false)} />}
          {whtPick && <WhtCertDoc row={whtPick} year={whtYear} onClose={() => setWhtPick(null)} />}
          {whtRows && !whtPick && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 55, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setWhtRows(null)}>
              <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 520, maxHeight: '80vh', overflow: 'auto', padding: '18px 20px' }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>หนังสือรับรอง 50 ทวิ — ปี {Number(whtYear) + 543}</div>
                <div style={{ fontSize: 12, color: '#94A0A8', marginBottom: 10 }}>เลือกพนักงานเพื่อพิมพ์ (ยอดจากงวดที่ปิดแล้วทั้งปี)</div>
                {whtRows.map((r) => (
                  <div key={r.code || r.name} onClick={() => setWhtPick(r)} className="hov-fafbfc" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderTop: '1px solid #F1F4F6', cursor: 'pointer', fontSize: 13 }}>
                    <span style={{ fontWeight: 600, flex: 1 }}>{r.prefix ? r.prefix + ' ' : ''}{r.name}</span>
                    <span style={{ fontSize: 11.5, color: '#94A0A8' }}>{r.months} งวด</span>
                    <span className="num" style={{ fontWeight: 600, color: '#30506A' }}>{baht(r.income)}</span>
                    <span className="num" style={{ fontSize: 12, color: '#C24036' }}>ภาษี {baht(r.tax)}</span>
                  </div>
                ))}
                <button onClick={() => setWhtRows(null)} style={{ marginTop: 12, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#5C6770', background: '#F1F4F6', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>ปิด</button>
              </div>
            </div>
          )}
          {annual && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, padding: '14px 18px', borderBottom: '1px solid #EEF1F4', background: '#FAFBFC' }}>
              <div><div style={{ fontSize: 12, color: '#5C6770' }}>รวมจ่ายเงินเดือนทั้งปี {new Date().getFullYear() + 543}</div><div className="num" style={{ fontSize: 20, fontWeight: 700, color: '#1C2730', marginTop: 3 }}>{baht(annual.net)}</div><div style={{ fontSize: 11, color: '#94A0A8' }}>จากงวดที่ปิดแล้ว {annual.months} เดือน</div></div>
              <div><div style={{ fontSize: 12, color: '#5C6770' }}>ประกันสังคมสะสม (ลูกจ้าง)</div><div className="num" style={{ fontSize: 20, fontWeight: 700, color: '#C0852C', marginTop: 3 }}>{baht(annual.sso)}</div><div style={{ fontSize: 11, color: '#94A0A8' }}>นายจ้างสมทบอีก {baht(annual.sso)}</div></div>
              <div><div style={{ fontSize: 12, color: '#5C6770' }}>ประกันสังคมนำส่งรวม (2 ฝ่าย)</div><div className="num" style={{ fontSize: 20, fontWeight: 700, color: '#30506A', marginTop: 3 }}>{baht(annual.sso * 2)}</div><div style={{ fontSize: 11, color: '#94A0A8' }}>ทั้งปี {new Date().getFullYear() + 543}</div></div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid #EEF1F4' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>สรุปเงินเดือน</span>
            <span style={{ fontSize: 12.5, color: '#5C6770' }}>งวด</span>
            <select value={payrollMeta?.period || ''} onChange={(e) => app.viewPayrollPeriod(e.target.value)} style={{ ...field, width: 'auto', padding: '5px 9px', fontSize: 12.5 }}>
              {periodOptions.map(([p, label]) => <option key={p} value={p}>{label}</option>)}
            </select>
            {payrollMeta?.locked
              ? <span style={{ fontSize: 11, fontWeight: 600, color: '#2E7D55', background: '#E2F1EA', padding: '3px 10px', borderRadius: 20 }}>ปิดงวดแล้ว 🔒</span>
              : <span style={{ fontSize: 11, fontWeight: 600, color: '#B7791F', background: '#F6ECD6', padding: '3px 10px', borderRadius: 20 }}>ยังไม่ปิดงวด (คำนวณสด)</span>}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {payrollMeta && payroll && (
                <button onClick={() => setShowAllSlips(true)} title="พิมพ์สลิปเงินเดือนทุกคนครั้งเดียว (คนละหน้า A4)" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#2E7D55', background: '#fff', border: '1px solid #CDE3D6', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>🖨 สลิปทุกคน</button>
              )}
              {payrollMeta && payroll && (
                <button onClick={() => setShowSummary(true)} title="พิมพ์ใบสรุปการจ่ายค่าจ้าง/เงินเดือนทั้งบริษัท (แนวนอน)" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>🖨 ใบสรุปการจ่ายค่าจ้าง</button>
              )}
              {payrollMeta && (
                <button onClick={() => apiClient.download('/payroll/bank-file?period=' + payrollMeta.period).catch((e) => alert((e as Error).message))} title="ดาวน์โหลดไฟล์จ่ายเงินเดือนผ่านธนาคาร (CSV)" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>⬇ ไฟล์จ่ายผ่านธนาคาร</button>
              )}
              {payrollMeta && (
                <button onClick={() => apiClient.download('/payroll/sso-file?period=' + payrollMeta.period).catch((e) => alert((e as Error).message))} title="รายชื่อ + ค่าจ้าง + เงินสมทบของงวด (สำหรับยื่น สปส.1-10)" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#C0852C', background: '#fff', border: '1px solid #ECDCB8', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>⬇ ไฟล์ สปส.</button>
              )}
              <button onClick={() => apiClient.download('/payroll/pnd1k?year=' + new Date().getFullYear()).catch((e) => alert((e as Error).message))} title="สรุปเงินได้ + ภาษีหักนำส่งทั้งปีต่อคน (สำหรับยื่น ภงด.1ก)" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#6B4E9E', background: '#fff', border: '1px solid #DDD3EE', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>⬇ ภงด.1ก</button>
              <button onClick={openWhtList} title="พิมพ์หนังสือรับรองหักภาษี ณ ที่จ่าย (50 ทวิ) รายพนักงาน" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#2E7D55', background: '#fff', border: '1px solid #CDE3D6', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>🧾 50 ทวิ</button>
              {!payrollMeta?.locked && payrollMeta && (
                <button onClick={async () => { const lbl = payrollMeta.periodLabel; if (!window.confirm(`ปิดงวดเงินเดือน ${lbl}?\nตัวเลขจะถูกล็อก (แก้ไม่ได้) และระบบจะลงบัญชีค่าใช้จ่ายเงินเดือนเข้าบัญชีแยกประเภท (GL) ให้อัตโนมัติ`)) return; await app.closePayroll(payrollMeta.period); alert(`ปิดงวด ${lbl} แล้ว · ลงบัญชีค่าใช้จ่ายเงินเดือนเข้าบัญชีแยกประเภท (GL) ให้อัตโนมัติแล้ว`) }} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>ปิดงวด / ออกเงินเดือน</button>
              )}
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
              <th style={{ ...th, padding: '9px 18px' }}>ชื่อ-สกุล</th><th style={{ ...th, textAlign: 'right' }}>ฐานเงิน</th><th style={{ ...th, textAlign: 'right' }}>OT</th>
              <th style={{ ...th, textAlign: 'right' }}>ปกส.</th><th style={{ ...th, textAlign: 'right' }}>ภาษี <span style={{ fontWeight: 400, color: '#94A0A8', fontSize: 10 }}>(แก้ได้)</span></th>
              <th style={{ ...th, textAlign: 'right' }}>หักลา/ขาด</th><th style={{ ...th, textAlign: 'right' }}>Retention <span style={{ fontWeight: 400, color: '#94A0A8', fontSize: 10 }}>(แก้ได้)</span></th><th style={{ ...th, textAlign: 'right' }}>กยศ <span style={{ fontWeight: 400, color: '#94A0A8', fontSize: 10 }}>(แก้ได้)</span></th><th style={{ ...th, textAlign: 'right' }}>เบิกล่วงหน้า</th><th style={{ ...th, textAlign: 'right' }}>หักอื่นๆ</th><th style={{ ...th, textAlign: 'right' }}>สุทธิ</th>
              <th style={{ ...th, padding: '9px 18px', textAlign: 'center' }}>สลิป</th>
            </tr></thead>
            <tbody>
              {(payroll || []).length === 0 && <tr><td colSpan={12} style={{ padding: 36, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีพนักงาน</td></tr>}
              {(payroll || []).map((p) => {
                const deduct = p.leave_deduct || 0
                const ret = p.retention ?? 0, loan = p.student_loan || 0, adv = p.advance || 0, otherDed = p.other_deduct || 0
                const net = (p.base + p.ot) - p.sso - p.tax - deduct - ret - loan - adv - otherDed
                return (
                  <tr key={p.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                    <td style={{ ...td, padding: '10px 18px', fontWeight: 500 }}>{p.name} <span style={{ fontSize: 11, color: '#94A0A8' }}>({p.pay_type || 'รายเดือน'})</span>{p.exempt_attendance ? <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 600, color: '#2E7D55', background: '#E7F3EC', padding: '1px 7px', borderRadius: 20 }}>ไม่ต้องลงเวลา</span> : null}</td>
                    <td className="num" style={{ ...td, textAlign: 'right' }}>
                      {baht(p.base)}
                      {p.pay_type === 'รายวัน' ? (
                        <span style={{ display: 'block', fontSize: 10, color: '#94A0A8', marginTop: 2 }}>
                          {payrollMeta?.locked
                            ? `${p.work_days || 0} วัน × ${baht(p.daily_rate || 0)}`
                            : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }} title="กรอกจำนวนวันทำงาน → คิดเงินอัตโนมัติ">
                                <input key={p.id + '-wd-' + (p.work_days || 0)} type="text" inputMode="decimal" defaultValue={String(p.work_days || 0)}
                                  disabled={wdSaving === p.id}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                                  onBlur={(e) => { if (parseDays(e.target.value) !== (p.work_days || 0)) saveWorkDays(p.id, e.target.value) }}
                                  style={{ width: 46, textAlign: 'right', fontFamily: 'inherit', fontSize: 11, padding: '1px 4px', border: '1px solid #D8DFE5', borderRadius: 5, background: '#fff', color: '#1C2730' }} />
                                <span>วัน × {baht(p.daily_rate || 0)}</span>
                              </span>
                            )}
                        </span>
                      ) : null}
                    </td>
                    <td className="num" style={{ ...td, textAlign: 'right', color: '#5C6770' }}>{baht(p.ot)}</td>
                    <td className="num" style={{ ...td, textAlign: 'right', color: '#C0852C' }}>{baht(p.sso)}</td>
                    <td className="num" style={{ ...td, textAlign: 'right' }}>
                      {payrollMeta?.locked
                        ? <span style={{ color: '#C0852C' }}>{baht(p.tax)}</span>
                        : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }} title="กรอกภาษีเอง">
                            <span style={{ color: '#C0852C', fontSize: 12 }}>฿</span>
                            <input key={p.id + '-tax-' + (p.tax || 0)} type="text" inputMode="numeric" defaultValue={String(p.tax || 0)}
                              disabled={taxSaving === p.id}
                              onFocus={(e) => e.currentTarget.select()}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                              onBlur={(e) => { if (unMoney(e.target.value) !== (p.tax || 0)) saveTax(p.id, e.target.value) }}
                              style={{ width: 62, textAlign: 'right', fontFamily: 'inherit', fontSize: 12.5, padding: '3px 6px', border: '1px solid #D8DFE5', borderRadius: 6, background: '#fff', color: '#C0852C' }} />
                          </span>
                        )}
                    </td>
                    <td className="num" style={{ ...td, textAlign: 'right', color: deduct ? '#C24036' : '#94A0A8' }}>{deduct ? '-' + baht(deduct) : '฿0'}{(p.leave_days || p.absent_days) ? <span style={{ fontSize: 10, color: '#94A0A8' }}> ({p.leave_days ? 'ลา' + p.leave_days : ''}{p.leave_days && p.absent_days ? '+' : ''}{p.absent_days ? 'ขาด' + p.absent_days : ''}ว)</span> : null}</td>
                    <td className="num" style={{ ...td, textAlign: 'right' }}>
                      {payrollMeta?.locked
                        ? <span style={{ color: ret ? '#C24036' : '#94A0A8' }}>{ret ? '-' + baht(ret) : '฿0'}</span>
                        : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }} title="แก้ยอดหักต่อเดือนได้ · คนที่หักครบแล้วใส่ 0">
                            <span style={{ color: (p.retention_monthly ?? ret) ? '#C24036' : '#94A0A8', fontSize: 12 }}>-฿</span>
                            <input key={p.id + '-' + (p.retention_monthly ?? ret)} type="text" inputMode="numeric" defaultValue={String(p.retention_monthly ?? ret ?? 0)}
                              disabled={retSaving === p.id}
                              onFocus={(e) => e.currentTarget.select()}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                              onBlur={(e) => { if (unMoney(e.target.value) !== (p.retention_monthly ?? ret ?? 0)) saveRetentionMonthly(p.id, e.target.value) }}
                              style={{ width: 58, textAlign: 'right', fontFamily: 'inherit', fontSize: 12.5, padding: '3px 6px', border: '1px solid #D8DFE5', borderRadius: 6, background: '#fff', color: '#C24036' }} />
                          </span>
                        )}
                      {(p.retention_cap) ? <span style={{ display: 'block', fontSize: 10, color: ((p.retention_paid || 0) >= p.retention_cap) ? '#2E7D55' : '#94A0A8' }}>{((p.retention_paid || 0) >= p.retention_cap) ? 'ครบแล้ว' : `สะสม ${baht(p.retention_paid || 0)}/${baht(p.retention_cap)}`}</span> : null}
                    </td>
                    <td className="num" style={{ ...td, textAlign: 'right' }}>
                      {payrollMeta?.locked
                        ? <span style={{ color: loan ? '#C24036' : '#94A0A8' }}>{loan ? '-' + baht(loan) : '฿0'}</span>
                        : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }} title="แก้ยอดหัก กยศ ต่อเดือนได้ · ไม่มีให้ใส่ 0">
                            <span style={{ color: loan ? '#C24036' : '#94A0A8', fontSize: 12 }}>-฿</span>
                            <input key={p.id + '-loan-' + loan} type="text" inputMode="numeric" defaultValue={String(loan ?? 0)}
                              disabled={loanSaving === p.id}
                              onFocus={(e) => e.currentTarget.select()}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                              onBlur={(e) => { if (unMoney(e.target.value) !== (loan ?? 0)) saveStudentLoan(p.id, e.target.value) }}
                              style={{ width: 58, textAlign: 'right', fontFamily: 'inherit', fontSize: 12.5, padding: '3px 6px', border: '1px solid #D8DFE5', borderRadius: 6, background: '#fff', color: '#C24036' }} />
                          </span>
                        )}
                    </td>
                    <td className="num" style={{ ...td, textAlign: 'right', color: adv ? '#C24036' : '#94A0A8' }}>{adv ? '-' + baht(adv) : '฿0'}</td>
                    <td className="num" style={{ ...td, textAlign: 'right', color: otherDed ? '#C24036' : '#94A0A8' }}>{otherDed ? '-' + baht(otherDed) : '฿0'}</td>
                    <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#2E7D55' }}>{baht(net)}</td>
                    <td style={{ ...td, padding: '10px 18px', textAlign: 'center' }}>
                      <button onClick={() => onPrint('slip', { ...p, period: payrollMeta?.periodLabel })} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 500, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '5px 11px', cursor: 'pointer' }}>พิมพ์</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* เบิกเงินเดือนล่วงหน้า */}
          <div style={{ borderTop: '8px solid #F3F5F7' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #EEF1F4', fontSize: 13.5, fontWeight: 600 }}>เบิกเงินเดือนล่วงหน้า (งวด {payrollMeta?.periodLabel}) <span style={{ fontWeight: 400, color: '#94A0A8', fontSize: 11.5 }}>· เบิกได้ไม่เกิน (วันมาทำงาน ÷ 2) × ค่าจ้าง/วัน · สิ้นเดือนหักคืนจากยอดสุทธิ</span></div>
            {payrollMeta?.locked && <div style={{ fontSize: 12.5, color: '#8A6D1F', background: '#FBF4E1', padding: '8px 18px' }}>งวดนี้ปิดแล้ว — บันทึก/ลบการเบิกไม่ได้ (ยอดจะไม่ถูกหักในเงินเดือน) เลือกงวดที่ยังไม่ปิดก่อน</div>}
            {!payrollMeta?.locked && <div style={{ padding: '12px 18px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: '#FAFBFC', borderBottom: '1px solid #EEF1F4' }}>
              <select style={{ ...field, width: 'auto', minWidth: 180 }} value={advForm.emp_code} onChange={(e) => setAdvForm({ ...advForm, emp_code: e.target.value })}>
                <option value="">เลือกพนักงาน</option>
                {employees.map((e) => <option key={e.code} value={e.code}>{e.name}</option>)}
              </select>
              <MoneyInput style={{ ...field, width: 130 }} placeholder="จำนวนเงิน" value={advForm.amount} onChange={(v) => setAdvForm({ ...advForm, amount: v })} />
              <input style={{ ...field, flex: 1, minWidth: 140 }} placeholder="หมายเหตุ (ถ้ามี)" value={advForm.note} onChange={(e) => setAdvForm({ ...advForm, note: e.target.value })} />
              <button onClick={submitAdvance} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>บันทึกเบิก</button>
              {advLimit && advForm.emp_code && <span style={{ fontSize: 12, color: advLimit.remaining > 0 ? '#2E7D55' : '#C24036' }}>มาทำงาน {advLimit.worked} วัน · เบิกได้อีก <b>{baht(advLimit.remaining)}</b> (เพดาน {baht(advLimit.limit)} · เบิกแล้ว {baht(advLimit.taken)})</span>}
            </div>}
            {advErr && <div style={{ fontSize: 12.5, color: '#C24036', padding: '8px 18px' }}>{advErr}</div>}
            {advances.length === 0
              ? <div style={{ padding: 20, textAlign: 'center', color: '#94A0A8', fontSize: 13 }}>ยังไม่มีการเบิกล่วงหน้าในงวดนี้</div>
              : advances.map((g) => (
                <div key={g.emp_code} style={{ borderTop: '1px solid #EEF1F4' }}>
                  {/* หัวข้อรายคน — เบิกกี่รอบ/รวม/เหลือ */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', flexWrap: 'wrap', background: '#FBFCFD' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, minWidth: 140 }}>{g.emp_name}</span>
                    <span style={{ fontSize: 12, color: '#5C6770' }}>มาทำงาน {g.worked} วัน · เพดาน {baht(g.limit)}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#30506A', background: '#E9EFF3', padding: '2px 10px', borderRadius: 20 }}>เบิกแล้ว {g.count} รอบ = {baht(g.taken)}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: g.remaining > 0 ? '#2E7D55' : '#C24036' }}>เหลือเบิกได้ {baht(g.remaining)}</span>
                  </div>
                  {/* แต่ละรอบ */}
                  <div style={{ padding: '2px 18px 10px 30px' }}>
                    {g.rounds.map((r, i) => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: 12.5, borderTop: i ? '1px dashed #EEF1F4' : 'none' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#5C6770', background: '#F1F4F6', padding: '1px 9px', borderRadius: 20 }}>รอบ {i + 1}</span>
                        <span className="num" style={{ color: '#94A0A8' }}>{r.date}</span>
                        <span style={{ color: '#5C6770', flex: 1 }}>{r.note || ''}</span>
                        <span className="num" style={{ fontWeight: 600, color: '#C24036' }}>{baht(r.amount)}</span>
                        {!payrollMeta?.locked && <button onClick={() => delAdvance(r.id)} title="ยกเลิกรอบนี้" style={{ border: 'none', background: 'none', color: '#C24036', cursor: 'pointer', fontSize: 13 }}>✕</button>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>

          {/* หักอื่นๆ (พร้อมเหตุผล) — หักจากเงินเดือนงวดนี้ */}
          <div style={{ borderTop: '8px solid #F3F5F7' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #EEF1F4', fontSize: 13.5, fontWeight: 600 }}>หักอื่นๆ (งวด {payrollMeta?.periodLabel}) <span style={{ fontWeight: 400, color: '#94A0A8', fontSize: 11.5 }}>· ใส่จำนวนเงิน + เหตุผล → หักออกจากยอดสุทธิของงวดนี้ (เช่น ค่าปรับ ของเสียหาย เบิกของ)</span></div>
            {payrollMeta?.locked && <div style={{ fontSize: 12.5, color: '#8A6D1F', background: '#FBF4E1', padding: '8px 18px' }}>งวดนี้ปิดแล้ว — บันทึก/ลบการหักไม่ได้ เลือกงวดที่ยังไม่ปิดก่อน</div>}
            {!payrollMeta?.locked && <div style={{ padding: '12px 18px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: '#FAFBFC', borderBottom: '1px solid #EEF1F4' }}>
              <select style={{ ...field, width: 'auto', minWidth: 180 }} value={dedForm.emp_code} onChange={(e) => setDedForm({ ...dedForm, emp_code: e.target.value })}>
                <option value="">เลือกพนักงาน</option>
                {employees.map((e) => <option key={e.code} value={e.code}>{e.name}</option>)}
              </select>
              <MoneyInput style={{ ...field, width: 130 }} placeholder="จำนวนที่หัก" value={dedForm.amount} onChange={(v) => setDedForm({ ...dedForm, amount: v })} />
              <input style={{ ...field, flex: 1, minWidth: 180 }} placeholder="เหตุผลการหัก *" value={dedForm.reason} onChange={(e) => setDedForm({ ...dedForm, reason: e.target.value })} />
              <button onClick={submitDed} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#C24036', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>บันทึกหัก</button>
            </div>}
            {dedErr && <div style={{ fontSize: 12.5, color: '#C24036', padding: '8px 18px' }}>{dedErr}</div>}
            {deds.length === 0
              ? <div style={{ padding: 20, textAlign: 'center', color: '#94A0A8', fontSize: 13 }}>ยังไม่มีการหักอื่นๆ ในงวดนี้</div>
              : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
                    <th style={{ ...th, padding: '9px 18px' }}>พนักงาน</th>
                    <th style={th}>เหตุผล</th>
                    <th style={{ ...th, textAlign: 'right' }}>วันที่</th>
                    <th style={{ ...th, textAlign: 'right' }}>จำนวนที่หัก</th>
                    <th style={{ ...th, textAlign: 'center', padding: '9px 18px' }}></th>
                  </tr></thead>
                  <tbody>
                    {deds.map((d) => (
                      <tr key={d.id} style={{ borderTop: '1px solid #EEF1F4' }}>
                        <td style={{ ...td, padding: '9px 18px', fontWeight: 500 }}>{d.emp_name}</td>
                        <td style={{ ...td, color: '#5C6770' }}>{d.reason}</td>
                        <td className="num" style={{ ...td, textAlign: 'right', color: '#94A0A8' }}>{d.date}</td>
                        <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#C24036' }}>-{baht(d.amount)}</td>
                        <td style={{ ...td, textAlign: 'center', padding: '9px 18px' }}>
                          {!payrollMeta?.locked && <button onClick={() => delDed(d.id)} title="ยกเลิกรายการหักนี้" style={{ border: 'none', background: 'none', color: '#C24036', cursor: 'pointer', fontSize: 14 }}>✕</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>

          {/* สรุป Retention สะสมต่อคน — หักไปแล้วเท่าไหร่ / ครบ 5,000 หรือยัง */}
          <div style={{ borderTop: '8px solid #F3F5F7' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #EEF1F4', fontSize: 13.5, fontWeight: 600 }}>เงินประกันผลงาน (Retention) สะสมต่อคน <span style={{ fontWeight: 400, color: '#94A0A8', fontSize: 11.5 }}>· หักเดือนละ 500 จนครบ {baht(retSum?.cap || 5000)} แล้วหยุดหักเอง · นับจากงวดที่ปิดแล้ว + ยอดยกมา</span></div>
            {!retSum || retSum.rows.length === 0
              ? <div style={{ padding: 20, textAlign: 'center', color: '#94A0A8', fontSize: 13 }}>ยังไม่มีข้อมูล</div>
              : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
                    <th style={{ ...th, padding: '9px 18px' }}>ชื่อ-สกุล</th>
                    <th style={{ ...th, textAlign: 'right' }}>หัก/เดือน</th>
                    <th style={{ ...th, textAlign: 'right' }}>สะสมแล้ว</th>
                    <th style={{ ...th, textAlign: 'right' }}>เหลือถึงเพดาน</th>
                    <th style={{ ...th, textAlign: 'center', padding: '9px 18px' }}>สถานะ</th>
                  </tr></thead>
                  <tbody>
                    {retSum.rows.map((r) => {
                      const pct = Math.min(100, Math.round((r.paid / (retSum.cap || 5000)) * 100))
                      return (
                        <tr key={r.code} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                          <td style={{ ...td, padding: '10px 18px', fontWeight: 500 }}>{r.name}</td>
                          <td className="num" style={{ ...td, textAlign: 'right', color: r.done ? '#94A0A8' : '#5C6770' }}>{baht(r.monthly)}</td>
                          <td style={{ ...td, textAlign: 'right' }}>
                            <div className="num" style={{ fontWeight: 600, color: '#1C2730' }}>{baht(r.paid)} / {baht(retSum.cap)}</div>
                            <div style={{ height: 5, background: '#EEF1F4', borderRadius: 4, marginTop: 4, overflow: 'hidden' }}><div style={{ width: pct + '%', height: '100%', background: r.done ? '#2E7D55' : '#C0852C' }} /></div>
                          </td>
                          <td className="num" style={{ ...td, textAlign: 'right', color: r.remaining ? '#C0852C' : '#2E7D55' }}>{baht(r.remaining)}</td>
                          <td style={{ ...td, textAlign: 'center', padding: '10px 18px' }}>
                            {r.done
                              ? <span style={{ fontSize: 11.5, fontWeight: 600, color: '#2E7D55', background: '#E7F3EC', padding: '2px 10px', borderRadius: 20 }}>ครบแล้ว</span>
                              : <span style={{ fontSize: 11.5, fontWeight: 600, color: '#C0852C', background: '#FBF3E4', padding: '2px 10px', borderRadius: 20 }}>กำลังหัก</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
          </div>
          </>
        )}

        {/* ===== OT ===== */}
        {tab === 'ot' && (
          <>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid #EEF1F4' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>รายการ OT</span>
            <button onClick={() => setAddingOt((v) => !v)} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>+ เพิ่ม OT</button>
          </div>
          {addingOt && (
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF1F4', background: '#FAFBFC' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.8fr 0.8fr 1fr', gap: 10 }}>
                <select style={field} value={otForm.emp_code} onChange={(e) => setOtForm({ ...otForm, emp_code: e.target.value })}>
                  <option value="">เลือกพนักงาน *</option>
                  {employees.map((e) => <option key={e.code} value={e.code}>{e.name}</option>)}
                </select>
                <input style={field} type="date" value={otForm.date} onChange={(e) => setOtForm({ ...otForm, date: e.target.value })} />
                <input style={field} placeholder="ชั่วโมง" value={otForm.hours} onChange={(e) => setOtForm({ ...otForm, hours: e.target.value })} />
                <input style={field} placeholder="อัตรา" value={otForm.rate} onChange={(e) => setOtForm({ ...otForm, rate: e.target.value })} />
                <MoneyInput style={field} placeholder="จำนวนเงิน *" value={otForm.amount} onChange={(v) => setOtForm({ ...otForm, amount: v })} />
              </div>
              {otErr && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 8 }}>{otErr}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                <button onClick={() => setAddingOt(false)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>ยกเลิก</button>
                <button onClick={submitOt} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>บันทึก</button>
              </div>
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
              <th style={{ ...th, padding: '9px 18px' }}>ชื่อ-สกุล</th><th style={th}>วันที่</th><th style={{ ...th, textAlign: 'center' }}>ชั่วโมง</th>
              <th style={{ ...th, textAlign: 'center' }}>อัตรา</th><th style={{ ...th, textAlign: 'right' }}>จำนวนเงิน</th><th style={{ ...th, padding: '9px 18px', textAlign: 'center' }}>สถานะ</th>
            </tr></thead>
            <tbody>
              {otRecords.length === 0 && <tr><td colSpan={6} style={{ padding: 36, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีรายการ OT</td></tr>}
              {otRecords.map((o) => (
                <tr key={o.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td style={{ ...td, padding: '10px 18px', fontWeight: 500 }}>{o.name}</td>
                  <td className="num" style={{ ...td, color: '#5C6770' }}>{o.date}</td>
                  <td className="num" style={{ ...td, textAlign: 'center' }}>{o.hours}</td>
                  <td className="num" style={{ ...td, textAlign: 'center', color: '#5C6770' }}>{o.rate}</td>
                  <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{baht(o.amount)}</td>
                  <td style={{ ...td, padding: '10px 18px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Pill s={o.status} />
                      {o.status === 'รออนุมัติ' && isMgr && <button onClick={() => app.approveOt(o.id)} style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>อนุมัติ</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}

        {/* ===== attendance (kiosk) ===== */}
        {tab === 'attendance' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid #EEF1F4', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>บันทึกการลงเวลา</span>
              <span style={{ fontSize: 12.5, color: '#5C6770' }}>เดือน</span>
              <input type="month" value={attListMonth} disabled={attAll} onChange={(e) => setAttListMonth(e.target.value)} style={{ ...field, width: 'auto', padding: '5px 9px', fontSize: 12.5, opacity: attAll ? 0.5 : 1 }} />
              <label style={{ fontSize: 12.5, color: '#5C6770', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}><input type="checkbox" checked={attAll} onChange={(e) => setAttAll(e.target.checked)} /> ดูทั้งหมดทุกเดือน</label>
              <span style={{ fontSize: 12, color: '#94A0A8' }}>{attList.length} รายการ</span>
            </div>
            {/* เพิ่ม/แก้ไขด้วยมือ (กรณีลืมตอกบัตร หรือวันที่ระบบยังไม่เปิด) */}
            <div style={{ padding: '12px 18px', background: '#FAFBFC', borderBottom: '1px solid #EEF1F4', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#5C6770' }}>เพิ่ม/แก้ไข:</span>
              <select style={{ ...field, width: 'auto', minWidth: 150 }} value={attForm.emp_code} onChange={(e) => setAttForm({ ...attForm, emp_code: e.target.value })}>
                <option value="">เลือกพนักงาน</option>
                {employees.filter((e) => e.status !== 'ลาออก').map((e) => <option key={e.code} value={e.code}>{e.name}</option>)}
              </select>
              <input type="date" style={{ ...field, width: 'auto' }} value={attForm.date} onChange={(e) => setAttForm({ ...attForm, date: e.target.value })} />
              <input style={{ ...field, width: 90 }} placeholder="เข้า 08:00" value={attForm.check_in} onChange={(e) => setAttForm({ ...attForm, check_in: e.target.value })} />
              <input style={{ ...field, width: 90 }} placeholder="ออก 17:00" value={attForm.check_out} onChange={(e) => setAttForm({ ...attForm, check_out: e.target.value })} />
              <button onClick={saveManualAtt} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>บันทึกคนนี้</button>
              <button onClick={markAllPresent} title="ให้พนักงานทุกคนที่ยังไม่มีบันทึกในวันนี้ = มาทำงาน" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#2E7D55', background: '#fff', border: '1px solid #CDE3D6', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>มาทำงานทั้งวัน (ทุกคน)</button>
              {attMsg && <span style={{ fontSize: 12, color: attMsg.includes('แล้ว') ? '#2E7D55' : '#C24036' }}>{attMsg}</span>}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
                <th style={{ ...th, padding: '9px 18px' }}>ชื่อ-สกุล</th><th style={th}>วันที่</th><th style={{ ...th, textAlign: 'center' }}>เข้างาน</th>
                <th style={{ ...th, textAlign: 'center' }}>ออกงาน</th><th style={{ ...th, textAlign: 'center' }}>สถานะ</th><th style={{ ...th, padding: '9px 18px', textAlign: 'center' }}>จัดการ</th>
              </tr></thead>
              <tbody>
                {attList.length === 0 && <tr><td colSpan={6} style={{ padding: 36, textAlign: 'center', color: '#94A0A8' }}>ไม่มีบันทึกลงเวลาในเดือนนี้</td></tr>}
                {attList.map((a) => {
                  const s = attendanceStyle(a.status)
                  return (<tr key={a.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                    <td style={{ ...td, padding: '10px 18px', fontWeight: 500 }}>{a.emp_name}</td><td className="num" style={{ ...td, color: '#5C6770' }}>{a.date}</td>
                    <td className="num" style={{ ...td, textAlign: 'center' }}>{a.check_in || '—'}</td><td className="num" style={{ ...td, textAlign: 'center', color: '#5C6770' }}>{a.check_out || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}><span style={{ fontSize: 11, fontWeight: 600, color: s.c, background: s.bg, padding: '2px 10px', borderRadius: 20 }}>{a.status}</span></td>
                    <td style={{ ...td, padding: '10px 18px', textAlign: 'center' }}>
                      <button onClick={() => setAttForm({ emp_code: a.emp_code, date: a.date, check_in: a.check_in || '08:00', check_out: a.check_out || '17:00' })} title="ดึงขึ้นไปแก้ด้านบน" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '3px 9px', cursor: 'pointer', marginRight: 5 }}>แก้ไข</button>
                      <button onClick={() => delAtt(a.id)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#C24036', background: '#fff', border: '1px solid #E7CDC9', borderRadius: 7, padding: '3px 9px', cursor: 'pointer' }}>ลบ</button>
                    </td>
                  </tr>)
                })}
              </tbody>
            </table>
          </>
        )}

        {/* ===== monthly attendance summary ===== */}
        {tab === 'attsummary' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid #EEF1F4' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>สรุปการลงเวลารายเดือน</span>
              <span style={{ fontSize: 12.5, color: '#5C6770' }}>เดือน</span>
              <input type="month" value={attMonth} onChange={(e) => setAttMonth(e.target.value)} style={{ ...field, width: 'auto', padding: '5px 9px', fontSize: 12.5 }} />
              {attSum && <span style={{ fontSize: 12, color: '#94A0A8' }}>{attSum.periodLabel} · {attSum.rows.length} คน</span>}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
                <th style={{ ...th, padding: '9px 18px' }}>ชื่อ-สกุล</th><th style={th}>ตำแหน่ง</th>
                <th style={{ ...th, textAlign: 'center' }}>มาทำงาน</th><th style={{ ...th, textAlign: 'center' }}>สาย</th>
                <th style={{ ...th, textAlign: 'center' }}>ขาด</th><th style={{ ...th, textAlign: 'center' }}>ลา</th>
              </tr></thead>
              <tbody>
                {(!attSum || attSum.rows.length === 0) && <tr><td colSpan={6} style={{ padding: 36, textAlign: 'center', color: '#94A0A8' }}>{attSum ? 'ไม่มีข้อมูลในเดือนนี้' : 'กำลังโหลด…'}</td></tr>}
                {attSum?.rows.map((r) => (
                  <tr key={r.code} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6', cursor: 'pointer' }} onClick={() => openDetail(r.code)} title="คลิกดูรายวัน">
                    <td style={{ ...td, padding: '10px 18px', fontWeight: 500 }}>{r.name} <span style={{ fontSize: 11, color: '#30506A' }}>›</span></td>
                    <td style={{ ...td, color: '#5C6770' }}>{r.role || '—'}</td>
                    <td className="num" style={{ ...td, textAlign: 'center', fontWeight: 600, color: '#2E7D55' }}>{r.came}{r.adj ? <span style={{ display: 'block', fontSize: 9.5, fontWeight: 500, color: '#94A0A8' }}>(ปรับปรุง {r.adj})</span> : null}</td>
                    <td className="num" style={{ ...td, textAlign: 'center', fontWeight: 600, color: r.late ? '#B7791F' : '#94A0A8' }}>{r.late}</td>
                    <td className="num" style={{ ...td, textAlign: 'center', fontWeight: 600, color: r.absent ? '#C24036' : '#94A0A8' }}>{r.no_attendance ? <span style={{ fontSize: 10, fontWeight: 600, color: '#2E7D55' }}>ไม่ต้องลงเวลา</span> : r.absent}</td>
                    <td className="num" style={{ ...td, textAlign: 'center', color: r.leave ? '#30506A' : '#94A0A8' }}>{r.leave}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 11.5, color: '#94A0A8', padding: '10px 18px' }}>“มาทำงาน” รวมวันที่มาสายด้วย · “ขาด” = วันทำงาน (จ.–ส.) ที่ไม่มาและไม่มีใบลา/ปรับปรุงเวลา · อาทิตย์เป็นวันหยุด · <b>คลิกชื่อคนเพื่อดูรายวัน</b></div>
            {/* ----- รายละเอียดรายวันต่อคน ----- */}
            {(detail || detailLoading) && (
              <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,28,36,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
                <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 620, maxWidth: '100%', maxHeight: '86vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
                  {detailLoading && !detail ? <div style={{ padding: 40, textAlign: 'center', color: '#94A0A8' }}>กำลังโหลด…</div> : detail && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid #EEF1F4', position: 'sticky', top: 0, background: '#fff' }}>
                        <div><div style={{ fontSize: 16, fontWeight: 700 }}>{detail.name}</div><div style={{ fontSize: 12, color: '#94A0A8' }}>{detail.role} · {attSum?.periodLabel}</div></div>
                        <button onClick={() => setDetail(null)} style={{ marginLeft: 'auto', border: 'none', background: '#F1F4F6', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#5C6770' }}>✕</button>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 20px', fontSize: 12 }}>
                        <span style={{ color: '#2E7D55', fontWeight: 600 }}>มา {detail.counts.came}</span>
                        {detail.counts.adj > 0 && <span style={{ color: '#5C6770' }}>· ปรับปรุง {detail.counts.adj}</span>}
                        {detail.counts.late > 0 && <span style={{ color: '#B7791F' }}>· สาย {detail.counts.late}</span>}
                        {detail.counts.leave > 0 && <span style={{ color: '#30506A' }}>· ลา {detail.counts.leave}</span>}
                        {!detail.no_attendance && <span style={{ color: '#C24036', fontWeight: 600 }}>· ขาด {detail.counts.absent}</span>}
                      </div>
                      {!detail.no_attendance && detail.counts.absent > 0 && (
                        <div style={{ margin: '0 20px 10px', padding: '8px 12px', background: '#FBF6EC', border: '1px solid #ECDCB8', borderRadius: 9, fontSize: 12, color: '#8A6D3B' }}>
                          วันที่ขึ้น “ขาด” = ไม่มีบัตรตอกและไม่มีปรับปรุงเวลา — ถ้าจริงๆ มาทำงาน กดปุ่ม “เติมมา” ในวันนั้นได้เลย
                        </div>
                      )}
                      <div style={{ padding: '0 20px 20px' }}>
                        {detail.days.map((d) => {
                          const wd = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'][d.dow]
                          const st = d.status
                          const col = st === 'มา' ? { c: '#2E7D55', bg: '#E7F3EC' } : st === 'สาย' ? { c: '#B7791F', bg: '#F6ECD6' } : st === 'ปรับปรุง' ? { c: '#30506A', bg: '#E2E9EF' } : st === 'ลา' ? { c: '#30506A', bg: '#E2E9EF' } : st === 'หยุด' ? { c: '#94A0A8', bg: '#F1F4F6' } : st === 'ยกเว้น' ? { c: '#2E7D55', bg: '#E7F3EC' } : { c: '#C24036', bg: '#FBEEEC' }
                          const dnum = Number(d.date.slice(8, 10))
                          return (
                            <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px', borderTop: '1px solid #F4F6F8' }}>
                              <span className="num" style={{ width: 30, textAlign: 'right', fontWeight: 600, color: d.dow === 0 ? '#C0852C' : '#3C4750' }}>{dnum}</span>
                              <span style={{ width: 26, fontSize: 11.5, color: '#94A0A8' }}>{wd}</span>
                              <span style={{ fontSize: 11.5, fontWeight: 600, color: col.c, background: col.bg, padding: '2px 10px', borderRadius: 20, minWidth: 62, textAlign: 'center' }}>{st === 'ยกเว้น' ? 'ไม่ต้องลงเวลา' : st}</span>
                              {d.check_in && <span className="num" style={{ fontSize: 12, color: '#5C6770' }}>{d.check_in}{d.check_out ? ' – ' + d.check_out : ''}</span>}
                              {st === 'ขาด' && <button onClick={() => fillDay(detail.code, d.date)} className="hov-f3f5f7" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#2E7D55', background: '#fff', border: '1px solid #CDE3D6', borderRadius: 7, padding: '3px 11px', cursor: 'pointer' }}>+ เติมมา</button>}
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== company holidays ===== */}
        {tab === 'holidays' && (
          <>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #EEF1F4' }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>วันหยุดบริษัท <span style={{ fontWeight: 400, color: '#94A0A8', fontSize: 12 }}>· วันเหล่านี้จะไม่ถูกนับเป็น “ขาด” ในการลงเวลา (อาทิตย์เป็นวันหยุดอยู่แล้ว)</span></div>
              {isAdmin && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                  <input style={{ ...field, width: 'auto' }} type="date" value={hForm.date} onChange={(e) => setHForm({ ...hForm, date: e.target.value })} />
                  <input style={{ ...field, flex: 1, minWidth: 180 }} placeholder="ชื่อวันหยุด (เช่น สงกรานต์)" value={hForm.name} onChange={(e) => setHForm({ ...hForm, name: e.target.value })} />
                  <button onClick={addHoliday} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>+ เพิ่มวันหยุด</button>
                </div>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
                <th style={{ ...th, padding: '9px 18px' }}>วันที่</th><th style={th}>ชื่อวันหยุด</th>{isAdmin && <th style={{ ...th, padding: '9px 18px', textAlign: 'center' }}>จัดการ</th>}
              </tr></thead>
              <tbody>
                {holidays.length === 0 && <tr><td colSpan={3} style={{ padding: 36, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีวันหยุด</td></tr>}
                {holidays.map((h) => (
                  <tr key={h.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                    <td className="num" style={{ ...td, padding: '10px 18px', fontWeight: 600 }}>{thMonth(h.date)}<span style={{ fontSize: 10.5, color: '#94A0A8', fontFamily: 'inherit', marginLeft: 6 }}>{h.date}</span></td>
                    <td style={{ ...td }}>{h.name}</td>
                    {isAdmin && <td style={{ ...td, padding: '10px 18px', textAlign: 'center' }}><button onClick={() => delHoliday(h.id)} style={{ border: 'none', background: 'none', color: '#C24036', cursor: 'pointer', fontSize: 13 }}>✕</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* ===== location tracking (manager) ===== */}
        {tab === 'location' && isMgr && <LocationTrack employees={employees.map((e) => ({ code: e.code, name: e.name }))} />}

        {/* ===== leave ===== */}
        {tab === 'leave' && (
          <>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF1F4', background: '#FAFBFC' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>ยื่นใบลา</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 0.7fr', gap: 10 }}>
                <select style={field} value={lv.emp_code} onChange={(e) => setLv({ ...lv, emp_code: e.target.value })}>
                  <option value="">เลือกพนักงาน *</option>
                  {employees.map((e) => <option key={e.code} value={e.code}>{e.name}</option>)}
                </select>
                <select style={field} value={lv.type} onChange={(e) => setLv({ ...lv, type: e.target.value })}>{['ลาป่วย', 'ลากิจ', 'พักร้อน'].map((t) => <option key={t}>{t}</option>)}</select>
                <input style={field} type="date" value={lv.start_date} onChange={(e) => setLv({ ...lv, start_date: e.target.value, end_date: e.target.value })} />
                <input style={{ ...field, opacity: lv.unit === 'day' ? 1 : 0.45 }} type="date" value={lv.unit === 'day' ? lv.end_date : lv.start_date} disabled={lv.unit !== 'day'} onChange={(e) => setLv({ ...lv, end_date: e.target.value })} />
                <input style={{ ...field, opacity: lv.unit === 'day' ? 1 : 0.45 }} type="number" placeholder="วัน" value={lv.unit === 'day' ? lv.days : String(lvDays)} disabled={lv.unit !== 'day'} onChange={(e) => setLv({ ...lv, days: e.target.value })} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, fontWeight: 500, color: '#5C6770' }}>ลักษณะการลา:</span>
                <select style={{ ...field, width: 'auto', padding: '7px 10px' }} value={lv.unit} onChange={(e) => setLv({ ...lv, unit: e.target.value })}>
                  <option value="day">เต็มวัน</option><option value="half">ครึ่งวัน</option><option value="hour">รายชั่วโมง</option>
                </select>
                {lv.unit === 'half' && (
                  <select style={{ ...field, width: 'auto', padding: '7px 10px' }} value={lv.halfPart} onChange={(e) => setLv({ ...lv, halfPart: e.target.value })}>
                    <option value="เช้า">ครึ่งเช้า</option><option value="บ่าย">ครึ่งบ่าย</option>
                  </select>
                )}
                {lv.unit === 'hour' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                    <input style={{ ...field, width: 80, padding: '7px 9px' }} type="number" min={0.5} max={8} step={0.5} value={lv.hours} onChange={(e) => setLv({ ...lv, hours: e.target.value })} /> ชั่วโมง
                    <span style={{ color: '#94A0A8' }}>= {lvDays} วัน</span>
                  </span>
                )}
                <span style={{ fontSize: 11.5, color: '#94A0A8' }}>{lv.unit === 'hour' ? '8 ชม. = 1 วัน · ใช้สิทธิ์/หักเงินตามสัดส่วน' : lv.unit === 'half' ? 'ใช้สิทธิ์/หักเงิน 0.5 วัน (วันเดียว)' : 'ลาเป็นวัน (ระบุช่วงวันได้)'}</span>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <input style={{ ...field, flex: 1 }} placeholder="เหตุผล" value={lv.reason} onChange={(e) => setLv({ ...lv, reason: e.target.value })} />
                <button onClick={submitLeave} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer' }}>ยื่นใบลา</button>
              </div>
              {lvErr && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 8 }}>{lvErr}</div>}
              {(() => {
                const le = employees.find((e) => e.code === lv.emp_code)
                if (!le) return null
                const rem = lv.type === 'ลาป่วย' ? (le.sick_quota ?? 0) - (le.sick_used ?? 0) : lv.type === 'ลากิจ' ? (le.personal_quota ?? 0) - (le.personal_used ?? 0) : (le.vacation_quota ?? 0) - (le.vacation_used ?? 0)
                const useDays = lvDays
                const over = useDays > rem
                return <div style={{ fontSize: 11.5, marginTop: 8, color: over ? '#C24036' : '#5C6770' }}>คงเหลือ {lv.type} <b>{rem}</b> วัน{over ? ` · ลา ${useDays} วัน เกินสิทธิ์ ${useDays - rem} วัน จะเป็น "ลาไม่รับเงิน" (ถูกหักเงิน)` : ''}</div>
              })()}
              <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 4 }}>อนุมัติได้เฉพาะตำแหน่งผู้จัดการ · ลาเกินสิทธิ์/“ไม่อนุมัติ” จะถูกหักเงินในสรุปเงินเดือน</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
                <th style={{ ...th, padding: '9px 18px' }}>พนักงาน</th><th style={{ ...th, textAlign: 'center' }}>ประเภท</th><th style={th}>วันที่</th>
                <th style={{ ...th, textAlign: 'center' }}>วัน</th><th style={th}>เหตุผล</th><th style={{ ...th, padding: '9px 18px', textAlign: 'center' }}>สถานะ / อนุมัติ</th>
              </tr></thead>
              <tbody>
                {leaves.length === 0 && <tr><td colSpan={6} style={{ padding: 36, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีใบลา</td></tr>}
                {leaves.map((l) => {
                  const t = leaveTypeStyle(l.type)
                  return (
                    <tr key={l.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                      <td style={{ ...td, padding: '10px 18px', fontWeight: 500 }}>{l.emp_name}</td>
                      <td style={{ ...td, textAlign: 'center' }}><span style={{ fontSize: 11, fontWeight: 600, color: t.c, background: t.bg, padding: '2px 10px', borderRadius: 20 }}>{l.type}</span></td>
                      <td className="num" style={{ ...td, color: '#5C6770' }}>{l.start_date}{l.end_date !== l.start_date ? '–' + l.end_date : ''}</td>
                      <td className="num" style={{ ...td, textAlign: 'center' }}>{l.hours ? `${l.hours} ชม.` : `${l.days} วัน`}</td>
                      <td style={{ ...td, color: '#5C6770' }}>{l.reason || '-'}</td>
                      <td style={{ ...td, padding: '10px 18px', textAlign: 'center' }}>
                        {l.status === 'รออนุมัติ' && isMgr ? (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button onClick={() => app.decideLeave(l.id, 'อนุมัติ')} style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 7, padding: '4px 11px', cursor: 'pointer' }}>อนุมัติ</button>
                            <button onClick={() => app.decideLeave(l.id, 'ไม่อนุมัติ')} style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#C24036', background: '#FBEEEC', border: 'none', borderRadius: 7, padding: '4px 11px', cursor: 'pointer' }}>ไม่อนุมัติ</button>
                          </div>
                        ) : <Pill s={l.status} />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}

        {/* ===== time adjustment ===== */}
        {tab === 'timeadj' && (
          <>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF1F4', background: '#FAFBFC' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>ยื่นปรับปรุงเวลาเข้า-ออก</div>
              <div style={{ fontSize: 11.5, color: '#94A0A8', marginBottom: 10 }}>เวลาทำงาน จ.–ส. 08:00–17:00 · ยื่นย้อนหลังได้ไม่เกิน 2 วันทำการ · อนุมัติโดยผู้จัดการ</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.8fr', gap: 10 }}>
                <input style={field} placeholder="ชื่อพนักงาน (เว้นว่าง = ตัวเอง)" value={ta.emp_name} onChange={(e) => setTa({ ...ta, emp_name: e.target.value })} />
                <input style={field} type="date" value={ta.date} onChange={(e) => setTa({ ...ta, date: e.target.value })} />
                <select style={field} value={ta.kind} onChange={(e) => setTa({ ...ta, kind: e.target.value })}><option>เข้างาน</option><option>ออกงาน</option></select>
                <input style={field} type="time" value={ta.time} onChange={(e) => setTa({ ...ta, time: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <input style={{ ...field, flex: 1 }} placeholder="เหตุผล (เช่น ออกหน้างานแต่เช้า)" value={ta.reason} onChange={(e) => setTa({ ...ta, reason: e.target.value })} />
                <button onClick={submitTa} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer' }}>ยื่นคำขอ</button>
              </div>
              {taErr && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 8 }}>{taErr}</div>}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
                <th style={{ ...th, padding: '9px 18px' }}>พนักงาน</th><th style={th}>วันที่</th><th style={{ ...th, textAlign: 'center' }}>ประเภท</th>
                <th style={{ ...th, textAlign: 'center' }}>เวลา</th><th style={th}>เหตุผล</th><th style={{ ...th, padding: '9px 18px', textAlign: 'center' }}>สถานะ / อนุมัติ</th>
              </tr></thead>
              <tbody>
                {timeAdjustments.length === 0 && <tr><td colSpan={6} style={{ padding: 36, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีคำขอ</td></tr>}
                {timeAdjustments.map((r) => (
                  <tr key={r.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                    <td style={{ ...td, padding: '10px 18px', fontWeight: 500 }}>{r.emp_name}</td>
                    <td className="num" style={{ ...td, color: '#5C6770' }}>{r.date}</td>
                    <td style={{ ...td, textAlign: 'center' }}><span style={{ fontSize: 11, fontWeight: 600, color: '#30506A', background: '#E2E9EF', padding: '2px 9px', borderRadius: 20 }}>{r.kind}</span></td>
                    <td className="num" style={{ ...td, textAlign: 'center' }}>{r.time}</td>
                    <td style={{ ...td, color: '#5C6770' }}>{r.reason || '-'}</td>
                    <td style={{ ...td, padding: '10px 18px', textAlign: 'center' }}>
                      {r.status === 'รออนุมัติ' && isMgr ? (
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button onClick={() => app.decideTimeAdj(r.id, 'อนุมัติ')} style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 7, padding: '4px 11px', cursor: 'pointer' }}>อนุมัติ</button>
                          <button onClick={() => app.decideTimeAdj(r.id, 'ไม่อนุมัติ')} style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#C24036', background: '#FBEEEC', border: 'none', borderRadius: 7, padding: '4px 11px', cursor: 'pointer' }}>ไม่อนุมัติ</button>
                        </div>
                      ) : <Pill s={r.status} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* ===== tax (computed from real payroll) ===== */}
        {tab === 'tax' && (() => {
          const list = payroll || []
          const pnd1 = list.reduce((s, p) => s + (p.tax || 0), 0)
          const ssoTotal = list.reduce((s, p) => s + (p.sso || 0), 0) * 2 // ลูกจ้าง + นายจ้าง
          const annualPayroll = list.reduce((s, p) => s + (p.base || 0) * 12, 0) // ฐานเงินคือยอดจ่ายจริงต่อเดือน (รายวัน = ค่าแรง×วันทำงาน)
          const wc = Math.round(annualPayroll * 0.002) // กท.20 กองทุนเงินทดแทน ~0.2%
          const cards = [
            { label: 'ภงด.1 (ภาษีหัก ณ ที่จ่าย-เงินเดือน)', value: pnd1, sub: 'รวมจากพนักงานจริง · นำส่งภายใน 7 ของเดือนถัดไป' },
            { label: 'ประกันสังคม (นำส่ง)', value: ssoTotal, sub: 'นายจ้าง + ลูกจ้าง · ภายในวันที่ 15' },
            { label: 'กท.20 ก (กองทุนเงินทดแทน)', value: wc, sub: 'ประมาณการรายปี 0.2% ของค่าจ้าง' },
          ]
          return (
            <div style={{ padding: 18 }}>
              {!salaryOk && <div style={{ fontSize: 12.5, color: '#5C6770', marginBottom: 12 }}>* ตัวเลขสรุปเปิดให้เห็นเฉพาะผู้ดูแล/บัญชี</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                {cards.map((c, i) => (
                  <div key={i} style={{ border: '1px solid #E1E5EA', borderRadius: 12, padding: '16px 18px', borderLeft: '3px solid #30506A' }}>
                    <div style={{ fontSize: 12.5, color: '#5C6770' }}>{c.label}</div>
                    <div className="num" style={{ fontSize: 25, fontWeight: 700, marginTop: 6, color: '#1C2730' }}>{baht(c.value)}</div>
                    <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 5 }}>{c.sub}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16 }}><EfilingList filter={['pnd1', 'sso']} /></div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
