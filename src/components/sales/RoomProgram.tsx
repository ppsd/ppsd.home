import { useState } from 'react'

// ห้องที่ลูกค้าต้องการแยกรายชั้น + ตำแหน่ง · ทิศหน้าบ้าน · ความต้องการให้ติ๊ก
// ใช้ในหน้า "ออกแบบบ้านใหม่" (ERP) — รายการเดียวกับฟอร์มเว็บลูกค้า public/web/app.js (RCAT / POS / PRESET / FEAT) แก้ให้ตรงกันทั้งสองที่

/** [หมวด, [[รหัส, ชื่อ, นับเป็น b=ห้องนอน t=ห้องน้ำ bt=ห้องนอน+ห้องน้ำในตัว]]] */
export const RCAT: [string, [string, string, string?][]][] = [
  ['ห้องนอน', [['master', 'ห้องนอนใหญ่ (มีห้องน้ำ+ที่แต่งตัว)', 'bt'], ['bedBath', 'ห้องนอนมีห้องน้ำในตัว', 'bt'], ['bed', 'ห้องนอน', 'b'], ['elder', 'ห้องนอนผู้สูงอายุ', 'b'], ['kid', 'ห้องนอนเด็ก', 'b'], ['guest', 'ห้องนอนแขก', 'b'], ['maid', 'ห้องแม่บ้าน']]],
  ['ห้องน้ำ', [['bath', 'ห้องน้ำรวม', 't'], ['guestBath', 'ห้องน้ำแขก/ส่วนกลาง', 't'], ['powder', 'ห้องน้ำเล็ก (สุขภัณฑ์+อ่างล้างมือ)', 't'], ['outBath', 'ห้องน้ำนอกบ้าน/ห้องน้ำแม่บ้าน', 't']]],
  ['นั่งเล่น รับแขก ทานข้าว', [['foyer', 'โถงทางเข้า'], ['living', 'ห้องนั่งเล่น'], ['formal', 'ห้องรับแขก'], ['family', 'ห้องนั่งเล่นครอบครัว'], ['dining', 'ห้องทานข้าว'], ['double', 'โถงสูงสองชั้น (ฝ้าสูงโปร่ง)']]],
  ['ครัว', [['thaiK', 'ครัวไทย (ปิด แยกกลิ่น)'], ['openK', 'ครัวฝรั่ง/แพนทรีเปิดโล่ง'], ['island', 'เคาน์เตอร์ไอส์แลนด์'], ['pantry', 'ห้องเก็บอาหาร']]],
  ['ห้องใช้งานอื่น', [['pray', 'ห้องพระ'], ['work', 'ห้องทำงาน'], ['library', 'ห้องอ่านหนังสือ'], ['movie', 'ห้องดูหนัง/คาราโอเกะ'], ['gym', 'ห้องออกกำลังกาย'], ['play', 'ห้องเด็กเล่น'], ['multi', 'ห้องอเนกประสงค์'], ['walkin', 'ห้องแต่งตัว (walk-in closet)'], ['store', 'ห้องเก็บของ'], ['laundry', 'ห้องซักรีด'], ['mech', 'ห้องเครื่อง/ปั๊มน้ำ'], ['lift', 'ลิฟต์บ้าน']]],
  ['นอกตัวบ้าน', [['car', 'ที่จอดรถ (คัน)'], ['porch', 'ชานหน้าบ้าน'], ['terrace', 'ลาน/เทอเรสนั่งเล่น'], ['balcony', 'ระเบียง'], ['dry', 'ลานซักล้าง-ตากผ้า (มีหลังคา)'], ['court', 'คอร์ทสวนกลางบ้าน'], ['pool', 'สระว่ายน้ำ'], ['bbq', 'ลานบาร์บีคิว']]],
]
const RINFO: Record<string, { t: string; c: string }> = Object.fromEntries(RCAT.flatMap(([, list]) => list.map(([k, t, c]) => [k, { t, c: c || '' }])))
export const POS = ['ด้านหน้า', 'ด้านหลัง', 'ด้านซ้าย', 'ด้านขวา', 'กลางบ้าน', 'มุมหน้าซ้าย', 'มุมหน้าขวา', 'มุมหลังซ้าย', 'มุมหลังขวา', 'ทิศเหนือ', 'ทิศใต้', 'ทิศตะวันออก', 'ทิศตะวันตก', 'ติดสวน', 'ใกล้บันได', 'ใกล้ที่จอดรถ']
/** ค่าเริ่มต้นตามจำนวนชั้น (0 = ยังไม่แน่ใจ ให้ระบบเลือกชั้นเอง) */
const PRESET: Record<number, Record<number, Record<string, number>>> = {
  0: { 0: { master: 1, bed: 2, bath: 1, living: 1, dining: 1, thaiK: 1, car: 1, porch: 1 } },
  1: { 1: { master: 1, bed: 2, bath: 1, living: 1, dining: 1, thaiK: 1, car: 1, porch: 1 } },
  2: { 1: { living: 1, dining: 1, thaiK: 1, guestBath: 1, car: 2, porch: 1, dry: 1 }, 2: { master: 1, bed: 2, bath: 1, family: 1, balcony: 1 } },
  3: { 1: { living: 1, dining: 1, thaiK: 1, guestBath: 1, car: 2, dry: 1 }, 2: { master: 1, bed: 1, bath: 1, family: 1 }, 3: { bed: 2, bath: 1, pray: 1, balcony: 1 } },
}
export const FEAT: [string, string[]][] = [
  ['แสง ลม ความสบาย', ['บ้านไม่ร้อน ห้องนอนหลบแดดบ่าย', 'ลมผ่านทะลุทุกห้อง', 'หน้าต่างบานใหญ่รับวิว', 'ฝ้าสูงโปร่ง', 'ชายคายื่นกันแดดฝน', 'ยกพื้นสูง/ใต้ถุนกันน้ำท่วม']],
  ['ครอบครัว', ['ห้องนอนลูกใกล้ห้องพ่อแม่', 'แยกโซนพ่อแม่กับลูก', 'ทางลาดสำหรับวีลแชร์', 'ห้องน้ำผู้สูงอายุมีราวจับ', 'บันไดชันน้อย', 'พื้นที่สัตว์เลี้ยง']],
  ['ครัวและงานบ้าน', ['ครัวใกล้ที่จอดรถ', 'ประตูหลังบ้านเข้าครัว', 'ห้องน้ำแยกส่วนเปียก-แห้ง', 'ซักล้างใกล้ครัว', 'ห้องแม่บ้านมีทางเข้าแยก']],
  ['ความเชื่อ', ['ดูฮวงจุ้ยและทิศ', 'ห้องพระอยู่ชั้นบนสุด', 'ประตูหน้ากับหลังไม่ตรงกัน', 'บันไดไม่หันเข้าประตูใหญ่']],
  ['อื่น ๆ', ['เผื่อต่อเติมในอนาคต', 'เผื่อติดโซลาร์เซลล์', 'ที่จอดรถมีหลังคา', 'สวนหน้าบ้าน', 'สวนหลังบ้าน', 'รั้วและประตูรั้ว']],
]
export const DIR8: [string, number][] = [['เหนือ', 0], ['ตะวันออกเฉียงเหนือ', 45], ['ตะวันออก', 90], ['ตะวันออกเฉียงใต้', 135], ['ใต้', 180], ['ตะวันตกเฉียงใต้', 225], ['ตะวันตก', 270], ['ตะวันตกเฉียงเหนือ', 315]]
export const dirOf = (deg: number) => DIR8[Math.round((((deg % 360) + 360) % 360) / 45) % 8][0]

