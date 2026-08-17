import { useEffect, useState } from 'react'
import { api } from '../api'
import { useApp } from '../store'

interface Summary {
  total: number; passed: number; fixReq: number; inProg: number; passRate: number; overdue: number
  overdueList: { no: string; type: string; house: string; inspector: string; end_date: string; status: string }[]
  byHouse: { house: string; total: number; passed: number; fix: number }[]
  byInspector: { inspector: string; emp_code: string; total: number; passed: number; fix: number; passRate: number }[]
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #E1E5EA', borderRadius: 13, padding: '16px 18px' }
const th: React.CSSProperties = { padding: '9px 14px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'left' }
const td: React.CSSProperties = { padding: '9px 14px', fontSize: 13 }
const rateColor = (p: number) => p >= 90 ? '#2E7D55' : p >= 75 ? '#B7791F' : '#C24036'

export default function QcSummary({ onOpenKpi }: { onOpenKpi?: () => void }) {
  const { user } = useApp()
  const allowed = user?.username === 'thawat' || user?.name === 'ธวัช วรรณสุข' // เข้าได้เฉพาะ CEO
  const [s, setS] = useState<Summary | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  const [pin, setPin] = useState('')
  const [pinErr, setPinErr] = useState('')
  const [checking, setChecking] = useState(false)
  useEffect(() => { if (allowed && unlocked) api.get<Summary>('/qc/summary').then(setS).catch(() => setS(null)) }, [allowed, unlocked])

  const verify = async () => {
    if (!/^\d{4}$/.test(pin)) { setPinErr('กรอก PIN 4 หลัก'); return }
    setChecking(true); setPinErr('')
    try { await api.post('/verify-pin', { pin }); setUnlocked(true) } catch (e) { setPinErr((e as Error).message) } finally { setChecking(false) }
  }

  if (!allowed) return <div style={{ maxWidth: 1200, margin: '0 auto', ...card, textAlign: 'center' }}>หน้าสรุป KPI/QC ผู้บริหาร เข้าได้เฉพาะ <b>ธวัช วรรณสุข</b> เท่านั้น</div>
  if (!unlocked) return (
    <div style={{ maxWidth: 420, margin: '48px auto', ...card, padding: 34, textAlign: 'center' }}>
      <div style={{ width: 52, height: 52, borderRadius: 13, background: '#F3F5F7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#30506A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#1C2730' }}>ยืนยันตัวตนก่อนดูสรุป KPI/QC</div>
      <div style={{ fontSize: 13, color: '#5C6770', marginTop: 6, marginBottom: 16 }}>กรุณาใส่ PIN ของคุณ ({user?.name})</div>
      <input type="password" inputMode="numeric" maxLength={4} value={pin} autoFocus
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && verify()}
        placeholder="••••" style={{ width: 160, textAlign: 'center', letterSpacing: 8, fontSize: 22, fontFamily: 'inherit', color: '#1C2730', border: '1px solid #D2DAE1', borderRadius: 10, padding: '10px 12px', outline: 'none' }} />
      {pinErr && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 10 }}>{pinErr}</div>}
      <div><button onClick={verify} disabled={checking} className="btn-primary" style={{ marginTop: 16, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 10, padding: '10px 28px', cursor: 'pointer' }}>{checking ? 'กำลังตรวจสอบ…' : 'เข้าดูสรุป'}</button></div>
    </div>
  )
  if (!s) return <div style={{ maxWidth: 1200, margin: '0 auto', ...card, textAlign: 'center', color: '#94A0A8' }}>กำลังโหลดสรุป…</div>

  const stat = (label: string, value: string | number, color: string, sub?: string) => (
    <div style={card}>
      <div style={{ fontSize: 12.5, color: '#5C6770' }}>{label}</div>
      <div className="num" style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 4 }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#1C2730' }}>สรุปการตรวจงาน QC (สำหรับผู้บริหาร)</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
        {stat('ใบตรวจทั้งหมด', s.total, '#1C2730')}
        {stat('อัตราผ่าน', s.passRate + '%', rateColor(s.passRate), `ผ่าน ${s.passed} ใบ`)}
        {stat('ต้องแก้ไข', s.fixReq, '#C24036')}
        {stat('กำลังตรวจ', s.inProg, '#B7791F')}
        {stat('เลยกำหนด', s.overdue, s.overdue ? '#C24036' : '#2E7D55')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* per inspector — ผูก KPI */}
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #EEF1F4', fontSize: 13.5, fontWeight: 600 }}>ผลงานตามผู้ตรวจ (ผูก KPI)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#F7F9FB' }}><th style={th}>ผู้ตรวจ</th><th style={{ ...th, textAlign: 'center' }}>ตรวจ</th><th style={{ ...th, textAlign: 'center' }}>ผ่าน</th><th style={{ ...th, textAlign: 'center' }}>อัตราผ่าน (KPI)</th><th style={{ ...th, textAlign: 'center' }}></th></tr></thead>
            <tbody>
              {s.byInspector.length === 0 && <tr><td colSpan={5} style={{ padding: 26, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีข้อมูล</td></tr>}
              {s.byInspector.map((x) => (
                <tr key={x.inspector} style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td style={{ ...td, fontWeight: 500 }}>{x.inspector}{x.emp_code && <span style={{ fontSize: 10.5, color: '#94A0A8', marginLeft: 6 }}>{x.emp_code}</span>}</td>
                  <td className="num" style={{ ...td, textAlign: 'center' }}>{x.total}</td>
                  <td className="num" style={{ ...td, textAlign: 'center', color: '#2E7D55' }}>{x.passed}</td>
                  <td style={{ ...td, textAlign: 'center' }}><span className="num" style={{ fontWeight: 700, color: rateColor(x.passRate) }}>{x.passRate}%</span></td>
                  <td style={{ ...td, textAlign: 'center' }}>{onOpenKpi && <button onClick={onOpenKpi} title="เปิดหน้าประเมิน KPI" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '3px 9px', cursor: 'pointer' }}>→ KPI</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: '#94A0A8', padding: '8px 16px' }}>อัตราผ่านของแต่ละผู้ตรวจใช้เป็นคะแนน KPI งานตรวจ — ดึงเข้าแบบประเมินได้ที่หน้า KPI (ปุ่ม “ดึงผลงาน QC”)</div>
        </div>

        {/* per house */}
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #EEF1F4', fontSize: 13.5, fontWeight: 600 }}>ตามบ้าน / โครงการ</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#F7F9FB' }}><th style={th}>บ้าน</th><th style={{ ...th, textAlign: 'center' }}>ตรวจ</th><th style={{ ...th, textAlign: 'center' }}>ผ่าน</th><th style={{ ...th, textAlign: 'center' }}>ต้องแก้</th></tr></thead>
            <tbody>
              {s.byHouse.length === 0 && <tr><td colSpan={4} style={{ padding: 26, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีข้อมูล</td></tr>}
              {s.byHouse.map((x) => (
                <tr key={x.house} style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td style={{ ...td, fontWeight: 500 }}>{x.house}</td>
                  <td className="num" style={{ ...td, textAlign: 'center' }}>{x.total}</td>
                  <td className="num" style={{ ...td, textAlign: 'center', color: '#2E7D55' }}>{x.passed}</td>
                  <td className="num" style={{ ...td, textAlign: 'center', color: x.fix ? '#C24036' : '#94A0A8' }}>{x.fix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* overdue list */}
      {s.overdueList.length > 0 && (
        <div style={{ ...card, padding: 0, overflow: 'hidden', border: '1px solid #E7CDC9' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #F3DDD9', fontSize: 13.5, fontWeight: 600, color: '#C24036', background: '#FBF3F2' }}>⚠ ใบตรวจเลยกำหนดเสร็จ ({s.overdueList.length})</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#F7F9FB' }}><th style={th}>เลขที่</th><th style={th}>ประเภทงาน</th><th style={th}>บ้าน</th><th style={th}>ผู้ตรวจ</th><th style={th}>กำหนดเสร็จ</th><th style={{ ...th, textAlign: 'center' }}>สถานะ</th></tr></thead>
            <tbody>
              {s.overdueList.map((r) => (
                <tr key={r.no} style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td className="num" style={{ ...td, fontWeight: 600, fontFamily: 'monospace' }}>{r.no}</td>
                  <td style={td}>{r.type}</td>
                  <td style={{ ...td, color: '#5C6770' }}>{r.house}</td>
                  <td style={{ ...td, color: '#5C6770' }}>{r.inspector}</td>
                  <td className="num" style={{ ...td, color: '#C24036', fontWeight: 600 }}>{r.end_date}</td>
                  <td style={{ ...td, textAlign: 'center' }}><span style={{ fontSize: 11, fontWeight: 600, color: '#B7791F', background: '#F6ECD6', padding: '2px 10px', borderRadius: 20 }}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
