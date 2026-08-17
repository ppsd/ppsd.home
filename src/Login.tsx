import { useState } from 'react'
import { useApp } from './store'
import { api } from './api'
import { PPSD_MARK } from './assets'

export default function Login() {
  const { login } = useApp()
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)      // โหมด "ลืม PIN"
  const [forgotMsg, setForgotMsg] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      await login(username.trim(), pin.trim())
    } catch (ex) {
      setErr((ex as Error).message || 'เข้าสู่ระบบไม่สำเร็จ')
      setBusy(false)
    }
  }

  const sendForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const r = await api.post<{ message: string }>('/forgot-pin', { username: username.trim() })
      setForgotMsg(r.message || 'ส่งคำขอแล้ว — โปรดติดต่อผู้ดูแลระบบ')
    } catch (ex) { setErr((ex as Error).message || 'ส่งคำขอไม่สำเร็จ') } finally { setBusy(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1E2E3B', fontFamily: "'Kanit',sans-serif", padding: 24 }}>
      <div style={{ width: 400, maxWidth: '100%', background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,.35)' }}>
        <div style={{ padding: '30px 30px 22px', textAlign: 'center', borderBottom: '1px solid #EEF1F4' }}>
          <img src={PPSD_MARK} alt="PPSD" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1C2730' }}>PPSD Construction ERP</div>
          <div style={{ fontSize: 12.5, color: '#94A0A8', marginTop: 2 }}>{forgot ? 'ขอรีเซ็ต PIN (ลืม PIN)' : 'เข้าสู่ระบบเพื่อใช้งาน'}</div>
        </div>

        {forgot ? (
          <form onSubmit={sendForgot} style={{ padding: '22px 30px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {forgotMsg ? (
              <>
                <div style={{ fontSize: 13, color: '#1C5B3A', background: '#E2F1EA', borderRadius: 8, padding: '12px 14px', lineHeight: 1.6 }}>✓ {forgotMsg}</div>
                <div style={{ fontSize: 12, color: '#94A0A8', lineHeight: 1.6 }}>ผู้ดูแลระบบจะยืนยันตัวตนแล้วตั้ง PIN ชั่วคราวให้ · เข้าครั้งแรกด้วย PIN ชั่วคราวแล้วระบบจะให้ตั้ง PIN ใหม่ทันที</div>
                <button type="button" onClick={() => { setForgot(false); setForgotMsg('') }} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 10, padding: '11px 0', cursor: 'pointer' }}>กลับไปหน้าเข้าสู่ระบบ</button>
              </>
            ) : (
              <>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: '#3C4750', marginBottom: 6 }}>ชื่อผู้ใช้ของคุณ</div>
                  <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="เช่น thanakorn" autoFocus
                    style={{ width: '100%', fontFamily: 'inherit', fontSize: 14, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '11px 13px', outline: 'none' }} />
                </div>
                <div style={{ fontSize: 12, color: '#94A0A8', lineHeight: 1.6 }}>ระบบจะส่งคำขอไปยังผู้ดูแล เพื่อยืนยันตัวตนและตั้ง PIN ใหม่ให้ (ไม่ส่งรหัสทางอีเมล/SMS เพื่อความปลอดภัย)</div>
                {err && <div style={{ fontSize: 12.5, color: '#C24036', background: '#FBEEEC', borderRadius: 8, padding: '8px 12px' }}>{err}</div>}
                <button type="submit" disabled={busy || !username.trim()} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 15, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 10, padding: '12px 0', cursor: 'pointer', opacity: busy || !username.trim() ? 0.7 : 1 }}>{busy ? 'กำลังส่ง…' : 'ส่งคำขอรีเซ็ต PIN'}</button>
                <button type="button" onClick={() => { setForgot(false); setErr('') }} style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#5C6770', background: 'none', border: 'none', cursor: 'pointer' }}>ยกเลิก</button>
              </>
            )}
          </form>
        ) : (
        <form onSubmit={submit} style={{ padding: '22px 30px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: '#3C4750', marginBottom: 6 }}>ชื่อผู้ใช้</div>
            <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="เช่น thanakorn" autoFocus
              style={{ width: '100%', fontFamily: 'inherit', fontSize: 14, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '11px 13px', outline: 'none' }} />
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: '#3C4750', marginBottom: 6 }}>PIN</div>
            <input className="field" value={pin} onChange={(e) => setPin(e.target.value)} type="password" inputMode="numeric" placeholder="••••"
              style={{ width: '100%', fontFamily: 'inherit', fontSize: 14, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '11px 13px', outline: 'none' }} />
          </div>

          {err && <div style={{ fontSize: 12.5, color: '#C24036', background: '#FBEEEC', borderRadius: 8, padding: '8px 12px' }}>{err}</div>}

          <button type="submit" disabled={busy} className="btn-primary"
            style={{ fontFamily: 'inherit', fontSize: 15, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 10, padding: '12px 0', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
          <button type="button" onClick={() => { setForgot(true); setErr(''); setPin('') }} style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#30506A', background: 'none', border: 'none', cursor: 'pointer', marginTop: -4 }}>ลืม PIN?</button>
        </form>
        )}
      </div>
    </div>
  )
}
