import { company } from '../erpData'
import { PPSD_LOGO_FULL } from '../assets'
import { bahtText } from '../data'
import type { ApiExpense } from '../store'
import ApproverSigns from './ApproverSigns'

// ใบจ่ายค่าใช้จ่ายอื่น ๆ (Other Expense / OE) — ตามแบบเอกสารบริษัท
const f2 = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const bd = '1px solid #333'

export default function ExpenseVoucher({ exp, houseName, onClose }: { exp: ApiExpense; houseName?: string; onClose: () => void }) {
  const total = exp.amount || 0                       // ยอดรวม (รวมภาษี)
  const net = Math.round((total / 1.07) * 100) / 100  // ราคาสินค้า (ก่อนภาษี)
  const vat = Math.round((total - net) * 100) / 100
  const taxId = String(company.taxId).replace(/\D+/g, '') || company.taxId
  const th: React.CSSProperties = { border: bd, padding: '4px 6px', fontSize: 10.5, fontWeight: 700, background: '#F2F2F2', textAlign: 'center' }
  const td: React.CSSProperties = { border: bd, padding: '4px 6px', fontSize: 11 }
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 740, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>ใบจ่ายค่าใช้จ่าย</div>
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
          <div style={{ fontSize: 18, fontWeight: 700, textAlign: 'right' }}>ใบจ่ายค่าใช้จ่ายอื่น ๆ</div>
        </div>

        {/* จ่ายให้ + ข้อมูลเอกสาร */}
        <div style={{ display: 'flex', border: bd, marginTop: 12 }}>
          <div style={{ flex: 1, padding: '7px 9px', borderRight: bd, lineHeight: 1.7 }}>
            <div>จ่ายให้ <b>{exp.vendor || '-'}</b></div>
            <div style={{ fontSize: 10.5, color: '#333' }}>คำอธิบาย: {exp.item || '-'}</div>
            <div style={{ fontSize: 10.5, color: '#333' }}>หมวด: {exp.cat || '-'}{houseName ? ` · บ้าน: ${houseName}` : ''}</div>
          </div>
          <div style={{ width: 230, padding: '7px 9px', lineHeight: 1.7 }}>
            <div>เลขที่ใบจ่าย <b className="num">OE-{String(exp.id).padStart(6, '0')}</b></div>
            <div>วันที่จ่าย <span className="num">{exp.date}</span></div>
          </div>
        </div>

        {/* ตาราง */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
          <thead><tr>
            <th style={{ ...th, width: 34 }}>ลำดับ</th><th style={{ ...th, textAlign: 'left' }}>รายการ / คำอธิบาย</th>
            <th style={{ ...th, width: 110 }}>แผนก / หมวด</th><th style={{ ...th, width: 100 }}>ราคารวมภาษี</th>
          </tr></thead>
          <tbody>
            <tr>
              <td style={{ ...td, textAlign: 'center' }} className="num">1</td>
              <td style={td}>{exp.item}</td>
              <td style={{ ...td, textAlign: 'center' }}>{exp.cat || '-'}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 600 }} className="num">{f2(total)}</td>
            </tr>
            {Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}><td style={{ ...td, height: 18 }}>&nbsp;</td><td style={td} /><td style={td} /><td style={td} /></tr>
            ))}
          </tbody>
        </table>

        {/* สรุปยอด */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: 280, border: bd, borderTop: 'none' }}>
            {[['รวมเป็นเงิน', f2(total)], ['จำนวนภาษีมูลค่าเพิ่ม 7%', f2(vat)], ['ราคาสินค้า', f2(net)]].map(([l, v], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 10px', borderBottom: i < 2 ? '1px solid #E1E5EA' : 'none' }}><span style={{ color: '#333' }}>{l}</span><span className="num">{v}</span></div>
            ))}
          </div>
        </div>

        {/* วิธีชำระ */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
          <thead><tr>{['เงินสด', 'ชำระโดยอื่นๆ', 'ภาษี ณ ที่จ่าย', 'ส่วนลดรับ', 'ยอดจ่ายสุทธิ'].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
          <tbody><tr>
            <td style={{ ...td, textAlign: 'right' }} className="num">{f2(total)}</td>
            <td style={{ ...td, textAlign: 'right' }} className="num">0.00</td>
            <td style={{ ...td, textAlign: 'right' }} className="num">0.00</td>
            <td style={{ ...td, textAlign: 'right' }} className="num">0.00</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 700, background: '#F2F2F2' }} className="num">{f2(total)}</td>
          </tr></tbody>
        </table>

        <div style={{ marginTop: 8, fontSize: 11 }}>ตัวอักษร: <b>({bahtText(total)})</b></div>

        <ApproverSigns approval={exp.approval} makerLabel="ผู้จัดทำ" />
      </div>
    </div>
  )
}
