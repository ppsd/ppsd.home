// ค้นหาข้อมูลทุกแผนก — หน้า "ผลการค้นหา" (กด "ดูผลทั้งหมด" หรือ Enter ที่ช่องค้นหาด้านบน)
//  ค้นได้ทุกปี · กรองปี พ.ศ. / แผนก · ผลแยกกลุ่มตามชนิดเอกสาร · กดรายการ = ไปหน้านั้น (ของที่ผูกบ้าน → เปิดบ้านที่แท็บนั้น)
//  เซิร์ฟเวอร์คืนเฉพาะข้อมูลที่ผู้ใช้มีสิทธิ์ดู (server/search.js)
import { useEffect, useState } from 'react'
import { api } from '../../api'

export interface SearchItem { id: number | null; title: string; sub: string; date: string; amount: number | null; house_code: string; house_name: string; house_id: number | null; page: string }
export interface SearchGroup { type: string; label: string; dept: string; dept_label: string; count: number; more: boolean; items: SearchItem[] }
export interface SearchResult { q: string; groups: SearchGroup[]; total: number }

// ชนิดเอกสาร → แท็บในหน้ารายละเอียดบ้าน (เปิดบ้านแล้วไปที่แท็บนั้นเลย)
export const HOUSE_TAB: Record<string, string> = {
  installment: 'installments', contractor: 'contractors', contract: 'money', moneylog: 'money', workorder: 'workorders',
  qc: 'qc', issue: 'issues', sitedoc: 'sitedocs', handover: 'handover', boq: 'boq', pr: 'procurement', po: 'procurement',
  payment: 'procurement', expense: 'expenses', house: 'installments', file: 'installments',
}
export const PAGE_LABEL: Record<string, string> = {
  house: 'บ้าน', workorders: 'ใบสั่งงาน', qc: 'ตรวจงาน QC', issues: 'ปัญหาหน้างาน', sitedocs: 'เอกสารหน้างาน', handover: 'ส่งมอบงาน',
  center: 'ความเคลื่อนไหวบ้าน', docreg: 'ทะเบียนเอกสาร', procurement: 'จัดซื้อ / จ่าย', expenses: 'รายจ่าย', accounting: 'บัญชี',
  customers: 'ลูกค้า', sales: 'เอกสารขาย', hr: 'บุคลากร',
}
const DEPTS = [
  { id: '', label: 'ทุกแผนก' }, { id: 'site', label: 'ก่อสร้าง / บ้าน' }, { id: 'procure', label: 'จัดซื้อ' },
  { id: 'finance', label: 'บัญชี / การเงิน' }, { id: 'sales', label: 'ขาย / ลูกค้า' }, { id: 'hr', label: 'บุคคล' },
]
const DEPT_COLOR: Record<string, string> = { site: '#30506A', procure: '#B7791F', finance: '#2E8B57', sales: '#7A4FA0', hr: '#C24036' }
const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
export const thDate = (iso: string) => { const [y, m, d] = (iso || '').split('-').map(Number); return y && m ? `${d} ${TH_M[m - 1]} ${y + 543}` : '' }
export const baht = (n: number | null) => (n == null ? '' : n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' บาท')
export const searchUrl = (q: string, o: { year?: string; dept?: string; type?: string; limit?: number } = {}) =>
  '/search?' + new URLSearchParams({ q, year: o.year || '', dept: o.dept || '', type: o.type || '', limit: String(o.limit || 8) })

interface Props {
  initialQ: string
  onOpen: (item: SearchItem, type: string) => void
  onOpenHouse: (houseId: number, type: string) => void
}

