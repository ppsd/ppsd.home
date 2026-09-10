import { Fragment, useEffect, useState } from 'react'
import { procurementTabs } from '../erpData'
import { baht, unMoney, matchMaterial, catsOfHouse, catLabelOf } from '../data'
import { api } from '../api'
import { useApp } from '../store'
import type { ApiPR, ApiPO, ApiPayment, ApiVendor } from '../store'
import MoneyInput from './MoneyInput'
import EfilingList from './EfilingList'
import PrApprovalDoc from './PrApprovalDoc'
import PoDoc from './PoDoc'
import WhtDoc from './WhtDoc'
import PaymentVoucher from './PaymentVoucher'
import ApprovalBar from './ApprovalBar'
import GoodsReceipt from './GoodsReceipt'
import MaterialAutocomplete from './MaterialAutocomplete'

const th: React.CSSProperties = { padding: '9px 14px', fontWeight: 600, color: '#5C6770', fontSize: 12 }
const td: React.CSSProperties = { padding: '10px 14px' }

const prField: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '8px 11px', outline: 'none' }
const catLabel = (k?: string) => catLabelOf(k)

interface Quote { id: number; pr_id: number; vendor: string; price: number; terms: string; note: string; chosen: number; ai?: number; recommended?: number; reason?: string; items?: string | null }
interface QuoteFile { id: number; pr_id: number; image: string; by: string; source: string; created: string }
type AiCompare = NonNullable<ApiPR['ai_compare']> & { quotes?: { vendor: string; total: number }[] }
// ใบเปรียบเทียบราคา (price comparison) ของ PR หนึ่งใบ — ขั้น 4: รูปใบเสนอราคา (เว็บ/LINE) → AI เทียบ → ขั้น 5: ออก PO จากร้านที่เลือก
function QuotePanel({ pr, canIssuePo, onIssued }: { pr: ApiPR; canIssuePo: boolean; onIssued?: () => void }) {
  const prId = pr.id
  const [rows, setRows] = useState<Quote[]>([])
  const [files, setFiles] = useState<QuoteFile[]>([])
  const [ai, setAi] = useState<AiCompare | null>(pr.ai_compare || null)
  const [busy, setBusy] = useState('')
  const [f, setF] = useState({ vendor: '', price: '', terms: '' })
  const [err, setErr] = useState('')
  const load = () => {
    api.get<Quote[]>('/purchase-requests/' + prId + '/quotes').then(setRows).catch(() => {})
    api.get<QuoteFile[]>('/purchase-requests/' + prId + '/quote-files').then(setFiles).catch(() => {})
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [prId])
  const pickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []).filter((x) => x.type.startsWith('image/')); e.target.value = ''
    if (!list.length) return
    setBusy('upload'); setErr('')
    Promise.all(list.map((file) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(file) })))
      .then((images) => api.post('/purchase-requests/' + prId + '/quote-files', { images }))
      .then(() => load()).catch((e) => setErr((e as Error).message)).finally(() => setBusy(''))
  }
  const delFile = async (id: number) => { await api.del('/pr-quote-files/' + id); load() }
  const compare = async () => {
    setBusy('ai'); setErr('')
    try { const r = await api.post<AiCompare>('/purchase-requests/' + prId + '/ai-compare', {}); setAi(r); load() } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }
  const issuePo = async (q: Quote) => {
    if (!confirm(`ออกใบสั่งซื้อจากร้าน ${q.vendor} ยอด ${baht(q.price || pr.amount)} แล้วส่งขออนุมัติทาง LINE?`)) return
    setBusy('po'); setErr('')
    try { const po = await api.post<{ no: string }>('/purchase-requests/' + prId + '/issue-po', { quote_id: q.id }); alert(`ออก ${po.no} แล้ว — ส่งขออนุมัติ PO ทาง LINE ให้ผู้บริหารแล้ว`); onIssued?.() } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }
  const add = async () => {
    if (!f.vendor.trim()) { setErr('กรอกชื่อผู้ขาย'); return }
    setErr('')
    try { await api.post('/purchase-requests/' + prId + '/quotes', { vendor: f.vendor, price: unMoney(f.price), terms: f.terms }); setF({ vendor: '', price: '', terms: '' }); load() } catch (e) { setErr((e as Error).message) }
  }
  const choose = async (id: number) => { await api.post('/pr-quotes/' + id + '/choose', {}); load() }
  const del = async (id: number) => { await api.del('/pr-quotes/' + id); load() }
  const best = rows.length ? Math.min(...rows.filter((r) => r.price > 0).map((r) => r.price)) : 0
  const prApproved = !!pr.approval?.done || pr.status === 'อนุมัติ'
  const smallBtn: React.CSSProperties = { fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }
  return (
    <div style={{ background: '#FBFCFD', border: '1px solid #E7ECF0', borderRadius: 10, padding: 14 }}>
      {/* ขั้น 4: รูปใบเสนอราคา + AI เทียบ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>รูปใบเสนอราคา ({files.length})</div>
        <label style={{ ...smallBtn, display: 'inline-flex', alignItems: 'center', gap: 4 }}>📷 อัปโหลดรูปใบเสนอราคา<input type="file" accept="image/*" multiple onChange={pickFiles} style={{ display: 'none' }} /></label>
        <button onClick={compare} disabled={!!busy || !files.length} style={{ ...smallBtn, color: '#fff', background: files.length ? '#6B4E9E' : '#B9C6D0', border: 'none' }}>{busy === 'ai' ? '🤖 AI กำลังอ่าน…' : '🤖 AI เทียบราคา'}</button>
        <span style={{ fontSize: 11, color: '#94A0A8' }}>หรือส่งรูปทาง LINE: พิมพ์ "ใบเสนอราคา {pr.no}" แล้วส่งรูป → 'เทียบราคา'</span>
      </div>
      {files.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {files.map((fl) => (
            <div key={fl.id} style={{ position: 'relative' }} title={`${fl.by} · ${fl.source.startsWith('line') ? 'LINE' : 'เว็บ'} · ${fl.created}`}>
              <a href={fl.image} target="_blank" rel="noreferrer"><img src={fl.image} alt="ใบเสนอราคา" style={{ height: 64, borderRadius: 6, border: '1px solid #E1E5EA' }} /></a>
              <button onClick={() => delFile(fl.id)} title="ลบรูป" style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: 8, border: 'none', background: '#C24036', color: '#fff', fontSize: 10, lineHeight: '16px', cursor: 'pointer', padding: 0 }}>✕</button>
            </div>
          ))}
        </div>
      )}
      {ai && (
        <div style={{ background: '#F6F3FB', border: '1px solid #D9D2EA', borderRadius: 8, padding: '9px 12px', marginBottom: 10, fontSize: 12.5 }}>
          <div style={{ fontWeight: 700, color: '#6B4E9E' }}>🤖 AI แนะนำ: {ai.best_vendor} <span style={{ fontWeight: 400, color: '#94A0A8', fontSize: 11 }}>· {ai.files} รูป · {ai.at}</span></div>
          {ai.reason && <div style={{ color: '#3C4750', marginTop: 3 }}>{ai.reason}</div>}
          {ai.summary && <div style={{ color: '#5C6770', marginTop: 3, whiteSpace: 'pre-wrap' }}>{ai.summary}</div>}
        </div>
      )}
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>เปรียบเทียบราคาผู้ขาย</div>
      {rows.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginBottom: 8 }}>
          <thead><tr style={{ textAlign: 'left', color: '#5C6770' }}><th style={{ padding: '4px 8px' }}>ผู้ขาย</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>ราคา</th><th style={{ padding: '4px 8px' }}>เงื่อนไข</th><th style={{ padding: '4px 8px', textAlign: 'center' }}>เลือก</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #EEF1F4', background: r.chosen ? '#E2F1EA' : undefined }}>
                <td style={{ padding: '5px 8px', fontWeight: 500 }}>
                  {r.recommended ? '⭐ ' : ''}{r.vendor}
                  {r.price > 0 && r.price === best && <span style={{ marginLeft: 6, fontSize: 10, color: '#2E7D55', fontWeight: 600 }}>ถูกสุด</span>}
                  {r.ai ? <span style={{ marginLeft: 6, fontSize: 10, color: '#6B4E9E', background: '#EFEAF7', padding: '1px 6px', borderRadius: 10 }}>AI</span> : null}
                  {r.note && <div style={{ fontSize: 10.5, color: '#94A0A8', fontWeight: 400 }}>{r.note.replace(/^AI อ่านจากรูปใบเสนอราคา · /, '')}</div>}
                </td>
                <td className="num" style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600 }}>{baht(r.price)}</td>
                <td style={{ padding: '5px 8px', color: '#5C6770' }}>{r.terms || '-'}</td>
                <td style={{ padding: '5px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  {r.chosen ? <span style={{ fontSize: 11, fontWeight: 600, color: '#2E7D55' }}>✓ เลือกแล้ว</span> : <button onClick={() => choose(r.id)} style={{ fontFamily: 'inherit', fontSize: 11, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>เลือก</button>}
                  {canIssuePo && prApproved && <button onClick={() => issuePo(r)} disabled={!!busy} title="ออกใบสั่งซื้อจากร้านนี้ + ส่งขออนุมัติ PO ทาง LINE" style={{ marginLeft: 6, fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#fff', background: '#C0852C', border: 'none', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>→ ออก PO</button>}
                  <button onClick={() => del(r.id)} style={{ marginLeft: 6, border: 'none', background: 'none', color: '#C24036', cursor: 'pointer' }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input style={{ ...prField, flex: 1.4, padding: '6px 9px', fontSize: 12.5 }} placeholder="ชื่อผู้ขาย" value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} />
        <MoneyInput style={{ ...prField, width: 120, padding: '6px 9px', fontSize: 12.5 }} placeholder="ราคา" value={f.price} onChange={(v) => setF({ ...f, price: v })} />
        <input style={{ ...prField, flex: 1, padding: '6px 9px', fontSize: 12.5 }} placeholder="เงื่อนไข (เครดิต/ส่งของ)" value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} />
        <button onClick={add} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>+ เพิ่ม</button>
      </div>
      {err && <div style={{ fontSize: 12, color: '#C24036', marginTop: 6 }}>{err}</div>}
      {canIssuePo && !prApproved && rows.some((r) => r.chosen) && <div style={{ fontSize: 11.5, color: '#B7791F', marginTop: 8 }}>เลือกร้านแล้ว — ปุ่ม “ออก PO” จะขึ้นเมื่อ PR นี้อนุมัติครบ</div>}
    </div>
  )
}

export default function Procurement({ houseCode }: { houseCode?: string }) {
  const [tab, setTab] = useState('pr')
  const [quoteFor, setQuoteFor] = useState<number | null>(null)
  const [docPr, setDocPr] = useState<ApiPR | null>(null)
  const [docPo, setDocPo] = useState<ApiPO | null>(null)
  const [docWht, setDocWht] = useState<ApiPayment | null>(null)
  const [docVoucher, setDocVoucher] = useState<ApiPayment | null>(null)
  const [docReceive, setDocReceive] = useState<ApiPO | null>(null)
  const { data, user, addPr, addPO, setPOStatus, addPayment, addVendor, updateVendor, reloadData } = useApp()
  const isAdmin = user?.role === 'admin'
  // ขั้นตอนจัดซื้อ: ใครเป็นผู้ตรวจสอบใบขอซื้อ (ตั้งที่หน้า ผู้ใช้งาน) — ผู้ตรวจสอบ/บัญชี/แอดมิน กด "ตรวจแล้ว ออก PR" ได้
  const [flow, setFlow] = useState<{ checker: { id: number; name: string; line: boolean } | null } | null>(null)
  useEffect(() => { api.get<{ checker: { id: number; name: string; line: boolean } | null }>('/procurement/flow').then(setFlow).catch(() => {}) }, [])
  const canCheck = user?.role === 'admin' || user?.role === 'accounting' || (!!flow?.checker && flow.checker.id === user?.id)
  const canIssuePo = user?.role === 'admin' || user?.role === 'accounting' || !!user?.isManager || (!!flow?.checker && flow.checker.id === user?.id)
  const [checkBusy, setCheckBusy] = useState<number | null>(null)
  const notifyLabel = (r: ApiPR) => {
    const st = r.check_notify || ''
    if (st.startsWith('sent')) return { t: '📨 ส่งการ์ด LINE แล้ว ' + st.slice(5, 16), c: '#2E7D55' }
    if (st === 'no_line') return { t: `⚠ ${flow?.checker?.name || 'ผู้ตรวจสอบ'} ยังไม่ผูก LINE`, c: '#C24036' }
    if (st === 'no_token') return { t: '⚠ ยังไม่ตั้ง LINE token', c: '#C24036' }
    if (st === 'failed') return { t: '⚠ ส่ง LINE ไม่สำเร็จ', c: '#C24036' }
    return null
  }
  const sendDoc = async (r: ApiPR) => {
    try { const x = await api.post<{ ok: boolean; message: string }>('/purchase-requests/' + r.id + '/send-doc', {}); alert((x.ok ? '✓ ' : '✗ ') + x.message); await reloadData('prs', '/purchase-requests') } catch (e) { alert((e as Error).message) }
  }
  const docLabel = (r: ApiPR) => {
    const st = r.doc_sent || ''
    if (st.startsWith('sent')) return { t: '📄 ส่งใบเข้า LINE แล้ว ' + st.slice(5, 16), c: '#2E7D55' }
    if (!st) return null
    if (st.startsWith('render_failed')) return { t: '⚠ สร้างรูปใบไม่สำเร็จ', c: '#C24036', title: st }
    return { t: '⚠ ' + ({ no_recipients: 'ยังไม่ตั้งผู้รับใบ PR', no_line: 'ผู้รับยังไม่ผูก LINE', no_token: 'ยังไม่ตั้ง LINE token', no_public_url: 'ส่งข้อความแทนรูป (ไม่มีลิงก์สาธารณะ)', push_failed: 'ส่ง LINE ไม่สำเร็จ' } as Record<string, string>)[st] || st, c: '#B7791F' }
  }
  const resendCheck = async (r: ApiPR) => {
    try { const x = await api.post<{ ok: boolean; message: string }>('/purchase-requests/' + r.id + '/notify-check', {}); alert((x.ok ? '✓ ' : '✗ ') + x.message); await reloadData('prs', '/purchase-requests') } catch (e) { alert((e as Error).message) }
  }
  const checkPr = async (r: ApiPR, ok: boolean) => {
    let note = ''
    if (!ok) { const n = prompt(`ส่ง ${r.no} กลับให้ ${r.by} แก้ไข — เหตุผล:`); if (n === null) return; note = n }
    else if (!confirm(`ยืนยันว่าตรวจสอบ ${r.no} แล้ว → ระบบจะออก PR และส่งขออนุมัติทาง LINE ให้ผู้บริหารทันที`)) return
    setCheckBusy(r.id)
    try { await api.post('/purchase-requests/' + r.id + '/check', { ok, note }); await reloadData('prs', '/purchase-requests') } catch (e) { alert((e as Error).message) } finally { setCheckBusy(null) }
  }
  const clearProcurement = async () => {
    if (!window.confirm('ล้างข้อมูลจัดซื้อทั้งหมด (ใบขอซื้อ PR + ใบสั่งซื้อ PO + ใบเทียบราคา + การตรวจรับ + รายจ่ายที่มาจาก PO)?\nข้อมูลนี้จะถูกลบถาวร (ราคากลางวัสดุ/ผู้ขาย/รายจ่ายอื่นไม่ถูกลบ)')) return
    if (!window.confirm('ยืนยันอีกครั้ง — ลบข้อมูล PR/PO เดิมทั้งหมดออกจริงหรือไม่?')) return
    try {
      const r = await api.post<{ counts: Record<string, number> }>('/procurement/clear', {})
      await Promise.all([reloadData('prs', '/purchase-requests'), reloadData('purchaseOrders', '/purchase-orders'), reloadData('payments', '/payments'), reloadData('expenses', '/expenses')])
      const c = r.counts || {}
      alert(`ล้างข้อมูลจัดซื้อแล้ว\n• ใบขอซื้อ (PR) ${c.purchase_requests || 0}\n• ใบสั่งซื้อ (PO) ${c.purchase_orders || 0}\n• ใบเทียบราคา ${c.quotes || 0}\n• การตรวจรับ ${c.goods_receipts || 0}\n• รายจ่ายจาก PO ${c.expenses || 0}`)
    } catch (e) { alert('ล้างข้อมูลไม่สำเร็จ: ' + (e as Error).message) }
  }
  // อนุมัติ/ปฏิเสธ PR — แสดงข้อความถ้าถูกกติกากันโกงบล็อก (เช่น อนุมัติใบตัวเอง / ต้องอนุมัติ 2 ชั้น)
  const purchaseOrders = data.purchaseOrders || []
  const vendors = data.vendors || []
  const materialPrices = data.materialPrices || []
  // เตือนราคาแพง: อ่านเกณฑ์ % จากกติกาควบคุม (ปรับได้ในหน้าตรวจสอบ)
  const [warnPct, setWarnPct] = useState(10)
  useEffect(() => { api.get<Record<string, number>>('/controls').then((c) => setWarnPct(Number(c.overprice_warn_pct ?? 10))).catch(() => {}) }, [])
  // ป้ายราคากลาง + เตือนถ้าราคาต่อหน่วยที่กรอกสูงกว่าราคากลาง
  const priceHint = (desc: string, price: string) => {
    const m = matchMaterial(desc, materialPrices)
    if (!m) return null
    const mp = m.mp
    const p = Number(String(price).replace(/,/g, '')) || 0
    const over = warnPct > 0 && p > 0 && p > mp.central * (1 + warnPct / 100)
    const overPct = mp.central > 0 ? Math.round(((p - mp.central) / mp.central) * 100) : 0
    return (
      <div style={{ fontSize: 11, margin: '1px 2px 2px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ color: '#94A0A8' }}>ราคากลาง <b style={{ color: '#5C6770' }}>{baht(mp.central)}</b>{mp.unit ? `/${mp.unit}` : ''} · เคยซื้อ {mp.po_count || '–'} ครั้ง</span>
        {over
          ? <span style={{ fontWeight: 700, color: '#C24036', background: '#FBEAE7', borderRadius: 6, padding: '1px 8px' }}>⚠ สูงกว่าราคากลาง {overPct}%</span>
          : p > 0 && p <= mp.central ? <span style={{ color: '#2E7D55', fontWeight: 600 }}>✓ ไม่เกินราคากลาง</span> : null}
      </div>
    )
  }

  // payment + vendor inline forms
  const [addingPay, setAddingPay] = useState(false)
  const [payForm, setPayForm] = useState({ payee: '', type: 'ภงด.53', gross: '', wht_rate: '3', house_code: '', note: '', po_id: '', po_no: '' })
  // ยอดค้างจ่ายจริงจาก PO เครดิต (มูลค่า − ที่จ่ายผูกใบแล้ว)
  interface PayableRow { po_id: number; no: string; vendor: string; date: string; due_date?: string; house_code?: string; amount: number; paid: number; remaining: number; overdue: boolean; status: string }
  const [payableRows, setPayableRows] = useState<PayableRow[] | null>(null)
  // เช็คยอดอัตโนมัติ: เจ้าหนี้ตามบัญชี (2010) ต้องเท่ากับยอดค้างจ่ายรวมจากใบ PO
  interface PayableCheck { gl_2010: number; payable_remaining: number; diff: number; ok: boolean }
  const [apCheck, setApCheck] = useState<PayableCheck | null>(null)
  const loadPayables = () => {
    api.get<PayableRow[]>('/payables').then(setPayableRows).catch(() => setPayableRows([]))
    api.get<PayableCheck>('/payables/check').then(setApCheck).catch(() => setApCheck(null))
  }
  useEffect(() => { if (tab === 'payable') loadPayables() }, [tab])
  // กดจ่ายจากแถวยอดค้าง → เปิดฟอร์มจ่ายเงินพร้อมข้อมูลครบ (ซื้อของไม่หัก ณ ที่จ่าย)
  const payPo = (r: PayableRow) => {
    setPayForm({ payee: r.vendor, type: '-', gross: String(r.remaining), wht_rate: '0', house_code: r.house_code || '', note: 'ชำระ ' + r.no, po_id: String(r.po_id), po_no: r.no })
    setTab('pay'); setAddingPay(true)
  }
  const [payErr, setPayErr] = useState('')
  const submitPay = async () => {
    if (!payForm.payee.trim() || !payForm.gross) { setPayErr('กรอกผู้รับเงินและจำนวนเงิน'); return }
    setPayErr('')
    try {
      await addPayment({ payee: payForm.payee, type: payForm.type, gross: unMoney(payForm.gross), wht_rate: Number(payForm.wht_rate), house_code: payForm.house_code, note: payForm.note, po_id: payForm.po_id ? Number(payForm.po_id) : undefined })
      setAddingPay(false); setPayForm({ payee: '', type: 'ภงด.53', gross: '', wht_rate: '3', house_code: '', note: '', po_id: '', po_no: '' })
      if (payableRows) loadPayables()
    } catch (e) { setPayErr((e as Error).message) }
  }
  const [addingVendor, setAddingVendor] = useState(false)
  const [vendorForm, setVendorForm] = useState({ name: '', kind: 'ผู้ขาย', category: '', type: 'นิติบุคคล', tax_id: '', address: '', credit_days: '' })
  const [editingVendorId, setEditingVendorId] = useState<number | null>(null) // null = เพิ่มใหม่ · id = แก้ไขรายเดิม
  // หมวดสินค้า/งานที่ใช้บ่อย (พิมพ์เองได้ ไม่จำกัดแค่นี้)
  const VENDOR_CATS = ['วัสดุก่อสร้าง', 'ไฟฟ้า', 'ประปา', 'สี', 'เหล็ก', 'ไม้', 'กระเบื้อง', 'สุขภัณฑ์', 'หลังคา', 'อลูมิเนียม/กระจก', 'ฮาร์ดแวร์/เครื่องมือ', 'งานปูน/โครงสร้าง', 'งานหลังคา', 'งานไฟฟ้า', 'งานประปา', 'งานฝ้า/ผนัง', 'งานสี', 'งานกระเบื้อง', 'ขนส่ง', 'อื่นๆ']
  const openEditVendor = (v: ApiVendor) => {
    setVendorForm({ name: v.name, kind: v.kind === 'ผู้รับเหมา' ? 'ผู้รับเหมา' : 'ผู้ขาย', category: v.category || '', type: v.type || 'นิติบุคคล', tax_id: v.tax_id || '', address: v.address || '', credit_days: String(v.credit_days || '') })
    setEditingVendorId(v.id); setAddingVendor(true)
  }
  const [vendorKindFilter, setVendorKindFilter] = useState<'all' | 'ผู้ขาย' | 'ผู้รับเหมา'>('all')
  const kindOf = (v: { kind?: string }) => (v.kind === 'ผู้รับเหมา' ? 'ผู้รับเหมา' : 'ผู้ขาย') // ว่าง = ผู้ขาย (ข้อมูลเก่า)
  const blankVendorForm = { name: '', kind: 'ผู้ขาย', category: '', type: 'นิติบุคคล', tax_id: '', address: '', credit_days: '' }
  const submitVendor = async () => {
    if (!vendorForm.name.trim()) return
    const body = { ...vendorForm, credit_days: Number(vendorForm.credit_days) || 0 }
    try {
      if (editingVendorId != null) await updateVendor(editingVendorId, body)
      else await addVendor(body)
      setAddingVendor(false); setEditingVendorId(null); setVendorForm(blankVendorForm)
    } catch { /* ignore */ }
  }
  const houses = data.houses
  const makePoFromPr = async (r: ApiPR) => {
    // carry the PR's linked house to the PO (fallback: match by name)
    const code = r.house_code || houses.find((x) => x.code === r.house || x.name === r.house)?.code || ''
    // auto-fill ผู้ขาย+ราคา จากใบเทียบราคาที่ "เลือกแล้ว" (ถ้ามี) — ราคาที่ต่อรองได้จริง
    let vendor = ''
    let amount = String(r.amount)
    let payType = 'cash'
    let creditDays = ''
    try {
      const quotes = await api.get<Quote[]>('/purchase-requests/' + r.id + '/quotes')
      const chosen = quotes.find((qq) => qq.chosen)
      if (chosen) {
        vendor = chosen.vendor
        if (chosen.price > 0) amount = String(chosen.price)
        // ถ้าผู้ขายรายนี้มีเครดิตตั้งไว้ ให้ตั้งเป็นเครดิตอัตโนมัติ
        const v = vendors.find((x) => x.name === chosen.vendor)
        if (v && (v.credit_days || 0) > 0) { payType = 'credit'; creditDays = String(v.credit_days) }
      }
    } catch { /* ไม่มีใบเทียบราคา ก็ปล่อยว่างให้เลือกเอง */ }
    setPoForm({ vendor, item: r.item, amount, pr_no: r.no, payment_type: payType, credit_days: creditDays, house_code: code, vat_amount: '', tax_invoice_no: '' })
    setPoItems((r.items || []).map((it) => ({ desc: it.desc, qty: it.qty, unit: it.unit, price: it.price })))
    setPoImg(r.image || ''); setTab('po'); setAddingPo(true)
  }

  // inline PO create form
  const [addingPo, setAddingPo] = useState(false)
  const [poForm, setPoForm] = useState({ vendor: '', item: '', amount: '', pr_no: '', payment_type: 'cash', credit_days: '', house_code: houseCode || '', vat_amount: '', tax_invoice_no: '' })
  const [poHasVat, setPoHasVat] = useState(false)
  // รายการที่สั่ง (ชื่อ/จำนวน/ราคา) ติดไปกับ PO — ใช้เทียบใบส่งของตอนตรวจรับ (มาจาก PR ถ้าออก PO จาก PR)
  const [poItems, setPoItems] = useState<{ desc: string; qty: number; unit: string; price: number }[]>([])
  // picking a vendor auto-fills its default credit terms (จัดซื้อแก้ได้)
  const pickVendor = (name: string) => {
    const v = vendors.find((x) => x.name === name)
    if (v && (v.credit_days || 0) > 0) setPoForm((f) => ({ ...f, vendor: name, payment_type: 'credit', credit_days: String(v.credit_days) }))
    else setPoForm((f) => ({ ...f, vendor: name }))
    // ผู้ขายจด VAT → ติ๊ก "มีใบกำกับภาษี" + คำนวณ VAT 7/107 จากยอดให้อัตโนมัติ (แก้ตามใบจริงได้)
    if (v?.vat_registered) {
      setPoHasVat(true)
      setPoForm((f) => ({ ...f, vat_amount: String(Math.round(((Number(f.amount.replace(/,/g, '')) || 0) * 7 / 107) * 100) / 100) }))
    }
  }
  const [poImg, setPoImg] = useState('')
  const [poErr, setPoErr] = useState('')
  const pickPoImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) { setPoErr('ต้องเป็นรูปภาพ'); return }
    const r = new FileReader(); r.onload = () => setPoImg(String(r.result)); r.readAsDataURL(f)
  }
  const submitPo = async () => {
    if (!poForm.vendor.trim() || !poForm.item.trim()) { setPoErr('กรุณากรอกผู้ขายและรายการ'); return }
    setPoErr('')
    try {
      await addPO({ vendor: poForm.vendor, item: poForm.item, amount: Number(poForm.amount.replace(/,/g, '')) || 0, pr_no: poForm.pr_no, image: poImg || undefined, payment_type: poForm.payment_type, credit_days: Number(poForm.credit_days) || 0, house_code: poForm.house_code, items: poItems.length ? poItems : undefined, vat_amount: poHasVat ? unMoney(poForm.vat_amount) : 0, tax_invoice_no: poHasVat ? poForm.tax_invoice_no : '' })
      setAddingPo(false); setPoForm({ vendor: '', item: '', amount: '', pr_no: '', payment_type: 'cash', credit_days: '', house_code: houseCode || '', vat_amount: '', tax_invoice_no: '' }); setPoHasVat(false); setPoImg(''); setPoItems([])
    } catch (e) { setPoErr((e as Error).message) }
  }

  // inline PR create form (with optional product image) — หลายรายการในใบเดียว
  const [addingPr, setAddingPr] = useState(false)
  const [prForm, setPrForm] = useState({ house_code: houseCode || '', category: '' })
  const emptyLine = { desc: '', qty: '', unit: '', price: '' }
  const [prLines, setPrLines] = useState<{ desc: string; qty: string; unit: string; price: string }[]>([{ ...emptyLine }])
  const lineAmt = (l: { qty: string; price: string }) => { const q = Number(l.qty.replace(/,/g, '')) || 0; const p = Number(l.price.replace(/,/g, '')) || 0; return q > 0 ? q * p : p }
  const prGrand = prLines.reduce((s, l) => s + lineAmt(l), 0)
  const [prImgs, setPrImgs] = useState<string[]>([])
  const [prErr, setPrErr] = useState('')
  const [prBusy, setPrBusy] = useState(false)
  const pickPrImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setPrErr('')
    for (const f of files) {
      if (prImgs.length >= 3) { setPrErr('แนบได้สูงสุด 3 รูป'); break }
      if (!f.type.startsWith('image/')) { setPrErr('ต้องเป็นไฟล์รูปภาพ'); continue }
      if (f.size > 8 * 1024 * 1024) { setPrErr('รูปใหญ่เกิน 8MB'); continue }
      const r = new FileReader()
      r.onload = () => setPrImgs((cur) => cur.length >= 3 ? cur : [...cur, String(r.result)])
      r.readAsDataURL(f)
    }
  }
  const submitPr = async () => {
    const items = prLines.filter((l) => l.desc.trim()).map((l) => ({ desc: l.desc.trim(), qty: Number(l.qty.replace(/,/g, '')) || 0, unit: l.unit, price: Number(l.price.replace(/,/g, '')) || 0 }))
    if (!items.length) { setPrErr('กรุณากรอกอย่างน้อย 1 รายการ'); return }
    setPrBusy(true); setPrErr('')
    try {
      await addPr({ house_code: prForm.house_code, category: prForm.category, items, images: prImgs })
      setAddingPr(false); setPrForm({ house_code: houseCode || '', category: '' }); setPrLines([{ ...emptyLine }]); setPrImgs([])
    } catch (e) { setPrErr((e as Error).message) } finally { setPrBusy(false) }
  }

  // procurement is finance-only (admin/accounting). Others get a locked page.
  if (data.prs === null) {
    return (
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        <div style={{ background: '#fff', border: '1px dashed #CFD8DF', borderRadius: 14, padding: '54px 40px', textAlign: 'center' }}>
          <div style={{ width: 50, height: 50, borderRadius: 12, background: '#F3F5F7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94A0A8" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1C2730' }}>ไม่มีสิทธิ์เข้าถึงจัดซื้อ/จ่าย</div>
          <div style={{ fontSize: 13, color: '#5C6770', marginTop: 6 }}>ใบขอซื้อเปิดให้ <b>หน้างาน (โฟร์แมน)</b> ด้วย · ส่วนเงินจริง (PO/จ่าย/ภาษี) เฉพาะ <b>ผู้ดูแล</b> และ <b>บัญชี</b></div>
        </div>
      </div>
    )
  }

  const prs = data.prs
  const payments = data.payments || []
  // การ์ดภาษี คำนวณจากข้อมูลจ่ายเงินจริง (ไม่ใช่ค่าตัวอย่างที่ค้างในระบบอีกต่อไป)
  const whtByType = (t: string) => payments.filter((p) => p.type === t).reduce((s, p) => s + (p.wht || 0), 0)
  // ภาษีซื้อจากใบกำกับจริงที่กรอกไว้ต่อใบ (ให้ตรงกับหน้า สรุปภาษี) — ไม่เดา 7/107 จากทุกใบอีก
  const inputVat = Math.round((data.expenses || []).reduce((s, e) => s + (e.vat_amount || 0), 0))
  const taxCardsLive = [
    { label: 'ภงด.3 (หัก ณ ที่จ่าย-บุคคล)', value: baht(whtByType('ภงด.3')), sub: 'ยอดหัก ณ ที่จ่ายสะสม · นำส่งภายในวันที่ 7 ของเดือนถัดไป', accent: '#30506A' },
    { label: 'ภงด.53 (หัก ณ ที่จ่าย-นิติบุคคล)', value: baht(whtByType('ภงด.53')), sub: 'ยอดหัก ณ ที่จ่ายสะสม · นำส่งภายในวันที่ 7 ของเดือนถัดไป', accent: '#30506A' },
    { label: 'ภาษีซื้อ (ตามใบกำกับ)', value: baht(inputVat), sub: 'จากใบกำกับภาษีที่กรอกไว้จริง · เครดิตภาษีได้', accent: '#2E7D55' },
  ]
  const [q, setQ] = useState('')
  const ql = q.trim().toLowerCase()
  // house-first: ถ้าเปิดจากในบ้าน → แสดงเฉพาะจัดซื้อของบ้านนั้น
  const prHouseOf = (r: { house_code?: string; house?: string }) => r.house_code || houses.find((x) => x.code === r.house || x.name === r.house)?.code || ''
  const prList = (prs || []).filter((r) => (!houseCode || prHouseOf(r) === houseCode) && `${r.no} ${r.house} ${r.item} ${r.by} ${r.status}`.toLowerCase().includes(ql))
  const poList = purchaseOrders.filter((r) => (!houseCode || r.house_code === houseCode) && `${r.no} ${r.vendor} ${r.item} ${r.status}`.toLowerCase().includes(ql))
  // โฟร์แมน/หน้างาน: เข้าได้เฉพาะแท็บใบขอซื้อ (คีย์ว่าจะซื้ออะไร) — แท็บเงินจริงเป็นของบัญชี
  const financeOk = user?.role === 'admin' || user?.role === 'accounting'
  const baseTabs = financeOk ? procurementTabs : procurementTabs.filter((t) => t.id === 'pr')
  const shownTabs = houseCode ? baseTabs.filter((t) => t.id === 'pr' || t.id === 'po') : baseTabs
  const searchBox = <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเลขที่/ผู้ขาย/รายการ" style={{ ...prField, width: 220, padding: '6px 10px', fontSize: 12.5 }} />

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 2, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 11, padding: '6px 8px', flexWrap: 'wrap' }}>
        {shownTabs.map((t) => {
          const active = tab === t.id
          return (
            <div key={t.id} onClick={() => setTab(t.id)} style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: active ? '#fff' : '#5C6770', background: active ? '#30506A' : 'transparent', padding: '7px 14px', borderRadius: 7, cursor: 'pointer' }}>{t.label}</div>
          )
        })}
        {isAdmin && !houseCode && <button onClick={clearProcurement} title="ลบข้อมูลจัดซื้อเดิมทั้งหมด (PR/PO) เพื่อเริ่มใช้ระบบใหม่" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#C24036', background: '#fff', border: '1px solid #EDD3CE', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>🗑 ล้างข้อมูลจัดซื้อ (PR/PO)</button>}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        {/* PR */}
        {tab === 'pr' && (
          <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid #EEF1F4' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>ใบขอซื้อทั้งหมด</span>
            {searchBox}
            <button onClick={() => setAddingPr((v) => !v)} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>+ ขอซื้อ (PR)</button>
          </div>
          {addingPr && (
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF1F4', background: '#FAFBFC' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10, marginBottom: 10 }}>
                {houseCode
                  ? <div style={{ ...prField, background: '#F7F9FB', color: '#5C6770', display: 'flex', alignItems: 'center' }}>🏠 {houses.find((h) => h.code === houseCode)?.name || houseCode}</div>
                  : <select style={prField} value={prForm.house_code} onChange={(e) => setPrForm({ ...prForm, house_code: e.target.value })}>
                      <option value="">— เลือกบ้าน —</option>
                      {houses.map((h) => <option key={h.id} value={h.code}>{h.name} ({h.code})</option>)}
                    </select>}
                <select style={prField} value={prForm.category} onChange={(e) => setPrForm({ ...prForm, category: e.target.value })}>
                  <option value="">— หมวด —</option>
                  {catsOfHouse(houses.find((h) => h.code === (houseCode || prForm.house_code))).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              {/* หลายรายการในใบเดียว */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2.4fr 0.7fr 0.7fr 1fr 1fr 28px', gap: 8, fontSize: 11, color: '#94A0A8', padding: '0 2px' }}>
                  <span>รายการสินค้า</span><span style={{ textAlign: 'right' }}>จำนวน</span><span>หน่วย</span><span style={{ textAlign: 'right' }}>ราคา/หน่วย</span><span style={{ textAlign: 'right' }}>รวม</span><span />
                </div>
                {prLines.map((l, i) => (
                  <div key={i}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2.4fr 0.7fr 0.7fr 1fr 1fr 28px', gap: 8, alignItems: 'center' }}>
                      <input style={{ ...prField, padding: '7px 9px' }} placeholder={`รายการที่ ${i + 1}`} value={l.desc} onChange={(e) => setPrLines((ls) => ls.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))} />
                      <input style={{ ...prField, padding: '7px 9px', textAlign: 'right' }} inputMode="numeric" placeholder="0" value={l.qty} onChange={(e) => setPrLines((ls) => ls.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
                      <input style={{ ...prField, padding: '7px 9px' }} placeholder="หน่วย" value={l.unit} onChange={(e) => setPrLines((ls) => ls.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} />
                      <MoneyInput style={{ ...prField, padding: '7px 9px', textAlign: 'right' }} placeholder="0" value={l.price} onChange={(v) => setPrLines((ls) => ls.map((x, j) => j === i ? { ...x, price: v } : x))} />
                      <div className="num" style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 600, color: '#1C2730', paddingRight: 4 }}>{baht(lineAmt(l))}</div>
                      <button onClick={() => setPrLines((ls) => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)} title="ลบรายการ" style={{ border: 'none', background: 'none', color: prLines.length > 1 ? '#C24036' : '#CBD3DA', cursor: prLines.length > 1 ? 'pointer' : 'default', fontSize: 15 }}>✕</button>
                    </div>
                    {priceHint(l.desc, l.price)}
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', marginTop: 2 }}>
                  <button onClick={() => setPrLines((ls) => [...ls, { ...emptyLine }])} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500, color: '#30506A', background: '#fff', border: '1px dashed #B9C6D0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>+ เพิ่มรายการ</button>
                  <div style={{ marginLeft: 'auto', fontSize: 13, color: '#5C6770' }}>รวมทั้งใบ <b className="num" style={{ fontSize: 16, color: '#1C2730' }}>{baht(prGrand)}</b></div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                <label className="hov-f3f5f7" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 500, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                  {prImgs.length ? `เพิ่มรูป (${prImgs.length}/3)` : 'แนบรูปสินค้า (สูงสุด 3)'}
                  <input type="file" accept="image/*" multiple onChange={pickPrImage} disabled={prImgs.length >= 3} style={{ display: 'none' }} />
                </label>
                {prImgs.map((im, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={im} alt={'รูป ' + (i + 1)} style={{ height: 44, borderRadius: 6, border: '1px solid #E1E5EA' }} />
                    <button onClick={() => setPrImgs((cur) => cur.filter((_, j) => j !== i))} title="ลบรูปนี้" style={{ position: 'absolute', top: -7, right: -7, width: 18, height: 18, borderRadius: 9, border: 'none', background: '#C24036', color: '#fff', fontSize: 11, lineHeight: '18px', cursor: 'pointer', padding: 0 }}>✕</button>
                  </div>
                ))}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button onClick={() => setAddingPr(false)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>ยกเลิก</button>
                  <button onClick={submitPr} disabled={prBusy} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>{prBusy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
                </div>
              </div>
              {prErr && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 8 }}>{prErr}</div>}
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
                <th style={{ ...th, padding: '9px 18px' }}>เลขที่ PR</th>
                <th style={th}>วันที่</th>
                <th style={th}>บ้าน</th>
                <th style={th}>ผู้ขอ</th>
                <th style={th}>รายการ</th>
                <th style={{ ...th, textAlign: 'right' }}>จำนวนเงิน</th>
                <th style={{ ...th, padding: '9px 18px', textAlign: 'center' }}>สถานะ / อนุมัติ</th>
              </tr>
            </thead>
            <tbody>
              {prList.map((r) => (
                <Fragment key={r.id}>
                <tr className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td className="num" style={{ ...td, padding: '10px 18px', fontWeight: 600, fontFamily: 'monospace' }}>{r.no}</td>
                  <td className="num" style={{ ...td, color: '#5C6770' }}>{r.date}</td>
                  <td style={{ ...td, fontWeight: 500 }}>
                    <div>{r.house || '—'}</div>
                    {r.category && <div style={{ fontSize: 11, color: '#94A0A8' }}>{catLabel(r.category)}</div>}
                  </td>
                  <td style={{ ...td, color: '#5C6770' }}>{r.by}</td>
                  <td style={{ ...td, color: '#3C4750' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {r.image && <img src={r.image} alt="สินค้า" style={{ width: 30, height: 30, borderRadius: 5, objectFit: 'cover', border: '1px solid #E1E5EA', flexShrink: 0 }} />}
                      <span style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.item}</span>
                      {r.items && r.items.length > 1 && <span style={{ fontSize: 10.5, fontWeight: 600, color: '#30506A', background: '#E2E9EF', padding: '1px 7px', borderRadius: 20, flexShrink: 0 }}>{r.items.length} รายการ</span>}
                    </div>
                  </td>
                  <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{baht(r.amount)}</td>
                  <td style={{ ...td, padding: '10px 18px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                      {r.status === 'รอตรวจสอบ' ? (
                        <>
                          <span title={r.checked_by ? '' : `รอ ${flow?.checker?.name || 'ผู้ตรวจสอบ'} ตรวจก่อนออก PR`} style={{ fontSize: 11, fontWeight: 600, color: '#30506A', background: '#E2E9EF', padding: '2px 9px', borderRadius: 20 }}>🔍 รอตรวจสอบ{flow?.checker ? ` · ${flow.checker.name}` : ''}</span>
                          {(() => { const n = notifyLabel(r); return n ? <span style={{ fontSize: 10.5, color: n.c }}>{n.t}</span> : null })()}
                          <button onClick={() => resendCheck(r)} title="ส่งการ์ดตรวจสอบให้ผู้ตรวจสอบทาง LINE อีกครั้ง (บอกสาเหตุถ้าส่งไม่ได้)" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 10.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '3px 8px', cursor: 'pointer' }}>↻ ส่ง LINE อีกครั้ง</button>
                          {canCheck && <>
                            <button onClick={() => checkPr(r, true)} disabled={checkBusy === r.id} title="ตรวจแล้ว → ออก PR + ส่งขออนุมัติทาง LINE" style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>✓ ตรวจแล้ว ออก PR</button>
                            <button onClick={() => checkPr(r, false)} disabled={checkBusy === r.id} style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#C24036', background: '#FBEEEC', border: 'none', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>↩ ส่งกลับ</button>
                          </>}
                        </>
                      ) : r.status === 'ส่งกลับแก้ไข' ? (
                        <span title={r.check_note || ''} style={{ fontSize: 11, fontWeight: 600, color: '#C24036', background: '#FBEEEC', padding: '2px 9px', borderRadius: 20 }}>↩ ส่งกลับแก้ไข{r.checked_by ? ` · ${r.checked_by}` : ''}{r.check_note ? ` — ${r.check_note}` : ''}</span>
                      ) : (
                        <ApprovalBar docType="pr" docId={r.id} approval={r.approval} onDone={() => reloadData('prs', '/purchase-requests')} />
                      )}
                      {r.checked_by && r.status !== 'ส่งกลับแก้ไข' && <span style={{ fontSize: 10, color: '#94A0A8' }}>ตรวจโดย {r.checked_by}</span>}
                      {(r.approval?.done || r.status === 'อนุมัติ') && (() => {
                        // แถบขั้นตอนหลังอนุมัติ: เทียบราคา → PO → PO อนุมัติ
                        const steps = [
                          { t: `เทียบราคา${r.quote_files ? ` (${r.quote_files} รูป)` : ''}${r.chosen_vendor ? ' ⭐' + r.chosen_vendor : ''}`, on: !!r.quote_files || !!r.chosen_vendor },
                          { t: r.po_no ? `PO ${r.po_no}` : 'รอออก PO', on: !!r.po_no },
                          { t: r.po_approved ? 'PO อนุมัติแล้ว' : 'รออนุมัติ PO', on: !!r.po_approved },
                        ]
                        return <div style={{ width: '100%', display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap', fontSize: 10 }}>
                          {steps.map((st, i) => <span key={i} style={{ padding: '1px 7px', borderRadius: 10, background: st.on ? '#E2F1EA' : '#F1F4F6', color: st.on ? '#2E7D55' : '#94A0A8', fontWeight: 600 }}>{st.on ? '✓ ' : ''}{st.t}</span>)}
                        </div>
                      })()}
                      {(r.approval?.done || r.status === 'อนุมัติ') && (() => { const d = docLabel(r); return <>
                        {d && <span title={d.title || ''} style={{ fontSize: 10.5, color: d.c }}>{d.t}</span>}
                        <button onClick={() => sendDoc(r)} title="สร้างรูปใบ PR แล้วส่งเข้า LINE ของผู้รับที่ตั้งไว้ (อีกครั้ง)" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 10.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '3px 8px', cursor: 'pointer' }}>📤 ส่งใบเข้า LINE</button>
                      </> })()}
                      <button onClick={() => setQuoteFor(quoteFor === r.id ? null : r.id)} className="hov-f3f5f7" title="เปรียบเทียบราคาผู้ขาย" style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 500, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>⚖ เทียบราคา</button>
                      <button onClick={() => setDocPr(r)} className="hov-f3f5f7" title="ดู/พิมพ์ใบ PR" style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 500, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>🖨 ใบ PR</button>
                      {isAdmin && <button onClick={async () => { if (!confirm(`ลบใบขอซื้อ ${r.no} (${r.item})?\nใบเทียบราคา/รูปใบเสนอราคาของใบนี้จะถูกลบด้วย`)) return; try { await api.del('/purchase-requests/' + r.id); await reloadData('prs', '/purchase-requests') } catch (e) { alert((e as Error).message) } }} title="ลบใบขอซื้อ (ผู้ดูแล)" style={{ fontFamily: 'inherit', fontSize: 11.5, color: '#C24036', background: '#fff', border: '1px solid #EDD3CE', borderRadius: 7, padding: '4px 8px', cursor: 'pointer' }}>🗑</button>}
                      {(r.approval?.done || r.status === 'อนุมัติ') && <button onClick={() => makePoFromPr(r)} title="สร้างใบสั่งซื้อจาก PR นี้" style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 500, color: '#fff', background: '#C0852C', border: 'none', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>→ PO</button>}
                    </div>
                  </td>
                </tr>
                {quoteFor === r.id && (
                  <tr style={{ background: '#F7F9FB' }}>
                    <td colSpan={7} style={{ padding: '10px 18px' }}>{financeOk || canCheck ? <QuotePanel pr={r} canIssuePo={canIssuePo} onIssued={() => { reloadData('purchaseOrders', '/purchase-orders'); reloadData('prs', '/purchase-requests') }} /> : <div style={{ fontSize: 12, color: '#94A0A8' }}>ใบเทียบราคา — จัดการโดยฝ่ายบัญชี/จัดซื้อ (ส่งรูปใบเสนอราคาทาง LINE ได้: พิมพ์ "ใบเสนอราคา {r.no}" แล้วส่งรูป)</div>}</td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
          </>
        )}

        {/* PO */}
        {tab === 'po' && (
          <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid #EEF1F4' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>ใบสั่งซื้อทั้งหมด</span>
            {searchBox}
            <button onClick={() => setAddingPo((v) => !v)} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>+ เพิ่ม PO</button>
          </div>
          {addingPo && (
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF1F4', background: '#FAFBFC' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.6fr 1fr 1fr', gap: 10 }}>
                <select style={prField} value={poForm.vendor} onChange={(e) => pickVendor(e.target.value)}>
                  <option value="">เลือกผู้ขาย/ผู้รับเหมา *</option>
                  <optgroup label="🏪 ผู้ขาย (วัสดุ/ของ)">
                    {vendors.filter((v) => kindOf(v) === 'ผู้ขาย').map((v) => <option key={v.id} value={v.name}>{v.name}{v.credit_days ? ` (เครดิต ${v.credit_days} วัน)` : ''}</option>)}
                  </optgroup>
                  <optgroup label="🔨 ผู้รับเหมา (ค่าแรง/รับช่วง)">
                    {vendors.filter((v) => kindOf(v) === 'ผู้รับเหมา').map((v) => <option key={v.id} value={v.name}>{v.name}{v.credit_days ? ` (เครดิต ${v.credit_days} วัน)` : ''}</option>)}
                  </optgroup>
                </select>
                <MaterialAutocomplete style={prField} placeholder="รายการสินค้า * (พิมพ์เพื่อค้นหา)" value={poForm.item} materials={materialPrices} onChange={(v) => setPoForm((f) => ({ ...f, item: v }))} onSelect={(m) => setPoForm((f) => ({ ...f, item: m.name }))} />
                <MoneyInput style={prField} placeholder="มูลค่า (บาท)" value={poForm.amount} onChange={(v) => setPoForm({ ...poForm, amount: v })} />
                <input style={prField} placeholder="อ้างอิง PR (ถ้ามี)" value={poForm.pr_no} onChange={(e) => setPoForm({ ...poForm, pr_no: e.target.value })} />
              </div>
              {(() => { const m = matchMaterial(poForm.item, materialPrices); return m ? (
                <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 6 }}>อ้างอิงราคากลาง <b style={{ color: '#5C6770' }}>{baht(m.mp.central)}</b>{m.mp.unit ? `/${m.mp.unit}` : ''} · เคยซื้อ {m.mp.po_count || '–'} ครั้ง (ต่ำสุด {baht(m.mp.min)} – สูงสุด {baht(m.mp.max)})</div>
              ) : null })()}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, color: '#5C6770' }}>ซื้อให้บ้าน:</span>
                {houseCode
                  ? <div style={{ ...prField, width: 'auto', minWidth: 180, background: '#F7F9FB', color: '#5C6770' }}>🏠 {houses.find((h) => h.code === houseCode)?.name || houseCode}</div>
                  : <select style={{ ...prField, width: 'auto', minWidth: 180 }} value={poForm.house_code} onChange={(e) => setPoForm({ ...poForm, house_code: e.target.value })}>
                      <option value="">— ไม่ระบุบ้าน —</option>
                      {houses.map((h) => <option key={h.id} value={h.code}>{h.name} ({h.code})</option>)}
                    </select>}
                <span style={{ fontSize: 12.5, color: '#5C6770', marginLeft: 8 }}>การชำระเงิน:</span>
                <select style={{ ...prField, width: 'auto' }} value={poForm.payment_type} onChange={(e) => setPoForm({ ...poForm, payment_type: e.target.value })}>
                  <option value="cash">เงินสด</option>
                  <option value="credit">เครดิต</option>
                </select>
                {poForm.payment_type === 'credit' && (
                  <>
                    <input style={{ ...prField, width: 90 }} type="number" placeholder="จำนวนวัน" value={poForm.credit_days} onChange={(e) => setPoForm({ ...poForm, credit_days: e.target.value })} />
                    <span style={{ fontSize: 12.5, color: '#5C6770' }}>วัน</span>
                  </>
                )}
              </div>
              {/* ภาษีซื้อจากใบกำกับจริง — ติ๊กเมื่อร้านออกใบกำกับภาษี (VAT คำนวณ 7/107 ให้ แก้ได้) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#5C6770', cursor: 'pointer' }}>
                  <input type="checkbox" checked={poHasVat} onChange={(e) => { const on = e.target.checked; setPoHasVat(on); setPoForm((f) => ({ ...f, vat_amount: on ? String(Math.round(((Number(f.amount.replace(/,/g, '')) || 0) * 7 / 107) * 100) / 100) : '', tax_invoice_no: on ? f.tax_invoice_no : '' })) }} />
                  มีใบกำกับภาษี (VAT)
                </label>
                {poHasVat && (
                  <>
                    <input style={{ ...prField, width: 170 }} placeholder="เลขที่ใบกำกับภาษี" value={poForm.tax_invoice_no} onChange={(e) => setPoForm({ ...poForm, tax_invoice_no: e.target.value })} />
                    <span style={{ fontSize: 12.5, color: '#5C6770' }}>ยอด VAT</span>
                    <MoneyInput style={{ ...prField, width: 110 }} decimal placeholder="VAT (บาท)" value={poForm.vat_amount} onChange={(v) => setPoForm({ ...poForm, vat_amount: v })} />
                    <span style={{ fontSize: 11.5, color: '#94A0A8' }}>(คำนวณ 7/107 จากยอดรวมให้ — แก้ตามใบจริงได้)</span>
                  </>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 6 }}>เมื่อเปลี่ยนสถานะเป็น “รับของแล้ว” ระบบจะลงรายจ่าย (วัสดุ) ให้บ้านที่เลือกอัตโนมัติ</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                <label className="hov-f3f5f7" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 500, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                  {poImg ? 'เปลี่ยนรูป' : 'แนบรูปสินค้า'}
                  <input type="file" accept="image/*" onChange={pickPoImage} style={{ display: 'none' }} />
                </label>
                {poImg && <img src={poImg} alt="ตัวอย่าง" style={{ height: 44, borderRadius: 6, border: '1px solid #E1E5EA' }} />}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button onClick={() => setAddingPo(false)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>ยกเลิก</button>
                  <button onClick={submitPo} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>บันทึก</button>
                </div>
              </div>
              {poErr && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 8 }}>{poErr}</div>}
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
                <th style={{ ...th, padding: '9px 18px' }}>เลขที่ PO</th>
                <th style={th}>วันที่</th>
                <th style={th}>ผู้ขาย</th>
                <th style={th}>รายการ</th>
                <th style={{ ...th, textAlign: 'right' }}>มูลค่า</th>
                <th style={{ ...th, textAlign: 'center' }}>การชำระเงิน</th>
                <th style={{ ...th, textAlign: 'center' }}>สถานะ</th>
                <th style={{ ...th, padding: '9px 18px', textAlign: 'center' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {poList.length === 0 && <tr><td colSpan={8} style={{ padding: 36, textAlign: 'center', color: '#94A0A8' }}>{purchaseOrders.length === 0 ? 'ยังไม่มีใบสั่งซื้อ — กด “เพิ่ม PO”' : 'ไม่พบรายการที่ค้นหา'}</td></tr>}
              {poList.map((r) => (
                <tr key={r.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td className="num" style={{ ...td, padding: '10px 18px', fontWeight: 600, fontFamily: 'monospace' }}>{r.no}</td>
                  <td className="num" style={{ ...td, color: '#5C6770' }}>{r.date}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{r.vendor}</td>
                  <td style={{ ...td, color: '#3C4750' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {r.image && <img src={r.image} alt="สินค้า" style={{ width: 30, height: 30, borderRadius: 5, objectFit: 'cover', border: '1px solid #E1E5EA', flexShrink: 0 }} />}
                      <div>
                        <div>{r.item}</div>
                        {r.house_code && <div style={{ fontSize: 11, color: '#94A0A8' }}>🏠 {houses.find((h) => h.code === r.house_code)?.name || r.house_code}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{baht(r.amount)}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    {r.payment_type === 'credit' ? (
                      <div style={{ lineHeight: 1.3 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#B7791F', background: '#F6ECD6', padding: '2px 9px', borderRadius: 20 }}>เครดิต {r.credit_days || 0} วัน</span>
                        {r.due_date && <div style={{ fontSize: 10.5, color: '#94A0A8', marginTop: 2 }}>ครบ {r.due_date}</div>}
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#2E7D55', background: '#E2F1EA', padding: '2px 9px', borderRadius: 20 }}>เงินสด</span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    {r.status === 'ยกเลิก'
                      ? <span title="ถูกปฏิเสธ — ยกเลิกทันที" style={{ fontSize: 11, fontWeight: 600, color: '#8A2A22', background: '#FBEEEC', padding: '2px 9px', borderRadius: 20 }}>✗ ยกเลิก</span>
                      : <select value={r.status} onChange={(e) => setPOStatus(r.id, e.target.value)} style={{ fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', border: '1px solid #D2DAE1', borderRadius: 7, padding: '3px 7px', outline: 'none' }}>
                      {['รอส่งของ', 'รับของแล้ว', 'ปิดงาน'].map((s) => <option key={s}>{s}</option>)}
                    </select>}
                  </td>
                  <td style={{ ...td, padding: '10px 18px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                      <ApprovalBar docType="po" docId={r.id} approval={r.approval} onDone={() => reloadData('purchaseOrders', '/purchase-orders')} compact />
                      {r.gr_status === 'ผ่าน'
                        ? <span title={'ตรวจรับของผ่าน ' + (r.gr_date || '')} style={{ fontSize: 11, fontWeight: 700, color: '#2E7D55', background: '#E2F1EA', padding: '2px 9px', borderRadius: 20 }}>✓ รับของตรง</span>
                        : r.gr_status === 'ไม่ผ่าน'
                          ? <span title={'ตรวจรับของไม่ผ่าน ' + (r.gr_date || '')} style={{ fontSize: 11, fontWeight: 700, color: '#C24036', background: '#FBEAE7', padding: '2px 9px', borderRadius: 20 }}>✗ ไม่ตรง</span>
                          : null}
                      {r.status !== 'ยกเลิก' && <button onClick={() => setDocReceive(r)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 500, color: '#2E7D55', background: '#fff', border: '1px solid #B5DDC8', borderRadius: 7, padding: '5px 11px', cursor: 'pointer' }}>📦 ตรวจรับของ</button>}
                      <button onClick={() => setDocPo(r)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 500, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '5px 11px', cursor: 'pointer' }}>🖨 พิมพ์ PO</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}

        {/* ประวัติการซื้อ / ราคา */}
        {tab === 'history' && <PurchaseHistory purchaseOrders={purchaseOrders} prs={prs} expenses={data.expenses || []} houses={houses} />}

        {/* Payments + WHT */}
        {tab === 'pay' && (
          <>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid #EEF1F4' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>การจ่ายเงิน / หัก ณ ที่จ่าย</span>
            <button onClick={() => setAddingPay((v) => !v)} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>+ บันทึกจ่ายเงิน</button>
          </div>
          {addingPay && (
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF1F4', background: '#FAFBFC' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 0.8fr', gap: 10 }}>
                <input style={prField} list="payee-emps" placeholder="ผู้รับเงิน * (พิมพ์/เลือกพนักงานหรือผู้ขาย)" value={payForm.payee} onChange={(e) => setPayForm({ ...payForm, payee: e.target.value })} />
                <datalist id="payee-emps">
                  {(data.employees || []).map((e) => <option key={'e' + e.code} value={e.name} />)}
                  {vendors.map((v) => <option key={'v' + v.id} value={v.name} />)}
                </datalist>
                {payForm.po_no && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: '#30506A', background: '#E2E9EF', padding: '4px 10px', borderRadius: 20 }}>ชำระ {payForm.po_no}</span>
                    <button onClick={() => setPayForm({ ...payForm, po_id: '', po_no: '', note: '' })} title="ยกเลิกการผูกกับ PO" style={{ border: 'none', background: 'none', color: '#C24036', cursor: 'pointer', fontSize: 13 }}>✕</button>
                  </div>
                )}
                <select style={prField} value={payForm.type} onChange={(e) => setPayForm({ ...payForm, type: e.target.value })}><option>ภงด.53</option><option>ภงด.3</option><option value="-">ไม่หัก</option></select>
                <MoneyInput style={prField} placeholder="ยอดก่อนหัก (บาท)" value={payForm.gross} onChange={(v) => setPayForm({ ...payForm, gross: v })} />
                <input style={prField} type="number" placeholder="อัตรา %" value={payForm.wht_rate} onChange={(e) => setPayForm({ ...payForm, wht_rate: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: 10, marginTop: 10 }}>
                <select style={prField} value={payForm.house_code} onChange={(e) => setPayForm({ ...payForm, house_code: e.target.value })}>
                  <option value="">— ผูกกับบ้าน (ไม่บังคับ) —</option>
                  {houses.map((h) => <option key={h.id} value={h.code}>{h.name}</option>)}
                </select>
                <input style={prField} placeholder="รายละเอียด/หมายเหตุ (เช่น ค่าเซ็นแบบ, ค่าป้าย)" value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} />
              </div>
              <div style={{ fontSize: 11, color: '#94A0A8', marginTop: 6 }}>เลือกบ้านเพื่อให้ยอดนี้ถูกรวมเข้า “ต้นทุนจริง/กำไรสุทธิ” ของบ้านนั้น</div>
              {(() => { const emp = (data.employees || []).find((e) => e.name === payForm.payee.trim()); if (!emp) return null; return <div style={{ fontSize: 11.5, marginTop: 6, color: emp.signature ? '#2E7D55' : '#B7791F' }}>{emp.signature ? '✓ เป็นพนักงาน — จะดึงลายเซ็นมาในใบ 50 ทวิ ให้อัตโนมัติ' : '⚠ เป็นพนักงาน แต่ยังไม่มีลายเซ็นในระบบ (เพิ่มได้ที่หน้าบุคลากร)'}</div> })()}
              {payErr && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 8 }}>{payErr}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                <button onClick={() => setAddingPay(false)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>ยกเลิก</button>
                <button onClick={submitPay} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>บันทึก</button>
              </div>
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
                <th style={{ ...th, padding: '9px 18px' }}>วันที่</th>
                <th style={th}>เลขที่</th>
                <th style={th}>ผู้รับเงิน</th>
                <th style={{ ...th, textAlign: 'center' }}>ประเภทหัก</th>
                <th style={{ ...th, textAlign: 'right' }}>ยอดก่อนหัก</th>
                <th style={{ ...th, textAlign: 'center' }}>อัตรา</th>
                <th style={{ ...th, textAlign: 'right' }}>หัก ณ ที่จ่าย</th>
                <th style={{ ...th, textAlign: 'right' }}>จ่ายสุทธิ</th>
                <th style={{ ...th, padding: '9px 18px', textAlign: 'center' }}>50 ทวิ</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((r) => (
                <tr key={r.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td className="num" style={{ ...td, padding: '10px 18px', color: '#5C6770' }}>{r.date}</td>
                  <td className="num" style={{ ...td, fontFamily: 'monospace', color: '#5C6770' }}>{r.no}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{r.payee}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#30506A', background: '#E2E9EF', padding: '2px 9px', borderRadius: 20 }}>{r.type}</span>
                  </td>
                  <td className="num" style={{ ...td, textAlign: 'right' }}>{baht(r.gross)}</td>
                  <td className="num" style={{ ...td, textAlign: 'center', color: '#5C6770' }}>{r.wht_rate}%</td>
                  <td className="num" style={{ ...td, textAlign: 'right', color: '#C0852C', fontWeight: 600 }}>{baht(r.wht)}</td>
                  <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{baht(r.net)}</td>
                  <td style={{ ...td, padding: '10px 18px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <ApprovalBar docType="payment" docId={r.id} approval={r.approval} onDone={() => reloadData('payments', '/payments')} compact />
                    <button onClick={() => setDocVoucher(r)} className="hov-f3f5f7" title="ใบจ่ายเงิน" style={{ marginLeft: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 500, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>ใบจ่ายเงิน</button>
                    <button onClick={() => setDocWht(r)} className="hov-f3f5f7" title="หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)" style={{ marginLeft: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 500, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>50 ทวิ</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #E1E5EA', background: '#F7F9FB' }}>
                <td colSpan={6} style={{ padding: '11px 18px', fontWeight: 600, color: '#5C6770' }}>รวมหัก ณ ที่จ่ายเดือนนี้</td>
                <td className="num" style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: '#C0852C' }}>{baht(payments.reduce((s, r) => s + r.wht, 0))}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
          </>
        )}

        {/* Payables — ยอดค้างจ่ายจริงจาก PO เครดิต */}
        {tab === 'payable' && apCheck && (
          apCheck.ok
            ? <div style={{ fontSize: 12.5, color: '#2E7D55', background: '#E2F1EA', borderBottom: '1px solid #CDE3D6', padding: '9px 18px' }}>✓ ยอดเจ้าหนี้ตรงกับบัญชี — เจ้าหนี้การค้า (บัญชี 2010) {baht(apCheck.gl_2010)} = ยอดค้างจ่ายรวม {baht(apCheck.payable_remaining)}</div>
            : <div style={{ fontSize: 12.5, color: '#C24036', background: '#FBEEEC', borderBottom: '1px solid #E7CDC9', padding: '9px 18px' }}>⚠️ ยอดเจ้าหนี้ไม่ตรงกับบัญชี! ตามบัญชี (2010) {baht(apCheck.gl_2010)} · ตามใบ PO {baht(apCheck.payable_remaining)} · ต่างกัน {baht(Math.abs(apCheck.diff))} — ตรวจที่หน้า บัญชี → สมุดรายวัน หรือกด “สร้างบัญชีจากข้อมูลเดิม” เพื่อซ่อม</div>
        )}
        {tab === 'payable' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
                <th style={{ ...th, padding: '9px 18px' }}>ผู้ขาย</th>
                <th style={th}>ใบสั่งซื้อ</th>
                <th style={th}>ครบกำหนด</th>
                <th style={{ ...th, textAlign: 'right' }}>มูลค่า</th>
                <th style={{ ...th, textAlign: 'right' }}>จ่ายแล้ว</th>
                <th style={{ ...th, textAlign: 'right' }}>คงเหลือ</th>
                <th style={{ ...th, textAlign: 'center' }}>สถานะ</th>
                <th style={{ ...th, padding: '9px 18px', textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {(payableRows || []).length === 0 && <tr><td colSpan={8} style={{ padding: 36, textAlign: 'center', color: '#94A0A8' }}>{payableRows === null ? 'กำลังโหลด…' : 'ไม่มียอดค้างจ่าย (PO เครดิต)'}</td></tr>}
              {(payableRows || []).map((r) => (
                <tr key={r.po_id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td style={{ ...td, padding: '10px 18px', fontWeight: 500 }}>{r.vendor}</td>
                  <td className="num" style={{ ...td, fontFamily: 'monospace', color: '#5C6770' }}>{r.no}</td>
                  <td className="num" style={{ ...td, color: r.overdue ? '#C24036' : '#5C6770', fontWeight: r.overdue ? 700 : 400 }}>{r.due_date || '-'}</td>
                  <td className="num" style={{ ...td, textAlign: 'right' }}>{baht(r.amount)}</td>
                  <td className="num" style={{ ...td, textAlign: 'right', color: r.paid ? '#2E7D55' : '#94A0A8' }}>{baht(r.paid)}</td>
                  <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 700, color: r.remaining > 0 ? '#C0852C' : '#94A0A8' }}>{baht(r.remaining)}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20, color: r.status === 'จ่ายครบ' ? '#2E7D55' : r.status === 'เกินกำหนด' ? '#C24036' : '#B7791F', background: r.status === 'จ่ายครบ' ? '#E2F1EA' : r.status === 'เกินกำหนด' ? '#FBEAE7' : '#F6ECD6' }}>{r.status}</span>
                  </td>
                  <td style={{ ...td, padding: '10px 18px', textAlign: 'center' }}>
                    {r.remaining > 0 && <button onClick={() => payPo(r)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#2E7D55', background: '#fff', border: '1px solid #B5DDC8', borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}>💸 จ่าย</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Vendors */}
        {tab === 'vendors' && (
          <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid #EEF1F4', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>ผู้ขาย / ผู้รับเหมา</span>
            {/* ชิพกรองหมวด — แยก ผู้ขาย (วัสดุ) กับ ผู้รับเหมา (ค่าแรง/รับช่วง) ให้เห็นชัด */}
            <div style={{ display: 'flex', gap: 5 }}>
              {([
                ['all', `ทั้งหมด ${vendors.length}`],
                ['ผู้ขาย', `🏪 ผู้ขาย ${vendors.filter((v) => kindOf(v) === 'ผู้ขาย').length}`],
                ['ผู้รับเหมา', `🔨 ผู้รับเหมา ${vendors.filter((v) => kindOf(v) === 'ผู้รับเหมา').length}`],
              ] as const).map(([id, label]) => (
                <button key={id} onClick={() => setVendorKindFilter(id)}
                  style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 20, padding: '5px 13px', cursor: 'pointer', color: vendorKindFilter === id ? '#fff' : '#5C6770', background: vendorKindFilter === id ? '#30506A' : '#EDF1F4' }}>{label}</button>
              ))}
            </div>
            <span style={{ fontSize: 11.5, color: '#94A0A8' }}>กดป้ายหมวดในตารางเพื่อย้ายรายชื่อระหว่าง ผู้ขาย ↔ ผู้รับเหมา</span>
            <button onClick={() => setAddingVendor((v) => !v)} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>+ เพิ่มผู้ขาย/ผู้รับเหมา</button>
          </div>
          {addingVendor && (
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF1F4', background: '#FAFBFC', display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: editingVendorId != null ? '#B7791F' : '#30506A' }}>
                {editingVendorId != null ? `✎ แก้ไขข้อมูล: ${vendorForm.name}` : 'เพิ่มร้านค้า / ช่างใหม่ — กรอกครบรอบเดียว'}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <select style={{ ...prField, width: 'auto' }} value={vendorForm.kind} onChange={(e) => setVendorForm({ ...vendorForm, kind: e.target.value })} title="ผู้ขาย = ร้านวัสดุ/ของ · ผู้รับเหมา = ค่าแรง/รับช่วงงาน">
                  <option value="ผู้ขาย">🏪 ผู้ขาย (วัสดุ/ของ)</option>
                  <option value="ผู้รับเหมา">🔨 ผู้รับเหมา (ค่าแรง/รับช่วง)</option>
                </select>
                <input style={{ ...prField, flex: 1.4, minWidth: 200 }} placeholder="ชื่อร้าน/ช่าง *" value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} />
                <input style={{ ...prField, width: 170 }} list="vendor-cats" placeholder="หมวดสินค้า/งาน" title="เช่น วัสดุก่อสร้าง ไฟฟ้า ประปา — พิมพ์เองได้" value={vendorForm.category} onChange={(e) => setVendorForm({ ...vendorForm, category: e.target.value })} />
                <datalist id="vendor-cats">{VENDOR_CATS.map((c) => <option key={c} value={c} />)}</datalist>
                <select style={prField} value={vendorForm.type} onChange={(e) => setVendorForm({ ...vendorForm, type: e.target.value })}><option>นิติบุคคล</option><option>บุคคล</option></select>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input style={{ ...prField, width: 170 }} placeholder="เลขผู้เสียภาษี" value={vendorForm.tax_id} onChange={(e) => setVendorForm({ ...vendorForm, tax_id: e.target.value })} />
                <input style={{ ...prField, flex: 1, minWidth: 260 }} placeholder="ที่อยู่ (ใช้ในเอกสาร/ติดต่อ)" value={vendorForm.address} onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })} />
                <input style={{ ...prField, width: 120 }} type="number" placeholder="เครดิต (วัน)" title="0 = เงินสด" value={vendorForm.credit_days} onChange={(e) => setVendorForm({ ...vendorForm, credit_days: e.target.value })} />
                <button onClick={submitVendor} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: editingVendorId != null ? '#B7791F' : '#30506A', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>{editingVendorId != null ? 'บันทึกการแก้ไข' : 'บันทึก'}</button>
                <button onClick={() => { setAddingVendor(false); setEditingVendorId(null); setVendorForm(blankVendorForm) }} style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#5C6770', background: '#EDF1F4', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>ยกเลิก</button>
              </div>
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
                <th style={{ ...th, padding: '9px 18px' }}>ชื่อผู้ขาย / ผู้รับเหมา</th>
                <th style={{ ...th, textAlign: 'center' }}>ประเภท</th>
                <th style={th}>เลขผู้เสียภาษี</th>
                <th style={{ ...th, textAlign: 'center' }}>หมวด</th>
                <th style={{ ...th, textAlign: 'center' }}>เครดิต (วัน)</th>
                <th style={{ ...th, textAlign: 'center' }}>จด VAT</th>
                <th style={{ ...th, textAlign: 'right' }}>ยอดซื้อสะสม</th>
                <th style={{ ...th, textAlign: 'right' }}>ค้างจ่าย</th>
                <th style={{ ...th, padding: '9px 18px', textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {vendors.length === 0 && <tr><td colSpan={9} style={{ padding: 36, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีรายชื่อ — กด “เพิ่มผู้ขาย/ผู้รับเหมา”</td></tr>}
              {vendors.filter((r) => vendorKindFilter === 'all' || kindOf(r) === vendorKindFilter).map((r) => (
                <tr key={r.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td style={{ ...td, padding: '10px 18px' }}>
                    <div style={{ fontWeight: 500 }}>{r.name} {r.category && <span style={{ fontSize: 10.5, fontWeight: 600, color: '#6B4E9E', background: '#EEE8F6', borderRadius: 6, padding: '1px 8px', marginLeft: 4 }}>{r.category}</span>}</div>
                    {r.address && <div style={{ fontSize: 11, color: '#94A0A8', marginTop: 2 }}>📍 {r.address}</div>}
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: r.type === 'นิติบุคคล' ? '#30506A' : '#C0852C', background: r.type === 'นิติบุคคล' ? '#E2E9EF' : '#F6ECD6', padding: '2px 9px', borderRadius: 20 }}>{r.type}</span>
                  </td>
                  <td className="num" style={{ ...td, fontFamily: 'monospace', color: '#5C6770' }}>{r.tax_id}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span onClick={() => updateVendor(r.id, { kind: kindOf(r) === 'ผู้ขาย' ? 'ผู้รับเหมา' : 'ผู้ขาย' })}
                      title="กดเพื่อสลับหมวด ผู้ขาย ↔ ผู้รับเหมา"
                      style={{ fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '3px 11px', borderRadius: 20, whiteSpace: 'nowrap', color: kindOf(r) === 'ผู้รับเหมา' ? '#8A5A16' : '#1D5C8E', background: kindOf(r) === 'ผู้รับเหมา' ? '#FBEFD9' : '#E1EEF8', border: '1px solid ' + (kindOf(r) === 'ผู้รับเหมา' ? '#EBD7AE' : '#C6DEF0') }}>
                      {kindOf(r) === 'ผู้รับเหมา' ? '🔨 ผู้รับเหมา' : '🏪 ผู้ขาย'}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <input
                      type="number"
                      defaultValue={r.credit_days || 0}
                      title="แก้แล้วกด Enter หรือคลิกที่อื่นเพื่อบันทึก (0 = เงินสด)"
                      onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== (r.credit_days || 0)) updateVendor(r.id, { credit_days: v }) }}
                      style={{ width: 64, fontFamily: 'inherit', fontSize: 12.5, textAlign: 'center', color: '#1C2730', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 6px', outline: 'none' }}
                    />
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <input type="checkbox" checked={!!r.vat_registered} title="ผู้ขายรายนี้ออกใบกำกับภาษี — PO ใหม่จะติ๊ก VAT ให้อัตโนมัติ" onChange={(e) => updateVendor(r.id, { vat_registered: e.target.checked ? 1 : 0 })} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                  </td>
                  <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{baht(r.total_live ?? r.total)}</td>
                  <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 600, color: (r.outstanding_live ?? r.outstanding) === 0 ? '#94A0A8' : '#C0852C' }}>{baht(r.outstanding_live ?? r.outstanding)}</td>
                  <td style={{ ...td, padding: '10px 18px', textAlign: 'center' }}>
                    <button onClick={() => openEditVendor(r)} title="แก้ไขข้อมูล (เพิ่มที่อยู่/หมวด/เลขภาษี)" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 11px', cursor: 'pointer' }}>✎ แก้ไข</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}

        {/* Tax report + e-Filing */}
        {tab === 'tax' && (
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
              {taxCardsLive.map((c, i) => (
                <div key={i} style={{ border: '1px solid #E1E5EA', borderRadius: 12, padding: '16px 18px', borderLeft: `3px solid ${c.accent}` }}>
                  <div style={{ fontSize: 12.5, color: '#5C6770' }}>{c.label}</div>
                  <div className="num" style={{ fontSize: 25, fontWeight: 700, marginTop: 6, color: '#1C2730' }}>{c.value}</div>
                  <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 5 }}>{c.sub}</div>
                </div>
              ))}
            </div>
            <EfilingList filter={['pnd3', 'pnd53', 'pp30']} />
          </div>
        )}
      </div>

      {docPr && <PrApprovalDoc pr={docPr} onClose={() => setDocPr(null)} />}
      {docPo && <PoDoc po={docPo} houseName={houses.find((h) => h.code === docPo.house_code)?.name || docPo.house_code || ''} onClose={() => setDocPo(null)} />}
      {docReceive && <GoodsReceipt po={docReceive} onClose={() => setDocReceive(null)} onDone={() => reloadData('purchaseOrders', '/purchase-orders')} />}
      {docWht && (() => { const emp = (data.employees || []).find((e) => e.name === docWht.payee); return <WhtDoc payment={docWht} payeeSignature={emp?.signature} payeeTaxId={emp?.tax_id || undefined} onClose={() => setDocWht(null)} /> })()}
      {docVoucher && <PaymentVoucher payment={docVoucher} note={docVoucher.note || (houses.find((h) => h.code === docVoucher.house_code)?.name ? 'บ้าน ' + houses.find((h) => h.code === docVoucher.house_code)?.name : '')} onClose={() => setDocVoucher(null)} />}
    </div>
  )
}

// ประวัติการซื้อ/ราคา — ค้นชื่อวัสดุแล้วเห็นว่าเคยซื้อที่ไหน วันไหน ราคาเท่าไหร่ (รวมจาก PO + รายจ่าย + PR)
interface HistRec { source: string; date: string; iso: string; vendor: string; item: string; qty?: number; unit?: string; unitPrice?: number; amount: number; house: string; ref: string; status?: string }
function PurchaseHistory({ purchaseOrders, prs, expenses, houses }: { purchaseOrders: ApiPO[]; prs: ApiPR[]; expenses: { id: number; date: string; date_iso?: string; house_code: string; item: string; cat: string; vendor: string; amount: number }[]; houses: { code: string; name: string }[] }) {
  const [q, setQ] = useState('')
  const hName = (code?: string) => houses.find((h) => h.code === code)?.name || code || ''
  const all: HistRec[] = []
  for (const p of purchaseOrders) all.push({ source: 'PO', date: p.date, iso: '', vendor: p.vendor || '', item: p.item || '', amount: p.amount || 0, house: hName(p.house_code), ref: p.no, status: p.status })
  for (const e of expenses) all.push({ source: 'รายจ่าย', date: e.date, iso: e.date_iso || '', vendor: e.vendor || '', item: e.item || '', amount: e.amount || 0, house: hName(e.house_code), ref: e.cat || '' })
  for (const pr of prs) {
    if (pr.items && pr.items.length) for (const it of pr.items) all.push({ source: 'PR', date: pr.date, iso: '', vendor: '', item: it.desc || '', qty: it.qty, unit: it.unit, unitPrice: it.price, amount: (it.qty || 0) * (it.price || 0), house: hName(pr.house_code) || pr.house || '', ref: pr.no, status: pr.status })
    else all.push({ source: 'PR', date: pr.date, iso: '', vendor: '', item: pr.item || '', amount: pr.amount || 0, house: hName(pr.house_code) || pr.house || '', ref: pr.no, status: pr.status })
  }
  const ql = q.trim().toLowerCase()
  const list = (ql ? all.filter((r) => r.item.toLowerCase().includes(ql) || r.vendor.toLowerCase().includes(ql)) : all)
    .sort((a, b) => (b.iso || '').localeCompare(a.iso || '') || b.ref.localeCompare(a.ref))
  const withUnit = list.filter((r) => (r.unitPrice || 0) > 0)
  const prices = withUnit.map((r) => r.unitPrice as number)
  const min = prices.length ? Math.min(...prices) : 0
  const max = prices.length ? Math.max(...prices) : 0
  const avg = prices.length ? prices.reduce((s, p) => s + p, 0) / prices.length : 0
  const vendors = [...new Set(list.map((r) => r.vendor).filter(Boolean))]
  const last = list[0]
  const srcColor = (s: string) => s === 'PO' ? { c: '#30506A', bg: '#E2E9EF' } : s === 'PR' ? { c: '#6B4E9E', bg: '#EEE9F5' } : { c: '#C0852C', bg: '#F6ECD6' }
  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>ประวัติการซื้อ / ราคาที่เคยซื้อ</div>
          <div style={{ fontSize: 11.5, color: '#94A0A8' }}>ค้นชื่อวัสดุ → เห็นว่าเคยสั่งซื้อที่ไหน วันไหน ราคาเท่าไหร่ (รวมจากใบสั่งซื้อ + รายจ่าย + ใบขอซื้อ)</div>
        </div>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="พิมพ์ชื่อวัสดุ เช่น ปูน / เหล็ก / กระเบื้อง หรือชื่อผู้ขาย" style={{ ...prField, marginLeft: 'auto', width: 320 }} />
      </div>

      {ql && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, margin: '12px 0' }}>
          <div style={{ background: '#F7F9FB', borderRadius: 10, padding: '12px 14px' }}><div style={{ fontSize: 12, color: '#5C6770' }}>ซื้อทั้งหมด</div><div className="num" style={{ fontSize: 20, fontWeight: 700 }}>{list.length} ครั้ง</div></div>
          <div style={{ background: '#F7F9FB', borderRadius: 10, padding: '12px 14px' }}><div style={{ fontSize: 12, color: '#5C6770' }}>ราคา/หน่วย ต่ำ–สูง</div><div className="num" style={{ fontSize: 16, fontWeight: 700 }}>{prices.length ? `${baht(min)} – ${baht(max)}` : '—'}</div><div className="num" style={{ fontSize: 11, color: '#94A0A8' }}>{prices.length ? `เฉลี่ย ${baht(Math.round(avg))}` : 'ไม่มีข้อมูลราคา/หน่วย'}</div></div>
          <div style={{ background: '#F7F9FB', borderRadius: 10, padding: '12px 14px' }}><div style={{ fontSize: 12, color: '#5C6770' }}>ผู้ขายที่เคยซื้อ</div><div style={{ fontSize: 13, fontWeight: 600, marginTop: 3, lineHeight: 1.4 }}>{vendors.length ? vendors.slice(0, 4).join(', ') + (vendors.length > 4 ? ` +${vendors.length - 4}` : '') : '—'}</div></div>
          {last && <div style={{ background: '#F7F9FB', borderRadius: 10, padding: '12px 14px' }}><div style={{ fontSize: 12, color: '#5C6770' }}>ซื้อล่าสุด</div><div style={{ fontSize: 13, fontWeight: 600, marginTop: 3 }}>{last.vendor || last.source} · {baht(last.amount)}</div><div style={{ fontSize: 11, color: '#94A0A8' }}>{last.date}</div></div>}
        </div>
      )}

      <div style={{ border: '1px solid #EEF1F4', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ background: '#F7F9FB' }}>
            <th style={{ ...th, paddingLeft: 16 }}>วันที่</th><th style={th}>แหล่ง</th><th style={th}>รายการ</th><th style={th}>ผู้ขาย</th>
            <th style={{ ...th, textAlign: 'right' }}>จำนวน</th><th style={{ ...th, textAlign: 'right' }}>ราคา/หน่วย</th><th style={{ ...th, textAlign: 'right' }}>ยอดรวม</th><th style={th}>บ้าน</th><th style={{ ...th, paddingRight: 16 }}>อ้างอิง</th>
          </tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={9} style={{ padding: 36, textAlign: 'center', color: '#94A0A8' }}>{ql ? `ไม่พบประวัติการซื้อ “${q}”` : 'พิมพ์ชื่อวัสดุด้านบนเพื่อค้นหา (หรือดูรายการทั้งหมดด้านล่าง)'}</td></tr>}
            {list.slice(0, 300).map((r, i) => { const sc = srcColor(r.source); return (
              <tr key={i} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                <td style={{ padding: '8px 16px', color: '#5C6770', whiteSpace: 'nowrap' }}>{r.date || '—'}</td>
                <td style={{ padding: '8px 14px' }}><span style={{ fontSize: 10.5, fontWeight: 600, color: sc.c, background: sc.bg, padding: '2px 8px', borderRadius: 20 }}>{r.source}</span></td>
                <td style={{ padding: '8px 14px', fontWeight: 500 }}>{r.item || '—'}</td>
                <td style={{ padding: '8px 14px', color: '#5C6770' }}>{r.vendor || '—'}</td>
                <td className="num" style={{ padding: '8px 14px', textAlign: 'right', color: '#5C6770' }}>{r.qty ? `${r.qty}${r.unit ? ' ' + r.unit : ''}` : '—'}</td>
                <td className="num" style={{ padding: '8px 14px', textAlign: 'right' }}>{r.unitPrice ? baht(r.unitPrice) : '—'}</td>
                <td className="num" style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600 }}>{baht(r.amount)}</td>
                <td style={{ padding: '8px 14px', color: '#5C6770' }}>{r.house || '—'}</td>
                <td style={{ padding: '8px 16px', color: '#94A0A8', fontSize: 11.5 }}>{r.ref || '—'}</td>
              </tr>
            ) })}
          </tbody>
        </table>
      </div>
      {list.length > 300 && <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 8, textAlign: 'center' }}>แสดง 300 รายการแรก — พิมพ์ค้นหาเพื่อกรองให้แคบลง</div>}
    </div>
  )
}
