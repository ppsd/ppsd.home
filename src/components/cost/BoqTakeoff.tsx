import { useEffect, useState } from 'react'
import { api } from '../../api'
import { baht } from '../../data'
import { useApp } from '../../store'
import ModalShell from '../shared/ModalShell'
import { BOQ_CATS, type BoqItem } from './BoqTab'
import { FLOOR_ALL, floorOptions, sortFloors, type WorkSec } from './boqFloors'
import MaterialSummaryPrint from './MaterialSummaryPrint'

// ถอดแบบ → BOQ ร่าง: อัปโหลดไฟล์แบบ (DWG / DXF / PDF / รูป) + ข้อมูลบ้านคร่าวๆ → ระบบถอดปริมาณ + จับคู่ราคากลาง
// → คนตรวจ/แก้ทีละแถว (เลือกราคากลาง ติ๊กออก) → สร้างเป็น BOQ ร่างในฟอร์มเดิม
// ค่าแรงแยกเป็นอีกตาราง: คิดตามปริมาณงาน (ตร.ม./เมตร/ชุด/เหมา) ตามราคากลางค่าแรง — ไม่ผูกกับจำนวนวัสดุ

interface MatOpt { id: number; name: string; unit: string; central: number; confidence?: string; score?: number }
interface TakeoffItem { floor?: string; part?: string; sheet?: string; cat: string; desc: string; qty: number; unit: string; basis: string; confidence: string; mat_match: MatOpt | null; mat_alts: MatOpt[] }
interface LaborItem { floor?: string; part?: string; sheet?: string; cat: string; rate_id: number; name: string; unit: string; price: number; quote: boolean; qty: number; basis: string; confidence: string }
interface DxfSummary {
  units: string; unit_from_file: boolean; entity_count: number; layers: string[]
  blocks: { name: string; layer: string; count: number }[]
  lengths: { layer: string; length_m: number; segments: number }[]
  areas: { layer: string; area_m2: number; count: number; source: string }[]
  circles: { layer: string; diameter_m: number; count: number }[]
}
interface Result { source: 'dxf' | 'pdf' | 'image' | 'multi'; files?: string[]; ai: boolean; model: string; drawing: string; items: TakeoffItem[]; labor: LaborItem[]; work?: WorkSec[]; notes: string[]; dxf: DxfSummary | null }
interface LaborRate { id: number; name: string; variant: string; price_min: number; price_max: number; unit: string }
interface WebPrice { price: number; low: number; high: number; shop: string; url: string; sources: number; note: string }
// web = ราคาจากอินเทอร์เน็ต (ชั่วคราว) สำหรับวัสดุที่ยังไม่มีในราคากลาง
interface Row { use: boolean; floor: string; part: string; sheet: string; cat: string; desc: string; qty: number; unit: string; basis: string; confidence: string; alts: MatOpt[]; matId: number; mat: number; web?: WebPrice }
interface LRow { use: boolean; floor: string; part: string; sheet: string; cat: string; rateId: number; qty: number; unit: string; price: number; basis: string; confidence: string }
interface HouseFile { id: number; name: string; mime: string; size: number; category: string | null; uploaded: string }

