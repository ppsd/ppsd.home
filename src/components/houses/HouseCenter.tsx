// ศูนย์กลางงานบ้าน — หน้า "ความเคลื่อนไหวบ้าน"
//  แท็บ 1 ความเคลื่อนไหว: ทุกเรื่องที่เกิดกับบ้านทุกหลัง (ทุกคนเห็น) · ป้าย "ใหม่" = ยังไม่ได้ดู · ติ๊กเลือกเพื่อส่งอัปเดตให้ลูกค้า
//  แท็บ 2 รออนุมัติ: งานเพิ่ม-ลดงาน/แก้ยอดเงินที่รอแอดมิน/ผู้จัดการอนุมัติ (คนทั่วไปเห็นเฉพาะของตัวเอง)
//  แท็บ 3 ตั้งค่าการอนุมัติ (แอดมิน): เลือกว่าเรื่องไหนต้องรออนุมัติ
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../api'
import { useApp } from '../../store'
import ModalShell from '../shared/ModalShell'
import { LinkCodeBox, useLinkedContractors } from './ContractorLineLink'

interface FeedPart { text: string; lines: string[] }
interface FeedItem { id: number; min_id: number; ts: string; user: string; house_code: string; house_name: string; cats: string[]; flag: boolean; approval: { id: number; status: string } | null; parts: FeedPart[] }
interface Req { files?: number[]; id: number; ts: string; kind: string; house_code: string; house_name: string; title: string; lines: string[]; requested_by: string; requested_by_id: number; status: string; decided_by?: string; decided_at?: string; reason?: string; result?: string }
interface Gate { key: string; label: string; group: string; on: boolean }
interface Unread { unread: number; last_seen?: number; pending: number; canApprove: boolean; canCustomer: boolean }

const C = { ink: '#1F2A33', sub: '#5C6770', line: '#E3E8EC', brand: '#30506A', red: '#C24036', green: '#2E8B57', amber: '#B7791F', bg: '#F7F9FA' }
const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12 }
const btn = (primary = false): React.CSSProperties => ({ fontFamily: 'inherit', fontSize: 13, fontWeight: primary ? 600 : 500, color: primary ? '#fff' : C.sub, background: primary ? C.brand : '#fff', border: primary ? 'none' : '1px solid #D2DAE1', borderRadius: 9, padding: '8px 14px', cursor: 'pointer' })
const chip = (on: boolean): React.CSSProperties => ({ fontFamily: 'inherit', fontSize: 12.5, padding: '6px 12px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${on ? C.brand : '#D2DAE1'}`, background: on ? C.brand : '#fff', color: on ? '#fff' : C.sub })
const CAT_FILTERS: { id: string; label: string }[] = [
  { id: '', label: 'ทั้งหมด' }, { id: 'flag', label: '⚠️ เพิ่ม-ลดงาน / ยอดเงินเปลี่ยน' }, { id: 'money', label: 'เงิน/จัดซื้อ' },
  { id: 'site', label: 'หน้างาน' }, { id: 'info', label: 'ข้อมูลบ้าน/ไฟล์' }, { id: 'approval', label: 'คำขออนุมัติ' }, { id: 'customer', label: 'ส่งลูกค้าแล้ว' },
]
const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const thDay = (ts: string) => { const [y, m, d] = ts.slice(0, 10).split('-').map(Number); return y ? `${d} ${TH_M[m - 1]} ${String((y + 543) % 100).padStart(2, '0')}` : ts }
const hhmm = (ts: string) => ts.slice(11, 16)
const STATUS_COLOR: Record<string, string> = { 'รออนุมัติ': C.amber, 'อนุมัติ': C.green, 'ตีกลับ': C.red, 'ยกเลิก': C.sub }

export default function HouseCenter({ onOpenHouse }: { onOpenHouse?: (id: number) => void }) {
  const { user, data } = useApp()
  const [tab, setTab] = useState<'feed' | 'approvals' | 'gates' | 'cline'>('feed')
  const [linked, reloadLinked] = useLinkedContractors() // null = ไม่มีสิทธิ์จัดการช่าง LINE
  const [info, setInfo] = useState<Unread>({ unread: 0, pending: 0, canApprove: false, canCustomer: false })
  const [compose, setCompose] = useState<{ house: string; text: string; kind: 'update' | 'notice' } | null>(null)
  const loadInfo = useCallback(() => api.get<Unread>('/center/unread').then(setInfo).catch(() => {}), [])
  useEffect(() => { loadInfo() }, [loadInfo])

  const tabs: [typeof tab, string][] = [['feed', 'ความเคลื่อนไหว'], ['approvals', `รออนุมัติ${info.pending ? ` (${info.pending})` : ''}`], ...(linked ? [['cline', `ช่าง LINE (${linked.length})`] as [typeof tab, string]] : []), ...(user?.role === 'admin' ? [['gates', 'ตั้งค่า'] as [typeof tab, string]] : [])]
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, color: C.ink }}>ความเคลื่อนไหวบ้าน</div>
          <div style={{ fontSize: 13, color: C.sub }}>ทุกเรื่องที่เพิ่ม/แก้/ลบในบ้านทุกหลัง — ใครทำ เมื่อไร เปลี่ยนอะไร · งานเพิ่ม-ลดงานที่ต้องรออนุมัติ</div>
        </div>
        {info.canCustomer && <button style={{ ...btn(true), marginLeft: 'auto' }} onClick={() => setCompose({ house: '', text: '', kind: 'notice' })}>📨 แจ้งลูกค้าทาง LINE</button>}
      </div>
      <div style={{ display: 'flex', gap: 6, borderBottom: `1px solid ${C.line}`, marginBottom: 14 }}>
        {tabs.map(([id, label]) => (
          <div key={id} onClick={() => setTab(id)} style={{ padding: '9px 14px', fontSize: 14, cursor: 'pointer', color: tab === id ? C.brand : C.sub, fontWeight: tab === id ? 600 : 500, borderBottom: `2px solid ${tab === id ? C.brand : 'transparent'}`, marginBottom: -1 }}>{label}</div>
        ))}
      </div>
      {tab === 'feed' && <Feed canCustomer={info.canCustomer} onCompose={setCompose} onSeen={loadInfo} onOpenHouse={(code) => { const h = data.houses.find((x) => x.code === code); if (h && onOpenHouse) onOpenHouse(h.id) }} />}
      {tab === 'approvals' && <Approvals canApprove={info.canApprove} onChanged={loadInfo} />}
      {tab === 'gates' && <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}><Gates /><AlertSettings /></div>}
      {tab === 'cline' && linked && <ContractorLine linked={linked} reload={reloadLinked} />}
      {compose && <ComposeModal init={compose} onClose={() => setCompose(null)} />}
    </div>
  )
}

