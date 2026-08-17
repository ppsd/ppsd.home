import { useState } from 'react'
import type { ModalDef } from '../data'
import { fmtMoney } from '../data'

interface ModalProps {
  modal: ModalDef
  onClose: () => void
}

export default function Modal({ modal, onClose }: ModalProps) {
  const [vals, setVals] = useState<string[]>(modal.fields.map((f) => (f.money ? fmtMoney(f.value) : f.value)))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (i: number, v: string) => {
    const f = modal.fields[i]
    const nv = f.money ? fmtMoney(v) : v
    setVals((prev) => prev.map((x, j) => (j === i ? nv : x)))
  }

  const save = async () => {
    if (!modal.onSubmit) {
      onClose()
      return
    }
    if (busy) return // กันกดซ้ำ
    // เช็คช่องที่ต้องกรอก
    const missing = modal.fields.filter((f, i) => f.required && !String(vals[i]).trim()).map((f) => f.label)
    if (missing.length) { setErr('กรุณากรอก: ' + missing.join(', ')); return }
    setBusy(true)
    setErr('')
    try {
      await modal.onSubmit(vals)
      onClose()
    } catch (ex) {
      setErr((ex as Error).message || 'บันทึกไม่สำเร็จ')
      setBusy(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, animation: 'fadeIn .15s ease', padding: 24 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 15, width: 520, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 70px rgba(20,30,40,.3)', animation: 'modalIn .2s ease' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid #EEF1F4' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{modal.title}</div>
            <div style={{ fontSize: 12.5, color: '#94A0A8' }}>{modal.sub}</div>
          </div>
          <button onClick={onClose} className="hov-e7ebef" style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 8, border: 'none', background: '#F3F5F7', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5C6770" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 15 }}>
          {modal.fields.map((f, i) => (
            <div key={i}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: '#3C4750', marginBottom: 6 }}>{f.label}{f.required && <span style={{ color: '#C24036' }}> *</span>}</div>
              {f.options ? (
                <select
                  value={vals[i]}
                  onChange={(e) => set(i, e.target.value)}
                  style={{ width: '100%', fontFamily: 'inherit', fontSize: 13.5, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '10px 13px', outline: 'none', cursor: 'pointer' }}
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="field"
                  type={f.type || 'text'}
                  value={vals[i]}
                  inputMode={f.money ? 'numeric' : undefined}
                  onChange={(e) => set(i, e.target.value)}
                  placeholder={f.ph}
                  style={{ width: '100%', fontFamily: 'inherit', fontSize: 13.5, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '10px 13px', outline: 'none' }}
                />
              )}
              {f.hint && <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 5 }}>{f.hint}</div>}
            </div>
          ))}
          {err && <div style={{ fontSize: 12.5, color: '#C24036', background: '#FBEEEC', borderRadius: 8, padding: '8px 12px' }}>{err}</div>}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '16px 22px', borderTop: '1px solid #EEF1F4', background: '#FAFBFC' }}>
          <button onClick={onClose} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '10px 18px', cursor: 'pointer' }}>ยกเลิก</button>
          <button onClick={save} disabled={busy} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '10px 20px', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
        </div>
      </div>
    </div>
  )
}
