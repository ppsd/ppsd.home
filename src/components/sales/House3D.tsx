import { useEffect, useRef, useState } from 'react'
import type * as T from 'three'
import { OUTDOOR, ROOM_COLOR, computeWalls, bbox, type Layout, type Room } from './houseGeom'
import { downloadDataUrl } from './HousePlan'

// ภาพ 3D หมุนดูได้ (three.js โหลดเฉพาะตอนเปิดหน้านี้) — ขึ้นจากผังห้องชุดเดียวกับแปลน: ผนัง ประตู หน้าต่าง พื้น หลังคา
// ลากเมาส์/นิ้ว = หมุน · ล้อเมาส์/หยิกนิ้ว = ซูม · คลิกขวา/สองนิ้ว = เลื่อน
// ปุ่ม: ซ่อนหลังคา (ดูภายในพร้อมชื่อห้อง) · ดูทีละชั้น · มุมหน้าบ้าน/มุมบน · บันทึกภาพ
const PLINTH = 0.45 // พื้นชั้นล่างยกจากดิน
const DOOR_H = 2.1, SILL = 0.9, HEAD = 2.1
const PITCH = Math.tan((27 * Math.PI) / 180)

interface Props { layout: Layout; title: string; land?: { w: number; d: number } }
type Show = 'all' | number

