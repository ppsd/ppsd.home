import { useEffect, useState } from 'react'
import { api } from '../api'
import { useApp } from '../store'
import SafetyPrint from './SafetyPrint'

export interface SafetyRecord { id: number; kind: string; no: string; house_code: string; date: string; title: string; data: Record<string, unknown>; by: string }

type Kind = 'ppe' | 'toolbox' | 'jha'
const KINDS: { id: Kind; label: string }[] = [
  { id: 'ppe', label: 'ตรวจ PPE (อุปกรณ์ป้องกันภัย)' },
  { id: 'toolbox', label: 'Toolbox Talk (คุยก่อนงาน)' },
  { id: 'jha', label: 'JHA (วิเคราะห์งานเสี่ยง)' },
]
export const PPE_ITEMS = ['หมวกนิรภัย', 'รองเท้าเซฟตี้', 'ถุงมือ', 'แว่นตานิรภัย', 'เสื้อสะท้อนแสง', 'เข็มขัดนิรภัย (ที่สูง)', 'ที่อุดหู/ครอบหู', 'หน้ากากกันฝุ่น']
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '8px 10px', outline: 'none', width: '100%' }
const th: React.CSSProperties = { padding: '9px 14px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'left' }
const lbl: React.CSSProperties = { fontSize: 12, color: '#5C6770', marginBottom: 4 }

interface JhaStep { step: string; hazard: string; control: string; risk: string }
const emptyJha: JhaStep = { step: '', hazard: '', control: '', risk: 'ปานกลาง' }

export default function Safety({ houseCode }: { houseCode?: string }) {
  const { data } = useApp()
  const houses = data.houses
  const [kind, setKind] = useState<Kind>('ppe')
  const [allRows, setRows] = useState<SafetyRecord[]>([])
  const rows = houseCode ? allRows.filter((r) => r.house_code === houseCode) : allRows
  const [adding, setAdding] = useState(false)
  const [printing, setPrinting] = useState<SafetyRecord | null>(null)
  const [house, setHouse] = useState(houseCode || '')
  const [title, setTitle] = useState('')
  // per-kind form state
  const [ppe, setPpe] = useState<{ supervisor: string; workers: string; checks: Record<string, boolean>; note: string }>({ supervisor: '', workers: '', checks: {}, note: '' })
  const [tbt, setTbt] = useState({ time: '', speaker: '', attendees: '', hazards: '', controls: '', note: '' })
  const [jha, setJha] = useState<{ analyst: string; reviewer: string; steps: JhaStep[] }>({ analyst: '', reviewer: '', steps: [{ ...emptyJha }] })

  const load = () => api.get<SafetyRecord[]>('/safety-records?kind=' + kind).then(setRows).catch(() => setRows([]))
  useEffect(() => { load(); setAdding(false) /* eslint-disable-next-line */ }, [kind])

  const resetForm = () => { setHouse(houseCode || ''); setTitle(''); setPpe({ supervisor: '', workers: '', checks: {}, note: '' }); setTbt({ time: '', speaker: '', attendees: '', hazards: '', controls: '', note: '' }); setJha({ analyst: '', reviewer: '', steps: [{ ...emptyJha }] }) }
  const submit = async () => {
    const payload: Record<string, unknown> = kind === 'ppe' ? { ...ppe } : kind === 'toolbox' ? { ...tbt } : { analyst: jha.analyst, reviewer: jha.reviewer, steps: jha.steps.filter((s) => s.step.trim()) }
    await api.post('/safety-records', { kind, house_code: house, title, data: payload })
    resetForm(); setAdding(false); load()
  }
  const remove = async (id: number) => { if (confirm('ลบรายการนี้?')) { await api.del('/safety-records/' + id); load() } }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 2, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 11, padding: '6px 8px', flexWrap: 'wrap' }}>
        {KINDS.map((k) => (
          <div key={k.id} onClick={() => setKind(k.id)} style={{ fontSize: 13, fontWeight: kind === k.id ? 600 : 500, color: kind === k.id ? '#fff' : '#5C6770', background: kind === k.id ? '#30506A' : 'transparent', padding: '7px 16px', borderRadius: 7, cursor: 'pointer' }}>{k.label}</div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 13, color: '#5C6770' }}>เอกสาร <b className="num" style={{ color: '#1C2730' }}>{rows.length}</b> ฉบับ</div>
        <button onClick={() => setAdding((v) => !v)} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>+ บันทึกใหม่</button>
      </div>

      {adding && (
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 2fr', gap: 12, marginBottom: 12 }}>
            <div><div style={lbl}>บ้าน / โครงการ</div>{houseCode ? <div style={{ ...field, display: 'flex', alignItems: 'center', color: '#5C6770', background: '#F7F9FB' }}>{houses.find((h) => h.code === houseCode)?.name || houseCode}</div> : <select style={field} value={house} onChange={(e) => setHouse(e.target.value)}><option value="">— เลือกบ้าน —</option>{houses.map((h) => <option key={h.id} value={h.code}>{h.name}</option>)}</select>}</div>
            <div><div style={lbl}>{kind === 'jha' ? 'ชื่องานที่วิเคราะห์' : kind === 'toolbox' ? 'หัวข้อพูดคุย' : 'พื้นที่/งานที่ตรวจ'}</div><input style={field} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          </div>

          {kind === 'ppe' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
                <div><div style={lbl}>หัวหน้างาน/ผู้ตรวจ</div><input style={field} value={ppe.supervisor} onChange={(e) => setPpe({ ...ppe, supervisor: e.target.value })} /></div>
                <div><div style={lbl}>จำนวนคนงาน</div><input style={field} value={ppe.workers} onChange={(e) => setPpe({ ...ppe, workers: e.target.value })} /></div>
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={lbl}>รายการอุปกรณ์ป้องกันภัย (ติ๊กที่ผ่านการตรวจ/สวมใส่ครบ)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 8 }}>
                  {PPE_ITEMS.map((it) => {
                    const on = !!ppe.checks[it]
                    return <label key={it} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '7px 10px', border: '1px solid ' + (on ? '#2E7D55' : '#D2DAE1'), borderRadius: 8, cursor: 'pointer', background: on ? '#E2F1EA' : '#fff' }}>
                      <input type="checkbox" checked={on} onChange={(e) => setPpe({ ...ppe, checks: { ...ppe.checks, [it]: e.target.checked } })} />{it}
                    </label>
                  })}
                </div>
              </div>
              <div style={{ marginTop: 12 }}><div style={lbl}>หมายเหตุ / อุปกรณ์ที่ต้องแก้ไข</div><textarea style={{ ...field, minHeight: 52, resize: 'vertical' }} value={ppe.note} onChange={(e) => setPpe({ ...ppe, note: e.target.value })} /></div>
            </>
          )}

          {kind === 'toolbox' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
              <div><div style={lbl}>เวลา</div><input style={field} value={tbt.time} onChange={(e) => setTbt({ ...tbt, time: e.target.value })} placeholder="เช่น 08:00" /></div>
              <div><div style={lbl}>ผู้นำพูดคุย</div><input style={field} value={tbt.speaker} onChange={(e) => setTbt({ ...tbt, speaker: e.target.value })} /></div>
              <div style={{ gridColumn: '1 / -1' }}><div style={lbl}>ผู้เข้าร่วม (คั่นด้วย , )</div><textarea style={{ ...field, minHeight: 46, resize: 'vertical' }} value={tbt.attendees} onChange={(e) => setTbt({ ...tbt, attendees: e.target.value })} /></div>
              <div style={{ gridColumn: '1 / -1' }}><div style={lbl}>อันตราย/ความเสี่ยงที่พูดถึง</div><textarea style={{ ...field, minHeight: 52, resize: 'vertical' }} value={tbt.hazards} onChange={(e) => setTbt({ ...tbt, hazards: e.target.value })} /></div>
              <div style={{ gridColumn: '1 / -1' }}><div style={lbl}>มาตรการป้องกัน/ข้อตกลง</div><textarea style={{ ...field, minHeight: 52, resize: 'vertical' }} value={tbt.controls} onChange={(e) => setTbt({ ...tbt, controls: e.target.value })} /></div>
              <div style={{ gridColumn: '1 / -1' }}><div style={lbl}>หมายเหตุ</div><input style={field} value={tbt.note} onChange={(e) => setTbt({ ...tbt, note: e.target.value })} /></div>
            </div>
          )}

          {kind === 'jha' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
                <div><div style={lbl}>ผู้วิเคราะห์</div><input style={field} value={jha.analyst} onChange={(e) => setJha({ ...jha, analyst: e.target.value })} /></div>
                <div><div style={lbl}>ผู้ทบทวน/อนุมัติ</div><input style={field} value={jha.reviewer} onChange={(e) => setJha({ ...jha, reviewer: e.target.value })} /></div>
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={lbl}>ขั้นตอนงาน → อันตราย → มาตรการป้องกัน</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 1.6fr 0.9fr 28px', gap: 8, fontSize: 11, color: '#94A0A8', padding: '0 2px' }}><span>ขั้นตอนงาน</span><span>อันตราย/ความเสี่ยง</span><span>มาตรการป้องกัน</span><span>ระดับเสี่ยง</span><span /></div>
                  {jha.steps.map((s, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 1.6fr 0.9fr 28px', gap: 8, alignItems: 'center' }}>
                      <input style={{ ...field, padding: '6px 8px' }} value={s.step} onChange={(e) => setJha({ ...jha, steps: jha.steps.map((x, j) => j === i ? { ...x, step: e.target.value } : x) })} />
                      <input style={{ ...field, padding: '6px 8px' }} value={s.hazard} onChange={(e) => setJha({ ...jha, steps: jha.steps.map((x, j) => j === i ? { ...x, hazard: e.target.value } : x) })} />
                      <input style={{ ...field, padding: '6px 8px' }} value={s.control} onChange={(e) => setJha({ ...jha, steps: jha.steps.map((x, j) => j === i ? { ...x, control: e.target.value } : x) })} />
                      <select style={{ ...field, padding: '6px 8px' }} value={s.risk} onChange={(e) => setJha({ ...jha, steps: jha.steps.map((x, j) => j === i ? { ...x, risk: e.target.value } : x) })}>{['ต่ำ', 'ปานกลาง', 'สูง'].map((r) => <option key={r}>{r}</option>)}</select>
                      <button onClick={() => setJha({ ...jha, steps: jha.steps.length > 1 ? jha.steps.filter((_, j) => j !== i) : jha.steps })} style={{ border: 'none', background: 'none', color: jha.steps.length > 1 ? '#C24036' : '#CBD3DA', cursor: 'pointer', fontSize: 15 }}>✕</button>
                    </div>
                  ))}
                  <button onClick={() => setJha({ ...jha, steps: [...jha.steps, { ...emptyJha }] })} className="hov-f3f5f7" style={{ alignSelf: 'flex-start', fontFamily: 'inherit', fontSize: 12.5, color: '#30506A', background: '#fff', border: '1px dashed #B9C6D0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>+ เพิ่มขั้นตอน</button>
                </div>
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <button onClick={() => setAdding(false)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ยกเลิก</button>
            <button onClick={submit} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>บันทึก</button>
          </div>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F7F9FB' }}>
              <th style={{ ...th, paddingLeft: 18 }}>เลขที่</th><th style={th}>บ้าน</th><th style={th}>หัวข้อ / งาน</th>
              <th style={th}>ผู้บันทึก</th><th style={{ ...th, paddingRight: 18, textAlign: 'center' }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีเอกสาร — กด “บันทึกใหม่”</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                <td className="num" style={{ padding: '10px 18px', fontWeight: 600, fontFamily: 'monospace' }}>{r.no}<div style={{ fontSize: 10.5, color: '#94A0A8', fontFamily: 'inherit' }}>{r.date}</div></td>
                <td style={{ padding: '10px 14px', color: '#5C6770' }}>{houses.find((h) => h.code === r.house_code)?.name || r.house_code || '—'}</td>
                <td style={{ padding: '10px 14px', fontWeight: 500 }}>{r.title || '—'}</td>
                <td style={{ padding: '10px 14px', color: '#5C6770' }}>{r.by}</td>
                <td style={{ padding: '10px 18px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button onClick={() => setPrinting(r)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>🖨 พิมพ์</button>
                  <button onClick={() => remove(r.id)} style={{ marginLeft: 6, border: 'none', background: 'none', color: '#C24036', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {printing && <SafetyPrint record={printing} houseName={houses.find((h) => h.code === printing.house_code)?.name || printing.house_code} onClose={() => setPrinting(null)} />}
    </div>
  )
}
