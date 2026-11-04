// ค้นหาข้อมูลทุกแผนก (/api/search) — ค้นข้ามแผนก · กรองปี พ.ศ. · สิทธิ์ตามหน้าต้นทาง
// เปิดเซิร์ฟเวอร์บนฐานข้อมูลชั่วคราว (ไม่แตะ server/data)
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 3297
const BASE = `http://localhost:${PORT}/api`
const serverDir = dirname(dirname(fileURLToPath(import.meta.url)))
let child, tmp, token

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try { data = await res.json() } catch { /* ไม่ใช่ JSON */ }
  return { status: res.status, data }
}
const GET = (p) => api('GET', p)
const POST = (p, b = {}) => api('POST', p, b)
const PUT = (p, b = {}) => api('PUT', p, b)
const DEL = (p) => api('DELETE', p)

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'ppsd-search-'))
  child = spawn(process.execPath, [join(serverDir, 'index.js')], {
    env: { ...process.env, PORT: String(PORT), PPSD_DB: join(tmp, 'test.sqlite'), PPSD_NO_TUNNEL: '1' },
    stdio: process.env.PPSD_TEST_STDIO ? 'inherit' : 'ignore',
  })
  for (let i = 0; i < 60; i++) {
    try {
      const r = await POST('/login', { username: 'thawat', pin: '1234' })
      if (r.status === 200 && r.data?.token) { token = r.data.token; return }
    } catch { /* ยังไม่ขึ้น */ }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error('เซิร์ฟเวอร์ทดสอบไม่ขึ้น')
})
after(() => {
  try { child?.kill('SIGKILL') } catch { /* ignore */ }
  try { rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
})


import { toISODate, splitTerms } from '../search.js'

const find = async (params, tk = token) => {
  const res = await fetch(BASE + '/search?' + new URLSearchParams(params), { headers: { Authorization: 'Bearer ' + tk } })
  return { status: res.status, data: await res.json() }
}
const types = (r) => r.data.groups.map((g) => g.type)

test('แปลงวันที่ทุกแบบในระบบ + แยกคำค้น', () => {
  assert.equal(toISODate('18 ก.ย. 69'), '2026-09-18')
  assert.equal(toISODate('1/7/69'), '2026-07-01')
  assert.equal(toISODate('2026-09-01 10:00:00'), '2026-09-01')
  assert.equal(toISODate('5 ม.ค. 2568'), '2025-01-05')
  assert.equal(toISODate('วันนี้'), '')
  assert.deepEqual(splitTerms(' ปูน  15,000 '), ['ปูน', '15000'])
})

test('ค้นชื่อบ้าน → เจอข้อมูลหลายแผนกของบ้านนั้น · ยอดเงินมีคอมมาก็เจอ', async () => {
  assert.equal((await POST('/houses', { code: 'SR-01', name: 'บ้านค้นหาทดสอบ', customer: 'คุณค้นเจอ', value: 100 })).status, 201)
  assert.ok((await POST('/expenses', { house_code: 'SR-01', item: 'ปูนซีเมนต์ทดสอบค้น', cat: 'วัสดุ', vendor: 'ร้านค้นเจอวัสดุ', amount: 15432, date: '2025-03-10' })).status < 300)
  assert.ok((await POST('/issues', { house_code: 'SR-01', title: 'น้ำรั่วทดสอบค้น' })).status < 300)
  const r = await find({ q: 'บ้านค้นหาทดสอบ', limit: 50 })
  assert.equal(r.status, 200)
  for (const t of ['house', 'expense', 'issue']) assert.ok(types(r).includes(t), t + ' ต้องเจอ: ' + types(r))
  const exp = r.data.groups.find((g) => g.type === 'expense').items[0]
  assert.equal(exp.house_name, 'บ้านค้นหาทดสอบ')
  assert.equal(exp.date, '2025-03-10')
  assert.equal(exp.amount, 15432)
  assert.ok(exp.house_id)
  const m = await find({ q: '15,432' })
  assert.ok(types(m).includes('expense'))
  const two = await find({ q: 'ปูนซีเมนต์ทดสอบค้น ร้านค้นเจอ' })
  assert.ok(types(two).includes('expense'), 'หลายคำ = ต้องเจอครบทุกคำ')
  assert.equal((await find({ q: 'ปูนซีเมนต์ทดสอบค้น ไม่มีคำนี้แน่นอน' })).data.total, 0)
})

test('กรองปี พ.ศ.', async () => {
  const y68 = await find({ q: 'ปูนซีเมนต์ทดสอบค้น', year: '2568' })
  assert.ok(types(y68).includes('expense'))
  const y60 = await find({ q: 'ปูนซีเมนต์ทดสอบค้น', year: '2560' })
  assert.ok(!types(y60).includes('expense'))
})

test('สิทธิ์: ดูอย่างเดียวค้นไม่เจอใบขอซื้อ/บัญชี · ถูกปิดโมดูลก็ค้นไม่เจอ · ไม่หลุดเงินเดือน', async () => {
  const pr = await POST('/purchase-requests', { house_code: 'SR-01', item: 'เหล็กทดสอบค้นสิทธิ์', amount: 999 })
  assert.ok(pr.status < 300, JSON.stringify(pr.data))
  assert.ok(types(await find({ q: 'เหล็กทดสอบค้นสิทธิ์' })).includes('pr'), 'แอดมินต้องเห็น')
  assert.ok((await POST('/users', { name: 'คนดูค้นหา', username: 'srview', pin: '5678', role: 'viewer' })).status < 300)
  const lg = await POST('/login', { username: 'srview', pin: '5678' })
  const vt = lg.data.token
  assert.ok(vt)
  const v = await find({ q: 'SR-01', limit: 50 }, vt)
  assert.equal(v.status, 200)
  assert.ok(types(v).includes('house'))
  for (const t of ['pr', 'po', 'payment', 'journal', 'petty', 'vendor']) assert.ok(!types(v).includes(t), 'viewer ต้องไม่เห็น ' + t)
  // ปิดโมดูลบัญชีให้ผู้ใช้ site → ค้นไม่เจอรายจ่าย
  assert.ok((await POST('/users', { name: 'หน้างานค้นหา', username: 'srsite', pin: '4321', role: 'site' })).status < 300)
  const users = (await GET('/users')).data
  const su = users.find((u) => u.username === 'srsite')
  assert.equal((await PUT('/users/' + su.id, { deny_mods: ['accounting'] })).status, 200)
  const st = (await POST('/login', { username: 'srsite', pin: '4321' })).data.token
  const s1 = await find({ q: 'SR-01', limit: 50 }, st)
  assert.ok(types(s1).includes('pr'), 'site เห็นใบขอซื้อ')
  assert.ok(!types(s1).includes('expense'), 'ปิดโมดูลบัญชีแล้วต้องไม่เห็นรายจ่าย')
  const emp = await find({ q: 'ธวัช' })
  const e = emp.data.groups.find((g) => g.type === 'employee')
  if (e) assert.ok(!JSON.stringify(e).match(/"base"|bank_acct|tax_id/), 'ห้ามมีเงินเดือน/บัญชี')
})

test('คำสั้นเกิน / ไม่ล็อกอิน', async () => {
  assert.equal((await find({ q: 'ก' })).data.total, 0)
  const res = await fetch(BASE + '/search?q=บ้าน')
  assert.equal(res.status, 401)
})
