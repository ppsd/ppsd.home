// ถอดแบบ + BOQ บน Cloudflare (ppsd-office.pages.dev/takeoff) — หน้าจอเดียวกับ ERP (รวมจาก src/components/cost ตอน deploy)
// งานหนัก (แปลง DWG · อ่าน DXF · จับคู่ราคากลาง) ทำในเบราว์เซอร์ · ที่นี่ = เก็บข้อมูล + ส่งต่อคำขอ AI แบบสตรีม (ไม่แตะเนื้อไฟล์)
// ERP ↔ ที่นี่: POST /sync /pull /ack /mode — ต้องมี TAKEOFF_SYNC_TOKEN
// ผู้ใช้: POST /login (ชื่อผู้ใช้ + PIN เดิม · รหัสตรวจ PIN เดียวกับเงินเดือนออนไลน์ PIN_KEY) → โทเคน 12 ชม.
// สิทธิ์เหมือน ERP: ใช้ได้ = แอดมิน/บัญชี/ผู้จัดการ-CEO · เพิ่มราคากลาง = แอดมิน/บัญชี · ปลดล็อก BOQ = แอดมิน
const J = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
const err = (msg, status = 400) => J({ error: msg }, status)
const eq = (a, b) => { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0 }
const bkk = () => new Date(Date.now() + 7 * 3600e3)
const p2 = (n) => String(n).padStart(2, '0')
const nowTS = () => bkk().toISOString().slice(0, 19).replace('T', ' ')
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const todayTH = () => { const d = bkk(); return `${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]} ${p2((d.getUTCFullYear() + 543) % 100)}` }
const docYear = () => p2((bkk().getUTCFullYear() + 543) % 100)
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const b64u = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64u = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)))
}
const isSync = (env, req) => !!env.TAKEOFF_SYNC_TOKEN && eq((req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''), env.TAKEOFF_SYNC_TOKEN)
const jparse = (s, d) => { try { return JSON.parse(s) ?? d } catch { return d } }

export async function getDs(db, name) { const r = await db.prepare('SELECT data FROM ds WHERE name=?').bind(name).first(); return r ? JSON.parse(r.data) : null }
const getMeta = async (db, k, d = '') => (await db.prepare('SELECT v FROM meta WHERE k=?').bind(k).first())?.v ?? d
const setMeta = (db, k, v) => db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').bind(k, String(v)).run()
const audit = (db, u, action, detail = '') => db.prepare('INSERT INTO audit (at, who, action, detail) VALUES (?, ?, ?, ?)').bind(nowTS(), u?.name || '-', action, String(detail).slice(0, 500)).run()

// ---- ลงชื่อเข้าใช้ ----
async function signToken(env, uid) { const body = b64u(JSON.stringify({ uid, exp: Date.now() + 12 * 3600e3 })); return body + '.' + await hmac(env.TAKEOFF_SESSION_KEY, body) }
async function authUser(env, req) {
  const t = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const [body, sig] = t.split('.')
  if (!body || !sig || !eq(await hmac(env.TAKEOFF_SESSION_KEY, body), sig)) return null
  let p; try { p = JSON.parse(unb64u(body)) } catch { return null }
  if (!p.exp || p.exp < Date.now()) return null
  return ((await getDs(env.TAKEOFF_DB, 'users')) || []).find((x) => x.id === p.uid) || null // ถอดสิทธิ์/ปิดบัญชีใน ERP → หลุดภายใน 1 นาที
}
const pub = (u) => ({ id: u.id, name: u.name, username: u.username, role: u.role, position: u.position || '', can_add_price: !!u.can_add_price })
async function login(env, b) {
  const db = env.TAKEOFF_DB
  const uname = String(b.username || '').trim().toLowerCase(), pin = String(b.pin || '')
  const key = 'login:' + uname
  const f = await db.prepare('SELECT n, until FROM fails WHERE k=?').bind(key).first()
  if (f && f.until > Date.now()) return err('ใส่ PIN ผิดหลายครั้ง — ล็อกชั่วคราว ลองใหม่ใน 5 นาที', 429)
  const u = ((await getDs(db, 'users')) || []).find((x) => String(x.username || '').toLowerCase() === uname)
  const ok = u && u.hash && /^\d{4,8}$/.test(pin) && eq(await hmac(env.PIN_KEY, uname + ':' + pin), u.hash)
  if (!ok) {
    const n = (f?.n || 0) + 1
    await db.prepare('INSERT INTO fails (k, n, until) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET n=excluded.n, until=excluded.until').bind(key, n >= 5 ? 0 : n, n >= 5 ? Date.now() + 5 * 60e3 : 0).run()
    if (u && !u.hash) return err('ยังเปิดใช้ถอดแบบออนไลน์ให้บัญชีนี้ไม่ได้ — ล็อกอิน ERP ในออฟฟิศ 1 ครั้งก่อน แล้วกลับมาล็อกอินที่นี่', 403)
    return err('ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง (หรือบัญชีนี้ไม่มีสิทธิ์ใช้ BOQ — เฉพาะแอดมิน/บัญชี/ผู้จัดการ)', 401)
  }
  if (f) await db.prepare('DELETE FROM fails WHERE k=?').bind(key).run()
  await audit(db, u, 'ล็อกอินถอดแบบออนไลน์')
  return J({ token: await signToken(env, u.id), user: pub(u) })
}

