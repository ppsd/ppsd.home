import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { ApiLaborRate } from '../../store'
import { laborLabel } from '../../store'
import { exportXlsxBook } from '../../exportCsv'
import ModalShell from '../shared/ModalShell'

// เครื่องมือแก้ราคากลางค่าแรง (แบบเดียวกับราคากลางวัสดุ): แก้ราคาในตารางทันที · ประวัติราคา · ดาวน์โหลด/นำเข้า Excel (ตรวจก่อนบันทึก)
// ราคาค่าแรงเป็นช่วง ต่ำสุด–สูงสุด · 0/ว่าง = เสนอราคา

const n0 = (n: number) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
export const rangeText = (min: number, max: number) => !(max > 0) ? 'เสนอราคา' : min === max ? n0(max) : `${n0(min)} – ${n0(max)}`
const btn: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 9, padding: '9px 15px', cursor: 'pointer' }

/** "135" → 135–135 · "120-150" → 120–150 · "0" / "เสนอราคา" / ว่าง → เสนอราคา */
function parseRange(t: string): [number, number] | null {
  const s = t.replace(/[,฿\s]/g, '')
  if (s === '' || /เสนอ/.test(s)) return [0, 0]
  const m = /^(\d+(?:\.\d+)?)(?:[-–~](\d+(?:\.\d+)?))?$/.exec(s)
  if (!m) return null
  const a = Number(m[1]), b = m[2] != null ? Number(m[2]) : a
  return [Math.min(a, b), Math.max(a, b)]
}

/** ช่องราคาค่าแรงที่คลิกแล้วพิมพ์ทับได้ — "135" หรือ "120-150" · 0 = เสนอราคา · Enter บันทึก · Esc ยกเลิก */
export function InlineRange({ min, max, canEdit, onSave }: { min: number; max: number; canEdit: boolean; onSave: (min: number, max: number) => Promise<void> }) {
  const [edit, setEdit] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const done = useRef(false)
  const shown = rangeText(min, max)
  if (!canEdit) return <>{shown}</>
  const start = () => { setText(!(max > 0) ? '0' : min === max ? String(max) : `${min}-${max}`); done.current = false; setEdit(true) }
  const commit = async () => {
    if (done.current) return
    done.current = true
    const r = parseRange(text)
    if (!r) { alert('พิมพ์ราคาเป็นตัวเลข เช่น 135 หรือช่วง 120-150 (0 = เสนอราคา)'); setEdit(false); return }
    if (Math.round(r[0] * 100) === Math.round(min * 100) && Math.round(r[1] * 100) === Math.round(max * 100)) { setEdit(false); return }
    setBusy(true)
    try { await onSave(r[0], r[1]) } catch (e) { alert('บันทึกไม่สำเร็จ: ' + (e as Error).message) }
    setBusy(false); setEdit(false)
  }
  if (edit) {
    return (
      <input autoFocus value={text} disabled={busy} onChange={(e) => setText(e.target.value)} onFocus={(e) => e.target.select()} placeholder="135 หรือ 120-150"
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { done.current = true; setEdit(false); e.stopPropagation() } }}
        onBlur={commit}
        style={{ width: 120, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, textAlign: 'right', border: '1.5px solid #30506A', borderRadius: 7, padding: '4px 7px', outline: 'none' }} />
    )
  }
  return <span onClick={start} title="คลิกเพื่อแก้ราคา — 135 หรือ 120-150 · 0 = เสนอราคา (Enter บันทึก · Esc ยกเลิก)" style={{ cursor: 'text', borderBottom: '1px dashed #9AABB8', paddingBottom: 1 }}>{shown}</span>
}

