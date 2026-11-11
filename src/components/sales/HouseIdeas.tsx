import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import ModalShell from '../shared/ModalShell'

// ห้องรวมไอเดียแบบบ้าน — คลังรูปบ้าน/ภาพ 3D/แปลน/โครงการดัง ให้เซลส์กด "ชอบแบบนี้" แล้วส่งให้ AI ออกแบบตาม
//  - รูปทั้งหมดเป็นรูปใบอนุญาตใช้เชิงพาณิชย์ได้ (Flickr / Wikimedia) ระบบเก็บแค่ลิงก์ต้นทาง + เครดิต — ต้องแสดงเครดิตทุกครั้ง
//  - โครงการดังเก็บเป็นลิงก์ไปเว็บต้นทาง · "ค้นรูปเพิ่มจากเน็ต" ค้นได้ไม่จำกัด แล้วกดเก็บเข้าคลัง
export interface Idea {
  id: number; at?: string; by?: string; by_id?: number | null; kind: 'photo' | 'render' | 'plan' | 'link'; title: string; image_url: string; thumb_url: string; page_url: string
  author: string; license: string; license_url: string; source: string; style: string; country: string; note: string; public: number; used: number; seed: number
}
type Found = Omit<Idea, 'id' | 'style' | 'country' | 'note' | 'public' | 'used' | 'seed'> & { saved: boolean }

export const KIND_LABEL: Record<Idea['kind'], string> = { photo: 'รูปบ้าน', render: 'ภาพ 3D', plan: 'แปลนบ้าน', link: 'โครงการดัง / แหล่งไอเดีย' }
const STYLES = ['โมเดิร์น', 'มินิมอล', 'ทรอปิคอล', 'ญี่ปุ่น', 'นอร์ดิก', 'ไทยประยุกต์', 'คลาสสิก', 'ลอฟต์', 'บ้านไม้']
export const MAX_PICK = 3

const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13, color: '#1C2730', border: '1px solid #D2DAE1', borderRadius: 9, padding: '8px 10px', outline: 'none', background: '#fff' }
const lbl: React.CSSProperties = { fontSize: 12, color: '#5C6770', marginBottom: 4 }
const card: React.CSSProperties = { background: '#fff', border: '1px solid #E3E8EC', borderRadius: 12 }
const btn2: React.CSSProperties = { fontFamily: 'inherit', fontSize: 12.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '6px 11px', cursor: 'pointer' }
const btn1: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }
const chip = (on: boolean): React.CSSProperties => ({ ...btn2, padding: '5px 10px', ...(on ? { background: '#30506A', color: '#fff', borderColor: '#30506A' } : {}) })
const link: React.CSSProperties = { color: '#30506A' }

// เครดิตเจ้าของภาพ (ใบอนุญาต CC ต้องแสดงชื่อ + ใบอนุญาต + ที่มา)
export function Credit({ x }: { x: Pick<Idea, 'author' | 'license' | 'license_url' | 'page_url' | 'kind'> }) {
  if (x.kind === 'link' && !x.license) return null
  return (
    <div style={{ fontSize: 11, color: '#94A0A8', lineHeight: 1.4 }}>
      ภาพ: {x.author || 'ไม่ระบุชื่อ'} · {x.license_url ? <a href={x.license_url} target="_blank" rel="noreferrer" style={link}>{x.license}</a> : x.license}
      {x.page_url && x.kind !== 'link' && <> · <a href={x.page_url} target="_blank" rel="noreferrer" style={link}>ที่มา</a></>}
    </div>
  )
}

function Thumb({ src, h = 150, kind }: { src: string; h?: number; kind: Idea['kind'] }) {
  const [bad, setBad] = useState(false)
  if (!src || bad) return <div style={{ height: h, borderRadius: '12px 12px 0 0', background: '#EEF3F7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7D8B95', fontSize: 30 }}>{kind === 'link' ? '🔗' : '🏠'}</div>
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} style={{ width: '100%', height: h, objectFit: kind === 'plan' ? 'contain' : 'cover', background: kind === 'plan' ? '#fff' : '#EEF3F7', borderRadius: '12px 12px 0 0', display: 'block' }} />
}

