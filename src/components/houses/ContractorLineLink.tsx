// ผูก LINE ให้ช่าง/ผู้รับเหมา — ออกรหัส 6 หลัก (ใช้ได้ 3 วัน) ให้ช่างส่งเข้าแชทบอท PPSD
// ใช้ในแท็บ "ช่าง / ผู้รับเหมา" ของบ้าน และหน้า ความเคลื่อนไหวบ้าน → ช่าง LINE
import { useEffect, useState } from 'react'
import { api } from '../../api'

export interface LinkedContractor { id: number; name: string; vendor_id: number | null; status: string; linked_at: string; linked_by: string; houses: string[] }

/** รายชื่อช่างที่ผูก LINE แล้ว (คนที่ไม่มีสิทธิ์ดู → ได้รายการว่าง) */
export function useLinkedContractors(): [LinkedContractor[] | null, () => void] {
  const [list, setList] = useState<LinkedContractor[] | null>(null)
  const load = () => { api.get<{ linked: LinkedContractor[] }>('/contractor-line').then((r) => setList(r.linked)).catch(() => setList(null)) }
  useEffect(() => { load() }, [])
  return [list, load]
}

export function LinkCodeBox({ name, vendorId, onClose }: { name: string; vendorId?: number | null; onClose: () => void }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    api.post<{ code: string }>('/contractor-line/code', { name, vendor_id: vendorId || null }).then((r) => setCode(r.code)).catch((e) => setErr((e as Error).message))
  }, [name, vendorId])
  const msg = `สวัสดีครับ/ค่ะ คุณ${name}\nเชิญใช้งาน LINE บอท PPSD สำหรับช่าง — รายงานงาน แจ้งปัญหา ขอเบิกงวด ได้ในแชท\n1) เพิ่มเพื่อน LINE บอท PPSD (ขอลิงก์/QR จากทีมงาน)\n2) ส่งรหัสนี้ในแชท: ${code}\n(รหัสใช้ได้ 3 วัน)`
  const copy = async () => { try { await navigator.clipboard.writeText(msg); setCopied(true) } catch { /* เบราว์เซอร์ไม่ให้คัดลอก */ } }
  return (
    <div style={{ padding: '12px 16px', background: '#EEF6F0', borderBottom: '1px solid #D7E9DD', fontSize: 13, color: '#1C2730' }}>
      {err ? <span style={{ color: '#C24036' }}>{err}</span> : !code ? 'กำลังออกรหัส…' : (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>รหัสผูก LINE ของ <b>{name}</b>: <b className="num" style={{ fontSize: 20, letterSpacing: 3, color: '#2E7D55' }}>{code}</b> <span style={{ color: '#5C6770' }}>(ใช้ได้ 3 วัน)</span></div>
          <div style={{ color: '#5C6770', fontSize: 12.5 }}>ให้ช่างเพิ่มเพื่อนบอท PPSD แล้วส่งรหัสนี้ในแชท · ผูกแล้วช่างเห็นเฉพาะบ้านที่ชื่อ “{name}” ถูกจ้าง และไม่เห็นราคาลูกค้า</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button onClick={copy} style={{ fontFamily: 'inherit', fontSize: 12, color: '#2E7D55', background: '#fff', border: '1px solid #BFDCC9', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>{copied ? 'คัดลอกแล้ว ✔' : 'คัดลอกข้อความส่งช่าง'}</button>
            <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: 12, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>ปิด</button>
          </div>
        </div>
      )}
    </div>
  )
}
