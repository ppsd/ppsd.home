import { fmtMoney, fmtMoneyDecimal } from '../data'

// A text input that shows live thousands separators (1,000,000) and numeric keypad.
// Stores the formatted string; parse with unMoney() on submit.
// decimal=true → อนุญาตจุดทศนิยม (สูงสุด 2 ตำแหน่ง) เช่น ค่าแรงรายวัน 1,166.67
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
  const fmt = decimal ? fmtMoneyDecimal : fmtMoney
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
