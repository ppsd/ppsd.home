import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../api'
import { useApp } from '../../store'
import ModalShell from '../shared/ModalShell'
import HousePlan, { saveSvgPng } from './HousePlan'
import { fmtBaht, fmtM, type Layout } from './houseGeom'
import HouseIdeas, { Credit, type Idea } from './HouseIdeas'
import { RoomProgram, FacingPicker, FEAT, presetProg, progItems, dirOf, type Prog } from './RoomProgram'

// ออกแบบบ้านเบื้องต้น (AI) — กรอกความต้องการลูกค้า (ชั้น/ห้องนอน/ห้องน้ำ/งบ/ที่ดิน/สไตล์ + รูปตัวอย่าง)
// → AI จัดผังห้อง → ระบบวาดแปลนแต่ละชั้น + ภาพ 3D หมุนดูได้ · สั่งแก้เป็นข้อความ · ย้อนฉบับก่อนได้ · บันทึกภาพส่งลูกค้า
// ทั้งหมดเป็น "แบบร่างเบื้องต้น" ไว้คุยกับลูกค้า ต้องให้สถาปนิก/วิศวกรเขียนแบบจริงต่อ
const House3D = lazy(() => import('./House3D'))

interface Req { floors: number; bedrooms: number; bathrooms: number; budget: number; price_per_sqm: number; land_w: number; land_d: number; parking: number; style: string; extras: string; notes: string; facing?: number | null; program?: { floor: number; name: string; count: number; pos: string }[] }
interface Stats { total: number; estimate: number; bedrooms: number; bathrooms: number; floors: number; warnings: number }
interface Analysis { floors: { level: number; indoor: number; outdoor: number; w: number; d: number }[]; bedrooms: number; bathrooms: number; indoor: number; outdoor: number; total: number; estimate: number; footprint: { w: number; d: number }; warnings: string[] }
interface Concept {
  id: number; at: string; by: string; by_id: number | null; title: string; customer: string; status: 'กำลังออกแบบ' | 'กำลังแก้' | 'เสร็จ' | 'ผิดพลาด'; error: string | null
  model: string | null; cost_usd: number | null; updated: string; updated_by: string; req: Req; stats: Stats | null
  layout?: Layout | null; analysis?: Analysis | null; versions?: { i: number; at: string; by: string; note: string }[]
}

const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13, color: '#1C2730', border: '1px solid #D2DAE1', borderRadius: 9, padding: '8px 10px', outline: 'none', background: '#fff' }
const lbl: React.CSSProperties = { fontSize: 12, color: '#5C6770', marginBottom: 4 }
const card: React.CSSProperties = { background: '#fff', border: '1px solid #E3E8EC', borderRadius: 12 }
const btn2: React.CSSProperties = { fontFamily: 'inherit', fontSize: 12.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }
const btn1: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }
const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const thTs = (ts?: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/.exec(ts || '')
  return m ? `${Number(m[3])} ${TH_MONTH[Number(m[2]) - 1]} ${Number(m[1]) + 543}${m[4] ? ` ${m[4]}:${m[5]}` : ''}` : ts || ''
}
const busy = (c?: Concept | null) => c?.status === 'กำลังออกแบบ' || c?.status === 'กำลังแก้'
const STYLES = ['โมเดิร์น', 'มินิมอล', 'คลาสสิก', 'นอร์ดิก', 'ไทยประยุกต์', 'ลอฟท์', 'ญี่ปุ่น']
const ROOFS: Record<string, string> = { gable: 'หลังคาจั่ว', hip: 'หลังคาปั้นหยา', flat: 'หลังคาแบน' }

