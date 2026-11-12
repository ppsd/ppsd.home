// สูตรคำนวณเงินเดือนกลาง — ใช้ "ไฟล์เดียวกัน" ทั้ง ERP (Node) และหน้าเงินเดือนบน Cloudflare → ตัวเลขตรงกันทุกบาท
// ไม่มีการอ่านฐานข้อมูลในไฟล์นี้: ผู้เรียกโหลดข้อมูลมาเป็น array (แถวแบบเดียวกับตารางใน ERP) แล้วส่งเข้ามา
// ห้าม import อะไรจาก Node (ต้องรันบน Cloudflare ได้)

export const RETENTION_CAP = 5000 // เพดานเงินประกันผลงานต่อคน
export const NO_ATTENDANCE_ROLES = ['CEO', 'ผู้จัดการ'] // ตำแหน่งที่ไม่ต้องลงเวลา — ได้เงินเดือนเต็ม
export const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const DAYMS = 86400000

export function r2(x) { return Math.round((Number(x) || 0) * 100) / 100 }
// ประกันสังคม 5% เพดานค่าจ้าง 17,500 → เกิน 17,500 หัก 875
export function ssoOf(monthlyBase) { return Math.round(Math.min(monthlyBase, 17500) * 0.05) }
// วันที่แบบ YYYY-MM-DD ตามเวลาท้องถิ่นของเครื่อง
export function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export function* eachDay(fromISO, toISO) {
  const a = new Date(fromISO + 'T00:00:00'); const b = new Date(toISO + 'T00:00:00')
  for (let t = a.getTime(); t <= b.getTime(); t += DAYMS) yield isoDate(new Date(t))
}
export function periodBounds(period) {
  const [yy, mm] = period.split('-').map(Number)
  const dim = new Date(yy, mm, 0).getDate()
  return { dim, from: `${period}-01`, to: `${period}-${String(dim).padStart(2, '0')}` }
}
export function periodLabelTH(period) {
  const [yy, mm] = period.split('-').map(Number)
  return `${TH_MONTHS[mm - 1]} ${String((yy + 543) % 100).padStart(2, '0')}`
}
// แปลงวันที่ (ISO หรือแบบไทย "2 ก.ย. 69") → 'YYYY-MM-DD' · อ่านไม่ออก = null
export function parseAnyDateISO(s) {
  if (!s) return null
  const str = String(s).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10)
  const m = str.match(/^(\d{1,2})\s+(\S+)\s+(\d{2,4})$/)
  if (m) {
    const mi = TH_MONTHS.indexOf(m[2])
    if (mi >= 0) {
      let y = Number(m[3])
      if (y < 100) y += 2500
      if (y > 2400) y -= 543
      return `${y}-${String(mi + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`
    }
  }
  return null
}
export const dateInPeriod = (dateStr, period) => { const iso = parseAnyDateISO(dateStr); return !!iso && iso.startsWith(period) }
// สัดส่วนใบลาที่ตกในงวด (ลาคร่อมเดือน → แบ่งตามวัน จ.–ส.)
export function leaveShare(l, period) {
  const start = parseAnyDateISO(l.start_date) || '', end = parseAnyDateISO(l.end_date) || start
  if (!start) return 0
  const last = end >= start ? end : start
  if (start.slice(0, 7) === last.slice(0, 7)) return start.slice(0, 7) === period ? 1 : 0
  let total = 0, inside = 0
  for (const d of eachDay(start, last)) {
    if (new Date(d + 'T00:00:00').getDay() === 0) continue
    total++
    if (d.slice(0, 7) === period) inside++
  }
  return total ? inside / total : 0
}
export const netOf = (p) => (p.base || 0) + (p.ot || 0) + (p.other_income || 0) + (p.retention_refund || 0) - (p.sso || 0) - (p.tax || 0) - (p.leave_deduct || 0) - (p.retention || 0) - (p.student_loan || 0) - (p.advance || 0) - (p.other_deduct || 0)

/* ข้อมูลที่ต้องส่งเข้ามา (D):
   employees: ทุกแถวของ employees · attendance: แถว {emp_code,date,check_in} (อย่างน้อยของเดือนนั้น)
   time_adjustments: {emp_name,date,status} · leaves: {emp_code,start_date,end_date,days,unpaid_days,status}
   holidays: {date} · ot: {emp_code,date,amount,status} · payroll_inputs: {emp_code,period,work_days,retention_refund,note}
   salary_advances / deductions / other_income: {emp_code,period,amount} · runs: [{period, rows:[snapshot rows]}] (งวดที่ปิดแล้ว) */

