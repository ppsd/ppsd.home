// ดูข้อมูลในไฟล์สำรอง (อ่านอย่างเดียว) — เลือกวัน → ตาราง → เทียบกับข้อมูลตอนนี้ (ถูกลบ/ถูกแก้/เหมือนเดิม)
// กู้คืน "ทีละรายการ" ได้เฉพาะรายการที่ถูกลบไปแล้ว และเฉพาะตารางที่ไม่กระทบบัญชีโดยตรง
// เอกสารการเงิน (PR/PO/ใบจ่าย/รายจ่าย/สมุดบัญชี ฯลฯ) ดูได้อย่างเดียว — กู้กลับเฉยๆ บัญชีจะเพี้ยน ต้องบันทึกใหม่ผ่านหน้าปกติ
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// ตารางที่เปิดดูได้: label = ชื่อที่แสดง · cols = คอลัมน์หลักในตาราง · restore = กู้ทีละรายการได้ · title = คอลัมน์ที่ใช้เป็นชื่อรายการ
const TABLES = {
  houses: { label: 'บ้าน / โครงการ', cols: ['code', 'name', 'customer', 'status', 'value'], restore: true, title: 'name' },
  installments: { label: 'งวดงาน (ลูกค้า/ช่าง)', cols: ['house_code', 'side', 'no', 'detail', 'amount', 'paid', 'status'], restore: true, title: 'detail' },
  inst_acceptance: { label: 'ตรวจรับงวด', cols: ['house_code', 'no', 'date', 'result', 'inspector'], restore: true, title: 'no' },
  files: { label: 'ไฟล์แนบ', cols: ['house_code', 'name', 'category', 'uploaded', 'uploader'], restore: true, title: 'name' },
  boqs: { label: 'BOQ', cols: ['no', 'house_code', 'title', 'rev', 'date'], restore: true, title: 'title' },
  contractors: { label: 'ช่าง / ผู้รับเหมาของบ้าน', cols: ['house_code', 'name', 'role', 'contract_total', 'paid'], restore: true, title: 'name' },
  qc_inspections: { label: 'ใบตรวจ QC', cols: ['no', 'house_code', 'category', 'date', 'status', 'inspector'], restore: true, title: 'no' },
  work_orders: { label: 'ใบสั่งงาน', cols: ['no', 'house_code', 'executor', 'project', 'status', 'due_date'], restore: true, title: 'no' },
  site_docs: { label: 'เอกสารหน้างาน (RFI/RFA/NCR/VO)', cols: ['no', 'kind', 'house_code', 'title', 'status', 'date'], restore: true, title: 'title' },
  site_reports: { label: 'รายงานหน้างาน', cols: ['no', 'kind', 'house_code', 'date', 'by'], restore: true, title: 'no' },
  safety_records: { label: 'งานความปลอดภัย', cols: ['no', 'kind', 'house_code', 'title', 'date'], restore: true, title: 'title' },
  handover_docs: { label: 'ส่งมอบงาน / หนังสือรับรอง', cols: ['no', 'kind', 'house_code', 'title', 'date', 'status'], restore: true, title: 'title' },
  doc_register: { label: 'ทะเบียนเอกสาร', cols: ['no', 'category', 'title', 'house_code', 'status', 'expiry'], restore: true, title: 'title' },
  issues: { label: 'ปัญหา / แจ้งซ่อม', cols: ['house_code', 'title', 'status', 'date', 'case_no'], restore: true, title: 'title' },
  tasks: { label: 'แผนงาน (Gantt)', cols: ['house_code', 'name', 'start', 'end', 'progress', 'status'], restore: true, title: 'name' },
  customers: { label: 'ลูกค้า (CRM)', cols: ['code', 'name', 'phone', 'project', 'status'], restore: true, title: 'name' },
  leads: { label: 'Lead', cols: ['no', 'name', 'phone', 'stage', 'value'], restore: true, title: 'name' },
  vendors: { label: 'ร้านค้า / ผู้ขาย', cols: ['name', 'type', 'tax_id', 'credit_days'], restore: true, title: 'name' },
  material_prices: { label: 'ราคากลางวัสดุ', cols: ['name', 'unit', 'central', 'confidence', 'active'], restore: true, title: 'name' },
  labor_rates: { label: 'ราคากลางค่าแรง', cols: ['grp', 'name', 'variant', 'unit', 'price_min', 'price_max'], restore: true, title: 'name' },
  // ---- ดูได้อย่างเดียว (เกี่ยวกับเงิน/บัญชี/บุคคล — กู้กลับต้องทำผ่านหน้าปกติ) ----
  purchase_requests: { label: 'ใบขอซื้อ (PR)', cols: ['no', 'date', 'house', 'item', 'amount', 'status'], title: 'no' },
  purchase_orders: { label: 'ใบสั่งซื้อ (PO)', cols: ['no', 'date', 'vendor', 'item', 'amount', 'status'], title: 'no' },
  payments: { label: 'ใบจ่ายเงิน', cols: ['no', 'date', 'payee', 'gross', 'net', 'status'], title: 'no' },
  expenses: { label: 'รายจ่าย', cols: ['date', 'house_code', 'item', 'vendor', 'amount', 'status'], title: 'item' },
  petty_expenses: { label: 'เงินสดย่อย / น้ำมัน', cols: ['date_iso', 'fund', 'item', 'vendor', 'amount', 'house_code'], title: 'item' },
  sales_docs: { label: 'เอกสารขาย', cols: ['no', 'type', 'customer', 'date', 'total', 'status'], title: 'no' },
  journal_entries: { label: 'สมุดบัญชี (หัวรายการ)', cols: ['no', 'date', 'memo', 'house_code', 'source', 'void'], title: 'no' },
  employees: { label: 'พนักงาน', cols: ['code', 'name', 'role', 'status', 'start'], title: 'name' },
  attendance: { label: 'ลงเวลา', cols: ['date', 'emp_code', 'emp_name', 'check_in', 'check_out', 'status'], title: 'emp_name' },
  leaves: { label: 'ใบลา', cols: ['emp_name', 'type', 'start_date', 'end_date', 'days', 'status'], title: 'emp_name' },
  ot: { label: 'OT', cols: ['name', 'date', 'hours', 'amount', 'status'], title: 'name' },
  audit: { label: 'ประวัติการใช้งาน', cols: ['ts', 'user', 'action', 'detail'], title: 'action' },
}
// คอลัมน์ลับ — ไม่ส่งออกจากไฟล์สำรองเลย (แม้เป็นแอดมิน)
const SECRET_COLS = new Set(['pin', 'track_token', 'portal_token'])
const BACKUP_NAME = /^ppsd-auto-\d{4}-\d{2}-\d{2}\.sqlite$/

