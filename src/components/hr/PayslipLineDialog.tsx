import { useEffect, useState } from 'react'
import { api } from '../../api'
import { baht } from '../../data'
import ModalShell from '../shared/ModalShell'

// ส่งสลิปเงินเดือนเข้า LINE รายคน (บัญชีกดส่งเอง)
//  - แนบสลิปโอนเงินจากธนาคารของแต่ละคน (รูป JPG/PNG) ไว้ก่อน → กดส่ง = รูปสลิปเงินเดือนเต็มใบ + สลิปโอน เข้า LINE ของคนนั้น
//  - ส่งได้เฉพาะคนที่ทำจ่ายแล้ว (ตัวเลขล็อก) และผูก LINE แล้ว
interface Row {
  code: string; name: string; paid: boolean; net: number; batch_no: string; line: boolean
  transfer: { id: number; name: string; uploaded: string } | null
  sent: { at: string; by: string; ok: number; note: string } | null
}
interface Info { period: string; periodLabel: string; test_mode: string; public_url: boolean; rows: Row[] }

export default function PayslipLineDialog({ period, onClose }: { period: string; onClose: () => void }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [sel, setSel] = useState<string[]>([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [result, setResult] = useState('')
  const load = () => api.get<Info>('/payroll/line-slips?period=' + period).then((r) => { setInfo(r); setErr('') }).catch((e) => setErr((e as Error).message))
  useEffect(() => { load() /* eslint-disable-next-line */ }, [period])
  const can = (r: Row) => r.paid && r.line
  const eligible = (info?.rows || []).filter(can)
  const toggle = (code: string) => setSel((s) => (s.includes(code) ? s.filter((x) => x !== code) : [...s, code]))
  const upload = (r: Row) => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp'
    inp.onchange = async () => {
      const f = inp.files?.[0]; if (!f) return
      setBusy('up:' + r.code)
      try { await api.uploadRaw(`/payroll/transfer-slip?period=${period}&emp_code=${encodeURIComponent(r.code)}&name=${encodeURIComponent(f.name)}`, f); await load() }
      catch (e) { alert((e as Error).message) }
      setBusy('')
    }
    inp.click()
  }
  const removeSlip = async (r: Row) => {
    if (!r.transfer || !window.confirm(`ลบสลิปโอนของ ${r.name}?`)) return
    try { await api.del('/payroll/transfer-slip/' + r.transfer.id); await load() } catch (e) { alert((e as Error).message) }
  }
  const send = async () => {
    if (!info || !sel.length) return
    const noSlip = info.rows.filter((r) => sel.includes(r.code) && !r.transfer).length
    const resend = info.rows.filter((r) => sel.includes(r.code) && r.sent?.ok).length
    const msg = `ส่งสลิปเงินเดือน งวด ${info.periodLabel} เข้า LINE ${sel.length} คน?` +
      (noSlip ? `\n• ${noSlip} คนยังไม่มีสลิปโอน — จะส่งแค่สลิปเงินเดือน` : '') +
      (resend ? `\n• ${resend} คนเคยส่งแล้ว — จะได้ซ้ำอีกครั้ง` : '') +
      (info.test_mode ? `\n\n🧪 โหมดทดสอบเปิดอยู่ — ทุกสลิปจะไปที่ LINE ของ ${info.test_mode} แทน` : '\n\nสลิปมีข้อมูลเงินเดือน ตรวจรายชื่อให้ถูกก่อนส่ง')
    if (!window.confirm(msg)) return
    setBusy('send'); setResult('')
    try {
      const r = await api.post<{ sent: number; results: { code: string; ok: boolean; note: string }[] }>('/payroll/send-line', { period, emp_codes: sel })
      const bad = r.results.filter((x) => !x.ok)
      setResult(`ส่งสำเร็จ ${r.sent}/${r.results.length} คน` + (bad.length ? ` · ไม่สำเร็จ: ${bad.map((b) => `${info.rows.find((x) => x.code === b.code)?.name || b.code} (${b.note})`).join(', ')}` : ''))
      setSel([]); await load()
    } catch (e) { setResult('✗ ' + (e as Error).message) }
    setBusy('')
  }
  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 11.5, fontWeight: 600, color: '#5C6770', textAlign: 'left', borderBottom: '1px solid #E1E5EA', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 12.5, borderBottom: '1px solid #F1F4F6', verticalAlign: 'middle' }
  const chip = (text: string, c: string, bg: string) => <span style={{ fontSize: 11, fontWeight: 600, color: c, background: bg, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>{text}</span>

  return (
    <ModalShell title={`ส่งสลิปเงินเดือนเข้า LINE · ${info?.periodLabel || ''}`} sub="รูปสลิปเงินเดือนเต็มใบ + สลิปโอนเงินของแต่ละคน ส่งเข้า LINE ส่วนตัวของพนักงาน · ส่งได้เฉพาะคนที่ทำจ่ายแล้วและผูก LINE แล้ว" width={860} closeOnBackdrop={false} onClose={onClose}
      footer={<>
        <span style={{ marginRight: 'auto', fontSize: 12.5, color: '#5C6770' }}>เลือก {sel.length} คน</span>
        <button onClick={onClose} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ปิด</button>
        <button onClick={send} disabled={!!busy || !sel.length || !info?.public_url} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: sel.length ? '#2E7D55' : '#9DBFAE', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: sel.length ? 'pointer' : 'default' }}>{busy === 'send' ? 'กำลังส่ง… (คนละ ~3 วิ)' : `📨 ส่งเข้า LINE (${sel.length})`}</button>
      </>}>
      {err && <div style={{ color: '#C24036', fontSize: 13, marginBottom: 10 }}>{err}</div>}
      {info?.test_mode && <div style={{ fontSize: 12.5, color: '#8A6D1F', background: '#FBF4E1', border: '1px solid #ECDCB8', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>🧪 โหมดทดสอบ LINE เปิดอยู่ — สลิปทุกคนจะไปที่ LINE ของ <b>{info.test_mode}</b> แทน (ใช้ดูหน้าตาก่อนส่งจริง) · ปิดได้ที่เมนู LINE</div>}
      {info && !info.public_url && <div style={{ fontSize: 12.5, color: '#C24036', background: '#FBEEEC', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>ยังไม่มีลิงก์สาธารณะ — LINE ดึงรูปไม่ได้ เปิด "ลิงก์สาธารณะอัตโนมัติ" ในเมนู LINE ก่อน</div>}
      {result && <div style={{ fontSize: 12.5, color: result.startsWith('✗') ? '#C24036' : '#2E7D55', background: result.startsWith('✗') ? '#FBEEEC' : '#E7F3EC', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>{result}</div>}
      {info && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 12 }}>
            <button onClick={() => setSel(eligible.map((r) => r.code))} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>เลือกทุกคนที่ส่งได้ ({eligible.length})</button>
            <button onClick={() => setSel(eligible.filter((r) => !r.sent?.ok).map((r) => r.code))} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>เฉพาะคนที่ยังไม่ได้ส่ง</button>
            <button onClick={() => setSel([])} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>ไม่เลือกเลย</button>
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid #E1E5EA', borderRadius: 9 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#F7F9FB' }}>
                <th style={th} /><th style={th}>พนักงาน</th><th style={{ ...th, textAlign: 'right' }}>สุทธิ</th><th style={th}>สถานะ</th><th style={th}>สลิปโอนเงิน</th><th style={th}>ส่งล่าสุด</th>
              </tr></thead>
              <tbody>
                {info.rows.map((r) => (
                  <tr key={r.code} style={{ opacity: can(r) ? 1 : 0.75 }}>
                    <td style={td}><input type="checkbox" disabled={!can(r)} checked={sel.includes(r.code)} onChange={() => toggle(r.code)} /></td>
                    <td style={{ ...td, fontWeight: 500 }}>{r.name}</td>
                    <td className="num" style={{ ...td, textAlign: 'right' }}>{baht(r.net)}</td>
                    <td style={td}>
                      <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                        {r.paid ? chip('จ่ายแล้ว ' + r.batch_no, '#2E7D55', '#E7F3EC') : chip('ยังไม่ทำจ่าย', '#8A6D1F', '#FBF4E1')}
                        {r.line ? chip('LINE ✓', '#2E7D55', '#E7F3EC') : chip('ยังไม่ผูก LINE', '#C24036', '#FBEEEC')}
                      </span>
                    </td>
                    <td style={td}>
                      {r.transfer
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <button onClick={() => api.openFile('/payroll/transfer-slip/' + r.transfer!.id).catch((e) => alert((e as Error).message))} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#EEF3F7', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>🖼 ดูสลิปโอน</button>
                            <button onClick={() => upload(r)} title="เปลี่ยนรูป" style={{ border: 'none', background: 'none', color: '#5C6770', cursor: 'pointer', fontSize: 11.5 }}>เปลี่ยน</button>
                            <button onClick={() => removeSlip(r)} title="ลบ" style={{ border: 'none', background: 'none', color: '#94A0A8', cursor: 'pointer', fontSize: 11.5 }}>✕</button>
                          </span>
                        : <button onClick={() => upload(r)} disabled={busy === 'up:' + r.code} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, color: '#B7791F', background: '#fff', border: '1px solid #ECDCB8', borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}>{busy === 'up:' + r.code ? 'กำลังอัปโหลด…' : '📎 แนบสลิปโอน'}</button>}
                    </td>
                    <td style={{ ...td, fontSize: 11.5, color: r.sent ? (r.sent.ok ? '#2E7D55' : '#C24036') : '#94A0A8' }}>
                      {r.sent ? <>{r.sent.ok ? '✓' : '✗'} {r.sent.at}<div style={{ color: '#94A0A8' }}>{r.sent.note}</div></> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 8 }}>สลิปโอนรับเฉพาะรูป JPG/PNG (PDF ให้แคปหน้าจอเป็นรูป) · แนบได้ทุกเมื่อ ทั้งก่อนและหลังทำจ่าย · คนที่ยังไม่ผูก LINE ขอรหัสผูกให้ได้ที่เมนู LINE → ผู้รับข้อความ/ผูก LINE</div>
        </>
      )}
    </ModalShell>
  )
}
