import { useEffect, useState } from 'react'
import { api } from '../api'
import { baht } from '../data'
import { useApp } from '../store'

// นำเข้างวดงานเป็นชุด — อัปโหลดสัญญา (AI อ่านให้) หรือวางจาก Excel/ข้อความ
interface Row { no: number; detail: string; amount: number; side: 'customer' | 'contractor'; due_iso?: string }
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 10px', outline: 'none' }

// หาจำนวนเงินในข้อความ — เอาที่ติดกับ "บาท" หรือ "เป็นเงิน" ก่อน, ไม่งั้นเอาเลขที่มากสุด
function extractAmount(t: string): number {
  let m = t.match(/([\d,]+(?:\.\d+)?)\s*บาท/); if (m) return Number(m[1].replace(/,/g, '')) || 0
  m = t.match(/(?:เป็นเงิน|จำนวนเงิน|ยอดเงิน|ยอด)\s*([\d,]+(?:\.\d+)?)/); if (m) return Number(m[1].replace(/,/g, '')) || 0
  const nums = [...t.matchAll(/[\d,]+(?:\.\d+)?/g)].map((x) => Number(x[0].replace(/,/g, ''))).filter((n) => n >= 100)
  return nums.length ? Math.max(...nums) : 0
}
// ตัดคำว่า "งวดที่ N" และวลีจำนวนเงินออกจากรายละเอียด
function cleanDetail(t: string): string {
  return t.replace(/งวด(?:ที่|ที)?\s*\d{1,3}/, '')
    .replace(/(?:เป็นเงิน|จำนวนเงิน|ยอดเงิน)?\s*[\d,]+(?:\.\d+)?\s*บาท(?:ถ้วน)?/g, '')
    .replace(/\s+/g, ' ').replace(/^[\s:.\-–—)]+/, '').trim()
}
// แยกข้อความที่วางมาเป็นงวดงาน — รองรับ Excel (tab), Word (ย่อหน้าเดียว/หลายบรรทัด), ข้อความทั่วไป
function parsePaste(text: string, side: 'customer' | 'contractor'): Row[] {
  const clean = text.replace(/\r/g, '').trim()
  if (!clean) return []
  // 1) Excel: มี tab → แยกเป็นคอลัมน์
  if (clean.includes('\t')) {
    return clean.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((ln, i) => {
      const cols = ln.split('\t').map((c) => c.trim())
      let amount = 0, amtIdx = -1
      for (let j = cols.length - 1; j >= 0; j--) { const s = cols[j].replace(/[,\s฿]|บาท|ถ้วน/g, ''); const n = Number(s); if (s !== '' && !Number.isNaN(n) && n > 0) { amount = n; amtIdx = j; break } }
      const noCol = cols[0] && /^\d{1,3}$/.test(cols[0]) ? Number(cols[0]) : i + 1
      const detail = cols.filter((_, j) => j !== amtIdx && !(j === 0 && /^\d{1,3}$/.test(cols[0]))).join(' ').trim()
      return { no: noCol, detail, amount, side }
    }).filter((r) => r.detail || r.amount > 0)
  }
  // 2) Word: จับคำว่า "งวดที่ N" แล้วตัดเป็นงวด (แม้ทั้งหมดอยู่ย่อหน้าเดียว)
  const markers = [...clean.matchAll(/งวด(?:ที่|ที)?\s*(\d{1,3})/g)]
  if (markers.length >= 2) {
    const out: Row[] = []
    for (let i = 0; i < markers.length; i++) {
      const s = markers[i].index!, e = i + 1 < markers.length ? markers[i + 1].index! : clean.length
      const chunk = clean.slice(s, e)
      out.push({ no: Number(markers[i][1]), detail: cleanDetail(chunk), amount: extractAmount(chunk), side })
    }
    return out.filter((r) => r.detail || r.amount > 0)
  }
  // 3) บรรทัดละงวด
  return clean.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((ln, i) => ({ no: i + 1, detail: cleanDetail(ln), amount: extractAmount(ln), side })).filter((r) => r.detail || r.amount > 0)
}

