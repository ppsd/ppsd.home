import { forwardRef } from 'react'
import { ROOM_COLOR, OUTDOOR, computeWalls, bbox, fmtM, type Layout } from './houseGeom'

// แปลนบ้าน 1 ชั้น (SVG) — วาดจากผังห้อง: ผนังภายนอกหนา ผนังภายในบาง ประตูมีเส้นวงเปิด หน้าต่างเส้นคู่ บันไดมีขั้น
// ขนาดกำกับรอบนอก (ช่วงห้อง + ยาวรวม) · ทิศเหนือ · ด้านหน้าบ้าน · กรอบชื่อแบบ + "แบบร่างเบื้องต้น ไม่ใช่แบบก่อสร้าง"
const S = 50 // พิกเซลต่อเมตร (ใช้ตัวเลขใหญ่ เลี่ยงปัญหาเบราว์เซอร์บังคับขนาดตัวอักษรขั้นต่ำ)
const M = 2.4 // ขอบรอบแปลน (เมตร) สำหรับเส้นบอกขนาด
const TB = 1.7 // ความสูงกรอบชื่อแบบด้านล่าง (เมตร)
const FONT = "Kanit, Tahoma, 'Noto Sans Thai', sans-serif"

interface Props { layout: Layout; level: number; title: string; subtitle?: string }

