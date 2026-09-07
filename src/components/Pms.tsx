import { useEffect, useState } from 'react'
import { api } from '../api'
import { useApp } from '../store'
import { PMS_TEMPLATES, PMS_BONUS, PMS_PENALTY, RATING_MEANING } from '../pmsTemplates'
import PmsPrint from './PmsPrint'

export interface KpiItem { name: string; weight: number; target: number; actual: number; score?: number }
export interface RateItem { name: string; weight: number; rating: number; score?: number }
export interface AttInfo { absent: number; leave: number; late: number; wo_overdue?: number }
export interface Pms {
  id: number; no: string; emp_code: string; emp_name: string; position: string; template: string; month: string; evaluator: string
  kpi: KpiItem[]; competency: RateItem[]; behavior: RateItem[]
  kpi_score: number; comp_score: number; beh_score: number; raw_total?: number; penalty?: number; att?: AttInfo; total: number; grade: string; bonus_pct: number
  strengths: string; improve: string; plan: string
}

const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 9px', outline: 'none' }
const th: React.CSSProperties = { padding: '7px 9px', fontWeight: 600, color: '#5C6770', fontSize: 11.5 }
const gradeColor = (g: string) => g === 'A' ? '#2E7D55' : g === 'B' ? '#30506A' : g === 'C' ? '#B7791F' : g === 'D' ? '#C0852C' : '#C24036'

export function pmsCompute(d: { kpi: KpiItem[]; competency: RateItem[]; behavior: RateItem[]; att?: { absent: number; leave: number; late: number; wo_overdue?: number } }) {
  const kpi = d.kpi.map((k) => { const w = +k.weight || 0, tg = +k.target || 0, ac = +k.actual || 0; return { ...k, score: Math.round(w * (tg > 0 ? Math.min(ac / tg, 1) : 0) * 100) / 100 } })
  const rate = (arr: RateItem[]) => arr.map((c) => { const w = +c.weight || 0, r = +c.rating || 0; return { ...c, score: Math.round(w * (r / 5) * 100) / 100 } })
  const comp = rate(d.competency), beh = rate(d.behavior)
  const sum = (a: { score: number }[]) => Math.round(a.reduce((s, x) => s + x.score, 0) * 100) / 100
  const ks = sum(kpi), cs = sum(comp), bs = sum(beh), raw = Math.round((ks + cs + bs) * 100) / 100
  const a = d.att || { absent: 0, leave: 0, late: 0 }
  const penalty = Math.round(((+a.late || 0) * PMS_PENALTY.late + (+a.absent || 0) * PMS_PENALTY.absent + (+a.leave || 0) * PMS_PENALTY.leave + (+(a.wo_overdue || 0)) * PMS_PENALTY.wo_overdue) * 100) / 100
  const total = Math.max(0, Math.round((raw - penalty) * 100) / 100)
  const g = PMS_BONUS.find((x) => total >= x.min) || PMS_BONUS[PMS_BONUS.length - 1]
  return { kpi, comp, beh, ks, cs, bs, raw, penalty, total, grade: g.grade, bonus: g.bonus }
}

type Draft = { id: number; emp_code: string; emp_name: string; position: string; template: string; month: string; kpi: KpiItem[]; competency: RateItem[]; behavior: RateItem[]; att: AttInfo; strengths: string; improve: string; plan: string }
// แปลงเดือน PMS ("7/2568") -> "2025-07" สำหรับจับคู่ข้อมูลลงเวลา
function monthToYM(m: string): string {
  const mm = /^(\d{1,2})\s*\/\s*(\d{4})$/.exec((m || '').trim())
  if (!mm) return ''
  const month = String(Number(mm[1])).padStart(2, '0')
  const year = Number(mm[2]) - 543
  return `${year}-${month}`
}

