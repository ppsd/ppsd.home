import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { baht, unMoney, fmtMoneyDecimal } from '../../data'
import { useApp } from '../../store'
import ModalShell from '../shared/ModalShell'
import MoneyInput from '../shared/MoneyInput'

// แท็บ "การเงิน & สัญญา" ของบ้าน 1 หลัง
//  - สัญญา 2 ฝั่ง: บริษัท↔ลูกค้า · บริษัท↔ช่าง/ผู้รับเหมา (สัญญาหลัก / แก้ไขสัญญา / งานเพิ่ม / งานลด) + ไฟล์แนบ
//  - ประวัติเงินเข้า-ออกทีละครั้ง (บันทึกเองทุกครั้งที่กดเก็บเงิน/จ่ายช่างในแท็บงวดงาน) — แก้วันที่จริง/วิธีจ่าย/เลขที่ได้
//  - เงินที่เก็บ/จ่ายก่อนมีฟีเจอร์นี้ ขึ้นเป็น "ยอดยกมา" (ไม่มีวันที่)

type Side = 'customer' | 'contractor'
type Kind = 'main' | 'amend' | 'add' | 'reduce'
interface Contract {
  id: number; house_code: string; side: Side; party: string; kind: Kind; no: string; title: string
  sign_date: string | null; amount: number; file_id: number | null; file_name?: string | null; note: string; by: string; created: string
}
interface MoneyRow {
  id: number | null; carry?: boolean; side: Side; installment_id: number | null; inst_no: string; inst_detail: string; party: string
  date_iso: string | null; amount: number; method: string; ref_no: string; note: string; by: string; inst_deleted?: boolean
}
interface Party { name: string; contract_value: number | null; agreed_total: number; inst_total: number; paid: number }
interface MoneyData {
  house: { code: string; name: string; customer: string; value: number; contractor_value: number; contract_no: string }
  contracts: Contract[]
  log: MoneyRow[]
  summary: {
    customer: { contract_value: number | null; house_value: number; inst_total: number; received: number }
    contractor: { contract_value: number | null; house_value: number; inst_total: number; paid: number }
    parties: Party[]
  }
}
interface HouseFile { id: number; name: string; category?: string }

const KIND_LABEL: Record<Kind, string> = { main: 'สัญญาหลัก', amend: 'แก้ไขสัญญา', add: 'งานเพิ่ม', reduce: 'งานลด' }
const KIND_STYLE: Record<Kind, { c: string; bg: string }> = {
  main: { c: '#30506A', bg: '#E2E9EF' }, amend: { c: '#6B4E9E', bg: '#EEE8F6' },
  add: { c: '#2E7D55', bg: '#E2F1EA' }, reduce: { c: '#C24036', bg: '#FBEEEC' },
}
const METHODS = ['โอน', 'เงินสด', 'เช็ค', 'อื่นๆ']
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const thDate = (iso?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  return m ? `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1]} ${Number(m[1]) + 543}` : '—'
}
const signed = (n: number) => (n < 0 ? '−' + baht(Math.abs(n)) : baht(n))

const card: React.CSSProperties = { border: '1px solid #E4E9EE', borderRadius: 12, background: '#fff', overflow: 'hidden' }
const h3: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#1C2730', margin: 0 }
const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'left', background: '#F7F9FA', borderBottom: '1px solid #EEF1F4', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '9px 10px', fontSize: 13, borderBottom: '1px solid #F1F3F5', verticalAlign: 'top' }
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '8px 11px', outline: 'none', width: '100%', boxSizing: 'border-box' }
const lbl: React.CSSProperties = { fontSize: 11.5, color: '#5C6770', marginBottom: 3, display: 'block' }
const btn: React.CSSProperties = { fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }
const btnPrimary: React.CSSProperties = { ...btn, color: '#fff', background: '#30506A', border: 'none' }
const btnGhost: React.CSSProperties = { ...btn, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1' }
const small: React.CSSProperties = { fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '3px 9px', cursor: 'pointer' }
const pill = (c: string, bg: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 600, color: c, background: bg, padding: '2px 9px', borderRadius: 20, whiteSpace: 'nowrap', display: 'inline-block' })

