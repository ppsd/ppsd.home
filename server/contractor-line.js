// ===== บอท LINE สำหรับช่าง / ผู้รับเหมา =====
// ช่างไม่ต้องมีบัญชี ERP: แอดมิน/ผู้จัดการ/บัญชี ออกรหัส 6 หลักให้ (ที่แท็บช่างของบ้าน หรือหน้า ความเคลื่อนไหวบ้าน → ช่าง LINE)
// → ช่างส่งรหัสให้บอท PPSD → ผูกกับ "ชื่อช่าง" (เห็นเฉพาะบ้านที่ช่างชื่อนี้ถูกจ้าง และงวดฝั่งช่างของตัวเอง — ไม่เห็นราคาลูกค้า)
// ทุกอย่างที่ช่างส่ง เข้าคิว "รออนุมัติ" (center.js) ก่อนเสมอ:
//   รายงานความคืบหน้า (รูป + ข้อความ) · แจ้งปัญหา / ขอวัสดุ · ขอเบิกงวด
// อนุมัติแล้ว: รายงาน = รูปเข้าไฟล์บ้าน · ปัญหา = เปิดเรื่องในหน้า ปัญหาหน้างาน · เบิกงวด = งวดนั้นขึ้น "อนุมัติเบิก" ให้บัญชีกดจ่ายได้โดยไม่ต้องขออนุมัติซ้ำ
// ผลอนุมัติ/ตีกลับ ส่งกลับหาช่างทาง LINE
import { lt } from './line-texts.js'

const MAX_IMAGES = 10
const CTX_TTL = 6 * 60 * 60 * 1000
const PENDING_DIR = 'รูปจากช่าง (รอตรวจ)'
const OK_DIR = 'รูปจากช่าง'
const jparse = (s) => { try { return s ? JSON.parse(s) : null } catch { return null } }
const money = (n) => (Number(n) || 0).toLocaleString('en-US')
const KIND_TH = { progress: 'รายงานความคืบหน้า', problem: 'แจ้งปัญหา', material: 'ขอวัสดุ', claim: 'ขอเบิกงวด' }