export default function ImportInstallments({ houseCode, houseName, onClose, onDone }: { houseCode: string; houseName: string; onClose: () => void; onDone: () => void }) {
  const [src, setSrc] = useState<'file' | 'paste'>('file')
  const [side, setSide] = useState<'customer' | 'contractor'>('customer')
  const [rows, setRows] = useState<Row[]>([])
  const [paste, setPaste] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const isAdmin = useApp().user?.role === 'admin'
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [keyMsg, setKeyMsg] = useState('')
  useEffect(() => { api.get<{ hasKey: boolean }>('/ai-settings').then((r) => setHasKey(r.hasKey)).catch(() => setHasKey(false)) }, [])
  const saveKey = async () => {
    try { const r = await api.post<{ hasKey: boolean }>('/ai-settings', { api_key: apiKey.trim() }); setHasKey(r.hasKey); setShowKey(false); setApiKey(''); setKeyMsg('บันทึกกุญแจ AI แล้ว') }
    catch (e) { setKeyMsg('ผิดพลาด: ' + (e as Error).message) }
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setErr(''); setBusy('AI กำลังอ่านสัญญา… (อาจใช้เวลาสักครู่)')
    try {
      const r = await api.uploadRaw<{ items: Row[] }>('/houses/' + encodeURIComponent(houseCode) + '/installments/extract', file)
      const items = (r.items || []).map((it) => ({ ...it, side: it.side || side }))
      if (!items.length) setErr('AI อ่านไม่พบตารางงวดงานในไฟล์นี้ — ลองไฟล์ที่ชัดขึ้น หรือใช้วิธี “วางจาก Excel”')
      setRows(items)
    } catch (ex) { setErr((ex as Error).message) } finally { setBusy('') }
  }
  const doParse = () => { setErr(''); const r = parsePaste(paste, side); if (!r.length) { setErr('ไม่พบข้อมูล — วางตารางจาก Excel (คอลัมน์: งวด / รายละเอียด / จำนวนเงิน)'); return } setRows(r) }
  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => j === i ? { ...r, ...patch } : r))
  const total = rows.reduce((s, r) => s + (r.amount || 0), 0)

  const confirm = async () => {
    const items = rows.filter((r) => r.detail.trim() || r.amount > 0)
    if (!items.length) { setErr('ไม่มีงวดงานให้นำเข้า'); return }
    setBusy('กำลังสร้างงวดงาน…'); setErr('')
    try { await api.post('/houses/' + encodeURIComponent(houseCode) + '/installments/bulk', { items }); onDone(); onClose() }
    catch (ex) { setErr((ex as Error).message) } finally { setBusy('') }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.5)', zIndex: 70, overflow: 'auto', padding: '24px 16px', display: 'flex' }}>
      <div style={{ maxWidth: 860, width: '100%', margin: 'auto', background: '#fff', borderRadius: 14, boxShadow: '0 24px 70px rgba(20,30,40,.3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid #EEF1F4' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>นำเข้างวดงาน — {houseName}</div>
            <div style={{ fontSize: 12, color: '#94A0A8' }}>อัปโหลดสัญญาให้ AI อ่าน หรือวางจาก Excel แล้วสร้างทั้งชุด</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'none', fontSize: 20, color: '#94A0A8', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: 20 }}>
          {/* เลือกฝั่ง */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: '#5C6770' }}>งวดงานนี้เป็นของ:</span>
            {([['customer', 'ลูกค้า (รับเงิน)'], ['contractor', 'ช่าง (จ่ายเงิน)']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setSide(v)} style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: side === v ? '#fff' : '#5C6770', background: side === v ? '#30506A' : '#F1F4F6', border: 'none', borderRadius: 20, padding: '5px 14px', cursor: 'pointer' }}>{l}</button>
            ))}
          </div>

          {/* แหล่งข้อมูล */}
          <div style={{ display: 'flex', gap: 2, background: '#F1F4F6', borderRadius: 9, padding: 4, marginBottom: 14, width: 'fit-content' }}>
            {([['file', '📄 อัปโหลดสัญญา (AI อ่านให้)'], ['paste', '📋 วางจาก Excel / Word']] as const).map(([v, l]) => (
              <div key={v} onClick={() => setSrc(v)} style={{ fontSize: 12.5, fontWeight: src === v ? 600 : 500, color: src === v ? '#fff' : '#5C6770', background: src === v ? '#30506A' : 'transparent', padding: '6px 14px', borderRadius: 7, cursor: 'pointer' }}>{l}</div>
            ))}
          </div>

          {src === 'file' && (
            <div style={{ border: '2px dashed #C9D3DB', borderRadius: 12, padding: 24, textAlign: 'center', marginBottom: 14 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '10px 18px', cursor: 'pointer' }}>
                เลือกไฟล์สัญญา (PDF / รูปถ่าย)
                <input type="file" accept="application/pdf,image/*" onChange={onFile} style={{ display: 'none' }} />
              </label>
              <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 8 }}>AI จะอ่านตารางงวดการชำระเงินให้ แล้วให้ตรวจ/แก้ก่อนบันทึก</div>
              <div style={{ fontSize: 11.5, marginTop: 8 }}>
                {hasKey === true && <span style={{ color: '#2E7D55' }}>✓ ตั้งค่ากุญแจ AI แล้ว พร้อมใช้งาน</span>}
                {hasKey === false && <span style={{ color: '#B7791F' }}>⚠ ยังไม่ได้ตั้งกุญแจ AI — {isAdmin ? <button onClick={() => setShowKey((v) => !v)} style={{ border: 'none', background: 'none', color: '#30506A', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, textDecoration: 'underline' }}>ตั้งค่ากุญแจ AI</button> : 'ให้ผู้ดูแลระบบตั้งค่าให้ (หรือใช้วิธีวางจาก Excel)'}</span>}
                {isAdmin && hasKey === true && <button onClick={() => setShowKey((v) => !v)} style={{ marginLeft: 8, border: 'none', background: 'none', color: '#94A0A8', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, textDecoration: 'underline' }}>เปลี่ยนกุญแจ</button>}
              </div>
              {showKey && isAdmin && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="วางกุญแจ Anthropic (sk-ant-...)" style={{ ...field, width: 300 }} />
                  <button onClick={saveKey} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>บันทึกกุญแจ</button>
                </div>
              )}
              {keyMsg && <div style={{ fontSize: 11.5, color: keyMsg.startsWith('ผิด') ? '#C24036' : '#2E7D55', marginTop: 6 }}>{keyMsg}</div>}
            </div>
          )}
          {src === 'paste' && (
            <div style={{ marginBottom: 14 }}>
              <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'วางจาก Excel หรือ Word ได้เลย — ก็อปข้อความงวดงานมาทั้งหมด ระบบตัดเป็นงวดให้เอง\n\nจาก Excel (คั่นด้วยแท็บ):\n1  เก็บมัดจำเริ่มก่อสร้าง  487,000\n\nจาก Word (ก็อปทั้งย่อหน้า):\nงวดที่ 1 เก็บมัดจำเริ่มก่อสร้าง เป็นเงิน 487,000 บาท งวดที่ 2 งานฐานรากแล้วเสร็จ เป็นเงิน 487,000 บาท …'} style={{ ...field, width: '100%', minHeight: 140, resize: 'vertical' }} />
              <div style={{ fontSize: 11.5, color: '#94A0A8', margin: '6px 0' }}>ระบบจับคำว่า “งวดที่ 1, 2, 3…” และยอด “…บาท” ให้อัตโนมัติ — ตรวจ/แก้ในตารางก่อนบันทึกได้เสมอ</div>
              <button onClick={doParse} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '8px 16px', cursor: 'pointer' }}>แปลงเป็นงวดงาน →</button>
            </div>
          )}

          {busy && <div style={{ fontSize: 13, color: '#30506A', background: '#EAF0F5', borderRadius: 9, padding: '10px 14px', marginBottom: 12 }}>{busy}</div>}
          {err && <div style={{ fontSize: 12.5, color: '#C24036', background: '#FBEEEC', border: '1px solid #E7CDC9', borderRadius: 9, padding: '9px 13px', marginBottom: 12 }}>{err}</div>}

          {/* พรีวิว/แก้ไข */}
          {rows.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>ตรวจสอบ/แก้ไขก่อนบันทึก <span className="num" style={{ color: '#94A0A8' }}>({rows.length} งวด · รวม {baht(total)})</span></div>
              <div style={{ border: '1px solid #E1E5EA', borderRadius: 10, overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead><tr style={{ background: '#F7F9FB', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '7px 8px', width: 44, color: '#5C6770' }}>งวด</th>
                    <th style={{ padding: '7px 8px', textAlign: 'left', color: '#5C6770' }}>รายละเอียด</th>
                    <th style={{ padding: '7px 8px', width: 120, color: '#5C6770' }}>จำนวนเงิน</th>
                    <th style={{ padding: '7px 8px', width: 96, color: '#5C6770' }}>ฝั่ง</th>
                    <th style={{ padding: '7px 8px', width: 30 }} />
                  </tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #F1F4F6' }}>
                        <td style={{ padding: '4px 6px' }}><input value={r.no} onChange={(e) => setRow(i, { no: Number(e.target.value) || 0 })} style={{ ...field, padding: '5px 6px', width: 36, textAlign: 'center' }} /></td>
                        <td style={{ padding: '4px 6px' }}><input value={r.detail} onChange={(e) => setRow(i, { detail: e.target.value })} style={{ ...field, padding: '5px 7px', width: '100%' }} /></td>
                        <td style={{ padding: '4px 6px' }}><input value={r.amount} onChange={(e) => setRow(i, { amount: Number(String(e.target.value).replace(/,/g, '')) || 0 })} style={{ ...field, padding: '5px 7px', width: 110, textAlign: 'right' }} /></td>
                        <td style={{ padding: '4px 6px' }}><select value={r.side} onChange={(e) => setRow(i, { side: e.target.value as 'customer' | 'contractor' })} style={{ ...field, padding: '5px 6px', width: 90 }}><option value="customer">ลูกค้า</option><option value="contractor">ช่าง</option></select></td>
                        <td style={{ padding: '4px 6px', textAlign: 'center' }}><button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: '#C24036', cursor: 'pointer', fontSize: 14 }}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid #EEF1F4' }}>
          <button onClick={onClose} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ยกเลิก</button>
          <button onClick={confirm} disabled={!rows.length || !!busy} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: rows.length && !busy ? '#2E7D55' : '#C4CCD3', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: rows.length && !busy ? 'pointer' : 'not-allowed' }}>✓ สร้างงวดงานทั้งหมด ({rows.length})</button>
        </div>
      </div>
    </div>
  )
}
