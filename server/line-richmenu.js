// เมนูกดในแชท LINE (Rich Menu) — แถบปุ่มใหญ่ใต้แชทส่วนตัวกับบอท แยกตามบทบาท
// + ปุ่มตอบด่วน (Quick Reply) ใต้ข้อความบอท ให้กดแทนพิมพ์ (ตกลง/ยกเลิก/เลือกเลข/เลือกบ้าน)
// คำสั่งแบบพิมพ์เดิมยังใช้ได้ทุกอย่าง — ปุ่มแค่ส่งคำสั่งเดิมให้ หรือถามต่อทีละขั้น
export const RICH_KINDS = { manager: 'ผู้บริหาร / ผู้จัดการ', staff: 'พนักงาน / โฟร์แมน', contractor: 'ช่าง / ผู้รับเหมา', customer: 'ลูกค้า' }
const HELP = { key: 'help', icon: '❓', label: 'ช่วย', sub: 'ดูคำสั่งทั้งหมด' }
const BUY = { key: 'buy', icon: '🛒', label: 'สั่งของ / จ้าง', sub: 'เปิดใบขอซื้อ' }
export const RICH_MENUS = {
  manager: [
    { key: 'm_pending', icon: '📋', label: 'รออนุมัติ', sub: 'เอกสารที่รอคุณ' },
    { key: 'm_summary', icon: '📊', label: 'สรุปวันนี้', sub: 'เรื่องค้างวันนี้' },
    { key: 'm_wo', icon: '✍️', label: 'สั่งงาน', sub: 'ออกใบสั่งงาน' },
    { key: 'm_urgent', icon: '🔥', label: 'งานด่วน', sub: 'ที่ยังไม่มีคนรับ' },
    BUY, HELP,
  ],
  staff: [
    BUY,
    { key: 's_receive', icon: '📦', label: 'รับของ', sub: 'ตรวจรับตาม PO' },
    { key: 's_jobs', icon: '📝', label: 'งานของฉัน', sub: 'ใบสั่งงานถึงฉัน' },
    { key: 's_fuel', icon: '⛽', label: 'เบิกน้ำมัน', sub: 'ค่าน้ำมันรถ' },
    { key: 'checkin', icon: '⏰', label: 'ลงเวลา', sub: 'เปิดหน้าเช็คอิน' },
    HELP,
  ],
  contractor: [
    { key: 'c_report', icon: '📸', label: 'รายงานงาน', sub: 'ส่งรูป/ความคืบหน้า' },
    { key: 'c_issue', icon: '⚠️', label: 'แจ้งปัญหา', sub: 'ปัญหาหน้างาน' },
    { key: 'c_material', icon: '🧱', label: 'ขอของ', sub: 'วัสดุที่ต้องการ' },
    { key: 'c_claim', icon: '💰', label: 'เบิกงวด', sub: 'งวดที่ทำเสร็จ' },
    { key: 'c_jobs', icon: '🏠', label: 'งานของฉัน', sub: 'บ้าน + งวดเงิน' },
    HELP,
  ],
  customer: [
    { key: 'u_progress', icon: '🏗️', label: 'ความคืบหน้า', sub: 'บ้านถึงไหนแล้ว' },
    { key: 'u_inst', icon: '💳', label: 'งวดเงิน', sub: 'ยอดและกำหนดชำระ' },
    { key: 'u_docs', icon: '📄', label: 'เอกสาร', sub: 'สัญญา / แบบบ้าน' },
    { key: 'u_repair', icon: '🔧', label: 'แจ้งซ่อม', sub: 'แจ้งปัญหาในบ้าน' },
    { key: 'u_warranty', icon: '🛡️', label: 'รับประกัน', sub: 'ระยะประกัน' },
    { key: 'u_contact', icon: '📞', label: 'ติดต่อทีมงาน', sub: 'เบอร์ / ผู้ดูแล' },
  ],
}
// กดแล้วทำอะไร: cmd = ส่งคำสั่งพิมพ์เดิม · prefix+ask = ถามต่อ แล้วเอาข้อความถัดไปต่อท้ายคำสั่ง · choose = ให้เลือกปุ่ม · hint = บอกวิธี
export const MENU_ACTIONS = {
  help: { cmd: 'ช่วย' },
  m_pending: { cmd: 'รออนุมัติ' }, m_summary: { cmd: 'สรุป' }, m_urgent: { cmd: 'งานด่วน' },
  m_wo: { hint: '✍️ พิมพ์คำสั่งงานได้เลยค่ะ เช่น\n"ให้สมชายไปเช็คหลังคาบ้านคุณพร ด่วน พรุ่งนี้"\nระบบจะทำร่างให้ แล้วกด ตกลง' },
  buy: { choose: ['จะสั่งของ หรือจ้างช่างคะ?', [['🛒 สั่งของ', 'g_buy'], ['👷 ขอจ้าง', 'g_hire']]] },
  g_buy: { prefix: 'สั่งของ ', ask: '🛒 พิมพ์รายการที่ต้องการได้เลยค่ะ เช่น\n"ปูนซีเมนต์ 50 ถุง, เหล็กเส้น 12 มม. 10 เส้น บ้านคุณพร"\n(ไม่ใส่ชื่อบ้านก็ได้ เดี๋ยวถามต่อ · ส่งรูปสินค้าตามมาได้)' },
  g_hire: { prefix: 'ขอจ้าง ', ask: '👷 พิมพ์งานที่จะจ้างได้เลยค่ะ เช่น\n"ช่างทาสีเก็บงาน 2 วัน บ้านคุณพร"' },
  s_receive: { cmd: 'รับของ' }, s_jobs: { cmd: 'งาน' }, s_fuel: { cmd: 'เบิกน้ำมัน' }, checkin: { checkin: true },
  c_report: { hint: '📸 ส่งรูปงานมาได้เลยค่ะ หรือพิมพ์ "รายงาน …" เช่น\n"รายงาน เทพื้นชั้น 2 เสร็จแล้ว"' },
  c_issue: { prefix: 'แจ้งปัญหา ', ask: '⚠️ พิมพ์ปัญหาที่พบได้เลยค่ะ เช่น "ท่อน้ำรั่วห้องน้ำชั้น 2"' },
  c_material: { prefix: 'ขอของ ', ask: '🧱 พิมพ์ของที่ต้องการได้เลยค่ะ เช่น "ปูน 10 ถุง"' },
  c_claim: { cmd: 'เบิกงวด' }, c_jobs: { cmd: 'งาน' },
  u_progress: { cmd: 'ความคืบหน้า' }, u_inst: { cmd: 'งวด' }, u_docs: { cmd: 'เอกสาร' }, u_warranty: { cmd: 'ประกัน' }, u_contact: { cmd: 'ติดต่อ' },
  u_repair: { prefix: 'แจ้งซ่อม ', ask: '🔧 พิมพ์ปัญหาที่พบได้เลยค่ะ เช่น "น้ำรั่วห้องน้ำชั้น 2" แล้วส่งรูปตามมาได้' },
}

