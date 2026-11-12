// ออกแบบบ้านเบื้องต้นตามความต้องการลูกค้า (AI จัดผังห้อง → หน้าเว็บวาดแปลน + 3D หมุนดูได้เอง)
//  - กรอก: จำนวนชั้น ห้องนอน ห้องน้ำ งบ ราคาต่อ ตร.ม. ขนาดที่ดิน สไตล์ ห้องพิเศษ + รูปตัวอย่างที่ลูกค้าชอบ (ส่งให้ AI ดูสไตล์ ไม่เก็บรูป)
//  - AI (Claude) คืน "ผังห้อง" เป็นตัวเลข (ห้องสี่เหลี่ยม ตำแหน่ง/ขนาดเป็นเมตร + ด้านที่มีประตู/หน้าต่าง) — ไม่ได้วาดรูปเอง
//  - เซิร์ฟเวอร์ตรวจ/ปัดตัวเลข แล้วสรุปพื้นที่ จำนวนห้อง ราคาประมาณ + คำเตือน (ห้องทับกัน ชั้นบนยื่นเกิน เกินงบ เกินที่ดิน ฯลฯ)
//  - สั่งแก้เป็นข้อความได้ ("ขยายห้องนั่งเล่น") · เก็บฉบับก่อนหน้า 10 ฉบับไว้ย้อนกลับ
//  - เป็นแบบร่างคุยกับลูกค้าเท่านั้น ไม่ใช่แบบขออนุญาตก่อสร้าง
const MAX_FLOORS = 3
const MAX_ROOMS = 40
const MAX_VERSIONS = 10
const MAX_IMAGES = 3
const SIDES = ['N', 'S', 'E', 'W']
export const ROOM_TYPES = {
  living: 'ห้องนั่งเล่น', dining: 'ห้องทานข้าว', kitchen: 'ครัว', bedroom: 'ห้องนอน', master: 'ห้องนอนใหญ่', bath: 'ห้องน้ำ',
  stair: 'บันได', hall: 'ทางเดิน/โถง', storage: 'ห้องเก็บของ', laundry: 'ซักล้าง', work: 'ห้องทำงาน', pray: 'ห้องพระ',
  porch: 'ระเบียง/ชานหน้าบ้าน', carport: 'ที่จอดรถ', terrace: 'ลาน/เทอเรส', balcony: 'ระเบียงชั้นบน', other: 'อื่นๆ',
}
/** ชนิดพื้นที่นอกตัวบ้าน (ไม่มีผนัง) */
export const OUTDOOR = new Set(['porch', 'carport', 'terrace', 'balcony'])
const ROOFS = ['gable', 'hip', 'flat']

