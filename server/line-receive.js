// ตรวจรับของผ่าน LINE (แบบ A: ไม่ครบ = ยังไม่รับ · ผู้จัดการยอมรับตามที่ได้ หรือรอของที่ขาดแล้วตรวจรับใหม่)
//  1) "รับของ PO-69-0123" (หรือ "รับของ" แล้วเลือกจากรายการ PO ที่อนุมัติแล้วรอส่งของ)
//  2) ส่งรูปใบส่งของ/ใบกำกับภาษี + รูปของที่ได้รับ → พิมพ์ "ครบ"
//  3) AI อ่านเอกสาร (ไม่นับจำนวนจากรูปของ — รูปของเก็บเป็นหลักฐาน + ทักเฉพาะที่ผิดชัดๆ) → เทียบ PO → ส่งสรุป
//  4) หน้างานยืนยัน "ของครบ" / "ขาด …" / "ไม่ตรง …" → บันทึกผลตรวจรับ (ต้นทุนเข้าบ้าน · ลงบัญชี · ภาษีซื้อ)
//  5) ไม่ครบ/ไม่ตรง → แจ้งจัดซื้อ + ผู้จัดการ (ปุ่ม "ยอมรับตามที่ได้")
//  ใบกำกับมาทีหลัง: "ใบกำกับ PO-69-0123" แล้วส่งรูป → เติมเลขใบกำกับ/VAT ให้ PO เดิม
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const MAX_IMAGES = 10
const RECV_TTL = 6 * 60 * 60 * 1000 // ร่างตรวจรับค้างได้ 6 ชม.

