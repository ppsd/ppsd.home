// ชุดทดสอบ "ออกแบบบ้านจากเว็บลูกค้า" (ไม่ต้องล็อกอิน) — ใช้ฐานข้อมูลในหน่วยความจำ + AI จำลอง ไม่แตะ server/data
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import express from 'express'
import Database from 'better-sqlite3'
import { createPublicHouseConcept } from '../house-concept-public.js'

const src = readFileSync(new URL('./house-concept.test.mjs', import.meta.url), 'utf8')
const a = src.indexOf('export const MOCK = ') + 20
const MOCK = eval('(' + src.slice(a, src.indexOf('\n}\n', a) + 2) + ')')
let server, base, db
const nowTS = () => new Date().toISOString().replace('T', ' ').slice(0, 19)

before(async () => {
  process.env.PPSD_AI_MOCK_HOUSECONCEPT = JSON.stringify(MOCK)
  db = new Database(':memory:')
  db.exec('CREATE TABLE house_concepts (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, by TEXT, by_id INTEGER, title TEXT, customer TEXT, req TEXT, layout TEXT, versions TEXT, status TEXT, error TEXT, model TEXT, cost_usd REAL, updated TEXT, updated_by TEXT)')
  const app = express(); app.use(express.json())
  app.use('/api/public', createPublicHouseConcept({ db, nowTS, aiKey: () => '', clientIp: () => '1.2.3.4' }))
  await new Promise((ok) => { server = app.listen(0, ok) })
  base = `http://127.0.0.1:${server.address().port}/api/public`
})
after(() => { server?.close(); delete process.env.PPSD_AI_MOCK_HOUSECONCEPT })

const post = (body) => fetch(base + '/house-concept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

test('ลูกค้ากรอกความต้องการ → ได้ผังห้อง + สรุป ไม่เห็นชื่อ/เบอร์', async () => {
  assert.equal((await (await fetch(base + '/house-concept/status')).json()).ok, true)
  const r = await post({ floors: 2, bedrooms: 3, bathrooms: 2, budget: 4000000, name: 'ทดสอบ', phone: '0800000000', images: ['data:image/png;base64,AAAA'] })
  assert.equal(r.status, 200)
  const { token } = await r.json()
  assert.match(token, /^[0-9a-f]{32}$/)
  let x
  for (let i = 0; i < 20; i++) { x = await (await fetch(base + '/house-concept/' + token)).json(); if (x.status !== 'working') break; await new Promise((ok) => setTimeout(ok, 50)) }
  assert.equal(x.status, 'done')
  assert.equal(x.layout.floors.length, 2)
  assert.equal(x.stats.bedrooms, 3)
  assert.ok(!JSON.stringify(x).includes('0800000000'))
  const row = db.prepare('SELECT by, customer FROM house_concepts').get()
  assert.equal(row.by, 'เว็บลูกค้า')
  assert.equal(row.customer, 'ทดสอบ · 0800000000')
})

test('รหัสที่ไม่มีอยู่ → 404 · ไม่มีห้อง → 400 · เกินโควตาต่อ IP → 429', async () => {
  assert.equal((await fetch(base + '/house-concept/' + 'f'.repeat(32))).status, 404)
  assert.equal((await post({ bedrooms: 0, bathrooms: 0 })).status, 400)
  assert.equal((await post({ bedrooms: 2, bathrooms: 1 })).status, 200)
  assert.equal((await post({ bedrooms: 2, bathrooms: 1 })).status, 200)
  assert.equal((await post({ bedrooms: 2, bathrooms: 1 })).status, 429)
})