interface HistRow { id: number; old_min: number | null; old_max: number | null; new_min: number; new_max: number; source: string; by: string; at: string }
export function LaborHistoryModal({ rate, onClose }: { rate: ApiLaborRate; onClose: () => void }) {
  const [rows, setRows] = useState<HistRow[] | null>(null)
  useEffect(() => { api.get<HistRow[]>(`/labor-rates/${rate.id}/history`).then(setRows).catch(() => setRows([])) }, [rate.id])
  const color = (s: string) => s === 'Excel' ? '#2E7D55' : s === 'เพิ่มใหม่' ? '#6B4E9E' : '#B7791F'
  return (
    <ModalShell title="ประวัติราคาค่าแรง" sub={`${laborLabel(rate)} · ปัจจุบัน ${rangeText(rate.price_min, rate.price_max)} / ${rate.unit}`} width={620} onClose={onClose} zIndex={70}>
      {!rows ? <div style={{ color: '#94A0A8', fontSize: 13 }}>กำลังโหลด…</div>
        : !rows.length ? <div style={{ color: '#94A0A8', fontSize: 13, padding: '10px 0' }}>ยังไม่มีประวัติการเปลี่ยนราคา (เริ่มเก็บตั้งแต่ตอนนี้)</div>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ textAlign: 'left', color: '#5C6770', fontSize: 12 }}>
                <th style={{ padding: '6px 8px' }}>วันเวลา</th><th style={{ padding: '6px 8px', textAlign: 'right' }}>เดิม</th><th style={{ padding: '6px 8px', textAlign: 'right' }}>ใหม่</th>
                <th style={{ padding: '6px 8px' }}>ที่มา</th><th style={{ padding: '6px 8px' }}>โดย</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid #EEF1F4' }}>
                    <td style={{ padding: '6px 8px', color: '#5C6770', whiteSpace: 'nowrap' }}>{r.at}</td>
                    <td className="num" style={{ padding: '6px 8px', textAlign: 'right', color: '#5C6770' }}>{r.old_min == null ? '—' : rangeText(r.old_min, r.old_max || 0)}</td>
                    <td className="num" style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{rangeText(r.new_min, r.new_max)}</td>
                    <td style={{ padding: '6px 8px' }}><span style={{ fontSize: 11.5, fontWeight: 600, color: color(r.source) }}>{r.source}</span></td>
                    <td style={{ padding: '6px 8px', color: '#5C6770' }}>{r.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
    </ModalShell>
  )
}

