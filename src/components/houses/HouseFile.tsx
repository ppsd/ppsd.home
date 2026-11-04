// แฟ้มบ้าน — ทุกเรื่องของบ้านหลังนี้จากทุกแผนก (ข้อมูลจาก GET /houses/:code/file · สิทธิ์ตามเซิร์ฟเวอร์)
//  1) HouseHistoryTab: แท็บ "ประวัติทั้งหมด" ในหน้ารายละเอียดบ้าน — เรียงตามวันที่ แบ่งตามเดือน กรองแผนก/ค้นคำได้
//  2) HouseFilePrint: ปุ่ม "พิมพ์แฟ้มบ้าน" — พิมพ์/บันทึก PDF ทั้งแฟ้ม แยกหมวดเอกสาร (เก็บเป็นหลักฐานตอนปิดงาน)
//  ยอดต้นทุนฝั่งช่าง (งวดจ่ายช่าง/สัญญาช่าง) เห็นเฉพาะผู้จัดการ — เซิร์ฟเวอร์ตัดยอดออกให้แล้ว
import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { company } from '../../erpData'
import { PPSD_LOGO_FULL } from '../../assets'
import { HOUSE_TAB, thDate, baht, type SearchItem } from '../shared/GlobalSearch'

interface FileGroup { type: string; label: string; dept: string; dept_label: string; count: number; more: boolean; total: number | null; items: SearchItem[] }
interface HouseFileData { house: { id: number; code: string; name: string; customer: string; status: string; project: string }; groups: FileGroup[]; can_see_cost: boolean }

const DEPTS = [
  { id: '', label: 'ทุกแผนก' }, { id: 'site', label: 'ก่อสร้าง' }, { id: 'procure', label: 'จัดซื้อ' },
  { id: 'finance', label: 'บัญชี / การเงิน' }, { id: 'sales', label: 'ขาย / ลูกค้า' },
]
const DEPT_COLOR: Record<string, string> = { site: '#30506A', procure: '#B7791F', finance: '#2E8B57', sales: '#7A4FA0', hr: '#C24036' }
const TH_MONTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const monthLabel = (iso: string) => { const [y, m] = iso.split('-').map(Number); return `${TH_MONTH[m - 1]} ${y + 543}` }
// รวมยอดเฉพาะหมวดที่ยอดเป็นชนิดเดียวกัน (งวด/สัญญา/เงินเข้า-ออก มีทั้งฝั่งลูกค้าและช่าง → ไม่รวม)
const SUM_TYPES = new Set(['pr', 'po', 'payment', 'expense', 'petty', 'salesdoc'])

function useHouseFile(code: string) {
  const [data, setData] = useState<HouseFileData | null>(null)
  const [err, setErr] = useState('')
  const load = () => { setErr(''); api.get<HouseFileData>('/houses/' + encodeURIComponent(code) + '/file').then(setData).catch((e) => setErr((e as Error).message)) }
  useEffect(() => { setData(null); load() /* eslint-disable-next-line */ }, [code])
  return { data, err, reload: load }
}

type Ev = SearchItem & { type: string; label: string; dept: string }

