import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { db } from './db.js'
import { login, logout, requireAuth, requireRole, requireManager, isManager, requireSalary, canSeeSalary } from './auth.js'
import { hashPin, verifyPin } from './security.js'
import { randomBytes } from 'node:crypto'
import { EFILINGS, efilingList } from './efiling.js'
import * as acct from './accounting.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(cors())
app.use(express.json({ limit: '30mb' })) // allow base64 signatures + file uploads

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
function todayTH() {
  const d = new Date()
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${String((d.getFullYear() + 543) % 100).padStart(2, '0')}`
}
// a Thai-formatted date N days from today (for PO credit due dates)
function thDatePlusDays(days) {
  const d = new Date()
  d.setDate(d.getDate() + (Number(days) || 0))
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${String((d.getFullYear() + 543) % 100).padStart(2, '0')}`
}
// format an ISO date (YYYY-MM-DD) to Thai display "D MMM YY"
function thDateFromISO(iso) {
  const d = new Date(String(iso) + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return todayTH()
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${String((d.getFullYear() + 543) % 100).padStart(2, '0')}`
}
// เวลาปัจจุบันแบบละเอียด (ท้องถิ่นไทย) "YYYY-MM-DD HH:MM:SS" — ใช้จับเวลางานด่วน
function nowTS() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
function tsToMs(ts) { const d = ts ? new Date(String(ts).replace(' ', 'T')) : null; return d && !Number.isNaN(d.getTime()) ? d.getTime() : null }
function minutesSince(ts) { const ms = tsToMs(ts); return ms == null ? null : Math.max(0, (Date.now() - ms) / 60000) }

// ---- payroll calculators (Thai social security + progressive PIT) ----
function monthlyBaseOf(base, payType) {
  return payType === 'รายวัน' ? base * 26 : base // ~26 working days (Mon–Sat)
}
function ssoOf(monthlyBase) {
  // ประกันสังคม 5% เพดานค่าจ้าง 17,500 → เกิน 17,500 หัก 875 · ต่ำกว่านั้น ×5% ปัดตามหลัก (>.5 ขึ้น, <.5 ลง)
  return Math.round(Math.min(monthlyBase, 17500) * 0.05)
}
function annualTax(taxable) {
  const brackets = [
    [150000, 0], [300000, 0.05], [500000, 0.1], [750000, 0.15],
    [1000000, 0.2], [2000000, 0.25], [5000000, 0.3], [Infinity, 0.35],
  ]
  let tax = 0, last = 0
  for (const [cap, rate] of brackets) {
    if (taxable > last) tax += (Math.min(taxable, cap) - last) * rate
    last = cap
    if (taxable <= cap) break
  }
  return tax
}
function taxMonthlyOf(monthlyBase, ssoMonthly, allowance = 0) {
  const annual = monthlyBase * 12
  const taxable = Math.max(0, annual - Math.min(annual * 0.5, 100000) - 60000 - Math.min(ssoMonthly * 12, 9000) - allowance)
  return Math.round(annualTax(taxable) / 12)
}
// extra annual allowances: spouse 60,000 ; child 30,000 each
function allowanceOf(emp) {
  return (emp.spouse ? 60000 : 0) + (Number(emp.children) || 0) * 30000
}
// คำนวณประกันสังคม/ภาษี ของพนักงานทุกคนใหม่ตอนบูต (เผื่อสูตรเปลี่ยน เช่น เพดาน ปกส.)
try {
  for (const e of db.prepare('SELECT id,base,pay_type,sso,tax,spouse,children FROM employees').all()) {
    const mBase = monthlyBaseOf(e.base, e.pay_type)
    const sso = ssoOf(mBase)
    const tax = taxMonthlyOf(mBase, sso, allowanceOf({ spouse: e.spouse, children: e.children }))
    if (sso !== e.sso || tax !== e.tax) db.prepare('UPDATE employees SET sso=?, tax=? WHERE id=?').run(sso, tax, e.id)
  }
} catch (e) { console.error('sso/tax recompute failed:', e.message) }
const DAYMS_ = 86400000
// วันที่แบบ YYYY-MM-DD ตาม "เวลาท้องถิ่น" (ไทย) — ห้ามใช้ toISOString เพราะจะเพี้ยนเป็น UTC (คลาดวัน 1 วัน)
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function* eachDay(fromISO, toISO) {
  const a = new Date(fromISO + 'T00:00:00'); const b = new Date(toISO + 'T00:00:00')
  for (let t = a.getTime(); t <= b.getTime(); t += DAYMS_) yield isoDate(new Date(t))
}
// count unexcused working days (Mon–Sat) for an employee within a given month.
// Only counts GAPS between the first and last day they actually punched in that
// month — so punching once then stopping (or not having come yet) never
// over-deducts. period = 'YYYY-MM'.
function absentDaysInMonth(emp, period) {
  const [yy, mm] = period.split('-').map(Number)
  const monthStart = isoDate(new Date(yy, mm - 1, 1))
  const monthEnd = isoDate(new Date(yy, mm, 0))
  // attendance punches within the month
  const punches = db.prepare("SELECT date FROM attendance WHERE emp_code=? AND check_in!='' AND date>=? AND date<=? ORDER BY date")
    .all(emp.code, monthStart, monthEnd)
  if (punches.length === 0) return 0 // not using the time-clock → don't auto-deduct
  let from = punches[0].date
  const to = punches[punches.length - 1].date // only within the active attendance window
  const empStart = emp.start && /^\d{4}-\d{2}-\d{2}$/.test(emp.start) ? emp.start : null
  if (empStart && empStart > from) from = empStart
  const excused = new Set(punches.map((p) => p.date))
  for (const l of db.prepare("SELECT start_date,end_date FROM leaves WHERE emp_code=? AND status='อนุมัติ'").all(emp.code))
    for (const d of eachDay(l.start_date, l.end_date || l.start_date)) excused.add(d)
  for (const t of db.prepare("SELECT date FROM time_adjustments WHERE emp_name=? AND status='อนุมัติ'").all(emp.name)) excused.add(t.date)
  for (const h of db.prepare('SELECT date FROM holidays WHERE date>=? AND date<=?').all(from, to)) excused.add(h.date) // วันหยุดบริษัท ไม่นับขาด
  let absent = 0
  for (const d of eachDay(from, to)) {
    const wd = new Date(d + 'T00:00:00').getDay()
    if (wd !== 0 && !excused.has(d)) absent++ // Mon–Sat, not excused
  }
  return absent
}
function currentPeriod() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function periodLabelTH(period) {
  const [yy, mm] = period.split('-').map(Number)
  return `${TH_MONTHS[mm - 1]} ${String((yy + 543) % 100).padStart(2, '0')}`
}
// 2-digit Thai B.E. year for document numbers (e.g. 2026 → "69")
function docYear() {
  return String((new Date().getFullYear() + 543) % 100).padStart(2, '0')
}
// lightweight audit log
function audit(req, action, detail) {
  try { db.prepare('INSERT INTO audit (ts,user,action,detail) VALUES (?,?,?,?)').run(new Date().toISOString(), req.user?.name || '-', action, detail || '') } catch { /* ignore */ }
}
// format a number as Thai baht with commas (server-side, for audit detail strings)
const baht = (n) => (Number(n) || 0).toLocaleString('en-US') + ' บาท'
// ให้ PIN ลงเวลา (kiosk) ของพนักงานตรงกับ PIN ผู้ใช้เสมอ (ผูกตาม user_id หรือชื่อ)
function syncEmployeePin(user, hashedPin) {
  const emp = db.prepare('SELECT id FROM employees WHERE user_id=?').get(user.id)
    || db.prepare('SELECT id FROM employees WHERE name=?').get(user.name)
  if (emp) db.prepare('UPDATE employees SET pin=?, user_id=COALESCE(user_id,?) WHERE id=?').run(hashedPin, user.id, emp.id)
}

const api = express.Router()

// ---------- auth ----------
// brute-force guard: lock an account for a while after too many wrong PINs
const loginAttempts = new Map() // username -> { fails, lockedUntil }
const MAX_FAILS = 5
const LOCK_MS = 5 * 60 * 1000 // 5 minutes
api.post('/login', (req, res) => {
  const { username, pin } = req.body || {}
  const key = String(username || '').toLowerCase()
  const rec = loginAttempts.get(key) || { fails: 0, lockedUntil: 0 }
  if (rec.lockedUntil > Date.now()) {
    const mins = Math.ceil((rec.lockedUntil - Date.now()) / 60000)
    return res.status(429).json({ error: `ใส่ PIN ผิดหลายครั้งเกินไป ระบบล็อกชั่วคราว ลองใหม่ใน ${mins} นาที` })
  }
  const result = login(username, pin)
  if (!result) {
    rec.fails += 1
    if (rec.fails >= MAX_FAILS) { rec.lockedUntil = Date.now() + LOCK_MS; rec.fails = 0 }
    loginAttempts.set(key, rec)
    const left = MAX_FAILS - rec.fails
    return res.status(401).json({ error: rec.lockedUntil > Date.now() ? `ใส่ PIN ผิดหลายครั้งเกินไป ระบบล็อก 5 นาที` : `ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง${left > 0 && left <= 2 ? ` (เหลืออีก ${left} ครั้งจะถูกล็อก)` : ''}` })
  }
  if (result.error) return res.status(403).json({ error: result.error })
  loginAttempts.delete(key) // success → reset counter
  res.json(result)
})
api.post('/logout', requireAuth, (req, res) => {
  logout((req.headers.authorization || '').replace(/^Bearer\s+/i, ''))
  res.json({ ok: true })
})
api.get('/me', requireAuth, (req, res) => {
  const row = db.prepare('SELECT signature, must_change_pin FROM users WHERE id = ?').get(req.user.id)
  res.json({ ...req.user, signature: row?.signature || null, isManager: isManager(req.user), mustChangePin: !!row?.must_change_pin })
})
// ลืม PIN — ผู้ใช้ที่ล็อกอินไม่ได้ส่งคำขอรีเซ็ต (สาธารณะ) แอดมินยืนยันตัวตนแล้วรีเซ็ตให้
// คืนข้อความกลาง ๆ เสมอ (ไม่บอกว่ามี username นี้จริงไหม เพื่อกันการเดาชื่อผู้ใช้)
api.post('/forgot-pin', (req, res) => {
  const username = String((req.body || {}).username || '').trim().toLowerCase()
  if (username) {
    const u = db.prepare('SELECT * FROM users WHERE username=?').get(username)
    if (u) {
      const pending = db.prepare("SELECT id FROM pin_reset_requests WHERE username=? AND status='pending'").get(username)
      if (!pending) db.prepare("INSERT INTO pin_reset_requests (username,name,status,created) VALUES (?,?,'pending',?)").run(username, u.name || '', todayTH())
    }
  }
  res.json({ ok: true, message: 'ส่งคำขอแล้ว — โปรดติดต่อผู้ดูแลระบบเพื่อยืนยันตัวตนและรับ PIN ใหม่' })
})

// ===== PUBLIC check-in app routes (no ERP login — secured by employee PIN + geofence) =====
function getSetting(k, def = '') { return db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value ?? def }
function setSetting(k, v) { db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v)) }
function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = (x) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
api.get('/kiosk/employees', (_req, res) =>
  // แสดงพนักงานทุกคนที่ยังไม่ลาออก (COALESCE กัน status ที่เป็น NULL หลุดจากรายชื่อ)
  res.json(db.prepare("SELECT code,name FROM employees WHERE COALESCE(status,'') != 'ลาออก' ORDER BY name").all()))
// record a GPS point for an employee (foreman tracking). PIN-verified, public.
function logLocation(emp, lat, lng, accuracy, note) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return
  const now = new Date()
  db.prepare('INSERT INTO location_log (emp_code,emp_name,lat,lng,accuracy,ts,date,note) VALUES (?,?,?,?,?,?,?,?)')
    .run(emp.code, emp.name, lat, lng, Number(accuracy) || 0, now.toISOString(), now.toISOString().slice(0, 10), note || '')
}
api.post('/kiosk/location', (req, res) => {
  const { emp_code, pin, lat, lng, accuracy, note } = req.body || {}
  const emp = db.prepare('SELECT * FROM employees WHERE code=?').get(emp_code)
  if (!emp) return res.status(404).json({ error: 'ไม่พบพนักงาน' })
  if (!emp.pin || hashPin(pin) !== emp.pin) return res.status(401).json({ error: 'PIN ไม่ถูกต้อง' })
  logLocation(emp, lat, lng, accuracy, note)
  res.json({ ok: true })
})
// PUBLIC background-tracking endpoint for off-the-shelf GPS apps (GPSLogger ฯลฯ)
// configured per employee with a secret token. Accepts GET or POST, lat/lng in query or body.
function trackHandler(req, res) {
  const token = req.params.token
  const emp = token && db.prepare('SELECT * FROM employees WHERE track_token=?').get(token)
  if (!emp) return res.status(404).send('unknown token')
  const src = { ...(req.query || {}), ...(req.body || {}) }
  const lat = parseFloat(src.lat), lng = parseFloat(src.lng ?? src.lon ?? src.long)
  if (Number.isNaN(lat) || Number.isNaN(lng)) return res.status(400).send('need lat & lng')
  logLocation(emp, lat, lng, parseFloat(src.acc ?? src.accuracy) || 0, 'ติดตามอัตโนมัติ')
  res.send('OK')
}
api.get('/track/:token', trackHandler)
api.post('/track/:token', trackHandler)
// เวลาที่เกินกว่านี้ = "สาย" (เวลาเข้างาน + นาทีผ่อนผัน) · ค่าเริ่มต้น 08:00 + ผ่อนผัน 5 นาที
function lateCutoff() {
  const m = /^(\d{1,2}):(\d{2})$/.exec(getSetting('att_start', '08:00'))
  const grace = parseInt(getSetting('att_grace', '5'), 10) || 0
  if (!m) return '08:05'
  const total = (parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + grace) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
api.get('/settings/attendance', (_req, res) => res.json({
  enabled: getSetting('att_geofence', '0') === '1',
  radius: parseInt(getSetting('att_radius', '200'), 10) || 200,
  lat: getSetting('att_lat', ''),
  lng: getSetting('att_lng', ''),
  start: getSetting('att_start', '08:00'),
  grace: parseInt(getSetting('att_grace', '5'), 10) || 0,
  cutoff: lateCutoff(),
}))
api.post('/kiosk/punch', (req, res) => {
  const { emp_code, pin, kind } = req.body || {}
  const emp = db.prepare('SELECT * FROM employees WHERE code=?').get(emp_code)
  if (!emp) return res.status(404).json({ error: 'ไม่พบพนักงาน' })
  if (!emp.pin || hashPin(pin) !== emp.pin) return res.status(401).json({ error: 'PIN ไม่ถูกต้อง' })
  // geofence: เช็คอินได้เฉพาะในรัศมีออฟฟิศ (ถ้าเปิดใช้)
  if (getSetting('att_geofence', '0') === '1') {
    const oLat = parseFloat(getSetting('att_lat', '')), oLng = parseFloat(getSetting('att_lng', ''))
    if (!Number.isNaN(oLat) && !Number.isNaN(oLng)) {
      const { lat, lng } = req.body || {}
      if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ error: 'กรุณาเปิดตำแหน่ง (GPS) เพื่อเช็คอิน' })
      const radius = parseInt(getSetting('att_radius', '200'), 10) || 200
      const d = distanceM(oLat, oLng, lat, lng)
      if (d > radius) return res.status(403).json({ error: `อยู่นอกพื้นที่ออฟฟิศ — ห่าง ${Math.round(d)} ม. (อนุญาตในรัศมี ${radius} ม.)` })
    }
  }
  const { lat, lng, accuracy } = req.body || {}
  const date = todayISO()
  const time = nowHM()
  const row = db.prepare('SELECT * FROM attendance WHERE emp_code=? AND date=?').get(emp_code, date)
  if (kind === 'in') {
    if (row && row.check_in) return res.status(400).json({ error: `${emp.name} เข้างานแล้วเมื่อ ${row.check_in}` })
    const status = time > lateCutoff() ? 'สาย' : 'ปกติ' // เข้าหลังเวลาเข้างาน + ผ่อนผัน = สาย
    if (row) db.prepare('UPDATE attendance SET check_in=?, status=? WHERE id=?').run(time, status, row.id)
    else db.prepare('INSERT INTO attendance (emp_code,emp_name,date,check_in,check_out,status) VALUES (?,?,?,?,?,?)').run(emp_code, emp.name, date, time, '', status)
    logLocation(emp, lat, lng, accuracy, 'เข้างาน')
    return res.json({ name: emp.name, kind: 'in', time, status })
  }
  if (!row || !row.check_in) return res.status(400).json({ error: `${emp.name} ยังไม่ได้เข้างานวันนี้` })
  db.prepare('UPDATE attendance SET check_out=? WHERE id=?').run(time, row.id)
  logLocation(emp, lat, lng, accuracy, 'ออกงาน')
  return res.json({ name: emp.name, kind: 'out', time, status: row.status })
})

// everything below requires a session
api.use(requireAuth)

// roles allowed to create/edit operational records (everyone except read-only viewer)
const canWrite = requireRole('admin', 'accounting', 'site')
const financeOnly = requireRole('admin', 'accounting')
const adminOnly = requireRole('admin')

// ---------- ชั้นควบคุมภายใน / กันโกง (Internal Control) ----------
// ค่าตั้งต้นของกติกาควบคุม (admin แก้ได้ในหน้า "ตรวจสอบ")
const CONTROL_DEFAULTS = {
  block_self_approve: true, // ห้ามอนุมัติใบขอซื้อที่ตัวเองเป็นผู้ขอ
  approvers_required: 3, // จำนวนผู้อนุมัติที่ต้องกดอนุมัติ (1–3) สำหรับ PR/PO/เบิก-จ่าย
  overprice_warn_pct: 10, // เตือนเมื่อราคาต่อหน่วยสูงกว่าราคากลางเกินกี่ % (0 = ปิดการเตือน)
  two_step_above: 500000, // PR ยอด ≥ นี้ ต้องอนุมัติ 2 ชั้น (คนละคน)
  quote_min: 3, // จำนวนใบเทียบราคาขั้นต่ำ
  quote_required_above: 100000, // PO ยอด ≥ นี้ ควรมีใบเทียบราคาครบ
  split_window_days: 7, // ช่วงวันตรวจ "แตกใบ"
  split_threshold: 100000, // ยอดรวมที่ถือว่าน่าสงสัยว่าแตกใบ
  near_threshold_pct: 90, // ยอดที่อยู่ 90–99.9% ของเพดาน = น่าสงสัย
  dup_window_days: 5, // ช่วงวันตรวจจ่าย/เอกสารซ้ำ
  require_acceptance: true, // ต้อง "ตรวจรับงวด" ผ่านก่อน ถึงเก็บเงินงวด (ฝั่งลูกค้า) ได้
  // ---- บล็อกจริง (hard block) ตอนสร้างเอกสาร ไม่ใช่แค่เตือน ----
  enforce_po_over_pr: true, // บล็อก: ห้ามออก PO เกินยอดที่อนุมัติใน PR
  enforce_quote: true, // บล็อก: PO ยอดสูงต้องมีใบเทียบราคาครบ + เลือกผู้ขายก่อน
  enforce_split: false, // บล็อก: สงสัยแตกใบ (ปิดไว้ก่อน—ซื้อหลายใบจากเจ้าเดียวเป็นเรื่องปกติ)
  block_dup_pay: false, // บล็อก: จ่ายเงินซ้ำ (ผู้รับ+ยอดเท่ากัน)
}
// งวดลูกค้าต้องมีใบตรวจรับที่ผลเป็น "ผ่าน/ผ่านบางส่วน" จึงจะเก็บเงินได้
function acceptanceOk(installmentId) {
  const a = db.prepare('SELECT result FROM inst_acceptance WHERE installment_id=? ORDER BY id DESC').get(installmentId)
  return !!a && (a.result === 'ผ่าน' || a.result === 'ผ่านบางส่วน')
}
function controls() {
  try { return { ...CONTROL_DEFAULTS, ...JSON.parse(getSetting('controls', '{}')) } } catch { return { ...CONTROL_DEFAULTS } }
}

// ===== เครื่องอนุมัติหลายขั้น (generic) — ใช้ร่วมกัน PR/PO/ใบจ่ายเงิน/ใบจ่ายค่าใช้จ่าย =====
const APPROVE_DOCS = {
  pr: { table: 'purchase_requests', label: 'ใบขอซื้อ', requester: 'by' },
  po: { table: 'purchase_orders', label: 'ใบสั่งซื้อ', requester: 'by', noStatus: true }, // status ของ PO ใช้เป็นสถานะรับของ ไม่ทับ
  payment: { table: 'payments', label: 'ใบจ่ายเงิน', requester: null },
  expense: { table: 'expenses', label: 'ใบจ่ายค่าใช้จ่าย', requester: null },
}
function approversRequired() { return Math.max(1, Math.min(3, Number(controls().approvers_required) || 3)) }
function approvalSteps(docType, docId) { return db.prepare('SELECT * FROM doc_approvals WHERE doc_type=? AND doc_id=? ORDER BY step, id').all(docType, Number(docId)) }
function approvalState(docType, docId) {
  const steps = approvalSteps(docType, docId)
  const rejected = steps.find((s) => s.decision === 'reject')
  const approvals = steps.filter((s) => s.decision === 'approve')
  const required = approversRequired()
  return { required, count: approvals.length, approvals: approvals.map((a) => ({ step: a.step, approver: a.approver, sig: a.approver_sig, role: a.role, date: a.date, note: a.note })), rejected: !!rejected, rejectedBy: rejected?.approver, rejectNote: rejected?.note, done: !rejected && approvals.length >= required }
}
function setDocStatus(docType, docId, status) {
  const cfg = APPROVE_DOCS[docType]; if (!cfg || cfg.noStatus) return
  try { db.prepare(`UPDATE ${cfg.table} SET status=? WHERE id=?`).run(status, Number(docId)) } catch { /* บางตารางไม่มี status */ }
}
function doApprove(docType, docId, req) {
  const cfg = APPROVE_DOCS[docType]; if (!cfg) throw { code: 400, msg: 'ประเภทเอกสารไม่ถูกต้อง' }
  const doc = db.prepare(`SELECT * FROM ${cfg.table} WHERE id=?`).get(Number(docId)); if (!doc) throw { code: 404, msg: 'ไม่พบเอกสาร' }
  const me = db.prepare('SELECT name, signature, role FROM users WHERE id=?').get(req.user.id)
  const ctrl = controls()
  const st = approvalState(docType, docId)
  if (st.rejected) throw { code: 409, msg: 'เอกสารนี้ถูกปฏิเสธแล้ว' }
  if (st.done) throw { code: 409, msg: 'อนุมัติครบแล้ว' }
  if (ctrl.block_self_approve && cfg.requester && doc[cfg.requester] && doc[cfg.requester] === me.name) throw { code: 403, msg: 'ห้ามอนุมัติเอกสารที่ตัวเองเป็นผู้ขอ/ผู้จัดทำ (แยกหน้าที่)' }
  if (st.approvals.some((a) => a.approver === me.name)) throw { code: 403, msg: 'คุณอนุมัติเอกสารนี้ไปแล้ว — แต่ละขั้นต้องเป็นคนละคน' }
  const step = st.approvals.length + 1
  db.prepare('INSERT INTO doc_approvals (doc_type,doc_id,step,decision,approver,approver_sig,role,note,date,ts) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(docType, Number(docId), step, 'approve', me.name, me.signature || null, me.role || '', req.body?.note || '', todayTH(), nowTS())
  const now = approvalState(docType, docId)
  setDocStatus(docType, docId, now.done ? 'อนุมัติ' : 'รออนุมัติ')
  audit(req, `อนุมัติ ${cfg.label} (ขั้น ${step}/${now.required})`, doc.no || String(docId))
  return now
}
function doReject(docType, docId, req) {
  const cfg = APPROVE_DOCS[docType]; if (!cfg) throw { code: 400, msg: 'ประเภทเอกสารไม่ถูกต้อง' }
  const doc = db.prepare(`SELECT * FROM ${cfg.table} WHERE id=?`).get(Number(docId)); if (!doc) throw { code: 404, msg: 'ไม่พบเอกสาร' }
  const me = db.prepare('SELECT name, signature, role FROM users WHERE id=?').get(req.user.id)
  const st = approvalState(docType, docId)
  if (st.rejected) throw { code: 409, msg: 'ถูกปฏิเสธแล้ว' }
  db.prepare('INSERT INTO doc_approvals (doc_type,doc_id,step,decision,approver,approver_sig,role,note,date,ts) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(docType, Number(docId), st.approvals.length + 1, 'reject', me.name, me.signature || null, me.role || '', req.body?.note || '', todayTH(), nowTS())
  setDocStatus(docType, docId, 'ปฏิเสธ')
  audit(req, `ปฏิเสธ ${cfg.label}`, doc.no || String(docId))
  return approvalState(docType, docId)
}
const attachApproval = (docType) => (r) => r ? { ...r, approval: approvalState(docType, r.id) } : r
// กันโกงแบบ "บล็อกจริง" ตอนออก PO — คืนข้อความถ้าถูกบล็อก, หรือ null ถ้าผ่าน
function poBlockReason(b, ctrl) {
  const amount = Number(b.amount) || 0
  const pr = b.pr_no ? db.prepare('SELECT * FROM purchase_requests WHERE no=?').get(b.pr_no) : null
  // 1) PO เกินยอดที่อนุมัติใน PR
  if (ctrl.enforce_po_over_pr && pr && amount > (pr.amount || 0))
    return `ออก PO ไม่ได้ — ยอด ${baht(amount)} เกินยอดที่อนุมัติใน ${pr.no} (${baht(pr.amount || 0)}) ให้ลดยอดหรือขออนุมัติ PR ใหม่`
  // 2) PO ยอดสูงต้องมีใบเทียบราคาครบ + เลือกผู้ขายจากใบเทียบราคาก่อน
  if (ctrl.enforce_quote && amount >= (ctrl.quote_required_above || Infinity)) {
    if (!pr) return `PO ยอด ${baht(amount)} ต้องอ้างอิงใบขอซื้อ (PR) ที่มีใบเทียบราคาครบ ${ctrl.quote_min} เจ้าก่อน`
    const qc = db.prepare('SELECT COUNT(*) c FROM pr_quotes WHERE pr_id=?').get(pr.id).c
    const chosen = db.prepare('SELECT COUNT(*) c FROM pr_quotes WHERE pr_id=? AND chosen=1').get(pr.id).c
    if (qc < (ctrl.quote_min || 0)) return `ยอด ${baht(amount)} ต้องมีใบเทียบราคาอย่างน้อย ${ctrl.quote_min} เจ้า (ตอนนี้มี ${qc}) — เพิ่มที่ปุ่ม “เทียบราคา” ของ ${pr.no}`
    if (!chosen) return `ต้องเลือกผู้ขายจากใบเทียบราคาของ ${pr.no} ก่อนออก PO`
  }
  // 3) สงสัยแตกใบเลี่ยงเกณฑ์ (ผู้ขาย+บ้านเดียวกัน แต่ละใบต่ำกว่าเกณฑ์ แต่รวมเกิน)
  if (ctrl.enforce_split && b.vendor) {
    const g = db.prepare('SELECT amount FROM purchase_orders WHERE vendor=? AND house_code=?').all(b.vendor, b.house_code || '')
    const all = [...g.map((o) => o.amount || 0), amount]
    const sum = all.reduce((s, x) => s + x, 0)
    const maxOne = Math.max(...all)
    if (g.length >= 1 && maxOne < ctrl.split_threshold && sum >= ctrl.split_threshold)
      return `สงสัยแตกใบเลี่ยงเกณฑ์ — ${b.vendor} มีหลายใบรวม ${baht(sum)} (แต่ละใบต่ำกว่า ${baht(ctrl.split_threshold)}) ให้รวมเป็นใบเดียวหรือขออนุมัติตามยอดจริง`
  }
  return null
}
// เห็นศูนย์ตรวจสอบได้: admin / บัญชี / ผู้จัดการ
function auditView(req, res, next) {
  const u = req.user
  if (u && (u.role === 'admin' || u.role === 'accounting' || isManager(u))) return next()
  res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงศูนย์ตรวจสอบ' })
}
// ประเมินผล KPI (PMS): เข้าได้เฉพาะ ธวัช วรรณสุข เท่านั้น
function isPmsOwner(u) { return !!u && (u.username === 'thawat' || u.name === 'ธวัช วรรณสุข') }
function pmsOnly(req, res, next) {
  if (isPmsOwner(req.user)) return next()
  res.status(403).json({ error: 'หน้าประเมินผล KPI เข้าได้เฉพาะผู้ที่ได้รับสิทธิ์เท่านั้น' })
}

// ---------- houses + installments ----------
// per-category value breakdown (ตัวบ้าน / โรงจอดรถ / ถนน-รั้ว) for each side
function houseBreakdown(h) {
  // ตัวบ้าน = ยอดก้อน house_customer/house_contractor (รองรับข้อมูลเก่าที่เคยคิดจากราคา/ตร.ม.)
  const bodyC = h.house_customer || (h.area_sqm && h.price_customer ? h.area_sqm * h.price_customer : 0)
  const bodyCon = h.house_contractor || (h.area_sqm && h.price_contractor ? h.area_sqm * h.price_contractor : 0)
  return [
    { key: 'house', label: 'ตัวบ้าน', customer: bodyC, contractor: bodyCon },
    { key: 'carport', label: 'โรงจอดรถ', customer: h.carport_customer || 0, contractor: h.carport_contractor || 0 },
    { key: 'road', label: 'ถนน / รั้ว', customer: h.road_customer || 0, contractor: h.road_contractor || 0 },
  ]
}
// add computed profit (customer value − contractor cost) + category breakdown
function withProfit(h) {
  return { ...h, profit: (h.value || 0) - (h.contractor_value || 0), breakdown: houseBreakdown(h) }
}
api.get('/houses', (req, res) => {
  const mgr = isManager(req.user) // profit (กำไร) visible to ผู้จัดการ/admin only
  res.json(db.prepare('SELECT * FROM houses ORDER BY id').all().map((h) => {
    const row = withProfit(h)
    return mgr ? row : { ...row, profit: null }
  }))
})

// recompute a house's money fields from its two-sided installments + 3-category pricing
function recomputeHouse(code) {
  const h = db.prepare('SELECT * FROM houses WHERE code=?').get(code)
  if (!h) return
  const sumOf = (side, status) =>
    db.prepare(`SELECT COALESCE(SUM(amount),0) a FROM installments WHERE house_code=? AND side=?${status ? ' AND status=?' : ''}`)
      .get(...(status ? [code, side, status] : [code, side])).a
  const custTotal = sumOf('customer')
  // collected / paid = ผลรวมยอดที่จ่าย/เก็บจริง (paid) รองรับจ่ายบางส่วน
  const sumPaid = (side) => db.prepare("SELECT COALESCE(SUM(paid),0) a FROM installments WHERE house_code=? AND side=?").get(code, side).a
  const collected = sumPaid('customer')
  const paid = sumPaid('contractor')
  // total value = sum of the 3 categories (ตัวบ้าน + โรงจอดรถ + ถนน/รั้ว) per side
  // โครงการแบบควบคุมงาน (CM): มูลค่า = ค่าบริการควบคุมงาน (ไม่มีต้นทุนช่าง)
  const isCM = h.kind === 'cm'
  const bd = houseBreakdown(h)
  const computedCustomer = isCM ? (h.service_fee || 0) : bd.reduce((s, c) => s + c.customer, 0)
  const contractorValue = isCM ? 0 : bd.reduce((s, c) => s + c.contractor, 0)
  // fall back to งวดงาน total / existing value if no category prices entered yet
  const value = computedCustomer > 0 ? computedCustomer : custTotal || h.value || 0
  const remain = Math.max(0, value - collected)
  // ความคืบหน้า (%) ผูกกับงวดงาน — คิดจากสัดส่วนเงินที่เก็บจากลูกค้าแล้ว
  const pct = value > 0 ? Math.min(100, Math.round((collected / value) * 100)) : (h.pct || 0)
  db.prepare('UPDATE houses SET value=?, collected=?, remain=?, contractor_value=?, paid=?, pct=? WHERE code=?')
    .run(value, collected, remain, contractorValue, paid, pct, code)
}

const HOUSE_NUM_FIELDS = ['house_customer', 'house_contractor', 'carport_customer', 'carport_contractor', 'road_customer', 'road_contractor']

api.post('/houses', canWrite, (req, res) => {
  const b = req.body || {}
  if (!b.name) return res.status(400).json({ error: 'กรุณากรอกชื่อบ้าน' })
  const v = Number(b.value) || 0
  const code = b.code?.trim() || 'NEW-' + String(Date.now()).slice(-4)
  const kind = b.kind === 'cm' ? 'cm' : 'sale'
  const info = db
    .prepare('INSERT INTO houses (code,name,project,customer,value,pct,collected,remain,status,area,design,start_date,deliver_date,manager,kind,owner,contract_no,scope,engineer,supervisor,service_fee,site_location) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(code, b.name, b.project || '', b.customer || '', v, Number(b.pct) || 0, 0, v, b.status || 'เพิ่งเริ่ม', b.area || '', b.design || '', b.start_date || '', b.deliver_date || '', b.manager || '', kind, b.owner || '', b.contract_no || '', b.scope || '', b.engineer || '', b.supervisor || '', Number(b.service_fee) || 0, b.site_location || '')
  for (const k of HOUSE_NUM_FIELDS) if (b[k] != null) db.prepare(`UPDATE houses SET ${k}=? WHERE code=?`).run(Number(b[k]) || 0, code)
  recomputeHouse(code)
  audit(req, 'เพิ่มบ้าน', b.name)
  res.status(201).json(withProfit(db.prepare('SELECT * FROM houses WHERE id = ?').get(info.lastInsertRowid)))
})

api.put('/houses/:id', canWrite, (req, res) => {
  const h = db.prepare('SELECT * FROM houses WHERE id = ?').get(req.params.id)
  if (!h) return res.status(404).json({ error: 'ไม่พบบ้าน' })
  const b = req.body || {}
  const f = (k, num) => (b[k] != null && b[k] !== '' ? (num ? Number(b[k]) : b[k]) : h[k])
  db.prepare(`UPDATE houses SET name=?, project=?, customer=?, value=?, pct=?, status=?, area=?, design=?, start_date=?, deliver_date=?, manager=?, kind=?, owner=?, contract_no=?, scope=?, engineer=?, supervisor=?, service_fee=?, site_location=?, photo=? WHERE id=?`)
    .run(f('name'), f('project'), f('customer'), f('value', true), b.pct != null && b.pct !== '' ? Number(b.pct) : h.pct, f('status'), f('area'), f('design'), f('start_date'), f('deliver_date'), f('manager'), b.kind === 'cm' || b.kind === 'sale' ? b.kind : h.kind, f('owner'), f('contract_no'), f('scope'), f('engineer'), f('supervisor'), f('service_fee', true), f('site_location'), b.photo != null ? b.photo : h.photo, h.id)
  for (const k of HOUSE_NUM_FIELDS) db.prepare(`UPDATE houses SET ${k}=? WHERE id=?`).run(f(k, true) || 0, h.id)
  recomputeHouse(h.code)
  audit(req, 'แก้ไขบ้าน', h.name)
  res.json(withProfit(db.prepare('SELECT * FROM houses WHERE id = ?').get(h.id)))
})

api.get('/houses/:code/installments', (req, res) =>
  res.json(db.prepare('SELECT * FROM installments WHERE house_code = ? ORDER BY side DESC, no').all(req.params.code))
)
// หัวข้อใหญ่ (หมวดงวดงาน) ที่เพิ่มเองของบ้านนี้
api.get('/houses/:code/inst-cats', (req, res) =>
  res.json(db.prepare('SELECT id,label FROM house_categories WHERE house_code=? ORDER BY id').all(req.params.code))
)
api.post('/houses/:code/inst-cats', canWrite, (req, res) => {
  const label = String(req.body?.label || '').trim()
  if (!label) return res.status(400).json({ error: 'กรุณากรอกชื่อหัวข้อ' })
  if (['ตัวบ้าน', 'โรงจอดรถ', 'ถนน / รั้ว'].includes(label)) return res.status(400).json({ error: 'มีหัวข้อนี้อยู่แล้ว (หมวดมาตรฐาน)' })
  const dup = db.prepare('SELECT id FROM house_categories WHERE house_code=? AND label=?').get(req.params.code, label)
  if (dup) return res.status(400).json({ error: 'มีหัวข้อนี้อยู่แล้ว' })
  const info = db.prepare('INSERT INTO house_categories (house_code,label,created) VALUES (?,?,?)').run(req.params.code, label, todayTH())
  audit(req, 'เพิ่มหัวข้องวดงาน', label)
  res.status(201).json(db.prepare('SELECT id,label FROM house_categories WHERE id=?').get(info.lastInsertRowid))
})
api.delete('/houses/:code/inst-cats/:id', canWrite, (req, res) => {
  const cat = db.prepare('SELECT * FROM house_categories WHERE id=? AND house_code=?').get(req.params.id, req.params.code)
  if (!cat) return res.status(404).json({ error: 'ไม่พบหัวข้อ' })
  const used = db.prepare('SELECT COUNT(*) c FROM installments WHERE house_code=? AND category=?').get(req.params.code, cat.label).c
  if (used > 0) return res.status(400).json({ error: `ยังมีงวดงาน ${used} งวดอยู่ในหัวข้อนี้ — ลบงวดในหัวข้อก่อน` })
  db.prepare('DELETE FROM house_categories WHERE id=?').run(cat.id)
  audit(req, 'ลบหัวข้องวดงาน', cat.label)
  res.json({ ok: true })
})
api.post('/houses/:code/installments', canWrite, (req, res) => {
  const b = req.body || {}
  const side = b.side === 'contractor' ? 'contractor' : 'customer'
  // หมวดมาตรฐาน 3 อย่าง หรือหัวข้อใหญ่ที่ผู้ใช้เพิ่มเอง (ใช้ชื่อหัวข้อเป็น category ได้เลย)
  const category = (b.category != null && String(b.category).trim()) ? String(b.category).trim() : 'house'
  const defStatus = side === 'contractor' ? 'รอจ่าย' : 'รอเก็บเงิน'
  const dueIso = /^\d{4}-\d{2}-\d{2}$/.test(String(b.due_iso || '')) ? b.due_iso : null
  const dueDisp = b.due || (dueIso ? thDateFromISO(dueIso) : 'กำหนดใหม่')
  const info = db
    .prepare('INSERT INTO installments (house_code,no,detail,days,due,due_iso,ontime,amount,status,side,category,contractor,paid) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)')
    .run(req.params.code, Number(b.no) || 0, b.detail || '', String(b.days || '-'), dueDisp, dueIso, '-', Number(b.amount) || 0, b.status || defStatus, side, category, b.contractor || '')
  recomputeHouse(req.params.code)
  res.status(201).json(db.prepare('SELECT * FROM installments WHERE id = ?').get(info.lastInsertRowid))
})
// นำเข้างวดงานเป็นชุด (bulk) — จาก Excel/วางข้อความ หรือจากที่ AI อ่านสัญญามา
api.post('/houses/:code/installments/bulk', canWrite, (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : []
  if (!items.length) return res.status(400).json({ error: 'ไม่มีงวดงานให้นำเข้า' })
  const ins = db.prepare('INSERT INTO installments (house_code,no,detail,days,due,due_iso,ontime,amount,status,side,category,contractor,paid) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)')
  let n = 0
  db.transaction(() => {
    for (const it of items) {
      const side = it.side === 'contractor' ? 'contractor' : 'customer'
      const category = (it.category != null && String(it.category).trim()) ? String(it.category).trim() : 'house'
      const dueIso = /^\d{4}-\d{2}-\d{2}$/.test(String(it.due_iso || '')) ? it.due_iso : null
      const dueDisp = it.due || (dueIso ? thDateFromISO(dueIso) : 'กำหนดใหม่')
      const amount = Number(String(it.amount).replace(/,/g, '')) || 0
      if (!String(it.detail || '').trim() && amount <= 0) continue
      ins.run(req.params.code, Number(it.no) || (n + 1), String(it.detail || ''), String(it.days || '-'), dueDisp, dueIso, '-', amount, side === 'contractor' ? 'รอจ่าย' : 'รอเก็บเงิน', side, category, String(it.contractor || ''))
      n++
    }
  })()
  recomputeHouse(req.params.code)
  audit(req, 'นำเข้างวดงาน', `${req.params.code} ${n} งวด`)
  res.json({ ok: true, count: n })
})
// ให้ AI อ่านตารางงวดงานจากสัญญา (PDF/รูป) → คืน JSON งวดงานให้พรีวิว
const EXTRACT_PROMPT = `คุณเป็นผู้ช่วยกรอกข้อมูลงวดงานก่อสร้างจากสัญญา อ่าน "ตารางงวดการชำระเงิน/งวดงาน" ในเอกสารนี้ แล้วสรุปเป็น JSON เท่านั้น ห้ามมีข้อความอื่น
รูปแบบ: {"installments":[{"no":1,"detail":"รายละเอียดงานงวดนี้","amount":238000,"side":"customer"}]}
กติกา:
- amount เป็นตัวเลขล้วน ไม่มีคอมม่า
- side = "customer" สำหรับงวดที่ลูกค้าจ่ายให้เรา (งวดขาย/งวดลูกค้า), "contractor" สำหรับงวดที่เราจ่ายให้ช่าง ถ้าไม่ชัดให้ใช้ "customer"
- detail = ข้อความสรุปงานของงวดนั้นตามที่เขียนในสัญญา
- ถ้ามีวันครบกำหนดชัดเจน ใส่ "due_iso":"YYYY-MM-DD"
- เรียงตามลำดับงวด ถ้าไม่พบตารางงวดงานเลย ให้คืน {"installments":[]}`
function extractJsonBlock(text) {
  if (!text) return null
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}
api.post('/houses/:code/installments/extract', canWrite, express.raw({ type: 'application/octet-stream', limit: '40mb' }), async (req, res) => {
  const key = getSetting('ai_api_key', '') || process.env.ANTHROPIC_API_KEY || ''
  if (!key) return res.status(400).json({ error: 'ยังไม่ได้ตั้งค่ากุญแจ AI (ไปที่ ตรวจสอบ → ตั้งค่า AI) — หรือใช้วิธี “วางจาก Excel” แทนได้' })
  const buf = req.body
  if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'ไฟล์ไม่ถูกต้อง' })
  const mime = String(req.query.mime || 'application/pdf')
  const b64 = buf.toString('base64')
  const media = mime.includes('pdf')
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: mime.startsWith('image/') ? mime : 'image/jpeg', data: b64 } }
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: getSetting('ai_model', 'claude-3-5-sonnet-latest'), max_tokens: 4000, messages: [{ role: 'user', content: [media, { type: 'text', text: EXTRACT_PROMPT }] }] }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(502).json({ error: 'AI: ' + (data?.error?.message || ('HTTP ' + r.status)) })
    const text = (data.content || []).map((c) => c.text || '').join('')
    const parsed = extractJsonBlock(text)
    const items = (parsed?.installments || parsed || []).map((it, i) => ({ no: Number(it.no) || i + 1, detail: String(it.detail || ''), amount: Number(String(it.amount).toString().replace(/,/g, '')) || 0, side: it.side === 'contractor' ? 'contractor' : 'customer', due_iso: /^\d{4}-\d{2}-\d{2}$/.test(String(it.due_iso || '')) ? it.due_iso : '' }))
    audit(req, 'AI อ่านงวดงานจากสัญญา', `${req.params.code} ${items.length} งวด`)
    res.json({ items })
  } catch (e) { res.status(502).json({ error: 'เรียก AI ไม่สำเร็จ: ' + e.message }) }
})
// ตั้งค่ากุญแจ AI (admin) — เก็บใน settings
api.get('/ai-settings', adminOnly, (_req, res) => res.json({ hasKey: !!(getSetting('ai_api_key', '') || process.env.ANTHROPIC_API_KEY), model: getSetting('ai_model', 'claude-3-5-sonnet-latest') }))
api.post('/ai-settings', adminOnly, (req, res) => {
  if (req.body?.api_key != null) setSetting('ai_api_key', String(req.body.api_key || ''))
  if (req.body?.model) setSetting('ai_model', String(req.body.model))
  audit(req, 'ตั้งค่า AI', req.body?.model || '')
  res.json({ ok: true, hasKey: !!(getSetting('ai_api_key', '') || process.env.ANTHROPIC_API_KEY) })
})
// edit an installment (รายละเอียด/วัน/กำหนด/จำนวนเงิน/สถานะ)
api.put('/installments/:id', canWrite, (req, res) => {
  const inst = db.prepare('SELECT * FROM installments WHERE id=?').get(req.params.id)
  if (!inst) return res.status(404).json({ error: 'ไม่พบงวดงาน' })
  const b = req.body || {}
  const f = (k, num) => (b[k] != null && b[k] !== '' ? (num ? Number(b[k]) : b[k]) : inst[k])
  const dueIso = /^\d{4}-\d{2}-\d{2}$/.test(String(b.due_iso || '')) ? b.due_iso : inst.due_iso
  const dueDisp = b.due != null && b.due !== '' ? b.due : (dueIso && (!inst.due || inst.due === 'กำหนดใหม่' || b.due_iso) ? thDateFromISO(dueIso) : inst.due)
  db.prepare('UPDATE installments SET no=?, detail=?, days=?, due=?, due_iso=?, amount=?, status=?, contractor=? WHERE id=?')
    .run(f('no', true), f('detail'), String(f('days')), dueDisp, dueIso, f('amount', true), f('status'), f('contractor'), inst.id)
  recomputeHouse(inst.house_code)
  try { acct.syncInstallmentJournal(db.prepare('SELECT * FROM installments WHERE id=?').get(inst.id)) } catch (e) { console.error('journal(inst-edit):', e.message) }
  audit(req, 'แก้ไขงวดงาน', `${inst.house_code} งวด ${inst.no}`)
  res.json(db.prepare('SELECT * FROM installments WHERE id=?').get(inst.id))
})
api.delete('/installments/:id', canWrite, (req, res) => {
  const inst = db.prepare('SELECT * FROM installments WHERE id=?').get(req.params.id)
  if (!inst) return res.status(404).json({ error: 'ไม่พบงวดงาน' })
  db.prepare('DELETE FROM installments WHERE id=?').run(inst.id)
  recomputeHouse(inst.house_code)
  try { acct.removeAutoJournal('inst', inst.id) } catch (e) { console.error('journal(inst-del):', e.message) }
  audit(req, 'ลบงวดงาน', `${inst.house_code} งวด ${inst.no}`)
  res.json({ ok: true })
})
// status label for an installment based on side + how much is paid
function instStatus(side, amount, paid) {
  const isCon = side === 'contractor'
  if (paid >= amount && amount > 0) return isCon ? 'จ่ายแล้ว' : 'เก็บแล้ว'
  if (paid > 0) return isCon ? 'จ่ายบางส่วน' : 'เก็บบางส่วน'
  return isCon ? 'รอจ่าย' : 'รอเก็บเงิน'
}
// mark collected/paid IN FULL (or reset) → updates the house money
api.post('/installments/:id/collect', canWrite, (req, res) => {
  const inst = db.prepare('SELECT * FROM installments WHERE id=?').get(req.params.id)
  if (!inst) return res.status(404).json({ error: 'ไม่พบงวดงาน' })
  const done = req.body?.uncollect ? false : true
  const isContractor = inst.side === 'contractor'
  // บังคับตรวจรับก่อนเก็บเงิน (เฉพาะฝั่งลูกค้า ตอนเก็บ ไม่ใช่ตอนยกเลิก)
  if (done && !isContractor && controls().require_acceptance && !acceptanceOk(inst.id)) {
    return res.status(409).json({ error: 'ยังเบิก/เก็บเงินงวดนี้ไม่ได้ — ต้องตรวจรับงวดงานให้ผ่านก่อน (กดปุ่ม “ตรวจรับ” ที่งวดนี้)' })
  }
  const paid = done ? inst.amount : 0
  const status = instStatus(inst.side, inst.amount, paid)
  db.prepare('UPDATE installments SET status=?, paid=?, ontime=? WHERE id=?')
    .run(status, paid, done && !isContractor ? 'ตรงเวลา' : inst.ontime, inst.id)
  recomputeHouse(inst.house_code)
  try { acct.syncInstallmentJournal(db.prepare('SELECT * FROM installments WHERE id=?').get(inst.id)) } catch (e) { console.error('journal(collect):', e.message) }
  audit(req, done ? (isContractor ? 'จ่ายช่าง' : 'เก็บเงินงวด') : 'ยกเลิก', `${inst.house_code} งวด ${inst.no}`)
  res.json(db.prepare('SELECT * FROM installments WHERE id=?').get(inst.id))
})
// add a PARTIAL payment to an installment (จ่าย/เก็บทีละบางส่วน). amount can be negative to reverse.
api.post('/installments/:id/pay', canWrite, (req, res) => {
  const inst = db.prepare('SELECT * FROM installments WHERE id=?').get(req.params.id)
  if (!inst) return res.status(404).json({ error: 'ไม่พบงวดงาน' })
  const add = Number(req.body?.amount) || 0
  if (add > 0 && inst.side !== 'contractor' && controls().require_acceptance && !acceptanceOk(inst.id)) {
    return res.status(409).json({ error: 'ยังเก็บเงินงวดนี้ไม่ได้ — ต้องตรวจรับงวดงานให้ผ่านก่อน' })
  }
  const paid = Math.max(0, Math.min(inst.amount, (inst.paid || 0) + add))
  const status = instStatus(inst.side, inst.amount, paid)
  db.prepare('UPDATE installments SET paid=?, status=? WHERE id=?').run(paid, status, inst.id)
  recomputeHouse(inst.house_code)
  try { acct.syncInstallmentJournal(db.prepare('SELECT * FROM installments WHERE id=?').get(inst.id)) } catch (e) { console.error('journal(pay):', e.message) }
  audit(req, inst.side === 'contractor' ? 'จ่ายช่างบางส่วน' : 'เก็บเงินบางส่วน', `${inst.house_code} งวด ${inst.no} +${add}`)
  res.json(db.prepare('SELECT * FROM installments WHERE id=?').get(inst.id))
})

api.get('/installments', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT i.*, h.name AS house, h.project FROM installments i
       LEFT JOIN houses h ON h.code = i.house_code ORDER BY i.id`
    )
    .all()
  res.json(rows)
})

