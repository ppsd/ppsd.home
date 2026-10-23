import { Fragment, useState } from 'react'
import { company } from '../../erpData'
import { PPSD_LOGO_FULL } from '../../assets'
import { baht } from '../../data'
import { BOQ_CATS, type BoqItem } from './BoqTab'
import { FLOOR_ALL, sortFloors, type WorkSec } from './boqFloors'
import { exportMaterialSummaryXlsx, floorOf, mergeAcrossFloors, nameOf as nameFor, sumLab, sumMat, summaryItems } from './materialSummaryData'

// สรุปวัสดุ (A4 → พิมพ์/บันทึกเป็น PDF จากหน้าต่างพิมพ์ของเบราว์เซอร์)
//  1) ภาพรวม: แยกชั้น × ประเภทงาน (จำนวนรายการ หรือมูลค่าเมื่อเปิดแสดงราคา)
//  2) รวมทั้งงาน: วัสดุชนิดเดียวกันจากทุกชั้นรวมเป็นแถวเดียว แยกตามประเภทงาน
//  3) แยกชั้น → ประเภทงาน → ส่วนงาน (เสา คาน พื้น ฯลฯ): ปริมาณงานที่วัดจากแบบ + ใช้วัสดุอะไร เท่าไหร่ คิดยังไง
// ค่าเริ่มต้น = ปริมาณอย่างเดียว (ไม่มีราคา/ค่าแรง) · ติ๊ก "แสดงราคา" เพื่อดูค่าวัสดุ ค่าแรง และยอดรวม

const bd = '1px solid #C9D2DA'
const h: React.CSSProperties = { padding: '5px 6px', fontSize: 10.5, border: bd, background: '#F2F5F8', fontWeight: 600 }
const c: React.CSSProperties = { padding: '4px 6px', fontSize: 10.5, border: bd, verticalAlign: 'top' }
const num: React.CSSProperties = { ...c, textAlign: 'right', whiteSpace: 'nowrap' }
const sec: React.CSSProperties = { fontSize: 13.5, fontWeight: 700, color: '#1E2E3B', margin: '18px 0 8px', paddingBottom: 4, borderBottom: '1.5px solid #1E2E3B' }
const q = (n: number) => n ? (Math.round(n * 100) / 100).toLocaleString('th-TH') : '-'

