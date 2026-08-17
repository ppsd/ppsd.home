import { useEffect, useRef, useState } from 'react'
import { api } from './api'

const TH_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

type KEmp = { code: string; name: string }
type Geo = { enabled: boolean; radius: number; lat: string; lng: string }

function getGPS(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('อุปกรณ์นี้ไม่รองรับ GPS'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (err) => reject(new Error(err.code === 1 ? 'กรุณาอนุญาตการเข้าถึงตำแหน่ง (GPS)' : 'อ่านตำแหน่งไม่สำเร็จ ลองใหม่')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  })
}

// Standalone employee check-in app (no ERP login) — open at  <url>/#checkin
export default function CheckIn() {
  const [emps, setEmps] = useState<KEmp[]>([])
  const [geo, setGeo] = useState<Geo>({ enabled: false, radius: 200, lat: '', lng: '' })
  const [now, setNow] = useState(new Date())
  const [selCode, setSelCode] = useState('')
  const [pin, setPin] = useState('')
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  // location tracking (โฟร์แมน) — ส่งตำแหน่งทุก 5 นาทีระหว่างเปิดแอป
  const [track, setTrack] = useState<{ name: string; count: number; last: string } | null>(null)
  const trackRef = useRef<{ code: string; pin: string; timer: number } | null>(null)

  useEffect(() => {
    api.get<KEmp[]>('/kiosk/employees').then(setEmps).catch(() => {})
    api.get<Geo>('/settings/attendance').then(setGeo).catch(() => {})
    const t = setInterval(() => setNow(new Date()), 1000)
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key >= '0' && e.key <= '9') { setToast(null); setPin((p) => (p.length < 4 ? p + e.key : p)) }
      else if (e.key === 'Backspace') { e.preventDefault(); setPin((p) => p.slice(0, -1)) }
    }
    window.addEventListener('keydown', onKey)
    return () => { clearInterval(t); window.removeEventListener('keydown', onKey); if (trackRef.current) clearInterval(trackRef.current.timer) }
  }, [])

  const sendLocation = async (code: string, pinv: string, note: string) => {
    const c = await getGPS()
    await api.post('/kiosk/location', { emp_code: code, pin: pinv, lat: c.lat, lng: c.lng, note })
  }
  const startTrack = async () => {
    if (!emp) { setToast({ msg: 'เลือกชื่อก่อน', ok: false }); return }
    if (pin.length !== 4) { setToast({ msg: 'ใส่ PIN 4 หลักก่อน', ok: false }); return }
    const code = emp.code, pinv = pin, name = emp.name
    try {
      await sendLocation(code, pinv, 'ติดตามงาน')
      const timer = window.setInterval(() => {
        sendLocation(code, pinv, 'ติดตามงาน')
          .then(() => setTrack((t) => ({ name, count: (t?.count || 0) + 1, last: new Date().toLocaleTimeString('th-TH') })))
          .catch(() => {})
      }, 5 * 60 * 1000)
      trackRef.current = { code, pin: pinv, timer }
      setTrack({ name, count: 1, last: new Date().toLocaleTimeString('th-TH') })
      setPin(''); setSelCode('')
      setToast({ msg: `เริ่มส่งตำแหน่งงานของ ${name} แล้ว (ทุก 5 นาที)`, ok: true })
    } catch (e) { setToast({ msg: (e as Error).message, ok: false }) }
  }
  const stopTrack = () => {
    if (trackRef.current) clearInterval(trackRef.current.timer)
    trackRef.current = null
    setTrack(null)
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const dateStr = `วัน${TH_DAYS[now.getDay()]}ที่ ${now.getDate()} ${TH_MONTHS[now.getMonth()]} ${now.getFullYear() + 543}`
  const emp = emps.find((e) => e.code === selCode)

  const press = (d: string) => {
    if (toast) setToast(null)
    if (d === 'del') setPin((p) => p.slice(0, -1))
    else if (d === 'clr') setPin('')
    else if (pin.length < 4) setPin((p) => p + d)
  }

  const action = async (kind: 'in' | 'out') => {
    if (!emp) { setToast({ msg: 'กรุณาเลือกชื่อพนักงานก่อน', ok: false }); return }
    if (pin.length !== 4) { setToast({ msg: 'กรุณาใส่ PIN 4 หลัก', ok: false }); return }
    setBusy(true)
    try {
      let coords: { lat?: number; lng?: number } = {}
      if (geo.enabled) {
        try { coords = await getGPS() } catch (e) { setToast({ msg: (e as Error).message, ok: false }); setBusy(false); return }
      }
      const r = await api.post<{ name: string; time: string; status: string }>('/kiosk/punch', { emp_code: emp.code, pin, kind, ...coords })
      setToast({ msg: `${r.name} ${kind === 'in' ? 'เข้างาน' : 'ออกงาน'} ${r.time} น.${r.status === 'สาย' ? ' (สาย)' : ''} เรียบร้อย`, ok: true })
      setPin(''); setSelCode('')
    } catch (e) {
      setToast({ msg: (e as Error).message || 'บันทึกไม่สำเร็จ', ok: false }); setPin('')
    } finally { setBusy(false) }
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clr', '0', 'del']

  return (
    <div style={{ minHeight: '100vh', background: '#F3F5F7', fontFamily: "'Kanit',sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 12 }}>
      <div style={{ fontSize: 12.5, color: geo.enabled ? '#2E7D55' : '#94A0A8', textAlign: 'center' }}>
        {geo.enabled ? `📍 เช็คอินได้เฉพาะในรัศมี ${geo.radius} ม. จากออฟฟิศ (ต้องเปิด GPS)` : '📍 เช็คอินได้ทุกที่'}
      </div>
      <div style={{ width: 420, maxWidth: '100%', background: '#fff', border: '1px solid #E1E5EA', borderRadius: 18, overflow: 'hidden', boxShadow: '0 12px 40px rgba(28,39,48,.08)' }}>
        <div style={{ background: '#1E2E3B', color: '#fff', padding: '26px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 12.5, color: '#7C8B97', letterSpacing: '.1em', marginBottom: 10 }}>PPSD — ลงเวลาเข้า-ออกงาน</div>
          <div className="num" style={{ fontSize: 48, fontWeight: 700, lineHeight: 1 }}>{timeStr}</div>
          <div style={{ fontSize: 13.5, color: '#AEBAC4', marginTop: 10 }}>{dateStr}</div>
        </div>
        <div style={{ padding: '20px 22px 22px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: '#3C4750', marginBottom: 6 }}>เลือกชื่อพนักงาน</div>
          <select value={selCode} onChange={(e) => { setSelCode(e.target.value); setPin(''); setToast(null) }}
            style={{ width: '100%', fontFamily: 'inherit', fontSize: 14, color: selCode ? '#1C2730' : '#9AA6AE', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '11px 13px', outline: 'none', cursor: 'pointer' }}>
            <option value="">— เลือกชื่อ —</option>
            {emps.map((e) => <option key={e.code} value={e.code} style={{ color: '#1C2730' }}>{e.name} ({e.code})</option>)}
          </select>

          <div style={{ fontSize: 12.5, fontWeight: 500, color: '#3C4750', margin: '14px 0 6px' }}>ใส่ PIN 4 หลัก</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ flex: 1, height: 44, borderRadius: 9, border: '1px solid #D2DAE1', background: '#F7F9FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700 }}>{pin[i] ? '•' : ''}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
            {keys.map((k) => {
              const isAction = k === 'clr' || k === 'del'
              return (
                <button key={k} onClick={() => press(k)}
                  style={{ fontFamily: 'inherit', height: 48, borderRadius: 9, border: '1px solid #E1E5EA', background: isAction ? '#F3F5F7' : '#fff', cursor: 'pointer', fontSize: isAction ? 13 : 20, fontWeight: 600, color: isAction ? '#5C6770' : '#1C2730' }}>
                  {k === 'del' ? '⌫' : k === 'clr' ? 'ล้าง' : k}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={() => action('in')} disabled={busy} style={{ flex: 1, fontFamily: 'inherit', fontSize: 16, fontWeight: 600, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 11, padding: '15px 0', cursor: 'pointer' }}>เข้างาน</button>
            <button onClick={() => action('out')} disabled={busy} style={{ flex: 1, fontFamily: 'inherit', fontSize: 16, fontWeight: 600, color: '#fff', background: '#C24036', border: 'none', borderRadius: 11, padding: '15px 0', cursor: 'pointer' }}>ออกงาน</button>
          </div>
          {toast && <div style={{ marginTop: 12, fontSize: 13, fontWeight: 500, textAlign: 'center', padding: '10px 12px', borderRadius: 9, color: toast.ok ? '#2E7D55' : '#C24036', background: toast.ok ? '#E2F1EA' : '#FBEEEC' }}>{toast.msg}</div>}
        </div>
      </div>

      {/* ติดตามตำแหน่งงาน (โฟร์แมน) */}
      <div style={{ width: 420, maxWidth: '100%', background: '#fff', border: '1px solid #E1E5EA', borderRadius: 14, padding: '14px 18px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>📍 ส่งตำแหน่งงาน (สำหรับโฟร์แมน/งานหน้างาน)</div>
        {track ? (
          <>
            <div style={{ fontSize: 12.5, color: '#2E7D55' }}>กำลังส่งตำแหน่งของ <b>{track.name}</b> ทุก 5 นาที · ส่งแล้ว {track.count} จุด · ล่าสุด {track.last}</div>
            <div style={{ fontSize: 11.5, color: '#C0852C', margin: '4px 0 10px' }}>⚠️ ต้องเปิดหน้านี้ค้างไว้ (อย่าปิดแอป/ล็อกจอนาน) ระบบถึงส่งตำแหน่งต่อเนื่อง</div>
            <button onClick={stopTrack} style={{ width: '100%', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: '#fff', background: '#C24036', border: 'none', borderRadius: 10, padding: '11px 0', cursor: 'pointer' }}>หยุดส่งตำแหน่ง</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 11.5, color: '#94A0A8', margin: '2px 0 10px' }}>เลือกชื่อ + ใส่ PIN ด้านบนก่อน แล้วกดเริ่ม — ระบบจะบันทึกตำแหน่งของคุณให้บริษัทดูได้ว่าวันนี้ไปไหนบ้าง</div>
            <button onClick={startTrack} style={{ width: '100%', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 10, padding: '11px 0', cursor: 'pointer' }}>เริ่มส่งตำแหน่งงานวันนี้</button>
          </>
        )}
      </div>

      <div style={{ fontSize: 11.5, color: '#94A0A8' }}>หน้าเช็คอินสำหรับพนักงาน — ไม่ต้องเข้าสู่ระบบ</div>
    </div>
  )
}
