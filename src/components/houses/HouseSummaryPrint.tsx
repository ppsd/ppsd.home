import { company } from '../../erpData'
import { PPSD_LOGO_FULL } from '../../assets'
import { baht } from '../../data'
import type { ApiHouse, ApiInstallment, ApiExpense, ApiIssue } from '../../store'

// ใบสรุปบ้าน/โครงการ (ปุ่ม "พิมพ์สรุป" ในหน้ารายละเอียดบ้าน) — ข้อมูลโครงการ · การเงิน · งวดลูกค้า/ช่าง · ปัญหาค้าง
// กำไร/ต้นทุนเห็นได้เฉพาะผู้จัดการ (canSeeProfit) เหมือนหน้าจอ
const bd = '1px solid #C9D2DA'
const cell: React.CSSProperties = { padding: '5px 8px', fontSize: 11.5, border: bd, verticalAlign: 'top' }
const lb: React.CSSProperties = { ...cell, background: '#F7F9FB', color: '#5C6770', whiteSpace: 'nowrap' }
const th: React.CSSProperties = { ...cell, background: '#F7F9FB', color: '#3C4750', fontWeight: 700, textAlign: 'left' }
const num: React.CSSProperties = { ...cell, textAlign: 'right', whiteSpace: 'nowrap' }
const sec: React.CSSProperties = { padding: '5px 9px', fontSize: 12, fontWeight: 700, background: '#1E2E3B', color: '#fff', borderRadius: 4, margin: '14px 0 6px', breakAfter: 'avoid' }

interface Props {
  house: ApiHouse
  installments: ApiInstallment[]
  expenses: ApiExpense[]
  issues: ApiIssue[]
  otherCost: number
  canSeeProfit: boolean
  onClose: () => void
}