const HousePlan = forwardRef<SVGSVGElement, Props>(function HousePlan({ layout, level, title, subtitle }, ref) {
  const floor = layout.floors.find((f) => f.level === level) || layout.floors[0]
  const all = layout.floors.flatMap((f) => f.rooms)
  const ext = bbox(all) // ทุกชั้นใช้กรอบเดียวกัน → แปลนแต่ละชั้นซ้อนตรงกัน
  const rooms = floor?.rooms || []
  const walls = computeWalls(rooms)
  const W = (ext.x1 - ext.x0 + M * 2) * S, H = (ext.y1 - ext.y0 + M * 2 + TB) * S
  const X = (v: number) => (v - ext.x0 + M) * S, Y = (v: number) => (v - ext.y0 + M) * S
  const fb = bbox(rooms)
  const indoor = rooms.filter((r) => !OUTDOOR.has(r.type)).reduce((s, r) => s + r.w * r.d, 0)
  const outdoor = rooms.filter((r) => OUTDOOR.has(r.type)).reduce((s, r) => s + r.w * r.d, 0)

  // เส้นบอกขนาดแบบต่อเนื่อง (chain) + ยาวรวม
  const xs = [...new Set(rooms.flatMap((r) => [r.x, r.x + r.w]).map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b)
  const ys = [...new Set(rooms.flatMap((r) => [r.y, r.y + r.d]).map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b)
  const dimC = '#6B7A86'
  const tick = (x: number, y: number) => <line x1={x - 5} y1={y + 5} x2={x + 5} y2={y - 5} stroke={dimC} strokeWidth={1.4} />
  const hDim = (vals: number[], yy: number, big = false) => (
    <g>
      <line x1={X(vals[0])} y1={Y(yy)} x2={X(vals[vals.length - 1])} y2={Y(yy)} stroke={dimC} strokeWidth={1} />
      {vals.map((v, i) => <g key={i}>{tick(X(v), Y(yy))}<line x1={X(v)} y1={Y(yy) - 6} x2={X(v)} y2={Y(yy) + 6} stroke={dimC} strokeWidth={0.8} /></g>)}
      {vals.slice(1).map((v, i) => v - vals[i] >= 0.7 && (
        <text key={i} x={(X(v) + X(vals[i])) / 2} y={Y(yy) - 6} textAnchor="middle" fontSize={big ? 16 : 13} fontWeight={big ? 600 : 400} fill={dimC} fontFamily={FONT}>{fmtM(v - vals[i])}</text>
      ))}
    </g>
  )
  const vDim = (vals: number[], xx: number, big = false) => (
    <g>
      <line x1={X(xx)} y1={Y(vals[0])} x2={X(xx)} y2={Y(vals[vals.length - 1])} stroke={dimC} strokeWidth={1} />
      {vals.map((v, i) => <g key={i}>{tick(X(xx), Y(v))}<line x1={X(xx) - 6} y1={Y(v)} x2={X(xx) + 6} y2={Y(v)} stroke={dimC} strokeWidth={0.8} /></g>)}
      {vals.slice(1).map((v, i) => v - vals[i] >= 0.7 && (
        <text key={i} x={X(xx) - 6} y={(Y(v) + Y(vals[i])) / 2} textAnchor="middle" fontSize={big ? 16 : 13} fontWeight={big ? 600 : 400} fill={dimC} fontFamily={FONT}
          transform={`rotate(-90 ${X(xx) - 6} ${(Y(v) + Y(vals[i])) / 2})`}>{fmtM(v - vals[i])}</text>
      ))}
    </g>
  )

  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', background: '#fff', maxHeight: '75vh' }}>
      <rect x={0} y={0} width={W} height={H} fill="#fff" />
      {/* พื้นห้อง */}
      {rooms.map((r, i) => {
        const out = OUTDOOR.has(r.type)
        return <rect key={i} x={X(r.x)} y={Y(r.y)} width={r.w * S} height={r.d * S} fill={ROOM_COLOR[r.type] || '#EEE'} stroke={out ? '#98A4AC' : 'none'} strokeWidth={out ? 1.5 : 0} strokeDasharray={out ? '8 6' : undefined} />
      })}
      {/* บันได: เส้นขั้นตามแนวยาว + ลูกศรทางขึ้น */}
      {rooms.filter((r) => r.type === 'stair').map((r, i) => {
        const along = r.d >= r.w, n = Math.max(4, Math.floor((along ? r.d : r.w) / 0.28))
        const lines = Array.from({ length: n - 1 }, (_x, k) => {
          const t = (k + 1) / n
          return along ? <line key={k} x1={X(r.x)} x2={X(r.x + r.w)} y1={Y(r.y + r.d * t)} y2={Y(r.y + r.d * t)} stroke="#A39C90" strokeWidth={1} />
            : <line key={k} y1={Y(r.y)} y2={Y(r.y + r.d)} x1={X(r.x + r.w * t)} x2={X(r.x + r.w * t)} stroke="#A39C90" strokeWidth={1} />
        })
        const cx = X(r.x + r.w / 2), cy = Y(r.y + r.d / 2)
        return <g key={'st' + i}>{lines}{along
          ? <path d={`M${cx} ${Y(r.y + r.d - 0.3)} L${cx} ${Y(r.y + 0.4)} M${cx - 6} ${Y(r.y + 0.6)} L${cx} ${Y(r.y + 0.4)} L${cx + 6} ${Y(r.y + 0.6)}`} stroke="#6B645A" strokeWidth={1.6} fill="none" />
          : <path d={`M${X(r.x + 0.3)} ${cy} L${X(r.x + r.w - 0.4)} ${cy} M${X(r.x + r.w - 0.6)} ${cy - 6} L${X(r.x + r.w - 0.4)} ${cy} L${X(r.x + r.w - 0.6)} ${cy + 6}`} stroke="#6B645A" strokeWidth={1.6} fill="none" />}</g>
      })}
      {/* ผนัง (เว้นช่องประตู/หน้าต่าง) */}
      {walls.map((w, i) => {
        const segs: [number, number][] = []
        let p = w.a
        for (const o of w.openings) { if (o.a > p) segs.push([p, o.a]); p = o.b }
        if (w.b > p) segs.push([p, w.b])
        const sw = (w.exterior ? 0.22 : 0.12) * S
        return segs.map(([a, b], k) => w.horiz
          ? <line key={i + '-' + k} x1={X(a)} x2={X(b)} y1={Y(w.line)} y2={Y(w.line)} stroke="#26313A" strokeWidth={sw} strokeLinecap="square" />
          : <line key={i + '-' + k} y1={Y(a)} y2={Y(b)} x1={X(w.line)} x2={X(w.line)} stroke="#26313A" strokeWidth={sw} strokeLinecap="square" />)
      })}
      {/* ประตู (บาน + เส้นวงเปิด) และหน้าต่าง (เส้นคู่) */}
      {walls.flatMap((w, i) => w.openings.map((o, k) => {
        const L = o.b - o.a, key = `o${i}-${k}`
        if (o.kind === 'window') {
          const t = (w.exterior ? 0.22 : 0.12) / 2
          return w.horiz
            ? <g key={key}><rect x={X(o.a)} y={Y(w.line - t)} width={L * S} height={t * 2 * S} fill="#fff" stroke="#26313A" strokeWidth={1.2} /><line x1={X(o.a)} x2={X(o.b)} y1={Y(w.line)} y2={Y(w.line)} stroke="#4E8DB8" strokeWidth={2} /></g>
            : <g key={key}><rect y={Y(o.a)} x={X(w.line - t)} height={L * S} width={t * 2 * S} fill="#fff" stroke="#26313A" strokeWidth={1.2} /><line y1={Y(o.a)} y2={Y(o.b)} x1={X(w.line)} x2={X(w.line)} stroke="#4E8DB8" strokeWidth={2} /></g>
        }
        const c = o.kind === 'entry' ? '#9C5A2E' : '#5C6770'
        if (w.horiz) {
          const ly = w.line + o.into * L
          return <g key={key}><line x1={X(o.a)} y1={Y(w.line)} x2={X(o.a)} y2={Y(ly)} stroke={c} strokeWidth={2} />
            <path d={`M${X(o.a)} ${Y(ly)} A${L * S} ${L * S} 0 0 ${o.into > 0 ? 0 : 1} ${X(o.b)} ${Y(w.line)}`} fill="none" stroke={c} strokeWidth={1} strokeDasharray="4 3" /></g>
        }
        const lx = w.line + o.into * L
        return <g key={key}><line y1={Y(o.a)} x1={X(w.line)} y2={Y(o.a)} x2={X(lx)} stroke={c} strokeWidth={2} />
          <path d={`M${X(lx)} ${Y(o.a)} A${L * S} ${L * S} 0 0 ${o.into > 0 ? 1 : 0} ${X(w.line)} ${Y(o.b)}`} fill="none" stroke={c} strokeWidth={1} strokeDasharray="4 3" /></g>
      }))}
      {/* ชื่อห้อง + ขนาด */}
      {rooms.map((r, i) => {
        const small = Math.min(r.w, r.d) < 1.8
        const fs = small ? 13 : 17, cx = X(r.x + r.w / 2), cy = Y(r.y + r.d / 2)
        const vertical = r.w < 1.4 && r.d > r.w * 1.6
        return <g key={'t' + i} transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined} fontFamily={FONT} textAnchor="middle">
          <text x={cx} y={cy - 2} fontSize={fs} fontWeight={600} fill="#26313A">{r.name}</text>
          <text x={cx} y={cy + fs} fontSize={fs - 3.5} fill="#5C6770">{fmtM(r.w)}×{fmtM(r.d)} ม.</text>
        </g>
      })}
      {/* ขนาดกำกับ */}
      {xs.length > 1 && hDim(xs, ext.y0 - 0.9)}
      {xs.length > 1 && hDim([fb.x0, fb.x1], ext.y0 - 1.7, true)}
      {ys.length > 1 && vDim(ys, ext.x0 - 0.9)}
      {ys.length > 1 && vDim([fb.y0, fb.y1], ext.x0 - 1.7, true)}
      {/* ทิศเหนือ — ด้านล่างของแปลน = หน้าบ้าน หันไปทิศ layout.facing (องศา · ไม่ระบุ = ใต้) → หมุนลูกศรให้ชี้ทิศเหนือจริง */}
      <g transform={`translate(${W - 1.2 * S} ${0.9 * S}) rotate(${180 - (layout.facing ?? 180)})`} fontFamily={FONT}>
        <circle r={20} fill="none" stroke="#5C6770" strokeWidth={1.2} />
        <path d="M0 -17 L7 8 L0 3 L-7 8 Z" fill="#26313A" />
        <text y={-24} textAnchor="middle" fontSize={13} fontWeight={600} fill="#26313A" transform={`rotate(${(layout.facing ?? 180) - 180} 0 -28)`}>N</text>
      </g>
      <text x={X((ext.x0 + ext.x1) / 2)} y={Y(ext.y1 + 0.75)} textAnchor="middle" fontSize={14} fill="#6B7A86" fontFamily={FONT}>▼ ด้านหน้าบ้าน (ทางเข้า / ถนน) ▼</text>
      {/* กรอบชื่อแบบ */}
      <g fontFamily={FONT}>
        <line x1={0.4 * S} x2={W - 0.4 * S} y1={H - TB * S + 0.2 * S} y2={H - TB * S + 0.2 * S} stroke="#C9D2D9" strokeWidth={1} />
        <text x={0.5 * S} y={H - TB * S + 0.75 * S} fontSize={19} fontWeight={700} fill="#26313A">{title} — แปลนชั้น {floor?.level}</text>
        <text x={0.5 * S} y={H - TB * S + 1.2 * S} fontSize={13} fill="#5C6770">
          {`พื้นที่ภายใน ${fmtM(indoor)} ตร.ม.${outdoor ? ` · ระเบียง/ที่จอดรถ ${fmtM(outdoor)} ตร.ม.` : ''}${subtitle ? ' · ' + subtitle : ''}`}
        </text>
        <text x={W - 0.5 * S} y={H - TB * S + 0.75 * S} fontSize={14} fontWeight={600} fill="#9C5A2E" textAnchor="end">PPSD Construction</text>
        <text x={W - 0.5 * S} y={H - TB * S + 1.2 * S} fontSize={12} fill="#C24036" textAnchor="end">แบบร่างเบื้องต้น ไม่ใช่แบบก่อสร้าง · ขนาดโดยประมาณ</text>
      </g>
    </svg>
  )
})
export default HousePlan

/** บันทึก SVG เป็นรูป PNG (ขยาย 2 เท่าให้คมพอส่ง LINE/พิมพ์) */
export async function saveSvgPng(svg: SVGSVGElement, name: string) {
  const vb = svg.viewBox.baseVal
  const xml = new XMLSerializer().serializeToString(svg)
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej })
  const c = document.createElement('canvas')
  c.width = vb.width * 2; c.height = vb.height * 2
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height)
  g.drawImage(img, 0, 0, c.width, c.height)
  downloadDataUrl(c.toDataURL('image/png'), name)
}
export function downloadDataUrl(url: string, name: string) {
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
}
