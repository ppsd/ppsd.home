import { useEffect, useState } from 'react'
import { api } from '../api'
import { baht } from '../data'
import { company } from '../erpData'
import { useAppOptional, useLiveRefresh } from '../store'
import MoneyInput from './MoneyInput'
import { moneySummary, VAT_MODE_LABEL } from '../money'

// ===== เงินสดย่อย 2 กอง (เงินสดย่อยทั่วไป / ค่าน้ำมันรถ) =====
// รายการจ่ายมี ร้านค้า · รายการสินค้า+จำนวน · ผู้เบิก · บ้าน · ทะเบียนรถ · VAT/ส่วนลด (ก่อน-หลัง VAT อัตโนมัติ) · อ้างอิง RR/OE/PS/PO · ไม่มีเลขเอกสารร้าน = ออกใบสำคัญรับเงิน (RV) ให้
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '8px 11px', outline: 'none' }
const th: React.CSSProperties = { padding: '9px 12px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'left' }
const card: React.CSSProperties = { background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }
const btn = (bg = '#30506A', color = '#fff', border = 'none'): React.CSSProperties => ({ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color, background: bg, border, borderRadius: 8, padding: '7px 13px', cursor: 'pointer' })
const ghost = btn('#fff', '#30506A', '1px solid #D2DAE1')
const f2 = (n: number) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Line { desc: string; qty: number; unit: string; price: number }
export interface PettyExpense { id: number; fund: string; date_iso: string; cat: string; vendor: string; item: string; items: Line[]; qty_total: number; ref: string; doc_no: string; ref_kind: string; ref_id: number | null; ref_no: string; house_code: string; house_name?: string; vehicle: string; requester: string; note: string; vat_mode: string; discount: number; subtotal: number; before_vat: number; vat_amount: number; amount: number; by: string; created: string; updated?: string; entry_id: number }
interface PettyRow { no: string; date: string; date_iso?: string; memo: string; ref?: string; debit: number; credit: number; balance: number; house_code?: string; house_name?: string; entry_id?: number; expense?: PettyExpense | null }
interface PettyState { fund?: string; label?: string; float: number; balance: number; toReplenish: number; rows: PettyRow[]; added?: number; expense?: PettyExpense }
interface PettyOverviewRow { fund: string; label: string; float: number; balance: number; toReplenish: number }
interface FuelRequest { id: number; no: string; date: string; date_iso: string; by: string; amount: number; house_code: string; house_name: string; vehicle: string; note: string; status: string; approved_by?: string; approved_at?: string; reject_note?: string; source: string }
interface PettyStmtRow { date: string; date_iso: string; ref: string; memo: string; in: number; out: number; balance: number; seq: string; house_code?: string; house_name?: string; vendor?: string; requester?: string; vehicle?: string; doc_no?: string; ref_kind?: string; ref_no?: string; items?: Line[]; discount?: number; before_vat?: number; vat_amount?: number; vat_mode?: string; subtotal?: number }
interface PettyStatement { fund?: string; label?: string; float: number; from: string; to: string; opening: number; rows: PettyStmtRow[]; totalOut: number; totalIn: number; closing: number; toReplenish: number }
interface RefOpt { id: number; no: string; label: string; amount: number; date: string }

export type PettyFundKey = 'petty' | 'fuel'
const PETTY_FUND_INFO: Record<PettyFundKey, { label: string; icon: string; cats: string[]; intro: string }> = {
  petty: {
    label: 'เงินสดย่อย', icon: '💵',
    cats: ['วัสดุ/ของใช้หน้างาน', 'ของใช้สำนักงาน', 'ค่าขนส่ง', 'ค่ารับรอง', 'ค่าบริการ', 'ค่าดำเนินการ', 'อื่นๆ'],
    intro: 'เงินสดย่อยใช้จ่ายค่าใช้จ่ายเล็กๆ น้อยๆ แล้วเติมกลับให้เต็มวงเงิน — ใส่ร้านค้า รายการสินค้า+จำนวน ผู้เบิก และบ้านที่ซื้อให้ได้ · ไม่มีเลขที่บิลจากร้าน ระบบออกใบสำคัญรับเงิน (RV) ให้อัตโนมัติ · อ้างอิงใบรับของ (RR) / ใบจ่าย (OE) / ใบสำคัญจ่าย (PS) ได้',
  },
  fuel: {
    label: 'ค่าน้ำมันรถ', icon: '⛽',
    cats: ['ค่าน้ำมันรถ', 'ค่าทางด่วน/ค่าจอดรถ', 'ค่าซ่อม/บำรุงรักษารถ', 'อื่นๆ (รถ)'],
    intro: 'กองค่าน้ำมันรถแยกจากเงินสดย่อยทั่วไป มีวงเงินของตัวเอง · ใส่ผู้เบิก ทะเบียนรถ บ้านที่วิ่งไป เลือกได้ว่ามีภาษีซื้อไหม (ใบกำกับภาษีจากปั๊ม) ระบบแยกยอดก่อน/หลัง VAT ให้ ปัดเศษสตางค์เป็นบาทเต็ม · ไม่ออกใบสำคัญรับเงิน (ใช้บิลปั๊ม) · เงินเข้ากอง (เติม) อ้างอิงใบจ่าย OE / ใบสำคัญจ่าย PS ได้',
  },
}
const REF_KINDS: { key: string; label: string }[] = [{ key: '', label: '— ไม่อ้างอิง —' }, { key: 'RR', label: 'RR ใบรับของ' }, { key: 'PO', label: 'PO ใบสั่งซื้อ' }, { key: 'OE', label: 'OE ใบจ่ายรายจ่าย' }, { key: 'PS', label: 'PS ใบสำคัญจ่าย (PV)' }]

// ป้ายบ้านเล็กๆ ท้ายรายการ (ไม่ผูกบ้าน = ส่วนกลาง ไม่แสดง)
function HouseTag({ code, name }: { code?: string; name?: string }) {
  if (!code) return null
  return <span title={name || code} style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 600, color: '#30506A', background: '#E8EEF3', border: '1px solid #D2DAE1', borderRadius: 6, padding: '1px 6px', marginLeft: 6, whiteSpace: 'nowrap' }}>🏠 {name && name !== code ? `${code} · ${name}` : code}</span>
}

