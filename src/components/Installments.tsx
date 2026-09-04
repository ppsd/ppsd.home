import { useState } from 'react'
import { instOntimeStyle, instStatusStyle, installmentFilters } from '../erpData'
import { baht } from '../data'
import { useApp } from '../store'
import { exportXlsx, ExportButton } from '../exportCsv'

const th: React.CSSProperties = { padding: '9px 14px', fontWeight: 600, color: '#5C6770', fontSize: 12 }

function StatCard({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: '15px 17px' }}>
      <div style={{ fontSize: 12.5, color: '#5C6770' }}>{label}</div>
      <div className="num" style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color }}>{value}</div>
      <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 4 }}>{sub}</div>
    </div>
  )
}

export default function Installments() {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const { data, collectInstallment } = useApp()
  const { installments } = data

  const q = search.trim().toLowerCase()
  const rows = installments.filter((r) => {
    const okF = filter === 'all' || (filter === 'เลยกำหนด' ? (r.overdue || r.status === 'เลยกำหนด') : r.status === filter)
    const okQ = !q || (r.house || '').toLowerCase().includes(q)
    return okF && okQ
  })

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* summary (computed from live data) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {([
          ['รอเก็บเงิน', 'รอเก็บเงิน', '#B7791F'],
          ['เลยกำหนด', 'เลยกำหนด', '#C24036'],
          ['เก็บแล้ว', 'เก็บแล้ว', '#2E7D55'],
          ['ยังไม่ถึงกำหนด', 'ยังไม่ถึง', '#1C2730'],
        ] as const).map(([label, status, color]) => {
          const grp = installments.filter((r) => (status === 'เลยกำหนด' ? (r.overdue || r.status === status) : r.status === status))
          const total = grp.reduce((s, r) => s + r.amount, 0)
          return <StatCard key={label} label={label} value={baht(total)} color={color} sub={`${grp.length} งวด`} />
        })}
      </div>

      {/* filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 9, padding: '9px 13px', width: 280 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A0A8" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อบ้าน" style={{ border: 'none', background: 'transparent', outline: 'none', fontFamily: 'inherit', fontSize: 13.5, color: '#1C2730', width: '100%' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 9, padding: 4 }}>
          {installmentFilters.map((f) => {
            const active = filter === f.id
            return (
              <div key={f.id} onClick={() => setFilter(f.id)} style={{ fontSize: 12.5, fontWeight: 500, padding: '6px 13px', borderRadius: 6, cursor: 'pointer', color: active ? '#fff' : '#5C6770', background: active ? '#30506A' : 'transparent' }}>{f.label}</div>
            )
          })}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#5C6770' }}>พบ <span className="num" style={{ fontWeight: 600, color: '#1C2730' }}>{rows.length}</span> งวด</div>
        <ExportButton onClick={() => exportXlsx('installments', ['บ้าน', 'งวด', 'รายละเอียด', 'วันกำหนด', 'ตรงเวลา', 'จำนวนเงิน', 'สถานะ'], rows.map((r) => [r.house || '', r.no, r.detail, r.due, r.ontime, r.amount, r.status]), 'งวดงาน')} />
      </div>

      {/* table */}
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
              <th style={{ ...th, padding: '9px 18px' }}>บ้าน</th>
              <th style={{ ...th, textAlign: 'center' }}>งวด</th>
              <th style={th}>รายละเอียด</th>
              <th style={th}>วันกำหนด</th>
              <th style={{ ...th, textAlign: 'center' }}>ตรงเวลา</th>
              <th style={{ ...th, textAlign: 'right' }}>จำนวนเงิน</th>
              <th style={{ ...th, padding: '9px 18px', textAlign: 'center' }}>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const o = instOntimeStyle(r.ontime)
              const s = instStatusStyle(r.status)
              return (
                <tr key={i} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td style={{ padding: '10px 18px' }}>
                    <div style={{ fontWeight: 500 }}>{r.house}</div>
                    <div style={{ fontSize: 11.5, color: '#94A0A8' }}>{r.project}</div>
                  </td>
                  <td className="num" style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600 }}>{r.no}</td>
                  <td style={{ padding: '10px 14px', color: '#3C4750' }}>{r.detail}</td>
                  <td className="num" style={{ padding: '10px 14px', color: '#5C6770' }}>{r.due}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: o.c, background: o.bg, padding: '2px 9px', borderRadius: 20 }}>{r.ontime}</span>
                  </td>
                  <td className="num" style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{baht(r.amount)}</td>
                  <td style={{ padding: '10px 18px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: s.c, background: s.bg, padding: '2px 10px', borderRadius: 20 }}>{r.status}</span>
                      {r.overdue && r.status !== 'เลยกำหนด' && <span style={{ fontSize: 11, fontWeight: 700, color: '#C24036', background: '#FBEEEC', padding: '2px 10px', borderRadius: 20 }}>เลยกำหนด</span>}
                      {r.status !== 'เก็บแล้ว' && <button onClick={() => collectInstallment(r.id, r.house_code)} style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>เก็บเงิน</button>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
