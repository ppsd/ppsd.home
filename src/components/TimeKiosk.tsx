import { useEffect, useState } from 'react'
import { useApp } from '../store'
import { api } from '../api'

const TH_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

type GeoSettings = { enabled: boolean; radius: number; lat: string; lng: string; start?: string; grace?: number; cutoff?: string }
function getGPS(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('อุปกรณ์นี้ไม่รองรับ GPS'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (err) => reject(new Error(err.code === 1 ? 'กรุณาอนุญาตการเข้าถึงตำแหน่ง (GPS) ในเบราว์เซอร์' : 'อ่านตำแหน่งไม่สำเร็จ ลองใหม่อีกครั้ง')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  })
}

export default function TimeKiosk() {
  const { data, punch, user } = useApp()
  // ดึงรายชื่อพนักงานล่าสุดทุกครั้งที่เปิดหน้าลงเวลา (กันกรณีเพิ่งเพิ่มพนักงานแล้วยังไม่ขึ้น)
  const [emps, setEmps] = useState(data.kioskEmployees)
  useEffect(() => { api.get<typeof data.kioskEmployees>('/kiosk/employees').then(setEmps).catch(() => {}) }, [])
  const employees = emps.length ? emps : data.kioskEmployees
  const [now, setNow] = useState(new Date())
  const [selCode, setSelCode] = useState('')
  const [pin, setPin] = useState('')
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [geo, setGeo] = useState<GeoSettings>({ enabled: false, radius: 200, lat: '', lng: '', start: '08:00', grace: 5, cutoff: '08:05' })
  const [cfgOpen, setCfgOpen] = useState(false)
  const [savingCfg, setSavingCfg] = useState(false)

  const loadGeo = () => api.get<GeoSettings>('/settings/attendance').then(setGeo).catch(() => {})
  useEffect(() => { loadGeo() }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // รับ PIN จากคีย์บอร์ดจริงด้วย (นอกจากแป้นเลขบนจอ) — เลข 0-9 กรอก, Backspace ลบ
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return // ไม่แย่งช่องอื่น
      if (e.key >= '0' && e.key <= '9') { setToast(null); setPin((p) => (p.length < 4 ? p + e.key : p)) }
      else if (e.key === 'Backspace') { e.preventDefault(); setPin((p) => p.slice(0, -1)) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // admin: ใช้ตำแหน่งปัจจุบันเป็นออฟฟิศ
  const useCurrentAsOffice = async () => {
    setSavingCfg(true)
    try {
      const c = await getGPS()
      await api.put('/settings/attendance', { lat: c.lat, lng: c.lng })
      await loadGeo()
      setToast({ msg: `ตั้งตำแหน่งออฟฟิศแล้ว (${c.lat.toFixed(5)}, ${c.lng.toFixed(5)})`, ok: true })
    } catch (e) { setToast({ msg: (e as Error).message, ok: false }) } finally { setSavingCfg(false) }
  }
  const saveCfg = async (patch: Partial<GeoSettings>) => {
    setSavingCfg(true)
    try { await api.put('/settings/attendance', patch); await loadGeo() } catch { /* ignore */ } finally { setSavingCfg(false) }
  }

  const emp = employees.find((e) => e.code === selCode)
  const pad = (n: number) => String(n).padStart(2, '0')
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const dateStr = `วัน${TH_DAYS[now.getDay()]}ที่ ${now.getDate()} ${TH_MONTHS[now.getMonth()]} ${now.getFullYear() + 543}`

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
      const r = await punch({ emp_code: emp.code, pin, kind, ...coords })
      setToast({ msg: `${r.name} ${kind === 'in' ? 'เข้างาน' : 'ออกงาน'} ${r.time} น.${r.status === 'สาย' ? ' (สาย)' : ''} เรียบร้อย`, ok: true })
      setPin(''); setSelCode('')
    } catch (e) {
      setToast({ msg: (e as Error).message || 'บันทึกไม่สำเร็จ', ok: false }); setPin('')
    } finally { setBusy(false) }
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clr', '0', 'del']

  const fld: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 10px', outline: 'none' }

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '12px 0' }}>
      {/* สถานะ geofence */}
      <div style={{ width: 760, maxWidth: '100%', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: geo.enabled ? '#2E7D55' : '#94A0A8', background: geo.enabled ? '#F2F8F4' : '#F7F9FB', border: `1px solid ${geo.enabled ? '#D8EBDF' : '#EEF1F4'}`, borderRadius: 10, padding: '9px 14px' }}>
        <span>{geo.enabled ? `📍 เช็คอินได้เฉพาะในรัศมี ${geo.radius} ม. จากออฟฟิศ (ต้องเปิด GPS)` : '📍 เช็คอินได้ทุกที่ (ยังไม่จำกัดตำแหน่ง)'}</span>
        {user?.role === 'admin' && <button onClick={() => setCfgOpen((v) => !v)} className="hov-f3f5f7" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '5px 11px', cursor: 'pointer' }}>⚙️ ตั้งค่าตำแหน่ง</button>}
      </div>

      {/* admin: ตั้งค่าตำแหน่งออฟฟิศ */}
      {user?.role === 'admin' && cfgOpen && (
        <div style={{ width: 760, maxWidth: '100%', background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>ตั้งค่าตำแหน่งเช็คอิน (ออฟฟิศ)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={geo.enabled} onChange={(e) => saveCfg({ enabled: e.target.checked })} />
              จำกัดให้เช็คอินเฉพาะในออฟฟิศ
            </label>
            <span style={{ fontSize: 13, color: '#5C6770' }}>รัศมี (เมตร):</span>
            <input style={{ ...fld, width: 90 }} type="number" defaultValue={geo.radius} onBlur={(e) => saveCfg({ radius: Number(e.target.value) || 200 })} />
            <button onClick={useCurrentAsOffice} disabled={savingCfg} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>📍 ใช้ตำแหน่งปัจจุบันเป็นออฟฟิศ</button>
          </div>
          <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 10 }}>
            ตำแหน่งออฟฟิศปัจจุบัน: {geo.lat && geo.lng ? <span className="num">{Number(geo.lat).toFixed(5)}, {Number(geo.lng).toFixed(5)}</span> : 'ยังไม่ได้ตั้ง'} · กดปุ่มขณะอยู่ที่ออฟฟิศเพื่อบันทึกจุด แล้วเปิด "จำกัด..."
          </div>

          <div style={{ borderTop: '1px solid #EEF1F4', margin: '14px 0 12px' }} />
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>เวลาเข้างาน / ผ่อนผันสาย</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#5C6770' }}>เข้างานเวลา:</span>
            <input style={{ ...fld, width: 110 }} type="time" defaultValue={geo.start || '08:00'} onBlur={(e) => saveCfg({ start: e.target.value })} />
            <span style={{ fontSize: 13, color: '#5C6770' }}>ผ่อนผัน:</span>
            <input style={{ ...fld, width: 80 }} type="number" min={0} max={120} defaultValue={geo.grace ?? 5} onBlur={(e) => saveCfg({ grace: Number(e.target.value) || 0 })} />
            <span style={{ fontSize: 13, color: '#5C6770' }}>นาที</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#B7791F', background: '#FBF6EC', padding: '4px 11px', borderRadius: 20 }}>เข้าหลัง {geo.cutoff || '08:05'} = สาย</span>
          </div>
        </div>
      )}

      <div style={{ width: 760, maxWidth: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 18, overflow: 'hidden', boxShadow: '0 12px 40px rgba(28,39,48,.08)' }}>
        <div style={{ background: '#1E2E3B', color: '#fff', padding: '40px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#7C8B97', letterSpacing: '.1em', marginBottom: 18 }}>ระบบลงเวลาเข้า-ออกงาน</div>
          <div className="num" style={{ fontSize: 60, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' }}>{timeStr}</div>
          <div style={{ fontSize: 14.5, color: '#AEBAC4', marginTop: 14 }}>{dateStr}</div>
          <div style={{ height: 1, background: '#2C3F4F', width: '100%', margin: '26px 0' }} />
          <div style={{ fontSize: 12.5, color: '#7C8B97', lineHeight: 1.6 }}>PPSD Construction<br />เวลาทำงาน จ.–ส. 08:00–17:00</div>
        </div>

        <div style={{ padding: '28px 28px 26px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: '#3C4750', marginBottom: 6 }}>เลือกชื่อพนักงาน</div>
          <select value={selCode} onChange={(e) => { setSelCode(e.target.value); setPin(''); setToast(null) }}
            style={{ width: '100%', fontFamily: 'inherit', fontSize: 14, color: selCode ? '#1C2730' : '#9AA6AE', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '11px 13px', outline: 'none', cursor: 'pointer' }}>
            <option value="">— เลือกชื่อ —</option>
            {employees.map((e) => <option key={e.code} value={e.code} style={{ color: '#1C2730' }}>{e.name} ({e.code})</option>)}
          </select>
          {employees.length === 0 && <div style={{ fontSize: 11.5, color: '#C0852C', marginTop: 6 }}>ยังไม่มีพนักงาน — เพิ่มที่เมนู บุคลากร/HR ก่อน</div>}

          <div style={{ fontSize: 12.5, fontWeight: 500, color: '#3C4750', margin: '14px 0 6px' }}>ใส่ PIN 4 หลัก</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ flex: 1, height: 44, borderRadius: 9, border: '1px solid #D2DAE1', background: '#F7F9FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: '#1C2730' }}>{pin[i] ? '•' : ''}</div>
            ))}
          </div>

          <div className="keep-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
            {keys.map((k) => {
              const isAction = k === 'clr' || k === 'del'
              return (
                <button key={k} onClick={() => press(k)} className="hov-f3f5f7"
                  style={{ fontFamily: 'inherit', height: 42, borderRadius: 9, border: '1px solid #E1E5EA', background: isAction ? '#F3F5F7' : '#fff', cursor: 'pointer', fontSize: isAction ? 13 : 19, fontWeight: 600, color: isAction ? '#5C6770' : '#1C2730' }}>
                  {k === 'del' ? '⌫' : k === 'clr' ? 'ล้าง' : k}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={() => action('in')} disabled={busy} style={{ flex: 1, fontFamily: 'inherit', fontSize: 16, fontWeight: 600, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 11, padding: '14px 0', cursor: 'pointer' }}>เข้างาน</button>
            <button onClick={() => action('out')} disabled={busy} style={{ flex: 1, fontFamily: 'inherit', fontSize: 16, fontWeight: 600, color: '#fff', background: '#C24036', border: 'none', borderRadius: 11, padding: '14px 0', cursor: 'pointer' }}>ออกงาน</button>
          </div>

          {toast && <div style={{ marginTop: 12, fontSize: 13, fontWeight: 500, textAlign: 'center', padding: '10px 12px', borderRadius: 9, color: toast.ok ? '#2E7D55' : '#C24036', background: toast.ok ? '#E2F1EA' : '#FBEEEC' }}>{toast.msg}</div>}
        </div>
      </div>
    </div>
  )
}
