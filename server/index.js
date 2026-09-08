import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, readdirSync, statSync, appendFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { db, dbFile } from './db.js'
import { login, logout, requireAuth, requireRole, requireManager, isManager, requireSalary, canSeeSalary } from './auth.js'
import { hashPin, verifyPin } from './security.js'
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto'
import { execFile } from 'node:child_process'
import { EFILINGS, efilingList } from './efiling.js'
import * as acct from './accounting.js'
import { createTunnelManager } from './tunnel.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ---- crash log: เขียนสาเหตุลงไฟล์ก่อนปิดตัว (PM2/Task Scheduler จะเปิดใหม่ให้เอง — ดู SERVICE-SETUP.md) ----
const logsDir = join(__dirname, 'data', 'logs')
function crashLog(kind, err) {
  try {
    mkdirSync(logsDir, { recursive: true })
    const day = new Date().toISOString().slice(0, 10)
    appendFileSync(join(logsDir, `error-${day}.log`), `[${new Date().toISOString()}] ${kind}: ${err?.stack || err?.message || err}\n`)
  } catch { /* อย่าล่มซ้ำเพราะเขียน log ไม่ได้ */ }
}
process.on('uncaughtException', (err) => { crashLog('uncaughtException', err); console.error('FATAL:', err); process.exit(1) })
process.on('unhandledRejection', (err) => { crashLog('unhandledRejection', err); console.error('unhandledRejection:', err) })

