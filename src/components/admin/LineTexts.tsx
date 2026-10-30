import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../api'

// แก้ข้อความที่บอท LINE ส่ง (แอดมิน) — เลือกข้อความ → แก้ → ดูตัวอย่าง → บันทึก · คืนค่าตั้งต้นได้ · ส่งทดสอบเข้า LINE ของตัวเอง
// ช่องข้อมูล {ชื่อ} ระบบเติมค่าจริงตอนส่ง (กดชิปเพื่อแทรก)
interface Var { name: string; desc: string; sample: string }
interface Row { key: string; group: string; label: string; vars: Var[]; default: string; text: string; custom: boolean }

const MAX = 4500
const fill = (t: string, vars: Var[]) => t.replace(/\{(\w+)\}/g, (m, k) => vars.find((v) => v.name === k)?.sample ?? m)
const unknownVars = (t: string, vars: Var[]) => [...new Set([...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => !vars.some((v) => v.name === k)))]

export default function LineTexts() {
  const [rows, setRows] = useState<Row[]>([])
  const [sel, setSel] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const load = () => api.get<Row[]>('/line-texts').then((r) => { setRows(r); if (!sel && r[0]) { setSel(r[0].key); setDraft(r[0].text) } }).catch((e) => setMsg({ ok: false, text: (e as Error).message }))
  useEffect(() => { load() /* eslint-disable-next-line */ }, [])
  const cur = rows.find((r) => r.key === sel)
  const groups = useMemo(() => [...new Set(rows.map((r) => r.group))], [rows])
  const dirty = !!cur && draft !== cur.text
  const pick = (r: Row) => {
    if (dirty && !confirm('ข้อความที่แก้ยังไม่ได้บันทึก — ทิ้งการแก้ไข?')) return
    setSel(r.key); setDraft(r.text); setMsg(null)
  }
  const insertVar = (name: string) => {
    const el = ta.current
    const token = `{${name}}`
    if (!el) { setDraft((d) => d + token); return }
    const s = el.selectionStart ?? draft.length, e = el.selectionEnd ?? draft.length
    const next = draft.slice(0, s) + token + draft.slice(e)
    setDraft(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length) })
  }
  const save = async (text: string) => {
    if (!cur) return
    setBusy(true); setMsg(null)
    try {
      const r = await api.put<Row>('/line-texts/' + encodeURIComponent(cur.key), { text })
      setRows((rs) => rs.map((x) => (x.key === r.key ? r : x))); setDraft(r.text)
      setMsg({ ok: true, text: r.custom ? 'บันทึกแล้ว — ข้อความใหม่ใช้ทันที' : 'คืนค่าข้อความตั้งต้นแล้ว' })
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
    setBusy(false)
  }
  const test = async () => {
    if (!cur) return
    setBusy(true); setMsg(null)
    try { await api.post('/line-texts/' + encodeURIComponent(cur.key) + '/test', { text: draft }); setMsg({ ok: true, text: 'ส่งตัวอย่างเข้า LINE ของคุณแล้ว — เช็คในแชทบอท' }) }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
    setBusy(false)
  }
  const bad = cur ? unknownVars(draft, cur.vars) : []

  return (
    <div style={{ background: '#fff', border: '1px solid #CDE3D6', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid #DFEEE5', fontSize: 14, fontWeight: 600, color: '#2E7D55', background: '#F2F8F4' }}>
        ✏️ ข้อความที่บอท LINE ส่ง
        <span style={{ fontSize: 12, fontWeight: 500, color: '#5C6770', marginLeft: 8 }}>แก้แล้วใช้ทันที ไม่ต้องรีสตาร์ต · ช่อง {'{ชื่อ}'} ระบบเติมค่าจริงให้ตอนส่ง</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', minHeight: 420 }}>
        <div style={{ width: 290, flex: '1 1 260px', maxWidth: 340, borderRight: '1px solid #EEF1F4', maxHeight: 620, overflowY: 'auto' }}>
          {groups.map((g) => (
            <div key={g}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#94A0A8', padding: '10px 14px 4px' }}>{g}</div>
              {rows.filter((r) => r.group === g).map((r) => (
                <button key={r.key} onClick={() => pick(r)} className="hov-f3f5f7"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', fontFamily: 'inherit', fontSize: 12.5, padding: '7px 14px', border: 'none', cursor: 'pointer', background: r.key === sel ? '#E2F1EA' : 'transparent', color: '#1C2730', fontWeight: r.key === sel ? 700 : 500 }}>
                  <span style={{ flex: 1 }}>{r.label}</span>
                  {r.custom && <span title="แก้จากค่าตั้งต้นแล้ว" style={{ fontSize: 10, fontWeight: 700, color: '#B7791F', background: '#F6ECD6', padding: '1px 7px', borderRadius: 20 }}>แก้แล้ว</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
        {cur && (
          <div style={{ flex: '3 1 420px', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1C2730' }}>{cur.label} <span style={{ fontSize: 11.5, fontWeight: 500, color: '#94A0A8' }}>· {cur.group}</span></div>
            {cur.vars.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#5C6770' }}>แทรกช่องข้อมูล:</span>
                {cur.vars.map((v) => (
                  <button key={v.name} onClick={() => insertVar(v.name)} title={`${v.desc} · ตัวอย่าง: ${v.sample}`}
                    style={{ fontFamily: 'monospace', fontSize: 12, color: '#30506A', background: '#E2E9EF', border: 'none', borderRadius: 7, padding: '3px 9px', cursor: 'pointer' }}>{'{' + v.name + '}'} <span style={{ fontFamily: 'inherit', color: '#5C6770' }}>{v.desc}</span></button>
                ))}
              </div>
            )}
            <textarea ref={ta} value={draft} onChange={(e) => setDraft(e.target.value)} rows={10} maxLength={MAX}
              style={{ fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6, color: '#1C2730', border: '1px solid ' + (dirty ? '#C0852C' : '#D2DAE1'), borderRadius: 9, padding: '10px 12px', outline: 'none', resize: 'vertical' }} />
            <div style={{ fontSize: 11.5, color: '#94A0A8', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span>{draft.length.toLocaleString()} / {MAX.toLocaleString()} ตัวอักษร</span>
              {bad.length > 0 && <span style={{ color: '#C24036' }}>⚠ ช่องที่ระบบไม่รู้จัก: {bad.map((b) => '{' + b + '}').join(' ')} — จะแสดงตามที่พิมพ์</span>}
              {!draft.trim() && <span style={{ color: '#B7791F' }}>ว่าง = ใช้ข้อความตั้งต้น</span>}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#5C6770' }}>ตัวอย่างที่ผู้รับจะเห็น (เติมค่าตัวอย่าง):</div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, background: '#F2F8F4', border: '1px solid #DFEEE5', borderRadius: 14, padding: '10px 14px', maxWidth: 520 }}>{fill(draft.trim() ? draft : cur.default, cur.vars)}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={() => save(draft)} disabled={busy || !dirty} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: dirty ? '#2E7D55' : '#9DBFAE', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: dirty ? 'pointer' : 'default' }}>บันทึก</button>
              {dirty && <button onClick={() => setDraft(cur.text)} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#5C6770', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '9px 14px', cursor: 'pointer' }}>ยกเลิกที่แก้</button>}
              {cur.custom && <button onClick={() => { if (confirm('คืนข้อความนี้เป็นค่าตั้งต้น?')) save('') }} disabled={busy} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 12.5, color: '#B7791F', background: '#fff', border: '1px solid #ECDCB8', borderRadius: 8, padding: '9px 14px', cursor: 'pointer' }}>↺ คืนค่าตั้งต้น</button>}
              <button onClick={test} disabled={busy} title="ส่งข้อความนี้ (เติมค่าตัวอย่าง) เข้า LINE ของคุณเอง" className="hov-f3f5f7" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#2E7D55', background: '#fff', border: '1px solid #CDE3D6', borderRadius: 8, padding: '9px 14px', cursor: 'pointer' }}>📨 ส่งทดสอบเข้า LINE ฉัน</button>
            </div>
            {msg && <div style={{ fontSize: 12.5, color: msg.ok ? '#2E7D55' : '#C24036' }}>{msg.ok ? '✓ ' : '✗ '}{msg.text}</div>}
            {cur.custom && (
              <details style={{ fontSize: 12, color: '#5C6770' }}>
                <summary style={{ cursor: 'pointer' }}>ดูข้อความตั้งต้น</summary>
                <div style={{ whiteSpace: 'pre-wrap', background: '#F7F9FB', border: '1px solid #EEF1F4', borderRadius: 8, padding: '8px 12px', marginTop: 6 }}>{cur.default}</div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