export default function HouseConcept() {
  const app = useApp()
  const canEdit = !!app.user && app.user.role !== 'viewer'
  const [list, setList] = useState<Concept[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [openNew, setOpenNew] = useState(false)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'designs' | 'ideas'>('designs')
  const [picked, setPicked] = useState<Idea[]>([]) // ไอเดียที่กด "ชอบแบบนี้" (ส่งให้ AI ตอนออกแบบ)
  const [fromIdeas, setFromIdeas] = useState(false)
  const load = useCallback(() => api.get<Concept[]>('/house-concepts').then(setList).catch(() => {}), [])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? list.filter((c) => (c.title + ' ' + c.customer + ' ' + c.by).toLowerCase().includes(s)) : list
  }, [list, q])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {sel == null && (
        <div style={{ display: 'flex', gap: 6 }}>
          {([['designs', '🏠 แบบที่ออกแบบแล้ว'], ['ideas', `💡 ห้องรวมไอเดีย${picked.length ? ` (♥ ${picked.length})` : ''}`]] as const).map(([k, t]) => (
            <button key={k} onClick={() => setTab(k)} style={{ ...btn2, fontSize: 13, padding: '8px 14px', ...(tab === k ? { background: '#30506A', color: '#fff', borderColor: '#30506A' } : {}) }}>{t}</button>
          ))}
        </div>
      )}
      {/* ห้องรวมไอเดียซ่อนด้วย display (ไม่ unmount) — ผลค้นและหน้าต่างแก้ไขไม่หายตอนสลับแท็บ */}
      <div style={{ display: sel == null && tab === 'ideas' ? 'block' : 'none' }}>
        <HouseIdeas canEdit={canEdit} picked={picked} setPicked={setPicked} onDesign={() => { setFromIdeas(true); setOpenNew(true) }} />
      </div>
      {sel == null && tab === 'ideas' ? null : sel == null ? (
        <>
          <div style={{ ...card, padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <div style={{ flex: '1 1 320px' }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: '#1C2730' }}>ออกแบบบ้านเบื้องต้นตามความต้องการลูกค้า</div>
              <div style={{ fontSize: 12.5, color: '#5C6770', marginTop: 3 }}>กรอกจำนวนชั้น ห้องนอน ห้องน้ำ งบประมาณ (แนบรูปบ้านที่ลูกค้าชอบได้) → AI จัดผังห้อง แล้วระบบวาดแปลนกับภาพ 3D หมุนดูได้ · เป็นแบบร่างไว้คุยกับลูกค้า ไม่ใช่แบบก่อสร้าง</div>
            </div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อแบบ / ลูกค้า" style={{ ...field, width: 220 }} />
            {canEdit && <button style={btn1} onClick={() => { setFromIdeas(false); setOpenNew(true) }}>+ ออกแบบใหม่</button>}
          </div>
          {!shown.length && <div style={{ ...card, padding: 30, textAlign: 'center', color: '#94A0A8', fontSize: 13 }}>{list.length ? 'ไม่พบแบบที่ค้นหา' : 'ยังไม่มีแบบ — กด “+ ออกแบบใหม่” เพื่อเริ่ม'}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {shown.map((c) => (
              <button key={c.id} onClick={() => setSel(c.id)} style={{ ...card, padding: 14, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, fontWeight: 600, fontSize: 14, color: '#1C2730' }}>{c.title}</div>
                  <StatusChip c={c} />
                </div>
                {c.customer && <div style={{ fontSize: 12.5, color: '#30506A' }}>ลูกค้า: {c.customer}</div>}
                {c.stats && <div style={{ fontSize: 12.5, color: '#5C6770' }}>{c.stats.floors} ชั้น · {c.stats.bedrooms} ห้องนอน · {c.stats.bathrooms} ห้องน้ำ · {fmtM(c.stats.total)} ตร.ม.</div>}
                {c.stats && <div style={{ fontSize: 12.5, color: '#5C6770' }}>ราคาประมาณ <b style={{ color: '#1C2730' }}>{fmtBaht(c.stats.estimate)}</b> บาท{c.req.budget ? ` · งบ ${fmtBaht(c.req.budget)}` : ''}</div>}
                <div style={{ fontSize: 11.5, color: '#94A0A8' }}>{c.by} · {thTs(c.at)}{c.stats?.warnings ? ` · ⚠ ${c.stats.warnings} จุดควรตรวจ` : ''}</div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <Detail id={sel} canEdit={canEdit} onBack={() => { setSel(null); load() }} onChanged={load} />
      )}
      {openNew && <NewConcept ideas={fromIdeas ? picked : []} onRemoveIdea={(id) => setPicked((o) => o.filter((x) => x.id !== id))} onClose={() => setOpenNew(false)}
        onCreated={(id) => { setOpenNew(false); if (fromIdeas) setPicked([]); load(); setTab('designs'); setSel(id) }} />}
    </div>
  )
}

function StatusChip({ c }: { c: Concept }) {
  const map: Record<string, [string, string]> = { 'กำลังออกแบบ': ['#C0852C', '#F8EEDC'], 'กำลังแก้': ['#C0852C', '#F8EEDC'], 'เสร็จ': ['#2E7D4F', '#E3F2E8'], 'ผิดพลาด': ['#C24036', '#FBEEEC'] }
  const [fg, bg] = map[c.status] || ['#5C6770', '#EEE']
  return <span style={{ fontSize: 11.5, fontWeight: 600, color: fg, background: bg, borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap' }}>{busy(c) ? '⏳ ' : ''}{c.status}</span>
}

// ---- ฟอร์มกรอกความต้องการ (modal) ----
async function shrinkImage(f: File): Promise<string> {
  const url = URL.createObjectURL(f)
  try {
    const img = new Image(); img.src = url
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej })
    const k = Math.min(1, 1280 / Math.max(img.width, img.height))
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.85)
  } finally { URL.revokeObjectURL(url) }
}
const numIn = (s: string) => Number(String(s).replace(/[^\d.]/g, '')) || 0
const money = (s: string) => { const n = numIn(s); return n ? fmtBaht(n) : '' }

function NewConcept({ ideas, onRemoveIdea, onClose, onCreated }: { ideas: Idea[]; onRemoveIdea: (id: number) => void; onClose: () => void; onCreated: (id: number) => void }) {
  const [f, setF] = useState({ title: '', customer: '', floors: 2, bedrooms: '3', bathrooms: '2', parking: '1', budget: '', price: '20,000', land_w: '', land_d: '', style: ideas.find((x) => x.style)?.style || '', extras: '', notes: '' })
  const ideaImgs = ideas.filter((x) => x.image_url).length
  const maxUpload = Math.max(0, 3 - ideaImgs)
  const [imgs, setImgs] = useState<string[]>([])
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [prog, setProg] = useState<Prog>(() => presetProg(2)) // ห้องแยกรายชั้น
  const [touched, setTouched] = useState(false)
  const [deg, setDeg] = useState('') // ทิศหน้าบ้าน (องศา) · ว่าง = ไม่ทราบ
  const [ticks, setTicks] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (k: keyof typeof f, v: string | number) => setF((o) => ({ ...o, [k]: v }))
  const setFloors = (n: number) => {
    set('floors', n)
    // ยังไม่ได้แก้รายการห้อง หรือชั้นใหม่ยังว่าง → ใส่ค่าเริ่มต้นของจำนวนชั้นนั้น
    const fls = n ? Array.from({ length: n }, (_, i) => i + 1) : [0]
    if (!touched || !Object.entries(prog).some(([k, v]) => v.n > 0 && fls.includes(Number(k.split('|')[0])))) setProg(presetProg(n))
  }
  const tot = progItems(prog, f.floors)
  const area = numIn(f.budget) && numIn(f.price) ? Math.round(numIn(f.budget) / numIn(f.price)) : 0
  const addImgs = async (files: FileList | null) => {
    if (!files) return
    const out: string[] = []
    for (const file of Array.from(files).slice(0, maxUpload - imgs.length)) { if (file.type.startsWith('image/')) { try { out.push(await shrinkImage(file)) } catch { /* ข้ามไฟล์เสีย */ } } }
    setImgs((o) => [...o, ...out].slice(0, maxUpload))
  }
  const submit = async () => {
    setErr('')
    if (!tot.beds && !tot.baths) return setErr('ใส่ห้องนอนหรือห้องน้ำอย่างน้อย 1 ห้อง')
    setSaving(true)
    try {
      const r = await api.post<Concept>('/house-concepts', {
        title: f.title, customer: f.customer, floors: f.floors, bedrooms: tot.beds, bathrooms: tot.baths, parking: tot.cars, program: tot.items, facing: deg === '' ? null : Number(deg),
        budget: numIn(f.budget), price_per_sqm: numIn(f.price), land_w: numIn(f.land_w), land_d: numIn(f.land_d), style: f.style, extras: [...ticks, f.extras.trim()].filter(Boolean).join(', '), notes: f.notes, images: imgs.slice(0, maxUpload), idea_ids: ideas.map((x) => x.id),
      })
      onCreated(r.id)
    } catch (e) { setErr((e as Error).message); setSaving(false) }
  }
  const row: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }
  return (
    <ModalShell title="ออกแบบบ้านใหม่" sub="กรอกความต้องการของลูกค้า แล้ว AI จะจัดผังห้องให้ (ใช้เวลาประมาณ 3–7 นาที · AI ตรวจและแก้ผังเองอีกรอบ)" onClose={onClose} width={640} closeOnBackdrop={false}
      footer={<><button style={btn2} onClick={onClose}>ยกเลิก</button><button style={{ ...btn1, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={submit}>{saving ? 'กำลังส่ง…' : '✨ ให้ AI ออกแบบ'}</button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ideas.length > 0 && (
          <div style={{ background: '#FBF4F3', border: '1px solid #F1D9D6', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1C2730', marginBottom: 6 }}>♥ แบบที่ลูกค้าชอบจากห้องรวมไอเดีย — AI จะดูเป็นแนวทาง ไม่ลอกแบบ</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {ideas.map((x) => (
                <div key={x.id} style={{ width: 150, position: 'relative' }}>
                  {x.thumb_url ? <img src={x.thumb_url} alt="" referrerPolicy="no-referrer" style={{ width: 150, height: 96, objectFit: x.kind === 'plan' ? 'contain' : 'cover', background: '#fff', borderRadius: 8, border: '1px solid #E3E8EC' }} /> : <div style={{ width: 150, height: 96, borderRadius: 8, background: '#EEF3F7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🔗</div>}
                  <button onClick={() => onRemoveIdea(x.id)} title="เอาออก" style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: 'none', background: '#C24036', color: '#fff', cursor: 'pointer', fontSize: 11 }}>✕</button>
                  <div style={{ fontSize: 11.5, color: '#1C2730', marginTop: 3, lineHeight: 1.3 }}>{x.title}</div>
                  <Credit x={x} />
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={row}>
          <div><div style={lbl}>ชื่อลูกค้า</div><input style={field} value={f.customer} onChange={(e) => set('customer', e.target.value)} placeholder="เช่น คุณสมชาย" /></div>
          <div><div style={lbl}>ชื่อแบบ (ไม่ใส่ก็ได้)</div><input style={field} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="ระบบตั้งให้อัตโนมัติ" /></div>
        </div>
        <div>
          <div style={lbl}>จำนวนชั้น</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2, 3].map((n) => <button key={n} onClick={() => setFloors(n)} style={{ ...btn2, ...(f.floors === n ? { background: '#30506A', color: '#fff', borderColor: '#30506A' } : {}) }}>{n} ชั้น</button>)}
            <button onClick={() => setFloors(0)} style={{ ...btn2, ...(f.floors === 0 ? { background: '#30506A', color: '#fff', borderColor: '#30506A' } : {}) }}>ยังไม่แน่ใจ (ให้ AI เลือก)</button>
          </div>
        </div>
        <div>
          <div style={lbl}>ห้องที่ต้องการในแต่ละชั้น — กดแท็บชั้น ใส่จำนวน แล้วเลือกตำแหน่งได้</div>
          <RoomProgram floors={f.floors} prog={prog} setProg={(p) => { setProg(p); setTouched(true) }} />
        </div>
        <div>
          <div style={lbl}>หน้าบ้าน (ด้านติดถนน) หันไปทางทิศไหน — AI ใช้วางห้องให้หลบแดดบ่ายและรับลม · ไม่ทราบเว้นไว้ได้</div>
          <FacingPicker deg={deg} setDeg={setDeg} />
        </div>
        <div style={row}>
          <div><div style={lbl}>งบประมาณ (บาท)</div><input style={field} inputMode="numeric" value={f.budget} onChange={(e) => set('budget', money(e.target.value))} placeholder="เช่น 4,000,000" /></div>
          <div><div style={lbl}>ราคาประมาณต่อ ตร.ม. (บาท)</div><input style={field} inputMode="numeric" value={f.price} onChange={(e) => set('price', money(e.target.value))} /></div>
        </div>
        {area > 0 && <div style={{ fontSize: 12.5, color: '#30506A', background: '#EEF3F7', borderRadius: 8, padding: '7px 10px' }}>งบนี้สร้างได้ประมาณ <b>{fmtBaht(area)} ตร.ม.</b> (รวมระเบียงและที่จอดรถ) — ปรับราคาต่อ ตร.ม. ตามสเปคที่ลูกค้าเลือก</div>}
        <div style={row}>
          <div><div style={lbl}>ที่ดินหน้ากว้าง (เมตร)</div><input style={field} inputMode="decimal" value={f.land_w} onChange={(e) => set('land_w', e.target.value)} placeholder="ไม่ทราบ เว้นว่าง" /></div>
          <div><div style={lbl}>ที่ดินลึก (เมตร)</div><input style={field} inputMode="decimal" value={f.land_d} onChange={(e) => set('land_d', e.target.value)} placeholder="ไม่ทราบ เว้นว่าง" /></div>
        </div>
        <div>
          <div style={lbl}>สไตล์ที่ชอบ</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            {STYLES.map((s) => <button key={s} onClick={() => set('style', f.style === s ? '' : s)} style={{ ...btn2, padding: '5px 10px', ...(f.style === s ? { background: '#30506A', color: '#fff', borderColor: '#30506A' } : {}) }}>{s}</button>)}
          </div>
          <input style={field} value={f.style} onChange={(e) => set('style', e.target.value)} placeholder="หรือพิมพ์เอง เช่น โมเดิร์นหลังคาจั่ว โทนขาวไม้" />
        </div>
        <div>
          <div style={lbl}>ติ๊กสิ่งที่ลูกค้าอยากได้เพิ่ม</div>
          {FEAT.map(([g, list]) => (
            <div key={g} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 11.5, color: '#8A949C', marginBottom: 3 }}>{g}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {list.map((t) => { const on = ticks.includes(t); return <button key={t} onClick={() => setTicks((o) => on ? o.filter((x) => x !== t) : [...o, t])} style={{ ...btn2, padding: '4px 10px', borderRadius: 999, ...(on ? { background: '#EEF3F7', borderColor: '#30506A', fontWeight: 600 } : {}) }}>{on ? '✓ ' : ''}{t}</button> })}
              </div>
            </div>
          ))}
          <input style={field} value={f.extras} onChange={(e) => set('extras', e.target.value)} placeholder="อื่น ๆ พิมพ์เพิ่มได้ เช่น ห้องเก็บไวน์, ที่จอดมอเตอร์ไซค์" />
        </div>
        <div><div style={lbl}>ความต้องการอื่นๆ</div><textarea style={{ ...field, minHeight: 60, resize: 'vertical' }} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="เช่น อยากได้ห้องนั่งเล่นโปร่ง เพดานสูง หน้าบ้านหันทิศเหนือ" /></div>
        <div>
          <div style={lbl}>รูปบ้านตัวอย่างที่ลูกค้าชอบ (รวมรูปจากห้องรวมไอเดียไม่เกิน 3 รูป · ใช้ให้ AI ดูสไตล์ ระบบไม่เก็บรูป){maxUpload === 0 ? ' — ครบ 3 รูปแล้ว' : ''}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {imgs.map((s, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={s} alt="" style={{ width: 92, height: 68, objectFit: 'cover', borderRadius: 8, border: '1px solid #E3E8EC' }} />
                <button onClick={() => setImgs((o) => o.filter((_x, k) => k !== i))} title="เอาออก" style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: 'none', background: '#C24036', color: '#fff', cursor: 'pointer', fontSize: 11 }}>✕</button>
              </div>
            ))}
            {imgs.length < maxUpload && <button style={btn2} onClick={() => fileRef.current?.click()}>+ แนบรูป</button>}
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addImgs(e.target.files); e.target.value = '' }} />
          </div>
        </div>
        {err && <div style={{ color: '#C24036', fontSize: 13 }}>{err}</div>}
      </div>
    </ModalShell>
  )
}

