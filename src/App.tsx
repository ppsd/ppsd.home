import { useState, useEffect } from 'react'
import ForcePinChange from './components/ForcePinChange'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import Dashboard from './components/Dashboard'
import HouseList from './components/HouseList'
import HouseDetail from './components/HouseDetail'
import Modal from './components/Modal'
import Installments from './components/Installments'
import Procurement from './components/Procurement'
import HR from './components/HR'
import TimeKiosk from './components/TimeKiosk'
import PrintDoc from './components/PrintDoc'
import Issues from './components/Issues'
import Expenses from './components/Expenses'
import Users from './components/Users'
import Customers from './components/Customers'
import Reports from './components/Reports'
import Gantt from './components/Gantt'
import Sales from './components/Sales'
import AuditCenter from './components/AuditCenter'
import SiteDocs from './components/SiteDocs'
import WorkOrders from './components/WorkOrders'
import QcInspect from './components/QcInspect'
import SiteReports from './components/SiteReports'
import Safety from './components/Safety'
import Handover from './components/Handover'
import DocRegister from './components/DocRegister'
import ExpressExport from './components/ExpressExport'
import QcSummary from './components/QcSummary'
import CostFinance from './components/CostFinance'
import Pms from './components/Pms'
import CeoVoice from './components/CeoVoice'
import Login from './Login'
import { useApp } from './store'
import { titles, type ModalDef } from './data'
import type { DocKind } from './erpData'
import type { ApiPayroll } from './store'

type Page =
  | 'dashboard' | 'houses' | 'houseDetail' | 'installments' | 'procurement'
  | 'hr' | 'time' | 'issues' | 'expenses' | 'users'
  | 'customers' | 'gantt' | 'sales' | 'reports' | 'audit' | 'sitedocs' | 'qc' | 'sitereport' | 'costing' | 'pms' | 'workorders'
  | 'safety' | 'handover' | 'docreg' | 'express' | 'qcsummary' | 'ceovoice'

const NAV_TO_PAGE: Record<string, Page> = {
  dashboard: 'dashboard', houses: 'houses', installments: 'installments',
  procurement: 'procurement', hr: 'hr', time: 'time', issues: 'issues',
  expenses: 'expenses', users: 'users', customers: 'customers',
  gantt: 'gantt', sales: 'sales', reports: 'reports',
  sitedocs: 'sitedocs', qc: 'qc', sitereport: 'sitereport',
  costing: 'costing', audit: 'audit', pms: 'pms', workorders: 'workorders',
  safety: 'safety', handover: 'handover', docreg: 'docreg', express: 'express', qcsummary: 'qcsummary',
  ceovoice: 'ceovoice',
}

