import { company } from '../erpData'
import { PPSD_LOGO_FULL } from '../assets'
import { bahtText } from '../data'
import type { ApiPO } from '../store'
import ApproverSigns from './ApproverSigns'

// ใบสั่งซื้อ (PO) — เลย์เอาต์ตามแบบเอกสารบริษัท (โปรแกรมบัญชี)
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const bd = '1px solid #333'
const th: React.CSSProperties = { border: bd, padding: '5px 6px', fontSize: 12, fontWeight: 700, background: '#F2F2F2' }
const td: React.CSSProperties = { border: bd, padding: '5px 6px', fontSize: 12, verticalAlign: 'top' }

export default function PoDoc({ po, houseName, onClose }: { po: ApiPO; houseName?: string; onClose: () => void }) {
  const net = po.amount || 0
  const vat = Math.round(net * 0.07 * 100) / 100
  const grand = net + vat
  const credit = po.payment_type === 'credit' ? `เครดิต ${po.credit_days || 0} วัน` : 'เงินสด'
  const lbl: React.CSSProperties = { color: '#333', width: 78, display: 'inline-block', verticalAlign: 'top' }
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 780, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>ใบสั่งซื้อ {po.no}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>

      <div className="print-area" style={{ maxWidth: 780, margin: '0 auto', background: '#fff', color: '#1C2730', borderRadius: 4, padding: '30px 34px', boxShadow: '0 24px 70px rgba(20,30,40,.3)', fontSize: 12 }}>
        {/* หัวเอกสาร */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <img src={PPSD_LOGO_FULL} alt="PPSD" style={{ width: 54, height: 54, objectFit: 'cover' }} />
          <div style={{ flex: 1, lineHeight: 1.5 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{company.name}</div>
            <div style={{ fontSize: 11, color: '#333' }}>{company.address}</div>
            <div style={{ fontSize: 11, color: '#333' }}>โทร. {company.phone || '089-999-2474'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>ใบสั่งซื้อ</div>
            <div style={{ fontSize: 11, color: '#333', marginTop: 2 }}>ต้นฉบับ / Original</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#333', marginTop: 4, borderBottom: '2px solid #1E2E3B', paddingBottom: 8 }}>เลขประจำตัวผู้เสียภาษี / Tax ID : {String(company.taxId).replace(/\D+/g, '') || company.taxId}</div>

        {/* ผู้จำหน่าย + ข้อมูลเอกสาร */}
        <div style={{ display: 'flex', gap: 0, border: bd, borderTop: 'none', marginTop: 12 }}>
          <div style={{ flex: 1, padding: '8px 10px', borderRight: bd, lineHeight: 1.7 }}>
            <div><span style={lbl}>ผู้จำหน่าย</span><b>{po.vendor || '-'}</b></div>
            <div><span style={lbl}>อ้างอิง PR</span>{po.pr_no || '-'}</div>
            <div><span style={lbl}>การชำระ</span>{credit}</div>
          </div>
          <div style={{ width: 300, padding: '8px 10px', lineHeight: 1.7 }}>
            <div><span style={lbl}>เลขที่</span><b className="num">{po.no}</b></div>
            <div><span style={lbl}>วันที่</span><span className="num">{po.date}</span></div>
            <div><span style={lbl}>บ้าน/โครงการ</span>{houseName || '-'}</div>
            <div><span style={lbl}>ครบกำหนด</span><span className="num">{po.payment_type === 'credit' ? (po.due_date || '-') : '-'}</span></div>
          </div>
        </div>

        {/* ตารางรายการ */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 34 }}>ลำดับ</th>
              <th style={{ ...th, textAlign: 'left' }}>รหัสสินค้า / รายละเอียด</th>
              <th style={{ ...th, width: 52 }}>จำนวน</th>
              <th style={{ ...th, width: 60 }}>หน่วยละ</th>
              <th style={{ ...th, width: 60 }}>ส่วนลด</th>
              <th style={{ ...th, width: 90 }}>ราคารวมภาษี</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...td, textAlign: 'center' }} className="num">1</td>
              <td style={td}>{po.item}</td>
              <td style={{ ...td, textAlign: 'right' }} className="num">-</td>
              <td style={{ ...td, textAlign: 'right' }} className="num">-</td>
              <td style={{ ...td, textAlign: 'right' }} className="num">0.00</td>
              <td style={{ ...td, textAlign: 'right' }} className="num">{money(net)}</td>
            </tr>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}><td style={{ ...td, height: 20 }}>&nbsp;</td><td style={td} /><td style={td} /><td style={td} /><td style={td} /><td style={td} /></tr>
            ))}
          </tbody>
        </table>

        {/* สรุปยอด + ตัวอักษร */}
        <div style={{ display: 'flex', border: bd, borderTop: 'none' }}>
          <div style={{ flex: 1, padding: '8px 10px', borderRight: bd, fontSize: 11 }}>
            <div style={{ color: '#333' }}>หมายเหตุ</div>
            <div style={{ marginTop: 18, paddingTop: 6, borderTop: '1px dotted #999' }}>ตัวอักษร: <b>({bahtText(grand)})</b></div>
          </div>
          <div style={{ width: 260 }}>
            {[['ราคาสินค้า', money(net)], ['หัก ส่วนลด', '0.00'], ['ภาษีมูลค่าเพิ่ม 7%', money(vat)]].map(([l, v], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 10px', borderBottom: '1px solid #E1E5EA' }}><span style={{ color: '#333' }}>{l}</span><span className="num">{v}</span></div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: '#F2F2F2', fontWeight: 700, fontSize: 13 }}><span>จำนวนเงินรวมทั้งสิ้น</span><span className="num">{money(grand)}</span></div>
          </div>
        </div>

        {/* ลายเซ็น */}
        <div style={{ marginTop: 10, textAlign: 'center', fontSize: 11.5 }}>ในนาม <b>{company.name}</b></div>
        <ApproverSigns approval={po.approval} makerLabel="ผู้สั่งซื้อ" makerName={po.by} />
      </div>
    </div>
  )
}
