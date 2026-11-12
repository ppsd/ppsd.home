// ถอดแบบ + BOQ บน Cloudflare: ERP จริง (ฐานข้อมูลทดสอบ) ↔ โค้ด Cloudflare จริง (functions/api/takeoff · D1 จำลองด้วย SQLite)
//  ส่งราคากลาง/ผู้ใช้ขึ้น · ล็อกอิน PIN · ช่วงยังไม่เปิดใช้แก้ไม่ได้ · ย้ายไปใช้ (ส่ง BOQ ขึ้น · ERP ดูอย่างเดียว)
//  สร้าง BOQ + ราคากลางใหม่ + ชื่อเรียก + ดันเข้าราคาขายบ้าน บน Cloudflare → ERP ดึงกลับ (รหัสราคากลางจริง · ไม่ทำซ้ำ) · AI ส่งต่อแบบสตรีม
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, cpSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { Readable } from 'node:stream'

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const Database = createRequire(join(root, 'package.json'))('better-sqlite3')
const PORT = 3341, CLOUD = 3342, BASE = `http://localhost:${PORT}/api`
let child, tmp, dbFile, token, cloud, fn
const anthropicCalls = []

// D1 จำลอง (prepare/bind/first/all/run/batch)
class Stmt { constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args } bind(...a) { return new Stmt(this.db, this.sql, a) }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null } async all() { return { results: this.db.prepare(this.sql).all(...this.args) } } async run() { this.db.prepare(this.sql).run(...this.args); return {} } }
class D1 { constructor(db) { this.db = db } prepare(sql) { return new Stmt(this.db, sql) } async batch(st) { this.db.transaction(() => st.forEach((s) => this.db.prepare(s.sql).run(...s.args)))() } }
// สิ่งที่มีใน Cloudflare Workers แต่ไม่มีใน Node
globalThis.FixedLengthStream ??= class { constructor() { const t = new TransformStream(); this.readable = t.readable; this.writable = t.writable } }
const realFetch = globalThis.fetch
globalThis.fetch = async (url, opt = {}) => {
  if (String(url).startsWith('https://api.anthropic.com/')) { // AI ปลอม: ตอบแบบสตรีม (SSE)
    const body = JSON.parse(await new Response(opt.body).text())
    anthropicCalls.push({ key: opt.headers['x-api-key'], body })
    const ev = (o) => `event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`
    const sse = ev({ type: 'message_start', message: { usage: { input_tokens: 1200, output_tokens: 1 } } }) + ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '{"sections":[]' } })
      + ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ',"notes":["ok"]}' } }) + ev({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 40 } })
    return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  return realFetch(url, opt)
}
const sq = new Database(':memory:')
const env = { TAKEOFF_DB: new D1(sq), TAKEOFF_SYNC_TOKEN: 'tk-sync', TAKEOFF_SESSION_KEY: 'tk-sess', PIN_KEY: 'pin-k', AI_KEY: 'ai-test-key' }
const api = async (m, p, b) => { const r = await fetch(BASE + p, { method: m, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: b === undefined ? undefined : JSON.stringify(b) }); let d = null; try { d = await r.json() } catch {} return { status: r.status, data: d } }
const cf = async (m, p, b, tok) => { const r = await fetch(`http://localhost:${CLOUD}/api/takeoff` + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: b === undefined ? undefined : JSON.stringify(b) }); let d = null; try { d = await r.json() } catch {} return { status: r.status, data: d } }
const erpDb = () => new Database(dbFile)

