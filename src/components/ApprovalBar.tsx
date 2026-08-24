import { useState } from 'react'
import { api } from '../api'
import { useApp } from '../store'
import type { Approval } from '../store'

// แถบอนุมัติหลายขั้น ใช้ร่วมกันทุกเอกสาร (PR/PO/ใบจ่ายเงิน/ใบจ่ายค่าใช้จ่าย)
export default function ApprovalBar({ docType, docId, approval, onDone, compact }: { docType: string; docId: number; approval?: Approval; onDone?: () => void; compact?: boolean }) {
  const { user } = useApp()
  const canApprove = user?.role === 'admin' || user?.role === 'accounting' || !!user?.isManager
  const [busy, setBusy] = useState(false)
  const a = approval || { required: 3, count: 0, approvals: [], rejected: false, done: false }
  const act = async (kind: 'approve' | 'reject') => {
    if (kind === 'reject' && !confirm('ปฏิเสธเอกสารนี้?')) return
    setBusy(true)
    try { await api.post('/' + kind + '/' + docType + '/' + docId, {}); onDone?.() }
    catch (e) { alert((e as Error).message) } finally { setBusy(false) }
  }
  const signed = a.approvals.map((x) => x.approver).join(', ')

  if (a.rejected) return <span style={{ fontSize: 11, fontWeight: 600, color: '#C24036', background: '#FBEEEC', padding: '2px 9px', borderRadius: 20 }}>✗ ปฏิเสธ{a.rejectedBy ? ` · ${a.rejectedBy}` : ''}</span>

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
      <span title={signed ? 'อนุมัติแล้ว: ' + signed : ''} style={{ fontSize: 11, fontWeight: 600, color: a.done ? '#2E7D55' : '#B7791F', background: a.done ? '#E2F1EA' : '#F6ECD6', padding: '2px 9px', borderRadius: 20 }}>
        {a.done ? '✓ อนุมัติครบ' : 'รออนุมัติ'} {a.count}/{a.required}
      </span>
      {!compact && a.approvals.length > 0 && <span style={{ fontSize: 10, color: '#94A0A8', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{signed}</span>}
      {canApprove && !a.done && (
        <>
          <button onClick={() => act('approve')} disabled={busy} title="อนุมัติขั้นถัดไป (แต่ละขั้นต้องเป็นคนละคน)" style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>อนุมัติ (ขั้น {a.count + 1})</button>
          <button onClick={() => act('reject')} disabled={busy} style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#C24036', background: '#FBEEEC', border: 'none', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>ปฏิเสธ</button>
        </>
      )}
    </div>
  )
}
