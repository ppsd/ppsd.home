import { company } from '../erpData'
import { PPSD_LOGO_FULL } from '../assets'
import type { SiteReport } from './SiteReports'

const bd = '1px solid #C9D2DA'

export default function SiteReportPrint({ report, houseName, fields, onClose }: { report: SiteReport; houseName?: string; fields: { k: string; label: string }[]; onClose: () => void }) {
  const title = report.kind === 'daily' ? 'รายงานประจำวัน (Daily Report)' : 'รายงานประจำสัปดาห์ (Weekly Report)'
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 760, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{report.no}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>

      <div className="print-area" style={{ maxWidth: 760, margin: '0 auto', background: '#fff', borderRadius: 6, padding: '30px 34px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, borderBottom: '2px solid #1E2E3B', paddingBottom: 12, marginBottom: 14 }}>
          <img src={PPSD_LOGO_FULL} alt="PPSD" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{company.name}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2E3B', marginTop: 2 }}>{title}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="num" style={{ fontSize: 12, color: '#5C6770', fontFamily: 'monospace' }}>{report.no}</div>
            <div style={{ fontSize: 11.5, color: '#5C6770' }}>วันที่ {report.date}</div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10, fontSize: 12 }}>
          <tbody>
            <tr><td style={{ padding: '6px 8px', border: bd, background: '#F7F9FB', width: '22%' }}>โครงการ / บ้าน</td><td style={{ padding: '6px 8px', border: bd }} colSpan={3}>{houseName || report.house_code || '-'}</td></tr>
          </tbody>
        </table>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <tbody>
            {fields.map((f) => (
              <tr key={f.k}>
                <td style={{ padding: '7px 8px', border: bd, background: '#F7F9FB', width: '30%', verticalAlign: 'top' }}>{f.label}</td>
                <td style={{ padding: '7px 8px', border: bd, whiteSpace: 'pre-wrap' }}>{report.data[f.k] || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 30, marginTop: 30 }}>
          {['ผู้รายงาน (Reported by)', 'ผู้อนุมัติ (Approved by)'].map((r) => (
            <div key={r} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ borderTop: '1px dotted #94A0A8', margin: '30px 20px 6px' }} />
              <div style={{ fontSize: 11, color: '#5C6770' }}>{r}</div>
              <div style={{ fontSize: 10, color: '#94A0A8' }}>วันที่ ......../......../........</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
