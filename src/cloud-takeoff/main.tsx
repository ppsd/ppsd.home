// หน้าถอดแบบ + BOQ บน Cloudflare (ppsd-office.pages.dev/takeoff) — ใช้หน้าจอ BOQ ตัวเดียวกับ ERP (src/components/cost/BoqTab)
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import BoqTab from '../components/cost/BoqTab'
import { BASE, getToken, setToken } from './api'
import { setSession, type MeResponse } from './session'
import { CloudAppProvider } from './store'

const box: React.CSSProperties = { background: '#fff', border: '1px solid #E1E5EA', borderRadius: 14, padding: '22px 24px' }
const input: React.CSSProperties = { fontFamily: 'inherit', fontSize: 15, padding: '10px 12px', border: '1px solid #D2DAE1', borderRadius: 9, outline: 'none', width: '100%', boxSizing: 'border-box' }

function Login({ onDone }: { onDone: () => void }) {
  const [username, setU] = useState('')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      const r = await fetch(BASE + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, pin }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'ล็อกอินไม่สำเร็จ')
      setToken(j.token); onDone()
    } catch (x) { setErr((x as Error).message) }
    setBusy(false)
  }
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F2F4F6', padding: 16 }}>
      <form onSubmit={go} style={{ ...box, width: 'min(380px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: '#1C2730' }}>📐 ถอดแบบ + BOQ</div>
        <div style={{ fontSize: 13, color: '#5C6770' }}>PPSD Construction · ใช้ชื่อผู้ใช้และ PIN เดียวกับ ERP</div>
        <input style={input} placeholder="ชื่อผู้ใช้" autoComplete="username" value={username} onChange={(e) => setU(e.target.value)} />
        <input style={input} placeholder="PIN" type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        {err && <div style={{ fontSize: 13, color: '#C24036' }}>{err}</div>}
        <button disabled={busy || !username || !pin} style={{ fontFamily: 'inherit', fontSize: 15, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '11px', cursor: 'pointer' }}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
        <div style={{ fontSize: 12, color: '#94A0A8' }}>ใช้ได้เฉพาะแอดมิน / บัญชี / ผู้จัดการ (สิทธิ์เดียวกับหน้า BOQ ใน ERP)</div>
      </form>
    </div>
  )
}

function App() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [state, setState] = useState<'loading' | 'login' | 'ready'>(getToken() ? 'loading' : 'login')
  const load = async () => {
    setState('loading')
    try {
      const r = await fetch(BASE + '/me', { headers: { Authorization: 'Bearer ' + getToken() } })
      if (!r.ok) throw new Error()
      const j: MeResponse = await r.json()
      setSession(j); setMe(j); setState('ready')
    } catch { setToken(null); setState('login') }
  }
  useEffect(() => { if (getToken()) load() }, [])
  useEffect(() => { const out = () => { setToken(null); setState('login') }; window.addEventListener('ppsd:logout', out); return () => window.removeEventListener('ppsd:logout', out) }, [])
  if (state === 'login') return <Login onDone={load} />
  if (state === 'loading' || !me) return <div style={{ padding: 40, textAlign: 'center', color: '#5C6770' }}>กำลังโหลด…</div>
  const live = me.mode === 'live'
  return (
    <CloudAppProvider houses={me.houses} user={me.user}>
      <div style={{ minHeight: '100vh', background: '#F2F4F6' }}>
        <div style={{ background: '#fff', borderBottom: '1px solid #E1E5EA', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1C2730' }}>📐 ถอดแบบ + BOQ</div>
          <div style={{ fontSize: 12.5, color: '#5C6770' }}>PPSD · ราคากลางจาก ERP ซิงก์ล่าสุด {me.last_sync || '-'}</div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 13, color: '#30506A' }}>{me.user.name}</div>
          <button onClick={() => { setToken(null); setState('login') }} style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '5px 12px', cursor: 'pointer' }}>ออกจากระบบ</button>
        </div>
        {!live && <div style={{ background: '#FBF1DC', color: '#7A5410', fontSize: 13, padding: '9px 16px' }}>⚠ ยังไม่เปิดใช้ถอดแบบ/BOQ บนเว็บนี้ — ตอนนี้ดูได้อย่างเดียว (ทำใน ERP ไปก่อน) · ผู้ดูแลเปิดได้ที่ ERP → เมนู LINE → การเชื่อมต่อ</div>}
        {live && <div style={{ background: '#E6F4EC', color: '#1E5E3C', fontSize: 12.5, padding: '7px 16px' }}>✓ BOQ ทำที่นี่ — ERP รับข้อมูลกลับทุก 1 นาที (ดันเข้าราคาขายบ้าน / ราคากลางใหม่ / ชื่อเรียกที่จำไว้ ลง ERP ภายใน 1 นาที)</div>}
        <div style={{ padding: 16, maxWidth: 1500, margin: '0 auto' }}><BoqTab /></div>
      </div>
    </CloudAppProvider>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
