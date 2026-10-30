// ชุดทดสอบ "ถอดแบบ → BOQ ร่าง" — รันด้วย `npm test`
// ส่วนแรกทดสอบตัวอ่าน DXF / จับคู่ราคากลางตรงๆ · ส่วนหลังเปิดเซิร์ฟเวอร์บนฐานข้อมูลชั่วคราวแล้วยิง /boq-takeoff (AI ใช้ผลจำลอง)
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { summarizeDxf, rawItemsFromDxf, matchMaterial, matchLabor, cleanItems, cleanLabor, cleanFloor, flattenSections, floorFromText, normName } from '../takeoff.js'

// แปลนสุขาภิบาลย่อ หน่วย มม. — WC/LAV/MH (block) · ท่อน้ำดี 11 ม. · ท่อน้ำทิ้ง 7.5 ม. · ห้อง 3.6x3 · hatch 1.8x3
function sampleDxf() {
  const o = []
  const p = (c, v) => o.push(String(c), String(v))
  p(0, 'SECTION'); p(2, 'HEADER'); p(9, '$INSUNITS'); p(70, 4); p(0, 'ENDSEC')
  p(0, 'SECTION'); p(2, 'BLOCKS'); p(0, 'BLOCK'); p(8, '0'); p(2, 'WC'); p(0, 'LINE'); p(8, '0'); p(10, 0); p(20, 0); p(11, 9999); p(21, 0); p(0, 'ENDBLK'); p(0, 'ENDSEC')
  p(0, 'SECTION'); p(2, 'ENTITIES')
  const ins = (n, l) => { p(0, 'INSERT'); p(8, l); p(2, n); p(10, 0); p(20, 0) }
  ins('WC', 'P-SANITARY'); ins('LAV', 'P-SANITARY'); ins('MH', 'P-DRAIN'); ins('MH', 'P-DRAIN'); ins('MH', 'P-DRAIN')
  p(0, 'LWPOLYLINE'); p(8, 'P-CW-12'); p(90, 4); p(70, 0); p(10, 4500); p(20, 1500); p(10, 4500); p(20, 9000); p(10, 3500); p(20, 9000); p(10, 3500); p(20, 11500)
  p(0, 'LINE'); p(8, 'P-W-2'); p(10, 0); p(20, 0); p(11, 0); p(21, 4000)
  p(0, 'LINE'); p(8, 'P-W-2'); p(10, 0); p(20, 4000); p(11, 3500); p(21, 4000)
  p(0, 'LWPOLYLINE'); p(8, 'A-ROOM'); p(90, 4); p(70, 1); p(10, 0); p(20, 0); p(10, 3600); p(20, 0); p(10, 3600); p(20, 3000); p(10, 0); p(20, 3000)
  p(0, 'HATCH'); p(8, 'A-FLOOR'); p(10, 0); p(20, 0); p(2, 'SOLID'); p(70, 1); p(71, 0); p(91, 1)
  p(92, 3); p(72, 0); p(73, 1); p(93, 4); p(10, 0); p(20, 0); p(10, 1800); p(20, 0); p(10, 1800); p(20, 3000); p(10, 0); p(20, 3000); p(97, 0); p(98, 0)
  p(0, 'MTEXT'); p(8, 'A-TEXT'); p(1, '{\\fTahoma|b0;ห้องนอน\\P+2.10}')
  p(0, 'ENDSEC'); p(0, 'EOF')
  return o.join('\r\n') + '\r\n'
}

test('อ่าน DXF: นับ Block (ไม่นับเส้นใน BLOCK) · ความยาวตาม Layer · พื้นที่รูปปิด/Hatch · ตัวหนังสือ', () => {
  const s = summarizeDxf(sampleDxf())
  assert.equal(s.units, 'มม.')
  assert.deepEqual(s.blocks.map((b) => [b.name, b.count]), [['MH', 3], ['WC', 1], ['LAV', 1]])
  const len = Object.fromEntries(s.lengths.map((l) => [l.layer, l.length_m]))
  assert.equal(len['P-CW-12'], 11)
  assert.equal(len['P-W-2'], 7.5)
  assert.equal(len['0'], undefined, 'เส้นที่อยู่ในนิยาม BLOCK ต้องไม่ถูกนับ')
  const area = Object.fromEntries(s.areas.map((a) => [a.layer, a.area_m2]))
  assert.equal(area['A-ROOM'], 10.8)
  assert.equal(area['A-FLOOR'], 5.4)
  assert.ok(s.texts.some((t) => t.text === 'ห้องนอน +2.10'))
  const raw = rawItemsFromDxf(s)
  assert.ok(raw.find((r) => r.desc === 'MH' && r.qty === 3 && r.cat === 'ระบบประปา-สุขาภิบาล'))
})

