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
  { id: 'aging', label: 'ลูกหนี้/เจ้าหนี้' },
  { id: 'reconcile', label: 'กระทบยอดธนาคาร' },
  { id: 'petty', label: 'เงินสดย่อย' },
  { id: 'trial', label: 'งบทดลอง' },
  { id: 'journal', label: 'สมุดรายวัน' },
  { id: 'gl', label: 'แยกประเภท' },
  { id: 'coa', label: 'ผังบัญชี' },
  { id: 'assets', label: 'สินทรัพย์/ค่าเสื่อม' },
  { id: 'tax', label: 'สรุปภาษี' },
  { id: 'closing', label: 'ปิดบัญชี/ยอดยกมา' },
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
    try { const r = await api.post<{ count: number; errors?: string[] }>('/accounting/rebuild', {}); setMsg(`สร้างรายการบัญชีจากข้อมูลเดิมแล้ว ${r.count} รายการ${r.errors?.length ? ` · ข้าม ${r.errors.length} รายการ (${r.errors[0]})` : ''} — ไปดูได้ที่ทุกแท็บ`) }
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
      {tab === 'aging' && <AgingReport />}
      {tab === 'reconcile' && <Reconcile />}
      {tab === 'petty' && <PettyCash />}
      {tab === 'trial' && <TrialBalance />}
      {tab === 'journal' && <Journal accounts={accounts} />}
      {tab === 'gl' && <GeneralLedger accounts={accounts} />}
      {tab === 'coa' && <ChartOfAccounts accounts={accounts} reload={loadAccounts} />}
      {tab === 'assets' && <Assets />}
      {tab === 'tax' && <TaxSummary />}
      {tab === 'closing' && <Closing accounts={accounts} />}
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
    @page{size:A4;margin:14mm}</style></head><body>
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

