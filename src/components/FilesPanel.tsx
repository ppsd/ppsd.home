import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { ApiFile } from '../store'

const KB = 1024
const fmtSize = (n: number) => (n > KB * KB ? (n / KB / KB).toFixed(1) + ' MB' : Math.max(1, Math.round(n / KB)) + ' KB')

function extOf(name: string) {
  return (name.split('.').pop() || '').slice(0, 4).toUpperCase()
}
function extColor(ext: string) {
  if (ext === 'PDF') return { bg: '#FBEEEC', c: '#C24036' }
  if (['JPG', 'JPEG', 'PNG'].includes(ext)) return { bg: '#E2F1EA', c: '#2E7D55' }
  if (['DWG', 'DXF'].includes(ext)) return { bg: '#E2E9EF', c: '#30506A' }
  return { bg: '#EDF1F4', c: '#5C6770' }
}

// Real file attachments for a house (upload / download / delete via the API).
export default function FilesPanel({ houseCode }: { houseCode: string }) {
  const [files, setFiles] = useState<ApiFile[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const load = () => api.get<ApiFile[]>('/files?house=' + encodeURIComponent(houseCode)).then(setFiles).catch(() => {})
  useEffect(() => { load() /* eslint-disable-next-line */ }, [houseCode])

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 15 * 1024 * 1024) { setErr('ไฟล์ใหญ่เกิน 15MB'); return }
    setErr(''); setBusy(true)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await api.post('/files', { house_code: houseCode, name: file.name, mime: file.type, data: String(reader.result) })
        await load()
      } catch (ex) { setErr((ex as Error).message) } finally { setBusy(false) }
    }
    reader.readAsDataURL(file)
  }

  const remove = async (id: number) => {
    await api.del('/files/' + id)
    await load()
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 13, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', borderBottom: '1px solid #EEF1F4' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>ไฟล์แบบบ้าน / สัญญา</span>
        <button onClick={() => inputRef.current?.click()} disabled={busy} className="hov-f3f5f7" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '5px 11px', cursor: 'pointer' }}>{busy ? 'กำลังอัปโหลด…' : '+ อัปโหลด'}</button>
        <input ref={inputRef} type="file" onChange={pick} style={{ display: 'none' }} />
      </div>
      <div style={{ padding: '8px 12px' }}>
        {err && <div style={{ fontSize: 11.5, color: '#C24036', padding: '4px 8px' }}>{err}</div>}
        {files.length === 0 && <div style={{ fontSize: 12, color: '#94A0A8', padding: '10px 8px' }}>ยังไม่มีไฟล์</div>}
        {files.map((f) => {
          const ext = extOf(f.name)
          const ec = extColor(ext)
          return (
            <div key={f.id} className="hov-f7f9fb" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 8 }}>
              <span style={{ width: 32, height: 32, borderRadius: 7, background: ec.bg, color: ec.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0 }}>{ext || 'FILE'}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                <div style={{ fontSize: 11, color: '#94A0A8' }}>{fmtSize(f.size)} · {f.uploaded}</div>
              </div>
              <button onClick={() => api.download('/files/' + f.id + '/download')} title="ดาวน์โหลด" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A0A8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M5 21h14" /></svg>
              </button>
              <button onClick={() => remove(f.id)} title="ลบ" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, color: '#C24036', fontSize: 14 }}>✕</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
