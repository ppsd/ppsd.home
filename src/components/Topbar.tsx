import { useState } from 'react'
import { roleLabel } from '../erpData'
import { useApp } from '../store'
import { api } from '../api'

interface TopbarProps {
  crumb: string
  pageTitle: string
  onNavigate: (id: string) => void
  onOpenHouse: (id: number) => void
  onChangePin: () => void
}

const notifColor = (icon: string) => (icon === 'danger' ? '#C24036' : icon === 'warn' ? '#B7791F' : '#30506A')

export default function Topbar({ crumb, pageTitle, onNavigate, onOpenHouse, onChangePin }: TopbarProps) {
  // ผูก LINE ของฉัน (ทุกคนกดได้ ไม่ต้องเข้าหน้าผู้ใช้งาน)
  const [lineCode, setLineCode] = useState<{ code: string; expires_min: number } | null>(null)
  const requestLineCode = async () => {
    if (lineCode) { setLineCode(null); return }
    try { setLineCode(await api.post<{ code: string; expires_min: number }>('/line-link/code', {})) } catch (e) { window.alert((e as Error).message) }
  }
  const { user, logout, data } = useApp()
  const notifs = data.notifications
  const [open, setOpen] = useState(false)

  // global search across houses + customers
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase()
  const houseHits = term
    ? data.houses.filter((h) => `${h.name} ${h.code} ${h.project} ${h.customer}`.toLowerCase().includes(term)).slice(0, 6)
    : []
  const custHits = term
    ? (data.customers || []).filter((c) => `${c.name} ${c.phone} ${c.project}`.toLowerCase().includes(term)).slice(0, 5)
    : []
  const hasHits = houseHits.length > 0 || custHits.length > 0
  return (
    <header
      style={{
        height: 60,
        flexShrink: 0,
        background: '#fff',
        borderBottom: '1px solid #E1E5EA',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: 20,
        zIndex: 5,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#94A0A8', lineHeight: 1.1 }}>{crumb}</div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            lineHeight: 1.2,
            color: '#1C2730',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {pageTitle}
        </div>
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div className="tb-search" style={{ position: 'relative', width: 250 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#F3F5F7',
              border: '1px solid #E1E5EA',
              borderRadius: 9,
              padding: '7px 12px',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A0A8" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาบ้าน / ลูกค้า"
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontFamily: 'inherit',
                fontSize: 13,
                color: '#1C2730',
                width: '100%',
              }}
            />
            {q && (
              <button onClick={() => setQ('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A0A8', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
            )}
          </div>
          {term && (
            <>
              <div onClick={() => setQ('')} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
              <div style={{ position: 'absolute', left: 0, top: 44, width: 320, maxHeight: 420, overflowY: 'auto', background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, boxShadow: '0 16px 50px rgba(20,30,40,.18)', zIndex: 31 }}>
                {!hasHits && <div style={{ padding: '22px 16px', textAlign: 'center', color: '#94A0A8', fontSize: 13 }}>ไม่พบผลลัพธ์</div>}
                {houseHits.length > 0 && <div style={{ padding: '8px 14px 4px', fontSize: 11, fontWeight: 600, color: '#94A0A8' }}>บ้าน</div>}
                {houseHits.map((h) => (
                  <div key={'h' + h.id} onClick={() => { onOpenHouse(h.id); setQ('') }} className="hov-fafbfc" style={{ padding: '9px 14px', cursor: 'pointer', borderTop: '1px solid #F1F4F6' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1C2730' }}>{h.name}</div>
                    <div style={{ fontSize: 11.5, color: '#94A0A8' }}>{h.code} · {h.project}</div>
                  </div>
                ))}
                {custHits.length > 0 && <div style={{ padding: '8px 14px 4px', fontSize: 11, fontWeight: 600, color: '#94A0A8' }}>ลูกค้า</div>}
                {custHits.map((c) => (
                  <div key={'c' + c.id} onClick={() => { onNavigate('customers'); setQ('') }} className="hov-fafbfc" style={{ padding: '9px 14px', cursor: 'pointer', borderTop: '1px solid #F1F4F6' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1C2730' }}>{c.name}</div>
                    <div style={{ fontSize: 11.5, color: '#94A0A8' }}>{c.phone || '—'} · {c.project || ''}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="hov-f3f5f7"
            style={{ position: 'relative', width: 38, height: 38, borderRadius: 9, border: '1px solid #E1E5EA', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5C6770" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.7 21a2 2 0 01-3.4 0" />
            </svg>
            {notifs.length > 0 && (
              <span className="num" style={{ position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 9, background: '#C24036', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #fff' }}>{notifs.length}</span>
            )}
          </button>
          {open && (
            <>
              <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
              <div style={{ position: 'absolute', right: 0, top: 46, width: 320, maxHeight: 420, overflowY: 'auto', background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, boxShadow: '0 16px 50px rgba(20,30,40,.18)', zIndex: 31 }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #EEF1F4', fontSize: 13.5, fontWeight: 600 }}>การแจ้งเตือน {notifs.length > 0 && <span className="num" style={{ color: '#C24036' }}>({notifs.length})</span>}</div>
                {notifs.length === 0 && <div style={{ padding: '28px 16px', textAlign: 'center', color: '#94A0A8', fontSize: 13 }}>ไม่มีการแจ้งเตือน</div>}
                {notifs.map((n, i) => (
                  <div key={i} onClick={() => { onNavigate(n.page); setOpen(false) }} className="hov-fafbfc" style={{ display: 'flex', gap: 10, padding: '11px 16px', borderTop: '1px solid #F1F4F6', cursor: 'pointer' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: notifColor(n.icon), marginTop: 5, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#1C2730' }}>{n.title}</div>
                      <div style={{ fontSize: 11.5, color: '#94A0A8' }}>{n.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ height: 26, width: 1, background: '#E1E5EA' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#30506A',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {user?.name?.[0] || '?'}
          </div>
          <div className="tb-profile" style={{ lineHeight: 1.15 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1C2730' }}>{user?.name}</div>
            <div style={{ fontSize: 11, color: '#C0852C', fontWeight: 500 }}>{user ? roleLabel[user.role] : ''}</div>
          </div>
          <div style={{ position: 'relative' }}>
            <button onClick={requestLineCode} title="ผูก LINE ของฉัน — รับแจ้งงาน / ตอบรับผ่านแชทบอท" className="hov-f3f5f7" style={{ marginLeft: 4, width: 34, height: 34, borderRadius: 9, border: '1px solid ' + (user?.lineLinked ? '#CDE3D6' : '#E1E5EA'), background: user?.lineLinked ? '#F2F8F4' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={user?.lineLinked ? '#2E7D55' : '#5C6770'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 01-9 8.3 9 9 0 01-2.6-.4L5 21l.9-3.4A8.2 8.2 0 013 11.5C3 6.8 7 3 12 3s9 3.8 9 8.5z" /></svg>
            </button>
            {lineCode && (
              <div style={{ position: 'absolute', right: 0, top: 42, width: 320, background: '#fff', border: '1px solid #CDE3D6', borderRadius: 12, boxShadow: '0 16px 40px rgba(20,30,40,.2)', padding: '14px 16px', zIndex: 60 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2E7D55' }}>📱 ผูก LINE ของฉัน</div>
                <div style={{ fontSize: 12, color: '#5C6770', marginTop: 4, lineHeight: 1.6 }}>1) เพิ่มบอท <b>PPSD Assistant</b> เป็นเพื่อนใน LINE<br />2) พิมพ์รหัสนี้ส่งในแชทบอท (ใช้ได้ {lineCode.expires_min} นาที)</div>
                <div className="num" style={{ fontSize: 30, fontWeight: 800, letterSpacing: 6, color: '#1C2730', textAlign: 'center', margin: '10px 0', background: '#F2F8F4', borderRadius: 9, padding: '8px 0' }}>{lineCode.code}</div>
                <div style={{ fontSize: 11.5, color: '#94A0A8' }}>ผูกเสร็จบอทจะตอบ ✅ ยืนยัน · หลังจากนั้นจะได้รับแจ้งงานในแชทและตอบ “รับ” ได้เลย</div>
                <button onClick={() => setLineCode(null)} style={{ marginTop: 10, width: '100%', fontFamily: 'inherit', fontSize: 12.5, color: '#5C6770', background: '#EDF1F4', border: 'none', borderRadius: 8, padding: '7px 0', cursor: 'pointer' }}>ปิด</button>
              </div>
            )}
          </div>
          <button onClick={onChangePin} title="เปลี่ยน PIN ของฉัน" className="hov-f3f5f7" style={{ marginLeft: 4, width: 34, height: 34, borderRadius: 9, border: '1px solid #E1E5EA', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5C6770" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="15" r="4" /><path d="M10.85 12.15L19 4" /><path d="M18 5l2 2" /><path d="M15 8l2 2" /></svg>
          </button>
          <button onClick={logout} title="ออกจากระบบ" className="hov-f3f5f7" style={{ marginLeft: 4, width: 34, height: 34, borderRadius: 9, border: '1px solid #E1E5EA', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5C6770" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
          </button>
        </div>
      </div>
    </header>
  )
}
