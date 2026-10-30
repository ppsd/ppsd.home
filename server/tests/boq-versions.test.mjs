// ชุดทดสอบ "BOQ หลายฉบับ" — ฉบับใหม่ใช้เลขเดิม · ล็อกฉบับเซ็นสัญญา · ลบฉบับแรก — รันด้วย `npm test`
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 3295
const BASE = `http://localhost:${PORT}/api`
const serverDir = dirname(dirname(fileURLToPath(import.meta.url)))
let child, tmp, token
const call = async (method, path, body) => {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: r.status, data: await r.json() }
}

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'ppsd-boqrev-'))
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


const item = (desc, qty, mat) => ({ cat: 'โครงสร้าง', desc, qty, unit: 'ชิ้น', mat, lab: 0 })

test('ฉบับใหม่: revise คัดลอกรายการ เลขเดิม R2 · ถอดแบบใหม่ (revise_of) ได้ R3 · BOQ ใหม่ไม่กินเลข', async () => {
  const r1 = await call('POST', '/boqs', { house_code: '', title: 'บ้านทดสอบฉบับ', markup_pct: 10, vat_pct: 7, items: [item('เสาเข็ม', 10, 1000)] })
  assert.equal(r1.status, 201)
  assert.equal(r1.data.rev, 1)
  assert.equal(r1.data.root_id, null)
  const r2 = await call('POST', `/boqs/${r1.data.id}/revise`, { note: 'ลูกค้าขอเพิ่มห้อง' })
  assert.equal(r2.status, 201)
  assert.deepEqual([r2.data.no, r2.data.rev, r2.data.root_id, r2.data.rev_note, r2.data.markup_pct], [r1.data.no, 2, r1.data.id, 'ลูกค้าขอเพิ่มห้อง', 10])
  assert.deepEqual(r2.data.items, r1.data.items)
  // ถอดแบบใหม่จากฉบับ R2 → R3 ของชุดเดิม
  const r3 = await call('POST', '/boqs', { revise_of: r2.data.id, house_code: '', title: 'บ้านทดสอบฉบับ', items: [item('เสาเข็ม', 12, 1000)], rev_note: 'ถอดแบบใหม่' })
  assert.deepEqual([r3.data.no, r3.data.rev, r3.data.root_id, r3.data.rev_note], [r1.data.no, 3, r1.data.id, 'ถอดแบบใหม่'])
  // BOQ ชุดใหม่ ได้เลขถัดจากชุดแรก (ฉบับ R2/R3 ไม่นับเป็นเลข)
  const other = await call('POST', '/boqs', { title: 'ชุดอื่น', items: [] })
  const seq = (no) => Number(no.split('-').pop())
  assert.equal(seq(other.data.no), seq(r1.data.no) + 1)
  assert.equal((await call('POST', '/boqs', { revise_of: 999999, items: [] })).status, 404)
})

test('ล็อกฉบับเซ็นสัญญา: แก้/ลบไม่ได้ (409) · ยังสร้างฉบับใหม่จากฉบับล็อกได้ · ปลดล็อกแล้วแก้ได้', async () => {
  const b = (await call('POST', '/boqs', { title: 'ล็อกทดสอบ', items: [item('คาน', 5, 500)] })).data
  const l = await call('POST', `/boqs/${b.id}/lock`, { locked: true })
  assert.equal(l.data.locked, 1)
  assert.ok(l.data.locked_by)
  assert.equal((await call('PUT', '/boqs/' + b.id, { title: 'แก้', items: [] })).status, 409)
  assert.equal((await call('DELETE', '/boqs/' + b.id)).status, 409)
  const nb = await call('POST', `/boqs/${b.id}/revise`, {})
  assert.equal(nb.data.rev, 2)
  assert.equal(nb.data.locked, 0)
  const u = await call('POST', `/boqs/${b.id}/lock`, { locked: false }) // thawat = แอดมิน
  assert.equal(u.status, 200)
  assert.equal((await call('PUT', '/boqs/' + b.id, { title: 'แก้ได้แล้ว', items: [item('คาน', 6, 500)] })).status, 200)
})

test('ลบฉบับแรก: ฉบับเก่าสุดที่เหลือขึ้นเป็นฉบับแรก ชุดยังอยู่ด้วยกัน', async () => {
  const r1 = (await call('POST', '/boqs', { title: 'ลบทดสอบ', items: [] })).data
  const r2 = (await call('POST', `/boqs/${r1.id}/revise`, {})).data
  const r3 = (await call('POST', `/boqs/${r1.id}/revise`, {})).data
  assert.equal(r3.rev, 3)
  assert.equal((await call('DELETE', '/boqs/' + r1.id)).status, 200)
  const all = (await call('GET', '/boqs')).data
  const a2 = all.find((x) => x.id === r2.id), a3 = all.find((x) => x.id === r3.id)
  assert.equal(a2.root_id, null)
  assert.equal(a3.root_id, r2.id)
  const r4 = (await call('POST', `/boqs/${r3.id}/revise`, {})).data
  assert.deepEqual([r4.rev, r4.root_id, r4.no], [4, r2.id, r1.no])
})
