// หน้าลงเวลาบน Cloudflare (ppsd-office.pages.dev/checkin) ↔ ERP — ERP เป็นระบบหลัก, Cloudflare เป็น "สาขาย่อย" ที่เปิดได้แม้คอมออฟฟิศปิด
// ทุก 1 นาที: ส่งรายชื่อ (เฉพาะคนยังทำงาน) · บ้าน · ค่าตั้งค่าลงเวลา · สถานะเข้า/ออกวันนี้ ขึ้นไป → รับรายการลงเวลา/เช็คอินหน้างาน/ตำแหน่ง กลับมาบันทึก
// PIN: ไม่ส่งกุญแจหลักของ ERP ขึ้นไป — ใช้ "รหัสตรวจ PIN เฉพาะลงเวลา" (HMAC ด้วยกุญแจ cloud_checkin_key) ซึ่งสร้างได้ตอนพนักงานใส่ PIN ถูกในระบบออฟฟิศ
//   เปลี่ยน/รีเซ็ต PIN ใน ERP → รหัสเดิมบน Cloudflare ใช้ไม่ได้เอง (ต้องตรงกับ PIN ปัจจุบัน)
import { createHmac, randomBytes } from 'node:crypto'

export function createCloudCheckin(d) {
  // d: { db, getSetting, setSetting, hashPin, kioskRef, lateCutoff, isoDate, notifyChange, houseFilterSql }
  const { db } = d
  db.exec(`CREATE TABLE IF NOT EXISTS cloud_pin_hashes (emp_code TEXT PRIMARY KEY, secret TEXT, pin_ref TEXT, at TEXT);
    CREATE TABLE IF NOT EXISTS cloud_checkin_applied (id INTEGER PRIMARY KEY, at TEXT)`)
  const key = () => { let k = d.getSetting('cloud_checkin_key', ''); if (!k) { k = randomBytes(32).toString('hex'); d.setSetting('cloud_checkin_key', k) } return k }
  const url = () => String(d.getSetting('cloud_checkin_url', '') || '').replace(/\/+$/, '') // ลิงก์ที่ให้พนักงาน เช่น https://ppsd-office.pages.dev/checkin
  const apiBase = () => { try { return new URL(url()).origin + '/api/checkin' } catch { return '' } }
  const token = () => d.getSetting('cloud_checkin_token', '')
  const cloudHash = (code, pin) => createHmac('sha256', key()).update(String(code) + ':' + String(pin)).digest('hex')
  // พนักงานใส่ PIN ถูกในระบบออฟฟิศ (ตอกบัตร/ล็อกอิน/ตั้ง PIN) → เก็บรหัสตรวจสำหรับ Cloudflare
  function capture(empCode, pin) {
    try {
      const e = db.prepare('SELECT code, pin FROM employees WHERE code=?').get(empCode)
      if (!e?.pin || !/^\d{4,8}$/.test(String(pin || '')) || d.hashPin(String(pin)) !== e.pin) return
      const h = cloudHash(e.code, pin)
      const cur = db.prepare('SELECT secret, pin_ref FROM cloud_pin_hashes WHERE emp_code=?').get(e.code)
      if (cur && cur.secret === h && cur.pin_ref === e.pin) return
      db.prepare('INSERT INTO cloud_pin_hashes (emp_code, secret, pin_ref, at) VALUES (?, ?, ?, ?) ON CONFLICT(emp_code) DO UPDATE SET secret=excluded.secret, pin_ref=excluded.pin_ref, at=excluded.at')
        .run(e.code, h, e.pin, new Date().toISOString())
      dirty = true
    } catch (err) { console.error('cloud pin capture:', err.message) }
  }
  const captureByUser = (userId, pin) => { const e = db.prepare('SELECT code FROM employees WHERE user_id=?').get(userId); if (e) capture(e.code, pin) }
  let dirty = true
  // สถานะซิงก์เก็บในหน่วยความจำ (ไม่เขียนลงฐานข้อมูลทุกนาที — กันประวัติการแก้ไขบวม)
  let st = {}
  const status = () => st
  const setStatus = (s) => { st = { ...st, ...s } }
  function payload() {
    const pins = new Map(db.prepare('SELECT h.emp_code, h.secret FROM cloud_pin_hashes h JOIN employees e ON e.code=h.emp_code AND e.pin=h.pin_ref').all().map((r) => [r.emp_code, r.secret]))
    const emps = db.prepare("SELECT code, name FROM employees WHERE COALESCE(status,'') != 'ลาออก' ORDER BY id").all()
    const today = d.isoDate(new Date())
    const att = db.prepare('SELECT emp_code, date, check_in, check_out, status FROM attendance WHERE date=?').all(today)
    return {
      employees: emps.map((e) => ({ ref: d.kioskRef(e.code), code: e.code, name: e.name, hash: pins.get(e.code) || null })),
      houses: db.prepare(`SELECT code, name FROM houses WHERE ${d.houseFilterSql} ORDER BY CASE WHEN kind='office' THEN 1 ELSE 0 END, name`).all(),
      config: { geofence: d.getSetting('att_geofence', '0'), lat: d.getSetting('att_lat', ''), lng: d.getSetting('att_lng', ''), radius: d.getSetting('att_radius', '200'), late: d.lateCutoff() },
      today: att.filter((a) => emps.some((e) => e.code === a.emp_code)).map((a) => ({ ref: d.kioskRef(a.emp_code), date: a.date, check_in: a.check_in || '', check_out: a.check_out || '', status: a.status || '' })),
    }
  }
  // บันทึกรายการจาก Cloudflare เข้าระบบหลัก (กันซ้ำด้วยเลขรายการ)
  function apply(ev) {
    if (db.prepare('SELECT 1 FROM cloud_checkin_applied WHERE id=?').get(ev.id)) return 'dup'
    const emp = db.prepare('SELECT * FROM employees WHERE code=?').get(ev.code)
    const done = () => db.prepare('INSERT OR IGNORE INTO cloud_checkin_applied (id, at) VALUES (?, ?)').run(ev.id, new Date().toISOString())
    if (!emp || emp.status === 'ลาออก') { done(); return 'skip' }
    const ts = `${ev.date}T${ev.time}:00+07:00`
    const loc = (note, kind, house) => {
      if (typeof ev.lat !== 'number' || typeof ev.lng !== 'number') return
      db.prepare('INSERT INTO location_log (emp_code,emp_name,lat,lng,accuracy,ts,date,note,house_code,kind) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(emp.code, emp.name, ev.lat, ev.lng, Number(ev.acc) || 0, new Date(ts).toISOString(), ev.date, note, house || null, kind || null)
    }
    db.transaction(() => {
      if (ev.type === 'punch') {
        const row = db.prepare('SELECT * FROM attendance WHERE emp_code=? AND date=?').get(emp.code, ev.date)
        if (ev.kind === 'in') {
          if (!row) db.prepare('INSERT INTO attendance (emp_code,emp_name,date,check_in,check_out,status) VALUES (?,?,?,?,?,?)').run(emp.code, emp.name, ev.date, ev.time, '', ev.status || 'ปกติ')
          else if (!row.check_in || ev.time < row.check_in) db.prepare('UPDATE attendance SET check_in=?, status=? WHERE id=?').run(ev.time, ev.status || row.status || 'ปกติ', row.id)
          loc('เข้างาน (ลิงก์ออนไลน์)')
        } else {
          if (!row) db.prepare("INSERT INTO attendance (emp_code,emp_name,date,check_in,check_out,status) VALUES (?,?,?,'',?,?)").run(emp.code, emp.name, ev.date, ev.time, ev.status || 'ปกติ')
          else if (!row.check_out || ev.time > row.check_out) db.prepare('UPDATE attendance SET check_out=? WHERE id=?').run(ev.time, row.id)
          loc('ออกงาน (ลิงก์ออนไลน์)')
        }
      } else if (ev.type === 'site') {
        const h = db.prepare('SELECT code, name FROM houses WHERE code=?').get(String(ev.house || ''))
        loc('เช็คอินหน้างาน: ' + (h?.name || ev.house || '') + (ev.note ? ' · ' + ev.note : '') + ' (ลิงก์ออนไลน์)', 'site', h?.code || ev.house)
      } else if (ev.type === 'track') loc(ev.note || 'ติดตามงาน')
      done()
    })()
    return 'ok'
  }
  let running = false
  async function syncOnce({ force = false } = {}) {
    const u = url(), t = token()
    if (!u || !t || running) return { skipped: true }
    running = true
    try {
      const post = async (body) => {
        const r = await fetch(apiBase() + '/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status)
        return j
      }
      let res = await post(force || dirty || Date.now() - (status().pushed_ms || 0) > 60000 ? payload() : {})
      dirty = false
      let applied = 0
      for (let round = 0; round < 10 && res.events?.length; round++) {
        const ack = []
        for (const ev of res.events) { try { const r = apply(ev); if (r === 'ok') applied++; ack.push(ev.id) } catch (e) { console.error('cloud checkin apply', ev.id, e.message) } }
        res = await post({ ack })
      }
      if (applied) d.notifyChange(['attendance', 'locations'])
      const ready = db.prepare('SELECT COUNT(*) c FROM cloud_pin_hashes h JOIN employees e ON e.code=h.emp_code AND e.pin=h.pin_ref WHERE COALESCE(e.status,\'\') != \'ลาออก\'').get().c
      setStatus({ ok: true, at: new Date().toISOString(), pushed_ms: Date.now(), error: '', applied_last: applied, applied_total: (status().applied_total || 0) + applied, ready })
      return { ok: true, applied }
    } catch (e) {
      setStatus({ ok: false, at: new Date().toISOString(), error: e.message })
      return { ok: false, error: e.message }
    } finally { running = false }
  }
  function info() {
    const s = status()
    const total = db.prepare("SELECT COUNT(*) c FROM employees WHERE COALESCE(status,'') != 'ลาออก'").get().c
    const ready = db.prepare("SELECT COUNT(*) c FROM cloud_pin_hashes h JOIN employees e ON e.code=h.emp_code AND e.pin=h.pin_ref WHERE COALESCE(e.status,'') != 'ลาออก'").get().c
    const notReady = db.prepare("SELECT e.name FROM employees e LEFT JOIN cloud_pin_hashes h ON h.emp_code=e.code AND h.pin_ref=e.pin WHERE COALESCE(e.status,'') != 'ลาออก' AND h.emp_code IS NULL ORDER BY e.id").all().map((r) => r.name)
    return { url: url(), configured: !!(url() && token()), last: s.at || '', ok: !!s.ok, error: s.error || '', applied_total: s.applied_total || 0, total, ready, not_ready: notReady }
  }
  return { capture, captureByUser, syncOnce, info, markDirty: () => { dirty = true } }
}
