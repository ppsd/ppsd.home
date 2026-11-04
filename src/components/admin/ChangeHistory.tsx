import { useEffect, useState } from 'react'
import { api } from '../../api'

// แท็บ "ประวัติการแก้ไขข้อมูล" (เมนู ตรวจสอบ) — ทุกการเพิ่ม/แก้/ลบ ในทุกตาราง บันทึกอัตโนมัติ (server/history.js)
// แสดง: เวลา · ใครทำ · เรื่อง · รายการ · เพิ่ม/แก้/ลบ · ค่าที่เปลี่ยน (เดิม → ใหม่)

interface Row { id: number; ts: string; user: string; table_name: string; row_key: string; action: 'insert' | 'update' | 'delete'; before: string | null; after: string | null }
interface Meta { tables: { t: string; n: number }[]; users: { u: string; n: number }[]; since: string | null }

// ชื่อเรื่อง (ตาราง) เป็นภาษาไทย
export const TABLE_LABEL: Record<string, string> = {
  houses: 'บ้าน', installments: 'งวดงาน', house_contracts: 'สัญญาบ้าน', house_money_log: 'รายการเงินบ้าน', house_categories: 'หมวดงวดงาน',
  contractors: 'ช่าง/ผู้รับเหมา (ในบ้าน)', contractor_advances: 'ค่าของออกให้ช่าง', contractor_evals: 'ประเมินผู้รับเหมา', inst_acceptance: 'ตรวจรับงวด',
  issues: 'ปัญหา', tasks: 'แผนงาน', work_orders: 'ใบสั่งงาน', qc_inspections: 'QC ตรวจงาน', site_docs: 'RFI/RFA/NCR/VO', site_reports: 'รายงานหน้างาน',
  safety_records: 'ความปลอดภัย', handover_docs: 'ส่งมอบงาน', doc_register: 'ทะเบียนเอกสาร', files: 'ไฟล์', boqs: 'BOQ', cashflows: 'กระแสเงินสด',
  purchase_requests: 'ใบขอซื้อ (PR)', pr_quotes: 'ใบเสนอราคา', purchase_orders: 'ใบสั่งซื้อ (PO)', goods_receipts: 'ตรวจรับของ', payments: 'ใบจ่ายเงิน',
  expenses: 'รายจ่าย', vendors: 'ผู้ขาย/ร้านค้า', stock_items: 'สต๊อก', stock_moves: 'เคลื่อนไหวสต๊อก', material_prices: 'ราคากลางวัสดุ',
  material_aliases: 'ชื่อเรียกวัสดุ', labor_rates: 'ราคากลางค่าแรง', fuel_requests: 'เบิกค่าน้ำมัน', ledger: 'เงินสดย่อย/สมุดเงิน', petty_expenses: 'เงินสดย่อย',
  journal_entries: 'รายการบัญชี', journal_lines: 'บรรทัดบัญชี', accounts: 'ผังบัญชี', fixed_assets: 'สินทรัพย์', doc_approvals: 'การอนุมัติเอกสาร', flag_acks: 'เคลียร์สัญญาณเตือน',
  customers: 'ลูกค้า', customer_contacts: 'ติดต่อลูกค้า', leads: 'ลูกค้าเป้าหมาย', sales_docs: 'เอกสารขาย', nps: 'ความพึงพอใจลูกค้า',
  employees: 'พนักงาน', attendance: 'ลงเวลา', leaves: 'ใบลา', time_adjustments: 'ขอแก้เวลา', ot: 'OT', payroll_runs: 'เงินเดือน (ปิดงวด)',
  payroll_batches: 'รอบจ่ายเงินเดือน', payroll_inputs: 'วันทำงาน (เงินเดือน)', salary_advances: 'เบิกล่วงหน้า', deductions: 'รายการหัก', other_income: 'รายได้อื่น',
  pms_reviews: 'ประเมิน KPI', pms_kpi_sets: 'ชุด KPI', pms_position_sets: 'KPI ตามตำแหน่ง', positions: 'ตำแหน่งงาน', holidays: 'วันหยุด',
  users: 'ผู้ใช้งาน', settings: 'ตั้งค่าระบบ', vault_entries: 'คลังรหัสผ่าน', pin_reset_requests: 'ขอรีเซ็ต PIN', doc_templates: 'แม่แบบตรวจเอกสาร', doc_reviews: 'ตรวจเอกสาร (AI)',
}
// ชื่อช่องที่พบบ่อย
const COL_LABEL: Record<string, string> = {
  name: 'ชื่อ', code: 'รหัส', no: 'เลขที่', title: 'หัวข้อ', item: 'รายการ', items: 'รายการสินค้า', detail: 'รายละเอียด', note: 'หมายเหตุ', status: 'สถานะ',
  amount: 'ยอดเงิน', paid: 'จ่าย/เก็บแล้ว', value: 'มูลค่า', total: 'รวม', price: 'ราคา', qty: 'จำนวน', unit: 'หน่วย', date: 'วันที่', date_iso: 'วันที่',
  due: 'ครบกำหนด', due_iso: 'ครบกำหนด', house_code: 'บ้าน', house: 'บ้าน', customer: 'ลูกค้า', vendor: 'ผู้ขาย', payee: 'ผู้รับเงิน', party: 'คู่สัญญา',
  contractor: 'ช่าง', by: 'ผู้บันทึก', role: 'บทบาท/งาน', type: 'ประเภท', kind: 'ชนิด', category: 'หมวด', side: 'ฝั่ง', method: 'วิธีจ่าย', ref_no: 'เลขที่อ้างอิง',
  phone: 'โทร', address: 'ที่อยู่', email: 'อีเมล', base: 'เงินเดือน', position: 'ตำแหน่ง', dept: 'แผนก', start: 'เริ่มงาน', approver: 'ผู้อนุมัติ',
  approved_date: 'วันที่อนุมัติ', created: 'สร้างเมื่อ', priority: 'ความสำคัญ', progress: 'ความคืบหน้า', pct: 'ความคืบหน้า %', remain: 'คงเหลือ', collected: 'เก็บแล้ว',
  contract_no: 'เลขที่สัญญา', sign_date: 'วันที่เซ็น', gross: 'ยอดก่อนหัก', net: 'ยอดสุทธิ', wht: 'หัก ณ ที่จ่าย', check_in: 'เข้างาน', check_out: 'ออกงาน',
  start_date: 'วันเริ่ม', end_date: 'วันสิ้นสุด', days: 'จำนวนวัน', reason: 'เหตุผล', executor: 'ผู้ทำงาน', scope: 'ขอบเขตงาน',
}
const ACTION: Record<Row['action'], { t: string; c: string; bg: string }> = {
  insert: { t: 'เพิ่ม', c: '#2E7D55', bg: '#E2F1EA' }, update: { t: 'แก้ไข', c: '#30506A', bg: '#E2E9EF' }, delete: { t: 'ลบ', c: '#C24036', bg: '#FBEEEC' },
}
const LABEL_KEYS = ['no', 'code', 'name', 'title', 'item', 'detail', 'emp_name', 'party', 'payee', 'vendor', 'label', 'key']

