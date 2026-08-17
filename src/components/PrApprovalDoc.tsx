import { company } from '../erpData'
import { PPSD_LOGO_FULL } from '../assets'
import { baht } from '../data'
import type { ApiPR } from '../store'

// Printable PR / approval slip showing the requester's and approver's signatures.
export default function PrApprovalDoc({ pr, onClose }: { pr: ApiPR; onClose: () => void }) {
  const approved = pr.status === 'อนุมัติ'

  const SignBlock = ({ role, name, sig, date }: { role: string; name?: string | null; sig?: string | null; date?: string | null }) => (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {sig ? <img src={sig} alt="ลายเซ็น" style={{ maxHeight: 56, maxWidth: 180, objectFit: 'contain' }} /> : <span style={{ fontSize: 11, color: '#94A0A8' }}>(ยังไม่มีลายเซ็น)</span>}
      </div>
      <div style={{ borderTop: '1px dotted #94A0A8', margin: '0 18px 7px' }} />
      <div style={{ fontSize: 12, color: '#1C2730', fontWeight: 500 }}>{role}</div>
      <div style={{ fontSize: 12, color: '#5C6770' }}>{name || '............................'}</div>
      <div style={{ fontSize: 11, color: '#94A0A8', marginTop: 2 }}>วันที่ {date || '........./........./.........'}</div>
    </div>
  )

  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 760, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>ใบขอซื้อ / อนุมัติ {pr.no}</div>
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
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2E3B' }}>ใบขอซื้อ (PR)</div>
            <div className="num" style={{ fontSize: 11.5, color: '#5C6770', fontFamily: 'monospace' }}>{pr.no}</div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <tbody>
            <tr>
              <td style={{ padding: '7px 10px', fontSize: 12, color: '#5C6770', border: '1px solid #E1E5EA', width: '22%' }}>วันที่ขอ</td>
              <td style={{ padding: '7px 10px', fontSize: 12.5, border: '1px solid #E1E5EA' }}>{pr.date}</td>
              <td style={{ padding: '7px 10px', fontSize: 12, color: '#5C6770', border: '1px solid #E1E5EA', width: '22%' }}>บ้าน / หมวด</td>
              <td style={{ padding: '7px 10px', fontSize: 12.5, border: '1px solid #E1E5EA' }}>{pr.house || '-'}{pr.category ? ` · ${({ house: 'ตัวบ้าน', carport: 'โรงจอดรถ', road: 'ถนน/รั้ว' })[pr.category] || ''}` : ''}</td>
            </tr>
            <tr>
              <td style={{ padding: '7px 10px', fontSize: 12, color: '#5C6770', border: '1px solid #E1E5EA' }}>สถานะ</td>
              <td style={{ padding: '7px 10px', fontSize: 12.5, fontWeight: 600, border: '1px solid #E1E5EA', color: approved ? '#2E7D55' : pr.status === 'ปฏิเสธ' ? '#C24036' : '#B7791F' }} colSpan={3}>{pr.status}</td>
            </tr>
          </tbody>
        </table>

        {/* รายการสินค้า (หลายรายการในใบเดียว) */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead>
            <tr style={{ background: '#F7F9FB' }}>
              <th style={{ padding: '7px 10px', fontSize: 11.5, color: '#5C6770', border: '1px solid #E1E5EA', width: 34, textAlign: 'center' }}>#</th>
              <th style={{ padding: '7px 10px', fontSize: 11.5, color: '#5C6770', border: '1px solid #E1E5EA', textAlign: 'left' }}>รายการ</th>
              <th style={{ padding: '7px 10px', fontSize: 11.5, color: '#5C6770', border: '1px solid #E1E5EA', textAlign: 'right', width: 60 }}>จำนวน</th>
              <th style={{ padding: '7px 10px', fontSize: 11.5, color: '#5C6770', border: '1px solid #E1E5EA', width: 60 }}>หน่วย</th>
              <th style={{ padding: '7px 10px', fontSize: 11.5, color: '#5C6770', border: '1px solid #E1E5EA', textAlign: 'right', width: 100 }}>ราคา/หน่วย</th>
              <th style={{ padding: '7px 10px', fontSize: 11.5, color: '#5C6770', border: '1px solid #E1E5EA', textAlign: 'right', width: 110 }}>รวม</th>
            </tr>
          </thead>
          <tbody>
            {(pr.items && pr.items.length ? pr.items : [{ desc: pr.item, qty: 0, unit: '', price: pr.amount }]).map((it, i) => {
              const amt = it.qty > 0 ? it.qty * it.price : it.price
              return (
                <tr key={i}>
                  <td style={{ padding: '7px 10px', fontSize: 12, border: '1px solid #E1E5EA', textAlign: 'center', color: '#94A0A8' }}>{i + 1}</td>
                  <td style={{ padding: '7px 10px', fontSize: 12.5, border: '1px solid #E1E5EA' }}>{it.desc}</td>
                  <td className="num" style={{ padding: '7px 10px', fontSize: 12.5, border: '1px solid #E1E5EA', textAlign: 'right' }}>{it.qty > 0 ? it.qty.toLocaleString() : '-'}</td>
                  <td style={{ padding: '7px 10px', fontSize: 12.5, border: '1px solid #E1E5EA' }}>{it.unit || '-'}</td>
                  <td className="num" style={{ padding: '7px 10px', fontSize: 12.5, border: '1px solid #E1E5EA', textAlign: 'right' }}>{it.qty > 0 ? baht(it.price) : '-'}</td>
                  <td className="num" style={{ padding: '7px 10px', fontSize: 12.5, border: '1px solid #E1E5EA', textAlign: 'right', fontWeight: 600 }}>{baht(amt)}</td>
                </tr>
              )
            })}
            <tr style={{ background: '#F7F9FB' }}>
              <td colSpan={5} style={{ padding: '8px 10px', fontSize: 12.5, fontWeight: 600, border: '1px solid #E1E5EA', textAlign: 'right' }}>รวมทั้งสิ้น</td>
              <td className="num" style={{ padding: '8px 10px', fontSize: 13.5, fontWeight: 700, border: '1px solid #E1E5EA', textAlign: 'right' }}>{baht(pr.amount)}</td>
            </tr>
          </tbody>
        </table>

        {(() => { const imgs = pr.images && pr.images.length ? pr.images : (pr.image ? [pr.image] : []); return imgs.length ? (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#5C6770', marginBottom: 6 }}>รูปสินค้า{imgs.length > 1 ? ` (${imgs.length} รูป)` : ''}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {imgs.map((im, i) => <img key={i} src={im} alt={'สินค้า ' + (i + 1)} style={{ maxWidth: imgs.length > 1 ? '32%' : '100%', maxHeight: 240, borderRadius: 8, border: '1px solid #E1E5EA' }} />)}
            </div>
          </div>
        ) : null })()}

        <div style={{ display: 'flex', gap: 20, marginTop: 36 }}>
          <SignBlock role="ผู้ขอซื้อ" name={pr.by} sig={pr.requester_sig} date={pr.date} />
          <SignBlock role="ผู้อนุมัติ" name={approved ? pr.approver : undefined} sig={approved ? pr.approver_sig : undefined} date={approved ? pr.approved_date : undefined} />
        </div>

        {!approved && (
          <div className="no-print" style={{ marginTop: 18, fontSize: 12, color: '#B7791F', background: '#F6ECD6', borderRadius: 8, padding: '9px 14px', textAlign: 'center' }}>
            ใบขอซื้อนี้ยัง “{pr.status}” — ลายเซ็นผู้อนุมัติจะปรากฏเมื่อกดอนุมัติ
          </div>
        )}
      </div>
    </div>
  )
}
