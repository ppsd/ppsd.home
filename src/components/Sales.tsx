import { useState } from 'react'
import { useApp } from '../store'
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
  const { data, addSalesDoc, convertQuote } = useApp()
  const docs = data.salesDocs
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

  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0)
  const vat = Math.round(subtotal * 0.07)

  const setItem = (i: number, patch: Partial<SalesItem>) => setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)))

  const submit = async () => {
    setBusy(true); setErr('')
    try {
      const doc = await addSalesDoc({ type, customer, house_code: houseCode, items: items.filter((it) => it.desc.trim()) })
      setAdding(false); setCustomer(''); setHouseCode(''); setItems([{ desc: '', qty: 1, price: 0 }])
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, marginTop: 12, fontSize: 13 }}>
            <span style={{ color: '#5C6770' }}>รวม <span className="num" style={{ fontWeight: 600, color: '#1C2730' }}>{baht(subtotal)}</span></span>
            <span style={{ color: '#5C6770' }}>VAT 7% <span className="num" style={{ fontWeight: 600, color: '#1C2730' }}>{baht(vat)}</span></span>
            <span style={{ color: '#5C6770' }}>สุทธิ <span className="num" style={{ fontWeight: 700, color: '#2E7D55' }}>{baht(subtotal + vat)}</span></span>
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
                  <td className="num" style={{ ...td, fontFamily: 'monospace', color: '#5C6770' }}>{d.no}</td>
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
