// ===== ศูนย์กลางงานบ้าน: ความเคลื่อนไหวบ้าน · คิวรออนุมัติ · ส่งอัปเดตให้ลูกค้าทาง LINE =====
//  1) ความเคลื่อนไหวบ้าน (ทุกคนเห็น): อ่านจากประวัติการแก้ไขกลาง (change_history) เฉพาะข้อมูลที่ผูกกับบ้าน
//     รวมรายการที่ทำพร้อมกัน (คนเดียวกัน · วินาทีเดียวกัน · บ้านเดียวกัน) เป็น 1 เรื่อง · ตัวนับ "ยังไม่ได้ดู" แยกต่อคน
//  2) รออนุมัติ: งานที่กระทบเงิน/เพิ่มลดงาน ถ้าคนทำไม่ใช่แอดมิน/ผู้จัดการ → ไม่บันทึกทันที แต่เข้าคิว "รออนุมัติ"
//     แอดมิน/ผู้จัดการกดอนุมัติ → ระบบทำรายการนั้นให้จริง (ในนามผู้ขอ) · ตีกลับ → ไม่มีอะไรเปลี่ยน + แจ้งผู้ขอ
//     เปิด/ปิดแต่ละเรื่องได้ที่หน้า "ความเคลื่อนไหวบ้าน → ตั้งค่าการอนุมัติ" (แอดมิน)
//  3) ส่งอัปเดตลูกค้า: คนดูแลลูกค้าเลือกเรื่องที่จะบอกลูกค้า → ดู/แก้ข้อความ → กดส่งเข้า LINE ลูกค้า (ไม่ส่งเองอัตโนมัติ)

const TABLE_LABEL = {
  houses: 'ข้อมูลบ้าน', installments: 'งวดงาน', house_contracts: 'สัญญา', house_money_log: 'เงินเข้า-ออก',
  contractors: 'ช่าง/ผู้รับเหมา', contractor_advances: 'ค่าของผู้รับเหมา', contractor_evals: 'ประเมินผู้รับเหมา',
  site_reports: 'รายงานหน้างาน', qc_inspections: 'ตรวจ QC', work_orders: 'ใบสั่งงาน', site_docs: 'เอกสารหน้างาน',
  issues: 'ปัญหา/แจ้งซ่อม', safety_records: 'ความปลอดภัย', tasks: 'แผนงาน', inst_acceptance: 'ตรวจรับงวด',
  handover_docs: 'ส่งมอบบ้าน', purchase_requests: 'ใบขอซื้อ', purchase_orders: 'ใบสั่งซื้อ', goods_receipts: 'ตรวจรับของ',
  payments: 'ใบจ่ายเงิน', expenses: 'รายจ่าย', petty_expenses: 'เงินสดย่อย', sales_docs: 'เอกสารขาย', stock_moves: 'เบิกสต๊อก',
  files: 'ไฟล์', boqs: 'BOQ', house_categories: 'หมวดงวด', fuel_requests: 'เบิกค่าน้ำมัน', doc_register: 'ทะเบียนเอกสาร',
  change_requests: 'คำขออนุมัติ', customer_updates: 'อัปเดตลูกค้า', cashflows: 'กระแสเงินสด', nps: 'ความพึงพอใจลูกค้า',
}
const CATS = {
  money: ['installments', 'house_contracts', 'house_money_log', 'contractors', 'contractor_advances', 'payments', 'expenses', 'petty_expenses', 'purchase_requests', 'purchase_orders', 'goods_receipts', 'sales_docs', 'fuel_requests', 'cashflows'],
  site: ['site_reports', 'qc_inspections', 'work_orders', 'site_docs', 'issues', 'safety_records', 'tasks', 'inst_acceptance', 'handover_docs', 'stock_moves', 'contractor_evals'],
  info: ['houses', 'files', 'boqs', 'house_categories', 'doc_register', 'nps'],
  approval: ['change_requests'],
  customer: ['customer_updates'],
}
const CAT_OF = Object.fromEntries(Object.entries(CATS).flatMap(([c, ts]) => ts.map((t) => [t, c])))
// ชื่อช่องที่คนอ่านเข้าใจ (ช่องที่ไม่อยู่ในนี้ไม่แสดงในสรุป — กันข้อมูลเทคนิครก)
export const FIELD_LABEL = {
  name: 'ชื่อ', status: 'สถานะ', amount: 'ยอดเงิน', detail: 'รายละเอียด', no: 'เลขที่/งวดที่', due: 'กำหนด', paid: 'จ่าย/เก็บแล้ว',
  value: 'มูลค่าบ้าน', pct: 'ความคืบหน้า %', collected: 'เก็บเงินแล้ว', remain: 'คงเหลือ', contractor_value: 'มูลค่าจ่ายช่าง',
  house_customer: 'ตัวบ้าน (ลูกค้า)', house_contractor: 'ตัวบ้าน (ช่าง)', carport_customer: 'โรงจอดรถ (ลูกค้า)', carport_contractor: 'โรงจอดรถ (ช่าง)',
  road_customer: 'ถนน/รั้ว (ลูกค้า)', road_contractor: 'ถนน/รั้ว (ช่าง)', service_fee: 'ค่าบริการควบคุมงาน', deliver_date: 'กำหนดส่งมอบ', start_date: 'วันเริ่ม',
  manager: 'ผู้จัดการโครงการ', contractor: 'ช่าง', contract_total: 'ยอดจ้าง', unit_price: 'ราคาต่อหน่วย', qty: 'ปริมาณ', role: 'งานที่รับผิดชอบ',
  title: 'หัวข้อ', item: 'รายการ', party: 'คู่สัญญา', result: 'ผล', phase: 'ขั้นตอน', vendor: 'ร้าน', progress: 'ความคืบหน้า %', priority: 'ความเร่งด่วน',
  executor: 'ผู้รับงาน', note: 'หมายเหตุ', text: 'ข้อความ', decided_by: 'ผู้ตัดสิน', reason: 'เหตุผล',
}
const MONEY_FIELDS = new Set(['amount', 'paid', 'value', 'collected', 'remain', 'contractor_value', 'house_customer', 'house_contractor', 'carport_customer', 'carport_contractor', 'road_customer', 'road_contractor', 'service_fee', 'contract_total', 'unit_price', 'net'])
const NOISE_FIELDS = new Set(['id', 'ts', 'created', 'updated', 'created_ts', 'seen_ts', 'body', 'params', 'op', 'house_code', 'code', 'requested_by_id', 'sent_to'])

