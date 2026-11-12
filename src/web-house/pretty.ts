// ภาพนิ่ง "ตกแต่งแล้ว" ของแบบบ้าน (สำหรับเว็บลูกค้า) — สร้างจากผังห้องชุดเดียวกับแปลน/3D แต่ใส่วัสดุ ขอบหน้าต่าง ประตูไม้
// สวน ต้นไม้ ทางรถ ท้องฟ้า แสงเย็น และใช้ "โทน PPSD" ชุดเดียวกันทุกหลัง (ไม่ใช้สีที่ AI เลือก เพื่อให้ทุกแบบดูเป็นชุดเดียวกัน)
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { OUTDOOR, computeWalls, bbox, type Layout, type Room } from '../components/sales/houseGeom'

/** โทนสีเดียวกันทุกหลัง */
export const TONE = {
  wall: '#F3EEE5', plinth: '#9C958B', slab: '#E6E1D8', roof: '#3E3B39', fascia: '#F6F3EC', frame: '#2F3438',
  glass: '#5F7F96', wood: '#9A6B45', deck: '#A57A54', porch: '#D5CCBE', concrete: '#CFCBC3', lawn: '#8DAE66',
  path: '#DCD6CB', trunk: '#6B4E37', leaves: ['#5C8A47', '#6E9C52', '#4C773C', '#7DA85E'], shrub: ['#4F7D3F', '#668F4C', '#80A85F'],
  skyTop: '#86B2D8', skyBottom: '#EDE7DA', fog: '#E3E3D6',
}
// โทนที่ใช้วาดอยู่ตอนนี้ — ปกติ = TONE · ภาพจากรูปตัวอย่างของลูกค้าเปลี่ยนสีผนัง/หลังคาตามรูปได้ (renderStill(..., colors))
let T: typeof TONE = TONE
const PLINTH = 0.45, DOOR_H = 2.15, SILL = 0.9, HEAD = 2.15
const PITCH = Math.tan((27 * Math.PI) / 180)

// สุ่มแบบกำหนดผลได้ (ภาพเดิมทุกครั้งที่สร้างใหม่)
function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }

export function skyTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 512
  const g = c.getContext('2d')!, gr = g.createLinearGradient(0, 0, 0, 512)
  gr.addColorStop(0, T.skyTop); gr.addColorStop(0.55, '#C4D9EA'); gr.addColorStop(1, T.skyBottom)
  g.fillStyle = gr; g.fillRect(0, 0, 4, 512)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}
function grassTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const g = c.getContext('2d')!, r = rng(7)
  g.fillStyle = T.lawn; g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 4000; i++) { const v = r(); g.fillStyle = v < 0.5 ? 'rgba(60,90,40,.18)' : 'rgba(190,210,140,.16)'; g.fillRect(r() * 256, r() * 256, 2, 2) }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}
/** ไม้ระแนงแนวตั้ง (ใช้กับผนังทึบที่ไม่มีหน้าต่าง) */
function slatTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 8
  const g = c.getContext('2d')!
  g.fillStyle = T.wood; g.fillRect(0, 0, 64, 8)
  g.fillStyle = 'rgba(40,25,15,.45)'; g.fillRect(52, 0, 12, 8)
  g.fillStyle = 'rgba(255,230,200,.10)'; g.fillRect(0, 0, 10, 8)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}
/** ลายกระเบื้องหลังคา: เส้นแนวนอนถี่ ๆ (ใช้กับหลังคาจั่ว/ปั้นหยา) */
function tileTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = T.roof; g.fillRect(0, 0, 64, 64)
  g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, 56, 64, 8)
  g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, 0, 64, 6)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** สร้างฉากบ้านตกแต่ง คืน scene + กล้องที่จัดมุมแล้ว */
