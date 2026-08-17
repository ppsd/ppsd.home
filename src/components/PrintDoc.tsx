import type { DocKind } from '../erpData'
import { company } from '../erpData'
import { PPSD_LOGO_FULL } from '../assets'
import type { ApiPayroll } from '../store'

interface PrintDocProps {
  kind: DocKind
  slip?: ApiPayroll
  onClose: () => void
}

const fmt2 = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const TITLES: Record<DocKind, string> = {
  slip: 'สลิปเงินเดือน',
}

function Header({ docTitle, docNo }: { docTitle: string; docNo: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, borderBottom: '2px solid #1E2E3B', paddingBottom: 14, marginBottom: 18 }}>
      <img src={PPSD_LOGO_FULL} alt="PPSD" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1C2730' }}>{company.name}</div>
        <div style={{ fontSize: 11, color: '#5C6770' }}>{company.nameEn}</div>
        <div style={{ fontSize: 11, color: '#5C6770', marginTop: 3, lineHeight: 1.5 }}>{company.address}</div>
        <div style={{ fontSize: 11, color: '#5C6770' }}>{company.taxId} · {company.phone}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2E3B' }}>{docTitle}</div>
        <div className="num" style={{ fontSize: 11.5, color: '#5C6770', marginTop: 3, fontFamily: 'monospace' }}>{docNo}</div>
      </div>
    </div>
  )
}

const lblTd: React.CSSProperties = { padding: '7px 10px', fontSize: 12, color: '#5C6770', border: '1px solid #E1E5EA' }
const valTd: React.CSSProperties = { padding: '7px 10px', fontSize: 12.5, color: '#1C2730', border: '1px solid #E1E5EA', fontWeight: 500 }

function SlipBody({ slip }: { slip?: ApiPayroll }) {
  const base = slip?.base ?? 0
  const ot = slip?.ot ?? 0
  const sso = slip?.sso ?? 0
  const tax = slip?.tax ?? 0
  const leave = slip?.leave_deduct ?? 0
  const retention = slip?.retention ?? 0
  const loan = slip?.student_loan ?? 0
  const advance = slip?.advance ?? 0
  const gross = base + ot
  const totalDeduct = sso + tax + leave + retention + loan + advance
  const net = gross - totalDeduct
  return (
    <>
      <Header docTitle="สลิปเงินเดือน" docNo={slip?.period ? 'งวด ' + slip.period : 'สลิปเงินเดือน'} />
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
        <tbody>
          <tr><td style={lblTd}>ชื่อพนักงาน</td><td style={valTd}>{slip?.name || '-'}</td><td style={lblTd}>รหัสพนักงาน</td><td style={valTd}>{slip?.code || '-'}</td></tr>
          <tr><td style={lblTd}>ตำแหน่ง</td><td style={valTd}>{slip?.role || '-'}</td><td style={lblTd}>ประเภทจ้าง</td><td style={valTd}>{slip?.pay_type || 'รายเดือน'}</td></tr>
        </tbody>
      </table>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2E7D55', marginBottom: 6 }}>รายได้</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={lblTd}>{slip?.pay_type === 'รายวัน' ? 'ค่าแรง' : 'เงินเดือน'}</td><td className="num" style={{ ...valTd, textAlign: 'right' }}>{fmt2(base)}</td></tr>
              <tr><td style={lblTd}>ค่าล่วงเวลา (OT)</td><td className="num" style={{ ...valTd, textAlign: 'right' }}>{fmt2(ot)}</td></tr>
              <tr><td style={{ ...lblTd, fontWeight: 700, color: '#1C2730' }}>รวมรายได้</td><td className="num" style={{ ...valTd, textAlign: 'right', fontWeight: 700 }}>{fmt2(gross)}</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#C24036', marginBottom: 6 }}>รายการหัก</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={lblTd}>ประกันสังคม (5%)</td><td className="num" style={{ ...valTd, textAlign: 'right' }}>{fmt2(sso)}</td></tr>
              <tr><td style={lblTd}>ภาษีหัก ณ ที่จ่าย</td><td className="num" style={{ ...valTd, textAlign: 'right' }}>{fmt2(tax)}</td></tr>
              <tr><td style={lblTd}>หักลา/ขาดงาน</td><td className="num" style={{ ...valTd, textAlign: 'right' }}>{fmt2(leave)}</td></tr>
              {retention > 0 && <tr><td style={lblTd}>หัก Retention</td><td className="num" style={{ ...valTd, textAlign: 'right' }}>{fmt2(retention)}</td></tr>}
              {loan > 0 && <tr><td style={lblTd}>หัก กยศ</td><td className="num" style={{ ...valTd, textAlign: 'right' }}>{fmt2(loan)}</td></tr>}
              {advance > 0 && <tr><td style={lblTd}>หักเบิกล่วงหน้า</td><td className="num" style={{ ...valTd, textAlign: 'right' }}>{fmt2(advance)}</td></tr>}
              <tr><td style={{ ...lblTd, fontWeight: 700, color: '#1C2730' }}>รวมรายการหัก</td><td className="num" style={{ ...valTd, textAlign: 'right', fontWeight: 700 }}>{fmt2(totalDeduct)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ background: '#F7F9FB', border: '1px solid #E1E5EA', borderRadius: 8, padding: '12px 20px', minWidth: 260, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1C2730' }}>เงินได้สุทธิ</span>
          <span className="num" style={{ fontSize: 20, fontWeight: 700, color: '#2E7D55' }}>฿{fmt2(net)}</span>
        </div>
      </div>
      <SignRow left="ผู้รับเงิน" right="ผู้จ่ายเงิน / ฝ่ายบัญชี" />
    </>
  )
}


function SignRow({ left, right }: { left: string; right: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48, gap: 40 }}>
      {[left, right].map((l, i) => (
        <div key={i} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ borderTop: '1px dotted #94A0A8', marginBottom: 7 }} />
          <div style={{ fontSize: 12, color: '#5C6770' }}>({l})</div>
          <div style={{ fontSize: 11, color: '#94A0A8', marginTop: 3 }}>วันที่ ........./........./.........</div>
        </div>
      ))}
    </div>
  )
}

export default function PrintDoc({ kind, slip, onClose }: PrintDocProps) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }} className="printdoc-backdrop">
      {/* toolbar (hidden on print) */}
      <div className="no-print" style={{ maxWidth: 780, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{TITLES[kind]}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>

      {/* A4-ish sheet */}
      <div className="print-area" style={{ maxWidth: 780, margin: '0 auto', background: '#fff', borderRadius: 6, padding: '34px 38px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        {kind === 'slip' && <SlipBody slip={slip} />}
      </div>
    </div>
  )
}
