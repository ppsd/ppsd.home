import { Fragment } from 'react'
import { company } from '../erpData'
import { PPSD_LOGO_FULL } from '../assets'
import { baht } from '../data'
import { boqTotals, type Boq } from './BoqTab'

const bd = '1px solid #C9D2DA'
const h: React.CSSProperties = { padding: '5px 7px', fontSize: 11, border: bd, background: '#F2F5F8', fontWeight: 600 }
const c: React.CSSProperties = { padding: '5px 7px', fontSize: 11, border: bd, verticalAlign: 'top' }

export default function BoqPrint({ boq, houseName, onClose }: { boq: Boq; houseName?: string; onClose: () => void }) {
  const t = boqTotals(boq)
  const cats = Array.from(new Set(boq.items.map((i) => i.cat)))
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 880, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{boq.no}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>

      <div className="print-area" style={{ maxWidth: 880, margin: '0 auto', background: '#fff', borderRadius: 6, padding: '28px 32px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, borderBottom: '2px solid #1E2E3B', paddingBottom: 12, marginBottom: 12 }}>
          <img src={PPSD_LOGO_FULL} alt="PPSD" style={{ width: 54, height: 54, borderRadius: 8, objectFit: 'cover' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{company.name}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2E3B' }}>รายการประมาณราคาก่อสร้าง (BILL OF QUANTITY)</div>
            <div style={{ fontSize: 11.5, color: '#5C6770' }}>{boq.title} · {houseName || boq.house_code}</div>
          </div>
          <div style={{ textAlign: 'right' }}><div className="num" style={{ fontSize: 12, color: '#5C6770', fontFamily: 'monospace' }}>{boq.no}</div><div style={{ fontSize: 11.5, color: '#5C6770' }}>{boq.date}</div></div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...h, textAlign: 'left' }}>รายการ</th><th style={{ ...h, width: 55, textAlign: 'right' }}>จำนวน</th><th style={{ ...h, width: 45 }}>หน่วย</th>
            <th style={{ ...h, width: 85, textAlign: 'right' }}>วัสดุ/หน่วย</th><th style={{ ...h, width: 90, textAlign: 'right' }}>ค่าวัสดุ</th>
            <th style={{ ...h, width: 85, textAlign: 'right' }}>ค่าแรง/หน่วย</th><th style={{ ...h, width: 90, textAlign: 'right' }}>ค่าแรง</th><th style={{ ...h, width: 100, textAlign: 'right' }}>รวม</th>
          </tr></thead>
          <tbody>
            {cats.map((cat) => (
              <Fragment key={cat}>
                <tr><td colSpan={8} style={{ ...c, background: '#EEF2F5', fontWeight: 700 }}>{cat}</td></tr>
                {boq.items.filter((it) => it.cat === cat).map((it, i) => (
                  <tr key={cat + i}>
                    <td style={c}>{it.desc}</td>
                    <td className="num" style={{ ...c, textAlign: 'right' }}>{it.qty ? it.qty.toLocaleString() : '-'}</td>
                    <td style={c}>{it.unit || '-'}</td>
                    <td className="num" style={{ ...c, textAlign: 'right' }}>{it.mat ? baht(it.mat) : '-'}</td>
                    <td className="num" style={{ ...c, textAlign: 'right' }}>{baht(it.qty * it.mat)}</td>
                    <td className="num" style={{ ...c, textAlign: 'right' }}>{it.lab ? baht(it.lab) : '-'}</td>
                    <td className="num" style={{ ...c, textAlign: 'right' }}>{baht(it.qty * it.lab)}</td>
                    <td className="num" style={{ ...c, textAlign: 'right', fontWeight: 600 }}>{baht(it.qty * (it.mat + it.lab))}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 320 }}>
            <tbody>
              {[['รวมค่าวัสดุ', t.mat], ['รวมค่าแรง', t.lab], ['รวมต้นทุนก่อสร้าง', t.subtotal], [`ค่าดำเนินการและกำไร ${boq.markup_pct}%`, t.markup], [`ภาษีมูลค่าเพิ่ม ${boq.vat_pct}%`, t.vat]].map(([l, v], i) => (
                <tr key={i}><td style={{ ...c, color: '#5C6770' }}>{l}</td><td className="num" style={{ ...c, textAlign: 'right' }}>{baht(v as number)}</td></tr>
              ))}
              <tr><td style={{ ...c, fontWeight: 700, background: '#F2F5F8' }}>รวมราคาก่อสร้างทั้งสิ้น</td><td className="num" style={{ ...c, textAlign: 'right', fontWeight: 700, fontSize: 13, background: '#F2F5F8' }}>{baht(t.grand)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
