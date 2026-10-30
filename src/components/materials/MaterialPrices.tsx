import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../store'
import type { ApiMaterialPrice } from '../../store'
import { api } from '../../api'
import LaborRates from './LaborRates'
import ModalShell, { KeepAlive } from '../shared/ModalShell'
import { InlinePrice, PriceHistoryModal, ImportPricesModal, exportPricesXlsx } from './PriceTools'
import MergePricesModal from './MergePrices'

// ราคากลางวัสดุ — อ้างอิงจากประวัติสั่งซื้อจริง ใช้เตือนราคาแพงตอนทำ PR/PO
const money = (n: number) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
const confColor = (c: string) =>
  c === 'สูง' ? { c: '#2E7D55', bg: '#E2F1EA' }
    : c === 'กลาง' ? { c: '#C0852C', bg: '#F6ECD6' }
      : c === 'ต่ำ' ? { c: '#5C6770', bg: '#EDF1F4' }
        : { c: '#6B4E9E', bg: '#EEE8F6' } // กำหนดเอง
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13.5, border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 11px', outline: 'none', width: '100%', boxSizing: 'border-box' }

// เดา "จำนวนชิ้นต่อแพ็ค" จากหน่วยหรือชื่อ เช่น "3 ชิ้น" · "2อัน" · "แพ็ค 3" · "x2" — ใช้เตือน + เติมตัวหารให้
export function packOf(m: ApiMaterialPrice): number | null {
  // นับเฉพาะหน่วยนับชิ้น — ไม่รวมสเปคขนาด (กก/เมตร/มม เช่น "ปูน 50 กก" ไม่ใช่แพ็ค 50)
  const UNITS = 'ชิ้น|อัน|ตัว|เส้น|แผ่น|ใบ|ก้อน|คู่|เม็ด|ดอก|ขวด|ม้วน|แท่ง|หลอด|มัด'
  const dims = /\d+\s*[xX×]\s*\d+/ // ขนาด เช่น กระเบื้อง 60x60 ไม่ใช่แพ็ค
  for (const src of [m.unit || '', m.name || '']) {
    if (!src) continue
    let mm = src.match(new RegExp(`(\\d+)\\s*(?:${UNITS})`))
    if (!mm) mm = src.match(/(?:แพ็ค|แพค|ชุด|โหล)\s*(\d+)/)
    if (!mm && !dims.test(src)) mm = src.match(/[xX×]\s*(\d+)/)
    const n = mm ? Number(mm[1]) : 0
    if (n >= 2 && n <= 144) return n
  }
  return null
}

type Form = { name: string; unit: string; central: string; min: string; max: string; latest: string; note: string }
const emptyForm: Form = { name: '', unit: '', central: '', min: '', max: '', latest: '', note: '' }

