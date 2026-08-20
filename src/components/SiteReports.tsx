import { useEffect, useState } from 'react'
import { api } from '../api'
import { useApp } from '../store'
import SiteReportPrint from './SiteReportPrint'

export interface SiteReport { id: number; kind: string; no: string; house_code: string; date: string; data: Record<string, string>; by: string }

const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '8px 11px', outline: 'none', width: '100%' }
const th: React.CSSProperties = { padding: '9px 14px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'left' }
const lbl: React.CSSProperties = { fontSize: 12, color: '#5C6770', marginBottom: 4 }

// ฟิลด์ของแต่ละชนิดรายงาน
const DAILY_FIELDS: { k: string; label: string; area?: boolean }[] = [
  { k: 'weather', label: 'สภาพอากาศ' },
  { k: 'time', label: 'เวลาเริ่ม–เลิกงาน' },
  { k: 'work', label: 'สรุปงานที่ทำวันนี้', area: true },
  { k: 'labor', label: 'จำนวนคนงาน (คน)' },
  { k: 'equipment', label: 'เครื่องมือ/เครื่องจักรที่ใช้' },
  { k: 'progress', label: 'ความคืบหน้ารวมวันนี้ (%)' },
  { k: 'safety', label: 'ความปลอดภัย (อุบัติเหตุ/เหตุการณ์)' },
  { k: 'visitor', label: 'ผู้เข้าเยี่ยมโครงการ (ถ้ามี)' },
  { k: 'note', label: 'หมายเหตุเพิ่มเติม', area: true },
]
const WEEKLY_FIELDS: { k: string; label: string; area?: boolean }[] = [
  { k: 'week', label: 'สัปดาห์ที่' },
  { k: 'period', label: 'ช่วงวันที่' },
  { k: 'plan', label: 'ความคืบหน้าตามแผน (%)' },
  { k: 'actual', label: 'ความคืบหน้าจริง (%)' },
  { k: 'work', label: 'สรุปงานประจำสัปดาห์', area: true },
  { k: 'manpower', label: 'สรุปแรงงาน/ผู้รับเหมาช่วง', area: true },
  { k: 'docs', label: 'เอกสาร RFI/RFA/VO ในสัปดาห์', area: true },
  { k: 'safety', label: 'งานความปลอดภัย (Toolbox/PPE/JHA)', area: true },
  { k: 'note', label: 'หมายเหตุ', area: true },
]

export default function SiteReports({ houseCode }: { houseCode?: string }) {
  const { data } = useApp()
  const houses = data.houses
  const [kind, setKind] = useState<'daily' | 'weekly'>('daily')
  const [allRows, setRows] = useState<SiteReport[]>([])
  const rows = houseCode ? allRows.filter((r) => r.house_code === houseCode) : allRows
  const [adding, setAdding] = useState(false)
  const [house, setHouse] = useState(houseCode || '')
  const [form, setForm] = useState<Record<string, string>>({})
  const [printing, setPrinting] = useState<SiteReport | null>(null)

  const fields = kind === 'daily' ? DAILY_FIELDS : WEEKLY_FIELDS
  const load = () => api.get<SiteReport[]>('/site-reports?kind=' + kind).then(setRows).catch(() => setRows([]))
  useEffect(() => { load(); setAdding(false) /* eslint-disable-next-line */ }, [kind])

  const submit = async () => {
    await api.post('/site-reports', { kind, house_code: house, data: form })
    setForm({}); setHouse(houseCode || ''); setAdding(false); load()
  }
  const remove = async (id: number) => { if (confirm('ลบรายงานนี้?')) { await api.del('/site-reports/' + id); load() } }

  // ดึงข้อมูลจริง: แรงงานจากการลงเวลา, ความคืบหน้าจาก S-curve, เอกสาร RFI/RFA/VO
  const [pulling, setPulling] = useState(false)
  const autofill = async () => {
    setPulling(true)
    try {
      const a = await api.get<{ labor: string; progress: string; actual: string; manpower: string; docs: string; safety: string }>(`/site-report-autofill?kind=${kind}&house_code=${encodeURIComponent(house)}`)
      setForm((f) => kind === 'daily'
        ? { ...f, labor: a.labor, progress: a.progress }
        : { ...f, actual: a.actual, manpower: a.manpower, docs: a.docs, safety: a.safety })
    } catch (e) { alert((e as Error).message) } finally { setPulling(false) }
  }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 2, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 11, padding: '6px 8px' }}>
        {([['daily', 'รายงานประจำวัน (Daily)'], ['weekly', 'รายงานประจำสัปดาห์ (Weekly)']] as const).map(([id, label]) => (
          <div key={id} onClick={() => setKind(id)} style={{ fontSize: 13, fontWeight: kind === id ? 600 : 500, color: kind === id ? '#fff' : '#5C6770', background: kind === id ? '#30506A' : 'transparent', padding: '7px 16px', borderRadius: 7, cursor: 'pointer' }}>{label}</div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 13, color: '#5C6770' }}>รายงาน <b className="num" style={{ color: '#1C2730' }}>{rows.length}</b> ฉบับ</div>
        <button onClick={() => setAdding((v) => !v)} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>+ เขียนรายงาน</button>
      </div>

      {adding && (
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: 18 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={lbl}>บ้าน / โครงการ</div>
            {houseCode
              ? <div style={{ ...field, display: 'flex', alignItems: 'center', color: '#5C6770', background: '#F7F9FB' }}>{houses.find((h) => h.code === houseCode)?.name || houseCode}</div>
              : <select style={field} value={house} onChange={(e) => setHouse(e.target.value)}>
                <option value="">— เลือกบ้าน —</option>
                {houses.map((h) => <option key={h.id} value={h.code}>{h.name}</option>)}
              </select>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
            {fields.map((f) => (
              <div key={f.k} style={{ gridColumn: f.area ? '1 / -1' : undefined }}>
                <div style={lbl}>{f.label}</div>
                {f.area
                  ? <textarea style={{ ...field, minHeight: 58, resize: 'vertical' }} value={form[f.k] || ''} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} />
                  : <input style={field} value={form[f.k] || ''} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} />}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, alignItems: 'center' }}>
            <button onClick={autofill} disabled={pulling} title="ดึงจำนวนคนงานจากการลงเวลา, ความคืบหน้าจาก S-curve และเอกสาร RFI/RFA/VO มากรอกให้" className="hov-f3f5f7" style={{ marginRight: 'auto', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#C0852C', background: '#fff', border: '1px solid #EAD9B6', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>{pulling ? 'กำลังดึง…' : '↻ ดึงข้อมูลจริง'}</button>
            <button onClick={() => setAdding(false)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ยกเลิก</button>
            <button onClick={submit} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>บันทึกรายงาน</button>
          </div>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F7F9FB' }}>
              <th style={{ ...th, paddingLeft: 18 }}>เลขที่</th><th style={th}>บ้าน</th>
              <th style={th}>{kind === 'daily' ? 'สรุปงาน' : 'สัปดาห์ / ช่วง'}</th>
              <th style={{ ...th, textAlign: 'center' }}>ความคืบหน้า</th><th style={{ ...th, paddingRight: 18, textAlign: 'center' }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีรายงาน — กด “เขียนรายงาน”</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                <td className="num" style={{ padding: '10px 18px', fontWeight: 600, fontFamily: 'monospace' }}>{r.no}<div style={{ fontSize: 10.5, color: '#94A0A8', fontFamily: 'inherit' }}>{r.date}</div></td>
                <td style={{ padding: '10px 14px', color: '#5C6770' }}>{houses.find((h) => h.code === r.house_code)?.name || r.house_code || '—'}</td>
                <td style={{ padding: '10px 14px', color: '#3C4750', maxWidth: 380 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kind === 'daily' ? (r.data.work || '-') : `สัปดาห์ ${r.data.week || '-'} · ${r.data.period || ''}`}</div></td>
                <td className="num" style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#30506A' }}>{kind === 'daily' ? (r.data.progress ? r.data.progress + '%' : '-') : (r.data.actual ? r.data.actual + '%' : '-')}</td>
                <td style={{ padding: '10px 18px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button onClick={() => setPrinting(r)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>🖨 พิมพ์</button>
                  <button onClick={() => remove(r.id)} style={{ marginLeft: 6, border: 'none', background: 'none', color: '#C24036', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {printing && <SiteReportPrint report={printing} houseName={houses.find((h) => h.code === printing.house_code)?.name || printing.house_code} fields={printing.kind === 'daily' ? DAILY_FIELDS : WEEKLY_FIELDS} onClose={() => setPrinting(null)} />}
    </div>
  )
}
