// ---------------------------------------------------------------------------
// PPSD Construction ERP — sample data for the extended pages
// (all-installments, procurement, HR, time-clock, printed documents)
// ---------------------------------------------------------------------------
import type { Swatch } from './data'

// =====================================================================
// งวดงานรวม (all installments across every house)
// =====================================================================
export interface AllInstallment {
  house: string
  project: string
  no: string
  detail: string
  due: string
  ontime: string // ตรงเวลา | ล่าช้า | รอ
  amount: string
  status: string // เก็บแล้ว | รอเก็บเงิน | เลยกำหนด | ยังไม่ถึง
}

export const allInstallments: AllInstallment[] = []

export function instOntimeStyle(ot: string): Swatch {
  if (ot === 'ตรงเวลา') return { c: '#2E7D55', bg: '#E2F1EA' }
  if (ot === 'ล่าช้า') return { c: '#C24036', bg: '#FBEEEC' }
  return { c: '#94A0A8', bg: '#F1F4F6' }
}
export function instStatusStyle(s: string): Swatch {
  if (s === 'เก็บแล้ว') return { c: '#2E7D55', bg: '#E2F1EA' }
  if (s === 'รอเก็บเงิน') return { c: '#B7791F', bg: '#F6ECD6' }
  if (s === 'เลยกำหนด') return { c: '#C24036', bg: '#FBEEEC' }
  return { c: '#5C6770', bg: '#EDF1F4' }
}

export const installmentFilters = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'รอเก็บเงิน', label: 'รอเก็บเงิน' },
  { id: 'เลยกำหนด', label: 'เลยกำหนด' },
  { id: 'เก็บแล้ว', label: 'เก็บแล้ว' },
  { id: 'ยังไม่ถึง', label: 'ยังไม่ถึง' },
]

// =====================================================================
// จัดซื้อ / จ่าย (procurement)
// =====================================================================
export const procurementTabs = [
  { id: 'pr', label: 'ใบขอซื้อ (PR)' },
  { id: 'po', label: 'ใบสั่งซื้อ (PO)' },
  { id: 'pay', label: 'จ่ายเงิน / หัก ณ ที่จ่าย' },
  { id: 'payable', label: 'ยอดค้างจ่าย' },
  { id: 'vendors', label: 'ผู้ขาย / ผู้รับเหมา' },
  { id: 'tax', label: 'รายงานภาษี' },
]

export function approvalStyle(s: string): Swatch {
  if (s === 'อนุมัติ' || s === 'รับของแล้ว' || s === 'จ่ายแล้ว' || s === 'ปิดงาน') return { c: '#2E7D55', bg: '#E2F1EA' }
  if (s === 'รออนุมัติ' || s === 'รออนุมัติชั้น 2' || s === 'รอส่งของ' || s === 'ค้างจ่าย') return { c: '#B7791F', bg: '#F6ECD6' }
  if (s === 'ปฏิเสธ' || s === 'เลยกำหนด') return { c: '#C24036', bg: '#FBEEEC' }
  return { c: '#30506A', bg: '#E2E9EF' }
}

export interface PR {
  no: string
  date: string
  house: string
  by: string
  item: string
  amount: string
  status: string
}
export const purchaseRequests: PR[] = [
  { no: 'PR-68-0142', date: '14 มิ.ย. 68', house: 'บ้านลีลาวดี', by: 'หน้างาน-วิชัย', item: 'เหล็กเส้น + ลวดผูกเหล็ก', amount: '฿128,000', status: 'รออนุมัติ' },
  { no: 'PR-68-0141', date: '13 มิ.ย. 68', house: 'บ้านเรือนแก้ว', by: 'ธุรการ-สมหญิง', item: 'กระเบื้องหลังคา CPAC', amount: '฿96,500', status: 'อนุมัติ' },
  { no: 'PR-68-0140', date: '12 มิ.ย. 68', house: 'บ้านพิมพ์มาดา', by: 'หน้างาน-วิชัย', item: 'สุขภัณฑ์ + ก๊อกน้ำ', amount: '฿74,200', status: 'อนุมัติ' },
  { no: 'PR-68-0139', date: '10 มิ.ย. 68', house: 'บ้านเฌอบางกอก', by: 'ธุรการ-สมหญิง', item: 'ปูนซีเมนต์ 200 ถุง', amount: '฿42,000', status: 'ปฏิเสธ' },
]

