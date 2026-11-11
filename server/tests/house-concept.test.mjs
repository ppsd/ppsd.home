// ชุดทดสอบ "ออกแบบบ้านเบื้องต้น" — ตรวจ/ปัดผังห้อง · สรุปพื้นที่และคำเตือน · ออกแบบ/สั่งแก้/ย้อนฉบับ/ลบ (AI จำลอง) — รันด้วย `npm test`
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeLayout, normalizeReq, analyze } from '../house-concept.js'

const PORT = 3331
const BASE = `http://localhost:${PORT}/api`
const serverDir = dirname(dirname(fileURLToPath(import.meta.url)))
// บ้าน 2 ชั้น 3 ห้องนอน 2 ห้องน้ำ (ใช้ทดสอบหน้าจอได้ด้วย)
export const MOCK = {
  summary: 'บ้านโมเดิร์น 2 ชั้น ห้องนั่งเล่นเชื่อมทานข้าว ห้องนอนทั้งหมดอยู่ชั้นบน', style: 'โมเดิร์น', roof: 'gable', wall_color: '#F4F1EA', roof_color: '#4A4F55',
  floors: [
    { height: 3, rooms: [
      { name: 'ครัว', type: 'kitchen', x: 10, y: 10, w: 4, d: 3.5, doors: ['S'], windows: ['N', 'W'] },
      { name: 'ทานข้าว', type: 'dining', x: 14, y: 10, w: 3, d: 3.5, doors: ['S'], windows: ['N'] },
      { name: 'บันได', type: 'stair', x: 17, y: 10, w: 2.5, d: 3.5 },
      { name: 'ห้องน้ำ', type: 'bath', x: 17, y: 13.5, w: 2.5, d: 2, doors: ['W'], windows: ['E'] },
      { name: 'ห้องนั่งเล่น', type: 'living', x: 10, y: 13.5, w: 7, d: 5, doors: ['S'], windows: ['S', 'W'] },
      { name: 'โถง', type: 'hall', x: 17, y: 15.5, w: 2.5, d: 3, doors: ['E'] },
      { name: 'ชานหน้าบ้าน', type: 'porch', x: 11, y: 18.5, w: 5, d: 2 },
      { name: 'ที่จอดรถ', type: 'carport', x: 19.5, y: 13.5, w: 3.5, d: 5.5 },
    ] },
    { height: 3, rooms: [
      { name: 'ห้องนอนใหญ่', type: 'master', x: 10, y: 10, w: 4.5, d: 4.5, doors: ['E'], windows: ['N', 'W'] },
      { name: 'ห้องน้ำ', type: 'bath', x: 14.5, y: 10, w: 2.5, d: 2, doors: ['S'], windows: ['N'] },
      { name: 'โถงชั้นบน', type: 'hall', x: 14.5, y: 12, w: 2.5, d: 4 },
      { name: 'บันได', type: 'stair', x: 17, y: 10, w: 2.5, d: 3.5 },
      { name: 'เก็บของ', type: 'storage', x: 17, y: 13.5, w: 2.5, d: 2.5, doors: ['W'] },
      { name: 'ห้องนอน 2', type: 'bedroom', x: 10, y: 14.5, w: 4.5, d: 4, doors: ['E'], windows: ['S', 'W'] },
      { name: 'ห้องนอน 3', type: 'bedroom', x: 14.5, y: 16, w: 5, d: 2.5, doors: ['N'], windows: ['S', 'E'] },
      { name: 'ระเบียง', type: 'balcony', x: 10.5, y: 18.5, w: 4, d: 1.5 },
    ] },
  ],
  notes: ['ห้องนอนทุกห้องรับลมทิศใต้'],
}

test('ปัดผังห้อง: เลื่อนพิกัดให้เริ่มที่ 0 · ชนิดห้องแปลก = other · ด้านประตูผิด = ตัดทิ้ง · ระเบียงไม่มีหน้าต่าง', () => {
  const l = normalizeLayout({ roof: 'dome', floors: [{ rooms: [{ name: 'ก', type: 'xyz', x: 5, y: 7, w: 3.33, d: 0.2, doors: ['S', 'Q', 's'], windows: 'N,E' }, { type: 'porch', x: 5, y: 7.2, w: 2, d: 2, windows: ['N'] }] }, { rooms: [] }] })
  assert.equal(l.roof, 'gable')
  assert.equal(l.floors.length, 1) // ชั้นที่ไม่มีห้อง ตัดทิ้ง
  const [a, p] = l.floors[0].rooms
  assert.deepEqual([a.x, a.y, a.w, a.d, a.type], [0, 0, 3.35, 0.8, 'other'])
  assert.deepEqual(a.doors, ['S'])
  assert.deepEqual(a.windows, ['N', 'E'])
  assert.equal(p.name, 'ระเบียง/ชานหน้าบ้าน')
  assert.deepEqual(p.windows, [])
})