function Stat({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{ padding: '12px 14px', minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: '#5C6770' }}>{label}</div>
      <div className="num" style={{ fontSize: 18, fontWeight: 700, color: color || '#1C2730', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#94A0A8', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export default function MoneyContractsPanel({ houseCode }: { houseCode: string }) {
  const { data, user } = useApp()
  const canWrite = user?.role === 'admin' || user?.role === 'accounting' || user?.role === 'site'
  const canDelete = user?.role === 'admin' || user?.role === 'accounting'
  const [d, setD] = useState<MoneyData | null>(null)
  const [err, setErr] = useState('')
  const [files, setFiles] = useState<HouseFile[]>([])
  const [editC, setEditC] = useState<Partial<Contract> | null>(null) // เปิดฟอร์มสัญญา (ใหม่/แก้)
  const [editM, setEditM] = useState<MoneyRow | null>(null)            // เปิดฟอร์มแก้รายการเงิน
  const [filter, setFilter] = useState<'all' | Side>('all')

  const load = () => {
    api.get<MoneyData>('/houses/' + houseCode + '/money').then((r) => { setD(r); setErr('') }).catch((e) => setErr((e as Error).message))
    api.get<HouseFile[]>('/files?house=' + encodeURIComponent(houseCode)).then(setFiles).catch(() => setFiles([]))
  }
  // โหลดใหม่เมื่อยอดงวดงานของบ้านนี้เปลี่ยน (กดเก็บเงิน/จ่ายช่างในแท็บงวดงาน หรือคนอื่นแก้ — อัปเดตสด)
  const instSig = data.installments.filter((i) => i.house_code === houseCode).map((i) => `${i.id}:${i.paid || 0}:${i.amount}`).join(',')
  useEffect(() => { load() /* eslint-disable-next-line */ }, [houseCode, instSig])

  const log = useMemo(() => {
    const rows = (d?.log || []).filter((r) => filter === 'all' || r.side === filter)
    // ยอดยกมา (ไม่มีวันที่) ขึ้นก่อน แล้วเรียงตามวันที่
    return [...rows].sort((a, b) => (a.carry === b.carry ? String(a.date_iso || '').localeCompare(String(b.date_iso || '')) || (a.id || 0) - (b.id || 0) : a.carry ? -1 : 1))
  }, [d, filter])

  if (err) return <div style={{ padding: 20, color: '#C24036', fontSize: 13 }}>โหลดข้อมูลไม่ได้: {err}</div>
  if (!d) return <div style={{ padding: 20, color: '#94A0A8', fontSize: 13 }}>กำลังโหลด…</div>

  const sc = d.summary.customer, sk = d.summary.contractor
  const custValue = sc.contract_value ?? sc.house_value
  const conValue = sk.contract_value ?? sk.house_value
  const custC = d.contracts.filter((c) => c.side === 'customer')
  const conC = d.contracts.filter((c) => c.side === 'contractor')
  const conParties = [...new Set([...d.summary.parties.map((p) => p.name), ...conC.map((c) => c.party)])] // ช่างทุกคนของบ้าน — ยังไม่มีสัญญาก็ขึ้น ให้กดเพิ่มได้
  const logSum = log.reduce((s, r) => s + (Number(r.amount) || 0), 0)

  const delContract = async (c: Contract) => {
    if (!window.confirm(`ลบ${KIND_LABEL[c.kind]} ${c.no ? 'เลขที่ ' + c.no + ' ' : ''}(${c.party}) ยอด ${signed(c.amount)}?`)) return
    try { await api.del('/houses/' + houseCode + '/contracts/' + c.id); load() } catch (e) { alert((e as Error).message) }
  }

  const contractTable = (rows: Contract[], showParty: boolean) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
        <thead><tr>
          <th style={th}>ประเภท</th><th style={th}>เลขที่</th><th style={th}>วันที่เซ็น</th>
          {showParty && <th style={th}>คู่สัญญา</th>}
          <th style={th}>รายละเอียด</th><th style={{ ...th, textAlign: 'right' }}>ยอดเงิน</th><th style={th}>ไฟล์</th><th style={th}></th>
        </tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td style={td}><span style={pill(KIND_STYLE[c.kind].c, KIND_STYLE[c.kind].bg)}>{KIND_LABEL[c.kind]}</span></td>
              <td style={td}>{c.no || '—'}</td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>{thDate(c.sign_date)}</td>
              {showParty && <td style={td}>{c.party}</td>}
              <td style={td}>{c.title || '—'}{c.note && <div style={{ fontSize: 11.5, color: '#94A0A8' }}>{c.note}</div>}</td>
              <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 600, color: c.amount < 0 ? '#C24036' : '#1C2730', whiteSpace: 'nowrap' }}>{c.kind === 'main' ? baht(c.amount) : (c.amount > 0 ? '+' : '') + signed(c.amount)}</td>
              <td style={td}>{c.file_id ? (c.file_name ? <button style={small} onClick={() => api.openFile('/files/' + c.file_id + '/view')} title={c.file_name}>เปิดไฟล์</button> : <span style={{ fontSize: 11.5, color: '#C24036' }}>ไฟล์ถูกลบ</span>) : <span style={{ color: '#94A0A8' }}>—</span>}</td>
              <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                {canWrite && <button style={small} onClick={() => setEditC(c)}>แก้</button>}
                {canDelete && <button style={{ ...small, color: '#C24036', borderColor: '#F0CFCB', marginLeft: 4 }} onClick={() => delContract(c)}>ลบ</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ยอดสรุป 2 ฝั่ง */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        {[
          { title: 'บริษัท ↔ ลูกค้า', sub: d.house.customer || '—', color: '#2E7D55', value: custValue, done: sc.received, doneLabel: 'รับเงินแล้ว', leftLabel: 'ค้างรับ', fromContract: sc.contract_value != null },
          { title: 'บริษัท ↔ ช่าง / ผู้รับเหมา', sub: `${d.summary.parties.length} ราย`, color: '#C0852C', value: conValue, done: sk.paid, doneLabel: 'จ่ายช่างแล้ว', leftLabel: 'ค้างจ่าย', fromContract: sk.contract_value != null },
        ].map((s) => (
          <div key={s.title} style={card}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #EEF1F4', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
              <span style={h3}>{s.title}</span><span style={{ fontSize: 12, color: '#5C6770' }}>{s.sub}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <Stat label="มูลค่าสัญญาล่าสุด" value={baht(s.value)} sub={s.fromContract ? 'รวมแก้ไข/งานเพิ่ม-ลด' : 'ยังไม่บันทึกสัญญา · ใช้ยอดในระบบ'} />
              <Stat label={s.doneLabel} value={baht(s.done)} color={s.color} />
              <Stat label={s.leftLabel} value={baht(Math.max(0, s.value - s.done))} color={s.value - s.done > 0 ? '#C24036' : '#5C6770'} />
            </div>
          </div>
        ))}
      </div>

      {/* สัญญาฝั่งลูกค้า */}
      <section style={card}>
        <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid #EEF1F4' }}>
          <h3 style={h3}>สัญญา บริษัท ↔ ลูกค้า</h3>
          {canWrite && <button style={btnPrimary} onClick={() => setEditC({ side: 'customer', kind: custC.length ? 'amend' : 'main', party: d.house.customer, no: custC.length ? '' : d.house.contract_no })}>+ เพิ่มสัญญาลูกค้า</button>}
        </div>
        {custC.length ? contractTable(custC, false) : <div style={{ padding: 16, fontSize: 13, color: '#94A0A8' }}>ยังไม่มีสัญญาลูกค้า — กด "เพิ่มสัญญาลูกค้า" เพื่อบันทึกสัญญาหลัก แล้วค่อยเพิ่มการแก้ไข / งานเพิ่ม-ลดทีหลัง</div>}
        {sc.contract_value != null && Math.abs(sc.contract_value - sc.house_value) > 0.5 && (
          <div style={{ padding: '9px 14px', fontSize: 12.5, color: '#8A5A12', background: '#FBF3E2', borderTop: '1px solid #F1E2C2' }}>
            มูลค่าตามสัญญา {baht(sc.contract_value)} ไม่ตรงกับมูลค่าบ้านในระบบ {baht(sc.house_value)} — ถ้าสัญญาถูกต้อง ให้แก้ราคาที่ปุ่ม "แก้ไขบ้าน"
          </div>
        )}
      </section>

      {/* สัญญาฝั่งช่าง */}
      <section style={card}>
        <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid #EEF1F4' }}>
          <h3 style={h3}>สัญญา บริษัท ↔ ช่าง / ผู้รับเหมา</h3>
          {canWrite && <button style={btnPrimary} onClick={() => setEditC({ side: 'contractor', kind: 'main', party: d.summary.parties[0]?.name || '' })}>+ เพิ่มสัญญาช่าง</button>}
        </div>
        {conParties.length === 0 && <div style={{ padding: 16, fontSize: 13, color: '#94A0A8' }}>ยังไม่มีช่างในบ้านนี้ — เพิ่มช่างที่แท็บ "ช่าง / ผู้รับเหมา" ก่อน แล้วกลับมาบันทึกสัญญา</div>}
        {conParties.map((name) => {
          const rows = conC.filter((c) => c.party === name)
          const p = d.summary.parties.find((x) => x.name === name)
          const val = rows.reduce((s, c) => s + c.amount, 0)
          return (
            <div key={name} style={{ borderBottom: '1px solid #EEF1F4' }}>
              <div style={{ padding: '9px 14px', display: 'flex', flexWrap: 'wrap', gap: '4px 16px', alignItems: 'baseline', background: '#FBFCFD' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{name}</span>
                <span style={{ fontSize: 12, color: '#5C6770' }}>มูลค่าสัญญา <b className="num" style={{ color: '#1C2730' }}>{rows.length ? baht(val) : '—'}</b></span>
                <span style={{ fontSize: 12, color: '#5C6770' }}>จ่ายแล้ว <b className="num" style={{ color: '#C0852C' }}>{baht(p?.paid || 0)}</b></span>
                {rows.length > 0 && <span style={{ fontSize: 12, color: '#5C6770' }}>ค้างจ่าย <b className="num" style={{ color: val - (p?.paid || 0) > 0 ? '#C24036' : '#5C6770' }}>{baht(Math.max(0, val - (p?.paid || 0)))}</b></span>}
                {rows.length > 0 && (p?.agreed_total || 0) > 0 && Math.abs(val - (p?.agreed_total || 0)) > 0.5 && <span style={{ fontSize: 11.5, color: '#8A5A12' }}>ไม่ตรงกับยอดตกลงจ้างในแท็บช่าง ({baht(p?.agreed_total || 0)})</span>}
                {canWrite && <button style={{ ...small, marginLeft: 'auto' }} onClick={() => setEditC({ side: 'contractor', kind: rows.length ? 'amend' : 'main', party: name, amount: rows.length ? undefined : (p?.agreed_total || undefined) })}>+ เพิ่ม</button>}
              </div>
              {rows.length ? contractTable(rows, false) : <div style={{ padding: '8px 14px 12px', fontSize: 12.5, color: '#94A0A8' }}>ยังไม่ได้บันทึกสัญญาของช่างคนนี้</div>}
            </div>
          )
        })}
      </section>

      {/* ประวัติเงินเข้า-ออก */}
      <section style={card}>
        <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid #EEF1F4' }}>
          <div>
            <h3 style={h3}>ประวัติเงินเข้า-ออก</h3>
            <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 2 }}>บันทึกให้เองทุกครั้งที่กดเก็บเงิน / จ่ายช่างในแท็บงวดงาน · กด "แก้" เพื่อใส่วันที่จริง วิธีจ่าย และเลขที่เอกสาร</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {([['all', 'ทั้งหมด'], ['customer', 'เงินเข้า (ลูกค้า)'], ['contractor', 'เงินออก (ช่าง)']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)} style={{ ...btn, fontSize: 12, padding: '5px 11px', border: '1px solid ' + (filter === v ? '#30506A' : '#D2DAE1'), background: filter === v ? '#30506A' : '#fff', color: filter === v ? '#fff' : '#30506A' }}>{l}</button>
            ))}
          </div>
        </div>
        {log.length === 0 ? <div style={{ padding: 16, fontSize: 13, color: '#94A0A8' }}>ยังไม่มีการเก็บเงินหรือจ่ายช่างของบ้านนี้</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead><tr>
                <th style={th}>วันที่</th><th style={th}>ประเภท</th><th style={th}>งวด</th><th style={th}>ลูกค้า / ช่าง</th>
                <th style={th}>วิธีจ่าย</th><th style={th}>เลขที่เอกสาร</th><th style={{ ...th, textAlign: 'right' }}>ยอดเงิน</th><th style={th}>ผู้บันทึก</th><th style={th}></th>
              </tr></thead>
              <tbody>
                {log.map((r, i) => {
                  const isIn = r.side === 'customer'
                  return (
                    <tr key={r.id ?? 'c' + i} style={{ background: r.carry ? '#FAFBFC' : undefined }}>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.carry ? <span style={{ color: '#94A0A8' }}>ยอดยกมา</span> : thDate(r.date_iso)}</td>
                      <td style={td}><span style={isIn ? pill('#2E7D55', '#E2F1EA') : pill('#C0852C', '#F6ECD6')}>{isIn ? 'เงินเข้า' : 'จ่ายช่าง'}</span></td>
                      <td style={td}>งวด {r.inst_no}{r.inst_detail && <div style={{ fontSize: 11.5, color: '#94A0A8' }}>{r.inst_detail}</div>}{r.inst_deleted && <div style={{ fontSize: 11, color: '#C24036' }}>งวดนี้ถูกลบแล้ว</div>}</td>
                      <td style={td}>{r.party || '—'}</td>
                      <td style={td}>{r.method || '—'}</td>
                      <td style={td}>{r.ref_no || '—'}{r.note && <div style={{ fontSize: 11.5, color: '#94A0A8' }}>{r.note}</div>}</td>
                      <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', color: r.amount < 0 ? '#C24036' : isIn ? '#2E7D55' : '#C0852C' }}>{signed(r.amount)}</td>
                      <td style={{ ...td, fontSize: 12, color: '#5C6770' }}>{r.by || '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{canWrite && !r.carry && r.id != null && <button style={small} onClick={() => setEditM(r)}>แก้</button>}</td>
                    </tr>
                  )
                })}
              </tbody>
              {filter !== 'all' && (
                <tfoot><tr>
                  <td colSpan={6} style={{ ...td, fontWeight: 600, color: '#5C6770', borderBottom: 'none' }}>รวม{filter === 'customer' ? 'รับจากลูกค้า' : 'จ่ายช่าง'}</td>
                  <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 700, borderBottom: 'none' }}>{signed(logSum)}</td>
                  <td colSpan={2} style={{ ...td, borderBottom: 'none' }}></td>
                </tr></tfoot>
              )}
            </table>
          </div>
        )}
      </section>

      {editC && <ContractModal houseCode={houseCode} init={editC} parties={d.summary.parties.map((p) => p.name)} customer={d.house.customer} files={files} onClose={() => setEditC(null)} onSaved={() => { setEditC(null); load() }} />}
      {editM && <MoneyEditModal houseCode={houseCode} row={editM} onClose={() => setEditM(null)} onSaved={() => { setEditM(null); load() }} />}
    </div>
  )
}