export interface PO {
  no: string
  date: string
  vendor: string
  item: string
  amount: string
  status: string
}
export const purchaseOrders: PO[] = []

export interface Payment {
  date: string
  no: string
  payee: string
  type: string // ภงด.3 | ภงด.53 | -
  gross: string
  whtRate: string
  wht: string
  net: string
}
export const payments: Payment[] = [
  { date: '12 มิ.ย. 68', no: 'PV-68-0211', payee: 'หจก. ช่างวิรัตน์ก่อสร้าง', type: 'ภงด.53', gross: '฿555,000', whtRate: '3%', wht: '฿16,650', net: '฿538,350' },
  { date: '10 มิ.ย. 68', no: 'PV-68-0210', payee: 'ช่างประสิทธิ์ (บุคคล)', type: 'ภงด.3', gross: '฿70,000', whtRate: '3%', wht: '฿2,100', net: '฿67,900' },
  { date: '08 มิ.ย. 68', no: 'PV-68-0209', payee: 'โฮมโปร สาขาบางนา', type: '-', gross: '฿96,500', whtRate: '-', wht: '฿0', net: '฿96,500' },
  { date: '05 มิ.ย. 68', no: 'PV-68-0208', payee: 'ขนส่งรุ่งเรือง (บุคคล)', type: 'ภงด.3', gross: '฿24,000', whtRate: '1%', wht: '฿240', net: '฿23,760' },
]

export interface Payable {
  vendor: string
  doc: string
  due: string
  amount: string
  status: string
}
export const payables: Payable[] = []

export interface Vendor {
  name: string
  type: string // นิติบุคคล | บุคคล
  taxId: string
  total: string
  outstanding: string
}
export const vendors: Vendor[] = [
  { name: 'หจก. ช่างวิรัตน์ก่อสร้าง', type: 'นิติบุคคล', taxId: '0-1055-xxxxx-12-3', total: '฿4,280,000', outstanding: '฿0' },
  { name: 'ร้านวัสดุไทยพานิช', type: 'นิติบุคคล', taxId: '0-1035-xxxxx-44-1', total: '฿1,640,000', outstanding: '฿128,000' },
  { name: 'หจก. รุ่งเรืองรับเหมา', type: 'นิติบุคคล', taxId: '0-1095-xxxxx-08-9', total: '฿2,150,000', outstanding: '฿240,000' },
  { name: 'ช่างประสิทธิ์', type: 'บุคคล', taxId: '1-1009-xxxxx-21-7', total: '฿620,000', outstanding: '฿0' },
]

export interface TaxCard {
  label: string
  value: string
  sub: string
  accent: string
}
export const taxCards: TaxCard[] = [
  { label: 'ภงด.3 (หัก ณ ที่จ่าย-บุคคล)', value: '฿18,400', sub: 'มิ.ย. 2568 · นำส่งภายใน 7 ก.ค.', accent: '#30506A' },
  { label: 'ภงด.53 (หัก ณ ที่จ่าย-นิติบุคคล)', value: '฿42,650', sub: 'มิ.ย. 2568 · นำส่งภายใน 7 ก.ค.', accent: '#30506A' },
  { label: 'ภาษีซื้อ (VAT 7%)', value: '฿96,820', sub: 'มิ.ย. 2568 · เครดิตภาษีได้', accent: '#2E7D55' },
]

// =====================================================================
// บุคลากร / HR
// =====================================================================
// ตำแหน่งงาน (สำหรับฟอร์มเพิ่มพนักงาน)
export const positions = [
  'ดราฟแมน',
  'โฟร์แมน',
  'จัดซื้อ',
  'บัญชี',
  'การตลาด',
  'เลขา',
  'สถาปนิก',
  'ผู้จัดการ',
  'บุคคล',
]

