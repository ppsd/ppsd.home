// ---------------------------------------------------------------------------
// PPSD Construction ERP — sample data + helpers
// Ported faithfully from the Claude Design prototype (PPSD ERP.dc.html).
// ---------------------------------------------------------------------------

export type HouseStatus =
  | 'กำลังสร้าง'
  | 'ส่งมอบแล้ว'
  | 'after-service'
  | 'เพิ่งเริ่ม'

export interface House {
  id: string
  code: string
  name: string
  project: string
  customer: string
  value: number
  pct: number
  collected: number
  remain: number
  status: HouseStatus
}

export const houses: House[] = [
  { id: 'h1', code: 'RK-014', name: 'บ้านพฤกษาวิลล์ 1', project: 'โครงการร่มเกล้า', customer: 'คุณสมชาย วงศ์ทอง', value: 4250000, pct: 62, collected: 2635000, remain: 1615000, status: 'กำลังสร้าง' },
  { id: 'h2', code: 'ST-008', name: 'บ้านเรือนแก้ว', project: 'โครงการสิริทรัพย์', customer: 'คุณนภาพร ใจดี', value: 5800000, pct: 38, collected: 2204000, remain: 3596000, status: 'กำลังสร้าง' },
  { id: 'h3', code: 'RK-009', name: 'บ้านสวนสุข', project: 'โครงการร่มเกล้า', customer: 'คุณวีระ ศรีสุข', value: 3650000, pct: 100, collected: 3650000, remain: 0, status: 'ส่งมอบแล้ว' },
  { id: 'h4', code: 'BK-021', name: 'บ้านลีลาวดี', project: 'โครงการบ้านกลางเมือง', customer: 'คุณอนุชา พรหมมา', value: 6400000, pct: 18, collected: 1152000, remain: 5248000, status: 'กำลังสร้าง' },
  { id: 'h5', code: 'ST-012', name: 'บ้านร่มไทร', project: 'โครงการสิริทรัพย์', customer: 'คุณกมล ทองดี', value: 4900000, pct: 85, collected: 4165000, remain: 735000, status: 'กำลังสร้าง' },
  { id: 'h6', code: 'BK-024', name: 'บ้านเฌอบางกอก', project: 'โครงการบ้านกลางเมือง', customer: 'คุณปรียา มั่งมี', value: 7200000, pct: 6, collected: 432000, remain: 6768000, status: 'เพิ่งเริ่ม' },
  { id: 'h7', code: 'RK-007', name: 'บ้านขวัญเรือน', project: 'โครงการร่มเกล้า', customer: 'คุณธีรพงษ์ แสนสุข', value: 3950000, pct: 100, collected: 3950000, remain: 0, status: 'after-service' },
  { id: 'h8', code: 'ST-015', name: 'บ้านพิมพ์มาดา', project: 'โครงการสิริทรัพย์', customer: 'คุณศิริพร เจริญ', value: 5200000, pct: 48, collected: 2496000, remain: 2704000, status: 'กำลังสร้าง' },
]

export const baht = (n: number) => '฿' + n.toLocaleString('en-US')
// money input helpers: format digits with thousands separators / parse back to a number
export const fmtMoney = (v: string | number) => {
  const d = String(v).replace(/[^\d]/g, '')
  return d ? Number(d).toLocaleString('en-US') : ''
}
export const unMoney = (v: string) => Number(String(v).replace(/[^\d.]/g, '')) || 0
// เหมือน fmtMoney แต่ให้ใส่จุดทศนิยมได้ (สูงสุด 2 ตำแหน่ง) เช่น ค่าแรงรายวัน 1,166.67
export const fmtMoneyDecimal = (v: string | number) => {
  let s = String(v).replace(/[^\d.]/g, '')
  const dot = s.indexOf('.')
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '') // เก็บจุดแรกจุดเดียว
  const parts = s.split('.')
  const intRaw = parts[0].replace(/^0+(?=\d)/, '') || (parts.length > 1 ? '0' : '')
  const intFmt = intRaw ? Number(intRaw).toLocaleString('en-US') : ''
  return parts.length > 1 ? (intFmt || '0') + '.' + parts[1].slice(0, 2) : intFmt
}

