import { company } from '../erpData'
import { PPSD_LOGO_FULL } from '../assets'
import type { ApiPR } from '../store'

// ใบขอซื้อ / ขอจ้าง (PR) — เลย์เอาต์ตามแบบฟอร์มบริษัท
const bd = '1px solid #333'
const f2 = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const chk = (on: boolean) => (on ? '☑' : '☐')

export default function PrApprovalDoc({ pr, onClose }: { pr: ApiPR; onClose: () => void }) {
  const approved = pr.status === 'อนุมัติ'
  const rejected = pr.status === 'ปฏิเสธ'
  const items = pr.items && pr.items.length ? pr.items : [{ desc: pr.item, qty: 0, unit: '', price: pr.amount }]
  const catLabel = ({ house: 'ตัวบ้าน', carport: 'โรงจอดรถ', road: 'ถนน/รั้ว' } as Record<string, string>)[pr.category || ''] || pr.category || ''
  const Sig = ({ role, name, sig, date }: { role: string; name?: string | null; sig?: string | null; date?: string | null }) => (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ height: 40, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>{sig && <img src={sig} alt="" style={{ maxHeight: 38, maxWidth: 150, objectFit: 'contain' }} />}</div>
      <div style={{ borderBottom: '1px dotted #666', margin: '0 10px 5px' }} />
      <div style={{ fontSize: 10.5 }}>ลงชื่อ {role}</div>
      <div style={{ fontSize: 10.5, color: '#5C6770' }}>{name || ''}</div>
      <div style={{ fontSize: 10, color: '#94A0A8', marginTop: 2 }}>วันที่ {date || '..../..../....'}</div>
    </div>
  )
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 760, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>ใบขอซื้อ / ขอจ้าง {pr.no}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>

      <div className="print-area" style={{ maxWidth: 760, margin: '0 auto', background: '#fff', color: '#1C2730', borderRadius: 4, padding: '26px 32px', boxShadow: '0 24px 70px rgba(20,30,40,.3)', fontSize: 11.5 }}>
        {/* หัว */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={PPSD_LOGO_FULL} alt="PPSD" style={{ width: 46, height: 46, objectFit: 'cover' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{company.name}</div>
            <div style={{ fontSize: 10, color: '#333' }}>{company.address}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10.5, color: '#333' }}>เลขที่ <b className="num">{pr.no}</b></div>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>ใบขอซื้อ / ขอจ้าง</div>
          <div style={{ fontSize: 11, color: '#333' }}>( PR : Purchase Requisition )</div>
        </div>

        {/* ข้อมูลหัว */}
        <div style={{ marginTop: 10, lineHeight: 1.9, fontSize: 11.5 }}>
          <div style={{ display: 'flex', gap: 20 }}>
            <span>{chk(true)} ขอซื้อ &nbsp; {chk(false)} ขอจ้าง</span>
          </div>
          <div>โครงการ / บ้าน : <b>{pr.house || '.................................'}</b></div>
          <div>เรื่องที่ขออนุมัติ : {items.map((i) => i.desc).filter(Boolean).slice(0, 2).join(', ') || '.................................'}</div>
          <div>หมวดงาน : {catLabel || '.................................'} &nbsp;&nbsp;&nbsp; ผู้ขอ : {pr.by || '..................'}</div>
        </div>

        {/* ตารางรายการ */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
          <thead>
            <tr>
              {['ลำดับ', 'รายการ', 'จำนวน', 'หน่วย', 'ราคาต่อหน่วย', 'จำนวนเงินรวม'].map((h, i) => (
                <th key={i} style={{ border: bd, padding: '4px 6px', fontSize: 11, fontWeight: 700, background: '#F2F2F2', width: [40, undefined, 54, 54, 84, 96][i], textAlign: i === 1 ? 'left' : 'center' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const amt = it.qty > 0 ? it.qty * it.price : it.price
              return (
                <tr key={i}>
                  <td style={{ border: bd, padding: '4px 6px', textAlign: 'center' }} className="num">{i + 1}</td>
                  <td style={{ border: bd, padding: '4px 6px' }}>{it.desc}</td>
                  <td style={{ border: bd, padding: '4px 6px', textAlign: 'right' }} className="num">{it.qty > 0 ? it.qty.toLocaleString() : ''}</td>
                  <td style={{ border: bd, padding: '4px 6px', textAlign: 'center' }}>{it.unit || ''}</td>
                  <td style={{ border: bd, padding: '4px 6px', textAlign: 'right' }} className="num">{it.qty > 0 ? f2(it.price) : ''}</td>
                  <td style={{ border: bd, padding: '4px 6px', textAlign: 'right', fontWeight: 600 }} className="num">{f2(amt)}</td>
                </tr>
              )
            })}
            {Array.from({ length: Math.max(0, 5 - items.length) }).map((_, i) => (
              <tr key={'e' + i}><td style={{ border: bd, height: 20 }}>&nbsp;</td><td style={{ border: bd }} /><td style={{ border: bd }} /><td style={{ border: bd }} /><td style={{ border: bd }} /><td style={{ border: bd }} /></tr>
            ))}
          </tbody>
        </table>

        {/* ตัวเลือก + สรุปยอด */}
        <div style={{ display: 'flex', border: bd, borderTop: 'none' }}>
          <div style={{ flex: 1, padding: '6px 8px', borderRight: bd, fontSize: 10.5, lineHeight: 1.9 }}>
            <div style={{ fontWeight: 600 }}>รายละเอียด</div>
            <div>{chk(false)} ไม่หักเงิน &nbsp; {chk(false)} หักเงินงวดงาน</div>
            <div>{chk(false)} เข้ารับสินค้าเอง วันที่ ......../......../........</div>
            <div>{chk(false)} ให้ร้านจัดส่งสินค้า วันที่ ......../......../........</div>
          </div>
          <div style={{ width: 260, fontSize: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 10px', borderBottom: '1px solid #E1E5EA' }}><span>รวมราคาสินค้า</span><span className="num">{f2(pr.amount)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 10px', borderBottom: '1px solid #E1E5EA', color: '#333' }}><span>หัก ณ ที่จ่าย 3% (กรณีจ้าง)</span><span className="num">-</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#F2F2F2', fontWeight: 700, fontSize: 12.5 }}><span>รวมทั้งสิ้น</span><span className="num">{f2(pr.amount)}</span></div>
          </div>
        </div>
        <div style={{ border: bd, borderTop: 'none', padding: '5px 8px', fontSize: 10.5 }}>หมายเหตุ ................................................................................................................................................</div>

        {/* ลายเซ็น 3 ช่อง */}
        <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
          <Sig role="ผู้ขอซื้อ/ขอจ้าง" name={pr.by} sig={pr.requester_sig} date={pr.date} />
          <Sig role="ฝ่ายจัดซื้อ/จัดจ้าง" />
          <Sig role="ผู้ตรวจสอบ" />
        </div>

        {/* ผลการพิจารณา */}
        <div style={{ border: bd, marginTop: 12, padding: '6px 10px', fontSize: 11.5 }}>
          <b>ผลการพิจารณา</b> &nbsp;&nbsp; {chk(approved)} อนุมัติ &nbsp;&nbsp;&nbsp; {chk(rejected)} ไม่อนุมัติ
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <Sig role="ผู้อนุมัติ" name={approved ? pr.approver : undefined} sig={approved ? pr.approver_sig : undefined} date={approved ? pr.approved_date : undefined} />
        </div>

        {!approved && !rejected && (
          <div className="no-print" style={{ marginTop: 14, fontSize: 12, color: '#B7791F', background: '#F6ECD6', borderRadius: 8, padding: '9px 14px', textAlign: 'center' }}>
            ใบขอซื้อนี้ยัง “{pr.status}” — ลายเซ็นผู้อนุมัติจะปรากฏเมื่อกดอนุมัติ
          </div>
        )}
      </div>
    </div>
  )
}
