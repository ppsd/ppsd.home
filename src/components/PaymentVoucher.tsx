import { company } from '../erpData'
import { PPSD_LOGO_FULL } from '../assets'
import { bahtText } from '../data'
import type { ApiPayment } from '../store'

// ใบจ่ายเงิน (Payment Voucher / PS) — จ่ายเจ้าหนี้/ช่าง ตามแบบเอกสารบริษัท
const f2 = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const bd = '1px solid #333'

export default function PaymentVoucher({ payment, payeeAddr, note, onClose }: { payment: ApiPayment; payeeAddr?: string; note?: string; onClose: () => void }) {
  const taxId = String(company.taxId).replace(/\D+/g, '') || company.taxId
  const th: React.CSSProperties = { border: bd, padding: '4px 6px', fontSize: 10.5, fontWeight: 700, background: '#F2F2F2', textAlign: 'center' }
  const td: React.CSSProperties = { border: bd, padding: '4px 6px', fontSize: 10.5 }
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 740, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>ใบจ่ายเงิน · {payment.no}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>

      <div className="print-area" style={{ maxWidth: 740, margin: '0 auto', background: '#fff', color: '#1C2730', borderRadius: 4, padding: '28px 32px', boxShadow: '0 24px 70px rgba(20,30,40,.3)', fontSize: 11.5 }}>
        {/* หัว */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <img src={PPSD_LOGO_FULL} alt="PPSD" style={{ width: 50, height: 50, objectFit: 'cover' }} />
          <div style={{ flex: 1, lineHeight: 1.5 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{company.name}</div>
            <div style={{ fontSize: 10.5, color: '#333' }}>{company.address}</div>
            <div style={{ fontSize: 10.5, color: '#333' }}>เลขประจำตัวผู้เสียภาษี {taxId} &nbsp; (สำนักงานใหญ่)</div>
          </div>
          <div style={{ fontSize: 19, fontWeight: 700 }}>ใบจ่ายเงิน</div>
        </div>

        {/* จ่ายให้กับ + ข้อมูลเอกสาร */}
        <div style={{ display: 'flex', border: bd, marginTop: 12 }}>
          <div style={{ flex: 1, padding: '7px 9px', borderRight: bd, lineHeight: 1.7 }}>
            <div>จ่ายให้กับ <b>{payment.payee}</b></div>
            <div style={{ fontSize: 10.5, color: '#333' }}>{payeeAddr || '-'}</div>
          </div>
          <div style={{ width: 250, padding: '7px 9px', lineHeight: 1.7 }}>
            <div>เลขที่ใบจ่าย <b className="num">{payment.no}</b></div>
            <div>วันที่ <span className="num">{payment.date}</span></div>
            <div style={{ fontSize: 10.5 }}>หมายเหตุ {note || '-'}</div>
          </div>
        </div>

        {/* ตารางรายการที่จ่าย */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
          <thead><tr>
            <th style={{ ...th, width: 34 }}>ลำดับ</th><th style={{ ...th, textAlign: 'left' }}>รายการ / ประเภทเงินได้</th>
            <th style={{ ...th, width: 66 }}>วันที่</th><th style={{ ...th, width: 96 }}>จำนวนเงิน</th><th style={{ ...th, width: 96 }}>ยอดจ่าย</th>
          </tr></thead>
          <tbody>
            <tr>
              <td style={{ ...td, textAlign: 'center' }} className="num">1</td>
              <td style={td}>6. อื่นๆ (ค่าจ้าง/ค่าบริการ) — {payment.type}</td>
              <td style={{ ...td, textAlign: 'center' }} className="num">{payment.date}</td>
              <td style={{ ...td, textAlign: 'right' }} className="num">{f2(payment.gross)}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 600 }} className="num">{f2(payment.gross)}</td>
            </tr>
            {Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}><td style={{ ...td, height: 18 }}>&nbsp;</td><td style={td} /><td style={td} /><td style={td} /><td style={td} /></tr>
            ))}
            <tr>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700 }} colSpan={4}>จำนวนเงินทั้งสิ้น</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700 }} className="num">{f2(payment.gross)}</td>
            </tr>
          </tbody>
        </table>

        {/* สรุปการจ่าย */}
        <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: 'none' }}>
          <thead><tr>
            {['เงินสด', 'ชำระโดยอื่นๆ', `ภาษี ณ ที่จ่าย ${payment.wht_rate}%`, 'ส่วนลดรับ', 'ยอดจ่ายสุทธิ'].map((h, i) => (
              <th key={i} style={{ ...th, width: i === 4 ? 110 : undefined }}>{h}</th>
            ))}
          </tr></thead>
          <tbody><tr>
            <td style={{ ...td, textAlign: 'right' }} className="num">0.00</td>
            <td style={{ ...td, textAlign: 'right' }} className="num">{f2(payment.net)}</td>
            <td style={{ ...td, textAlign: 'right' }} className="num">{f2(payment.wht)}</td>
            <td style={{ ...td, textAlign: 'right' }} className="num">0.00</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 700, background: '#F2F2F2' }} className="num">{f2(payment.net)}</td>
          </tr></tbody>
        </table>

        <div style={{ marginTop: 8, fontSize: 11 }}>วันที่จ่ายเงิน <span className="num">{payment.date}</span></div>
        <div style={{ fontSize: 11 }}>ตัวอักษร: <b>({bahtText(payment.net)})</b></div>

        {/* ลายเซ็น 3 ช่อง */}
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 40, gap: 24 }}>
          {['ผู้ตรวจสอบ', 'ผู้อนุมัติ', 'ผู้รับเงิน'].map((l, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ borderTop: '1px dotted #666', marginBottom: 5 }} />
              <div style={{ fontSize: 11 }}>{l}</div>
              <div style={{ fontSize: 10, color: '#94A0A8', marginTop: 2 }}>วันที่ ..../..../....</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
