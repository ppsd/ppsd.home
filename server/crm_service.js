// ===== CRM บริการลูกค้า: LINE ลูกค้า (ผูกบัญชี/คำสั่ง/ข้อความอัตโนมัติ) · เคสแจ้งซ่อม + SLA · ประกันงาน + นัดตรวจบ้าน · NPS + บอกต่อ =====
import { db } from './db.js'
import { isManager } from './auth.js'
import { housesOfCustomer, qcProgressOf, hooks } from './crm.js'

// ---- schema ----
function ensureCol(table, col, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`)
}
for (const [c, t] of [['case_no', 'TEXT'], ['customer_id', 'INTEGER'], ['source', 'TEXT'], ['sla_due', 'TEXT'], ['created_at', 'TEXT'], ['resolved_at', 'TEXT'], ['assignee', 'TEXT'], ['photo', 'TEXT'], ['category', 'TEXT'], ['rating', 'INTEGER'], ['rating_note', 'TEXT'], ['log', 'TEXT']]) ensureCol('issues', c, t)
db.exec(`CREATE TABLE IF NOT EXISTS nps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER, house_code TEXT, trigger_key TEXT, score INTEGER, comment TEXT, asked_at TEXT, answered_at TEXT, by_uid TEXT
)`)
db.exec(`CREATE TABLE IF NOT EXISTS crm_sent (key TEXT PRIMARY KEY, at TEXT)`)

const isoNow = () => new Date().toISOString().slice(0, 10)
const nowTS = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` }
const jparse = (s) => { if (!s) return null; try { return JSON.parse(s) } catch { return null } }
const fmt = (n) => (Number(n) || 0).toLocaleString('en-US')
const getS = (k, def = '') => db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value ?? def
const setS = (k, v) => db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v))
const sentOnce = (key) => { if (db.prepare('SELECT key FROM crm_sent WHERE key=?').get(key)) return false; db.prepare('INSERT INTO crm_sent (key,at) VALUES (?,?)').run(key, nowTS()); return true }
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const thDate = (iso) => { const d = new Date(String(iso).slice(0, 10) + 'T00:00:00'); return Number.isNaN(d.getTime()) ? String(iso || '') : `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${(d.getFullYear() + 543) % 100}` }
// วันที่ส่งมอบในบ้านเป็นข้อความอิสระ: รับ ISO / dd/mm/yyyy (พ.ศ. หรือ ค.ศ.)
export function parseAnyDate(s) {
  const t = String(s || '').trim(); if (!t) return null
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (m) { let y = Number(m[3]); if (y < 100) y += 2500; if (y > 2400) y -= 543; return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}` }
  return null
}
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const addMonths = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10) }
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000)

// ---- ตั้งค่าอัตโนมัติ ----
export const CRM_DEFAULTS = {
  crm_auto_weekly: '1', crm_weekly_dow: '1', crm_hour: '9', crm_auto_inst: '1', crm_inst_days: '7', crm_auto_qc: '1', crm_auto_welcome: '1', crm_auto_delivery: '1', crm_auto_anniv: '1', crm_auto_warranty: '1', crm_auto_checkup: '1', crm_checkups: '6,12', crm_sla_hours: '24', crm_nps_phases: '5',
  crm_warranty: JSON.stringify([{ name: 'โครงสร้างอาคาร', years: 5 }, { name: 'หลังคา / รั่วซึม', years: 1 }, { name: 'ระบบไฟฟ้า-ประปา-สุขาภิบาล', years: 1 }, { name: 'งานสี-ฝ้า-ผิวตกแต่ง', years: 1 }]),
  crm_contact_line: '', crm_contact_phone: '',
}
export const crmSettings = () => Object.fromEntries(Object.entries(CRM_DEFAULTS).map(([k, v]) => [k, getS(k, v)]))
const on = (k) => crmSettings()[k] === '1'

// ---- ลูกค้า ↔ LINE ----
export const customerByLine = (uid) => (uid ? db.prepare('SELECT * FROM customers WHERE line_uid=?').get(uid) : null)
export function customerLineCode(customerId) {
  db.prepare('DELETE FROM customer_link_codes WHERE expires < ? OR customer_id=?').run(Date.now(), customerId)
  let code
  do { code = String(Math.floor(100000 + Math.random() * 900000)) } while (db.prepare('SELECT code FROM customer_link_codes WHERE code=?').get(code))
  db.prepare('INSERT INTO customer_link_codes (code,customer_id,expires) VALUES (?,?,?)').run(code, customerId, Date.now() + 24 * 60 * 60 * 1000)
  return { code, expires_hours: 24 }
}
export function consumeCustomerCode(code, uid) {
  const r = db.prepare('SELECT * FROM customer_link_codes WHERE code=? AND expires >= ?').get(String(code), Date.now())
  if (!r) return null
  db.prepare('DELETE FROM customer_link_codes WHERE code=?').run(code)
  db.prepare('UPDATE customers SET line_uid=NULL WHERE line_uid=? AND id<>?').run(uid, r.customer_id)
  db.prepare('UPDATE customers SET line_uid=?, line_linked_at=? WHERE id=?').run(uid, nowTS(), r.customer_id)
  return db.prepare('SELECT * FROM customers WHERE id=?').get(r.customer_id)
}
const logContact = (customerId, channel, note, by, houseCode = '') => db.prepare('INSERT INTO customer_contacts (customer_id,date,channel,note,by,house_code,done) VALUES (?,?,?,?,?,?,1)').run(customerId, thDate(isoNow()), channel, note, by, houseCode)

// ---- ข้อความความคืบหน้าให้ลูกค้า ----
export function progressMessages(c, houses = housesOfCustomer(c)) {
  const active = houses.filter((h) => h.status !== 'ส่งมอบแล้ว' && h.status !== 'after-service')
  const list = active.length ? active : houses
  if (!list.length) return ['ยังไม่มีบ้านที่ผูกกับบัญชีของคุณค่ะ — ติดต่อทีมงาน PPSD ได้เลยนะคะ']
  const msgs = []
  for (const h of list) {
    const qc = qcProgressOf(h.code)
    const pct = qc.total ? Math.round((qc.done / qc.total) * 100) : Number(h.pct) || 0
    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10))
    const inst = db.prepare("SELECT * FROM installments WHERE house_code=? AND COALESCE(side,'customer')='customer' ORDER BY no").all(h.code)
    const next = inst.find((i) => (Number(i.paid) || 0) < (Number(i.amount) || 0))
    const lastQc = db.prepare("SELECT date, type, status FROM qc_inspections WHERE house_code=? ORDER BY id DESC LIMIT 1").get(h.code)
    const open = db.prepare("SELECT COUNT(*) c FROM issues WHERE house_code=? AND status<>'แก้ไขแล้ว'").get(h.code).c
    let t = `🏠 ${h.name} (${h.code})\nความคืบหน้า ${pct}%\n${bar}\n`
    t += `✅ ผ่านตรวจแล้ว ${qc.done}/${qc.total} ขั้นตอน${qc.current ? `\n🔧 กำลังทำ: ${qc.current.name}` : ''}`
    if (lastQc) t += `\n🔍 ตรวจงานล่าสุด: ${lastQc.type || ''} (${lastQc.status}) ${lastQc.date || ''}`
    if (next) t += `\n💰 งวดถัดไป: งวด ${next.no} ${next.detail || ''} ${fmt((Number(next.amount) || 0) - (Number(next.paid) || 0))} บาท${next.due ? ' ครบ ' + next.due : ''}`
    else if (inst.length) t += '\n💰 ชำระครบทุกงวดแล้ว ขอบคุณค่ะ'
    if (open) t += `\n🛠 เรื่องที่แจ้งไว้ยังดำเนินการ ${open} เรื่อง`
    if (h.deliver_date) t += `\n📅 กำหนดส่งมอบ ${h.deliver_date}`
    msgs.push(t)
  }
  msgs.push("พิมพ์ 'งวด' ดูงวดเงิน · 'เอกสาร' ดูเอกสาร · 'แจ้งซ่อม …' แจ้งปัญหา · 'ติดต่อ' คุยกับทีมงานค่ะ")
  return msgs.slice(0, 5)
}
function installmentMessage(c) {
  const houses = housesOfCustomer(c)
  if (!houses.length) return 'ยังไม่มีบ้านที่ผูกกับบัญชีของคุณค่ะ'
  return houses.map((h) => {
    const inst = db.prepare("SELECT * FROM installments WHERE house_code=? AND COALESCE(side,'customer')='customer' ORDER BY no").all(h.code)
    if (!inst.length) return `🏠 ${h.name}: ยังไม่มีตารางงวดค่ะ`
    const paid = inst.reduce((s, i) => s + (Number(i.paid) || 0), 0), total = inst.reduce((s, i) => s + (Number(i.amount) || 0), 0)
    return `🏠 ${h.name} — ชำระแล้ว ${fmt(paid)} / ${fmt(total)} บาท\n` + inst.map((i) => { const p = Number(i.paid) || 0, a = Number(i.amount) || 0; return `${p >= a ? '✅' : p > 0 ? '🟡' : '⬜'} งวด ${i.no} ${i.detail || ''} ${fmt(a)}${p > 0 && p < a ? ` (จ่ายแล้ว ${fmt(p)})` : ''}${i.due && p < a ? ' · ครบ ' + i.due : ''}` }).join('\n')
  }).join('\n\n')
}
function docsMessage(c, publicBase) {
  const docs = db.prepare('SELECT type,no,date,total,status FROM sales_docs WHERE customer=? ORDER BY id DESC LIMIT 10').all(c.name)
  const files = housesOfCustomer(c).flatMap((h) => db.prepare('SELECT name FROM files WHERE house_code=? ORDER BY id DESC LIMIT 5').all(h.code).map((f) => `${h.code}: ${f.name}`))
  let t = docs.length ? '📄 เอกสารของคุณ:\n' + docs.map((d) => `• ${d.type} ${d.no} ${d.date} ${fmt(d.total)} บาท (${d.status})`).join('\n') : '📄 ยังไม่มีเอกสารขายในระบบค่ะ'
  if (files.length) t += '\n\n📁 ไฟล์บ้าน:\n' + files.map((f) => '• ' + f).join('\n')
  const base = publicBase?.()
  if (base && c.portal_token) t += `\n\n🔗 ดูทุกอย่างของบ้านคุณได้ที่\n${base}/portal/${c.portal_token}`
  return t
}
function helpMessage(c) {
  return `สวัสดีค่ะคุณ${c.name.replace(/^(นาย|นาง|นางสาว|คุณ)\s*/, '')} 🙏 PPSD พร้อมดูแลค่ะ\n\nพิมพ์ได้เลย:\n• ความคืบหน้า — ดูว่าบ้านไปถึงไหนแล้ว (+รูปล่าสุด)\n• งวด — งวดเงินและยอดที่ชำระแล้ว\n• เอกสาร — สัญญา/ใบเสร็จ/ไฟล์บ้าน\n• แจ้งซ่อม ห้องน้ำรั่ว — แจ้งปัญหา (ส่งรูปได้) ได้เลขเคส ติดตามได้\n• เคส — สถานะเรื่องที่แจ้งไว้\n• ประกัน — รายการรับประกันและวันหมด\n• บอกต่อ — รหัสแนะนำเพื่อน\n• ติดต่อ — เบอร์/ไลน์ทีมงาน\nหรือพิมพ์ข้อความอะไรก็ได้ ทีมงานจะได้รับและติดต่อกลับค่ะ`
}
function photosOf(house, n = 3) {
  const imgs = db.prepare('SELECT images FROM qc_inspections WHERE house_code=? AND images IS NOT NULL ORDER BY id DESC LIMIT 5').all(house.code).flatMap((r) => jparse(r.images) || [])
  return imgs.filter((x) => /^https?:/.test(x)).slice(0, n) // LINE รับเฉพาะ URL สาธารณะ — รูป data URL ดูได้ในพอร์ทัล
}

// ---- เคสแจ้งซ่อม (after-service) ----
export const CASE_OPEN = (s) => s !== 'แก้ไขแล้ว' && s !== 'ปิดเคส' && s !== 'ยกเลิก'
export function caseRow(i) {
  if (!i) return i
  const h = i.house_code ? db.prepare('SELECT name, manager FROM houses WHERE code=?').get(i.house_code) : null
  const c = i.customer_id ? db.prepare('SELECT name, line_uid FROM customers WHERE id=?').get(i.customer_id) : null
  const open = CASE_OPEN(i.status)
  const overdue = open && i.sla_due && i.sla_due < nowTS()
  const hours = i.created_at ? Math.round((new Date((i.resolved_at || nowTS()).replace(' ', 'T')) - new Date(i.created_at.replace(' ', 'T'))) / 3600000) : null
  return { ...i, house: h?.name || '', house_manager: h?.manager || '', customer: c?.name || '', customer_line: !!c?.line_uid, open, sla_overdue: !!overdue, hours_open: hours, log: jparse(i.log) || [] }
}
export function createCase(d, { house_code, customer_id, title, note, source, by, photo, priority, category }) {
  const house = house_code ? db.prepare('SELECT * FROM houses WHERE code=?').get(house_code) : null
  const seq = d.nextSeq('case', () => db.prepare("SELECT COUNT(*) c FROM issues WHERE case_no IS NOT NULL").get().c)
  const caseNo = `CS-${d.docYear()}-${String(seq).padStart(4, '0')}`
  const sla = Number(crmSettings().crm_sla_hours) || 24
  const due = new Date(Date.now() + sla * 3600000); const p = (n) => String(n).padStart(2, '0')
  const slaDue = `${due.getFullYear()}-${p(due.getMonth() + 1)}-${p(due.getDate())} ${p(due.getHours())}:${p(due.getMinutes())}:00`
  const info = db.prepare('INSERT INTO issues (house_code,title,note,by,date,priority,status,case_no,customer_id,source,sla_due,created_at,assignee,photo,category,log) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(house_code || '', title, note || '', by, d.todayTH(), priority || 'ทั่วไป', 'รอช่าง', caseNo, customer_id || null, source || 'web', slaDue, nowTS(), house?.manager || '', photo || null, category || 'แจ้งซ่อม', JSON.stringify([{ at: nowTS(), by, text: 'เปิดเคส' }]))
  const row = caseRow(db.prepare('SELECT * FROM issues WHERE id=?').get(info.lastInsertRowid))
  // แจ้งทีมงาน: โฟร์แมนประจำบ้าน + ผู้บริหารที่ผูก LINE
  const text = `🛠 เคสใหม่ ${caseNo} (${row.category})\nบ้าน: ${row.house || house_code || '-'} · ลูกค้า: ${row.customer || by}\nเรื่อง: ${title}${note ? '\n' + note : ''}${photo ? '\n📷 มีรูปแนบ (ดูในระบบ → ลูกค้า → เคสบริการ)' : ''}\n⏱ SLA ตอบกลับภายใน ${sla} ชม. (${slaDue.slice(0, 16)})\nผู้รับผิดชอบ: ${row.assignee || 'ยังไม่กำหนด'}`
  const uids = new Set(d.lineApprovers('').map((u) => u.line_uid))
  const mgrUid = row.assignee ? d.lineUidOfName(row.assignee) : null; if (mgrUid) uids.add(mgrUid)
  for (const uid of uids) d.linePush(uid, text)
  d.notifyChange(['issues', 'crm', 'notifications'])
  return row
}
export function updateCase(d, issue, b, user) {
  const before = issue.status
  const status = b.status || issue.status
  const log = jparse(issue.log) || []
  const changes = []
  if (b.status && b.status !== before) changes.push(`สถานะ ${before} → ${b.status}`)
  if (b.assignee != null && b.assignee !== issue.assignee) changes.push(`ผู้รับผิดชอบ → ${b.assignee || '-'}`)
  if (b.note_add) changes.push(b.note_add)
  if (changes.length) log.push({ at: nowTS(), by: user.name, text: changes.join(' · ') })
  const resolved = CASE_OPEN(before) && !CASE_OPEN(status) ? nowTS() : (CASE_OPEN(status) ? null : issue.resolved_at)
  db.prepare('UPDATE issues SET status=?, note=?, priority=?, assignee=?, log=?, resolved_at=?, title=? WHERE id=?')
    .run(status, b.note ?? issue.note, b.priority ?? issue.priority, b.assignee ?? issue.assignee, JSON.stringify(log), resolved, b.title ?? issue.title, issue.id)
  const row = caseRow(db.prepare('SELECT * FROM issues WHERE id=?').get(issue.id))
  // แจ้งลูกค้าทาง LINE เมื่อสถานะเปลี่ยน · ปิดเคสแล้วขอคะแนน
  const c = row.customer_id ? db.prepare('SELECT * FROM customers WHERE id=?').get(row.customer_id) : null
  if (c?.line_uid && row.case_no && b.status && b.status !== before) {
    if (!CASE_OPEN(status)) {
      d.linePush(c.line_uid, `✅ เคส ${row.case_no} "${row.title}" ดำเนินการเสร็จแล้วค่ะ${b.note_add ? '\n' + b.note_add : ''}\nขอบคุณที่แจ้งให้ทราบนะคะ`)
      askNps(d, c, row.house_code, 'case:' + row.id, `ช่วยให้คะแนนการแก้ไขเคส ${row.case_no} หน่อยค่ะ (0 = แย่มาก ถึง 10 = ประทับใจมาก) — ตอบเป็นตัวเลขได้เลย`)
    } else d.linePush(c.line_uid, `🔧 เคส ${row.case_no} "${row.title}" — สถานะ: ${status}${row.assignee ? ' · ผู้ดูแล ' + row.assignee : ''}${b.note_add ? '\n' + b.note_add : ''}`)
  }
  d.notifyChange(['issues', 'crm', 'notifications'])
  return row
}

// ---- ประกันงาน + นัดตรวจบ้าน ----
export function warrantyOf(house) {
  const start = parseAnyDate(house.deliver_date)
  const items = jparse(crmSettings().crm_warranty) || []
  if (!start || house.status !== 'ส่งมอบแล้ว' && house.status !== 'after-service') return { start: start, delivered: false, items: items.map((w) => ({ ...w, expires: null, days_left: null, active: false })) }
  const today = isoNow()
  return { start, delivered: true, items: items.map((w) => { const exp = addMonths(start, Math.round((Number(w.years) || 1) * 12)); const left = daysBetween(today, exp); return { ...w, expires: exp, days_left: left, active: left >= 0 } }) }
}
function warrantyMessage(c) {
  const hs = housesOfCustomer(c)
  if (!hs.length) return 'ยังไม่มีบ้านที่ผูกกับบัญชีของคุณค่ะ'
  return hs.map((h) => { const w = warrantyOf(h); if (!w.delivered) return `🏠 ${h.name}: ประกันเริ่มนับตั้งแต่วันส่งมอบค่ะ (ยังไม่ส่งมอบ)`; return `🏠 ${h.name} (ส่งมอบ ${thDate(w.start)})\n` + w.items.map((i) => `${i.active ? '🟢' : '⚪'} ${i.name} ${i.years} ปี · ${i.active ? `เหลือ ${i.days_left} วัน (ถึง ${thDate(i.expires)})` : 'หมดแล้ว'}`).join('\n') }).join('\n\n') + "\n\nพบปัญหาในประกัน พิมพ์ 'แจ้งซ่อม …' ได้เลยค่ะ"
}

// ---- NPS ----
export function askNps(d, c, houseCode, triggerKey, question) {
  if (!c?.line_uid) return false
  if (db.prepare('SELECT id FROM nps WHERE customer_id=? AND trigger_key=?').get(c.id, triggerKey)) return false
  const info = db.prepare('INSERT INTO nps (customer_id,house_code,trigger_key,asked_at,by_uid) VALUES (?,?,?,?,?)').run(c.id, houseCode || '', triggerKey, nowTS(), c.line_uid)
  d.setLineCtx(c.line_uid, { kind: 'nps', nps_id: info.lastInsertRowid, ttl: 3 * 24 * 60 * 60 * 1000 })
  d.linePush(c.line_uid, `⭐ ${question}`)
  return true
}
function recordNps(d, c, ctx, score) {
  db.prepare('UPDATE nps SET score=?, answered_at=? WHERE id=?').run(score, nowTS(), ctx.nps_id)
  const n = db.prepare('SELECT * FROM nps WHERE id=?').get(ctx.nps_id)
  if (score <= 6) {
    const text = `⚠ ลูกค้าให้คะแนนต่ำ ${score}/10 — ${c.name}${n.house_code ? ' (' + n.house_code + ')' : ''} · ${n.trigger_key}\nกรุณาโทรหาลูกค้าภายในวันนี้ค่ะ`
    for (const u of d.lineApprovers('')) d.linePush(u.line_uid, text)
  }
  d.setLineCtx(c.line_uid, { kind: 'nps_comment', nps_id: ctx.nps_id, ttl: 24 * 60 * 60 * 1000 })
  d.notifyChange(['crm', 'notifications'])
  return score >= 9 ? 'ขอบคุณมากค่ะ 🙏 ดีใจที่คุณประทับใจ ถ้าอยากแนะนำเพื่อน พิมพ์ "บอกต่อ" รับรหัสแนะนำได้เลยค่ะ\n(มีอะไรอยากบอกเพิ่ม พิมพ์ได้เลย หรือ "ข้าม")' : score >= 7 ? 'ขอบคุณค่ะ 🙏 มีอะไรที่เราทำให้ดีขึ้นได้ไหมคะ พิมพ์บอกได้เลย (หรือ "ข้าม")' : 'ขออภัยที่ทำให้ไม่ประทับใจค่ะ 🙏 ผู้บริหารจะติดต่อกลับภายในวันนี้ — เล่าให้ฟังหน่อยได้ไหมคะว่าเรื่องอะไร (หรือ "ข้าม")'
}

// ---- บอทฝั่งลูกค้า ----
export async function handleCustomerLineMessage(d, uid, c, text, replyToken) {
  const t = String(text || '').trim()
  const ctx = d.getLineCtx(uid)
  const reply = (m) => d.lineReply(replyToken, m)
  if (ctx?.kind === 'nps' && /^(10|[0-9])$/.test(t)) return reply(recordNps(d, c, ctx, Number(t)))
  if (ctx?.kind === 'nps_comment') {
    d.setLineCtx(uid, null)
    if (!/^(ข้าม|-|ไม่มี|skip)$/i.test(t)) { db.prepare('UPDATE nps SET comment=? WHERE id=?').run(t, ctx.nps_id); logContact(c.id, 'LINE', `ความเห็นหลังให้คะแนน: ${t}`, c.name); d.notifyChange(['crm']) }
    return reply('ขอบคุณค่ะ 🙏 ทีมงานรับทราบแล้ว')
  }
  if (ctx?.kind === 'ccase') {
    if (/^(ไม่มี|ไม่|ข้าม|no|ส่ง|ตกลง|ok|โอเค)$/i.test(t)) { d.setLineCtx(uid, null); return reply(finishCustomerCase(d, c, ctx, null)) }
    if (/^(ยกเลิก|cancel)$/i.test(t)) { d.setLineCtx(uid, null); return reply('ยกเลิกการแจ้งแล้วค่ะ') }
    d.setLineCtx(uid, { ...ctx, note: (ctx.note ? ctx.note + ' ' : '') + t })
    return reply("บันทึกเพิ่มแล้วค่ะ — ส่งรูปได้เลย หรือพิมพ์ 'ส่ง' เพื่อเปิดเคส")
  }
  if (/^(ช่วย|help|\?|คำสั่ง|เมนู|สวัสดี|หวัดดี|hi|hello)$/i.test(t)) return reply(helpMessage(c))
  if (/^(ความคืบหน้า|คืบหน้า|งาน|บ้าน|progress|สถานะ|ถึงไหนแล้ว|ไปถึงไหน)/i.test(t)) {
    const houses = housesOfCustomer(c)
    const msgs = progressMessages(c, houses)
    const pics = houses.flatMap((h) => photosOf(h, 2)).slice(0, 3).map((u) => ({ type: 'image', originalContentUrl: u, previewImageUrl: u }))
    logContact(c.id, 'LINE', 'ลูกค้าขอดูความคืบหน้า', c.name)
    return reply([...msgs, ...pics].slice(0, 5))
  }
  if (/^(งวด|ค่างวด|ยอด|จ่าย|ชำระ|เงิน)/i.test(t)) return reply(installmentMessage(c))
  if (/^(เอกสาร|สัญญา|ใบเสร็จ|ไฟล์|แบบบ้าน|ลิงก์|portal)/i.test(t)) return reply(docsMessage(c, d.publicBaseUrl))
  if (/^(ประกัน|รับประกัน|warranty)/i.test(t)) return reply(warrantyMessage(c))
  if (/^(บอกต่อ|แนะนำ|referral|ref)/i.test(t)) return reply(`🤝 รหัสแนะนำของคุณคือ ${c.referral_code}\nส่งต่อข้อความนี้ให้เพื่อนได้เลยค่ะ:\n"สร้างบ้านกับ PPSD ใช้รหัสแนะนำ ${c.referral_code} ตอนติดต่อ จะได้สิทธิพิเศษสำหรับผู้แนะนำและผู้ถูกแนะนำค่ะ"\nเพื่อนติดต่อมาแล้วระบบจะบันทึกให้คุณอัตโนมัติ`)
  if (/^(ติดต่อ|โทร|เบอร์|ทีมงาน|contact)/i.test(t)) {
    const s = crmSettings(); const hs = housesOfCustomer(c)
    const mgr = hs.map((h) => h.manager).filter(Boolean)
    return reply(`📞 ติดต่อทีมงาน PPSD\n${s.crm_contact_phone ? 'โทร ' + s.crm_contact_phone + '\n' : ''}${s.crm_contact_line ? 'LINE ' + s.crm_contact_line + '\n' : ''}${mgr.length ? 'ผู้ดูแลบ้านของคุณ: ' + [...new Set(mgr)].join(', ') + '\n' : ''}หรือพิมพ์ข้อความไว้ที่นี่ ทีมงานจะติดต่อกลับค่ะ`)
  }
  if (/^(เคส|สถานะซ่อม|เรื่องที่แจ้ง|ติดตาม)/i.test(t)) {
    const rows = db.prepare('SELECT * FROM issues WHERE customer_id=? ORDER BY id DESC LIMIT 8').all(c.id).map(caseRow)
    if (!rows.length) return reply("ยังไม่มีเรื่องที่แจ้งไว้ค่ะ — พิมพ์ 'แจ้งซ่อม …' ได้เลย")
    return reply('🛠 เรื่องที่แจ้งไว้:\n' + rows.map((r) => `${r.open ? '🟡' : '✅'} ${r.case_no || '#' + r.id} ${r.title} — ${r.status}${r.assignee ? ' · ' + r.assignee : ''} (${r.date})`).join('\n'))
  }
  const cm = t.match(/^(?:แจ้งซ่อม|แจ้งปัญหา|ซ่อม|แจ้ง|ปัญหา|เสีย|รั่ว|พัง|ชำรุด|ร้าว|น้ำรั่ว)\s*[:：]?\s*(.*)$/i) || (/(รั่ว|พัง|ชำรุด|เสีย|ร้าว|ซ่อม|ไม่ติด|ตัน|ไฟดับ|น้ำไม่ไหล)/.test(t) ? [t, t] : null)
  if (cm) {
    const houses = housesOfCustomer(c)
    const title = (cm[1] || t).trim() || t
    let house = houses.length === 1 ? houses[0] : houses.find((h) => t.includes(h.name) || t.includes(h.code)) || null
    if (!house && houses.length > 1) { d.setLineCtx(uid, { kind: 'ccase_house', title, ids: houses.map((h) => h.code) }); return reply(`แจ้งเรื่อง "${title}" ของบ้านหลังไหนคะ? ตอบตัวเลข\n${houses.map((h, i) => `${i + 1}. ${h.code} ${h.name}`).join('\n')}`) }
    d.setLineCtx(uid, { kind: 'ccase', title, house_code: house?.code || '', note: '' })
    return reply(`รับเรื่อง "${title}"${house ? ` (บ้าน ${house.name})` : ''} ค่ะ 📷 ส่งรูปปัญหามาได้เลย หรือพิมพ์รายละเอียดเพิ่ม · พิมพ์ 'ส่ง' เพื่อเปิดเคสทันที`)
  }
  if (ctx?.kind === 'ccase_house' && /^\d$/.test(t)) {
    const code = ctx.ids[Number(t) - 1]
    if (!code) return reply(`ตอบเป็นตัวเลข 1-${ctx.ids.length} ค่ะ`)
    d.setLineCtx(uid, { kind: 'ccase', title: ctx.title, house_code: code, note: '' })
    return reply(`รับเรื่อง "${ctx.title}" ของบ้าน ${code} ค่ะ 📷 ส่งรูปได้เลย หรือพิมพ์ 'ส่ง' เพื่อเปิดเคส`)
  }
  // ข้อความทั่วไป → ลง timeline + แจ้งโฟร์แมน/ผู้ดูแล + ผู้บริหาร
  logContact(c.id, 'LINE', `ลูกค้าส่งข้อความ: ${t}`, c.name)
  const hs = housesOfCustomer(c)
  const uids = new Set(d.lineApprovers('').map((u) => u.line_uid))
  for (const h of hs) { const m = h.manager ? d.lineUidOfName(h.manager) : null; if (m) uids.add(m) }
  for (const x of uids) d.linePush(x, `💬 ลูกค้า ${c.name}${hs[0] ? ' (' + hs[0].name + ')' : ''} ส่งข้อความ:\n"${t}"\n→ ตอบกลับได้ที่ ERP → ลูกค้า → ${c.name} → ส่งข้อความ`)
  d.notifyChange(['crm', 'notifications'])
  return reply(`รับข้อความแล้วค่ะ 🙏 ทีมงานจะติดต่อกลับโดยเร็ว\n(พิมพ์ 'ช่วย' ดูสิ่งที่ถามได้)`)
}
function finishCustomerCase(d, c, ctx, photo) {
  const row = createCase(d, { house_code: ctx.house_code, customer_id: c.id, title: ctx.title, note: ctx.note || '', source: 'line', by: c.name, photo })
  logContact(c.id, 'LINE', `แจ้งซ่อม ${row.case_no}: ${ctx.title}`, c.name, ctx.house_code)
  return `✅ เปิดเคส ${row.case_no} "${ctx.title}" แล้วค่ะ\nทีมงานจะติดต่อกลับภายใน ${crmSettings().crm_sla_hours} ชม.${row.assignee ? ' · ผู้ดูแล ' + row.assignee : ''}\nพิมพ์ 'เคส' เพื่อดูสถานะได้ตลอดค่ะ`
}
export async function handleCustomerLineImage(d, uid, c, img, replyToken) {
  const ctx = d.getLineCtx(uid)
  if (ctx?.kind === 'ccase') { d.setLineCtx(uid, null); return d.lineReply(replyToken, '📷 รับรูปแล้วค่ะ\n' + finishCustomerCase(d, c, ctx, img)) }
  db.prepare('INSERT INTO customer_contacts (customer_id,date,channel,note,by,done) VALUES (?,?,?,?,?,1)').run(c.id, thDate(isoNow()), 'LINE', 'ลูกค้าส่งรูปมา', c.name)
  d.setLineCtx(uid, { kind: 'ccase', title: 'ลูกค้าส่งรูปมา', house_code: housesOfCustomer(c)[0]?.code || '', note: '', photo: img })
  return d.lineReply(replyToken, "รับรูปแล้วค่ะ 📷 เป็นเรื่องอะไรคะ? พิมพ์บอกสั้นๆ (เช่น 'ผนังร้าว') แล้วพิมพ์ 'ส่ง' เพื่อเปิดเคส หรือ 'ยกเลิก'")
}

// ---- อัตโนมัติตามจังหวะ (เรียกทุก 10 นาที · force = ไม่สนเวลา สำหรับทดสอบ/กดเอง) ----
export function runAutomations(d, force = false) {
  const s = crmSettings()
  const out = { weekly: 0, inst: 0, delivery: 0, anniv: 0, bday: 0, warranty: 0, checkup: 0 }
  if (!d.hasLineToken() && !force) return out
  const now = new Date(); const hour = now.getHours(); const today = isoNow()
  const atHour = force || hour >= (Number(s.crm_hour) || 9)
  // ครั้งแรก: บ้านที่ส่งมอบไปแล้ว/ครบรอบเก่า → ทำเครื่องหมายว่าส่งแล้ว ไม่ยิงย้อนหลัง
  if (!getS('crm_seeded', '')) {
    for (const h of db.prepare("SELECT code, deliver_date FROM houses WHERE status IN ('ส่งมอบแล้ว','after-service')").all()) { sentOnce('delivered:' + h.code); for (const m of [6, 12]) sentOnce(`checkup:${h.code}:${m}`) }
    setS('crm_seeded', '1')
  }
  const customersWithLine = db.prepare('SELECT * FROM customers WHERE line_uid IS NOT NULL').all()
  // 1) ความคืบหน้ารายสัปดาห์
  if (s.crm_auto_weekly === '1' && atHour && (force || now.getDay() === Number(s.crm_weekly_dow)) && sentOnce('weekly:' + today)) {
    for (const c of customersWithLine) {
      const hs = housesOfCustomer(c).filter((h) => h.status !== 'ส่งมอบแล้ว' && h.status !== 'after-service')
      if (!hs.length) continue
      const pics = hs.flatMap((h) => photosOf(h, 2)).slice(0, 2).map((u) => ({ type: 'image', originalContentUrl: u, previewImageUrl: u }))
      d.linePush(c.line_uid, ['📬 อัปเดตประจำสัปดาห์จาก PPSD', ...progressMessages(c, hs).slice(0, 2), ...pics].slice(0, 5)); out.weekly++
    }
  }
  // 2) เตือนงวดก่อนครบกำหนด N วัน
  if (s.crm_auto_inst === '1' && atHour) {
    const until = addDays(today, Number(s.crm_inst_days) || 7)
    for (const i of db.prepare("SELECT * FROM installments WHERE COALESCE(side,'customer')='customer' AND due_iso IS NOT NULL AND due_iso BETWEEN ? AND ? AND COALESCE(paid,0) < amount").all(today, until)) {
      const h = db.prepare('SELECT * FROM houses WHERE code=?').get(i.house_code); if (!h) continue
      const c = customersWithLine.find((x) => x.id === h.customer_id || x.name === h.customer); if (!c) continue
      if (!sentOnce('inst:' + i.id)) continue
      d.linePush(c.line_uid, `💰 แจ้งเตือนงวดเงิน บ้าน ${h.name}\nงวด ${i.no} ${i.detail || ''} ยอด ${fmt((Number(i.amount) || 0) - (Number(i.paid) || 0))} บาท\nครบกำหนด ${thDate(i.due_iso)} (อีก ${daysBetween(today, i.due_iso)} วัน)\nชำระแล้วส่งสลิปมาที่นี่ได้เลยค่ะ ขอบคุณค่ะ 🙏`); out.inst++
    }
  }
  // 3) ส่งมอบ → ขอบคุณ + ประกัน + NPS
  if (s.crm_auto_delivery === '1') {
    for (const h of db.prepare("SELECT * FROM houses WHERE status IN ('ส่งมอบแล้ว','after-service')").all()) {
      if (!sentOnce('delivered:' + h.code)) continue
      const c = customersWithLine.find((x) => x.id === h.customer_id || x.name === h.customer); if (!c) continue
      d.linePush(c.line_uid, [`🎉 ยินดีด้วยกับบ้านใหม่ค่ะ คุณ${c.name.replace(/^(นาย|นาง|นางสาว|คุณ)\s*/, '')}\nขอบคุณที่ไว้วางใจ PPSD สร้างบ้าน ${h.name} ค่ะ`, warrantyMessage(c)])
      askNps(d, c, h.code, 'delivery:' + h.code, 'โดยรวมแล้วคุณพอใจกับบ้านและการทำงานของ PPSD แค่ไหนคะ? (0 = ไม่พอใจเลย ถึง 10 = ประทับใจมาก) ตอบเป็นตัวเลขได้เลยค่ะ'); out.delivery++
    }
  }
  // 4) ครบรอบเข้าบ้าน / วันเกิด
  if (s.crm_auto_anniv === '1' && atHour) {
    const mmdd = today.slice(5)
    for (const h of db.prepare("SELECT * FROM houses WHERE deliver_date IS NOT NULL AND deliver_date<>''").all()) {
      const dd = parseAnyDate(h.deliver_date); if (!dd || dd.slice(5) !== mmdd || dd.slice(0, 4) === today.slice(0, 4)) continue
      const c = customersWithLine.find((x) => x.id === h.customer_id || x.name === h.customer); if (!c || !sentOnce(`anniv:${h.code}:${today.slice(0, 4)}`)) continue
      d.linePush(c.line_uid, `🎂 ครบรอบ ${Number(today.slice(0, 4)) - Number(dd.slice(0, 4))} ปี ที่ได้อยู่บ้าน ${h.name} แล้วนะคะ 🏡\nPPSD ขอให้ทุกวันในบ้านมีความสุขค่ะ — มีอะไรให้ดูแล พิมพ์ 'แจ้งซ่อม' ได้เสมอ`); out.anniv++
    }
    for (const c of customersWithLine) { if (c.birthday && String(c.birthday).slice(5) === mmdd && sentOnce(`bday:${c.id}:${today.slice(0, 4)}`)) { d.linePush(c.line_uid, `🎉 สุขสันต์วันเกิดค่ะ คุณ${c.name.replace(/^(นาย|นาง|นางสาว|คุณ)\s*/, '')} 🎂\nขอให้มีความสุขมากๆ จากทีมงาน PPSD ค่ะ`); out.bday++ } }
  }
  // 5) ประกันใกล้หมด (30 วัน) → แจ้งลูกค้า + กระดิ่ง
  if (s.crm_auto_warranty === '1' && atHour) {
    for (const h of db.prepare("SELECT * FROM houses WHERE status IN ('ส่งมอบแล้ว','after-service')").all()) {
      const w = warrantyOf(h); if (!w.delivered) continue
      for (const it of w.items) {
        if (it.days_left == null || it.days_left > 30 || it.days_left < 0 || !sentOnce(`warranty:${h.code}:${it.name}`)) continue
        const c = customersWithLine.find((x) => x.id === h.customer_id || x.name === h.customer)
        if (c) d.linePush(c.line_uid, `🛡 ประกัน "${it.name}" ของบ้าน ${h.name} จะหมดในอีก ${it.days_left} วัน (${thDate(it.expires)})\nหากพบปัญหาในส่วนนี้ พิมพ์ 'แจ้งซ่อม …' มาได้เลยก่อนหมดประกันนะคะ`)
        out.warranty++
      }
    }
  }
  // 6) นัดตรวจบ้านฟรี 6/12 เดือนหลังส่งมอบ → เปิดเคสให้โฟร์แมน + แจ้งลูกค้า
  if (s.crm_auto_checkup === '1') {
    const months = String(s.crm_checkups || '6,12').split(',').map((x) => Number(x.trim())).filter(Boolean)
    for (const h of db.prepare("SELECT * FROM houses WHERE status IN ('ส่งมอบแล้ว','after-service')").all()) {
      const dd = parseAnyDate(h.deliver_date); if (!dd) continue
      for (const m of months) {
        const dueAt = addMonths(dd, m)
        if (daysBetween(today, dueAt) > 14 || !sentOnce(`checkup:${h.code}:${m}`)) continue // ถึงช่วง 2 สัปดาห์ก่อนครบ → นัด
        const c = db.prepare('SELECT * FROM customers WHERE id=? OR name=?').get(h.customer_id || 0, h.customer || '')
        createCase(d, { house_code: h.code, customer_id: c?.id, title: `นัดตรวจบ้านฟรีหลังส่งมอบ ${m} เดือน`, note: `ครบ ${m} เดือนวันที่ ${thDate(dueAt)} — โทรนัดลูกค้าเข้าตรวจสภาพบ้าน`, source: 'auto', by: 'ระบบ', category: 'ตรวจบ้านหลังส่งมอบ' })
        if (c?.line_uid) d.linePush(c.line_uid, `🏡 บ้าน ${h.name} ใกล้ครบ ${m} เดือนหลังส่งมอบแล้วค่ะ\nPPSD จะโทรนัดเข้าตรวจสภาพบ้านให้ฟรีตามโปรแกรมดูแลหลังการขาย — สะดวกวันไหนพิมพ์บอกไว้ได้เลยค่ะ`)
        out.checkup++
      }
    }
  }
  return out
}

// เมื่อบันทึกใบตรวจ QC: ถ้าเฟสนั้นผ่านครบทุกใบแล้ว → แจ้งลูกค้า (+ขอคะแนนที่เฟสที่ตั้งไว้)
export function onQcSaved(d, row) {
  try {
    if (!on('crm_auto_qc') || !row?.house_code || row.status !== 'ผ่าน' || !row.phase) return
    const prog = qcProgressOf(row.house_code)
    const ph = prog.phases.find((p) => p.id === String(row.phase))
    if (!ph?.passed || !sentOnce(`qc:${row.house_code}:${row.phase}`)) return
    const h = db.prepare('SELECT * FROM houses WHERE code=?').get(row.house_code)
    const c = h && db.prepare('SELECT * FROM customers WHERE line_uid IS NOT NULL AND (id=? OR name=?)').get(h.customer_id || 0, h.customer || '')
    if (!c) return
    const pct = Math.round((prog.done / prog.total) * 100)
    d.linePush(c.line_uid, `✅ บ้าน ${h.name}: ผ่านการตรวจคุณภาพขั้นตอน "${ph.name}" แล้วค่ะ\nความคืบหน้ารวม ${pct}% (${prog.done}/${prog.total} ขั้นตอน)${prog.current ? '\nขั้นตอนถัดไป: ' + prog.current.name : ''}\nพิมพ์ 'ความคืบหน้า' เพื่อดูรายละเอียดค่ะ`)
    logContact(c.id, 'ระบบ', `แจ้งลูกค้า: ผ่าน QC เฟส ${ph.id} ${ph.name}`, 'ระบบ', h.code)
    if (String(crmSettings().crm_nps_phases).split(',').map((x) => x.trim()).includes(String(row.phase))) askNps(d, c, h.code, `qc:${h.code}:${row.phase}`, `ถึงตอนนี้คุณพอใจกับการทำงานของทีม PPSD แค่ไหนคะ? (0 = ไม่พอใจ ถึง 10 = ประทับใจมาก) ตอบเป็นตัวเลขได้เลยค่ะ`)
  } catch (e) { console.error('onQcSaved:', e.message) }
}

// กระดิ่ง: เคสเกิน SLA · คะแนนต่ำ 7 วันล่าสุด
export function serviceNotifications(user) {
  const out = []
  const mgr = isManager(user) || user.role === 'admin' || user.role === 'accounting'
  const rows = db.prepare("SELECT * FROM issues WHERE case_no IS NOT NULL AND status NOT IN ('แก้ไขแล้ว','ปิดเคส','ยกเลิก') ORDER BY id DESC").all().map(caseRow)
  for (const r of rows) {
    if (!(mgr || r.assignee === user.name)) continue
    if (r.sla_overdue) out.push({ kind: 'case-sla', icon: 'danger', title: `⛔ เคส ${r.case_no} เกิน SLA — ${r.title}`, sub: `${r.house || ''} · ${r.customer || ''} · เปิดมา ${r.hours_open} ชม. · ${r.assignee || 'ยังไม่มีผู้รับผิดชอบ'}`, page: 'customers' })
    else if (r.status === 'รอช่าง') out.push({ kind: 'case-new', icon: 'warn', title: `🛠 เคสใหม่ ${r.case_no} — ${r.title}`, sub: `${r.house || ''} · ${r.customer || ''} · ตอบกลับภายใน ${String(r.sla_due || '').slice(0, 16)}`, page: 'customers' })
  }
  if (mgr) for (const n of db.prepare("SELECT n.*, c.name cname FROM nps n JOIN customers c ON c.id=n.customer_id WHERE n.score IS NOT NULL AND n.score<=6 AND n.answered_at >= ? ORDER BY n.id DESC LIMIT 5").all(addDays(isoNow(), -7) + ' 00:00:00'))
    out.push({ kind: 'nps-low', icon: 'danger', title: `⚠ คะแนนต่ำ ${n.score}/10 — ${n.cname}`, sub: `${n.house_code || ''} · ${n.trigger_key} · ${n.comment || 'ไม่มีความเห็น'} — โทรหาลูกค้าวันนี้`, page: 'customers' })
  return out.slice(0, 12)
}

// ---- พอร์ทัลลูกค้า (สาธารณะด้วยโทเคนส่วนตัว) ----
export function portalData(c) {
  const s = crmSettings()
  const houses = housesOfCustomer(c).map((h) => {
    const inst = db.prepare("SELECT no, detail, amount, COALESCE(paid,0) paid, due, status FROM installments WHERE house_code=? AND COALESCE(side,'customer')='customer' ORDER BY no").all(h.code)
    const paid = inst.reduce((x, i) => x + (Number(i.paid) || 0), 0), total = inst.reduce((x, i) => x + (Number(i.amount) || 0), 0)
    const cases = db.prepare('SELECT case_no, title, status, date, assignee FROM issues WHERE house_code=? ORDER BY id DESC LIMIT 20').all(h.code).map((i) => ({ ...i, open: CASE_OPEN(i.status) }))
    const photos = db.prepare('SELECT images FROM qc_inspections WHERE house_code=? AND images IS NOT NULL ORDER BY id DESC LIMIT 8').all(h.code).flatMap((r) => jparse(r.images) || []).slice(0, 8)
    const lastQc = db.prepare('SELECT date, type, status FROM qc_inspections WHERE house_code=? ORDER BY id DESC LIMIT 1').get(h.code) || null
    return { code: h.code, name: h.name, project: h.project || '', status: h.status, pct: Number(h.pct) || 0, deliver_date: h.deliver_date || '', manager: h.manager || '', photo: h.photo || null, photos, qc: qcProgressOf(h.code), installments: inst, inst_paid: paid, inst_total: total, next_due: inst.find((i) => (Number(i.paid) || 0) < (Number(i.amount) || 0)) || null, cases, warranty: warrantyOf(h), last_qc: lastQc }
  })
  const docs = db.prepare('SELECT type,no,date,total,status FROM sales_docs WHERE customer=? ORDER BY id DESC LIMIT 30').all(c.name)
  let company = 'PPSD'
  try { company = getS('company_name', '') || company } catch { /* ignore */ }
  return { customer: { name: c.name, code: c.code || '', referral_code: c.referral_code || '' }, houses, docs, contact: { phone: s.crm_contact_phone, line: s.crm_contact_line }, company }
}
export function registerCrmPublic(api, getDeps) {
  const byToken = (t) => (/^[A-Za-z0-9]{16,40}$/.test(String(t || '')) ? db.prepare('SELECT * FROM customers WHERE portal_token=?').get(t) : null)
  api.get('/pub/portal/:token', (req, res) => { const c = byToken(req.params.token); if (!c) return res.status(404).json({ error: 'ลิงก์ไม่ถูกต้องหรือหมดอายุ' }); res.setHeader('Cache-Control', 'no-store'); res.json(portalData(c)) })
  api.post('/pub/portal/:token/case', (req, res) => {
    const c = byToken(req.params.token); if (!c) return res.status(404).json({ error: 'ลิงก์ไม่ถูกต้อง' })
    const b = req.body || {}; const title = String(b.title || '').trim().slice(0, 200)
    if (!title) return res.status(400).json({ error: 'ระบุเรื่องที่ต้องการแจ้ง' })
    const hs = housesOfCustomer(c)
    const hc = hs.find((h) => h.code === b.house_code)?.code || hs[0]?.code || ''
    const row = createCase(getDeps(), { house_code: hc, customer_id: c.id, title, note: String(b.note || '').slice(0, 1000), source: 'portal', by: c.name })
    logContact(c.id, 'พอร์ทัล', `แจ้งซ่อม ${row.case_no}: ${title}`, c.name, hc)
    res.status(201).json({ case_no: row.case_no, sla_hours: crmSettings().crm_sla_hours })
  })
}
export function registerCrmService(api, d) {
  const { canWrite, audit, notifyChange } = d
  hooks.warrantyOf = warrantyOf; hooks.caseRow = caseRow
  const mgrOrOffice = (u) => !!u && (isManager(u) || u.role === 'admin' || u.role === 'accounting')
  // LINE ลูกค้า
  api.post('/crm/customers/:id/line-code', canWrite, (req, res) => {
    const c = db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id); if (!c) return res.status(404).json({ error: 'ไม่พบลูกค้า' })
    res.json({ ...customerLineCode(c.id), linked: !!c.line_uid, name: c.name })
  })
  api.delete('/crm/customers/:id/line', canWrite, (req, res) => { db.prepare('UPDATE customers SET line_uid=NULL WHERE id=?').run(req.params.id); res.json({ ok: true }) })
  api.post('/crm/customers/:id/push', canWrite, async (req, res) => {
    const c = db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id); if (!c) return res.status(404).json({ error: 'ไม่พบลูกค้า' })
    if (!c.line_uid) return res.status(400).json({ error: 'ลูกค้ายังไม่ได้ผูก LINE' })
    const text = String(req.body?.text || '').trim(); if (!text) return res.status(400).json({ error: 'พิมพ์ข้อความ' })
    const ok = await d.linePush(c.line_uid, text)
    logContact(c.id, 'LINE', `ส่งถึงลูกค้า: ${text}`, req.user.name)
    audit(req, 'ส่ง LINE ถึงลูกค้า', c.name); res.json({ ok })
  })
  api.post('/crm/customers/:id/send-progress', canWrite, async (req, res) => {
    const c = db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id); if (!c) return res.status(404).json({ error: 'ไม่พบลูกค้า' })
    if (!c.line_uid) return res.status(400).json({ error: 'ลูกค้ายังไม่ได้ผูก LINE' })
    const msgs = progressMessages(c)
    const ok = await d.linePush(c.line_uid, msgs)
    logContact(c.id, 'LINE', 'ส่งความคืบหน้าให้ลูกค้า', req.user.name)
    res.json({ ok, messages: msgs })
  })
  api.get('/crm/customers/:id/preview-progress', (req, res) => { const c = db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id); if (!c) return res.status(404).json({ error: 'ไม่พบลูกค้า' }); res.json({ messages: progressMessages(c) }) })
  // เคสบริการ
  api.get('/crm/cases', (req, res) => {
    const rows = db.prepare('SELECT * FROM issues ORDER BY id DESC LIMIT 500').all().map(caseRow)
    res.json(mgrOrOffice(req.user) || req.user.role === 'site' ? rows : rows.filter((r) => r.by === req.user.name))
  })
  api.post('/crm/cases', canWrite, (req, res) => {
    const b = req.body || {}
    if (!String(b.title || '').trim()) return res.status(400).json({ error: 'กรอกเรื่องที่แจ้ง' })
    const h = b.house_code ? db.prepare('SELECT * FROM houses WHERE code=?').get(b.house_code) : null
    const cid = b.customer_id || (h ? h.customer_id : null)
    const row = createCase(d, { house_code: b.house_code || '', customer_id: cid, title: String(b.title).trim(), note: b.note || '', source: 'web', by: req.user.name, photo: b.photo || null, priority: b.priority, category: b.category })
    const c = cid ? db.prepare('SELECT * FROM customers WHERE id=?').get(cid) : null
    if (c?.line_uid && b.notify_customer !== false) d.linePush(c.line_uid, `🛠 PPSD เปิดเคส ${row.case_no} "${row.title}" ให้บ้าน ${row.house || ''} แล้วค่ะ ทีมงานจะติดต่อกลับภายใน ${crmSettings().crm_sla_hours} ชม. — พิมพ์ 'เคส' เพื่อติดตามได้ค่ะ`)
    audit(req, 'เปิดเคสบริการ', `${row.case_no} ${row.title}`)
    res.status(201).json(row)
  })
  const putCase = (req, res) => {
    const i = db.prepare('SELECT * FROM issues WHERE id=?').get(req.params.id); if (!i) return res.status(404).json({ error: 'ไม่พบเคส' })
    const row = updateCase(d, i, req.body || {}, req.user)
    audit(req, 'อัปเดตเคส', `${row.case_no || '#' + row.id} → ${row.status}`)
    res.json(row)
  }
  api.put('/crm/cases/:id', canWrite, putCase)
  api.put('/issues/:id', canWrite, putCase)
  api.get('/crm/warranty', (_req, res) => res.json(db.prepare("SELECT * FROM houses WHERE COALESCE(kind,'')<>'office' AND deliver_date IS NOT NULL AND deliver_date<>'' ORDER BY id DESC").all().map((h) => ({ code: h.code, name: h.name, customer: h.customer, status: h.status, deliver_date: h.deliver_date, ...warrantyOf(h) }))))
  api.get('/crm/houses/:code/warranty', (req, res) => { const h = db.prepare('SELECT * FROM houses WHERE code=?').get(req.params.code); if (!h) return res.status(404).json({ error: 'ไม่พบบ้าน' }); res.json(warrantyOf(h)) })
  // NPS
  api.get('/crm/nps', (req, res) => {
    if (!mgrOrOffice(req.user)) return res.status(403).json({ error: 'ดูได้เฉพาะผู้บริหาร/บัญชี' })
    const rows = db.prepare('SELECT n.*, c.name customer FROM nps n LEFT JOIN customers c ON c.id=n.customer_id ORDER BY n.id DESC LIMIT 300').all()
    const answered = rows.filter((r) => r.score != null)
    const promoters = answered.filter((r) => r.score >= 9).length, detractors = answered.filter((r) => r.score <= 6).length
    res.json({ rows, summary: { asked: rows.length, answered: answered.length, avg: answered.length ? Math.round((answered.reduce((s, r) => s + r.score, 0) / answered.length) * 10) / 10 : null, nps: answered.length ? Math.round(((promoters - detractors) / answered.length) * 100) : null, promoters, detractors } })
  })
  api.post('/crm/customers/:id/ask-nps', canWrite, (req, res) => {
    const c = db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id); if (!c) return res.status(404).json({ error: 'ไม่พบลูกค้า' })
    if (!c.line_uid) return res.status(400).json({ error: 'ลูกค้ายังไม่ได้ผูก LINE' })
    const ok = askNps(d, c, req.body?.house_code || '', 'manual:' + Date.now(), req.body?.question || 'คุณพอใจกับการบริการของ PPSD แค่ไหนคะ? (0 = ไม่พอใจ ถึง 10 = ประทับใจมาก) ตอบเป็นตัวเลขได้เลยค่ะ')
    res.json({ ok })
  })
  // ตั้งค่า + รันอัตโนมัติ
  api.get('/crm/settings', (_req, res) => res.json(crmSettings()))
  api.put('/crm/settings', canWrite, (req, res) => {
    if (!mgrOrOffice(req.user)) return res.status(403).json({ error: 'ตั้งค่าได้เฉพาะผู้บริหาร/บัญชี' })
    for (const k of Object.keys(CRM_DEFAULTS)) if (req.body?.[k] != null) setS(k, typeof req.body[k] === 'object' ? JSON.stringify(req.body[k]) : String(req.body[k]))
    audit(req, 'ตั้งค่า CRM อัตโนมัติ', Object.keys(req.body || {}).join(','))
    res.json(crmSettings())
  })
  api.post('/crm/run-automations', canWrite, (req, res) => { if (!mgrOrOffice(req.user)) return res.status(403).json({ error: 'เฉพาะผู้บริหาร/บัญชี' }); res.json(runAutomations(d, !!req.body?.force)) })
  api.get('/crm/service-summary', (_req, res) => {
    const rows = db.prepare('SELECT * FROM issues WHERE case_no IS NOT NULL').all().map(caseRow)
    res.json({ open: rows.filter((r) => r.open).length, overdue: rows.filter((r) => r.sla_overdue).length, resolved_30d: rows.filter((r) => r.resolved_at && r.resolved_at >= addDays(isoNow(), -30)).length, avg_hours: (() => { const x = rows.filter((r) => r.resolved_at && r.hours_open != null).map((r) => r.hours_open); return x.length ? Math.round(x.reduce((s, v) => s + v, 0) / x.length) : null })() })
  })
  notifyChange && setInterval(() => { try { runAutomations(d, false) } catch (e) { console.error('crm automations:', e.message) } }, 10 * 60 * 1000)
}
