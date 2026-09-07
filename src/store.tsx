import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, setToken, getToken } from './api'
import type { Role } from './erpData'

// ---- API row types ----
export interface ApiHouse {
  id: number
  code: string
  name: string
  project: string
  customer: string
  value: number
  pct: number
  collected: number
  remain: number
  status: string
  area?: string
  design?: string
  start_date?: string
  deliver_date?: string
  manager?: string
  area_sqm?: number
  price_customer?: number
  price_contractor?: number
  house_customer?: number
  house_contractor?: number
  carport_customer?: number
  carport_contractor?: number
  road_customer?: number
  road_contractor?: number
  contractor_value?: number
  paid?: number
  profit?: number
  breakdown?: { key: string; label: string; customer: number; contractor: number }[]
  // Phase 1: ประเภทโครงการ + ข้อมูลแบบ CM (ควบคุมงาน)
  kind?: string // 'sale' | 'cm'
  owner?: string
  contract_no?: string
  scope?: string
  engineer?: string
  supervisor?: string
  service_fee?: number
  site_location?: string
  photo?: string
}
export interface ApiInstallment {
  id: number
  house_code: string
  no: number
  detail: string
  days: string
  due: string
  due_iso?: string
  ontime: string
  amount: number
  paid?: number
  status: string
  overdue?: boolean // เลยกำหนด (คิดสดจาก due_iso ที่ server)
  side?: string
  category?: string
  contractor?: string
  house?: string
  project?: string
}
export interface ApiIssue {
  id: number
  house_code: string
  title: string
  note: string
  by: string
  date: string
  priority: string
  status: string
  house?: string
  project?: string
}
export interface ApprovalStep { step: number; approver: string; sig?: string | null; role?: string; date?: string; note?: string }
export interface Approval { required: number; count: number; approvals: ApprovalStep[]; rejected: boolean; rejectedBy?: string; rejectNote?: string; done: boolean }

export interface ApiExpense {
  id: number
  date: string
  house_code: string
  item: string
  cat: string
  vendor: string
  amount: number
  house?: string
  date_iso?: string
  vat_amount?: number
  tax_invoice_no?: string
  approval?: Approval
  status?: string
}
export interface ApiEmployee {
  id: number
  code: string
  name: string
  role: string
  dept: string
  start: string
  status: string
  pay_type?: string
  base?: number
  sick_quota?: number
  sick_used?: number
  personal_quota?: number
  personal_used?: number
  vacation_quota?: number
  vacation_used?: number
  signature?: string | null
  has_pin?: boolean
  work_days?: number
  retention?: number
  student_loan?: number
  retention_opening?: number
  daily_rate?: number
  backup_code?: string
  tax_id?: string
  bank_name?: string
  bank_acct?: string
  prefix?: string
  nickname?: string
  no_sso?: number
}
export interface ApiPayroll extends ApiEmployee {
  base: number
  ot: number
  sso: number
  tax: number
  leave_days?: number
  absent_days?: number
  leave_deduct?: number
  retention?: number
  student_loan?: number
  advance?: number
  other_deduct?: number
  period?: string
  retention_cap?: number
  retention_opening?: number
  retention_paid?: number
  retention_monthly?: number
  retention_periods?: number
  daily_rate?: number
  work_days?: number
  exempt_attendance?: boolean
}
export interface ApiLeave {
  id: number
  emp_code: string
  emp_name: string
  type: string
  start_date: string
  end_date: string
  days: number
  hours?: number
  reason: string
  status: string
  by: string
  approver?: string | null
  approved_date?: string | null
}
export interface ApiTimeAdj {
  id: number
  emp_name: string
  date: string
  kind: string
  time: string
  reason: string
  status: string
  by: string
  approver?: string | null
  approved_date?: string | null
}
export interface ApiAttendance {
  id: number
  emp_code: string
  emp_name: string
  date: string
  check_in: string
  check_out: string
  status: string
}
export interface ApiPO {
  id: number
  no: string
  date: string
  vendor: string
  item: string
  amount: number
  status: string
  image?: string | null
  pr_no?: string
  by?: string
  payment_type?: string
  credit_days?: number
  due_date?: string
  house_code?: string
  approval?: Approval
  items?: { desc: string; qty: number; unit: string; price: number }[]
  gr_status?: string
  gr_date?: string
}
export interface ApiMaterialPrice {
  id: number
  name: string
  nkey?: string
  unit: string
  central: number
  min: number
  max: number
  latest: number
  po_count: number
  qty_total: number
  last_date?: string
  confidence: string
  source?: string
  note?: string
  active?: number
  updated?: string
}
// ราคากลางค่าแรงช่าง — ใช้เป็นราคาแนะนำตอนจ้างช่าง (price_max = 0 → เสนอราคา ไม่มีราคากลาง)
export interface ApiLaborRate {
  id: number
  grp: 'เหมายกหลัง' | 'แยกงาน'
  seq: number
  name: string
  variant: string
  price_min: number
  price_max: number
  unit: string
  note?: string
  active?: number
  updated?: string
}
export const laborLabel = (r: Pick<ApiLaborRate, 'name' | 'variant'>) => r.name + (r.variant ? ` (${r.variant})` : '')
// ข้อความราคากลาง เช่น "120–150 บาท/ตร.ม." หรือ "เสนอราคา"
export const laborPriceText = (r: Pick<ApiLaborRate, 'price_min' | 'price_max' | 'unit'>) =>
  r.price_max > 0
    ? (r.price_min === r.price_max ? r.price_max.toLocaleString('en-US') : `${r.price_min.toLocaleString('en-US')}–${r.price_max.toLocaleString('en-US')}`) + ` บาท/${r.unit}`
    : 'เสนอราคา'
