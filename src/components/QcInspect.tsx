import { Fragment, useEffect, useState } from 'react'
import { api } from '../api'
import { useApp } from '../store'
import { QC_CATEGORIES, qcTypesOf, qcItemsOf } from '../qcTemplates'
import QcPrint from './QcPrint'

export interface QcItem { no: number; text: string; result: string; fix: string; remark: string; images?: string[] }
export interface QcInspection { id: number; no: string; house_code: string; category: string; type: string; zone: string; inspector: string; date: string; status: string; items: QcItem[]; remark: string; images?: string[]; start_date?: string; end_date?: string }

const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '8px 11px', outline: 'none' }
const th: React.CSSProperties = { padding: '9px 14px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'left' }

function statusColor(s: string) {
  if (s === 'ผ่าน') return { c: '#2E7D55', bg: '#E2F1EA' }
  if (s === 'ต้องแก้ไข') return { c: '#C24036', bg: '#FBEEEC' }
  return { c: '#B7791F', bg: '#F6ECD6' }
}
function deriveStatus(items: QcItem[]) {
  if (items.some((i) => i.result === 'แก้ไข')) return 'ต้องแก้ไข'
  if (items.length && items.every((i) => i.result === 'อนุมัติ')) return 'ผ่าน'
  return 'กำลังตรวจ'
}

export default function QcInspect({ houseCode }: { houseCode?: string }) {
  const { data } = useApp()
  const houses = data.houses
  const [allRows, setRows] = useState<QcInspection[]>([])
  const rows = houseCode ? allRows.filter((r) => r.house_code === houseCode) : allRows
  const [adding, setAdding] = useState(false)
  const blankF = { house_code: houseCode || '', category: '', type: '', zone: '', inspector: '', start_date: '', end_date: '' }
  const [f, setF] = useState(blankF)
  const [imgs, setImgs] = useState<string[]>([])
  const [openId, setOpenId] = useState<number | null>(null)
  const [draft, setDraft] = useState<QcItem[]>([])
  const [printing, setPrinting] = useState<QcInspection | null>(null)
  const [err, setErr] = useState('')
  const today = new Date().toISOString().slice(0, 10)

  const load = () => api.get<QcInspection[]>('/qc').then(setRows).catch(() => setRows([]))
  useEffect(() => { load() }, [])

  const pickImg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []); e.target.value = ''
    for (const file of files) {
      if (imgs.length >= 3) { setErr('แนบได้สูงสุด 3 รูป'); break }
      if (!file.type.startsWith('image/')) continue
      const r = new FileReader(); r.onload = () => setImgs((cur) => cur.length >= 3 ? cur : [...cur, String(r.result)]); r.readAsDataURL(file)
    }
  }
  const create = async () => {
    if (!f.category || !f.type) { setErr('เลือกหมวดและประเภทงาน'); return }
    setErr('')
    const items = qcItemsOf(f.category, f.type).map((t, i) => ({ no: i + 1, text: t, result: '', fix: '', remark: '' }))
    try { await api.post('/qc', { ...f, items, images: imgs }); setF(blankF); setImgs([]); setAdding(false); load() }
    catch (e) { setErr((e as Error).message) }
  }
  const open = (r: QcInspection) => { setOpenId(r.id); setDraft(r.items.map((i) => ({ ...i }))) }
  const setItem = (i: number, patch: Partial<QcItem>) => setDraft((d) => d.map((x, j) => j === i ? { ...x, ...patch } : x))
  const pickItemImg = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []); e.target.value = ''
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const r = new FileReader()
      r.onload = () => setDraft((d) => d.map((x, j) => { if (j !== i) return x; const cur = x.images || []; return cur.length >= 3 ? x : { ...x, images: [...cur, String(r.result)] } }))
      r.readAsDataURL(file)
    }
  }
  const saveDraft = async (r: QcInspection) => { await api.put('/qc/' + r.id, { items: draft, status: deriveStatus(draft) }); setOpenId(null); load() }
  const remove = async (id: number) => { if (confirm('ลบใบตรวจนี้?')) { await api.del('/qc/' + id); load() } }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 13, color: '#5C6770' }}>ใบตรวจงาน <b className="num" style={{ color: '#1C2730' }}>{rows.length}</b> ใบ</div>
        <button onClick={() => setAdding((v) => !v)} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>+ สร้างใบตรวจ QC</button>
      </div>

      {adding && (
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {houseCode
              ? <div style={{ ...field, display: 'flex', alignItems: 'center', color: '#5C6770', background: '#F7F9FB' }}>{houses.find((h) => h.code === houseCode)?.name || houseCode}</div>
              : <select style={field} value={f.house_code} onChange={(e) => setF({ ...f, house_code: e.target.value })}>
                <option value="">— เลือกบ้าน —</option>
                {houses.map((h) => <option key={h.id} value={h.code}>{h.name}</option>)}
              </select>}
            <select style={field} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value, type: '' })}>
              <option value="">— หมวดงาน —</option>
              {QC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select style={field} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} disabled={!f.category}>
              <option value="">— ประเภทงาน —</option>
              {qcTypesOf(f.category).map((t) => <option key={t}>{t}</option>)}
            </select>
            <input style={field} placeholder="โซน / ชั้น (ถ้ามี)" value={f.zone} onChange={(e) => setF({ ...f, zone: e.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 12 }}>
            <div><div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>วันเริ่มตรวจ/เริ่มงาน</div><input style={field} type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></div>
            <div><div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>วันกำหนดเสร็จ</div><input style={field} type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></div>
            <div style={{ gridColumn: '3 / -1' }}>
              <div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>รูปหน้างาน (สูงสุด 3)</div>
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
          </div>
          <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 8 }}>เลือกประเภทงานแล้วระบบจะดึงเช็กลิสต์มาตรฐานมาให้ ({f.type ? qcItemsOf(f.category, f.type).length + ' ข้อ' : 'ยังไม่เลือก'})</div>
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
              <th style={{ ...th, paddingLeft: 18 }}>เลขที่</th><th style={th}>ประเภทงาน</th><th style={th}>บ้าน / โซน</th>
              <th style={{ ...th, textAlign: 'center' }}>ผล</th><th style={{ ...th, textAlign: 'center' }}>สถานะ</th><th style={{ ...th, paddingRight: 18, textAlign: 'center' }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีใบตรวจ — กด “สร้างใบตรวจ QC”</td></tr>}
            {rows.map((r) => {
              const sc = statusColor(r.status)
              const pass = r.items.filter((i) => i.result === 'อนุมัติ').length
              const fix = r.items.filter((i) => i.result === 'แก้ไข').length
              return (
                <Fragment key={r.id}>
                  <tr className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                    <td className="num" style={{ padding: '10px 18px', fontWeight: 600, fontFamily: 'monospace' }}>{r.no}<div style={{ fontSize: 10.5, color: '#94A0A8', fontFamily: 'inherit' }}>{r.date}</div></td>
                    <td style={{ padding: '10px 14px' }}><div style={{ fontWeight: 500 }}>{r.type}</div><div style={{ fontSize: 11, color: '#94A0A8' }}>{r.category}</div></td>
                    <td style={{ padding: '10px 14px', color: '#5C6770' }}>{houses.find((h) => h.code === r.house_code)?.name || r.house_code || '—'}{r.zone ? ` · ${r.zone}` : ''}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 12 }}><span style={{ color: '#2E7D55' }}>✓{pass}</span> / <span style={{ color: '#C24036' }}>✎{fix}</span> / {r.items.length}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: sc.c, background: sc.bg, padding: '2px 10px', borderRadius: 20 }}>{r.status}</span>
                      {r.end_date && r.end_date < today && r.status !== 'ผ่าน' && <div style={{ fontSize: 10, fontWeight: 600, color: '#C24036', marginTop: 3 }}>เลยกำหนด {r.end_date}</div>}
                      {r.end_date && (r.end_date >= today || r.status === 'ผ่าน') && <div style={{ fontSize: 10, color: '#94A0A8', marginTop: 3 }}>เสร็จ {r.end_date}</div>}
                    </td>
                    <td style={{ padding: '10px 18px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button onClick={() => openId === r.id ? setOpenId(null) : open(r)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>{openId === r.id ? 'ปิด' : 'ตรวจ/แก้'}</button>
                      <button onClick={() => setPrinting(r)} className="hov-f3f5f7" style={{ marginLeft: 6, fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>🖨</button>
                      <button onClick={() => remove(r.id)} style={{ marginLeft: 6, border: 'none', background: 'none', color: '#C24036', cursor: 'pointer', fontSize: 13 }}>✕</button>
                    </td>
                  </tr>
                  {openId === r.id && (
                    <tr>
                      <td colSpan={6} style={{ padding: '12px 18px', background: '#FAFBFC' }}>
                        {(r.start_date || r.end_date || (r.images && r.images.length > 0)) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                            {r.start_date && <span style={{ fontSize: 12, color: '#5C6770' }}>เริ่ม: <b>{r.start_date}</b></span>}
                            {r.end_date && <span style={{ fontSize: 12, color: '#5C6770' }}>กำหนดเสร็จ: <b>{r.end_date}</b></span>}
                            {(r.images || []).map((im, i) => <a key={i} href={im} target="_blank" rel="noreferrer"><img src={im} alt={'รูป ' + (i + 1)} style={{ height: 54, borderRadius: 6, border: '1px solid #E1E5EA' }} /></a>)}
                          </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {draft.map((it, i) => (
                            <div key={i} style={{ borderBottom: '1px solid #F1F4F6', paddingBottom: 6 }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr auto auto 1.2fr', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                                <span style={{ color: '#94A0A8', textAlign: 'right' }}>{i + 1}</span>
                                <span style={{ color: '#3C4750' }}>{it.text}</span>
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button onClick={() => setItem(i, { result: it.result === 'อนุมัติ' ? '' : 'อนุมัติ' })} style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 6, padding: '3px 9px', border: '1px solid ' + (it.result === 'อนุมัติ' ? '#2E7D55' : '#D2DAE1'), background: it.result === 'อนุมัติ' ? '#2E7D55' : '#fff', color: it.result === 'อนุมัติ' ? '#fff' : '#5C6770' }}>อนุมัติ</button>
                                  <button onClick={() => setItem(i, { result: it.result === 'แก้ไข' ? '' : 'แก้ไข' })} style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 6, padding: '3px 9px', border: '1px solid ' + (it.result === 'แก้ไข' ? '#C24036' : '#D2DAE1'), background: it.result === 'แก้ไข' ? '#C24036' : '#fff', color: it.result === 'แก้ไข' ? '#fff' : '#5C6770' }}>แก้ไข</button>
                                </div>
                                <label title="แนบรูปข้อนี้ (สูงสุด 3)" className="hov-f3f5f7" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 6, padding: '3px 8px', cursor: (it.images || []).length >= 3 ? 'not-allowed' : 'pointer' }}>
                                  📷 {(it.images || []).length ? `${(it.images || []).length}/3` : 'รูป'}
                                  <input type="file" accept="image/*" multiple onChange={(e) => pickItemImg(i, e)} disabled={(it.images || []).length >= 3} style={{ display: 'none' }} />
                                </label>
                                <input placeholder="สิ่งที่ต้องแก้ไข / หมายเหตุ" value={it.fix} onChange={(e) => setItem(i, { fix: e.target.value })} style={{ ...field, padding: '5px 8px', fontSize: 12 }} />
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
                          ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
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
