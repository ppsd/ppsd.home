import { company } from '../erpData'
import { PPSD_LOGO_FULL } from '../assets'
import type { QcInspection } from './QcInspect'

const bd = '1px solid #C9D2DA'
const hcell: React.CSSProperties = { padding: '6px 8px', fontSize: 11.5, border: bd, background: '#F2F5F8', fontWeight: 600, textAlign: 'center' }
const cell: React.CSSProperties = { padding: '6px 8px', fontSize: 11.5, border: bd, verticalAlign: 'top' }

export default function QcPrint({ qc, houseName, onClose }: { qc: QcInspection; houseName?: string; onClose: () => void }) {
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 820, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{qc.no}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>

      <div className="print-area" style={{ maxWidth: 820, margin: '0 auto', background: '#fff', borderRadius: 6, padding: '30px 34px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, borderBottom: '2px solid #1E2E3B', paddingBottom: 12, marginBottom: 14 }}>
          <img src={PPSD_LOGO_FULL} alt="PPSD" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{company.name}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2E3B', marginTop: 2 }}>รายการตรวจสอบงานก่อสร้าง · {qc.category}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="num" style={{ fontSize: 12, color: '#5C6770', fontFamily: 'monospace' }}>{qc.no}</div>
            <div style={{ fontSize: 11.5, color: '#5C6770' }}>วันที่ {qc.date}</div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12, fontSize: 11.5 }}>
          <tbody>
            <tr>
              <td style={{ ...cell, background: '#F7F9FB', width: '15%' }}>ประเภทงาน</td><td style={cell}>{qc.type}</td>
              <td style={{ ...cell, background: '#F7F9FB', width: '15%' }}>โครงการ/บ้าน</td><td style={cell}>{houseName || qc.house_code || '-'}</td>
            </tr>
            <tr>
              <td style={{ ...cell, background: '#F7F9FB' }}>โซน / ชั้น</td><td style={cell}>{qc.zone || '-'}</td>
              <td style={{ ...cell, background: '#F7F9FB' }}>ผู้ตรวจ</td><td style={cell}>{qc.inspector || '-'}</td>
            </tr>
            <tr>
              <td style={{ ...cell, background: '#F7F9FB' }}>วันที่เริ่ม</td><td style={cell}>{qc.start_date || '-'}</td>
              <td style={{ ...cell, background: '#F7F9FB' }}>วันที่สิ้นสุด (กำหนดเสร็จ)</td><td style={cell}>{qc.end_date || '-'}</td>
            </tr>
          </tbody>
        </table>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...hcell, width: 34 }}>ลำดับ</th>
              <th style={{ ...hcell, textAlign: 'left' }}>รายการตรวจสอบ</th>
              <th style={{ ...hcell, width: 60 }}>อนุมัติ</th>
              <th style={{ ...hcell, width: 60 }}>แก้ไข</th>
              <th style={{ ...hcell, width: 200, textAlign: 'left' }}>รายละเอียดที่ต้องแก้ไข / หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {qc.items.map((it, i) => (
              <tr key={i}>
                <td style={{ ...cell, textAlign: 'center' }}>{i + 1}</td>
                <td style={cell}>{it.text}</td>
                <td style={{ ...cell, textAlign: 'center', color: '#2E7D55', fontWeight: 700 }}>{it.result === 'อนุมัติ' ? '✓' : ''}</td>
                <td style={{ ...cell, textAlign: 'center', color: '#C24036', fontWeight: 700 }}>{it.result === 'แก้ไข' ? '✓' : ''}</td>
                <td style={cell}>{it.fix || ''}{(it.images || []).length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {(it.images || []).map((im, j) => <img key={j} src={im} alt={'รูป ' + (j + 1)} style={{ height: 46, borderRadius: 4, border: '1px solid #C9D2DA' }} />)}
                  </div>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 30, marginTop: 30 }}>
          {['ผู้ตรวจสอบ (Reported by)', 'ผู้ทบทวน (Reviewed by)', 'ผู้อนุมัติ (Approved by)'].map((r) => (
            <div key={r} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ borderTop: '1px dotted #94A0A8', margin: '30px 8px 6px' }} />
              <div style={{ fontSize: 11, color: '#5C6770' }}>{r}</div>
              <div style={{ fontSize: 10, color: '#94A0A8' }}>วันที่ ......../......../........</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
