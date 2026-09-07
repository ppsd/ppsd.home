import { company } from '../erpData'
import { PPSD_LOGO_FULL } from '../assets'
import { baht } from '../data'
import type { SiteDoc } from './SiteDocs'

const cell: React.CSSProperties = { padding: '9px 12px', fontSize: 12.5, border: '1px solid #E1E5EA', verticalAlign: 'top' }
const lbl: React.CSSProperties = { ...cell, color: '#5C6770', width: '22%', background: '#F7F9FB' }

// ใบเอกสารหน้างานสำหรับพิมพ์ (RFI / RFA / NCR / VO)
export default function SiteDocPrint({ doc, houseName, kindFull, onClose }: { doc: SiteDoc; houseName?: string; kindFull: string; onClose: () => void }) {
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 760, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{doc.no}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>

      <div className="print-area" style={{ maxWidth: 760, margin: '0 auto', background: '#fff', borderRadius: 6, padding: '34px 38px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, borderBottom: '2px solid #1E2E3B', paddingBottom: 14, marginBottom: 18 }}>
          <img src={PPSD_LOGO_FULL} alt="PPSD" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{company.name}</div>
            <div style={{ fontSize: 11, color: '#5C6770' }}>{company.address}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1E2E3B' }}>{doc.no.split('-')[0]}</div>
            <div className="num" style={{ fontSize: 11.5, color: '#5C6770', fontFamily: 'monospace' }}>{doc.no}</div>
            <div style={{ fontSize: 11, color: '#94A0A8' }}>{kindFull}</div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
          <tbody>
            <tr><td style={lbl}>โครงการ / บ้าน</td><td style={cell}>{houseName || doc.house_code || '-'}</td><td style={lbl}>หมวดงาน</td><td style={cell}>{doc.discipline || '-'}</td></tr>
            <tr><td style={lbl}>วันที่ออกเอกสาร</td><td style={cell}>{doc.date}</td><td style={lbl}>ผู้ออกเอกสาร</td><td style={cell}>{doc.by}</td></tr>
            <tr><td style={lbl}>{doc.kind === 'ncr' ? 'ผู้รับผิดชอบแก้ไข' : 'เรียน / ถึง'}</td><td style={cell} colSpan={3}>{doc.assignee || '-'}</td></tr>
          </tbody>
        </table>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
          <tbody>
            <tr><td style={{ ...lbl, width: '22%' }}>เรื่อง</td><td style={{ ...cell, fontWeight: 600 }}>{doc.title}</td></tr>
            <tr><td style={lbl}>{doc.kind === 'rfi' ? 'รายละเอียดคำถาม' : doc.kind === 'ncr' ? 'รายละเอียดข้อบกพร่อง' : doc.kind === 'vo' ? 'รายละเอียดงานเปลี่ยนแปลง' : 'รายละเอียด'}</td><td style={{ ...cell, whiteSpace: 'pre-wrap', minHeight: 60 }}>{doc.detail || '-'}</td></tr>
            {doc.kind === 'vo' && (
              <tr><td style={lbl}>ผลกระทบ</td><td style={cell}>ค่าก่อสร้าง: <b className="num">{doc.cost_impact ? (doc.cost_impact > 0 ? '+' : '') + baht(doc.cost_impact) : '-'}</b> · ระยะเวลา: <b>{doc.days_impact ? (doc.days_impact > 0 ? '+' : '') + doc.days_impact + ' วัน' : '-'}</b></td></tr>
            )}
          </tbody>
        </table>

        {doc.image && <img src={doc.image} alt="แนบ" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 6, border: '1px solid #E1E5EA', marginBottom: 14 }} />}

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 22 }}>
          <tbody>
            <tr><td style={{ ...lbl, width: '22%' }}>{doc.kind === 'rfi' ? 'คำตอบ / คำชี้แจง' : doc.kind === 'rfa' ? 'ผลการอนุมัติ' : doc.kind === 'ncr' ? 'วิธีแก้ไข / ผลติดตาม' : 'มติ'}</td><td style={{ ...cell, whiteSpace: 'pre-wrap', minHeight: 50 }}>{doc.response || '(รอดำเนินการ)'}</td></tr>
            <tr><td style={lbl}>สถานะ</td><td style={cell}>{doc.status}{doc.responded_by ? ` · โดย ${doc.responded_by} (${doc.responded_date})` : ''}</td></tr>
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 30, marginTop: 34 }}>
          {['ผู้ออกเอกสาร', 'ผู้ควบคุมงาน', 'ผู้อนุมัติ'].map((r) => (
            <div key={r} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ borderTop: '1px dotted #94A0A8', margin: '30px 8px 6px' }} />
              <div style={{ fontSize: 11.5, color: '#5C6770' }}>{r}</div>
              <div style={{ fontSize: 10.5, color: '#94A0A8' }}>วันที่ ......../......../........</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
