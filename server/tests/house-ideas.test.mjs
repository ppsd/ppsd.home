// ชุดทดสอบ "ห้องรวมไอเดียแบบบ้าน" — ตรวจใบอนุญาต/โฮสต์รูป · ลิงก์โครงการ · เว็บลูกค้าเห็นเฉพาะรูปที่เปิด · ส่งไอเดียให้ AI ออกแบบ — รันด้วย `npm test`
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toEnglishQuery } from '../house-ideas.js'
// ผังจำลองเล็กๆ (ไม่ import จากเทสต์อื่น — จะพาเทสต์นั้นมารันซ้ำ)
const MOCK = { roof: 'gable', floors: [{ rooms: [{ name: 'ห้องนอน', type: 'bedroom', x: 0, y: 0, w: 4, d: 4, doors: ['S'] }, { name: 'ห้องน้ำ', type: 'bath', x: 4, y: 0, w: 2, d: 2, doors: ['W'] }] }] }

const PORT = 3332
const BASE = `http://localhost:${PORT}/api`
const serverDir = dirname(dirname(fileURLToPath(import.meta.url)))
let child, tmp, token
const call = async (method, path, body, auth = true) => {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: r.status, data: await r.json() }
}

test('แปลคำค้นไทย → อังกฤษ', () => {
  assert.equal(toEnglishQuery('บ้านโมเดิร์น 2 ชั้น สระว่ายน้ำ'), 'modern two storey pool house')
  assert.equal(toEnglishQuery('modern villa'), 'modern villa')
})

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'ppsd-ideas-'))
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

const PHOTO = { kind: 'photo', title: 'Modern house', image_url: 'https://live.staticflickr.com/1/2_abc_b.jpg', thumb_url: 'https://live.staticflickr.com/1/2_abc_z.jpg', page_url: 'https://www.flickr.com/photos/x/2', author: 'ช่างภาพ', license: 'CC BY 2.0', license_url: 'https://creativecommons.org/licenses/by/2.0/', source: 'flickr', style: 'โมเดิร์น', public: 1 }

test('เพิ่ม/แก้/ลบไอเดีย · ตรวจใบอนุญาตและแหล่งรูป · เว็บลูกค้าเห็นเฉพาะรูปที่เปิด', async () => {
  const seeded = (await call('GET', '/house-ideas')).data
  assert.ok(Array.isArray(seeded))
  assert.ok(seeded.every((x) => x.kind === 'link' || /^https:\/\/(live\.staticflickr\.com|(upload|thumb)\.wikimedia\.org)\//.test(x.image_url)), 'ชุดตั้งต้นใช้แต่รูปจากแหล่งที่อนุญาต')

  assert.equal((await call('POST', '/house-ideas', { ...PHOTO, image_url: 'https://example.com/a.jpg', thumb_url: '' })).status, 400) // โฮสต์อื่น
  assert.equal((await call('POST', '/house-ideas', { ...PHOTO, license: 'CC BY-NC 2.0' })).status, 400) // ห้ามใช้เชิงพาณิชย์
  assert.equal((await call('POST', '/house-ideas', { kind: 'link', title: 'ไม่มีลิงก์' })).status, 400)
  const p = await call('POST', '/house-ideas', PHOTO)
  assert.equal(p.status, 200)
  assert.equal((await call('POST', '/house-ideas', PHOTO)).status, 409) // ซ้ำ
  const l = await call('POST', '/house-ideas', { kind: 'link', title: 'บ้านดังตัวอย่าง', page_url: 'https://www.archdaily.com/x', note: 'หลังคาแบนยื่นยาว', public: 1, image_url: 'https://evil.example/x.jpg' })
  assert.equal(l.status, 200)
  assert.equal(l.data.public, 0) // ลิงก์ไม่ขึ้นเว็บลูกค้า
  assert.equal(l.data.image_url, '')

  const u = await call('PUT', '/house-ideas/' + p.data.id, { kind: 'render', note: 'ชอบหลังคา', author: 'แก้เครดิต', image_url: 'https://live.staticflickr.com/9/9.jpg' })
  assert.equal(u.data.kind, 'render')
  assert.equal(u.data.author, 'ช่างภาพ') // เครดิตแก้ไม่ได้
  assert.equal(u.data.image_url, PHOTO.image_url)
  assert.equal((await call('PUT', '/house-ideas/' + l.data.id, { kind: 'photo' })).status, 400)

  const pub = (await call('GET', '/public/house-ideas', undefined, false)).data
  assert.ok(pub.some((x) => x.id === p.data.id))
  assert.ok(!pub.some((x) => x.id === l.data.id))
  assert.ok(!('by' in pub[0]))

  // ส่งไอเดียให้ AI ออกแบบ — ข้อความไอเดียไปอยู่ในความต้องการ · นับจำนวนครั้งที่ใช้
  const c = await call('POST', '/house-concepts', { floors: 2, bedrooms: 3, bathrooms: 2, notes: 'เพดานสูง', idea_ids: [p.data.id, l.data.id] })
  assert.equal(c.status, 200)
  assert.match(c.data.req.notes, /เพดานสูง/)
  assert.match(c.data.req.notes, /บ้านดังตัวอย่าง/)
  assert.match(c.data.req.notes, /หลังคาแบนยื่นยาว/)
  const after1 = (await call('GET', '/house-ideas')).data.find((x) => x.id === p.data.id)
  assert.equal(after1.used, 1)

  // เว็บลูกค้า: ส่งแบบที่ชอบ — ใช้ได้เฉพาะไอเดียที่เปิดให้เว็บเห็น (ลิงก์ที่ไม่มีรูปถูกข้าม)
  const pc = await call('POST', '/public/house-concept', { floors: 1, bedrooms: 2, bathrooms: 1, idea_ids: [p.data.id, l.data.id] }, false)
  assert.equal(pc.status, 200)
  const last = (await call('GET', '/house-concepts')).data[0]
  assert.match(last.req.notes, /Modern house/)
  assert.doesNotMatch(last.req.notes, /บ้านดังตัวอย่าง/)
  assert.equal((await call('DELETE', '/house-ideas/' + l.data.id)).status, 200)
  assert.ok(!(await call('GET', '/house-ideas')).data.some((x) => x.id === l.data.id))
})