// ---------- Excel ----------
const HEAD = ['รหัส', 'กลุ่ม', 'ลำดับ', 'หมวดหมู่ / รายการ', 'แบบ', 'ราคาต่ำสุด', 'ราคาสูงสุด', 'หน่วย', 'หมายเหตุ', 'อัปเดตล่าสุด']
export function exportLaborXlsx(rates: ApiLaborRate[]) {
  const d = new Date()
  const stamp = `${d.getFullYear() + 543}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return exportXlsxBook(`ราคากลางค่าแรง-${stamp}`, [
    {
      name: 'ราคากลางค่าแรง', cols: [7, 12, 7, 44, 20, 12, 12, 10, 28, 13],
      rows: [HEAD, ...rates.map((r) => [r.id, r.grp, r.seq || '', r.name, r.variant || '', r.price_max > 0 ? r.price_min : 'เสนอราคา', r.price_max > 0 ? r.price_max : '', r.unit || '', r.note && r.note !== 'เสนอราคา' ? r.note : '', (r as ApiLaborRate & { updated?: string }).updated || ''])],
    },
    {
      name: 'วิธีใช้', cols: [100],
      rows: [
        ['วิธีอัปเดตราคากลางค่าแรงด้วยไฟล์นี้'],
        ['1. แก้ "ราคาต่ำสุด" / "ราคาสูงสุด" (ราคาเดียวใส่เท่ากัน หรือเว้นสูงสุดว่าง) · ไม่มีราคาตายตัว ใส่ "เสนอราคา" หรือ 0'],
        ['2. ห้ามแก้หรือลบคอลัมน์ "รหัส" — ระบบใช้จับคู่รายการ'],
        ['3. เพิ่มหมวดงานใหม่: เพิ่มแถวท้ายตาราง ปล่อย "รหัส" ว่าง ใส่กลุ่ม (เหมายกหลัง/แยกงาน) หมวดหมู่ แบบ ราคา หน่วย'],
        ['4. ในระบบกด "นำเข้า Excel" → ตรวจรายการที่เปลี่ยน → ติ๊กเลือก → บันทึก (ทุกการเปลี่ยนราคามีประวัติ)'],
      ],
    },
  ])
}

async function readLaborFile(file: File) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer())
  const ws = wb.Sheets[wb.SheetNames.find((n) => n === 'ราคากลางค่าแรง') || wb.SheetNames[0]]
  const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: '' })
  const hi = aoa.findIndex((r) => r.some((c) => String(c).trim() === 'ราคาต่ำสุด'))
  if (hi < 0) throw new Error('ไม่พบหัวตาราง "ราคาต่ำสุด" ในไฟล์ — ใช้ไฟล์ที่ดาวน์โหลดจากปุ่ม "ดาวน์โหลด Excel" ของหน้าค่าแรง')
  const head = aoa[hi].map((c) => String(c).trim())
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h))
  const ci = { id: col('รหัส'), grp: col('กลุ่ม'), name: col('หมวดหมู่ / รายการ', 'หมวดหมู่', 'รายการ'), variant: col('แบบ'), min: col('ราคาต่ำสุด'), max: col('ราคาสูงสุด'), unit: col('หน่วย'), note: col('หมายเหตุ') }
  const v = (r: (string | number)[], i: number) => i >= 0 ? r[i] : ''
  return aoa.slice(hi + 1).map((r, i) => ({
    row: hi + i + 2, id: v(r, ci.id), grp: String(v(r, ci.grp)).trim(), name: String(v(r, ci.name)).trim(), variant: String(v(r, ci.variant)).trim(),
    price_min: v(r, ci.min), price_max: v(r, ci.max), unit: String(v(r, ci.unit)).trim(), note: String(v(r, ci.note)).trim(),
  }))
}

interface PrevChange { row: number; id: number; label: string; unit: string; old_min: number; old_max: number; price_min: number; price_max: number; pct: number | null; new_unit: string; matched_by: string }
interface PrevAdd { row: number; grp: string; name: string; variant: string; unit: string; price_min: number; price_max: number; note: string }
interface Preview { changes: PrevChange[]; added: PrevAdd[]; unchanged: number; errors: { row: number; name: string; msg: string }[] }

export function ImportLaborModal({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<unknown> }) {
  const [prev, setPrev] = useState<Preview | null>(null)
  const [pickC, setPickC] = useState<number[]>([])
  const [pickA, setPickA] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [fileName, setFileName] = useState('')
  const load = async (f: File | undefined) => {
    if (!f) return
    setFileName(f.name); setErr(''); setPrev(null); setBusy(true)
    try {
      const p = await api.post<Preview>('/labor-rates/import/preview', { rows: await readLaborFile(f) })
      setPrev(p)
      setPickC(p.changes.filter((c) => c.pct == null || Math.abs(c.pct) <= 30).map((c) => c.row)) // เปลี่ยนเกิน 30% ให้คนดูเอง
      setPickA(p.added.map((a) => a.row))
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  const apply = async () => {
    if (!prev) return
    const changes = prev.changes.filter((c) => pickC.includes(c.row)), added = prev.added.filter((a) => pickA.includes(a.row))
    if (!changes.length && !added.length) { setErr('ยังไม่ได้เลือกรายการ'); return }
    setBusy(true)
    try {
      const r = await api.post<{ updated: number; added: number }>('/labor-rates/import/apply', { changes, added })
      await onDone()
      alert(`นำเข้าแล้ว\n• แก้ราคา ${r.updated} รายการ\n• เพิ่มใหม่ ${r.added} รายการ`)
      onClose()
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  const tog = (list: number[], set: (v: number[]) => void, row: number) => set(list.includes(row) ? list.filter((x) => x !== row) : [...list, row])
  const th: React.CSSProperties = { padding: '7px 8px', fontSize: 12, fontWeight: 600, color: '#5C6770', textAlign: 'left', whiteSpace: 'nowrap', background: '#F7F9FB' }
  const td: React.CSSProperties = { padding: '6px 8px', fontSize: 13, borderTop: '1px solid #EEF1F4' }
  const sec = (title: string, color: string, n: number) => <div style={{ fontSize: 13.5, fontWeight: 700, color, margin: '14px 0 6px' }}>{title} <span style={{ fontWeight: 400, color: '#5C6770' }}>({n})</span></div>
  return (
    <ModalShell title="นำเข้าราคากลางค่าแรงจาก Excel" sub="ใช้ไฟล์จากปุ่ม “ดาวน์โหลด Excel” · แก้ราคาต่ำสุด/สูงสุด · ระบบจับคู่ด้วยรหัส แล้วให้ตรวจก่อนบันทึก" width={880} closeOnBackdrop={false} onClose={onClose} zIndex={70}
      footer={<>
        <button onClick={onClose} style={{ ...btn, fontWeight: 500, color: '#1C2730', background: '#EDF1F4' }}>ยกเลิก</button>
        <button onClick={apply} disabled={busy || !prev} style={{ ...btn, color: '#fff', background: busy || !prev ? '#9AABB8' : '#2E7D55', cursor: busy || !prev ? 'default' : 'pointer' }}>บันทึก {prev ? `(แก้ ${pickC.length} · เพิ่ม ${pickA.length})` : ''}</button>
      </>}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1.5px dashed #B9C6D0', borderRadius: 10, padding: '12px 14px', cursor: 'pointer', background: '#FAFBFC' }}>
        <span style={{ ...btn, color: '#fff', background: '#30506A' }}>เลือกไฟล์ Excel</span>
        <span style={{ fontSize: 13, color: fileName ? '#1C2730' : '#94A0A8' }}>{fileName || '.xlsx ที่แก้ราคาแล้ว'}</span>
        <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(e) => { load(e.target.files?.[0]); e.target.value = '' }} />
      </label>
      {busy && <div style={{ fontSize: 13, color: '#5C6770', marginTop: 10 }}>กำลังอ่านไฟล์…</div>}
      {err && <div style={{ fontSize: 13, color: '#B23B30', background: '#FBE7E5', borderRadius: 8, padding: '8px 12px', marginTop: 10 }}>{err}</div>}
      {prev && <>
        <div style={{ display: 'flex', gap: 14, fontSize: 13, marginTop: 12, flexWrap: 'wrap' }}>
          <span>🟡 ราคาเปลี่ยน <b>{prev.changes.length}</b></span><span>🟢 รายการใหม่ <b>{prev.added.length}</b></span>
          <span>⚪ ไม่เปลี่ยน <b>{prev.unchanged}</b></span>{prev.errors.length > 0 && <span style={{ color: '#B23B30' }}>🔴 มีปัญหา <b>{prev.errors.length}</b></span>}
        </div>
        {prev.changes.length > 0 && <>
          {sec('ราคาเปลี่ยน', '#9A6B12', prev.changes.length)}
          <div style={{ border: '1px solid #E1E5EA', borderRadius: 9, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}><input type="checkbox" checked={pickC.length === prev.changes.length} onChange={(e) => setPickC(e.target.checked ? prev.changes.map((c) => c.row) : [])} /></th>
                <th style={th}>แถว</th><th style={th}>หมวดงาน</th><th style={{ ...th, textAlign: 'right' }}>เดิม</th><th style={{ ...th, textAlign: 'right' }}>ใหม่</th><th style={{ ...th, textAlign: 'right' }}>เปลี่ยน</th>
              </tr></thead>
              <tbody>
                {prev.changes.map((c) => {
                  const big = c.pct != null && Math.abs(c.pct) > 30
                  return (
                    <tr key={c.row} style={{ background: big ? '#FFF6E5' : undefined }}>
                      <td style={td}><input type="checkbox" checked={pickC.includes(c.row)} onChange={() => tog(pickC, setPickC, c.row)} /></td>
                      <td style={{ ...td, color: '#94A0A8' }}>{c.row}</td>
                      <td style={td}>{c.label} <span style={{ color: '#94A0A8' }}>/ {c.new_unit ? <><s>{c.unit}</s> → <b>{c.new_unit}</b></> : c.unit}</span>
                        {c.matched_by === 'ชื่อ+แบบ' && <span style={{ fontSize: 11, color: '#9A6B12', marginLeft: 6 }}>(ไม่มีรหัส · จับคู่จากชื่อ)</span>}
                        {big && <div style={{ fontSize: 11, color: '#B7791F', fontWeight: 600 }}>⚠ เปลี่ยนเกิน 30% — ตรวจว่าไม่ได้พิมพ์ผิด (ยังไม่ติ๊กให้)</div>}
                      </td>
                      <td className="num" style={{ ...td, textAlign: 'right', color: '#5C6770' }}>{rangeText(c.old_min, c.old_max)}</td>
                      <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{rangeText(c.price_min, c.price_max)}</td>
                      <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 600, color: c.pct == null ? '#94A0A8' : c.pct > 0 ? '#C24036' : '#2E7D55' }}>{c.pct == null ? '—' : (c.pct > 0 ? '+' : '') + c.pct + '%'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>}
        {prev.added.length > 0 && <>
          {sec('หมวดงานใหม่', '#2E7D55', prev.added.length)}
          <div style={{ border: '1px solid #E1E5EA', borderRadius: 9, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
              {prev.added.map((a) => (
                <tr key={a.row}>
                  <td style={{ ...td, width: 30 }}><input type="checkbox" checked={pickA.includes(a.row)} onChange={() => tog(pickA, setPickA, a.row)} /></td>
                  <td style={{ ...td, color: '#94A0A8', width: 50 }}>{a.row}</td>
                  <td style={td}>{a.name}{a.variant ? ` (${a.variant})` : ''} <span style={{ color: '#94A0A8' }}>· {a.grp} / {a.unit}</span></td>
                  <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{rangeText(a.price_min, a.price_max)}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </>}
        {prev.errors.length > 0 && <>
          {sec('มีปัญหา (ไม่นำเข้า)', '#B23B30', prev.errors.length)}
          <div style={{ fontSize: 12.5, color: '#5C6770' }}>{prev.errors.map((e, i) => <div key={i}>แถว {e.row}{e.name ? ` · ${e.name}` : ''} — {e.msg}</div>)}</div>
        </>}
        {!prev.changes.length && !prev.added.length && <div style={{ fontSize: 13, color: '#5C6770', marginTop: 12 }}>ไม่มีราคาที่เปลี่ยน — ไม่ต้องบันทึก</div>}
      </>}
    </ModalShell>
  )
}