// ---- ERP → ที่นี่ ----
const ERP_OWNED_WHEN_LIVE = ['boqs'] // เปิดใช้แล้ว: BOQ บนนี้เป็นตัวหลัก ERP ส่งทับไม่ได้
async function sync(env, b) {
  const db = env.TAKEOFF_DB, st = [], now = nowTS()
  const live = (await getMeta(db, 'mode', 'mirror')) === 'live'
  for (const x of Array.isArray(b.datasets) ? b.datasets : []) {
    if (!x || typeof x.name !== 'string' || typeof x.sha !== 'string') continue
    if (x.name === 'boqs') { if (live || !Array.isArray(x.data)) continue; st.push(...boqReplace(db, x.data)) }
    if (x.data === null) { st.push(db.prepare('DELETE FROM ds WHERE name=?').bind(x.name)); continue }
    st.push(db.prepare('INSERT INTO ds (name, sha, data, at) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET sha=excluded.sha, data=excluded.data, at=excluded.at').bind(x.name, x.sha, JSON.stringify(x.name === 'boqs' ? [] : x.data), now))
  }
  for (let i = 0; i < st.length; i += 50) await db.batch(st.slice(i, i + 50))
  await setMeta(db, 'last_sync', now)
  const have = Object.fromEntries(((await db.prepare('SELECT name, sha FROM ds').all()).results || []).map((r) => [r.name, r.sha]))
  return J({ ok: true, have, received: st.length })
}
const BOQ_COLS = ['id', 'no', 'house_code', 'title', 'markup_pct', 'vat_pct', 'items', 'work', 'by', 'date', 'created', 'root_id', 'rev', 'rev_note', 'locked', 'locked_at', 'locked_by']
// แทนตาราง BOQ ทั้งหมดด้วยของ ERP (ช่วงยังไม่เปิดใช้ / ตอนย้ายมาใช้ที่นี่)
function boqReplace(db, rows) {
  const st = [db.prepare('DELETE FROM boqs')]
  for (const r of rows) st.push(db.prepare(`INSERT INTO boqs (${BOQ_COLS.join(',')}) VALUES (${BOQ_COLS.map(() => '?').join(',')})`)
    .bind(...BOQ_COLS.map((c) => c === 'items' || c === 'work' ? (typeof r[c] === 'string' ? r[c] : JSON.stringify(r[c] ?? [])) : (r[c] ?? null))))
  return st
}
async function pull(db) {
  const all = async (sql) => (await db.prepare(sql).all()).results || []
  return {
    mode: await getMeta(db, 'mode', 'mirror'),
    boqs: await all('SELECT * FROM boqs ORDER BY id'),
    materials: await all('SELECT * FROM new_materials WHERE erp_id IS NULL ORDER BY tmp_id DESC'),
    aliases: await all('SELECT * FROM new_aliases WHERE synced=0 ORDER BY id LIMIT 1000'),
    commands: await all('SELECT * FROM commands WHERE synced=0 ORDER BY id LIMIT 100'),
    audit: await all('SELECT * FROM audit WHERE synced=0 ORDER BY id LIMIT 500'),
    usage: await all('SELECT * FROM usage WHERE synced=0 ORDER BY id LIMIT 500'),
  }
}
// ERP สร้างราคากลางจริงแล้ว → เปลี่ยนรหัสชั่วคราวในทุก BOQ / ชื่อเรียกเป็นรหัสจริง
async function ack(db, b) {
  const map = (Array.isArray(b.materials) ? b.materials : []).filter((x) => Number(x.tmp_id) < 0 && Number(x.erp_id) > 0)
  const st = []
  for (const x of map) {
    st.push(db.prepare('UPDATE new_materials SET erp_id=? WHERE tmp_id=?').bind(Number(x.erp_id), Number(x.tmp_id)))
    st.push(db.prepare('UPDATE new_aliases SET mp_id=? WHERE mp_id=?').bind(Number(x.erp_id), Number(x.tmp_id)))
  }
  if (map.length) {
    const m = new Map(map.map((x) => [Number(x.tmp_id), Number(x.erp_id)]))
    for (const r of (await db.prepare('SELECT id, items FROM boqs').all()).results || []) {
      const items = jparse(r.items, [])
      let hit = false
      for (const it of items) if (m.has(Number(it.ref))) { it.ref = m.get(Number(it.ref)); hit = true }
      if (hit) st.push(db.prepare('UPDATE boqs SET items=? WHERE id=?').bind(JSON.stringify(items), r.id))
    }
  }
  for (const [t, ids] of [['new_aliases', b.aliases], ['commands', b.commands], ['audit', b.audit], ['usage', b.usage]])
    for (const id of (Array.isArray(ids) ? ids : []).slice(0, 1000)) st.push(db.prepare(`UPDATE ${t} SET synced=1 WHERE id=?`).bind(Number(id)))
  for (let i = 0; i < st.length; i += 50) await db.batch(st.slice(i, i + 50))
  return J({ ok: true })
}

