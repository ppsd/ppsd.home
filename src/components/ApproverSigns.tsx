import type { Approval } from '../store'

// บล็อกลายเซ็นมาตรฐานของเอกสารอนุมัติทุกใบ: ผู้จัดทำ/ผู้สั่ง 1 + ผู้ตรวจสอบ 1 + ผู้อนุมัติ 3 ช่อง (รวม 5)
// 3 ช่องผู้อนุมัติดึงชื่อ/ลายเซ็น/วันที่จริงจากผู้ที่กดอนุมัติในระบบ (approval.approvals) — ว่างไว้ถ้ายังไม่อนุมัติ
export default function ApproverSigns({ approval, makerLabel = 'ผู้จัดทำ', makerName, makerSig, makerDate, checker = true }: {
  approval?: Approval
  makerLabel?: string
  makerName?: string | null
  makerSig?: string | null
  makerDate?: string | null
  checker?: boolean
}) {
  const appr = approval?.approvals || []
  const slots: { label: string; name?: string | null; sig?: string | null; date?: string | null }[] = [
    { label: makerLabel, name: makerName, sig: makerSig, date: makerDate },
    ...(checker ? [{ label: 'ผู้ตรวจสอบ', name: '', sig: null, date: '' }] : []),
    ...[0, 1, 2].map((i) => ({ label: `ผู้อนุมัติคนที่ ${i + 1}`, name: appr[i]?.approver, sig: appr[i]?.sig, date: appr[i]?.date })),
  ]
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 30, fontSize: 10.5 }}>
      {slots.map((s, i) => (
        <div key={i} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ height: 38, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>{s.sig ? <img src={s.sig} alt="" style={{ maxHeight: 36, maxWidth: 120, objectFit: 'contain' }} /> : null}</div>
          <div style={{ borderTop: '1px dotted #666', margin: '0 4px 5px' }} />
          <div style={{ lineHeight: 1.2 }}>ลงชื่อ {s.label}</div>
          <div style={{ color: '#5C6770', minHeight: 13 }}>{s.name || ''}</div>
          <div style={{ fontSize: 9.5, color: '#94A0A8', marginTop: 2 }}>{s.date || 'วันที่ ..../..../....'}</div>
        </div>
      ))}
    </div>
  )
}