export interface KioskEmp {
  code: string
  name: string
}
export interface ApiOT {
  id: number
  name: string
  date: string
  hours: string
  rate: string
  amount: number
  status: string
}
export interface ApiVendor {
  id: number
  name: string
  type: string
  tax_id: string
  total: number
  outstanding: number
  credit_days?: number
  kind?: string // 'ผู้ขาย' (วัสดุ) หรือ 'ผู้รับเหมา' (ค่าแรง/รับช่วง)
  address?: string
  category?: string // หมวดสินค้า/งาน เช่น วัสดุก่อสร้าง ไฟฟ้า ประปา
  vat_registered?: number
  outstanding_live?: number
  total_live?: number
}
export interface ApiPR {
  id: number
  no: string
  date: string
  house: string
  house_code?: string
  category?: string
  by: string
  item: string
  amount: number
  status: string
  items?: { desc: string; qty: number; unit: string; price: number }[] | null
  images?: string[] | null
  requester_sig?: string | null
  approver?: string | null
  approver_sig?: string | null
  approved_date?: string | null
  image?: string | null
  approval?: Approval
}
export interface ApiPayment {
  id: number
  date: string
  no: string
  payee: string
  type: string
  gross: number
  wht_rate: number
  wht: number
  net: number
  house_code?: string
  note?: string
  po_id?: number | null
  po_no?: string
  approval?: Approval
  status?: string
}
export interface ApiUser {
  id: number
  name: string
  username: string
  role: Role
  status: string
  last_active: string
  signature?: string | null
  position?: string
  deny_mods?: string[]
}
export interface Dashboard {
  building: number
  delivered: number
  afterService: number
  collected: number | null
  remain: number | null
  contractValue: number | null
  expense: number | null
  net: number | null // เงินสดสุทธิตามบัญชี (ยอดบัญชีเงินสด+ธนาคาร) — null = ไม่มีสิทธิ์เห็น
  overdue: number
  openIssues: number
  overdueList?: { house: string; no: string; detail: string; amount: string; days: number }[]
  toCollectList?: { house: string; detail: string; amount: string }[]
  advanceList?: { name: string; house: string; remain: string }[]
}
export interface EfilingItem {
  id: string
  label: string
  agency: string
  due: string
}
export interface ApiCustomer {
  id: number
  name: string
  phone: string
  email: string
  address: string
  project: string
  status: string
  note: string
  created: string
}
export interface ApiContact {
  id: number
  customer_id: number
  date: string
  channel: string
  note: string
  by: string
}
export interface ApiTask {
  id: number
  house_code: string
  name: string
  start: string
  end: string
  progress: number
  status: string
  weight?: number
}
export interface SalesItem {
  desc: string
  qty: number
  price: number
}
export interface ApiSalesDoc {
  id: number
  type: 'quote' | 'invoice' | 'receipt'
  no: string
  customer: string
  date: string
  items: string
  subtotal: number
  vat: number
  total: number
  status: string
  house_code?: string
  ref?: string
}
export interface ApiFile {
  id: number
  house_code: string
  name: string
  mime: string
  size: number
  category?: string
  uploaded: string
  uploader: string
}
export interface Notif {
  kind: string
  icon: string
  title: string
  sub: string
  page: string
}
export interface Reports {
  projects: { project: string; value: number; collected: number; expense: number }[]
  categories: { cat: string; amount: number }[]
  totals: { contract: number; collected: number; expense: number }
  cashflow?: { in: number; outContractor: number; outMaterial: number; outPayroll: number; outOther: number; out: number; net: number }
  budget?: { code: string; name: string; plan: number; actualContractor: number; actualMaterial: number; actual: number; variance: number }[]
}
export interface SessionUser {
  id: number
  name: string
  username: string
  role: Role
  signature?: string | null
  position?: string
  isManager?: boolean
  mustChangePin?: boolean
  deny_mods?: string[] // โมดูลที่แอดมินปิดสำหรับบัญชีนี้
}

