// ชุดทดสอบ "ตรวจเอกสาร" — แบบมาตรฐาน · ส่งข้อความ/ไฟล์ Word ตรวจ (AI จำลอง) · ตำแหน่งคำในเอกสาร · ใช้/ข้ามทีละจุด — รันด้วย `npm test`
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { docxText } from '../doc-review.js'

const PORT = 3297
const BASE = `http://localhost:${PORT}/api`
const serverDir = dirname(dirname(fileURLToPath(import.meta.url)))
const MOCK = { summary: 'มีคำผิด 1 จุด', issues: [
  { type: 'typo', severity: 'high', quote: 'อนุญาติ', suggest: 'อนุญาต', reason: 'สะกดผิด' },
  { type: 'typo', severity: 'high', quote: 'อนุญาติ', suggest: 'อนุญาต', reason: 'ซ้ำ' }, // ซ้ำ → ตัดทิ้ง
  { type: 'consistency', severity: 'medium', quote: 'ไม่มีในเอกสาร', suggest: '', reason: 'ทดสอบ quote ที่หาไม่เจอ' },
  { type: 'missing', severity: 'low', quote: 'ไม่ควรเก็บ', suggest: 'เพิ่มช่องลงนาม', reason: 'ไม่มีช่องลงนาม' },
  { type: 'wording', severity: 'low', quote: '', suggest: 'x', reason: 'ไม่มี quote → ตัดทิ้ง' },
] }
let child, tmp, token
const call = async (method, path, body) => {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: r.status, data: await r.json() }
}
const waitDone = async (id) => {
  for (let i = 0; i < 50; i++) {
    const r = await call('GET', '/doc-reviews/' + id)
    if (r.data.status !== 'กำลังตรวจ') return r.data
    await new Promise((res) => setTimeout(res, 100))
  }
  throw new Error('ตรวจไม่เสร็จ')
}

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'ppsd-docrev-'))
  child = spawn(process.execPath, [join(serverDir, 'index.js')], { env: { ...process.env, PORT: String(PORT), PPSD_DB: join(tmp, 'test.sqlite'), PPSD_NO_TUNNEL: '1', PPSD_AI_MOCK_DOCREVIEW: JSON.stringify(MOCK) }, stdio: process.env.PPSD_TEST_STDIO ? 'inherit' : 'ignore' })
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'thawat', pin: '1234' }) })
      const d = await r.json()
      if (r.status === 200 && d?.token) { token = d.token; return }
    } catch { /* ยังไม่ขึ้น */ }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error('เซิร์ฟเวอร์ทดสอบไม่ขึ้นภายใน 24 วินาที')
})
after(() => {
  try { child?.kill('SIGKILL') } catch { /* ignore */ }
  try { rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
})

test('แบบมาตรฐาน: ต้องมีชื่อ + กฎหรือข้อความ · แก้/ลบได้', async () => {
  assert.equal((await call('POST', '/doc-templates', { name: '', rules: 'x' })).status, 400)
  assert.equal((await call('POST', '/doc-templates', { name: 'สัญญา' })).status, 400)
  const c = await call('POST', '/doc-templates', { name: 'สัญญาจ้างสร้างบ้าน', dept: 'ฝ่ายขาย', rules: 'ใช้คำว่า ผู้ว่าจ้าง' })
  assert.equal(c.status, 201)
  const u = await call('PUT', '/doc-templates/' + c.data.id, { ...c.data, rules: 'ใช้คำว่า ผู้ว่าจ้าง เสมอ' })
  assert.equal(u.data.rules, 'ใช้คำว่า ผู้ว่าจ้าง เสมอ')
  assert.equal((await call('GET', '/doc-templates')).data.length, 1)
})

test('ตรวจข้อความ: ตัดจุดซ้ำ/ไม่มี quote · หาตำแหน่งคำ · missing ไม่มี quote · ใช้/ข้ามทีละจุด', async () => {
  const tpl = (await call('GET', '/doc-templates')).data[0]
  const text = 'ผู้รับจ้างอนุญาติให้ผู้ว่าจ้างเข้าตรวจงานได้ทุกวัน'
  const s = await call('POST', '/doc-reviews/text', { text, name: 'ทดสอบ', template_id: tpl.id })
  assert.equal(s.status, 201)
  const r = await waitDone(s.data.id)
  assert.equal(r.status, 'เสร็จ')
  assert.equal(r.template_name, 'สัญญาจ้างสร้างบ้าน')
  assert.equal(r.issues.length, 3)
  assert.equal(r.issues[0].pos, text.indexOf('อนุญาติ'))
  assert.equal(r.issues[1].pos, -1)
  assert.equal(r.issues[2].quote, '')
  assert.deepEqual([r.total, r.high, r.counts.typo], [3, 1, 1])
  const a = await call('PUT', `/doc-reviews/${r.id}/issues/0`, { status: 'accepted' })
  assert.equal(a.data.issues[0].status, 'accepted')
  assert.equal((await call('GET', '/doc-reviews')).data.rows.length, 1)
  assert.equal((await call('DELETE', '/doc-reviews/' + r.id)).status, 200)
  assert.equal((await call('GET', '/doc-reviews/' + r.id)).status, 404)
})

test('ตรวจไฟล์ Word: อ่านข้อความจาก .docx · .doc เก่าไม่รับ', async () => {
  const docs = join(serverDir, '..', 'docs')
  const f = readdirSync(docs).find((n) => n.endsWith('.docx'))
  if (!f) return
  const buf = readFileSync(join(docs, f))
  assert.ok(docxText(buf).length > 100)
  const up = (name) => fetch(`${BASE}/doc-reviews/file?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' }, body: buf })
  assert.equal((await up('old.doc')).status, 400)
  const r = await up(f)
  assert.equal(r.status, 201)
  const done = await waitDone((await r.json()).id)
  assert.equal(done.status, 'เสร็จ')
  assert.ok(done.text.length > 100 && done.has_file)
})
