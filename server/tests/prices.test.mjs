// ชุดทดสอบ "ราคากลางวัสดุ" — แก้ราคา = ตั้งราคาเอง + ประวัติ · นำเข้า Excel (ตรวจก่อนบันทึก) — รันด้วย `npm test`
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 3296
const BASE = `http://localhost:${PORT}/api`
const serverDir = dirname(dirname(fileURLToPath(import.meta.url)))
let child, tmp, token
const call = async (method, path, body) => {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: r.status, data: await r.json() }
}

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'ppsd-prices-'))
  child = spawn(process.execPath, [join(serverDir, 'index.js')], { env: { ...process.env, PORT: String(PORT), PPSD_DB: join(tmp, 'test.sqlite'), PPSD_NO_TUNNEL: '1' }, stdio: process.env.PPSD_TEST_STDIO ? 'inherit' : 'ignore' })
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

test('แก้ราคากลาง: ราคาเปลี่ยน → ตั้งราคาเอง + ประวัติ (เพิ่มใหม่/แก้เอง) · แก้อย่างอื่นไม่ลงประวัติ', async () => {
  const a = await call('POST', '/material-prices', { name: 'ปูนทดสอบ A', unit: 'ถุง', central: 100 })
  assert.equal(a.status, 201)
  const id = a.data.id
  const e = await call('PUT', '/material-prices/' + id, { central: 120 })
  assert.equal(e.data.central, 120)
  assert.equal(e.data.source, 'กำหนดเอง')
  await call('PUT', '/material-prices/' + id, { note: 'แก้หมายเหตุอย่างเดียว' })
  const h = await call('GET', `/material-prices/${id}/history`)
  assert.deepEqual(h.data.map((x) => [x.source, x.old_price, x.new_price]), [['แก้เอง', 100, 120], ['เพิ่มใหม่', null, 100]])
})

test('นำเข้า Excel: จับคู่ด้วยรหัส · ไม่มีรหัสเทียบชื่อ+หน่วย · รายการใหม่ · ไม่เปลี่ยน · มีปัญหา → บันทึกเฉพาะที่เลือก', async () => {
  const b = (await call('POST', '/material-prices', { name: 'เหล็กทดสอบ B', unit: 'เส้น', central: 200 })).data
  const c = (await call('POST', '/material-prices', { name: 'สีทดสอบ C', unit: 'ถัง', central: 1000 })).data
  const rows = [
    { row: 2, id: b.id, name: 'เหล็กทดสอบ B', unit: 'เส้น', central: '210' }, // +5%
    { row: 3, id: c.id, name: 'สีทดสอบ C', unit: 'ถัง', central: 1000 }, // ไม่เปลี่ยน
    { row: 4, id: '', name: 'สีทดสอบ  C', unit: 'ถัง', central: 999 }, // ไม่มีรหัส แต่ชื่อ+หน่วยตรง (ซ้ำกับแถว 3)
    { row: 5, id: '', name: 'ท่อทดสอบใหม่', unit: 'ท่อน', central: 95 }, // ใหม่
    { row: 6, id: 999999, name: 'ไม่มีจริง', unit: '', central: 5 }, // รหัสไม่มี
    { row: 7, id: b.id, name: 'x', unit: '', central: 'abc' }, // ราคาไม่ใช่ตัวเลข
    { row: 8, id: '', name: '', unit: '', central: '' }, // แถวว่าง
  ]
  const p = (await call('POST', '/material-prices/import/preview', { rows })).data
  assert.deepEqual(p.changes.map((x) => [x.row, x.old, x.central, x.pct, x.matched_by]), [[2, 200, 210, 5, 'รหัส']])
  assert.equal(p.unchanged, 1)
  assert.deepEqual(p.added.map((x) => x.name), ['ท่อทดสอบใหม่'])
  assert.deepEqual(p.errors.map((x) => x.row).sort(), [4, 6, 7])
  const ap = (await call('POST', '/material-prices/import/apply', { changes: p.changes, added: p.added })).data
  assert.deepEqual([ap.updated, ap.added], [1, 1])
  const list = (await call('GET', '/material-prices')).data
  const nb = list.find((m) => m.id === b.id)
  assert.equal(nb.central, 210)
  assert.equal(nb.source, 'กำหนดเอง')
  assert.ok(list.some((m) => m.name === 'ท่อทดสอบใหม่' && m.central === 95))
  const h = (await call('GET', `/material-prices/${b.id}/history`)).data
  assert.equal(h[0].source, 'Excel')
  assert.equal((await call('POST', '/material-prices/import/preview', { rows: [] })).status, 400)
})
