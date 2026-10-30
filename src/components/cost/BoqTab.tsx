import { useEffect, useState } from 'react'
import { api } from '../../api'
import { baht } from '../../data'
import { useApp } from '../../store'
import { ExportButton } from '../../exportCsv'
import BoqPrint from './BoqPrint'
import BoqTakeoff from './BoqTakeoff'
import BoqPriceRefresh from './BoqPriceRefresh'
import MaterialSummaryPrint from './MaterialSummaryPrint'
import type { WorkSec } from './boqFloors'
import { exportMaterialSummaryXlsx } from './materialSummaryData'
import ModalShell from '../shared/ModalShell'
import BoqCompare from './BoqCompare'

// ref = id ราคากลางวัสดุที่ผูกไว้ · labRef = id ราคากลางค่าแรง · basis = วิธีคิดปริมาณ · floor/part/sheet = ชั้น/ส่วนงาน/แผ่นแบบ · spec = ชื่อ/สเปกตามแบบ ก่อนผูกราคากลาง (จากหน้าถอดแบบ)
export interface BoqItem { floor?: string; part?: string; sheet?: string; spec?: string; cat: string; desc: string; qty: number; unit: string; mat: number; lab: number; ref?: number; labRef?: number; basis?: string }
// work = ปริมาณงานต่อหมวด (ชั้น × ประเภทงาน × ส่วนงาน) จากการถอดแบบ
export interface Boq { id: number; no: string; house_code: string; title: string; markup_pct: number; vat_pct: number; items: BoqItem[]; work?: WorkSec[]; date: string
  // ฉบับ: root_id = id ฉบับแรก (ฉบับแรกเป็น null) · rev = R1, R2 … · locked = ฉบับเซ็นสัญญา (แก้/ลบไม่ได้)
  root_id?: number | null; rev?: number; rev_note?: string; locked?: number; locked_at?: string; locked_by?: string
  revise_of?: number // ตอนสร้าง: เป็นฉบับใหม่ของ BOQ นี้
}

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

