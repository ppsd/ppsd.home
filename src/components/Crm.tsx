import { useEffect, useState } from 'react'
import { api } from '../api'
import { baht } from '../data'
import { useApp, useLiveRefresh } from '../store'
import Pager from './Pager'

// ===== CRM: ลูกค้า 360 · Lead/Pipeline · รายงาน CRM =====
const th: React.CSSProperties = { padding: '9px 14px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'left' }
const td: React.CSSProperties = { padding: '10px 14px' }
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '8px 11px', outline: 'none' }
const card: React.CSSProperties = { background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }
const btn = (bg = '#30506A', color = '#fff', border = 'none'): React.CSSProperties => ({ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color, background: bg, border, borderRadius: 8, padding: '7px 13px', cursor: 'pointer' })
const ghost = btn('#fff', '#30506A', '1px solid #D2DAE1')

interface CrmCustomer { id: number; code: string; name: string; phone: string; email: string; address: string; project: string; status: string; note: string; created: string; source?: string; owner?: string; birthday?: string; tags?: string; line_uid?: string | null; line_linked?: boolean; houses?: number; referral_code?: string; portal_token?: string }
interface Contact { id: number; customer_id: number; lead_id?: number; date: string; channel: string; note: string; by: string; house_code?: string; next_action?: string; next_date?: string; done?: number }
interface Inst { id: number; no: number; detail: string; due: string; due_iso?: string; amount: number; paid?: number; status: string }
interface Issue { id: number; title: string; status: string; date: string; priority: string; case_no?: string; sla_due?: string; assignee?: string; open?: boolean; sla_overdue?: boolean }
interface Warranty { start: string | null; delivered: boolean; items: { name: string; years: number; expires: string | null; days_left: number | null; active: boolean }[] }
interface CaseRow { id: number; case_no: string | null; house_code: string; house: string; house_manager: string; customer: string; customer_id: number | null; customer_line: boolean; title: string; note: string; by: string; date: string; priority: string; status: string; source: string; sla_due: string; created_at: string; resolved_at: string | null; assignee: string; photo: string | null; category: string; open: boolean; sla_overdue: boolean; hours_open: number | null; log: { at: string; by: string; text: string }[] }
interface NpsRow { id: number; customer_id: number; customer: string; house_code: string; trigger_key: string; score: number | null; comment: string | null; asked_at: string; answered_at: string | null }
type CrmSettings = Record<string, string>
interface QcProg { phases: { id: string; name: string; forms: number; passed: boolean; fixing: boolean; started: boolean }[]; done: number; total: number; current: { id: string; name: string } | null }
interface House360 { id: number; code: string; name: string; project: string; status: string; pct: number; value: number; deliver_date?: string; manager?: string; installments: Inst[]; inst_paid: number; inst_total: number; next_due: Inst | null; issues: Issue[]; open_issues: number; qc: QcProg; files: number; photos: string[]; warranty?: Warranty | null }
interface C360 extends Omit<CrmCustomer, 'houses'> { houses: House360[]; docs: { id: number; type: string; no: string; date: string; total: number; status: string }[]; contacts: Contact[]; leads: Lead[]; referrals: { id: number; no: string; name: string; stage: string; created: string }[]; next_actions: { id: number; action: string; date: string; by: string; overdue: boolean }[] }
interface Lead { id: number; no: string; name: string; phone: string; line: string; email: string; source: string; stage: string; value: number; owner: string; note: string; next_date: string; referral_code: string; referred_by: string; house_type: string; area: string; budget: number; customer_id: number | null; lost_reason: string; created: string; updated: string; stage_at: string; contacted_at: string; won_at: string; stale: boolean; idle_days: number }
interface Metrics { customers: number; line_linked: number; leads_total: number; leads_open: number; leads_stale: number; leads_won: number; conversion: number; avg_close_days: number | null; per_month: { month: string; leads: number; won: number }[]; by_source: { source: string; leads: number; won: number }[]; pipeline: { stage: string; n: number; value: number }[]; referrals: number; open_cases: number; avg_resolve_hours: number | null; nps: { avg: number; n: number; score: number } | null }

const STATUS_STYLE = (s: string) => s === 'ปิดการขาย' ? { c: '#2E7D55', bg: '#E2F1EA' } : s === 'กำลังคุย' ? { c: '#30506A', bg: '#E2E9EF' } : s === 'ยกเลิก' ? { c: '#5C6770', bg: '#EDF1F4' } : { c: '#B7791F', bg: '#F6ECD6' }
const STAGE_COLOR: Record<string, string> = { 'สนใจ': '#B7791F', 'นัดคุย': '#30506A', 'เสนอราคา/แบบ': '#6B4E9E', 'ต่อรอง': '#C0852C', 'เซ็นสัญญา': '#2E7D55', 'ยกเลิก': '#94A0A8' }
const CHANNELS = ['โทรศัพท์', 'LINE', 'นัดพบ', 'ไซต์วิสิต', 'อีเมล', 'อื่นๆ']

