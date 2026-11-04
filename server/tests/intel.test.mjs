// ชุดทดสอบ "ศูนย์วิเคราะห์ธุรกิจ" — ตรวจการเงิน · คู่แข่ง · รับทราบข้อเตือน · ไม่มีกุญแจ AI ต้องไม่พัง — รันด้วย `npm test`
// ใช้ฐานข้อมูลชั่วคราว (PPSD_DB) เท่านั้น ไม่แตะ server/data
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAiJson, normalizeReport } from '../intel.js'

const PORT = 3297
const BASE = `http://localhost:${PORT}/api`
const serverDir = dirname(dirname(fileURLToPath(import.meta.url)))
let child, tmp, token
const call = async (method, path, body) => {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: r.status, data: await r.json() }
}

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'ppsd-intel-'))
  child = spawn(process.execPath, [join(serverDir, 'index.js')], { env: { ...process.env, PORT: String(PORT), PPSD_DB: join(tmp, 'test.sqlite'), PPSD_NO_TUNNEL: '1', ANTHROPIC_API_KEY: '' }, stdio: process.env.PPSD_TEST_STDIO ? 'inherit' : 'ignore' })
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

test('อ่าน JSON จากคำตอบ AI ได้ทั้งแบบมี ```json และมีข้อความนำหน้า', () => {
  assert.equal(parseAiJson('ค้นแล้ว {ไม่ใช่ json}\n```json\n{"summary":"ok"}\n```').summary, 'ok')
  assert.equal(parseAiJson('ข้อความ {x} แล้ว {"summary":"b","score":40}').summary, 'b')
  assert.equal(parseAiJson('ไม่มีเลย'), null)
  const n = normalizeReport({ summary: 'ส', score: 150, alerts: [{ sev: 'weird', title: 'ก' }, { title: '' }], sources: [{ url: 'javascript:x' }, { url: 'https://a.b', title: 't' }] })
  assert.equal(n.score, 100)
  assert.equal(n.alerts.length, 1)
  assert.equal(n.alerts[0].sev, 'med')
  assert.deepEqual(n.sources, [{ title: 't', url: 'https://a.b' }])
})

test('หน้าศูนย์วิเคราะห์: โหลดได้ · ไม่มีกุญแจ AI สั่งทำรายงานแล้วได้ข้อความบอก ไม่พัง', async () => {
  const r = await call('GET', '/intel')
  assert.equal(r.status, 200)
  assert.deepEqual(r.data.order, ['world', 'materials', 'competitors', 'critic', 'tycoon', 'sales'])
  assert.ok(Array.isArray(r.data.finance))
  assert.ok(r.data.kpis && typeof r.data.kpis.need_30d === 'number')
  const run = await call('POST', '/intel/run', { kinds: ['world'] })
  assert.equal(run.status, 400)
  assert.match(run.data.error, /กุญแจ AI/)
})

test('ตรวจการเงิน: บ้านที่ต้นทุนเกินราคาขายถูกเตือน "ด่วน" และรับทราบ/เปิดใหม่ได้', async () => {
  const code = 'INT-' + Date.now()
  const h = await call('POST', '/houses', { code, name: 'บ้านทดสอบวิเคราะห์', status: 'กำลังสร้าง', value: 1000000 })
  assert.ok(h.status < 300, JSON.stringify(h.data))
  const e = await call('POST', '/expenses', { date: '2026-11-01', house_code: code, item: 'วัสดุทดสอบ', cat: 'วัสดุ', vendor: 'ร้านทดสอบ', amount: 5000000 })
  assert.ok(e.status < 300, JSON.stringify(e.data))
  const r = await call('GET', '/intel')
  const row = r.data.houses.find((x) => x.code === code)
  assert.ok(row, 'ต้องมีบ้านในตารางกำไร')
  const flag = r.data.finance.find((f) => f.key === 'intel:fin:loss:' + code)
  assert.ok(row.value > 0, 'มูลค่าบ้านต้องไม่เป็น 0'); {
    assert.ok(flag, 'ต้องมีข้อเตือนขาดทุน')
    assert.equal(flag.sev, 'high')
    assert.equal((await call('POST', '/intel/finance/ack', { key: flag.key, note: 'ตรวจแล้ว' })).status, 200)
    assert.ok((await call('GET', '/intel')).data.finance.find((f) => f.key === flag.key).acked)
    assert.equal((await call('POST', '/intel/finance/ack', { key: flag.key, reopen: true })).status, 200)
    assert.equal((await call('GET', '/intel')).data.finance.find((f) => f.key === flag.key).acked, false)
  }
})

test('คู่แข่ง: เพิ่มเองได้ · เอาออก = ซ่อน ไม่ลบ · ตั้งค่าบันทึกได้', async () => {
  assert.equal((await call('POST', '/intel/competitors', { name: '' })).status, 400)
  const c = await call('POST', '/intel/competitors', { name: 'บริษัทคู่แข่งทดสอบ', area: 'ราชบุรี', website: 'javascript:alert(1)' })
  assert.equal(c.status, 200)
  let r = await call('GET', '/intel')
  const got = r.data.competitors.find((x) => x.id === c.data.id)
  assert.equal(got.website, '', 'ลิงก์ที่ไม่ใช่ http(s) ต้องไม่ถูกเก็บ')
  assert.equal((await call('DELETE', `/intel/competitors/${c.data.id}`)).status, 200)
  r = await call('GET', '/intel')
  assert.ok(!r.data.competitors.find((x) => x.id === c.data.id))
  const s = await call('PUT', '/intel/settings', { auto: false, hour: 30, line: false })
  assert.equal(s.data.auto, false)
  assert.equal(s.data.hour, 23)
  assert.equal(s.data.line, false)
})
