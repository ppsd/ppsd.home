import { useEffect, useState } from 'react'
import { api } from '../../api'
import { baht } from '../../data'
import { useApp } from '../../store'
import ModalShell from '../shared/ModalShell'
import { BOQ_CATS, type BoqItem } from './BoqTab'

// ถอดแบบ → BOQ ร่าง: อัปโหลดไฟล์แบบ (DXF / PDF / รูป) + ข้อมูลบ้านคร่าวๆ → ระบบถอดปริมาณ + จับคู่ราคากลาง
// → คนตรวจ/แก้ทีละแถว (เลือกราคากลาง ติ๊กออก) → สร้างเป็น BOQ ร่างในฟอร์มเดิม
// ค่าแรงแยกเป็นอีกตาราง: คิดตามปริมาณงาน (ตร.ม./เมตร/ชุด/เหมา) ตามราคากลางค่าแรง — ไม่ผูกกับจำนวนวัสดุ

interface MatOpt { id: number; name: string; unit: string; central: number; confidence?: string; score?: number }
interface TakeoffItem { cat: string; desc: string; qty: number; unit: string; basis: string; confidence: string; mat_match: MatOpt | null; mat_alts: MatOpt[] }
interface LaborItem { cat: string; rate_id: number; name: string; unit: string; price: number; quote: boolean; qty: number; basis: string; confidence: string }
interface DxfSummary {
  units: string; unit_from_file: boolean; entity_count: number; layers: string[]
  blocks: { name: string; layer: string; count: number }[]
  lengths: { layer: string; length_m: number; segments: number }[]
  areas: { layer: string; area_m2: number; count: number; source: string }[]
  circles: { layer: string; diameter_m: number; count: number }[]
}
interface Result { source: 'dxf' | 'pdf' | 'image'; ai: boolean; model: string; drawing: string; items: TakeoffItem[]; labor: LaborItem[]; notes: string[]; dxf: DxfSummary | null }
interface LaborRate { id: number; name: string; variant: string; price_min: number; price_max: number; unit: string }
interface Row { use: boolean; cat: string; desc: string; qty: number; unit: string; basis: string; confidence: string; alts: MatOpt[]; matId: number; mat: number }
interface LRow { use: boolean; cat: string; rateId: number; qty: number; unit: string; price: number; basis: string; confidence: string }

const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 9px', outline: 'none' }
const cell: React.CSSProperties = { ...field, padding: '5px 7px', fontSize: 12.5 }
const th: React.CSSProperties = { padding: '8px 8px', fontWeight: 600, color: '#5C6770', fontSize: 11.5, whiteSpace: 'nowrap' }
const label: React.CSSProperties = { fontSize: 11.5, color: '#5C6770', marginBottom: 4 }
const chip: React.CSSProperties = { fontFamily: 'inherit', fontSize: 12, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }
const confColor = (c: string) => c === 'สูง' ? { c: '#2E7D4F', bg: '#E6F4EC' } : c === 'กลาง' ? { c: '#9A6B12', bg: '#FBF1DC' } : { c: '#B23B30', bg: '#FBE7E5' }
const labLabel = (r: LaborRate) => r.name + (r.variant ? ` (${r.variant})` : '')
const labMid = (r: LaborRate) => r.price_max > 0 ? Math.round((r.price_min + r.price_max) / 2) : 0

