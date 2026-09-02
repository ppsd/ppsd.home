import { company } from '../erpData'
import { baht } from '../data'

// รายงานผู้บริหารประจำเดือน (A4 แนวตั้ง) — ตัวเลขหลักจากบัญชีแยกประเภท + ยอดค้างจริง
export interface MonthlyReport {
  period: string; label: string; from: string; to: string
  pnl: { revenue: number; cost: number; expense: number; grossProfit: number; netProfit: number }
  cash: { opening: number; closing: number; net: number }
  spend: { expenses: number; expenseCount: number; payroll: number | null }
  ar: { total: number; overdue: number }
  ap: { total: number; overdue: number }
  houses: Record<string, number>
  issuesOpen: number
  journalIssues: number
}

const bd = '1px solid #C9D2D9'

export default function MonthlyReportDoc({ r, onClose, onSendLine }: { r: MonthlyReport; onClose: () => void; onSendLine?: () => void }) {
  const row = (l: string, v: number, opts: { bold?: boolean; color?: string; indent?: boolean } = {}) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: opts.bold ? 14 : 12.5, fontWeight: opts.bold ? 700 : 400, color: opts.color || '#1C2730', paddingLeft: opts.indent ? 14 : 0 }}>
      <span>{l}</span><span className="num">{baht(v)}</span>
    </div>
  )
  const sect = (t: string) => <div style={{ fontSize: 12, fontWeight: 700, color: '#30506A', background: '#EEF2F6', padding: '5px 10px', borderRadius: 6, margin: '14px 0 6px' }}>{t}</div>
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '18px 12px' }}>
      <style>{`@media print { @page { size: A4 portrait; margin: 14mm } .no-print { display: none !important } .print-area { box-shadow: none !important; width: 100% !important } }`}</style>
      <div className="no-print" style={{ maxWidth: 720, margin: '0 auto 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>รายงานประจำเดือน · {r.label}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          {onSendLine && <button onClick={onSendLine} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>💬 ส่งเข้า LINE</button>}
          <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>

      <div className="print-area" style={{ maxWidth: 720, margin: '0 auto', background: '#fff', color: '#1C2730', borderRadius: 4, padding: '26px 32px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        <div style={{ borderBottom: '2px solid #1E2E3B', paddingBottom: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{company.name}</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#30506A', marginTop: 4 }}>รายงานผู้บริหารประจำเดือน — {r.label}</div>
          <div style={{ fontSize: 11, color: '#7C8B97', marginTop: 2 }}>ช่วงข้อมูล {r.from} ถึง {r.to} · ตัวเลขจากบัญชีแยกประเภท (GL) และยอดค้างจริงในระบบ</div>
        </div>

        {/* ตัวเลขหัวใจ 3 ช่อง */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 6 }}>
          <div style={{ border: bd, borderRadius: 9, padding: '10px 13px' }}>
            <div style={{ fontSize: 11, color: '#7C8B97' }}>กำไรสุทธิเดือนนี้ (ตามบัญชี)</div>
            <div className="num" style={{ fontSize: 19, fontWeight: 700, color: r.pnl.netProfit >= 0 ? '#2E7D55' : '#C24036' }}>{baht(r.pnl.netProfit)}</div>
          </div>
          <div style={{ border: bd, borderRadius: 9, padding: '10px 13px' }}>
            <div style={{ fontSize: 11, color: '#7C8B97' }}>เงินสด+ธนาคาร ปลายเดือน</div>
            <div className="num" style={{ fontSize: 19, fontWeight: 700, color: '#30506A' }}>{baht(r.cash.closing)}</div>
            <div className="num" style={{ fontSize: 10.5, color: r.cash.net >= 0 ? '#2E7D55' : '#C24036' }}>{r.cash.net >= 0 ? '▲' : '▼'} {baht(Math.abs(r.cash.net))} ในเดือน</div>
          </div>
          <div style={{ border: bd, borderRadius: 9, padding: '10px 13px' }}>
            <div style={{ fontSize: 11, color: '#7C8B97' }}>ลูกหนี้ค้างเก็บ − เจ้าหนี้ค้างจ่าย</div>
            <div className="num" style={{ fontSize: 19, fontWeight: 700, color: '#1C2730' }}>{baht(r.ar.total - r.ap.total)}</div>
          </div>
        </div>

        {sect('ผลประกอบการเดือนนี้ (งบกำไรขาดทุนจาก GL)')}
        {row('รายได้', r.pnl.revenue, { color: '#2E7D55' })}
        {row('ต้นทุนงานก่อสร้าง', r.pnl.cost, { indent: true })}
        {row('ค่าใช้จ่ายดำเนินงาน', r.pnl.expense, { indent: true })}
        <div style={{ borderTop: bd, marginTop: 4, paddingTop: 4 }}>{row('กำไร (ขาดทุน) สุทธิ', r.pnl.netProfit, { bold: true, color: r.pnl.netProfit >= 0 ? '#2E7D55' : '#C24036' })}</div>

        {sect('การใช้จ่ายเดือนนี้')}
        {row(`รายจ่ายวัสดุ/ทั่วไป (${r.spend.expenseCount} ใบ)`, r.spend.expenses)}
        {r.spend.payroll != null
          ? row('เงินเดือน (งวดที่ปิดแล้ว)', r.spend.payroll)
          : <div style={{ fontSize: 12, color: '#B7791F', padding: '4px 0' }}>เงินเดือน: ยังไม่ปิดงวดเดือนนี้</div>}

        {sect('ยอดค้าง ณ วันนี้')}
        {row('ลูกหนี้ค้างเก็บ (งวดลูกค้า)', r.ar.total)}
        {r.ar.overdue > 0 && row('— ในนั้นเลยกำหนดแล้ว', r.ar.overdue, { indent: true, color: '#C24036' })}
        {row('เจ้าหนี้ค้างจ่าย (PO เครดิต)', r.ap.total)}
        {r.ap.overdue > 0 && row('— ในนั้นเลยกำหนดชำระ', r.ap.overdue, { indent: true, color: '#C24036' })}

        {sect('สถานะงาน')}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, padding: '4px 0' }}>
          {Object.entries(r.houses).map(([st, n]) => <span key={st}>{st}: <b className="num">{n}</b> หลัง</span>)}
          <span>ปัญหาหน้างานค้าง: <b className="num" style={{ color: r.issuesOpen ? '#C24036' : '#2E7D55' }}>{r.issuesOpen}</b> เรื่อง</span>
        </div>
        {r.journalIssues > 0 && (
          <div style={{ fontSize: 12, color: '#C24036', background: '#FBEEEC', borderRadius: 7, padding: '7px 11px', marginTop: 8 }}>
            ⚠️ มีรายการลงบัญชีไม่สำเร็จ {r.journalIssues} รายการ — ตัวเลขงบเดือนนี้อาจยังไม่ครบ ตรวจที่หน้า บัญชี ก่อนใช้ตัดสินใจ
          </div>
        )}

        <div style={{ borderTop: '1px solid #E1E5EA', marginTop: 18, paddingTop: 6, fontSize: 9.5, color: '#8b959c', textAlign: 'center' }}>
          เอกสารจัดทำโดยระบบ PPSD Construction ERP
        </div>
      </div>
    </div>
  )
}
