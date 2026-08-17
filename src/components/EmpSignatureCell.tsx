import { useRef, useState } from 'react'
import { useApp } from '../store'

// Employee signature thumbnail + upload (used in the HR employees table).
export default function EmpSignatureCell({ empId, signature }: { empId: number; signature?: string | null }) {
  const { setEmpSignature } = useApp()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f || !f.type.startsWith('image/')) return
    setBusy(true)
    const r = new FileReader()
    r.onload = async () => {
      try { await setEmpSignature(empId, String(r.result)) } finally { setBusy(false) }
    }
    r.readAsDataURL(f)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
      {signature && <img src={signature} alt="ลายเซ็น" style={{ height: 26, maxWidth: 70, objectFit: 'contain', border: '1px solid #E1E5EA', borderRadius: 5, background: '#fff' }} />}
      <button onClick={() => inputRef.current?.click()} disabled={busy} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 500, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>{busy ? '...' : signature ? 'เปลี่ยน' : 'อัปโหลด'}</button>
      <input ref={inputRef} type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
    </div>
  )
}
