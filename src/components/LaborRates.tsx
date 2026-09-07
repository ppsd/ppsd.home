import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store'
import type { ApiLaborRate } from '../store'
import { laborLabel, laborPriceText } from '../store'
import { api } from '../api'

// ราคากลางค่าแรงช่าง — ใบเทียบราคากลางของฝ่ายประเมินราคาและจัดซื้อ
// ใช้เป็น "ราคาแนะนำ" ตอนจ้างช่างในบ้าน (แท็บ ช่าง/ผู้รับเหมา): ต้องหาถูกกว่าหรือเท่ากับราคานี้
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13.5, border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 11px', outline: 'none', width: '100%', boxSizing: 'border-box' }
const GROUPS: ApiLaborRate['grp'][] = ['เหมายกหลัง', 'แยกงาน']
const UNITS = ['ตร.ม.', 'เมตร', 'ชุด', 'บาน', 'ห้อง', 'หลัง', 'เมตร/ขั้น', 'จุด', 'เหมา']

type Form = { grp: ApiLaborRate['grp']; seq: string; name: string; variant: string; price_min: string; price_max: string; unit: string; note: string; quote: boolean }
const emptyForm: Form = { grp: 'แยกงาน', seq: '', name: '', variant: '', price_min: '', price_max: '', unit: 'ตร.ม.', note: '', quote: false }

export function useLaborRates() {
  const [rates, setRates] = useState<ApiLaborRate[]>([])
  const reload = () => api.get<ApiLaborRate[]>('/labor-rates').then(setRates).catch(() => setRates([]))
  useEffect(() => { reload() }, [])
  return { rates, reload }
}

