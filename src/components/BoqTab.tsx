import { useEffect, useState } from 'react'
import { api } from '../api'
import { baht } from '../data'
import { useApp } from '../store'
import { exportXlsx, ExportButton } from '../exportCsv'
import BoqPrint from './BoqPrint'

export interface BoqItem { cat: string; desc: string; qty: number; unit: string; mat: number; lab: number }
export interface Boq { id: number; no: string; house_code: string; title: string; markup_pct: number; vat_pct: number; items: BoqItem[]; date: string }

export const BOQ_CATS = ['โครงสร้าง', 'สถาปัตยกรรม', 'ระบบไฟฟ้า', 'ระบบประปา-สุขาภิบาล', 'อื่นๆ']
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 9px', outline: 'none' }
const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 600, color: '#5C6770', fontSize: 11.5 }

export function boqTotals(b: { items: BoqItem[]; markup_pct: number; vat_pct: number }) {
  const mat = b.items.reduce((s, it) => s + (it.qty || 0) * (it.mat || 0), 0)
  const lab = b.items.reduce((s, it) => s + (it.qty || 0) * (it.lab || 0), 0)
  const subtotal = mat + lab
  const markup = subtotal * (b.markup_pct || 0) / 100
  const afterMarkup = subtotal + markup
  const vat = afterMarkup * (b.vat_pct || 0) / 100
  return { mat, lab, subtotal, markup, afterMarkup, vat, grand: afterMarkup + vat }
}

const emptyItem: BoqItem = { cat: 'โครงสร้าง', desc: '', qty: 0, unit: '', mat: 0, lab: 0 }