interface AppData {
  houses: ApiHouse[]
  installments: ApiInstallment[]
  issues: ApiIssue[]
  expenses: ApiExpense[]
  employees: ApiEmployee[]
  payroll: ApiPayroll[] | null
  payrollMeta: { period: string; periodLabel: string; locked: boolean } | null
  ot: ApiOT[]
  vendors: ApiVendor[] | null
  prs: ApiPR[] | null
  payments: ApiPayment[] | null
  users: ApiUser[] | null
  dashboard: Dashboard | null
  efilings: EfilingItem[] | null
  customers: ApiCustomer[]
  tasks: ApiTask[]
  salesDocs: ApiSalesDoc[]
  notifications: Notif[]
  reports: Reports | null
  leaves: ApiLeave[]
  timeAdjustments: ApiTimeAdj[]
  attendance: ApiAttendance[]
  purchaseOrders: ApiPO[] | null
  kioskEmployees: KioskEmp[]
  positions: string[]
  materialPrices: ApiMaterialPrice[] | null
}

const EMPTY: AppData = {
  houses: [], installments: [], issues: [], expenses: [], employees: [],
  payroll: null, payrollMeta: null, ot: [], vendors: null, prs: null, payments: null,
  users: null, dashboard: null, efilings: null,
  customers: [], tasks: [], salesDocs: [], notifications: [], reports: null,
  leaves: [], timeAdjustments: [],
  attendance: [], purchaseOrders: null, kioskEmployees: [], positions: [], materialPrices: null,
}

