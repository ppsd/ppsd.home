import { company } from '../erpData'
import { PPSD_LOGO_FULL } from '../assets'
import type { ApiPR } from '../store'
import ApproverSigns from './ApproverSigns'
import { catLabelOf } from '../data'

// ใบขอซื้อ / ขอจ้าง (PR) — เลย์เอาต์ตามแบบฟอร์มบริษัท
const bd = '1px solid #333'
const f2 = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const chk = (on: boolean) => (on ? '☑' : '☐')

// standalone = หน้าเอกสารเปล่าๆ (ไม่มีฉากหลัง/ปุ่ม) ใช้ให้ระบบถ่ายรูปใบส่งเข้า LINE
export default function PrApprovalDoc({ pr, onClose, standalone }: { pr: ApiPR; onClose: () => void; standalone?: boolean }) {
  // ดูจากผลอนุมัติจริง (จำนวนคนที่กดครบตามกติกา) ก่อน — สถานะในใบอาจค้างถ้ากติกาจำนวนผู้อนุมัติเปลี่ยนหลังกดไปแล้ว
  const approved = !!pr.approval?.done || pr.status === 'อนุมัติ'
  const rejected = !!pr.approval?.rejected || pr.status === 'ปฏิเสธ'
  const items = pr.items && pr.items.length ? pr.items : [{ desc: pr.item, qty: 0, unit: '', price: pr.amount }]
  const catLabel = catLabelOf(pr.category)
  return (
    <div className="printdoc-backdrop" style={standalone ? { background: '#fff', padding: 8, width: 776 } : { position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      {!standalone && <div className="no-print" style={{ maxWidth: 760, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>ใบขอซื้อ / ขอจ้าง {pr.no}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>}

      <div id="doc-sheet" className="print-area doc-sheet" style={{ maxWidth: 760, margin: '0 auto', background: '#fff', color: '#1C2730', borderRadius: 4, padding: '30px 34px', boxShadow: standalone ? 'none' : '0 24px 70px rgba(20,30,40,.3)', fontSize: 11.5 }}>
        {/* หัว */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, borderBottom: '2px solid #1E2E3B', paddingBottom: 10 }}>
          <img src={PPSD_LOGO_FULL} alt="PPSD" style={{ width: 52, height: 52, objectFit: 'cover' }} />
          <div style={{ flex: 1, lineHeight: 1.45 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{company.name}</div>
            <div style={{ fontSize: 10, color: '#5C6770' }}>{company.address}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '.02em' }}>ใบขอซื้อ / ขอจ้าง</div>
            <div style={{ fontSize: 10, color: '#5C6770' }}>Purchase Requisition</div>
            <div style={{ fontSize: 10.5, color: '#333', marginTop: 3 }}>เลขที่ <b className="num">{pr.no}</b></div>
          </div>
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

        {/* ท้ายเอกสาร: ผลการพิจารณา + ลายเซ็น (ดันไปอยู่ล่างสุดของหน้า) */}
        <div className="doc-foot">
          <div style={{ border: bd, marginTop: 14, padding: '6px 10px', fontSize: 11.5 }}>
            <b>ผลการพิจารณา</b> &nbsp;&nbsp; {chk(approved)} อนุมัติ &nbsp;&nbsp;&nbsp; {chk(rejected)} ไม่อนุมัติ
          </div>
          {/* ลายเซ็น: ผู้ขอซื้อ 1 + ผู้ตรวจสอบ 1 + ผู้อนุมัติตามกติกา (PR คนเดียวพอ) */}
          <ApproverSigns approval={pr.approval} makerLabel="ผู้ขอซื้อ/ขอจ้าง" makerName={pr.by} makerSig={pr.requester_sig} makerDate={pr.date} checkerName={pr.checked_by} checkerSig={(pr as { checked_sig?: string | null }).checked_sig} checkerDate={pr.checked_date} />
          <div style={{ textAlign: 'center', fontSize: 9, color: '#B0B8BF', marginTop: 14, borderTop: '1px solid #EEF1F4', paddingTop: 6 }}>เอกสารจัดทำโดยระบบ PPSD Construction ERP</div>
          {!pr.requester_sig && (
            <div className="no-print" style={{ marginTop: 12, fontSize: 12, color: '#8A6A1F', background: '#FBF4E1', border: '1px solid #ECDCB8', borderRadius: 8, padding: '9px 14px', textAlign: 'center' }}>
              ผู้ขอซื้อ “{pr.by}” ยังไม่มีลายเซ็นในระบบ — อัปโหลดได้ที่เมนู ผู้ใช้งาน → คอลัมน์ลายเซ็น (หรือในทะเบียนพนักงาน HR) แล้วระบบจะเติมให้ใบนี้อัตโนมัติ
            </div>
          )}
          {!approved && !rejected && (
            <div className="no-print" style={{ marginTop: 12, fontSize: 12, color: '#B7791F', background: '#F6ECD6', borderRadius: 8, padding: '9px 14px', textAlign: 'center' }}>
              ใบขอซื้อนี้ยัง “รออนุมัติ” ({pr.approval?.count ?? 0}/{pr.approval?.required ?? '-'}) — ลายเซ็นผู้อนุมัติจะปรากฏเมื่อกดอนุมัติครบ
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