export default function BoqTab() {
  const { data, reloadData } = useApp()
  const houses = data.houses
  const [rows, setRows] = useState<Boq[]>([])
  const [edit, setEdit] = useState<Boq | null>(null) // BOQ ที่กำลังแก้/สร้าง
  const [printing, setPrinting] = useState<Boq | null>(null)

  const load = () => api.get<Boq[]>('/boqs').then(setRows).catch(() => setRows([]))
  useEffect(() => { load() }, [])

  const newBoq = () => setEdit({ id: 0, no: '', house_code: '', title: 'ประมาณราคาก่อสร้าง', markup_pct: 20, vat_pct: 7, items: [{ ...emptyItem }], date: '' })
  const save = async () => {
    if (!edit) return
    const body = { house_code: edit.house_code, title: edit.title, markup_pct: edit.markup_pct, vat_pct: edit.vat_pct, items: edit.items.filter((i) => i.desc.trim()) }
    if (edit.id) await api.put('/boqs/' + edit.id, body); else await api.post('/boqs', body)
    setEdit(null); load()
  }
  const remove = async (id: number) => { if (confirm('ลบ BOQ นี้?')) { await api.del('/boqs/' + id); load() } }
  const pushToHouse = async (b: Boq) => {
    if (!b.house_code) { alert('BOQ นี้ยังไม่ได้เลือกบ้าน — กรุณาแก้ไขแล้วเลือกบ้านก่อน'); return }
    const hn = houses.find((h) => h.code === b.house_code)?.name || b.house_code
    const grand = boqTotals(b).grand
    const asInst = confirm(`ดันยอดรวม ${baht(grand)} จาก ${b.no} เข้าบ้าน “${hn}”\n\n• กด "ตกลง" = สร้างงวดงานลูกค้า 1 งวด (ตามยอด BOQ)\n• กด "ยกเลิก" = ตั้งเป็นราคาขายตัวบ้าน (ฝั่งลูกค้า)`)
    try {
      const r = await api.post<{ grand: number }>('/boqs/' + b.id + '/push-to-house', { mode: asInst ? 'installment' : 'price' })
      await Promise.all([reloadData('houses', '/houses'), reloadData('installments', '/installments'), reloadData('dashboard', '/dashboard')])
      alert(`ดันเข้าบ้าน “${hn}” แล้ว (${baht(r.grand)})`)
    } catch (e) { alert((e as Error).message) }
  }
  const setItem = (i: number, patch: Partial<BoqItem>) => setEdit((e) => e ? { ...e, items: e.items.map((x, j) => j === i ? { ...x, ...patch } : x) } : e)
  const doExport = (b: Boq) => exportXlsx('BOQ-' + b.no, ['หมวด', 'รายการ', 'จำนวน', 'หน่วย', 'ค่าวัสดุ/หน่วย', 'ค่าวัสดุรวม', 'ค่าแรง/หน่วย', 'ค่าแรงรวม', 'รวม'],
    b.items.map((it) => [it.cat, it.desc, it.qty, it.unit, it.mat, it.qty * it.mat, it.lab, it.qty * it.lab, it.qty * (it.mat + it.lab)]), 'BOQ')

  if (edit) {
    const t = boqTotals(edit)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 2fr 1fr 1fr', gap: 10 }}>
          <select style={field} value={edit.house_code} onChange={(e) => setEdit({ ...edit, house_code: e.target.value })}>
            <option value="">— เลือกบ้าน/โครงการ —</option>
            {houses.map((h) => <option key={h.id} value={h.code}>{h.name}</option>)}
          </select>
          <input style={field} placeholder="ชื่อ BOQ" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 12, color: '#5C6770' }}>ดำเนินการ+กำไร</span><input type="number" style={{ ...field, width: 60 }} value={edit.markup_pct} onChange={(e) => setEdit({ ...edit, markup_pct: Number(e.target.value) })} /><span style={{ fontSize: 12 }}>%</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 12, color: '#5C6770' }}>VAT</span><input type="number" style={{ ...field, width: 60 }} value={edit.vat_pct} onChange={(e) => setEdit({ ...edit, vat_pct: Number(e.target.value) })} /><span style={{ fontSize: 12 }}>%</span></div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
              <th style={th}>หมวด</th><th style={th}>รายการ</th><th style={{ ...th, textAlign: 'right' }}>จำนวน</th><th style={th}>หน่วย</th>
              <th style={{ ...th, textAlign: 'right' }}>ค่าวัสดุ/หน่วย</th><th style={{ ...th, textAlign: 'right' }}>ค่าแรง/หน่วย</th><th style={{ ...th, textAlign: 'right' }}>รวม</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {edit.items.map((it, i) => (
                <tr key={i} style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td style={{ padding: '5px 8px' }}><select style={{ ...field, padding: '5px 6px', fontSize: 12 }} value={it.cat} onChange={(e) => setItem(i, { cat: e.target.value })}>{BOQ_CATS.map((c) => <option key={c}>{c}</option>)}</select></td>
                  <td style={{ padding: '5px 8px' }}><input style={{ ...field, padding: '5px 7px', width: '100%' }} value={it.desc} onChange={(e) => setItem(i, { desc: e.target.value })} placeholder="รายการงาน" /></td>
                  <td style={{ padding: '5px 8px' }}><input type="number" style={{ ...field, padding: '5px 7px', width: 70, textAlign: 'right' }} value={it.qty || ''} onChange={(e) => setItem(i, { qty: Number(e.target.value) })} /></td>
                  <td style={{ padding: '5px 8px' }}><input style={{ ...field, padding: '5px 7px', width: 60 }} value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} /></td>
                  <td style={{ padding: '5px 8px' }}><input type="number" style={{ ...field, padding: '5px 7px', width: 90, textAlign: 'right' }} value={it.mat || ''} onChange={(e) => setItem(i, { mat: Number(e.target.value) })} /></td>
                  <td style={{ padding: '5px 8px' }}><input type="number" style={{ ...field, padding: '5px 7px', width: 90, textAlign: 'right' }} value={it.lab || ''} onChange={(e) => setItem(i, { lab: Number(e.target.value) })} /></td>
                  <td className="num" style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600 }}>{baht(it.qty * (it.mat + it.lab))}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'center' }}><button onClick={() => setEdit({ ...edit, items: edit.items.filter((_, j) => j !== i) })} style={{ border: 'none', background: 'none', color: '#C24036', cursor: 'pointer' }}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '8px 10px' }}><button onClick={() => setEdit({ ...edit, items: [...edit.items, { ...emptyItem }] })} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#30506A', background: '#fff', border: '1px dashed #B9C6D0', borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>+ เพิ่มรายการ</button></div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: 340, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 10, padding: 14, fontSize: 13 }}>
            {[['ค่าวัสดุรวม', t.mat], ['ค่าแรงรวม', t.lab], ['รวมต้นทุน', t.subtotal], [`ค่าดำเนินการ+กำไร ${edit.markup_pct}%`, t.markup], [`VAT ${edit.vat_pct}%`, t.vat]].map(([l, v], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#5C6770' }}><span>{l}</span><span className="num">{baht(v as number)}</span></div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', marginTop: 6, borderTop: '1px solid #EEF1F4', fontWeight: 700, fontSize: 16 }}><span>รวมทั้งสิ้น</span><span className="num" style={{ color: '#1E2E3B' }}>{baht(t.grand)}</span></div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => setEdit(null)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ยกเลิก</button>
          <button onClick={save} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>บันทึก BOQ</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: '#5C6770' }}>BOQ / ประมาณราคา <b className="num" style={{ color: '#1C2730' }}>{rows.length}</b> ชุด</div>
        <button onClick={newBoq} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>+ สร้าง BOQ</button>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
            <th style={{ ...th, paddingLeft: 18 }}>เลขที่</th><th style={th}>ชื่อ / บ้าน</th><th style={{ ...th, textAlign: 'right' }}>รวมทั้งสิ้น</th><th style={{ ...th, paddingRight: 18, textAlign: 'center' }}>จัดการ</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มี BOQ — กด “สร้าง BOQ”</td></tr>}
            {rows.map((b) => (
              <tr key={b.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                <td className="num" style={{ padding: '10px 18px', fontWeight: 600, fontFamily: 'monospace' }}>{b.no}<div style={{ fontSize: 10.5, color: '#94A0A8', fontFamily: 'inherit' }}>{b.date}</div></td>
                <td style={{ padding: '10px 12px' }}><div style={{ fontWeight: 500 }}>{b.title}</div><div style={{ fontSize: 11, color: '#94A0A8' }}>{houses.find((h) => h.code === b.house_code)?.name || b.house_code || '—'} · {b.items.length} รายการ</div></td>
                <td className="num" style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{baht(boqTotals(b).grand)}</td>
                <td style={{ padding: '10px 18px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button onClick={() => pushToHouse(b)} title="ดันยอดรวมเข้าราคาขาย/งวดงานของบ้าน" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#fff', background: '#C0852C', border: 'none', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>→ ราคาขาย</button>
                  <button onClick={() => setEdit(b)} className="hov-f3f5f7" style={{ marginLeft: 6, fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>แก้ไข</button>
                  <button onClick={() => setPrinting(b)} className="hov-f3f5f7" style={{ marginLeft: 6, fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>🖨</button>
                  <span style={{ marginLeft: 6, display: 'inline-block' }}><ExportButton onClick={() => doExport(b)} label="Excel" /></span>
                  <button onClick={() => remove(b.id)} style={{ marginLeft: 6, border: 'none', background: 'none', color: '#C24036', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {printing && <BoqPrint boq={printing} houseName={houses.find((h) => h.code === printing.house_code)?.name || printing.house_code} onClose={() => setPrinting(null)} />}
    </div>
  )
}
