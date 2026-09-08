import { Fragment } from 'react'
import { company } from '../erpData'
import { PPSD_LOGO_FULL } from '../assets'
import type { QcInspection } from './QcInspect'
import { qcFormById, qcLabels, qcPhaseName } from '../qcTemplates'

const bd = '1px solid #C9D2DA'
const hcell: React.CSSProperties = { padding: '6px 8px', fontSize: 11.5, border: bd, background: '#F2F5F8', fontWeight: 600, textAlign: 'center' }
const cell: React.CSSProperties = { padding: '6px 8px', fontSize: 11.5, border: bd, verticalAlign: 'top' }
const dots = (w: number) => <span style={{ display: 'inline-block', width: w, borderBottom: '1px dotted #5C6770', verticalAlign: 'bottom' }} />

// ใบพิมพ์ตามแบบฟอร์มกระดาษของ PPSD: หัว ชื่อลูกค้า/สถานที่/วันที่ตรวจ · ตาราง รายการ | ผ่าน | ไม่ผ่าน | เหตุผล
// · ช่องพิเศษ (วันเทปูน/คิวปูน) · กำหนดการแก้ไข · ลงชื่อ ผู้ตรวจ+ช่างหน้างาน · ติ๊ก ผ่านมาตรฐาน/ไม่ผ่าน
// ใบเก่า (ก่อนเปลี่ยนชุดฟอร์ม) ยังพิมพ์ได้ด้วยป้าย อนุมัติ/แก้ไข และช่องลงชื่อ 3 ช่องแบบเดิม
export default function QcPrint({ qc, houseName, onClose }: { qc: QcInspection; houseName?: string; onClose: () => void }) {
  const fm = qc.form_id ? qcFormById(qc.form_id) : undefined
  const legacy = !qc.kind
  const [okL, ngL] = qcLabels(qc.kind)
  const signs = fm?.signs || (legacy ? ['ผู้ตรวจสอบ (Reported by)', 'ผู้ทบทวน (Reviewed by)', 'ผู้อนุมัติ (Approved by)'] : ['ผู้ตรวจ', 'ช่างหน้างาน'])
  const signName = (label: string) => label === 'ผู้ตรวจ' || label === 'ผู้ตรวจสอบ' || label.startsWith('ผู้ตรวจสอบ') ? qc.inspector : (label === 'ช่างหน้างาน' || label === 'ผู้รับผิดชอบ') ? qc.worker || '' : ''
  const extras = fm ? fm.extra.map((k) => [k, (qc.extra || {})[k] || ''] as const) : Object.entries(qc.extra || {})
  const title = legacy ? `รายการตรวจสอบงานก่อสร้าง · ${qc.category}` : (fm ? (fm.title.startsWith('เอกสาร') ? fm.title : 'เอกสารตรวจ' + fm.title) : 'เอกสารตรวจ' + qc.type)

  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }}>
      <div className="no-print" style={{ maxWidth: 820, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{qc.no}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>

      <div className="print-area" style={{ maxWidth: 820, margin: '0 auto', background: '#fff', borderRadius: 6, padding: '30px 34px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, borderBottom: '2px solid #1E2E3B', paddingBottom: 12, marginBottom: 14 }}>
          <img src={PPSD_LOGO_FULL} alt="PPSD" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{company.name}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2E3B', marginTop: 2 }}>{title}</div>
            {qc.phase && <div style={{ fontSize: 11.5, color: '#5C6770', marginTop: 2 }}>งวด {qc.phase} · {qcPhaseName(qc.phase)} · หมวด {qc.category}{fm ? ` · แบบฟอร์มหน้า ${fm.no}` : ''}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="num" style={{ fontSize: 12, color: '#5C6770', fontFamily: 'monospace' }}>{qc.no}</div>
            <div style={{ fontSize: 11.5, color: '#5C6770' }}>วันที่ตรวจงาน {qc.date}</div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12, fontSize: 11.5 }}>
          <tbody>
            <tr>
              <td style={{ ...cell, background: '#F7F9FB', width: '15%' }}>ชื่อลูกค้า / บ้าน</td><td style={cell}>{houseName || qc.house_code || '-'}</td>
              <td style={{ ...cell, background: '#F7F9FB', width: '15%' }}>โซน / ชั้น</td><td style={cell}>{qc.zone || '-'}</td>
            </tr>
            <tr>
              <td style={{ ...cell, background: '#F7F9FB' }}>ผู้ตรวจ</td><td style={cell}>{qc.inspector || '-'}</td>
              <td style={{ ...cell, background: '#F7F9FB' }}>{qc.kind === 'มี/ไม่มี' ? 'ผู้รับผิดชอบ' : 'ช่างหน้างาน'}</td><td style={cell}>{qc.worker || '-'}</td>
            </tr>
            <tr>
              <td style={{ ...cell, background: '#F7F9FB' }}>วันที่เริ่ม</td><td style={cell}>{qc.start_date || '-'}</td>
              <td style={{ ...cell, background: '#F7F9FB' }}>คาดว่าจะเสร็จ 100% ในวันที่</td><td style={cell}>{qc.end_date || '-'}</td>
            </tr>
          </tbody>
        </table>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...hcell, width: 34 }} rowSpan={2}>ลำดับ</th>
              <th style={{ ...hcell, textAlign: 'left' }} rowSpan={2}>รายการตรวจสอบ</th>
              <th style={hcell} colSpan={2}>ผลการตรวจงาน</th>
              <th style={{ ...hcell, width: 190, textAlign: 'left' }} rowSpan={2}>{legacy ? 'รายละเอียดที่ต้องแก้ไข / หมายเหตุ' : 'เหตุผล'}</th>
            </tr>
            <tr>
              <th style={{ ...hcell, width: 56 }}>{okL}</th>
              <th style={{ ...hcell, width: 56 }}>{ngL}</th>
            </tr>
          </thead>
          <tbody>
            {qc.items.map((it, i) => (
              <Fragment key={i}>
                {it.section && (i === 0 || qc.items[i - 1].section !== it.section) && (
                  <tr><td colSpan={5} style={{ ...cell, textAlign: 'center', fontWeight: 700, background: '#F7F9FB' }}>({it.section})</td></tr>
                )}
                <tr>
                  <td style={{ ...cell, textAlign: 'center' }}>{i + 1}</td>
                  <td style={cell}>{it.text}</td>
                  <td style={{ ...cell, textAlign: 'center', color: '#2E7D55', fontWeight: 700 }}>{it.result === okL ? '✓' : ''}</td>
                  <td style={{ ...cell, textAlign: 'center', color: '#C24036', fontWeight: 700 }}>{it.result === ngL ? '✓' : ''}</td>
                  <td style={cell}>{it.fix || ''}{(it.images || []).length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                      {(it.images || []).map((im, j) => <img key={j} src={im} alt={'รูป ' + (j + 1)} style={{ height: 46, borderRadius: 4, border: '1px solid #C9D2DA' }} />)}
                    </div>
                  )}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>

        {(extras.length > 0 || !legacy) && (
          <div style={{ marginTop: 12, fontSize: 11.5, color: '#1C2730', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {extras.map(([k, v]) => <div key={k}>* {k}: {v ? <b>{v}</b> : dots(220)}</div>)}
            {!legacy && (
              <div>กำหนดการแก้ไขงาน (ถ้ามี) วันที่ {qc.fix_date ? <b>{qc.fix_date}</b> : dots(120)} &nbsp; กำหนดการเข้าตรวจงานแก้ไข วันที่ {qc.recheck_date ? <b>{qc.recheck_date}</b> : dots(120)}</div>
            )}
            {qc.remark && <div>หมายเหตุ: {qc.remark}</div>}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: legacy ? 'space-between' : 'flex-end', gap: 30, marginTop: 26 }}>
          {signs.map((r) => (
            <div key={r} style={{ flex: legacy ? 1 : '0 0 200px', textAlign: 'center' }}>
              <div style={{ height: 22, fontSize: 12, fontWeight: 600, color: '#1C2730' }}>{signName(r)}</div>
              <div style={{ borderTop: '1px dotted #94A0A8', margin: '4px 8px 6px' }} />
              <div style={{ fontSize: 11, color: '#5C6770' }}>{r}</div>
              <div style={{ fontSize: 10, color: '#94A0A8' }}>วันที่ ......../......../........</div>
            </div>
          ))}
        </div>
        {!legacy && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 22, marginTop: 14, fontSize: 12 }}>
            {['ผ่านมาตรฐาน', 'ไม่ผ่านตามมาตรฐาน'].map((s) => <div key={s}><span style={{ fontSize: 14, fontWeight: 700, color: qc.std === s ? (s === 'ผ่านมาตรฐาน' ? '#2E7D55' : '#C24036') : '#1C2730' }}>{qc.std === s ? '☑' : '☐'}</span> {s}</div>)}
          </div>
        )}
      </div>
    </div>
  )
}