// ---- BOQ (กติกาเดียวกับ ERP server/index.js) ----
const BOQ_LOCKED = 'BOQ ฉบับนี้ล็อกแล้ว (ฉบับเซ็นสัญญา) — แก้ไม่ได้ ให้สร้างฉบับใหม่แทน'
const boqRow = (r) => r ? { ...r, items: jparse(r.items, []), work: jparse(r.work, []), rev: r.rev || 1, root_id: r.root_id || null, locked: r.locked ? 1 : 0 } : r
const getBoq = (db, id) => db.prepare('SELECT * FROM boqs WHERE id=?').bind(Number(id)).first()
async function nextBoqRev(db, base) {
  const root = base.root_id || base.id
  const max = (await db.prepare('SELECT MAX(COALESCE(rev,1)) m FROM boqs WHERE id=? OR root_id=?').bind(root, root).first())?.m || 1
  return { root, rev: max + 1, no: (await getBoq(db, root))?.no || base.no }
}
async function seqFirst(db) {
  const rows = (await db.prepare('SELECT no FROM boqs WHERE root_id IS NULL').all()).results || []
  const max = rows.reduce((m, r) => { const x = String(r.no || '').match(/(\d+)$/); return x ? Math.max(m, Number(x[1])) : m }, 0)
  return Math.max(max, rows.length) + 1
}
async function insertBoq(db, f) {
  const r = await db.prepare('INSERT INTO boqs (no,house_code,title,markup_pct,vat_pct,items,work,by,date,created,root_id,rev,rev_note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id')
    .bind(f.no, f.house_code, f.title, f.markup_pct, f.vat_pct, f.items, f.work, f.by, todayTH(), todayTH(), f.root_id ?? null, f.rev ?? 1, f.rev_note ?? '').first()
  return boqRow(await getBoq(db, r.id))
}
function boqGrand(d) {
  const items = jparse(d.items, [])
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * ((Number(it.mat) || 0) + (Number(it.lab) || 0)), 0)
  const afterMarkup = subtotal + subtotal * (Number(d.markup_pct) || 0) / 100
  return Math.round(afterMarkup + afterMarkup * (Number(d.vat_pct) || 0) / 100)
}
async function boqRoute(db, u, m, seg, b) {
  if (m === 'POST' && seg.length === 1) {
    const base = b.revise_of ? await getBoq(db, b.revise_of) : null
    if (b.revise_of && !base) return err('ไม่พบ BOQ ที่จะสร้างฉบับใหม่', 404)
    const nr = base ? await nextBoqRev(db, base) : null
    const no = nr ? nr.no : `BOQ-${docYear()}-${String(await seqFirst(db)).padStart(3, '0')}`
    const row = await insertBoq(db, { no, house_code: b.house_code || '', title: b.title || 'ประมาณราคาก่อสร้าง', markup_pct: Number(b.markup_pct) || 0, vat_pct: Number(b.vat_pct) || 0,
      items: JSON.stringify(b.items || []), work: JSON.stringify(Array.isArray(b.work) ? b.work : []), by: u.name, root_id: nr ? nr.root : null, rev: nr ? nr.rev : 1, rev_note: String(b.rev_note || '').slice(0, 200) })
    await audit(db, u, nr ? 'สร้าง BOQ ฉบับใหม่' : 'สร้าง BOQ', nr ? `${no} R${nr.rev}` : no)
    return J(row, 201)
  }
  const d = await getBoq(db, seg[1])
  if (m === 'PUT' && seg.length === 2) {
    if (!d) return err('ไม่พบ BOQ', 404)
    if (d.locked) return err(BOQ_LOCKED, 409)
    await db.prepare('UPDATE boqs SET house_code=?, title=?, markup_pct=?, vat_pct=?, items=?, work=?, rev_note=? WHERE id=?')
      .bind(b.house_code ?? d.house_code, b.title ?? d.title, b.markup_pct != null ? Number(b.markup_pct) : d.markup_pct, b.vat_pct != null ? Number(b.vat_pct) : d.vat_pct,
        b.items ? JSON.stringify(b.items) : d.items, Array.isArray(b.work) ? JSON.stringify(b.work) : d.work, b.rev_note != null ? String(b.rev_note).slice(0, 200) : d.rev_note, d.id).run()
    return J(boqRow(await getBoq(db, d.id)))
  }
  if (m === 'DELETE' && seg.length === 2) {
    if (d?.locked) return err('BOQ ฉบับนี้ล็อกแล้ว (ฉบับเซ็นสัญญา) — ลบไม่ได้', 409)
    if (!d) return J({ ok: true })
    const st = [db.prepare('DELETE FROM boqs WHERE id=?').bind(d.id)]
    if (!d.root_id) { // ลบฉบับแรกของชุด → ฉบับเก่าสุดที่เหลือเป็นฉบับแรกแทน
      const rest = (await db.prepare('SELECT id FROM boqs WHERE root_id=? ORDER BY rev, id').bind(d.id).all()).results || []
      if (rest.length) st.push(db.prepare('UPDATE boqs SET root_id=NULL WHERE id=?').bind(rest[0].id), db.prepare('UPDATE boqs SET root_id=? WHERE root_id=?').bind(rest[0].id, d.id))
    }
    await db.batch(st)
    await audit(db, u, 'ลบ BOQ', `${d.no} R${d.rev || 1}`)
    return J({ ok: true })
  }
  if (!d) return err('ไม่พบ BOQ', 404)
  if (m === 'POST' && seg[2] === 'revise') {
    const nr = await nextBoqRev(db, d)
    const row = await insertBoq(db, { no: nr.no, house_code: d.house_code, title: d.title, markup_pct: d.markup_pct, vat_pct: d.vat_pct, items: d.items, work: d.work, by: u.name, root_id: nr.root, rev: nr.rev, rev_note: String(b.note || `แก้จากฉบับ R${d.rev || 1}`).slice(0, 200) })
    await audit(db, u, 'สร้าง BOQ ฉบับใหม่', `${nr.no} R${nr.rev} (จาก R${d.rev || 1})`)
    return J(row, 201)
  }
  if (m === 'POST' && seg[2] === 'lock') {
    const lock = b.locked !== false
    if (!lock && u.role !== 'admin') return err('ปลดล็อกฉบับเซ็นสัญญาได้เฉพาะแอดมิน', 403)
    await db.prepare('UPDATE boqs SET locked=?, locked_at=?, locked_by=? WHERE id=?').bind(lock ? 1 : 0, lock ? nowTS() : null, lock ? u.name : null, d.id).run()
    await audit(db, u, lock ? 'ล็อก BOQ (ฉบับเซ็นสัญญา)' : 'ปลดล็อก BOQ', `${d.no} R${d.rev || 1}`)
    return J(boqRow(await getBoq(db, d.id)))
  }
  if (m === 'POST' && seg[2] === 'push-to-house') {
    if (!d.house_code) return err('BOQ นี้ยังไม่ได้เลือกบ้าน — กรุณาเลือกบ้านก่อน')
    if (!((await getDs(db, 'houses')) || []).some((h) => h.code === d.house_code)) return err('ไม่พบบ้านที่ผูกกับ BOQ นี้', 404)
    const mode = b.mode === 'installment' ? 'installment' : 'price'
    await db.prepare('INSERT INTO commands (kind, boq_id, mode, by, at) VALUES (?, ?, ?, ?, ?)').bind('push-to-house', d.id, mode, u.name, nowTS()).run()
    return J({ ok: true, grand: boqGrand(d), queued: true })
  }
  return err('ไม่พบคำสั่งนี้', 404)
}