// ค่าเยอะ (รูป/ลายเซ็น/JSON ยาว) → ย่อเป็นป้ายบอกขนาด ไม่ส่งทั้งก้อน
function shortVal(v) {
  if (typeof v !== 'string' || v.length <= 300) return v
  const kb = Math.round(v.length / 1024)
  if (/^data:/.test(v)) return `[รูป/ไฟล์ ${kb} KB]`
  if (/^[[{]/.test(v)) return v.slice(0, 280) + ` … [ข้อมูลยาว ${kb} KB]`
  return v.slice(0, 280) + ` … [${kb} KB]`
}
const publicRow = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => !SECRET_COLS.has(k)).map(([k, v]) => [k, shortVal(v)]))
const sameVal = (a, b) => (a ?? null) === (b ?? null) || String(a ?? '') === String(b ?? '')

export function registerBackupViewer(api, { db, Database, backupDir, uploadsDir, adminOnly, audit, notifyChange, recomputeHouse, syncInstallmentJournal }) {
  const hasTable = (d, t) => !!d.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t)
  const colsOf = (d, t) => d.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name)
  // เปิดไฟล์สำรองแบบอ่านอย่างเดียว → เรียก fn แล้วปิดเสมอ
  function withBackup(req, res, fn) {
    const name = String(req.params.name || '')
    if (!BACKUP_NAME.test(name)) return res.status(400).json({ error: 'ชื่อไฟล์สำรองไม่ถูกต้อง' })
    const file = join(backupDir, name)
    if (!existsSync(file)) return res.status(404).json({ error: 'ไม่พบไฟล์สำรองนี้' })
    let bk
    try { bk = new Database(file, { readonly: true, fileMustExist: true }) } catch (e) { return res.status(400).json({ error: 'เปิดไฟล์สำรองไม่ได้ — ' + e.message }) }
    try { return fn(bk, name) } catch (e) { console.error('[backup-viewer]', e); return res.status(500).json({ error: 'อ่านไฟล์สำรองไม่สำเร็จ — ' + e.message }) } finally { try { bk.close() } catch { /* ignore */ } }
  }
  function tableOf(req, res) {
    const t = String(req.params.table || '')
    if (!TABLES[t]) { res.status(400).json({ error: 'ตารางนี้เปิดดูไม่ได้' }); return null }
    return t
  }
  // สถานะของแต่ละแถวในไฟล์สำรอง เทียบกับข้อมูลตอนนี้ (ตาม id)
  function compare(bk, t) {
    const common = colsOf(bk, t).filter((c) => colsOf(db, t).includes(c) && !SECRET_COLS.has(c))
    const nowById = new Map(db.prepare(`SELECT * FROM ${t}`).all().map((r) => [r.id, r]))
    const rows = bk.prepare(`SELECT * FROM ${t} ORDER BY id DESC LIMIT 50000`).all().map((r) => {
      const cur = nowById.get(r.id)
      const status = !cur ? 'deleted' : common.some((c) => !sameVal(r[c], cur[c])) ? 'changed' : 'same'
      return { r, status }
    })
    const bkIds = new Set(rows.map((x) => x.r.id))
    const added = [...nowById.keys()].filter((id) => !bkIds.has(id)).length
    return { rows, added, common }
  }

  // รายการตารางที่ดูได้ + จำนวนแถว (ไฟล์สำรอง / ตอนนี้)
  api.get('/backups/:name/browse', adminOnly, (req, res) => withBackup(req, res, (bk, name) => {
    const tables = Object.entries(TABLES).filter(([t]) => hasTable(bk, t) && hasTable(db, t)).map(([t, c]) => ({
      key: t, label: c.label, restore: !!c.restore,
      count_backup: bk.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c,
      count_now: db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c,
    }))
    res.json({ name, date: name.slice(10, 20), tables })
  }))

  // แถวในตาราง: ค้นหา (q) · กรองสถานะ (status) · แบ่งหน้า
  api.get('/backups/:name/browse/:table', adminOnly, (req, res) => withBackup(req, res, (bk) => {
    const t = tableOf(req, res); if (!t) return
    const { rows, added } = compare(bk, t)
    const counts = { same: 0, changed: 0, deleted: 0, added }
    for (const x of rows) counts[x.status]++
    const q = String(req.query.q || '').trim().toLowerCase()
    const st = ['same', 'changed', 'deleted'].includes(req.query.status) ? req.query.status : ''
    const list = rows.filter((x) => (!st || x.status === st) && (!q || Object.entries(x.r).some(([k, v]) => !SECRET_COLS.has(k) && typeof v !== 'object' && String(v ?? '').toLowerCase().includes(q))))
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100)), offset = Math.max(0, Number(req.query.offset) || 0)
    const cfg = TABLES[t]
    const cols = cfg.cols.filter((c) => colsOf(bk, t).includes(c))
    res.json({
      table: t, label: cfg.label, restore: !!cfg.restore, cols, counts, total: list.length,
      rows: list.slice(offset, offset + limit).map((x) => ({ id: x.r.id, _status: x.status, ...Object.fromEntries(cols.map((c) => [c, shortVal(x.r[c])])) })),
    })
  }))

  // รายละเอียดแถวเดียว: ค่าในไฟล์สำรอง vs ตอนนี้ + คอลัมน์ที่ต่างกัน
  api.get('/backups/:name/browse/:table/:id', adminOnly, (req, res) => withBackup(req, res, (bk) => {
    const t = tableOf(req, res); if (!t) return
    const r = bk.prepare(`SELECT * FROM ${t} WHERE id=?`).get(Number(req.params.id))
    if (!r) return res.status(404).json({ error: 'ไม่พบรายการนี้ในไฟล์สำรอง' })
    const cur = db.prepare(`SELECT * FROM ${t} WHERE id=?`).get(r.id) || null
    const common = colsOf(bk, t).filter((c) => !cur || c in cur)
    const changed = cur ? common.filter((c) => !SECRET_COLS.has(c) && !sameVal(r[c], cur[c])) : []
    res.json({ table: t, restore: !!TABLES[t].restore, status: !cur ? 'deleted' : changed.length ? 'changed' : 'same', backup: publicRow(r), current: cur ? publicRow(cur) : null, changed })
  }))

  // กู้คืนรายการที่ถูกลบ (id เดิม) — เฉพาะตารางที่อนุญาต · บ้านต้องยังอยู่ · ไฟล์แนบก๊อปกลับจากชุดสำรอง · งวดงานลงบัญชีใหม่ให้
  api.post('/backups/:name/browse/:table/:id/restore', adminOnly, (req, res) => withBackup(req, res, (bk, name) => {
    const t = tableOf(req, res); if (!t) return
    const cfg = TABLES[t]
    if (!cfg.restore) return res.status(400).json({ error: `${cfg.label} กู้คืนทีละรายการไม่ได้ (เกี่ยวกับเงิน/บัญชี) — ดูค่าจากไฟล์สำรองแล้วบันทึกใหม่ผ่านหน้าปกติ` })
    const r = bk.prepare(`SELECT * FROM ${t} WHERE id=?`).get(Number(req.params.id))
    if (!r) return res.status(404).json({ error: 'ไม่พบรายการนี้ในไฟล์สำรอง' })
    if (db.prepare(`SELECT 1 FROM ${t} WHERE id=?`).get(r.id)) return res.status(409).json({ error: 'รายการนี้ยังอยู่ในระบบ (ไม่ได้ถูกลบ) — กู้คืนได้เฉพาะรายการที่ถูกลบไปแล้ว' })
    if (t !== 'houses' && r.house_code && !db.prepare('SELECT 1 FROM houses WHERE code=?').get(r.house_code))
      return res.status(409).json({ error: `บ้าน ${r.house_code} ไม่มีในระบบแล้ว — กู้คืนบ้านก่อน (ตาราง "บ้าน / โครงการ")` })
    if (t === 'houses' && db.prepare('SELECT 1 FROM houses WHERE code=?').get(r.code)) return res.status(409).json({ error: `รหัสบ้าน ${r.code} ถูกบ้านอื่นใช้อยู่แล้ว` })
    const cols = colsOf(bk, t).filter((c) => colsOf(db, t).includes(c))
    try {
      db.prepare(`INSERT INTO ${t} (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => r[c]))
    } catch (e) { return res.status(409).json({ error: 'กู้คืนไม่ได้ — ข้อมูลชนกับรายการที่มีอยู่ (' + e.message + ')' }) }
    const notes = []
    if (t === 'files' && r.path && !existsSync(join(uploadsDir, r.path))) {
      const src = join(backupDir, 'files', r.path)
      if (existsSync(src)) { writeFileSync(join(uploadsDir, r.path), readFileSync(src)); notes.push('ก๊อปไฟล์กลับจากชุดสำรองแล้ว') }
      else notes.push('⚠️ ไม่พบตัวไฟล์ในชุดสำรอง (มีแค่ข้อมูลรายการ)')
    }
    if (t === 'installments') {
      try { syncInstallmentJournal(db.prepare('SELECT * FROM installments WHERE id=?').get(r.id)); if (Number(r.paid) > 0) notes.push('ลงบัญชีของงวดนี้ใหม่แล้ว') } catch (e) { notes.push('⚠️ ลงบัญชีของงวดไม่สำเร็จ: ' + e.message) }
    }
    if (r.house_code || t === 'houses') { try { recomputeHouse(t === 'houses' ? r.code : r.house_code) } catch { /* ignore */ } }
    audit(req, 'กู้คืนรายการจากไฟล์สำรอง', `${cfg.label} #${r.id} ${r[cfg.title] ?? ''} · จาก ${name.slice(10, 20)}${notes.length ? ' · ' + notes.join(' · ') : ''}`)
    notifyChange([t === 'installments' ? 'installments' : t, 'houses', 'dashboard', 'notifications'])
    res.json({ ok: true, notes })
  }))

  // ดาวน์โหลดไฟล์แนบจากชุดสำรอง ด้วยชื่อจริง (บังคับดาวน์โหลด ไม่เปิดในเบราว์เซอร์)
  api.get('/backups/:name/file/:id', adminOnly, (req, res) => withBackup(req, res, (bk) => {
    const f = bk.prepare('SELECT id, name, path, data FROM files WHERE id=?').get(Number(req.params.id))
    if (!f) return res.status(404).json({ error: 'ไม่พบไฟล์นี้ในไฟล์สำรอง' })
    let buf = null
    for (const p of [f.path && join(backupDir, 'files', f.path), f.path && join(uploadsDir, f.path)]) if (p && existsSync(p)) { buf = readFileSync(p); break }
    if (!buf && f.data) buf = Buffer.from(String(f.data).replace(/^data:[^;]+;base64,/, ''), 'base64')
    if (!buf) return res.status(404).json({ error: 'ไม่พบตัวไฟล์ในชุดสำรอง' })
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.name || 'file')}`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(buf)
  }))
}
