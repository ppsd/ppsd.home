import { company } from '../erpData'
import { PPSD_LOGO_FULL } from '../assets'
import type { WorkOrder } from './WorkOrders'

const bd = '1px solid #C9D2DA'
const cell: React.CSSProperties = { padding: '6px 9px', fontSize: 11.5, border: bd, verticalAlign: 'top' }
const lb: React.CSSProperties = { ...cell, background: '#F7F9FB', color: '#5C6770', whiteSpace: 'nowrap' }
const sec: React.CSSProperties = { padding: '5px 9px', fontSize: 12, fontWeight: 700, background: '#1E2E3B', color: '#fff', borderRadius: 4, margin: '12px 0 6px' }

export default function WorkOrderPrint({ wo, houseName, onClose }: { wo: WorkOrder; houseName?: string; onClose: () => void }) {
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 780, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{wo.no}</div>
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
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2E3B' }}>ใบสั่งงานและควบคุมคุณภาพ (WORK ORDER & QC)</div>
          </div>
          <div style={{ textAlign: 'right' }}><div className="num" style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>{wo.no}</div><div style={{ fontSize: 11, color: '#5C6770' }}>สั่งงาน {wo.issued_date}</div></div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td style={lb}>ระดับความสำคัญ</td><td style={cell}>{wo.priority}</td><td style={lb}>กำหนดส่งงาน</td><td style={cell}>{wo.due_date || '-'} {wo.due_time || ''}</td></tr>
            <tr><td style={lb}>ผู้สั่งงาน (Reviewer)</td><td style={cell}>{wo.reviewer}</td><td style={lb}>ผู้รับผิดชอบ (Executor)</td><td style={cell}>{wo.executor || '-'} {wo.ack ? `· รับทราบ ${wo.ack_date}` : '· ยังไม่รับทราบ'}</td></tr>
            <tr><td style={lb}>ชื่องาน/โครงการ</td><td style={cell} colSpan={3}>{wo.project || '-'}{houseName ? ` (${houseName})` : ''}</td></tr>
            <tr><td style={lb}>LINE Group</td><td style={cell} colSpan={3}>{wo.line_group || '-'}</td></tr>
          </tbody>
        </table>

        <div style={sec}>1) เป้าหมายและมาตรฐาน</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td style={lb}>ขอบเขตงาน</td><td style={{ ...cell, whiteSpace: 'pre-wrap' }}>{wo.scope || '-'}</td></tr>
            <tr><td style={lb}>Definition of Done</td><td style={cell}>ความถูกต้อง: {wo.dod?.correct || '-'}<br />ความสะอาด: {wo.dod?.clean || '-'}<br />หลักฐาน: {wo.dod?.evidence || '-'}</td></tr>
            <tr><td style={lb}>งบประมาณ/ทรัพยากร</td><td style={cell}>{wo.budget || '-'}</td></tr>
          </tbody>
        </table>

        <div style={sec}>2) บันทึกการดำเนินงาน</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td style={lb}>เริ่มจริง</td><td style={cell}>{wo.exec_start || '-'}</td><td style={lb}>เสร็จจริง</td><td style={cell}>{wo.exec_end || '-'}</td><td style={lb}>รวมเวลา</td><td style={cell}>{wo.exec_total || '-'}</td></tr>
            <tr><td style={lb}>ปัญหา/อุปสรรค</td><td style={cell} colSpan={5}>{wo.obstacle || 'ไม่มี'}</td></tr>
            <tr><td style={lb}>การแก้ไข/หมายเหตุ</td><td style={cell} colSpan={5}>{wo.fix_note || '-'}</td></tr>
          </tbody>
        </table>

        <div style={sec}>3) ตรวจสอบคุณภาพ (QC)</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={{ ...lb, textAlign: 'left' }}>รายการ</th><th style={{ ...lb, width: 70, textAlign: 'center' }}>ผ่าน/ไม่ผ่าน</th><th style={{ ...lb, textAlign: 'left' }}>หมายเหตุ</th></tr></thead>
          <tbody>
            {(wo.qc || []).map((q, i) => (
              <tr key={i}><td style={cell}>{q.name}</td><td style={{ ...cell, textAlign: 'center', fontWeight: 600, color: q.pass === 'ผ่าน' ? '#2E7D55' : q.pass === 'ไม่ผ่าน' ? '#C24036' : '#94A0A8' }}>{q.pass || '-'}</td><td style={cell}>{q.note || ''}</td></tr>
            ))}
            <tr><td style={lb}>สรุปผลตรวจรับ</td><td style={cell} colSpan={2}>{wo.acceptance || '-'}{wo.acceptance_note ? ` · ${wo.acceptance_note}` : ''}</td></tr>
          </tbody>
        </table>

        <div style={sec}>4) ประเมินเพื่อพัฒนา</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td style={lb}>คะแนน (1–10)</td><td style={cell}>{wo.score || '-'}</td><td style={lb}>สถานะ</td><td style={cell}>{wo.status}</td></tr>
            <tr><td style={lb}>ทำได้ดีเยี่ยม</td><td style={cell} colSpan={3}>{wo.commendation || '-'}</td></tr>
            <tr><td style={lb}>สิ่งที่ต้องปรับปรุง</td><td style={cell} colSpan={3}>{wo.lessons || '-'}</td></tr>
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 26, marginTop: 26 }}>
          {[['ผู้สั่งงาน (Reviewer)', wo.reviewer], ['ผู้รับงาน (Executor)', wo.executor], ['ผู้ตรวจสอบ (Auditor)', '']].map(([r, n]) => (
            <div key={r} style={{ flex: 1, textAlign: 'center' }}><div style={{ borderTop: '1px dotted #94A0A8', margin: '26px 6px 6px' }} /><div style={{ fontSize: 11, color: '#5C6770' }}>{r}</div><div style={{ fontSize: 11, color: '#1C2730' }}>{n || ''}</div></div>
          ))}
        </div>
      </div>
    </div>
  )
}
