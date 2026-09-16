// ===== สรุปยอดเงินแบบเดียวกันทั้งระบบ (PR / PO / เงินสดย่อย): ยอดสินค้า − ส่วนลด → ก่อน VAT / VAT 7% / รวมทั้งสิ้น =====
// vat_mode: 'none' = ไม่มี VAT · 'incl' = ราคาที่กรอกรวม VAT แล้ว (ถอด 7/107) · 'excl' = ราคายังไม่รวม VAT (บวก 7%)
export const VAT_RATE = 0.07
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
export function moneySummary({ subtotal, discount, vat_mode }) {
  const sub = r2(subtotal), disc = Math.min(sub, Math.max(0, r2(discount)))
  const base = r2(sub - disc)
  const mode = ['none', 'incl', 'excl'].includes(vat_mode) ? vat_mode : 'none'
  let before = base, vat = 0, total = base
  if (mode === 'excl') { vat = r2(base * VAT_RATE); total = r2(base + vat) }
  else if (mode === 'incl') { before = r2(base / (1 + VAT_RATE)); vat = r2(base - before); total = base }
  return { subtotal: sub, discount: disc, vat_mode: mode, before_vat: before, vat_amount: vat, total }
}
export const VAT_MODE_LABEL = { none: 'ไม่มี VAT', incl: 'ราคารวม VAT แล้ว', excl: 'ราคาก่อน VAT (+7%)' }
