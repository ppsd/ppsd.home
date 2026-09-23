import { useState } from 'react'
import { moneySummary } from '../money'
import type { VatMode } from '../money'
import { useApp } from '../store'
import { api } from '../api'
import type { ApiSalesDoc, SalesItem } from '../store'
import { baht } from '../data'
import SalesDocPrint from './SalesDocPrint'

const th: React.CSSProperties = { padding: '9px 14px', fontWeight: 600, color: '#5C6770', fontSize: 12 }
const td: React.CSSProperties = { padding: '11px 14px' }
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '8px 11px', outline: 'none' }

const TYPE_LABEL: Record<string, string> = { quote: 'ใบเสนอราคา', invoice: 'ใบแจ้งหนี้', receipt: 'ใบเสร็จ' }
function typeStyle(t: string) {
  if (t === 'invoice') return { c: '#B7791F', bg: '#F6ECD6' }
  if (t === 'receipt') return { c: '#2E7D55', bg: '#E2F1EA' }
  return { c: '#30506A', bg: '#E2E9EF' }
}

export default function Sales() {
  const { data, addSalesDoc, convertQuote, deriveSalesDoc } = useApp()
  const docs = data.salesDocs
  // ต่อสายเอกสาร: ใบเสนอราคา → ใบแจ้งหนี้ → ใบเสร็จรับเงิน (เลขใหม่ อ้างอิงใบเดิม)
  const derive = async (d: ApiSalesDoc, to: 'invoice' | 'receipt') => {
    const label = to === 'invoice' ? 'ใบแจ้งหนี้' : 'ใบเสร็จรับเงิน'
    if (!window.confirm(`ออก${label}จาก ${d.no}?\nรายการ/ยอดเงินจะถูกคัดลอก และอ้างอิงเลขใบเดิมให้อัตโนมัติ`)) return
    try { const doc = await deriveSalesDoc(d.id, to); window.alert(`ออก${label} ${doc.no} แล้ว`) }
    catch (e) { window.alert((e as Error).message || 'ทำรายการไม่สำเร็จ') }
  }
  const signContract = async (d: ApiSalesDoc) => {
    const name = window.prompt(`เซ็นสัญญาจากใบเสนอราคา ${d.no}\nระบบจะสร้างบ้าน + งวดงานลูกค้า (ตามแผนมาตรฐาน) ให้อัตโนมัติ\n\nตั้งชื่อบ้าน:`, `บ้าน ${d.customer}`)
    if (name == null) return
    try {
      await convertQuote(d.id, name.trim())
      window.alert(`สร้างโครงการ "${name.trim() || 'บ้าน ' + d.customer}" + งวดงานลูกค้าแล้ว — ดูได้ที่เมนู "บ้าน"`)
    } catch (e) { window.alert((e as Error).message || 'ทำรายการไม่สำเร็จ') }
  }
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const docList = docs.filter((d) => `${d.no} ${d.customer} ${d.status}`.toLowerCase().includes(query.trim().toLowerCase()))
  const [type, setType] = useState<'quote' | 'invoice' | 'receipt'>('quote')
  const [customer, setCustomer] = useState('')
  const [houseCode, setHouseCode] = useState('')
  const houses = data.houses
  // picking a house auto-fills the customer name
  const pickHouse = (code: string) => {
    setHouseCode(code)
    const h = houses.find((x) => x.code === code)
    if (h?.customer) setCustomer(h.customer)
  }
  const [items, setItems] = useState<SalesItem[]>([{ desc: '', qty: 1, price: 0 }])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [printDoc, setPrintDoc] = useState<ApiSalesDoc | null>(null)
  // อัปโหลดใบเก่า (PDF/รูป) → AI อ่านมาเป็นร่าง + แนบไฟล์ไว้กับเอกสารใหม่
  const [attach, setAttach] = useState<File | null>(null)
  const [reading, setReading] = useState('')
  const [readNote, setReadNote] = useState('')
  const pickOld = async (e: React.ChangeEvent<HTMLInputElement>, useAi: boolean) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    if (!/pdf|image\//.test(file.type)) { setErr('รองรับ PDF หรือรูปภาพ'); return }
    if (file.size > 40 * 1024 * 1024) { setErr('ไฟล์ใหญ่เกิน 40MB'); return }
    setAttach(file); setErr(''); setReadNote('')
    if (!useAi) { setReadNote(`แนบไฟล์ ${file.name} แล้ว (ไม่ให้ AI อ่าน)`); return }
    setReading('AI กำลังอ่านใบเก่า… (อาจใช้เวลาสักครู่)')
    try {
      const r = await api.uploadRaw<{ doc_type: 'quote' | 'invoice' | 'receipt'; customer: string; items: { desc: string; qty: number; unit: string; price: number }[]; vat_mode: VatMode; total: number; note: string }>('/sales-docs/extract', file)
      if (!r.items.length) { setErr('AI อ่านไม่พบรายการในไฟล์นี้ — กรอกเองได้ ไฟล์ยังแนบอยู่'); return }
      setType(r.doc_type || 'quote'); if (r.customer) setCustomer(r.customer)
      setItems(r.items.map((it) => ({ desc: it.desc + (it.unit ? ` (${it.unit})` : ''), qty: it.qty || 1, price: it.price || 0 })))
      setVatMode(r.vat_mode || 'excl')
      setReadNote(`ดึงจาก ${file.name} แล้ว ${r.items.length} รายการ${r.total ? ` · ยอดในใบเดิม ${baht(r.total)}` : ''} — ตรวจ/แก้ราคาให้เป็นปัจจุบันก่อนบันทึก${r.note ? ' · ' + r.note : ''}`)
    } catch (ex) { setErr((ex as Error).message) } finally { setReading('') }
  }

  // ภาษีขาย: ลูกค้าบางรายไม่ต้องการ VAT (ราคารวมถูกลง) → เลือกได้ ไม่มี VAT / บวก VAT 7% / ราคารวม VAT แล้ว
  const [vatMode, setVatMode] = useState<VatMode>('excl')
  const lineSum = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0)
  const sm = moneySummary(lineSum, 0, vatMode)
  const subtotal = sm.before_vat
  const vat = sm.vat_amount

  const setItem = (i: number, patch: Partial<SalesItem>) => setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)))

  const submit = async () => {
    setBusy(true); setErr('')
    try {
      let attachment_file_id: number | undefined
      if (attach) { const f = await api.uploadFile<{ id: number }>(attach, { house: houseCode, category: 'เอกสารขาย (ใบเก่า)' }); attachment_file_id = f.id }
      const doc = await addSalesDoc({ type, customer, house_code: houseCode, items: items.filter((it) => it.desc.trim()), vat_mode: vatMode, attachment_file_id })
      setAdding(false); setCustomer(''); setHouseCode(''); setItems([{ desc: '', qty: 1, price: 0 }]); setVatMode('excl'); setAttach(null); setReadNote('')
      setPrintDoc(doc)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 13, color: '#5C6770' }}>เอกสารทั้งหมด <span className="num" style={{ fontWeight: 600, color: '#1C2730' }}>{docList.length}/{docs.length}</span> ฉบับ</div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาเลขที่/ลูกค้า/สถานะ" style={{ ...field, padding: '8px 11px', fontSize: 12.5, width: 220 }} />
        <button onClick={() => setAdding((v) => !v)} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '10px 16px', cursor: 'pointer' }}>+ สร้างเอกสาร</button>
      </div>

      {adding && (
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: 18 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <select style={{ ...field, width: 160 }} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="quote">ใบเสนอราคา</option>
              <option value="invoice">ใบแจ้งหนี้</option>
              <option value="receipt">ใบเสร็จรับเงิน</option>
            </select>
            <select style={{ ...field, width: 230 }} value={houseCode} onChange={(e) => pickHouse(e.target.value)}>
              <option value="">— ผูกกับบ้าน (ถ้ามี) —</option>
              {houses.map((h) => <option key={h.id} value={h.code}>{h.name} ({h.code})</option>)}
            </select>
            <input style={{ ...field, flex: 1 }} placeholder="ชื่อลูกค้า *" value={customer} onChange={(e) => setCustomer(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap', background: '#F6F3FB', border: '1px solid #D9D2EA', borderRadius: 9, padding: '8px 12px', fontSize: 12.5 }}>
            <span style={{ fontWeight: 600, color: '#6B4E9E' }}>📄 มีใบเก่า (PDF/รูป)?</span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#fff', background: '#6B4E9E', borderRadius: 8, padding: '6px 12px', cursor: reading ? 'wait' : 'pointer', fontWeight: 600 }}>🤖 อัปโหลดให้ AI อ่านมาเป็นร่าง<input type="file" accept="application/pdf,image/*" disabled={!!reading} onChange={(e) => pickOld(e, true)} style={{ display: 'none' }} /></label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>📎 แนบไฟล์อย่างเดียว<input type="file" accept="application/pdf,image/*" onChange={(e) => pickOld(e, false)} style={{ display: 'none' }} /></label>
            {reading && <span style={{ color: '#6B4E9E' }}>{reading}</span>}
            {!reading && readNote && <span style={{ color: '#2E7D55' }}>{readNote}</span>}
            {attach && !reading && <button onClick={() => { setAttach(null); setReadNote('') }} style={{ border: 'none', background: 'none', color: '#C24036', cursor: 'pointer' }}>✕ เอาไฟล์ออก</button>}
            <span style={{ fontSize: 11, color: '#94A0A8', width: '100%' }}>ใบเสนอราคาเก่าของบ้านอื่นเอามาใช้เป็นต้นแบบได้ — AI ดึงลูกค้า/รายการ/จำนวน/ราคา/แบบภาษี มาให้แล้วค่อยแก้ · ไฟล์จะแนบไว้กับเอกสารใหม่ (กด 📎 ในตารางเพื่อเปิดดู)</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 10 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#5C6770', fontSize: 12 }}>
                <th style={{ padding: '4px 6px' }}>รายการ</th>
                <th style={{ padding: '4px 6px', width: 90 }}>จำนวน</th>
                <th style={{ padding: '4px 6px', width: 130 }}>ราคา/หน่วย</th>
                <th style={{ padding: '4px 6px', width: 130, textAlign: 'right' }}>รวม</th>
                <th style={{ width: 34 }} />
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td style={{ padding: '3px 6px' }}><input style={{ ...field, width: '100%' }} value={it.desc} onChange={(e) => setItem(i, { desc: e.target.value })} placeholder="รายละเอียด" /></td>
                  <td style={{ padding: '3px 6px' }}><input type="number" style={{ ...field, width: '100%' }} value={it.qty} onChange={(e) => setItem(i, { qty: Number(e.target.value) })} /></td>
                  <td style={{ padding: '3px 6px' }}><input type="number" style={{ ...field, width: '100%' }} value={it.price} onChange={(e) => setItem(i, { price: Number(e.target.value) })} /></td>
                  <td className="num" style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 600 }}>{baht((Number(it.qty) || 0) * (Number(it.price) || 0))}</td>
                  <td style={{ textAlign: 'center' }}>{items.length > 1 && <button onClick={() => setItems(items.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: '#C24036', cursor: 'pointer', fontSize: 15 }}>✕</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setItems([...items, { desc: '', qty: 1, price: 0 }])} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>+ เพิ่มแถว</button>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 24, marginTop: 12, fontSize: 13, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#5C6770', marginRight: 'auto' }}>
              ภาษีมูลค่าเพิ่ม
              <select style={{ ...field, width: 'auto', padding: '6px 9px', fontSize: 12.5 }} value={vatMode} onChange={(e) => setVatMode(e.target.value as VatMode)}>
                <option value="excl">รวม VAT — บวก 7% จากราคา</option>
                <option value="none">ไม่รวม VAT — ไม่คิดภาษี (ราคารวมถูกลง)</option>
                <option value="incl">ราคาที่กรอกรวม VAT แล้ว (ถอด 7/107)</option>
              </select>
              {vatMode === 'none' && <span style={{ fontSize: 11.5, color: '#C0852C' }}>ในใบจะไม่มีบรรทัดภาษี</span>}
            </label>
            <span style={{ color: '#5C6770' }}>{vatMode === 'none' ? 'รวม' : 'ก่อน VAT'} <span className="num" style={{ fontWeight: 600, color: '#1C2730' }}>{baht(subtotal)}</span></span>
            {vatMode !== 'none' && <span style={{ color: '#5C6770' }}>VAT 7% <span className="num" style={{ fontWeight: 600, color: '#1C2730' }}>{baht(vat)}</span></span>}
            <span style={{ color: '#5C6770' }}>สุทธิ <span className="num" style={{ fontWeight: 700, color: '#2E7D55' }}>{baht(sm.total)}</span></span>
          </div>
          {err && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 10 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={() => setAdding(false)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ยกเลิก</button>
            <button onClick={submit} disabled={busy} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>{busy ? 'กำลังบันทึก…' : 'บันทึก + พิมพ์'}</button>
          </div>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
              <th style={{ ...th, padding: '9px 18px' }}>ประเภท</th>
              <th style={th}>เลขที่</th>
              <th style={th}>ลูกค้า</th>
              <th style={th}>วันที่</th>
              <th style={{ ...th, textAlign: 'right' }}>ยอดสุทธิ</th>
              <th style={{ ...th, textAlign: 'center' }}>สถานะ</th>
              <th style={{ ...th, padding: '9px 18px', textAlign: 'center' }}>พิมพ์</th>
            </tr>
          </thead>
          <tbody>
            {docList.length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#94A0A8' }}>{docs.length === 0 ? 'ยังไม่มีเอกสาร — กด “สร้างเอกสาร”' : 'ไม่พบเอกสารที่ค้นหา'}</td></tr>}
            {docList.map((d) => {
              const ts = typeStyle(d.type)
              return (
                <tr key={d.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td style={{ ...td, padding: '11px 18px' }}><span style={{ fontSize: 11, fontWeight: 600, color: ts.c, background: ts.bg, padding: '3px 11px', borderRadius: 20 }}>{TYPE_LABEL[d.type]}</span></td>
                  <td className="num" style={{ ...td, fontFamily: 'monospace', color: '#5C6770' }}>
                    <div>{d.no}{d.attachment_file_id ? <button onClick={(e) => { e.stopPropagation(); api.openFile('/files/' + d.attachment_file_id + '/view') }} title="เปิดไฟล์ใบเก่าที่แนบ" style={{ marginLeft: 6, border: 'none', background: 'none', cursor: 'pointer', fontSize: 12 }}>📎</button> : null}</div>
                    {d.ref && <div style={{ fontSize: 10.5, color: '#94A0A8' }}>อ้างอิง {d.ref}</div>}
                  </td>
                  <td style={{ ...td, fontWeight: 500 }}>
                    <div>{d.customer}</div>
                    {d.house_code && <div style={{ fontSize: 11, color: '#94A0A8' }}>🏠 {houses.find((h) => h.code === d.house_code)?.name || d.house_code}</div>}
                  </td>
                  <td className="num" style={{ ...td, color: '#5C6770' }}>{d.date}</td>
                  <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{baht(d.total)}</td>
                  <td style={{ ...td, textAlign: 'center', color: '#5C6770' }}>{d.status}</td>
                  <td style={{ ...td, padding: '11px 18px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                      {d.type === 'quote' && d.status !== 'เซ็นสัญญาแล้ว' && (
                        <button onClick={() => signContract(d)} title="เซ็นสัญญา → สร้างบ้าน + งวดงานลูกค้าอัตโนมัติ" className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 7, padding: '5px 11px', cursor: 'pointer' }}>เซ็นสัญญา</button>
                      )}
                      {d.type === 'quote' && d.status !== 'ออกใบแจ้งหนี้แล้ว' && (
                        <button onClick={() => derive(d, 'invoice')} title="ออกใบแจ้งหนี้จากใบเสนอราคานี้ (คัดลอกรายการ + อ้างอิงเลขใบเดิม)" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#B7791F', background: '#fff', border: '1px solid #ECDCB8', borderRadius: 7, padding: '5px 11px', cursor: 'pointer' }}>→ ใบแจ้งหนี้</button>
                      )}
                      {d.type === 'invoice' && d.status !== 'ชำระแล้ว' && (
                        <button onClick={() => derive(d, 'receipt')} title="รับเงินแล้ว → ออกใบเสร็จรับเงินจากใบแจ้งหนี้นี้" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#2E7D55', background: '#fff', border: '1px solid #CDE3D6', borderRadius: 7, padding: '5px 11px', cursor: 'pointer' }}>→ ใบเสร็จ</button>
                      )}
                      <button onClick={() => setPrintDoc(d)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 500, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '5px 11px', cursor: 'pointer' }}>พิมพ์</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {printDoc && <SalesDocPrint doc={printDoc} onClose={() => setPrintDoc(null)} />}
    </div>
  )
}