// ---- AI: ส่งต่อคำขอแบบสตรีม (กุญแจ AI อยู่ที่นี่เท่านั้น ไม่ส่งไปหน้าเว็บ) ----
// body = บรรทัดแรกเป็น JSON {prompt, max_tokens, model, tools, effort} · ที่เหลือ = content block รูป/PDF ต่อกันด้วยคอมมา (ไม่แปลง/ไม่อ่านซ้ำ เพื่อไม่กินเวลาประมวลผล)
async function aiProxy(env, request) {
  if (!env.AI_KEY) return err('ยังไม่ได้ตั้งค่ากุญแจ AI บน Cloudflare — ผู้ดูแลรัน deploy-office ใหม่หลังตั้งกุญแจใน ERP', 400)
  const total = Number(request.headers.get('Content-Length') || 0)
  if (!request.body || !total) return err('ข้อมูลไม่ถูกต้อง')
  const reader = request.body.getReader()
  let first = new Uint8Array(0), nl = -1
  while (nl < 0) {
    const { value, done } = await reader.read()
    if (done) break
    const next = new Uint8Array(first.length + value.length); next.set(first); next.set(value, first.length); first = next
    nl = first.indexOf(10)
    if (nl < 0 && first.length > 200000) return err('ข้อมูลไม่ถูกต้อง')
  }
  if (nl < 0) return err('ข้อมูลไม่ถูกต้อง')
  let meta; try { meta = JSON.parse(new TextDecoder().decode(first.subarray(0, nl))) } catch { return err('ข้อมูลไม่ถูกต้อง') }
  const rest = first.subarray(nl + 1)
  const mediaLen = total - (nl + 1)
  const cfg = (await getDs(env.TAKEOFF_DB, 'config')) || {}
  const model = String(meta.model || cfg.model || 'claude-opus-5-5')
  const body = { model, max_tokens: Math.min(64000, Number(meta.max_tokens) || 16000), stream: true }
  if (Array.isArray(meta.tools) && meta.tools.length) body.tools = meta.tools
  if (!/haiku/.test(model)) body.output_config = { effort: ['low', 'medium', 'high'].includes(meta.effort) ? meta.effort : 'low' }
  const enc = new TextEncoder()
  const headJson = JSON.stringify(body)
  const head = enc.encode(headJson.slice(0, -1) + ',"messages":[{"role":"user","content":[')
  const tail = enc.encode((mediaLen > 0 ? ',' : '') + JSON.stringify({ type: 'text', text: String(meta.prompt || '') }) + ']}]}')
  const { readable, writable } = new FixedLengthStream(head.length + mediaLen + tail.length)
  const pump = (async () => {
    const w = writable.getWriter()
    await w.write(head)
    if (rest.length) await w.write(rest)
    for (;;) { const { value, done } = await reader.read(); if (done) break; await w.write(value) }
    await w.write(tail); await w.close()
  })()
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env.AI_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: readable })
  pump.catch(() => {})
  return new Response(r.body, { status: r.status, headers: { 'Content-Type': r.headers.get('content-type') || 'text/event-stream', 'Cache-Control': 'no-store', 'X-Model': model } })
}