/** prog['ชั้น|รหัส'] = { n, pos } */
export type Prog = Record<string, { n: number; pos: string }>
export const presetProg = (floors: number): Prog => {
  const p: Prog = {}
  for (const [lv, rooms] of Object.entries(PRESET[floors] || {})) for (const [k, n] of Object.entries(rooms)) p[lv + '|' + k] = { n, pos: '' }
  return p
}
const floorsOf = (floors: number) => (floors ? Array.from({ length: floors }, (_, i) => i + 1) : [0])
/** รายการที่ส่งให้ AI (เฉพาะชั้นที่ใช้อยู่) + ยอดรวม */
export function progItems(prog: Prog, floors: number) {
  const fls = floorsOf(floors)
  const items = Object.entries(prog).filter(([k, v]) => v.n > 0 && fls.includes(Number(k.split('|')[0]))).map(([k, v]) => {
    const [lv, key] = k.split('|')
    return { floor: Number(lv), key, name: RINFO[key].t.replace(' (คัน)', ''), count: v.n, pos: v.pos }
  })
  let beds = 0, baths = 0, cars = 0
  for (const x of items) { const c = RINFO[x.key].c; if (c.includes('b')) beds += x.count; if (c.includes('t')) baths += x.count; if (x.key === 'car') cars += x.count }
  return { items: items.map(({ floor, name, count, pos }) => ({ floor, name, count, pos })), beds, baths, cars }
}