// ---- ปุ่มตอบด่วน ----
export const qrMsg = (label, text) => ({ type: 'action', action: { type: 'message', label: String(label).slice(0, 20), text: String(text ?? label).slice(0, 300) } })
export const qrPost = (label, data) => ({ type: 'action', action: { type: 'postback', label: String(label).slice(0, 20), data, displayText: String(label).replace(/^\W+\s*/u, '').slice(0, 300) || label } })
// ใส่ปุ่มตอบด่วนให้ข้อความสุดท้ายเอง ถ้าบอทถามให้ "ตอบตัวเลข" (มีรายการ 1. 2. …) หรือถาม 'ตกลง'/'ครบ'/'ไม่มี'
export function autoQuickReply(msgs) {
  if (!Array.isArray(msgs) || !msgs.length) return msgs
  const last = msgs[msgs.length - 1]
  if (!last || last.type !== 'text' || last.quickReply) return msgs
  const t = String(last.text || '')
  const items = []
  if (/ตอบ(?:เป็น)?ตัวเลข/.test(t)) for (const m of t.matchAll(/^\s*(\d{1,2})[.)]?\s+(\S[^\n]*)$/gm)) items.push(qrMsg(`${m[1]}. ${m[2]}`, m[1]))
  const quoted = (w) => new RegExp(`['"“”‘’]${w}['"“”‘’]`).test(t)
  if (quoted('ตกลง')) items.push(qrMsg('✅ ตกลง', 'ตกลง'))
  if (quoted('ครบ')) items.push(qrMsg('✅ ครบ', 'ครบ'))
  if (quoted('ไม่มี')) items.push(qrMsg('ไม่มี', 'ไม่มี'))
  if (quoted('ไม่ระบุ')) items.push(qrMsg('ไม่ระบุ', 'ไม่ระบุ'))
  if (items.length && (quoted('ยกเลิก') || /ยกเลิก/.test(t))) items.push(qrMsg('✖ ยกเลิก', 'ยกเลิก'))
  const seen = new Set()
  const uniq = items.filter((x) => (seen.has(x.action.text) ? false : seen.add(x.action.text))).slice(0, 13)
  if (!uniq.length) return msgs
  return [...msgs.slice(0, -1), { ...last, quickReply: { items: uniq } }]
}

