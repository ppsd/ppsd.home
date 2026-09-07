import { useEffect, useState } from 'react'
import { api } from '../api'
import { useApp } from '../store'

// สต๊อกวัสดุ (สต๊อกกลางบริษัท) — นับจำนวน/ที่อยู่ของ
// รับเข้า: อัตโนมัติจาก PO ที่ไม่ผูกบ้าน (ซื้อเข้าสต๊อก) หรือกรอกเอง · เบิกออก: ระบุบ้าน/คนเบิก
interface StockItem { id: number; name: string; unit: string; qty: number; min_qty: number; updated: string; low: boolean }
interface StockMove { id: number; item_id: number; kind: string; qty: number; house_code: string; note: string; by: string; po_id?: number | null; date_iso: string; item_name: string; unit: string }

const th: React.CSSProperties = { padding: '9px 14px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'left' }
const td: React.CSSProperties = { padding: '10px 14px' }
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '8px 11px', outline: 'none' }

const KIND_LABEL: Record<string, { t: string; c: string; bg: string }> = {
  in: { t: 'รับเข้า', c: '#2E7D55', bg: '#E2F1EA' },
  out: { t: 'เบิกออก', c: '#C24036', bg: '#FBEEEC' },
  adjust: { t: 'ตรวจนับ', c: '#B7791F', bg: '#F6ECD6' },
}

