import { useState } from 'react'
import { api } from '../../api'
import { PMS_PART_MAX, type KpiSet, type KpiSetsPayload } from '../../pmsTemplates'

// ตั้งค่าชุด KPI (แบบฟอร์มประเมิน) + ผูกตำแหน่ง → ชุด KPI — เข้าได้เฉพาะ CEO / ผู้ดูแลระบบ (หลังยืนยัน PIN ในหน้าประเมิน)
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '6px 8px', outline: 'none' }
const th: React.CSSProperties = { padding: '7px 9px', fontWeight: 600, color: '#5C6770', fontSize: 11.5 }
const card: React.CSSProperties = { background: '#fff', border: '1px solid #E1E5EA', borderRadius: 10, overflow: 'hidden' }
const btn: React.CSSProperties = { fontFamily: 'inherit', fontSize: 12, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '5px 11px', cursor: 'pointer' }
const sum = (a: { weight: number }[]) => Math.round(a.reduce((s, x) => s + (Number(x.weight) || 0), 0) * 100) / 100

type Part = 'kpi' | 'competency' | 'behavior'
const PART_LABEL: Record<Part, string> = { kpi: 'ส่วนที่ 1 · KPI', competency: 'ส่วนที่ 2 · Competency', behavior: 'ส่วนที่ 3 · Behavior' }