// ชนิดไฟล์ที่ถอดได้ · DWG/DXF ถอดทีละไฟล์ · PDF/รูปเลือกหลายไฟล์ให้ AI อ่านพร้อมกัน
const fileKind = (name: string) => /\.(dwg|dxf)$/i.test(name) ? 'cad' : /\.pdf$/i.test(name) ? 'pdf' : /\.(png|jpe?g|webp|gif)$/i.test(name) ? 'image' : ''
const MAX_AI_MB = 24 // ต้องตรงกับ TAKEOFF_MAX_BYTES ใน server/index.js
const mb = (n: number) => (n / 1048576).toFixed(n < 1048576 ? 2 : 1) + ' MB'

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
  onCreate: (b: { house_code: string; title: string; items: BoqItem[]; work: WorkSec[] }) => void
}) {
  const { data } = useApp()
  const houses = data.houses
  const [house, setHouse] = useState(houseCode || '')
  const [file, setFile] = useState<File | null>(null)
  const [units, setUnits] = useState('auto')
  const [info, setInfo] = useState({ area_m2: '', floors: '', ceiling_h: '', raised_h: '', spec: '' })
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0) // วินาทีที่งานถอดแบบรันมาแล้ว (จาก server)
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
  const [groupBy, setGroupBy] = useState<'floor' | 'cat'>('floor') // จัดกลุ่มวัสดุ: แยกชั้น × ประเภทงาน หรือ ประเภทงานอย่างเดียว
  const [printing, setPrinting] = useState(false) // หน้าสรุปวัสดุ (PDF)
  const [onlyUnpriced, setOnlyUnpriced] = useState(false)

  useEffect(() => { api.get<LaborRate[]>('/labor-rates').then(setRates).catch(() => setRates([])) }, [])

  // ไฟล์แบบมาจาก: อัปโหลดใหม่ หรือ เอกสารที่เก็บไว้ในบ้านนี้แล้ว (เลือกได้หลายไฟล์)
  const [mode, setMode] = useState<'upload' | 'house'>('upload')
  const [hfiles, setHFiles] = useState<HouseFile[]>([])
  const [picked, setPicked] = useState<number[]>([])
  useEffect(() => {
    setPicked([])
    if (!house) { setHFiles([]); return }
    api.get<HouseFile[]>('/files?house=' + encodeURIComponent(house)).then((fs) => {
      setHFiles(fs)
      if (fs.some((f) => fileKind(f.name))) setMode('house') // บ้านที่มีแบบอยู่แล้ว → เปิดแท็บเอกสารของบ้านให้ก่อน
    }).catch(() => setHFiles([]))
  }, [house])
  // แบบก่อสร้างขึ้นก่อน แล้วไฟล์ใหม่ก่อน · ไฟล์ที่ถอดไม่ได้ (เช่น .skp) แยกไว้นับอย่างเดียว
  const usable = hfiles.filter((f) => fileKind(f.name)).sort((a, b) => Number(b.category === 'แบบก่อสร้าง') - Number(a.category === 'แบบก่อสร้าง') || b.id - a.id)
  const unusable = hfiles.length - usable.length
  const pickedFiles = usable.filter((f) => picked.includes(f.id))
  const pickedMB = pickedFiles.reduce((s, f) => s + (f.size || 0), 0)
  const togglePick = (f: HouseFile) => {
    if (picked.includes(f.id)) { setPicked(picked.filter((x) => x !== f.id)); return }
    // DWG/DXF ถอดทีละไฟล์ → เลือกแล้วล้างตัวอื่น · เลือก PDF/รูป → เอา DWG/DXF ที่ค้างอยู่ออก
    if (fileKind(f.name) === 'cad') setPicked([f.id])
    else setPicked([...picked.filter((x) => fileKind(usable.find((u) => u.id === x)?.name || '') !== 'cad'), f.id])
  }

  const isDxf = mode === 'house' ? pickedFiles.some((f) => fileKind(f.name) === 'cad') : !!file && fileKind(file.name) === 'cad' // DWG ถูกแปลงเป็น DXF ที่ server
  const ready = mode === 'house' ? pickedFiles.length > 0 : !!file
  const sourceLabel = mode === 'house' ? (pickedFiles.length ? pickedFiles.map((f) => f.name).join(', ') : 'ยังไม่ได้เลือกไฟล์') : file ? file.name : 'ยังไม่ได้เลือกไฟล์'
  const run = async () => {
    if (!ready) { setErr('กรุณาเลือกไฟล์แบบ'); return }
    setBusy(true); setErr(''); setRes(null)
    try {
      // รันเป็นงานเบื้องหลังที่ server (แบบหลายหน้าอาจใช้หลายนาที) แล้วถามผลทุก 3 วินาที
      const q = new URLSearchParams({ units, house: JSON.stringify(info), async: '1' })
      const started = mode === 'house'
        ? await api.post<{ job: string }>('/boq-takeoff?' + q.toString(), { file_ids: pickedFiles.map((f) => f.id) })
        : await api.uploadRaw<{ job: string }>('/boq-takeoff?' + new URLSearchParams({ name: file!.name, units, house: JSON.stringify(info), async: '1' }).toString(), file!)
      let r: Result | null = null
      setElapsed(0)
      while (!r) {
        await new Promise((ok) => setTimeout(ok, 3000))
        const j = await api.get<{ status: 'running'; seconds: number } | { status: 'done'; result: Result }>('/boq-takeoff/jobs/' + started.job)
        if (j.status === 'done') r = j.result
        else setElapsed(j.seconds)
      }
      setRes(r)
      setRows(r.items.map((it) => {
        const alts = it.mat_match && !it.mat_alts.some((a) => a.id === it.mat_match!.id) ? [it.mat_match, ...it.mat_alts] : it.mat_alts
        return {
          use: true, floor: it.floor || FLOOR_ALL, part: it.part || '', sheet: it.sheet || '', cat: it.cat, desc: it.desc, qty: it.qty, unit: it.unit, basis: it.basis, confidence: it.confidence, alts,
          matId: it.mat_match?.id || 0, mat: it.mat_match?.central || 0,
        }
      }))
      setOpen({ input: false, notes: true, mat: true, lab: true }); setClosedCats([]); setOnlyUnpriced(false)
      setLRows(r.labor.map((l) => ({ use: true, floor: l.floor || FLOOR_ALL, part: l.part || '', sheet: l.sheet || '', cat: l.cat, rateId: l.rate_id, qty: l.qty, unit: l.unit, price: l.price, basis: l.basis, confidence: l.confidence })))
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
  const addLabor = () => setLRows((rs) => [...rs, { use: true, floor: FLOOR_ALL, part: '', sheet: '', cat: 'สถาปัตยกรรม', rateId: 0, qty: 0, unit: '', price: 0, basis: '', confidence: 'กลาง' }])
  // วัสดุที่ยังไม่มีในราคากลาง → เพิ่มเข้าราคากลางด้วยชื่อ/หน่วย/ราคาที่กรอกในแถวนี้
  // วัสดุที่ไม่มีในราคากลางและยังไม่ได้กรอกราคา → ให้ AI ค้นราคาตลาดจากเว็บมาใส่ไว้ก่อน (แก้ได้ · ไม่บันทึกเข้าราคากลางเอง)
  const [webBusy, setWebBusy] = useState(false)
  const needWeb = rows.flatMap((r, i) => !r.matId && !(r.mat > 0) ? [i] : [])
  const fetchWebPrices = async () => {
    if (!needWeb.length) return
    if (!confirm(`ให้ AI ค้นราคาจากอินเทอร์เน็ต ${needWeb.length} รายการ?\n(ใช้ AI ค้นเว็บ มีค่าใช้จ่ายต่อครั้ง · อาจใช้เวลา 1–3 นาที)`)) return
    setWebBusy(true); setErr('')
    try {
      const r = await api.post<{ items: (WebPrice & { desc: string })[] }>('/boq-takeoff/web-prices', { items: needWeb.map((i) => ({ desc: rows[i].desc, unit: rows[i].unit })) })
      setRows((rs) => rs.map((row, i) => {
        const k = needWeb.indexOf(i)
        const w = k >= 0 ? r.items[k] : null
        if (!w) return row
        return { ...row, web: w, mat: w.price > 0 && !(row.mat > 0) ? w.price : row.mat }
      }))
      const got = r.items.filter((x) => x.price > 0).length
      if (got < r.items.length) setErr(`ได้ราคาจากเว็บ ${got} จาก ${r.items.length} รายการ — ที่เหลือหาไม่เจอหรือสเปกไม่ชัด กรอกเองได้`)
    } catch (e) { setErr((e as Error).message) }
    setWebBusy(false)
  }
  const addToMaster = async (i: number) => {
    const r = rows[i]
    if (!(r.mat > 0)) { alert('กรอกค่าวัสดุ/หน่วยก่อน แล้วค่อยเพิ่มเข้าราคากลาง'); return }
    if (!confirm(`เพิ่ม “${r.desc}” (${r.unit}) ราคา ${baht(r.mat)} เข้าราคากลางวัสดุ?`)) return
    try {
      const m = await api.post<MatOpt>('/material-prices', { name: r.desc, unit: r.unit, central: r.mat, note: r.web && r.web.price === r.mat ? `ราคาจากเว็บ (${r.web.shop || 'ร้านออนไลน์'}) ${r.web.url}`.trim() : 'เพิ่มจากหน้าถอดแบบ' })
      setRow(i, { alts: [m, ...r.alts], matId: m.id })
    } catch (e) { alert((e as Error).message) }
  }

  const used = rows.filter((r) => r.use)
  const usedL = lrows.filter((r) => r.use && r.rateId)
  const totMat = used.reduce((s, r) => s + r.qty * r.mat, 0)
  const totLab = usedL.reduce((s, r) => s + r.qty * r.price, 0)
  const unmatchedAll = rows.filter((r) => !r.matId).length
  const count = used.length + usedL.length
  const floorsHere = sortFloors(rows.map((r) => r.floor))
  const floorOpts = floorOptions([...rows.map((r) => r.floor), ...lrows.map((l) => l.floor)])
  const groups = (groupBy === 'floor'
    ? floorsHere.flatMap((f) => BOQ_CATS.flatMap((c) => [...new Set(rows.filter((r) => r.floor === f && r.cat === c).map((r) => r.part))].map((pt) => ({ cat: [f, c, pt].filter(Boolean).join(' · '), floor: f, c, part: pt, idx: rows.flatMap((r, i) => r.floor === f && r.cat === c && r.part === pt ? [i] : []) }))))
    : BOQ_CATS.map((cat) => ({ cat, floor: '', c: cat, part: '', idx: rows.flatMap((r, i) => r.cat === cat ? [i] : []) }))).filter((g) => g.idx.length)
  // ปริมาณงานที่ AI วัดได้ของกลุ่มนี้ (เฉพาะโหมดแยกชั้น)
  const workOf = (g: { floor: string; c: string; part: string }) => groupBy === 'floor' ? (res?.work || []).filter((w) => w.floor === g.floor && w.cat === g.c && (w.part || '') === g.part) : []

  // แถววัสดุ 1 แถว (แสดงใต้หัวหมวด)
  const matRow = (r: Row, i: number) => {
    const cc = confColor(r.confidence)
    const m = r.alts.find((a) => a.id === r.matId)
    return (
      <tr key={i} style={{ borderTop: '1px solid #F1F4F6', opacity: r.use ? 1 : 0.45, verticalAlign: 'top' }}>
        <td style={{ padding: '8px 8px' }}><input type="checkbox" checked={r.use} onChange={(e) => setRow(i, { use: e.target.checked })} /></td>
        <td style={{ padding: '5px 6px' }}><select style={{ ...cell, width: 104 }} value={r.floor} onChange={(e) => setRow(i, { floor: e.target.value })}>{floorOpts.map((f) => <option key={f}>{f}</option>)}</select>
          <input style={{ ...cell, width: 104, marginTop: 4, fontSize: 11, padding: '3px 6px' }} placeholder="ส่วนงาน" title="ส่วนงาน เช่น เสา คาน พื้น" value={r.part} onChange={(e) => setRow(i, { part: e.target.value })} /></td>
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
          {!r.matId && r.web && (r.web.price > 0
            ? <div style={{ fontSize: 11, color: '#1F5F8B', marginTop: 4, lineHeight: 1.4 }}>
                <span style={{ fontWeight: 600, background: '#E5F0F8', borderRadius: 5, padding: '1px 6px', marginRight: 5 }}>🌐 ราคาจากเว็บ</span>
                {r.web.url ? <a href={r.web.url} target="_blank" rel="noreferrer" style={{ color: '#1F5F8B' }}>{r.web.shop || 'ร้านออนไลน์'} ↗</a> : (r.web.shop || 'ร้านออนไลน์')}
                {r.web.sources > 1 && ` · ${r.web.sources} ร้าน`}{r.web.low > 0 && r.web.high > r.web.low && ` · ${baht(r.web.low)}–${baht(r.web.high)}`}
                {r.web.note && <div style={{ color: '#7A858D' }}>{r.web.note}</div>}
              </div>
            : <div style={{ fontSize: 11, color: '#94A0A8', marginTop: 4 }}>🌐 หาราคาจากเว็บไม่เจอ{r.web.note ? ` — ${r.web.note}` : ''}</div>)}
          {!r.matId && <button onClick={() => addToMaster(i)} className="hov-f3f5f7" style={{ marginTop: 4, fontFamily: 'inherit', fontSize: 11, color: '#30506A', background: '#fff', border: '1px dashed #B9C6D0', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>+ เพิ่มเข้าราคากลาง</button>}
        </td>
        <td style={{ padding: '5px 6px' }}><input type="number" style={{ ...cell, width: 86, textAlign: 'right' }} value={r.mat || ''} onChange={(e) => setRow(i, { mat: Number(e.target.value) })} /></td>
        <td className="num" style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{baht(r.qty * r.mat)}</td>
      </tr>
    )
  }

  const buildItems = () => {
    const items: BoqItem[] = used.map((r) => {
      const m = r.alts.find((a) => a.id === r.matId)
      return { floor: r.floor, part: r.part, sheet: r.sheet, spec: r.desc, cat: r.cat, desc: m ? m.name : r.desc, qty: r.qty, unit: r.unit, mat: r.mat, lab: 0, ref: m?.id, basis: !m && r.web && r.web.price === r.mat ? [r.basis, 'ราคาจากเว็บ: ' + (r.web.shop || 'ร้านออนไลน์')].filter(Boolean).join(' · ') : r.basis }
    })
    for (const l of usedL) {
      const rate = rates.find((x) => x.id === l.rateId)
      items.push({ floor: l.floor, part: l.part, sheet: l.sheet, cat: l.cat, desc: 'ค่าแรง: ' + (rate ? labLabel(rate) : ''), qty: l.qty, unit: l.unit, mat: 0, lab: l.price, basis: l.basis })
    }
    return items
  }
  const create = () => {
    const items = buildItems()
    if (!items.length) { alert('ไม่มีรายการที่เลือก'); return }
    onCreate({ house_code: house, title: 'ถอดแบบ: ' + (res?.drawing || sourceLabel), items, work: res?.work || [] })
  }

  return (<>
    <ModalShell title="ถอดแบบ → BOQ ร่าง" sub="อัปโหลดไฟล์แบบ (DWG / DXF / PDF / รูป) · ระบบถอดปริมาณและจับคู่ราคากลางให้ · ตรวจแก้ก่อนสร้าง BOQ" width={1240} closeOnBackdrop={false} onClose={onClose}
      bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 14, background: '#F7F9FB' }}
      footer={<>
        <button onClick={onClose} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ยกเลิก</button>
        <button onClick={create} disabled={!count} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: count ? '#30506A' : '#9AABB8', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: count ? 'pointer' : 'default' }}>สร้าง BOQ ร่าง ({count} รายการ)</button>
      </>}>

      {/* 1) ไฟล์แบบ + ข้อมูลบ้าน — ถอดเสร็จแล้วยุบเก็บให้เอง เพื่อให้ตารางผลมีที่มากขึ้น */}
      <Section title="ไฟล์แบบ + ข้อมูลบ้าน" meta={sourceLabel} open={open.input} onToggle={() => toggle('input')}>
        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.7fr 0.7fr 0.7fr 0.7fr', gap: 10, alignItems: 'end' }}>
          <div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              {([['upload', 'อัปโหลดไฟล์ใหม่'], ['house', `เอกสารของบ้าน${house ? ` (${usable.length})` : ''}`]] as const).map(([k, t]) => (
                <button key={k} onClick={() => { setMode(k); setErr('') }} style={{ ...chip, padding: '3px 10px', fontSize: 11.5, ...(mode === k ? { background: '#30506A', borderColor: '#30506A', color: '#fff' } : {}) }}>{t}</button>
              ))}
            </div>
            {mode === 'upload'
              ? <input type="file" accept=".dwg,.dxf,.pdf,image/png,image/jpeg,image/webp" onChange={(e) => { setFile(e.target.files?.[0] || null); setErr('') }} style={{ ...field, width: '100%', padding: '5px 7px' }} />
              : <div style={{ ...field, color: pickedFiles.length ? '#1C2730' : '#94A0A8', background: '#F7F9FB', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pickedFiles.length ? `เลือก ${pickedFiles.length} ไฟล์ · ${mb(pickedMB)}` : house ? 'ติ๊กเลือกไฟล์ด้านล่าง' : 'เลือกบ้านก่อน →'}</div>}
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
          {mode === 'house' && house && <HouseFilePicker files={usable} unusable={unusable} picked={picked} onToggle={togglePick} totalMB={pickedMB / 1048576} />}
          <div><div style={label}>พื้นที่ใช้สอย (ตร.ม.)</div><input type="number" style={{ ...field, width: '100%' }} value={info.area_m2} onChange={(e) => setInfo({ ...info, area_m2: e.target.value })} /></div>
          <div><div style={label}>จำนวนชั้น</div><input type="number" style={{ ...field, width: '100%' }} value={info.floors} onChange={(e) => setInfo({ ...info, floors: e.target.value })} /></div>
          <div><div style={label}>สูงฝ้า (ม.)</div><input type="number" style={{ ...field, width: '100%' }} value={info.ceiling_h} onChange={(e) => setInfo({ ...info, ceiling_h: e.target.value })} /></div>
          <div><div style={label}>ยกพื้น (ม.)</div><input type="number" style={{ ...field, width: '100%' }} value={info.raised_h} onChange={(e) => setInfo({ ...info, raised_h: e.target.value })} /></div>
          <div style={{ gridColumn: 'span 4' }}><div style={label}>สเปก / หมายเหตุ (ไม่บังคับ)</div><input style={{ ...field, width: '100%' }} placeholder="เช่น ท่อ PVC ชั้น 13.5 · สุขภัณฑ์ COTTO · ผนังอิฐมอญ" value={info.spec} onChange={(e) => setInfo({ ...info, spec: e.target.value })} /></div>
          <div>
            <div style={label}>หน่วยที่วาดในแบบ {isDxf ? '' : '(เฉพาะ DWG/DXF)'}</div>
            <select style={{ ...field, width: '100%' }} value={units} disabled={!isDxf} onChange={(e) => setUnits(e.target.value)}>
              <option value="auto">อ่านจากไฟล์</option><option value="mm">มิลลิเมตร</option><option value="cm">เซนติเมตร</option><option value="m">เมตร</option>
            </select>
          </div>
          <button onClick={run} disabled={busy || !ready} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: busy || !ready ? '#9AABB8' : '#C0852C', border: 'none', borderRadius: 9, padding: '9px 14px', cursor: busy || !ready ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
            {busy ? 'กำลังถอดแบบ…' : res ? 'ถอดใหม่' : 'ถอดแบบ'}
          </button>
        </div>
      </Section>
      {busy && <div style={{ fontSize: 12.5, color: '#5C6770' }}>{isDxf ? 'กำลังอ่านไฟล์แบบ (ไฟล์ DWG ต้องแปลงก่อน) แล้วให้ AI ตั้งชื่อรายการ' : 'AI กำลังอ่านแบบ'} · ผ่านไป {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} นาที (แบบหลายหน้าอาจใช้ 2–8 นาที · ย่อหน้าต่างนี้ไว้ทำอย่างอื่นได้)</div>}
      {err && <div style={{ fontSize: 13, color: '#B23B30', background: '#FBE7E5', borderRadius: 8, padding: '9px 12px' }}>{err}</div>}

      {/* 2) ผลถอด */}
      {res && <>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 12.5, color: '#5C6770' }}>
          <span style={{ fontWeight: 600, color: '#1C2730' }}>{res.drawing || ({ dxf: 'ไฟล์ DWG/DXF', pdf: 'ไฟล์ PDF', image: 'รูปภาพ', multi: `แบบ ${res.files?.length || ''} ไฟล์` })[res.source]}</span>
          <span>· {res.ai ? `AI ช่วยตั้งชื่อ${res.model ? ' (' + res.model + ')' : ''}` : 'ไม่ได้ใช้ AI'}</span>
          <button onClick={() => count ? setPrinting(true) : alert('ไม่มีรายการที่เลือก')} className="hov-f3f5f7" style={{ ...chip, marginLeft: 'auto', fontWeight: 600 }}>📄 สรุปวัสดุ (PDF)</button>
          {res.dxf && <button onClick={() => setShowRaw(!showRaw)} className="hov-f3f5f7" style={{ marginLeft: 8, fontFamily: 'inherit', fontSize: 12, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>{showRaw ? 'ซ่อน' : 'ดู'}ข้อมูลดิบจาก DXF</button>}
        </div>
        {res.notes.length > 0 && <Section title="ข้อสังเกตจาก AI" meta={`${res.notes.length} ข้อ`} open={open.notes} onToggle={() => toggle('notes')} tone="note">
          <div style={{ padding: '8px 14px 10px', fontSize: 12.5, color: '#7A5A12' }}>{res.notes.map((n, i) => <div key={i}>• {n}</div>)}</div>
        </Section>}
        {showRaw && res.dxf && <DxfRaw s={res.dxf} />}

        {/* วัสดุ — แยกตามหมวด กดหัวหมวดเพื่อเปิด/ปิด */}
        <Section title="วัสดุ" open={open.mat} onToggle={() => toggle('mat')}
          meta={<>{rows.length} รายการ · จับคู่ราคากลางได้ {rows.length - unmatchedAll}{unmatchedAll > 0 && <span style={{ color: '#B23B30' }}> · ยังไม่มีราคา {unmatchedAll}</span>} · <b className="num" style={{ color: '#1C2730' }}>{baht(totMat)}</b></>}
          actions={<>
            {needWeb.length > 0 && <button onClick={fetchWebPrices} disabled={webBusy} className="hov-f3f5f7" style={{ ...chip, color: '#1F5F8B', borderColor: '#B7D3E8', background: webBusy ? '#F1F6FA' : '#fff', cursor: webBusy ? 'default' : 'pointer' }}>{webBusy ? '🌐 กำลังค้นราคา…' : `🌐 หาราคาจากเว็บ (${needWeb.length})`}</button>}
            <button onClick={() => setOnlyUnpriced(!onlyUnpriced)} className="hov-f3f5f7" style={{ ...chip, ...(onlyUnpriced ? { background: '#FBE7E5', borderColor: '#F0C4BF', color: '#B23B30' } : {}) }}>เฉพาะยังไม่มีราคา</button>
            <button onClick={() => { setGroupBy(groupBy === 'floor' ? 'cat' : 'floor'); setClosedCats([]) }} className="hov-f3f5f7" style={chip}>{groupBy === 'floor' ? 'จัดกลุ่ม: แยกชั้น' : 'จัดกลุ่ม: ประเภทงาน'}</button>
            <button onClick={() => setClosedCats(closedCats.length ? [] : groups.map((g) => g.cat))} className="hov-f3f5f7" style={chip}>{closedCats.length ? 'ขยายทุกหมวด' : 'ยุบทุกหมวด'}</button>
          </>}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
                <th style={th}><input type="checkbox" checked={rows.length > 0 && rows.every((r) => r.use)} onChange={(e) => setRows(rows.map((r) => ({ ...r, use: e.target.checked })))} /></th>
                <th style={th}>ชั้น / ส่วนงาน</th><th style={th}>ประเภทงาน</th><th style={th}>รายการที่ถอดได้</th><th style={{ ...th, textAlign: 'right' }}>จำนวน</th><th style={th}>หน่วย</th>
                <th style={th}>ราคากลางวัสดุ</th><th style={{ ...th, textAlign: 'right' }}>วัสดุ/หน่วย</th><th style={{ ...th, textAlign: 'right' }}>รวม</th>
              </tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={9} style={{ padding: 30, textAlign: 'center', color: '#94A0A8' }}>ไม่พบรายการวัสดุในแบบนี้</td></tr>}
                {groups.map((g) => {
                  const closed = closedCats.includes(g.cat)
                  const shown = onlyUnpriced ? g.idx.filter((i) => !rows[i].matId) : g.idx
                  const sub = g.idx.reduce((s, i) => s + (rows[i].use ? rows[i].qty * rows[i].mat : 0), 0)
                  const miss = g.idx.filter((i) => !rows[i].matId).length
                  if (onlyUnpriced && !shown.length) return null
                  return [
                    <tr key={'g' + g.cat} onClick={() => setClosedCats(closed ? closedCats.filter((c) => c !== g.cat) : [...closedCats, g.cat])} style={{ background: '#F1F4F7', cursor: 'pointer', borderTop: '1px solid #E1E5EA' }}>
                      <td colSpan={8} style={{ padding: '7px 10px', fontSize: 12.5, fontWeight: 600, color: '#30506A' }}>
                        <span style={{ display: 'inline-block', width: 14, transform: closed ? 'none' : 'rotate(90deg)', transition: 'transform .15s', fontSize: 10 }}>▶</span>
                        {g.cat} <span style={{ fontWeight: 400, color: '#5C6770' }}>· {g.idx.length} รายการ{miss > 0 && <span style={{ color: '#B23B30' }}> · ยังไม่มีราคา {miss}</span>}</span>
                        {workOf(g).map((w, k) => <div key={k} style={{ fontWeight: 400, fontSize: 11.5, color: '#3A5A72', marginLeft: 14, marginTop: 2 }}>📏 {w.sheet && <b>{w.sheet} · </b>}{w.work.map((x) => `${x.desc} ${x.qty.toLocaleString()} ${x.unit}`).join(' · ')}</div>)}
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
                <th style={th}></th><th style={th}>ชั้น / ส่วนงาน</th><th style={th}>ประเภทงาน</th><th style={th}>หมวดค่าแรง</th><th style={{ ...th, textAlign: 'right' }}>ปริมาณงาน</th><th style={th}>หน่วย</th>
                <th style={{ ...th, textAlign: 'right' }}>ค่าแรง/หน่วย</th><th style={{ ...th, textAlign: 'right' }}>รวม</th><th style={th}></th>
              </tr></thead>
              <tbody>
                {lrows.length === 0 && <tr><td colSpan={9} style={{ padding: 20, textAlign: 'center', color: '#94A0A8', fontSize: 12.5 }}>ยังไม่มีค่าแรง — กด “+ เพิ่มค่าแรง” แล้วเลือกหมวดงาน</td></tr>}
                {lrows.map((l, i) => {
                  const cc = confColor(l.confidence)
                  const rate = rates.find((x) => x.id === l.rateId)
                  return (
                    <tr key={i} style={{ borderTop: '1px solid #F1F4F6', opacity: l.use ? 1 : 0.45, verticalAlign: 'top' }}>
                      <td style={{ padding: '8px 8px' }}><input type="checkbox" checked={l.use} onChange={(e) => setLRow(i, { use: e.target.checked })} /></td>
                      <td style={{ padding: '5px 6px' }}><select style={{ ...cell, width: 104 }} value={l.floor} onChange={(e) => setLRow(i, { floor: e.target.value })}>{floorOpts.map((f) => <option key={f}>{f}</option>)}</select>
                        <input style={{ ...cell, width: 104, marginTop: 4, fontSize: 11, padding: '3px 6px' }} placeholder="ส่วนงาน" value={l.part} onChange={(e) => setLRow(i, { part: e.target.value })} /></td>
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
    {printing && <MaterialSummaryPrint title={'สรุปวัสดุจากการถอดแบบ: ' + (res?.drawing || sourceLabel)} houseName={houses.find((h) => h.code === house)?.name || house} items={buildItems()} work={res?.work || []} onClose={() => setPrinting(false)} />}
  </>)
}

// รายการเอกสารของบ้านที่ถอดแบบได้ — ติ๊กเลือก (PDF/รูปหลายไฟล์ · DWG/DXF ทีละไฟล์)
function HouseFilePicker({ files, unusable, picked, onToggle, totalMB }: {
  files: HouseFile[]; unusable: number; picked: number[]; onToggle: (f: HouseFile) => void; totalMB: number
}) {
  const kindTag = (n: string) => ({ cad: ['DWG/DXF', '#30506A', '#E8EEF3'], pdf: ['PDF', '#B23B30', '#FBE7E5'], image: ['รูป', '#2E7D4F', '#E6F4EC'] } as Record<string, string[]>)[fileKind(n)] || ['', '', '']
  return (
    <div style={{ gridColumn: '1 / -1', border: '1px solid #E1E5EA', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ maxHeight: 230, overflowY: 'auto' }}>
        {files.length === 0 && <div style={{ padding: 16, textAlign: 'center', fontSize: 12.5, color: '#94A0A8' }}>บ้านนี้ยังไม่มีไฟล์แบบที่ถอดได้ (DWG / DXF / PDF / รูป) — อัปโหลดไฟล์ใหม่แทนได้</div>}
        {files.map((f) => {
          const [tag, c, bg] = kindTag(f.name)
          const on = picked.includes(f.id)
          return (
            <label key={f.id} className="hov-fafbfc" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderTop: '1px solid #F1F4F6', cursor: 'pointer', background: on ? '#F1F6FA' : undefined }}>
              <input type="checkbox" checked={on} onChange={() => onToggle(f)} />
              <span style={{ fontSize: 10.5, fontWeight: 600, color: c, background: bg, borderRadius: 5, padding: '1px 6px', minWidth: 44, textAlign: 'center' }}>{tag}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#1C2730', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <span style={{ fontSize: 11.5, color: '#7A858D', whiteSpace: 'nowrap' }}>{f.category || 'ไม่ระบุหมวด'}</span>
              <span style={{ fontSize: 11.5, color: '#7A858D', whiteSpace: 'nowrap', width: 70, textAlign: 'right' }}>{mb(f.size || 0)}</span>
              <span style={{ fontSize: 11.5, color: '#94A0A8', whiteSpace: 'nowrap', width: 78, textAlign: 'right' }}>{f.uploaded}</span>
            </label>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 10, padding: '6px 12px', background: '#FAFBFC', borderTop: '1px solid #EEF1F4', fontSize: 11.5, color: '#5C6770' }}>
        <span>PDF / รูป เลือกหลายไฟล์ได้ (AI อ่านพร้อมกัน) · DWG / DXF ถอดได้ทีละ 1 ไฟล์</span>
        {unusable > 0 && <span>· ไฟล์อื่นอีก {unusable} ไฟล์ถอดไม่ได้ (เช่น .skp .xlsx)</span>}
        {totalMB > MAX_AI_MB && <span style={{ marginLeft: 'auto', color: '#B23B30', fontWeight: 600 }}>รวม {totalMB.toFixed(1)} MB เกิน {MAX_AI_MB} MB — เลือกน้อยลง</span>}
      </div>
    </div>
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
