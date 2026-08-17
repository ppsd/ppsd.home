import { Fragment, useEffect, useState } from 'react'
import { api } from '../api'
import { useApp } from '../store'

interface Rev { rev: string; date: string; note: string; by: string }
interface DocRow { id: number; no: string; category: string; title: string; doc_no: string; revision: string; rev_date: string; status: string; owner: string; house_code: string; note: string; revisions: Rev[]; expiry?: string; date?: string }

const CATS = [
  { key: 'contract', label: 'สัญญา' },
  { key: 'drawing', label: 'แบบก่อสร้าง' },
  { key: 'spec', label: 'สเปก / รายการประกอบแบบ' },
  { key: 'permit', label: 'ใบอนุญาต' },
  { key: 'other', label: 'อื่นๆ' },
]
const catLabel = (k: string) => CATS.find((c) => c.key === k)?.label || k
const STATUSES = ['ใช้งาน', 'ยกเลิก', 'ฉบับร่าง', 'รออนุมัติ']
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '8px 10px', outline: 'none', width: '100%' }
const th: React.CSSProperties = { padding: '9px 14px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'left' }
const lbl: React.CSSProperties = { fontSize: 12, color: '#5C6770', marginBottom: 4 }

const stColor = (s: string) => s === 'ใช้งาน' ? { c: '#2E7D55', bg: '#E2F1EA' } : s === 'ยกเลิก' ? { c: '#C24036', bg: '#FBEEEC' } : { c: '#B7791F', bg: '#F6ECD6' }

export default function DocRegister() {
  const { data } = useApp()
  const houses = data.houses
  const [rows, setRows] = useState<DocRow[]>([])
  const [adding, setAdding] = useState(false)
  const [fCat, setFCat] = useState('')
  const [q, setQ] = useState('')
  const [openRev, setOpenRev] = useState<number | null>(null)
  const [revising, setRevising] = useState<DocRow | null>(null)
  const blank = { category: 'contract', title: '', doc_no: '', revision: 'A', rev_date: '', status: 'ใช้งาน', owner: '', house_code: '', note: '', expiry: '' }
  const [f, setF] = useState(blank)
  const [importing, setImporting] = useState(false)
  const importContracts = async () => {
    setImporting(true)
    try {
      const r = await api.post<{ added: number }>('/doc-register/import-contracts', {})
      alert(r.added ? `นำเข้าสัญญาจากบ้าน ${r.added} ฉบับ` : 'ไม่มีสัญญาใหม่ให้นำเข้า (บ้านที่มีเลขสัญญาถูกขึ้นทะเบียนครบแล้ว)')
      load()
    } catch (e) { alert((e as Error).message) } finally { setImporting(false) }
  }

  const load = () => api.get<DocRow[]>('/doc-register').then(setRows).catch(() => setRows([]))
  useEffect(() => { load() }, [])

  const submit = async () => {
    if (!f.title.trim()) return
    await api.post('/doc-register', f)
    setF(blank); setAdding(false); load()
  }
  const remove = async (id: number) => { if (confirm('ลบเอกสารนี้ออกจากทะเบียน?')) { await api.del('/doc-register/' + id); load() } }
  const setStatus = async (r: DocRow, status: string) => { await api.put('/doc-register/' + r.id, { status }); load() }

  const list = rows.filter((r) => (!fCat || r.category === fCat) && `${r.no} ${r.title} ${r.doc_no} ${r.owner}`.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: '#5C6770' }}>ทะเบียนเอกสาร <b className="num" style={{ color: '#1C2730' }}>{rows.length}</b> ฉบับ</div>
        <select style={{ ...field, width: 'auto', padding: '6px 8px' }} value={fCat} onChange={(e) => setFCat(e.target.value)}><option value="">ทุกหมวด</option>{CATS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
        <input style={{ ...field, width: 220, padding: '6px 10px' }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเลขที่/ชื่อ/เจ้าของ" />
        <button onClick={importContracts} disabled={importing} title="สร้างทะเบียนสัญญาจากบ้านที่มีเลขที่สัญญาแล้วโดยอัตโนมัติ" className="hov-f3f5f7" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#C0852C', background: '#fff', border: '1px solid #EAD9B6', borderRadius: 9, padding: '9px 14px', cursor: 'pointer' }}>{importing ? 'กำลังนำเข้า…' : '↻ ดึงสัญญาจากบ้าน'}</button>
        <button onClick={() => setAdding((v) => !v)} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>+ ขึ้นทะเบียนเอกสาร</button>
      </div>

      {adding && (
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 0.8fr', gap: 12 }}>
            <div><div style={lbl}>หมวด</div><select style={field} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
            <div><div style={lbl}>ชื่อเอกสาร *</div><input style={field} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="เช่น สัญญาก่อสร้างบ้าน / แบบสถาปัตย์ ชั้น 1" /></div>
            <div><div style={lbl}>เลขที่เอกสาร</div><input style={field} value={f.doc_no} onChange={(e) => setF({ ...f, doc_no: e.target.value })} placeholder="เช่น A-01" /></div>
            <div><div style={lbl}>เวอร์ชัน</div><input style={field} value={f.revision} onChange={(e) => setF({ ...f, revision: e.target.value })} placeholder="A" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1.6fr 1fr', gap: 12, marginTop: 10 }}>
            <div><div style={lbl}>วันที่เวอร์ชัน</div><input style={field} value={f.rev_date} onChange={(e) => setF({ ...f, rev_date: e.target.value })} placeholder="วันที่" /></div>
            <div><div style={lbl}>เจ้าของ/ผู้จัดทำ</div><input style={field} value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} /></div>
            <div><div style={lbl}>บ้าน / โครงการ</div><select style={field} value={f.house_code} onChange={(e) => setF({ ...f, house_code: e.target.value })}><option value="">— ทั่วไป —</option>{houses.map((h) => <option key={h.id} value={h.code}>{h.name}</option>)}</select></div>
            <div><div style={lbl}>สถานะ</div><select style={field} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginTop: 10 }}>
            <div><div style={lbl}>วันหมดอายุ <span style={{ color: '#94A0A8' }}>(ใบอนุญาต — เว้นว่างถ้าไม่มี)</span></div><input style={field} type="date" value={f.expiry} onChange={(e) => setF({ ...f, expiry: e.target.value })} /></div>
            <div><div style={lbl}>หมายเหตุ</div><input style={field} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={() => setAdding(false)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ยกเลิก</button>
            <button onClick={submit} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>บันทึก</button>
          </div>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F7F9FB' }}>
              <th style={{ ...th, paddingLeft: 18 }}>เลขทะเบียน</th><th style={th}>หมวด</th><th style={th}>ชื่อเอกสาร</th>
              <th style={{ ...th, textAlign: 'center' }}>เวอร์ชันล่าสุด</th><th style={th}>บ้าน/โครงการ</th>
              <th style={{ ...th, textAlign: 'center' }}>สถานะ</th><th style={{ ...th, paddingRight: 18, textAlign: 'center' }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีเอกสารในทะเบียน — กด “ขึ้นทะเบียนเอกสาร”</td></tr>}
            {list.map((r) => {
              const sc = stColor(r.status)
              return (
                <Fragment key={r.id}>
                  <tr className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                    <td className="num" style={{ padding: '10px 18px', fontWeight: 600, fontFamily: 'monospace' }}>{r.no}{r.doc_no && <div style={{ fontSize: 10.5, color: '#94A0A8', fontFamily: 'inherit' }}>{r.doc_no}</div>}</td>
                    <td style={{ padding: '10px 14px' }}><span style={{ fontSize: 11, fontWeight: 600, color: '#30506A', background: '#E9EFF3', padding: '2px 9px', borderRadius: 20 }}>{catLabel(r.category)}</span></td>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{r.title}{r.expiry && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: r.expiry < new Date().toISOString().slice(0, 10) ? '#C24036' : '#B7791F', background: r.expiry < new Date().toISOString().slice(0, 10) ? '#FBEEEC' : '#F6ECD6', padding: '1px 7px', borderRadius: 20 }}>หมดอายุ {r.expiry}</span>}{r.note && <div style={{ fontSize: 11, color: '#94A0A8' }}>{r.note}</div>}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}><span className="num" style={{ fontWeight: 700, color: '#C0852C' }}>Rev.{r.revision}</span><div style={{ fontSize: 10.5, color: '#94A0A8' }}>{r.rev_date}</div></td>
                    <td style={{ padding: '10px 14px', color: '#5C6770' }}>{houses.find((h) => h.code === r.house_code)?.name || (r.house_code ? r.house_code : '—')}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <select value={r.status} onChange={(e) => setStatus(r, e.target.value)} style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: sc.c, background: sc.bg, border: 'none', borderRadius: 20, padding: '3px 8px', cursor: 'pointer' }}>{STATUSES.map((s) => <option key={s} style={{ color: '#1C2730', background: '#fff' }}>{s}</option>)}</select>
                    </td>
                    <td style={{ padding: '10px 18px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button onClick={() => setRevising(r)} title="ออกเวอร์ชันใหม่" style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#fff', background: '#C0852C', border: 'none', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>+ เวอร์ชัน</button>
                      <button onClick={() => setOpenRev(openRev === r.id ? null : r.id)} className="hov-f3f5f7" style={{ marginLeft: 6, fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>ประวัติ ({r.revisions.length})</button>
                      <button onClick={() => remove(r.id)} style={{ marginLeft: 6, border: 'none', background: 'none', color: '#C24036', cursor: 'pointer', fontSize: 13 }}>✕</button>
                    </td>
                  </tr>
                  {openRev === r.id && (
                    <tr style={{ background: '#FBFCFD' }}>
                      <td colSpan={7} style={{ padding: '10px 18px' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>ประวัติการแก้ไขเวอร์ชัน</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead><tr style={{ color: '#94A0A8', textAlign: 'left' }}><th style={{ padding: '4px 8px' }}>เวอร์ชัน</th><th style={{ padding: '4px 8px' }}>วันที่</th><th style={{ padding: '4px 8px' }}>รายละเอียดการแก้ไข</th><th style={{ padding: '4px 8px' }}>โดย</th></tr></thead>
                          <tbody>
                            {[...r.revisions].reverse().map((v, i) => (
                              <tr key={i} style={{ borderTop: '1px solid #EEF1F4' }}><td className="num" style={{ padding: '4px 8px', fontWeight: 600 }}>Rev.{v.rev}</td><td className="num" style={{ padding: '4px 8px', color: '#5C6770' }}>{v.date}</td><td style={{ padding: '4px 8px' }}>{v.note || '-'}</td><td style={{ padding: '4px 8px', color: '#5C6770' }}>{v.by}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {revising && <ReviseModal doc={revising} onClose={() => setRevising(null)} onSaved={() => { setRevising(null); load() }} />}
    </div>
  )
}

function ReviseModal({ doc, onClose, onSaved }: { doc: DocRow; onClose: () => void; onSaved: () => void }) {
  const [rev, setRev] = useState('')
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async () => {
    if (!rev.trim()) { setErr('กรุณาระบุเลขเวอร์ชันใหม่'); return }
    setBusy(true); setErr('')
    try { await api.post('/doc-register/' + doc.id + '/revise', { revision: rev, rev_date: date, note }); onSaved() }
    catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: 440, maxWidth: '100%' }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>ออกเวอร์ชันใหม่ — {doc.title}</div>
        <div style={{ fontSize: 12, color: '#94A0A8', marginBottom: 14 }}>ปัจจุบัน Rev.{doc.revision} · {doc.no}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
          <div><div style={lbl}>เวอร์ชันใหม่ *</div><input style={field} value={rev} onChange={(e) => setRev(e.target.value)} placeholder="เช่น B / 2 / 1.1" /></div>
          <div><div style={lbl}>วันที่</div><input style={field} value={date} onChange={(e) => setDate(e.target.value)} placeholder="วันที่แก้ไข" /></div>
        </div>
        <div style={{ marginTop: 10 }}><div style={lbl}>รายละเอียดการแก้ไข</div><textarea style={{ ...field, minHeight: 56, resize: 'vertical' }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="แก้ไขอะไรบ้าง" /></div>
        {err && <div style={{ fontSize: 12, color: '#C24036', marginTop: 8 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={onClose} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ยกเลิก</button>
          <button onClick={save} disabled={busy} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>{busy ? 'กำลังบันทึก…' : 'บันทึกเวอร์ชัน'}</button>
        </div>
      </div>
    </div>
  )
}