export const hrTabs = [
  { id: 'employees', label: 'พนักงาน' },
  { id: 'payroll', label: 'เงินเดือน' },
  { id: 'ot', label: 'OT' },
  { id: 'attendance', label: 'ลงเวลา' },
  { id: 'attsummary', label: 'สรุปลงเวลา (เดือน)' },
  { id: 'holidays', label: 'วันหยุด' },
  { id: 'location', label: 'ติดตามตำแหน่ง' },
  { id: 'leave', label: 'ลางาน' },
  { id: 'timeadj', label: 'ปรับปรุงเวลา' },
  { id: 'tax', label: 'ภงด.1 / ประกันสังคม' },
]

export interface Employee {
  code: string
  name: string
  role: string
  dept: string
  start: string
  status: string // ทำงาน | ทดลองงาน | ลาออก
}
export const employees: Employee[] = [
  { code: 'EMP-001', name: 'ธนกร ผดุงศักดิ์', role: 'ผู้จัดการทั่วไป', dept: 'บริหาร', start: '01 มี.ค. 60', status: 'ทำงาน' },
  { code: 'EMP-007', name: 'สมหญิง รักงาน', role: 'ธุรการหน้างาน', dept: 'ธุรการ', start: '15 พ.ค. 64', status: 'ทำงาน' },
  { code: 'EMP-012', name: 'วิชัย แข็งขัน', role: 'โฟร์แมน', dept: 'หน้างาน', start: '01 ก.พ. 63', status: 'ทำงาน' },
  { code: 'EMP-018', name: 'อรรถพล ตั้งใจ', role: 'ผู้จัดการโครงการ', dept: 'หน้างาน', start: '10 ก.ค. 62', status: 'ทำงาน' },
  { code: 'EMP-024', name: 'นภาพร บัญชี', role: 'พนักงานบัญชี', dept: 'บัญชี', start: '20 ก.ย. 65', status: 'ทำงาน' },
  { code: 'EMP-031', name: 'ปกรณ์ จัดซื้อ', role: 'เจ้าหน้าที่จัดซื้อ', dept: 'จัดซื้อ', start: '05 ม.ค. 67', status: 'ทดลองงาน' },
]

export function empStatusStyle(s: string): Swatch {
  if (s === 'ทำงาน') return { c: '#2E7D55', bg: '#E2F1EA' }
  if (s === 'ทดลองงาน') return { c: '#B7791F', bg: '#F6ECD6' }
  return { c: '#5C6770', bg: '#EDF1F4' }
}

export interface Payroll {
  code: string
  name: string
  base: string
  ot: string
  gross: string
  sso: string // ประกันสังคม
  tax: string
  net: string
}
export const payroll: Payroll[] = [
  { code: 'EMP-001', name: 'ธนกร ผดุงศักดิ์', base: '฿65,000', ot: '฿0', gross: '฿65,000', sso: '฿750', tax: '฿4,200', net: '฿60,050' },
  { code: 'EMP-007', name: 'สมหญิง รักงาน', base: '฿22,000', ot: '฿1,800', gross: '฿23,800', sso: '฿750', tax: '฿0', net: '฿23,050' },
  { code: 'EMP-012', name: 'วิชัย แข็งขัน', base: '฿28,000', ot: '฿3,600', gross: '฿31,600', sso: '฿750', tax: '฿380', net: '฿30,470' },
  { code: 'EMP-018', name: 'อรรถพล ตั้งใจ', base: '฿42,000', ot: '฿0', gross: '฿42,000', sso: '฿750', tax: '฿1,650', net: '฿39,600' },
  { code: 'EMP-024', name: 'นภาพร บัญชี', base: '฿26,000', ot: '฿900', gross: '฿26,900', sso: '฿750', tax: '฿250', net: '฿25,900' },
]

export interface OT {
  name: string
  date: string
  hours: string
  rate: string
  amount: string
  status: string // รออนุมัติ | อนุมัติ
}
export const otRecords: OT[] = [
  { name: 'วิชัย แข็งขัน', date: '13 มิ.ย. 68', hours: '4 ชม.', rate: '1.5x', amount: '฿1,050', status: 'รออนุมัติ' },
  { name: 'สมหญิง รักงาน', date: '12 มิ.ย. 68', hours: '2 ชม.', rate: '1.5x', amount: '฿410', status: 'อนุมัติ' },
  { name: 'วิชัย แข็งขัน', date: '08 มิ.ย. 68', hours: '6 ชม.', rate: '1.5x', amount: '฿1,575', status: 'อนุมัติ' },
  { name: 'นภาพร บัญชี', date: '07 มิ.ย. 68', hours: '3 ชม.', rate: '1.5x', amount: '฿520', status: 'รออนุมัติ' },
]

