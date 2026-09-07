import { company } from '../erpData'
import { PPSD_LOGO_FULL } from '../assets'
import type { Pms } from './Pms'

const bd = '1px solid #C9D2DA'
const h: React.CSSProperties = { padding: '5px 8px', fontSize: 11, border: bd, background: '#F2F5F8', fontWeight: 600 }
const c: React.CSSProperties = { padding: '5px 8px', fontSize: 11, border: bd }
const gradeColor = (g: string) => g === 'A' ? '#2E7D55' : g === 'B' ? '#30506A' : g === 'C' ? '#B7791F' : g === 'D' ? '#C0852C' : '#C24036'

export default function PmsPrint({ pms, onClose }: { pms: Pms; onClose: () => void }) {
  const secTable = (title: string, rows: { name: string; weight: number; score?: number; target?: number; actual?: number; rating?: number }[], kind: 'kpi' | 'rate') => (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
      <thead><tr>
        <th style={{ ...h, textAlign: 'left' }}>{title}</th><th style={{ ...h, width: 50, textAlign: 'center' }}>น้ำหนัก</th>
        {kind === 'kpi' ? <><th style={{ ...h, width: 55, textAlign: 'center' }}>เป้า%</th><th style={{ ...h, width: 55, textAlign: 'center' }}>จริง%</th></> : <th style={{ ...h, width: 60, textAlign: 'center' }}>คะแนน 1-5</th>}
        <th style={{ ...h, width: 55, textAlign: 'right' }}>คะแนน</th>
      </tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={c}>{r.name}</td>
            <td style={{ ...c, textAlign: 'center' }}>{r.weight}</td>
            {kind === 'kpi' ? <><td style={{ ...c, textAlign: 'center' }}>{r.target}</td><td style={{ ...c, textAlign: 'center' }}>{r.actual || 0}</td></> : <td style={{ ...c, textAlign: 'center' }}>{r.rating || 0}</td>}
            <td className="num" style={{ ...c, textAlign: 'right', fontWeight: 600 }}>{r.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 820, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{pms.no}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>
      <div className="print-area" style={{ maxWidth: 820, margin: '0 auto', background: '#fff', borderRadius: 6, padding: '28px 32px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, borderBottom: '2px solid #1E2E3B', paddingBottom: 12, marginBottom: 12 }}>
          <img src={PPSD_LOGO_FULL} alt="PPSD" style={{ width: 54, height: 54, borderRadius: 8, objectFit: 'cover' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{company.name}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2E3B' }}>แบบประเมินผลการปฏิบัติงานรายเดือน (PMS)</div>
            <div style={{ fontSize: 11.5, color: '#5C6770' }}>{pms.emp_name} · {pms.position || pms.template} · เดือน {pms.month}</div>
          </div>
          <div style={{ textAlign: 'right' }}><div className="num" style={{ fontSize: 12, color: '#5C6770', fontFamily: 'monospace' }}>{pms.no}</div><div style={{ fontSize: 11.5, color: '#5C6770' }}>ผู้ประเมิน {pms.evaluator}</div></div>
        </div>

        <div style={{ fontSize: 12.5, fontWeight: 600, margin: '4px 0 6px' }}>ส่วนที่ 1 · KPI (70)</div>
        {secTable('ตัวชี้วัด', pms.kpi, 'kpi')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><div style={{ fontSize: 12.5, fontWeight: 600, margin: '4px 0 6px' }}>ส่วนที่ 2 · Competency (20)</div>{secTable('หัวข้อ', pms.competency, 'rate')}</div>
          <div><div style={{ fontSize: 12.5, fontWeight: 600, margin: '4px 0 6px' }}>ส่วนที่ 3 · Behavior (10)</div>{secTable('หัวข้อ', pms.behavior, 'rate')}</div>
        </div>

        <div style={{ display: 'flex', gap: 10, margin: '6px 0 8px', alignItems: 'stretch' }}>
          {[['KPI', pms.kpi_score, 70], ['Competency', pms.comp_score, 20], ['Behavior', pms.beh_score, 10]].map(([l, v, m]) => (
            <div key={l as string} style={{ flex: 1, border: bd, borderRadius: 6, padding: '8px 10px' }}><div style={{ fontSize: 11, color: '#5C6770' }}>{l}</div><div className="num" style={{ fontSize: 16, fontWeight: 700 }}>{v} / {m}</div></div>
          ))}
          <div style={{ flex: 1, border: bd, borderRadius: 6, padding: '8px 10px' }}><div style={{ fontSize: 11, color: '#5C6770' }}>หักวินัย</div><div className="num" style={{ fontSize: 16, fontWeight: 700, color: (pms.penalty || 0) > 0 ? '#C24036' : '#1C2730' }}>−{pms.penalty || 0}</div></div>
          <div style={{ flex: 1.5, background: '#F2F5F8', border: bd, borderRadius: 6, padding: '8px 12px', display: 'flex', alignItems: 'center' }}>
            <div><div style={{ fontSize: 11, color: '#5C6770' }}>คะแนนรวมสุทธิ</div><div className="num" style={{ fontSize: 20, fontWeight: 800 }}>{pms.total}/100</div></div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}><div style={{ fontSize: 18, fontWeight: 800, color: gradeColor(pms.grade) }}>เกรด {pms.grade}</div><div style={{ fontSize: 11.5, color: '#5C6770' }}>{pms.total < 75 ? 'ต่ำกว่า 75 (ปัดตก)' : `โบนัส/ปรับเงิน ${pms.bonus_pct}%`}</div></div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#5C6770', marginBottom: 10 }}>วินัยการมาทำงาน — ขาดงาน {pms.att?.absent || 0} ครั้ง · มาสาย {pms.att?.late || 0} ครั้ง · ลา {pms.att?.leave || 0} วัน (คะแนนดิบ {pms.raw_total ?? pms.total})</div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
          <tbody>
            <tr><td style={{ ...c, background: '#F7F9FB', width: '18%' }}>จุดแข็ง</td><td style={c}>{pms.strengths || '-'}</td></tr>
            <tr><td style={{ ...c, background: '#F7F9FB' }}>จุดที่ต้องพัฒนา</td><td style={c}>{pms.improve || '-'}</td></tr>
            <tr><td style={{ ...c, background: '#F7F9FB' }}>แผนพัฒนาเดือนถัดไป</td><td style={c}>{pms.plan || '-'}</td></tr>
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 30, marginTop: 28 }}>
          {['ผู้ถูกประเมิน', 'ผู้ประเมิน', 'ผู้อนุมัติ'].map((r) => (
            <div key={r} style={{ flex: 1, textAlign: 'center' }}><div style={{ borderTop: '1px dotted #94A0A8', margin: '28px 8px 6px' }} /><div style={{ fontSize: 11, color: '#5C6770' }}>{r}</div></div>
          ))}
        </div>
      </div>
    </div>
  )
}
