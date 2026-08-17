import { useEffect, useState } from 'react'
import { api } from '../api'
import { baht, unMoney } from '../data'
import { useApp } from '../store'
import MoneyInput from './MoneyInput'
import HandoverPrint from './HandoverPrint'

export interface HandoverDoc { id: number; kind: string; no: string; house_code: string; date: string; title: string; data: Record<string, unknown>; status: string; by: string }

type Kind = 'handover' | 'certificate'
const KINDS: { id: Kind; label: string }[] = [
  { id: 'handover', label: 'ใบส่งมอบงาน' },
  { id: 'certificate', label: 'หนังสือรับรองผลงาน' },
]
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '8px 10px', outline: 'none', width: '100%' }
const th: React.CSSProperties = { padding: '9px 14px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'left' }
const lbl: React.CSSProperties = { fontSize: 12, color: '#5C6770', marginBottom: 4 }

interface CheckItem { name: string; pass: boolean }

export default function Handover() {
  const { data } = useApp()
  const houses = data.houses
  const [kind, setKind] = useState<Kind>('handover')
  const [rows, setRows] = useState<HandoverDoc[]>([])
  const [adding, setAdding] = useState(false)
  const [printing, setPrinting] = useState<HandoverDoc | null>(null)
  const [house, setHouse] = useState('')
  const [title, setTitle] = useState('')
  const [hd, setHd] = useState<{ scope: string; deliver_to: string; deliver_by: string; items: CheckItem[]; defects: string; warranty: string }>({ scope: '', deliver_to: '', deliver_by: '', items: [{ name: '', pass: true }], defects: '', warranty: '' })
  const [cert, setCert] = useState({ contractor: '', project: '', value: '', period: '', scope: '', rating: 'ดีมาก', statement: '', issuer: '', issuer_role: '' })

  const load = () => api.get<HandoverDoc[]>('/handovers?kind=' + kind).then(setRows).catch(() => setRows([]))
  useEffect(() => { load(); setAdding(false) /* eslint-disable-next-line */ }, [kind])

  const reset = () => { setHouse(''); setTitle(''); setHd({ scope: '', deliver_to: '', deliver_by: '', items: [{ name: '', pass: true }], defects: '', warranty: '' }); setCert({ contractor: '', project: '', value: '', period: '', scope: '', rating: 'ดีมาก', statement: '', issuer: '', issuer_role: '' }) }
  const submit = async () => {
    const payload = kind === 'handover'
      ? { ...hd, items: hd.items.filter((i) => i.name.trim()) }
      : { ...cert, value: unMoney(cert.value) }
    await api.post('/handovers', { kind, house_code: house, title, data: payload })
    reset(); setAdding(false); load()
  }
  const remove = async (id: number) => { if (confirm('ลบเอกสารนี้?')) { await api.del('/handovers/' + id); load() } }

  // #20: ดึงข้อมูลจริง — ใบส่งมอบดึงจากงวดที่ตรวจรับผ่าน · หนังสือรับรองดึงยอดจ่ายช่าง+เกรดผู้รับเหมา
  const [pulling, setPulling] = useState(false)
  const autofill = async () => {
    if (!house) { alert('กรุณาเลือกบ้าน/โครงการก่อน'); return }
    setPulling(true)
    try {
      const r = await api.get<{ found?: boolean; title?: string; data?: Record<string, unknown> }>(`/handover-autofill?kind=${kind}&house_code=${encodeURIComponent(house)}`)
      if (!r.found) { alert(kind === 'handover' ? 'ยังไม่มีงวดที่ตรวจรับผ่านสำหรับบ้านนี้' : 'ไม่พบข้อมูลผู้รับเหมา/ยอดจ่ายของบ้านนี้'); return }
      if (r.title) setTitle(r.title)
      const d = r.data || {}
      if (kind === 'handover') setHd((h) => ({ ...h, scope: String(d.scope || h.scope), deliver_to: String(d.deliver_to || h.deliver_to), items: (d.items as CheckItem[])?.length ? (d.items as CheckItem[]) : h.items, defects: String(d.defects || h.defects) }))
      else setCert((c) => ({ ...c, contractor: String(d.contractor || c.contractor), project: String(d.project || c.project), value: d.value ? String(d.value) : c.value, period: String(d.period || c.period), rating: String(d.rating || c.rating), scope: String(d.scope || c.scope) }))
    } catch (e) { alert((e as Error).message) } finally { setPulling(false) }
  }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 2, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 11, padding: '6px 8px' }}>
        {KINDS.map((k) => (
          <div key={k.id} onClick={() => setKind(k.id)} style={{ fontSize: 13, fontWeight: kind === k.id ? 600 : 500, color: kind === k.id ? '#fff' : '#5C6770', background: kind === k.id ? '#30506A' : 'transparent', padding: '7px 16px', borderRadius: 7, cursor: 'pointer' }}>{k.label}</div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 13, color: '#5C6770' }}>เอกสาร <b className="num" style={{ color: '#1C2730' }}>{rows.length}</b> ฉบับ</div>
        <button onClick={() => setAdding((v) => !v)} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>+ ออกเอกสาร</button>
      </div>

      {adding && (
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 2fr', gap: 12, marginBottom: 12 }}>
            <div><div style={lbl}>บ้าน / โครงการ</div><select style={field} value={house} onChange={(e) => setHouse(e.target.value)}><option value="">— เลือกบ้าน —</option>{houses.map((h) => <option key={h.id} value={h.code}>{h.name}</option>)}</select></div>
            <div><div style={lbl}>ชื่อเรื่อง/งาน</div><input style={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'handover' ? 'เช่น ส่งมอบงานงวดที่ 3' : 'เช่น รับรองผลงานก่อสร้างบ้าน'} /></div>
          </div>

          {kind === 'handover' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
                <div><div style={lbl}>ขอบเขต/งวดงานที่ส่งมอบ</div><input style={field} value={hd.scope} onChange={(e) => setHd({ ...hd, scope: e.target.value })} /></div>
                <div><div style={lbl}>การรับประกันผลงาน</div><input style={field} value={hd.warranty} onChange={(e) => setHd({ ...hd, warranty: e.target.value })} placeholder="เช่น 1 ปี" /></div>
                <div><div style={lbl}>ผู้ส่งมอบ (ผู้รับเหมา/ช่าง)</div><input style={field} value={hd.deliver_by} onChange={(e) => setHd({ ...hd, deliver_by: e.target.value })} /></div>
                <div><div style={lbl}>ผู้รับมอบ (เจ้าของ/ผู้ควบคุมงาน)</div><input style={field} value={hd.deliver_to} onChange={(e) => setHd({ ...hd, deliver_to: e.target.value })} /></div>
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={lbl}>รายการตรวจรับงาน</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {hd.items.map((it, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input style={{ ...field, flex: 1 }} placeholder={`รายการที่ ${i + 1}`} value={it.name} onChange={(e) => setHd({ ...hd, items: hd.items.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} />
                      <button onClick={() => setHd({ ...hd, items: hd.items.map((x, j) => j === i ? { ...x, pass: !x.pass } : x) })} style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', borderRadius: 7, padding: '6px 12px', border: '1px solid ' + (it.pass ? '#2E7D55' : '#C24036'), background: it.pass ? '#2E7D55' : '#fff', color: it.pass ? '#fff' : '#C24036', whiteSpace: 'nowrap' }}>{it.pass ? '✓ ผ่าน' : '✗ ไม่ผ่าน'}</button>
                      <button onClick={() => setHd({ ...hd, items: hd.items.length > 1 ? hd.items.filter((_, j) => j !== i) : hd.items })} style={{ border: 'none', background: 'none', color: hd.items.length > 1 ? '#C24036' : '#CBD3DA', cursor: 'pointer', fontSize: 15 }}>✕</button>
                    </div>
                  ))}
                  <button onClick={() => setHd({ ...hd, items: [...hd.items, { name: '', pass: true }] })} className="hov-f3f5f7" style={{ alignSelf: 'flex-start', fontFamily: 'inherit', fontSize: 12.5, color: '#30506A', background: '#fff', border: '1px dashed #B9C6D0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>+ เพิ่มรายการ</button>
                </div>
              </div>
              <div style={{ marginTop: 12 }}><div style={lbl}>ข้อบกพร่องที่ต้องแก้ไข (ถ้ามี)</div><textarea style={{ ...field, minHeight: 48, resize: 'vertical' }} value={hd.defects} onChange={(e) => setHd({ ...hd, defects: e.target.value })} /></div>
            </>
          )}

          {kind === 'certificate' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
              <div><div style={lbl}>ผู้รับการรับรอง (ผู้รับเหมา)</div><input style={field} value={cert.contractor} onChange={(e) => setCert({ ...cert, contractor: e.target.value })} /></div>
              <div><div style={lbl}>ชื่อโครงการ/งาน</div><input style={field} value={cert.project} onChange={(e) => setCert({ ...cert, project: e.target.value })} /></div>
              <div><div style={lbl}>มูลค่างาน (บาท)</div><MoneyInput style={field} value={cert.value} onChange={(v) => setCert({ ...cert, value: v })} /></div>
              <div><div style={lbl}>ระยะเวลาดำเนินงาน</div><input style={field} value={cert.period} onChange={(e) => setCert({ ...cert, period: e.target.value })} placeholder="เช่น ม.ค. – มิ.ย. 2568" /></div>
              <div style={{ gridColumn: '1 / -1' }}><div style={lbl}>ขอบเขตงานที่ดำเนินการ</div><textarea style={{ ...field, minHeight: 48, resize: 'vertical' }} value={cert.scope} onChange={(e) => setCert({ ...cert, scope: e.target.value })} /></div>
              <div><div style={lbl}>ระดับผลงาน</div><select style={field} value={cert.rating} onChange={(e) => setCert({ ...cert, rating: e.target.value })}>{['ดีเยี่ยม', 'ดีมาก', 'ดี', 'พอใช้'].map((r) => <option key={r}>{r}</option>)}</select></div>
              <div><div style={lbl}>ผู้ออกหนังสือ</div><input style={field} value={cert.issuer} onChange={(e) => setCert({ ...cert, issuer: e.target.value })} /></div>
              <div><div style={lbl}>ตำแหน่งผู้ออกหนังสือ</div><input style={field} value={cert.issuer_role} onChange={(e) => setCert({ ...cert, issuer_role: e.target.value })} /></div>
              <div style={{ gridColumn: '1 / -1' }}><div style={lbl}>ข้อความรับรอง (เว้นว่างเพื่อใช้ข้อความมาตรฐาน)</div><textarea style={{ ...field, minHeight: 48, resize: 'vertical' }} value={cert.statement} onChange={(e) => setCert({ ...cert, statement: e.target.value })} /></div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, alignItems: 'center' }}>
            <button onClick={autofill} disabled={pulling} title={kind === 'handover' ? 'ดึงงวดที่ตรวจรับผ่าน + รายการตรวจรับ' : 'ดึงยอดจ่ายช่าง + เกรดผู้รับเหมา'} className="hov-f3f5f7" style={{ marginRight: 'auto', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#C0852C', background: '#fff', border: '1px solid #EAD9B6', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>{pulling ? 'กำลังดึง…' : '↻ ดึงข้อมูลจริง'}</button>
            <button onClick={() => setAdding(false)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ยกเลิก</button>
            <button onClick={submit} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>บันทึก</button>
          </div>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F7F9FB' }}>
              <th style={{ ...th, paddingLeft: 18 }}>เลขที่</th><th style={th}>บ้าน</th><th style={th}>เรื่อง</th>
              <th style={kind === 'certificate' ? { ...th, textAlign: 'right' } : th}>{kind === 'certificate' ? 'มูลค่างาน' : 'ผู้ส่ง/รับมอบ'}</th>
              <th style={{ ...th, paddingRight: 18, textAlign: 'center' }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีเอกสาร — กด “ออกเอกสาร”</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                <td className="num" style={{ padding: '10px 18px', fontWeight: 600, fontFamily: 'monospace' }}>{r.no}<div style={{ fontSize: 10.5, color: '#94A0A8', fontFamily: 'inherit' }}>{r.date}</div></td>
                <td style={{ padding: '10px 14px', color: '#5C6770' }}>{houses.find((h) => h.code === r.house_code)?.name || r.house_code || '—'}</td>
                <td style={{ padding: '10px 14px', fontWeight: 500 }}>{r.title || '—'}</td>
                <td style={kind === 'certificate' ? { padding: '10px 14px', textAlign: 'right', fontWeight: 600 } : { padding: '10px 14px', color: '#5C6770' }}>
                  {kind === 'certificate' ? baht(Number(r.data.value) || 0) : `${String(r.data.deliver_by || '-')} → ${String(r.data.deliver_to || '-')}`}
                </td>
                <td style={{ padding: '10px 18px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button onClick={() => setPrinting(r)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>🖨 พิมพ์</button>
                  <button onClick={() => remove(r.id)} style={{ marginLeft: 6, border: 'none', background: 'none', color: '#C24036', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {printing && <HandoverPrint doc={printing} houseName={houses.find((h) => h.code === printing.house_code)?.name || printing.house_code} onClose={() => setPrinting(null)} />}
    </div>
  )
}