export function createLineReceive(d) {
  const { db } = d
  const n = (v) => Number(String(v ?? 0).replace(/,/g, '')) || 0
  const canReceive = (u) => !!u && (['admin', 'accounting', 'site'].includes(u.role) || d.isManager(u))
  const findPo = (txt) => {
    const m = String(txt || '').trim().toUpperCase().match(/^PO-?(.+)$/)
    return m ? db.prepare('SELECT * FROM purchase_orders WHERE no=?').get('PO-' + m[1]) : null
  }
  const houseName = (code) => (code ? db.prepare('SELECT name FROM houses WHERE code=?').get(code)?.name || code : 'ไม่ผูกบ้าน (เข้าสต๊อก)')
  const poReady = (po) => po && po.status !== 'ยกเลิก' && (!d.controls().enforce_approval_flow || d.approvalState('po', po.id).done)
  // PO ที่รอรับของ (อนุมัติครบแล้ว ยังไม่ได้รับ)
  const waitingPos = () => db.prepare("SELECT * FROM purchase_orders WHERE status='รอส่งของ' ORDER BY id DESC LIMIT 40").all().filter(poReady).slice(0, 6)
  const fileData = (id) => {
    const f = db.prepare('SELECT * FROM files WHERE id=?').get(id)
    if (!f?.path || !existsSync(join(d.uploadsDir(), f.path))) return null
    return { mime: f.mime || 'image/jpeg', b64: readFileSync(join(d.uploadsDir(), f.path)).toString('base64') }
  }

  function startReceive(uid, po, replyToken) {
    if (!po) return d.lineReply(replyToken, 'ไม่พบใบสั่งซื้อนี้ค่ะ — พิมพ์ เช่น "รับของ PO-69-0123" หรือ "รับของ" เพื่อดูรายการที่รอรับ')
    if (po.status === 'ยกเลิก') return d.lineReply(replyToken, `${po.no} ถูกยกเลิกแล้วค่ะ`)
    if (po.status === 'รับของแล้ว' || po.status === 'ปิดงาน') return d.lineReply(replyToken, `${po.no} รับของไปแล้วค่ะ (ถ้าใบกำกับภาษีมาทีหลัง พิมพ์ "ใบกำกับ ${po.no}")`)
    if (!poReady(po)) return d.lineReply(replyToken, `${po.no} ยังอนุมัติไม่ครบค่ะ — ให้อนุมัติ PO ก่อนจึงตรวจรับได้`)
    d.setLineCtx(uid, { kind: 'recv', po_id: po.id, files: [], stage: 'collect', ttl: RECV_TTL })
    const items = d.orderItemsForPo(po).slice(0, 8).map((it, i) => `${i + 1}. ${it.desc}${it.qty ? ` ${it.qty} ${it.unit || ''}` : ''}`).join('\n')
    return d.lineReply(replyToken, `📦 ตรวจรับ ${po.no} · ${po.vendor}\nบ้าน: ${houseName(po.house_code)}\nรายการที่สั่ง:\n${items}\n\nส่งรูป 📄 ใบส่งของ/ใบกำกับภาษี และ 📷 รูปของที่ได้รับ (ไม่เกิน ${MAX_IMAGES} รูป)\nส่งครบแล้วพิมพ์ 'ครบ' · ยกเลิกพิมพ์ 'ยกเลิก'`)
  }

  // ให้ AI อ่านรูปทั้งหมด: แยกเอกสาร/รูปของ · อ่านรายการ + เลขใบกำกับ + VAT จากเอกสาร · ทักของที่ผิดชัดๆ จากรูปของ
  async function analyze(po, fileIds, byName) {
    const orderLines = d.orderItemsForPo(po).map((it) => `- ${it.desc}${it.qty ? ` ${it.qty} ${it.unit || ''}` : ''}${it.price ? ` @${it.price}` : ''}`).join('\n')
    let parsed = null
    if (process.env.PPSD_AI_MOCK_RECEIPT_LINE) parsed = JSON.parse(process.env.PPSD_AI_MOCK_RECEIPT_LINE) // ชุดทดสอบ
    else if (d.aiKey()) {
      const media = fileIds.map(fileData).filter(Boolean).map((f) => ({ type: 'image', source: { type: 'base64', media_type: f.mime.startsWith('image/') ? f.mime : 'image/jpeg', data: f.b64 } }))
      const prompt = `คุณเป็นผู้ช่วยตรวจรับวัสดุก่อสร้าง รูปที่แนบ ${media.length} รูป (เรียงลำดับ 1..${media.length}) มีทั้ง "เอกสาร" (ใบส่งของ / ใบกำกับภาษี / ใบเสร็จ) และ "รูปของที่ได้รับ"
ใบสั่งซื้อ ${po.no} ร้าน ${po.vendor} สั่งไว้:
${orderLines}

ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น:
{"doc_images":[1],"goods_images":[2,3],"doc_types":["ใบกำกับภาษี"],"vendor":"ชื่อร้านในเอกสาร","tax_invoice_no":"เลขที่ใบกำกับภาษี (ถ้าเป็นใบกำกับภาษี)","doc_no":"เลขที่ใบส่งของ","items":[{"name":"ชื่อสินค้า","qty":10,"unit":"ถุง","price":143,"amount":1430}],"before_vat":0,"vat":0,"total":0,"goods_concerns":["สิ่งที่เห็นชัดว่าไม่ตรงกับที่สั่ง"]}
กติกา:
- items / vat / total อ่านจาก "เอกสาร" เท่านั้น — ห้ามประเมินจำนวนจากรูปของ · ตัวเลขไม่มีคอมม่า · ถ้าไม่มีเอกสารเลย items = []
- tax_invoice_no ใส่เฉพาะเมื่อเอกสารเป็น "ใบกำกับภาษี" จริง · vat = ภาษีมูลค่าเพิ่มที่ระบุในเอกสาร (ไม่มี = 0)
- goods_concerns ใส่เฉพาะที่เห็นชัดในรูปของ เช่น ยี่ห้อ/ขนาด/ชนิดต่างจากที่สั่ง หรือของเสียหาย · ไม่ต้องนับจำนวน · ไม่มีให้ []`
      const ai = await d.aiAsk({ feature: 'ตรวจรับของผ่าน LINE', by: byName, media, prompt, maxTokens: 16000 })
      if (!ai.ok) return { error: ai.error }
      parsed = d.extractJsonBlock(ai.text)
    } else return { no_ai: true, items: [], concerns: [] }
    const items = (Array.isArray(parsed?.items) ? parsed.items : []).map((it) => {
      const qty = n(it.qty), amount = n(it.amount)
      let price = n(it.price)
      if (!price && amount && qty) price = Math.round((amount / qty) * 100) / 100
      return { name: String(it.name || '').trim(), qty, unit: String(it.unit || ''), price, amount: amount || qty * price }
    }).filter((it) => it.name)
    const idx = (a) => (Array.isArray(a) ? a.map(Number).filter((x) => x >= 1 && x <= fileIds.length) : [])
    return {
      items, vendor: String(parsed?.vendor || ''), doc_types: Array.isArray(parsed?.doc_types) ? parsed.doc_types.map(String).slice(0, 4) : [],
      tax_invoice_no: String(parsed?.tax_invoice_no || '').trim().slice(0, 60), doc_no: String(parsed?.doc_no || '').trim().slice(0, 60),
      vat: n(parsed?.vat), total: n(parsed?.total),
      doc_files: idx(parsed?.doc_images).map((i) => fileIds[i - 1]), goods_files: idx(parsed?.goods_images).map((i) => fileIds[i - 1]),
      concerns: (Array.isArray(parsed?.goods_concerns) ? parsed.goods_concerns : []).map(String).filter(Boolean).slice(0, 5),
    }
  }

  function summaryText(po, ai, detail) {
    const L = [`📦 ผลตรวจ ${po.no} · ${po.vendor}`, `บ้าน: ${houseName(po.house_code)}`]
    if (ai.items.length) {
      L.push(`เอกสาร: ${ai.doc_types.join(', ') || 'ใบส่งของ'}${ai.tax_invoice_no ? ` · ใบกำกับ ${ai.tax_invoice_no}` : ''}${ai.vat ? ` · VAT ${d.fmtMoney(ai.vat)}` : ''}`)
      L.push('เทียบกับ PO:')
      for (const l of detail.lines.slice(0, 12)) {
        if (l.pass) L.push(`✓ ${l.desc}${l.qty ? ` ${l.qty} ${l.unit}` : ''}`)
        else if (!l.nameOk) L.push(`✗ ${l.desc} — ไม่พบในเอกสาร`)
        else L.push(`✗ ${l.desc} — PO ${l.qty || '-'} / เอกสาร ${l.d_qty ?? '-'}${l.priceOk === false ? ` · ราคา ${d.fmtMoney(l.price)} → ${d.fmtMoney(l.d_price)}` : ''}`)
      }
      for (const x of detail.extras.slice(0, 5)) L.push(`+ เกินจาก PO: ${x.name} ${x.qty || ''} ${x.unit || ''}`)
      if (detail.totalDelivery) L.push(`ยอด PO ${d.fmtMoney(detail.totalOrder)} / เอกสาร ${d.fmtMoney(detail.totalDelivery)}${detail.totalOk === false ? ` (ต่างเกิน ${detail.tolPct}%)` : ''}`)
      L.push(detail.result === 'ผ่าน' ? '📄 เอกสารตรงกับ PO' : '⚠️ เอกสารไม่ตรงกับ PO')
    } else L.push(ai.no_ai ? '⚠️ ยังไม่ได้ตั้งค่า AI — อ่านเอกสารให้ไม่ได้' : '⚠️ ไม่พบใบส่งของ/ใบกำกับภาษีในรูป — ส่งรูปเอกสารเพิ่มแล้วพิมพ์ "ครบ" อีกครั้งได้')
    if (ai.goods_files?.length) L.push(`📷 รูปของ ${ai.goods_files.length} รูป`)
    for (const c of ai.concerns) L.push(`⚠️ จากรูปของ: ${c}`)
    L.push('', 'ตรวจของจริงแล้วตอบ:', "• 'ของครบ' — ได้ครบตามนี้", "• 'ขาด …' เช่น 'ขาด เหล็ก 12 มม. 2 เส้น'", "• 'ไม่ตรง …' เช่น 'ไม่ตรง ปูนผิดยี่ห้อ'", "• 'ยกเลิก' — ทิ้งร่าง")
    return L.join('\n')
  }

  async function runAnalyze(uid, u, ctx, replyToken) {
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(ctx.po_id)
    if (!po) { d.setLineCtx(uid, null); return d.lineReply(replyToken, 'ไม่พบใบสั่งซื้อแล้วค่ะ') }
    await d.lineReply(replyToken, `🔎 กำลังให้ AI อ่านเอกสาร ${ctx.files.length} รูป เทียบกับ ${po.no} — สักครู่ค่ะ`)
    const ai = await analyze(po, ctx.files, u.name)
    if (ai.error) return d.linePush(uid, '❌ AI อ่านเอกสารไม่สำเร็จ: ' + ai.error + "\nพิมพ์ 'ครบ' เพื่อลองใหม่ หรือตอบ 'ของครบ' เพื่อยืนยันรับตาม PO (ไม่มีเอกสาร)")
    const detail = ai.items.length ? d.matchReceipt(d.orderItemsForPo(po), ai.items, po) : null
    d.setLineCtx(uid, { ...ctx, stage: 'confirm', ai: { ...ai, doc_result: detail?.result || null }, ttl: RECV_TTL })
    return d.linePush(uid, summaryText(po, ai, detail || { lines: [], extras: [] }))
  }

  async function finalize(uid, u, ctx, complete, siteNote, replyToken) {
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(ctx.po_id)
    if (!po) { d.setLineCtx(uid, null); return d.lineReply(replyToken, 'ไม่พบใบสั่งซื้อแล้วค่ะ') }
    if (po.status === 'รับของแล้ว' || po.status === 'ปิดงาน') { d.setLineCtx(uid, null); return d.lineReply(replyToken, `${po.no} รับของไปแล้วค่ะ`) }
    const ai = ctx.ai || { items: [], concerns: [] }
    const orderItems = d.orderItemsForPo(po)
    let deliveryItems = ai.items || [], forceResult = null, note = ''
    if (!deliveryItems.length) {
      // ไม่มีเอกสาร: ยืนยันครบ = รับตาม PO (บันทึกว่าไม่มีใบส่งของ) · ไม่ครบ = ไม่ผ่าน
      deliveryItems = orderItems.map((o) => ({ name: o.desc, qty: o.qty, unit: o.unit, price: o.price, amount: (o.qty > 0 ? o.qty * o.price : o.price) }))
      forceResult = complete ? 'ผ่าน' : 'ไม่ผ่าน'
      note = 'ไม่มีใบส่งของ/ใบกำกับ — หน้างานยืนยันตาม PO'
    } else if (!complete) forceResult = 'ไม่ผ่าน'
    const fileRec = (id) => { const f = db.prepare('SELECT id, name FROM files WHERE id=?').get(id); return f ? { id: f.id, name: f.name } : null }
    const docIds = ai.doc_files?.length ? ai.doc_files : ctx.files.filter((id) => !(ai.goods_files || []).includes(id))
    const r = d.recordGoodsReceipt(po, {
      deliveryItems, files: docIds.map(fileRec).filter(Boolean), byName: u.name, source: 'line', forceResult,
      note: [note, siteNote ? 'หน้างาน: ' + siteNote : (complete ? 'หน้างาน: ของครบ' : ''), ai.concerns?.length ? 'AI ทักจากรูป: ' + ai.concerns.join(' · ') : ''].filter(Boolean).join(' · '),
      ext: { tax_invoice_no: ai.tax_invoice_no, vat_amount: ai.vat, site_note: siteNote || (complete ? 'ของครบ' : ''), photos: (ai.goods_files || []).map(fileRec).filter(Boolean) },
    })
    d.setLineCtx(uid, null)
    d.audit({ user: u }, 'ตรวจรับของ (LINE)', `${po.no} → ${r.detail.result}${siteNote ? ' · ' + siteNote : ''}`)
    const head = `${r.detail.result === 'ผ่าน' ? '✅' : '⚠️'} ตรวจรับ ${po.no} · ${po.vendor} — ${r.detail.result === 'ผ่าน' ? 'รับของแล้ว' : 'ยังไม่รับ (ไม่ครบ/ไม่ตรง)'}\nบ้าน: ${houseName(po.house_code)} · รับโดย ${u.name}`
    const why = [siteNote && `หน้างานแจ้ง: ${siteNote}`, ai.doc_result === 'ไม่ผ่าน' && 'เอกสารไม่ตรงกับ PO', note, ...(ai.concerns || []).map((c) => 'AI ทักจากรูป: ' + c)].filter(Boolean).join('\n')
    const money = r.detail.result === 'ผ่าน' ? `\nต้นทุนเข้าบ้านแล้ว ${d.fmtMoney(r.po.amount)} บาท${po.payment_type === 'credit' ? ' · ตั้งเจ้าหนี้รอจ่าย' : ''}${r.po.tax_invoice_no ? `\nใบกำกับ ${r.po.tax_invoice_no}${r.po.vat_amount ? ' · VAT ' + d.fmtMoney(r.po.vat_amount) : ''} → เข้ารายงานภาษีซื้อแล้ว` : "\n(ยังไม่มีเลขใบกำกับ — ได้ใบกำกับแล้วพิมพ์ 'ใบกำกับ " + po.no + "' แล้วส่งรูป)"}` : ''
    const full = head + (why ? '\n' + why : '') + money
    // แจ้งจัดซื้อ (ผู้รับใบ PR) · ไม่ผ่าน → แจ้งผู้จัดการพร้อมปุ่ม "ยอมรับตามที่ได้"
    const sent = new Set([uid])
    for (const x of d.docRecipients()) if (x.line_uid && !sent.has(x.line_uid)) { sent.add(x.line_uid); d.linePush(x.line_uid, full) }
    if (r.detail.result !== 'ผ่าน') {
      const card = { type: 'template', altText: `ตรวจรับ ${po.no} ไม่ครบ/ไม่ตรง`, template: { type: 'buttons', text: `${po.no} ไม่ครบ/ไม่ตรง — ยอมรับตามที่ได้ หรือรอร้านส่งของที่ขาดแล้วตรวจรับใหม่`.slice(0, 160), actions: [{ type: 'postback', label: 'ยอมรับตามที่ได้', data: `gr:${r.receipt_id}:accept` }] } }
      for (const m of d.lineApprovers('')) if (m.line_uid && m.line_uid !== uid) d.linePush(m.line_uid, sent.has(m.line_uid) ? [card] : [full, card])
    }
    return d.lineReply(replyToken, full + (r.detail.result === 'ผ่าน' ? '' : "\n\nแจ้งจัดซื้อ/ผู้จัดการแล้ว — ร้านส่งของที่ขาดมาแล้วพิมพ์ 'รับของ " + po.no + "' ตรวจรับใหม่ได้"))
  }

  // ใบกำกับภาษีมาทีหลัง → อ่านเลขใบกำกับ/VAT → เติมให้ PO (+ รายจ่าย/ภาษีซื้อถ้ารับของแล้ว)
  async function readTaxInvoice(uid, u, ctx, fileId, replyToken) {
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(ctx.po_id)
    d.setLineCtx(uid, null)
    if (!po) return d.lineReply(replyToken, 'ไม่พบใบสั่งซื้อแล้วค่ะ')
    const ai = await analyze(po, [fileId], u.name)
    if (ai.error || ai.no_ai) return d.lineReply(replyToken, `อ่านใบกำกับไม่สำเร็จค่ะ (${ai.error || 'ยังไม่ได้ตั้งค่า AI'}) — กรอกเลขใบกำกับในหน้าเว็บแทนได้`)
    if (!ai.tax_invoice_no) return d.lineReply(replyToken, `ไม่พบเลขที่ใบกำกับภาษีในรูปค่ะ — ลองถ่ายใหม่ให้เห็นหัวเอกสารชัดๆ แล้วพิมพ์ "ใบกำกับ ${po.no}" อีกครั้ง`)
    db.prepare('UPDATE purchase_orders SET tax_invoice_no=? WHERE id=?').run(ai.tax_invoice_no, po.id)
    if (ai.vat > 0 && ai.vat < (Number(po.amount) || Infinity)) db.prepare('UPDATE purchase_orders SET vat_amount=? WHERE id=?').run(ai.vat, po.id)
    const po2 = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(po.id)
    d.syncPoExpense(po2)
    const gr = db.prepare('SELECT id, files FROM goods_receipts WHERE po_id=? ORDER BY id DESC').get(po.id)
    if (gr) { const fs = (() => { try { return JSON.parse(gr.files || '[]') } catch { return [] } })(); const f = db.prepare('SELECT id, name FROM files WHERE id=?').get(fileId); if (f) db.prepare('UPDATE goods_receipts SET files=?, tax_invoice_no=?, vat_amount=? WHERE id=?').run(JSON.stringify([...fs, f]), ai.tax_invoice_no, ai.vat || 0, gr.id) }
    d.audit({ user: u }, 'เพิ่มใบกำกับภาษี (LINE)', `${po.no} · ${ai.tax_invoice_no}${ai.vat ? ' · VAT ' + ai.vat : ''}`)
    const received = po2.status === 'รับของแล้ว' || po2.status === 'ปิดงาน'
    return d.lineReply(replyToken, `🧾 บันทึกใบกำกับ ${ai.tax_invoice_no} ให้ ${po.no} แล้ว${ai.vat ? ` · VAT ${d.fmtMoney(ai.vat)}` : ''}${received ? '\nเข้ารายงานภาษีซื้อแล้วค่ะ' : "\n(ยังไม่ได้รับของ — พอตรวจรับแล้วจะเข้ารายงานภาษีซื้อเอง)"}`)
  }

  return {
    help: "\n\nรับของ:\n• รับของ PO-69-0123 (หรือ 'รับของ' แล้วเลือก) → ส่งรูปใบส่งของ/ใบกำกับ + รูปของ → 'ครบ' → AI เทียบกับ PO → ตอบ 'ของครบ' / 'ขาด …'\n• ใบกำกับ PO-69-0123 → ส่งรูปใบกำกับภาษีที่มาทีหลัง",
    // คืน promise ถ้าจัดการข้อความนี้แล้ว · null = ไม่ใช่เรื่องรับของ
    handleText(uid, u, t, replyToken, ctx) {
      const cmd = t.match(/^(?:รับของ|ตรวจรับ(?:ของ)?)\s*(PO-?\S+)?\s*$/i)
      if (cmd) {
        if (!canReceive(u)) return d.lineReply(replyToken, 'ตรวจรับของได้เฉพาะหน้างาน/จัดซื้อ/บัญชี/ผู้จัดการค่ะ')
        if (cmd[1]) return startReceive(uid, findPo(cmd[1]), replyToken)
        const w = waitingPos()
        if (!w.length) return d.lineReply(replyToken, 'ตอนนี้ไม่มีใบสั่งซื้อที่อนุมัติแล้วรอรับของค่ะ')
        if (w.length === 1) return startReceive(uid, w[0], replyToken)
        d.setLineCtx(uid, { kind: 'recv_pick', ids: w.map((p) => p.id) })
        return d.lineReply(replyToken, `รับของของใบไหนคะ? ตอบตัวเลข\n${w.map((p, i) => `${i + 1}. ${p.no} ${p.vendor} · ${houseName(p.house_code)} · ${String(p.item || '').slice(0, 30)}`).join('\n')}`)
      }
      const tax = t.match(/^ใบกำกับ(?:ภาษี)?\s*(PO-?\S+)\s*$/i)
      if (tax) {
        if (!canReceive(u)) return d.lineReply(replyToken, 'เพิ่มใบกำกับได้เฉพาะหน้างาน/จัดซื้อ/บัญชี/ผู้จัดการค่ะ')
        const po = findPo(tax[1])
        if (!po || po.status === 'ยกเลิก') return d.lineReply(replyToken, 'ไม่พบใบสั่งซื้อนี้ค่ะ')
        d.setLineCtx(uid, { kind: 'taxinv', po_id: po.id, ttl: RECV_TTL })
        return d.lineReply(replyToken, `ส่งรูปใบกำกับภาษีของ ${po.no} (${po.vendor}) มาได้เลยค่ะ`)
      }
      if (ctx?.kind === 'recv_pick' && /^\d{1,2}$/.test(t)) {
        const id = ctx.ids?.[Number(t) - 1]
        if (!id) return d.lineReply(replyToken, `ตอบตัวเลข 1-${ctx.ids?.length || 1} ค่ะ`)
        return startReceive(uid, db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(id), replyToken)
      }
      if (ctx?.kind === 'taxinv' && /^(ยกเลิก|cancel)$/i.test(t)) { d.setLineCtx(uid, null); return d.lineReply(replyToken, 'ยกเลิกแล้วค่ะ') }
      if (ctx?.kind !== 'recv') return null
      if (/^(ยกเลิก|cancel|ทิ้ง)$/i.test(t)) { d.setLineCtx(uid, null); return d.lineReply(replyToken, 'ยกเลิกร่างตรวจรับแล้วค่ะ (รูปที่ส่งมายังเก็บไว้ในไฟล์ของบ้าน)') }
      if (ctx.stage === 'collect') {
        if (/^(ครบ|เสร็จ|ส่งครบ|ตรวจ|ตรวจเลย|ok|โอเค|ตกลง|พอ)$/i.test(t)) {
          if (!ctx.files.length) return d.lineReply(replyToken, `ยังไม่มีรูปค่ะ — ส่งรูปใบส่งของ/ใบกำกับภาษี และรูปของที่ได้รับก่อน`)
          return runAnalyze(uid, u, ctx, replyToken)
        }
        if (t.length > 20) return null // ข้อความยาว = เรื่องอื่น (เช่น สั่งของใหม่) ให้ตัวจัดการอื่นทำต่อ
        return d.lineReply(replyToken, `ส่งรูปใบส่งของ/ใบกำกับภาษี และรูปของที่ได้รับ (ได้ ${ctx.files.length}/${MAX_IMAGES} รูปแล้ว) · ครบแล้วพิมพ์ 'ครบ' · ยกเลิกพิมพ์ 'ยกเลิก'`)
      }
      // stage confirm: หน้างานยืนยันผล
      if (/^(ของ)?ครบ(แล้ว)?(\s*ค่ะ|\s*ครับ)?$|^(ตกลง|ok|โอเค|ถูกต้อง|ผ่าน|ได้ครบ)$/i.test(t)) return finalize(uid, u, ctx, true, '', replyToken)
      if (/^(ขาด|ไม่ครบ|ไม่ตรง|ผิด|เสีย|ชำรุด|แตก|เกิน|ได้ไม่ครบ)/.test(t)) return finalize(uid, u, ctx, false, t.slice(0, 300), replyToken)
      if (t.length > 40) return null
      return d.lineReply(replyToken, "ตอบ 'ของครบ' หรือ 'ขาด …' / 'ไม่ตรง …' ค่ะ (หรือส่งรูปเอกสารเพิ่ม · 'ยกเลิก' เพื่อทิ้งร่าง)")
    },
    // รูปที่ส่งมาระหว่างตรวจรับ → เก็บเป็นไฟล์ของบ้าน · null = ไม่ได้อยู่ในขั้นรับของ
    handleImage(uid, u, img, replyToken, ctx) {
      if (ctx?.kind === 'taxinv') {
        const po = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(ctx.po_id)
        const f = d.saveImageFile(img, { house_code: po?.house_code || '', name: `ใบกำกับ-${po?.no || ''}-${Date.now()}.jpg`, category: 'ใบกำกับภาษี/ใบส่งของ', uploader: u.name })
        return readTaxInvoice(uid, u, ctx, f.id, replyToken)
      }
      if (ctx?.kind !== 'recv') return null
      if (ctx.files.length >= MAX_IMAGES) return d.lineReply(replyToken, `ครบ ${MAX_IMAGES} รูปแล้วค่ะ — พิมพ์ 'ครบ' เพื่อให้ AI ตรวจ`)
      const po = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(ctx.po_id)
      const f = d.saveImageFile(img, { house_code: po?.house_code || '', name: `ตรวจรับ-${po?.no || ''}-${ctx.files.length + 1}.jpg`, category: 'ตรวจรับของ', uploader: u.name })
      const next = { ...ctx, files: [...ctx.files, f.id], stage: 'collect', ttl: RECV_TTL }
      d.setLineCtx(uid, next)
      return d.lineReply(replyToken, `📷 รับรูปที่ ${next.files.length} แล้วค่ะ${ctx.stage === 'confirm' ? ' — มีรูปเพิ่ม จะให้ AI ตรวจใหม่ทั้งหมด' : ''} · ส่งเพิ่มได้ หรือพิมพ์ 'ครบ'`)
    },
    // ปุ่ม "ยอมรับตามที่ได้" (ผู้จัดการ) · null = ไม่ใช่ปุ่มของเรื่องนี้
    handlePostback(uid, u, data, replyToken) {
      const m = String(data || '').match(/^gr:(\d+):accept$/)
      if (!m) return null
      if (!d.isManager(u)) return d.lineReply(replyToken, 'ยอมรับผลตรวจรับได้เฉพาะผู้จัดการ/ผู้บริหารค่ะ')
      const gr = db.prepare('SELECT * FROM goods_receipts WHERE id=?').get(Number(m[1]))
      if (!gr) return d.lineReply(replyToken, 'ไม่พบใบตรวจรับนี้ค่ะ')
      const po = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(gr.po_id)
      if (!po || po.status === 'ยกเลิก') return d.lineReply(replyToken, 'ใบสั่งซื้อนี้ถูกยกเลิก/ลบไปแล้วค่ะ')
      if (po.status === 'รับของแล้ว' || po.status === 'ปิดงาน') return d.lineReply(replyToken, `${po.no} รับของไปแล้วค่ะ`)
      const latest = db.prepare('SELECT id FROM goods_receipts WHERE po_id=? ORDER BY id DESC').get(po.id)
      if (latest && latest.id !== gr.id) return d.lineReply(replyToken, `${po.no} มีการตรวจรับรอบใหม่กว่าแล้วค่ะ — ดูในหน้าเว็บ`)
      const po2 = d.overrideGoodsReceipt(gr, 'ผ่าน', u.name, [gr.note, `ยอมรับตามที่ได้ (ผ่าน LINE โดย ${u.name})`].filter(Boolean).join(' · '))
      d.audit({ user: u }, 'ยอมรับผลตรวจรับตามที่ได้ (LINE)', `${po.no}`)
      const rcv = db.prepare('SELECT line_uid FROM users WHERE name=? AND line_uid IS NOT NULL').get(gr.by)
      if (rcv?.line_uid && rcv.line_uid !== uid) d.linePush(rcv.line_uid, `✅ ${u.name} ยอมรับ ${po.no} ตามที่ได้แล้ว — รับของเรียบร้อย`)
      return d.lineReply(replyToken, `✅ ยอมรับ ${po.no} ตามที่ได้แล้ว — รับของเรียบร้อย ต้นทุน ${d.fmtMoney(po2.amount)} บาทเข้าบ้านแล้ว`)
    },
  }
}