const money = (n) => (Number(n) || 0).toLocaleString('en-US')
const jparse = (s) => { try { return s ? JSON.parse(s) : null } catch { return null } }
const short = (v, n = 80) => { const s = String(v ?? ''); return s.length > n ? s.slice(0, n) + '…' : s }

// ---- เรื่องที่ต้องรออนุมัติ (แอดมินเปิด/ปิดได้) ----
export const GATES = {
  house_value: { label: 'แก้มูลค่าบ้าน (ยอดขายลูกค้า / ยอดจ่ายช่าง / ค่าบริการ)', group: 'เพิ่ม-ลดงาน', def: true },
  inst_add: { label: 'เพิ่มงวดงาน (เพิ่มงาน)', group: 'เพิ่ม-ลดงาน', def: true },
  inst_edit: { label: 'แก้ยอดเงินของงวดงาน', group: 'เพิ่ม-ลดงาน', def: true },
  inst_del: { label: 'ลบงวดงาน (ลดงาน)', group: 'เพิ่ม-ลดงาน', def: true },
  contract: { label: 'เพิ่ม/แก้สัญญาของบ้าน', group: 'เพิ่ม-ลดงาน', def: true },
  contractor: { label: 'จ้างช่างเข้าบ้าน / แก้ยอดจ้าง / เอาช่างออก', group: 'เพิ่ม-ลดงาน', def: true },
  inst_pay: { label: 'บันทึกจ่ายเงินช่างตามงวด', group: 'บัญชี/การเงิน', def: true },
  inst_collect: { label: 'บันทึกเก็บเงินลูกค้าตามงวด', group: 'บัญชี/การเงิน', def: false },
  contractor_adv: { label: 'ออกค่าของให้ผู้รับเหมา / หักค่าของจากงวด', group: 'บัญชี/การเงิน', def: true },
}

