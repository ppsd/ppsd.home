import { company } from '../erpData'
import { PPSD_LOGO_FULL } from '../assets'
import { baht } from '../data'
import { useApp } from '../store'
import type { ApiSalesDoc, SalesItem } from '../store'

const TITLE: Record<string, string> = { quote: 'ใบเสนอราคา', invoice: 'ใบแจ้งหนี้', receipt: 'ใบเสร็จรับเงิน' }
const cell: React.CSSProperties = { padding: '7px 10px', fontSize: 12.5, border: '1px solid #E1E5EA' }
const hcell: React.CSSProperties = { ...cell, background: '#F7F9FB', fontWeight: 700, color: '#1C2730' }

export default function SalesDocPrint({ doc, onClose }: { doc: ApiSalesDoc; onClose: () => void }) {
  const houseName = useApp().data.houses.find((h) => h.code === doc.house_code)?.name
  let items: SalesItem[] = []
  try { items = JSON.parse(doc.items) } catch { /* ignore */ }

  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 760, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{TITLE[doc.type]} {doc.no}</div>
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
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1E2E3B' }}>{TITLE[doc.type]}</div>
            <div className="num" style={{ fontSize: 11.5, color: '#5C6770', fontFamily: 'monospace' }}>{doc.no}</div>
            <div style={{ fontSize: 11.5, color: '#5C6770' }}>วันที่ {doc.date}</div>
          </div>
        </div>

        <div style={{ marginBottom: 14, fontSize: 12.5 }}>
          <span style={{ color: '#5C6770' }}>ลูกค้า: </span><span style={{ fontWeight: 600 }}>{doc.customer}</span>
          {houseName && <span style={{ marginLeft: 18 }}><span style={{ color: '#5C6770' }}>โครงการ/บ้าน: </span><span style={{ fontWeight: 600 }}>{houseName}</span></span>}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...hcell, textAlign: 'left' }}>รายการ</th>
              <th style={{ ...hcell, textAlign: 'center', width: 70 }}>จำนวน</th>
              <th style={{ ...hcell, textAlign: 'right', width: 120 }}>ราคา/หน่วย</th>
              <th style={{ ...hcell, textAlign: 'right', width: 130 }}>จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td style={cell}>{it.desc}</td>
                <td className="num" style={{ ...cell, textAlign: 'center' }}>{it.qty}</td>
                <td className="num" style={{ ...cell, textAlign: 'right' }}>{Number(it.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td className="num" style={{ ...cell, textAlign: 'right' }}>{(Number(it.qty) * Number(it.price)).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td style={cell} colSpan={3}>รวมเป็นเงิน</td><td className="num" style={{ ...cell, textAlign: 'right' }}>{baht(doc.subtotal)}</td></tr>
            <tr><td style={cell} colSpan={3}>ภาษีมูลค่าเพิ่ม 7%</td><td className="num" style={{ ...cell, textAlign: 'right' }}>{baht(doc.vat)}</td></tr>
            <tr><td style={{ ...hcell, textAlign: 'left' }} colSpan={3}>ยอดสุทธิ</td><td className="num" style={{ ...hcell, textAlign: 'right', fontSize: 14 }}>{baht(doc.total)}</td></tr>
          </tfoot>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48, gap: 40 }}>
          {['ลูกค้า', doc.type === 'receipt' ? 'ผู้รับเงิน' : 'ผู้เสนอราคา'].map((l, i) => (
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
