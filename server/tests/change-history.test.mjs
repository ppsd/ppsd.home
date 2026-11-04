// ประวัติการแก้ไขข้อมูลทุกตาราง (change_history) — ใครทำ · ก่อน/หลัง · ซ่อนความลับ
// เปิดเซิร์ฟเวอร์บนฐานข้อมูลชั่วคราว (ไม่แตะ server/data)
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 3291
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
  tmp = mkdtempSync(join(tmpdir(), 'ppsd-ch-'))
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


const hist = async (params) => (await GET('/change-history?' + new URLSearchParams(params))).data

test('เพิ่ม/แก้/ลบ → มีประวัติ พร้อมชื่อผู้ทำ และค่าก่อน/หลัง', async () => {
  assert.equal((await POST('/houses', { code: 'CH-01', name: 'บ้านประวัติ', customer: 'คุณเอ', value: 100 })).status, 201)
  const h = (await GET('/houses')).data.find((x) => x.code === 'CH-01')
  assert.equal((await PUT('/houses/' + h.id, { customer: 'คุณบี' })).status, 200)
  const rows = await hist({ table: 'houses', key: String(h.id) })
  const ins = rows.find((r) => r.action === 'insert')
  assert.ok(ins, 'ต้องมีประวัติการเพิ่ม')
  assert.equal(ins.user, 'ธวัช วรรณสุข')
  const upd = rows.find((r) => r.action === 'update' && JSON.parse(r.after).customer === 'คุณบี' && JSON.parse(r.before).customer !== 'คุณบี')
  assert.ok(upd, 'ต้องมีประวัติการแก้ชื่อลูกค้า')
  assert.equal(JSON.parse(upd.before).customer, 'คุณเอ')
  assert.match(upd.ts, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
})

test('ลบรายการ → เก็บข้อมูลเดิมทั้งแถวไว้', async () => {
  const r = await POST('/houses/CH-01/installments', { no: 9, detail: 'งวดจะถูกลบ', amount: 12345, side: 'customer' })
  assert.ok(r.data?.id, JSON.stringify(r.data))
  assert.equal((await DEL('/installments/' + r.data.id)).status, 200)
  const rows = await hist({ table: 'installments', key: String(r.data.id), action: 'delete' })
  assert.equal(rows.length, 1)
  assert.equal(JSON.parse(rows[0].before).detail, 'งวดจะถูกลบ')
  assert.equal(JSON.parse(rows[0].before).amount, 12345)
  assert.equal(rows[0].after, null)
})

test('PIN / รหัสลับ ไม่ถูกเก็บเป็นค่าจริง', async () => {
  const u = await POST('/users', { name: 'ผู้ใช้ทดสอบประวัติ', username: 'histtest', pin: '9876', role: 'viewer' })
  assert.ok(u.status < 300, JSON.stringify(u.data))
  const rows = await hist({ table: 'users', action: 'insert' })
  const row = rows.find((x) => JSON.parse(x.after).username === 'histtest')
  assert.ok(row)
  assert.equal(JSON.parse(row.after).pin, '***')
  assert.ok(!row.after.includes('9876'))
})

test('แก้ซ้ำค่าเดิม (ไม่มีอะไรเปลี่ยน) → ไม่สร้างประวัติเพิ่ม', async () => {
  const h = (await GET('/houses')).data.find((x) => x.code === 'CH-01')
  const n1 = (await hist({ table: 'houses', key: String(h.id) })).length
  await PUT('/houses/' + h.id, { customer: 'คุณบี' })
  const n2 = (await hist({ table: 'houses', key: String(h.id) })).length
  assert.equal(n2, n1)
})

test('ค้นหา / meta / กรองวันที่', async () => {
  const meta = (await GET('/change-history/meta')).data
  assert.ok(meta.tables.some((t) => t.t === 'houses'))
  assert.ok(meta.users.some((u) => u.u === 'ธวัช วรรณสุข'))
  const found = await hist({ q: 'บ้านประวัติ' })
  assert.ok(found.length >= 1)
  assert.equal((await hist({ from: '2000-01-01', to: '2000-01-02' })).length, 0)
})

test('ต้องเข้าสู่ระบบ / สิทธิ์ผู้จัดการขึ้นไป', async () => {
  const save = token; token = null
  assert.equal((await GET('/change-history')).status, 401)
  token = save
})

test('เครื่องมืออื่นเปิดฐานข้อมูลเองเขียนได้ปกติ (trigger มีเฉพาะในเซิร์ฟเวอร์)', async () => {
  const { default: Database } = await import('better-sqlite3')
  const raw = new Database(join(tmp, 'test.sqlite'))
  raw.prepare("UPDATE houses SET name='แก้จากภายนอก' WHERE code='CH-01'").run()
  raw.close()
})