before(async () => {
  const fdir = mkdtempSync(join(tmpdir(), 'ppsd-tkfn-'))
  mkdirSync(join(fdir, 'f'), { recursive: true })
  cpSync(join(root, 'cloudflare', 'ppsd-office', 'functions', 'api', 'takeoff', '[[path]].js'), join(fdir, 'f', 'fn.mjs'))
  fn = await import(pathToFileURL(join(fdir, 'f', 'fn.mjs')).href)
  sq.exec(readFileSync(join(root, 'cloudflare', 'ppsd-office', 'schema', 'takeoff.sql'), 'utf8'))
  // เซิร์ฟเวอร์ Cloudflare จำลอง: แปลงคำขอ Node → Request แล้วเรียก onRequest ของจริง
  cloud = createServer(async (req, res) => {
    const path = req.url.replace(/^\/api\/takeoff/, '').split('?')[0]
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string'))
    const hasBody = !['GET', 'HEAD'].includes(req.method)
    const request = new Request('https://x.test' + req.url, { method: req.method, headers, body: hasBody ? Readable.toWeb(req) : undefined, duplex: 'half' })
    const r = await fn.onRequest({ request, env, params: { path: path.split('/').filter(Boolean) } })
    res.writeHead(r.status, Object.fromEntries(r.headers))
    res.end(Buffer.from(await r.arrayBuffer()))
  }).listen(CLOUD)
  tmp = mkdtempSync(join(tmpdir(), 'ppsd-cloudtk-')); dbFile = join(tmp, 't.sqlite')
  child = spawn(process.execPath, [join(root, 'server', 'index.js')], { cwd: root, env: { ...process.env, PORT: String(PORT), PPSD_DB: dbFile, PPSD_NO_TUNNEL: '1' }, stdio: 'ignore' })
  for (let i = 0; i < 80 && !token; i++) { try { const r = await api('POST', '/login', { username: 'thawat', pin: '1234' }); token = r.data?.token } catch {} if (!token) await new Promise((r) => setTimeout(r, 300)) }
})
after(() => { child?.kill('SIGKILL'); cloud?.close(); globalThis.fetch = realFetch; try { rmSync(tmp, { recursive: true, force: true }) } catch {} })