const num = (v, d = 0) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : d }
const r2 = (n) => Math.round(n * 20) / 20 // ปัด 5 ซม.
const clamp = (n, a, b) => Math.min(b, Math.max(a, n))
const hex = (s, d) => (/^#[0-9a-f]{6}$/i.test(String(s || '')) ? String(s) : d)
const txt = (s, n = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

/** ความต้องการที่ผู้ใช้กรอก → ค่าที่ใช้ได้ */
export function normalizeReq(b = {}) {
  return {
    floors: String(b.floors) === '0' ? 0 : clamp(Math.round(num(b.floors, 1)), 1, MAX_FLOORS), // 0 = ลูกค้ายังไม่แน่ใจ ให้ AI เลือก
    bedrooms: clamp(Math.round(num(b.bedrooms, 3)), 0, 12),
    bathrooms: clamp(Math.round(num(b.bathrooms, 2)), 0, 12),
    budget: Math.max(0, Math.round(num(b.budget, 0))),
    price_per_sqm: clamp(Math.round(num(b.price_per_sqm, 20000)), 1000, 200000),
    land_w: clamp(r2(num(b.land_w, 0)), 0, 500),
    land_d: clamp(r2(num(b.land_d, 0)), 0, 500),
    parking: clamp(Math.round(num(b.parking, 0)), 0, 6),
    style: txt(b.style, 120),
    extras: txt(b.extras, 1500),
    notes: txt(b.notes, 1500),
    // ทิศที่หน้าบ้านหันไป (องศา 0 = เหนือ 90 = ตะวันออก 180 = ใต้ 270 = ตะวันตก) · null = ไม่ระบุ
    facing: b.facing === null || b.facing === undefined || b.facing === '' || !Number.isFinite(Number(b.facing)) ? null : ((Math.round(Number(b.facing)) % 360) + 360) % 360,
    // ห้องที่ต้องการแยกตามชั้น [{ floor: 0=ชั้นไหนก็ได้|1|2|3, name, count, pos }]
    program: (Array.isArray(b.program) ? b.program : []).slice(0, 80).map((x) => ({
      floor: clamp(Math.round(num(x?.floor, 0)), 0, MAX_FLOORS), name: txt(x?.name, 50), count: clamp(Math.round(num(x?.count, 1)), 1, 12), pos: txt(x?.pos, 40),
    })).filter((x) => x.name),
  }
}

const DIRS = ['เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้', 'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ']
/** องศา → ชื่อทิศ (8 ทิศ) */
export const dirName = (deg) => DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]

/** ผังห้องจาก AI (หรือจากคน) → ตัวเลขที่ปลอดภัยสำหรับวาด · พิกัดทุกชั้นเลื่อนให้มุมซ้ายบนสุดอยู่ที่ (0,0) ร่วมกัน */
export function normalizeLayout(raw, q) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const facingIn = q && q.facing !== null && q.facing !== undefined ? q.facing : (Number.isFinite(Number(src.facing)) && src.facing !== null && src.facing !== '' ? Number(src.facing) : null)
  const floorsIn = Array.isArray(src.floors) ? src.floors.slice(0, MAX_FLOORS) : []
  const floors = floorsIn.map((f, i) => ({
    level: i + 1,
    height: clamp(r2(num(f?.height, 3)), 2.4, 5),
    rooms: (Array.isArray(f?.rooms) ? f.rooms : []).slice(0, MAX_ROOMS).map((r) => {
      const type = Object.prototype.hasOwnProperty.call(ROOM_TYPES, r?.type) ? r.type : 'other'
      const sides = (v) => [...new Set((Array.isArray(v) ? v : String(v || '').split(/[,\s]+/)).map((s) => String(s).toUpperCase().trim()).filter((s) => SIDES.includes(s)))]
      return {
        name: txt(r?.name, 40) || ROOM_TYPES[type],
        type,
        x: r2(num(r?.x)), y: r2(num(r?.y)),
        w: clamp(r2(num(r?.w, 3)), 0.8, 40), d: clamp(r2(num(r?.d, 3)), 0.8, 40),
        doors: sides(r?.doors), windows: OUTDOOR.has(type) ? [] : sides(r?.windows),
      }
    }),
  })).filter((f) => f.rooms.length)
  const all = floors.flatMap((f) => f.rooms)
  const minX = all.length ? Math.min(...all.map((r) => r.x)) : 0
  const minY = all.length ? Math.min(...all.map((r) => r.y)) : 0
  for (const r of all) { r.x = r2(r.x - minX); r.y = r2(r.y - minY) }
  floors.forEach((f, i) => { f.level = i + 1 })
  return {
    summary: txt(src.summary, 600),
    style: txt(src.style, 120),
    roof: ROOFS.includes(src.roof) ? src.roof : 'gable',
    wall_color: hex(src.wall_color, '#F2EFE8'),
    roof_color: hex(src.roof_color, '#5B4A42'),
    floors,
    notes: (Array.isArray(src.notes) ? src.notes : []).map((s) => txt(s, 200)).filter(Boolean).slice(0, 10),
    ...(facingIn === null ? {} : { facing: ((Math.round(facingIn) % 360) + 360) % 360 }),
  }
}

