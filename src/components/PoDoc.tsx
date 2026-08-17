import { company } from '../erpData'
import { PPSD_LOGO_FULL } from '../assets'
import { baht } from '../data'
import type { ApiPO } from '../store'

const cell: React.CSSProperties = { padding: '7px 10px', fontSize: 12.5, border: '1px solid #E1E5EA' }
const hcell: React.CSSProperties = { ...cell, background: '#F7F9FB', fontWeight: 700, color: '#1C2730' }

export default function PoDoc({ po, onClose }: { po: ApiPO; onClose: () => void }) {
  const vat = Math.round(po.amount * 0.07)
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 760, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>ใบสั่งซื้อ {po.no}</div>
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
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1E2E3B' }}>ใบสั่งซื้อ (PO)</div>
            <div className="num" style={{ fontSize: 11.5, color: '#5C6770', fontFamily: 'monospace' }}>{po.no}</div>
            <div style={{ fontSize: 11.5, color: '#5C6770' }}>วันที่ {po.date}</div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
          <tbody>
            <tr><td style={{ ...cell, color: '#5C6770', width: '20%' }}>ผู้ขาย</td><td style={cell}>{po.vendor}</td><td style={{ ...cell, color: '#5C6770', width: '20%' }}>อ้างอิง PR</td><td style={cell}>{po.pr_no || '-'}</td></tr>
            <tr>
              <td style={{ ...cell, color: '#5C6770' }}>การชำระเงิน</td>
              <td style={cell}>{po.payment_type === 'credit' ? `เครดิต ${po.credit_days || 0} วัน` : 'เงินสด'}</td>
              <td style={{ ...cell, color: '#5C6770' }}>ครบกำหนดชำระ</td>
              <td style={cell}>{po.payment_type === 'credit' ? (po.due_date || '-') : '-'}</td>
            </tr>
          </tbody>
        </table>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={{ ...hcell, textAlign: 'left' }}>รายการ</th><th style={{ ...hcell, textAlign: 'right', width: 150 }}>จำนวนเงิน</th></tr></thead>
          <tbody><tr><td style={cell}>{po.item}</td><td className="num" style={{ ...cell, textAlign: 'right' }}>{po.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr></tbody>
          <tfoot>
            <tr><td style={cell}>รวมเป็นเงิน</td><td className="num" style={{ ...cell, textAlign: 'right' }}>{baht(po.amount)}</td></tr>
            <tr><td style={cell}>ภาษีมูลค่าเพิ่ม 7%</td><td className="num" style={{ ...cell, textAlign: 'right' }}>{baht(vat)}</td></tr>
            <tr><td style={{ ...hcell, textAlign: 'left' }}>ยอดสุทธิ</td><td className="num" style={{ ...hcell, textAlign: 'right', fontSize: 14 }}>{baht(po.amount + vat)}</td></tr>
          </tfoot>
        </table>

        {po.image && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: '#5C6770', marginBottom: 6 }}>รูปสินค้า</div>
            <img src={po.image} alt="สินค้า" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 8, border: '1px solid #E1E5EA' }} />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48, gap: 40 }}>
          {['ผู้สั่งซื้อ', 'ผู้อนุมัติ'].map((l, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ borderTop: '1px dotted #94A0A8', marginBottom: 7 }} />
              <div style={{ fontSize: 12, color: '#5C6770' }}>({l})</div>
              <div style={{ fontSize: 11, color: '#94A0A8', marginTop: 3 }}>วันที่ ........./........./.........</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