const parse = (s: string | null): Record<string, unknown> | null => { if (!s) return null; try { return JSON.parse(s) } catch { return null } }
const show = (v: unknown) => {
  if (v === null || v === undefined || v === '') return '—'
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > 140 ? s.slice(0, 140) + '…' : s
}
const fmtTs = (ts: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(ts || '')
  const M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  return m ? `${Number(m[3])} ${M[Number(m[2]) - 1]} ${Number(m[1]) + 543} ${m[4]}:${m[5]}` : ts
}

const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 12.5, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '6px 9px', outline: 'none' }
const th: React.CSSProperties = { padding: '8px 12px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'left', background: '#F7F9FB', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '9px 12px', fontSize: 12.5, borderTop: '1px solid #F1F4F6', verticalAlign: 'top' }

function Changes({ r }: { r: Row }) {
  const b = parse(r.before), a = parse(r.after)
  const keys = r.action === 'update'
    ? Object.keys({ ...b, ...a }).filter((k) => JSON.stringify(b?.[k] ?? null) !== JSON.stringify(a?.[k] ?? null))
    : Object.keys((a || b) || {}).filter((k) => k !== 'id' && ((a || b)?.[k] ?? '') !== '')
  if (!keys.length) return <span style={{ color: '#94A0A8' }}>—</span>
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      {keys.slice(0, r.action === 'update' ? 30 : 8).map((k) => (
        <div key={k} style={{ fontSize: 12, lineHeight: 1.45, wordBreak: 'break-word' }}>
          <span style={{ color: '#5C6770' }}>{COL_LABEL[k] || k}:</span>{' '}
          {r.action === 'update'
            ? <><span style={{ color: '#C24036', textDecoration: 'line-through' }}>{show(b?.[k])}</span> → <span style={{ color: '#2E7D55', fontWeight: 600 }}>{show(a?.[k])}</span></>
            : <span>{show((a || b)?.[k])}</span>}
        </div>
      ))}
      {r.action !== 'update' && keys.length > 8 && <div style={{ fontSize: 11, color: '#94A0A8' }}>…และอีก {keys.length - 8} ช่อง</div>}
    </div>
  )
}

