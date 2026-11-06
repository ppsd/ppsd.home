import { useRef, useState } from 'react'
import { useApp } from '../../store'
import ModalShell from '../shared/ModalShell'

// Employee signature thumbnail + view (ขยายดู) + upload (used in the HR employees table).
export default function EmpSignatureCell({ empId, signature, name }: { empId: number; signature?: string | null; name?: string }) {
  const { setEmpSignature } = useApp()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState(false)

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
  const remove = async () => {
    if (!window.confirm(`ลบลายเซ็น${name ? 'ของ ' + name : ''}?
เอกสารที่ออกไปแล้วยังมีลายเซ็นเดิมอยู่ · เอกสารใหม่จะไม่มีลายเซ็นจนกว่าจะอัปโหลดใหม่`)) return
    setBusy(true)
    try { await setEmpSignature(empId, ''); setView(false) } catch (e) { alert((e as Error).message) } finally { setBusy(false) }
  }
  const btn: React.CSSProperties = { fontFamily: 'inherit', fontSize: 11, fontWeight: 500, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
      {signature && <img src={signature} alt="ลายเซ็น" title="กดเพื่อดูลายเซ็นขนาดใหญ่" onClick={() => setView(true)} style={{ height: 26, maxWidth: 70, objectFit: 'contain', border: '1px solid #E1E5EA', borderRadius: 5, background: '#fff', cursor: 'zoom-in' }} />}
      {signature && <button onClick={() => setView(true)} className="hov-f3f5f7" style={btn}>ดู</button>}
      <button onClick={() => inputRef.current?.click()} disabled={busy} className="hov-f3f5f7" style={btn}>{busy ? '...' : signature ? 'เปลี่ยน' : 'อัปโหลด'}</button>
      <input ref={inputRef} type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
      {view && signature && (
        <ModalShell title={`ลายเซ็น${name ? ' · ' + name : ''}`} width={560} onClose={() => setView(false)}
          footer={<>
            <button onClick={remove} disabled={busy} className="hov-f3f5f7" style={{ ...btn, fontSize: 13, padding: '8px 14px', color: '#C24036', borderColor: '#E7CDC9', marginRight: 'auto' }}>ลบลายเซ็น</button>
            <button onClick={() => { setView(false); inputRef.current?.click() }} className="hov-f3f5f7" style={{ ...btn, fontSize: 13, padding: '8px 14px' }}>เปลี่ยนลายเซ็น</button>
            <button onClick={() => setView(false)} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '8px 18px', cursor: 'pointer' }}>ปิด</button>
          </>}>
          <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 10, padding: 18, display: 'flex', justifyContent: 'center' }}>
            <img src={signature} alt="ลายเซ็น" style={{ maxWidth: '100%', maxHeight: 320, objectFit: 'contain' }} />
          </div>
          <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 8 }}>ลายเซ็นนี้ใช้ในเอกสารที่คนนี้เซ็นหรืออนุมัติ (PR · PO · ใบจ่ายเงิน · ใบลา · ใบตรวจ ฯลฯ) — แก้ที่นี่ที่เดียว</div>
        </ModalShell>
      )}
    </div>
  )
}
