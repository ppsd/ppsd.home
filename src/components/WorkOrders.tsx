import { useEffect, useState } from 'react'
import { api } from '../api'
import { useApp } from '../store'
import WorkOrderPrint from './WorkOrderPrint'

export interface QcRow { name: string; pass: string; note: string }
export interface WorkOrder {
  id: number; no: string; priority: string; issued_date: string; due_date: string; due_time: string; line_group: string
  reviewer: string; executor: string; executor_code: string; project: string; house_code: string
  scope: string; dod: { correct?: string; clean?: string; evidence?: string }; budget: string
  exec_start: string; exec_end: string; exec_total: string; obstacle: string; fix_note: string
  qc: QcRow[]; acceptance: string; acceptance_note: string; score: number; commendation: string; lessons: string
  status: string; ack: number; ack_by: string; ack_date: string
}

const PRIORITIES = ['ปกติ', 'ด่วน', 'ด่วนที่สุด']
const STATUSES = ['สั่งงาน', 'รับทราบ', 'กำลังทำ', 'เสร็จ', 'ตรวจผ่าน', 'ตีกลับ']
const QC_DEFAULT: QcRow[] = [
  { name: 'Accuracy — ความถูกต้องตามคำสั่ง', pass: '', note: '' },
  { name: 'Neatness — ความสะอาด/เป็นระเบียบ', pass: '', note: '' },
  { name: 'Timeliness — ส่งมอบตรงเวลา', pass: '', note: '' },
  { name: 'Perfection — ความสมบูรณ์แบบ', pass: '', note: '' },
]
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '8px 10px', outline: 'none', width: '100%' }
const lbl: React.CSSProperties = { fontSize: 12, color: '#5C6770', marginBottom: 4 }
const th: React.CSSProperties = { padding: '9px 14px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'left' }

function prColor(p: string) { return p === 'ด่วนที่สุด' ? { c: '#C24036', bg: '#FBEEEC' } : p === 'ด่วน' ? { c: '#B7791F', bg: '#F6ECD6' } : { c: '#5C6770', bg: '#EDF1F4' } }
function stColor(s: string) {
  if (s === 'ตรวจผ่าน' || s === 'เสร็จ') return { c: '#2E7D55', bg: '#E2F1EA' }
  if (s === 'ตีกลับ') return { c: '#C24036', bg: '#FBEEEC' }
  if (s === 'สั่งงาน') return { c: '#B7791F', bg: '#F6ECD6' }
  return { c: '#30506A', bg: '#E2E9EF' }
}

type Draft = Partial<WorkOrder> & { id: number }

export default function WorkOrders() {
  const { data, user, refreshNotifications } = useApp()
  const employees = data.employees || []
  const houses = data.houses
  const [rows, setRows] = useState<WorkOrder[]>([])
  const [edit, setEdit] = useState<Draft | null>(null)
  const [printing, setPrinting] = useState<WorkOrder | null>(null)

  const load = () => api.get<WorkOrder[]>('/work-orders').then(setRows).catch(() => setRows([]))
  useEffect(() => { load() }, [])
  // งานด่วนที่สั่งถึงฉัน (หรือไล่ระดับมาถึงฉัน) และยังไม่เคยเปิด → บันทึกว่า "เห็นแล้ว" (read receipt ให้ CEO)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mine = (rows as any[]).filter((r) => r.urgent && !r.seen && !r.ack && (r.executor === user?.name || r.esc_name === user?.name))
    mine.forEach((r) => api.post('/work-orders/' + r.id + '/seen', {}).catch(() => {}))
  }, [rows, user?.name])

  const newWo = (): void => setEdit({ id: 0, priority: 'ปกติ', executor: '', project: '', house_code: '', due_date: '', due_time: '', line_group: '', scope: '', dod: {}, budget: '', qc: QC_DEFAULT.map((q) => ({ ...q })), status: 'สั่งงาน' })
  const openEdit = (r: WorkOrder) => setEdit({ ...r, qc: r.qc?.length ? r.qc : QC_DEFAULT.map((q) => ({ ...q })), dod: r.dod || {} })
  const save = async () => {
    if (!edit) return
    if (!edit.project && !edit.scope) { alert('กรอกชื่องานหรือขอบเขตงาน'); return }
    if (edit.id) await api.put('/work-orders/' + edit.id, edit); else await api.post('/work-orders', edit)
    setEdit(null); load(); refreshNotifications?.()
  }
  const ack = async (r: WorkOrder) => { await api.post('/work-orders/' + r.id + '/ack', {}); load(); refreshNotifications?.() }
  const remove = async (id: number) => { if (confirm('ลบใบสั่งงานนี้?')) { await api.del('/work-orders/' + id); load() } }
  const isMine = (r: WorkOrder) => r.executor === user?.name

  if (edit) {
    const e = edit
    const set = (patch: Partial<Draft>) => setEdit({ ...e, ...patch })
    const setDod = (k: string, v: string) => setEdit({ ...e, dod: { ...(e.dod || {}), [k]: v } })
    const setQc = (i: number, patch: Partial<QcRow>) => setEdit({ ...e, qc: (e.qc || []).map((x, j) => j === i ? { ...x, ...patch } : x) })
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{e.id ? `แก้ไขใบสั่งงาน ${e.no}` : 'ออกใบสั่งงานใหม่'}</div>

        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#30506A' }}>ข้อมูลการสั่งงาน</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            <div><div style={lbl}>ผู้รับผิดชอบ (Executor) *</div>
              <select style={field} value={e.executor} onChange={(ev) => { const emp = employees.find((x) => x.name === ev.target.value); set({ executor: ev.target.value, executor_code: emp?.code || '' }) }}>
                <option value="">— เลือกผู้รับผิดชอบ —</option>
                {employees.map((emp) => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
              </select>
            </div>
            <div><div style={lbl}>ระดับความสำคัญ</div><select style={field} value={e.priority} onChange={(ev) => set({ priority: ev.target.value })}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></div>
            <div><div style={lbl}>บ้าน/โครงการ (ถ้ามี)</div><select style={field} value={e.house_code} onChange={(ev) => set({ house_code: ev.target.value })}><option value="">—</option>{houses.map((h) => <option key={h.id} value={h.code}>{h.name}</option>)}</select></div>
          </div>
          <div style={{ marginTop: 12 }}><div style={lbl}>ชื่องาน / โครงการ (Task Name)</div><input style={field} value={e.project} onChange={(ev) => set({ project: ev.target.value })} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
            <div><div style={lbl}>กำหนดส่งงาน (Due Date)</div><input style={field} type="date" value={e.due_date} onChange={(ev) => set({ due_date: ev.target.value })} /></div>
            <div><div style={lbl}>เวลา</div><input style={field} type="time" value={e.due_time} onChange={(ev) => set({ due_time: ev.target.value })} /></div>
            <div><div style={lbl}>LINE Group / ช่องทาง</div><input style={field} value={e.line_group} onChange={(ev) => set({ line_group: ev.target.value })} /></div>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#30506A' }}>1) เป้าหมายและมาตรฐาน</div>
          <div><div style={lbl}>ขอบเขตงาน (Scope of Work)</div><textarea style={{ ...field, minHeight: 64, resize: 'vertical' }} value={e.scope} onChange={(ev) => set({ scope: ev.target.value })} /></div>
          <div style={{ fontSize: 12.5, fontWeight: 600, margin: '12px 0 4px' }}>Definition of Done (นิยามความสำเร็จ)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div><div style={lbl}>ความถูกต้อง (ขนาด/สี ตามแบบ)</div><input style={field} value={e.dod?.correct || ''} onChange={(ev) => setDod('correct', ev.target.value)} /></div>
            <div><div style={lbl}>ความสะอาด/เรียบร้อย</div><input style={field} value={e.dod?.clean || ''} onChange={(ev) => setDod('clean', ev.target.value)} /></div>
            <div><div style={lbl}>หลักฐาน (เช่น ถ่ายรูปส่ง LINE)</div><input style={field} value={e.dod?.evidence || ''} onChange={(ev) => setDod('evidence', ev.target.value)} /></div>
          </div>
          <div style={{ marginTop: 12 }}><div style={lbl}>งบประมาณ/ทรัพยากร (Budget/Resources)</div><input style={field} value={e.budget} onChange={(ev) => set({ budget: ev.target.value })} /></div>
        </div>

        {e.id ? (<>
          <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#30506A' }}>2) บันทึกการดำเนินงาน</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div><div style={lbl}>เวลาเริ่มจริง</div><input style={field} value={e.exec_start} onChange={(ev) => set({ exec_start: ev.target.value })} /></div>
              <div><div style={lbl}>เวลาเสร็จจริง</div><input style={field} value={e.exec_end} onChange={(ev) => set({ exec_end: ev.target.value })} /></div>
              <div><div style={lbl}>รวมเวลาที่ใช้</div><input style={field} value={e.exec_total} onChange={(ev) => set({ exec_total: ev.target.value })} /></div>
            </div>
            <div style={{ marginTop: 12 }}><div style={lbl}>ปัญหา/อุปสรรคที่พบ</div><input style={field} value={e.obstacle} onChange={(ev) => set({ obstacle: ev.target.value })} placeholder="ไม่มี / ระบุ…" /></div>
            <div style={{ marginTop: 12 }}><div style={lbl}>การแก้ไข / หมายเหตุ</div><textarea style={{ ...field, minHeight: 50, resize: 'vertical' }} value={e.fix_note} onChange={(ev) => set({ fix_note: ev.target.value })} /></div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#30506A' }}>3) ตรวจสอบคุณภาพ (QC)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {(e.qc || []).map((q, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr auto 1.4fr', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12.5, color: '#3C4750' }}>{q.name}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setQc(i, { pass: q.pass === 'ผ่าน' ? '' : 'ผ่าน' })} style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 6, padding: '3px 9px', border: '1px solid ' + (q.pass === 'ผ่าน' ? '#2E7D55' : '#D2DAE1'), background: q.pass === 'ผ่าน' ? '#2E7D55' : '#fff', color: q.pass === 'ผ่าน' ? '#fff' : '#5C6770' }}>ผ่าน</button>
                    <button onClick={() => setQc(i, { pass: q.pass === 'ไม่ผ่าน' ? '' : 'ไม่ผ่าน' })} style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 6, padding: '3px 9px', border: '1px solid ' + (q.pass === 'ไม่ผ่าน' ? '#C24036' : '#D2DAE1'), background: q.pass === 'ไม่ผ่าน' ? '#C24036' : '#fff', color: q.pass === 'ไม่ผ่าน' ? '#fff' : '#5C6770' }}>ไม่ผ่าน</button>
                  </div>
                  <input style={{ ...field, padding: '5px 8px', fontSize: 12 }} placeholder="หมายเหตุ" value={q.note} onChange={(ev) => setQc(i, { note: ev.target.value })} />
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div><div style={lbl}>สรุปผลตรวจรับ (Acceptance)</div><select style={field} value={e.acceptance || ''} onChange={(ev) => set({ acceptance: ev.target.value })}><option value="">—</option><option>Approved — สมบูรณ์ 100%</option><option>Conditional — แก้ไขเล็กน้อย</option><option>Rejected — รื้อทำใหม่</option></select></div>
              <div><div style={lbl}>หมายเหตุการตรวจรับ</div><input style={field} value={e.acceptance_note} onChange={(ev) => set({ acceptance_note: ev.target.value })} /></div>
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#30506A' }}>4) ประเมินเพื่อพัฒนา</div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
              <div><div style={lbl}>คะแนน (1–10)</div><input style={field} type="number" min={1} max={10} value={e.score || ''} onChange={(ev) => set({ score: Number(ev.target.value) })} /></div>
              <div><div style={lbl}>สถานะงาน</div><select style={field} value={e.status} onChange={(ev) => set({ status: ev.target.value })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
            </div>
            <div style={{ marginTop: 12 }}><div style={lbl}>สิ่งที่ทำได้ดีเยี่ยม (Commendation)</div><input style={field} value={e.commendation} onChange={(ev) => set({ commendation: ev.target.value })} /></div>
            <div style={{ marginTop: 12 }}><div style={lbl}>สิ่งที่ต้องปรับปรุง (Lessons Learned)</div><input style={field} value={e.lessons} onChange={(ev) => set({ lessons: ev.target.value })} /></div>
          </div>
        </>) : <div style={{ fontSize: 12, color: '#94A0A8', textAlign: 'center' }}>บันทึกใบสั่งงานก่อน แล้วจึงกรอกส่วนดำเนินงาน/ตรวจคุณภาพ/ประเมินภายหลัง</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => setEdit(null)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ยกเลิก</button>
          <button onClick={save} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>{e.id ? 'บันทึก' : 'สั่งงาน + แจ้งเตือน'}</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: '#5C6770' }}>ใบสั่งงาน <b className="num" style={{ color: '#1C2730' }}>{rows.length}</b> ใบ</div>
        <button onClick={newWo} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>+ ออกใบสั่งงาน</button>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#F7F9FB' }}>
            <th style={{ ...th, paddingLeft: 18 }}>เลขที่</th><th style={th}>งาน</th><th style={th}>ผู้รับผิดชอบ</th>
            <th style={{ ...th, textAlign: 'center' }}>ความสำคัญ</th><th style={{ ...th, textAlign: 'center' }}>สถานะ</th><th style={{ ...th, paddingRight: 18, textAlign: 'center' }}>จัดการ</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีใบสั่งงาน — กด “ออกใบสั่งงาน”</td></tr>}
            {rows.map((r) => {
              const pc = prColor(r.priority), sc = stColor(r.status)
              return (
                <tr key={r.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td className="num" style={{ padding: '10px 18px', fontWeight: 600, fontFamily: 'monospace' }}>{r.no}<div style={{ fontSize: 10.5, color: '#94A0A8', fontFamily: 'inherit' }}>{r.issued_date}</div></td>
                  <td style={{ padding: '10px 14px' }}><div style={{ fontWeight: 500, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.project || r.scope || '-'}</div>{r.due_date && <div style={{ fontSize: 11, color: '#94A0A8' }}>ครบ {r.due_date}{r.due_time ? ' ' + r.due_time : ''}</div>}</td>
                  <td style={{ padding: '10px 14px', color: '#5C6770' }}>{r.executor || '-'}{r.ack ? <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 600, color: '#2E7D55' }}>✓ รับทราบ</span> : <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 600, color: '#B7791F' }}>รอรับทราบ</span>}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}><span style={{ fontSize: 11, fontWeight: 600, color: pc.c, background: pc.bg, padding: '2px 10px', borderRadius: 20 }}>{r.priority}</span></td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}><span style={{ fontSize: 11, fontWeight: 600, color: sc.c, background: sc.bg, padding: '2px 10px', borderRadius: 20 }}>{r.status}</span></td>
                  <td style={{ padding: '10px 18px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {isMine(r) && !r.ack && <button onClick={() => ack(r)} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 7, padding: '4px 11px', cursor: 'pointer' }}>รับทราบ</button>}
                    <button onClick={() => openEdit(r)} className="hov-f3f5f7" style={{ marginLeft: 6, fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>เปิด/บันทึกผล</button>
                    <button onClick={() => setPrinting(r)} className="hov-f3f5f7" style={{ marginLeft: 6, fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>🖨</button>
                    <button onClick={() => remove(r.id)} style={{ marginLeft: 6, border: 'none', background: 'none', color: '#C24036', cursor: 'pointer', fontSize: 13 }}>✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {printing && <WorkOrderPrint wo={printing} houseName={houses.find((h) => h.code === printing.house_code)?.name} onClose={() => setPrinting(null)} />}
    </div>
  )
}
