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

test('รวมรายการซ้ำ: หากลุ่มซ้ำ (สะกดต่าง/เว้นวรรค) → รวม → ชื่อเดิมเป็นชื่อเรียกอื่น · รายการที่รวมปิดใช้งานแต่ตามรหัสเดิมเจอ · PO ชื่อเดิมนับรวม', async () => {
  const a = (await call('POST', '/material-prices', { name: 'ปูนซีเมนต์ ตรานกอินทรีย์ ทดสอบ', unit: 'ถุง', central: 140 })).data
  const b = (await call('POST', '/material-prices', { name: 'ปูนซีเมนต์ นกอินทรี ทดสอบ', unit: 'ถุง', central: 150 })).data
  // ทำให้เหมือนรายการที่มาจากประวัติซื้อ (ไม่ใช่ตั้งราคาเอง) — รวมแล้วต้องยังอัปเดตจาก PO ได้
  const Database = (await import('better-sqlite3')).default
  const sdb = new Database(join(tmp, 'test.sqlite'))
  sdb.prepare("UPDATE material_prices SET source='ประวัติ' WHERE id IN (?, ?)").run(a.id, b.id)
  const dup = (await call('GET', '/material-prices/duplicates')).data
  const g = dup.find((xs) => xs.some((m) => m.id === a.id))
  assert.ok(g && g.some((m) => m.id === b.id), 'ต้องจับ 2 ชื่อนี้เป็นกลุ่มเดียวกัน')
  const r = await call('POST', '/material-prices/merge', { keep_id: a.id, ids: [b.id], name: 'ปูนซีเมนต์ นกอินทรี ทดสอบ (มาตรฐาน)', central: 145, manual_price: false })
  assert.equal(r.status, 200, JSON.stringify(r.data))
  assert.equal(r.data.item.central, 145)
  assert.equal(r.data.item.source, 'รวมรายการ')
  const list = (await call('GET', '/material-prices')).data
  assert.ok(!list.some((m) => m.id === b.id), 'รายการที่ถูกรวมต้องไม่อยู่ในรายการปกติ')
  const allList = (await call('GET', '/material-prices?all=1')).data
  assert.equal(allList.find((m) => m.id === b.id).merged_into, a.id)
  // ชื่อเดิมทั้งสอง (สะกดต่างแต่ปรับแล้วเหมือนกัน) จำไว้เป็นชื่อเรียกอื่นของรายการมาตรฐาน
  const al = (await call('GET', '/material-aliases')).data.filter((x) => x.mp_id === a.id)
  assert.equal(al.length, 1)
  assert.ok(['ปูนซีเมนต์ ตรานกอินทรีย์ ทดสอบ', 'ปูนซีเมนต์ นกอินทรี ทดสอบ'].includes(al[0].alias))
  // PO ที่ใช้ชื่อเดิมทั้งสองแบบ → อัปเดตจากประวัติจริงต้องนับรวมเข้ารายการมาตรฐาน
  const ins = sdb.prepare('INSERT INTO purchase_orders (no, items) VALUES (?, ?)')
  ins.run('PO-T1', JSON.stringify([{ desc: 'ปูนซีเมนต์ ตรานกอินทรีย์ ทดสอบ', qty: 10, unit: 'ถุง', price: 140 }]))
  ins.run('PO-T2', JSON.stringify([{ desc: 'ปูนซีเมนต์ นกอินทรี ทดสอบ', qty: 10, unit: 'ถุง', price: 160 }]))
  sdb.close()
  assert.equal((await call('POST', '/material-prices/recompute', {})).status, 200)
  const after = (await call('GET', '/material-prices')).data.find((m) => m.id === a.id)
  assert.deepEqual([after.po_count, after.central, after.confidence], [2, 150, 'กลาง'])
  assert.equal((await call('POST', '/material-prices/merge', { keep_id: a.id, ids: [] })).status, 400)
})

test('จำการจับคู่จากถอดแบบ: บันทึกชื่อ → ชื่อเดียวกับรายการไม่ต้องจำ · ชื่อเดิมเลือกใหม่ = เปลี่ยนเป็นตัวล่าสุด', async () => {
  const m1 = (await call('POST', '/material-prices', { name: 'เหล็กข้ออ้อย DB16 ทดสอบ', unit: 'เส้น', central: 300 })).data
  const m2 = (await call('POST', '/material-prices', { name: 'เหล็กข้ออ้อย DB16 TXS ทดสอบ', unit: 'เส้น', central: 310 })).data
  const s1 = (await call('POST', '/material-aliases', { items: [{ alias: 'เหล็ก DB16 ยาว 10 ม. (ตามแบบ)', unit: 'เส้น', mp_id: m1.id }, { alias: 'เหล็กข้ออ้อย DB16 ทดสอบ', unit: 'เส้น', mp_id: m1.id }] })).data
  assert.equal(s1.saved, 1)
  await call('POST', '/material-aliases', { items: [{ alias: 'เหล็ก DB16 ยาว 10 ม. (ตามแบบ)', unit: 'เส้น', mp_id: m2.id }] })
  const al = (await call('GET', '/material-aliases')).data.filter((x) => x.alias === 'เหล็ก DB16 ยาว 10 ม. (ตามแบบ)')
  assert.deepEqual(al.map((x) => x.mp_id), [m2.id])
})

