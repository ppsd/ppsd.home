// สรุปยอดเงิน (ตรงกับ server/money.js): ยอดสินค้า − ส่วนลด → ก่อน VAT / VAT 7% / รวมทั้งสิ้น
export type VatMode = 'none' | 'incl' | 'excl'
export const VAT_MODE_LABEL: Record<VatMode, string> = { none: 'ไม่มี VAT', incl: 'ราคารวม VAT แล้ว', excl: 'ราคาก่อน VAT (+7%)' }
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100
export function moneySummary(subtotal: number, discount: number, vat_mode: string) {
  const sub = r2(subtotal), disc = Math.min(sub, Math.max(0, r2(discount)))
  const base = r2(sub - disc)
  const mode: VatMode = vat_mode === 'incl' || vat_mode === 'excl' ? vat_mode : 'none'
  let before = base, vat = 0, total = base
  if (mode === 'excl') { vat = r2(base * 0.07); total = r2(base + vat) }
  else if (mode === 'incl') { before = r2(base / 1.07); vat = r2(base - before); total = base }
  return { subtotal: sub, discount: disc, vat_mode: mode, before_vat: before, vat_amount: vat, total }
}
// อ่านยอดจากเอกสารเก่า/ใหม่ให้เป็นรูปแบบเดียว (ใบเก่าไม่มี vat_mode: ถ้ามี vat_amount ถือว่ารวม VAT แล้ว)
export function docMoney(d: { amount?: number; subtotal?: number | null; discount?: number | null; vat_mode?: string | null; vat_amount?: number | null; before_vat?: number | null }) {
  if (d.vat_mode) return moneySummary(Number(d.subtotal ?? d.amount) || 0, Number(d.discount) || 0, d.vat_mode)
  const total = Number(d.amount) || 0, vat = Number(d.vat_amount) || 0
  return { subtotal: total, discount: 0, vat_mode: (vat > 0 ? 'incl' : 'none') as VatMode, before_vat: r2(total - vat), vat_amount: vat, total }
}
