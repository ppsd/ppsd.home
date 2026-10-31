import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../api'
import ModalShell from '../shared/ModalShell'

// ตรวจเอกสารด้วย AI (เน้นสัญญาที่ให้ลูกค้าอ่านและเซ็น) — ทุกแผนกใช้ได้ · ส่งทาง LINE ได้ด้วย (ส่งไฟล์ให้บอท หรือพิมพ์ "ตรวจเอกสาร")
//  แท็บ ตรวจเอกสาร: ส่งไฟล์ Word/PDF/รูป หรือวางข้อความ → ผลแยกหมวด → กด ใช้/ข้าม ทีละจุด → คัดลอกข้อความที่แก้แล้ว
//  แท็บ แบบมาตรฐาน: แบบกลางของบริษัท (กฎ + ข้อความตัวอย่าง) ให้ AI ใช้เทียบว่าขาดหัวข้อไหน/ใช้คำตามที่กำหนดไหม
type IssueType = 'typo' | 'wording' | 'sentence' | 'consistency' | 'missing'
interface Issue { type: IssueType; severity: 'high' | 'medium' | 'low'; quote: string; suggest: string; reason: string; pos: number; status: '' | 'accepted' | 'ignored' }
interface Review {
  id: number; at: string; by: string; source: string; name: string; mime: string; size: number; template_id: number | null; template_name: string
  status: 'กำลังตรวจ' | 'เสร็จ' | 'ผิดพลาด'; error: string | null; summary: string | null; cost_usd: number | null; has_file: boolean; has_text: boolean
  counts: Record<IssueType, number>; total: number; high: number; issues?: Issue[]; text?: string
}
interface Template { id: number; name: string; dept: string; rules: string; ref_text: string; created_by: string; updated_by: string; updated: string }

const TYPES: { key: IssueType; label: string; c: string; bg: string }[] = [
  { key: 'typo', label: 'คำผิด', c: '#C24036', bg: '#FBEEEC' },
  { key: 'wording', label: 'คำแปลก/ไม่เป็นทางการ', c: '#C0852C', bg: '#F8EEDC' },
  { key: 'sentence', label: 'ประโยคไม่เหมาะ', c: '#9A7B12', bg: '#F6F0D2' },
  { key: 'consistency', label: 'ข้อมูลไม่ตรงกัน', c: '#7A4FA0', bg: '#F0E9F6' },
  { key: 'missing', label: 'ขาดหัวข้อ', c: '#30506A', bg: '#E9EFF3' },
]
const typeOf = (k: IssueType) => TYPES.find((t) => t.key === k) || TYPES[2]
const SEV_LABEL = { high: 'ต้องแก้', medium: 'ควรแก้', low: 'แนะนำ' }
const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13, color: '#1C2730', border: '1px solid #D2DAE1', borderRadius: 9, padding: '8px 10px', outline: 'none', background: '#fff' }
const lbl: React.CSSProperties = { fontSize: 12, color: '#5C6770', marginBottom: 4 }
const card: React.CSSProperties = { background: '#fff', border: '1px solid #E3E8EC', borderRadius: 12 }
const btn2: React.CSSProperties = { fontFamily: 'inherit', fontSize: 12.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }
const btn1: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }
const ACCEPT = '.docx,.pdf,.txt,image/*'

/** ข้อความที่แก้แล้ว = แทนที่ทุกจุดที่กด "ใช้" (เฉพาะที่หาตำแหน่งเจอ · ทำจากท้ายไปหน้า ไม่ให้ตำแหน่งเลื่อน · ทับกันข้าม) */
function applyAccepted(text: string, issues: Issue[]) {
  const picks = issues.filter((i) => i.status === 'accepted' && i.pos >= 0 && i.quote && i.type !== 'missing').sort((a, b) => b.pos - a.pos)
  let out = text, lastStart = Infinity, applied = 0
  for (const i of picks) {
    if (i.pos + i.quote.length > lastStart || out.slice(i.pos, i.pos + i.quote.length) !== i.quote) continue
    out = out.slice(0, i.pos) + i.suggest + out.slice(i.pos + i.quote.length)
    lastStart = i.pos; applied++
  }
  return { out, applied }
}

