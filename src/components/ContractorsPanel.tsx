import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { baht, unMoney } from '../data'
import type { ApiLaborRate } from '../store'
import { laborLabel, laborPriceText } from '../store'
import { useLaborRates } from './LaborRates'
import MoneyInput from './MoneyInput'

interface Contractor {
  id: number; house_code: string; name: string; role: string; type: string; advance: number; deducted: number; paid: number; note: string
  work_total?: number; work_paid?: number; eval_avg?: number | null; eval_grade?: string | null; adv_total?: number; deduct_total?: number; adv_left?: number
  // ราคาจ้าง: หมวดงาน + ปริมาณ + ราคาตกลง/หน่วย + ยอดตกลงรวม (เทียบราคากลางค่าแรง)
  labor_rate_id?: number | null; qty?: number; unit_price?: number; contract_total?: number; price_note?: string
  rate_label?: string; rate_unit?: string; rate_min?: number | null; rate_max?: number | null; price_vs?: string
}
interface Advance { id: number; date: string; type: string; item: string; amount: number; by: string }
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '8px 11px', outline: 'none' }
const lbl: React.CSSProperties = { fontSize: 11.5, color: '#5C6770', marginBottom: 3 }

// สีป้ายเทียบราคาตกลงกับราคากลาง
function vsColor(v?: string) {
  if (v === 'ถูกกว่า') return { c: '#2E7D55', bg: '#E2F1EA', t: 'ถูกกว่าราคากลาง' }
  if (v === 'ตามราคากลาง') return { c: '#30506A', bg: '#E2E9EF', t: 'ตามราคากลาง' }
  if (v === 'สูงกว่า') return { c: '#C24036', bg: '#FBEEEC', t: 'สูงกว่าราคากลาง' }
  if (v === 'เสนอราคา') return { c: '#6B4E9E', bg: '#EEE8F6', t: 'เสนอราคา (ไม่มีราคากลาง)' }
  return null
}
// เทียบราคาตกลงกับราคากลาง (ฝั่งหน้าจอ — ให้เห็นทันทีตอนพิมพ์)
function compareRate(rate: ApiLaborRate | undefined, unitPrice: number): string {
  if (!rate) return ''
  if (!(rate.price_max > 0)) return 'เสนอราคา'
  if (!(unitPrice > 0)) return ''
  if (unitPrice > rate.price_max) return 'สูงกว่า'
  if (unitPrice < rate.price_min) return 'ถูกกว่า'
  return 'ตามราคากลาง'
}

type HireForm = { name: string; role: string; type: string; labor_rate_id: string; qty: string; unit_price: string; contract_total: string; price_note: string }
const blankHire: HireForm = { name: '', role: '', type: 'เหมารวม', labor_rate_id: '', qty: '', unit_price: '', contract_total: '', price_note: '' }