// ห้องน้ำทั้งชุดเป็นบล็อก (มี WC/LAV ซ้อนข้างใน) · ประตูเป็น dynamic block (*U5 → DOOR-90) · โคมไฟวางแบบอาร์เรย์ 2×3 · กรอบแบบใน Layout
function nestedDxf() {
  const o = []
  const p = (c, v) => o.push(String(c), String(v))
  p(0, 'SECTION'); p(2, 'HEADER'); p(9, '$INSUNITS'); p(70, 4); p(0, 'ENDSEC')
  p(0, 'SECTION'); p(2, 'TABLES'); p(0, 'TABLE'); p(2, 'BLOCK_RECORD')
  p(0, 'BLOCK_RECORD'); p(5, '1A'); p(2, 'DOOR-90')
  p(0, 'BLOCK_RECORD'); p(5, '2B'); p(2, '*U5'); p(1001, 'AcDbBlockRepBTag'); p(1070, 1); p(1005, '1A')
  p(0, 'ENDTAB'); p(0, 'ENDSEC')
  p(0, 'SECTION'); p(2, 'BLOCKS')
  p(0, 'BLOCK'); p(8, '0'); p(2, 'BATH-SET'); p(0, 'INSERT'); p(8, '0'); p(2, 'WC'); p(0, 'INSERT'); p(8, 'P-FIX'); p(2, 'LAV'); p(0, 'ENDBLK')
  p(0, 'BLOCK'); p(8, '0'); p(2, 'WC'); p(0, 'ENDBLK')
  p(0, 'ENDSEC')
  p(0, 'SECTION'); p(2, 'ENTITIES')
  p(0, 'INSERT'); p(8, 'P-SAN'); p(2, 'BATH-SET'); p(10, 0); p(20, 0)
  p(0, 'INSERT'); p(8, 'P-SAN'); p(2, 'BATH-SET'); p(10, 5000); p(20, 0)
  p(0, 'INSERT'); p(8, 'A-DOOR'); p(2, '*U5'); p(10, 0); p(20, 0)
  p(0, 'INSERT'); p(8, 'E-LIGHT'); p(2, 'LAMP'); p(70, 2); p(71, 3); p(10, 0); p(20, 0)
  p(0, 'LINE'); p(8, 'TITLE'); p(67, 1); p(10, 0); p(20, 0); p(11, 420000); p(21, 0)
  p(0, 'INSERT'); p(8, 'TITLE'); p(67, 1); p(2, 'TITLEBLOCK'); p(10, 0); p(20, 0)
  p(0, 'ENDSEC'); p(0, 'EOF')
  return o.join('\r\n') + '\r\n'
}
test('อ่าน DXF: ไม่นับของในหน้า Layout · ชื่อจริงของ dynamic block · นับบล็อกที่ซ้อนในบล็อก · อาร์เรย์ MINSERT', () => {
  const s = summarizeDxf(nestedDxf())
  const cnt = Object.fromEntries(s.blocks.map((b) => [b.name + '@' + b.layer, b.count]))
  assert.equal(cnt['BATH-SET@P-SAN'], 2)
  assert.equal(cnt['WC@P-SAN'], 2, 'WC ใน Layer 0 ของบล็อก → ใช้ Layer ของตัวที่วาง')
  assert.equal(cnt['LAV@P-FIX'], 2)
  assert.equal(cnt['DOOR-90@A-DOOR'], 1, '*U5 ต้องได้ชื่อจริง DOOR-90')
  assert.equal(cnt['LAMP@E-LIGHT'], 6, 'อาร์เรย์ 2×3 = 6 ดวง')
  assert.equal(cnt['TITLEBLOCK@TITLE'], undefined, 'บล็อกในหน้า Layout ต้องไม่ถูกนับ')
  assert.equal(s.lengths.find((l) => l.layer === 'TITLE'), undefined, 'เส้นในหน้า Layout ต้องไม่ถูกนับ')
  assert.equal(s.paper_skipped, 2)
  assert.equal(s.blocks.find((b) => b.name === 'WC').nested, 2)
  assert.match(rawItemsFromDxf(s).find((r) => r.desc === 'WC').basis, /อยู่ในบล็อกอื่น 2/)
})

