import { useEffect, useState } from 'react'
import { api } from '../../api'
import { baht } from '../../data'

// แผนงวดลูกค้ามาตรฐาน 5 แบบ (ตามเอกสารบริษัท) — ข้อมูลมาจากเซิร์ฟเวอร์ server/installment-plans.js
export interface PlanRow { pct: number; detail: string }
export interface InstallmentPlan { key: string; floors: number; label: string; range: string; rows: PlanRow[] }

let cache: InstallmentPlan[] | null = null
export function useInstallmentPlans() {
  const [plans, setPlans] = useState<InstallmentPlan[]>(cache || [])
  useEffect(() => {
    if (cache) return
    api.get<{ plans: InstallmentPlan[] }>('/installment-plans').then((r) => { cache = r.plans; setPlans(r.plans) }).catch(() => setPlans([]))
  }, [])
  return plans
}

// เลือกแผนจากจำนวนชั้น + ราคา (เหมือนฝั่งเซิร์ฟเวอร์)
export function pickPlanKey(floors: number, total: number): string {
  if (floors <= 1) return '1f'
  if (floors >= 3) return '3f'
  if (total <= 3_000_000) return '2f-3m'
  if (total <= 10_000_000) return '2f-10m'
  return '2f-big'
}

// แตกเป็นงวด — ปัดเป็นบาท งวดสุดท้ายรับเศษ ให้รวมเท่าราคาพอดี
export function buildPlanRows(plan: InstallmentPlan, total: number) {
  const t = Math.round(total || 0)
  let acc = 0
  return plan.rows.map((r, i) => {
    const last = i === plan.rows.length - 1
    const amount = last ? t - acc : Math.round((t * r.pct) / 100)
    acc += amount
    return { no: i + 1, pct: r.pct, detail: `${r.detail} (${r.pct}%)`, amount }
  })
}

const pill = (on: boolean): React.CSSProperties => ({ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: on ? '#fff' : '#5C6770', background: on ? '#30506A' : '#F1F4F6', border: 'none', borderRadius: 20, padding: '5px 14px', cursor: 'pointer' })

// ตัวเลือกแผนงวด: กดจำนวนชั้น → ระบบเลือกช่วงราคาให้ (เปลี่ยนเองได้) + ตัวอย่างยอดแต่ละงวด
export default function InstallmentPlanPicker({ total, value, onChange, preview = true }: { total: number; value: string; onChange: (key: string) => void; preview?: boolean }) {
  const plans = useInstallmentPlans()
  const cur = plans.find((p) => p.key === value)
  const floors = cur?.floors || 2
  useEffect(() => { if (!value && plans.length) onChange(pickPlanKey(2, total)) }, [plans.length]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!plans.length) return <div style={{ fontSize: 12.5, color: '#94A0A8' }}>กำลังโหลดแผนงวด…</div>
  const rows = cur ? buildPlanRows(cur, total) : []
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, color: '#5C6770' }}>แบบบ้าน:</span>
        {[1, 2, 3].map((f) => <button key={f} type="button" onClick={() => onChange(pickPlanKey(f, total))} style={pill(floors === f)}>{f === 1 ? 'ชั้นเดียว' : f + ' ชั้น'}</button>)}
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ fontFamily: 'inherit', fontSize: 12.5, border: '1px solid #D2DAE1', borderRadius: 8, padding: '5px 8px', marginLeft: 'auto' }}>
          {plans.map((p) => <option key={p.key} value={p.key}>{p.label} · {p.rows.length} งวด</option>)}
        </select>
      </div>
      {preview && cur && (
        <div style={{ border: '1px solid #E1E5EA', borderRadius: 10, maxHeight: 260, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ background: '#F7F9FB', position: 'sticky', top: 0 }}>
              <th style={{ padding: '6px 8px', width: 40, color: '#5C6770' }}>งวด</th>
              <th style={{ padding: '6px 8px', width: 44, color: '#5C6770' }}>%</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', color: '#5C6770' }}>ชำระเมื่อ</th>
              <th style={{ padding: '6px 8px', width: 110, textAlign: 'right', color: '#5C6770' }}>จำนวนเงิน</th>
            </tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.no} style={{ borderTop: '1px solid #F1F4F6' }}>
                <td style={{ padding: '5px 8px', textAlign: 'center' }}>{r.no}</td>
                <td style={{ padding: '5px 8px', textAlign: 'center' }}>{r.pct}</td>
                <td style={{ padding: '5px 8px', color: '#3B4650' }}>{cur.rows[r.no - 1].detail}</td>
                <td className="num" style={{ padding: '5px 8px', textAlign: 'right' }}>{baht(r.amount)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
