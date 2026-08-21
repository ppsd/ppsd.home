import { useState, useEffect } from 'react'
import { baht, onB, inStat } from '../data'
import { useApp } from '../store'
import type { ApiInstallment } from '../store'
import { api } from '../api'
import ReceiptDoc from './ReceiptDoc'
import MoneyInput from './MoneyInput'
import AcceptanceModal from './AcceptanceModal'

const th: React.CSSProperties = { padding: '9px 12px', fontWeight: 600, color: '#5C6770', fontSize: 12 }
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 10px', outline: 'none', width: '100%' }

const blank = { no: '', detail: '', days: '', due: '', due_iso: '', amount: '', contractor: '' }

// One side of a house's งวดงาน — ลูกค้า (รับเงิน) or ช่าง (จ่ายเงิน).
// Supports add / edit / delete / mark-collected(paid).
export default function InstallmentSection({
  houseCode,
  side,
  category = 'house',
  rows,
}: {
  houseCode: string
  side: 'customer' | 'contractor'
  category?: string
  rows: ApiInstallment[]
}) {
  const app = useApp()
  const isCustomer = side === 'customer'
  const accent = isCustomer ? '#2E7D55' : '#C0852C'
  const doneStatus = isCustomer ? 'เก็บแล้ว' : 'จ่ายแล้ว'
  const actionLabel = isCustomer ? 'เก็บเงิน' : 'จ่ายเงิน'

  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState<ApiInstallment | null>(null)
  const [acceptFor, setAcceptFor] = useState<ApiInstallment | null>(null)
  const [accMap, setAccMap] = useState<Record<number, string>>({}) // installment_id -> result
  const loadAcc = () => { if (isCustomer) api.get<{ installment_id: number; result: string }[]>('/acceptances?house_code=' + houseCode).then((list) => { const m: Record<number, string> = {}; list.forEach((a) => { if (m[a.installment_id] === undefined) m[a.installment_id] = a.result }); setAccMap(m) }).catch(() => {}) }
  useEffect(() => { loadAcc() /* eslint-disable-next-line */ }, [houseCode, isCustomer])
  const house = app.data.houses.find((h) => h.code === houseCode)
  // contractor-side งวด can be assigned to a specific ช่าง (loaded from the house)
  const [contractorNames, setContractorNames] = useState<string[]>([])
  useEffect(() => {
    if (!isCustomer) api.get<{ name: string }[]>('/houses/' + houseCode + '/contractors').then((cs) => setContractorNames(cs.map((c) => c.name))).catch(() => {})
  }, [houseCode, isCustomer])

  const total = rows.reduce((s, r) => s + r.amount, 0)
  const settled = rows.reduce((s, r) => s + (r.paid || 0), 0) // ยอดที่จ่าย/เก็บจริง (รวมบางส่วน)

  // customer-side งวด: ตรวจรับผ่าน (ผ่าน / ผ่านบางส่วน) แล้วหรือยัง
  const acceptOk = (r: ApiInstallment) => accMap[r.id] === 'ผ่าน' || accMap[r.id] === 'ผ่านบางส่วน'
  // ตรวจรับผ่านแล้ว หรือไม่ใช่ฝั่งลูกค้า → ไม่ต้องเตือน (ใช้แสดง * เตือนบนปุ่ม)
  const canCollect = (r: ApiInstallment) => !isCustomer || r.status === doneStatus || acceptOk(r)
  // ยังไม่ตรวจรับ → เตือนก่อน แต่ยังกดเก็บเงินได้ (คืน true = ให้ทำต่อ)
  const warnIfNotAccepted = (r: ApiInstallment) => {
    if (!isCustomer || r.status === doneStatus || acceptOk(r)) return true
    return window.confirm(`งวดที่ ${r.no} ยังไม่ได้ตรวจรับงาน\n\nยืนยันเก็บเงินงวดนี้เลยหรือไม่?`)
  }

  const doCollect = async (r: ApiInstallment) => {
    if (!warnIfNotAccepted(r)) return
    try {
      await app.collectInstallment(r.id, houseCode)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const partialPay = async (r: ApiInstallment) => {
    if (!warnIfNotAccepted(r)) return
    const remaining = r.amount - (r.paid || 0)
    const word = isCustomer ? 'เก็บ' : 'จ่าย'
    const ans = window.prompt(`${word}งวดที่ ${r.no} ทีละบางส่วน — ใส่จำนวนเงินครั้งนี้\n(คงเหลือ ${remaining.toLocaleString('en-US')})`, String(remaining))
    if (ans == null) return
    const amt = Number(String(ans).replace(/,/g, '')) || 0
    if (amt <= 0) return
    try {
      await app.payInstallment(r.id, amt)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const startAdd = () => {
    setEditId(null)
    setForm({ ...blank, no: String(rows.length + 1) })
    setAdding(true)
  }
  const startEdit = (r: ApiInstallment) => {
    setAdding(false)
    setEditId(r.id)
    setForm({ no: String(r.no), detail: r.detail, days: String(r.days || ''), due: r.due || '', due_iso: r.due_iso || '', amount: String(r.amount), contractor: r.contractor || '' })
  }
  const cancel = () => {
    setAdding(false)
    setEditId(null)
    setForm(blank)
  }
  const save = async () => {
    setBusy(true)
    try {
      const body = {
        no: Number(form.no) || 0,
        detail: form.detail,
        days: form.days,
        due: form.due,
        due_iso: form.due_iso,
        amount: Number(String(form.amount).replace(/,/g, '')) || 0,
        contractor: isCustomer ? '' : form.contractor,
      }
      if (editId) await app.updateInstallment(editId, body)
      else await app.addInstallment(houseCode, { ...body, side, category })
      cancel()
    } finally {
      setBusy(false)
    }
  }
  const remove = async (r: ApiInstallment) => {
    if (!window.confirm(`ลบงวดที่ ${r.no} (${r.detail || '-'})?`)) return
    await app.deleteInstallment(r.id)
  }

  return (
    <div style={{ borderTop: '1px solid #EEF1F4' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '13px 18px 9px' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: accent, marginRight: 8 }} />
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>
          {isCustomer ? 'งวดงานลูกค้า (รับเงิน)' : 'งวดงานช่าง (จ่ายให้ช่าง)'}
        </div>
        <span style={{ marginLeft: 10, fontSize: 11.5, color: '#94A0A8' }}>
          {isCustomer ? 'เก็บแล้ว' : 'จ่ายแล้ว'} <span className="num" style={{ fontWeight: 600, color: accent }}>{baht(settled)}</span> / {baht(total)}
        </span>
        <button onClick={startAdd} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>+ เพิ่มงวด</button>
      </div>

      {adding && editId === null && <InstForm form={form} setForm={setForm} onSave={save} onCancel={cancel} busy={busy} contractorNames={contractorNames} showContractor={!isCustomer} />}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
            <th style={{ ...th, padding: '9px 18px' }}>งวด</th>
            <th style={th}>รายละเอียด</th>
            <th style={{ ...th, textAlign: 'center' }}>วัน</th>
            <th style={th}>กำหนด</th>
            <th style={{ ...th, textAlign: 'right' }}>จำนวนเงิน</th>
            <th style={{ ...th, textAlign: 'center' }}>สถานะ</th>
            <th style={{ ...th, padding: '9px 18px', textAlign: 'center' }}>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7} style={{ padding: 26, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีงวดงาน</td></tr>}
          {rows.map((r) => {
            if (editId === r.id) {
              return (
                <tr key={r.id}>
                  <td colSpan={7} style={{ padding: 0 }}>
                    <InstForm form={form} setForm={setForm} onSave={save} onCancel={cancel} busy={busy} contractorNames={contractorNames} showContractor={!isCustomer} />
                  </td>
                </tr>
              )
            }
            const o = onB(r.ontime)
            const s = inStat(r.status)
            const done = r.status === doneStatus
            return (
              <tr key={r.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                <td className="num" style={{ padding: '10px 18px', fontWeight: 600 }}>{r.no}</td>
                <td style={{ padding: '10px 12px', color: '#3C4750' }}>
                  <div>{r.detail}</div>
                  {!isCustomer && r.contractor && <div style={{ fontSize: 11, color: '#94A0A8' }}>👷 {r.contractor}</div>}
                </td>
                <td className="num" style={{ padding: '10px 12px', textAlign: 'center', color: '#5C6770' }}>{r.days}</td>
                <td className="num" style={{ padding: '10px 12px', color: r.status === 'เลยกำหนด' ? '#C24036' : '#5C6770' }}>{r.due}</td>
                <td className="num" style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                  <div>{baht(r.amount)}</div>
                  {(r.paid || 0) > 0 && (r.paid || 0) < r.amount && <div style={{ fontSize: 10.5, color: '#30506A' }}>{isCustomer ? 'เก็บแล้ว' : 'จ่ายแล้ว'} {baht(r.paid || 0)} · เหลือ {baht(r.amount - (r.paid || 0))}</div>}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: s.c, background: s.bg, padding: '2px 10px', borderRadius: 20 }}>{r.status}</span>
                  {isCustomer && r.ontime && r.ontime !== '-' && <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 600, color: o.c, background: o.bg, padding: '1px 7px', borderRadius: 20 }}>{r.ontime}</span>}
                </td>
                <td style={{ padding: '10px 18px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: 5, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                    {(() => { const ok = canCollect(r); return <button onClick={() => doCollect(r)} title={done ? 'ยกเลิกการจ่าย/เก็บทั้งงวด' : ok ? 'จ่าย/เก็บเต็มจำนวน' : 'ยังไม่ได้ตรวจรับงวดนี้ — กดเพื่อเก็บเงิน (ระบบจะเตือนก่อน)'} style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#fff', background: done ? '#94A0A8' : accent, border: 'none', borderRadius: 7, padding: '3px 9px', cursor: 'pointer' }}>{done ? 'ยกเลิก' : actionLabel + 'เต็ม'}{!done && !ok && ' *'}</button> })()}
                    {!done && (() => { const ok = canCollect(r); return <button onClick={() => partialPay(r)} title={ok ? 'จ่าย/เก็บทีละบางส่วน' : 'ยังไม่ได้ตรวจรับงวดนี้ — กดเพื่อเก็บเงิน (ระบบจะเตือนก่อน)'} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: accent, background: '#fff', border: `1px solid ${accent}55`, borderRadius: 7, padding: '3px 9px', cursor: 'pointer' }}>บางส่วน{!ok && ' *'}</button> })()}
                    {isCustomer && (() => { const ar = accMap[r.id]; const col = ar === 'ผ่าน' ? { c: '#2E7D55', b: '#CDE3D6' } : ar === 'ไม่ผ่าน' ? { c: '#C24036', b: '#E7CDC9' } : ar ? { c: '#B7791F', b: '#EAD9B6' } : { c: '#30506A', b: '#D2DAE1' }; return <button onClick={() => setAcceptFor(r)} title="ตรวจรับงวดงาน (ก่อนเบิก)" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: col.c, background: '#fff', border: `1px solid ${col.b}`, borderRadius: 7, padding: '3px 9px', cursor: 'pointer' }}>{ar ? `ตรวจรับ: ${ar}` : 'ตรวจรับ'}</button> })()}
                    {isCustomer && (r.paid || 0) > 0 && <button onClick={() => setReceipt(r)} title="พิมพ์ใบเสร็จรับเงิน" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#2E7D55', background: '#fff', border: '1px solid #CDE3D6', borderRadius: 7, padding: '3px 9px', cursor: 'pointer' }}>ใบเสร็จ</button>}
                    <button onClick={() => startEdit(r)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '3px 9px', cursor: 'pointer' }}>แก้ไข</button>
                    <button onClick={() => remove(r)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#C24036', background: '#fff', border: '1px solid #E7CDC9', borderRadius: 7, padding: '3px 9px', cursor: 'pointer' }}>ลบ</button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #E1E5EA', background: '#F7F9FB' }}>
            <td colSpan={4} style={{ padding: '11px 18px', fontWeight: 600, color: '#5C6770' }}>รวม</td>
            <td className="num" style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 700, fontSize: 14 }}>{baht(total)}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
      {receipt && <ReceiptDoc inst={receipt} houseName={house?.name || ''} customer={house?.customer || ''} onClose={() => setReceipt(null)} />}
      {acceptFor && <AcceptanceModal inst={acceptFor} houseName={house?.name || ''} onClose={() => setAcceptFor(null)} onSaved={loadAcc} />}
    </div>
  )
}