export interface Attendance {
  name: string
  date: string
  in: string
  out: string
  total: string
  status: string // ปกติ | สาย | ขาด
}
export const attendance: Attendance[] = []
export function attendanceStyle(s: string): Swatch {
  if (s === 'ปกติ') return { c: '#2E7D55', bg: '#E2F1EA' }
  if (s === 'สาย') return { c: '#B7791F', bg: '#F6ECD6' }
  return { c: '#C24036', bg: '#FBEEEC' }
}

export interface Leave {
  name: string
  type: string // ลาป่วย | ลากิจ | พักร้อน
  range: string
  days: string
  status: string // รออนุมัติ | อนุมัติ
}
export const leaves: Leave[] = []
export function leaveTypeStyle(t: string): Swatch {
  if (t === 'ลาป่วย') return { c: '#C24036', bg: '#FBEEEC' }
  if (t === 'ลากิจ') return { c: '#B7791F', bg: '#F6ECD6' }
  return { c: '#30506A', bg: '#E2E9EF' }
}

export const hrTaxCards: TaxCard[] = [
  { label: 'ภงด.1 (ภาษีหัก ณ ที่จ่าย-เงินเดือน)', value: '฿6,480', sub: 'มิ.ย. 2568 · นำส่งภายใน 7 ก.ค.', accent: '#30506A' },
  { label: 'ประกันสังคม (นำส่ง)', value: '฿11,250', sub: 'นายจ้าง+ลูกจ้าง · ภายใน 15 ก.ค.', accent: '#30506A' },
  { label: 'กท.20 ก (กองทุนเงินทดแทน)', value: '฿8,400', sub: 'รายปี 2568 · ยื่นแล้ว', accent: '#2E7D55' },
]

// =====================================================================
// ลงเวลา (kiosk)
// =====================================================================
export interface KioskEmployee {
  code: string
  name: string
  pin: string
  checkedIn: boolean
  lastIn: string
}
export const kioskEmployees: KioskEmployee[] = []

// =====================================================================
// เอกสารสำหรับพิมพ์ (printed documents)
// =====================================================================
// the in-app print modal only renders the payroll slip; PR/PO/WHT/sales
// documents have their own dedicated components (PrApprovalDoc/PoDoc/WhtDoc/SalesDocPrint)
export type DocKind = 'slip'

// company header info reused across documents
export const company = {
  name: 'บริษัท พีพีเอสดี คอนสตรัคชั่น จำกัด',
  nameEn: 'PPSD Construction Co., Ltd.',
  address: '126 ม.9 ถ.เพชรเกษม ตำบลบ้านสิงห์ อำเภอโพธาราม จังหวัดราชบุรี 70120',
  taxId: 'เลขประจำตัวผู้เสียภาษี 0705562001954',
  phone: '',
}

// =====================================================================
// ปัญหาหน้างาน (all houses)
// =====================================================================
export interface SiteIssue {
  house: string
  project: string
  title: string
  note: string
  by: string
  date: string
  priority: string // ด่วนมาก | ปานกลาง | ทั่วไป
  status: string // รอช่าง | กำลังแก้ไข | แก้ไขแล้ว
}
export const allIssues: SiteIssue[] = []
export const issuePriorityFilters = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'ด่วนมาก', label: 'ด่วนมาก' },
  { id: 'ปานกลาง', label: 'ปานกลาง' },
  { id: 'ทั่วไป', label: 'ทั่วไป' },
]

