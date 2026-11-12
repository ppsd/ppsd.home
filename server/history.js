// ===== ประวัติการแก้ไขข้อมูลทุกตาราง (change history) =====
// ทุกการ เพิ่ม / แก้ / ลบ ในฐานข้อมูล → เก็บ 1 แถวใน change_history: เวลา · ใครทำ · ตาราง · รหัสแถว · ค่าก่อน · ค่าหลัง
//  - ใช้ TEMP TRIGGER (มีเฉพาะการเชื่อมต่อของเซิร์ฟเวอร์ สร้างใหม่ทุกครั้งที่เปิดเซิร์ฟเวอร์)
//    → ครอบทุกทาง: หน้าเว็บ · บอท LINE · งานอัตโนมัติ · ไม่ต้องไล่ใส่โค้ดทีละจุด
//    → เครื่องมืออื่นที่เปิดไฟล์ฐานข้อมูลเอง (สำรอง/กู้/เทสต์) ไม่ติด trigger และไม่ต้องรู้จักฟังก์ชัน ppsd_user()
//  - ใครทำ: AsyncLocalStorage ผูกกับคำขอ (ข้าม await ได้ถูกต้อง) · บอท LINE ตั้งชื่อผู้ใช้เองผ่าน setHistoryUser · นอกคำขอ = "ระบบ"
//  - ไม่เก็บ: ไฟล์/รูป (เก็บแค่ขนาด) · PIN/รหัส/โทเคน (เก็บเป็น ***) · ค่าตั้งค่าที่เป็นความลับ · ตารางที่เป็น log/แคชอยู่แล้ว
import { AsyncLocalStorage } from 'node:async_hooks'

const ctx = new AsyncLocalStorage()

/** middleware: ผูกคำขอกับประวัติ (วางไว้ก่อน middleware อื่นของ API) */
export function historyContext(req, _res, next) { ctx.run({ req, name: '' }, next) }
/** ตั้งชื่อผู้ทำรายการเอง (เช่น บอท LINE รู้ตัวผู้ใช้จาก LINE UID) */
export function setHistoryUser(name) { const s = ctx.getStore(); if (s && name) s.name = String(name) }
/** รันงานในนามผู้ใช้/ระบบที่กำหนด (งานเบื้องหลัง) */
export function runAs(name, fn) { return ctx.run({ req: null, name }, fn) }
function currentUser() {
  const s = ctx.getStore()
  if (!s) return 'ระบบ'
  if (s.name) return s.name
  if (s.req?.user?.name) return s.req.user.name
  const p = String(s.req?.path || '')
  if (p.startsWith('/line')) return 'บอท LINE'
  if (p.startsWith('/kiosk')) return 'เครื่องลงเวลา'
  if (p.startsWith('/portal')) return 'พอร์ทัลลูกค้า'
  return s.req ? 'ไม่ได้เข้าสู่ระบบ' : 'ระบบ'
}

// ตารางที่ไม่เก็บประวัติ: ตัวประวัติเอง · log/แคช/ตัวนับ · รูปล้วน (มีที่มาในเอกสารหลักอยู่แล้ว) · GPS ทุกนาที
export const SKIP_TABLES = new Set([
  'change_history', 'audit', 'ai_usage', 'location_log', 'takeoff_cache', 'doc_counters',
  'doc_images', 'line_order_files', 'pr_quote_files', 'journal_issues', 'material_price_history', 'labor_rate_history',
  'pin_failures', 'takeoff_jobs', 'crm_sent', 'customer_link_codes', 'feed_seen', 'contractor_link_codes', 'center_state',
  'cloud_pin_hashes', 'cloud_checkin_applied', 'cloud_user_pins', // รหัสตรวจ PIN ลงเวลาออนไลน์ (ความลับ) · ตัวกันบันทึกซ้ำ
])
// คอลัมน์ไฟล์/รูป (data URL / base64) → เก็บแค่ "[ไฟล์ n ตัวอักษร]" ให้รู้ว่าเปลี่ยน แต่ไม่ทำฐานข้อมูลบวม
const BLOB_COL = /^(data|image|images|photo|photos|png|signature|files|submit_files)$|_sig$/
// คอลัมน์ข้อมูลฟอร์ม JSON ที่ชื่อ data แต่เป็นเนื้องานจริง (ไม่ใช่ไฟล์) → เก็บเต็ม (ตัดที่ 20,000 ตัวอักษร)
const FORM_DATA_TABLES = new Set(['handover_docs', 'site_reports', 'safety_records', 'payroll_batches', 'payroll_runs'])
// คอลัมน์ลับ → เก็บแค่ *** (รู้ว่ามีการเปลี่ยน แต่ไม่รู้ค่า)
const SECRET_COL = /^(pin|enc|track_token|password|token|secret)$/
// คอลัมน์ที่เปลี่ยนเองบ่อยโดยไม่ใช่งาน → ไม่นับเป็นการแก้ (ไม่สร้างแถวประวัติถ้าเปลี่ยนแค่คอลัมน์นี้)
const NOISE_COLS = { users: new Set(['last_active']), material_prices: new Set(['po_count', 'qty_total']) }
const MAX_TEXT = 20000