function InstForm({
  form,
  setForm,
  onSave,
  onCancel,
  busy,
  contractorNames = [],
  showContractor = false,
}: {
  form: typeof blank
  setForm: (f: typeof blank) => void
  onSave: () => void
  onCancel: () => void
  busy: boolean
  contractorNames?: string[]
  showContractor?: boolean
}) {
  return (
    <div style={{ padding: '12px 18px', background: '#FAFBFC', borderBottom: '1px solid #EEF1F4' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 80px 130px 130px', gap: 8 }}>
        <input style={field} placeholder="งวด" value={form.no} onChange={(e) => setForm({ ...form, no: e.target.value })} />
        <input style={field} placeholder="รายละเอียดงาน" value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} />
        <input style={field} placeholder="วัน" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
        <input style={field} type="date" title="วันครบกำหนด (ใช้คำนวณอายุหนี้)" value={form.due_iso} onChange={(e) => setForm({ ...form, due_iso: e.target.value, due: '' })} />
        <MoneyInput style={field} placeholder="จำนวนเงิน" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
      </div>
      {showContractor && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12.5, color: '#5C6770' }}>จ่ายให้ช่าง:</span>
          <select style={{ ...field, width: 'auto', minWidth: 200 }} value={form.contractor} onChange={(e) => setForm({ ...form, contractor: e.target.value })}>
            <option value="">— ไม่ระบุช่าง —</option>
            {contractorNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {contractorNames.length === 0 && <span style={{ fontSize: 11.5, color: '#94A0A8' }}>(เพิ่มช่างได้ที่แท็บ “ช่าง / ผู้รับเหมา”)</span>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 9 }}>
        <button onClick={onCancel} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>ยกเลิก</button>
        <button onClick={onSave} disabled={busy} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '7px 16px', cursor: 'pointer' }}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
      </div>
    </div>
  )
}
