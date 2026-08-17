import { useEffect, useState } from 'react'
import { api } from '../api'
import { baht } from '../data'
import { useApp } from '../store'
import SiteDocPrint from './SiteDocPrint'

export interface SiteDoc {
  id: number; kind: string; no: string; house_code: string; discipline: string
  title: string; detail: string; status: string; by: string; date: string; assignee: string
  response: string; responded_by: string; responded_date: string
  cost_impact: number; days_impact: number; image?: string; created: string
}

// นิยามแต่ละชนิดเอกสาร + สถานะที่เลือกได้
const KINDS: Record<string, { label: string; full: string; statuses: string[]; hasCost?: boolean }> = {
  rfi: { label: 'RFI', full: 'สอบถามแบบ (Request for Information)', statuses: ['รอตอบ', 'ตอบแล้ว', 'ปิด'] },
  rfa: { label: 'RFA', full: 'ขออนุมัติ (Request for Approval)', statuses: ['รออนุมัติ', 'อนุมัติ', 'อนุมัติมีเงื่อนไข', 'ให้แก้ไข', 'ไม่อนุมัติ'] },
  ncr: { label: 'NCR', full: 'สิ่งที่ไม่เป็นไปตามข้อกำหนด (Non-Conforming Report)', statuses: ['เปิด', 'เสนอแก้ไข', 'อนุมัติแก้ไข', 'ปิด'] },
  vo: { label: 'VO', full: 'งานเปลี่ยนแปลง (Variation Order)', statuses: ['เสนอ', 'อนุมัติ', 'ไม่อนุมัติ'], hasCost: true },
}
const DISCIPLINES = ['สถาปัตยกรรม', 'โครงสร้าง', 'ระบบไฟฟ้า', 'ระบบสุขาภิบาล', 'ปรับอากาศ', 'ตกแต่งภายใน', 'งานภายนอก', 'อื่นๆ']

function statusColor(s: string) {
  if (['อนุมัติ', 'ตอบแล้ว', 'ปิด', 'อนุมัติแก้ไข'].includes(s)) return { c: '#2E7D55', bg: '#E2F1EA' }
  if (['ไม่อนุมัติ', 'ให้แก้ไข'].includes(s)) return { c: '#C24036', bg: '#FBEEEC' }
  if (['รอตอบ', 'รออนุมัติ', 'เปิด', 'เสนอ', 'เสนอแก้ไข', 'อนุมัติมีเงื่อนไข'].includes(s)) return { c: '#B7791F', bg: '#F6ECD6' }
  return { c: '#30506A', bg: '#E2E9EF' }
}

