import { useState, useEffect } from 'react'
import ForcePinChange from './components/auth/ForcePinChange'
import Sidebar from './components/shared/Sidebar'
import Topbar from './components/shared/Topbar'
import Dashboard from './components/dashboard/Dashboard'
import HouseList from './components/houses/HouseList'
import HouseDetail from './components/houses/HouseDetail'
import Modal from './components/shared/Modal'
import { KeepAlive, ModalHostContext, ModalOwnerContext, useModalOwnerPages } from './components/shared/ModalShell'
import Installments from './components/houses/Installments'
import Procurement from './components/procurement/Procurement'
import MaterialPrices from './components/materials/MaterialPrices'
import Stock from './components/materials/Stock'
import HR from './components/hr/HR'
import TimeKiosk from './components/hr/TimeKiosk'
import PrintDoc from './components/shared/PrintDoc'
import Issues from './components/site/Issues'
import Expenses from './components/accounting/Expenses'
import Users from './components/admin/Users'
import Crm from './components/sales/Crm'
import Reports from './components/dashboard/Reports'
import Gantt from './components/dashboard/Gantt'
import Sales from './components/sales/Sales'
import AuditCenter from './components/admin/AuditCenter'
import SiteDocs from './components/site/SiteDocs'
import WorkOrders from './components/site/WorkOrders'
import QcInspect from './components/site/QcInspect'
import SiteReports from './components/site/SiteReports'
import Safety from './components/site/Safety'
import Handover from './components/houses/Handover'
import DocRegister from './components/accounting/DocRegister'
import ExpressExport from './components/accounting/ExpressExport'
import QcSummary from './components/dashboard/QcSummary'
import CostFinance from './components/cost/CostFinance'
import Accounting from './components/accounting/Accounting'
import Pms from './components/hr/Pms'
import Vault from './components/admin/Vault'
import CeoVoice from './components/dashboard/CeoVoice'
import Login from './Login'
import { useApp } from './store'
import { titles, OFFICE_CATS, HOUSE_STATUSES, type ModalDef } from './data'
import type { DocKind } from './erpData'
import type { ApiPayroll } from './store'

type Page =
  | 'dashboard' | 'houses' | 'houseDetail' | 'installments' | 'procurement' | 'matprices'
  | 'hr' | 'time' | 'issues' | 'expenses' | 'users' | 'stock'
  | 'customers' | 'gantt' | 'sales' | 'reports' | 'audit' | 'sitedocs' | 'qc' | 'sitereport' | 'costing' | 'pms' | 'workorders'
  | 'safety' | 'handover' | 'docreg' | 'express' | 'qcsummary' | 'ceovoice' | 'accounting' | 'vault'

const NAV_TO_PAGE: Record<string, Page> = {
  dashboard: 'dashboard', houses: 'houses', installments: 'installments',
  procurement: 'procurement', matprices: 'matprices', stock: 'stock', hr: 'hr', time: 'time', issues: 'issues',
  expenses: 'expenses', users: 'users', customers: 'customers',
  gantt: 'gantt', sales: 'sales', reports: 'reports',
  sitedocs: 'sitedocs', qc: 'qc', sitereport: 'sitereport',
  costing: 'costing', audit: 'audit', pms: 'pms', workorders: 'workorders',
  safety: 'safety', handover: 'handover', docreg: 'docreg', express: 'express', qcsummary: 'qcsummary',
  ceovoice: 'ceovoice', accounting: 'accounting', vault: 'vault',
}