export default function LaborRates() {
  const app = useApp()
  const canEdit = app.user?.role === 'admin' || app.user?.role === 'accounting'
  const { rates, reload } = useLaborRates()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<ApiLaborRate | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<Form>(emptyForm)
  const [err, setErr] = useState('')

  const ql = q.trim().toLowerCase()
  const rows = useMemo(() => rates.filter((r) => `${r.name} ${r.variant} ${r.unit} ${r.note || ''}`.toLowerCase().includes(ql)), [rates, ql])
  const byGroup = (g: ApiLaborRate['grp']) => rows.filter((r) => r.grp === g)

  const openAdd = (grp: ApiLaborRate['grp'] = 'แยกงาน') => { setForm({ ...emptyForm, grp }); setErr(''); setAdding(true); setEditing(null) }
  const openEdit = (r: ApiLaborRate) => {
    setForm({ grp: r.grp, seq: String(r.seq || ''), name: r.name, variant: r.variant || '', price_min: String(r.price_min || ''), price_max: String(r.price_max || ''), unit: r.unit || '', note: r.note || '', quote: !(r.price_max > 0) })
    setErr(''); setEditing(r); setAdding(false)
  }
  const closeForm = () => { setEditing(null); setAdding(false); setErr('') }
  const save = async () => {
    if (!form.name.trim()) { setErr('กรุณากรอกชื่อหมวดงาน'); return }
    const min = form.quote ? 0 : Number(String(form.price_min).replace(/,/g, '')) || 0
    const max = form.quote ? 0 : Number(String(form.price_max).replace(/,/g, '')) || min
    if (!form.quote && !(min > 0)) { setErr('กรอกราคากลาง (หรือติ๊ก "เสนอราคา" ถ้าไม่มีราคาตายตัว)'); return }
    setBusy(true)
    const body = { grp: form.grp, seq: Number(form.seq) || undefined, name: form.name.trim(), variant: form.variant.trim(), price_min: min, price_max: Math.max(min, max), unit: form.unit.trim() || 'ตร.ม.', note: form.note.trim() || (form.quote ? 'เสนอราคา' : '') }
    try {
      if (editing) await api.put('/labor-rates/' + editing.id, body)
      else await api.post('/labor-rates', body)
      await reload(); closeForm()
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  const remove = async (r: ApiLaborRate) => {
    if (!confirm(`ลบราคากลาง "${laborLabel(r)}" ?\n(ช่างที่เคยจ้างด้วยหมวดนี้ยังแสดงข้อมูลเดิมได้)`)) return
    setBusy(true)
    try { await api.del('/labor-rates/' + r.id); await reload() } catch (e) { alert('ลบไม่สำเร็จ: ' + (e as Error).message) }
    setBusy(false)
  }

  const th: React.CSSProperties = { padding: '9px 12px', fontSize: 12, fontWeight: 600, color: '#5C6770', textAlign: 'left', borderBottom: '1px solid #E1E5EA', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #EEF1F4', verticalAlign: 'top' }

  const Table = ({ grp, title }: { grp: ApiLaborRate['grp']; title: string }) => {
    const list = byGroup(grp)
    return (
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 13, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '11px 14px', background: '#F7F9FB', borderBottom: '1px solid #E1E5EA' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E2E3B' }}>{title}</div>
          <span style={{ marginLeft: 8, fontSize: 11.5, color: '#94A0A8' }}>{list.length} รายการ</span>
          {canEdit && <button onClick={() => openAdd(grp)} style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#30506A', background: '#E2E9EF', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>+ เพิ่มในหมวดนี้</button>}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 56, textAlign: 'center' }}>ลำดับ</th>
                <th style={th}>หมวดหมู่ / รายการ</th>
                <th style={th}>แบบ</th>
                <th style={{ ...th, textAlign: 'right' }}>ค่าแรง + วัสดุสิ้นเปลือง (บาท)</th>
                <th style={{ ...th, textAlign: 'center' }}>หน่วย</th>
                <th style={th}>หมายเหตุ</th>
                {canEdit && <th style={{ ...th, textAlign: 'right' }}></th>}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const quote = !(r.price_max > 0)
                return (
                  <tr key={r.id}>
                    <td style={{ ...td, textAlign: 'center', color: '#5C6770' }} className="num">{r.seq}</td>
                    <td style={{ ...td, fontWeight: 500 }}>{r.name}</td>
                    <td style={{ ...td, color: '#5C6770' }}>{r.variant || '–'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: quote ? '#6B4E9E' : '#1E2E3B', whiteSpace: 'nowrap' }} className="num">
                      {quote ? 'เสนอราคา' : r.price_min === r.price_max ? r.price_max.toLocaleString('en-US') : `${r.price_min.toLocaleString('en-US')} – ${r.price_max.toLocaleString('en-US')}`}
                    </td>
                    <td style={{ ...td, textAlign: 'center', color: '#5C6770', whiteSpace: 'nowrap' }}>{r.unit}</td>
                    <td style={{ ...td, color: '#5C6770' }}>{r.note && r.note !== 'เสนอราคา' ? r.note : ''}</td>
                    {canEdit && (
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => openEdit(r)} style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#30506A', background: 'none', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer', marginRight: 5 }}>แก้</button>
                        <button onClick={() => remove(r)} disabled={busy} style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#C24036', background: 'none', border: '1px solid #EDD3CE', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>ลบ</button>
                      </td>
                    )}
                  </tr>
                )
              })}
              {!list.length && <tr><td colSpan={canEdit ? 7 : 6} style={{ ...td, textAlign: 'center', color: '#94A0A8', padding: 22 }}>ไม่พบรายการ</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, color: '#94A0A8' }}>ราคาแนะนำตอนจ้างช่าง — เลือกหมวดงานในแท็บ “ช่าง / ผู้รับเหมา” ของบ้าน แล้วระบบจะเทียบราคาตกลงกับตารางนี้ให้ · ต้องหาถูกกว่าหรือเท่ากับราคากลาง</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาหมวดงาน / หน่วย" style={{ ...field, width: 240, marginLeft: 'auto', padding: '7px 11px' }} />
        {canEdit && <button onClick={() => openAdd('แยกงาน')} style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 15px', cursor: 'pointer' }}>+ เพิ่มหมวดงาน</button>}
      </div>
      <Table grp="เหมายกหลัง" title="ราคาค่าแรงแบบเหมายกหลัง" />
      <Table grp="แยกงาน" title="ราคาค่าแรงแยกแต่ละงาน" />
      <div style={{ fontSize: 11.5, color: '#94A0A8' }}>อ้างอิง: ฝ่ายประเมินราคาและจัดซื้อ · ตัวเลขทั้งหมดรวมค่าแรง + วัสดุสิ้นเปลือง · “เสนอราคา” = ไม่มีราคากลางตายตัว ต้องขอใบเสนอราคาเทียบ</div>

      {(adding || editing) && (
        <div onClick={closeForm} style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.45)', zIndex: 70, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflow: 'auto', padding: '48px 16px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 480, maxWidth: '100%', padding: '22px 24px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
            <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 4 }}>{editing ? 'แก้ราคากลางค่าแรง' : 'เพิ่มหมวดงาน / ราคากลางค่าแรง'}</div>
            <div style={{ fontSize: 12, color: '#94A0A8', marginBottom: 16 }}>ราคาที่ใส่ = ค่าแรง + วัสดุสิ้นเปลือง ต่อ 1 หน่วย · ถ้าเป็นช่วง ใส่ต่ำสุด–สูงสุด</div>
            <div style={{ display: 'grid', gap: 11 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: '#5C6770' }}>กลุ่ม</label>
                  <select value={form.grp} onChange={(e) => setForm({ ...form, grp: e.target.value as ApiLaborRate['grp'] })} style={field}>
                    {GROUPS.map((g) => <option key={g} value={g}>{g === 'เหมายกหลัง' ? 'เหมายกหลัง' : 'แยกแต่ละงาน'}</option>)}
                  </select>
                </div>
                <div style={{ width: 90 }}>
                  <label style={{ fontSize: 12, color: '#5C6770' }}>ลำดับ</label>
                  <input value={form.seq} onChange={(e) => setForm({ ...form, seq: e.target.value })} inputMode="numeric" style={field} placeholder="อัตโนมัติ" />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#5C6770' }}>หมวดหมู่ / รายการ *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={field} placeholder="เช่น งานก่อผนังอิฐแดง" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#5C6770' }}>แบบย่อย (ถ้ามี)</label>
                <input value={form.variant} onChange={(e) => setForm({ ...form, variant: e.target.value })} style={field} placeholder="เช่น รวมไม้แบบ / ภายใน / ตลับ" />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#3C4750', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.quote} onChange={(e) => setForm({ ...form, quote: e.target.checked })} />
                ไม่มีราคากลางตายตัว (เสนอราคา)
              </label>
              {!form.quote && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: '#5C6770' }}>ราคาต่ำสุด (บาท/หน่วย) *</label>
                    <input value={form.price_min} onChange={(e) => setForm({ ...form, price_min: e.target.value })} inputMode="decimal" style={field} placeholder="120" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: '#5C6770' }}>ราคาสูงสุด</label>
                    <input value={form.price_max} onChange={(e) => setForm({ ...form, price_max: e.target.value })} inputMode="decimal" style={field} placeholder="(ว่าง = เท่าต่ำสุด)" />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 150 }}>
                  <label style={{ fontSize: 12, color: '#5C6770' }}>หน่วย</label>
                  <input list="labor-units" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} style={field} placeholder="ตร.ม." />
                  <datalist id="labor-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: '#5C6770' }}>หมายเหตุ</label>
                  <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={field} placeholder="เช่น ต้องเป็นบริษัท มี VAT" />
                </div>
              </div>
              {!form.quote && form.name && (Number(form.price_min) > 0) && (
                <div style={{ fontSize: 12.5, color: '#2E7D55', background: '#E2F1EA', borderRadius: 8, padding: '7px 11px' }}>
                  จะแสดงเป็น: <b>{laborLabel({ name: form.name, variant: form.variant })}</b> · ราคากลาง {laborPriceText({ price_min: Number(form.price_min) || 0, price_max: Math.max(Number(form.price_min) || 0, Number(form.price_max) || 0), unit: form.unit || 'ตร.ม.' })}
                </div>
              )}
              {err && <div style={{ fontSize: 12.5, color: '#C24036' }}>{err}</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 18 }}>
              <button onClick={closeForm} style={{ fontFamily: 'inherit', fontSize: 13.5, color: '#1C2730', background: '#EDF1F4', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ยกเลิก</button>
              <button onClick={save} disabled={busy} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 9, padding: '9px 20px', cursor: busy ? 'default' : 'pointer' }}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
