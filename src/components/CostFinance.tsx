import { useState } from 'react'
import { useApp } from '../store'
import BoqTab from './BoqTab'
import CashflowTab from './CashflowTab'
import LedgerTab from './LedgerTab'

const card: React.CSSProperties = { background: '#fff', border: '1px solid #E1E5EA', borderRadius: 13, padding: 40, textAlign: 'center', color: '#94A0A8' }

export default function CostFinance() {
  const { user } = useApp()
  const allowed = user?.role === 'admin' || user?.role === 'accounting' || !!user?.isManager
  const [tab, setTab] = useState<'boq' | 'cashflow' | 'ledger'>('boq')

  if (!allowed) return <div style={{ maxWidth: 1320, margin: '0 auto', ...card }}>ส่วนต้นทุน/การเงินเปิดให้เฉพาะผู้ดูแล บัญชี และผู้จัดการ</div>

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 2, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 11, padding: '6px 8px', flexWrap: 'wrap' }}>
        {([['boq', 'BOQ / ตีราคา'], ['cashflow', 'กระแสเงินสด (Cash Flow)'], ['ledger', 'บัญชีรับ-จ่าย']] as const).map(([id, label]) => (
          <div key={id} onClick={() => setTab(id)} style={{ fontSize: 13, fontWeight: tab === id ? 600 : 500, color: tab === id ? '#fff' : '#5C6770', background: tab === id ? '#30506A' : 'transparent', padding: '7px 16px', borderRadius: 7, cursor: 'pointer' }}>{label}</div>
        ))}
      </div>
      {tab === 'boq' && <BoqTab />}
      {tab === 'cashflow' && <CashflowTab />}
      {tab === 'ledger' && <LedgerTab />}
    </div>
  )
}
