import type { ApiPayroll } from '../store'
import { SlipBody } from './PrintDoc'

// สลิปเงินเดือน "ทั้งบริษัท" ในเอกสารเดียว — คนละหน้า A4 พิมพ์ครั้งเดียวจบสิ้นเดือน
export default function AllSlipsDoc({ rows, periodLabel, onClose }: { rows: ApiPayroll[]; periodLabel: string; onClose: () => void }) {
  const data = rows.filter((r) => r.status !== 'ลาออก')
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '18px 12px' }}>
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm } .no-print { display: none !important } .print-area { box-shadow: none !important; width: 100% !important } .slip-page { page-break-after: always; box-shadow: none !important; margin-bottom: 0 !important } .slip-page:last-child { page-break-after: auto } }`}</style>
      <div className="no-print" style={{ maxWidth: 780, margin: '0 auto 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>สลิปเงินเดือนทุกคน · {periodLabel} · {data.length} คน (คนละหน้า)</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์ทั้งหมด ({data.length} หน้า)</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>
      <div className="print-area" style={{ maxWidth: 780, margin: '0 auto' }}>
        {data.map((p) => (
          <div key={p.code || p.id} className="slip-page" style={{ background: '#fff', color: '#1C2730', borderRadius: 4, padding: '26px 30px', marginBottom: 14, boxShadow: '0 12px 40px rgba(20,30,40,.25)' }}>
            <SlipBody slip={{ ...p, period: periodLabel }} />
          </div>
        ))}
        {data.length === 0 && <div style={{ background: '#fff', borderRadius: 8, padding: 40, textAlign: 'center', color: '#94A0A8' }}>ไม่มีพนักงานในงวดนี้</div>}
      </div>
    </div>
  )
}
