import { useState } from 'react'
import { useApp } from '../store'
import type { ApiPO } from '../store'
import { api } from '../api'
import { baht } from '../data'

// ตรวจรับของ: เทียบ PO กับใบส่งของ (อัปโหลดรูป → AI อ่าน → เทียบชื่อ/จำนวน/ราคา → ผ่าน/ไม่ผ่าน)
type DLine = { name: string; qty: string; unit: string; price: string }
type CmpLine = { desc: string; qty: number; unit: string; price: number; d_name: string; d_qty: number | null; d_price: number | null; nameOk: boolean; qtyOk: boolean | null; priceOk: boolean | null; pass: boolean }
type Detail = { result: string; lines: CmpLine[]; extras: { name: string; qty: number; price: number }[]; totalOrder: number; totalDelivery: number; totalOk: boolean | null; tolPct: number }
type FileRec = { id: number; name: string; mime?: string }

const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 12.5, border: '1px solid #D2DAE1', borderRadius: 7, padding: '6px 8px', outline: 'none', width: '100%', boxSizing: 'border-box' }
const num = (n: number) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
const mark = (ok: boolean | null) => ok === null ? <span style={{ color: '#94A0A8' }}>–</span> : ok ? <span style={{ color: '#2E7D55', fontWeight: 700 }}>✓</span> : <span style={{ color: '#C24036', fontWeight: 700 }}>✗</span>