export default function GlobalSearch({ initialQ, onOpen, onOpenHouse }: Props) {
  const thisYear = new Date().getFullYear() + 543
  const years = Array.from({ length: 12 }, (_, i) => String(thisYear - i))
  const [q, setQ] = useState(initialQ)
  const [term, setTerm] = useState(initialQ)
  const [year, setYear] = useState('')
  const [dept, setDept] = useState('')
  const [res, setRes] = useState<SearchResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({}) // กลุ่มที่กด "ดูทั้งหมด"

  useEffect(() => { setQ(initialQ); setTerm(initialQ) }, [initialQ])
  useEffect(() => {
    if (term.trim().length < 2) { setRes(null); return }
    let alive = true
    setBusy(true); setErr('')
    api.get<SearchResult>(searchUrl(term.trim(), { year, dept, limit: 200 }))
      .then((r) => { if (alive) { setRes(r); setOpen({}) } })
      .catch((e) => { if (alive) setErr((e as Error).message) })
      .finally(() => { if (alive) setBusy(false) })
    return () => { alive = false }
  }, [term, year, dept])

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #E3E8EC', borderRadius: 12 }
  const chip = (on: boolean): React.CSSProperties => ({ fontFamily: 'inherit', fontSize: 12.5, padding: '6px 12px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${on ? '#30506A' : '#D2DAE1'}`, background: on ? '#30506A' : '#fff', color: on ? '#fff' : '#5C6770' })
  const linkBtn: React.CSSProperties = { fontFamily: 'inherit', fontSize: 12, color: '#30506A', background: '#EEF3F7', border: 'none', borderRadius: 7, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <div style={{ ...card, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <form onSubmit={(e) => { e.preventDefault(); setTerm(q) }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="พิมพ์ชื่อลูกค้า รหัสบ้าน เลขเอกสาร ชื่อร้าน ชื่อช่าง ชื่อวัสดุ หรือยอดเงิน"
            style={{ flex: '1 1 320px', fontFamily: 'inherit', fontSize: 14, padding: '10px 12px', border: '1px solid #D2DAE1', borderRadius: 9, outline: 'none' }} />
          <select value={year} onChange={(e) => setYear(e.target.value)} style={{ fontFamily: 'inherit', fontSize: 13.5, padding: '9px 10px', border: '1px solid #D2DAE1', borderRadius: 9, background: '#fff' }}>
            <option value="">ทุกปี</option>
            {years.map((y) => <option key={y} value={y}>ปี {y}</option>)}
          </select>
          <button type="submit" className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ค้นหา</button>
        </form>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {DEPTS.map((d) => <button key={d.id} onClick={() => setDept(d.id)} style={chip(dept === d.id)}>{d.label}</button>)}
        </div>
        <div style={{ fontSize: 12, color: '#94A0A8', lineHeight: 1.6 }}>
          เคล็ดลับ: พิมพ์หลายคำเว้นวรรค = ต้องเจอครบทุกคำ เช่น <b>ปูน คุณสมชาย</b> · ยอดเงินพิมพ์มีคอมมาได้ เช่น <b>15,000</b> · พิมพ์ชื่อบ้าน/รหัสบ้าน = เห็นเอกสารทุกแผนกของบ้านนั้น
          {year && <> · ข้อมูลหลัก (เช่น ร้านค้า ช่าง พนักงาน) ที่ไม่มีวันที่จะแสดงทุกปี</>}
        </div>
      </div>

      {term.trim().length < 2 && <div style={{ ...card, padding: 30, textAlign: 'center', color: '#94A0A8', fontSize: 13.5 }}>พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา</div>}
      {busy && <div style={{ color: '#5C6770', fontSize: 13 }}>กำลังค้นหา…</div>}
      {err && <div style={{ color: '#C24036', fontSize: 13 }}>ค้นหาไม่สำเร็จ: {err}</div>}
      {res && !busy && term.trim().length >= 2 && (
        <div style={{ fontSize: 13.5, color: '#1F2A33' }}>
          พบ <b className="num">{res.total.toLocaleString('th-TH')}</b> รายการ สำหรับ “{res.q}”{year && ` ในปี ${year}`}
          {res.groups.length > 0 && <span style={{ color: '#94A0A8' }}> · {res.groups.map((g) => `${g.label} ${g.count}${g.more ? '+' : ''}`).join(' · ')}</span>}
        </div>
      )}
      {res && !busy && res.total === 0 && term.trim().length >= 2 && (
        <div style={{ ...card, padding: 30, textAlign: 'center', color: '#94A0A8', fontSize: 13.5 }}>ไม่พบข้อมูลที่ตรงกัน{year ? ` ในปี ${year} — ลองเลือก “ทุกปี”` : ''}</div>
      )}

      {res?.groups.map((g) => {
        const shown = open[g.type] ? g.items : g.items.slice(0, 10)
        return (
          <div key={g.type} style={{ ...card, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #EEF1F4', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: DEPT_COLOR[g.dept] || '#5C6770' }} />
              <b style={{ fontSize: 14 }}>{g.label}</b>
              <span style={{ fontSize: 12, color: '#94A0A8' }}>{g.dept_label} · {g.count.toLocaleString('th-TH')}{g.more ? '+' : ''} รายการ</span>
            </div>
            {shown.map((it, i) => (
              <div key={`${g.type}-${it.id ?? i}`} onClick={() => onOpen(it, g.type)} className="hov-fafbfc"
                style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 16px', borderTop: i ? '1px solid #F1F4F6' : undefined, cursor: 'pointer' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: '#1C2730', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title || '—'}</div>
                  <div style={{ fontSize: 12, color: '#7A858D', marginTop: 2 }}>
                    {[it.date && thDate(it.date), it.house_name && g.type !== 'house' ? `🏠 ${it.house_name}` : '', it.sub].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {it.amount != null && <div className="num" style={{ fontSize: 13.5, fontWeight: 600, color: '#1F2A33', whiteSpace: 'nowrap' }}>{baht(it.amount)}</div>}
                {it.house_id != null && g.type !== 'house' && it.page !== 'house' && (
                  <button onClick={(e) => { e.stopPropagation(); onOpenHouse(it.house_id as number, g.type) }} style={linkBtn}>เปิดบ้าน</button>
                )}
                <span style={{ fontSize: 12, color: '#94A0A8', whiteSpace: 'nowrap' }}>{PAGE_LABEL[it.page] || ''} ›</span>
              </div>
            ))}
            {g.items.length > 10 && !open[g.type] && (
              <button onClick={() => setOpen((o) => ({ ...o, [g.type]: true }))} style={{ width: '100%', fontFamily: 'inherit', fontSize: 12.5, color: '#30506A', background: '#F7F9FA', border: 'none', borderTop: '1px solid #EEF1F4', padding: '9px 0', cursor: 'pointer' }}>
                ดูทั้งหมด {g.items.length.toLocaleString('th-TH')} รายการ
              </button>
            )}
            {open[g.type] && g.count > g.items.length && (
              <div style={{ fontSize: 12, color: '#94A0A8', padding: '8px 16px', borderTop: '1px solid #EEF1F4' }}>แสดง {g.items.length} รายการล่าสุด — พิมพ์คำให้ละเอียดขึ้น หรือเลือกปี เพื่อให้แคบลง</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
