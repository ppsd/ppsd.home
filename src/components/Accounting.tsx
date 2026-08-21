import { useEffect, useState } from 'react'
import { api } from '../api'
import { baht } from '../data'
import { exportXlsx, ExportButton } from '../exportCsv'
import { company } from '../erpData'

// ระบบบัญชีคู่ (Double-entry / General Ledger) — เฟส 1
// งบการเงิน · งบทดลอง · สมุดรายวัน · แยกประเภท · ผังบัญชี

interface Account { code: string; name: string; type: string; parent?: string; builtin?: number }
interface TBRow { code: string; name: string; type: string; debit: number; credit: number; balance: number }
interface JLine { account: string; account_name?: string; debit: number; credit: number; memo?: string }
interface JEntry { id: number; no: string; date: string; date_iso: string; memo: string; house_code: string; source: string; void: number; lines: JLine[] }
interface IncomeStatement { revenue: TBRow[]; cost: TBRow[]; expense: TBRow[]; totalRevenue: number; totalCost: number; totalExpense: number; grossProfit: number; netProfit: number }
interface BalanceSheet { assets: TBRow[]; liabilities: TBRow[]; equity: TBRow[]; totalAssets: number; totalLiabilities: number; equityBooked: number; netProfit: number; totalEquity: number; balanced: boolean }

const TYPE_LABEL: Record<string, string> = { asset: 'สินทรัพย์', liability: 'หนี้สิน', equity: 'ส่วนของผู้ถือหุ้น', revenue: 'รายได้', cost: 'ต้นทุนงานก่อสร้าง', expense: 'ค่าใช้จ่าย' }
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 10px', outline: 'none' }
const th: React.CSSProperties = { padding: '9px 12px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'left' }
const card: React.CSSProperties = { background: '#fff', border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }

const TABS = [
  { id: 'statements', label: 'งบการเงิน' },
  { id: 'cashflow', label: 'งบกระแสเงินสด' },
  { id: 'projects', label: 'กำไรรายโครงการ' },
  { id: 'trial', label: 'งบทดลอง' },
  { id: 'journal', label: 'สมุดรายวัน' },
  { id: 'gl', label: 'แยกประเภท' },
  { id: 'coa', label: 'ผังบัญชี' },
]

export default function Accounting() {
  const [tab, setTab] = useState('statements')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [msg, setMsg] = useState('')
  const [rebuilding, setRebuilding] = useState(false)

  const loadAccounts = () => api.get<Account[]>('/accounts').then(setAccounts).catch(() => setAccounts([]))
  useEffect(() => { loadAccounts() }, [])

  const rebuild = async () => {
    if (!confirm('สร้าง/ซ่อมรายการบัญชีอัตโนมัติจากงวดงานที่เก็บ/จ่าย + รายจ่ายทั้งหมด?\n(ทำซ้ำได้ ไม่สร้างรายการซ้ำ)')) return
    setRebuilding(true); setMsg('')
    try { const r = await api.post<{ count: number }>('/accounting/rebuild', {}); setMsg(`สร้างรายการบัญชีจากข้อมูลเดิมแล้ว ${r.count} รายการ — ไปดูได้ที่ทุกแท็บ`) }
    catch (e) { setMsg('ผิดพลาด: ' + (e as Error).message) }
    finally { setRebuilding(false) }
  }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1E2E3B' }}>บัญชีแยกประเภท (ระบบบัญชีคู่)</div>
          <div style={{ fontSize: 12, color: '#94A0A8' }}>เดบิต/เครดิต · งบการเงินอัตโนมัติจากงวดงาน + รายจ่าย</div>
        </div>
        <button onClick={rebuild} disabled={rebuilding} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#C0852C', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>{rebuilding ? 'กำลังสร้าง…' : '↻ สร้างบัญชีจากข้อมูลเดิม'}</button>
      </div>
      {msg && <div style={{ fontSize: 12.5, color: msg.startsWith('ผิดพลาด') ? '#C24036' : '#2E7D55', background: msg.startsWith('ผิดพลาด') ? '#FBEEEC' : '#E2F1EA', border: '1px solid ' + (msg.startsWith('ผิดพลาด') ? '#E7CDC9' : '#CDE3D6'), borderRadius: 9, padding: '9px 13px' }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 2, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 11, padding: '6px 8px', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{ fontSize: 13, fontWeight: tab === t.id ? 600 : 500, color: tab === t.id ? '#fff' : '#5C6770', background: tab === t.id ? '#30506A' : 'transparent', padding: '7px 16px', borderRadius: 7, cursor: 'pointer' }}>{t.label}</div>
        ))}
      </div>

      {tab === 'statements' && <Statements />}
      {tab === 'cashflow' && <CashFlowStatement />}
      {tab === 'projects' && <ProjectPnl />}
      {tab === 'trial' && <TrialBalance />}
      {tab === 'journal' && <Journal accounts={accounts} />}
      {tab === 'gl' && <GeneralLedger accounts={accounts} />}
      {tab === 'coa' && <ChartOfAccounts accounts={accounts} reload={loadAccounts} />}
    </div>
  )
}