// ตัวเลือกอ้างอิงเอกสาร (โหลดตามชนิด)
function RefPicker({ kind, refNo, onKind, onPick, allowed }: { kind: string; refNo: string; onKind: (k: string) => void; onPick: (o: RefOpt | null) => void; allowed?: string[] }) {
  const [opts, setOpts] = useState<RefOpt[]>([])
  useEffect(() => { if (kind) api.get<RefOpt[]>('/petty-cash/refs?kind=' + kind).then(setOpts).catch(() => setOpts([])); else setOpts([]) }, [kind])
  const kinds = REF_KINDS.filter((k) => !k.key || !allowed || allowed.includes(k.key))
  return (
    <>
      <select style={field} value={kind} onChange={(e) => { onKind(e.target.value); onPick(null) }}>{kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
      {kind && <select style={{ ...field, minWidth: 320 }} value={refNo} onChange={(e) => onPick(opts.find((o) => o.no === e.target.value) || null)}><option value="">— เลือกเอกสาร {kind} ({opts.length} ใบ) —</option>{opts.map((o) => <option key={o.id} value={o.no}>{o.label}</option>)}</select>}
      {kind && refNo && (() => { const o = opts.find((x) => x.no === refNo); return <span style={{ fontSize: 11.5, color: '#2E7D55', background: '#E2F1EA', borderRadius: 6, padding: '3px 8px' }}>✓ {kind} <b className="num">{refNo}</b>{o ? ' — ' + o.label.replace(/^[^·]*·\s*/, '') : ''}</span> })()}
      {kind && !opts.length && <span style={{ fontSize: 11.5, color: '#C0852C' }}>ยังไม่มีเอกสาร {kind} ในระบบ</span>}
    </>
  )
}

const emptyForm = (fund: PettyFundKey, today: string) => ({ date_iso: today, cat: PETTY_FUND_INFO[fund].cats[0], vendor: '', requester: '', house_code: '', vehicle: '', ref: '', ref_kind: '', ref_id: null as number | null, ref_no: '', note: '', vat_mode: 'none', discount: '', amount: '', lines: [{ desc: '', qty: '', unit: '', price: '' }] as { desc: string; qty: string; unit: string; price: string }[] })
type Form = ReturnType<typeof emptyForm>
const unm = (s: string) => Number(String(s || '').replace(/,/g, '')) || 0

export default function PettyCash({ fund }: { fund: PettyFundKey }) {
  const FUND = PETTY_FUND_INFO[fund]
  const fq = 'fund=' + fund
  const app = useAppOptional()
  const houses = (app?.data.houses || []).filter((h) => h.kind !== 'office').slice().sort((a, b) => (a.status === 'ส่งมอบแล้ว' ? 1 : 0) - (b.status === 'ส่งมอบแล้ว' ? 1 : 0) || a.code.localeCompare(b.code))
  const vendors = app?.data.vendors || []
  const employees = app?.data.employees || []
  const [overview, setOverview] = useState<PettyOverviewRow[]>([])
  const [reqs, setReqs] = useState<FuelRequest[]>([])
  const [st, setSt] = useState<PettyState | null>(null)
  const [msg, setMsg] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = today.slice(0, 8) + '01'
  const [f, setF] = useState<Form>(emptyForm(fund, today))
  const [editId, setEditId] = useState<number | null>(null)
  const [adoptEntry, setAdoptEntry] = useState<number | null>(null) // แก้ไขรายการเก่า (ก่อนปรับระบบ) → สร้างเป็นรายการแบบใหม่แทน
  const [topupEdit, setTopupEdit] = useState<{ entry_id: number; date_iso: string; amount: string; ref_kind: string; ref_no: string; note: string } | null>(null)
  const [floatEdit, setFloatEdit] = useState('')
  const [range, setRange] = useState({ from: firstOfMonth, to: today })
  const [stmt, setStmt] = useState<PettyStatement | null>(null)
  const [voucher, setVoucher] = useState<PettyExpense | null>(null)
  const [topup, setTopup] = useState<{ amount: string; ref_kind: string; ref_no: string; note: string } | null>(null)
  const loadReqs = () => { if (fund === 'fuel') api.get<FuelRequest[]>('/fuel-requests').then(setReqs).catch(() => setReqs([])) }
  const load = () => {
    api.get<PettyState>('/petty-cash?' + fq).then((s) => { setSt(s); setFloatEdit(String(s.float)) }).catch(() => setSt(null))
    api.get<PettyOverviewRow[]>('/petty-cash/overview').then(setOverview).catch(() => setOverview([]))
  }
  useEffect(() => { load(); loadReqs() }, [])
  useLiveRefresh(['fuel', 'petty'], () => { load(); loadReqs() })
  // สรุปยอดฟอร์ม: รายการสินค้า (หรือยอดที่กรอกถ้าไม่มีรายการ) − ส่วนลด → ก่อน VAT / VAT / รวม
  // ปัดยอดแต่ละบรรทัดเป็นบาทเต็ม (≥ 50 สตางค์ปัดขึ้น, < 50 ปัดลง) ทั้งเงินสดย่อยและน้ำมัน — ตรงกับฝั่งเซิร์ฟเวอร์
  const lineAmt = (l: { qty: string; price: string }) => { const q = unm(l.qty), p = unm(l.price); return Math.round(q > 0 ? q * p : p) }
  const hasLines = f.lines.some((l) => l.desc.trim())
  const subtotal = hasLines ? f.lines.filter((l) => l.desc.trim()).reduce((s, l) => s + lineAmt(l), 0) : Math.round(unm(f.amount))
  const money = moneySummary(subtotal, unm(f.discount), f.vat_mode)
  const printStatement = async () => {
    const q = new URLSearchParams(); q.set('fund', fund); if (range.from) q.set('from', range.from); if (range.to) q.set('to', range.to)
    const s = await api.get<PettyStatement>('/petty-cash/statement?' + q.toString()); setStmt(s)
  }
  const resetForm = () => { setF(emptyForm(fund, today)); setEditId(null); setAdoptEntry(null) }
  const submit = async () => {
    if (money.total <= 0) { setMsg('ผิดพลาด: ใส่รายการสินค้า/จำนวนเงิน'); return }
    const body = { fund, date_iso: f.date_iso, cat: f.cat, vendor: f.vendor, requester: f.requester, house_code: f.house_code, vehicle: f.vehicle, ref: f.ref, ref_kind: f.ref_kind, ref_id: f.ref_id, ref_no: f.ref_no, note: f.note, vat_mode: f.vat_mode, discount: money.discount, amount: money.subtotal, items: f.lines.filter((l) => l.desc.trim()).map((l) => ({ desc: l.desc.trim(), qty: unm(l.qty), unit: l.unit, price: unm(l.price) })) }
    try {
      const r = editId ? await api.put<PettyState>('/petty-cash/expense/' + editId, body) : adoptEntry ? await api.put<PettyState>('/petty-cash/adopt/' + adoptEntry, body) : await api.post<PettyState>('/petty-cash/expense', body)
      const h = houses.find((x) => x.code === f.house_code)
      setMsg(`${editId || adoptEntry ? 'แก้ไข' : 'บันทึกจ่าย'}${FUND.label}แล้ว${r.expense?.doc_no ? ` — ออกใบสำคัญรับเงิน ${r.expense.doc_no} ให้อัตโนมัติ (ไม่มีเลขที่บิลร้าน)` : ''}${h ? ` · ผูกบ้าน ${h.code} ${h.name}` : ''}${money.vat_amount ? ` · ภาษีซื้อ ${baht(money.vat_amount)} ลงบัญชี 1160` : ''}`)
      resetForm(); load()
      if (fund === 'petty' && r.expense && !editId && r.expense.doc_no) setVoucher(r.expense)
    } catch (e) { setMsg('ผิดพลาด: ' + (e as Error).message) }
  }
  // รายการเก่า (ไม่มีแถวรายการ): เติมฟอร์มจากรายการบัญชีเดิม แล้วบันทึกเป็นรายการแบบใหม่ (ถอนบัญชีเดิมให้)
  const startAdopt = (r: PettyRow) => {
    setEditId(null); setAdoptEntry(r.entry_id || null)
    const memoParts = String(r.memo || '').split(' · ')
    setF({ ...emptyForm(fund, today), date_iso: r.date_iso || today, ref: r.ref && !/^JV-/.test(r.ref) ? r.ref : '', house_code: r.house_code || '', amount: String(r.credit || ''), lines: [{ desc: memoParts[0] || '', qty: '', unit: '', price: String(r.credit || '') }], vendor: memoParts[1] && !/เบิกโดย|ทะเบียน/.test(memoParts[1]) ? memoParts[1] : '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const saveTopupEdit = async () => {
    if (!topupEdit) return
    try { await api.put('/petty-cash/topup/' + topupEdit.entry_id, { fund, date_iso: topupEdit.date_iso, amount: unm(topupEdit.amount), ref_kind: topupEdit.ref_kind, ref_no: topupEdit.ref_no, note: topupEdit.note }); setMsg('แก้ไขรายการเติมเงินแล้ว'); setTopupEdit(null); load() }
    catch (e) { setMsg('ผิดพลาด: ' + (e as Error).message) }
  }
  const startEdit = (e: PettyExpense) => {
    setAdoptEntry(null)
    setEditId(e.id)
    setF({ date_iso: e.date_iso, cat: e.cat || FUND.cats[0], vendor: e.vendor || '', requester: e.requester || '', house_code: e.house_code || '', vehicle: e.vehicle || '', ref: e.ref || '', ref_kind: e.ref_kind || '', ref_id: e.ref_id, ref_no: e.ref_no || '', note: e.note || '', vat_mode: e.vat_mode || 'none', discount: e.discount ? String(e.discount) : '', amount: e.items.length ? '' : String(e.subtotal || e.amount), lines: e.items.length ? e.items.map((l) => ({ desc: l.desc, qty: l.qty ? String(l.qty) : '', unit: l.unit, price: String(l.price) })) : [{ desc: '', qty: '', unit: '', price: '' }] })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const del = async (e: PettyExpense) => { if (!confirm(`ลบรายการ ${e.doc_no || e.ref || '#' + e.id} ${e.item} ${baht(e.amount)}? (บัญชีที่ลงไว้จะถูกถอน/กลับรายการ)`)) return; try { await api.del('/petty-cash/expense/' + e.id); setMsg('ลบรายการแล้ว'); load() } catch (er) { setMsg('ผิดพลาด: ' + (er as Error).message) } }
  const doTopup = async () => {
    if (!topup) return
    try { const r = await api.post<PettyState>('/petty-cash/topup', { fund, amount: topup.amount ? unm(topup.amount) : undefined, ref_kind: topup.ref_kind, ref_no: topup.ref_no, note: topup.note }); setMsg(`เติม${FUND.label} ${baht(r.added || 0)} จากธนาคาร${topup.ref_no ? ' อ้างอิง ' + topup.ref_kind + ' ' + topup.ref_no : ''} → คงเหลือ ${baht(r.balance)}`); setTopup(null); load() }
    catch (e) { setMsg('ผิดพลาด: ' + (e as Error).message) }
  }
  const saveFloat = async () => { await api.post('/petty-cash/float', { float: Number(floatEdit) || 0, fund }); setMsg(`ตั้งวงเงิน${FUND.label}เป็น ${baht(Number(floatEdit) || 0)} แล้ว`); load() }
  if (!st) return <div style={{ color: '#94A0A8', padding: 20 }}>กำลังโหลด…</div>
  const pct = st.float > 0 ? Math.max(0, Math.min(100, Math.round((st.balance / st.float) * 100))) : 0
  const bad = msg.startsWith('ผิดพลาด')
  const setLine = (i: number, k: string, v: string) => setF({ ...f, lines: f.lines.map((l, j) => j === i ? { ...l, [k]: v } : l) })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 11.5, color: '#94A0A8' }}>{FUND.icon} {FUND.intro}</div>
      {overview.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {overview.map((o) => { const low = o.float > 0 && o.balance < o.float * 0.3; const active = o.fund === fund; return <span key={o.fund} style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 20, border: '1px solid ' + (active ? '#30506A' : '#D2DAE1'), background: active ? '#E8EEF3' : '#fff', color: low ? '#C24036' : '#1E2E3B' }}>{o.fund === 'fuel' ? '⛽' : '💵'} {o.label}: <b className="num">{baht(o.balance)}</b> / {baht(o.float)}{low ? ' · ใกล้หมด' : ''}</span> })}
        </div>
      )}
      {msg && <div style={{ fontSize: 12.5, color: bad ? '#C24036' : '#2E7D55', background: bad ? '#FBEEEC' : '#E2F1EA', border: '1px solid #CDE3D6', borderRadius: 9, padding: '9px 13px' }}>{msg}</div>}

      {/* สรุปยอด + เติม */}
      <div style={{ ...card, padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 16, alignItems: 'center' }}>
        <div><div style={{ fontSize: 12, color: '#5C6770' }}>{FUND.label}คงเหลือ</div><div className="num" style={{ fontSize: 26, fontWeight: 700, color: st.balance < st.float * 0.3 ? '#C24036' : '#1E2E3B' }}>{baht(st.balance)}</div>
          <div style={{ height: 8, background: '#EEF1F4', borderRadius: 20, overflow: 'hidden', marginTop: 6 }}><div style={{ height: '100%', width: pct + '%', background: pct < 30 ? '#C24036' : '#2E7D55', borderRadius: 20 }} /></div></div>
        <div><div style={{ fontSize: 12, color: '#5C6770' }}>วงเงิน{fund === 'fuel' ? 'ค่าน้ำมัน (ลิมิต)' : ' (Float)'}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}><input value={floatEdit} onChange={(e) => setFloatEdit(e.target.value)} style={{ ...field, width: 100, textAlign: 'right' }} /><button onClick={saveFloat} style={{ ...ghost, padding: '7px 10px' }}>ตั้ง</button></div></div>
        <div><div style={{ fontSize: 12, color: '#5C6770' }}>ต้องเติมให้เต็ม</div><div className="num" style={{ fontSize: 22, fontWeight: 700, color: '#C0852C' }}>{baht(st.toReplenish)}</div></div>
        <div style={{ textAlign: 'right' }}><button onClick={() => setTopup(topup ? null : { amount: '', ref_kind: '', ref_no: '', note: '' })} disabled={st.toReplenish <= 0 && !topup} className="btn-primary" style={{ ...btn(st.toReplenish > 0 ? '#2E7D55' : '#C4CCD3'), fontSize: 13.5, padding: '11px 18px', cursor: st.toReplenish > 0 ? 'pointer' : 'not-allowed' }}>↑ เติมเงินเข้ากอง</button><div style={{ fontSize: 10.5, color: '#94A0A8', marginTop: 4 }}>ตัดจากธนาคารเข้า{FUND.label} · อ้างอิง OE/PS ได้</div></div>
        {topup && (
          <div style={{ gridColumn: '1 / -1', background: '#F3F8F5', border: '1px solid #CDE3D6', borderRadius: 10, padding: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>เงินเข้ากอง</span>
            <MoneyInput style={{ ...field, width: 130 }} decimal placeholder={`เต็มวงเงิน ${baht(st.toReplenish)}`} value={topup.amount} onChange={(v) => setTopup({ ...topup, amount: v })} />
            <span style={{ fontSize: 12, color: '#5C6770' }}>อ้างอิงเงินเข้า</span>
            <RefPicker kind={topup.ref_kind} refNo={topup.ref_no} allowed={['OE', 'PS']} onKind={(k) => setTopup((cur) => cur && ({ ...cur, ref_kind: k, ref_no: '' }))} onPick={(o) => setTopup((cur) => cur && ({ ...cur, ref_no: o?.no || '' }))} />
            <input style={{ ...field, flex: 1, minWidth: 160 }} placeholder="หมายเหตุ" value={topup.note} onChange={(e) => setTopup({ ...topup, note: e.target.value })} />
            <button onClick={doTopup} style={btn('#2E7D55')}>บันทึกเงินเข้า</button><button onClick={() => setTopup(null)} style={ghost}>ยกเลิก</button>
          </div>
        )}
      </div>

      {/* ฟอร์มจ่าย (สร้าง/แก้ไข) */}
      <div style={{ ...card, padding: 16, border: editId || adoptEntry ? '2px solid #C0852C' : undefined }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>{editId ? `✎ แก้ไขรายการ #${editId}` : adoptEntry ? `✎ แก้ไขรายการเก่า (บัญชี #${adoptEntry}) — บันทึกแล้วจะกลายเป็นรายการแบบใหม่ ถอนรายการบัญชีเดิมให้` : `บันทึกจ่าย${FUND.label}`}{(editId || adoptEntry) && <button onClick={resetForm} style={{ ...ghost, padding: '3px 9px', fontSize: 11 }}>ยกเลิกแก้ไข</button>}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
          <label style={{ fontSize: 11.5, color: '#5C6770' }}>วันที่<input type="date" style={{ ...field, width: '100%', marginTop: 3 }} value={f.date_iso} onChange={(e) => setF({ ...f, date_iso: e.target.value })} /></label>
          <label style={{ fontSize: 11.5, color: '#5C6770' }}>เลขที่บิล/ใบเสร็จร้าน<input style={{ ...field, width: '100%', marginTop: 3 }} value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} placeholder={fund === 'fuel' ? 'เลขที่บิล/ใบกำกับจากปั๊ม' : 'ว่าง = ออกใบสำคัญรับเงิน RV ให้'} /></label>
          <label style={{ fontSize: 11.5, color: '#5C6770' }}>ร้านค้า / ผู้รับเงิน<input list={'petty-vendors-' + fund} style={{ ...field, width: '100%', marginTop: 3 }} value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} placeholder="พิมพ์หรือเลือก" /><datalist id={'petty-vendors-' + fund}>{vendors.map((v) => <option key={v.id} value={v.name} />)}</datalist></label>
          <label style={{ fontSize: 11.5, color: '#5C6770' }}>ผู้เบิก<input list={'petty-emps-' + fund} style={{ ...field, width: '100%', marginTop: 3 }} value={f.requester} onChange={(e) => setF({ ...f, requester: e.target.value })} placeholder="ชื่อพนักงานที่เบิก" /><datalist id={'petty-emps-' + fund}>{employees.map((e) => <option key={e.id} value={e.name} />)}</datalist></label>
          <label style={{ fontSize: 11.5, color: '#5C6770' }}>{fund === 'fuel' ? 'บ้าน (วิ่งไปบ้านไหน)' : 'บ้าน (ถ้าซื้อให้บ้าน)'}<select style={{ ...field, width: '100%', marginTop: 3, color: f.house_code ? '#1E2E3B' : '#94A0A8' }} value={f.house_code} onChange={(e) => setF({ ...f, house_code: e.target.value })}><option value="">— ส่วนกลางบริษัท —</option>{houses.map((h) => <option key={h.code} value={h.code}>{h.code} · {h.name}</option>)}</select></label>
          {fund === 'fuel' && <label style={{ fontSize: 11.5, color: '#5C6770' }}>ทะเบียนรถ<input style={{ ...field, width: '100%', marginTop: 3 }} value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value })} placeholder="เช่น ผก 1234" /></label>}
          <label style={{ fontSize: 11.5, color: '#5C6770' }}>หมวด<select style={{ ...field, width: '100%', marginTop: 3 }} value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>{FUND.cats.map((c) => <option key={c}>{c}</option>)}</select></label>
        </div>
        {/* รายการสินค้า */}
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '2.4fr 0.7fr 0.7fr 1fr 1fr 28px', gap: 8, fontSize: 11, color: '#94A0A8', padding: '0 2px' }}><span>รายการสินค้า / ค่าใช้จ่าย</span><span style={{ textAlign: 'right' }}>จำนวน</span><span>หน่วย</span><span style={{ textAlign: 'right' }}>ราคา/หน่วย</span><span style={{ textAlign: 'right' }}>รวม</span><span /></div>
        {f.lines.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2.4fr 0.7fr 0.7fr 1fr 1fr 28px', gap: 8, alignItems: 'center', marginTop: 6 }}>
            <input style={{ ...field, padding: '7px 9px' }} placeholder={fund === 'fuel' ? 'เช่น ดีเซล B7' : `สินค้าชิ้นที่ ${i + 1} คืออะไร`} value={l.desc} onChange={(e) => setLine(i, 'desc', e.target.value)} />
            <input style={{ ...field, padding: '7px 9px', textAlign: 'right' }} inputMode="decimal" placeholder="0" value={l.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} />
            <input style={{ ...field, padding: '7px 9px' }} placeholder={fund === 'fuel' ? 'ลิตร' : 'หน่วย'} value={l.unit} onChange={(e) => setLine(i, 'unit', e.target.value)} />
            <MoneyInput style={{ ...field, padding: '7px 9px', textAlign: 'right' }} decimal placeholder="0" value={l.price} onChange={(v) => setLine(i, 'price', v)} />
            <div className="num" style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 600 }}>{f2(lineAmt(l))}</div>
            <button onClick={() => setF({ ...f, lines: f.lines.length > 1 ? f.lines.filter((_, j) => j !== i) : f.lines })} style={{ border: 'none', background: 'none', color: f.lines.length > 1 ? '#C24036' : '#CBD3DA', cursor: 'pointer', fontSize: 15 }}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setF({ ...f, lines: [...f.lines, { desc: '', qty: '', unit: '', price: '' }] })} style={{ ...ghost, border: '1px dashed #B9C6D0' }}>+ เพิ่มรายการ</button>
          {!hasLines && <><span style={{ fontSize: 12, color: '#5C6770' }}>หรือยอดรวม</span><MoneyInput style={{ ...field, width: 120 }} decimal placeholder="จำนวนเงิน" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></>}
          <span style={{ fontSize: 12, color: '#5C6770', marginLeft: 6 }}>ส่วนลด</span><MoneyInput style={{ ...field, width: 100 }} decimal placeholder="0" value={f.discount} onChange={(v) => setF({ ...f, discount: v })} />
          <span style={{ fontSize: 12, color: '#5C6770' }}>ภาษีซื้อ</span>
          <select style={{ ...field, width: 'auto' }} value={f.vat_mode} onChange={(e) => setF({ ...f, vat_mode: e.target.value })}>{(Object.keys(VAT_MODE_LABEL) as (keyof typeof VAT_MODE_LABEL)[]).map((k) => <option key={k} value={k}>{VAT_MODE_LABEL[k]}</option>)}</select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, fontSize: 12, color: '#5C6770', background: '#F3F5F7', borderRadius: 8, padding: '6px 12px', flexWrap: 'wrap' }}>
            {money.discount > 0 && <span>ส่วนลด <b className="num" style={{ color: '#C24036' }}>-{f2(money.discount)}</b></span>}
            <span>ก่อน VAT <b className="num" style={{ color: '#1C2730' }}>{f2(money.before_vat)}</b></span>
            <span>VAT 7% <b className="num" style={{ color: '#1C2730' }}>{money.vat_mode === 'none' ? '-' : f2(money.vat_amount)}</b></span>
            <span>รวมจ่าย <b className="num" style={{ color: '#1C2730', fontSize: 14 }}>{f2(money.total)}</b></span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#5C6770' }}>อ้างอิง</span>
          <RefPicker kind={f.ref_kind} refNo={f.ref_no} onKind={(k) => setF((cur) => ({ ...cur, ref_kind: k, ref_no: '', ref_id: null }))} onPick={(o) => setF((cur) => ({ ...cur, ref_no: o?.no || '', ref_id: o?.id ?? null }))} />
          <input style={{ ...field, flex: 1, minWidth: 180 }} placeholder="หมายเหตุ" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          <button onClick={submit} className="btn-primary" style={{ ...btn(editId ? '#C0852C' : '#30506A'), fontSize: 13, padding: '9px 16px' }}>{editId ? 'บันทึกการแก้ไข' : 'บันทึกจ่าย'}</button>
        </div>
      </div>

      {fund === 'fuel' && <FuelRequestPanel reqs={reqs} balance={st.balance} onDone={() => { load(); loadReqs() }} setMsg={setMsg} />}

      <div style={{ ...card, padding: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>ใบสรุปรายจ่าย{FUND.label}</span>
        <span style={{ fontSize: 12, color: '#5C6770' }}>รอบวันที่</span>
        <input type="date" style={field} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /><span style={{ color: '#94A0A8' }}>–</span>
        <input type="date" style={field} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <button onClick={printStatement} className="btn-primary" style={btn('#C0852C')}>🖨 ออกใบสรุป</button>
      </div>

      {/* ประวัติ */}
      <div style={card}>
        <div style={{ padding: '11px 16px', borderBottom: '1px solid #EEF1F4', fontSize: 13, fontWeight: 600 }}>ความเคลื่อนไหว{FUND.label} <span style={{ fontSize: 11, color: '#94A0A8', fontWeight: 400 }}>· บัญชี/ผู้ดูแลระบบกด ✎ แก้ไขได้{fund === 'petty' ? ' หรือ 🖨 พิมพ์ใบสำคัญรับเงิน' : ''}</span></div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ background: '#F7F9FB' }}>
              <th style={{ ...th, paddingLeft: 16 }}>เลขที่/วันที่</th><th style={th}>รายการ · ร้าน · ผู้เบิก</th><th style={{ ...th, textAlign: 'right' }}>ก่อน VAT</th><th style={{ ...th, textAlign: 'right' }}>VAT</th>
              <th style={{ ...th, textAlign: 'right' }}>เติมเข้า</th><th style={{ ...th, textAlign: 'right' }}>จ่ายออก</th><th style={{ ...th, textAlign: 'right' }}>คงเหลือ</th><th style={{ ...th, paddingRight: 16 }} />
            </tr></thead>
            <tbody>
              {st.rows.length === 0 && <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีความเคลื่อนไหว — ตั้งวงเงินแล้วกด “เติมเงินเข้ากอง” เพื่อเริ่มตั้ง{FUND.label}</td></tr>}
              {st.rows.map((r, i) => { const e = r.expense; return (
                <tr key={i} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td style={{ padding: '8px 16px' }}><span className="num" style={{ fontFamily: 'monospace', fontWeight: 600 }}>{e?.doc_no || e?.ref || r.ref || r.no}</span><div style={{ fontSize: 10.5, color: '#94A0A8' }}>{r.date}{e?.doc_no ? ' · ใบสำคัญรับเงิน' : ''}{e?.ref_no ? ` · อ้าง ${e.ref_kind} ${e.ref_no}` : ''}</div></td>
                  <td style={{ padding: '8px 12px', color: '#5C6770' }}>{e ? <>{e.item}{e.vendor ? <span> · <b style={{ color: '#1C2730', fontWeight: 500 }}>{e.vendor}</b></span> : null}{e.requester ? <span> · เบิก {e.requester}</span> : null}{e.vehicle ? <span> · 🚗 {e.vehicle}</span> : null}</> : r.memo}<HouseTag code={r.house_code} name={r.house_name} /></td>
                  <td className="num" style={{ padding: '8px 12px', textAlign: 'right', color: '#5C6770' }}>{e ? f2(e.before_vat) : (r.credit ? f2(r.credit) : '-')}</td>
                  <td className="num" style={{ padding: '8px 12px', textAlign: 'right', color: e?.vat_amount ? '#6B4E9E' : '#CBD3DA' }}>{e?.vat_amount ? f2(e.vat_amount) : '-'}</td>
                  <td className="num" style={{ padding: '8px 12px', textAlign: 'right', color: r.debit ? '#2E7D55' : '#CBD3DA' }}>{r.debit ? baht(r.debit) : '-'}</td>
                  <td className="num" style={{ padding: '8px 12px', textAlign: 'right', color: r.credit ? '#C24036' : '#CBD3DA' }}>{r.credit ? baht(r.credit) : '-'}</td>
                  <td className="num" style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{baht(r.balance)}</td>
                  <td style={{ padding: '8px 16px 8px 4px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {e && <>{fund === 'petty' && <><button onClick={() => setVoucher(e)} title="พิมพ์ใบสำคัญรับเงิน" style={{ ...ghost, padding: '2px 7px', fontSize: 11 }}>🖨</button> </>}<button onClick={() => startEdit(e)} title="แก้ไข" style={{ ...ghost, padding: '2px 7px', fontSize: 11 }}>✎</button> <button onClick={() => del(e)} title="ลบ" style={{ ...ghost, padding: '2px 7px', fontSize: 11, color: '#C24036' }}>✕</button></>}
                    {!e && r.credit > 0 && <button onClick={() => startAdopt(r)} title="แก้ไขรายการเก่า (เติมร้าน/รายการ/ผู้เบิก/VAT ได้ · บันทึกแล้วกลายเป็นรายการแบบใหม่)" style={{ ...ghost, padding: '2px 7px', fontSize: 11 }}>✎ แก้ไข</button>}
                    {!e && r.debit > 0 && r.entry_id && <button onClick={() => setTopupEdit({ entry_id: r.entry_id!, date_iso: r.date_iso || today, amount: String(r.debit), ref_kind: '', ref_no: '', note: r.memo || '' })} title="แก้ไขรายการเติมเงิน (จำนวน/วันที่/อ้างอิง)" style={{ ...ghost, padding: '2px 7px', fontSize: 11 }}>✎ แก้ไข</button>}
                  </td>
                </tr>) })}
            </tbody>
          </table>
        </div>
      </div>

      {topupEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.45)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setTopupEdit(null)}>
          <div style={{ ...card, padding: 18, width: 520, maxWidth: '100%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>✎ แก้ไขรายการเติมเงินเข้ากอง</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={{ fontSize: 11.5, color: '#5C6770' }}>วันที่<input type="date" style={{ ...field, width: '100%', marginTop: 3 }} value={topupEdit.date_iso} onChange={(e) => setTopupEdit({ ...topupEdit, date_iso: e.target.value })} /></label>
              <label style={{ fontSize: 11.5, color: '#5C6770' }}>จำนวนเงิน<MoneyInput style={{ ...field, width: '100%', marginTop: 3 }} decimal value={topupEdit.amount} onChange={(v) => setTopupEdit({ ...topupEdit, amount: v })} /></label>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}><span style={{ fontSize: 12, color: '#5C6770' }}>อ้างอิงเงินเข้า</span><RefPicker kind={topupEdit.ref_kind} refNo={topupEdit.ref_no} allowed={['OE', 'PS']} onKind={(k) => setTopupEdit((cur) => cur && ({ ...cur, ref_kind: k, ref_no: '' }))} onPick={(o) => setTopupEdit((cur) => cur && ({ ...cur, ref_no: o?.no || '' }))} /></div>
            <input style={{ ...field, width: '100%', marginTop: 8 }} placeholder="หมายเหตุ/รายละเอียด" value={topupEdit.note} onChange={(e) => setTopupEdit({ ...topupEdit, note: e.target.value })} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}><button onClick={() => setTopupEdit(null)} style={ghost}>ยกเลิก</button><button onClick={saveTopupEdit} style={btn('#C0852C')}>บันทึกการแก้ไข</button></div>
          </div>
        </div>
      )}
      {stmt && <PettyStatementDoc s={stmt} onClose={() => setStmt(null)} />}
      {voucher && <PettyVoucherDoc e={voucher} fundLabel={FUND.label} onClose={() => setVoucher(null)} />}
    </div>
  )
}

