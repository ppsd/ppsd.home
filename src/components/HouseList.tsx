import { filters, statusStyle, barColor, baht } from '../data'
import { useApp } from '../store'

interface HouseListProps {
  search: string
  statusFilter: string
  onSearch: (v: string) => void
  onSetFilter: (id: string) => void
  onOpenHouse: (id: number) => void
  onAddHouse: () => void
}

export default function HouseList({ search, statusFilter, onSearch, onSetFilter, onOpenHouse, onAddHouse }: HouseListProps) {
  const { houses } = useApp().data
  const q = search.trim().toLowerCase()
  const filtered = houses.filter((h) => {
    const okS = statusFilter === 'all' || h.status === statusFilter
    const okQ = !q || h.name.toLowerCase().includes(q) || h.customer.toLowerCase().includes(q)
    return okS && okQ
  })

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 9, padding: '9px 13px', width: 300 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A0A8" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="ค้นหาชื่อบ้าน หรือ ลูกค้า"
            style={{ border: 'none', background: 'transparent', outline: 'none', fontFamily: 'inherit', fontSize: 13.5, color: '#1C2730', width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 9, padding: 4 }}>
          {filters.map((f) => {
            const active = statusFilter === f.id
            return (
              <div
                key={f.id}
                onClick={() => onSetFilter(f.id)}
                style={{ fontSize: 12.5, fontWeight: 500, padding: '6px 13px', borderRadius: 6, cursor: 'pointer', color: active ? '#fff' : '#5C6770', background: active ? '#30506A' : 'transparent' }}
              >
                {f.label}
              </div>
            )
          })}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#5C6770' }}>
          พบ <span className="num" style={{ fontWeight: 600, color: '#1C2730' }}>{filtered.length}</span> หลัง
        </div>
        <button onClick={onAddHouse} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '10px 16px', cursor: 'pointer' }}>
          + เพิ่มบ้าน
        </button>
      </div>

      {/* house cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        {filtered.map((h) => {
          const ss = statusStyle(h.status)
          return (
            <div key={h.id} onClick={() => onOpenHouse(h.id)} className="house-card" style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 13, overflow: 'hidden', cursor: 'pointer' }}>
              <div style={{ height: 96, background: 'repeating-linear-gradient(135deg,#EAEEF2 0 12px,#E2E8ED 12px 24px)', position: 'relative', display: 'flex', alignItems: 'flex-end', padding: 11 }}>
                <span style={{ position: 'absolute', top: 11, right: 11, fontSize: 11, fontWeight: 600, color: ss.c, background: ss.bg, padding: '3px 10px', borderRadius: 20 }}>{h.status}</span>
                <span style={{ fontSize: 10.5, color: '#8A98A3', fontFamily: 'monospace', background: 'rgba(255,255,255,.7)', padding: '2px 7px', borderRadius: 5 }}>{h.code}</span>
              </div>
              <div style={{ padding: '14px 16px 16px' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1C2730' }}>{h.name}</div>
                <div style={{ fontSize: 12, color: '#94A0A8', marginTop: 1 }}>{h.project} · {h.customer}</div>

                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 13 }}>
                  <span style={{ fontSize: 11.5, color: '#5C6770' }}>มูลค่าสัญญา</span>
                  <span className="num" style={{ fontSize: 16, fontWeight: 700, color: '#1C2730' }}>{baht(h.value)}</span>
                </div>

                <div style={{ marginTop: 11 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 5 }}>
                    <span style={{ color: '#5C6770' }}>ความคืบหน้า</span>
                    <span className="num" style={{ fontWeight: 600, color: h.pct >= 100 ? '#2E7D55' : '#1C2730' }}>{h.pct}%</span>
                  </div>
                  <div style={{ height: 8, background: '#EEF1F4', borderRadius: 20, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: h.pct + '%', background: barColor(h.pct), borderRadius: 20 }} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 13, paddingTop: 12, borderTop: '1px solid #F1F4F6' }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#94A0A8' }}>เก็บแล้ว</div>
                    <div className="num" style={{ fontSize: 13, fontWeight: 600, color: '#2E7D55' }}>{baht(h.collected)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#94A0A8' }}>ค้างเก็บ</div>
                    <div className="num" style={{ fontSize: 13, fontWeight: 600, color: '#C0852C' }}>{baht(h.remain)}</div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