export default function App() {
  const app = useApp()
  const { user, data, loading } = app

  const [page, setPage] = useState<Page>('dashboard')
  const [selId, setSelId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [detailTab, setDetailTab] = useState('installments')
  const [modal, setModal] = useState<ModalDef | null>(null)
  const [printDoc, setPrintDoc] = useState<{ kind: DocKind; slip?: ApiPayroll } | null>(null)
  const [forcePin, setForcePin] = useState(false) // ถูกรีเซ็ต PIN → บังคับตั้งใหม่ก่อนใช้งาน
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
          hint: '“ขายบ้าน” = ใช้งวดลูกค้า-ช่าง + กำไร · “ควบคุมงาน (CM)” = คิดค่าบริการควบคุมงาน',
          options: [
            { value: 'sale', label: 'ขายบ้าน (รับสร้างบ้าน)' },
            { value: 'cm', label: 'ควบคุมงาน (CM) — รับบริหาร/ควบคุมงาน' },
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
        { label: 'สถานะ (เพิ่งเริ่ม/กำลังสร้าง/ส่งมอบแล้ว/after-service)', value: selHouse.status, ph: '' },
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

  const openAddIssue = () =>
    setModal({
      title: 'แจ้งปัญหาหน้างาน',
      sub: 'บันทึกปัญหาใหม่เข้าระบบ',
      fields: [
        { label: 'รหัสบ้าน (เช่น RK-014)', value: '', ph: 'RK-014' },
        { label: 'หัวข้อปัญหา', value: '', ph: 'เช่น น้ำรั่วซึม', required: true },
        { label: 'รายละเอียด', value: '', ph: '' },
        { label: 'ความเร่งด่วน (ด่วนมาก/ปานกลาง/ทั่วไป)', value: 'ทั่วไป', ph: '' },
      ],
      onSubmit: ([house_code, title, note, priority]) => app.addIssue({ house_code, title, note, priority }),
    })

  const openAddExpense = () =>
    setModal({
      title: 'เพิ่มรายจ่าย',
      sub: 'บันทึกรายจ่ายใหม่',
      fields: [
        { label: 'วันที่จ่าย (ตั้งล่วงหน้าได้)', value: new Date().toISOString().slice(0, 10), ph: '', type: 'date', required: true, hint: 'เลือกวันที่จ่ายจริง — ตั้งเป็นวันในอนาคตได้ (จะขึ้นป้าย “กำหนดจ่าย”)' },
        { label: 'รหัสบ้าน (เช่น RK-014)', value: '', ph: 'RK-014' },
        { label: 'รายการ', value: '', ph: 'เช่น ปูนซีเมนต์', required: true },
        { label: 'หมวด (วัสดุ/ค่าแรง/ขนส่ง/อื่นๆ)', value: 'วัสดุ', ph: '' },
        { label: 'ผู้ขาย/ผู้รับ', value: '', ph: '' },
        { label: 'จำนวนเงิน (บาท)', value: '', ph: '0', money: true },
      ],
      onSubmit: ([date, house_code, item, cat, vendor, amount]) =>
        app.addExpense({ date, house_code, item, cat, vendor, amount: Number(amount.replace(/,/g, '')) }),
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
          hint: 'ตำแหน่ง "ผู้จัดการ" = มีสิทธิ์อนุมัติ ลา/PR/OT/เวลา · เพิ่มตำแหน่งใหม่ได้ที่หน้าผู้ดูแล',
          options: [{ value: '', label: '— เลือกตำแหน่ง —' }, ...posList.map((p) => ({ value: p, label: p }))],
        },
      ],
      onSubmit: ([name, username, pin, role, position]) => app.addUser({ name, username, pin, role, position }),
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

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', background: '#F3F5F7', fontFamily: "'Kanit',sans-serif" }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
        <Topbar crumb={crumb} pageTitle={pageTitle} onNavigate={onNavigate} onOpenHouse={openHouse} onChangePin={openChangePin} />

        <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {page === 'dashboard' && <Dashboard onOpenHouse={openHouse} onOpenHouseByName={openHouseByName} onGoHouses={() => go('houses')} />}

          {page === 'houses' && (
            <HouseList search={search} statusFilter={statusFilter} onSearch={setSearch} onSetFilter={setStatusFilter} onOpenHouse={openHouse} onAddHouse={openAddHouse} />
          )}

          {page === 'houseDetail' && selHouse && (
            <HouseDetail house={selHouse} tab={detailTab} onSetTab={setDetailTab} onGoHouses={() => go('houses')} onEditHouse={openEditHouse} />
          )}

          {page === 'installments' && <Installments />}
          {page === 'procurement' && <Procurement />}
          {page === 'hr' && <HR onPrint={openPrint} />}
          {page === 'time' && <TimeKiosk />}
          {page === 'issues' && <Issues onAddIssue={openAddIssue} />}
          {page === 'expenses' && <Expenses onAddExpense={openAddExpense} />}
          {page === 'users' && <Users onAddUser={openAddUser} />}
          {page === 'customers' && <Customers />}
          {page === 'gantt' && <Gantt />}
          {page === 'sales' && <Sales />}
          {page === 'reports' && <Reports />}
          {page === 'audit' && <AuditCenter />}
          {page === 'workorders' && <WorkOrders />}
          {page === 'sitedocs' && <SiteDocs />}
          {page === 'qc' && <QcInspect />}
          {page === 'sitereport' && <SiteReports />}
          {page === 'safety' && <Safety />}
          {page === 'handover' && <Handover />}
          {page === 'docreg' && <DocRegister />}
          {page === 'express' && <ExpressExport />}
          {page === 'qcsummary' && <QcSummary onOpenKpi={() => go('pms')} />}
          {page === 'costing' && <CostFinance />}
          {page === 'pms' && <Pms />}
          {page === 'ceovoice' && <CeoVoice />}
        </main>
      </div>

      {modal && <Modal modal={modal} onClose={() => setModal(null)} />}
      {printDoc && <PrintDoc kind={printDoc.kind} slip={printDoc.slip} onClose={() => setPrintDoc(null)} />}
    </div>
  )
}
