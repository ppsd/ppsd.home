import { useMemo, useState } from 'react'
import { baht } from '../../data'
import { exportXlsxBook } from '../../exportCsv'
import ModalShell from '../shared/ModalShell'
import { boqTotals, type Boq, type BoqItem } from './BoqTab'
import { floorOf } from './materialSummaryData'
import { sortFloors } from './boqFloors'

// เทียบ BOQ 2 ฉบับของชุดเดียวกัน: รายการที่เพิ่ม/หายไป/เปลี่ยนจำนวนหรือราคา + ส่วนต่างยอดรวม
// จับคู่รายการด้วย ชั้น + ชื่อรายการ + หน่วย (รายการซ้ำในฉบับเดียวกันรวมจำนวนกัน)

type Status = 'added' | 'removed' | 'changed' | 'same'
interface Agg { floor: string; cat: string; desc: string; unit: string; qty: number; amt: number }
interface Row { key: string; floor: string; cat: string; desc: string; unit: string; a?: Agg; b?: Agg; status: Status }

const keyOf = (it: BoqItem) => [floorOf(it), it.desc.trim().replace(/\s+/g, ' ').toLowerCase(), it.unit.trim()].join('|')
function aggregate(items: BoqItem[]) {
  const m = new Map<string, Agg>()
  for (const it of items) {
    if (!it.desc.trim()) continue
    const k = keyOf(it)
    const g = m.get(k) || { floor: floorOf(it), cat: it.cat, desc: it.desc.trim(), unit: it.unit, qty: 0, amt: 0 }
    g.qty += it.qty || 0
    g.amt += (it.qty || 0) * ((it.mat || 0) + (it.lab || 0))
    m.set(k, g)
  }
  return m
}
const near = (x: number, y: number) => Math.abs(x - y) < 0.005
const STATUS: Record<Status, { label: string; color: string; bg: string }> = {
  added: { label: 'เพิ่ม', color: '#2E7D55', bg: '#E8F5EE' },
  removed: { label: 'ตัดออก', color: '#C24036', bg: '#FCEBE9' },
  changed: { label: 'เปลี่ยน', color: '#8A5A00', bg: '#FFF6E0' },
  same: { label: 'เท่าเดิม', color: '#94A0A8', bg: '#F3F5F7' },
}
const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + baht(Math.abs(n))
const signedQty = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(Math.round(n * 100) / 100).toLocaleString()

