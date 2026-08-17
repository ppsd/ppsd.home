import { useState } from 'react'
import { expenseCatFilters, expenseSummary } from '../erpData'
import { catStyle, baht } from '../data'
import { useApp } from '../store'
import { exportXlsx, ExportButton } from '../exportCsv'

const th: React.CSSProperties = { padding: '9px 14px', fontWeight: 600, color: '#5C6770', fontSize: 12 }
const td: React.CSSProperties = { padding: '10px 14px' }

export default function Expenses({ onAddExpense }: { onAddExpense: () => void }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const { expenses } = useApp().data

  const todayISO = new Date().toISOString().slice(0, 10)
  const q = search.trim().toLowerCase()
  const rows = expenses.filter((r) => {
    const okC = filter === 'all' || r.cat === filter
    const okQ = !q || (r.house || '').toLowerCase().includes(q) || r.item.toLowerCase().includes(q)
    return okC && okQ
  })
  const total = rows.reduce((s, r) => s + r.amount, 0)

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* category summary (computed from live data) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {expenseSummary.map((s) => {
          const sum = expenses.filter((e) => e.cat === s.label).reduce((a, e) => a + e.amount, 0)
          return (
            <div key={s.label} style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: '15px 17px', borderLeft: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 12.5, color: '#5C6770' }}>{s.label}</div>
              <div className="num" style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: '#1C2730' }}>{baht(sum)}</div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 9, padding: '9px 13px', width: 280 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A0A8" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาบ้าน หรือ รายการ" style={{ border: 'none', background: 'transparent', outline: 'none', fontFamily: 'inherit', fontSize: 13.5, color: '#1C2730', width: '100%' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 9, padding: 4 }}>
          {expenseCatFilters.map((f) => {
            const active = filter === f.id
            return (
              <div key={f.id} onClick={() => setFilter(f.id)} style={{ fontSize: 12.5, fontWeight: 500, padding: '6px 13px', borderRadius: 6, cursor: 'pointer', color: active ? '#fff' : '#5C6770', background: active ? '#30506A' : 'transparent' }}>{f.label}</div>
            )
          })}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#5C6770' }}>พบ <span className="num" style={{ fontWeight: 600, color: '#1C2730' }}>{rows.length}</span> รายการ</div>
        <ExportButton onClick={() => exportXlsx('expenses', ['วันที่', 'บ้าน', 'รายการ', 'หมวด', 'ผู้ขาย', 'จำนวนเงิน'], rows.map((r) => [r.date, r.house || '', r.item, r.cat, r.vendor, r.amount]), 'รายจ่าย')} />
        <button onClick={onAddExpense} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 15px', cursor: 'pointer' }}>+ เพิ่มรายจ่าย</button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
              <th style={{ ...th, padding: '9px 18px' }}>วันที่</th>
              <th style={th}>บ้าน</th>
              <th style={th}>รายการ</th>
              <th style={th}>หมวด</th>
              <th style={th}>ผู้ขาย/ผู้รับ</th>
              <th style={{ ...th, padding: '9px 18px', textAlign: 'right' }}>จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const cs = catStyle(r.cat)
              return (
                <tr key={i} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td className="num" style={{ ...td, padding: '10px 18px', color: '#5C6770' }}>{r.date}{r.date_iso && r.date_iso > todayISO && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: '#B7791F', background: '#F6ECD6', padding: '1px 7px', borderRadius: 20, fontFamily: 'Kanit,sans-serif' }}>กำหนดจ่าย</span>}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{r.house}</td>
                  <td style={{ ...td, color: '#3C4750' }}>{r.item}</td>
                  <td style={td}><span style={{ fontSize: 11, fontWeight: 500, color: cs.c, background: cs.bg, padding: '2px 9px', borderRadius: 20 }}>{r.cat}</span></td>
                  <td style={{ ...td, color: '#5C6770' }}>{r.vendor}</td>
                  <td className="num" style={{ ...td, padding: '10px 18px', textAlign: 'right', fontWeight: 600 }}>{baht(r.amount)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #E1E5EA', background: '#F7F9FB' }}>
              <td colSpan={5} style={{ padding: '11px 18px', fontWeight: 600, color: '#5C6770' }}>รวมรายจ่าย (ตามตัวกรอง)</td>
              <td className="num" style={{ padding: '11px 18px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: '#C24036' }}>{baht(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