test('อ่าน DXF: บังคับหน่วยเป็นเมตร → ค่าเปลี่ยนตาม · ไฟล์ที่ไม่ใช่ DXF แจ้งข้อผิดพลาด', () => {
  const s = summarizeDxf(sampleDxf(), 'm')
  assert.equal(s.lengths.find((l) => l.layer === 'P-W-2').length_m, 7500)
  assert.throws(() => summarizeDxf('hello world'), /DXF/)
})

test('จับคู่ราคากลาง: ชื่อสะกดต่าง/เว้นวรรคต่างยังเจอ · ขนาดไม่ตรงต้องไม่จับคู่ · ค่าแรงตามชื่อหมวด', () => {
  const mats = [
    { id: 1, name: 'ปูนซีเมนต์ ตรานกอินทรีย์ แดง', unit: 'ถุง', central: 143 },
    { id: 2, name: 'เหล็กข้ออ้อย 12มม.(DB12) x 10ม. ตรง TXS เขียว', unit: 'เส้น', central: 190 },
    { id: 3, name: 'เหล็กข้ออ้อย 16มม.(DB16) x 10ม. ตรง TXS เขียว', unit: 'เส้น', central: 340 },
  ]
  assert.equal(matchMaterial({ desc: 'ปูนซีเมนต์ นกอินทรีแดง', unit: 'ถุง' }, mats).match?.id, 1)
  assert.equal(matchMaterial({ desc: 'เหล็กข้ออ้อย DB12 ยาว 10 ม.', unit: 'เส้น' }, mats).match?.id, 2)
  assert.notEqual(matchMaterial({ desc: 'เหล็กข้ออ้อย DB20 ยาว 10 ม.', unit: 'เส้น' }, mats).match?.id, 3)
  const rates = [{ id: 9, name: 'งานติดตั้งสุขภัณฑ์ (เหมาย่อห้อง)', variant: '', price_min: 2500, price_max: 2500, unit: 'ห้อง' }, { id: 10, name: 'งานระบบไฟฟ้า', variant: '', price_min: 0, price_max: 0, unit: 'เหมา' }]
  assert.equal(matchLabor({ labor: 'งานติดตั้งสุขภัณฑ์ (เหมาย่อห้อง)' }, rates)?.price, 2500)
  assert.equal(matchLabor({ labor: 'งานระบบไฟฟ้า' }, rates)?.quote, true)
  assert.equal(matchLabor({ labor: '' }, rates), null)
  const c = cleanItems([{ cat: 'มั่ว', desc: 'ท่อ PVC', qty: '1,200.5', confidence: 'x' }, { desc: '' }])
  assert.deepEqual(c.map((x) => [x.cat, x.qty, x.confidence]), [['ระบบประปา-สุขาภิบาล', 1200.5, 'กลาง']])
})

test('ค่าแรงแยกจากวัสดุ: ใช้หน่วยของราคากลางค่าแรง (ไม่ใช่หน่วยวัสดุ) · ตัดหน่วยในวงเล็บเหลี่ยม · ชื่อที่ไม่มีในราคากลางทิ้ง', () => {
  const rates = [
    { id: 5, name: 'งานก่อผนังอิฐแดง', variant: '', price_min: 120, price_max: 150, unit: 'ตร.ม.' },
    { id: 1, name: 'งานโครงสร้าง', variant: 'รวมไม้แบบ', price_min: 1200, price_max: 1200, unit: 'ตร.ม.' },
  ]
  const l = cleanLabor([
    { labor: 'งานก่อผนังอิฐแดง [ต่อ ตร.ม.]', qty: 112, unit: 'ก้อน', basis: 'ผนัง 40 ม. x 2.8 ม.' },
    { labor: 'งานโครงสร้าง (รวมไม้แบบ)', qty: '85' },
    { labor: 'งานที่ไม่มีในระบบ', qty: 3 },
  ], rates)
  assert.deepEqual(l.map((x) => [x.rate_id, x.qty, x.unit, x.price, x.cat]), [[5, 112, 'ตร.ม.', 135, 'สถาปัตยกรรม'], [1, 85, 'ตร.ม.', 1200, 'โครงสร้าง']])
})

