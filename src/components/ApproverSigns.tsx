import type { Approval } from '../store'

// ช่องลายเซ็นผู้อนุมัติหลายคน (ตามจำนวนที่ตั้ง) — ดึงชื่อ/ลายเซ็น/วันที่จริงจากการอนุมัติในระบบ
export default function ApproverSigns({ approval, firstLabel }: { approval?: Approval; firstLabel?: string }) {
  const req = approval?.required || 3
  const appr = approval?.approvals || []
  const slots = Array.from({ length: req }, (_, i) => appr[i])
  return (
    <div style={{ display: 'flex', justifyContent: 'space-around', gap: 20, marginTop: 34, fontSize: 11.5 }}>
      {slots.map((a, i) => (
        <div key={i} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ height: 40, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>{a?.sig ? <img src={a.sig} alt="" style={{ maxHeight: 38, maxWidth: 150, objectFit: 'contain' }} /> : null}</div>
          <div style={{ borderTop: '1px dotted #666', margin: '0 8px 5px' }} />
          <div>{i === 0 && firstLabel ? firstLabel : `ผู้อนุมัติคนที่ ${i + 1}`}</div>
          <div style={{ color: '#5C6770' }}>{a?.approver || ''}</div>
          <div style={{ fontSize: 10, color: '#94A0A8', marginTop: 2 }}>{a?.date || 'วันที่ ..../..../....'}</div>
        </div>
      ))}
    </div>
  )
}
