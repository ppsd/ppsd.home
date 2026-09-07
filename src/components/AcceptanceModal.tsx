import { useEffect, useState } from 'react'
import { api } from '../api'
import { company } from '../erpData'
import { PPSD_LOGO_FULL } from '../assets'
import type { ApiInstallment } from '../store'

interface Check { text: string; pass: boolean }
interface Acceptance { no: string; date: string; inspector: string; result: string; checklist: Check[]; note: string }

const DEFAULT_CHECKS = ['งานถูกต้องตรงตามแบบและข้อกำหนด', 'คุณภาพงานเรียบร้อย ไม่มีข้อบกพร่อง', 'เก็บงาน/ทำความสะอาดเรียบร้อย', 'เอกสาร/รูปถ่ายประกอบครบถ้วน']
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 10px', outline: 'none' }
const bd = '1px solid #C9D2DA'

export default function AcceptanceModal({ inst, houseName, onClose, onSaved }: { inst: ApiInstallment; houseName?: string; onClose: () => void; onSaved: () => void }) {
  const [checks, setChecks] = useState<Check[]>(DEFAULT_CHECKS.map((t) => ({ text: t, pass: true })))
  const [result, setResult] = useState('ผ่าน')
  const [inspector, setInspector] = useState('')
  const [note, setNote] = useState('')
  const [existing, setExisting] = useState<Acceptance | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.get<Acceptance | null>('/installments/' + inst.id + '/acceptance').then((a) => {
      if (a) { setExisting(a); setChecks(a.checklist?.length ? a.checklist : checks); setResult(a.result); setInspector(a.inspector); setNote(a.note); setSaved(true) }
    }).catch(() => {}) /* eslint-disable-next-line */
  }, [inst.id])

  const setCheck = (i: number, patch: Partial<Check>) => setChecks((c) => c.map((x, j) => j === i ? { ...x, ...patch } : x))
  const save = async () => {
    await api.post('/installments/' + inst.id + '/acceptance', { result, inspector, note, checklist: checks })
    setSaved(true); onSaved()
    api.get<Acceptance | null>('/installments/' + inst.id + '/acceptance').then((a) => a && setExisting(a)).catch(() => {})
  }
  const resultColor = result === 'ผ่าน' ? '#2E7D55' : result === 'ไม่ผ่าน' ? '#C24036' : '#B7791F'

  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 640, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>ตรวจรับงวดงาน · งวด {inst.no}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          {saved && <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์</button>}
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>

      <div className="print-area" style={{ maxWidth: 640, margin: '0 auto', background: '#fff', borderRadius: 8, padding: '26px 30px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, borderBottom: '2px solid #1E2E3B', paddingBottom: 12, marginBottom: 14 }}>
          <img src={PPSD_LOGO_FULL} alt="PPSD" style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{company.name}</div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1E2E3B' }}>ใบตรวจรับงวดงาน (Work Progress Acceptance)</div>
          </div>
          {existing && <div style={{ textAlign: 'right', fontSize: 11.5, color: '#5C6770' }} className="num">{existing.no}<br />{existing.date}</div>}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12, fontSize: 12.5 }}>
          <tbody>
            <tr><td style={{ padding: '6px 8px', border: bd, background: '#F7F9FB', width: '28%' }}>โครงการ / บ้าน</td><td style={{ padding: '6px 8px', border: bd }}>{houseName || inst.house_code}</td></tr>
            <tr><td style={{ padding: '6px 8px', border: bd, background: '#F7F9FB' }}>งวดที่ / รายละเอียด</td><td style={{ padding: '6px 8px', border: bd }}>งวด {inst.no} · {inst.detail}</td></tr>
          </tbody>
        </table>

        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>รายการตรวจสอบคุณภาพงาน</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginBottom: 12 }}>
          <thead><tr><th style={{ padding: '5px 8px', border: bd, background: '#F2F5F8', textAlign: 'left' }}>รายการ</th><th style={{ padding: '5px 8px', border: bd, background: '#F2F5F8', width: 70 }}>ผ่าน</th><th style={{ padding: '5px 8px', border: bd, background: '#F2F5F8', width: 70 }}>ไม่ผ่าน</th></tr></thead>
          <tbody>
            {checks.map((c, i) => (
              <tr key={i}>
                <td style={{ padding: '5px 8px', border: bd }}><input value={c.text} onChange={(e) => setCheck(i, { text: e.target.value })} style={{ fontFamily: 'inherit', color: '#1C2730', fontSize: 12, width: '100%', border: 'none', outline: 'none', background: 'transparent' }} /></td>
                <td onClick={() => setCheck(i, { pass: true })} style={{ padding: '5px 8px', border: bd, textAlign: 'center', cursor: 'pointer', color: '#2E7D55', fontWeight: 700 }}>{c.pass ? '✓' : ''}</td>
                <td onClick={() => setCheck(i, { pass: false })} style={{ padding: '5px 8px', border: bd, textAlign: 'center', cursor: 'pointer', color: '#C24036', fontWeight: 700 }}>{!c.pass ? '✓' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="no-print" onClick={() => setChecks((c) => [...c, { text: '', pass: true }])} style={{ fontFamily: 'inherit', fontSize: 12, color: '#30506A', background: '#fff', border: '1px dashed #B9C6D0', borderRadius: 7, padding: '5px 11px', cursor: 'pointer', marginBottom: 12 }}>+ เพิ่มรายการตรวจ</button>

        <div className="no-print" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div><div style={{ fontSize: 12, color: '#5C6770', marginBottom: 4 }}>ผู้ตรวจสอบ</div><input style={{ ...field, width: '100%' }} value={inspector} onChange={(e) => setInspector(e.target.value)} placeholder="ชื่อผู้ตรวจ" /></div>
          <div><div style={{ fontSize: 12, color: '#5C6770', marginBottom: 4 }}>ผลการตรวจรับ</div>
            <select style={{ ...field, width: '100%' }} value={result} onChange={(e) => setResult(e.target.value)}>
              <option>ผ่าน</option><option>ผ่านบางส่วน</option><option>ไม่ผ่าน</option>
            </select>
          </div>
        </div>
        <textarea className="no-print" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ความเห็น / รายการที่ต้องแก้ไข" style={{ ...field, width: '100%', minHeight: 50, resize: 'vertical', marginBottom: 10 }} />

        <div style={{ padding: '8px 12px', borderRadius: 8, background: result === 'ผ่าน' ? '#E2F1EA' : result === 'ไม่ผ่าน' ? '#FBEEEC' : '#F6ECD6', color: resultColor, fontWeight: 600, fontSize: 13 }}>
          ผลการตรวจรับ: {result}{result === 'ไม่ผ่าน' ? ' — ยังเบิกงวดนี้ไม่ได้' : ''} {inspector ? ` · ผู้ตรวจ ${inspector}` : ''}
        </div>
        {note && <div style={{ fontSize: 12, color: '#5C6770', marginTop: 8, whiteSpace: 'pre-wrap' }}>หมายเหตุ: {note}</div>}

        <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={save} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 20px', cursor: 'pointer' }}>{saved ? 'บันทึกใหม่' : 'บันทึกผลตรวจรับ'}</button>
        </div>
      </div>
    </div>
  )
}
