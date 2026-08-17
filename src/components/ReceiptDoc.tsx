import { company } from '../erpData'
import { PPSD_LOGO_FULL } from '../assets'
import { baht } from '../data'
import type { ApiInstallment } from '../store'

const cell: React.CSSProperties = { padding: '8px 11px', fontSize: 12.5, border: '1px solid #E1E5EA' }

// ใบเสร็จรับเงิน — ออกตอนเก็บเงินงวดจากลูกค้า
export default function ReceiptDoc({ inst, houseName, customer, onClose }: { inst: ApiInstallment; houseName: string; customer: string; onClose: () => void }) {
  const no = `RC-${String((new Date().getFullYear() + 543) % 100).padStart(2, '0')}-${String(inst.id).padStart(4, '0')}`
  const received = (inst.paid || 0) > 0 ? (inst.paid as number) : inst.amount
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 720, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>ใบเสร็จรับเงิน {no}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>

      <div className="print-area" style={{ maxWidth: 720, margin: '0 auto', background: '#fff', borderRadius: 6, padding: '34px 38px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, borderBottom: '2px solid #1E2E3B', paddingBottom: 14, marginBottom: 18 }}>
          <img src={PPSD_LOGO_FULL} alt="PPSD" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{company.name}</div>
            <div style={{ fontSize: 11, color: '#5C6770' }}>{company.address}</div>
            <div style={{ fontSize: 11, color: '#5C6770' }}>{company.taxId}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1E2E3B' }}>ใบเสร็จรับเงิน</div>
            <div className="num" style={{ fontSize: 11.5, color: '#5C6770', fontFamily: 'monospace' }}>{no}</div>
            <div style={{ fontSize: 11.5, color: '#5C6770' }}>วันที่ {inst.due || '-'}</div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
          <tbody>
            <tr><td style={{ ...cell, color: '#5C6770', width: '20%' }}>ได้รับเงินจาก</td><td style={cell}>{customer || '-'}</td></tr>
            <tr><td style={{ ...cell, color: '#5C6770' }}>โครงการ / บ้าน</td><td style={cell}>{houseName || inst.house_code}</td></tr>
          </tbody>
        </table>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={{ ...cell, background: '#F7F9FB', fontWeight: 700, textAlign: 'left' }}>รายการ</th><th style={{ ...cell, background: '#F7F9FB', fontWeight: 700, textAlign: 'right', width: 160 }}>จำนวนเงิน</th></tr></thead>
          <tbody>
            <tr><td style={cell}>งวดที่ {inst.no} · {inst.detail}{received < inst.amount ? ` (รับบางส่วน จากยอดงวด ${baht(inst.amount)})` : ''}</td><td className="num" style={{ ...cell, textAlign: 'right' }}>{received.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          </tbody>
          <tfoot>
            <tr><td style={{ ...cell, fontWeight: 700, background: '#F7F9FB' }}>รวมเป็นเงินทั้งสิ้น</td><td className="num" style={{ ...cell, textAlign: 'right', fontWeight: 700, fontSize: 14, background: '#F7F9FB' }}>{baht(received)}</td></tr>
          </tfoot>
        </table>

        <div style={{ marginTop: 10, fontSize: 12, color: '#5C6770' }}>สถานะ: {inst.status === 'เก็บแล้ว' ? 'ชำระแล้ว' : inst.status}</div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 48, gap: 40 }}>
          <div style={{ width: 240, textAlign: 'center' }}>
            <div style={{ borderTop: '1px dotted #94A0A8', marginBottom: 7 }} />
            <div style={{ fontSize: 12, color: '#5C6770' }}>(ผู้รับเงิน / ฝ่ายการเงิน)</div>
            <div style={{ fontSize: 11, color: '#94A0A8', marginTop: 3 }}>วันที่ ........./........./.........</div>
          </div>
        </div>
      </div>
    </div>
  )
}
