import { Fragment } from 'react'
import { company } from '../../erpData'
import { PPSD_LOGO_FULL } from '../../assets'
import { baht } from '../../data'
import { BOQ_CATS, type BoqItem } from './BoqTab'
import { FLOOR_ALL, sortFloors } from './boqFloors'

// สรุปวัสดุ (A4 → พิมพ์/บันทึกเป็น PDF จากหน้าต่างพิมพ์ของเบราว์เซอร์)
//  1) ภาพรวม: มูลค่าแยกชั้น × ประเภทงาน
//  2) รวมทั้งงาน: วัสดุชนิดเดียวกันจากทุกชั้นรวมเป็นแถวเดียว แยกตามประเภทงาน
//  3) แยกชั้น → ประเภทงาน: ใช้วัสดุอะไร เท่าไหร่ คิดยังไง
// รายการค่าแรง (ชื่อขึ้นต้น "ค่าแรง:") อยู่ในตารางเดียวกัน ช่องค่าวัสดุว่าง

const bd = '1px solid #C9D2DA'
const h: React.CSSProperties = { padding: '5px 6px', fontSize: 10.5, border: bd, background: '#F2F5F8', fontWeight: 600 }
const c: React.CSSProperties = { padding: '4px 6px', fontSize: 10.5, border: bd, verticalAlign: 'top' }
const num: React.CSSProperties = { ...c, textAlign: 'right', whiteSpace: 'nowrap' }
const sec: React.CSSProperties = { fontSize: 13.5, fontWeight: 700, color: '#1E2E3B', margin: '18px 0 8px', paddingBottom: 4, borderBottom: '1.5px solid #1E2E3B' }
const q = (n: number) => n ? (Math.round(n * 100) / 100).toLocaleString('th-TH') : '-'

const floorOf = (it: BoqItem) => it.floor || FLOOR_ALL
const sumMat = (xs: BoqItem[]) => xs.reduce((s, it) => s + (it.qty || 0) * (it.mat || 0), 0)
const sumLab = (xs: BoqItem[]) => xs.reduce((s, it) => s + (it.qty || 0) * (it.lab || 0), 0)

// วัสดุชนิดเดียวกัน (ชื่อ + หน่วย) จากหลายชั้น → แถวเดียว · ราคา/หน่วยเฉลี่ยถ่วงตามจำนวน
function mergeAcrossFloors(items: BoqItem[]) {
  const m = new Map<string, { desc: string; unit: string; qty: number; mat: number; lab: number; floors: string[] }>()
  for (const it of items) {
    const k = it.desc.trim() + '|' + (it.unit || '').trim()
    const o = m.get(k) || { desc: it.desc, unit: it.unit, qty: 0, mat: 0, lab: 0, floors: [] }
    o.qty += it.qty || 0; o.mat += (it.qty || 0) * (it.mat || 0); o.lab += (it.qty || 0) * (it.lab || 0)
    if (!o.floors.includes(floorOf(it))) o.floors.push(floorOf(it))
    m.set(k, o)
  }
  return [...m.values()].map((o) => ({ ...o, floors: sortFloors(o.floors) }))
}