// ---------- งบการเงิน (P&L + งบดุล) ----------
function Statements() {
  const [is, setIs] = useState<IncomeStatement | null>(null)
  const [bs, setBs] = useState<BalanceSheet | null>(null)
  const [range, setRange] = useState({ from: '', to: '' })
  const load = () => {
    const q = new URLSearchParams()
    if (range.from) q.set('from', range.from); if (range.to) q.set('to', range.to)
    const qs = q.toString() ? '?' + q.toString() : ''
    api.get<IncomeStatement>('/income-statement' + qs).then(setIs).catch(() => setIs(null))
    api.get<BalanceSheet>('/balance-sheet' + qs).then(setBs).catch(() => setBs(null))
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [])
  const printStatements = async () => {
    const qs = (() => { const q = new URLSearchParams(); if (range.from) q.set('from', range.from); if (range.to) q.set('to', range.to); return q.toString() ? '?' + q.toString() : '' })()
    const cf = await api.get<CashFlow>('/cash-flow' + qs).catch(() => null)
    const money = (n: number) => (n < 0 ? '(' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ')' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    const rowsHtml = (arr: TBRow[]) => arr.map((r) => `<tr><td style="padding-left:18px">${r.code} ${r.name}</td><td class="n">${money(r.balance)}</td></tr>`).join('')
    const period = range.from || range.to ? `${range.from || 'เริ่มต้น'} ถึง ${range.to || 'ปัจจุบัน'}` : 'ตั้งแต่เริ่มต้นจนถึงปัจจุบัน'
    const cfSec = (title: string, rows: { label: string; amount: number }[], total: number) => `<tr class="h"><td colspan="2">${title}</td></tr>${rows.map((r) => `<tr><td style="padding-left:18px">${r.label}</td><td class="n">${money(r.amount)}</td></tr>`).join('') || '<tr><td style="padding-left:18px">—</td><td class="n"></td></tr>'}<tr class="s"><td>รวม</td><td class="n">${money(total)}</td></tr>`
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>งบการเงิน ${company.name}</title>
    <style>body{font-family:'Kanit','TH Sarabun New',sans-serif;color:#1C2730;margin:28px;font-size:13px}
    h1{font-size:16px;margin:0}.sub{color:#5C6770;font-size:11px}.tit{font-size:15px;font-weight:700;margin:22px 0 2px}
    table{width:100%;border-collapse:collapse;margin-top:6px}td{padding:3px 6px;border-bottom:1px solid #EEF1F4}
    .n{text-align:right;font-variant-numeric:tabular-nums}.h td{font-weight:700;color:#30506A;border-bottom:1px solid #ccc;padding-top:8px}
    .s td{font-weight:700;border-top:2px solid #999;border-bottom:none}.doc{page-break-after:always}
    @media print{@page{margin:14mm}}</style></head><body>
    <div style="border-bottom:2px solid #1E2E3B;padding-bottom:8px"><h1>${company.name}</h1><div class="sub">${company.address}<br>${company.taxId}</div></div>
    <div class="doc"><div class="tit">งบกำไรขาดทุน</div><div class="sub">สำหรับงวด ${period}</div><table>
      <tr class="h"><td>รายได้</td><td class="n"></td></tr>${is ? rowsHtml(is.revenue) : ''}<tr class="s"><td>รวมรายได้</td><td class="n">${money(is?.totalRevenue || 0)}</td></tr>
      <tr class="h"><td>ต้นทุนงานก่อสร้าง</td><td class="n"></td></tr>${is ? rowsHtml(is.cost) : ''}<tr class="s"><td>รวมต้นทุน</td><td class="n">${money(is?.totalCost || 0)}</td></tr>
      <tr class="s"><td>กำไรขั้นต้น</td><td class="n">${money(is?.grossProfit || 0)}</td></tr>
      <tr class="h"><td>ค่าใช้จ่ายดำเนินงาน</td><td class="n"></td></tr>${is ? rowsHtml(is.expense) : ''}<tr class="s"><td>รวมค่าใช้จ่าย</td><td class="n">${money(is?.totalExpense || 0)}</td></tr>
      <tr class="s"><td>กำไร(ขาดทุน)สุทธิ</td><td class="n">${money(is?.netProfit || 0)}</td></tr></table></div>
    <div class="doc"><div class="tit">งบแสดงฐานะการเงิน</div><div class="sub">ณ ${range.to || 'ปัจจุบัน'}</div><table>
      <tr class="h"><td>สินทรัพย์</td><td class="n"></td></tr>${bs ? rowsHtml(bs.assets) : ''}<tr class="s"><td>รวมสินทรัพย์</td><td class="n">${money(bs?.totalAssets || 0)}</td></tr>
      <tr class="h"><td>หนี้สิน</td><td class="n"></td></tr>${bs ? rowsHtml(bs.liabilities) : ''}<tr class="s"><td>รวมหนี้สิน</td><td class="n">${money(bs?.totalLiabilities || 0)}</td></tr>
      <tr class="h"><td>ส่วนของผู้ถือหุ้น</td><td class="n"></td></tr>${bs ? rowsHtml(bs.equity) : ''}<tr><td style="padding-left:18px">กำไร(ขาดทุน)สะสมงวดนี้</td><td class="n">${money(bs?.netProfit || 0)}</td></tr><tr class="s"><td>รวมส่วนของผู้ถือหุ้น</td><td class="n">${money(bs?.totalEquity || 0)}</td></tr>
      <tr class="s"><td>รวมหนี้สินและส่วนของผู้ถือหุ้น</td><td class="n">${money((bs?.totalLiabilities || 0) + (bs?.totalEquity || 0))}</td></tr></table></div>
    ${cf ? `<div><div class="tit">งบกระแสเงินสด</div><div class="sub">สำหรับงวด ${period}</div><table>
      <tr><td>เงินสดยกมาต้นงวด</td><td class="n">${money(cf.opening)}</td></tr>
      ${cfSec('กระแสเงินสดจากกิจกรรมดำเนินงาน', cf.operating, cf.netOperating)}
      ${cfSec('กระแสเงินสดจากกิจกรรมลงทุน', cf.investing, cf.netInvesting)}
      ${cfSec('กระแสเงินสดจากกิจกรรมจัดหาเงิน', cf.financing, cf.netFinancing)}
      <tr class="s"><td>เงินสดเพิ่มขึ้น(ลดลง)สุทธิ</td><td class="n">${money(cf.netChange)}</td></tr>
      <tr class="s"><td>เงินสดคงเหลือปลายงวด</td><td class="n">${money(cf.closing)}</td></tr></table></div>` : ''}
    <script>window.onload=function(){window.print()}</script></body></html>`
    const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close() }
  }
  const row = (label: string, val: number, opts: { bold?: boolean; top?: boolean; color?: string } = {}) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: opts.top ? '9px 0 0' : '4px 0', marginTop: opts.top ? 6 : 0, borderTop: opts.top ? '1px solid #E1E5EA' : undefined, fontWeight: opts.bold ? 700 : 500, fontSize: opts.bold ? 15 : 13, color: opts.color || (opts.bold ? '#1E2E3B' : '#3C4750') }}>
      <span>{label}</span><span className="num">{baht(val)}</span>
    </div>
  )
  const lines = (rows: TBRow[]) => rows.map((r) => (
    <div key={r.code} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12.5, color: '#5C6770' }}>
      <span>{r.code} {r.name}</span><span className="num">{baht(r.balance)}</span>
    </div>
  ))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: '#5C6770' }}>ช่วงวันที่:</span>
        <input type="date" style={field} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <span style={{ color: '#94A0A8' }}>–</span>
        <input type="date" style={field} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <button onClick={load} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>ดูงบ</button>
        {(range.from || range.to) && <button onClick={() => { setRange({ from: '', to: '' }); setTimeout(load, 0) }} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>ล้าง</button>}
        <span style={{ fontSize: 11.5, color: '#94A0A8', marginLeft: 4 }}>(ไม่ระบุ = ตั้งแต่ต้นจนถึงปัจจุบัน)</span>
        <button onClick={printStatements} className="hov-f3f5f7" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>🖨 พิมพ์งบการเงิน</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: 14 }}>
        {/* งบกำไรขาดทุน */}
        <div style={{ ...card, padding: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2E3B', marginBottom: 4 }}>งบกำไรขาดทุน</div>
          <div style={{ fontSize: 11.5, color: '#94A0A8', marginBottom: 10 }}>Income Statement (P&amp;L)</div>
          {is ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#2E7D55', marginTop: 6 }}>รายได้</div>
              {lines(is.revenue)}
              {row('รวมรายได้', is.totalRevenue, { top: true, color: '#2E7D55' })}
              <div style={{ fontSize: 12, fontWeight: 600, color: '#C0852C', marginTop: 12 }}>ต้นทุนงานก่อสร้าง</div>
              {lines(is.cost)}
              {row('รวมต้นทุน', is.totalCost, { top: true, color: '#C0852C' })}
              {row('กำไรขั้นต้น', is.grossProfit, { bold: true, color: is.grossProfit >= 0 ? '#2E7D55' : '#C24036' })}
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6B4E9E', marginTop: 12 }}>ค่าใช้จ่ายดำเนินงาน</div>
              {lines(is.expense)}
              {row('รวมค่าใช้จ่าย', is.totalExpense, { top: true, color: '#6B4E9E' })}
              {row('กำไร(ขาดทุน)สุทธิ', is.netProfit, { bold: true, top: true, color: is.netProfit >= 0 ? '#2E7D55' : '#C24036' })}
            </>
          ) : <div style={{ color: '#94A0A8', padding: 20, textAlign: 'center' }}>ยังไม่มีข้อมูล</div>}
        </div>
        {/* งบแสดงฐานะการเงิน */}
        <div style={{ ...card, padding: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2E3B', marginBottom: 4 }}>งบแสดงฐานะการเงิน</div>
          <div style={{ fontSize: 11.5, color: '#94A0A8', marginBottom: 10 }}>Balance Sheet (งบดุล)</div>
          {bs ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#30506A', marginTop: 6 }}>สินทรัพย์</div>
              {lines(bs.assets)}
              {row('รวมสินทรัพย์', bs.totalAssets, { top: true, bold: true, color: '#30506A' })}
              <div style={{ fontSize: 12, fontWeight: 600, color: '#C24036', marginTop: 12 }}>หนี้สิน</div>
              {bs.liabilities.length ? lines(bs.liabilities) : <div style={{ fontSize: 12, color: '#94A0A8', padding: '3px 0' }}>—</div>}
              {row('รวมหนี้สิน', bs.totalLiabilities, { top: true, color: '#C24036' })}
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6B4E9E', marginTop: 12 }}>ส่วนของผู้ถือหุ้น</div>
              {lines(bs.equity)}
              {row('กำไร(ขาดทุน)สะสมงวดนี้', bs.netProfit)}
              {row('รวมส่วนของผู้ถือหุ้น', bs.totalEquity, { top: true, color: '#6B4E9E' })}
              {row('รวมหนี้สิน + ส่วนของผู้ถือหุ้น', bs.totalLiabilities + bs.totalEquity, { bold: true, top: true })}
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: bs.balanced ? '#2E7D55' : '#C24036', textAlign: 'right' }}>{bs.balanced ? '✓ งบดุลสมดุล' : '✗ งบไม่สมดุล'}</div>
            </>
          ) : <div style={{ color: '#94A0A8', padding: 20, textAlign: 'center' }}>ยังไม่มีข้อมูล</div>}
        </div>
      </div>
    </div>
  )
}

// ---------- งบทดลอง ----------
function TrialBalance() {
  const [rows, setRows] = useState<TBRow[]>([])
  useEffect(() => { api.get<TBRow[]>('/trial-balance').then(setRows).catch(() => setRows([])) }, [])
  const totDr = rows.reduce((s, r) => s + r.debit, 0)
  const totCr = rows.reduce((s, r) => s + r.credit, 0)
  const doExport = () => exportXlsx('งบทดลอง', ['รหัส', 'ชื่อบัญชี', 'ประเภท', 'เดบิต', 'เครดิต'], rows.map((r) => [r.code, r.name, TYPE_LABEL[r.type] || r.type, r.debit, r.credit]), 'งบทดลอง')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{rows.length > 0 && <ExportButton onClick={doExport} label="ส่งออก Excel" />}</div>
    <div style={card}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ background: '#F7F9FB' }}>
          <th style={{ ...th, paddingLeft: 18 }}>รหัส</th><th style={th}>ชื่อบัญชี</th><th style={th}>ประเภท</th>
          <th style={{ ...th, textAlign: 'right' }}>เดบิต</th><th style={{ ...th, textAlign: 'right', paddingRight: 18 }}>เครดิต</th>
        </tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีรายการบัญชี — กด “สร้างบัญชีจากข้อมูลเดิม” ด้านบน</td></tr>}
          {rows.map((r) => (
            <tr key={r.code} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
              <td className="num" style={{ padding: '9px 18px', fontFamily: 'monospace', fontWeight: 600 }}>{r.code}</td>
              <td style={{ padding: '9px 12px' }}>{r.name}</td>
              <td style={{ padding: '9px 12px', color: '#94A0A8', fontSize: 12 }}>{TYPE_LABEL[r.type] || r.type}</td>
              <td className="num" style={{ padding: '9px 12px', textAlign: 'right', color: r.debit ? '#1C2730' : '#CBD3DA' }}>{r.debit ? baht(r.debit) : '-'}</td>
              <td className="num" style={{ padding: '9px 18px', textAlign: 'right', color: r.credit ? '#1C2730' : '#CBD3DA' }}>{r.credit ? baht(r.credit) : '-'}</td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && <tfoot><tr style={{ borderTop: '2px solid #E1E5EA', background: '#F7F9FB', fontWeight: 700 }}>
          <td colSpan={3} style={{ padding: '11px 18px' }}>รวม {Math.abs(totDr - totCr) < 0.5 && <span style={{ fontSize: 11, color: '#2E7D55', fontWeight: 600 }}>✓ สมดุล</span>}</td>
          <td className="num" style={{ padding: '11px 12px', textAlign: 'right' }}>{baht(totDr)}</td>
          <td className="num" style={{ padding: '11px 18px', textAlign: 'right' }}>{baht(totCr)}</td>
        </tr></tfoot>}
      </table>
    </div>
    </div>
  )
}

// ---------- สมุดรายวัน (+ ลงรายการเอง) ----------
function Journal({ accounts }: { accounts: Account[] }) {
  const [rows, setRows] = useState<JEntry[]>([])
  const [adding, setAdding] = useState(false)
  const load = () => api.get<JEntry[]>('/journal').then(setRows).catch(() => setRows([]))
  useEffect(() => { load() }, [])
  const srcLabel = (s: string) => s === 'inst' ? 'งวดงาน (อัตโนมัติ)' : s === 'exp' ? 'รายจ่าย (อัตโนมัติ)' : s === 'manual' ? 'บันทึกเอง' : s
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: '#5C6770' }}>สมุดรายวัน <b className="num" style={{ color: '#1C2730' }}>{rows.length}</b> รายการ</div>
        <button onClick={() => setAdding((v) => !v)} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>+ ลงรายการเอง</button>
      </div>
      {adding && <JournalForm accounts={accounts} onDone={() => { setAdding(false); load() }} onCancel={() => setAdding(false)} />}
      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#F7F9FB' }}>
            <th style={{ ...th, paddingLeft: 18 }}>เลขที่ / วันที่</th><th style={th}>คำอธิบาย</th><th style={th}>บัญชี (เดบิต/เครดิต)</th><th style={{ ...th, textAlign: 'right', paddingRight: 18 }}>จำนวนเงิน</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีรายการ</td></tr>}
            {rows.map((e) => {
              const amt = e.lines.reduce((s, l) => s + (l.debit || 0), 0)
              return (
                <tr key={e.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6', opacity: e.void ? 0.5 : 1 }}>
                  <td style={{ padding: '10px 18px', verticalAlign: 'top' }}><div className="num" style={{ fontWeight: 600, fontFamily: 'monospace' }}>{e.no}{e.void ? ' (ยกเลิก)' : ''}</div><div style={{ fontSize: 10.5, color: '#94A0A8' }}>{e.date}</div></td>
                  <td style={{ padding: '10px 12px', verticalAlign: 'top' }}><div>{e.memo || '-'}</div><div style={{ fontSize: 10.5, color: e.source === 'manual' ? '#6B4E9E' : '#94A0A8' }}>{srcLabel(e.source)}</div></td>
                  <td style={{ padding: '10px 12px', verticalAlign: 'top', fontSize: 12 }}>
                    {e.lines.map((l, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6, color: l.debit ? '#1C2730' : '#5C6770', paddingLeft: l.credit ? 20 : 0 }}>
                        <span style={{ fontFamily: 'monospace', color: '#94A0A8' }}>{l.account}</span>
                        <span>{l.account_name}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: l.debit ? '#30506A' : '#C0852C' }}>{l.debit ? 'Dr' : 'Cr'}</span>
                      </div>
                    ))}
                  </td>
                  <td className="num" style={{ padding: '10px 18px', textAlign: 'right', fontWeight: 600, verticalAlign: 'top' }}>{baht(amt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function JournalForm({ accounts, onDone, onCancel }: { accounts: Account[]; onDone: () => void; onCancel: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [memo, setMemo] = useState('')
  const [date, setDate] = useState(today)
  const [lines, setLines] = useState<{ account: string; debit: string; credit: string }[]>([{ account: '', debit: '', credit: '' }, { account: '', debit: '', credit: '' }])
  const [err, setErr] = useState('')
  const setL = (i: number, patch: Partial<{ account: string; debit: string; credit: string }>) => setLines((ls) => ls.map((l, j) => j === i ? { ...l, ...patch } : l))
  const totDr = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
  const totCr = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
  const balanced = Math.abs(totDr - totCr) < 0.005 && totDr > 0
  const submit = async () => {
    setErr('')
    const payload = { date_iso: date, memo, lines: lines.filter((l) => l.account && ((Number(l.debit) || 0) || (Number(l.credit) || 0))).map((l) => ({ account: l.account, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })) }
    try { await api.post('/journal', payload); onDone() } catch (e) { setErr((e as Error).message) }
  }
  return (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 12, marginBottom: 12 }}>
        <div><div style={{ fontSize: 12, color: '#5C6770', marginBottom: 4 }}>วันที่</div><input type="date" style={{ ...field, width: '100%' }} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><div style={{ fontSize: 12, color: '#5C6770', marginBottom: 4 }}>คำอธิบายรายการ</div><input style={{ ...field, width: '100%' }} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="เช่น รับชำระค่างวด / จ่ายค่าเช่าสำนักงาน" /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 30px', gap: 8, fontSize: 11, color: '#94A0A8', padding: '0 2px 4px' }}><span>บัญชี</span><span style={{ textAlign: 'right' }}>เดบิต</span><span style={{ textAlign: 'right' }}>เครดิต</span><span /></div>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 30px', gap: 8, marginBottom: 6, alignItems: 'center' }}>
          <select style={field} value={l.account} onChange={(e) => setL(i, { account: e.target.value })}>
            <option value="">— เลือกบัญชี —</option>
            {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
          </select>
          <input type="number" style={{ ...field, textAlign: 'right' }} value={l.debit} onChange={(e) => setL(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} placeholder="0" />
          <input type="number" style={{ ...field, textAlign: 'right' }} value={l.credit} onChange={(e) => setL(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} placeholder="0" />
          <button onClick={() => setLines((ls) => ls.length > 2 ? ls.filter((_, j) => j !== i) : ls)} style={{ border: 'none', background: 'none', color: lines.length > 2 ? '#C24036' : '#CBD3DA', cursor: 'pointer', fontSize: 15 }}>✕</button>
        </div>
      ))}
      <button onClick={() => setLines((ls) => [...ls, { account: '', debit: '', credit: '' }])} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#30506A', background: '#fff', border: '1px dashed #B9C6D0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', marginTop: 2 }}>+ เพิ่มบรรทัด</button>
      <div style={{ display: 'flex', gap: 20, justifyContent: 'flex-end', marginTop: 12, fontSize: 13, alignItems: 'center' }}>
        <span style={{ color: '#5C6770' }}>เดบิตรวม <b className="num" style={{ color: '#30506A' }}>{baht(totDr)}</b></span>
        <span style={{ color: '#5C6770' }}>เครดิตรวม <b className="num" style={{ color: '#C0852C' }}>{baht(totCr)}</b></span>
        <span style={{ fontWeight: 600, color: balanced ? '#2E7D55' : '#C24036' }}>{balanced ? '✓ สมดุล' : `ต่างกัน ${baht(Math.abs(totDr - totCr))}`}</span>
      </div>
      {err && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 8 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button onClick={onCancel} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ยกเลิก</button>
        <button onClick={submit} disabled={!balanced} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: balanced ? '#30506A' : '#C4CCD3', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: balanced ? 'pointer' : 'not-allowed' }}>บันทึกรายการ</button>
      </div>
    </div>
  )
}

// ---------- แยกประเภท ----------
function GeneralLedger({ accounts }: { accounts: Account[] }) {
  const [account, setAccount] = useState('')
  const [data, setData] = useState<{ account: Account | null; rows: { no: string; date: string; memo: string; debit: number; credit: number; balance: number }[] } | null>(null)
  const load = (code: string) => { if (!code) { setData(null); return } api.get<typeof data>('/gl/' + code).then(setData).catch(() => setData(null)) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12.5, color: '#5C6770' }}>เลือกบัญชี:</span>
        <select style={{ ...field, minWidth: 280 }} value={account} onChange={(e) => { setAccount(e.target.value); load(e.target.value) }}>
          <option value="">— เลือกบัญชี —</option>
          {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
        </select>
      </div>
      {data && data.account && (
        <div style={card}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #EEF1F4', fontWeight: 600 }}>{data.account.code} {data.account.name} <span style={{ fontSize: 12, color: '#94A0A8' }}>· {TYPE_LABEL[data.account.type]}</span></div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#F7F9FB' }}>
              <th style={{ ...th, paddingLeft: 18 }}>เลขที่/วันที่</th><th style={th}>คำอธิบาย</th>
              <th style={{ ...th, textAlign: 'right' }}>เดบิต</th><th style={{ ...th, textAlign: 'right' }}>เครดิต</th><th style={{ ...th, textAlign: 'right', paddingRight: 18 }}>คงเหลือ</th>
            </tr></thead>
            <tbody>
              {data.rows.length === 0 && <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', color: '#94A0A8' }}>ไม่มีความเคลื่อนไหว</td></tr>}
              {data.rows.map((r, i) => (
                <tr key={i} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td style={{ padding: '9px 18px' }}><span className="num" style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.no}</span><div style={{ fontSize: 10.5, color: '#94A0A8' }}>{r.date}</div></td>
                  <td style={{ padding: '9px 12px', color: '#5C6770' }}>{r.memo}</td>
                  <td className="num" style={{ padding: '9px 12px', textAlign: 'right', color: r.debit ? '#1C2730' : '#CBD3DA' }}>{r.debit ? baht(r.debit) : '-'}</td>
                  <td className="num" style={{ padding: '9px 12px', textAlign: 'right', color: r.credit ? '#1C2730' : '#CBD3DA' }}>{r.credit ? baht(r.credit) : '-'}</td>
                  <td className="num" style={{ padding: '9px 18px', textAlign: 'right', fontWeight: 600 }}>{baht(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------- ผังบัญชี ----------
function ChartOfAccounts({ accounts, reload }: { accounts: Account[]; reload: () => void }) {
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ code: '', name: '', type: 'expense' })
  const [err, setErr] = useState('')
  const add = async () => {
    setErr('')
    try { await api.post('/accounts', f); setF({ code: '', name: '', type: 'expense' }); setAdding(false); reload() }
    catch (e) { setErr((e as Error).message) }
  }
  const groups = ['asset', 'liability', 'equity', 'revenue', 'cost', 'expense']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: '#5C6770' }}>ผังบัญชี <b className="num" style={{ color: '#1C2730' }}>{accounts.length}</b> บัญชี</div>
        <button onClick={() => setAdding((v) => !v)} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>+ เพิ่มบัญชี</button>
      </div>
      {adding && (
        <div style={{ ...card, padding: 16, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>รหัสบัญชี</div><input style={field} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="เช่น 6060" /></div>
          <div style={{ flex: 1, minWidth: 200 }}><div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>ชื่อบัญชี</div><input style={{ ...field, width: '100%' }} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="เช่น ค่าเช่าสำนักงาน" /></div>
          <div><div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>ประเภท</div><select style={field} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{groups.map((g) => <option key={g} value={g}>{TYPE_LABEL[g]}</option>)}</select></div>
          <button onClick={add} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>บันทึก</button>
          {err && <div style={{ fontSize: 12, color: '#C24036', width: '100%' }}>{err}</div>}
        </div>
      )}
      {groups.map((g) => {
        const items = accounts.filter((a) => a.type === g)
        if (!items.length) return null
        return (
          <div key={g} style={card}>
            <div style={{ padding: '10px 18px', background: '#F7F9FB', borderBottom: '1px solid #EEF1F4', fontWeight: 600, fontSize: 13, color: '#30506A' }}>{TYPE_LABEL[g]}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))' }}>
              {items.map((a) => (
                <div key={a.code} style={{ padding: '9px 18px', borderBottom: '1px solid #F4F6F8', fontSize: 13, display: 'flex', gap: 8 }}>
                  <span className="num" style={{ fontFamily: 'monospace', color: '#94A0A8', fontWeight: 600 }}>{a.code}</span>
                  <span>{a.name}</span>
                  {!a.builtin && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#6B4E9E' }}>เพิ่มเอง</span>}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------- งบกระแสเงินสด (Cash Flow — วิธีตรง) ----------
interface CashFlow { opening: number; operating: { label: string; amount: number }[]; investing: { label: string; amount: number }[]; financing: { label: string; amount: number }[]; netOperating: number; netInvesting: number; netFinancing: number; netChange: number; closing: number }
function CashFlowStatement() {
  const [cf, setCf] = useState<CashFlow | null>(null)
  const [range, setRange] = useState({ from: '', to: '' })
  const load = () => {
    const q = new URLSearchParams(); if (range.from) q.set('from', range.from); if (range.to) q.set('to', range.to)
    api.get<CashFlow>('/cash-flow' + (q.toString() ? '?' + q.toString() : '')).then(setCf).catch(() => setCf(null))
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [])
  const section = (title: string, rows: { label: string; amount: number }[], total: number, color: string) => (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color }}>{title}</div>
      {rows.length ? rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13, color: '#3C4750' }}>
          <span>{r.label}</span><span className="num" style={{ color: r.amount < 0 ? '#C24036' : '#2E7D55' }}>{baht(r.amount)}</span>
        </div>
      )) : <div style={{ fontSize: 12, color: '#94A0A8', padding: '3px 0' }}>—</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 0', marginTop: 4, borderTop: '1px solid #EEF1F4', fontWeight: 600, fontSize: 13 }}><span>เงินสดสุทธิ{title.replace('กระแสเงินสดจาก', '')}</span><span className="num">{baht(total)}</span></div>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: '#5C6770' }}>ช่วงวันที่:</span>
        <input type="date" style={field} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <span style={{ color: '#94A0A8' }}>–</span>
        <input type="date" style={field} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <button onClick={load} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>ดูงบ</button>
        {(range.from || range.to) && <button onClick={() => { setRange({ from: '', to: '' }); setTimeout(load, 0) }} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>ล้าง</button>}
      </div>
      <div style={{ ...card, padding: 20, maxWidth: 560 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2E3B' }}>งบกระแสเงินสด</div>
        <div style={{ fontSize: 11.5, color: '#94A0A8', marginBottom: 6 }}>Cash Flow Statement (วิธีตรง)</div>
        {cf ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, fontWeight: 600, color: '#5C6770' }}><span>เงินสดยกมาต้นงวด</span><span className="num">{baht(cf.opening)}</span></div>
            {section('กระแสเงินสดจากกิจกรรมดำเนินงาน', cf.operating, cf.netOperating, '#2E7D55')}
            {section('กระแสเงินสดจากกิจกรรมลงทุน', cf.investing, cf.netInvesting, '#30506A')}
            {section('กระแสเงินสดจากกิจกรรมจัดหาเงิน', cf.financing, cf.netFinancing, '#6B4E9E')}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', marginTop: 8, borderTop: '2px solid #E1E5EA', fontWeight: 700, fontSize: 14 }}><span>เงินสดเพิ่มขึ้น(ลดลง)สุทธิ</span><span className="num" style={{ color: cf.netChange < 0 ? '#C24036' : '#2E7D55' }}>{baht(cf.netChange)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', fontWeight: 700, fontSize: 15, color: '#1E2E3B' }}><span>เงินสดคงเหลือปลายงวด</span><span className="num">{baht(cf.closing)}</span></div>
          </>
        ) : <div style={{ color: '#94A0A8', padding: 20, textAlign: 'center' }}>ยังไม่มีข้อมูล</div>}
      </div>
    </div>
  )
}

// ---------- กำไรรายโครงการ ----------
interface ProjectRow { house_code: string; house_name: string; revenue: number; cost: number; expense: number; profit: number }
function ProjectPnl() {
  const [rows, setRows] = useState<ProjectRow[]>([])
  useEffect(() => { api.get<ProjectRow[]>('/project-pnl').then(setRows).catch(() => setRows([])) }, [])
  const doExport = () => exportXlsx('กำไรรายโครงการ', ['บ้าน/โครงการ', 'รายได้', 'ต้นทุน', 'ค่าใช้จ่าย', 'กำไร(ขาดทุน)'], rows.map((r) => [r.house_name, r.revenue, r.cost, r.expense, r.profit]), 'รายโครงการ')
  const tot = rows.reduce((s, r) => ({ revenue: s.revenue + r.revenue, cost: s.cost + r.cost, expense: s.expense + r.expense, profit: s.profit + r.profit }), { revenue: 0, cost: 0, expense: 0, profit: 0 })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{rows.length > 0 && <ExportButton onClick={doExport} label="ส่งออก Excel" />}</div>
      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#F7F9FB' }}>
            <th style={{ ...th, paddingLeft: 18 }}>บ้าน / โครงการ</th>
            <th style={{ ...th, textAlign: 'right' }}>รายได้</th><th style={{ ...th, textAlign: 'right' }}>ต้นทุน</th>
            <th style={{ ...th, textAlign: 'right' }}>ค่าใช้จ่าย</th><th style={{ ...th, textAlign: 'right', paddingRight: 18 }}>กำไร(ขาดทุน)</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีข้อมูล — กด “สร้างบัญชีจากข้อมูลเดิม” ด้านบน</td></tr>}
            {rows.map((r) => (
              <tr key={r.house_code || r.house_name} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                <td style={{ padding: '10px 18px', fontWeight: 500 }}>{r.house_name}</td>
                <td className="num" style={{ padding: '10px 12px', textAlign: 'right', color: '#2E7D55' }}>{baht(r.revenue)}</td>
                <td className="num" style={{ padding: '10px 12px', textAlign: 'right', color: '#C0852C' }}>{baht(r.cost)}</td>
                <td className="num" style={{ padding: '10px 12px', textAlign: 'right', color: '#6B4E9E' }}>{baht(r.expense)}</td>
                <td className="num" style={{ padding: '10px 18px', textAlign: 'right', fontWeight: 700, color: r.profit >= 0 ? '#2E7D55' : '#C24036' }}>{baht(r.profit)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && <tfoot><tr style={{ borderTop: '2px solid #E1E5EA', background: '#F7F9FB', fontWeight: 700 }}>
            <td style={{ padding: '11px 18px' }}>รวมทุกโครงการ</td>
            <td className="num" style={{ padding: '11px 12px', textAlign: 'right' }}>{baht(tot.revenue)}</td>
            <td className="num" style={{ padding: '11px 12px', textAlign: 'right' }}>{baht(tot.cost)}</td>
            <td className="num" style={{ padding: '11px 12px', textAlign: 'right' }}>{baht(tot.expense)}</td>
            <td className="num" style={{ padding: '11px 18px', textAlign: 'right', color: tot.profit >= 0 ? '#2E7D55' : '#C24036' }}>{baht(tot.profit)}</td>
          </tr></tfoot>}
        </table>
      </div>
    </div>
  )
}