export function buildPrettyScene(layout: Layout, aspect: number, seed = 1) {
  const scene = new THREE.Scene()
  const mats = new Map<string, THREE.Material>()
  const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
    const k = color + JSON.stringify(extra)
    if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...extra }))
    return mats.get(k)!
  }
  const M = {
    wall: mat(T.wall), plinth: mat(T.plinth, { roughness: 1 }), slab: mat(T.slab), fascia: mat(T.fascia),
    frame: mat(T.frame, { roughness: 0.5, metalness: 0.3 }),
    glass: new THREE.MeshPhysicalMaterial({ color: T.glass, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.88, envMapIntensity: 1.6 }),
    wood: mat(T.wood, { roughness: 0.7 }), deck: mat(T.deck, { roughness: 0.8 }), porch: mat(T.porch), concrete: mat(T.concrete),
    path: mat(T.path), trunk: mat(T.trunk), rail: new THREE.MeshPhysicalMaterial({ color: '#B9D3E2', roughness: 0.05, transparent: true, opacity: 0.35 }),
    roof: (() => { const t = tileTexture(); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.75, side: THREE.DoubleSide }) })(),
    roofFlat: mat(T.roof, { roughness: 0.8 }),
  }
  const slat = slatTexture(), extraMats: THREE.Material[] = []
  const box = (g: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, shadow = true) => {
    if (sx <= 0.001 || sy <= 0.001 || sz <= 0.001) return null
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m)
    mesh.position.set(x, y, z); mesh.castShadow = shadow; mesh.receiveShadow = true
    g.add(mesh); return mesh
  }

  const all = layout.floors.flatMap((f) => f.rooms)
  const ext = bbox(all)
  const cx = (ext.x0 + ext.x1) / 2, cz = (ext.y0 + ext.y1) / 2
  const span = Math.max(ext.x1 - ext.x0, ext.y1 - ext.y0, 6)
  const P = (x: number, y: number) => [x - cx, y - cz] as const
  const house = new THREE.Group(); scene.add(house)

  // ===== ตัวบ้าน =====
  let elev = PLINTH
  const tops: number[] = []
  layout.floors.forEach((f, fi) => {
    const h = f.height
    for (const r of f.rooms) {
      const [x, z] = P(r.x + r.w / 2, r.y + r.d / 2)
      const out = OUTDOOR.has(r.type)
      if (fi === 0) {
        if (r.type === 'carport') box(house, M.concrete, x, 0.05, z, r.w, 0.1, r.d)
        else if (r.type === 'terrace') { box(house, M.plinth, x, 0.1, z, r.w, 0.2, r.d); box(house, M.deck, x, 0.23, z, r.w, 0.06, r.d) }
        else if (out) { box(house, M.plinth, x, (PLINTH - 0.15) / 2, z, r.w, PLINTH - 0.15, r.d); box(house, M.porch, x, PLINTH - 0.12, z, r.w + 0.04, 0.06, r.d + 0.04) }
        else box(house, M.plinth, x, PLINTH / 2, z, r.w + 0.06, PLINTH, r.d + 0.06)
      } else {
        // แผ่นพื้นชั้นบน = แถบคาดสีอ่อนรอบบ้าน
        box(house, M.slab, x, elev - 0.08, z, r.w + 0.12, 0.22, r.d + 0.12)
        if (r.type === 'balcony') box(house, M.deck, x, elev + 0.05, z, r.w, 0.05, r.d)
      }
    }
    for (const w of computeWalls(f.rooms)) {
      if (!w.exterior) continue // ผนังภายในมองไม่เห็นจากภายนอก
      const t = 0.2
      const at = (a: number, b: number, y0: number, y1: number, m: THREE.Material, th = t, off = 0) => {
        const mid = (a + b) / 2, len = b - a
        if (w.horiz) { const [x, z] = P(mid, w.line); return box(house, m, x, elev + (y0 + y1) / 2, z + off, len, y1 - y0, th) }
        const [x, z] = P(w.line, mid); return box(house, m, x + off, elev + (y0 + y1) / 2, z, th, y1 - y0, len)
      }
      let p = w.a - t / 2
      // ผนังทึบยาว ≥ 1.5 ม. = ผนังไม้ระแนง (เอกลักษณ์ ขาว-ไม้-หลังคาเทาเข้ม)
      if (!w.openings.length && w.b - w.a >= 1.5) {
        const len = w.b - w.a + t, tex = slat.clone(); tex.repeat.set(len / 0.14, 1); tex.needsUpdate = true
        const cm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }); extraMats.push(cm)
        at(p, w.b + t / 2, 0, h, cm)
        continue
      }
      for (const o of w.openings) {
        at(p, o.a, 0, h, M.wall)
        const fw = 0.06
        if (o.kind === 'window') {
          at(o.a, o.b, 0, SILL, M.wall); at(o.a, o.b, HEAD, h, M.wall)
          at(o.a, o.b, SILL, HEAD, M.glass, 0.03)
          // กรอบ + ธรณีหน้าต่าง + ช่องแบ่งกลาง
          at(o.a, o.b, SILL - 0.04, SILL + 0.02, M.fascia, t + 0.12)
          at(o.a, o.b, HEAD - fw, HEAD, M.frame, t * 0.6)
          at(o.a, o.a + fw, SILL, HEAD, M.frame, t * 0.6); at(o.b - fw, o.b, SILL, HEAD, M.frame, t * 0.6)
          const n = Math.max(1, Math.round((o.b - o.a) / 0.9))
          for (let i = 1; i < n; i++) { const m0 = o.a + ((o.b - o.a) * i) / n; at(m0 - fw / 2, m0 + fw / 2, SILL, HEAD, M.frame, t * 0.6) }
        } else {
          at(o.a, o.b, DOOR_H, h, M.wall)
          if (o.kind === 'entry') {
            at(o.a, o.b, 0, DOOR_H, M.wood, 0.06)
            at(o.a, o.b, DOOR_H - fw, DOOR_H, M.frame, t * 0.7)
            at(o.a, o.a + fw, 0, DOOR_H, M.frame, t * 0.7); at(o.b - fw, o.b, 0, DOOR_H, M.frame, t * 0.7)
          } else at(o.a, o.b, 0, DOOR_H, M.glass, 0.03)
        }
        p = o.b
      }
      at(p, w.b + t / 2, 0, h, M.wall)
    }
    // ราวระเบียง: กระจก + ราวจับโลหะ ด้านที่ไม่ติดห้อง
    const indoor = f.rooms.filter((x) => !OUTDOOR.has(x.type))
    for (const r of f.rooms.filter((x) => x.type === 'balcony' || (fi > 0 && x.type === 'terrace'))) {
      const edges: [number, number, number, number][] = [[r.x, r.y, r.x + r.w, r.y], [r.x, r.y + r.d, r.x + r.w, r.y + r.d], [r.x, r.y, r.x, r.y + r.d], [r.x + r.w, r.y, r.x + r.w, r.y + r.d]]
      for (const [x0, y0, x1, y1] of edges) {
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
        const nx = x0 === x1 ? (x0 === r.x ? -0.1 : 0.1) : 0, ny = y0 === y1 ? (y0 === r.y ? -0.1 : 0.1) : 0
        if (indoor.some((q) => mx + nx > q.x && mx + nx < q.x + q.w && my + ny > q.y && my + ny < q.y + q.d)) continue
        const [x, z] = P(mx, my), sx = x0 === x1 ? 0.03 : x1 - x0, sz = y0 === y1 ? 0.03 : y1 - y0
        box(house, M.rail, x, elev + 0.55, z, sx, 1, sz, false)
        box(house, M.frame, x, elev + 1.07, z, Math.max(sx, 0.05), 0.05, Math.max(sz, 0.05))
      }
    }
    tops.push(elev + h)
    elev += h
  })

  // ===== หลังคา =====
  const coveredBy = (r: Room, upper: Room[]) => upper.some((u) => r.x + r.w / 2 > u.x && r.x + r.w / 2 < u.x + u.w && r.y + r.d / 2 > u.y && r.y + r.d / 2 < u.y + u.d)
  const flatRoof = (x: number, y: number, z: number, w: number, d: number) => {
    box(house, M.fascia, x, y + 0.12, z, w, 0.24, d)
    box(house, M.roofFlat, x, y + 0.25, z, w - 0.06, 0.03, d - 0.06)
  }
  layout.floors.forEach((f, fi) => {
    const upper = layout.floors.slice(fi + 1).flatMap((u) => u.rooms.filter((x) => !OUTDOOR.has(x.type)))
    const top = tops[fi], isTop = fi === layout.floors.length - 1
    for (const r of f.rooms) {
      if (coveredBy(r, upper)) continue
      const [x, z] = P(r.x + r.w / 2, r.y + r.d / 2)
      if (r.type === 'porch' || r.type === 'carport') {
        const ch = r.type === 'carport' ? 2.7 : top - 0.15
        flatRoof(x, ch, z, r.w + 0.4, r.d + 0.4)
        for (const [px, pz] of [[r.x + 0.15, r.y + 0.15], [r.x + r.w - 0.15, r.y + 0.15], [r.x + 0.15, r.y + r.d - 0.15], [r.x + r.w - 0.15, r.y + r.d - 0.15]]) {
          if (f.rooms.some((q) => !OUTDOOR.has(q.type) && px > q.x - 0.3 && px < q.x + q.w + 0.3 && pz > q.y - 0.3 && pz < q.y + q.d + 0.3)) continue
          const [qx, qz] = P(px, pz)
          box(house, M.wood, qx, ch / 2, qz, 0.16, ch, 0.16)
        }
      } else if (!OUTDOOR.has(r.type) && !isTop) flatRoof(x, top - 0.05, z, r.w + 0.4, r.d + 0.4)
    }
  })
  const topRooms = layout.floors[layout.floors.length - 1].rooms.filter((r) => !OUTDOOR.has(r.type))
  let roofTop = tops[tops.length - 1] || 3
  if (topRooms.length) {
    const b = bbox(topRooms), oh = 0.7
    const W = b.x1 - b.x0 + oh * 2, D = b.y1 - b.y0 + oh * 2
    const [x, z] = P((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)
    const y = tops[tops.length - 1]
    if (layout.roof === 'flat') {
      box(house, M.fascia, x, y + 0.3, z, W - oh * 1.0, 0.6, D - oh * 1.0)
      box(house, M.roofFlat, x, y + 0.61, z, W - oh * 1.0 - 0.1, 0.03, D - oh * 1.0 - 0.1)
      roofTop = y + 0.6
    } else {
      const alongX = W >= D, L = alongX ? W : D, s = alongX ? D : W, hr = (s / 2) * PITCH
      let geo: THREE.BufferGeometry
      if (layout.roof === 'hip') {
        const r = Math.max(0, (L - s) / 2)
        const c = [[-L / 2, 0, -s / 2], [L / 2, 0, -s / 2], [L / 2, 0, s / 2], [-L / 2, 0, s / 2]], r1 = [-r, hr, 0], r2 = [r, hr, 0]
        const tri = [c[3], c[2], r2, c[3], r2, r1, c[1], c[0], r1, c[1], r1, r2, c[0], c[3], r1, c[2], c[1], r2].flat()
        geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3))
        if (!alongX) geo.rotateY(Math.PI / 2)
      } else {
        const sh = new THREE.Shape([new THREE.Vector2(-s / 2, 0), new THREE.Vector2(s / 2, 0), new THREE.Vector2(0, hr)])
        geo = new THREE.ExtrudeGeometry(sh, { depth: L, bevelEnabled: false })
        geo.translate(0, 0, -L / 2)
        if (alongX) geo.rotateY(Math.PI / 2)
      }
      // UV ตามความสูง → เส้นกระเบื้องวิ่งขนานชายคา
      const pos = geo.getAttribute('position'), uv = new Float32Array(pos.count * 2)
      for (let i = 0; i < pos.count; i++) { uv[i * 2] = (pos.getX(i) + pos.getZ(i)) * 0.5; uv[i * 2 + 1] = pos.getY(i) / 0.32 }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
      geo.computeVertexNormals()
      const m = new THREE.Mesh(geo, M.roof)
      m.position.set(x, y + 0.02, z); m.castShadow = true; m.receiveShadow = true
      house.add(m)
      // เชิงชาย (ไม้ปิดชายคาสีขาว) + ฝ้าชายคา
      box(house, M.fascia, x, y - 0.06, z - D / 2, W, 0.2, 0.06); box(house, M.fascia, x, y - 0.06, z + D / 2, W, 0.2, 0.06)
      box(house, M.fascia, x - W / 2, y - 0.06, z, 0.06, 0.2, D); box(house, M.fascia, x + W / 2, y - 0.06, z, 0.06, 0.2, D)
      box(house, M.slab, x, y - 0.15, z, W - 0.05, 0.03, D - 0.05, false)
      roofTop = y + hr
    }
  }

  // ===== สวน ทางเดิน ต้นไม้ =====
  const R = rng(seed * 7919 + 17)
  const lawnTex = grassTexture(); lawnTex.repeat.set(span * 5, span * 5)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(span * 30, span * 30), new THREE.MeshStandardMaterial({ map: lawnTex, roughness: 1 }))
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground)
  const frontZ = ext.y1 - cz // ด้านหน้าบ้าน (ทิศใต้ = +z)
  const yard = 6
  // ทางรถจากที่จอดรถ / ทางเดินจากชานหน้าบ้าน ออกไปถึงหน้าที่ดิน
  const ground0 = layout.floors[0].rooms
  for (const r of ground0.filter((q) => q.type === 'carport')) {
    const [x] = P(r.x + r.w / 2, 0), z0 = r.y + r.d - cz
    box(scene, M.concrete, x, 0.03, z0 + (frontZ - z0 + yard) / 2, r.w, 0.06, frontZ - z0 + yard)
  }
  const porch = ground0.find((q) => q.type === 'porch') || ground0.find((q) => q.type === 'living')
  if (porch) {
    const [x] = P(porch.x + porch.w / 2, 0), z0 = porch.y + porch.d - cz
    for (let z = z0 + 0.6; z < frontZ + yard; z += 0.75) box(scene, M.path, x + (R() - 0.5) * 0.08, 0.03, z, 1.1, 0.06, 0.5)
  }
  const tree = (x: number, z: number, s: number) => {
    const g = new THREE.Group()
    const th = 1.6 * s
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * s, 0.14 * s, th, 7), M.trunk)
    trunk.position.y = th / 2; trunk.castShadow = true; g.add(trunk)
    const n = 3 + Math.floor(R() * 3)
    for (let i = 0; i < n; i++) {
      const rr = (0.7 + R() * 0.5) * s
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(rr, 1), mat(T.leaves[Math.floor(R() * T.leaves.length)], { flatShading: true, roughness: 0.95 }))
      leaf.position.set((R() - 0.5) * 1.1 * s, th + rr * 0.6 + R() * 0.7 * s, (R() - 0.5) * 1.1 * s)
      leaf.castShadow = true; leaf.receiveShadow = true; g.add(leaf)
    }
    g.position.set(x, 0, z); scene.add(g)
  }
  const shrub = (x: number, z: number) => {
    const rr = 0.3 + R() * 0.25
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rr, 1), mat(T.shrub[Math.floor(R() * T.shrub.length)], { flatShading: true, roughness: 0.95 }))
    m.position.set(x, rr * 0.7, z); m.scale.y = 0.8; m.castShadow = true; m.receiveShadow = true; scene.add(m)
  }
  const hx = (ext.x1 - ext.x0) / 2, hz = (ext.y1 - ext.y0) / 2
  // ต้นไม้ใหญ่: หลังบ้านสองมุม + ข้างบ้านซ้าย + หน้าบ้านซ้าย (ไม่บังด้านหน้า/ด้านขวาที่กล้องมอง)
  tree(-hx - 2.2, -hz - 1.5, 1.25 + R() * 0.3)
  tree(hx + 1.8, -hz - 2.4, 1.1 + R() * 0.3)
  tree(-hx - 3.2, hz * 0.3, 1.0 + R() * 0.3)
  tree(-hx - 1.6, frontZ + yard * 0.7, 0.85 + R() * 0.2)
  tree(hx + 4.5, -hz + 1, 1.3 + R() * 0.3)
  // พุ่มไม้แนวหน้าบ้าน (เว้นช่องทางเดิน/ทางรถ)
  const gaps = ground0.filter((q) => q.type === 'carport' || q.type === 'porch').map((q) => [q.x - cx - 0.4, q.x + q.w - cx + 0.4])
  for (let x = -hx + 0.3; x < hx - 0.2; x += 0.75) {
    if (gaps.some(([a, b]) => x > a && x < b)) continue
    if (porch && Math.abs(x - (porch.x + porch.w / 2 - cx)) < 0.9) continue
    shrub(x, frontZ + 0.55 + R() * 0.15)
  }
  for (let z = -hz + 0.5; z < hz; z += 0.9) shrub(hx + 0.55, z)

  // ===== ท้องฟ้า แสง =====
  const sky = new THREE.Mesh(new THREE.SphereGeometry(span * 20, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(T.skyTop) }, mid: { value: new THREE.Color('#C3D8EA') }, bot: { value: new THREE.Color(T.fog) } },
    vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vp; void main(){ float h = max(vp.y, 0.0); vec3 c = mix(bot, mid, smoothstep(0.0, 0.12, h)); c = mix(c, top, smoothstep(0.12, 0.6, h)); gl_FragColor = vec4(c, 1.0); }',
  }))
  scene.add(sky)
  scene.background = new THREE.Color(T.fog)
  scene.fog = new THREE.Fog(T.fog, span * 2.5, span * 9)
  scene.add(new THREE.HemisphereLight('#E4EEFA', '#7C8C5E', 0.75))
  const sun = new THREE.DirectionalLight('#FFE1B5', 3.1)
  sun.position.set(span * 1.1, span * 1.05, span * 1.0)
  sun.castShadow = true
  sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02
  Object.assign(sun.shadow.camera, { left: -span * 1.8, right: span * 1.8, top: span * 1.8, bottom: -span * 1.8, near: 0.5, far: span * 6 })
  scene.add(sun)

  // ===== กล้อง: มุมหน้าบ้านเฉียงขวา ระดับสายตาสูงเล็กน้อย =====
  const camera = new THREE.PerspectiveCamera(30, aspect, 0.1, span * 30)
  const tall = roofTop > Math.max(hx, hz) * 1.3
  const target = new THREE.Vector3(0, roofTop * (tall ? 0.5 : 0.45), 0)
  const dir = new THREE.Vector3(0.6, 0.17, 1).normalize()
  const radius = Math.sqrt(hx * hx + hz * hz + (roofTop / 2) ** 2) + 0.8
  const fov = (camera.fov * Math.PI) / 180, hfov = 2 * Math.atan(Math.tan(fov / 2) * aspect)
  const dist = (radius / Math.sin(Math.min(fov, hfov) / 2)) * (tall ? 1.02 : 0.86)
  camera.position.copy(target).addScaledVector(dir, dist)
  camera.lookAt(target)
  // ปรับระยะให้ตัวบ้าน (ไม่รวมสวน) เต็มกรอบพอดี ~84% ของภาพ และอยู่กลางภาพ
  const hb = new THREE.Box3().setFromObject(house)
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new THREE.Vector3(i & 1 ? hb.max.x : hb.min.x, i & 2 ? hb.max.y : hb.min.y, i & 4 ? hb.max.z : hb.min.z))
  let d = dist
  for (let it = 0; it < 6; it++) {
    camera.position.copy(target).addScaledVector(dir, d); camera.lookAt(target); camera.updateMatrixWorld()
    const ndc = corners.map((c) => c.clone().project(camera))
    const x0 = Math.min(...ndc.map((p) => p.x)), x1 = Math.max(...ndc.map((p) => p.x)), y0 = Math.min(...ndc.map((p) => p.y)), y1 = Math.max(...ndc.map((p) => p.y))
    // เลื่อนจุดเล็งให้บ้านอยู่กลาง (ใต้กลางเล็กน้อย เผื่อท้องฟ้า)
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
    const halfH = Math.tan(fov / 2) * d, halfW = halfH * aspect
    target.addScaledVector(right, ((x0 + x1) / 2) * halfW).addScaledVector(up, ((y0 + y1) / 2 + 0.06) * halfH)
    d *= Math.max((x1 - x0) / 2 / 0.84, (y1 - y0) / 2 / 0.8)
  }
  camera.position.copy(target).addScaledVector(dir, d)
  camera.lookAt(target)
  const dispose = () => {
    scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose() })
    mats.forEach((m) => m.dispose()); extraMats.forEach((m) => m.dispose()); Object.values(M).forEach((m) => (m as THREE.Material).dispose?.())
  }
  return { scene, camera, dispose }
}