export function createContractorBot(d) {
  const { db, center } = d
  db.exec(`CREATE TABLE IF NOT EXISTS contractor_line (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, vendor_id INTEGER, line_uid TEXT UNIQUE, phone TEXT,
    status TEXT, linked_at TEXT, linked_by TEXT
  )`)
  db.exec('CREATE TABLE IF NOT EXISTS contractor_link_codes (code TEXT PRIMARY KEY, name TEXT, vendor_id INTEGER, expires INTEGER, by TEXT)')
  db.exec(`CREATE TABLE IF NOT EXISTS contractor_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, house_code TEXT, contractor TEXT, kind TEXT, text TEXT,
    files TEXT, installment_id INTEGER, amount INTEGER, status TEXT, request_id INTEGER, decided_by TEXT, reason TEXT
  )`)
  const ensureColumn = (t, c, type) => { if (!db.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${type}`) }
  ensureColumn('installments', 'claim_status', 'TEXT') // ช่างขอเบิกทาง LINE: 'ขอเบิก' → 'อนุมัติเบิก' (บัญชีจ่ายได้เลย)
  ensureColumn('installments', 'claim_at', 'TEXT')

  const conByLine = (uid) => db.prepare("SELECT * FROM contractor_line WHERE line_uid=? AND status='ใช้งาน'").get(uid) || null
  const houseName = (code) => db.prepare('SELECT name FROM houses WHERE code=?').get(code)?.name || code
  // บ้านที่ช่างคนนี้ถูกจ้าง (ชื่อตรง หรืออ้างทะเบียนผู้รับเหมาเดียวกัน) · บ้านที่ส่งมอบ/ยกเลิกแล้วไม่แสดง
  function housesOf(con) {
    const rows = db.prepare(`SELECT c.house_code, c.role, c.contract_total, h.name, h.status FROM contractors c JOIN houses h ON h.code=c.house_code
      WHERE (c.name=? OR (c.vendor_id IS NOT NULL AND c.vendor_id=?)) ORDER BY h.id DESC`).all(con.name, con.vendor_id ?? -1)
    const seen = new Set()
    return rows.filter((r) => !['ยกเลิก', 'test'].includes(String(r.status || '').trim()) && !seen.has(r.house_code) && seen.add(r.house_code))
  }
  const instsOf = (con, code) => db.prepare("SELECT * FROM installments WHERE house_code=? AND side='contractor' AND contractor=? ORDER BY no, id").all(code, con.name)

  // ---- ผูก LINE ----
  function newCode({ name, vendor_id = null, by }) {
    let code
    for (let i = 0; i < 20; i++) { code = String(Math.floor(100000 + Math.random() * 900000)); if (!db.prepare('SELECT 1 FROM contractor_link_codes WHERE code=?').get(code)) break }
    db.prepare('DELETE FROM contractor_link_codes WHERE expires < ? OR name=?').run(Date.now(), name)
    db.prepare('INSERT INTO contractor_link_codes (code,name,vendor_id,expires,by) VALUES (?,?,?,?,?)').run(code, name, vendor_id, Date.now() + 3 * 86400000, by)
    return code
  }
  function consumeCode(code, uid) {
    const r = db.prepare('SELECT * FROM contractor_link_codes WHERE code=? AND expires >= ?').get(String(code), Date.now())
    if (!r) return null
    db.prepare('DELETE FROM contractor_link_codes WHERE code=?').run(r.code)
    db.prepare("UPDATE contractor_line SET status='ปิด' WHERE line_uid=?").run(uid)
    db.prepare("DELETE FROM contractor_line WHERE line_uid=?").run(uid)
    db.prepare("UPDATE contractor_line SET status='ปิด' WHERE name=? AND status='ใช้งาน'").run(r.name) // 1 ชื่อ = 1 LINE (ผูกใหม่ = ยกเลิกเครื่องเก่า)
    db.prepare("INSERT INTO contractor_line (name,vendor_id,line_uid,status,linked_at,linked_by) VALUES (?,?,?,'ใช้งาน',?,?)").run(r.name, r.vendor_id, uid, d.nowTS(), r.by)
    return conByLine(uid)
  }

  // ---- ส่งเข้าคิวอนุมัติ ----
  function submitReport(con, ctx) {
    const files = ctx.files || []
    const text = String(ctx.text || '').trim()
    const kind = ctx.kind_r
    let inst = null
    if (kind === 'claim') inst = db.prepare('SELECT * FROM installments WHERE id=?').get(ctx.inst_id)
    const amount = inst ? Math.max(0, (inst.amount || 0) - (inst.paid || 0)) : 0
    const info = db.prepare('INSERT INTO contractor_reports (ts,house_code,contractor,kind,text,files,installment_id,amount,status) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(d.nowTS(), ctx.house, con.name, kind, text.slice(0, 2000), JSON.stringify(files), inst?.id || null, amount, 'รออนุมัติ')
    const rid = info.lastInsertRowid
    if (inst) db.prepare("UPDATE installments SET claim_status='ขอเบิก', claim_at=? WHERE id=?").run(d.nowTS(), inst.id)
    const title = kind === 'claim'
      ? `ช่าง ${con.name} ขอเบิกงวด ${inst.no} บ้าน ${houseName(ctx.house)}`
      : `${KIND_TH[kind]}จากช่าง ${con.name} บ้าน ${houseName(ctx.house)}`
    const lines = [
      ...(kind === 'claim' ? [`${inst.detail || ''} · ยอดคงเหลือ ${money(amount)} บาท (งวดนี้ ${money(inst.amount)})`, 'อนุมัติ = งานงวดนี้ผ่าน บัญชีกดจ่ายได้เลย'] : []),
      ...(text ? [text.slice(0, 300)] : []),
      ...(files.length ? [`รูป ${files.length} รูป`] : []),
    ]
    const reqId = center.submit({ kind: 'contractor_line', op: 'con_' + (kind === 'claim' ? 'claim' : kind === 'progress' ? 'progress' : 'problem'), house_code: ctx.house, title, lines, params: { report_id: rid }, body: { files: files.map((f) => f.id) }, by: con.name + ' (ช่าง LINE)' })
    db.prepare('UPDATE contractor_reports SET request_id=? WHERE id=?').run(reqId, rid)
    return reqId
  }

  // อนุมัติ → ทำรายการจริง
  const reportOf = (req) => db.prepare('SELECT * FROM contractor_reports WHERE id=?').get(Number(req.params?.report_id))
  const filesOk = (rep) => { for (const f of jparse(rep.files) || []) db.prepare('UPDATE files SET category=? WHERE id=? AND category=?').run(OK_DIR, f.id, PENDING_DIR) }
  center.registerOp('con_progress', (req, res) => {
    const rep = reportOf(req); if (!rep) return res.status(404).json({ error: 'ไม่พบรายงาน' })
    filesOk(rep)
    db.prepare("UPDATE contractor_reports SET status='อนุมัติ' WHERE id=?").run(rep.id)
    res.json({ ok: true })
  }, (cr, st, reason) => decided(cr, st, reason))
  center.registerOp('con_problem', (req, res) => {
    const rep = reportOf(req); if (!rep) return res.status(404).json({ error: 'ไม่พบรายงาน' })
    filesOk(rep)
    const title = (rep.kind === 'material' ? 'ขอวัสดุ: ' : '') + (String(rep.text || '').split('\n')[0].slice(0, 120) || 'ช่างแจ้งปัญหา (มีรูป)')
    const note = `แจ้งโดยช่าง ${rep.contractor} ทาง LINE${(jparse(rep.files) || []).length ? ` · รูปอยู่ในไฟล์ของบ้าน หมวด "${OK_DIR}"` : ''}\n${rep.text || ''}`
    db.prepare('INSERT INTO issues (house_code,title,note,by,date,priority,status) VALUES (?,?,?,?,?,?,?)').run(rep.house_code, title, note.slice(0, 2000), rep.contractor + ' (ช่าง)', d.todayTH(), 'ทั่วไป', 'รอช่าง')
    db.prepare("UPDATE contractor_reports SET status='อนุมัติ' WHERE id=?").run(rep.id)
    res.json({ ok: true })
  }, (cr, st, reason) => decided(cr, st, reason))
  center.registerOp('con_claim', (req, res) => {
    const rep = reportOf(req); if (!rep) return res.status(404).json({ error: 'ไม่พบรายงาน' })
    filesOk(rep)
    db.prepare("UPDATE installments SET claim_status='อนุมัติเบิก', claim_at=? WHERE id=?").run(d.nowTS(), rep.installment_id)
    db.prepare("UPDATE contractor_reports SET status='อนุมัติ' WHERE id=?").run(rep.id)
    // แจ้งบัญชีให้ไปจ่าย
    const inst = db.prepare('SELECT * FROM installments WHERE id=?').get(rep.installment_id)
    const msg = `💸 อนุมัติเบิกงวดช่างแล้ว — จ่ายได้เลย\nบ้าน ${houseName(rep.house_code)} · ช่าง ${rep.contractor}\nงวด ${inst?.no ?? '-'} ${inst?.detail || ''} · ยอด ${money(rep.amount)} บาท\n— ERP → บ้าน → งวดงาน → กดจ่าย (ไม่ต้องขออนุมัติซ้ำ)`
    for (const u of db.prepare("SELECT line_uid FROM users WHERE role='accounting' AND line_uid IS NOT NULL AND COALESCE(status,'ใช้งาน')='ใช้งาน'").all()) d.linePush(u.line_uid, msg).catch?.(() => {})
    res.json({ ok: true })
  }, (cr, st, reason) => decided(cr, st, reason))
  function decided(cr, st, reason) {
    const rid = (jparse(cr.params) || {}).report_id
    const rep = db.prepare('SELECT * FROM contractor_reports WHERE id=?').get(rid)
    if (!rep) return
    if (st !== 'อนุมัติ') {
      db.prepare('UPDATE contractor_reports SET status=?, reason=? WHERE id=?').run(st, reason || '', rep.id)
      if (rep.kind === 'claim') db.prepare("UPDATE installments SET claim_status=NULL WHERE id=? AND claim_status='ขอเบิก'").run(rep.installment_id)
    }
    db.prepare('UPDATE contractor_reports SET decided_by=? WHERE id=?').run(cr.decided_by || '', rep.id)
    const con = db.prepare("SELECT line_uid FROM contractor_line WHERE name=? AND status='ใช้งาน'").get(rep.contractor)
    if (!con) return
    const what = `${KIND_TH[rep.kind]} บ้าน ${houseName(rep.house_code)}`
    d.linePush(con.line_uid, st === 'อนุมัติ'
      ? `✅ ${what} ผ่านการตรวจแล้วค่ะ${rep.kind === 'claim' ? `\nฝ่ายบัญชีจะดำเนินการจ่าย ${money(rep.amount)} บาท` : ''}`
      : `↩️ ${what} ยังไม่ผ่านค่ะ${reason ? '\nเหตุผล: ' + reason : ''}\nแก้ไขแล้วส่งใหม่ได้เลยค่ะ`).catch?.(() => {})
  }

  // ---- คุยกับช่าง ----
  const reply = (tok, msg) => d.lineReply(tok, msg)
  const ask = (uid, ctx) => d.setLineCtx(uid, { ...ctx, ttl: CTX_TTL })
  function pickHouseOrGo(uid, con, ctx, tok, next) {
    const hs = housesOf(con)
    if (!hs.length) return reply(tok, 'ยังไม่พบบ้านที่คุณรับงานอยู่ค่ะ — ให้ทีมงาน PPSD เพิ่มชื่อคุณในแท็บ "ช่าง / ผู้รับเหมา" ของบ้านก่อน')
    if (hs.length === 1) { ctx.house = hs[0].house_code; return next(ctx) }
    ask(uid, { ...ctx, step: 'pick_house', ids: hs.slice(0, 9).map((h) => h.house_code) })
    return reply(tok, `บ้านหลังไหนคะ? ตอบตัวเลข\n${hs.slice(0, 9).map((h, i) => `${i + 1}. ${h.name}`).join('\n')}`)
  }
  const collectMsg = (ctx) => `${ctx.kind_r === 'claim' ? '' : '📷 '}ส่งรูปได้สูงสุด ${MAX_IMAGES} รูป และพิมพ์รายละเอียดได้เลย\nเสร็จแล้วพิมพ์ 'ส่ง' · ยกเลิกพิมพ์ 'ยกเลิก'`
  const startCollect = (uid, tok) => (ctx) => {
    ask(uid, { ...ctx, step: 'collect' })
    const h = houseName(ctx.house)
    if (ctx.kind_r === 'progress') return reply(tok, `รายงานความคืบหน้า บ้าน ${h}\n${(ctx.files || []).length ? `ได้รูปแล้ว ${ctx.files.length} รูป\n` : ''}${collectMsg(ctx)}`)
    if (ctx.kind_r === 'claim') return claimPick(uid, ctx, tok)
    return reply(tok, `${KIND_TH[ctx.kind_r]} บ้าน ${h}${ctx.text ? `\n"${ctx.text}"` : ''}\n${collectMsg(ctx)}`)
  }
  let conRef = null
  function claimPick(uid, ctx, tok) {
    const list = instsOf(conRef, ctx.house).filter((i) => (i.paid || 0) < (i.amount || 0))
    if (!list.length) { d.setLineCtx(uid, null); return reply(tok, `บ้าน ${houseName(ctx.house)} ไม่มีงวดที่ค้างจ่ายให้คุณค่ะ — พิมพ์ 'งาน' เพื่อดูงวดทั้งหมด`) }
    ask(uid, { ...ctx, step: 'pick_inst', ids: list.slice(0, 9).map((i) => i.id) })
    return reply(tok, `ขอเบิกงวดไหนคะ? ตอบตัวเลข\n${list.slice(0, 9).map((i, k) => `${k + 1}. งวด ${i.no} ${String(i.detail || '').slice(0, 30)} · ${money((i.amount || 0) - (i.paid || 0))} บาท${i.claim_status ? ` (${i.claim_status}แล้ว)` : ''}`).join('\n')}`)
  }
  function workSummary(con) {
    const hs = housesOf(con)
    if (!hs.length) return 'ยังไม่พบบ้านที่คุณรับงานอยู่ค่ะ'
    return hs.slice(0, 6).map((h) => {
      const is = instsOf(con, h.house_code)
      const tot = is.reduce((a, i) => a + (i.amount || 0), 0), paid = is.reduce((a, i) => a + (i.paid || 0), 0)
      return `🏠 ${h.name}${h.role ? ` · ${h.role}` : ''}\n${is.length ? is.map((i) => `  งวด ${i.no} ${String(i.detail || '').slice(0, 24)} ${money(i.amount)} · ${i.status}${i.claim_status && (i.paid || 0) < i.amount ? ` · ${i.claim_status}` : ''}`).join('\n') : '  (ยังไม่ได้ตั้งงวด)'}\n  รวม ${money(tot)} · จ่ายแล้ว ${money(paid)} · ค้าง ${money(tot - paid)} บาท`
    }).join('\n\n')
  }
  function statusSummary(con) {
    const rs = db.prepare('SELECT * FROM contractor_reports WHERE contractor=? ORDER BY id DESC LIMIT 8').all(con.name)
    if (!rs.length) return 'ยังไม่มีเรื่องที่ส่งไว้ค่ะ'
    return 'เรื่องที่คุณส่งล่าสุด:\n' + rs.map((r) => `• ${r.ts.slice(5, 16)} ${KIND_TH[r.kind]} ${houseName(r.house_code)} — ${r.status}${r.reason && r.status === 'ตีกลับ' ? ` (${r.reason})` : ''}`).join('\n')
  }

  function handleText(uid, con, t, tok) {
    conRef = con
    d.setHistoryUser(con.name + ' (ช่าง LINE)')
    const ctx = d.getLineCtx(uid)
    if (/^(ยกเลิก|cancel)$/i.test(t)) { d.setLineCtx(uid, null); return reply(tok, 'ยกเลิกแล้วค่ะ') }
    if (/^(ช่วย|help|\?|เมนู|คำสั่ง|สวัสดี.*)$/i.test(t)) return reply(tok, lt('con.help', { name: con.name }))
    if (/^(งาน|บ้าน|งวด|เงิน|ยอด)$/.test(t)) return reply(tok, workSummary(con))
    if (/^(สถานะ|เรื่องที่ส่ง)$/.test(t)) return reply(tok, statusSummary(con))
    // อยู่ระหว่างเลือก
    if (ctx?.step === 'pick_house' && /^\d{1,2}$/.test(t)) {
      const code = ctx.ids?.[Number(t) - 1]
      if (!code) return reply(tok, `ตอบตัวเลข 1-${ctx.ids?.length || 1} ค่ะ`)
      return startCollect(uid, tok)({ ...ctx, house: code })
    }
    if (ctx?.step === 'pick_inst' && /^\d{1,2}$/.test(t)) {
      const id = ctx.ids?.[Number(t) - 1]
      if (!id) return reply(tok, `ตอบตัวเลข 1-${ctx.ids?.length || 1} ค่ะ`)
      const inst = db.prepare('SELECT * FROM installments WHERE id=?').get(id)
      if (inst.claim_status === 'ขอเบิก' || inst.claim_status === 'อนุมัติเบิก') { d.setLineCtx(uid, null); return reply(tok, `งวด ${inst.no} ${inst.claim_status}ไว้แล้วค่ะ — พิมพ์ 'สถานะ' เพื่อดูผล`) }
      ask(uid, { ...ctx, step: 'collect', inst_id: id })
      return reply(tok, `ขอเบิกงวด ${inst.no} ${inst.detail || ''} ยอด ${money((inst.amount || 0) - (inst.paid || 0))} บาท\n📷 ส่งรูปงานที่เสร็จประกอบได้ (ถ้ามี) แล้วพิมพ์ 'ส่ง' เพื่อส่งให้ทีมงานตรวจค่ะ`)
    }
    if (ctx?.step === 'collect') {
      if (/^(ส่ง|ครบ|เสร็จ|ตกลง|ok|โอเค)$/i.test(t)) {
        if (ctx.kind_r === 'progress' && !(ctx.files || []).length && !ctx.text) return reply(tok, "ยังไม่มีรูปหรือข้อความค่ะ — ส่งรูปงาน หรือพิมพ์รายละเอียดก่อน แล้วพิมพ์ 'ส่ง'")
        if ((ctx.kind_r === 'problem' || ctx.kind_r === 'material') && !ctx.text && !(ctx.files || []).length) return reply(tok, "บอกรายละเอียดก่อนค่ะ — พิมพ์ว่าเกิดอะไร/ต้องการอะไร แล้วพิมพ์ 'ส่ง'")
        d.setLineCtx(uid, null)
        const id = submitReport(con, ctx)
        return reply(tok, `📨 ส่งให้ทีมงานตรวจแล้วค่ะ (เลขที่ #${id})\nทีมงานตรวจแล้วจะแจ้งผลกลับในแชทนี้ · พิมพ์ 'สถานะ' เพื่อดูได้ตลอด`)
      }
      ask(uid, { ...ctx, text: [ctx.text, t].filter(Boolean).join('\n').slice(0, 2000) })
      return reply(tok, `จดไว้แล้วค่ะ${(ctx.files || []).length ? ` (รูป ${ctx.files.length} รูป)` : ''} — พิมพ์เพิ่มหรือส่งรูปเพิ่มได้ · เสร็จแล้วพิมพ์ 'ส่ง'`)
    }
    // คำสั่งเริ่มเรื่องใหม่
    let m
    if ((m = t.match(/^(?:รายงาน|ความคืบหน้า|อัปเดต|อัพเดต|อัพเดท)\s*(.*)$/s))) return pickHouseOrGo(uid, con, { kind_r: 'progress', text: m[1].trim(), files: [] }, tok, startCollect(uid, tok))
    if ((m = t.match(/^(?:แจ้งปัญหา|ปัญหา|แจ้งเหตุ)\s*(.*)$/s))) return pickHouseOrGo(uid, con, { kind_r: 'problem', text: m[1].trim(), files: [] }, tok, startCollect(uid, tok))
    if ((m = t.match(/^(?:ขอของ|ขอวัสดุ|ของหมด|เบิกของ)\s*(.*)$/s))) return pickHouseOrGo(uid, con, { kind_r: 'material', text: m[1].trim(), files: [] }, tok, startCollect(uid, tok))
    if (/^(?:เบิกงวด|ขอเบิก|เบิกเงิน|ขอเงิน|เบิก)$/.test(t)) return pickHouseOrGo(uid, con, { kind_r: 'claim', files: [] }, tok, startCollect(uid, tok))
    return reply(tok, `ไม่เข้าใจคำสั่งค่ะ 🙏\n${lt('con.help', { name: con.name })}`)
  }

  function handleImage(uid, con, img, tok) {
    conRef = con
    d.setHistoryUser(con.name + ' (ช่าง LINE)')
    let ctx = d.getLineCtx(uid)
    // ส่งรูปมาเฉยๆ = เริ่มรายงานความคืบหน้า
    if (!ctx || !['collect', 'pick_house'].includes(ctx.step)) {
      const hs = housesOf(con)
      if (!hs.length) return reply(tok, 'ยังไม่พบบ้านที่คุณรับงานอยู่ค่ะ — ให้ทีมงาน PPSD เพิ่มชื่อคุณในแท็บ "ช่าง / ผู้รับเหมา" ของบ้านก่อน')
      ctx = { kind_r: 'progress', text: '', files: [], step: hs.length === 1 ? 'collect' : 'pick_house', house: hs.length === 1 ? hs[0].house_code : '', ids: hs.slice(0, 9).map((h) => h.house_code) }
    }
    if ((ctx.files || []).length >= MAX_IMAGES) return reply(tok, `ครบ ${MAX_IMAGES} รูปแล้วค่ะ — พิมพ์ 'ส่ง'`)
    const f = d.saveImageFile(img, { house_code: ctx.house || '', name: `ช่าง-${con.name}-${Date.now()}.jpg`, category: PENDING_DIR, uploader: con.name + ' (ช่าง LINE)' })
    ctx.files = [...(ctx.files || []), { id: Number(f.id), name: f.name }]
    ask(uid, ctx)
    if (ctx.step === 'pick_house') return reply(tok, `📷 ได้รูปที่ ${ctx.files.length} แล้วค่ะ — รูปของบ้านหลังไหนคะ? ตอบตัวเลข\n${ctx.ids.map((c, i) => `${i + 1}. ${houseName(c)}`).join('\n')}`)
    return reply(tok, `📷 ได้รูปที่ ${ctx.files.length}/${MAX_IMAGES} แล้วค่ะ (${KIND_TH[ctx.kind_r]} บ้าน ${houseName(ctx.house)}) — พิมพ์รายละเอียดได้ · เสร็จแล้วพิมพ์ 'ส่ง'`)
  }
  // เลือกบ้านทีหลัง (ส่งรูปก่อน) → ย้ายรูปที่ยังไม่ผูกบ้านไปบ้านที่เลือก
  function fixFilesHouse(ctx) { for (const f of ctx.files || []) db.prepare("UPDATE files SET house_code=? WHERE id=? AND COALESCE(house_code,'')=''").run(ctx.house, f.id) }

  // ---- API หน้าเว็บ (แอดมิน/ผู้จัดการ/บัญชี) ----
  const canManage = (u) => !!u && (u.role === 'admin' || u.role === 'accounting' || d.isManager(u))
  function register(api) {
    api.get('/contractor-line', (req, res) => {
      if (!canManage(req.user)) return res.status(403).json({ error: 'เฉพาะแอดมิน/ผู้จัดการ/บัญชี' })
      const linked = db.prepare("SELECT id,name,vendor_id,status,linked_at,linked_by FROM contractor_line WHERE status='ใช้งาน' ORDER BY name").all()
        .map((c) => ({ ...c, houses: housesOf(c).map((h) => h.name) }))
      res.json({ linked })
    })
    api.post('/contractor-line/code', (req, res) => {
      if (!canManage(req.user)) return res.status(403).json({ error: 'ออกรหัสได้เฉพาะแอดมิน/ผู้จัดการ/บัญชี' })
      const name = String(req.body?.name || '').trim()
      if (!name) return res.status(400).json({ error: 'กรุณาระบุชื่อช่าง' })
      const code = newCode({ name, vendor_id: Number(req.body?.vendor_id) || null, by: req.user.name })
      d.audit(req, 'ออกรหัสผูก LINE ช่าง', name)
      res.json({ code, name, expires_days: 3 })
    })
    api.post('/contractor-line/:id/disable', (req, res) => {
      if (!canManage(req.user)) return res.status(403).json({ error: 'เฉพาะแอดมิน/ผู้จัดการ/บัญชี' })
      const c = db.prepare('SELECT * FROM contractor_line WHERE id=?').get(req.params.id)
      if (!c) return res.status(404).json({ error: 'ไม่พบ' })
      db.prepare("UPDATE contractor_line SET status='ปิด' WHERE id=?").run(c.id)
      d.audit(req, 'ยกเลิกการผูก LINE ช่าง', c.name)
      res.json({ ok: true })
    })
  }

  return {
    byLine: conByLine,
    consumeCode,
    handleText: (uid, con, t, tok) => {
      const before = d.getLineCtx(uid)
      const r = handleText(uid, con, t, tok)
      const after = d.getLineCtx(uid)
      if (before?.step === 'pick_house' && after?.house) fixFilesHouse(after)
      return r
    },
    handleImage,
    register,
  }
}