export default function BoqTakeoff({ houseCode, onClose, onCreate }: {
  houseCode?: string
  onClose: () => void
  onCreate: (b: { house_code: string; title: string; items: BoqItem[] }) => void
}) {
  const { data } = useApp()
  const houses = data.houses
  const [house, setHouse] = useState(houseCode || '')
  const [file, setFile] = useState<File | null>(null)
  const [units, setUnits] = useState('auto')
  const [info, setInfo] = useState({ area_m2: '', floors: '', ceiling_h: '', raised_h: '', spec: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [res, setRes] = useState<Result | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [lrows, setLRows] = useState<LRow[]>([])
  const [rates, setRates] = useState<LaborRate[]>([])
  const [showRaw, setShowRaw] = useState(false)
  // ส่วนที่เปิด/ปิดได้ · หมวดวัสดุที่ยุบไว้ · กรองเฉพาะแถวที่ยังไม่มีราคา
  const [open, setOpen] = useState({ input: true, notes: true, mat: true, lab: true })
  const toggle = (k: keyof typeof open) => setOpen((o) => ({ ...o, [k]: !o[k] }))
  const [closedCats, setClosedCats] = useState<string[]>([])
  const [onlyUnpriced, setOnlyUnpriced] = useState(false)

  useEffect(() => { api.get<LaborRate[]>('/labor-rates').then(setRates).catch(() => setRates([])) }, [])

  const isDxf = !!file && /\.dxf$/i.test(file.name)
  const run = async () => {
    if (!file) { setErr('กรุณาเลือกไฟล์แบบ'); return }
    setBusy(true); setErr(''); setRes(null)
    try {
      const q = new URLSearchParams({ name: file.name, units, house: JSON.stringify(info) })
      const r = await api.uploadRaw<Result>('/boq-takeoff?' + q.toString(), file)
      setRes(r)
      setRows(r.items.map((it) => {
        const alts = it.mat_match && !it.mat_alts.some((a) => a.id === it.mat_match!.id) ? [it.mat_match, ...it.mat_alts] : it.mat_alts
        return {
          use: true, cat: it.cat, desc: it.desc, qty: it.qty, unit: it.unit, basis: it.basis, confidence: it.confidence, alts,
          matId: it.mat_match?.id || 0, mat: it.mat_match?.central || 0,
        }
      }))
      setOpen({ input: false, notes: true, mat: true, lab: true }); setClosedCats([]); setOnlyUnpriced(false)
      setLRows(r.labor.map((l) => ({ use: true, cat: l.cat, rateId: l.rate_id, qty: l.qty, unit: l.unit, price: l.price, basis: l.basis, confidence: l.confidence })))
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => j === i ? { ...r, ...patch } : r))
  const pickMat = (i: number, id: number) => {
    const r = rows[i]
    const m = r.alts.find((a) => a.id === id)
    setRow(i, m ? { matId: m.id, mat: m.central } : { matId: 0 })
  }
  const setLRow = (i: number, patch: Partial<LRow>) => setLRows((rs) => rs.map((r, j) => j === i ? { ...r, ...patch } : r))
  const pickRate = (i: number, id: number) => {
    const l = rates.find((x) => x.id === id)
    setLRow(i, l ? { rateId: l.id, unit: l.unit, price: labMid(l) } : { rateId: 0, unit: '', price: 0 })
  }
  const addLabor = () => setLRows((rs) => [...rs, { use: true, cat: 'สถาปัตยกรรม', rateId: 0, qty: 0, unit: '', price: 0, basis: '', confidence: 'กลาง' }])
  // วัสดุที่ยังไม่มีในราคากลาง → เพิ่มเข้าราคากลางด้วยชื่อ/หน่วย/ราคาที่กรอกในแถวนี้
  const addToMaster = async (i: number) => {
    const r = rows[i]
    if (!(r.mat > 0)) { alert('กรอกค่าวัสดุ/หน่วยก่อน แล้วค่อยเพิ่มเข้าราคากลาง'); return }
    if (!confirm(`เพิ่ม “${r.desc}” (${r.unit}) ราคา ${baht(r.mat)} เข้าราคากลางวัสดุ?`)) return
    try {
      const m = await api.post<MatOpt>('/material-prices', { name: r.desc, unit: r.unit, central: r.mat, note: 'เพิ่มจากหน้าถอดแบบ' })
      setRow(i, { alts: [m, ...r.alts], matId: m.id })
    } catch (e) { alert((e as Error).message) }
  }

  const used = rows.filter((r) => r.use)
  const usedL = lrows.filter((r) => r.use && r.rateId)
  const totMat = used.reduce((s, r) => s + r.qty * r.mat, 0)
  const totLab = usedL.reduce((s, r) => s + r.qty * r.price, 0)
  const unmatchedAll = rows.filter((r) => !r.matId).length
  const count = used.length + usedL.length
  const groups = BOQ_CATS.map((cat) => ({ cat, idx: rows.flatMap((r, i) => r.cat === cat ? [i] : []) })).filter((g) => g.idx.length)

  // แถววัสดุ 1 แถว (แสดงใต้หัวหมวด)
  const matRow = (r: Row, i: number) => {
    const cc = confColor(r.confidence)
    const m = r.alts.find((a) => a.id === r.matId)
    return (
      <tr key={i} style={{ borderTop: '1px solid #F1F4F6', opacity: r.use ? 1 : 0.45, verticalAlign: 'top' }}>
        <td style={{ padding: '8px 8px' }}><input type="checkbox" checked={r.use} onChange={(e) => setRow(i, { use: e.target.checked })} /></td>
        <td style={{ padding: '5px 6px' }}><select style={{ ...cell, width: 118 }} value={r.cat} onChange={(e) => setRow(i, { cat: e.target.value })}>{BOQ_CATS.map((c) => <option key={c}>{c}</option>)}</select></td>
        <td style={{ padding: '5px 6px', minWidth: 220 }}>
          <input style={{ ...cell, width: '100%' }} value={r.desc} onChange={(e) => setRow(i, { desc: e.target.value })} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 4 }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: cc.c, background: cc.bg, borderRadius: 20, padding: '1px 7px', whiteSpace: 'nowrap' }}>{r.confidence}</span>
            {r.basis && <span style={{ fontSize: 11, color: '#7A858D', lineHeight: 1.35 }}>{r.basis}</span>}
          </div>
        </td>
        <td style={{ padding: '5px 6px' }}><input type="number" style={{ ...cell, width: 72, textAlign: 'right' }} value={r.qty || ''} onChange={(e) => setRow(i, { qty: Number(e.target.value) })} /></td>
        <td style={{ padding: '5px 6px' }}><input style={{ ...cell, width: 56 }} value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })} /></td>
        <td style={{ padding: '5px 6px', minWidth: 210 }}>
          <select style={{ ...cell, width: '100%', color: r.matId ? '#1C2730' : '#B23B30' }} value={r.matId} onChange={(e) => pickMat(i, Number(e.target.value))}>
            <option value={0}>— ไม่มีในราคากลาง (กรอกเอง) —</option>
            {r.alts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.unit} · {baht(a.central)}</option>)}
          </select>
          {m && m.unit && r.unit && m.unit.replace(/\.$/, '') !== r.unit.replace(/\.$/, '') && <div style={{ fontSize: 11, color: '#9A6B12', marginTop: 3 }}>⚠ ราคากลางคิดต่อ “{m.unit}” แต่จำนวนเป็น “{r.unit}”</div>}
          {!r.matId && <button onClick={() => addToMaster(i)} className="hov-f3f5f7" style={{ marginTop: 4, fontFamily: 'inherit', fontSize: 11, color: '#30506A', background: '#fff', border: '1px dashed #B9C6D0', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>+ เพิ่มเข้าราคากลาง</button>}
        </td>
        <td style={{ padding: '5px 6px' }}><input type="number" style={{ ...cell, width: 86, textAlign: 'right' }} value={r.mat || ''} onChange={(e) => setRow(i, { mat: Number(e.target.value) })} /></td>
        <td className="num" style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{baht(r.qty * r.mat)}</td>
      </tr>
    )
  }

  const create = () => {
    const items: BoqItem[] = used.map((r) => {
      const m = r.alts.find((a) => a.id === r.matId)
      return { cat: r.cat, desc: m ? m.name : r.desc, qty: r.qty, unit: r.unit, mat: r.mat, lab: 0, ref: m?.id, basis: r.basis }
    })
    for (const l of usedL) {
      const rate = rates.find((x) => x.id === l.rateId)
      items.push({ cat: l.cat, desc: 'ค่าแรง: ' + (rate ? labLabel(rate) : ''), qty: l.qty, unit: l.unit, mat: 0, lab: l.price, basis: l.basis })
    }
    if (!items.length) { alert('ไม่มีรายการที่เลือก'); return }
    onCreate({ house_code: house, title: 'ถอดแบบ: ' + (res?.drawing || file?.name || ''), items })
  }

  return (
    <ModalShell title="ถอดแบบ → BOQ ร่าง" sub="อัปโหลดไฟล์แบบ (DXF / PDF / รูป) · ระบบถอดปริมาณและจับคู่ราคากลางให้ · ตรวจแก้ก่อนสร้าง BOQ" width={1240} closeOnBackdrop={false} onClose={onClose}
      bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 14, background: '#F7F9FB' }}
      footer={<>
        <button onClick={onClose} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ยกเลิก</button>
        <button onClick={create} disabled={!count} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: count ? '#30506A' : '#9AABB8', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: count ? 'pointer' : 'default' }}>สร้าง BOQ ร่าง ({count} รายการ)</button>
      </>}>

      {/* 1) ไฟล์แบบ + ข้อมูลบ้าน — ถอดเสร็จแล้วยุบเก็บให้เอง เพื่อให้ตารางผลมีที่มากขึ้น */}
      <Section title="ไฟล์แบบ + ข้อมูลบ้าน" meta={file ? file.name : 'ยังไม่ได้เลือกไฟล์'} open={open.input} onToggle={() => toggle('input')}>
        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.7fr 0.7fr 0.7fr 0.7fr', gap: 10, alignItems: 'end' }}>
          <div>
            <div style={label}>ไฟล์แบบ (DXF · PDF · JPG/PNG)</div>
            <input type="file" accept=".dxf,.pdf,image/png,image/jpeg,image/webp" onChange={(e) => { setFile(e.target.files?.[0] || null); setErr('') }} style={{ ...field, width: '100%', padding: '5px 7px' }} />
          </div>
          <div>
            <div style={label}>บ้าน / โครงการ</div>
            {houseCode
              ? <div style={{ ...field, color: '#5C6770', background: '#F7F9FB' }}>{houses.find((h) => h.code === houseCode)?.name || houseCode}</div>
              : <select style={{ ...field, width: '100%' }} value={house} onChange={(e) => setHouse(e.target.value)}>
                <option value="">— ยังไม่เลือก —</option>
                {houses.map((h) => <option key={h.id} value={h.code}>{h.name}</option>)}
              </select>}
          </div>
          <div><div style={label}>พื้นที่ใช้สอย (ตร.ม.)</div><input type="number" style={{ ...field, width: '100%' }} value={info.area_m2} onChange={(e) => setInfo({ ...info, area_m2: e.target.value })} /></div>
          <div><div style={label}>จำนวนชั้น</div><input type="number" style={{ ...field, width: '100%' }} value={info.floors} onChange={(e) => setInfo({ ...info, floors: e.target.value })} /></div>
          <div><div style={label}>สูงฝ้า (ม.)</div><input type="number" style={{ ...field, width: '100%' }} value={info.ceiling_h} onChange={(e) => setInfo({ ...info, ceiling_h: e.target.value })} /></div>
          <div><div style={label}>ยกพื้น (ม.)</div><input type="number" style={{ ...field, width: '100%' }} value={info.raised_h} onChange={(e) => setInfo({ ...info, raised_h: e.target.value })} /></div>
          <div style={{ gridColumn: 'span 4' }}><div style={label}>สเปก / หมายเหตุ (ไม่บังคับ)</div><input style={{ ...field, width: '100%' }} placeholder="เช่น ท่อ PVC ชั้น 13.5 · สุขภัณฑ์ COTTO · ผนังอิฐมอญ" value={info.spec} onChange={(e) => setInfo({ ...info, spec: e.target.value })} /></div>
          <div>
            <div style={label}>หน่วยที่วาดในแบบ {isDxf ? '' : '(เฉพาะ DXF)'}</div>
            <select style={{ ...field, width: '100%' }} value={units} disabled={!isDxf} onChange={(e) => setUnits(e.target.value)}>
              <option value="auto">อ่านจากไฟล์</option><option value="mm">มิลลิเมตร</option><option value="cm">เซนติเมตร</option><option value="m">เมตร</option>
            </select>
          </div>
          <button onClick={run} disabled={busy || !file} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: busy || !file ? '#9AABB8' : '#C0852C', border: 'none', borderRadius: 9, padding: '9px 14px', cursor: busy || !file ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
            {busy ? 'กำลังถอดแบบ…' : res ? 'ถอดใหม่' : 'ถอดแบบ'}
          </button>
        </div>
      </Section>
      {busy && !isDxf && <div style={{ fontSize: 12.5, color: '#5C6770' }}>AI กำลังอ่านแบบ อาจใช้เวลา 30 วินาที – 2 นาที</div>}
      {err && <div style={{ fontSize: 13, color: '#B23B30', background: '#FBE7E5', borderRadius: 8, padding: '9px 12px' }}>{err}</div>}

      {/* 2) ผลถอด */}
      {res && <>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 12.5, color: '#5C6770' }}>
          <span style={{ fontWeight: 600, color: '#1C2730' }}>{res.drawing || ({ dxf: 'ไฟล์ DXF', pdf: 'ไฟล์ PDF', image: 'รูปภาพ' })[res.source]}</span>
          <span>· {res.ai ? `AI ช่วยตั้งชื่อ${res.model ? ' (' + res.model + ')' : ''}` : 'ไม่ได้ใช้ AI'}</span>
          {res.dxf && <button onClick={() => setShowRaw(!showRaw)} className="hov-f3f5f7" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>{showRaw ? 'ซ่อน' : 'ดู'}ข้อมูลดิบจาก DXF</button>}
        </div>
        {res.notes.length > 0 && <Section title="ข้อสังเกตจาก AI" meta={`${res.notes.length} ข้อ`} open={open.notes} onToggle={() => toggle('notes')} tone="note">
          <div style={{ padding: '8px 14px 10px', fontSize: 12.5, color: '#7A5A12' }}>{res.notes.map((n, i) => <div key={i}>• {n}</div>)}</div>
        </Section>}
        {showRaw && res.dxf && <DxfRaw s={res.dxf} />}

        {/* วัสดุ — แยกตามหมวด กดหัวหมวดเพื่อเปิด/ปิด */}
        <Section title="วัสดุ" open={open.mat} onToggle={() => toggle('mat')}
          meta={<>{rows.length} รายการ · จับคู่ราคากลางได้ {rows.length - unmatchedAll}{unmatchedAll > 0 && <span style={{ color: '#B23B30' }}> · ยังไม่มีราคา {unmatchedAll}</span>} · <b className="num" style={{ color: '#1C2730' }}>{baht(totMat)}</b></>}
          actions={<>
            <button onClick={() => setOnlyUnpriced(!onlyUnpriced)} className="hov-f3f5f7" style={{ ...chip, ...(onlyUnpriced ? { background: '#FBE7E5', borderColor: '#F0C4BF', color: '#B23B30' } : {}) }}>เฉพาะยังไม่มีราคา</button>
            <button onClick={() => setClosedCats(closedCats.length ? [] : groups.map((g) => g.cat))} className="hov-f3f5f7" style={chip}>{closedCats.length ? 'ขยายทุกหมวด' : 'ยุบทุกหมวด'}</button>
          </>}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
                <th style={th}><input type="checkbox" checked={rows.length > 0 && rows.every((r) => r.use)} onChange={(e) => setRows(rows.map((r) => ({ ...r, use: e.target.checked })))} /></th>
                <th style={th}>หมวด</th><th style={th}>รายการที่ถอดได้</th><th style={{ ...th, textAlign: 'right' }}>จำนวน</th><th style={th}>หน่วย</th>
                <th style={th}>ราคากลางวัสดุ</th><th style={{ ...th, textAlign: 'right' }}>วัสดุ/หน่วย</th><th style={{ ...th, textAlign: 'right' }}>รวม</th>
              </tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#94A0A8' }}>ไม่พบรายการวัสดุในแบบนี้</td></tr>}
                {groups.map((g) => {
                  const closed = closedCats.includes(g.cat)
                  const shown = onlyUnpriced ? g.idx.filter((i) => !rows[i].matId) : g.idx
                  const sub = g.idx.reduce((s, i) => s + (rows[i].use ? rows[i].qty * rows[i].mat : 0), 0)
                  const miss = g.idx.filter((i) => !rows[i].matId).length
                  if (onlyUnpriced && !shown.length) return null
                  return [
                    <tr key={'g' + g.cat} onClick={() => setClosedCats(closed ? closedCats.filter((c) => c !== g.cat) : [...closedCats, g.cat])} style={{ background: '#F1F4F7', cursor: 'pointer', borderTop: '1px solid #E1E5EA' }}>
                      <td colSpan={7} style={{ padding: '7px 10px', fontSize: 12.5, fontWeight: 600, color: '#30506A' }}>
                        <span style={{ display: 'inline-block', width: 14, transform: closed ? 'none' : 'rotate(90deg)', transition: 'transform .15s', fontSize: 10 }}>▶</span>
                        {g.cat} <span style={{ fontWeight: 400, color: '#5C6770' }}>· {g.idx.length} รายการ{miss > 0 && <span style={{ color: '#B23B30' }}> · ยังไม่มีราคา {miss}</span>}</span>
                      </td>
                      <td className="num" style={{ padding: '7px 8px', textAlign: 'right', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{baht(sub)}</td>
                    </tr>,
                    ...(closed ? [] : shown.map((i) => matRow(rows[i], i))),
                  ]
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ค่าแรง: คิดตามปริมาณงาน ไม่ได้คิดตามจำนวนวัสดุ */}
        <Section title="ค่าแรง (ค่าแรง + วัสดุสิ้นเปลือง)" open={open.lab} onToggle={() => toggle('lab')}
          meta={<>{lrows.length} รายการ · <b className="num" style={{ color: '#1C2730' }}>{baht(totLab)}</b></>}
          actions={<button onClick={() => { addLabor(); setOpen((o) => ({ ...o, lab: true })) }} className="hov-f3f5f7" style={{ ...chip, borderStyle: 'dashed' }}>+ เพิ่มค่าแรง</button>}>
          <div style={{ padding: '6px 14px', fontSize: 12, color: '#5C6770', background: '#FAFBFC' }}>คิดตามปริมาณงาน เช่น ตร.ม. ผนัง / พื้นที่บ้าน / เมตร / ชุด ตามราคากลางค่าแรง — ไม่ได้คิดตามจำนวนวัสดุ</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
                <th style={th}></th><th style={th}>หมวด</th><th style={th}>หมวดค่าแรง</th><th style={{ ...th, textAlign: 'right' }}>ปริมาณงาน</th><th style={th}>หน่วย</th>
                <th style={{ ...th, textAlign: 'right' }}>ค่าแรง/หน่วย</th><th style={{ ...th, textAlign: 'right' }}>รวม</th><th style={th}></th>
              </tr></thead>
              <tbody>
                {lrows.length === 0 && <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: '#94A0A8', fontSize: 12.5 }}>ยังไม่มีค่าแรง — กด “+ เพิ่มค่าแรง” แล้วเลือกหมวดงาน</td></tr>}
                {lrows.map((l, i) => {
                  const cc = confColor(l.confidence)
                  const rate = rates.find((x) => x.id === l.rateId)
                  return (
                    <tr key={i} style={{ borderTop: '1px solid #F1F4F6', opacity: l.use ? 1 : 0.45, verticalAlign: 'top' }}>
                      <td style={{ padding: '8px 8px' }}><input type="checkbox" checked={l.use} onChange={(e) => setLRow(i, { use: e.target.checked })} /></td>
                      <td style={{ padding: '5px 6px' }}><select style={{ ...cell, width: 118 }} value={l.cat} onChange={(e) => setLRow(i, { cat: e.target.value })}>{BOQ_CATS.map((c) => <option key={c}>{c}</option>)}</select></td>
                      <td style={{ padding: '5px 6px', minWidth: 260 }}>
                        <select style={{ ...cell, width: '100%', color: l.rateId ? '#1C2730' : '#B23B30' }} value={l.rateId} onChange={(e) => pickRate(i, Number(e.target.value))}>
                          <option value={0}>— เลือกหมวดค่าแรง —</option>
                          {rates.map((x) => <option key={x.id} value={x.id}>{labLabel(x)} · {x.price_max > 0 ? baht(labMid(x)) + '/' + x.unit : 'เสนอราคา'}</option>)}
                        </select>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 4 }}>
                          {l.basis && <span style={{ fontSize: 10.5, fontWeight: 600, color: cc.c, background: cc.bg, borderRadius: 20, padding: '1px 7px', whiteSpace: 'nowrap' }}>{l.confidence}</span>}
                          <input style={{ ...cell, flex: 1, fontSize: 11.5, padding: '3px 6px', color: '#5C6770' }} placeholder="วิธีคิดปริมาณงาน เช่น ผนังยาว 40 ม. x สูง 2.8 ม." value={l.basis} onChange={(e) => setLRow(i, { basis: e.target.value })} />
                        </div>
                      </td>
                      <td style={{ padding: '5px 6px' }}><input type="number" style={{ ...cell, width: 80, textAlign: 'right' }} value={l.qty || ''} onChange={(e) => setLRow(i, { qty: Number(e.target.value) })} /></td>
                      <td style={{ padding: '10px 6px', fontSize: 12.5, color: '#3A464F', whiteSpace: 'nowrap' }}>{l.unit || '—'}</td>
                      <td style={{ padding: '5px 6px' }}>
                        <input type="number" style={{ ...cell, width: 90, textAlign: 'right' }} value={l.price || ''} onChange={(e) => setLRow(i, { price: Number(e.target.value) })} placeholder={rate && !(rate.price_max > 0) ? 'เสนอราคา' : ''} />
                        {rate && rate.price_max > rate.price_min && <div style={{ fontSize: 10.5, color: '#94A0A8', marginTop: 3, textAlign: 'right' }}>{baht(rate.price_min)}–{baht(rate.price_max)}</div>}
                      </td>
                      <td className="num" style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{baht(l.qty * l.price)}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}><button onClick={() => setLRows(lrows.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: '#C24036', cursor: 'pointer' }}>✕</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 22, fontSize: 13, color: '#5C6770' }}>
          <span>ค่าวัสดุ <b className="num" style={{ color: '#1C2730' }}>{baht(totMat)}</b></span>
          <span>ค่าแรง <b className="num" style={{ color: '#1C2730' }}>{baht(totLab)}</b></span>
          <span>รวมต้นทุน <b className="num" style={{ color: '#1C2730' }}>{baht(totMat + totLab)}</b></span>
          <span style={{ fontSize: 11.5 }}>(ค่าดำเนินการ/กำไร และ VAT ตั้งในขั้นถัดไป)</span>
        </div>
      </>}
    </ModalShell>
  )
}