export default function Crm() {
  const { user } = useApp()
  const [tab, setTab] = useState<'customers' | 'leads' | 'cases' | 'nps' | 'auto' | 'report'>('customers')
  const isMgr = !!user && (user.role === 'admin' || user.role === 'accounting' || (user as { isManager?: boolean }).isManager)
  const tabs = [{ id: 'customers', label: '👤 ลูกค้า (360°)' }, { id: 'leads', label: '🎯 Lead / Pipeline' }, { id: 'cases', label: '🛠 เคสบริการ / แจ้งซ่อม' }, ...(isMgr ? [{ id: 'nps', label: '⭐ NPS / บอกต่อ' }, { id: 'auto', label: '💬 LINE ลูกค้า & อัตโนมัติ' }, { id: 'report', label: '📊 รายงาน CRM' }] : [])] as { id: typeof tab; label: string }[]
  return (
    <div style={{ maxWidth: 1360, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {tabs.map((t) => <button key={t.id} onClick={() => setTab(t.id)} style={{ ...btn(tab === t.id ? '#30506A' : '#fff', tab === t.id ? '#fff' : '#30506A', '1px solid #D2DAE1') }}>{t.label}</button>)}
      </div>
      {tab === 'customers' && <CustomersTab />}
      {tab === 'leads' && <LeadsTab />}
      {tab === 'cases' && <CasesTab />}
      {tab === 'nps' && <NpsTab />}
      {tab === 'auto' && <AutoTab />}
      {tab === 'report' && <ReportTab />}
    </div>
  )
}

// ---------- ลูกค้า 360 ----------
function CustomersTab() {
  const [list, setList] = useState<CrmCustomer[]>([])
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [selId, setSelId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', project: '', status: 'สนใจ', address: '', source: 'อื่นๆ' })
  const [err, setErr] = useState('')
  const load = () => api.get<CrmCustomer[]>('/crm/customers').then(setList).catch(() => setList([]))
  useEffect(() => { load() }, [])
  useLiveRefresh(['customers', 'houses', 'crm'], load)
  const filtered = list.filter((c) => `${c.name} ${c.phone} ${c.project} ${c.status} ${c.code}`.toLowerCase().includes(q.trim().toLowerCase()))
  const PAGE = 25
  const add = async () => {
    if (!form.name.trim()) { setErr('กรอกชื่อลูกค้า'); return }
    try { await api.post('/customers', form); setAdding(false); setForm({ name: '', phone: '', email: '', project: '', status: 'สนใจ', address: '', source: 'อื่นๆ' }); load() } catch (e) { setErr((e as Error).message) }
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: selId ? 'minmax(320px, 1fr) 2fr' : '1fr', gap: 14, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#5C6770' }}>ลูกค้า <b className="num" style={{ color: '#1C2730' }}>{filtered.length}/{list.length}</b> ราย · ผูก LINE แล้ว <b className="num">{list.filter((c) => c.line_linked).length}</b></span>
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="ค้นหาชื่อ/เบอร์/รหัส/โครงการ" style={{ ...field, width: 220 }} />
          <button onClick={() => setAdding((v) => !v)} style={{ ...btn(), marginLeft: 'auto' }}>+ เพิ่มลูกค้า</button>
        </div>
        {adding && (
          <div style={{ ...card, padding: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
              <input style={field} placeholder="ชื่อลูกค้า *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input style={field} placeholder="เบอร์โทร" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <input style={field} placeholder="อีเมล" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input style={field} placeholder="โครงการ/แบบบ้านที่สนใจ" value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} />
              <select style={field} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{['สนใจ', 'กำลังคุย', 'ปิดการขาย', 'ยกเลิก'].map((s) => <option key={s}>{s}</option>)}</select>
              <input style={field} placeholder="ที่อยู่" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            {err && <div style={{ fontSize: 12, color: '#C24036', marginTop: 8 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}><button onClick={() => setAdding(false)} style={ghost}>ยกเลิก</button><button onClick={add} style={btn()}>บันทึก</button></div>
          </div>
        )}
        <div style={card}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#F7F9FB' }}><th style={{ ...th, paddingLeft: 16 }}>ลูกค้า</th><th style={th}>บ้าน</th><th style={{ ...th, textAlign: 'center' }}>สถานะ</th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={3} style={{ padding: 30, textAlign: 'center', color: '#94A0A8' }}>ไม่พบลูกค้า</td></tr>}
              {filtered.slice((page - 1) * PAGE, page * PAGE).map((c) => { const ss = STATUS_STYLE(c.status); return (
                <tr key={c.id} onClick={() => setSelId(c.id)} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6', cursor: 'pointer', background: selId === c.id ? '#EEF3F7' : undefined }}>
                  <td style={{ ...td, paddingLeft: 16 }}><div style={{ fontWeight: 600 }}>{c.name} {c.line_linked ? <span title="ผูก LINE แล้ว" style={{ fontSize: 10, color: '#06C755' }}>● LINE</span> : null}</div><div style={{ fontSize: 11, color: '#94A0A8' }}>{c.code} · {c.phone || '-'}{c.source ? ' · ' + c.source : ''}</div></td>
                  <td className="num" style={td}>{c.houses || 0}</td>
                  <td style={{ ...td, textAlign: 'center' }}><span style={{ fontSize: 11, fontWeight: 600, color: ss.c, background: ss.bg, padding: '3px 10px', borderRadius: 20 }}>{c.status}</span></td>
                </tr>) })}
            </tbody>
          </table>
          <Pager page={page} setPage={setPage} total={filtered.length} pageSize={PAGE} />
        </div>
      </div>
      {selId && <Customer360 id={selId} onClose={() => setSelId(null)} onChanged={load} />}
    </div>
  )
}

function Customer360({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { data } = useApp()
  const [c, setC] = useState<C360 | null>(null)
  const [cf, setCf] = useState({ channel: 'โทรศัพท์', note: '', next_action: '', next_date: '', house_code: '' })
  const [edit, setEdit] = useState(false)
  const [ef, setEf] = useState<Partial<CrmCustomer> & { house_codes?: string[] }>({})
  const [msg, setMsg] = useState('')
  const load = () => api.get<C360>('/crm/customers/' + id + '/360').then((x) => { setC(x); setEf({ name: x.name, phone: x.phone, email: x.email, address: x.address, project: x.project, status: x.status, note: x.note, source: x.source || '', owner: x.owner || '', birthday: x.birthday || '', house_codes: x.houses.map((h) => h.code) }) }).catch(() => setC(null))
  useEffect(() => { load(); setEdit(false) /* eslint-disable-next-line */ }, [id])
  useLiveRefresh(['customers', 'houses', 'crm', 'issues', 'installments', 'qc'], load)
  if (!c) return <div style={{ ...card, padding: 20, color: '#94A0A8' }}>กำลังโหลด…</div>
  const addContact = async () => {
    if (!cf.note.trim() && !cf.next_action.trim()) { setMsg('กรอกรายละเอียดหรือสิ่งที่ต้องทำต่อ'); return }
    try { await api.post('/crm/customers/' + id + '/contacts', cf); setCf({ channel: 'โทรศัพท์', note: '', next_action: '', next_date: '', house_code: '' }); setMsg(''); load() } catch (e) { setMsg((e as Error).message) }
  }
  const save = async () => { try { await api.put('/crm/customers/' + id, ef); setEdit(false); load(); onChanged() } catch (e) { setMsg((e as Error).message) } }
  const doneAction = async (cid: number) => { await api.post('/crm/contacts/' + cid + '/done', {}); load() }
  const [code, setCode] = useState<{ code: string; expires_hours: number } | null>(null)
  const [pushOpen, setPushOpen] = useState(false)
  const [pushText, setPushText] = useState('')
  const lineCode = async () => { try { const r = await api.post<{ code: string; expires_hours: number }>('/crm/customers/' + id + '/line-code', {}); setCode(r); setMsg('') } catch (e) { setMsg((e as Error).message) } }
  const sendProgress = async () => { try { const r = await api.post<{ ok: boolean }>('/crm/customers/' + id + '/send-progress', {}); setMsg(r.ok ? 'ส่งความคืบหน้าให้ลูกค้าทาง LINE แล้ว' : 'ส่งไม่สำเร็จ (ตรวจ LINE token)'); load() } catch (e) { setMsg((e as Error).message) } }
  const pushMsg = async () => { if (!pushText.trim()) return; try { const r = await api.post<{ ok: boolean }>('/crm/customers/' + id + '/push', { text: pushText }); setMsg(r.ok ? 'ส่งข้อความแล้ว' : 'ส่งไม่สำเร็จ'); setPushText(''); setPushOpen(false); load() } catch (e) { setMsg((e as Error).message) } }
  const askNps = async () => { try { const r = await api.post<{ ok: boolean }>('/crm/customers/' + id + '/ask-nps', {}); setMsg(r.ok ? 'ส่งคำถามให้คะแนนแล้ว' : 'ส่งไม่สำเร็จ (อาจเคยถามหัวข้อนี้แล้ว)') } catch (e) { setMsg((e as Error).message) } }
  const closeCase = async (i: Issue, status: string) => { const note = status === 'แก้ไขแล้ว' ? window.prompt('สรุปการแก้ไขที่จะแจ้งลูกค้า (เว้นว่างได้)') : ''; if (note === null) return; try { await api.put('/crm/cases/' + i.id, { status, note_add: note || '' }); load() } catch (e) { setMsg((e as Error).message) } }
  const ss = STATUS_STYLE(c.status)
  const section = (title: string, body: React.ReactNode, extra?: React.ReactNode) => <div style={{ ...card }}><div style={{ padding: '9px 14px', borderBottom: '1px solid #EEF1F4', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>{title}{extra}</div><div style={{ padding: 12 }}>{body}</div></div>
  const allHouses = (data.houses || []).filter((h) => h.kind !== 'office')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* หัวลูกค้า */}
      <div style={{ ...card, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: '#E2E9EF', color: '#30506A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18 }}>{c.name.replace(/^(นาย|นาง|นางสาว|คุณ)\s*/, '').slice(0, 1)}</div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{c.name} <span style={{ fontSize: 11, fontWeight: 600, color: ss.c, background: ss.bg, padding: '2px 9px', borderRadius: 20, marginLeft: 6 }}>{c.status}</span></div>
            <div style={{ fontSize: 12, color: '#5C6770', marginTop: 3 }}>{c.code} · 📞 {c.phone || '-'} · ✉️ {c.email || '-'}{c.owner ? ` · ผู้ดูแล ${c.owner}` : ''}{c.source ? ` · มาจาก ${c.source}` : ''}</div>
            <div style={{ fontSize: 12, color: '#5C6770' }}>📍 {c.address || '-'}</div>
            <div style={{ fontSize: 11.5, marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ color: c.line_linked ? '#06C755' : '#94A0A8' }}>● LINE {c.line_linked ? 'ผูกแล้ว' : 'ยังไม่ผูก'}</span>
              <span style={{ color: '#6B4E9E' }}>รหัสบอกต่อ <b className="num">{c.referral_code}</b>{c.referrals.length ? ` · แนะนำมาแล้ว ${c.referrals.length} ราย` : ''}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={lineCode} title="ขอรหัส 6 หลักให้ลูกค้าส่งเข้า LINE OA ของบริษัท" style={{ ...ghost, color: '#06C755', borderColor: '#B7E4C7' }}>💬 {c.line_linked ? 'ผูก LINE ใหม่' : 'ผูก LINE ลูกค้า'}</button>
            {c.line_linked && <button onClick={sendProgress} style={ghost}>📬 ส่งความคืบหน้า</button>}
            {c.line_linked && <button onClick={() => setPushOpen((v) => !v)} style={ghost}>✉ ส่งข้อความ</button>}
            {c.line_linked && <button onClick={askNps} style={ghost}>⭐ ขอคะแนน</button>}
            <button onClick={() => setEdit((v) => !v)} style={ghost}>✎ แก้ไข</button><button onClick={onClose} style={ghost}>✕</button></div>
        </div>
        {edit && (
          <div style={{ marginTop: 12, borderTop: '1px solid #EEF1F4', paddingTop: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {([['name', 'ชื่อ'], ['phone', 'เบอร์โทร'], ['email', 'อีเมล'], ['project', 'โครงการ/แบบบ้าน'], ['owner', 'ผู้ดูแล (เซลส์)'], ['source', 'มาจากช่องทาง'], ['birthday', 'วันเกิด (YYYY-MM-DD)'], ['address', 'ที่อยู่']] as [keyof CrmCustomer, string][]).map(([k, l]) => (
                <label key={k} style={{ fontSize: 11.5, color: '#5C6770' }}>{l}<input style={{ ...field, width: '100%', marginTop: 3 }} value={String(ef[k] ?? '')} onChange={(e) => setEf({ ...ef, [k]: e.target.value })} /></label>
              ))}
              <label style={{ fontSize: 11.5, color: '#5C6770' }}>สถานะ<select style={{ ...field, width: '100%', marginTop: 3 }} value={ef.status || ''} onChange={(e) => setEf({ ...ef, status: e.target.value })}>{['สนใจ', 'กำลังคุย', 'ปิดการขาย', 'ยกเลิก'].map((s) => <option key={s}>{s}</option>)}</select></label>
              <label style={{ fontSize: 11.5, color: '#5C6770', gridColumn: '1 / -1' }}>บ้านของลูกค้า (ติ๊กผูก/ถอด)
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  {allHouses.map((h) => { const on = (ef.house_codes || []).includes(h.code); return <label key={h.code} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 8, border: '1px solid ' + (on ? '#30506A' : '#D2DAE1'), background: on ? '#E8EEF3' : '#fff', cursor: 'pointer' }}><input type="checkbox" checked={on} onChange={(e) => setEf({ ...ef, house_codes: e.target.checked ? [...(ef.house_codes || []), h.code] : (ef.house_codes || []).filter((x) => x !== h.code) })} /> {h.code} {h.name}</label> })}
                </div>
              </label>
              <label style={{ fontSize: 11.5, color: '#5C6770', gridColumn: '1 / -1' }}>หมายเหตุ<textarea style={{ ...field, width: '100%', marginTop: 3, minHeight: 50 }} value={ef.note || ''} onChange={(e) => setEf({ ...ef, note: e.target.value })} /></label>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}><button onClick={() => setEdit(false)} style={ghost}>ยกเลิก</button><button onClick={save} style={btn()}>บันทึก</button></div>
          </div>
        )}
      </div>
      {msg && <div style={{ fontSize: 12.5, color: msg.includes('แล้ว') ? '#2E7D55' : '#C24036' }}>{msg}</div>}
      {code && (
        <div style={{ background: '#EAF8EF', border: '1px solid #B7E4C7', borderRadius: 10, padding: '10px 14px', fontSize: 12.5 }}>
          <b>รหัสผูก LINE ของลูกค้า:</b> <span className="num" style={{ fontSize: 22, fontWeight: 700, letterSpacing: 3, color: '#1C2730' }}>{code.code}</span> <span style={{ color: '#5C6770' }}>(ใช้ได้ {code.expires_hours} ชม.)</span>
          <div style={{ color: '#5C6770', marginTop: 4 }}>ส่งรหัสนี้ให้ลูกค้า แล้วให้ลูกค้าเพิ่มเพื่อน LINE OA ของบริษัท → พิมพ์รหัส 6 หลักนี้ส่งมา ระบบจะผูกบัญชีและทักทายลูกค้าให้เอง หลังจากนั้นลูกค้าพิมพ์ "ความคืบหน้า" / "งวด" / "แจ้งซ่อม …" ได้เลย</div>
          <button onClick={() => setCode(null)} style={{ ...ghost, marginTop: 6, padding: '3px 9px', fontSize: 11 }}>ปิด</button>
        </div>
      )}
      {pushOpen && (
        <div style={{ ...card, padding: 10, display: 'flex', gap: 6 }}>
          <input style={{ ...field, flex: 1 }} placeholder="ข้อความถึงลูกค้า (ส่งทาง LINE และบันทึกลง timeline)" value={pushText} onChange={(e) => setPushText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pushMsg()} />
          <button onClick={pushMsg} style={btn('#06C755')}>ส่ง LINE</button>
        </div>
      )}

      {/* สิ่งที่ต้องทำต่อ */}
      {c.next_actions.length > 0 && (
        <div style={{ background: '#FFF8E8', border: '1px solid #F1DFB5', borderRadius: 10, padding: '9px 13px', fontSize: 12.5 }}>
          <b>📌 ต้องทำต่อ</b>
          {c.next_actions.map((a) => <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}><span style={{ color: a.overdue ? '#C24036' : '#1C2730' }}>{a.overdue ? '⛔ เลยกำหนด ' : ''}{a.date || ''} — {a.action} <span style={{ color: '#94A0A8' }}>({a.by})</span></span><button onClick={() => doneAction(a.id)} style={{ ...ghost, padding: '2px 8px', fontSize: 11 }}>✓ ทำแล้ว</button></div>)}
        </div>
      )}

      {/* บ้าน */}
      {c.houses.length === 0 && section('🏠 บ้าน', <div style={{ color: '#94A0A8', fontSize: 12.5 }}>ยังไม่มีบ้านผูกกับลูกค้านี้ — กด “แก้ไข” แล้วติ๊กผูกบ้าน หรือสร้างบ้านใหม่ในหน้า “บ้าน” โดยใส่ชื่อลูกค้าให้ตรง</div>)}
      {c.houses.map((h) => {
        const pct = h.qc.total ? Math.round((h.qc.done / h.qc.total) * 100) : h.pct || 0
        return section(`🏠 ${h.code} ${h.name}`, (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12, fontSize: 12.5 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ความคืบหน้า (QC ผ่าน {h.qc.done}/{h.qc.total} เฟส)</span><b className="num">{pct}%</b></div>
              <div style={{ height: 8, background: '#EEF1F4', borderRadius: 20, overflow: 'hidden', margin: '5px 0' }}><div style={{ width: pct + '%', height: '100%', background: '#2E7D55' }} /></div>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>{h.qc.phases.map((p) => <span key={p.id} title={p.name} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: p.passed ? '#E2F1EA' : p.fixing ? '#FBEEEC' : p.started ? '#FBF1DF' : '#F1F4F6', color: p.passed ? '#2E7D55' : p.fixing ? '#C24036' : p.started ? '#C0852C' : '#94A0A8' }}>{p.id}</span>)}</div>
              {h.qc.current && <div style={{ fontSize: 11.5, color: '#5C6770', marginTop: 3 }}>ขั้นตอนปัจจุบัน: {h.qc.current.name}</div>}
              <div style={{ fontSize: 11.5, color: '#5C6770' }}>สถานะ {h.status}{h.deliver_date ? ` · กำหนดส่งมอบ ${h.deliver_date}` : ''} · เอกสาร/ไฟล์ {h.files}</div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>งวดเงินลูกค้า</span><b className="num">{baht(h.inst_paid)} / {baht(h.inst_total || h.value)}</b></div>
              <div style={{ height: 8, background: '#EEF1F4', borderRadius: 20, overflow: 'hidden', margin: '5px 0' }}><div style={{ width: ((h.inst_total ? h.inst_paid / h.inst_total : 0) * 100) + '%', height: '100%', background: '#30506A' }} /></div>
              {h.next_due ? <div style={{ fontSize: 11.5, color: '#C0852C' }}>งวดถัดไป: งวด {h.next_due.no} {h.next_due.detail} {baht(h.next_due.amount - (h.next_due.paid || 0))} {h.next_due.due ? '· ครบ ' + h.next_due.due : ''}</div> : <div style={{ fontSize: 11.5, color: '#2E7D55' }}>เก็บครบทุกงวดแล้ว</div>}
              <div style={{ fontSize: 11.5, color: h.open_issues ? '#C24036' : '#5C6770', marginTop: 3 }}>ปัญหา/เคสค้าง {h.open_issues} · ทั้งหมด {h.issues.length}</div>
            </div>
            {h.photos.length > 0 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', gridColumn: '1 / -1' }}>{h.photos.map((p, i) => <img key={i} src={p} alt="" style={{ height: 56, borderRadius: 6, border: '1px solid #E1E5EA' }} />)}</div>}
            {h.warranty && h.warranty.delivered && (
              <div style={{ gridColumn: '1 / -1', fontSize: 11.5 }}>
                <b>🛡 ประกันงาน</b> (นับจากส่งมอบ {h.warranty.start}) · {h.warranty.items.map((w) => <span key={w.name} style={{ marginRight: 10, color: w.active ? (w.days_left != null && w.days_left <= 30 ? '#C0852C' : '#2E7D55') : '#94A0A8' }}>{w.active ? '🟢' : '⚪'} {w.name} {w.years} ปี{w.active ? ` เหลือ ${w.days_left} วัน` : ' หมดแล้ว'}</span>)}
              </div>
            )}
            {h.issues.length > 0 && (
              <div style={{ gridColumn: '1 / -1', fontSize: 12 }}>
                <b>🛠 เคส/ปัญหา</b>
                {h.issues.slice(0, 6).map((i) => <div key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}><span style={{ color: i.sla_overdue ? '#C24036' : i.open ? '#C0852C' : '#2E7D55' }}>{i.open ? (i.sla_overdue ? '⛔' : '🟡') : '✅'}</span><span><b className="num">{i.case_no || '#' + i.id}</b> {i.title} <span style={{ color: '#94A0A8' }}>· {i.status}{i.assignee ? ' · ' + i.assignee : ''} · {i.date}</span></span>{i.open && <><button onClick={() => closeCase(i, 'กำลังแก้ไข')} style={{ ...ghost, padding: '1px 7px', fontSize: 10.5 }}>กำลังแก้</button><button onClick={() => closeCase(i, 'แก้ไขแล้ว')} style={{ ...ghost, padding: '1px 7px', fontSize: 10.5, color: '#2E7D55' }}>✓ ปิดเคส</button></>}</div>)}
              </div>
            )}
          </div>
        ))
      })}

      {/* Timeline การติดต่อ */}
      {section('🗒 บันทึกการติดต่อ / Timeline', (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 6, marginBottom: 6 }}>
            <select style={field} value={cf.channel} onChange={(e) => setCf({ ...cf, channel: e.target.value })}>{CHANNELS.map((x) => <option key={x}>{x}</option>)}</select>
            <input style={field} placeholder="คุยอะไร / ลูกค้าว่าอย่างไร…" value={cf.note} onChange={(e) => setCf({ ...cf, note: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addContact()} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 150px auto', gap: 6 }}>
            <input style={field} placeholder="ต้องทำต่อ (เช่น โทรนัดดูแบบ)" value={cf.next_action} onChange={(e) => setCf({ ...cf, next_action: e.target.value })} />
            <input type="date" style={field} value={cf.next_date} onChange={(e) => setCf({ ...cf, next_date: e.target.value })} />
            <select style={field} value={cf.house_code} onChange={(e) => setCf({ ...cf, house_code: e.target.value })}><option value="">— บ้าน —</option>{c.houses.map((h) => <option key={h.code} value={h.code}>{h.code}</option>)}</select>
            <button onClick={addContact} style={btn()}>+ บันทึก</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, maxHeight: 360, overflowY: 'auto' }}>
            {c.contacts.length === 0 && <div style={{ fontSize: 12, color: '#94A0A8' }}>ยังไม่มีบันทึก</div>}
            {c.contacts.map((x) => (
              <div key={x.id} style={{ borderLeft: '2px solid ' + (x.channel === 'LINE' ? '#06C755' : '#30506A'), paddingLeft: 10 }}>
                <div style={{ fontSize: 12.5 }}>{x.note}{x.next_action ? <span style={{ color: x.done ? '#94A0A8' : '#C0852C' }}> → {x.next_action}{x.next_date ? ' (' + x.next_date + ')' : ''}{x.done ? ' ✓' : ''}</span> : null}</div>
                <div style={{ fontSize: 11, color: '#94A0A8' }}>{x.channel} · {x.date} · {x.by}{x.house_code ? ' · ' + x.house_code : ''}{x.lead_id ? ' · ช่วง Lead' : ''}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* เอกสาร */}
      {section('📄 เอกสารขาย', c.docs.length === 0 ? <div style={{ fontSize: 12, color: '#94A0A8' }}>ยังไม่มีเอกสารขายในชื่อนี้</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}><tbody>{c.docs.map((d) => <tr key={d.id} style={{ borderTop: '1px solid #F1F4F6' }}><td style={{ padding: '5px 4px' }}>{d.type} <b className="num">{d.no}</b></td><td style={{ padding: '5px 4px', color: '#5C6770' }}>{d.date}</td><td className="num" style={{ padding: '5px 4px', textAlign: 'right' }}>{baht(d.total)}</td><td style={{ padding: '5px 4px', color: '#5C6770' }}>{d.status}</td></tr>)}</tbody></table>
      ))}
      {c.referrals.length > 0 && section('🤝 ลูกค้าที่แนะนำมา', <div style={{ fontSize: 12.5 }}>{c.referrals.map((r) => <div key={r.id}>{r.no} {r.name} · {r.stage} · {r.created}</div>)}</div>)}
    </div>
  )
}

// ---------- Lead / Pipeline (Kanban) ----------
function LeadsTab() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [meta, setMeta] = useState<{ stages: string[]; sources: string[]; stale_days: number }>({ stages: [], sources: [], stale_days: 3 })
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ name: '', phone: '', line: '', source: 'Facebook', value: '', house_type: '', note: '', next_date: '', referral_code: '' })
  const [sel, setSel] = useState<Lead | null>(null)
  const [err, setErr] = useState('')
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const load = () => { api.get<Lead[]>('/crm/leads').then(setLeads).catch(() => setLeads([])); api.get<typeof meta>('/crm/leads/meta').then(setMeta).catch(() => {}) }
  useEffect(() => { load() }, [])
  useLiveRefresh(['crm', 'customers'], load)
  const add = async () => {
    if (!f.name.trim()) { setErr('กรอกชื่อ'); return }
    try { await api.post('/crm/leads', { ...f, value: Number(String(f.value).replace(/,/g, '')) || 0 }); setAdding(false); setF({ name: '', phone: '', line: '', source: 'Facebook', value: '', house_type: '', note: '', next_date: '', referral_code: '' }); setErr(''); load() } catch (e) { setErr((e as Error).message) }
  }
  const move = async (l: Lead, stage: string) => { try { await api.put('/crm/leads/' + l.id, { stage }); load() } catch (e) { setErr((e as Error).message) } }
  const stale = leads.filter((l) => l.stale)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#5C6770' }}>Lead ทั้งหมด <b className="num" style={{ color: '#1C2730' }}>{leads.length}</b>{stale.length ? <span style={{ color: '#C24036', marginLeft: 8 }}>⚠ เงียบเกิน {meta.stale_days} วัน {stale.length} ราย</span> : null}</span>
        <button onClick={() => setView(view === 'kanban' ? 'list' : 'kanban')} style={ghost}>{view === 'kanban' ? '☰ ตาราง' : '▦ Kanban'}</button>
        <button onClick={() => setAdding((v) => !v)} style={{ ...btn(), marginLeft: 'auto' }}>+ เพิ่ม Lead</button>
      </div>
      {adding && (
        <div style={{ ...card, padding: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            <input style={field} placeholder="ชื่อ *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <input style={field} placeholder="เบอร์โทร" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            <input style={field} placeholder="LINE ID" value={f.line} onChange={(e) => setF({ ...f, line: e.target.value })} />
            <select style={field} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>{meta.sources.map((s) => <option key={s}>{s}</option>)}</select>
            <input style={field} placeholder="แบบบ้าน/ที่สนใจ" value={f.house_type} onChange={(e) => setF({ ...f, house_type: e.target.value })} />
            <input style={field} placeholder="มูลค่าโดยประมาณ (บาท)" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
            <input type="date" style={field} title="นัดติดตามครั้งถัดไป" value={f.next_date} onChange={(e) => setF({ ...f, next_date: e.target.value })} />
            <input style={field} placeholder="รหัสบอกต่อ REF-… (ถ้ามี)" value={f.referral_code} onChange={(e) => setF({ ...f, referral_code: e.target.value })} />
            <input style={{ ...field, gridColumn: '1 / -1' }} placeholder="โน้ต (ลูกค้าต้องการอะไร งบเท่าไร ที่ดินอยู่ไหน)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </div>
          {err && <div style={{ fontSize: 12, color: '#C24036', marginTop: 8 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}><button onClick={() => setAdding(false)} style={ghost}>ยกเลิก</button><button onClick={add} style={btn()}>บันทึก</button></div>
        </div>
      )}
      {view === 'kanban' ? (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${meta.stages.length || 6}, minmax(170px, 1fr))`, gap: 8, overflowX: 'auto' }}>
          {meta.stages.map((st) => {
            const col = leads.filter((l) => l.stage === st)
            return (
              <div key={st} style={{ background: '#F3F5F7', borderRadius: 10, padding: 8, minHeight: 120 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: STAGE_COLOR[st] || '#1C2730', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}><span>{st}</span><span className="num" style={{ color: '#94A0A8', fontWeight: 500 }}>{col.length}{col.length ? ' · ' + baht(col.reduce((s, l) => s + (l.value || 0), 0)) : ''}</span></div>
                {col.map((l) => (
                  <div key={l.id} onClick={() => setSel(l)} className="hov-fafbfc" style={{ background: '#fff', border: '1px solid ' + (l.stale ? '#E8C9C5' : '#E1E5EA'), borderRadius: 8, padding: '7px 9px', marginBottom: 6, cursor: 'pointer', fontSize: 12 }}>
                    <div style={{ fontWeight: 600 }}>{l.name}{l.stale ? <span title={`เงียบ ${l.idle_days} วัน`} style={{ color: '#C24036', marginLeft: 4 }}>⚠</span> : null}</div>
                    <div style={{ color: '#5C6770', fontSize: 11 }}>{l.source}{l.value ? ' · ' + baht(l.value) : ''}{l.house_type ? ' · ' + l.house_type : ''}</div>
                    <div style={{ color: '#94A0A8', fontSize: 10.5 }}>{l.owner}{l.next_date ? ' · นัด ' + l.next_date : ''} · เงียบ {l.idle_days} วัน</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
                      {meta.stages.indexOf(st) > 0 && st !== 'ยกเลิก' && <button onClick={() => move(l, meta.stages[meta.stages.indexOf(st) - 1])} title="ถอยขั้น" style={{ ...ghost, padding: '1px 6px', fontSize: 10 }}>◀</button>}
                      {meta.stages.indexOf(st) < meta.stages.length - 2 && <button onClick={() => move(l, meta.stages[meta.stages.indexOf(st) + 1])} title="เลื่อนขั้นถัดไป" style={{ ...ghost, padding: '1px 6px', fontSize: 10 }}>▶</button>}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      ) : (
        <div style={card}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ background: '#F7F9FB' }}><th style={{ ...th, paddingLeft: 16 }}>Lead</th><th style={th}>ช่องทาง</th><th style={th}>ขั้น</th><th style={{ ...th, textAlign: 'right' }}>มูลค่า</th><th style={th}>ผู้ดูแล</th><th style={th}>ติดต่อล่าสุด</th></tr></thead>
            <tbody>{leads.map((l) => <tr key={l.id} onClick={() => setSel(l)} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6', cursor: 'pointer' }}><td style={{ ...td, paddingLeft: 16, fontWeight: 600 }}>{l.name}<div style={{ fontSize: 10.5, color: '#94A0A8', fontWeight: 400 }}>{l.no} · {l.phone}</div></td><td style={td}>{l.source}</td><td style={{ ...td, color: STAGE_COLOR[l.stage] }}>{l.stage}</td><td className="num" style={{ ...td, textAlign: 'right' }}>{l.value ? baht(l.value) : '-'}</td><td style={td}>{l.owner}</td><td style={{ ...td, color: l.stale ? '#C24036' : '#5C6770' }}>{l.contacted_at || '-'} ({l.idle_days} วัน)</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {sel && <LeadDrawer lead={sel} meta={meta} onClose={() => setSel(null)} onChanged={() => { load(); api.get<Lead[]>('/crm/leads').then((ls) => setSel(ls.find((x) => x.id === sel.id) || null)) }} />}
    </div>
  )
}

function LeadDrawer({ lead, meta, onClose, onChanged }: { lead: Lead; meta: { stages: string[]; sources: string[] }; onClose: () => void; onChanged: () => void }) {
  const [notes, setNotes] = useState<Contact[]>([])
  const [nf, setNf] = useState({ channel: 'โทรศัพท์', note: '', next_action: '', next_date: '' })
  const [ef, setEf] = useState<Partial<Lead>>(lead)
  const [conv, setConv] = useState<{ code: string; name: string; value: string } | null>(null)
  const [msg, setMsg] = useState('')
  const loadNotes = () => api.get<Contact[]>('/crm/leads/' + lead.id + '/notes').then(setNotes).catch(() => setNotes([]))
  useEffect(() => { loadNotes(); setEf(lead) /* eslint-disable-next-line */ }, [lead.id])
  const save = async () => { try { await api.put('/crm/leads/' + lead.id, ef); setMsg('บันทึกแล้ว'); onChanged() } catch (e) { setMsg((e as Error).message) } }
  const addNote = async () => { if (!nf.note.trim()) return; try { await api.post('/crm/leads/' + lead.id + '/notes', nf); setNf({ channel: 'โทรศัพท์', note: '', next_action: '', next_date: '' }); loadNotes(); onChanged() } catch (e) { setMsg((e as Error).message) } }
  const convert = async () => {
    try { await api.post('/crm/leads/' + lead.id + '/convert', conv && conv.code ? { house: { code: conv.code, name: conv.name || conv.code, value: Number(String(conv.value).replace(/,/g, '')) || 0 } } : {}); setMsg('แปลงเป็นลูกค้าแล้ว — ดูได้ในแท็บ ลูกค้า'); setConv(null); onChanged() } catch (e) { setMsg((e as Error).message) }
  }
  const del = async () => { if (!confirm('ลบ Lead นี้?')) return; try { await api.del('/crm/leads/' + lead.id); onClose(); onChanged() } catch (e) { setMsg((e as Error).message) } }
  return (
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '95vw', background: '#fff', borderLeft: '1px solid #E1E5EA', boxShadow: '-10px 0 30px rgba(20,30,40,.12)', zIndex: 60, overflowY: 'auto', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ fontSize: 15, fontWeight: 700 }}>{lead.name}</div><span style={{ fontSize: 11, color: '#94A0A8' }}>{lead.no}</span><button onClick={onClose} style={{ ...ghost, marginLeft: 'auto' }}>✕</button></div>
      {msg && <div style={{ fontSize: 12, color: msg.includes('แล้ว') ? '#2E7D55' : '#C24036', marginTop: 6 }}>{msg}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        {([['phone', 'เบอร์โทร'], ['line', 'LINE ID'], ['email', 'อีเมล'], ['house_type', 'แบบบ้าน/ที่สนใจ'], ['area', 'ทำเล/ที่ดิน'], ['owner', 'ผู้ดูแล']] as [keyof Lead, string][]).map(([k, l]) => <label key={k} style={{ fontSize: 11, color: '#5C6770' }}>{l}<input style={{ ...field, width: '100%', marginTop: 2 }} value={String(ef[k] ?? '')} onChange={(e) => setEf({ ...ef, [k]: e.target.value })} /></label>)}
        <label style={{ fontSize: 11, color: '#5C6770' }}>มูลค่า (บาท)<input style={{ ...field, width: '100%', marginTop: 2 }} value={String(ef.value ?? '')} onChange={(e) => setEf({ ...ef, value: Number(e.target.value) || 0 })} /></label>
        <label style={{ fontSize: 11, color: '#5C6770' }}>ช่องทาง<select style={{ ...field, width: '100%', marginTop: 2 }} value={ef.source || ''} onChange={(e) => setEf({ ...ef, source: e.target.value })}>{meta.sources.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label style={{ fontSize: 11, color: '#5C6770' }}>ขั้น<select style={{ ...field, width: '100%', marginTop: 2 }} value={ef.stage || ''} onChange={(e) => setEf({ ...ef, stage: e.target.value })}>{meta.stages.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label style={{ fontSize: 11, color: '#5C6770' }}>นัดติดตาม<input type="date" style={{ ...field, width: '100%', marginTop: 2 }} value={ef.next_date || ''} onChange={(e) => setEf({ ...ef, next_date: e.target.value })} /></label>
        {ef.stage === 'ยกเลิก' && <label style={{ fontSize: 11, color: '#5C6770', gridColumn: '1 / -1' }}>เหตุผลที่ยกเลิก<input style={{ ...field, width: '100%', marginTop: 2 }} value={ef.lost_reason || ''} onChange={(e) => setEf({ ...ef, lost_reason: e.target.value })} /></label>}
        <label style={{ fontSize: 11, color: '#5C6770', gridColumn: '1 / -1' }}>โน้ต<textarea style={{ ...field, width: '100%', marginTop: 2, minHeight: 46 }} value={ef.note || ''} onChange={(e) => setEf({ ...ef, note: e.target.value })} /></label>
      </div>
      {lead.referred_by && <div style={{ fontSize: 12, color: '#6B4E9E', marginTop: 6 }}>🤝 แนะนำโดย {lead.referred_by} ({lead.referral_code})</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <button onClick={save} style={btn()}>บันทึก</button>
        {lead.stage !== 'เซ็นสัญญา' && <button onClick={() => setConv(conv ? null : { code: '', name: '', value: String(lead.value || '') })} style={btn('#2E7D55')}>✓ ปิดการขาย → ลูกค้า</button>}
        {lead.customer_id && <span style={{ fontSize: 12, color: '#2E7D55', alignSelf: 'center' }}>เป็นลูกค้าแล้ว</span>}
        <button onClick={del} style={{ ...ghost, color: '#C24036', marginLeft: 'auto' }}>ลบ</button>
      </div>
      {conv && (
        <div style={{ background: '#F3F8F5', border: '1px solid #CDE3D6', borderRadius: 8, padding: 10, marginTop: 8, fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>สร้างบ้านให้เลยไหม? (เว้นว่าง = สร้างเฉพาะลูกค้า)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <input style={field} placeholder="รหัสบ้าน เช่น RK-012" value={conv.code} onChange={(e) => setConv({ ...conv, code: e.target.value })} />
            <input style={field} placeholder="ชื่อบ้าน" value={conv.name} onChange={(e) => setConv({ ...conv, name: e.target.value })} />
            <input style={field} placeholder="มูลค่าสัญญา" value={conv.value} onChange={(e) => setConv({ ...conv, value: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 8 }}><button onClick={() => setConv(null)} style={ghost}>ยกเลิก</button><button onClick={convert} style={btn('#2E7D55')}>ยืนยันปิดการขาย</button></div>
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 14, marginBottom: 6 }}>ประวัติติดตาม</div>
      <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 6 }}>
        <select style={field} value={nf.channel} onChange={(e) => setNf({ ...nf, channel: e.target.value })}>{CHANNELS.map((x) => <option key={x}>{x}</option>)}</select>
        <input style={field} placeholder="คุยอะไร…" value={nf.note} onChange={(e) => setNf({ ...nf, note: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addNote()} />
        <input style={field} placeholder="ต้องทำต่อ" value={nf.next_action} onChange={(e) => setNf({ ...nf, next_action: e.target.value })} />
        <div style={{ display: 'flex', gap: 6 }}><input type="date" style={{ ...field, flex: 1 }} value={nf.next_date} onChange={(e) => setNf({ ...nf, next_date: e.target.value })} /><button onClick={addNote} style={btn()}>+</button></div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        {notes.length === 0 && <div style={{ fontSize: 12, color: '#94A0A8' }}>ยังไม่มีบันทึก — สร้างเมื่อ {lead.created}</div>}
        {notes.map((x) => <div key={x.id} style={{ borderLeft: '2px solid #30506A', paddingLeft: 10 }}><div style={{ fontSize: 12.5 }}>{x.note}{x.next_action ? <span style={{ color: '#C0852C' }}> → {x.next_action}{x.next_date ? ' (' + x.next_date + ')' : ''}</span> : null}</div><div style={{ fontSize: 11, color: '#94A0A8' }}>{x.channel} · {x.date} · {x.by}</div></div>)}
      </div>
    </div>
  )
}

// ---------- เคสบริการ / แจ้งซ่อม ----------
function CasesTab() {
  const { data } = useApp()
  const [rows, setRows] = useState<CaseRow[]>([])
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const [sel, setSel] = useState<CaseRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ house_code: '', title: '', note: '', priority: 'ทั่วไป', category: 'แจ้งซ่อม' })
  const [msg, setMsg] = useState('')
  const load = () => api.get<CaseRow[]>('/crm/cases').then(setRows).catch(() => setRows([]))
  useEffect(() => { load() }, [])
  useLiveRefresh(['issues', 'crm'], load)
  const list = rows.filter((r) => filter === 'all' || r.open)
  const act = async (r: CaseRow, b: Record<string, string>) => { try { const u = await api.put<CaseRow>('/crm/cases/' + r.id, b); setSel(u); load(); setMsg('') } catch (e) { setMsg((e as Error).message) } }
  const add = async () => { if (!f.title.trim()) { setMsg('กรอกเรื่องที่แจ้ง'); return } try { await api.post('/crm/cases', f); setAdding(false); setF({ house_code: '', title: '', note: '', priority: 'ทั่วไป', category: 'แจ้งซ่อม' }); load() } catch (e) { setMsg((e as Error).message) } }
  const st = (r: CaseRow) => r.open ? (r.sla_overdue ? { c: '#C24036', bg: '#FBEEEC', t: '⛔ เกิน SLA' } : r.status === 'รอช่าง' ? { c: '#C0852C', bg: '#FBF1DF', t: '🟡 รอรับเรื่อง' } : { c: '#30506A', bg: '#E2E9EF', t: '🔧 ' + r.status }) : { c: '#2E7D55', bg: '#E2F1EA', t: '✅ ' + r.status }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: sel ? '1fr 380px' : '1fr', gap: 12, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#5C6770' }}>เคสค้าง <b className="num" style={{ color: rows.some((r) => r.sla_overdue) ? '#C24036' : '#1C2730' }}>{rows.filter((r) => r.open).length}</b> · เกิน SLA <b className="num" style={{ color: '#C24036' }}>{rows.filter((r) => r.sla_overdue).length}</b></span>
          <button onClick={() => setFilter(filter === 'open' ? 'all' : 'open')} style={ghost}>{filter === 'open' ? 'ดูทั้งหมด' : 'เฉพาะค้าง'}</button>
          <span style={{ fontSize: 11.5, color: '#94A0A8' }}>ลูกค้าแจ้งเองทาง LINE: "แจ้งซ่อม ห้องน้ำรั่ว" (+รูป) → เคสขึ้นที่นี่ + แจ้งโฟร์แมน/ผู้บริหารทันที</span>
          <button onClick={() => setAdding((v) => !v)} style={{ ...btn(), marginLeft: 'auto' }}>+ เปิดเคสให้ลูกค้า</button>
        </div>
        {msg && <div style={{ fontSize: 12.5, color: '#C24036' }}>{msg}</div>}
        {adding && (
          <div style={{ ...card, padding: 12, display: 'grid', gridTemplateColumns: '160px 1fr 110px 130px auto', gap: 8 }}>
            <select style={field} value={f.house_code} onChange={(e) => setF({ ...f, house_code: e.target.value })}><option value="">— บ้าน —</option>{(data.houses || []).filter((h) => h.kind !== 'office').map((h) => <option key={h.code} value={h.code}>{h.code} {h.name}</option>)}</select>
            <input style={field} placeholder="เรื่องที่แจ้ง *" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <select style={field} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{['ทั่วไป', 'ด่วน', 'ด่วนมาก'].map((x) => <option key={x}>{x}</option>)}</select>
            <select style={field} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{['แจ้งซ่อม', 'สอบถาม', 'ร้องเรียน', 'ตรวจบ้านหลังส่งมอบ', 'อื่นๆ'].map((x) => <option key={x}>{x}</option>)}</select>
            <button onClick={add} style={btn()}>เปิดเคส</button>
            <input style={{ ...field, gridColumn: '1 / -1' }} placeholder="รายละเอียด" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </div>
        )}
        <div style={card}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ background: '#F7F9FB' }}><th style={{ ...th, paddingLeft: 16 }}>เคส</th><th style={th}>บ้าน / ลูกค้า</th><th style={th}>เรื่อง</th><th style={th}>ผู้รับผิดชอบ</th><th style={th}>SLA</th><th style={th}>สถานะ</th></tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#94A0A8' }}>ไม่มีเคส</td></tr>}
              {list.map((r) => { const x = st(r); return (
                <tr key={r.id} onClick={() => setSel(r)} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6', cursor: 'pointer', background: sel?.id === r.id ? '#EEF3F7' : undefined }}>
                  <td style={{ ...td, paddingLeft: 16 }}><b className="num">{r.case_no || '#' + r.id}</b><div style={{ fontSize: 10.5, color: '#94A0A8' }}>{r.date}{r.source === 'line' ? ' · LINE' : r.source === 'auto' ? ' · อัตโนมัติ' : ''} · {r.category}</div></td>
                  <td style={td}>{r.house || r.house_code || '-'}<div style={{ fontSize: 11, color: '#5C6770' }}>{r.customer || r.by}{r.customer_line ? ' ●' : ''}</div></td>
                  <td style={td}>{r.title}{r.photo ? ' 📷' : ''}</td>
                  <td style={td}>{r.assignee || <span style={{ color: '#C24036' }}>ยังไม่มี</span>}</td>
                  <td className="num" style={{ ...td, color: r.sla_overdue ? '#C24036' : '#5C6770', fontSize: 11.5 }}>{r.open ? String(r.sla_due || '').slice(0, 16) : (r.hours_open != null ? `แก้ใน ${r.hours_open} ชม.` : '-')}</td>
                  <td style={td}><span style={{ fontSize: 11, fontWeight: 600, color: x.c, background: x.bg, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>{x.t}</span></td>
                </tr>) })}
            </tbody>
          </table>
        </div>
      </div>
      {sel && (
        <div style={{ ...card, padding: 14, position: 'sticky', top: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><b className="num">{sel.case_no || '#' + sel.id}</b><span style={{ fontSize: 11, color: '#94A0A8' }}>{sel.category} · {sel.priority}</span><button onClick={() => setSel(null)} style={{ ...ghost, marginLeft: 'auto', padding: '2px 8px' }}>✕</button></div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>{sel.title}</div>
          <div style={{ fontSize: 12, color: '#5C6770' }}>{sel.house || sel.house_code} · {sel.customer || sel.by} · เปิด {sel.created_at || sel.date}{sel.hours_open != null ? ` (${sel.hours_open} ชม.)` : ''}</div>
          {sel.note && <div style={{ fontSize: 12.5, marginTop: 6, whiteSpace: 'pre-wrap' }}>{sel.note}</div>}
          {sel.photo && <a href={sel.photo} target="_blank" rel="noreferrer"><img src={sel.photo} alt="" style={{ maxWidth: '100%', borderRadius: 8, marginTop: 8, border: '1px solid #E1E5EA' }} /></a>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10 }}>
            <label style={{ fontSize: 11, color: '#5C6770' }}>ผู้รับผิดชอบ<select style={{ ...field, width: '100%', marginTop: 2 }} value={sel.assignee || ''} onChange={(e) => act(sel, { assignee: e.target.value })}><option value="">— เลือก —</option>{Array.from(new Set([...(data.employees || []).map((e) => e.name), sel.house_manager].filter(Boolean))).map((n) => <option key={n}>{n}</option>)}</select></label>
            <label style={{ fontSize: 11, color: '#5C6770' }}>สถานะ<select style={{ ...field, width: '100%', marginTop: 2 }} value={sel.status} onChange={(e) => { const s2 = e.target.value; const n = s2 === 'แก้ไขแล้ว' ? window.prompt('สรุปการแก้ไขที่จะแจ้งลูกค้า (เว้นว่างได้)') : ''; if (n === null) return; act(sel, { status: s2, note_add: n || '' }) }}>{['รอช่าง', 'กำลังแก้ไข', 'รออะไหล่', 'นัดลูกค้า', 'แก้ไขแล้ว', 'ยกเลิก'].map((x) => <option key={x}>{x}</option>)}</select></label>
          </div>
          <CaseNote onAdd={(t) => act(sel, { note_add: t })} />
          <div style={{ fontSize: 12, fontWeight: 600, marginTop: 10 }}>ประวัติ</div>
          {sel.log.map((l, i) => <div key={i} style={{ fontSize: 11.5, borderLeft: '2px solid #D2DAE1', paddingLeft: 8, marginTop: 4 }}>{l.text}<div style={{ color: '#94A0A8', fontSize: 10.5 }}>{l.at} · {l.by}</div></div>)}
          {sel.customer_line && <div style={{ fontSize: 11, color: '#06C755', marginTop: 8 }}>● ลูกค้าผูก LINE — ทุกการเปลี่ยนสถานะจะแจ้งลูกค้าอัตโนมัติ ปิดเคสแล้วระบบขอคะแนนให้</div>}
        </div>
      )}
    </div>
  )
}
function CaseNote({ onAdd }: { onAdd: (t: string) => void }) {
  const [t, setT] = useState('')
  return <div style={{ display: 'flex', gap: 6, marginTop: 8 }}><input style={{ ...field, flex: 1 }} placeholder="บันทึกความคืบหน้า (แจ้งลูกค้าด้วยถ้าผูก LINE)" value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && t.trim()) { onAdd(t.trim()); setT('') } }} /><button onClick={() => { if (t.trim()) { onAdd(t.trim()); setT('') } }} style={btn()}>+</button></div>
}

// ---------- NPS / บอกต่อ ----------
function NpsTab() {
  const [d, setD] = useState<{ rows: NpsRow[]; summary: { asked: number; answered: number; avg: number | null; nps: number | null; promoters: number; detractors: number } } | null>(null)
  const [m, setM] = useState<Metrics | null>(null)
  const load = () => { api.get<typeof d>('/crm/nps').then(setD).catch(() => setD(null)); api.get<Metrics>('/crm/metrics').then(setM).catch(() => {}) }
  useEffect(() => { load() }, [])
  useLiveRefresh(['crm'], load)
  if (!d) return <div style={{ color: '#94A0A8', padding: 20 }}>กำลังโหลด…</div>
  const s = d.summary
  const tile = (label: string, value: string, sub?: string, color = '#1C2730') => <div style={{ ...card, padding: 14 }}><div style={{ fontSize: 11.5, color: '#5C6770' }}>{label}</div><div className="num" style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>{sub && <div style={{ fontSize: 11, color: '#94A0A8' }}>{sub}</div>}</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
        {tile('คะแนน NPS', s.nps == null ? '-' : String(s.nps), 'ผู้แนะนำ − ผู้ไม่พอใจ (%)', s.nps != null && s.nps < 0 ? '#C24036' : '#2E7D55')}
        {tile('เฉลี่ย', s.avg == null ? '-' : s.avg + '/10', `ตอบแล้ว ${s.answered}/${s.asked}`)}
        {tile('ประทับใจ (9-10)', String(s.promoters), '', '#2E7D55')}
        {tile('ไม่พอใจ (0-6)', String(s.detractors), 'ผู้บริหารได้รับแจ้งทาง LINE ทันที', s.detractors ? '#C24036' : '#1C2730')}
        {tile('Lead จากการบอกต่อ', String(m?.referrals ?? 0), 'ลูกค้าพิมพ์ "บอกต่อ" ในไลน์รับรหัส REF-', '#6B4E9E')}
      </div>
      <div style={{ fontSize: 11.5, color: '#94A0A8' }}>ระบบถามคะแนนอัตโนมัติทาง LINE: หลังผ่าน QC เฟสที่ตั้งไว้ · หลังส่งมอบบ้าน · หลังปิดเคสแจ้งซ่อม — ลูกค้าตอบเป็นตัวเลข 0-10 แล้วพิมพ์ความเห็นเพิ่มได้</div>
      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ background: '#F7F9FB' }}><th style={{ ...th, paddingLeft: 16 }}>ลูกค้า</th><th style={th}>บ้าน</th><th style={th}>หัวข้อ</th><th style={{ ...th, textAlign: 'center' }}>คะแนน</th><th style={th}>ความเห็น</th><th style={th}>ตอบเมื่อ</th></tr></thead>
          <tbody>
            {d.rows.length === 0 && <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีการถามคะแนน</td></tr>}
            {d.rows.map((r) => <tr key={r.id} style={{ borderTop: '1px solid #F1F4F6' }}><td style={{ ...td, paddingLeft: 16 }}>{r.customer}</td><td style={td}>{r.house_code || '-'}</td><td style={{ ...td, color: '#5C6770' }}>{r.trigger_key}</td><td className="num" style={{ ...td, textAlign: 'center', fontWeight: 700, color: r.score == null ? '#94A0A8' : r.score >= 9 ? '#2E7D55' : r.score <= 6 ? '#C24036' : '#C0852C' }}>{r.score ?? 'รอตอบ'}</td><td style={{ ...td, color: '#5C6770' }}>{r.comment || '-'}</td><td style={{ ...td, color: '#94A0A8', fontSize: 11 }}>{r.answered_at || 'ถาม ' + r.asked_at}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------- LINE ลูกค้า & อัตโนมัติ ----------
function AutoTab() {
  const [s, setS] = useState<CrmSettings | null>(null)
  const [msg, setMsg] = useState('')
  const [wr, setWr] = useState<{ code: string; name: string; customer: string; status: string; deliver_date: string; delivered: boolean; items: Warranty['items'] }[]>([])
  const load = () => { api.get<CrmSettings>('/crm/settings').then(setS).catch(() => setS(null)); api.get<typeof wr>('/crm/warranty').then(setWr).catch(() => setWr([])) }
  useEffect(() => { load() }, [])
  if (!s) return <div style={{ color: '#94A0A8', padding: 20 }}>กำลังโหลด…</div>
  const save = async () => { try { const r = await api.put<CrmSettings>('/crm/settings', s); setS(r); setMsg('บันทึกแล้ว') } catch (e) { setMsg((e as Error).message) } }
  const run = async () => { try { const r = await api.post<Record<string, number>>('/crm/run-automations', { force: true }); setMsg('รันแล้ว: ' + Object.entries(r).map(([k, v]) => `${k} ${v}`).join(' · ')) } catch (e) { setMsg((e as Error).message) } }
  const toggle = (k: string, label: string, sub: string) => <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderTop: '1px solid #F1F4F6', fontSize: 12.5, cursor: 'pointer' }}><input type="checkbox" checked={s[k] === '1'} onChange={(e) => setS({ ...s, [k]: e.target.checked ? '1' : '0' })} style={{ marginTop: 3 }} /><span><b>{label}</b><div style={{ color: '#5C6770', fontSize: 11.5 }}>{sub}</div></span></label>
  const warranty = (() => { try { return JSON.parse(s.crm_warranty || '[]') as { name: string; years: number }[] } catch { return [] } })()
  const setWarranty = (w: { name: string; years: number }[]) => setS({ ...s, crm_warranty: JSON.stringify(w) })
  const DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์']
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 12, alignItems: 'start' }}>
      <div style={{ ...card, padding: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>💬 ข้อความถึงลูกค้าอัตโนมัติ (ทาง LINE)</div>
        <div style={{ fontSize: 11.5, color: '#94A0A8', marginBottom: 6 }}>ส่งเฉพาะลูกค้าที่ผูก LINE แล้ว (ปุ่ม “ผูก LINE ลูกค้า” ในหน้าลูกค้า) · เวลาส่ง <input style={{ ...field, width: 56, padding: '3px 6px' }} value={s.crm_hour} onChange={(e) => setS({ ...s, crm_hour: e.target.value })} /> น.</div>
        {toggle('crm_auto_weekly', 'ความคืบหน้าประจำสัปดาห์', 'ทุกวัน' + (DOW[Number(s.crm_weekly_dow)] || 'จันทร์') + ' — % ความคืบหน้า ขั้นตอนที่ผ่าน QC งวดถัดไป + รูปล่าสุด')}
        <div style={{ fontSize: 11.5, color: '#5C6770', paddingLeft: 26 }}>วัน: <select style={{ ...field, padding: '3px 6px' }} value={s.crm_weekly_dow} onChange={(e) => setS({ ...s, crm_weekly_dow: e.target.value })}>{DOW.map((d, i) => <option key={i} value={String(i)}>{d}</option>)}</select></div>
        {toggle('crm_auto_inst', 'เตือนงวดเงินก่อนครบกำหนด', 'ล่วงหน้า ' + s.crm_inst_days + ' วัน พร้อมยอดและวันครบ')}
        <div style={{ fontSize: 11.5, color: '#5C6770', paddingLeft: 26 }}>ล่วงหน้า <input style={{ ...field, width: 50, padding: '3px 6px' }} value={s.crm_inst_days} onChange={(e) => setS({ ...s, crm_inst_days: e.target.value })} /> วัน</div>
        {toggle('crm_auto_qc', 'แจ้งเมื่อผ่านตรวจ QC ครบเฟส', 'ทันทีที่ใบตรวจสุดท้ายของเฟสผ่าน · ขอคะแนน NPS หลังเฟส ' + s.crm_nps_phases)}
        {toggle('crm_auto_delivery', 'ส่งมอบบ้าน', 'ข้อความยินดี + รายการประกัน + ขอคะแนน NPS')}
        {toggle('crm_auto_anniv', 'ครบรอบเข้าบ้าน / วันเกิดลูกค้า', 'อวยพรทุกปี (ตั้งวันเกิดในหน้าลูกค้า)')}
        {toggle('crm_auto_warranty', 'เตือนประกันใกล้หมด', 'แจ้งลูกค้าล่วงหน้า 30 วันก่อนหมดแต่ละรายการ')}
        {toggle('crm_auto_checkup', 'นัดตรวจบ้านฟรีหลังส่งมอบ', 'ครบ ' + s.crm_checkups + ' เดือน → เปิดเคสให้โฟร์แมนโทรนัด + แจ้งลูกค้า')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8, fontSize: 11.5, color: '#5C6770' }}>
          <label>SLA ตอบกลับเคส (ชม.)<input style={{ ...field, width: '100%', marginTop: 2 }} value={s.crm_sla_hours} onChange={(e) => setS({ ...s, crm_sla_hours: e.target.value })} /></label>
          <label>ตรวจบ้านหลังส่งมอบ (เดือน, คั่นด้วย ,)<input style={{ ...field, width: '100%', marginTop: 2 }} value={s.crm_checkups} onChange={(e) => setS({ ...s, crm_checkups: e.target.value })} /></label>
          <label>เบอร์ทีมงาน (ลูกค้าพิมพ์ "ติดต่อ")<input style={{ ...field, width: '100%', marginTop: 2 }} value={s.crm_contact_phone} onChange={(e) => setS({ ...s, crm_contact_phone: e.target.value })} /></label>
          <label>LINE ทีมงาน<input style={{ ...field, width: '100%', marginTop: 2 }} value={s.crm_contact_line} onChange={(e) => setS({ ...s, crm_contact_line: e.target.value })} /></label>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 12 }}>🛡 รายการรับประกัน (นับจากวันส่งมอบ)</div>
        {warranty.map((w, i) => <div key={i} style={{ display: 'flex', gap: 6, marginTop: 4 }}><input style={{ ...field, flex: 1 }} value={w.name} onChange={(e) => setWarranty(warranty.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /><input style={{ ...field, width: 70 }} value={w.years} onChange={(e) => setWarranty(warranty.map((x, j) => j === i ? { ...x, years: Number(e.target.value) || 0 } : x))} /><span style={{ alignSelf: 'center', fontSize: 12 }}>ปี</span><button onClick={() => setWarranty(warranty.filter((_, j) => j !== i))} style={{ ...ghost, color: '#C24036' }}>✕</button></div>)}
        <button onClick={() => setWarranty([...warranty, { name: '', years: 1 }])} style={{ ...ghost, marginTop: 6 }}>+ เพิ่มรายการ</button>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}><button onClick={save} style={btn()}>บันทึกการตั้งค่า</button><button onClick={run} style={ghost} title="รันข้อความอัตโนมัติทันที (ไม่รอเวลา)">▶ รันตอนนี้</button>{msg && <span style={{ fontSize: 12, color: msg.startsWith('บันทึก') || msg.startsWith('รัน') ? '#2E7D55' : '#C24036' }}>{msg}</span>}</div>
        <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 10 }}>สิ่งที่ลูกค้าพิมพ์ในไลน์ได้: ความคืบหน้า · งวด · เอกสาร · แจ้งซ่อม … · เคส · ประกัน · บอกต่อ · ติดต่อ — ข้อความอื่นจะเข้า timeline และแจ้งโฟร์แมน/ผู้บริหาร</div>
      </div>
      <div style={{ ...card, padding: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>🛡 สถานะประกันบ้านที่ส่งมอบแล้ว</div>
        {wr.filter((h) => h.delivered).length === 0 && <div style={{ fontSize: 12, color: '#94A0A8' }}>ยังไม่มีบ้านที่ส่งมอบพร้อมวันส่งมอบ (ใส่ "กำหนดส่งมอบ" ในหน้าบ้านเป็น ปี-เดือน-วัน)</div>}
        {wr.filter((h) => h.delivered).map((h) => <div key={h.code} style={{ borderTop: '1px solid #F1F4F6', padding: '6px 0', fontSize: 12 }}><b>{h.code} {h.name}</b> <span style={{ color: '#5C6770' }}>· {h.customer} · ส่งมอบ {h.deliver_date}</span><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>{h.items.map((w) => <span key={w.name} style={{ fontSize: 11, color: w.active ? (w.days_left != null && w.days_left <= 30 ? '#C0852C' : '#2E7D55') : '#94A0A8' }}>{w.active ? '🟢' : '⚪'} {w.name}: {w.active ? `เหลือ ${w.days_left} วัน` : 'หมดแล้ว'}</span>)}</div></div>)}
      </div>
    </div>
  )
}

// ---------- รายงาน CRM ----------
function ReportTab() {
  const [m, setM] = useState<Metrics | null>(null)
  useEffect(() => { api.get<Metrics>('/crm/metrics').then(setM).catch(() => setM(null)) }, [])
  if (!m) return <div style={{ color: '#94A0A8', padding: 20 }}>กำลังโหลด…</div>
  const tile = (label: string, value: string, sub?: string, color = '#1C2730') => <div style={{ ...card, padding: 14 }}><div style={{ fontSize: 11.5, color: '#5C6770' }}>{label}</div><div className="num" style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>{sub && <div style={{ fontSize: 11, color: '#94A0A8' }}>{sub}</div>}</div>
  const maxM = Math.max(1, ...m.per_month.map((x) => x.leads))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
        {tile('ลูกค้าทั้งหมด', String(m.customers), `ผูก LINE ${m.line_linked}`)}
        {tile('Lead เปิดอยู่', String(m.leads_open), `เงียบเกินกำหนด ${m.leads_stale}`, m.leads_stale ? '#C24036' : '#1C2730')}
        {tile('อัตราปิดการขาย', m.conversion + '%', `ปิดได้ ${m.leads_won}/${m.leads_total}`, '#2E7D55')}
        {tile('เวลาปิดการขายเฉลี่ย', m.avg_close_days == null ? '-' : m.avg_close_days + ' วัน')}
        {tile('มาจากการบอกต่อ', String(m.referrals), 'Lead ที่มีรหัสแนะนำ', '#6B4E9E')}
        {tile('เคสบริการค้าง', String(m.open_cases), m.avg_resolve_hours == null ? 'ยังไม่มีข้อมูลเวลาแก้' : `แก้เฉลี่ย ${m.avg_resolve_hours} ชม.`, m.open_cases ? '#C0852C' : '#1C2730')}
        {tile('NPS', m.nps ? String(m.nps.score) : '-', m.nps ? `เฉลี่ย ${m.nps.avg}/10 จาก ${m.nps.n} คำตอบ` : 'ยังไม่มีคำตอบ', m.nps && m.nps.score < 0 ? '#C24036' : '#2E7D55')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12 }}>
        <div style={{ ...card, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Lead ใหม่ / ปิดได้ — 6 เดือนล่าสุด</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 120 }}>
            {m.per_month.map((x) => <div key={x.month} style={{ flex: 1, textAlign: 'center', fontSize: 10.5 }}><div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', justifyContent: 'center', height: 90 }}><div title={`Lead ${x.leads}`} style={{ width: 14, height: (x.leads / maxM) * 90, background: '#30506A', borderRadius: 3 }} /><div title={`ปิดได้ ${x.won}`} style={{ width: 14, height: (x.won / maxM) * 90, background: '#2E7D55', borderRadius: 3 }} /></div><div style={{ color: '#5C6770' }}>{x.month.slice(5)}</div><div className="num">{x.leads}/{x.won}</div></div>)}
          </div>
        </div>
        <div style={{ ...card, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>ช่องทางที่ได้ลูกค้า</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}><tbody>{m.by_source.map((s) => <tr key={s.source} style={{ borderTop: '1px solid #F1F4F6' }}><td style={{ padding: '5px 4px' }}>{s.source}</td><td className="num" style={{ padding: '5px 4px', textAlign: 'right' }}>{s.leads} Lead</td><td className="num" style={{ padding: '5px 4px', textAlign: 'right', color: '#2E7D55' }}>ปิด {s.won}</td><td className="num" style={{ padding: '5px 4px', textAlign: 'right', color: '#5C6770' }}>{s.leads ? Math.round((s.won / s.leads) * 100) : 0}%</td></tr>)}{m.by_source.length === 0 && <tr><td style={{ color: '#94A0A8', padding: 6 }}>ยังไม่มี Lead</td></tr>}</tbody></table>
        </div>
        <div style={{ ...card, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Pipeline ตามขั้น</div>
          {m.pipeline.map((p) => <div key={p.stage} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, borderTop: '1px solid #F1F4F6', padding: '4px 0' }}><span style={{ color: STAGE_COLOR[p.stage] }}>{p.stage}</span><span className="num">{p.n} ราย · {baht(p.value)}</span></div>)}
        </div>
      </div>
    </div>
  )
}
