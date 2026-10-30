import { useEffect, useState } from 'react'
import { api } from '../../api'
import { baht } from '../../data'
import type { ApiLaborRate, ApiMaterialPrice } from '../../store'
import { laborLabel } from '../../store'
import ModalShell from '../shared/ModalShell'
import type { BoqItem } from './BoqTab'

// อัปเดตราคาใน BOQ เป็นราคากลางล่าสุด — แถววัสดุที่ผูกราคากลาง (ref) + แถวค่าแรงที่ผูกราคากลางค่าแรง (labRef หรือชื่อ "ค่าแรง: หมวดงาน") ใช้ค่ากลางของช่วงราคา
// แสดงก่อนว่าแถวไหนเปลี่ยนเท่าไหร่ ยอดรวมขยับเท่าไหร่ → ติ๊กเลือก → ใช้ราคาใหม่ (ยังไม่บันทึก BOQ จนกด "บันทึก BOQ")

// k = รหัสแถวในรายการติ๊ก (แถวเดียวกันมีได้ทั้งวัสดุและค่าแรง)
const keyOf = (d: { i: number; kind: string }) => d.i * 2 + (d.kind === 'lab' ? 1 : 0)
interface Diff { i: number; kind: 'mat' | 'lab'; desc: string; qty: number; unit: string; curUnit: string; old: number; now: number }

