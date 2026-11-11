// ตัวแสดงแปลน + 3D สำหรับเว็บลูกค้า (public/web หน้า #custom) — ใช้คอมโพเนนต์เดียวกับหน้าออกแบบบ้านใน ERP
// build แยกด้วย vite.house.config.ts → dist/web/house/viewer.js (หน้าเว็บโหลดเฉพาะตอนได้ผลแบบ)
import { useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import HousePlan from '../components/sales/HousePlan'
import House3D from '../components/sales/House3D'
import type { Layout } from '../components/sales/houseGeom'

function Viewer({ layout, title, land }: { layout: Layout; title: string; land?: { w: number; d: number } }) {
  const [view, setView] = useState<'3d' | number>('3d')
  const b = (on: boolean): React.CSSProperties => ({ font: 'inherit', fontSize: 15, padding: '7px 16px', borderRadius: 6, border: 0, cursor: 'pointer', background: on ? '#1F3550' : '#EFE6D2', color: on ? '#fff' : '#1F3550' })
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" style={b(view === '3d')} onClick={() => setView('3d')}>ภาพ 3D</button>
        {layout.floors.map((f) => <button type="button" key={f.level} style={b(view === f.level)} onClick={() => setView(f.level)}>แปลนชั้น {f.level}</button>)}
      </div>
      {view === '3d'
        ? <House3D layout={layout} title={title} land={land} />
        : <div style={{ overflowX: 'auto', border: '1px solid #E2D8C3', borderRadius: 10 }}><HousePlan layout={layout} level={view} title={title} /></div>}
    </div>
  )
}

const roots = new WeakMap<HTMLElement, Root>()
function mount(el: HTMLElement, layout: Layout, title: string, land?: { w: number; d: number }) {
  let r = roots.get(el)
  if (!r) { r = createRoot(el); roots.set(el, r) }
  r.render(<Viewer layout={layout} title={title} land={land} />)
}
;(window as unknown as { PPSDHouse: unknown }).PPSDHouse = { mount }
