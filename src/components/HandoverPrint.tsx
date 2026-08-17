import { company } from '../erpData'
import { PPSD_LOGO_FULL } from '../assets'
import { baht } from '../data'
import type { HandoverDoc } from './Handover'

const bd = '1px solid #C9D2DA'
const cell: React.CSSProperties = { padding: '6px 9px', fontSize: 11.5, border: bd, verticalAlign: 'top' }
const lb: React.CSSProperties = { ...cell, background: '#F7F9FB', color: '#5C6770', whiteSpace: 'nowrap' }
const sec: React.CSSProperties = { padding: '5px 9px', fontSize: 12, fontWeight: 700, background: '#1E2E3B', color: '#fff', borderRadius: 4, margin: '12px 0 6px' }

export default function HandoverPrint({ doc, houseName, onClose }: { doc: HandoverDoc; houseName?: string; onClose: () => void }) {
  const d = doc.data as Record<string, unknown>
  const str = (k: string) => (d[k] == null ? '' : String(d[k]))
  const isCert = doc.kind === 'certificate'
  const items = (d.items || []) as { name: string; pass: boolean }[]
  const defaultStatement = `บริษัทฯ ขอรับรองว่า ${str('contractor') || '..........'} ได้ดำเนินงาน “${str('project') || doc.title || '..........'}” มูลค่างาน ${baht(Number(d.value) || 0)} ในช่วง ${str('period') || '..........'} แล้วเสร็จเรียบร้อย ผลงานอยู่ในระดับ “${str('rating') || 'ดี'}” จึงออกหนังสือรับรองฉบับนี้ไว้เพื่อเป็นหลักฐาน`
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 780, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{doc.no}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>

      <div className="print-area" style={{ maxWidth: 780, margin: '0 auto', background: '#fff', borderRadius: 6, padding: '28px 32px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, borderBottom: '2px solid #1E2E3B', paddingBottom: 12, marginBottom: 12 }}>
          <img src={PPSD_LOGO_FULL} alt="PPSD" style={{ width: 54, height: 54, borderRadius: 8, objectFit: 'cover' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{company.name}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2E3B' }}>{isCert ? 'หนังสือรับรองผลงาน (WORK CERTIFICATE)' : 'ใบส่งมอบงาน (WORK HANDOVER)'}</div>
          </div>
          <div style={{ textAlign: 'right' }}><div className="num" style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>{doc.no}</div><div style={{ fontSize: 11, color: '#5C6770' }}>วันที่ {doc.date}</div></div>
        </div>

        {isCert ? (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr><td style={lb}>ผู้รับการรับรอง</td><td style={cell}>{str('contractor') || '-'}</td><td style={lb}>มูลค่างาน</td><td style={cell}>{baht(Number(d.value) || 0)}</td></tr>
                <tr><td style={lb}>โครงการ/งาน</td><td style={cell}>{str('project') || doc.title || '-'}{houseName ? ` (${houseName})` : ''}</td><td style={lb}>ระยะเวลา</td><td style={cell}>{str('period') || '-'}</td></tr>
                <tr><td style={lb}>ขอบเขตงาน</td><td style={cell} colSpan={3}>{str('scope') || '-'}</td></tr>
                <tr><td style={lb}>ระดับผลงาน</td><td style={cell} colSpan={3}><b>{str('rating') || '-'}</b></td></tr>
              </tbody>
            </table>
            <div style={sec}>คำรับรอง</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.9, textIndent: 32, whiteSpace: 'pre-wrap' }}>{str('statement') || defaultStatement}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 40 }}>
              <div style={{ textAlign: 'center', width: 260 }}>
                <div style={{ borderTop: '1px dotted #94A0A8', margin: '26px 6px 6px' }} />
                <div style={{ fontSize: 12, fontWeight: 600 }}>{str('issuer') || ''}</div>
                <div style={{ fontSize: 11, color: '#5C6770' }}>{str('issuer_role') || 'ผู้มีอำนาจลงนาม'}</div>
                <div style={{ fontSize: 11, color: '#5C6770' }}>{company.name}</div>
              </div>
            </div>
          </>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr><td style={lb}>บ้าน/โครงการ</td><td style={cell}>{houseName || '-'}</td><td style={lb}>งวด/ขอบเขตงาน</td><td style={cell}>{str('scope') || '-'}</td></tr>
                <tr><td style={lb}>เรื่อง</td><td style={cell}>{doc.title || '-'}</td><td style={lb}>การรับประกัน</td><td style={cell}>{str('warranty') || '-'}</td></tr>
              </tbody>
            </table>
            <div style={sec}>รายการตรวจรับงาน</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...lb, textAlign: 'left', width: 30 }}>#</th><th style={{ ...lb, textAlign: 'left' }}>รายการ</th><th style={{ ...lb, width: 90, textAlign: 'center' }}>ผลตรวจ</th></tr></thead>
              <tbody>
                {items.length === 0 && <tr><td style={cell} colSpan={3}>-</td></tr>}
                {items.map((it, i) => (
                  <tr key={i}><td style={{ ...cell, textAlign: 'center' }}>{i + 1}</td><td style={cell}>{it.name}</td><td style={{ ...cell, textAlign: 'center', fontWeight: 600, color: it.pass ? '#2E7D55' : '#C24036' }}>{it.pass ? '✓ ผ่าน' : '✗ ไม่ผ่าน'}</td></tr>
                ))}
              </tbody>
            </table>
            {str('defects') && <><div style={sec}>ข้อบกพร่องที่ต้องแก้ไข</div><div style={{ fontSize: 11.5, whiteSpace: 'pre-wrap', padding: '2px 4px' }}>{str('defects')}</div></>}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 26, marginTop: 34 }}>
              {[['ผู้ส่งมอบงาน', str('deliver_by')], ['ผู้รับมอบงาน', str('deliver_to')], ['พยาน', '']].map(([r, n]) => (
                <div key={r} style={{ flex: 1, textAlign: 'center' }}><div style={{ borderTop: '1px dotted #94A0A8', margin: '26px 6px 6px' }} /><div style={{ fontSize: 11, color: '#5C6770' }}>{r}</div><div style={{ fontSize: 11, color: '#1C2730' }}>{n || ''}</div></div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
