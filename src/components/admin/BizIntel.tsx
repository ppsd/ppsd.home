import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { baht } from '../../data'
import { useApp } from '../../store'
import ModalShell from '../shared/ModalShell'

// ===== ศูนย์วิเคราะห์ธุรกิจ — CEO + ผู้จัดการ (ยืนยัน PIN) =====
// ตรวจการเงิน (คำนวณสด) + รายงาน AI 5 หัวข้อ (เศรษฐกิจโลก · วัสดุ · คู่แข่ง · ลูกค้าจับผิด · มุมมองนักธุรกิจโลก) + แจ้งเตือน

type Sev = 'high' | 'med' | 'low'
interface FinFlag { sev: Sev; key: string; title: string; detail: string; action: string; acked: boolean; ackBy?: string; ackNote?: string }
interface AiAlert { id: number; kind: string; sev: Sev; title: string; detail: string; action: string; status: 'open' | 'ack'; created: string; ack_by?: string; ack_note?: string }
interface Competitor { id: number; name: string; area: string; website: string; note: string; source: 'user' | 'ai' }
interface ReportBody {
  summary: string; score: number | null; sections: { title: string; points: string[] }[]
  alerts: { sev: Sev; title: string; detail: string; action: string }[]; sources: { title: string; url: string }[]
  competitors: { name: string; area: string; website: string; price_range: string; strengths: string; weaknesses: string; vs_us: string }[]
}
interface Report { id: number; kind: string; created: string; by: string; body: ReportBody; cost_usd: number }
interface HouseRow { code: string; name: string; status: string; no_plan?: boolean; value: number; contractor_plan: number; other_expense: number; est_margin: number; est_margin_pct: number | null; collected: number; pct: number }
interface Running { kinds: string[]; done: string[]; failed: string[]; current: string; started: string; by: string }
interface IntelData {
  kinds: Record<string, { label: string; web: boolean }>; order: string[]
  kpis: { cash: number | null; houses_active: number; value_active: number; remain_active: number; ar_overdue: number; ar_overdue_n: number; ap_overdue: number; need_30d: number; inflow_30d: number; leads_30d: number; late_houses: number }
  finance: FinFlag[]; alerts: AiAlert[]; reports: Record<string, Report | null>; lastErr: Record<string, { created: string; error: string } | null>
  houses: HouseRow[]; competitors: Competitor[]
  settings: { freq: 'daily' | 'weekly' | 'manual'; auto: boolean; hour: number; line: boolean; line_users: number[]; line_candidates: { id: number; name: string }[]; last_run: { at: string; by: string; done: string[]; failed: string[] } | null; has_key: boolean }
  running: Running | null; cost30_usd: number
}
interface HistRow { id: number; created: string; by: string; ok: number; summary: string; score: number | null; error: string; cost_usd: number }