export default function HouseSummaryPrint({ house, installments, expenses, issues, otherCost, canSeeProfit, onClose }: Props) {
  const today = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
  const isOffice = house.kind === 'office'
  const cust = installments.filter((r) => (r.side || 'customer') === 'customer').sort((a, b) => a.no - b.no)
  const contr = installments.filter((r) => r.side === 'contractor').sort((a, b) => a.no - b.no)
  const sum = (a: { amount: number; paid?: number }[], k: 'amount' | 'paid') => a.reduce((s, r) => s + (Number(r[k]) || 0), 0)
  const openIssues = issues.filter((i) => !['แก้ไขแล้ว', 'ปิดเคส', 'ยกเลิก'].includes(i.status))
  const contractorValue = house.contractor_value || 0
  const info: [string, string][] = [
    ['รหัสบ้าน', house.code], ['ชื่อบ้าน / โครงการ', `${house.name}${house.project ? ' · ' + house.project : ''}`],
    ['ลูกค้า', house.customer || '-'], ['สถานะ', `${house.status} · คืบหน้า ${house.pct || 0}%`],
    ['แบบบ้าน', house.design || '-'], ['พื้นที่ใช้สอย', house.area || '-'],
    ['เริ่มก่อสร้าง', house.start_date || '-'], ['กำหนดส่งมอบ', house.deliver_date || '-'],
    ['ผู้จัดการโครงการ', house.manager || '-'],
  ]
  if (house.kind === 'cm') {
    for (const [k, v] of [['เลขที่สัญญา', house.contract_no], ['เจ้าของ / ผู้ว่าจ้าง', house.owner], ['ที่ตั้งโครงการ', house.site_location], ['ผู้ควบคุมงาน', house.supervisor], ['วิศวกรโครงการ', house.engineer], ['ขอบเขตงาน', house.scope]] as [string, string | undefined][])
      if (v) info.push([k, v])
  }
  const breakdown = (house.breakdown || []).filter((c) => c.customer || c.contractor) // ไม่แสดงหมวดที่ยอดเป็น 0 ทั้งแถว
  const pairs: [string, string][][] = []
  for (let i = 0; i < info.length; i += 2) pairs.push(info.slice(i, i + 2))

  const InstTable = ({ rows, contractor }: { rows: ApiInstallment[]; contractor?: boolean }) => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>
        <th style={{ ...th, width: 34, textAlign: 'center' }}>งวด</th>
        {contractor && <th style={th}>ผู้รับเหมา</th>}
        <th style={th}>รายละเอียด</th><th style={th}>กำหนด</th>
        <th style={{ ...th, textAlign: 'right' }}>จำนวนเงิน</th><th style={{ ...th, textAlign: 'right' }}>{contractor ? 'จ่ายแล้ว' : 'เก็บแล้ว'}</th><th style={th}>สถานะ</th>
      </tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} style={{ breakInside: 'avoid' }}>
            <td style={{ ...cell, textAlign: 'center' }} className="num">{r.no}</td>
            {contractor && <td style={cell}>{r.contractor || '-'}</td>}
            <td style={cell}>{r.detail || '-'}</td>
            <td style={{ ...cell, whiteSpace: 'nowrap' }}>{r.due || '-'}</td>
            <td style={num} className="num">{baht(r.amount)}</td>
            <td style={num} className="num">{baht(r.paid || 0)}</td>
            <td style={{ ...cell, whiteSpace: 'nowrap', color: r.overdue ? '#C24036' : undefined }}>{r.overdue ? 'เลยกำหนด' : r.status}</td>
          </tr>
        ))}
        <tr style={{ fontWeight: 700, background: '#FAFBFC' }}>
          <td style={{ ...cell, textAlign: 'right' }} colSpan={contractor ? 4 : 3}>รวม {rows.length} งวด</td>
          <td style={num} className="num">{baht(sum(rows, 'amount'))}</td>
          <td style={num} className="num">{baht(sum(rows, 'paid'))}</td>
          <td style={cell}>คงเหลือ {baht(sum(rows, 'amount') - sum(rows, 'paid'))}</td>
        </tr>
      </tbody>
    </table>
  )

  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <style>{'@media print { @page { size: A4 portrait; margin: 10mm } }'}</style>
      <div className="no-print" style={{ maxWidth: 820, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>สรุปบ้าน · {house.name}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>

      <div className="print-area" style={{ maxWidth: 820, margin: '0 auto', background: '#fff', color: '#1C2730', borderRadius: 6, padding: '26px 30px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, borderBottom: '2px solid #1E2E3B', paddingBottom: 12, marginBottom: 6 }}>
          <img src={PPSD_LOGO_FULL} alt="PPSD" style={{ width: 54, height: 54, borderRadius: 8, objectFit: 'cover' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{company.name}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2E3B' }}>{isOffice ? 'สรุปค่าใช้จ่าย (ออฟฟิศ / ภายใน)' : 'สรุปข้อมูลบ้าน / โครงการ'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="num" style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>{house.code}</div>
            <div style={{ fontSize: 11, color: '#5C6770' }}>พิมพ์วันที่ {today}</div>
          </div>
        </div>

        <div style={sec}>ข้อมูลโครงการ</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {pairs.map((p, i) => (
              <tr key={i}>{p.map(([k, v]) => [<td key={k + 'l'} style={lb}>{k}</td>, <td key={k + 'v'} style={cell} colSpan={p.length === 1 ? 3 : 1}>{v}</td>])}</tr>
            ))}
          </tbody>
        </table>

        {!isOffice && (
          <>
            <div style={sec}>สรุปการเงิน</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr><td style={lb}>{house.kind === 'cm' ? 'ค่าบริการควบคุมงาน' : 'มูลค่าสัญญา (ขายลูกค้า)'}</td><td style={num} className="num">{baht(house.value)}</td>
                  <td style={lb}>เก็บจากลูกค้าแล้ว</td><td style={num} className="num">{baht(house.collected)}</td></tr>
                <tr><td style={lb}>ค้างเก็บลูกค้า</td><td style={num} className="num">{baht(house.remain)}</td>
                  <td style={lb}>ความคืบหน้างาน</td><td style={num} className="num">{house.pct || 0}%</td></tr>
                {canSeeProfit && <>
                  <tr><td style={lb}>ต้นทุนช่าง (รวมสัญญา)</td><td style={num} className="num">{baht(contractorValue)}</td>
                    <td style={lb}>จ่ายช่างแล้ว</td><td style={num} className="num">{baht(house.paid || 0)}</td></tr>
                  <tr><td style={lb}>ค่าใช้จ่ายย่อย</td><td style={num} className="num">{baht(otherCost)}</td>
                    <td style={lb}>กำไรโครงการ (ขาย − จ่ายช่าง)</td><td style={{ ...num, fontWeight: 700, color: house.value - contractorValue >= 0 ? '#2E7D55' : '#C24036' }} className="num">{baht(house.value - contractorValue)}</td></tr>
                </>}
              </tbody>
            </table>

            {breakdown.length > 0 && (
              <>
                <div style={sec}>มูลค่าแยกตามหมวดงาน</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>หมวดงาน</th><th style={{ ...th, textAlign: 'right' }}>ขายลูกค้า</th>{canSeeProfit && <><th style={{ ...th, textAlign: 'right' }}>จ่ายช่าง</th><th style={{ ...th, textAlign: 'right' }}>กำไร</th></>}</tr></thead>
                  <tbody>
                    {breakdown.map((c) => (
                      <tr key={c.key}><td style={cell}>{c.label}</td><td style={num} className="num">{baht(c.customer)}</td>
                        {canSeeProfit && <><td style={num} className="num">{baht(c.contractor)}</td><td style={num} className="num">{baht(c.customer - c.contractor)}</td></>}</tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <div style={sec}>งวดเก็บเงินลูกค้า</div>
            {cust.length ? <InstTable rows={cust} /> : <div style={{ fontSize: 11.5, color: '#94A0A8' }}>ยังไม่มีงวดลูกค้า</div>}

            {canSeeProfit && contr.length > 0 && (
              <>
                <div style={sec}>งวดจ่ายช่าง / ผู้รับเหมา</div>
                <InstTable rows={contr} contractor />
              </>
            )}
          </>
        )}

        {isOffice && (
          <>
            <div style={sec}>รายการค่าใช้จ่าย ({expenses.length} รายการ · รวม {baht(expenses.reduce((s, e) => s + e.amount, 0))})</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>วันที่</th><th style={th}>รายการ</th><th style={th}>หมวด</th><th style={th}>ร้าน/ผู้รับเงิน</th><th style={{ ...th, textAlign: 'right' }}>จำนวนเงิน</th></tr></thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} style={{ breakInside: 'avoid' }}><td style={{ ...cell, whiteSpace: 'nowrap' }}>{e.date}</td><td style={cell}>{e.item}</td><td style={cell}>{e.cat}</td><td style={cell}>{e.vendor}</td><td style={num} className="num">{baht(e.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div style={sec}>ปัญหาหน้างานที่ยังเปิดอยู่ ({openIssues.length})</div>
        {openIssues.length ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>วันที่แจ้ง</th><th style={th}>เรื่อง</th><th style={th}>ความสำคัญ</th><th style={th}>สถานะ</th><th style={th}>ผู้แจ้ง</th></tr></thead>
            <tbody>
              {openIssues.map((i) => (
                <tr key={i.id} style={{ breakInside: 'avoid' }}><td style={{ ...cell, whiteSpace: 'nowrap' }}>{i.date}</td><td style={cell}>{i.title}</td><td style={cell}>{i.priority}</td><td style={cell}>{i.status}</td><td style={cell}>{i.by}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <div style={{ fontSize: 11.5, color: '#94A0A8' }}>ไม่มีปัญหาค้าง</div>}
      </div>
    </div>
  )
}