// ---- รูปเมนู (2500×1686 = 3 ช่อง × 2 แถว) ----
const W = 2500, H = 1686, COLS = [0, 833, 1666, 2500], ROWS = [0, 843, 1686]
const THEME = { manager: '#30506A', staff: '#2E7D55', contractor: '#B7791F', customer: '#7A4E9E' }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
export function menuArtHtml(kind) {
  const c = THEME[kind] || '#30506A'
  const cells = (RICH_MENUS[kind] || []).map((b) => `<div class="cell"><div class="ic">${b.icon}</div><div class="lb">${esc(b.label)}</div><div class="sb">${esc(b.sub)}</div></div>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:${W}px;height:${H}px;background:${c}}
#rm{width:${W}px;height:${H}px;display:grid;grid-template-columns:833px 833px 834px;grid-template-rows:843px 843px;gap:0;background:${c};padding:0}
.cell{margin:14px;border-radius:44px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px;font-family:Kanit,'Leelawadee UI','Leelawadee',Tahoma,sans-serif}
.ic{font-size:230px;line-height:1;font-family:'Segoe UI Emoji','Noto Color Emoji','Apple Color Emoji',sans-serif}
.lb{font-size:118px;font-weight:700;color:${c};line-height:1.15}
.sb{font-size:64px;color:#6B7680;line-height:1.1}
</style></head><body><div id="rm">${cells}</div></body></html>`
}
export function menuDef(kind) {
  const btns = RICH_MENUS[kind] || []
  return {
    size: { width: W, height: H }, selected: true, name: 'PPSD ' + kind, chatBarText: 'เมนู PPSD',
    areas: btns.map((b, i) => {
      const col = i % 3, row = Math.floor(i / 3)
      return { bounds: { x: COLS[col], y: ROWS[row], width: COLS[col + 1] - COLS[col], height: ROWS[row + 1] - ROWS[row] },
        action: { type: 'postback', data: 'menu:' + b.key, displayText: b.label } }
    }),
  }
}

// ---- ติดตั้ง / ผูกเมนูกับแต่ละคน ----
// d: { db, getSetting, setSetting, lineTestUser, lineCanCommand, renderHtmlJpeg }
export function createRichMenu(d) {
  const state = () => { try { return JSON.parse(d.getSetting('line_richmenu', '{}')) || {} } catch { return {} } }
  const save = (s) => d.setSetting('line_richmenu', JSON.stringify(s))
  async function lineApi(method, url, body, ctype) {
    const token = d.getSetting('line_token', '')
    if (!token) throw new Error('ยังไม่ได้ตั้ง LINE token')
    const r = await fetch(url, { method, headers: { Authorization: 'Bearer ' + token, ...(body !== undefined ? { 'Content-Type': ctype || 'application/json' } : {}) },
      body: body === undefined ? undefined : ctype ? body : JSON.stringify(body), signal: AbortSignal.timeout(20000) })
    const txt = await r.text()
    if (!r.ok) throw new Error(`LINE ตอบ ${r.status}: ${txt.slice(0, 160)}`)
    try { return txt ? JSON.parse(txt) : {} } catch { return {} }
  }
  // ใครควรได้เมนูแบบไหน · โหมดทดสอบ = เฉพาะคนทดสอบ (เลือกดูเมนูแบบอื่นได้)
  function targets() {
    const out = new Map()
    for (const u of d.db.prepare("SELECT id, name, role, position, line_uid FROM users WHERE line_uid IS NOT NULL AND status='ใช้งาน'").all())
      out.set(u.line_uid, d.lineCanCommand(u) ? 'manager' : 'staff')
    try { for (const c of d.db.prepare("SELECT line_uid FROM contractor_line WHERE line_uid IS NOT NULL AND status='ใช้งาน'").all()) if (!out.has(c.line_uid)) out.set(c.line_uid, 'contractor') } catch { /* ไม่มีตาราง */ }
    try { for (const c of d.db.prepare('SELECT line_uid FROM customers WHERE line_uid IS NOT NULL').all()) if (!out.has(c.line_uid)) out.set(c.line_uid, 'customer') } catch { /* ไม่มีตาราง */ }
    const t = d.lineTestUser()
    if (t) {
      const only = new Map()
      if (t.line_uid) { const pv = state().preview; only.set(t.line_uid, RICH_MENUS[pv] ? pv : out.get(t.line_uid) || 'staff') }
      return only
    }
    return out
  }
  let syncing = null
  async function sync() {
    if (syncing) return syncing
    syncing = (async () => {
      const s = state()
      if (!s.menus || !Object.keys(s.menus).length) return { linked: 0, unlinked: 0 }
      const links = s.links || {}
      const want = targets()
      let linked = 0, unlinked = 0
      const errors = []
      for (const [uid, kind] of want) {
        if (links[uid] === kind || !s.menus[kind]) continue
        try { await lineApi('POST', `https://api.line.me/v2/bot/user/${uid}/richmenu/${s.menus[kind]}`); links[uid] = kind; linked++ } catch (e) { errors.push(e.message) }
      }
      for (const uid of Object.keys(links)) {
        if (want.has(uid)) continue
        try { await lineApi('DELETE', `https://api.line.me/v2/bot/user/${uid}/richmenu`) } catch (e) { if (!/404/.test(e.message)) errors.push(e.message) }
        delete links[uid]; unlinked++
      }
      save({ ...state(), links, synced: new Date().toISOString(), error: errors[0] || '' })
      return { linked, unlinked, errors }
    })()
    try { return await syncing } finally { syncing = null }
  }
  let timer = null
  const scheduleSync = () => { if (!state().menus) return; clearTimeout(timer); timer = setTimeout(() => sync().catch((e) => console.error('richmenu sync:', e.message)), 3000) }
  async function install() {
    const old = state()
    const menus = {}
    for (const kind of Object.keys(RICH_MENUS)) {
      const img = await d.renderHtmlJpeg(menuArtHtml(kind), { width: W, height: H, selector: '#rm' })
      const r = await lineApi('POST', 'https://api.line.me/v2/bot/richmenu', menuDef(kind))
      await lineApi('POST', `https://api-data.line.me/v2/bot/richmenu/${r.richMenuId}/content`, img, 'image/jpeg')
      menus[kind] = r.richMenuId
    }
    save({ menus, at: new Date().toISOString(), links: {}, preview: old.preview || '' })
    for (const id of Object.values(old.menus || {})) { try { await lineApi('DELETE', `https://api.line.me/v2/bot/richmenu/${id}`) } catch { /* ลบไปแล้ว */ } }
    return sync()
  }
  async function remove() {
    const s = state()
    for (const uid of Object.keys(s.links || {})) { try { await lineApi('DELETE', `https://api.line.me/v2/bot/user/${uid}/richmenu`) } catch { /* ไม่มีแล้ว */ } }
    for (const id of Object.values(s.menus || {})) { try { await lineApi('DELETE', `https://api.line.me/v2/bot/richmenu/${id}`) } catch { /* ลบไปแล้ว */ } }
    save({ preview: s.preview || '' })
  }
  function status() {
    const s = state()
    const counts = Object.fromEntries(Object.keys(RICH_MENUS).map((k) => [k, 0]))
    for (const k of Object.values(s.links || {})) if (k in counts) counts[k]++
    const t = d.lineTestUser()
    return { installed: !!(s.menus && Object.keys(s.menus).length), at: s.at || '', synced: s.synced || '', error: s.error || '', counts, preview: s.preview || '', test_user: t ? t.name : null,
      kinds: Object.entries(RICH_KINDS).map(([k, label]) => ({ kind: k, label, buttons: RICH_MENUS[k].map((b) => `${b.icon} ${b.label}`) })) }
  }
  function setPreview(kind) { save({ ...state(), preview: RICH_MENUS[kind] ? kind : '' }); scheduleSync() }
  return { install, remove, sync, scheduleSync, status, setPreview }
}