// ฟอร์มจ้างช่าง: เลือกหมวดงาน → ราคากลางขึ้นเป็นราคาแนะนำ → กรอกปริมาณ + ราคาตกลง → ระบบเทียบให้
function HireForm({ f, setF, rates, err, busy, onCancel, onSave, editing }: {
  f: HireForm; setF: (f: HireForm) => void; rates: ApiLaborRate[]; err: string; busy: boolean; onCancel: () => void; onSave: () => void; editing: boolean
}) {
  const rate = rates.find((r) => String(r.id) === f.labor_rate_id)
  const qty = unMoney(f.qty), up = unMoney(f.unit_price)
  const auto = qty > 0 && up > 0 ? Math.round(qty * up * 100) / 100 : 0
  const vs = compareRate(rate, up)
  const vc = vsColor(vs)
  const overPct = rate && vs === 'สูงกว่า' ? Math.round(((up - rate.price_max) / rate.price_max) * 100) : 0
  const pickRate = (id: string) => {
    const r = rates.find((x) => String(x.id) === id)
    // เปลี่ยนหมวด → เติมชื่องานให้ (ถ้ายังไม่พิมพ์เอง) + เสนอราคากลางสูงสุดเป็นราคาตั้งต้น (ต้องหาถูกกว่านี้)
    const roleAuto = !f.role || rates.some((x) => laborLabel(x) === f.role)
    setF({ ...f, labor_rate_id: id, role: roleAuto ? (r ? laborLabel(r) : '') : f.role, unit_price: r && r.price_max > 0 && !unMoney(f.unit_price) ? String(r.price_max) : f.unit_price })
  }
  const grpOpts = (g: ApiLaborRate['grp']) => rates.filter((r) => r.grp === g)
  return (
    <div style={{ border: '1px solid #E1E5EA', borderRadius: 10, padding: 14, background: '#FAFBFC' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.6fr 1fr', gap: 10 }}>
        <div><div style={lbl}>ชื่อช่าง / ผู้รับเหมา *</div><input style={{ ...field, width: '100%', boxSizing: 'border-box' }} placeholder="เช่น ช่างสมชาย ทีมปูน" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div>
          <div style={lbl}>หมวดงานที่จ้าง (ราคากลาง)</div>
          <select style={{ ...field, width: '100%', boxSizing: 'border-box' }} value={f.labor_rate_id} onChange={(e) => pickRate(e.target.value)}>
            <option value="">— เลือกหมวดงาน —</option>
            <optgroup label="เหมายกหลัง">{grpOpts('เหมายกหลัง').map((r) => <option key={r.id} value={r.id}>{laborLabel(r)} · {laborPriceText(r)}</option>)}</optgroup>
            <optgroup label="แยกแต่ละงาน">{grpOpts('แยกงาน').map((r) => <option key={r.id} value={r.id}>{r.seq}. {laborLabel(r)} · {laborPriceText(r)}</option>)}</optgroup>
          </select>
        </div>
        <div><div style={lbl}>ประเภท</div><select style={{ ...field, width: '100%', boxSizing: 'border-box' }} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option>เหมารวม</option><option>เฉพาะค่าแรง</option></select></div>
      </div>
      {rate && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5, color: '#30506A', background: '#E2E9EF', borderRadius: 9, padding: '8px 12px' }}>
          <span>💡 ราคาแนะนำ <b>{laborLabel(rate)}</b>: <b className="num">{laborPriceText(rate)}</b></span>
          {rate.price_max > 0 && <span style={{ color: '#5C6770' }}>· ต้องหาช่างที่ราคา <b>ถูกกว่าหรือเท่ากับ</b> ราคากลาง</span>}
          {rate.note && rate.note !== 'เสนอราคา' && <span style={{ color: '#8A6D3B' }}>· {rate.note}</span>}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1.2fr', gap: 10, marginTop: 10 }}>
        <div><div style={lbl}>งานที่รับผิดชอบ</div><input style={{ ...field, width: '100%', boxSizing: 'border-box' }} placeholder="เติมให้จากหมวดงาน หรือพิมพ์เอง" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} /></div>
        <div><div style={lbl}>ปริมาณงาน{rate ? ` (${rate.unit})` : ''}</div><input style={{ ...field, width: '100%', boxSizing: 'border-box' }} inputMode="decimal" placeholder={rate ? 'เช่น 120' : '—'} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></div>
        <div>
          <div style={lbl}>ราคาตกลง / {rate?.unit || 'หน่วย'}</div>
          <MoneyInput style={{ ...field, width: '100%', boxSizing: 'border-box', borderColor: vc && vs === 'สูงกว่า' ? '#C24036' : vc && vs !== 'เสนอราคา' ? vc.c : '#D2DAE1' }} placeholder="0" value={f.unit_price} onChange={(v) => setF({ ...f, unit_price: v })} />
        </div>
        <div>
          <div style={lbl}>ยอดตกลงจ้างรวม</div>
          <MoneyInput style={{ ...field, width: '100%', boxSizing: 'border-box' }} placeholder={auto ? auto.toLocaleString('en-US') : 'กรอกเอง หรือปล่อยให้คำนวณ'} value={f.contract_total} onChange={(v) => setF({ ...f, contract_total: v })} />
        </div>
      </div>
      {vc && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: vc.c, background: vc.bg, padding: '3px 10px', borderRadius: 20 }}>{vc.t}{overPct > 0 ? ` +${overPct}%` : ''}</span>
          {auto > 0 && !unMoney(f.contract_total) && <span style={{ fontSize: 12, color: '#5C6770' }}>รวม {qty.toLocaleString('en-US')} {rate?.unit} × {baht(up)} = <b className="num">{baht(auto)}</b></span>}
          {vs === 'สูงกว่า' && <span style={{ fontSize: 12, color: '#C24036' }}>ราคากลางสูงสุด {baht(rate!.price_max)}/{rate!.unit} — ลองต่อรองหรือหาช่างรายอื่นก่อน</span>}
        </div>
      )}
      {vs === 'สูงกว่า' && (
        <div style={{ marginTop: 8 }}>
          <div style={lbl}>เหตุผลที่จ้างสูงกว่าราคากลาง * (บันทึกลงประวัติตรวจสอบ)</div>
          <input style={{ ...field, width: '100%', boxSizing: 'border-box', borderColor: '#EAD9B6', background: '#FFFDF7' }} placeholder="เช่น งานเร่ง / ช่างฝีมือดี / หน้างานยาก" value={f.price_note} onChange={(e) => setF({ ...f, price_note: e.target.value })} />
        </div>
      )}
      <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 8 }}>เหมารวม = รับทั้งของและแรง · เฉพาะค่าแรง = บริษัทซื้อของเอง · ยอด “จ่ายช่างแล้ว” คิดจากงวดงานช่าง (แท็บงวดงาน) ที่ระบุชื่อช่างนี้ · ราคากลางแก้ได้ที่เมนู ราคากลาง (วัสดุ / ค่าแรง)</div>
      {err && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 8 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
        <button onClick={onCancel} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>ยกเลิก</button>
        <button onClick={onSave} disabled={busy} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>{busy ? 'กำลังบันทึก…' : editing ? 'บันทึกการแก้ไข' : 'บันทึก'}</button>
      </div>
    </div>
  )
}

