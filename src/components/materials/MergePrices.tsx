import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { ApiMaterialPrice } from '../../store'
import ModalShell from '../shared/ModalShell'

// รวมรายการราคากลางที่ซ้ำ (ชื่อสะกดต่าง/เว้นวรรคต่าง) เป็นรายการมาตรฐานเดียว
// รายการที่ถูกรวม → เป็น "ชื่อเรียกอื่น" (ถอดแบบ/PO ที่ใช้ชื่อเดิมยังจับคู่เจอ) · ปิดใช้งาน · BOQ เก่าที่อ้างรหัสเดิมตามไปเจอ

const money = (n: number) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
const btn: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 9, padding: '8px 14px', cursor: 'pointer' }
const input: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, border: '1px solid #D2DAE1', borderRadius: 8, padding: '6px 9px', outline: 'none' }

// ราคาตั้งต้นของรายการที่รวม = เฉลี่ยถ่วงตามปริมาณที่ซื้อจริง (ไม่มีข้อมูลซื้อ = ของรายการมาตรฐาน)
const weighted = (xs: ApiMaterialPrice[], keep: ApiMaterialPrice) => {
  const q = xs.reduce((s, m) => s + (m.qty_total || 0), 0)
  return q > 0 ? Math.round((xs.reduce((s, m) => s + (m.qty_total || 0) * (m.central || 0), 0) / q) * 100) / 100 : keep.central
}
const pickKeep = (xs: ApiMaterialPrice[]) => [...xs].sort((a, b) => (b.po_count || 0) - (a.po_count || 0) || (b.qty_total || 0) - (a.qty_total || 0))[0]