// ---------- issues ----------
api.get('/issues', (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT s.*, h.name AS house, h.project FROM issues s
         LEFT JOIN houses h ON h.code = s.house_code ORDER BY s.id DESC`
      )
      .all()
  )
})
api.post('/issues', canWrite, (req, res) => {
  const { house_code, title, note, priority } = req.body || {}
  if (!title) return res.status(400).json({ error: 'กรุณากรอกหัวข้อปัญหา' })
  const info = db
    .prepare('INSERT INTO issues (house_code,title,note,by,date,priority,status) VALUES (?,?,?,?,?,?,?)')
    .run(house_code || '', title, note || '', req.user.name, 'วันนี้', priority || 'ทั่วไป', 'รอช่าง')
  res.status(201).json(db.prepare('SELECT * FROM issues WHERE id = ?').get(info.lastInsertRowid))
})

// ---------- expenses ----------
api.get('/expenses', (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT e.*, h.name AS house FROM expenses e
         LEFT JOIN houses h ON h.code = e.house_code ORDER BY e.id DESC`
      )
      .all().map(attachApproval('expense'))
  )
})
api.post('/expenses', canWrite, (req, res) => {
  const { house_code, item, cat, vendor, amount, date } = req.body || {}
  if (!item) return res.status(400).json({ error: 'กรุณากรอกรายการ' })
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : todayISO()
  const info = db
    .prepare('INSERT INTO expenses (date,house_code,item,cat,vendor,amount,date_iso) VALUES (?,?,?,?,?,?,?)')
    .run(thDateFromISO(iso), house_code || '', item, cat || 'อื่นๆ', vendor || '', Number(amount) || 0, iso)
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid)
  try { acct.syncExpenseJournal(row) } catch (e) { console.error('journal(expense):', e.message) }
  res.status(201).json(row)
})