// ---------- ลูกหนี้/เจ้าหนี้คงค้าง + อายุหนี้ (AR/AP Aging) ----------
interface AgingItem { id: number; house_name: string; party: string; no: number; detail: string; due: string; due_iso?: string; outstanding: number; bucket: string; overdue: boolean }
interface Aging { items: AgingItem[]; totals: Record<string, number>; total: number }
const BUCKETS: { k: string; label: string; color: string }[] = [
  { k: 'current', label: 'ยังไม่ถึงกำหนด', color: '#2E7D55' },
  { k: 'd30', label: 'เกิน 1–30 วัน', color: '#B7791F' },
  { k: 'd60', label: 'เกิน 31–60 วัน', color: '#C0852C' },
  { k: 'd90', label: 'เกิน 61–90 วัน', color: '#C24036' },
  { k: 'd90plus', label: 'เกิน 90 วัน', color: '#8A2A20' },
  { k: 'nodue', label: 'ไม่ระบุกำหนด', color: '#94A0A8' },
]
function AgingReport() {
  const [ar, setAr] = useState<Aging | null>(null)
  const [ap, setAp] = useState<Aging | null>(null)
  useEffect(() => {
    api.get<Aging>('/ar-aging').then(setAr).catch(() => setAr(null))
    api.get<Aging>('/ap-aging').then(setAp).catch(() => setAp(null))
  }, [])
  const block = (title: string, data: Aging | null, accent: string, partyLabel: string) => (
    <div style={{ ...card, padding: 0 }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid #EEF1F4', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: accent }}>{title}</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#5C6770' }}>รวมค้าง <b className="num" style={{ color: accent }}>{baht(data?.total || 0)}</b></span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 1, background: '#EEF1F4' }}>
        {BUCKETS.map((b) => (
          <div key={b.k} style={{ background: '#fff', padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: b.color, fontWeight: 600 }}>{b.label}</div>
            <div className="num" style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{baht(data?.totals?.[b.k] || 0)}</div>
          </div>
        ))}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead><tr style={{ background: '#F7F9FB' }}>
          <th style={{ ...th, paddingLeft: 18 }}>{partyLabel}</th><th style={th}>งวด/รายละเอียด</th><th style={th}>ครบกำหนด</th><th style={{ ...th, textAlign: 'right', paddingRight: 18 }}>ค้างชำระ</th>
        </tr></thead>
        <tbody>
          {(!data || data.items.length === 0) && <tr><td colSpan={4} style={{ padding: 26, textAlign: 'center', color: '#94A0A8' }}>ไม่มียอดค้าง</td></tr>}
          {data?.items.map((r) => (
            <tr key={r.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
              <td style={{ padding: '8px 18px' }}>{r.house_name}{r.party ? <div style={{ fontSize: 10.5, color: '#94A0A8' }}>{r.party}</div> : null}</td>
              <td style={{ padding: '8px 12px', color: '#5C6770' }}>งวด {r.no} {r.detail}</td>
              <td style={{ padding: '8px 12px', color: r.overdue ? '#C24036' : '#5C6770' }}>{r.due_iso || r.due || '—'}{r.overdue ? ' ⚠' : ''}</td>
              <td className="num" style={{ padding: '8px 18px', textAlign: 'right', fontWeight: 600 }}>{baht(r.outstanding)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 11.5, color: '#94A0A8' }}>อายุหนี้คำนวณจากวันครบกำหนดของงวดงาน — งวดที่ยังไม่ได้ตั้งวันครบกำหนดจะอยู่กลุ่ม “ไม่ระบุกำหนด” (ตั้งวันได้ที่งวดงานในแต่ละบ้าน)</div>
      {block('ลูกหนี้การค้า (ค้างรับจากลูกค้า)', ar, '#2E7D55', 'ลูกค้า / บ้าน')}
      {block('เจ้าหนี้ (ค้างจ่ายช่าง/ผู้รับเหมา)', ap, '#C0852C', 'ช่าง / บ้าน')}
    </div>
  )
}

// ---------- กระทบยอดธนาคาร (Bank Reconciliation) ----------
interface RecAccount { code: string; name: string; type: string }
interface RecLine { id: number; no: string; date: string; date_iso: string; memo: string; debit: number; credit: number; reconciled: number }
interface RecData { account: RecAccount | null; rows: RecLine[]; bookBalance: number; clearedBalance: number; unclearedCount: number }
function Reconcile() {
  const [cashAccts, setCashAccts] = useState<RecAccount[]>([])
  const [account, setAccount] = useState('')
  const [data, setData] = useState<RecData | null>(null)
  const [stmt, setStmt] = useState('')
  const [defaults, setDefaults] = useState<{ bank: string; cash: string }>({ bank: '', cash: '' })
  const [savedMsg, setSavedMsg] = useState('')
  const loadAccts = () => api.get<RecAccount[]>('/cash-accounts').then(setCashAccts).catch(() => setCashAccts([]))
  const loadDefaults = () => api.get<{ bank: string; cash: string }>('/acct-defaults').then(setDefaults).catch(() => {})
  useEffect(() => { loadAccts(); loadDefaults() }, [])
  const load = (code: string) => { if (!code) { setData(null); return } api.get<RecData>('/reconcile/' + code).then(setData).catch(() => setData(null)) }
  const toggle = async (line: RecLine) => { await api.post('/reconcile', { ids: [line.id], reconciled: !line.reconciled }); load(account) }
  const saveDefaults = async () => { await api.post('/acct-defaults', defaults); setSavedMsg('บันทึกค่าตั้งต้นแล้ว'); setTimeout(() => setSavedMsg(''), 2500) }
  const diff = data ? (Number(String(stmt).replace(/,/g, '')) || 0) - data.clearedBalance : 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ตั้งค่าบัญชีเงินตั้งต้น (หลายบัญชี/เงินสดย่อย) */}
      <div style={{ ...card, padding: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#30506A', width: '100%' }}>บัญชีเงินตั้งต้น (ใช้ลงบัญชีอัตโนมัติ — รองรับหลายบัญชีธนาคาร/เงินสดย่อย)</div>
        <div><div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>บัญชีรับ-จ่ายเงินโอน/ธนาคาร</div>
          <select style={field} value={defaults.bank} onChange={(e) => setDefaults({ ...defaults, bank: e.target.value })}>{cashAccts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}</select></div>
        <div><div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>บัญชีจ่ายเงินสด (รายจ่าย)</div>
          <select style={field} value={defaults.cash} onChange={(e) => setDefaults({ ...defaults, cash: e.target.value })}>{cashAccts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}</select></div>
        <button onClick={saveDefaults} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>บันทึก</button>
        {savedMsg && <span style={{ fontSize: 12, color: '#2E7D55' }}>{savedMsg}</span>}
        <span style={{ fontSize: 11, color: '#94A0A8', width: '100%' }}>เพิ่มบัญชีธนาคาร/เงินสดย่อยได้ที่แท็บ “ผังบัญชี” (รหัส 10xx ประเภทสินทรัพย์) แล้วมาเลือกที่นี่</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: '#5C6770' }}>กระทบยอดบัญชี:</span>
        <select style={{ ...field, minWidth: 240 }} value={account} onChange={(e) => { setAccount(e.target.value); load(e.target.value) }}>
          <option value="">— เลือกบัญชีเงินสด/ธนาคาร —</option>
          {cashAccts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
        </select>
        {data && <>
          <span style={{ fontSize: 12.5, color: '#5C6770', marginLeft: 8 }}>ยอดคงเหลือตามยอด statement:</span>
          <input style={{ ...field, width: 150, textAlign: 'right' }} value={stmt} onChange={(e) => setStmt(e.target.value)} placeholder="0.00" />
        </>}
      </div>

      {data && data.account && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
            {[['ยอดตามบัญชี (Book)', data.bookBalance, '#30506A'], ['ยอดที่กระทบแล้ว (Cleared)', data.clearedBalance, '#2E7D55'], ['ผลต่างกับ statement', diff, Math.abs(diff) < 0.5 ? '#2E7D55' : '#C24036']].map(([l, v, c], i) => (
              <div key={i} style={{ ...card, padding: 14 }}>
                <div style={{ fontSize: 12, color: '#5C6770' }}>{l as string}</div>
                <div className="num" style={{ fontSize: 20, fontWeight: 700, color: c as string, marginTop: 3 }}>{baht(v as number)}</div>
                {i === 2 && <div style={{ fontSize: 10.5, color: Math.abs(diff) < 0.5 ? '#2E7D55' : '#C24036', marginTop: 2 }}>{Math.abs(diff) < 0.5 ? '✓ ตรงกับ statement' : `ยังไม่ตรง (${data.unclearedCount} รายการยังไม่กระทบ)`}</div>}
              </div>
            ))}
          </div>
          <div style={card}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#F7F9FB' }}>
                <th style={{ ...th, paddingLeft: 18, textAlign: 'center', width: 60 }}>เคลียร์</th><th style={th}>เลขที่/วันที่</th><th style={th}>คำอธิบาย</th>
                <th style={{ ...th, textAlign: 'right' }}>เงินเข้า</th><th style={{ ...th, textAlign: 'right', paddingRight: 18 }}>เงินออก</th>
              </tr></thead>
              <tbody>
                {data.rows.length === 0 && <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', color: '#94A0A8' }}>ไม่มีความเคลื่อนไหว</td></tr>}
                {data.rows.map((r) => (
                  <tr key={r.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6', background: r.reconciled ? '#F3FAF6' : undefined }}>
                    <td style={{ padding: '8px 18px', textAlign: 'center' }}><input type="checkbox" checked={!!r.reconciled} onChange={() => toggle(r)} /></td>
                    <td style={{ padding: '8px 12px' }}><span className="num" style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.no}</span><div style={{ fontSize: 10.5, color: '#94A0A8' }}>{r.date}</div></td>
                    <td style={{ padding: '8px 12px', color: '#5C6770' }}>{r.memo}</td>
                    <td className="num" style={{ padding: '8px 12px', textAlign: 'right', color: r.debit ? '#2E7D55' : '#CBD3DA' }}>{r.debit ? baht(r.debit) : '-'}</td>
                    <td className="num" style={{ padding: '8px 18px', textAlign: 'right', color: r.credit ? '#C24036' : '#CBD3DA' }}>{r.credit ? baht(r.credit) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ---------- สินทรัพย์ถาวร + ค่าเสื่อมราคา ----------
interface Asset { id: number; code: string; name: string; category: string; acquire_date: string; cost: number; salvage: number; life_years: number; house_code: string; disposed: number; dispose_date?: string; base: number; accumulated: number; bookValue: number; monthly: number }
function Assets() {
  const [rows, setRows] = useState<Asset[]>([])
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const blank = { name: '', category: 'อุปกรณ์', acquire_date: today, cost: '', salvage: '', life_years: '5' }
  const [f, setF] = useState(blank)
  const load = () => api.get<Asset[]>('/assets').then(setRows).catch(() => setRows([]))
  useEffect(() => { load() }, [])
  const add = async () => {
    try { await api.post('/assets', { ...f, cost: Number(f.cost) || 0, salvage: Number(f.salvage) || 0, life_years: Number(f.life_years) || 5 }); setF(blank); setAdding(false); load() }
    catch (e) { setMsg((e as Error).message) }
  }
  const runDep = async () => { const r = await api.post<{ assets: number; totalDepreciation: number }>('/assets/run-depreciation', {}); setMsg(`ลงค่าเสื่อมราคา ${r.assets} รายการ รวม ${baht(r.totalDepreciation)} เข้าบัญชีแล้ว (Dr ค่าเสื่อม / Cr ค่าเสื่อมสะสม)`); load() }
  const dispose = async (a: Asset) => { if (confirm(`จำหน่าย/ตัดจำหน่ายสินทรัพย์ "${a.name}"?`)) { await api.post('/assets/' + a.id + '/dispose', {}); load() } }
  const totCost = rows.reduce((s, r) => s + r.cost, 0), totAcc = rows.reduce((s, r) => s + r.accumulated, 0), totBook = rows.reduce((s, r) => s + r.bookValue, 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 13, color: '#5C6770' }}>สินทรัพย์ถาวร <b className="num" style={{ color: '#1C2730' }}>{rows.length}</b> รายการ (เส้นตรง)</div>
        <button onClick={runDep} className="hov-f3f5f7" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#C0852C', background: '#fff', border: '1px solid #EAD9B6', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>↻ ลงค่าเสื่อมราคา ณ วันนี้</button>
        <button onClick={() => setAdding((v) => !v)} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>+ เพิ่มสินทรัพย์</button>
      </div>
      {msg && <div style={{ fontSize: 12.5, color: '#2E7D55', background: '#E2F1EA', border: '1px solid #CDE3D6', borderRadius: 9, padding: '9px 13px' }}>{msg}</div>}
      {adding && (
        <div style={{ ...card, padding: 16, display: 'grid', gridTemplateColumns: '1.6fr 1fr 130px 120px 100px 90px auto', gap: 10, alignItems: 'end' }}>
          <div><div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>ชื่อสินทรัพย์</div><input style={{ ...field, width: '100%' }} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>หมวด</div><input style={{ ...field, width: '100%' }} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></div>
          <div><div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>วันได้มา</div><input type="date" style={{ ...field, width: '100%' }} value={f.acquire_date} onChange={(e) => setF({ ...f, acquire_date: e.target.value })} /></div>
          <div><div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>ราคาทุน</div><input type="number" style={{ ...field, width: '100%', textAlign: 'right' }} value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></div>
          <div><div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>ซาก</div><input type="number" style={{ ...field, width: '100%', textAlign: 'right' }} value={f.salvage} onChange={(e) => setF({ ...f, salvage: e.target.value })} /></div>
          <div><div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>อายุ(ปี)</div><input type="number" style={{ ...field, width: '100%', textAlign: 'right' }} value={f.life_years} onChange={(e) => setF({ ...f, life_years: e.target.value })} /></div>
          <button onClick={add} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>บันทึก</button>
        </div>
      )}
      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#F7F9FB' }}>
            <th style={{ ...th, paddingLeft: 18 }}>สินทรัพย์</th><th style={th}>ได้มา</th>
            <th style={{ ...th, textAlign: 'right' }}>ราคาทุน</th><th style={{ ...th, textAlign: 'right' }}>ค่าเสื่อม/เดือน</th>
            <th style={{ ...th, textAlign: 'right' }}>ค่าเสื่อมสะสม</th><th style={{ ...th, textAlign: 'right' }}>มูลค่าคงเหลือ</th><th style={{ ...th, textAlign: 'center', paddingRight: 18 }}>จัดการ</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีสินทรัพย์ — กด “เพิ่มสินทรัพย์”</td></tr>}
            {rows.map((a) => (
              <tr key={a.id} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6', opacity: a.disposed ? 0.5 : 1 }}>
                <td style={{ padding: '9px 18px' }}><div style={{ fontWeight: 500 }}>{a.name}{a.disposed ? ' (จำหน่ายแล้ว)' : ''}</div><div style={{ fontSize: 10.5, color: '#94A0A8' }}>{a.category}{a.life_years ? ` · ${a.life_years} ปี` : ''}</div></td>
                <td className="num" style={{ padding: '9px 12px', color: '#5C6770' }}>{a.acquire_date}</td>
                <td className="num" style={{ padding: '9px 12px', textAlign: 'right' }}>{baht(a.cost)}</td>
                <td className="num" style={{ padding: '9px 12px', textAlign: 'right', color: '#5C6770' }}>{baht(a.monthly)}</td>
                <td className="num" style={{ padding: '9px 12px', textAlign: 'right', color: '#C0852C' }}>{baht(a.accumulated)}</td>
                <td className="num" style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600 }}>{baht(a.bookValue)}</td>
                <td style={{ padding: '9px 18px', textAlign: 'center' }}>{!a.disposed && <button onClick={() => dispose(a)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11, color: '#C24036', background: '#fff', border: '1px solid #E7CDC9', borderRadius: 7, padding: '3px 9px', cursor: 'pointer' }}>จำหน่าย</button>}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && <tfoot><tr style={{ borderTop: '2px solid #E1E5EA', background: '#F7F9FB', fontWeight: 700 }}>
            <td colSpan={2} style={{ padding: '11px 18px' }}>รวม</td>
            <td className="num" style={{ padding: '11px 12px', textAlign: 'right' }}>{baht(totCost)}</td><td />
            <td className="num" style={{ padding: '11px 12px', textAlign: 'right' }}>{baht(totAcc)}</td>
            <td className="num" style={{ padding: '11px 12px', textAlign: 'right' }}>{baht(totBook)}</td><td />
          </tr></tfoot>}
        </table>
      </div>
    </div>
  )
}

// ---------- สรุปภาษี (ภ.พ.30 / หัก ณ ที่จ่าย / ภ.ง.ด.50) ----------
interface TaxData { outputVat: number; inputVat: number; vatPayable: number; wht: number; whtByType: { type: string; gross: number; wht: number; n: number }[]; netProfit: number; corpTax: number }
function TaxSummary() {
  const [t, setT] = useState<TaxData | null>(null)
  useEffect(() => { api.get<TaxData>('/tax-summary').then(setT).catch(() => setT(null)) }, [])
  if (!t) return <div style={{ color: '#94A0A8', padding: 20 }}>ยังไม่มีข้อมูล</div>
  const line = (l: string, v: number, c = '#3C4750', bold = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontWeight: bold ? 700 : 500, fontSize: bold ? 15 : 13, color: c }}><span>{l}</span><span className="num">{baht(v)}</span></div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 11.5, color: '#94A0A8' }}>สรุปเพื่อการบริหาร/เตรียมยื่น — ยอดภาษีจริงและการยื่นทำผ่านเมนู “ส่งออกบัญชี” และสำนักงานบัญชี/ผู้สอบบัญชี</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14 }}>
        <div style={{ ...card, padding: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#30506A' }}>ภ.พ.30 — ภาษีมูลค่าเพิ่ม</div>
          <div style={{ fontSize: 11.5, color: '#94A0A8', marginBottom: 8 }}>VAT Return</div>
          {line('ภาษีขาย (Output VAT)', t.outputVat, '#2E7D55')}
          {line('ภาษีซื้อ (Input VAT)', t.inputVat, '#C0852C')}
          <div style={{ borderTop: '1px solid #E1E5EA', marginTop: 6, paddingTop: 6 }}>{line(t.vatPayable >= 0 ? 'ภาษีที่ต้องชำระ' : 'ภาษีขอคืน', Math.abs(t.vatPayable), t.vatPayable >= 0 ? '#C24036' : '#2E7D55', true)}</div>
        </div>
        <div style={{ ...card, padding: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#6B4E9E' }}>ภาษีหัก ณ ที่จ่าย</div>
          <div style={{ fontSize: 11.5, color: '#94A0A8', marginBottom: 8 }}>ภ.ง.ด.1 / 3 / 53</div>
          {t.whtByType.length ? t.whtByType.map((w, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12.5, color: '#5C6770' }}><span>{w.type || 'อื่นๆ'} ({w.n})</span><span className="num">{baht(w.wht)}</span></div>
          )) : <div style={{ fontSize: 12, color: '#94A0A8' }}>ยังไม่มีรายการ</div>}
          <div style={{ borderTop: '1px solid #E1E5EA', marginTop: 6, paddingTop: 6 }}>{line('รวมภาษีหัก ณ ที่จ่าย', t.wht, '#6B4E9E', true)}</div>
        </div>
        <div style={{ ...card, padding: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#C0852C' }}>ภ.ง.ด.50 — ภาษีเงินได้นิติบุคคล</div>
          <div style={{ fontSize: 11.5, color: '#94A0A8', marginBottom: 8 }}>ประมาณการ (อัตรา SME)</div>
          {line('กำไรสุทธิทางบัญชี', t.netProfit)}
          {line('ประมาณการภาษี', t.corpTax, '#C24036', true)}
          <div style={{ fontSize: 10.5, color: '#94A0A8', marginTop: 8 }}>SME: กำไร ≤ 3 แสน ยกเว้น · 3 แสน–3 ล้าน 15% · เกิน 3 ล้าน 20% (ยังไม่รวมรายการปรับปรุงทางภาษี)</div>
        </div>
      </div>
    </div>
  )
}

// ---------- ปิดบัญชี / ยอดยกมา ----------
function Closing({ accounts }: { accounts: Account[] }) {
  const [closedThrough, setClosedThrough] = useState('')
  const [lockDate, setLockDate] = useState('')
  const [fyEnd, setFyEnd] = useState('')
  const [msg, setMsg] = useState('')
  const [openDate, setOpenDate] = useState('')
  const [openLines, setOpenLines] = useState<{ account: string; amount: string }[]>([{ account: '', amount: '' }, { account: '', amount: '' }])
  const load = () => api.get<{ closedThrough: string }>('/closing').then((r) => setClosedThrough(r.closedThrough)).catch(() => {})
  useEffect(() => { load() }, [])
  const lock = async () => { const r = await api.post<{ closedThrough: string }>('/closing/lock', { date: lockDate }); setClosedThrough(r.closedThrough); setMsg(lockDate ? `ปิดงวดบัญชีถึง ${lockDate} แล้ว — ลงรายการก่อนวันนี้ไม่ได้` : 'ยกเลิกการปิดงวดแล้ว') }
  const unlock = async () => { await api.post('/closing/lock', { date: '' }); setClosedThrough(''); setMsg('ยกเลิกการปิดงวดแล้ว') }
  const closeYear = async () => { if (!fyEnd) { setMsg('เลือกวันสิ้นปีบัญชีก่อน'); return } if (!confirm(`ปิดบัญชีสิ้นปี ณ ${fyEnd}? ระบบจะปิดรายได้/ค่าใช้จ่ายเข้ากำไรสะสม`)) return; try { await api.post('/closing/year-end', { date: fyEnd }); setMsg('ปิดบัญชีสิ้นปีแล้ว — กำไรสุทธิถูกโอนเข้ากำไรสะสม') } catch (e) { setMsg('ผิดพลาด: ' + (e as Error).message) } }
  const postOpening = async () => {
    const balances = openLines.filter((l) => l.account && Number(l.amount)).map((l) => ({ account: l.account, amount: Number(l.amount) }))
    if (!balances.length) { setMsg('ใส่ยอดยกมาก่อน'); return }
    try { await api.post('/closing/opening', { date: openDate || undefined, balances }); setMsg('บันทึกยอดยกมาแล้ว (ผลต่างเข้ากำไรสะสมอัตโนมัติ)'); setOpenLines([{ account: '', amount: '' }, { account: '', amount: '' }]) }
    catch (e) { setMsg('ผิดพลาด: ' + (e as Error).message) }
  }
  const setL = (i: number, patch: Partial<{ account: string; amount: string }>) => setOpenLines((ls) => ls.map((l, j) => j === i ? { ...l, ...patch } : l))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {msg && <div style={{ fontSize: 12.5, color: msg.startsWith('ผิดพลาด') ? '#C24036' : '#2E7D55', background: msg.startsWith('ผิดพลาด') ? '#FBEEEC' : '#E2F1EA', border: '1px solid ' + (msg.startsWith('ผิดพลาด') ? '#E7CDC9' : '#CDE3D6'), borderRadius: 9, padding: '9px 13px' }}>{msg}</div>}

      {/* ยอดยกมา */}
      <div style={{ ...card, padding: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2E3B' }}>ยอดยกมา (Opening Balances)</div>
        <div style={{ fontSize: 11.5, color: '#94A0A8', marginBottom: 10 }}>สำหรับย้ายข้อมูลจากระบบเดิม/Express — ใส่ยอดคงเหลือแต่ละบัญชี ระบบจะลงผลต่างเข้ากำไรสะสมให้สมดุลอัตโนมัติ</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><span style={{ fontSize: 12.5, color: '#5C6770' }}>ณ วันที่:</span><input type="date" style={field} value={openDate} onChange={(e) => setOpenDate(e.target.value)} /></div>
        {openLines.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 30px', gap: 8, marginBottom: 6 }}>
            <select style={field} value={l.account} onChange={(e) => setL(i, { account: e.target.value })}><option value="">— เลือกบัญชี —</option>{accounts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}</select>
            <input type="number" style={{ ...field, textAlign: 'right' }} value={l.amount} onChange={(e) => setL(i, { amount: e.target.value })} placeholder="ยอดคงเหลือ" />
            <button onClick={() => setOpenLines((ls) => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)} style={{ border: 'none', background: 'none', color: '#C24036', cursor: 'pointer' }}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={() => setOpenLines((ls) => [...ls, { account: '', amount: '' }])} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#30506A', background: '#fff', border: '1px dashed #B9C6D0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>+ เพิ่มบัญชี</button>
          <button onClick={postOpening} className="btn-primary" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '8px 16px', cursor: 'pointer' }}>บันทึกยอดยกมา</button>
        </div>
      </div>

      {/* ปิดงวด (lock) */}
      <div style={{ ...card, padding: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2E3B' }}>ปิดงวดบัญชี (ล็อกไม่ให้แก้ย้อนหลัง)</div>
        <div style={{ fontSize: 12.5, color: '#5C6770', margin: '6px 0 10px' }}>สถานะปัจจุบัน: {closedThrough ? <b style={{ color: '#C24036' }}>ปิดถึง {closedThrough}</b> : <span style={{ color: '#2E7D55' }}>ยังไม่ปิดงวด</span>}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: '#5C6770' }}>ปิดถึงวันที่:</span>
          <input type="date" style={field} value={lockDate} onChange={(e) => setLockDate(e.target.value)} />
          <button onClick={lock} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#C24036', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>ปิดงวด</button>
          {closedThrough && <button onClick={unlock} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>ยกเลิกการปิด</button>}
        </div>
      </div>

      {/* ปิดปี */}
      <div style={{ ...card, padding: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2E3B' }}>ปิดบัญชีสิ้นปี (Year-end Closing)</div>
        <div style={{ fontSize: 11.5, color: '#94A0A8', margin: '6px 0 10px' }}>ปิดยอดรายได้/ต้นทุน/ค่าใช้จ่ายเข้ากำไรสะสม (3020) — ทำหลังตรวจงบเรียบร้อยแล้ว</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12.5, color: '#5C6770' }}>วันสิ้นปีบัญชี:</span>
          <input type="date" style={field} value={fyEnd} onChange={(e) => setFyEnd(e.target.value)} />
          <button onClick={closeYear} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>ปิดบัญชีสิ้นปี</button>
        </div>
      </div>
    </div>
  )
}

// ---------- เงินสดย่อย (Petty Cash — imprest) ----------
interface PettyRow { no: string; date: string; memo: string; debit: number; credit: number; balance: number }
interface PettyState { float: number; balance: number; toReplenish: number; rows: PettyRow[]; added?: number }
interface PettyStmtRow { date: string; date_iso: string; ref: string; memo: string; in: number; out: number; balance: number; seq: string }
interface PettyStatement { float: number; from: string; to: string; opening: number; rows: PettyStmtRow[]; totalOut: number; totalIn: number; closing: number; toReplenish: number }
const PETTY_CATS = ['ค่าน้ำมัน/ขนส่ง', 'ของใช้สำนักงาน', 'ค่ารับรอง', 'ค่าบริการ', 'ค่าดำเนินการ', 'อื่นๆ']
function PettyCash() {
  const [st, setSt] = useState<PettyState | null>(null)
  const [msg, setMsg] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = today.slice(0, 8) + '01'
  const [f, setF] = useState({ date_iso: today, cat: 'ค่าน้ำมัน/ขนส่ง', item: '', amount: '', ref: '' })
  const [floatEdit, setFloatEdit] = useState('')
  const [range, setRange] = useState({ from: firstOfMonth, to: today })
  const [stmt, setStmt] = useState<PettyStatement | null>(null)
  const load = () => api.get<PettyState>('/petty-cash').then((s) => { setSt(s); setFloatEdit(String(s.float)) }).catch(() => setSt(null))
  useEffect(() => { load() }, [])
  const printStatement = async () => {
    const q = new URLSearchParams(); if (range.from) q.set('from', range.from); if (range.to) q.set('to', range.to)
    const s = await api.get<PettyStatement>('/petty-cash/statement?' + q.toString()); setStmt(s)
  }
  const spend = async () => {
    if (!f.amount) { setMsg('ใส่จำนวนเงิน'); return }
    try { await api.post('/petty-cash/expense', f); setF({ ...f, item: '', amount: '', ref: '' }); setMsg('บันทึกจ่ายเงินสดย่อยแล้ว'); load() }
    catch (e) { setMsg('ผิดพลาด: ' + (e as Error).message) }
  }
  const topup = async () => {
    try { const r = await api.post<PettyState>('/petty-cash/topup', {}); setMsg(`เติมเงินสดย่อย ${baht(r.added || 0)} จากธนาคาร → เต็มวงเงินแล้ว`); load() }
    catch (e) { setMsg((e as Error).message) }
  }
  const saveFloat = async () => { await api.post('/petty-cash/float', { float: Number(floatEdit) || 0 }); setMsg('ตั้งวงเงินแล้ว'); load() }
  if (!st) return <div style={{ color: '#94A0A8', padding: 20 }}>กำลังโหลด…</div>
  const pct = st.float > 0 ? Math.max(0, Math.min(100, Math.round((st.balance / st.float) * 100))) : 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 11.5, color: '#94A0A8' }}>เงินสดย่อยเป็น “ส่วนกลางบริษัท” (ไม่ผูกบ้าน) — จ่ายค่าใช้จ่ายเล็กๆ น้อยๆ แล้วเติมกลับให้เต็มวงเงินทุกอาทิตย์</div>
      {msg && <div style={{ fontSize: 12.5, color: msg.startsWith('ผิดพลาด') || msg.includes('เต็มวงเงินอยู่แล้ว') ? '#C24036' : '#2E7D55', background: msg.startsWith('ผิดพลาด') || msg.includes('เต็มวงเงินอยู่แล้ว') ? '#FBEEEC' : '#E2F1EA', border: '1px solid #CDE3D6', borderRadius: 9, padding: '9px 13px' }}>{msg}</div>}

      {/* สรุปยอด + ปุ่มเติม */}
      <div style={{ ...card, padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 16, alignItems: 'center' }}>
        <div><div style={{ fontSize: 12, color: '#5C6770' }}>เงินสดย่อยคงเหลือ</div><div className="num" style={{ fontSize: 26, fontWeight: 700, color: st.balance < st.float * 0.3 ? '#C24036' : '#1E2E3B' }}>{baht(st.balance)}</div>
          <div style={{ height: 8, background: '#EEF1F4', borderRadius: 20, overflow: 'hidden', marginTop: 6 }}><div style={{ height: '100%', width: pct + '%', background: pct < 30 ? '#C24036' : '#2E7D55', borderRadius: 20 }} /></div></div>
        <div><div style={{ fontSize: 12, color: '#5C6770' }}>วงเงิน (Float)</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}><input value={floatEdit} onChange={(e) => setFloatEdit(e.target.value)} style={{ ...field, width: 100, textAlign: 'right' }} /><button onClick={saveFloat} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '7px 10px', cursor: 'pointer' }}>ตั้ง</button></div></div>
        <div><div style={{ fontSize: 12, color: '#5C6770' }}>ต้องเติมให้เต็ม</div><div className="num" style={{ fontSize: 22, fontWeight: 700, color: '#C0852C' }}>{baht(st.toReplenish)}</div></div>
        <div style={{ textAlign: 'right' }}><button onClick={topup} disabled={st.toReplenish <= 0} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: st.toReplenish > 0 ? '#2E7D55' : '#C4CCD3', border: 'none', borderRadius: 9, padding: '11px 18px', cursor: st.toReplenish > 0 ? 'pointer' : 'not-allowed' }}>↑ เติมให้เต็มวงเงิน</button><div style={{ fontSize: 10.5, color: '#94A0A8', marginTop: 4 }}>ตัดจากธนาคารเข้าเงินสดย่อย</div></div>
      </div>

      {/* บันทึกจ่ายเงินสดย่อย */}
      <div style={{ ...card, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>บันทึกจ่ายเงินสดย่อย (ส่วนกลาง)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 90px 1fr 1.3fr 110px auto', gap: 10, alignItems: 'end' }}>
          <div><div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>วันที่</div><input type="date" style={{ ...field, width: '100%' }} value={f.date_iso} onChange={(e) => setF({ ...f, date_iso: e.target.value })} /></div>
          <div><div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>เลขที่เอกสาร</div><input style={{ ...field, width: '100%' }} value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} placeholder="บิล/ใบเสร็จ" /></div>
          <div><div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>หมวด</div><select style={{ ...field, width: '100%' }} value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>{PETTY_CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>รายการ</div><input style={{ ...field, width: '100%' }} value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} placeholder="เช่น ค่าน้ำมันรถ, กาแฟรับรอง" /></div>
          <div><div style={{ fontSize: 11.5, color: '#5C6770', marginBottom: 4 }}>จำนวนเงิน</div><input type="number" style={{ ...field, width: '100%', textAlign: 'right' }} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
          <button onClick={spend} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>บันทึกจ่าย</button>
        </div>
      </div>

      {/* พิมพ์ใบสรุปตามรอบ */}
      <div style={{ ...card, padding: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>ใบสรุปรายจ่ายเงินสดย่อย</span>
        <span style={{ fontSize: 12, color: '#5C6770' }}>รอบวันที่</span>
        <input type="date" style={field} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <span style={{ color: '#94A0A8' }}>–</span>
        <input type="date" style={field} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <button onClick={printStatement} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#C0852C', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>🖨 ออกใบสรุป</button>
      </div>

      {/* ประวัติ */}
      <div style={card}>
        <div style={{ padding: '11px 16px', borderBottom: '1px solid #EEF1F4', fontSize: 13, fontWeight: 600 }}>ความเคลื่อนไหวเงินสดย่อย</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ background: '#F7F9FB' }}>
            <th style={{ ...th, paddingLeft: 16 }}>เลขที่/วันที่</th><th style={th}>รายการ</th>
            <th style={{ ...th, textAlign: 'right' }}>เติมเข้า</th><th style={{ ...th, textAlign: 'right' }}>จ่ายออก</th><th style={{ ...th, textAlign: 'right', paddingRight: 16 }}>คงเหลือ</th>
          </tr></thead>
          <tbody>
            {st.rows.length === 0 && <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', color: '#94A0A8' }}>ยังไม่มีความเคลื่อนไหว — กด “เติมให้เต็มวงเงิน” เพื่อเริ่มตั้งเงินสดย่อย</td></tr>}
            {st.rows.map((r, i) => (
              <tr key={i} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                <td style={{ padding: '8px 16px' }}><span className="num" style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.no}</span><div style={{ fontSize: 10.5, color: '#94A0A8' }}>{r.date}</div></td>
                <td style={{ padding: '8px 12px', color: '#5C6770' }}>{r.memo}</td>
                <td className="num" style={{ padding: '8px 12px', textAlign: 'right', color: r.debit ? '#2E7D55' : '#CBD3DA' }}>{r.debit ? baht(r.debit) : '-'}</td>
                <td className="num" style={{ padding: '8px 12px', textAlign: 'right', color: r.credit ? '#C24036' : '#CBD3DA' }}>{r.credit ? baht(r.credit) : '-'}</td>
                <td className="num" style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 600 }}>{baht(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {stmt && <PettyStatementDoc s={stmt} onClose={() => setStmt(null)} />}
    </div>
  )
}

// ใบสรุปรายจ่ายเงินสดย่อย (พิมพ์) — ตามแบบเอกสารบริษัท
function PettyStatementDoc({ s, onClose }: { s: PettyStatement; onClose: () => void }) {
  const m = (n: number) => n ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
  const bd = '1px solid #333'
  const cell: React.CSSProperties = { border: bd, padding: '3px 7px', fontSize: 11.5 }
  const hd: React.CSSProperties = { ...cell, background: '#F2F2F2', fontWeight: 700, textAlign: 'center' }
  const thDate = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return Number.isNaN(d.getTime()) ? iso : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}` }
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 70, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 760, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>ใบสรุปรายจ่ายเงินสดย่อย</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>
      <div className="print-area" style={{ maxWidth: 760, margin: '0 auto', background: '#fff', color: '#1C2730', borderRadius: 4, padding: '26px 30px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        <div style={{ textAlign: 'center', lineHeight: 1.5 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{company.name}</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>ใบสรุป รายจ่ายเงินสดย่อย</div>
          <div style={{ fontSize: 12, color: '#333' }}>รอบวันที่ {s.from ? thDate(s.from) : '-'} – {s.to ? thDate(s.to) : '-'}</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
          <thead>
            <tr>
              <th style={{ ...hd, width: 66 }}>วันที่</th><th style={{ ...hd, width: 44 }}>ลำดับ</th><th style={{ ...hd, width: 78 }}>เลขที่เอกสาร</th>
              <th style={{ ...hd }}>รายการ</th><th style={{ ...hd, width: 80 }}>รายรับ</th><th style={{ ...hd, width: 80 }}>รายจ่าย</th><th style={{ ...hd, width: 82 }}>คงเหลือ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={cell} /><td style={cell} /><td style={cell} />
              <td style={{ ...cell, fontWeight: 600 }}>ยอดยกมา</td>
              <td style={{ ...cell, textAlign: 'right' }} className="num">{m(s.opening)}</td>
              <td style={cell} />
              <td style={{ ...cell, textAlign: 'right' }} className="num">{m(s.opening)}</td>
            </tr>
            {s.rows.map((r, i) => (
              <tr key={i}>
                <td style={{ ...cell, textAlign: 'center', whiteSpace: 'nowrap' }} className="num">{r.date_iso ? thDate(r.date_iso) : r.date}</td>
                <td style={{ ...cell, textAlign: 'center' }} className="num">{r.seq}</td>
                <td style={{ ...cell, textAlign: 'center' }} className="num">{r.ref}</td>
                <td style={cell}>{r.memo}</td>
                <td style={{ ...cell, textAlign: 'right' }} className="num">{r.in ? m(r.in) : ''}</td>
                <td style={{ ...cell, textAlign: 'right' }} className="num">{r.out ? m(r.out) : ''}</td>
                <td style={{ ...cell, textAlign: 'right' }} className="num">{m(r.balance)}</td>
              </tr>
            ))}
            {Array.from({ length: Math.max(0, 6 - s.rows.length) }).map((_, i) => (
              <tr key={'e' + i}><td style={{ ...cell, height: 18 }}>&nbsp;</td><td style={cell} /><td style={cell} /><td style={cell} /><td style={cell} /><td style={cell} /><td style={cell} /></tr>
            ))}
            <tr>
              <td style={{ ...hd, textAlign: 'right' }} colSpan={4}>รวมจำนวนเงินทั้งสิ้น</td>
              <td style={{ ...hd, textAlign: 'right' }} className="num">{m(s.totalIn)}</td>
              <td style={{ ...hd, textAlign: 'right' }} className="num">{m(s.totalOut)}</td>
              <td style={{ ...hd, textAlign: 'right' }} className="num">{m(s.closing)}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 11.5, color: '#C24036', marginTop: 10 }}>
          * เพื่อให้อยู่ในวงเงินสดย่อย {s.float.toLocaleString('en-US')} บาท<br />
          {s.toReplenish > 0
            ? <>ต้องเติมอีก <b>{s.toReplenish.toLocaleString('en-US')}</b> บาท ({s.float.toLocaleString('en-US')} − {s.closing.toLocaleString('en-US')} = {s.toReplenish.toLocaleString('en-US')})</>
            : <>เงินสดย่อยเต็มวงเงินแล้ว (คงเหลือ {s.closing.toLocaleString('en-US')} บาท)</>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 40, gap: 30, fontSize: 11.5 }}>
          {['ผู้จัดทำ', 'ผู้ตรวจสอบ', 'ผู้อนุมัติ'].map((l, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}><div style={{ borderTop: '1px dotted #666', marginBottom: 5 }} /><div>({l})</div><div style={{ fontSize: 10.5, color: '#94A0A8', marginTop: 2 }}>วันที่ ..../..../....</div></div>
          ))}
        </div>
      </div>
    </div>
  )
}
