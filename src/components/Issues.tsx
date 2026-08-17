import { useState } from 'react'
import { issuePriorityFilters } from '../erpData'
import { prStyle, isStyle } from '../data'
import { useApp } from '../store'

const th: React.CSSProperties = { padding: '9px 14px', fontWeight: 600, color: '#5C6770', fontSize: 12 }
const td: React.CSSProperties = { padding: '11px 14px' }

function Card({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: '15px 17px' }}>
      <div style={{ fontSize: 12.5, color: '#5C6770' }}>{label}</div>
      <div className="num" style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color }}>{value}</div>
    </div>
  )
}

export default function Issues({ onAddIssue }: { onAddIssue: () => void }) {
  const [filter, setFilter] = useState('all')
  const { issues } = useApp().data
  const rows = issues.filter((r) => filter === 'all' || r.priority === filter)

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        <Card label="ค้างอยู่ทั้งหมด" value={`${issues.filter((i) => i.status !== 'แก้ไขแล้ว').length} ปัญหา`} color="#1C2730" />
        <Card label="ด่วนมาก" value={`${issues.filter((i) => i.priority === 'ด่วนมาก').length} ปัญหา`} color="#C24036" />
        <Card label="กำลังแก้ไข" value={`${issues.filter((i) => i.status === 'กำลังแก้ไข').length} ปัญหา`} color="#30506A" />
        <Card label="แก้ไขแล้ว" value={`${issues.filter((i) => i.status === 'แก้ไขแล้ว').length} ปัญหา`} color="#2E7D55" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 9, padding: 4 }}>
          {issuePriorityFilters.map((f) => {
            const active = filter === f.id
            return (
              <div key={f.id} onClick={() => setFilter(f.id)} style={{ fontSize: 12.5, fontWeight: 500, padding: '6px 13px', borderRadius: 6, cursor: 'pointer', color: active ? '#fff' : '#5C6770', background: active ? '#30506A' : 'transparent' }}>{f.label}</div>
            )
          })}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#5C6770' }}>พบ <span className="num" style={{ fontWeight: 600, color: '#1C2730' }}>{rows.length}</span> ปัญหา</div>
        <button onClick={onAddIssue} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 15px', cursor: 'pointer' }}>+ แจ้งปัญหา</button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
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
            {rows.map((r, i) => {
              const p = prStyle(r.priority)
              const s = isStyle(r.status)
              return (
                <tr key={i} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td style={{ ...td, padding: '11px 18px' }}>
                    <div style={{ fontWeight: 500 }}>{r.house}</div>
                    <div style={{ fontSize: 11.5, color: '#94A0A8' }}>{r.project}</div>
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 500 }}>{r.title}</div>
                    <div style={{ fontSize: 11.5, color: '#94A0A8' }}>{r.note}</div>
                  </td>
                  <td style={{ ...td, color: '#5C6770' }}>{r.by}</td>
                  <td className="num" style={{ ...td, color: '#5C6770' }}>{r.date}</td>
                  <td style={{ ...td, textAlign: 'center' }}><span style={{ fontSize: 11, fontWeight: 600, color: p.c, background: p.bg, padding: '3px 10px', borderRadius: 20 }}>{r.priority}</span></td>
                  <td style={{ ...td, padding: '11px 18px', textAlign: 'center' }}><span style={{ fontSize: 11, fontWeight: 600, color: s.c, background: s.bg, padding: '3px 10px', borderRadius: 20 }}>{r.status}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
