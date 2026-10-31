import { useEffect, useState } from 'react'
import { useApp } from '../../store'
import type { ApiUser } from '../../store'
import { api } from '../../api'
import LineTexts from './LineTexts'

// ศูนย์รวม LINE (แอดมิน): การเชื่อมต่อบอท/ลิงก์สาธารณะ · ผู้รับข้อความ (ผู้ตรวจสอบใบขอซื้อ/ผู้รับใบ PR/ใครผูกแล้ว) · ข้อความบอท · ผูก LINE ของฉัน
type Tab = 'connect' | 'people' | 'texts' | 'me'
const TABS: [Tab, string][] = [['connect', '🔌 การเชื่อมต่อ / สรุปเช้า'], ['people', '👥 ผู้รับข้อความ / ผูก LINE'], ['texts', '✏️ ข้อความบอท'], ['me', '📱 ผูก LINE ของฉัน']]

export default function LineCenter() {
  const { data, user } = useApp()
  const isAdmin = user?.role === 'admin'
  const users = data.users
  const [tab, setTab] = useState<Tab>(() => { try { return (localStorage.getItem('ppsd_line_tab') as Tab) || 'connect' } catch { return 'connect' } })
  const pickTab = (t: Tab) => { setTab(t); try { localStorage.setItem('ppsd_line_tab', t) } catch { /* ignore */ } }
  // แจ้งเตือน LINE
  interface LineSeen { type: string; id: string; name: string; at: string; event: string }
  interface LineCfg { token_set: boolean; to: string; hour: number; last_sent: string; status: { at: string; ok: boolean; msg?: string } | null; seen?: LineSeen[]; secret_set?: boolean; linked?: number; test_only?: number | null; test_held?: { at: string; to: string; text: string }[] }
  const [lineHelp, setLineHelp] = useState(false)
  const [lineCfg, setLineCfg] = useState<LineCfg | null>(null)
  const [lineToken, setLineToken] = useState('')
  const [lineTo, setLineTo] = useState('')
  const [lineHour, setLineHour] = useState(8)
  const [lineBusy, setLineBusy] = useState(false)
  const loadLine = () => api.get<LineCfg>('/line-settings').then((r) => { setLineCfg(r); setLineTo(r.to || ''); setLineHour(r.hour ?? 8) }).catch(() => {})
  useEffect(() => { if (users) loadLine() /* eslint-disable-next-line */ }, [users])
  // ลิงก์สาธารณะอัตโนมัติ (สำหรับ LINE webhook)
  interface TunnelInfo { enabled: boolean; expose: boolean; url: string; status: string; msg: string; at: string; restarts: number; webhook: { at: string; ok: boolean; msg: string; endpoint: string; active?: boolean | null } | null }
  const [tun, setTun] = useState<TunnelInfo | null>(null)
  const [tunBusy, setTunBusy] = useState(false)
  const loadTun = () => api.get<TunnelInfo>('/tunnel').then(setTun).catch(() => {})
  useEffect(() => { if (users && isAdmin) { loadTun(); const t = setInterval(loadTun, 10000); return () => clearInterval(t) } /* eslint-disable-next-line */ }, [users])
  const setTunnel = async (patch: { enabled?: boolean; expose?: boolean }) => {
    if (patch.expose === true && !window.confirm('เปิดให้เข้า ERP ผ่านลิงก์สาธารณะนี้ด้วย?\nทุกคนที่รู้ลิงก์จะเห็นหน้าล็อกอิน (ยังต้องมีชื่อผู้ใช้ + PIN) — เหมาะเมื่อต้องใช้นอกออฟฟิศ')) return
    setTunBusy(true)
    try { setTun(await api.put<TunnelInfo>('/tunnel', patch)) } catch (e) { window.alert((e as Error).message) } finally { setTunBusy(false) }
  }
  const restartTunnel = async () => { setTunBusy(true); try { setTun(await api.post<TunnelInfo>('/tunnel/restart', {})) } catch (e) { window.alert((e as Error).message) } finally { setTunBusy(false) } }
  const registerWebhook = async () => { setTunBusy(true); try { setTun(await api.post<TunnelInfo>('/tunnel/register-webhook', {})) } catch (e) { window.alert((e as Error).message); loadTun() } finally { setTunBusy(false) } }
  const saveLine = async () => {
    setLineBusy(true)
    try {
      const body: Record<string, unknown> = { to: lineTo.trim(), hour: lineHour }
      if (lineToken.trim()) body.token = lineToken.trim()
      if (lineSecret.trim()) body.secret = lineSecret.trim()
      await api.put('/line-settings', body); setLineToken(''); setLineSecret(''); window.alert('บันทึกการตั้งค่า LINE แล้ว'); loadLine()
    } catch (e) { window.alert((e as Error).message) } finally { setLineBusy(false) }
  }
  const testLine = async () => {
    setLineBusy(true)
    try { await api.post('/line-settings/test', {}); window.alert('ส่งสรุปทดสอบเข้า LINE แล้ว — เช็คในกลุ่ม'); loadLine() }
    catch (e) { window.alert('ส่งไม่สำเร็จ: ' + (e as Error).message); loadLine() } finally { setLineBusy(false) }
  }
  // ผูก LINE ของฉัน (รหัส 6 หลัก → ส่งให้บอท)
  const [lineSecret, setLineSecret] = useState('')
  const [linkCode, setLinkCode] = useState<{ code: string; expires_min: number } | null>(null)
  const requestLinkCode = async () => {
    try { const r = await api.post<{ code: string; expires_min: number }>('/line-link/code', {}); setLinkCode(r) } catch (e) { window.alert((e as Error).message) }
  }
  // แอดมินขอรหัสผูก LINE แทนคนอื่น (คนนั้นไม่ต้องเข้าหน้านี้) แล้วบอกรหัสให้เขาส่งในแชทบอท
  const codeFor = async (u: ApiUser) => {
    try {
      const r = await api.post<{ code: string; expires_min: number }>('/line-link/code', { user_id: u.id })
      window.alert(`รหัสผูก LINE ของ ${u.name}: ${r.code}\n\nบอกให้ ${u.name} เพิ่มบอท PPSD Assistant เป็นเพื่อน แล้วพิมพ์รหัสนี้ส่งในแชทบอทภายใน ${r.expires_min} นาที\n(ทุกคนขอรหัสเองได้จากไอคอน 💬 มุมขวาบนของระบบด้วย)`)
    } catch (e) { window.alert((e as Error).message) }
  }
  const unlinkLine = async (u: ApiUser) => {
    if (!window.confirm(`ยกเลิกการผูก LINE ของ ${u.name}?`)) return
    try { await api.del('/line-link?user_id=' + u.id); window.location.reload() } catch (e) { window.alert((e as Error).message) }
  }
  // ขั้นตอนจัดซื้อ: ผู้ตรวจสอบใบขอซื้อก่อนออก PR (ขั้น 2)
  const [flowChecker, setFlowChecker] = useState<{ id: number; name: string; line: boolean } | null>(null)
  const [flowSel, setFlowSel] = useState('')
  const [flowMsg, setFlowMsg] = useState('')
  const [docRecips, setDocRecips] = useState<number[]>([]) // ผู้รับใบ PR (รูป) ทาง LINE หลังอนุมัติครบ
  const [flowPublic, setFlowPublic] = useState('')
  const [lineErr, setLineErr] = useState<{ at: string; status: number; reason: string } | null>(null) // ข้อผิดพลาดล่าสุดจาก LINE (บอกว่าส่งไม่ได้เพราะอะไร)
  const loadFlow = () => api.get<{ checker: { id: number; name: string; line: boolean } | null; doc_recipients?: { id: number }[]; public_url?: string; line_last_error?: { at: string; status: number; reason: string } | null }>('/procurement/flow').then((r) => { setFlowChecker(r.checker); setFlowSel(r.checker ? String(r.checker.id) : ''); setDocRecips((r.doc_recipients || []).map((x) => x.id)); setFlowPublic(r.public_url || ''); setLineErr(r.line_last_error || null) }).catch(() => {})
  useEffect(() => { if (users && isAdmin) loadFlow() /* eslint-disable-next-line */ }, [users])
  const saveFlow = async () => {
    try { const r = await api.put<{ checker: { id: number; name: string; line: boolean } | null }>('/procurement/flow', { checker_user_id: Number(flowSel) || 0, doc_recipients: docRecips }); setFlowChecker(r.checker); setFlowMsg(r.checker ? `บันทึกแล้ว — ใบขอซื้อใหม่ทุกใบจะส่งให้ ${r.checker.name} ตรวจก่อนออก PR${r.checker.line ? '' : ' (ยังไม่ผูก LINE — จะเห็นเฉพาะในเว็บ)'}` : 'ยกเลิกขั้นตรวจสอบแล้ว — ใบขอซื้อไปรออนุมัติทันที') }
    catch (e) { setFlowMsg((e as Error).message) }
  }

  if (!users || !isAdmin) {
    return (
      <div style={{ background: '#fff', border: '1px dashed #CFD8DF', borderRadius: 14, padding: '54px 40px', textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#1C2730' }}>เฉพาะผู้ดูแลระบบ</div>
        <div style={{ fontSize: 13, color: '#5C6770', marginTop: 6 }}>ผูก LINE ของตัวเองได้จากไอคอน 💬 มุมขวาบน</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => pickTab(k)} style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: tab === k ? 700 : 500, color: tab === k ? '#fff' : '#2E7D55', background: tab === k ? '#2E7D55' : '#fff', border: '1px solid ' + (tab === k ? '#2E7D55' : '#CDE3D6'), borderRadius: 9, padding: '8px 14px', cursor: 'pointer' }}>{label}</button>
        ))}
      </div>
      <TestMode cfg={lineCfg} users={users} reload={loadLine} />
      {tab === 'connect' && (
        <>
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
                  <li>เปิดสวิตช์ <b>ลิงก์สาธารณะอัตโนมัติ</b> ด้านล่าง ระบบจะสร้างลิงก์และตั้ง Webhook URL ใน LINE ให้เอง (รอจนขึ้น ✓)</li>
                  <li>กลับหน้า LINE Developers แท็บ Messaging API → เปิด <b>Use webhook</b> (ครั้งเดียว) → กด Verify ต้องขึ้น Success</li>
                  <li>ในมือถือ สแกน QR ของบอท (แท็บ Messaging API) เพิ่มเป็นเพื่อน → เชิญบอทเข้ากลุ่มบริหาร → บอทจะตอบ <b>Group ID</b> ในกลุ่มทันที และชื่อกลุ่มจะโผล่ในรายการ “กลุ่มที่บอทเห็น” ด้านล่าง → กด <b>ใช้อันนี้</b> → บันทึก → ส่งทดสอบ</li>
                  <li>ปล่อยสวิตช์เปิดไว้ตลอด — ลิงก์อาจเปลี่ยนเมื่อเปิดเครื่องใหม่ แต่ระบบจะตั้ง Webhook URL ใหม่ให้เองทุกครั้ง</li>
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
                <input type="password" value={lineSecret} onChange={(e) => setLineSecret(e.target.value)} placeholder={lineCfg?.secret_set ? 'Channel secret •••••• (ตั้งไว้แล้ว)' : 'Channel secret (แท็บ Basic settings — แนะนำให้ใส่)'}
                  style={{ flex: 1, minWidth: 200, fontFamily: 'monospace', fontSize: 12.5, border: '1px solid #D2DAE1', borderRadius: 8, padding: '9px 11px', outline: 'none' }} />
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
              {tun && (
                <div style={{ marginTop: 12, border: '1px solid #DFEEE5', borderRadius: 10, padding: '10px 14px', background: '#FBFDFC' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#1C2730', cursor: 'pointer' }}>
                      <input type="checkbox" checked={tun.enabled} disabled={tunBusy} onChange={(e) => setTunnel({ enabled: e.target.checked })} />
                      🌐 ลิงก์สาธารณะอัตโนมัติ (ให้ LINE ส่งข้อความเข้ามาได้ตลอด)
                    </label>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: tun.status === 'เปิดอยู่' ? '#2E7D55' : tun.enabled ? '#B7791F' : '#94A0A8', background: tun.status === 'เปิดอยู่' ? '#E2F1EA' : tun.enabled ? '#F6ECD6' : '#EDF1F4', padding: '3px 10px', borderRadius: 20 }}>{tun.enabled ? tun.status : 'ปิด'}</span>
                    {tun.enabled && <button onClick={restartTunnel} disabled={tunBusy} className="hov-f3f5f7" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>↻ เปิดลิงก์ใหม่</button>}
                  </div>
                  {tun.enabled && (
                    <div style={{ fontSize: 12, color: '#3C4750', marginTop: 8, lineHeight: 1.7 }}>
                      {tun.url ? (
                        <div>
                          <div>ลิงก์หลัก: <code style={{ background: '#EDF1F4', padding: '1px 6px', borderRadius: 5 }}>{tun.url}</code></div>
                          <div>Webhook URL ที่ตั้งใน LINE: <code style={{ background: '#EDF1F4', padding: '1px 6px', borderRadius: 5 }}>{tun.url.replace(/\/$/, '') + '/api/line/webhook'}</code>
                            <button onClick={() => { navigator.clipboard?.writeText(tun.url.replace(/\/$/, '') + '/api/line/webhook').then(() => window.alert('คัดลอกแล้ว — วางในช่อง Webhook URL ของหน้า LINE Developers ได้เลย')) }} style={{ marginLeft: 6, fontFamily: 'inherit', fontSize: 11, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 6, padding: '1px 8px', cursor: 'pointer' }}>คัดลอก</button>
                          </div>
                        </div>
                      ) : <div style={{ color: '#B7791F' }}>{tun.msg || 'กำลังสร้างลิงก์… (ครั้งแรกต้องดาวน์โหลด cloudflared ประมาณ 1 นาที)'}</div>}
                      {tun.webhook && (
                        <div style={{ color: tun.webhook.ok ? (tun.webhook.active === false ? '#B7791F' : '#2E7D55') : '#C24036' }}>
                          {tun.webhook.ok ? (tun.webhook.active === false ? '⚠' : '✓') : '✗'} {tun.webhook.msg} <span style={{ color: '#94A0A8' }}>· {tun.webhook.at}</span>
                          {!tun.webhook.ok && <button onClick={registerWebhook} disabled={tunBusy} style={{ marginLeft: 8, border: 'none', background: 'none', color: '#30506A', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5 }}>ลองตั้ง Webhook อีกครั้ง</button>}
                        </div>
                      )}
                      {tun.msg && tun.url && <div style={{ color: '#94A0A8' }}>{tun.msg}</div>}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, cursor: 'pointer', color: '#5C6770' }}>
                        <input type="checkbox" checked={tun.expose} disabled={tunBusy} onChange={(e) => setTunnel({ expose: e.target.checked })} />
                        อนุญาตเปิด ERP ผ่านลิงก์นี้ด้วย (ใช้นอกออฟฟิศ) — ปิดไว้ = ลิงก์รับได้เฉพาะข้อความจาก LINE
                      </label>
                    </div>
                  )}
                </div>
              )}
              {lineCfg?.status && (
                <div style={{ fontSize: 12, marginTop: 10, color: lineCfg.status.ok ? '#2E7D55' : '#C24036' }}>
                  {lineCfg.status.ok ? '✓ ส่งล่าสุดสำเร็จ' : '✗ ส่งไม่สำเร็จ'} · {lineCfg.status.at}{!lineCfg.status.ok && lineCfg.status.msg ? ` — ${lineCfg.status.msg}` : ''}
                  {lineCfg.last_sent ? ` · สรุปเช้าล่าสุด ${lineCfg.last_sent}` : ''}
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {tab === 'people' && (
        <>
          {/* ขั้นตอนจัดซื้อ: โฟร์แมนขอ → ผู้ตรวจสอบเช็ค → ออก PR + ส่งอนุมัติ LINE → รูปใบเสนอราคา (AI เทียบ) → ออก PO + ส่งอนุมัติ LINE */}
          {isAdmin && users && (
            <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 18px', borderBottom: '1px solid #EEF1F4', fontSize: 14, fontWeight: 600, color: '#1C2730', background: '#F7F9FB', display: 'flex', alignItems: 'center', gap: 10 }}>
                🛒 ขั้นตอนจัดซื้อ (PR → PO)
                <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: flowChecker ? '#2E7D55' : '#B7791F', background: flowChecker ? '#E2F1EA' : '#F6ECD6', padding: '3px 10px', borderRadius: 20 }}>{flowChecker ? `ผู้ตรวจสอบ: ${flowChecker.name}${flowChecker.line ? ' · ผูก LINE แล้ว' : ' · ยังไม่ผูก LINE'}` : 'ยังไม่ตั้งผู้ตรวจสอบ (ข้ามขั้น 2)'}</span>
              </div>
              <div style={{ padding: '14px 18px' }}>
                <div style={{ fontSize: 12.5, color: '#5C6770', lineHeight: 1.7, marginBottom: 10 }}>
                  1) โฟร์แมนคีย์ใบขอซื้อ → 2) <b>ผู้ตรวจสอบ</b> ได้การ์ดใน LINE กด “ตรวจแล้ว ออก PR” → 3) ระบบออก PR + ส่งการ์ดขออนุมัติให้ผู้บริหารทาง LINE → 4) ส่งรูปใบเสนอราคาใน LINE (พิมพ์ “ใบเสนอราคา PR-…” แล้วส่งรูป → “เทียบราคา”) AI สรุปร้านที่คุ้มสุด → 5) กด “ออก PO ร้าน…” ระบบออก PO + ส่งขออนุมัติทาง LINE
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, color: '#5C6770' }}>ผู้ตรวจสอบใบขอซื้อ (ขั้น 2)</span>
                  <select value={flowSel} onChange={(e) => setFlowSel(e.target.value)} style={{ fontFamily: 'inherit', fontSize: 12.5, border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 9px', minWidth: 220 }}>
                    <option value="">— ไม่ต้องตรวจสอบ (ไปรออนุมัติเลย) —</option>
                    {users.filter((u) => u.status !== 'ปิดใช้งาน').map((u) => <option key={u.id} value={u.id}>{u.name}{u.position ? ` · ${u.position}` : ''}{u.line_uid ? ' · LINE ✓' : ''}</option>)}
                  </select>
                  <button onClick={saveFlow} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '8px 15px', cursor: 'pointer' }}>บันทึก</button>
                </div>
                <div style={{ marginTop: 12, fontSize: 12.5, color: '#5C6770' }}>ขั้น 3: PR ที่อนุมัติครบแล้ว ระบบสร้างเป็นรูปใบ PR แล้วส่งเข้า LINE ของ (เลือกได้หลายคน เช่น จัดซื้อ):</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                  {users.filter((u) => u.status !== 'ปิดใช้งาน').map((u) => {
                    const on = docRecips.includes(u.id)
                    return <label key={u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, padding: '5px 10px', borderRadius: 8, border: '1px solid ' + (on ? '#30506A' : '#D2DAE1'), background: on ? '#E2E9EF' : '#fff', cursor: 'pointer' }}>
                      <input type="checkbox" checked={on} onChange={() => setDocRecips((cur) => on ? cur.filter((x) => x !== u.id) : [...cur, u.id])} />{u.name}{u.line_uid ? ' · LINE ✓' : ' · ยังไม่ผูก LINE'}
                    </label>
                  })}
                </div>
                {lineErr && <div style={{ fontSize: 12, color: '#C24036', background: '#FBEEEC', border: '1px solid #E8C9C5', borderRadius: 8, padding: '7px 11px', marginTop: 8 }}>⚠ LINE ส่งไม่สำเร็จล่าสุด ({lineErr.at}): {lineErr.reason}</div>}
                <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 6 }}>รูปใบ PR สร้างด้วย Google Chrome/Edge ในเครื่องเซิร์ฟเวอร์ · LINE ดึงรูปผ่านลิงก์สาธารณะ{flowPublic ? ` (${flowPublic})` : ' — ยังไม่มีลิงก์: เปิด "ลิงก์สาธารณะอัตโนมัติ" ที่การ์ดแจ้งเตือน LINE ก่อน ไม่งั้นจะส่งเป็นข้อความสรุปแทน'} · กด "บันทึก" ด้านบนเพื่อบันทึกผู้รับ</div>
                {flowMsg && <div style={{ fontSize: 12, marginTop: 8, color: '#2E7D55' }}>{flowMsg}</div>}
                {flowChecker && !flowChecker.line && (
                  <div style={{ fontSize: 12.5, marginTop: 10, color: '#8A2A22', background: '#FBEEEC', border: '1px solid #EDD3CE', borderRadius: 8, padding: '9px 12px' }}>
                    ⚠ <b>{flowChecker.name} ยังไม่ได้ผูก LINE</b> — การ์ด "ตรวจสอบใบขอซื้อ" จะยังไม่เด้งในไลน์ (ใบรออยู่ในเว็บแทน) · แก้โดยกด <b>ขอรหัส</b> ที่คอลัมน์ LINE ของ {flowChecker.name} ในตารางด้านล่าง แล้วให้เขาส่งรหัส 6 หลักไปที่แชทบอท
                  </div>
                )}
              </div>
            </div>
          )}
          <LinkedPeople users={users} onCode={codeFor} onUnlink={unlinkLine} />
        </>
      )}
      {tab === 'texts' && <LineTexts />}
      {tab === 'me' && (
        <>
          {/* ผูก LINE ของฉัน — สั่งงาน (ผู้บริหาร) / รับงาน ผ่านแชทบอท */}
          <div style={{ background: '#fff', border: '1px solid #CDE3D6', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #DFEEE5', fontSize: 14, fontWeight: 600, color: '#2E7D55', background: '#F2F8F4', display: 'flex', alignItems: 'center', gap: 10 }}>
              📱 ผูก LINE ของฉัน — สั่งงาน / รับงานผ่านแชทบอท
              {lineCfg && <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: '#5C6770' }}>ผูกแล้ว {lineCfg.linked || 0} คน</span>}
            </div>
            <div style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: 12.5, color: '#5C6770', lineHeight: 1.7, marginBottom: 10 }}>
                <b>ผู้บริหาร</b>: พิมพ์คำสั่งในแชทบอท เช่น “ให้สมชายไปเช็คหลังคาบ้านคุณพร ด่วน พรุ่งนี้” → บอททำร่าง → ตอบ <b>ตกลง</b> → ออกใบสั่งงานและแจ้งคนรับทาง LINE ทันที · พิมพ์ <b>สรุป</b> = เรื่องค้างวันนี้ · <b>งานด่วน</b> = งานด่วนที่ยังไม่รับ<br />
                <b>พนักงาน</b>: ได้รับแจ้งงานในแชท → ตอบ <b>รับ</b> = รับทราบ (CEO เห็นทันที) · พิมพ์ <b>งาน</b> = งานที่ค้างของฉัน<br />
                วิธีผูก: เพิ่มบอทเป็นเพื่อน (QR ในแท็บ Messaging API) → กดไอคอน 💬 มุมขวาบนของระบบ (ทุกคนกดได้ ไม่ต้องเข้าหน้านี้) หรือปุ่มด้านล่าง → ส่งรหัส 6 หลักไปในแชทบอท (รหัสใช้ได้ 10 นาที) · แอดมินกด “ขอรหัส” ในคอลัมน์ LINE ของตารางด้านล่างแทนคนอื่นได้
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button onClick={requestLinkCode} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 8, padding: '9px 15px', cursor: 'pointer' }}>{user?.lineLinked ? '🔁 ผูก LINE ใหม่' : '🔗 ผูก LINE ของฉัน'}</button>
                {user?.lineLinked && !linkCode && <span style={{ fontSize: 12.5, color: '#2E7D55', fontWeight: 600 }}>✓ บัญชีนี้ผูก LINE แล้ว</span>}
                {linkCode && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F2F8F4', border: '1px solid #CDE3D6', borderRadius: 10, padding: '8px 14px' }}>
                    <span style={{ fontSize: 12.5, color: '#3C4750' }}>ส่งรหัสนี้ไปในแชทบอท:</span>
                    <span className="num" style={{ fontSize: 24, fontWeight: 800, letterSpacing: 4, color: '#1C2730' }}>{linkCode.code}</span>
                    <span style={{ fontSize: 11.5, color: '#94A0A8' }}>ใช้ได้ {linkCode.expires_min} นาที · ผูกเสร็จบอทจะตอบยืนยัน แล้วกด F5 หน้านี้</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ใครผูก LINE แล้วบ้าง (พนักงาน) — ขอรหัสผูกแทน / ยกเลิกผูก
function LinkedPeople({ users, onCode, onUnlink }: { users: ApiUser[]; onCode: (u: ApiUser) => void; onUnlink: (u: ApiUser) => void }) {
  const active = users.filter((u) => u.status !== 'ปิดใช้งาน')
  const linked = active.filter((u) => u.line_uid).length
  return (
    <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid #EEF1F4', fontSize: 14, fontWeight: 600, color: '#1C2730', background: '#F7F9FB', display: 'flex', alignItems: 'center', gap: 10 }}>
        👥 พนักงานที่ผูก LINE
        <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: '#2E7D55', background: '#E2F1EA', padding: '3px 10px', borderRadius: 20 }}>ผูกแล้ว {linked}/{active.length} คน</span>
      </div>
      <div style={{ padding: '10px 18px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {active.map((u) => (
          <div key={u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '6px 10px', borderRadius: 9, border: '1px solid ' + (u.line_uid ? '#CDE3D6' : '#E1E5EA'), background: u.line_uid ? '#F2F8F4' : '#fff' }}>
            <span style={{ fontWeight: 600 }}>{u.name}</span>{u.position && <span style={{ color: '#94A0A8' }}>{u.position}</span>}
            {u.line_uid
              ? <button onClick={() => onUnlink(u)} title="ยกเลิกการผูก LINE" style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 700, color: '#2E7D55', background: '#E2F1EA', border: 'none', borderRadius: 20, padding: '2px 9px', cursor: 'pointer' }}>✓ LINE</button>
              : <button onClick={() => onCode(u)} title="ขอรหัสผูก LINE ให้คนนี้" style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 20, padding: '2px 9px', cursor: 'pointer' }}>ขอรหัส</button>}
          </div>
        ))}
      </div>
    </div>
  )
}

