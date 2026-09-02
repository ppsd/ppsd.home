import { company } from '../erpData'

// หนังสือรับรองการหักภาษี ณ ที่จ่าย (ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร) — ฉบับพนักงานรายปี
// ใช้ยอดจาก snapshot งวดเงินเดือนที่ปิดแล้วทั้งปี (เงินได้ตามมาตรา 40(1))
export interface AnnualEmpRow { code: string; prefix: string; name: string; tax_id: string; income: number; tax: number; sso: number; months: number }

const f2 = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const bd = '1px solid #555'

export default function WhtCertDoc({ row, year, onClose }: { row: AnnualEmpRow; year: string; onClose: () => void }) {
  const beYear = Number(year) + 543
  const cell: React.CSSProperties = { border: bd, padding: '6px 10px', fontSize: 12.5, verticalAlign: 'top' }
  const label: React.CSSProperties = { fontSize: 11, color: '#444' }
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '18px 12px' }}>
      <style>{`@media print { @page { size: A4 portrait; margin: 14mm } .no-print { display: none !important } .print-area { box-shadow: none !important; width: 100% !important } }`}</style>
      <div className="no-print" style={{ maxWidth: 780, margin: '0 auto 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>หนังสือรับรองหักภาษี ณ ที่จ่าย (50 ทวิ) · {row.name} · ปี {beYear}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>

      <div className="print-area" style={{ maxWidth: 780, margin: '0 auto', background: '#fff', color: '#111', borderRadius: 4, padding: '26px 30px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 15.5, fontWeight: 700 }}>หนังสือรับรองการหักภาษี ณ ที่จ่าย</div>
          <div style={{ fontSize: 12 }}>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
          <tbody>
            <tr>
              <td style={cell}>
                <div style={label}>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย</div>
                <div style={{ fontWeight: 700, marginTop: 2 }}>{company.name}</div>
                <div style={{ fontSize: 12 }}>{company.address}</div>
                <div style={{ fontSize: 12 }}>{company.taxId}</div>
              </td>
            </tr>
            <tr>
              <td style={cell}>
                <div style={label}>ผู้ถูกหักภาษี ณ ที่จ่าย</div>
                <div style={{ fontWeight: 700, marginTop: 2 }}>{row.prefix ? row.prefix + ' ' : ''}{row.name}</div>
                <div style={{ fontSize: 12 }}>เลขประจำตัวผู้เสียภาษี/บัตรประชาชน: <span className="num">{row.tax_id || '.............................................'}</span></div>
              </td>
            </tr>
          </tbody>
        </table>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...cell, background: '#F1F1F1', textAlign: 'left' }}>ประเภทเงินได้พึงประเมินที่จ่าย</th>
              <th style={{ ...cell, background: '#F1F1F1', width: 110, textAlign: 'center' }}>ปีภาษี</th>
              <th style={{ ...cell, background: '#F1F1F1', width: 150, textAlign: 'center' }}>จำนวนเงินที่จ่าย (บาท)</th>
              <th style={{ ...cell, background: '#F1F1F1', width: 150, textAlign: 'center' }}>ภาษีที่หักนำส่ง (บาท)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={cell}>เงินเดือน ค่าจ้าง ฯลฯ ตามมาตรา 40(1) <span style={{ fontSize: 11, color: '#666' }}>(รวม {row.months} งวดที่ปิดแล้ว)</span></td>
              <td style={{ ...cell, textAlign: 'center' }} className="num">{beYear}</td>
              <td style={{ ...cell, textAlign: 'right' }} className="num">{f2(row.income)}</td>
              <td style={{ ...cell, textAlign: 'right' }} className="num">{f2(row.tax)}</td>
            </tr>
            <tr>
              <td style={{ ...cell, fontWeight: 700 }} colSpan={2}>รวม</td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }} className="num">{f2(row.income)}</td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }} className="num">{f2(row.tax)}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ fontSize: 12, margin: '10px 0 4px' }}>
          เงินสมทบกองทุนประกันสังคมที่หักนำส่งทั้งปี: <b className="num">{f2(row.sso)}</b> บาท
        </div>
        <div style={{ fontSize: 11.5, color: '#444', marginBottom: 26 }}>
          ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ textAlign: 'center', width: 280 }}>
            <div style={{ marginBottom: 40, fontSize: 12 }}>ลงชื่อ ................................................... ผู้จ่ายเงิน</div>
            <div style={{ fontSize: 12 }}>( ................................................... )</div>
            <div style={{ fontSize: 11.5, marginTop: 8 }}>วันที่ ........ เดือน .................... พ.ศ. ..........</div>
            <div style={{ fontSize: 10.5, color: '#666', marginTop: 10 }}>ประทับตรานิติบุคคล (ถ้ามี)</div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #ddd', marginTop: 18, paddingTop: 6, fontSize: 9.5, color: '#8b959c', textAlign: 'center' }}>
          เอกสารจัดทำโดยระบบ PPSD Construction ERP
        </div>
      </div>
    </div>
  )
}
