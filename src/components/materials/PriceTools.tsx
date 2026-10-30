import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { ApiMaterialPrice } from '../../store'
import { exportXlsxBook } from '../../exportCsv'
import ModalShell from '../shared/ModalShell'

// เครื่องมือแก้ราคากลางวัสดุ: แก้ราคาในตารางทันที · ประวัติราคา · ดาวน์โหลด/นำเข้า Excel (ตรวจก่อนบันทึก)

const money = (n: number) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
const btn: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 9, padding: '9px 15px', cursor: 'pointer' }

/** ช่องราคาที่คลิกแล้วพิมพ์ทับได้ · Enter/คลิกออก = บันทึก · Esc = ยกเลิก */
export function InlinePrice({ value, canEdit, onSave, prefix = '฿' }: { value: number; canEdit: boolean; onSave: (v: number) => Promise<void>; prefix?: string }) {
  const [edit, setEdit] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const done = useRef(false)
  if (!canEdit) return <>{prefix}{money(value)}</>
  const start = () => { setText(String(value ?? '')); done.current = false; setEdit(true) }
  const commit = async () => {
    if (done.current) return
    done.current = true
    const n = Number(text.replace(/[,฿\s]/g, ''))
    if (!Number.isFinite(n) || n < 0) { alert('ราคาต้องเป็นตัวเลข'); setEdit(false); return }
    if (Math.round(n * 100) === Math.round((value || 0) * 100)) { setEdit(false); return }
    setBusy(true)
    try { await onSave(n) } catch (e) { alert('บันทึกไม่สำเร็จ: ' + (e as Error).message) }
    setBusy(false); setEdit(false)
  }
  if (edit) {
    return (
      <input autoFocus value={text} disabled={busy} inputMode="decimal" onChange={(e) => setText(e.target.value)} onFocus={(e) => e.target.select()}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { done.current = true; setEdit(false); e.stopPropagation() } }}
        onBlur={commit}
        style={{ width: 96, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, textAlign: 'right', border: '1.5px solid #30506A', borderRadius: 7, padding: '4px 7px', outline: 'none' }} />
    )
  }
  return (
    <span onClick={start} title="คลิกเพื่อแก้ราคา (Enter บันทึก · Esc ยกเลิก)" style={{ cursor: 'text', borderBottom: '1px dashed #9AABB8', paddingBottom: 1 }}>{prefix}{money(value)}</span>
  )
}

interface HistRow { id: number; old_price: number | null; new_price: number; source: string; by: string; at: string; unit: string }
const srcColor = (s: string) => s === 'Excel' ? '#2E7D55' : s === 'จาก PO' ? '#30506A' : s === 'เพิ่มใหม่' ? '#6B4E9E' : '#B7791F'

export function PriceHistoryModal({ mp, onClose }: { mp: ApiMaterialPrice; onClose: () => void }) {
  const [rows, setRows] = useState<HistRow[] | null>(null)
  useEffect(() => { api.get<HistRow[]>(`/material-prices/${mp.id}/history`).then(setRows).catch(() => setRows([])) }, [mp.id])
  return (
    <ModalShell title="ประวัติราคา" sub={`${mp.name} · ราคาปัจจุบัน ฿${money(mp.central)} / ${mp.unit || '-'}`} width={620} onClose={onClose} zIndex={70}>
      {!rows ? <div style={{ color: '#94A0A8', fontSize: 13 }}>กำลังโหลด…</div>
        : !rows.length ? <div style={{ color: '#94A0A8', fontSize: 13, padding: '10px 0' }}>ยังไม่มีประวัติการเปลี่ยนราคา (เริ่มเก็บตั้งแต่ตอนนี้ — ราคาที่แก้ครั้งถัดไปจะขึ้นที่นี่)</div>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ textAlign: 'left', color: '#5C6770', fontSize: 12 }}>
                <th style={{ padding: '6px 8px' }}>วันเวลา</th><th style={{ padding: '6px 8px', textAlign: 'right' }}>เดิม</th><th style={{ padding: '6px 8px', textAlign: 'right' }}>ใหม่</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>เปลี่ยน</th><th style={{ padding: '6px 8px' }}>ที่มา</th><th style={{ padding: '6px 8px' }}>โดย</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const pct = r.old_price ? ((r.new_price - r.old_price) / r.old_price) * 100 : null
                  return (
                    <tr key={r.id} style={{ borderTop: '1px solid #EEF1F4' }}>
                      <td style={{ padding: '6px 8px', color: '#5C6770', whiteSpace: 'nowrap' }}>{r.at}</td>
                      <td className="num" style={{ padding: '6px 8px', textAlign: 'right', color: '#5C6770' }}>{r.old_price == null ? '—' : '฿' + money(r.old_price)}</td>
                      <td className="num" style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>฿{money(r.new_price)}</td>
                      <td className="num" style={{ padding: '6px 8px', textAlign: 'right', color: pct == null ? '#94A0A8' : pct > 0 ? '#C24036' : '#2E7D55' }}>{pct == null ? '—' : (pct > 0 ? '+' : '') + pct.toFixed(1) + '%'}</td>
                      <td style={{ padding: '6px 8px' }}><span style={{ fontSize: 11.5, fontWeight: 600, color: srcColor(r.source) }}>{r.source}</span></td>
                      <td style={{ padding: '6px 8px', color: '#5C6770' }}>{r.by}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
    </ModalShell>
  )
}