export default function BoqPriceRefresh({ items, onApply, onClose }: { items: BoqItem[]; onApply: (items: BoqItem[]) => void; onClose: () => void }) {
  const [diffs, setDiffs] = useState<Diff[] | null>(null)
  const [gone, setGone] = useState(0) // ผูกไว้แต่ราคากลางถูกลบไปแล้ว
  const [pick, setPick] = useState<number[]>([])
  const [err, setErr] = useState('')
  const linked = items.filter((it) => it.ref || it.labRef || it.desc.startsWith('ค่าแรง: ')).length

  useEffect(() => {
    // ?all=1 = รวมรายการที่ถูกรวมไปแล้ว → ตามไปหารายการมาตรฐาน (BOQ เก่าอ้างรหัสเดิม)
    Promise.all([api.get<(ApiMaterialPrice & { merged_into?: number | null })[]>('/material-prices?all=1'), api.get<ApiLaborRate[]>('/labor-rates')]).then(([list, rates]) => {
      const rateById = new Map(rates.map((r) => [r.id, r]))
      const rateByLabel = new Map(rates.map((r) => [laborLabel(r), r]))
      const all = new Map(list.map((m) => [m.id, m]))
      const resolve = (id: number) => { let m = all.get(id); for (let k = 0; m?.merged_into && k < 10; k++) m = all.get(m.merged_into); return m && m.active !== 0 ? m : undefined }
      const byId = { get: resolve }
      const ds: Diff[] = []
      let g = 0
      items.forEach((it, i) => {
        // แถวค่าแรง: ผูกด้วย labRef หรือชื่อ "ค่าแรง: …" · หมวดเสนอราคา (ไม่มีราคา) ข้าม
        const lr = it.labRef ? rateById.get(it.labRef) : it.desc.startsWith('ค่าแรง: ') ? rateByLabel.get(it.desc.slice(8).trim()) : undefined
        if (lr && lr.price_max > 0) {
          const mid = Math.round((lr.price_min + lr.price_max) / 2)
          if (mid !== Math.round(it.lab || 0)) ds.push({ i, kind: 'lab', desc: it.desc, qty: it.qty, unit: it.unit, curUnit: lr.unit || '', old: it.lab || 0, now: mid })
        } else if (it.labRef && !lr) g++
        if (!it.ref) return
        const m = byId.get(it.ref)
        if (!m) { g++; return }
        if (Math.round((m.central || 0) * 100) !== Math.round((it.mat || 0) * 100)) ds.push({ i, kind: 'mat', desc: it.desc, qty: it.qty, unit: it.unit, curUnit: m.unit || '', old: it.mat || 0, now: m.central || 0 })
      })
      setDiffs(ds); setGone(g); setPick(ds.map((d) => d.i * 2 + (d.kind === 'lab' ? 1 : 0)))
    }).catch((e) => setErr((e as Error).message))
  }, [items])

  const delta = (diffs || []).filter((d) => pick.includes(keyOf(d))).reduce((s, d) => s + (d.now - d.old) * (d.qty || 0), 0)
  const apply = () => {
    const chosen = (diffs || []).filter((d) => pick.includes(keyOf(d)))
    onApply(items.map((it, i) => {
      let x = it
      for (const d of chosen) if (d.i === i) x = d.kind === 'lab' ? { ...x, lab: d.now } : { ...x, mat: d.now }
      return x
    }))
    onClose()
  }
  const th: React.CSSProperties = { padding: '7px 8px', fontSize: 12, fontWeight: 600, color: '#5C6770', textAlign: 'left', background: '#F7F9FB', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '6px 8px', fontSize: 13, borderTop: '1px solid #EEF1F4' }
  const n = diffs?.length || 0

  return (
    <ModalShell title="อัปเดตเป็นราคากลางล่าสุด" sub={`เทียบเฉพาะแถวที่ผูกราคากลางไว้ (${linked} จาก ${items.length} แถว) · วัสดุเทียบราคากลางวัสดุ · ค่าแรงเทียบค่ากลางของช่วงราคาค่าแรง · แถวที่กรอกราคาเองไม่เปลี่ยน`} width={820} onClose={onClose} zIndex={80}
      footer={<>
        <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#EDF1F4', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ยกเลิก</button>
        <button onClick={apply} disabled={!pick.length} style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: pick.length ? '#30506A' : '#9AABB8', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: pick.length ? 'pointer' : 'default' }}>ใช้ราคาใหม่ ({pick.length} แถว)</button>
      </>}>
      {err && <div style={{ fontSize: 13, color: '#B23B30' }}>{err}</div>}
      {!diffs && !err && <div style={{ fontSize: 13, color: '#5C6770' }}>กำลังเทียบราคา…</div>}
      {diffs && !n && <div style={{ fontSize: 13.5, color: '#2E7D55', padding: '8px 0' }}>✓ ราคาใน BOQ ตรงกับราคากลางล่าสุดแล้ว{!linked && ' (BOQ นี้ไม่มีแถวที่ผูกราคากลาง — ผูกได้จากหน้าถอดแบบ)'}</div>}
      {diffs && n > 0 && <>
        <div style={{ border: '1px solid #E1E5EA', borderRadius: 9, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}><input type="checkbox" checked={pick.length === n} onChange={(e) => setPick(e.target.checked ? diffs.map(keyOf) : [])} /></th>
              <th style={th}>รายการ</th><th style={{ ...th, textAlign: 'right' }}>จำนวน</th>
              <th style={{ ...th, textAlign: 'right' }}>ราคาใน BOQ</th><th style={{ ...th, textAlign: 'right' }}>ราคากลางล่าสุด</th><th style={{ ...th, textAlign: 'right' }}>ยอดเปลี่ยน</th>
            </tr></thead>
            <tbody>
              {diffs.map((d) => {
                const pct = d.old ? ((d.now - d.old) / d.old) * 100 : null
                const dd = (d.now - d.old) * (d.qty || 0)
                return (
                  <tr key={keyOf(d)}>
                    <td style={td}><input type="checkbox" checked={pick.includes(keyOf(d))} onChange={() => setPick(pick.includes(keyOf(d)) ? pick.filter((x) => x !== keyOf(d)) : [...pick, keyOf(d)])} /></td>
                    <td style={td}><span style={{ fontSize: 10.5, fontWeight: 600, color: d.kind === 'lab' ? '#6B4E9E' : '#30506A', background: d.kind === 'lab' ? '#EEE8F6' : '#E2E9EF', borderRadius: 5, padding: '1px 6px', marginRight: 6 }}>{d.kind === 'lab' ? 'ค่าแรง' : 'วัสดุ'}</span>{d.desc}
                      {d.curUnit && d.unit && d.curUnit.replace(/\.$/, '') !== d.unit.replace(/\.$/, '') && <div style={{ fontSize: 11, color: '#9A6B12' }}>⚠ ราคากลางคิดต่อ “{d.curUnit}” แต่ BOQ เป็น “{d.unit}”</div>}
                    </td>
                    <td className="num" style={{ ...td, textAlign: 'right', color: '#5C6770', whiteSpace: 'nowrap' }}>{d.qty.toLocaleString()} {d.unit}</td>
                    <td className="num" style={{ ...td, textAlign: 'right', color: '#5C6770' }}>{baht(d.old)}</td>
                    <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{baht(d.now)}{pct != null && <div style={{ fontSize: 11, fontWeight: 600, color: pct > 0 ? '#C24036' : '#2E7D55' }}>{pct > 0 ? '+' : ''}{pct.toFixed(1)}%</div>}</td>
                    <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 600, color: dd > 0 ? '#C24036' : '#2E7D55' }}>{dd > 0 ? '+' : ''}{baht(dd)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, fontSize: 13.5, marginTop: 10 }}>
          ต้นทุนรวมเปลี่ยน <b className="num" style={{ color: delta > 0 ? '#C24036' : '#2E7D55' }}>{delta > 0 ? '+' : ''}{baht(delta)}</b> <span style={{ color: '#94A0A8', fontSize: 12 }}>(ก่อนค่าดำเนินการ/กำไร และ VAT)</span>
        </div>
      </>}
      {gone > 0 && <div style={{ fontSize: 12, color: '#9A6B12', marginTop: 8 }}>มี {gone} แถวที่ผูกกับราคากลางที่ถูกลบไปแล้ว — ราคาเดิมคงไว้</div>}
      <div style={{ fontSize: 12, color: '#94A0A8', marginTop: 8 }}>กด “ใช้ราคาใหม่” แล้วอย่าลืมกด “บันทึก BOQ”</div>
    </ModalShell>
  )
}