interface AppCtx {
  user: SessionUser | null
  data: AppData
  loading: boolean
  login: (username: string, pin: string) => Promise<void>
  logout: () => void
  addHouse: (b: Record<string, unknown>) => Promise<void>
  updateHouse: (id: number, b: Record<string, unknown>) => Promise<void>
  addInstallment: (code: string, b: Record<string, unknown>) => Promise<void>
  addIssue: (b: Record<string, unknown>) => Promise<void>
  addExpense: (b: Record<string, unknown>) => Promise<void>
  approveOt: (id: number) => Promise<void>
  addEmployee: (b: Record<string, unknown>) => Promise<{ pin?: string }>
  deleteEmployee: (id: number) => Promise<void>
  setEmpSignature: (id: number, dataUrl: string) => Promise<void>
  setEmpPin: (id: number, pin: string) => Promise<void>
  punch: (b: Record<string, unknown>) => Promise<{ name: string; kind: string; time: string; status: string }>
  addPO: (b: Record<string, unknown>) => Promise<void>
  setPOStatus: (id: number, status: string) => Promise<void>
  addPr: (b: Record<string, unknown>) => Promise<void>
  decidePr: (id: number, status: string) => Promise<void>
  addUser: (b: Record<string, unknown>) => Promise<void>
  updateUser: (id: number, b: Record<string, unknown>) => Promise<void>
  changeMyPin: (currentPin: string, newPin: string) => Promise<void>
  resetUserPin: (id: number, pin: string) => Promise<void>
  addPosition: (name: string) => Promise<void>
  setSignature: (userId: number, dataUrl: string) => Promise<void>
  addCustomer: (b: Record<string, unknown>) => Promise<void>
  addContact: (customerId: number, b: Record<string, unknown>) => Promise<ApiContact[]>
  getCustomer: (id: number) => Promise<ApiCustomer & { contacts: ApiContact[] }>
  addTask: (b: Record<string, unknown>) => Promise<void>
  updateTask: (id: number, b: Record<string, unknown>) => Promise<void>
  addSalesDoc: (b: Record<string, unknown>) => Promise<ApiSalesDoc>
  deriveSalesDoc: (id: number, to: 'invoice' | 'receipt') => Promise<ApiSalesDoc>
  convertQuote: (id: number, name: string) => Promise<void>
  refreshNotifications: () => Promise<void>
  reloadData: (key: keyof AppData, path: string) => Promise<void>
  addLeave: (b: Record<string, unknown>) => Promise<void>
  decideLeave: (id: number, status: string) => Promise<void>
  addTimeAdj: (b: Record<string, unknown>) => Promise<void>
  decideTimeAdj: (id: number, status: string) => Promise<void>
  collectInstallment: (id: number, code: string, uncollect?: boolean) => Promise<void>
  updateInstallment: (id: number, b: Record<string, unknown>) => Promise<void>
  payInstallment: (id: number, amount: number) => Promise<void>
  deleteInstallment: (id: number) => Promise<void>
  addOT: (b: Record<string, unknown>) => Promise<void>
  addPayment: (b: Record<string, unknown>) => Promise<void>
  updateEmployee: (id: number, b: Record<string, unknown>) => Promise<void>
  updateCustomer: (id: number, b: Record<string, unknown>) => Promise<void>
  addVendor: (b: Record<string, unknown>) => Promise<void>
  updateVendor: (id: number, b: Record<string, unknown>) => Promise<void>
  downloadBackup: () => Promise<void>
  restoreBackup: (data: string) => Promise<void>
  viewPayrollPeriod: (period: string) => Promise<void>
  closePayroll: (period: string) => Promise<void>
}

const Ctx = createContext<AppCtx | null>(null)
export const useApp = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useApp must be used inside AppProvider')
  return c
}

