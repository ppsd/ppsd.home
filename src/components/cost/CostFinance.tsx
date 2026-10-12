import { useState } from 'react'
import { useApp } from '../../store'
import BoqTab from './BoqTab'
import CashflowTab from './CashflowTab'
import LedgerTab from './LedgerTab'
import { KeepAlive } from '../shared/ModalShell'

const card: React.CSSProperties = { background: '#fff', border: '1px solid #E1E5EA', borderRadius: 13, padding: 40, textAlign: 'center', color: '#94A0A8' }

export default function CostFinance() {
  const { user } = useApp()
  const allowed = user?.role === 'admin' || user?.role === 'accounting' || !!user?.isManager
  const [tab, setTab] = useState<'boq' | 'cashflow' | 'ledger'>('boq')
  const [seen, setSeen] = useState<string[]>([])
  if (!seen.includes(tab)) setSeen([...seen, tab])

  if (!allowed) return <div style={{ maxWidth: 1320, margin: '0 auto', ...card }}>ส่วนต้นทุน/การเงินเปิดให้เฉพาะผู้ดูแล บัญชี และผู้จัดการ</div>

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 2, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 11, padding: '6px 8px', flexWrap: 'wrap' }}>
        {([['boq', 'BOQ / ตีราคา'], ['cashflow', 'กระแสเงินสด (Cash Flow)'], ['ledger', 'บัญชีรับ-จ่าย']] as const).map(([id, label]) => (
          <div key={id} onClick={() => setTab(id)} style={{ fontSize: 13, fontWeight: tab === id ? 600 : 500, color: tab === id ? '#fff' : '#5C6770', background: tab === id ? '#30506A' : 'transparent', padding: '7px 16px', borderRadius: 7, cursor: 'pointer' }}>{label}</div>
        ))}
      </div>
      {/* แท็บที่เปิดแล้วเก็บไว้เบื้องหลัง — ฟอร์ม/modal ที่กรอกค้างไว้ไม่หายตอนสลับแท็บ */}
      {([['boq', <BoqTab />], ['cashflow', <CashflowTab />], ['ledger', <LedgerTab />]] as const)
        .filter(([id]) => id === tab || seen.includes(id))
        .map(([id, el]) => <KeepAlive key={id} active={id === tab} onShow={() => setTab(id)}>{el}</KeepAlive>)}
    </div>
  )
}