export default function HouseIdeas({ canEdit, picked, setPicked, onDesign }: { canEdit: boolean; picked: Idea[]; setPicked: (f: (o: Idea[]) => Idea[]) => void; onDesign: () => void }) {
  const [list, setList] = useState<Idea[]>([])
  const [mode, setMode] = useState<'library' | 'search'>('library')
  const [kind, setKind] = useState<'all' | Idea['kind']>('all')
  const [style, setStyle] = useState('')
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Idea | 'new' | null>(null)
  const [msg, setMsg] = useState('')
  const load = useCallback(() => api.get<Idea[]>('/house-ideas').then(setList).catch(() => {}), [])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return list.filter((x) => (kind === 'all' || x.kind === kind) && (!style || x.style === style) && (!s || `${x.title} ${x.note} ${x.country} ${x.style}`.toLowerCase().includes(s)))
  }, [list, kind, style, q])
  const counts = useMemo(() => { const c: Record<string, number> = { all: list.length }; for (const x of list) c[x.kind] = (c[x.kind] || 0) + 1; return c }, [list])

  const isPicked = (id: number) => picked.some((p) => p.id === id)
  const toggle = (x: Idea) => {
    if (isPicked(x.id)) return setPicked((o) => o.filter((p) => p.id !== x.id))
    if (picked.length >= MAX_PICK) return setMsg(`เลือกได้ไม่เกิน ${MAX_PICK} แบบ — เอาแบบเดิมออกก่อน`)
    setMsg(''); setPicked((o) => [...o, x])
  }
  const remove = async (x: Idea) => {
    if (!confirm(`ลบ “${x.title}” ออกจากคลังไอเดีย?`)) return
    try { await api.del('/house-ideas/' + x.id); setPicked((o) => o.filter((p) => p.id !== x.id)); load() } catch (e) { alert((e as Error).message) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: picked.length ? 90 : 0 }}>
      <div style={{ ...card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: '1 1 320px' }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: '#1C2730' }}>ห้องรวมไอเดียแบบบ้าน</div>
            <div style={{ fontSize: 12.5, color: '#5C6770', marginTop: 3 }}>กด ♥ “ชอบแบบนี้” ได้สูงสุด {MAX_PICK} แบบ แล้วกด “ให้ AI ออกแบบตามนี้” · รูปทั้งหมดเป็นรูปที่เจ้าของอนุญาตให้ใช้เชิงพาณิชย์ ต้องแสดงเครดิตใต้รูปเสมอ · โครงการดังเป็นลิงก์ไปเว็บต้นทาง</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={chip(mode === 'library')} onClick={() => setMode('library')}>📚 คลังไอเดีย ({list.length})</button>
            <button style={chip(mode === 'search')} onClick={() => setMode('search')}>🔎 ค้นรูปเพิ่มจากเน็ต</button>
            {canEdit && <button style={btn2} onClick={() => setEdit('new')}>+ เพิ่มลิงก์โครงการ</button>}
          </div>
        </div>
        {mode === 'library' && <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(['all', 'photo', 'render', 'plan', 'link'] as const).map((k) => <button key={k} style={chip(kind === k)} onClick={() => setKind(k)}>{k === 'all' ? 'ทั้งหมด' : KIND_LABEL[k]} ({counts[k] || 0})</button>)}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {STYLES.map((s) => <button key={s} style={chip(style === s)} onClick={() => setStyle(style === s ? '' : s)}>{s}</button>)}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นในคลัง" style={{ ...field, width: 200 }} />
          </div>
        </>}
      </div>
      {msg && <div style={{ fontSize: 13, color: '#C0852C' }}>{msg}</div>}

      {mode === 'library' ? (
        <>
          {!shown.length && <div style={{ ...card, padding: 30, textAlign: 'center', color: '#94A0A8', fontSize: 13 }}>{list.length ? 'ไม่พบไอเดียตามที่กรอง' : 'คลังยังว่าง — กด “ค้นรูปเพิ่มจากเน็ต” แล้วเก็บรูปที่ชอบเข้าคลัง'}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
            {shown.map((x) => (
              <div key={x.id} style={{ ...card, display: 'flex', flexDirection: 'column', outline: isPicked(x.id) ? '2px solid #C24036' : 'none' }}>
                <Thumb src={x.thumb_url} kind={x.kind} />
                <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: '#1C2730', lineHeight: 1.35 }}>{x.title}</div>
                  <div style={{ fontSize: 11.5, color: '#5C6770' }}>{[KIND_LABEL[x.kind], x.style, x.country].filter(Boolean).join(' · ')}{x.public ? ' · 🌐 แสดงบนเว็บลูกค้า' : ''}</div>
                  {x.note && <div style={{ fontSize: 12, color: '#5C6770' }}>{x.note}</div>}
                  <Credit x={x} />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 4 }}>
                    <button style={{ ...btn2, ...(isPicked(x.id) ? { background: '#C24036', color: '#fff', borderColor: '#C24036' } : {}) }} onClick={() => toggle(x)}>{isPicked(x.id) ? '♥ เลือกแล้ว' : '♡ ชอบแบบนี้'}</button>
                    {x.page_url && <a href={x.page_url} target="_blank" rel="noreferrer" style={{ ...btn2, textDecoration: 'none' }}>เปิดต้นทาง ↗</a>}
                    {canEdit && <button style={btn2} title="แก้ไข" onClick={() => setEdit(x)}>✎</button>}
                    {canEdit && <button style={{ ...btn2, color: '#C24036' }} title="ลบ" onClick={() => remove(x)}>🗑</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <WebSearch canEdit={canEdit} onSaved={(x, pick) => { setList((o) => [x, ...o]); if (pick) toggle(x) }} pickedFull={picked.length >= MAX_PICK} />
      )}

      {picked.length > 0 && (
        <div style={{ position: 'sticky', bottom: 10, zIndex: 5, ...card, boxShadow: '0 6px 24px rgba(28,39,48,.18)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1C2730' }}>♥ ที่เลือก {picked.length}/{MAX_PICK}</div>
          {picked.map((p) => (
            <div key={p.id} title={p.title} style={{ position: 'relative' }}>
              {p.thumb_url ? <img src={p.thumb_url} alt="" referrerPolicy="no-referrer" style={{ width: 64, height: 46, objectFit: 'cover', borderRadius: 7, border: '1px solid #E3E8EC' }} /> : <div style={{ width: 64, height: 46, borderRadius: 7, background: '#EEF3F7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🔗</div>}
              <button onClick={() => setPicked((o) => o.filter((k) => k.id !== p.id))} title="เอาออก" style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, border: 'none', background: '#C24036', color: '#fff', cursor: 'pointer', fontSize: 10 }}>✕</button>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <button style={btn2} onClick={() => setPicked(() => [])}>ล้าง</button>
          {canEdit && <button style={btn1} onClick={onDesign}>✨ ให้ AI ออกแบบตามนี้</button>}
        </div>
      )}

      {edit && <EditIdea idea={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}

// ---- ค้นรูปฟรีจากเน็ต (Openverse/Flickr สำหรับรูปบ้าน · Wikimedia สำหรับแปลน) ----
const PRESETS: Record<'photo' | 'render' | 'plan', string[]> = {
  photo: ['บ้านโมเดิร์น 2 ชั้น', 'บ้านมินิมอล', 'บ้านทรอปิคอล', 'วิลล่า สระว่ายน้ำ', 'บ้านญี่ปุ่น', 'บ้านนอร์ดิก', 'บ้านไทย', 'บ้านไม้', 'บ้านลอฟต์ ปูนเปลือย', 'บ้านชั้นเดียว', 'ห้องนั่งเล่น ภายใน'],
  render: ['บ้านโมเดิร์น', 'วิลล่า', 'บ้านมินิมอล', 'ภายใน'],
  plan: ['house floor plan', 'villa plan', 'bungalow plan', 'two storey house plan', 'japanese house plan', 'thai house plan'],
}
function WebSearch({ canEdit, onSaved, pickedFull }: { canEdit: boolean; onSaved: (x: Idea, pick: boolean) => void; pickedFull: boolean }) {
  const [kind, setKind] = useState<'photo' | 'render' | 'plan'>('photo')
  const [q, setQ] = useState('')
  const [style, setStyle] = useState('')
  const [items, setItems] = useState<Found[]>([])
  const [page, setPage] = useState(1)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [shownQ, setShownQ] = useState('')
  const [cfg, setCfg] = useState<{ pexels: boolean; can_set: boolean } | null>(null)
  const [keyIn, setKeyIn] = useState('')
  useEffect(() => { api.get<{ pexels: boolean; can_set: boolean }>('/house-ideas/config').then(setCfg).catch(() => {}) }, [])
  const saveKey = async (k: string) => {
    try { setCfg(await api.put('/house-ideas/config', { pexels_key: k })); setKeyIn(''); setItems([]) } catch (e) { alert((e as Error).message) }
  }

  const run = async (text: string, k = kind, p = 1) => {
    setBusy(true); setErr('')
    try {
      const r = await api.get<{ q: string; page: number; more: boolean; items: Found[] }>(`/house-ideas/search?kind=${k}&page=${p}&q=${encodeURIComponent(text)}`)
      setItems((o) => (p === 1 ? r.items : [...o, ...r.items])); setPage(p); setMore(r.more); setShownQ(r.q)
      if (p === 1 && !r.items.length) setErr('ไม่พบรูป ลองคำอื่น (ภาษาอังกฤษได้ผลดีกว่า)')
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const save = async (x: Found, pick: boolean) => {
    try {
      const r = await api.post<Idea>('/house-ideas', { ...x, style, public: kind !== 'plan' ? 1 : 0 })
      setItems((o) => o.map((y) => (y.image_url === x.image_url ? { ...y, saved: true } : y)))
      onSaved(r, pick)
    } catch (e) { alert((e as Error).message) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...card, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['photo', 'render', 'plan'] as const).map((k) => <button key={k} style={chip(kind === k)} onClick={() => { setKind(k); setItems([]); setMore(false) }}>{KIND_LABEL[k]}</button>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); run(q) }} style={{ display: 'flex', gap: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="เช่น บ้านโมเดิร์น 2 ชั้น สระว่ายน้ำ หรือพิมพ์อังกฤษ modern tropical house" style={field} />
          <button type="submit" style={btn1} disabled={busy}>{busy ? 'กำลังค้น…' : 'ค้นหา'}</button>
        </form>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PRESETS[kind].map((p) => <button key={p} style={{ ...btn2, padding: '4px 9px', fontSize: 12 }} onClick={() => { setQ(p); run(p) }}>{p}</button>)}
        </div>
        {canEdit && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: '#5C6770' }}>
          เก็บเข้าคลังเป็นสไตล์: {STYLES.map((s) => <button key={s} style={{ ...chip(style === s), padding: '3px 8px', fontSize: 12 }} onClick={() => setStyle(style === s ? '' : s)}>{s}</button>)}
        </div>}
        <div style={{ fontSize: 11.5, color: '#94A0A8' }}>{cfg?.pexels && kind !== 'plan' ? 'ค้นจาก Pexels (รูปฟรี ใช้เชิงพาณิชย์ได้)' : kind === 'plan' ? 'แปลนค้นจาก Wikimedia Commons' : 'ค้นจาก Openverse (Flickr) / Wikimedia Commons'} — เฉพาะรูปที่เจ้าของอนุญาตให้ใช้เชิงพาณิชย์ · ค้นได้ไม่จำกัด{shownQ ? ` · คำที่ใช้ค้น: “${shownQ}”` : ''}</div>
        {cfg && !cfg.pexels && kind !== 'plan' && <div style={{ fontSize: 12, color: '#8A5A12', background: '#F8EEDC', borderRadius: 8, padding: '7px 10px' }}>
          ผลค้นจากแหล่งฟรีตอนนี้ยังมีรูปไม่ตรงปนบ้าง — ถ้าแอดมินสมัคร <a href="https://www.pexels.com/api/" target="_blank" rel="noreferrer" style={link}>Pexels API</a> (ฟรี) แล้วใส่กุญแจ จะได้รูปบ้านสวยและตรงกว่ามาก
          {cfg.can_set && <div style={{ display: 'flex', gap: 6, marginTop: 6 }}><input type="password" autoComplete="off" value={keyIn} onChange={(e) => setKeyIn(e.target.value)} placeholder="วางกุญแจ Pexels" style={{ ...field, maxWidth: 320 }} /><button style={btn2} disabled={!keyIn.trim()} onClick={() => saveKey(keyIn.trim())}>บันทึกกุญแจ</button></div>}
        </div>}
        {cfg?.pexels && cfg.can_set && <div style={{ fontSize: 11.5, color: '#94A0A8' }}>ใช้กุญแจ Pexels อยู่ · <button style={{ ...btn2, padding: '1px 7px', fontSize: 11 }} onClick={() => confirm('ลบกุญแจ Pexels? (กลับไปใช้แหล่งฟรีเดิม)') && saveKey('')}>ลบกุญแจ</button></div>}
      </div>
      {err && <div style={{ fontSize: 13, color: '#C24036' }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
        {items.map((x) => (
          <div key={x.image_url} style={{ ...card, display: 'flex', flexDirection: 'column' }}>
            <a href={x.page_url} target="_blank" rel="noreferrer"><Thumb src={x.thumb_url} h={140} kind={x.kind} /></a>
            <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              <div style={{ fontSize: 12.5, color: '#1C2730', lineHeight: 1.35 }}>{x.title}</div>
              <Credit x={x} />
              {canEdit && <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 4 }}>
                {x.saved ? <span style={{ fontSize: 12, color: '#2E7D4F' }}>✓ อยู่ในคลังแล้ว</span> : <>
                  <button style={btn2} disabled={pickedFull} title={pickedFull ? `เลือกครบ ${MAX_PICK} แบบแล้ว` : ''} onClick={() => save(x, true)}>♡ ชอบแบบนี้</button>
                  <button style={btn2} onClick={() => save(x, false)}>+ เก็บเข้าคลัง</button>
                </>}
              </div>}
            </div>
          </div>
        ))}
      </div>
      {more && items.length > 0 && <button style={{ ...btn2, alignSelf: 'center' }} disabled={busy} onClick={() => run(q, kind, page + 1)}>{busy ? 'กำลังโหลด…' : 'ดูเพิ่ม'}</button>}
    </div>
  )
}

// ---- เพิ่มลิงก์โครงการ / แก้ไขไอเดีย ----
function EditIdea({ idea, onClose, onSaved }: { idea: Idea | null; onClose: () => void; onSaved: () => void }) {
  const isLink = !idea || idea.kind === 'link'
  const [f, setF] = useState({ kind: idea?.kind || 'link', title: idea?.title || '', page_url: idea?.page_url || '', style: idea?.style || '', country: idea?.country || '', note: idea?.note || '', public: !!idea?.public })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof f, v: string | boolean) => setF((o) => ({ ...o, [k]: v }))
  const submit = async () => {
    setErr(''); setSaving(true)
    try {
      if (idea) await api.put('/house-ideas/' + idea.id, f)
      else await api.post('/house-ideas', { ...f, kind: 'link', source: 'web' })
      onSaved()
    } catch (e) { setErr((e as Error).message); setSaving(false) }
  }
  return (
    <ModalShell title={idea ? 'แก้ไขไอเดีย' : 'เพิ่มลิงก์โครงการ / แหล่งไอเดีย'} sub={idea ? idea.title : 'เก็บลิงก์ไปหน้าเว็บต้นทาง (ไม่ก๊อปรูปมาเก็บ) เช่น โครงการบ้านดัง ผลงานสถาปนิก บทความบ้านสวย'} onClose={onClose} width={520}
      footer={<><button style={btn2} onClick={onClose}>ยกเลิก</button><button style={{ ...btn1, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={submit}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div><div style={lbl}>ชื่อ</div><input style={field} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="เช่น บ้านคุณ A — สถาปนิก B" /></div>
        {isLink && <div><div style={lbl}>ลิงก์หน้าเว็บต้นทาง</div><input style={field} value={f.page_url} onChange={(e) => set('page_url', e.target.value)} placeholder="https://..." /></div>}
        {!isLink && <div><div style={lbl}>ชนิด</div><div style={{ display: 'flex', gap: 6 }}>{(['photo', 'render', 'plan'] as const).map((k) => <button key={k} style={chip(f.kind === k)} onClick={() => set('kind', k)}>{KIND_LABEL[k]}</button>)}</div></div>}
        <div><div style={lbl}>สไตล์</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{STYLES.map((s) => <button key={s} style={chip(f.style === s)} onClick={() => set('style', f.style === s ? '' : s)}>{s}</button>)}</div></div>
        <div><div style={lbl}>ประเทศ</div><input style={field} value={f.country} onChange={(e) => set('country', e.target.value)} placeholder="เช่น ไทย, ญี่ปุ่น" /></div>
        <div><div style={lbl}>จุดเด่น / หมายเหตุ (AI จะอ่านข้อความนี้ด้วย)</div><textarea style={{ ...field, minHeight: 60, resize: 'vertical' }} value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="เช่น หลังคาแบนยื่นยาว ผนังไม้ระแนง ลานกลางบ้าน" /></div>
        {(!isLink || !!idea?.image_url) && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={f.public} onChange={(e) => set('public', e.target.checked)} /> แสดงรูปนี้บนเว็บลูกค้า (พร้อมเครดิตเจ้าของภาพ)</label>}
        {err && <div style={{ color: '#C24036', fontSize: 13 }}>{err}</div>}
      </div>
    </ModalShell>
  )
}
