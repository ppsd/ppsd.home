import { fmtMoneyDecimal } from '../data'

// A text input that shows live thousands separators (1,000,000) and numeric keypad.
// Stores the formatted string; parse with unMoney() on submit.
// ทุกช่องเงินใส่จุดทศนิยมได้ (สูงสุด 2 ตำแหน่ง) เช่น 1,166.67 — บางรายการมีเศษสตางค์ · prop decimal คงไว้เพื่อความเข้ากันได้
export default function MoneyInput({
  value,
  onChange,
  style,
  placeholder,
  decimal,
}: {
  value: string
  onChange: (formatted: string) => void
  style?: React.CSSProperties
  placeholder?: string
  decimal?: boolean
}) {
  void decimal
  const fmt = fmtMoneyDecimal
  return (
    <input
      inputMode="decimal"
      value={fmt(value)}
      placeholder={placeholder}
      onChange={(e) => onChange(fmt(e.target.value))}
      style={style}
    />
  )
}