// หัวข้อประเมินผู้รับเหมาช่วง (ตรงกับแบบฟอร์มของบริษัท)
const EVAL_CRITERIA = ['คุณภาพของงานที่ส่งมอบ', 'ความตรงต่อเวลา', 'การปฏิบัติตามแบบและข้อกำหนด', 'การสื่อสารและการประสานงาน', 'การควบคุมแรงงานและทรัพยากร', 'การรักษาความปลอดภัยหน้างาน', 'การตอบสนองต่อการแก้ไขงาน', 'ความสะอาดและการเก็บงาน', 'การปฏิบัติตามกฎระเบียบ', 'ความร่วมมือโดยรวม']
function gradeColor(g?: string | null) {
  if (g === 'ดีมาก') return { c: '#2E7D55', bg: '#E2F1EA' }
  if (g === 'ดี') return { c: '#30506A', bg: '#E2E9EF' }
  if (g === 'ปานกลาง') return { c: '#B7791F', bg: '#F6ECD6' }
  return { c: '#C24036', bg: '#FBEEEC' }
}

// แผงให้คะแนนประเมินผู้รับเหมาช่วง (1–5 ต่อหัวข้อ)
function EvalForm({ contractorId, onDone }: { contractorId: number; onDone: () => void }) {
  const [scores, setScores] = useState<Record<string, number>>({})
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const filled = Object.values(scores).filter((v) => v > 0)
  const avg = filled.length ? filled.reduce((a, b) => a + b, 0) / filled.length : 0
  const save = async () => {
    if (!filled.length) { setErr('ให้คะแนนอย่างน้อย 1 หัวข้อ'); return }
    setBusy(true); setErr('')
    try { await api.post('/contractors/' + contractorId + '/evals', { scores, comment }); onDone() }
    catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div style={{ borderTop: '1px solid #F1F4F6', padding: '12px 16px', background: '#FBFCFD' }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>ประเมินผลงาน (1 = แย่ที่สุด … 5 = ดีมาก)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {EVAL_CRITERIA.map((k) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, fontSize: 12.5, color: '#3C4750' }}>{k}</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setScores((s) => ({ ...s, [k]: n }))} style={{ width: 26, height: 26, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, border: '1px solid ' + (scores[k] === n ? '#30506A' : '#D2DAE1'), background: scores[k] === n ? '#30506A' : '#fff', color: scores[k] === n ? '#fff' : '#5C6770' }}>{n}</button>
            ))}
          </div>
        ))}
      </div>
      <input style={{ ...field, marginTop: 10, width: '100%' }} placeholder="ความเห็นเพิ่มเติม (ถ้ามี)" value={comment} onChange={(e) => setComment(e.target.value)} />
      {err && <div style={{ fontSize: 12, color: '#C24036', marginTop: 8 }}>{err}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <span style={{ fontSize: 12.5, color: '#5C6770' }}>คะแนนเฉลี่ย: <b className="num" style={{ color: '#1C2730' }}>{avg.toFixed(2)}</b> / 5</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={onDone} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>ยกเลิก</button>
          <button onClick={save} disabled={busy} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '7px 16px', cursor: 'pointer' }}>{busy ? 'กำลังบันทึก…' : 'บันทึกผลประเมิน'}</button>
        </div>
      </div>
    </div>
  )
}

