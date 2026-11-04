// ===== ค้นหาข้อมูลทุกแผนก (ช่องค้นหาด้านบนทุกหน้า + หน้า "ผลการค้นหา") =====
//  พิมพ์คำเดียว → ค้นทุกแผนกพร้อมกัน: บ้าน/ก่อสร้าง · จัดซื้อ · บัญชี-การเงิน · ขาย/ลูกค้า · บุคคล
//  - หลายคำ = ต้องเจอครบทุกคำ (เช่น "ปูน บ้านสมชาย") · ตัวเลขพิมพ์มีคอมมาได้ (15,000 = 15000)
//  - ค้นชื่อบ้าน/รหัสบ้าน → เจอเอกสารทุกแผนกของบ้านนั้น (ใบขอซื้อ ใบสั่งซื้อ รายจ่าย บัญชี งาน QC ฯลฯ)
//  - กรองตามปี พ.ศ. ได้ (วันที่ในระบบมีหลายแบบ: 2026-09-18 · 18 ก.ย. 69 · 1/7/69 → แปลงให้เอง)
//  - สิทธิ์เท่ากับหน้าต้นทางทุกอย่าง: ใครเปิดหน้าไหนไม่ได้ ก็ค้นไม่เจอข้อมูลหน้านั้น (บังคับที่เซิร์ฟเวอร์)
//    และเคารพ "ปิดโมดูล" รายคน (users.deny_mods) · ไม่คืนเงินเดือน/เลขบัญชี/ไฟล์/รูป

const TH_MON = { 'ม.ค': 1, 'ก.พ': 2, 'มี.ค': 3, 'เม.ย': 4, 'พ.ค': 5, 'มิ.ย': 6, 'ก.ค': 7, 'ส.ค': 8, 'ก.ย': 9, 'ต.ค': 10, 'พ.ย': 11, 'ธ.ค': 12 }
const pad = (n) => String(n).padStart(2, '0')
// ปี 2 หลัก/4 หลัก (พ.ศ. หรือ ค.ศ.) → ค.ศ.
const ceYear = (y) => { y = Number(y); if (y < 100) return y + 2500 - 543; if (y > 2400) return y - 543; return y }

