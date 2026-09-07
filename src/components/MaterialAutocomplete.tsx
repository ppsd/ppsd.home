import { useState } from 'react'
import type { ApiMaterialPrice } from '../store'
import { normMat, baht } from '../data'

// ช่องกรอกชื่อวัสดุแบบเดาคำ — ดึงรายการจากฐานราคากลาง (material_prices) ให้เลือก
export default function MaterialAutocomplete({ value, onChange, onSelect, materials, style, placeholder }: {
  value: string
  onChange: (v: string) => void
  onSelect?: (m: ApiMaterialPrice) => void
  materials: ApiMaterialPrice[]
  style?: React.CSSProperties
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const q = value.trim()
  const nq = normMat(q)
  const sug = q.length >= 1
    ? materials
        .filter((m) => m.name.toLowerCase().includes(q.toLowerCase()) || normMat(m.name).includes(nq))
        .sort((a, b) => (b.po_count || 0) - (a.po_count || 0) || (a.name.length - b.name.length))
        .slice(0, 8)
    : []
  const pick = (m: ApiMaterialPrice) => { onChange(m.name); onSelect?.(m); setOpen(false) }

  return (
    <div style={{ position: 'relative' }}>
      <input
        style={{ ...style, width: '100%', boxSizing: 'border-box' }}
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHi(0) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !sug.length) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, sug.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); pick(sug[hi]) }
          else if (e.key === 'Escape') setOpen(false)
        }}
        autoComplete="off"
      />
      {open && sug.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40, background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, marginTop: 3, boxShadow: '0 12px 30px rgba(20,30,40,.16)', maxHeight: 280, overflowY: 'auto' }}>
          {sug.map((m, i) => (
            <div key={m.id}
              onMouseDown={(e) => { e.preventDefault(); pick(m) }}
              onMouseEnter={() => setHi(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px', cursor: 'pointer', background: i === hi ? '#EEF3F7' : '#fff', borderBottom: i < sug.length - 1 ? '1px solid #F1F4F6' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#1C2730', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                <div style={{ fontSize: 11, color: '#94A0A8' }}>ราคากลาง {baht(m.central)}{m.unit ? `/${m.unit}` : ''}{m.po_count ? ` · เคยซื้อ ${m.po_count} ครั้ง` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
