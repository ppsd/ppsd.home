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
  change_requests: 'คำขออนุมัติ', customer_updates: 'อัปเดตลูกค้า', contractor_reports: 'รายงานจากช่าง (LINE)', cashflows: 'กระแสเงินสด', nps: 'ความพึงพอใจลูกค้า',
}
const CATS = {
  money: ['installments', 'house_contracts', 'house_money_log', 'contractors', 'contractor_advances', 'payments', 'expenses', 'petty_expenses', 'purchase_requests', 'purchase_orders', 'goods_receipts', 'sales_docs', 'fuel_requests', 'cashflows'],
  site: ['site_reports', 'qc_inspections', 'work_orders', 'site_docs', 'issues', 'safety_records', 'tasks', 'inst_acceptance', 'handover_docs', 'stock_moves', 'contractor_evals', 'contractor_reports'],
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
  // ซ่อนเรื่องจากหน้าความเคลื่อนไหว (เช่น ข้อมูลทดสอบ) — ซ่อนอย่างเดียว ประวัติจริงใน change_history ยังอยู่ครบ · key = ts|user|บ้าน (กลุ่มเดียวกับที่หน้าจอรวมเป็นเรื่องเดียว)
  db.exec('CREATE TABLE IF NOT EXISTS feed_hidden (key TEXT PRIMARY KEY, by TEXT, at TEXT)')
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

  // ---- คำขอจากช่องทางอื่น (เช่น บอท LINE ช่าง) — ไม่ผ่าน API ของหน้าเว็บ ----
  const decidedHooks = {}
  /** ลงทะเบียนรายการที่ทำเมื่ออนุมัติ: handler(req,res) แบบเดียวกับ API · onDecided(cr, 'อนุมัติ'|'ตีกลับ'|'ยกเลิก', reason) */
  function registerOp(op, handler, onDecided) { handlers[op] = handler; if (onDecided) decidedHooks[op] = onDecided }
  /** ส่งคำขอเข้าคิวรออนุมัติ → คืนเลขคำขอ */
  function submit({ kind, op, house_code = '', title, lines = [], params = {}, body = {}, by, by_id = null }) {
    const info = db.prepare('INSERT INTO change_requests (ts,kind,op,house_code,title,lines,params,body,requested_by,requested_by_id,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(d.nowTS(), kind, op, house_code, title, JSON.stringify(lines), JSON.stringify(params), JSON.stringify(body), by, by_id, 'รออนุมัติ')
    const id = info.lastInsertRowid
    const cr = db.prepare('SELECT * FROM change_requests WHERE id=?').get(id)
    if (kind === 'contractor_line' && conApprovers().length) pushConCard(cr) // เรื่องจากช่าง → การ์ดให้ผู้ตรวจที่ตั้งไว้กดอนุมัติใน LINE
    else pushApprovers(`📝 คำขอรออนุมัติ #${id}\n${title}${house_code ? `\nบ้าน: ${houseName(house_code)}` : ''}\n${lines.slice(0, 6).map((l) => '• ' + l).join('\n')}\nโดย ${by}\n— เปิด ERP → ความเคลื่อนไหวบ้าน → รออนุมัติ`, by)
    return id
  }
  const fireDecided = (cr, status, reason) => { try { decidedHooks[cr.op]?.(cr, status, reason) } catch (e) { console.error('decided hook:', e.message) } }

  // ---- ผู้ตรวจเรื่องจากช่าง (settings.con_approvers = [id ผู้ใช้]) — อนุมัติ/ตีกลับเรื่องจากช่างได้ทั้งเว็บและการ์ด LINE ----
  const conApproverIds = () => { const v = jparse(d.getSetting('con_approvers', '')); return Array.isArray(v) ? v.map(Number).filter(Boolean) : [] }
  const conApprovers = () => conApproverIds().map((id) => db.prepare("SELECT id, name, line_uid FROM users WHERE id=? AND COALESCE(status,'ใช้งาน')='ใช้งาน'").get(id)).filter(Boolean)
  const isConApprover = (u) => !!u && conApproverIds().includes(Number(u.id))
  const canDecide = (u, cr) => canApprove(u) || (cr?.kind === 'contractor_line' && isConApprover(u))
  function conCard(cr) {
    const files = ((jparse(cr.body) || {}).files || []).length
    const row = (label, value) => ({ type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
      { type: 'text', text: label, size: 'sm', color: '#94A0A8', flex: 2 }, { type: 'text', text: String(value || '-'), size: 'sm', color: '#1C2730', flex: 5, wrap: true }] })
    return {
      type: 'flex', altText: `เรื่องจากช่างรอตรวจ #${cr.id}: ${short(cr.title, 60)}`,
      contents: { type: 'bubble', size: 'mega',
        header: { type: 'box', layout: 'vertical', backgroundColor: '#30506A', paddingAll: '14px', contents: [
          { type: 'text', text: `เรื่องจากช่าง #${cr.id}`, color: '#FFFFFF', weight: 'bold', size: 'md' },
          { type: 'text', text: 'รอตรวจ / อนุมัติ', color: '#D8E3EC', size: 'xs' }] },
        body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
          { type: 'text', text: cr.title, weight: 'bold', size: 'md', color: '#1C2730', wrap: true },
          { type: 'separator', margin: 'sm' },
          row('บ้าน', houseName(cr.house_code)), row('ส่งโดย', cr.requested_by),
          ...(jparse(cr.lines) || []).slice(0, 5).map((l) => ({ type: 'text', text: '• ' + short(l, 120), size: 'sm', color: '#1C2730', wrap: true })),
          ...(files ? [{ type: 'text', text: `📷 รูป ${files} รูป — ดูใน ERP → ความเคลื่อนไหวบ้าน → รออนุมัติ`, size: 'xs', color: '#5C6770', wrap: true }] : []),
          { type: 'separator', margin: 'md' },
          { type: 'text', text: 'อนุมัติไหมคะ?', weight: 'bold', size: 'md', color: '#30506A', margin: 'md', align: 'center' }] },
        footer: { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
          { type: 'button', style: 'primary', color: '#2E7D55', height: 'sm', action: { type: 'postback', label: 'อนุมัติ', data: `cr:${cr.id}:approve`, displayText: `อนุมัติ #${cr.id}` } },
          { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: 'ตีกลับ', data: `cr:${cr.id}:reject`, displayText: `ตีกลับ #${cr.id}` } }] } },
    }
  }
  function pushConCard(cr) { for (const u of conApprovers()) if (u.line_uid) d.linePush(u.line_uid, conCard(cr)).catch?.(() => {}) }

  /** อนุมัติคำขอ (ใช้ร่วมกัน เว็บ + การ์ด LINE) → { ok } หรือ { error, code } */
  async function approveReq(id, user, note = '', auditReq = null) {
    const cr = db.prepare('SELECT * FROM change_requests WHERE id=?').get(id)
    if (!cr) return { error: 'ไม่พบคำขอ', code: 404 }
    if (!canDecide(user, cr)) return { error: 'อนุมัติได้เฉพาะแอดมิน/ผู้จัดการ (เรื่องจากช่าง: ผู้ตรวจที่ตั้งไว้)', code: 403 }
    if (cr.status !== 'รออนุมัติ') return { error: `คำขอนี้${cr.status}ไปแล้ว${cr.decided_by ? ' (โดย ' + cr.decided_by + ')' : ''}`, code: 409 }
    // กันกดซ้ำพร้อมกัน: จองสถานะก่อนทำ
    if (!db.prepare("UPDATE change_requests SET status='กำลังทำ' WHERE id=? AND status='รออนุมัติ'").run(cr.id).changes) return { error: 'คำขอนี้กำลังถูกดำเนินการ', code: 409 }
    d.setHistoryUser(`${cr.requested_by} (อนุมัติโดย ${user.name})`)
    const r = await apply(cr)
    d.setHistoryUser(user.name)
    if (r.code >= 400) {
      db.prepare("UPDATE change_requests SET status='รออนุมัติ', result=? WHERE id=?").run('ทำไม่สำเร็จ: ' + (r.body?.error || r.code), cr.id)
      return { error: 'ทำรายการไม่สำเร็จ: ' + (r.body?.error || 'ข้อมูลเปลี่ยนไปแล้ว') + ' — คำขอยังค้างอยู่ ตีกลับได้', code: r.code }
    }
    db.prepare("UPDATE change_requests SET status='อนุมัติ', decided_by=?, decided_at=?, reason=?, result='ทำรายการแล้ว' WHERE id=?").run(user.name, d.nowTS(), String(note || '').slice(0, 300), cr.id)
    d.audit(auditReq || { user }, 'อนุมัติคำขอ', `#${cr.id} ${cr.title}`)
    pushUser(cr.requested_by, `✅ คำขอ #${cr.id} ได้รับอนุมัติแล้วโดย ${user.name}\n${cr.title}`)
    fireDecided({ ...cr, decided_by: user.name }, 'อนุมัติ', String(note || ''))
    if (cr.kind === 'contractor_line') for (const a of conApprovers()) if (a.line_uid && a.id !== user.id) d.linePush(a.line_uid, `ℹ️ เรื่องจากช่าง #${cr.id} อนุมัติแล้วโดย ${user.name} — ไม่ต้องกดซ้ำค่ะ`).catch?.(() => {})
    return { ok: true, cr }
  }
  /** ตีกลับ (ผู้อนุมัติ ต้องมีเหตุผล) / ยกเลิก (ผู้ขอเอง) */
  function rejectReq(id, user, note = '', auditReq = null) {
    const cr = db.prepare('SELECT * FROM change_requests WHERE id=?').get(id)
    if (!cr) return { error: 'ไม่พบคำขอ', code: 404 }
    const own = cr.requested_by_id && cr.requested_by_id === user.id
    const decider = canDecide(user, cr)
    if (!decider && !own) return { error: 'ตีกลับได้เฉพาะแอดมิน/ผู้จัดการ (เรื่องจากช่าง: ผู้ตรวจที่ตั้งไว้)', code: 403 }
    if (cr.status !== 'รออนุมัติ') return { error: `คำขอนี้${cr.status}ไปแล้ว${cr.decided_by ? ' (โดย ' + cr.decided_by + ')' : ''}`, code: 409 }
    const reason = String(note || '').trim().slice(0, 300)
    if (!own && !reason) return { error: 'กรุณาบอกเหตุผลที่ตีกลับ', code: 400 }
    const st = own && !decider ? 'ยกเลิก' : 'ตีกลับ'
    db.prepare('UPDATE change_requests SET status=?, decided_by=?, decided_at=?, reason=? WHERE id=?').run(st, user.name, d.nowTS(), reason || 'ผู้ขอยกเลิกเอง', cr.id)
    d.audit(auditReq || { user }, st === 'ยกเลิก' ? 'ยกเลิกคำขอ' : 'ตีกลับคำขอ', `#${cr.id} ${cr.title}${reason ? ' · ' + reason : ''}`)
    fireDecided({ ...cr, decided_by: user.name }, st, reason)
    if (st === 'ตีกลับ') pushUser(cr.requested_by, `↩️ คำขอ #${cr.id} ถูกตีกลับโดย ${user.name}\n${cr.title}\nเหตุผล: ${reason}`)
    if (cr.kind === 'contractor_line') for (const a of conApprovers()) if (a.line_uid && a.id !== user.id) d.linePush(a.line_uid, `ℹ️ เรื่องจากช่าง #${cr.id} ถูกตีกลับโดย ${user.name} — ไม่ต้องกดซ้ำค่ะ`).catch?.(() => {})
    return { ok: true, cr }
  }
  /** ปุ่มในการ์ด LINE (cr:<id>:approve|reject) + เหตุผลที่พิมพ์ตามมา → คืน promise ถ้าจัดการแล้ว · null = ไม่ใช่เรื่องนี้ */
  function linePostback(uid, u, data, tok) {
    const m = String(data || '').match(/^cr:(\d+):(approve|reject)$/)
    if (!m) return null
    const cr = db.prepare('SELECT * FROM change_requests WHERE id=?').get(Number(m[1]))
    if (!cr) return d.lineReply(tok, 'ไม่พบคำขอนี้แล้วค่ะ')
    if (!canDecide(u, cr)) return d.lineReply(tok, 'คุณไม่ได้เป็นผู้ตรวจเรื่องนี้ค่ะ')
    if (cr.status !== 'รออนุมัติ') return d.lineReply(tok, `คำขอ #${cr.id} ${cr.status}ไปแล้ว${cr.decided_by ? ' โดย ' + cr.decided_by : ''} ค่ะ`)
    if (m[2] === 'reject') { d.setLineCtx(uid, { kind: 'cr_reject', id: cr.id, ttl: 6 * 3600000 }); return d.lineReply(tok, `จะตีกลับ #${cr.id} "${short(cr.title, 60)}" — เหตุผลคืออะไรคะ? (พิมพ์ข้อความ ช่างจะได้รู้ว่าต้องแก้อะไร · พิมพ์ 'ยกเลิก' ถ้าไม่ตีกลับ)`) }
    return approveReq(cr.id, u, 'อนุมัติผ่าน LINE').then((r) => d.lineReply(tok, r.error ? `ทำรายการไม่ได้ค่ะ: ${r.error}` : `✅ อนุมัติ #${cr.id} แล้วค่ะ — แจ้งช่างแล้ว`))
  }
  function lineText(uid, u, t, tok, ctx) {
    if (ctx?.kind !== 'cr_reject') return null
    d.setLineCtx(uid, null)
    if (/^(ยกเลิก|cancel)$/i.test(t)) return d.lineReply(tok, 'ไม่ตีกลับแล้วค่ะ — คำขอยังรออยู่ กดปุ่มในการ์ดได้อีก')
    const r = rejectReq(ctx.id, u, t)
    return d.lineReply(tok, r.error ? `ทำรายการไม่ได้ค่ะ: ${r.error}` : `↩️ ตีกลับ #${ctx.id} แล้วค่ะ — แจ้งช่างพร้อมเหตุผลแล้ว`)
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

  const hiddenKeys = () => new Set(db.prepare('SELECT key FROM feed_hidden').all().map((r) => r.key))
  function feed({ house = '', cat = '', beforeId = 0, limit = 40, flagOnly = false, showHidden = false, user = null }) {
    const hidden = hiddenKeys()
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
        if (hidden.has(key) !== showHidden) continue // ปกติ = ไม่แสดงที่ซ่อน · showHidden = แสดงเฉพาะที่ซ่อน
        const ex = byKey.get(key)
        if (ex) { // ทำพร้อมกัน → รวมเป็นเรื่องเดียว
          ex.parts.unshift({ text: dsc.text, lines: dsc.lines, ...attachCount(r, user) }); ex.flag = ex.flag || dsc.flag; ex.min_id = r.id
          if (dsc.approval) ex.approval = dsc.approval
          if (!ex.cats.includes(CAT_OF[r.table_name])) ex.cats.push(CAT_OF[r.table_name])
          continue
        }
        if (out.length >= limit) break
        const ev = { id: r.id, key, min_id: r.id, ts: r.ts, user: r.user, house_code: r.hc, house_name: houseName(r.hc), cats: [CAT_OF[r.table_name] || 'info'], flag: dsc.flag, approval: dsc.approval || null, parts: [{ text: dsc.text, lines: dsc.lines, ...attachCount(r, user) }] }
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
    const keys = new Set(), hidden = hiddenKeys()
    for (const r of rows) { const k = `${r.ts}|${r.user}|${r.hc}`; if (r.hc && !hidden.has(k) && describe(r)) keys.add(k) }
    return { count: keys.size, seen }
  }

  // ---- กดรายการความเคลื่อนไหว → เปิดดูเรื่องนั้น + รูปแนบ ----
  //  สิทธิ์เท่ากับหน้าต้นทาง (บังคับที่นี่ ไม่ใช่แค่ซ่อนปุ่ม) · รูปทุกชนิดส่งผ่านเส้นทางเดียว ที่ตรวจสิทธิ์ทุกครั้ง
  const isAudit = (u) => u.role === 'admin' || u.role === 'accounting' || d.isManager(u)
  const isFinance = (u) => u.role === 'admin' || u.role === 'accounting'
  const isWriter = (u) => ['admin', 'accounting', 'site'].includes(u.role)
  // ตารางที่ไม่อยู่ในนี้ = หน้าต้นทางเปิดให้พนักงานทุกคน
  const ACCESS = {
    purchase_requests: { mod: 'procurement', allow: isWriter }, purchase_orders: { mod: 'procurement', allow: isFinance }, payments: { mod: 'procurement', allow: isFinance },
    stock_moves: { mod: 'procurement' }, expenses: { mod: 'accounting' }, petty_expenses: { mod: 'accounting', allow: isFinance }, sales_docs: { mod: 'sales' }, nps: { mod: 'sales' },
    boqs: { allow: isAudit }, doc_register: { allow: isAudit }, cashflows: { allow: isAudit },
    fuel_requests: { allow: (u, r) => isAudit(u) || (r.user_id && r.user_id === u.id) || r.by === u.name },
  }
  function canOpen(user, table, row) {
    const a = ACCESS[table]
    if (!a) return true
    if (a.mod && user.role !== 'admin' && (user.deny_mods || []).includes(a.mod)) return false
    return a.allow ? !!a.allow(user, row || {}) : true
  }
  // ยอดเงินฝั่งช่าง/ต้นทุน — เห็นเฉพาะผู้จัดการ (เหมือนหน้าบ้าน/แฟ้มบ้าน)
  const COST_ROW = { installments: (r) => r.side === 'contractor', house_contracts: (r) => r.side === 'contractor', house_money_log: (r) => r.side === 'contractor', contractors: () => true, contractor_advances: () => true, contractor_reports: () => true }
  const COST_FIELD = new Set(['contractor_value', 'house_contractor', 'carport_contractor', 'road_contractor'])

  const DETAIL_LABEL = {
    ...FIELD_LABEL, type: 'ชนิด', by: 'ผู้บันทึก', date: 'วันที่', category: 'หมวด', cat: 'หมวด', zone: 'โซน', inspector: 'ผู้ตรวจ', remark: 'หมายเหตุ', discipline: 'สาขางาน',
    response: 'คำตอบ', responded_by: 'ผู้ตอบ', assignee: 'ผู้รับผิดชอบ', scope: 'ขอบเขตงาน', issued_date: 'วันที่สั่งงาน', due_date: 'กำหนดเสร็จ', submit_note: 'ข้อความตอนส่งงาน', obstacle: 'อุปสรรค',
    acceptance: 'ผลตรวจรับ', acceptance_note: 'หมายเหตุตรวจรับ', uploader: 'ผู้อัปโหลด', uploaded: 'วันที่อัปโหลด', start: 'เริ่ม', end: 'สิ้นสุด', requester: 'ผู้เบิก', payee: 'ผู้รับเงิน', gross: 'ยอดก่อนหัก', net: 'ยอดสุทธิ',
    requested_by: 'ผู้ขอ', case_no: 'เลขเคส', comment: 'ความเห็น', grade: 'เกรด', customer: 'ลูกค้า', project: 'โครงการ', total: 'ยอดรวม', inst_detail: 'งวด', method: 'วิธีจ่าย', ref_no: 'อ้างอิง', worker: 'ผู้ทำงาน',
  }
  const DETAIL_MONEY = new Set([...MONEY_FIELDS, 'gross', 'net', 'total', 'cost_impact'])
  const DATE_FIELD = new Set(['date', 'due', 'due_date', 'issued_date', 'start', 'end', 'start_date', 'deliver_date', 'uploaded'])
  const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  const thaiDate = (v) => { const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${Number(m[3])} ${TH_MON[Number(m[2]) - 1]} ${(Number(m[1]) + 543) % 100}` : v }
  function detailFields(table, row, user) {
    const hideCost = !d.isManager(user)
    const hideAllMoney = hideCost && COST_ROW[table]?.(row)
    const out = []
    for (const [k, v] of Object.entries(row)) {
      if (NOISE_FIELDS.has(k) || !DETAIL_LABEL[k] || v == null || v === '') continue
      if (table === 'change_requests' && k === 'title') continue // หัวเรื่องแสดงด้านบนอยู่แล้ว
      if (table === 'installments' && k === 'category') continue // ค่าเป็นรหัสภายใน (house/carport/road)
      if (DETAIL_MONEY.has(k)) {
        if (hideAllMoney || (hideCost && COST_FIELD.has(k)) || !Number(v)) continue
        out.push({ k: DETAIL_LABEL[k], v: `${money(v)} บาท` }); continue
      }
      const s = String(v)
      if (/^[[{]/.test(s) || s.startsWith('data:') || s === '***') continue // JSON/รูป/ค่าลับ ไม่ใช่ข้อความให้คนอ่าน
      out.push({ k: DETAIL_LABEL[k], v: DATE_FIELD.has(k) ? thaiDate(s) : short(s, k === 'text' || k === 'note' || k === 'detail' ? 2000 : 300) })
      if (out.length >= 18) break
    }
    return out
  }

  // ---- ไฟล์/รูปของแต่ละเรื่อง (เก็บได้ 2 แบบ: ไฟล์ของบ้าน [files] หรือฝังเป็น data URL ในแถว) ----
  const FILE_IMAGE = /^image\/(png|jpe?g|gif|webp|bmp)$/i
  const DATA_URL = /^data:(image\/(?:png|jpe?g|gif|webp|bmp)|application\/pdf);base64,/i
  const fileAtt = (f) => ({ kind: 'file', id: f.id, name: f.name || 'ไฟล์', image: FILE_IMAGE.test(String(f.mime || '').split(';')[0].trim()) })
  const fileRefs = (list) => (Array.isArray(list) ? list : [list]).map((x) => Number(x?.id ?? x)).filter(Boolean).flatMap((id) => {
    const f = db.prepare('SELECT id,name,mime FROM files WHERE id=?').get(id)
    return f ? [fileAtt(f)] : []
  })
  function inlineAtts(...vals) {
    const urls = new Set()
    const walk = (v, depth = 0) => {
      if (depth > 6 || v == null) return
      if (typeof v === 'string') {
        if (DATA_URL.test(v)) urls.add(v)
        else if (/^[[{]/.test(v)) { const j = jparse(v); if (j) walk(j, depth + 1) }
      } else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1))
      else if (typeof v === 'object') Object.values(v).forEach((x) => walk(x, depth + 1))
    }
    vals.forEach((v) => walk(v))
    return [...urls].slice(0, 40).map((url, i) => { const mime = url.match(DATA_URL)[1].toLowerCase(); return { kind: 'data', url, mime, name: `${mime === 'application/pdf' ? 'เอกสาร' : 'รูป'} ${i + 1}`, image: mime !== 'application/pdf' } })
  }
  const ATTACH = {
    files: (r) => [fileAtt(r)],
    contractor_reports: (r) => fileRefs(jparse(r.files) || []),
    change_requests: (r) => fileRefs((jparse(r.body) || {}).files || []),
    work_orders: (r) => fileRefs(jparse(r.submit_files) || []),
    house_contracts: (r) => (r.file_id ? fileRefs([r.file_id]) : []),
    sales_docs: (r) => (r.attachment_file_id ? fileRefs([r.attachment_file_id]) : []),
    qc_inspections: (r) => inlineAtts(r.images, r.items),
    site_docs: (r) => inlineAtts(r.image),
    issues: (r) => inlineAtts(r.photo),
    purchase_requests: (r) => inlineAtts(r.image, r.images),
    purchase_orders: (r) => inlineAtts(r.image),
    houses: (r) => inlineAtts(r.photo),
    site_reports: (r) => inlineAtts(r.data),
    safety_records: (r) => inlineAtts(r.data),
    handover_docs: (r) => inlineAtts(r.data),
  }
  // แถวปัจจุบันของเรื่องนี้ (ถูกลบไปแล้ว = null) · files ไม่ดึงคอลัมน์ data เก่าที่ใหญ่มาก
  function currentRow(r) {
    try {
      const row = db.prepare(`SELECT ${r.table_name === 'files' ? 'id,house_code,name,mime,size,category,uploaded,uploader' : '*'} FROM "${r.table_name}" WHERE id=?`).get(Number(r.row_key))
      return row && (r.table_name === 'houses' ? row.code : row.house_code) === r.hc ? row : null // เลขเดิมแต่เป็นคนละเรื่อง (ลบแล้วเลขถูกใช้ซ้ำ) ไม่นับ
    } catch { return null }
  }
  const snapshotOf = (r) => jparse(r.action === 'delete' ? r.before : r.after) || {}
  function attachmentsOf(r, row) {
    if (!row || !ATTACH[r.table_name]) return []
    try { return ATTACH[r.table_name](row) } catch { return [] }
  }
  // จำนวนรูป/ไฟล์ของรายการ (ป้ายบนหน้ารายการ) — คนที่เปิดเรื่องนั้นไม่ได้จะไม่เห็นตัวเลข
  function attachCount(r, user) {
    const out = { hid: r.id, photos: 0, docs: 0 }
    if (!user || !ATTACH[r.table_name]) return out
    const row = currentRow(r)
    if (!row || !canOpen(user, r.table_name, row)) return out
    for (const a of attachmentsOf(r, row)) { if (a.image) out.photos++; else out.docs++ }
    return out
  }

  // ---- ปุ่ม "ไปหน้าต้นทาง" ของแต่ละชนิด ----
  const HOUSE_TAB = {
    installments: ['installments', 'งวดงาน'], house_categories: ['installments', 'งวดงาน'], inst_acceptance: ['installments', 'งวดงาน'], houses: ['installments', 'งวดงาน'], files: ['installments', 'งวดงาน และไฟล์ของบ้าน'],
    house_contracts: ['money', 'การเงิน & สัญญา'], house_money_log: ['money', 'การเงิน & สัญญา'], contractors: ['contractors', 'ช่าง / ผู้รับเหมา'], contractor_advances: ['contractors', 'ช่าง / ผู้รับเหมา'], contractor_evals: ['contractors', 'ช่าง / ผู้รับเหมา'],
    site_reports: ['sitereport', 'รายงานหน้างาน'], qc_inspections: ['qc', 'QC ตรวจงาน'], work_orders: ['workorders', 'ใบสั่งงาน'], site_docs: ['sitedocs', 'เอกสารหน้างาน'], issues: ['issues', 'ปัญหา'], safety_records: ['safety', 'ความปลอดภัย'],
    handover_docs: ['handover', 'ส่งมอบงาน'], boqs: ['boq', 'BOQ'], purchase_requests: ['procurement', 'จัดซื้อ'], purchase_orders: ['procurement', 'จัดซื้อ'], payments: ['procurement', 'จัดซื้อ'], expenses: ['expenses', 'รายจ่าย'],
  }
  const PAGE_OF = { tasks: ['gantt', 'แผนงาน'], stock_moves: ['stock', 'สต๊อก'], doc_register: ['docreg', 'ทะเบียนเอกสาร'], sales_docs: ['sales', 'เอกสารขาย'], nps: ['customers', 'ลูกค้า'], cashflows: ['costing', 'ต้นทุน / กระแสเงินสด'], petty_expenses: ['accounting', 'บัญชี'], fuel_requests: ['accounting', 'บัญชี'] }
  const canSeeRequest = (user, cr) => canApprove(user) || (cr.kind === 'contractor_line' && isConApprover(user)) || (cr.requested_by_id && cr.requested_by_id === user.id)
  const approvalTarget = (user, cr) => {
    if (!cr || !canSeeRequest(user, cr)) return null
    return { type: 'approval', status: ['รออนุมัติ', 'อนุมัติ', 'ตีกลับ'].includes(cr.status) ? cr.status : 'all', label: 'รออนุมัติ' }
  }
  function targetOf(r, row, user) {
    const t = r.table_name
    if (t === 'change_requests') return row ? approvalTarget(user, row) : null
    if (t === 'contractor_reports') {
      const a = row?.request_id ? approvalTarget(user, db.prepare('SELECT * FROM change_requests WHERE id=?').get(row.request_id)) : null
      return a || (row ? { type: 'house', tab: 'installments', label: 'งวดงาน และไฟล์ของบ้าน' } : null)
    }
    if (t === 'fuel_requests' && !isFinance(user)) return null // หน้าเบิกน้ำมันอยู่ในบัญชี
    if (HOUSE_TAB[t]) return { type: 'house', tab: HOUSE_TAB[t][0], label: HOUSE_TAB[t][1] }
    if (PAGE_OF[t]) return { type: 'page', page: PAGE_OF[t][0], label: PAGE_OF[t][1] }
    return null
  }

  const FEED_ROW_COLS = `id, ts, user, table_name, row_key, action, before, after, ${houseExpr} AS hc`
  const feedRowById = (id) => {
    const r = db.prepare(`SELECT ${FEED_ROW_COLS} FROM change_history WHERE id=? AND table_name IN (${FEED_TABLES.map(() => '?').join(',')})`).get(Number(id), ...FEED_TABLES)
    return r && r.hc ? r : null
  }
  function feedDetail(id, user) {
    const base = feedRowById(id)
    if (!base) return null
    if (user.role !== 'admin' && hiddenKeys().has(`${base.ts}|${base.user}|${base.hc}`)) return null // เรื่องที่แอดมินซ่อน
    const rows = db.prepare(`SELECT ${FEED_ROW_COLS} FROM change_history WHERE ts=? AND user=? AND table_name IN (${FEED_TABLES.map(() => '?').join(',')}) ORDER BY id`).all(base.ts, base.user, ...FEED_TABLES).filter((r) => r.hc === base.hc)
    const parts = []
    let flag = false, approval = null
    for (const r of rows) {
      const dsc = describe(r)
      if (!dsc) continue
      flag = flag || dsc.flag
      if (dsc.approval) approval = dsc.approval
      const row = currentRow(r)
      const view = row || snapshotOf(r)
      const part = { hid: r.id, label: TABLE_LABEL[r.table_name] || r.table_name, action: r.action, text: dsc.text, lines: dsc.lines, exists: !!row, restricted: false, fields: [], attachments: [], target: null }
      if (!canOpen(user, r.table_name, view)) { parts.push({ ...part, restricted: true }); continue }
      part.fields = detailFields(r.table_name, view, user)
      part.attachments = attachmentsOf(r, row).map((a, n) => ({ n, name: a.name, image: a.image }))
      part.target = targetOf(r, row, user)
      parts.push(part)
    }
    return { id: base.id, ts: base.ts, user: base.user, house_code: base.hc, house_name: houseName(base.hc), flag, approval, parts }
  }
  function sendAttachment(req, res) {
    const r = feedRowById(req.params.id)
    if (!r) return res.status(404).json({ error: 'ไม่พบรายการ' })
    const row = currentRow(r)
    if (!row) return res.status(404).json({ error: 'รายการนี้ถูกลบไปแล้ว' })
    if (!canOpen(req.user, r.table_name, row)) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เปิดไฟล์ของรายการนี้' })
    const a = attachmentsOf(r, row)[Number(req.params.n)]
    if (!a) return res.status(404).json({ error: 'ไม่พบไฟล์' })
    if (a.kind === 'file') return d.sendStoredFile(res, a.id)
    res.setHeader('Content-Type', a.mime)
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(a.name)}`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(Buffer.from(a.url.slice(a.url.indexOf(',') + 1), 'base64'))
  }

  function customersOfHouse(code) {
    const h = db.prepare('SELECT * FROM houses WHERE code=?').get(code)
    if (!h) return { house: null, list: [] }
    const list = db.prepare('SELECT id, name, line_uid FROM customers WHERE line_uid IS NOT NULL AND (id=? OR (name=? AND COALESCE(name,\'\')<>\'\'))').all(h.customer_id ?? -1, h.customer || '')
    return { house: h, list }
  }

  // ช่วงตรวจข้อความลูกค้า (settings.cust_redirect_user) → ข้อความไปหาผู้ตรวจแทนลูกค้า
  const reviewerName = () => { const id = Number(d.getSetting('cust_redirect_user', '')) || 0; return id ? db.prepare('SELECT name FROM users WHERE id=?').get(id)?.name || '' : '' }
  const rowOut = (r) => ({ ...r, lines: jparse(r.lines) || [], house_name: houseName(r.house_code), files: (jparse(r.body) || {}).files || [], body: undefined, params: undefined })

  function register(api) {
    api.get('/center/feed', (req, res) => {
      const q = req.query || {}
      res.json(feed({ house: String(q.house || ''), cat: String(q.cat || ''), beforeId: Number(q.before) || 0, limit: Math.min(100, Number(q.limit) || 40), flagOnly: q.flag === '1', showHidden: q.hidden === '1', user: req.user }))
    })
    // กดรายการ → รายละเอียดเรื่อง · รูป/ไฟล์ของเรื่อง (ตรวจสิทธิ์ตามหน้าต้นทางทุกครั้ง)
    api.get('/center/feed/:id/detail', (req, res) => {
      const r = feedDetail(req.params.id, req.user)
      if (!r) return res.status(404).json({ error: 'ไม่พบรายการนี้ (อาจถูกซ่อนหรือไม่มีแล้ว)' })
      res.json(r)
    })
    api.get('/center/feed/:id/file/:n', sendAttachment)
    // ซ่อน / เลิกซ่อน เรื่องในหน้าความเคลื่อนไหว (แอดมิน) — ไม่ลบประวัติ
    api.post('/center/feed/hide', (req, res) => {
      if (req.user?.role !== 'admin') return res.status(403).json({ error: 'ซ่อนได้เฉพาะผู้ดูแลระบบ' })
      const keys = (Array.isArray(req.body?.keys) ? req.body.keys : []).map(String).filter((k) => /^[^|]+\|[^|]*\|[^|]+$/.test(k)).slice(0, 2000)
      const unhide = !!req.body?.unhide
      if (!keys.length) return res.status(400).json({ error: 'ยังไม่ได้เลือกเรื่อง' })
      const ins = db.prepare('INSERT OR IGNORE INTO feed_hidden (key,by,at) VALUES (?,?,?)'), del = db.prepare('DELETE FROM feed_hidden WHERE key=?')
      db.transaction(() => { for (const k of keys) unhide ? del.run(k) : ins.run(k, req.user.name, d.nowTS()) })()
      d.audit(req, unhide ? 'เลิกซ่อนเรื่องในความเคลื่อนไหวบ้าน' : 'ซ่อนเรื่องในความเคลื่อนไหวบ้าน', `${keys.length} เรื่อง`)
      res.json({ ok: true, count: keys.length, hidden_total: db.prepare('SELECT COUNT(*) c FROM feed_hidden').get().c })
    })
    api.get('/center/feed/hidden-count', (_req, res) => res.json({ count: db.prepare('SELECT COUNT(*) c FROM feed_hidden').get().c }))
    api.get('/center/unread', (req, res) => {
      const u = unreadFor(req.user)
      res.json({ unread: u.count, last_seen: u.seen, pending: pendingFor(req.user), canApprove: canApprove(req.user) || isConApprover(req.user), canCustomer: canCustomer(req.user) })
    })
    api.post('/center/seen', (req, res) => {
      const id = Number(req.body?.last_id) || maxFeedId()
      db.prepare('INSERT INTO feed_seen (user_id,last_id) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET last_id=MAX(last_id, excluded.last_id)').run(req.user.id, id)
      res.json({ ok: true })
    })
    // ---- คิวอนุมัติ ----
    api.get('/approvals', (req, res) => {
      const st = String(req.query.status || 'รออนุมัติ')
      const all = canApprove(req.user), conAp = isConApprover(req.user)
      const rows = db.prepare(`SELECT * FROM change_requests WHERE ${st === 'all' ? '1=1' : 'status=?'} ${all ? '' : conAp ? "AND (kind='contractor_line' OR requested_by_id=?)" : 'AND requested_by_id=?'} ORDER BY id DESC LIMIT 200`).all(...(st === 'all' ? [] : [st]), ...(all ? [] : [req.user.id]))
      res.json(rows.map((r) => ({ ...rowOut(r), can_decide: canDecide(req.user, r) })))
    })
    api.post('/approvals/:id/approve', async (req, res) => {
      const r = await approveReq(req.params.id, req.user, String(req.body?.note || ''), req)
      if (r.error) return res.status(r.code || 400).json({ error: r.error })
      res.json({ ok: true })
    })
    api.post('/approvals/:id/reject', (req, res) => {
      const r = rejectReq(req.params.id, req.user, String(req.body?.note || ''), req)
      if (r.error) return res.status(r.code || 400).json({ error: r.error })
      res.json({ ok: true })
    })
    // ผู้ตรวจเรื่องจากช่าง (ได้การ์ด LINE ให้กดอนุมัติ/ตีกลับ)
    api.get('/center/con-approvers', (req, res) => {
      if (req.user?.role !== 'admin') return res.status(403).json({ error: 'ตั้งค่าได้เฉพาะผู้ดูแลระบบ' })
      const ids = conApproverIds()
      res.json({ ids, users: db.prepare("SELECT id, name, role, (line_uid IS NOT NULL) AS has_line FROM users WHERE COALESCE(status,'ใช้งาน')='ใช้งาน' ORDER BY name").all().map((u) => ({ ...u, has_line: !!u.has_line })) })
    })
    api.put('/center/con-approvers', (req, res) => {
      if (req.user?.role !== 'admin') return res.status(403).json({ error: 'ตั้งค่าได้เฉพาะผู้ดูแลระบบ' })
      const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter((id) => id && db.prepare('SELECT 1 FROM users WHERE id=?').get(id)))].slice(0, 6)
      d.setSetting('con_approvers', JSON.stringify(ids))
      d.audit(req, 'ตั้งผู้ตรวจเรื่องจากช่าง (การ์ด LINE)', ids.map((id) => db.prepare('SELECT name FROM users WHERE id=?').get(id)?.name).join(', ') || '(ไม่มี — ส่งข้อความถึงแอดมิน/ผู้จัดการทุกคน)')
      res.json({ ok: true, ids })
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
      res.json({ house: { code: house.code, name: house.name, customer: house.customer, pct: house.pct }, customers: list.map((c) => ({ id: c.id, name: c.name })), sent, canSend: canCustomer(req.user), hasLine: !!d.getSetting('line_token', ''), redirect_to: reviewerName() })
    })
    api.post('/center/customer/:code/send', async (req, res) => {
      if (!canCustomer(req.user)) return res.status(403).json({ error: 'ส่งอัปเดตลูกค้าได้เฉพาะแอดมิน/ผู้จัดการ/ฝ่ายดูแลลูกค้า' })
      const text = String(req.body?.text || '').trim()
      if (!text) return res.status(400).json({ error: 'กรุณาพิมพ์ข้อความที่จะส่ง' })
      if (text.length > 4500) return res.status(400).json({ error: 'ข้อความยาวเกินไป (ไม่เกิน 4,500 ตัวอักษร)' })
      const { house, list } = customersOfHouse(req.params.code)
      if (!house) return res.status(404).json({ error: 'ไม่พบบ้าน' })
      const rid = Number(d.getSetting('cust_redirect_user', '')) || 0
      const reviewer = rid ? db.prepare('SELECT name, line_uid FROM users WHERE id=?').get(rid) : null
      if (!list.length && !reviewer) return res.status(400).json({ error: 'ลูกค้าบ้านนี้ยังไม่ได้ผูก LINE — ให้ลูกค้าผูก LINE ก่อน (หน้า ลูกค้า/CRM → ออกรหัสผูก LINE)' })
      if (!d.getSetting('line_token', '')) return res.status(400).json({ error: 'ยังไม่ได้ตั้งค่า LINE (หน้า ผู้ใช้งาน → แจ้งเตือน LINE)' })
      const kind = req.body?.kind === 'notice' ? 'notice' : 'update'
      // ช่วงตรวจ + ลูกค้ายังไม่ผูก LINE: ส่งให้ผู้ตรวจดูได้เลย (ยังไงก็ไม่ถึงลูกค้าอยู่แล้ว) — ทดลองกับบ้านทดสอบได้
      if (!list.length) {
        if (!reviewer.line_uid) return res.status(400).json({ error: `${reviewer.name} (ผู้ตรวจข้อความลูกค้า) ยังไม่ได้ผูก LINE` })
        const ok = await d.linePush(reviewer.line_uid, [`📨 [ตรวจก่อนส่งลูกค้า] ข้อความนี้ปกติส่งถึงลูกค้าบ้าน ${house.name}${house.customer ? ` (${house.customer})` : ''} — ลูกค้ายังไม่ได้ผูก LINE · ยังไม่ถึงลูกค้า`, text])
        db.prepare('INSERT INTO customer_updates (ts,house_code,text,by,sent_to,status,kind) VALUES (?,?,?,?,?,?,?)').run(d.nowTS(), house.code, text, req.user.name, '', ok ? `ส่งให้ ${reviewer.name} ตรวจ (ลูกค้ายังไม่ผูก LINE)` : 'ส่งไม่สำเร็จ', kind)
        d.audit(req, 'ส่งอัปเดตลูกค้า (ช่วงตรวจ) ให้ผู้ตรวจ', `${house.code} → ${reviewer.name}${ok ? '' : ' ไม่สำเร็จ'}`)
        if (!ok) return res.status(502).json({ error: 'ส่ง LINE ไม่สำเร็จ — ตรวจการตั้งค่า LINE ที่หน้า ผู้ใช้งาน → แจ้งเตือน LINE' })
        return res.json({ ok: true, sent_to: [house.customer || 'ลูกค้า'], redirect_to: reviewer.name })
      }
      const okNames = []
      for (const c of list) {
        const ok = await d.linePush(c.line_uid, text)
        if (ok) { okNames.push(c.name); try { db.prepare('INSERT INTO customer_contacts (customer_id,date,channel,note,by,done) VALUES (?,?,?,?,?,1)').run(c.id, d.todayTH(), 'LINE', 'ส่งอัปเดต: ' + short(text, 200), req.user.name) } catch { /* ignore */ } }
      }
      db.prepare('INSERT INTO customer_updates (ts,house_code,text,by,sent_to,status,kind) VALUES (?,?,?,?,?,?,?)').run(d.nowTS(), house.code, text, req.user.name, okNames.join(', '), okNames.length ? (reviewerName() ? `ส่งให้ ${reviewerName()} ตรวจ (ยังไม่ถึงลูกค้า)` : 'ส่งแล้ว') : 'ส่งไม่สำเร็จ', kind)
      d.audit(req, 'ส่งอัปเดตลูกค้าทาง LINE', `${house.code} → ${okNames.join(', ') || 'ไม่สำเร็จ'}`)
      if (!okNames.length) return res.status(502).json({ error: 'ส่ง LINE ไม่สำเร็จ — ตรวจการตั้งค่า LINE ที่หน้า ผู้ใช้งาน → แจ้งเตือน LINE' })
      res.json({ ok: true, sent_to: okNames, redirect_to: reviewerName() })
    })
  }

  // จำนวนคำขอที่รอเรา: แอดมิน/ผู้จัดการ = ทั้งหมด · ผู้ตรวจเรื่องจากช่าง = เรื่องจากช่าง + ของตัวเอง · คนอื่น = ของตัวเอง
  function pendingFor(u) {
    if (canApprove(u)) return db.prepare("SELECT COUNT(*) c FROM change_requests WHERE status='รออนุมัติ'").get().c
    if (isConApprover(u)) return db.prepare("SELECT COUNT(*) c FROM change_requests WHERE status='รออนุมัติ' AND (kind='contractor_line' OR requested_by_id=?)").get(u.id).c
    return db.prepare("SELECT COUNT(*) c FROM change_requests WHERE status='รออนุมัติ' AND requested_by_id=?").get(u.id).c
  }
  // แจ้งเตือนกระดิ่ง (รวมเข้า /notifications)
  function notificationsFor(user) {
    const out = []
    try {
      if (canApprove(user) || isConApprover(user)) {
        const n = canApprove(user) ? db.prepare("SELECT COUNT(*) c FROM change_requests WHERE status='รออนุมัติ'").get().c : db.prepare("SELECT COUNT(*) c FROM change_requests WHERE status='รออนุมัติ' AND kind='contractor_line'").get().c
        if (n) out.push({ kind: 'approval', icon: 'warn', title: `มีคำขอรออนุมัติ ${n} รายการ`, sub: 'เพิ่ม-ลดงาน / แก้ยอดเงิน — เปิดหน้าความเคลื่อนไหวบ้าน → รออนุมัติ', page: 'center' })
      }
      for (const r of db.prepare("SELECT * FROM change_requests WHERE requested_by_id=? AND status='ตีกลับ' AND decided_at >= ? ORDER BY id DESC LIMIT 5").all(user.id, new Date(Date.now() - 3 * 86400000 + 7 * 3600000).toISOString().slice(0, 10)))
        out.push({ kind: 'approval-rejected', icon: 'danger', title: `คำขอ #${r.id} ถูกตีกลับ`, sub: `${r.title} · ${r.reason || ''}`, page: 'center' })
    } catch { /* ignore */ }
    return out
  }

  // ===== แจ้งเตือนเข้ากลุ่ม LINE (เฟส 3) =====
  // ทุก N นาที รวบเรื่องใหม่จากความเคลื่อนไหวบ้าน (เฉพาะประเภทที่เลือก) ส่งเป็นข้อความเดียวเข้ากลุ่ม/คนที่ตั้งไว้
  // เปิดครั้งแรก/เปิดใหม่ = เริ่มนับจากตอนนี้ (ไม่ยิงย้อนหลัง) · ช่วงเงียบ (ค่าเริ่ม 20:00–07:00) เก็บไว้ส่งรวมตอนเช้า
  const ALERT_CATS = {
    flag: 'เพิ่ม-ลดงาน / ยอดเงินเปลี่ยน', approval: 'คำขออนุมัติ (ส่งขอ / อนุมัติ / ตีกลับ)', contractor: 'เรื่องที่ช่างส่งทาง LINE',
    issue: 'ปัญหาหน้างานใหม่', site: 'งานหน้างานอื่นๆ (QC · ใบสั่งงาน · รายงาน)', customer: 'ส่งอัปเดตให้ลูกค้าแล้ว', info: 'ข้อมูลบ้าน / ไฟล์',
  }
  const ALERT_DEF = { on: false, targets: [], cats: { flag: true, approval: true, contractor: true, issue: true, site: false, customer: false, info: false }, every: 5, quiet: true }
  const alertCfg = () => { const o = jparse(d.getSetting('center_alerts', '')) || {}; return { ...ALERT_DEF, ...o, cats: { ...ALERT_DEF.cats, ...(o.cats || {}) }, targets: Array.isArray(o.targets) ? o.targets : (d.getSetting('line_to', '') ? [d.getSetting('line_to', '')] : []) } }
  // ตัวนับภายในของการแจ้งเตือน (เปลี่ยนทุกนาที) — เก็บแยกตารางที่ไม่เก็บประวัติ ไม่งั้นประวัติโตเองไม่หยุด
  db.exec('CREATE TABLE IF NOT EXISTS center_state (k TEXT PRIMARY KEY, v TEXT)')
  const stGet = (k) => db.prepare('SELECT v FROM center_state WHERE k=?').get(k)?.v ?? ''
  const stSet = (k, v) => db.prepare('INSERT INTO center_state (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, String(v))
  const isQuiet = (now = new Date()) => { const h = now.getHours(); return h >= 20 || h < 7 }
  function alertEvents(fromId, toId) {
    const ph = FEED_TABLES.map(() => '?').join(',')
    const rows = db.prepare(`SELECT id, ts, user, table_name, action, before, after, ${houseExpr} AS hc FROM change_history WHERE id > ? AND id <= ? AND table_name IN (${ph}) ORDER BY id`).all(fromId, toId, ...FEED_TABLES)
    const cfg = alertCfg(), byKey = new Map(), out = []
    for (const r of rows) {
      if (!r.hc || r.user === 'ระบบ') continue
      const dsc = describe(r); if (!dsc) continue
      const isNew = r.action === 'insert'
      const match = (cfg.cats.flag && dsc.flag && r.table_name !== 'change_requests') || (cfg.cats.approval && r.table_name === 'change_requests') ||
        (cfg.cats.contractor && (r.table_name === 'contractor_reports' || /\(ช่าง LINE\)/.test(r.user || ''))) || (cfg.cats.issue && r.table_name === 'issues' && isNew) ||
        (cfg.cats.site && CAT_OF[r.table_name] === 'site') || (cfg.cats.customer && r.table_name === 'customer_updates') || (cfg.cats.info && CAT_OF[r.table_name] === 'info')
      if (!match) continue
      const key = `${r.ts}|${r.user}|${r.hc}`
      const ex = byKey.get(key)
      if (ex) { ex.parts.push(dsc); continue }
      const ev = { ts: r.ts, user: r.user, house: r.hc, parts: [dsc] }
      byKey.set(key, ev); out.push(ev)
    }
    return out
  }
  function alertText(evs) {
    if (!evs.length) return ''
    const MAX = 15, byHouse = new Map()
    for (const e of evs.slice(0, MAX)) { if (!byHouse.has(e.house)) byHouse.set(e.house, []); byHouse.get(e.house).push(e) }
    const L = [`🔔 ความเคลื่อนไหวบ้าน (${evs.length} เรื่อง)`]
    for (const [h, es] of byHouse) {
      L.push('', `🏠 ${houseName(h)}`)
      for (const e of es) for (const p of e.parts.slice(0, 3)) {
        L.push(`• ${e.ts.slice(11, 16)} ${String(e.user || '').replace(/ \(LINE\)$/, '')}: ${short(p.text, 90)}`)
        for (const l of (p.lines || []).slice(0, 2)) L.push(`   ${short(l, 80)}`)
      }
    }
    if (evs.length > MAX) L.push('', `…และอีก ${evs.length - MAX} เรื่อง`)
    L.push('', '— ดูทั้งหมด: ERP → ความเคลื่อนไหวบ้าน')
    return L.join('\n').slice(0, 4800)
  }
  let alertBusy = false
  async function alertTick(force = false) {
    if (alertBusy) return { sent: false, reason: 'busy' }
    alertBusy = true
    try {
      const cfg = alertCfg(), max = maxFeedId()
      const last = Number(stGet('center_alert_last')) || 0
      if (!cfg.on || !last) { stSet('center_alert_last', String(max)); return { sent: false, reason: cfg.on ? 'start' : 'off' } } // ปิดอยู่ = เลื่อนจุดเริ่มตามไป (เปิดแล้วไม่ยิงย้อนหลัง)
      if (!force) {
        if (isQuiet() && cfg.quiet) return { sent: false, reason: 'quiet' }
        const lastAt = Number(stGet('center_alert_at')) || 0
        if (Date.now() - lastAt < Math.max(1, Number(cfg.every) || 5) * 60000) return { sent: false, reason: 'wait' }
      }
      const text = alertText(alertEvents(last, max))
      stSet('center_alert_at', String(Date.now()))
      if (!text) { stSet('center_alert_last', String(max)); return { sent: false, reason: 'empty' } }
      if (!d.getSetting('line_token', '') || !cfg.targets.length) { stSet('center_alert_last', String(max)); return { sent: false, reason: 'no-line' } }
      let ok = 0
      for (const to of cfg.targets) if (await d.linePush(to, text)) ok++
      if (ok) stSet('center_alert_last', String(max)) // ส่งไม่สำเร็จเลย → เก็บไว้ลองรอบหน้า
      stSet('center_alert_status', JSON.stringify({ at: d.nowTS(), ok: ok > 0, sent: ok, of: cfg.targets.length }))
      return { sent: ok > 0, text }
    } finally { alertBusy = false }
  }
  setInterval(() => { alertTick().catch((e) => console.error('center alert:', e.message)) }, 60000)
  setTimeout(() => { alertTick().catch(() => {}) }, 5000) // ตั้งจุดเริ่มตอนเปิดเซิร์ฟเวอร์

  function registerAlerts(api) {
    const adminOnly = (req, res) => { if (req.user?.role !== 'admin') { res.status(403).json({ error: 'ตั้งค่าได้เฉพาะผู้ดูแลระบบ' }); return false } return true }
    api.get('/center/alerts', (req, res) => {
      if (!adminOnly(req, res)) return
      const seen = (d.lineSeen?.() || []).map((s) => ({ id: s.id, name: s.name, type: s.type }))
      res.json({ ...alertCfg(), cat_labels: ALERT_CATS, seen, digest_to: d.getSetting('line_to', ''), has_token: !!d.getSetting('line_token', ''), status: jparse(stGet('center_alert_status')) })
    })
    api.put('/center/alerts', (req, res) => {
      if (!adminOnly(req, res)) return
      const b = req.body || {}, cur = alertCfg()
      const next = {
        on: b.on != null ? !!b.on : cur.on,
        targets: Array.isArray(b.targets) ? [...new Set(b.targets.map((x) => String(x).trim()).filter((x) => /^[CRU][0-9a-f]{32}$/i.test(x)))].slice(0, 5) : cur.targets,
        cats: Object.fromEntries(Object.keys(ALERT_CATS).map((k) => [k, b.cats?.[k] != null ? !!b.cats[k] : !!cur.cats[k]])),
        every: Math.max(1, Math.min(60, Number(b.every) || cur.every)),
        quiet: b.quiet != null ? !!b.quiet : cur.quiet,
      }
      if (next.on && !cur.on) stSet('center_alert_last', String(maxFeedId())) // เพิ่งเปิด → เริ่มนับจากตอนนี้
      d.setSetting('center_alerts', JSON.stringify(next))
      d.audit(req, 'ตั้งค่าแจ้งเตือนกลุ่ม LINE (ความเคลื่อนไหวบ้าน)', `${next.on ? 'เปิด' : 'ปิด'} · ผู้รับ ${next.targets.length} · ทุก ${next.every} นาที · ${Object.entries(next.cats).filter(([, v]) => v).map(([k]) => ALERT_CATS[k]).join(', ')}`)
      res.json({ ok: true })
    })
    // ดูตัวอย่างข้อความจากเรื่องล่าสุด (ไม่ส่ง)
    api.get('/center/alerts/preview', (req, res) => {
      if (!adminOnly(req, res)) return
      const max = maxFeedId()
      const last = Number(stGet('center_alert_last')) || 0
      let evs = alertEvents(last, max)
      let pending = true
      if (!evs.length) { pending = false; evs = alertEvents(Math.max(0, max - 3000), max).slice(-8) } // ไม่มีเรื่องรอส่ง → เอาเรื่องล่าสุดมาเป็นตัวอย่าง
      res.json({ text: alertText(evs) || '(ยังไม่มีเรื่องที่ตรงกับประเภทที่เลือก)', pending, count: evs.length })
    })
    api.post('/center/alerts/test', async (req, res) => {
      if (!adminOnly(req, res)) return
      const cfg = alertCfg()
      if (!d.getSetting('line_token', '')) return res.status(400).json({ error: 'ยังไม่ได้ตั้งค่า LINE (หน้า LINE / ผู้ใช้งาน → แจ้งเตือน LINE)' })
      if (!cfg.targets.length) return res.status(400).json({ error: 'ยังไม่ได้เลือกกลุ่ม/ผู้รับ' })
      let ok = 0
      for (const to of cfg.targets) if (await d.linePush(to, `🔔 ทดสอบแจ้งเตือน "ความเคลื่อนไหวบ้าน" จาก PPSD ERP\nกลุ่มนี้จะได้รับเรื่องสำคัญของบ้านทุก ${cfg.every} นาที (เมื่อมีเรื่องใหม่)`)) ok++
      d.audit(req, 'ทดสอบแจ้งเตือนกลุ่ม LINE', `${ok}/${cfg.targets.length}`)
      if (!ok) return res.status(502).json({ error: 'ส่งไม่สำเร็จ — ตรวจว่าบอทอยู่ในกลุ่ม และตั้งค่า LINE ถูกต้อง' })
      res.json({ ok: true, sent: ok })
    })
    api.post('/center/alerts/send-now', async (req, res) => {
      if (!adminOnly(req, res)) return
      const r = await alertTick(true)
      res.json(r)
    })
  }

  return { gated, register: (api) => { register(api); registerAlerts(api) }, notificationsFor, canApprove, submit, registerOp, alertTick, linePostback, lineText }
}