const card: React.CSSProperties = { background: '#fff', border: '1px solid #E1E5EA', borderRadius: 13, overflow: 'hidden' }
const btn: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }
const btnPrimary: React.CSSProperties = { ...btn, color: '#fff', background: '#30506A', border: 'none', fontWeight: 600 }
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 14, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 12px', outline: 'none', width: '100%' }
const SEV: Record<Sev, { c: string; bg: string; t: string }> = {
  high: { c: '#C24036', bg: '#FBEEEC', t: 'ด่วน' }, med: { c: '#B7791F', bg: '#F6ECD6', t: 'ควรดู' }, low: { c: '#5C6770', bg: '#EDF1F4', t: 'ข้อสังเกต' },
}
const TABS = [['overview', 'แจ้งเตือนทั้งหมด'], ['sales', 'กลยุทธ์การตลาด/การขาย'], ['finance', 'ตรวจการเงิน/บัญชี'], ['world', 'เศรษฐกิจโลก'], ['materials', 'วัสดุก่อสร้าง'], ['competitors', 'คู่แข่ง'], ['critic', 'ลูกค้าจับผิด'], ['tycoon', 'มุมมองนักธุรกิจโลก']] as const
type Tab = typeof TABS[number][0]
const KIND_HINT: Record<string, string> = {
  world: 'AI ค้นข่าวเศรษฐกิจโลก/ไทยล่าสุด ดอกเบี้ย สินเชื่อบ้าน วิกฤต และกติกาการค้าโลก (แบบรายงาน WTO) แล้วบอกว่ากระทบเราอย่างไร',
  materials: 'AI ค้นราคา/แนวโน้มวัสดุก่อสร้าง เทียบกับราคาที่เราซื้อจริงในระบบ แนะนำว่าควรล็อกราคาหรือเปลี่ยนวัสดุตัวไหน',
  competitors: 'AI ค้นบริษัทรับสร้างบ้านคู่แข่ง (ราชบุรี/ภาคตะวันตก/กรุงเทพฯ) + รายชื่อที่คุณเพิ่มเอง เทียบราคา จุดแข็ง จุดอ่อน',
  critic: 'AI สวมบท "ลูกค้าที่ฉลาดและจับผิดเก่งที่สุดในโลก" อ่านข้อมูลการทำงานจริงของเรา (งานล่าช้า NCR งวดเงิน ฯลฯ) แล้วชี้ข้อตำหนิ',
  sales: 'AI รวมผลทุกหัวข้อ + ข้อมูลลูกค้าจริงใน CRM (มาจากช่องทางไหน ปิดได้กี่ราย หลุดเพราะอะไร) วางแผนให้ฝ่ายขาย: ลูกค้าเป้าหมาย ช่องทาง แคมเปญ สคริปต์ปิดการขาย และสิ่งที่ต้องทำสัปดาห์นี้',
  tycoon: 'AI คิดแบบนักธุรกิจระดับโลก (แบบ ลี กาชิง / CK Group) + มุมการค้าโลก วิเคราะห์จุดอ่อน 5 อันดับและสิ่งที่ต้องเปลี่ยน',
}
const thb = (usd: number) => `≈ ${Math.round(usd * 36).toLocaleString('en-US')} บาท`
const dateTH = (ts?: string) => {
  if (!ts) return '-'
  const d = new Date(String(ts).replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function SevPill({ sev }: { sev: Sev }) {
  const s = SEV[sev] || SEV.med
  return <span style={{ fontSize: 11.5, fontWeight: 600, color: s.c, background: s.bg, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>{s.t}</span>
}

export default function BizIntel() {
  const { user } = useApp()
  const isManager = !!user?.isManager
  const [unlocked, setUnlocked] = useState(false)
  const [pin, setPin] = useState(''); const [pinErr, setPinErr] = useState(''); const [checking, setChecking] = useState(false)
  const [d, setD] = useState<IntelData | null>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<Tab>('overview')
  const [showAcked, setShowAcked] = useState(false)
  const [compOpen, setCompOpen] = useState(false)
  const [setOpen, setSetOpen] = useState(false)
  const [histKind, setHistKind] = useState<string | null>(null)
  const [viewReport, setViewReport] = useState<Report | null>(null)
  const pollRef = useRef<number | null>(null)

  const load = () => api.get<IntelData>('/intel').then((r) => { setD(r); setErr('') }).catch((e) => setErr((e as Error).message))
  useEffect(() => { if (unlocked) load() }, [unlocked])
  // ระหว่าง AI ทำรายงาน: ดึงสถานะทุก 6 วินาที จนเสร็จ
  useEffect(() => {
    if (!d?.running) return
    pollRef.current = window.setInterval(async () => {
      try { const s = await api.get<{ running: Running | null }>('/intel/status'); if (!s.running) load(); else setD((p) => (p ? { ...p, running: s.running } : p)) } catch { /* ignore */ }
    }, 6000)
    return () => { if (pollRef.current) window.clearInterval(pollRef.current) }
  }, [!!d?.running]) // eslint-disable-line react-hooks/exhaustive-deps

  const verify = async () => {
    if (!/^\d{4}$/.test(pin)) { setPinErr('กรอก PIN 4 หลัก'); return }
    setChecking(true); setPinErr('')
    try { await api.post('/verify-pin', { pin }); setUnlocked(true) } catch (e) { setPinErr((e as Error).message) } finally { setChecking(false) }
  }
  const run = async (kinds: string[]) => {
    const all = !kinds.length
    if (!window.confirm(all ? 'ให้ AI ทำรายงานครบทั้ง 6 หัวข้อตอนนี้?\nใช้เวลาประมาณ 5–20 นาที · ค่า AI ประมาณ 40–100 บาท' : `ให้ AI อัปเดตหัวข้อ "${d?.kinds[kinds[0]]?.label}" ตอนนี้?\nใช้เวลาประมาณ 1–4 นาที`)) return
    try { await api.post('/intel/run', { kinds }); load() } catch (e) { window.alert((e as Error).message) }
  }
  const ackAi = async (a: AiAlert, reopen = false) => {
    const note = reopen ? '' : (window.prompt('บันทึกว่าจะทำอะไร/ทำแล้ว (ถ้ามี):', '') ?? null)
    if (note === null) return
    await api.post(`/intel/alerts/${a.id}/ack`, { note, reopen }); load()
  }
  const ackFin = async (f: FinFlag, reopen = false) => {
    const note = reopen ? '' : (window.prompt('บันทึกว่าจะทำอะไร/ทำแล้ว (ถ้ามี):', '') ?? null)
    if (note === null) return
    await api.post('/intel/finance/ack', { key: f.key, note, reopen }); load()
  }

  if (!isManager) return <div style={{ ...card, padding: 40, textAlign: 'center' }}>ศูนย์วิเคราะห์ธุรกิจเปิดให้เฉพาะ <b>CEO และผู้จัดการ</b> เท่านั้น</div>
  if (!unlocked) return (
    <div style={{ maxWidth: 420, margin: '48px auto', ...card, padding: 34, textAlign: 'center' }}>
      <div style={{ fontSize: 30, marginBottom: 8 }}>📊</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#1C2730' }}>ยืนยันตัวตนก่อนเข้าศูนย์วิเคราะห์ธุรกิจ</div>
      <div style={{ fontSize: 13, color: '#5C6770', marginTop: 6, marginBottom: 16 }}>กรุณาใส่ PIN ของคุณ ({user?.name})</div>
      <input type="password" inputMode="numeric" maxLength={4} value={pin} autoFocus
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && verify()}
        placeholder="••••" style={{ width: 160, textAlign: 'center', letterSpacing: 8, fontSize: 22, fontFamily: 'inherit', border: '1px solid #D2DAE1', borderRadius: 10, padding: '10px 12px', outline: 'none' }} />
      {pinErr && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 10 }}>{pinErr}</div>}
      <div><button onClick={verify} disabled={checking} style={{ ...btnPrimary, marginTop: 16, fontSize: 14, padding: '10px 28px' }}>{checking ? 'กำลังตรวจสอบ…' : 'เข้าสู่ศูนย์วิเคราะห์'}</button></div>
    </div>
  )
  if (err && !d) return <div style={{ ...card, padding: 40, textAlign: 'center', color: '#C24036' }}>{err}</div>
  if (!d) return <div style={{ ...card, padding: 40, textAlign: 'center', color: '#94A0A8' }}>กำลังโหลด…</div>

  const k = d.kpis
  const finOpen = d.finance.filter((f) => !f.acked)
  const aiOpen = d.alerts.filter((a) => a.status === 'open')
  const highN = finOpen.filter((f) => f.sev === 'high').length + aiOpen.filter((a) => a.sev === 'high').length
  const medN = finOpen.filter((f) => f.sev !== 'high').length + aiOpen.filter((a) => a.sev !== 'high').length
  const Kpi = ({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) => (
    <div style={{ ...card, padding: '13px 16px' }}>
      <div style={{ fontSize: 12, color: '#5C6770' }}>{label}</div>
      <div className="num" style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: color || '#1C2730' }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 2 }}>{sub}</div>}
    </div>
  )

  const AlertRow = ({ sev, title, detail, action, tag, acked, ackBy, ackNote, onAck, onReopen }: { sev: Sev; title: string; detail?: string; action?: string; tag: string; acked: boolean; ackBy?: string; ackNote?: string; onAck: () => void; onReopen: () => void }) => (
    <div style={{ display: 'flex', gap: 12, padding: '12px 18px', borderTop: '1px solid #EEF1F4', opacity: acked ? 0.6 : 1, alignItems: 'flex-start' }}>
      <div style={{ paddingTop: 2 }}><SevPill sev={sev} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1C2730' }}>{title} <span style={{ fontSize: 11.5, fontWeight: 500, color: '#94A0A8' }}>· {tag}</span></div>
        {detail && <div style={{ fontSize: 12.5, color: '#5C6770', marginTop: 3 }}>{detail}</div>}
        {action && <div style={{ fontSize: 12.5, color: '#2E7D55', marginTop: 3 }}>→ {action}</div>}
        {acked && <div style={{ fontSize: 12, color: '#94A0A8', marginTop: 3 }}>✓ รับทราบโดย {ackBy || '-'}{ackNote ? ` · ${ackNote}` : ''}</div>}
      </div>
      {acked ? <button style={btn} onClick={onReopen}>เปิดใหม่</button> : <button style={btn} onClick={onAck}>รับทราบ</button>}
    </div>
  )

  const runningBox = d.running && (
    <div style={{ ...card, padding: '12px 18px', background: '#EEF4F8', borderColor: '#C9D8E3', fontSize: 13, color: '#30506A' }}>
      ⏳ AI กำลังทำรายงาน: <b>{d.kinds[d.running.current]?.label}</b> ({d.running.done.length + d.running.failed.length + 1}/{d.running.kinds.length}) · เริ่ม {dateTH(d.running.started)} โดย {d.running.by} — เปิดหน้าอื่นทำงานต่อได้ เสร็จแล้วจะแสดงเอง
    </div>
  )

  const ReportView = ({ kind, rep }: { kind: string; rep: Report | null }) => {
    const e = d.lastErr[kind]
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ ...card, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240, fontSize: 13, color: '#5C6770' }}>{KIND_HINT[kind]}</div>
          <button style={btn} onClick={() => setHistKind(kind)}>รายงานย้อนหลัง</button>
          <button style={btnPrimary} disabled={!!d.running || !d.settings.has_key} onClick={() => run([kind])}>อัปเดตหัวข้อนี้</button>
        </div>
        {e && (!rep || e.created > rep.created) && <div style={{ ...card, padding: '10px 18px', color: '#C24036', fontSize: 13 }}>ครั้งล่าสุด ({dateTH(e.created)}) ทำไม่สำเร็จ: {e.error}</div>}
        {!rep ? <div style={{ ...card, padding: 40, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีรายงาน — กด "อัปเดตหัวข้อนี้" {!d.settings.has_key && '(ต้องตั้งค่ากุญแจ AI ก่อน ที่เมนู ผู้ใช้งาน → ตั้งค่า AI)'}</div> : <ReportBodyView rep={rep} kind={kind} />}
        {kind === 'competitors' && (
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 18px' }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>รายชื่อคู่แข่งที่ติดตาม ({d.competitors.length})</span>
              <button style={{ ...btnPrimary, marginLeft: 'auto' }} onClick={() => setCompOpen(true)}>+ เพิ่มคู่แข่ง</button>
            </div>
            {d.competitors.map((c) => (
              <div key={c.id} style={{ display: 'flex', gap: 10, padding: '10px 18px', borderTop: '1px solid #EEF1F4', fontSize: 13, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <b>{c.name}</b> {c.area && <span style={{ color: '#5C6770' }}>· {c.area}</span>} <span style={{ fontSize: 11.5, color: '#94A0A8' }}>({c.source === 'ai' ? 'AI หาเจอ' : 'เพิ่มเอง'})</span>
                  {c.website && <> · <a href={c.website} target="_blank" rel="noreferrer">เว็บไซต์</a></>}
                  {c.note && <div style={{ fontSize: 12.5, color: '#5C6770', marginTop: 2 }}>{c.note}</div>}
                </div>
                <button style={btn} onClick={async () => { if (window.confirm(`เอา "${c.name}" ออกจากรายการติดตาม?`)) { await api.del(`/intel/competitors/${c.id}`); load() } }}>เอาออก</button>
              </div>
            ))}
            {!d.competitors.length && <div style={{ padding: '12px 18px', borderTop: '1px solid #EEF1F4', fontSize: 13, color: '#94A0A8' }}>ยังไม่มี — AI จะหาให้เองเมื่ออัปเดตหัวข้อนี้ หรือกดเพิ่มเอง</div>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="print-area page-print">
      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
        <Kpi label="เรื่องด่วน (ยังไม่รับทราบ)" value={String(highN)} color={highN ? '#C24036' : '#2E7D55'} sub={`ควรดู ${medN} เรื่อง`} />
        <Kpi label="เงินสด+ธนาคาร (ตามบัญชี)" value={k.cash == null ? '-' : baht(k.cash)} color={k.cash != null && k.cash < k.need_30d ? '#C24036' : undefined} />
        <Kpi label="ต้องจ่ายใน 30 วัน" value={baht(k.need_30d)} sub={`คาดว่าจะเก็บได้ ${baht(k.inflow_30d)}`} />
        <Kpi label="ลูกค้าค้างจ่าย (เลยกำหนด)" value={baht(k.ar_overdue)} color={k.ar_overdue ? '#B7791F' : undefined} sub={`${k.ar_overdue_n} งวด`} />
        <Kpi label="บ้านที่กำลังทำ" value={`${k.houses_active} หลัง`} sub={`มูลค่า ${baht(k.value_active)}`} />
        <Kpi label="ลูกค้าใหม่ 30 วัน" value={`${k.leads_30d} ราย`} sub={k.late_houses ? `บ้านเลยกำหนดส่ง ${k.late_houses} หลัง` : undefined} />
      </div>

      {runningBox}

      {/* tabs + actions */}
      <div style={{ display: 'flex', gap: 2, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 11, padding: '6px 8px', flexWrap: 'wrap', alignItems: 'center' }} className="no-print">
        {TABS.map(([id, label]) => (
          <div key={id} onClick={() => setTab(id)} style={{ fontSize: 13, fontWeight: tab === id ? 600 : 500, color: tab === id ? '#fff' : '#5C6770', background: tab === id ? '#30506A' : 'transparent', padding: '7px 13px', borderRadius: 7, cursor: 'pointer' }}>{label}</div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button style={btn} onClick={() => setSetOpen(true)}>⚙ ตั้งค่า</button>
          <button style={btn} onClick={() => window.print()}>🖨 พิมพ์</button>
          <button style={btnPrimary} disabled={!!d.running || !d.settings.has_key} onClick={() => run([])}>อัปเดตรายงานทั้งหมด</button>
        </div>
      </div>

      {tab === 'overview' && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 18px', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>แจ้งเตือนจุดอ่อน / สิ่งที่ต้องทำ</span>
            <span style={{ fontSize: 12, color: '#94A0A8' }}>
              รายงานล่าสุด: {d.settings.last_run ? `${dateTH(d.settings.last_run.at)} (${d.settings.last_run.by})` : 'ยังไม่เคยทำ'} · ค่า AI 30 วัน {thb(d.cost30_usd)}
            </span>
            <label style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5C6770', display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={showAcked} onChange={(e) => setShowAcked(e.target.checked)} /> แสดงที่รับทราบแล้ว
            </label>
          </div>
          {[...d.finance.filter((f) => f.sev === 'high'), ...d.alerts.filter((a) => a.sev === 'high'), ...d.finance.filter((f) => f.sev !== 'high'), ...d.alerts.filter((a) => a.sev !== 'high')]
            .filter((x) => showAcked || ('key' in x ? !x.acked : x.status === 'open'))
            .map((x) => 'key' in x
              ? <AlertRow key={x.key} sev={x.sev} title={x.title} detail={x.detail} action={x.action} tag="ตรวจการเงิน" acked={x.acked} ackBy={x.ackBy} ackNote={x.ackNote} onAck={() => ackFin(x)} onReopen={() => ackFin(x, true)} />
              : <AlertRow key={'a' + x.id} sev={x.sev} title={x.title} detail={x.detail} action={x.action} tag={`${d.kinds[x.kind]?.label || x.kind} · ${dateTH(x.created)}`} acked={x.status === 'ack'} ackBy={x.ack_by} ackNote={x.ack_note} onAck={() => ackAi(x)} onReopen={() => ackAi(x, true)} />)}
          {!finOpen.length && !aiOpen.length && <div style={{ padding: '24px 18px', borderTop: '1px solid #EEF1F4', textAlign: 'center', color: '#2E7D55', fontSize: 13 }}>ไม่มีเรื่องค้าง 👍 {!d.reports.tycoon && '— ลองกด "อัปเดตรายงานทั้งหมด" ให้ AI วิเคราะห์ครั้งแรก'}</div>}
        </div>
      )}

      {tab === 'finance' && (
        <>
          <div style={card}>
            <div style={{ padding: '12px 18px', fontSize: 14, fontWeight: 600 }}>ผลตรวจการเงิน/บัญชี (คำนวณสดจากข้อมูลในระบบ ไม่ใช้ AI)</div>
            {d.finance.filter((f) => showAcked || !f.acked).map((x) => <AlertRow key={x.key} sev={x.sev} title={x.title} detail={x.detail} action={x.action} tag="ตรวจการเงิน" acked={x.acked} ackBy={x.ackBy} ackNote={x.ackNote} onAck={() => ackFin(x)} onReopen={() => ackFin(x, true)} />)}
            {!d.finance.length && <div style={{ padding: '18px', borderTop: '1px solid #EEF1F4', color: '#2E7D55', fontSize: 13 }}>ไม่พบความผิดปกติด้านการเงิน</div>}
          </div>
          <div style={card}>
            <div style={{ padding: '12px 18px', fontSize: 14, fontWeight: 600 }}>กำไรประมาณการรายหลัง <span style={{ fontSize: 12, fontWeight: 400, color: '#94A0A8' }}>= ราคาขาย − ค่าช่างตามสัญญา − รายจ่ายอื่นที่ลงบ้านนั้น · เรียงจากกำไรน้อยสุด</span></div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: '#F6F8FA', color: '#5C6770', textAlign: 'left' }}>
                  {['บ้าน', 'สถานะ', 'ราคาขาย', 'ค่าช่าง', 'รายจ่ายอื่น', 'กำไรประมาณ', '%', 'เก็บแล้ว'].map((h) => <th key={h} style={{ padding: '8px 12px', fontWeight: 600, fontSize: 12 }}>{h}</th>)}
                </tr></thead>
                <tbody>{d.houses.map((h) => (
                  <tr key={h.code} style={{ borderTop: '1px solid #EEF1F4' }}>
                    <td style={{ padding: '8px 12px' }}><b>{h.code}</b> <span style={{ color: '#5C6770' }}>{h.name}</span></td>
                    <td style={{ padding: '8px 12px' }}>{h.status}</td>
                    <td className="num" style={{ padding: '8px 12px' }}>{baht(h.value)}</td>
                    <td className="num" style={{ padding: '8px 12px' }}>{baht(h.contractor_plan)}</td>
                    <td className="num" style={{ padding: '8px 12px' }}>{baht(h.other_expense)}</td>
                    {h.no_plan
                      ? <td colSpan={2} style={{ padding: '8px 12px', color: '#B7791F', fontSize: 12.5 }}>⚠ ยังไม่ใส่ค่าช่างตามสัญญา — คิดกำไรไม่ได้</td>
                      : <>
                        <td className="num" style={{ padding: '8px 12px', color: h.est_margin < 0 ? '#C24036' : undefined, fontWeight: 600 }}>{baht(h.est_margin)}</td>
                        <td className="num" style={{ padding: '8px 12px', color: h.est_margin_pct != null && h.est_margin_pct < 10 ? '#C24036' : '#2E7D55' }}>{h.est_margin_pct == null ? '-' : h.est_margin_pct + '%'}</td>
                      </>}
                    <td className="num" style={{ padding: '8px 12px' }}>{h.pct}%</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {d.order.includes(tab) && <ReportView kind={tab} rep={d.reports[tab]} />}

      {compOpen && <CompetitorModal onClose={() => setCompOpen(false)} onSaved={() => { setCompOpen(false); load() }} />}
      {setOpen && <SettingsModal s={d.settings} onClose={() => setSetOpen(false)} onSaved={() => { setSetOpen(false); load() }} />}
      {histKind && <HistoryModal kind={histKind} label={d.kinds[histKind]?.label} onClose={() => setHistKind(null)} onOpen={async (id) => { try { setViewReport(await api.get<Report>(`/intel/report/${id}`)) } catch (e) { window.alert((e as Error).message) } }} />}
      {viewReport && (
        <ModalShell title={`${d.kinds[viewReport.kind]?.label} — ${dateTH(viewReport.created)}`} sub={`ทำโดย ${viewReport.by}`} width={860} onClose={() => setViewReport(null)}>
          <ReportBodyView rep={viewReport} kind={viewReport.kind} />
        </ModalShell>
      )}
    </div>
  )
}

function ReportBodyView({ rep, kind }: { rep: Report; kind: string }) {
  const b = rep.body || ({} as ReportBody)
  const scoreLabel: Record<string, string> = { world: 'สภาพแวดล้อมธุรกิจ', materials: 'ความนิ่งของต้นทุนวัสดุ', competitors: 'ความสามารถแข่งขันของเรา', critic: 'ความพอใจของลูกค้าจับผิด', tycoon: 'สุขภาพธุรกิจโดยรวม', sales: 'ความพร้อมของระบบขาย' }
  const sc = b.score
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...card, padding: '16px 18px', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        {sc != null && (
          <div style={{ textAlign: 'center', minWidth: 110 }}>
            <div className="num" style={{ fontSize: 34, fontWeight: 700, color: sc >= 70 ? '#2E7D55' : sc >= 45 ? '#B7791F' : '#C24036' }}>{sc}<span style={{ fontSize: 15, color: '#94A0A8' }}>/100</span></div>
            <div style={{ fontSize: 11.5, color: '#5C6770' }}>{scoreLabel[kind]}</div>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 14.5, color: '#1C2730', lineHeight: 1.65 }}>{b.summary}</div>
          <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 6 }}>ทำเมื่อ {dateTH(rep.created)} โดย {rep.by} · ค่า AI {thb(rep.cost_usd || 0)} · เป็นการวิเคราะห์ของ AI ควรตรวจสอบก่อนตัดสินใจเรื่องใหญ่</div>
        </div>
      </div>
      {!!b.alerts?.length && (
        <div style={card}>
          <div style={{ padding: '12px 18px', fontSize: 14, fontWeight: 600 }}>ข้อเตือนจากรายงานนี้</div>
          {b.alerts.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 18px', borderTop: '1px solid #EEF1F4' }}>
              <div style={{ paddingTop: 2 }}><SevPill sev={a.sev} /></div>
              <div><div style={{ fontSize: 13.5, fontWeight: 600 }}>{a.title}</div>{a.detail && <div style={{ fontSize: 12.5, color: '#5C6770' }}>{a.detail}</div>}{a.action && <div style={{ fontSize: 12.5, color: '#2E7D55' }}>→ {a.action}</div>}</div>
            </div>
          ))}
        </div>
      )}
      {!!b.competitors?.length && (
        <div style={card}>
          <div style={{ padding: '12px 18px', fontSize: 14, fontWeight: 600 }}>เทียบคู่แข่ง</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ background: '#F6F8FA', color: '#5C6770', textAlign: 'left' }}>{['บริษัท', 'พื้นที่', 'ราคา', 'จุดแข็ง', 'จุดอ่อน', 'เทียบกับเรา'].map((h) => <th key={h} style={{ padding: '8px 12px', fontWeight: 600 }}>{h}</th>)}</tr></thead>
              <tbody>{b.competitors.map((c, i) => (
                <tr key={i} style={{ borderTop: '1px solid #EEF1F4', verticalAlign: 'top' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{c.website ? <a href={c.website} target="_blank" rel="noreferrer">{c.name}</a> : c.name}</td>
                  <td style={{ padding: '8px 12px' }}>{c.area}</td><td style={{ padding: '8px 12px' }}>{c.price_range}</td>
                  <td style={{ padding: '8px 12px' }}>{c.strengths}</td><td style={{ padding: '8px 12px' }}>{c.weaknesses}</td><td style={{ padding: '8px 12px' }}>{c.vs_us}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
      {(b.sections || []).map((s, i) => (
        <div key={i} style={{ ...card, padding: '14px 18px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#30506A', marginBottom: 6 }}>{s.title}</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, color: '#1C2730', lineHeight: 1.7 }}>{s.points.map((p, j) => <li key={j}>{p}</li>)}</ul>
        </div>
      ))}
      {!!b.sources?.length && (
        <div style={{ ...card, padding: '12px 18px', fontSize: 12.5 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>แหล่งข้อมูลที่ AI ใช้</div>
          {b.sources.map((s, i) => <div key={i}><a href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a></div>)}
        </div>
      )}
    </div>
  )
}

function CompetitorModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: '', area: '', website: '', note: '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!f.name.trim()) { window.alert('ใส่ชื่อบริษัทคู่แข่ง'); return }
    setBusy(true)
    try { await api.post('/intel/competitors', f); onSaved() } catch (e) { window.alert((e as Error).message) } finally { setBusy(false) }
  }
  const row = (label: string, k: keyof typeof f, ph = '') => (
    <div style={{ marginBottom: 12 }}><div style={{ fontSize: 12.5, fontWeight: 600, color: '#5C6770', marginBottom: 5 }}>{label}</div>
      <input style={field} value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  )
  return (
    <ModalShell title="เพิ่มคู่แข่งที่ต้องการติดตาม" sub="AI จะวิเคราะห์รายนี้ทุกครั้งที่อัปเดตหัวข้อคู่แข่ง" onClose={onClose}
      footer={<><button style={btn} onClick={onClose}>ยกเลิก</button><button style={btnPrimary} disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button></>}>
      {row('ชื่อบริษัท *', 'name', 'เช่น บริษัทรับสร้างบ้าน ABC')}
      {row('พื้นที่', 'area', 'เช่น ราชบุรี / นครปฐม / กรุงเทพฯ')}
      {row('เว็บไซต์หรือเพจ', 'website', 'https://...')}
      {row('หมายเหตุ', 'note', 'เช่น เคยแย่งลูกค้าเรา ราคาถูกกว่า 10%')}
    </ModalShell>
  )
}

function SettingsModal({ s, onClose, onSaved }: { s: IntelData['settings']; onClose: () => void; onSaved: () => void }) {
  const [freq, setFreq] = useState(s.freq || 'weekly'); const [hour, setHour] = useState(s.hour); const [line, setLine] = useState(s.line)
  const [who, setWho] = useState<number[]>(s.line_users || [])
  const save = async () => { try { await api.put('/intel/settings', { freq, hour, line, line_users: who }); onSaved() } catch (e) { window.alert((e as Error).message) } }
  return (
    <ModalShell title="ตั้งค่าศูนย์วิเคราะห์ธุรกิจ" onClose={onClose}
      footer={<><button style={btn} onClick={onClose}>ยกเลิก</button><button style={btnPrimary} onClick={save}>บันทึก</button></>}>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>ให้ AI ทำรายงานครบ 6 หัวข้อ (ค่า AI ประมาณ 57 บาท/ครั้ง)</div>
      {([['weekly', 'ทุกเช้าวันจันทร์ (แนะนำ)', 'ประมาณ 230 บาท/เดือน · ถ้าวันจันทร์เครื่องปิด จะทำวันถัดไปที่เปิด'], ['daily', 'ทุกเช้า', 'ประมาณ 1,700 บาท/เดือน'], ['manual', 'กดเองเท่านั้น', 'จ่ายเฉพาะตอนกด "อัปเดตรายงานทั้งหมด" / "อัปเดตหัวข้อนี้"']] as const).map(([v, t, sub]) => (
        <label key={v} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, marginBottom: 8, cursor: 'pointer' }}>
          <input type="radio" name="intel-freq" checked={freq === v} onChange={() => setFreq(v)} style={{ marginTop: 4 }} />
          <span>{t}<div style={{ fontSize: 12, color: '#94A0A8' }}>{sub}</div></span>
        </label>
      ))}
      <div style={{ fontSize: 13, color: '#5C6770', margin: '6px 0 14px', display: freq === 'manual' ? 'none' : 'flex', gap: 8, alignItems: 'center' }}>
        เวลาเริ่มทำ (โมง):
        <input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))} style={{ ...field, width: 80 }} />
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={line} onChange={(e) => setLine(e.target.checked)} /> ส่ง LINE เมื่อมี "เรื่องด่วน" ใหม่
      </label>
      {line && (
        <div style={{ margin: '10px 0 0 26px', fontSize: 13, color: '#5C6770' }}>
          <div style={{ marginBottom: 6 }}>ส่งให้ใคร (ไม่ติ๊กเลย = CEO/ผู้จัดการทุกคนที่ผูก LINE):</div>
          {s.line_candidates.map((u) => (
            <label key={u.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, cursor: 'pointer', color: '#1C2730' }}>
              <input type="checkbox" checked={who.includes(u.id)} onChange={(e) => setWho(e.target.checked ? [...who, u.id] : who.filter((x) => x !== u.id))} /> {u.name}
            </label>
          ))}
          {!s.line_candidates.length && <div>ยังไม่มี CEO/ผู้จัดการที่ผูก LINE</div>}
        </div>
      )}
      {!s.has_key && <div style={{ marginTop: 14, fontSize: 12.5, color: '#C24036' }}>ยังไม่ได้ตั้งกุญแจ AI — ผู้ดูแลระบบตั้งได้ที่เมนู ผู้ใช้งาน → ตั้งค่า AI</div>}
    </ModalShell>
  )
}

function HistoryModal({ kind, label, onClose, onOpen }: { kind: string; label?: string; onClose: () => void; onOpen: (id: number) => void }) {
  const [rows, setRows] = useState<HistRow[] | null>(null)
  useEffect(() => { api.get<HistRow[]>(`/intel/history/${kind}`).then(setRows).catch(() => setRows([])) }, [kind])
  return (
    <ModalShell title={`รายงานย้อนหลัง — ${label || kind}`} width={720} onClose={onClose}>
      {!rows ? <div style={{ color: '#94A0A8' }}>กำลังโหลด…</div> : !rows.length ? <div style={{ color: '#94A0A8' }}>ยังไม่มีรายงาน</div> : rows.map((r) => (
        <div key={r.id} onClick={() => r.ok && onOpen(r.id)} className={r.ok ? 'hov-f3f5f7' : ''} style={{ padding: '10px 12px', borderBottom: '1px solid #EEF1F4', cursor: r.ok ? 'pointer' : 'default', fontSize: 13 }}>
          <div style={{ display: 'flex', gap: 8 }}><b>{dateTH(r.created)}</b><span style={{ color: '#94A0A8' }}>{r.by}</span>{r.score != null && <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{r.score}/100</span>}</div>
          <div style={{ color: r.ok ? '#5C6770' : '#C24036', marginTop: 2 }}>{r.ok ? r.summary : 'ไม่สำเร็จ: ' + r.error}</div>
        </div>
      ))}
    </ModalShell>
  )
}