// fetch a dataset, returning fallback if access is denied / fails
async function tryGet<T>(path: string, fallback: T): Promise<T> {
  try {
    return await api.get<T>(path)
  } catch {
    return fallback
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [data, setData] = useState<AppData>(EMPTY)
  const [loading, setLoading] = useState(true)

  async function loadAll(me: SessionUser) {
    const role = me.role
    const finance = role === 'admin' || role === 'accounting'
    // salary/payroll visible to: บัญชี (accounting) + ผู้จัดการ + HR (บุคคล) + admin
    const salary = finance || me.position === 'ผู้จัดการ' || me.position === 'บุคคล'
    const [houses, installments, issues, expenses, employees, ot, dashboard] = await Promise.all([
      tryGet<ApiHouse[]>('/houses', []),
      tryGet<ApiInstallment[]>('/installments', []),
      tryGet<ApiIssue[]>('/issues', []),
      tryGet<ApiExpense[]>('/expenses', []),
      tryGet<ApiEmployee[]>('/employees', []),
      tryGet<ApiOT[]>('/ot', []),
      tryGet<Dashboard | null>('/dashboard', null),
    ])
    type PayrollResp = { period: string; periodLabel: string; locked: boolean; rows: ApiPayroll[] }
    const payrollResp = salary ? await tryGet<PayrollResp | null>('/payroll', null) : null
    const payroll = payrollResp ? payrollResp.rows : null
    const payrollMeta = payrollResp ? { period: payrollResp.period, periodLabel: payrollResp.periodLabel, locked: payrollResp.locked } : null
    const vendors = finance ? await tryGet<ApiVendor[]>('/vendors', []) : null
    const prs = finance || role === 'site' ? await tryGet<ApiPR[]>('/purchase-requests', []) : null // โฟร์แมนคีย์ใบขอซื้อได้
    const payments = finance ? await tryGet<ApiPayment[]>('/payments', []) : null
    const efilings = finance ? await tryGet<EfilingItem[]>('/efiling', []) : null
    const users = role === 'admin' ? await tryGet<ApiUser[]>('/users', []) : null
    const [customers, tasks, salesDocs, notifications, leaves, timeAdjustments, attendance, kioskEmployees] = await Promise.all([
      tryGet<ApiCustomer[]>('/customers', []),
      tryGet<ApiTask[]>('/tasks', []),
      tryGet<ApiSalesDoc[]>('/sales-docs', []),
      tryGet<Notif[]>('/notifications', []),
      tryGet<ApiLeave[]>('/leaves', []),
      tryGet<ApiTimeAdj[]>('/time-adjustments', []),
      tryGet<ApiAttendance[]>('/attendance', []),
      tryGet<KioskEmp[]>('/kiosk/employees', []),
    ])
    const reports = finance ? await tryGet<Reports | null>('/reports', null) : null
    const purchaseOrders = finance ? await tryGet<ApiPO[]>('/purchase-orders', []) : null
    const materialPrices = finance || role === 'site' ? await tryGet<ApiMaterialPrice[]>('/material-prices', []) : null
    const positions = await tryGet<string[]>('/positions', [])
    setData({ houses, installments, issues, expenses, employees, payroll, payrollMeta, ot, vendors, prs, payments, users, dashboard, efilings, customers, tasks, salesDocs, notifications, reports, leaves, timeAdjustments, attendance, purchaseOrders, kioskEmployees, positions, materialPrices })
  }

  // restore session on first load if a token exists
  useEffect(() => {
    ;(async () => {
      if (getToken()) {
        try {
          const me = await api.get<SessionUser>('/me')
          setUser(me)
          await loadAll(me)
        } catch {
          setToken(null)
        }
      }
      setLoading(false)
    })()
  }, [])

  async function login(username: string, pin: string) {
    const res = await api.post<{ token: string; user: SessionUser }>('/login', { username, pin })
    setToken(res.token)
    setLoading(true)
    const me = await api.get<SessionUser>('/me') // includes signature
    setUser(me)
    await loadAll(me)
    setLoading(false)
  }

  async function reloadMe() {
    try {
      setUser(await api.get<SessionUser>('/me'))
    } catch {
      /* ignore */
    }
  }

  function logout() {
    api.post('/logout').catch(() => {})
    setToken(null)
    setUser(null)
    setData(EMPTY)
  }

  // mutations: perform the write, then refresh the affected dataset
  async function reload<K extends keyof AppData>(key: K, path: string) {
    const next = await tryGet<AppData[K]>(path, data[key])
    setData((d) => ({ ...d, [key]: next }))
  }
  type PayrollResp = { period: string; periodLabel: string; locked: boolean; rows: ApiPayroll[] }
  async function reloadPayroll(period?: string) {
    const resp = await tryGet<PayrollResp | null>('/payroll' + (period ? '?period=' + period : ''), null)
    if (resp) setData((d) => ({ ...d, payroll: resp.rows, payrollMeta: { period: resp.period, periodLabel: resp.periodLabel, locked: resp.locked } }))
  }

  return (
    <Ctx.Provider
      value={{
        user,
        data,
        loading,
        login,
        logout,
        reloadData: (key, path) => reload(key, path),
        addHouse: async (b) => {
          await api.post('/houses', b)
          await reload('houses', '/houses')
          await reload('dashboard', '/dashboard')
        },
        updateHouse: async (id, b) => {
          await api.put('/houses/' + id, b)
          await Promise.all([reload('houses', '/houses'), reload('dashboard', '/dashboard')])
        },
        addInstallment: async (code, b) => {
          await api.post('/houses/' + code + '/installments', b)
          await Promise.all([reload('installments', '/installments'), reload('houses', '/houses'), reload('dashboard', '/dashboard')])
        },
        addIssue: async (b) => {
          await api.post('/issues', b)
          await reload('issues', '/issues')
          await reload('dashboard', '/dashboard')
        },
        addExpense: async (b) => {
          await api.post('/expenses', b)
          await reload('expenses', '/expenses')
        },
        approveOt: async (id) => {
          await api.post('/ot/' + id + '/approve')
          await reload('ot', '/ot')
        },
        addEmployee: async (b) => {
          const created = await api.post<{ pin?: string }>('/employees', b)
          await Promise.all([reload('employees', '/employees'), reload('kioskEmployees', '/kiosk/employees')])
          if (data.payroll) await reloadPayroll()
          return { pin: created.pin }
        },
        deleteEmployee: async (id) => {
          await api.del('/employees/' + id)
          await Promise.all([reload('employees', '/employees'), reload('kioskEmployees', '/kiosk/employees')])
          if (data.payroll) await reloadPayroll()
        },
        setEmpSignature: async (id, dataUrl) => {
          await api.put('/employees/' + id + '/signature', { signature: dataUrl })
          await reload('employees', '/employees')
        },
        setEmpPin: async (id, pin) => {
          await api.put('/employees/' + id + '/pin', { pin })
        },
        punch: async (b) => {
          const r = await api.post<{ name: string; kind: string; time: string; status: string }>('/kiosk/punch', b)
          await reload('attendance', '/attendance')
          return r
        },
        addPO: async (b) => {
          await api.post('/purchase-orders', b)
          await reload('purchaseOrders', '/purchase-orders')
        },
        setPOStatus: async (id, status) => {
          await api.post('/purchase-orders/' + id + '/status', { status })
          // receiving a PO auto-creates an expense → refresh expenses + dashboard
          await Promise.all([reload('purchaseOrders', '/purchase-orders'), reload('expenses', '/expenses'), reload('dashboard', '/dashboard')])
        },
        addPr: async (b) => {
          await api.post('/purchase-requests', b)
          await reload('prs', '/purchase-requests')
        },
        decidePr: async (id, status) => {
          await api.post('/purchase-requests/' + id + '/decision', { status })
          await reload('prs', '/purchase-requests')
        },
        addUser: async (b) => {
          await api.post('/users', b)
          // เพิ่มผู้ใช้แล้วระบบสร้างพนักงาน HR ให้ด้วย → รีเฟรชทั้งผู้ใช้/พนักงาน/รายชื่อลงเวลา
          await Promise.all([reload('users', '/users'), reload('employees', '/employees'), reload('kioskEmployees', '/kiosk/employees')])
        },
        updateUser: async (id, b) => {
          await api.put('/users/' + id, b)
          await reload('users', '/users')
        },
        changeMyPin: async (currentPin, newPin) => {
          await api.post('/me/change-pin', { currentPin, newPin })
        },
        resetUserPin: async (id, pin) => {
          await api.put('/users/' + id + '/pin', { pin })
        },
        addPosition: async (name) => {
          const list = await api.post<string[]>('/positions', { name })
          setData((d) => ({ ...d, positions: list }))
        },
        setSignature: async (userId, dataUrl) => {
          await api.put('/users/' + userId + '/signature', { signature: dataUrl })
          await reload('users', '/users')
          await reloadMe()
        },
        addCustomer: async (b) => {
          await api.post('/customers', b)
          await reload('customers', '/customers')
        },
        addContact: async (customerId, b) => {
          const contacts = await api.post<ApiContact[]>('/customers/' + customerId + '/contacts', b)
          return contacts
        },
        getCustomer: (id) => api.get<ApiCustomer & { contacts: ApiContact[] }>('/customers/' + id),
        addTask: async (b) => {
          await api.post('/tasks', b)
          await reload('tasks', '/tasks')
        },
        updateTask: async (id, b) => {
          await api.put('/tasks/' + id, b)
          await reload('tasks', '/tasks')
        },
        addSalesDoc: async (b) => {
          const doc = await api.post<ApiSalesDoc>('/sales-docs', b)
          await reload('salesDocs', '/sales-docs')
          return doc
        },
        deriveSalesDoc: async (id, to) => {
          const doc = await api.post<ApiSalesDoc>('/sales-docs/' + id + '/derive', { to })
          await reload('salesDocs', '/sales-docs')
          return doc
        },
        convertQuote: async (id, name) => {
          await api.post('/sales-docs/' + id + '/convert', { name })
          await Promise.all([reload('salesDocs', '/sales-docs'), reload('houses', '/houses'), reload('installments', '/installments'), reload('dashboard', '/dashboard')])
        },
        refreshNotifications: () => reload('notifications', '/notifications'),
        addLeave: async (b) => {
          await api.post('/leaves', b)
          await reload('leaves', '/leaves')
          await reload('notifications', '/notifications')
        },
        decideLeave: async (id, status) => {
          await api.post('/leaves/' + id + '/decision', { status })
          await Promise.all([reload('leaves', '/leaves'), reload('notifications', '/notifications'), reload('employees', '/employees')])
          if (data.payroll) await reloadPayroll()
        },
        addTimeAdj: async (b) => {
          await api.post('/time-adjustments', b)
          await reload('timeAdjustments', '/time-adjustments')
          await reload('notifications', '/notifications')
        },
        decideTimeAdj: async (id, status) => {
          await api.post('/time-adjustments/' + id + '/decision', { status })
          await Promise.all([reload('timeAdjustments', '/time-adjustments'), reload('notifications', '/notifications')])
        },
        collectInstallment: async (id, code, uncollect) => {
          await api.post('/installments/' + id + '/collect', { uncollect: !!uncollect })
          await Promise.all([
            reload('installments', '/installments'),
            reload('houses', '/houses'),
            reload('dashboard', '/dashboard'),
          ])
          void code
        },
        updateInstallment: async (id, b) => {
          await api.put('/installments/' + id, b)
          await Promise.all([reload('installments', '/installments'), reload('houses', '/houses'), reload('dashboard', '/dashboard')])
        },
        payInstallment: async (id, amount) => {
          await api.post('/installments/' + id + '/pay', { amount })
          await Promise.all([reload('installments', '/installments'), reload('houses', '/houses'), reload('dashboard', '/dashboard')])
        },
        deleteInstallment: async (id) => {
          await api.del('/installments/' + id)
          await Promise.all([reload('installments', '/installments'), reload('houses', '/houses'), reload('dashboard', '/dashboard')])
        },
        addOT: async (b) => {
          await api.post('/ot', b)
          await Promise.all([reload('ot', '/ot'), reload('notifications', '/notifications')])
        },
        addPayment: async (b) => {
          await api.post('/payments', b)
          await reload('payments', '/payments')
        },
        updateEmployee: async (id, b) => {
          await api.put('/employees/' + id, b)
          await reload('employees', '/employees')
          if (data.payroll) await reloadPayroll()
        },
        updateCustomer: async (id, b) => {
          await api.put('/customers/' + id, b)
          await reload('customers', '/customers')
        },
        addVendor: async (b) => {
          await api.post('/vendors', b)
          await reload('vendors', '/vendors')
        },
        updateVendor: async (id, b) => {
          await api.put('/vendors/' + id, b)
          await reload('vendors', '/vendors')
        },
        downloadBackup: () => api.download('/backup'),
        restoreBackup: async (data: string) => { await api.post('/restore', { data }) },
        viewPayrollPeriod: (period) => reloadPayroll(period),
        closePayroll: async (period) => {
          await api.post('/payroll/close', { period })
          await reloadPayroll(period)
        },
      }}
    >
      {children}
    </Ctx.Provider>
  )
}