function GroupCard({ items, onMerged }: { items: ApiMaterialPrice[]; onMerged: () => void }) {
  const [inc, setInc] = useState<number[]>(items.map((m) => m.id))
  const [keepId, setKeepId] = useState(pickKeep(items).id)
  const keep = items.find((m) => m.id === keepId)!
  const chosen = items.filter((m) => inc.includes(m.id))
  const [name, setName] = useState(keep.name)
  const [unit, setUnit] = useState(keep.unit || '')
  const [price, setPrice] = useState(String(weighted(chosen, keep)))
  const [touchedPrice, setTouchedPrice] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const units = [...new Set(chosen.map((m) => (m.unit || '').trim()))]

  // เปลี่ยนรายการมาตรฐาน/ที่ติ๊ก → เติมชื่อ หน่วย ราคาใหม่ (ถ้ายังไม่ได้พิมพ์ราคาเอง)
  const choose = (id: number) => {
    const k = items.find((m) => m.id === id)!
    setKeepId(id); setName(k.name); setUnit(k.unit || '')
    if (!inc.includes(id)) setInc([...inc, id])
    if (!touchedPrice) setPrice(String(weighted(items.filter((m) => inc.includes(m.id) || m.id === id), k)))
  }
  const toggle = (id: number) => {
    if (id === keepId) return
    const next = inc.includes(id) ? inc.filter((x) => x !== id) : [...inc, id]
    setInc(next)
    if (!touchedPrice) setPrice(String(weighted(items.filter((m) => next.includes(m.id)), keep)))
  }
  const merge = async () => {
    const ids = inc.filter((id) => id !== keepId)
    if (!ids.length) { setErr('ติ๊กรายการที่จะรวมอย่างน้อย 1 รายการ'); return }
    setBusy(true); setErr('')
    try {
      await api.post('/material-prices/merge', { keep_id: keepId, ids, name: name.trim(), unit: unit.trim(), central: Number(price), manual_price: touchedPrice })
      onMerged()
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  const td: React.CSSProperties = { padding: '5px 8px', fontSize: 12.5, borderTop: '1px solid #EEF1F4' }
  return (
    <div style={{ border: '1px solid #E1E5EA', borderRadius: 10, padding: 12, marginBottom: 10, background: '#fff' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ textAlign: 'left', fontSize: 11.5, color: '#5C6770' }}>
          <th style={{ padding: '3px 8px' }}>รวม</th><th style={{ padding: '3px 8px' }}>มาตรฐาน</th><th style={{ padding: '3px 8px' }}>ชื่อในระบบ</th><th style={{ padding: '3px 8px' }}>หน่วย</th>
          <th style={{ padding: '3px 8px', textAlign: 'right' }}>ราคากลาง</th><th style={{ padding: '3px 8px', textAlign: 'right' }}>ซื้อ (PO)</th>
        </tr></thead>
        <tbody>
          {items.map((m) => (
            <tr key={m.id} style={{ opacity: inc.includes(m.id) ? 1 : 0.45 }}>
              <td style={td}><input type="checkbox" checked={inc.includes(m.id)} disabled={m.id === keepId} onChange={() => toggle(m.id)} /></td>
              <td style={td}><input type="radio" checked={m.id === keepId} onChange={() => choose(m.id)} /></td>
              <td style={td}>{m.name}</td>
              <td style={{ ...td, color: '#5C6770' }}>{m.unit || '-'}</td>
              <td className="num" style={{ ...td, textAlign: 'right' }}>฿{money(m.central)}</td>
              <td className="num" style={{ ...td, textAlign: 'right', color: '#5C6770' }}>{m.po_count || 0} ครั้ง</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#5C6770' }}>ชื่อมาตรฐาน</span>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...input, flex: 1, minWidth: 240 }} />
        <span style={{ fontSize: 12, color: '#5C6770' }}>หน่วย</span>
        <input value={unit} onChange={(e) => setUnit(e.target.value)} style={{ ...input, width: 70 }} />
        <span style={{ fontSize: 12, color: '#5C6770' }}>ราคากลาง</span>
        <input value={price} inputMode="decimal" onChange={(e) => { setPrice(e.target.value); setTouchedPrice(true) }} style={{ ...input, width: 90, textAlign: 'right' }} />
        <button onClick={merge} disabled={busy} style={{ ...btn, color: '#fff', background: busy ? '#9AABB8' : '#30506A' }}>{busy ? 'กำลังรวม…' : `รวม ${inc.length} รายการ`}</button>
      </div>
      <div style={{ fontSize: 11, color: '#94A0A8', marginTop: 4 }}>
        {touchedPrice ? 'ราคาที่พิมพ์เอง = ตั้งราคาเอง (อัปเดตจาก PO จะไม่ทับ)' : 'ราคาตั้งต้น = เฉลี่ยถ่วงตามปริมาณที่ซื้อจริง · หลังรวม ปุ่ม "อัปเดตจากประวัติจริง" จะนับ PO ของทุกชื่อรวมกัน'}
      </div>
      {units.length > 1 && <div style={{ fontSize: 11.5, color: '#B7791F', fontWeight: 600, marginTop: 4 }}>⚠ หน่วยต่างกัน ({units.map((u) => u || '-').join(' / ')}) — ตรวจว่าเป็นของชิ้นเดียวกันจริงก่อนรวม</div>}
      {err && <div style={{ fontSize: 12.5, color: '#B23B30', marginTop: 4 }}>{err}</div>}
    </div>
  )
}

/** groups = กลุ่มที่เลือกเอง (รวมที่ติ๊ก) · ไม่ส่ง = ให้ระบบหากลุ่มที่น่าจะซ้ำ */
export default function MergePricesModal({ groups, onClose, onDone }: { groups?: ApiMaterialPrice[][]; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [list, setList] = useState<ApiMaterialPrice[][] | null>(groups || null)
  const [mergedCount, setMergedCount] = useState(0)
  const [err, setErr] = useState('')
  useEffect(() => { if (!groups) api.get<ApiMaterialPrice[][]>('/material-prices/duplicates').then(setList).catch((e) => setErr((e as Error).message)) }, [groups])
  const merged = (i: number) => { setList((l) => (l || []).filter((_, j) => j !== i)); setMergedCount((n) => n + 1); onDone() }
  return (
    <ModalShell title={groups ? 'รวมรายการที่เลือก' : 'รวมรายการซ้ำ'} width={900} onClose={onClose} zIndex={70} closeOnBackdrop={false}
      sub="เลือกรายการมาตรฐาน (◉) · ติ๊กรายการที่จะรวม · ชื่ออื่นจะถูกจำเป็น “ชื่อเรียกอื่น” ให้ถอดแบบ/PO ที่ใช้ชื่อเดิมยังจับคู่เจอ"
      bodyStyle={{ background: '#F7F9FB' }}
      footer={<button onClick={onClose} style={{ ...btn, fontWeight: 500, color: '#1C2730', background: '#EDF1F4' }}>ปิด{mergedCount ? ` (รวมแล้ว ${mergedCount} กลุ่ม)` : ''}</button>}>
      {err && <div style={{ fontSize: 13, color: '#B23B30' }}>{err}</div>}
      {!list && !err && <div style={{ fontSize: 13, color: '#5C6770' }}>กำลังหารายการที่น่าจะซ้ำ…</div>}
      {list && !groups && <div style={{ fontSize: 12.5, color: '#5C6770', marginBottom: 10 }}>
        พบ {list.length} กลุ่มที่น่าจะซ้ำ (ชื่อเหมือนกันเมื่อตัดช่องว่าง/คำว่า “ตรา”/สะกดต่าง และหน่วยเดียวกัน) — กลุ่มที่ระบบหาไม่เจอ ติ๊กเลือกในตารางแล้วกด “รวมที่เลือก” ได้
      </div>}
      {list && !list.length && <div style={{ fontSize: 13.5, color: '#2E7D55', padding: '8px 0' }}>✓ ไม่พบรายการที่น่าจะซ้ำแล้ว</div>}
      {list?.map((g, i) => <GroupCard key={g.map((m) => m.id).join('-')} items={g} onMerged={() => merged(i)} />)}
    </ModalShell>
  )
}
