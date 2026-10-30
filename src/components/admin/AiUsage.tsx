import { useEffect, useState } from 'react'
import { api } from '../../api'

// ค่าใช้จ่าย AI ในระบบ — ประมาณจาก token/การค้นเว็บของทุกครั้งที่เรียก × ราคาประกาศ (บิลจริงดูที่ console.anthropic.com)

interface Sum { calls: number; cost: number; input: number; output: number; searches: number }
interface Usage {
  month: string
  this_month: Sum
  all_time: Sum
  by_feature: { feature: string; calls: number; cost: number }[]
  by_month: { month: string; calls: number; cost: number }[]
  recent: { id: number; at: string; feature: string; model: string; by: string; ok: number; input_tokens: number; output_tokens: number; web_searches: number; cost_usd: number }[]
  cache: { files: number; hits: number; saved: number }
}
const usd = (n: number) => '$' + (n || 0).toFixed(n >= 10 ? 0 : 2)
const kt = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n || 0)

export default function AiUsage() {
  const [u, setU] = useState<Usage | null>(null)
  const [showRecent, setShowRecent] = useState(false)
  const load = () => api.get<Usage>('/ai-usage').then(setU).catch(() => setU(null))
  useEffect(() => { load() }, [])
  if (!u) return null
  const box: React.CSSProperties = { background: '#F7F9FB', border: '1px solid #E6E9ED', borderRadius: 9, padding: '9px 12px' }
  const label: React.CSSProperties = { fontSize: 11.5, color: '#5C6770' }
  const big: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: '#1C2730' }
  const td: React.CSSProperties = { padding: '5px 8px', fontSize: 12.5, borderTop: '1px solid #EEF1F4' }
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #E6E0F1' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: '#6B4E9E' }}>💸 ค่าใช้จ่าย AI ในระบบ</span>
        <span style={{ fontSize: 11.5, color: '#94A0A8' }}>ประมาณจากราคาประกาศ — บิลจริงดูที่ console.anthropic.com</span>
        <button onClick={load} className="hov-f3f5f7" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '3px 10px', cursor: 'pointer' }}>↻</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        <div style={box}><div style={label}>เดือนนี้ ({u.month})</div><div style={big}>{usd(u.this_month.cost)}</div><div style={label}>{u.this_month.calls} ครั้ง · ค้นเว็บ {u.this_month.searches}</div></div>
        <div style={box}><div style={label}>ทั้งหมดตั้งแต่เริ่มบันทึก</div><div style={big}>{usd(u.all_time.cost)}</div><div style={label}>{u.all_time.calls} ครั้ง · token เข้า {kt(u.all_time.input)} / ออก {kt(u.all_time.output)}</div></div>
        <div style={box}><div style={label}>ประหยัดจากใช้ผลถอดแบบเดิม</div><div style={{ ...big, color: '#2E7D55' }}>{usd(u.cache.saved)}</div><div style={label}>ใช้ผลเดิม {u.cache.hits} ครั้ง · จำไว้ {u.cache.files} ชุดแบบ</div></div>
      </div>
      {u.by_feature.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
          <thead><tr style={{ textAlign: 'left', fontSize: 11.5, color: '#5C6770' }}><th style={{ padding: '4px 8px' }}>ใช้กับ (เดือนนี้)</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>ครั้ง</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>ค่าใช้จ่าย</th></tr></thead>
          <tbody>{u.by_feature.map((f) => <tr key={f.feature}><td style={td}>{f.feature}</td><td className="num" style={{ ...td, textAlign: 'right' }}>{f.calls}</td><td className="num" style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{usd(f.cost)}</td></tr>)}</tbody>
        </table>
      )}
      {u.by_month.length > 1 && <div style={{ fontSize: 12, color: '#5C6770', marginTop: 8 }}>รายเดือน: {u.by_month.map((m) => `${m.month} ${usd(m.cost)}`).join(' · ')}</div>}
      {u.recent.length > 0 && <>
        <button onClick={() => setShowRecent(!showRecent)} style={{ marginTop: 8, fontFamily: 'inherit', fontSize: 12, color: '#30506A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{showRecent ? '▼' : '▶'} รายการล่าสุด ({u.recent.length})</button>
        {showRecent && (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
            <tbody>{u.recent.map((r) => (
              <tr key={r.id} style={{ opacity: r.ok ? 1 : 0.6 }}>
                <td style={{ ...td, color: '#5C6770', whiteSpace: 'nowrap' }}>{r.at}</td><td style={td}>{r.feature}{!r.ok && ' (ไม่สำเร็จ)'}</td>
                <td style={{ ...td, color: '#5C6770' }}>{r.by}</td><td style={{ ...td, color: '#94A0A8', fontSize: 11.5 }}>{r.model} · {kt(r.input_tokens)}/{kt(r.output_tokens)}{r.web_searches ? ` · ค้นเว็บ ${r.web_searches}` : ''}</td>
                <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{usd(r.cost_usd)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </>}
      {!u.all_time.calls && <div style={{ fontSize: 12, color: '#94A0A8', marginTop: 6 }}>ยังไม่มีการเรียก AI ตั้งแต่เริ่มบันทึก (เริ่มเก็บตั้งแต่ตอนนี้)</div>}
    </div>
  )
}