export default function ChangeHistory() {
  const [rows, setRows] = useState<Row[]>([])
  const [meta, setMeta] = useState<Meta | null>(null)
  const [table, setTable] = useState('')
  const [who, setWho] = useState('')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [more, setMore] = useState(false)
  const [err, setErr] = useState('')

  const query = (beforeId?: number) => {
    const p = new URLSearchParams()
    if (table) p.set('table', table)
    if (who) p.set('user', who)
    if (action) p.set('action', action)
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (q.trim()) p.set('q', q.trim())
    if (beforeId) p.set('before_id', String(beforeId))
    p.set('limit', '200')
    return '/change-history?' + p.toString()
  }
  const load = async (append = false) => {
    setBusy(true); setErr('')
    try {
      const r = await api.get<Row[]>(query(append ? rows[rows.length - 1]?.id : undefined))
      setRows(append ? [...rows, ...r] : r)
      setMore(r.length === 200)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  useEffect(() => { api.get<Meta>('/change-history/meta').then(setMeta).catch(() => {}) }, [])
  useEffect(() => { load() /* eslint-disable-next-line */ }, [table, who, action, from, to])

  const label = (r: Row) => {
    const o = parse(r.after) || parse(r.before) || {}
    const k = LABEL_KEYS.find((x) => o[x] !== undefined && o[x] !== null && o[x] !== '')
    const extra = o.house_code && k !== 'code' ? ` · บ้าน ${o.house_code}` : ''
    return (k ? String(o[k]) : '#' + r.row_key) + extra
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 13, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid #EEF1F4' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>ประวัติการแก้ไขข้อมูล — ทุกการเพิ่ม / แก้ / ลบ ในระบบ</div>
        <div style={{ fontSize: 12, color: '#94A0A8', marginTop: 2 }}>
          บันทึกอัตโนมัติทุกหน้า รวมบอท LINE{meta?.since ? ` · เริ่มเก็บตั้งแต่ ${fmtTs(meta.since)}` : ''} · ไฟล์/รูปเก็บแค่ขนาด · PIN และรหัสลับไม่แสดง
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 18px', borderBottom: '1px solid #EEF1F4', alignItems: 'center' }}>
        <select id="ch-table" value={table} onChange={(e) => setTable(e.target.value)} style={field} aria-label="เรื่อง">
          <option value="">ทุกเรื่อง</option>
          {(meta?.tables || []).map((t) => <option key={t.t} value={t.t}>{TABLE_LABEL[t.t] || t.t} ({t.n.toLocaleString()})</option>)}
        </select>
        <select id="ch-user" value={who} onChange={(e) => setWho(e.target.value)} style={field} aria-label="ผู้ทำ">
          <option value="">ทุกคน</option>
          {(meta?.users || []).map((u) => <option key={u.u} value={u.u}>{u.u}</option>)}
        </select>
        <select id="ch-action" value={action} onChange={(e) => setAction(e.target.value)} style={field} aria-label="การกระทำ">
          <option value="">เพิ่ม / แก้ / ลบ</option>
          <option value="insert">เพิ่ม</option><option value="update">แก้ไข</option><option value="delete">ลบ</option>
        </select>
        <label style={{ fontSize: 12, color: '#5C6770' }}>ตั้งแต่ <input id="ch-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={field} /></label>
        <label style={{ fontSize: 12, color: '#5C6770' }}>ถึง <input id="ch-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={field} /></label>
        <form onSubmit={(e) => { e.preventDefault(); load() }} style={{ display: 'flex', gap: 6 }}>
          <input id="ch-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา เช่น เลขที่ PR, ชื่อลูกค้า, รหัสบ้าน" style={{ ...field, width: 240 }} />
          <button type="submit" style={{ ...field, cursor: 'pointer', fontWeight: 600, color: '#30506A' }}>ค้นหา</button>
        </form>
      </div>
      {err && <div style={{ padding: '10px 18px', color: '#C24036', fontSize: 13 }}>{err}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
          <thead><tr><th style={{ ...th, paddingLeft: 18 }}>เวลา</th><th style={th}>ผู้ทำ</th><th style={th}>เรื่อง</th><th style={th}>รายการ</th><th style={th}></th><th style={th}>สิ่งที่เปลี่ยน</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ ...td, paddingLeft: 18, whiteSpace: 'nowrap', color: '#5C6770' }}>{fmtTs(r.ts)}</td>
                <td style={{ ...td, fontWeight: 500, whiteSpace: 'nowrap' }}>{r.user}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{TABLE_LABEL[r.table_name] || r.table_name}</td>
                <td style={{ ...td, maxWidth: 220 }}>{label(r)}</td>
                <td style={td}><span style={{ fontSize: 11, fontWeight: 600, color: ACTION[r.action].c, background: ACTION[r.action].bg, padding: '2px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>{ACTION[r.action].t}</span></td>
                <td style={td}><Changes r={r} /></td>
              </tr>
            ))}
            {!rows.length && !busy && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#94A0A8', padding: 24 }}>ไม่พบรายการ</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '10px 18px', borderTop: '1px solid #EEF1F4', display: 'flex', justifyContent: 'center' }}>
        {busy ? <span style={{ fontSize: 12.5, color: '#94A0A8' }}>กำลังโหลด…</span>
          : more && <button onClick={() => load(true)} style={{ ...field, cursor: 'pointer', fontWeight: 600, color: '#30506A' }}>โหลดเพิ่ม (ก่อนหน้านี้)</button>}
      </div>
    </div>
  )
}