// คำขอเบิกค่าน้ำมันรถ: รออนุมัติ (กดอนุมัติ/ปฏิเสธได้ที่นี่ เหมือนกดในการ์ด LINE) + ประวัติล่าสุด
function FuelRequestPanel({ reqs, balance, onDone, setMsg }: { reqs: FuelRequest[]; balance: number; onDone: () => void; setMsg: (m: string) => void }) {
  const pending = reqs.filter((r) => r.status === 'รออนุมัติ')
  const done = reqs.filter((r) => r.status !== 'รออนุมัติ').slice(0, 8)
  const act = async (r: FuelRequest, kind: 'approve' | 'reject') => {
    let note = ''
    if (kind === 'reject') { const n = window.prompt(`เหตุผลที่ปฏิเสธ ${r.no} (เว้นว่างได้)`); if (n === null) return; note = n }
    try { await api.post(`/fuel-requests/${r.id}/${kind}`, { note }); setMsg(kind === 'approve' ? `✅ อนุมัติ ${r.no} แล้ว — จ่าย ${baht(r.amount)} จากกองค่าน้ำมัน แจ้ง ${r.by} ทาง LINE แล้ว` : `❌ ปฏิเสธ ${r.no} แล้ว`); onDone() }
    catch (e) { setMsg('ผิดพลาด: ' + (e as Error).message) }
  }
  const stColor = (s: string) => s === 'อนุมัติ' ? '#2E7D55' : s === 'ปฏิเสธ' ? '#C24036' : '#C0852C'
  return (
    <div style={card}>
      <div style={{ padding: '11px 16px', borderBottom: '1px solid #EEF1F4', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>คำขอเบิกค่าน้ำมัน</span>
        {pending.length > 0 && <span style={{ fontSize: 11.5, fontWeight: 600, color: '#C0852C', background: '#FBF1DF', borderRadius: 20, padding: '2px 9px' }}>รออนุมัติ {pending.length}</span>}
        <span style={{ fontSize: 11.5, color: '#94A0A8' }}>โฟร์แมนพิมพ์ในไลน์ “เบิกน้ำมัน 1500 บ้านคุณพร ทะเบียน กข1234” → ผู้บริหารกดอนุมัติในการ์ด LINE หรือที่นี่ → หักจากกองนี้ทันที</span>
      </div>
      {pending.length === 0 && done.length === 0 && <div style={{ padding: 18, textAlign: 'center', color: '#94A0A8', fontSize: 12.5 }}>ยังไม่มีคำขอเบิก</div>}
      {(pending.length > 0 || done.length > 0) && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ background: '#F7F9FB' }}>
            <th style={{ ...th, paddingLeft: 16 }}>เลขที่/วันที่</th><th style={th}>ผู้ขอ</th><th style={th}>บ้าน · ทะเบียน · หมายเหตุ</th>
            <th style={{ ...th, textAlign: 'right' }}>ยอด</th><th style={th}>สถานะ</th><th style={{ ...th, paddingRight: 16 }} />
          </tr></thead>
          <tbody>
            {[...pending, ...done].map((r) => (
              <tr key={r.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6', background: r.status === 'รออนุมัติ' ? '#FFFDF7' : undefined }}>
                <td style={{ padding: '8px 16px' }}><span className="num" style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.no}</span><div style={{ fontSize: 10.5, color: '#94A0A8' }}>{r.date}{r.source === 'line' ? ' · LINE' : ''}</div></td>
                <td style={{ padding: '8px 12px' }}>{r.by}</td>
                <td style={{ padding: '8px 12px', color: '#5C6770' }}>{r.house_name ? <HouseTag code={r.house_code} name={r.house_name} /> : <span style={{ color: '#94A0A8' }}>ส่วนกลาง</span>}{r.vehicle ? <span style={{ marginLeft: 8 }}>🚗 {r.vehicle}</span> : null}{r.note ? <div style={{ fontSize: 11.5 }}>{r.note}</div> : null}</td>
                <td className="num" style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: r.status === 'รออนุมัติ' && r.amount > balance ? '#C24036' : '#1E2E3B' }} title={r.status === 'รออนุมัติ' && r.amount > balance ? 'กองค่าน้ำมันไม่พอ ต้องเติมก่อน' : ''}>{baht(r.amount)}</td>
                <td style={{ padding: '8px 12px' }}><span style={{ fontSize: 11.5, fontWeight: 600, color: stColor(r.status) }}>{r.status}</span>{r.approved_by ? <div style={{ fontSize: 10.5, color: '#94A0A8' }}>โดย {r.approved_by}{r.reject_note ? ' · ' + r.reject_note : ''}</div> : null}</td>
                <td style={{ padding: '8px 16px 8px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {r.status === 'รออนุมัติ' && <>
                    <button onClick={() => act(r, 'approve')} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 7, padding: '6px 11px', cursor: 'pointer', marginRight: 6 }}>อนุมัติ</button>
                    <button onClick={() => act(r, 'reject')} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12, color: '#C24036', background: '#fff', border: '1px solid #E8C9C5', borderRadius: 7, padding: '6px 11px', cursor: 'pointer' }}>ปฏิเสธ</button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}


// ใบสำคัญรับเงิน (RV) — ให้ผู้รับเงิน/ร้านที่ไม่มีบิลลงชื่อรับเงินสดย่อย
function PettyVoucherDoc({ e, fundLabel, onClose }: { e: PettyExpense; fundLabel: string; onClose: () => void }) {
  const bd = '1px solid #333'
  const cell: React.CSSProperties = { border: bd, padding: '4px 7px', fontSize: 11.5 }
  const hd: React.CSSProperties = { ...cell, background: '#F2F2F2', fontWeight: 700, textAlign: 'center' }
  const thDate = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return Number.isNaN(d.getTime()) ? iso : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}` }
  const lines = e.items.length ? e.items : [{ desc: e.item, qty: 0, unit: '', price: e.subtotal || e.amount }]
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 70, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 720, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>ใบสำคัญรับเงิน {e.doc_no || e.ref}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}><button onClick={() => window.print()} style={btn()}>🖨 พิมพ์</button><button onClick={onClose} style={btn('#fff', '#1C2730')}>ปิด</button></div>
      </div>
      <div className="print-area" style={{ maxWidth: 720, margin: '0 auto', background: '#fff', color: '#1C2730', borderRadius: 4, padding: '26px 30px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div><div style={{ fontSize: 15, fontWeight: 700 }}>{company.name}</div><div style={{ fontSize: 11.5, color: '#333' }}>{company.address || ''}</div></div>
          <div style={{ textAlign: 'right', fontSize: 11.5 }}><div style={{ fontSize: 15, fontWeight: 700 }}>ใบสำคัญรับเงิน</div><div>เลขที่ <b className="num">{e.doc_no || e.ref || '-'}</b></div><div>วันที่ <span className="num">{thDate(e.date_iso)}</span></div><div>จ่ายจาก {fundLabel}</div></div>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.9 }}>
          <div>ข้าพเจ้า <b>{e.vendor || e.requester || '.................................................'}</b> ได้รับเงินจาก <b>{company.name}</b></div>
          <div>ผู้เบิก: {e.requester || '-'} {e.house_code ? `· สำหรับบ้าน ${e.house_name || e.house_code}` : '· ส่วนกลางบริษัท'}{e.vehicle ? ` · ทะเบียนรถ ${e.vehicle}` : ''}{e.ref_no ? ` · อ้างอิง ${e.ref_kind} ${e.ref_no}` : ''}</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
          <thead><tr><th style={{ ...hd, width: 36 }}>ลำดับ</th><th style={hd}>รายการ</th><th style={{ ...hd, width: 60 }}>จำนวน</th><th style={{ ...hd, width: 50 }}>หน่วย</th><th style={{ ...hd, width: 80 }}>ราคา/หน่วย</th><th style={{ ...hd, width: 90 }}>จำนวนเงิน</th></tr></thead>
          <tbody>
            {lines.map((l, i) => <tr key={i}><td style={{ ...cell, textAlign: 'center' }} className="num">{i + 1}</td><td style={cell}>{l.desc}</td><td style={{ ...cell, textAlign: 'right' }} className="num">{l.qty > 0 ? l.qty.toLocaleString() : ''}</td><td style={{ ...cell, textAlign: 'center' }}>{l.unit}</td><td style={{ ...cell, textAlign: 'right' }} className="num">{l.qty > 0 ? f2(l.price) : ''}</td><td style={{ ...cell, textAlign: 'right' }} className="num">{f2(l.qty > 0 ? l.qty * l.price : l.price)}</td></tr>)}
            {Array.from({ length: Math.max(0, 4 - lines.length) }).map((_, i) => <tr key={'e' + i}><td style={{ ...cell, height: 18 }}>&nbsp;</td><td style={cell} /><td style={cell} /><td style={cell} /><td style={cell} /><td style={cell} /></tr>)}
            <tr><td style={{ ...cell, textAlign: 'right' }} colSpan={5}>รวมราคาสินค้า</td><td style={{ ...cell, textAlign: 'right' }} className="num">{f2(e.subtotal)}</td></tr>
            {e.discount > 0 && <tr><td style={{ ...cell, textAlign: 'right' }} colSpan={5}>หัก ส่วนลด</td><td style={{ ...cell, textAlign: 'right' }} className="num">{f2(e.discount)}</td></tr>}
            <tr><td style={{ ...cell, textAlign: 'right' }} colSpan={5}>ยอดก่อนภาษีมูลค่าเพิ่ม</td><td style={{ ...cell, textAlign: 'right' }} className="num">{f2(e.before_vat)}</td></tr>
            <tr><td style={{ ...cell, textAlign: 'right' }} colSpan={5}>{e.vat_mode === 'none' ? 'ภาษีมูลค่าเพิ่ม (ไม่มี)' : 'ภาษีมูลค่าเพิ่ม 7%'}</td><td style={{ ...cell, textAlign: 'right' }} className="num">{e.vat_mode === 'none' ? '-' : f2(e.vat_amount)}</td></tr>
            <tr><td style={{ ...hd, textAlign: 'right' }} colSpan={5}>รวมเงินทั้งสิ้น</td><td style={{ ...hd, textAlign: 'right' }} className="num">{f2(e.amount)}</td></tr>
          </tbody>
        </table>
        {e.note && <div style={{ fontSize: 11.5, marginTop: 6 }}>หมายเหตุ: {e.note}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 40, gap: 30, fontSize: 11.5 }}>
          {['ผู้รับเงิน', 'ผู้จ่ายเงิน', 'ผู้อนุมัติ'].map((l, i) => <div key={i} style={{ flex: 1, textAlign: 'center' }}><div style={{ borderTop: '1px dotted #666', marginBottom: 5 }} /><div>({l})</div><div style={{ fontSize: 10.5, color: '#94A0A8', marginTop: 2 }}>วันที่ ..../..../....</div></div>)}
        </div>
      </div>
    </div>
  )
}

// ใบสรุปรายจ่ายเงินสดย่อย (พิมพ์) — ตามแบบเอกสารบริษัท + คอลัมน์ ก่อน VAT / VAT / ส่วนลด
function PettyStatementDoc({ s, onClose }: { s: PettyStatement; onClose: () => void }) {
  const m = (n: number) => n ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
  const bd = '1px solid #333'
  const cell: React.CSSProperties = { border: bd, padding: '3px 6px', fontSize: 11 }
  const hd: React.CSSProperties = { ...cell, background: '#F2F2F2', fontWeight: 700, textAlign: 'center' }
  const thDate = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return Number.isNaN(d.getTime()) ? iso : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}` }
  const sumBefore = s.rows.reduce((x, r) => x + (r.out ? (r.before_vat || 0) : 0), 0), sumVat = s.rows.reduce((x, r) => x + (r.vat_amount || 0), 0), sumDisc = s.rows.reduce((x, r) => x + (r.discount || 0), 0)
  const label = s.label || 'เงินสดย่อย'
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 70, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 900, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>ใบสรุปรายจ่าย{label}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}><button onClick={() => window.print()} style={btn()}>🖨 พิมพ์</button><button onClick={onClose} style={btn('#fff', '#1C2730')}>ปิด</button></div>
      </div>
      <div className="print-area" style={{ maxWidth: 900, margin: '0 auto', background: '#fff', color: '#1C2730', borderRadius: 4, padding: '26px 30px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        <div style={{ textAlign: 'center', lineHeight: 1.5 }}><div style={{ fontSize: 15, fontWeight: 700 }}>{company.name}</div><div style={{ fontSize: 14, fontWeight: 700 }}>ใบสรุป รายจ่าย{label}</div><div style={{ fontSize: 12, color: '#333' }}>รอบวันที่ {s.from ? thDate(s.from) : '-'} – {s.to ? thDate(s.to) : '-'}</div></div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
          <thead><tr>
            <th style={{ ...hd, width: 62 }}>วันที่</th><th style={{ ...hd, width: 36 }}>ลำดับ</th><th style={{ ...hd, width: 76 }}>เลขที่เอกสาร</th><th style={hd}>รายการ · ร้าน · ผู้เบิก</th>
            <th style={{ ...hd, width: 70 }}>ก่อน VAT</th><th style={{ ...hd, width: 56 }}>VAT</th><th style={{ ...hd, width: 56 }}>ส่วนลด</th><th style={{ ...hd, width: 72 }}>รายรับ</th><th style={{ ...hd, width: 72 }}>รายจ่าย</th><th style={{ ...hd, width: 76 }}>คงเหลือ</th>
          </tr></thead>
          <tbody>
            <tr><td style={cell} /><td style={cell} /><td style={cell} /><td style={{ ...cell, fontWeight: 600 }}>ยอดยกมา</td><td style={cell} /><td style={cell} /><td style={cell} /><td style={{ ...cell, textAlign: 'right' }} className="num">{m(s.opening)}</td><td style={cell} /><td style={{ ...cell, textAlign: 'right' }} className="num">{m(s.opening)}</td></tr>
            {s.rows.map((r, i) => (
              <tr key={i}>
                <td style={{ ...cell, textAlign: 'center', whiteSpace: 'nowrap' }} className="num">{r.date_iso ? thDate(r.date_iso) : r.date}</td>
                <td style={{ ...cell, textAlign: 'center' }} className="num">{r.seq}</td>
                <td style={{ ...cell, textAlign: 'center' }} className="num">{r.doc_no || r.ref}</td>
                <td style={cell}>{r.memo}{r.house_code ? <span style={{ fontSize: 10, color: '#444' }}> [บ้าน {r.house_code}{r.house_name && r.house_name !== r.house_code ? ' ' + r.house_name : ''}]</span> : null}{r.ref_no ? <span style={{ fontSize: 10, color: '#444' }}> [อ้าง {r.ref_kind} {r.ref_no}]</span> : null}</td>
                <td style={{ ...cell, textAlign: 'right' }} className="num">{r.out ? m(r.before_vat || 0) : ''}</td>
                <td style={{ ...cell, textAlign: 'right' }} className="num">{r.vat_amount ? m(r.vat_amount) : ''}</td>
                <td style={{ ...cell, textAlign: 'right' }} className="num">{r.discount ? m(r.discount) : ''}</td>
                <td style={{ ...cell, textAlign: 'right' }} className="num">{r.in ? m(r.in) : ''}</td>
                <td style={{ ...cell, textAlign: 'right' }} className="num">{r.out ? m(r.out) : ''}</td>
                <td style={{ ...cell, textAlign: 'right' }} className="num">{m(r.balance)}</td>
              </tr>
            ))}
            {Array.from({ length: Math.max(0, 6 - s.rows.length) }).map((_, i) => <tr key={'e' + i}><td style={{ ...cell, height: 18 }}>&nbsp;</td><td style={cell} /><td style={cell} /><td style={cell} /><td style={cell} /><td style={cell} /><td style={cell} /><td style={cell} /><td style={cell} /><td style={cell} /></tr>)}
            <tr><td style={{ ...hd, textAlign: 'right' }} colSpan={4}>รวมจำนวนเงินทั้งสิ้น</td><td style={{ ...hd, textAlign: 'right' }} className="num">{m(sumBefore)}</td><td style={{ ...hd, textAlign: 'right' }} className="num">{m(sumVat)}</td><td style={{ ...hd, textAlign: 'right' }} className="num">{m(sumDisc)}</td><td style={{ ...hd, textAlign: 'right' }} className="num">{m(s.totalIn)}</td><td style={{ ...hd, textAlign: 'right' }} className="num">{m(s.totalOut)}</td><td style={{ ...hd, textAlign: 'right' }} className="num">{m(s.closing)}</td></tr>
          </tbody>
        </table>
        <div style={{ fontSize: 11.5, color: '#C24036', marginTop: 10 }}>* เพื่อให้อยู่ในวงเงิน{label} {s.float.toLocaleString('en-US')} บาท<br />{s.toReplenish > 0 ? <>ต้องเติมอีก <b>{s.toReplenish.toLocaleString('en-US')}</b> บาท ({s.float.toLocaleString('en-US')} − {s.closing.toLocaleString('en-US')} = {s.toReplenish.toLocaleString('en-US')})</> : <>{label}เต็มวงเงินแล้ว (คงเหลือ {s.closing.toLocaleString('en-US')} บาท)</>}</div>
        {(() => {
          const byHouse = new Map<string, { name: string; total: number }>(); let central = 0
          for (const r of s.rows) { if (!r.out) continue; if (!r.house_code) { central += r.out; continue } const cur = byHouse.get(r.house_code) || { name: r.house_name || r.house_code, total: 0 }; cur.total += r.out; byHouse.set(r.house_code, cur) }
          if (byHouse.size === 0) return null
          return <div style={{ marginTop: 12, fontSize: 11.5 }}><div style={{ fontWeight: 700, marginBottom: 4 }}>สรุปรายจ่ายแยกตามบ้าน</div><table style={{ borderCollapse: 'collapse', minWidth: 320 }}><tbody>{[...byHouse.entries()].map(([code, v]) => <tr key={code}><td style={cell}>🏠 {code}{v.name && v.name !== code ? ' · ' + v.name : ''}</td><td style={{ ...cell, textAlign: 'right', minWidth: 90 }} className="num">{m(v.total)}</td></tr>)}{central > 0 && <tr><td style={cell}>ส่วนกลางบริษัท</td><td style={{ ...cell, textAlign: 'right' }} className="num">{m(central)}</td></tr>}</tbody></table></div>
        })()}
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 40, gap: 30, fontSize: 11.5 }}>
          {['ผู้จัดทำ', 'ผู้ตรวจสอบ', 'ผู้อนุมัติ'].map((l, i) => <div key={i} style={{ flex: 1, textAlign: 'center' }}><div style={{ borderTop: '1px dotted #666', marginBottom: 5 }} /><div>({l})</div><div style={{ fontSize: 10.5, color: '#94A0A8', marginTop: 2 }}>วันที่ ..../..../....</div></div>)}
        </div>
      </div>
    </div>
  )
}