export default function MaterialSummaryPrint({ title, houseName, items, work = [], onClose }: { title: string; houseName?: string; items: BoqItem[]; work?: WorkSec[]; onClose: () => void }) {
  const [showPrice, setShowPrice] = useState(false)
  // ไม่แสดงราคา = วัสดุอย่างเดียว (แถวค่าแรงเป็นปริมาณงาน ซึ่งแสดงอยู่ในหัวส่วนงานแล้ว)
  const list = summaryItems(items, showPrice)
  const floors = sortFloors(list.map(floorOf))
  const cats = BOQ_CATS.filter((cat) => list.some((it) => it.cat === cat))
  const totMat = sumMat(list), totLab = sumLab(list)
  const cols = showPrice ? 8 : 4
  // ไม่แสดงราคา = ใช้ชื่อ/สเปกตามแบบ · แสดงราคา = ชื่อตามราคากลางที่ผูกไว้
  const nameOf = (it: BoqItem) => nameFor(it, showPrice)
  const print = () => {
    // ชื่อหน้าต่าง = ชื่อไฟล์ตั้งต้นตอน "บันทึกเป็น PDF"
    const old = document.title
    document.title = `สรุปวัสดุ-${houseName || 'ถอดแบบ'}`.replace(/[\\/:*?"<>|]/g, '-')
    window.print()
    setTimeout(() => { document.title = old }, 500)
  }
  const head = (
    <tr>
      <th style={{ ...h, width: 26 }}>#</th><th style={{ ...h, textAlign: 'left' }}>รายการวัสดุ</th>
      <th style={{ ...h, width: 70, textAlign: 'right' }}>จำนวน</th><th style={{ ...h, width: 56 }}>หน่วย</th>
      {showPrice && <>
        <th style={{ ...h, width: 72, textAlign: 'right' }}>วัสดุ/หน่วย</th><th style={{ ...h, width: 82, textAlign: 'right' }}>ค่าวัสดุ</th>
        <th style={{ ...h, width: 78, textAlign: 'right' }}>ค่าแรง</th><th style={{ ...h, width: 88, textAlign: 'right' }}>รวม</th>
      </>}
    </tr>
  )
  const priceCells = (qty: number, matTotal: number, labTotal: number) => showPrice && <>
    <td style={num}>{matTotal ? baht(matTotal / (qty || 1)) : '-'}</td><td style={num}>{matTotal ? baht(matTotal) : '-'}</td>
    <td style={num}>{labTotal ? baht(labTotal) : '-'}</td><td style={{ ...num, fontWeight: 600 }}>{baht(matTotal + labTotal)}</td>
  </>
  const subRow = (label: string, mat: number, lab: number, strong = false) => showPrice && (
    <tr style={{ breakInside: 'avoid' }}>
      <td colSpan={5} style={{ ...c, textAlign: 'right', fontWeight: 600, background: strong ? '#E6ECF1' : '#F7F9FB' }}>{label}</td>
      <td style={{ ...num, fontWeight: 600, background: strong ? '#E6ECF1' : '#F7F9FB' }}>{baht(mat)}</td>
      <td style={{ ...num, fontWeight: 600, background: strong ? '#E6ECF1' : '#F7F9FB' }}>{baht(lab)}</td>
      <td style={{ ...num, fontWeight: 700, background: strong ? '#E6ECF1' : '#F7F9FB' }}>{baht(mat + lab)}</td>
    </tr>
  )
  // ภาพรวม: จำนวนรายการ (ไม่แสดงราคา) หรือ มูลค่า (แสดงราคา)
  const cellOf = (xs: BoqItem[]) => showPrice ? baht(sumMat(xs) + sumLab(xs)) : xs.length ? `${xs.length} รายการ` : '-'

  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 880, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>สรุปวัสดุ · {list.length} รายการ</div>
        <label style={{ color: '#fff', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', background: 'rgba(255,255,255,.12)', borderRadius: 7, padding: '4px 9px' }}>
          <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> แสดงราคา / ค่าแรง
        </label>
        <div style={{ color: '#D6E0E8', fontSize: 12 }}>กด “พิมพ์ / PDF” แล้วเลือกปลายทาง “บันทึกเป็น PDF”</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => exportMaterialSummaryXlsx({ title, houseName, items, work, showPrice }).catch((e) => alert('ส่งออก Excel ไม่สำเร็จ: ' + (e as Error).message))} title="Excel: สรุป · รวมทั้งงาน · ข้อมูลทั้งหมด · แยกชั้น · แยกระบบงาน" style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>⬇ Excel</button>
          <button onClick={print} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์ / PDF</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>

      <div className="print-area" style={{ maxWidth: 880, margin: '0 auto', background: '#fff', borderRadius: 6, padding: '28px 32px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, borderBottom: '2px solid #1E2E3B', paddingBottom: 12, marginBottom: 6 }}>
          <img src={PPSD_LOGO_FULL} alt="PPSD" style={{ width: 54, height: 54, borderRadius: 8, objectFit: 'cover' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{company.name}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2E3B' }}>{showPrice ? 'สรุปปริมาณวัสดุและค่าแรง' : 'สรุปปริมาณวัสดุ'} (แยกชั้น · แยกประเภทงาน)</div>
            <div style={{ fontSize: 11.5, color: '#5C6770' }}>{title}{houseName ? ' · ' + houseName : ''}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11.5, color: '#5C6770' }}>{new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</div>
        </div>
        <div style={{ fontSize: 10.5, color: '#7A858D', marginBottom: 4 }}>
          ปริมาณจากการถอดแบบ (ตรวจแก้แล้ว){showPrice ? ' · ราคาเป็นต้นทุนก่อนค่าดำเนินการ/กำไร และ VAT · รายการ “ค่าแรง:” คิดตามปริมาณงาน' : ' · ใต้ชื่อวัสดุคือวิธีคิดปริมาณ'}
        </div>

        {/* 1) ภาพรวมแยกชั้น × ประเภทงาน */}
        <div style={sec}>1. ภาพรวม แยกชั้น × ประเภทงาน{showPrice ? ' (มูลค่า)' : ' (จำนวนรายการวัสดุ)'}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...h, textAlign: 'left' }}>ชั้น</th>
            {cats.map((cat) => <th key={cat} style={{ ...h, textAlign: 'right' }}>{cat}</th>)}
            <th style={{ ...h, textAlign: 'right' }}>รวม</th>
          </tr></thead>
          <tbody>
            {floors.map((f) => {
              const xs = list.filter((it) => floorOf(it) === f)
              return (
                <tr key={f}>
                  <td style={{ ...c, fontWeight: 600 }}>{f}</td>
                  {cats.map((cat) => <td key={cat} style={num}>{cellOf(xs.filter((it) => it.cat === cat))}</td>)}
                  <td style={{ ...num, fontWeight: 700 }}>{cellOf(xs)}</td>
                </tr>
              )
            })}
            <tr>
              <td style={{ ...c, fontWeight: 700, background: '#E6ECF1' }}>รวมทั้งงาน</td>
              {cats.map((cat) => <td key={cat} style={{ ...num, fontWeight: 700, background: '#E6ECF1' }}>{cellOf(list.filter((it) => it.cat === cat))}</td>)}
              <td style={{ ...num, fontWeight: 700, background: '#E6ECF1' }}>{cellOf(list)}</td>
            </tr>
          </tbody>
        </table>
        {showPrice && <div style={{ display: 'flex', gap: 18, justifyContent: 'flex-end', fontSize: 11.5, marginTop: 6 }}>
          <span>ค่าวัสดุรวม <b className="num">{baht(totMat)}</b></span><span>ค่าแรงรวม <b className="num">{baht(totLab)}</b></span><span>รวมต้นทุน <b className="num">{baht(totMat + totLab)}</b></span>
        </div>}

        {/* 2) รวมทั้งงาน */}
        <div style={sec}>2. รายการวัสดุรวมทั้งงาน (รวมทุกชั้น แยกตามประเภทงาน)</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>{head}</thead>
          <tbody>
            {cats.map((cat) => {
              const xs = list.filter((it) => it.cat === cat)
              return (
                <Fragment key={cat}>
                  <tr style={{ breakInside: 'avoid', breakAfter: 'avoid' }}><td colSpan={cols} style={{ ...c, background: '#EEF2F5', fontWeight: 700 }}>{cat}</td></tr>
                  {mergeAcrossFloors(xs, nameOf).map((r, i) => (
                    <tr key={i} style={{ breakInside: 'avoid' }}>
                      <td style={{ ...c, textAlign: 'center', color: '#7A858D' }}>{i + 1}</td>
                      <td style={c}>{r.desc}<div style={{ fontSize: 9.5, color: '#7A858D' }}>{r.floors.join(', ')}</div></td>
                      <td style={{ ...num, fontWeight: 600 }}>{q(r.qty)}</td><td style={c}>{r.unit || '-'}</td>
                      {priceCells(r.qty, r.mat, r.lab)}
                    </tr>
                  ))}
                  {subRow('รวม' + cat, sumMat(xs), sumLab(xs))}
                </Fragment>
              )
            })}
            {subRow('รวมทั้งงาน', totMat, totLab, true)}
          </tbody>
        </table>

        {/* 3) แยกชั้น → ประเภทงาน → ส่วนงาน */}
        <div style={{ ...sec, breakBefore: 'page' }}>3. รายการวัสดุแยกตามชั้น · ประเภทงาน · ส่วนงาน</div>
        {floors.map((f) => {
          const xs = list.filter((it) => floorOf(it) === f)
          return (
            <div key={f} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, background: '#1E2E3B', color: '#fff', padding: '5px 8px', breakAfter: 'avoid' }}>{f}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>{head}</thead>
                <tbody>
                  {cats.filter((cat) => xs.some((it) => it.cat === cat)).map((cat) => {
                    const ys = xs.filter((it) => it.cat === cat)
                    const parts = [...new Set(ys.map((it) => it.part || ''))]
                    return (
                      <Fragment key={cat}>
                        <tr style={{ breakInside: 'avoid', breakAfter: 'avoid' }}><td colSpan={cols} style={{ ...c, background: '#EEF2F5', fontWeight: 700 }}>{cat}</td></tr>
                        {parts.map((pt) => {
                          const zs = ys.filter((it) => (it.part || '') === pt)
                          const ws = work.filter((w) => (w.floor || FLOOR_ALL) === f && w.cat === cat && (w.part || '') === pt)
                          const sheets = [...new Set([...zs.map((it) => it.sheet || ''), ...ws.map((w) => w.sheet || '')].filter(Boolean))]
                          return (
                            <Fragment key={pt}>
                              {(pt || ws.length > 0) && <tr style={{ breakInside: 'avoid', breakAfter: 'avoid' }}><td colSpan={cols} style={{ ...c, background: '#FAFBFC' }}>
                                <b>{pt || 'อื่นๆ'}</b>{sheets.length > 0 && <span style={{ color: '#7A858D' }}> · แบบ {sheets.join(', ')}</span>}
                                {ws.length > 0 && <div style={{ fontSize: 10, color: '#3A5A72', marginTop: 2 }}>ปริมาณงาน: {ws.flatMap((w) => w.work).map((x) => `${x.desc} ${q(x.qty)} ${x.unit}`).join(' · ')}</div>}
                              </td></tr>}
                              {zs.map((it, i) => (
                                <tr key={i} style={{ breakInside: 'avoid' }}>
                                  <td style={{ ...c, textAlign: 'center', color: '#7A858D' }}>{i + 1}</td>
                                  <td style={c}>{nameOf(it)}{it.basis && <div style={{ fontSize: 9.5, color: '#7A858D' }}>{it.basis}</div>}</td>
                                  <td style={{ ...num, fontWeight: 600 }}>{q(it.qty)}</td><td style={c}>{it.unit || '-'}</td>
                                  {priceCells(it.qty, it.qty * (it.mat || 0), it.qty * (it.lab || 0))}
                                </tr>
                              ))}
                              {parts.length > 1 && subRow(`รวม${pt || 'อื่นๆ'}`, sumMat(zs), sumLab(zs))}
                            </Fragment>
                          )
                        })}
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
