// ห้องรวมไอเดียแบบบ้าน — คลังรูปตัวอย่าง/แปลน/โครงการดัง ให้เซลส์หรือลูกค้ากด "ชอบแบบนี้" แล้วส่งให้ AI ออกแบบตาม
//  - รูป: ใช้เฉพาะรูปใบอนุญาตใช้เชิงพาณิชย์ได้ (CC0 / Public Domain / CC BY / CC BY-SA) จาก Openverse (Flickr) และ Wikimedia Commons
//    ไม่ก๊อปรูปมาเก็บ — เก็บแค่ลิงก์รูปต้นทาง + ชื่อเจ้าของภาพ + ใบอนุญาต (ต้องแสดงเครดิตทุกครั้ง)
//  - โครงการดัง/เว็บไอเดีย: เก็บเป็นลิงก์ไปหน้าต้นทาง (มีรูปเฉพาะที่ Wikimedia มีรูปใบอนุญาตเสรี)
//  - ค้นรูปเพิ่มจากเน็ตได้ไม่จำกัดผ่าน /house-ideas/search (ไม่ต้องมีกุญแจ)
//  - public=1 = แสดงบนเว็บลูกค้าได้ (/api/public/house-ideas) · ลิงก์โครงการดังไม่แสดงบนเว็บลูกค้า
import express from 'express'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const IDEA_KINDS = ['photo', 'render', 'plan', 'link']
export const IDEA_STYLES = ['โมเดิร์น', 'มินิมอล', 'ทรอปิคอล', 'ญี่ปุ่น', 'นอร์ดิก', 'ไทยประยุกต์', 'คลาสสิก', 'ลอฟต์', 'บ้านไม้']
// โฮสต์รูปที่ยอมให้เก็บลิงก์/ดึงรูปไปให้ AI (กันส่งเซิร์ฟเวอร์ไปดึงที่อื่น)
const IMG_HOST = /^https:\/\/(live\.staticflickr\.com|upload\.wikimedia\.org|thumb\.wikimedia\.org|farm\d+\.staticflickr\.com|images\.pexels\.com)\//
const UA = { 'User-Agent': 'PPSD-ERP/1.0 (internal design reference tool)' }
const FREE_LIC = (s) => /^(Pexels License$|CC0|Public Domain|PD|CC BY(-SA)?( \d(\.\d)?)?$|CC BY(-SA)? \d\.\d [A-Z-]+$|Attribution)/i.test(s || '') && !/\b(NC|ND)\b/.test(s || '') && !/non-free|fair use/i.test(s || '')
const txt = (s, n = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const strip = (s) => txt(String(s || '').replace(/<[^>]+>/g, ' '), 300)
const url = (s) => { const v = txt(s, 600); return /^https?:\/\/[^\s]+$/i.test(v) ? v : '' }
const imgUrl = (s) => { const v = url(s); return IMG_HOST.test(v) ? v : '' }

// คำไทยที่พบบ่อย → อังกฤษ (แหล่งรูปค้นด้วยภาษาอังกฤษได้ผลดีกว่า)
const TH_EN = [['สองชั้น', 'two storey'], ['2 ชั้น', 'two storey'], ['ชั้นเดียว', 'single storey'], ['3 ชั้น', 'three storey'], ['แปลน', 'floor plan'], ['บ้าน', 'house'],
  ['โมเดิร์น', 'modern'], ['มินิมอล', 'minimalist'], ['ทรอปิคอล', 'tropical'], ['ญี่ปุ่น', 'japanese'], ['นอร์ดิก', 'scandinavian'], ['ไทย', 'thai'], ['ไม้', 'wooden'],
  ['ลอฟต์', 'loft concrete'], ['สระว่ายน้ำ', 'pool'], ['สระ', 'pool'], ['วิลล่า', 'villa'], ['คลาสสิก', 'classic'], ['หลังคา', 'roof'], ['สวน', 'garden'], ['ภายใน', 'interior'],
  ['ห้องนั่งเล่น', 'living room'], ['ครัว', 'kitchen'], ['ทาวน์โฮม', 'townhouse'], ['กระจก', 'glass'], ['อิฐ', 'brick'], ['ปูนเปลือย', 'exposed concrete'], ['ยุโรป', 'european'], ['รีสอร์ท', 'resort']]
export function toEnglishQuery(q) {
  let s = txt(q, 120)
  for (const [th, en] of TH_EN) s = s.split(th).join(` ${en} `)
  s = s.replace(/\s+/g, ' ').trim()
  // "บ้านโมเดิร์น" → "house modern" → ย้าย house ไปท้าย ("modern house") ค้นได้ตรงกว่า
  if (/^house /.test(s) && s.split(' ').length > 1) s = s.replace(/^house /, '') + ' house'
  return s
}

const licName = (l, v) => (l === 'cc0' ? 'CC0' : l === 'pdm' ? 'Public Domain' : `CC ${String(l).toUpperCase()} ${v || ''}`.trim())
// ผลค้นจากเน็ต → รูปแบบเดียวกับรายการในคลัง
// Pexels (ถ้าแอดมินตั้งกุญแจฟรีไว้) — รูปบ้านสวยและตรงคำค้นกว่ามาก · ใบอนุญาต Pexels ใช้เชิงพาณิชย์ได้ (ยังแสดงเครดิตช่างภาพ)
async function searchPexels(key, q, page, kind) {
  const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=20&page=${page}`, { headers: { ...UA, Authorization: key }, signal: AbortSignal.timeout(20000) })
  if (r.status === 401 || r.status === 403) throw new Error('กุญแจ Pexels ไม่ถูกต้อง — แอดมินตั้งใหม่ได้ที่ช่องด้านบน')
  if (!r.ok) throw new Error('Pexels ไม่ตอบ (' + r.status + ')')
  const j = await r.json()
  return { more: !!j.next_page, items: (j.photos || []).filter((x) => IMG_HOST.test(x.src?.large || '')).map((x) => ({
    kind, title: txt(x.alt, 120) || q, image_url: x.src.large, thumb_url: x.src.medium || x.src.large, page_url: x.url || '', author: txt(x.photographer, 80),
    license: 'Pexels License', license_url: 'https://www.pexels.com/license/', source: 'pexels',
  })) }
}
// คัดผลค้นที่ไม่ใช่บ้านออก (Flickr ติดแท็กกว้าง เช่น อาหารชื่อ "Thai House", ภาพวาดในพิพิธภัณฑ์ — ภาพวาดมีลิขสิทธิ์ของศิลปินซ้อนอยู่)
export const HOUSE_WORD = /(house|home|villa|residen|cottage|bungalow|cabin|chalet|townhouse|interior|living ?room|bedroom|kitchen|courtyard|facade|façade|exterior|dwelling|rumah|minka|machiya)/i
export const NOT_HOUSE = /(painting|paint by|artwork|poster|museum piece|hopper|hockney|food|soup|recipe|restaurant|cafe|menu|moth|bird|parakeet|church|temple|wat |cathedral|iglesia|graveyard|cemetery|school|university|hotel lobby|office|street view|haunted|sims|lego|popsicle|toy|miniature|model railway|opera house|chicken|broiler|poultry|lawyer|courthouse|court house|warehouse|lighthouse|greenhouse|glasshouse|house of (commons|lords|representatives)|parliament|state house|town hall|public house|pub\b|gecko|lizard|cat\b|dog\b|insect|spider|jail|prison)/i
function houseLike(x) {
  const t = `${x.title || ''} ${(x.tags || []).map((g) => g.name).join(' ')}`
  return HOUSE_WORD.test(t) && !NOT_HOUSE.test(x.title || '')
}
// Openverse ตอบช้า (~15 วิ) และบางครั้ง 504 → ลองซ้ำ 1 ครั้ง · ถ้ายังไม่ได้ ใช้ Wikimedia แทน (ดู search route)
async function searchOpenverse(q, page, kind) {
  const u = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=by,by-sa,cc0,pdm&source=flickr&page_size=20&page=${page}&mature=false${kind === 'photo' ? '&category=photograph' : ''}`
  let r
  for (let i = 0; i < 2; i++) {
    r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(35000) })
    if (r.ok || r.status < 500) break
  }
  if (!r.ok) throw new Error(r.status === 429 ? 'ค้นถี่เกินไป รอสักครู่แล้วลองใหม่' : 'แหล่งรูปไม่ตอบ (' + r.status + ')')
  const j = await r.json()
  return { more: page < (j.page_count || 1), items: (j.results || []).filter((x) => ['cc0', 'pdm', 'by', 'by-sa'].includes(x.license) && IMG_HOST.test(x.url || '') && houseLike(x)).map((x) => ({
    kind, title: strip(x.title).slice(0, 120) || q, image_url: x.url, thumb_url: /staticflickr/.test(x.url) ? x.url.replace(/_[a-z]\.jpg$/, '_z.jpg') : x.url,
    page_url: x.foreign_landing_url || '', author: strip(x.creator).slice(0, 80), license: licName(x.license, x.license_version), license_url: x.license_url || '', source: x.source,
  })) }
}
async function searchCommons(q, page, kind) {
  const off = (page - 1) * 20
  const r = await fetch(`https://commons.wikimedia.org/w/api.php?format=json&action=query&generator=search&gsrnamespace=6&gsrlimit=20&gsroffset=${off}&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&iiextmetadatafilter=LicenseShortName|Artist|LicenseUrl|ObjectName`, { headers: UA, signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error('แหล่งรูปไม่ตอบ (' + r.status + ')')
  const j = await r.json()
  const pages = Object.values(j?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0))
  return { more: !!j.continue, items: pages.map((p) => {
    const ii = p.imageinfo?.[0], m = ii?.extmetadata || {}, lic = strip(m.LicenseShortName?.value)
    if (!ii || !FREE_LIC(lic) || !IMG_HOST.test(ii.thumburl || '')) return null
    return { kind, title: (strip(m.ObjectName?.value) || p.title.replace(/^File:/, '').replace(/\.\w+$/, '')).slice(0, 120), image_url: ii.thumburl, thumb_url: ii.thumburl,
      page_url: ii.descriptionurl || '', author: strip(m.Artist?.value).slice(0, 80), license: lic, license_url: strip(m.LicenseUrl?.value), source: 'wikimedia' }
  }).filter(Boolean) }
}

export function createHouseIdeas(d) {
  const { db } = d
  const getSetting = (k) => db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value
  const canManage = (u) => !!u && (u.role === 'admin' || d.isManager(u))
  const COLS = 'kind,title,image_url,thumb_url,page_url,author,license,license_url,source,style,country,note,public'
  const pub = (r) => r && ({ id: r.id, kind: r.kind, title: r.title, image_url: r.image_url, thumb_url: r.thumb_url, page_url: r.page_url, author: r.author, license: r.license, license_url: r.license_url, source: r.source, style: r.style })
  const get = (id) => db.prepare('SELECT * FROM house_ideas WHERE id=?').get(Number(id))

  // ตรวจ/ปัดข้อมูลไอเดียก่อนบันทึก · คืน { error } ถ้าใช้ไม่ได้
  function clean(b, old = {}) {
    const o = { ...old }
    for (const k of ['kind', 'title', 'image_url', 'thumb_url', 'page_url', 'author', 'license', 'license_url', 'source', 'style', 'country', 'note', 'public']) if (b[k] !== undefined) o[k] = b[k]
    o.kind = IDEA_KINDS.includes(o.kind) ? o.kind : 'photo'
    o.title = txt(o.title, 160); o.image_url = imgUrl(o.image_url); o.thumb_url = imgUrl(o.thumb_url) || o.image_url
    o.page_url = url(o.page_url); o.author = txt(o.author, 120); o.license = txt(o.license, 60); o.license_url = url(o.license_url)
    o.source = txt(o.source, 30); o.style = txt(o.style, 40); o.country = txt(o.country, 40); o.note = txt(o.note, 500)
    if (!o.title) return { error: 'ใส่ชื่อไอเดียก่อน' }
    if (o.kind === 'link') { if (!o.page_url) return { error: 'ใส่ลิงก์หน้าเว็บต้นทาง (ขึ้นต้นด้วย http)' } }
    else {
      if (!o.image_url) return { error: 'ใช้ได้เฉพาะรูปจากแหล่งรูปฟรีที่ระบบค้นให้ (Flickr / Wikimedia)' }
      if (!FREE_LIC(o.license)) return { error: 'รูปนี้ไม่มีใบอนุญาตที่ใช้เชิงพาณิชย์ได้' }
    }
    // เว็บลูกค้าแสดงได้เฉพาะรูปใบอนุญาตเสรี — ลิงก์โครงการดังไม่แสดง
    o.public = o.kind !== 'link' && (o.public === true || o.public === 1 || o.public === '1') ? 1 : 0
    return { o }
  }
  const insert = (o, by, byId, seed = 0) => db.prepare(`INSERT INTO house_ideas (at,by,by_id,${COLS},used,seed) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`)
    .run(d.nowTS(), by, byId, o.kind, o.title, o.image_url, o.thumb_url, o.page_url, o.author, o.license, o.license_url, o.source, o.style, o.country, o.note, o.public, seed).lastInsertRowid

  // ชุดตั้งต้น — ใส่ครั้งเดียว (ลบทิ้งแล้วไม่กลับมาเอง)
  function seed() {
    if (getSetting('house_ideas_seeded')) return
    const f = join(dirname(fileURLToPath(import.meta.url)), 'house-ideas-seed.json')
    if (!existsSync(f)) return
    let list = []
    try { list = JSON.parse(readFileSync(f, 'utf8')) } catch { return }
    db.transaction(() => {
      for (const x of list) { const c = clean({ ...x, public: x.kind === 'photo' || x.kind === 'render' ? 1 : 0 }); if (c.o) insert(c.o, 'ชุดตั้งต้น', null, 1) }
      db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run('house_ideas_seeded', d.nowTS())
    })()
  }

  // ไอเดียที่เลือก → ข้อความบอก AI + รูป (ดึงจากต้นทางตอนใช้ ไม่เก็บไว้) · publicOnly = มาจากเว็บลูกค้า
  function pick(ids, publicOnly) {
    const list = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => n > 0))].slice(0, 6)
    return list.map(get).filter((r) => r && (!publicOnly || r.public))
  }
  function ideaText(ids, { publicOnly = false } = {}) {
    const rows = pick(ids, publicOnly)
    if (!rows.length) return ''
    db.prepare(`UPDATE house_ideas SET used=used+1 WHERE id IN (${rows.map(() => '?').join(',')})`).run(...rows.map((r) => r.id))
    return 'แบบที่ลูกค้าชอบ (ใช้เป็นแนวทาง ไม่ต้องลอกแบบ): ' + rows.map((r) => [r.title, r.style && `สไตล์${r.style}`, r.country, r.note].filter(Boolean).join(' · ')).join(' / ')
  }
  async function ideaMedia(ids, { publicOnly = false, max = 3 } = {}) {
    const out = []
    for (const r of pick(ids, publicOnly)) {
      if (out.length >= max) break
      const src = r.image_url || r.thumb_url
      if (!IMG_HOST.test(src || '')) continue
      try {
        const res = await fetch(src, { headers: UA, signal: AbortSignal.timeout(20000) })
        const type = (res.headers.get('content-type') || '').split(';')[0]
        if (!res.ok || !IMG_HOST.test(res.url) || !/^image\/(jpeg|png|webp|gif)$/.test(type)) continue
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length > 4_500_000) continue
        out.push({ type: 'image', source: { type: 'base64', media_type: type, data: buf.toString('base64') } })
      } catch { /* รูปต้นทางหาย — ข้าม */ }
    }
    return out
  }

  const cache = new Map() // คำค้น → { at, data }
  function register(api, { canWrite }) {
    try { seed() } catch (e) { console.error('house_ideas seed:', e.message) }
    api.get('/house-ideas', (_req, res) => {
      res.json(db.prepare("SELECT * FROM house_ideas ORDER BY seed ASC, CASE kind WHEN 'photo' THEN 0 WHEN 'render' THEN 1 WHEN 'plan' THEN 2 ELSE 3 END, CASE WHEN seed=1 THEN id ELSE -id END").all())
    })
    // ค้นรูปฟรีจากเน็ต (ไม่บันทึก) — src: photo = รูปบ้าน (Openverse/Flickr) · plan = แปลน (Wikimedia)
    api.get('/house-ideas/search', async (req, res) => {
      const raw = txt(req.query.q, 120)
      const kind = ['photo', 'render', 'plan'].includes(req.query.kind) ? req.query.kind : 'photo'
      const page = Math.min(20, Math.max(1, parseInt(req.query.page, 10) || 1))
      let q = toEnglishQuery(raw) || 'modern house'
      if (kind === 'plan' && !/plan/i.test(q)) q += ' floor plan'
      if (kind === 'render' && !/render/i.test(q)) q += ' rendering'
      if (kind !== 'plan' && !/house|villa|home|bungalow|townhouse|interior|room|kitchen/i.test(q)) q += ' house'
      const key = `${kind}|${q}|${page}`
      const hit = cache.get(key)
      if (hit && Date.now() - hit.at < 600000) return res.json(hit.data)
      try {
        let r
        if (kind === 'plan') r = await searchCommons(q, page, kind)
        else {
          const pk = getSetting('pexels_key')
          if (pk) r = await searchPexels(pk, q, page, kind)
          else { try { r = await searchOpenverse(q, page, kind) } catch { r = await searchCommons(q, page, kind) } } // แหล่งหลักล่ม → Wikimedia
        }
        const have = new Set(db.prepare('SELECT image_url FROM house_ideas WHERE image_url<>\'\'').all().map((x) => x.image_url))
        const data = { q, page, more: r.more, items: r.items.map((x) => ({ ...x, saved: have.has(x.image_url) })) }
        if (cache.size > 200) cache.clear()
        cache.set(key, { at: Date.now(), data })
        res.json(data)
      } catch (e) {
        res.status(502).json({ error: e.name === 'TimeoutError' ? 'แหล่งรูปตอบช้า ลองใหม่อีกครั้ง' : e.message })
      }
    })
    // ตั้งกุญแจ Pexels (แอดมินเท่านั้น · ไม่ส่งค่ากุญแจกลับมาให้เห็น · ประวัติเก็บเป็น ***)
    api.get('/house-ideas/config', (req, res) => res.json({ pexels: !!getSetting('pexels_key'), can_set: req.user?.role === 'admin' }))
    api.put('/house-ideas/config', (req, res) => {
      if (req.user?.role !== 'admin') return res.status(403).json({ error: 'เฉพาะแอดมิน' })
      const k = txt(req.body?.pexels_key, 120)
      if (k && !/^[A-Za-z0-9]{20,100}$/.test(k)) return res.status(400).json({ error: 'รูปแบบกุญแจ Pexels ไม่ถูกต้อง' })
      db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run('pexels_key', k)
      cache.clear()
      d.audit(req, 'ตั้งกุญแจ Pexels (ห้องรวมไอเดีย)', k ? 'ตั้ง/เปลี่ยนกุญแจ' : 'ลบกุญแจ')
      res.json({ pexels: !!k, can_set: true })
    })
    api.post('/house-ideas', canWrite, (req, res) => {
      const c = clean(req.body || {})
      if (c.error) return res.status(400).json({ error: c.error })
      if (c.o.image_url && db.prepare('SELECT id FROM house_ideas WHERE image_url=?').get(c.o.image_url)) return res.status(409).json({ error: 'รูปนี้อยู่ในคลังแล้ว' })
      const id = insert(c.o, req.user?.name || '', req.user?.id || null)
      d.audit(req, 'เพิ่มไอเดียแบบบ้าน', `#${id} ${c.o.title}`)
      res.json(get(id))
    })
    api.put('/house-ideas/:id', canWrite, (req, res) => {
      const r = get(req.params.id)
      if (!r) return res.status(404).json({ error: 'ไม่พบไอเดียนี้' })
      // แก้ได้แค่หมวด/ข้อมูลประกอบ — ลิงก์รูปและเครดิตเจ้าของภาพแก้ไม่ได้ (กันเครดิตหาย)
      const b = req.body || {}
      const c = clean({ kind: b.kind, title: b.title, style: b.style, country: b.country, note: b.note, public: b.public, page_url: r.kind === 'link' ? b.page_url : undefined }, r)
      if (c.error) return res.status(400).json({ error: c.error })
      if ((r.kind === 'link') !== (c.o.kind === 'link')) return res.status(400).json({ error: 'เปลี่ยนลิงก์เป็นรูป (หรือรูปเป็นลิงก์) ไม่ได้' })
      db.prepare('UPDATE house_ideas SET kind=?, title=?, page_url=?, style=?, country=?, note=?, public=? WHERE id=?').run(c.o.kind, c.o.title, c.o.page_url, c.o.style, c.o.country, c.o.note, c.o.public, r.id)
      res.json(get(r.id))
    })
    api.delete('/house-ideas/:id', canWrite, (req, res) => {
      const r = get(req.params.id)
      if (!r) return res.status(404).json({ error: 'ไม่พบไอเดียนี้' })
      if (!(canManage(req.user) || (r.by_id && r.by_id === req.user?.id))) return res.status(403).json({ error: 'ลบได้เฉพาะคนที่เพิ่ม หรือผู้จัดการ/แอดมิน' })
      db.prepare('DELETE FROM house_ideas WHERE id=?').run(r.id)
      d.audit(req, 'ลบไอเดียแบบบ้าน', `#${r.id} ${r.title}`)
      res.json({ ok: true })
    })
  }

  // เว็บลูกค้า (ไม่ต้องล็อกอิน) — เฉพาะรูปที่เปิดให้แสดง
  const publicRouter = express.Router()
  publicRouter.get('/house-ideas', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.json(db.prepare('SELECT * FROM house_ideas WHERE public=1 ORDER BY used DESC, id DESC LIMIT 500').all().map(pub))
  })

  return { register, publicRouter, ideaText, ideaMedia }
}