export default function DocReview() {
  const [tab, setTab] = useState<'review' | 'templates'>('review')
  const [templates, setTemplates] = useState<Template[]>([])
  const loadTpl = () => api.get<Template[]>('/doc-templates').then(setTemplates).catch(() => {})
  useEffect(() => { loadTpl() }, [])
  const tabBtn = (k: typeof tab, label: string) => (
    <button onClick={() => setTab(k)} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, padding: '9px 16px', border: 'none', borderBottom: '2px solid ' + (tab === k ? '#30506A' : 'transparent'), background: 'none', color: tab === k ? '#30506A' : '#5C6770', cursor: 'pointer' }}>{label}</button>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #E3E8EC', alignItems: 'flex-end', flexWrap: 'wrap', gap: 4 }}>
        {tabBtn('review', '📝 ตรวจเอกสาร')}
        {tabBtn('templates', `📚 แบบมาตรฐาน (${templates.length})`)}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#94A0A8', padding: '0 4px 8px' }}>ส่งทาง LINE ได้ด้วย: ส่งไฟล์ Word/PDF ให้บอท หรือพิมพ์ “ตรวจเอกสาร”</span>
      </div>
      <div style={{ display: tab === 'review' ? 'block' : 'none' }}><ReviewTab templates={templates} /></div>
      <div style={{ display: tab === 'templates' ? 'block' : 'none' }}><TemplatesTab templates={templates} reload={loadTpl} /></div>
    </div>
  )
}

