import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useApp } from '../store'

// ===== CEO สั่งงานด้วยเสียง (เฉพาะ CEO) =====
// พูด/พิมพ์ → ระบบเดาผู้รับ/บ้าน/ด่วน → CEO ตรวจ+แก้ → ออกใบสั่งงาน
// + สถานะงานด่วนสด: ส่ง → เห็น(กี่นาที) → รับทราบ(กี่นาที) + ไล่ระดับหาคนสำรอง

const card: React.CSSProperties = { background: '#fff', border: '1px solid #E1E5EA', borderRadius: 14, padding: '18px 20px' }
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 14, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 12px', outline: 'none', width: '100%' }
const label: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: '#5C6770', marginBottom: 5 }

interface FeedWO {
  id: number; no: string; project?: string; scope?: string; executor?: string; esc_name?: string
  status: string; urgent?: number; seen?: number; ack?: number; deadline_min?: number
  seen_after_min?: number | null; ack_after_min?: number | null; elapsed_min?: number; remaining_min?: number
  esc_log?: { at: string; to: string; reason: string }[]
}

export default function CeoVoice() {
  const { user, data } = useApp()
  const allowed = user?.username === 'thawat' || user?.name === 'ธวัช วรรณสุข'
  const [unlocked, setUnlocked] = useState(false)
  const [pin, setPin] = useState(''); const [pinErr, setPinErr] = useState(''); const [checking, setChecking] = useState(false)
  const verify = async () => {
    if (!/^\d{4}$/.test(pin)) { setPinErr('กรอก PIN 4 หลัก'); return }
    setChecking(true); setPinErr('')
    try { await api.post('/verify-pin', { pin }); setUnlocked(true) } catch (e) { setPinErr((e as Error).message) } finally { setChecking(false) }
  }

  const emps = (data.employees || []).filter((e) => e.status !== 'ลาออก')
  const houses = data.houses || []

  // ---- ช่องพูด/พิมพ์ ----
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const recRef = useRef<unknown>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SR: any = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null
  const toggleMic = () => {
    if (!SR) return
    if (listening) { try { (recRef.current as { stop: () => void })?.stop() } catch { /* ignore */ } setListening(false); return }
    const rec = new SR(); recRef.current = rec
    rec.lang = 'th-TH'; rec.interimResults = true; rec.continuous = true
    let base = text ? text + ' ' : ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (ev: any) => {
      let s = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) s += ev.results[i][0].transcript
      setText(base + s)
      if (ev.results[ev.results.length - 1].isFinal) base += s
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    try { rec.start(); setListening(true) } catch { setListening(false) }
  }

  // ---- ฟอร์มใบสั่งงาน (แก้ไขได้) ----
  const blank = { executor_code: '', house_code: '', due_date: '', urgent: false, scope: '' }
  const [form, setForm] = useState(blank)
  const [parsed, setParsed] = useState(false)
  const [msg, setMsg] = useState('')

  // เดาข้อมูลจากข้อความ (ผู้รับ/บ้าน/ด่วน) — CEO ตรวจ+แก้ก่อนออกเสมอ
  const parse = () => {
    const t = text.trim()
    if (!t) { setMsg('พูดหรือพิมพ์คำสั่งงานก่อน'); return }
    setMsg('')
    const found = { ...blank, scope: t }
    // ผู้รับ: หาชื่อพนักงานที่ปรากฏในข้อความ (จับคำแรกของชื่อด้วย)
    const emp = emps.find((e) => e.name && (t.includes(e.name) || t.includes(e.name.split(' ')[0])))
    if (emp) found.executor_code = emp.code
    // บ้าน: หาชื่อบ้าน/รหัสบ้านในข้อความ
    const h = houses.find((x) => (x.name && t.includes(x.name)) || (x.code && t.includes(x.code)))
    if (h) found.house_code = h.code
    // ด่วน
    if (/ด่วน|เร่งด่วน|urgent/i.test(t)) found.urgent = true
    // กำหนดส่ง: วันนี้/พรุ่งนี้ (เดาเบื้องต้น)
    const now = new Date()
    if (/พรุ่งนี้/.test(t)) { now.setDate(now.getDate() + 1); found.due_date = iso(now) }
    else if (/วันนี้/.test(t)) found.due_date = iso(now)
    setForm(found); setParsed(true)
  }
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const submit = async () => {
    if (!form.scope.trim()) { setMsg('กรุณากรอกรายละเอียดงาน'); return }
    if (!form.executor_code) { setMsg('กรุณาเลือกผู้รับงาน'); return }
    setMsg('')
    const emp = emps.find((e) => e.code === form.executor_code)
    try {
      const r = await api.post<{ no: string }>('/work-orders', {
        scope: form.scope, project: form.scope.slice(0, 40),
        executor: emp?.name || '', executor_code: form.executor_code,
        house_code: form.house_code, due_date: form.due_date,
        urgent: form.urgent, source: 'voice',
      })
      setMsg(`✅ ออกใบสั่งงาน ${r.no} แล้ว — ส่งถึง ${emp?.name || ''}${form.urgent ? ' (ด่วน!)' : ''}`)
      setText(''); setForm(blank); setParsed(false); loadFeed()
    } catch (e) { setMsg((e as Error).message) }
  }

  // ---- สถานะงานด่วนสด ----
  const [feed, setFeed] = useState<FeedWO[]>([])
  const loadFeed = () => api.get<{ now: string; rows: FeedWO[] }>('/work-orders/ceo-feed').then((r) => setFeed(r.rows || [])).catch(() => {})
  useEffect(() => { if (allowed && unlocked) { loadFeed(); const t = setInterval(loadFeed, 5000); return () => clearInterval(t) } }, [allowed, unlocked])

  // ---- ตั้งค่างานด่วน ----
  const [cfg, setCfg] = useState<{ step_min: number; deadline_min: number; fallback_code: string }>({ step_min: 2, deadline_min: 5, fallback_code: '' })
  const [showCfg, setShowCfg] = useState(false)
  useEffect(() => { if (unlocked) api.get<typeof cfg>('/settings/urgent').then(setCfg).catch(() => {}) }, [unlocked])
  const saveCfg = async () => { try { await api.put('/settings/urgent', cfg); setShowCfg(false) } catch (e) { alert((e as Error).message) } }

  if (!allowed) return <div style={{ maxWidth: 900, margin: '0 auto', ...card, textAlign: 'center' }}>หน้าสั่งงานด้วยเสียง เข้าได้เฉพาะ <b>ธวัช วรรณสุข (CEO)</b> เท่านั้น</div>
  if (!unlocked) return (
    <div style={{ maxWidth: 420, margin: '48px auto', ...card, padding: 34, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🎤</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#1C2730' }}>สั่งงานด้วยเสียง (CEO)</div>
      <div style={{ fontSize: 13, color: '#5C6770', marginTop: 6, marginBottom: 16 }}>ใส่ PIN ของคุณ ({user?.name})</div>
      <input type="password" inputMode="numeric" maxLength={4} value={pin} autoFocus
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && verify()}
        placeholder="••••" style={{ width: 160, textAlign: 'center', letterSpacing: 8, fontSize: 22, fontFamily: 'inherit', color: '#1C2730', border: '1px solid #D2DAE1', borderRadius: 10, padding: '10px 12px', outline: 'none' }} />
      {pinErr && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 10 }}>{pinErr}</div>}
      <div><button onClick={verify} disabled={checking} className="btn-primary" style={{ marginTop: 16, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 10, padding: '10px 28px', cursor: 'pointer' }}>{checking ? 'กำลังตรวจสอบ…' : 'เข้าใช้งาน'}</button></div>
    </div>
  )

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ---- สั่งงานด้วยเสียง ---- */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#1E2E3B' }}>🎤 สั่งงานด้วยเสียง</span>
          <button onClick={() => setShowCfg((v) => !v)} className="hov-f3f5f7" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '6px 11px', cursor: 'pointer' }}>⚙ ตั้งค่างานด่วน</button>
        </div>
        {showCfg && (
          <div style={{ background: '#FAFBFC', border: '1px solid #EEF1F4', borderRadius: 10, padding: 14, marginBottom: 12, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div><div style={label}>ต้องรับภายใน (นาที)</div><input type="number" min={1} style={{ ...field, width: 120 }} value={cfg.deadline_min} onChange={(e) => setCfg({ ...cfg, deadline_min: Number(e.target.value) || 5 })} /></div>
            <div><div style={label}>ไล่ระดับทุก (นาที)</div><input type="number" min={1} style={{ ...field, width: 120 }} value={cfg.step_min} onChange={(e) => setCfg({ ...cfg, step_min: Number(e.target.value) || 2 })} /></div>
            <div><div style={label}>ตัวจบสาย (กันตกหล่น)</div>
              <select style={{ ...field, width: 200 }} value={cfg.fallback_code} onChange={(e) => setCfg({ ...cfg, fallback_code: e.target.value })}>
                <option value="">— ไม่ระบุ —</option>
                {emps.map((e) => <option key={e.code} value={e.code}>{e.name}</option>)}
              </select>
            </div>
            <button onClick={saveCfg} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer' }}>บันทึก</button>
          </div>
        )}
        <div style={{ fontSize: 12.5, color: '#94A0A8', marginBottom: 8 }}>แตะไมค์บนคีย์บอร์ดมือถือแล้วพูด หรือกดปุ่ม “พูด” — เช่น “ให้สมชายไปแก้หลังคาบ้าน A ด่วน”</div>
        <div style={{ position: 'relative' }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="พูดหรือพิมพ์คำสั่งงานที่นี่…"
            style={{ ...field, resize: 'vertical', fontSize: 15, lineHeight: 1.5 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {SR && (
            <button onClick={toggleMic} style={{ fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: '#fff', background: listening ? '#C24036' : '#2E7D55', border: 'none', borderRadius: 9, padding: '10px 20px', cursor: 'pointer' }}>
              {listening ? '⏹ หยุดพูด' : '🎤 พูด'}
            </button>
          )}
          <button onClick={parse} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '10px 20px', cursor: 'pointer' }}>ถัดไป — ตรวจใบสั่งงาน</button>
          {text && <button onClick={() => { setText(''); setParsed(false) }} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '10px 16px', cursor: 'pointer' }}>ล้าง</button>}
        </div>
      </div>

      {/* ---- ตรวจ + แก้ไข ก่อนออกใบสั่งงาน ---- */}
      {parsed && (
        <div style={{ ...card, border: '2px solid #C0852C' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#B7791F', marginBottom: 4 }}>ตรวจสอบก่อนออกใบสั่งงาน</div>
          <div style={{ fontSize: 12, color: '#94A0A8', marginBottom: 14 }}>ระบบเดาให้จากที่พูด — แก้ไขให้ถูกต้องได้ทุกช่องก่อนกดออก</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
            <div><div style={label}>ผู้รับงาน *</div>
              <select style={field} value={form.executor_code} onChange={(e) => setForm({ ...form, executor_code: e.target.value })}>
                <option value="">— เลือกผู้รับงาน —</option>
                {emps.map((e) => <option key={e.code} value={e.code}>{e.name}{e.role ? ' · ' + e.role : ''}</option>)}
              </select>
            </div>
            <div><div style={label}>บ้าน / โครงการ</div>
              <select style={field} value={form.house_code} onChange={(e) => setForm({ ...form, house_code: e.target.value })}>
                <option value="">— ไม่ระบุบ้าน —</option>
                {houses.map((h) => <option key={h.code} value={h.code}>{h.name}</option>)}
              </select>
            </div>
            <div><div style={label}>กำหนดส่ง</div><input type="date" style={field} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
            <div><div style={label}>ระดับความเร่งด่วน</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, ...field, cursor: 'pointer', background: form.urgent ? '#FBEEEC' : '#fff', borderColor: form.urgent ? '#E7CDC9' : '#D2DAE1' }}>
                <input type="checkbox" checked={form.urgent} onChange={(e) => setForm({ ...form, urgent: e.target.checked })} />
                <span style={{ fontWeight: 600, color: form.urgent ? '#C24036' : '#5C6770' }}>🔴 งานด่วน — ต้องรับภายใน {cfg.deadline_min} นาที</span>
              </label>
            </div>
          </div>
          <div style={{ marginTop: 14 }}><div style={label}>รายละเอียดงาน *</div>
            <textarea value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} rows={2} style={{ ...field, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
            <button onClick={submit} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 15, fontWeight: 700, color: '#fff', background: form.urgent ? '#C24036' : '#2E7D55', border: 'none', borderRadius: 10, padding: '11px 26px', cursor: 'pointer' }}>✅ ตรวจแล้ว — ออกใบสั่งงาน</button>
            <button onClick={() => setParsed(false)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 10, padding: '11px 18px', cursor: 'pointer' }}>กลับไปแก้คำพูด</button>
          </div>
        </div>
      )}
      {msg && <div style={{ ...card, padding: '12px 18px', fontSize: 13.5, fontWeight: 600, color: msg.startsWith('✅') ? '#2E7D55' : '#C24036', background: msg.startsWith('✅') ? '#F2F8F4' : '#FBEEEC', border: 'none' }}>{msg}</div>}

      {/* ---- สถานะงานด่วนสด ---- */}
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1E2E3B', marginBottom: 4 }}>สถานะงานด่วน (อัปเดตสด)</div>
        <div style={{ fontSize: 12, color: '#94A0A8', marginBottom: 12 }}>เห็นแล้วหรือยัง · รับใน/กี่นาที · ไล่ระดับถึงใคร</div>
        {feed.filter((w) => w.urgent).length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#94A0A8', fontSize: 13 }}>ยังไม่มีงานด่วน</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {feed.filter((w) => w.urgent).map((w) => {
            const done = w.ack === 1
            const over = w.status === 'เกินเวลา'
            const barColor = done ? '#2E7D55' : over ? '#C24036' : '#C0852C'
            return (
              <div key={w.id} style={{ border: `1px solid ${done ? '#CDE3D6' : over ? '#E7CDC9' : '#ECDCB8'}`, borderRadius: 11, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: done ? '#F2F8F4' : over ? '#FBEEEC' : '#FBF6EC', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: barColor, padding: '2px 9px', borderRadius: 20 }}>{w.no}</span>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{w.project || w.scope}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: barColor }}>
                    {done ? `✔ รับทราบแล้ว (${w.ack_after_min} นาที)` : over ? '⛔ เกินกำหนด ยังไม่มีใครรับ' : `⏱ เหลือ ${w.remaining_min} นาที`}
                  </span>
                </div>
                <div style={{ padding: '10px 14px', fontSize: 12.5, color: '#3C4750', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <span>📤 ส่งถึง <b>{w.executor}</b></span>
                  <span style={{ color: w.seen ? '#2E7D55' : '#94A0A8' }}>{w.seen ? `👁 เห็นแล้ว (${w.seen_after_min} นาที)` : '👁 ยังไม่เปิดดู'}</span>
                  {!done && (w.esc_name && w.esc_name !== w.executor) && <span style={{ color: '#C24036' }}>➡ ไล่ไปที่ <b>{w.esc_name}</b></span>}
                </div>
                {w.esc_log && w.esc_log.length > 0 && (
                  <div style={{ padding: '0 14px 10px', fontSize: 11.5, color: '#94A0A8' }}>
                    สายไล่ระดับ: {w.esc_log.map((l, i) => <span key={i}>{i > 0 ? ' → ' : ''}{l.to}</span>)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