// ---------- ระบบบัญชีคู่ (General Ledger) — เฟส 1 ----------
const acctRange = (req) => ({ from: req.query.from || undefined, to: req.query.to || undefined })
// ผังบัญชี
api.get('/accounts', financeOnly, (_req, res) => res.json(acct.listAccounts()))
api.post('/accounts', financeOnly, (req, res) => {
  const { code, name, type, parent } = req.body || {}
  if (!code || !name || !type) return res.status(400).json({ error: 'ต้องระบุ รหัส/ชื่อ/ประเภทบัญชี' })
  if (!['asset', 'liability', 'equity', 'revenue', 'cost', 'expense'].includes(type)) return res.status(400).json({ error: 'ประเภทบัญชีไม่ถูกต้อง' })
  if (db.prepare('SELECT code FROM accounts WHERE code=?').get(code)) return res.status(409).json({ error: 'มีรหัสบัญชีนี้แล้ว' })
  db.prepare('INSERT INTO accounts (code,name,type,parent,is_active,builtin) VALUES (?,?,?,?,1,0)').run(String(code), name, type, parent || null)
  audit(req, 'เพิ่มผังบัญชี', `${code} ${name}`)
  res.status(201).json(db.prepare('SELECT * FROM accounts WHERE code=?').get(code))
})
// สมุดรายวัน
api.get('/journal', financeOnly, (req, res) => res.json(acct.listJournal({ ...acctRange(req), source: req.query.source || undefined, limit: Number(req.query.limit) || 500 })))
api.post('/journal', financeOnly, (req, res) => {
  const { date_iso, memo, house_code, lines } = req.body || {}
  try {
    const id = acct.postJournal({ date_iso, memo, house_code, source: 'manual', by: req.user.name, lines })
    audit(req, 'บันทึกรายการบัญชี (สมุดรายวัน)', memo || `#${id}`)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
api.post('/journal/:id/void', financeOnly, (req, res) => {
  const e = db.prepare('SELECT * FROM journal_entries WHERE id=?').get(req.params.id)
  if (!e) return res.status(404).json({ error: 'ไม่พบรายการ' })
  if (e.source && e.source !== 'manual') return res.status(400).json({ error: 'รายการอัตโนมัติยกเลิกจากเอกสารต้นทาง (แก้ที่งวดงาน/รายจ่าย)' })
  db.prepare('UPDATE journal_entries SET void=1 WHERE id=?').run(e.id)
  audit(req, 'ยกเลิกรายการบัญชี', e.no)
  res.json({ ok: true })
})
// แยกประเภท / งบทดลอง / งบการเงิน
api.get('/gl/:account', financeOnly, (req, res) => res.json(acct.ledgerOf(req.params.account, acctRange(req))))
api.get('/trial-balance', financeOnly, (req, res) => res.json(acct.trialBalance(acctRange(req))))
api.get('/income-statement', financeOnly, (req, res) => res.json(acct.incomeStatement(acctRange(req))))
api.get('/balance-sheet', financeOnly, (req, res) => res.json(acct.balanceSheet(acctRange(req))))
api.get('/cash-flow', financeOnly, (req, res) => res.json(acct.cashFlow(acctRange(req))))
api.get('/project-pnl', financeOnly, (req, res) => res.json(acct.projectPnl(acctRange(req))))
// เฟส 3: หลายบัญชีเงินสด/ธนาคาร + ค่าตั้งต้น
api.get('/cash-accounts', financeOnly, (_req, res) => res.json(acct.cashAccounts()))
api.get('/acct-defaults', financeOnly, (_req, res) => res.json({ bank: acct.defaultBank(), cash: acct.defaultCash() }))
api.post('/acct-defaults', financeOnly, (req, res) => { acct.setDefaults({ bank: req.body?.bank, cash: req.body?.cash }); audit(req, 'ตั้งค่าบัญชีเงินตั้งต้น', `ธนาคาร ${req.body?.bank || '-'} เงินสด ${req.body?.cash || '-'}`); res.json({ ok: true }) })
// เฟส 3: กระทบยอดธนาคาร
api.get('/reconcile/:account', financeOnly, (req, res) => res.json(acct.reconcileLines(req.params.account)))
api.post('/reconcile', financeOnly, (req, res) => { const n = acct.setReconciled(req.body?.ids || [], !!req.body?.reconciled); res.json({ ok: true, count: n }) })
// เฟส 3: ลูกหนี้/เจ้าหนี้คงค้าง + อายุหนี้
api.get('/ar-aging', financeOnly, (_req, res) => res.json(acct.arAging()))
api.get('/ap-aging', financeOnly, (_req, res) => res.json(acct.apAging()))
// เฟส 4: สินทรัพย์ถาวร + ค่าเสื่อมราคา
api.get('/assets', financeOnly, (_req, res) => res.json(acct.listAssets()))
api.post('/assets', financeOnly, (req, res) => { try { const a = acct.addAsset(req.body || {}, req.user.name); audit(req, 'เพิ่มสินทรัพย์ถาวร', a.name); res.status(201).json(a) } catch (e) { res.status(400).json({ error: e.message }) } })
api.post('/assets/:id/dispose', financeOnly, (req, res) => { try { acct.disposeAsset(req.params.id, req.body?.date); audit(req, 'จำหน่ายสินทรัพย์', req.params.id); res.json({ ok: true }) } catch (e) { res.status(400).json({ error: e.message }) } })
api.post('/assets/run-depreciation', financeOnly, (req, res) => { try { const r = acct.runDepreciation(req.body?.asOf, req.user.name); audit(req, 'ลงค่าเสื่อมราคา', `${r.assets} รายการ ${r.totalDepreciation}`); res.json(r) } catch (e) { res.status(400).json({ error: e.message }) } })
// เฟส 4: ปิดงวด / ปิดปี / ยอดยกมา
api.get('/closing', financeOnly, (_req, res) => res.json({ closedThrough: acct.closedThrough() }))
api.post('/closing/lock', financeOnly, (req, res) => { acct.setClosedThrough(req.body?.date || ''); audit(req, 'ปิดงวดบัญชี', req.body?.date || 'ยกเลิกล็อก'); res.json({ ok: true, closedThrough: acct.closedThrough() }) })
api.post('/closing/opening', financeOnly, (req, res) => { try { const id = acct.postOpening(req.body?.balances, req.body?.date, req.user.name); audit(req, 'บันทึกยอดยกมา', `#${id}`); res.json({ ok: true, id }) } catch (e) { res.status(400).json({ error: e.message }) } })
api.post('/closing/year-end', financeOnly, (req, res) => { try { const id = acct.closeYear(req.body?.date, req.user.name); audit(req, 'ปิดบัญชีสิ้นปี', req.body?.date); res.json({ ok: true, id }) } catch (e) { res.status(400).json({ error: e.message }) } })
// เฟส 4: สรุปภาษี
api.get('/tax-summary', financeOnly, (req, res) => res.json(acct.taxSummary(acctRange(req))))
// เงินสดย่อย (ส่วนกลาง) — ตั้งวงเงิน / จ่าย / เติมให้เต็ม
api.get('/petty-cash', financeOnly, (_req, res) => res.json(acct.pettyState()))
api.post('/petty-cash/float', financeOnly, (req, res) => { acct.setPettyFloat(req.body?.float); audit(req, 'ตั้งวงเงินสดย่อย', String(req.body?.float || '')); res.json(acct.pettyState()) })
api.post('/petty-cash/expense', financeOnly, (req, res) => { try { acct.pettyExpense({ ...(req.body || {}), by: req.user.name }); audit(req, 'จ่ายเงินสดย่อย', `${req.body?.item || ''} ${req.body?.amount || ''}`); res.json(acct.pettyState()) } catch (e) { res.status(400).json({ error: e.message }) } })
api.post('/petty-cash/topup', financeOnly, (req, res) => { try { const r = acct.pettyTopup({ ...(req.body || {}), by: req.user.name }); audit(req, 'เติมเงินสดย่อย', String(r.amount)); res.json({ ...acct.pettyState(), added: r.amount }) } catch (e) { res.status(400).json({ error: e.message }) } })
api.get('/petty-cash/statement', financeOnly, (req, res) => res.json(acct.pettyStatement({ from: req.query.from || undefined, to: req.query.to || undefined })))
// สร้าง/ซ่อมรายการบัญชีอัตโนมัติจากข้อมูลเดิมทั้งหมด (idempotent)
api.post('/accounting/rebuild', financeOnly, (req, res) => {
  try { const n = acct.retroPostAll(); audit(req, 'สร้างบัญชีจากข้อมูลเดิม', `${n} รายการ`); res.json({ ok: true, count: n }) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

// ---------- HR ----------
// list excludes the PIN; includes signature + computed sso/tax for display
const EMP_COLS = 'id,code,name,role,dept,start,status,pay_type,base,ot,sso,tax,sick_quota,sick_used,personal_quota,personal_used,vacation_quota,vacation_used,signature,spouse,children,bank_name,bank_acct,tax_id,retention,student_loan,retention_opening,work_days,backup_code'
api.get('/employees', (req, res) => {
  const rows = db.prepare(`SELECT ${EMP_COLS} FROM employees ORDER BY id`).all()
  const showSalary = canSeeSalary(req.user)
  res.json(rows.map((e) => {
    const has_pin = !!db.prepare('SELECT pin FROM employees WHERE id=?').get(e.id)?.pin
    // hide salary figures from users without salary permission
    if (!showSalary) return { ...e, base: null, ot: null, sso: null, tax: null, has_pin }
    return { ...e, has_pin }
  }))
})

// leave policy: ลากิจ 3 วัน/ปี เสมอ · พักร้อน 3 วัน (อายุงาน < 1 ปี) หรือ 6 วัน (ครบ 1 ปี)
function leaveQuota(startDate) {
  const start = startDate ? new Date(startDate) : null
  let years = 0
  if (start && !isNaN(start.getTime())) years = (Date.now() - start.getTime()) / (365.25 * 86400000)
  return { personal: 3, vacation: years >= 1 ? 6 : 3, tenureYears: years }
}

api.post('/employees', canWrite, (req, res) => {
  const b = req.body || {}
  if (!b.name) return res.status(400).json({ error: 'กรุณากรอกชื่อพนักงาน' })
  // next code from the highest existing EMP-### (avoids reuse after deletions)
  const maxNum = db.prepare("SELECT code FROM employees WHERE code LIKE 'EMP-%'").all()
    .reduce((m, r) => Math.max(m, parseInt(String(r.code).slice(4), 10) || 0), 0)
  const code = 'EMP-' + String(maxNum + 1).padStart(3, '0')
  const payType = b.pay_type === 'รายวัน' ? 'รายวัน' : 'รายเดือน'
  const q = leaveQuota(b.start)
  const base = Number(b.base) || 0
  const mBase = monthlyBaseOf(base, payType)
  const sso = ssoOf(mBase)
  const spouse = b.spouse ? 1 : 0
  const children = Number(b.children) || 0
  const tax = taxMonthlyOf(mBase, sso, allowanceOf({ spouse, children }))
  const pinPlain = String(b.pin || Math.floor(1000 + Math.random() * 9000)) // 4-digit PIN; auto if blank
  const sig = typeof b.signature === 'string' && b.signature.startsWith('data:image/') ? b.signature : null
  const info = db
    .prepare(`INSERT INTO employees (code,name,role,dept,start,status,base,ot,sso,tax,pay_type,
              sick_quota,sick_used,personal_quota,personal_used,vacation_quota,vacation_used,pin,signature,spouse,children,bank_name,bank_acct,tax_id,retention,student_loan,retention_opening,work_days,backup_code)
              VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(code, b.name, b.role || '', b.dept || b.role || '', b.start || todayTH(), b.status || 'ทดลองงาน',
      base, sso, tax, payType,
      Number(b.sick_quota) || 30, Number(b.sick_used) || 0,
      q.personal, Number(b.personal_used) || 0,
      q.vacation, Number(b.vacation_used) || 0, hashPin(pinPlain), sig, spouse, children,
      b.bank_name || '', b.bank_acct || '', b.tax_id || '',
      b.retention != null && b.retention !== '' ? Number(b.retention) : 500, Number(b.student_loan) || 0,
      b.retention_opening != null && b.retention_opening !== '' ? Number(b.retention_opening) : 0,
      Number(b.work_days) || 0, b.backup_code || '')
  audit(req, 'เพิ่มพนักงาน', b.name)
  const out = db.prepare(`SELECT ${EMP_COLS} FROM employees WHERE id=?`).get(info.lastInsertRowid)
  res.status(201).json({ ...out, pin: pinPlain }) // return the PIN once so it can be shown to the user
})
// edit an employee (recomputes sso/tax from the new base)
api.put('/employees/:id', canWrite, (req, res) => {
  const e = db.prepare('SELECT * FROM employees WHERE id=?').get(req.params.id)
  if (!e) return res.status(404).json({ error: 'ไม่พบพนักงาน' })
  const b = req.body || {}
  const payType = b.pay_type === 'รายวัน' ? 'รายวัน' : b.pay_type === 'รายเดือน' ? 'รายเดือน' : e.pay_type
  const base = b.base != null && b.base !== '' ? Number(b.base) : e.base
  const spouse = b.spouse != null ? (b.spouse ? 1 : 0) : e.spouse
  const children = b.children != null && b.children !== '' ? Number(b.children) : e.children
  const mBase = monthlyBaseOf(base, payType)
  const sso = ssoOf(mBase)
  const tax = taxMonthlyOf(mBase, sso, allowanceOf({ spouse, children }))
  const retention = b.retention != null && b.retention !== '' ? Number(b.retention) : e.retention
  const studentLoan = b.student_loan != null && b.student_loan !== '' ? Number(b.student_loan) : e.student_loan
  const retentionOpening = b.retention_opening != null && b.retention_opening !== '' ? Number(b.retention_opening) : e.retention_opening
  const workDays = b.work_days != null && b.work_days !== '' ? Number(b.work_days) : e.work_days
  const backupCode = b.backup_code != null ? b.backup_code : e.backup_code
  db.prepare('UPDATE employees SET name=?, role=?, dept=?, status=?, pay_type=?, base=?, sso=?, tax=?, spouse=?, children=?, bank_name=?, bank_acct=?, tax_id=?, retention=?, student_loan=?, retention_opening=?, work_days=?, backup_code=? WHERE id=?')
    .run(b.name ?? e.name, b.role ?? e.role, b.dept ?? e.dept, b.status ?? e.status, payType, base, sso, tax, spouse, children,
      b.bank_name ?? e.bank_name, b.bank_acct ?? e.bank_acct, b.tax_id ?? e.tax_id, retention, studentLoan, retentionOpening, workDays, backupCode, e.id)
  audit(req, 'แก้ไขพนักงาน', b.name ?? e.name)
  res.json(db.prepare(`SELECT ${EMP_COLS} FROM employees WHERE id=?`).get(e.id))
})
// upload/replace an employee's signature
api.put('/employees/:id/signature', canWrite, (req, res) => {
  const sig = req.body?.signature
  if (typeof sig !== 'string' || !sig.startsWith('data:image/')) return res.status(400).json({ error: 'ไฟล์ลายเซ็นไม่ถูกต้อง' })
  db.prepare('UPDATE employees SET signature=? WHERE id=?').run(sig, req.params.id)
  res.json({ ok: true })
})
// reset / set an employee's kiosk PIN
api.put('/employees/:id/pin', canWrite, (req, res) => {
  const pin = String(req.body?.pin || '').trim()
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN ต้องเป็นตัวเลข 4 หลัก' })
  db.prepare('UPDATE employees SET pin=? WHERE id=?').run(hashPin(pin), req.params.id)
  res.json({ ok: true })
})
// remove an employee (e.g. resigned) — they drop out of payroll automatically
api.delete('/employees/:id', canWrite, (req, res) => {
  db.prepare('DELETE FROM employees WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})
// ---- Retention: หักสะสมเดือนละ (ค่าที่ตั้งไว้) จนครบเพดาน แล้วหยุดหักเอง ----
const RETENTION_CAP = 5000 // เพดานเงินประกันผลงานต่อคน
// ยอด retention ที่หักสะสมแล้ว "ก่อนงวด excludePeriod" = ยอดยกมา (พนักงานเก่า) + ผลรวมที่หักในทุกงวดที่ปิดแล้ว
// (ไม่รวมงวดที่กำลังคำนวณ เพื่อไม่ให้ปิดงวดซ้ำแล้วนับซ้ำ)
function retentionPaidBefore(empCode, opening, excludePeriod) {
  const runs = db.prepare('SELECT period, data FROM payroll_runs WHERE period != ?').all(excludePeriod || '')
  let sum = 0
  for (const r of runs) {
    try {
      const row = JSON.parse(r.data).find((x) => x.code === empCode)
      if (row) sum += Number(row.retention) || 0
    } catch { /* ข้ามงวดที่ข้อมูลเสีย */ }
  }
  return (Number(opening) || 0) + sum
}
// จำนวน "งวด" ที่หักเงินประกันสะสมมาก่อนงวด excludePeriod = งวดยกมา (ประมาณจากยอดยกมา ÷ ยอดหักต่อเดือน) + งวดที่ปิดแล้วที่มีการหักจริง
function retentionPeriodsBefore(empCode, opening, monthly, excludePeriod) {
  const runs = db.prepare('SELECT data FROM payroll_runs WHERE period != ?').all(excludePeriod || '')
  let periods = 0
  for (const r of runs) {
    try {
      const row = JSON.parse(r.data).find((x) => x.code === empCode)
      if (row && (Number(row.retention) || 0) > 0) periods += 1
    } catch { /* ข้ามงวดที่ข้อมูลเสีย */ }
  }
  const openingPeriods = (Number(monthly) || 0) > 0 ? Math.round((Number(opening) || 0) / Number(monthly)) : ((Number(opening) || 0) > 0 ? 1 : 0)
  return openingPeriods + periods
}
// ตำแหน่งที่ไม่ต้องลงเวลา — ยังได้เงินเดือนเต็ม (ไม่หักขาดงานจากการไม่ตอกบัตร)
const NO_ATTENDANCE_ROLES = ['CEO', 'ผู้จัดการ']
// compute payroll rows live for a period (resigned employees excluded)
function computePayroll(period) {
  const emps = db.prepare("SELECT * FROM employees WHERE status != 'ลาออก' ORDER BY id").all()
  return emps.map((e) => {
    const ot = db.prepare("SELECT COALESCE(SUM(amount),0) a FROM ot WHERE emp_code=? AND status='อนุมัติ'").get(e.code).a
    const rejected = db.prepare("SELECT COALESCE(SUM(days),0) d FROM leaves WHERE emp_code=? AND status='ไม่อนุมัติ'").get(e.code).d
    const unpaid = db.prepare("SELECT COALESCE(SUM(unpaid_days),0) d FROM leaves WHERE emp_code=? AND status='อนุมัติ'").get(e.code).d
    const isDaily = e.pay_type === 'รายวัน'
    const exempt = NO_ATTENDANCE_ROLES.includes(e.role) // CEO / ผู้จัดการ ไม่ต้องลงเวลา
    // รายวัน (เช่น แม่บ้าน): เงิน = ค่าแรง/วัน × วันทำงานที่กรอก · ไม่หักขาด (จ่ายตามวันที่ทำจริง)
    // ผู้ได้รับยกเว้น (CEO/ผู้จัดการ): ไม่หักขาดงาน
    const dailyRate = e.base || 0
    const workDays = e.work_days || 0
    const basePay = isDaily ? dailyRate * workDays : (e.base || 0)
    const absent = (isDaily || exempt) ? 0 : absentDaysInMonth(e, period)
    const daily = isDaily ? dailyRate : Math.round((e.base || 0) / 26)
    const deductDays = isDaily ? 0 : (rejected + unpaid + absent)
    // ประกันสังคม + ภาษี ของรายวัน คิดจาก "รายได้จริงในงวด" (ค่าแรง×วันทำงาน) ไม่ใช่ค่าแรง×26
    // (กันบั๊ก: รายวันค่าแรงสูง/ทำงาน 0 วัน แล้วภาษีพุ่งเพราะคูณ 26)
    const sso = isDaily ? ssoOf(basePay) : e.sso
    const tax = isDaily ? taxMonthlyOf(basePay, sso, allowanceOf({ spouse: e.spouse, children: e.children })) : e.tax
    // เบิกล่วงหน้าที่เบิกในงวดนี้ → หักคืนสิ้นเดือน
    const advance = db.prepare('SELECT COALESCE(SUM(amount),0) a FROM salary_advances WHERE emp_code=? AND period=?').get(e.code, period).a
    // retention: หักเดือนละ (e.retention) แต่ไม่เกินเพดานที่เหลือ — ครบ 5,000 แล้วหักเป็น 0 เอง
    const opening = e.retention_opening || 0
    const paidBefore = retentionPaidBefore(e.code, opening, period)
    const monthly = e.retention ?? 0
    const retention = Math.max(0, Math.min(monthly, RETENTION_CAP - paidBefore))
    return {
      ...e, ot, sso, tax, base: basePay, leave_days: rejected + unpaid, absent_days: absent, leave_deduct: deductDays * daily,
      daily_rate: dailyRate, work_days: workDays, exempt_attendance: exempt, // ข้อมูลสำหรับแสดงผล (รายวัน/ยกเว้นลงเวลา)
      retention, student_loan: e.student_loan || 0, advance,
      retention_cap: RETENTION_CAP, retention_opening: opening,
      retention_monthly: monthly, // ยอดที่ตั้งให้หักต่อเดือน (แก้ได้) — ต่างจาก retention ที่ถูกจำกัดด้วยเพดาน
      retention_paid: paidBefore + retention, // ยอดสะสมถึงงวดนี้ (รวมงวดนี้)
      retention_periods: retentionPeriodsBefore(e.code, opening, monthly, period) + (retention > 0 ? 1 : 0), // จำนวนงวดที่หักสะสมมาแล้ว (รวมงวดนี้)
    }
  })
}
const netOf = (p) => p.base + p.ot - p.sso - p.tax - (p.leave_deduct || 0) - (p.retention || 0) - (p.student_loan || 0) - (p.advance || 0)

// payroll is salary data → finance only. Supports a period and locked snapshots.
api.get('/payroll', requireSalary, (req, res) => {
  const period = /^\d{4}-\d{2}$/.test(req.query.period) ? req.query.period : currentPeriod()
  const run = db.prepare('SELECT * FROM payroll_runs WHERE period=?').get(period)
  if (run) return res.json({ period, periodLabel: periodLabelTH(period), locked: true, rows: JSON.parse(run.data) })
  res.json({ period, periodLabel: periodLabelTH(period), locked: false, rows: computePayroll(period) })
})
// list closed periods
api.get('/payroll/runs', requireSalary, (_req, res) =>
  res.json(db.prepare('SELECT period,total,created,by FROM payroll_runs ORDER BY period DESC').all().map((r) => ({ ...r, periodLabel: periodLabelTH(r.period) })))
)
// close / lock a period (snapshot the computed payroll)
api.post('/payroll/close', financeOnly, (req, res) => {
  const period = /^\d{4}-\d{2}$/.test(req.body?.period) ? req.body.period : currentPeriod()
  const rows = computePayroll(period)
  const total = rows.reduce((s, p) => s + netOf(p), 0)
  db.prepare('INSERT INTO payroll_runs (period,data,total,created,by) VALUES (?,?,?,?,?) ON CONFLICT(period) DO UPDATE SET data=excluded.data,total=excluded.total,created=excluded.created,by=excluded.by')
    .run(period, JSON.stringify(rows), total, todayTH(), req.user.name)
  audit(req, 'ปิดงวดเงินเดือน', periodLabelTH(period))
  res.json({ ok: true, period, periodLabel: periodLabelTH(period), locked: true, rows })
})
// สรุป Retention สะสมต่อคน — "แต่ละคนหักไปแล้วเท่าไหร่ / ครบ 5,000 หรือยัง"
// paid = ยอดยกมา + ผลรวมที่หักในทุกงวดที่ปิดแล้ว (ยังไม่นับงวดที่ยังไม่ปิด)
api.get('/payroll/retention', requireSalary, (_req, res) => {
  const emps = db.prepare("SELECT code,name,retention,retention_opening FROM employees WHERE status != 'ลาออก' ORDER BY id").all()
  res.json({
    cap: RETENTION_CAP,
    rows: emps.map((e) => {
      const opening = e.retention_opening || 0
      const paid = retentionPaidBefore(e.code, opening, '') // รวมทุกงวดที่ปิดแล้ว + ยกมา
      const remaining = Math.max(0, RETENTION_CAP - paid)
      return {
        code: e.code, name: e.name, monthly: e.retention ?? 0, opening,
        paid, remaining, done: paid >= RETENTION_CAP,
      }
    }),
  })
})
// ---- เบิกเงินเดือนล่วงหน้า ----
const ADVANCE_DAILY_DIVISOR = 2 // เบิกได้ไม่เกิน (วันทำงาน ÷ 2) × ค่าจ้างรายวัน
const ADVANCE_DAY_BASE = 26     // เงินเดือน ÷ 26 (วันทำงาน) = ค่าจ้าง/วัน
// เพดานเบิกล่วงหน้า: (จำนวนวันมาทำงาน "ตั้งแต่วันที่ 1 ถึงวันนี้/วันที่เบิก" × ค่าจ้าง/วัน) ÷ 2
function advanceLimit(emp, period) {
  const [yy, mm] = period.split('-').map(Number)
  const monthStart = isoDate(new Date(yy, mm - 1, 1))
  const monthEnd = isoDate(new Date(yy, mm, 0))
  const today = todayISO()
  const upTo = monthEnd < today ? monthEnd : today // นับได้ไม่เกินวันนี้ (วันที่เบิก)
  // วันทำงาน = วันที่มีบัตรตอก + วันที่ปรับปรุงเวลาอนุมัติแล้ว (ลืมตอกแต่มาจริง) — ไม่นับซ้ำ
  const punchDates = new Set(db.prepare("SELECT DISTINCT date FROM attendance WHERE emp_code=? AND COALESCE(check_in,'')!='' AND date>=? AND date<=?").all(emp.code, monthStart, upTo).map((r) => r.date))
  for (const a of db.prepare("SELECT DISTINCT date FROM time_adjustments WHERE emp_name=? AND status='อนุมัติ' AND date>=? AND date<=?").all(emp.name, monthStart, upTo)) punchDates.add(a.date)
  const worked = punchDates.size
  const daily = emp.pay_type === 'รายวัน' ? emp.base : Math.round((emp.base || 0) / ADVANCE_DAY_BASE)
  return { worked, daily, limit: Math.floor(daily * worked / ADVANCE_DAILY_DIVISOR) }
}
api.get('/salary-advances', requireSalary, (req, res) => {
  const period = /^\d{4}-\d{2}$/.test(req.query.period) ? req.query.period : currentPeriod()
  res.json(db.prepare('SELECT * FROM salary_advances WHERE period=? ORDER BY id DESC').all(period))
})
// เพดาน + ยอดเบิกแล้วของพนักงานคนหนึ่งในงวด (ให้ UI โชว์ก่อนเบิก)
api.get('/salary-advances/limit', requireSalary, (req, res) => {
  const emp = db.prepare('SELECT * FROM employees WHERE code=?').get(req.query.emp_code)
  if (!emp) return res.status(404).json({ error: 'ไม่พบพนักงาน' })
  const period = /^\d{4}-\d{2}$/.test(req.query.period) ? req.query.period : currentPeriod()
  const { worked, daily, limit } = advanceLimit(emp, period)
  const taken = db.prepare('SELECT COALESCE(SUM(amount),0) a FROM salary_advances WHERE emp_code=? AND period=?').get(emp.code, period).a
  res.json({ worked, daily, limit, taken, remaining: Math.max(0, limit - taken), period })
})
api.post('/salary-advances', financeOnly, (req, res) => {
  const b = req.body || {}
  const emp = db.prepare('SELECT * FROM employees WHERE code=?').get(b.emp_code)
  if (!emp) return res.status(404).json({ error: 'กรุณาเลือกพนักงาน' })
  const period = currentPeriod()
  const amount = Number(b.amount) || 0
  if (amount <= 0) return res.status(400).json({ error: 'กรุณากรอกจำนวนเงิน' })
  const { worked, limit } = advanceLimit(emp, period)
  const taken = db.prepare('SELECT COALESCE(SUM(amount),0) a FROM salary_advances WHERE emp_code=? AND period=?').get(emp.code, period).a
  const remaining = limit - taken
  if (amount > remaining) return res.status(400).json({ error: `เบิกได้ไม่เกิน ${remaining.toLocaleString()} บาท (มาทำงาน ${worked} วัน · เพดาน ${limit.toLocaleString()} · เบิกแล้ว ${taken.toLocaleString()})` })
  const info = db.prepare('INSERT INTO salary_advances (emp_code,emp_name,period,date,amount,note,by,created) VALUES (?,?,?,?,?,?,?,?)')
    .run(emp.code, emp.name, period, todayTH(), amount, b.note || '', req.user.name, todayTH())
  audit(req, 'เบิกเงินเดือนล่วงหน้า', `${emp.name} ${amount.toLocaleString()} บาท`)
  res.status(201).json(db.prepare('SELECT * FROM salary_advances WHERE id=?').get(info.lastInsertRowid))
})
api.delete('/salary-advances/:id', financeOnly, (req, res) => {
  const a = db.prepare('SELECT * FROM salary_advances WHERE id=?').get(req.params.id)
  db.prepare('DELETE FROM salary_advances WHERE id=?').run(req.params.id)
  if (a) audit(req, 'ยกเลิกเบิกล่วงหน้า', `${a.emp_name} ${a.amount}`)
  res.json({ ok: true })
})
// สรุปเบิกล่วงหน้า "จัดกลุ่มตามคน" — โชว์ว่าเบิกกี่รอบ/รวม/เหลือ (อ่านง่ายเมื่อเบิกหลายรอบ)
api.get('/salary-advances/summary', requireSalary, (req, res) => {
  const period = /^\d{4}-\d{2}$/.test(req.query.period) ? req.query.period : currentPeriod()
  const advs = db.prepare('SELECT * FROM salary_advances WHERE period=? ORDER BY id').all(period)
  const byEmp = {}
  for (const a of advs) {
    if (!byEmp[a.emp_code]) byEmp[a.emp_code] = { emp_code: a.emp_code, emp_name: a.emp_name, rounds: [], taken: 0 }
    byEmp[a.emp_code].rounds.push({ id: a.id, date: a.date, amount: a.amount, note: a.note })
    byEmp[a.emp_code].taken += a.amount
  }
  const rows = Object.values(byEmp).map((g) => {
    const emp = db.prepare('SELECT * FROM employees WHERE code=?').get(g.emp_code)
    const { worked, limit } = emp ? advanceLimit(emp, period) : { worked: 0, limit: 0 }
    return { ...g, worked, limit, remaining: Math.max(0, limit - g.taken), count: g.rounds.length }
  }).sort((a, b) => a.emp_name.localeCompare(b.emp_name, 'th'))
  res.json({ period, rows })
})
// สรุปเงินเดือนทั้งปี — รวมจ่ายสุทธิ + ประกันสังคมสะสม (จากงวดที่ปิดแล้ว)
api.get('/payroll/annual', requireSalary, (req, res) => {
  const year = /^\d{4}$/.test(req.query.year) ? req.query.year : String(new Date().getFullYear())
  const runs = db.prepare('SELECT period,total,data FROM payroll_runs WHERE period LIKE ? ORDER BY period').all(year + '-%')
  let net = 0, sso = 0, base = 0, tax = 0
  for (const r of runs) {
    net += r.total || 0
    try { const rows = JSON.parse(r.data); for (const p of rows) { sso += p.sso || 0; base += p.base || 0; tax += p.tax || 0 } } catch { /* ignore */ }
  }
  res.json({ year, months: runs.length, net, sso, ssoEmployer: sso, base, tax, periods: runs.map((r) => r.period) })
})
// ไฟล์จ่ายเงินเดือนผ่านธนาคาร (CSV) — ใช้ยอดสุทธิของงวด (snapshot ถ้าปิดงวดแล้ว)
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
api.get('/payroll/bank-file', requireSalary, (req, res) => {
  const period = /^\d{4}-\d{2}$/.test(req.query.period) ? req.query.period : currentPeriod()
  const run = db.prepare('SELECT * FROM payroll_runs WHERE period=?').get(period)
  const rows = run ? JSON.parse(run.data) : computePayroll(period)
  const head = ['ลำดับ', 'รหัสพนักงาน', 'ชื่อ-สกุล', 'ธนาคาร', 'เลขบัญชี', 'จำนวนเงินสุทธิ', 'อ้างอิง']
  const body = rows.map((p, i) => [i + 1, p.code || '', p.name || '', p.bank_name || '', p.bank_acct || '', netOf(p).toFixed(2), 'SALARY ' + period])
  const total = rows.reduce((s, p) => s + netOf(p), 0)
  const foot = ['', '', '', '', 'รวม', total.toFixed(2), rows.length + ' รายการ']
  const csv = '﻿' + [head, ...body, foot].map((r) => r.map(csvCell).join(',')).join('\r\n')
  audit(req, 'ดาวน์โหลดไฟล์จ่ายเงินเดือนธนาคาร', periodLabelTH(period))
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="bank_salary_${period}.csv"`)
  res.send(csv)
})

api.get('/ot', (_req, res) => res.json(db.prepare('SELECT * FROM ot ORDER BY id DESC').all()))
api.post('/ot', canWrite, (req, res) => {
  const b = req.body || {}
  if (!b.emp_code || !b.amount) return res.status(400).json({ error: 'กรุณาเลือกพนักงานและจำนวนเงิน' })
  const emp = db.prepare('SELECT name FROM employees WHERE code=?').get(b.emp_code)
  const info = db.prepare('INSERT INTO ot (emp_code,name,date,hours,rate,amount,status) VALUES (?,?,?,?,?,?,?)')
    .run(b.emp_code, emp?.name || b.name || '', b.date || todayTH(), b.hours || '', b.rate || '1.5x', Number(b.amount) || 0, 'รออนุมัติ')
  res.status(201).json(db.prepare('SELECT * FROM ot WHERE id=?').get(info.lastInsertRowid))
})
api.post('/ot/:id/approve', requireManager, (req, res) => {
  db.prepare("UPDATE ot SET status='อนุมัติ' WHERE id=?").run(req.params.id)
  audit(req, 'อนุมัติ OT', 'ot#' + req.params.id)
  res.json(db.prepare('SELECT * FROM ot WHERE id=?').get(req.params.id))
})

// ---------- leave requests ----------
api.get('/leaves', (_req, res) => res.json(db.prepare('SELECT * FROM leaves ORDER BY id DESC').all()))
const HOURS_PER_DAY = 8 // ชั่วโมงทำงานต่อวัน (ใช้แปลงลารายชั่วโมง → วัน)
api.post('/leaves', canWrite, (req, res) => {
  const b = req.body || {}
  if (!b.emp_code || !b.type || !b.start_date) return res.status(400).json({ error: 'กรุณาเลือกพนักงาน ประเภท และวันที่' })
  const hours = Number(b.hours) || 0 // > 0 = ลารายชั่วโมง
  if (hours < 0 || hours > HOURS_PER_DAY) return res.status(400).json({ error: `ลารายชั่วโมงได้ 0.5–${HOURS_PER_DAY} ชม.` })
  const days = hours > 0 ? Math.round((hours / HOURS_PER_DAY) * 100) / 100 : (Number(b.days) || 1)
  const info = db
    .prepare('INSERT INTO leaves (emp_code,emp_name,type,start_date,end_date,days,hours,reason,status,by) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(b.emp_code, b.emp_name || '', b.type, b.start_date, b.end_date || b.start_date, days, hours, b.reason || '', 'รออนุมัติ', req.user.name)
  res.status(201).json(db.prepare('SELECT * FROM leaves WHERE id=?').get(info.lastInsertRowid))
})
api.post('/leaves/:id/decision', requireManager, (req, res) => {
  const lv = db.prepare('SELECT * FROM leaves WHERE id=?').get(req.params.id)
  if (!lv) return res.status(404).json({ error: 'ไม่พบใบลา' })
  const status = req.body?.status === 'อนุมัติ' ? 'อนุมัติ' : 'ไม่อนุมัติ'
  let unpaid = 0
  if (status === 'อนุมัติ') {
    const map = { ลาป่วย: ['sick_used', 'sick_quota'], ลากิจ: ['personal_used', 'personal_quota'], พักร้อน: ['vacation_used', 'vacation_quota'] }
    const cols = map[lv.type]
    if (cols) {
      const emp = db.prepare('SELECT * FROM employees WHERE code=?').get(lv.emp_code)
      const used = emp?.[cols[0]] || 0
      const quota = emp?.[cols[1]] || 0
      const remaining = Math.max(0, quota - used)
      unpaid = Math.max(0, lv.days - remaining) // days beyond quota are unpaid (หักเงิน)
      db.prepare(`UPDATE employees SET ${cols[0]} = COALESCE(${cols[0]},0) + ? WHERE code=?`).run(lv.days, lv.emp_code)
    }
  }
  db.prepare('UPDATE leaves SET status=?, approver=?, approved_date=?, unpaid_days=? WHERE id=?').run(status, req.user.name, todayTH(), unpaid, lv.id)
  audit(req, status === 'อนุมัติ' ? 'อนุมัติใบลา' : 'ไม่อนุมัติใบลา', `${lv.emp_name} ${lv.type} ${lv.days}วัน`)
  res.json(db.prepare('SELECT * FROM leaves WHERE id=?').get(lv.id))
})

// ---------- time-adjustment requests (ปรับปรุงเวลาเข้า-ออก) ----------
const DAYMS = 86400000
api.get('/time-adjustments', (_req, res) => res.json(db.prepare('SELECT * FROM time_adjustments ORDER BY id DESC').all()))
api.post('/time-adjustments', canWrite, (req, res) => {
  const b = req.body || {}
  if (!b.date || !b.kind || !b.time) return res.status(400).json({ error: 'กรุณากรอกวันที่ ประเภท และเวลา' })
  const d = new Date(b.date + 'T00:00:00')
  if (isNaN(d.getTime())) return res.status(400).json({ error: 'วันที่ไม่ถูกต้อง' })
  if (d.getDay() === 0) return res.status(400).json({ error: 'วันอาทิตย์เป็นวันหยุด ยื่นปรับปรุงเวลาไม่ได้' })
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - d.getTime()) / DAYMS)
  if (diff < 0) return res.status(400).json({ error: 'ยื่นล่วงหน้าไม่ได้' })
  if (diff > 2) return res.status(400).json({ error: 'ยื่นย้อนหลังได้ไม่เกิน 2 วันทำการ' })
  const info = db
    .prepare('INSERT INTO time_adjustments (emp_name,date,kind,time,reason,status,by) VALUES (?,?,?,?,?,?,?)')
    .run(b.emp_name || req.user.name, b.date, b.kind, b.time, b.reason || '', 'รออนุมัติ', req.user.name)
  res.status(201).json(db.prepare('SELECT * FROM time_adjustments WHERE id=?').get(info.lastInsertRowid))
})
api.post('/time-adjustments/:id/decision', requireManager, (req, res) => {
  const status = req.body?.status === 'อนุมัติ' ? 'อนุมัติ' : 'ไม่อนุมัติ'
  db.prepare('UPDATE time_adjustments SET status=?, approver=?, approved_date=? WHERE id=?').run(status, req.user.name, todayTH(), req.params.id)
  res.json(db.prepare('SELECT * FROM time_adjustments WHERE id=?').get(req.params.id))
})

// ---------- attendance / time-clock kiosk ----------
function nowHM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function todayISO() {
  return isoDate(new Date()) // วันที่ท้องถิ่น (ไทย) — เดิมใช้ UTC ทำให้ลงเวลาช่วงเช้าตรู่/ข้ามคืนคลาดวัน
}
// รายการลงเวลา — กรองตามเดือน (?period=YYYY-MM) เพื่อไม่ให้วันต้นเดือนหลุดหาย · ไม่ใส่ period = ล่าสุด 1000 รายการ
api.get('/attendance', (req, res) => {
  if (/^\d{4}-\d{2}$/.test(req.query.period || '')) {
    return res.json(db.prepare("SELECT * FROM attendance WHERE date LIKE ? ORDER BY date DESC, id DESC").all(req.query.period + '-%'))
  }
  res.json(db.prepare('SELECT * FROM attendance ORDER BY date DESC, id DESC LIMIT 1000').all())
})
// เพิ่ม/แก้ไขการลงเวลาด้วยมือ (กรณีลืมตอกบัตร/ระบบไม่ได้เปิด) — upsert ตาม พนักงาน+วันที่
api.post('/attendance/manual', canWrite, (req, res) => {
  const b = req.body || {}
  const emp = db.prepare('SELECT * FROM employees WHERE code=?').get(b.emp_code)
  if (!emp) return res.status(400).json({ error: 'กรุณาเลือกพนักงาน' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) return res.status(400).json({ error: 'กรุณาเลือกวันที่ให้ถูกต้อง' })
  const checkIn = String(b.check_in || '').trim()
  const checkOut = String(b.check_out || '').trim()
  const status = b.status || (checkIn && checkIn > lateCutoff() ? 'สาย' : 'ปกติ')
  const row = db.prepare('SELECT * FROM attendance WHERE emp_code=? AND date=?').get(b.emp_code, b.date)
  if (row) {
    db.prepare('UPDATE attendance SET check_in=?, check_out=?, status=? WHERE id=?').run(checkIn, checkOut, status, row.id)
    audit(req, 'แก้ไขการลงเวลา', `${emp.name} ${b.date}`)
    return res.json(db.prepare('SELECT * FROM attendance WHERE id=?').get(row.id))
  }
  const info = db.prepare('INSERT INTO attendance (emp_code,emp_name,date,check_in,check_out,status) VALUES (?,?,?,?,?,?)')
    .run(emp.code, emp.name, b.date, checkIn, checkOut, status)
  audit(req, 'เพิ่มการลงเวลา', `${emp.name} ${b.date}`)
  res.status(201).json(db.prepare('SELECT * FROM attendance WHERE id=?').get(info.lastInsertRowid))
})
// บันทึก "มาทำงานทั้งวัน" ให้พนักงานที่ทำงานอยู่ทุกคน (ที่ยังไม่มีบันทึกในวันนั้น) — สำหรับวันที่ระบบยังไม่ได้เปิด
api.post('/attendance/mark-all-present', canWrite, (req, res) => {
  const b = req.body || {}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) return res.status(400).json({ error: 'กรุณาเลือกวันที่ให้ถูกต้อง' })
  const checkIn = String(b.check_in || '08:00').trim()
  const checkOut = String(b.check_out || '17:00').trim()
  const emps = db.prepare("SELECT code,name FROM employees WHERE COALESCE(status,'') != 'ลาออก'").all()
  const ins = db.prepare('INSERT INTO attendance (emp_code,emp_name,date,check_in,check_out,status) VALUES (?,?,?,?,?,?)')
  let added = 0
  db.transaction(() => {
    for (const e of emps) {
      const has = db.prepare('SELECT id FROM attendance WHERE emp_code=? AND date=?').get(e.code, b.date)
      if (!has) { ins.run(e.code, e.name, b.date, checkIn, checkOut, 'ปกติ'); added++ }
    }
  })()
  audit(req, 'บันทึกมาทำงานทั้งวัน', `${b.date} (${added} คน)`)
  res.json({ ok: true, added, date: b.date })
})
api.delete('/attendance/:id', canWrite, (req, res) => {
  const a = db.prepare('SELECT * FROM attendance WHERE id=?').get(req.params.id)
  db.prepare('DELETE FROM attendance WHERE id=?').run(req.params.id)
  if (a) audit(req, 'ลบการลงเวลา', `${a.emp_name} ${a.date}`)
  res.json({ ok: true })
})
// ---- วันหยุดบริษัท (ไม่นับขาด) ----
api.get('/holidays', (req, res) => {
  const y = /^\d{4}$/.test(req.query.year) ? req.query.year : null
  const rows = y ? db.prepare('SELECT * FROM holidays WHERE date LIKE ? ORDER BY date').all(y + '-%') : db.prepare('SELECT * FROM holidays ORDER BY date').all()
  res.json(rows)
})
api.post('/holidays', adminOnly, (req, res) => {
  const b = req.body || {}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ''))) return res.status(400).json({ error: 'วันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)' })
  db.prepare('INSERT OR IGNORE INTO holidays (date,name) VALUES (?,?)').run(b.date, b.name || 'วันหยุด')
  audit(req, 'เพิ่มวันหยุด', `${b.date} ${b.name || ''}`)
  res.status(201).json(db.prepare('SELECT * FROM holidays WHERE date=?').get(b.date))
})
api.delete('/holidays/:id', adminOnly, (req, res) => {
  const h = db.prepare('SELECT * FROM holidays WHERE id=?').get(req.params.id)
  db.prepare('DELETE FROM holidays WHERE id=?').run(req.params.id)
  if (h) audit(req, 'ลบวันหยุด', `${h.date} ${h.name || ''}`)
  res.json({ ok: true })
})
// สรุปลงเวลารายเดือน — มา/สาย/ขาด/ลา รายคน (ข้อมูลเงินเดือน → จำกัดสิทธิ์)
api.get('/attendance/summary', requireSalary, (req, res) => {
  const period = /^\d{4}-\d{2}$/.test(req.query.period) ? req.query.period : currentPeriod()
  const [yy, mm] = period.split('-').map(Number)
  const monthStart = isoDate(new Date(yy, mm - 1, 1))
  const monthEnd = isoDate(new Date(yy, mm, 0))
  const emps = db.prepare("SELECT * FROM employees WHERE COALESCE(status,'') != 'ลาออก' ORDER BY name").all()
  const rows = emps.map((e) => {
    const att = db.prepare("SELECT date,status FROM attendance WHERE emp_code=? AND COALESCE(check_in,'')!='' AND date>=? AND date<=?").all(e.code, monthStart, monthEnd)
    const punchDates = new Set(att.map((a) => a.date))
    const late = att.filter((a) => a.status === 'สาย').length
    // ปรับปรุงเวลาที่ "อนุมัติแล้ว" = มาทำงานวันนั้น (ลืมตอกบัตร แต่มาจริง) → นับเป็นมา ไม่นับขาด
    const adjDates = db.prepare("SELECT DISTINCT date FROM time_adjustments WHERE emp_name=? AND status='อนุมัติ' AND date>=? AND date<=?").all(e.name, monthStart, monthEnd).map((a) => a.date)
    let adjExtra = 0
    for (const d of adjDates) if (!punchDates.has(d)) adjExtra++ // วันที่มีปรับปรุงเวลา แต่ไม่มีบัตรตอก (กันนับซ้ำ)
    const present = (att.length - late) + adjExtra
    const came = att.length + adjExtra
    // CEO/ผู้จัดการ ไม่ต้องลงเวลา · รายวันจ่ายตามวันทำงานที่กรอก → ไม่นับขาด
    const noAttendance = NO_ATTENDANCE_ROLES.includes(e.role) || e.pay_type === 'รายวัน'
    const absent = noAttendance ? 0 : absentDaysInMonth(e, period)
    const leave = db.prepare("SELECT COALESCE(SUM(days),0) d FROM leaves WHERE emp_code=? AND status='อนุมัติ' AND start_date>=? AND start_date<=?").get(e.code, monthStart, monthEnd).d
    return { code: e.code, name: e.name, role: e.role || '', present, late, absent, leave, came, adj: adjExtra, no_attendance: noAttendance }
  })
  res.json({ period, periodLabel: periodLabelTH(period), monthStart, monthEnd, rows })
})
// รายละเอียดลงเวลา "รายวัน" ของพนักงานคนเดียว — เห็นว่าวันไหน มา/สาย/ปรับปรุง/ลา/ขาด/หยุด (ไว้เช็กว่าวันไหนหาย)
api.get('/attendance/detail', requireSalary, (req, res) => {
  const period = /^\d{4}-\d{2}$/.test(req.query.period) ? req.query.period : currentPeriod()
  const e = db.prepare('SELECT * FROM employees WHERE code=?').get(req.query.emp_code)
  if (!e) return res.status(404).json({ error: 'ไม่พบพนักงาน' })
  const [yy, mm] = period.split('-').map(Number)
  const monthStart = isoDate(new Date(yy, mm - 1, 1))
  const monthEnd = isoDate(new Date(yy, mm, 0))
  const today = todayISO()
  const upTo = monthEnd < today ? monthEnd : today // ไม่แสดงวันในอนาคต
  const noAttendance = NO_ATTENDANCE_ROLES.includes(e.role) || e.pay_type === 'รายวัน'
  // ข้อมูลประกอบ
  const att = {}
  for (const a of db.prepare("SELECT date,check_in,check_out,status FROM attendance WHERE emp_code=? AND date>=? AND date<=?").all(e.code, monthStart, monthEnd)) att[a.date] = a
  const adj = new Set(db.prepare("SELECT DISTINCT date FROM time_adjustments WHERE emp_name=? AND status='อนุมัติ' AND date>=? AND date<=?").all(e.name, monthStart, monthEnd).map((x) => x.date))
  const leaveDays = new Set()
  for (const l of db.prepare("SELECT start_date,end_date FROM leaves WHERE emp_code=? AND status='อนุมัติ'").all(e.code))
    for (const d of eachDay(l.start_date, l.end_date || l.start_date)) leaveDays.add(d)
  const holi = new Set(db.prepare('SELECT date FROM holidays WHERE date>=? AND date<=?').all(monthStart, monthEnd).map((x) => x.date))
  const days = []
  const counts = { came: 0, late: 0, adj: 0, leave: 0, absent: 0, holiday: 0 }
  for (const d of eachDay(monthStart, upTo)) {
    const dow = new Date(d + 'T00:00:00').getDay()
    const a = att[d]
    let status
    if (dow === 0 || holi.has(d)) { status = 'หยุด'; counts.holiday++ }
    else if (a && a.check_in) { status = a.status === 'สาย' ? 'สาย' : 'มา'; counts.came++; if (a.status === 'สาย') counts.late++ }
    else if (adj.has(d)) { status = 'ปรับปรุง'; counts.came++; counts.adj++ }
    else if (leaveDays.has(d)) { status = 'ลา'; counts.leave++ }
    else if (noAttendance) { status = 'ยกเว้น' }
    else { status = 'ขาด'; counts.absent++ }
    days.push({ date: d, dow, status, check_in: a?.check_in || '', check_out: a?.check_out || '' })
  }
  res.json({ code: e.code, name: e.name, role: e.role || '', period, no_attendance: noAttendance, days, counts })
})
// per-employee background-tracking links (managers/admin) — generates a token if missing
api.get('/track-config', requireManager, (_req, res) => {
  const emps = db.prepare("SELECT id,code,name,track_token FROM employees WHERE status != 'ลาออก' ORDER BY name").all()
  for (const e of emps) {
    if (!e.track_token) {
      e.track_token = randomBytes(9).toString('hex')
      db.prepare('UPDATE employees SET track_token=? WHERE id=?').run(e.track_token, e.id)
    }
  }
  res.json(emps.map((e) => ({ id: e.id, code: e.code, name: e.name, token: e.track_token })))
})
api.post('/employees/:id/track-token', adminOnly, (req, res) => {
  const tok = randomBytes(9).toString('hex')
  db.prepare('UPDATE employees SET track_token=? WHERE id=?').run(tok, req.params.id)
  res.json({ token: tok })
})
// foreman location tracking — managers/admin only
api.get('/location-log', requireManager, (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : new Date().toISOString().slice(0, 10)
  if (req.query.emp) {
    return res.json(db.prepare('SELECT * FROM location_log WHERE emp_code=? AND date=? ORDER BY ts').all(req.query.emp, date))
  }
  // summary: who has points that day + count + last time
  res.json(db.prepare('SELECT emp_code, emp_name, COUNT(*) points, MAX(ts) last FROM location_log WHERE date=? GROUP BY emp_code ORDER BY emp_name').all(date))
})
// ---- settings + attendance geofence (เช็คอินเฉพาะในรัศมีออฟฟิศ) ----
// PUT is admin-only; the GET + kiosk routes are PUBLIC (see top, before requireAuth)
api.put('/settings/attendance', adminOnly, (req, res) => {
  const b = req.body || {}
  if (b.enabled != null) setSetting('att_geofence', b.enabled ? '1' : '0')
  if (b.radius != null) setSetting('att_radius', String(Math.max(20, Number(b.radius) || 200)))
  if (b.lat != null) setSetting('att_lat', String(b.lat))
  if (b.lng != null) setSetting('att_lng', String(b.lng))
  if (b.start != null && /^\d{1,2}:\d{2}$/.test(String(b.start))) setSetting('att_start', String(b.start))
  if (b.grace != null) setSetting('att_grace', String(Math.max(0, Math.min(120, Number(b.grace) || 0))))
  audit(req, 'ตั้งค่าลงเวลา', `เข้างาน ${getSetting('att_start', '08:00')} ผ่อนผัน ${getSetting('att_grace', '5')} นาที (สายหลัง ${lateCutoff()})`)
  res.json({ ok: true, cutoff: lateCutoff() })
})

// ---------- purchase orders (PO) ----------
api.get('/purchase-orders', financeOnly, (_req, res) => res.json(db.prepare('SELECT * FROM purchase_orders ORDER BY id DESC').all().map(attachApproval('po'))))
api.post('/purchase-orders', financeOnly, (req, res) => {
  const b = req.body || {}
  if (!b.vendor || !b.item) return res.status(400).json({ error: 'กรุณากรอกผู้ขายและรายการ' })
  // กันโกงแบบบล็อกจริง (PO เกินยอด PR / ยอดสูงไม่เทียบราคา / แตกใบ)
  const blocked = poBlockReason(b, controls())
  if (blocked) return res.status(409).json({ error: blocked })
  const img = typeof b.image === 'string' && b.image.startsWith('data:image/') ? b.image : null
  const seq = db.prepare('SELECT COUNT(*) c FROM purchase_orders').get().c + 95
  const no = `PO-${docYear()}-${String(seq).padStart(4, '0')}`
  const paymentType = b.payment_type === 'credit' ? 'credit' : 'cash'
  const creditDays = paymentType === 'credit' ? Math.max(0, Number(b.credit_days) || 0) : 0
  const dueDate = paymentType === 'credit' ? thDatePlusDays(creditDays) : ''
  let dueIso = ''
  if (paymentType === 'credit') {
    const d = new Date(); d.setDate(d.getDate() + creditDays); dueIso = d.toISOString().slice(0, 10)
  }
  const info = db
    .prepare('INSERT INTO purchase_orders (no,date,vendor,item,amount,status,image,pr_no,by,payment_type,credit_days,due_date,house_code,due_iso) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(no, todayTH(), b.vendor, b.item, Number(b.amount) || 0, 'รอส่งของ', img, b.pr_no || '', req.user.name, paymentType, creditDays, dueDate, b.house_code || '', dueIso)
  res.status(201).json(db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(info.lastInsertRowid))
})
// when a PO is received, its cost flows into the house's รายจ่าย (auto expense, linked by po_id)
function syncPoExpense(po) {
  const existing = db.prepare('SELECT * FROM expenses WHERE po_id=?').get(po.id)
  const received = po.status === 'รับของแล้ว' || po.status === 'ปิดงาน'
  if (received && po.house_code) {
    if (existing) {
      db.prepare('UPDATE expenses SET house_code=?, item=?, vendor=?, amount=? WHERE po_id=?')
        .run(po.house_code, po.item, po.vendor, po.amount, po.id)
    } else {
      db.prepare('INSERT INTO expenses (date,house_code,item,cat,vendor,amount,po_id,date_iso) VALUES (?,?,?,?,?,?,?,?)')
        .run(todayTH(), po.house_code, po.item, 'วัสดุ', po.vendor, po.amount, po.id, todayISO())
    }
  } else if (existing) {
    // not received anymore (or no house) → remove the auto-created expense
    db.prepare('DELETE FROM expenses WHERE po_id=?').run(po.id)
  }
}
api.post('/purchase-orders/:id/status', financeOnly, (req, res) => {
  const st = ['รอส่งของ', 'รับของแล้ว', 'ปิดงาน'].includes(req.body?.status) ? req.body.status : 'รอส่งของ'
  db.prepare('UPDATE purchase_orders SET status=? WHERE id=?').run(st, req.params.id)
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(req.params.id)
  syncPoExpense(po)
  audit(req, 'อัปเดตสถานะ PO', `${po.no} → ${st}`)
  res.json(po)
})

// ---------- procurement (finance only) ----------
api.get('/vendors', financeOnly, (_req, res) => res.json(db.prepare('SELECT * FROM vendors ORDER BY id').all()))
api.post('/vendors', financeOnly, (req, res) => {
  const b = req.body || {}
  if (!b.name) return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ขาย' })
  const info = db.prepare('INSERT INTO vendors (name,type,tax_id,total,outstanding,credit_days) VALUES (?,?,?,?,?,?)')
    .run(b.name, b.type || 'นิติบุคคล', b.tax_id || '', Number(b.total) || 0, Number(b.outstanding) || 0, Math.max(0, Number(b.credit_days) || 0))
  res.status(201).json(db.prepare('SELECT * FROM vendors WHERE id=?').get(info.lastInsertRowid))
})
// edit a vendor's credit terms (เครดิตประจำร้าน)
api.put('/vendors/:id', financeOnly, (req, res) => {
  const v = db.prepare('SELECT * FROM vendors WHERE id=?').get(req.params.id)
  if (!v) return res.status(404).json({ error: 'ไม่พบผู้ขาย' })
  const b = req.body || {}
  db.prepare('UPDATE vendors SET name=?, type=?, tax_id=?, credit_days=? WHERE id=?')
    .run(b.name ?? v.name, b.type ?? v.type, b.tax_id ?? v.tax_id, b.credit_days != null ? Math.max(0, Number(b.credit_days) || 0) : v.credit_days, v.id)
  res.json(db.prepare('SELECT * FROM vendors WHERE id=?').get(v.id))
})
// parse the items/images JSON columns into arrays for the client
function jparse(s) { if (!s) return null; try { return JSON.parse(s) } catch { return null } }
function prRow(r) { return r ? { ...r, items: jparse(r.items), images: jparse(r.images) } : r }
api.get('/purchase-requests', financeOnly, (_req, res) =>
  res.json(db.prepare('SELECT * FROM purchase_requests ORDER BY id DESC').all().map((r) => ({ ...prRow(r), approval: approvalState('pr', r.id) })))
)
// create a PR — requester = current user, snapshot their signature, optional product image
// รองรับหลายรายการในใบเดียว: ส่ง items: [{desc,qty,unit,price}] มา (จำนวนเงินรวม = ผลรวมของทุกรายการ)
api.post('/purchase-requests', financeOnly, (req, res) => {
  const { house, house_code, category, item, amount, image, items, images } = req.body || {}
  // รูปแนบ: รับได้สูงสุด 3 รูป (data URL รูปภาพ)
  const imgs = (Array.isArray(images) ? images : (image ? [image] : []))
    .filter((s) => typeof s === 'string' && s.startsWith('data:image/')).slice(0, 3)
  let lineItems = Array.isArray(items)
    ? items.filter((it) => it && String(it.desc || '').trim()).map((it) => ({ desc: String(it.desc).trim(), qty: Number(it.qty) || 0, unit: String(it.unit || ''), price: Number(it.price) || 0 }))
    : []
  let total, summary
  if (lineItems.length) {
    total = lineItems.reduce((s, it) => s + (it.qty > 0 ? it.qty * it.price : it.price), 0)
    summary = lineItems.map((it) => it.desc).join(', ')
  } else {
    if (!item) return res.status(400).json({ error: 'กรุณากรอกรายการ' })
    total = Number(amount) || 0; summary = item; lineItems = null
  }
  const me = db.prepare('SELECT name, signature FROM users WHERE id = ?').get(req.user.id)
  const seq = (db.prepare("SELECT COUNT(*) c FROM purchase_requests").get().c + 142)
  const no = `PR-${docYear()}-${String(seq).padStart(4, '0')}`
  const hName = house_code ? (db.prepare('SELECT name FROM houses WHERE code=?').get(house_code)?.name || house_code) : (house || '')
  const cat = ['house', 'carport', 'road'].includes(category) ? category : ''
  const info = db
    .prepare('INSERT INTO purchase_requests (no,date,house,by,item,amount,status,requester_sig,image,house_code,category,items,images) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(no, todayTH(), hName, me.name, summary, total, 'รออนุมัติ', me.signature || null, imgs[0] || null, house_code || '', cat, lineItems ? JSON.stringify(lineItems) : null, imgs.length ? JSON.stringify(imgs) : null)
  res.status(201).json(prRow(db.prepare('SELECT * FROM purchase_requests WHERE id=?').get(info.lastInsertRowid)))
})
// approve/reject — managers only; on approval, snapshot approver name + signature
// PR อนุมัติ/ปฏิเสธ — ใช้เครื่องอนุมัติกลาง (หลายขั้นตามที่ตั้ง)
api.post('/purchase-requests/:id/decision', requireManager, (req, res) => {
  try {
    const st = req.body?.status === 'อนุมัติ' ? doApprove('pr', req.params.id, req) : doReject('pr', req.params.id, req)
    res.json({ ...prRow(db.prepare('SELECT * FROM purchase_requests WHERE id=?').get(req.params.id)), approval: st })
  } catch (e) { res.status(e.code || 400).json({ error: e.msg || e.message }) }
})
// เครื่องอนุมัติกลาง — ใช้ได้ทุกประเภทเอกสาร (po/payment/expense/pr)
api.get('/approvals/:docType/:docId', (req, res) => res.json(approvalState(req.params.docType, req.params.docId)))
api.post('/approve/:docType/:docId', requireManager, (req, res) => { try { res.json(doApprove(req.params.docType, req.params.docId, req)) } catch (e) { res.status(e.code || 400).json({ error: e.msg || e.message }) } })
api.post('/reject/:docType/:docId', requireManager, (req, res) => { try { res.json(doReject(req.params.docType, req.params.docId, req)) } catch (e) { res.status(e.code || 400).json({ error: e.msg || e.message }) } })
// ===== ราคากลางวัสดุ (Material Standard Prices) — อ้างอิงจากประวัติสั่งซื้อจริง =====
const nkeyOf = (n) => String(n || '').replace(/\s+/g, '').replace(/["“”]/g, '').toLowerCase()
api.get('/material-prices', financeOnly, (_req, res) =>
  res.json(db.prepare('SELECT * FROM material_prices WHERE active=1 ORDER BY po_count DESC, central DESC').all()))
api.post('/material-prices', financeOnly, (req, res) => {
  const b = req.body || {}
  const name = String(b.name || '').trim()
  if (!name) return res.status(400).json({ error: 'กรุณากรอกชื่อวัสดุ' })
  const central = Number(b.central) || 0
  const today = new Date().toISOString().slice(0, 10)
  const info = db.prepare(`INSERT INTO material_prices (name,nkey,unit,central,min,max,latest,po_count,qty_total,last_date,confidence,source,note,active,updated)
    VALUES (?,?,?,?,?,?,?,0,0,?,?,'กำหนดเอง',?,1,?)`)
    .run(name, nkeyOf(name), String(b.unit || ''), central, Number(b.min) || central, Number(b.max) || central, Number(b.latest) || central, todayTH(), String(b.confidence || 'กำหนดเอง'), String(b.note || ''), today)
  audit(req, 'เพิ่มราคากลางวัสดุ', `${name} ฿${central}`)
  res.status(201).json(db.prepare('SELECT * FROM material_prices WHERE id=?').get(info.lastInsertRowid))
})
api.put('/material-prices/:id', financeOnly, (req, res) => {
  const b = req.body || {}
  const cur = db.prepare('SELECT * FROM material_prices WHERE id=?').get(req.params.id)
  if (!cur) return res.status(404).json({ error: 'ไม่พบรายการ' })
  const name = b.name != null ? String(b.name).trim() : cur.name
  const num = (k, d) => (b[k] != null && b[k] !== '' ? Number(b[k]) : d)
  db.prepare('UPDATE material_prices SET name=?, nkey=?, unit=?, central=?, min=?, max=?, latest=?, confidence=?, note=?, active=?, updated=? WHERE id=?')
    .run(name, nkeyOf(name), b.unit != null ? String(b.unit) : cur.unit, num('central', cur.central), num('min', cur.min), num('max', cur.max), num('latest', cur.latest),
      b.confidence != null ? String(b.confidence) : cur.confidence, b.note != null ? String(b.note) : cur.note, b.active != null ? (b.active ? 1 : 0) : cur.active, new Date().toISOString().slice(0, 10), req.params.id)
  audit(req, 'แก้ราคากลางวัสดุ', name)
  res.json(db.prepare('SELECT * FROM material_prices WHERE id=?').get(req.params.id))
})
api.delete('/material-prices/:id', financeOnly, (req, res) => {
  const cur = db.prepare('SELECT * FROM material_prices WHERE id=?').get(req.params.id)
  db.prepare('DELETE FROM material_prices WHERE id=?').run(req.params.id)
  if (cur) audit(req, 'ลบราคากลางวัสดุ', cur.name)
  res.json({ ok: true })
})
// อัปเดตราคากลางจากประวัติสั่งซื้อจริงในระบบ (รายการใน PR ที่มีราคาต่อหน่วย) — เว้นรายการที่ตั้งราคาเอง
api.post('/material-prices/recompute', financeOnly, (req, res) => {
  const prs = db.prepare('SELECT id, items FROM purchase_requests ORDER BY id').all()
  const g = {}
  for (const pr of prs) {
    let items = []; try { items = JSON.parse(pr.items || '[]') } catch { items = [] }
    for (const it of items) {
      const name = String(it.desc || '').trim(); const up = Number(it.price) || 0; const qty = Number(it.qty) || 0
      if (!name || up <= 0) continue
      const unit = String(it.unit || '').trim()
      const k = nkeyOf(name) + '|' + unit
      const o = g[k] = g[k] || { name, unit, prices: [], qs: 0, amts: 0, pos: new Set(), latest: up }
      o.prices.push(up); o.qs += qty; o.amts += qty > 0 ? qty * up : up; o.pos.add(pr.id); o.latest = up
    }
  }
  const today = new Date().toISOString().slice(0, 10)
  const round = (x) => Math.round(x * 100) / 100
  let updated = 0, added = 0
  const findStmt = db.prepare('SELECT * FROM material_prices WHERE nkey=? AND COALESCE(unit,\'\')=?')
  const insStmt = db.prepare(`INSERT INTO material_prices (name,nkey,unit,central,min,max,latest,po_count,qty_total,last_date,confidence,source,active,updated)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'ระบบ',1,?)`)
  const updStmt = db.prepare('UPDATE material_prices SET unit=?, central=?, min=?, max=?, latest=?, po_count=?, qty_total=?, confidence=?, source=?, updated=? WHERE id=?')
  db.transaction(() => {
    for (const o of Object.values(g)) {
      const min = Math.min(...o.prices), max = Math.max(...o.prices)
      const po = o.pos.size
      const central = o.qs > 0 ? round(o.amts / o.qs) : round(o.prices.reduce((a, b) => a + b, 0) / o.prices.length)
      const conf = po >= 4 ? 'สูง' : po >= 2 ? 'กลาง' : 'ต่ำ'
      const nk = nkeyOf(o.name)
      const ex = findStmt.get(nk, o.unit || '')
      if (ex) {
        if (ex.source === 'กำหนดเอง') continue // ไม่ทับรายการที่ผู้ใช้ตั้งราคาเอง
        updStmt.run(o.unit || '', central, min, max, o.latest, po, round(o.qs), conf, ex.source === 'ประวัติ' ? 'ประวัติ+ระบบ' : 'ระบบ', today, ex.id); updated++
      } else {
        insStmt.run(o.name, nk, o.unit || '', central, min, max, o.latest, po, round(o.qs), today, conf, today); added++
      }
    }
  })()
  audit(req, 'อัปเดตราคากลางจากประวัติจริง', `แก้ ${updated} · เพิ่ม ${added}`)
  res.json({ ok: true, updated, added, groups: Object.keys(g).length })
})

api.get('/payments', financeOnly, (_req, res) => res.json(db.prepare('SELECT * FROM payments ORDER BY id DESC').all().map(attachApproval('payment'))))
api.post('/payments', financeOnly, (req, res) => {
  const b = req.body || {}
  if (!b.payee || !b.gross) return res.status(400).json({ error: 'กรุณากรอกผู้รับเงินและจำนวนเงิน' })
  const type = ['ภงด.3', 'ภงด.53', '-'].includes(b.type) ? b.type : '-'
  const gross = Number(b.gross) || 0
  // กันโกงแบบบล็อกจริง: จ่ายเงินซ้ำ (ผู้รับ + ยอดเท่ากัน)
  if (controls().block_dup_pay) {
    const dup = db.prepare('SELECT COUNT(*) c FROM payments WHERE payee=? AND gross=?').get(b.payee, gross).c
    if (dup > 0) return res.status(409).json({ error: `มีรายการจ่ายให้ ${b.payee} ยอด ${baht(gross)} อยู่แล้ว — ตรวจสอบว่าไม่ใช่การจ่ายซ้ำ (ปิดกติกานี้ได้ในหน้าตรวจสอบถ้าเป็นการจ่ายประจำ)` })
  }
  const rate = type === '-' ? 0 : (Number(b.wht_rate) || 0)
  const wht = Math.round((gross * rate) / 100)
  const seq = db.prepare('SELECT COUNT(*) c FROM payments').get().c + 208
  const no = `PV-${docYear()}-${String(seq).padStart(4, '0')}`
  const info = db.prepare('INSERT INTO payments (date,no,payee,type,gross,wht_rate,wht,net,house_code,note) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(todayTH(), no, b.payee, type, gross, rate, wht, gross - wht, String(b.house_code || ''), String(b.note || ''))
  audit(req, 'บันทึกจ่ายเงิน', `${b.payee} ฿${gross}`)
  res.status(201).json(db.prepare('SELECT * FROM payments WHERE id=?').get(info.lastInsertRowid))
})

// ---------- users (admin only) ----------
api.get('/users', adminOnly, (_req, res) =>
  res.json(db.prepare('SELECT id,name,username,role,status,last_active,signature,position FROM users ORDER BY id').all())
)
// upload/replace a signature image (admin can set anyone's; users can set their own)
api.put('/users/:id/signature', (req, res) => {
  const id = Number(req.params.id)
  if (req.user.role !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ error: 'แก้ได้เฉพาะลายเซ็นของตัวเอง' })
  }
  const sig = req.body?.signature
  if (typeof sig !== 'string' || !sig.startsWith('data:image/')) {
    return res.status(400).json({ error: 'ไฟล์ลายเซ็นไม่ถูกต้อง (ต้องเป็นรูปภาพ)' })
  }
  db.prepare('UPDATE users SET signature=? WHERE id=?').run(sig, id)
  res.json({ ok: true })
})
api.post('/users', adminOnly, (req, res) => {
  const { name, username, pin, role, position } = req.body || {}
  if (!name || !username) return res.status(400).json({ error: 'กรุณากรอกชื่อและชื่อผู้ใช้' })
  const hashed = hashPin(String(pin || '0000'))
  let userId
  try {
    const info = db
      .prepare("INSERT INTO users (name,username,pin,role,status,last_active,position) VALUES (?,?,?,?,?,'เพิ่งสร้าง',?)")
      .run(name, username, hashed, role || 'viewer', 'ใช้งาน', position || '')
    userId = info.lastInsertRowid
  } catch {
    return res.status(400).json({ error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' })
  }
  // เชื่อมกับ HR: สร้างพนักงานให้อัตโนมัติ (ถ้ายังไม่มีชื่อนี้) เพื่อไม่ต้องกรอกซ้ำ — วันลา/เงินเดือนไปเติมทีหลัง
  let employeeCreated = false
  const existingEmp = db.prepare('SELECT id FROM employees WHERE name=?').get(name)
  if (existingEmp) {
    // มีพนักงานชื่อนี้อยู่แล้ว → ผูกบัญชี (PIN จะถูก sync ให้ตรงกับผู้ใช้ด้านล่าง)
    db.prepare('UPDATE employees SET user_id=COALESCE(user_id,?) WHERE id=?').run(userId, existingEmp.id)
  } else {
    const maxNum = db.prepare("SELECT code FROM employees WHERE code LIKE 'EMP-%'").all()
      .reduce((m, r) => Math.max(m, parseInt(String(r.code).slice(4), 10) || 0), 0)
    const code = 'EMP-' + String(maxNum + 1).padStart(3, '0')
    const q = leaveQuota(todayTH())
    db.prepare(`INSERT INTO employees (code,name,role,dept,start,status,base,ot,sso,tax,pay_type,
                sick_quota,sick_used,personal_quota,personal_used,vacation_quota,vacation_used,pin,signature,spouse,children,user_id)
                VALUES (?,?,?,?,?,?,0,0,0,0,?,?,0,?,0,?,0,?,NULL,0,0,?)`)
      .run(code, name, position || '', position || '', todayTH(), 'ทดลองงาน', 'รายเดือน', 30, q.personal, q.vacation, hashed, userId)
    employeeCreated = true
  }
  syncEmployeePin({ id: userId, name }, hashed) // PIN ลงเวลา = PIN ผู้ใช้
  audit(req, 'เพิ่มผู้ใช้', name + (employeeCreated ? ' (สร้างพนักงาน HR ให้อัตโนมัติ)' : ''))
  const out = db.prepare('SELECT id,name,username,role,status,last_active,position FROM users WHERE id=?').get(userId)
  res.status(201).json({ ...out, employeeCreated })
})
api.put('/users/:id', adminOnly, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id)
  if (!u) return res.status(404).json({ error: 'ไม่พบผู้ใช้' })
  const { role, status } = req.body || {}
  db.prepare('UPDATE users SET role=?, status=? WHERE id=?').run(role ?? u.role, status ?? u.status, u.id)
  res.json(db.prepare('SELECT id,name,username,role,status,last_active FROM users WHERE id=?').get(u.id))
})
// ---------- job positions (ตำแหน่งงาน) — shared by users + employees ----------
api.get('/positions', (_req, res) =>
  res.json(db.prepare('SELECT name FROM positions ORDER BY id').all().map((r) => r.name))
)
api.post('/positions', adminOnly, (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'กรุณากรอกชื่อตำแหน่ง' })
  try { db.prepare('INSERT INTO positions (name) VALUES (?)').run(name) } catch { /* ignore duplicate */ }
  audit(req, 'เพิ่มตำแหน่งงาน', name)
  res.status(201).json(db.prepare('SELECT name FROM positions ORDER BY id').all().map((r) => r.name))
})
api.delete('/positions/:name', adminOnly, (req, res) => {
  db.prepare('DELETE FROM positions WHERE name=?').run(req.params.name)
  res.json(db.prepare('SELECT name FROM positions ORDER BY id').all().map((r) => r.name))
})

// any logged-in user changes their OWN PIN (must know current PIN)
api.post('/me/change-pin', (req, res) => {
  const { currentPin, newPin } = req.body || {}
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)
  if (!u) return res.status(404).json({ error: 'ไม่พบบัญชี' })
  if (!verifyPin(String(currentPin || ''), u.pin)) return res.status(400).json({ error: 'PIN ปัจจุบันไม่ถูกต้อง' })
  if (!/^\d{4}$/.test(String(newPin || ''))) return res.status(400).json({ error: 'PIN ใหม่ต้องเป็นตัวเลข 4 หลัก' })
  const newHashed = hashPin(String(newPin))
  db.prepare('UPDATE users SET pin=?, must_change_pin=0 WHERE id=?').run(newHashed, u.id)
  syncEmployeePin(u, newHashed) // อัปเดต PIN ลงเวลาให้ตรงกัน
  audit(req, 'เปลี่ยน PIN ตนเอง', u.username)
  res.json({ ok: true })
})
// admin resets another user's PIN (for forgotten PIN) — ตั้ง must_change_pin ให้ผู้ใช้ตั้งใหม่เอง
api.put('/users/:id/pin', adminOnly, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id)
  if (!u) return res.status(404).json({ error: 'ไม่พบผู้ใช้' })
  const { pin } = req.body || {}
  if (!/^\d{4}$/.test(String(pin || ''))) return res.status(400).json({ error: 'PIN ต้องเป็นตัวเลข 4 หลัก' })
  const resetHashed = hashPin(String(pin))
  db.prepare('UPDATE users SET pin=?, must_change_pin=1 WHERE id=?').run(resetHashed, u.id)
  syncEmployeePin(u, resetHashed) // อัปเดต PIN ลงเวลาให้ตรงกัน
  audit(req, 'รีเซ็ต PIN ผู้ใช้', u.username)
  res.json({ ok: true })
})
// ----- คำขอรีเซ็ต PIN (ลืม PIN) — แอดมินดู/อนุมัติ -----
api.get('/pin-resets', adminOnly, (_req, res) =>
  res.json(db.prepare("SELECT * FROM pin_reset_requests WHERE status='pending' ORDER BY id DESC").all()))