const q = (s) => '"' + String(s).replace(/"/g, '""') + '"'
const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'"

function colExpr(table, col, ref) {
  const c = `${ref}.${q(col)}`
  if (SECRET_COL.test(col)) return `CASE WHEN ${c} IS NULL OR ${c} = '' THEN NULL ELSE '***' END`
  if (table === 'settings' && col === 'value')
    return `CASE WHEN ${ref}."key" LIKE '%token%' OR ${ref}."key" LIKE '%key%' OR ${ref}."key" LIKE '%secret%' OR ${ref}."key" LIKE '%pass%' THEN '***' ` +
      `WHEN length(${c}) > ${MAX_TEXT} THEN substr(${c}, 1, ${MAX_TEXT}) || '…(ตัด)' ELSE ${c} END`
  if (BLOB_COL.test(col) && !(col === 'data' && FORM_DATA_TABLES.has(table)))
    return `CASE WHEN ${c} IS NULL OR ${c} = '' THEN NULL ELSE '[ไฟล์/รูป ' || length(${c}) || ' ตัวอักษร]' END`
  return `CASE WHEN typeof(${c}) = 'blob' THEN '[ไฟล์ ' || length(${c}) || ' ไบต์]' WHEN typeof(${c}) = 'text' AND length(${c}) > ${MAX_TEXT} THEN substr(${c}, 1, ${MAX_TEXT}) || '…(ตัด)' ELSE ${c} END`
}

/** สร้างตารางประวัติ + trigger ของทุกตาราง — เรียกหลัง migration ทั้งหมด (ก่อนเปิดรับคำขอ) */
export function setupHistory(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS change_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT, user TEXT, table_name TEXT, row_key TEXT, action TEXT, before TEXT, after TEXT
  )`)
  db.exec('CREATE INDEX IF NOT EXISTS idx_ch_row ON change_history(table_name, row_key)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_ch_ts ON change_history(ts)')
  db.function('ppsd_user', { deterministic: false }, () => currentUser())
  // เวลาไทยแบบ ISO (YYYY-MM-DD HH:MM:SS) — ตรงกับวันที่ที่ผู้ใช้เห็น
  db.function('ppsd_now', { deterministic: false }, () => {
    const d = new Date(Date.now() + 7 * 3600 * 1000)
    return d.toISOString().slice(0, 19).replace('T', ' ')
  })
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name)
  let n = 0
  for (const t of tables) {
    if (SKIP_TABLES.has(t)) continue
    const info = db.prepare(`PRAGMA table_info(${q(t)})`).all()
    if (!info.length) continue
    const cols = info.map((c) => c.name)
    const pk = info.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name)
    const keyCols = cols.includes('id') ? ['id'] : pk.length ? pk : ['rowid']
    const keyOf = (ref) => keyCols.map((k) => `COALESCE(CAST(${ref}.${k === 'rowid' ? 'rowid' : q(k)} AS TEXT), '')`).join(" || '|' || ")
    const json = (ref) => `json_object(${cols.map((c) => `${lit(c)}, ${colExpr(t, c, ref)}`).join(', ')})`
    const noise = NOISE_COLS[t] || new Set()
    const watched = cols.filter((c) => !noise.has(c))
    const changed = watched.map((c) => `OLD.${q(c)} IS NOT NEW.${q(c)}`).join(' OR ') || '0'
    const ins = (action, keyRef, before, after) =>
      `INSERT INTO change_history (ts, user, table_name, row_key, action, before, after) VALUES (ppsd_now(), ppsd_user(), ${lit(t)}, ${keyOf(keyRef)}, '${action}', ${before}, ${after});`
    for (const a of ['ins', 'upd', 'del']) db.exec(`DROP TRIGGER IF EXISTS temp.${q('ppsd_hist_' + a + '_' + t)}`)
    db.exec(`CREATE TEMP TRIGGER ${q('ppsd_hist_ins_' + t)} AFTER INSERT ON main.${q(t)} BEGIN ${ins('insert', 'NEW', 'NULL', json('NEW'))} END`)
    db.exec(`CREATE TEMP TRIGGER ${q('ppsd_hist_upd_' + t)} AFTER UPDATE ON main.${q(t)} WHEN ${changed} BEGIN ${ins('update', 'NEW', json('OLD'), json('NEW'))} END`)
    db.exec(`CREATE TEMP TRIGGER ${q('ppsd_hist_del_' + t)} AFTER DELETE ON main.${q(t)} BEGIN ${ins('delete', 'OLD', json('OLD'), 'NULL')} END`)
    n++
  }
  return n
}