test('สรุปพื้นที่/ราคา + คำเตือน (ห้องทับ ชั้นบนยื่น เกินงบ เกินที่ดิน จำนวนห้องไม่ตรง)', () => {
  const l = normalizeLayout(MOCK)
  const q = normalizeReq({ floors: 2, bedrooms: 3, bathrooms: 2, budget: 3000000, price_per_sqm: 20000 })
  const a = analyze(l, q)
  assert.equal(a.bedrooms, 3); assert.equal(a.bathrooms, 2)
  assert.equal(a.indoor, 161.5)
  assert.equal(a.outdoor, 35.3) // ชาน 5×2 + จอดรถ 3.5×5.5 + ระเบียง 4×1.5
  assert.equal(a.total, 196.8)
  assert.equal(a.estimate, Math.round(a.total * 20000))
  assert.deepEqual(a.footprint, { w: 13, d: 10.5 })
  assert.ok(a.warnings.some((w) => w.includes('เกินงบ')))
  assert.ok(!a.warnings.some((w) => w.includes('ยื่นเกิน')))
  const bad = normalizeLayout({ floors: [{ rooms: [{ type: 'bedroom', x: 0, y: 0, w: 4, d: 4, doors: ['S'] }, { type: 'bath', x: 2, y: 2, w: 3, d: 3 }] }, { rooms: [{ type: 'bedroom', x: 8, y: 0, w: 3, d: 3, doors: ['S'] }] }] })
  const b = analyze(bad, normalizeReq({ floors: 2, bedrooms: 3, bathrooms: 2, land_w: 6, land_d: 20 }))
  for (const k of ['ทับกับ', 'ยื่นเกินชั้นล่าง', 'ไม่มีบันได', 'ยังไม่มีประตู', 'ห้องนอน 2 ห้อง', 'ห้องน้ำ 1 ห้อง', 'เกินหน้ากว้างที่ดิน']) assert.ok(b.warnings.some((w) => w.includes(k)), k)
})

let child, tmp, token
const call = async (method, path, body) => {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: r.status, data: await r.json() }
}
const waitDone = async (id) => {
  for (let i = 0; i < 50; i++) {
    const r = await call('GET', '/house-concepts/' + id)
    if (!['กำลังออกแบบ', 'กำลังแก้'].includes(r.data.status)) return r.data
    await new Promise((res) => setTimeout(res, 100))
  }
  throw new Error('ออกแบบไม่เสร็จ')
}

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'ppsd-concept-'))
  child = spawn(process.execPath, [join(serverDir, 'index.js')], { env: { ...process.env, PORT: String(PORT), PPSD_DB: join(tmp, 'test.sqlite'), PPSD_NO_TUNNEL: '1', PPSD_AI_MOCK_HOUSECONCEPT: JSON.stringify(MOCK) }, stdio: process.env.PPSD_TEST_STDIO ? 'inherit' : 'ignore' })
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

test('ออกแบบ → สั่งแก้ → ย้อนฉบับ → แก้ชื่อ → ลบ', async () => {
  assert.equal((await call('POST', '/house-concepts', { bedrooms: 0, bathrooms: 0 })).status, 400)
  const c = await call('POST', '/house-concepts', { customer: 'คุณทดสอบ', floors: 2, bedrooms: 3, bathrooms: 2, budget: '4,000,000', price_per_sqm: 20000, images: ['data:image/png;base64,iVBORw0KGgo='] })
  assert.equal(c.status, 200)
  assert.equal(c.data.title, 'บ้าน 2 ชั้น 3 ห้องนอน 2 ห้องน้ำ')
  assert.equal(c.data.req.budget, 4000000)
  const d = await waitDone(c.data.id)
  assert.equal(d.status, 'เสร็จ')
  assert.equal(d.layout.floors.length, 2)
  assert.equal(d.analysis.bedrooms, 3)
  assert.equal(d.layout.floors[0].rooms[0].x, 0) // เลื่อนพิกัดแล้ว

  assert.equal((await call('POST', `/house-concepts/${c.data.id}/revise`, { instruction: '' })).status, 400)
  const rv = await call('POST', `/house-concepts/${c.data.id}/revise`, { instruction: 'ขยายห้องนั่งเล่น' })
  assert.equal(rv.data.status, 'กำลังแก้')
  const d2 = await waitDone(c.data.id)
  assert.equal(d2.versions.length, 1)
  assert.match(d2.versions[0].note, /ขยายห้องนั่งเล่น/)

  const rs = await call('POST', `/house-concepts/${c.data.id}/restore`, { index: 0 })
  assert.equal(rs.status, 200)
  assert.equal(rs.data.versions.length, 1) // ฉบับปัจจุบันถูกเก็บแทน
  assert.equal(rs.data.versions[0].note, 'ก่อนย้อนกลับ')

  const u = await call('PUT', '/house-concepts/' + c.data.id, { title: 'แบบคุณทดสอบ' })
  assert.equal(u.data.title, 'แบบคุณทดสอบ')
  assert.equal(u.data.customer, 'คุณทดสอบ')
  assert.equal((await call('GET', '/house-concepts')).data.length, 1)
  assert.equal((await call('DELETE', '/house-concepts/' + c.data.id)).status, 200)
  assert.equal((await call('GET', '/house-concepts/' + c.data.id)).status, 404)
})
