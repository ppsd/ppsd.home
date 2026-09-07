import { useEffect, useState } from 'react'
import { roles, permissionMatrix, type Role } from '../erpData'
import { MODULES } from '../data'
import { useApp } from '../store'
import type { ApiUser } from '../store'
import { api } from '../api'
import SignatureCell from './SignatureCell'

interface AuditRow { id: number; ts: string; user: string; action: string; detail: string }
interface ResetReq { id: number; username: string; name: string; created: string }
interface MirrorStatus { at: string; ok: boolean; dir: string; msg?: string; files_copied?: number }
interface BackupLast { day: string; at: string; size: number }

const th: React.CSSProperties = { padding: '9px 14px', fontWeight: 600, color: '#5C6770', fontSize: 12 }
const td: React.CSSProperties = { padding: '11px 14px' }

function roleStyle(r: Role) {
  const def = roles.find((x) => x.id === r)!
  return { c: def.color, bg: def.bg, label: def.label }
}

function PermCell({ level }: { level: string }) {
  const map: Record<string, { t: string; c: string; bg: string }> = {
    full: { t: 'แก้ไขได้', c: '#2E7D55', bg: '#E2F1EA' },
    view: { t: 'ดูได้', c: '#30506A', bg: '#E2E9EF' },
    none: { t: '—', c: '#94A0A8', bg: '#F1F4F6' },
  }
  const m = map[level]
  return <span style={{ fontSize: 11, fontWeight: 600, color: m.c, background: m.bg, padding: '2px 10px', borderRadius: 20 }}>{m.t}</span>
}

