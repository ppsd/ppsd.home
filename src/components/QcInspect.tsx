import { Fragment, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { useApp, useLiveRefresh } from '../store'
import { QC_PHASES, qcCategoriesOfPhase, qcFormsOf, qcFormById, qcFormItems, qcFormCount, qcLabels, qcIsPass, qcIsFail, qcDeriveStatus, qcPhaseName, qcPhaseProgress } from '../qcTemplates'
import QcPrint from './QcPrint'

export interface QcItem { no: number; section?: string; text: string; result: string; fix: string; remark: string; images?: string[] }
export interface QcInspection {
  id: number; no: string; house_code: string; category: string; type: string; zone: string; inspector: string; date: string; status: string; items: QcItem[]; remark: string; images?: string[]; start_date?: string; end_date?: string
  // ชุดฟอร์ม PPSD — ใบเก่าไม่มีค่าเหล่านี้
  phase?: string; form_id?: string; kind?: string; extra?: Record<string, string>; worker?: string; std?: string; fix_date?: string; recheck_date?: string
}

const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '8px 11px', outline: 'none' }
const th: React.CSSProperties = { padding: '9px 14px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'left' }
const lbl: React.CSSProperties = { fontSize: 11.5, color: '#5C6770', marginBottom: 4 }

function statusColor(s: string) {
  if (s === 'ผ่าน') return { c: '#2E7D55', bg: '#E2F1EA' }
  if (s === 'ต้องแก้ไข') return { c: '#C24036', bg: '#FBEEEC' }
  return { c: '#B7791F', bg: '#F6ECD6' }
}

export default function QcInspect({ houseCode }: { houseCode?: string }) {
  const { data } = useApp()
  const houses = data.houses
  const [allRows, setRows] = useState<QcInspection[]>([])
  const rows = houseCode ? allRows.filter((r) => r.house_code === houseCode) : allRows
  const [adding, setAdding] = useState(false)
  const blankF = { house_code: houseCode || '', phase: '', category: '', form_id: '', zone: '', inspector: '', worker: '', start_date: '', end_date: '' }
  const [f, setF] = useState(blankF)
  const [imgs, setImgs] = useState<string[]>([])
  const [openId, setOpenId] = useState<number | null>(null)
  const [draft, setDraft] = useState<QcItem[]>([])
  const [head, setHead] = useState<{ extra: Record<string, string>; worker: string; std: string; fix_date: string; recheck_date: string; remark: string }>({ extra: {}, worker: '', std: '', fix_date: '', recheck_date: '', remark: '' })
  const [printing, setPrinting] = useState<QcInspection | null>(null)
  const [phaseFilter, setPhaseFilter] = useState('')
  const [err, setErr] = useState('')
  const today = new Date().toISOString().slice(0, 10)

  const load = () => api.get<QcInspection[]>('/qc').then(setRows).catch(() => setRows([]))
  useEffect(() => { load() }, [])
  useLiveRefresh(['qc'], load) // อัปเดตสดเมื่อคนอื่นบันทึกใบตรวจ

  const form = f.form_id ? qcFormById(f.form_id) : undefined
  const progress = useMemo(() => houseCode ? qcPhaseProgress(rows) : [], [rows, houseCode])
  const shown = phaseFilter ? rows.filter((r) => (r.phase || 'old') === phaseFilter) : rows

  const pickImg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []); e.target.value = ''
    for (const file of files) {
      if (imgs.length >= 3) { setErr('แนบได้สูงสุด 3 รูป'); break }
      if (!file.type.startsWith('image/')) continue
      const r = new FileReader(); r.onload = () => setImgs((cur) => cur.length >= 3 ? cur : [...cur, String(r.result)]); r.readAsDataURL(file)
    }
  }
  const pickForm = (id: string) => {
    const fm = qcFormById(id)
    setF({ ...f, form_id: id, zone: fm?.zones?.[f.phase] || f.zone })
  }
  const create = async () => {
    if (!f.phase || !form) { setErr('เลือกงวดงาน หมวด และฟอร์มตรวจ'); return }
    setErr('')
    const items = qcFormItems(form).map((it, i) => ({ no: i + 1, section: it.section, text: it.text, result: '', fix: '', remark: '' }))
    try {
      await api.post('/qc', { house_code: f.house_code, phase: f.phase, form_id: form.id, kind: form.kind, category: form.category, type: form.title, zone: f.zone, inspector: f.inspector, worker: f.worker, start_date: f.start_date, end_date: f.end_date, items, images: imgs })
      setF(blankF); setImgs([]); setAdding(false); load()
    } catch (e) { setErr((e as Error).message) }
  }
  const open = (r: QcInspection) => {
    setOpenId(r.id); setDraft(r.items.map((i) => ({ ...i })))
    setHead({ extra: { ...(r.extra || {}) }, worker: r.worker || '', std: r.std || '', fix_date: r.fix_date || '', recheck_date: r.recheck_date || '', remark: r.remark || '' })
  }
  const setItem = (i: number, patch: Partial<QcItem>) => setDraft((d) => d.map((x, j) => j === i ? { ...x, ...patch } : x))
  const setAll = (result: string) => setDraft((d) => d.map((x) => x.result ? x : { ...x, result }))
  const pickItemImg = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []); e.target.value = ''
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const r = new FileReader()
      r.onload = () => setDraft((d) => d.map((x, j) => { if (j !== i) return x; const cur = x.images || []; return cur.length >= 3 ? x : { ...x, images: [...cur, String(r.result)] } }))
      r.readAsDataURL(file)
    }
  }
  const saveDraft = async (r: QcInspection) => {
    const status = qcDeriveStatus(draft)
    // ติ๊กท้ายใบ: ถ้ายังไม่เลือกเอง ให้ตามผลรวม
    const std = head.std || (status === 'ผ่าน' ? 'ผ่านมาตรฐาน' : status === 'ต้องแก้ไข' ? 'ไม่ผ่านตามมาตรฐาน' : '')
    await api.put('/qc/' + r.id, { items: draft, status, ...head, std })
    setOpenId(null); load()
  }
  const remove = async (id: number) => { if (confirm('ลบใบตรวจนี้?')) { await api.del('/qc/' + id); load() } }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ความคืบหน้าต่องวด (เฉพาะหน้าบ้าน) — ใช้ประกอบตรวจรับงวด */}
      {houseCode && (
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>ความคืบหน้าการตรวจตามงวดงาน</div>
            <div style={{ fontSize: 11.5, color: '#94A0A8' }}>ผ่านแล้ว / ฟอร์มทั้งหมดของงวด · กดเพื่อกรองรายการ</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 6 }}>
            {progress.map((p) => {
              const full = p.total > 0 && p.passed === p.total
              const bg = full ? '#E2F1EA' : p.fixing ? '#FBEEEC' : p.started ? '#F6ECD6' : '#F7F9FB'
              const c = full ? '#2E7D55' : p.fixing ? '#C24036' : p.started ? '#B7791F' : '#94A0A8'
              const active = phaseFilter === p.id
              return (
                <button key={p.id} onClick={() => setPhaseFilter(active ? '' : p.id)} title={p.name} style={{ fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', background: bg, border: '1.5px solid ' + (active ? c : 'transparent'), borderRadius: 9, padding: '7px 9px', color: '#1C2730' }}>
                  <div style={{ fontSize: 10.5, color: '#5C6770' }}>งวด {p.id}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.25, minHeight: 28, overflow: 'hidden' }}>{p.name}</div>
                  <div className="num" style={{ fontSize: 13, fontWeight: 700, color: c, marginTop: 3 }}>{p.passed}/{p.total}{p.fixing ? <span style={{ fontSize: 10, marginLeft: 4 }}>✎{p.fixing}</span> : null}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: '#5C6770' }}>ใบตรวจงาน <b className="num" style={{ color: '#1C2730' }}>{shown.length}</b> ใบ</div>
        {!houseCode && (
          <select style={{ ...field, padding: '6px 10px', fontSize: 12.5 }} value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)}>
            <option value="">ทุกงวด</option>
            {QC_PHASES.map((p) => <option key={p.id} value={p.id}>งวด {p.id} · {p.name}</option>)}
            <option value="old">ใบตรวจชุดเก่า</option>
          </select>
        )}
        <button onClick={() => setAdding((v) => !v)} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>+ สร้างใบตรวจ QC</button>
      </div>

      {adding && (
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            <div>
              <div style={lbl}>บ้าน / โครงการ</div>
              {houseCode
                ? <div style={{ ...field, display: 'flex', alignItems: 'center', color: '#5C6770', background: '#F7F9FB' }}>{houses.find((h) => h.code === houseCode)?.name || houseCode}</div>
                : <select style={{ ...field, width: '100%' }} value={f.house_code} onChange={(e) => setF({ ...f, house_code: e.target.value })}>
                  <option value="">— เลือกบ้าน —</option>
                  {houses.map((h) => <option key={h.id} value={h.code}>{h.name}</option>)}
                </select>}
            </div>
            <div>
              <div style={lbl}>งวดงาน</div>
              <select style={{ ...field, width: '100%' }} value={f.phase} onChange={(e) => setF({ ...f, phase: e.target.value, category: '', form_id: '', zone: '' })}>
                <option value="">— เลือกงวด —</option>
                {QC_PHASES.map((p) => <option key={p.id} value={p.id}>งวด {p.id} · {p.name}</option>)}
              </select>
            </div>
            <div>
              <div style={lbl}>หมวดงาน</div>
              <select style={{ ...field, width: '100%' }} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value, form_id: '' })} disabled={!f.phase}>
                <option value="">— หมวด —</option>
                {qcCategoriesOfPhase(f.phase).map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={lbl}>ฟอร์มตรวจ</div>
              <select style={{ ...field, width: '100%' }} value={f.form_id} onChange={(e) => pickForm(e.target.value)} disabled={!f.category}>
                <option value="">— ฟอร์ม —</option>
                {qcFormsOf(f.phase, f.category).map((t) => <option key={t.id} value={t.id}>{t.title} ({qcFormCount(t)} ข้อ)</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 12 }}>
            <div><div style={lbl}>โซน / ชั้น</div><input style={{ ...field, width: '100%', boxSizing: 'border-box' }} placeholder="เช่น ชั้น 1 / ห้องน้ำ 2" value={f.zone} onChange={(e) => setF({ ...f, zone: e.target.value })} /></div>
            <div><div style={lbl}>ช่างหน้างาน</div><input style={{ ...field, width: '100%', boxSizing: 'border-box' }} placeholder="ชื่อช่างที่รับผิดชอบ" value={f.worker} onChange={(e) => setF({ ...f, worker: e.target.value })} /></div>
            <div><div style={lbl}>วันเริ่มตรวจ/เริ่มงาน</div><input style={{ ...field, width: '100%', boxSizing: 'border-box' }} type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></div>
            <div><div style={lbl}>วันกำหนดเสร็จ</div><input style={{ ...field, width: '100%', boxSizing: 'border-box' }} type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={lbl}>รูปหน้างาน (สูงสุด 3)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label className="hov-f3f5f7" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 500, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '8px 12px', cursor: imgs.length >= 3 ? 'not-allowed' : 'pointer' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                {imgs.length ? `เพิ่มรูป (${imgs.length}/3)` : 'แนบรูป'}
                <input type="file" accept="image/*" multiple onChange={pickImg} disabled={imgs.length >= 3} style={{ display: 'none' }} />
              </label>
              {imgs.map((im, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={im} alt={'รูป ' + (i + 1)} style={{ height: 40, borderRadius: 6, border: '1px solid #E1E5EA' }} />
                  <button onClick={() => setImgs((cur) => cur.filter((_, j) => j !== i))} title="ลบรูป" style={{ position: 'absolute', top: -7, right: -7, width: 18, height: 18, borderRadius: 9, border: 'none', background: '#C24036', color: '#fff', fontSize: 11, lineHeight: '18px', cursor: 'pointer', padding: 0 }}>✕</button>
                </div>
              ))}
            </div>
          </div>
          {form
            ? <div style={{ fontSize: 11.5, color: '#5C6770', marginTop: 10, background: '#F7F9FB', borderRadius: 8, padding: '8px 12px' }}>
              <b>{form.title}</b> · {qcFormCount(form)} ข้อ · ผลตรวจแบบ <b>{form.kind}</b>
              {form.sections.filter((s) => s.name).length > 0 && <> · หัวข้อย่อย: {form.sections.filter((s) => s.name).map((s) => s.name).join(' / ')}</>}
              {form.extra.length > 0 && <> · ช่องพิเศษ: {form.extra.length} ช่อง (กรอกตอนบันทึกผล)</>}
            </div>
            : <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 10 }}>เลือกงวด → หมวด → ฟอร์ม แล้วระบบดึงข้อตรวจตามฟอร์มต้นฉบับของบริษัทมาให้</div>}
          {err && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 8 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={() => setAdding(false)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ยกเลิก</button>
            <button onClick={create} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>สร้าง + ดึงเช็กลิสต์</button>
          </div>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F7F9FB' }}>
              <th style={{ ...th, paddingLeft: 18 }}>เลขที่</th><th style={th}>ฟอร์มตรวจ</th><th style={th}>บ้าน / โซน</th>
              <th style={{ ...th, textAlign: 'center' }}>ผล</th><th style={{ ...th, textAlign: 'center' }}>สถานะ</th><th style={{ ...th, paddingRight: 18, textAlign: 'center' }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีใบตรวจ — กด “สร้างใบตรวจ QC”</td></tr>}
            {shown.map((r) => {
              const sc = statusColor(r.status)
              const pass = r.items.filter((i) => qcIsPass(i.result)).length
              const fix = r.items.filter((i) => qcIsFail(i.result)).length
              const [okL, ngL] = qcLabels(r.kind)
              const fm = r.form_id ? qcFormById(r.form_id) : undefined
              const isOpen = openId === r.id
              return (
                <Fragment key={r.id}>
                  <tr className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                    <td className="num" style={{ padding: '10px 18px', fontWeight: 600, fontFamily: 'monospace' }}>{r.no}<div style={{ fontSize: 10.5, color: '#94A0A8', fontFamily: 'inherit' }}>{r.date}</div></td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 500 }}>{r.type}</div>
                      <div style={{ fontSize: 11, color: '#94A0A8' }}>{r.phase ? `งวด ${r.phase} · ${qcPhaseName(r.phase)} · ` : ''}{r.category}</div>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#5C6770' }}>{houses.find((h) => h.code === r.house_code)?.name || r.house_code || '—'}{r.zone ? ` · ${r.zone}` : ''}{r.worker ? <div style={{ fontSize: 11, color: '#94A0A8' }}>ช่าง: {r.worker}</div> : null}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 12 }}><span style={{ color: '#2E7D55' }}>✓{pass}</span> / <span style={{ color: '#C24036' }}>✎{fix}</span> / {r.items.length}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: sc.c, background: sc.bg, padding: '2px 10px', borderRadius: 20 }}>{r.status}</span>
                      {r.end_date && r.end_date < today && r.status !== 'ผ่าน' && <div style={{ fontSize: 10, fontWeight: 600, color: '#C24036', marginTop: 3 }}>เลยกำหนด {r.end_date}</div>}
                      {r.end_date && (r.end_date >= today || r.status === 'ผ่าน') && <div style={{ fontSize: 10, color: '#94A0A8', marginTop: 3 }}>เสร็จ {r.end_date}</div>}
                    </td>
                    <td style={{ padding: '10px 18px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button onClick={() => isOpen ? setOpenId(null) : open(r)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>{isOpen ? 'ปิด' : 'ตรวจ/แก้'}</button>
                      <button onClick={() => setPrinting(r)} className="hov-f3f5f7" style={{ marginLeft: 6, fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>🖨</button>
                      <button onClick={() => remove(r.id)} style={{ marginLeft: 6, border: 'none', background: 'none', color: '#C24036', cursor: 'pointer', fontSize: 13 }}>✕</button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} style={{ padding: '12px 18px', background: '#FAFBFC' }}>
                        {(r.start_date || r.end_date || (r.images && r.images.length > 0)) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                            {r.start_date && <span style={{ fontSize: 12, color: '#5C6770' }}>เริ่ม: <b>{r.start_date}</b></span>}
                            {r.end_date && <span style={{ fontSize: 12, color: '#5C6770' }}>กำหนดเสร็จ: <b>{r.end_date}</b></span>}
                            {(r.images || []).map((im, i) => <a key={i} href={im} target="_blank" rel="noreferrer"><img src={im} alt={'รูป ' + (i + 1)} style={{ height: 54, borderRadius: 6, border: '1px solid #E1E5EA' }} /></a>)}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 11.5, color: '#94A0A8' }}>ข้อที่ยังไม่ได้ตรวจทั้งหมด →</span>
                          <button onClick={() => setAll(okL)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#2E7D55', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}>{okL}ทั้งหมด</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {draft.map((it, i) => (
                            <Fragment key={i}>
                              {it.section && (i === 0 || draft[i - 1].section !== it.section) && (
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#30506A', background: '#EEF2F6', borderRadius: 6, padding: '4px 10px', marginTop: i ? 6 : 0 }}>({it.section})</div>
                              )}
                              <div style={{ borderBottom: '1px solid #F1F4F6', paddingBottom: 6 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr auto auto 1.2fr', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                                  <span style={{ color: '#94A0A8', textAlign: 'right' }}>{i + 1}</span>
                                  <span style={{ color: '#3C4750' }}>{it.text}</span>
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <button onClick={() => setItem(i, { result: it.result === okL ? '' : okL })} style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 6, padding: '3px 9px', border: '1px solid ' + (it.result === okL ? '#2E7D55' : '#D2DAE1'), background: it.result === okL ? '#2E7D55' : '#fff', color: it.result === okL ? '#fff' : '#5C6770' }}>{okL}</button>
                                    <button onClick={() => setItem(i, { result: it.result === ngL ? '' : ngL })} style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 6, padding: '3px 9px', border: '1px solid ' + (it.result === ngL ? '#C24036' : '#D2DAE1'), background: it.result === ngL ? '#C24036' : '#fff', color: it.result === ngL ? '#fff' : '#5C6770' }}>{ngL}</button>
                                  </div>
                                  <label title="แนบรูปข้อนี้ (สูงสุด 3)" className="hov-f3f5f7" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 6, padding: '3px 8px', cursor: (it.images || []).length >= 3 ? 'not-allowed' : 'pointer' }}>
                                    📷 {(it.images || []).length ? `${(it.images || []).length}/3` : 'รูป'}
                                    <input type="file" accept="image/*" multiple onChange={(e) => pickItemImg(i, e)} disabled={(it.images || []).length >= 3} style={{ display: 'none' }} />
                                  </label>
                                  <input placeholder={r.kind ? 'เหตุผล / สิ่งที่ต้องแก้ไข' : 'สิ่งที่ต้องแก้ไข / หมายเหตุ'} value={it.fix} onChange={(e) => setItem(i, { fix: e.target.value })} style={{ ...field, padding: '5px 8px', fontSize: 12 }} />
                                </div>
                                {(it.images || []).length > 0 && (
                                  <div style={{ display: 'flex', gap: 6, marginTop: 5, paddingLeft: 34 }}>
                                    {(it.images || []).map((im, j) => (
                                      <div key={j} style={{ position: 'relative' }}>
                                        <a href={im} target="_blank" rel="noreferrer"><img src={im} alt={'รูป ' + (j + 1)} style={{ height: 42, borderRadius: 5, border: '1px solid #E1E5EA' }} /></a>
                                        <button onClick={() => setItem(i, { images: (it.images || []).filter((_, k) => k !== j) })} title="ลบรูป" style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: 8, border: 'none', background: '#C24036', color: '#fff', fontSize: 10, lineHeight: '16px', cursor: 'pointer', padding: 0 }}>✕</button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </Fragment>
                          ))}
                        </div>

                        {/* ท้ายใบ: ช่องพิเศษของฟอร์ม · กำหนดแก้ไข · ช่างหน้างาน · ผ่านมาตรฐาน */}
                        <div style={{ marginTop: 12, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 10, padding: 12 }}>
                          {fm && fm.extra.length > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: fm.extra.length > 1 ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 10 }}>
                              {fm.extra.map((ex) => (
                                <div key={ex}><div style={lbl}>{ex}</div><input style={{ ...field, width: '100%', boxSizing: 'border-box', padding: '6px 9px', fontSize: 12.5 }} value={head.extra[ex] || ''} onChange={(e) => setHead({ ...head, extra: { ...head.extra, [ex]: e.target.value } })} /></div>
                              ))}
                            </div>
                          )}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                            <div><div style={lbl}>กำหนดการแก้ไขงาน (ถ้ามี)</div><input type="date" style={{ ...field, width: '100%', boxSizing: 'border-box', padding: '6px 9px', fontSize: 12.5 }} value={head.fix_date} onChange={(e) => setHead({ ...head, fix_date: e.target.value })} /></div>
                            <div><div style={lbl}>กำหนดการเข้าตรวจงานแก้ไข</div><input type="date" style={{ ...field, width: '100%', boxSizing: 'border-box', padding: '6px 9px', fontSize: 12.5 }} value={head.recheck_date} onChange={(e) => setHead({ ...head, recheck_date: e.target.value })} /></div>
                            <div><div style={lbl}>{r.kind === 'มี/ไม่มี' ? 'ผู้รับผิดชอบ' : 'ช่างหน้างาน'}</div><input style={{ ...field, width: '100%', boxSizing: 'border-box', padding: '6px 9px', fontSize: 12.5 }} value={head.worker} onChange={(e) => setHead({ ...head, worker: e.target.value })} /></div>
                            <div>
                              <div style={lbl}>สรุปท้ายใบ</div>
                              <div style={{ display: 'flex', gap: 4 }}>
                                {['ผ่านมาตรฐาน', 'ไม่ผ่านตามมาตรฐาน'].map((s) => {
                                  const on = head.std === s; const c = s === 'ผ่านมาตรฐาน' ? '#2E7D55' : '#C24036'
                                  return <button key={s} onClick={() => setHead({ ...head, std: on ? '' : s })} style={{ flex: 1, fontFamily: 'inherit', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', borderRadius: 6, padding: '5px 3px', lineHeight: 1.2, border: '1px solid ' + (on ? c : '#D2DAE1'), background: on ? c : '#fff', color: on ? '#fff' : '#5C6770' }}>{on ? '☑ ' : '☐ '}{s}</button>
                                })}
                              </div>
                            </div>
                          </div>
                          <div style={{ marginTop: 10 }}><div style={lbl}>หมายเหตุรวม</div><input style={{ ...field, width: '100%', boxSizing: 'border-box', padding: '6px 9px', fontSize: 12.5 }} value={head.remark} onChange={(e) => setHead({ ...head, remark: e.target.value })} /></div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10, alignItems: 'center' }}>
                          <span style={{ fontSize: 11.5, color: '#94A0A8', marginRight: 'auto' }}>สถานะเมื่อบันทึก: <b style={{ color: statusColor(qcDeriveStatus(draft)).c }}>{qcDeriveStatus(draft)}</b></span>
                          <button onClick={() => setOpenId(null)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>ยกเลิก</button>
                          <button onClick={() => saveDraft(r)} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '7px 16px', cursor: 'pointer' }}>บันทึกผลตรวจ</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {printing && <QcPrint qc={printing} houseName={houses.find((h) => h.code === printing.house_code)?.name || printing.house_code} onClose={() => setPrinting(null)} />}
    </div>
  )
}
