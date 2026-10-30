import { useEffect, useState } from 'react'
import { api } from '../../api'
import ModalShell from '../shared/ModalShell'

// ดูข้อมูลในไฟล์สำรอง (อ่านอย่างเดียว) — เลือกตาราง → เห็นว่ารายการไหนถูกลบ/ถูกแก้/เหมือนเดิม เทียบกับตอนนี้
// ไม่ทับข้อมูลปัจจุบัน · ปุ่ม "กู้คืนรายการนี้" มีเฉพาะรายการที่ถูกลบไปแล้ว (เพิ่มกลับ ไม่ทับ) และเฉพาะตารางที่ไม่กระทบบัญชีโดยตรง

interface TableInfo { key: string; label: string; restore: boolean; count_backup: number; count_now: number }
type Status = 'same' | 'changed' | 'deleted'
interface Row { id: number; _status: Status; [k: string]: unknown }
interface ListResp { table: string; label: string; restore: boolean; cols: string[]; counts: { same: number; changed: number; deleted: number; added: number }; total: number; rows: Row[] }
interface Detail { table: string; restore: boolean; status: Status; backup: Record<string, unknown>; current: Record<string, unknown> | null; changed: string[] }

const ST: Record<Status, { label: string; c: string; bg: string }> = {
  deleted: { label: 'ถูกลบไปแล้ว', c: '#B23B30', bg: '#FBE7E5' },
  changed: { label: 'ถูกแก้ไข', c: '#9A6B12', bg: '#FBF1DC' },
  same: { label: 'เหมือนเดิม', c: '#5C6770', bg: '#EEF1F4' },
}
const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 600, color: '#5C6770', fontSize: 11.5, textAlign: 'left', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: '#F7F9FB' }
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 12.5, borderTop: '1px solid #F1F4F6', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const chip = (on: boolean): React.CSSProperties => ({ fontFamily: 'inherit', fontSize: 12, fontWeight: on ? 700 : 500, color: on ? '#fff' : '#30506A', background: on ? '#30506A' : '#fff', border: '1px solid ' + (on ? '#30506A' : '#D2DAE1'), borderRadius: 20, padding: '4px 12px', cursor: 'pointer', whiteSpace: 'nowrap' })
const show = (v: unknown) => (v == null || v === '' ? '—' : typeof v === 'number' ? v.toLocaleString('en-US') : String(v))
const PAGE = 100