export default function GoodsReceipt({ po, onClose, onDone }: { po: ApiPO; onClose: () => void; onDone: () => void }) {
  const app = useApp()
  const canOverride = app.user?.role === 'admin' || app.user?.role === 'accounting' || !!app.user?.isManager
  const order = po.items && po.items.length ? po.items : [{ desc: po.item, qty: 0, unit: '', price: po.amount }]
  const [files, setFiles] = useState<FileRec[]>([])
  const [delivery, setDelivery] = useState<DLine[]>([])
  const [aiBusy, setAiBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [receiptId, setReceiptId] = useState<number | null>(null)
  const [note, setNote] = useState('')

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setErr(''); setDetail(null); setAiBusy(true)
    try {
      // เก็บไฟล์ถาวร (ดูย้อนหลังได้)
      const rec = await api.uploadFile<FileRec>(f, { house: po.house_code, category: 'ใบส่งของ' })
      setFiles((cur) => [...cur, { id: rec.id, name: rec.name, mime: rec.mime }])
      // ให้ AI อ่านรายการในใบส่งของ
      try {
        const r = await api.uploadRaw<{ items: { name: string; qty: number; unit: string; price: number }[] }>('/purchase-orders/' + po.id + '/extract-receipt', f)
        if (r.items?.length) setDelivery(r.items.map((it) => ({ name: it.name, qty: String(it.qty || ''), unit: it.unit || '', price: String(it.price || '') })))
        else setErr('AI อ่านใบส่งของไม่พบรายการ — กรอกรายการเองด้านล่างได้')
      } catch (ex) {
        setErr((ex as Error).message + ' — กรอกรายการในใบส่งของเองด้านล่างได้')
      }
    } catch (ex) { setErr((ex as Error).message) }
    setAiBusy(false)
  }

  const addRow = () => setDelivery((d) => [...d, { name: '', qty: '', unit: '', price: '' }])
  const setRow = (i: number, k: keyof DLine, v: string) => setDelivery((d) => d.map((x, j) => j === i ? { ...x, [k]: v } : x))
  const delRow = (i: number) => setDelivery((d) => d.filter((_, j) => j !== i))

  const check = async () => {
    const items = delivery.filter((d) => d.name.trim()).map((d) => ({ name: d.name.trim(), qty: Number(d.qty) || 0, unit: d.unit, price: Number(d.price) || 0 }))
    if (!items.length) { setErr('ยังไม่มีรายการในใบส่งของ'); return }
    setBusy(true); setErr('')
    try {
      const r = await api.post<{ result: string; detail: Detail; receipt_id: number }>('/purchase-orders/' + po.id + '/receive', { delivery_items: items, files, note })
      setDetail(r.detail); setReceiptId(r.receipt_id); onDone()
    } catch (ex) { setErr((ex as Error).message) }
    setBusy(false)
  }

  const override = async () => {
    if (!receiptId) return
    if (!confirm('ยอมรับผลเป็น “ผ่าน” ทั้งที่ตรวจไม่ตรง? (จะบันทึกว่าผู้จัดการอนุมัติรับของ)')) return
    setBusy(true)
    try { await api.post('/goods-receipts/' + receiptId + '/override', { result: 'ผ่าน', note }); setDetail((d) => d ? { ...d, result: 'ผ่าน' } : d); onDone() } catch (ex) { setErr((ex as Error).message) }
    setBusy(false)
  }

  const th: React.CSSProperties = { padding: '6px 8px', fontSize: 11.5, fontWeight: 600, color: '#5C6770', textAlign: 'left', borderBottom: '1px solid #E1E5EA' }
  const td: React.CSSProperties = { padding: '6px 8px', fontSize: 12.5, borderBottom: '1px solid #F1F4F6' }
  const passed = detail?.result === 'ผ่าน'

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 70, overflow: 'auto', padding: '32px 16px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 720, maxWidth: '100%', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        {/* หัว */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #EEF1F4', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 700 }}>ตรวจรับของ · {po.no}</div>
            <div style={{ fontSize: 12, color: '#94A0A8' }}>อัปโหลดรูปใบส่งของ ระบบจะเทียบชื่อ/จำนวน/ราคากับใบสั่งซื้อ (PO) ให้อัตโนมัติ</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#EDF1F4', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>ปิด</button>
        </div>

        <div style={{ padding: '16px 22px' }}>
          {/* รายการที่สั่งใน PO */}
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#30506A', marginBottom: 5 }}>รายการที่สั่งใน PO</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
            <thead><tr><th style={th}>ชื่อสินค้า</th><th style={{ ...th, textAlign: 'right', width: 70 }}>จำนวน</th><th style={{ ...th, width: 60 }}>หน่วย</th><th style={{ ...th, textAlign: 'right', width: 90 }}>ราคา/หน่วย</th></tr></thead>
            <tbody>
              {order.map((o, i) => (
                <tr key={i}><td style={td}>{o.desc}</td><td style={{ ...td, textAlign: 'right' }} className="num">{o.qty > 0 ? num(o.qty) : '–'}</td><td style={td}>{o.unit || '–'}</td><td style={{ ...td, textAlign: 'right' }} className="num">{o.price > 0 ? num(o.price) : '–'}</td></tr>
              ))}
            </tbody>
          </table>

          {/* อัปโหลดใบส่งของ */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', borderRadius: 9, padding: '9px 16px', cursor: aiBusy ? 'default' : 'pointer' }}>
              📷 อัปโหลดรูปใบส่งของ
              <input type="file" accept="image/*,application/pdf" onChange={pickFile} disabled={aiBusy} style={{ display: 'none' }} />
            </label>
            {aiBusy && <span style={{ fontSize: 12.5, color: '#B7791F' }}>⏳ AI กำลังอ่านใบส่งของ…</span>}
            {files.map((f) => (
              <button key={f.id} onClick={() => api.openFile('/files/' + f.id + '/view')} style={{ fontFamily: 'inherit', fontSize: 12, color: '#30506A', background: '#E2E9EF', border: 'none', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>🖼 {f.name}</button>
            ))}
            <button onClick={addRow} style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12.5, color: '#30506A', background: '#fff', border: '1px dashed #B9C6D0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>+ กรอกรายการเอง</button>
          </div>

          {/* รายการในใบส่งของ (แก้ได้) */}
          {delivery.length > 0 && (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#C0852C', marginBottom: 5 }}>รายการในใบส่งของ <span style={{ fontWeight: 400, color: '#94A0A8', fontSize: 11.5 }}>· ตรวจ/แก้ให้ตรงกับใบส่งของจริงก่อนกดตรวจสอบ</span></div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                <thead><tr><th style={th}>ชื่อสินค้า</th><th style={{ ...th, width: 66 }}>จำนวน</th><th style={{ ...th, width: 56 }}>หน่วย</th><th style={{ ...th, width: 84 }}>ราคา/หน่วย</th><th style={{ ...th, width: 26 }} /></tr></thead>
                <tbody>
                  {delivery.map((d, i) => (
                    <tr key={i}>
                      <td style={td}><input style={field} value={d.name} onChange={(e) => setRow(i, 'name', e.target.value)} /></td>
                      <td style={td}><input style={{ ...field, textAlign: 'right' }} inputMode="decimal" value={d.qty} onChange={(e) => setRow(i, 'qty', e.target.value)} /></td>
                      <td style={td}><input style={field} value={d.unit} onChange={(e) => setRow(i, 'unit', e.target.value)} /></td>
                      <td style={td}><input style={{ ...field, textAlign: 'right' }} inputMode="decimal" value={d.price} onChange={(e) => setRow(i, 'price', e.target.value)} /></td>
                      <td style={{ ...td, textAlign: 'center' }}><button onClick={() => delRow(i)} style={{ border: 'none', background: 'none', color: '#C24036', cursor: 'pointer', fontSize: 14 }}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {delivery.length > 0 && <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุ (ถ้ามี) — เช่น ของขาด 2 ถุง ผู้ขายจะส่งเพิ่ม" style={{ ...field, marginBottom: 10 }} />}

          {err && <div style={{ fontSize: 12.5, color: '#C24036', marginBottom: 10 }}>{err}</div>}

          {/* ผลตรวจสอบ */}
          {detail && (
            <div style={{ marginTop: 6 }}>
              <div style={{ background: passed ? '#E2F1EA' : '#FBEAE7', border: `1px solid ${passed ? '#B5DDC8' : '#EDC7C0'}`, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 22 }}>{passed ? '✅' : '⛔'}</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: passed ? '#2E7D55' : '#C24036' }}>{passed ? 'ผ่าน — PO ตรงกับใบส่งของ' : 'ไม่ผ่าน — ไม่ตรงกัน กรุณากลับไปตรวจสอบ'}</div>
                  <div style={{ fontSize: 12, color: '#5C6770' }}>ยอดรวม PO {baht(detail.totalOrder)} · ใบส่งของ {baht(detail.totalDelivery)} {detail.totalOk === false && <b style={{ color: '#C24036' }}>(ยอดไม่ตรง)</b>}</div>
                </div>
                {passed && <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#2E7D55' }}>สถานะ PO → รับของแล้ว</span>}
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
                <thead><tr>
                  <th style={th}>รายการ (PO)</th><th style={{ ...th, textAlign: 'center', width: 42 }}>ชื่อ</th>
                  <th style={{ ...th, textAlign: 'center', width: 60 }}>จำนวน</th><th style={{ ...th, textAlign: 'center', width: 60 }}>ราคา</th>
                </tr></thead>
                <tbody>
                  {detail.lines.map((l, i) => (
                    <tr key={i} style={{ background: l.pass ? 'transparent' : '#FDF3F1' }}>
                      <td style={td}>{l.desc}
                        {!l.pass && l.d_name && <div style={{ fontSize: 11, color: '#94A0A8' }}>ใบส่งของ: {l.d_name} · {l.d_qty ?? '–'} × {num(l.d_price || 0)}</div>}
                        {!l.nameOk && <div style={{ fontSize: 11, color: '#C24036' }}>ไม่พบสินค้านี้ในใบส่งของ</div>}
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>{mark(l.nameOk)}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{mark(l.qtyOk)}{l.qtyOk === false && <div style={{ fontSize: 10.5, color: '#C24036' }}>{num(l.qty)}→{l.d_qty ?? '–'}</div>}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{mark(l.priceOk)}{l.priceOk === false && <div style={{ fontSize: 10.5, color: '#C24036' }}>{num(l.price)}→{num(l.d_price || 0)}</div>}</td>
                    </tr>
                  ))}
                  {detail.extras.map((e, i) => (
                    <tr key={'x' + i} style={{ background: '#FDF3F1' }}>
                      <td style={td} colSpan={4}><span style={{ color: '#C24036', fontWeight: 600 }}>มีในใบส่งของแต่ไม่ได้สั่ง:</span> {e.name} · {num(e.qty)} × {num(e.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!passed && canOverride && <div style={{ textAlign: 'right', marginTop: 6 }}><button onClick={override} disabled={busy} style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#6B4E9E', background: '#EEE8F6', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>ผู้จัดการยอมรับรับของ (override)</button></div>}
            </div>
          )}

          {/* ปุ่มตรวจสอบ */}
          {!passed && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 14 }}>
              <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, color: '#1C2730', background: '#EDF1F4', border: 'none', borderRadius: 9, padding: '10px 18px', cursor: 'pointer' }}>ปิด</button>
              <button onClick={check} disabled={busy || aiBusy || !delivery.some((d) => d.name.trim())} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: (busy || aiBusy || !delivery.some((d) => d.name.trim())) ? '#9DB0BF' : '#30506A', border: 'none', borderRadius: 9, padding: '10px 22px', cursor: 'pointer' }}>{busy ? 'กำลังตรวจ…' : detail ? 'ตรวจสอบใหม่' : 'ตรวจสอบ'}</button>
            </div>
          )}
          {passed && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}><button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 9, padding: '10px 22px', cursor: 'pointer' }}>เสร็จสิ้น</button></div>}
        </div>
      </div>
    </div>
  )
}
