// แผนงวดชำระค่าก่อสร้างมาตรฐาน 5 แบบ (ตามเอกสารบริษัท) + เซ็นสัญญาจากใบเสนอราคาแล้วได้งวดตามแผน
// เปิดเซิร์ฟเวอร์บนฐานข้อมูลชั่วคราว (ไม่แตะ server/data)
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { INSTALLMENT_PLANS, pickPlan, buildPlanRows } from '../installment-plans.js'

const PORT = 3287
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

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'ppsd-ip-'))
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

test('ทุกแผนรวมได้ 100% และจำนวนงวดตรงเอกสาร', () => {
  const want = { '1f': 9, '2f-3m': 11, '2f-10m': 11, '2f-big': 13, '3f': 11 }
  for (const p of INSTALLMENT_PLANS) {
    assert.equal(p.rows.reduce((s, [pct]) => s + pct, 0), 100, p.key)
    assert.equal(p.rows.length, want[p.key], p.key)
    assert.match(p.rows[0][1], /ทำสัญญา/, p.key + ' งวดแรก = วันทำสัญญา')
    assert.equal(p.rows[0][0], 10, p.key + ' วันทำสัญญา 10%')
  }
  const one = INSTALLMENT_PLANS.find((p) => p.key === '1f').rows.map(([pct]) => pct)
  assert.deepEqual(one, [10, 10, 15, 10, 15, 10, 15, 10, 5])
  const two = INSTALLMENT_PLANS.find((p) => p.key === '2f-3m').rows.map(([pct]) => pct)
  assert.deepEqual(two, [10, 10, 10, 10, 15, 10, 10, 10, 7, 5, 3])
})

test('เลือกแผนตามชั้น + ราคา', () => {
  assert.equal(pickPlan(1, 8_000_000).key, '1f')
  assert.equal(pickPlan(2, 2_950_000).key, '2f-3m')
  assert.equal(pickPlan(2, 3_000_000).key, '2f-3m')
  assert.equal(pickPlan(2, 5_830_000).key, '2f-10m')
  assert.equal(pickPlan(2, 12_000_000).key, '2f-big')
  assert.equal(pickPlan(3, 2_000_000).key, '3f')
  assert.equal(pickPlan(undefined, 4_000_000).key, '2f-10m', 'ไม่ระบุชั้น = 2 ชั้น')
})

test('แตกงวด: ปัดเป็นบาท งวดสุดท้ายรับเศษ รวมเท่ายอดสัญญาพอดี', () => {
  const rows = buildPlanRows(pickPlan(2, 3_333_333), 3_333_333)
  assert.equal(rows.reduce((s, r) => s + r.amount, 0), 3_333_333)
  assert.equal(rows[0].amount, 333_333)
})

test('GET /installment-plans ส่งรายการแผนให้หน้าจอ', async () => {
  const r = await GET('/installment-plans')
  assert.equal(r.status, 200)
  assert.equal(r.data.plans.length, 5)
  assert.equal(r.data.plans.find((p) => p.key === '3f').rows.length, 11)
})

test('เซ็นสัญญาจากใบเสนอราคา + เลือกแบบบ้านชั้นเดียว → ได้ 9 งวดตามเอกสาร', async () => {
  const q = await POST('/sales-docs', { type: 'quote', customer: 'ลูกค้าแผนงวด', vat_mode: 'none', items: [{ desc: 'สร้างบ้าน', qty: 1, price: 2_500_000 }] })
  assert.equal(q.status, 201)
  const cv = await POST(`/sales-docs/${q.data.id}/convert`, { name: 'บ้านชั้นเดียวเทสต์', plan: '1f' })
  assert.equal(cv.status, 200, JSON.stringify(cv.data))
  const code = cv.data.house.code
  const ins = (await GET('/installments')).data.filter((i) => i.house_code === code && i.side === 'customer').sort((a, b) => a.no - b.no)
  assert.equal(ins.length, 9)
  assert.equal(ins.reduce((s, i) => s + i.amount, 0), q.data.total)
  assert.match(ins[0].detail, /ลงนามทำสัญญา \(10%\)/)
  assert.equal(ins[2].amount, Math.round(q.data.total * 0.15))
})

test('เซ็นสัญญาไม่ระบุแผน → ระบบเลือก 2 ชั้นตามราคาให้', async () => {
  const q = await POST('/sales-docs', { type: 'quote', customer: 'ลูกค้าไม่เลือกแผน', vat_mode: 'none', items: [{ desc: 'สร้างบ้าน', qty: 1, price: 12_000_000 }] })
  const cv = await POST(`/sales-docs/${q.data.id}/convert`, { name: 'บ้านใหญ่เทสต์' })
  assert.equal(cv.status, 200)
  const ins = (await GET('/installments')).data.filter((i) => i.house_code === cv.data.house.code && i.side === 'customer')
  assert.equal(ins.length, 13, '2 ชั้น 10 ล้านขึ้นไป = 13 งวด')
})
