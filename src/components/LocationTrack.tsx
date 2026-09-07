import { useEffect, useState } from 'react'
import { api } from '../api'

type Pt = { id: number; emp_code: string; emp_name: string; lat: number; lng: number; ts: string; note: string }
type Summ = { emp_code: string; emp_name: string; points: number; last: string }
const td: React.CSSProperties = { padding: '9px 12px' }
const th: React.CSSProperties = { padding: '9px 12px', fontWeight: 600, color: '#5C6770', fontSize: 12 }
const hhmm = (iso: string) => { try { return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) } catch { return iso } }

type TConf = { id: number; code: string; name: string; token: string }
export default function LocationTrack({ employees }: { employees: { code: string; name: string }[] }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [emp, setEmp] = useState('')
  const [summary, setSummary] = useState<Summ[]>([])
  const [points, setPoints] = useState<Pt[]>([])
  const [setup, setSetup] = useState(false)
  const [tconf, setTconf] = useState<TConf[]>([])
  const [base, setBase] = useState(window.location.origin)
  const trackUrl = (token: string) => `${base.replace(/\/$/, '')}/api/track/${token}?lat=%LAT&lon=%LON&acc=%ACC`
  const regen = async (id: number) => {
    if (!window.confirm('สร้างลิงก์ใหม่? ลิงก์เดิมจะใช้ไม่ได้ (ต้องตั้งค่าในมือถือใหม่)')) return
    try {
      const r = await api.post<{ token: string }>(`/employees/${id}/track-token`)
      setTconf((list) => list.map((t) => (t.id === id ? { ...t, token: r.token } : t)))
    } catch (e) { alert((e as Error).message || 'ทำไม่สำเร็จ (เฉพาะแอดมิน)') }
  }

  useEffect(() => {
    if (emp) api.get<Pt[]>(`/location-log?emp=${emp}&date=${date}`).then(setPoints).catch(() => setPoints([]))
    else api.get<Summ[]>(`/location-log?date=${date}`).then(setSummary).catch(() => setSummary([]))
  }, [emp, date])
  useEffect(() => { if (setup && tconf.length === 0) api.get<TConf[]>('/track-config').then(setTconf).catch(() => {}) }, [setup, tconf.length])
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => alert('คัดลอกลิงก์แล้ว')).catch(() => {})

  const mapsRoute = points.length
    ? 'https://www.google.com/maps/dir/' + points.map((p) => `${p.lat},${p.lng}`).join('/')
    : ''

  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>ติดตามตำแหน่งพนักงานหน้างาน</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ fontFamily: 'inherit', fontSize: 13, border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 10px', outline: 'none' }} />
        <select value={emp} onChange={(e) => setEmp(e.target.value)} style={{ fontFamily: 'inherit', fontSize: 13, border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 10px', outline: 'none' }}>
          <option value="">— ดูภาพรวมทุกคน —</option>
          {employees.map((e) => <option key={e.code} value={e.code}>{e.name}</option>)}
        </select>
        {emp && points.length > 0 && <a href={mapsRoute} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#2E7D55', borderRadius: 8, padding: '8px 13px', textDecoration: 'none' }}>🗺️ ดูเส้นทางทั้งวันบนแผนที่</a>}
        <button onClick={() => setSetup((v) => !v)} className="hov-f3f5f7" style={{ marginLeft: emp && points.length > 0 ? 0 : 'auto', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '8px 13px', cursor: 'pointer' }}>⚙️ ตั้งค่าแอปติดตามเบื้องหลัง</button>
      </div>

      {setup && (
        <div style={{ background: '#F7F9FB', border: '1px solid #E1E5EA', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>ติดตามตำแหน่งต่อเนื่องตลอดวัน (แม้ล็อกจอ) ด้วยแอป GPS ฟรี</div>
          <div style={{ fontSize: 12, color: '#5C6770', lineHeight: 1.7, marginBottom: 10 }}>
            1. ให้พนักงานติดตั้งแอป <b>GPSLogger</b> (ฟรี จาก Play Store / F-Droid) บนมือถือ Android<br />
            2. ในแอป GPSLogger เปิด <b>Log to custom URL</b> → วาง <b>ลิงก์ของคนนั้น</b> (กดคัดลอกด้านล่าง) → ตั้งส่งทุก ~5 นาที<br />
            3. กด Start logging — แอปจะส่งตำแหน่งเข้าระบบเราเบื้องหลังเอง · ดูเส้นทางได้ที่หน้านี้
          </div>
          <div style={{ background: '#FFF8EC', border: '1px solid #F0E2C4', borderRadius: 8, padding: '8px 11px', marginBottom: 10, fontSize: 11.5, color: '#8A6D2F' }}>
            ⚠️ ลิงก์ต้องเป็น <b>ที่อยู่สาธารณะ</b> ที่มือถือนอกออฟฟิศเข้าถึงได้ (เช่น ลิงก์ Cloudflare) — ถ้าตอนนี้เป็น localhost/192.168 ให้แก้ช่องด้านล่างเป็น URL สาธารณะก่อนคัดลอก
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: '#5C6770', whiteSpace: 'nowrap' }}>ที่อยู่เซิร์ฟเวอร์ (public URL):</span>
            <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://xxxx.trycloudflare.com" style={{ flex: 1, fontFamily: 'monospace', fontSize: 11.5, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '6px 9px', outline: 'none' }} />
          </div>
          {tconf.map((t) => (
            <div key={t.code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #EEF1F4' }}>
              <span style={{ width: 150, fontSize: 12.5, fontWeight: 500 }}>{t.name}</span>
              <input readOnly value={trackUrl(t.token)} onFocus={(e) => e.target.select()} style={{ flex: 1, fontFamily: 'monospace', fontSize: 11, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '6px 9px', outline: 'none' }} />
              <button onClick={() => copy(trackUrl(t.token))} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '6px 10px', cursor: 'pointer' }}>คัดลอก</button>
              <button onClick={() => regen(t.id)} title="สร้างลิงก์ใหม่ (ยกเลิกลิงก์เดิม)" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#C0852C', background: '#fff', border: '1px solid #ECDCB8', borderRadius: 7, padding: '6px 10px', cursor: 'pointer' }}>↻ ใหม่</button>
            </div>
          ))}
          <div style={{ fontSize: 11, color: '#94A0A8', marginTop: 8 }}>⚠️ ลิงก์นี้เป็นความลับเฉพาะคน อย่าเปิดเผย · iPhone ใช้แอป "Overland" หรือ "GPSLogger for iOS" ตั้งค่าแบบเดียวกัน</div>
        </div>
      )}

      {!emp ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}><th style={th}>พนักงาน</th><th style={{ ...th, textAlign: 'center' }}>จำนวนจุด</th><th style={th}>ส่งล่าสุด</th><th style={{ ...th, textAlign: 'center' }}>ดู</th></tr></thead>
          <tbody>
            {summary.length === 0 && <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีข้อมูลตำแหน่งในวันนี้</td></tr>}
            {summary.map((s) => (
              <tr key={s.emp_code} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                <td style={{ ...td, fontWeight: 500 }}>{s.emp_name}</td>
                <td className="num" style={{ ...td, textAlign: 'center' }}>{s.points}</td>
                <td className="num" style={{ ...td, color: '#5C6770' }}>{hhmm(s.last)}</td>
                <td style={{ ...td, textAlign: 'center' }}><button onClick={() => setEmp(s.emp_code)} style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>ดูเส้นทาง</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}><th style={th}>เวลา</th><th style={th}>หมายเหตุ</th><th style={th}>พิกัด</th><th style={{ ...th, textAlign: 'center' }}>แผนที่</th></tr></thead>
          <tbody>
            {points.length === 0 && <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center', color: '#94A0A8' }}>ไม่มีจุดในวันนี้</td></tr>}
            {points.map((p) => (
              <tr key={p.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                <td className="num" style={{ ...td, fontWeight: 600 }}>{hhmm(p.ts)}</td>
                <td style={{ ...td, color: '#5C6770' }}>{p.note || '-'}</td>
                <td className="num" style={{ ...td, color: '#5C6770', fontSize: 12 }}>{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</td>
                <td style={{ ...td, textAlign: 'center' }}><a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#30506A' }}>เปิด</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
