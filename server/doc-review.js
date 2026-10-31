// ตรวจเอกสารด้วย AI (เน้นสัญญาที่ให้ลูกค้าอ่านและเซ็น) — ทุกแผนกใช้ได้ ทั้งหน้าเว็บและ LINE
//  - แบบมาตรฐานส่วนกลาง (doc_templates): ชื่อ + กฎของบริษัท + ข้อความตัวอย่าง → AI ใช้เทียบว่าขาดหัวข้อไหน / ใช้คำตามที่บริษัทกำหนดไหม
//  - ส่งเอกสาร (Word .docx / PDF / รูป / ข้อความ) → ตรวจเบื้องหลัง (doc_reviews.status) → หน้าเว็บถามผลซ้ำ · LINE ส่งผลกลับเอง
//  - ผล: คำผิด · คำแปลก/ไม่เป็นทางการ · ประโยคกำกวม/ไม่สุภาพ · ข้อมูลขัดกันเอง (ตัวเลข/ตัวอักษร ผลรวมงวด ชื่อ) · หัวข้อที่ขาด
//  - AI ไม่แก้ไฟล์เอง — คนกด "ใช้" / "ข้าม" ทีละจุด แล้วคัดลอกข้อความที่แก้แล้วไปใช้ (เฉพาะเอกสารที่อ่านเป็นข้อความได้)
//  LINE: พิมพ์ "ตรวจเอกสาร" → เลือกแบบ → ส่งไฟล์ Word/PDF, รูป (หลายหน้า แล้วพิมพ์ 'ครบ') หรือวางข้อความ · ส่งไฟล์มาเฉยๆ ก็ตรวจให้
import express from 'express'
import XLSX from 'xlsx'
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const MAX_TEXT = 150000 // ตัวอักษร (สัญญายาวมากๆ ตัดท้าย)
const MAX_IMAGES = 10
const MAX_ISSUES = 150
const CTX_TTL = 2 * 60 * 60 * 1000
export const ISSUE_TYPES = { typo: 'คำผิด', wording: 'คำแปลก/ไม่เป็นทางการ', sentence: 'ประโยคไม่เหมาะ', consistency: 'ข้อมูลไม่ตรงกัน', missing: 'ขาดหัวข้อ' }
const TYPE_ICON = { typo: '🔴', wording: '🟠', sentence: '🟡', consistency: '🟣', missing: '🔵' }
const SEV = ['high', 'medium', 'low']

const xmlText = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&')
/** ดึงข้อความจาก .docx (ทีละย่อหน้า รวมในตาราง) — ไม่ใช่ docx = null */
export function docxText(buf) {
  try {
    const cfb = XLSX.CFB.read(buf, { type: 'buffer' })
    const i = cfb.FullPaths.findIndex((p) => /\/word\/document\.xml$/.test(p))
    if (i < 0) return null
    const xml = Buffer.from(cfb.FileIndex[i].content).toString('utf8')
    const paras = xml.split(/<\/w:p>/).map((p) => {
      let s = ''
      for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>/g)) s += m[1] !== undefined ? m[1] : m[0].startsWith('<w:tab') ? '\t' : '\n'
      return xmlText(s).trim()
    })
    return paras.filter(Boolean).join('\n')
  } catch { return null }
}
const kindOf = (name, mime) => {
  const n = String(name || '').toLowerCase(), m = String(mime || '').toLowerCase()
  if (n.endsWith('.docx') || m.includes('wordprocessingml')) return 'docx'
  if (n.endsWith('.pdf') || m.includes('pdf')) return 'pdf'
  if (/\.(jpe?g|png|webp|gif)$/.test(n) || m.startsWith('image/')) return 'image'
  if (/\.(txt|md|csv)$/.test(n) || m.startsWith('text/')) return 'text'
  if (n.endsWith('.doc')) return 'doc'
  return ''
}
const UNSUPPORTED = 'รองรับไฟล์ Word (.docx), PDF, รูป หรือข้อความ — ไฟล์ .doc แบบเก่า ให้เปิดใน Word แล้ว "บันทึกเป็น .docx" ก่อน'