export default function PmsKpiSets({ payload, onChange, onBack }: { payload: KpiSetsPayload; onChange: (p: KpiSetsPayload) => void; onBack: () => void }) {
  const { sets, mapping, positions, empCount, overrides } = payload
  const [edit, setEdit] = useState<KpiSet | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const setName = (id?: number | null) => sets.find((s) => s.id === id)?.name || ''
  const linkPosition = async (position: string, set_id: number | null) => {
    try { onChange(await api.put<KpiSetsPayload>('/pms/position-sets', { position, set_id })) } catch (e) { alert((e as Error).message) }
  }
  const newSet = () => {
    setErr('')
    setEdit({ id: 0, name: '', note: '', kpi: [{ name: '', weight: 70, target: 100 }], competency: [{ name: '', weight: 20 }], behavior: sets[0]?.behavior.map((b) => ({ ...b })) || [{ name: '', weight: 10 }] })
  }
  const copySet = (s: KpiSet) => { setErr(''); setEdit({ ...JSON.parse(JSON.stringify(s)), id: 0, name: s.name + ' (สำเนา)' }) }
  const save = async () => {
    if (!edit) return
    setBusy(true); setErr('')
    try {
      const p = edit.id ? await api.put<KpiSetsPayload>('/pms/kpi-sets/' + edit.id, edit) : await api.post<KpiSetsPayload>('/pms/kpi-sets', edit)
      onChange(p); setEdit(null)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const remove = async (s: KpiSet) => {
    const used = positions.filter((p) => mapping[p] === s.id)
    if (!confirm(`ลบชุด KPI "${s.name}"?${used.length ? `\nตำแหน่งที่ผูกอยู่ (${used.join(', ')}) จะถูกถอดออก` : ''}\nใบประเมินที่บันทึกไปแล้วไม่ได้รับผลกระทบ`)) return
    try { onChange(await api.del<KpiSetsPayload>('/pms/kpi-sets/' + s.id)); setEdit(null) } catch (e) { alert((e as Error).message) }
  }

  if (edit) {
    const setRow = (part: Part, i: number, patch: Record<string, unknown>) => setEdit({ ...edit, [part]: (edit[part] as { name: string; weight: number }[]).map((x, j) => (j === i ? { ...x, ...patch } : x)) })
    const addRow = (part: Part) => setEdit({ ...edit, [part]: [...edit[part], part === 'kpi' ? { name: '', weight: 0, target: 100 } : { name: '', weight: 0 }] })
    const delRow = (part: Part, i: number) => setEdit({ ...edit, [part]: edit[part].filter((_, j) => j !== i) })
    const Section = ({ part }: { part: Part }) => {
      const rows = edit[part] as { name: string; weight: number; target?: number }[]
      const total = sum(rows), ok = total === PMS_PART_MAX[part]
      return (
        <div style={card}>
          <div style={{ padding: '9px 12px', borderBottom: '1px solid #EEF1F4', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center' }}>
            {PART_LABEL[part]}
            <span className="num" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: ok ? '#2E7D55' : '#C24036' }}>น้ำหนักรวม {total} / {PMS_PART_MAX[part]}{ok ? ' ✓' : ''}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
              <th style={th}>หัวข้อ</th><th style={{ ...th, width: 80, textAlign: 'center' }}>น้ำหนัก</th>{part === 'kpi' && <th style={{ ...th, width: 90, textAlign: 'center' }}>เป้า %</th>}<th style={{ ...th, width: 36 }} />
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td style={{ padding: '4px 9px' }}><input style={{ ...field, width: '100%' }} value={r.name} placeholder="ชื่อหัวข้อ" onChange={(e) => setRow(part, i, { name: e.target.value })} /></td>
                  <td style={{ padding: '4px 9px', textAlign: 'center' }}><input type="number" style={{ ...field, width: 64, textAlign: 'center' }} value={r.weight || ''} onChange={(e) => setRow(part, i, { weight: Number(e.target.value) })} /></td>
                  {part === 'kpi' && <td style={{ padding: '4px 9px', textAlign: 'center' }}><input type="number" style={{ ...field, width: 70, textAlign: 'center' }} value={r.target || ''} onChange={(e) => setRow(part, i, { target: Number(e.target.value) })} /></td>}
                  <td style={{ padding: '4px 6px', textAlign: 'center' }}><button onClick={() => delRow(part, i)} title="ลบหัวข้อ" style={{ border: 'none', background: 'none', color: '#C24036', cursor: 'pointer', fontSize: 13 }}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: 8 }}><button onClick={() => addRow(part)} style={{ ...btn, border: '1px dashed #B9C6D0' }}>+ เพิ่มหัวข้อ</button></div>
        </div>
      )
    }
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setEdit(null)} style={btn}>← กลับ</button>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{edit.id ? 'แก้ไขชุด KPI' : 'สร้างชุด KPI ใหม่'}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
          <div><div style={{ fontSize: 12, color: '#5C6770', marginBottom: 4 }}>ชื่อชุด KPI</div><input style={{ ...field, width: '100%' }} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="เช่น วิศวกรโครงการ" /></div>
          <div><div style={{ fontSize: 12, color: '#5C6770', marginBottom: 4 }}>หมายเหตุ</div><input style={{ ...field, width: '100%' }} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="(ไม่บังคับ)" /></div>
        </div>
        {Section({ part: 'kpi' })}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{Section({ part: 'competency' })}{Section({ part: 'behavior' })}</div>
        <div style={{ fontSize: 11.5, color: '#94A0A8' }}>แก้ชุด KPI แล้วจะมีผลกับการประเมินครั้งถัดไปเท่านั้น — ใบประเมินที่บันทึกไปแล้วเก็บหัวข้อเดิมไว้</div>
        {err && <div style={{ fontSize: 12.5, color: '#C24036' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {edit.id > 0 && <button onClick={() => remove(edit)} style={{ ...btn, color: '#C24036', borderColor: '#E7CDC9', marginRight: 'auto' }}>ลบชุดนี้</button>}
          <button onClick={() => setEdit(null)} style={btn}>ยกเลิก</button>
          <button onClick={save} disabled={busy} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '8px 18px', cursor: 'pointer' }}>{busy ? 'กำลังบันทึก…' : 'บันทึกชุด KPI'}</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack} style={btn}>← ใบประเมิน</button>
        <div style={{ fontSize: 15, fontWeight: 600 }}>ชุด KPI ตามตำแหน่ง</div>
        <button onClick={newSet} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '8px 16px', cursor: 'pointer' }}>+ ชุด KPI ใหม่</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)', gap: 14, alignItems: 'start' }}>
        {/* ตำแหน่ง → ชุด KPI */}
        <div style={card}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #EEF1F4', fontSize: 13, fontWeight: 600 }}>ผูกตำแหน่งกับชุด KPI <span style={{ fontWeight: 400, color: '#94A0A8', fontSize: 11.5 }}>· เลือกพนักงานในใบประเมินแล้วดึงชุดนี้ให้อัตโนมัติ</span></div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}><th style={{ ...th, paddingLeft: 14 }}>ตำแหน่ง</th><th style={{ ...th, textAlign: 'center', width: 70 }}>พนักงาน</th><th style={th}>ชุด KPI</th></tr></thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p} style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td style={{ padding: '6px 14px' }}>{p}</td>
                  <td className="num" style={{ padding: '6px 9px', textAlign: 'center', color: '#5C6770' }}>{empCount[p] || 0}</td>
                  <td style={{ padding: '6px 9px' }}>
                    <select style={{ ...field, width: '100%', color: mapping[p] ? '#1C2730' : '#C24036' }} value={mapping[p] || ''} onChange={(e) => linkPosition(p, Number(e.target.value) || null)}>
                      <option value="">— ยังไม่ผูก —</option>
                      {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {overrides.length > 0 && (
            <div style={{ padding: '10px 14px', borderTop: '1px solid #EEF1F4', fontSize: 12, color: '#5C6770' }}>
              <b>ตั้งชุด KPI เฉพาะคน:</b> {overrides.map((o) => `${o.name} → ${setName(o.kpi_set_id) || '-'}`).join(' · ')}
            </div>
          )}
        </div>
        {/* รายการชุด KPI */}
        <div style={card}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #EEF1F4', fontSize: 13, fontWeight: 600 }}>ชุด KPI ทั้งหมด <span className="num" style={{ fontWeight: 400, color: '#94A0A8' }}>({sets.length})</span></div>
          {sets.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: '#94A0A8', fontSize: 13 }}>ยังไม่มีชุด KPI — กด “ชุด KPI ใหม่”</div>}
          {sets.map((s) => {
            const used = positions.filter((p) => mapping[p] === s.id)
            return (
              <div key={s.id} className="hov-fafbfc" style={{ padding: '10px 14px', borderTop: '1px solid #F1F4F6', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{s.name}</div>
                  <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 2 }}>KPI {s.kpi.length} ข้อ · Competency {s.competency.length} · Behavior {s.behavior.length}{used.length ? ` · ใช้กับ: ${used.join(', ')}` : ' · ยังไม่ได้ผูกตำแหน่ง'}</div>
                </div>
                <button onClick={() => copySet(s)} style={btn} title="สร้างชุดใหม่จากชุดนี้">คัดลอก</button>
                <button onClick={() => { setErr(''); setEdit(JSON.parse(JSON.stringify(s))) }} style={btn}>แก้ไข</button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