export default function Users({ onAddUser }: { onAddUser: () => void }) {
  const { data, user, updateUser, downloadBackup, resetUserPin, addPosition, restoreBackup } = useApp()
  const isAdmin = user?.role === 'admin'
  // เปิด/ปิดโมดูลรายคน — บันทึกทันที
  const toggleMod = async (u: ApiUser, key: string) => {
    const cur = u.deny_mods || []
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]
    try { await updateUser(u.id, { deny_mods: next }) } catch (e) { window.alert((e as Error).message) }
  }
  const [busy, setBusy] = useState(false)
  const [autoBk, setAutoBk] = useState<{ name: string; date: string }[]>([])
  useEffect(() => { api.get<{ name: string; date: string }[]>('/backups').then(setAutoBk).catch(() => {}) }, [])
  const restoreAuto = async (name: string, date: string) => {
    if (!window.confirm(`กู้คืนข้อมูลจากไฟล์สำรองวันที่ ${date}?\n⚠️ ข้อมูลปัจจุบันทั้งหมดจะถูกแทนที่ด้วยชุดสำรองนี้\n(ระบบจะสำรองสถานะปัจจุบันเก็บไว้ให้อัตโนมัติก่อนกู้คืน)`)) return
    setBusy(true)
    try {
      await api.post(`/backups/${encodeURIComponent(name)}/restore`, {})
      window.alert(`กู้คืนข้อมูลจากวันที่ ${date} สำเร็จ — ระบบจะโหลดใหม่`)
      window.location.reload()
    } catch (ex) { window.alert((ex as Error).message || 'กู้คืนไม่สำเร็จ'); setBusy(false) }
  }
  const doRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    if (!window.confirm('กู้คืนข้อมูลจากไฟล์นี้?\n⚠️ ข้อมูลปัจจุบันทั้งหมดจะถูกแทนที่ด้วยไฟล์สำรอง\n(แนะนำให้กด "สำรองข้อมูล" ปัจจุบันเก็บไว้ก่อน)')) return
    const r = new FileReader()
    r.onload = async () => {
      setBusy(true)
      try {
        await restoreBackup(String(r.result))
        window.alert('กู้คืนข้อมูลสำเร็จ — ระบบจะโหลดใหม่')
        window.location.reload()
      } catch (ex) {
        window.alert((ex as Error).message || 'กู้คืนไม่สำเร็จ')
        setBusy(false)
      }
    }
    r.readAsDataURL(f)
  }
  const doAddPosition = async () => {
    const name = window.prompt('ชื่อตำแหน่งงานใหม่')
    if (name == null) return
    const trimmed = name.trim()
    if (!trimmed) return
    try { await addPosition(trimmed) } catch (e) { window.alert((e as Error).message || 'เพิ่มไม่สำเร็จ') }
  }
  const doResetPin = async (id: number, name: string) => {
    const pin = window.prompt(`ตั้ง PIN ใหม่ให้ ${name} (ตัวเลข 4 หลัก)`)
    if (pin == null) return
    if (!/^\d{4}$/.test(pin)) { window.alert('PIN ต้องเป็นตัวเลข 4 หลัก'); return }
    try { await resetUserPin(id, pin); window.alert(`ตั้ง PIN ใหม่ให้ ${name} แล้ว`) } catch (e) { window.alert((e as Error).message || 'รีเซ็ตไม่สำเร็จ') }
  }
  const users = data.users
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [resets, setResets] = useState<ResetReq[]>([])
  const loadResets = () => api.get<ResetReq[]>('/pin-resets').then(setResets).catch(() => {})
  useEffect(() => {
    if (users) { api.get<AuditRow[]>('/audit').then(setAudit).catch(() => {}); loadResets() }
  }, [users])
  const approveReset = async (r: ResetReq) => {
    if (!window.confirm(`ยืนยันตัวตนของ "${r.name || r.username}" เรียบร้อยแล้วใช่ไหม?\nระบบจะตั้ง PIN ชั่วคราวให้ และผู้ใช้ต้องตั้ง PIN ใหม่เองตอนเข้าครั้งแรก`)) return
    try {
      const res = await api.post<{ tempPin: string; name: string }>(`/pin-resets/${r.id}/approve`, {})
      window.alert(`ตั้ง PIN ชั่วคราวให้ ${res.name || r.username} แล้ว\n\nPIN ชั่วคราว: ${res.tempPin}\n\nโปรดแจ้งผู้ใช้ — เข้าครั้งแรกด้วย PIN นี้แล้วระบบจะให้ตั้ง PIN ใหม่ทันที`)
      loadResets()
    } catch (e) { window.alert((e as Error).message || 'ทำรายการไม่สำเร็จ') }
  }
  const rejectReset = async (r: ResetReq) => {
    if (!window.confirm(`ปฏิเสธคำขอรีเซ็ต PIN ของ "${r.name || r.username}"?`)) return
    try { await api.post(`/pin-resets/${r.id}/reject`, {}); loadResets() } catch (e) { window.alert((e as Error).message) }
  }
  // สำรองข้อมูลนอกเครื่อง (อัตโนมัติ)
  const [mirrorDir, setMirrorDir] = useState('')
  const [mirrorStat, setMirrorStat] = useState<MirrorStatus | null>(null)
  const [mirrorBusy, setMirrorBusy] = useState(false)
  const [bkLast, setBkLast] = useState<BackupLast | null>(null)
  // แจ้งเตือน LINE
  interface LineSeen { type: string; id: string; name: string; at: string; event: string }
  interface LineCfg { token_set: boolean; to: string; hour: number; last_sent: string; status: { at: string; ok: boolean; msg?: string } | null; seen?: LineSeen[] }
  const [lineHelp, setLineHelp] = useState(false)
  const [lineCfg, setLineCfg] = useState<LineCfg | null>(null)
  const [lineToken, setLineToken] = useState('')
  const [lineTo, setLineTo] = useState('')
  const [lineHour, setLineHour] = useState(8)
  const [lineBusy, setLineBusy] = useState(false)
  const loadLine = () => api.get<LineCfg>('/line-settings').then((r) => { setLineCfg(r); setLineTo(r.to || ''); setLineHour(r.hour ?? 8) }).catch(() => {})
  useEffect(() => { if (users) loadLine() /* eslint-disable-next-line */ }, [users])
  const saveLine = async () => {
    setLineBusy(true)
    try {
      const body: Record<string, unknown> = { to: lineTo.trim(), hour: lineHour }
      if (lineToken.trim()) body.token = lineToken.trim()
      await api.put('/line-settings', body); setLineToken(''); window.alert('บันทึกการตั้งค่า LINE แล้ว'); loadLine()
    } catch (e) { window.alert((e as Error).message) } finally { setLineBusy(false) }
  }
  const testLine = async () => {
    setLineBusy(true)
    try { await api.post('/line-settings/test', {}); window.alert('ส่งสรุปทดสอบเข้า LINE แล้ว — เช็คในกลุ่ม'); loadLine() }
    catch (e) { window.alert('ส่งไม่สำเร็จ: ' + (e as Error).message); loadLine() } finally { setLineBusy(false) }
  }
  // ตั้งค่า AI (อ่านใบส่งของ / งวดงานจากสัญญา)
  interface AiCfg { hasKey: boolean; model: string; models: { id: string; label: string }[]; fromEnv?: boolean }
  const [aiCfg, setAiCfg] = useState<AiCfg | null>(null)
  const [aiKeyInput, setAiKeyInput] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiMsg, setAiMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const loadAi = () => api.get<AiCfg>('/ai-settings').then((r) => { setAiCfg(r); setAiModel(r.model) }).catch(() => {})
  useEffect(() => { if (users && isAdmin) loadAi() /* eslint-disable-next-line */ }, [users])
  const saveAi = async () => {
    setAiBusy(true); setAiMsg(null)
    try {
      const body: Record<string, unknown> = { model: aiModel }
      if (aiKeyInput.trim()) body.api_key = aiKeyInput.trim()
      const r = await api.post<{ hasKey: boolean; model: string }>('/ai-settings', body)
      setAiKeyInput(''); setAiMsg({ ok: true, text: r.hasKey ? 'บันทึกแล้ว — กด “ทดสอบ” เพื่อเช็คว่ากุญแจใช้ได้จริง' : 'บันทึกรุ่นแล้ว แต่ยังไม่มีกุญแจ' }); loadAi()
    } catch (e) { setAiMsg({ ok: false, text: (e as Error).message }) } finally { setAiBusy(false) }
  }
  const testAi = async () => {
    setAiBusy(true); setAiMsg(null)
    try { const r = await api.post<{ model: string; reply: string; ms: number }>('/ai-settings/test', {}); setAiMsg({ ok: true, text: `✓ ใช้งานได้ · รุ่น ${r.model} · ตอบว่า “${r.reply}” (${(r.ms / 1000).toFixed(1)} วิ)` }) }
    catch (e) { setAiMsg({ ok: false, text: '✗ ' + (e as Error).message }) } finally { setAiBusy(false) }
  }
  const loadMirror = () => api.get<{ dir: string; status: MirrorStatus | null; last?: BackupLast | null }>('/backup-mirror').then((r) => { setMirrorDir(r.dir || ''); setMirrorStat(r.status); setBkLast(r.last || null) }).catch(() => {})
  useEffect(() => { if (users) loadMirror() /* eslint-disable-next-line */ }, [users])
  const saveMirror = async () => {
    setMirrorBusy(true)
    try { await api.put('/backup-mirror', { dir: mirrorDir.trim() }); window.alert(mirrorDir.trim() ? 'บันทึกโฟลเดอร์สำรองนอกเครื่องแล้ว' : 'ปิดการสำรองนอกเครื่องแล้ว'); loadMirror() }
    catch (e) { window.alert((e as Error).message) } finally { setMirrorBusy(false) }
  }
  const runMirror = async () => {
    setMirrorBusy(true)
    try { const r = await api.post<{ status: MirrorStatus | null }>('/backup-mirror/run', {}); setMirrorStat(r.status); window.alert(r.status?.ok ? 'สำรองไปนอกเครื่องสำเร็จ' : 'สำรองไม่สำเร็จ: ' + (r.status?.msg || '')) }
    catch (e) { window.alert((e as Error).message) } finally { setMirrorBusy(false) }
  }

  if (!users) {
    return (
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        <div style={{ background: '#fff', border: '1px dashed #CFD8DF', borderRadius: 14, padding: '54px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1C2730' }}>ไม่มีสิทธิ์จัดการผู้ใช้งาน</div>
          <div style={{ fontSize: 13, color: '#5C6770', marginTop: 6 }}>เฉพาะบทบาท <b>ผู้ดูแล</b> เท่านั้นที่จัดการผู้ใช้และสิทธิ์ได้</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* role definition cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {roles.map((r) => (
          <div key={r.id} style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: '15px 17px' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: r.color, background: r.bg, padding: '3px 11px', borderRadius: 20 }}>{r.label}</span>
            <div style={{ fontSize: 12, color: '#5C6770', marginTop: 10, lineHeight: 1.5 }}>{r.desc}</div>
            <div className="num" style={{ fontSize: 12, color: '#94A0A8', marginTop: 8 }}>{users.filter((u) => u.role === r.id).length} คน</div>
          </div>
        ))}
      </div>

      {autoBk.length > 0 && (
        <div style={{ background: '#F2F8F4', border: '1px solid #D8EBDF', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ fontSize: 12.5, color: '#2E7D55', padding: '9px 14px', borderBottom: '1px solid #D8EBDF' }}>
            🛡️ สำรองข้อมูลอัตโนมัติทุกวัน — ฐานข้อมูล + ไฟล์แนบ · เก็บรายวัน 30 วัน + ต้นเดือนย้อนหลัง 12 เดือน (โฟลเดอร์ <code>server/data/backups</code>) — กด “กู้คืน” เพื่อย้อนข้อมูลกลับไปวันนั้น
            {bkLast && <span style={{ marginLeft: 8, fontWeight: 600 }}>· ล่าสุด {bkLast.day} ({(bkLast.size / 1048576).toFixed(1)} MB)</span>}
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {autoBk.map((b) => (
              <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', borderTop: '1px solid #E4F0E8', fontSize: 12.5 }}>
                <span className="num" style={{ color: '#1C2730', fontWeight: 500 }}>{b.date}</span>
                <button onClick={() => restoreAuto(b.name, b.date)} disabled={busy} className="hov-f3f5f7" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#C0852C', background: '#fff', border: '1px solid #ECDCB8', borderRadius: 7, padding: '4px 12px', cursor: busy ? 'default' : 'pointer' }}>กู้คืนชุดนี้</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* สำรองข้อมูลนอกเครื่องอัตโนมัติ (กันเครื่องพังแล้วข้อมูลหาย) */}
      <div style={{ background: '#fff', border: '1px solid #ECDCB8', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #F3E9D2', fontSize: 14, fontWeight: 600, color: '#B7791F', background: '#FBF6EC' }}>💾 สำรองข้อมูลออกนอกเครื่อง (อัตโนมัติทุกวัน)</div>
        <div style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#5C6770', lineHeight: 1.6, marginBottom: 10 }}>
            ใส่พาธโฟลเดอร์นอกเครื่องเซิร์ฟเวอร์ — ระบบจะสำเนาไฟล์สำรองไปที่นั่นทุกวันอัตโนมัติ กันเครื่องนี้พัง/หายแล้วข้อมูลสูญ<br />
            ตัวอย่าง: <code>E:\PPSD-Backup</code> (External drive) · <code>C:\Users\ชื่อ\OneDrive\PPSD-Backup</code> หรือ Google Drive (ขึ้นคลาวด์ให้เอง) · <code>\\เครื่องอื่น\backup</code> (เครื่องใน LAN)
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={mirrorDir} onChange={(e) => setMirrorDir(e.target.value)} placeholder="เช่น E:\PPSD-Backup (เว้นว่าง = ปิด)"
              style={{ flex: 1, minWidth: 260, fontFamily: 'monospace', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '9px 11px', outline: 'none' }} />
            <button onClick={saveMirror} disabled={mirrorBusy} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '9px 15px', cursor: 'pointer' }}>บันทึก</button>
            <button onClick={runMirror} disabled={mirrorBusy || !mirrorDir.trim()} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#2E7D55', background: '#fff', border: '1px solid #CDE3D6', borderRadius: 8, padding: '9px 15px', cursor: mirrorDir.trim() ? 'pointer' : 'not-allowed' }}>{mirrorBusy ? 'กำลังสำรอง…' : '⬆ สำรองไปตอนนี้'}</button>
          </div>
          {mirrorStat && (
            <div style={{ fontSize: 12, marginTop: 10, color: mirrorStat.ok ? '#2E7D55' : '#C24036' }}>
              {mirrorStat.ok ? '✓ สำรองนอกเครื่องล่าสุดสำเร็จ' : '✗ สำรองนอกเครื่องล้มเหลว'} · {mirrorStat.at}
              {!mirrorStat.ok && mirrorStat.msg ? ` — ${mirrorStat.msg}` : ''}
            </div>
          )}
        </div>
      </div>

      {/* แจ้งเตือน LINE — สรุปเรื่องค้างส่งเข้ากลุ่มบริหารทุกเช้า */}
      <div style={{ background: '#fff', border: '1px solid #CDE3D6', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #DFEEE5', fontSize: 14, fontWeight: 600, color: '#2E7D55', background: '#F2F8F4' }}>💬 แจ้งเตือน LINE (สรุปเช้าอัตโนมัติ)</div>
        <div style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#5C6770', lineHeight: 1.6, marginBottom: 10 }}>
            ส่งสรุปเรื่องค้างเข้า LINE ทุกเช้า: งวดเลยกำหนด · หนี้ผู้ขายครบกำหนด · เรื่องรออนุมัติ · ลงบัญชีไม่สำเร็จ · สถานะสำรองข้อมูล
            <button onClick={() => setLineHelp((v) => !v)} style={{ marginLeft: 8, border: 'none', background: 'none', color: '#2E7D55', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, textDecoration: 'underline' }}>{lineHelp ? 'ซ่อนวิธีตั้งค่า' : 'วิธีตั้งค่า (ทีละขั้น)'}</button>
          </div>
          {lineHelp && (
            <ol style={{ fontSize: 12.5, color: '#3C4750', lineHeight: 1.7, margin: '0 0 12px', paddingLeft: 22, background: '#F7FAF8', border: '1px solid #DFEEE5', borderRadius: 9, padding: '10px 14px 10px 30px' }}>
              <li>เข้า <b>developers.line.biz</b> → ล็อกอินด้วย LINE ของบริษัท → Create a new provider (ชื่ออะไรก็ได้ เช่น PPSD)</li>
              <li>Create a channel → เลือก <b>Messaging API</b> → ตั้งชื่อบอท เช่น “PPSD แจ้งเตือน” → สร้าง</li>
              <li>แท็บ <b>Messaging API</b> → เลื่อนลงล่างสุด <b>Channel access token</b> กด Issue → คัดลอกมาวางช่องแรกด้านล่าง แล้วกด บันทึก</li>
              <li>แท็บเดียวกัน ปิด <b>Auto-reply messages</b> และ <b>Greeting messages</b> (กด Edit → Disabled) ไม่งั้นบอทจะตอบข้อความอัตโนมัติรบกวนกลุ่ม · เปิด <b>Allow bot to join group chats</b> (Edit → Enable)</li>
              <li>ที่เครื่องนี้ ดับเบิลคลิก <b>tunnel.bat</b> ในโฟลเดอร์โปรแกรม จะได้ลิงก์ <code>https://xxxx.trycloudflare.com</code> (เปิดค้างไว้ก่อน)</li>
              <li>กลับหน้า LINE Developers → <b>Webhook URL</b> ใส่ <code>https://xxxx.trycloudflare.com/api/line/webhook</code> → Verify (ต้องขึ้น Success) → เปิด <b>Use webhook</b></li>
              <li>ในมือถือ สแกน QR ของบอท (อยู่ในแท็บ Messaging API) เพิ่มเป็นเพื่อน → เชิญบอทเข้ากลุ่มบริหาร → บอทจะตอบ <b>Group ID</b> ในกลุ่มทันที และชื่อกลุ่มจะโผล่ในรายการ “กลุ่มที่บอทเห็น” ด้านล่าง → กด <b>ใช้อันนี้</b> → บันทึก → ส่งทดสอบ</li>
              <li>ได้ Group ID แล้วปิด tunnel.bat ได้เลย การส่งสรุปเช้าไม่ต้องใช้ webhook (ถ้าอยากรู้ ID ทีหลัง พิมพ์คำว่า <b>id</b> ในกลุ่มตอนเปิด tunnel อีกครั้ง)</li>
            </ol>
          )}
          {(lineCfg?.seen?.length || 0) > 0 && (
            <div style={{ marginBottom: 10, fontSize: 12.5 }}>
              <div style={{ fontWeight: 600, color: '#2E7D55', marginBottom: 4 }}>กลุ่ม / คนที่บอทเห็น (ล่าสุดก่อน)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(lineCfg?.seen || []).map((s) => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 8, background: lineTo === s.id ? '#E2F1EA' : '#F7F9FB' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: s.type === 'group' ? '#2E7D55' : '#30506A', background: s.type === 'group' ? '#E2F1EA' : '#E2E9EF', padding: '1px 7px', borderRadius: 20 }}>{s.type === 'group' ? 'กลุ่ม' : s.type === 'room' ? 'ห้อง' : 'คน'}</span>
                    <span style={{ fontWeight: 600 }}>{s.name || '(ไม่ทราบชื่อ)'}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#5C6770' }}>{s.id}</span>
                    <span style={{ fontSize: 11, color: '#94A0A8' }}>{s.at}</span>
                    <button onClick={() => setLineTo(s.id)} style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: lineTo === s.id ? '#fff' : '#2E7D55', background: lineTo === s.id ? '#2E7D55' : '#fff', border: '1px solid #CDE3D6', borderRadius: 7, padding: '3px 10px', cursor: 'pointer' }}>{lineTo === s.id ? '✓ เลือกอยู่' : 'ใช้อันนี้'}</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="password" value={lineToken} onChange={(e) => setLineToken(e.target.value)} placeholder={lineCfg?.token_set ? '•••••• (ตั้งไว้แล้ว — พิมพ์ใหม่เพื่อเปลี่ยน)' : 'Channel access token'}
              style={{ flex: 2, minWidth: 220, fontFamily: 'monospace', fontSize: 12.5, border: '1px solid #D2DAE1', borderRadius: 8, padding: '9px 11px', outline: 'none' }} />
            <input value={lineTo} onChange={(e) => setLineTo(e.target.value)} placeholder="Group ID / User ID (ขึ้นต้น C… หรือ U…)"
              style={{ flex: 1, minWidth: 200, fontFamily: 'monospace', fontSize: 12.5, border: '1px solid #D2DAE1', borderRadius: 8, padding: '9px 11px', outline: 'none' }} />
            <label style={{ fontSize: 12.5, color: '#5C6770', display: 'flex', alignItems: 'center', gap: 6 }}>ส่งเวลา
              <select value={lineHour} onChange={(e) => setLineHour(Number(e.target.value))} style={{ fontFamily: 'inherit', fontSize: 12.5, border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 9px' }}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
            </label>
            <button onClick={saveLine} disabled={lineBusy} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '9px 15px', cursor: 'pointer' }}>บันทึก</button>
            <button onClick={testLine} disabled={lineBusy} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#2E7D55', background: '#fff', border: '1px solid #CDE3D6', borderRadius: 8, padding: '9px 15px', cursor: 'pointer' }}>{lineBusy ? 'กำลังส่ง…' : '📨 ส่งทดสอบ'}</button>
          </div>
          {lineCfg?.status && (
            <div style={{ fontSize: 12, marginTop: 10, color: lineCfg.status.ok ? '#2E7D55' : '#C24036' }}>
              {lineCfg.status.ok ? '✓ ส่งล่าสุดสำเร็จ' : '✗ ส่งไม่สำเร็จ'} · {lineCfg.status.at}{!lineCfg.status.ok && lineCfg.status.msg ? ` — ${lineCfg.status.msg}` : ''}
              {lineCfg.last_sent ? ` · สรุปเช้าล่าสุด ${lineCfg.last_sent}` : ''}
            </div>
          )}
        </div>
      </div>

      {/* ตั้งค่า AI — ให้ AI อ่านใบส่งของ (ตรวจรับของ) และตารางงวดงานจากสัญญา */}
      {isAdmin && aiCfg && (
        <div style={{ background: '#fff', border: '1px solid #D9D2EA', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #E6E0F1', fontSize: 14, fontWeight: 600, color: '#6B4E9E', background: '#F6F3FB', display: 'flex', alignItems: 'center', gap: 10 }}>
            🤖 ตั้งค่า AI (อ่านใบส่งของ / งวดงานจากสัญญา)
            <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: aiCfg.hasKey ? '#2E7D55' : '#B7791F', background: aiCfg.hasKey ? '#E2F1EA' : '#F6ECD6', padding: '3px 10px', borderRadius: 20 }}>{aiCfg.hasKey ? (aiCfg.fromEnv ? '✓ ใช้กุญแจจากเครื่อง (ENV)' : '✓ ตั้งกุญแจแล้ว') : '⚠ ยังไม่มีกุญแจ'}</span>
          </div>
          <div style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 12.5, color: '#5C6770', lineHeight: 1.6, marginBottom: 10 }}>
              ใช้ตอน <b>ตรวจรับของ</b> (อัปโหลดรูปใบส่งของ → AI ดึงรายการ/จำนวน/ราคามาเทียบกับ PO) และ <b>นำเข้างวดงานจากสัญญา</b><br />
              วิธีขอกุญแจ: สมัครที่ console.anthropic.com → เมนู API Keys → Create Key → คัดลอกมาวางด้านล่าง (ขึ้นต้น sk-ant-…) · คิดค่าใช้จ่ายตามการใช้จริง ประมาณไม่กี่สตางค์ต่อใบ
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="password" value={aiKeyInput} onChange={(e) => setAiKeyInput(e.target.value)} placeholder={aiCfg.hasKey ? '•••••• (ตั้งไว้แล้ว — วางใหม่เพื่อเปลี่ยน)' : 'วางกุญแจ API (sk-ant-…)'}
                style={{ flex: 2, minWidth: 260, fontFamily: 'monospace', fontSize: 12.5, border: '1px solid #D2DAE1', borderRadius: 8, padding: '9px 11px', outline: 'none' }} />
              <label style={{ fontSize: 12.5, color: '#5C6770', display: 'flex', alignItems: 'center', gap: 6 }}>รุ่น
                <select value={aiModel} onChange={(e) => setAiModel(e.target.value)} style={{ fontFamily: 'inherit', fontSize: 12.5, border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 9px' }}>
                  {aiCfg.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>
              <button onClick={saveAi} disabled={aiBusy} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '9px 15px', cursor: 'pointer' }}>บันทึก</button>
              <button onClick={testAi} disabled={aiBusy || !aiCfg.hasKey} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#6B4E9E', background: '#fff', border: '1px solid #D9D2EA', borderRadius: 8, padding: '9px 15px', cursor: aiCfg.hasKey ? 'pointer' : 'default', opacity: aiCfg.hasKey ? 1 : 0.5 }}>{aiBusy ? 'กำลังทดสอบ…' : '🧪 ทดสอบ'}</button>
            </div>
            {aiMsg && <div style={{ fontSize: 12, marginTop: 10, color: aiMsg.ok ? '#2E7D55' : '#C24036' }}>{aiMsg.text}</div>}
          </div>
        </div>
      )}

      {/* คำขอรีเซ็ต PIN (ลืม PIN) รออนุมัติ */}
      {resets.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #ECDCB8', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #F3E9D2', fontSize: 14, fontWeight: 600, color: '#B7791F', background: '#FBF6EC' }}>🔑 คำขอรีเซ็ต PIN (ลืม PIN) — {resets.length} รายการ</div>
          <div style={{ padding: '6px 8px' }}>
            {resets.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 8 }} className="hov-fafbfc">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.name || r.username} <span className="num" style={{ fontSize: 11.5, color: '#94A0A8', fontFamily: 'monospace' }}>({r.username})</span></div>
                  <div style={{ fontSize: 11.5, color: '#94A0A8' }}>ขอเมื่อ {r.created} · ยืนยันตัวตน (เจอหน้า/โทร) ก่อนอนุมัติ</div>
                </div>
                <button onClick={() => approveReset(r)} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>อนุมัติ + ตั้ง PIN ชั่วคราว</button>
                <button onClick={() => rejectReset(r)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#C24036', background: '#fff', border: '1px solid #E7CDC9', borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>ปฏิเสธ</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* user list */}
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #EEF1F4' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>ผู้ใช้งานระบบ</span>
          <span className="num" style={{ marginLeft: 9, fontSize: 11, fontWeight: 700, color: '#30506A', background: '#E2E9EF', borderRadius: 20, padding: '1px 8px' }}>{users.length}</span>
          <button onClick={() => downloadBackup()} title="ดาวน์โหลดไฟล์สำรองฐานข้อมูล" className="hov-f3f5f7" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500, color: '#2E7D55', background: '#fff', border: '1px solid #CDE3D6', borderRadius: 8, padding: '8px 13px', cursor: 'pointer' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
            สำรองข้อมูล
          </button>
          <label title="อัปโหลดไฟล์สำรองเพื่อกู้คืน (.sqlite)" className="hov-f3f5f7" style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500, color: '#C0852C', background: '#fff', border: '1px solid #ECDCB8', borderRadius: 8, padding: '8px 13px', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M7 9l5-5 5 5" /><path d="M12 4v12" /></svg>
            {busy ? 'กำลังกู้คืน…' : 'กู้คืนข้อมูล'}
            <input type="file" accept=".sqlite,application/octet-stream" disabled={busy} onChange={doRestore} style={{ display: 'none' }} />
          </label>
          <button onClick={onAddUser} className="btn-primary" style={{ marginLeft: 10, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>+ เพิ่มผู้ใช้</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
              <th style={{ ...th, padding: '9px 18px' }}>ชื่อ-สกุล</th>
              <th style={th}>ชื่อผู้ใช้</th>
              <th style={{ ...th, textAlign: 'center' }}>บทบาท</th>
              <th style={{ ...th, textAlign: 'center' }}>สถานะ</th>
              <th style={th}>ใช้งานล่าสุด</th>
              <th style={th}>สิทธิ์รายโมดูล <span style={{ fontWeight: 400, color: '#94A0A8', fontSize: 10.5 }}>(กดเพื่อเปิด/ปิด)</span></th>
              <th style={{ ...th, textAlign: 'center' }}>ลายเซ็น</th>
              <th style={{ ...th, padding: '9px 18px', textAlign: 'center' }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => {
              const rs = roleStyle(u.role)
              const active = u.status === 'ใช้งาน'
              return (
                <tr key={i} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td style={{ ...td, padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 30, height: 30, borderRadius: '50%', background: '#30506A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12.5, flexShrink: 0 }}>{u.name[0]}</span>
                    <span style={{ fontWeight: 500 }}>{u.name}</span>
                  </td>
                  <td className="num" style={{ ...td, fontFamily: 'monospace', color: '#5C6770' }}>{u.username}</td>
                  <td style={{ ...td, textAlign: 'center' }}><span style={{ fontSize: 11, fontWeight: 600, color: rs.c, background: rs.bg, padding: '3px 11px', borderRadius: 20 }}>{rs.label}</span></td>
                  <td style={{ ...td, textAlign: 'center' }}><span style={{ fontSize: 11, fontWeight: 600, color: active ? '#2E7D55' : '#C24036', background: active ? '#E2F1EA' : '#FBEEEC', padding: '3px 11px', borderRadius: 20 }}>{u.status}</span></td>
                  <td style={{ ...td, color: '#5C6770' }}>{u.last_active}</td>
                  <td style={td}>
                    {u.role === 'admin'
                      ? <span style={{ fontSize: 11, color: '#94A0A8' }}>ทุกโมดูล (ผู้ดูแล)</span>
                      : <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {MODULES.map((m) => {
                            const off = (u.deny_mods || []).includes(m.key)
                            return (
                              <span key={m.key} onClick={() => toggleMod(u, m.key)} title={off ? `เปิดการเข้าถึง "${m.label}" ให้ ${u.name}` : `ปิดการเข้าถึง "${m.label}" สำหรับ ${u.name}`}
                                style={{ fontSize: 10.5, fontWeight: 600, cursor: 'pointer', padding: '2px 9px', borderRadius: 20, border: '1px solid ' + (off ? '#E7CDC9' : '#CDE3D6'), color: off ? '#C24036' : '#2E7D55', background: off ? '#FBEEEC' : '#F2F8F4', textDecoration: off ? 'line-through' : 'none' }}>
                                {m.label}
                              </span>
                            )
                          })}
                        </div>}
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}><SignatureCell userId={u.id} signature={u.signature} /></td>
                  <td style={{ ...td, padding: '11px 18px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                      <select
                        value={u.role}
                        onChange={(e) => updateUser(u.id, { role: e.target.value })}
                        title="เปลี่ยนบทบาท (บันทึกทันที)"
                        style={{ fontFamily: 'inherit', fontSize: 12, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '5px 9px', cursor: 'pointer', outline: 'none' }}
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>{r.label}</option>
                        ))}
                      </select>
                      <button onClick={() => doResetPin(u.id, u.name)} title="ตั้ง PIN ใหม่ให้ผู้ใช้นี้" className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#C0852C', background: '#fff', border: '1px solid #ECDCB8', borderRadius: 7, padding: '5px 9px', cursor: 'pointer' }}>รีเซ็ต PIN</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ตำแหน่งงานในระบบ — ใช้ในฟอร์มเพิ่มผู้ใช้ / เพิ่มพนักงาน */}
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #EEF1F4' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>ตำแหน่งงานในระบบ</span>
          <span style={{ marginLeft: 9, fontSize: 11.5, color: '#94A0A8' }}>ใช้ตอนเพิ่มผู้ใช้/พนักงาน · "ผู้จัดการ" = อนุมัติได้</span>
          <button onClick={doAddPosition} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>+ เพิ่มตำแหน่ง</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '14px 18px' }}>
          {data.positions.length === 0 && <span style={{ fontSize: 13, color: '#94A0A8' }}>ยังไม่มีตำแหน่ง</span>}
          {data.positions.map((p) => (
            <span key={p} style={{ fontSize: 12.5, fontWeight: 500, color: '#30506A', background: '#EEF2F6', border: '1px solid #DCE4EB', borderRadius: 20, padding: '5px 13px' }}>{p}</span>
          ))}
        </div>
      </div>

      {/* permission matrix */}
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF1F4', fontSize: 14, fontWeight: 600 }}>ตารางสิทธิ์การเข้าถึงตามบทบาท</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
              <th style={{ ...th, padding: '9px 18px' }}>ฟังก์ชัน</th>
              {(['admin', 'accounting', 'site', 'viewer'] as Role[]).map((r) => (
                <th key={r} style={{ ...th, textAlign: 'center' }}>{roles.find((x) => x.id === r)!.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permissionMatrix.features.map((f, i) => (
              <tr key={i} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                <td style={{ ...td, padding: '11px 18px', fontWeight: 500 }}>{f}</td>
                {permissionMatrix.grid[i].map((lvl, j) => (
                  <td key={j} style={{ ...td, textAlign: 'center' }}><PermCell level={lvl} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* audit log */}
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF1F4', fontSize: 14, fontWeight: 600 }}>บันทึกการใช้งาน (Audit Log) <span style={{ fontSize: 11.5, fontWeight: 400, color: '#94A0A8' }}>· 300 รายการล่าสุด</span></div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
            <th style={{ ...th, padding: '9px 18px' }}>เวลา</th><th style={th}>ผู้ใช้</th><th style={th}>การกระทำ</th><th style={th}>รายละเอียด</th>
          </tr></thead>
          <tbody>
            {audit.length === 0 && <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีบันทึก</td></tr>}
            {audit.map((a) => (
              <tr key={a.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                <td className="num" style={{ ...td, padding: '9px 18px', color: '#5C6770', whiteSpace: 'nowrap' }}>{new Date(a.ts).toLocaleString('th-TH')}</td>
                <td style={{ ...td, fontWeight: 500 }}>{a.user}</td>
                <td style={{ ...td, color: '#3C4750' }}>{a.action}</td>
                <td style={{ ...td, color: '#5C6770' }}>{a.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