export function HouseHistoryTab({ houseCode, onSetTab }: { houseCode: string; onSetTab: (tab: string) => void }) {
  const { data, err, reload } = useHouseFile(houseCode)
  const [dept, setDept] = useState('')
  const [q, setQ] = useState('')
  const events = useMemo(() => {
    const all: Ev[] = []
    for (const g of data?.groups || []) for (const it of g.items) all.push({ ...it, type: g.type, label: g.label, dept: g.dept })
    const term = q.trim().toLowerCase()
    return all
      .filter((e) => (!dept || e.dept === dept) && (!term || `${e.title} ${e.sub} ${e.label} ${e.amount ?? ''}`.toLowerCase().includes(term)))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [data, dept, q])
  const sections = useMemo(() => {
    const out: { key: string; label: string; items: Ev[] }[] = []
    for (const e of events) {
      const key = e.date ? e.date.slice(0, 7) : 'none'
      let s = out.find((x) => x.key === key)
      if (!s) { s = { key, label: e.date ? monthLabel(e.date) : 'ไม่ระบุวันที่', items: [] }; out.push(s) }
      s.items.push(e)
    }
    return out.sort((a, b) => (a.key === 'none' ? 1 : b.key === 'none' ? -1 : b.key.localeCompare(a.key)))
  }, [events])
  const chip = (on: boolean): React.CSSProperties => ({ fontFamily: 'inherit', fontSize: 12, padding: '5px 11px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${on ? '#30506A' : '#D2DAE1'}`, background: on ? '#30506A' : '#fff', color: on ? '#fff' : '#5C6770' })

  if (err) return <div style={{ padding: 20, color: '#C24036', fontSize: 13 }}>โหลดประวัติไม่สำเร็จ: {err} <button onClick={reload} style={{ fontFamily: 'inherit', marginLeft: 8 }}>ลองใหม่</button></div>
  if (!data) return <div style={{ padding: 20, color: '#5C6770', fontSize: 13 }}>กำลังรวบรวมประวัติของบ้านหลังนี้…</div>
  const total = data.groups.reduce((s, g) => s + g.count, 0)
  return (
    <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12.5, color: '#5C6770', lineHeight: 1.6 }}>
        ทุกเรื่องของบ้านหลังนี้จากทุกแผนก รวม <b className="num">{total.toLocaleString('th-TH')}</b> รายการ เรียงจากล่าสุด ·{' '}
        {data.groups.map((g) => `${g.label} ${g.count}`).join(' · ')}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {DEPTS.map((d) => <button key={d.id} onClick={() => setDept(d.id)} style={chip(dept === d.id)}>{d.label}</button>)}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นในประวัติบ้านนี้ (เช่น ปูน, PO-, ชื่อร้าน)" style={{ marginLeft: 'auto', minWidth: 220, fontFamily: 'inherit', fontSize: 12.5, padding: '6px 10px', border: '1px solid #D2DAE1', borderRadius: 8, outline: 'none' }} />
      </div>
      {!data.can_see_cost && <div style={{ fontSize: 11.5, color: '#94A0A8' }}>ยอดเงินฝั่งช่าง/ผู้รับเหมาแสดงเฉพาะผู้จัดการ</div>}
      {!events.length && <div style={{ padding: 24, textAlign: 'center', color: '#94A0A8', fontSize: 13 }}>{total ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'ยังไม่มีข้อมูลของบ้านหลังนี้'}</div>}
      {sections.map((s) => (
        <div key={s.key}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1E2E3B', padding: '6px 0', borderBottom: '1px solid #E3E8EC', position: 'sticky', top: 0, background: '#fff' }}>{s.label} <span style={{ fontWeight: 400, color: '#94A0A8' }}>({s.items.length})</span></div>
          {s.items.map((e, i) => {
            const tab = HOUSE_TAB[e.type]
            const go = tab && e.type !== 'file' && e.type !== 'house'
            return (
              <div key={e.type + (e.id ?? i)} onClick={go ? () => onSetTab(tab) : undefined} className={go ? 'hov-fafbfc' : undefined} title={go ? 'ไปที่แท็บของเรื่องนี้' : undefined}
                style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 4px', borderBottom: '1px solid #F1F4F6', cursor: go ? 'pointer' : 'default' }}>
                <div className="num" style={{ width: 82, flexShrink: 0, fontSize: 12, color: '#5C6770', paddingTop: 1 }}>{e.date ? thDate(e.date) : '—'}</div>
                <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: DEPT_COLOR[e.dept] || '#5C6770', background: '#F3F6F8', borderRadius: 6, padding: '2px 7px', marginTop: 1, whiteSpace: 'nowrap' }}>{e.label}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1C2730' }}>{e.title || '—'}</div>
                  {e.sub && <div style={{ fontSize: 11.5, color: '#7A858D', marginTop: 1 }}>{e.sub}</div>}
                </div>
                {e.amount != null && <div className="num" style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{baht(e.amount)}</div>}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ---- พิมพ์แฟ้มบ้าน (A4) ----
const bd = '1px solid #C9D2DA'
const cell: React.CSSProperties = { padding: '4px 7px', fontSize: 10.5, border: bd, verticalAlign: 'top' }
const th: React.CSSProperties = { ...cell, background: '#F7F9FB', color: '#3C4750', fontWeight: 700, textAlign: 'left' }
const num: React.CSSProperties = { ...cell, textAlign: 'right', whiteSpace: 'nowrap' }
const sec: React.CSSProperties = { padding: '5px 9px', fontSize: 12, fontWeight: 700, background: '#1E2E3B', color: '#fff', borderRadius: 4, margin: '14px 0 6px', breakAfter: 'avoid' }

export function HouseFilePrint({ houseCode, onClose }: { houseCode: string; onClose: () => void }) {
  const { data, err } = useHouseFile(houseCode)
  const today = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
  const dated = (data?.groups || []).flatMap((g) => g.items).map((x) => x.date).filter(Boolean).sort()
  const span = dated.length ? `${thDate(dated[0])} – ${thDate(dated[dated.length - 1])}` : '-'
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <style>{'@media print { @page { size: A4 portrait; margin: 10mm } }'}</style>
      <div className="no-print" style={{ maxWidth: 820, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>แฟ้มบ้าน · {data?.house.name || houseCode}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} disabled={!data} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์ / บันทึก PDF</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>

      <div className="print-area" style={{ maxWidth: 820, margin: '0 auto', background: '#fff', color: '#1C2730', borderRadius: 6, padding: '26px 30px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, borderBottom: '2px solid #1E2E3B', paddingBottom: 12, marginBottom: 6 }}>
          <img src={PPSD_LOGO_FULL} alt="PPSD" style={{ width: 54, height: 54, borderRadius: 8, objectFit: 'cover' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{company.name}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2E3B' }}>แฟ้มบ้าน — ประวัติเอกสารทุกแผนก</div>
            {data && <div style={{ fontSize: 12, color: '#3C4750', marginTop: 2 }}>{data.house.name}{data.house.customer ? ` · ลูกค้า ${data.house.customer}` : ''}{data.house.status ? ` · ${data.house.status}` : ''}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="num" style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>{houseCode}</div>
            <div style={{ fontSize: 11, color: '#5C6770' }}>พิมพ์วันที่ {today}</div>
          </div>
        </div>
        {err && <div style={{ color: '#C24036', fontSize: 13, padding: 12 }}>โหลดไม่สำเร็จ: {err}</div>}
        {!data && !err && <div style={{ color: '#5C6770', fontSize: 13, padding: 12 }}>กำลังรวบรวมเอกสาร…</div>}
        {data && (
          <>
            <div style={sec}>สารบัญ</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>หมวดเอกสาร</th><th style={th}>แผนก</th><th style={{ ...th, textAlign: 'right' }}>จำนวน</th><th style={{ ...th, textAlign: 'right' }}>ยอดรวม</th></tr></thead>
              <tbody>
                {data.groups.map((g) => (
                  <tr key={g.type}><td style={cell}>{g.label}</td><td style={cell}>{g.dept_label}</td><td style={num} className="num">{g.count.toLocaleString('th-TH')}{g.more ? '+' : ''}</td><td style={num} className="num">{SUM_TYPES.has(g.type) && g.total != null ? baht(g.total) : '-'}</td></tr>
                ))}
                <tr style={{ fontWeight: 700, background: '#FAFBFC' }}><td style={cell} colSpan={2}>ช่วงเวลาของเอกสาร: {span}</td><td style={num} className="num">{data.groups.reduce((s, g) => s + g.count, 0).toLocaleString('th-TH')}</td><td style={cell} /></tr>
              </tbody>
            </table>
            {!data.can_see_cost && <div style={{ fontSize: 10.5, color: '#94A0A8', marginTop: 4 }}>ยอดเงินฝั่งช่าง/ผู้รับเหมาแสดงเฉพาะผู้จัดการ</div>}

            {data.groups.map((g) => (
              <div key={g.type}>
                <div style={sec}>{g.label} ({g.count.toLocaleString('th-TH')} รายการ{SUM_TYPES.has(g.type) && g.total != null ? ` · รวม ${baht(g.total)}` : ''})</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={{ ...th, width: 74 }}>วันที่</th><th style={th}>รายการ</th><th style={th}>รายละเอียด</th><th style={{ ...th, textAlign: 'right', width: 90 }}>จำนวนเงิน</th></tr></thead>
                  <tbody>
                    {[...g.items].sort((a, b) => (a.date || '9').localeCompare(b.date || '9')).map((it, i) => (
                      <tr key={it.id ?? i} style={{ breakInside: 'avoid' }}>
                        <td style={{ ...cell, whiteSpace: 'nowrap' }} className="num">{it.date ? thDate(it.date) : '-'}</td>
                        <td style={cell}>{it.title || '-'}</td>
                        <td style={cell}>{it.sub || ''}</td>
                        <td style={num} className="num">{it.amount != null ? baht(it.amount) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <div style={{ fontSize: 10, color: '#94A0A8', marginTop: 14 }}>แฟ้มนี้รวบรวมจากระบบ PPSD ERP ณ วันที่พิมพ์ · ไฟล์แนบ (แบบ/รูป/สัญญา) ดูและดาวน์โหลดได้ที่หน้ารายละเอียดบ้าน</div>
          </>
        )}
      </div>
    </div>
  )
}