const navy = '#30506A'
const sBtn: React.CSSProperties = { fontFamily: 'inherit', width: 30, height: 30, border: '1px solid #D2DAE1', background: '#fff', color: navy, fontSize: 16, cursor: 'pointer', lineHeight: 1 }
const sel: React.CSSProperties = { fontFamily: 'inherit', fontSize: 12.5, border: '1px solid #D2DAE1', borderRadius: 8, padding: '5px 8px', background: '#fff', color: '#1C2730', width: '100%' }

/** ตารางห้องรายชั้น: แท็บชั้น → หมวด → + − จำนวน + ตำแหน่ง */
export function RoomProgram({ floors, prog, setProg }: { floors: number; prog: Prog; setProg: (p: Prog) => void }) {
  const fls = floorsOf(floors)
  const [cur, setCur] = useState(fls[0])
  const lv = fls.includes(cur) ? cur : fls[0]
  const put = (k: string, patch: Partial<{ n: number; pos: string }>) => {
    const key = lv + '|' + k, o = prog[key] || { n: 0, pos: '' }
    setProg({ ...prog, [key]: { ...o, ...patch, n: Math.min(12, Math.max(0, patch.n ?? o.n)) } })
  }
  const count = (l: number, keys?: string[]) => Object.entries(prog).filter(([k, v]) => v.n > 0 && Number(k.split('|')[0]) === l && (!keys || keys.includes(k.split('|')[1]))).reduce((a, [, v]) => a + v.n, 0)
  const tot = progItems(prog, floors)
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {fls.map((l) => (
          <button key={l} onClick={() => setCur(l)} style={{ fontFamily: 'inherit', fontSize: 12.5, borderRadius: 999, padding: '5px 12px', cursor: 'pointer', border: '1px solid ' + (l === lv ? navy : '#D2DAE1'), background: l === lv ? navy : '#fff', color: l === lv ? '#fff' : navy }}>
            {l ? `ชั้น ${l}` : 'ทั้งบ้าน (ให้ AI เลือกชั้น)'} <span style={{ opacity: 0.75 }}>{count(l)}</span>
          </button>
        ))}
      </div>
      {RCAT.map(([g, list], gi) => (
        <details key={g + lv} open={gi < 3} style={{ border: '1px solid #E3E8EC', borderRadius: 9, marginBottom: 6, background: '#fff' }}>
          <summary style={{ cursor: 'pointer', padding: '7px 10px', fontSize: 13, color: '#1C2730' }}>{g} {count(lv, list.map((x) => x[0])) ? <b style={{ color: '#9C5A2E' }}>{count(lv, list.map((x) => x[0]))}</b> : null}</summary>
          {list.map(([k, t]) => {
            const v = prog[lv + '|' + k] || { n: 0, pos: '' }
            return (
              <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(120px,170px)', gap: 8, alignItems: 'center', padding: '5px 10px', borderTop: '1px solid #EEF1F4' }}>
                <span style={{ fontSize: 12.5, color: '#1C2730' }}>{t}</span>
                <div style={{ display: 'flex' }}>
                  <button style={{ ...sBtn, borderRadius: '8px 0 0 8px' }} onClick={() => put(k, { n: v.n - 1 })} aria-label={'ลด' + t}>−</button>
                  <input value={v.n} inputMode="numeric" aria-label={t} onChange={(e) => put(k, { n: Number(e.target.value.replace(/\D/g, '')) || 0 })} style={{ width: 38, height: 30, boxSizing: 'border-box', textAlign: 'center', border: '1px solid #D2DAE1', borderLeft: 0, borderRight: 0, fontFamily: 'inherit', fontSize: 13 }} />
                  <button style={{ ...sBtn, borderRadius: '0 8px 8px 0' }} onClick={() => put(k, { n: v.n + 1 })} aria-label={'เพิ่ม' + t}>+</button>
                </div>
                {v.n > 0 ? (
                  <select style={sel} value={v.pos} onChange={(e) => put(k, { pos: e.target.value })} aria-label={'ตำแหน่ง' + t}>
                    <option value="">ตำแหน่ง: ให้ AI เลือก</option>
                    {POS.map((p) => <option key={p}>{p}</option>)}
                  </select>
                ) : <span />}
              </div>
            )
          })}
        </details>
      ))}
      <div style={{ fontSize: 12, color: '#5C6770' }}>รวมทั้งบ้าน: ห้องนอน <b>{tot.beds}</b> · ห้องน้ำ <b>{tot.baths}</b> (นับห้องน้ำในห้องนอนแล้ว) · ที่จอดรถ <b>{tot.cars}</b> คัน · ตำแหน่งมองจากถนนเข้าหาบ้าน · ทางเดินและบันได AI ใส่ให้เอง</div>
    </div>
  )
}