// แปลงจำนวนเงินเป็นตัวอักษรภาษาไทย เช่น 5278 → "ห้าพันสองร้อยเจ็ดสิบแปดบาทถ้วน"
export function bahtText(amount: number): string {
  const num = Math.abs(Math.round((amount + Number.EPSILON) * 100) / 100)
  const neg = amount < 0 ? 'ลบ' : ''
  const digits = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
  const pos = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']
  const readGroup = (n: string): string => {
    let s = ''
    const len = n.length
    for (let i = 0; i < len; i++) {
      const d = Number(n[i]); const p = len - i - 1
      if (d === 0) continue
      if (p === 0 && d === 1 && len > 1) s += 'เอ็ด'
      else if (p === 1 && d === 2) s += 'ยี่สิบ'
      else if (p === 1 && d === 1) s += 'สิบ'
      else s += digits[d] + pos[p]
    }
    return s
  }
  const readInt = (n: number): string => {
    if (n === 0) return 'ศูนย์'
    let str = String(n), out = ''
    // แยกเป็นกลุ่มละ 6 หลัก คั่นด้วย "ล้าน"
    const groups: string[] = []
    while (str.length > 6) { groups.unshift(str.slice(-6)); str = str.slice(0, -6) }
    groups.unshift(str)
    groups.forEach((g, i) => { const r = readGroup(g); if (r) out += r + (i < groups.length - 1 ? 'ล้าน' : '') })
    return out
  }
  const baht = Math.floor(num)
  const satang = Math.round((num - baht) * 100)
  let s = ''
  if (baht > 0) s += readInt(baht) + 'บาท'
  if (satang > 0) s += readInt(satang) + 'สตางค์'
  else s += (baht > 0 ? 'ถ้วน' : 'ศูนย์บาทถ้วน')
  return neg + s
}

export interface Swatch {
  c: string
  bg: string
}

export function statusStyle(s: string): Swatch {
  if (s === 'ส่งมอบแล้ว') return { c: '#2E7D55', bg: '#E2F1EA' }
  if (s === 'after-service') return { c: '#C0852C', bg: '#F6ECD6' }
  if (s === 'เพิ่งเริ่ม') return { c: '#5C6770', bg: '#EDF1F4' }
  return { c: '#30506A', bg: '#E2E9EF' } // กำลังสร้าง
}

export function barColor(pct: number): string {
  if (pct >= 100) return '#2E7D55'
  if (pct < 20) return '#C0852C'
  return '#30506A'
}

// ---- navigation ----
export interface NavDef {
  id: string
  label: string
  icon: string
  badge?: string
  gate?: 'finance' | 'manager' | 'hr' | 'pms' // finance=admin/บัญชี/ผจก · manager=ผจก · hr=ผจก/บัญชี/บุคคล · pms=เฉพาะเจ้าของสิทธิ์
}

