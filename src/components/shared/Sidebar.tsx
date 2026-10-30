import { useEffect, useState } from 'react'
import Icon from './Icon'
import { nav, navGroups, deniedPages, canPmsUser, isCeoUser } from '../../data'
import type { NavDef } from '../../data'
import { PPSD_MARK } from '../../assets'
import { useApp } from '../../store'
import { api } from '../../api'

interface SidebarProps {
  activePage: string
  onNavigate: (id: string) => void
  onClose?: () => void // ปิดเมนูแบบเลื่อนออก (จอแคบ)
  collapsed?: boolean // จอคอม: ย่อเมนูเหลือแถบไอคอน (จำค่าไว้ใน App)
  onToggleCollapse?: () => void
}
// จอคอม (≥ 1024px) เท่านั้นที่ย่อเป็นแถบไอคอนได้ — จอแคบเมนูเป็นลิ้นชักเลื่อนออกอยู่แล้ว
const DESKTOP_Q = '(min-width: 1024px)'
function useDesktop() {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(DESKTOP_Q).matches)
  useEffect(() => {
    const m = window.matchMedia(DESKTOP_Q)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}

export default function Sidebar({ activePage, onNavigate, onClose, collapsed = false, onToggleCollapse }: SidebarProps) {
  const { user } = useApp()
  const mini = useDesktop() && collapsed // แถบไอคอน
  // เช็คว่าเซิร์ฟเวอร์ที่รันอยู่เก่ากว่าไฟล์บนดิสก์ไหม (อัปเดตแล้วแต่ยังไม่รีสตาร์ท) — เตือน + ปุ่มรีสตาร์ท (แอดมิน)
  const [srv, setSrv] = useState<{ started: number; stale: boolean; pm2: boolean } | null>(null)
  const [restarting, setRestarting] = useState(false)
  useEffect(() => {
    let alive = true
    const check = () => api.get<{ started: number; stale: boolean; pm2: boolean }>('/version').then((v) => { if (alive) setSrv(v) }).catch(() => { if (alive) setSrv({ started: 0, stale: true, pm2: false }) })
    check(); const t = setInterval(check, 60000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  const restartServer = async () => {
    if (!window.confirm('รีสตาร์ทเซิร์ฟเวอร์ตอนนี้? ทุกคนจะใช้งานไม่ได้ประมาณ 5–10 วินาที')) return
    setRestarting(true)
    const before = srv?.started || 0
    try { await api.post('/restart', {}) } catch { /* server อาจปิดก่อนตอบ */ }
    // รอจน process ใหม่ขึ้น (started เปลี่ยน) แล้วโหลดหน้าใหม่
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 1500))
      try { const v = await api.get<{ started: number }>('/version'); if (v.started !== before) { window.location.reload(); return } } catch { /* ยังไม่ขึ้น */ }
    }
    setRestarting(false)
    window.alert('เซิร์ฟเวอร์ยังไม่กลับมา — ถ้าเปิดด้วย start.bat ให้ดับเบิลคลิก start.bat ใหม่ (ถ้าลง service ไว้จะเปิดเองใน 1 นาที)')
  }
  const canFinance = user?.role === 'admin' || user?.role === 'accounting' || !!user?.isManager
  const canManager = !!user?.isManager
  const canHr = canFinance || user?.position === 'บุคคล'
  const canPms = canPmsUser(user) // ประเมินผล KPI: CEO + ผู้ดูแลระบบ
  const canCeo = isCeoUser(user)  // สรุป QC ผู้บริหาร / สั่งงานด้วยเสียง: CEO + ผู้ดูแลระบบ
  const canVault = !!user?.vaultAllowed // คลังรหัสผ่าน: CEO + รายชื่อที่ CEO กำหนด (server ตัดสิน)
  const denied = deniedPages(user?.role === 'admin' ? [] : user?.deny_mods) // โมดูลที่แอดมินปิดสำหรับบัญชีนี้
  const visible = (item?: NavDef) => !!item && !denied.has(item.id) && (!item.gate || (item.gate === 'finance' ? canFinance : item.gate === 'hr' ? canHr : item.gate === 'pms' ? canPms : item.gate === 'ceo' ? canCeo : item.gate === 'vault' ? canVault : item.gate === 'admin' ? user?.role === 'admin' : canManager))
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
    if (mini) return (
      <div key={item.id} onClick={() => onNavigate(item.id)} title={item.label}
        style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 0', borderRadius: 8, cursor: 'pointer', background: active ? '#30506A' : 'transparent', color: active ? '#ffffff' : '#AEBAC4' }}>
        <Icon path={item.icon} size={18} style={{ opacity: 0.95 }} />
        {item.badge ? <span style={{ position: 'absolute', top: 5, right: 9, width: 8, height: 8, borderRadius: 4, background: '#C24036' }} /> : null}
      </div>
    )
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
    <aside className="sb" style={{ width: mini ? 64 : 236, flexShrink: 0, background: '#1E2E3B', display: 'flex', flexDirection: 'column', height: '100%', transition: 'width .18s ease' }}>
      <div style={{ display: 'flex', flexDirection: mini ? 'column' : 'row', alignItems: 'center', gap: mini ? 8 : 11, padding: mini ? '16px 0 12px' : '18px 18px 16px' }}>
        <img src={PPSD_MARK} alt="PPSD" style={{ width: mini ? 36 : 40, height: mini ? 36 : 40, borderRadius: 9, objectFit: 'cover', flexShrink: 0, boxShadow: '0 0 0 1px rgba(255,255,255,.08)' }} />
        {!mini && <div className="sb-brand-text" style={{ lineHeight: 1.05 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', letterSpacing: '.3px' }}>PPSD</div>
          <div style={{ fontSize: 10.5, color: '#7C8B97', letterSpacing: '.05em' }}>CONSTRUCTION ERP</div>
        </div>}
        {/* ปุ่มย่อ/ขยายเมนู (จอคอม) */}
        {onToggleCollapse && (
          <button className="sb-collapse" onClick={onToggleCollapse} title={mini ? 'ขยายเมนู' : 'ย่อเมนู'}
            style={{ marginLeft: mini ? 0 : 'auto', width: 30, height: 30, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,.06)', color: '#AEBAC4', cursor: 'pointer', alignItems: 'center', justifyContent: 'center' }}>
            {mini ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 17l5-5-5-5M6 17l5-5-5-5" /></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></svg>}
          </button>
        )}
        <button className="sb-close" onClick={onClose} title="ปิดเมนู" style={{ marginLeft: 'auto', width: 34, height: 34, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,.06)', color: '#AEBAC4', cursor: 'pointer', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div style={{ height: 1, background: '#2C3F4F', margin: mini ? '0 10px 8px' : '0 14px 8px' }} />

      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: mini ? '4px 8px' : '4px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {visible(home) && itemRow(home, false)}

        {groups.map((g) => {
          const isOpen = !!open[g.id]
          const hasActive = g.its.some((i) => i.id === activePage)
          if (mini) return (
            <div key={g.id} style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div onClick={() => { setOpen((o) => ({ ...o, [g.id]: true })); onToggleCollapse?.() }} title={g.label + ' — กดเพื่อขยายเมนู'}
                style={{ display: 'flex', justifyContent: 'center', padding: '9px 0', borderRadius: 8, cursor: 'pointer', color: hasActive ? '#fff' : '#8FA0AD', background: hasActive ? 'rgba(255,255,255,.06)' : 'transparent' }}>
                <Icon path={g.icon} size={18} style={{ opacity: 0.9 }} />
              </div>
              {hasActive && g.its.filter((it) => it.id === activePage).map((it) => itemRow(it, true))}
            </div>
          )
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

      {mini ? (
        <div style={{ padding: '10px 0', borderTop: '1px solid #2C3F4F', display: 'flex', justifyContent: 'center' }}>
          {srv?.stale
            ? <span title={srv.started ? 'อัปเดตโค้ดแล้ว แต่เซิร์ฟเวอร์ยังรันตัวเก่า — ขยายเมนูเพื่อรีสตาร์ท' : 'เซิร์ฟเวอร์เป็นเวอร์ชันเก่า'} onClick={onToggleCollapse} style={{ cursor: 'pointer', fontSize: 15 }}>⚠️</span>
            : <span title={'เวอร์ชัน ' + __BUILD_STAMP__} style={{ fontSize: 10, color: '#7C8B97' }}>v</span>}
        </div>
      ) : (
      <div style={{ padding: '12px 16px', borderTop: '1px solid #2C3F4F' }}>
        <div style={{ fontSize: 11, color: '#7C8B97', lineHeight: 1.5 }}>ปีงบประมาณ 2568<br /><span title="วัน-เวลาที่ build โปรแกรมเวอร์ชันนี้ — ถ้าไม่ตรงกับที่อัปเดตล่าสุด ให้รัน update.bat แล้วกด F5">เวอร์ชัน {__BUILD_STAMP__}</span></div>
        {srv?.stale && (
          <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.45, color: '#FFD9D4', background: 'rgba(194,64,54,.35)', border: '1px solid rgba(255,120,110,.5)', borderRadius: 8, padding: '7px 9px' }}>
            ⚠ {srv.started ? 'อัปเดตโค้ดแล้ว แต่เซิร์ฟเวอร์ยังรันตัวเก่า' : 'เซิร์ฟเวอร์เป็นเวอร์ชันเก่า (ไม่รู้จักหน้านี้)'}
            {user?.role === 'admin' && srv.started ? (
              <button onClick={restartServer} disabled={restarting} style={{ display: 'block', marginTop: 6, width: '100%', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, color: '#fff', background: '#C24036', border: 'none', borderRadius: 7, padding: '6px 8px', cursor: 'pointer' }}>{restarting ? 'กำลังรีสตาร์ท…' : '↻ รีสตาร์ทเซิร์ฟเวอร์'}</button>
            ) : <div style={{ marginTop: 3 }}>ให้แอดมินรีสตาร์ท (update.bat)</div>}
          </div>
        )}
      </div>
      )}
    </aside>
  )
}