function reviewPrompt(name, tpl, hasText) {
  const guide = tpl
    ? `\n\nแนวทาง/แบบมาตรฐานของบริษัท "${tpl.name}" — ใช้เทียบ:${tpl.rules ? `\nกฎของบริษัท (ต้องทำตาม):\n${tpl.rules}` : ''}${tpl.ref_text ? `\nแบบมาตรฐาน (ดูว่าเอกสารขาดหัวข้อ/ข้อความสำคัญที่แบบนี้มีไหม · ถ้อยคำไม่ต้องเหมือนทุกตัว):\n<template>\n${String(tpl.ref_text).slice(0, 60000)}\n</template>` : ''}\nหมวด missing = หัวข้อ/ข้อมูลที่แบบมาตรฐานมีแต่เอกสารนี้ไม่มี · ฝ่าฝืนกฎของบริษัท = ทักตามหมวดที่เหมาะ แล้วบอกใน reason ว่าขัดกฎข้อไหน`
    : '\n\nไม่มีแบบมาตรฐาน — หมวด missing ให้ทักเฉพาะสิ่งที่สัญญา/เอกสารลูกค้าขาดไม่ได้อย่างชัดเจน (เช่น ไม่มีวันที่ คู่สัญญา ยอดเงิน หรือช่องลงนาม)'
  return `คุณเป็นบรรณาธิการภาษาไทยและผู้ตรวจทานเอกสารของบริษัทรับสร้างบ้าน ตรวจเอกสาร "${name}" ซึ่งจะให้ลูกค้าอ่านและลงนาม หาจุดที่ควรแก้ก่อนส่งลูกค้า แบ่งหมวด:
- typo: สะกดผิด พิมพ์ผิด สระ/วรรณยุกต์/การันต์ผิด คำซ้ำ เว้นวรรคผิดจนอ่านสะดุด
- wording: คำแปลก ภาษาพูด ไม่เป็นทางการ ทับศัพท์โดยไม่จำเป็น เรียกสิ่งเดียวกันไม่สม่ำเสมอ (เช่น ผู้ว่าจ้าง/ลูกค้า สลับกัน)
- sentence: ประโยคกำกวม ตีความได้หลายทาง ยาวจนอ่านยาก ไม่สุภาพ หรือลูกค้าอาจเข้าใจผิด
- consistency: ข้อมูลในเอกสารขัดกันเอง เช่น จำนวนเงินตัวเลขไม่ตรงกับตัวอักษร ผลรวมงวดไม่เท่ายอดรวม ชื่อ/เลขข้อที่อ้างถึง/วันที่ไม่ตรงกัน
- missing: หัวข้อหรือข้อมูลที่ควรมีแต่ไม่มี
กติกา:
- quote = คัดลอกข้อความจากเอกสาร${hasText ? 'ตรงตัวอักษรทุกตัว (ระบบจะค้นหาคำนี้ในเอกสาร)' : 'ให้ตรงที่สุด'} สั้นที่สุดที่ยังระบุตำแหน่งได้ ไม่เกินราว 80 ตัวอักษร · หมวด missing ให้ quote = ""
- suggest = ข้อความที่ใช้แทน quote ได้ทันที · หมวด missing = ข้อความที่ควรเพิ่ม · ถ้าแนะนำเป็นข้อความไม่ได้ (เช่น ต้องตรวจตัวเลขกับฝ่ายขาย) ให้ suggest = ""
- severity: high = ต้องแก้ก่อนส่ง (ผิดชัด ตัวเลขขัดกัน อาจเกิดข้อพิพาท) · medium = ควรแก้ · low = แนะนำ
- ห้ามเปลี่ยนเนื้อหาเชิงธุรกิจ (ราคา งวด เงื่อนไข) เอง — ถ้าน่าจะผิดให้ทักเป็น consistency หรือ sentence
- ไม่ต้องทักชื่อคน/ชื่อเฉพาะ/ที่อยู่ ยกเว้นสะกดไม่ตรงกันในเอกสารเดียวกัน · ช่องว่างสำหรับกรอก (..... หรือ ____) ไม่ถือว่าผิด
- ทักจุดเดียวกันครั้งเดียว · เรียงตามลำดับที่พบในเอกสาร · ไม่มีอะไรต้องแก้ issues = []
- คุณตรวจภาษาและความสอดคล้องเท่านั้น ไม่ใช่การรับรองทางกฎหมาย${guide}

ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น:
{"summary":"สรุปภาพรวม 1-3 ประโยค","issues":[{"type":"typo","severity":"high","quote":"ข้อความเดิม","suggest":"ข้อความที่แนะนำ","reason":"เหตุผลสั้นๆ"}]}`
}

