import { useEffect, useState } from 'react'
import { api } from '../api'
import { baht, unMoney } from '../data'
import { useApp } from '../store'
import { exportXlsx, ExportButton } from '../exportCsv'
import MoneyInput from './MoneyInput'

interface Entry { id: number; date: string; date_iso?: string; house_code: string; kind: string; category: string; item: string; amount: number; budget: number; method: string; party: string; note: string; auto?: boolean; src?: string }

const CATS = ['วัสดุ', 'ค่าแรง', 'ผู้รับเหมาช่วง', 'เครื่องจักร', 'ค่าบริการ', 'ค่าดำเนินการ', 'ขนส่ง', 'อื่นๆ']
const METHODS = ['เงินสด', 'โอนธนาคาร', 'เครดิต', 'เช็ค']
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 9px', outline: 'none' }
const th: React.CSSProperties = { padding: '9px 12px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'left' }
const td: React.CSSProperties = { padding: '9px 12px', fontSize: 12.5 }

export default function LedgerTab() {
  const { data } = useApp()
  const houses = data.houses
  const [rows, setRows] = useState<Entry[]>([])
  const [adding, setAdding] = useState(false)
  const [fHouse, setFHouse] = useState('')
  const [fKind, setFKind] = useState('')
  const [fPeriod, setFPeriod] = useState('all')
  const blank = { date: new Date().toISOString().slice(0, 10), house_code: '', kind: 'out', category: 'วัสดุ', item: '', amount: '', budget: '', method: 'เงินสด', party: '' }
  const [f, setF] = useState(blank)

  const load = () => api.get<Entry[]>('/ledger').then(setRows).catch(() => setRows([]))
  useEffect(() => { load() }, [])

  const submit = async () => {
    if (!f.item.trim()) return
    await api.post('/ledger', { ...f, amount: unMoney(f.amount), budget: unMoney(f.budget) })
    setF(blank); setAdding(false); load()
  }
  const remove = async (id: number) => { await api.del('/ledger/' + id); load() }

  // กรองย้อนหลัง: วันนี้ / 7 วัน / เดือนนี้ / ทั้งหมด (ใช้ date_iso)
  const startOf = () => {
    const d = new Date(); d.setHours(0, 0, 0, 0)
    if (fPeriod === 'today') return d.toISOString().slice(0, 10)
    if (fPeriod === 'week') { const w = new Date(d); w.setDate(w.getDate() - 6); return w.toISOString().slice(0, 10) }
    if (fPeriod === 'month') return d.toISOString().slice(0, 8) + '01'
    return ''
  }
  const from = startOf()
  const list = rows.filter((r) => (!fHouse || r.house_code === fHouse) && (!fKind || r.kind === fKind) && (!from || (r.date_iso && r.date_iso >= from)))
  const income = list.filter((r) => r.kind === 'in').reduce((s, r) => s + r.amount, 0)
  const expense = list.filter((r) => r.kind === 'out').reduce((s, r) => s + r.amount, 0)
  // สรุปตามหมวด (เฉพาะรายจ่าย): งบ vs ใช้จริง
  const byCat = CATS.map((c) => {
    const es = list.filter((r) => r.kind === 'out' && r.category === c)
    const actual = es.reduce((s, r) => s + r.amount, 0)
    const budget = es.reduce((s, r) => s + r.budget, 0)
    return { c, actual, budget, variance: budget - actual, n: es.length }
  }).filter((x) => x.n > 0)

  const doExport = () => exportXlsx('ledger', ['วันที่', 'บ้าน', 'ประเภท', 'หมวด', 'รายการ', 'จำนวนเงิน', 'งบ', 'ผลต่าง', 'วิธีจ่าย', 'ผู้รับ/จ่าย'],
    list.map((r) => [r.date, r.house_code, r.kind === 'in' ? 'รับ' : 'จ่าย', r.category, r.item, r.amount, r.budget, r.budget - r.amount, r.method, r.party]), 'บัญชี')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: '14px 16px' }}><div style={{ fontSize: 12, color: '#5C6770' }}>รายรับรวม</div><div className="num" style={{ fontSize: 22, fontWeight: 700, color: '#2E7D55', marginTop: 4 }}>{baht(income)}</div></div>
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: '14px 16px' }}><div style={{ fontSize: 12, color: '#5C6770' }}>รายจ่ายรวม</div><div className="num" style={{ fontSize: 22, fontWeight: 700, color: '#C24036', marginTop: 4 }}>{baht(expense)}</div></div>
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: '14px 16px' }}><div style={{ fontSize: 12, color: '#5C6770' }}>คงเหลือสุทธิ</div><div className="num" style={{ fontSize: 22, fontWeight: 700, color: income - expense >= 0 ? '#1E2E3B' : '#C24036', marginTop: 4 }}>{baht(income - expense)}</div></div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <select style={{ ...field, padding: '6px 8px' }} value={fHouse} onChange={(e) => setFHouse(e.target.value)}><option value="">ทุกบ้าน</option>{houses.map((h) => <option key={h.id} value={h.code}>{h.name}</option>)}</select>
        <select style={{ ...field, padding: '6px 8px' }} value={fKind} onChange={(e) => setFKind(e.target.value)}><option value="">รับ+จ่าย</option><option value="in">รับ</option><option value="out">จ่าย</option></select>
        <div style={{ display: 'flex', gap: 4, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 9, padding: 4 }}>
          {([['today', 'วันนี้'], ['week', '7 วัน'], ['month', 'เดือนนี้'], ['all', 'ทั้งหมด']] as const).map(([id, label]) => (
            <div key={id} onClick={() => setFPeriod(id)} style={{ fontSize: 12.5, fontWeight: 500, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', color: fPeriod === id ? '#fff' : '#5C6770', background: fPeriod === id ? '#30506A' : 'transparent' }}>{label}</div>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <ExportButton onClick={doExport} />
          <button onClick={() => setAdding((v) => !v)} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>+ บันทึกรายการ</button>
        </div>
      </div>

      {adding && (
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
            <input style={field} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            <select style={field} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="out">รายจ่าย</option><option value="in">รายรับ</option></select>
            <select style={field} value={f.house_code} onChange={(e) => setF({ ...f, house_code: e.target.value })}><option value="">— บ้าน —</option>{houses.map((h) => <option key={h.id} value={h.code}>{h.name}</option>)}</select>
            <select style={field} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
            <select style={field} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.4fr', gap: 10, marginTop: 10 }}>
            <input style={field} placeholder="รายการ *" value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} />
            <MoneyInput style={field} placeholder="จำนวนเงิน" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
            <MoneyInput style={field} placeholder="งบที่ตั้งไว้" value={f.budget} onChange={(v) => setF({ ...f, budget: v })} />
            <input style={field} placeholder="ผู้รับ/ผู้จ่าย" value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={() => setAdding(false)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ยกเลิก</button>
            <button onClick={submit} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>บันทึก</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, alignItems: 'start' }}>
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#F7F9FB' }}><th style={{ ...th, paddingLeft: 16 }}>วันที่</th><th style={th}>รายการ</th><th style={{ ...th, textAlign: 'center' }}>หมวด</th><th style={{ ...th, textAlign: 'right' }}>จำนวน</th><th style={{ ...th, paddingRight: 16 }}></th></tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={5} style={{ padding: 36, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีรายการ</td></tr>}
              {list.map((r) => (
                <tr key={r.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td style={{ ...td, paddingLeft: 16, color: '#94A0A8', whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td style={td}><div style={{ fontWeight: 500 }}>{r.item}</div><div style={{ fontSize: 10.5, color: '#94A0A8' }}>{r.party || ''}{r.method ? ` · ${r.method}` : ''}{r.house_code ? ` · ${houses.find((h) => h.code === r.house_code)?.name || r.house_code}` : ''}</div></td>
                  <td style={{ ...td, textAlign: 'center' }}><span style={{ fontSize: 10.5, color: '#5C6770', background: '#F1F4F6', padding: '1px 8px', borderRadius: 20 }}>{r.category}</span></td>
                  <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 600, color: r.kind === 'in' ? '#2E7D55' : '#C24036' }}>{r.kind === 'in' ? '+' : '−'}{baht(r.amount)}</td>
                  <td style={{ ...td, paddingRight: 16, textAlign: 'center' }}>{r.auto ? <span title={r.src === 'installment' ? 'ดึงจากงวดงานอัตโนมัติ' : 'ดึงจากรายจ่าย/PO อัตโนมัติ'} style={{ fontSize: 9.5, fontWeight: 600, color: '#30506A', background: '#E9EFF3', padding: '1px 6px', borderRadius: 20 }}>อัตโนมัติ</span> : <button onClick={() => remove(r.id)} style={{ border: 'none', background: 'none', color: '#C24036', cursor: 'pointer' }}>✕</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '11px 14px', borderBottom: '1px solid #EEF1F4', fontSize: 13, fontWeight: 600 }}>งบ vs ใช้จริง (รายจ่ายตามหมวด)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ background: '#F7F9FB' }}><th style={{ ...th, padding: '7px 12px' }}>หมวด</th><th style={{ ...th, padding: '7px 8px', textAlign: 'right' }}>งบ</th><th style={{ ...th, padding: '7px 8px', textAlign: 'right' }}>ใช้จริง</th><th style={{ ...th, padding: '7px 12px', textAlign: 'right' }}>ผลต่าง</th></tr></thead>
            <tbody>
              {byCat.length === 0 && <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: '#94A0A8' }}>—</td></tr>}
              {byCat.map((x) => (
                <tr key={x.c} style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td style={{ padding: '7px 12px' }}>{x.c}</td>
                  <td className="num" style={{ padding: '7px 8px', textAlign: 'right', color: '#5C6770' }}>{x.budget ? baht(x.budget) : '-'}</td>
                  <td className="num" style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 600 }}>{baht(x.actual)}</td>
                  <td className="num" style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: x.variance >= 0 ? '#2E7D55' : '#C24036' }}>{x.budget ? baht(x.variance) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