// ---------------- ความเคลื่อนไหว ----------------
function Feed({ canCustomer, onCompose, onSeen, onOpenHouse }: { canCustomer: boolean; onCompose: (c: { house: string; text: string; kind: 'update' | 'notice' }) => void; onSeen: () => void; onOpenHouse: (code: string) => void }) {
  const { data } = useApp()
  const [house, setHouse] = useState('')
  const [cat, setCat] = useState('')
  const [items, setItems] = useState<FeedItem[]>([])
  const [next, setNext] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState<Set<number>>(new Set())
  const seenAt = useRef<number | null>(null) // id ล่าสุดที่เคยดูตอนเปิดหน้า (ไว้ทำป้าย "ใหม่")
  const [lastSeen, setLastSeen] = useState(0)

  const query = (before = 0) => {
    const q = new URLSearchParams({ limit: '40' })
    if (house) q.set('house', house)
    if (cat === 'flag') q.set('flag', '1'); else if (cat) q.set('cat', cat)
    if (before) q.set('before', String(before))
    return '/center/feed?' + q.toString()
  }
  const load = useCallback(async (more = false) => {
    setBusy(true); setErr('')
    try {
      const r = await api.get<{ items: FeedItem[]; next: number }>(query(more ? next : 0))
      setItems((cur) => (more ? [...cur, ...r.items] : r.items)); setNext(r.next)
      if (!more && r.items.length) {
        const top = r.items[0].id
        if (seenAt.current == null) { // ครั้งแรกที่เปิด: จำว่าเคยดูถึงไหน แล้วบันทึกว่าดูแล้ว
          const u = await api.get<{ last_seen: number }>('/center/unread').catch(() => ({ last_seen: top }))
          seenAt.current = u.last_seen || top
          setLastSeen(seenAt.current)
        }
        api.post('/center/seen', { last_id: top }).then(() => { onSeen(); window.dispatchEvent(new Event('ppsd:center-seen')) }).catch(() => {})
      }
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [house, cat, next])
  useEffect(() => { setSel(new Set()); load(false) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [house, cat])
  // ข้อมูลเปลี่ยน (จากคนอื่น/บอท LINE) → โหลดใหม่เอง
  useEffect(() => {
    const on = () => load(false)
    window.addEventListener('ppsd:changed', on)
    return () => window.removeEventListener('ppsd:changed', on)
  }, [load])

  const byDay = useMemo(() => {
    const m: [string, FeedItem[]][] = []
    for (const it of items) { const d = thDay(it.ts); const last = m[m.length - 1]; if (last && last[0] === d) last[1].push(it); else m.push([d, [it]]) }
    return m
  }, [items])
  const selItems = items.filter((i) => sel.has(i.id))
  const selHouse = selItems[0]?.house_code || ''
  const toggle = (it: FeedItem) => setSel((s) => {
    const n = new Set(s)
    if (n.has(it.id)) n.delete(it.id)
    else { if (selHouse && it.house_code !== selHouse) { alert('เลือกได้ทีละบ้าน — ส่งให้ลูกค้าบ้านเดียวกันเท่านั้น'); return s } n.add(it.id) }
    return n
  })
  // ร่างข้อความถึงลูกค้า — เอาแค่หัวเรื่อง ไม่เอายอดเงิน/ชื่อช่าง (คนส่งแก้ได้ก่อนส่ง)
  const draft = () => {
    const h = selItems[0]
    const lines = selItems.slice().reverse().flatMap((it) => it.parts.map((p) => '• ' + p.text.replace(/^(✅ อนุมัติ: |ส่งขออนุมัติ: |↩️ ตีกลับ: )/, '').replace(/^(เพิ่ม|แก้ไข)/, '').replace(/ · /g, ' ').trim()))
    return `📢 อัปเดตบ้าน ${h?.house_name || ''}\n${[...new Set(lines)].join('\n')}\n\nสอบถามเพิ่มเติมพิมพ์ในแชทนี้ได้เลยค่ะ 🙏`
  }

  return (
    <div>
      <div style={{ ...card, padding: 12, marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={house} onChange={(e) => setHouse(e.target.value)} style={{ fontFamily: 'inherit', fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid #D2DAE1', minWidth: 220 }}>
          <option value="">ทุกบ้าน</option>
          {data.houses.map((h) => <option key={h.code} value={h.code}>{h.name} ({h.code})</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CAT_FILTERS.map((c) => <button key={c.id} style={chip(cat === c.id)} onClick={() => setCat(c.id)}>{c.label}</button>)}
        </div>
      </div>
      {canCustomer && <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 10 }}>ติ๊ก ☐ หน้ารายการที่อยากบอกลูกค้า (บ้านเดียวกัน) แล้วกด “ส่งให้ลูกค้า” — ระบบจะร่างข้อความให้ ตรวจ/แก้ก่อนส่งได้ · ไม่มีอะไรส่งถึงลูกค้าเองอัตโนมัติ</div>}
      {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
      {!items.length && !busy && <div style={{ ...card, padding: 30, textAlign: 'center', color: C.sub, fontSize: 14 }}>ยังไม่มีความเคลื่อนไหว{house ? 'ของบ้านนี้' : ''}</div>}
      {byDay.map(([day, its]) => (
        <div key={day} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.sub, margin: '4px 2px 6px' }}>{day}</div>
          <div style={{ ...card, overflow: 'hidden' }}>
            {its.map((it, i) => {
              const isNew = lastSeen > 0 && it.id > lastSeen
              return (
                <div key={it.id} style={{ display: 'flex', gap: 10, padding: '10px 14px', borderTop: i ? `1px solid ${C.line}` : 'none', background: sel.has(it.id) ? '#EEF4F8' : isNew ? '#FFFBEA' : '#fff' }}>
                  {canCustomer && <input type="checkbox" checked={sel.has(it.id)} onChange={() => toggle(it)} style={{ marginTop: 3, width: 16, height: 16, cursor: 'pointer' }} title="เลือกเพื่อส่งให้ลูกค้า" />}
                  <div style={{ width: 44, fontSize: 12.5, color: C.sub, flexShrink: 0, paddingTop: 1 }} className="num">{hhmm(it.ts)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 2 }}>
                      <span onClick={() => onOpenHouse(it.house_code)} style={{ fontSize: 13.5, fontWeight: 600, color: C.brand, cursor: 'pointer' }} title="เปิดบ้านนี้">{it.house_name}</span>
                      {isNew && <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: C.red, borderRadius: 10, padding: '1px 7px' }}>ใหม่</span>}
                      {it.flag && <span style={{ fontSize: 11, fontWeight: 600, color: C.amber, background: '#FDF3E1', borderRadius: 10, padding: '1px 8px' }}>เพิ่ม-ลดงาน / เงิน</span>}
                      {it.approval && <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[it.approval.status] || C.sub, border: `1px solid ${STATUS_COLOR[it.approval.status] || C.line}`, borderRadius: 10, padding: '0 7px' }}>{it.approval.status}</span>}
                      <span style={{ fontSize: 12.5, color: C.sub, marginLeft: 'auto' }}>โดย {it.user}</span>
                    </div>
                    {it.parts.map((p, k) => (
                      <div key={k} style={{ fontSize: 13, color: C.ink, marginTop: k ? 4 : 0 }}>
                        {p.text}
                        {p.lines.length > 0 && <div style={{ fontSize: 12.5, color: C.sub, marginTop: 1 }}>{p.lines.map((l, j) => <div key={j}>· {l}</div>)}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {next > 0 && <div style={{ textAlign: 'center', margin: '8px 0 70px' }}><button style={btn()} disabled={busy} onClick={() => load(true)}>{busy ? 'กำลังโหลด…' : 'ดูเก่ากว่านี้'}</button></div>}
      {sel.size > 0 && (
        <div style={{ position: 'sticky', bottom: 0, ...card, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', boxShadow: '0 -4px 16px rgba(0,0,0,.08)' }}>
          <span style={{ fontSize: 13.5, color: C.ink }}>เลือก {sel.size} เรื่อง · {selItems[0]?.house_name}</span>
          <button style={{ ...btn(), marginLeft: 'auto' }} onClick={() => setSel(new Set())}>ล้าง</button>
          <button style={btn(true)} onClick={() => onCompose({ house: selHouse, text: draft(), kind: 'update' })}>📨 ส่งให้ลูกค้า</button>
        </div>
      )}
    </div>
  )
}

// ---------------- ส่งข้อความให้ลูกค้า ----------------
const TEMPLATES: [string, string][] = [
  ['ไม่สะดวกเข้าหน้างาน', 'แจ้งข่าวค่ะ วันนี้ ({date}) ทีมช่างไม่สะดวกเข้าหน้างานบ้าน {house} เนื่องจาก ………… จะกลับเข้าทำงานต่อวันที่ ………… ค่ะ ขออภัยในความไม่สะดวกค่ะ 🙏'],
  ['แจ้งเหตุหน้างาน', 'แจ้งเหตุที่หน้างานบ้าน {house} ค่ะ: ………… ทีมงานกำลังดำเนินการแก้ไข และจะแจ้งความคืบหน้าให้ทราบอีกครั้งค่ะ'],
  ['ความคืบหน้า', '📢 อัปเดตบ้าน {house}\nสัปดาห์นี้ทีมช่างทำ ………… เรียบร้อยแล้ว ขั้นต่อไปคือ ………… ค่ะ'],
]
function ComposeModal({ init, onClose }: { init: { house: string; text: string; kind: 'update' | 'notice' }; onClose: () => void }) {
  const { data } = useApp()
  const [house, setHouse] = useState(init.house)
  const [text, setText] = useState(init.text)
  const [info, setInfo] = useState<{ customers: { id: number; name: string }[]; sent: { id: number; ts: string; text: string; by: string; status: string }[]; hasLine: boolean; house: { name: string; customer: string } } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { setInfo(null); if (house) api.get<typeof info>('/center/customer/' + encodeURIComponent(house)).then(setInfo).catch((e) => setMsg((e as Error).message)) }, [house])
  const hName = data.houses.find((h) => h.code === house)?.name || ''
  const today = new Date(); const dateTH = `${today.getDate()} ${TH_M[today.getMonth()]} ${String((today.getFullYear() + 543) % 100).padStart(2, '0')}`
  const useTpl = (t: string) => setText(t.replace(/\{house\}/g, hName).replace(/\{date\}/g, dateTH))
  const send = async () => {
    if (!house) return setMsg('เลือกบ้านก่อน')
    if (!text.trim()) return setMsg('พิมพ์ข้อความก่อน')
    if (!confirm(`ส่งข้อความนี้เข้า LINE ของ ${info?.customers.map((c) => c.name).join(', ') || 'ลูกค้า'}?\n(ส่งแล้วลูกค้าเห็นทันที ดึงคืนไม่ได้)`)) return
    setBusy(true); setMsg('')
    try { const r = await api.post<{ sent_to: string[] }>('/center/customer/' + encodeURIComponent(house) + '/send', { text, kind: init.kind }); alert('ส่งแล้ว ✔ ถึง ' + r.sent_to.join(', ')); onClose() }
    catch (e) { setMsg((e as Error).message) }
    setBusy(false)
  }
  return (
    <ModalShell title={init.kind === 'notice' ? 'แจ้งลูกค้าทาง LINE' : 'ส่งอัปเดตให้ลูกค้าทาง LINE'} sub="ตรวจข้อความก่อนส่ง — อย่าใส่ราคาฝั่งช่าง/ต้นทุน/เรื่องภายใน" width={620} closeOnBackdrop={false} onClose={onClose}
      footer={<>
        <button style={btn()} onClick={onClose}>ยกเลิก</button>
        <button style={btn(true)} disabled={busy || !info?.customers.length} onClick={send}>{busy ? 'กำลังส่ง…' : 'ส่งเข้า LINE ลูกค้า'}</button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ fontSize: 13, color: C.sub }}>บ้าน
          <select value={house} onChange={(e) => setHouse(e.target.value)} disabled={!!init.house} style={{ display: 'block', width: '100%', marginTop: 4, fontFamily: 'inherit', fontSize: 13.5, padding: '8px 10px', borderRadius: 8, border: '1px solid #D2DAE1' }}>
            <option value="">— เลือกบ้าน —</option>
            {data.houses.map((h) => <option key={h.code} value={h.code}>{h.name} ({h.code})</option>)}
          </select>
        </label>
        {house && info && (info.customers.length
          ? <div style={{ fontSize: 13, color: C.green }}>ส่งถึง: {info.customers.map((c) => c.name).join(', ')} (ผูก LINE แล้ว)</div>
          : <div style={{ fontSize: 13, color: C.red }}>ลูกค้าบ้านนี้ ({info.house.customer || 'ไม่ระบุชื่อ'}) ยังไม่ได้ผูก LINE — ไปที่หน้า ลูกค้า (CRM) → ออกรหัสผูก LINE ให้ลูกค้าก่อน</div>)}
        {house && info && !info.hasLine && <div style={{ fontSize: 13, color: C.red }}>ระบบยังไม่ได้ตั้งค่า LINE (หน้า ผู้ใช้งาน → แจ้งเตือน LINE)</div>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: C.sub, alignSelf: 'center' }}>แบบข้อความ:</span>
          {TEMPLATES.map(([label, t]) => <button key={label} style={chip(false)} onClick={() => useTpl(t)} disabled={!house}>{label}</button>)}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="พิมพ์ข้อความถึงลูกค้า…" style={{ fontFamily: 'inherit', fontSize: 14, padding: 10, borderRadius: 8, border: '1px solid #D2DAE1', resize: 'vertical' }} />
        <div style={{ fontSize: 12, color: C.sub, textAlign: 'right' }} className="num">{text.length.toLocaleString()} / 4,500 ตัวอักษร</div>
        {msg && <div style={{ color: C.red, fontSize: 13 }}>{msg}</div>}
        {!!info?.sent.length && (
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.sub, marginBottom: 4 }}>เคยส่งให้ลูกค้าบ้านนี้</div>
            <div style={{ maxHeight: 160, overflowY: 'auto', border: `1px solid ${C.line}`, borderRadius: 8 }}>
              {info.sent.map((s) => <div key={s.id} style={{ padding: '6px 10px', borderTop: `1px solid ${C.line}`, fontSize: 12.5 }}><span style={{ color: C.sub }}>{thDay(s.ts)} {hhmm(s.ts)} · {s.by} · {s.status}</span><div style={{ whiteSpace: 'pre-wrap', color: C.ink }}>{s.text.slice(0, 200)}</div></div>)}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  )
}

// ---------------- รออนุมัติ ----------------
function Approvals({ canApprove, onChanged }: { canApprove: boolean; onChanged: () => void }) {
  const { user } = useApp()
  const [status, setStatus] = useState('รออนุมัติ')
  const [rows, setRows] = useState<Req[]>([])
  const [reason, setReason] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(0)
  const load = useCallback(() => api.get<Req[]>('/approvals?status=' + encodeURIComponent(status)).then(setRows).catch(() => {}), [status])
  useEffect(() => { load() }, [load])
  useEffect(() => { const on = () => load(); window.addEventListener('ppsd:changed', on); return () => window.removeEventListener('ppsd:changed', on) }, [load])
  const act = async (r: Req, what: 'approve' | 'reject') => {
    if (what === 'reject' && canApprove && r.requested_by_id !== user?.id && !(reason[r.id] || '').trim()) return alert('พิมพ์เหตุผลที่ตีกลับก่อน (ผู้ขอจะได้รู้ว่าต้องแก้อะไร)')
    if (what === 'approve' && !confirm(`อนุมัติคำขอ #${r.id}?\n${r.title}\n\nกดแล้วระบบจะบันทึกรายการนี้จริงทันที`)) return
    setBusy(r.id)
    try { await api.post(`/approvals/${r.id}/${what}`, { note: reason[r.id] || '' }); load(); onChanged() }
    catch (e) { alert((e as Error).message); load() }
    setBusy(0)
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {['รออนุมัติ', 'อนุมัติ', 'ตีกลับ', 'all'].map((s) => <button key={s} style={chip(status === s)} onClick={() => setStatus(s)}>{s === 'all' ? 'ทั้งหมด' : s}</button>)}
        <span style={{ fontSize: 12.5, color: C.sub, marginLeft: 8 }}>{canApprove ? 'คุณอนุมัติได้ (แอดมิน/ผู้จัดการ)' : 'แสดงเฉพาะคำขอของคุณ — แอดมิน/ผู้จัดการเป็นผู้อนุมัติ'}</span>
      </div>
      {!rows.length && <div style={{ ...card, padding: 30, textAlign: 'center', color: C.sub, fontSize: 14 }}>{status === 'รออนุมัติ' ? 'ไม่มีคำขอที่รออนุมัติ ✔' : 'ไม่มีรายการ'}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ ...card, padding: 14 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: C.sub }} className="num">#{r.id}</span>
              <span style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>{r.title}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: STATUS_COLOR[r.status] || C.sub, border: `1px solid ${STATUS_COLOR[r.status] || C.line}`, borderRadius: 10, padding: '0 8px', marginLeft: 'auto' }}>{r.status}</span>
            </div>
            <div style={{ fontSize: 13, color: C.ink, margin: '6px 0' }}>{r.lines.map((l, i) => <div key={i}>· {l}</div>)}</div>
            <div style={{ fontSize: 12.5, color: C.sub }}>ขอโดย {r.requested_by} · {thDay(r.ts)} {hhmm(r.ts)}{r.decided_by ? ` · ${r.status}โดย ${r.decided_by} ${r.decided_at ? thDay(r.decided_at) + ' ' + hhmm(r.decided_at) : ''}` : ''}</div>
            {!!r.files?.length && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{r.files.map((fid, i) => <button key={fid} style={chip(false)} onClick={() => api.openFile(`/files/${fid}/view`).catch((e) => alert((e as Error).message))}>📷 รูป {i + 1}</button>)}</div>}
            {r.reason && <div style={{ fontSize: 12.5, color: r.status === 'ตีกลับ' ? C.red : C.sub, marginTop: 3 }}>เหตุผล/หมายเหตุ: {r.reason}</div>}
            {r.result && r.status === 'รออนุมัติ' && <div style={{ fontSize: 12.5, color: C.red, marginTop: 3 }}>{r.result}</div>}
            {r.status === 'รออนุมัติ' && (canApprove || r.requested_by_id === user?.id) && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {canApprove && <input value={reason[r.id] || ''} onChange={(e) => setReason((m) => ({ ...m, [r.id]: e.target.value }))} placeholder="หมายเหตุ / เหตุผลถ้าตีกลับ" style={{ flex: 1, minWidth: 200, fontFamily: 'inherit', fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid #D2DAE1' }} />}
                {canApprove && r.requested_by_id !== user?.id && <button style={{ ...btn(), color: C.red, borderColor: '#E8B7B2' }} disabled={busy === r.id} onClick={() => act(r, 'reject')}>↩️ ตีกลับ</button>}
                {canApprove && <button style={{ ...btn(true), background: C.green }} disabled={busy === r.id} onClick={() => act(r, 'approve')}>{busy === r.id ? 'กำลังทำ…' : '✅ อนุมัติ'}</button>}
                {r.requested_by_id === user?.id && <button style={btn()} disabled={busy === r.id} onClick={() => { if (confirm('ยกเลิกคำขอนี้?')) act(r, 'reject') }}>ยกเลิกคำขอ</button>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------- ตั้งค่าเรื่องที่ต้องรออนุมัติ (แอดมิน) ----------------
function Gates() {
  const [gates, setGates] = useState<Gate[]>([])
  const [saved, setSaved] = useState('')
  useEffect(() => { api.get<Gate[]>('/approvals/gates').then(setGates).catch(() => {}) }, [])
  const save = async () => {
    try { await api.put('/approvals/gates', Object.fromEntries(gates.map((g) => [g.key, g.on]))); setSaved('บันทึกแล้ว ✔') } catch (e) { setSaved((e as Error).message) }
  }
  const groups = [...new Set(gates.map((g) => g.group))]
  return (
    <div style={{ ...card, padding: 18, maxWidth: 680 }}>
      <div style={{ fontSize: 13.5, color: C.sub, marginBottom: 12 }}>ติ๊ก = ถ้าพนักงานทั่วไป (ไม่ใช่แอดมิน/ผู้จัดการ) ทำเรื่องนี้ ระบบจะยังไม่บันทึก แต่ส่งเข้าคิว “รออนุมัติ” ก่อน · แอดมินและผู้จัดการทำได้ทันที (ยังมีประวัติทุกครั้ง)</div>
      {groups.map((g) => (
        <div key={g} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 6 }}>{g}</div>
          {gates.filter((x) => x.group === g).map((x) => (
            <label key={x.key} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', fontSize: 13.5, color: C.ink, cursor: 'pointer' }}>
              <input type="checkbox" checked={x.on} onChange={(e) => { setSaved(''); setGates((gs) => gs.map((y) => (y.key === x.key ? { ...y, on: e.target.checked } : y))) }} style={{ width: 16, height: 16 }} />
              {x.label}
            </label>
          ))}
        </div>
      ))}
      <div style={{ fontSize: 12.5, color: C.sub, margin: '6px 0 12px' }}>ใบขอซื้อ / ใบสั่งซื้อ / ใบจ่ายเงิน / เบิกค่าน้ำมัน / ใบลา ยังใช้ระบบอนุมัติเดิมของแต่ละหน้าเหมือนเดิม</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button style={btn(true)} onClick={save}>บันทึก</button>
        <span style={{ fontSize: 13, color: saved.includes('✔') ? C.green : C.red }}>{saved}</span>
      </div>
    </div>
  )
}

// ---------------- ช่าง/ผู้รับเหมาที่ผูก LINE ----------------
function ContractorLine({ linked, reload }: { linked: import('./ContractorLineLink').LinkedContractor[]; reload: () => void }) {
  const { data } = useApp()
  const [name, setName] = useState('')
  const [issuing, setIssuing] = useState('')
  const names = useMemo(() => [...new Set((data.vendors || []).filter((v) => (v as { kind?: string }).kind === 'ผู้รับเหมา').map((v) => v.name))], [data.vendors])
  const off = async (c: { id: number; name: string }) => {
    if (!confirm(`ยกเลิกการผูก LINE ของ ${c.name}?
ช่างจะใช้บอทไม่ได้จนกว่าจะออกรหัสใหม่ (ใช้เมื่อเลิกจ้าง/เปลี่ยนเครื่อง)`)) return
    try { await api.post(`/contractor-line/${c.id}/disable`); reload() } catch (e) { alert((e as Error).message) }
  }
  return (
    <div>
      <div style={{ ...card, padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 13.5, color: C.ink, fontWeight: 600, marginBottom: 6 }}>ออกรหัสผูก LINE ให้ช่าง</div>
        <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 8 }}>พิมพ์ชื่อช่างให้ <b>ตรงกับชื่อในแท็บ “ช่าง / ผู้รับเหมา” ของบ้าน</b> (ช่างจะเห็นเฉพาะบ้านที่ชื่อนี้ถูกจ้าง) · หรือกด “🔗 ผูก LINE” ที่แท็บช่างของบ้านก็ได้</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input list="con-names" value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อช่าง/ผู้รับเหมา" style={{ flex: 1, fontFamily: 'inherit', fontSize: 13.5, padding: '8px 10px', borderRadius: 8, border: '1px solid #D2DAE1' }} />
          <datalist id="con-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
          <button style={btn(true)} disabled={!name.trim()} onClick={() => setIssuing(name.trim())}>ออกรหัส</button>
        </div>
      </div>
      {issuing && <div style={{ ...card, overflow: 'hidden', marginBottom: 12 }}><LinkCodeBox key={issuing} name={issuing} onClose={() => { setIssuing(''); reload() }} /></div>}
      <div style={{ ...card, overflow: 'hidden' }}>
        {!linked.length && <div style={{ padding: 24, textAlign: 'center', color: C.sub, fontSize: 13.5 }}>ยังไม่มีช่างที่ผูก LINE</div>}
        {linked.map((c, i) => (
          <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', borderTop: i ? `1px solid ${C.line}` : 'none' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{c.name}</div>
              <div style={{ fontSize: 12.5, color: C.sub }}>{c.houses.length ? 'บ้าน: ' + c.houses.join(', ') : '⚠ ยังไม่พบบ้านที่ช่างชื่อนี้ถูกจ้าง'} · ผูกเมื่อ {thDay(c.linked_at)} (ออกรหัสโดย {c.linked_by})</div>
            </div>
            <button style={{ ...btn(), color: C.red, borderColor: '#E8B7B2' }} onClick={() => off(c)}>ยกเลิกการผูก</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------- แจ้งเตือนเข้ากลุ่ม LINE (แอดมิน) ----------------
interface AlertCfg { on: boolean; targets: string[]; cats: Record<string, boolean>; every: number; quiet: boolean; cat_labels: Record<string, string>; seen: { id: string; name: string; type: string }[]; digest_to: string; has_token: boolean; status: { at: string; ok: boolean; sent: number; of: number } | null }
function AlertSettings() {
  const [cfg, setCfg] = useState<AlertCfg | null>(null)
  const [msg, setMsg] = useState('')
  const [preview, setPreview] = useState('')
  const [manual, setManual] = useState('')
  const load = () => api.get<AlertCfg>('/center/alerts').then(setCfg).catch((e) => setMsg((e as Error).message))
  useEffect(() => { load() }, [])
  if (!cfg) return <div style={{ ...card, padding: 18, flex: '1 1 360px', color: C.sub, fontSize: 13 }}>{msg || 'กำลังโหลด…'}</div>
  const set = (p: Partial<AlertCfg>) => { setMsg(''); setCfg({ ...cfg, ...p }) }
  const groups = cfg.seen.filter((g) => g.type === 'group' || g.type === 'room')
  const label = (id: string) => cfg.seen.find((g) => g.id === id)?.name || (id === cfg.digest_to ? 'กลุ่มสรุปเช้า' : id.slice(0, 10) + '…')
  const toggleTarget = (id: string) => set({ targets: cfg.targets.includes(id) ? cfg.targets.filter((x) => x !== id) : [...cfg.targets, id] })
  const save = async () => { await api.put('/center/alerts', { on: cfg.on, targets: cfg.targets, cats: cfg.cats, every: cfg.every, quiet: cfg.quiet }); setMsg('บันทึกแล้ว ✔'); load() }
  const trySave = () => save().catch((e) => setMsg((e as Error).message))
  const test = async () => { try { await save(); await api.post('/center/alerts/test'); setMsg('ส่งข้อความทดสอบแล้ว ✔ ดูในกลุ่ม LINE') } catch (e) { setMsg((e as Error).message) } }
  const showPreview = async () => {
    try { const r = await api.get<{ text: string; pending: boolean }>('/center/alerts/preview'); setPreview((r.pending ? '' : '(ตัวอย่างจากเรื่องล่าสุด — ตอนนี้ยังไม่มีเรื่องรอส่ง)\n\n') + r.text) }
    catch (e) { setMsg((e as Error).message) }
  }
  const rowLabel: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', padding: '4px 0', fontSize: 13.5, color: C.ink, cursor: 'pointer' }
  return (
    <div style={{ ...card, padding: 18, flex: '1 1 360px', maxWidth: 560 }}>
      <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, marginBottom: 4 }}>🔔 แจ้งเตือนเข้ากลุ่ม LINE</div>
      <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 12 }}>รวบเรื่องใหม่จากหน้านี้ส่งเป็นข้อความเดียวเข้ากลุ่มทีม — ทุกคนเห็นเร็วโดยไม่ต้องเปิดเว็บ · มีเรื่องใหม่ถึงจะส่ง · เปิดแล้วเริ่มนับจากตอนนี้ (ไม่ส่งย้อนหลัง)</div>
      {!cfg.has_token && <div style={{ fontSize: 13, color: C.red, marginBottom: 10 }}>ยังไม่ได้ตั้งค่า LINE — ไปที่เมนู ส่วนกลางบริษัท → LINE ก่อน</div>}
      <label style={{ ...rowLabel, fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
        <input type="checkbox" checked={cfg.on} onChange={(e) => set({ on: e.target.checked })} style={{ width: 18, height: 18 }} /> เปิดแจ้งเตือนกลุ่ม
      </label>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 6 }}>ส่งเข้ากลุ่ม (เลือกได้หลายกลุ่ม)</div>
      {!groups.length && <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 6 }}>ยังไม่มีกลุ่มที่บอทเห็น — เชิญบอท PPSD เข้ากลุ่ม LINE ของทีม แล้วพิมพ์ "id" ในกลุ่ม 1 ครั้ง จากนั้นเปิดหน้านี้ใหม่</div>}
      {[...new Set([...groups.map((g) => g.id), ...cfg.targets])].map((id) => (
        <label key={id} style={rowLabel}>
          <input type="checkbox" checked={cfg.targets.includes(id)} onChange={() => toggleTarget(id)} style={{ width: 16, height: 16 }} />
          {label(id)}{id === cfg.digest_to && <span style={{ fontSize: 11, color: C.sub }}>(กลุ่มเดียวกับสรุปเช้า)</span>}
        </label>
      ))}
      <div style={{ display: 'flex', gap: 6, margin: '6px 0 12px' }}>
        <input value={manual} onChange={(e) => setManual(e.target.value.trim())} placeholder="หรือวาง Group ID (ขึ้นต้น C…)" style={{ flex: 1, fontFamily: 'inherit', fontSize: 12.5, padding: '6px 9px', borderRadius: 8, border: '1px solid #D2DAE1' }} />
        <button style={btn()} disabled={!/^[CRU][0-9a-f]{32}$/i.test(manual)} onClick={() => { toggleTarget(manual); setManual('') }}>เพิ่ม</button>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 6 }}>เรื่องที่จะแจ้ง</div>
      {Object.entries(cfg.cat_labels).map(([k, l]) => (
        <label key={k} style={rowLabel}>
          <input type="checkbox" checked={!!cfg.cats[k]} onChange={(e) => set({ cats: { ...cfg.cats, [k]: e.target.checked } })} style={{ width: 16, height: 16 }} /> {l}
        </label>
      ))}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', margin: '10px 0' }}>
        <label style={{ fontSize: 13.5, color: C.ink }}>ส่งรวบทุก{' '}
          <select value={cfg.every} onChange={(e) => set({ every: Number(e.target.value) })} style={{ fontFamily: 'inherit', fontSize: 13, padding: '4px 8px', borderRadius: 7, border: '1px solid #D2DAE1' }}>
            {[1, 2, 5, 10, 15, 30, 60].map((n) => <option key={n} value={n}>{n} นาที</option>)}
          </select>
        </label>
        <label style={rowLabel}>
          <input type="checkbox" checked={cfg.quiet} onChange={(e) => set({ quiet: e.target.checked })} style={{ width: 16, height: 16 }} /> ไม่ส่งช่วง 20:00–07:00 (เก็บไว้ส่งรวมตอนเช้า)
        </label>
      </div>
      {cfg.status && <div style={{ fontSize: 12, color: cfg.status.ok ? C.green : C.red, marginBottom: 8 }}>ส่งล่าสุด {thDay(cfg.status.at)} {hhmm(cfg.status.at)} · {cfg.status.ok ? `สำเร็จ ${cfg.status.sent}/${cfg.status.of} กลุ่ม` : 'ส่งไม่สำเร็จ'}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={btn(true)} onClick={trySave}>บันทึก</button>
        <button style={btn()} onClick={test} disabled={!cfg.targets.length}>ส่งข้อความทดสอบ</button>
        <button style={btn()} onClick={showPreview}>ดูตัวอย่างข้อความ</button>
        <span style={{ fontSize: 13, color: msg.includes('✔') ? C.green : C.red }}>{msg}</span>
      </div>
      {preview && <pre style={{ marginTop: 12, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12.5, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, maxHeight: 320, overflowY: 'auto', color: C.ink }}>{preview}</pre>}
    </div>
  )
}