const app = express()
app.use(cors())
app.use(express.json({ limit: '30mb', verify: (req, _res, buf) => { req.rawBody = buf } })) // allow base64 signatures + file uploads · rawBody ไว้ตรวจลายเซ็น webhook LINE
// ลิงก์สาธารณะอัตโนมัติ (trycloudflare) เปิดไว้เพื่อ LINE webhook เท่านั้น — ถ้าไม่ได้อนุญาต "เปิด ERP ผ่านลิงก์นี้" คำขออื่นจากลิงก์นั้นจะถูกปิด
app.use((req, res, next) => {
  const host = String(req.headers.host || '')
  if (!/\.trycloudflare\.com$/i.test(host) && !req.headers['cf-connecting-ip']) return next()
  if (req.path.startsWith('/api/line/webhook')) return next()
  if (getSetting('tunnel_expose', '0') === '1') return next()
  res.status(404).type('text/plain').send('ลิงก์นี้เปิดไว้สำหรับ LINE webhook เท่านั้น — ถ้าต้องการใช้ ERP นอกออฟฟิศ ให้แอดมินเปิดที่ ผู้ใช้งาน → แจ้งเตือน LINE → "อนุญาตเปิด ERP ผ่านลิงก์นี้"')
})

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
  return payType === 'รายวัน' ? base * 30 : base // ฐาน 30 วัน/เดือน
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
// คำนวณประกันสังคมของพนักงานทุกคนใหม่ตอนบูต (เผื่อเพดาน ปกส. เปลี่ยน) — ภาษีเป็นค่ากรอกเอง ไม่แตะ
try {
  for (const e of db.prepare('SELECT id,base,pay_type,sso,no_sso FROM employees').all()) {
    const mBase = monthlyBaseOf(e.base, e.pay_type)
    const sso = e.no_sso ? 0 : ssoOf(mBase)
    if (sso !== e.sso) db.prepare('UPDATE employees SET sso=? WHERE id=?').run(sso, e.id)
  }
} catch (e) { console.error('sso recompute failed:', e.message) }
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
  // ลาที่อนุมัติ = มีใบลา (ไม่นับขาด) · ลาที่ไม่อนุมัติ = ถูกหักแยกเป็น "วันลา" ใน computePayroll แล้ว ไม่นับขาดซ้ำอีกชั้น
  for (const l of db.prepare("SELECT start_date,end_date FROM leaves WHERE emp_code=? AND status IN ('อนุมัติ','ไม่อนุมัติ')").all(emp.code))
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
// แปลงวันที่ (ISO หรือรูปแบบไทย "2 ก.ย. 69") → 'YYYY-MM-DD' · คืน null ถ้าอ่านไม่ออก
function parseAnyDateISO(s) {
  if (!s) return null
  const str = String(s).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10)
  const m = str.match(/^(\d{1,2})\s+(\S+)\s+(\d{2,4})$/)
  if (m) {
    const mi = TH_MONTHS.indexOf(m[2])
    if (mi >= 0) {
      let y = Number(m[3])
      if (y < 100) y += 2500 // ปี พ.ศ. 2 หลัก
      if (y > 2400) y -= 543 // พ.ศ. → ค.ศ.
      return `${y}-${String(mi + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`
    }
  }
  return null
}
const dateInPeriod = (dateStr, period) => { const iso = parseAnyDateISO(dateStr); return !!iso && iso.startsWith(period) }
// เติม date_iso ให้เอกสารขายเก่าที่บันทึกไว้เป็นวันที่ไทย (ครั้งเดียว — แถวใหม่มี date_iso ตั้งแต่สร้าง)
try {
  for (const r of db.prepare("SELECT id, date FROM sales_docs WHERE COALESCE(date_iso,'') = ''").all()) {
    const iso = parseAnyDateISO(r.date)
    if (iso) db.prepare('UPDATE sales_docs SET date_iso=? WHERE id=?').run(iso, r.id)
  }
} catch (e) { console.error('backfill sales_docs date_iso:', e.message) }
// เติม date_iso ให้ใบจ่ายเงินเก่า (ก่อนมีคอลัมน์) — ไม่งั้นหายจากสรุปภาษีแบบเลือกช่วงเวลา
try {
  for (const r of db.prepare("SELECT id, date FROM payments WHERE COALESCE(date_iso,'') = ''").all()) {
    const iso = parseAnyDateISO(r.date)
    if (iso) db.prepare('UPDATE payments SET date_iso=? WHERE id=?').run(iso, r.id)
  }
} catch (e) { console.error('backfill payments date_iso:', e.message) }
// บันทึกธง "ลงบัญชีไม่สำเร็จ" (เช่น ติดงวดปิด) — โชว์เตือนหน้าบัญชีจนกว่าจะลงสำเร็จ
function logJournalIssue(source, source_id, ref, err) {
  try {
    db.prepare('DELETE FROM journal_issues WHERE source=? AND source_id=?').run(source, String(source_id))
    db.prepare('INSERT INTO journal_issues (source, source_id, ref, message, created) VALUES (?,?,?,?,?)')
      .run(source, String(source_id), String(ref || ''), String(err?.message || err || ''), todayISO())
  } catch (e2) { console.error('logJournalIssue:', e2.message) }
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

// ทุก API = ข้อมูลสด ห้ามเบราว์เซอร์แคช (กด F5 แล้วเห็นข้อมูลล่าสุดเสมอ)
api.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })

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
// ลายเซ็นของผู้ใช้สำหรับประทับลงเอกสาร (PR/อนุมัติ): ใช้ของบัญชีผู้ใช้ก่อน ถ้ายังไม่อัปโหลด → ใช้ลายเซ็นในทะเบียนพนักงาน (HR) ที่ผูกกัน
function sigOfUser(userId) {
  const u = db.prepare('SELECT name, signature FROM users WHERE id=?').get(userId)
  if (!u) return null
  if (u.signature) return u.signature
  const e = db.prepare("SELECT signature FROM employees WHERE signature IS NOT NULL AND signature != '' AND (user_id=? OR name=?) ORDER BY CASE WHEN user_id=? THEN 0 ELSE 1 END LIMIT 1").get(userId, u.name, userId)
  return e?.signature || null
}
// เติมลายเซ็นย้อนหลังให้เอกสารที่ออกไปตอนผู้ใช้ยังไม่มีลายเซ็น (ตอนนี้มีแล้ว) — ไม่ทับของที่มีอยู่
// เรียกตอนบูต และทุกครั้งที่มีการอัปโหลดลายเซ็น (ผู้ใช้/พนักงาน) → ใบขอซื้อเก่าได้ลายเซ็นทันทีโดยไม่ต้องรีสตาร์ท
function backfillSignatures() {
  try {
    const fillPr = db.prepare("UPDATE purchase_requests SET requester_sig=? WHERE id=? AND (requester_sig IS NULL OR requester_sig='')")
    const fillAp = db.prepare("UPDATE doc_approvals SET approver_sig=? WHERE id=? AND (approver_sig IS NULL OR approver_sig='')")
    const sigByName = new Map()
    const sigOfName = (name) => {
      if (!sigByName.has(name)) { const u = db.prepare('SELECT id FROM users WHERE name=?').get(name); sigByName.set(name, u ? sigOfUser(u.id) : null) }
      return sigByName.get(name)
    }
    let n = 0
    for (const r of db.prepare("SELECT id, by FROM purchase_requests WHERE requester_sig IS NULL OR requester_sig=''").all()) { const s = sigOfName(r.by); if (s) n += fillPr.run(s, r.id).changes }
    for (const r of db.prepare("SELECT id, approver FROM doc_approvals WHERE approver_sig IS NULL OR approver_sig=''").all()) { const s = sigOfName(r.approver); if (s) n += fillAp.run(s, r.id).changes }
    if (n) console.log(`[signatures] เติมลายเซ็นย้อนหลัง ${n} รายการ`)
    return n
  } catch (e) { console.error('backfill signatures failed:', e.message); return 0 }
}
api.get('/me', requireAuth, (req, res) => {
  const row = db.prepare('SELECT must_change_pin FROM users WHERE id = ?').get(req.user.id)
  res.json({ ...req.user, signature: sigOfUser(req.user.id), isManager: isManager(req.user), mustChangePin: !!row?.must_change_pin, lineLinked: !!db.prepare('SELECT line_uid FROM users WHERE id=?').get(req.user.id)?.line_uid })
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
// กันเดา PIN บนช่องทางสาธารณะ (kiosk ทุกตัว): ผิด 5 ครั้งต่อรหัสพนักงาน → ล็อก 5 นาที
const kioskAttempts = new Map() // emp_code -> { fails, until }
function kioskPinCheck(empCode, pin, emp) {
  const key = String(empCode || '')
  const rec = kioskAttempts.get(key) || { fails: 0, until: 0 }
  if (rec.until > Date.now()) return { error: 'ใส่ PIN ผิดหลายครั้ง — ล็อกชั่วคราว ลองใหม่ใน 5 นาที', code: 429 }
  if (!emp?.pin || hashPin(pin) !== emp.pin) {
    rec.fails += 1
    if (rec.fails >= 5) { rec.until = Date.now() + 5 * 60000; rec.fails = 0 }
    kioskAttempts.set(key, rec)
    return { error: 'PIN ไม่ถูกต้อง', code: 401 }
  }
  kioskAttempts.delete(key)
  return null
}
api.post('/kiosk/location', (req, res) => {
  const { emp_code, pin, lat, lng, accuracy, note } = req.body || {}
  const emp = db.prepare('SELECT * FROM employees WHERE code=?').get(emp_code)
  if (!emp) return res.status(404).json({ error: 'ไม่พบพนักงาน' })
  const bad = kioskPinCheck(emp_code, pin, emp)
  if (bad) return res.status(bad.code).json({ error: bad.error })
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
// ดูสลิปเงินเดือน "ของตัวเอง" — พนักงานยืนยันด้วย PIN (เหมือนตอกบัตร) · เฉพาะงวดที่ปิดแล้ว (ตัวเลขจ่ายจริง)
api.post('/kiosk/my-slip', (req, res) => {
  const { emp_code, pin, period } = req.body || {}
  const emp = db.prepare('SELECT * FROM employees WHERE code=?').get(emp_code)
  if (!emp) return res.status(404).json({ error: 'ไม่พบพนักงาน' })
  if (emp.status === 'ลาออก') return res.status(403).json({ error: 'บัญชีพนักงานนี้พ้นสภาพแล้ว — ติดต่อฝ่ายบุคคลเพื่อขอสลิปย้อนหลัง' })
  const bad = kioskPinCheck(emp_code, pin, emp)
  if (bad) return res.status(bad.code).json({ error: bad.error })
  const periods = db.prepare('SELECT period FROM payroll_runs ORDER BY period DESC LIMIT 12').all().map((r) => r.period)
  if (!periods.length) return res.json({ periods: [], slip: null })
  const p = /^\d{4}-\d{2}$/.test(String(period || '')) && periods.includes(period) ? period : periods[0]
  const run = db.prepare('SELECT data FROM payroll_runs WHERE period=?').get(p)
  let slip = null
  try {
    const rows = JSON.parse(run.data).filter((x) => x.code === emp.code)
    const row = rows.length > 1 ? (rows.find((x) => x.name === emp.name) || null) : rows[0]
    if (row) { const { pin: _p, signature: _s, track_token: _t, ...safe } = row; slip = { ...safe, period: periodLabelTH(p) } }
  } catch { /* ข้อมูลงวดเสีย */ }
  res.json({ periods: periods.map((x) => ({ period: x, label: periodLabelTH(x) })), period: p, periodLabel: periodLabelTH(p), slip })
})
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
// ===== LINE webhook (สาธารณะ — LINE ยิงเข้ามา) =====
// ใช้ 3 อย่าง: (1) หา Group ID ตอนเชิญบอทเข้ากลุ่ม (2) ผูกบัญชี ERP กับ LINE ด้วยรหัส 6 หลัก
// (3) "CEO สั่งงานผ่าน LINE": พิมพ์คำสั่งในแชทบอท → ระบบเดาผู้รับ/บ้าน/ด่วน → ตอบ 'ตกลง' → ออกใบสั่งงาน + แจ้งคนรับทาง LINE → คนรับตอบ 'รับ' = รับทราบ
// ต้องตั้ง Webhook URL ในหน้า LINE Developers เป็น https://<โดเมนสาธารณะ>/api/line/webhook (เปิดด้วย tunnel.bat หรือ Cloudflare Tunnel ถาวร)
function lineSeen() { try { return JSON.parse(getSetting('line_seen', '[]')) || [] } catch { return [] } }
async function lineSourceName(type, id, token) {
  if (!token) return ''
  const url = type === 'group' ? `https://api.line.me/v2/bot/group/${id}/summary` : type === 'user' ? `https://api.line.me/v2/bot/profile/${id}` : ''
  if (!url) return ''
  try {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(8000) })
    if (!r.ok) return ''
    const j = await r.json()
    return String(j.groupName || j.displayName || '')
  } catch { return '' }
}
// ส่งข้อความ LINE (push ถึง user/group) — ไม่มี token = ไม่ส่ง ไม่พัง
// แปลง text หรือ array ของข้อความ/การ์ด (Flex) ให้เป็น messages ของ LINE (สูงสุด 5 ต่อครั้ง)
const lineMessages = (m) => (Array.isArray(m) ? m : [m]).slice(0, 5).map((x) => (typeof x === 'string' ? { type: 'text', text: x.slice(0, 4900) } : x))
async function linePush(to, msg) {
  const token = getSetting('line_token', '')
  if (!token || !to) return false
  try {
    const r = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ to, messages: lineMessages(msg) }), signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) console.error('[line push]', r.status, (await r.text()).slice(0, 200))
    return r.ok
  } catch { return false }
}
async function lineReply(replyToken, msg) {
  const token = getSetting('line_token', '')
  if (!token || !replyToken) return false
  try {
    const r = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ replyToken, messages: lineMessages(msg) }), signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) console.error('[line reply]', r.status, (await r.text()).slice(0, 200))
    return r.ok
  } catch { return false }
}
// การ์ดใบสั่งงาน (Flex) — ส่งให้คนรับและผู้สั่งใน LINE แทนข้อความล้วน
function woFlex(wo, opts = {}) {
  const house = wo.house_code ? (db.prepare('SELECT name FROM houses WHERE code=?').get(wo.house_code)?.name || wo.house_code) : '-'
  const row = (label, value, color) => ({ type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
    { type: 'text', text: label, size: 'sm', color: '#94A0A8', flex: 2 },
    { type: 'text', text: String(value || '-'), size: 'sm', color: color || '#1C2730', flex: 5, wrap: true }] })
  const urgent = !!wo.urgent
  const footerText = opts.footer || (opts.forAssignee ? "ตอบ 'รับ' ในแชทนี้เพื่อรับทราบ" : 'ส่งถึงผู้รับแล้ว · รอรับทราบ')
  return {
    type: 'flex', altText: `ใบสั่งงาน ${wo.no}: ${wo.project || wo.scope}`,
    contents: { type: 'bubble', size: 'mega',
      header: { type: 'box', layout: 'vertical', backgroundColor: urgent ? '#C24036' : '#30506A', paddingAll: '14px', contents: [
        { type: 'text', text: `ใบสั่งงาน ${wo.no}`, color: '#FFFFFF', weight: 'bold', size: 'md' },
        { type: 'text', text: urgent ? `🔴 ด่วน · ต้องรับทราบภายใน ${wo.deadline_min || 5} นาที` : 'PPSD Construction ERP', color: '#E6EDF3', size: 'xs' }] },
      body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
        { type: 'text', text: String(wo.scope || wo.project || '-'), wrap: true, weight: 'bold', size: 'md' },
        { type: 'separator' },
        row('ผู้รับ', wo.executor), row('บ้าน', house), row('กำหนดส่ง', wo.due_date || 'ไม่กำหนด', wo.due_date ? '#C0852C' : undefined),
        row('สั่งโดย', wo.by), row('วันที่สั่ง', wo.issued_date), row('สถานะ', wo.ack ? 'รับทราบแล้ว' : 'รอรับทราบ', wo.ack ? '#2E7D55' : '#B7791F')] },
      footer: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: footerText, size: 'sm', color: '#2E7D55', align: 'center', wrap: true }] } },
  }
}
// LINE ของผู้รับงาน: ชื่อผู้ใช้ที่ผูก หรือพนักงานที่ผูก user_id ไว้
function lineUidOfExecutor(executor, executorCode) {
  const byName = lineUidOfName(executor)
  if (byName) return byName
  const e = executorCode ? db.prepare('SELECT user_id FROM employees WHERE code=?').get(executorCode) : null
  return e?.user_id ? (db.prepare('SELECT line_uid FROM users WHERE id=?').get(e.user_id)?.line_uid || null) : null
}
// แปลงวันแบบพูด → YYYY-MM-DD: วันนี้ พรุ่งนี้ มะรืน · จันทร์นี้/ศุกร์หน้า · 15/9 · 15 ก.ย. · 15 กันยายน 2569 · สิ้นเดือน · ภายใน 3 วัน · ไม่กำหนด → ''
function parseThaiDate(text) {
  const t = String(text || '').trim()
  if (!t) return null
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const add = (d) => { const x = new Date(now); x.setDate(x.getDate() + d); return isoOf(x) }
  if (/ไม่กำหนด|ไม่มีกำหนด|ไม่ระบุ|^ไม่$|^-$|ไม่ต้อง/.test(t)) return ''
  if (/มะรืน/.test(t)) return add(2)
  if (/พรุ่งนี้|พรุ่ง/.test(t)) return add(1)
  if (/วันนี้|เดี๋ยวนี้|ทันที/.test(t)) return add(0)
  let m = t.match(/ภายใน\s*(\d+)\s*วัน|อีก\s*(\d+)\s*วัน/); if (m) return add(Number(m[1] || m[2]))
  m = t.match(/(\d+)\s*(สัปดาห์|อาทิตย์)/); if (m && /ภายใน|อีก/.test(t)) return add(Number(m[1]) * 7)
  if (/สิ้นเดือน|ปลายเดือน/.test(t)) { const x = new Date(now.getFullYear(), now.getMonth() + 1, 0); return isoOf(x) }
  const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์']
  for (let i = 0; i < 7; i++) {
    const re = new RegExp('(?:วัน)?' + days[i] + '(?:บดี)?\\s*(นี้|หน้า)?')
    const mm = t.match(re)
    if (mm) { let d = (i - now.getDay() + 7) % 7; if (d === 0 && !/นี้/.test(mm[1] || '')) d = 7; if (mm[1] === 'หน้า' && d < 7) d += 7; return add(d) }
  }
  const TH_M = { 'ม.ค': 0, 'มค': 0, 'มกรา': 0, 'ก.พ': 1, 'กพ': 1, 'กุมภา': 1, 'มี.ค': 2, 'มีค': 2, 'มีนา': 2, 'เม.ย': 3, 'เมย': 3, 'เมษา': 3, 'พ.ค': 4, 'พค': 4, 'พฤษภา': 4, 'มิ.ย': 5, 'มิย': 5, 'มิถุนา': 5, 'ก.ค': 6, 'กค': 6, 'กรกฎา': 6, 'ส.ค': 7, 'สค': 7, 'สิงหา': 7, 'ก.ย': 8, 'กย': 8, 'กันยา': 8, 'ต.ค': 9, 'ตค': 9, 'ตุลา': 9, 'พ.ย': 10, 'พย': 10, 'พฤศจิกา': 10, 'ธ.ค': 11, 'ธค': 11, 'ธันวา': 11 }
  m = t.match(/(\d{1,2})\s*(ม\.ค|มค|มกรา|ก\.พ|กพ|กุมภา|มี\.ค|มีค|มีนา|เม\.ย|เมย|เมษา|พ\.ค|พค|พฤษภา|มิ\.ย|มิย|มิถุนา|ก\.ค|กค|กรกฎา|ส\.ค|สค|สิงหา|ก\.ย|กย|กันยา|ต\.ค|ตค|ตุลา|พ\.ย|พย|พฤศจิกา|ธ\.ค|ธค|ธันวา)[ก-๙.]*\s*(\d{2,4})?/)
  if (m) {
    const day = Number(m[1]); const mon = TH_M[m[2]]; let y = m[3] ? Number(m[3]) : now.getFullYear()
    if (y > 2400) y -= 543; else if (y < 100) y += (y >= 60 ? 1900 + 543 - 543 : 2000) // 69 → 2569 → 2026
    if (m[3] && Number(m[3]) < 100) y = Number(m[3]) + 2500 - 543
    const x = new Date(y, mon, day); if (!m[3] && x < now) x.setFullYear(x.getFullYear() + 1)
    return isoOf(x)
  }
  m = t.match(/(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/)
  if (m) {
    const day = Number(m[1]); const mon = Number(m[2]) - 1; let y = m[3] ? Number(m[3]) : now.getFullYear()
    if (y > 2400) y -= 543; else if (y < 100) y = y + 2500 - 543
    if (day >= 1 && day <= 31 && mon >= 0 && mon <= 11) { const x = new Date(y, mon, day); if (!m[3] && x < now) x.setFullYear(x.getFullYear() + 1); return isoOf(x) }
  }
  return null
}
const thaiDateLabel = (iso) => { if (!iso) return 'ไม่กำหนด'; const [y, mo, d] = iso.split('-').map(Number); return `${d} ${['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][mo - 1]} ${String((y + 543) % 100).padStart(2, '0')}` }
// ---- ผูกบัญชี: รหัส 6 หลัก อายุ 10 นาที (ขอจากหน้าผู้ใช้งาน แล้วส่งให้บอท) ----
function lineLinkCodes() { try { return JSON.parse(getSetting('line_link_codes', '{}')) || {} } catch { return {} } }
function issueLineLinkCode(userId) {
  const codes = lineLinkCodes()
  const now = Date.now()
  for (const [c, v] of Object.entries(codes)) if (!v || v.exp < now || v.user_id === userId) delete codes[c]
  let code
  do { code = String(100000 + Math.floor(Math.random() * 900000)) } while (codes[code])
  codes[code] = { user_id: userId, exp: now + 10 * 60 * 1000 }
  setSetting('line_link_codes', JSON.stringify(codes))
  return code
}
function consumeLineLinkCode(code, uid) {
  const codes = lineLinkCodes()
  const v = codes[code]
  if (!v || v.exp < Date.now()) return null
  delete codes[code]; setSetting('line_link_codes', JSON.stringify(codes))
  const u = db.prepare('SELECT id, name FROM users WHERE id=?').get(v.user_id)
  if (!u) return null
  db.prepare('UPDATE users SET line_uid=NULL WHERE line_uid=? AND id<>?').run(uid, u.id) // LINE เดียวผูกได้บัญชีเดียว
  db.prepare('UPDATE users SET line_uid=? WHERE id=?').run(uid, u.id)
  return u
}
const userByLine = (uid) => db.prepare("SELECT * FROM users WHERE line_uid=? AND status<>'ปิดใช้งาน'").get(uid) || db.prepare('SELECT * FROM users WHERE line_uid=?').get(uid)
const lineUidOfName = (name) => db.prepare('SELECT line_uid FROM users WHERE name=? AND line_uid IS NOT NULL').get(name)?.line_uid || null
// พนักงานที่ผูกกับบัญชีผู้ใช้ (employees.user_id หรือชื่อเดียวกัน) — ใช้หาว่างานถูกสั่งถึงคนนี้ไหม
const empOfUser = (u) => db.prepare('SELECT code, name FROM employees WHERE user_id=? OR name=? ORDER BY CASE WHEN user_id=? THEN 0 ELSE 1 END LIMIT 1').get(u.id, u.name, u.id)
// CEO/ผู้บริหารที่สั่งงานผ่าน LINE ได้ = แอดมิน หรือผู้จัดการ
const lineCanCommand = (u) => u.role === 'admin' || isManager(u)
// ---- ร่างคำสั่งงานที่รอ CEO ยืนยัน (ต่อคน) ----
function lineDrafts() { try { return JSON.parse(getSetting('line_drafts', '{}')) || {} } catch { return {} } }
function setLineDraft(uid, draft) { const d = lineDrafts(); if (draft) d[uid] = { ...draft, ts: Date.now() }; else delete d[uid]; setSetting('line_drafts', JSON.stringify(d)) }
function getLineDraft(uid) { const d = lineDrafts()[uid]; return d && Date.now() - d.ts < 30 * 60 * 1000 ? d : null }
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
// หาพนักงานจากข้อความ: ชื่อเต็ม > ชื่อจริง (คำแรก) > ชื่อเล่น (รองรับ "พี่ต้น" "ช่างต้น" "คุณต้น" "น้องต้น") — ยาวสุดก่อน กันชื่อซ้อน
// คืน { code, name, nickname, matched_by } หรือ null · ใช้ทั้งบอท LINE และ API /employees/match
function matchEmployee(text, emps) {
  const t = String(text || '')
  const norm = (x) => String(x || '').trim()
  const cands = []
  for (const e of emps) {
    const full = norm(e.name); const first = full.split(/\s+/)[0]; const nick = norm(e.nickname)
    if (full && t.includes(full)) cands.push({ e, len: full.length + 100, by: 'ชื่อเต็ม' })
    if (first && first.length >= 2 && t.includes(first)) cands.push({ e, len: first.length + 50, by: 'ชื่อจริง' })
    if (nick && nick.length >= 2) {
      // ชื่อเล่นต้องมีคำนำหน้าหรืออยู่หลัง "ให้/บอก/สั่ง" หรือขึ้นต้นข้อความ — กันชื่อเล่นสั้นๆ ไปชนคำอื่น
      const re = new RegExp('(^|ให้|บอก|สั่ง|พี่|ช่าง|คุณ|น้อง|ลุง|ป้า|เฮีย|เจ๊|\\s)' + nick.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      if (re.test(t)) cands.push({ e, len: nick.length + 10, by: 'ชื่อเล่น' })
      else if (nick.replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '').length >= 3 && t.includes(nick)) cands.push({ e, len: nick.length, by: 'ชื่อเล่น' }) // นับเฉพาะพยัญชนะ/สระเต็มตัว (ไม่นับวรรณยุกต์) กันชื่อเล่นสั้นไปชนคำอื่น เช่น ต้น ↔ ต้นไม้
    }
  }
  cands.sort((a, b) => b.len - a.len)
  const top = cands[0]
  return top ? { code: top.e.code, name: top.e.name, nickname: top.e.nickname || '', matched_by: top.by } : null
}
// เดาผู้รับ/บ้าน/ด่วน/กำหนดส่ง จากข้อความ (กติกาเดียวกับหน้า "สั่งงานด้วยเสียง")
function parseLineCommand(t) {
  const emps = db.prepare("SELECT code, name, nickname FROM employees WHERE status IS NULL OR status NOT IN ('ลาออก')").all()
  const houses = db.prepare('SELECT code, name FROM houses').all()
  const found = { scope: t, executor: '', executor_code: '', house_code: '', house_name: '', urgent: false, due_date: '', matched_by: '' }
  const emp = matchEmployee(t, emps)
  if (emp) { found.executor = emp.name; found.executor_code = emp.code; found.matched_by = emp.matched_by }
  const h = houses.find((x) => (x.name && t.includes(x.name)) || (x.code && t.includes(x.code)))
  if (h) { found.house_code = h.code; found.house_name = h.name || h.code }
  if (/ด่วน|เร่งด่วน|urgent/i.test(t)) found.urgent = true
  const due = parseThaiDate(t)
  if (due) found.due_date = due
  found.pending = null
  return found
}
function draftText(d) {
  return `📝 สรุปคำสั่งงาน\nงาน: ${d.scope}\nผู้รับ: ${d.executor || '-'}${d.matched_by === 'ชื่อเล่น' ? ' (จับจากชื่อเล่น)' : ''}\nบ้าน: ${d.house_name || '-'}\nกำหนดส่ง: ${thaiDateLabel(d.due_date)}${d.urgent ? '\n🔴 ด่วน (นับถอยหลังรับทราบ)' : ''}\n\nถูกต้องไหมคะ? ตอบ 'ตกลง' เพื่อออกใบสั่งงาน · พิมพ์ชื่อคนอื่นเพื่อเปลี่ยนผู้รับ · พิมพ์วันใหม่เพื่อเปลี่ยนกำหนด · 'ยกเลิก' เพื่อทิ้ง`
}
// ถามเก็บข้อมูลที่ขาดทีละอย่าง (ผู้รับ → กำหนดส่ง) แล้วค่อยสรุปให้ยืนยัน
function askNextOrSummary(uid, d, replyToken) {
  if (!d.executor) { setLineDraft(uid, { ...d, pending: 'executor' }); return lineReply(replyToken, `รับทราบค่ะ งาน: "${d.scope}"\nจะสั่งงานนี้ให้ใครคะ? (พิมพ์ชื่อจริงหรือชื่อเล่น เช่น สมชาย / พี่ต้น)`) }
  if (!d.due_date && !d.due_asked) { setLineDraft(uid, { ...d, pending: 'due' }); return lineReply(replyToken, `ผู้รับ: ${d.executor}${d.matched_by === 'ชื่อเล่น' ? ' (จับจากชื่อเล่น)' : ''}\nกำหนดส่งงานเป็นวันไหนดีคะ? (เช่น วันนี้ / พรุ่งนี้ / ศุกร์นี้ / 15 ก.ย. หรือพิมพ์ 'ไม่กำหนด')`) }
  setLineDraft(uid, { ...d, pending: null })
  return lineReply(replyToken, draftText(d))
}
function myOpenWorkOrders(u) {
  const emp = empOfUser(u)
  const name = emp?.name || u.name
  return db.prepare("SELECT * FROM work_orders WHERE (executor=? OR esc_name=?) AND status IN ('สั่งงาน','รับทราบ','กำลังทำ','เกินเวลา') ORDER BY urgent DESC, id DESC LIMIT 10").all(name, name)
}
async function handleLineUserMessage(uid, text, replyToken) {
  const t = String(text || '').trim()
  const u = userByLine(uid)
  // ยังไม่ผูก → รับเฉพาะรหัส 6 หลัก
  if (!u) {
    if (/^\d{6}$/.test(t)) {
      const linked = consumeLineLinkCode(t, uid)
      return lineReply(replyToken, linked ? `✅ ผูก LINE กับบัญชี "${linked.name}" แล้ว\n\nพิมพ์ 'ช่วย' เพื่อดูคำสั่งที่ใช้ได้` : '❌ รหัสไม่ถูกหรือหมดอายุ (10 นาที) — ขอรหัสใหม่ที่ ERP → ผู้ใช้งาน → ผูก LINE')
    }
    return lineReply(replyToken, 'ยังไม่ได้ผูกบัญชี ERP กับ LINE นี้\n1) เข้า ERP → เมนู ผู้ใช้งาน → กด "ผูก LINE"\n2) ส่งรหัส 6 หลักที่ได้มาที่นี่')
  }
  const low = t.toLowerCase()
  if (/^(ช่วย|help|\?|คำสั่ง)$/i.test(t)) {
    return lineReply(replyToken, (lineCanCommand(u)
      ? `คำสั่งสำหรับผู้บริหาร (${u.name}):\n• พิมพ์คำสั่งงาน เช่น "ให้สมชายไปเช็คหลังคาบ้านคุณพร ด่วน พรุ่งนี้" → ระบบทำร่าง → ตอบ 'ตกลง'\n• สรุป — สรุปเรื่องค้างวันนี้\n• งานด่วน — งานด่วนที่ยังไม่รับทราบ\n• งาน — งานของฉัน\n• รับ — รับทราบงานล่าสุดที่สั่งถึงฉัน`
      : `คำสั่ง (${u.name}):\n• งาน — งานที่สั่งถึงฉัน\n• รับ — รับทราบงานล่าสุด\n• รับ WO-69-012 — รับทราบใบที่ระบุ`))
  }
  if (/^(สรุป|summary)$/i.test(t)) {
    if (!lineCanCommand(u)) return lineReply(replyToken, 'สรุปเรื่องค้างดูได้เฉพาะผู้บริหาร')
    return lineReply(replyToken, buildLineDigest())
  }
  if (/^(งานด่วน|ด่วน)$/i.test(t) && lineCanCommand(u)) {
    const rows = db.prepare("SELECT * FROM work_orders WHERE urgent=1 AND ack=0 AND status NOT IN ('ยกเลิก') ORDER BY id DESC LIMIT 10").all()
    return lineReply(replyToken, rows.length ? '🔴 งานด่วนที่ยังไม่รับทราบ:\n' + rows.map((w) => `• ${w.no} ${w.project || w.scope} → ${w.esc_name || w.executor || '-'} (${w.status})`).join('\n') : '✅ ไม่มีงานด่วนค้างรับทราบ')
  }
  if (/^(งาน|งานของฉัน|my)$/i.test(t)) {
    const rows = myOpenWorkOrders(u)
    return lineReply(replyToken, rows.length ? `📋 งานของ ${u.name}:\n` + rows.map((w) => `• ${w.no} ${w.project || w.scope}${w.due_date ? ' · ครบ ' + w.due_date : ''} · ${w.ack ? 'รับทราบแล้ว' : '⏳ ยังไม่รับ'}${w.urgent ? ' 🔴' : ''}`).join('\n') + "\n\nตอบ 'รับ' เพื่อรับทราบงานล่าสุด หรือ 'รับ WO-…' ระบุใบ" : '✅ ไม่มีงานค้างสำหรับคุณ')
  }
  // รับทราบงาน: 'รับ' / 'รับทราบ' / 'รับ WO-69-012'
  const ackM = t.match(/^(?:รับ|รับทราบ|ok รับ|ack)\s*(WO-[\w-]+)?$/i)
  if (ackM) {
    let w = ackM[1] ? db.prepare('SELECT * FROM work_orders WHERE no=?').get(ackM[1]) : myOpenWorkOrders(u).find((x) => !x.ack)
    if (!w) return lineReply(replyToken, 'ไม่พบงานที่รอรับทราบสำหรับคุณ')
    if (w.ack) return lineReply(replyToken, `${w.no} รับทราบไปแล้ว`)
    const emp = empOfUser(u); const name = emp?.name || u.name
    if (!(w.executor === name || w.esc_name === name || lineCanCommand(u))) return lineReply(replyToken, `${w.no} ไม่ได้สั่งถึงคุณ`)
    ackWorkOrder(w, name)
    await lineReply(replyToken, `✅ รับทราบ ${w.no} แล้ว\n${w.project || w.scope}`)
    const ceoUid = lineUidOfName(w.by)
    if (ceoUid && ceoUid !== uid) linePush(ceoUid, `✓ ${name} รับทราบงาน ${w.no} แล้ว (${w.project || w.scope})`)
    return true
  }
  if (!lineCanCommand(u)) return lineReply(replyToken, `บัญชี "${u.name}" ใช้ได้เฉพาะ: งาน / รับ — การสั่งงานผ่าน LINE ทำได้เฉพาะผู้บริหาร`)
  // ---- โหมดสั่งงาน (ผู้บริหาร) ----
  const draft = getLineDraft(uid)
  if (/^(ยกเลิก|cancel|ทิ้ง)$/i.test(t)) { setLineDraft(uid, null); return lineReply(replyToken, 'ทิ้งร่างแล้วค่ะ') }
  if (/^(ตกลง|ok|โอเค|ยืนยัน|ใช่|confirm|ส่ง|ส่งเลย)$/i.test(low)) {
    if (!draft) return lineReply(replyToken, 'ยังไม่มีร่างคำสั่งงานค่ะ — พิมพ์คำสั่งงานก่อน เช่น "ให้สมชายไปเช็คหลังคาบ้านคุณพร ด่วน พรุ่งนี้"')
    if (!draft.executor) { setLineDraft(uid, { ...draft, pending: 'executor' }); return lineReply(replyToken, 'ยังไม่รู้ว่าส่งให้ใครค่ะ — จะสั่งงานนี้ให้ใครคะ? (พิมพ์ชื่อจริงหรือชื่อเล่น)') }
    const wo = createWorkOrder({ scope: draft.scope, project: draft.scope.slice(0, 40), executor: draft.executor, executor_code: draft.executor_code, house_code: draft.house_code, due_date: draft.due_date, urgent: draft.urgent, source: 'line' }, u.name)
    setLineDraft(uid, null)
    audit({ user: u }, draft.urgent ? 'สั่งงานด่วน (LINE)' : 'สั่งงานผ่าน LINE', `${wo.no} → ${draft.executor}`)
    const toUid = lineUidOfExecutor(draft.executor, draft.executor_code)
    let sent = false
    if (toUid) sent = await linePush(toUid, [`📌 งานใหม่จาก ${u.name}${draft.urgent ? ' 🔴 ด่วน' : ''} — ตอบ 'รับ' เพื่อรับทราบ`, woFlex(wo, { forAssignee: true })])
    return lineReply(replyToken, [`✅ ออกใบสั่งงาน ${wo.no} → ${draft.executor}${draft.urgent ? ' (ด่วน นับถอยหลัง)' : ''}\n` + (sent ? '📨 ส่งใบสั่งงานถึงผู้รับทาง LINE แล้ว จะแจ้งทันทีที่เขาตอบรับ' : `⚠ ${draft.executor} ยังไม่ได้ผูก LINE — ใบสั่งงานอยู่ในระบบ ERP (แจ้งเตือนในแอป) · ให้เขาผูก LINE ที่ไอคอน 💬 มุมขวาบน`), woFlex(wo, { footer: sent ? 'สำเนาสำหรับผู้สั่ง' : 'สำเนาสำหรับผู้สั่ง · ผู้รับยังไม่ผูก LINE' })])
  }
  // กำลังถามข้อมูลที่ขาดอยู่ → ข้อความนี้คือคำตอบ
  if (draft && draft.pending === 'executor') {
    const p = parseLineCommand(t)
    if (!p.executor) return lineReply(replyToken, `ไม่พบชื่อ "${t}" ในทะเบียนพนักงานค่ะ ลองพิมพ์ชื่อจริงหรือชื่อเล่นตามที่ลงทะเบียนไว้ (หรือ 'ยกเลิก')`)
    return askNextOrSummary(uid, { ...draft, executor: p.executor, executor_code: p.executor_code, matched_by: p.matched_by, pending: null }, replyToken)
  }
  if (draft && draft.pending === 'due') {
    const d = parseThaiDate(t)
    if (d === null) return lineReply(replyToken, `ยังอ่านวันไม่ออกค่ะ ลองพิมพ์ เช่น วันนี้ / พรุ่งนี้ / มะรืน / ศุกร์นี้ / 15 ก.ย. / 15/9 หรือ 'ไม่กำหนด'`)
    return askNextOrSummary(uid, { ...draft, due_date: d, due_asked: true, pending: null }, replyToken)
  }
  // มีร่างสรุปอยู่ + พิมพ์ชื่อคน/วันใหม่ → แก้ร่าง
  if (draft && t.length <= 40) {
    const p = parseLineCommand(t)
    if (p.executor) return askNextOrSummary(uid, { ...draft, executor: p.executor, executor_code: p.executor_code, matched_by: p.matched_by, pending: null }, replyToken)
    const d = parseThaiDate(t)
    if (d !== null && !/[ก-๙]{6,}/.test(t.replace(/วันนี้|พรุ่งนี้|มะรืน|ไม่กำหนด|สิ้นเดือน|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์|นี้|หน้า|วัน/g, ''))) return askNextOrSummary(uid, { ...draft, due_date: d, due_asked: true, pending: null }, replyToken)
  }
  // ข้อความใหม่ = คำสั่งงานใหม่
  if (t.length < 4) return lineReply(replyToken, "พิมพ์คำสั่งงานให้ชัดขึ้นหน่อยค่ะ เช่น \"ให้สมชายไปเช็คหลังคาบ้านคุณพร ด่วน พรุ่งนี้\" (พิมพ์ 'ช่วย' ดูคำสั่ง)")
  return askNextOrSummary(uid, parseLineCommand(t), replyToken)
}
function lineSignatureOk(req) {
  const secret = getSetting('line_secret', '')
  if (!secret) return true // ยังไม่ตั้ง secret = ไม่ตรวจ (แนะนำให้ตั้ง)
  const sig = String(req.headers['x-line-signature'] || '')
  if (!sig || !req.rawBody) return false
  const mac = createHmac('sha256', secret).update(req.rawBody).digest('base64')
  try { return mac.length === sig.length && timingSafeEqual(Buffer.from(mac), Buffer.from(sig)) } catch { return false }
}
// ===== เวอร์ชัน/สถานะเซิร์ฟเวอร์ (สาธารณะ) — หน้าเว็บใช้เช็คว่า process ที่รันอยู่เก่ากว่าไฟล์บนดิสก์ไหม (อัปเดตแล้วแต่ยังไม่รีสตาร์ท) =====
const BOOT_TS = Date.now()
function serverVersion() {
  let fileMtime = 0
  try { fileMtime = Math.max(statSync(fileURLToPath(import.meta.url)).mtimeMs, statSync(join(__dirname, 'db.js')).mtimeMs) } catch { /* ignore */ }
  let distMtime = 0
  try { distMtime = statSync(join(__dirname, '..', 'dist', 'index.html')).mtimeMs } catch { /* ignore */ }
  return { started: BOOT_TS, file_mtime: fileMtime, dist_mtime: distMtime, stale: fileMtime > BOOT_TS + 5000, pm2: !!process.env.pm_id }
}
api.get('/version', (_req, res) => res.json(serverVersion()))
api.get('/line/webhook', (_req, res) => res.json({ ok: true, hint: 'ตั้ง URL นี้ในหน้า LINE Developers → Messaging API → Webhook URL' }))
api.post('/line/webhook', async (req, res) => {
  if (!lineSignatureOk(req)) return res.status(403).json({ error: 'ลายเซ็นไม่ถูกต้อง' })
  res.json({ ok: true }) // ตอบ LINE ทันที (ต้องตอบใน 1 วิ) แล้วค่อยประมวลผล
  try {
    const events = Array.isArray(req.body?.events) ? req.body.events : []
    const token = getSetting('line_token', '')
    let seen = lineSeen()
    for (const ev of events) {
      const src = ev.source || {}
      const type = src.type, id = src.groupId || src.roomId || src.userId
      if (!type || !id) continue
      const text = ev.type === 'message' && ev.message?.type === 'text' ? String(ev.message.text || '').trim() : ''
      // แชทส่วนตัวกับบอท = ผูกบัญชี / สั่งงาน / รับงาน
      if (type === 'user' && text) { await handleLineUserMessage(id, text, ev.replyToken); continue }
      const name = await lineSourceName(type, id, token)
      seen = seen.filter((s) => s.id !== id)
      seen.unshift({ type, id, name, at: nowTS(), event: ev.type })
      // บอทเพิ่งถูกเชิญเข้ากลุ่ม (หรือมีคนพิมพ์ id ในกลุ่ม) → ตอบ ID กลับในกลุ่ม ให้ก็อปจากมือถือได้เลย
      if (token && ev.replyToken && (ev.type === 'join' || /^(id|ไอดี|group ?id)$/i.test(text))) {
        const label = type === 'group' ? 'Group ID' : 'Room ID'
        lineReply(ev.replyToken, `สวัสดีค่ะ บอท PPSD ERP พร้อมส่งสรุปเช้าแล้ว\n${label}:\n${id}\n\nนำ ID นี้ไปวางที่ ผู้ใช้งาน → แจ้งเตือน LINE (หรือกดเลือกจากรายการ "กลุ่มที่บอทเห็น")`)
      }
    }
    setSetting('line_seen', JSON.stringify(seen.slice(0, 20)))
  } catch (e) { console.error('line webhook:', e.message) }
})
api.post('/kiosk/punch', (req, res) => {
  const { emp_code, pin, kind } = req.body || {}
  const emp = db.prepare('SELECT * FROM employees WHERE code=?').get(emp_code)
  if (!emp) return res.status(404).json({ error: 'ไม่พบพนักงาน' })
  const bad = kioskPinCheck(emp_code, pin, emp)
  if (bad) return res.status(bad.code).json({ error: bad.error })
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

// ===== สิทธิ์รายโมดูล: แอดมินปิดการเข้าถึงบางส่วนของระบบต่อผู้ใช้แต่ละคนได้ (users.deny_mods) =====
// ค่าเริ่มต้น = สิทธิ์ตาม role เดิมทุกอย่าง · แอดมินปิดไม่ได้ (กันล็อกตัวเองออก)
const MODULE_PATHS = [
  // หมายเหตุ: หน้า 'ลงเวลา' (ตอกบัตร/attendance) ไม่อยู่ใต้ hr — ต้องใช้ได้เสมอ · BOQ อยู่ในหน้าบ้าน ไม่ใช่โมดูลขาย
  ['hr', [/^\/payroll/, /^\/employees/, /^\/salary-advances/, /^\/deductions/, /^\/ot(\/|$)/, /^\/leaves/, /^\/time-adjustments/]],
  ['accounting', [/^\/accounting/, /^\/journal/, /^\/gl\//, /^\/trial-balance/, /^\/accounts/, /^\/expenses/, /^\/petty-cash/, /^\/closing/, /^\/tax-summary/, /^\/income-statement/, /^\/balance-sheet/, /^\/cash-flow/, /^\/project-pnl/, /^\/ar-aging/, /^\/ap-aging/, /^\/reconcile/, /^\/cash-accounts/, /^\/acct-defaults/, /^\/assets/, /^\/export\/express/, /^\/efiling/, /^\/repair/]],
  // ใบจ่ายเงิน (payments) ใช้งานในหน้าจัดซื้อ → คุมด้วยโมดูลจัดซื้อ
  ['procurement', [/^\/purchase-requests/, /^\/purchase-orders/, /^\/pr-quotes/, /^\/goods-receipts/, /^\/payables/, /^\/payments/, /^\/vendors/, /^\/material-prices/, /^\/procurement/, /^\/stock/]],
  ['sales', [/^\/sales-docs/, /^\/customers/]],
  ['reports', [/^\/reports/]],
]
// เส้นทางอนุมัติ/ปฏิเสธ ระบุโมดูลตามชนิดเอกสาร (ไม่งั้นคนถูกปิดโมดูลยังอนุมัติเอกสารของโมดูลนั้นได้)
const APPROVAL_DOC_MODULE = { pr: 'procurement', po: 'procurement', payment: 'procurement', expense: 'accounting' }
export const MODULE_KEYS = MODULE_PATHS.map(([k]) => k)
api.use((req, res, next) => {
  const deny = req.user?.deny_mods
  if (!deny || !deny.length || req.user.role === 'admin') return next()
  for (const [key, pats] of MODULE_PATHS) {
    if (deny.includes(key) && pats.some((p) => p.test(req.path)))
      return res.status(403).json({ error: 'ผู้ดูแลปิดการเข้าถึงส่วนนี้สำหรับบัญชีของคุณ' })
  }
  const ap = req.path.match(/^\/(approve|reject|approvals)\/([a-z]+)/)
  if (ap && deny.includes(APPROVAL_DOC_MODULE[ap[2]] || ''))
    return res.status(403).json({ error: 'ผู้ดูแลปิดการเข้าถึงส่วนนี้สำหรับบัญชีของคุณ' })
  next()
})

// ===== เลขรันเอกสารถาวร (กันเลขซ้ำ) — COUNT(*) เดิมชนกันได้เมื่อมีการลบ/ล้างข้อมูล =====
// initFn ให้ค่าตั้งต้นครั้งแรก (ต่อจากเลขสูงสุดที่มีอยู่จริง) — จากนั้นตัวนับเดินหน้าอย่างเดียว ไม่ย้อนไม่ซ้ำ
const nextSeq = db.transaction((key, initFn) => {
  let row = db.prepare('SELECT next FROM doc_counters WHERE key=?').get(key)
  if (!row) {
    const start = Math.max(0, Number(initFn?.() || 0)) + 1
    db.prepare('INSERT INTO doc_counters (key, next) VALUES (?,?)').run(key, start)
    row = { next: start }
  }
  db.prepare('UPDATE doc_counters SET next = next + 1 WHERE key=?').run(key)
  return row.next
})
// เลขท้ายสูงสุดของเอกสารที่มีอยู่ (ใช้ตั้งต้นตัวนับครั้งแรก)
function maxNoSuffix(table) {
  let max = 0
  try {
    for (const r of db.prepare(`SELECT no FROM ${table}`).all()) {
      const m = String(r.no || '').match(/(\d+)$/)
      if (m) max = Math.max(max, Number(m[1]))
    }
  } catch { /* ignore */ }
  return max
}

// roles allowed to create/edit operational records (everyone except read-only viewer)
const canWrite = requireRole('admin', 'accounting', 'site')
const financeOnly = requireRole('admin', 'accounting')
const adminOnly = requireRole('admin')

// ---------- ชั้นควบคุมภายใน / กันโกง (Internal Control) ----------
// ค่าตั้งต้นของกติกาควบคุม (admin แก้ได้ในหน้า "ตรวจสอบ")
const CONTROL_DEFAULTS = {
  block_self_approve: true, // ห้ามอนุมัติใบขอซื้อที่ตัวเองเป็นผู้ขอ
  approvers_pr: 1, // จำนวนผู้อนุมัติใบขอซื้อ (PR) — คนเดียวพอ (1–3)
  approvers_required: 3, // จำนวนผู้อนุมัติที่ต้องกดอนุมัติ (1–3) สำหรับ PO/ใบจ่ายเงิน/ใบจ่ายค่าใช้จ่าย
  overprice_warn_pct: 10, // เตือนเมื่อราคาต่อหน่วยสูงกว่าราคากลางเกินกี่ % (0 = ปิดการเตือน)
  receipt_price_tol_pct: 2, // ตรวจรับของ: ราคา PO กับใบส่งของต่างกันได้ไม่เกินกี่ % ถึงถือว่าตรง (กันปัดเศษ)
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
  enforce_approval_flow: true, // บล็อก: ต้องอนุมัติ PR ครบก่อนออก PO และอนุมัติ PO ครบก่อนตรวจรับของ
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
// จำนวนผู้อนุมัติที่ต้องครบ — ใบขอซื้อ (PR) แยกจากเอกสารเงิน (PO/จ่ายเงิน): PR คนเดียวพอ
function approversRequired(docType) {
  const c = controls()
  const n = docType === 'pr' ? (Number(c.approvers_pr) || 1) : (Number(c.approvers_required) || 3)
  return Math.max(1, Math.min(3, n))
}
function approvalSteps(docType, docId) { return db.prepare('SELECT * FROM doc_approvals WHERE doc_type=? AND doc_id=? ORDER BY step, id').all(docType, Number(docId)) }
function approvalState(docType, docId) {
  const steps = approvalSteps(docType, docId)
  const rejected = steps.find((s) => s.decision === 'reject')
  const approvals = steps.filter((s) => s.decision === 'approve')
  const required = approversRequired(docType)
  return { required, count: approvals.length, approvals: approvals.map((a) => ({ step: a.step, approver: a.approver, sig: a.approver_sig, role: a.role, date: a.date, note: a.note })), rejected: !!rejected, rejectedBy: rejected?.approver, rejectNote: rejected?.note, done: !rejected && approvals.length >= required }
}
function setDocStatus(docType, docId, status) {
  const cfg = APPROVE_DOCS[docType]; if (!cfg || cfg.noStatus) return
  try { db.prepare(`UPDATE ${cfg.table} SET status=? WHERE id=?`).run(status, Number(docId)) } catch { /* บางตารางไม่มี status */ }
}
function doApprove(docType, docId, req) {
  const cfg = APPROVE_DOCS[docType]; if (!cfg) throw { code: 400, msg: 'ประเภทเอกสารไม่ถูกต้อง' }
  const doc = db.prepare(`SELECT * FROM ${cfg.table} WHERE id=?`).get(Number(docId)); if (!doc) throw { code: 404, msg: 'ไม่พบเอกสาร' }
  const me = { ...db.prepare('SELECT name, role FROM users WHERE id=?').get(req.user.id), signature: sigOfUser(req.user.id) }
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
  const me = { ...db.prepare('SELECT name, role FROM users WHERE id=?').get(req.user.id), signature: sigOfUser(req.user.id) }
  const st = approvalState(docType, docId)
  if (st.rejected) throw { code: 409, msg: 'ถูกปฏิเสธแล้ว' }
  db.prepare('INSERT INTO doc_approvals (doc_type,doc_id,step,decision,approver,approver_sig,role,note,date,ts) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(docType, Number(docId), st.approvals.length + 1, 'reject', me.name, me.signature || null, me.role || '', req.body?.note || '', todayTH(), nowTS())
  setDocStatus(docType, docId, 'ปฏิเสธ')
  // ปฏิเสธแล้ว = เอกสารเป็นโมฆะ → ถอนรายการบัญชีที่ลงไว้ตอนสร้างออกด้วย ไม่งั้นยอดค้างอยู่ในบัญชีตลอด
  try {
    if (docType === 'payment') acct.removeAutoJournal('pay', Number(docId))
    if (docType === 'expense' && !doc.po_id) acct.removeAutoJournal('exp', Number(docId)) // รายจ่ายจาก PO ให้ยกเลิกที่การรับของแทน
  } catch (e) {
    console.error('remove journal on reject failed:', e.message)
    logJournalIssue(docType === 'payment' ? 'pay' : 'exp', Number(docId), `ปฏิเสธ ${doc.no || docId} แต่ถอนบัญชีไม่สำเร็จ`, e)
  }
  audit(req, `ปฏิเสธ ${cfg.label}`, doc.no || String(docId))
  return approvalState(docType, docId)
}
const attachApproval = (docType) => (r) => r ? { ...r, approval: approvalState(docType, r.id) } : r
// กติกาจำนวนผู้อนุมัติเปลี่ยน (เช่น 3 → 1) → เอกสารที่ "รออนุมัติ" แต่ตอนนี้นับว่าครบแล้ว ต้องเปลี่ยนสถานะเป็น "อนุมัติ" ให้ตรง
// (เรียกตอนบูต และหลังแก้กติกาในหน้าตรวจสอบ) — ไม่แตะเอกสารที่ถูกปฏิเสธ
function syncApprovalStatuses() {
  let n = 0
  for (const [docType, cfg] of Object.entries(APPROVE_DOCS)) {
    if (cfg.noStatus) continue
    let rows = []
    try { rows = db.prepare(`SELECT id, status FROM ${cfg.table} WHERE status='รออนุมัติ'`).all() } catch { continue }
    for (const r of rows) {
      const st = approvalState(docType, r.id)
      if (st.done) { setDocStatus(docType, r.id, 'อนุมัติ'); n++ }
    }
  }
  if (n) console.log(`[approvals] ซิงก์สถานะเอกสารที่อนุมัติครบตามกติกาใหม่ ${n} ใบ`)
  return n
}
// กันโกงแบบ "บล็อกจริง" ตอนออก PO — คืนข้อความถ้าถูกบล็อก, หรือ null ถ้าผ่าน
function poBlockReason(b, ctrl) {
  const amount = Number(b.amount) || 0
  const pr = b.pr_no ? db.prepare('SELECT * FROM purchase_requests WHERE no=?').get(b.pr_no) : null
  // 0) โหมดเต็มรูปแบบ: PO ทุกใบต้องอ้างอิง PR ที่อนุมัติครบ (เดิมไม่กรอก pr_no = ข้ามกติกาได้เลย)
  if (ctrl.enforce_approval_flow && !pr)
    return b.pr_no
      ? `ออก PO ไม่ได้ — ไม่พบใบขอซื้อ ${b.pr_no}`
      : 'ออก PO ไม่ได้ — โหมดจัดซื้อเต็มรูปแบบต้องอ้างอิงใบขอซื้อ (PR) ที่อนุมัติแล้วทุกใบ (ปิดกติกานี้ได้ที่หน้า ตรวจสอบ → กติกา)'
  if (ctrl.enforce_approval_flow && pr && !approvalState('pr', pr.id).done)
    return `ออก PO ไม่ได้ — ใบขอซื้อ ${pr.no} ยังไม่ได้รับอนุมัติครบ (ให้อนุมัติ PR ก่อน)`
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
  audit(req, 'เพิ่มงวดงาน', `${req.params.code} งวด ${b.no || '-'} ${baht(Number(b.amount) || 0)} (${side === 'contractor' ? 'ช่าง' : 'ลูกค้า'})`)
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
// ===== AI (Claude) — ใช้ร่วมกันทุกจุดที่ให้ AI อ่านเอกสาร (ใบส่งของ / สัญญางวดงาน) =====
// รุ่นที่เลือกได้ในหน้า ผู้ใช้งาน → ตั้งค่า AI · รุ่นเก่าตระกูล claude-3 ถูกปลดแล้ว → บังคับเป็นรุ่นปัจจุบัน
const AI_MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5 — แม่นที่สุด (แนะนำ)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 — เร็ว/ประหยัดกว่า' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — ถูกที่สุด' },
]
const AI_DEFAULT_MODEL = 'claude-opus-5'
function aiModel() {
  const m = String(getSetting('ai_model', '') || '').trim()
  return !m || /^claude-3/.test(m) || /-latest$/.test(m) ? AI_DEFAULT_MODEL : m
}
const aiKey = () => getSetting('ai_api_key', '') || process.env.ANTHROPIC_API_KEY || ''
const AI_NO_KEY = 'ยังไม่ได้ตั้งค่ากุญแจ AI — ผู้ดูแลระบบตั้งได้ที่เมนู ผู้ใช้งาน → ตั้งค่า AI'
// ส่งรูป/PDF + คำสั่งให้ Claude แล้วคืนข้อความตอบ (media = content block รูปหรือเอกสาร, หรือ null ถ้ามีแต่ข้อความ)
// รุ่น Opus 5 / Sonnet 5 "คิด" ก่อนตอบและใช้ token ส่วนนั้นจาก max_tokens ด้วย → ต้องเผื่อ max_tokens ให้พอ
// และตั้ง effort ต่ำสำหรับงานอ่านเอกสาร (ไม่งั้นคิดนานและกิน token จนไม่เหลือให้ตอบ) — Haiku 4.5 ไม่รับ effort
async function aiAsk({ media, prompt, maxTokens = 16000, key = aiKey(), model = aiModel() }) {
  if (!key) return { ok: false, error: AI_NO_KEY, code: 400 }
  const content = media ? [media, { type: 'text', text: prompt }] : [{ type: 'text', text: prompt }]
  const body = { model, max_tokens: maxTokens, messages: [{ role: 'user', content }] }
  if (!/haiku/.test(model)) body.output_config = { effort: 'low' }
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, code: 502, error: 'AI: ' + (data?.error?.message || ('HTTP ' + r.status)), model }
    if (data.stop_reason === 'refusal') return { ok: false, code: 502, error: 'AI ปฏิเสธคำขอนี้ (' + (data.stop_details?.category || 'refusal') + ')', model }
    const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text || '').join('')
    if (!text && data.stop_reason === 'max_tokens') return { ok: false, code: 502, error: 'AI ใช้ token หมดก่อนตอบ (เอกสารยาวเกินไป) — ลองถ่ายเฉพาะส่วนรายการสินค้า', model }
    return { ok: true, text, model }
  } catch (e) { return { ok: false, code: 502, error: 'เรียก AI ไม่สำเร็จ: ' + e.message, model } }
}
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
  if (!aiKey()) return res.status(400).json({ error: AI_NO_KEY + ' — หรือใช้วิธี “วางจาก Excel” แทนได้' })
  const buf = req.body
  if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'ไฟล์ไม่ถูกต้อง' })
  const mime = String(req.query.mime || 'application/pdf')
  const b64 = buf.toString('base64')
  const media = mime.includes('pdf')
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: mime.startsWith('image/') ? mime : 'image/jpeg', data: b64 } }
  const ai = await aiAsk({ media, prompt: EXTRACT_PROMPT })
  if (!ai.ok) return res.status(ai.code || 502).json({ error: ai.error })
  const parsed = extractJsonBlock(ai.text)
  const items = (parsed?.installments || parsed || []).map((it, i) => ({ no: Number(it.no) || i + 1, detail: String(it.detail || ''), amount: Number(String(it.amount).toString().replace(/,/g, '')) || 0, side: it.side === 'contractor' ? 'contractor' : 'customer', due_iso: /^\d{4}-\d{2}-\d{2}$/.test(String(it.due_iso || '')) ? it.due_iso : '' }))
  audit(req, 'AI อ่านงวดงานจากสัญญา', `${req.params.code} ${items.length} งวด`)
  res.json({ items })
})
// ตั้งค่ากุญแจ AI (admin) — เก็บใน settings · เลือกรุ่นได้ · ปุ่มทดสอบยิงคำถามสั้นๆ เช็คว่ากุญแจใช้ได้จริง
api.get('/ai-settings', adminOnly, (_req, res) => res.json({ hasKey: !!aiKey(), model: aiModel(), models: AI_MODELS, fromEnv: !getSetting('ai_api_key', '') && !!process.env.ANTHROPIC_API_KEY }))
api.post('/ai-settings', adminOnly, (req, res) => {
  if (req.body?.api_key != null) setSetting('ai_api_key', String(req.body.api_key || '').trim())
  if (req.body?.model) setSetting('ai_model', AI_MODELS.some((m) => m.id === req.body.model) ? String(req.body.model) : AI_DEFAULT_MODEL)
  audit(req, 'ตั้งค่า AI', aiModel())
  res.json({ ok: true, hasKey: !!aiKey(), model: aiModel() })
})
api.post('/ai-settings/test', adminOnly, async (_req, res) => {
  const t0 = Date.now()
  const ai = await aiAsk({ media: null, prompt: 'ตอบสั้นๆ คำเดียวว่า "พร้อมใช้งาน"', maxTokens: 400 })
  if (!ai.ok) return res.status(ai.code || 502).json({ error: ai.error, model: ai.model })
  res.json({ ok: true, model: ai.model, reply: String(ai.text || '').trim().slice(0, 80), ms: Date.now() - t0 })
})
// edit an installment (รายละเอียด/วัน/กำหนด/จำนวนเงิน/สถานะ)
api.put('/installments/:id', canWrite, (req, res) => {
  const inst = db.prepare('SELECT * FROM installments WHERE id=?').get(req.params.id)
  if (!inst) return res.status(404).json({ error: 'ไม่พบงวดงาน' })
  const b = req.body || {}
  const f = (k, num) => (b[k] != null && b[k] !== '' ? (num ? Number(b[k]) : b[k]) : inst[k])
  const dueIso = /^\d{4}-\d{2}-\d{2}$/.test(String(b.due_iso || '')) ? b.due_iso : inst.due_iso
  const dueDisp = b.due != null && b.due !== '' ? b.due : (dueIso && (!inst.due || inst.due === 'กำหนดใหม่' || b.due_iso) ? thDateFromISO(dueIso) : inst.due)
  // กันข้อมูลแย้งกันเอง: ลดมูลค่างวดต่ำกว่ายอดที่เก็บ/จ่ายแล้วไม่ได้ · สถานะต้องตรงกับยอดจริง
  const newAmount = f('amount', true)
  const paid = inst.paid || 0
  if (newAmount < paid) return res.status(400).json({ error: `มูลค่างวดต่ำกว่ายอดที่${inst.side === 'contractor' ? 'จ่าย' : 'เก็บ'}ไปแล้ว (${baht(paid)}) — ยกเลิกการเก็บก่อนจึงลดมูลค่าได้` })
  // สถานะไม่ให้แก้มือสวนยอดเงิน (เดิมตั้ง "เก็บแล้ว" ได้ทั้งที่ยังไม่เก็บ → ยอดบ้าน/บัญชีไม่ลง)
  // มีการเก็บ/จ่ายแล้ว → สถานะคิดจากยอดเสมอ · ยังไม่เก็บ → แก้สถานะอื่นได้ ยกเว้นสถานะที่แปลว่ามีเงินแล้ว (ต้องกดเก็บเงินจริง)
  const MONEY_STATUSES = ['เก็บแล้ว', 'จ่ายแล้ว', 'เก็บบางส่วน', 'จ่ายบางส่วน']
  const wanted = f('status')
  const newStatus = paid > 0 ? instStatus(inst.side, newAmount, paid) : (MONEY_STATUSES.includes(wanted) ? inst.status : wanted)
  db.prepare('UPDATE installments SET no=?, detail=?, days=?, due=?, due_iso=?, amount=?, status=?, contractor=? WHERE id=?')
    .run(f('no', true), f('detail'), String(f('days')), dueDisp, dueIso, newAmount, newStatus, f('contractor'), inst.id)
  recomputeHouse(inst.house_code)
  try { acct.syncInstallmentJournal(db.prepare('SELECT * FROM installments WHERE id=?').get(inst.id)) } catch (e) { console.error('journal(inst-edit):', e.message); logJournalIssue('inst', inst.id, `งวด ${inst.no} ${inst.house_code || ''}`, e) }
  audit(req, 'แก้ไขงวดงาน', `${inst.house_code} งวด ${inst.no}`)
  res.json(db.prepare('SELECT * FROM installments WHERE id=?').get(inst.id))
})
api.delete('/installments/:id', canWrite, (req, res) => {
  const inst = db.prepare('SELECT * FROM installments WHERE id=?').get(req.params.id)
  if (!inst) return res.status(404).json({ error: 'ไม่พบงวดงาน' })
  // ถอนรายการบัญชีให้สำเร็จก่อน แล้วค่อยลบงวด — กันบัญชีค้างโดยไม่มีเอกสารต้นทาง
  try { acct.removeAutoJournal('inst', inst.id) }
  catch (e) { return res.status(400).json({ error: 'ลบไม่ได้ — ถอนรายการบัญชีของงวดนี้ไม่สำเร็จ (' + e.message + ')' }) }
  db.prepare('DELETE FROM installments WHERE id=?').run(inst.id)
  recomputeHouse(inst.house_code)
  audit(req, 'ลบงวดงาน', `${inst.house_code} งวด ${inst.no}`)
  res.json({ ok: true })
})
// ซ่อมครั้งเดียว: งวดที่มียอดเก็บ/จ่ายจริง (paid > 0) แต่สถานะไม่ตรงยอด → ตั้งตามยอด (ยอดเงินคือความจริง)
try {
  backfillSignatures()
  syncApprovalStatuses()
  // รุ่น AI เก่า (claude-3-*) ถูกปลดจาก API แล้ว → เปลี่ยนเป็นรุ่นปัจจุบัน
  if (getSetting('ai_model', '') && aiModel() !== getSetting('ai_model', '')) { setSetting('ai_model', aiModel()); console.log('[ai] เปลี่ยนรุ่น AI เป็น ' + aiModel()) }
  if (getSetting('inst_status_sync_v1', '') !== '1') {
    let fixed = 0
    for (const i of db.prepare('SELECT * FROM installments WHERE COALESCE(paid,0) > 0').all()) {
      const want = instStatus(i.side, i.amount, i.paid)
      if (i.status !== want) { db.prepare('UPDATE installments SET status=? WHERE id=?').run(want, i.id); fixed++ }
    }
    setSetting('inst_status_sync_v1', '1')
    if (fixed) console.log(`  ซ่อมสถานะงวดงานตามยอดเงินจริง: ${fixed} งวด`)
  }
} catch (e) { console.error('inst status sync:', e.message) }
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
  try { acct.syncInstallmentJournal(db.prepare('SELECT * FROM installments WHERE id=?').get(inst.id)) } catch (e) { console.error('journal(collect):', e.message); logJournalIssue('inst', inst.id, `งวด ${inst.no} ${inst.house_code || ''}`, e) }
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
  try { acct.syncInstallmentJournal(db.prepare('SELECT * FROM installments WHERE id=?').get(inst.id)) } catch (e) { console.error('journal(pay):', e.message); logJournalIssue('inst', inst.id, `งวดช่าง ${inst.no} ${inst.house_code || ''}`, e) }
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
  // "เลยกำหนด" คิดสดจาก due_iso — ยังไม่เก็บ/จ่ายครบ + เลยวันครบกำหนด
  const today = todayISO()
  res.json(rows.map((r) => ({
    ...r,
    overdue: r.status !== 'เก็บแล้ว' && !!r.due_iso && r.due_iso < today && (r.paid || 0) < (r.amount || 0),
  })))
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
  const { house_code, item, cat, vendor, amount, date, vat_amount, tax_invoice_no } = req.body || {}
  if (!item) return res.status(400).json({ error: 'กรุณากรอกรายการ' })
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : todayISO()
  // ภาษีซื้อจากใบกำกับจริง — ต้องไม่เกินยอดรวม (ยอดรวมถือเป็นราคารวม VAT แล้ว)
  const vat = Math.max(0, Number(vat_amount) || 0)
  if (vat > (Number(amount) || 0)) return res.status(400).json({ error: 'ยอด VAT มากกว่ายอดรวม — ตรวจตัวเลขอีกครั้ง' })
  const info = db
    .prepare('INSERT INTO expenses (date,house_code,item,cat,vendor,amount,date_iso,vat_amount,tax_invoice_no) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(thDateFromISO(iso), house_code || '', item, cat || 'อื่นๆ', vendor || '', Number(amount) || 0, iso, vat, String(tax_invoice_no || '').trim())
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid)
  try { acct.syncExpenseJournal(row) } catch (e) { console.error('journal(expense):', e.message); logJournalIssue('exp', row.id, row.item || 'รายจ่าย', e) }
  audit(req, 'บันทึกรายจ่าย', `${row.item} ${baht(row.amount)}${row.house_code ? ' (' + row.house_code + ')' : ''}`)
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
api.post('/closing/lock', financeOnly, (req, res) => {
  const d = req.body?.date || ''
  // ล็อกได้เฉพาะอดีต — ล็อกถึงวันนี้/อนาคตจะทำให้ทุกการรับของ/จ่ายเงินวันนี้ลงบัญชีไม่ได้แบบเงียบๆ
  if (d && d >= todayISO()) return res.status(400).json({ error: 'ปิดงวดได้ถึงเมื่อวานเท่านั้น — ล็อกถึงวันนี้/อนาคตจะทำให้รายการใหม่ลงบัญชีไม่ได้' })
  acct.setClosedThrough(d); audit(req, 'ปิดงวดบัญชี', d || 'ยกเลิกล็อก'); res.json({ ok: true, closedThrough: acct.closedThrough() })
})
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
  try { const r = acct.retroPostAll(); audit(req, 'สร้างบัญชีจากข้อมูลเดิม', `${r.n} รายการ${r.errors.length ? ' · ข้าม ' + r.errors.length : ''}`); res.json({ ok: true, count: r.n, errors: r.errors }) }
  catch (e) { res.status(500).json({ error: e.message }) }
})
// ===== เครื่องมือซ่อมข้อมูลเก่า (เลขเพี้ยนจากยุคก่อนแก้บั๊ก) =====
// เติมภาษีซื้อย้อนหลัง: รายจ่าย/PO เก่าที่ยังไม่มียอด VAT และซื้อจาก "ผู้ขายที่จด VAT" → คิด 7/107 จากยอดรวมให้
// (ติ๊กว่าใครจด VAT ได้ที่แท็บผู้ขาย — ตัวเลขที่เติมเป็นการประมาณตามราคารวม VAT ตรวจกับใบจริงได้ภายหลัง)
api.post('/accounting/backfill-vat', financeOnly, (req, res) => {
  const vatVendors = db.prepare('SELECT name FROM vendors WHERE vat_registered=1').all().map((v) => v.name)
  if (!vatVendors.length) return res.status(400).json({ error: 'ยังไม่ได้ติ๊กผู้ขายที่จด VAT — ไปที่ จัดซื้อ → แท็บผู้ขาย ติ๊กคอลัมน์ "จด VAT" ก่อน' })
  const r2v = (x) => Math.round(x * 100) / 100
  let expN = 0, poN = 0
  db.transaction(() => {
    for (const e of db.prepare(`SELECT id, amount FROM expenses WHERE COALESCE(vat_amount,0)=0 AND COALESCE(amount,0)>0 AND vendor IN (${vatVendors.map(() => '?').join(',')})`).all(...vatVendors)) {
      db.prepare('UPDATE expenses SET vat_amount=? WHERE id=?').run(r2v(e.amount * 7 / 107), e.id)
      expN++
    }
    for (const p of db.prepare(`SELECT id, amount FROM purchase_orders WHERE COALESCE(vat_amount,0)=0 AND COALESCE(amount,0)>0 AND vendor IN (${vatVendors.map(() => '?').join(',')})`).all(...vatVendors)) {
      db.prepare('UPDATE purchase_orders SET vat_amount=? WHERE id=?').run(r2v(p.amount * 7 / 107), p.id)
      poN++
    }
  })()
  audit(req, 'เติมภาษีซื้อย้อนหลัง (7/107 ตามผู้ขายที่จด VAT)', `รายจ่าย ${expN} ใบ · PO ${poN} ใบ`)
  res.json({ ok: true, expenses: expN, pos: poN, vendors: vatVendors.length })
})
// งวดงานที่ "สถานะกับยอดเงินแย้งกัน" (ข้อมูลยุคเก่า): สถานะบอกเก็บแล้วแต่ paid ไม่ครบ
// ให้คนตัดสิน: ยืนยันว่าเก็บจริง (ตั้งยอด+ลงบัญชี) หรือ ยังไม่เก็บ (แก้สถานะตามยอดจริง)
const MONEY_STATUSES_SRV = ['เก็บแล้ว', 'จ่ายแล้ว', 'เก็บบางส่วน', 'จ่ายบางส่วน']
api.get('/repair/installments', financeOnly, (_req, res) => {
  const rows = db.prepare(`SELECT i.*, h.name AS house FROM installments i LEFT JOIN houses h ON h.code=i.house_code
    WHERE i.status IN (${MONEY_STATUSES_SRV.map(() => '?').join(',')}) AND COALESCE(i.paid,0) < COALESCE(i.amount,0) ORDER BY i.house_code, i.no`).all(...MONEY_STATUSES_SRV)
  res.json(rows)
})
api.post('/repair/installments/:id', financeOnly, (req, res) => {
  const inst = db.prepare('SELECT * FROM installments WHERE id=?').get(req.params.id)
  if (!inst) return res.status(404).json({ error: 'ไม่พบงวดงาน' })
  const action = req.body?.action
  if (action === 'confirm') {
    // เก็บ/จ่ายจริงแล้ว → ตั้งยอดเต็ม + ลงบัญชี (วันที่วันนี้ — เงินเก่าไม่มีวันที่จริงบันทึกไว้)
    db.prepare('UPDATE installments SET paid=?, status=? WHERE id=?').run(inst.amount, instStatus(inst.side, inst.amount, inst.amount), inst.id)
    recomputeHouse(inst.house_code)
    try { acct.syncInstallmentJournal(db.prepare('SELECT * FROM installments WHERE id=?').get(inst.id)) } catch (e) { logJournalIssue('inst', inst.id, `ซ่อมงวด ${inst.no} ${inst.house_code || ''}`, e) }
    audit(req, 'ซ่อมงวดงาน: ยืนยันเก็บ/จ่ายแล้วจริง', `${inst.house_code} งวด ${inst.no} ${baht(inst.amount)}`)
  } else if (action === 'reset') {
    // ยังไม่เก็บจริง → สถานะกลับไปตามยอดเงินจริง (ตอนนี้)
    db.prepare('UPDATE installments SET status=? WHERE id=?').run(instStatus(inst.side, inst.amount, inst.paid || 0), inst.id)
    recomputeHouse(inst.house_code)
    audit(req, 'ซ่อมงวดงาน: แก้สถานะตามยอดจริง', `${inst.house_code} งวด ${inst.no}`)
  } else return res.status(400).json({ error: 'action ต้องเป็น confirm หรือ reset' })
  res.json(db.prepare('SELECT * FROM installments WHERE id=?').get(inst.id))
})

