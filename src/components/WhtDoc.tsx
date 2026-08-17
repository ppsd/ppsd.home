import { company } from '../erpData'
import { PPSD_LOGO_FULL } from '../assets'
import type { ApiPayment } from '../store'

const cell: React.CSSProperties = { padding: '7px 10px', fontSize: 12.5, border: '1px solid #E1E5EA' }
const hcell: React.CSSProperties = { ...cell, background: '#F7F9FB', fontWeight: 700, color: '#1C2730' }
const f2 = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) — generated from a real payment record
// payeeSignature: ลายเซ็นของผู้รับเงิน (ดึงมาถ้าผู้รับเงินเป็นพนักงานเรา)
export default function WhtDoc({ payment, payeeSignature, onClose }: { payment: ApiPayment; payeeSignature?: string | null; onClose: () => void }) {
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 760, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>50 ทวิ · {payment.no}</div>
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
            <div style={{ fontSize: 11, color: '#5C6770' }}>{company.taxId}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2E3B' }}>หนังสือรับรองการหักภาษี ณ ที่จ่าย</div>
            <div style={{ fontSize: 12, color: '#5C6770' }}>(50 ทวิ) · {payment.type}</div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
          <tbody>
            <tr><td style={{ ...cell, color: '#5C6770', width: '22%' }}>ผู้มีหน้าที่หักภาษี</td><td style={cell} colSpan={3}>{company.name}</td></tr>
            <tr><td style={{ ...cell, color: '#5C6770' }}>ผู้ถูกหักภาษี</td><td style={cell}>{payment.payee}</td><td style={{ ...cell, color: '#5C6770' }}>เลขที่</td><td className="num" style={cell}>{payment.no}</td></tr>
            <tr><td style={{ ...cell, color: '#5C6770' }}>วันที่จ่าย</td><td style={cell}>{payment.date}</td><td style={{ ...cell, color: '#5C6770' }}>แบบยื่น</td><td style={cell}>{payment.type}</td></tr>
          </tbody>
        </table>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...hcell, textAlign: 'left' }}>ประเภทเงินได้</th>
            <th style={{ ...hcell, textAlign: 'right', width: 140 }}>จำนวนเงิน</th>
            <th style={{ ...hcell, textAlign: 'center', width: 70 }}>อัตรา</th>
            <th style={{ ...hcell, textAlign: 'right', width: 140 }}>ภาษีที่หัก</th>
          </tr></thead>
          <tbody><tr>
            <td style={cell}>ค่าจ้าง/บริการ</td>
            <td className="num" style={{ ...cell, textAlign: 'right' }}>{f2(payment.gross)}</td>
            <td className="num" style={{ ...cell, textAlign: 'center' }}>{payment.wht_rate}%</td>
            <td className="num" style={{ ...cell, textAlign: 'right' }}>{f2(payment.wht)}</td>
          </tr></tbody>
          <tfoot><tr>
            <td style={{ ...hcell, textAlign: 'left' }}>รวม</td>
            <td className="num" style={{ ...hcell, textAlign: 'right' }}>{f2(payment.gross)}</td>
            <td style={hcell}></td>
            <td className="num" style={{ ...hcell, textAlign: 'right', color: '#C0852C' }}>{f2(payment.wht)}</td>
          </tr></tfoot>
        </table>

        <div style={{ marginTop: 12, fontSize: 11.5, color: '#5C6770' }}>จ่ายสุทธิ {f2(payment.net)} บาท · ผู้จ่ายเงินออกหนังสือรับรองให้ตลอดไป</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 30, marginTop: 44 }}>
          <div style={{ width: 240, textAlign: 'center' }}>
            {payeeSignature
              ? <img src={payeeSignature} alt="ลายเซ็นผู้รับเงิน" style={{ height: 46, maxWidth: 200, objectFit: 'contain', display: 'block', margin: '0 auto 2px' }} />
              : <div style={{ height: 46 }} />}
            <div style={{ borderTop: '1px dotted #94A0A8', marginBottom: 7 }} />
            <div style={{ fontSize: 12, color: '#5C6770' }}>(ผู้รับเงิน)</div>
            <div style={{ fontSize: 11.5, color: '#1C2730' }}>{payment.payee}</div>
            <div style={{ fontSize: 11, color: '#94A0A8', marginTop: 3 }}>วันที่ ........./........./.........</div>
          </div>
          <div style={{ width: 240, textAlign: 'center' }}>
            <div style={{ height: 46 }} />
            <div style={{ borderTop: '1px dotted #94A0A8', marginBottom: 7 }} />
            <div style={{ fontSize: 12, color: '#5C6770' }}>(ผู้มีหน้าที่หักภาษี ณ ที่จ่าย)</div>
            <div style={{ fontSize: 11, color: '#94A0A8', marginTop: 3 }}>วันที่ ........./........./.........</div>
          </div>
        </div>
      </div>
    </div>
  )
}
