import { fmtMoney } from '../data'

// A text input that shows live thousands separators (1,000,000) and numeric keypad.
// Stores the formatted string; parse with unMoney() on submit.
export default function MoneyInput({
  value,
  onChange,
  style,
  placeholder,
}: {
  value: string
  onChange: (formatted: string) => void
  style?: React.CSSProperties
  placeholder?: string
}) {
  return (
    <input
      inputMode="numeric"
      value={fmtMoney(value)}
      placeholder={placeholder}
      onChange={(e) => onChange(fmtMoney(e.target.value))}
      style={style}
    />
  )
}
