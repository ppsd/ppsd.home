// ออกแบบบ้านเบื้องต้นจากเว็บลูกค้า (ไม่ต้องล็อกอิน) — หน้า /web/#custom
//  - ลูกค้ากรอกความต้องการ → AI จัดผังห้อง (ใช้กติกาเดียวกับ server/house-concept.js) → หน้าเว็บวาดแปลน + 3D
//  - ผลเก็บในตาราง house_concepts (by = "เว็บลูกค้า") พนักงานขายเห็นในหน้าออกแบบบ้านของ ERP และมีประวัติใน change_history
//  - กันใช้เกิน: ต่อ IP วันละ PER_IP ครั้ง · ทั้งเว็บวันละ PER_DAY ครั้ง · ทำพร้อมกันได้ไม่เกิน RUNNING งาน · รับรูปตัวอย่างที่ลูกค้าแนบได้ 3 รูป (ส่งให้ AI ดูอย่างเดียว ไม่เก็บไฟล์)
//  - ลูกค้าดูผลด้วยรหัสสุ่ม (ไม่ใช่เลขลำดับ) และเห็นเฉพาะผังห้อง+สรุป ไม่เห็นชื่อ/เบอร์/ค่า AI
import crypto from 'node:crypto'
import express from 'express'
import { normalizeReq, normalizeLayout, analyze, buildPrompt, parsePublicImages, seriousIssues, buildRepairPrompt, DESIGN_MAX_TOKENS, retryableDesignError } from './house-concept.js'