// ---------- ผ่าน API ----------
const PORT = 3298
const BASE = `http://localhost:${PORT}/api`
const serverDir = dirname(dirname(fileURLToPath(import.meta.url)))
let child, tmp, token
const MOCK = { drawing: 'แปลนสุขาภิบาล', items: [
  { cat: 'ระบบประปา-สุขาภิบาล', desc: 'ชักโครก', qty: 1, unit: 'ชุด', basis: 'นับสัญลักษณ์', confidence: 'สูง' },
  { cat: 'ระบบประปา-สุขาภิบาล', desc: 'บ่อพัก', qty: 3, unit: 'บ่อ', basis: 'นับสัญลักษณ์', confidence: 'สูง' },
], labor: [{ labor: 'งานติดตั้งสุขภัณฑ์ (เหมาย่อห้อง)', qty: 1, basis: 'ห้องน้ำ 1 ห้อง', confidence: 'สูง' }], notes: ['ความยาวท่อเป็นค่าประมาณ'] }

const WEB = { items: [{ no: 1, price: 4500, unit: 'ชุด', low: 3900, high: 5200, shop: 'HomePro', url: 'https://www.homepro.co.th/p/1', sources: 3, note: 'ชักโครกชิ้นเดียว' }, { no: 2, price: 0, note: 'สเปกไม่ชัด', url: 'javascript:bad' }] }

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'ppsd-takeoff-'))
  child = spawn(process.execPath, [join(serverDir, 'index.js')], {
    env: { ...process.env, PORT: String(PORT), PPSD_DB: join(tmp, 'test.sqlite'), PPSD_NO_TUNNEL: '1', PPSD_AI_MOCK_TAKEOFF: JSON.stringify(MOCK), PPSD_AI_MOCK_WEBPRICE: JSON.stringify(WEB) },
    stdio: process.env.PPSD_TEST_STDIO ? 'inherit' : 'ignore',
  })
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

const upload = async (q, body) => {
  const r = await fetch(BASE + '/boq-takeoff?' + new URLSearchParams(q), { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' }, body })
  return { status: r.status, data: await r.json() }
}

test('API ถอดแบบ: PDF → รายการจาก AI + จับคู่ค่าแรง · DXF แนบสรุปดิบ · DWG เสีย/ไฟล์อื่นถูกปฏิเสธ', async () => {
  const pdf = await upload({ name: 'plan.pdf', mime: 'application/pdf', house: JSON.stringify({ area_m2: 85 }) }, Buffer.from('%PDF-1.4 test'))
  assert.equal(pdf.status, 200, JSON.stringify(pdf.data))
  assert.equal(pdf.data.source, 'pdf')
  assert.equal(pdf.data.items.length, 2)
  assert.equal(pdf.data.items[0].lab_match, undefined, 'แถววัสดุต้องไม่มีค่าแรงติดมา')
  assert.deepEqual(pdf.data.labor.map((l) => [l.name, l.qty, l.unit, l.price]), [['งานติดตั้งสุขภัณฑ์ (เหมาย่อห้อง)', 1, 'ห้อง', 2500]])
  assert.deepEqual(pdf.data.notes, ['ความยาวท่อเป็นค่าประมาณ'])

  const dxf = await upload({ name: 'plan.dxf', mime: 'application/octet-stream' }, Buffer.from(sampleDxf(), 'utf8'))
  assert.equal(dxf.status, 200, JSON.stringify(dxf.data))
  assert.equal(dxf.data.source, 'dxf')
  assert.equal(dxf.data.dxf.blocks[0].count, 3)

  const dwg = await upload({ name: 'plan.dwg', mime: 'application/octet-stream' }, Buffer.from('AC1032xxxx'))
  assert.equal(dwg.status, 400)
  assert.match(dwg.data.error, /DXF/)
  const txt = await upload({ name: 'note.txt', mime: 'text/plain' }, Buffer.from('x'))
  assert.equal(txt.status, 400)
})

test('API ถอดแบบจากเอกสารของบ้าน: เลือกหลาย PDF/รูปพร้อมกัน · DWG/DXF ปนไฟล์อื่นไม่ได้ · ไฟล์ที่ถอดไม่ได้/ไม่มีอยู่ถูกปฏิเสธ', async () => {
  const put = async (name, mime, body) => {
    const r = await fetch(BASE + '/files?' + new URLSearchParams({ name, mime, house: 'H-TAKEOFF', category: 'แบบก่อสร้าง' }), { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' }, body })
    return (await r.json()).id
  }
  const pdf = await put('แปลนชั้น1.pdf', 'application/pdf', Buffer.from('%PDF-1.4 a'))
  const png = await put('แปลนชั้น2.png', 'image/png', Buffer.from('\x89PNG test'))
  const dxf = await put('แปลน.dxf', 'application/octet-stream', Buffer.from(sampleDxf(), 'utf8'))
  const skp = await put('โมเดล.skp', 'application/octet-stream', Buffer.from('skp'))
  const pick = async (ids) => {
    const r = await fetch(BASE + '/boq-takeoff?' + new URLSearchParams({ house: '{}' }), { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ file_ids: ids }) })
    return { status: r.status, data: await r.json() }
  }
  const multi = await pick([pdf, png])
  assert.equal(multi.status, 200, JSON.stringify(multi.data))
  assert.equal(multi.data.source, 'multi')
  assert.deepEqual(multi.data.files, ['แปลนชั้น1.pdf', 'แปลนชั้น2.png'])
  const one = await pick([dxf])
  assert.equal(one.status, 200, JSON.stringify(one.data))
  assert.equal(one.data.source, 'dxf')
  assert.equal(one.data.dxf.blocks[0].count, 3)
  assert.equal((await pick([dxf, pdf])).status, 400, 'DWG/DXF ต้องถอดทีละไฟล์')
  assert.equal((await pick([skp])).status, 400, '.skp ถอดไม่ได้')
  assert.equal((await pick([999999])).status, 404)
  assert.equal((await pick([])).status, 400)
})

test('API ราคาจากเว็บ: คืนราคาต่อรายการตามลำดับ · ลิงก์ไม่ใช่ http ถูกตัด · รายการว่างถูกปฏิเสธ', async () => {
  const call = async (items) => {
    const r = await fetch(BASE + '/boq-takeoff/web-prices', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) })
    return { status: r.status, data: await r.json() }
  }
  const r = await call([{ desc: 'ชักโครก', unit: 'ชุด' }, { desc: 'บ่อพัก', unit: 'บ่อ' }])
  assert.equal(r.status, 200, JSON.stringify(r.data))
  assert.deepEqual(r.data.items.map((x) => [x.desc, x.price, x.shop, x.url]), [['ชักโครก', 4500, 'HomePro', 'https://www.homepro.co.th/p/1'], ['บ่อพัก', 0, '', '']])
  assert.equal((await call([])).status, 400)
})