const area = (r) => r.w * r.d
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y))
const inside = (px, py, r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.d // รวมขอบ (กึ่งกลางห้องบนอยู่บนแนวผนังล่างพอดี = มีที่รองรับ)
const round1 = (n) => Math.round(n * 10) / 10
const fmt = (n) => Math.round(n).toLocaleString('en-US')

/** สรุปพื้นที่/จำนวนห้อง/ราคาประมาณ + คำเตือน (คำนวณใหม่ทุกครั้ง ไม่ได้เก็บ) */
export function analyze(layout, req) {
  const warnings = []
  const floors = layout.floors.map((f) => {
    const indoor = f.rooms.filter((r) => !OUTDOOR.has(r.type)).reduce((s, r) => s + area(r), 0)
    const outdoor = f.rooms.filter((r) => OUTDOOR.has(r.type)).reduce((s, r) => s + area(r), 0)
    const xs = f.rooms.map((r) => [r.x, r.x + r.w]).flat(), ys = f.rooms.map((r) => [r.y, r.y + r.d]).flat()
    return { level: f.level, indoor: round1(indoor), outdoor: round1(outdoor), w: round1(Math.max(...xs) - Math.min(...xs)), d: round1(Math.max(...ys) - Math.min(...ys)), _in: indoor, _out: outdoor }
  })
  const rooms = layout.floors.flatMap((f) => f.rooms)
  const bedrooms = rooms.filter((r) => r.type === 'bedroom' || r.type === 'master').length
  const bathrooms = rooms.filter((r) => r.type === 'bath').length
  // รวมจากค่าจริงแล้วปัดครั้งเดียว (ปัดทีละชั้นแล้วบวก = เพี้ยน)
  const rawIn = floors.reduce((s, f) => s + f._in, 0), rawOut = floors.reduce((s, f) => s + f._out, 0)
  for (const f of floors) { delete f._in; delete f._out }
  const indoor = round1(rawIn), outdoor = round1(rawOut), total = round1(rawIn + rawOut)
  const estimate = Math.round(total * (req?.price_per_sqm || 20000))
  const allX = rooms.flatMap((r) => [r.x, r.x + r.w]), allY = rooms.flatMap((r) => [r.y, r.y + r.d])
  const footprint = rooms.length ? { w: round1(Math.max(...allX)), d: round1(Math.max(...allY)) } : { w: 0, d: 0 }

  for (const f of layout.floors) {
    for (let i = 0; i < f.rooms.length; i++) for (let j = i + 1; j < f.rooms.length; j++) {
      const ov = overlap(f.rooms[i], f.rooms[j])
      if (ov > 0.3) warnings.push(`ชั้น ${f.level}: "${f.rooms[i].name}" ทับกับ "${f.rooms[j].name}" ประมาณ ${round1(ov)} ตร.ม.`)
    }
    for (const r of f.rooms) {
      if (OUTDOOR.has(r.type) || r.type === 'stair' || r.type === 'hall') continue
      if (!r.doors.length) warnings.push(`ชั้น ${f.level}: "${r.name}" ยังไม่มีประตู`)
    }
  }
  if (layout.floors.length > 1) {
    const below = layout.floors[0].rooms
    for (const f of layout.floors.slice(1)) {
      for (const r of f.rooms) {
        if (r.type === 'balcony') continue
        if (!below.some((b) => inside(r.x + r.w / 2, r.y + r.d / 2, b))) warnings.push(`ชั้น ${f.level}: "${r.name}" ยื่นเกินชั้นล่าง (ไม่มีห้องรองรับด้านล่าง)`)
      }
    }
    const stairsOk = layout.floors.every((f) => f.rooms.some((r) => r.type === 'stair'))
    if (!stairsOk) warnings.push('บ้านหลายชั้นแต่บางชั้นไม่มีบันได')
  }
  if (req) {
    if (req.bedrooms && bedrooms !== req.bedrooms) warnings.push(`ห้องนอน ${bedrooms} ห้อง (ลูกค้าต้องการ ${req.bedrooms})`)
    if (req.bathrooms && bathrooms !== req.bathrooms) warnings.push(`ห้องน้ำ ${bathrooms} ห้อง (ลูกค้าต้องการ ${req.bathrooms})`)
    if (req.floors && layout.floors.length !== req.floors) warnings.push(`ได้ ${layout.floors.length} ชั้น (ลูกค้าต้องการ ${req.floors} ชั้น)`)
    if (req.budget && estimate > req.budget * 1.1) warnings.push(`ราคาประมาณ ${fmt(estimate)} บาท เกินงบ ${fmt(req.budget)} บาท`)
    if (req.land_w && footprint.w > req.land_w) warnings.push(`ตัวบ้านกว้าง ${footprint.w} ม. เกินหน้ากว้างที่ดิน ${req.land_w} ม.`)
    if (req.land_d && footprint.d > req.land_d) warnings.push(`ตัวบ้านลึก ${footprint.d} ม. เกินความลึกที่ดิน ${req.land_d} ม.`)
  }
  return { floors, bedrooms, bathrooms, indoor, outdoor, total, estimate, footprint, warnings: warnings.slice(0, 30) }
}

const SCHEMA_TEXT = `รูปแบบ JSON (ตอบเป็น JSON อย่างเดียว ห้ามมีข้อความอื่น):
{"summary":"สรุปแนวคิดแบบ 1-3 ประโยค","style":"สไตล์ เช่น โมเดิร์น","roof":"gable|hip|flat","wall_color":"#RRGGBB","roof_color":"#RRGGBB",
 "floors":[{"height":3.0,"rooms":[{"name":"ห้องนั่งเล่น","type":"living","x":0,"y":0,"w":5,"d":4.5,"doors":["S"],"windows":["S","W"]}]}],
 "notes":["ข้อสังเกตสำหรับพนักงานขาย"]}
กติกาพิกัด:
- หน่วยเมตร ห้องทุกห้องเป็นสี่เหลี่ยมผืนผ้า x = ระยะจากซ้าย (ไปทางขวา = ด้าน E ของผัง) y = ระยะจากบน (ลงล่าง = ด้าน S ของผัง = หน้าบ้าน) w = กว้างตามแกน x, d = ลึกตามแกน y
- ทุกชั้นใช้จุดอ้างอิงเดียวกัน ห้องชั้นบนต้องวางอยู่เหนือห้องชั้นล่าง (ยกเว้น balcony ยื่นได้ไม่เกิน 1.5 ม.) · บันไดอยู่ตำแหน่งเดียวกันทุกชั้น
- ห้องในชั้นเดียวกันห้ามทับกัน และต่อกันแน่นเป็นตัวบ้านกะทัดรัด ไม่มีช่องว่างในตัวบ้าน (ใช้ hall เป็นทางเดิน/โถงเชื่อมห้อง) · ใช้ตัวเลขทีละ 0.5 ม.
- ด้านหน้าบ้าน (ทางเข้า ติดถนน) คือด้าน S (ล่าง)
- doors = ด้านของห้องที่มีประตู (N/S/E/W) ต้องเปิดเข้าห้องข้างเคียงที่เดินถึงได้ (hall/living) ทุกห้องต้องเดินถึงได้ ห้องน้ำในห้องนอนเปิดเข้าห้องนอน · ประตูหน้าบ้านอยู่ด้านที่ติดระเบียง/ภายนอก
- windows = ด้านที่ติดภายนอกเท่านั้น ห้องนอน ห้องนั่งเล่น ครัว ควรมีหน้าต่าง
- type ที่ใช้ได้: ${Object.entries(ROOM_TYPES).map(([k, v]) => `${k}=${v}`).join(', ')}
- porch/carport/terrace/balcony = พื้นที่นอกตัวบ้าน (ไม่มีผนัง) ไม่ต้องใส่ windows
- ขนาดอ้างอิงบ้านไทย: ห้องนอน ≥ 3×3.5 · ห้องนอนใหญ่ ≥ 4×4 · ห้องน้ำ ≥ 1.5×2.2 · บันไดตรง 1.2×4.5 หรือบันไดหักกลับ 2.5×3 · ที่จอดรถคันละ 3×5.5 · ทางเดิน ≥ 1.2 · ความสูงชั้น 3 ม.`

/** หลักคิดของสถาปนิกบ้านเมืองร้อนที่ดี — ใส่ในทุกคำสั่งออกแบบ/แก้แบบ */
const ARCH_TEXT = `หลักออกแบบของสถาปนิกที่ดี (ใช้ทุกข้อ เว้นแต่ขัดกับสิ่งที่ลูกค้าระบุชัด):
1. แบ่งโซนชัด — สาธารณะ (ชาน โถงทางเข้า นั่งเล่น รับแขก ทานข้าว) ด้านหน้า/ติดสวน · ส่วนตัว (ห้องนอน) ด้านหลังหรือชั้นบน เงียบ ไม่ต้องเดินผ่านห้องนั่งเล่นเพื่อเข้าห้องนอน · บริการ (ครัวไทย ซักล้าง เก็บของ ห้องแม่บ้าน) รวมกลุ่มด้านหลัง/ด้านข้าง มีประตูออกนอกบ้านของตัวเอง
2. ลำดับการเข้าบ้าน — ที่จอดรถ → ชาน → โถงทางเข้า → นั่งเล่น · ครัวเดินจากที่จอดรถได้สั้น (ขนของ) · ประตูหน้ากับประตูหลังไม่อยู่แนวตรงกัน
3. แดดและลมแบบไทย — แดดบ่ายทิศตะวันตกร้อนที่สุด: ใช้ห้องน้ำ บันได ห้องเก็บของ ซักล้าง ที่จอดรถ เป็นกันชนด้านตะวันตก ห้องนอนเลี่ยงผนังตะวันตก · ห้องนอนดีสุดทิศเหนือ/ตะวันออก · ลมประจำมาจากทิศใต้และตะวันตกเฉียงใต้: เปิดหน้าต่างรับลมด้านนั้น และมีช่องเปิดฝั่งตรงข้ามให้ลมผ่านทะลุ · ห้องนั่งเล่นเปิดรับทิศเหนือ/ตะวันออก/ใต้ · ชายคายื่นกันแดดฝน
4. ห้องน้ำ — ทุกห้องติดผนังภายนอก (ระบายอากาศ) · ประตูห้องน้ำไม่เปิดเข้าห้องทานข้าว/ครัว/ห้องนั่งเล่นตรง ๆ · ชั้นล่างมีห้องน้ำส่วนกลางที่แขกใช้ได้
5. บ้านหลายชั้น — ห้องน้ำชั้นบนซ้อนตรงห้องน้ำ/ครัวชั้นล่าง (งานท่อ) · ผนังชั้นบนพยายามตรงผนังชั้นล่าง · ห้องพระอยู่ชั้นบนสุดและไม่อยู่ใต้ห้องน้ำ · บันไดอยู่ค่อนกลางบ้าน ไม่หันตรงประตูหน้าบ้าน · หน้าบันไดชั้นบนมีโถง/นั่งเล่นครอบครัวเล็ก ๆ ถ้าพื้นที่พอ
6. โครงสร้างประหยัด — ผังตามกริดเสา ช่วงเสา 3.5–5 ม. รูปทรงตัวบ้านเรียบ (สี่เหลี่ยม ตัว L ตัว U) ไม่หยักเกินจำเป็น · ทางเดินรวมไม่เกินราว 12–15% ของพื้นที่
7. สัดส่วนห้องน่าใช้ — ด้านยาวไม่เกิน 1.5 เท่าด้านสั้น (ยกเว้นทางเดิน ระเบียง ที่จอดรถ) · ห้องนอนใหญ่ ≥ 4×4.5 พร้อมห้องน้ำในตัว · ห้องนั่งเล่น ≥ 4.5×5 · ห้องนอนทุกห้องมีหน้าต่างอย่างน้อย 1 ด้าน
8. ฮวงจุ้ยพื้นฐานแบบไทย — ประตูหน้าบ้านเปิดเข้าโถงที่โล่งสว่าง ไม่ชนผนัง/บันได · ห้องน้ำไม่อยู่กลางบ้าน · ครัวไม่อยู่ตรงประตูหน้า
9. รูปตัวอย่างของลูกค้า (ถ้ามี) — ยึดรูปเป็นหลักเรื่องหน้าตาบ้าน จำนวนชั้น ทรงหลังคา สัดส่วนอาคาร และสี แล้วจัดภายในตามข้อ 1–8
ก่อนตอบ ตรวจซ้ำ: มีห้องครบตามรายการทุกชั้นและอยู่ตำแหน่งที่ขอ · ห้องไม่ทับกัน · ทุกห้องมีประตูเดินถึง · ห้องชั้นบนมีห้องรองรับข้างล่าง · บันไดตรงกันทุกชั้น · พื้นที่ใกล้เคียงงบ`

function orientText(q) {
  if (q.facing === null || q.facing === undefined) return '- ทิศหน้าบ้าน: ไม่ระบุ (ถือว่าหน้าบ้านหันทิศใต้ ด้าน S ของผัง = ทิศใต้จริง)'
  const a = q.facing
  return `- หน้าบ้านหันไปทิศ${dirName(a)} (${a}°) — ในผัง ด้าน S (ล่าง) = หน้าบ้าน = ทิศ${dirName(a)} จริง · ด้าน N (บน) = ทิศ${dirName(a + 180)} · ด้าน E (ขวา) = ทิศ${dirName(a - 90)} · ด้าน W (ซ้าย) = ทิศ${dirName(a + 90)} — ใช้ทิศจริงนี้ตัดสินเรื่องแดด ลม และตำแหน่งที่ลูกค้าระบุเป็นทิศ (ตัวอักษร N/S/E/W ใน JSON ยังหมายถึงด้านของผัง)`
}
function programText(q) {
  if (!q.program || !q.program.length) return ''
  const by = new Map()
  for (const x of q.program) { if (!by.has(x.floor)) by.set(x.floor, []); by.get(x.floor).push(`${x.name} ${x.count}${x.pos ? ` (${x.pos})` : ''}`) }
  const rows = [...by.keys()].sort((a, b) => (a || 9) - (b || 9)).map((k) => `  ${k ? 'ชั้น ' + k : 'ชั้นไหนก็ได้'}: ${by.get(k).join(' · ')}`)
  return `- รายการห้องที่ลูกค้ากำหนด (ต้องมีครบตามจำนวน อยู่ในชั้นที่ระบุ และวางตามตำแหน่งที่ขอ · ตำแหน่งมองจากถนนเข้าหาบ้าน: ด้านหน้า = ใกล้ด้าน S · ด้านหลัง = ใกล้ด้าน N · ด้านซ้าย = ใกล้ด้าน W · ด้านขวา = ใกล้ด้าน E · ห้องน้ำในตัว/ทางเดิน/บันไดเพิ่มได้ตามจำเป็น):\n${rows.join('\n')}`
}

function reqText(q) {
  const target = q.budget && q.price_per_sqm ? Math.round(q.budget / q.price_per_sqm) : 0
  return [
    q.floors ? `- จำนวนชั้น: ${q.floors} ชั้น` : `- จำนวนชั้น: ไม่ระบุ (เลือก 1–${MAX_FLOORS} ชั้นให้เหมาะกับงบ ที่ดิน และรูปตัวอย่างถ้ามี)`,
    `- ห้องนอน: ${q.bedrooms} ห้อง · ห้องน้ำ: ${q.bathrooms} ห้อง (นับรวมห้องน้ำในห้องนอน)`,
    q.budget ? `- งบประมาณ: ${fmt(q.budget)} บาท ที่ราคาประมาณ ${fmt(q.price_per_sqm)} บาท/ตร.ม. → พื้นที่รวมทั้งหมด (รวมระเบียง/ที่จอดรถ) ไม่ควรเกิน ${target} ตร.ม.` : '- งบประมาณ: ไม่ระบุ (ออกแบบขนาดพอดีกับความต้องการ)',
    q.land_w && q.land_d ? `- ที่ดินหน้ากว้าง ${q.land_w} ม. ลึก ${q.land_d} ม. → ตัวบ้านรวมที่จอดรถต้องเว้นจากแนวเขตที่ดินอย่างน้อย 2 ม. ทุกด้าน (กว้างไม่เกิน ${Math.max(0, q.land_w - 4)} ม. ลึกไม่เกิน ${Math.max(0, q.land_d - 4)} ม.)` : '- ที่ดิน: ไม่ระบุ',
    q.parking ? `- ที่จอดรถ: ${q.parking} คัน` : '',
    q.style ? `- สไตล์ที่ชอบ: ${q.style}` : '',
    orientText(q),
    programText(q),
    q.extras ? `- ความต้องการ/ห้องพิเศษเพิ่มเติม: ${q.extras}` : '',
    q.notes ? `- ความต้องการอื่น: ${q.notes}` : '',
  ].filter(Boolean).join('\n')
}

export function buildPrompt(q, hasImages) {
  return `คุณเป็นสถาปนิกของบริษัทรับสร้างบ้านในไทย ออกแบบ "ผังห้องเบื้องต้น" ตามความต้องการลูกค้าด้านล่าง ให้ใช้งานได้จริง สัดส่วนห้องเหมาะสม ทางเดินสั้น ห้องนอนเป็นส่วนตัว ครัวอยู่ด้านหลังหรือด้านข้าง ระบายอากาศดี
ความต้องการ:
${reqText(q)}

${ARCH_TEXT}
${hasImages ? '\nรูปที่แนบคือรูปตัวอย่างที่ลูกค้าชอบ — ถ้าเป็นภาพบ้าน ให้ใช้เป็นแนวทางสไตล์ จำนวนชั้น รูปทรงหลังคา และสีภายนอก (บอกใน style/roof/wall_color/roof_color ให้สีใกล้เคียงรูป) · ถ้าเป็นแปลนหรือผังห้อง ให้ใช้แนวการจัดห้องนั้นเป็นฐานแล้วปรับให้ตรงความต้องการ · ถ้าเป็นภาพภายใน ให้ใช้บรรยากาศและการเปิดโล่งเป็นแนวทาง · อธิบายใน summary ว่าเอาอะไรจากรูปมาใช้ ไม่ต้องลอกแบบทั้งหมด\n' : ''}
${SCHEMA_TEXT}`
}

export function buildRevisePrompt(q, layout, instruction) {
  return `คุณเป็นสถาปนิกของบริษัทรับสร้างบ้านในไทย นี่คือผังห้องเบื้องต้นของลูกค้า ให้แก้ตามคำสั่ง แล้วคืนผังทั้งหลัง (ทุกชั้น ทุกห้อง) ในรูปแบบเดิม ส่วนที่ไม่ได้สั่งให้คงไว้ให้มากที่สุด
ความต้องการเดิมของลูกค้า:
${reqText(q)}

${ARCH_TEXT}
ผังปัจจุบัน:
${JSON.stringify(layout)}
คำสั่งแก้: ${instruction}
${SCHEMA_TEXT}`
}

/** รูปตัวอย่างที่ลูกค้าแนบจากเว็บ (ไม่ต้องล็อกอิน) — รับแค่ jpg/png/webp ไม่เกิน 3 รูป รูปละไม่เกิน ~1.5MB · ส่งให้ AI ดูอย่างเดียว ไม่เก็บไฟล์ */
export function parsePublicImages(list, max = 3) {
  const out = []
  for (const s of (Array.isArray(list) ? list : []).slice(0, max)) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(s || ''))
    if (m && m[2].length < 2_000_000) out.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } })
  }
  return out
}

