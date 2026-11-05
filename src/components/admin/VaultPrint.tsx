import { useEffect } from 'react'
import { PPSD_LOGO_FULL } from '../../assets'
import { company } from '../../erpData'

// ===== คลังรหัสผ่าน — เอกสารอ่านง่าย (พิมพ์ / บันทึก PDF) =====
// ถอดรหัสในเบราว์เซอร์เท่านั้น (ไม่ส่งรหัสจริงไปเซิร์ฟเวอร์) · เปิดได้เฉพาะ CEO หลังใส่รหัสผ่านหลักซ้ำ
// จัดเป็นการ์ดต่อรายการ แยกหมวด · รหัสผ่านใช้ตัวอักษรความกว้างเท่ากัน + ตัวเลขสีน้ำเงิน / สัญลักษณ์สีส้ม กันอ่าน 0/O, 1/l/I สับสน

export interface PrintRow {
  id: number; title: string; category: string; url: string; updated: string; updated_by: string
  username?: string; password?: string; totp?: string; note?: string
}

const fmtTH = (ts?: string) => {
  if (!ts) return '-'
  const d = new Date(String(ts).replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

// แยกสีตามชนิดตัวอักษร ให้อ่านออกเสียง/พิมพ์ตามได้ไม่ผิด
function Pw({ v }: { v: string }) {
  return (
    <span style={{ fontFamily: 'Consolas, "Courier New", monospace', fontSize: 15, letterSpacing: 1.5, wordBreak: 'break-all' }}>
      {[...v].map((ch, i) => (
        <span key={i} style={{ color: /[0-9]/.test(ch) ? '#1F5FAD' : /[A-Za-z]/.test(ch) ? '#1C2730' : '#B8560F', fontWeight: /[A-Z]/.test(ch) ? 700 : 500 }}>{ch === ' ' ? '␣' : ch}</span>
      ))}
    </span>
  )
}

const lbl: React.CSSProperties = { width: 118, padding: '6px 10px', fontSize: 11.5, color: '#5C6770', background: '#F6F8FA', borderBottom: '1px solid #E1E5EA', verticalAlign: 'top' }
const val: React.CSSProperties = { padding: '6px 10px', fontSize: 13, color: '#1C2730', borderBottom: '1px solid #E1E5EA', wordBreak: 'break-word' }

export default function VaultPrint({ rows, cats, by, withPasswords, onClose }: { rows: PrintRow[]; cats: string[]; by: string; withPasswords: boolean; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const groups = cats.concat(rows.map((r) => r.category).filter((c) => !cats.includes(c)))
    .filter((c, i, a) => a.indexOf(c) === i)
    .map((c) => ({ c, items: rows.filter((r) => r.category === c).sort((a, b) => a.title.localeCompare(b.title, 'th')) }))
    .filter((g) => g.items.length)
  const now = new Date().toLocaleString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  let n = 0
  return (
    <div className="printdoc-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.55)', zIndex: 60, overflow: 'auto', padding: '24px 16px' }} onClick={onClose}>
      <div className="no-print" style={{ maxWidth: 794, margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: 10 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>ทะเบียนรหัสผ่านบริษัท (อ่านง่าย) · {rows.length} รายการ</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>🖨 พิมพ์ / บันทึก PDF</button>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 13.5, color: '#1C2730', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>ปิด</button>
        </div>
      </div>

      <div className="print-area" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 794, margin: '0 auto', background: '#fff', borderRadius: 6, padding: '30px 34px', boxShadow: '0 24px 70px rgba(20,30,40,.3)' }}>
        {/* หัวเอกสาร */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, borderBottom: '2px solid #1E2E3B', paddingBottom: 12, marginBottom: 12 }}>
          <img src={PPSD_LOGO_FULL} alt="PPSD" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{company.name}</div>
            <div style={{ fontSize: 11, color: '#5C6770' }}>{company.nameEn}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1E2E3B' }}>ทะเบียนรหัสผ่านบริษัท</div>
            <div style={{ display: 'inline-block', marginTop: 4, fontSize: 11.5, fontWeight: 700, color: '#C24036', border: '1.5px solid #C24036', borderRadius: 4, padding: '1px 8px' }}>เอกสารลับ — ห้ามถ่ายสำเนา</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12, color: '#5C6770', marginBottom: 10 }}>
          <span>พิมพ์เมื่อ: <b style={{ color: '#1C2730' }}>{now}</b></span>
          <span>พิมพ์โดย: <b style={{ color: '#1C2730' }}>{by}</b></span>
          <span>จำนวน: <b style={{ color: '#1C2730' }}>{rows.length} รายการ · {groups.length} หมวด</b></span>
          {!withPasswords && <span style={{ color: '#B7791F', fontWeight: 600 }}>ฉบับนี้ไม่แสดงรหัสผ่าน</span>}
        </div>

        {/* สารบัญหมวด */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {groups.map((g) => <span key={g.c} style={{ fontSize: 11.5, background: '#EEF3F7', color: '#30506A', borderRadius: 20, padding: '3px 10px' }}>{g.c} ({g.items.length})</span>)}
        </div>
        {withPasswords && (
          <div style={{ fontSize: 11.5, color: '#5C6770', background: '#F6F8FA', borderRadius: 6, padding: '6px 10px', marginBottom: 14 }}>
            วิธีอ่านรหัสผ่าน: <b>ตัวพิมพ์ใหญ่ตัวหนา</b> · ตัวพิมพ์เล็กปกติ · <span style={{ color: '#1F5FAD', fontWeight: 600 }}>ตัวเลขสีน้ำเงิน</span> · <span style={{ color: '#B8560F', fontWeight: 600 }}>สัญลักษณ์สีส้ม</span> · ␣ = เว้นวรรค
          </div>
        )}

        {groups.map((g) => (
          <div key={g.c} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff', background: '#30506A', borderRadius: 5, padding: '5px 10px', marginBottom: 8, breakAfter: 'avoid' }}>{g.c} · {g.items.length} รายการ</div>
            {g.items.map((r) => {
              n++
              return (
                <div key={r.id} style={{ border: '1px solid #D2DAE1', borderRadius: 6, marginBottom: 8, overflow: 'hidden', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '6px 10px', background: '#F0F4F7', borderBottom: '1px solid #D2DAE1' }}>
                    <span style={{ fontSize: 11.5, color: '#94A0A8', fontWeight: 600 }}>{n}.</span>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{r.title}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94A0A8' }}>แก้ล่าสุด {fmtTH(r.updated)}{r.updated_by ? ` · ${r.updated_by}` : ''}</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {r.url && <tr><td style={lbl}>เว็บไซต์ / แอป</td><td style={val}>{r.url}</td></tr>}
                      <tr><td style={lbl}>ชื่อผู้ใช้</td><td style={{ ...val, fontFamily: 'Consolas, "Courier New", monospace', fontSize: 14 }}>{r.username || '-'}</td></tr>
                      {withPasswords && <tr><td style={lbl}>รหัสผ่าน</td><td style={val}>{r.password ? <Pw v={r.password} /> : '-'}</td></tr>}
                      {withPasswords && r.totp && <tr><td style={lbl}>2FA / รหัสกู้คืน</td><td style={{ ...val, fontFamily: 'Consolas, "Courier New", monospace', whiteSpace: 'pre-wrap' }}>{r.totp}</td></tr>}
                      {r.note && <tr><td style={lbl}>หมายเหตุ</td><td style={{ ...val, whiteSpace: 'pre-wrap' }}>{r.note}</td></tr>}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        ))}

        {/* ท้ายเอกสาร */}
        <div style={{ marginTop: 18, borderTop: '1px solid #E1E5EA', paddingTop: 12, fontSize: 11.5, color: '#5C6770', lineHeight: 1.7, breakInside: 'avoid' }}>
          ⚠ เก็บเอกสารนี้ในซองปิดผนึก/ตู้เซฟ · ถ้าบันทึกเป็น PDF อย่าส่งทาง LINE/อีเมล และลบไฟล์เมื่อใช้เสร็จ · รหัสเปลี่ยนเมื่อไร ให้พิมพ์ฉบับใหม่แล้วทำลายฉบับเก่า
          <div style={{ display: 'flex', gap: 40, marginTop: 26 }}>
            {['ผู้จัดทำ', 'ผู้เก็บรักษา'].map((t) => (
              <div key={t} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ borderBottom: '1px dotted #94A0A8', height: 26 }} />
                <div style={{ marginTop: 4 }}>{t} · วันที่ ......../......../........</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
