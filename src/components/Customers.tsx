import { useState } from 'react'
import { useApp } from '../store'
import type { ApiContact } from '../store'
import { exportXlsx, ExportButton } from '../exportCsv'
import Pager from './Pager'

const th: React.CSSProperties = { padding: '9px 14px', fontWeight: 600, color: '#5C6770', fontSize: 12 }
const td: React.CSSProperties = { padding: '11px 14px' }
const field: React.CSSProperties = { width: '100%', fontFamily: 'inherit', fontSize: 13.5, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 12px', outline: 'none' }

function statusStyle(s: string) {
  if (s === 'ปิดการขาย') return { c: '#2E7D55', bg: '#E2F1EA' }
  if (s === 'กำลังคุย') return { c: '#30506A', bg: '#E2E9EF' }
  if (s === 'ยกเลิก') return { c: '#5C6770', bg: '#EDF1F4' }
  return { c: '#B7791F', bg: '#F6ECD6' } // สนใจ
}

export default function Customers() {
  const { data, addCustomer, addContact, getCustomer, updateCustomer } = useApp()
  const customers = data.customers
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [cpage, setCpage] = useState(1)
  const C_PAGE = 25
  const custList = customers.filter((c) => `${c.name} ${c.phone} ${c.project} ${c.status}`.toLowerCase().includes(query.trim().toLowerCase()))
  const custPaged = custList.slice((cpage - 1) * C_PAGE, cpage * C_PAGE)
  const [form, setForm] = useState({ name: '', phone: '', email: '', project: '', status: 'สนใจ', address: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // detail drawer
  const [sel, setSel] = useState<(typeof customers)[number] | null>(null)
  const [contacts, setContacts] = useState<ApiContact[]>([])
  const [cForm, setCForm] = useState({ channel: 'โทรศัพท์', note: '' })

  const openDetail = async (id: number) => {
    const full = await getCustomer(id)
    setSel(full)
    setContacts(full.contacts || [])
  }

  const submitCustomer = async () => {
    setBusy(true); setErr('')
    try {
      await addCustomer(form)
      setAdding(false)
      setForm({ name: '', phone: '', email: '', project: '', status: 'สนใจ', address: '', note: '' })
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const submitContact = async () => {
    if (!sel || !cForm.note.trim()) return
    const list = await addContact(sel.id, cForm)
    setContacts(list)
    setCForm({ channel: 'โทรศัพท์', note: '' })
  }

  const doExport = () =>
    exportXlsx('customers', ['ชื่อ', 'โทรศัพท์', 'อีเมล', 'โครงการ', 'สถานะ', 'บันทึกเมื่อ'],
      customers.map((c) => [c.name, c.phone, c.email, c.project, c.status, c.created]), 'ลูกค้า')

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 13, color: '#5C6770' }}>ลูกค้าทั้งหมด <span className="num" style={{ fontWeight: 600, color: '#1C2730' }}>{custList.length}/{customers.length}</span> ราย</div>
        <input value={query} onChange={(e) => { setQuery(e.target.value); setCpage(1) }} placeholder="ค้นหาชื่อ/เบอร์/โครงการ" style={{ ...field, padding: '8px 11px', fontSize: 12.5, width: 220 }} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <ExportButton onClick={doExport} />
          <button onClick={() => setAdding((v) => !v)} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '10px 16px', cursor: 'pointer' }}>+ เพิ่มลูกค้า</button>
        </div>
      </div>

      {adding && (
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>เพิ่มลูกค้าใหม่</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            <input style={field} placeholder="ชื่อลูกค้า *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input style={field} placeholder="เบอร์โทร" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input style={field} placeholder="อีเมล" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input style={field} placeholder="โครงการที่สนใจ" value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} />
            <select style={field} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {['สนใจ', 'กำลังคุย', 'ปิดการขาย', 'ยกเลิก'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <input style={field} placeholder="ที่อยู่" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          {err && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 10 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={() => setAdding(false)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ยกเลิก</button>
            <button onClick={submitCustomer} disabled={busy} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: sel ? '1fr 360px' : '1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
                <th style={{ ...th, padding: '9px 18px' }}>ชื่อลูกค้า</th>
                <th style={th}>เบอร์โทร</th>
                <th style={th}>โครงการ</th>
                <th style={{ ...th, textAlign: 'center' }}>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {custList.length === 0 && (
                <tr><td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: '#94A0A8' }}>{customers.length === 0 ? 'ยังไม่มีลูกค้า — กด “เพิ่มลูกค้า”' : 'ไม่พบลูกค้าที่ค้นหา'}</td></tr>
              )}
              {custPaged.map((c) => {
                const ss = statusStyle(c.status)
                return (
                  <tr key={c.id} onClick={() => openDetail(c.id)} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6', cursor: 'pointer' }}>
                    <td style={{ ...td, padding: '11px 18px', fontWeight: 500 }}>{c.name}</td>
                    <td className="num" style={{ ...td, color: '#5C6770' }}>{c.phone || '-'}</td>
                    <td style={{ ...td, color: '#5C6770' }}>{c.project || '-'}</td>
                    <td style={{ ...td, textAlign: 'center' }}><span style={{ fontSize: 11, fontWeight: 600, color: ss.c, background: ss.bg, padding: '3px 11px', borderRadius: 20 }}>{c.status}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Pager page={cpage} setPage={setCpage} total={custList.length} pageSize={C_PAGE} />
        </div>

        {sel && (
          <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', borderBottom: '1px solid #EEF1F4' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{sel.name}</div>
              <button onClick={() => setSel(null)} className="hov-e7ebef" style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 7, border: 'none', background: '#F3F5F7', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '12px 16px', fontSize: 12.5, color: '#5C6770', display: 'flex', flexDirection: 'column', gap: 7, borderBottom: '1px solid #EEF1F4' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>สถานะ:</span>
                <select value={sel.status} onChange={async (e) => { await updateCustomer(sel.id, { status: e.target.value }); setSel({ ...sel, status: e.target.value }) }} style={{ ...field, width: 'auto', padding: '5px 9px', fontSize: 12.5 }}>
                  {['สนใจ', 'กำลังคุย', 'ปิดการขาย', 'ยกเลิก'].map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>📞 {sel.phone || '-'}</div>
              <div>✉️ {sel.email || '-'}</div>
              <div>🏠 {sel.project || '-'}</div>
              <div>📍 {sel.address || '-'}</div>
            </div>
            <div style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>ประวัติการติดต่อ</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <select style={{ ...field, width: 110, padding: '7px 9px', fontSize: 12.5 }} value={cForm.channel} onChange={(e) => setCForm({ ...cForm, channel: e.target.value })}>
                  {['โทรศัพท์', 'Line', 'อีเมล', 'นัดพบ'].map((c) => <option key={c}>{c}</option>)}
                </select>
                <input style={{ ...field, padding: '7px 9px', fontSize: 12.5 }} placeholder="บันทึกการติดต่อ…" value={cForm.note} onChange={(e) => setCForm({ ...cForm, note: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && submitContact()} />
                <button onClick={submitContact} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '0 12px', cursor: 'pointer' }}>+</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                {contacts.length === 0 && <div style={{ fontSize: 12, color: '#94A0A8', padding: '8px 0' }}>ยังไม่มีบันทึก</div>}
                {contacts.map((c) => (
                  <div key={c.id} style={{ borderLeft: '2px solid #30506A', paddingLeft: 10 }}>
                    <div style={{ fontSize: 12.5, color: '#1C2730' }}>{c.note}</div>
                    <div style={{ fontSize: 11, color: '#94A0A8' }}>{c.channel} · {c.date} · {c.by}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