function ReviewTab({ templates }: { templates: Template[] }) {
  const [rows, setRows] = useState<Review[]>([])
  const [canAll, setCanAll] = useState(false)
  const [all, setAll] = useState(false)
  const [sel, setSel] = useState<number | null>(null)
  const [tplId, setTplId] = useState('')
  const [paste, setPaste] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const load = () => api.get<{ rows: Review[]; can_see_all: boolean }>('/doc-reviews' + (all ? '?all=1' : '')).then((r) => { setRows(r.rows); setCanAll(r.can_see_all) }).catch((e) => setErr((e as Error).message))
  useEffect(() => { load() /* eslint-disable-next-line */ }, [all])
  // มีรายการที่กำลังตรวจ → ถามซ้ำทุก 4 วิ
  const pending = rows.some((r) => r.status === 'กำลังตรวจ')
  useEffect(() => { if (!pending) return; const t = setInterval(load, 4000); return () => clearInterval(t) /* eslint-disable-next-line */ }, [pending, all])

  const started = (id: number) => { setSel(id); setPaste(''); load() }
  const upload = async (f: File) => {
    setBusy(true); setErr('')
    try {
      const q = new URLSearchParams({ name: f.name, template_id: tplId })
      const r = await api.uploadRaw<{ id: number }>('/doc-reviews/file?' + q.toString(), f)
      started(r.id)
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }
  const sendText = async () => {
    setBusy(true); setErr('')
    try { started((await api.post<{ id: number }>('/doc-reviews/text', { text: paste, template_id: tplId || null, name: paste.trim().split('\n')[0].slice(0, 60) })).id) }
    catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  const [drag, setDrag] = useState(false)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) minmax(0, 1fr)', gap: 14, alignItems: 'start' }} className="docrev-grid">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1C2730' }}>ส่งเอกสารให้ตรวจ</div>
          <div>
            <div style={lbl}>เทียบกับแบบมาตรฐาน</div>
            <select style={field} value={tplId} onChange={(e) => setTplId(e.target.value)}>
              <option value="">— ตรวจทั่วไป (ไม่เทียบแบบ) —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.dept ? ` · ${t.dept}` : ''}</option>)}
            </select>
          </div>
          <div onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) upload(f) }}
            onClick={() => !busy && fileRef.current?.click()}
            style={{ border: '2px dashed ' + (drag ? '#30506A' : '#C9D3DB'), background: drag ? '#EEF3F7' : '#FAFBFC', borderRadius: 10, padding: '18px 10px', textAlign: 'center', cursor: busy ? 'default' : 'pointer' }}>
            <div style={{ fontSize: 22 }}>📄</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#30506A' }}>{busy ? 'กำลังส่ง…' : 'เลือกไฟล์ หรือลากมาวาง'}</div>
            <div style={{ fontSize: 11.5, color: '#94A0A8' }}>Word (.docx) · PDF · รูป · ไม่เกิน 30 MB</div>
            <input ref={fileRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f) }} />
          </div>
          <div style={{ fontSize: 11.5, color: '#94A0A8', textAlign: 'center' }}>— หรือวางข้อความ —</div>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={5} placeholder="วางข้อความสัญญา/จดหมายที่ต้องการตรวจ" style={{ ...field, resize: 'vertical', lineHeight: 1.55 }} />
          <button onClick={sendText} disabled={busy || paste.trim().length < 20} style={{ ...btn1, opacity: busy || paste.trim().length < 20 ? 0.5 : 1 }}>ตรวจข้อความนี้</button>
          {err && <div style={{ fontSize: 12.5, color: '#C24036' }}>✗ {err}</div>}
          <div style={{ fontSize: 11, color: '#94A0A8', lineHeight: 1.5 }}>ℹ️ AI ตรวจภาษาและความสอดคล้องภายในเอกสาร ไม่ใช่การรับรองทางกฎหมาย · ตัวเลข/ราคา/ชื่อ ยังต้องให้คนตรวจ · เอกสารถูกส่งไปประมวลผลที่ผู้ให้บริการ AI</div>
        </div>

        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #EEF1F4' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1C2730' }}>ประวัติการตรวจ</span>
            {canAll && <label style={{ marginLeft: 'auto', fontSize: 12, color: '#5C6770', display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />ของทุกคน</label>}
          </div>
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {!rows.length && <div style={{ padding: 16, fontSize: 12.5, color: '#94A0A8', textAlign: 'center' }}>ยังไม่มีเอกสารที่ตรวจ</div>}
            {rows.map((r) => (
              <button key={r.id} onClick={() => setSel(r.id)} className="hov-f3f5f7"
                style={{ display: 'block', width: '100%', textAlign: 'left', fontFamily: 'inherit', border: 'none', borderBottom: '1px solid #F1F4F6', padding: '9px 14px', cursor: 'pointer', background: sel === r.id ? '#EEF3F7' : 'transparent' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1C2730', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.source === 'line' ? '💬 ' : ''}{r.name}</div>
                <div style={{ fontSize: 11, color: '#94A0A8', display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                  <span>{r.at.slice(0, 16)}</span>{all && <span>· {r.by}</span>}
                  {r.status === 'กำลังตรวจ' && <span style={{ color: '#C0852C', fontWeight: 600 }}>⏳ กำลังตรวจ</span>}
                  {r.status === 'ผิดพลาด' && <span style={{ color: '#C24036', fontWeight: 600 }}>✗ ไม่สำเร็จ</span>}
                  {r.status === 'เสร็จ' && (r.total ? <span style={{ color: r.high ? '#C24036' : '#5C6770', fontWeight: 600 }}>{r.total} จุด{r.high ? ` · ต้องแก้ ${r.high}` : ''}</span> : <span style={{ color: '#2E7D55', fontWeight: 600 }}>✓ ไม่พบจุดแก้</span>)}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div>{sel ? <ReviewDetail key={sel} id={sel} onChanged={load} onDeleted={() => { setSel(null); load() }} /> : (
        <div style={{ ...card, padding: '40px 20px', textAlign: 'center', color: '#94A0A8', fontSize: 13, lineHeight: 1.8 }}>
          <div style={{ fontSize: 30 }}>📝</div>
          ส่งเอกสารทางซ้าย หรือเลือกจากประวัติ<br />
          AI จะทัก <b style={{ color: '#C24036' }}>คำผิด</b> · <b style={{ color: '#C0852C' }}>คำแปลก</b> · <b style={{ color: '#9A7B12' }}>ประโยคไม่เหมาะ</b> · <b style={{ color: '#7A4FA0' }}>ข้อมูลขัดกัน</b> (เช่น ตัวเลขกับตัวอักษร) · <b style={{ color: '#30506A' }}>หัวข้อที่ขาด</b>
        </div>
      )}</div>
    </div>
  )
}

function ReviewDetail({ id, onChanged, onDeleted }: { id: number; onChanged: () => void; onDeleted: () => void }) {
  const [r, setR] = useState<Review | null>(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<IssueType | ''>('')
  const [hideDone, setHideDone] = useState(false)
  const [focus, setFocus] = useState<number | null>(null)
  const [copied, setCopied] = useState('')
  const load = () => api.get<Review>('/doc-reviews/' + id).then((x) => { setR(x); if (x.status !== 'กำลังตรวจ') onChanged() }).catch((e) => setErr((e as Error).message))
  useEffect(() => { load() /* eslint-disable-next-line */ }, [id])
  useEffect(() => { if (r?.status !== 'กำลังตรวจ') return; const t = setInterval(load, 3000); return () => clearInterval(t) /* eslint-disable-next-line */ }, [r?.status])

  const issues = r?.issues || []
  const shown = issues.map((it, i) => ({ it, i })).filter(({ it }) => (!filter || it.type === filter) && (!hideDone || !it.status))
  const setStatus = async (i: number, status: Issue['status']) => {
    try { setR(await api.put<Review>(`/doc-reviews/${id}/issues/${i}`, { status })) } catch (e) { setErr((e as Error).message) }
  }
  const remove = async () => {
    if (!confirm('ลบรายการตรวจนี้ (รวมไฟล์ต้นฉบับที่เก็บไว้)?')) return
    try { await api.del('/doc-reviews/' + id); onDeleted() } catch (e) { setErr((e as Error).message) }
  }
  const copyFixed = async () => {
    if (!r?.text) return
    const { out, applied } = applyAccepted(r.text, issues)
    try { await navigator.clipboard.writeText(out); setCopied(`คัดลอกแล้ว (แก้ ${applied} จุด) — วางในเอกสาร Word ได้เลย`) } catch { setCopied('คัดลอกไม่สำเร็จ — เบราว์เซอร์ไม่อนุญาต') }
    setTimeout(() => setCopied(''), 5000)
  }
  // ข้อความเอกสาร + ไฮไลต์จุดที่ทัก (เฉพาะที่หาตำแหน่งเจอ ไม่ทับกัน)
  const segments = useMemo(() => {
    const text = r?.text || ''
    if (!text) return []
    const marks = issues.map((it, i) => ({ it, i })).filter(({ it }) => it.pos >= 0 && it.quote).sort((a, b) => a.it.pos - b.it.pos)
    const out: { s: string; i?: number }[] = []
    let at = 0
    for (const m of marks) {
      if (m.it.pos < at) continue
      if (m.it.pos > at) out.push({ s: text.slice(at, m.it.pos) })
      out.push({ s: text.slice(m.it.pos, m.it.pos + m.it.quote.length), i: m.i })
      at = m.it.pos + m.it.quote.length
    }
    if (at < text.length) out.push({ s: text.slice(at) })
    return out
  }, [r?.text, issues])
  const jump = (i: number, where: 'doc' | 'list') => {
    setFocus(i)
    document.getElementById(`drv-${where}-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (err && !r) return <div style={{ ...card, padding: 16, color: '#C24036', fontSize: 13 }}>✗ {err}</div>
  if (!r) return <div style={{ ...card, padding: 16, color: '#94A0A8', fontSize: 13 }}>กำลังโหลด…</div>
  const accepted = issues.filter((i) => i.status === 'accepted').length

  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #EEF1F4', display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1C2730', wordBreak: 'break-word' }}>{r.name}</div>
          <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 2 }}>{r.at.slice(0, 16)} · {r.by}{r.source === 'line' ? ' · ส่งทาง LINE' : ''}{r.template_name ? ` · เทียบแบบ “${r.template_name}”` : ' · ตรวจทั่วไป'}</div>
        </div>
        {r.has_file && <button onClick={() => api.openFile(`/doc-reviews/${id}/file`).catch((e) => setErr((e as Error).message))} className="hov-f3f5f7" style={btn2}>เปิดต้นฉบับ</button>}
        <button onClick={remove} className="hov-f3f5f7" style={{ ...btn2, color: '#C24036', borderColor: '#EFD2CE' }}>ลบ</button>
      </div>

      {r.status === 'กำลังตรวจ' && <div style={{ padding: '40px 20px', textAlign: 'center', color: '#5C6770', fontSize: 13.5 }}>⏳ AI กำลังอ่านและตรวจเอกสาร — ปกติใช้เวลา 1-3 นาที (ไปทำอย่างอื่นก่อนได้ ผลจะอยู่ในประวัติ)</div>}
      {r.status === 'ผิดพลาด' && <div style={{ padding: 16, color: '#C24036', fontSize: 13 }}>✗ ตรวจไม่สำเร็จ: {r.error}</div>}
      {r.status === 'เสร็จ' && (
        <>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #EEF1F4', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {r.summary && <div style={{ fontSize: 13, color: '#1C2730', lineHeight: 1.6 }}>{r.summary}</div>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={() => setFilter('')} style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 600, border: '1px solid ' + (filter === '' ? '#30506A' : '#D2DAE1'), background: filter === '' ? '#30506A' : '#fff', color: filter === '' ? '#fff' : '#5C6770', borderRadius: 20, padding: '4px 11px', cursor: 'pointer' }}>ทั้งหมด {issues.length}</button>
              {TYPES.filter((t) => r.counts[t.key]).map((t) => (
                <button key={t.key} onClick={() => setFilter(filter === t.key ? '' : t.key)} style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 600, border: '1px solid ' + (filter === t.key ? t.c : 'transparent'), background: t.bg, color: t.c, borderRadius: 20, padding: '4px 11px', cursor: 'pointer' }}>{t.label} {r.counts[t.key]}</button>
              ))}
              <label style={{ marginLeft: 'auto', fontSize: 12, color: '#5C6770', display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />ซ่อนที่ตัดสินแล้ว</label>
            </div>
            {r.has_text && issues.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={copyFixed} disabled={!accepted} style={{ ...btn1, fontSize: 12.5, padding: '7px 14px', background: accepted ? '#2E7D55' : '#9DBFAE', cursor: accepted ? 'pointer' : 'default' }}>📋 คัดลอกข้อความที่แก้แล้ว ({accepted} จุด)</button>
                <span style={{ fontSize: 11.5, color: copied ? '#2E7D55' : '#94A0A8' }}>{copied || 'กด “ใช้” ที่จุดที่เห็นด้วยก่อน แล้วคัดลอกไปวางแทนในไฟล์ Word'}</span>
              </div>
            )}
          </div>
          {!issues.length ? <div style={{ padding: '30px 20px', textAlign: 'center', color: '#2E7D55', fontSize: 14, fontWeight: 600 }}>✓ ไม่พบจุดที่ต้องแก้</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: r.has_text ? 'minmax(0, 1.1fr) minmax(0, 1fr)' : '1fr', alignItems: 'start' }} className="docrev-split">
              {r.has_text && (
                <div className="docrev-doc" style={{ borderRight: '1px solid #EEF1F4', padding: '12px 16px', maxHeight: 640, overflowY: 'auto', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.75, color: '#1C2730' }}>
                  {segments.map((s, k) => s.i === undefined ? <Fragment key={k}>{s.s}</Fragment> : (() => {
                    const it = issues[s.i], t = typeOf(it.type)
                    const done = it.status === 'accepted'
                    return <mark key={k} id={`drv-doc-${s.i}`} onClick={() => jump(s.i!, 'list')} title={it.reason}
                      style={{ background: it.status === 'ignored' ? 'transparent' : t.bg, color: it.status === 'ignored' ? 'inherit' : t.c, borderBottom: `2px solid ${it.status === 'ignored' ? '#D2DAE1' : t.c}`, borderRadius: 3, cursor: 'pointer', outline: focus === s.i ? `2px solid ${t.c}` : 'none' }}>
                      {done ? <><s style={{ opacity: 0.55 }}>{s.s}</s>{it.suggest}</> : s.s}
                    </mark>
                  })())}
                </div>
              )}
              <div style={{ padding: '10px 12px', maxHeight: 640, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!shown.length && <div style={{ padding: 14, fontSize: 12.5, color: '#94A0A8', textAlign: 'center' }}>ไม่มีรายการในตัวกรองนี้</div>}
                {shown.map(({ it, i }) => {
                  const t = typeOf(it.type)
                  return (
                    <div key={i} id={`drv-list-${i}`} onClick={() => it.pos >= 0 && jump(i, 'doc')}
                      style={{ border: '1px solid ' + (focus === i ? t.c : '#E3E8EC'), borderLeft: `4px solid ${t.c}`, borderRadius: 9, padding: '9px 11px', background: it.status ? '#FAFBFC' : '#fff', opacity: it.status === 'ignored' ? 0.6 : 1, cursor: it.pos >= 0 ? 'pointer' : 'default' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}>
                        <span style={{ fontWeight: 700, color: t.c, background: t.bg, padding: '1px 8px', borderRadius: 20 }}>{t.label}</span>
                        <span style={{ fontWeight: 600, color: it.severity === 'high' ? '#C24036' : it.severity === 'medium' ? '#B7791F' : '#94A0A8' }}>{SEV_LABEL[it.severity]}</span>
                        {it.quote && it.pos < 0 && r.has_text && <span style={{ color: '#94A0A8' }}>· หาตำแหน่งในเอกสารไม่เจอ</span>}
                        {it.status === 'accepted' && <span style={{ marginLeft: 'auto', color: '#2E7D55', fontWeight: 700 }}>✓ ใช้แล้ว</span>}
                        {it.status === 'ignored' && <span style={{ marginLeft: 'auto', color: '#94A0A8', fontWeight: 700 }}>ข้าม</span>}
                      </div>
                      <div style={{ fontSize: 13, marginTop: 5, lineHeight: 1.55, wordBreak: 'break-word' }}>
                        {it.quote && <span style={{ color: '#C24036', textDecoration: 'line-through', textDecorationColor: '#E9A79F' }}>{it.quote}</span>}
                        {it.quote && it.suggest && <span style={{ color: '#94A0A8' }}> → </span>}
                        {it.suggest && <span style={{ color: '#2E7D55', fontWeight: 600 }}>{it.suggest}</span>}
                      </div>
                      {it.reason && <div style={{ fontSize: 12, color: '#5C6770', marginTop: 3, lineHeight: 1.5 }}>{it.reason}</div>}
                      <div style={{ display: 'flex', gap: 6, marginTop: 7 }} onClick={(e) => e.stopPropagation()}>
                        {it.status !== 'accepted' && it.suggest && it.type !== 'missing' && <button onClick={() => setStatus(i, 'accepted')} style={{ ...btn2, padding: '4px 11px', fontSize: 12, color: '#2E7D55', borderColor: '#CDE3D6', fontWeight: 600 }}>✓ ใช้</button>}
                        {it.status !== 'ignored' && <button onClick={() => setStatus(i, 'ignored')} style={{ ...btn2, padding: '4px 11px', fontSize: 12, color: '#5C6770' }}>ข้าม</button>}
                        {it.status && <button onClick={() => setStatus(i, '')} style={{ ...btn2, padding: '4px 11px', fontSize: 12, color: '#94A0A8' }}>↺ ยกเลิก</button>}
                        {it.suggest && <button onClick={() => navigator.clipboard?.writeText(it.suggest)} title="คัดลอกข้อความที่แนะนำ" style={{ ...btn2, padding: '4px 9px', fontSize: 12, marginLeft: 'auto' }}>คัดลอก</button>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
      {err && r && <div style={{ padding: '8px 16px', fontSize: 12.5, color: '#C24036' }}>✗ {err}</div>}
    </div>
  )
}

function TemplatesTab({ templates, reload }: { templates: Template[]; reload: () => void }) {
  const [edit, setEdit] = useState<Partial<Template> | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const remove = async (t: Template) => {
    if (!confirm(`ลบแบบมาตรฐาน “${t.name}”? (ประวัติการตรวจเดิมไม่หาย)`)) return
    try { await api.del('/doc-templates/' + t.id); reload() } catch (e) { alert((e as Error).message) }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: '#5C6770', lineHeight: 1.6, flex: 1, minWidth: 260 }}>แบบกลางของบริษัทที่ทุกแผนกใช้ร่วมกัน — ใส่ <b>กฎ</b> (เช่น “เรียกลูกค้าว่า ผู้ว่าจ้าง เสมอ”, “ต้องมีข้อการรับประกันโครงสร้าง”) และ/หรือ <b>ข้อความแบบมาตรฐาน</b> (ดึงจากไฟล์ Word/PDF ได้) — AI จะทักเมื่อเอกสารขาดหัวข้อหรือฝ่าฝืนกฎ</div>
        <button onClick={() => setEdit({ name: '', dept: '', rules: '', ref_text: '' })} className="btn-primary" style={btn1}>+ เพิ่มแบบมาตรฐาน</button>
      </div>
      {!templates.length && <div style={{ ...card, padding: '30px 20px', textAlign: 'center', fontSize: 13, color: '#94A0A8' }}>ยังไม่มีแบบมาตรฐาน — ตรวจแบบทั่วไปได้เลย หรือเพิ่มแบบสัญญาของบริษัทเพื่อให้ AI เทียบหัวข้อที่ขาด</div>}
      {templates.map((t) => (
        <div key={t.id} style={{ ...card, padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1C2730' }}>{t.name}</div>
            {t.dept && <span style={{ fontSize: 11, fontWeight: 600, color: '#30506A', background: '#E9EFF3', padding: '2px 9px', borderRadius: 20 }}>{t.dept}</span>}
            <span style={{ fontSize: 11, color: '#94A0A8' }}>แก้ล่าสุด {t.updated?.slice(0, 16)} · {t.updated_by}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button onClick={() => setOpen(open === t.id ? null : t.id)} className="hov-f3f5f7" style={btn2}>{open === t.id ? 'ซ่อน' : 'ดู'}</button>
              <button onClick={() => setEdit(t)} className="hov-f3f5f7" style={btn2}>แก้ไข</button>
              <button onClick={() => remove(t)} className="hov-f3f5f7" style={{ ...btn2, color: '#C24036', borderColor: '#EFD2CE' }}>ลบ</button>
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#5C6770', marginTop: 4 }}>{t.rules ? `กฎ ${t.rules.split('\n').filter((l) => l.trim()).length} ข้อ` : 'ไม่มีกฎ'} · {t.ref_text ? `ข้อความแบบ ${t.ref_text.length.toLocaleString()} ตัวอักษร` : 'ไม่มีข้อความแบบ'}</div>
          {open === t.id && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginTop: 10 }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12.5, lineHeight: 1.6, background: '#F7F9FB', border: '1px solid #EEF1F4', borderRadius: 8, padding: 10, maxHeight: 300, overflowY: 'auto' }}>{t.rules || '—'}</pre>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12.5, lineHeight: 1.6, background: '#F7F9FB', border: '1px solid #EEF1F4', borderRadius: 8, padding: 10, maxHeight: 300, overflowY: 'auto' }}>{t.ref_text || '—'}</pre>
            </div>
          )}
        </div>
      ))}
      {edit && <TemplateModal t={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
    </div>
  )
}

function TemplateModal({ t, onClose, onSaved }: { t: Partial<Template>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: t.name || '', dept: t.dept || '', rules: t.rules || '', ref_text: t.ref_text || '' })
  const [busy, setBusy] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const extract = async (file: File) => {
    if (f.ref_text.trim() && !confirm('แทนที่ข้อความแบบเดิมด้วยข้อความจากไฟล์นี้?')) return
    setExtracting(true); setErr('')
    try { const r = await api.uploadRaw<{ text: string }>('/doc-templates/extract?name=' + encodeURIComponent(file.name), file); setF((x) => ({ ...x, ref_text: r.text, name: x.name || file.name.replace(/\.[^.]+$/, '') })) }
    catch (e) { setErr((e as Error).message) }
    setExtracting(false)
    if (fileRef.current) fileRef.current.value = ''
  }
  const save = async () => {
    setBusy(true); setErr('')
    try { if (t.id) await api.put('/doc-templates/' + t.id, f); else await api.post('/doc-templates', f); onSaved() }
    catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  return (
    <ModalShell title={t.id ? 'แก้ไขแบบมาตรฐาน' : 'เพิ่มแบบมาตรฐาน'} sub="ทุกแผนกเห็นและใช้แบบนี้ร่วมกัน" width={860} closeOnBackdrop={false} onClose={onClose}
      footer={<>
        {err && <span style={{ fontSize: 12.5, color: '#C24036', marginRight: 'auto' }}>✗ {err}</span>}
        <button onClick={onClose} className="hov-f3f5f7" style={{ ...btn2, fontSize: 13, color: '#5C6770', padding: '9px 16px' }}>ยกเลิก</button>
        <button onClick={save} disabled={busy} className="btn-primary" style={btn1}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <div><div style={lbl}>ชื่อแบบ *</div><input style={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="เช่น สัญญาจ้างก่อสร้างบ้าน (มาตรฐาน 2569)" /></div>
        <div><div style={lbl}>แผนกเจ้าของ</div><input style={field} value={f.dept} onChange={(e) => setF({ ...f, dept: e.target.value })} placeholder="เช่น ฝ่ายขาย" /></div>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={lbl}>กฎของบริษัท (ข้อละบรรทัด)</div>
        <textarea style={{ ...field, resize: 'vertical', lineHeight: 1.6 }} rows={6} value={f.rules} onChange={(e) => setF({ ...f, rules: e.target.value })}
          placeholder={'เช่น\nเรียกลูกค้าว่า “ผู้ว่าจ้าง” และบริษัทว่า “ผู้รับจ้าง” ตลอดทั้งฉบับ\nจำนวนเงินต้องมีทั้งตัวเลขและตัวอักษร\nต้องมีข้อการรับประกันโครงสร้าง 10 ปี\nห้ามใช้คำว่า “ประมาณ” กับวันส่งมอบงาน'} />
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ ...lbl, marginBottom: 0 }}>ข้อความแบบมาตรฐาน (ใช้เทียบหัวข้อที่ขาด)</div>
          <button onClick={() => fileRef.current?.click()} disabled={extracting} className="hov-f3f5f7" style={{ ...btn2, marginLeft: 'auto', padding: '4px 11px', fontSize: 12 }}>{extracting ? 'กำลังดึงข้อความ…' : '📄 ดึงจากไฟล์ Word/PDF'}</button>
          <input ref={fileRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={(e) => { const x = e.target.files?.[0]; if (x) extract(x) }} />
        </div>
        <textarea style={{ ...field, resize: 'vertical', lineHeight: 1.6 }} rows={12} value={f.ref_text} onChange={(e) => setF({ ...f, ref_text: e.target.value })} placeholder="วางข้อความสัญญาฉบับมาตรฐาน หรือกดดึงจากไฟล์ (PDF ใช้ AI ถอดข้อความ — มีค่าใช้จ่ายเล็กน้อย)" />
        <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 3 }}>{f.ref_text.length.toLocaleString()} / 60,000 ตัวอักษร</div>
      </div>
    </ModalShell>
  )
}