function ContractModal({ houseCode, init, parties, customer, files, onClose, onSaved }: {
  houseCode: string; init: Partial<Contract>; parties: string[]; customer: string; files: HouseFile[]; onClose: () => void; onSaved: () => void
}) {
  const [side, setSide] = useState<Side>(init.side || 'customer')
  const [kind, setKind] = useState<Kind>(init.kind || 'main')
  const [party, setParty] = useState(init.party || (init.side === 'contractor' ? '' : customer))
  const [amt, setAmt] = useState(init.amount != null ? fmtMoneyDecimal(Math.abs(init.amount)) : '')
  const [neg, setNeg] = useState((init.amount || 0) < 0) // แก้ไขสัญญา: ลดยอด
  const [no, setNo] = useState(init.no || '')
  const [title, setTitle] = useState(init.title || '')
  const [signDate, setSignDate] = useState(init.sign_date || '')
  const [fileId, setFileId] = useState(init.file_id ? String(init.file_id) : '')
  const [note, setNote] = useState(init.note || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const editing = init.id != null
  // ไฟล์หมวดสัญญาขึ้นก่อน
  const fileOpts = [...files].sort((a, b) => Number(b.category === 'สัญญา') - Number(a.category === 'สัญญา'))

  const save = async () => {
    setErr('')
    const v = unMoney(amt)
    const amount = kind === 'reduce' || (kind === 'amend' && neg) ? -v : v
    const body = { side, kind, party: party.trim(), amount, no, title, sign_date: signDate || null, file_id: fileId ? Number(fileId) : null, note }
    setBusy(true)
    try {
      if (editing) await api.put('/houses/' + houseCode + '/contracts/' + init.id, body)
      else await api.post('/houses/' + houseCode + '/contracts', body)
      onSaved()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <ModalShell
      title={editing ? 'แก้ไขสัญญา' : 'เพิ่มสัญญา'}
      sub={side === 'customer' ? 'บริษัท ↔ ลูกค้า' : 'บริษัท ↔ ช่าง / ผู้รับเหมา'}
      onClose={onClose}
      width={560}
      footer={<>
        <button style={btnGhost} onClick={onClose}>ยกเลิก</button>
        <button style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
      </>}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <span style={lbl}>ฝั่งสัญญา</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {([['customer', 'กับลูกค้า'], ['contractor', 'กับช่าง / ผู้รับเหมา']] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => { setSide(v); setParty(v === 'customer' ? customer : parties[0] || '') }}
                style={{ ...btn, flex: 1, border: '1px solid ' + (side === v ? '#30506A' : '#D2DAE1'), background: side === v ? '#30506A' : '#fff', color: side === v ? '#fff' : '#30506A' }}>{l}</button>
            ))}
          </div>
        </div>
        <label>
          <span style={lbl}>ประเภท *</span>
          <select id="hc-kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)} style={field}>
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label>
          <span style={lbl}>{side === 'customer' ? 'ลูกค้า *' : 'ช่าง / ผู้รับเหมา *'}</span>
          {side === 'contractor' && parties.length > 0
            ? <select id="hc-party" value={party} onChange={(e) => setParty(e.target.value)} style={field}>
                {!parties.includes(party) && <option value={party}>{party || '— เลือกช่าง —'}</option>}
                {parties.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            : <input id="hc-party" value={party} onChange={(e) => setParty(e.target.value)} style={field} />}
        </label>
        <label>
          <span style={lbl}>{kind === 'main' ? 'มูลค่าสัญญา (บาท) *' : kind === 'amend' ? 'ยอดที่เปลี่ยน (บาท) *' : kind === 'add' ? 'ยอดงานเพิ่ม (บาท) *' : 'ยอดงานลด (บาท) *'}</span>
          <MoneyInput value={amt} onChange={setAmt} style={field} placeholder="0" />
        </label>
        <div>
          {kind === 'amend' ? <>
            <span style={lbl}>ยอดสัญญา</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {([[false, '+ เพิ่มขึ้น'], [true, '− ลดลง']] as const).map(([v, l]) => (
                <button key={l} type="button" onClick={() => setNeg(v)} style={{ ...btn, flex: 1, border: '1px solid ' + (neg === v ? '#30506A' : '#D2DAE1'), background: neg === v ? '#30506A' : '#fff', color: neg === v ? '#fff' : '#30506A' }}>{l}</button>
              ))}
            </div>
          </> : <div style={{ fontSize: 11.5, color: '#94A0A8', paddingTop: 20 }}>{kind === 'main' ? 'ยอดเต็มตามสัญญาฉบับแรก' : kind === 'add' ? 'บวกเพิ่มจากสัญญาเดิม' : 'หักออกจากสัญญาเดิม'}</div>}
        </div>
        <label>
          <span style={lbl}>เลขที่สัญญา / เอกสาร</span>
          <input id="hc-no" value={no} onChange={(e) => setNo(e.target.value)} style={field} />
        </label>
        <label>
          <span style={lbl}>วันที่เซ็น</span>
          <input id="hc-date" type="date" value={signDate} onChange={(e) => setSignDate(e.target.value)} style={field} />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          <span style={lbl}>รายละเอียด</span>
          <input id="hc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'main' ? 'เช่น สัญญาก่อสร้างบ้านแบบ A' : 'เช่น เซ็นสัญญาครั้งที่ 2 · เพิ่มห้องน้ำชั้นบน'} style={field} />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          <span style={lbl}>ไฟล์แนบ (จากไฟล์ของบ้านนี้)</span>
          <select id="hc-file" value={fileId} onChange={(e) => setFileId(e.target.value)} style={field}>
            <option value="">— ไม่แนบ —</option>
            {fileOpts.map((f) => <option key={f.id} value={f.id}>{f.category ? `[${f.category}] ` : ''}{f.name}</option>)}
          </select>
          <span style={{ fontSize: 11, color: '#94A0A8' }}>ยังไม่มีไฟล์? อัปโหลดที่กล่อง "ไฟล์แบบบ้าน / สัญญา" ในหน้าบ้านก่อน แล้วกลับมาเลือก</span>
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          <span style={lbl}>หมายเหตุ</span>
          <textarea id="hc-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ ...field, resize: 'vertical' }} />
        </label>
      </div>
      {err && <div style={{ marginTop: 10, fontSize: 12.5, color: '#C24036' }}>{err}</div>}
    </ModalShell>
  )
}

function MoneyEditModal({ houseCode, row, onClose, onSaved }: { houseCode: string; row: MoneyRow; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(row.date_iso || '')
  const [method, setMethod] = useState(row.method || '')
  const [ref, setRef] = useState(row.ref_no || '')
  const [note, setNote] = useState(row.note || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async () => {
    setBusy(true); setErr('')
    try { await api.put('/houses/' + houseCode + '/money-log/' + row.id, { date_iso: date, method, ref_no: ref, note }); onSaved() }
    catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <ModalShell
      title="แก้รายละเอียดรายการเงิน"
      sub={`${row.side === 'customer' ? 'เงินเข้าจากลูกค้า' : 'จ่ายช่าง'} · งวด ${row.inst_no} · ${signed(row.amount)}`}
      onClose={onClose}
      width={460}
      footer={<>
        <button style={btnGhost} onClick={onClose}>ยกเลิก</button>
        <button style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
      </>}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label><span style={lbl}>วันที่รับ / จ่ายจริง</span><input id="ml-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={field} /></label>
        <label><span style={lbl}>วิธีจ่าย</span>
          <select id="ml-method" value={method} onChange={(e) => setMethod(e.target.value)} style={field}>
            <option value="">— ไม่ระบุ —</option>
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label style={{ gridColumn: '1 / -1' }}><span style={lbl}>เลขที่ใบเสร็จ / สลิป / เช็ค</span><input id="ml-ref" value={ref} onChange={(e) => setRef(e.target.value)} style={field} /></label>
        <label style={{ gridColumn: '1 / -1' }}><span style={lbl}>หมายเหตุ</span><input id="ml-note" value={note} onChange={(e) => setNote(e.target.value)} style={field} /></label>
      </div>
      <div style={{ marginTop: 10, fontSize: 11.5, color: '#94A0A8' }}>ยอดเงินแก้ที่นี่ไม่ได้ — ถ้ายอดผิด ให้แก้ที่แท็บงวดงาน (ระบบจะบันทึกรายการใหม่ให้เอง)</div>
      {err && <div style={{ marginTop: 8, fontSize: 12.5, color: '#C24036' }}>{err}</div>}
    </ModalShell>
  )
}