// แผงจัดการ "ค่าของที่บริษัทออกให้ผู้รับเหมาก่อน แล้วหักจากงวด"
function AdvancePanel({ contractorId, advLeft, onDone }: { contractorId: number; advLeft: number; onDone: () => void }) {
  const [rows, setRows] = useState<Advance[]>([])
  const [item, setItem] = useState('')
  const [amt, setAmt] = useState('')
  const [ded, setDed] = useState('')
  const [err, setErr] = useState('')
  const load = () => api.get<Advance[]>('/contractors/' + contractorId + '/advances').then(setRows).catch(() => {})
  useEffect(() => { load() /* eslint-disable-next-line */ }, [contractorId])
  const refresh = () => { load(); onDone() }
  const addAdvance = async () => {
    if (!unMoney(amt)) { setErr('กรอกจำนวนเงินค่าของ'); return }
    setErr('')
    try { await api.post('/contractors/' + contractorId + '/advances', { type: 'advance', item, amount: unMoney(amt) }); setItem(''); setAmt(''); refresh() } catch (e) { setErr((e as Error).message) }
  }
  const addDeduct = async () => {
    if (!unMoney(ded)) { setErr('กรอกจำนวนที่จะหัก'); return }
    setErr('')
    try { await api.post('/contractors/' + contractorId + '/advances', { type: 'deduct', item: 'หักค่าของจากงวด', amount: unMoney(ded) }); setDed(''); refresh() } catch (e) { setErr((e as Error).message) }
  }
  const del = async (id: number) => { await api.del('/contractor-advances/' + id); refresh() }
  return (
    <div style={{ borderTop: '1px solid #F1F4F6', padding: '12px 16px', background: '#FCFAF4' }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8, color: '#8A6D3B' }}>ค่าของที่บริษัทออกให้ก่อน (เหมารวม) — แล้วหักจากงวดทีหลัง</div>
      {rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {rows.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: r.type === 'advance' ? '#C0852C' : '#2E7D55', background: r.type === 'advance' ? '#F6ECD6' : '#E2F1EA', padding: '1px 8px', borderRadius: 20 }}>{r.type === 'advance' ? 'ออกค่าของ' : 'หักจากงวด'}</span>
              <span style={{ flex: 1, color: '#3C4750' }}>{r.item || '-'}</span>
              <span style={{ color: '#94A0A8', fontSize: 11 }}>{r.date}</span>
              <span className="num" style={{ fontWeight: 600, color: r.type === 'advance' ? '#C0852C' : '#2E7D55' }}>{r.type === 'advance' ? '+' : '−'}{baht(r.amount)}</span>
              <button onClick={() => del(r.id)} style={{ border: 'none', background: 'none', color: '#C24036', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr auto', gap: 8, alignItems: 'center' }}>
        <input style={{ ...field, padding: '7px 9px', fontSize: 12.5 }} placeholder="รายการของที่ออกให้ (เช่น ปูน 20 ถุง)" value={item} onChange={(e) => setItem(e.target.value)} />
        <MoneyInput style={{ ...field, padding: '7px 9px', fontSize: 12.5 }} placeholder="จำนวนเงิน" value={amt} onChange={setAmt} />
        <button onClick={addAdvance} style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#fff', background: '#C0852C', border: 'none', borderRadius: 7, padding: '7px 12px', cursor: 'pointer' }}>+ ออกค่าของ</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr auto', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <div style={{ fontSize: 12, color: '#8A6D3B', alignSelf: 'center' }}>หักคืนจากงวด (คงเหลือ {baht(advLeft)})</div>
        <MoneyInput style={{ ...field, padding: '7px 9px', fontSize: 12.5 }} placeholder="จำนวนที่หัก" value={ded} onChange={setDed} />
        <button onClick={addDeduct} disabled={advLeft <= 0} style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#fff', background: advLeft > 0 ? '#2E7D55' : '#B7C3BA', border: 'none', borderRadius: 7, padding: '7px 12px', cursor: advLeft > 0 ? 'pointer' : 'default' }}>− หักจากงวด</button>
      </div>
      {err && <div style={{ fontSize: 12, color: '#C24036', marginTop: 8 }}>{err}</div>}
    </div>
  )
}

// Real per-house contractors (ช่าง/ผู้รับเหมา) — add / list / delete.
export default function ContractorsPanel({ houseCode }: { houseCode: string }) {
  const [rows, setRows] = useState<Contractor[]>([])
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [f, setF] = useState<HireForm>(blankHire)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [evalFor, setEvalFor] = useState<number | null>(null)
  const [advFor, setAdvFor] = useState<number | null>(null)
  const { rates } = useLaborRates()
  const rateOf = useMemo(() => new Map(rates.map((r) => [r.id, r])), [rates])

  const load = () => api.get<Contractor[]>('/houses/' + houseCode + '/contractors').then(setRows).catch(() => {})
  useEffect(() => { load() /* eslint-disable-next-line */ }, [houseCode])

  const openAdd = () => { setF(blankHire); setErr(''); setEditId(null); setAdding((v) => !v) }
  const openEdit = (c: Contractor) => {
    setAdding(false); setErr('')
    setEditId(c.id)
    // ยอดรวมที่ระบบคำนวณเอง (ปริมาณ × ราคา) → ปล่อยช่องว่างไว้ให้คำนวณใหม่ตามราคาที่แก้; กรอกเองไว้ → คงค่าไว้
    const auto = (c.qty || 0) > 0 && (c.unit_price || 0) > 0 ? Math.round((c.qty || 0) * (c.unit_price || 0) * 100) / 100 : 0
    const customTotal = (c.contract_total || 0) > 0 && Math.abs((c.contract_total || 0) - auto) >= 0.01
    setF({ name: c.name, role: c.role || '', type: c.type || 'เหมารวม', labor_rate_id: c.labor_rate_id ? String(c.labor_rate_id) : '', qty: c.qty ? String(c.qty) : '', unit_price: c.unit_price ? String(c.unit_price) : '', contract_total: customTotal ? String(c.contract_total) : '', price_note: c.price_note || '' })
  }
  const cancel = () => { setAdding(false); setEditId(null); setF(blankHire); setErr('') }
  const submit = async () => {
    if (!f.name.trim()) { setErr('กรอกชื่อช่าง/ผู้รับเหมา'); return }
    const rate = rateOf.get(Number(f.labor_rate_id))
    const up = unMoney(f.unit_price)
    if (compareRate(rate, up) === 'สูงกว่า') {
      if (!f.price_note.trim()) { setErr('ราคาตกลงสูงกว่าราคากลาง — กรอกเหตุผลก่อนบันทึก (หรือต่อรองให้ไม่เกินราคากลาง)'); return }
      if (!confirm(`ราคาตกลง ${baht(up)}/${rate!.unit} สูงกว่าราคากลาง ${baht(rate!.price_max)}/${rate!.unit}\nยืนยันจ้างในราคานี้? (บันทึกลงประวัติตรวจสอบ)`)) return
    }
    setErr(''); setBusy(true)
    const body = { name: f.name.trim(), role: f.role.trim(), type: f.type, labor_rate_id: f.labor_rate_id ? Number(f.labor_rate_id) : null, qty: unMoney(f.qty), unit_price: up, contract_total: unMoney(f.contract_total), price_note: f.price_note.trim() }
    try {
      if (editId) await api.put('/contractors/' + editId, body)
      else await api.post('/houses/' + houseCode + '/contractors', { ...body, advance: 0, deducted: 0, paid: 0 })
      cancel(); load()
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  const remove = async (c: Contractor) => { if (!confirm(`ลบ "${c.name}" ออกจากบ้านนี้?`)) return; await api.del('/contractors/' + c.id); load() }

  return (
    <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>ช่าง / ผู้รับเหมา</span>
        <span style={{ marginLeft: 10, fontSize: 11.5, color: '#94A0A8' }}>เลือกหมวดงานตอนจ้าง → ระบบโชว์ราคากลางเป็นราคาแนะนำ</span>
        <button onClick={openAdd} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>+ จ้างช่าง</button>
      </div>
      {adding && editId === null && <HireForm f={f} setF={setF} rates={rates} err={err} busy={busy} onCancel={cancel} onSave={submit} editing={false} />}
      {rows.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: '#94A0A8', fontSize: 13 }}>ยังไม่มีช่าง/ผู้รับเหมา</div>}
      {rows.map((c) => {
        const advTotal = c.adv_total || 0
        const deductTotal = c.deduct_total || 0
        const advLeft = c.adv_left ?? (advTotal - deductTotal)
        const workTotal = c.work_total || 0
        const workPaid = c.work_paid || 0
        const workLeft = Math.max(0, workTotal - workPaid)
        const cashReal = Math.max(0, workPaid - deductTotal) // จ่ายเงินสดจริง = จ่ายช่างแล้ว − หักค่าของ
        const vc = vsColor(c.price_vs)
        const contractTotal = c.contract_total || 0
        const overContract = contractTotal > 0 && workTotal > contractTotal // ตั้งงวดงานเกินยอดที่ตกลงจ้าง
        if (editId === c.id) return <HireForm key={c.id} f={f} setF={setF} rates={rates} err={err} busy={busy} onCancel={cancel} onSave={submit} editing />
        return (
          <div key={c.id} style={{ border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: '#F7F9FB', borderBottom: '1px solid #EEF1F4' }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: '#30506A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 15 }}>{c.name[0]}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: 11.5, color: '#5C6770' }}>{c.role || '-'}</div>
                {c.rate_label && (
                  <div style={{ fontSize: 11.5, color: '#5C6770', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span>ราคากลาง <b className="num">{c.rate_max && c.rate_max > 0 ? (c.rate_min === c.rate_max ? baht(c.rate_max) : `${baht(c.rate_min || 0)}–${baht(c.rate_max)}`) : 'เสนอราคา'}</b>{c.rate_max && c.rate_max > 0 ? `/${c.rate_unit}` : ''}</span>
                    {(c.unit_price || 0) > 0 && <span>· ตกลง <b className="num">{baht(c.unit_price || 0)}</b>/{c.rate_unit}{(c.qty || 0) > 0 ? ` × ${(c.qty || 0).toLocaleString('en-US')} ${c.rate_unit}` : ''}</span>}
                    {vc && <span title={c.price_note ? 'เหตุผล: ' + c.price_note : undefined} style={{ fontSize: 10.5, fontWeight: 700, color: vc.c, background: vc.bg, padding: '1px 8px', borderRadius: 20 }}>{vc.t}</span>}
                  </div>
                )}
              </div>
              {c.eval_grade && (() => { const g = gradeColor(c.eval_grade); return <span title={`คะแนนเฉลี่ย ${c.eval_avg?.toFixed(2)}/5`} style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: g.c, background: g.bg, padding: '4px 10px', borderRadius: 20 }}>★ {c.eval_avg?.toFixed(1)} · {c.eval_grade}</span> })()}
              <span style={{ marginLeft: c.eval_grade ? 0 : 'auto', fontSize: 11.5, fontWeight: 600, color: c.type === 'เหมารวม' ? '#30506A' : '#C0852C', background: c.type === 'เหมารวม' ? '#E2E9EF' : '#F6ECD6', padding: '4px 11px', borderRadius: 20 }}>{c.type}</span>
              <button onClick={() => setAdvFor(advFor === c.id ? null : c.id)} className="hov-f3f5f7" title="ค่าของที่บริษัทออกให้ก่อน แล้วหักจากงวด" style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 500, color: '#C0852C', background: '#fff', border: '1px solid #EAD9B6', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>ค่าของออกให้ก่อน</button>
              <button onClick={() => setEvalFor(evalFor === c.id ? null : c.id)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 500, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>ประเมิน</button>
              <button onClick={() => openEdit(c)} className="hov-f3f5f7" title="แก้ชื่อ / หมวดงาน / ราคาตกลง" style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 500, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>✎ แก้ไข</button>
              <button onClick={() => remove(c)} style={{ border: 'none', background: 'none', color: '#C24036', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
            {contractTotal > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: 12, color: overContract ? '#C24036' : '#5C6770', background: overContract ? '#FBEEEC' : '#FFF', borderBottom: '1px solid #F1F4F6' }}>
                <span>ยอดตกลงจ้าง <b className="num" style={{ color: '#1C2730' }}>{baht(contractTotal)}</b></span>
                <span>· ตั้งงวดงานแล้ว <b className="num">{baht(workTotal)}</b></span>
                {overContract ? <span>⚠ งวดงานเกินยอดที่ตกลงจ้าง {baht(workTotal - contractTotal)}</span> : <span>· ยังตั้งงวดได้อีก {baht(contractTotal - workTotal)}</span>}
              </div>
            )}
            {/* งวดงานช่าง — ดึงจากแท็บ "งวดงาน" (ฝั่งช่าง) ที่ระบุชื่อช่างคนนี้ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0, borderBottom: '1px solid #F1F4F6' }}>
              {([['งวดงานรวม', baht(workTotal), '#1C2730'], ['จ่ายช่างแล้ว', baht(workPaid), '#2E7D55'], ['คงค้างจ่าย', baht(workLeft), '#C0852C'], ['จ่ายเงินสดจริง', baht(cashReal), '#30506A']] as const).map(([l, v, col], i) => (
                <div key={i} style={{ padding: '12px 14px', borderRight: i < 3 ? '1px solid #F1F4F6' : 'none' }} title={l === 'จ่ายเงินสดจริง' ? 'จ่ายช่างแล้ว − ค่าของที่หักไปแล้ว' : undefined}><div style={{ fontSize: 11, color: '#5C6770' }}>{l}</div><div className="num" style={{ fontSize: 16, fontWeight: 700, marginTop: 3, color: col }}>{v}</div></div>
              ))}
            </div>
            {/* ค่าของที่บริษัทออกให้ก่อน (เหมารวม) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 0 }}>
              {([['ค่าของออกให้ก่อน', baht(advTotal), '#C0852C'], ['หักจากงวดแล้ว', baht(deductTotal), '#2E7D55'], ['ค่าของคงเหลือรอหัก', baht(advLeft), advLeft > 0 ? '#C24036' : '#94A0A8']] as const).map(([l, v, col], i) => (
                <div key={i} style={{ padding: '12px 14px', borderRight: i < 2 ? '1px solid #F1F4F6' : 'none' }}><div style={{ fontSize: 11, color: '#5C6770' }}>{l}</div><div className="num" style={{ fontSize: 15, fontWeight: 700, marginTop: 3, color: col }}>{v}</div></div>
              ))}
            </div>
            {advFor === c.id && <AdvancePanel contractorId={c.id} advLeft={advLeft} onDone={load} />}
            {evalFor === c.id && <EvalForm contractorId={c.id} onDone={() => { setEvalFor(null); load() }} />}
          </div>
        )
      })}
    </div>
  )
}