export default function BackupViewer({ name, date, onClose }: { name: string; date: string; onClose: () => void }) {
  const base = '/backups/' + encodeURIComponent(name)
  const [tables, setTables] = useState<TableInfo[]>([])
  const [table, setTable] = useState('houses')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'' | Status>('')
  const [offset, setOffset] = useState(0)
  const [list, setList] = useState<ListResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => { api.get<{ tables: TableInfo[] }>(base + '/browse').then((r) => setTables(r.tables)).catch((e) => setErr((e as Error).message)) }, [base, reloadKey])
  useEffect(() => {
    setLoading(true); setErr('')
    const p = new URLSearchParams({ q, status, offset: String(offset), limit: String(PAGE) })
    const t = setTimeout(() => {
      api.get<ListResp>(`${base}/browse/${table}?${p}`).then(setList).catch((e) => { setErr((e as Error).message); setList(null) }).finally(() => setLoading(false))
    }, q ? 300 : 0) // พิมพ์ค้นหาแล้วรอหยุดพิมพ์ก่อนค่อยโหลด
    return () => clearTimeout(t)
  }, [base, table, q, status, offset, reloadKey])

  const pickTable = (k: string) => { setTable(k); setStatus(''); setQ(''); setOffset(0) }
  const openRow = async (id: number) => {
    try { setDetail(await api.get<Detail>(`${base}/browse/${table}/${id}`)) } catch (e) { alert((e as Error).message) }
  }
  const restoreRow = async () => {
    if (!detail) return
    const id = detail.backup.id as number
    if (!confirm(`กู้คืนรายการ #${id} จากไฟล์สำรองวันที่ ${date} กลับเข้าระบบ?\n\nเป็นการเพิ่มรายการที่ถูกลบกลับมา — ไม่ทับข้อมูลอื่นที่มีอยู่`)) return
    setBusy(true)
    try {
      const r = await api.post<{ ok: boolean; notes: string[] }>(`${base}/browse/${table}/${id}/restore`)
      alert('กู้คืนสำเร็จ' + (r.notes?.length ? '\n' + r.notes.join('\n') : ''))
      setDetail(null); setReloadKey((k) => k + 1)
    } catch (e) { alert((e as Error).message) }
    setBusy(false)
  }

  const cur = tables.find((t) => t.key === table)
  const c = list?.counts
  return (
    <ModalShell title={`ข้อมูลในไฟล์สำรอง — วันที่ ${date}`} sub="ดูอย่างเดียว เทียบกับข้อมูลตอนนี้ · ไม่ทับข้อมูลปัจจุบัน" width={1200} onClose={onClose} bodyStyle={{ padding: 0 }}>
      <div style={{ display: 'flex', minHeight: 520, flexWrap: 'wrap' }}>
        {/* รายการตาราง */}
        <div style={{ width: 250, flex: '0 0 250px', borderRight: '1px solid #E1E5EA', background: '#FAFBFC', maxHeight: '70vh', overflowY: 'auto' }}>
          {tables.map((t) => (
            <button key={t.key} onClick={() => pickTable(t.key)} className="hov-f3f5f7"
              style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 6, textAlign: 'left', fontFamily: 'inherit', fontSize: 12.5, padding: '8px 12px', border: 'none', borderBottom: '1px solid #EEF1F4', cursor: 'pointer', background: t.key === table ? '#E2E9EF' : 'transparent', color: '#1C2730', fontWeight: t.key === table ? 700 : 500 }}>
              <span style={{ flex: 1 }}>{t.label}{!t.restore && <span title="ดูได้อย่างเดียว (เกี่ยวกับเงิน/บัญชี/บุคคล)" style={{ marginLeft: 4, fontSize: 10.5, color: '#94A0A8' }}>👁</span>}</span>
              <span className="num" title="ในไฟล์สำรอง → ตอนนี้" style={{ fontSize: 11, color: t.count_backup !== t.count_now ? '#9A6B12' : '#94A0A8' }}>{t.count_backup}→{t.count_now}</span>
            </button>
          ))}
        </div>

        {/* แถวในตาราง */}
        <div style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', borderBottom: '1px solid #EEF1F4' }}>
            <input value={q} onChange={(e) => { setQ(e.target.value); setOffset(0) }} placeholder={`ค้นหาใน${cur?.label || ''}…`}
              style={{ fontFamily: 'inherit', fontSize: 13, border: '1px solid #D2DAE1', borderRadius: 8, padding: '6px 10px', minWidth: 200, flex: '1 1 200px', outline: 'none' }} />
            <button style={chip(status === '')} onClick={() => { setStatus(''); setOffset(0) }}>ทั้งหมด</button>
            <button style={chip(status === 'deleted')} onClick={() => { setStatus('deleted'); setOffset(0) }}>ถูกลบไปแล้ว {c ? c.deleted : ''}</button>
            <button style={chip(status === 'changed')} onClick={() => { setStatus('changed'); setOffset(0) }}>ถูกแก้ไข {c ? c.changed : ''}</button>
            <button style={chip(status === 'same')} onClick={() => { setStatus('same'); setOffset(0) }}>เหมือนเดิม {c ? c.same : ''}</button>
            {c && c.added > 0 && <span style={{ fontSize: 11.5, color: '#2E7D55' }}>+ {c.added} รายการใหม่ที่เพิ่มหลังวันที่สำรอง</span>}
          </div>
          {err && <div style={{ margin: 14, fontSize: 12.5, color: '#C24036', background: '#FBEEEC', borderRadius: 8, padding: '8px 12px' }}>{err}</div>}
          <div style={{ flex: 1, overflow: 'auto', maxHeight: '62vh' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>#</th>
                {list?.cols.map((col) => <th key={col} style={th}>{col}</th>)}
                <th style={th}>สถานะเทียบตอนนี้</th>
              </tr></thead>
              <tbody>
                {loading && !list && <tr><td colSpan={9} style={{ ...td, padding: 30, textAlign: 'center', color: '#94A0A8' }}>กำลังโหลด…</td></tr>}
                {list && list.rows.length === 0 && <tr><td colSpan={list.cols.length + 2} style={{ ...td, padding: 30, textAlign: 'center', color: '#94A0A8' }}>ไม่มีรายการ</td></tr>}
                {list?.rows.map((r) => (
                  <tr key={r.id} onClick={() => openRow(r.id)} className="hov-fafbfc" style={{ cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
                    <td className="num" style={{ ...td, color: '#94A0A8' }}>{r.id}</td>
                    {list.cols.map((col) => <td key={col} style={td} title={show(r[col])}>{show(r[col])}</td>)}
                    <td style={td}><span style={{ fontSize: 11, fontWeight: 600, color: ST[r._status].c, background: ST[r._status].bg, padding: '2px 9px', borderRadius: 20 }}>{ST[r._status].label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list && list.total > PAGE && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', padding: '8px 14px', borderTop: '1px solid #EEF1F4', fontSize: 12.5, color: '#5C6770' }}>
              {offset + 1}–{Math.min(offset + PAGE, list.total)} จาก {list.total}
              <button style={chip(false)} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>‹ ก่อนหน้า</button>
              <button style={chip(false)} disabled={offset + PAGE >= list.total} onClick={() => setOffset(offset + PAGE)}>ถัดไป ›</button>
            </div>
          )}
        </div>
      </div>

      {/* รายละเอียดรายการ: ค่าในไฟล์สำรอง vs ตอนนี้ */}
      {detail && (
        <ModalShell title={`${cur?.label || detail.table} #${String(detail.backup.id)}`} sub={<span style={{ color: ST[detail.status].c, fontWeight: 600 }}>{ST[detail.status].label}</span>}
          width={820} onClose={() => setDetail(null)} zIndex={60}
          footer={<>
            {detail.table === 'files' && <button onClick={() => api.openFile(`${base}/file/${String(detail.backup.id)}`).catch((e) => alert((e as Error).message))} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 14px', cursor: 'pointer' }}>⬇ ดาวน์โหลดไฟล์จากชุดสำรอง</button>}
            {detail.status === 'deleted' && detail.restore && <button onClick={restoreRow} disabled={busy} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'กำลังกู้คืน…' : '↩ กู้คืนรายการนี้'}</button>}
            {detail.status === 'deleted' && !detail.restore && <span style={{ fontSize: 12, color: '#5C6770' }}>รายการเกี่ยวกับเงิน/บัญชี — ดูค่าจากที่นี่แล้วบันทึกใหม่ผ่านหน้าปกติ</span>}
            <button onClick={() => setDetail(null)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>ปิด</button>
          </>}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>
              <th style={{ ...th, position: 'static' }}>ช่อง</th>
              <th style={{ ...th, position: 'static' }}>ในไฟล์สำรอง ({date})</th>
              <th style={{ ...th, position: 'static' }}>ตอนนี้</th>
            </tr></thead>
            <tbody>
              {Object.keys(detail.backup).map((k) => {
                const diff = detail.changed.includes(k)
                return (
                  <tr key={k} style={{ background: diff ? '#FFF8E6' : undefined }}>
                    <td style={{ ...td, color: '#5C6770', fontWeight: diff ? 700 : 500, whiteSpace: 'nowrap' }}>{k}</td>
                    <td style={{ ...td, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxWidth: 330 }}>{show(detail.backup[k])}</td>
                    <td style={{ ...td, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxWidth: 330, color: detail.current ? '#1C2730' : '#B23B30' }}>{detail.current ? show(detail.current[k]) : '(ถูกลบแล้ว)'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </ModalShell>
      )}
    </ModalShell>
  )
}