export function createCenter(d) {
  const { db } = d
  db.exec(`CREATE TABLE IF NOT EXISTS change_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, kind TEXT, op TEXT, house_code TEXT, title TEXT, lines TEXT,
    params TEXT, body TEXT, requested_by TEXT, requested_by_id INTEGER,
    status TEXT, decided_by TEXT, decided_at TEXT, reason TEXT, result TEXT
  )`)
  db.exec('CREATE INDEX IF NOT EXISTS idx_cr_status ON change_requests(status)')
  db.exec('CREATE TABLE IF NOT EXISTS feed_seen (user_id INTEGER PRIMARY KEY, last_id INTEGER)')
  db.exec(`CREATE TABLE IF NOT EXISTS customer_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, house_code TEXT, text TEXT, by TEXT, sent_to TEXT, status TEXT, kind TEXT
  )`)

  const canApprove = (u) => !!u && (u.role === 'admin' || d.isManager(u))
  // คนดูแลลูกค้า: แอดมิน · ผู้จัดการ · ตำแหน่งงานขาย/ดูแลลูกค้า/การตลาด/ประสานงาน
  const canCustomer = (u) => !!u && (canApprove(u) || /ลูกค้า|ขาย|การตลาด|ประสานงาน|CRM|แอดมิน|ธุรการ/i.test(String(u.position || '')))
  const gatesOn = () => { const o = jparse(d.getSetting('approval_gates', '')) || {}; return Object.fromEntries(Object.entries(GATES).map(([k, g]) => [k, o[k] != null ? !!o[k] : g.def])) }
  const handlers = {}
  const houseName = (code) => (code ? db.prepare('SELECT name FROM houses WHERE code=?').get(code)?.name || code : '')

  function approvers() {
    return db.prepare("SELECT id,name,role,position,line_uid FROM users WHERE COALESCE(status,'ใช้งาน')='ใช้งาน'").all().filter((u) => canApprove({ ...u, position: d.effectivePosition(u) }))
  }
  function pushApprovers(text, exceptName) {
    for (const u of approvers()) if (u.line_uid && u.name !== exceptName) d.linePush(u.line_uid, text).catch?.(() => {})
  }
  function pushUser(name, text) { const uid = d.lineUidOfName(name); if (uid) d.linePush(uid, text).catch?.(() => {}) }

  /**
   * ห่อ handler ของ API ที่ต้องรออนุมัติ
   * check(req) → null = ไม่กระทบเงิน ทำต่อได้เลย · { error } = ผิด · { house_code, title, lines, body?, rest? }
   *   body = ส่วนที่ต้องรออนุมัติ (ไม่ใส่ = ทั้งคำขอ) · rest = ส่วนที่บันทึกได้เลย (เช่น แก้ชื่อบ้านพร้อมแก้ยอด → ชื่อบันทึกเลย ยอดรอ)
   */
  function gated(kind, op, check, handler) {
    handlers[op] = handler
    return (req, res, next) => {
      if (req._approved || !gatesOn()[kind] || canApprove(req.user)) return handler(req, res, next)
      let s
      try { s = check(req) } catch (e) { s = { error: e.message } }
      if (!s) return handler(req, res, next)
      if (s.error) return res.status(s.code || 400).json({ error: s.error })
      const info = db.prepare('INSERT INTO change_requests (ts,kind,op,house_code,title,lines,params,body,requested_by,requested_by_id,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(d.nowTS(), kind, op, s.house_code || '', s.title, JSON.stringify(s.lines || []), JSON.stringify(req.params || {}), JSON.stringify(s.body ?? req.body ?? {}), req.user?.name || '-', Number(req.user?.id) || null, 'รออนุมัติ')
      const id = info.lastInsertRowid
      d.audit(req, 'ส่งขออนุมัติ', `#${id} ${s.title}`)
      pushApprovers(`📝 คำขอรออนุมัติ #${id}\n${s.title}${s.house_code ? `\nบ้าน: ${houseName(s.house_code)}` : ''}\n${(s.lines || []).slice(0, 6).map((l) => '• ' + l).join('\n')}\nโดย ${req.user?.name || '-'}\n— เปิด ERP → ความเคลื่อนไหวบ้าน → รออนุมัติ`, req.user?.name)
      const msg = `ส่งขออนุมัติแล้ว (#${id}) — รอแอดมิน/ผู้จัดการอนุมัติก่อนจึงจะมีผลจริง`
      res.setHeader('X-PPSD-Pending', encodeURIComponent(s.rest ? 'บันทึกข้อมูลทั่วไปแล้ว · ส่วนยอดเงิน' + msg : msg))
      if (s.rest) { req.body = s.rest; return handler(req, res, next) }
      return res.status(202).json({ pending: true, request_id: id, message: msg })
    }
  }

  // ทำรายการที่อนุมัติแล้วจริง: เรียก handler เดิมในนามผู้ขอ
  function apply(cr) {
    const handler = handlers[cr.op]
    if (!handler) return Promise.resolve({ code: 500, body: { error: 'ระบบไม่รู้จักรายการนี้แล้ว' } })
    const u = db.prepare('SELECT id,name,username,role,position,status FROM users WHERE id=?').get(cr.requested_by_id) || { id: 0, name: cr.requested_by, role: 'site' }
    const user = { id: u.id, name: u.name, username: u.username, role: u.role, position: d.effectivePosition(u), deny_mods: [] }
    return new Promise((resolve) => {
      let code = 200, done = false
      const finish = (body) => { if (!done) { done = true; resolve({ code, body }) } }
      const fakeRes = {
        status(c) { code = c; return this }, json: finish, send: finish, end: () => finish(null),
        setHeader() { return this }, set() { return this }, type() { return this }, on() { return this },
      }
      const fakeReq = { params: jparse(cr.params) || {}, body: jparse(cr.body) || {}, query: {}, headers: {}, user, _approved: true, path: '/approved/' + cr.op, method: 'POST', ip: '' }
      try {
        const r = handler(fakeReq, fakeRes, (e) => finish({ error: e?.message || 'ทำรายการไม่สำเร็จ' }))
        if (r && typeof r.then === 'function') r.then(() => finish(null), (e) => { code = 500; finish({ error: e.message }) })
        else setImmediate(() => finish(null))
      } catch (e) { code = 500; finish({ error: e.message }) }
    })
  }

  // ---- สรุปประวัติ 1 แถว → ข้อความที่คนอ่านเข้าใจ ----
  function describe(r) {
    const before = jparse(r.before) || {}, after = jparse(r.after) || {}
    const row = r.action === 'delete' ? before : after
    const label = TABLE_LABEL[r.table_name] || r.table_name
    const ident = [row.no && r.table_name === 'installments' ? 'งวด ' + row.no : row.no, row.detail, row.name, row.title, row.item].filter(Boolean).map((x) => short(x, 50))[0] || ''
    const lines = []
    let flag = false // เพิ่ม-ลดงาน / เงินเปลี่ยน
    if (r.action === 'update') {
      for (const k of Object.keys(after)) {
        if (NOISE_FIELDS.has(k) || !FIELD_LABEL[k]) continue
        const a = before[k], b = after[k]
        if (a === b || (a == null && b === '') || (b == null && a === '')) continue
        if (typeof b === 'string' && b.startsWith('[ไฟล์')) continue
        if (MONEY_FIELDS.has(k)) {
          const diff = (Number(b) || 0) - (Number(a) || 0)
          lines.push(`${FIELD_LABEL[k]}: ${money(a)} → ${money(b)} (${diff >= 0 ? '+' : ''}${money(diff)})`)
          if (['amount', 'value', 'house_customer', 'house_contractor', 'carport_customer', 'carport_contractor', 'road_customer', 'road_contractor', 'contract_total', 'service_fee'].includes(k)) flag = true
        } else lines.push(`${FIELD_LABEL[k]}: ${short(a, 40) || '-'} → ${short(b, 40) || '-'}`)
      }
      if (!lines.length) return null // เปลี่ยนแค่ช่องเทคนิค ไม่ต้องโชว์
    } else {
      if (row.amount != null && Number(row.amount)) lines.push(`ยอดเงิน ${money(row.amount)} บาท`)
      if (row.status) lines.push(`สถานะ: ${short(row.status, 40)}`)
      if (['installments', 'house_contracts', 'contractors'].includes(r.table_name)) flag = true
    }
    if (r.table_name === 'site_docs' && String(row.kind || '').toLowerCase() === 'vo') flag = true
    let verb = r.action === 'insert' ? 'เพิ่ม' : r.action === 'delete' ? 'ลบ' : 'แก้ไข'
    if (r.table_name === 'change_requests') {
      // ขั้นภายใน (จองคิว "กำลังทำ" / ทำไม่สำเร็จแล้วคืนคิว) ไม่ต้องโชว์
      if (r.action === 'update' && (before.status === after.status || after.status === 'กำลังทำ' || (before.status === 'กำลังทำ' && after.status === 'รออนุมัติ'))) return null
      verb = r.action === 'insert' ? 'ส่งขออนุมัติ' : row.status === 'อนุมัติ' ? '✅ อนุมัติ' : row.status === 'ตีกลับ' ? '↩️ ตีกลับ' : 'อัปเดตคำขอ'
      return { text: `${verb}: ${row.title || ''}`, lines: [...(jparse(row.lines) || []).slice(0, 6), ...(row.reason ? ['เหตุผล: ' + row.reason] : []), ...(row.decided_by && r.action === 'update' ? ['โดย ' + row.decided_by] : [])], flag: true, approval: { id: row.id, status: row.status } }
    }
    if (r.table_name === 'customer_updates') return { text: `📨 ส่งอัปเดตให้ลูกค้าทาง LINE`, lines: [short(row.text, 300)], flag: false }
    return { text: `${verb}${label}${ident ? ' · ' + ident : ''}`, lines: lines.slice(0, 8), flag }
  }

  const FEED_TABLES = Object.values(CATS).flat()
  const houseExpr = `CASE WHEN table_name='houses' THEN COALESCE(json_extract(after,'$.code'), json_extract(before,'$.code')) ELSE COALESCE(json_extract(after,'$.house_code'), json_extract(before,'$.house_code')) END`

  function feed({ house = '', cat = '', beforeId = 0, limit = 40, flagOnly = false }) {
    const tables = cat && CATS[cat] ? CATS[cat] : FEED_TABLES
    const ph = tables.map(() => '?').join(',')
    const out = []
    let cursor = beforeId > 0 ? beforeId : Number.MAX_SAFE_INTEGER, scanned = 0
    const byKey = new Map()
    while (out.length < limit && scanned < 20000) {
      const rows = db.prepare(`SELECT id, ts, user, table_name, row_key, action, before, after, ${houseExpr} AS hc FROM change_history
        WHERE id < ? AND table_name IN (${ph}) ${house ? `AND ${houseExpr} = ?` : ''} ORDER BY id DESC LIMIT 500`).all(cursor, ...tables, ...(house ? [house] : []))
      if (!rows.length) break
      scanned += rows.length
      for (const r of rows) {
        cursor = r.id
        if (!r.hc) continue
        const dsc = describe(r)
        if (!dsc) continue
        if (flagOnly && !dsc.flag) continue
        const key = `${r.ts}|${r.user}|${r.hc}`
        const ex = byKey.get(key)
        if (ex) { // ทำพร้อมกัน → รวมเป็นเรื่องเดียว
          ex.parts.unshift({ text: dsc.text, lines: dsc.lines }); ex.flag = ex.flag || dsc.flag; ex.min_id = r.id
          if (dsc.approval) ex.approval = dsc.approval
          if (!ex.cats.includes(CAT_OF[r.table_name])) ex.cats.push(CAT_OF[r.table_name])
          continue
        }
        if (out.length >= limit) break
        const ev = { id: r.id, min_id: r.id, ts: r.ts, user: r.user, house_code: r.hc, house_name: houseName(r.hc), cats: [CAT_OF[r.table_name] || 'info'], flag: dsc.flag, approval: dsc.approval || null, parts: [{ text: dsc.text, lines: dsc.lines }] }
        byKey.set(key, ev); out.push(ev)
      }
      if (rows.length < 500) break
    }
    return { items: out, next: out.length >= limit ? out[out.length - 1].min_id : 0 }
  }

  function maxFeedId() { return db.prepare('SELECT COALESCE(MAX(id),0) m FROM change_history').get().m }
  function unreadFor(user) {
    let seen = db.prepare('SELECT last_id FROM feed_seen WHERE user_id=?').get(user.id)?.last_id
    if (seen == null) { seen = maxFeedId(); db.prepare('INSERT OR REPLACE INTO feed_seen (user_id,last_id) VALUES (?,?)').run(user.id, seen) }
    const ph = FEED_TABLES.map(() => '?').join(',')
    const rows = db.prepare(`SELECT ts, user, table_name, action, before, after, ${houseExpr} AS hc FROM change_history WHERE id > ? AND table_name IN (${ph}) AND user <> ? AND user NOT LIKE ? ORDER BY id DESC LIMIT 2000`).all(seen, ...FEED_TABLES, user.name, '%(อนุมัติโดย ' + user.name + ')')
    const keys = new Set()
    for (const r of rows) if (r.hc && describe(r)) keys.add(`${r.ts}|${r.user}|${r.hc}`)
    return { count: keys.size, seen }
  }

  function customersOfHouse(code) {
    const h = db.prepare('SELECT * FROM houses WHERE code=?').get(code)
    if (!h) return { house: null, list: [] }
    const list = db.prepare('SELECT id, name, line_uid FROM customers WHERE line_uid IS NOT NULL AND (id=? OR (name=? AND COALESCE(name,\'\')<>\'\'))').all(h.customer_id ?? -1, h.customer || '')
    return { house: h, list }
  }

  const rowOut = (r) => ({ ...r, lines: jparse(r.lines) || [], house_name: houseName(r.house_code), body: undefined, params: undefined })

  function register(api) {
    api.get('/center/feed', (req, res) => {
      const q = req.query || {}
      res.json(feed({ house: String(q.house || ''), cat: String(q.cat || ''), beforeId: Number(q.before) || 0, limit: Math.min(100, Number(q.limit) || 40), flagOnly: q.flag === '1' }))
    })
    api.get('/center/unread', (req, res) => {
      const u = unreadFor(req.user)
      res.json({ unread: u.count, last_seen: u.seen, pending: canApprove(req.user) ? db.prepare("SELECT COUNT(*) c FROM change_requests WHERE status='รออนุมัติ'").get().c : db.prepare("SELECT COUNT(*) c FROM change_requests WHERE status='รออนุมัติ' AND requested_by_id=?").get(req.user.id).c, canApprove: canApprove(req.user), canCustomer: canCustomer(req.user) })
    })
    api.post('/center/seen', (req, res) => {
      const id = Number(req.body?.last_id) || maxFeedId()
      db.prepare('INSERT INTO feed_seen (user_id,last_id) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET last_id=MAX(last_id, excluded.last_id)').run(req.user.id, id)
      res.json({ ok: true })
    })
    // ---- คิวอนุมัติ ----
    api.get('/approvals', (req, res) => {
      const st = String(req.query.status || 'รออนุมัติ')
      const mine = !canApprove(req.user)
      const rows = db.prepare(`SELECT * FROM change_requests WHERE ${st === 'all' ? '1=1' : 'status=?'} ${mine ? 'AND requested_by_id=?' : ''} ORDER BY id DESC LIMIT 200`).all(...(st === 'all' ? [] : [st]), ...(mine ? [req.user.id] : []))
      res.json(rows.map(rowOut))
    })
    api.post('/approvals/:id/approve', async (req, res) => {
      if (!canApprove(req.user)) return res.status(403).json({ error: 'อนุมัติได้เฉพาะแอดมิน/ผู้จัดการ' })
      const cr = db.prepare('SELECT * FROM change_requests WHERE id=?').get(req.params.id)
      if (!cr) return res.status(404).json({ error: 'ไม่พบคำขอ' })
      if (cr.status !== 'รออนุมัติ') return res.status(409).json({ error: `คำขอนี้${cr.status}ไปแล้ว` })
      // กันกดซ้ำพร้อมกัน: จองสถานะก่อนทำ
      if (!db.prepare("UPDATE change_requests SET status='กำลังทำ' WHERE id=? AND status='รออนุมัติ'").run(cr.id).changes) return res.status(409).json({ error: 'คำขอนี้กำลังถูกดำเนินการ' })
      d.setHistoryUser(`${cr.requested_by} (อนุมัติโดย ${req.user.name})`)
      const r = await apply(cr)
      d.setHistoryUser(req.user.name)
      if (r.code >= 400) {
        db.prepare("UPDATE change_requests SET status='รออนุมัติ', result=? WHERE id=?").run('ทำไม่สำเร็จ: ' + (r.body?.error || r.code), cr.id)
        return res.status(r.code).json({ error: 'ทำรายการไม่สำเร็จ: ' + (r.body?.error || 'ข้อมูลเปลี่ยนไปแล้ว') + ' — คำขอยังค้างอยู่ ตีกลับได้' })
      }
      db.prepare("UPDATE change_requests SET status='อนุมัติ', decided_by=?, decided_at=?, reason=?, result='ทำรายการแล้ว' WHERE id=?").run(req.user.name, d.nowTS(), String(req.body?.note || '').slice(0, 300), cr.id)
      d.audit(req, 'อนุมัติคำขอ', `#${cr.id} ${cr.title}`)
      pushUser(cr.requested_by, `✅ คำขอ #${cr.id} ได้รับอนุมัติแล้วโดย ${req.user.name}\n${cr.title}`)
      res.json({ ok: true })
    })
    api.post('/approvals/:id/reject', (req, res) => {
      const cr = db.prepare('SELECT * FROM change_requests WHERE id=?').get(req.params.id)
      if (!cr) return res.status(404).json({ error: 'ไม่พบคำขอ' })
      const own = cr.requested_by_id === req.user.id
      if (!canApprove(req.user) && !own) return res.status(403).json({ error: 'ตีกลับได้เฉพาะแอดมิน/ผู้จัดการ' })
      if (cr.status !== 'รออนุมัติ') return res.status(409).json({ error: `คำขอนี้${cr.status}ไปแล้ว` })
      const reason = String(req.body?.note || '').trim().slice(0, 300)
      if (!own && !reason) return res.status(400).json({ error: 'กรุณาบอกเหตุผลที่ตีกลับ' })
      db.prepare('UPDATE change_requests SET status=?, decided_by=?, decided_at=?, reason=? WHERE id=?').run(own && !canApprove(req.user) ? 'ยกเลิก' : 'ตีกลับ', req.user.name, d.nowTS(), reason || 'ผู้ขอยกเลิกเอง', cr.id)
      d.audit(req, own ? 'ยกเลิกคำขอ' : 'ตีกลับคำขอ', `#${cr.id} ${cr.title}${reason ? ' · ' + reason : ''}`)
      if (!own) pushUser(cr.requested_by, `↩️ คำขอ #${cr.id} ถูกตีกลับโดย ${req.user.name}\n${cr.title}\nเหตุผล: ${reason}`)
      res.json({ ok: true })
    })
    api.get('/approvals/gates', (_req, res) => { const on = gatesOn(); res.json(Object.entries(GATES).map(([k, g]) => ({ key: k, label: g.label, group: g.group, on: on[k] }))) })
    api.put('/approvals/gates', (req, res) => {
      if (req.user?.role !== 'admin') return res.status(403).json({ error: 'ตั้งค่าได้เฉพาะผู้ดูแลระบบ' })
      const cur = gatesOn()
      for (const k of Object.keys(GATES)) if (req.body?.[k] != null) cur[k] = !!req.body[k]
      d.setSetting('approval_gates', JSON.stringify(cur))
      d.audit(req, 'ตั้งค่าเรื่องที่ต้องรออนุมัติ', Object.entries(cur).map(([k, v]) => `${GATES[k].label}: ${v ? 'ต้องอนุมัติ' : 'ไม่ต้อง'}`).join(' · '))
      res.json({ ok: true })
    })
    // ---- ส่งอัปเดตให้ลูกค้า (คัดเองทุกครั้ง) ----
    api.get('/center/customer/:code', (req, res) => {
      const { house, list } = customersOfHouse(req.params.code)
      if (!house) return res.status(404).json({ error: 'ไม่พบบ้าน' })
      const sent = db.prepare('SELECT id, ts, text, by, status, kind FROM customer_updates WHERE house_code=? ORDER BY id DESC LIMIT 20').all(house.code)
      res.json({ house: { code: house.code, name: house.name, customer: house.customer, pct: house.pct }, customers: list.map((c) => ({ id: c.id, name: c.name })), sent, canSend: canCustomer(req.user), hasLine: !!d.getSetting('line_token', '') })
    })
    api.post('/center/customer/:code/send', async (req, res) => {
      if (!canCustomer(req.user)) return res.status(403).json({ error: 'ส่งอัปเดตลูกค้าได้เฉพาะแอดมิน/ผู้จัดการ/ฝ่ายดูแลลูกค้า' })
      const text = String(req.body?.text || '').trim()
      if (!text) return res.status(400).json({ error: 'กรุณาพิมพ์ข้อความที่จะส่ง' })
      if (text.length > 4500) return res.status(400).json({ error: 'ข้อความยาวเกินไป (ไม่เกิน 4,500 ตัวอักษร)' })
      const { house, list } = customersOfHouse(req.params.code)
      if (!house) return res.status(404).json({ error: 'ไม่พบบ้าน' })
      if (!list.length) return res.status(400).json({ error: 'ลูกค้าบ้านนี้ยังไม่ได้ผูก LINE — ให้ลูกค้าผูก LINE ก่อน (หน้า ลูกค้า/CRM → ออกรหัสผูก LINE)' })
      if (!d.getSetting('line_token', '')) return res.status(400).json({ error: 'ยังไม่ได้ตั้งค่า LINE (หน้า ผู้ใช้งาน → แจ้งเตือน LINE)' })
      const kind = req.body?.kind === 'notice' ? 'notice' : 'update'
      const okNames = []
      for (const c of list) {
        const ok = await d.linePush(c.line_uid, text)
        if (ok) { okNames.push(c.name); try { db.prepare('INSERT INTO customer_contacts (customer_id,date,channel,note,by,done) VALUES (?,?,?,?,?,1)').run(c.id, d.todayTH(), 'LINE', 'ส่งอัปเดต: ' + short(text, 200), req.user.name) } catch { /* ignore */ } }
      }
      db.prepare('INSERT INTO customer_updates (ts,house_code,text,by,sent_to,status,kind) VALUES (?,?,?,?,?,?,?)').run(d.nowTS(), house.code, text, req.user.name, okNames.join(', '), okNames.length ? 'ส่งแล้ว' : 'ส่งไม่สำเร็จ', kind)
      d.audit(req, 'ส่งอัปเดตลูกค้าทาง LINE', `${house.code} → ${okNames.join(', ') || 'ไม่สำเร็จ'}`)
      if (!okNames.length) return res.status(502).json({ error: 'ส่ง LINE ไม่สำเร็จ — ตรวจการตั้งค่า LINE ที่หน้า ผู้ใช้งาน → แจ้งเตือน LINE' })
      res.json({ ok: true, sent_to: okNames })
    })
  }

  // แจ้งเตือนกระดิ่ง (รวมเข้า /notifications)
  function notificationsFor(user) {
    const out = []
    try {
      if (canApprove(user)) {
        const n = db.prepare("SELECT COUNT(*) c FROM change_requests WHERE status='รออนุมัติ'").get().c
        if (n) out.push({ kind: 'approval', icon: 'warn', title: `มีคำขอรออนุมัติ ${n} รายการ`, sub: 'เพิ่ม-ลดงาน / แก้ยอดเงิน — เปิดหน้าความเคลื่อนไหวบ้าน → รออนุมัติ', page: 'center' })
      }
      for (const r of db.prepare("SELECT * FROM change_requests WHERE requested_by_id=? AND status='ตีกลับ' AND decided_at >= ? ORDER BY id DESC LIMIT 5").all(user.id, new Date(Date.now() - 3 * 86400000 + 7 * 3600000).toISOString().slice(0, 10)))
        out.push({ kind: 'approval-rejected', icon: 'danger', title: `คำขอ #${r.id} ถูกตีกลับ`, sub: `${r.title} · ${r.reason || ''}`, page: 'center' })
    } catch { /* ignore */ }
    return out
  }

  return { gated, register, notificationsFor, canApprove }
}
