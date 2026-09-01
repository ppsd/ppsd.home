import { company } from '../erpData'
import type { ApiPayroll } from '../store'

// ใบสรุปการจ่ายค่าจ้าง/เงินเดือนทั้งบริษัท (งวดเดียว แถวละคน + ยอดรวมท้ายตาราง) — พิมพ์แนวนอน
const f2 = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const f2z = (n: number) => (n ? f2(n) : '') // ว่างถ้าเป็น 0 (ให้ตารางโล่งเหมือนต้นฉบับ)
const bd = '1px solid #999'

// สี (โทนเดียวกับไฟล์ต้นฉบับที่ส่งมา)
const C_WAGE = '#FCE4D6'   // รวมค่าจ้าง (พีช)
const C_SSO = '#DDEBF7'    // ประกันสังคม/ภาษี (ฟ้าอ่อน)
const C_GREEN = '#C6EFCE'  // ป้ายกลุ่ม ประกันสังคม/ภงด.1
const C_ORANGE = '#F8CBAD' // ป้ายกลุ่ม อัตราปกติ/คีย์ส่งแบงค์
const C_NET = '#FCE4D6'    // เงินได้สุทธิ
const C_TOTAL = '#FFF2A8'  // แถวรวม (เหลือง)

const netOf = (p: ApiPayroll) => (p.base || 0) + (p.ot || 0) - (p.sso || 0) - (p.tax || 0) - (p.leave_deduct || 0) - (p.retention || 0) - (p.student_loan || 0) - (p.advance || 0)