test('ค่าแรง: แก้ราคาลงประวัติ · นำเข้า Excel จับคู่รหัส/ชื่อ+แบบ · ช่วงราคา · "เสนอราคา" · รายการใหม่ · มีปัญหา', async () => {
  const r = (await call('POST', '/labor-rates', { grp: 'แยกงาน', name: 'งานทดสอบก่อผนัง', variant: 'อิฐมวลเบา', price_min: 120, price_max: 150, unit: 'ตร.ม.' })).data
  await call('PUT', '/labor-rates/' + r.id, { price_min: 130, price_max: 160 })
  await call('PUT', '/labor-rates/' + r.id, { note: 'แก้หมายเหตุอย่างเดียว' })
  const h = (await call('GET', `/labor-rates/${r.id}/history`)).data
  assert.deepEqual(h.map((x) => [x.source, x.old_min, x.old_max, x.new_min, x.new_max]), [['แก้เอง', 120, 150, 130, 160], ['เพิ่มใหม่', null, null, 120, 150]])
  const q = (await call('POST', '/labor-rates', { grp: 'แยกงาน', name: 'งานทดสอบฉาบ', price_min: 100, price_max: 100, unit: 'ตร.ม.' })).data
  const rows = [
    { row: 2, id: r.id, name: 'งานทดสอบก่อผนัง', variant: 'อิฐมวลเบา', price_min: 140, price_max: '', unit: 'ตร.ม.' }, // ช่วง → ราคาเดียว 140
    { row: 3, id: '', name: 'งานทดสอบฉาบ', variant: '', price_min: 'เสนอราคา', price_max: '', unit: 'ตร.ม.' }, // ไม่มีรหัส → ชื่อ+แบบ → เสนอราคา
    { row: 4, id: '', grp: 'เหมายกหลัง', name: 'งานทดสอบใหม่', variant: '', price_min: 3000, price_max: 3500, unit: 'ตร.ม.' },
    { row: 5, id: 99999, name: 'ไม่มี', price_min: 1 },
    { row: 6, id: r.id, name: 'x', price_min: 'abc' },
  ]
  const p = (await call('POST', '/labor-rates/import/preview', { rows })).data
  assert.deepEqual(p.changes.map((c) => [c.row, c.price_min, c.price_max, c.matched_by]), [[2, 140, 140, 'รหัส'], [3, 0, 0, 'ชื่อ+แบบ']])
  assert.deepEqual(p.added.map((a) => [a.name, a.grp, a.price_min, a.price_max]), [['งานทดสอบใหม่', 'เหมายกหลัง', 3000, 3500]])
  assert.deepEqual(p.errors.map((e) => e.row).sort(), [5, 6])
  const ap = (await call('POST', '/labor-rates/import/apply', { changes: p.changes, added: p.added })).data
  assert.deepEqual([ap.updated, ap.added], [2, 1])
  const list = (await call('GET', '/labor-rates')).data
  assert.deepEqual([list.find((x) => x.id === r.id).price_min, list.find((x) => x.id === r.id).price_max], [140, 140])
  assert.equal(list.find((x) => x.id === q.id).price_max, 0)
  assert.equal((await call('GET', `/labor-rates/${r.id}/history`)).data[0].source, 'Excel')
})

test('ราคาเก่า + ความเชื่อมั่น: รายการใหม่ = วันที่วันนี้ ไม่เก่า · ยืนยันเกิน 6 เดือน = ราคาเก่า · PO ราคาแกว่งเกิน 15% ลดความเชื่อมั่น 1 ขั้น · สรุปค่าใช้จ่าย AI', async () => {
  const m = (await call('POST', '/material-prices', { name: 'ท่อทดสอบราคาเก่า', unit: 'ท่อน', central: 100 })).data
  let row = (await call('GET', '/material-prices')).data.find((x) => x.id === m.id)
  assert.equal(row.price_date, new Date().toISOString().slice(0, 10))
  assert.equal(row.stale, false)
  const Database = (await import('better-sqlite3')).default
  const sdb = new Database(join(tmp, 'test.sqlite'))
  sdb.prepare("UPDATE material_prices SET price_date='2025-01-01' WHERE id=?").run(m.id)
  // PO 4 ใบ ราคาแกว่ง 100–150 → ซื้อ 4 ครั้ง (สูง) แต่แกว่งเกิน 15% → กลาง
  const ins = sdb.prepare('INSERT INTO purchase_orders (no, date, items) VALUES (?, ?, ?)')
  ;[100, 150, 120, 130].forEach((p, i) => ins.run('PO-S' + i, '1' + i + ' ต.ค. 69', JSON.stringify([{ desc: 'สายไฟทดสอบแกว่ง', qty: 1, unit: 'ม้วน', price: p }])))
  sdb.prepare("INSERT INTO ai_usage (at,feature,model,by,ok,input_tokens,output_tokens,cache_read,cache_write,web_searches,cost_usd) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run(new Date().toISOString().slice(0, 10) + ' 10:00:00', 'ถอดแบบ', 'claude-opus-5', 'tester', 1, 100000, 20000, 0, 0, 0, 1)
  sdb.close()
  row = (await call('GET', '/material-prices')).data.find((x) => x.id === m.id)
  assert.equal(row.stale, true)
  assert.ok(row.price_age_days > 180)
  await call('POST', '/material-prices/recompute', {})
  const wire = (await call('GET', '/material-prices')).data.find((x) => x.name === 'สายไฟทดสอบแกว่ง')
  assert.deepEqual([wire.po_count, wire.confidence], [4, 'กลาง'])
  assert.equal(wire.price_date, '2026-10-13')
  const u = (await call('GET', '/ai-usage')).data
  assert.ok(u.this_month.calls >= 1 && u.this_month.cost >= 1)
  assert.ok(u.by_feature.some((f) => f.feature === 'ถอดแบบ'))
})
