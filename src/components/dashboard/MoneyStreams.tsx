import { useEffect, useState } from 'react'
import { api } from '../../api'
import { baht } from '../../data'
import { exportXlsx, ExportButton } from '../../exportCsv'

// ภาพรวมเงิน 4 ขา (หน้า รายงาน) — ตามบัญชี GL รายเดือน
//  1) จ่ายเพื่อบ้าน (จัดซื้อ/จัดจ้างแต่ละหลัง) · 2) ภายในบริษัท (ออฟฟิศ + เงินเดือน + รายการไม่ผูกบ้าน)
//  3) การตลาด / สื่อโฆษณา · 4) เงินเข้าจากลูกค้า

interface Month { ym: string; customer_in: number; other_in: number; house_out: number; company_out: number; marketing_out: number }
interface Streams {
  year: string; months: Month[]; total: Omit<Month, 'ym'>
  houses: { code: string; name: string; customer: string; status: string; in: number; out: number }[]
  company_by_account: { name: string; amount: number }[]
  marketing_by_account: { name: string; amount: number }[]
  marketing_by_cat: { name: string; amount: number }[]
  marketing_projects: string[]
}

const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const C = { in: '#2E7D55', house: '#C0852C', company: '#30506A', mkt: '#8A3B6E' }
const card: React.CSSProperties = { background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }
const th: React.CSSProperties = { padding: '9px 12px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'right', background: '#F7F9FB', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '9px 12px', fontSize: 13, textAlign: 'right', borderTop: '1px solid #F1F4F6', whiteSpace: 'nowrap' }

function Tile({ n, label, value, color, sub }: { n: string; label: string; value: number; color: string; sub: string }) {
  return (
    <div style={{ ...card, padding: '14px 16px', borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 12, color: '#5C6770' }}><b style={{ color }}>{n}</b> {label}</div>
      <div className="num" style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color }}>{baht(value)}</div>
      <div style={{ fontSize: 11, color: '#94A0A8', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function Breakdown({ title, rows, color, empty }: { title: string; rows: { name: string; amount: number }[]; color: string; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.amount)))
  return (
    <div style={card}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #EEF1F4', fontSize: 13.5, fontWeight: 600 }}>{title}</div>
      {rows.length === 0 ? <div style={{ padding: 16, fontSize: 12.5, color: '#94A0A8' }}>{empty}</div> : (
        <div style={{ padding: '8px 16px 14px', display: 'grid', gap: 8 }}>
          {rows.map((r) => (
            <div key={r.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}><span>{r.name}</span><span className="num" style={{ fontWeight: 600 }}>{baht(r.amount)}</span></div>
              <div style={{ height: 6, background: '#F1F4F6', borderRadius: 4, marginTop: 3 }}><div style={{ height: 6, width: `${(Math.abs(r.amount) / max) * 100}%`, background: color, borderRadius: 4 }} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MoneyStreams() {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [d, setD] = useState<Streams | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    setErr('')
    api.get<Streams>('/reports/money-streams?year=' + year).then(setD).catch((e) => { setD(null); setErr((e as Error).message) })
  }, [year])

  const t = d?.total
  const outOf = (m: Omit<Month, 'ym'>) => m.house_out + m.company_out + m.marketing_out
  const maxBar = Math.max(1, ...(d?.months || []).map((m) => Math.max(m.customer_in + m.other_in, outOf(m))))
  const exportAll = () => d && exportXlsx(`money-streams-${d.year}`,
    ['เดือน', 'เงินเข้าจากลูกค้า', 'รายได้อื่น', 'จ่ายเพื่อบ้าน', 'จ่ายภายในบริษัท', 'จ่ายการตลาด/โฆษณา', 'สุทธิ'],
    d.months.map((m, i) => [`${TH_M[i]} ${Number(d.year) + 543}`, m.customer_in, m.other_in, m.house_out, m.company_out, m.marketing_out, m.customer_in + m.other_in - outOf(m)]), 'เงิน 4 ขา')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>ภาพรวมเงิน 4 ขา</div>
          <div style={{ fontSize: 12, color: '#94A0A8' }}>ตามยอดที่ลงบัญชีแล้ว (วันที่ลงบัญชี) · ซื้อเครดิตนับตอนรับของ ไม่นับซ้ำตอนจ่าย</div>
        </div>
        <select id="ms-year" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="ปี"
          style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 13, border: '1px solid #D2DAE1', borderRadius: 8, padding: '6px 10px' }}>
          {[thisYear - 2, thisYear - 1, thisYear].map((y) => <option key={y} value={y}>ปี {y + 543}</option>)}
        </select>
        <span className="no-print"><ExportButton onClick={exportAll} /></span>
      </div>
      {err && <div style={{ ...card, padding: 14, color: '#C24036', fontSize: 13 }}>{err}</div>}
      {d && t && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
          <Tile n="4" label="เงินเข้าจากลูกค้า" value={t.customer_in} color={C.in} sub={t.other_in ? `+ รายได้อื่น ${baht(t.other_in)}` : 'รับเงินงวด / ใบเสร็จ'} />
          <Tile n="1" label="จ่ายเพื่อบ้าน (จัดซื้อ/จัดจ้าง)" value={t.house_out} color={C.house} sub={`${d.houses.filter((h) => h.out).length} หลังที่มีรายจ่าย`} />
          <Tile n="2" label="จ่ายภายในบริษัท" value={t.company_out} color={C.company} sub="ออฟฟิศ · เงินเดือน · ค่าใช้จ่ายไม่ผูกบ้าน" />
          <Tile n="3" label="จ่ายการตลาด / โฆษณา" value={t.marketing_out} color={C.mkt} sub={d.marketing_projects.length ? 'ลงที่โครงการ "การตลาด / สื่อโฆษณา"' : 'ยังไม่มีโครงการการตลาด'} />
        </div>

        <div style={card}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #EEF1F4', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>รายเดือน ปี {Number(d.year) + 543}</span>
            {[['เงินเข้า', C.in], ['บ้าน', C.house], ['บริษัท', C.company], ['การตลาด', C.mkt]].map(([l, c]) => (
              <span key={l} style={{ fontSize: 11.5, color: '#5C6770', display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: c }} />{l}</span>
            ))}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead><tr>
                <th style={{ ...th, textAlign: 'left', paddingLeft: 16 }}>เดือน</th><th style={{ ...th, textAlign: 'left', width: 220 }}>เข้า / ออก</th>
                <th style={th}>4 · เงินเข้าลูกค้า</th><th style={th}>1 · บ้าน</th><th style={th}>2 · บริษัท</th><th style={th}>3 · การตลาด</th><th style={th}>สุทธิ</th>
              </tr></thead>
              <tbody>
                {d.months.map((m, i) => {
                  const inn = m.customer_in + m.other_in, out = outOf(m), net = inn - out
                  const w = (v: number) => `${(Math.max(0, v) / maxBar) * 100}%`
                  return (
                    <tr key={m.ym}>
                      <td style={{ ...td, textAlign: 'left', paddingLeft: 16 }}>{TH_M[i]}</td>
                      <td style={{ ...td, textAlign: 'left' }}>
                        <div style={{ height: 7, width: w(inn), background: C.in, borderRadius: 3 }} />
                        <div style={{ height: 7, display: 'flex', marginTop: 2 }}>
                          <div style={{ width: w(m.house_out), background: C.house }} /><div style={{ width: w(m.company_out), background: C.company }} /><div style={{ width: w(m.marketing_out), background: C.mkt }} />
                        </div>
                      </td>
                      <td className="num" style={{ ...td, color: inn ? C.in : '#B8C1C8' }}>{inn ? baht(inn) : '—'}</td>
                      <td className="num" style={{ ...td, color: m.house_out ? '#1C2730' : '#B8C1C8' }}>{m.house_out ? baht(m.house_out) : '—'}</td>
                      <td className="num" style={{ ...td, color: m.company_out ? '#1C2730' : '#B8C1C8' }}>{m.company_out ? baht(m.company_out) : '—'}</td>
                      <td className="num" style={{ ...td, color: m.marketing_out ? '#1C2730' : '#B8C1C8' }}>{m.marketing_out ? baht(m.marketing_out) : '—'}</td>
                      <td className="num" style={{ ...td, fontWeight: 600, color: !inn && !out ? '#B8C1C8' : net >= 0 ? C.in : '#C24036' }}>{!inn && !out ? '—' : baht(net)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot><tr>
                <td style={{ ...td, textAlign: 'left', paddingLeft: 16, fontWeight: 700 }} colSpan={2}>รวมทั้งปี</td>
                <td className="num" style={{ ...td, fontWeight: 700, color: C.in }}>{baht(t.customer_in + t.other_in)}</td>
                <td className="num" style={{ ...td, fontWeight: 700 }}>{baht(t.house_out)}</td>
                <td className="num" style={{ ...td, fontWeight: 700 }}>{baht(t.company_out)}</td>
                <td className="num" style={{ ...td, fontWeight: 700 }}>{baht(t.marketing_out)}</td>
                <td className="num" style={{ ...td, fontWeight: 700, color: t.customer_in + t.other_in - outOf(t) >= 0 ? C.in : '#C24036' }}>{baht(t.customer_in + t.other_in - outOf(t))}</td>
              </tr></tfoot>
            </table>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
          <div style={card}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #EEF1F4', fontSize: 13.5, fontWeight: 600 }}>ขา 1 + 4 · แยกรายบ้าน</div>
            {d.houses.length === 0 ? <div style={{ padding: 16, fontSize: 12.5, color: '#94A0A8' }}>ยังไม่มีรายการของบ้านในปีนี้</div> : (
              <div style={{ overflowX: 'auto', maxHeight: 360 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={{ ...th, textAlign: 'left', paddingLeft: 16 }}>บ้าน</th><th style={th}>รับจากลูกค้า</th><th style={th}>จ่ายเพื่อบ้าน</th></tr></thead>
                  <tbody>{d.houses.map((h) => (
                    <tr key={h.code}>
                      <td style={{ ...td, textAlign: 'left', paddingLeft: 16, whiteSpace: 'normal' }}>{h.name}<div style={{ fontSize: 11, color: '#94A0A8' }}>{h.code}{h.customer ? ' · ' + h.customer : ''}</div></td>
                      <td className="num" style={{ ...td, color: C.in }}>{h.in ? baht(h.in) : '—'}</td>
                      <td className="num" style={td}>{h.out ? baht(h.out) : '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
          <Breakdown title="ขา 2 · ภายในบริษัท แยกตามบัญชี" rows={d.company_by_account} color={C.company} empty="ยังไม่มีค่าใช้จ่ายภายในในปีนี้" />
          <Breakdown title="ขา 3 · การตลาด / โฆษณา แยกหมวด" rows={d.marketing_by_cat.length ? d.marketing_by_cat : d.marketing_by_account} color={C.mkt}
            empty='ยังไม่มีค่าการตลาด — ตอนขอซื้อ/จ้าง/ลงรายจ่าย ให้เลือกโครงการ "การตลาด / สื่อโฆษณา" แล้วเลือกหมวด' />
        </div>
      </>}
    </div>
  )
}