// รายการที่ลงบัญชีไม่สำเร็จ (เช่น ติดงวดปิด) — โชว์แบนเนอร์เตือนหน้าบัญชี · หายเองเมื่อลงสำเร็จ
api.get('/accounting/journal-issues', financeOnly, (_req, res) =>
  res.json(db.prepare('SELECT * FROM journal_issues ORDER BY id DESC').all()))
api.delete('/accounting/journal-issues/:id', financeOnly, (req, res) => {
  db.prepare('DELETE FROM journal_issues WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})
// เช็คยอดเจ้าหนี้อัตโนมัติ: บัญชีแยกประเภท 2010 ต้องเท่ากับ ยอดค้างจ่ายรวมจาก PO เครดิต (ที่รับของแล้ว)
// ถ้าไม่ตรง = มีรายการเพี้ยน (ลงซ้ำ/หาย) — โชว์เตือนทันทีในแท็บค้างจ่าย + หน้าตรวจสอบ
function payablesCheck() {
  const gl = db.prepare("SELECT COALESCE(SUM(l.credit - l.debit),0) v FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE e.void=0 AND l.account='2010'").get().v
  let sub = 0
  for (const po of db.prepare("SELECT id, amount FROM purchase_orders WHERE payment_type='credit' AND status IN ('รับของแล้ว','ปิดงาน') AND COALESCE(amount,0)>0").all()) {
    const paid = db.prepare("SELECT COALESCE(SUM(gross),0) a FROM payments WHERE po_id=? AND COALESCE(status,'') != 'ปฏิเสธ'").get(po.id).a
    sub += Math.max(0, (po.amount || 0) - paid)
  }
  const glR = Math.round(gl * 100) / 100, subR = Math.round(sub * 100) / 100
  const diff = Math.round((glR - subR) * 100) / 100
  return { gl_2010: glR, payable_remaining: subR, diff, ok: Math.abs(diff) < 1 }
}
api.get('/payables/check', financeOnly, (_req, res) => res.json(payablesCheck()))
// สุขภาพระบบรวมจุดเดียว (แถบบนหน้าสรุป): บัญชีตรงไหม · มีอะไรค้าง · สำรองล่าสุดเมื่อไหร่
api.get('/health', (req, res) => {
  if (!(canSeeSalary(req.user) || isManager(req.user))) return res.status(403).json({ error: 'เฉพาะฝ่ายบัญชี/ผู้จัดการ' })
  const ap = payablesCheck()
  let backup = null
  try { backup = JSON.parse(getSetting('backup_last', '') || 'null') } catch { /* ignore */ }
  const backupOk = !!backup && backup.day >= isoDate(new Date(Date.now() - 2 * 86400000))
  let mirror = null
  try { mirror = JSON.parse(getSetting('backup_mirror_status', '') || 'null') } catch { /* ignore */ }
  res.json({
    ap_ok: ap.ok, ap_diff: ap.diff,
    journal_issues: db.prepare('SELECT COUNT(*) c FROM journal_issues').get().c,
    backup_day: backup?.day || null, backup_ok: backupOk,
    mirror_set: !!getSetting('backup_mirror_dir', ''), mirror_ok: mirror ? mirror.ok !== false : null,
    inst_mismatch: db.prepare(`SELECT COUNT(*) c FROM installments WHERE status IN (${MONEY_STATUSES_SRV.map(() => '?').join(',')}) AND COALESCE(paid,0) < COALESCE(amount,0)`).get(...MONEY_STATUSES_SRV).c,
    stock_low: db.prepare('SELECT COUNT(*) c FROM stock_items WHERE min_qty > 0 AND qty < min_qty').get().c,
  })
})

// ---------- HR ----------
// list excludes the PIN; includes signature + computed sso/tax for display
const EMP_COLS = 'id,code,name,role,dept,start,status,pay_type,base,ot,sso,tax,sick_quota,sick_used,personal_quota,personal_used,vacation_quota,vacation_used,signature,spouse,children,bank_name,bank_acct,tax_id,retention,student_loan,retention_opening,work_days,backup_code,prefix,nickname,no_sso'
api.get('/employees', (req, res) => {
  const rows = db.prepare(`SELECT ${EMP_COLS} FROM employees ORDER BY id`).all()
  const showSalary = canSeeSalary(req.user)
  res.json(rows.map((e) => {
    const has_pin = !!db.prepare('SELECT pin FROM employees WHERE id=?').get(e.id)?.pin
    // ผู้ใช้ที่ไม่มีสิทธิ์เงินเดือน: ซ่อนทั้งตัวเลขเงินเดือนและข้อมูลส่วนตัวอ่อนไหว (เลขบัตร/บัญชีธนาคาร/ลายเซ็น/ยอดหัก)
    if (!showSalary) return { ...e, base: null, ot: null, sso: null, tax: null, tax_id: null, bank_name: null, bank_acct: null, signature: null, retention: null, student_loan: null, retention_opening: null, has_pin }
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

api.post('/employees', requireSalary, (req, res) => {
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
  const noSso = b.no_sso ? 1 : 0
  const sso = noSso ? 0 : ssoOf(mBase)
  const spouse = b.spouse ? 1 : 0
  const children = Number(b.children) || 0
  // ภาษีกรอกเอง — ตอนสร้างใหม่ให้ค่าตั้งต้น (รายวัน=0, รายเดือนคิดให้เป็นค่าเริ่ม แก้ได้ในตาราง)
  const tax = b.tax != null && b.tax !== '' ? Number(b.tax) : (payType === 'รายวัน' ? 0 : taxMonthlyOf(mBase, sso, allowanceOf({ spouse, children })))
  const pinPlain = String(b.pin || Math.floor(1000 + Math.random() * 9000)) // 4-digit PIN; auto if blank
  const sig = typeof b.signature === 'string' && b.signature.startsWith('data:image/') ? b.signature : null
  const info = db
    .prepare(`INSERT INTO employees (code,name,role,dept,start,status,base,ot,sso,tax,pay_type,
              sick_quota,sick_used,personal_quota,personal_used,vacation_quota,vacation_used,pin,signature,spouse,children,bank_name,bank_acct,tax_id,retention,student_loan,retention_opening,work_days,backup_code,prefix,nickname,no_sso)
              VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(code, b.name, b.role || '', b.dept || b.role || '', b.start || todayTH(), b.status || 'ทดลองงาน',
      base, sso, tax, payType,
      Number(b.sick_quota) || 30, Number(b.sick_used) || 0,
      q.personal, Number(b.personal_used) || 0,
      q.vacation, Number(b.vacation_used) || 0, hashPin(pinPlain), sig, spouse, children,
      b.bank_name || '', b.bank_acct || '', b.tax_id || '',
      b.retention != null && b.retention !== '' ? Number(b.retention) : 500, Number(b.student_loan) || 0,
      b.retention_opening != null && b.retention_opening !== '' ? Number(b.retention_opening) : 0,
      Number(b.work_days) || 0, b.backup_code || '', b.prefix || '', b.nickname || '', noSso)
  audit(req, 'เพิ่มพนักงาน', b.name)
  const out = db.prepare(`SELECT ${EMP_COLS} FROM employees WHERE id=?`).get(info.lastInsertRowid)
  res.status(201).json({ ...out, pin: pinPlain }) // return the PIN once so it can be shown to the user
})
// edit an employee (recomputes sso/tax from the new base)
api.put('/employees/:id', requireSalary, (req, res) => {
  const e = db.prepare('SELECT * FROM employees WHERE id=?').get(req.params.id)
  if (!e) return res.status(404).json({ error: 'ไม่พบพนักงาน' })
  const b = req.body || {}
  const payType = b.pay_type === 'รายวัน' ? 'รายวัน' : b.pay_type === 'รายเดือน' ? 'รายเดือน' : e.pay_type
  const base = b.base != null && b.base !== '' ? Number(b.base) : e.base
  const spouse = b.spouse != null ? (b.spouse ? 1 : 0) : e.spouse
  const children = b.children != null && b.children !== '' ? Number(b.children) : e.children
  const mBase = monthlyBaseOf(base, payType)
  const noSso = b.no_sso != null ? (b.no_sso ? 1 : 0) : (e.no_sso || 0)
  const sso = noSso ? 0 : ssoOf(mBase)
  const tax = b.tax != null && b.tax !== '' ? Number(b.tax) : e.tax // ภาษีกรอกเอง — ไม่คิดใหม่จากฐานเงินเดือน
  const retention = b.retention != null && b.retention !== '' ? Number(b.retention) : e.retention
  const studentLoan = b.student_loan != null && b.student_loan !== '' ? Number(b.student_loan) : e.student_loan
  const retentionOpening = b.retention_opening != null && b.retention_opening !== '' ? Number(b.retention_opening) : e.retention_opening
  const workDays = b.work_days != null && b.work_days !== '' ? Number(b.work_days) : e.work_days
  const backupCode = b.backup_code != null ? b.backup_code : e.backup_code
  db.prepare('UPDATE employees SET name=?, role=?, dept=?, status=?, pay_type=?, base=?, sso=?, tax=?, spouse=?, children=?, bank_name=?, bank_acct=?, tax_id=?, retention=?, student_loan=?, retention_opening=?, work_days=?, backup_code=?, prefix=?, nickname=?, no_sso=? WHERE id=?')
    .run(b.name ?? e.name, b.role ?? e.role, b.dept ?? e.dept, b.status ?? e.status, payType, base, sso, tax, spouse, children,
      b.bank_name ?? e.bank_name, b.bank_acct ?? e.bank_acct, b.tax_id ?? e.tax_id, retention, studentLoan, retentionOpening, workDays, backupCode, b.prefix ?? e.prefix, b.nickname ?? e.nickname, noSso, e.id)
  audit(req, 'แก้ไขพนักงาน', b.name ?? e.name)
  res.json(db.prepare(`SELECT ${EMP_COLS} FROM employees WHERE id=?`).get(e.id))
})
// upload/replace an employee's signature
api.put('/employees/:id/signature', requireSalary, (req, res) => {
  const sig = req.body?.signature
  if (typeof sig !== 'string' || !sig.startsWith('data:image/')) return res.status(400).json({ error: 'ไฟล์ลายเซ็นไม่ถูกต้อง' })
  db.prepare('UPDATE employees SET signature=? WHERE id=?').run(sig, req.params.id)
  backfillSignatures()
  res.json({ ok: true })
})
// reset / set an employee's kiosk PIN
api.put('/employees/:id/pin', requireSalary, (req, res) => {
  const pin = String(req.body?.pin || '').trim()
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN ต้องเป็นตัวเลข 4 หลัก' })
  db.prepare('UPDATE employees SET pin=? WHERE id=?').run(hashPin(pin), req.params.id)
  res.json({ ok: true })
})
// remove an employee (e.g. resigned) — they drop out of payroll automatically
api.delete('/employees/:id', requireSalary, (req, res) => {
  db.prepare('DELETE FROM employees WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})
// ล้างพนักงานซ้ำ: รวมรายการที่ชื่อซ้ำกัน (จับคู่โดยไม่สน "คำนำหน้า" ที่ติดในชื่อ) ให้เหลือชื่อละ 1
// เก็บรายการที่ข้อมูลครบสุด + ย้ายรายการอ้างอิงมาให้ + แยกคำนำหน้าออกจากชื่อไปใส่ช่อง "คำนำหน้า"
const EMP_TITLES = ['นางสาว', 'นาง', 'นาย', 'น.ส.', 'ด.ช.', 'ด.ญ.', 'เด็กชาย', 'เด็กหญิง']
// สระ/วรรณยุกต์ที่เกาะตัวอักษรก่อนหน้า — ถ้าตัดคำนำหน้าแล้วเจอพวกนี้ แปลว่าไปตัดกลางชื่อจริง (เช่น "นายิกา") ห้ามตัด
const TH_COMBINING = /^[ัำ-ฺๅ็-๎]/
function splitTitle(raw) {
  const s = String(raw || '').trim().replace(/\s+/g, ' ')
  for (const t of EMP_TITLES) {
    if (!s.startsWith(t)) continue
    const rest = s.slice(t.length).trim()
    if (!rest || TH_COMBINING.test(rest)) continue // "นายิกา" → ไม่ใช่คำนำหน้า
    return { title: t === 'นางสาว' ? 'น.ส.' : t, rest }
  }
  return { title: '', rest: s }
}
function runEmpDedup() {
  const emps = db.prepare('SELECT * FROM employees').all()
  const groups = {}
  for (const e of emps) {
    const key = splitTitle(e.name).rest // จับกลุ่มด้วยชื่อที่ตัดคำนำหน้าออกแล้ว
    if (!key) continue
    ;(groups[key] = groups[key] || []).push(e)
  }
  const attCount = db.prepare('SELECT COUNT(*) c FROM attendance WHERE emp_code=?')
  const score = (e) => (Number(e.base) > 0 ? 1e9 : 0) + (e.bank_acct ? 1e6 : 0) + (attCount.get(e.code).c * 1e3) + (e.user_id ? 1e2 : 0) + (e.status !== 'ทดลองงาน' ? 10 : 0)
  const repoint = (dupCode, dupName, keepCode, keepName) => {
    for (const [t, cCol, nCol] of [['attendance', 'emp_code', 'emp_name'], ['leaves', 'emp_code', 'emp_name'], ['salary_advances', 'emp_code', 'emp_name'], ['deductions', 'emp_code', 'emp_name'], ['location_log', 'emp_code', 'emp_name'], ['pms_reviews', 'emp_code', 'emp_name'], ['ot', 'emp_code', 'name'], ['work_orders', 'executor_code', 'executor']]) {
      try { db.prepare(`UPDATE ${t} SET ${cCol}=?, ${nCol}=? WHERE ${cCol}=?`).run(keepCode, keepName, dupCode) } catch { /* บางตารางอาจไม่มีคอลัมน์ */ }
    }
    try { db.prepare('UPDATE time_adjustments SET emp_name=? WHERE emp_name=?').run(keepName, dupName) } catch { /* ignore */ }
    try { db.prepare('UPDATE ot SET name=? WHERE name=?').run(keepName, dupName) } catch { /* ignore */ }
    // แก้รหัสในประวัติงวดเงินเดือนที่ปิดแล้วด้วย — ไม่งั้นยอด retention สะสมของคนที่ถูกรวมจะหาย
    try {
      for (const r of db.prepare('SELECT period, data FROM payroll_runs').all()) {
        const rows = JSON.parse(r.data); let changed = false
        for (const p of rows) if (p.code === dupCode) { p.code = keepCode; p.name = keepName; changed = true }
        if (changed) db.prepare('UPDATE payroll_runs SET data=? WHERE period=?').run(JSON.stringify(rows), r.period)
      }
    } catch { /* ignore */ }
  }
  let mergedGroups = 0, removed = 0, tidied = 0, skippedReal = 0
  const detail = []
  db.transaction(() => {
    for (const [rest, list] of Object.entries(groups)) {
      list.sort((a, b) => score(b) - score(a) || a.id - b.id)
      const keep = list[0]
      let title = '' // คำนำหน้าของกลุ่ม — จากช่อง prefix หรือจากชื่อที่ติดคำนำหน้า
      for (const e of list) { const p = e.prefix || splitTitle(e.name).title; if (p) { title = p; break } }
      const removedCodes = []
      for (const d of list.slice(1)) {
        // ปลอดภัย: ไม่ลบตัวซ้ำที่ตั้งค่าครบ (มีเงินเดือน+บัญชี) — กันลบคนจริงโดยไม่ตั้งใจ เก็บไว้ให้ตรวจเอง
        if (Number(d.base) > 0 && d.bank_acct) { skippedReal++; continue }
        if (d.user_id && !keep.user_id) db.prepare('UPDATE employees SET user_id=? WHERE id=?').run(d.user_id, keep.id)
        repoint(d.code, d.name, keep.code, keep.name)
        db.prepare('DELETE FROM employees WHERE id=?').run(d.id)
        removed++; removedCodes.push(d.code)
      }
      if (removedCodes.length) { mergedGroups++; detail.push({ name: rest, kept: keep.code, removed: removedCodes }) }
      // เก็บชื่อให้สะอาด (ตัดคำนำหน้า) + ใส่คำนำหน้าในช่อง prefix
      const newPrefix = keep.prefix || title || ''
      if (rest !== keep.name || newPrefix !== (keep.prefix || '')) {
        db.prepare('UPDATE employees SET name=?, prefix=? WHERE id=?').run(rest, newPrefix, keep.id)
        for (const [t, cCol, nCol] of [['attendance', 'emp_code', 'emp_name'], ['leaves', 'emp_code', 'emp_name'], ['salary_advances', 'emp_code', 'emp_name'], ['deductions', 'emp_code', 'emp_name'], ['pms_reviews', 'emp_code', 'emp_name']]) {
          try { db.prepare(`UPDATE ${t} SET ${nCol}=? WHERE ${cCol}=?`).run(rest, keep.code) } catch { /* ignore */ }
        }
        tidied++
      }
    }
  })()
  return { mergedGroups, removed, tidied, skippedReal, detail }
}
// รวมพนักงานซ้ำอัตโนมัติครั้งเดียวตอนอัปเดต (แก้ข้อมูลเบิ้ลที่ค้างอยู่) — กดปุ่มซ้ำได้ภายหลัง
try {
  if (getSetting('emp_dedup_v2', '') !== '1') {
    const r = runEmpDedup()
    setSetting('emp_dedup_v2', '1')
    if (r.removed || r.tidied) console.log(`  รวมพนักงานซ้ำอัตโนมัติ: ลบ ${r.removed} · จัดชื่อ ${r.tidied}`)
  }
} catch (e) { console.error('emp dedup on boot failed:', e.message) }
api.post('/employees/dedup', adminOnly, (req, res) => {
  const r = runEmpDedup()
  audit(req, 'ล้างพนักงานซ้ำ', `รวม ${r.mergedGroups} ชื่อ · ลบ ${r.removed} · จัดชื่อ ${r.tidied}`)
  res.json({ ok: true, ...r })
})
// ---- Retention: หักสะสมเดือนละ (ค่าที่ตั้งไว้) จนครบเพดาน แล้วหยุดหักเอง ----
const RETENTION_CAP = 5000 // เพดานเงินประกันผลงานต่อคน
// ยอด retention ที่หักสะสมแล้ว "ก่อนงวด excludePeriod" = ยอดยกมา (พนักงานเก่า) + ผลรวมที่หักในทุกงวดที่ปิดแล้ว
// (ไม่รวมงวดที่กำลังคำนวณ เพื่อไม่ให้ปิดงวดซ้ำแล้วนับซ้ำ)
function retentionPaidBefore(empCode, opening, excludePeriod) {
  // นับเฉพาะงวดที่ปิดแล้ว "ก่อน" งวดที่คำนวณ (period เรียงเทียบเป็นข้อความได้ เพราะรูปแบบ YYYY-MM)
  const runs = db.prepare('SELECT period, data FROM payroll_runs WHERE period < ?').all(excludePeriod || '9999-99')
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
  const runs = db.prepare('SELECT data FROM payroll_runs WHERE period < ?').all(excludePeriod || '9999-99')
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
    // OT/วันลา นับ "เฉพาะของงวดนี้" (ตามวันที่ในรายการ) — ไม่งั้น OT เก่าจะถูกจ่ายซ้ำทุกเดือน
    const ot = db.prepare("SELECT date, amount FROM ot WHERE emp_code=? AND status='อนุมัติ'").all(e.code)
      .filter((r) => dateInPeriod(r.date, period)).reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const lvs = db.prepare("SELECT start_date, days, unpaid_days, status FROM leaves WHERE emp_code=? AND status IN ('อนุมัติ','ไม่อนุมัติ')").all(e.code)
      .filter((l) => dateInPeriod(l.start_date, period))
    const rejected = lvs.filter((l) => l.status === 'ไม่อนุมัติ').reduce((s, l) => s + (Number(l.days) || 0), 0)
    const unpaid = lvs.filter((l) => l.status === 'อนุมัติ').reduce((s, l) => s + (Number(l.unpaid_days) || 0), 0)
    const isDaily = e.pay_type === 'รายวัน'
    const exempt = NO_ATTENDANCE_ROLES.includes(e.role) // CEO / ผู้จัดการ ไม่ต้องลงเวลา
    // รายวัน (เช่น แม่บ้าน): เงิน = ค่าแรง/วัน × วันทำงานที่กรอก · ไม่หักขาด (จ่ายตามวันที่ทำจริง)
    // ผู้ได้รับยกเว้น (CEO/ผู้จัดการ): ไม่หักขาดงาน
    const dailyRate = e.base || 0
    const workDays = e.work_days || 0
    const basePay = isDaily ? dailyRate * workDays : (e.base || 0)
    const absent = (isDaily || exempt) ? 0 : absentDaysInMonth(e, period)
    const daily = isDaily ? dailyRate : Math.round((e.base || 0) / 30) // เงินเดือน ÷ 30 วัน = ค่าจ้าง/วัน (หักขาด/ลา)
    const deductDays = isDaily ? 0 : (rejected + unpaid + absent)
    // ประกันสังคมของรายวัน คิดจาก "รายได้จริงในงวด" (ค่าแรง×วันทำงาน) ไม่ใช่ค่าแรง×26
    // รายวัน "ไม่หักภาษี" (คิดเฉพาะประกันสังคม) — ภาษีเป็น 0
    const sso = e.no_sso ? 0 : (isDaily ? ssoOf(basePay) : e.sso)
    const tax = e.tax || 0 // ภาษีกรอกเอง (แก้ได้ในตารางเงินเดือน)
    // เบิกล่วงหน้าที่เบิกในงวดนี้ → หักคืนสิ้นเดือน
    const advance = db.prepare('SELECT COALESCE(SUM(amount),0) a FROM salary_advances WHERE emp_code=? AND period=?').get(e.code, period).a
    // หักอื่นๆ (พร้อมเหตุผล) ที่บันทึกในงวดนี้
    const otherDeduct = db.prepare('SELECT COALESCE(SUM(amount),0) a FROM deductions WHERE emp_code=? AND period=?').get(e.code, period).a
    // retention: หักเดือนละ (e.retention) แต่ไม่เกินเพดานที่เหลือ — ครบ 5,000 แล้วหักเป็น 0 เอง
    const opening = e.retention_opening || 0
    const paidBefore = retentionPaidBefore(e.code, opening, period)
    const monthly = e.retention ?? 0
    const retention = Math.max(0, Math.min(monthly, RETENTION_CAP - paidBefore))
    // อย่าให้ข้อมูลลับ (PIN/ลายเซ็น/โทเคน) หลุดไปติดใน snapshot เงินเดือน
    const { pin, signature, track_token, ...pub } = e
    return {
      ...pub, ot, sso, tax, base: basePay, leave_days: rejected + unpaid, absent_days: absent, leave_deduct: deductDays * daily,
      daily_rate: dailyRate, work_days: workDays, exempt_attendance: exempt, // ข้อมูลสำหรับแสดงผล (รายวัน/ยกเว้นลงเวลา)
      retention, student_loan: e.student_loan || 0, advance, other_deduct: otherDeduct,
      retention_cap: RETENTION_CAP, retention_opening: opening,
      retention_monthly: monthly, // ยอดที่ตั้งให้หักต่อเดือน (แก้ได้) — ต่างจาก retention ที่ถูกจำกัดด้วยเพดาน
      retention_paid: paidBefore + retention, // ยอดสะสมถึงงวดนี้ (รวมงวดนี้)
      retention_periods: retentionPeriodsBefore(e.code, opening, monthly, period) + (retention > 0 ? 1 : 0), // จำนวนงวดที่หักสะสมมาแล้ว (รวมงวดนี้)
    }
  })
}
const netOf = (p) => (p.base || 0) + (p.ot || 0) - (p.sso || 0) - (p.tax || 0) - (p.leave_deduct || 0) - (p.retention || 0) - (p.student_loan || 0) - (p.advance || 0) - (p.other_deduct || 0)

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
// ลงบัญชีแยกประเภทอัตโนมัติเมื่อปิดงวดเงินเดือน (บัญชีคู่ · idempotent ต่องวด)
// Dr 6010 เงินเดือน (ยอดที่ได้จริง) / Cr 2050 ปกส. · 2040 ภาษี · 2020 เงินประกัน · 2060 กยศ+หักอื่นๆ · ธนาคาร (จ่ายสุทธิ+เบิกล่วงหน้า)
function postPayrollJournal(period, rows, by) {
  const r2 = (x) => Math.round((x || 0) * 100) / 100
  const sum = (f) => rows.reduce((s, p) => s + (Number(f(p)) || 0), 0)
  const earned = r2(sum((p) => (p.base || 0) + (p.ot || 0) - (p.leave_deduct || 0)))
  const sid = Number(period.replace('-', ''))
  if (!(earned > 0)) { acct.removeAutoJournal('payroll', sid); return { posted: false } }
  const sso = r2(sum((p) => p.sso || 0)), tax = r2(sum((p) => p.tax || 0)), ret = r2(sum((p) => p.retention || 0))
  const slOther = r2(sum((p) => (p.student_loan || 0) + (p.other_deduct || 0)))
  const bank = r2(earned - sso - tax - ret - slOther) // = จ่ายสุทธิ + เบิกล่วงหน้าที่จ่ายไปแล้ว
  const label = periodLabelTH(period)
  const [yy, mm] = period.split('-').map(Number)
  const endIso = `${yy}-${String(mm).padStart(2, '0')}-${String(new Date(yy, mm, 0).getDate()).padStart(2, '0')}`
  const lines = [
    { account: '6010', debit: earned, credit: 0, memo: 'เงินเดือน/ค่าแรง ' + label },
    { account: '2050', debit: 0, credit: sso, memo: 'ประกันสังคมหักนำส่ง' },
    { account: '2040', debit: 0, credit: tax, memo: 'ภาษีหัก ณ ที่จ่ายค้างนำส่ง' },
    { account: '2020', debit: 0, credit: ret, memo: 'เงินประกันผลงานหักไว้' },
    { account: '2060', debit: 0, credit: slOther, memo: 'กยศ / หักอื่นๆ ค้างจ่าย' },
    { account: acct.defaultBank(), debit: 0, credit: bank, memo: 'จ่ายเงินเดือนสุทธิ (รวมเบิกล่วงหน้า)' },
  ]
  acct.postJournal({ date_iso: endIso, memo: 'ปิดงวดเงินเดือน ' + label, source: 'payroll', source_id: sid, by, lines })
  return { posted: true, expense: earned }
}
api.post('/payroll/close', financeOnly, (req, res) => {
  const period = /^\d{4}-\d{2}$/.test(req.body?.period) ? req.body.period : currentPeriod()
  const rows = computePayroll(period)
  // กันปิดงวดที่มีคน "เงินติดลบ" (ยอดหักรวมเกินเงินได้) — ต้องแก้ยอดหักก่อน
  const negatives = rows.filter((p) => netOf(p) < 0)
  if (negatives.length) return res.status(400).json({ error: `ปิดงวดไม่ได้ — เงินสุทธิติดลบ: ${negatives.map((p) => `${p.name} (${netOf(p).toLocaleString()})`).join(', ')} กรุณาปรับยอดหัก/เบิกให้ไม่เกินเงินได้ก่อน` })
  const total = rows.reduce((s, p) => s + netOf(p), 0)
  db.prepare('INSERT INTO payroll_runs (period,data,total,created,by) VALUES (?,?,?,?,?) ON CONFLICT(period) DO UPDATE SET data=excluded.data,total=excluded.total,created=excluded.created,by=excluded.by')
    .run(period, JSON.stringify(rows), total, todayTH(), req.user.name)
  let journal = null
  try { journal = postPayrollJournal(period, rows, req.user.name) } catch (e) { journal = { posted: false, error: e.message }; logJournalIssue('payroll', Number(period.replace('-', '')), 'ปิดงวดเงินเดือน ' + periodLabelTH(period), e) }
  audit(req, 'ปิดงวดเงินเดือน', `${periodLabelTH(period)}${journal?.posted ? ' · ลงบัญชีแล้ว' : ''}`)
  res.json({ ok: true, period, periodLabel: periodLabelTH(period), locked: true, rows, journal })
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
const ADVANCE_DAY_BASE = 30     // เงินเดือน ÷ 30 วัน = ค่าจ้าง/วัน
// เพดานเบิกล่วงหน้า: (จำนวนวันมาทำงาน "ตั้งแต่วันที่ 1 ถึงวันนี้/วันที่เบิก" × ค่าจ้าง/วัน) ÷ 2
function advanceLimit(emp, period) {
  const [yy, mm] = period.split('-').map(Number)
  const monthStart = isoDate(new Date(yy, mm - 1, 1))
  const monthEnd = isoDate(new Date(yy, mm, 0))
  const today = todayISO()
  const upTo = monthEnd < today ? monthEnd : today // นับได้ไม่เกินวันนี้ (วันที่เบิก)
  let worked
  if (NO_ATTENDANCE_ROLES.includes(emp.role)) {
    // ไม่ต้องลงเวลา (CEO/ผู้จัดการ) → ได้เงินเต็มโดยไม่ต้องตอกบัตร → นับวันทำงานตามปฏิทิน (จ.–ส. เว้นวันหยุดบริษัท) ตั้งแต่ต้นงวด/วันเริ่มงาน ถึงวันนี้
    let from = monthStart
    const empStart = emp.start && /^\d{4}-\d{2}-\d{2}$/.test(emp.start) ? emp.start : null
    if (empStart && empStart > from) from = empStart
    const holi = new Set(db.prepare('SELECT date FROM holidays WHERE date>=? AND date<=?').all(from, upTo).map((h) => h.date))
    let n = 0
    for (const d of eachDay(from, upTo)) { const wd = new Date(d + 'T00:00:00').getDay(); if (wd !== 0 && !holi.has(d)) n++ }
    worked = Math.min(n, ADVANCE_DAY_BASE) // ไม่เกินมาตรฐาน 30 วัน (เบิกได้ไม่เกินครึ่งเดือน)
  } else {
    // วันทำงาน = วันที่มีบัตรตอก + วันที่ปรับปรุงเวลาอนุมัติแล้ว (ลืมตอกแต่มาจริง) — ไม่นับซ้ำ
    const punchDates = new Set(db.prepare("SELECT DISTINCT date FROM attendance WHERE emp_code=? AND COALESCE(check_in,'')!='' AND date>=? AND date<=?").all(emp.code, monthStart, upTo).map((r) => r.date))
    for (const a of db.prepare("SELECT DISTINCT date FROM time_adjustments WHERE emp_name=? AND status='อนุมัติ' AND date>=? AND date<=?").all(emp.name, monthStart, upTo)) punchDates.add(a.date)
    worked = punchDates.size
    // รายวันที่ไม่ใช้เครื่องตอกบัตร (เช่น แม่บ้าน กรอกวันทำงานมือ) → ใช้วันทำงานที่กรอกไว้เป็นฐานเบิก
    if (worked === 0 && emp.pay_type === 'รายวัน' && (Number(emp.work_days) || 0) > 0)
      worked = Math.min(Number(emp.work_days) || 0, ADVANCE_DAY_BASE)
  }
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
// งวดที่ปิดแล้ว = snapshot ถูกล็อกไว้แล้ว — ห้ามบันทึกเบิก/หักย้อนเข้าไป (ยอดจะไม่ถูกหักจริง)
const periodClosed = (period) => !!db.prepare('SELECT 1 FROM payroll_runs WHERE period=?').get(period)
api.post('/salary-advances', financeOnly, (req, res) => {
  const b = req.body || {}
  const emp = db.prepare('SELECT * FROM employees WHERE code=?').get(b.emp_code)
  if (!emp) return res.status(404).json({ error: 'กรุณาเลือกพนักงาน' })
  const period = /^\d{4}-\d{2}$/.test(b.period) ? b.period : currentPeriod() // งวดที่เลือก (เช่น ปิดงวด ส.ค. ต้นเดือน ก.ย.)
  if (periodClosed(period)) return res.status(400).json({ error: `งวด ${periodLabelTH(period)} ปิดแล้ว — บันทึกเบิกเข้างวดนี้ไม่ได้ (จะไม่ถูกหักในเงินเดือน) กรุณาเลือกงวดที่ยังไม่ปิด` })
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
  if (a && periodClosed(a.period)) return res.status(400).json({ error: `งวด ${periodLabelTH(a.period)} ปิดแล้ว — ลบรายการเบิกของงวดที่ปิดไม่ได้` })
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

// ===== หักอื่นๆ ต่อคนต่องวด (พร้อมเหตุผล) → หักจากเงินเดือนงวดนั้น =====
api.get('/deductions', requireSalary, (req, res) => {
  const period = /^\d{4}-\d{2}$/.test(req.query.period) ? req.query.period : currentPeriod()
  res.json(db.prepare('SELECT * FROM deductions WHERE period=? ORDER BY id DESC').all(period))
})
api.post('/deductions', financeOnly, (req, res) => {
  const b = req.body || {}
  const emp = db.prepare('SELECT * FROM employees WHERE code=?').get(b.emp_code)
  if (!emp) return res.status(404).json({ error: 'กรุณาเลือกพนักงาน' })
  const period = /^\d{4}-\d{2}$/.test(b.period) ? b.period : currentPeriod()
  if (periodClosed(period)) return res.status(400).json({ error: `งวด ${periodLabelTH(period)} ปิดแล้ว — บันทึกหักเข้างวดนี้ไม่ได้ กรุณาเลือกงวดที่ยังไม่ปิด` })
  const amount = Number(b.amount) || 0
  if (amount <= 0) return res.status(400).json({ error: 'กรุณากรอกจำนวนเงินที่หัก' })
  const reason = String(b.reason || '').trim()
  if (!reason) return res.status(400).json({ error: 'กรุณากรอกเหตุผลการหัก' })
  const info = db.prepare('INSERT INTO deductions (emp_code,emp_name,period,date,amount,reason,by,created) VALUES (?,?,?,?,?,?,?,?)')
    .run(emp.code, emp.name, period, todayTH(), amount, reason, req.user.name, todayTH())
  audit(req, 'หักเงินอื่นๆ', `${emp.name} ${amount.toLocaleString()} บาท (${reason})`)
  res.status(201).json(db.prepare('SELECT * FROM deductions WHERE id=?').get(info.lastInsertRowid))
})
api.delete('/deductions/:id', financeOnly, (req, res) => {
  const d = db.prepare('SELECT * FROM deductions WHERE id=?').get(req.params.id)
  if (d && periodClosed(d.period)) return res.status(400).json({ error: `งวด ${periodLabelTH(d.period)} ปิดแล้ว — ลบรายการหักของงวดที่ปิดไม่ได้` })
  db.prepare('DELETE FROM deductions WHERE id=?').run(req.params.id)
  if (d) audit(req, 'ยกเลิกการหักอื่นๆ', `${d.emp_name} ${d.amount}`)
  res.json({ ok: true })
})

// สรุปเงินเดือนทั้งปี — รวมจ่ายสุทธิ + ประกันสังคมสะสม (จากงวดที่ปิดแล้ว)
api.get('/payroll/annual', requireSalary, (req, res) => {
  const year = /^\d{4}$/.test(req.query.year) ? req.query.year : String(new Date().getFullYear())
  const runs = db.prepare('SELECT period,total,data FROM payroll_runs WHERE period LIKE ? ORDER BY period').all(year + '-%')
  let net = 0, sso = 0, base = 0, tax = 0
  for (const r of runs) {
    // คำนวณสุทธิใหม่จาก snapshot รายคน (total ที่บันทึกไว้อาจมาจากสูตรเวอร์ชันเก่า)
    try { const rows = JSON.parse(r.data); for (const p of rows) { net += netOf(p); sso += p.sso || 0; base += p.base || 0; tax += p.tax || 0 } } catch { net += r.total || 0 }
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
  // ไฟล์โอนธนาคาร: เอาเฉพาะแถวที่โอนได้จริง (มีเลขบัญชี + ยอดสุทธิ > 0) — แถวที่เหลือหมายเหตุไว้ท้ายไฟล์
  const payable = rows.filter((p) => (p.bank_acct || '').trim() && netOf(p) > 0)
  const skipped = rows.filter((p) => !((p.bank_acct || '').trim() && netOf(p) > 0) && netOf(p) !== 0)
  const body = payable.map((p, i) => [i + 1, p.code || '', p.name || '', p.bank_name || '', p.bank_acct || '', netOf(p).toFixed(2), 'SALARY ' + period])
  const total = payable.reduce((s, p) => s + netOf(p), 0)
  const foot = ['', '', '', '', 'รวม', total.toFixed(2), payable.length + ' รายการ']
  if (skipped.length) foot.push('ข้าม (ไม่มีเลขบัญชี/ยอดผิดปกติ): ' + skipped.map((p) => p.name).join(' · '))
  const csv = '﻿' + [head, ...body, foot].map((r) => r.map(csvCell).join(',')).join('\r\n')
  audit(req, 'ดาวน์โหลดไฟล์จ่ายเงินเดือนธนาคาร', periodLabelTH(period))
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="bank_salary_${period}.csv"`)
  res.send(csv)
})

// ===== เอกสารราชการจากงวดที่ปิดแล้ว: สปส.1-10 · ภงด.1ก · ข้อมูล 50 ทวิ =====
// รวมยอดต่อคนของทั้งปี (จาก snapshot งวดที่ปิดแล้ว — ตัวเลขนิ่ง ไม่เปลี่ยนตามข้อมูลสด)
function annualByEmployee(year) {
  const runs = db.prepare('SELECT period, data FROM payroll_runs WHERE period LIKE ? ORDER BY period').all(year + '-%')
  const by = {}
  for (const r of runs) {
    try {
      for (const p of JSON.parse(r.data)) {
        const k = p.code || p.name
        if (!by[k]) by[k] = { code: p.code || '', prefix: '', name: p.name || '', tax_id: '', income: 0, tax: 0, sso: 0, months: 0 }
        by[k].income += (p.base || 0) + (p.ot || 0) - (p.leave_deduct || 0)
        by[k].tax += p.tax || 0
        by[k].sso += p.sso || 0
        by[k].months += 1
        if (p.prefix) by[k].prefix = p.prefix
        if (p.tax_id) by[k].tax_id = p.tax_id
      }
    } catch { /* ข้ามงวดที่ข้อมูลเสีย */ }
  }
  return Object.values(by).sort((a, b) => a.name.localeCompare(b.name, 'th'))
}
api.get('/payroll/annual-emp', requireSalary, (req, res) => {
  const year = /^\d{4}$/.test(req.query.year) ? req.query.year : String(new Date().getFullYear())
  res.json({ year, rows: annualByEmployee(year) })
})
// ไฟล์นำส่งประกันสังคม (แนว สปส.1-10 ส่วนที่ 2) — รายชื่อ + ค่าจ้าง + เงินสมทบของงวด
api.get('/payroll/sso-file', requireSalary, (req, res) => {
  const period = /^\d{4}-\d{2}$/.test(req.query.period) ? req.query.period : currentPeriod()
  const run = db.prepare('SELECT data FROM payroll_runs WHERE period=?').get(period)
  const rows = (run ? JSON.parse(run.data) : computePayroll(period)).filter((p) => (p.sso || 0) > 0)
  const split = (full) => { const t = String(full || '').trim().split(/\s+/); return { first: t[0] || '', last: t.slice(1).join(' ') } }
  const head = ['ลำดับ', 'เลขบัตรประชาชน', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'ค่าจ้างงวดนี้', 'เงินสมทบผู้ประกันตน (5%)']
  const body = rows.map((p, i) => {
    const n = split(p.name)
    const earned = (p.base || 0) + (p.ot || 0) - (p.leave_deduct || 0)
    return [i + 1, p.tax_id || '', p.prefix || '', n.first, n.last, earned.toFixed(2), (p.sso || 0).toFixed(2)]
  })
  const foot = ['', '', '', '', 'รวม', body.reduce((s, r) => s + Number(r[5]), 0).toFixed(2), body.reduce((s, r) => s + Number(r[6]), 0).toFixed(2)]
  const csv = '﻿' + [head, ...body, foot].map((r) => r.map(csvCell).join(',')).join('\r\n')
  audit(req, 'ดาวน์โหลดไฟล์นำส่งประกันสังคม', periodLabelTH(period))
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="sso_${period}.csv"`)
  res.send(csv)
})
// ภงด.1ก (สรุปทั้งปีต่อคน): เงินได้พึงประเมิน + ภาษีที่หักนำส่งทั้งปี
api.get('/payroll/pnd1k', requireSalary, (req, res) => {
  const year = /^\d{4}$/.test(req.query.year) ? req.query.year : String(new Date().getFullYear())
  const rows = annualByEmployee(year)
  const head = ['ลำดับ', 'เลขประจำตัวผู้เสียภาษี/บัตรประชาชน', 'คำนำหน้า', 'ชื่อ-สกุล', 'จำนวนเดือน', 'เงินได้พึงประเมินทั้งปี', 'ภาษีที่หักนำส่งทั้งปี', 'ประกันสังคมทั้งปี']
  const body = rows.map((p, i) => [i + 1, p.tax_id, p.prefix, p.name, p.months, p.income.toFixed(2), p.tax.toFixed(2), p.sso.toFixed(2)])
  const foot = ['', '', '', 'รวม', '', body.reduce((s, r) => s + Number(r[5]), 0).toFixed(2), body.reduce((s, r) => s + Number(r[6]), 0).toFixed(2), body.reduce((s, r) => s + Number(r[7]), 0).toFixed(2)]
  const csv = '﻿' + [head, ...body, foot].map((r) => r.map(csvCell).join(',')).join('\r\n')
  audit(req, 'ดาวน์โหลด ภงด.1ก', year)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="pnd1k_${year}.csv"`)
  res.send(csv)
})

api.get('/ot', (_req, res) => res.json(db.prepare('SELECT * FROM ot ORDER BY id DESC').all()))
api.post('/ot', canWrite, (req, res) => {
  const b = req.body || {}
  if (!b.emp_code || !b.amount) return res.status(400).json({ error: 'กรุณาเลือกพนักงานและจำนวนเงิน' })
  const emp = db.prepare('SELECT name FROM employees WHERE code=?').get(b.emp_code)
  const info = db.prepare('INSERT INTO ot (emp_code,name,date,hours,rate,amount,status) VALUES (?,?,?,?,?,?,?)')
    .run(b.emp_code, emp?.name || b.name || '', b.date || todayISO(), b.hours || '', b.rate || '1.5x', Number(b.amount) || 0, 'รออนุมัติ')
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
api.get('/purchase-orders', financeOnly, (_req, res) => res.json(db.prepare('SELECT * FROM purchase_orders ORDER BY id DESC').all().map((r) => attachApproval('po')(poRow(r)))))
api.post('/purchase-orders', financeOnly, (req, res) => {
  const b = req.body || {}
  if (!b.vendor || !b.item) return res.status(400).json({ error: 'กรุณากรอกผู้ขายและรายการ' })
  // กันโกงแบบบล็อกจริง (PO เกินยอด PR / ยอดสูงไม่เทียบราคา / แตกใบ)
  const blocked = poBlockReason(b, controls())
  if (blocked) return res.status(409).json({ error: blocked })
  const img = typeof b.image === 'string' && b.image.startsWith('data:image/') ? b.image : null
  const seq = nextSeq('po', () => Math.max(maxNoSuffix('purchase_orders'), db.prepare('SELECT COUNT(*) c FROM purchase_orders').get().c + 95))
  const no = `PO-${docYear()}-${String(seq).padStart(4, '0')}`
  const paymentType = b.payment_type === 'credit' ? 'credit' : 'cash'
  const creditDays = paymentType === 'credit' ? Math.max(0, Number(b.credit_days) || 0) : 0
  const dueDate = paymentType === 'credit' ? thDatePlusDays(creditDays) : ''
  let dueIso = ''
  if (paymentType === 'credit') {
    const d = new Date(); d.setDate(d.getDate() + creditDays); dueIso = d.toISOString().slice(0, 10)
  }
  // สำเนารายการที่สั่ง (ชื่อ/จำนวน/ราคา) ไว้ในตัว PO เพื่อใช้เทียบกับใบส่งของตอนตรวจรับ
  // ถ้าไม่ส่ง items มา → สร้างบรรทัดเดียวจากรายการ+มูลค่ารวม (จำนวนไม่ระบุ = 0 → ตอนตรวจรับข้ามการเช็คจำนวนบรรทัดนั้น)
  const orderItems = Array.isArray(b.items) && b.items.length
    ? b.items.map((it) => ({ desc: String(it.desc || '').trim(), qty: Number(it.qty) || 0, unit: String(it.unit || ''), price: Number(it.price) || 0 })).filter((it) => it.desc)
    : [{ desc: String(b.item || '').trim(), qty: 0, unit: '', price: Number(b.amount) || 0 }]
  const poVendorId = db.prepare('SELECT id FROM vendors WHERE name=?').get(String(b.vendor))?.id ?? null // ผูกทะเบียนผู้ขาย (ชื่อตรง)
  // ภาษีซื้อจากใบกำกับจริง (ยอดรวมถือเป็นราคารวม VAT)
  const poVat = Math.max(0, Number(b.vat_amount) || 0)
  if (poVat > (Number(b.amount) || 0)) return res.status(400).json({ error: 'ยอด VAT มากกว่ามูลค่า PO — ตรวจตัวเลขอีกครั้ง' })
  const info = db
    .prepare('INSERT INTO purchase_orders (no,date,vendor,item,amount,status,image,pr_no,by,payment_type,credit_days,due_date,house_code,due_iso,items,vendor_id,vat_amount,tax_invoice_no) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(no, todayTH(), b.vendor, b.item, Number(b.amount) || 0, 'รอส่งของ', img, b.pr_no || '', req.user.name, paymentType, creditDays, dueDate, b.house_code || '', dueIso, JSON.stringify(orderItems), poVendorId, poVat, String(b.tax_invoice_no || '').trim())
  res.status(201).json(poRow(db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(info.lastInsertRowid)))
})
// ===== สต๊อกวัสดุ — นับจำนวน/ที่อยู่ของ (ต้นทุนลงบัญชีตามเดิมตอนรับของ ไม่เปลี่ยน) =====
// PO ที่ "ไม่ผูกบ้าน" = ซื้อเข้าสต๊อกกลาง → รับของผ่านแล้วรายการวิ่งเข้าสต๊อกอัตโนมัติ
// PO ที่ผูกบ้าน = ของส่งตรงหน้างาน ไม่เข้าสต๊อก
const normStock = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
function stockItemFor(name, unit) {
  const nkey = normStock(name)
  if (!nkey) return null
  let it = db.prepare('SELECT * FROM stock_items WHERE nkey=?').get(nkey)
  if (!it) {
    const info = db.prepare('INSERT INTO stock_items (name, nkey, unit, qty, min_qty, updated) VALUES (?,?,?,0,0,?)')
      .run(String(name).trim(), nkey, String(unit || ''), todayTH())
    it = db.prepare('SELECT * FROM stock_items WHERE id=?').get(info.lastInsertRowid)
  }
  return it
}
function stockMove({ item_id, kind, qty, house_code, note, by, po_id }) {
  const q = Math.abs(Number(qty) || 0)
  if (!q && kind !== 'adjust') return null // ตรวจนับเป็น 0 ได้ (ของหมด) — บันทึกและตั้งยอดเป็น 0 จริง
  const delta = kind === 'out' ? -q : kind === 'in' ? q : 0
  db.prepare('INSERT INTO stock_moves (item_id, kind, qty, house_code, note, by, po_id, date_iso, created) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(item_id, kind, q, house_code || '', note || '', by || '', po_id ?? null, todayISO(), nowTS())
  if (kind === 'adjust') db.prepare('UPDATE stock_items SET qty=?, updated=? WHERE id=?').run(q, todayTH(), item_id)
  else db.prepare('UPDATE stock_items SET qty = qty + ?, updated=? WHERE id=?').run(delta, todayTH(), item_id)
  return db.prepare('SELECT * FROM stock_items WHERE id=?').get(item_id)
}
function stockInFromPo(po, deliveryItems, by) {
  if (po.house_code) return 0 // ผูกบ้าน = ส่งตรงหน้างาน ไม่เข้าสต๊อก
  // เคยรับเข้าจากใบนี้แล้ว (เช่น ยกเลิกรับของแล้วตรวจใหม่) → ไม่รับซ้ำ กันยอดเบิ้ล
  if (db.prepare('SELECT 1 FROM stock_moves WHERE po_id=? LIMIT 1').get(po.id)) return 0
  let n = 0
  for (const d of deliveryItems || []) {
    const name = String(d.name || d.desc || '').trim()
    const qty = Number(d.qty) || 0
    if (!name || qty <= 0) continue
    const it = stockItemFor(name, d.unit)
    if (it) { stockMove({ item_id: it.id, kind: 'in', qty, note: 'รับเข้าจาก ' + po.no, by, po_id: po.id }); n++ }
  }
  return n
}
api.get('/stock', (_req, res) => res.json(
  db.prepare('SELECT * FROM stock_items ORDER BY name COLLATE NOCASE').all().map((it) => ({ ...it, low: (it.min_qty || 0) > 0 && it.qty < it.min_qty }))
))
api.get('/stock/moves', (req, res) => {
  const w = req.query.item_id ? 'WHERE m.item_id=?' : ''
  const args = req.query.item_id ? [Number(req.query.item_id)] : []
  res.json(db.prepare(`SELECT m.*, i.name AS item_name, i.unit FROM stock_moves m JOIN stock_items i ON i.id=m.item_id ${w} ORDER BY m.id DESC LIMIT 300`).all(...args))
})
api.put('/stock/items/:id', canWrite, (req, res) => {
  const it = db.prepare('SELECT * FROM stock_items WHERE id=?').get(req.params.id)
  if (!it) return res.status(404).json({ error: 'ไม่พบรายการ' })
  const b = req.body || {}
  db.prepare('UPDATE stock_items SET unit=?, min_qty=? WHERE id=?')
    .run(b.unit != null ? String(b.unit) : it.unit, b.min_qty != null ? Math.max(0, Number(b.min_qty) || 0) : it.min_qty, it.id)
  res.json(db.prepare('SELECT * FROM stock_items WHERE id=?').get(it.id))
})
api.post('/stock/moves', canWrite, (req, res) => {
  const b = req.body || {}
  const kind = ['in', 'out', 'adjust'].includes(b.kind) ? b.kind : null
  if (!kind) return res.status(400).json({ error: 'ชนิดรายการไม่ถูกต้อง (in/out/adjust)' })
  const qty = Number(b.qty)
  if (!(qty >= 0) || (kind !== 'adjust' && !(qty > 0))) return res.status(400).json({ error: 'กรุณากรอกจำนวนให้ถูกต้อง' })
  let item = b.item_id ? db.prepare('SELECT * FROM stock_items WHERE id=?').get(Number(b.item_id)) : null
  if (!item && b.name && kind === 'in') item = stockItemFor(b.name, b.unit) // สร้างรายการใหม่ได้เฉพาะตอน "รับเข้า"
  if (!item) return res.status(404).json({ error: 'ไม่พบรายการวัสดุ — เลือกจากรายการหรือกรอกชื่อ' })
  if (kind === 'out') {
    if (qty > item.qty + 1e-9) return res.status(400).json({ error: `เบิกเกินคงเหลือ — ${item.name} เหลือ ${item.qty} ${item.unit || ''}` })
    if (!String(b.note || '').trim() && !String(b.house_code || '').trim()) return res.status(400).json({ error: 'เบิกออกต้องระบุบ้านที่เอาไปใช้ หรือหมายเหตุ (ใครเบิก/เอาไปทำอะไร)' })
  }
  const it2 = stockMove({ item_id: item.id, kind, qty, house_code: b.house_code, note: b.note, by: req.user.name })
  audit(req, kind === 'in' ? 'รับวัสดุเข้าสต๊อก' : kind === 'out' ? 'เบิกวัสดุออกจากสต๊อก' : 'ปรับยอดสต๊อก (ตรวจนับ)', `${item.name} ${qty} ${item.unit || ''}${b.house_code ? ' → ' + b.house_code : ''}`)
  res.status(201).json(it2)
})

// when a PO is received, its cost flows into the house's รายจ่าย (auto expense, linked by po_id)
function syncPoExpense(po) {
  const existing = db.prepare('SELECT * FROM expenses WHERE po_id=?').get(po.id)
  const received = po.status === 'รับของแล้ว' || po.status === 'ปิดงาน'
  // PO ไม่ผูกบ้านก็ต้องลงบัญชีเหมือนกัน (house_code ว่าง) — ไม่งั้น PO เครดิตไม่ผูกบ้านจะไม่ตั้งเจ้าหนี้ 2010 เลย
  if (received) {
    let row
    if (existing) {
      db.prepare('UPDATE expenses SET house_code=?, item=?, vendor=?, amount=?, vat_amount=?, tax_invoice_no=? WHERE po_id=?')
        .run(po.house_code || '', po.item, po.vendor, po.amount, po.vat_amount || 0, po.tax_invoice_no || '', po.id)
      row = db.prepare('SELECT * FROM expenses WHERE po_id=?').get(po.id)
    } else {
      const info = db.prepare('INSERT INTO expenses (date,house_code,item,cat,vendor,amount,po_id,date_iso,vat_amount,tax_invoice_no) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(todayTH(), po.house_code || '', po.item, 'วัสดุ', po.vendor, po.amount, po.id, todayISO(), po.vat_amount || 0, po.tax_invoice_no || '')
      row = db.prepare('SELECT * FROM expenses WHERE id=?').get(info.lastInsertRowid)
    }
    // ลงบัญชีแยกประเภท: ซื้อสด → Cr เงินสด · ซื้อเครดิต → Cr เจ้าหนี้การค้า (จ่ายทีหลังค่อยตัดเจ้าหนี้)
    try { if (row) acct.syncExpenseJournal(row, { credit: po.payment_type === 'credit' }) } catch (e) { console.error('journal(po-exp):', e.message); if (row) logJournalIssue('exp', row.id, `รับของ ${po.no}`, e) }
    if (po.house_code) recomputeHouse(po.house_code)
  } else if (existing) {
    // not received anymore → ถอนรายการบัญชีก่อน สำเร็จแล้วค่อยลบรายจ่าย (กันบัญชีค้างโดยไม่มีเอกสารต้นทาง)
    try {
      acct.removeAutoJournal('exp', existing.id)
      db.prepare('DELETE FROM expenses WHERE po_id=?').run(po.id)
      if (existing.house_code) recomputeHouse(existing.house_code)
    } catch (e) {
      console.error('journal(po-exp-del):', e.message)
      logJournalIssue('exp', existing.id, `ยกเลิกรับของ ${po.no} — ถอนบัญชีไม่สำเร็จ รายจ่ายยังค้างอยู่`, e)
    }
  }
}
api.post('/purchase-orders/:id/status', financeOnly, (req, res) => {
  const st = ['รอส่งของ', 'รับของแล้ว', 'ปิดงาน'].includes(req.body?.status) ? req.body.status : 'รอส่งของ'
  // ต้องอนุมัติ PO ครบก่อน ถึงจะรับของ/ปิดงานได้
  if (controls().enforce_approval_flow && (st === 'รับของแล้ว' || st === 'ปิดงาน') && !approvalState('po', req.params.id).done)
    return res.status(409).json({ error: 'อัปเดตสถานะไม่ได้ — ใบสั่งซื้อยังไม่ได้รับอนุมัติครบ (ให้อนุมัติ PO ก่อน)' })
  const prevSt = db.prepare('SELECT status FROM purchase_orders WHERE id=?').get(req.params.id)?.status
  db.prepare('UPDATE purchase_orders SET status=? WHERE id=?').run(st, req.params.id)
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(req.params.id)
  syncPoExpense(po)
  // รับของแบบไม่ผ่านใบตรวจ (เปลี่ยนสถานะมือ): PO ไม่ผูกบ้าน → รับเข้าสต๊อกจากรายการใน PO (ครั้งแรกเท่านั้น)
  if (st === 'รับของแล้ว' && prevSt !== 'รับของแล้ว' && prevSt !== 'ปิดงาน') {
    try { stockInFromPo(po, orderItemsForPo(po).map((it) => ({ name: it.desc, qty: it.qty, unit: it.unit })), req.user.name) } catch (e) { console.error('stock-in:', e.message) }
  }
  audit(req, 'อัปเดตสถานะ PO', `${po.no} → ${st}`)
  res.json(poRow(po))
})

// ===== ตรวจรับของ: เทียบ PO กับใบส่งของ (Goods Receipt) =====
// จับคู่ชื่อสินค้าแบบยืดหยุ่น (เว้นวรรค/สะกดต่างเล็กน้อยก็จับได้)
function grNameKey(n) { return String(n || '').replace(/\s+/g, '').replace(/["“”#]/g, '').toLowerCase() }
function grNameScore(a, b) {
  const an = grNameKey(a), bn = grNameKey(b)
  if (!an || !bn) return 0
  if (an === bn) return 1
  if (an.length >= 4 && bn.length >= 4 && (an.includes(bn) || bn.includes(an))) return 0.85
  const tok = (s) => new Set(String(s).toLowerCase().split(/[\s()#"'“”]+/).filter((t) => t.length >= 2))
  const ta = tok(a), tb = tok(b)
  let inter = 0; ta.forEach((t) => { if (tb.has(t)) inter++ })
  const uni = new Set([...ta, ...tb]).size
  return uni ? inter / uni : 0
}
// เทียบรายการที่สั่ง (PO.items) กับรายการในใบส่งของ → ผ่าน/ไม่ผ่าน + รายละเอียดต่อบรรทัด
function matchReceipt(orderItems, deliveryItems, po) {
  const tolPct = Math.max(0, Number(controls().receipt_price_tol_pct) || 0)
  const del = (deliveryItems || []).map((d) => ({
    name: String(d.name || d.desc || '').trim(),
    qty: Number(d.qty) || 0,
    unit: String(d.unit || ''),
    price: Number(d.price) || 0,
    amount: Number(d.amount) || ((Number(d.qty) || 0) * (Number(d.price) || 0)) || 0,
    used: false,
  }))
  const priceOkFn = (op, dp) => { if (!(op > 0) || !(dp > 0)) return null; const tol = Math.max(op * tolPct / 100, 0.5); return Math.abs(op - dp) <= tol }
  const lines = (orderItems || []).map((o) => {
    const desc = String(o.desc || '').trim()
    // หาบรรทัดใบส่งของที่ชื่อใกล้สุดและยังไม่ถูกจับคู่
    let best = -1, bestScore = 0
    del.forEach((d, i) => { if (d.used) return; const s = grNameScore(desc, d.name); if (s > bestScore) { bestScore = s; best = i } })
    const d = best >= 0 && bestScore >= 0.5 ? del[best] : null
    if (d) d.used = true
    const nameOk = !!d
    const qtyOk = !d ? false : (!(Number(o.qty) > 0) ? null : (Number(o.qty) === d.qty))
    // บรรทัดเหมารวม (PO เก่าไม่มีรายการย่อย: qty=0, price=มูลค่ารวม) — เทียบราคาต่อหน่วยไม่ได้ ให้ตัดสินด้วยยอดรวมแทน
    const priceOk = !d ? false : (!(Number(o.qty) > 0) ? null : priceOkFn(Number(o.price), d.price))
    const pass = nameOk && qtyOk !== false && priceOk !== false
    return { desc, qty: Number(o.qty) || 0, unit: o.unit || '', price: Number(o.price) || 0,
      d_name: d?.name || '', d_qty: d?.qty ?? null, d_price: d?.price ?? null,
      nameOk, qtyOk, priceOk, pass }
  })
  const extras = del.filter((d) => !d.used).map((d) => ({ name: d.name, qty: d.qty, unit: d.unit, price: d.price, amount: d.amount }))
  const totalOrder = (orderItems || []).reduce((s, o) => s + (Number(o.qty) > 0 ? Number(o.qty) * Number(o.price) : Number(o.price) || 0), 0) || Number(po?.amount) || 0
  const totalDelivery = del.reduce((s, d) => s + (d.amount || 0), 0)
  const totalTol = Math.max(totalOrder * tolPct / 100, 1)
  const totalOk = totalDelivery > 0 ? Math.abs(totalOrder - totalDelivery) <= totalTol : null
  const allLinesPass = lines.length > 0 && lines.every((l) => l.pass)
  const result = (allLinesPass && extras.length === 0 && totalOk !== false) ? 'ผ่าน' : 'ไม่ผ่าน'
  return { result, lines, extras, totalOrder, totalDelivery, totalOk, tolPct }
}

// รายการที่ใช้เทียบ = items ที่เก็บไว้ใน PO (ถ้าว่าง สร้างบรรทัดเดียวจากรายการ+มูลค่ารวม)
function orderItemsForPo(po) {
  const items = jparse(po.items)
  if (Array.isArray(items) && items.length) return items
  return [{ desc: String(po.item || '').trim(), qty: 0, unit: '', price: Number(po.amount) || 0 }]
}

const RECEIPT_PROMPT = `คุณเป็นผู้ช่วยตรวจรับสินค้า อ่าน "ใบส่งของ / ใบส่งสินค้า / ใบกำกับภาษี" ในรูปนี้ แล้วดึงรายการสินค้าออกมาเป็น JSON เท่านั้น ห้ามมีข้อความอื่น
รูปแบบ: {"items":[{"name":"ชื่อสินค้า","qty":10,"unit":"ถุง","price":143,"amount":1430}]}
กติกา:
- name = ชื่อสินค้าตามที่เขียนในใบส่งของ
- qty = จำนวน (ตัวเลขล้วน), unit = หน่วย (ถ้ามี)
- price = ราคาต่อหน่วย (ตัวเลขล้วน ไม่มีคอมม่า), amount = จำนวนเงินรวมของบรรทัดนั้น
- ถ้าบรรทัดไหนไม่มีราคาต่อหน่วยแต่มีจำนวนเงินรวม ให้คำนวณ price = amount / qty
- เอาเฉพาะรายการสินค้า ไม่เอาบรรทัดยอดรวม/ภาษี/ส่วนลด
- ถ้าอ่านไม่ออกเลย ให้คืน {"items":[]}`

// AI อ่านใบส่งของจากรูป → คืนรายการสินค้า (ยังไม่บันทึก ให้ผู้ใช้ตรวจ/แก้ก่อน)
api.post('/purchase-orders/:id/extract-receipt', canWrite, express.raw({ type: 'application/octet-stream', limit: '40mb' }), async (req, res) => {
  if (!aiKey()) return res.status(400).json({ error: AI_NO_KEY + ' — หรือกรอกรายการในใบส่งของเองได้' })
  const buf = req.body
  if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'ไฟล์ไม่ถูกต้อง' })
  const mime = String(req.query.mime || 'image/jpeg')
  const b64 = buf.toString('base64')
  const media = mime.includes('pdf')
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: mime.startsWith('image/') ? mime : 'image/jpeg', data: b64 } }
  const ai = await aiAsk({ media, prompt: RECEIPT_PROMPT })
  if (!ai.ok) return res.status(ai.code || 502).json({ error: ai.error })
  const parsed = extractJsonBlock(ai.text)
  const items = (parsed?.items || parsed || []).map((it) => {
    const qty = Number(String(it.qty).toString().replace(/,/g, '')) || 0
    const amount = Number(String(it.amount).toString().replace(/,/g, '')) || 0
    let price = Number(String(it.price).toString().replace(/,/g, '')) || 0
    if (!price && amount && qty) price = Math.round((amount / qty) * 100) / 100
    return { name: String(it.name || ''), qty, unit: String(it.unit || ''), price, amount: amount || qty * price }
  }).filter((it) => it.name)
  audit(req, 'AI อ่านใบส่งของ', `PO#${req.params.id} ${items.length} รายการ (${ai.model})`)
  res.json({ items })
})

// ตรวจรับของ: เทียบ PO.items กับรายการในใบส่งของ (ที่ผู้ใช้ยืนยันแล้ว) → บันทึกผล + อัปเดตสถานะ PO
api.post('/purchase-orders/:id/receive', canWrite, (req, res) => {
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(req.params.id)
  if (!po) return res.status(404).json({ error: 'ไม่พบใบสั่งซื้อ' })
  if (controls().enforce_approval_flow && !approvalState('po', po.id).done)
    return res.status(409).json({ error: `ตรวจรับของไม่ได้ — ใบสั่งซื้อ ${po.no} ยังไม่ได้รับอนุมัติครบ (ให้อนุมัติ PO ก่อน)` })
  const b = req.body || {}
  const orderItems = orderItemsForPo(po)
  const deliveryItems = Array.isArray(b.delivery_items) ? b.delivery_items : []
  if (!deliveryItems.length) return res.status(400).json({ error: 'ยังไม่มีรายการในใบส่งของ — อัปโหลดรูปให้ AI อ่าน หรือกรอกเอง' })
  const detail = matchReceipt(orderItems, deliveryItems, po)
  const files = Array.isArray(b.files) ? b.files : []
  const now = new Date()
  const info = db.prepare(`INSERT INTO goods_receipts (po_id,po_no,files,order_items,delivery_items,result,detail,note,by,date,ts)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(po.id, po.no, JSON.stringify(files), JSON.stringify(orderItems), JSON.stringify(deliveryItems), detail.result, JSON.stringify(detail), String(b.note || ''), req.user.name, todayTH(), now.toISOString())
  // ผ่าน → รับของแล้ว (ต้นทุนไหลเข้าบ้าน) · ไม่ผ่าน → คงสถานะรอส่งของ ให้กลับไปตรวจ
  const prevStatus = po.status
  db.prepare('UPDATE purchase_orders SET gr_status=?, gr_date=? WHERE id=?').run(detail.result, todayTH(), po.id)
  if (detail.result === 'ผ่าน') db.prepare("UPDATE purchase_orders SET status='รับของแล้ว' WHERE id=?").run(po.id)
  // ไม่ผ่าน แต่ก่อนหน้าเคยรับของแล้ว (เคยผ่าน) → ดึงกลับเป็น "รอส่งของ" ให้กลับไปตรวจใหม่ (ต้นทุนที่ลงบ้านจะถูกถอนออกใน syncPoExpense)
  else if (po.status === 'รับของแล้ว') db.prepare("UPDATE purchase_orders SET status='รอส่งของ' WHERE id=?").run(po.id)
  const po2 = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(po.id)
  syncPoExpense(po2)
  // PO ไม่ผูกบ้าน = ซื้อเข้าสต๊อกกลาง → รับเข้าอัตโนมัติ (ครั้งแรกที่ผ่านเท่านั้น กันรับซ้ำ)
  if (detail.result === 'ผ่าน' && prevStatus !== 'รับของแล้ว' && prevStatus !== 'ปิดงาน') {
    try { stockInFromPo(po2, deliveryItems, req.user.name) } catch (e) { console.error('stock-in:', e.message) }
  }
  audit(req, 'ตรวจรับของ', `${po.no} → ${detail.result}`)
  res.status(201).json({ result: detail.result, detail, receipt_id: info.lastInsertRowid, po: poRow(po2) })
})

api.get('/purchase-orders/:id/receipts', financeOnly, (req, res) =>
  res.json(db.prepare('SELECT * FROM goods_receipts WHERE po_id=? ORDER BY id DESC').all(req.params.id)
    .map((r) => ({ ...r, files: jparse(r.files) || [], order_items: jparse(r.order_items) || [], delivery_items: jparse(r.delivery_items) || [], detail: jparse(r.detail) || null }))))

// ผู้จัดการ override ผลตรวจรับ (เช่น ยอมรับทั้งที่ไม่ผ่าน เพราะตกลงกับผู้ขายแล้ว)
api.post('/goods-receipts/:id/override', requireManager, (req, res) => {
  const gr = db.prepare('SELECT * FROM goods_receipts WHERE id=?').get(req.params.id)
  if (!gr) return res.status(404).json({ error: 'ไม่พบใบตรวจรับ' })
  const result = req.body?.result === 'ผ่าน' ? 'ผ่าน' : 'ไม่ผ่าน'
  db.prepare('UPDATE goods_receipts SET result=?, overridden=1, override_by=?, note=? WHERE id=?')
    .run(result, req.user.name, String(req.body?.note || gr.note || ''), gr.id)
  db.prepare('UPDATE purchase_orders SET gr_status=?, gr_date=? WHERE id=?').run(result, todayTH(), gr.po_id)
  const poCur = db.prepare('SELECT status FROM purchase_orders WHERE id=?').get(gr.po_id)
  if (result === 'ผ่าน') db.prepare("UPDATE purchase_orders SET status='รับของแล้ว' WHERE id=?").run(gr.po_id)
  else if (poCur && poCur.status === 'รับของแล้ว') db.prepare("UPDATE purchase_orders SET status='รอส่งของ' WHERE id=?").run(gr.po_id)
  const po2 = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(gr.po_id)
  syncPoExpense(po2)
  // override เป็น "ผ่าน" ก็ต้องรับของเข้าสต๊อกเหมือนตรวจผ่านปกติ (PO ไม่ผูกบ้าน · กันรับซ้ำใน stockInFromPo)
  if (result === 'ผ่าน') {
    try { stockInFromPo(po2, jparse(gr.delivery_items) || [], req.user.name) } catch (e) { console.error('stock-in(override):', e.message) }
  }
  audit(req, 'ปรับผลตรวจรับของ (override)', `${gr.po_no} → ${result}`)
  res.json({ ok: true, result, po: poRow(po2) })
})

// ล้างข้อมูลจัดซื้อทั้งหมด (PR/PO) — เริ่มใช้ระบบใหม่ (ผู้ดูแลเท่านั้น) · ไม่แตะราคากลางวัสดุ/ผู้ขาย/รายจ่ายที่ไม่ได้มาจาก PO
api.post('/procurement/clear', adminOnly, (req, res) => {
  const counts = {}
  db.transaction(() => {
    // ถอนรายการบัญชี + รายจ่ายที่สร้างอัตโนมัติจาก PO (มี po_id)
    const houses = db.prepare("SELECT DISTINCT house_code h FROM expenses WHERE po_id IS NOT NULL AND COALESCE(house_code,'')!=''").all().map((r) => r.h)
    for (const e of db.prepare('SELECT id FROM expenses WHERE po_id IS NOT NULL').all()) { try { acct.removeAutoJournal('exp', e.id) } catch { /* ignore */ } }
    counts.expenses = db.prepare('DELETE FROM expenses WHERE po_id IS NOT NULL').run().changes
    // ใบจ่ายเงินที่ผูก PO — ถอนรายการบัญชีและลบด้วย ไม่งั้นเหลือรายการตัดเจ้าหนี้ค้างลอย (2010 ติดลบ)
    for (const p of db.prepare('SELECT id FROM payments WHERE po_id IS NOT NULL').all()) { try { acct.removeAutoJournal('pay', p.id) } catch { /* ignore */ } }
    counts.payments = db.prepare('DELETE FROM payments WHERE po_id IS NOT NULL').run().changes
    counts.payment_approvals = db.prepare("DELETE FROM doc_approvals WHERE doc_type='payment' AND doc_id NOT IN (SELECT id FROM payments)").run().changes
    counts.goods_receipts = db.prepare('DELETE FROM goods_receipts').run().changes
    counts.quotes = db.prepare('DELETE FROM pr_quotes').run().changes
    counts.approvals = db.prepare("DELETE FROM doc_approvals WHERE doc_type IN ('pr','po')").run().changes
    counts.purchase_orders = db.prepare('DELETE FROM purchase_orders').run().changes
    counts.purchase_requests = db.prepare('DELETE FROM purchase_requests').run().changes
    for (const h of houses) recomputeHouse(h)
  })()
  audit(req, 'ล้างข้อมูลจัดซื้อ (PR/PO)', `PR ${counts.purchase_requests} · PO ${counts.purchase_orders} · ตรวจรับ ${counts.goods_receipts} · รายจ่าย ${counts.expenses}`)
  res.json({ ok: true, counts })
})

// ---------- procurement (finance only) ----------
// ผู้ขาย + ยอดค้างจ่ายจริง (คิดสดจาก PO เครดิต − ที่จ่ายแล้ว) และยอดซื้อสะสมจริง
// ทะเบียนผู้รับเหมา (เฉพาะชื่อ/หมวด/ที่อยู่ — ไม่มีตัวเลขเงิน) ให้ทุกคนที่คีย์งานได้ใช้เลือกตอนจ้างช่างในบ้าน รวมโฟร์แมน
api.get('/contractor-registry', canWrite, (_req, res) =>
  res.json(db.prepare("SELECT id, name, type, category, address, tax_id FROM vendors WHERE kind='ผู้รับเหมา' ORDER BY name").all()))
api.get('/vendors', financeOnly, (_req, res) => {
  const rows = db.prepare('SELECT * FROM vendors ORDER BY id').all().map((v) => {
    const pos = db.prepare("SELECT id, amount, payment_type FROM purchase_orders WHERE vendor=? OR vendor_id=?").all(v.name, v.id)
    let out = 0, total = 0
    for (const po of pos) {
      total += po.amount || 0
      if (po.payment_type === 'credit') {
        const paid = db.prepare("SELECT COALESCE(SUM(gross),0) a FROM payments WHERE po_id=? AND COALESCE(status,'') != 'ปฏิเสธ'").get(po.id).a
        out += Math.max(0, (po.amount || 0) - paid)
      }
    }
    return { ...v, outstanding_live: out, total_live: total }
  })
  res.json(rows)
})
api.post('/vendors', financeOnly, (req, res) => {
  const b = req.body || {}
  if (!b.name) return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ขาย' })
  const kind = b.kind === 'ผู้รับเหมา' ? 'ผู้รับเหมา' : 'ผู้ขาย' // หมวด: ผู้ขายวัสดุ หรือ ผู้รับเหมา (ค่าแรง/รับช่วง)
  const info = db.prepare('INSERT INTO vendors (name,type,tax_id,total,outstanding,credit_days,kind,address,category) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(b.name, b.type || 'นิติบุคคล', b.tax_id || '', Number(b.total) || 0, Number(b.outstanding) || 0, Math.max(0, Number(b.credit_days) || 0), kind, String(b.address || '').trim(), String(b.category || '').trim())
  res.status(201).json(db.prepare('SELECT * FROM vendors WHERE id=?').get(info.lastInsertRowid))
})
// edit a vendor's credit terms (เครดิตประจำร้าน)
api.put('/vendors/:id', financeOnly, (req, res) => {
  const v = db.prepare('SELECT * FROM vendors WHERE id=?').get(req.params.id)
  if (!v) return res.status(404).json({ error: 'ไม่พบผู้ขาย' })
  const b = req.body || {}
  const newKind = b.kind != null ? (b.kind === 'ผู้รับเหมา' ? 'ผู้รับเหมา' : 'ผู้ขาย') : v.kind
  db.prepare('UPDATE vendors SET name=?, type=?, tax_id=?, credit_days=?, vat_registered=?, kind=?, address=?, category=? WHERE id=?')
    .run(b.name ?? v.name, b.type ?? v.type, b.tax_id ?? v.tax_id, b.credit_days != null ? Math.max(0, Number(b.credit_days) || 0) : v.credit_days, b.vat_registered != null ? (b.vat_registered ? 1 : 0) : v.vat_registered, newKind, b.address != null ? String(b.address).trim() : v.address, b.category != null ? String(b.category).trim() : v.category, v.id)
  res.json(db.prepare('SELECT * FROM vendors WHERE id=?').get(v.id))
})
// parse the items/images JSON columns into arrays for the client
function jparse(s) { if (!s) return null; try { return JSON.parse(s) } catch { return null } }
function prRow(r) { return r ? { ...r, items: jparse(r.items), images: jparse(r.images) } : r }
function poRow(r) { return r ? { ...r, items: jparse(r.items) || [] } : r }
api.get('/purchase-requests', canWrite, (_req, res) => // โฟร์แมน (หน้างาน) เข้าดู/คีย์ใบขอซื้อได้ — ส่วนเงินจริง (PO/จ่าย) ยังเป็น financeOnly
  res.json(db.prepare('SELECT * FROM purchase_requests ORDER BY id DESC').all().map((r) => ({ ...prRow(r), approval: approvalState('pr', r.id) })))
)
// create a PR — requester = current user, snapshot their signature, optional product image
// รองรับหลายรายการในใบเดียว: ส่ง items: [{desc,qty,unit,price}] มา (จำนวนเงินรวม = ผลรวมของทุกรายการ)
api.post('/purchase-requests', canWrite, (req, res) => {
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
  const me = { ...db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id), signature: sigOfUser(req.user.id) }
  const seq = nextSeq('pr', () => Math.max(maxNoSuffix('purchase_requests'), db.prepare('SELECT COUNT(*) c FROM purchase_requests').get().c + 142))
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
api.get('/material-prices', canWrite, (_req, res) => // หน้างานเห็นราคากลางด้วย (ใช้เดาคำ + เตือนราคาแพงตอนคีย์ PR)
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
// แปลงราคาแพ็ค → ราคาต่อ 1 ชิ้น (ข้อมูลจาก Excel บางรายการตั้งราคามาต่อ 2–3 ชิ้น)
// หารทุกช่องราคา (กลาง/ต่ำสุด/สูงสุด/ล่าสุด) ด้วยจำนวนชิ้น + แก้หน่วย + บันทึกที่มาไว้ในหมายเหตุ
api.post('/material-prices/:id/per-piece', financeOnly, (req, res) => {
  const m = db.prepare('SELECT * FROM material_prices WHERE id=?').get(req.params.id)
  if (!m) return res.status(404).json({ error: 'ไม่พบรายการ' })
  const pack = Number(req.body?.pack)
  if (!Number.isFinite(pack) || pack < 2 || pack > 1000) return res.status(400).json({ error: 'จำนวนชิ้นต่อแพ็คต้องเป็นตัวเลข 2 ขึ้นไป' })
  const d = (x) => (Number(x) > 0 ? Math.round((Number(x) / pack) * 100) / 100 : x)
  // หน่วยใหม่: ตัดตัวเลขออกจากหน่วยเดิม (เช่น "3 ชิ้น" → "ชิ้น") หรือใช้ที่ส่งมา
  const unit = String(req.body?.unit || '').trim() || (String(m.unit || '').replace(/[\d\s]+/g, ' ').trim() || 'ชิ้น')
  const note = `${m.note ? m.note + ' · ' : ''}แปลงเป็นราคาต่อ 1 ${unit} (หาร ${pack} จากราคาเดิม ${m.central})`
  db.prepare("UPDATE material_prices SET central=?, min=?, max=?, latest=?, unit=?, note=?, source='กำหนดเอง', updated=? WHERE id=?")
    .run(d(m.central), d(m.min), d(m.max), d(m.latest), unit, note, new Date().toISOString().slice(0, 10), m.id)
  audit(req, 'แปลงราคากลางเป็นต่อ 1 ชิ้น', `${m.name}: ${m.central} ÷ ${pack} = ${d(m.central)}`)
  res.json(db.prepare('SELECT * FROM material_prices WHERE id=?').get(m.id))
})
api.delete('/material-prices/:id', financeOnly, (req, res) => {
  const cur = db.prepare('SELECT * FROM material_prices WHERE id=?').get(req.params.id)
  db.prepare('DELETE FROM material_prices WHERE id=?').run(req.params.id)
  if (cur) audit(req, 'ลบราคากลางวัสดุ', cur.name)
  res.json({ ok: true })
})
// ===== ราคากลางค่าแรงช่าง (Standard Labor Cost) =====
// ทุกคนที่คีย์งานได้ (รวมโฟร์แมน) ต้องเห็นราคากลาง เพื่อใช้เป็นราคาแนะนำตอนจ้างช่าง — แก้ได้เฉพาะการเงิน/แอดมิน
api.get('/labor-rates', canWrite, (_req, res) =>
  res.json(db.prepare('SELECT * FROM labor_rates WHERE active=1 ORDER BY CASE grp WHEN ? THEN 0 ELSE 1 END, seq, id').all('เหมายกหลัง')))
const laborBody = (b, cur = {}) => {
  const num = (k, d) => (b[k] != null && b[k] !== '' ? Number(b[k]) || 0 : d)
  const min = num('price_min', cur.price_min ?? 0)
  const max = Math.max(min, num('price_max', cur.price_max ?? min))
  return {
    grp: b.grp === 'เหมายกหลัง' ? 'เหมายกหลัง' : (b.grp != null ? 'แยกงาน' : (cur.grp || 'แยกงาน')),
    seq: num('seq', cur.seq ?? 0), name: b.name != null ? String(b.name).trim() : (cur.name || ''),
    variant: b.variant != null ? String(b.variant).trim() : (cur.variant || ''),
    price_min: min, price_max: max, unit: b.unit != null ? String(b.unit).trim() : (cur.unit || 'ตร.ม.'),
    note: b.note != null ? String(b.note).trim() : (cur.note || ''),
  }
}
api.post('/labor-rates', financeOnly, (req, res) => {
  const v = laborBody(req.body || {})
  if (!v.name) return res.status(400).json({ error: 'กรุณากรอกชื่อหมวดงาน' })
  if (!v.seq) v.seq = (db.prepare('SELECT COALESCE(MAX(seq),0) m FROM labor_rates WHERE grp=?').get(v.grp).m || 0) + 1
  const info = db.prepare('INSERT INTO labor_rates (grp,seq,name,variant,price_min,price_max,unit,note,active,updated) VALUES (?,?,?,?,?,?,?,?,1,?)')
    .run(v.grp, v.seq, v.name, v.variant, v.price_min, v.price_max, v.unit, v.note, new Date().toISOString().slice(0, 10))
  audit(req, 'เพิ่มราคากลางค่าแรง', `${v.name}${v.variant ? ' (' + v.variant + ')' : ''} ฿${v.price_min}–${v.price_max}/${v.unit}`)
  res.status(201).json(db.prepare('SELECT * FROM labor_rates WHERE id=?').get(info.lastInsertRowid))
})
api.put('/labor-rates/:id', financeOnly, (req, res) => {
  const cur = db.prepare('SELECT * FROM labor_rates WHERE id=?').get(req.params.id)
  if (!cur) return res.status(404).json({ error: 'ไม่พบรายการ' })
  const v = laborBody(req.body || {}, cur)
  if (!v.name) return res.status(400).json({ error: 'กรุณากรอกชื่อหมวดงาน' })
  db.prepare('UPDATE labor_rates SET grp=?, seq=?, name=?, variant=?, price_min=?, price_max=?, unit=?, note=?, updated=? WHERE id=?')
    .run(v.grp, v.seq, v.name, v.variant, v.price_min, v.price_max, v.unit, v.note, new Date().toISOString().slice(0, 10), cur.id)
  audit(req, 'แก้ราคากลางค่าแรง', `${v.name}${v.variant ? ' (' + v.variant + ')' : ''} ฿${v.price_min}–${v.price_max}/${v.unit}`)
  res.json(db.prepare('SELECT * FROM labor_rates WHERE id=?').get(cur.id))
})
api.delete('/labor-rates/:id', financeOnly, (req, res) => {
  const cur = db.prepare('SELECT * FROM labor_rates WHERE id=?').get(req.params.id)
  if (!cur) return res.status(404).json({ error: 'ไม่พบรายการ' })
  // ปิดการใช้งานแทนลบจริง — ช่างที่เคยจ้างด้วยหมวดนี้ยังอ้างอิงชื่อ/หน่วยได้
  db.prepare('UPDATE labor_rates SET active=0, updated=? WHERE id=?').run(new Date().toISOString().slice(0, 10), cur.id)
  audit(req, 'ลบราคากลางค่าแรง', cur.name)
  res.json({ ok: true })
})
// เทียบราคาตกลงกับราคากลาง → 'ถูกกว่า' | 'ตามราคากลาง' | 'สูงกว่า' | 'เสนอราคา' (หมวดที่ไม่มีราคากลาง) | ''
function laborCompare(rate, unitPrice) {
  if (!rate) return ''
  if (!(rate.price_max > 0)) return 'เสนอราคา'
  const p = Number(unitPrice) || 0
  if (!(p > 0)) return ''
  if (p > rate.price_max) return 'สูงกว่า'
  if (p < rate.price_min) return 'ถูกกว่า'
  return 'ตามราคากลาง'
}
// อัปเดตราคากลางจากประวัติสั่งซื้อจริงในระบบ (รายการในใบสั่งซื้อ PO = ราคาที่ซื้อจริง) — เว้นรายการที่ตั้งราคาเอง
api.post('/material-prices/recompute', financeOnly, (req, res) => {
  const pos = db.prepare('SELECT id, items FROM purchase_orders ORDER BY id').all()
  const g = {}
  for (const po of pos) {
    let items = []; try { items = JSON.parse(po.items || '[]') } catch { items = [] }
    for (const it of items) {
      const name = String(it.desc || '').trim(); const up = Number(it.price) || 0; const qty = Number(it.qty) || 0
      if (!name || up <= 0) continue
      const unit = String(it.unit || '').trim()
      const k = nkeyOf(name) + '|' + unit
      const o = g[k] = g[k] || { name, unit, prices: [], qs: 0, amts: 0, pos: new Set(), latest: up }
      o.prices.push(up); o.qs += qty; o.amts += qty > 0 ? qty * up : up; o.pos.add(po.id); o.latest = up
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
  // จ่ายชำระใบสั่งซื้อ (PO เครดิต): ผูก po_id เพื่อตัดยอดค้างจ่าย + กันจ่ายเกินยอดค้าง
  const poId = b.po_id ? Number(b.po_id) : null
  const po = poId ? db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(poId) : null
  if (poId && !po) return res.status(404).json({ error: 'ไม่พบใบสั่งซื้อที่อ้างถึง' })
  if (po) {
    // จ่ายผูก PO ได้เฉพาะ PO เครดิตที่รับของแล้ว — PO เงินสดตัดเงินไปแล้วตอนรับของ (จ่ายซ้ำ = จ่าย 2 รอบ)
    if (po.payment_type !== 'credit') return res.status(400).json({ error: `${po.no} เป็น PO เงินสด — บันทึกตัดเงินไปแล้วตอนรับของ ไม่ต้องทำใบจ่ายซ้ำ` })
    if (!['รับของแล้ว', 'ปิดงาน'].includes(po.status)) return res.status(400).json({ error: `${po.no} ยังไม่รับของ — รับของให้เรียบร้อยก่อนจึงชำระเจ้าหนี้ได้` })
    const paid = db.prepare("SELECT COALESCE(SUM(gross),0) a FROM payments WHERE po_id=? AND COALESCE(status,'') != 'ปฏิเสธ'").get(po.id).a
    const remaining = Math.max(0, (po.amount || 0) - paid)
    if (gross > remaining + 0.5) return res.status(400).json({ error: `จ่ายเกินยอดค้างของ ${po.no} — ค้างจ่ายอยู่ ${baht(remaining)}` })
  }
  const rate = type === '-' ? 0 : (Number(b.wht_rate) || 0)
  const wht = Math.round((gross * rate) / 100)
  const seq = nextSeq('pv', () => Math.max(maxNoSuffix('payments'), db.prepare('SELECT COUNT(*) c FROM payments').get().c + 208))
  const no = `PV-${docYear()}-${String(seq).padStart(4, '0')}`
  const vendorId = db.prepare('SELECT id FROM vendors WHERE name=?').get(String(b.payee))?.id ?? null
  const info = db.prepare('INSERT INTO payments (date,no,payee,type,gross,wht_rate,wht,net,house_code,note,po_id,date_iso,vendor_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(todayTH(), no, b.payee, type, gross, rate, wht, gross - wht, String(b.house_code || po?.house_code || ''), String(b.note || (po ? 'ชำระ ' + po.no : '')), poId, todayISO(), vendorId)
  const row = db.prepare('SELECT * FROM payments WHERE id=?').get(info.lastInsertRowid)
  // ลงบัญชีแยกประเภท: ชำระ PO เครดิต → ตัดเจ้าหนี้การค้า · จ่ายทั่วไป → ค่าแรง/ค่าใช้จ่าย + ภาษีหัก ณ ที่จ่ายค้างนำส่ง
  try { acct.syncPaymentJournal(row) } catch (e) { console.error('journal(payment):', e.message); logJournalIssue('pay', row.id, row.no, e) }
  audit(req, 'บันทึกจ่ายเงิน', `${b.payee} ฿${gross}${po ? ' (ชำระ ' + po.no + ')' : ''}`)
  res.status(201).json(row)
})

// ยอดค้างจ่ายผู้ขาย (จาก PO เครดิต): คงเหลือ = มูลค่า PO − ที่จ่ายผูกใบนั้นแล้ว
api.get('/payables', financeOnly, (_req, res) => {
  const today = todayISO()
  // นับเป็นเจ้าหนี้เมื่อ "รับของแล้ว" เท่านั้น — ให้ตรงกับบัญชี 2010 / เช็คยอด / รายงานเดือน / LINE
  const rows = db.prepare("SELECT * FROM purchase_orders WHERE payment_type='credit' AND status IN ('รับของแล้ว','ปิดงาน') AND COALESCE(amount,0)>0 ORDER BY COALESCE(due_iso,'9999') , id").all().map((po) => {
    const paid = db.prepare("SELECT COALESCE(SUM(gross),0) a FROM payments WHERE po_id=? AND COALESCE(status,'') != 'ปฏิเสธ'").get(po.id).a
    const remaining = Math.max(0, (po.amount || 0) - paid)
    const overdue = !!(po.due_iso && po.due_iso < today && remaining > 0)
    return { po_id: po.id, no: po.no, vendor: po.vendor, date: po.date, due_date: po.due_date, due_iso: po.due_iso, house_code: po.house_code, amount: po.amount, paid, remaining, overdue, status: remaining <= 0 ? 'จ่ายครบ' : overdue ? 'เกินกำหนด' : 'ค้างจ่าย' }
  })
  res.json(rows)
})

// ---------- users (admin only) ----------
api.get('/users', adminOnly, (_req, res) =>
  res.json(db.prepare('SELECT id,name,username,role,status,last_active,signature,position,deny_mods,line_uid FROM users ORDER BY id').all().map((u) => ({ ...u, deny_mods: (() => { try { return JSON.parse(u.deny_mods || '[]') } catch { return [] } })() })))
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
  const filled = backfillSignatures()
  res.json({ ok: true, filled })
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
  const { role, status, deny_mods } = req.body || {}
  const newRole = ['admin', 'accounting', 'site', 'viewer'].includes(role) ? role : u.role
  const newStatus = status ?? u.status
  // กันล็อกทั้งบริษัทออกจากระบบ: ต้องเหลือผู้ดูแลที่ใช้งานได้อย่างน้อย 1 คนเสมอ
  if (u.role === 'admin' && (newRole !== 'admin' || newStatus !== 'ใช้งาน')) {
    const admins = db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin' AND status='ใช้งาน' AND id != ?").get(u.id).c
    if (admins === 0) return res.status(400).json({ error: 'เปลี่ยนไม่ได้ — ต้องเหลือผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน' })
  }
  db.prepare('UPDATE users SET role=?, status=? WHERE id=?').run(newRole, newStatus, u.id)
  // สิทธิ์รายโมดูล: รายชื่อโมดูลที่ "ปิด" สำหรับคนนี้ (แอดมินปิดไม่ได้ — กันล็อกตัวเองออก)
  if (Array.isArray(deny_mods)) {
    const clean = (role ?? u.role) === 'admin' ? [] : deny_mods.filter((k) => MODULE_KEYS.includes(String(k)))
    db.prepare('UPDATE users SET deny_mods=? WHERE id=?').run(JSON.stringify(clean), u.id)
    audit(req, 'ตั้งสิทธิ์รายโมดูล', `${u.name}: ปิด [${clean.join(', ') || 'ไม่มี'}]`)
  }
  res.json(db.prepare('SELECT id,name,username,role,status,last_active,deny_mods FROM users WHERE id=?').get(u.id))
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
function expressCsv(kind, reqPeriod) {
  const toCsv = (head, body) => '﻿' + [head, ...body].map((r) => r.map(csvCell).join(',')).join('\r\n')
  if (kind === 'sales') {
    const rows = db.prepare("SELECT * FROM sales_docs WHERE type IN ('invoice','receipt') ORDER BY date, id").all()
    // ใบเสร็จที่ออกต่อจากใบแจ้งหนี้ = การขายเดียวกัน — ตัดออกจากรายงานภาษีขาย กันนำเข้าซ้ำ
    const invNos = new Set(rows.filter((r) => r.type === 'invoice').map((r) => r.no))
    const list = rows.filter((r) => !(r.type === 'receipt' && r.ref && invNos.has(r.ref)))
    const head = ['วันที่', 'เลขที่เอกสาร', 'ประเภท', 'ชื่อลูกค้า', 'เลขผู้เสียภาษี', 'มูลค่าก่อนภาษี', 'ภาษีขาย(7%)', 'รวมทั้งสิ้น', 'อ้างอิง']
    const body = list.map((r) => [r.date, r.no, r.type === 'invoice' ? 'ใบแจ้งหนี้' : 'ใบเสร็จรับเงิน', r.customer, '', (r.subtotal || 0).toFixed(2), (r.vat || 0).toFixed(2), (r.total || 0).toFixed(2), r.ref || ''])
    return { filename: 'express_ภาษีขาย.csv', content: toCsv(head, body) }
  }
  if (kind === 'purchase') {
    const vmap = new Map(db.prepare('SELECT name,tax_id FROM vendors').all().map((v) => [v.name, v.tax_id]))
    const rows = db.prepare('SELECT * FROM purchase_orders ORDER BY date, id').all()
    const head = ['วันที่', 'เลขที่ PO', 'ชื่อผู้ขาย', 'เลขผู้เสียภาษี', 'รายการ', 'มูลค่าก่อนภาษี', 'ภาษีซื้อ', 'รวมทั้งสิ้น', 'เลขใบกำกับภาษี']
    // ภาษีซื้อจากใบกำกับจริง (vat_amount) — PO ที่ไม่มี VAT รายงาน 0 ไม่ใช่เดา 7/107
    const body = rows.map((r) => { const total = r.amount || 0; const vat = r.vat_amount || 0; return [r.date, r.no, r.vendor, vmap.get(r.vendor) || '', r.item, (total - vat).toFixed(2), vat.toFixed(2), total.toFixed(2), r.tax_invoice_no || ''] })
    return { filename: 'express_ภาษีซื้อ.csv', content: toCsv(head, body) }
  }
  if (kind === 'wht') {
    const rows = db.prepare("SELECT * FROM payments WHERE type IN ('ภงด.3','ภงด.53') ORDER BY date, id").all()
    const head = ['วันที่', 'เลขที่', 'ผู้ถูกหัก', 'ประเภทภาษี', 'ยอดก่อนหัก', 'อัตรา(%)', 'ภาษีหัก', 'จ่ายสุทธิ']
    const body = rows.map((r) => [r.date, r.no, r.payee, r.type, (r.gross || 0).toFixed(2), r.wht_rate, (r.wht || 0).toFixed(2), (r.net || 0).toFixed(2)])
    return { filename: 'express_หักณที่จ่าย.csv', content: toCsv(head, body) }
  }
  // payroll — เลือกงวดได้ (?period=YYYY-MM) · ใช้ snapshot ถ้าปิดงวดแล้ว
  const period = /^\d{4}-\d{2}$/.test(reqPeriod || '') ? reqPeriod : currentPeriod()
  const run = db.prepare('SELECT data FROM payroll_runs WHERE period=?').get(period)
  const rows = run ? JSON.parse(run.data) : computePayroll(period)
  // "เงินได้" สำหรับ ภงด.1 = เงินได้พึงประเมิน (เงินเดือน+OT−หักวันลา) ไม่ใช่ยอดโอนสุทธิหลังหักเบิก/ประกันผลงาน
  const earnedOf = (p) => (p.base || 0) + (p.ot || 0) - (p.leave_deduct || 0)
  const head = ['งวด', 'รหัสพนักงาน', 'ชื่อ-สกุล', 'เลขผู้เสียภาษี', 'เงินเดือน', 'OT', 'ประกันสังคม', 'ภาษีหัก(ภงด.1)', 'เงินได้พึงประเมิน', 'จ่ายสุทธิ', 'ธนาคาร', 'เลขบัญชี']
  const body = rows.map((p) => [period, p.code || '', p.name, p.tax_id || '', (p.base || 0).toFixed(2), (p.ot || 0).toFixed(2), (p.sso || 0).toFixed(2), (p.tax || 0).toFixed(2), earnedOf(p).toFixed(2), netOf(p).toFixed(2), p.bank_name || '', p.bank_acct || ''])
  return { filename: `express_เงินเดือน_${period}.csv`, content: toCsv(head, body) }
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
  const { filename, content } = expressCsv(req.params.kind, req.query.period)
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
    // หมวดงาน + ราคากลางที่ใช้ตอนจ้าง (เทียบราคาตกลงว่าถูกกว่า/ตาม/สูงกว่าราคากลาง)
    const rate = c.labor_rate_id ? db.prepare('SELECT * FROM labor_rates WHERE id=?').get(c.labor_rate_id) : null
    const rate_label = rate ? rate.name + (rate.variant ? ' (' + rate.variant + ')' : '') : ''
    const vend = c.vendor_id ? db.prepare('SELECT category, type FROM vendors WHERE id=?').get(c.vendor_id) : null
    return { ...c, work_total, work_paid, eval_avg: ev?.avg ?? null, eval_grade: ev?.grade ?? null, adv_total, deduct_total, adv_left: adv_total - deduct_total,
      rate_label, rate_unit: rate?.unit || '', rate_min: rate?.price_min ?? null, rate_max: rate?.price_max ?? null, price_vs: laborCompare(rate, c.unit_price),
      vendor_category: vend?.category || '', vendor_type: vend?.type || '' }
  }))
})
// ช่องราคาจ้างของช่าง: หมวดงาน (labor_rate_id) · ปริมาณ · ราคาตกลง/หน่วย · ยอดตกลงรวม · เหตุผลถ้าสูงกว่าราคากลาง
function contractorPricing(b, cur = {}) {
  const num = (k, d) => (b[k] != null && b[k] !== '' ? Number(String(b[k]).replace(/,/g, '')) || 0 : d)
  const labor_rate_id = b.labor_rate_id != null ? (Number(b.labor_rate_id) || null) : (cur.labor_rate_id ?? null)
  const qty = num('qty', cur.qty ?? 0)
  const unit_price = num('unit_price', cur.unit_price ?? 0)
  const auto = qty > 0 && unit_price > 0 ? Math.round(qty * unit_price * 100) / 100 : 0
  const explicitTotal = b.contract_total != null && b.contract_total !== ''
  let contract_total = explicitTotal ? num('contract_total', 0) : (cur.contract_total ?? 0)
  // ยอดรวมเดิมเป็นค่าที่ระบบคำนวณ (ปริมาณ × ราคา) แล้วปริมาณ/ราคาเปลี่ยน → คำนวณใหม่ตาม (ถ้ากรอกยอดรวมเองไว้ จะไม่ทับ)
  const oldAuto = (cur.qty || 0) > 0 && (cur.unit_price || 0) > 0 ? Math.round(cur.qty * cur.unit_price * 100) / 100 : 0
  const changed = qty !== (cur.qty || 0) || unit_price !== (cur.unit_price || 0)
  if (!explicitTotal && changed && auto > 0 && (!(contract_total > 0) || Math.abs(contract_total - oldAuto) < 0.01)) contract_total = auto
  if (!(contract_total > 0) && auto > 0) contract_total = auto
  const price_note = b.price_note != null ? String(b.price_note).trim() : (cur.price_note || '')
  // เลือกจากทะเบียนผู้รับเหมา → เก็บ vendor_id (ต้องเป็นรายที่อยู่ในทะเบียนจริง)
  let vendor_id = b.vendor_id !== undefined ? (Number(b.vendor_id) || null) : (cur.vendor_id ?? null)
  if (vendor_id && !db.prepare("SELECT id FROM vendors WHERE id=? AND kind='ผู้รับเหมา'").get(vendor_id)) vendor_id = null
  return { labor_rate_id, qty, unit_price, contract_total, price_note, vendor_id }
}
api.put('/contractors/:id', canWrite, (req, res) => {
  const cur = db.prepare('SELECT * FROM contractors WHERE id=?').get(req.params.id)
  if (!cur) return res.status(404).json({ error: 'ไม่พบช่าง/ผู้รับเหมา' })
  const b = req.body || {}
  const name = b.name != null ? String(b.name).trim() : cur.name
  if (!name) return res.status(400).json({ error: 'กรุณากรอกชื่อช่าง/ผู้รับเหมา' })
  const p = contractorPricing(b, cur)
  const rate = p.labor_rate_id ? db.prepare('SELECT * FROM labor_rates WHERE id=?').get(p.labor_rate_id) : null
  db.prepare('UPDATE contractors SET name=?, role=?, type=?, note=?, labor_rate_id=?, qty=?, unit_price=?, contract_total=?, price_note=?, vendor_id=? WHERE id=?')
    .run(name, b.role != null ? String(b.role) : cur.role, b.type != null ? String(b.type) : cur.type, b.note != null ? String(b.note) : cur.note,
      p.labor_rate_id, p.qty, p.unit_price, p.contract_total, p.price_note, p.vendor_id, cur.id)
  // ชื่อช่างเปลี่ยน → งวดงานช่างที่ผูกชื่อเดิมต้องตามไปด้วย (ยอดจ่ายช่างคิดจากชื่อ)
  if (name !== cur.name) db.prepare("UPDATE installments SET contractor=? WHERE house_code=? AND side='contractor' AND contractor=?").run(name, cur.house_code, cur.name)
  if (laborCompare(rate, p.unit_price) === 'สูงกว่า') audit(req, 'จ้างช่างสูงกว่าราคากลาง', `${name} · ${rate.name} ฿${p.unit_price}/${rate.unit} (ราคากลาง ${rate.price_min}–${rate.price_max}) ${p.price_note ? '· ' + p.price_note : ''}`)
  res.json({ ...db.prepare('SELECT * FROM contractors WHERE id=?').get(cur.id), price_vs: laborCompare(rate, p.unit_price) })
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
  const a = db.prepare('SELECT * FROM contractor_advances WHERE id=?').get(req.params.id)
  db.prepare('DELETE FROM contractor_advances WHERE id=?').run(req.params.id)
  if (a) audit(req, 'ลบเงินเบิกล่วงหน้าช่าง', `${a.contractor || ''} ${baht(a.amount || 0)}`)
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
  const synced = syncApprovalStatuses() // จำนวนผู้อนุมัติลดลง → ใบที่ครบแล้วเปลี่ยนเป็น "อนุมัติ" ทันที
  res.json({ ...next, synced })
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
    (() => { const c = payablesCheck(); return { label: 'เจ้าหนี้การค้า (บัญชี 2010) ↔ ยอดค้างจ่าย PO', a: 'ตามบัญชี', av: c.gl_2010, b: 'ตามใบ PO', bv: c.payable_remaining } })(),
  ].map((r) => ({ ...r, diff: Math.round((r.av - r.bv) * 100) / 100, ok: Math.abs(r.av - r.bv) < 1 }))

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
    db.prepare("INSERT INTO installments (house_code,no,detail,days,due,amount,paid,status,side,category) VALUES (?,?,?,?,?,?,0,'รอเก็บเงิน','customer','house')")
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
// สร้างใบสั่งงาน (ใช้ร่วมกัน: หน้าเว็บ / สั่งงานด้วยเสียง / บอท LINE)
function createWorkOrder(b, byName) {
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
      b.reviewer || byName, b.executor || '', b.executor_code || '', b.project || '', b.house_code || '',
      b.scope || '', JSON.stringify(b.dod || {}), b.budget || '', 'สั่งงาน', byName, todayTH(),
      urgent, nowTS(), deadlineMin, b.executor_code || '', b.executor || '', nowTS(), '[]', b.source || '')
  const wo = db.prepare('SELECT * FROM work_orders WHERE id=?').get(info.lastInsertRowid)
  // แจ้งผู้รับทาง LINE ถ้าผูกไว้ (สั่งจากหน้าเว็บ/เสียงก็แจ้ง — บอท LINE แจ้งเองอยู่แล้ว)
  if (b.source !== 'line' && wo.executor) {
    const toUid = lineUidOfExecutor(wo.executor, wo.executor_code)
    if (toUid) linePush(toUid, [`📌 งานใหม่จาก ${byName}${urgent ? ' 🔴 ด่วน' : ''} — ตอบ 'รับ' เพื่อรับทราบ`, woFlex(wo, { forAssignee: true })])
    // สำเนาให้ผู้สั่งใน LINE ด้วย (ถ้าผูกไว้) — สั่งจากหน้าเว็บ/เสียงก็ได้การ์ดเหมือนกัน
    const byUid = lineUidOfName(byName); if (byUid && byUid !== toUid) linePush(byUid, woFlex(wo, { footer: toUid ? 'สำเนาสำหรับผู้สั่ง · ส่งถึงผู้รับทาง LINE แล้ว' : 'สำเนาสำหรับผู้สั่ง · ผู้รับยังไม่ผูก LINE' }))
  }
  return wo
}
function ackWorkOrder(d, byName) {
  db.prepare("UPDATE work_orders SET ack=1, ack_by=?, ack_date=?, ack_ts=?, seen=1, seen_ts=COALESCE(NULLIF(seen_ts,''),?), status=CASE WHEN status='สั่งงาน' THEN 'รับทราบ' ELSE status END WHERE id=?")
    .run(byName, todayTH(), nowTS(), nowTS(), d.id)
}
api.post('/work-orders', canWrite, (req, res) => {
  const b = req.body || {}
  if (!b.project && !b.scope) return res.status(400).json({ error: 'กรุณากรอกชื่องาน/ขอบเขตงาน' })
  const wo = createWorkOrder(b, req.user.name)
  audit(req, wo.urgent ? 'สั่งงานด่วน' : 'สร้างใบสั่งงาน', `${wo.no} → ${b.executor || '-'}`)
  res.status(201).json(woRow(wo))
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
  ackWorkOrder(d, req.user.name)
  audit(req, 'รับทราบใบสั่งงาน', d.no)
  const ceoUid = lineUidOfName(d.by); if (ceoUid) linePush(ceoUid, `✓ ${req.user.name} รับทราบงาน ${d.no} แล้ว (${d.project || d.scope})`)
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
          const ceoUid = lineUidOfName(w.by); if (ceoUid) linePush(ceoUid, `⏰ งานด่วน ${w.no} เกินกำหนด ${deadline} นาที ยังไม่มีใครรับทราบ (${w.project || w.scope}) → โยนให้ ${last ? last.name : (w.esc_name || w.executor)}`)
          const lastUid = last ? lineUidOfName(last.name) : null; if (lastUid) linePush(lastUid, `⏰ งานด่วนตกมาถึงคุณ ${w.no}: ${w.project || w.scope}\nตอบ 'รับ' เพื่อรับทราบ`)
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
          const nextUid = lineUidOfName(next.name); if (nextUid) linePush(nextUid, `🔴 งานด่วน ${w.no} ยังไม่มีคนรับ → ส่งต่อถึงคุณ: ${w.project || w.scope}\nตอบ 'รับ' เพื่อรับทราบ`)
        }
      }
    }
  } catch (e) { console.error('escalateUrgent failed:', e.message) }
}
function safeJson(s) { try { return JSON.parse(s || '[]') } catch { return [] } }
setInterval(escalateUrgent, 20 * 1000) // ตรวจทุก 20 วินาที
// ฟีดสถานะงานด่วนสำหรับ CEO — เวลา ส่ง/เห็น/รับทราบ + สายไล่ระดับ + นับถอยหลัง
// เดาผู้รับจากข้อความ (ชื่อเต็ม/ชื่อจริง/ชื่อเล่น) — หน้าสั่งงานด้วยเสียงใช้กติกาเดียวกับบอท LINE
api.post('/line/parse', requireAuth, (req, res) => res.json(parseLineCommand(String(req.body?.text || ''))))
api.post('/employees/match', requireAuth, (req, res) => {
  const emps = db.prepare("SELECT code, name, nickname FROM employees WHERE status IS NULL OR status NOT IN ('ลาออก')").all()
  res.json({ match: matchEmployee(String(req.body?.text || ''), emps) })
})
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
  const p = contractorPricing(b)
  const rate = p.labor_rate_id ? db.prepare('SELECT * FROM labor_rates WHERE id=?').get(p.labor_rate_id) : null
  // ไม่ได้พิมพ์งานที่รับผิดชอบ แต่เลือกหมวดงานไว้ → ใช้ชื่อหมวดเป็นงานที่รับผิดชอบ
  const role = String(b.role || '').trim() || (rate ? rate.name + (rate.variant ? ' (' + rate.variant + ')' : '') : '')
  const info = db.prepare('INSERT INTO contractors (house_code,name,role,type,advance,deducted,paid,note,labor_rate_id,qty,unit_price,contract_total,price_note,vendor_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(req.params.code, b.name, role, b.type || 'เหมารวม', Number(b.advance) || 0, Number(b.deducted) || 0, Number(b.paid) || 0, b.note || '',
      p.labor_rate_id, p.qty, p.unit_price, p.contract_total, p.price_note, p.vendor_id)
  if (laborCompare(rate, p.unit_price) === 'สูงกว่า') audit(req, 'จ้างช่างสูงกว่าราคากลาง', `${b.name} · ${rate.name} ฿${p.unit_price}/${rate.unit} (ราคากลาง ${rate.price_min}–${rate.price_max}) ${p.price_note ? '· ' + p.price_note : ''}`)
  res.status(201).json({ ...db.prepare('SELECT * FROM contractors WHERE id=?').get(info.lastInsertRowid), price_vs: laborCompare(rate, p.unit_price) })
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
  const seq = nextSeq('sales-' + kind, () => Math.max(maxNoSuffix('sales_docs'), db.prepare('SELECT COUNT(*) c FROM sales_docs WHERE type=?').get(kind).c))
  const no = `${prefix}-${docYear()}-${String(seq).padStart(4, '0')}`
  const info = db
    .prepare('INSERT INTO sales_docs (type,no,customer,date,date_iso,items,subtotal,vat,total,status,house_code) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(kind, no, customer, todayTH(), todayISO(), JSON.stringify(list), subtotal, vat, subtotal + vat, kind === 'receipt' ? 'ชำระแล้ว' : 'รออนุมัติ', house_code || '')
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
// ต่อสายเอกสารขาย: ใบเสนอราคา → ใบแจ้งหนี้ → ใบเสร็จรับเงิน (สำเนารายการ + อ้างอิงใบต้นทาง)
api.post('/sales-docs/:id/derive', canWrite, (req, res) => {
  const src = db.prepare('SELECT * FROM sales_docs WHERE id=?').get(req.params.id)
  if (!src) return res.status(404).json({ error: 'ไม่พบเอกสาร' })
  const to = String(req.body?.to || '')
  const allowed = { quote: 'invoice', invoice: 'receipt' }
  if (allowed[src.type] !== to) return res.status(400).json({ error: 'แปลงได้เฉพาะ ใบเสนอราคา→ใบแจ้งหนี้ และ ใบแจ้งหนี้→ใบเสร็จรับเงิน' })
  const dup = db.prepare('SELECT no FROM sales_docs WHERE type=? AND ref=?').get(to, src.no)
  if (dup) return res.status(409).json({ error: `ออก${to === 'invoice' ? 'ใบแจ้งหนี้' : 'ใบเสร็จ'}จากใบนี้ไปแล้ว (${dup.no})` })
  const prefix = { invoice: 'INV', receipt: 'RC' }[to]
  const seq = nextSeq('sales-' + to, () => Math.max(maxNoSuffix('sales_docs'), db.prepare('SELECT COUNT(*) c FROM sales_docs WHERE type=?').get(to).c))
  const no = `${prefix}-${docYear()}-${String(seq).padStart(4, '0')}`
  const info = db.prepare('INSERT INTO sales_docs (type,no,customer,date,date_iso,items,subtotal,vat,total,status,house_code,ref) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(to, no, src.customer, todayTH(), todayISO(), src.items, src.subtotal, src.vat, src.total, to === 'receipt' ? 'ชำระแล้ว' : 'รอชำระ', src.house_code || '', src.no)
  // ใบเสนอราคาที่เซ็นสัญญาแล้ว คงสถานะสัญญาไว้ (สำคัญกว่า) — ใบอื่นอัปเดตตามขั้น
  if (src.status !== 'เซ็นสัญญาแล้ว') db.prepare('UPDATE sales_docs SET status=? WHERE id=?').run(to === 'invoice' ? 'ออกใบแจ้งหนี้แล้ว' : 'ชำระแล้ว', src.id)
  audit(req, to === 'invoice' ? 'ออกใบแจ้งหนี้จากใบเสนอราคา' : 'ออกใบเสร็จจากใบแจ้งหนี้', `${src.no} → ${no}`)
  res.status(201).json(db.prepare('SELECT * FROM sales_docs WHERE id=?').get(info.lastInsertRowid))
})
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
  // งวดลูกค้า: "เลยกำหนด" คิดสดจาก due_iso (รวมของเก่าที่มาร์กสถานะไว้ด้วย)
  for (const r of db.prepare("SELECT * FROM installments WHERE side != 'contractor' AND status != 'เก็บแล้ว'").all()) {
    const over = r.status === 'เลยกำหนด' || (r.due_iso && r.due_iso < todayISO && (r.paid || 0) < (r.amount || 0))
    if (over) out.push({ kind: 'overdue', icon: 'danger', title: `งวด ${r.no} เลยกำหนด`, sub: `${r.house_code} · ฿${r.amount.toLocaleString('en-US')}${r.due ? ' · ครบ ' + r.due : ''}`, page: 'installments' })
    else if (r.status === 'รอเก็บเงิน') out.push({ kind: 'collect', icon: 'warn', title: `รอเก็บงวด ${r.no}`, sub: `${r.house_code} · ครบ ${r.due}`, page: 'installments' })
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
  // สำรองข้อมูล: เตือนแอดมินเมื่อ backup ค้างเกิน 2 วัน / สำรองนอกเครื่องล้มเหลว / ยังไม่ได้ตั้งสำรองนอกเครื่อง
  if (req.user.role === 'admin') {
    try {
      const last = JSON.parse(getSetting('backup_last', '') || 'null')
      const cut = isoDate(new Date(Date.now() - 2 * 86400000))
      if (!last || last.day < cut)
        out.push({ kind: 'backup', icon: 'danger', title: 'ยังไม่มีสำรองข้อมูลล่าสุด (เกิน 2 วัน)', sub: `สำรองล่าสุด: ${last?.day || 'ไม่เคย'} — ไปที่ ผู้ใช้งาน → สำรองข้อมูล`, page: 'users' })
      const ms = JSON.parse(getSetting('backup_mirror_status', '') || 'null')
      if (ms && ms.ok === false)
        out.push({ kind: 'backup', icon: 'warn', title: 'สำรองนอกเครื่องล้มเหลว', sub: `${ms.dir} · ${ms.msg || ''} — เช็คว่าไดรฟ์เสียบอยู่/พาธถูกต้อง`, page: 'users' })
      else if (!getSetting('backup_mirror_dir', ''))
        out.push({ kind: 'backup', icon: 'info', title: 'ยังไม่ได้ตั้งสำรองนอกเครื่อง', sub: 'ถ้าเครื่องนี้พัง ข้อมูลจะหายทั้งหมด — ตั้งโฟลเดอร์สำรอง (External/OneDrive/Google Drive) ที่ ผู้ใช้งาน', page: 'users' })
    } catch { /* ignore */ }
  }
  // วัสดุในสต๊อกใกล้หมด (ต่ำกว่าจุดสั่งซื้อ) — เตือนคนที่เห็นงานจัดซื้อ
  if (canSeeSalary(req.user) || mgr) {
    for (const it of db.prepare('SELECT * FROM stock_items WHERE min_qty > 0 AND qty < min_qty ORDER BY qty').all())
      out.push({ kind: 'stock-low', icon: 'warn', title: `${it.name} ใกล้หมดสต๊อก`, sub: `เหลือ ${it.qty} ${it.unit || ''} (จุดสั่งซื้อ ${it.min_qty})`, page: 'stock' })
  }
  // รายการลงบัญชีไม่สำเร็จ — เตือนฝ่ายการเงิน/แอดมิน (หายเองเมื่อลงสำเร็จ)
  if (['admin', 'accounting'].includes(req.user.role)) {
    const ji = db.prepare('SELECT COUNT(*) c FROM journal_issues').get().c
    if (ji > 0) {
      const first = db.prepare('SELECT * FROM journal_issues ORDER BY id DESC LIMIT 1').get()
      out.push({ kind: 'journal-issue', icon: 'danger', title: `ลงบัญชีไม่สำเร็จ ${ji} รายการ — ต้องตรวจ`, sub: `ล่าสุด: ${first.ref || first.source} · ${first.message}`.slice(0, 120), page: 'accounting' })
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
// ===== รายงานผู้บริหารประจำเดือน — ตัวเลขหลักจากบัญชีแยกประเภท (GL) + ยอดค้างจริง =====
function monthlyReport(period) {
  const [yy, mm] = period.split('-').map(Number)
  const from = `${period}-01`
  const to = `${period}-${String(new Date(yy, mm, 0).getDate()).padStart(2, '0')}`
  const is = acct.incomeStatement({ from, to })
  const cf = acct.cashFlow({ from, to })
  const expMonth = db.prepare("SELECT COALESCE(SUM(amount),0) a, COUNT(*) n FROM expenses WHERE COALESCE(status,'') != 'ปฏิเสธ' AND date_iso >= ? AND date_iso <= ?").get(from, to)
  // เงินเดือนของงวด: คำนวณสุทธิใหม่จาก snapshot รายคน (total ที่เก็บไว้อาจมาจากสูตรเวอร์ชันเก่า)
  const payrollRun = (() => {
    const run = db.prepare('SELECT total, data FROM payroll_runs WHERE period=?').get(period)
    if (!run) return null
    try { return { total: JSON.parse(run.data).reduce((s, p) => s + netOf(p), 0) } } catch { return { total: run.total } }
  })()
  const today = todayISO()
  let arTotal = 0, arOverdue = 0
  for (const r of db.prepare("SELECT amount, COALESCE(paid,0) paid, due_iso FROM installments WHERE side != 'contractor' AND status != 'เก็บแล้ว'").all()) {
    const rem = Math.max(0, (r.amount || 0) - r.paid)
    arTotal += rem
    if (rem > 0 && r.due_iso && r.due_iso < today) arOverdue += rem
  }
  let apTotal = 0, apOverdue = 0
  for (const po of db.prepare("SELECT id, amount, due_iso FROM purchase_orders WHERE payment_type='credit' AND status IN ('รับของแล้ว','ปิดงาน')").all()) {
    const paid = db.prepare("SELECT COALESCE(SUM(gross),0) a FROM payments WHERE po_id=? AND COALESCE(status,'') != 'ปฏิเสธ'").get(po.id).a
    const rem = Math.max(0, (po.amount || 0) - paid)
    apTotal += rem
    if (rem > 0 && po.due_iso && po.due_iso < today) apOverdue += rem
  }
  const houseRows = db.prepare('SELECT status, COUNT(*) c FROM houses GROUP BY status').all()
  return {
    period, label: periodLabelTH(period), from, to,
    pnl: { revenue: is.totalRevenue, cost: is.totalCost, expense: is.totalExpense, grossProfit: is.grossProfit, netProfit: is.netProfit },
    cash: { opening: cf.opening, closing: cf.closing, net: cf.netChange },
    spend: { expenses: expMonth.a, expenseCount: expMonth.n, payroll: payrollRun ? payrollRun.total : null },
    ar: { total: arTotal, overdue: arOverdue },
    ap: { total: apTotal, overdue: apOverdue },
    houses: Object.fromEntries(houseRows.map((h) => [h.status || 'อื่นๆ', h.c])),
    issuesOpen: db.prepare("SELECT COUNT(*) c FROM issues WHERE status != 'แก้ไขแล้ว'").get().c,
    journalIssues: db.prepare('SELECT COUNT(*) c FROM journal_issues').get().c,
  }
}
api.get('/reports/monthly', financeOnly, (req, res) => {
  const period = /^\d{4}-\d{2}$/.test(req.query.period) ? req.query.period : currentPeriod()
  res.json(monthlyReport(period))
})
// ส่งสรุปเดือนเข้ากลุ่ม LINE (ใช้การตั้งค่า LINE เดียวกับสรุปเช้า)
api.post('/reports/monthly/send-line', financeOnly, async (req, res) => {
  const period = /^\d{4}-\d{2}$/.test(req.body?.period) ? req.body.period : currentPeriod()
  const r = monthlyReport(period)
  const txt = `📊 PPSD สรุปประจำเดือน ${r.label}\n\n` +
    `กำไรสุทธิ (ตามบัญชี): ${baht(r.pnl.netProfit)}\n` +
    `— รายได้ ${baht(r.pnl.revenue)} · ต้นทุน ${baht(r.pnl.cost)} · ค่าใช้จ่าย ${baht(r.pnl.expense)}\n` +
    `เงินสดปลายเดือน: ${baht(r.cash.closing)} (${r.cash.net >= 0 ? '+' : ''}${baht(r.cash.net)} ในเดือน)\n` +
    `รายจ่ายเดือนนี้ ${r.spend.expenseCount} ใบ รวม ${baht(r.spend.expenses)}${r.spend.payroll != null ? ` · เงินเดือน ${baht(r.spend.payroll)}` : ' · เงินเดือน (ยังไม่ปิดงวด)'}\n` +
    `ลูกหนี้ค้างเก็บ ${baht(r.ar.total)}${r.ar.overdue ? ` (เลยกำหนด ${baht(r.ar.overdue)})` : ''}\n` +
    `เจ้าหนี้ค้างจ่าย ${baht(r.ap.total)}${r.ap.overdue ? ` (เลยกำหนด ${baht(r.ap.overdue)})` : ''}\n` +
    `ปัญหาหน้างานค้าง ${r.issuesOpen} เรื่อง${r.journalIssues ? ` · ⚠️ ลงบัญชีไม่สำเร็จ ${r.journalIssues} รายการ` : ''}`
  try { await sendLine(txt); audit(req, 'ส่งสรุปเดือนเข้า LINE', r.label); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

api.get('/reports', financeOnly, (_req, res) => {
  const houses = db.prepare('SELECT * FROM houses').all()
  const expenses = db.prepare("SELECT * FROM expenses WHERE COALESCE(status,'') != 'ปฏิเสธ'").all()
  // ใบจ่ายเงินที่นับเป็น "ต้นทุน" = ใบที่ไม่ใช่การชำระ PO (การชำระ PO นับต้นทุนไปแล้วในรายจ่ายตอนรับของ — นับซ้ำ = เบิ้ล)
  const costPays = db.prepare("SELECT house_code, gross, net FROM payments WHERE po_id IS NULL AND COALESCE(status,'') != 'ปฏิเสธ'").all()
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
  for (const p of costPays) if (p.house_code) payByHouse[p.house_code] = (payByHouse[p.house_code] || 0) + (p.gross || 0)
  // รวมค่าใช้จ่ายที่ผูกบ้านเข้ากำไรรายโครงการด้วย
  for (const code in payByHouse) { const p = houseProj[code]; if (p && byProject[p]) byProject[p].expense += payByHouse[code] }
  // ----- งบกระแสเงินสด (สรุปเงินเข้า/ออก) -----
  const inCustomer = houses.reduce((s, h) => s + (h.collected || 0), 0)
  const outContractor = houses.reduce((s, h) => s + (h.paid || 0), 0)
  const outMaterial = expenses.reduce((s, e) => s + e.amount, 0)
  const outPayroll = db.prepare('SELECT COALESCE(SUM(total),0) a FROM payroll_runs').get().a
  // ไม่รวมใบจ่ายชำระ PO — เงินซื้อของนับไว้แล้วใน outMaterial (นับอีกรอบ = เงินออกเบิ้ล)
  const outOther = costPays.reduce((s, p) => s + (p.net || 0), 0)
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
api.get('/dashboard', (req, res) => {
  const houses = db.prepare('SELECT * FROM houses').all()
  const sum = (k) => houses.reduce((s, h) => s + h[k], 0)
  const collected = sum('collected')
  const expense = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM expenses WHERE COALESCE(status,'') != 'ปฏิเสธ'").get().s
  const nameByCode = Object.fromEntries(houses.map((h) => [h.code, h.name]))
  // live alert panels — "เลยกำหนด" คิดสดจากวันครบกำหนด (due_iso) ไม่ต้องรอใครไปแก้สถานะ
  const today = todayISO()
  const daysOverdue = (dueIso) => {
    const t = Date.parse(dueIso)
    if (Number.isNaN(t)) return 0
    return Math.max(0, Math.round((Date.now() - t) / 86400000))
  }
  const custInst = db.prepare("SELECT * FROM installments WHERE side != 'contractor' AND status != 'เก็บแล้ว' ORDER BY id").all()
  const isOver = (r) => r.status === 'เลยกำหนด' || (r.due_iso && r.due_iso < today && (r.paid || 0) < (r.amount || 0))
  const overdueList = custInst.filter(isOver)
    .map((r) => ({ house: nameByCode[r.house_code] || r.house_code, no: String(r.no), detail: r.detail, amount: '฿' + r.amount.toLocaleString('en-US'), days: daysOverdue(r.due_iso || parseAnyDateISO(r.due) || '') }))
  const toCollectList = custInst.filter((r) => r.status === 'รอเก็บเงิน' && !isOver(r))
    .map((r) => ({ house: nameByCode[r.house_code] || r.house_code, detail: `งวด ${r.no} · ${r.detail}`, amount: '฿' + r.amount.toLocaleString('en-US') }))
  const advanceList = db.prepare('SELECT * FROM contractors WHERE advance > deducted ORDER BY id').all()
    .map((c) => ({ name: c.name, house: nameByCode[c.house_code] || c.house_code, remain: '฿' + (c.advance - c.deducted).toLocaleString('en-US') }))
  // ตัวเลขเงินรวมบริษัท เห็นเฉพาะคนที่มีสิทธิ์ด้านการเงิน/ผู้จัดการ (role อื่นเห็นเฉพาะสถานะงาน)
  const seeMoney = canSeeSalary(req.user) || isManager(req.user)
  // เงินสดสุทธิ = ยอดคงเหลือบัญชีเงินสด+ธนาคารตามบัญชีแยกประเภท (ไม่ใช่ เก็บ−รายจ่าย ซึ่งไม่รวมค่าช่าง/เงินเดือน)
  let cashNet = null
  if (seeMoney) { try { cashNet = acct.cashBalance() } catch { cashNet = null } }
  res.json({
    building: houses.filter((h) => h.status === 'กำลังสร้าง').length,
    delivered: houses.filter((h) => h.status === 'ส่งมอบแล้ว').length,
    afterService: houses.filter((h) => h.status === 'after-service').length,
    collected: seeMoney ? collected : null,
    remain: seeMoney ? sum('remain') : null,
    contractValue: seeMoney ? sum('value') : null,
    expense: seeMoney ? expense : null,
    net: seeMoney ? cashNet : null,
    overdue: overdueList.length,
    openIssues: db.prepare("SELECT COUNT(*) c FROM issues WHERE status!='แก้ไขแล้ว'").get().c,
    overdueList,
    toCollectList,
    advanceList: seeMoney ? advanceList : [],
  })
})

// ---------- audit log + database backup (admin only) ----------
api.get('/audit', adminOnly, (_req, res) => res.json(db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 300').all()))
api.get('/backup', adminOnly, (_req, res) => {
  db.pragma('wal_checkpoint(TRUNCATE)')
  const file = dbFile
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
    writeFileSync(join(backupDir, 'ppsd-before-restore.sqlite'), readFileSync(dbFile))
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
  // ไฟล์ JS/CSS มีรหัส (hash) ในชื่อไฟล์อยู่แล้ว → แคชยาวได้ (เปลี่ยนโค้ด = ชื่อไฟล์เปลี่ยน)
  // แต่ index.html ต้อง "ไม่แคช" — ดึงใหม่ทุกครั้ง เพื่อให้ชี้ไปไฟล์ JS เวอร์ชันล่าสุดเสมอ
  // ผล: อัปเดตโปรแกรม + รีสตาร์ท แล้วผู้ใช้กด F5 ทีเดียวเห็นของใหม่เลย (ไม่ต้องล้างแคช)
  app.use(express.static(distDir, {
    etag: true,
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache, must-revalidate')
      else if (/[\\/]assets[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    },
  }))
  // SPA fallback for any non-API GET — index.html ห้ามแคชเช่นกัน
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate')
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

// ---------- auto-backup: ฐานข้อมูล + ไฟล์แนบ ทุกวัน · เก็บรายวัน 30 วัน + ต้นเดือน 12 เดือน ----------
const backupDir = process.env.PPSD_DB ? join(dirname(dbFile), 'backups') : join(__dirname, 'data', 'backups')
// เกณฑ์เก็บไฟล์สำรอง: รายวันเก็บ 30 วัน · ไฟล์ของ "วันที่ 1" เก็บยาว 12 เดือน (ไว้ย้อนดูข้ามเดือน)
function pruneBackups(dir) {
  const cutDaily = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const cutMonthly = new Date(Date.now() - 366 * 86400000).toISOString().slice(0, 10)
  for (const f of readdirSync(dir).filter((f) => /^ppsd-auto-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f))) {
    const day = f.slice(10, 20)
    const keepMonthly = day.endsWith('-01') && day >= cutMonthly
    if (day < cutDaily && !keepMonthly) { try { unlinkSync(join(dir, f)) } catch { /* ignore */ } }
  }
}
// สำรอง "ไฟล์แนบ" (ใบส่งของ/เอกสารบ้าน ฯลฯ ใน data/files) — ไฟล์เขียนครั้งเดียวไม่แก้ จึงก๊อปเฉพาะที่ยังไม่มี
function copyNewFiles(destRoot) {
  const dest = join(destRoot, 'files')
  mkdirSync(dest, { recursive: true })
  if (!existsSync(uploadsDir)) return 0
  let copied = 0
  const have = new Set(readdirSync(dest))
  for (const f of readdirSync(uploadsDir)) {
    if (have.has(f)) continue
    try { writeFileSync(join(dest, f), readFileSync(join(uploadsDir, f))); copied++ } catch { /* ignore */ }
  }
  return copied
}
// สำเนาสำรองไปโฟลเดอร์นอกเครื่อง (External drive / Google Drive / OneDrive / \\เครื่องอื่น)
// กันเครื่องเซิร์ฟเวอร์พังแล้วข้อมูลหาย — ตั้งพาธในหน้าผู้ใช้งาน
// ทำใน "process ลูก" พร้อม timeout: ถ้าปลายทางค้าง (network drive หลุด) เซิร์ฟเวอร์หลักต้องไม่ค้างตาม
function mirrorBackup(srcFile, day) {
  return new Promise((resolve) => {
    const dir = getSetting('backup_mirror_dir', '')
    if (!dir) return resolve(null)
    execFile(process.execPath, [join(__dirname, 'mirror-copy.js'), srcFile, uploadsDir, dir, day], { timeout: 120000 }, (err, stdout) => {
      let st
      if (err) st = { at: todayTH(), ok: false, dir, msg: err.killed ? 'หมดเวลา — ปลายทางไม่ตอบสนอง (ไดรฟ์หลุด/เครือข่ายล่ม?)' : String(err.message || err).slice(0, 300) }
      else { try { st = { at: todayTH(), dir, ...JSON.parse(String(stdout)) } } catch { st = { at: todayTH(), ok: true, dir } } }
      setSetting('backup_mirror_status', JSON.stringify(st))
      if (!st.ok) console.error('mirror-backup failed:', st.msg)
      resolve(st)
    })
  })
}
async function autoBackup() {
  try {
    mkdirSync(backupDir, { recursive: true })
    db.pragma('wal_checkpoint(TRUNCATE)')
    const day = todayISO() // วันตามเวลาเครื่อง (ไทย) — ไม่ใช่ UTC ที่จะข้ามวันตอน 7 โมงเช้า
    const file = join(backupDir, `ppsd-auto-${day}.sqlite`)
    writeFileSync(file, readFileSync(dbFile))
    copyNewFiles(backupDir)
    pruneBackups(backupDir)
    setSetting('backup_last', JSON.stringify({ day, at: nowTS(), size: statSync(file).size }))
    await mirrorBackup(file, day) // สำเนาไปนอกเครื่องด้วย (ถ้าตั้งไว้) — ทำใน process ลูก ไม่บล็อกระบบ
  } catch (e) {
    console.error('auto-backup failed:', e.message)
    setSetting('backup_last_error', JSON.stringify({ at: nowTS(), msg: e.message }))
  }
}
autoBackup() // one on boot
// เช็คทุกชั่วโมง: ถ้าวันนี้ยังไม่มีไฟล์สำรอง (เครื่องเพิ่งเปิด/ข้ามเที่ยงคืน) ให้สำรองทันที
setInterval(() => {
  const day = todayISO()
  if (!existsSync(join(backupDir, `ppsd-auto-${day}.sqlite`))) autoBackup()
}, 60 * 60 * 1000)
// list available auto-backups (admin)
api.get('/backups', adminOnly, (_req, res) => {
  try {
    const files = readdirSync(backupDir).filter((f) => f.startsWith('ppsd-auto-')).sort().reverse()
    res.json(files.map((f) => ({ name: f, size: statSync(join(backupDir, f)).size, date: f.replace('ppsd-auto-', '').replace('.sqlite', '') })))
  } catch { res.json([]) }
})
// ---- สำรองนอกเครื่อง: ดู/ตั้งค่าโฟลเดอร์ + สั่งสำรองทันที (admin) ----
function mirrorStatus() { try { return JSON.parse(getSetting('backup_mirror_status', '') || 'null') } catch { return null } }
function lastBackupInfo() { try { return JSON.parse(getSetting('backup_last', '') || 'null') } catch { return null } }
api.get('/backup-mirror', adminOnly, (_req, res) => res.json({
  dir: getSetting('backup_mirror_dir', ''), status: mirrorStatus(), last: lastBackupInfo(),
  lastError: (() => { try { return JSON.parse(getSetting('backup_last_error', '') || 'null') } catch { return null } })(),
}))
api.put('/backup-mirror', adminOnly, (req, res) => {
  const dir = String((req.body || {}).dir || '').trim()
  const save = () => { setSetting('backup_mirror_dir', dir); audit(req, 'ตั้งโฟลเดอร์สำรองนอกเครื่อง', dir || '(ปิดใช้งาน)'); res.json({ ok: true, dir }) }
  if (!dir) return save()
  // ทดสอบเขียนใน process ลูกพร้อม timeout — พาธที่ค้าง (network drive หลุด) ต้องไม่ทำให้เซิร์ฟเวอร์ค้างทั้งระบบ
  const testCode = "const fs=require('fs'),p=process.argv[1],j=require('path').join;fs.mkdirSync(p,{recursive:true});const t=j(p,'.ppsd-write-test');fs.writeFileSync(t,'ok');fs.unlinkSync(t)"
  execFile(process.execPath, ['-e', testCode, dir], { timeout: 10000 }, (err) => {
    if (err) return res.status(400).json({ error: 'เขียนโฟลเดอร์นี้ไม่ได้ — ตรวจว่าพาธถูกต้อง/ไดรฟ์เสียบอยู่/มีสิทธิ์เขียน (' + (err.killed ? 'ไม่ตอบสนองภายใน 10 วินาที' : String(err.message).slice(0, 200)) + ')' })
    save()
  })
})
// ===== แจ้งเตือน LINE (Messaging API) — สรุปเรื่องค้างส่งเข้ากลุ่มบริหารทุกเช้า =====
// ตั้งค่า: Channel access token (จาก LINE Developers) + ID กลุ่ม/ผู้รับ + เวลาส่ง
function buildLineDigest() {
  const today = todayISO()
  const L = []
  // งวดลูกค้าเลยกำหนด
  const over = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(amount - COALESCE(paid,0)),0) a FROM installments WHERE side != 'contractor' AND status != 'เก็บแล้ว' AND due_iso IS NOT NULL AND due_iso != '' AND due_iso < ? AND COALESCE(paid,0) < amount").get(today)
  if (over.n) L.push(`🔴 งวดลูกค้าเลยกำหนด ${over.n} งวด รวม ${baht(over.a)}`)
  // เจ้าหนี้ PO เครดิต
  let apDue = 0, apDueAmt = 0
  for (const po of db.prepare("SELECT id, amount, due_iso FROM purchase_orders WHERE payment_type='credit' AND status IN ('รับของแล้ว','ปิดงาน')").all()) {
    const paid = db.prepare("SELECT COALESCE(SUM(gross),0) a FROM payments WHERE po_id=? AND COALESCE(status,'') != 'ปฏิเสธ'").get(po.id).a
    const rem = Math.max(0, (po.amount || 0) - paid)
    if (rem > 0 && po.due_iso && po.due_iso < today) { apDue++; apDueAmt += rem }
  }
  if (apDue) L.push(`🟠 หนี้ผู้ขายเลยกำหนดชำระ ${apDue} ใบ รวม ${baht(apDueAmt)}`)
  // เรื่องค้างอนุมัติ
  const prWait = db.prepare("SELECT COUNT(*) c FROM purchase_requests WHERE status='รออนุมัติ'").get().c
  const lvWait = db.prepare("SELECT COUNT(*) c FROM leaves WHERE status='รออนุมัติ'").get().c
  if (prWait || lvWait) L.push(`🟡 รออนุมัติ: PR ${prWait} ใบ · ใบลา ${lvWait} ใบ`)
  // ระบบ
  const ji = db.prepare('SELECT COUNT(*) c FROM journal_issues').get().c
  if (ji) L.push(`⚠️ ลงบัญชีไม่สำเร็จ ${ji} รายการ — เข้าไปดูที่หน้า บัญชี`)
  try {
    const last = JSON.parse(getSetting('backup_last', '') || 'null')
    const cut = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
    if (!last || last.day < cut) L.push(`⚠️ สำรองข้อมูลล่าสุด: ${last?.day || 'ไม่เคย'} (เกิน 2 วัน)`)
  } catch { /* ignore */ }
  if (!L.length) L.push('✅ ไม่มีเรื่องค้างเร่งด่วนวันนี้')
  try { L.push(`💰 เงินสด+ธนาคารตามบัญชี: ${baht(acct.cashBalance())}`) } catch { /* ignore */ }
  return `📋 PPSD ERP สรุปเช้า ${todayTH()}\n\n` + L.join('\n')
}
async function sendLine(text) {
  const token = getSetting('line_token', ''), to = getSetting('line_to', '')
  if (!token || !to) throw new Error('ยังไม่ได้ตั้งค่า LINE (token / ID ผู้รับ)')
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ to, messages: [{ type: 'text', text: String(text).slice(0, 4900) }] }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`LINE ตอบ ${res.status}: ${(await res.text()).slice(0, 200)}`)
}
// ส่งสรุปเช้าอัตโนมัติ: เช็คทุก 10 นาที ถึงเวลาที่ตั้ง (ค่าเริ่มต้น 08:00) และวันนี้ยังไม่ส่ง → ส่ง
setInterval(async () => {
  try {
    if (!getSetting('line_token', '') || !getSetting('line_to', '')) return
    const hv = Number(getSetting('line_hour', '8'))
    const hour = Number.isFinite(hv) ? Math.max(0, Math.min(23, hv)) : 8
    const today = todayISO()
    if (new Date().getHours() < hour || getSetting('line_last_sent', '') === today) return
    await sendLine(buildLineDigest())
    setSetting('line_last_sent', today)
    setSetting('line_status', JSON.stringify({ at: nowTS(), ok: true }))
  } catch (e) { setSetting('line_status', JSON.stringify({ at: nowTS(), ok: false, msg: e.message })) }
}, 10 * 60 * 1000)
api.get('/line-settings', adminOnly, (_req, res) => res.json({
  token_set: !!getSetting('line_token', ''), to: getSetting('line_to', ''), hour: Number(getSetting('line_hour', '8')) || 8,
  last_sent: getSetting('line_last_sent', ''),
  status: (() => { try { return JSON.parse(getSetting('line_status', '') || 'null') } catch { return null } })(),
  seen: lineSeen(), // กลุ่ม/คนที่บอทเคยเห็นผ่าน webhook → กดเลือกเป็นผู้รับได้
  secret_set: !!getSetting('line_secret', ''), // Channel secret ไว้ตรวจลายเซ็น webhook (กันคนอื่นยิงคำสั่งปลอม)
  linked: db.prepare('SELECT COUNT(*) c FROM users WHERE line_uid IS NOT NULL').get().c,
}))
// ผูก LINE ของฉัน: ขอรหัส 6 หลัก → ส่งให้บอทในแชทส่วนตัว → บอทผูกให้ (อายุ 10 นาที)
api.post('/line-link/code', requireAuth, (req, res) => {
  // แอดมินขอรหัสแทนคนอื่นได้ (user_id) — คนที่ส่งรหัสนั้นให้บอทจะถูกผูกกับบัญชีนั้น
  const want = Number(req.body?.user_id) || 0
  const targetId = want && req.user.role === 'admin' ? want : req.user.id
  const target = db.prepare('SELECT id, name, line_uid FROM users WHERE id=?').get(targetId)
  if (!target) return res.status(404).json({ error: 'ไม่พบผู้ใช้' })
  const code = issueLineLinkCode(target.id)
  if (target.id !== req.user.id) audit(req, 'ขอรหัสผูก LINE แทน', target.name)
  res.json({ code, expires_min: 10, linked: !!target.line_uid, name: target.name })
})
api.delete('/line-link', requireAuth, (req, res) => {
  const want = Number(req.query?.user_id || req.body?.user_id) || 0
  const id = want && req.user.role === 'admin' ? want : req.user.id
  db.prepare('UPDATE users SET line_uid=NULL WHERE id=?').run(id)
  res.json({ ok: true })
})
// ล้างรายการกลุ่มที่บอทเห็น (กรณีเชิญผิดกลุ่ม)
api.delete('/line-settings/seen', adminOnly, (_req, res) => { setSetting('line_seen', '[]'); res.json({ ok: true }) })
api.put('/line-settings', adminOnly, (req, res) => {
  const b = req.body || {}
  if (b.token !== undefined) { setSetting('line_token', String(b.token || '').trim()); if (tunnel.state.url) registerLineWebhook(tunnel.state.url) }
  if (b.to !== undefined) setSetting('line_to', String(b.to || '').trim())
  if (b.secret !== undefined) setSetting('line_secret', String(b.secret || '').trim())
  if (b.hour !== undefined) { const hv = Number(b.hour); setSetting('line_hour', String(Number.isFinite(hv) ? Math.max(0, Math.min(23, hv)) : 8)) }
  audit(req, 'ตั้งค่าแจ้งเตือน LINE', getSetting('line_to', '') || '(ปิด)')
  res.json({ ok: true })
})
api.post('/line-settings/test', adminOnly, async (req, res) => {
  try { await sendLine(buildLineDigest()); setSetting('line_status', JSON.stringify({ at: nowTS(), ok: true })); res.json({ ok: true }) }
  catch (e) { setSetting('line_status', JSON.stringify({ at: nowTS(), ok: false, msg: e.message })); res.status(400).json({ error: e.message }) }
})

// ===== ลิงก์สาธารณะอัตโนมัติ + ตั้ง Webhook URL ใน LINE ให้เอง =====
// ทุกครั้งที่ได้ลิงก์ใหม่ (เปิดเครื่อง/หลุดแล้วต่อใหม่) → PUT ไปที่ LINE Messaging API ให้ชี้มาที่ /api/line/webhook อัตโนมัติ
async function registerLineWebhook(url) {
  const token = getSetting('line_token', '')
  if (!token || !url) { setSetting('line_webhook_status', JSON.stringify({ at: nowTS(), ok: false, msg: token ? 'ยังไม่มีลิงก์' : 'ยังไม่ได้ใส่ Channel access token', endpoint: '' })); return false }
  const endpoint = url.replace(/\/$/, '') + '/api/line/webhook'
  try {
    const r = await fetch('https://api.line.me/v2/bot/channel/webhook/endpoint', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ endpoint }), signal: AbortSignal.timeout(15000),
    })
    const ok = r.ok
    let msg = ok ? 'ตั้ง Webhook URL ใน LINE แล้ว' : `LINE ตอบ ${r.status}: ${(await r.text()).slice(0, 160)}`
    let active = null
    if (ok) {
      try {
        const g = await fetch('https://api.line.me/v2/bot/channel/webhook/endpoint', { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) })
        if (g.ok) { const j = await g.json(); active = !!j.active; if (!active) msg += ' — แต่ยังไม่ได้เปิด "Use webhook" ในหน้า LINE Developers (เปิดครั้งเดียว)' }
      } catch { /* ignore */ }
    }
    // ตั้งสำเร็จ → ให้ LINE ยิงทดสอบมาที่ endpoint จริง (เช็คว่าถึงเครื่องเราไหม)
    let reach = null
    if (ok) {
      try {
        const t = await fetch('https://api.line.me/v2/bot/channel/webhook/test', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ endpoint }), signal: AbortSignal.timeout(20000) })
        if (t.ok) { const j = await t.json(); reach = { success: !!j.success, statusCode: j.statusCode, reason: j.reason, detail: j.detail }; if (!j.success) msg += ` — แต่ LINE ยิงทดสอบมาไม่ถึง (${j.reason || j.statusCode}) ลองกด "ลองตั้ง Webhook อีกครั้ง" ในอีก 1 นาที` }
      } catch { /* ignore */ }
    }
    setSetting('line_webhook_status', JSON.stringify({ at: nowTS(), ok, msg, endpoint, active, reach }))
    return ok
  } catch (e) { setSetting('line_webhook_status', JSON.stringify({ at: nowTS(), ok: false, msg: 'เรียก LINE ไม่สำเร็จ: ' + e.message, endpoint })); return false }
}
// ลิงก์ใหม่จาก trycloudflare ต้องรอ DNS กระจายสักครู่ LINE ถึงจะยอมรับ ("Invalid webhook endpoint URL") → ลองซ้ำเป็นช่วงจนกว่าจะสำเร็จ
let webhookRetryTimer = null
function registerLineWebhookWithRetry(url) {
  clearTimeout(webhookRetryTimer)
  const delays = [3000, 15000, 45000, 90000, 180000, 300000]
  let i = 0
  const attempt = async () => {
    if (tunnel.state.url !== url) return // ลิงก์เปลี่ยนไปแล้ว — รอบใหม่จะจัดการเอง
    const ok = await registerLineWebhook(url)
    if (ok || i >= delays.length) return
    webhookRetryTimer = setTimeout(attempt, delays[i++])
  }
  webhookRetryTimer = setTimeout(attempt, delays[i++])
}
const tunnel = createTunnelManager({
  port: process.env.PORT || 3001,
  appDir: join(__dirname, '..'),
  onUrl: (url) => { setSetting('tunnel_url', url); registerLineWebhookWithRetry(url) },
  onStatus: (st) => setSetting('tunnel_state', JSON.stringify(st)),
})
const tunnelInfo = () => ({
  enabled: getSetting('tunnel_auto', '0') === '1', expose: getSetting('tunnel_expose', '0') === '1',
  ...tunnel.state, url: tunnel.state.url || '',
  webhook: (() => { try { return JSON.parse(getSetting('line_webhook_status', '') || 'null') } catch { return null } })(),
})
// เช็คสวิตช์ "Use webhook" ใน LINE แบบสด (ถี่สุดทุก 20 วิ) — พอผู้ใช้เปิดสวิตช์ในหน้า LINE การ์ดจะเปลี่ยนเป็นเขียวเอง
let lineActiveCheckedAt = 0
async function refreshLineWebhookActive() {
  const token = getSetting('line_token', '')
  const st = tunnelInfo().webhook
  if (!token || !st || !st.ok || Date.now() - lineActiveCheckedAt < 20000) return
  lineActiveCheckedAt = Date.now()
  try {
    const g = await fetch('https://api.line.me/v2/bot/channel/webhook/endpoint', { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(8000) })
    if (!g.ok) return
    const j = await g.json()
    const active = !!j.active
    // มีคนแก้ URL ในหน้า LINE ให้ผิด (เช่น ลืมท้าย /api/line/webhook) → ตั้งกลับให้ถูกเอง
    const expected = tunnel.state.url ? tunnel.state.url.replace(/\/$/, '') + '/api/line/webhook' : ''
    if (expected && j.endpoint && j.endpoint !== expected && !j.endpoint.endsWith('/api/line/webhook')) {
      console.log('[line] Webhook URL ใน LINE ไม่ตรง (' + j.endpoint + ') → ตั้งใหม่เป็น ' + expected)
      registerLineWebhook(tunnel.state.url)
      return
    }
    if (active !== st.active || (j.endpoint && j.endpoint !== st.endpoint)) {
      const base = 'ตั้ง Webhook URL ใน LINE แล้ว'
      const msg = active ? base + ' และเปิด Use webhook แล้ว ✓' : base + ' — แต่ยังไม่ได้เปิด "Use webhook" ในหน้า LINE Developers (เปิดครั้งเดียว)'
      setSetting('line_webhook_status', JSON.stringify({ ...st, at: nowTS(), active, msg, endpoint: j.endpoint || st.endpoint }))
    }
  } catch { /* ignore */ }
}
// รีสตาร์ทเซิร์ฟเวอร์จากหน้าเว็บ (ใช้หลังอัปเดตโค้ด) — PM2 / run-server.bat จะเปิดใหม่ให้เอง; ถ้าเปิดด้วย start.bat ต้องดับเบิลคลิกใหม่
api.post('/restart', adminOnly, (req, res) => {
  audit(req, 'สั่งรีสตาร์ทเซิร์ฟเวอร์จากหน้าเว็บ', serverVersion().stale ? 'โค้ดใหม่กว่า process' : '')
  res.json({ ok: true, pm2: !!process.env.pm_id })
  setTimeout(() => process.exit(0), 400)
})
api.get('/tunnel', adminOnly, async (_req, res) => { await refreshLineWebhookActive(); res.json(tunnelInfo()) })
api.put('/tunnel', adminOnly, async (req, res) => {
  const b = req.body || {}
  if (b.expose !== undefined) setSetting('tunnel_expose', b.expose ? '1' : '0')
  if (b.enabled !== undefined) {
    setSetting('tunnel_auto', b.enabled ? '1' : '0')
    if (b.enabled) tunnel.start().catch((e) => console.error('tunnel start:', e.message)); else tunnel.stop()
  }
  audit(req, 'ตั้งค่าลิงก์สาธารณะ', `${getSetting('tunnel_auto', '0') === '1' ? 'เปิด' : 'ปิด'}${getSetting('tunnel_expose', '0') === '1' ? ' + เปิด ERP ผ่านลิงก์' : ''}`)
  res.json(tunnelInfo())
})
api.post('/tunnel/restart', adminOnly, async (req, res) => {
  if (getSetting('tunnel_auto', '0') !== '1') return res.status(400).json({ error: 'ยังไม่ได้เปิดลิงก์สาธารณะอัตโนมัติ' })
  tunnel.restart().catch((e) => console.error('tunnel restart:', e.message))
  audit(req, 'เปิดลิงก์สาธารณะใหม่', '')
  res.json(tunnelInfo())
})
// ตั้ง Webhook URL ใน LINE อีกครั้ง (เช่น เพิ่งใส่ token) — หรือใส่ URL ถาวรของตัวเอง (โดเมน/Tailscale) มาแทน
api.post('/tunnel/register-webhook', adminOnly, async (req, res) => {
  const url = String(req.body?.url || tunnel.state.url || getSetting('tunnel_url', '') || '').trim()
  if (!url) return res.status(400).json({ error: 'ยังไม่มีลิงก์สาธารณะ — เปิดลิงก์อัตโนมัติก่อน หรือใส่ URL เอง' })
  const ok = await registerLineWebhook(url)
  res.status(ok ? 200 : 400).json(tunnelInfo())
})
if (getSetting('tunnel_auto', '0') === '1' && !process.env.PPSD_NO_TUNNEL) tunnel.start().catch((e) => console.error('tunnel start:', e.message))

api.post('/backup-mirror/run', adminOnly, async (req, res) => {
  if (!getSetting('backup_mirror_dir', '')) return res.status(400).json({ error: 'ยังไม่ได้ตั้งโฟลเดอร์สำรองนอกเครื่อง' })
  await autoBackup()
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
