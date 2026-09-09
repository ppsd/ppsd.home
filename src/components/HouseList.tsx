import { useState } from 'react'
import { filters, statusStyle, barColor, baht } from '../data'
import { useApp } from '../store'
import type { ApiHouse } from '../store'

interface HouseListProps {
  search: string
  statusFilter: string
  onSearch: (v: string) => void
  onSetFilter: (id: string) => void
  onOpenHouse: (id: number) => void
  onAddHouse: () => void
}

// ย่อรูปฝั่ง client ก่อนเก็บ (กว้างไม่เกิน 1400px, JPEG) เพื่อให้ไฟล์เล็ก โหลดเร็ว
function resizeImage(file: File, maxW = 1400, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width)
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
        const c = document.createElement('canvas'); c.width = w; c.height = h
        c.getContext('2d')!.drawImage(img, 0, 0, w, h)
        resolve(c.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = String(r.result)
    }
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export default function HouseList({ search, statusFilter, onSearch, onSetFilter, onOpenHouse, onAddHouse }: HouseListProps) {
  const app = useApp()
  const { houses } = app.data
  const data = app.data
  const canEdit = app.user?.role === 'admin' || app.user?.role === 'accounting' || app.user?.role === 'site' || !!app.user?.isManager
  const [uploading, setUploading] = useState<number | null>(null)
  const pickPhoto = async (h: ApiHouse, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setUploading(h.id)
    try { const photo = await resizeImage(file); await app.updateHouse(h.id, { photo }) }
    catch { /* ignore */ } finally { setUploading(null) }
  }
  const q = search.trim().toLowerCase()
  const filtered = houses.filter((h) => {
    const okS = statusFilter === 'all' || h.status === statusFilter
    const okQ = !q || h.name.toLowerCase().includes(q) || h.customer.toLowerCase().includes(q)
    return okS && okQ
  })

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 9, padding: '9px 13px', width: 300 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A0A8" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="ค้นหาชื่อบ้าน หรือ ลูกค้า"
            style={{ border: 'none', background: 'transparent', outline: 'none', fontFamily: 'inherit', fontSize: 13.5, color: '#1C2730', width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 9, padding: 4 }}>
          {filters.map((f) => {
            const active = statusFilter === f.id
            return (
              <div
                key={f.id}
                onClick={() => onSetFilter(f.id)}
                style={{ fontSize: 12.5, fontWeight: 500, padding: '6px 13px', borderRadius: 6, cursor: 'pointer', color: active ? '#fff' : '#5C6770', background: active ? '#30506A' : 'transparent' }}
              >
                {f.label}
              </div>
            )
          })}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#5C6770' }}>
          พบ <span className="num" style={{ fontWeight: 600, color: '#1C2730' }}>{filtered.length}</span> หลัง
        </div>
        <button onClick={onAddHouse} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '10px 16px', cursor: 'pointer' }}>
          + เพิ่มบ้าน
        </button>
      </div>

      {/* house cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        {filtered.map((h) => {
          const ss = statusStyle(h.status)
          return (
            <div key={h.id} onClick={() => onOpenHouse(h.id)} className="house-card" style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 13, overflow: 'hidden', cursor: 'pointer' }}>
              <div style={{ height: 130, background: h.photo ? '#1E2E3B' : 'repeating-linear-gradient(135deg,#EAEEF2 0 12px,#E2E8ED 12px 24px)', position: 'relative', display: 'flex', alignItems: 'flex-end', padding: 11 }}>
                {h.photo && <img src={h.photo} alt={h.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                <span style={{ position: 'absolute', top: 11, right: 11, fontSize: 11, fontWeight: 600, color: h.kind === 'office' ? '#fff' : ss.c, background: h.kind === 'office' ? '#30506A' : ss.bg, padding: '3px 10px', borderRadius: 20, zIndex: 1 }}>{h.kind === 'office' ? '🏢 ออฟฟิศ' : h.status}</span>
                {canEdit && (
                  <label onClick={(e) => e.stopPropagation()} title={h.photo ? 'เปลี่ยนรูปบ้าน' : 'ใส่รูปบ้าน'} style={{ position: 'absolute', top: 11, left: 11, zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#30506A', background: 'rgba(255,255,255,.92)', border: '1px solid rgba(0,0,0,.06)', borderRadius: 20, padding: '3px 9px', cursor: uploading === h.id ? 'wait' : 'pointer' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                    {uploading === h.id ? 'กำลังอัปโหลด…' : h.photo ? 'เปลี่ยนรูป' : 'ใส่รูป'}
                    <input type="file" accept="image/*" onChange={(e) => pickPhoto(h, e)} style={{ display: 'none' }} />
                  </label>
                )}
                <span style={{ fontSize: 10.5, color: h.photo ? '#fff' : '#8A98A3', fontFamily: 'monospace', background: h.photo ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.7)', padding: '2px 7px', borderRadius: 5, position: 'relative', zIndex: 1 }}>{h.code}</span>
              </div>
              <div style={{ padding: '14px 16px 16px' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1C2730' }}>{h.name}</div>
                <div style={{ fontSize: 12, color: '#94A0A8', marginTop: 1 }}>{h.project} · {h.customer}</div>

                {h.kind === 'office' ? (
                  <div style={{ marginTop: 13 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11.5, color: '#5C6770' }}>ค่าใช้จ่ายออฟฟิศ (รายจ่ายที่บันทึก)</span>
                      <span className="num" style={{ fontSize: 16, fontWeight: 700, color: '#1C2730' }}>{baht((data.expenses || []).filter((e) => e.house_code === h.code && e.status !== 'ปฏิเสธ').reduce((s, e) => s + e.amount, 0))}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 8 }}>หมวด: เบิกค่าน้ำมัน · ซ่อมแซมออฟฟิศ · ของใช้สำนักงาน · อื่นๆ</div>
                  </div>
                ) : <>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 13 }}>
                  <span style={{ fontSize: 11.5, color: '#5C6770' }}>มูลค่าสัญญา</span>
                  <span className="num" style={{ fontSize: 16, fontWeight: 700, color: '#1C2730' }}>{baht(h.value)}</span>
                </div>

                <div style={{ marginTop: 11 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 5 }}>
                    <span style={{ color: '#5C6770' }}>ความคืบหน้า</span>
                    <span className="num" style={{ fontWeight: 600, color: h.pct >= 100 ? '#2E7D55' : '#1C2730' }}>{h.pct}%</span>
                  </div>
                  <div style={{ height: 8, background: '#EEF1F4', borderRadius: 20, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: h.pct + '%', background: barColor(h.pct), borderRadius: 20 }} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 13, paddingTop: 12, borderTop: '1px solid #F1F4F6' }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#94A0A8' }}>เก็บแล้ว</div>
                    <div className="num" style={{ fontSize: 13, fontWeight: 600, color: '#2E7D55' }}>{baht(h.collected)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#94A0A8' }}>ค้างเก็บ</div>
                    <div className="num" style={{ fontSize: 13, fontWeight: 600, color: '#C0852C' }}>{baht(h.remain)}</div>
                  </div>
                </div>
                </>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
