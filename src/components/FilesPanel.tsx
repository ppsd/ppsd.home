import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { ApiFile } from '../store'

const KB = 1024
const fmtSize = (n: number) => (n > KB * KB ? (n / KB / KB).toFixed(1) + ' MB' : Math.max(1, Math.round(n / KB)) + ' KB')
const MAX_MB = 200 // เพดานต่อไฟล์ (กันอัปโหลดพลาดไฟล์มหึมา) — ปรับได้

// หมวดไฟล์
const CATS = ['สัญญา', 'แบบก่อสร้าง', 'ใบอนุญาต', 'สเปก/วัสดุ', 'รูปหน้างาน', 'เอกสารการเงิน', 'อื่นๆ']
const catColor = (c: string) => {
  if (c === 'สัญญา') return { bg: '#FBEEEC', c: '#C24036' }
  if (c === 'แบบก่อสร้าง') return { bg: '#E2E9EF', c: '#30506A' }
  if (c === 'ใบอนุญาต') return { bg: '#F6ECD6', c: '#B7791F' }
  if (c === 'รูปหน้างาน') return { bg: '#E2F1EA', c: '#2E7D55' }
  if (c === 'เอกสารการเงิน') return { bg: '#EEE9F5', c: '#6B4E9E' }
  return { bg: '#EDF1F4', c: '#5C6770' }
}
function extOf(name: string) { return (name.split('.').pop() || '').slice(0, 4).toUpperCase() }
function extColor(ext: string) {
  if (ext === 'PDF') return { bg: '#FBEEEC', c: '#C24036' }
  if (['JPG', 'JPEG', 'PNG', 'GIF', 'WEBP'].includes(ext)) return { bg: '#E2F1EA', c: '#2E7D55' }
  if (['DWG', 'DXF'].includes(ext)) return { bg: '#E2E9EF', c: '#30506A' }
  return { bg: '#EDF1F4', c: '#5C6770' }
}
const viewable = (f: ApiFile) => /pdf|image\//.test(f.mime || '') || /\.(pdf|jpe?g|png|gif|webp)$/i.test(f.name)

export default function FilesPanel({ houseCode }: { houseCode: string }) {
  const [files, setFiles] = useState<ApiFile[]>([])
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null)
  const [err, setErr] = useState('')
  const [cat, setCat] = useState('สัญญา')      // หมวดที่จะอัปโหลดเข้า
  const [filter, setFilter] = useState('')      // ตัวกรองหมวดที่แสดง
  const inputRef = useRef<HTMLInputElement>(null)

  const load = () => api.get<ApiFile[]>('/files?house=' + encodeURIComponent(houseCode)).then(setFiles).catch(() => {})
  useEffect(() => { load() /* eslint-disable-next-line */ }, [houseCode])

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || [])
    e.target.value = ''
    if (!picked.length) return
    setErr('')
    let done = 0
    setBusy({ done: 0, total: picked.length })
    for (const file of picked) {
      if (file.size > MAX_MB * KB * KB) { setErr(`"${file.name}" ใหญ่เกิน ${MAX_MB}MB — ข้ามไฟล์นี้`); continue }
      try { await api.uploadFile(file, { house: houseCode, category: cat }); done++; setBusy({ done, total: picked.length }) }
      catch (ex) { setErr((ex as Error).message) }
    }
    setBusy(null)
    await load()
  }
  const remove = async (id: number) => { if (confirm('ลบไฟล์นี้?')) { await api.del('/files/' + id); await load() } }

  const shown = filter ? files.filter((f) => (f.category || 'อื่นๆ') === filter) : files
  // จัดกลุ่มตามหมวด
  const groups: Record<string, ApiFile[]> = {}
  for (const f of shown) { const c = f.category || 'อื่นๆ'; (groups[c] = groups[c] || []).push(f) }
  const orderedCats = [...CATS, 'อื่นๆ'].filter((c) => groups[c]?.length)

  return (
    <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 13, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', borderBottom: '1px solid #EEF1F4', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>ไฟล์แบบบ้าน / สัญญา</span>
        <span style={{ fontSize: 11.5, color: '#94A0A8' }} className="num">({files.length})</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11.5, color: '#5C6770' }}>หมวด:</span>
          <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ fontFamily: 'inherit', fontSize: 12, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '5px 8px', outline: 'none' }}>
            {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => inputRef.current?.click()} disabled={!!busy} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 7, padding: '6px 12px', cursor: busy ? 'not-allowed' : 'pointer' }}>{busy ? `กำลังอัปโหลด ${busy.done}/${busy.total}…` : '+ อัปโหลด'}</button>
          <input ref={inputRef} type="file" multiple onChange={pick} style={{ display: 'none' }} />
        </div>
      </div>

      {/* ตัวกรองหมวด */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px 4px', flexWrap: 'wrap', borderBottom: '1px solid #F4F6F8' }}>
        {[['', 'ทั้งหมด'], ...CATS.map((c) => [c, c] as [string, string]), ['อื่นๆ', 'อื่นๆ']].map(([v, l]) => {
          const n = v ? files.filter((f) => (f.category || 'อื่นๆ') === v).length : files.length
          if (v && !n) return null
          const on = filter === v
          return <button key={v} onClick={() => setFilter(v)} style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: on ? 600 : 500, color: on ? '#fff' : '#5C6770', background: on ? '#30506A' : '#F1F4F6', border: 'none', borderRadius: 20, padding: '3px 11px', cursor: 'pointer' }}>{l} {n ? <span className="num">({n})</span> : ''}</button>
        })}
      </div>

      <div style={{ padding: '6px 12px 10px', maxHeight: 460, overflowY: 'auto' }}>
        {err && <div style={{ fontSize: 11.5, color: '#C24036', padding: '6px 8px' }}>{err}</div>}
        {files.length === 0 && <div style={{ fontSize: 12, color: '#94A0A8', padding: '10px 8px' }}>ยังไม่มีไฟล์ — เลือกหมวดแล้วกด “อัปโหลด” (เลือกหลายไฟล์พร้อมกันได้)</div>}
        {orderedCats.map((c) => {
          const cc = catColor(c)
          return (
            <div key={c} style={{ marginTop: 4 }}>
              {!filter && <div style={{ fontSize: 11.5, fontWeight: 600, color: cc.c, padding: '6px 6px 3px' }}>{c} <span className="num" style={{ color: '#94A0A8' }}>({groups[c].length})</span></div>}
              {groups[c].map((f) => {
                const ext = extOf(f.name); const ec = extColor(ext); const canView = viewable(f)
                return (
                  <div key={f.id} className="hov-f7f9fb" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 8 }}>
                    <span style={{ width: 32, height: 32, borderRadius: 7, background: ec.bg, color: ec.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0 }}>{ext || 'FILE'}</span>
                    <div style={{ minWidth: 0, flex: 1, cursor: canView ? 'pointer' : 'default' }} onClick={() => canView && api.openFile('/files/' + f.id + '/view')}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: canView ? '#30506A' : '#1C2730' }}>{f.name}</div>
                      <div style={{ fontSize: 11, color: '#94A0A8' }}>{fmtSize(f.size)} · {f.uploaded} · {f.uploader}</div>
                    </div>
                    {canView && (
                      <button onClick={() => api.openFile('/files/' + f.id + '/view')} title="เปิดดู" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>ดู</button>
                    )}
                    <button onClick={() => api.download('/files/' + f.id + '/download')} title="ดาวน์โหลด" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A0A8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M5 21h14" /></svg>
                    </button>
                    <button onClick={() => remove(f.id)} title="ลบ" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, color: '#C24036', fontSize: 14 }}>✕</button>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
