// เงินเดือนบน Cloudflare (ppsd-office.pages.dev/payroll) ↔ ERP
// ขั้น 2 (mirror): ERP ส่งข้อมูลทั้งหมดที่สูตรเงินเดือนใช้ขึ้นไปทุก 1 นาที — ส่งเฉพาะชุดที่เปลี่ยน (เทียบลายนิ้วมือ sha)
//   + ปุ่ม "เทียบตัวเลข" ให้ Cloudflare คำนวณด้วยสูตรเดียวกันแล้วเทียบกับ ERP ทีละคน
// ข้อมูลลับ (PIN / ลายเซ็น / โทเคน) ไม่ส่งขึ้นไป
import { createHash, createHmac, randomBytes } from 'node:crypto'

const EMP_HIDE = new Set(['pin', 'signature', 'track_token'])
export function createCloudPayroll(d) {
  // d: { db, getSetting, setSetting, computePayroll(period), notifyChange, canSeeSalary(user) }
  const { db } = d
  db.exec('CREATE TABLE IF NOT EXISTS cloud_user_pins (user_id INTEGER PRIMARY KEY, secret TEXT, pin_ref TEXT, at TEXT)')
  const url = () => String(d.getSetting('cloud_payroll_url', '') || '').replace(/\/+$/, '') // เช่น https://ppsd-office.pages.dev/payroll
  const apiBase = () => { try { return new URL(url()).origin + '/api/payroll' } catch { return '' } }
  const pinKey = () => { let k = d.getSetting('cloud_payroll_pin_key', ''); if (!k) { k = randomBytes(32).toString('hex'); d.setSetting('cloud_payroll_pin_key', k) } return k }
  // ล็อกอิน ERP สำเร็จ → เก็บรหัสตรวจ PIN สำหรับล็อกอินเงินเดือนบน Cloudflare (เฉพาะคนที่มีสิทธิ์ดูเงินเดือน)
  function capturePin(userId, pin) {
    try {
      const u = db.prepare('SELECT * FROM users WHERE id=?').get(userId)
      if (!u?.pin || !d.canSeeSalary(u) || !/^\d{4,8}$/.test(String(pin || ''))) return
      const h = createHmac('sha256', pinKey()).update(String(u.username || '').toLowerCase() + ':' + pin).digest('hex')
      db.prepare('INSERT INTO cloud_user_pins (user_id, secret, pin_ref, at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET secret=excluded.secret, pin_ref=excluded.pin_ref, at=excluded.at').run(u.id, h, u.pin, new Date().toISOString())
    } catch (e) { console.error('cloud payroll pin capture:', e.message) }
  }
  const token = () => d.getSetting('cloud_payroll_token', '')
  const sha = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex')
  let have = null // ลายนิ้วมือที่ Cloudflare มีอยู่ (null = ยังไม่รู้ → ถามก่อน)
  let st = {}
  const all = (sql, ...a) => db.prepare(sql).all(...a)
  // ชุดข้อมูลทั้งหมด (ชื่อ → ข้อมูล) — รูปแบบแถวเหมือนตารางใน ERP
  function datasets() {
    // ผู้ใช้ที่เข้าหน้าเงินเดือนบน Cloudflare ได้ (สิทธิ์เหมือน ERP) · รหัสตรวจ PIN ส่งเฉพาะที่ยังตรงกับ PIN ปัจจุบัน
    const pins = new Map(all('SELECT p.user_id, p.secret FROM cloud_user_pins p JOIN users u ON u.id=p.user_id AND u.pin=p.pin_ref').map((r) => [r.user_id, r.secret]))
    const users = all("SELECT * FROM users WHERE status='ใช้งาน' ORDER BY id").filter((u) => d.canSeeSalary(u))
      .map((u) => ({ id: u.id, username: u.username, name: u.name, can_view: true, can_edit: u.role === 'admin' || u.role === 'accounting', hash: pins.get(u.id) || null }))
    const out = {
      users,
      employees: all('SELECT * FROM employees ORDER BY id').map((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !EMP_HIDE.has(k)))),
      time_adjustments: all("SELECT emp_name, date, status FROM time_adjustments WHERE status='อนุมัติ' ORDER BY id"),
      leaves: all("SELECT id, emp_code, emp_name, type, start_date, end_date, days, unpaid_days, status FROM leaves WHERE status IN ('อนุมัติ','ไม่อนุมัติ') ORDER BY id"),
      holidays: all('SELECT date, name FROM holidays ORDER BY date'),
      ot: all("SELECT id, emp_code, name, date, hours, rate, amount, status, note FROM ot WHERE status='อนุมัติ' ORDER BY id"),
      payroll_inputs: all('SELECT * FROM payroll_inputs ORDER BY period, emp_code'),
      salary_advances: all('SELECT * FROM salary_advances ORDER BY id'),
      deductions: all('SELECT * FROM deductions ORDER BY id'),
      other_income: all('SELECT * FROM other_income ORDER BY id'),
      payroll_batches: all('SELECT * FROM payroll_batches ORDER BY id').map((b) => ({ ...b, data: safeJson(b.data, []), emp_codes: safeJson(b.emp_codes, []) })),
      payroll_runs: all('SELECT period, data, total, created, by FROM payroll_runs ORDER BY period').map((r) => ({ period: r.period, rows: safeJson(r.data, []), total: r.total, created: r.created, by: r.by })),
    }
    for (const m of all("SELECT DISTINCT substr(date,1,7) m FROM attendance WHERE date LIKE '____-__-__' ORDER BY m").map((r) => r.m))
      out['att:' + m] = all("SELECT emp_code, emp_name, date, check_in, check_out, status FROM attendance WHERE date LIKE ? ORDER BY date, emp_code", m + '-%')
    return out
  }
  const safeJson = (s, def) => { try { return JSON.parse(s) ?? def } catch { return def } }
  async function post(path, body) {
    const r = await fetch(apiBase() + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status)
    return j
  }
  let running = false
  async function syncOnce() {
    if (!url() || !token() || running) return { skipped: true }
    running = true
    try {
      if (!have) have = (await post('/sync', {})).have || {}
      const ds = datasets()
      const changed = Object.entries(ds).map(([name, data]) => ({ name, sha: sha(data), data })).filter((x) => have[x.name] !== x.sha)
      const gone = Object.keys(have).filter((n) => !(n in ds)).map((name) => ({ name, sha: '', data: null }))
      let sent = 0
      // ส่งทีละไม่เกิน ~1.5 MB
      let batch = [], size = 0
      const flush = async () => { if (!batch.length) return; have = (await post('/sync', { datasets: batch })).have || have; sent += batch.length; batch = []; size = 0 }
      for (const x of [...changed, ...gone]) { const n = JSON.stringify(x.data).length; if (size + n > 1.5e6) await flush(); batch.push(x); size += n }
      await flush()
      st = { ok: true, at: new Date().toISOString(), error: '', sent_last: sent, datasets: Object.keys(ds).length }
      return { ok: true, sent }
    } catch (e) {
      have = null // รอบหน้าถามใหม่ว่า Cloudflare มีอะไร
      st = { ...st, ok: false, at: new Date().toISOString(), error: e.message }
      return { ok: false, error: e.message }
    } finally { running = false }
  }
  // ให้ Cloudflare คำนวณงวดนี้ด้วยสูตรเดียวกัน แล้วเทียบกับ ERP ทีละคน ทีละช่อง
  const KEYS = ['base', 'ot', 'other_income', 'retention_refund', 'sso', 'tax', 'leave_deduct', 'retention', 'student_loan', 'advance', 'other_deduct', 'work_days', 'absent_days', 'leave_days', 'retention_paid']
  async function compare(period) {
    await syncOnce()
    const cloud = (await post('/compare', { period })).rows || []
    const erp = d.computePayroll(period)
    const diffs = []
    const cm = new Map(cloud.map((r) => [r.code, r]))
    for (const e of erp) {
      const c = cm.get(e.code)
      if (!c) { diffs.push({ code: e.code, name: e.name, field: '(ไม่มีบน Cloudflare)' }); continue }
      for (const k of KEYS) if (JSON.stringify(e[k] ?? null) !== JSON.stringify(c[k] ?? null)) diffs.push({ code: e.code, name: e.name, field: k, erp: e[k], cloud: c[k] })
      cm.delete(e.code)
    }
    for (const c of cm.values()) diffs.push({ code: c.code, name: c.name, field: '(มีแต่บน Cloudflare)' })
    return { period, people: erp.length, diffs }
  }
  return { syncOnce, compare, capturePin, info: () => ({ url: url(), configured: !!(url() && token()), ...st }) }
}