let shared: { renderer: THREE.WebGLRenderer; env: THREE.Texture } | null = null
function getRenderer() {
  if (shared) return shared
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const pm = new THREE.PMREMGenerator(renderer)
  const env = pm.fromScene(new RoomEnvironment(), 0.04).texture
  pm.dispose()
  shared = { renderer, env }
  return shared
}

/** วาดภาพนิ่ง → คืน canvas ขนาด w×h (วาดที่ 2 เท่าแล้วย่อ ให้ขอบเนียน) พร้อมคำกำกับ "ภาพจำลอง" มุมล่าง */
export function renderStill(layout: Layout, w = 1500, h = 1000, seed = 1, caption = 'ภาพจำลองเพื่อการนำเสนอ · PPSD', colors?: { wall?: string; roof?: string }) {
  const { renderer, env } = getRenderer()
  const ok = (c?: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : undefined)
  T = { ...TONE, wall: ok(colors?.wall) || TONE.wall, roof: ok(colors?.roof) || TONE.roof }
  let built: ReturnType<typeof buildPrettyScene>
  try { built = buildPrettyScene(layout, w / h, seed) } finally { T = TONE }
  const { scene, camera, dispose } = built
  scene.environment = env
  scene.environmentIntensity = 0.45
  renderer.setPixelRatio(1)
  renderer.setSize(w * 2, h * 2, false)
  renderer.render(scene, camera)
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  g.drawImage(renderer.domElement, 0, 0, w, h)
  dispose()
  if (caption) {
    const fs = Math.max(11, Math.round(w / 75))
    g.font = `500 ${fs}px Kanit, Tahoma, sans-serif`; g.textAlign = 'right'; g.textBaseline = 'bottom'
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillText(caption, w - fs + 1, h - fs * 0.7 + 1)
    g.fillStyle = 'rgba(255,255,255,.92)'; g.fillText(caption, w - fs, h - fs * 0.7)
  }
  return c
}