// =====================================================================
// รายจ่าย (all houses)
// =====================================================================
export interface SiteExpense {
  date: string
  house: string
  item: string
  cat: string // วัสดุ | ค่าแรง | ขนส่ง | อื่นๆ
  vendor: string
  amount: string
}
export const allExpenses: SiteExpense[] = []
export const expenseCatFilters = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'วัสดุ', label: 'วัสดุ' },
  { id: 'ค่าแรง', label: 'ค่าแรง' },
  { id: 'ขนส่ง', label: 'ขนส่ง' },
  { id: 'อื่นๆ', label: 'อื่นๆ' },
]
export const expenseSummary = [
  { label: 'วัสดุ', value: '฿410,800', color: '#30506A' },
  { label: 'ค่าแรง', value: '฿675,000', color: '#C0852C' },
  { label: 'ขนส่ง', value: '฿24,000', color: '#5C6770' },
  { label: 'อื่นๆ', value: '฿38,500', color: '#2E7D55' },
]

// =====================================================================
// ระบบสิทธิ์ / ผู้ใช้งาน (roles & users)
// =====================================================================
export type Role = 'admin' | 'accounting' | 'site' | 'viewer'

export interface RoleDef {
  id: Role
  label: string
  desc: string
  color: string
  bg: string
}
export const roles: RoleDef[] = [
  { id: 'admin', label: 'ผู้ดูแล', desc: 'เข้าถึงและแก้ไขได้ทุกส่วน รวมเงินเดือน', color: '#C0852C', bg: '#F6ECD6' },
  { id: 'accounting', label: 'บัญชี', desc: 'การเงิน จัดซื้อ/จ่าย และเงินเดือน', color: '#30506A', bg: '#E2E9EF' },
  { id: 'site', label: 'หน้างาน', desc: 'บ้าน งวดงาน ปัญหา — ไม่เห็นเงินเดือน', color: '#2E7D55', bg: '#E2F1EA' },
  { id: 'viewer', label: 'ดูอย่างเดียว', desc: 'อ่านได้อย่างเดียว — ไม่เห็นเงินเดือน', color: '#5C6770', bg: '#EDF1F4' },
]
export const roleLabel: Record<Role, string> = {
  admin: 'ผู้ดูแลระบบ',
  accounting: 'ฝ่ายบัญชี',
  site: 'ธุรการหน้างาน',
  viewer: 'ผู้ชมข้อมูล',
}
// salary / payroll visible only to these roles
export const canSeeSalary = (r: Role) => r === 'admin' || r === 'accounting'

export interface UserRow {
  name: string
  username: string
  role: Role
  status: string // ใช้งาน | ระงับ
  lastActive: string
}
export const users: UserRow[] = [
  { name: 'ธนกร ผดุงศักดิ์', username: 'thanakorn', role: 'admin', status: 'ใช้งาน', lastActive: 'ออนไลน์' },
  { name: 'นภาพร บัญชี', username: 'napaporn', role: 'accounting', status: 'ใช้งาน', lastActive: '5 นาทีที่แล้ว' },
  { name: 'สมหญิง รักงาน', username: 'somying', role: 'site', status: 'ใช้งาน', lastActive: '1 ชม. ที่แล้ว' },
  { name: 'วิชัย แข็งขัน', username: 'wichai', role: 'site', status: 'ใช้งาน', lastActive: '2 ชม. ที่แล้ว' },
  { name: 'อรรถพล ตั้งใจ', username: 'auttapon', role: 'viewer', status: 'ใช้งาน', lastActive: 'เมื่อวาน' },
  { name: 'ปกรณ์ จัดซื้อ', username: 'pakorn', role: 'accounting', status: 'ระงับ', lastActive: '3 วันที่แล้ว' },
]

// permission matrix shown on the users page
export const permissionMatrix = {
  features: ['หน้าสรุป', 'บ้าน / งวดงาน', 'ปัญหา / รายจ่าย', 'จัดซื้อ / จ่าย', 'เงินเดือน', 'ตั้งค่าผู้ใช้'],
  // per feature: [admin, accounting, site, viewer] -> 'full' | 'view' | 'none'
  grid: [
    ['full', 'view', 'view', 'view'], // หน้าสรุป
    ['full', 'view', 'full', 'view'], // บ้าน/งวดงาน
    ['full', 'view', 'full', 'view'], // ปัญหา/รายจ่าย
    ['full', 'full', 'none', 'none'], // จัดซื้อ/จ่าย
    ['full', 'full', 'none', 'none'], // เงินเดือน
    ['full', 'none', 'none', 'none'], // ตั้งค่าผู้ใช้
  ] as const,
}