export default function BoqCompare({ versions, houseName, onClose }: { versions: Boq[]; houseName?: string; onClose: () => void }) {
  const byRev = [...versions].sort((a, b) => (a.rev || 1) - (b.rev || 1))
  const [aId, setA] = useState(byRev[byRev.length - 2]?.id ?? byRev[0].id) // ตั้งต้น: ฉบับก่อนหน้า ↔ ฉบับล่าสุด
  const [bId, setB] = useState(byRev[byRev.length - 1].id)
  const [onlyDiff, setOnlyDiff] = useState(true)
  const A = byRev.find((v) => v.id === aId) || byRev[0]
  const B = byRev.find((v) => v.id === bId) || byRev[byRev.length - 1]

  const rows = useMemo(() => {
    const ma = aggregate(A.items), mb = aggregate(B.items)
    const out: Row[] = []
    for (const k of new Set([...ma.keys(), ...mb.keys()])) {
      const a = ma.get(k), b = mb.get(k)
      const base = (b || a)!
      const status: Status = !a ? 'added' : !b ? 'removed' : near(a.qty, b.qty) && near(a.amt, b.amt) ? 'same' : 'changed'
      out.push({ key: k, floor: base.floor, cat: base.cat, desc: base.desc, unit: base.unit, a, b, status })
    }
    const fo = sortFloors(out.map((r) => r.floor))
    return out.sort((x, y) => fo.indexOf(x.floor) - fo.indexOf(y.floor) || x.cat.localeCompare(y.cat, 'th') || x.desc.localeCompare(y.desc, 'th'))
  }, [A, B])
  const ta = boqTotals(A), tb = boqTotals(B)
  const count = (s: Status) => rows.filter((r) => r.status === s).length
  const shown = onlyDiff ? rows.filter((r) => r.status !== 'same') : rows
  const lbl = (v: Boq) => `R${v.rev || 1}${v.locked ? ' 🔒' : ''}`

  const doExport = () => exportXlsxBook(`เทียบBOQ-${A.no}-R${A.rev || 1}-R${B.rev || 1}`.replace(/[\\/:*?"<>|]/g, '-'), [
    { name: 'สรุป', cols: [30, 18, 18, 18], rows: [
      ['เทียบ BOQ', `${A.no} · ${houseName || A.house_code}`],
      ['', lbl(A), lbl(B), 'ส่วนต่าง'],
      ['ค่าวัสดุรวม', ta.mat, tb.mat, tb.mat - ta.mat],
      ['ค่าแรงรวม', ta.lab, tb.lab, tb.lab - ta.lab],
      ['รวมต้นทุน', ta.subtotal, tb.subtotal, tb.subtotal - ta.subtotal],
      ['รวมทั้งสิ้น (รวมกำไร + VAT)', ta.grand, tb.grand, tb.grand - ta.grand],
      [],
      ['รายการเพิ่ม', count('added')], ['รายการตัดออก', count('removed')], ['รายการเปลี่ยน', count('changed')], ['เท่าเดิม', count('same')],
      [],
      [`${lbl(A)}: ${A.rev_note || '-'}`], [`${lbl(B)}: ${B.rev_note || '-'}`],
    ] },
    { name: 'รายการที่ต่าง', cols: [14, 14, 44, 9, 12, 12, 12, 14, 14, 14, 10], rows: [
      ['ชั้น', 'หมวด', 'รายการ', 'หน่วย', `จำนวน ${lbl(A)}`, `จำนวน ${lbl(B)}`, 'ต่าง', `ยอด ${lbl(A)}`, `ยอด ${lbl(B)}`, 'ต่าง (บาท)', 'สถานะ'],
      ...rows.filter((r) => r.status !== 'same').map((r) => [r.floor, r.cat, r.desc, r.unit, r.a?.qty ?? 0, r.b?.qty ?? 0, (r.b?.qty ?? 0) - (r.a?.qty ?? 0), r.a?.amt ?? 0, r.b?.amt ?? 0, (r.b?.amt ?? 0) - (r.a?.amt ?? 0), STATUS[r.status].label]),
    ] },
  ]).catch((e) => alert('ส่งออก Excel ไม่สำเร็จ: ' + (e as Error).message))

  const sel: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, border: '1px solid #D2DAE1', borderRadius: 8, padding: '6px 8px', background: '#fff' }
  const th: React.CSSProperties = { padding: '7px 9px', fontWeight: 600, color: '#5C6770', fontSize: 11.5, textAlign: 'left', position: 'sticky', top: 0, background: '#F7F9FB' }
  const td: React.CSSProperties = { padding: '6px 9px', fontSize: 12.5, borderTop: '1px solid #F1F4F6' }
  const card = (label: string, a: number, b: number) => (
    <div style={{ flex: 1, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 11.5, color: '#5C6770' }}>{label}</div>
      <div className="num" style={{ fontSize: 13, color: '#5C6770', marginTop: 2 }}>{baht(a)} → <b style={{ color: '#1C2730' }}>{baht(b)}</b></div>
      <div className="num" style={{ fontSize: 16, fontWeight: 700, color: b - a > 0 ? '#C24036' : b - a < 0 ? '#2E7D55' : '#94A0A8' }}>{signed(b - a)}{a ? <span style={{ fontSize: 11.5, fontWeight: 500 }}> ({((b - a) / a * 100).toFixed(1)}%)</span> : null}</div>
    </div>
  )

  return (
    <ModalShell title={`เทียบฉบับ BOQ ${A.no}`} sub={houseName || A.house_code} width={1150} onClose={onClose}
      bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 12, background: '#F7F9FB' }}
      footer={<>
        <button onClick={doExport} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>⬇ Excel ผลเทียบ</button>
        <button onClick={onClose} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
      </>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
        <span>ฉบับเดิม</span>
        <select style={sel} value={aId} onChange={(e) => setA(Number(e.target.value))}>{byRev.map((v) => <option key={v.id} value={v.id}>{lbl(v)} · {v.date}{v.rev_note ? ' · ' + v.rev_note : ''}</option>)}</select>
        <span>→ ฉบับที่เทียบ</span>
        <select style={sel} value={bId} onChange={(e) => setB(Number(e.target.value))}>{byRev.map((v) => <option key={v.id} value={v.id}>{lbl(v)} · {v.date}{v.rev_note ? ' · ' + v.rev_note : ''}</option>)}</select>
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: '#5C6770', cursor: 'pointer' }}><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> แสดงเฉพาะที่ต่าง</label>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {card('ค่าวัสดุรวม', ta.mat, tb.mat)}
        {card('ค่าแรงรวม', ta.lab, tb.lab)}
        {card('รวมทั้งสิ้น (รวมกำไร + VAT)', ta.grand, tb.grand)}
      </div>
      <div style={{ display: 'flex', gap: 6, fontSize: 12 }}>
        {(['added', 'removed', 'changed', 'same'] as Status[]).map((s) => <span key={s} style={{ color: STATUS[s].color, background: STATUS[s].bg, borderRadius: 6, padding: '3px 9px', fontWeight: 600 }}>{STATUS[s].label} {count(s)}</span>)}
      </div>
      <div style={{ flexShrink: 0, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 10, overflow: 'auto', maxHeight: '55vh' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>ชั้น</th><th style={th}>รายการ</th><th style={th}>หน่วย</th>
            <th style={{ ...th, textAlign: 'right' }}>จำนวน {lbl(A)}</th><th style={{ ...th, textAlign: 'right' }}>จำนวน {lbl(B)}</th>
            <th style={{ ...th, textAlign: 'right' }}>ยอด {lbl(A)}</th><th style={{ ...th, textAlign: 'right' }}>ยอด {lbl(B)}</th><th style={{ ...th, textAlign: 'right' }}>ต่าง (บาท)</th><th style={th}>สถานะ</th>
          </tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={9} style={{ padding: 30, textAlign: 'center', color: '#94A0A8', fontSize: 13 }}>{A.id === B.id ? 'เลือกฉบับที่ต่างกัน' : 'สองฉบับนี้รายการเหมือนกันทั้งหมด'}</td></tr>}
            {shown.map((r) => {
              const dq = (r.b?.qty ?? 0) - (r.a?.qty ?? 0), da = (r.b?.amt ?? 0) - (r.a?.amt ?? 0)
              const st = STATUS[r.status]
              return (
                <tr key={r.key} style={{ opacity: r.status === 'same' ? 0.65 : 1 }}>
                  <td style={{ ...td, color: '#5C6770', whiteSpace: 'nowrap' }}>{r.floor}</td>
                  <td style={{ ...td, textDecoration: r.status === 'removed' ? 'line-through' : undefined }}>{r.desc}<div style={{ fontSize: 10.5, color: '#94A0A8' }}>{r.cat}</div></td>
                  <td style={td}>{r.unit}</td>
                  <td className="num" style={{ ...td, textAlign: 'right', color: '#5C6770' }}>{r.a ? r.a.qty.toLocaleString() : '—'}</td>
                  <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{r.b ? r.b.qty.toLocaleString() : '—'}{r.a && r.b && !near(dq, 0) ? <div style={{ fontSize: 10.5, color: dq > 0 ? '#C24036' : '#2E7D55' }}>{signedQty(dq)}</div> : null}</td>
                  <td className="num" style={{ ...td, textAlign: 'right', color: '#5C6770' }}>{r.a ? baht(r.a.amt) : '—'}</td>
                  <td className="num" style={{ ...td, textAlign: 'right' }}>{r.b ? baht(r.b.amt) : '—'}</td>
                  <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 600, color: da > 0 ? '#C24036' : da < 0 ? '#2E7D55' : '#94A0A8' }}>{near(da, 0) ? '0' : signed(da)}</td>
                  <td style={td}><span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap' }}>{st.label}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </ModalShell>
  )
}