// ---------- Excel ----------
const HEAD = ['รหัส', 'ชื่อวัสดุ', 'หน่วย', 'ราคากลาง', 'ต่ำสุด', 'สูงสุด', 'ราคาล่าสุด (PO)', 'ครั้งที่ซื้อ', 'ที่มา', 'อัปเดตล่าสุด', 'หมายเหตุ']

/** ดาวน์โหลดราคากลางทั้งหมดเป็น Excel (มีรหัสไว้จับคู่ตอนนำเข้ากลับ) */
export function exportPricesXlsx(list: ApiMaterialPrice[]) {
  const d = new Date()
  const stamp = `${d.getFullYear() + 543}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return exportXlsxBook(`ราคากลางวัสดุ-${stamp}`, [
    {
      name: 'ราคากลาง', cols: [7, 52, 10, 12, 10, 10, 14, 10, 12, 13, 30],
      rows: [HEAD, ...list.map((m) => [m.id, m.name, m.unit || '', m.central || 0, m.min || 0, m.max || 0, m.latest || 0, m.po_count || 0,
        m.source === 'กำหนดเอง' ? 'ตั้งราคาเอง' : m.source || '', m.updated || '', m.note || ''])],
    },
    {
      name: 'วิธีใช้', cols: [100],
      rows: [
        ['วิธีอัปเดตราคากลางด้วยไฟล์นี้'],
        ['1. แก้ตัวเลขในคอลัมน์ "ราคากลาง" (แก้ "หน่วย" ได้ถ้าจำเป็น) — คอลัมน์อื่นใช้ดูประกอบ ระบบไม่อ่าน'],
        ['2. ห้ามแก้หรือลบคอลัมน์ "รหัส" — ระบบใช้รหัสจับคู่รายการ (ชื่อวัสดุซ้ำ/สะกดต่างกันได้)'],
        ['3. เพิ่มวัสดุใหม่: เพิ่มแถวท้ายตาราง ปล่อย "รหัส" ว่าง ใส่ชื่อ หน่วย ราคากลาง'],
        ['4. แถวที่ไม่ได้แก้ ปล่อยไว้ได้ ระบบจะข้ามให้เอง'],
        ['5. ในระบบกด "นำเข้า Excel" → ตรวจรายการที่เปลี่ยน (เดิม → ใหม่) → ติ๊กเลือก → ยืนยัน'],
        ['ราคาที่นำเข้าจะถูกตั้งเป็น "ตั้งราคาเอง" — ปุ่ม "อัปเดตจากประวัติจริง" (PO) จะไม่ทับ · ทุกการเปลี่ยนราคามีประวัติย้อนดูได้'],
      ],
    },
  ])
}

interface PrevChange { row: number; id: number; name: string; unit: string; old: number; central: number; pct: number | null; new_unit: string; matched_by: string }
interface PrevAdd { row: number; name: string; unit: string; central: number; note: string }
interface Preview { changes: PrevChange[]; added: PrevAdd[]; unchanged: number; errors: { row: number; name: string; msg: string }[] }

// อ่านไฟล์ Excel → แถว {id, name, unit, central, note} โดยหาหัวตารางที่มีคำว่า "ราคากลาง"
async function readPriceFile(file: File) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer())
  const ws = wb.Sheets[wb.SheetNames.find((n) => n === 'ราคากลาง') || wb.SheetNames[0]]
  const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: '' })
  const hi = aoa.findIndex((r) => r.some((c) => String(c).trim() === 'ราคากลาง'))
  if (hi < 0) throw new Error('ไม่พบหัวตาราง "ราคากลาง" ในไฟล์ — ใช้ไฟล์ที่ดาวน์โหลดจากปุ่ม "ดาวน์โหลด Excel"')
  const head = aoa[hi].map((c) => String(c).trim())
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h))
  const ci = { id: col('รหัส', 'ID', 'id'), name: col('ชื่อวัสดุ', 'รายการวัสดุ', 'รายการ'), unit: col('หน่วย'), central: col('ราคากลาง'), note: col('หมายเหตุ') }
  return aoa.slice(hi + 1).map((r, i) => ({
    row: hi + i + 2,
    id: ci.id >= 0 ? r[ci.id] : '',
    name: ci.name >= 0 ? String(r[ci.name] ?? '').trim() : '',
    unit: ci.unit >= 0 ? String(r[ci.unit] ?? '').trim() : '',
    central: r[ci.central],
    note: ci.note >= 0 ? String(r[ci.note] ?? '').trim() : '',
  }))
}

/** นำเข้า Excel: เลือกไฟล์ → ตรวจรายการที่เปลี่ยน (เดิม→ใหม่ · %) → ติ๊กเลือก → บันทึก */
export function ImportPricesModal({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<unknown> }) {
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
      const rows = await readPriceFile(f)
      const p = await api.post<Preview>('/material-prices/import/preview', { rows })
      setPrev(p)
      // ติ๊กให้ก่อน ยกเว้นราคาที่เปลี่ยนเกิน 30% (อาจพิมพ์ผิด ให้คนดูเอง)
      setPickC(p.changes.filter((c) => c.pct == null || Math.abs(c.pct) <= 30).map((c) => c.row))
      setPickA(p.added.map((a) => a.row))
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  const apply = async () => {
    if (!prev) return
    const changes = prev.changes.filter((c) => pickC.includes(c.row))
    const added = prev.added.filter((a) => pickA.includes(a.row))
    if (!changes.length && !added.length) { setErr('ยังไม่ได้เลือกรายการ'); return }
    setBusy(true)
    try {
      const r = await api.post<{ updated: number; added: number }>('/material-prices/import/apply', { changes, added })
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
    <ModalShell title="นำเข้าราคากลางจาก Excel" sub="ใช้ไฟล์จากปุ่ม “ดาวน์โหลด Excel” · แก้คอลัมน์ราคากลาง · ระบบจับคู่ด้วยรหัส แล้วให้ตรวจก่อนบันทึก" width={900} closeOnBackdrop={false} onClose={onClose} zIndex={70}
      footer={<>
        <button onClick={onClose} style={{ ...btn, fontWeight: 500, color: '#1C2730', background: '#EDF1F4' }}>ยกเลิก</button>
        <button onClick={apply} disabled={busy || !prev} style={{ ...btn, color: '#fff', background: busy || !prev ? '#9AABB8' : '#2E7D55', cursor: busy || !prev ? 'default' : 'pointer' }}>
          บันทึก {prev ? `(แก้ ${pickC.length} · เพิ่ม ${pickA.length})` : ''}
        </button>
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
                <th style={th}>แถว</th><th style={th}>วัสดุ</th><th style={{ ...th, textAlign: 'right' }}>เดิม</th><th style={{ ...th, textAlign: 'right' }}>ใหม่</th><th style={{ ...th, textAlign: 'right' }}>เปลี่ยน</th>
              </tr></thead>
              <tbody>
                {prev.changes.map((c) => {
                  const big = c.pct != null && Math.abs(c.pct) > 30
                  return (
                    <tr key={c.row} style={{ background: big ? '#FFF6E5' : undefined }}>
                      <td style={td}><input type="checkbox" checked={pickC.includes(c.row)} onChange={() => tog(pickC, setPickC, c.row)} /></td>
                      <td style={{ ...td, color: '#94A0A8' }}>{c.row}</td>
                      <td style={td}>{c.name} <span style={{ color: '#94A0A8' }}>/ {c.new_unit ? <><s>{c.unit || '-'}</s> → <b>{c.new_unit}</b></> : c.unit || '-'}</span>
                        {c.matched_by === 'ชื่อ+หน่วย' && <span style={{ fontSize: 11, color: '#9A6B12', marginLeft: 6 }}>(ไม่มีรหัส · จับคู่จากชื่อ)</span>}
                        {big && <div style={{ fontSize: 11, color: '#B7791F', fontWeight: 600 }}>⚠ เปลี่ยนเกิน 30% — ตรวจว่าไม่ได้พิมพ์ผิด (ยังไม่ติ๊กให้)</div>}
                      </td>
                      <td className="num" style={{ ...td, textAlign: 'right', color: '#5C6770' }}>฿{money(c.old)}</td>
                      <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>฿{money(c.central)}</td>
                      <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 600, color: c.pct == null ? '#94A0A8' : c.pct > 0 ? '#C24036' : '#2E7D55' }}>{c.pct == null ? '—' : (c.pct > 0 ? '+' : '') + c.pct + '%'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>}

        {prev.added.length > 0 && <>
          {sec('รายการใหม่ (ไม่มีรหัส / ไม่เจอในระบบ)', '#2E7D55', prev.added.length)}
          <div style={{ border: '1px solid #E1E5EA', borderRadius: 9, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {prev.added.map((a) => (
                  <tr key={a.row}>
                    <td style={{ ...td, width: 30 }}><input type="checkbox" checked={pickA.includes(a.row)} onChange={() => tog(pickA, setPickA, a.row)} /></td>
                    <td style={{ ...td, color: '#94A0A8', width: 50 }}>{a.row}</td>
                    <td style={td}>{a.name} <span style={{ color: '#94A0A8' }}>/ {a.unit || '-'}</span></td>
                    <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>฿{money(a.central)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