export default function MaterialPrices() {
  const app = useApp()
  const list = app.data.materialPrices || []
  const canEdit = app.user?.role === 'admin' || app.user?.role === 'accounting'
  const [tab, setTab] = useState<'material' | 'labor'>('material')
  // แท็บค่าแรง: เปิดแล้วเก็บไว้เบื้องหลัง — ฟอร์มค่าแรงที่ย่อค้างไว้ไม่หายตอนสลับไปแท็บวัสดุ
  const [laborSeen, setLaborSeen] = useState(false)
  if (tab === 'labor' && !laborSeen) setLaborSeen(true)
  const [q, setQ] = useState('')
  const [conf, setConf] = useState<'all' | 'สูง' | 'กลาง' | 'ต่ำ' | 'เก่า'>('all') // เก่า = ราคาไม่ได้ยืนยันเกิน 6 เดือน
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<ApiMaterialPrice | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<Form>(emptyForm)
  const [err, setErr] = useState('')
  const [history, setHistory] = useState<ApiMaterialPrice | null>(null) // ประวัติราคาของรายการนี้
  const [importing, setImporting] = useState(false) // นำเข้า Excel
  // รวมรายการซ้ำ: 'auto' = ให้ระบบหากลุ่ม · [กลุ่ม] = รวมที่ติ๊กเลือกเอง
  const [merging, setMerging] = useState<'auto' | ApiMaterialPrice[][] | null>(null)
  const [picked, setPicked] = useState<number[]>([])
  // ชื่อเรียกอื่นของแต่ละรายการ (จากการรวมรายการ / จำจากการถอดแบบ)
  const [aliases, setAliases] = useState<Map<number, string[]>>(new Map())
  // = ชื่อเรียกอื่นที่จำไว้ + ชื่อของรายการที่ถูกรวมเข้ามา
  const loadAliases = () => Promise.all([
    api.get<{ mp_id: number; alias: string; unit: string }[]>('/material-aliases'),
    api.get<(ApiMaterialPrice & { merged_into?: number | null })[]>('/material-prices?all=1'),
  ]).then(([xs, all]) => {
    const m = new Map<number, string[]>()
    const add = (id: number, label: string) => { const cur = m.get(id) || []; if (!cur.includes(label)) m.set(id, [...cur, label]) }
    for (const a of xs) add(a.mp_id, a.alias + (a.unit ? ' (' + a.unit + ')' : ''))
    for (const x of all) if (x.merged_into) add(x.merged_into, x.name + (x.unit ? ' (' + x.unit + ')' : ''))
    setAliases(m)
  }).catch(() => {})
  useEffect(() => { loadAliases() }, [])

  const counts = useMemo(() => ({
    all: list.length,
    สูง: list.filter((m) => m.confidence === 'สูง').length,
    กลาง: list.filter((m) => m.confidence === 'กลาง').length,
    ต่ำ: list.filter((m) => m.confidence === 'ต่ำ').length,
    เก่า: list.filter((m) => m.stale).length,
  }), [list])

  const ql = q.trim().toLowerCase()
  const rows = list
    .filter((m) => (conf === 'all' || (conf === 'เก่า' ? m.stale : m.confidence === conf)) && `${m.name} ${m.unit}`.toLowerCase().includes(ql))

  const reload = () => app.reloadData('materialPrices', '/material-prices')
  const afterMerge = async () => { setPicked([]); await Promise.all([reload(), loadAliases()]) }

  const recompute = async () => {
    if (!confirm('อัปเดตราคากลางจากประวัติการสั่งซื้อจริงในระบบ (รายการในใบสั่งซื้อ PO = ราคาที่ซื้อจริง)?\nรายการที่ตั้งราคาเองจะไม่ถูกทับ')) return
    setBusy(true)
    try {
      const r = await api.post<{ updated: number; added: number; groups: number }>('/material-prices/recompute', {})
      await reload()
      alert(`อัปเดตจากประวัติจริงแล้ว\n• แก้ไข ${r.updated} รายการ\n• เพิ่มใหม่ ${r.added} รายการ\n• ประมวลจากวัสดุ ${r.groups} ชนิด`)
    } catch (e) { alert('อัปเดตไม่สำเร็จ: ' + (e as Error).message) }
    setBusy(false)
  }

  const openAdd = () => { setForm(emptyForm); setErr(''); setAdding(true); setEditing(null) }
  const openEdit = (m: ApiMaterialPrice) => {
    setForm({ name: m.name, unit: m.unit || '', central: String(m.central ?? ''), min: String(m.min ?? ''), max: String(m.max ?? ''), latest: String(m.latest ?? ''), note: m.note || '' })
    setErr(''); setEditing(m); setAdding(false)
  }
  const closeForm = () => { setEditing(null); setAdding(false); setErr('') }

  const save = async () => {
    if (!form.name.trim()) { setErr('กรุณากรอกชื่อวัสดุ'); return }
    setBusy(true)
    const body = { name: form.name.trim(), unit: form.unit.trim(), central: Number(form.central) || 0, min: Number(form.min) || undefined, max: Number(form.max) || undefined, latest: Number(form.latest) || undefined, note: form.note.trim() }
    try {
      if (editing) await api.put('/material-prices/' + editing.id, body)
      else await api.post('/material-prices', body)
      await reload(); closeForm()
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  // แปลงราคาแพ็ค → ราคาต่อ 1 ชิ้น (หารทุกช่องราคา + แก้หน่วย)
  const perPiece = async (m: ApiMaterialPrice) => {
    const guess = packOf(m)
    const v = window.prompt(`"${m.name}"\nราคาตอนนี้ ฿${money(m.central)} ต่อ "${m.unit || '-'}"\n\nราคานี้เป็นราคาต่อกี่ชิ้น? (ระบบจะหารให้เป็นราคาต่อ 1 ชิ้น)`, String(guess || 2))
    if (v == null) return
    const pack = Number(v.replace(/[^\d]/g, ''))
    if (!(pack >= 2)) { alert('ต้องเป็นตัวเลข 2 ขึ้นไป'); return }
    const newPrice = Math.round((m.central / pack) * 100) / 100
    if (!confirm(`฿${money(m.central)} ÷ ${pack} = ฿${money(newPrice)} ต่อ 1 ชิ้น\nยืนยันแปลง? (ต่ำสุด/สูงสุด/ล่าสุด จะถูกหารด้วย)`)) return
    setBusy(true)
    try { await api.post('/material-prices/' + m.id + '/per-piece', { pack }); await reload() }
    catch (e) { alert('แปลงไม่สำเร็จ: ' + (e as Error).message) }
    setBusy(false)
  }
  const suspected = useMemo(() => list.filter((m) => packOf(m) != null).length, [list])

  // แก้ราคากลางในตารางทันที → เป็น "ตั้งราคาเอง" + เก็บประวัติ (ฝั่ง server)
  const savePrice = async (m: ApiMaterialPrice, central: number) => { await api.put('/material-prices/' + m.id, { central }); await reload() }

  const remove = async (m: ApiMaterialPrice) => {
    if (!confirm(`ลบราคากลาง "${m.name}" ?`)) return
    setBusy(true)
    try { await api.del('/material-prices/' + m.id); await reload() } catch (e) { alert('ลบไม่สำเร็จ: ' + (e as Error).message) }
    setBusy(false)
  }

  const th: React.CSSProperties = { padding: '9px 12px', fontSize: 12, fontWeight: 600, color: '#5C6770', textAlign: 'left', borderBottom: '1px solid #E1E5EA', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #EEF1F4', verticalAlign: 'top' }

  const tabBtn = (id: 'material' | 'labor', label: string) => (
    <button onClick={() => setTab(id)} style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 9, padding: '8px 16px', cursor: 'pointer', color: tab === id ? '#fff' : '#30506A', background: tab === id ? '#30506A' : '#E2E9EF' }}>{label}</button>
  )

  // ฟอร์มเพิ่ม/แก้ — วางนอกส่วนที่สลับแท็บ (ตำแหน่งเดียวกันทั้ง 2 แท็บ) เพื่อให้ย่อพับค้างไว้แล้วสลับแท็บได้โดยข้อมูลไม่หาย
  const formModal = (adding || editing) && (
    <MaterialPriceFormModal editing={editing} form={form} setForm={setForm} err={err} busy={busy} save={save} closeForm={closeForm} />
  )

  const laborKeep = laborSeen && (<div style={{ maxWidth: 1180 }}><KeepAlive active={tab === 'labor'} onShow={() => setTab('labor')}><LaborRates /></KeepAlive></div>)

  if (tab === 'labor') {
    return (
      <>
      <div style={{ maxWidth: 1180 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1E2E3B' }}>ราคากลางค่าแรงช่าง</div>
            <div style={{ fontSize: 12.5, color: '#94A0A8' }}>ใบเทียบราคากลางวัสดุและค่าแรง (Standard Labor Cost) · ราคาแนะนำตอนจ้างช่าง</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>{tabBtn('material', 'วัสดุ')}{tabBtn('labor', 'ค่าแรงช่าง')}</div>
        </div>
      </div>
      {formModal}
      {laborKeep}
      </>
    )
  }

  return (
    <>
    <div style={{ maxWidth: 1180 }}>
      {/* หัว + ปุ่ม */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#1E2E3B' }}>ราคากลางวัสดุ</div>
          <div style={{ fontSize: 12.5, color: '#94A0A8' }}>อ้างอิงจากประวัติสั่งซื้อจริง · ใช้เตือนเมื่อราคาที่กรอกใน PR/PO สูงกว่าราคากลาง</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>{tabBtn('material', 'วัสดุ')}{tabBtn('labor', 'ค่าแรงช่าง')}</div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => exportPricesXlsx(list).catch((e) => alert('ดาวน์โหลดไม่สำเร็จ: ' + (e as Error).message))} title="ดาวน์โหลดราคากลางทั้งหมด แก้ราคาใน Excel แล้วนำเข้ากลับ" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#2E7D55', background: '#E2F1EA', border: 'none', borderRadius: 9, padding: '9px 15px', cursor: 'pointer' }}>⬇ ดาวน์โหลด Excel</button>
            <button onClick={() => setImporting(true)} title="นำเข้าราคาที่แก้ใน Excel (ตรวจก่อนบันทึก)" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#2E7D55', background: '#E2F1EA', border: 'none', borderRadius: 9, padding: '9px 15px', cursor: 'pointer' }}>⬆ นำเข้า Excel</button>
            {picked.length >= 2 && <button onClick={() => setMerging([list.filter((m) => picked.includes(m.id))])} style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#6B4E9E', border: 'none', borderRadius: 9, padding: '9px 15px', cursor: 'pointer' }}>รวมที่เลือก ({picked.length})</button>}
            <button onClick={() => setMerging('auto')} title="หารายการที่ชื่อซ้ำ/สะกดต่าง แล้วรวมเป็นรายการมาตรฐาน" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#6B4E9E', background: '#EEE8F6', border: 'none', borderRadius: 9, padding: '9px 15px', cursor: 'pointer' }}>🧹 รวมรายการซ้ำ</button>
            <button onClick={recompute} disabled={busy} style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#30506A', background: '#E2E9EF', border: 'none', borderRadius: 9, padding: '9px 15px', cursor: busy ? 'default' : 'pointer' }}>↻ อัปเดตจากประวัติจริง</button>
            <button onClick={openAdd} style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 15px', cursor: 'pointer' }}>+ เพิ่มรายการ</button>
          </div>
        )}
      </div>

      {suspected > 0 && canEdit && (
        <div style={{ fontSize: 12.5, color: '#8A6A1F', background: '#FBF4E1', border: '1px solid #ECDCB8', borderRadius: 10, padding: '9px 13px', marginBottom: 10 }}>
          💡 พบ {suspected} รายการที่หน่วย/ชื่อดูเป็น "ราคาต่อหลายชิ้น" (มีป้ายเหลืองในตาราง) — กดปุ่ม <b>÷ ต่อชิ้น</b> ท้ายแถวเพื่อแปลงเป็นราคาต่อ 1 ชิ้น (ระบบเดาตัวหารให้ แก้ได้ก่อนยืนยัน)
        </div>
      )}

      {/* ตัวกรองความเชื่อมั่น */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {([['all', 'ทั้งหมด'], ['สูง', 'เชื่อมั่นสูง'], ['กลาง', 'ปานกลาง'], ['ต่ำ', 'ซื้อครั้งเดียว'], ['เก่า', '⏳ ราคาเก่า']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setConf(id)}
            style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, border: 'none', borderRadius: 20, padding: '6px 13px', cursor: 'pointer', color: conf === id ? '#fff' : '#5C6770', background: conf === id ? '#30506A' : '#EDF1F4' }}>
            {label} <span style={{ opacity: 0.8 }}>{counts[id]}</span>
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อวัสดุ / หน่วย" style={{ ...field, width: 260, marginLeft: 'auto', padding: '7px 11px' }} />
      </div>

      {/* ตาราง */}
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 13, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                {canEdit && <th style={{ ...th, width: 30 }} title="ติ๊ก 2 รายการขึ้นไป แล้วกด รวมที่เลือก"></th>}
                <th style={th}>รายการวัสดุ</th>
                <th style={{ ...th, textAlign: 'center' }}>หน่วย</th>
                <th style={{ ...th, textAlign: 'right' }}>ราคากลาง</th>
                <th style={{ ...th, textAlign: 'right' }}>ต่ำสุด–สูงสุด</th>
                <th style={{ ...th, textAlign: 'right' }}>ล่าสุด</th>
                <th style={{ ...th, textAlign: 'center' }}>ครั้งที่ซื้อ</th>
                <th style={{ ...th, textAlign: 'center' }}>ความเชื่อมั่น</th>
                {canEdit && <th style={{ ...th, textAlign: 'right' }}></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const cc = confColor(m.confidence)
                const packGuess = packOf(m)
                return (
                  <tr key={m.id} style={{ background: picked.includes(m.id) ? '#F4F0FA' : undefined }}>
                    {canEdit && <td style={td}><input type="checkbox" checked={picked.includes(m.id)} onChange={() => setPicked(picked.includes(m.id) ? picked.filter((x) => x !== m.id) : [...picked, m.id])} /></td>}
                    <td style={td}>
                      <div style={{ fontWeight: 500 }}>{m.name}</div>
                      {aliases.get(m.id) && <span title={'ชื่อเรียกอื่น:\n' + aliases.get(m.id)!.join('\n')} style={{ fontSize: 10.5, color: '#2E7D55', background: '#E2F1EA', borderRadius: 6, padding: '1px 6px', marginRight: 4, cursor: 'help' }}>ชื่อเรียกอื่น {aliases.get(m.id)!.length}</span>}
                      {m.source && m.source !== 'ประวัติ' && <span style={{ fontSize: 10.5, color: '#6B4E9E', background: '#EEE8F6', borderRadius: 6, padding: '1px 6px' }}>{m.source === 'กำหนดเอง' ? 'ตั้งราคาเอง' : m.source}</span>}
                    </td>
                    <td style={{ ...td, textAlign: 'center', color: '#5C6770', whiteSpace: 'nowrap' }}>
                      {m.unit || '–'}
                      {packGuess != null && <div style={{ fontSize: 10, fontWeight: 700, color: '#B7791F', background: '#F6ECD6', borderRadius: 6, padding: '1px 6px', marginTop: 2 }}>ราคาต่อ {packGuess} ชิ้น?</div>}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#1E2E3B', whiteSpace: 'nowrap' }} className="num"><InlinePrice value={m.central} canEdit={canEdit} onSave={(v) => savePrice(m, v)} />{m.stale
                        ? <div title={'ราคานี้ยืนยันล่าสุด ' + (m.price_date || '-') + ' — ควรเช็คราคาใหม่ก่อนใช้ทำ BOQ'} style={{ fontSize: 10.5, fontWeight: 600, color: '#B7791F' }}>⏳ ราคาเก่า {Math.floor((m.price_age_days || 0) / 30)} เดือน</div>
                        : m.price_date && <div style={{ fontSize: 10.5, fontWeight: 400, color: '#94A0A8' }}>{m.price_date}</div>}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#5C6770', whiteSpace: 'nowrap' }} className="num">{money(m.min)}–{money(m.max)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#5C6770' }} className="num">{money(m.latest)}</td>
                    <td style={{ ...td, textAlign: 'center', color: '#5C6770' }} className="num">{m.po_count || '–'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span title={`ซื้อ ${m.po_count || 0} ครั้ง${m.central > 0 && m.max > m.min ? ` · ราคาแกว่ง ${Math.round(((m.max - m.min) / m.central) * 100)}%` : ''} · สูง = ซื้อ ≥4 ครั้ง · กลาง = 2–3 · ต่ำ = 1 · ราคาแกว่งเกิน 15% ลดลง 1 ขั้น`} style={{ fontSize: 11.5, fontWeight: 600, color: cc.c, background: cc.bg, borderRadius: 20, padding: '2px 10px', whiteSpace: 'nowrap', cursor: 'help' }}>{m.confidence}</span>
                    </td>
                    {canEdit && (
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => perPiece(m)} title="ราคานี้เป็นราคาต่อหลายชิ้น? หารให้เป็นราคาต่อ 1 ชิ้น" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: packGuess != null ? 700 : 400, color: '#B7791F', background: packGuess != null ? '#F6ECD6' : 'none', border: '1px solid #ECDCB8', borderRadius: 7, padding: '4px 10px', cursor: 'pointer', marginRight: 5 }}>÷ ต่อชิ้น</button>
                        <button onClick={() => setHistory(m)} title="ประวัติราคา" style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#30506A', background: 'none', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 8px', cursor: 'pointer', marginRight: 5 }}>🕘</button>
                        <button onClick={() => openEdit(m)} style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#30506A', background: 'none', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer', marginRight: 5 }}>แก้</button>
                        <button onClick={() => remove(m)} style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#C24036', background: 'none', border: '1px solid #EDD3CE', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>ลบ</button>
                      </td>
                    )}
                  </tr>
                )
              })}
              {!rows.length && <tr><td colSpan={canEdit ? 9 : 7} style={{ ...td, textAlign: 'center', color: '#94A0A8', padding: 28 }}>ไม่พบรายการ</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 8 }}>แสดง {rows.length} จาก {list.length} รายการ · ราคากลาง = ราคาเฉลี่ยถ่วงน้ำหนักตามปริมาณที่ซื้อจริง{canEdit && ' · คลิกที่ราคากลางเพื่อแก้ได้ทันที (Enter บันทึก · Esc ยกเลิก) · 🕘 = ประวัติราคา'}</div>
    </div>
    {formModal}
    {history && <PriceHistoryModal mp={history} onClose={() => setHistory(null)} />}
    {importing && <ImportPricesModal onClose={() => setImporting(false)} onDone={reload} />}
    {merging && <MergePricesModal groups={merging === 'auto' ? undefined : merging} onClose={() => setMerging(null)} onDone={afterMerge} />}
    {laborKeep}
    </>
  )
}

