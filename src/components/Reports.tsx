import { useState } from 'react'
import { useApp } from '../store'
import { api } from '../api'
import { baht } from '../data'
import { exportXlsx, ExportButton } from '../exportCsv'
import MonthlyReportDoc, { type MonthlyReport } from './MonthlyReportDoc'

const CAT_COLORS: Record<string, string> = { วัสดุ: '#30506A', ค่าแรง: '#C0852C', ขนส่ง: '#5C6770', อื่นๆ: '#2E7D55' }

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ fontSize: 12.5, color: '#5C6770' }}>{label}</div>
      <div className="num" style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color }}>{value}</div>
    </div>
  )
}

export default function Reports() {
  const { reports } = useApp().data
  // รายงานผู้บริหารประจำเดือน (พิมพ์ A4 / ส่ง LINE)
  const d0 = new Date()
  const [mrPeriod, setMrPeriod] = useState(`${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}`)
  const [mr, setMr] = useState<MonthlyReport | null>(null)
  const openMonthly = async () => {
    try { setMr(await api.get<MonthlyReport>('/reports/monthly?period=' + mrPeriod)) }
    catch (e) { window.alert((e as Error).message) }
  }
  const sendMonthlyLine = async () => {
    if (!mr) return
    if (!window.confirm(`ส่งสรุปเดือน ${mr.label} เข้ากลุ่ม LINE?`)) return
    try { await api.post('/reports/monthly/send-line', { period: mr.period }); window.alert('ส่งเข้า LINE แล้ว') }
    catch (e) { window.alert('ส่งไม่สำเร็จ: ' + (e as Error).message) }
  }

  if (!reports) {
    return (
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        <div style={{ background: '#fff', border: '1px dashed #CFD8DF', borderRadius: 14, padding: '54px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1C2730' }}>ไม่มีสิทธิ์ดูรายงาน</div>
          <div style={{ fontSize: 13, color: '#5C6770', marginTop: 6 }}>รายงานเปิดให้เฉพาะบทบาท <b>ผู้ดูแล</b> และ <b>บัญชี</b></div>
        </div>
      </div>
    )
  }

  const { projects, categories, totals } = reports
  const cf = reports.cashflow
  const budget = reports.budget
  const profit = totals.collected - totals.expense
  const maxProj = Math.max(1, ...projects.map((p) => Math.max(p.collected, p.expense)))
  const catTotal = Math.max(1, categories.reduce((s, c) => s + c.amount, 0))

  const exportProjects = () =>
    exportXlsx('report-projects', ['โครงการ', 'มูลค่าสัญญา', 'เก็บแล้ว', 'รายจ่าย', 'กำไรเบื้องต้น'],
      projects.map((p) => [p.project, p.value, p.collected, p.expense, p.collected - p.expense]), 'กำไรรายโครงการ')
  const exportBudget = () =>
    exportXlsx('report-budget', ['บ้าน', 'ต้นทุนแผน', 'จ่ายช่างจริง', 'ค่าวัสดุจริง', 'ใช้จริงรวม', 'คงเหลืองบ'],
      (budget || []).map((b) => [b.name, b.plan, b.actualContractor, b.actualMaterial, b.actual, b.variance]), 'งบประมาณ vs จริง')

  return (
    <>
    {mr && <MonthlyReportDoc r={mr} onClose={() => setMr(null)} onSendLine={sendMonthlyLine} />}
    <div className="print-area page-print" style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12.5, color: '#5C6770' }}>รายงานประจำเดือน</span>
        <input type="month" value={mrPeriod} onChange={(e) => setMrPeriod(e.target.value)} style={{ fontFamily: 'inherit', fontSize: 12.5, border: '1px solid #D2DAE1', borderRadius: 8, padding: '6px 9px' }} />
        <button onClick={openMonthly} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '8px 14px', cursor: 'pointer' }}>📊 เปิดรายงานผู้บริหาร</button>
        <button onClick={() => window.print()} className="hov-f3f5f7" style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '8px 14px', cursor: 'pointer' }}>🖨 พิมพ์ / บันทึก PDF</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        <Kpi label="มูลค่าสัญญารวม" value={baht(totals.contract)} color="#1C2730" />
        <Kpi label="เก็บเงินแล้ว" value={baht(totals.collected)} color="#2E7D55" />
        <Kpi label="รายจ่ายรวม" value={baht(totals.expense)} color="#C24036" />
        <Kpi label="กำไรเบื้องต้น" value={baht(profit)} color={profit >= 0 ? '#2E7D55' : '#C24036'} />
      </div>

      {/* profit by project */}
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #EEF1F4' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>กำไร-ขาดทุนรายโครงการ</span>
          <span style={{ marginLeft: 14, fontSize: 11.5, color: '#2E7D55' }}>■ เก็บแล้ว</span>
          <span style={{ marginLeft: 10, fontSize: 11.5, color: '#C24036' }}>■ รายจ่าย</span>
          <span style={{ marginLeft: 'auto' }}><ExportButton onClick={exportProjects} /></span>
        </div>
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {projects.length === 0 && <div style={{ textAlign: 'center', color: '#94A0A8', fontSize: 13, padding: 20 }}>ยังไม่มีข้อมูลโครงการ</div>}
          {projects.map((p) => (
            <div key={p.project}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
                <span style={{ fontWeight: 500 }}>{p.project}</span>
                <span className="num" style={{ color: p.collected - p.expense >= 0 ? '#2E7D55' : '#C24036', fontWeight: 600 }}>กำไร {baht(p.collected - p.expense)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ flex: 1, height: 12, background: '#F1F4F6', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: (p.collected / maxProj) * 100 + '%', background: '#2E7D55' }} /></div>
                <span className="num" style={{ width: 90, textAlign: 'right', fontSize: 11.5, color: '#5C6770' }}>{baht(p.collected)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 12, background: '#F1F4F6', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: (p.expense / maxProj) * 100 + '%', background: '#C24036' }} /></div>
                <span className="num" style={{ width: 90, textAlign: 'right', fontSize: 11.5, color: '#5C6770' }}>{baht(p.expense)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* งบกระแสเงินสด — เงินเข้า vs เงินออก (แยกหมวด) */}
      {cf && (
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF1F4', fontSize: 14, fontWeight: 600 }}>งบกระแสเงินสด (สะสม)</div>
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const mx = Math.max(1, cf.in, cf.out)
              const rows: [string, number, string][] = [
                ['เงินเข้า — เก็บจากลูกค้า', cf.in, '#2E7D55'],
                ['เงินออก — จ่ายช่าง', cf.outContractor, '#C0852C'],
                ['เงินออก — ค่าวัสดุ', cf.outMaterial, '#C24036'],
                ['เงินออก — เงินเดือน', cf.outPayroll, '#30506A'],
                ['เงินออก — จ่ายอื่น ๆ', cf.outOther, '#5C6770'],
              ]
              return (<>
                {rows.map(([label, val, color]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 180, fontSize: 12.5 }}>{label}</span>
                    <div style={{ flex: 1, height: 13, background: '#F1F4F6', borderRadius: 5, overflow: 'hidden' }}><div style={{ height: '100%', width: (val / mx) * 100 + '%', background: color }} /></div>
                    <span className="num" style={{ width: 120, textAlign: 'right', fontWeight: 600 }}>{baht(val)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #EEF1F4', paddingTop: 12, fontSize: 14 }}>
                  <span style={{ color: '#5C6770' }}>เงินออกรวม <span className="num" style={{ fontWeight: 600, color: '#C24036' }}>{baht(cf.out)}</span></span>
                  <span>กระแสเงินสดสุทธิ <span className="num" style={{ fontWeight: 700, color: cf.net >= 0 ? '#2E7D55' : '#C24036', marginLeft: 8 }}>{baht(cf.net)}</span></span>
                </div>
              </>)
            })()}
          </div>
        </div>
      )}

      {/* งบประมาณ (ต้นทุนแผน) vs จริง ต่อบ้าน */}
      {budget && budget.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #EEF1F4' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>งบประมาณต้นทุน vs จ่ายจริง</span>
            <span style={{ marginLeft: 'auto' }}><ExportButton onClick={exportBudget} /></span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
              <th style={{ padding: '9px 18px', fontWeight: 600, color: '#5C6770', fontSize: 12 }}>บ้าน</th>
              <th style={{ padding: '9px 12px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'right' }}>ต้นทุนแผน (ช่าง)</th>
              <th style={{ padding: '9px 12px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'right' }}>จ่ายช่างจริง</th>
              <th style={{ padding: '9px 12px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'right' }}>ค่าวัสดุจริง</th>
              <th style={{ padding: '9px 12px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'right' }}>ใช้จริงรวม</th>
              <th style={{ padding: '9px 18px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'right' }}>คงเหลืองบ</th>
            </tr></thead>
            <tbody>
              {budget.map((b) => (
                <tr key={b.code} style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td style={{ padding: '10px 18px', fontWeight: 500 }}>{b.name}</td>
                  <td className="num" style={{ padding: '10px 12px', textAlign: 'right' }}>{baht(b.plan)}</td>
                  <td className="num" style={{ padding: '10px 12px', textAlign: 'right', color: '#C0852C' }}>{baht(b.actualContractor)}</td>
                  <td className="num" style={{ padding: '10px 12px', textAlign: 'right', color: '#C24036' }}>{baht(b.actualMaterial)}</td>
                  <td className="num" style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{baht(b.actual)}</td>
                  <td className="num" style={{ padding: '10px 18px', textAlign: 'right', fontWeight: 700, color: b.variance >= 0 ? '#2E7D55' : '#C24036' }}>{b.variance < 0 ? 'เกินงบ ' : ''}{baht(Math.abs(b.variance))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* expense by category — donut + legend */}
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF1F4', fontSize: 14, fontWeight: 600 }}>ต้นทุนแยกตามหมวด</div>
        <div style={{ padding: 18, display: 'flex', gap: 28, alignItems: 'center' }}>
          {categories.length === 0 ? (
            <div style={{ color: '#94A0A8', fontSize: 13 }}>ยังไม่มีรายจ่าย</div>
          ) : (
            <>
              <Donut data={categories.map((c) => ({ value: c.amount, color: CAT_COLORS[c.cat] || '#94A0A8' }))} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {categories.map((c) => (
                  <div key={c.cat} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 11, height: 11, borderRadius: 3, background: CAT_COLORS[c.cat] || '#94A0A8' }} />
                    <span style={{ fontSize: 13, width: 70 }}>{c.cat}</span>
                    <div style={{ flex: 1, height: 8, background: '#F1F4F6', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: (c.amount / catTotal) * 100 + '%', background: CAT_COLORS[c.cat] || '#94A0A8' }} /></div>
                    <span className="num" style={{ fontSize: 12.5, width: 100, textAlign: 'right', fontWeight: 600 }}>{baht(c.amount)}</span>
                    <span className="num" style={{ fontSize: 11.5, width: 44, textAlign: 'right', color: '#94A0A8' }}>{Math.round((c.amount / catTotal) * 100)}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    </>
  )
}

// minimal SVG donut chart
function Donut({ data }: { data: { value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const R = 52, C = 2 * Math.PI * R
  let offset = 0
  return (
    <svg width="130" height="130" viewBox="0 0 130 130" style={{ flexShrink: 0 }}>
      <circle cx="65" cy="65" r={R} fill="none" stroke="#F1F4F6" strokeWidth="22" />
      {data.map((d, i) => {
        const len = (d.value / total) * C
        const seg = (
          <circle key={i} cx="65" cy="65" r={R} fill="none" stroke={d.color} strokeWidth="22"
            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 65 65)" />
        )
        offset += len
        return seg
      })}
    </svg>
  )
}
