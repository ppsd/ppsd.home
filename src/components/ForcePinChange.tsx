import { useState } from 'react'
import { useApp } from '../store'

// จอบังคับตั้ง PIN ใหม่ หลังถูกแอดมินรีเซ็ต (ลืม PIN) — ต้องตั้งก่อนถึงเข้าใช้งานได้
export default function ForcePinChange({ userName, onDone }: { userName: string; onDone: () => void }) {
  const { changeMyPin, logout } = useApp()
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const fld: React.CSSProperties = { width: '100%', fontFamily: 'inherit', fontSize: 16, letterSpacing: 6, textAlign: 'center', color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '11px 13px', outline: 'none' }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    if (!/^\d{4}$/.test(next)) { setErr('PIN ใหม่ต้องเป็นตัวเลข 4 หลัก'); return }
    if (next !== confirm) { setErr('PIN ใหม่ทั้งสองช่องไม่ตรงกัน'); return }
    if (next === cur) { setErr('PIN ใหม่ต้องไม่ซ้ำกับ PIN ชั่วคราว'); return }
    setBusy(true)
    try { await changeMyPin(cur, next); onDone() }
    catch (ex) { setErr((ex as Error).message || 'ตั้ง PIN ไม่สำเร็จ') } finally { setBusy(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1E2E3B', fontFamily: "'Kanit',sans-serif", padding: 24 }}>
      <div style={{ width: 400, maxWidth: '100%', background: '#fff', borderRadius: 16, padding: '30px 30px 26px', boxShadow: '0 24px 70px rgba(0,0,0,.35)' }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ width: 52, height: 52, borderRadius: 13, background: '#F3F5F7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#30506A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1C2730' }}>ตั้ง PIN ใหม่ก่อนใช้งาน</div>
          <div style={{ fontSize: 12.5, color: '#94A0A8', marginTop: 4, lineHeight: 1.6 }}>PIN ของคุณ ({userName}) ถูกรีเซ็ตโดยผู้ดูแล<br />กรุณาตั้ง PIN ใหม่เป็นของคุณเองเพื่อความปลอดภัย</div>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><div style={{ fontSize: 12.5, fontWeight: 500, color: '#3C4750', marginBottom: 6 }}>PIN ชั่วคราว (ที่แอดมินให้)</div>
            <input type="password" inputMode="numeric" maxLength={4} value={cur} autoFocus onChange={(e) => setCur(e.target.value.replace(/\D/g, ''))} placeholder="••••" style={fld} /></div>
          <div><div style={{ fontSize: 12.5, fontWeight: 500, color: '#3C4750', marginBottom: 6 }}>PIN ใหม่ (4 หลัก)</div>
            <input type="password" inputMode="numeric" maxLength={4} value={next} onChange={(e) => setNext(e.target.value.replace(/\D/g, ''))} placeholder="••••" style={fld} /></div>
          <div><div style={{ fontSize: 12.5, fontWeight: 500, color: '#3C4750', marginBottom: 6 }}>ยืนยัน PIN ใหม่</div>
            <input type="password" inputMode="numeric" maxLength={4} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))} placeholder="••••" style={fld} /></div>
          {err && <div style={{ fontSize: 12.5, color: '#C24036', background: '#FBEEEC', borderRadius: 8, padding: '8px 12px' }}>{err}</div>}
          <button type="submit" disabled={busy} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 15, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 10, padding: '12px 0', cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'กำลังตั้ง PIN…' : 'ตั้ง PIN ใหม่ + เข้าใช้งาน'}</button>
          <button type="button" onClick={logout} style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#5C6770', background: 'none', border: 'none', cursor: 'pointer' }}>ออกจากระบบ</button>
        </form>
      </div>
    </div>
  )
}