export const nav: NavDef[] = [
  { id: 'dashboard', label: 'หน้าสรุป', icon: 'M3 10.5L12 3l9 7.5M5.5 9.5V21h13V9.5' },
  { id: 'houses', label: 'บ้าน', icon: 'M4 21h16M6 21V8l6-4 6 4v13M10 21v-5h4v5' },
  { id: 'customers', label: 'ลูกค้า (CRM)', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8 M4 20c0-4 4-6 8-6s8 2 8 6' },
  { id: 'installments', label: 'งวดงาน', icon: 'M4 6h16M4 12h16M4 18h11' },
  { id: 'gantt', label: 'แผนงาน', icon: 'M4 6h10 M4 12h7 M4 18h13' },
  { id: 'issues', label: 'ปัญหาหน้างาน', icon: 'M12 4l9 16H3z M12 10v4 M12 17.5v.1' },
  { id: 'workorders', label: 'ใบสั่งงาน (WO)', icon: 'M9 11l3 3 8-8 M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9' },
  { id: 'sitedocs', label: 'เอกสารหน้างาน', icon: 'M7 3h7l5 5v13H7z M14 3v5h5 M9.5 13h6 M9.5 16.5h6' },
  { id: 'qc', label: 'ตรวจงาน QC', icon: 'M9 11l3 3 8-8 M20 12v7H4V5h11' },
  { id: 'sitereport', label: 'รายงานหน้างาน', icon: 'M4 5h16v14H4z M8 9h8 M8 13h8 M8 17h5' },
  { id: 'qcsummary', label: 'สรุป QC (ผู้บริหาร)', icon: 'M4 20V10 M10 20V4 M16 20v-8 M3 20h18', gate: 'pms' },
  { id: 'ceovoice', label: 'สั่งงานด้วยเสียง (CEO)', icon: 'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z M5 11a7 7 0 0014 0 M12 18v3 M8 21h8', gate: 'pms' },
  { id: 'safety', label: 'ความปลอดภัย', icon: 'M12 3l7 3v5c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6z M9 12l2 2 4-4' },
  { id: 'handover', label: 'ส่งมอบ / รับรองงาน', icon: 'M4 7h16v11H4z M4 7l8 6 8-6 M8 21h8' },
  { id: 'docreg', label: 'ทะเบียนเอกสาร', icon: 'M4 4h9l4 4v12H4z M13 4v4h4 M8 13h6 M8 16h6', gate: 'finance' },
  { id: 'express', label: 'ส่งออกบัญชี (Express)', icon: 'M4 4h16v16H4z M4 9h16 M9 9v11 M12 13h5 M12 16h5', gate: 'finance' },
  { id: 'expenses', label: 'รายจ่าย', icon: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6' },
  { id: 'sales', label: 'เอกสารขาย', icon: 'M7 3h10l2 4v14H5V7z M9 12h6 M9 16h6' },
  { id: 'procurement', label: 'จัดซื้อ / จ่าย', icon: 'M3 5h2l2.4 11h10l2-8H6 M9 20.5a.5 .5 0 100-.01 M17 20.5a.5 .5 0 100-.01' },
  { id: 'matprices', label: 'ราคากลาง (วัสดุ / ค่าแรง)', icon: 'M3 5v6.6a2 2 0 00.6 1.4l8 8 7-7-8-8A2 2 0 009.6 3H4a1 1 0 00-1 1z M7.5 7.5h.01', gate: 'finance' },
  { id: 'stock', label: 'สต๊อกวัสดุ', icon: 'M21 8l-9-5-9 5v8l9 5 9-5z M3.3 8.4L12 13l8.7-4.6 M12 13v8.5' },
  { id: 'time', label: 'ลงเวลา', icon: 'M12 21a9 9 0 100-18 9 9 0 000 18z M12 7.5v5l3 2' },
  { id: 'hr', label: 'บุคลากร / HR', icon: 'M16 19c0-2.8-2.2-5-5-5s-5 2.2-5 5 M11 11a3 3 0 100-6 3 3 0 000 6 M18 13.2a3 3 0 10-2.4-5.4' },
  { id: 'pms', label: 'ประเมินผล KPI', icon: 'M3 3v18h18 M8 17V9 M13 17V5 M18 17v-6', gate: 'pms' },
  { id: 'reports', label: 'รายงาน', icon: 'M4 20V10 M10 20V4 M16 20v-8 M3 20h18' },
  { id: 'costing', label: 'ต้นทุน / การเงิน', icon: 'M3 3v18h18 M7 14l4-4 3 3 5-6', gate: 'finance' },
  { id: 'accounting', label: 'บัญชีแยกประเภท (GL)', icon: 'M4 4h16v16H4z M4 9h16 M9 9v11 M14 13h3 M14 16h3', gate: 'finance' },
  { id: 'audit', label: 'ตรวจสอบ', icon: 'M12 3l7 3v5c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6z M9 12l2 2 4-4', gate: 'manager' },
  { id: 'users', label: 'ผู้ใช้งาน', icon: 'M12 3l7 3v5c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6z' },
]

// ---- สิทธิ์รายโมดูล: แอดมินปิดบางส่วนของระบบต่อผู้ใช้แต่ละคนได้ (สอดคล้อง MODULE_PATHS ฝั่ง server) ----
export const MODULES: { key: string; label: string; pages: string[] }[] = [
  { key: 'hr', label: 'บุคลากร / เงินเดือน', pages: ['hr'] }, // ไม่รวมหน้า 'ลงเวลา' — ตอกบัตร/ดูสลิปต้องใช้ได้เสมอ
  { key: 'accounting', label: 'บัญชี / รายจ่าย', pages: ['accounting', 'expenses', 'costing', 'express', 'docreg'] },
  { key: 'procurement', label: 'จัดซื้อ / จ่าย', pages: ['procurement', 'matprices', 'stock'] },
  { key: 'sales', label: 'เอกสารขาย / ลูกค้า', pages: ['sales', 'customers'] },
  { key: 'reports', label: 'รายงาน', pages: ['reports'] },
]
export const deniedPages = (deny?: string[]) => new Set((deny || []).flatMap((k) => MODULES.find((m) => m.key === k)?.pages || []))

// จัดเมนูเป็นแผนก — dashboard อยู่บนสุด (เดี่ยว) ที่เหลือย่อยตามแผนก กดเปิด/ปิดได้
export interface NavGroup { id: string; label: string; icon: string; items: string[] }
// house-first: "บ้าน" เป็นทางเข้าหลัก (แสดงเดี่ยวบนสุด) → กดบ้านแล้วเจอย่อยในบ้าน
// กลุ่มด้านล่างคือส่วนที่ยังเข้าแบบข้ามบ้าน (บางส่วนจะย้ายเข้าบ้านในเฟสถัดไป) + ส่วนกลางบริษัท
export const navGroups: NavGroup[] = [
  { id: 'overview', label: 'ภาพรวม / ข้ามบ้าน', icon: 'M4 20V10 M10 20V4 M16 20v-8 M3 20h18', items: ['dashboard', 'gantt', 'qcsummary', 'ceovoice'] },
  { id: 'site', label: 'งานหน้างาน (ข้ามบ้าน)', icon: 'M3 21h18 M5 21V7l7-4 7 4v14 M9 21v-6h6v6', items: ['issues', 'workorders', 'qc', 'sitedocs', 'sitereport', 'safety', 'handover'] },
  { id: 'procure', label: 'จัดซื้อ', icon: 'M3 5h2l2.4 11h10l2-8H6 M9 20.5a.5 .5 0 100-.01 M17 20.5a.5 .5 0 100-.01', items: ['procurement', 'matprices', 'stock'] },
  { id: 'finance', label: 'บัญชี / การเงิน', icon: 'M3 3v18h18 M7 14l4-4 3 3 5-6', items: ['installments', 'sales', 'expenses', 'costing', 'accounting', 'express', 'docreg', 'audit'] },
  { id: 'central', label: 'ส่วนกลางบริษัท', icon: 'M16 19c0-2.8-2.2-5-5-5s-5 2.2-5 5 M11 11a3 3 0 100-6 3 3 0 000 6 M18 13.2a3 3 0 10-2.4-5.4', items: ['hr', 'time', 'pms', 'customers', 'users'] },
  { id: 'other', label: 'อื่นๆ', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6z M4 12h1 M19 12h1 M12 4v1 M12 19v1', items: ['reports'] },
]

export const titles: Record<string, [string, string]> = {
  dashboard: ['ภาพรวมระบบ', 'หน้าสรุป'],
  houses: ['การจัดการบ้าน', 'บ้านทั้งหมด'],
  customers: ['การขาย', 'ลูกค้า (CRM)'],
  installments: ['การเงิน', 'งวดงาน'],
  gantt: ['หน้างาน', 'แผนงาน / ไทม์ไลน์'],
  issues: ['หน้างาน', 'ปัญหาหน้างาน'],
  workorders: ['หน้างาน', 'ใบสั่งงาน + ควบคุมคุณภาพ (WO/QC)'],
  ceovoice: ['ก่อสร้าง', 'สั่งงานด้วยเสียง (CEO)'],
  sitedocs: ['หน้างาน', 'เอกสารหน้างาน (RFI/RFA/NCR/VO)'],
  qc: ['หน้างาน', 'ตรวจงาน QC (Checklist)'],
  sitereport: ['หน้างาน', 'รายงานหน้างาน (Daily / Weekly)'],
  qcsummary: ['หน้างาน', 'สรุปการตรวจงาน QC (ผู้บริหาร)'],
  safety: ['หน้างาน', 'ความปลอดภัย (PPE / Toolbox / JHA)'],
  handover: ['หน้างาน', 'ส่งมอบงาน / หนังสือรับรองผลงาน'],
  docreg: ['เอกสาร', 'ทะเบียนควบคุมเอกสาร (สัญญา/แบบ/สเปก)'],
  express: ['การเงิน', 'ส่งออกบัญชีเข้าโปรแกรม Express'],
  expenses: ['การเงิน', 'รายจ่าย'],
  sales: ['การขาย', 'เอกสารขาย'],
  procurement: ['การเงิน', 'จัดซื้อ / จ่าย'],
  matprices: ['จัดซื้อ', 'ราคากลางวัสดุ (จากประวัติสั่งซื้อจริง) + ราคากลางค่าแรงช่าง'],
  stock: ['จัดซื้อ', 'สต๊อกวัสดุ (คงเหลือ + เบิกจ่าย)'],
  time: ['บุคลากร', 'ลงเวลา'],
  hr: ['บุคลากร', 'บุคลากร / HR'],
  pms: ['บุคลากร', 'ประเมินผลรายเดือน (KPI / PMS)'],
  reports: ['วิเคราะห์', 'รายงาน + กราฟ'],
  costing: ['การเงิน', 'ต้นทุน / ประเมินราคา'],
  accounting: ['การเงิน', 'บัญชีแยกประเภท (ระบบบัญชีคู่)'],
  audit: ['ควบคุมภายใน', 'ตรวจสอบ'],
  users: ['ตั้งค่า', 'ผู้ใช้งาน'],
}

// ---- dashboard: stat cards ----
export interface StatOpt {
  dark?: boolean
  color?: string
  iconBg?: string
  iconColor?: string
  icon?: string
}

export interface StatCard {
  label: string
  value: string
  unit: string
  sub: string
  cardBg: string
  cardBorder: string
  labelColor: string
  valueColor: string
  unitColor: string
  subColor: string
  iconBg: string
  iconColor: string
  icon: string
}

function sc(label: string, value: string, unit: string, sub: string, opt: StatOpt = {}): StatCard {
  return {
    label,
    value,
    unit: unit || '',
    sub: sub || '',
    cardBg: opt.dark ? '#30506A' : '#ffffff',
    cardBorder: opt.dark ? '#223A4E' : '#E1E5EA',
    labelColor: opt.dark ? '#B6C6D4' : '#5C6770',
    valueColor: opt.dark ? '#ffffff' : opt.color || '#1C2730',
    unitColor: opt.dark ? '#B6C6D4' : '#94A0A8',
    subColor: opt.dark ? '#9FB4C4' : '#94A0A8',
    iconBg: opt.dark ? 'rgba(255,255,255,.14)' : opt.iconBg || '#EDF1F4',
    iconColor: opt.dark ? '#fff' : opt.iconColor || '#30506A',
    icon: opt.icon || 'M4 21h16M6 21V8l6-4 6 4v13',
  }
}

export const statCards: StatCard[] = [
  sc('กำลังสร้าง', '14', 'หลัง', '+2 จากเดือนก่อน', { icon: 'M4 21h16M6 21V8l6-4 6 4v13M10 21v-5h4v5' }),
  sc('ส่งมอบแล้ว', '9', 'หลัง', 'ปีนี้', { color: '#2E7D55', iconBg: '#E2F1EA', iconColor: '#2E7D55', icon: 'M20 6L9 17l-5-5' }),
  sc('After-service', '3', 'หลัง', 'อยู่ในประกัน', { color: '#C0852C', iconBg: '#F6ECD6', iconColor: '#C0852C', icon: 'M12 3l7 3v5c0 4-3 7-7 9-4-2-7-5-7-9V6z' }),
  sc('รายรับสะสม', '฿82.4M', '', 'ปีงบ 2568', { color: '#2E7D55', iconBg: '#E2F1EA', iconColor: '#2E7D55', icon: 'M12 3v18M17 7H9.5a3 3 0 000 6H14a3 3 0 010 6H6' }),
  sc('เงินรอเก็บ', '฿18.6M', '', 'คงค้างทุกหลัง', { iconBg: '#F6ECD6', iconColor: '#C0852C', icon: 'M3 6h18v12H3z M3 10h18' }),
  sc('รายจ่าย', '฿54.1M', '', 'ปีงบ 2568', { color: '#C24036', iconBg: '#FBEEEC', iconColor: '#C24036', icon: 'M12 21V3M7 8l5-5 5 5' }),
  sc('เงินสดสุทธิ', '฿28.3M', '', 'คงเหลือ', { icon: 'M3 6h18v12H3z M16 12h.01M3 10h18' }),
  sc('งวดเลยกำหนด', '5', 'งวด', 'ต้องตามด่วน', { dark: true, icon: 'M12 4l9 16H3z M12 10v4 M12 17.5v.1' }),
]

// ---- dashboard: alerts ----
export interface OverdueRow {
  house: string
  no: string
  detail: string
  amount: string
  days: string
  id: string
}
export const overdue: OverdueRow[] = []

export interface CollectRow {
  house: string
  detail: string
  amount: string
  id: string
}
export const toCollect: CollectRow[] = []

export interface AdvanceRow {
  name: string
  house: string
  remain: string
  next: string
}
export const advances: AdvanceRow[] = []

export interface ProjectRow {
  name: string
  houses: string
  collected: string
  value: string
  pct: string
}
export const projects: ProjectRow[] = []

// ---- issues (dashboard + house detail) ----
export type Priority = 'ด่วนมาก' | 'ปานกลาง' | 'ทั่วไป'
export type IssueStatus = 'รอช่าง' | 'กำลังแก้ไข' | 'แก้ไขแล้ว'

export function prStyle(p: string): Swatch {
  if (p === 'ด่วนมาก') return { c: '#C24036', bg: '#FBEEEC' }
  if (p === 'ปานกลาง') return { c: '#B7791F', bg: '#F6ECD6' }
  return { c: '#5C6770', bg: '#EDF1F4' }
}
export function isStyle(s: string): Swatch {
  if (s === 'รอช่าง') return { c: '#B7791F', bg: '#F6ECD6' }
  if (s === 'กำลังแก้ไข') return { c: '#30506A', bg: '#E2E9EF' }
  return { c: '#5C6770', bg: '#EDF1F4' }
}

export interface DashIssue {
  house: string
  title: string
  by: string
  date: string
  priority: Priority
  status: IssueStatus
}
export const issues: DashIssue[] = []

// ---- house list status filters ----
export const filters = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'กำลังสร้าง', label: 'กำลังสร้าง' },
  { id: 'ส่งมอบแล้ว', label: 'ส่งมอบแล้ว' },
  { id: 'after-service', label: 'After-service' },
  { id: 'เพิ่งเริ่ม', label: 'เพิ่งเริ่ม' },
]

// ---- house detail static data ----
export interface InfoRow {
  k: string
  v: string
}
export const detailInfo: InfoRow[] = [
  { k: 'รหัสบ้าน', v: '' }, // code filled in at runtime
  { k: 'แบบบ้าน', v: 'PD-2 ชั้น 4 ห้องนอน' },
  { k: 'พื้นที่ใช้สอย', v: '248 ตร.ม.' },
  { k: 'เริ่มก่อสร้าง', v: '15 ม.ค. 2568' },
  { k: 'กำหนดส่งมอบ', v: '30 พ.ย. 2568' },
  { k: 'ผู้จัดการโครงการ', v: 'คุณอรรถพล' },
]

export interface FileRow {
  ext: string
  name: string
  size: string
  bg: string
  color: string
}
export const detailFiles: FileRow[] = [
  { ext: 'PDF', name: 'สัญญาก่อสร้าง.pdf', size: '2.4 MB', bg: '#FBEEEC', color: '#C24036' },
  { ext: 'DWG', name: 'แบบบ้าน-PD2.dwg', size: '8.1 MB', bg: '#E2E9EF', color: '#30506A' },
  { ext: 'PDF', name: 'BOQ-ประมาณการ.pdf', size: '1.2 MB', bg: '#FBEEEC', color: '#C24036' },
  { ext: 'JPG', name: 'รูปหน้างาน-มิ.ย.jpg', size: '3.7 MB', bg: '#E2F1EA', color: '#2E7D55' },
]

// installments
export function onB(ot: string): Swatch {
  if (ot === 'ตรงเวลา') return { c: '#2E7D55', bg: '#E2F1EA' }
  if (ot === 'ล่าช้า') return { c: '#C24036', bg: '#FBEEEC' }
  return { c: '#94A0A8', bg: '#F1F4F6' }
}
export function inStat(s: string): Swatch {
  if (s === 'เก็บแล้ว' || s === 'จ่ายแล้ว') return { c: '#2E7D55', bg: '#E2F1EA' }
  if (s === 'จ่ายบางส่วน' || s === 'เก็บบางส่วน') return { c: '#30506A', bg: '#E2E9EF' }
  if (s === 'รอเก็บเงิน' || s === 'รอจ่าย') return { c: '#B7791F', bg: '#F6ECD6' }
  if (s === 'เลยกำหนด') return { c: '#C24036', bg: '#FBEEEC' }
  return { c: '#5C6770', bg: '#EDF1F4' }
}

export interface Installment {
  no: string
  detail: string
  days: string
  due: string
  ontime: string
  amount: string
  status: string
  dueC: string
}
export const installments: Installment[] = [
  { no: '1', detail: 'เงินมัดจำ ทำสัญญา', days: '-', due: '15 ม.ค. 68', ontime: 'ตรงเวลา', amount: '฿425,000', status: 'เก็บแล้ว', dueC: '#5C6770' },
  { no: '2', detail: 'งานฐานราก-เสาเข็ม', days: '30', due: '18 ก.พ. 68', ontime: 'ตรงเวลา', amount: '฿637,500', status: 'เก็บแล้ว', dueC: '#5C6770' },
  { no: '3', detail: 'โครงสร้างชั้น 2 + พื้น', days: '40', due: '12 พ.ค. 68', ontime: 'ตรงเวลา', amount: '฿637,500', status: 'เก็บแล้ว', dueC: '#5C6770' },
  { no: '4', detail: 'งานหลังคา + ฝ้า', days: '25', due: '28 พ.ค. 68', ontime: 'รอ', amount: '฿510,000', status: 'รอเก็บเงิน', dueC: '#5C6770' },
  { no: '5', detail: 'งานระบบไฟ-ประปา', days: '20', due: '02 พ.ค. 68', ontime: 'ล่าช้า', amount: '฿425,000', status: 'เลยกำหนด', dueC: '#C24036' },
  { no: '6', detail: 'งานสี-ฝ้า-ปูกระเบื้อง', days: '30', due: '25 มิ.ย. 68', ontime: 'รอ', amount: '฿637,500', status: 'ยังไม่ถึง', dueC: '#5C6770' },
]

// contractors
export function typeStyle(t: string): Swatch {
  if (t === 'เหมารวม') return { c: '#30506A', bg: '#E2E9EF' }
  return { c: '#C0852C', bg: '#F6ECD6' }
}

export interface ContractorHistory {
  date: string
  item: string
  gross: string
  deduct: string
  net: string
}
export interface Contractor {
  initial: string
  name: string
  role: string
  type: string
  advance: string
  deducted: string
  remain: string
  withdrawn: string
  paid: string
  suggest: string
  suggestNote: string
  history: ContractorHistory[]
}
export const contractors: Contractor[] = [
  {
    initial: 'ว', name: 'หจก. ช่างวิรัตน์ก่อสร้าง', role: 'รับเหมาหลัก · โครงสร้าง-สถาปัตย์', type: 'เหมารวม',
    advance: '฿300,000', deducted: '฿120,000', remain: '฿180,000', withdrawn: '฿1,275,000', paid: '฿1,155,000',
    suggest: '฿60,000', suggestNote: 'จากยอดเบิกงวด 4',
    history: [
      { date: '15 ม.ค. 68', item: 'เงินล่วงหน้าเริ่มงาน', gross: '฿300,000', deduct: '-', net: '฿300,000' },
      { date: '18 ก.พ. 68', item: 'เบิกงวด 2 ฐานราก', gross: '฿420,000', deduct: '฿60,000', net: '฿360,000' },
      { date: '12 พ.ค. 68', item: 'เบิกงวด 3 โครงสร้าง', gross: '฿555,000', deduct: '฿60,000', net: '฿495,000' },
    ],
  },
  {
    initial: 'ป', name: 'ช่างประสิทธิ์ (ทีมไฟ-ประปา)', role: 'รับเหมาช่วง · งานระบบ', type: 'เฉพาะค่าแรง',
    advance: '฿80,000', deducted: '฿30,000', remain: '฿50,000', withdrawn: '฿210,000', paid: '฿180,000',
    suggest: '฿25,000', suggestNote: 'แบ่งหัก 2 งวด',
    history: [
      { date: '02 มี.ค. 68', item: 'เงินล่วงหน้าค่าแรง', gross: '฿80,000', deduct: '-', net: '฿80,000' },
      { date: '20 เม.ย. 68', item: 'ค่าแรงเดินท่อ', gross: '฿70,000', deduct: '฿15,000', net: '฿55,000' },
      { date: '10 พ.ค. 68', item: 'ค่าแรงเดินสายไฟ', gross: '฿60,000', deduct: '฿15,000', net: '฿45,000' },
    ],
  },
]

// detail issues
export interface DetailIssue {
  title: string
  note: string
  by: string
  date: string
  priority: Priority
  status: IssueStatus
}
export const detailIssues: DetailIssue[] = [
  { title: 'ประตูบ้านปิดไม่สนิท', note: 'บานประตูหน้าบ้าน บวมจากความชื้น', by: 'หน้างาน-วิชัย', date: '10 มิ.ย. 68', priority: 'ทั่วไป', status: 'รอช่าง' },
  { title: 'สีทาภายในห้องนอน 2 เป็นรอยด่าง', note: 'ลูกค้าขอแก้ก่อนตรวจรับงวด', by: 'ลูกค้า', date: '08 มิ.ย. 68', priority: 'ปานกลาง', status: 'กำลังแก้ไข' },
  { title: 'จุดต่อท่อน้ำทิ้งรั่วซึมเล็กน้อย', note: 'ใต้ซิงค์ครัว', by: 'หน้างาน-วิชัย', date: '05 มิ.ย. 68', priority: 'ปานกลาง', status: 'แก้ไขแล้ว' },
]

// expenses
export function catStyle(c: string): Swatch {
  if (c === 'วัสดุ') return { c: '#30506A', bg: '#E2E9EF' }
  if (c === 'ค่าแรง') return { c: '#C0852C', bg: '#F6ECD6' }
  if (c === 'ขนส่ง') return { c: '#5C6770', bg: '#EDF1F4' }
  return { c: '#2E7D55', bg: '#E2F1EA' }
}

export interface Expense {
  date: string
  item: string
  cat: string
  vendor: string
  amount: string
}
export const expenses: Expense[] = [
  { date: '14 มิ.ย. 68', item: 'ปูนซีเมนต์ + เหล็กเส้น', cat: 'วัสดุ', vendor: 'ร้านวัสดุไทยพานิช', amount: '฿185,400' },
  { date: '10 มิ.ย. 68', item: 'ค่าแรงงานทีมโครงสร้าง', cat: 'ค่าแรง', vendor: 'หจก. ช่างวิรัตน์', amount: '฿495,000' },
  { date: '06 มิ.ย. 68', item: 'กระเบื้องหลังคา CPAC', cat: 'วัสดุ', vendor: 'โฮมโปร สาขาบางนา', amount: '฿128,600' },
  { date: '02 มิ.ย. 68', item: 'ค่าขนส่งวัสดุเข้าหน้างาน', cat: 'ขนส่ง', vendor: 'ขนส่งรุ่งเรือง', amount: '฿24,000' },
  { date: '28 พ.ค. 68', item: 'สุขภัณฑ์ American Standard', cat: 'วัสดุ', vendor: 'บุญถาวร', amount: '฿96,800' },
]

// detail tabs
export const detailTabsDef = [
  { id: 'installments', label: 'งวดงาน', count: '6' },
  { id: 'contractors', label: 'ช่าง / ผู้รับเหมา', count: '2' },
  { id: 'issues', label: 'ปัญหา', count: '3' },
  { id: 'expenses', label: 'รายจ่าย', count: '' },
]

// placeholder pages
export const phMap: Record<string, { icon: string; desc: string }> = {
  installments: { icon: 'M4 6h16M4 12h16M4 18h11', desc: 'มุมมองรวมทุกงวดงานของทุกหลัง พร้อมตัวกรองตามสถานะ ตรงเวลา/ล่าช้า และยอดเงิน' },
  issues: { icon: 'M12 4l9 16H3z M12 10v4 M12 17.5v.1', desc: 'รายการปัญหาหน้างานทั้งหมด จัดลำดับความเร่งด่วน มอบหมายช่าง และติดตามสถานะการแก้ไข' },
  expenses: { icon: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6', desc: 'บันทึกรายจ่ายทุกหมวด แยกตามบ้าน/โครงการ พร้อมสรุปต้นทุนเทียบงบประมาณ' },
  procurement: { icon: 'M3 5h2l2.4 11h10l2-8H6', desc: 'ใบขอซื้อ (PR), ใบสั่งซื้อ (PO), ใบเสร็จ/จ่ายเงิน (หัก ณ ที่จ่าย), ยอดค้างจ่าย, ผู้ขาย และรายงานภาษี ภงด.3/53' },
  time: { icon: 'M12 21a9 9 0 100-18 9 9 0 000 18z M12 7.5v5l3 2', desc: 'หน้าจอลงเวลาแบบ kiosk เลือกชื่อ ใส่ PIN แล้วกดปุ่มใหญ่เข้างาน/ออกงาน' },
  hr: { icon: 'M16 19c0-2.8-2.2-5-5-5s-5 2.2-5 5 M11 11a3 3 0 100-6 3 3 0 000 6', desc: 'พนักงาน, เงินเดือน (สลิป + ประกันสังคม), OT, ลงเวลา, ลางาน และสรุป ภงด.1 / กท.20' },
  users: { icon: 'M12 3l7 3v5c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6z', desc: 'จัดการผู้ใช้และสิทธิ์ 4 ระดับ: ผู้ดูแล, บัญชี, หน้างาน, ดูอย่างเดียว' },
}

// modal field shape
export interface ModalField {
  label: string
  value: string
  ph: string
  /** when present, the field renders as a dropdown instead of a text input */
  options?: { value: string; label: string }[]
  /** optional helper text shown under the field */
  hint?: string
  /** format as money: digits only + live thousands separators (1,000,000) */
  money?: boolean
  /** must not be empty when saving */
  required?: boolean
  /** input type, e.g. 'date' */
  type?: string
}
export interface ModalDef {
  title: string
  sub: string
  fields: ModalField[]
  /** Called with the current field values (in field order) when the user saves. */
  onSubmit?: (values: string[]) => Promise<void>
}

// ===== จับคู่ชื่อวัสดุกับราคากลาง (fuzzy) — ใช้เตือนราคาแพงตอนทำ PR/PO =====
export function normMat(s: string) {
  return String(s || '').replace(/\s+/g, '').replace(/["“”#]/g, '').toLowerCase()
}
export function matchMaterial<T extends { name: string; unit?: string }>(desc: string, list: T[]): { mp: T; score: number } | null {
  const d = String(desc || '').trim()
  if (d.length < 3 || !list || !list.length) return null
  const dn = normMat(d)
  const toks = (s: string) => new Set(String(s).toLowerCase().split(/[\s()#"'“”]+/).filter((t) => t.length >= 2))
  const dt = toks(d)
  let best: { mp: T; score: number } | null = null
  for (const mp of list) {
    const mn = normMat(mp.name)
    let score = 0
    if (mn === dn) score = 1
    else if (mn.length >= 4 && dn.length >= 4 && (mn.includes(dn) || dn.includes(mn))) score = 0.85
    else {
      const mt = toks(mp.name)
      let inter = 0
      dt.forEach((t) => { if (mt.has(t)) inter++ })
      const uni = new Set([...dt, ...mt]).size
      score = uni ? inter / uni : 0
    }
    if (!best || score > best.score) best = { mp, score }
  }
  return best && best.score >= 0.5 ? best : null
}
