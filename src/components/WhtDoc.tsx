import { company } from '../erpData'
import { bahtText } from '../data'
import type { ApiPayment } from '../store'

// หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) — ตามแบบทางการกรมสรรพากร
// payeeSignature: ลายเซ็นผู้รับเงิน (ถ้าผู้รับเป็นพนักงานเรา) · payeeTaxId/payeeAddr: ถ้ามี
const f2 = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const bd = '1px solid #333'
const chk = (on: boolean) => (on ? '☑' : '☐')

export default function WhtDoc({ payment, payeeSignature, payeeTaxId, payeeAddr, onClose }: { payment: ApiPayment; payeeSignature?: string | null; payeeTaxId?: string; payeeAddr?: string; onClose: () => void }) {
  const dash = '.....................'
  const row = (label: string, amount?: string, tax?: string, indent = 12) => (
    <tr>
      <td style={{ border: bd, borderRight: 'none', padding: '2px 6px', paddingLeft: indent, fontSize: 10.5 }}>{label}</td>
      <td style={{ border: bd, borderLeft: 'none', borderRight: 'none', padding: '2px 6px', fontSize: 10.5, textAlign: 'center', width: 66 }} className="num">{/* วันที่ */}</td>
      <td style={{ border: bd, borderLeft: 'none', borderRight: 'none', padding: '2px 6px', fontSize: 10.5, textAlign: 'right', width: 86 }} className="num">{amount || ''}</td>
      <td style={{ border: bd, borderLeft: 'none', padding: '2px 6px', fontSize: 10.5, textAlign: 'right', width: 78 }} className="num">{tax || ''}</td>
    </tr>
  )
  const taxId = String(company.taxId).replace(/\D+/g, '') || company.taxId
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 720, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>50 ทวิ · {payment.no}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>

      <div className="print-area" style={{ maxWidth: 720, margin: '0 auto', background: '#fff', color: '#1C2730', borderRadius: 4, padding: '28px 32px', boxShadow: '0 24px 70px rgba(20,30,40,.3)', fontSize: 11 }}>
        {/* หัวเรื่อง */}
        <div style={{ textAlign: 'center', lineHeight: 1.4 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>หนังสือรับรองการหักภาษี ณ ที่จ่าย</div>
          <div style={{ fontSize: 11.5 }}>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, margin: '6px 2px 8px' }}>
          <span>ลำดับที่ ......../.......</span>
          <span>ในแบบ {['ภงด.1ก', 'ภงด.2', 'ภงด.3', 'ภงด.53'].map((t) => `${chk((payment.type || '').replace(/\s/g, '') === t)} ${t}`).join('  ')}</span>
          <span>เลขที่ <b className="num">{payment.no}</b></span>
        </div>

        {/* ผู้มีหน้าที่หักภาษี */}
        <div style={{ border: bd, padding: '6px 8px', lineHeight: 1.6 }}>
          <div><b>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :</b> &nbsp; เลขประจำตัวผู้เสียภาษีอากร <b className="num">{taxId}</b> &nbsp; ({chk(true)} สำนักงานใหญ่)</div>
          <div>ชื่อ <b>{company.name}</b></div>
          <div>ที่อยู่ {company.address}</div>
        </div>
        {/* ผู้ถูกหักภาษี */}
        <div style={{ border: bd, borderTop: 'none', padding: '6px 8px', lineHeight: 1.6 }}>
          <div><b>ผู้ถูกหักภาษี ณ ที่จ่าย :</b> &nbsp; เลขประจำตัวผู้เสียภาษีอากร <b className="num">{payeeTaxId || dash}</b></div>
          <div>ชื่อ <b>{payment.payee}</b></div>
          <div>ที่อยู่ {payeeAddr || dash + dash}</div>
        </div>

        {/* ตารางประเภทเงินได้ */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
          <thead>
            <tr>
              <th style={{ border: bd, padding: '3px 6px', fontSize: 10, fontWeight: 700 }}>ประเภทเงินได้พึงประเมินที่จ่าย</th>
              <th style={{ border: bd, padding: '3px 6px', fontSize: 10, fontWeight: 700, width: 66 }}>วัน เดือน<br />ปีที่จ่าย</th>
              <th style={{ border: bd, padding: '3px 6px', fontSize: 10, fontWeight: 700, width: 86 }}>จำนวนเงิน<br />ที่จ่าย</th>
              <th style={{ border: bd, padding: '3px 6px', fontSize: 10, fontWeight: 700, width: 78 }}>ภาษีที่หัก<br />และนำส่งไว้</th>
            </tr>
          </thead>
          <tbody>
            {row('1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40(1)')}
            {row('2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40(2)')}
            {row('3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40(3)')}
            {row('4. (ก) ค่าดอกเบี้ย ฯลฯ ตามมาตรา 40(4)(ก)')}
            {row('   (ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40(4)(ข)')}
            {row('5. การจ่ายเงินได้ที่ต้องหักภาษีตามคำสั่งกรมสรรพากร (มาตรา 3 เตรส)')}
            {row(`6. อื่นๆ (ระบุ) ค่าจ้าง/ค่าบริการ`, f2(payment.gross), f2(payment.wht))}
            <tr>
              <td style={{ border: bd, padding: '4px 6px', fontSize: 10.5, textAlign: 'right', fontWeight: 700 }}>รวมเงินที่จ่ายและภาษีที่หักนำส่ง</td>
              <td style={{ border: bd }} />
              <td style={{ border: bd, padding: '4px 6px', fontSize: 10.5, textAlign: 'right', fontWeight: 700 }} className="num">{f2(payment.gross)}</td>
              <td style={{ border: bd, padding: '4px 6px', fontSize: 10.5, textAlign: 'right', fontWeight: 700 }} className="num">{f2(payment.wht)}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ border: bd, borderTop: 'none', padding: '5px 8px', fontSize: 10.5 }}>รวมเงินภาษีที่หักนำส่ง (ตัวอักษร) &nbsp; <b>({bahtText(payment.wht)})</b></div>
        <div style={{ border: bd, borderTop: 'none', padding: '5px 8px', fontSize: 10.5 }}>
          ผู้จ่ายเงิน &nbsp; {chk(true)} หักภาษี ณ ที่จ่าย &nbsp;&nbsp; {chk(false)} ออกภาษีให้ตลอดไป &nbsp;&nbsp; {chk(false)} ออกภาษีให้ครั้งเดียว &nbsp;&nbsp; {chk(false)} อื่นๆ
        </div>

        <div style={{ fontSize: 10.5, marginTop: 10, textAlign: 'center' }}>ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <div style={{ width: 280, textAlign: 'center' }}>
            {payeeSignature && <img src={payeeSignature} alt="" style={{ height: 40, maxWidth: 180, objectFit: 'contain', display: 'block', margin: '0 auto -4px' }} />}
            <div style={{ borderBottom: '1px dotted #666', height: payeeSignature ? 4 : 30, marginBottom: 4 }} />
            <div style={{ fontSize: 10.5 }}>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย</div>
            <div style={{ fontSize: 10.5, color: '#333', marginTop: 4 }}>วันเดือนปีที่ออกหนังสือรับรองฯ &nbsp; <span className="num">{payment.date}</span></div>
            <div style={{ fontSize: 10, color: '#94A0A8', marginTop: 8 }}>(ประทับตรานิติบุคคล ถ้ามี)</div>
          </div>
        </div>
      </div>
    </div>
  )
}
