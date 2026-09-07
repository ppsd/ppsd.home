// Export tabular data as a REAL Excel file (.xlsx) — numbers stay numbers (sortable/summable).
// SheetJS is loaded lazily (only when exporting) so it doesn't bloat normal page loads.
export async function exportXlsx(filename: string, headers: string[], rows: (string | number)[][], sheetName = 'ข้อมูล') {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : filename + '.xlsx')
}

// Export tabular data as an Excel-friendly CSV (UTF-8 BOM so Thai opens correctly).
export function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const body = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : filename + '.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// A small reusable export button.
export function ExportButton({ onClick, label = 'ส่งออก Excel' }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="hov-f3f5f7"
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500, color: '#2E7D55', background: '#fff', border: '1px solid #CDE3D6', borderRadius: 9, padding: '8px 13px', cursor: 'pointer' }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M5 21h14" /></svg>
      {label}
    </button>
  )
}