function MaterialPriceFormModal({ editing, form, setForm, err, busy, save, closeForm }: {
  editing: ApiMaterialPrice | null
  form: Form
  setForm: (f: Form) => void
  err: string
  busy: boolean
  save: () => void
  closeForm: () => void
}) {
  return (
        <ModalShell
          title={editing ? 'แก้ราคากลาง' : 'เพิ่มราคากลางวัสดุ'}
          sub={editing ? 'แก้แล้วจะถูกทำเครื่องหมายว่า “ตั้งราคาเอง” และจะไม่ถูกทับตอนอัปเดตจากประวัติ' : 'ราคากลางที่กรอกเองจะไม่ถูกทับตอนอัปเดตจากประวัติจริง'}
          onClose={closeForm}
          width={460}
          zIndex={70}
        >
            <div style={{ display: 'grid', gap: 11 }}>
              <div>
                <label style={{ fontSize: 12, color: '#5C6770' }}>ชื่อวัสดุ *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={field} placeholder="เช่น ปูนซีเมนต์ ตรานกอินทรี แดง" />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 120 }}>
                  <label style={{ fontSize: 12, color: '#5C6770' }}>หน่วย</label>
                  <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} style={field} placeholder="ถุง / เส้น / คิว" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: '#5C6770' }}>ราคากลาง (บาท/หน่วย) *</label>
                  <input value={form.central} onChange={(e) => setForm({ ...form, central: e.target.value })} inputMode="decimal" style={field} placeholder="0.00" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {([['min', 'ต่ำสุด'], ['max', 'สูงสุด'], ['latest', 'ล่าสุด']] as const).map(([k, l]) => (
                  <div key={k} style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: '#5C6770' }}>{l}</label>
                    <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} inputMode="decimal" style={field} placeholder="(ถ้าไม่ใส่ = ราคากลาง)" />
                  </div>
                ))}
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#5C6770' }}>หมายเหตุ</label>
                <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={field} placeholder="(ไม่บังคับ)" />
              </div>
              {err && <div style={{ fontSize: 12.5, color: '#C24036' }}>{err}</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 18 }}>
              <button onClick={closeForm} style={{ fontFamily: 'inherit', fontSize: 13.5, color: '#1C2730', background: '#EDF1F4', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ยกเลิก</button>
              <button onClick={save} disabled={busy} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 9, padding: '9px 20px', cursor: busy ? 'default' : 'pointer' }}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
            </div>
        </ModalShell>
  )
}