// กล่องที่กดหัวเพื่อเปิด/ปิด — ไม่หดตามความสูง modal (ให้ทั้ง modal เลื่อนแทน ตารางจะไม่กลายเป็นช่องเล็ก)
function Section({ title, meta, open, onToggle, actions, tone, children }: {
  title: string; meta?: React.ReactNode; open: boolean; onToggle: () => void; actions?: React.ReactNode; tone?: 'note'; children: React.ReactNode
}) {
  const note = tone === 'note'
  return (
    <div style={{ flexShrink: 0, background: note ? '#FBF1DC' : '#fff', border: '1px solid ' + (note ? '#F1DFB4' : '#E1E5EA'), borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px' }}>
        <button onClick={onToggle} style={{ display: 'flex', alignItems: 'baseline', gap: 8, flex: 1, minWidth: 0, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: 0 }}>
          <span style={{ display: 'inline-block', width: 12, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: '#5C6770', fontSize: 10 }}>▶</span>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: note ? '#7A5A12' : '#1C2730', whiteSpace: 'nowrap' }}>{title}</span>
          {meta && <span style={{ fontSize: 12, color: '#5C6770', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</span>}
        </button>
        {actions}
      </div>
      {open && <div style={{ borderTop: '1px solid ' + (note ? '#F1DFB4' : '#EEF1F4') }}>{children}</div>}
    </div>
  )
}

// ข้อมูลดิบจากไฟล์ DXF — ให้คนเทียบได้ว่าระบบนับ/วัดอะไรมา
function DxfRaw({ s }: { s: DxfSummary }) {
  const box: React.CSSProperties = { background: '#fff', border: '1px solid #E1E5EA', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#3A464F' }
  const h: React.CSSProperties = { fontWeight: 600, color: '#1C2730', marginBottom: 6 }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      <div style={box}>
        <div style={h}>Block ({s.blocks.length})</div>
        {s.blocks.slice(0, 40).map((b, i) => <div key={i}>{b.name} <span style={{ color: '#94A0A8' }}>[{b.layer}]</span> × <b>{b.count}</b></div>)}
        {s.circles.length > 0 && <div style={{ ...h, marginTop: 8 }}>วงกลม</div>}
        {s.circles.slice(0, 15).map((c, i) => <div key={i}>ø{c.diameter_m} ม. <span style={{ color: '#94A0A8' }}>[{c.layer}]</span> × <b>{c.count}</b></div>)}
      </div>
      <div style={box}>
        <div style={h}>ความยาวตาม Layer (ม.)</div>
        {s.lengths.slice(0, 40).map((l, i) => <div key={i}>{l.layer}: <b>{l.length_m}</b> <span style={{ color: '#94A0A8' }}>({l.segments} เส้น)</span></div>)}
      </div>
      <div style={box}>
        <div style={h}>พื้นที่ตาม Layer (ตร.ม.)</div>
        {s.areas.slice(0, 40).map((a, i) => <div key={i}>{a.layer}: <b>{a.area_m2}</b> <span style={{ color: '#94A0A8' }}>({a.source} {a.count})</span></div>)}
        <div style={{ marginTop: 8, color: '#94A0A8' }}>หน่วยในแบบ: {s.units}{s.unit_from_file ? ' (จากไฟล์)' : ''} · {s.entity_count} วัตถุ · {s.layers.length} Layer</div>
      </div>
    </div>
  )
}