// แอดมินอนุมัติ: ตั้ง PIN ชั่วคราว (สุ่มถ้าไม่ระบุ) + บังคับตั้งใหม่ตอนเข้า + ปิดคำขอ · คืน PIN ชั่วคราวให้แอดมินไปบอกผู้ใช้
api.post('/pin-resets/:id/approve', adminOnly, (req, res) => {
  const r = db.prepare('SELECT * FROM pin_reset_requests WHERE id=?').get(req.params.id)
  if (!r) return res.status(404).json({ error: 'ไม่พบคำขอ' })
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(r.username)
  if (!u) return res.status(404).json({ error: 'ไม่พบผู้ใช้' })
  const provided = String((req.body || {}).pin || '')
  const tempPin = /^\d{4}$/.test(provided) ? provided : String(Math.floor(1000 + Math.random() * 9000))
  const hashed = hashPin(tempPin)
  db.prepare('UPDATE users SET pin=?, must_change_pin=1 WHERE id=?').run(hashed, u.id)
  syncEmployeePin(u, hashed)
  db.prepare("UPDATE pin_reset_requests SET status='done', resolved_by=?, resolved_at=? WHERE id=?").run(req.user.name, todayTH(), r.id)
  audit(req, 'อนุมัติรีเซ็ต PIN (ลืม PIN)', r.username)
  res.json({ ok: true, username: r.username, name: u.name, tempPin })
})
api.post('/pin-resets/:id/reject', adminOnly, (req, res) => {
  const r = db.prepare('SELECT * FROM pin_reset_requests WHERE id=?').get(req.params.id)
  if (!r) return res.status(404).json({ error: 'ไม่พบคำขอ' })
  db.prepare("UPDATE pin_reset_requests SET status='rejected', resolved_by=?, resolved_at=? WHERE id=?").run(req.user.name, todayTH(), r.id)
  audit(req, 'ปฏิเสธคำขอรีเซ็ต PIN', r.username)
  res.json({ ok: true })
})

