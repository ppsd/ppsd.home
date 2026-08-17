import { useState } from 'react'
import { useApp } from '../store'

const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '8px 11px', outline: 'none' }

function statusColor(s: string) {
  if (s === 'เสร็จ') return '#2E7D55'
  if (s === 'กำลังทำ') return '#30506A'
  if (s === 'ล่าช้า') return '#C24036'
  return '#94A0A8' // วางแผน
}

const DAY = 86400000
const fmt = (d: number) => {
  const x = new Date(d)
  return `${x.getDate()}/${x.getMonth() + 1}`
}

export default function Gantt() {
  const { data, addTask, updateTask } = useApp()
  const tasks = data.tasks
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ house_code: '', name: '', start: '', end: '', progress: '0', status: 'วางแผน', weight: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [scHouse, setScHouse] = useState('') // '' = ทุกบ้าน

  const submit = async () => {
    setBusy(true); setErr('')
    try {
      await addTask({ ...f, progress: Number(f.progress), weight: Number(f.weight) || 0 })
      setAdding(false)
      setF({ house_code: '', name: '', start: '', end: '', progress: '0', status: 'วางแผน', weight: '' })
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const parsed = tasks.map((t) => ({ ...t, s: Date.parse(t.start), e: Date.parse(t.end) })).filter((t) => !isNaN(t.s) && !isNaN(t.e))
  const min = parsed.length ? Math.min(...parsed.map((t) => t.s)) : 0
  const max = parsed.length ? Math.max(...parsed.map((t) => t.e)) : 1
  const span = Math.max(DAY, max - min)

  // ---- S-Curve: แผน vs ทำได้จริง (คิดจากงานในไทม์ไลน์ + น้ำหนักงาน) ----
  const scTasks = parsed.filter((t) => !scHouse || t.house_code === scHouse)
  const totalW = scTasks.reduce((s, t) => s + (t.weight || 1), 0) || 1
  const plannedAt = (d: number) => scTasks.reduce((s, t) => {
    const frac = t.e > t.s ? Math.max(0, Math.min(1, (d - t.s) / (t.e - t.s))) : (d >= t.s ? 1 : 0)
    return s + (t.weight || 1) * frac
  }, 0) / totalW * 100
  const sMin = scTasks.length ? Math.min(...scTasks.map((t) => t.s)) : 0
  const sMax = scTasks.length ? Math.max(...scTasks.map((t) => t.e)) : 1
  const sSpan = Math.max(DAY, sMax - sMin)
  const now = Date.now()
  const plannedNow = scTasks.length ? plannedAt(Math.max(sMin, Math.min(sMax, now))) : 0
  const actualNow = scTasks.reduce((s, t) => s + (t.weight || 1) * (t.progress || 0) / 100, 0) / totalW * 100
  const STEPS = 24
  const planPts = scTasks.length ? Array.from({ length: STEPS + 1 }, (_, i) => {
    const d = sMin + (sSpan * i) / STEPS
    return { x: (i / STEPS) * 100, y: 100 - plannedAt(d) }
  }) : []
  const planPath = planPts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
  const nowX = scTasks.length ? Math.max(0, Math.min(100, ((now - sMin) / sSpan) * 100)) : 0
  const houseOpts = Array.from(new Set(parsed.map((t) => t.house_code).filter(Boolean)))

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 13, color: '#5C6770' }}>งานทั้งหมด <span className="num" style={{ fontWeight: 600, color: '#1C2730' }}>{tasks.length}</span> รายการ</div>
        <button onClick={() => setAdding((v) => !v)} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '10px 16px', cursor: 'pointer' }}>+ เพิ่มงาน</button>
      </div>

      {/* ความคืบหน้าบ้าน (คิดอัตโนมัติจากงวดงานที่เก็บเงินแล้ว) */}
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #EEF1F4', fontSize: 14, fontWeight: 600 }}>
          ความคืบหน้าบ้าน <span style={{ fontSize: 11.5, fontWeight: 400, color: '#94A0A8' }}>(คิดจากงวดงานที่เก็บเงินแล้วโดยอัตโนมัติ)</span>
        </div>
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 11 }}>
          {data.houses.length === 0 && <div style={{ color: '#94A0A8', fontSize: 13 }}>ยังไม่มีบ้าน</div>}
          {data.houses.map((h) => (
            <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 200, fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</span>
              <div style={{ flex: 1, height: 13, background: '#F1F4F6', borderRadius: 5, overflow: 'hidden' }}><div style={{ height: '100%', width: (h.pct || 0) + '%', background: (h.pct || 0) >= 100 ? '#2E7D55' : '#30506A' }} /></div>
              <span className="num" style={{ width: 44, textAlign: 'right', fontWeight: 700, fontSize: 13, color: (h.pct || 0) >= 100 ? '#2E7D55' : '#1C2730' }}>{h.pct || 0}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* S-Curve: แผน vs ทำได้จริง */}
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid #EEF1F4' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>S-Curve · แผน vs ทำได้จริง</span>
          <select value={scHouse} onChange={(e) => setScHouse(e.target.value)} style={{ ...field, padding: '5px 9px', fontSize: 12.5, width: 'auto' }}>
            <option value="">ทุกบ้าน/โครงการ</option>
            {houseOpts.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: 12.5 }}>
            <span style={{ color: '#5C6770' }}>ตามแผน <b className="num" style={{ color: '#30506A' }}>{plannedNow.toFixed(0)}%</b></span>
            <span style={{ color: '#5C6770' }}>ทำได้จริง <b className="num" style={{ color: actualNow + 0.5 >= plannedNow ? '#2E7D55' : '#C24036' }}>{actualNow.toFixed(0)}%</b></span>
            <span style={{ fontWeight: 600, color: actualNow + 0.5 >= plannedNow ? '#2E7D55' : '#C24036' }}>{actualNow >= plannedNow ? 'เร็วกว่าแผน' : 'ช้ากว่าแผน'} {Math.abs(actualNow - plannedNow).toFixed(0)}%</span>
          </div>
        </div>
        <div style={{ padding: 18 }}>
          {scTasks.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94A0A8', fontSize: 13, padding: '20px 0' }}>ยังไม่มีงานในไทม์ไลน์ — เพิ่มงานพร้อมระบุน้ำหนัก% เพื่อดู S-Curve</div>
          ) : (
            <div style={{ position: 'relative', height: 220 }}>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                {[0, 25, 50, 75, 100].map((g) => <line key={g} x1="0" y1={100 - g} x2="100" y2={100 - g} stroke="#EEF1F4" strokeWidth="0.4" />)}
                <line x1={nowX} y1="0" x2={nowX} y2="100" stroke="#C0852C" strokeWidth="0.5" strokeDasharray="2 1.5" />
                <path d={planPath} fill="none" stroke="#30506A" strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
                <line x1="0" y1={100 - actualNow} x2={nowX} y2={100 - actualNow} stroke="#2E7D55" strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
                <circle cx={nowX} cy={100 - actualNow} r="1.1" fill="#2E7D55" vectorEffect="non-scaling-stroke" />
              </svg>
              {[100, 75, 50, 25, 0].map((g) => <div key={g} style={{ position: 'absolute', left: 0, top: `calc(${100 - g}% - 7px)`, fontSize: 10, color: '#94A0A8' }}>{g}%</div>)}
              <div style={{ position: 'absolute', left: `${nowX}%`, top: -2, transform: 'translateX(-50%)', fontSize: 10, color: '#C0852C', fontWeight: 600 }}>วันนี้</div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11.5, color: '#5C6770', justifyContent: 'center' }}>
            <span><span style={{ display: 'inline-block', width: 14, height: 3, background: '#30506A', verticalAlign: 'middle', marginRight: 5 }} />เส้นแผน</span>
            <span><span style={{ display: 'inline-block', width: 14, height: 3, background: '#2E7D55', verticalAlign: 'middle', marginRight: 5 }} />ทำได้จริง (ณ วันนี้)</span>
          </div>
        </div>
      </div>

      {adding && (
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 0.7fr 1fr', gap: 12, alignItems: 'center' }}>
            <input style={field} placeholder="ชื่องาน *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <input style={field} placeholder="รหัสบ้าน" value={f.house_code} onChange={(e) => setF({ ...f, house_code: e.target.value })} />
            <input style={field} type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
            <input style={field} type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
            <input style={field} type="number" placeholder="น้ำหนัก%" title="น้ำหนักงาน % (สำหรับ S-Curve)" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} />
            <select style={field} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              {['วางแผน', 'กำลังทำ', 'เสร็จ', 'ล่าช้า'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          {err && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 10 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={() => setAdding(false)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ยกเลิก</button>
            <button onClick={submit} disabled={busy} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
          </div>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid #EEF1F4', fontSize: 14, fontWeight: 600 }}>
          ไทม์ไลน์ก่อสร้าง
          {parsed.length > 0 && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#94A0A8' }}>{fmt(min)} – {fmt(max)}</span>}
        </div>
        <div style={{ padding: '8px 0' }}>
          {tasks.length === 0 && <div style={{ padding: '36px', textAlign: 'center', color: '#94A0A8', fontSize: 13 }}>ยังไม่มีงาน — กด “เพิ่มงาน”</div>}
          {parsed.map((t) => {
            const left = ((t.s - min) / span) * 100
            const width = Math.max(2, ((t.e - t.s) / span) * 100)
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 18px' }}>
                <div style={{ width: 180, minWidth: 180 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: '#94A0A8' }}>{t.house_code || '—'} · {fmt(t.s)}–{fmt(t.e)}</div>
                </div>
                <div style={{ flex: 1, position: 'relative', height: 22, background: '#F7F9FB', borderRadius: 5 }}>
                  <div style={{ position: 'absolute', left: left + '%', width: width + '%', top: 0, height: 22, background: statusColor(t.status) + '33', border: `1px solid ${statusColor(t.status)}`, borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: t.progress + '%', background: statusColor(t.status) }} />
                  </div>
                </div>
                <div style={{ width: 120, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                  <input type="number" min={0} max={100} defaultValue={t.progress} onBlur={(e) => updateTask(t.id, { progress: Number(e.target.value), status: t.status })}
                    style={{ width: 52, fontFamily: 'inherit', fontSize: 12, textAlign: 'right', border: '1px solid #D2DAE1', borderRadius: 6, padding: '3px 6px', outline: 'none' }} />
                  <span style={{ fontSize: 12, color: '#94A0A8' }}>%</span>
                </div>
                <select value={t.status} onChange={(e) => updateTask(t.id, { progress: t.progress, status: e.target.value })}
                  style={{ fontFamily: 'inherit', fontSize: 11.5, color: statusColor(t.status), border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 7px', outline: 'none', width: 92 }}>
                  {['วางแผน', 'กำลังทำ', 'เสร็จ', 'ล่าช้า'].map((s) => <option key={s} style={{ color: '#1C2730' }}>{s}</option>)}
                </select>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