export default function MaterialSummaryPrint({ title, houseName, items, onClose }: { title: string; houseName?: string; items: BoqItem[]; onClose: () => void }) {
  const floors = sortFloors(items.map(floorOf))
  const cats = BOQ_CATS.filter((cat) => items.some((it) => it.cat === cat))
  const totMat = sumMat(items), totLab = sumLab(items)
  const print = () => {
    // ชื่อหน้าต่าง = ชื่อไฟล์ตั้งต้นตอน "บันทึกเป็น PDF"
    const old = document.title
    document.title = `สรุปวัสดุ-${houseName || 'ถอดแบบ'}`.replace(/[\\/:*?"<>|]/g, '-')
    window.print()
    setTimeout(() => { document.title = old }, 500)
  }
  const head = (
    <tr>
      <th style={{ ...h, width: 26 }}>#</th><th style={{ ...h, textAlign: 'left' }}>รายการ</th>
      <th style={{ ...h, width: 58, textAlign: 'right' }}>จำนวน</th><th style={{ ...h, width: 44 }}>หน่วย</th>
      <th style={{ ...h, width: 72, textAlign: 'right' }}>วัสดุ/หน่วย</th><th style={{ ...h, width: 82, textAlign: 'right' }}>ค่าวัสดุ</th>
      <th style={{ ...h, width: 78, textAlign: 'right' }}>ค่าแรง</th><th style={{ ...h, width: 88, textAlign: 'right' }}>รวม</th>
    </tr>
  )
  const subRow = (label: string, mat: number, lab: number, strong = false) => (
    <tr style={{ breakInside: 'avoid' }}>
      <td colSpan={5} style={{ ...c, textAlign: 'right', fontWeight: 600, background: strong ? '#E6ECF1' : '#F7F9FB' }}>{label}</td>
      <td style={{ ...num, fontWeight: 600, background: strong ? '#E6ECF1' : '#F7F9FB' }}>{baht(mat)}</td>
      <td style={{ ...num, fontWeight: 600, background: strong ? '#E6ECF1' : '#F7F9FB' }}>{baht(lab)}</td>
      <td style={{ ...num, fontWeight: 700, background: strong ? '#E6ECF1' : '#F7F9FB' }}>{baht(mat + lab)}</td>
    </tr>
  )

  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 880, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>สรุปวัสดุ · {items.length} รายการ</div>
        <div style={{ color: '#D6E0E8', fontSize: 12 }}>กด “พิมพ์ / PDF” แล้วเลือกปลายทาง “บันทึกเป็น PDF”</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={print} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์ / PDF</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>

      <div className="print-area" style={{ maxWidth: 880, margin: '0 auto', background: '#fff', borderRadius: 6, padding: '28px 32px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, borderBottom: '2px solid #1E2E3B', paddingBottom: 12, marginBottom: 6 }}>
          <img src={PPSD_LOGO_FULL} alt="PPSD" style={{ width: 54, height: 54, borderRadius: 8, objectFit: 'cover' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{company.name}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2E3B' }}>สรุปปริมาณวัสดุและค่าแรง (แยกชั้น · แยกประเภทงาน)</div>
            <div style={{ fontSize: 11.5, color: '#5C6770' }}>{title}{houseName ? ' · ' + houseName : ''}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11.5, color: '#5C6770' }}>{new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</div>
        </div>
        <div style={{ fontSize: 10.5, color: '#7A858D', marginBottom: 4 }}>ปริมาณจากการถอดแบบ (ตรวจแก้แล้ว) · ราคาเป็นต้นทุนก่อนค่าดำเนินการ/กำไร และ VAT · รายการ “ค่าแรง:” คิดตามปริมาณงาน</div>

        {/* 1) ภาพรวมแยกชั้น × ประเภทงาน */}
        <div style={sec}>1. ภาพรวมมูลค่า แยกชั้น × ประเภทงาน</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...h, textAlign: 'left' }}>ชั้น</th>
            {cats.map((cat) => <th key={cat} style={{ ...h, textAlign: 'right' }}>{cat}</th>)}
            <th style={{ ...h, textAlign: 'right' }}>รวม</th>
          </tr></thead>
          <tbody>
            {floors.map((f) => {
              const xs = items.filter((it) => floorOf(it) === f)
              return (
                <tr key={f}>
                  <td style={{ ...c, fontWeight: 600 }}>{f}</td>
                  {cats.map((cat) => { const ys = xs.filter((it) => it.cat === cat); return <td key={cat} style={num}>{ys.length ? baht(sumMat(ys) + sumLab(ys)) : '-'}</td> })}
                  <td style={{ ...num, fontWeight: 700 }}>{baht(sumMat(xs) + sumLab(xs))}</td>
                </tr>
              )
            })}
            <tr>
              <td style={{ ...c, fontWeight: 700, background: '#E6ECF1' }}>รวมทั้งงาน</td>
              {cats.map((cat) => { const ys = items.filter((it) => it.cat === cat); return <td key={cat} style={{ ...num, fontWeight: 700, background: '#E6ECF1' }}>{baht(sumMat(ys) + sumLab(ys))}</td> })}
              <td style={{ ...num, fontWeight: 700, background: '#E6ECF1' }}>{baht(totMat + totLab)}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 18, justifyContent: 'flex-end', fontSize: 11.5, marginTop: 6 }}>
          <span>ค่าวัสดุรวม <b className="num">{baht(totMat)}</b></span><span>ค่าแรงรวม <b className="num">{baht(totLab)}</b></span><span>รวมต้นทุน <b className="num">{baht(totMat + totLab)}</b></span>
        </div>

        {/* 2) รวมทั้งงาน */}
        <div style={sec}>2. รายการวัสดุรวมทั้งงาน (รวมทุกชั้น แยกตามประเภทงาน)</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>{head}</thead>
          <tbody>
            {cats.map((cat) => {
              const xs = items.filter((it) => it.cat === cat)
              const rows = mergeAcrossFloors(xs)
              return (
                <Fragment key={cat}>
                  <tr style={{ breakInside: 'avoid', breakAfter: 'avoid' }}><td colSpan={8} style={{ ...c, background: '#EEF2F5', fontWeight: 700 }}>{cat}</td></tr>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ breakInside: 'avoid' }}>
                      <td style={{ ...c, textAlign: 'center', color: '#7A858D' }}>{i + 1}</td>
                      <td style={c}>{r.desc}<div style={{ fontSize: 9.5, color: '#7A858D' }}>{r.floors.join(', ')}</div></td>
                      <td style={num}>{q(r.qty)}</td><td style={c}>{r.unit || '-'}</td>
                      <td style={num}>{r.mat ? baht(r.mat / (r.qty || 1)) : '-'}</td><td style={num}>{r.mat ? baht(r.mat) : '-'}</td>
                      <td style={num}>{r.lab ? baht(r.lab) : '-'}</td><td style={{ ...num, fontWeight: 600 }}>{baht(r.mat + r.lab)}</td>
                    </tr>
                  ))}
                  {subRow('รวม' + cat, sumMat(xs), sumLab(xs))}
                </Fragment>
              )
            })}
            {subRow('รวมทั้งงาน', totMat, totLab, true)}
          </tbody>
        </table>

        {/* 3) แยกชั้น → ประเภทงาน */}
        <div style={{ ...sec, breakBefore: 'page' }}>3. รายการวัสดุแยกตามชั้น และประเภทงาน</div>
        {floors.map((f) => {
          const xs = items.filter((it) => floorOf(it) === f)
          return (
            <div key={f} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, background: '#1E2E3B', color: '#fff', padding: '5px 8px', breakAfter: 'avoid' }}>{f}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>{head}</thead>
                <tbody>
                  {cats.filter((cat) => xs.some((it) => it.cat === cat)).map((cat) => {
                    const ys = xs.filter((it) => it.cat === cat)
                    return (
                      <Fragment key={cat}>
                        <tr style={{ breakInside: 'avoid', breakAfter: 'avoid' }}><td colSpan={8} style={{ ...c, background: '#EEF2F5', fontWeight: 700 }}>{cat}</td></tr>
                        {ys.map((it, i) => (
                          <tr key={i} style={{ breakInside: 'avoid' }}>
                            <td style={{ ...c, textAlign: 'center', color: '#7A858D' }}>{i + 1}</td>
                            <td style={c}>{it.desc}{it.basis && <div style={{ fontSize: 9.5, color: '#7A858D' }}>{it.basis}</div>}</td>
                            <td style={num}>{q(it.qty)}</td><td style={c}>{it.unit || '-'}</td>
                            <td style={num}>{it.mat ? baht(it.mat) : '-'}</td><td style={num}>{it.mat ? baht(it.qty * it.mat) : '-'}</td>
                            <td style={num}>{it.lab ? baht(it.qty * it.lab) : '-'}</td><td style={{ ...num, fontWeight: 600 }}>{baht(it.qty * (it.mat + it.lab))}</td>
                          </tr>
                        ))}
                        {subRow(`รวม${cat} · ${f}`, sumMat(ys), sumLab(ys))}
                      </Fragment>
                    )
                  })}
                  {subRow('รวม' + f, sumMat(xs), sumLab(xs), true)}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
    </div>
  )
}