export function createDocReview(d) {
  const { db } = d
  const dir = () => { const p = join(d.uploadsDir(), 'doc-review'); mkdirSync(p, { recursive: true }); return p }
  const tplOf = (id) => (id ? db.prepare('SELECT * FROM doc_templates WHERE id=?').get(Number(id)) : null)
  const templates = () => db.prepare('SELECT * FROM doc_templates ORDER BY name').all()
  const parse = (s) => { try { return JSON.parse(s || '[]') || [] } catch { return [] } }
  const canSeeAll = (u) => !!u && (u.role === 'admin' || d.isManager(u))
  const row = (r, full = false) => {
    if (!r) return null
    const issues = parse(r.issues)
    const out = { id: r.id, at: r.at, by: r.by, source: r.source, name: r.name, mime: r.mime, size: r.size, template_id: r.template_id, template_name: r.template_name, status: r.status, error: r.error, summary: r.summary, model: r.model, cost_usd: r.cost_usd, done_at: r.done_at, has_file: !!r.file_path, has_text: !!r.text,
      counts: Object.fromEntries(Object.keys(ISSUE_TYPES).map((k) => [k, issues.filter((i) => i.type === k).length])), total: issues.length, high: issues.filter((i) => i.severity === 'high').length }
    if (full) Object.assign(out, { issues, text: r.text || '' })
    return out
  }

  // สร้างรายการตรวจ (บันทึกไฟล์ต้นฉบับ) แล้วเริ่มตรวจเบื้องหลัง — onDone(row) เรียกเมื่อเสร็จ/ล้มเหลว
  function startReview({ user, source, name, parts, templateId, onDone }) {
    // parts: [{ kind:'docx'|'pdf'|'image'|'text', buf, mime }] (รูปหลายหน้า = หลาย part)
    const tpl = tplOf(templateId)
    const first = parts[0]
    let text = ''
    if (parts.every((p) => p.kind === 'docx' || p.kind === 'text')) text = parts.map((p) => (p.kind === 'docx' ? docxText(p.buf) : p.buf.toString('utf8'))).join('\n\n').replace(/\r\n/g, '\n').trim()
    if (parts.some((p) => p.kind === 'docx') && !text) throw { code: 400, msg: 'อ่านข้อความในไฟล์ Word ไม่ได้ (ไฟล์อาจเสีย หรือมีแต่รูป)' }
    if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT)
    const info = db.prepare('INSERT INTO doc_reviews (at,by,by_id,source,name,mime,size,template_id,template_name,text,status,issues) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(d.nowTS(), user.name, user.id, source, String(name || 'เอกสาร').slice(0, 200), parts.length > 1 ? 'image/*' : first.mime, parts.reduce((s, p) => s + p.buf.length, 0), tpl?.id || null, tpl?.name || '', text || null, 'กำลังตรวจ', '[]')
    const id = Number(info.lastInsertRowid)
    if (first.kind !== 'text') { // เก็บต้นฉบับไว้เปิดดู (รูปหลายหน้าเก็บหน้าแรก)
      writeFileSync(join(dir(), String(id)), first.buf)
      db.prepare('UPDATE doc_reviews SET file_path=? WHERE id=?').run(String(id), id)
    }
    run(id, user, parts, tpl, text).then(() => onDone?.(db.prepare('SELECT * FROM doc_reviews WHERE id=?').get(id)))
    return id
  }

  async function run(id, user, parts, tpl, text) {
    const name = db.prepare('SELECT name FROM doc_reviews WHERE id=?').get(id)?.name || 'เอกสาร'
    let res
    if (process.env.PPSD_AI_MOCK_DOCREVIEW) res = { ok: true, text: process.env.PPSD_AI_MOCK_DOCREVIEW, model: 'mock', cost_usd: 0 } // ชุดทดสอบ
    else {
      const media = text ? [] : parts.map((p) => p.kind === 'pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.buf.toString('base64') } }
        : { type: 'image', source: { type: 'base64', media_type: /^image\/(jpeg|png|webp|gif)$/.test(p.mime) ? p.mime : 'image/jpeg', data: p.buf.toString('base64') } })
      const prompt = reviewPrompt(name, tpl, !!text) + (text ? `\n\nเอกสารที่ต้องตรวจ:\n<document>\n${text}\n</document>` : '')
      res = await d.aiAsk({ feature: 'ตรวจเอกสาร', by: user.name, media, prompt, maxTokens: 32000, effort: 'medium', timeoutMs: 300000 })
    }
    if (!res.ok) {
      db.prepare("UPDATE doc_reviews SET status='ผิดพลาด', error=?, model=?, done_at=? WHERE id=?").run(String(res.error || 'ไม่ทราบสาเหตุ'), res.model || '', d.nowTS(), id)
      return
    }
    const parsed = d.extractJsonBlock(res.text)
    if (!parsed) {
      db.prepare("UPDATE doc_reviews SET status='ผิดพลาด', error=?, model=?, cost_usd=?, done_at=? WHERE id=?").run('AI ตอบกลับไม่เป็นรูปแบบที่อ่านได้ (เอกสารอาจยาวเกินไป) — ลองใหม่ หรือแบ่งตรวจทีละส่วน', res.model || '', res.cost_usd || 0, d.nowTS(), id)
      return
    }
    const seen = new Set()
    const issues = (Array.isArray(parsed.issues) ? parsed.issues : []).map((it) => {
      const type = ISSUE_TYPES[it.type] ? it.type : 'sentence'
      const quote = String(it.quote || '').trim().slice(0, 400)
      const pos = text && quote ? text.indexOf(quote) : -1
      return { type, severity: SEV.includes(it.severity) ? it.severity : 'medium', quote: type === 'missing' ? '' : quote, suggest: String(it.suggest || '').trim().slice(0, 1500), reason: String(it.reason || '').trim().slice(0, 500), pos, status: '' }
    }).filter((it) => {
      if (!it.quote && it.type !== 'missing') return false
      const k = it.type + '|' + it.quote + '|' + it.suggest
      if (seen.has(k)) return false
      seen.add(k); return true
    }).slice(0, MAX_ISSUES)
    db.prepare("UPDATE doc_reviews SET status='เสร็จ', summary=?, issues=?, model=?, cost_usd=?, done_at=? WHERE id=?").run(String(parsed.summary || '').slice(0, 1500), JSON.stringify(issues), res.model || '', res.cost_usd || 0, d.nowTS(), id)
    d.audit({ user }, 'ตรวจเอกสารด้วย AI', `${name} · ${issues.length} จุด`)
  }

  // ---------- หน้าเว็บ ----------
  function register(api, { canWrite }) {
    const mine = (req, r) => r && (r.by_id === req.user.id || canSeeAll(req.user))
    api.get('/doc-templates', (_req, res) => res.json(templates()))
    const tplBody = (b) => ({ name: String(b?.name || '').trim().slice(0, 120), dept: String(b?.dept || '').trim().slice(0, 60), rules: String(b?.rules || '').slice(0, 20000), ref_text: String(b?.ref_text || '').slice(0, 60000) })
    api.post('/doc-templates', canWrite, (req, res) => {
      const t = tplBody(req.body)
      if (!t.name) return res.status(400).json({ error: 'ใส่ชื่อแบบมาตรฐานก่อน' })
      if (!t.rules.trim() && !t.ref_text.trim()) return res.status(400).json({ error: 'ใส่กฎของบริษัท หรือข้อความแบบมาตรฐาน อย่างน้อยหนึ่งอย่าง' })
      const id = db.prepare('INSERT INTO doc_templates (name,dept,rules,ref_text,created_by,created,updated_by,updated) VALUES (?,?,?,?,?,?,?,?)').run(t.name, t.dept, t.rules, t.ref_text, req.user.name, d.nowTS(), req.user.name, d.nowTS()).lastInsertRowid
      d.audit(req, 'เพิ่มแบบมาตรฐานตรวจเอกสาร', t.name)
      res.status(201).json(tplOf(id))
    })
    api.put('/doc-templates/:id', canWrite, (req, res) => {
      const cur = tplOf(req.params.id)
      if (!cur) return res.status(404).json({ error: 'ไม่พบแบบมาตรฐานนี้' })
      const t = tplBody(req.body)
      if (!t.name) return res.status(400).json({ error: 'ใส่ชื่อแบบมาตรฐานก่อน' })
      db.prepare('UPDATE doc_templates SET name=?, dept=?, rules=?, ref_text=?, updated_by=?, updated=? WHERE id=?').run(t.name, t.dept, t.rules, t.ref_text, req.user.name, d.nowTS(), cur.id)
      d.audit(req, 'แก้แบบมาตรฐานตรวจเอกสาร', t.name)
      res.json(tplOf(cur.id))
    })
    api.delete('/doc-templates/:id', canWrite, (req, res) => {
      const cur = tplOf(req.params.id)
      if (!cur) return res.status(404).json({ error: 'ไม่พบแบบมาตรฐานนี้' })
      db.prepare('DELETE FROM doc_templates WHERE id=?').run(cur.id)
      d.audit(req, 'ลบแบบมาตรฐานตรวจเอกสาร', cur.name)
      res.json({ ok: true })
    })
    // ดึงข้อความจากไฟล์ Word/ข้อความ มาใส่เป็นแบบมาตรฐาน (PDF ให้ AI ถอดข้อความ)
    api.post('/doc-templates/extract', canWrite, express.raw({ type: 'application/octet-stream', limit: '30mb' }), async (req, res) => {
      const buf = req.body
      if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'ไฟล์ไม่ถูกต้อง' })
      const kind = kindOf(req.query.name, req.query.mime)
      if (kind === 'docx') { const t = docxText(buf); return t ? res.json({ text: t.slice(0, 60000) }) : res.status(400).json({ error: 'อ่านข้อความในไฟล์ Word ไม่ได้' }) }
      if (kind === 'text') return res.json({ text: buf.toString('utf8').slice(0, 60000) })
      if (kind !== 'pdf' && kind !== 'image') return res.status(400).json({ error: UNSUPPORTED })
      const media = kind === 'pdf' ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } } : { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') } }
      const ai = await d.aiAsk({ feature: 'ถอดข้อความแบบมาตรฐาน', by: req.user.name, media, prompt: 'ถอดข้อความทั้งหมดในเอกสารนี้ออกมาตามต้นฉบับทุกตัวอักษร เรียงตามลำดับ ขึ้นบรรทัดใหม่ตามย่อหน้า ไม่ต้องสรุป ไม่ต้องอธิบาย ไม่ต้องแก้คำผิด', maxTokens: 32000 })
      if (!ai.ok) return res.status(ai.code || 502).json({ error: ai.error })
      res.json({ text: ai.text.trim().slice(0, 60000) })
    })

    api.get('/doc-reviews', (req, res) => {
      const all = canSeeAll(req.user) && req.query.all === '1'
      const rows = all ? db.prepare('SELECT * FROM doc_reviews ORDER BY id DESC LIMIT 200').all() : db.prepare('SELECT * FROM doc_reviews WHERE by_id=? ORDER BY id DESC LIMIT 200').all(req.user.id)
      res.json({ rows: rows.map((r) => row(r)), can_see_all: canSeeAll(req.user) })
    })
    api.get('/doc-reviews/:id', (req, res) => {
      const r = db.prepare('SELECT * FROM doc_reviews WHERE id=?').get(Number(req.params.id))
      if (!mine(req, r)) return res.status(404).json({ error: 'ไม่พบรายการตรวจนี้' })
      res.json(row(r, true))
    })
    api.get('/doc-reviews/:id/file', (req, res) => {
      const r = db.prepare('SELECT * FROM doc_reviews WHERE id=?').get(Number(req.params.id))
      if (!mine(req, r) || !r.file_path || !existsSync(join(dir(), r.file_path))) return res.status(404).json({ error: 'ไม่พบไฟล์ต้นฉบับ' })
      res.setHeader('Content-Type', r.mime === 'image/*' ? 'image/jpeg' : r.mime || 'application/octet-stream')
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(r.name)}`)
      res.send(readFileSync(join(dir(), r.file_path)))
    })
    const startFromReq = (req, res, parts, name) => {
      if (!d.aiKey() && !process.env.PPSD_AI_MOCK_DOCREVIEW) return res.status(400).json({ error: d.AI_NO_KEY })
      try { res.status(201).json({ id: startReview({ user: req.user, source: 'web', name, parts, templateId: req.query.template_id || req.body?.template_id }) }) }
      catch (e) { res.status(e.code || 500).json({ error: e.msg || e.message }) }
    }
    api.post('/doc-reviews/file', express.raw({ type: 'application/octet-stream', limit: '30mb' }), (req, res) => {
      const buf = req.body
      if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'ไฟล์ไม่ถูกต้อง' })
      const name = String(req.query.name || 'เอกสาร'), mime = String(req.query.mime || '')
      const kind = kindOf(name, mime)
      if (!kind || kind === 'doc') return res.status(400).json({ error: UNSUPPORTED })
      startFromReq(req, res, [{ kind, buf, mime: mime || 'application/octet-stream' }], name)
    })
    api.post('/doc-reviews/text', (req, res) => {
      const text = String(req.body?.text || '').trim()
      if (text.length < 20) return res.status(400).json({ error: 'วางข้อความที่ต้องการตรวจก่อน (อย่างน้อย 20 ตัวอักษร)' })
      startFromReq(req, res, [{ kind: 'text', buf: Buffer.from(text, 'utf8'), mime: 'text/plain' }], String(req.body?.name || '').trim() || 'ข้อความที่วาง')
    })
    // คนตัดสินทีละจุด: accepted = ใช้คำแนะนำ · ignored = ข้าม · '' = ยังไม่ตัดสิน
    api.put('/doc-reviews/:id/issues/:i', (req, res) => {
      const r = db.prepare('SELECT * FROM doc_reviews WHERE id=?').get(Number(req.params.id))
      if (!mine(req, r)) return res.status(404).json({ error: 'ไม่พบรายการตรวจนี้' })
      const issues = parse(r.issues), i = Number(req.params.i)
      if (!issues[i]) return res.status(404).json({ error: 'ไม่พบจุดนี้' })
      issues[i].status = ['accepted', 'ignored'].includes(req.body?.status) ? req.body.status : ''
      db.prepare('UPDATE doc_reviews SET issues=? WHERE id=?').run(JSON.stringify(issues), r.id)
      res.json(row({ ...r, issues: JSON.stringify(issues) }, true))
    })
    api.delete('/doc-reviews/:id', (req, res) => {
      const r = db.prepare('SELECT * FROM doc_reviews WHERE id=?').get(Number(req.params.id))
      if (!mine(req, r)) return res.status(404).json({ error: 'ไม่พบรายการตรวจนี้' })
      if (r.file_path) { try { unlinkSync(join(dir(), r.file_path)) } catch { /* ไฟล์หายไปแล้ว */ } }
      db.prepare('DELETE FROM doc_reviews WHERE id=?').run(r.id)
      d.audit(req, 'ลบรายการตรวจเอกสาร', r.name)
      res.json({ ok: true })
    })
  }

  // ---------- LINE ----------
  function lineResult(r) {
    if (r.status !== 'เสร็จ') return [`❌ ตรวจ "${r.name}" ไม่สำเร็จ: ${r.error || 'ไม่ทราบสาเหตุ'}`]
    const issues = parse(r.issues)
    const head = `📝 ผลตรวจ "${r.name}"${r.template_name ? ` (เทียบแบบ ${r.template_name})` : ''}\n${r.summary || ''}\n\n${issues.length ? `พบ ${issues.length} จุด · ต้องแก้ก่อนส่ง ${issues.filter((i) => i.severity === 'high').length} จุด\n${Object.entries(ISSUE_TYPES).map(([k, l]) => { const n = issues.filter((i) => i.type === k).length; return n ? `${TYPE_ICON[k]} ${l} ${n}` : '' }).filter(Boolean).join(' · ')}` : '✅ ไม่พบจุดที่ต้องแก้'}`
    const order = [...issues].sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity))
    const lines = order.map((it, i) => `${i + 1}. ${TYPE_ICON[it.type]}${it.severity === 'high' ? '❗' : ''} ${it.quote ? `"${it.quote}"` : ISSUE_TYPES[it.type]}${it.suggest ? ` → "${it.suggest}"` : ''}${it.reason ? `\n   ${it.reason}` : ''}`)
    // LINE ส่งได้ 5 ข้อความต่อครั้ง: หัว + รายการไม่เกิน 3 ข้อความ + ท้าย
    const msgs = [head]
    let cur = '', shown = 0
    for (const l of lines) {
      if (cur && (cur + '\n' + l).length > 4500) { msgs.push(cur); cur = '' }
      if (msgs.length >= 4) break
      cur = cur ? cur + '\n' + l : l
      shown++
    }
    if (cur && msgs.length < 4) msgs.push(cur)
    const base = d.publicBaseUrl()
    msgs.push(`${issues.length > shown ? `(แสดง ${shown} จาก ${issues.length} จุด) ` : ''}ดูทั้งหมด กดใช้/ข้ามทีละจุด และคัดลอกข้อความที่แก้แล้วได้ที่หน้าเว็บ: เมนู ตรวจเอกสาร${base ? `\n${base}` : ''}\nℹ️ AI ตรวจภาษาและความสอดคล้องเท่านั้น ตัวเลข/ราคา/ข้อกฎหมาย ยังต้องให้คนตรวจ`)
    return msgs.filter(Boolean).slice(0, 5)
  }
  const tplMenu = () => {
    const ts = templates()
    return ts.length ? `\n\nเลือกแบบมาตรฐานที่จะเทียบ (ตอบตัวเลข) หรือส่งเอกสารเลย = ตรวจทั่วไป\n${ts.slice(0, 15).map((t, i) => `${i + 1}. ${t.name}${t.dept ? ` (${t.dept})` : ''}`).join('\n')}` : ''
  }
  const dropTmp = (ctx) => { for (const f of ctx?.images || []) { try { unlinkSync(join(dir(), f.tmp)) } catch { /* หายไปแล้ว */ } } }
  function lineStart(uid, u, replyToken, ctx) {
    if (ctx?.kind === 'docrev') dropTmp(ctx)
    d.setLineCtx(uid, { kind: 'docrev', template_id: null, images: [], ttl: CTX_TTL, ids: templates().slice(0, 15).map((t) => t.id) })
    return d.lineReply(replyToken, `📝 ตรวจเอกสาร (คำผิด · คำแปลก · ประโยคไม่เหมาะ · ข้อมูลขัดกัน)\nส่งมาได้เลย:\n• ไฟล์ Word (.docx) หรือ PDF\n• รูปเอกสาร (หลายหน้าได้ ไม่เกิน ${MAX_IMAGES} รูป แล้วพิมพ์ 'ครบ')\n• หรือวางข้อความ${tplMenu()}\n\nยกเลิกพิมพ์ 'ยกเลิก'`)
  }
  function lineRun(uid, u, replyToken, parts, name, ctx) {
    if (!d.aiKey() && !process.env.PPSD_AI_MOCK_DOCREVIEW) return d.lineReply(replyToken, d.AI_NO_KEY)
    d.setLineCtx(uid, null)
    try {
      startReview({ user: u, source: 'line', name, parts, templateId: ctx?.template_id, onDone: (r) => d.linePush(uid, lineResult(r)) })
    } catch (e) { return d.lineReply(replyToken, '❌ ' + (e.msg || e.message)) }
    const tpl = tplOf(ctx?.template_id)
    return d.lineReply(replyToken, `🔎 กำลังตรวจ "${name}"${tpl ? ` เทียบกับแบบ ${tpl.name}` : ''} — ใช้เวลาประมาณ 1-3 นาที เสร็จแล้วจะส่งผลมาที่นี่ค่ะ`)
  }

  return {
    register,
    // ข้อความ: "ตรวจเอกสาร" / เลือกแบบ / วางข้อความ / 'ครบ' หลังส่งรูป · null = ไม่ใช่เรื่องนี้
    handleText(uid, u, t, replyToken, ctx) {
      if (/^(ตรวจ(เอกสาร|สัญญา|คำผิด|ภาษา)|พิสูจน์อักษร)$/.test(t)) return lineStart(uid, u, replyToken, ctx)
      if (ctx?.kind !== 'docrev') return null
      if (/^(ยกเลิก|cancel)$/i.test(t)) { dropTmp(ctx); d.setLineCtx(uid, null); return d.lineReply(replyToken, 'ยกเลิกการตรวจเอกสารแล้วค่ะ') }
      if (/^\d{1,2}$/.test(t) && !ctx.images.length) {
        const id = ctx.ids?.[Number(t) - 1]
        const tpl = tplOf(id)
        if (!tpl) return d.lineReply(replyToken, `ตอบตัวเลข 1-${ctx.ids?.length || 1} ค่ะ`)
        d.setLineCtx(uid, { ...ctx, template_id: tpl.id, ttl: CTX_TTL })
        return d.lineReply(replyToken, `เทียบกับแบบ "${tpl.name}" — ส่งไฟล์ Word/PDF รูปเอกสาร หรือวางข้อความมาได้เลยค่ะ`)
      }
      if (/^(ครบ|เสร็จ|ตรวจ|ตรวจเลย|ส่งครบ|ok|โอเค)$/i.test(t)) {
        if (!ctx.images.length) return d.lineReply(replyToken, 'ยังไม่ได้ส่งเอกสารค่ะ — ส่งไฟล์ รูป หรือวางข้อความก่อน')
        const parts = ctx.images.filter((f) => existsSync(join(dir(), f.tmp))).map((f) => ({ kind: 'image', buf: readFileSync(join(dir(), f.tmp)), mime: f.mime }))
        dropTmp(ctx)
        if (!parts.length) { d.setLineCtx(uid, null); return d.lineReply(replyToken, 'รูปที่ส่งมาหมดอายุแล้วค่ะ — พิมพ์ "ตรวจเอกสาร" แล้วส่งใหม่') }
        return lineRun(uid, u, replyToken, parts, `รูปเอกสาร ${parts.length} หน้า (${d.nowTS().slice(0, 16)})`, ctx)
      }
      if (t.length >= 40) return lineRun(uid, u, replyToken, [{ kind: 'text', buf: Buffer.from(t, 'utf8'), mime: 'text/plain' }], `ข้อความจาก LINE (${d.nowTS().slice(0, 16)})`, ctx)
      return d.lineReply(replyToken, `ส่งไฟล์ Word/PDF รูปเอกสาร หรือวางข้อความที่ต้องการตรวจค่ะ${ctx.images.length ? ` (ได้รูป ${ctx.images.length} หน้าแล้ว — พิมพ์ 'ครบ' เพื่อตรวจ)` : ''} · ยกเลิกพิมพ์ 'ยกเลิก'`)
    },
    // รูประหว่างตรวจเอกสาร → เก็บไว้ (ไม่ลงไฟล์บ้าน) · null = ไม่ได้อยู่ในขั้นนี้
    handleImage(uid, u, img, replyToken, ctx) {
      if (ctx?.kind !== 'docrev') return null
      if (ctx.images.length >= MAX_IMAGES) return d.lineReply(replyToken, `ครบ ${MAX_IMAGES} หน้าแล้วค่ะ — พิมพ์ 'ครบ' เพื่อตรวจ`)
      const m = /^data:([^;]+);base64,(.*)$/.exec(String(img || ''))
      if (!m) return d.lineReply(replyToken, 'อ่านรูปไม่สำเร็จค่ะ ลองส่งใหม่')
      const tmp = `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` // เก็บรูปชั่วคราวบนดิสก์ (ไม่ใส่ใน line_ctx — จะบวม)
      writeFileSync(join(dir(), tmp), Buffer.from(m[2], 'base64'))
      const next = { ...ctx, images: [...ctx.images, { mime: m[1], tmp }], ttl: CTX_TTL }
      d.setLineCtx(uid, next)
      return d.lineReply(replyToken, `📷 รับหน้าที่ ${next.images.length} แล้วค่ะ · ส่งหน้าถัดไป หรือพิมพ์ 'ครบ' เพื่อตรวจ`)
    },
    // ไฟล์ (Word/PDF) — ส่งมาเมื่อไหร่ก็ตรวจให้ (ไม่ต้องพิมพ์ "ตรวจเอกสาร" ก่อน)
    handleFile(uid, u, file, replyToken, ctx) {
      const kind = kindOf(file.name, file.mime)
      if (!kind || kind === 'doc') return d.lineReply(replyToken, UNSUPPORTED)
      return lineRun(uid, u, replyToken, [{ kind, buf: file.buf, mime: kind === 'pdf' ? 'application/pdf' : file.mime }], file.name, ctx?.kind === 'docrev' ? ctx : null)
    },
  }
}