export async function onRequest({ request, env, params }) {
  const path = '/' + [].concat(params.path || []).join('/')
  const seg = path.split('/').filter(Boolean)
  const m = request.method
  const db = env.TAKEOFF_DB
  try {
    // AI อ่านเนื้อคำขอเป็นสตรีมเอง — ต้องเช็กสิทธิ์ก่อนอ่าน body
    if (m === 'POST' && path === '/ai') {
      const u = await authUser(env, request)
      if (!u) return err('กรุณาล็อกอินใหม่', 401)
      if ((await getMeta(db, 'mode', 'mirror')) !== 'live') return err('ยังไม่เปิดใช้ถอดแบบบนนี้ — ช่วงนี้ทำใน ERP ไปก่อน', 409)
      return aiProxy(env, request)
    }
    let b = {}
    if (m === 'POST' || m === 'PUT') { try { b = await request.json() } catch { return err('ข้อมูลไม่ถูกต้อง') } }
    // ---- ERP ↔ Cloudflare ----
    if (m === 'POST' && ['/sync', '/pull', '/ack', '/mode'].includes(path)) {
      if (!isSync(env, request)) return err('unauthorized', 401)
      if (path === '/sync') return sync(env, b)
      if (path === '/pull') return J(await pull(db))
      if (path === '/ack') return ack(db, b)
      if (!['live', 'mirror'].includes(b.mode)) return err('mode')
      await setMeta(db, 'mode', b.mode)
      return J({ ok: true, mode: b.mode })
    }
    if (m === 'GET' && path === '/health') return J({ ok: true, last_sync: await getMeta(db, 'last_sync', ''), mode: await getMeta(db, 'mode', 'mirror') })
    if (m === 'POST' && path === '/login') return login(env, b)
    // ---- ต้องล็อกอิน ----
    const u = await authUser(env, request)
    if (!u) return err('กรุณาล็อกอินใหม่', 401)
    const mode = await getMeta(db, 'mode', 'mirror')
    if (m === 'GET' && path === '/me') {
      const cfg = (await getDs(db, 'config')) || {}
      return J({ user: pub(u), mode, last_sync: await getMeta(db, 'last_sync', ''), houses: (await getDs(db, 'houses')) || [], config: { model: cfg.model || '', search_model: cfg.search_model || '', prices: cfg.prices || {}, shops: cfg.shops || '' } })
    }
    if (m === 'GET' && path === '/labor-rates') return J((await getDs(db, 'labor_rates')) || [])
    if (m === 'GET' && path === '/material-prices') {
      const all = new URL(request.url).searchParams.get('all') === '1'
      const list = ((await getDs(db, 'materials')) || []).filter((x) => all || x.active)
      const pending = ((await db.prepare('SELECT * FROM new_materials WHERE erp_id IS NULL ORDER BY tmp_id DESC').all()).results || [])
        .map((x) => ({ id: x.tmp_id, name: x.name, unit: x.unit, central: x.central, min: x.central, max: x.central, latest: x.central, confidence: 'กำหนดเอง', source: 'กำหนดเอง', note: x.note, active: 1, po_count: 0 }))
      return J([...pending, ...list])
    }
    if (m === 'GET' && path === '/material-aliases') {
      const pending = ((await db.prepare('SELECT alias, unit, mp_id FROM new_aliases WHERE synced=0').all()).results || [])
      return J([...((await getDs(db, 'aliases')) || []), ...pending.map((a) => ({ ...a, nkey: '' }))])
    }
    if (m === 'GET' && path === '/boqs') return J(((await db.prepare('SELECT * FROM boqs ORDER BY id DESC').all()).results || []).map(boqRow))
    if (m === 'GET' && seg[0] === 'cache' && seg[1]) {
      const r = await db.prepare('SELECT * FROM cache WHERE key=?').bind(seg[1]).first()
      if (r) await db.prepare('UPDATE cache SET hits=hits+1 WHERE key=?').bind(seg[1]).run()
      return J(r ? { ...r, parsed: jparse(r.parsed, null) } : null)
    }
    if (m === 'GET') return err('ไม่พบหน้านี้', 404)
    // ---- คำสั่งแก้ไข: เปิดใช้แล้วเท่านั้น ----
    if (mode !== 'live') return err('ยังไม่เปิดใช้ถอดแบบ/BOQ บนนี้ — ช่วงนี้ทำใน ERP ไปก่อน', 409)
    if (seg[0] === 'boqs') return boqRoute(db, u, m, seg, b)
    if (m === 'POST' && path === '/material-prices') {
      if (!u.can_add_price) return err('เพิ่มราคากลางได้เฉพาะแอดมิน/บัญชี', 403)
      const name = String(b.name || '').trim()
      if (!name) return err('กรุณากรอกชื่อวัสดุ')
      const low = (await db.prepare('SELECT MIN(tmp_id) m FROM new_materials').first())?.m
      const tmp = Math.min(-1, (Number(low) || 0) - 1)
      const central = Number(b.central) || 0
      await db.prepare('INSERT INTO new_materials (tmp_id, name, unit, central, note, by, at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(tmp, name, String(b.unit || ''), central, String(b.note || ''), u.name, nowTS()).run()
      await audit(db, u, 'เพิ่มราคากลางวัสดุ', `${name} ฿${central}`)
      return J({ id: tmp, name, unit: String(b.unit || ''), central, confidence: 'กำหนดเอง' }, 201)
    }
    if (m === 'POST' && path === '/material-aliases') {
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 500).filter((it) => String(it.alias || '').trim() && Number(it.mp_id))
      const st = items.map((it) => db.prepare('INSERT INTO new_aliases (alias, unit, mp_id, by, at) VALUES (?, ?, ?, ?, ?)').bind(String(it.alias).trim().slice(0, 300), String(it.unit || '').slice(0, 30), Number(it.mp_id), u.name, nowTS()))
      for (let i = 0; i < st.length; i += 50) await db.batch(st.slice(i, i + 50))
      return J({ ok: true, saved: items.length })
    }
    if (m === 'PUT' && seg[0] === 'cache' && seg[1]) {
      await db.prepare('INSERT OR REPLACE INTO cache (key, label, model, parsed, cost_usd, created, hits) VALUES (?, ?, ?, ?, ?, ?, 0)').bind(seg[1], String(b.label || '').slice(0, 300), String(b.model || ''), JSON.stringify(b.parsed ?? null), Number(b.cost_usd) || 0, nowTS()).run()
      return J({ ok: true })
    }
    if (m === 'POST' && path === '/usage') {
      await db.prepare('INSERT INTO usage (at, feature, model, by, ok, data) VALUES (?, ?, ?, ?, ?, ?)').bind(nowTS(), String(b.feature || 'ถอดแบบ').slice(0, 80), String(b.model || '').slice(0, 80), u.name, b.ok ? 1 : 0, JSON.stringify(b.usage || {})).run()
      return J({ ok: true })
    }
    if (m === 'POST' && path === '/audit') { await audit(db, u, String(b.action || '').slice(0, 120), b.detail || ''); return J({ ok: true }) }
    return err('ไม่พบคำสั่งนี้', 404)
  } catch (e) { return err('ระบบขัดข้อง: ' + (e?.message || e), 500) }
}