export default function Stock() {
  const { data } = useApp()
  const [items, setItems] = useState<StockItem[] | null>(null)
  const [moves, setMoves] = useState<StockMove[]>([])
  const [pickItem, setPickItem] = useState<number | 0>(0) // 0 = ประวัติทั้งหมด
  const [query, setQuery] = useState('')
  const load = () => {
    api.get<StockItem[]>('/stock').then(setItems).catch(() => setItems([]))
    api.get<StockMove[]>('/stock/moves' + (pickItem ? '?item_id=' + pickItem : '')).then(setMoves).catch(() => setMoves([]))
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [pickItem])

  // ฟอร์มบันทึกรายการ
  const [form, setForm] = useState({ kind: 'out', item_id: '', name: '', unit: '', qty: '', house_code: '', note: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setErr(''); setBusy(true)
    try {
      await api.post('/stock/moves', {
        kind: form.kind, item_id: form.item_id ? Number(form.item_id) : undefined,
        name: form.name.trim() || undefined, unit: form.unit.trim() || undefined,
        qty: Number(form.qty.replace(/,/g, '')), house_code: form.house_code, note: form.note,
      })
      setForm({ kind: form.kind, item_id: '', name: '', unit: '', qty: '', house_code: '', note: '' })
      load()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const setMin = async (it: StockItem) => {
    const v = window.prompt(`จุดสั่งซื้อของ "${it.name}" (ต่ำกว่านี้ระบบจะเตือน "ใกล้หมด") · 0 = ไม่เตือน`, String(it.min_qty || 0))
    if (v == null) return
    try { await api.put('/stock/items/' + it.id, { min_qty: Number(v.replace(/,/g, '')) || 0 }); load() } catch (e) { window.alert((e as Error).message) }
  }

  const list = (items || []).filter((it) => it.name.toLowerCase().includes(query.trim().toLowerCase()))
  const lowCount = (items || []).filter((it) => it.low).length
  const houseName = (code: string) => data.houses.find((h) => h.code === code)?.name || code

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {lowCount > 0 && (
        <div style={{ fontSize: 12.5, color: '#B7791F', background: '#FBF6EC', border: '1px solid #ECDCB8', borderRadius: 10, padding: '9px 14px' }}>
          ⚠️ วัสดุใกล้หมด {lowCount} รายการ (ต่ำกว่าจุดสั่งซื้อ) — แถวสีเหลืองในตาราง
        </div>
      )}

      {/* ฟอร์มบันทึก รับเข้า/เบิกออก/ตรวจนับ */}
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: '14px 18px' }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>บันทึกรายการสต๊อก</div>
        <div style={{ fontSize: 11.5, color: '#94A0A8', marginBottom: 10 }}>
          ของจาก PO ที่ "ไม่ผูกบ้าน" จะรับเข้าสต๊อกอัตโนมัติตอนตรวจรับผ่าน — ฟอร์มนี้ใช้เบิกออกไปหน้างาน / รับเข้าเอง / ปรับยอดตามการตรวจนับ
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select style={{ ...field, width: 'auto' }} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="out">เบิกออก</option>
            <option value="in">รับเข้า</option>
            <option value="adjust">ตรวจนับ (ตั้งยอดคงเหลือ)</option>
          </select>
          <select style={{ ...field, minWidth: 220 }} value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value, name: '' })}>
            <option value="">— เลือกวัสดุ —</option>
            {(items || []).map((it) => <option key={it.id} value={it.id}>{it.name} (เหลือ {it.qty} {it.unit})</option>)}
          </select>
          {form.kind === 'in' && !form.item_id && (
            <>
              <input style={{ ...field, minWidth: 180 }} placeholder="หรือชื่อวัสดุใหม่" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input style={{ ...field, width: 90 }} placeholder="หน่วย" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </>
          )}
          <input style={{ ...field, width: 110 }} placeholder={form.kind === 'adjust' ? 'ยอดที่นับได้' : 'จำนวน'} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} inputMode="decimal" />
          {form.kind === 'out' && (
            <select style={{ ...field, minWidth: 180 }} value={form.house_code} onChange={(e) => setForm({ ...form, house_code: e.target.value })}>
              <option value="">— เบิกไปบ้านไหน —</option>
              {data.houses.map((h) => <option key={h.id} value={h.code}>{h.name} ({h.code})</option>)}
            </select>
          )}
          <input style={{ ...field, flex: 1, minWidth: 160 }} placeholder={form.kind === 'out' ? 'ใครเบิก / เอาไปทำอะไร' : 'หมายเหตุ (ถ้ามี)'} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <button onClick={submit} disabled={busy} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: form.kind === 'out' ? '#C24036' : '#2E7D55', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer' }}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
        </div>
        {err && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 8 }}>{err}</div>}
      </div>

      {/* คงเหลือ */}
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid #EEF1F4' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>วัสดุคงเหลือในสต๊อก</span>
          <span className="num" style={{ fontSize: 12, color: '#94A0A8' }}>{list.length}/{(items || []).length} รายการ</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาวัสดุ" style={{ ...field, marginLeft: 'auto', width: 200, padding: '7px 10px', fontSize: 12.5 }} />
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F7F9FB' }}>
              <th style={{ ...th, padding: '9px 18px' }}>วัสดุ</th>
              <th style={{ ...th, textAlign: 'right' }}>คงเหลือ</th>
              <th style={th}>หน่วย</th>
              <th style={{ ...th, textAlign: 'right' }}>จุดสั่งซื้อ</th>
              <th style={th}>อัปเดตล่าสุด</th>
              <th style={{ ...th, textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {items === null && <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#94A0A8' }}>กำลังโหลด…</td></tr>}
            {items !== null && list.length === 0 && <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีวัสดุในสต๊อก — รับเข้าจากฟอร์มด้านบน หรือออก PO แบบไม่ผูกบ้านแล้วตรวจรับ</td></tr>}
            {list.map((it) => (
              <tr key={it.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6', background: it.low ? '#FFFBEB' : undefined }}>
                <td style={{ ...td, padding: '10px 18px', fontWeight: 500, cursor: 'pointer' }} onClick={() => setPickItem(it.id)} title="ดูประวัติเข้า-ออกของรายการนี้">
                  {it.name} {it.low && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#B7791F', background: '#F6ECD6', padding: '1px 8px', borderRadius: 20, marginLeft: 6 }}>ใกล้หมด</span>}
                </td>
                <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 700, color: it.low ? '#B7791F' : '#1C2730' }}>{it.qty.toLocaleString('en-US')}</td>
                <td style={{ ...td, color: '#5C6770' }}>{it.unit}</td>
                <td className="num" style={{ ...td, textAlign: 'right', color: '#94A0A8' }}>{it.min_qty || '-'}</td>
                <td style={{ ...td, color: '#94A0A8', fontSize: 12 }}>{it.updated}</td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <button onClick={() => setMin(it)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>ตั้งจุดสั่งซื้อ</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ประวัติเข้า-ออก */}
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid #EEF1F4' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>ประวัติเข้า-ออก</span>
          {pickItem !== 0 && <span style={{ fontSize: 12, color: '#30506A', background: '#E9EFF3', padding: '2px 10px', borderRadius: 20 }}>{(items || []).find((i) => i.id === pickItem)?.name} <span onClick={() => setPickItem(0)} style={{ cursor: 'pointer', fontWeight: 700 }}>✕</span></span>}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F7F9FB' }}>
              <th style={{ ...th, padding: '9px 18px' }}>วันที่</th>
              <th style={th}>รายการ</th>
              <th style={{ ...th, textAlign: 'center' }}>ประเภท</th>
              <th style={{ ...th, textAlign: 'right' }}>จำนวน</th>
              <th style={th}>บ้าน/ปลายทาง</th>
              <th style={th}>หมายเหตุ</th>
              <th style={th}>โดย</th>
            </tr>
          </thead>
          <tbody>
            {moves.length === 0 && <tr><td colSpan={7} style={{ padding: 26, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีประวัติ</td></tr>}
            {moves.map((m) => {
              const k = KIND_LABEL[m.kind] || { t: m.kind, c: '#5C6770', bg: '#F1F4F6' }
              return (
                <tr key={m.id} style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td className="num" style={{ ...td, padding: '9px 18px', color: '#5C6770' }}>{m.date_iso}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{m.item_name}</td>
                  <td style={{ ...td, textAlign: 'center' }}><span style={{ fontSize: 11, fontWeight: 600, color: k.c, background: k.bg, padding: '2px 10px', borderRadius: 20 }}>{k.t}</span></td>
                  <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 600, color: k.c }}>{m.kind === 'out' ? '−' : m.kind === 'in' ? '+' : '='}{m.qty.toLocaleString('en-US')} {m.unit}</td>
                  <td style={{ ...td, color: '#5C6770' }}>{m.house_code ? houseName(m.house_code) : '-'}</td>
                  <td style={{ ...td, color: '#5C6770', fontSize: 12.5 }}>{m.note}</td>
                  <td style={{ ...td, color: '#94A0A8', fontSize: 12 }}>{m.by}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: '#94A0A8', padding: '0 4px' }}>
        หมายเหตุ: สต๊อกนี้นับ "จำนวนของ" เพื่อรู้ว่ามีอะไรเหลือเท่าไหร่/ไปอยู่บ้านไหน — ต้นทุนเงินยังลงบัญชีตามเดิมตอนรับของ (ราคาต่อหน่วยดูที่หน้า "ราคากลางวัสดุ")
      </div>
    </div>
  )
}