// โหมดทดสอบ: บอทส่ง/ตอบเฉพาะคนที่เลือก — ข้อความถึงคนอื่น/กลุ่ม/ลูกค้าถูกระงับไว้ (แสดงรายการว่าจะส่งถึงใคร)
function TestMode({ cfg, users, reload }: { cfg: { test_only?: number | null; test_held?: { at: string; to: string; text: string }[] } | null; users: ApiUser[]; reload: () => void }) {
  const linked = users.filter((u) => u.line_uid && u.status !== 'ปิดใช้งาน')
  const [pick, setPick] = useState(0)
  const [busy, setBusy] = useState(false)
  const on = cfg?.test_only ? users.find((u) => u.id === cfg.test_only) : null
  const set = async (id: number) => {
    if (id && !window.confirm(`เปิดโหมดทดสอบ: บอทจะส่ง/ตอบเฉพาะ ${users.find((u) => u.id === id)?.name} คนเดียว
ข้อความถึงคนอื่น กลุ่ม และลูกค้า จะถูกระงับ (ไม่ส่งย้อนหลัง)`)) return
    setBusy(true)
    try { await api.put('/line-settings', { test_only: id || null }); reload() } catch (e) { window.alert((e as Error).message) }
    setBusy(false)
  }
  if (!cfg) return null
  if (!on) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, color: '#5C6770', background: '#fff', border: '1px solid #E1E5EA', borderRadius: 10, padding: '8px 14px' }}>
      🧪 โหมดทดสอบ: <b style={{ color: '#2E7D55' }}>ปิด</b> (ส่งทุกคนตามปกติ) · เปิดให้ส่งเฉพาะ
      <select value={pick} onChange={(e) => setPick(Number(e.target.value))} style={{ fontFamily: 'inherit', fontSize: 12.5, padding: '4px 8px', borderRadius: 7, border: '1px solid #D2DAE1' }}>
        <option value={0}>— เลือกคน (ที่ผูก LINE แล้ว) —</option>
        {linked.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      <button disabled={!pick || busy} onClick={() => set(pick)} style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: pick ? '#B7791F' : '#D9C6A0', border: 'none', borderRadius: 7, padding: '5px 12px', cursor: pick ? 'pointer' : 'default' }}>เปิดโหมดทดสอบ</button>
    </div>
  )
  const held = cfg.test_held || []
  return (
    <div style={{ background: '#FFF8EC', border: '1px solid #ECDCB8', borderRadius: 12, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#B7791F' }}>🧪 โหมดทดสอบเปิดอยู่ — บอทส่ง/ตอบเฉพาะ {on.name}</span>
        {!on.line_uid && <span style={{ fontSize: 12, color: '#C24036' }}>⚠ คนนี้ยังไม่ได้ผูก LINE</span>}
        <button disabled={busy} onClick={() => set(0)} style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>ปิดโหมดทดสอบ (ส่งทุกคนตามปกติ)</button>
      </div>
      <div style={{ fontSize: 12, color: '#5C6770' }}>ข้อความถึงคนอื่น กลุ่ม และลูกค้าถูกระงับ ไม่ส่งย้อนหลังเมื่อปิดโหมด · คนอื่นทักบอทมา บอทจะไม่ตอบ · สรุปเช้าส่งเข้า LINE {on.name} แทนกลุ่ม</div>
      <details>
        <summary style={{ fontSize: 12.5, cursor: 'pointer', color: '#30506A' }}>ข้อความที่ถูกระงับ ({held.length}{held.length >= 30 ? '+' : ''}) <button onClick={(e) => { e.preventDefault(); reload() }} style={{ fontFamily: 'inherit', fontSize: 11, border: '1px solid #D2DAE1', background: '#fff', borderRadius: 6, padding: '1px 7px', cursor: 'pointer', marginLeft: 6 }}>รีเฟรช</button></summary>
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
          {held.length === 0 && <div style={{ fontSize: 12, color: '#94A0A8' }}>ยังไม่มี</div>}
          {held.map((h, i) => (
            <div key={i} style={{ fontSize: 12, background: '#fff', border: '1px solid #EEE3CC', borderRadius: 7, padding: '5px 9px' }}>
              <span style={{ color: '#94A0A8' }}>{h.at}</span> → <b>{h.to}</b>: <span style={{ color: '#5C6770' }}>{h.text}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