export default function PayrollSummaryDoc({ rows, periodLabel, onClose }: { rows: ApiPayroll[]; periodLabel: string; onClose: () => void }) {
  const data = rows.filter((r) => r.status !== 'ลาออก')
  // แยกชื่อ/สกุลจากชื่อเต็ม (ถ้าไม่ได้แยกไว้)
  const split = (full: string) => { const parts = String(full || '').trim().split(/\s+/); return { first: parts[0] || '', last: parts.slice(1).join(' ') } }
  const isDaily = (p: ApiPayroll) => p.pay_type === 'รายวัน'
  const rateOf = (p: ApiPayroll) => (isDaily(p) ? (p.daily_rate || 0) : (p.base || 0))
  const countOf = (p: ApiPayroll) => (isDaily(p) ? (p.work_days || 0) : 1)
  const wageOf = (p: ApiPayroll) => p.base || 0
  const incomeOf = (p: ApiPayroll) => (p.base || 0) + (p.ot || 0)

  const sum = (f: (p: ApiPayroll) => number) => data.reduce((s, p) => s + (f(p) || 0), 0)
  const T = {
    wage: sum(wageOf), other: sum((p) => p.ot || 0), income: sum(incomeOf), sso: sum((p) => p.sso || 0),
    tax: sum((p) => p.tax || 0), advance: sum((p) => p.advance || 0), debt: sum((p) => p.student_loan || 0),
    misc: sum((p) => p.leave_deduct || 0), ret: sum((p) => p.retention || 0), net: sum(netOf),
  }

  const th: React.CSSProperties = { border: bd, padding: '3px 4px', fontSize: 8.5, fontWeight: 700, textAlign: 'center', lineHeight: 1.15, verticalAlign: 'middle' }
  const td: React.CSSProperties = { border: bd, padding: '2px 4px', fontSize: 8.5, verticalAlign: 'middle' }
  const tdR: React.CSSProperties = { ...td, textAlign: 'right' }
  const tdC: React.CSSProperties = { ...td, textAlign: 'center' }

  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '18px 12px' }}>
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm } .no-print { display: none !important } .print-area { box-shadow: none !important; width: 100% !important } }`}</style>
      <div className="no-print" style={{ maxWidth: 1180, margin: '0 auto 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>ใบสรุปการจ่ายค่าจ้าง · {periodLabel}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์ (แนวนอน)</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>

      <div className="print-area" style={{ maxWidth: 1180, margin: '0 auto', background: '#fff', color: '#1C2730', borderRadius: 4, padding: '16px 18px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        {/* หัว */}
        <div style={{ textAlign: 'center', marginBottom: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{company.name} <span style={{ fontWeight: 400 }}>({String(company.taxId).replace(/\D+/g, '') || company.taxId})</span></div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#C0392B' }}>รายละเอียดการจ่ายค่าจ้าง</div>
        </div>
        <div style={{ fontSize: 11, marginBottom: 4 }}>สำหรับงวด {periodLabel}</div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            {/* แถวป้ายกลุ่มสี */}
            <thead>
              <tr>
                <th style={{ ...th, border: 'none' }} colSpan={8} />
                <th style={{ ...th, background: C_GREEN }}>ประกันสังคม</th>
                <th style={{ ...th, border: 'none' }} />
                <th style={{ ...th, background: C_GREEN }}>ภงด. 1</th>
                <th style={{ ...th, background: C_ORANGE }} colSpan={2}>อัตราปกติ 5%</th>
                <th style={{ ...th, border: 'none' }} colSpan={4} />
                <th style={{ ...th, background: C_ORANGE }}>คีย์ส่งแบงค์</th>
                <th style={{ ...th, border: 'none' }} colSpan={3} />
              </tr>
              <tr>
                {['ลำดับ', 'คำนำหน้า', 'ชื่อ', 'สกุล', 'เลขบัตรประชาชน', 'ค่าจ้างรายวัน/รายเดือน', 'เดือนละ/วันละ', 'จำนวนเดือน/วัน'].map((h, i) => <th key={i} style={th}>{h}</th>)}
                <th style={{ ...th, background: C_WAGE }}>รวมค่าจ้าง</th>
                <th style={th}>รายรับอื่นๆ</th>
                <th style={th}>รวมรายรับ</th>
                <th style={{ ...th, background: C_SSO }}>ประกันสังคม</th>
                <th style={{ ...th, background: C_SSO }}>ภาษี</th>
                <th style={th}>รายการเบิก</th>
                <th style={th}>หักหนี้</th>
                <th style={th}>อื่นๆ</th>
                <th style={th}>ประกันงาน/เดือน</th>
                <th style={{ ...th, background: C_NET }}>เงินได้สุทธิ</th>
                <th style={th}>ชื่อเรียก</th>
                <th style={th}>เลขที่บัญชี</th>
                <th style={th}>ธนาคาร</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p, i) => {
                const nm = split(p.name)
                const daily = isDaily(p)
                return (
                  <tr key={p.id}>
                    <td style={tdC} className="num">{i + 1}</td>
                    <td style={tdC}>{p.prefix || ''}</td>
                    <td style={td}>{nm.first}</td>
                    <td style={td}>{nm.last}</td>
                    <td style={tdC} className="num">{p.tax_id || ''}</td>
                    <td style={tdC}>{p.pay_type || 'รายเดือน'}</td>
                    <td style={tdR} className="num">{f2(rateOf(p))}</td>
                    <td style={{ ...tdR, color: '#C0392B' }} className="num">{daily ? f2(countOf(p)) : '1.00'}</td>
                    <td style={{ ...tdR, background: C_WAGE, fontWeight: 600 }} className="num">{f2z(wageOf(p))}</td>
                    <td style={tdR} className="num">{f2z(p.ot || 0)}</td>
                    <td style={tdR} className="num">{f2z(incomeOf(p))}</td>
                    <td style={{ ...tdR, background: C_SSO }} className="num">{f2z(p.sso || 0)}</td>
                    <td style={{ ...tdR, background: C_SSO }} className="num">{f2z(p.tax || 0)}</td>
                    <td style={{ ...tdR, color: '#C0392B' }} className="num">{f2z(p.advance || 0)}</td>
                    <td style={tdR} className="num">{f2z(p.student_loan || 0)}</td>
                    <td style={tdR} className="num">{f2z(p.leave_deduct || 0)}</td>
                    <td style={{ ...tdR, color: '#C0392B' }} className="num">{f2z(p.retention || 0)}</td>
                    <td style={{ ...tdR, background: C_NET, fontWeight: 700 }} className="num">{f2z(netOf(p))}</td>
                    <td style={tdC}>{p.nickname || ''}</td>
                    <td style={tdC} className="num">{p.bank_acct || ''}</td>
                    <td style={tdC}>{p.bank_name || ''}</td>
                  </tr>
                )
              })}
              {/* แถวรวม */}
              <tr style={{ background: C_TOTAL, fontWeight: 700 }}>
                <td style={tdC} colSpan={8}>รวมทั้งสิ้น {data.length} คน</td>
                <td style={tdR} className="num">{f2(T.wage)}</td>
                <td style={tdR} className="num">{f2(T.other)}</td>
                <td style={tdR} className="num">{f2(T.income)}</td>
                <td style={tdR} className="num">{f2(T.sso)}</td>
                <td style={tdR} className="num">{f2(T.tax)}</td>
                <td style={tdR} className="num">{f2(T.advance)}</td>
                <td style={tdR} className="num">{f2(T.debt)}</td>
                <td style={tdR} className="num">{f2(T.misc)}</td>
                <td style={tdR} className="num">{f2(T.ret)}</td>
                <td style={tdR} className="num">{f2(T.net)}</td>
                <td style={td} colSpan={3} />
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 26, fontSize: 10.5 }}>
          {['ผู้จัดทำ', 'ผู้ตรวจสอบ', 'ผู้อนุมัติจ่าย'].map((r) => (
            <div key={r} style={{ flex: 1, textAlign: 'center', margin: '0 16px' }}>
              <div style={{ borderBottom: '1px dotted #666', margin: '22px 8px 5px' }} />
              <div>ลงชื่อ {r}</div>
              <div style={{ color: '#94A0A8', marginTop: 2 }}>วันที่ ......../......../........</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