const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '8px 11px', outline: 'none' }
const th: React.CSSProperties = { padding: '9px 14px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'left' }
const td: React.CSSProperties = { padding: '10px 14px', fontSize: 13 }

export default function SiteDocs() {
  const { data } = useApp()
  const houses = data.houses
  const [kind, setKind] = useState('rfi')
  const [rows, setRows] = useState<SiteDoc[]>([])
  const [adding, setAdding] = useState(false)
  const [printing, setPrinting] = useState<SiteDoc | null>(null)
  const [q, setQ] = useState('')
  const blank = { house_code: '', discipline: '', title: '', detail: '', assignee: '', cost_impact: '', days_impact: '' }
  const [f, setF] = useState(blank)
  const [err, setErr] = useState('')

  const load = () => api.get<SiteDoc[]>('/site-docs?kind=' + kind).then(setRows).catch(() => setRows([]))
  useEffect(() => { load(); setAdding(false) /* eslint-disable-next-line */ }, [kind])

  const cfg = KINDS[kind]
  const submit = async () => {
    if (!f.title.trim()) { setErr('กรุณากรอกหัวข้อ/เรื่อง'); return }
    setErr('')
    try {
      await api.post('/site-docs', { kind, ...f, cost_impact: Number(String(f.cost_impact).replace(/,/g, '')) || 0, days_impact: Number(f.days_impact) || 0 })
      setF(blank); setAdding(false); load()
    } catch (e) { setErr((e as Error).message) }
  }
  const update = async (id: number, patch: Partial<SiteDoc>) => { await api.put('/site-docs/' + id, patch); load() }
  const remove = async (id: number) => { if (confirm('ลบเอกสารนี้?')) { await api.del('/site-docs/' + id); load() } }

  const ql = q.trim().toLowerCase()
  const list = rows.filter((r) => !ql || `${r.no} ${r.title} ${r.discipline} ${r.house_code} ${r.status}`.toLowerCase().includes(ql))

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* kind tabs */}
      <div style={{ display: 'flex', gap: 2, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 11, padding: '6px 8px', flexWrap: 'wrap' }}>
        {Object.keys(KINDS).map((k) => (
          <div key={k} onClick={() => setKind(k)} title={KINDS[k].full} style={{ fontSize: 13, fontWeight: kind === k ? 600 : 500, color: kind === k ? '#fff' : '#5C6770', background: kind === k ? '#30506A' : 'transparent', padding: '7px 16px', borderRadius: 7, cursor: 'pointer' }}>{KINDS[k].label}</div>
        ))}
        <div style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, color: '#94A0A8', paddingRight: 8 }}>{cfg.full}</div>
      </div>

      {/* header + add */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 13, color: '#5C6770' }}>เอกสาร <b className="num" style={{ color: '#1C2730' }}>{list.length}</b> รายการ</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเลขที่/เรื่อง/หมวด" style={{ ...field, padding: '7px 11px', fontSize: 12.5, width: 220 }} />
        <button onClick={() => setAdding((v) => !v)} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>+ ออก {cfg.label}</button>
      </div>

      {adding && (
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 12 }}>
            <select style={field} value={f.house_code} onChange={(e) => setF({ ...f, house_code: e.target.value })}>
              <option value="">— เลือกบ้าน/โครงการ —</option>
              {houses.map((h) => <option key={h.id} value={h.code}>{h.name} ({h.code})</option>)}
            </select>
            <select style={field} value={f.discipline} onChange={(e) => setF({ ...f, discipline: e.target.value })}>
              <option value="">— หมวดงาน —</option>
              {DISCIPLINES.map((d) => <option key={d}>{d}</option>)}
            </select>
            <input style={field} placeholder={kind === 'rfi' ? 'เรียน (ผู้ออกแบบ/ผู้ควบคุมงาน)' : kind === 'ncr' ? 'ผู้รับผิดชอบแก้ไข' : 'เรียน / ถึง'} value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })} />
          </div>
          <input style={{ ...field, width: '100%', marginTop: 10 }} placeholder="เรื่อง / หัวข้อ *" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <textarea style={{ ...field, width: '100%', marginTop: 10, minHeight: 70, resize: 'vertical' }} placeholder={kind === 'rfi' ? 'รายละเอียดคำถาม' : kind === 'ncr' ? 'รายละเอียดข้อบกพร่อง / ตำแหน่ง' : kind === 'vo' ? 'รายละเอียดงานที่เปลี่ยนแปลง' : 'รายละเอียดที่ขออนุมัติ (วัสดุ/Shop Drawing/ตัวอย่าง)'} value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} />
          {cfg.hasCost && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
              <input style={field} type="number" placeholder="ผลต่อค่าก่อสร้าง +/- (บาท)" value={f.cost_impact} onChange={(e) => setF({ ...f, cost_impact: e.target.value })} />
              <input style={field} type="number" placeholder="ผลต่อระยะเวลา +/- (วัน)" value={f.days_impact} onChange={(e) => setF({ ...f, days_impact: e.target.value })} />
            </div>
          )}
          {err && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 10 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={() => setAdding(false)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ยกเลิก</button>
            <button onClick={submit} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>บันทึก + ออกเลขที่</button>
          </div>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F7F9FB' }}>
              <th style={{ ...th, paddingLeft: 18 }}>เลขที่</th>
              <th style={th}>เรื่อง</th>
              <th style={th}>บ้าน / หมวด</th>
              {cfg.hasCost && <th style={{ ...th, textAlign: 'right' }}>ผลต่อค่างาน/เวลา</th>}
              <th style={{ ...th, textAlign: 'center' }}>สถานะ</th>
              <th style={{ ...th, paddingRight: 18, textAlign: 'center' }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={cfg.hasCost ? 6 : 5} style={{ padding: 40, textAlign: 'center', color: '#94A0A8', fontSize: 13 }}>ยังไม่มีเอกสาร — กด “ออก {cfg.label}”</td></tr>}
            {list.map((r) => {
              const sc = statusColor(r.status)
              return (
                <tr key={r.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td className="num" style={{ ...td, paddingLeft: 18, fontWeight: 600, fontFamily: 'monospace' }}>{r.no}<div style={{ fontSize: 10.5, color: '#94A0A8', fontFamily: 'inherit' }}>{r.date}</div></td>
                  <td style={{ ...td }}>
                    <div style={{ fontWeight: 500 }}>{r.title}</div>
                    {r.detail && <div style={{ fontSize: 11.5, color: '#94A0A8', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.detail}</div>}
                    {r.response && <div style={{ fontSize: 11.5, color: '#2E7D55', marginTop: 2 }}>↳ ตอบ: {r.response}</div>}
                  </td>
                  <td style={{ ...td, color: '#5C6770' }}>
                    <div>{houses.find((h) => h.code === r.house_code)?.name || r.house_code || '—'}</div>
                    {r.discipline && <div style={{ fontSize: 11, color: '#94A0A8' }}>{r.discipline}</div>}
                  </td>
                  {cfg.hasCost && <td className="num" style={{ ...td, textAlign: 'right' }}>
                    <div style={{ color: r.cost_impact > 0 ? '#C24036' : r.cost_impact < 0 ? '#2E7D55' : '#5C6770' }}>{r.cost_impact ? (r.cost_impact > 0 ? '+' : '') + baht(r.cost_impact) : '-'}</div>
                    {!!r.days_impact && <div style={{ fontSize: 11, color: '#94A0A8' }}>{r.days_impact > 0 ? '+' : ''}{r.days_impact} วัน</div>}
                  </td>}
                  <td style={{ ...td, textAlign: 'center' }}>
                    <select value={r.status} onChange={(e) => update(r.id, { status: e.target.value })} style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: sc.c, background: sc.bg, border: 'none', borderRadius: 20, padding: '4px 10px', cursor: 'pointer', outline: 'none' }}>
                      {cfg.statuses.map((s) => <option key={s} style={{ color: '#1C2730', background: '#fff' }}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ ...td, paddingRight: 18, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button onClick={() => { const resp = prompt('บันทึกคำตอบ / ผลอนุมัติ / วิธีแก้ไข:', r.response || ''); if (resp != null) update(r.id, { response: resp }) }} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>ตอบ</button>
                    <button onClick={() => setPrinting(r)} className="hov-f3f5f7" style={{ marginLeft: 6, fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>🖨</button>
                    <button onClick={() => remove(r.id)} style={{ marginLeft: 6, border: 'none', background: 'none', color: '#C24036', cursor: 'pointer', fontSize: 13 }}>✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {printing && <SiteDocPrint doc={printing} houseName={houses.find((h) => h.code === printing.house_code)?.name || printing.house_code} kindFull={KINDS[printing.kind]?.full || ''} onClose={() => setPrinting(null)} />}
    </div>
  )
}