/** ปัญหาร้ายแรงในผังที่ควรให้ AI แก้อีกรอบ (ห้องทับ ห้องลอย ไม่มีประตู บันได จำนวนห้อง/ชั้นไม่ตรง) */
export function seriousIssues(a) {
  return (a?.warnings || []).filter((w) => /ทับกับ|ยื่นเกินชั้นล่าง|ยังไม่มีประตู|ไม่มีบันได|ห้องนอน \d+ ห้อง \(|ห้องน้ำ \d+ ห้อง \(|ชั้น \(ลูกค้า/.test(w)).slice(0, 15)
}
/** คำสั่งให้ AI แก้ปัญหาที่ตรวจพบในผังรอบแรก */
export function buildRepairPrompt(q, layout, issues) {
  return buildRevisePrompt(q, layout, 'ผังนี้มีปัญหาที่ต้องแก้ให้หมด โดยคงแนวคิด หน้าตาบ้าน และตำแหน่งห้องเดิมไว้ให้มากที่สุด: ' + issues.join(' · '))
}

function parseImages(list) {
  const out = []
  for (const s of (Array.isArray(list) ? list : []).slice(0, MAX_IMAGES)) {
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(s || ''))
    if (m && m[2].length < 7_000_000) out.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } })
  }
  return out
}