// แปลงวันที่ทุกรูปแบบในระบบ → YYYY-MM-DD (ไม่รู้จัก → '')
export function toISODate(s) {
  const t = String(s ?? '').trim()
  if (!t) return ''
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{1,2})\s*(ม\.ค|ก\.พ|มี\.ค|เม\.ย|พ\.ค|มิ\.ย|ก\.ค|ส\.ค|ก\.ย|ต\.ค|พ\.ย|ธ\.ค)\.?\s*(\d{2,4})/)
  if (m) return `${ceYear(m[3])}-${pad(TH_MON[m[2]])}-${pad(m[1])}`
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${ceYear(m[3])}-${pad(m[2])}-${pad(m[1])}`
  return ''
}

const short = (s, n = 90) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }
// รายการวัสดุ (JSON) → "ปูนกาว, ร่อง PVC 10mm., …"
const itemsText = (j) => {
  try { const a = JSON.parse(j || '[]'); if (Array.isArray(a)) return short(a.map((x) => x?.desc || x?.name || x?.item || '').filter(Boolean).join(', '), 80) } catch { /* ไม่ใช่ JSON */ }
  return ''
}
const joinSub = (...parts) => parts.filter((x) => x != null && String(x).trim() !== '').join(' · ')

// ---- แหล่งข้อมูลที่ค้นได้ ----
// mod = โมดูลที่ถูกปิดรายคนได้ (deny_mods) · allow = สิทธิ์ตามบทบาท (ตรงกับ GET ของหน้าต้นทาง)
// cols = คอลัมน์ที่ใช้ค้น (t = ตารางหลัก, h = บ้านที่ผูก) · page = หน้าที่จะพาไป
// cost = ยอดเงินฝั่งช่าง/ต้นทุน → ซ่อนยอดจากคนที่ไม่ใช่ผู้จัดการ (เหมือนหน้าบ้าน/ใบพิมพ์สรุป)
const ALL = () => true
const WRITER = (u) => ['admin', 'accounting', 'site'].includes(u.role)
const FINANCE = (u) => ['admin', 'accounting'].includes(u.role)

const SOURCES = [
  // ---------------- ก่อสร้าง / บ้าน ----------------
  { key: 'house', label: 'บ้าน / โครงการ', dept: 'site', table: 'houses', allow: ALL, page: 'house', noJoin: true,
    cols: ['t.code', 't.name', 't.project', 't.customer', 't.contract_no', 't.site_location', 't.manager', 't.owner', 't.design', 't.engineer', 't.supervisor'],
    date: (r) => r.start_date,
    map: (r) => ({ title: r.name, sub: joinSub(r.code, r.customer && 'ลูกค้า ' + r.customer, r.project, r.status, r.contract_no && 'สัญญา ' + r.contract_no), house_code: r.code, house_name: r.name, house_id: r.id }) },
  { key: 'installment', label: 'งวดงาน', dept: 'site', table: 'installments', allow: ALL, page: 'house', cost: (r) => r.side === 'contractor',
    cols: ['t.detail', 't.contractor', 't.category', 't.amount'],
    date: (r) => r.due_iso || r.due,
    map: (r) => ({ title: `งวดที่ ${r.no ?? ''} ${r.detail || ''}`.trim(), sub: joinSub(r.side === 'contractor' ? 'งวดจ่ายช่าง' : 'งวดเก็บลูกค้า', r.contractor, r.status), amount: r.amount }) },
  { key: 'contractor', label: 'ช่าง / ผู้รับเหมาในบ้าน', dept: 'site', table: 'contractors', allow: ALL, page: 'house', cost: () => true,
    cols: ['t.name', 't.role', 't.type', 't.note', 't.price_note'],
    map: (r) => ({ title: r.name, sub: joinSub(r.role, r.type), amount: r.contract_total || null }) },
  { key: 'contract', label: 'สัญญา (ลูกค้า/ช่าง)', dept: 'site', table: 'house_contracts', allow: ALL, page: 'house', cost: (r) => r.side === 'contractor',
    cols: ['t.party', 't.no', 't.title', 't.kind', 't.note', 't.amount'],
    date: (r) => r.sign_date || r.created,
    map: (r) => ({ title: r.title || r.kind || 'สัญญา', sub: joinSub(r.no, r.party, r.side === 'contractor' ? 'ฝั่งช่าง' : r.side === 'customer' ? 'ฝั่งลูกค้า' : r.side), amount: r.amount }) },
  { key: 'moneylog', label: 'เงินเข้า-ออกของบ้าน', dept: 'finance', table: 'house_money_log', allow: ALL, page: 'house', cost: (r) => r.side === 'contractor',
    cols: ['t.party', 't.inst_detail', 't.ref_no', 't.note', 't.method', 't.amount'],
    date: (r) => r.date_iso || r.created,
    map: (r) => ({ title: `${r.side === 'contractor' ? 'จ่ายช่าง' : 'รับจากลูกค้า'} ${r.inst_detail || ''}`.trim(), sub: joinSub(r.party, r.method, r.ref_no && 'อ้างอิง ' + r.ref_no), amount: r.amount }) },
  { key: 'workorder', label: 'ใบสั่งงาน (WO)', dept: 'site', table: 'work_orders', allow: ALL, page: 'workorders',
    cols: ['t.no', 't.scope', 't.project', 't.executor', 't.reviewer', 't.dod', 't.obstacle', 't.fix_note', 't.lessons'],
    date: (r) => r.issued_date || r.created,
    map: (r) => ({ title: joinSub(r.no, short(r.scope, 70)), sub: joinSub(r.executor && 'ผู้ทำ ' + r.executor, r.status), amount: r.budget || null }) },
  { key: 'qc', label: 'ตรวจงาน QC', dept: 'site', table: 'qc_inspections', allow: ALL, page: 'qc',
    cols: ['t.no', 't.category', 't.type', 't.zone', 't.inspector', 't.remark', 't.worker', 't.phase'],
    date: (r) => r.date || r.created,
    map: (r) => ({ title: joinSub(r.no, r.category, r.zone), sub: joinSub(r.inspector && 'ผู้ตรวจ ' + r.inspector, r.status, short(r.remark, 60)) }) },
  { key: 'issue', label: 'ปัญหาหน้างาน / แจ้งซ่อม', dept: 'site', table: 'issues', allow: ALL, page: 'issues',
    cols: ['t.title', 't.note', 't.case_no', 't.category', 't.assignee', 't.by'],
    date: (r) => r.created_at || r.date,
    map: (r) => ({ title: joinSub(r.case_no, r.title), sub: joinSub(r.status, r.priority, short(r.note, 60)) }) },
  { key: 'sitedoc', label: 'เอกสารหน้างาน (RFI/RFA/NCR/VO)', dept: 'site', table: 'site_docs', allow: ALL, page: 'sitedocs',
    cols: ['t.kind', 't.no', 't.title', 't.detail', 't.discipline', 't.response', 't.assignee'],
    date: (r) => r.date || r.created,
    map: (r) => ({ title: joinSub(r.no, r.title), sub: joinSub(r.kind, r.status, short(r.detail, 60)), amount: r.cost_impact || null }) },
  { key: 'handover', label: 'ส่งมอบงาน', dept: 'site', table: 'handover_docs', allow: ALL, page: 'handover',
    cols: ['t.no', 't.title', 't.kind'],
    date: (r) => r.date || r.created,
    map: (r) => ({ title: joinSub(r.no, r.title), sub: joinSub(r.kind, r.status) }) },
  { key: 'report', label: 'รายงานจากช่าง (LINE)', dept: 'site', table: 'contractor_reports', allow: ALL, page: 'center', cost: () => true,
    cols: ['t.contractor', 't.text', 't.kind'],
    date: (r) => r.ts,
    map: (r) => ({ title: short(r.text, 80) || r.kind, sub: joinSub(r.contractor, r.status), amount: r.amount || null }) },
  { key: 'file', label: 'ไฟล์แนบ', dept: 'site', table: 'files', allow: ALL, page: 'house', select: 't.id,t.house_code,t.name,t.category,t.uploaded,t.uploader',
    cols: ['t.name', 't.category', 't.uploader'],
    date: (r) => r.uploaded,
    map: (r) => ({ title: r.name, sub: joinSub(r.category, r.uploader && 'อัปโหลดโดย ' + r.uploader) }) },
  { key: 'docreg', label: 'ทะเบียนเอกสาร', dept: 'site', table: 'doc_register', allow: ALL, page: 'docreg',
    cols: ['t.no', 't.title', 't.doc_no', 't.category', 't.owner', 't.note'],
    date: (r) => r.rev_date || r.created,
    map: (r) => ({ title: joinSub(r.no, r.title), sub: joinSub(r.category, r.doc_no, r.revision && 'Rev ' + r.revision, r.status) }) },
  { key: 'boq', label: 'BOQ / ประเมินราคา', dept: 'site', table: 'boqs', allow: ALL, page: 'house', select: 't.id,t.no,t.house_code,t.title,t.rev,t.date,t.created,t.by',
    cols: ['t.no', 't.title', 't.by'],
    date: (r) => r.date || r.created,
    map: (r) => ({ title: joinSub(r.no, r.title), sub: joinSub(r.rev != null && 'ฉบับ ' + r.rev, r.by) }) },

  // ---------------- จัดซื้อ ----------------
  { key: 'pr', label: 'ใบขอซื้อ (PR)', dept: 'procure', table: 'purchase_requests', mod: 'procurement', allow: WRITER, page: 'procurement',
    select: 't.id,t.no,t.date,t.house,t.house_code,t.by,t.item,t.items,t.amount,t.status,t.category',
    cols: ['t.no', 't.item', 't.items', 't.house', 't.by', 't.category', 't.approver', 't.amount'],
    date: (r) => r.date,
    map: (r) => ({ title: joinSub(r.no, short(r.item, 60) || itemsText(r.items)), sub: joinSub(r.by && 'ขอโดย ' + r.by, r.status, r.item ? itemsText(r.items) : ''), amount: r.amount }) },
  { key: 'po', label: 'ใบสั่งซื้อ (PO)', dept: 'procure', table: 'purchase_orders', mod: 'procurement', allow: FINANCE, page: 'procurement',
    select: 't.id,t.no,t.date,t.vendor,t.item,t.items,t.amount,t.status,t.pr_no,t.house_code,t.tax_invoice_no,t.gr_status',
    cols: ['t.no', 't.vendor', 't.item', 't.items', 't.pr_no', 't.tax_invoice_no', 't.amount'],
    date: (r) => r.date,
    map: (r) => ({ title: joinSub(r.no, r.vendor), sub: joinSub(short(r.item, 50) || itemsText(r.items), r.pr_no && 'จาก ' + r.pr_no, r.status, r.tax_invoice_no && 'ใบกำกับ ' + r.tax_invoice_no), amount: r.amount }) },
  { key: 'payment', label: 'ใบจ่ายเงิน', dept: 'procure', table: 'payments', mod: 'procurement', allow: FINANCE, page: 'procurement',
    cols: ['t.no', 't.payee', 't.note', 't.type', 't.gross', 't.net'],
    date: (r) => r.date_iso || r.date,
    map: (r) => ({ title: joinSub(r.no, r.payee), sub: joinSub(r.type, r.status, r.wht ? `หัก ณ ที่จ่าย ${Number(r.wht).toLocaleString('th-TH')}` : '', short(r.note, 50)), amount: r.gross }) },
  { key: 'vendor', label: 'ผู้ขาย / ร้านค้า', dept: 'procure', table: 'vendors', mod: 'procurement', allow: FINANCE, page: 'procurement', noJoin: true,
    cols: ['t.name', 't.tax_id', 't.type', 't.category', 't.address'],
    map: (r) => ({ title: r.name, sub: joinSub(r.type, r.category, r.tax_id && 'เลขภาษี ' + r.tax_id) }) },

  // ---------------- บัญชี / การเงิน ----------------
  { key: 'expense', label: 'รายจ่าย', dept: 'finance', table: 'expenses', mod: 'accounting', allow: ALL, page: 'expenses',
    cols: ['t.item', 't.vendor', 't.cat', 't.tax_invoice_no', 't.amount'],
    date: (r) => r.date_iso || r.date,
    map: (r) => ({ title: r.item, sub: joinSub(r.cat, r.vendor, r.status, r.tax_invoice_no && 'ใบกำกับ ' + r.tax_invoice_no), amount: r.amount }) },
  { key: 'petty', label: 'เงินสดย่อย', dept: 'finance', table: 'petty_expenses', mod: 'accounting', allow: FINANCE, page: 'accounting',
    cols: ['t.vendor', 't.item', 't.items', 't.doc_no', 't.ref_no', 't.requester', 't.note', 't.vehicle', 't.cat', 't.amount'],
    date: (r) => r.date_iso,
    map: (r) => ({ title: joinSub(r.doc_no, short(r.item, 60) || itemsText(r.items)), sub: joinSub(r.cat, r.vendor, r.requester && 'ผู้เบิก ' + r.requester, r.ref_no), amount: r.amount }) },
  { key: 'journal', label: 'รายการบัญชี (สมุดรายวัน)', dept: 'finance', table: 'journal_entries', mod: 'accounting', allow: FINANCE, page: 'accounting',
    select: 't.*, (SELECT SUM(debit) FROM journal_lines l WHERE l.entry_id=t.id) AS total',
    cols: ['t.no', 't.memo', 't.ref'],
    date: (r) => r.date_iso || r.date,
    map: (r) => ({ title: joinSub(r.no, short(r.memo, 70)), sub: joinSub(r.ref && 'อ้างอิง ' + r.ref, r.void ? 'ยกเลิกแล้ว' : ''), amount: r.total }) },
  { key: 'asset', label: 'ทรัพย์สินถาวร', dept: 'finance', table: 'fixed_assets', mod: 'accounting', allow: FINANCE, page: 'accounting',
    cols: ['t.code', 't.name', 't.category', 't.note'],
    date: (r) => r.acquire_date,
    map: (r) => ({ title: joinSub(r.code, r.name), sub: joinSub(r.category, r.disposed ? 'จำหน่ายแล้ว' : ''), amount: r.cost }) },

  // ---------------- ขาย / ลูกค้า ----------------
  { key: 'customer', label: 'ลูกค้า', dept: 'sales', table: 'customers', mod: 'sales', allow: ALL, page: 'customers', noJoin: true,
    select: 't.id,t.code,t.name,t.phone,t.project,t.status,t.created',
    cols: ['t.code', 't.name', 't.phone', 't.email', 't.project', 't.address', 't.note'],
    date: (r) => r.created,
    map: (r) => ({ title: r.name, sub: joinSub(r.code, r.phone, r.project, r.status) }) },
  { key: 'lead', label: 'ผู้สนใจ (Lead)', dept: 'sales', table: 'leads', mod: 'sales', allow: ALL, page: 'customers', noJoin: true,
    cols: ['t.no', 't.name', 't.phone', 't.note', 't.source'],
    date: (r) => r.created,
    map: (r) => ({ title: joinSub(r.no, r.name), sub: joinSub(r.phone, r.stage, r.source), amount: r.value || null }) },
  { key: 'salesdoc', label: 'เอกสารขาย (ใบเสนอราคา/ใบเสร็จ)', dept: 'sales', table: 'sales_docs', mod: 'sales', allow: ALL, page: 'sales',
    cols: ['t.no', 't.customer', 't.type', 't.ref', 't.items', 't.total'],
    date: (r) => r.date_iso || r.date,
    map: (r) => ({ title: joinSub(r.no, r.customer), sub: joinSub(r.type, r.status, r.ref && 'อ้างอิง ' + r.ref), amount: r.total }) },

  // ---------------- บุคคล (ไม่คืนเงินเดือน/เลขบัญชี/เลขบัตร) ----------------
  { key: 'employee', label: 'พนักงาน', dept: 'hr', table: 'employees', mod: 'hr', allow: ALL, page: 'hr', noJoin: true,
    select: 't.id,t.code,t.name,t.nickname,t.role,t.dept,t.status,t.start',
    cols: ['t.code', 't.name', 't.nickname', 't.role', 't.dept'],
    date: (r) => r.start,
    map: (r) => ({ title: `${r.name}${r.nickname ? ` (${r.nickname})` : ''}`, sub: joinSub(r.code, r.role, r.dept, r.status) }) },
]

export const DEPTS = { site: 'ก่อสร้าง / บ้าน', procure: 'จัดซื้อ', finance: 'บัญชี / การเงิน', sales: 'ขาย / ลูกค้า', hr: 'บุคคล' }

const esc = (w) => w.replace(/[\\%_]/g, (c) => '\\' + c)
// แยกคำค้น: เว้นวรรค = หลายคำ · ตัวเลขมีคอมมา → ตัดคอมมา
export function splitTerms(q) {
  return String(q || '').trim().split(/\s+/).filter(Boolean).slice(0, 6)
    .map((w) => (/^[\d,]+(\.\d+)?$/.test(w) ? w.replace(/,/g, '') : w))
}

export function createSearch({ db, isManager = () => false }) {
  // อ่านรายชื่อตารางตอนค้นครั้งแรก (บางตารางถูกสร้างหลังโมดูลนี้)
  let tables = null
  const hasTable = (t) => (tables ||= new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name))).has(t)
  const colCache = new Map()
  const colsOf = (t) => { if (!colCache.has(t)) colCache.set(t, new Set(db.prepare(`PRAGMA table_info(${JSON.stringify(t)})`).all().map((c) => c.name))); return colCache.get(t) }
  const stmtCache = new Map()
  const prep = (key, build) => { let st = stmtCache.get(key); if (!st) { st = db.prepare(build()); stmtCache.set(key, st) } return st }
  const usable = (user, s) => {
    const deny = user.role === 'admin' ? [] : (user.deny_mods || [])
    return hasTable(s.table) && s.allow(user) && !(s.mod && deny.includes(s.mod))
  }
  // แถวจากฐานข้อมูล → รายการที่หน้าจอใช้ (ซ่อนยอดต้นทุนช่างจากคนที่ไม่ใช่ผู้จัดการ)
  const toItem = (s, r, mgr) => {
    const m = s.map(r)
    const hide = !mgr && s.cost && s.cost(r)
    return {
      id: r.id ?? null, ...m, date: toISODate(s.date ? s.date(r) : ''),
      amount: !hide && m.amount != null && m.amount !== '' && Number.isFinite(Number(m.amount)) ? Number(m.amount) : null,
      house_code: m.house_code ?? r.house_code ?? '', house_name: m.house_name ?? r._house_name ?? (r.house || ''), house_id: m.house_id ?? r._house_id ?? null,
      page: s.page,
    }
  }
  const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '')

  // user = req.user · opts: q, year (พ.ศ.), dept, type, limit (ต่อกลุ่ม)
  function search(user, { q, year, dept, type, limit = 8 } = {}) {
    const terms = splitTerms(q)
    const out = { q: String(q || ''), groups: [], total: 0 }
    if (!terms.length || terms.join('').length < 2) return out
    const mgr = isManager(user)
    const ce = Number(year) > 2400 ? Number(year) - 543 : 0
    const cap = Math.max(1, Math.min(200, Number(limit) || 8))
    for (const s of SOURCES) {
      if (type && s.key !== type) continue
      if (dept && s.dept !== dept) continue
      if (!usable(user, s)) continue
      const have = colsOf(s.table)
      const join = !s.noJoin && have.has('house_code')
      const cols = s.cols.filter((c) => have.has(c.slice(2))).map((c) => `COALESCE(CAST(${c} AS TEXT),'')`)
      if (join) cols.push("COALESCE(h.name,'')", "COALESCE(t.house_code,'')")
      if (!cols.length) continue
      const st = prep('q:' + s.key + ':' + terms.length, () => {
        const hay = cols.join(" || ' ' || ")
        const where = terms.map(() => `(${hay}) LIKE ? ESCAPE '\\'`).join(' AND ')
        return `SELECT ${s.select || 't.*'}${join ? ', h.name AS _house_name, h.id AS _house_id' : ''} FROM ${s.table} t` +
          (join ? ' LEFT JOIN houses h ON h.code = t.house_code' : '') + ` WHERE ${where} ORDER BY t.rowid DESC LIMIT 500`
      })
      let rows
      try { rows = st.all(...terms.map((w) => `%${esc(w)}%`)) } catch { continue }
      const fetchedAll = rows.length < 500
      let items = rows.map((r) => toItem(s, r, mgr))
      if (ce && s.date) items = items.filter((x) => x.date && Number(x.date.slice(0, 4)) === ce)
      if (!items.length) continue
      items.sort(byDateDesc)
      out.groups.push({ type: s.key, label: s.label, dept: s.dept, dept_label: DEPTS[s.dept], count: items.length, more: !fetchedAll, items: items.slice(0, cap) })
      out.total += items.length
    }
    return out
  }

  // ===== แฟ้มบ้าน: ทุกเรื่องของบ้านหลังเดียว จากทุกแผนก (แท็บ "ประวัติทั้งหมด" + พิมพ์แฟ้มบ้าน) =====
  //  ผูกด้วยรหัสบ้าน (house_code) · ใบขอซื้อเก่าที่มีแต่ชื่อบ้าน (ไม่มีรหัส) ก็นับด้วย · สิทธิ์เหมือนการค้นหา
  function houseFile(user, code) {
    const h = db.prepare('SELECT * FROM houses WHERE code=?').get(String(code || ''))
    if (!h) return null
    const mgr = isManager(user)
    const groups = []
    for (const s of SOURCES) {
      if (s.noJoin || !usable(user, s)) continue
      const have = colsOf(s.table)
      if (!have.has('house_code')) continue
      const byName = have.has('house')
      const st = prep('h:' + s.key, () => `SELECT ${s.select || 't.*'} FROM ${s.table} t WHERE t.house_code = ?` +
        (byName ? " OR ((t.house_code IS NULL OR t.house_code = '') AND t.house = ? AND t.house <> '')" : '') + ' ORDER BY t.rowid DESC LIMIT 3000')
      let rows
      try { rows = byName ? st.all(h.code, h.name) : st.all(h.code) } catch { continue }
      if (!rows.length) continue
      const items = rows.map((r) => toItem(s, { ...r, _house_name: h.name, _house_id: h.id }, mgr)).sort(byDateDesc)
      const amounts = items.filter((x) => x.amount != null)
      groups.push({
        type: s.key, label: s.label, dept: s.dept, dept_label: DEPTS[s.dept], count: items.length, more: rows.length >= 3000,
        total: amounts.length ? amounts.reduce((t, x) => t + x.amount, 0) : null, items,
      })
    }
    return { house: { id: h.id, code: h.code, name: h.name, customer: h.customer, status: h.status, project: h.project }, groups, can_see_cost: mgr }
  }
  return { search, houseFile }
}
