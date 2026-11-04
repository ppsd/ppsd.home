// เงิน 4 ขา: บ้าน · บริษัท · การตลาด/โฆษณา · ลูกค้า (รายงาน /reports/money-streams) + โครงการการตลาด
// เปิดเซิร์ฟเวอร์บนฐานข้อมูลชั่วคราว (ไม่แตะ server/data)
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 3289
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
  tmp = mkdtempSync(join(tmpdir(), 'ppsd-ms-'))
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


const Y = String(new Date().getFullYear())
const today = new Date().toISOString().slice(0, 10)

test('เปิดระบบครั้งแรก → มีโครงการ "การตลาด / สื่อโฆษณา" ให้เอง 1 โครงการ', async () => {
  const hs = (await GET('/houses')).data
  const mk = hs.filter((h) => h.kind === 'marketing')
  assert.equal(mk.length, 1)
  assert.equal(mk[0].code, 'MKT')
})

test('แยกเงิน 4 ขาถูกฝั่ง', async () => {
  assert.equal((await PUT('/controls', { require_acceptance: false, enforce_approval_flow: false })).status, 200)
  assert.equal((await POST('/houses', { code: 'MS-H1', name: 'บ้านขา 1', customer: 'คุณขา', value: 500000 })).status, 201)
  assert.equal((await POST('/houses', { code: 'MS-OF', name: 'ออฟฟิศทดสอบ', kind: 'office' })).status, 201)
  const inst = (await POST('/houses/MS-H1/installments', { no: 1, detail: 'มัดจำ', amount: 50000, side: 'customer' })).data
  assert.equal((await POST(`/installments/${inst.id}/collect`, {})).status, 200)
  const e1 = await POST('/expenses', { house_code: 'MS-H1', item: 'ปูน', cat: 'วัสดุ', amount: 12000, date: today })
  const e2 = await POST('/expenses', { house_code: 'MS-OF', item: 'กระดาษ A4', cat: 'ของใช้สำนักงาน', amount: 800, date: today })
  const e3 = await POST('/expenses', { house_code: 'MKT', item: 'ยิงแอด Facebook', cat: 'โฆษณาออนไลน์ (Facebook / Google / TikTok)', amount: 5000, date: today })
  const e4 = await POST('/expenses', { item: 'ค่าธรรมเนียมธนาคาร', cat: 'ธรรมเนียม', amount: 30, date: today })
  for (const e of [e1, e2, e3, e4]) assert.ok(e.status < 300, JSON.stringify(e.data))
  const r = await GET('/reports/money-streams?year=' + Y)
  assert.equal(r.status, 200)
  const t = r.data.total
  assert.equal(t.customer_in, 50000)
  assert.equal(t.house_out, 12000)
  assert.equal(t.company_out, 830, 'ออฟฟิศ + รายการไม่ผูกบ้าน = ภายในบริษัท')
  assert.equal(t.marketing_out, 5000)
  const m = r.data.months.find((x) => x.ym === today.slice(0, 7))
  assert.equal(m.marketing_out, 5000)
  const h = r.data.houses.find((x) => x.code === 'MS-H1')
  assert.equal(h.in, 50000)
  assert.equal(h.out, 12000)
  assert.equal(r.data.marketing_by_cat[0].name, 'โฆษณาออนไลน์ (Facebook / Google / TikTok)')
  assert.equal(r.data.marketing_by_cat[0].amount, 5000)
})

test('ใบขอซื้อของการตลาด รับหมวดโฆษณาได้', async () => {
  const pr = await POST('/purchase-requests', { house_code: 'MKT', house: 'การตลาด / สื่อโฆษณา', category: 'print', items: [{ desc: 'ป้ายไวนิล 2x3 ม.', qty: 2, unit: 'แผ่น', price: 900 }] })
  assert.ok(pr.status < 300, JSON.stringify(pr.data))
  const row = (await GET('/purchase-requests')).data.find((x) => x.id === pr.data.id || x.no === pr.data.no)
  assert.equal(row.category, 'print')
})

test('ปีที่ไม่มีข้อมูล → ศูนย์ทุกขา · ปีผิดรูปแบบ = ปีนี้', async () => {
  const r = (await GET('/reports/money-streams?year=2001')).data
  assert.equal(r.total.customer_in + r.total.house_out + r.total.company_out + r.total.marketing_out, 0)
  assert.equal((await GET('/reports/money-streams?year=abc')).data.year, Y)
})