const PER_IP = 3
const PER_DAY = 40
const RUNNING = 3
const BY = 'เว็บลูกค้า'
const txt = (s, n = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

export function createPublicHouseConcept(d) {
  const { db } = d
  const jobs = new Map() // token → { id, at }
  const ipCount = new Map() // `${วัน}|${ip}` → จำนวน
  let running = 0
  const today = () => d.nowTS().slice(0, 10)
  const usedToday = () => db.prepare('SELECT COUNT(*) n FROM house_concepts WHERE by=? AND substr(at,1,10)=?').get(BY, today()).n
  const prune = () => {
    const t = today(), cut = Date.now() - 86400000
    for (const k of ipCount.keys()) if (!k.startsWith(t + '|')) ipCount.delete(k)
    for (const [k, j] of jobs) if (j.at < cut) jobs.delete(k)
  }

  async function design(id, q, ideaIds = [], own = []) {
    running++
    try {
      let layout, model = null, cost = 0
      if (process.env.PPSD_AI_MOCK_HOUSECONCEPT) { layout = normalizeLayout(JSON.parse(process.env.PPSD_AI_MOCK_HOUSECONCEPT), q); model = 'mock' }
      else {
        const more = ideaIds.length && d.ideas && own.length < 3 ? await d.ideas.ideaMedia(ideaIds, { publicOnly: true, max: Math.min(2, 3 - own.length) }).catch(() => []) : []
        const media = [...own, ...more]
        // ล้มแบบชั่วคราว (คำตอบถูกตัด/อ่านไม่ออก · AI คนใช้เยอะ) → ลองใหม่เองอีก 1 รอบ ถ้ายังมีเวลาพอ (หน้าเว็บรอได้ 15 นาที)
        const t0 = Date.now()
        for (let n = 1; ; n++) {
          const ai = await d.aiAsk({ feature: 'ออกแบบบ้านเบื้องต้น (เว็บลูกค้า)', by: BY, media, prompt: buildPrompt(q, media.length > 0), maxTokens: DESIGN_MAX_TOKENS, timeoutMs: n === 1 ? 540000 : Math.max(120000, 840000 - (Date.now() - t0)), effort: 'medium', stream: true })
          model = ai.model || model; cost += ai.cost_usd || 0
          let err = ai.ok ? null : ai.error || 'AI ไม่ตอบ'
          if (!err) { layout = normalizeLayout(d.extractJsonBlock(ai.text), q); if (!layout.floors.length) err = 'AI ตอบผังห้องไม่ครบ' }
          if (!err) break
          if (n >= 2 || !retryableDesignError(err) || Date.now() - t0 > 360000) throw new Error(err + (n > 1 ? ' (ลองแล้ว 2 รอบ)' : ''))
        }
        // ผังมีปัญหาร้ายแรง (ห้องทับ ห้องลอย ไม่มีประตู จำนวนห้องไม่ตรง) → ให้ AI แก้อีก 1 รอบ
        const issues = layout.floors.length ? seriousIssues(analyze(layout, q)) : []
        if (issues.length && Date.now() - t0 < 480000) { // เวลาเหลือพอค่อยแก้ผัง (ไม่งั้นส่งผลที่มีไปก่อน)
          const fix = await d.aiAsk({ feature: 'ออกแบบบ้านเบื้องต้น (เว็บลูกค้า · แก้ผัง)', by: BY, prompt: buildRepairPrompt(q, layout, issues), maxTokens: DESIGN_MAX_TOKENS, timeoutMs: 420000, effort: 'medium', stream: true }).catch(() => null)
          cost += fix?.cost_usd || 0
          const l2 = fix?.ok ? normalizeLayout(d.extractJsonBlock(fix.text), q) : null
          if (l2?.floors.length && seriousIssues(analyze(l2, q)).length < issues.length) layout = l2
        }
      }
      if (!layout.floors.length) throw new Error('AI ตอบผังห้องไม่ครบ')
      db.prepare("UPDATE house_concepts SET layout=?, status='เสร็จ', error=NULL, model=?, cost_usd=?, updated=? WHERE id=?").run(JSON.stringify(layout), model, cost, d.nowTS(), id)
    } catch (e) {
      db.prepare("UPDATE house_concepts SET status='ผิดพลาด', error=? WHERE id=?").run('ออกแบบไม่สำเร็จ: ' + e.message, id)
    } finally { running-- }
  }

  const r = express.Router()
  // หน้าเว็บถามก่อนว่าเปิดใช้ได้ไหม (ซ่อนปุ่มถ้าไม่มีกุญแจ AI)
  r.get('/house-concept/status', (_req, res) => {
    res.json({ ok: !!(process.env.PPSD_AI_MOCK_HOUSECONCEPT || d.aiKey()), left_today: Math.max(0, PER_DAY - usedToday()) })
  })
  r.post('/house-concept', (req, res) => {
    prune()
    if (!process.env.PPSD_AI_MOCK_HOUSECONCEPT && !d.aiKey()) return res.status(503).json({ error: 'ระบบออกแบบอัตโนมัติยังไม่เปิดใช้ กรุณาส่งความต้องการให้สถาปนิกแทน' })
    const ip = d.clientIp(req) || '-', key = today() + '|' + ip
    if ((ipCount.get(key) || 0) >= PER_IP) return res.status(429).json({ error: `วันนี้ออกแบบครบ ${PER_IP} ครั้งแล้ว ส่งความต้องการให้สถาปนิกช่วยต่อได้เลย` })
    if (usedToday() >= PER_DAY) return res.status(429).json({ error: 'วันนี้มีคนใช้ระบบออกแบบเต็มแล้ว ส่งความต้องการให้สถาปนิกแทนได้' })
    if (running >= RUNNING) return res.status(429).json({ error: 'ระบบกำลังออกแบบให้ลูกค้าท่านอื่นอยู่ ลองใหม่ในอีก 1–2 นาที' })
    const b = req.body || {}
    const q = normalizeReq({ ...b, images: undefined })
    const own = parsePublicImages(b.images)
    if (own.length) q.notes = txt([q.notes, `ลูกค้าแนบรูปตัวอย่าง ${own.length} รูป`].filter(Boolean).join(' · '), 1500)
    // แบบที่ลูกค้ากดชอบในห้องรวมไอเดีย (เฉพาะที่เปิดให้เว็บเห็น · ส่งรูปให้ AI ไม่เกิน 2 รูปเพื่อคุมค่าใช้จ่าย)
    const ideaIds = Array.isArray(b.idea_ids) ? b.idea_ids.slice(0, 3) : []
    const ideaNote = ideaIds.length && d.ideas ? d.ideas.ideaText(ideaIds, { publicOnly: true }) : ''
    if (ideaNote) q.notes = txt([q.notes, ideaNote].filter(Boolean).join(' · '), 1500)
    if (!q.bedrooms && !q.bathrooms) return res.status(400).json({ error: 'ระบุจำนวนห้องนอนหรือห้องน้ำอย่างน้อย 1 อย่าง' })
    ipCount.set(key, (ipCount.get(key) || 0) + 1)
    const now = d.nowTS()
    const title = `เว็บ: บ้าน ${q.floors || '?'} ชั้น ${q.bedrooms} ห้องนอน ${q.bathrooms} ห้องน้ำ`
    const contact = [txt(b.name, 60), txt(b.phone, 30)].filter(Boolean).join(' · ')
    const id = db.prepare('INSERT INTO house_concepts (at,by,by_id,title,customer,req,layout,versions,status,updated,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(now, BY, null, title, contact, JSON.stringify(q), null, '[]', 'กำลังออกแบบ', now, BY).lastInsertRowid
    const token = crypto.randomBytes(16).toString('hex')
    jobs.set(token, { id, at: Date.now() })
    design(id, q, ideaNote ? ideaIds : [], own)
    res.json({ token })
  })
  r.get('/house-concept/:token', (req, res) => {
    const j = jobs.get(String(req.params.token))
    const row = j && db.prepare('SELECT status,error,req,layout FROM house_concepts WHERE id=?').get(j.id)
    if (!row) return res.status(404).json({ error: 'ไม่พบแบบนี้ ลองกดออกแบบใหม่' })
    if (row.status === 'กำลังออกแบบ') return res.json({ status: 'working' })
    if (row.status === 'ผิดพลาด' || !row.layout) return res.json({ status: 'error', error: 'ออกแบบไม่สำเร็จ ลองใหม่อีกครั้ง หรือส่งความต้องการให้สถาปนิก' })
    const layout = JSON.parse(row.layout), req2 = JSON.parse(row.req || '{}')
    const a = analyze(layout, req2)
    res.json({ status: 'done', layout, stats: { total: a.total, indoor: a.indoor, outdoor: a.outdoor, estimate: a.estimate, bedrooms: a.bedrooms, bathrooms: a.bathrooms, footprint: a.footprint } })
  })
  return r
}
