// Simple pagination control. Renders nothing if everything fits on one page.
export default function Pager({ page, setPage, total, pageSize }: { page: number; setPage: (p: number) => void; total: number; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  const btn: React.CSSProperties = { fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '6px 13px', cursor: 'pointer' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '12px 18px', borderTop: '1px solid #EEF1F4' }}>
      <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} style={{ ...btn, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'default' : 'pointer' }}>‹ ก่อนหน้า</button>
      <span className="num" style={{ fontSize: 12.5, color: '#5C6770' }}>หน้า {page} / {pages}</span>
      <button onClick={() => setPage(Math.min(pages, page + 1))} disabled={page >= pages} style={{ ...btn, opacity: page >= pages ? 0.4 : 1, cursor: page >= pages ? 'default' : 'pointer' }}>ถัดไป ›</button>
    </div>
  )
}