export function createHouseConcept(d) {
  const { db } = d
  const parse = (s, def) => { try { return JSON.parse(s || '') ?? def } catch { return def } }
  const canManage = (u) => !!u && (u.role === 'admin' || d.isManager(u))
  const row = (r, full = false) => {
    if (!r) return null
    const req = parse(r.req, {}), layout = parse(r.layout, null)
    const stats = layout ? analyze(layout, req) : null
    const out = { id: r.id, at: r.at, by: r.by, by_id: r.by_id, title: r.title, customer: r.customer, status: r.status, error: r.error, model: r.model, cost_usd: r.cost_usd, updated: r.updated, updated_by: r.updated_by, req,
      stats: stats && { total: stats.total, estimate: stats.estimate, bedrooms: stats.bedrooms, bathrooms: stats.bathrooms, floors: layout.floors.length, warnings: stats.warnings.length } }
    if (full) Object.assign(out, { layout, analysis: stats, versions: parse(r.versions, []).map((v, i) => ({ i, at: v.at, by: v.by, note: v.note })) })
    return out
  }
  const get = (id) => db.prepare('SELECT * FROM house_concepts WHERE id=?').get(Number(id))

  // เรียก AI (หรือค่าจำลองตอนเทสต์) → ผังห้องที่ตรวจแล้ว
  async function askLayout({ prompt, media, by, q }) {
    if (process.env.PPSD_AI_MOCK_HOUSECONCEPT) {
      const layout = normalizeLayout(JSON.parse(process.env.PPSD_AI_MOCK_HOUSECONCEPT), q)
      return { ok: true, layout, model: 'mock', cost_usd: 0 }
    }
    if (!d.aiKey()) return { ok: false, error: d.AI_NO_KEY }
    const ai = await d.aiAsk({ feature: 'ออกแบบบ้านเบื้องต้น', by, media, prompt, maxTokens: 32000, timeoutMs: 300000, effort: 'medium' })
    if (!ai.ok) return { ok: false, error: ai.error }
    const raw = d.extractJsonBlock(ai.text)
    const layout = normalizeLayout(raw, q)
    if (!layout.floors.length) return { ok: false, error: 'AI ตอบผังห้องไม่ครบ — ลองกดออกแบบใหม่อีกครั้ง', model: ai.model, cost_usd: ai.cost_usd }
    return { ok: true, layout, model: ai.model, cost_usd: ai.cost_usd }
  }
  const addCost = (a, b) => Math.round(((a || 0) + (b || 0)) * 10000) / 10000
  // ออกแบบ → ถ้าผังมีปัญหาร้ายแรง ให้ AI แก้อีก 1 รอบ (ใช้ผลรอบใหม่ถ้าปัญหาน้อยลง)
  async function designWithRepair({ prompt, media, by, q }) {
    const r = await askLayout({ prompt, media, by, q })
    if (!r.ok || process.env.PPSD_AI_MOCK_HOUSECONCEPT) return r
    const issues = seriousIssues(analyze(r.layout, q))
    if (!issues.length) return r
    const x = await askLayout({ prompt: buildRepairPrompt(q, r.layout, issues), by, q }).catch(() => null)
    const cost = addCost(r.cost_usd, x?.cost_usd)
    if (x?.ok && seriousIssues(analyze(x.layout, q)).length < issues.length) return { ...x, cost_usd: cost }
    return { ...r, cost_usd: cost }
  }

  function register(api, { canWrite }) {
    api.get('/house-concepts', (_req, res) => {
      res.json(db.prepare('SELECT * FROM house_concepts ORDER BY id DESC LIMIT 300').all().map((r) => row(r)))
    })
    api.get('/house-concepts/:id', (req, res) => {
      const r = get(req.params.id)
      if (!r) return res.status(404).json({ error: 'ไม่พบแบบนี้' })
      res.json(row(r, true))
    })
    // ออกแบบใหม่ — ทำเบื้องหลัง หน้าเว็บถามผลซ้ำจนสถานะไม่ใช่ "กำลังออกแบบ"
    api.post('/house-concepts', canWrite, (req, res) => {
      if (!process.env.PPSD_AI_MOCK_HOUSECONCEPT && !d.aiKey()) return res.status(400).json({ error: d.AI_NO_KEY })
      const q = normalizeReq(req.body || {})
      if (!q.bedrooms && !q.bathrooms) return res.status(400).json({ error: 'ระบุจำนวนห้องนอนหรือห้องน้ำอย่างน้อย 1 อย่าง' })
      const media = parseImages(req.body?.images)
      // ไอเดียจาก "ห้องรวมไอเดีย" — บอก AI เป็นข้อความ และดึงรูปจากต้นทางตอนออกแบบ (รวมกับรูปแนบไม่เกิน 3 รูป)
      const ideaIds = Array.isArray(req.body?.idea_ids) ? req.body.idea_ids.slice(0, 6) : []
      const ideaNote = ideaIds.length && d.ideas ? d.ideas.ideaText(ideaIds) : ''
      if (ideaNote) { q.notes = txt([q.notes, ideaNote].filter(Boolean).join(' · '), 1500); q.idea_ids = ideaIds.map(Number) }
      const title = txt(req.body?.title, 120) || `บ้าน ${q.floors || '?'} ชั้น ${q.bedrooms} ห้องนอน ${q.bathrooms} ห้องน้ำ`
      const now = d.nowTS()
      const info = db.prepare('INSERT INTO house_concepts (at,by,by_id,title,customer,req,layout,versions,status,updated,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(now, req.user?.name || '', req.user?.id || null, title, txt(req.body?.customer, 120), JSON.stringify(q), null, '[]', 'กำลังออกแบบ', now, req.user?.name || '')
      const id = info.lastInsertRowid
      d.audit(req, 'ออกแบบบ้านเบื้องต้น (AI)', `#${id} ${title}`)
      res.json(row(get(id)))
      const withIdeas = ideaNote && media.length < MAX_IMAGES && !process.env.PPSD_AI_MOCK_HOUSECONCEPT ? d.ideas.ideaMedia(ideaIds, { max: MAX_IMAGES - media.length }).catch(() => []) : Promise.resolve([])
      withIdeas.then((more) => { const all = [...media, ...more]; return designWithRepair({ prompt: buildPrompt(q, all.length > 0), media: all, by: req.user?.name, q }) }).then((r) => {
        if (r.ok) db.prepare("UPDATE house_concepts SET layout=?, status='เสร็จ', error=NULL, model=?, cost_usd=?, updated=? WHERE id=?").run(JSON.stringify(r.layout), r.model, addCost(0, r.cost_usd), d.nowTS(), id)
        else db.prepare("UPDATE house_concepts SET status='ผิดพลาด', error=?, model=?, cost_usd=? WHERE id=?").run(r.error, r.model || null, addCost(0, r.cost_usd), id)
      }).catch((e) => db.prepare("UPDATE house_concepts SET status='ผิดพลาด', error=? WHERE id=?").run('ออกแบบไม่สำเร็จ: ' + e.message, id))
    })
    // สั่งแก้ด้วยข้อความ — เก็บผังเดิมเป็นฉบับก่อนหน้า · ถ้าแก้ไม่สำเร็จ ผังเดิมยังอยู่ (แจ้งใน error)
    api.post('/house-concepts/:id/revise', canWrite, (req, res) => {
      const r = get(req.params.id)
      if (!r) return res.status(404).json({ error: 'ไม่พบแบบนี้' })
      const instruction = txt(req.body?.instruction, 600)
      if (!instruction) return res.status(400).json({ error: 'พิมพ์สิ่งที่ต้องการแก้ก่อน' })
      if (r.status === 'กำลังออกแบบ' || r.status === 'กำลังแก้') return res.status(409).json({ error: 'แบบนี้กำลังประมวลผลอยู่ รอสักครู่' })
      const layout = parse(r.layout, null)
      if (!layout) return res.status(400).json({ error: 'แบบนี้ยังไม่มีผังห้อง — กดออกแบบใหม่' })
      if (!process.env.PPSD_AI_MOCK_HOUSECONCEPT && !d.aiKey()) return res.status(400).json({ error: d.AI_NO_KEY })
      db.prepare("UPDATE house_concepts SET status='กำลังแก้', error=NULL WHERE id=?").run(r.id)
      d.audit(req, 'สั่งแก้แบบบ้านเบื้องต้น (AI)', `#${r.id} ${instruction}`)
      res.json(row(get(r.id)))
      const q = parse(r.req, {})
      askLayout({ prompt: buildRevisePrompt(q, layout, instruction), by: req.user?.name, q }).then((x) => {
        const cur = get(r.id)
        if (x.ok) {
          const versions = [{ at: cur.updated, by: cur.updated_by, note: 'ก่อนแก้: ' + instruction, layout }, ...parse(cur.versions, [])].slice(0, MAX_VERSIONS)
          db.prepare("UPDATE house_concepts SET layout=?, versions=?, status='เสร็จ', error=NULL, model=?, cost_usd=?, updated=?, updated_by=? WHERE id=?")
            .run(JSON.stringify(x.layout), JSON.stringify(versions), x.model, addCost(cur.cost_usd, x.cost_usd), d.nowTS(), req.user?.name || '', r.id)
        } else db.prepare("UPDATE house_concepts SET status='เสร็จ', error=?, cost_usd=? WHERE id=?").run('แก้ไม่สำเร็จ: ' + x.error, addCost(cur.cost_usd, x.cost_usd), r.id)
      }).catch((e) => db.prepare("UPDATE house_concepts SET status='เสร็จ', error=? WHERE id=?").run('แก้ไม่สำเร็จ: ' + e.message, r.id))
    })
    // ย้อนกลับไปฉบับก่อนหน้า (ฉบับปัจจุบันถูกเก็บเป็นฉบับก่อนหน้าแทน — ย้อนกลับซ้ำได้)
    api.post('/house-concepts/:id/restore', canWrite, (req, res) => {
      const r = get(req.params.id)
      if (!r) return res.status(404).json({ error: 'ไม่พบแบบนี้' })
      const versions = parse(r.versions, [])
      const i = Number(req.body?.index)
      const v = versions[i]
      if (!v) return res.status(400).json({ error: 'ไม่พบฉบับที่เลือก' })
      const rest = versions.filter((_x, k) => k !== i)
      const cur = parse(r.layout, null)
      const next = cur ? [{ at: r.updated, by: r.updated_by, note: 'ก่อนย้อนกลับ', layout: cur }, ...rest].slice(0, MAX_VERSIONS) : rest
      db.prepare("UPDATE house_concepts SET layout=?, versions=?, status='เสร็จ', error=NULL, updated=?, updated_by=? WHERE id=?").run(JSON.stringify(v.layout), JSON.stringify(next), d.nowTS(), req.user?.name || '', r.id)
      d.audit(req, 'ย้อนแบบบ้านเบื้องต้น', `#${r.id} → ฉบับ ${v.at}`)
      res.json(row(get(r.id), true))
    })
    // แก้ชื่อแบบ/ชื่อลูกค้า
    api.put('/house-concepts/:id', canWrite, (req, res) => {
      const r = get(req.params.id)
      if (!r) return res.status(404).json({ error: 'ไม่พบแบบนี้' })
      const title = req.body?.title !== undefined ? txt(req.body.title, 120) || r.title : r.title
      const customer = req.body?.customer !== undefined ? txt(req.body.customer, 120) : r.customer
      db.prepare('UPDATE house_concepts SET title=?, customer=? WHERE id=?').run(title, customer, r.id)
      res.json(row(get(r.id), true))
    })
    // ลบ — เจ้าของแบบ หรือแอดมิน/ผู้จัดการ (ข้อมูลที่ลบยังดูย้อนได้ในประวัติการเปลี่ยนแปลง)
    api.delete('/house-concepts/:id', canWrite, (req, res) => {
      const r = get(req.params.id)
      if (!r) return res.status(404).json({ error: 'ไม่พบแบบนี้' })
      if (r.by_id !== req.user?.id && !canManage(req.user)) return res.status(403).json({ error: 'ลบได้เฉพาะคนที่สร้างแบบ หรือผู้จัดการ/แอดมิน' })
      db.prepare('DELETE FROM house_concepts WHERE id=?').run(r.id)
      d.audit(req, 'ลบแบบบ้านเบื้องต้น', `#${r.id} ${r.title}`)
      res.json({ ok: true })
    })
  }
  return { register }
}