export default function House3D({ layout, title, land }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{ setView: (roof: boolean, show: Show) => void; camera: (mode: 'front' | 'top') => void; snap: () => string } | null>(null)
  const [roof, setRoof] = useState(true)
  const [show, setShow] = useState<Show>('all')
  const [err, setErr] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let disposed = false
    let cleanup = () => {}
    ;(async () => {
      try {
        const THREE = await import('three')
        const { OrbitControls } = await import('three/addons/controls/OrbitControls.js')
        if (disposed || !host.current) return
        const el = host.current
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
        el.appendChild(renderer.domElement)
        renderer.domElement.style.display = 'block'
        renderer.domElement.style.width = '100%'
        renderer.domElement.style.height = '100%'
        renderer.domElement.style.touchAction = 'none'
        const scene = new THREE.Scene()
        scene.background = new THREE.Color('#DCE8F2')
        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500)
        const controls = new OrbitControls(camera, renderer.domElement)
        controls.maxPolarAngle = Math.PI * 0.49
        controls.minDistance = 3; controls.maxDistance = 120

        const all = layout.floors.flatMap((f) => f.rooms)
        const ext = bbox(all)
        const cx = (ext.x0 + ext.x1) / 2, cz = (ext.y0 + ext.y1) / 2
        const span = Math.max(ext.x1 - ext.x0, ext.y1 - ext.y0, 6)
        const P = (x: number, y: number) => [x - cx, y - cz] as const

        const mats = new Map<string, T.Material>()
        const mat = (color: string, extra: Partial<T.MeshStandardMaterialParameters> = {}) => {
          const k = color + JSON.stringify(extra)
          if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra }))
          return mats.get(k)!
        }
        const extWall = mat(layout.wall_color || '#F2EFE8')
        const intWall = mat('#FBFAF7')
        const glass = mat('#8FBCD8', { transparent: true, opacity: 0.45, roughness: 0.1 })
        const roofMat = mat(layout.roof_color || '#5B4A42', { side: THREE.DoubleSide, roughness: 0.7 })
        const postMat = mat('#E9E6DF')
        const box = (g: T.Object3D, m: T.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
          if (sx <= 0.001 || sy <= 0.001 || sz <= 0.001) return
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m)
          mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true
          g.add(mesh)
        }

        // พื้นดิน + แนวเขตที่ดิน (ถ้ากรอก) วางตัวบ้านกลางที่ดิน
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(span * 8, span * 8), mat('#C9DDB0'))
        ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true
        scene.add(ground)
        if (land && land.w > 0 && land.d > 0) {
          const pts = [[-land.w / 2, -land.d / 2], [land.w / 2, -land.d / 2], [land.w / 2, land.d / 2], [-land.w / 2, land.d / 2], [-land.w / 2, -land.d / 2]].map(([x, z]) => new THREE.Vector3(x, 0.02, z))
          scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#7A6A3A' })))
        }

        const floorGroups = new Map<number, T.Group>()
        const labelGroups = new Map<number, T.Group>()
        const roofGroup = new THREE.Group()
        scene.add(roofGroup)
        const label = (text: string) => {
          const c = document.createElement('canvas'); c.width = 512; c.height = 128
          const g = c.getContext('2d')!
          g.font = "600 64px Kanit, Tahoma, sans-serif"
          const w = Math.min(508, g.measureText(text).width + 40)
          g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.roundRect((512 - w) / 2, 16, w, 96, 20); g.fill()
          g.fillStyle = '#26313A'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 66, 490)
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }))
          sp.scale.set(3.6, 0.9, 1); sp.renderOrder = 10
          return sp
        }

        let elev = PLINTH
        const tops: number[] = []
        layout.floors.forEach((f, fi) => {
          const g = new THREE.Group(), lg = new THREE.Group()
          floorGroups.set(f.level, g); labelGroups.set(f.level, lg)
          scene.add(g); scene.add(lg)
          const h = f.height
          const indoor = f.rooms.filter((r) => !OUTDOOR.has(r.type))
          // พื้นแต่ละห้อง (ชั้นล่างมีฐานยกจากดิน)
          for (const r of f.rooms) {
            const [x, z] = P(r.x + r.w / 2, r.y + r.d / 2)
            const out = OUTDOOR.has(r.type)
            const top = fi === 0 ? (r.type === 'carport' || r.type === 'terrace' ? 0.08 : out ? PLINTH - 0.15 : elev) : elev
            if (fi === 0) box(g, mat('#C8C3BA'), x, top / 2, z, r.w, top, r.d)
            box(g, mat(ROOM_COLOR[r.type] || '#EEE'), x, top + 0.03, z, r.w, 0.06, r.d)
            if (!out) { const sp = label(r.name); sp.position.set(x, elev + 1.2, z); lg.add(sp) }
          }
          // ผนัง + ช่องประตู/หน้าต่าง
          for (const w of computeWalls(f.rooms)) {
            const t = w.exterior ? 0.2 : 0.1, m = w.exterior ? extWall : intWall
            const piece = (a: number, b: number, y0: number, y1: number, mm: T.Material = m, th = t) => {
              const mid = (a + b) / 2, len = b - a
              if (w.horiz) { const [x, z] = P(mid, w.line); box(g, mm, x, elev + (y0 + y1) / 2, z, len, y1 - y0, th) }
              else { const [x, z] = P(w.line, mid); box(g, mm, x, elev + (y0 + y1) / 2, z, th, y1 - y0, len) }
            }
            let p = w.a - t / 2
            for (const o of w.openings) {
              piece(p, o.a, 0, h)
              if (o.kind === 'window') { piece(o.a, o.b, 0, SILL); piece(o.a, o.b, HEAD, h); piece(o.a, o.b, SILL, HEAD, glass, 0.03) }
              else piece(o.a, o.b, DOOR_H, h)
              p = o.b
            }
            piece(p, w.b + t / 2, 0, h)
          }
          // ระเบียงชั้นบน: ราวกันตกกระจกด้านที่ไม่ติดห้อง
          for (const r of f.rooms.filter((x) => x.type === 'balcony')) {
            const edges: [number, number, number, number][] = [[r.x, r.y, r.x + r.w, r.y], [r.x, r.y + r.d, r.x + r.w, r.y + r.d], [r.x, r.y, r.x, r.y + r.d], [r.x + r.w, r.y, r.x + r.w, r.y + r.d]]
            for (const [x0, y0, x1, y1] of edges) {
              const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
              const nx = x0 === x1 ? (x0 === r.x ? -0.1 : 0.1) : 0, ny = y0 === y1 ? (y0 === r.y ? -0.1 : 0.1) : 0
              if (indoor.some((q) => mx + nx > q.x && mx + nx < q.x + q.w && my + ny > q.y && my + ny < q.y + q.d)) continue
              const [x, z] = P(mx, my)
              box(g, glass, x, elev + 0.5, z, x0 === x1 ? 0.04 : x1 - x0, 1, y0 === y1 ? 0.04 : y1 - y0)
            }
          }
          tops.push(elev + h)
          elev += h
        })

        // หลังคา: ชั้นบนสุดตามรูปแบบที่เลือก · ส่วนชั้นล่างที่ไม่มีชั้นบนทับ = หลังคาเรียบ · ระเบียง/ที่จอดรถชั้นล่าง = หลังคาคลุม + เสา
        const coveredBy = (r: Room, upper: Room[]) => upper.some((u) => r.x + r.w / 2 > u.x && r.x + r.w / 2 < u.x + u.w && r.y + r.d / 2 > u.y && r.y + r.d / 2 < u.y + u.d)
        layout.floors.forEach((f, fi) => {
          const upper = layout.floors.slice(fi + 1).flatMap((u) => u.rooms.filter((x) => !OUTDOOR.has(x.type)))
          const top = tops[fi]
          const isTop = fi === layout.floors.length - 1
          for (const r of f.rooms) {
            if (coveredBy(r, upper)) continue
            const [x, z] = P(r.x + r.w / 2, r.y + r.d / 2)
            if (r.type === 'porch' || r.type === 'carport') {
              const ch = r.type === 'carport' ? 2.7 : top - 0.1
              const target = roofGroup // หลังคาคลุม/เสา ซ่อนพร้อมหลังคา (ดูภายในได้ไม่บัง)
              box(target, roofMat, x, ch, z, r.w + 0.3, 0.16, r.d + 0.3)
              for (const [px, pz] of [[r.x + 0.15, r.y + 0.15], [r.x + r.w - 0.15, r.y + 0.15], [r.x + 0.15, r.y + r.d - 0.15], [r.x + r.w - 0.15, r.y + r.d - 0.15]]) {
                const [qx, qz] = P(px, pz)
                if (f.rooms.some((q) => !OUTDOOR.has(q.type) && px > q.x - 0.3 && px < q.x + q.w + 0.3 && pz > q.y - 0.3 && pz < q.y + q.d + 0.3)) continue
                box(target, postMat, qx, ch / 2, qz, 0.18, ch, 0.18)
              }
            } else if (!OUTDOOR.has(r.type) && !isTop) box(roofGroup, roofMat, x, top + 0.1, z, r.w + 0.3, 0.2, r.d + 0.3)
          }
        })
        const topRooms = layout.floors[layout.floors.length - 1].rooms.filter((r) => !OUTDOOR.has(r.type))
        if (topRooms.length) {
          const b = bbox(topRooms), oh = 0.6
          const W = b.x1 - b.x0 + oh * 2, D = b.y1 - b.y0 + oh * 2
          const [x, z] = P((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)
          const y = tops[tops.length - 1]
          const alongX = W >= D, L = alongX ? W : D, s = alongX ? D : W, hr = (s / 2) * PITCH
          let geo: T.BufferGeometry
          if (layout.roof === 'flat') {
            box(roofGroup, roofMat, x, y + 0.2, z, W - oh * 1.2, 0.4, D - oh * 1.2)
          } else {
            if (layout.roof === 'hip') {
              const r = Math.max(0, (L - s) / 2)
              const c = [[-L / 2, 0, -s / 2], [L / 2, 0, -s / 2], [L / 2, 0, s / 2], [-L / 2, 0, s / 2]], r1 = [-r, hr, 0], r2 = [r, hr, 0]
              const tri = [c[3], c[2], r2, c[3], r2, r1, c[1], c[0], r1, c[1], r1, r2, c[0], c[3], r1, c[2], c[1], r2].flat()
              geo = new THREE.BufferGeometry()
              geo.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3))
              if (!alongX) geo.rotateY(Math.PI / 2) // สร้างโดยสันหลังคาตามแกน x → หมุนถ้าบ้านยาวตามแกน z
            } else {
              const sh = new THREE.Shape([new THREE.Vector2(-s / 2, 0), new THREE.Vector2(s / 2, 0), new THREE.Vector2(0, hr)])
              geo = new THREE.ExtrudeGeometry(sh, { depth: L, bevelEnabled: false })
              geo.translate(0, 0, -L / 2) // สันหลังคาตามแกน z
              if (alongX) geo.rotateY(Math.PI / 2)
            }
            geo.computeVertexNormals()
            const m = new THREE.Mesh(geo, roofMat)
            m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true
            roofGroup.add(m)
          }
        }

        // แสง
        scene.add(new THREE.HemisphereLight('#FFFFFF', '#8A9A70', 1.4))
        const sun = new THREE.DirectionalLight('#FFF4E0', 2.2)
        sun.position.set(span * 0.9, span * 1.4, span * 1.1)
        sun.castShadow = true
        sun.shadow.mapSize.set(2048, 2048)
        Object.assign(sun.shadow.camera, { left: -span * 1.5, right: span * 1.5, top: span * 1.5, bottom: -span * 1.5, near: 0.5, far: span * 6 })
        scene.add(sun)

        const render = () => renderer.render(scene, camera)
        const totalH = tops[tops.length - 1] || 3
        const setCam = (mode: 'front' | 'top') => {
          if (mode === 'top') camera.position.set(0.01, span * 2.1, span * 0.35)
          else camera.position.set(span * 0.95, totalH + span * 0.45, span * 1.45)
          controls.target.set(0, totalH * 0.4, 0)
          controls.update(); render()
        }
        const resize = () => {
          const w = el.clientWidth || 600, hh = el.clientHeight || 420
          renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix(); render()
        }
        controls.addEventListener('change', render)
        const ro = new ResizeObserver(resize); ro.observe(el)
        resize(); setCam('front')

        api.current = {
          setView: (roofOn, sh) => {
            const lv = sh === 'all' ? Infinity : sh
            for (const [level, g] of floorGroups) g.visible = level <= lv
            const roofVisible = roofOn && sh === 'all'
            roofGroup.visible = roofVisible
            for (const [level, lg] of labelGroups) lg.visible = !roofVisible && level === Math.min(lv, layout.floors.length)
            render()
          },
          camera: setCam,
          snap: () => {
            render()
            const src = renderer.domElement
            const c = document.createElement('canvas'); c.width = src.width; c.height = src.height
            const g = c.getContext('2d')!
            g.drawImage(src, 0, 0)
            const fs = Math.max(14, Math.round(c.width / 60))
            g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, c.height - fs * 2.6, c.width, fs * 2.6)
            g.fillStyle = '#26313A'; g.font = `600 ${fs}px Kanit, Tahoma, sans-serif`; g.textBaseline = 'middle'
            g.fillText(`${title} — PPSD Construction`, fs, c.height - fs * 1.3)
            g.fillStyle = '#C24036'; g.font = `${Math.round(fs * 0.8)}px Kanit, Tahoma, sans-serif`; g.textAlign = 'right'
            g.fillText('ภาพจำลองแบบร่างเบื้องต้น ไม่ใช่แบบก่อสร้าง', c.width - fs, c.height - fs * 1.3)
            return c.toDataURL('image/png')
          },
        }
        setReady(true)
        cleanup = () => {
          ro.disconnect(); controls.dispose()
          scene.traverse((o) => {
            const m = o as T.Mesh
            if (m.geometry) m.geometry.dispose()
            const sm = (o as T.Sprite).material as T.SpriteMaterial | undefined
            if (o instanceof THREE.Sprite && sm?.map) { sm.map.dispose(); sm.dispose() }
          })
          mats.forEach((m) => m.dispose())
          renderer.dispose(); renderer.domElement.remove()
          api.current = null
        }
      } catch (e) {
        setErr('เปิดภาพ 3D ไม่ได้ในเครื่องนี้ (' + ((e as Error).message || 'WebGL') + ')')
      }
    })()
    return () => { disposed = true; cleanup(); setReady(false) }
  }, [layout, title, land?.w, land?.d])

  useEffect(() => { if (ready) api.current?.setView(roof, show) }, [ready, roof, show])

  const b = (active: boolean): React.CSSProperties => ({ fontFamily: 'inherit', fontSize: 12.5, padding: '6px 11px', borderRadius: 8, cursor: 'pointer', border: '1px solid ' + (active ? '#30506A' : '#D2DAE1'), background: active ? '#30506A' : '#fff', color: active ? '#fff' : '#30506A' })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <button style={b(show === 'all')} onClick={() => setShow('all')}>ทั้งหลัง</button>
        {layout.floors.map((f) => <button key={f.level} style={b(show === f.level)} onClick={() => setShow(f.level)}>ชั้น {f.level}</button>)}
        <button style={b(!roof)} onClick={() => setRoof((v) => !v)} disabled={show !== 'all'}>{roof ? 'ซ่อนหลังคา' : 'แสดงหลังคา'}</button>
        <span style={{ flex: 1 }} />
        <button style={b(false)} onClick={() => api.current?.camera('front')}>มุมหน้าบ้าน</button>
        <button style={b(false)} onClick={() => api.current?.camera('top')}>มุมบน</button>
        <button style={b(false)} disabled={!ready} onClick={() => { const u = api.current?.snap(); if (u) downloadDataUrl(u, `${title}-3D.png`) }}>⬇ บันทึกภาพ</button>
      </div>
      <div ref={host} style={{ position: 'relative', width: '100%', height: 'min(62vh, 520px)', minHeight: 320, borderRadius: 10, overflow: 'hidden', background: '#DCE8F2' }}>
        {!ready && !err && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5C6770', fontSize: 13 }}>กำลังสร้างภาพ 3D…</div>}
        {err && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C24036', fontSize: 13, padding: 16, textAlign: 'center' }}>{err}</div>}
      </div>
      <div style={{ fontSize: 11.5, color: '#94A0A8' }}>ลากเพื่อหมุน · ล้อเมาส์หรือหยิกนิ้วเพื่อซูม · คลิกขวาหรือใช้สองนิ้วลากเพื่อเลื่อน · ซ่อนหลังคาเพื่อดูภายในพร้อมชื่อห้อง</div>
    </div>
  )
}
