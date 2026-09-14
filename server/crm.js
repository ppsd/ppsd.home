// ===== CRM: ลูกค้ารวมจุดเดียว (360) · Lead/Pipeline · บันทึกการติดต่อ · เมตริกผู้บริหาร =====
// แยกออกมาจาก index.js เพื่อไม่ให้ไฟล์หลักโตไปกว่านี้ — index.js เรียก registerCrm(api, deps) หลัง requireAuth
import { db } from './db.js'
import { isManager } from './auth.js'

// ---- schema (idempotent) ----
function ensureCol(table, col, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`)
}
for (const [c, t] of [['code', 'TEXT'], ['line_uid', 'TEXT'], ['source', 'TEXT'], ['owner', 'TEXT'], ['referral_code', 'TEXT'], ['portal_token', 'TEXT'], ['birthday', 'TEXT'], ['tags', 'TEXT'], ['line_linked_at', 'TEXT'], ['updated', 'TEXT']]) ensureCol('customers', c, t)
for (const [c, t] of [['lead_id', 'INTEGER'], ['house_code', 'TEXT'], ['next_action', 'TEXT'], ['next_date', 'TEXT'], ['done', 'INTEGER']]) ensureCol('customer_contacts', c, t)
ensureCol('houses', 'customer_id', 'INTEGER')
db.exec(`CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no TEXT, name TEXT, phone TEXT, line TEXT, email TEXT, source TEXT, stage TEXT,
  value INTEGER, owner TEXT, note TEXT, next_date TEXT, referral_code TEXT, referred_by TEXT,
  house_type TEXT, area TEXT, budget INTEGER, customer_id INTEGER, lost_reason TEXT,
  created TEXT, updated TEXT, stage_at TEXT, contacted_at TEXT, won_at TEXT
)`)
db.exec('CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage)')
db.exec(`CREATE TABLE IF NOT EXISTS customer_link_codes (code TEXT PRIMARY KEY, customer_id INTEGER, expires INTEGER)`)

export const LEAD_STAGES = ['สนใจ', 'นัดคุย', 'เสนอราคา/แบบ', 'ต่อรอง', 'เซ็นสัญญา', 'ยกเลิก']
export const LEAD_SOURCES = ['Facebook', 'LINE OA', 'เว็บไซต์', 'บอกต่อ', 'ป้าย/หน้างาน', 'โทรเข้า', 'อื่นๆ']
const OPEN_STAGES = LEAD_STAGES.filter((s) => s !== 'เซ็นสัญญา' && s !== 'ยกเลิก')
export const STALE_DAYS = 3

const normName = (s) => String(s || '').replace(/^(นาย|นาง|นางสาว|น\.ส\.|คุณ|ดร\.|ด\.ช\.|ด\.ญ\.)\s*/g, '').replace(/\s+/g, '').toLowerCase()
const isoNow = () => new Date().toISOString().slice(0, 10)
const daysSince = (iso) => { if (!iso) return 999; const d = new Date(String(iso).slice(0, 10) + 'T00:00:00'); return Number.isNaN(d.getTime()) ? 999 : Math.floor((Date.now() - d.getTime()) / 86400000) }
const jparse = (s) => { if (!s) return null; try { return JSON.parse(s) } catch { return null } }
const rand = (n = 6) => Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')

// QC phase names (สำเนาจาก src/qcTemplates.ts) — ใช้สรุปความคืบหน้าให้ลูกค้า
export const QC_PHASES = [
  ['0', 'ก่อนเริ่มก่อสร้าง'], ['1', 'งานฐานราก'], ['2', 'โครงสร้างชั้น 1'], ['3', 'โครงสร้างชั้น 2'], ['4', 'คานหลังคา/ดาดฟ้า'],
  ['5', 'งานหลังคา'], ['6', 'ก่อ-ฉาบ + ระบบฝังผนัง'], ['7', 'ฝ้า-พื้น-กระเบื้อง'], ['8', 'ติดตั้ง-ตกแต่ง-สี'], ['9', 'ภายนอก-ส่งมอบ'],
]

// ---- ลูกค้า ↔ บ้าน: ผูกอัตโนมัติจากชื่อ (บ้านที่มีชื่อลูกค้าแต่ยังไม่มีในทะเบียน → สร้างให้) ----
export function customerCodeOf(c) { return c.code || `CUS-${String(c.id).padStart(4, '0')}` }
export function linkCustomersToHouses() {
  const customers = db.prepare('SELECT id, name, code, referral_code, portal_token FROM customers').all()
  const byNorm = new Map(customers.map((c) => [normName(c.name), c]))
  for (const c of customers) {
    if (!c.code) db.prepare('UPDATE customers SET code=? WHERE id=?').run(customerCodeOf(c), c.id)
    if (!c.referral_code) db.prepare('UPDATE customers SET referral_code=? WHERE id=?').run('REF-' + rand(5), c.id)
    if (!c.portal_token) db.prepare('UPDATE customers SET portal_token=? WHERE id=?').run(rand(24), c.id)
  }
  for (const h of db.prepare("SELECT id, code, name, project, customer, customer_id, status FROM houses WHERE COALESCE(kind,'')<>'office'").all()) {
    if (h.customer_id && db.prepare('SELECT id FROM customers WHERE id=?').get(h.customer_id)) continue
    const nm = String(h.customer || '').trim()
    if (!nm) continue
    let c = byNorm.get(normName(nm))
    if (!c) {
      const info = db.prepare("INSERT INTO customers (name,phone,email,address,project,status,note,created,source) VALUES (?,?,?,?,?,?,?,?,?)").run(nm, '', '', '', h.project || '', 'ปิดการขาย', `สร้างอัตโนมัติจากบ้าน ${h.code}`, isoNow(), 'จากบ้าน')
      c = { id: info.lastInsertRowid, name: nm }
      db.prepare('UPDATE customers SET code=?, referral_code=?, portal_token=? WHERE id=?').run(customerCodeOf(c), 'REF-' + rand(5), rand(24), c.id)
      byNorm.set(normName(nm), c)
    }
    db.prepare('UPDATE houses SET customer_id=? WHERE id=?').run(c.id, h.id)
  }
}

// บ้านของลูกค้า (ผูกด้วย customer_id หรือชื่อตรง)
export function housesOfCustomer(c) {
  return db.prepare("SELECT * FROM houses WHERE COALESCE(kind,'')<>'office' AND (customer_id=? OR customer=?) ORDER BY id DESC").all(c.id, c.name)
}
export function qcProgressOf(houseCode) {
  const rows = db.prepare('SELECT phase, status FROM qc_inspections WHERE house_code=?').all(houseCode)
  const phases = QC_PHASES.map(([id, name]) => {
    const rs = rows.filter((r) => String(r.phase) === id)
    const passed = rs.length > 0 && rs.every((r) => r.status === 'ผ่าน')
    const fixing = rs.some((r) => r.status === 'ต้องแก้ไข')
    return { id, name, forms: rs.length, passed, fixing, started: rs.length > 0 }
  })
  const done = phases.filter((p) => p.passed).length
  const current = phases.find((p) => p.started && !p.passed) || phases.find((p) => !p.started) || phases[phases.length - 1]
  return { phases, done, total: phases.length, current: current ? { id: current.id, name: current.name } : null }
}
export function customer360(c) {
  const houses = housesOfCustomer(c).map((h) => {
    const inst = db.prepare("SELECT * FROM installments WHERE house_code=? AND COALESCE(side,'customer')='customer' ORDER BY no").all(h.code)
    const paid = inst.reduce((s, i) => s + (Number(i.paid) || 0), 0)
    const total = inst.reduce((s, i) => s + (Number(i.amount) || 0), 0)
    const nextDue = inst.find((i) => (Number(i.paid) || 0) < (Number(i.amount) || 0))
    const issues = db.prepare('SELECT * FROM issues WHERE house_code=? ORDER BY id DESC').all(h.code)
    const qc = qcProgressOf(h.code)
    const files = db.prepare('SELECT COUNT(*) c FROM files WHERE house_code=?').get(h.code).c
    const photos = db.prepare("SELECT images FROM qc_inspections WHERE house_code=? AND images IS NOT NULL ORDER BY id DESC LIMIT 6").all(h.code).flatMap((r) => jparse(r.images) || []).slice(0, 6)
    return { ...h, installments: inst, inst_paid: paid, inst_total: total, next_due: nextDue || null, issues, open_issues: issues.filter((i) => i.status !== 'แก้ไขแล้ว' && i.status !== 'ปิดเคส').length, qc, files, photos }
  })
  const docs = db.prepare('SELECT id,type,no,date,total,status FROM sales_docs WHERE customer=? ORDER BY id DESC LIMIT 30').all(c.name)
  const contacts = db.prepare('SELECT * FROM customer_contacts WHERE customer_id=? ORDER BY id DESC LIMIT 200').all(c.id)
  const leads = db.prepare('SELECT * FROM leads WHERE customer_id=? ORDER BY id DESC').all(c.id)
  const referrals = db.prepare('SELECT id,no,name,stage,created FROM leads WHERE referral_code=? ORDER BY id DESC').all(c.referral_code || '__none__')
  const nextActions = contacts.filter((x) => x.next_action && !x.done).map((x) => ({ id: x.id, action: x.next_action, date: x.next_date, by: x.by, overdue: x.next_date && x.next_date < isoNow() }))
  return { ...c, code: customerCodeOf(c), houses, docs, contacts, leads, referrals, next_actions: nextActions, line_linked: !!c.line_uid }
}

// ---- Lead ----
export function leadRow(l) { return l ? { ...l, stale: OPEN_STAGES.includes(l.stage) && daysSince(l.contacted_at || l.updated || l.created) >= STALE_DAYS, idle_days: daysSince(l.contacted_at || l.updated || l.created) } : l }
export function staleLeads() { return db.prepare(`SELECT * FROM leads WHERE stage IN (${OPEN_STAGES.map(() => '?').join(',')}) ORDER BY id DESC`).all(...OPEN_STAGES).map(leadRow).filter((l) => l.stale) }

export function crmMetrics() {
  const leads = db.prepare('SELECT * FROM leads').all()
  const month = (iso) => String(iso || '').slice(0, 7)
  const months = []
  for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); months.push(d.toISOString().slice(0, 7)) }
  const perMonth = months.map((m) => ({ month: m, leads: leads.filter((l) => month(l.created) === m).length, won: leads.filter((l) => month(l.won_at) === m).length }))
  const bySource = {}
  for (const l of leads) { const k = l.source || 'ไม่ระบุ'; bySource[k] = bySource[k] || { source: k, leads: 0, won: 0 }; bySource[k].leads++; if (l.stage === 'เซ็นสัญญา') bySource[k].won++ }
  const won = leads.filter((l) => l.stage === 'เซ็นสัญญา')
  const closeDays = won.map((l) => daysSince(l.created) - daysSince(l.won_at)).filter((d) => d >= 0)
  const open = leads.filter((l) => OPEN_STAGES.includes(l.stage))
  const issues = db.prepare('SELECT * FROM issues').all()
  const openCases = issues.filter((i) => i.status !== 'แก้ไขแล้ว' && i.status !== 'ปิดเคส').length
  const resolved = issues.filter((i) => i.resolved_at && i.created_at).map((i) => (new Date(i.resolved_at).getTime() - new Date(i.created_at).getTime()) / 3600000).filter((h) => h >= 0)
  let nps = null
  try { const r = db.prepare('SELECT AVG(score) a, COUNT(*) n, SUM(score>=9) p, SUM(score<=6) d FROM nps').get(); if (r?.n) nps = { avg: Math.round(r.a * 10) / 10, n: r.n, score: Math.round(((r.p - r.d) / r.n) * 100) } } catch { /* ยังไม่มีตาราง */ }
  return {
    customers: db.prepare('SELECT COUNT(*) c FROM customers').get().c,
    line_linked: db.prepare('SELECT COUNT(*) c FROM customers WHERE line_uid IS NOT NULL').get().c,
    leads_total: leads.length, leads_open: open.length, leads_stale: open.map(leadRow).filter((l) => l.stale).length, leads_won: won.length,
    conversion: leads.length ? Math.round((won.length / leads.length) * 100) : 0,
    avg_close_days: closeDays.length ? Math.round(closeDays.reduce((s, d) => s + d, 0) / closeDays.length) : null,
    per_month: perMonth, by_source: Object.values(bySource).sort((a, b) => b.leads - a.leads),
    pipeline: LEAD_STAGES.map((s) => ({ stage: s, n: leads.filter((l) => l.stage === s).length, value: leads.filter((l) => l.stage === s).reduce((x, l) => x + (Number(l.value) || 0), 0) })),
    referrals: leads.filter((l) => l.referral_code).length,
    open_cases: openCases, avg_resolve_hours: resolved.length ? Math.round(resolved.reduce((s, h) => s + h, 0) / resolved.length) : null,
    nps,
  }
}

// แจ้งเตือนในกระดิ่ง (index.js เรียกต่อท้าย /notifications)
export function crmNotifications(user) {
  const out = []
  if (!isManager(user) && user.role !== 'admin' && user.role !== 'accounting') return out
  for (const l of staleLeads().slice(0, 8)) out.push({ kind: 'lead-stale', icon: 'warn', title: `Lead เงียบ ${l.idle_days} วัน — ${l.name}`, sub: `${l.stage} · ${l.source || ''}${l.owner ? ' · ' + l.owner : ''} · โทร/ทัก LINE ตามลูกค้า`, page: 'customers' })
  const today = isoNow()
  for (const x of db.prepare("SELECT c.*, cu.name cname FROM customer_contacts c JOIN customers cu ON cu.id=c.customer_id WHERE c.next_action IS NOT NULL AND c.next_action<>'' AND COALESCE(c.done,0)=0 AND c.next_date<=? ORDER BY c.next_date LIMIT 8").all(today))
    out.push({ kind: 'crm-next', icon: x.next_date < today ? 'danger' : 'warn', title: `${x.next_date < today ? 'เลยกำหนด' : 'วันนี้'}: ${x.next_action} — ${x.cname}`, sub: `นัดไว้ ${x.next_date} โดย ${x.by}`, page: 'customers' })
  return out
}

export function registerCrm(api, d) {
  const { canWrite, audit, notifyChange, nowTS, todayTH, docYear, nextSeq } = d
  const mgrOrOffice = (u) => !!u && (isManager(u) || u.role === 'admin' || u.role === 'accounting')
  linkCustomersToHouses()

  // ---- ลูกค้า 360 ----
  api.get('/crm/customers', (_req, res) => { linkCustomersToHouses(); res.json(db.prepare('SELECT * FROM customers ORDER BY id DESC').all().map((c) => ({ ...c, code: customerCodeOf(c), houses: housesOfCustomer(c).length, line_linked: !!c.line_uid }))) })
  api.get('/crm/customers/:id/360', (req, res) => {
    const c = db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id)
    if (!c) return res.status(404).json({ error: 'ไม่พบลูกค้า' })
    res.json(customer360(c))
  })
  api.put('/crm/customers/:id', canWrite, (req, res) => {
    const c = db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id)
    if (!c) return res.status(404).json({ error: 'ไม่พบลูกค้า' })
    const b = req.body || {}
    const f = (k) => (b[k] != null ? String(b[k]) : c[k])
    db.prepare('UPDATE customers SET name=?, phone=?, email=?, address=?, project=?, status=?, note=?, source=?, owner=?, birthday=?, tags=?, updated=? WHERE id=?')
      .run(f('name'), f('phone'), f('email'), f('address'), f('project'), f('status'), f('note'), f('source'), f('owner'), f('birthday'), f('tags'), nowTS(), c.id)
    if (Array.isArray(b.house_codes)) { // ผูก/ถอดบ้านด้วยมือ
      db.prepare('UPDATE houses SET customer_id=NULL WHERE customer_id=?').run(c.id)
      for (const code of b.house_codes) db.prepare('UPDATE houses SET customer_id=? WHERE code=?').run(c.id, code)
    }
    audit(req, 'แก้ไขลูกค้า', c.name)
    res.json(customer360(db.prepare('SELECT * FROM customers WHERE id=?').get(c.id)))
  })
  // บันทึกการติดต่อ + นัดทำต่อ (next action)
  api.post('/crm/customers/:id/contacts', canWrite, (req, res) => {
    const c = db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id)
    if (!c) return res.status(404).json({ error: 'ไม่พบลูกค้า' })
    const b = req.body || {}
    if (!String(b.note || '').trim() && !String(b.next_action || '').trim()) return res.status(400).json({ error: 'กรอกรายละเอียดหรือสิ่งที่ต้องทำต่อ' })
    db.prepare('INSERT INTO customer_contacts (customer_id,date,channel,note,by,house_code,next_action,next_date,done) VALUES (?,?,?,?,?,?,?,?,0)')
      .run(c.id, b.date || todayTH(), b.channel || 'โทรศัพท์', String(b.note || '').trim(), req.user.name, b.house_code || '', String(b.next_action || '').trim(), b.next_date || '')
    res.status(201).json(db.prepare('SELECT * FROM customer_contacts WHERE customer_id=? ORDER BY id DESC').all(c.id))
  })
  api.post('/crm/contacts/:id/done', canWrite, (req, res) => { db.prepare('UPDATE customer_contacts SET done=1 WHERE id=?').run(req.params.id); res.json({ ok: true }) })
  api.delete('/crm/contacts/:id', canWrite, (req, res) => { db.prepare('DELETE FROM customer_contacts WHERE id=?').run(req.params.id); res.json({ ok: true }) })

  // ---- Lead / Pipeline ----
  api.get('/crm/leads', (_req, res) => res.json(db.prepare('SELECT * FROM leads ORDER BY id DESC').all().map(leadRow)))
  api.get('/crm/leads/meta', (_req, res) => res.json({ stages: LEAD_STAGES, sources: LEAD_SOURCES, stale_days: STALE_DAYS }))
  api.post('/crm/leads', canWrite, (req, res) => {
    const b = req.body || {}
    if (!String(b.name || '').trim()) return res.status(400).json({ error: 'กรอกชื่อลูกค้า' })
    const seq = nextSeq('lead', () => db.prepare('SELECT COUNT(*) c FROM leads').get().c)
    const no = `LD-${docYear()}-${String(seq).padStart(4, '0')}`
    const stage = LEAD_STAGES.includes(b.stage) ? b.stage : 'สนใจ'
    const ref = String(b.referral_code || '').trim().toUpperCase()
    const referredBy = ref ? db.prepare('SELECT name FROM customers WHERE referral_code=?').get(ref)?.name || '' : ''
    const now = nowTS(), today = isoNow()
    const info = db.prepare('INSERT INTO leads (no,name,phone,line,email,source,stage,value,owner,note,next_date,referral_code,referred_by,house_type,area,budget,created,updated,stage_at,contacted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(no, String(b.name).trim(), b.phone || '', b.line || '', b.email || '', b.source || (ref ? 'บอกต่อ' : 'อื่นๆ'), stage, Number(b.value) || 0, b.owner || req.user.name, b.note || '', b.next_date || '', ref, referredBy, b.house_type || '', b.area || '', Number(b.budget) || 0, today, now, now, today)
    audit(req, 'เพิ่ม Lead', `${no} ${b.name}`)
    res.status(201).json(leadRow(db.prepare('SELECT * FROM leads WHERE id=?').get(info.lastInsertRowid)))
  })
  api.put('/crm/leads/:id', canWrite, (req, res) => {
    const l = db.prepare('SELECT * FROM leads WHERE id=?').get(req.params.id)
    if (!l) return res.status(404).json({ error: 'ไม่พบ Lead' })
    const b = req.body || {}
    const f = (k) => (b[k] != null ? b[k] : l[k])
    const stage = LEAD_STAGES.includes(b.stage) ? b.stage : l.stage
    const now = nowTS()
    db.prepare('UPDATE leads SET name=?, phone=?, line=?, email=?, source=?, stage=?, value=?, owner=?, note=?, next_date=?, house_type=?, area=?, budget=?, lost_reason=?, updated=?, stage_at=?, contacted_at=?, won_at=? WHERE id=?')
      .run(f('name'), f('phone'), f('line'), f('email'), f('source'), stage, Number(f('value')) || 0, f('owner'), f('note'), f('next_date'), f('house_type'), f('area'), Number(f('budget')) || 0, f('lost_reason'), now,
        stage !== l.stage ? now : l.stage_at, b.contacted ? isoNow() : l.contacted_at, stage === 'เซ็นสัญญา' && !l.won_at ? isoNow() : l.won_at, l.id)
    res.json(leadRow(db.prepare('SELECT * FROM leads WHERE id=?').get(l.id)))
  })
  api.post('/crm/leads/:id/notes', canWrite, (req, res) => {
    const l = db.prepare('SELECT * FROM leads WHERE id=?').get(req.params.id)
    if (!l) return res.status(404).json({ error: 'ไม่พบ Lead' })
    const b = req.body || {}
    if (!String(b.note || '').trim()) return res.status(400).json({ error: 'กรอกรายละเอียด' })
    db.prepare('INSERT INTO customer_contacts (customer_id,lead_id,date,channel,note,by,next_action,next_date,done) VALUES (?,?,?,?,?,?,?,?,0)')
      .run(l.customer_id || 0, l.id, todayTH(), b.channel || 'โทรศัพท์', String(b.note).trim(), req.user.name, String(b.next_action || '').trim(), b.next_date || '')
    db.prepare('UPDATE leads SET contacted_at=?, updated=?, next_date=COALESCE(NULLIF(?,\'\'), next_date) WHERE id=?').run(isoNow(), nowTS(), b.next_date || '', l.id)
    res.status(201).json(db.prepare('SELECT * FROM customer_contacts WHERE lead_id=? ORDER BY id DESC').all(l.id))
  })
  api.get('/crm/leads/:id/notes', (req, res) => res.json(db.prepare('SELECT * FROM customer_contacts WHERE lead_id=? ORDER BY id DESC').all(req.params.id)))
  // แปลง Lead → ลูกค้า (+ สร้างบ้านให้ถ้าส่ง house มา)
  api.post('/crm/leads/:id/convert', canWrite, (req, res) => {
    const l = db.prepare('SELECT * FROM leads WHERE id=?').get(req.params.id)
    if (!l) return res.status(404).json({ error: 'ไม่พบ Lead' })
    let c = l.customer_id ? db.prepare('SELECT * FROM customers WHERE id=?').get(l.customer_id) : db.prepare('SELECT * FROM customers WHERE name=?').get(l.name)
    if (!c) {
      const info = db.prepare('INSERT INTO customers (name,phone,email,address,project,status,note,created,source,owner,code,referral_code,portal_token) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(l.name, l.phone || '', l.email || '', '', l.house_type || '', 'ปิดการขาย', l.note || '', isoNow(), l.source || '', l.owner || '', '', 'REF-' + rand(5), rand(24))
      c = db.prepare('SELECT * FROM customers WHERE id=?').get(info.lastInsertRowid)
      db.prepare('UPDATE customers SET code=? WHERE id=?').run(customerCodeOf(c), c.id)
    } else db.prepare("UPDATE customers SET status='ปิดการขาย', updated=? WHERE id=?").run(nowTS(), c.id)
    db.prepare("UPDATE leads SET customer_id=?, stage='เซ็นสัญญา', won_at=COALESCE(won_at,?), updated=?, stage_at=? WHERE id=?").run(c.id, isoNow(), nowTS(), nowTS(), l.id)
    db.prepare('UPDATE customer_contacts SET customer_id=? WHERE lead_id=?').run(c.id, l.id)
    const h = req.body?.house
    let house = null
    if (h && h.code && h.name) {
      if (db.prepare('SELECT id FROM houses WHERE code=?').get(h.code)) return res.status(409).json({ error: 'รหัสบ้านซ้ำ ' + h.code })
      db.prepare('INSERT INTO houses (code,name,project,customer,value,pct,collected,remain,status,customer_id,kind) VALUES (?,?,?,?,?,0,0,?,?,?,?)')
        .run(h.code, h.name, h.project || l.house_type || '', l.name, Number(h.value) || Number(l.value) || 0, Number(h.value) || Number(l.value) || 0, 'เพิ่งเริ่ม', c.id, 'sale')
      house = db.prepare('SELECT * FROM houses WHERE code=?').get(h.code)
    }
    audit(req, 'แปลง Lead เป็นลูกค้า', `${l.no} → ${customerCodeOf(c)}${house ? ' + บ้าน ' + house.code : ''}`)
    notifyChange(['houses', 'customers'])
    res.json({ customer: customer360(db.prepare('SELECT * FROM customers WHERE id=?').get(c.id)), lead: leadRow(db.prepare('SELECT * FROM leads WHERE id=?').get(l.id)), house })
  })
  api.delete('/crm/leads/:id', canWrite, (req, res) => {
    if (!mgrOrOffice(req.user)) return res.status(403).json({ error: 'ลบ Lead ได้เฉพาะผู้บริหาร/บัญชี' })
    db.prepare('DELETE FROM leads WHERE id=?').run(req.params.id); db.prepare('DELETE FROM customer_contacts WHERE lead_id=?').run(req.params.id); res.json({ ok: true })
  })
  api.get('/crm/metrics', (req, res) => { if (!mgrOrOffice(req.user)) return res.status(403).json({ error: 'ดูได้เฉพาะผู้บริหาร/บัญชี' }); res.json(crmMetrics()) })
}