// ---- หน้ารายละเอียดแบบ: สรุป · แปลน · 3D · สั่งแก้ · ฉบับก่อนหน้า ----
function Detail({ id, canEdit, onBack, onChanged }: { id: number; canEdit: boolean; onBack: () => void; onChanged: () => void }) {
  const [c, setC] = useState<Concept | null>(null)
  const [err, setErr] = useState('')
  const [level, setLevel] = useState(1)
  const [ins, setIns] = useState('')
  const [sending, setSending] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const load = useCallback(() => api.get<Concept>('/house-concepts/' + id).then((x) => { setC(x); setErr('') }).catch((e) => setErr((e as Error).message)), [id])
  useEffect(() => { load() }, [load])
  // ระหว่าง AI ทำงาน ถามผลทุก 3 วินาที
  useEffect(() => {
    if (!busy(c)) return
    const t = setTimeout(() => { load().then(onChanged) }, 3000)
    return () => clearTimeout(t)
  }, [c, load, onChanged])

  const revise = async () => {
    if (!ins.trim()) return
    setSending(true)
    try { setC(await api.post<Concept>(`/house-concepts/${id}/revise`, { instruction: ins.trim() })); setIns('') } catch (e) { alert((e as Error).message) }
    setSending(false)
  }
  const restore = async (i: number) => {
    if (!confirm('ย้อนกลับไปใช้ฉบับนี้? (ฉบับปัจจุบันจะถูกเก็บไว้ในรายการฉบับก่อนหน้า)')) return
    try { setC(await api.post<Concept>(`/house-concepts/${id}/restore`, { index: i })); onChanged() } catch (e) { alert((e as Error).message) }
  }
  const rename = async () => {
    if (!c) return
    const title = prompt('ชื่อแบบ', c.title); if (title == null) return
    const customer = prompt('ชื่อลูกค้า', c.customer || ''); if (customer == null) return
    try { setC(await api.put<Concept>('/house-concepts/' + id, { title, customer })); onChanged() } catch (e) { alert((e as Error).message) }
  }
  const remove = async () => {
    if (!c || !confirm(`ลบแบบ "${c.title}"? (ดูย้อนหลังได้ในประวัติการเปลี่ยนแปลง)`)) return
    try { await api.del('/house-concepts/' + id); onBack() } catch (e) { alert((e as Error).message) }
  }

  if (err) return <div style={{ ...card, padding: 20 }}><button style={btn2} onClick={onBack}>← กลับ</button><div style={{ color: '#C24036', marginTop: 10 }}>{err}</div></div>
  if (!c) return <div style={{ ...card, padding: 20, color: '#94A0A8' }}>กำลังโหลด…</div>
  const L = c.layout, A = c.analysis
  const lv = L?.floors.some((f) => f.level === level) ? level : 1
  const land = c.req.land_w && c.req.land_d ? { w: c.req.land_w, d: c.req.land_d } : undefined
  const over = A && c.req.budget ? A.estimate - c.req.budget : 0
  const chip = (label: string, value: string, warn = false) => (
    <div style={{ background: warn ? '#FBEEEC' : '#F3F5F7', borderRadius: 10, padding: '8px 12px', minWidth: 110 }}>
      <div style={{ fontSize: 11.5, color: '#5C6770' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: warn ? '#C24036' : '#1C2730' }}>{value}</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...card, padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <button style={btn2} onClick={onBack}>← รายการแบบ</button>
        <div style={{ flex: '1 1 240px' }}>
          <div style={{ fontWeight: 600, fontSize: 15.5, color: '#1C2730' }}>{c.title} <StatusChip c={c} /></div>
          <div style={{ fontSize: 12, color: '#5C6770', marginTop: 2 }}>{c.customer ? `ลูกค้า: ${c.customer} · ` : ''}สร้างโดย {c.by} {thTs(c.at)}{c.updated_by && c.updated !== c.at ? ` · แก้ล่าสุด ${c.updated_by} ${thTs(c.updated)}` : ''}</div>
        </div>
        {canEdit && <button style={btn2} onClick={rename}>✎ แก้ชื่อ</button>}
        {canEdit && <button style={{ ...btn2, color: '#C24036' }} onClick={remove}>ลบ</button>}
      </div>

      <div style={{ ...card, padding: '10px 14px', fontSize: 12.5, color: '#5C6770', lineHeight: 1.7 }}>
        <b style={{ color: '#1C2730' }}>ความต้องการ:</b> {c.req.floors ? `${c.req.floors} ชั้น` : 'ให้ AI เลือกจำนวนชั้น'} · {c.req.bedrooms} ห้องนอน · {c.req.bathrooms} ห้องน้ำ
        {c.req.parking ? ` · จอดรถ ${c.req.parking} คัน` : ''}{c.req.budget ? ` · งบ ${fmtBaht(c.req.budget)} บาท` : ''} · {fmtBaht(c.req.price_per_sqm)} บาท/ตร.ม.
        {land ? ` · ที่ดิน ${fmtM(land.w)}×${fmtM(land.d)} ม.` : ''}{c.req.facing != null ? ` · หน้าบ้านหันทิศ${dirOf(c.req.facing)} (${c.req.facing}°)` : ''}{c.req.style ? ` · สไตล์ ${c.req.style}` : ''}{c.req.extras ? ` · ${c.req.extras}` : ''}{c.req.notes ? ` · ${c.req.notes}` : ''}
        {c.req.program?.length ? <div style={{ marginTop: 4 }}>{[...new Set(c.req.program.map((x) => x.floor))].sort((a, b) => (a || 9) - (b || 9)).map((lv) => <div key={lv}><b style={{ color: '#1C2730', fontWeight: 600 }}>{lv ? `ชั้น ${lv}` : 'ชั้นไหนก็ได้'}:</b> {c.req.program!.filter((x) => x.floor === lv).map((x) => `${x.name} ${x.count}${x.pos ? ` (${x.pos})` : ''}`).join(' · ')}</div>)}</div> : null}
      </div>

      {busy(c) && <div style={{ ...card, padding: 16, background: '#FFF8EC', borderColor: '#F1DDB5', color: '#8A5A12', fontSize: 13.5 }}>⏳ {c.status === 'กำลังแก้' ? 'AI กำลังแก้แบบตามคำสั่ง' : 'AI กำลังจัดผังห้อง'} — ใช้เวลาประมาณ 1–3 นาที ออกจากหน้านี้ได้ ระบบทำต่อเอง</div>}
      {c.status === 'ผิดพลาด' && <div style={{ ...card, padding: 14, background: '#FBEEEC', borderColor: '#F0C9C4', color: '#C24036', fontSize: 13 }}>ออกแบบไม่สำเร็จ: {c.error} — ลองกด “+ ออกแบบใหม่” อีกครั้ง</div>}
      {c.status === 'เสร็จ' && c.error && <div style={{ ...card, padding: 12, background: '#FBEEEC', borderColor: '#F0C9C4', color: '#C24036', fontSize: 13 }}>{c.error} (แบบเดิมยังอยู่)</div>}

      {L && A && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {chip('พื้นที่ภายใน', `${fmtM(A.indoor)} ตร.ม.`)}
            {chip('พื้นที่รวม (รวมระเบียง/จอดรถ)', `${fmtM(A.total)} ตร.ม.`)}
            {chip('ห้องนอน / ห้องน้ำ', `${A.bedrooms} / ${A.bathrooms}`, (!!c.req.bedrooms && A.bedrooms !== c.req.bedrooms) || (!!c.req.bathrooms && A.bathrooms !== c.req.bathrooms))}
            {chip('ขนาดตัวบ้าน', `${fmtM(A.footprint.w)} × ${fmtM(A.footprint.d)} ม.`)}
            {chip('ราคาประมาณ', `${fmtBaht(A.estimate)} บาท`, over > c.req.budget * 0.1 && !!c.req.budget)}
            {!!c.req.budget && chip(over > 0 ? 'เกินงบ' : 'ต่ำกว่างบ', `${fmtBaht(Math.abs(over))} บาท`, over > c.req.budget * 0.1)}
          </div>
          {(L.summary || L.style) && (
            <div style={{ ...card, padding: '12px 16px', fontSize: 13, color: '#26313A', lineHeight: 1.7 }}>
              <b>แนวคิดแบบ{L.style ? ` (${L.style} · ${ROOFS[L.roof] || ''})` : ''}:</b> {L.summary}
              {!!L.notes.length && <ul style={{ margin: '6px 0 0', paddingLeft: 20, color: '#5C6770' }}>{L.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
            </div>
          )}
          {!!A.warnings.length && (
            <div style={{ ...card, padding: '10px 16px', background: '#FFF8EC', borderColor: '#F1DDB5', fontSize: 12.5, color: '#8A5A12' }}>
              <b>⚠ จุดที่ควรตรวจ / สั่งแก้ ({A.warnings.length})</b>
              <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>{A.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: 12 }}>
            <div style={{ ...card, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <b style={{ fontSize: 14, color: '#1C2730', marginRight: 6 }}>แปลน</b>
                {L.floors.map((f) => <button key={f.level} onClick={() => setLevel(f.level)} style={{ ...btn2, padding: '5px 11px', ...(lv === f.level ? { background: '#30506A', color: '#fff', borderColor: '#30506A' } : {}) }}>ชั้น {f.level}</button>)}
                <span style={{ flex: 1 }} />
                <button style={btn2} onClick={() => svgRef.current && saveSvgPng(svgRef.current, `${c.title}-แปลนชั้น${lv}.png`).catch(() => alert('บันทึกรูปไม่สำเร็จ'))}>⬇ บันทึกแปลน</button>
              </div>
              <div style={{ overflow: 'auto', border: '1px solid #EEF1F4', borderRadius: 8 }}>
                <HousePlan ref={svgRef} layout={L} level={lv} title={c.title} subtitle={c.customer ? `ลูกค้า ${c.customer}` : ''} />
              </div>
            </div>
            <div style={{ ...card, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <b style={{ fontSize: 14, color: '#1C2730' }}>ภาพ 3D</b>
              <Suspense fallback={<div style={{ color: '#94A0A8', fontSize: 13, padding: 20 }}>กำลังโหลดตัวแสดงภาพ 3D…</div>}>
                <House3D layout={L} title={c.title} land={land} />
              </Suspense>
            </div>
          </div>
          {canEdit && (
            <div style={{ ...card, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <b style={{ fontSize: 14, color: '#1C2730' }}>สั่ง AI แก้แบบ</b>
              <textarea value={ins} onChange={(e) => setIns(e.target.value)} disabled={busy(c)} style={{ ...field, minHeight: 56, resize: 'vertical' }}
                placeholder="เช่น ขยายห้องนั่งเล่นให้กว้างขึ้น 1 เมตร · ย้ายครัวไปด้านหลัง · เพิ่มห้องน้ำชั้นล่าง · ลดพื้นที่ให้อยู่ในงบ" />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button style={{ ...btn1, opacity: sending || busy(c) || !ins.trim() ? 0.6 : 1 }} disabled={sending || busy(c) || !ins.trim()} onClick={revise}>✨ ให้ AI แก้</button>
                {!!A.warnings.length && <button style={btn2} disabled={busy(c)} onClick={() => setIns('แก้จุดที่ระบบเตือนทั้งหมด: ' + A.warnings.join(' · '))}>ใช้คำเตือนเป็นคำสั่งแก้</button>}
              </div>
            </div>
          )}
          {!!c.versions?.length && (
            <div style={{ ...card, padding: '12px 16px' }}>
              <b style={{ fontSize: 14, color: '#1C2730' }}>ฉบับก่อนหน้า</b>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {c.versions.map((v) => (
                  <div key={v.i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: '#5C6770', flexWrap: 'wrap' }}>
                    <span style={{ flex: 1, minWidth: 200 }}>{thTs(v.at)} · {v.by} · {v.note}</span>
                    {canEdit && <button style={{ ...btn2, padding: '4px 10px' }} disabled={busy(c)} onClick={() => restore(v.i)}>ย้อนกลับไปฉบับนี้</button>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ fontSize: 11.5, color: '#94A0A8' }}>แบบนี้เป็นแบบร่างเบื้องต้นจาก AI ไว้คุยความต้องการและประเมินราคากับลูกค้า ขนาดเป็นค่าประมาณ · ก่อนก่อสร้าง/ขออนุญาต ต้องให้สถาปนิกและวิศวกรออกแบบและรับรองแบบจริง{c.cost_usd ? ` · ค่า AI แบบนี้ประมาณ ${(c.cost_usd * 36).toFixed(1)} บาท` : ''}</div>
        </>
      )}
    </div>
  )
}
