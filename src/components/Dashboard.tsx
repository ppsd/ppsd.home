import Icon from './Icon'
import {
  statCards,
  statusStyle,
  barColor,
  prStyle,
  isStyle,
  baht,
} from '../data'
import { useApp } from '../store'

interface DashboardProps {
  onOpenHouse: (id: number) => void
  onOpenHouseByName: (name: string) => void
  onGoHouses: () => void
}

const th: React.CSSProperties = { padding: '9px 14px', fontWeight: 600, color: '#5C6770', fontSize: 12 }

export default function Dashboard({ onOpenHouse, onOpenHouseByName, onGoHouses }: DashboardProps) {
  const app = useApp()
  const { houses, dashboard, issues, expenses } = app.data
  const progressHouses = houses.slice(0, 6)
  const overdue = dashboard?.overdueList ?? []
  const toCollect = dashboard?.toCollectList ?? []
  const advances = dashboard?.advanceList ?? []

  // company-wide profit summary — managers only
  const isMgr = !!app.user?.isManager
  const profitRows = isMgr
    ? houses.map((h) => {
        const material = expenses.filter((e) => e.house_code === h.code).reduce((s, e) => s + e.amount, 0)
        return { code: h.code, name: h.name, value: h.value || 0, contractor: h.contractor_value || 0, material, net: (h.value || 0) - (h.contractor_value || 0) - material }
      })
    : []
  const pT = profitRows.reduce((a, r) => ({ value: a.value + r.value, contractor: a.contractor + r.contractor, material: a.material + r.material, net: a.net + r.net }), { value: 0, contractor: 0, material: 0, net: 0 })

  // project overview derived live from houses (grouped by project name)
  const projects = (() => {
    const m = new Map<string, { name: string; houses: number; value: number; collected: number }>()
    for (const h of houses) {
      const key = h.project || 'ไม่ระบุโครงการ'
      const g = m.get(key) || { name: key, houses: 0, value: 0, collected: 0 }
      g.houses += 1; g.value += h.value || 0; g.collected += h.collected || 0
      m.set(key, g)
    }
    return [...m.values()].map((g) => ({
      name: g.name,
      houses: g.houses,
      value: baht(g.value),
      collected: baht(g.collected),
      pct: (g.value ? Math.round((g.collected / g.value) * 100) : 0) + '%',
    }))
  })()

  // overlay live counts from the API onto the styled stat cards
  const cards = statCards.map((c) => {
    if (!dashboard) return c
    if (c.label === 'กำลังสร้าง') return { ...c, value: String(dashboard.building) }
    if (c.label === 'ส่งมอบแล้ว') return { ...c, value: String(dashboard.delivered) }
    if (c.label === 'After-service') return { ...c, value: String(dashboard.afterService) }
    if (c.label === 'งวดเลยกำหนด') return { ...c, value: String(dashboard.overdue) }
    if (c.label === 'รายรับสะสม') return { ...c, value: baht(dashboard.collected) }
    if (c.label === 'เงินรอเก็บ') return { ...c, value: baht(dashboard.remain) }
    if (c.label === 'รายจ่าย') return { ...c, value: baht(dashboard.expense) }
    if (c.label === 'เงินสดสุทธิ') return { ...c, value: baht(dashboard.net) }
    return c
  })

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {cards.map((s, i) => (
          <div key={i} style={{ background: s.cardBg, border: `1px solid ${s.cardBorder}`, borderRadius: 12, padding: '15px 17px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, color: s.labelColor }}>{s.label}</span>
              <span style={{ width: 26, height: 26, borderRadius: 7, background: s.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon path={s.icon} size={15} color={s.iconColor} width={1.9} />
              </span>
            </div>
            <div className="num" style={{ fontSize: 27, fontWeight: 700, marginTop: 8, color: s.valueColor, lineHeight: 1 }}>
              {s.value}
              <span style={{ fontSize: 13, fontWeight: 400, color: s.unitColor, marginLeft: 4 }}>{s.unit}</span>
            </div>
            <div style={{ fontSize: 11.5, color: s.subColor, marginTop: 5 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* charts row: การเงินรวม + บ้านตามสถานะ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '13px 18px', borderBottom: '1px solid #EEF1F4', fontSize: 13.5, fontWeight: 600 }}>ภาพรวมการเงิน</div>
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 13 }}>
            {(() => {
              const inc = dashboard?.collected || 0, exp = dashboard?.expense || 0, net = dashboard?.net || 0
              const mx = Math.max(1, inc, exp, Math.abs(net))
              const rows: [string, number, string][] = [['รายรับสะสม', inc, '#2E7D55'], ['รายจ่าย', exp, '#C24036'], ['เงินสดสุทธิ', net, net >= 0 ? '#30506A' : '#C24036']]
              return rows.map(([l, v, c]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 92, fontSize: 12.5, color: '#5C6770' }}>{l}</span>
                  <div style={{ flex: 1, height: 14, background: '#F1F4F6', borderRadius: 5, overflow: 'hidden' }}><div style={{ height: '100%', width: (Math.abs(v) / mx) * 100 + '%', background: c }} /></div>
                  <span className="num" style={{ width: 110, textAlign: 'right', fontWeight: 600, fontSize: 12.5 }}>{baht(v)}</span>
                </div>
              ))
            })()}
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '13px 18px', borderBottom: '1px solid #EEF1F4', fontSize: 13.5, fontWeight: 600 }}>บ้านตามสถานะ</div>
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 11 }}>
            {(() => {
              const counts = new Map<string, number>()
              for (const h of houses) counts.set(h.status, (counts.get(h.status) || 0) + 1)
              const entries = [...counts.entries()]
              const mx = Math.max(1, ...entries.map((e) => e[1]))
              if (entries.length === 0) return <div style={{ color: '#94A0A8', fontSize: 13 }}>ยังไม่มีบ้าน</div>
              return entries.map(([st, n]) => {
                const ss = statusStyle(st)
                return (
                  <div key={st} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 92, fontSize: 12, fontWeight: 600, color: ss.c }}>{st}</span>
                    <div style={{ flex: 1, height: 14, background: '#F1F4F6', borderRadius: 5, overflow: 'hidden' }}><div style={{ height: '100%', width: (n / mx) * 100 + '%', background: ss.c }} /></div>
                    <span className="num" style={{ width: 36, textAlign: 'right', fontWeight: 700, fontSize: 13 }}>{n}</span>
                  </div>
                )
              })
            })()}
          </div>
        </div>
      </div>

      {/* company-wide profit summary — managers only */}
      {isMgr && (
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #EEF1F4' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>สรุปกำไรทุกหลัง</span>
            <span style={{ marginLeft: 9, fontSize: 11.5, color: '#94A0A8' }}>เฉพาะผู้จัดการ · กำไรสุทธิ = ขาย − จ่ายช่าง − วัสดุจริง</span>
            <span className="num" style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: pT.net >= 0 ? '#2E7D55' : '#C24036' }}>กำไรรวม {baht(pT.net)}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
                <th style={{ ...th, padding: '9px 18px' }}>บ้าน</th>
                <th style={{ ...th, textAlign: 'right' }}>ขายลูกค้า</th>
                <th style={{ ...th, textAlign: 'right' }}>จ่ายช่าง</th>
                <th style={{ ...th, textAlign: 'right' }}>วัสดุจริง</th>
                <th style={{ ...th, padding: '9px 18px', textAlign: 'right' }}>กำไรสุทธิ</th>
              </tr>
            </thead>
            <tbody>
              {profitRows.length === 0 && <tr><td colSpan={5} style={{ padding: 28, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีบ้าน</td></tr>}
              {profitRows.map((r) => (
                <tr key={r.code} onClick={() => onOpenHouseByName(r.name)} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6', cursor: 'pointer' }}>
                  <td style={{ padding: '10px 18px', fontWeight: 500 }}>{r.name}</td>
                  <td className="num" style={{ padding: '10px 12px', textAlign: 'right' }}>{baht(r.value)}</td>
                  <td className="num" style={{ padding: '10px 12px', textAlign: 'right', color: '#C0852C' }}>{baht(r.contractor)}</td>
                  <td className="num" style={{ padding: '10px 12px', textAlign: 'right', color: '#C24036' }}>{baht(r.material)}</td>
                  <td className="num" style={{ padding: '10px 18px', textAlign: 'right', fontWeight: 700, color: r.net >= 0 ? '#2E7D55' : '#C24036' }}>{baht(r.net)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #E1E5EA', background: '#F7F9FB' }}>
                <td style={{ padding: '11px 18px', fontWeight: 700 }}>รวมทั้งบริษัท</td>
                <td className="num" style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 700 }}>{baht(pT.value)}</td>
                <td className="num" style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 700, color: '#C0852C' }}>{baht(pT.contractor)}</td>
                <td className="num" style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 700, color: '#C24036' }}>{baht(pT.material)}</td>
                <td className="num" style={{ padding: '11px 18px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: pT.net >= 0 ? '#2E7D55' : '#C24036' }}>{baht(pT.net)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* alerts row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        {/* overdue */}
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', background: '#FBEEEC', borderBottom: '1px solid #F4DAD6' }}>
            <Icon path="M12 4l9 16H3z M12 10v5 M12 17.6v.1" size={16} color="#C24036" width={1.9} />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: '#C24036' }}>งวดเลยกำหนด</span>
            <span className="num" style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#fff', background: '#C24036', borderRadius: 20, padding: '1px 8px' }}>{overdue.length}</span>
          </div>
          <div>
            {overdue.map((o, i) => (
              <div key={i} onClick={() => onOpenHouseByName(o.house)} className="hov-fafbfc" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid #F1F4F6', cursor: 'pointer' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1C2730', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.house}</div>
                  <div style={{ fontSize: 11.5, color: '#5C6770' }}>งวด {o.no} · {o.detail}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="num" style={{ fontSize: 13, fontWeight: 600, color: '#1C2730' }}>{o.amount}</div>
                  <div className="num" style={{ fontSize: 11, fontWeight: 600, color: '#C24036' }}>เลย {o.days} วัน</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* to collect */}
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', background: '#F6ECD6', borderBottom: '1px solid #ECDCB8' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B7791F" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="6" width="18" height="13" rx="2" />
              <circle cx="12" cy="12.5" r="2.3" />
            </svg>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: '#B7791F' }}>เงินที่ควรไปเก็บ</span>
            <span className="num" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#B7791F' }}>{toCollect.length}</span>
          </div>
          <div>
            {toCollect.map((c, i) => (
              <div key={i} onClick={() => onOpenHouseByName(c.house)} className="hov-fafbfc" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid #F1F4F6', cursor: 'pointer' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1C2730', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.house}</div>
                  <div style={{ fontSize: 11.5, color: '#5C6770' }}>{c.detail}</div>
                </div>
                <div className="num" style={{ fontSize: 13, fontWeight: 600, color: '#1C2730', flexShrink: 0 }}>{c.amount}</div>
              </div>
            ))}
          </div>
        </div>

        {/* advance to deduct */}
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', background: '#E2E9EF', borderBottom: '1px solid #D2DEE7' }}>
            <Icon path="M12 3v18 M17 7H9.5a3 3 0 000 6H14a3 3 0 010 6H6" size={16} color="#30506A" width={1.9} />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: '#30506A' }}>เงินล่วงหน้าช่างค้างหัก</span>
            <span className="num" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#30506A' }}>{advances.length}</span>
          </div>
          <div>
            {advances.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid #F1F4F6' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1C2730', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                  <div style={{ fontSize: 11.5, color: '#5C6770' }}>{a.house}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="num" style={{ fontSize: 13, fontWeight: 600, color: '#1C2730' }}>{a.remain}</div>
                  <div style={{ fontSize: 11, color: '#5C6770' }}>ค้างหัก</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* projects + houses progress */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 14, alignItems: 'start' }}>
        {/* projects overview */}
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF1F4', fontSize: 14, fontWeight: 600 }}>ภาพรวมแต่ละโครงการ</div>
          {projects.length === 0 && <div style={{ padding: '28px 18px', textAlign: 'center', color: '#94A0A8', fontSize: 13 }}>ยังไม่มีโครงการ</div>}
          {projects.map((p, i) => (
            <div key={i} style={{ padding: '13px 18px', borderBottom: '1px solid #F1F4F6' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 11.5, color: '#5C6770' }}>{p.houses} หลัง</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#5C6770', marginBottom: 6 }}>
                <span>เก็บแล้ว <span className="num" style={{ fontWeight: 600, color: '#2E7D55' }}>{p.collected}</span></span>
                <span>มูลค่า <span className="num" style={{ fontWeight: 600, color: '#1C2730' }}>{p.value}</span></span>
              </div>
              <div style={{ height: 7, background: '#EEF1F4', borderRadius: 20, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: p.pct, background: '#30506A', borderRadius: 20 }} />
              </div>
            </div>
          ))}
        </div>

        {/* houses progress */}
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #EEF1F4' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>ความคืบหน้าบ้านแต่ละหลัง</span>
            <span onClick={onGoHouses} style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 500, color: '#30506A', cursor: 'pointer' }}>ดูทั้งหมด →</span>
          </div>
          <div>
            {progressHouses.map((h) => {
              const ss = statusStyle(h.status)
              return (
                <div key={h.id} onClick={() => onOpenHouse(h.id)} className="hov-fafbfc" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 18px', borderBottom: '1px solid #F1F4F6', cursor: 'pointer' }}>
                  <div style={{ width: 180, minWidth: 180 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</div>
                    <div style={{ fontSize: 11, color: '#94A0A8' }}>{h.project}</div>
                  </div>
                  <div style={{ flex: 1, height: 8, background: '#EEF1F4', borderRadius: 20, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: h.pct + '%', background: barColor(h.pct), borderRadius: 20 }} />
                  </div>
                  <div className="num" style={{ width: 42, textAlign: 'right', fontSize: 13, fontWeight: 600, color: h.pct >= 100 ? '#2E7D55' : '#1C2730' }}>{h.pct}%</div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: ss.c, background: ss.bg, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap', width: 78, textAlign: 'center' }}>{h.status}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* issues */}
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #EEF1F4' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>ปัญหาหน้างานค้างอยู่</span>
          <span className="num" style={{ marginLeft: 9, fontSize: 11, fontWeight: 700, color: '#B7791F', background: '#F6ECD6', borderRadius: 20, padding: '1px 8px' }}>{issues.length}</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
              <th style={{ ...th, padding: '9px 18px' }}>บ้าน</th>
              <th style={th}>ปัญหา</th>
              <th style={th}>ผู้แจ้ง</th>
              <th style={th}>วันแจ้ง</th>
              <th style={{ ...th, textAlign: 'center' }}>ความเร่งด่วน</th>
              <th style={{ ...th, padding: '9px 18px', textAlign: 'center' }}>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {issues.length === 0 && <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#94A0A8', fontSize: 13 }}>ไม่มีปัญหาค้างอยู่</td></tr>}
            {issues.map((i, idx) => {
              const p = prStyle(i.priority)
              const s = isStyle(i.status)
              return (
                <tr key={idx} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td style={{ padding: '9px 18px', fontWeight: 500 }}>{i.house}</td>
                  <td style={{ padding: '9px 14px', color: '#3C4750' }}>{i.title}</td>
                  <td style={{ padding: '9px 14px', color: '#5C6770' }}>{i.by}</td>
                  <td className="num" style={{ padding: '9px 14px', color: '#5C6770' }}>{i.date}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: p.c, background: p.bg, padding: '3px 10px', borderRadius: 20 }}>{i.priority}</span>
                  </td>
                  <td style={{ padding: '9px 18px', textAlign: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: s.c, background: s.bg, padding: '3px 10px', borderRadius: 20 }}>{i.status}</span>
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