// ---------- e-Filing (finance only) ----------
api.get('/efiling', financeOnly, (_req, res) => {
  res.json(efilingList())
})
api.get('/efiling/:id/download', financeOnly, (req, res) => {
  const e = EFILINGS[req.params.id]
  if (!e) return res.status(404).json({ error: 'ไม่พบแบบฟอร์ม' })
  const { filename, content } = e.gen()
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send('﻿' + content) // BOM so Thai opens correctly in Excel
})

// ---------- ส่งออกบัญชีเข้าโปรแกรม Express (CSV) — บัญชีนำเข้าทีเดียว ไม่ต้องคีย์ซ้ำ ----------
const EXPRESS_EXPORTS = {
  sales: 'ภาษีขาย + ใบกำกับ/ใบแจ้งหนี้',
  purchase: 'ภาษีซื้อ + รายจ่าย/PO',
  wht: 'หัก ณ ที่จ่าย (ภงด.3/53)',
  payroll: 'เงินเดือน / ภงด.1',
}
function expressCsv(kind) {
  const toCsv = (head, body) => '﻿' + [head, ...body].map((r) => r.map(csvCell).join(',')).join('\r\n')
  if (kind === 'sales') {
    const rows = db.prepare("SELECT * FROM sales_docs WHERE type IN ('invoice','receipt') ORDER BY date, id").all()
    const head = ['วันที่', 'เลขที่เอกสาร', 'ประเภท', 'ชื่อลูกค้า', 'เลขผู้เสียภาษี', 'มูลค่าก่อนภาษี', 'ภาษีขาย(7%)', 'รวมทั้งสิ้น']
    const body = rows.map((r) => [r.date, r.no, r.type === 'invoice' ? 'ใบแจ้งหนี้' : 'ใบเสร็จรับเงิน', r.customer, '', (r.subtotal || 0).toFixed(2), (r.vat || 0).toFixed(2), (r.total || 0).toFixed(2)])
    return { filename: 'express_ภาษีขาย.csv', content: toCsv(head, body) }
  }
  if (kind === 'purchase') {
    const vmap = new Map(db.prepare('SELECT name,tax_id FROM vendors').all().map((v) => [v.name, v.tax_id]))
    const rows = db.prepare('SELECT * FROM purchase_orders ORDER BY date, id').all()
    const head = ['วันที่', 'เลขที่ PO', 'ชื่อผู้ขาย', 'เลขผู้เสียภาษี', 'รายการ', 'มูลค่าก่อนภาษี', 'ภาษีซื้อ(7%)', 'รวมทั้งสิ้น']
    const body = rows.map((r) => { const total = r.amount || 0; const base = Math.round(total * 100 / 107); return [r.date, r.no, r.vendor, vmap.get(r.vendor) || '', r.item, base.toFixed(2), (total - base).toFixed(2), total.toFixed(2)] })
    return { filename: 'express_ภาษีซื้อ.csv', content: toCsv(head, body) }
  }
  if (kind === 'wht') {
    const rows = db.prepare("SELECT * FROM payments WHERE type IN ('ภงด.3','ภงด.53') ORDER BY date, id").all()
    const head = ['วันที่', 'เลขที่', 'ผู้ถูกหัก', 'ประเภทภาษี', 'ยอดก่อนหัก', 'อัตรา(%)', 'ภาษีหัก', 'จ่ายสุทธิ']
    const body = rows.map((r) => [r.date, r.no, r.payee, r.type, (r.gross || 0).toFixed(2), r.wht_rate, (r.wht || 0).toFixed(2), (r.net || 0).toFixed(2)])
    return { filename: 'express_หักณที่จ่าย.csv', content: toCsv(head, body) }
  }
  // payroll — งวดล่าสุด (snapshot ถ้าปิดงวดแล้ว)
  const period = currentPeriod()
  const run = db.prepare('SELECT data FROM payroll_runs WHERE period=?').get(period)
  const rows = run ? JSON.parse(run.data) : computePayroll(period)
  const head = ['รหัสพนักงาน', 'ชื่อ-สกุล', 'เลขผู้เสียภาษี', 'เงินเดือน', 'OT', 'ประกันสังคม', 'ภาษีหัก(ภงด.1)', 'เงินได้สุทธิ', 'ธนาคาร', 'เลขบัญชี']
  const body = rows.map((p) => [p.code || '', p.name, p.tax_id || '', (p.base || 0).toFixed(2), (p.ot || 0).toFixed(2), (p.sso || 0).toFixed(2), (p.tax || 0).toFixed(2), netOf(p).toFixed(2), p.bank_name || '', p.bank_acct || ''])
  return { filename: 'express_เงินเดือน.csv', content: toCsv(head, body) }
}
api.get('/export/express', financeOnly, (_req, res) => {
  const counts = {
    sales: db.prepare("SELECT COUNT(*) c FROM sales_docs WHERE type IN ('invoice','receipt')").get().c,
    purchase: db.prepare('SELECT COUNT(*) c FROM purchase_orders').get().c,
    wht: db.prepare("SELECT COUNT(*) c FROM payments WHERE type IN ('ภงด.3','ภงด.53')").get().c,
    payroll: db.prepare("SELECT COUNT(*) c FROM employees WHERE status != 'ลาออก'").get().c,
  }
  res.json(Object.entries(EXPRESS_EXPORTS).map(([id, label]) => ({ id, label, count: counts[id] || 0 })))
})
api.get('/export/express/:kind/download', financeOnly, (req, res) => {
  if (!EXPRESS_EXPORTS[req.params.kind]) return res.status(404).json({ error: 'ไม่พบชนิดการส่งออก' })
  const { filename, content } = expressCsv(req.params.kind)
  audit(req, 'ส่งออกบัญชีเข้า Express', EXPRESS_EXPORTS[req.params.kind])
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
  res.send(content)
})
api.get('/customers', (_req, res) => res.json(db.prepare('SELECT * FROM customers ORDER BY id DESC').all()))
api.get('/customers/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id)
  if (!c) return res.status(404).json({ error: 'ไม่พบลูกค้า' })
  c.contacts = db.prepare('SELECT * FROM customer_contacts WHERE customer_id=? ORDER BY id DESC').all(c.id)
  res.json(c)
})
api.post('/customers', canWrite, (req, res) => {
  const { name, phone, email, address, project, status, note } = req.body || {}
  if (!name) return res.status(400).json({ error: 'กรุณากรอกชื่อลูกค้า' })
  const info = db
    .prepare('INSERT INTO customers (name,phone,email,address,project,status,note,created) VALUES (?,?,?,?,?,?,?,?)')
    .run(name, phone || '', email || '', address || '', project || '', status || 'สนใจ', note || '', todayTH())
  res.status(201).json(db.prepare('SELECT * FROM customers WHERE id=?').get(info.lastInsertRowid))
})
api.put('/customers/:id', canWrite, (req, res) => {
  const c = db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id)
  if (!c) return res.status(404).json({ error: 'ไม่พบลูกค้า' })
  const b = req.body || {}
  db.prepare('UPDATE customers SET name=?, phone=?, email=?, address=?, project=?, status=?, note=? WHERE id=?')
    .run(b.name ?? c.name, b.phone ?? c.phone, b.email ?? c.email, b.address ?? c.address, b.project ?? c.project, b.status ?? c.status, b.note ?? c.note, c.id)
  res.json(db.prepare('SELECT * FROM customers WHERE id=?').get(c.id))
})
// contractors per house — with work totals derived from งวดงานช่าง assigned to each
api.get('/houses/:code/contractors', (req, res) => {
  const rows = db.prepare('SELECT * FROM contractors WHERE house_code=? ORDER BY id').all(req.params.code)
  res.json(rows.map((c) => {
    const work_total = db.prepare("SELECT COALESCE(SUM(amount),0) a FROM installments WHERE house_code=? AND side='contractor' AND contractor=?").get(req.params.code, c.name).a
    const work_paid = db.prepare("SELECT COALESCE(SUM(paid),0) a FROM installments WHERE house_code=? AND side='contractor' AND contractor=?").get(req.params.code, c.name).a
    const ev = db.prepare('SELECT avg,grade FROM contractor_evals WHERE contractor_id=? ORDER BY id DESC LIMIT 1').get(c.id)
    // ค่าของที่บริษัทออกให้ก่อน (advance) และที่หักจากงวดแล้ว (deduct) — จากสมุด contractor_advances
    const adv_total = db.prepare("SELECT COALESCE(SUM(amount),0) a FROM contractor_advances WHERE contractor_id=? AND type='advance'").get(c.id).a
    const deduct_total = db.prepare("SELECT COALESCE(SUM(amount),0) a FROM contractor_advances WHERE contractor_id=? AND type='deduct'").get(c.id).a
    return { ...c, work_total, work_paid, eval_avg: ev?.avg ?? null, eval_grade: ev?.grade ?? null, adv_total, deduct_total, adv_left: adv_total - deduct_total }
  }))
})