test('ถอดแบบ/BOQ บน Cloudflare: ซิงก์ · ล็อกอิน · ย้ายไปใช้ · ทำ BOQ/ราคากลาง/ดันเข้าบ้านบน Cloudflare แล้ว ERP ดึงกลับถูกต้อง ไม่ซ้ำ · กลับมาใช้ ERP ได้', async () => {
  assert.ok(token, 'ล็อกอิน ERP ได้')
  const d = erpDb()
  const set = (k, v) => d.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, v)
  set('cloud_takeoff_url', `http://localhost:${CLOUD}/takeoff`); set('cloud_takeoff_token', 'tk-sync'); set('cloud_payroll_pin_key', 'pin-k')
  // ล็อกอิน ERP ใหม่หลังตั้งกุญแจ → เก็บรหัสตรวจ PIN ให้ใช้บน Cloudflare
  token = (await api('POST', '/login', { username: 'thawat', pin: '1234' })).data.token
  const house = d.prepare('SELECT code, name FROM houses LIMIT 1').get()
  assert.ok(house, 'มีบ้านตัวอย่าง')
  const mpCount = () => d.prepare('SELECT COUNT(*) c FROM material_prices').get().c
  const mp0 = mpCount()
  // BOQ เดิมใน ERP
  const b0 = await api('POST', '/boqs', { house_code: house.code, title: 'BOQ จาก ERP', markup_pct: 10, vat_pct: 7, items: [{ cat: 'โครงสร้าง', desc: 'ปูน', qty: 10, unit: 'ถุง', mat: 150, lab: 0 }] })
  assert.equal(b0.status, 201)

  // 1) ซิงก์ขึ้น
  const s1 = await api('POST', '/cloud-takeoff/sync')
  assert.equal(s1.status, 200, JSON.stringify(s1.data))
  const ds = Object.fromEntries(sq.prepare('SELECT name, data FROM ds').all().map((r) => [r.name, JSON.parse(r.data)]))
  for (const n of ['users', 'houses', 'materials', 'aliases', 'labor_rates', 'config']) assert.ok(ds[n], 'มีชุดข้อมูล ' + n)
  assert.ok(ds.users.some((u) => u.username === 'thawat' && u.hash && u.can_add_price), 'แอดมินมีรหัสตรวจ PIN')
  assert.ok(!JSON.stringify(ds.users).includes('"pin"'), 'ไม่ส่ง PIN')
  assert.equal(sq.prepare('SELECT COUNT(*) c FROM boqs').get().c, 1, 'ช่วงยังไม่เปิดใช้: BOQ ของ ERP ขึ้นไปให้ดู')
  assert.ok(ds.config.prices && ds.config.model, 'ค่าตั้ง AI')

  // 2) ล็อกอินบน Cloudflare
  assert.equal((await cf('POST', '/login', { username: 'thawat', pin: '0000' })).status, 401)
  const lg = await cf('POST', '/login', { username: 'thawat', pin: '1234' })
  assert.equal(lg.status, 200, JSON.stringify(lg.data))
  const tk = lg.data.token
  const me = await cf('GET', '/me', undefined, tk)
  assert.equal(me.data.mode, 'mirror'); assert.ok(me.data.houses.length)
  assert.equal((await cf('POST', '/boqs', { title: 'x' }, tk)).status, 409, 'ยังไม่เปิดใช้ = แก้ไม่ได้')
  assert.equal((await cf('GET', '/labor-rates', undefined, tk)).data.length, ds.labor_rates.length)

  // 3) ย้ายไปใช้บน Cloudflare
  const sw = await api('POST', '/cloud-takeoff/mode', { mode: 'live' })
  assert.equal(sw.status, 200, JSON.stringify(sw.data)); assert.equal(sw.data.mode, 'live')
  assert.equal((await api('POST', '/boqs', { title: 'ห้าม' })).status, 409, 'ERP ดูอย่างเดียว')
  assert.equal((await api('PUT', '/boqs/' + b0.data.id, { title: 'ห้าม' })).status, 409)
  assert.equal((await api('GET', '/boqs')).status, 200, 'ERP ยังดูได้')
  assert.equal((await api('GET', '/cloud-takeoff/status')).data.live, true)

  // 4) ทำงานบน Cloudflare
  const nm = await cf('POST', '/material-prices', { name: 'บล็อกแก้วทดสอบ 19x19', unit: 'ก้อน', central: 95, note: 'เพิ่มจากหน้าถอดแบบ' }, tk)
  assert.equal(nm.status, 201); assert.ok(nm.data.id < 0, 'รหัสชั่วคราวติดลบ')
  assert.ok((await cf('GET', '/material-prices', undefined, tk)).data.some((m) => m.id === nm.data.id), 'ราคากลางใหม่ใช้ได้ทันที')
  const nb = await cf('POST', '/boqs', { house_code: house.code, title: 'ถอดแบบ: ทดสอบ', markup_pct: 0, vat_pct: 0, items: [{ cat: 'สถาปัตยกรรม', desc: 'บล็อกแก้วทดสอบ 19x19', qty: 20, unit: 'ก้อน', mat: 95, lab: 0, ref: nm.data.id }], work: [] }, tk)
  assert.equal(nb.status, 201); assert.match(nb.data.no, /^BOQ-\d{2}-\d{3}$/)
  assert.notEqual(nb.data.no, b0.data.no, 'เลข BOQ ต่อจากของ ERP')
  const rv = await cf('POST', `/boqs/${nb.data.id}/revise`, { note: 'ลูกค้าเพิ่มห้อง' }, tk)
  assert.equal(rv.data.rev, 2); assert.equal(rv.data.no, nb.data.no)
  assert.equal((await cf('POST', `/boqs/${nb.data.id}/lock`, {}, tk)).data.locked, 1)
  assert.equal((await cf('PUT', `/boqs/${nb.data.id}`, { title: 'แก้' }, tk)).status, 409, 'ฉบับล็อกแก้ไม่ได้')
  assert.equal((await cf('POST', '/material-aliases', { items: [{ alias: 'glass block 19 cm', unit: 'ก้อน', mp_id: nm.data.id }] }, tk)).status, 200)
  const push = await cf('POST', `/boqs/${nb.data.id}/push-to-house`, { mode: 'price' }, tk)
  assert.equal(push.status, 200); assert.equal(push.data.grand, 1900)
  await cf('POST', '/usage', { feature: 'ถอดแบบ', model: 'claude-opus-5-5', ok: true, usage: { input_tokens: 1000, output_tokens: 500 } }, tk)
  await cf('POST', '/audit', { action: 'ถอดแบบเป็น BOQ ร่าง', detail: 'แบบทดสอบ.pdf' }, tk)
  await cf('PUT', '/cache/abc', { label: 'a.pdf', model: 'm', parsed: { sections: [] }, cost_usd: 0.5 }, tk)
  assert.deepEqual((await cf('GET', '/cache/abc', undefined, tk)).data.parsed, { sections: [] }, 'จำผลถอดแบบ')

  // 5) AI ส่งต่อแบบสตรีม: กุญแจอยู่ฝั่ง Cloudflare · รูป/PDF ต่อเข้าไปตรงๆ · คำสั่งอยู่ท้าย
  const media = JSON.stringify({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } })
  const aiRes = await fetch(`http://localhost:${CLOUD}/api/takeoff/ai`, { method: 'POST', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/octet-stream' }, body: JSON.stringify({ prompt: 'ถอดแบบนี้', max_tokens: 48000 }) + '\n' + media })
  assert.equal(aiRes.status, 200)
  const sseText = await aiRes.text()
  assert.match(sseText, /content_block_delta/)
  const call = anthropicCalls.at(-1)
  assert.equal(call.key, 'ai-test-key'); assert.equal(call.body.stream, true); assert.equal(call.body.max_tokens, 48000)
  assert.equal(call.body.messages[0].content[0].type, 'image'); assert.equal(call.body.messages[0].content[1].text, 'ถอดแบบนี้')
  assert.equal((await fetch(`http://localhost:${CLOUD}/api/takeoff/ai`, { method: 'POST', body: '{}\n' })).status, 401, 'AI ต้องล็อกอิน')

  // 6) ERP ดึงกลับ
  const s2 = await api('POST', '/cloud-takeoff/sync')
  assert.equal(s2.status, 200, JSON.stringify(s2.data))
  assert.equal(mpCount(), mp0 + 1, 'สร้างราคากลางใหม่ใน ERP')
  const realMp = d.prepare("SELECT * FROM material_prices WHERE name='บล็อกแก้วทดสอบ 19x19'").get()
  assert.equal(realMp.central, 95)
  const erpBoq = d.prepare('SELECT * FROM boqs WHERE id=?').get(nb.data.id)
  assert.ok(erpBoq, 'BOQ จาก Cloudflare ลง ERP'); assert.equal(erpBoq.locked, 1)
  assert.equal(JSON.parse(erpBoq.items)[0].ref, realMp.id, 'รหัสราคากลางชั่วคราว → รหัสจริง')
  assert.equal(d.prepare('SELECT COUNT(*) c FROM boqs').get().c, 3)
  assert.ok(d.prepare("SELECT * FROM material_aliases WHERE alias='glass block 19 cm' AND mp_id=?").get(realMp.id), 'ชื่อเรียกที่จำไว้ลง ERP')
  assert.equal(d.prepare('SELECT house_customer FROM houses WHERE code=?').get(house.code).house_customer, 1900, 'ดันเข้าราคาขายบ้าน')
  assert.ok(d.prepare("SELECT * FROM ai_usage WHERE feature='ถอดแบบ' AND input_tokens=1000").get(), 'ค่าใช้ AI ลง ERP')
  assert.ok(d.prepare("SELECT * FROM audit WHERE action LIKE '%ถอดแบบออนไลน์%' AND detail LIKE '%แบบทดสอบ.pdf%'").get(), 'ประวัติการใช้งานลง ERP')
  // บน Cloudflare: รหัสชั่วคราวในทุก BOQ เปลี่ยนเป็นรหัสจริง
  const cloudItems = JSON.parse(sq.prepare('SELECT items FROM boqs WHERE id=?').get(nb.data.id).items)
  assert.equal(cloudItems[0].ref, realMp.id)
  assert.ok(!(await cf('GET', '/material-prices', undefined, tk)).data.some((m) => m.id < 0), 'ราคากลางใหม่ไม่ซ้ำ (ใช้รหัสจริงแล้ว)')
  // ซิงก์ซ้ำ → ไม่ทำซ้ำ
  await api('POST', '/cloud-takeoff/sync'); await api('POST', '/cloud-takeoff/sync')
  assert.equal(mpCount(), mp0 + 1, 'ไม่สร้างราคากลางซ้ำ')
  assert.equal(d.prepare("SELECT COUNT(*) c FROM audit WHERE action LIKE 'ถอดแบบเป็น BOQ ร่าง%'").get().c, 1, 'ประวัติไม่ซ้ำ')
  // ลบ BOQ บน Cloudflare → ERP ลบตาม
  await cf('DELETE', `/boqs/${rv.data.id}`, undefined, tk)
  await api('POST', '/cloud-takeoff/sync')
  assert.ok(!d.prepare('SELECT 1 FROM boqs WHERE id=?').get(rv.data.id))

  // 7) กลับมาทำใน ERP
  const back = await api('POST', '/cloud-takeoff/mode', { mode: 'mirror' })
  assert.equal(back.data.mode, 'mirror')
  assert.equal((await api('POST', '/boqs', { title: 'ทำใน ERP ได้อีกครั้ง', items: [] })).status, 201)
  assert.equal((await cf('POST', '/boqs', { title: 'x' }, tk)).status, 409, 'Cloudflare กลับเป็นดูอย่างเดียว')
  d.close()
})