// วันที่มาทำงานจริงในงวด = วันลงเวลาเข้า + วันขอปรับปรุงเวลาที่อนุมัติ (ไม่นับซ้ำ)
export function attendanceDays(D, e, period) {
  const { from, to } = periodBounds(period)
  const set = new Set()
  for (const a of D.attendance) if (a.emp_code === e.code && String(a.check_in ?? '') !== '' && a.date >= from && a.date <= to) set.add(a.date)
  for (const t of D.time_adjustments) if (t.emp_name === e.name && t.status === 'อนุมัติ' && t.date >= from && t.date <= to) set.add(t.date)
  return [...set].sort()
}
// วันขาดงาน (จ.–ส.) เฉพาะช่วงระหว่างวันแรก–วันสุดท้ายที่ลงเวลาในเดือน (ไม่ลงเวลาเลย = ไม่หัก)
export function absentDaysInMonth(D, emp, period) {
  const [yy, mm] = period.split('-').map(Number)
  const monthStart = isoDate(new Date(yy, mm - 1, 1)), monthEnd = isoDate(new Date(yy, mm, 0))
  const punches = D.attendance.filter((a) => a.emp_code === emp.code && a.check_in != null && a.check_in !== '' && a.date >= monthStart && a.date <= monthEnd).map((a) => a.date).sort()
  if (punches.length === 0) return 0
  let from = punches[0]
  const to = punches[punches.length - 1]
  const empStart = emp.start && /^\d{4}-\d{2}-\d{2}$/.test(emp.start) ? emp.start : null
  if (empStart && empStart > from) from = empStart
  const excused = new Set(punches)
  for (const l of D.leaves) if (l.emp_code === emp.code && (l.status === 'อนุมัติ' || l.status === 'ไม่อนุมัติ')) for (const d of eachDay(l.start_date, l.end_date || l.start_date)) excused.add(d)
  for (const t of D.time_adjustments) if (t.emp_name === emp.name && t.status === 'อนุมัติ') excused.add(t.date)
  for (const h of D.holidays) if (h.date >= from && h.date <= to) excused.add(h.date)
  let absent = 0
  for (const d of eachDay(from, to)) { const wd = new Date(d + 'T00:00:00').getDay(); if (wd !== 0 && !excused.has(d)) absent++ }
  return absent
}
// วันทำงานที่ระบบแนะนำ (ปุ่ม "ดึงจากลงเวลา") — รายวัน = จำนวนวันที่ลงเวลา · รายเดือน = นับจากวันเริ่มงาน/ถึงวันลงเวลาวันสุดท้ายถ้าลาออก · ครบเดือน = null
export function suggestWorkDays(D, e, period) {
  const days = attendanceDays(D, e, period)
  if (e.pay_type === 'รายวัน') return days.length || null
  const { from, to } = periodBounds(period)
  let start = from, end = to
  const empStart = parseAnyDateISO(e.start)
  if (empStart && empStart > from) start = empStart
  if (e.status === 'ลาออก' && days.length) end = days[days.length - 1]
  if (start === from && end === to) return null
  if (end < start) return 0
  return Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1
}
// เงินประกันสะสม = ยอดยกมา + หักในทุกงวดที่ปิดแล้ว "ก่อน" excludePeriod − ยอดที่คืนแล้ว
export function retentionPaidBefore(runs, empCode, opening, excludePeriod) {
  let sum = 0
  for (const r of runs) {
    if (!(r.period < (excludePeriod || '9999-99'))) continue
    const row = (r.rows || []).find((x) => x.code === empCode)
    if (row) sum += (Number(row.retention) || 0) - (Number(row.retention_refund) || 0)
  }
  return (Number(opening) || 0) + sum
}
export function retentionPeriodsBefore(runs, empCode, opening, monthly, excludePeriod) {
  let periods = 0
  for (const r of runs) {
    if (!(r.period < (excludePeriod || '9999-99'))) continue
    const row = (r.rows || []).find((x) => x.code === empCode)
    if (row && (Number(row.retention) || 0) > 0) periods += 1
  }
  const openingPeriods = (Number(monthly) || 0) > 0 ? Math.round((Number(opening) || 0) / Number(monthly)) : ((Number(opening) || 0) > 0 ? 1 : 0)
  return openingPeriods + periods
}
// พนักงานในงวด: ยังไม่ลาออก + ลาออกแต่ resign_date ยังไม่ก่อนงวด + มีข้อมูลในงวด (ลงเวลา/กรอก/เบิก/หัก/รายได้)
export function payrollEmployees(D, period) {
  const { from, to } = periodBounds(period)
  const has = new Set()
  for (const x of D.payroll_inputs) if (x.period === period) has.add(x.emp_code)
  for (const a of D.attendance) if (a.date >= from && a.date <= to) has.add(a.emp_code)
  for (const t of [D.salary_advances, D.deductions, D.other_income]) for (const x of t) if (x.period === period) has.add(x.emp_code)
  // เหมือน SQL เดิม: status ว่าง (NULL) ไม่นับว่า "ยังทำงาน" (NULL != 'ลาออก' เป็นเท็จใน SQL)
  return D.employees.filter((e) => (e.status != null && e.status !== 'ลาออก') || (e.status === 'ลาออก' && String(e.resign_date ?? '') >= from) || has.has(e.code)).slice().sort((a, b) => (a.id || 0) - (b.id || 0))
}
const sumFor = (rows, code, period) => rows.reduce((s, x) => (x.emp_code === code && x.period === period ? s + (Number(x.amount) || 0) : s), 0)
// คำนวณเงินเดือนสดทั้งงวด
export function computePayroll(D, period) {
  const { dim } = periodBounds(period)
  const inputs = new Map(D.payroll_inputs.filter((r) => r.period === period).map((r) => [r.emp_code, r]))
  return payrollEmployees(D, period).map((e) => {
    const inp = inputs.get(e.code)
    const ot = D.ot.filter((r) => r.emp_code === e.code && r.status === 'อนุมัติ' && dateInPeriod(r.date, period)).reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const lvs = D.leaves.filter((l) => l.emp_code === e.code && (l.status === 'อนุมัติ' || l.status === 'ไม่อนุมัติ')).map((l) => ({ ...l, share: leaveShare(l, period) })).filter((l) => l.share > 0)
    const rejected = r2(lvs.filter((l) => l.status === 'ไม่อนุมัติ').reduce((s, l) => s + (Number(l.days) || 0) * l.share, 0))
    const unpaid = r2(lvs.filter((l) => l.status === 'อนุมัติ').reduce((s, l) => s + (Number(l.unpaid_days) || 0) * l.share, 0))
    const isDaily = e.pay_type === 'รายวัน'
    const exempt = NO_ATTENDANCE_ROLES.includes(e.role)
    const dailyRate = e.base || 0
    const inWd = inp && inp.work_days != null ? Number(inp.work_days) : null
    let workDays, basePay, prorated = false
    if (isDaily) {
      workDays = inWd ?? (attendanceDays(D, e, period).length || Number(e.work_days) || 0)
      basePay = r2(dailyRate * workDays)
    } else {
      workDays = inWd
      prorated = inWd != null && inWd < dim
      basePay = prorated ? r2(Math.min(e.base || 0, (e.base || 0) / 30 * inWd)) : (e.base || 0)
    }
    const manualFinal = !isDaily && inWd != null // รายเดือนที่กรอกวันเอง = ยอดสุดท้าย ไม่หักขาด/ลาซ้ำ
    const absent = (isDaily || exempt || manualFinal) ? 0 : absentDaysInMonth(D, e, period)
    const daily = isDaily ? dailyRate : Math.round((e.base || 0) / 30)
    const deductDays = (isDaily || manualFinal) ? 0 : (rejected + unpaid + absent)
    const sso = e.no_sso ? 0 : ((isDaily || prorated) ? ssoOf(basePay) : e.sso)
    const tax = e.tax || 0
    const advance = sumFor(D.salary_advances, e.code, period)
    const otherDeduct = sumFor(D.deductions, e.code, period)
    const otherIncome = sumFor(D.other_income, e.code, period)
    const opening = e.retention_opening || 0
    const paidBefore = retentionPaidBefore(D.runs, e.code, opening, period)
    const monthly = e.retention ?? 0
    const hasIncome = basePay + ot + otherIncome > 0
    const retention = hasIncome ? Math.max(0, Math.min(monthly, RETENTION_CAP - paidBefore)) : 0
    const refund = Math.max(0, Number(inp?.retention_refund) || 0)
    const { pin, signature, track_token, ...pub } = e
    return {
      ...pub, ot, sso, tax, base: basePay, leave_days: manualFinal ? 0 : rejected + unpaid, absent_days: absent, leave_deduct: deductDays * daily, manual_final: manualFinal,
      daily_rate: dailyRate, work_days: workDays, work_days_set: inWd != null, days_in_month: dim, prorated, monthly_base: isDaily ? null : (e.base || 0),
      exempt_attendance: exempt,
      retention, retention_refund: refund, student_loan: e.student_loan || 0, advance, other_deduct: otherDeduct, other_income: otherIncome,
      retention_cap: RETENTION_CAP, retention_opening: opening,
      retention_monthly: monthly,
      retention_paid: paidBefore + retention - refund,
      retention_periods: retentionPeriodsBefore(D.runs, e.code, opening, monthly, period) + (retention > 0 ? 1 : 0),
      pay_note: inp?.note || '',
    }
  })
}