/** เลือกทิศหน้าบ้าน (ทิศ 8 ทิศ หรือองศา) + เข็มทิศเล็ก */
export function FacingPicker({ deg, setDeg }: { deg: string; setDeg: (v: string) => void }) {
  const d = deg === '' ? null : ((Number(deg) % 360) + 360) % 360
  const dirVal = d === null ? '' : String(DIR8[Math.round(d / 45) % 8][1])
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div><div style={{ fontSize: 12, color: '#5C6770', marginBottom: 4 }}>ทิศ</div>
          <select style={{ ...sel, padding: '8px 10px', fontSize: 13 }} value={dirVal} onChange={(e) => setDeg(e.target.value)}>
            <option value="">ไม่ทราบ</option>
            {DIR8.map(([t, v]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
        <div><div style={{ fontSize: 12, color: '#5C6770', marginBottom: 4 }}>องศา (0–359)</div>
          <input style={{ ...sel, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} inputMode="numeric" value={deg} placeholder="เช่น 200" onChange={(e) => setDeg(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        </div>
      </div>
      <svg viewBox="-50 -50 100 100" width={78} height={78} aria-hidden="true" style={{ flex: 'none', color: navy }}>
        <circle r={40} fill="none" stroke="currentColor" strokeOpacity={0.35} />
        {([['น', 0, -44], ['อ', 44, 0], ['ต', 0, 44], ['ตก', -44, 0]] as [string, number, number][]).map(([t, x, y]) => <text key={t} x={x} y={y} fontSize={10} textAnchor="middle" dominantBaseline="middle" fill="currentColor" opacity={0.7}>{t}</text>)}
        {d === null ? <text y={4} fontSize={9} textAnchor="middle" fill="currentColor" opacity={0.6}>ไม่ระบุ</text>
          : <g transform={`rotate(${d})`}><rect x={-11} y={-11} width={22} height={22} rx={2} fill="#EEF3F7" stroke={navy} /><path d="M0 -12 L0 -32 M-6 -25 L0 -33 L6 -25" stroke="#9C5A2E" strokeWidth={3} fill="none" /></g>}
      </svg>
    </div>
  )
}