export default function Pms() {
  const { data, user } = useApp()
  const allowed = user?.username === 'thawat' || user?.name === 'ธวัช วรรณสุข' // เข้าได้เฉพาะ ธวัช วรรณสุข
  const employees = data.employees || []
  const [rows, setRows] = useState<Pms[]>([])
  const [edit, setEdit] = useState<Draft | null>(null)
  const [printing, setPrinting] = useState<Pms | null>(null)
  // ต้องยืนยัน PIN ทุกครั้งก่อนเข้า
  const [unlocked, setUnlocked] = useState(false)
  const [pin, setPin] = useState('')
  const [pinErr, setPinErr] = useState('')
  const [checking, setChecking] = useState(false)

  const load = () => api.get<Pms[]>('/pms').then(setRows).catch(() => setRows([]))
  useEffect(() => { if (allowed && unlocked) load() /* eslint-disable-next-line */ }, [unlocked])

  const verify = async () => {
    if (!/^\d{4}$/.test(pin)) { setPinErr('กรอก PIN 4 หลัก'); return }
    setChecking(true); setPinErr('')
    try { await api.post('/verify-pin', { pin }); setUnlocked(true) } catch (e) { setPinErr((e as Error).message) } finally { setChecking(false) }
  }

  if (!allowed) return <div style={{ maxWidth: 1320, margin: '0 auto', background: '#fff', border: '1px solid #E1E5EA', borderRadius: 13, padding: 40, textAlign: 'center' }}>หน้าประเมินผล KPI เข้าได้เฉพาะ <b>ธวัช วรรณสุข</b> เท่านั้น</div>

  if (!unlocked) return (
    <div style={{ maxWidth: 420, margin: '48px auto', background: '#fff', border: '1px solid #E1E5EA', borderRadius: 13, padding: 34, textAlign: 'center' }}>
      <div style={{ width: 52, height: 52, borderRadius: 13, background: '#F3F5F7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#30506A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#1C2730' }}>ยืนยันตัวตนก่อนเข้าหน้าประเมินผล KPI</div>
      <div style={{ fontSize: 13, color: '#5C6770', marginTop: 6, marginBottom: 16 }}>กรุณาใส่ PIN ของคุณ ({user?.name})</div>
      <input type="password" inputMode="numeric" maxLength={4} value={pin} autoFocus
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && verify()}
        placeholder="••••" style={{ width: 160, textAlign: 'center', letterSpacing: 8, fontSize: 22, fontFamily: 'inherit', color: '#1C2730', border: '1px solid #D2DAE1', borderRadius: 10, padding: '10px 12px', outline: 'none' }} />
      {pinErr && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 10 }}>{pinErr}</div>}
      <div><button onClick={verify} disabled={checking} className="btn-primary" style={{ marginTop: 16, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 10, padding: '10px 28px', cursor: 'pointer' }}>{checking ? 'กำลังตรวจสอบ…' : 'เข้าสู่หน้าประเมินผล'}</button></div>
    </div>
  )

  const nowMonth = () => { const d = new Date(); return `${d.getMonth() + 1}/${d.getFullYear() + 543}` }
  const newReview = () => setEdit({ id: 0, emp_code: '', emp_name: '', position: '', template: '', month: nowMonth(), kpi: [], competency: [], behavior: [], att: { absent: 0, leave: 0, late: 0, wo_overdue: 0 }, strengths: '', improve: '', plan: '' })
  // ดึงจำนวนขาด/ลา/สาย จากข้อมูลลงเวลา+ลางาน ของเดือนที่เลือก + ใบสั่งงานเกินกำหนด
  const autoFillAtt = async (e: Draft) => {
    const ym = monthToYM(e.month)
    if (!ym || !e.emp_code) { alert('เลือกพนักงานและระบุเดือนเป็นรูปแบบ ด/ปปปป (เช่น 7/2568) ก่อน'); return }
    const emp = employees.find((x) => x.code === e.emp_code)
    const att = (data.attendance || []).filter((a) => (a.emp_code === e.emp_code || a.emp_name === emp?.name) && (a.date || '').startsWith(ym))
    const late = att.filter((a) => a.status === 'สาย').length
    const absent = att.filter((a) => a.status === 'ขาด' || a.status === 'ขาดงาน').length
    const leave = (data.leaves || []).filter((l) => (l.emp_code === e.emp_code || l.emp_name === emp?.name) && l.status === 'อนุมัติ' && (l.start_date || '').startsWith(ym)).reduce((s, l) => s + (l.days || 0), 0)
    let wo_overdue = e.att.wo_overdue || 0
    try { const s = await api.get<{ overdue: number }>('/work-orders/executor-stats?executor=' + encodeURIComponent(emp?.name || e.emp_name)); wo_overdue = s.overdue } catch { /* ignore */ }
    setEdit({ ...e, att: { absent, leave, late, wo_overdue } })
  }
  // ดึงผลงานตรวจ QC ของคนกรอก → ใส่เป็น KPI (อัตราผ่าน) อัตโนมัติ
  const autoFillQc = async (e: Draft) => {
    if (!e.emp_name) { alert('เลือกพนักงานก่อน'); return }
    try {
      const st = await api.get<{ total: number; passed: number; passRate: number }>('/qc/inspector-stats?inspector=' + encodeURIComponent(e.emp_name))
      if (!st.total) { alert('ยังไม่มีใบตรวจ QC ของ ' + e.emp_name); return }
      const kpiName = 'อัตรางานตรวจ QC ผ่าน (%)'
      const idx = e.kpi.findIndex((k) => k.name === kpiName)
      const row = { name: kpiName, weight: idx >= 0 ? e.kpi[idx].weight : 0, target: 100, actual: st.passRate }
      const kpi = idx >= 0 ? e.kpi.map((k, i) => i === idx ? row : k) : [...e.kpi, row]
      setEdit({ ...e, kpi })
      alert(`ดึงผลงาน QC ของ ${e.emp_name} แล้ว\n• ตรวจ ${st.total} ใบ · ผ่าน ${st.passed} · อัตราผ่าน ${st.passRate}%\nใส่เป็น KPI ให้แล้ว — กำหนดน้ำหนักได้เอง`)
    } catch (err) { alert((err as Error).message) }
  }
  // ดึงคะแนน KPI จากใบสั่งงาน (ส่งงานตรงเวลา/ล่าช้า) → ใส่เป็น KPI (อัตราส่งงานตรงเวลา %)
  const autoFillWo = async (e: Draft) => {
    if (!e.emp_name) { alert('เลือกพนักงานก่อน'); return }
    try {
      const s = await api.get<{ kpiPoints: number; scoredCount: number; earlyCount: number; lateCount: number; ontimeCount: number; onTimeRate: number }>('/work-orders/executor-stats?executor=' + encodeURIComponent(e.emp_name))
      if (!s.scoredCount) { alert('ยังไม่มีใบสั่งงานที่ผู้สั่งกดรับ (ยังไม่มีคะแนน) ของ ' + e.emp_name); return }
      const onTimePct = Math.round(((s.earlyCount + s.ontimeCount) / s.scoredCount) * 100)
      const kpiName = 'อัตราส่งงานตรงเวลา (ใบสั่งงาน) (%)'
      const idx = e.kpi.findIndex((k) => k.name === kpiName)
      const row = { name: kpiName, weight: idx >= 0 ? e.kpi[idx].weight : 0, target: 100, actual: onTimePct }
      const kpi = idx >= 0 ? e.kpi.map((k, i) => i === idx ? row : k) : [...e.kpi, row]
      setEdit({ ...e, kpi })
      alert(`ดึงคะแนนใบสั่งงานของ ${e.emp_name} แล้ว\n• รับงานแล้ว ${s.scoredCount} งาน · คะแนน KPI รวม ${s.kpiPoints >= 0 ? '+' : ''}${s.kpiPoints}\n• ตรงเวลา/ก่อนกำหนด ${s.earlyCount + s.ontimeCount} งาน · ช้า ${s.lateCount} งาน\n• อัตราส่งตรงเวลา ${onTimePct}%\nใส่เป็น KPI ให้แล้ว — กำหนดน้ำหนักได้เอง`)
    } catch (err) { alert((err as Error).message) }
  }
  const applyTemplate = (pos: string) => {
    const t = PMS_TEMPLATES.find((x) => x.position === pos)
    if (!edit) return
    if (!t) { setEdit({ ...edit, template: pos, kpi: [{ name: '', weight: 0, target: 100, actual: 0 }], competency: [], behavior: [] }); return }
    setEdit({ ...edit, template: pos, position: edit.position || pos,
      kpi: t.kpi.map((k) => ({ ...k, actual: 0 })),
      competency: t.competency.map((c) => ({ ...c, rating: 0 })),
      behavior: t.behavior.map((c) => ({ ...c, rating: 0 })) })
  }
  const save = async () => {
    if (!edit || !edit.emp_name) { alert('เลือกพนักงานก่อน'); return }
    const body = { ...edit }
    if (edit.id) await api.put('/pms/' + edit.id, body); else await api.post('/pms', body)
    setEdit(null); load()
  }
  const remove = async (id: number) => { if (confirm('ลบใบประเมินนี้?')) { await api.del('/pms/' + id); load() } }
  const openEdit = (r: Pms) => setEdit({ id: r.id, emp_code: r.emp_code, emp_name: r.emp_name, position: r.position, template: r.template, month: r.month, kpi: r.kpi, competency: r.competency, behavior: r.behavior, att: { absent: 0, leave: 0, late: 0, wo_overdue: 0, ...(r.att || {}) }, strengths: r.strengths, improve: r.improve, plan: r.plan })

  if (edit) {
    const c = pmsCompute(edit)
    const setKpi = (i: number, v: number) => setEdit({ ...edit, kpi: edit.kpi.map((x, j) => j === i ? { ...x, actual: v } : x) })
    const setRate = (sec: 'competency' | 'behavior', i: number, v: number) => setEdit({ ...edit, [sec]: edit[sec].map((x, j) => j === i ? { ...x, rating: v } : x) })
    const RateTable = ({ sec, title, max }: { sec: 'competency' | 'behavior'; title: string; max: number }) => (
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '9px 12px', borderBottom: '1px solid #EEF1F4', fontSize: 13, fontWeight: 600 }}>{title} <span style={{ fontWeight: 400, color: '#94A0A8', fontSize: 11.5 }}>(เต็ม {max})</span></div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}><th style={th}>หัวข้อ</th><th style={{ ...th, textAlign: 'center', width: 60 }}>น้ำหนัก</th><th style={{ ...th, textAlign: 'center', width: 120 }}>ให้คะแนน 1-5</th><th style={{ ...th, textAlign: 'right', width: 60 }}>คะแนน</th></tr></thead>
          <tbody>
            {edit[sec].map((it, i) => (
              <tr key={i} style={{ borderTop: '1px solid #F1F4F6' }}>
                <td style={{ padding: '5px 9px', fontSize: 12.5 }}>{it.name}</td>
                <td style={{ padding: '5px 9px', textAlign: 'center', color: '#94A0A8' }}>{it.weight}</td>
                <td style={{ padding: '5px 9px', textAlign: 'center' }}>
                  <select style={{ ...field, padding: '4px 6px', width: 108 }} value={it.rating || 0} onChange={(e) => setRate(sec, i, Number(e.target.value))}>
                    <option value={0}>—</option>
                    {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} · {RATING_MEANING[n]}</option>)}
                  </select>
                </td>
                <td className="num" style={{ padding: '5px 9px', textAlign: 'right', fontWeight: 600 }}>{(it as RateItem).score ?? Math.round((+it.weight || 0) * ((+it.rating || 0) / 5) * 100) / 100}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.6fr 1fr', gap: 10 }}>
          <select style={field} value={edit.emp_code} onChange={(e) => { const emp = employees.find((x) => x.code === e.target.value); setEdit({ ...edit, emp_code: e.target.value, emp_name: emp?.name || '', position: edit.position || emp?.role || '' }) }}>
            <option value="">— เลือกพนักงาน —</option>
            {employees.map((emp) => <option key={emp.id} value={emp.code}>{emp.name} ({emp.role || '-'})</option>)}
          </select>
          <select style={field} value={edit.template} onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">— เลือกแบบฟอร์มตามตำแหน่ง —</option>
            {PMS_TEMPLATES.map((t) => <option key={t.position} value={t.position}>{t.position}</option>)}
            <option value="กำหนดเอง">กำหนดเอง (KPI ว่าง)</option>
          </select>
          <input style={field} placeholder="เดือน (เช่น 7/2568)" value={edit.month} onChange={(e) => setEdit({ ...edit, month: e.target.value })} />
        </div>

        {edit.kpi.length === 0 && <div style={{ color: '#94A0A8', fontSize: 13, textAlign: 'center', padding: 20, background: '#fff', border: '1px dashed #D2DAE1', borderRadius: 10 }}>เลือกแบบฟอร์มตามตำแหน่งด้านบน เพื่อดึง KPI มาให้กรอก</div>}

        {edit.kpi.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '9px 12px', borderBottom: '1px solid #EEF1F4', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center' }}>ส่วนที่ 1 · KPI <span style={{ fontWeight: 400, color: '#94A0A8', fontSize: 11.5, marginLeft: 6 }}>(เต็ม 70)</span>
              <button onClick={() => autoFillWo(edit)} title="ดึงคะแนนจากใบสั่งงาน (ส่งงานตรงเวลา/ล่าช้า) มาใส่เป็น KPI" className="hov-f3f5f7" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #C9D3DB', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>↺ ดึงคะแนนใบสั่งงาน</button>
              <button onClick={() => autoFillQc(edit)} title="ดึงอัตรางานตรวจ QC ผ่าน ของคนนี้มาใส่เป็น KPI" className="hov-f3f5f7" style={{ marginLeft: 6, fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#C0852C', background: '#fff', border: '1px solid #EAD9B6', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>↺ ดึงผลงาน QC</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}><th style={th}>ตัวชี้วัด</th><th style={{ ...th, textAlign: 'center', width: 55 }}>น้ำหนัก</th><th style={{ ...th, textAlign: 'center', width: 70 }}>เป้า %</th><th style={{ ...th, textAlign: 'center', width: 90 }}>ทำได้จริง %</th><th style={{ ...th, textAlign: 'right', width: 60 }}>คะแนน</th></tr></thead>
              <tbody>
                {edit.kpi.map((k, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #F1F4F6' }}>
                    <td style={{ padding: '5px 9px', fontSize: 12.5 }}>{edit.template === 'กำหนดเอง'
                      ? <input style={{ ...field, padding: '4px 6px', width: '100%' }} value={k.name} onChange={(e) => setEdit({ ...edit, kpi: edit.kpi.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} placeholder="ตัวชี้วัด" /> : k.name}</td>
                    <td style={{ padding: '5px 9px', textAlign: 'center' }}>{edit.template === 'กำหนดเอง'
                      ? <input type="number" style={{ ...field, padding: '4px 6px', width: 50, textAlign: 'center' }} value={k.weight || ''} onChange={(e) => setEdit({ ...edit, kpi: edit.kpi.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) } : x) })} /> : <span style={{ color: '#94A0A8' }}>{k.weight}</span>}</td>
                    <td style={{ padding: '5px 9px', textAlign: 'center', color: '#94A0A8' }}>{edit.template === 'กำหนดเอง'
                      ? <input type="number" style={{ ...field, padding: '4px 6px', width: 56, textAlign: 'center' }} value={k.target || ''} onChange={(e) => setEdit({ ...edit, kpi: edit.kpi.map((x, j) => j === i ? { ...x, target: Number(e.target.value) } : x) })} /> : `≥ ${k.target}`}</td>
                    <td style={{ padding: '5px 9px', textAlign: 'center' }}><input type="number" style={{ ...field, padding: '5px 7px', width: 74, textAlign: 'right' }} value={k.actual || ''} onChange={(e) => setKpi(i, Number(e.target.value))} placeholder="0" /></td>
                    <td className="num" style={{ padding: '5px 9px', textAlign: 'right', fontWeight: 600 }}>{c.kpi[i].score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {edit.template === 'กำหนดเอง' && <div style={{ padding: 8 }}><button onClick={() => setEdit({ ...edit, kpi: [...edit.kpi, { name: '', weight: 0, target: 100, actual: 0 }] })} style={{ fontFamily: 'inherit', fontSize: 12, color: '#30506A', background: '#fff', border: '1px dashed #B9C6D0', borderRadius: 7, padding: '5px 11px', cursor: 'pointer' }}>+ เพิ่ม KPI</button></div>}
          </div>
        )}

        {edit.competency.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><RateTable sec="competency" title="ส่วนที่ 2 · Competency" max={20} /><RateTable sec="behavior" title="ส่วนที่ 3 · Behavior" max={10} /></div>}

        {/* วินัยการมาทำงาน: ขาด/ลา/สาย -> หักคะแนน */}
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>วินัย (ขาด / ลา / สาย) + ใบสั่งงานเกินกำหนด</span>
            <button onClick={() => autoFillAtt(edit)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '5px 11px', cursor: 'pointer' }}>↺ ดึงจากลงเวลา + ใบสั่งงาน</button>
            <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#C24036' }}>หัก {c.penalty} คะแนน</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {([['absent', 'ขาดงาน', `-${PMS_PENALTY.absent}/ครั้ง`], ['late', 'มาสาย', `-${PMS_PENALTY.late}/ครั้ง`], ['leave', 'ลา (วัน)', `-${PMS_PENALTY.leave}/วัน`], ['wo_overdue', 'WO เกินกำหนด', `-${PMS_PENALTY.wo_overdue}/ใบ`]] as const).map(([k, label, rate]) => (
              <div key={k}>
                <div style={{ fontSize: 12, color: '#5C6770', marginBottom: 4 }}>{label} <span style={{ color: '#94A0A8', fontSize: 11 }}>({rate})</span></div>
                <input type="number" min={0} style={{ ...field, width: '100%' }} value={edit.att[k] || ''} onChange={(e) => setEdit({ ...edit, att: { ...edit.att, [k]: Number(e.target.value) || 0 } })} placeholder="0" />
              </div>
            ))}
          </div>
        </div>

        {/* สรุปคะแนน */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
          {[['KPI', c.ks, 70], ['Competency', c.cs, 20], ['Behavior', c.bs, 10]].map(([l, v, m]) => (
            <div key={l as string} style={{ flex: 1, minWidth: 120, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 10, padding: '12px 14px' }}><div style={{ fontSize: 12, color: '#5C6770' }}>{l}</div><div className="num" style={{ fontSize: 20, fontWeight: 700, marginTop: 3 }}>{v}<span style={{ fontSize: 12, color: '#94A0A8' }}> / {m}</span></div></div>
          ))}
          <div style={{ flex: 1, minWidth: 120, background: '#fff', border: '1px solid #E7CDC9', borderRadius: 10, padding: '12px 14px' }}><div style={{ fontSize: 12, color: '#5C6770' }}>หักวินัย</div><div className="num" style={{ fontSize: 20, fontWeight: 700, marginTop: 3, color: c.penalty > 0 ? '#C24036' : '#94A0A8' }}>−{c.penalty}</div></div>
          <div style={{ flex: 1.5, minWidth: 210, background: '#1E2E3B', borderRadius: 10, padding: '12px 16px', color: '#fff', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div><div style={{ fontSize: 12, color: '#AEBAC4' }}>คะแนนรวมสุทธิ</div><div className="num" style={{ fontSize: 26, fontWeight: 700 }}>{c.total}<span style={{ fontSize: 13, color: '#7C8B97' }}>/100</span></div><div style={{ fontSize: 10.5, color: '#7C8B97' }}>ดิบ {c.raw} − หัก {c.penalty}</div></div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}><div style={{ fontSize: 22, fontWeight: 800, color: c.grade === 'F' ? '#F2A29B' : '#8FD0AC' }}>เกรด {c.grade}{c.grade === 'F' ? ' · ปัดตก' : ''}</div><div style={{ fontSize: 12.5, color: '#AEBAC4' }}>{c.total < 75 ? 'ต่ำกว่า 75 — ไม่ได้โบนัส' : `โบนัส/ปรับเงิน ${c.bonus}%`}</div></div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {([['strengths', 'จุดแข็ง'], ['improve', 'จุดที่ต้องพัฒนา'], ['plan', 'แผนพัฒนาเดือนถัดไป']] as const).map(([k, l]) => (
            <div key={k}><div style={{ fontSize: 12, color: '#5C6770', marginBottom: 4 }}>{l}</div><textarea style={{ ...field, width: '100%', minHeight: 56, resize: 'vertical' }} value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => setEdit(null)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ยกเลิก</button>
          <button onClick={save} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>บันทึกผลประเมิน</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: '#5C6770' }}>ใบประเมิน <b className="num" style={{ color: '#1C2730' }}>{rows.length}</b> ใบ</div>
        <button onClick={newReview} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>+ ประเมินผลรายเดือน</button>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
            <th style={{ ...th, paddingLeft: 18 }}>เลขที่ / เดือน</th><th style={th}>พนักงาน</th><th style={{ ...th, textAlign: 'right' }}>คะแนน</th><th style={{ ...th, textAlign: 'center' }}>เกรด</th><th style={{ ...th, textAlign: 'center' }}>โบนัส</th><th style={{ ...th, paddingRight: 18, textAlign: 'center' }}>จัดการ</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีใบประเมิน — กด “ประเมินผลรายเดือน”</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                <td className="num" style={{ padding: '10px 18px', fontWeight: 600, fontFamily: 'monospace' }}>{r.no}<div style={{ fontSize: 10.5, color: '#94A0A8', fontFamily: 'inherit' }}>{r.month}</div></td>
                <td style={{ padding: '10px 12px' }}><div style={{ fontWeight: 500 }}>{r.emp_name}</div><div style={{ fontSize: 11, color: '#94A0A8' }}>{r.position || r.template}</div></td>
                <td className="num" style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{r.total}<span style={{ fontSize: 11, color: '#94A0A8' }}>/100</span></td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}><span style={{ fontSize: 13, fontWeight: 800, color: gradeColor(r.grade) }}>{r.grade}</span></td>
                <td className="num" style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: r.bonus_pct >= 100 ? '#2E7D55' : '#5C6770' }}>{r.bonus_pct}%</td>
                <td style={{ padding: '10px 18px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button onClick={() => openEdit(r)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>แก้ไข</button>
                  <button onClick={() => setPrinting(r)} className="hov-f3f5f7" style={{ marginLeft: 6, fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>🖨</button>
                  <button onClick={() => remove(r.id)} style={{ marginLeft: 6, border: 'none', background: 'none', color: '#C24036', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {printing && <PmsPrint pms={printing} onClose={() => setPrinting(null)} />}
    </div>
  )
}