export default function App() {
  const app = useApp()
  const { user, data, loading, loadingMore } = app

  const [page, setPage] = useState<Page>('houses') // house-first: เปิดมาเจอรายการบ้านก่อน
  const [selId, setSelId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [detailTab, setDetailTab] = useState('installments')
  // modal ของ App เปิดซ้อน/ย่อค้างไว้ได้หลายอัน (เปิดอันใหม่ ไม่ทับอันที่ย่อไว้)
  const [modals, setModals] = useState<{ key: number; def: ModalDef }[]>([])
  const setModal = (def: ModalDef) => setModals((ms) => [...ms, { key: Date.now() + Math.random(), def }])
  const ownerPages = useModalOwnerPages()
  const [printDoc, setPrintDoc] = useState<{ kind: DocKind; slip?: ApiPayroll } | null>(null)
  const [forcePin, setForcePin] = useState(false) // ถูกรีเซ็ต PIN → บังคับตั้งใหม่ก่อนใช้งาน
  // จอคอม: ย่อเมนูซ้ายเหลือแถบไอคอน — จำค่าไว้ในเบราว์เซอร์นี้
  const [sbCollapsed, setSbCollapsed] = useState(() => { try { return localStorage.getItem('ppsd_sb_collapsed') === '1' } catch { return false } })
  const toggleSb = () => setSbCollapsed((v) => { const n = !v; try { localStorage.setItem('ppsd_sb_collapsed', n ? '1' : '0') } catch { /* ignore */ } return n })
  const [navOpen, setNavOpen] = useState(false) // จอแคบ (< 1024px): เมนูซ้ายซ่อนไว้ กด ☰ แล้วเลื่อนออกมา
  useEffect(() => { setForcePin(!!user?.mustChangePin) }, [user?.mustChangePin])
  const openPrint = (kind: DocKind, data?: unknown) =>
    setPrintDoc({ kind, slip: kind === 'slip' ? (data as ApiPayroll) : undefined })

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F5F7', fontFamily: "'Kanit',sans-serif", color: '#5C6770', fontSize: 14 }}>
        กำลังโหลดข้อมูล…
      </div>
    )
  }
  if (!user) return <Login />
  // แถบบางๆ บนสุดระหว่างโหลดข้อมูลส่วนที่เหลือ (เฟส 2) — หน้าใช้งานได้แล้ว
  const moreBar = loadingMore ? <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999, height: 3, background: 'linear-gradient(90deg,#30506A,#5DBB86,#30506A)', backgroundSize: '200% 100%', animation: 'ppsdbar 1.2s linear infinite' }} title="กำลังโหลดข้อมูลส่วนที่เหลือ…"><style>{'@keyframes ppsdbar{0%{background-position:0 0}100%{background-position:200% 0}}'}</style></div> : null
  if (forcePin) return <ForcePinChange userName={user.name} onDone={() => setForcePin(false)} />

  const go = (p: Page) => setPage(p)
  const openHouse = (id: number) => {
    setSelId(id)
    setDetailTab('installments')
    setPage('houseDetail')
  }
  const openHouseByName = (name: string) => {
    const h = data.houses.find((x) => x.name === name)
    if (h) openHouse(h.id)
  }
  const onNavigate = (id: string) => go(NAV_TO_PAGE[id] || 'dashboard')

  const selHouse = data.houses.find((h) => h.id === selId) || data.houses[0]

  const activePage = page === 'houseDetail' ? 'houses' : page

  let crumb = ''
  let pageTitle = ''
  if (page === 'houseDetail' && selHouse) {
    crumb = 'บ้าน / รายละเอียด'
    pageTitle = selHouse.name
  } else {
    ;[crumb, pageTitle] = titles[page]
  }

  // ---- modal openers wired to real API mutations ----
  const openAddHouse = () =>
    setModal({
      title: 'เพิ่มบ้าน / โครงการใหม่',
      sub: 'กรอกข้อมูลบ้านและสัญญา',
      fields: [
        { label: 'ชื่อบ้าน / โครงการ', value: '', ph: 'เช่น บ้านพฤกษาวิลล์ 2', required: true },
        {
          label: 'ประเภทโครงการ',
          value: 'sale',
          ph: '',
          hint: '“ขายบ้าน” = ใช้งวดลูกค้า-ช่าง + กำไร · “ควบคุมงาน (CM)” = คิดค่าบริการควบคุมงาน · “ออฟฟิศ” = แยกของที่ซื้อเข้าออฟฟิศ (หมวด น้ำมัน/ซ่อมแซม/ของใช้/อื่นๆ)',
          options: [
            { value: 'sale', label: 'ขายบ้าน (รับสร้างบ้าน)' },
            { value: 'cm', label: 'ควบคุมงาน (CM) — รับบริหาร/ควบคุมงาน' },
            { value: 'office', label: 'ออฟฟิศ / ค่าใช้จ่ายภายใน' },
          ],
        },
        { label: 'โครงการ', value: '', ph: 'เลือกโครงการ' },
        { label: 'ชื่อลูกค้า / ผู้ว่าจ้าง', value: '', ph: 'คุณ...' },
        { label: 'มูลค่าตัวบ้าน — ขายลูกค้า (บาท) [เฉพาะขายบ้าน]', value: '', ph: 'เช่น 3,000,000', money: true },
        { label: 'มูลค่าตัวบ้าน — จ่ายช่าง (บาท) [เฉพาะขายบ้าน]', value: '', ph: 'เช่น 2,500,000', money: true, hint: 'โรงจอดรถ / ถนน-รั้ว เพิ่มได้ภายหลังที่ปุ่มแก้ไขข้อมูล' },
        { label: 'ค่าบริการควบคุมงาน (บาท) [เฉพาะ CM]', value: '', ph: 'เช่น 500,000', money: true },
      ],
      onSubmit: ([name, kind, project, customer, house_customer, house_contractor, service_fee]) => {
        const num = (s: string) => Number(String(s).replace(/,/g, '')) || 0
        return app.addHouse({ name, kind, project, customer, house_customer: num(house_customer), house_contractor: num(house_contractor), service_fee: num(service_fee) })
      },
    })

  const openEditHouse = () =>
    selHouse &&
    setModal({
      title: 'แก้ไขข้อมูลบ้าน / โครงการ',
      sub: selHouse.name,
      fields: [
        { label: 'ชื่อบ้าน / โครงการ', value: selHouse.name, ph: '', required: true },
        {
          label: 'ประเภทโครงการ',
          value: selHouse.kind || 'sale',
          ph: '',
          options: [
            { value: 'sale', label: 'ขายบ้าน (รับสร้างบ้าน)' },
            { value: 'cm', label: 'ควบคุมงาน (CM)' },
            { value: 'office', label: 'ออฟฟิศ / ค่าใช้จ่ายภายใน' },
          ],
        },
        { label: 'ชื่อลูกค้า / ผู้ว่าจ้าง', value: selHouse.customer, ph: '' },
        { label: 'ค่าบริการควบคุมงาน (บาท) [เฉพาะ CM]', value: String(selHouse.service_fee || ''), ph: 'เช่น 500,000', money: true },
        { label: '— ตัวบ้าน — มูลค่าขายลูกค้า (บาท)', value: String(selHouse.house_customer || ''), ph: 'เช่น 3,000,000', money: true },
        { label: 'ตัวบ้าน: มูลค่าจ่ายช่าง (บาท)', value: String(selHouse.house_contractor || ''), ph: 'เช่น 2,500,000', money: true },
        { label: '— โรงจอดรถ — มูลค่าขายลูกค้า (บาท)', value: String(selHouse.carport_customer || ''), ph: '0', money: true },
        { label: 'โรงจอดรถ: มูลค่าจ่ายช่าง (บาท)', value: String(selHouse.carport_contractor || ''), ph: '0', money: true },
        { label: '— ถนน/รั้ว — มูลค่าขายลูกค้า (บาท)', value: String(selHouse.road_customer || ''), ph: '0', money: true },
        { label: 'ถนน/รั้ว: มูลค่าจ่ายช่าง (บาท)', value: String(selHouse.road_contractor || ''), ph: '0', money: true },
        { label: 'พื้นที่ใช้สอย (ข้อความ)', value: selHouse.area || '', ph: 'เช่น 180 ตร.ม.' },
        { label: 'ที่ตั้งโครงการ', value: selHouse.site_location || '', ph: 'เช่น ถนน... ต... อ... จ...' },
        { label: 'เลขที่สัญญา', value: selHouse.contract_no || '', ph: 'เช่น ARR 01/2568' },
        { label: 'เจ้าของโครงการ / ผู้ว่าจ้าง', value: selHouse.owner || '', ph: '' },
        { label: 'ผู้ควบคุมงาน', value: selHouse.supervisor || '', ph: '' },
        { label: 'วิศวกรโครงการ', value: selHouse.engineer || '', ph: '' },
        { label: 'ขอบเขตงาน (Scope)', value: selHouse.scope || '', ph: '' },
        { label: 'สถานะ', value: String(selHouse.status || '').trim(), ph: '', options: [...(HOUSE_STATUSES.some((s) => s.id === String(selHouse.status || '').trim()) ? [] : [{ value: String(selHouse.status || '').trim(), label: selHouse.status || '— ไม่ระบุ —' }]), ...HOUSE_STATUSES.map((s) => ({ value: s.id, label: s.label }))] },
        { label: 'แบบบ้าน', value: selHouse.design || '', ph: 'เช่น PD-2 ชั้น 4 ห้องนอน' },
        { label: 'เริ่มก่อสร้าง', value: selHouse.start_date || '', ph: '' },
        { label: 'กำหนดส่งมอบ', value: selHouse.deliver_date || '', ph: '' },
        { label: 'ผู้จัดการโครงการ', value: selHouse.manager || '', ph: '' },
      ],
      onSubmit: ([name, kind, customer, service_fee, house_customer, house_contractor, carport_customer, carport_contractor, road_customer, road_contractor, area, site_location, contract_no, owner, supervisor, engineer, scope, status, design, start_date, deliver_date, manager]) => {
        const num = (s: string) => Number(String(s).replace(/,/g, '')) || 0
        return app.updateHouse(selHouse.id, {
          name, kind, customer, area, status, design, start_date, deliver_date, manager,
          service_fee: num(service_fee), site_location, contract_no, owner, supervisor, engineer, scope,
          house_customer: num(house_customer), house_contractor: num(house_contractor),
          carport_customer: num(carport_customer), carport_contractor: num(carport_contractor),
          road_customer: num(road_customer), road_contractor: num(road_contractor),
        })
      },
    })

  // ตัวเลือกบ้านจากรายชื่อจริง (ค่าที่บันทึก = รหัสบ้าน) — กันพิมพ์รหัสผิดแล้วรายการไม่เข้าบ้าน
  const houseOptions = () => [{ value: '', label: '— ไม่ระบุบ้าน —' }, ...data.houses.map((h) => ({ value: h.code, label: `${h.name} (${h.code})` }))]

  const openAddIssue = () =>
    setModal({
      title: 'แจ้งปัญหาหน้างาน',
      sub: 'บันทึกปัญหาใหม่เข้าระบบ',
      fields: [
        { label: 'บ้าน', value: '', ph: '', options: houseOptions() },
        { label: 'หัวข้อปัญหา', value: '', ph: 'เช่น น้ำรั่วซึม', required: true },
        { label: 'รายละเอียด', value: '', ph: '' },
        { label: 'ความเร่งด่วน', value: 'ทั่วไป', ph: '', options: ['ทั่วไป', 'ปานกลาง', 'ด่วนมาก'].map((p) => ({ value: p, label: p })) },
      ],
      onSubmit: ([house_code, title, note, priority]) => app.addIssue({ house_code, title, note, priority }),
    })

  const openAddExpense = () =>
    setModal({
      title: 'เพิ่มรายจ่าย',
      sub: 'บันทึกรายจ่ายใหม่',
      fields: [
        { label: 'วันที่จ่าย (ย้อนหลัง/ล่วงหน้าได้)', value: new Date().toISOString().slice(0, 10), ph: '', type: 'date', required: true, hint: 'เลือกวันที่จ่ายจริง — เลือกวันย้อนหลังได้ (บันทึกรายจ่ายเก่า) หรือวันในอนาคต (จะขึ้นป้าย “กำหนดจ่าย”)' },
        { label: 'บ้าน', value: '', ph: '', options: houseOptions() },
        { label: 'รายการ', value: '', ph: 'เช่น ปูนซีเมนต์', required: true },
        {
          label: 'หมวด', value: 'วัสดุ', ph: '',
          // ค่าที่บันทึก = ชื่อหมวดตรงตัว (หมวดออฟฟิศต้องตรงกับ OFFICE_CATS ที่หน้ารายละเอียดบ้านใช้สรุป)
          options: [
            ...['วัสดุ', 'ค่าแรง', 'ขนส่ง', 'อื่นๆ'].map((c) => ({ value: c, label: c })),
            ...OFFICE_CATS.filter((c) => c.label !== 'อื่นๆ').map((c) => ({ value: c.label, label: `ออฟฟิศ · ${c.label}` })),
          ],
        },
        { label: 'ผู้ขาย/ผู้รับ', value: '', ph: '' },
        { label: 'จำนวนเงิน (บาท)', value: '', ph: '0', money: true },
        { label: 'เลขที่ใบกำกับภาษี (ถ้ามี VAT)', value: '', ph: 'เว้นว่าง = ไม่มี VAT', hint: 'กรอกเมื่อร้านออกใบกำกับภาษี — ยอด VAT จะถูกคิด 7/107 จากยอดรวม (ใช้ทำ ภ.พ.30)' },
        { label: 'ยอด VAT ตามใบ (บาท)', value: '', ph: 'เว้นว่าง = คำนวณ 7/107 ให้', money: true },
      ],
      onSubmit: ([date, house_code, item, cat, vendor, amount, taxInvNo, vatAmt]) => {
        const total = Number(amount.replace(/,/g, '')) || 0
        const hasVat = !!taxInvNo.trim() || !!vatAmt.trim()
        const vat = hasVat ? (Number(vatAmt.replace(/,/g, '')) || Math.round((total * 7 / 107) * 100) / 100) : 0
        return app.addExpense({ date, house_code, item, cat, vendor, amount: total, vat_amount: vat, tax_invoice_no: taxInvNo.trim() })
      },
    })

  const openAddUser = () => {
    const posList = app.data.positions.length ? app.data.positions : ['ผู้จัดการ']
    setModal({
      title: 'เพิ่มผู้ใช้',
      sub: 'สร้างบัญชี + สร้างพนักงานใน HR ให้อัตโนมัติ (กรอกรอบเดียว)',
      fields: [
        { label: 'ชื่อ-สกุล', value: '', ph: '', required: true, hint: 'ระบบจะสร้างพนักงานใน HR ชื่อนี้ให้อัตโนมัติ · วันลา/เงินเดือนไปเติมที่เมนู บุคลากร/HR ทีหลัง' },
        { label: 'ชื่อผู้ใช้ (ไว้ล็อกอิน)', value: '', ph: 'username', required: true },
        { label: 'PIN เริ่มต้น (4 หลัก)', value: '', ph: '0000', required: true, hint: 'ใช้ทั้งล็อกอินระบบ และลงเวลา (kiosk) · เปลี่ยนภายหลังได้ด้วยปุ่มรูปกุญแจ' },
        {
          label: 'บทบาท (สิทธิ์การใช้งาน)',
          value: 'viewer',
          ph: '',
          hint: 'คุมว่าผู้ใช้คนนี้ "เห็น/แก้" อะไรได้บ้าง',
          options: [
            { value: 'admin', label: 'ผู้ดูแลระบบ — เห็น/แก้ได้ทุกอย่าง รวมเงินเดือน' },
            { value: 'accounting', label: 'บัญชี/การเงิน — งานเงิน จัดซื้อ-จ่าย เงินเดือน' },
            { value: 'site', label: 'หน้างาน — บ้าน งวดงาน ปัญหา (ไม่เห็นเงินเดือน)' },
            { value: 'viewer', label: 'ดูอย่างเดียว — เปิดดูได้ แก้ไขไม่ได้' },
          ],
        },
        {
          label: 'ตำแหน่งงาน',
          value: '',
          ph: '',
          hint: 'ตำแหน่ง "ผู้จัดการ/CEO" = มีสิทธิ์อนุมัติ ลา/PR/OT/เวลา · เพิ่มตำแหน่งใหม่ได้ที่หน้าผู้ดูแล',
          options: [{ value: '', label: '— เลือกตำแหน่ง —' }, ...posList.map((p) => ({ value: p, label: p }))],
        },
        {
          label: 'ผูกกับพนักงานที่มีอยู่ใน HR',
          value: '',
          ph: '',
          hint: 'ถ้าเพิ่มชื่อไว้ในทะเบียนพนักงานแล้ว ให้เลือกคนนั้น — ระบบจะใช้ชื่อ/ลายเซ็น/ลงเวลาเดิม ไม่สร้างซ้ำ (ไม่เลือก = จับชื่อให้อัตโนมัติ)',
          options: [{ value: '', label: '— จับคู่ชื่อให้อัตโนมัติ —' }, ...app.data.employees.filter((e) => !e.user_id).map((e) => ({ value: e.code, label: `${e.code} · ${e.name}${e.nickname ? ` (${e.nickname})` : ''}` }))],
        },
      ],
      onSubmit: ([name, username, pin, role, position, employee_code]) => app.addUser({ name, username, pin, role, position, employee_code }),
    })
  }

  const openChangePin = () =>
    setModal({
      title: 'เปลี่ยน PIN ของฉัน',
      sub: app.user?.name || '',
      fields: [
        { label: 'PIN ปัจจุบัน', value: '', ph: '••••' },
        { label: 'PIN ใหม่ (ตัวเลข 4 หลัก)', value: '', ph: '••••' },
        { label: 'ยืนยัน PIN ใหม่', value: '', ph: '••••' },
      ],
      onSubmit: async ([current, next, confirm]) => {
        if (!/^\d{4}$/.test(next)) throw new Error('PIN ใหม่ต้องเป็นตัวเลข 4 หลัก')
        if (next !== confirm) throw new Error('PIN ใหม่ทั้งสองช่องไม่ตรงกัน')
        await app.changeMyPin(current, next)
      },
    })

  // ---- หน้าที่แสดง + หน้าที่เก็บไว้เบื้องหลังเพราะมี modal ค้าง (เปลี่ยนหน้าแล้ว modal ไม่หาย) ----
  // รายละเอียดบ้านแยกตามหลัง (houseDetail:<id>) — modal ของบ้านหลังหนึ่งไม่ไปโผล่ในอีกหลัง
  const pageKey = page === 'houseDetail' ? `houseDetail:${selHouse?.id ?? ''}` : page
  const alivePages = [pageKey, ...ownerPages.filter((k) => k !== pageKey)]
  const modalHost = {
    active: pageKey,
    goTo: (key: string) => {
      if (key.startsWith('houseDetail:')) { setSelId(Number(key.slice(12))); setPage('houseDetail') }
      else setPage(key as Page)
    },
  }
  const renderPage = (key: string) => {
    if (key.startsWith('houseDetail:')) {
      const h = data.houses.find((x) => x.id === Number(key.slice(12)))
      return h ? <HouseDetail house={h} tab={detailTab} onSetTab={setDetailTab} onGoHouses={() => go('houses')} onEditHouse={openEditHouse} /> : null
    }
    switch (key as Page) {
      case 'dashboard': return <Dashboard onOpenHouse={openHouse} onOpenHouseByName={openHouseByName} onGoHouses={() => go('houses')} />
      case 'houses': return <HouseList search={search} statusFilter={statusFilter} onSearch={setSearch} onSetFilter={setStatusFilter} onOpenHouse={openHouse} onAddHouse={openAddHouse} />
      case 'installments': return <Installments />
      case 'procurement': return <Procurement />
      case 'matprices': return <MaterialPrices />
      case 'stock': return <Stock />
      case 'hr': return <HR onPrint={openPrint} />
      case 'time': return <TimeKiosk />
      case 'issues': return <Issues onAddIssue={openAddIssue} />
      case 'expenses': return <Expenses onAddExpense={openAddExpense} />
      case 'users': return <Users onAddUser={openAddUser} />
      case 'customers': return <Crm />
      case 'gantt': return <Gantt />
      case 'sales': return <Sales />
      case 'reports': return <Reports />
      case 'vault': return <Vault />
      case 'audit': return <AuditCenter />
      case 'workorders': return <WorkOrders />
      case 'sitedocs': return <SiteDocs />
      case 'qc': return <QcInspect />
      case 'sitereport': return <SiteReports />
      case 'safety': return <Safety />
      case 'handover': return <Handover />
      case 'docreg': return <DocRegister />
      case 'express': return <ExpressExport />
      case 'qcsummary': return <QcSummary onOpenKpi={() => go('pms')} />
      case 'costing': return <CostFinance />
      case 'accounting': return <Accounting />
      case 'pms': return <Pms />
      case 'ceovoice': return <CeoVoice />
      default: return null
    }
  }

  return (
    <>{moreBar}<div className={'app-shell' + (navOpen ? ' nav-open' : '')} style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', background: '#F3F5F7', fontFamily: "'Kanit',sans-serif" }}>
      <Sidebar activePage={activePage} onNavigate={(id) => { setNavOpen(false); onNavigate(id) }} onClose={() => setNavOpen(false)} collapsed={sbCollapsed} onToggleCollapse={toggleSb} />
      <div className="nav-backdrop" onClick={() => setNavOpen(false)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
        <Topbar crumb={crumb} pageTitle={pageTitle} onNavigate={onNavigate} onOpenHouse={openHouse} onChangePin={openChangePin} onMenu={() => setNavOpen(true)} />

        <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          <ModalHostContext.Provider value={modalHost}>
            {alivePages.map((key) => (
              <ModalOwnerContext.Provider key={key} value={key}>
                <KeepAlive active={key === pageKey} onShow={() => modalHost.goTo(key)}>{renderPage(key)}</KeepAlive>
              </ModalOwnerContext.Provider>
            ))}
          </ModalHostContext.Provider>
        </main>
      </div>

      <ModalHostContext.Provider value={modalHost}>
        {modals.map((m) => <Modal key={m.key} modal={m.def} onClose={() => setModals((ms) => ms.filter((x) => x.key !== m.key))} />)}
      </ModalHostContext.Provider>
      {printDoc && <PrintDoc kind={printDoc.kind} slip={printDoc.slip} onClose={() => setPrintDoc(null)} />}
    </div></>
  )
}
