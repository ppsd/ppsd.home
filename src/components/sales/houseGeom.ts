// เรขาคณิตของ "แบบบ้านเบื้องต้น" — ใช้ร่วมกันระหว่างแปลน (SVG) และ 3D (three.js) ให้ผนัง/ประตู/หน้าต่างตรงกันเสมอ
// พิกัดแปลน: x = ไปทางขวา (ตะวันออก) · y = ลงล่าง (ใต้ = ด้านหน้าบ้าน) · หน่วยเมตร
export type Side = 'N' | 'S' | 'E' | 'W'
export interface Room { name: string; type: string; x: number; y: number; w: number; d: number; doors: Side[]; windows: Side[] }
export interface Floor { level: number; height: number; rooms: Room[] }
export interface Layout { summary: string; style: string; roof: 'gable' | 'hip' | 'flat'; wall_color: string; roof_color: string; floors: Floor[]; notes: string[]; facing?: number }

export const OUTDOOR = new Set(['porch', 'carport', 'terrace', 'balcony'])
export const ROOM_COLOR: Record<string, string> = {
  living: '#F6E9D3', dining: '#F3E3CC', kitchen: '#F1DCC9', bedroom: '#DDE8F3', master: '#D3E2F2', bath: '#D6EEF0',
  stair: '#E6E2DA', hall: '#EEECE7', storage: '#E8E4DC', laundry: '#E1EEE9', work: '#E8E1F1', pray: '#F4E6E1',
  porch: '#E9EFE3', carport: '#E5E7EA', terrace: '#E6EEDD', balcony: '#E3EDE4', other: '#ECECEC',
}

/** ช่องเปิดบนผนัง: a–b = ช่วงตามแนวผนัง · into = ประตูเปิดเข้าทาง +1 (x/y มากขึ้น) หรือ -1 */
export interface Opening { a: number; b: number; kind: 'door' | 'entry' | 'window'; into: 1 | -1 }
/** ผนังหนึ่งช่วง: horiz = แนวนอน (ขนานแกน x) · line = ค่า y (แนวนอน) หรือ x (แนวตั้ง) · a–b = ช่วงตามแนวผนัง */
export interface Wall { horiz: boolean; line: number; a: number; b: number; exterior: boolean; openings: Opening[] }

const K = (v: number) => Math.round(v * 100)
const isIn = (px: number, py: number, r: Room) => px > r.x + 1e-6 && px < r.x + r.w - 1e-6 && py > r.y + 1e-6 && py < r.y + r.d - 1e-6

/** ผนังทั้งชั้นจากขอบห้อง (เฉพาะห้องในตัวบ้าน) — ขอบที่ซ้อนกันรวมเป็นผนังเดียว · ผนังที่อีกด้านไม่มีห้อง = ผนังภายนอก */
export function computeWalls(rooms: Room[]): Wall[] {
  const indoor = rooms.filter((r) => !OUTDOOR.has(r.type))
  const inside = (px: number, py: number) => indoor.some((r) => isIn(px, py, r))
  const walls: Wall[] = []
  for (const horiz of [true, false]) {
    const lines = new Map<number, { line: number; iv: [number, number][] }>()
    const add = (line: number, a: number, b: number) => {
      const k = K(line)
      if (!lines.has(k)) lines.set(k, { line, iv: [] })
      lines.get(k)!.iv.push([a, b])
    }
    for (const r of indoor) {
      if (horiz) { add(r.y, r.x, r.x + r.w); add(r.y + r.d, r.x, r.x + r.w) } else { add(r.x, r.y, r.y + r.d); add(r.x + r.w, r.y, r.y + r.d) }
    }
    for (const { line, iv } of lines.values()) {
      const pts = [...new Set(iv.flatMap(([a, b]) => [K(a), K(b)]))].sort((p, q) => p - q).map((v) => v / 100)
      let cur: Wall | null = null
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], m = (a + b) / 2
        if (b - a < 0.01 || !iv.some(([p, q]) => p <= m && q >= m)) { if (cur) { walls.push(cur); cur = null } continue }
        const s1 = horiz ? inside(m, line - 0.05) : inside(line - 0.05, m)
        const s2 = horiz ? inside(m, line + 0.05) : inside(line + 0.05, m)
        const exterior = !(s1 && s2)
        if (cur && cur.exterior === exterior && Math.abs(cur.b - a) < 0.01) cur.b = b
        else { if (cur) walls.push(cur); cur = { horiz, line, a, b, exterior, openings: [] } }
      }
      if (cur) walls.push(cur)
    }
  }
  // ประตู/หน้าต่างตามด้านที่ห้องระบุ
  for (const r of indoor) {
    for (const side of ['N', 'S', 'E', 'W'] as Side[]) {
      const hasDoor = r.doors.includes(side), hasWin = r.windows.includes(side)
      if (!hasDoor && !hasWin) continue
      const horiz = side === 'N' || side === 'S'
      const line = side === 'N' ? r.y : side === 'S' ? r.y + r.d : side === 'W' ? r.x : r.x + r.w
      const a0 = horiz ? r.x : r.y, len = horiz ? r.w : r.d
      const into: 1 | -1 = side === 'N' || side === 'W' ? 1 : -1
      const place = (center: number, kind: Opening['kind'], width: number) => {
        const wall = walls.find((w) => w.horiz === horiz && K(w.line) === K(line) && w.a <= center && w.b >= center)
        if (!wall) return
        if (kind === 'window' && !wall.exterior) return
        const k: Opening['kind'] = kind === 'door' && wall.exterior ? 'entry' : kind
        const wd = Math.min(width, wall.b - wall.a - 0.3, len - 0.3)
        if (wd < 0.5) return
        let a = center - wd / 2, b = center + wd / 2
        if (a < wall.a + 0.15) { b += wall.a + 0.15 - a; a = wall.a + 0.15 }
        if (b > wall.b - 0.15) { a -= b - (wall.b - 0.15); b = wall.b - 0.15 }
        if (wall.openings.some((o) => o.a < b + 0.1 && o.b > a - 0.1)) return // ซ้อนช่องเดิม (ห้องข้างเคียงใส่ประตูบานเดียวกัน)
        wall.openings.push({ a, b, kind: k, into })
      }
      const doorAt = hasDoor && hasWin ? a0 + len * 0.25 : a0 + len / 2
      const winAt = hasDoor && hasWin ? a0 + len * 0.68 : a0 + len / 2
      if (hasDoor) place(doorAt, 'door', r.type === 'living' || r.type === 'hall' ? 1.2 : r.type === 'bath' ? 0.8 : 0.9)
      if (hasWin) place(winAt, 'window', Math.max(0.6, Math.min(2.4, len * 0.45)))
    }
  }
  for (const w of walls) w.openings.sort((p, q) => p.a - q.a)
  return walls
}

export function bbox(rooms: Room[]) {
  if (!rooms.length) return { x0: 0, y0: 0, x1: 0, y1: 0 }
  return {
    x0: Math.min(...rooms.map((r) => r.x)), y0: Math.min(...rooms.map((r) => r.y)),
    x1: Math.max(...rooms.map((r) => r.x + r.w)), y1: Math.max(...rooms.map((r) => r.y + r.d)),
  }
}
export const fmtM = (n: number) => (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })
export const fmtBaht = (n: number) => Math.round(n || 0).toLocaleString('en-US')