test('API ถอดแบบแบบงานเบื้องหลัง (?async=1): คืนเลขงานทันที แล้วถามผลได้ · เลขงานผิด 404 · งานที่ล้มเหลวคืนข้อความ', async () => {
  const start = async (q, body) => {
    const r = await fetch(BASE + '/boq-takeoff?' + new URLSearchParams({ ...q, async: '1' }), { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' }, body })
    return { status: r.status, data: await r.json() }
  }
  const poll = async (id) => {
    for (let i = 0; i < 50; i++) {
      const r = await fetch(BASE + '/boq-takeoff/jobs/' + id, { headers: { Authorization: 'Bearer ' + token } })
      const d = await r.json()
      if (r.status !== 200 || d.status === 'done') return { status: r.status, data: d }
      await new Promise((ok) => setTimeout(ok, 100))
    }
    throw new Error('งานไม่เสร็จ')
  }
  const ok = await start({ name: 'plan.pdf', mime: 'application/pdf' }, Buffer.from('%PDF-1.4 x'))
  assert.equal(ok.status, 202)
  const done = await poll(ok.data.job)
  assert.equal(done.status, 200)
  assert.equal(done.data.result.items.length, 2)
  const bad = await start({ name: 'note.txt', mime: 'text/plain' }, Buffer.from('x'))
  assert.equal(bad.status, 202)
  const failed = await poll(bad.data.job)
  assert.equal(failed.status, 400)
  assert.match(failed.data.error, /ถอดแบบได้/)
  const none = await fetch(BASE + '/boq-takeoff/jobs/nope', { headers: { Authorization: 'Bearer ' + token } })
  assert.equal(none.status, 404)
})

test('ไฟล์ใหญ่เกินกำหนด → ตอบ JSON ภาษาไทย (ไม่ใช่หน้า HTML)', async () => {
  const r = await fetch(BASE + '/files?name=big.bin', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' }, body: Buffer.alloc(211 * 1048576) })
  assert.equal(r.status, 413)
  assert.match((await r.json()).error, /ใหญ่เกิน/)
})

test('ชั้นของรายการ: ชื่อชั้นจาก AI เป็นรูปเดียวกัน · ผล AI เก็บชั้นไว้ (ไม่ระบุ = ทั้งหลัง) · รายการดิบจาก DXF = ทั้งหลัง', () => {
  assert.deepEqual(['ชั้นที่ 1', '2', '2nd floor', 'ฐานราก', 'Roof', 'งานภายนอก', '', 'ชั้นลอย'].map(cleanFloor), ['ชั้น 1', 'ชั้น 2', 'ชั้น 2', 'ฐานราก/ใต้ดิน', 'หลังคา', 'ภายนอก', 'ทั้งหลัง', 'ชั้นลอย'])
  const c = cleanItems([{ floor: 'ชั้นที่ 2', cat: 'โครงสร้าง', desc: 'เหล็ก DB12', qty: 10 }, { cat: 'โครงสร้าง', desc: 'ปูน', qty: 1 }])
  assert.deepEqual(c.map((x) => x.floor), ['ชั้น 2', 'ทั้งหลัง'])
  const rates = [{ id: 5, name: 'งานก่อผนังอิฐแดง', variant: '', price_min: 120, price_max: 150, unit: 'ตร.ม.' }]
  assert.equal(cleanLabor([{ floor: '1', labor: 'งานก่อผนังอิฐแดง', qty: 50 }], rates)[0].floor, 'ชั้น 1')
  assert.ok(rawItemsFromDxf(summarizeDxf(sampleDxf())).every((x) => x.floor === 'ทั้งหลัง'))
})

test('ผล AI แบบแบ่งหมวด: แถวได้ชั้น/ประเภทงาน/ส่วนงาน/แผ่นแบบจากหมวด · ปริมาณงานต่อหมวด · ไม่ระบุชั้นเดาจากข้อความ', () => {
  const f = flattenSections({ sections: [
    { floor: 'ชั้นที่ 2', cat: 'โครงสร้าง', part: 'เสา คาน พื้น', sheet: 'S-03', work: [{ desc: 'พื้นที่พื้น', qty: '25.5', unit: 'ตร.ม.' }, { desc: '' }], items: [{ desc: 'เหล็ก DB12', qty: 30, unit: 'เส้น' }], labor: [{ labor: 'งานโครงสร้าง (รวมไม้แบบ)', qty: 25.5 }] },
    { floor: 'หลังคา', cat: 'โครงสร้าง', part: 'โครงหลังคา', items: [{ desc: 'เหล็กตัวซี', qty: 14, unit: 'เส้น' }] },
  ], items: [{ cat: 'โครงสร้าง', desc: 'ปูน', qty: 5, unit: 'ถุง', basis: 'ฉาบผนังชั้น 3' }] })
  const it = cleanItems(f.items)
  assert.deepEqual(it.map((x) => [x.desc, x.floor, x.part, x.sheet]), [['เหล็ก DB12', 'ชั้น 2', 'เสา คาน พื้น', 'S-03'], ['เหล็กตัวซี', 'หลังคา', 'โครงหลังคา', ''], ['ปูน', 'ชั้น 3', '', '']])
  assert.deepEqual(f.work, [{ floor: 'ชั้น 2', cat: 'โครงสร้าง', part: 'เสา คาน พื้น', sheet: 'S-03', work: [{ desc: 'พื้นที่พื้น', qty: 25.5, unit: 'ตร.ม.' }] }])
  const rates = [{ id: 1, name: 'งานโครงสร้าง', variant: 'รวมไม้แบบ', price_min: 1200, price_max: 1200, unit: 'ตร.ม.' }]
  assert.deepEqual(cleanLabor(f.labor, rates).map((x) => [x.floor, x.part, x.cat]), [['ชั้น 2', 'เสา คาน พื้น', 'โครงสร้าง']])
  assert.equal(floorFromText('เสาเข็ม I-0.18'), 'ฐานราก/ใต้ดิน')
  assert.equal(floorFromText('อะไรก็ไม่รู้'), 'ทั้งหลัง')
})

test('BOQ เก็บปริมาณงานต่อหมวด (work) ตอนสร้าง/แก้ และคืนกลับมา', async () => {
  const work = [{ floor: 'ชั้น 1', cat: 'โครงสร้าง', part: 'เสา คาน พื้น', sheet: 'S-02', work: [{ desc: 'พื้นที่พื้น', qty: 25.5, unit: 'ตร.ม.' }] }]
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  const r = await fetch(BASE + '/boqs', { method: 'POST', headers: h, body: JSON.stringify({ title: 't', items: [{ floor: 'ชั้น 1', part: 'เสา คาน พื้น', cat: 'โครงสร้าง', desc: 'DB12', qty: 1, unit: 'เส้น', mat: 1, lab: 0 }], work }) })
  const b = await r.json()
  assert.equal(r.status, 201)
  assert.deepEqual(b.work, work)
  assert.equal(b.items[0].part, 'เสา คาน พื้น')
  const u = await (await fetch(BASE + '/boqs/' + b.id, { method: 'PUT', headers: h, body: JSON.stringify({ title: 't2' }) })).json()
  assert.deepEqual(u.work, work, 'แก้ BOQ โดยไม่ส่ง work ต้องไม่ลบของเดิม')
})

test('เลข BOQ: ลบใบเก่าแล้วสร้างใหม่ เลขต้องไม่ซ้ำใบที่ยังอยู่', async () => {
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  const mk = async () => (await (await fetch(BASE + '/boqs', { method: 'POST', headers: h, body: JSON.stringify({ title: 'เลข', items: [] }) })).json())
  const a = await mk(), b = await mk()
  await fetch(BASE + '/boqs/' + a.id, { method: 'DELETE', headers: h })
  const c = await mk()
  assert.notEqual(c.no, b.no, `ได้เลขซ้ำ ${c.no}`)
  const nos = (await (await fetch(BASE + '/boqs', { headers: h })).json()).map((x) => x.no)
  assert.equal(new Set(nos).size, nos.length, 'เลข BOQ ต้องไม่ซ้ำ')
})

test('งานถอดแบบเบื้องหลังเก็บในฐานข้อมูล: ถามผลซ้ำได้หลังเสร็จ · ไฟล์ชั่วคราวถูกลบเมื่อเสร็จ', async () => {
  const r = await fetch(BASE + '/boq-takeoff?' + new URLSearchParams({ name: 'plan.pdf', mime: 'application/pdf', async: '1' }), { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' }, body: Buffer.from('%PDF-1.4 x') })
  const { job } = await r.json()
  let d
  for (let i = 0; i < 50; i++) { d = await (await fetch(BASE + '/boq-takeoff/jobs/' + job, { headers: { Authorization: 'Bearer ' + token } })).json(); if (d.status === 'done') break; await new Promise((ok) => setTimeout(ok, 100)) }
  assert.equal(d.status, 'done')
  const again = await (await fetch(BASE + '/boq-takeoff/jobs/' + job, { headers: { Authorization: 'Bearer ' + token } })).json()
  assert.equal(again.result.items.length, d.result.items.length, 'ถามซ้ำต้องได้ผลเดิม')
  assert.equal(existsSync(join(tmp, 'takeoff-jobs', job)), false, 'ไฟล์ชั่วคราวต้องถูกลบเมื่อเสร็จ')
})

test('จับคู่ราคากลางด้วยชื่อที่จำไว้: ชื่อตรงกับชื่อเรียกอื่น = จับคู่ทันที (remembered) · ชื่อเรียกอื่นช่วยเทียบแบบหยาบ', () => {
  const mats = [{ id: 1, name: 'คอนกรีตผสมเสร็จ CU240KS อินทรี', unit: 'คิว', central: 1730 }, { id: 2, name: 'ทรายหยาบ', unit: 'คิว', central: 450 }]
  const aliases = [{ mp_id: 1, alias: 'คอนกรีตผสมเสร็จ 240 ksc', nkey: normName('คอนกรีตผสมเสร็จ 240 ksc'), unit: 'ลบ.ม.' }]
  const r = matchMaterial({ desc: 'คอนกรีตผสมเสร็จ 240 ksc', unit: 'ลบ.ม.' }, mats, aliases)
  assert.equal(r.match?.id, 1)
  assert.equal(r.match?.remembered, true)
  assert.equal(matchMaterial({ desc: 'คอนกรีตผสมเสร็จ 240ksc (ฐานราก)', unit: 'ลบ.ม.' }, mats, aliases).match?.id, 1)
  assert.equal(matchMaterial({ desc: 'คอนกรีตผสมเสร็จ 240 ksc', unit: 'ลบ.ม.' }, mats, []).match?.remembered, undefined)
})