export default function BoqTab({ houseCode }: { houseCode?: string }) {
  const { data, reloadData, user } = useApp()
  const houses = data.houses
  const [allRows, setRows] = useState<Boq[]>([])
  const rows = houseCode ? allRows.filter((r) => r.house_code === houseCode) : allRows
  const [edit, setEdit] = useState<Boq | null>(null) // BOQ ที่กำลังแก้/สร้าง
  const [printing, setPrinting] = useState<Boq | null>(null)
  const [summary, setSummary] = useState<Boq | null>(null) // สรุปวัสดุแยกชั้น/ประเภทงาน (PDF)
  const [takeoff, setTakeoff] = useState(false) // หน้าถอดแบบ → BOQ ร่าง
  const [refresh, setRefresh] = useState(false) // เทียบ/อัปเดตเป็นราคากลางล่าสุด
  const [takeoffFor, setTakeoffFor] = useState<Boq | null>(null) // ถอดแบบใหม่เป็นฉบับใหม่ของ BOQ นี้
  const [compare, setCompare] = useState<Boq[] | null>(null) // ฉบับทั้งหมดของชุดที่จะเทียบ
  const [open, setOpen] = useState<Set<number>>(new Set()) // ชุดที่กางดูฉบับเก่า
  // จัดกลุ่มเป็นชุด (ฉบับแรก + ฉบับใหม่) · ฉบับล่าสุดอยู่บน
  const families = Object.values(rows.reduce((m, b) => { const k = b.root_id || b.id; (m[k] ||= []).push(b); return m }, {} as Record<number, Boq[]>))
    .map((f) => f.sort((a, b) => (b.rev || 1) - (a.rev || 1)))
    .sort((a, b) => b[0].id - a[0].id)

  const load = () => api.get<Boq[]>('/boqs').then(setRows).catch(() => setRows([]))
  useEffect(() => { load() }, [])

  const newBoq = () => setEdit({ id: 0, no: '', house_code: houseCode || '', title: 'ประมาณราคาก่อสร้าง', markup_pct: 20, vat_pct: 7, items: [{ ...emptyItem }], date: '' })
  const save = async () => {
    if (!edit) return
    const body = { house_code: edit.house_code, title: edit.title, markup_pct: edit.markup_pct, vat_pct: edit.vat_pct, items: edit.items.filter((i) => i.desc.trim()), work: edit.work || [], rev_note: edit.rev_note, revise_of: edit.revise_of }
    try { if (edit.id) await api.put('/boqs/' + edit.id, body); else await api.post('/boqs', body) } catch (e) { alert((e as Error).message); return }
    setEdit(null); load()
  }
  const remove = async (b: Boq) => {
    if (!confirm(`ลบ BOQ ${b.no} R${b.rev || 1}?`)) return
    try { await api.del('/boqs/' + b.id); load() } catch (e) { alert((e as Error).message) }
  }
  // ฉบับใหม่ = คัดลอกฉบับล่าสุดแล้วเปิดแก้ (ฉบับเดิมเก็บไว้เทียบ/พิมพ์ได้)
  const revise = async (b: Boq) => {
    const note = prompt(`สร้างฉบับใหม่จาก ${b.no} R${b.rev || 1}\nฉบับนี้เปลี่ยนอะไร (เช่น ลูกค้าขอเพิ่มห้องน้ำ)`, '')
    if (note === null) return
    try { const nb = await api.post<Boq>('/boqs/' + b.id + '/revise', { note: note || undefined }); await load(); setEdit(nb); setOpen((o) => new Set(o).add(nb.root_id || nb.id)) }
    catch (e) { alert((e as Error).message) }
  }
  const toggleLock = async (b: Boq) => {
    if (!b.locked && !confirm(`ล็อก ${b.no} R${b.rev || 1} เป็นฉบับเซ็นสัญญา?\nล็อกแล้วแก้/ลบไม่ได้ (ถ้าต้องแก้ ให้สร้างฉบับใหม่) — ปลดล็อกได้เฉพาะแอดมิน`)) return
    try { await api.post('/boqs/' + b.id + '/lock', { locked: !b.locked }); load() } catch (e) { alert((e as Error).message) }
  }
  const isAdmin = user?.role === 'admin'
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
  // Excel ของ BOQ = สรุปวัสดุหลาย sheet (สรุป · รวมทั้งงาน · ข้อมูลทั้งหมด · แยกชั้น · แยกระบบงาน — ปริมาณอย่างเดียว)
  // + sheet สุดท้าย "BOQ (ราคา)" แบบเดิม (ค่าวัสดุ/ค่าแรงต่อรายการ)
  const doExport = (b: Boq) => exportMaterialSummaryXlsx({
    title: b.no + ' · ' + b.title, houseName: houses.find((h) => h.code === b.house_code)?.name || b.house_code, items: b.items, work: b.work, showPrice: false,
    extraSheets: [{
      name: 'BOQ (ราคา)', cols: [16, 14, 20, 48, 10, 9, 12, 13, 12, 13, 14],
      rows: [['ชั้น', 'หมวด', 'ส่วนงาน', 'รายการ', 'จำนวน', 'หน่วย', 'ค่าวัสดุ/หน่วย', 'ค่าวัสดุรวม', 'ค่าแรง/หน่วย', 'ค่าแรงรวม', 'รวม'],
        ...b.items.map((it) => [it.floor || '', it.cat, it.part || '', it.desc, it.qty, it.unit, it.mat, it.qty * it.mat, it.lab, it.qty * it.lab, it.qty * (it.mat + it.lab)])],
    }],
  }).catch((e) => alert('ส่งออก Excel ไม่สำเร็จ: ' + (e as Error).message))

  // ฟอร์มสร้าง/แก้ BOQ เป็น modal (ย่อพับได้ · ไม่ปิดเมื่อคลิกพื้นหลัง — รายการเยอะ กันข้อมูลหาย)
  const editorModal = edit && (() => {
    const t = boqTotals(edit)
    return (
      <ModalShell title={edit.id ? `${edit.locked ? 'ดู' : 'แก้ไข'} BOQ ${edit.no} R${edit.rev || 1}${edit.locked ? ' 🔒 ฉบับเซ็นสัญญา' : ''}` : edit.revise_of ? 'สร้าง BOQ ฉบับใหม่ (จากการถอดแบบใหม่)' : 'สร้าง BOQ / ประมาณราคา'} sub="ค่าวัสดุ + ค่าแรง ต่อรายการ → บวกค่าดำเนินการ/กำไร และ VAT" width={1100} closeOnBackdrop={false} onClose={() => setEdit(null)}
        headerActions={<button onClick={() => setRefresh(true)} title="เทียบราคาในแถวที่ผูกราคากลาง กับราคากลางล่าสุด" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '6px 11px', cursor: 'pointer', marginRight: 6 }}>↻ อัปเดตราคากลางล่าสุด</button>}
        bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 14, background: '#F7F9FB' }}
        footer={<>
          <button onClick={() => setEdit(null)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ยกเลิก</button>
          {!edit.locked && <button onClick={save} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>บันทึก BOQ</button>}
        </>}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 2fr 1fr 1fr', gap: 10 }}>
          {houseCode
            ? <div style={{ ...field, display: 'flex', alignItems: 'center', color: '#5C6770', background: '#F7F9FB' }}>{houses.find((h) => h.code === houseCode)?.name || houseCode}</div>
            : <select style={field} value={edit.house_code} onChange={(e) => setEdit({ ...edit, house_code: e.target.value })}>
              <option value="">— เลือกบ้าน/โครงการ —</option>
              {houses.map((h) => <option key={h.id} value={h.code}>{h.name}</option>)}
            </select>}
          <input style={field} placeholder="ชื่อ BOQ" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 12, color: '#5C6770' }}>ดำเนินการ+กำไร</span><input type="number" style={{ ...field, width: 60 }} value={edit.markup_pct} onChange={(e) => setEdit({ ...edit, markup_pct: Number(e.target.value) })} /><span style={{ fontSize: 12 }}>%</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 12, color: '#5C6770' }}>VAT</span><input type="number" style={{ ...field, width: 60 }} value={edit.vat_pct} onChange={(e) => setEdit({ ...edit, vat_pct: Number(e.target.value) })} /><span style={{ fontSize: 12 }}>%</span></div>
        </div>

        {edit.locked ? <div style={{ fontSize: 12.5, color: '#8A5A00', background: '#FFF6E0', border: '1px solid #E8C98A', borderRadius: 8, padding: '8px 12px' }}>🔒 ฉบับนี้ล็อกเป็นฉบับเซ็นสัญญา ({edit.locked_by} {edit.locked_at}) — เปิดดูได้แต่บันทึกไม่ได้ ถ้าต้องแก้ ให้กด “+ ฉบับใหม่”</div> : null}
        {(edit.revise_of || (edit.rev || 1) > 1) && <input style={field} placeholder="ฉบับนี้เปลี่ยนอะไร (เช่น แก้แบบตามลูกค้า เพิ่มห้องน้ำชั้น 2)" value={edit.rev_note || ''} onChange={(e) => setEdit({ ...edit, rev_note: e.target.value })} />}

        {/* flexShrink 0: กล่องที่ overflow hidden ในคอลัมน์ flex จะหดจนรายการถูกตัดและเลื่อนลงไม่ได้ — ให้ทั้ง modal เลื่อนแทน */}
        <div style={{ flexShrink: 0, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 10, overflow: 'hidden' }}>
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

      </ModalShell>
    )
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: '#5C6770' }}>BOQ / ประมาณราคา <b className="num" style={{ color: '#1C2730' }}>{families.length}</b> ชุด{rows.length > families.length ? ` · ${rows.length} ฉบับ` : ''}</div>
        <button onClick={() => setTakeoff(true)} className="hov-f3f5f7" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 14px', cursor: 'pointer' }}>📐 ถอดจากแบบ</button>
        <button onClick={newBoq} className="btn-primary" style={{ marginLeft: 8,fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>+ สร้าง BOQ</button>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
            <th style={{ ...th, paddingLeft: 18 }}>เลขที่</th><th style={th}>ชื่อ / บ้าน</th><th style={{ ...th, textAlign: 'right' }}>รวมทั้งสิ้น</th><th style={{ ...th, paddingRight: 18, textAlign: 'center' }}>จัดการ</th>
          </tr></thead>
          <tbody>
            {families.length === 0 && <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มี BOQ — กด “สร้าง BOQ”</td></tr>}
            {families.map((fam) => {
              const latest = fam[0]
              const shown = open.has(latest.root_id || latest.id) ? fam : [latest]
              return shown.map((b, idx) => {
                const old = idx > 0
                const lockBtn = { ...{ marginLeft: 6, fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }, ...(b.locked ? { color: '#8A5A00', background: '#FFF6E0', borderColor: '#E8C98A' } : {}) }
                return (
              <tr key={b.id} className="hov-fafbfc" style={{ borderTop: old ? '1px dashed #EEF1F4' : '1px solid #F1F4F6', background: old ? '#FAFBFC' : undefined }}>
                <td className="num" style={{ padding: '10px 18px', paddingLeft: old ? 34 : 18, fontWeight: 600, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                  {old ? '└ ' : ''}{b.no} <span title={b.rev_note || ''} style={{ fontSize: 10.5, fontWeight: 700, color: idx === 0 ? '#fff' : '#5C6770', background: idx === 0 ? '#30506A' : '#E6E9ED', borderRadius: 5, padding: '1px 5px', fontFamily: 'inherit' }}>R{b.rev || 1}</span>
                  {b.locked ? <span title={`ฉบับเซ็นสัญญา · ล็อกโดย ${b.locked_by || '-'} ${b.locked_at || ''}`} style={{ marginLeft: 4, fontSize: 10.5, fontWeight: 600, color: '#8A5A00', background: '#FFF6E0', border: '1px solid #E8C98A', borderRadius: 5, padding: '0 5px', fontFamily: 'inherit' }}>🔒 สัญญา</span> : null}
                  <div style={{ fontSize: 10.5, color: '#94A0A8', fontFamily: 'inherit', fontWeight: 400 }}>{b.date}</div>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ fontWeight: 500 }}>{b.title}</div>
                  <div style={{ fontSize: 11, color: '#94A0A8' }}>{houses.find((h) => h.code === b.house_code)?.name || b.house_code || '—'} · {b.items.length} รายการ{b.rev_note ? <> · <span style={{ color: '#5C6770' }}>{b.rev_note}</span></> : null}</div>
                  {idx === 0 && fam.length > 1 && <button onClick={() => setOpen((o) => { const n = new Set(o); const k = b.root_id || b.id; if (n.has(k)) n.delete(k); else n.add(k); return n })} style={{ marginTop: 2, fontFamily: 'inherit', fontSize: 11, color: '#30506A', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>{shown.length > 1 ? '▼ ซ่อนฉบับเก่า' : `▶ ฉบับเก่า ${fam.length - 1} ฉบับ`}</button>}
                </td>
                <td className="num" style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: old ? '#5C6770' : undefined }}>{baht(boqTotals(b).grand)}</td>
                <td style={{ padding: '10px 18px' }}>
                  {/* ปุ่มขึ้นบรรทัดใหม่ได้ — ในหน้าบ้านคอลัมน์แคบ */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', rowGap: 6, minWidth: 200 }}>
                  {!old && <button onClick={() => pushToHouse(b)} title="ดันยอดรวมเข้าราคาขาย/งวดงานของบ้าน" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#fff', background: '#C0852C', border: 'none', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>→ ราคาขาย</button>}
                  <button onClick={() => setEdit(b)} title={b.locked ? 'ฉบับเซ็นสัญญา — เปิดดูได้ แก้ไม่ได้' : undefined} className="hov-f3f5f7" style={{ marginLeft: 6, fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>{b.locked ? 'ดู' : 'แก้ไข'}</button>
                  {!old && <button onClick={() => revise(b)} title="คัดลอกฉบับนี้เป็นฉบับใหม่ แล้วแก้ (ฉบับเดิมเก็บไว้)" className="hov-f3f5f7" style={{ marginLeft: 6, fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>+ ฉบับใหม่</button>}
                  {!old && <button onClick={() => setTakeoffFor(b)} title="แก้แบบแล้ว: ถอดแบบไฟล์ใหม่ เป็นฉบับใหม่ของ BOQ นี้" className="hov-f3f5f7" style={{ marginLeft: 6, fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>📐 ถอดใหม่</button>}
                  {!old && fam.length > 1 && <button onClick={() => setCompare(fam)} title="เทียบฉบับ: เพิ่ม/ลด/เปลี่ยน และส่วนต่างยอดรวม" className="hov-f3f5f7" style={{ marginLeft: 6, fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>⇄ เทียบฉบับ</button>}
                  <button onClick={() => toggleLock(b)} disabled={!!b.locked && !isAdmin} title={b.locked ? (isAdmin ? 'ปลดล็อก (แอดมิน)' : 'ฉบับเซ็นสัญญา — ปลดล็อกได้เฉพาะแอดมิน') : 'ล็อกเป็นฉบับเซ็นสัญญา'} className="hov-f3f5f7" style={{ ...lockBtn, cursor: b.locked && !isAdmin ? 'default' : 'pointer' }}>{b.locked ? '🔒' : '🔓'}</button>
                  <button onClick={() => setPrinting(b)} className="hov-f3f5f7" style={{ marginLeft: 6, fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }} title="พิมพ์ BOQ">🖨</button>
                  <button onClick={() => setSummary(b)} title="สรุปวัสดุ รวมทั้งงาน + แยกชั้น/ประเภทงาน (PDF)" className="hov-f3f5f7" style={{ marginLeft: 6, fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>📄 สรุปวัสดุ</button>
                  <span style={{ marginLeft: 6, display: 'inline-block' }}><ExportButton onClick={() => doExport(b)} label="Excel" /></span>
                  <button onClick={() => remove(b)} disabled={!!b.locked} title={b.locked ? 'ฉบับเซ็นสัญญา — ลบไม่ได้' : 'ลบฉบับนี้'} style={{ marginLeft: 6, border: 'none', background: 'none', color: b.locked ? '#C9CFD4' : '#C24036', cursor: b.locked ? 'default' : 'pointer', fontSize: 13 }}>✕</button>
                  </div>
                </td>
              </tr>
                )
              })
            })}
          </tbody>
        </table>
      </div>
      {editorModal}
      {refresh && edit && <BoqPriceRefresh items={edit.items} onApply={(items) => setEdit((e) => e ? { ...e, items } : e)} onClose={() => setRefresh(false)} />}
      {takeoff && <BoqTakeoff houseCode={houseCode} onClose={() => setTakeoff(false)}
        onCreate={(b) => { setTakeoff(false); setEdit({ id: 0, no: '', house_code: b.house_code, title: b.title, markup_pct: 20, vat_pct: 7, items: b.items, work: b.work, date: '' }) }} />}
      {takeoffFor && <BoqTakeoff houseCode={takeoffFor.house_code || houseCode} onClose={() => setTakeoffFor(null)}
        onCreate={(b) => { const base = takeoffFor; setTakeoffFor(null); setEdit({ id: 0, no: base.no, house_code: base.house_code || b.house_code, title: base.title, markup_pct: base.markup_pct, vat_pct: base.vat_pct, items: b.items, work: b.work, date: '', revise_of: base.id, rev_note: 'ถอดแบบใหม่ (แก้แบบ)' }) }} />}
      {compare && <BoqCompare versions={compare} houseName={houses.find((h) => h.code === compare[0].house_code)?.name || compare[0].house_code} onClose={() => setCompare(null)} />}
      {summary && <MaterialSummaryPrint title={summary.no + ' · ' + summary.title} houseName={houses.find((h) => h.code === summary.house_code)?.name || summary.house_code} items={summary.items} work={summary.work} onClose={() => setSummary(null)} />}
      {printing && <BoqPrint boq={printing} houseName={houses.find((h) => h.code === printing.house_code)?.name || printing.house_code} onClose={() => setPrinting(null)} />}
    </div>
  )
}
