// โมดูลถอดแบบ (BOQ takeoff) — อ่านไฟล์แบบ แล้วสรุปเป็นปริมาณงานให้ทำ BOQ ร่าง
//  - DXF: อ่านเองทั้งหมด (ไม่ใช้ไลบรารีนอก) → นับ Block · รวมความยาวเส้นตาม Layer · พื้นที่ Hatch/รูปปิดตาม Layer · ตัวหนังสือ
//  - PDF/รูป: ให้ AI อ่าน (เรียกจาก index.js)
//  - จับคู่รายการที่ถอดได้กับราคากลางวัสดุ/ค่าแรง (เทียบชื่อแบบหยาบ — ให้คนเลือกแก้ในหน้าจอ)

// ---------- DXF ----------
const UNIT_TO_M = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1 } // $INSUNITS → เมตร
const UNIT_NAME = { 1: 'นิ้ว', 2: 'ฟุต', 4: 'มม.', 5: 'ซม.', 6: 'ม.' }
const OVERRIDE = { mm: 4, cm: 5, m: 6 }

// แตกไฟล์ DXF (ข้อความ) เป็นคู่ [code, value]
function pairsOf(text) {
  const lines = text.split(/\r?\n/)
  const out = []
  for (let i = 0; i + 1 < lines.length; i += 2) out.push([parseInt(lines[i].trim(), 10), lines[i + 1].replace(/\s+$/, '')])
  return out
}

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1])
// ความยาวช่วงที่มี bulge (ส่วนโค้งใน polyline) — bulge = tan(มุม/4)
function segLen(a, b, bulge) {
  const c = dist(a, b)
  if (!bulge) return c
  const th = 4 * Math.atan(Math.abs(bulge))
  return th ? c * th / (2 * Math.sin(th / 2)) : c
}
function polyLen(pts, bulges, closed) {
  let s = 0
  for (let i = 0; i + 1 < pts.length; i++) s += segLen(pts[i], pts[i + 1], bulges[i] || 0)
  if (closed && pts.length > 2) s += segLen(pts[pts.length - 1], pts[0], bulges[pts.length - 1] || 0)
  return s
}
function polyArea(pts) {
  let s = 0
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1] }
  return Math.abs(s) / 2
}
// ล้างโค้ดจัดรูปแบบของ MTEXT เช่น \P \fArial|b0; {\H2.5;ข้อความ}
const cleanMText = (s) => String(s || '')
  .replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;\\{}]*;/g, '').replace(/[{}]/g, '').replace(/\\~/g, ' ')
  .replace(/%%[cC]/g, 'ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/\s+/g, ' ').trim()

// แยก entity ในส่วน ENTITIES — คืน [{type, codes:[[c,v]...]}]
function entitiesOf(pairs) {
  const out = []
  let section = '', cur = null
  for (let i = 0; i < pairs.length; i++) {
    const [c, v] = pairs[i]
    if (c === 0 && v === 'SECTION') { section = pairs[i + 1]?.[1] || ''; cur = null; continue }
    if (c === 0 && v === 'ENDSEC') { section = ''; cur = null; continue }
    if (section !== 'ENTITIES') continue
    if (c === 0) { cur = { type: v, codes: [] }; out.push(cur); continue }
    if (cur) cur.codes.push([c, v])
  }
  return out
}
function headerUnits(pairs) {
  for (let i = 0; i < pairs.length - 2; i++) {
    if (pairs[i][0] === 9 && pairs[i][1] === '$INSUNITS') return parseInt(pairs[i + 1][1], 10) || 0
    if (pairs[i][0] === 0 && pairs[i][1] === 'ENDSEC') break
  }
  return 0
}
const num = (v) => Number(v) || 0
const layerOf = (codes) => (codes.find(([c]) => c === 8)?.[1] || '0').trim()

// พื้นที่ของ HATCH จากเส้นขอบ (ขอบแบบ polyline และแบบเส้นตรง · ขอบโค้ด/spline คิดเป็นเส้นตรงโดยประมาณ)
function hatchArea(codes) {
  let i = codes.findIndex(([c]) => c === 91)
  if (i < 0) return 0
  const nPaths = parseInt(codes[i][1], 10) || 0
  i++
  let total = 0
  for (let p = 0; p < nPaths && i < codes.length; p++) {
    while (i < codes.length && codes[i][0] !== 92) i++
    if (i >= codes.length) break
    const flag = parseInt(codes[i][1], 10) || 0
    i++
    const pts = []
    if (flag & 2) { // ขอบเป็น polyline: 72 has_bulge · 73 closed · 93 จำนวนจุด · 10/20 (42)
      while (i < codes.length && codes[i][0] !== 93) i++
      const n = parseInt(codes[i]?.[1], 10) || 0
      i++
      while (i < codes.length && pts.length < n) {
        if (codes[i][0] === 10) { pts.push([num(codes[i][1]), num(codes[i + 1]?.[1])]); i += 2; continue }
        i++
      }
    } else { // ขอบเป็นชุดเส้น: 93 จำนวนเส้น · แต่ละเส้น 72 ชนิด (1=เส้นตรง 2=โค้ง 3=วงรี 4=spline)
      while (i < codes.length && codes[i][0] !== 93) i++
      const n = parseInt(codes[i]?.[1], 10) || 0
      i++
      for (let e = 0; e < n && i < codes.length; e++) {
        while (i < codes.length && codes[i][0] !== 72) i++
        const t = parseInt(codes[i]?.[1], 10)
        i++
        if (t === 1 || t === 2 || t === 3) {
          // จุดแรกของขอบ (10/20) — โค้ง/วงรีใช้จุดศูนย์กลางแทน (ประมาณ)
          while (i < codes.length && codes[i][0] !== 10) i++
          if (i < codes.length) pts.push([num(codes[i][1]), num(codes[i + 1]?.[1])])
          i += 2
        }
      }
    }
    while (i < codes.length && codes[i][0] !== 97) i++ // ข้ามรายการ object ที่ผูกไว้
    const a = pts.length > 2 ? polyArea(pts) : 0
    total += (flag & 1) || (flag & 16) || p === 0 ? a : -a // ขอบนอก = บวก · รูข้างใน = ลบ
  }
  return Math.max(0, total)
}

/**
 * สรุปไฟล์ DXF เป็นปริมาณงานดิบ
 * @param {string} text เนื้อไฟล์ DXF
 * @param {'auto'|'mm'|'cm'|'m'} unitOverride หน่วยวาดในแบบ (auto = ใช้ค่าในไฟล์ · ไม่มีให้ถือว่า มม.)
 */
export function summarizeDxf(text, unitOverride = 'auto') {
  if (!/\bSECTION\b/.test(text.slice(0, 5000)) || !/\bENTITIES\b/.test(text)) throw new Error('ไม่ใช่ไฟล์ DXF แบบข้อความ — ลอง Save As เป็น DXF (ASCII) ใหม่')
  const pairs = pairsOf(text)
  const fileUnit = headerUnits(pairs)
  const unit = OVERRIDE[unitOverride] || (UNIT_TO_M[fileUnit] ? fileUnit : 4)
  const k = UNIT_TO_M[unit]
  const ents = entitiesOf(pairs)

  const blocks = new Map(), lengths = new Map(), areas = new Map(), circles = new Map(), texts = new Map()
  const addLen = (layer, len) => { const o = lengths.get(layer) || { layer, length_m: 0, segments: 0 }; o.length_m += len * k; o.segments++; lengths.set(layer, o) }
  const addArea = (layer, a, source) => { const key = layer + '|' + source; const o = areas.get(key) || { layer, area_m2: 0, count: 0, source }; o.area_m2 += a * k * k; o.count++; areas.set(key, o) }

  for (let ei = 0; ei < ents.length; ei++) {
    const { type, codes } = ents[ei]
    const layer = layerOf(codes)
    const g = (c) => codes.find(([x]) => x === c)?.[1]
    if (type === 'INSERT') {
      const name = String(g(2) || '').trim()
      const key = name + '|' + layer
      const o = blocks.get(key) || { name: name.startsWith('*') ? '(บล็อกไม่มีชื่อ)' : name, layer, count: 0 }
      o.count++; blocks.set(key, o)
    } else if (type === 'LINE') {
      addLen(layer, dist([num(g(10)), num(g(20))], [num(g(11)), num(g(21))]))
    } else if (type === 'LWPOLYLINE') {
      const pts = [], bul = []
      for (const [c, v] of codes) {
        if (c === 10) { pts.push([num(v), 0]); bul.push(0) } else if (c === 20 && pts.length) pts[pts.length - 1][1] = num(v)
        else if (c === 42 && pts.length) bul[pts.length - 1] = num(v)
      }
      const closed = (parseInt(g(70), 10) || 0) & 1
      addLen(layer, polyLen(pts, bul, closed))
      if (closed && pts.length > 2) addArea(layer, polyArea(pts), 'รูปปิด')
    } else if (type === 'POLYLINE') {
      const closed = (parseInt(g(70), 10) || 0) & 1
      const pts = [], bul = []
      while (ents[ei + 1] && ents[ei + 1].type === 'VERTEX') {
        ei++
        const vc = ents[ei].codes
        pts.push([num(vc.find(([c]) => c === 10)?.[1]), num(vc.find(([c]) => c === 20)?.[1])])
        bul.push(num(vc.find(([c]) => c === 42)?.[1]))
      }
      addLen(layer, polyLen(pts, bul, closed))
      if (closed && pts.length > 2) addArea(layer, polyArea(pts), 'รูปปิด')
    } else if (type === 'ARC') {
      const r = num(g(40)); let a = num(g(51)) - num(g(50)); if (a < 0) a += 360
      addLen(layer, r * a * Math.PI / 180)
    } else if (type === 'CIRCLE') {
      const r = num(g(40)) * k
      const key = layer + '|' + r.toFixed(3)
      const o = circles.get(key) || { layer, diameter_m: Math.round(r * 2000) / 1000, count: 0 }
      o.count++; circles.set(key, o)
    } else if (type === 'HATCH') {
      addArea(layer, hatchArea(codes), 'Hatch')
    } else if (type === 'TEXT' || type === 'MTEXT' || type === 'ATTRIB') {
      const t = cleanMText(codes.filter(([c]) => c === 3 || c === 1).map(([, v]) => v).join(''))
      if (t) { const key = t + '|' + layer; const o = texts.get(key) || { text: t, layer, count: 0 }; o.count++; texts.set(key, o) }
    }
  }
  const r2 = (x) => Math.round(x * 100) / 100
  return {
    units: UNIT_NAME[unit], unit_from_file: !!UNIT_TO_M[fileUnit] && !OVERRIDE[unitOverride],
    entity_count: ents.length,
    blocks: [...blocks.values()].sort((a, b) => b.count - a.count),
    lengths: [...lengths.values()].map((o) => ({ ...o, length_m: r2(o.length_m) })).filter((o) => o.length_m > 0).sort((a, b) => b.length_m - a.length_m),
    areas: [...areas.values()].map((o) => ({ ...o, area_m2: r2(o.area_m2) })).filter((o) => o.area_m2 > 0).sort((a, b) => b.area_m2 - a.area_m2),
    circles: [...circles.values()].sort((a, b) => b.count - a.count),
    texts: [...texts.values()].sort((a, b) => b.count - a.count).slice(0, 400),
    layers: [...new Set(ents.map((e) => layerOf(e.codes)))].sort(),
  }
}

// ผลถอดแบบไม่มี AI: แปลงสรุป DXF เป็นรายการดิบให้คนตั้งชื่อเอง
export function rawItemsFromDxf(s) {
  const items = []
  for (const b of s.blocks) items.push({ cat: catGuess(b.name + ' ' + b.layer), desc: b.name, qty: b.count, unit: 'ชิ้น', basis: `นับ Block "${b.name}" ใน Layer ${b.layer}`, confidence: 'สูง' })
  for (const c of s.circles) items.push({ cat: catGuess(c.layer), desc: `วงกลม ø${c.diameter_m} ม. ใน Layer ${c.layer}`, qty: c.count, unit: 'ชิ้น', basis: `นับวงกลม ${c.count} วง`, confidence: 'กลาง' })
  for (const l of s.lengths) items.push({ cat: catGuess(l.layer), desc: `เส้นใน Layer ${l.layer}`, qty: l.length_m, unit: 'ม.', basis: `รวมความยาว ${l.segments} เส้น`, confidence: 'กลาง' })
  for (const a of s.areas) items.push({ cat: catGuess(a.layer), desc: `พื้นที่ใน Layer ${a.layer}`, qty: a.area_m2, unit: 'ตร.ม.', basis: `${a.source} ${a.count} รูป`, confidence: 'กลาง' })
  return items
}

// ---------- หมวด BOQ (ต้องตรงกับ BOQ_CATS ใน src/components/cost/BoqTab.tsx) ----------
export const BOQ_CATS = ['โครงสร้าง', 'สถาปัตยกรรม', 'ระบบไฟฟ้า', 'ระบบประปา-สุขาภิบาล', 'อื่นๆ']
export function catGuess(s) {
  const t = String(s || '').toLowerCase()
  if (/(^|[^a-z])(s-|str|col|beam|fdn|foot|slab)|โครงสร้าง|เสา|คาน|ฐานราก|ตอม่อ|เหล็ก|คอนกรีต|พื้น\s*slab/.test(t)) return 'โครงสร้าง'
  if (/(^|[^a-z])(e-|elec|light|lamp|sw|plug|outlet)|ไฟ|ปลั๊ก|สวิตช์|สายไฟ|โคม|เบรก/.test(t)) return 'ระบบไฟฟ้า'
  if (/(^|[^a-z])(p-|plumb|pipe|cw|hw|wc|lav|sink|drain|sanit)|ท่อ|ประปา|สุขภัณฑ์|ชักโครก|อ่าง|บ่อ|ถังบำบัด|มาตร/.test(t)) return 'ระบบประปา-สุขาภิบาล'
  if (/(^|[^a-z])(a-|wall|door|win|ceil|floor|roof|tile)|ผนัง|ประตู|หน้าต่าง|ฝ้า|พื้น|หลังคา|กระเบื้อง|สี/.test(t)) return 'สถาปัตยกรรม'
  return 'อื่นๆ'
}

// ---------- จับคู่ชื่อกับราคากลาง ----------
export const normName = (n) => String(n || '')
  .replace(/,\s*\d+(\.\d+)?\s*,\s*[^,"]*"?$/, '')
  .toLowerCase()
  .replace(/ตรา/g, '').replace(/อินทรีย์|อินทรีย/g, 'อินทรี').replace(/พีวีซี/g, 'pvc')
  .replace(/[*×]/g, 'x').replace(/มม\.?/g, 'มม').replace(/ซม\.?/g, 'ซม').replace(/นิ้ว/g, '"')
  .replace(/[\s"“”'().,\-]/g, '')
const bigrams = (s) => { const out = new Map(); for (let i = 0; i < s.length - 1; i++) { const b = s.slice(i, i + 2); out.set(b, (out.get(b) || 0) + 1) } return out }
const numsOf = (s) => new Set((String(s).match(/\d+(?:\.\d+)?(?:\/\d+)?/g) || []))
function dice(a, b) {
  if (!a.length || !b.length) return 0
  const A = bigrams(a), B = bigrams(b)
  let inter = 0
  for (const [k, n] of A) inter += Math.min(n, B.get(k) || 0)
  return (2 * inter) / (Math.max(1, a.length - 1) + Math.max(1, b.length - 1))
}
const unitKey = (u) => String(u || '').replace(/\.$/, '').replace(/^เมตร$/, 'ม').replace(/^ตารางเมตร$/, 'ตร.ม').trim()
/** คะแนนความเหมือน 0–1 ระหว่างชื่อที่ถอดได้กับชื่อในราคากลาง (เลขขนาดต้องตรงกัน ไม่งั้นหักคะแนน) */
export function nameScore(want, have, wantUnit, haveUnit) {
  const a = normName(want), b = normName(have)
  let s = dice(a, b)
  if (b.includes(a) || a.includes(b)) s = Math.max(s, 0.6)
  const na = numsOf(want), nb = numsOf(have)
  if (na.size && nb.size && ![...na].some((x) => nb.has(x))) s *= 0.5
  if (wantUnit && haveUnit && unitKey(wantUnit) === unitKey(haveUnit)) s += 0.05
  return Math.min(1, s)
}
/** หาราคากลางวัสดุที่ใกล้ที่สุด → { match (ถ้ามั่นใจพอ), alts (5 อันดับ) } */
export function matchMaterial(item, materials) {
  const ranked = materials
    .map((m) => ({ id: m.id, name: m.name, unit: m.unit, central: m.central, confidence: m.confidence, score: nameScore(item.desc, m.name, item.unit, m.unit) }))
    .filter((m) => m.score >= 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((m) => ({ ...m, score: Math.round(m.score * 100) / 100 }))
  return { match: ranked[0] && ranked[0].score >= 0.5 ? ranked[0] : null, alts: ranked }
}
export const laborLabel = (r) => r.name + (r.variant ? ` (${r.variant})` : '')
/** หาค่าแรงจากชื่อหมวดงานที่ AI เลือก (หรือเทียบชื่อใกล้เคียง) */
export function matchLabor(item, rates) {
  const label = laborLabel
  const want = String(item.labor || '').trim()
  let best = null
  if (want) best = rates.find((r) => label(r) === want || r.name === want) || null
  if (!best && want) {
    const ranked = rates.map((r) => ({ r, s: nameScore(want, label(r)) })).sort((a, b) => b.s - a.s)
    if (ranked[0] && ranked[0].s >= 0.5) best = ranked[0].r
  }
  if (!best) return null
  const price = best.price_max > 0 ? Math.round((best.price_min + best.price_max) / 2) : 0
  return { id: best.id, name: label(best), unit: best.unit, price, quote: !(best.price_max > 0) }
}

// ---------- คำสั่งให้ AI ----------
export function takeoffPrompt({ house, rates, dxfSummary }) {
  const laborList = rates.map((r) => `${laborLabel(r)} [ต่อ ${r.unit}]`)
  const h = house || {}
  const info = [
    h.area_m2 ? `พื้นที่ใช้สอยรวม ${h.area_m2} ตร.ม.` : '',
    h.floors ? `จำนวนชั้น ${h.floors}` : '',
    h.ceiling_h ? `ความสูงฝ้า ${h.ceiling_h} ม.` : '',
    h.raised_h ? `ยกพื้นจากดิน ${h.raised_h} ม.` : '',
    h.spec ? `สเปก/หมายเหตุ: ${h.spec}` : '',
  ].filter(Boolean).join(' · ')
  const src = dxfSummary
    ? `ข้อมูลนี้สรุปมาจากไฟล์ DXF (หน่วยเป็นเมตรแล้ว) — blocks = จำนวนสัญลักษณ์, lengths = ความยาวเส้นรวมต่อ Layer, areas = พื้นที่รูปปิด/Hatch ต่อ Layer, texts = ตัวหนังสือในแบบ:\n${JSON.stringify(dxfSummary)}`
    : 'อ่านจากไฟล์แบบที่แนบมา (ใช้มาตราส่วนและเส้นบอกระยะในแบบคำนวณความยาว/พื้นที่)'
  return `คุณเป็นผู้ประมาณราคา (QS) ของบริษัทรับสร้างบ้านในประเทศไทย ถอดปริมาณวัสดุ/งานจากแบบก่อสร้างนี้เพื่อทำ BOQ ร่าง ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น
${src}
${info ? 'ข้อมูลบ้านจากผู้ใช้ (ใช้ประกอบและตรวจสอบ): ' + info : ''}

รูปแบบ: {"drawing":"แบบนี้คือแบบอะไร เช่น แปลนสุขาภิบาล","items":[{"cat":"ระบบประปา-สุขาภิบาล","desc":"ท่อ PVC ชั้น 13.5 ขนาด 1/2 นิ้ว","qty":5,"unit":"ท่อน","basis":"แนวราบ ~11 ม. + แนวดิ่ง 2 จุด x 2 ม. = 15 ม. ÷ 4 ม./ท่อน + เผื่อ 10%","confidence":"กลาง"}],"labor":[{"labor":"งานติดตั้งสุขภัณฑ์ (เหมาย่อห้อง)","qty":1,"basis":"ห้องน้ำ 1 ห้อง","confidence":"สูง"}],"notes":["ข้อสังเกตหรือสิ่งที่ต้องตรวจ"]}
items = วัสดุเท่านั้น (ไม่รวมค่าแรง)
labor = ค่าแรงแยกต่างหาก คิดตาม "ปริมาณงาน" ในหน่วยของหมวดค่าแรงนั้น ไม่ได้คิดตามจำนวนวัสดุ เช่น งานก่อผนัง = พื้นที่ผนัง ตร.ม. · งานโครงสร้าง/โครงหลังคา/มุงหลังคา = พื้นที่ ตร.ม. · งานเชิงชาย = ความยาว เมตร · งานตั้งวงกบ = จำนวนชุด · หมวดที่คิดเป็น "เหมา"/"หลัง"/"ห้อง" ให้ qty เป็นจำนวนเหมา/หลัง/ห้อง
- labor ต้องเลือกชื่อจากรายการนี้เท่านั้น (ตัวในวงเล็บเหลี่ยมคือหน่วย ห้ามใส่ลงในชื่อ) และใส่เฉพาะงานที่มีในแบบนี้: ${laborList.join(' | ')}
กติกา items:
- cat ต้องเป็นหนึ่งใน: ${BOQ_CATS.join(' | ')}
- desc ตั้งชื่อแบบที่ร้านวัสดุก่อสร้างไทยใช้ ระบุชนิด/ขนาด/สเปกที่จำเป็น (ถ้าแบบไม่ระบุสเปก ให้ใช้สเปกที่นิยมกับบ้านพักอาศัย และบอกใน basis ว่าสมมติ)
- qty เป็นตัวเลขล้วน หน่วยเป็นหน่วยที่ซื้อจริง (ท่อน เส้น ถุง ก้อน ชุด ตัว ตร.ม. ลบ.ม. ม.) ปัดขึ้นและเผื่อเสียหายตามความเหมาะสม
- นับสัญลักษณ์ทุกชนิดที่เห็น (สุขภัณฑ์ ดวงไฟ ปลั๊ก สวิตช์ ประตู หน้าต่าง บ่อพัก ฯลฯ) และข้อต่อที่ต้องใช้โดยประมาณ
- ความยาวท่อ/สายไฟ ให้รวมแนวดิ่งด้วย (ใช้ระดับพื้น/ความสูงฝ้าจากแบบหรือข้อมูลผู้ใช้)
- basis = วิธีคิดสั้นๆ ให้คนตรวจตามได้ (ทั้ง items และ labor) · confidence = สูง (นับได้ชัด) | กลาง (วัด/ประมาณจากแบบ) | ต่ำ (สมมติ/เดา)
- ใส่เฉพาะสิ่งที่มีในแบบนี้ ห้ามแต่งหมวดที่แบบไม่ได้แสดง · ถ้าอ่านแบบไม่ได้เลยให้คืน {"items":[],"labor":[],"notes":["เหตุผล"]}`
}

/** ทำให้ผลจาก AI อยู่ในรูปที่ปลอดภัย */
export function cleanItems(list) {
  const n = (v) => Number(String(v ?? 0).replace(/,/g, '')) || 0
  return (Array.isArray(list) ? list : []).map((it) => ({
    cat: BOQ_CATS.includes(it.cat) ? it.cat : catGuess(it.desc),
    desc: String(it.desc || '').trim(),
    qty: Math.round(n(it.qty) * 100) / 100,
    unit: String(it.unit || '').trim(),
    basis: String(it.basis || '').trim(),
    confidence: ['สูง', 'กลาง', 'ต่ำ'].includes(it.confidence) ? it.confidence : 'กลาง',
  })).filter((it) => it.desc)
}
/** ค่าแรงจาก AI → ผูกกับราคากลางค่าแรง (หน่วยใช้ของหมวดค่าแรงเสมอ · ชื่อที่ไม่มีในราคากลางทิ้ง) */
export function cleanLabor(list, rates) {
  const n = (v) => Number(String(v ?? 0).replace(/,/g, '')) || 0
  return (Array.isArray(list) ? list : []).map((it) => {
    const m = matchLabor({ labor: String(it.labor || '').replace(/\s*\[[^\]]*\]\s*$/, '') }, rates)
    if (!m) return null
    return {
      cat: catGuess(m.name), rate_id: m.id, name: m.name, unit: m.unit, price: m.price, quote: m.quote,
      qty: Math.round(n(it.qty) * 100) / 100,
      basis: String(it.basis || '').trim(),
      confidence: ['สูง', 'กลาง', 'ต่ำ'].includes(it.confidence) ? it.confidence : 'กลาง',
    }
  }).filter(Boolean)
}
