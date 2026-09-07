import { Fragment, useEffect, useState } from 'react'
import { api } from '../api'
import { baht } from '../data'
import { useApp } from '../store'

interface CfRow { section: 'in' | 'out'; label: string; values: number[] }
interface Cashflow { id: number; no: string; house_code: string; title: string; opening: number; months: string[]; rows: CfRow[]; date: string }

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const DEFAULT_IN = ['รายได้จากงวดงาน', 'เงินจอง / เงินดาวน์', 'รายได้อื่น ๆ']
const DEFAULT_OUT = ['ค่าวัสดุ', 'ค่าแรงงาน', 'ค่าผู้รับเหมาช่วง', 'ค่าเครื่องจักร', 'ค่าใช้จ่าย Office Site', 'ค่าบริหารโครงการ', 'ค่าขนส่ง / น้ำมัน', 'ค่าธรรมเนียม / ประกัน']
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 9px', outline: 'none' }

export default function CashflowTab() {
  const { data } = useApp()
  const houses = data.houses
  const [rows, setRows] = useState<Cashflow[]>([])
  const [edit, setEdit] = useState<Cashflow | null>(null)
  const [startMonth, setStartMonth] = useState(0)
  const [nMonths, setNMonths] = useState(6)

  const load = () => api.get<Cashflow[]>('/cashflows').then(setRows).catch(() => setRows([]))
  useEffect(() => { load() }, [])

  const newCf = () => {
    const months = Array.from({ length: nMonths }, (_, i) => TH_MONTHS[(startMonth + i) % 12])
    const mk = (section: 'in' | 'out', labels: string[]): CfRow[] => labels.map((label) => ({ section, label, values: Array(nMonths).fill(0) }))
    setEdit({ id: 0, no: '', house_code: '', title: 'ประมาณการกระแสเงินสด', opening: 0, months, rows: [...mk('in', DEFAULT_IN), ...mk('out', DEFAULT_OUT)], date: '' })
  }
  const save = async () => {
    if (!edit) return
    const body = { house_code: edit.house_code, title: edit.title, opening: edit.opening, months: edit.months, rows: edit.rows }
    if (edit.id) await api.put('/cashflows/' + edit.id, body); else await api.post('/cashflows', body)
    setEdit(null); load()
  }
  const remove = async (id: number) => { if (confirm('ลบตารางนี้?')) { await api.del('/cashflows/' + id); load() } }
  const setVal = (ri: number, mi: number, v: number) => setEdit((e) => e ? { ...e, rows: e.rows.map((r, j) => j === ri ? { ...r, values: r.values.map((x, k) => k === mi ? v : x) } : r) } : e)

  // ดึงยอดจริงจากงวดงาน/รายจ่ายมาใส่ตาราง (รายจ่ายวัสดุแยกตามเดือน, ยอดรับ/จ่ายช่างใส่เดือนแรก)
  const [pulling, setPulling] = useState(false)
  const pullActuals = async () => {
    if (!edit) return
    setPulling(true)
    try {
      const q = edit.house_code ? '?house_code=' + edit.house_code : ''
      const a = await api.get<{ collected: number; paidContractor: number; materialByMonth: number[]; materialTotal: number }>('/cashflow-actuals' + q)
      const mIdx = edit.months.map((m) => TH_MONTHS.indexOf(m)) // แต่ละคอลัมน์ตรงกับเดือนไทยไหน
      const findRow = (sec: 'in' | 'out', kw: string) => edit.rows.findIndex((r) => r.section === sec && r.label.includes(kw))
      const rows = edit.rows.map((r) => ({ ...r, values: [...r.values] }))
      // ค่าวัสดุ (out) แยกตามเดือน
      const matRi = findRow('out', 'วัสดุ')
      if (matRi >= 0) mIdx.forEach((gi, col) => { rows[matRi].values[col] = gi >= 0 ? (a.materialByMonth[gi] || 0) : 0 })
      // รายได้จากงวดงาน (in) — ยอดรวมที่เก็บจริง ใส่เดือนแรก
      const inRi = findRow('in', 'งวดงาน')
      if (inRi >= 0 && rows[inRi].values.length) rows[inRi].values[0] = a.collected
      // ค่าแรงงาน (out) — ยอดจ่ายช่างจริง ใส่เดือนแรก
      const labRi = findRow('out', 'แรงงาน')
      if (labRi >= 0 && rows[labRi].values.length) rows[labRi].values[0] = a.paidContractor
      setEdit({ ...edit, rows })
      alert(`ดึงยอดจริงแล้ว\n• รับจากลูกค้า ${baht(a.collected)}\n• จ่ายช่าง ${baht(a.paidContractor)}\n• ค่าวัสดุ/PO ${baht(a.materialTotal)}`)
    } catch (e) { alert((e as Error).message) } finally { setPulling(false) }
  }

  const totalsOf = (cf: Cashflow) => {
    const n = cf.months.length
    const sumIn = Array.from({ length: n }, (_, m) => cf.rows.filter((r) => r.section === 'in').reduce((s, r) => s + (r.values[m] || 0), 0))
    const sumOut = Array.from({ length: n }, (_, m) => cf.rows.filter((r) => r.section === 'out').reduce((s, r) => s + (r.values[m] || 0), 0))
    const net = sumIn.map((v, m) => v - sumOut[m])
    let run = cf.opening || 0
    const running = net.map((v) => (run += v))
    return { sumIn, sumOut, net, running }
  }

  if (edit) {
    const t = totalsOf(edit)
    const numCell: React.CSSProperties = { padding: '3px 4px', textAlign: 'right', borderLeft: '1px solid #F1F4F6' }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 2fr 1fr', gap: 10 }}>
          <select style={field} value={edit.house_code} onChange={(e) => setEdit({ ...edit, house_code: e.target.value })}><option value="">— เลือกบ้าน —</option>{houses.map((h) => <option key={h.id} value={h.code}>{h.name}</option>)}</select>
          <input style={field} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 12, color: '#5C6770' }}>เงินยกมา</span><input type="number" style={{ ...field, width: 110 }} value={edit.opening || ''} onChange={(e) => setEdit({ ...edit, opening: Number(e.target.value) })} /></div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 10, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ background: '#F7F9FB' }}><th style={{ padding: '8px 10px', textAlign: 'left', minWidth: 180 }}>รายการ</th>{edit.months.map((m, i) => <th key={i} style={{ padding: '8px 6px', textAlign: 'right', minWidth: 80 }}>{m}</th>)}</tr></thead>
            <tbody>
              {(['in', 'out'] as const).map((sec) => (
                <Fragment key={sec}>
                  <tr><td colSpan={edit.months.length + 1} style={{ padding: '6px 10px', fontWeight: 700, color: sec === 'in' ? '#2E7D55' : '#C24036', background: '#FAFBFC' }}>{sec === 'in' ? 'เงินสดรับเข้า' : 'เงินสดจ่ายออก'}</td></tr>
                  {edit.rows.map((r, ri) => r.section !== sec ? null : (
                    <tr key={ri} style={{ borderTop: '1px solid #F1F4F6' }}>
                      <td style={{ padding: '3px 8px' }}><input value={r.label} onChange={(e) => setEdit({ ...edit, rows: edit.rows.map((x, j) => j === ri ? { ...x, label: e.target.value } : x) })} style={{ ...field, padding: '4px 6px', width: '100%', border: 'none' }} /></td>
                      {r.values.map((v, mi) => <td key={mi} style={numCell}><input type="number" value={v || ''} onChange={(e) => setVal(ri, mi, Number(e.target.value))} style={{ ...field, padding: '4px 5px', width: 74, textAlign: 'right', fontSize: 11.5 }} /></td>)}
                    </tr>
                  ))}
                  <tr style={{ borderTop: '1px solid #E1E5EA', background: '#F7F9FB', fontWeight: 600 }}><td style={{ padding: '5px 10px' }}>รวม{sec === 'in' ? 'รับ' : 'จ่าย'}</td>{(sec === 'in' ? t.sumIn : t.sumOut).map((v, i) => <td key={i} className="num" style={{ ...numCell, padding: '5px 6px' }}>{baht(v)}</td>)}</tr>
                </Fragment>
              ))}
              <tr style={{ borderTop: '2px solid #E1E5EA', fontWeight: 700 }}><td style={{ padding: '6px 10px' }}>กระแสเงินสดสุทธิ</td>{t.net.map((v, i) => <td key={i} className="num" style={{ ...numCell, padding: '6px', color: v >= 0 ? '#2E7D55' : '#C24036' }}>{baht(v)}</td>)}</tr>
              <tr style={{ background: '#F2F5F8', fontWeight: 700 }}><td style={{ padding: '6px 10px' }}>เงินสดคงเหลือปลายงวด</td>{t.running.map((v, i) => <td key={i} className="num" style={{ ...numCell, padding: '6px', color: v >= 0 ? '#1E2E3B' : '#C24036' }}>{baht(v)}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={pullActuals} disabled={pulling} title="ดึงยอดรับ/จ่ายจริงจากงวดงานและรายจ่ายมากรอกให้" className="hov-f3f5f7" style={{ marginRight: 'auto', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#C0852C', background: '#fff', border: '1px solid #EAD9B6', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>{pulling ? 'กำลังดึง…' : '↻ ดึงยอดจริง'}</button>
          <button onClick={() => setEdit(null)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ยกเลิก</button>
          <button onClick={save} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>บันทึก</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: '#5C6770' }}>ตารางกระแสเงินสด <b className="num" style={{ color: '#1C2730' }}>{rows.length}</b> ชุด</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#5C6770' }}>เริ่มเดือน</span>
          <select style={{ ...field, padding: '6px 8px' }} value={startMonth} onChange={(e) => setStartMonth(Number(e.target.value))}>{TH_MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}</select>
          <select style={{ ...field, padding: '6px 8px' }} value={nMonths} onChange={(e) => setNMonths(Number(e.target.value))}>{[3, 6, 9, 12].map((n) => <option key={n} value={n}>{n} เดือน</option>)}</select>
          <button onClick={newCf} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>+ สร้างตาราง</button>
        </div>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}><th style={{ padding: '9px 18px', fontSize: 12, color: '#5C6770' }}>เลขที่</th><th style={{ padding: '9px 12px', fontSize: 12, color: '#5C6770' }}>ชื่อ / บ้าน</th><th style={{ padding: '9px 12px', fontSize: 12, color: '#5C6770', textAlign: 'right' }}>คงเหลือปลายงวดสุดท้าย</th><th style={{ padding: '9px 18px', fontSize: 12, color: '#5C6770', textAlign: 'center' }}>จัดการ</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีตาราง — กด “สร้างตาราง”</td></tr>}
            {rows.map((cf) => { const t = totalsOf(cf); const last = t.running[t.running.length - 1] || 0; return (
              <tr key={cf.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                <td className="num" style={{ padding: '10px 18px', fontWeight: 600, fontFamily: 'monospace' }}>{cf.no}<div style={{ fontSize: 10.5, color: '#94A0A8', fontFamily: 'inherit' }}>{cf.date}</div></td>
                <td style={{ padding: '10px 12px' }}><div style={{ fontWeight: 500 }}>{cf.title}</div><div style={{ fontSize: 11, color: '#94A0A8' }}>{houses.find((h) => h.code === cf.house_code)?.name || cf.house_code || '—'} · {cf.months.length} เดือน</div></td>
                <td className="num" style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: last >= 0 ? '#1E2E3B' : '#C24036' }}>{baht(last)}</td>
                <td style={{ padding: '10px 18px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button onClick={() => setEdit(cf)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>แก้ไข</button>
                  <button onClick={() => remove(cf.id)} style={{ marginLeft: 6, border: 'none', background: 'none', color: '#C24036', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </td>
              </tr>
            ) })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
