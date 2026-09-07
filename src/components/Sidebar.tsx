import { useEffect, useState } from 'react'
import Icon from './Icon'
import { nav, navGroups, deniedPages } from '../data'
import type { NavDef } from '../data'
import { PPSD_MARK } from '../assets'
import { useApp } from '../store'

interface SidebarProps {
  activePage: string
  onNavigate: (id: string) => void
}

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const { user } = useApp()
  const canFinance = user?.role === 'admin' || user?.role === 'accounting' || !!user?.isManager
  const canManager = !!user?.isManager
  const canHr = canFinance || user?.position === 'บุคคล'
  const canPms = user?.username === 'thawat' || user?.name === 'ธวัช วรรณสุข'
  const denied = deniedPages(user?.role === 'admin' ? [] : user?.deny_mods) // โมดูลที่แอดมินปิดสำหรับบัญชีนี้
  const visible = (item?: NavDef) => !!item && !denied.has(item.id) && (!item.gate || (item.gate === 'finance' ? canFinance : item.gate === 'hr' ? canHr : item.gate === 'pms' ? canPms : canManager))
  const byId = Object.fromEntries(nav.map((n) => [n.id, n]))

  // แผนกไหนมีเมนูที่มองเห็นได้บ้าง
  const groups = navGroups
    .map((g) => ({ ...g, its: g.items.map((id) => byId[id]).filter(visible) as NavDef[] }))
    .filter((g) => g.its.length > 0)
  const groupOf = (page: string) => groups.find((g) => g.its.some((i) => i.id === page))?.id

  // เปิดแผนกที่มีหน้าปัจจุบันอยู่ (ที่เหลือย่อไว้)
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({ [groupOf(activePage) || groups[0]?.id || '']: true }))
  useEffect(() => { const g = groupOf(activePage); if (g) setOpen((o) => (o[g] ? o : { ...o, [g]: true })) /* eslint-disable-next-line */ }, [activePage])
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }))

  const home = byId['houses'] // house-first: บ้าน เป็นเมนูหลักบนสุด
  const itemRow = (item: NavDef, indent: boolean) => {
    const active = activePage === item.id
    return (
      <div key={item.id} onClick={() => onNavigate(item.id)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: indent ? '8px 11px 8px 14px' : '9px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, background: active ? '#30506A' : 'transparent', color: active ? '#ffffff' : '#AEBAC4' }}>
        <Icon path={item.icon} size={indent ? 16 : 18} style={{ opacity: 0.95, flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
        {item.badge ? <span className="num" style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#fff', background: '#C24036', borderRadius: 20, padding: '1px 7px', minWidth: 20, textAlign: 'center' }}>{item.badge}</span> : null}
      </div>
    )
  }

  return (
    <aside style={{ width: 236, flexShrink: 0, background: '#1E2E3B', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '18px 18px 16px' }}>
        <img src={PPSD_MARK} alt="PPSD" style={{ width: 40, height: 40, borderRadius: 9, objectFit: 'cover', flexShrink: 0, boxShadow: '0 0 0 1px rgba(255,255,255,.08)' }} />
        <div className="sb-brand-text" style={{ lineHeight: 1.05 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', letterSpacing: '.3px' }}>PPSD</div>
          <div style={{ fontSize: 10.5, color: '#7C8B97', letterSpacing: '.05em' }}>CONSTRUCTION ERP</div>
        </div>
      </div>

      <div style={{ height: 1, background: '#2C3F4F', margin: '0 14px 8px' }} />

      <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {visible(home) && itemRow(home, false)}

        {groups.map((g) => {
          const isOpen = !!open[g.id]
          const hasActive = g.its.some((i) => i.id === activePage)
          return (
            <div key={g.id} style={{ marginTop: 4 }}>
              <div onClick={() => toggle(g.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, letterSpacing: '.02em', color: hasActive && !isOpen ? '#fff' : '#8FA0AD', textTransform: 'none' }}>
                <Icon path={g.icon} size={17} style={{ opacity: 0.9, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{g.label}</span>
                <span style={{ fontSize: 10, color: '#6E7F8C', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
              </div>
              {isOpen && <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginLeft: 8, paddingLeft: 8, borderLeft: '1px solid #2C3F4F' }}>{g.its.map((it) => itemRow(it, true))}</div>}
            </div>
          )
        })}
      </nav>

      <div style={{ padding: '12px 16px', borderTop: '1px solid #2C3F4F' }}>
        <div style={{ fontSize: 11, color: '#7C8B97', lineHeight: 1.5 }}>ปีงบประมาณ 2568<br /><span title="วัน-เวลาที่ build โปรแกรมเวอร์ชันนี้ — ถ้าไม่ตรงกับที่อัปเดตล่าสุด ให้รัน update.bat แล้วกด F5">เวอร์ชัน {__BUILD_STAMP__}</span></div>
      </div>
    </aside>
  )
}