// ---------- ค่าของที่บริษัทออกให้ผู้รับเหมาก่อน (แล้วหักจากงวด) ----------
api.get('/contractors/:id/advances', (req, res) =>
  res.json(db.prepare('SELECT * FROM contractor_advances WHERE contractor_id=? ORDER BY id DESC').all(req.params.id))
)
api.post('/contractors/:id/advances', canWrite, (req, res) => {
  const c = db.prepare('SELECT * FROM contractors WHERE id=?').get(req.params.id)
  if (!c) return res.status(404).json({ error: 'ไม่พบช่าง/ผู้รับเหมา' })
  const b = req.body || {}
  const type = b.type === 'deduct' ? 'deduct' : 'advance'
  const amount = Number(b.amount) || 0
  if (amount <= 0) return res.status(400).json({ error: 'กรุณากรอกจำนวนเงิน' })
  if (type === 'deduct') {
    const adv = db.prepare("SELECT COALESCE(SUM(CASE WHEN type='advance' THEN amount ELSE -amount END),0) a FROM contractor_advances WHERE contractor_id=?").get(c.id).a
    if (amount > adv) return res.status(400).json({ error: `หักได้ไม่เกินค่าของที่คงเหลือ (${baht(adv)})` })
  }
  db.prepare('INSERT INTO contractor_advances (contractor_id,house_code,date,type,item,amount,by) VALUES (?,?,?,?,?,?,?)')
    .run(c.id, c.house_code, todayTH(), type, b.item || '', amount, req.user.name)
  audit(req, type === 'advance' ? 'ออกค่าของให้ผู้รับเหมา' : 'หักค่าของจากงวดผู้รับเหมา', `${c.name} ${baht(amount)}`)
  res.status(201).json({ ok: true })
})
api.delete('/contractor-advances/:id', canWrite, (req, res) => {
  db.prepare('DELETE FROM contractor_advances WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

// ---------- ประเมินผู้รับเหมาช่วง (Subcontractor Performance Evaluation) ----------
const EVAL_CRITERIA = ['คุณภาพของงานที่ส่งมอบ', 'ความตรงต่อเวลา', 'การปฏิบัติตามแบบและข้อกำหนด', 'การสื่อสารและการประสานงาน', 'การควบคุมแรงงานและทรัพยากร', 'การรักษาความปลอดภัยหน้างาน', 'การตอบสนองต่อการแก้ไขงาน', 'ความสะอาดและการเก็บงาน', 'การปฏิบัติตามกฎระเบียบ', 'ความร่วมมือโดยรวม']
function gradeOf(avg) {
  if (avg >= 4.5) return 'ดีมาก'
  if (avg >= 3.5) return 'ดี'
  if (avg >= 2.5) return 'ปานกลาง'
  return 'ควรปรับปรุง'
}
api.get('/contractors/:id/evals', (req, res) =>
  res.json(db.prepare('SELECT * FROM contractor_evals WHERE contractor_id=? ORDER BY id DESC').all(req.params.id).map((e) => ({ ...e, scores: JSON.parse(e.scores || '{}') })))
)
api.post('/contractors/:id/evals', canWrite, (req, res) => {
  const c = db.prepare('SELECT * FROM contractors WHERE id=?').get(req.params.id)
  if (!c) return res.status(404).json({ error: 'ไม่พบช่าง/ผู้รับเหมา' })
  const scores = (req.body && req.body.scores) || {}
  const vals = EVAL_CRITERIA.map((k) => Number(scores[k]) || 0).filter((v) => v > 0)
  if (!vals.length) return res.status(400).json({ error: 'กรุณาให้คะแนนอย่างน้อย 1 หัวข้อ' })
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  const info = db.prepare('INSERT INTO contractor_evals (contractor_id,house_code,name,scores,avg,grade,comment,by,date) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(c.id, c.house_code, c.name, JSON.stringify(scores), avg, gradeOf(avg), (req.body && req.body.comment) || '', req.user.name, todayTH())
  audit(req, 'ประเมินผู้รับเหมา', `${c.name} = ${avg.toFixed(2)}`)
  res.status(201).json(db.prepare('SELECT * FROM contractor_evals WHERE id=?').get(info.lastInsertRowid))
})

// ---------- ใบเปรียบเทียบราคา (price comparison) ผูกกับ PR ----------
api.get('/purchase-requests/:id/quotes', financeOnly, (req, res) =>
  res.json(db.prepare('SELECT * FROM pr_quotes WHERE pr_id=? ORDER BY (price=0), price').all(req.params.id))
)
api.post('/purchase-requests/:id/quotes', financeOnly, (req, res) => {
  const b = req.body || {}
  if (!b.vendor) return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ขาย' })
  const info = db.prepare('INSERT INTO pr_quotes (pr_id,vendor,price,terms,note,chosen) VALUES (?,?,?,?,?,0)')
    .run(req.params.id, b.vendor, Number(b.price) || 0, b.terms || '', b.note || '')
  res.status(201).json(db.prepare('SELECT * FROM pr_quotes WHERE id=?').get(info.lastInsertRowid))
})
api.post('/pr-quotes/:id/choose', financeOnly, (req, res) => {
  const q = db.prepare('SELECT * FROM pr_quotes WHERE id=?').get(req.params.id)
  if (!q) return res.status(404).json({ error: 'ไม่พบรายการ' })
  db.prepare('UPDATE pr_quotes SET chosen=0 WHERE pr_id=?').run(q.pr_id)
  db.prepare('UPDATE pr_quotes SET chosen=1 WHERE id=?').run(q.id)
  res.json({ ok: true })
})
api.delete('/pr-quotes/:id', financeOnly, (req, res) => {
  db.prepare('DELETE FROM pr_quotes WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

// ---------- ศูนย์ตรวจสอบ (Audit Center) — เฉพาะผู้จัดการ + ต้องยืนยัน PIN ----------
// ยืนยัน PIN ของผู้ใช้ปัจจุบัน (ใช้ก่อนเข้าหน้าตรวจสอบ)
api.post('/verify-pin', requireAuth, (req, res) => {
  const u = db.prepare('SELECT pin FROM users WHERE id=?').get(req.user.id)
  if (!u || !u.pin || !verifyPin(String(req.body?.pin || ''), u.pin)) return res.status(401).json({ error: 'PIN ไม่ถูกต้อง' })
  res.json({ ok: true })
})
api.get('/controls', requireManager, (_req, res) => res.json(controls()))
api.put('/controls', adminOnly, (req, res) => {
  const next = controls()
  for (const k of Object.keys(CONTROL_DEFAULTS)) {
    if (req.body && req.body[k] != null) next[k] = typeof CONTROL_DEFAULTS[k] === 'boolean' ? !!req.body[k] : Number(req.body[k]) || 0
  }
  setSetting('controls', JSON.stringify(next))
  audit(req, 'แก้กติกาควบคุมภายใน', JSON.stringify(next))
  res.json(next)
})
api.get('/audit-log', requireManager, (_req, res) => res.json(db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 300').all()))

// ประเมินสัญญาณเตือนทั้งหมด (red flags) จากข้อมูลจริง
api.get('/audit-center', requireManager, (_req, res) => {
  const ctrl = controls()
  const flags = []
  const push = (sev, type, key, title, detail, ref) => flags.push({ sev, type, key, title, detail, ref })
  const prs = db.prepare('SELECT * FROM purchase_requests').all()
  const pos = db.prepare('SELECT * FROM purchase_orders').all()
  const pays = db.prepare('SELECT * FROM payments').all()
  const exps = db.prepare('SELECT * FROM expenses').all()
  const vends = db.prepare('SELECT * FROM vendors').all()
  const vmap = new Map(vends.map((v) => [v.name, v]))

  // 1) อนุมัติใบที่ตัวเองขอ
  for (const p of prs) if (p.approver && p.by && p.approver === p.by) push('high', 'self_approve', 'sa' + p.id, 'อนุมัติใบขอซื้อที่ตัวเองเป็นผู้ขอ', `${p.no} · ผู้ขอ=ผู้อนุมัติ = ${p.by}`, p.no)

  // 2) ยอดใกล้เพดานอนุมัติ (เลี่ยงเกณฑ์)
  const ceils = [ctrl.two_step_above, ctrl.quote_required_above].filter((x) => x > 0)
  const near = (ctrl.near_threshold_pct || 90) / 100
  const checkNear = (amount, no, idkey) => {
    for (const c of ceils) if (amount >= c * near && amount < c) { push('med', 'near_ceiling', 'nc' + idkey, 'ยอดใกล้เพดานอนุมัติ (อาจตั้งใจเลี่ยง)', `${no} · ${baht(amount)} (เพดาน ${baht(c)})`, no); break }
  }
  for (const p of prs) checkNear(p.amount || 0, p.no, 'pr' + p.id)
  for (const o of pos) checkNear(o.amount || 0, o.no, 'po' + o.id)

  // 3) แตกใบเลี่ยงอนุมัติ (ผู้ขาย+บ้านเดียวกัน หลายใบ แต่ละใบต่ำกว่าเกณฑ์ รวมเกิน)
  const groups = {}
  for (const o of pos) { const k = (o.vendor || '') + '|' + (o.house_code || ''); (groups[k] = groups[k] || []).push(o) }
  for (const k in groups) {
    const g = groups[k]
    if (g.length >= 2) {
      const sum = g.reduce((s, o) => s + (o.amount || 0), 0)
      const maxOne = Math.max(...g.map((o) => o.amount || 0))
      if (maxOne < ctrl.split_threshold && sum >= ctrl.split_threshold) push('high', 'split', 'sp' + k, 'อาจแตกใบเลี่ยงอนุมัติ', `${g[0].vendor || '-'} · ${g.length} ใบ รวม ${baht(sum)} (แต่ละใบต่ำกว่าเกณฑ์)`, g.map((o) => o.no).join(', '))
    }
  }

  // 4) PO ยอดสูงแต่ไม่มีใบเทียบราคาครบ
  for (const o of pos) if ((o.amount || 0) >= ctrl.quote_required_above && o.pr_no) {
    const pr = prs.find((p) => p.no === o.pr_no)
    if (pr) { const qc = db.prepare('SELECT COUNT(*) c FROM pr_quotes WHERE pr_id=?').get(pr.id).c; if (qc < ctrl.quote_min) push('med', 'no_quotes', 'nq' + o.id, 'ไม่เทียบราคาครบตามเกณฑ์', `${o.no} · ${baht(o.amount)} · มีใบเทียบ ${qc}/${ctrl.quote_min}`, o.no) }
  }

  // 5) เลือกผู้ขายที่ไม่ใช่ราคาต่ำสุด
  for (const pid of db.prepare('SELECT DISTINCT pr_id FROM pr_quotes').all().map((r) => r.pr_id)) {
    const qs = db.prepare('SELECT * FROM pr_quotes WHERE pr_id=?').all(pid)
    const chosen = qs.find((q) => q.chosen)
    const priced = qs.filter((q) => q.price > 0)
    if (chosen && chosen.price > 0 && priced.length > 1) {
      const min = Math.min(...priced.map((q) => q.price))
      if (chosen.price > min) { const pr = prs.find((p) => p.id === pid); push('med', 'not_lowest', 'nl' + pid, 'เลือกผู้ขายที่ไม่ใช่ราคาต่ำสุด', `${pr ? pr.no : 'PR#' + pid} · เลือก ${chosen.vendor} ${baht(chosen.price)} (ต่ำสุด ${baht(min)})`, pr ? pr.no : '') }
    }
  }

  // 6) จ่ายเงินซ้ำ (ผู้รับ + ยอดเท่ากัน)
  const paykey = {}
  for (const p of pays) { const k = (p.payee || '') + '|' + (p.gross || 0); (paykey[k] = paykey[k] || []).push(p) }
  for (const k in paykey) { const g = paykey[k]; if (g.length >= 2) push('high', 'dup_payment', 'dp' + k, 'จ่ายเงินซ้ำ (ผู้รับ+ยอดเท่ากัน)', `${g[0].payee} · ${baht(g[0].gross)} × ${g.length} ครั้ง`, g.map((p) => p.no).join(', ')) }

  // 7) รายจ่ายซ้ำ (บ้าน+รายการ+ยอดเท่ากัน)
  const exkey = {}
  for (const e of exps) { const k = (e.house_code || '') + '|' + (e.item || '') + '|' + (e.amount || 0); (exkey[k] = exkey[k] || []).push(e) }
  for (const k in exkey) { const g = exkey[k]; if (g.length >= 2) push('med', 'dup_expense', 'de' + k, 'รายจ่ายซ้ำ (บ้าน+รายการ+ยอดเท่ากัน)', `${g[0].item} · ${baht(g[0].amount)} × ${g.length}`, g[0].house_code || '') }

  // 8) ผู้ขายไม่มีเลขผู้เสียภาษี แต่มีการสั่งซื้อ
  for (const o of pos) { const v = vmap.get(o.vendor); if (o.vendor && (!v || !v.tax_id)) push('med', 'vendor_no_tax', 'vn' + o.id, 'ผู้ขายไม่มีเลขผู้เสียภาษี', `${o.no} · ${o.vendor}`, o.no) }

  // 9) PO เกินยอดที่ขอ/อนุมัติ
  for (const o of pos) if (o.pr_no) { const pr = prs.find((p) => p.no === o.pr_no); if (pr && (o.amount || 0) > (pr.amount || 0)) push('high', 'po_over_pr', 'op' + o.id, 'PO เกินยอดที่ขอ/อนุมัติ', `${o.no} ${baht(o.amount)} > ${pr.no} ${baht(pr.amount)}`, o.no) }

  // 10) พนักงานได้เงินเดือนแต่ไม่มีการลงเวลาเลย (อาจเป็นพนักงานผี)
  for (const e of db.prepare('SELECT * FROM employees').all()) if ((e.base || 0) > 0) {
    const att = db.prepare('SELECT COUNT(*) c FROM attendance WHERE emp_code=? OR emp_name=?').get(e.code || '', e.name).c
    if (att === 0) push('med', 'ghost_emp', 'ge' + e.id, 'มีฐานเงินเดือนแต่ไม่มีการลงเวลาเลย', `${e.name} · ฐาน ${baht(e.base)}`, e.code || e.name)
  }

  // ผูกสถานะ "รับทราบแล้ว"
  const acks = new Map(db.prepare('SELECT * FROM flag_acks').all().map((a) => [a.flag_key, a]))
  const out = flags.map((f) => { const a = acks.get(f.key); return { ...f, acked: !!a, ackBy: a?.by, ackNote: a?.note } })
  out.sort((x, y) => (x.acked - y.acked) || ((y.sev === 'high') - (x.sev === 'high')))

  // กระทบยอด (reconciliation)
  const houses = db.prepare('SELECT * FROM houses').all()
  const collectedH = houses.reduce((s, h) => s + (h.collected || 0), 0)
  const collectedI = db.prepare("SELECT COALESCE(SUM(paid),0) a FROM installments WHERE side='customer'").get().a
  const paidH = houses.reduce((s, h) => s + (h.paid || 0), 0)
  const paidI = db.prepare("SELECT COALESCE(SUM(paid),0) a FROM installments WHERE side='contractor'").get().a
  const poRecv = db.prepare("SELECT COALESCE(SUM(amount),0) a FROM purchase_orders WHERE status IN ('รับของแล้ว','ปิดงาน')").get().a
  const expFromPo = db.prepare('SELECT COALESCE(SUM(amount),0) a FROM expenses WHERE po_id IS NOT NULL').get().a
  const reconcile = [
    { label: 'เก็บเงินลูกค้า', a: 'ยอดในบ้าน', av: collectedH, b: 'ยอดในงวดงาน', bv: collectedI },
    { label: 'จ่ายเงินช่าง', a: 'ยอดในบ้าน', av: paidH, b: 'ยอดในงวดงาน', bv: paidI },
    { label: 'PO รับของแล้ว → รายจ่าย', a: 'ยอด PO', av: poRecv, b: 'ลงรายจ่าย', bv: expFromPo },
  ].map((r) => ({ ...r, diff: r.av - r.bv, ok: r.av === r.bv }))

  res.json({ flags: out, reconcile, counts: { high: out.filter((f) => f.sev === 'high' && !f.acked).length, med: out.filter((f) => f.sev === 'med' && !f.acked).length } })
})

api.post('/audit-center/ack', requireManager, (req, res) => {
  const key = String(req.body?.key || '')
  if (!key) return res.status(400).json({ error: 'missing key' })
  db.prepare('INSERT INTO flag_acks (flag_key,by,date,note) VALUES (?,?,?,?) ON CONFLICT(flag_key) DO UPDATE SET by=excluded.by,date=excluded.date,note=excluded.note')
    .run(key, req.user.name, todayTH(), req.body?.note || '')
  audit(req, 'รับทราบสัญญาณเตือน', key)
  res.json({ ok: true })
})

// ---------- เอกสารหน้างาน (Site Documents): RFI / RFA / NCR / VO ----------
const SITE_KINDS = {
  rfi: { prefix: 'RFI', init: 'รอตอบ' },
  rfa: { prefix: 'RFA', init: 'รออนุมัติ' },
  ncr: { prefix: 'NCR', init: 'เปิด' },
  vo: { prefix: 'VO', init: 'เสนอ' },
}
api.get('/site-docs', (req, res) => {
  const kind = String(req.query.kind || '')
  const rows = kind
    ? db.prepare('SELECT * FROM site_docs WHERE kind=? ORDER BY id DESC').all(kind)
    : db.prepare('SELECT * FROM site_docs ORDER BY id DESC').all()
  res.json(rows)
})
api.post('/site-docs', canWrite, (req, res) => {
  const b = req.body || {}
  const kind = SITE_KINDS[b.kind] ? b.kind : null
  if (!kind) return res.status(400).json({ error: 'ชนิดเอกสารไม่ถูกต้อง' })
  if (!b.title) return res.status(400).json({ error: 'กรุณากรอกหัวข้อ/เรื่อง' })
  const cfg = SITE_KINDS[kind]
  const seq = db.prepare('SELECT COUNT(*) c FROM site_docs WHERE kind=?').get(kind).c + 1
  const no = `${cfg.prefix}-${docYear()}-${String(seq).padStart(3, '0')}`
  const img = typeof b.image === 'string' && b.image.startsWith('data:image/') ? b.image : null
  const info = db.prepare(`INSERT INTO site_docs
    (kind,no,house_code,discipline,title,detail,status,by,date,assignee,cost_impact,days_impact,image,created)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    kind, no, b.house_code || '', b.discipline || '', b.title, b.detail || '', cfg.init,
    req.user.name, todayTH(), b.assignee || '', Number(b.cost_impact) || 0, Number(b.days_impact) || 0, img, todayTH())
  audit(req, 'สร้างเอกสารหน้างาน', `${no} · ${b.title}`)
  res.status(201).json(db.prepare('SELECT * FROM site_docs WHERE id=?').get(info.lastInsertRowid))
})
api.put('/site-docs/:id', canWrite, (req, res) => {
  const d = db.prepare('SELECT * FROM site_docs WHERE id=?').get(req.params.id)
  if (!d) return res.status(404).json({ error: 'ไม่พบเอกสาร' })
  const b = req.body || {}
  const f = (k, num) => (b[k] != null && b[k] !== '' ? (num ? Number(b[k]) : b[k]) : d[k])
  // การตอบ/อนุมัติ — บันทึกผู้ตอบ + วันที่ เมื่อมีการใส่คำตอบใหม่
  const respondedNow = (b.response != null && b.response !== d.response) || (b.status && b.status !== d.status && d.status === SITE_KINDS[d.kind]?.init)
  db.prepare(`UPDATE site_docs SET status=?, response=?, responded_by=?, responded_date=?, discipline=?, title=?, detail=?, assignee=?, house_code=?, cost_impact=?, days_impact=? WHERE id=?`)
    .run(
      f('status'), f('response'),
      respondedNow ? req.user.name : d.responded_by,
      respondedNow ? todayTH() : d.responded_date,
      f('discipline'), f('title'), f('detail'), f('assignee'), f('house_code'), f('cost_impact', true), f('days_impact', true), d.id)
  audit(req, 'อัปเดตเอกสารหน้างาน', `${d.no} → ${f('status')}`)
  res.json(db.prepare('SELECT * FROM site_docs WHERE id=?').get(d.id))
})
api.delete('/site-docs/:id', canWrite, (req, res) => {
  const d = db.prepare('SELECT * FROM site_docs WHERE id=?').get(req.params.id)
  db.prepare('DELETE FROM site_docs WHERE id=?').run(req.params.id)
  if (d) audit(req, 'ลบเอกสารหน้างาน', d.no)
  res.json({ ok: true })
})

// ---------- เฟส 5: ความปลอดภัย (PPE / Toolbox Talk / JHA) ----------
const safetyRow = (r) => r ? { ...r, data: jparse(r.data) || {} } : r
const SAFETY_PREFIX = { ppe: 'PPE', toolbox: 'TBT', jha: 'JHA' }
api.get('/safety-records', (req, res) => {
  const kind = req.query.kind
  const rows = kind ? db.prepare('SELECT * FROM safety_records WHERE kind=? ORDER BY id DESC').all(kind) : db.prepare('SELECT * FROM safety_records ORDER BY id DESC').all()
  res.json(rows.map(safetyRow))
})
api.post('/safety-records', canWrite, (req, res) => {
  const b = req.body || {}
  const kind = SAFETY_PREFIX[b.kind] ? b.kind : 'ppe'
  const seq = db.prepare('SELECT COUNT(*) c FROM safety_records WHERE kind=?').get(kind).c + 1
  const no = `${SAFETY_PREFIX[kind]}-${docYear()}-${String(seq).padStart(3, '0')}`
  const info = db.prepare('INSERT INTO safety_records (kind,no,house_code,date,title,data,by,created) VALUES (?,?,?,?,?,?,?,?)')
    .run(kind, no, b.house_code || '', b.date || todayTH(), b.title || '', JSON.stringify(b.data || {}), req.user.name, todayTH())
  audit(req, 'บันทึกงานความปลอดภัย', no)
  res.status(201).json(safetyRow(db.prepare('SELECT * FROM safety_records WHERE id=?').get(info.lastInsertRowid)))
})
api.put('/safety-records/:id', canWrite, (req, res) => {
  const d = db.prepare('SELECT * FROM safety_records WHERE id=?').get(req.params.id)
  if (!d) return res.status(404).json({ error: 'ไม่พบรายการ' })
  const b = req.body || {}
  db.prepare('UPDATE safety_records SET house_code=?, date=?, title=?, data=? WHERE id=?')
    .run(b.house_code ?? d.house_code, b.date ?? d.date, b.title ?? d.title, b.data ? JSON.stringify(b.data) : d.data, d.id)
  res.json(safetyRow(db.prepare('SELECT * FROM safety_records WHERE id=?').get(d.id)))
})
api.delete('/safety-records/:id', canWrite, (req, res) => { db.prepare('DELETE FROM safety_records WHERE id=?').run(req.params.id); res.json({ ok: true }) })

// ---------- เฟส 5: ใบส่งมอบงาน / หนังสือรับรองผลงาน ----------
const handoverRow = (r) => r ? { ...r, data: jparse(r.data) || {} } : r
const HANDOVER_PREFIX = { handover: 'HD', certificate: 'CERT' }
api.get('/handovers', (req, res) => {
  const kind = req.query.kind
  const rows = kind ? db.prepare('SELECT * FROM handover_docs WHERE kind=? ORDER BY id DESC').all(kind) : db.prepare('SELECT * FROM handover_docs ORDER BY id DESC').all()
  res.json(rows.map(handoverRow))
})
api.post('/handovers', canWrite, (req, res) => {
  const b = req.body || {}
  const kind = HANDOVER_PREFIX[b.kind] ? b.kind : 'handover'
  const seq = db.prepare('SELECT COUNT(*) c FROM handover_docs WHERE kind=?').get(kind).c + 1
  const no = `${HANDOVER_PREFIX[kind]}-${docYear()}-${String(seq).padStart(3, '0')}`
  const info = db.prepare('INSERT INTO handover_docs (kind,no,house_code,date,title,data,status,by,created) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(kind, no, b.house_code || '', b.date || todayTH(), b.title || '', JSON.stringify(b.data || {}), b.status || 'ร่าง', req.user.name, todayTH())
  audit(req, kind === 'certificate' ? 'ออกหนังสือรับรองผลงาน' : 'ออกใบส่งมอบงาน', no)
  res.status(201).json(handoverRow(db.prepare('SELECT * FROM handover_docs WHERE id=?').get(info.lastInsertRowid)))
})
api.put('/handovers/:id', canWrite, (req, res) => {
  const d = db.prepare('SELECT * FROM handover_docs WHERE id=?').get(req.params.id)
  if (!d) return res.status(404).json({ error: 'ไม่พบเอกสาร' })
  const b = req.body || {}
  db.prepare('UPDATE handover_docs SET house_code=?, date=?, title=?, data=?, status=? WHERE id=?')
    .run(b.house_code ?? d.house_code, b.date ?? d.date, b.title ?? d.title, b.data ? JSON.stringify(b.data) : d.data, b.status ?? d.status, d.id)
  res.json(handoverRow(db.prepare('SELECT * FROM handover_docs WHERE id=?').get(d.id)))
})
api.delete('/handovers/:id', canWrite, (req, res) => { db.prepare('DELETE FROM handover_docs WHERE id=?').run(req.params.id); res.json({ ok: true }) })
// #20: ดึงข้อมูลจริงมากรอกใบส่งมอบ/หนังสือรับรอง จากงวดที่ตรวจรับผ่าน + ยอดจ่ายช่าง + เกรดผู้รับเหมา
api.get('/handover-autofill', (req, res) => {
  const kind = req.query.kind === 'certificate' ? 'certificate' : 'handover'
  const hc = req.query.house_code || ''
  if (!hc) return res.json({})
  const house = db.prepare('SELECT * FROM houses WHERE code=?').get(hc)
  if (kind === 'handover') {
    // งวดลูกค้าที่ตรวจรับ "ผ่าน/ผ่านบางส่วน" ล่าสุด → ดึงขอบเขต + รายการตรวจรับ
    const acc = db.prepare("SELECT a.*, i.no inst_no, i.detail inst_detail FROM inst_acceptance a JOIN installments i ON i.id=a.installment_id WHERE a.house_code=? AND a.result IN ('ผ่าน','ผ่านบางส่วน') ORDER BY a.id DESC LIMIT 1").get(hc)
    if (!acc) return res.json({ found: false })
    const checklist = jparse(acc.checklist) || []
    const items = checklist.filter((c) => c && (c.text || c.name)).map((c) => ({ name: c.text || c.name, pass: c.result !== 'ไม่ผ่าน' && c.ok !== false }))
    return res.json({
      found: true,
      title: `ส่งมอบงานงวดที่ ${acc.inst_no}`,
      data: {
        scope: acc.inst_detail || `งวดที่ ${acc.inst_no}`,
        deliver_to: acc.inspector || (house ? house.manager : '') || '',
        items: items.length ? items : [{ name: acc.inst_detail || 'งานตามงวด', pass: acc.result !== 'ไม่ผ่าน' }],
        defects: acc.result === 'ผ่านบางส่วน' ? (acc.note || 'มีงานต้องแก้ไขบางส่วน') : '',
      },
    })
  }
  // certificate: ยอดจ่ายช่างจริง + เกรดผู้รับเหมาล่าสุด + ระยะเวลาโครงการ
  const paid = db.prepare("SELECT COALESCE(SUM(paid),0) a FROM installments WHERE side='contractor' AND house_code=?").get(hc).a
  const con = db.prepare('SELECT * FROM contractors WHERE house_code=? ORDER BY id LIMIT 1').get(hc)
  let rating = 'ดีมาก'
  if (con) {
    const ev = db.prepare('SELECT grade FROM contractor_evals WHERE contractor_id=? ORDER BY id DESC LIMIT 1').get(con.id)
    if (ev && ev.grade) rating = ({ A: 'ดีเยี่ยม', B: 'ดีมาก', C: 'ดี', D: 'พอใช้', F: 'ต้องปรับปรุง' })[ev.grade] || ev.grade
  }
  const period = house && (house.start_date || house.deliver_date) ? `${house.start_date || '-'} – ${house.deliver_date || 'ปัจจุบัน'}` : ''
  res.json({
    found: true,
    title: `รับรองผลงาน ${house ? house.name : hc}`,
    data: { contractor: con ? con.name : '', project: house ? house.name : hc, value: paid || (house ? house.contractor_value : 0) || 0, period, rating, scope: house ? (house.scope || '') : '' },
  })
})

// ---------- ทะเบียนควบคุมเอกสาร (สัญญา / แบบ / สเปก + revision) ----------
const docRegRow = (r) => r ? { ...r, revisions: jparse(r.revisions) || [] } : r
api.get('/doc-register', auditView, (req, res) => {
  const rows = db.prepare('SELECT * FROM doc_register ORDER BY id DESC').all()
  res.json(rows.map(docRegRow))
})
api.post('/doc-register', auditView, (req, res) => {
  const b = req.body || {}
  const seq = db.prepare('SELECT COUNT(*) c FROM doc_register').get().c + 1
  const no = `DOC-${docYear()}-${String(seq).padStart(3, '0')}`
  const rev = b.revision || 'A'
  const revisions = [{ rev, date: b.rev_date || todayTH(), note: 'ฉบับแรก', by: req.user.name }]
  const info = db.prepare('INSERT INTO doc_register (no,category,title,doc_no,revision,rev_date,status,owner,house_code,note,revisions,expiry,by,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(no, b.category || 'contract', b.title || '', b.doc_no || '', rev, b.rev_date || todayTH(), b.status || 'ใช้งาน', b.owner || '', b.house_code || '', b.note || '', JSON.stringify(revisions), b.expiry || '', req.user.name, todayTH())
  audit(req, 'ขึ้นทะเบียนเอกสาร', `${no} · ${b.title || ''}`)
  res.status(201).json(docRegRow(db.prepare('SELECT * FROM doc_register WHERE id=?').get(info.lastInsertRowid)))
})
api.put('/doc-register/:id', auditView, (req, res) => {
  const d = db.prepare('SELECT * FROM doc_register WHERE id=?').get(req.params.id)
  if (!d) return res.status(404).json({ error: 'ไม่พบเอกสาร' })
  const b = req.body || {}
  db.prepare('UPDATE doc_register SET category=?, title=?, doc_no=?, status=?, owner=?, house_code=?, note=?, expiry=? WHERE id=?')
    .run(b.category ?? d.category, b.title ?? d.title, b.doc_no ?? d.doc_no, b.status ?? d.status, b.owner ?? d.owner, b.house_code ?? d.house_code, b.note ?? d.note, b.expiry ?? d.expiry, d.id)
  res.json(docRegRow(db.prepare('SELECT * FROM doc_register WHERE id=?').get(d.id)))
})
// #21: ดึงสัญญาจากบ้าน (house.contract_no) เข้าทะเบียนอัตโนมัติ — เฉพาะที่ยังไม่ได้ขึ้นทะเบียน
api.post('/doc-register/import-contracts', auditView, (req, res) => {
  const houses = db.prepare("SELECT code,name,contract_no,owner,customer FROM houses WHERE COALESCE(contract_no,'')!=''").all()
  let added = 0
  for (const h of houses) {
    const exists = db.prepare("SELECT COUNT(*) c FROM doc_register WHERE category='contract' AND (doc_no=? OR house_code=?)").get(h.contract_no, h.code).c
    if (exists) continue
    const seq = db.prepare('SELECT COUNT(*) c FROM doc_register').get().c + 1
    const no = `DOC-${docYear()}-${String(seq).padStart(3, '0')}`
    const revisions = [{ rev: 'A', date: todayTH(), note: 'นำเข้าจากข้อมูลบ้าน', by: req.user.name }]
    db.prepare('INSERT INTO doc_register (no,category,title,doc_no,revision,rev_date,status,owner,house_code,note,revisions,expiry,by,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(no, 'contract', `สัญญาก่อสร้าง ${h.name}`, h.contract_no, 'A', todayTH(), 'ใช้งาน', h.owner || h.customer || '', h.code, 'นำเข้าอัตโนมัติจากทะเบียนบ้าน', JSON.stringify(revisions), '', req.user.name, todayTH())
    added++
  }
  if (added) audit(req, 'นำเข้าสัญญาจากบ้าน', `${added} ฉบับ`)
  res.json({ ok: true, added })
})
// ออก revision ใหม่ (บันทึกประวัติเวอร์ชัน)
api.post('/doc-register/:id/revise', auditView, (req, res) => {
  const d = db.prepare('SELECT * FROM doc_register WHERE id=?').get(req.params.id)
  if (!d) return res.status(404).json({ error: 'ไม่พบเอกสาร' })
  const b = req.body || {}
  if (!b.revision) return res.status(400).json({ error: 'กรุณาระบุเลขเวอร์ชันใหม่' })
  const revisions = (jparse(d.revisions) || [])
  revisions.push({ rev: b.revision, date: b.rev_date || todayTH(), note: b.note || '', by: req.user.name })
  db.prepare('UPDATE doc_register SET revision=?, rev_date=?, revisions=? WHERE id=?')
    .run(b.revision, b.rev_date || todayTH(), JSON.stringify(revisions), d.id)
  audit(req, 'ออกเวอร์ชันเอกสารใหม่', `${d.no} → Rev.${b.revision}`)
  res.json(docRegRow(db.prepare('SELECT * FROM doc_register WHERE id=?').get(d.id)))
})
api.delete('/doc-register/:id', auditView, (req, res) => { db.prepare('DELETE FROM doc_register WHERE id=?').run(req.params.id); res.json({ ok: true }) })

// ---------- QC Checklist (ตรวจงานก่อสร้าง) ----------
const qcRow = (r) => r ? { ...r, items: jparse(r.items) || [], images: jparse(r.images) || [] } : r
// รับรูปแนบ: เฉพาะ data URL รูปภาพ สูงสุด 3 รูป
const cleanImgs = (arr) => (Array.isArray(arr) ? arr : []).filter((s) => typeof s === 'string' && s.startsWith('data:image/')).slice(0, 3)
api.get('/qc', (req, res) => {
  const hc = req.query.house_code
  const rows = hc ? db.prepare('SELECT * FROM qc_inspections WHERE house_code=? ORDER BY id DESC').all(hc) : db.prepare('SELECT * FROM qc_inspections ORDER BY id DESC').all()
  res.json(rows.map(qcRow))
})
api.post('/qc', canWrite, (req, res) => {
  const b = req.body || {}
  if (!b.category || !b.type) return res.status(400).json({ error: 'กรุณาเลือกหมวด/ประเภทงาน' })
  const items = Array.isArray(b.items) ? b.items.map((it, i) => ({ no: it.no || i + 1, text: String(it.text || ''), result: it.result || '', fix: it.fix || '', remark: it.remark || '', images: cleanImgs(it.images) })) : []
  const seq = db.prepare('SELECT COUNT(*) c FROM qc_inspections').get().c + 1
  const no = `QC-${docYear()}-${String(seq).padStart(3, '0')}`
  const info = db.prepare('INSERT INTO qc_inspections (no,house_code,category,type,zone,inspector,date,status,items,remark,images,start_date,end_date,by,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(no, b.house_code || '', b.category, b.type, b.zone || '', b.inspector || req.user.name, todayTH(), b.status || 'กำลังตรวจ', JSON.stringify(items), b.remark || '', JSON.stringify(cleanImgs(b.images)), b.start_date || '', b.end_date || '', req.user.name, todayTH())
  audit(req, 'สร้างใบตรวจ QC', `${no} · ${b.type}`)
  res.status(201).json(qcRow(db.prepare('SELECT * FROM qc_inspections WHERE id=?').get(info.lastInsertRowid)))
})
api.put('/qc/:id', canWrite, (req, res) => {
  const d = db.prepare('SELECT * FROM qc_inspections WHERE id=?').get(req.params.id)
  if (!d) return res.status(404).json({ error: 'ไม่พบใบตรวจ' })
  const b = req.body || {}
  const items = Array.isArray(b.items)
    ? JSON.stringify(b.items.map((it, i) => ({ no: it.no || i + 1, text: String(it.text || ''), result: it.result || '', fix: it.fix || '', remark: it.remark || '', images: cleanImgs(it.images) })))
    : d.items
  const images = b.images !== undefined ? JSON.stringify(cleanImgs(b.images)) : d.images
  db.prepare('UPDATE qc_inspections SET status=?, items=?, remark=?, zone=?, inspector=?, images=?, start_date=?, end_date=? WHERE id=?')
    .run(b.status ?? d.status, items, b.remark ?? d.remark, b.zone ?? d.zone, b.inspector ?? d.inspector, images, b.start_date ?? d.start_date, b.end_date ?? d.end_date, d.id)
  res.json(qcRow(db.prepare('SELECT * FROM qc_inspections WHERE id=?').get(d.id)))
})
api.delete('/qc/:id', canWrite, (req, res) => { db.prepare('DELETE FROM qc_inspections WHERE id=?').run(req.params.id); res.json({ ok: true }) })

// สรุป QC สำหรับผู้บริหาร (CEO) — ภาพรวม + แยกตามบ้าน + แยกตามผู้ตรวจ (ผูก KPI) · เฉพาะ CEO
api.get('/qc/summary', pmsOnly, (_req, res) => {
  const rows = db.prepare('SELECT * FROM qc_inspections').all().map(qcRow)
  const todayISO = new Date().toISOString().slice(0, 10)
  const nameByCode = Object.fromEntries(db.prepare('SELECT code,name FROM houses').all().map((h) => [h.code, h.name]))
  const passed = rows.filter((r) => r.status === 'ผ่าน').length
  const fixReq = rows.filter((r) => r.status === 'ต้องแก้ไข').length
  const inProg = rows.filter((r) => r.status === 'กำลังตรวจ').length
  const overdueList = rows.filter((r) => r.end_date && r.end_date < todayISO && r.status !== 'ผ่าน')
    .map((r) => ({ no: r.no, type: r.type, house: nameByCode[r.house_code] || r.house_code || '—', inspector: r.inspector, end_date: r.end_date, status: r.status }))
  // แยกตามบ้าน
  const byHouseMap = {}
  for (const r of rows) { const k = r.house_code || '—'; (byHouseMap[k] = byHouseMap[k] || { house: nameByCode[k] || k || '—', total: 0, passed: 0, fix: 0 }); byHouseMap[k].total++; if (r.status === 'ผ่าน') byHouseMap[k].passed++; if (r.status === 'ต้องแก้ไข') byHouseMap[k].fix++ }
  // แยกตามผู้ตรวจ (ผูก KPI ของคนกรอก) — อัตราผ่าน = คะแนน KPI งานตรวจ
  const byInspMap = {}
  for (const r of rows) { const k = r.inspector || '—'; (byInspMap[k] = byInspMap[k] || { inspector: k, total: 0, passed: 0, fix: 0, emp_code: '' }); byInspMap[k].total++; if (r.status === 'ผ่าน') byInspMap[k].passed++; if (r.status === 'ต้องแก้ไข') byInspMap[k].fix++ }
  const empByName = Object.fromEntries(db.prepare('SELECT code,name FROM employees').all().map((e) => [e.name, e.code]))
  const byInspector = Object.values(byInspMap).map((x) => ({ ...x, emp_code: empByName[x.inspector] || '', passRate: x.total ? Math.round((x.passed / x.total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total)
  res.json({
    total: rows.length, passed, fixReq, inProg,
    passRate: rows.length ? Math.round((passed / rows.length) * 100) : 0,
    overdue: overdueList.length, overdueList,
    byHouse: Object.values(byHouseMap).sort((a, b) => b.total - a.total),
    byInspector,
  })
})
// สถิติ QC ของผู้ตรวจคนหนึ่ง (สำหรับดึงเข้า KPI/PMS)
api.get('/qc/inspector-stats', auditView, (req, res) => {
  const name = req.query.inspector || ''
  const rows = db.prepare('SELECT status FROM qc_inspections WHERE inspector=?').all(name)
  const total = rows.length
  const passed = rows.filter((r) => r.status === 'ผ่าน').length
  res.json({ inspector: name, total, passed, passRate: total ? Math.round((passed / total) * 100) : 0 })
})

// ---------- รายงานหน้างาน (Daily / Weekly Report) ----------
const srRow = (r) => r ? { ...r, data: jparse(r.data) || {} } : r
api.get('/site-reports', (req, res) => {
  const kind = req.query.kind
  const rows = kind ? db.prepare('SELECT * FROM site_reports WHERE kind=? ORDER BY id DESC').all(kind) : db.prepare('SELECT * FROM site_reports ORDER BY id DESC').all()
  res.json(rows.map(srRow))
})
// ดึงข้อมูลจริงมากรอกรายงานให้อัตโนมัติ: แรงงาน (จากการลงเวลา), ความคืบหน้า (S-curve จาก tasks), เอกสาร RFI/RFA/VO
const SITE_DOC_LABEL = { rfi: 'RFI', rfa: 'RFA', ncr: 'NCR', vo: 'VO' }
api.get('/site-report-autofill', (req, res) => {
  const kind = req.query.kind === 'weekly' ? 'weekly' : 'daily'
  const hc = req.query.house_code || ''
  const today = todayTH()
  // แรงงาน: จำนวนคนที่ลงเวลาเข้างานวันนี้ (ทั้งบริษัท — การลงเวลาไม่ผูกกับบ้าน)
  const presentToday = db.prepare("SELECT COUNT(DISTINCT emp_code) c FROM attendance WHERE date=? AND COALESCE(check_in,'')!=''").get(today).c
  const presentNames = db.prepare("SELECT DISTINCT emp_name FROM attendance WHERE date=? AND COALESCE(check_in,'')!=''").all(today).map((r) => r.emp_name).filter(Boolean)
  // ความคืบหน้า (S-curve): ถ่วงน้ำหนักงานตาม weight ของบ้านนั้น
  const tasks = hc ? db.prepare('SELECT * FROM tasks WHERE house_code=?').all(hc) : db.prepare('SELECT * FROM tasks').all()
  let progress = 0
  if (tasks.length) {
    const totW = tasks.reduce((s, t) => s + (Number(t.weight) || 0), 0)
    progress = totW > 0
      ? Math.round(tasks.reduce((s, t) => s + (Number(t.progress) || 0) * (Number(t.weight) || 0), 0) / totW)
      : Math.round(tasks.reduce((s, t) => s + (Number(t.progress) || 0), 0) / tasks.length)
  }
  // เอกสารหน้างานของบ้านนี้ (RFI/RFA/VO — ไม่รวม NCR) สำหรับ Weekly
  const docsRows = (hc
    ? db.prepare("SELECT kind,no,title,status FROM site_docs WHERE house_code=? AND kind IN ('rfi','rfa','vo') ORDER BY id DESC").all(hc)
    : db.prepare("SELECT kind,no,title,status FROM site_docs WHERE kind IN ('rfi','rfa','vo') ORDER BY id DESC LIMIT 20").all())
  const docs = docsRows.map((d) => `• [${SITE_DOC_LABEL[d.kind] || d.kind}] ${d.no} ${d.title} — ${d.status}`).join('\n')
  const manpower = presentNames.length ? `ลงเวลาเข้างานวันนี้ ${presentToday} คน: ${presentNames.join(', ')}` : `ลงเวลาเข้างานวันนี้ ${presentToday} คน`
  // สรุปงานความปลอดภัยของบ้านนี้ (Toolbox Talk / ตรวจ PPE / JHA)
  const SAF_LABEL = { ppe: 'ตรวจ PPE', toolbox: 'Toolbox Talk', jha: 'JHA' }
  const safRows = (hc
    ? db.prepare('SELECT kind,no,title,date FROM safety_records WHERE house_code=? ORDER BY id DESC LIMIT 10').all(hc)
    : db.prepare('SELECT kind,no,title,date FROM safety_records ORDER BY id DESC LIMIT 10').all())
  const safety = safRows.map((s) => `• [${SAF_LABEL[s.kind] || s.kind}] ${s.no} ${s.title || ''} (${s.date})`).join('\n')
  res.json({ labor: String(presentToday), progress: String(progress), actual: String(progress), manpower, docs, safety })
})
api.post('/site-reports', canWrite, (req, res) => {
  const b = req.body || {}
  const kind = b.kind === 'weekly' ? 'weekly' : 'daily'
  const seq = db.prepare('SELECT COUNT(*) c FROM site_reports WHERE kind=?').get(kind).c + 1
  const no = `${kind === 'weekly' ? 'WR' : 'DR'}-${docYear()}-${String(seq).padStart(3, '0')}`
  const info = db.prepare('INSERT INTO site_reports (kind,no,house_code,date,data,by,created) VALUES (?,?,?,?,?,?,?)')
    .run(kind, no, b.house_code || '', b.date || todayTH(), JSON.stringify(b.data || {}), req.user.name, todayTH())
  audit(req, 'บันทึกรายงานหน้างาน', no)
  res.status(201).json(srRow(db.prepare('SELECT * FROM site_reports WHERE id=?').get(info.lastInsertRowid)))
})
api.put('/site-reports/:id', canWrite, (req, res) => {
  const d = db.prepare('SELECT * FROM site_reports WHERE id=?').get(req.params.id)
  if (!d) return res.status(404).json({ error: 'ไม่พบรายงาน' })
  const b = req.body || {}
  db.prepare('UPDATE site_reports SET house_code=?, date=?, data=? WHERE id=?')
    .run(b.house_code ?? d.house_code, b.date ?? d.date, b.data ? JSON.stringify(b.data) : d.data, d.id)
  res.json(srRow(db.prepare('SELECT * FROM site_reports WHERE id=?').get(d.id)))
})
api.delete('/site-reports/:id', canWrite, (req, res) => { db.prepare('DELETE FROM site_reports WHERE id=?').run(req.params.id); res.json({ ok: true }) })

// ---------- ตรวจรับงวดงาน (Work Progress Acceptance) ----------
const acRow = (r) => r ? { ...r, checklist: jparse(r.checklist) || [], works: jparse(r.works) || [] } : r
api.get('/acceptances', (req, res) => {
  const hc = req.query.house_code
  const rows = hc ? db.prepare('SELECT * FROM inst_acceptance WHERE house_code=? ORDER BY id DESC').all(hc) : db.prepare('SELECT * FROM inst_acceptance ORDER BY id DESC').all()
  res.json(rows.map(acRow))
})
api.get('/installments/:id/acceptance', (req, res) =>
  res.json(acRow(db.prepare('SELECT * FROM inst_acceptance WHERE installment_id=? ORDER BY id DESC').get(req.params.id)) || null)
)
api.post('/installments/:id/acceptance', canWrite, (req, res) => {
  const inst = db.prepare('SELECT * FROM installments WHERE id=?').get(req.params.id)
  if (!inst) return res.status(404).json({ error: 'ไม่พบงวดงาน' })
  const b = req.body || {}
  const seq = db.prepare('SELECT COUNT(*) c FROM inst_acceptance').get().c + 1
  const no = `AC-${docYear()}-${String(seq).padStart(3, '0')}`
  const info = db.prepare('INSERT INTO inst_acceptance (installment_id,house_code,no,date,inspector,result,checklist,works,note,by,created) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(inst.id, inst.house_code, no, b.date || todayTH(), b.inspector || req.user.name, b.result || 'ผ่าน', JSON.stringify(b.checklist || []), JSON.stringify(b.works || []), b.note || '', req.user.name, todayTH())
  audit(req, 'ตรวจรับงวดงาน', `${no} · ${inst.house_code} งวด ${inst.no} → ${b.result || 'ผ่าน'}`)
  res.status(201).json(acRow(db.prepare('SELECT * FROM inst_acceptance WHERE id=?').get(info.lastInsertRowid)))
})
api.delete('/acceptances/:id', canWrite, (req, res) => { db.prepare('DELETE FROM inst_acceptance WHERE id=?').run(req.params.id); res.json({ ok: true }) })

// ---------- เฟส 4: BOQ / Cash Flow / บัญชีรับ-จ่าย (เห็น/แก้ได้ admin/บัญชี/ผู้จัดการ) ----------
// BOQ (ตีราคา)
const boqRow = (r) => r ? { ...r, items: jparse(r.items) || [] } : r
api.get('/boqs', auditView, (req, res) => {
  const hc = req.query.house_code
  const rows = hc ? db.prepare('SELECT * FROM boqs WHERE house_code=? ORDER BY id DESC').all(hc) : db.prepare('SELECT * FROM boqs ORDER BY id DESC').all()
  res.json(rows.map(boqRow))
})
api.post('/boqs', auditView, (req, res) => {
  const b = req.body || {}
  const seq = db.prepare('SELECT COUNT(*) c FROM boqs').get().c + 1
  const no = `BOQ-${docYear()}-${String(seq).padStart(3, '0')}`
  const info = db.prepare('INSERT INTO boqs (no,house_code,title,markup_pct,vat_pct,items,by,date,created) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(no, b.house_code || '', b.title || 'ประมาณราคาก่อสร้าง', Number(b.markup_pct) || 0, Number(b.vat_pct) || 0, JSON.stringify(b.items || []), req.user.name, todayTH(), todayTH())
  audit(req, 'สร้าง BOQ', no)
  res.status(201).json(boqRow(db.prepare('SELECT * FROM boqs WHERE id=?').get(info.lastInsertRowid)))
})
api.put('/boqs/:id', auditView, (req, res) => {
  const d = db.prepare('SELECT * FROM boqs WHERE id=?').get(req.params.id)
  if (!d) return res.status(404).json({ error: 'ไม่พบ BOQ' })
  const b = req.body || {}
  db.prepare('UPDATE boqs SET house_code=?, title=?, markup_pct=?, vat_pct=?, items=? WHERE id=?')
    .run(b.house_code ?? d.house_code, b.title ?? d.title, b.markup_pct != null ? Number(b.markup_pct) : d.markup_pct, b.vat_pct != null ? Number(b.vat_pct) : d.vat_pct, b.items ? JSON.stringify(b.items) : d.items, d.id)
  res.json(boqRow(db.prepare('SELECT * FROM boqs WHERE id=?').get(d.id)))
})
api.delete('/boqs/:id', auditView, (req, res) => { db.prepare('DELETE FROM boqs WHERE id=?').run(req.params.id); res.json({ ok: true }) })
// grand total ของ BOQ (คิดฝั่ง server เพื่อกันแก้ตัวเลขจากหน้าเว็บ)
function boqGrand(d) {
  const items = jparse(d.items) || []
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * ((Number(it.mat) || 0) + (Number(it.lab) || 0)), 0)
  const afterMarkup = subtotal + subtotal * (Number(d.markup_pct) || 0) / 100
  return Math.round(afterMarkup + afterMarkup * (Number(d.vat_pct) || 0) / 100)
}
// ดัน BOQ → ราคาขายบ้าน (ตั้งราคา "ตัวบ้าน" ฝั่งลูกค้า = ยอดรวม BOQ) และ/หรือ สร้างงวดงานลูกค้า
api.post('/boqs/:id/push-to-house', auditView, (req, res) => {
  const d = db.prepare('SELECT * FROM boqs WHERE id=?').get(req.params.id)
  if (!d) return res.status(404).json({ error: 'ไม่พบ BOQ' })
  if (!d.house_code) return res.status(400).json({ error: 'BOQ นี้ยังไม่ได้เลือกบ้าน — กรุณาเลือกบ้านก่อน' })
  const h = db.prepare('SELECT * FROM houses WHERE code=?').get(d.house_code)
  if (!h) return res.status(404).json({ error: 'ไม่พบบ้านที่ผูกกับ BOQ นี้' })
  const grand = boqGrand(d)
  const mode = (req.body && req.body.mode) || 'price' // 'price' | 'installment'
  if (mode === 'installment') {
    // สร้างงวดงานลูกค้า 1 งวด = ยอดรวม BOQ (ตั้งราคาขายไปในตัว)
    const nextNo = (db.prepare("SELECT COALESCE(MAX(no),0) m FROM installments WHERE house_code=? AND side='customer'").get(d.house_code).m) + 1
    db.prepare("INSERT INTO installments (house_code,no,detail,days,due,amount,paid,status,side,category) VALUES (?,?,?,?,?,?,0,'รอเก็บ','customer','house')")
      .run(d.house_code, nextNo, `ตามประมาณราคา ${d.no}`, '', '', grand)
  } else {
    // ตั้งราคาขาย "ตัวบ้าน" ฝั่งลูกค้า = ยอดรวม BOQ
    db.prepare('UPDATE houses SET house_customer=? WHERE code=?').run(grand, d.house_code)
  }
  recomputeHouse(d.house_code)
  audit(req, 'ดัน BOQ เข้าราคาขาย', `${d.no} → ${h.name} (${grand.toLocaleString()})`)
  res.json({ ok: true, grand, house: withProfit(db.prepare('SELECT * FROM houses WHERE code=?').get(d.house_code)) })
})

// Cash Flow Forecast
const cfRow = (r) => r ? { ...r, months: jparse(r.months) || [], rows: jparse(r.rows) || [] } : r
api.get('/cashflows', auditView, (_req, res) => res.json(db.prepare('SELECT * FROM cashflows ORDER BY id DESC').all().map(cfRow)))
api.post('/cashflows', auditView, (req, res) => {
  const b = req.body || {}
  const seq = db.prepare('SELECT COUNT(*) c FROM cashflows').get().c + 1
  const no = `CF-${docYear()}-${String(seq).padStart(3, '0')}`
  const info = db.prepare('INSERT INTO cashflows (no,house_code,title,opening,months,rows,by,date,created) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(no, b.house_code || '', b.title || 'ประมาณการกระแสเงินสด', Number(b.opening) || 0, JSON.stringify(b.months || []), JSON.stringify(b.rows || []), req.user.name, todayTH(), todayTH())
  audit(req, 'สร้าง Cash Flow', no)
  res.status(201).json(cfRow(db.prepare('SELECT * FROM cashflows WHERE id=?').get(info.lastInsertRowid)))
})
api.put('/cashflows/:id', auditView, (req, res) => {
  const d = db.prepare('SELECT * FROM cashflows WHERE id=?').get(req.params.id)
  if (!d) return res.status(404).json({ error: 'ไม่พบ' })
  const b = req.body || {}
  db.prepare('UPDATE cashflows SET house_code=?, title=?, opening=?, months=?, rows=? WHERE id=?')
    .run(b.house_code ?? d.house_code, b.title ?? d.title, b.opening != null ? Number(b.opening) : d.opening, b.months ? JSON.stringify(b.months) : d.months, b.rows ? JSON.stringify(b.rows) : d.rows, d.id)
  res.json(cfRow(db.prepare('SELECT * FROM cashflows WHERE id=?').get(d.id)))
})
api.delete('/cashflows/:id', auditView, (req, res) => { db.prepare('DELETE FROM cashflows WHERE id=?').run(req.params.id); res.json({ ok: true }) })

// บัญชีรับ-จ่ายละเอียด (ledger) — ดึงข้อมูลจริงจากงวดงาน/รายจ่าย/PO อัตโนมัติ + รายการที่บันทึกเอง
api.get('/ledger', auditView, (req, res) => {
  const hc = req.query.house_code
  const manual = (hc ? db.prepare('SELECT * FROM ledger WHERE house_code=? ORDER BY id DESC').all(hc) : db.prepare('SELECT * FROM ledger ORDER BY id DESC').all())
    .map((r) => ({ ...r, auto: false, src: 'manual' }))
  // ถ้าไม่ต้องการรวมข้อมูลอัตโนมัติ (auto=0) ให้คืนเฉพาะที่บันทึกเอง
  if (req.query.auto === '0') return res.json(manual)
  const houseName = (code) => db.prepare('SELECT name FROM houses WHERE code=?').get(code)?.name || code
  const where = hc ? ' AND house_code=?' : ''
  const args = hc ? [hc] : []
  const auto = []
  let sid = -1
  // รายรับ: เงินที่เก็บจากลูกค้าจริง (งวดงานลูกค้าที่มียอดเก็บแล้ว)
  for (const it of db.prepare(`SELECT * FROM installments WHERE side='customer' AND COALESCE(paid,0)>0${where}`).all(...args))
    auto.push({ id: sid--, date: '', date_iso: '', house_code: it.house_code, kind: 'in', category: 'ค่างวดงาน', item: `เก็บเงินงวดที่ ${it.no}${it.detail ? ' — ' + it.detail : ''}`, amount: it.paid, budget: it.amount, method: '', party: houseName(it.house_code), note: '', auto: true, src: 'installment' })
  // รายจ่าย: เงินที่จ่ายช่างจริง (งวดงานช่างที่มียอดจ่ายแล้ว)
  for (const it of db.prepare(`SELECT * FROM installments WHERE side='contractor' AND COALESCE(paid,0)>0${where}`).all(...args))
    auto.push({ id: sid--, date: '', date_iso: '', house_code: it.house_code, kind: 'out', category: 'ค่าแรง', item: `จ่ายค่างวดช่างงวดที่ ${it.no}${it.detail ? ' — ' + it.detail : ''}`, amount: it.paid, budget: it.amount, method: '', party: it.contractor || houseName(it.house_code), note: '', auto: true, src: 'installment' })
  // รายจ่าย: วัสดุ/ค่าใช้จ่ายจริง (รวม PO ที่รับของแล้ว → ลง expenses อัตโนมัติ)
  for (const it of db.prepare(`SELECT * FROM expenses WHERE 1=1${where} ORDER BY id DESC`).all(...args))
    auto.push({ id: sid--, date: it.date || '', date_iso: it.date_iso || '', house_code: it.house_code, kind: 'out', category: it.cat || 'วัสดุ', item: it.item, amount: it.amount, budget: 0, method: '', party: it.vendor || '', note: '', auto: true, src: 'expense' })
  res.json([...auto, ...manual])
})
api.post('/ledger', auditView, (req, res) => {
  const b = req.body || {}
  if (!b.item) return res.status(400).json({ error: 'กรุณากรอกรายการ' })
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || '')) ? b.date : todayISO()
  const info = db.prepare('INSERT INTO ledger (date,house_code,kind,category,item,amount,budget,method,party,note,by,created,date_iso) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(thDateFromISO(iso), b.house_code || '', b.kind === 'in' ? 'in' : 'out', b.category || 'อื่นๆ', b.item, Number(b.amount) || 0, Number(b.budget) || 0, b.method || '', b.party || '', b.note || '', req.user.name, todayTH(), iso)
  res.status(201).json(db.prepare('SELECT * FROM ledger WHERE id=?').get(info.lastInsertRowid))
})
api.put('/ledger/:id', auditView, (req, res) => {
  const d = db.prepare('SELECT * FROM ledger WHERE id=?').get(req.params.id)
  if (!d) return res.status(404).json({ error: 'ไม่พบรายการ' })
  const b = req.body || {}
  const f = (k, num) => (b[k] != null && b[k] !== '' ? (num ? Number(b[k]) : b[k]) : d[k])
  db.prepare('UPDATE ledger SET date=?, house_code=?, kind=?, category=?, item=?, amount=?, budget=?, method=?, party=?, note=? WHERE id=?')
    .run(f('date'), f('house_code'), f('kind'), f('category'), f('item'), f('amount', true), f('budget', true), f('method'), f('party'), f('note'), d.id)
  res.json(db.prepare('SELECT * FROM ledger WHERE id=?').get(d.id))
})
api.delete('/ledger/:id', auditView, (req, res) => { db.prepare('DELETE FROM ledger WHERE id=?').run(req.params.id); res.json({ ok: true }) })

// ยอดจริงสำหรับ Cash Flow — ดึงเงินรับ/จ่ายจริงจากงวดงาน + รายจ่าย (รายจ่ายแยกตามเดือนไทยได้)
api.get('/cashflow-actuals', auditView, (req, res) => {
  const hc = req.query.house_code
  const where = hc ? ' AND house_code=?' : ''
  const args = hc ? [hc] : []
  const collected = db.prepare(`SELECT COALESCE(SUM(paid),0) a FROM installments WHERE side='customer' AND COALESCE(paid,0)>0${where}`).get(...args).a
  const paidContractor = db.prepare(`SELECT COALESCE(SUM(paid),0) a FROM installments WHERE side='contractor' AND COALESCE(paid,0)>0${where}`).get(...args).a
  // รายจ่าย (วัสดุ/PO) แยกตามเดือน โดยอ่านชื่อเดือนไทยจากวันที่ "5 ก.ค. 68"
  const materialByMonth = Array(12).fill(0)
  let materialTotal = 0
  for (const e of db.prepare(`SELECT date, amount FROM expenses WHERE 1=1${where}`).all(...args)) {
    const amt = Number(e.amount) || 0
    materialTotal += amt
    const mi = TH_MONTHS.findIndex((m) => (e.date || '').includes(m))
    if (mi >= 0) materialByMonth[mi] += amt
  }
  res.json({ collected, paidContractor, materialByMonth, materialTotal })
})

// ---------- ประเมินผลรายเดือน (PMS / KPI) — ระบบคำนวณคะแนนเอง ----------
function pmsGrade(t) {
  if (t >= 95) return { grade: 'A', bonus: 120 }
  if (t >= 90) return { grade: 'B', bonus: 100 }
  if (t >= 80) return { grade: 'C', bonus: 80 }
  if (t >= 75) return { grade: 'D', bonus: 50 } // ผ่านขั้นต่ำ
  return { grade: 'F', bonus: 0 } // ต่ำกว่า 75 = ปัดตก (ไม่ได้โบนัส)
}
// อัตราหักคะแนนวินัย (ต่อครั้ง/ต่อวัน) — มาสาย, ขาดงาน, ลา
const PMS_PENALTY = { late: 1, absent: 3, leave: 0.5, wo_overdue: 3 }
// คำนวณคะแนน: KPI = weight × min(actual/target,1) · Competency/Behavior = weight × rating/5
// แล้วหักคะแนนวินัย (ขาด/ลา/สาย) จากคะแนนรวม
function pmsCompute(b) {
  const kpi = (b.kpi || []).map((k) => {
    const w = Number(k.weight) || 0, tg = Number(k.target) || 0, ac = Number(k.actual) || 0
    const ratio = tg > 0 ? Math.min(ac / tg, 1) : 0
    return { ...k, score: Math.round(w * ratio * 100) / 100 }
  })
  const rate = (arr) => (arr || []).map((c) => {
    const w = Number(c.weight) || 0, r = Number(c.rating) || 0
    return { ...c, score: Math.round(w * (r / 5) * 100) / 100 }
  })
  const comp = rate(b.competency), beh = rate(b.behavior)
  const sum = (a) => Math.round(a.reduce((s, x) => s + x.score, 0) * 100) / 100
  const kpi_score = sum(kpi), comp_score = sum(comp), beh_score = sum(beh)
  const raw = Math.round((kpi_score + comp_score + beh_score) * 100) / 100
  const att = b.att || {}
  const absent = Number(att.absent) || 0, leave = Number(att.leave) || 0, late = Number(att.late) || 0, wo_overdue = Number(att.wo_overdue) || 0
  const penalty = Math.round((late * PMS_PENALTY.late + absent * PMS_PENALTY.absent + leave * PMS_PENALTY.leave + wo_overdue * PMS_PENALTY.wo_overdue) * 100) / 100
  const total = Math.max(0, Math.round((raw - penalty) * 100) / 100)
  const g = pmsGrade(total)
  return { kpi, comp, beh, kpi_score, comp_score, beh_score, raw, absent, leave, late, wo_overdue, penalty, total, grade: g.grade, bonus: g.bonus }
}
const pmsRow = (r) => r ? { ...r, kpi: jparse(r.kpi) || [], competency: jparse(r.competency) || [], behavior: jparse(r.behavior) || [], att: { absent: r.att_absent || 0, leave: r.att_leave || 0, late: r.att_late || 0, wo_overdue: r.att_wo_overdue || 0 } } : r
api.get('/pms', pmsOnly, (req, res) => {
  const ec = req.query.emp_code
  const rows = ec ? db.prepare('SELECT * FROM pms_reviews WHERE emp_code=? ORDER BY id DESC').all(ec) : db.prepare('SELECT * FROM pms_reviews ORDER BY id DESC').all()
  res.json(rows.map(pmsRow))
})
function savePms(id, b, req) {
  const c = pmsCompute(b)
  if (id) {
    db.prepare(`UPDATE pms_reviews SET emp_code=?,emp_name=?,position=?,template=?,month=?,evaluator=?,kpi=?,competency=?,behavior=?,kpi_score=?,comp_score=?,beh_score=?,att_absent=?,att_leave=?,att_late=?,att_wo_overdue=?,penalty=?,raw_total=?,total=?,grade=?,bonus_pct=?,strengths=?,improve=?,plan=? WHERE id=?`)
      .run(b.emp_code || '', b.emp_name || '', b.position || '', b.template || '', b.month || '', b.evaluator || req.user.name, JSON.stringify(c.kpi), JSON.stringify(c.comp), JSON.stringify(c.beh), c.kpi_score, c.comp_score, c.beh_score, c.absent, c.leave, c.late, c.wo_overdue, c.penalty, c.raw, c.total, c.grade, c.bonus, b.strengths || '', b.improve || '', b.plan || '', id)
    return db.prepare('SELECT * FROM pms_reviews WHERE id=?').get(id)
  }
  const seq = db.prepare('SELECT COUNT(*) c FROM pms_reviews').get().c + 1
  const no = `PMS-${docYear()}-${String(seq).padStart(3, '0')}`
  const info = db.prepare(`INSERT INTO pms_reviews (no,emp_code,emp_name,position,template,month,evaluator,kpi,competency,behavior,kpi_score,comp_score,beh_score,att_absent,att_leave,att_late,att_wo_overdue,penalty,raw_total,total,grade,bonus_pct,strengths,improve,plan,by,created)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(no, b.emp_code || '', b.emp_name || '', b.position || '', b.template || '', b.month || '', b.evaluator || req.user.name, JSON.stringify(c.kpi), JSON.stringify(c.comp), JSON.stringify(c.beh), c.kpi_score, c.comp_score, c.beh_score, c.absent, c.leave, c.late, c.wo_overdue, c.penalty, c.raw, c.total, c.grade, c.bonus, b.strengths || '', b.improve || '', b.plan || '', req.user.name, todayTH())
  return db.prepare('SELECT * FROM pms_reviews WHERE id=?').get(info.lastInsertRowid)
}
api.post('/pms', pmsOnly, (req, res) => {
  const b = req.body || {}
  if (!b.emp_name) return res.status(400).json({ error: 'กรุณาเลือกพนักงาน' })
  const row = savePms(null, b, req)
  audit(req, 'ประเมินผล PMS', `${row.no} · ${b.emp_name} = ${row.total} (${row.grade})`)
  res.status(201).json(pmsRow(row))
})
api.put('/pms/:id', pmsOnly, (req, res) => {
  const d = db.prepare('SELECT * FROM pms_reviews WHERE id=?').get(req.params.id)
  if (!d) return res.status(404).json({ error: 'ไม่พบใบประเมิน' })
  res.json(pmsRow(savePms(d.id, req.body || {}, req)))
})
api.delete('/pms/:id', pmsOnly, (req, res) => { db.prepare('DELETE FROM pms_reviews WHERE id=?').run(req.params.id); res.json({ ok: true }) })

// ---------- ใบสั่งงาน + ควบคุมคุณภาพ (Work Order & QC) ----------
const woRow = (r) => r ? { ...r, dod: jparse(r.dod) || {}, qc: jparse(r.qc) || [], submit_files: jparse(r.submit_files) || [] } : r
// เกณฑ์คะแนน KPI ใบสั่งงาน: ตรงเวลา/ก่อนกำหนด +10 · ส่งเร็ว +2/วัน (สูงสุด +20)
// ส่งช้า -5/วัน (ต่ำสุด -25) · งานด่วนไม่รับใน 5 นาที (escalate) -10 · ไม่มีกำหนด +5
function daysBetweenISO(aIso, bIso) {
  const a = new Date(String(aIso) + 'T00:00:00'), b = new Date(String(bIso) + 'T00:00:00')
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return Math.round((b - a) / 86400000)
}
function woKpiScore(wo, submitIso) {
  let pts = 0, days = null
  if (!wo.due_date) pts = 5
  else {
    const early = daysBetweenISO(submitIso, wo.due_date) // + = ส่งก่อนกำหนดกี่วัน
    days = early
    if (early == null) pts = 5
    else if (early >= 0) pts = Math.min(20, 10 + 2 * early)
    else pts = Math.max(-25, 5 * early) // early ติดลบ → -5/วัน
  }
  if (wo.urgent && (wo.esc_level > 0 || wo.status === 'เกินเวลา')) pts -= 10 // ด่วนแต่ไม่รับใน 5 นาที
  return { pts, days }
}
api.get('/work-orders', (_req, res) => res.json(db.prepare('SELECT * FROM work_orders ORDER BY id DESC').all().map(woRow)))
api.post('/work-orders', canWrite, (req, res) => {
  const b = req.body || {}
  if (!b.project && !b.scope) return res.status(400).json({ error: 'กรุณากรอกชื่องาน/ขอบเขตงาน' })
  const seq = db.prepare('SELECT COUNT(*) c FROM work_orders').get().c + 1
  const no = `WO-${docYear()}-${String(seq).padStart(3, '0')}`
  const urgent = b.urgent ? 1 : 0
  const priority = urgent ? 'ด่วน' : (b.priority || 'ปกติ')
  const deadlineMin = urgent ? (Number(b.deadline_min) || Number(getSetting('urgent_deadline_min', '5')) || 5) : 0
  const info = db.prepare(`INSERT INTO work_orders
    (no,priority,issued_date,due_date,due_time,line_group,reviewer,executor,executor_code,project,house_code,scope,dod,budget,status,ack,by,created,
     urgent,created_ts,deadline_min,esc_level,esc_code,esc_name,esc_ts,esc_log,source,seen)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?, ?,?,?,0,?,?,?,?,?,0)`)
    .run(no, priority, todayTH(), b.due_date || '', b.due_time || '', b.line_group || '',
      b.reviewer || req.user.name, b.executor || '', b.executor_code || '', b.project || '', b.house_code || '',
      b.scope || '', JSON.stringify(b.dod || {}), b.budget || '', 'สั่งงาน', req.user.name, todayTH(),
      urgent, nowTS(), deadlineMin, b.executor_code || '', b.executor || '', nowTS(), '[]', b.source || '')
  audit(req, urgent ? 'สั่งงานด่วน' : 'สร้างใบสั่งงาน', `${no} → ${b.executor || '-'}`)
  res.status(201).json(woRow(db.prepare('SELECT * FROM work_orders WHERE id=?').get(info.lastInsertRowid)))
})
api.put('/work-orders/:id', canWrite, (req, res) => {
  const d = db.prepare('SELECT * FROM work_orders WHERE id=?').get(req.params.id)
  if (!d) return res.status(404).json({ error: 'ไม่พบใบสั่งงาน' })
  const b = req.body || {}
  const f = (k) => (b[k] != null ? b[k] : d[k])
  db.prepare(`UPDATE work_orders SET priority=?,due_date=?,due_time=?,line_group=?,executor=?,executor_code=?,project=?,house_code=?,scope=?,dod=?,budget=?,
    exec_start=?,exec_end=?,exec_total=?,obstacle=?,fix_note=?,qc=?,acceptance=?,acceptance_note=?,score=?,commendation=?,lessons=?,status=? WHERE id=?`)
    .run(f('priority'), f('due_date'), f('due_time'), f('line_group'), f('executor'), f('executor_code'), f('project'), f('house_code'),
      f('scope'), b.dod != null ? JSON.stringify(b.dod) : d.dod, f('budget'),
      f('exec_start'), f('exec_end'), f('exec_total'), f('obstacle'), f('fix_note'),
      b.qc != null ? JSON.stringify(b.qc) : d.qc, f('acceptance'), f('acceptance_note'),
      b.score != null ? Number(b.score) : d.score, f('commendation'), f('lessons'), f('status'), d.id)
  audit(req, 'อัปเดตใบสั่งงาน', `${d.no} → ${f('status')}`)
  res.json(woRow(db.prepare('SELECT * FROM work_orders WHERE id=?').get(d.id)))
})
// ผู้รับผิดชอบ (หรือคนสำรองที่ถูกไล่ระดับมา) กดรับทราบ
api.post('/work-orders/:id/ack', (req, res) => {
  const d = db.prepare('SELECT * FROM work_orders WHERE id=?').get(req.params.id)
  if (!d) return res.status(404).json({ error: 'ไม่พบใบสั่งงาน' })
  // รับทราบได้: ผู้รับหลัก, คนที่ถูกไล่ระดับมาตอนนี้, หรือผู้จัดการ
  const allowed = !d.executor || d.executor === req.user.name || d.esc_name === req.user.name || isManager(req.user)
  if (!allowed) return res.status(403).json({ error: 'เฉพาะผู้รับผิดชอบเท่านั้นที่กดรับทราบได้' })
  db.prepare("UPDATE work_orders SET ack=1, ack_by=?, ack_date=?, ack_ts=?, seen=1, seen_ts=COALESCE(NULLIF(seen_ts,''),?), status=CASE WHEN status='สั่งงาน' THEN 'รับทราบ' ELSE status END WHERE id=?")
    .run(req.user.name, todayTH(), nowTS(), nowTS(), d.id)
  audit(req, 'รับทราบใบสั่งงาน', d.no)
  res.json(woRow(db.prepare('SELECT * FROM work_orders WHERE id=?').get(d.id)))
})
// ผู้รับงาน "ส่งงาน" พร้อมแนบไฟล์/ลิงก์เป็นหลักฐาน → รอผู้สั่งกดรับ
api.post('/work-orders/:id/submit', (req, res) => {
  const d = db.prepare('SELECT * FROM work_orders WHERE id=?').get(req.params.id)
  if (!d) return res.status(404).json({ error: 'ไม่พบใบสั่งงาน' })
  const allowed = !d.executor || d.executor === req.user.name || d.esc_name === req.user.name || isManager(req.user)
  if (!allowed) return res.status(403).json({ error: 'เฉพาะผู้รับผิดชอบงานเท่านั้นที่ส่งงานได้' })
  const b = req.body || {}
  const files = Array.isArray(b.files) ? b.files.filter((f) => f && f.id).map((f) => ({ id: f.id, name: String(f.name || 'ไฟล์') })) : []
  const link = String(b.link || '').trim()
  if (!files.length && !link) return res.status(400).json({ error: 'ต้องแนบไฟล์งานอย่างน้อย 1 ไฟล์ หรือใส่ลิงก์งาน เพื่อยืนยันว่าส่งงานแล้ว' })
  db.prepare("UPDATE work_orders SET status='ส่งงาน', submit_ts=?, submit_date=?, submit_link=?, submit_files=?, submit_note=? WHERE id=?")
    .run(nowTS(), todayISO(), link, JSON.stringify(files), String(b.note || ''), d.id)
  audit(req, 'ส่งงาน (ใบสั่งงาน)', `${d.no} ${files.length ? files.length + ' ไฟล์' : ''}${link ? ' + ลิงก์' : ''}`)
  res.json(woRow(db.prepare('SELECT * FROM work_orders WHERE id=?').get(d.id)))
})
// ผู้สั่งงาน "กดรับงาน" → ยืนยันรับงาน + คิดคะแนน KPI ตามตรงเวลา/ล่าช้า
api.post('/work-orders/:id/accept', canWrite, (req, res) => {
  const d = db.prepare('SELECT * FROM work_orders WHERE id=?').get(req.params.id)
  if (!d) return res.status(404).json({ error: 'ไม่พบใบสั่งงาน' })
  const allowed = !d.reviewer || d.reviewer === req.user.name || d.by === req.user.name || isManager(req.user)
  if (!allowed) return res.status(403).json({ error: 'เฉพาะผู้สั่งงาน (หรือผู้จัดการ) เท่านั้นที่กดรับงานได้' })
  if (d.status !== 'ส่งงาน' && !req.body?.force) return res.status(409).json({ error: 'ยังไม่มีการส่งงาน — รอผู้รับงานกด “ส่งงาน” ก่อน' })
  const submitIso = d.submit_date || todayISO()
  const { pts, days } = woKpiScore(d, submitIso)
  db.prepare("UPDATE work_orders SET status='เสร็จ', acceptance='รับงานแล้ว', acceptance_note=?, accept_ts=?, accept_by=?, score=?, kpi_days=? WHERE id=?")
    .run(String(req.body?.note || ''), nowTS(), req.user.name, pts, days == null ? 0 : days, d.id)
  audit(req, 'รับงาน (ใบสั่งงาน)', `${d.no} · ${d.executor || '-'} KPI ${pts >= 0 ? '+' : ''}${pts}`)
  res.json({ ...woRow(db.prepare('SELECT * FROM work_orders WHERE id=?').get(d.id)), kpi_points: pts, kpi_days: days })
})
// ผู้รับ "เปิดดู" ใบสั่งงาน → บันทึกว่าเห็นแล้วเมื่อไหร่ (read receipt)
api.post('/work-orders/:id/seen', (req, res) => {
  const d = db.prepare('SELECT * FROM work_orders WHERE id=?').get(req.params.id)
  if (!d) return res.status(404).json({ error: 'ไม่พบใบสั่งงาน' })
  if (!d.seen) db.prepare('UPDATE work_orders SET seen=1, seen_ts=? WHERE id=?').run(nowTS(), d.id)
  res.json({ ok: true })
})
// ไล่หา "คนสำรอง" ตามสายที่ตั้งไว้ล่วงหน้า: ผู้รับ → คนสำรองของผู้รับ → ... → ตัวจบสาย (ตั้งค่า)
function backupChain(startCode) {
  const chain = []
  const seen = new Set()
  let code = startCode
  let i = 0
  while (code && !seen.has(code) && chain.length < 6) {
    seen.add(code)
    const e = db.prepare('SELECT code,name,backup_code FROM employees WHERE code=?').get(code)
    if (!e) break
    if (i > 0) chain.push({ code: e.code, name: e.name }) // ข้ามคนแรก (ผู้รับหลัก) — เก็บเฉพาะคนสำรองถัดไป
    code = e.backup_code
    i++
  }
  // ตัวจบสาย (ผู้จัดการ/CEO) กันงานด่วนตกหล่น
  const finalCode = getSetting('urgent_fallback_code', '')
  if (finalCode && !seen.has(finalCode)) {
    const f = db.prepare('SELECT code,name FROM employees WHERE code=?').get(finalCode)
    if (f) chain.push({ code: f.code, name: f.name })
  }
  return chain
}
// เครื่องยนต์ไล่ระดับงานด่วน: ทุก ๆ ช่วง ถ้ายังไม่รับทราบ → ไล่ไปคนสำรองถัดไป; ครบกำหนด → เกินเวลา
function escalateUrgent() {
  try {
    const stepMin = Number(getSetting('urgent_step_min', '2')) || 2
    const opens = db.prepare("SELECT * FROM work_orders WHERE urgent=1 AND ack=0 AND status NOT IN ('เกินเวลา','ยกเลิก')").all()
    for (const w of opens) {
      const elapsed = minutesSince(w.created_ts)
      if (elapsed == null) continue
      const deadline = w.deadline_min || 5
      // ครบกำหนด → เกินเวลา + โยนไปตัวจบสาย + เตือน CEO
      if (elapsed >= deadline) {
        if (w.status !== 'เกินเวลา') {
          const chain = backupChain(w.executor_code)
          const last = chain[chain.length - 1]
          const log = safeJson(w.esc_log)
          log.push({ at: nowTS(), to: last ? last.name : (w.esc_name || w.executor), reason: 'เกินกำหนด' })
          db.prepare("UPDATE work_orders SET status='เกินเวลา', esc_code=?, esc_name=?, esc_ts=?, esc_log=? WHERE id=?")
            .run(last ? last.code : w.esc_code, last ? last.name : w.esc_name, nowTS(), JSON.stringify(log), w.id)
        }
        continue
      }
      // ถึงเวลาไล่ขั้นถัดไปหรือยัง (นับจากครั้งไล่ล่าสุด)
      const level = w.esc_level || 0
      const sinceEsc = minutesSince(w.esc_ts) ?? elapsed
      if (sinceEsc >= stepMin) {
        const chain = backupChain(w.executor_code)
        const next = chain[level] // level 0 → คนสำรองคนแรก, ...
        if (next) {
          const log = safeJson(w.esc_log)
          log.push({ at: nowTS(), to: next.name, reason: 'ยังไม่รับทราบ' })
          db.prepare('UPDATE work_orders SET esc_level=?, esc_code=?, esc_name=?, esc_ts=?, esc_log=? WHERE id=?')
            .run(level + 1, next.code, next.name, nowTS(), JSON.stringify(log), w.id)
        }
      }
    }
  } catch (e) { console.error('escalateUrgent failed:', e.message) }
}
function safeJson(s) { try { return JSON.parse(s || '[]') } catch { return [] } }
setInterval(escalateUrgent, 20 * 1000) // ตรวจทุก 20 วินาที
// ฟีดสถานะงานด่วนสำหรับ CEO — เวลา ส่ง/เห็น/รับทราบ + สายไล่ระดับ + นับถอยหลัง
api.get('/work-orders/ceo-feed', requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM work_orders WHERE urgent=1 ORDER BY id DESC LIMIT 50").all().map((w) => {
    const seenMin = w.seen_ts ? minutesSince(w.created_ts) : null
    return {
      ...woRow(w),
      seen_after_min: w.seen_ts ? round1((tsToMs(w.seen_ts) - tsToMs(w.created_ts)) / 60000) : null,
      ack_after_min: w.ack_ts ? round1((tsToMs(w.ack_ts) - tsToMs(w.created_ts)) / 60000) : null,
      elapsed_min: round1(minutesSince(w.created_ts) ?? 0),
      remaining_min: round1(Math.max(0, (w.deadline_min || 5) - (minutesSince(w.created_ts) ?? 0))),
      esc_log: safeJson(w.esc_log),
    }
  })
  res.json({ now: nowTS(), rows })
})
function round1(n) { return Math.round(n * 10) / 10 }
// ตั้งค่างานด่วน: กำหนดรับ (นาที), ช่วงไล่ระดับ (นาที), ตัวจบสาย (รหัสพนักงาน)
api.get('/settings/urgent', requireAuth, (_req, res) => res.json({
  step_min: Number(getSetting('urgent_step_min', '2')) || 2,
  deadline_min: Number(getSetting('urgent_deadline_min', '5')) || 5,
  fallback_code: getSetting('urgent_fallback_code', ''),
}))
api.put('/settings/urgent', adminOnly, (req, res) => {
  const b = req.body || {}
  if (b.step_min != null) setSetting('urgent_step_min', String(Number(b.step_min) || 2))
  if (b.deadline_min != null) setSetting('urgent_deadline_min', String(Number(b.deadline_min) || 5))
  if (b.fallback_code != null) setSetting('urgent_fallback_code', String(b.fallback_code))
  res.json({ ok: true })
})
api.delete('/work-orders/:id', canWrite, (req, res) => { db.prepare('DELETE FROM work_orders WHERE id=?').run(req.params.id); res.json({ ok: true }) })
// สถิติใบสั่งงานของผู้รับงาน (สำหรับผูก KPI / หักคะแนนเมื่อเกินกำหนด)
api.get('/work-orders/executor-stats', auditView, (req, res) => {
  const name = req.query.executor || ''
  const todayISO = new Date().toISOString().slice(0, 10)
  const rows = db.prepare('SELECT due_date,status,score,kpi_days,submit_date FROM work_orders WHERE executor=?').all(name)
  const done = (s) => s === 'เสร็จ' || s === 'ตรวจผ่าน'
  const total = rows.length
  const overdue = rows.filter((r) => r.due_date && r.due_date < todayISO && !done(r.status)).length
  const withDue = rows.filter((r) => r.due_date).length
  const onTime = withDue - rows.filter((r) => r.due_date && r.due_date < todayISO && !done(r.status)).length
  // คะแนน KPI สะสมจากใบสั่งงานที่ผู้สั่งรับแล้ว
  const scored = rows.filter((r) => r.score != null)
  const kpiPoints = scored.reduce((s, r) => s + (r.score || 0), 0)
  const earlyCount = scored.filter((r) => (r.kpi_days || 0) > 0).length
  const lateCount = scored.filter((r) => (r.kpi_days || 0) < 0).length
  const ontimeCount = scored.filter((r) => (r.kpi_days || 0) === 0).length
  res.json({ executor: name, total, overdue, onTimeRate: withDue ? Math.round((onTime / withDue) * 100) : 100, kpiPoints, scoredCount: scored.length, earlyCount, lateCount, ontimeCount })
})
api.post('/houses/:code/contractors', canWrite, (req, res) => {
  const b = req.body || {}
  if (!b.name) return res.status(400).json({ error: 'กรุณากรอกชื่อช่าง/ผู้รับเหมา' })
  const info = db.prepare('INSERT INTO contractors (house_code,name,role,type,advance,deducted,paid,note) VALUES (?,?,?,?,?,?,?,?)')
    .run(req.params.code, b.name, b.role || '', b.type || 'เหมารวม', Number(b.advance) || 0, Number(b.deducted) || 0, Number(b.paid) || 0, b.note || '')
  res.status(201).json(db.prepare('SELECT * FROM contractors WHERE id=?').get(info.lastInsertRowid))
})
api.delete('/contractors/:id', canWrite, (req, res) => {
  db.prepare('DELETE FROM contractors WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})
api.post('/customers/:id/contacts', canWrite, (req, res) => {
  const { channel, note } = req.body || {}
  if (!note) return res.status(400).json({ error: 'กรุณากรอกรายละเอียด' })
  db.prepare('INSERT INTO customer_contacts (customer_id,date,channel,note,by) VALUES (?,?,?,?,?)')
    .run(req.params.id, todayTH(), channel || 'โทรศัพท์', note, req.user.name)
  res.status(201).json(db.prepare('SELECT * FROM customer_contacts WHERE customer_id=? ORDER BY id DESC').all(req.params.id))
})

// ---------- Gantt tasks ----------
api.get('/tasks', (_req, res) => res.json(db.prepare('SELECT * FROM tasks ORDER BY start, id').all()))
api.post('/tasks', canWrite, (req, res) => {
  const { house_code, name, start, end, progress, status, weight } = req.body || {}
  if (!name || !start || !end) return res.status(400).json({ error: 'กรุณากรอกชื่องาน วันเริ่ม และวันจบ' })
  const info = db
    .prepare('INSERT INTO tasks (house_code,name,start,end,progress,status,weight) VALUES (?,?,?,?,?,?,?)')
    .run(house_code || '', name, start, end, Number(progress) || 0, status || 'วางแผน', Number(weight) || 0)
  res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id=?').get(info.lastInsertRowid))
})
api.put('/tasks/:id', canWrite, (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id)
  if (!t) return res.status(404).json({ error: 'ไม่พบงาน' })
  const { progress, status, weight } = req.body || {}
  db.prepare('UPDATE tasks SET progress=?, status=?, weight=? WHERE id=?')
    .run(progress != null ? Number(progress) : t.progress, status ?? t.status, weight != null ? Number(weight) : (t.weight || 0), t.id)
  res.json(db.prepare('SELECT * FROM tasks WHERE id=?').get(t.id))
})

// ---------- Sales documents (quote / invoice / receipt) ----------
api.get('/sales-docs', (_req, res) => res.json(db.prepare('SELECT * FROM sales_docs ORDER BY id DESC').all()))
api.post('/sales-docs', canWrite, (req, res) => {
  const { type, customer, items, house_code } = req.body || {}
  const kind = ['quote', 'invoice', 'receipt'].includes(type) ? type : 'quote'
  const list = Array.isArray(items) ? items : []
  if (!customer || list.length === 0) return res.status(400).json({ error: 'กรุณากรอกลูกค้าและรายการอย่างน้อย 1 แถว' })
  const subtotal = list.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0)
  const vat = Math.round(subtotal * 0.07)
  const prefix = { quote: 'QT', invoice: 'INV', receipt: 'RC' }[kind]
  const seq = db.prepare('SELECT COUNT(*) c FROM sales_docs WHERE type=?').get(kind).c + 1
  const no = `${prefix}-${docYear()}-${String(seq).padStart(4, '0')}`
  const info = db
    .prepare('INSERT INTO sales_docs (type,no,customer,date,items,subtotal,vat,total,status,house_code) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(kind, no, customer, todayTH(), JSON.stringify(list), subtotal, vat, subtotal + vat, kind === 'receipt' ? 'ชำระแล้ว' : 'รออนุมัติ', house_code || '')
  res.status(201).json(db.prepare('SELECT * FROM sales_docs WHERE id=?').get(info.lastInsertRowid))
})
// standard customer payment milestones (% of contract) used when signing a quote
const SIGN_MILESTONES = [
  { detail: 'งวดเซ็นสัญญา / มัดจำ', pct: 10 },
  { detail: 'งวดฐานราก / ตอกเสาเข็ม', pct: 15 },
  { detail: 'งวดงานโครงสร้าง', pct: 20 },
  { detail: 'งวดก่อผนัง / มุงหลังคา', pct: 20 },
  { detail: 'งวดงานระบบ / ฝ้า-ฝา', pct: 15 },
  { detail: 'งวดเก็บงานสี / สุขภัณฑ์', pct: 15 },
  { detail: 'งวดส่งมอบบ้าน', pct: 5 },
]
// เซ็นสัญญา: เปลี่ยนใบเสนอราคาเป็นโครงการบ้าน + สร้างงวดงานลูกค้าตามแผนมาตรฐาน
api.post('/sales-docs/:id/convert', canWrite, (req, res) => {
  const doc = db.prepare('SELECT * FROM sales_docs WHERE id=?').get(req.params.id)
  if (!doc) return res.status(404).json({ error: 'ไม่พบเอกสาร' })
  // if already linked to an existing house, don't duplicate
  if (doc.house_code) {
    const existing = db.prepare('SELECT * FROM houses WHERE code=?').get(doc.house_code)
    if (existing) return res.status(400).json({ error: `เอกสารนี้ผูกกับบ้าน "${existing.name}" อยู่แล้ว` })
  }
  const total = doc.total || 0
  const name = String(req.body?.name || '').trim() || `บ้าน ${doc.customer}`
  const project = String(req.body?.project || '').trim() || ''
  const code = 'NEW-' + String(Date.now()).slice(-4)
  db.prepare('INSERT INTO houses (code,name,project,customer,value,pct,collected,remain,status) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(code, name, project, doc.customer, total, 0, 0, total, 'เพิ่งเริ่ม')
  // build the customer installment plan (last งวด absorbs rounding)
  const ins = db.prepare('INSERT INTO installments (house_code,no,detail,days,due,ontime,amount,status,side,category,paid) VALUES (?,?,?,?,?,?,?,?,?,?,0)')
  let acc = 0
  SIGN_MILESTONES.forEach((m, i) => {
    const last = i === SIGN_MILESTONES.length - 1
    const amt = last ? total - acc : Math.round((total * m.pct) / 100)
    acc += amt
    ins.run(code, i + 1, m.detail, '-', 'กำหนดใหม่', '-', amt, 'รอเก็บเงิน', 'customer', 'house')
  })
  recomputeHouse(code)
  db.prepare("UPDATE sales_docs SET status='เซ็นสัญญาแล้ว', house_code=? WHERE id=?").run(code, doc.id)
  audit(req, 'เซ็นสัญญา/สร้างโครงการ', `${doc.no} → ${name}`)
  res.json({ ok: true, house: withProfit(db.prepare('SELECT * FROM houses WHERE code=?').get(code)) })
})


// เก็บไฟล์แนบลงดิสก์จริง (แทน base64 ในฐานข้อมูล) — รองรับไฟล์ใหญ่/จำนวนมาก
const uploadsDir = join(__dirname, 'data', 'files')
mkdirSync(uploadsDir, { recursive: true })
const FILE_COLS = 'id,house_code,name,mime,size,category,uploaded,uploader'
api.get('/files', (req, res) => {
  const rows = req.query.house
    ? db.prepare(`SELECT ${FILE_COLS} FROM files WHERE house_code=? ORDER BY id DESC`).all(req.query.house)
    : db.prepare(`SELECT ${FILE_COLS} FROM files ORDER BY id DESC`).all()
  res.json(rows)
})
// อัปโหลดไฟล์ — รองรับทั้งแบบ raw (ใหม่ · body=ไฟล์, meta ใน query)
// และแบบ JSON+base64 (เดิม) เผื่อหน้าเว็บกับเซิร์ฟเวอร์คนละเวอร์ชัน
api.post('/files', canWrite, express.raw({ type: 'application/octet-stream', limit: '210mb' }), (req, res) => {
  const q = req.query || {}
  let name, mime, house, category, buf
  if (Buffer.isBuffer(req.body)) {
    name = q.name ? String(q.name) : ''
    mime = String(q.mime || 'application/octet-stream')
    house = String(q.house || ''); category = String(q.category || '')
    buf = req.body
  } else {
    const b = req.body || {} // รูปแบบเดิม (JSON + base64)
    name = b.name || ''
    mime = b.mime || 'application/octet-stream'
    house = b.house_code || String(q.house || ''); category = b.category || String(q.category || '')
    buf = b.data ? Buffer.from(String(b.data).replace(/^data:[^;]+;base64,/, ''), 'base64') : null
  }
  if (!name || !buf || !buf.length) return res.status(400).json({ error: 'ไฟล์ไม่ถูกต้อง' })
  const info = db
    .prepare(`INSERT INTO files (house_code,name,mime,size,category,uploaded,uploader) VALUES (?,?,?,?,?,?,?)`)
    .run(house, name, mime, buf.length, category, todayTH(), req.user.name)
  const id = info.lastInsertRowid
  writeFileSync(join(uploadsDir, String(id)), buf)
  db.prepare('UPDATE files SET path=? WHERE id=?').run(String(id), id)
  res.status(201).json(db.prepare(`SELECT ${FILE_COLS} FROM files WHERE id=?`).get(id))
})
function fileBuffer(f) {
  if (f.path) { const p = join(uploadsDir, f.path); if (existsSync(p)) return readFileSync(p) }
  if (f.data) return Buffer.from(String(f.data).replace(/^data:[^;]+;base64,/, ''), 'base64') // เดิม (base64 ในฐานข้อมูล)
  return null
}
function sendStored(req, res, disposition) {
  const f = db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id)
  if (!f) return res.status(404).json({ error: 'ไม่พบไฟล์' })
  const buf = fileBuffer(f)
  if (!buf) return res.status(404).json({ error: 'ไม่พบไฟล์บนดิสก์' })
  res.setHeader('Content-Type', f.mime || 'application/octet-stream')
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(f.name)}`)
  res.send(buf)
}
api.get('/files/:id/view', (req, res) => sendStored(req, res, 'inline'))      // เปิดดูในเบราว์เซอร์ทันที
api.get('/files/:id/download', (req, res) => sendStored(req, res, 'attachment')) // ดาวน์โหลด
api.delete('/files/:id', canWrite, (req, res) => {
  const f = db.prepare('SELECT path FROM files WHERE id=?').get(req.params.id)
  if (f?.path) { try { unlinkSync(join(uploadsDir, f.path)) } catch { /* ignore */ } }
  db.prepare('DELETE FROM files WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

// ---------- notifications (computed) ----------
api.get('/notifications', (req, res) => {
  const mgr = isManager(req.user)
  const out = []
  const todayISO = new Date().toISOString().slice(0, 10)
  const woDone = (s) => s === 'เสร็จ' || s === 'ตรวจผ่าน'
  // ใบสั่งงานที่สั่งให้ฉัน (หรือถูกไล่ระดับมาถึงฉัน) แต่ยังไม่กดรับทราบ → เด้งเตือนให้รับทราบ
  for (const r of db.prepare("SELECT * FROM work_orders WHERE ack=0 AND status NOT IN ('ยกเลิก') AND (executor=? OR esc_name=?)").all(req.user.name, req.user.name)) {
    if (r.urgent) {
      const remain = Math.max(0, (r.deadline_min || 5) - (minutesSince(r.created_ts) ?? 0))
      const overdue = r.status === 'เกินเวลา'
      out.push({ kind: 'wo-urgent', icon: 'danger', title: `🔴 งานด่วน ${r.no} — รับทราบด่วน!`, sub: `${r.project || r.scope || ''} · ${overdue ? 'เกินกำหนดแล้ว' : 'เหลือ ' + round1(remain) + ' นาที'} · สั่งโดย ${r.reviewer}`, page: 'workorders' })
    } else {
      out.push({ kind: 'wo', icon: 'warn', title: `ใบสั่งงานใหม่ ${r.no} — กดรับทราบ`, sub: `${r.project || r.scope || ''} · สั่งโดย ${r.reviewer}${r.due_date ? ' · ครบ ' + r.due_date : ''}`, page: 'workorders' })
    }
  }
  // ผู้สั่งงาน (reviewer) — เตือนความคืบหน้าของใบที่ตัวเองสั่ง
  for (const r of db.prepare("SELECT * FROM work_orders WHERE reviewer=?").all(req.user.name)) {
    // งานด่วนยังไม่รับ — เตือนผู้สั่ง (CEO) พร้อมสถานะไล่ระดับ
    if (r.urgent && !r.ack) {
      if (r.status === 'เกินเวลา')
        out.push({ kind: 'wo-urgent-miss', icon: 'danger', title: `⛔ งานด่วน ${r.no} เกินกำหนด ยังไม่มีใครรับ`, sub: `${r.project || r.scope || ''} · ตอนนี้อยู่ที่ ${r.esc_name || r.executor || '-'}`, page: 'workorders' })
      else if ((r.esc_level || 0) > 0)
        out.push({ kind: 'wo-urgent-esc', icon: 'warn', title: `⚠️ งานด่วน ${r.no} ยังไม่รับ — ไล่ไปที่ ${r.esc_name || '-'}`, sub: `${r.project || r.scope || ''} · ${r.seen_ts ? 'เห็นแล้ว' : 'ยังไม่มีใครเปิด'}`, page: 'workorders' })
    }
    // ผู้รับงานกด "รับทราบ" แล้ว (กำลังจะเริ่มงาน)
    if (r.ack && r.status === 'รับทราบ')
      out.push({ kind: 'wo-ack', icon: 'info', title: `${r.ack_by || r.executor || 'ผู้รับงาน'} รับทราบใบสั่งงาน ${r.no} แล้ว`, sub: `${r.project || r.scope || ''}${r.ack_date ? ' · ' + r.ack_date : ''}`, page: 'workorders' })
    // ผู้รับงานทำเสร็จ ส่งงานแล้ว → ผู้สั่งต้องตรวจรับ
    if (r.status === 'เสร็จ')
      out.push({ kind: 'wo-submit', icon: 'warn', title: `ใบสั่งงาน ${r.no} ส่งงานแล้ว — รอตรวจรับ`, sub: `${r.executor || ''} · ${r.project || r.scope || ''}`, page: 'workorders' })
  }
  // เลยกำหนดส่งงาน (ยังไม่เสร็จ/ยังไม่ตรวจผ่าน) → เตือนทั้งผู้รับงานและผู้สั่งงาน
  for (const r of db.prepare("SELECT * FROM work_orders WHERE due_date!='' AND due_date IS NOT NULL").all()) {
    if (r.due_date < todayISO && !woDone(r.status) && (r.executor === req.user.name || r.reviewer === req.user.name))
      out.push({ kind: 'wo-overdue', icon: 'danger', title: `ใบสั่งงาน ${r.no} เลยกำหนดส่งงาน`, sub: `${r.project || r.scope || ''} · ครบ ${r.due_date} · ${r.executor || '-'}`, page: 'workorders' })
  }
  for (const r of db.prepare("SELECT * FROM installments WHERE status='เลยกำหนด'").all()) {
    out.push({ kind: 'overdue', icon: 'danger', title: `งวด ${r.no} เลยกำหนด`, sub: `${r.house_code} · ฿${r.amount.toLocaleString('en-US')}`, page: 'installments' })
  }
  for (const r of db.prepare("SELECT * FROM installments WHERE status='รอเก็บเงิน'").all()) {
    out.push({ kind: 'collect', icon: 'warn', title: `รอเก็บงวด ${r.no}`, sub: `${r.house_code} · ครบ ${r.due}`, page: 'installments' })
  }
  // PO เครดิตใกล้/เลยครบกำหนดชำระ — เตือนคนที่เห็นงานเงิน (บัญชี/ผู้จัดการ/ผู้ดูแล)
  if (canSeeSalary(req.user) || mgr) {
    const today = new Date().toISOString().slice(0, 10)
    const soon = new Date(); soon.setDate(soon.getDate() + 7)
    const soonIso = soon.toISOString().slice(0, 10)
    for (const r of db.prepare("SELECT * FROM purchase_orders WHERE payment_type='credit' AND status!='ปิดงาน' AND due_iso!='' AND due_iso IS NOT NULL").all()) {
      if (r.due_iso < today) out.push({ kind: 'po-due', icon: 'danger', title: `PO ${r.no} เลยกำหนดชำระ`, sub: `${r.vendor} · ฿${r.amount.toLocaleString('en-US')} · ครบ ${r.due_date}`, page: 'procurement' })
      else if (r.due_iso <= soonIso) out.push({ kind: 'po-due', icon: 'warn', title: `PO ${r.no} ใกล้ครบกำหนดชำระ`, sub: `${r.vendor} · ฿${r.amount.toLocaleString('en-US')} · ครบ ${r.due_date}`, page: 'procurement' })
    }
  }
  // approval items go to managers (ตำแหน่งผู้จัดการ) only
  if (mgr) {
    for (const r of db.prepare("SELECT * FROM purchase_requests WHERE status='รออนุมัติ'").all()) {
      out.push({ kind: 'pr', icon: 'warn', title: `PR ${r.no} รออนุมัติ`, sub: `${r.item} · ฿${r.amount.toLocaleString('en-US')} · โดย ${r.by}`, page: 'procurement' })
    }
    for (const r of db.prepare("SELECT * FROM leaves WHERE status='รออนุมัติ'").all()) {
      out.push({ kind: 'leave', icon: 'warn', title: `ใบลา (${r.type}) รออนุมัติ`, sub: `${r.emp_name} · ${r.start_date} · ${r.days} วัน`, page: 'hr' })
    }
    for (const r of db.prepare("SELECT * FROM time_adjustments WHERE status='รออนุมัติ'").all()) {
      out.push({ kind: 'time', icon: 'warn', title: `ขอปรับปรุงเวลา (${r.kind}) รออนุมัติ`, sub: `${r.emp_name} · ${r.date} ${r.time}`, page: 'hr' })
    }
    for (const r of db.prepare("SELECT * FROM ot WHERE status='รออนุมัติ'").all()) {
      out.push({ kind: 'ot', icon: 'info', title: `OT รออนุมัติ`, sub: `${r.name} · ${r.date}`, page: 'hr' })
    }
    // คำขอรีเซ็ต PIN (ลืม PIN) — เฉพาะแอดมิน
    if (req.user.role === 'admin') {
      for (const r of db.prepare("SELECT * FROM pin_reset_requests WHERE status='pending' ORDER BY id DESC").all())
        out.push({ kind: 'pinreset', icon: 'warn', title: `คำขอรีเซ็ต PIN — ${r.name || r.username}`, sub: `ผู้ใช้ ${r.username} · ยืนยันตัวตนแล้วรีเซ็ตที่หน้าผู้ใช้งาน`, page: 'users' })
    }
    // ความปลอดภัย: มีคนเข้างานวันนี้ แต่ยังไม่ได้บันทึกงานความปลอดภัย (Toolbox Talk/PPE) วันนี้
    const todayTHStr = todayTH()
    const presentCnt = db.prepare("SELECT COUNT(*) c FROM attendance WHERE date=? AND COALESCE(check_in,'')!=''").get(todayTHStr).c
    const safToday = db.prepare('SELECT COUNT(*) c FROM safety_records WHERE date=?').get(todayTHStr).c
    if (presentCnt > 0 && safToday === 0)
      out.push({ kind: 'safety', icon: 'warn', title: 'วันนี้ยังไม่ได้บันทึกงานความปลอดภัย', sub: `มีผู้เข้างาน ${presentCnt} คน — ควรทำ Toolbox Talk / ตรวจ PPE`, page: 'safety' })
    // JHA ที่ประเมินความเสี่ยง "สูง" (เตือนให้ทบทวนมาตรการ)
    for (const r of db.prepare("SELECT no,title,data FROM safety_records WHERE kind='jha' ORDER BY id DESC LIMIT 30").all()) {
      const steps = jparse(r.data)?.steps || []
      if (steps.some((s) => s.risk === 'สูง'))
        out.push({ kind: 'safety-risk', icon: 'danger', title: `JHA ${r.no} มีงานเสี่ยงสูง`, sub: `${r.title || ''} — ตรวจสอบมาตรการป้องกัน`, page: 'safety' })
    }
    // ทะเบียนเอกสาร: รออนุมัติ + ใบอนุญาต/เอกสารใกล้หมดอายุ (ภายใน 30 วัน)
    for (const r of db.prepare("SELECT no,title,status FROM doc_register WHERE status='รออนุมัติ'").all())
      out.push({ kind: 'doc', icon: 'warn', title: `เอกสาร ${r.no} รออนุมัติ`, sub: r.title || '', page: 'docreg' })
    const soon30 = new Date(); soon30.setDate(soon30.getDate() + 30)
    const soon30Iso = soon30.toISOString().slice(0, 10)
    for (const r of db.prepare("SELECT no,title,expiry FROM doc_register WHERE COALESCE(expiry,'')!='' AND status!='ยกเลิก'").all()) {
      if (r.expiry < todayISO) out.push({ kind: 'doc-exp', icon: 'danger', title: `เอกสาร ${r.no} หมดอายุแล้ว`, sub: `${r.title || ''} · หมดอายุ ${r.expiry}`, page: 'docreg' })
      else if (r.expiry <= soon30Iso) out.push({ kind: 'doc-exp', icon: 'warn', title: `เอกสาร ${r.no} ใกล้หมดอายุ`, sub: `${r.title || ''} · หมดอายุ ${r.expiry}`, page: 'docreg' })
    }
  }
  res.json(out)
})

// ---------- reports (aggregates for charts) ----------
api.get('/reports', financeOnly, (_req, res) => {
  const houses = db.prepare('SELECT * FROM houses').all()
  const expenses = db.prepare('SELECT * FROM expenses').all()
  // per-project profit (collected - expenses by project)
  const byProject = {}
  for (const h of houses) {
    byProject[h.project] = byProject[h.project] || { project: h.project, value: 0, collected: 0, expense: 0 }
    byProject[h.project].value += h.value
    byProject[h.project].collected += h.collected
  }
  const houseProj = Object.fromEntries(houses.map((h) => [h.code, h.project]))
  for (const e of expenses) {
    const p = houseProj[e.house_code]
    if (p && byProject[p]) byProject[p].expense += e.amount
  }
  // expense by category
  const byCat = {}
  for (const e of expenses) byCat[e.cat] = (byCat[e.cat] || 0) + e.amount
  // material expense per house (actual)
  const matByHouse = {}
  for (const e of expenses) matByHouse[e.house_code] = (matByHouse[e.house_code] || 0) + e.amount
  // ใบจ่ายเงิน/หัก ณ ที่จ่าย ที่ผูกกับบ้าน (ค่าเซ็นแบบ/ธรรมเนียม/ค่าป้าย ฯลฯ) — ต้นทุนจริง = ยอดก่อนหัก (gross)
  const payByHouse = {}
  for (const p of db.prepare('SELECT house_code, gross FROM payments').all()) if (p.house_code) payByHouse[p.house_code] = (payByHouse[p.house_code] || 0) + (p.gross || 0)
  // รวมค่าใช้จ่ายที่ผูกบ้านเข้ากำไรรายโครงการด้วย
  for (const code in payByHouse) { const p = houseProj[code]; if (p && byProject[p]) byProject[p].expense += payByHouse[code] }
  // ----- งบกระแสเงินสด (สรุปเงินเข้า/ออก) -----
  const inCustomer = houses.reduce((s, h) => s + (h.collected || 0), 0)
  const outContractor = houses.reduce((s, h) => s + (h.paid || 0), 0)
  const outMaterial = expenses.reduce((s, e) => s + e.amount, 0)
  const outPayroll = db.prepare('SELECT COALESCE(SUM(total),0) a FROM payroll_runs').get().a
  const outOther = db.prepare('SELECT COALESCE(SUM(net),0) a FROM payments').get().a
  const cashflow = {
    in: inCustomer,
    outContractor, outMaterial, outPayroll, outOther,
    out: outContractor + outMaterial + outPayroll + outOther,
    net: inCustomer - (outContractor + outMaterial + outPayroll + outOther),
  }
  // ----- งบประมาณ (ต้นทุนแผน) vs จริง ต่อบ้าน -----
  const budget = houses.map((h) => {
    const plan = h.contractor_value || 0 // ต้นทุนช่างตามแผน
    const actualContractor = h.paid || 0
    const actualMaterial = matByHouse[h.code] || 0
    const actualOther = payByHouse[h.code] || 0 // ค่าใช้จ่ายย่อยที่จ่ายผ่านใบจ่ายเงิน
    const actual = actualContractor + actualMaterial + actualOther
    return { code: h.code, name: h.name, plan, actualContractor, actualMaterial, actualOther, actual, variance: plan - actual }
  })
  res.json({
    projects: Object.values(byProject),
    categories: Object.entries(byCat).map(([cat, amount]) => ({ cat, amount })),
    totals: {
      contract: houses.reduce((s, h) => s + h.value, 0),
      collected: houses.reduce((s, h) => s + h.collected, 0),
      expense: expenses.reduce((s, e) => s + e.amount, 0),
    },
    cashflow,
    budget,
  })
})

// ---------- dashboard aggregates ----------
api.get('/dashboard', (_req, res) => {
  const houses = db.prepare('SELECT * FROM houses').all()
  const sum = (k) => houses.reduce((s, h) => s + h[k], 0)
  const collected = sum('collected')
  const expense = db.prepare('SELECT COALESCE(SUM(amount),0) s FROM expenses').get().s
  const nameByCode = Object.fromEntries(houses.map((h) => [h.code, h.name]))
  // live alert panels
  const daysOverdue = (due) => {
    const t = Date.parse(due)
    if (Number.isNaN(t)) return 0
    return Math.max(0, Math.round((Date.now() - t) / 86400000))
  }
  const overdueList = db.prepare("SELECT * FROM installments WHERE status='เลยกำหนด' ORDER BY id").all()
    .map((r) => ({ house: nameByCode[r.house_code] || r.house_code, no: String(r.no), detail: r.detail, amount: '฿' + r.amount.toLocaleString('en-US'), days: daysOverdue(r.due) }))
  const toCollectList = db.prepare("SELECT * FROM installments WHERE status='รอเก็บเงิน' ORDER BY id").all()
    .map((r) => ({ house: nameByCode[r.house_code] || r.house_code, detail: `งวด ${r.no} · ${r.detail}`, amount: '฿' + r.amount.toLocaleString('en-US') }))
  const advanceList = db.prepare('SELECT * FROM contractors WHERE advance > deducted ORDER BY id').all()
    .map((c) => ({ name: c.name, house: nameByCode[c.house_code] || c.house_code, remain: '฿' + (c.advance - c.deducted).toLocaleString('en-US') }))
  res.json({
    building: houses.filter((h) => h.status === 'กำลังสร้าง').length,
    delivered: houses.filter((h) => h.status === 'ส่งมอบแล้ว').length,
    afterService: houses.filter((h) => h.status === 'after-service').length,
    collected,
    remain: sum('remain'),
    contractValue: sum('value'),
    expense,
    net: collected - expense,
    overdue: overdueList.length,
    openIssues: db.prepare("SELECT COUNT(*) c FROM issues WHERE status!='แก้ไขแล้ว'").get().c,
    overdueList,
    toCollectList,
    advanceList,
  })
})

// ---------- audit log + database backup (admin only) ----------
api.get('/audit', adminOnly, (_req, res) => res.json(db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 300').all()))
api.get('/backup', adminOnly, (_req, res) => {
  db.pragma('wal_checkpoint(TRUNCATE)')
  const file = join(__dirname, 'data', 'ppsd.sqlite')
  if (!existsSync(file)) return res.status(404).json({ error: 'ไม่พบฐานข้อมูล' })
  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename="ppsd-backup-${new Date().toISOString().slice(0, 10)}.sqlite"`)
  res.send(readFileSync(file))
})
// กู้คืนข้อมูลจากไฟล์ .sqlite (ก๊อปตารางทีละตัวเฉพาะคอลัมน์ที่มีร่วมกัน — เข้ากับเวอร์ชันเก่าได้)
function restoreFromFile(filePath) {
  db.exec(`ATTACH DATABASE '${filePath.replace(/'/g, "''")}' AS bak`)
  try {
    const hasUsers = db.prepare("SELECT 1 FROM bak.sqlite_master WHERE type='table' AND name='users'").get()
    if (!hasUsers) { db.exec('DETACH DATABASE bak'); return { error: 'ไฟล์สำรองไม่ถูกต้อง (ไม่ใช่ฐานข้อมูล PPSD)' } }
    const mainTables = db.prepare("SELECT name FROM main.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((t) => t.name)
    db.transaction(() => {
      for (const t of mainTables) {
        if (!db.prepare("SELECT 1 FROM bak.sqlite_master WHERE type='table' AND name=?").get(t)) continue
        const mainCols = db.prepare(`PRAGMA main.table_info(${t})`).all().map((c) => c.name)
        const bakCols = db.prepare(`PRAGMA bak.table_info(${t})`).all().map((c) => c.name)
        const common = mainCols.filter((c) => bakCols.includes(c))
        if (!common.length) continue
        const cols = common.map((c) => `"${c}"`).join(',')
        db.exec(`DELETE FROM main.${t}`)
        db.exec(`INSERT INTO main.${t} (${cols}) SELECT ${cols} FROM bak.${t}`)
      }
    })()
    db.exec('DETACH DATABASE bak')
    db.pragma('wal_checkpoint(TRUNCATE)')
    return { ok: true }
  } catch (e) {
    try { db.exec('DETACH DATABASE bak') } catch { /* ignore */ }
    return { error: 'กู้คืนไม่สำเร็จ — ไฟล์อาจเสียหาย' }
  }
}
// restore: replace all data from an uploaded backup file (admin only)
api.post('/restore', adminOnly, (req, res) => {
  const input = String(req.body?.data || '')
  const m = /^data:[^;]*;base64,(.*)$/.exec(input)
  const raw = m ? m[1] : input
  if (!raw) return res.status(400).json({ error: 'ไม่พบไฟล์สำรอง' })
  const tmp = join(__dirname, 'data', 'restore-tmp.sqlite')
  try {
    writeFileSync(tmp, Buffer.from(raw, 'base64'))
    const r = restoreFromFile(tmp)
    try { unlinkSync(tmp) } catch { /* ignore */ }
    if (r.error) return res.status(400).json({ error: r.error })
    audit(req, 'กู้คืนข้อมูล', 'จากไฟล์สำรอง')
    res.json({ ok: true })
  } catch (e) {
    try { unlinkSync(tmp) } catch { /* ignore */ }
    res.status(500).json({ error: 'กู้คืนไม่สำเร็จ — ไฟล์อาจเสียหาย' })
  }
})
// กู้คืนจากไฟล์สำรองอัตโนมัติที่มีอยู่แล้ว (คลิกเดียว ไม่ต้องหาไฟล์เอง) — สำรองปัจจุบันก่อนเสมอ
api.post('/backups/:name/restore', adminOnly, (req, res) => {
  const name = String(req.params.name || '')
  if (!/^ppsd-auto-\d{4}-\d{2}-\d{2}\.sqlite$/.test(name)) return res.status(400).json({ error: 'ชื่อไฟล์สำรองไม่ถูกต้อง' })
  const file = join(backupDir, name)
  if (!existsSync(file)) return res.status(404).json({ error: 'ไม่พบไฟล์สำรองนี้' })
  // สำรองสถานะปัจจุบันไว้ก่อนกู้คืน (กันเผลอ) — ใช้ชื่อแยก ไม่ทับไฟล์สำรองรายวัน/ไฟล์ที่กำลังกู้
  try {
    mkdirSync(backupDir, { recursive: true })
    db.pragma('wal_checkpoint(TRUNCATE)')
    writeFileSync(join(backupDir, 'ppsd-before-restore.sqlite'), readFileSync(join(__dirname, 'data', 'ppsd.sqlite')))
  } catch { /* ignore */ }
  const r = restoreFromFile(file)
  if (r.error) return res.status(500).json({ error: r.error })
  audit(req, 'กู้คืนข้อมูลจากไฟล์สำรองอัตโนมัติ', name)
  res.json({ ok: true, restored: name })
})

app.use('/api', api)

// ---------- serve the built frontend (single-port production mode) ----------
// After `npm run build`, the server also serves dist/ so the whole app runs on
// one port and is reachable from other devices on the LAN.
const distDir = join(__dirname, '..', 'dist')
if (existsSync(join(distDir, 'index.html'))) {
  app.use(express.static(distDir))
  // SPA fallback for any non-API GET
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(join(distDir, 'index.html'))
    }
    next()
  })
}

// print all LAN addresses so phones/other PCs know where to connect
function lanUrls(port) {
  const urls = []
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === 'IPv4' && !i.internal) urls.push(`http://${i.address}:${port}`)
    }
  }
  return urls
}

// ---------- auto-backup: snapshot the DB daily, keep the last 14 ----------
const backupDir = join(__dirname, 'data', 'backups')
// สำเนาสำรองไปโฟลเดอร์นอกเครื่อง (External drive / Google Drive / OneDrive / \\เครื่องอื่น)
// กันเครื่องเซิร์ฟเวอร์พังแล้วข้อมูลหาย — ตั้งพาธในหน้าผู้ใช้งาน
function mirrorBackup(srcFile, day) {
  const dir = getSetting('backup_mirror_dir', '')
  if (!dir) return
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `ppsd-auto-${day}.sqlite`), readFileSync(srcFile))
    const mf = readdirSync(dir).filter((f) => f.startsWith('ppsd-auto-')).sort()
    while (mf.length > 14) unlinkSync(join(dir, mf.shift()))
    setSetting('backup_mirror_status', JSON.stringify({ at: todayTH(), ok: true, dir }))
  } catch (e) {
    setSetting('backup_mirror_status', JSON.stringify({ at: todayTH(), ok: false, dir, msg: e.message }))
    console.error('mirror-backup failed:', e.message)
  }
}
function autoBackup() {
  try {
    mkdirSync(backupDir, { recursive: true })
    db.pragma('wal_checkpoint(TRUNCATE)')
    const day = new Date().toISOString().slice(0, 10)
    const file = join(backupDir, `ppsd-auto-${day}.sqlite`)
    writeFileSync(file, readFileSync(join(__dirname, 'data', 'ppsd.sqlite')))
    // keep only the latest 14 auto-backups
    const files = readdirSync(backupDir).filter((f) => f.startsWith('ppsd-auto-')).sort()
    while (files.length > 14) unlinkSync(join(backupDir, files.shift()))
    mirrorBackup(file, day) // สำเนาไปนอกเครื่องด้วย (ถ้าตั้งไว้)
  } catch (e) { console.error('auto-backup failed:', e.message) }
}
autoBackup() // one on boot
setInterval(autoBackup, 24 * 60 * 60 * 1000) // then daily
// list available auto-backups (admin)
api.get('/backups', adminOnly, (_req, res) => {
  try {
    const files = readdirSync(backupDir).filter((f) => f.startsWith('ppsd-auto-')).sort().reverse()
    res.json(files.map((f) => ({ name: f, size: statSync(join(backupDir, f)).size, date: f.replace('ppsd-auto-', '').replace('.sqlite', '') })))
  } catch { res.json([]) }
})
// ---- สำรองนอกเครื่อง: ดู/ตั้งค่าโฟลเดอร์ + สั่งสำรองทันที (admin) ----
function mirrorStatus() { try { return JSON.parse(getSetting('backup_mirror_status', '') || 'null') } catch { return null } }
api.get('/backup-mirror', adminOnly, (_req, res) => res.json({ dir: getSetting('backup_mirror_dir', ''), status: mirrorStatus() }))
api.put('/backup-mirror', adminOnly, (req, res) => {
  const dir = String((req.body || {}).dir || '').trim()
  if (dir) {
    try { mkdirSync(dir, { recursive: true }); const t = join(dir, '.ppsd-write-test'); writeFileSync(t, 'ok'); unlinkSync(t) }
    catch (e) { return res.status(400).json({ error: 'เขียนโฟลเดอร์นี้ไม่ได้ — ตรวจว่าพาธถูกต้อง/ไดรฟ์เสียบอยู่/มีสิทธิ์เขียน (' + e.message + ')' }) }
  }
  setSetting('backup_mirror_dir', dir)
  audit(req, 'ตั้งโฟลเดอร์สำรองนอกเครื่อง', dir || '(ปิดใช้งาน)')
  res.json({ ok: true, dir })
})
api.post('/backup-mirror/run', adminOnly, (req, res) => {
  if (!getSetting('backup_mirror_dir', '')) return res.status(400).json({ error: 'ยังไม่ได้ตั้งโฟลเดอร์สำรองนอกเครื่อง' })
  autoBackup()
  audit(req, 'สั่งสำรองนอกเครื่องทันที', getSetting('backup_mirror_dir', ''))
  res.json({ ok: true, status: mirrorStatus() })
})

const PORT = process.env.PORT || 3001
// bind to 0.0.0.0 so other devices on the network can reach it
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nPPSD ERP — เปิดใช้งานแล้ว`)
  console.log(`  เครื่องนี้:      http://localhost:${PORT}`)
  for (const u of lanUrls(PORT)) console.log(`  มือถือ/เครื่องอื่น: ${u}`)
  console.log('')
})
