import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useApp } from '../store'
import { cryptoAvailable, decryptJson, deriveKey, encryptJson, passphraseStrength, randomSalt, verifyKey, VAULT_CHECK_TEXT } from '../vaultCrypto'

// ===== คลังรหัสผ่านบริษัท =====
// เข้ารหัส/ถอดรหัสที่เบราว์เซอร์ทั้งหมด (AES-256-GCM) · เซิร์ฟเวอร์และฐานข้อมูลเห็นแค่ ciphertext
// ขั้นตอน: ยืนยัน PIN → ใส่ passphrase หลัก (CEO ตั้งครั้งแรก) → ถอดรหัสในหน่วยความจำของแท็บ · ล็อกเองเมื่อไม่ใช้ 10 นาที

export const VAULT_CATS = ['ธนาคาร / แอปธนาคาร', 'สรรพากร / ประกันสังคม', 'LINE / โซเชียล', 'อีเมล', 'โดเมน / โฮสติ้ง / คลาวด์', 'ซอฟต์แวร์ / ไลเซนส์', 'อื่นๆ']
interface Secret { username?: string; password?: string; totp?: string; note?: string }
interface Entry { id: number; title: string; category: string; url: string; enc: string; created: string; by: string; updated: string; updated_by: string }
interface Meta { initialized: boolean; salt: string; check: string; is_ceo: boolean; users?: { id: number; name: string; username: string; role: string; position: string; allowed: boolean; ceo: boolean }[] }

const card: React.CSSProperties = { background: '#fff', border: '1px solid #E1E5EA', borderRadius: 14, padding: '18px 20px' }
const field: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13.5, color: '#1C2730', border: '1px solid #D2DAE1', borderRadius: 9, padding: '8px 11px', outline: 'none', background: '#fff', width: '100%', boxSizing: 'border-box' }
const btnP: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }
const btnS: React.CSSProperties = { fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }
const lbl: React.CSSProperties = { fontSize: 12, color: '#5C6770', marginBottom: 4, display: 'block' }
const IDLE_LOCK_MS = 10 * 60 * 1000
const REVEAL_MS = 30 * 1000

export default function Vault() {
  const { user } = useApp()
  const allowed = !!user?.vaultAllowed
  // ---- ขั้น 1: PIN ----
  const [pin, setPin] = useState('')
  const [pinErr, setPinErr] = useState('')
  const [checking, setChecking] = useState(false)
  const [pinOk, setPinOk] = useState(false)
  // ---- ขั้น 2: passphrase ----
  const [meta, setMeta] = useState<Meta | null>(null)
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [passErr, setPassErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState<CryptoKey | null>(null)
  // ---- ข้อมูล ----
  const [entries, setEntries] = useState<Entry[]>([])
  const [secrets, setSecrets] = useState<Record<number, Secret>>({})
  const [broken, setBroken] = useState<Set<number>>(new Set())
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [revealed, setRevealed] = useState<Record<number, number>>({}) // id → timer id
  const [toast, setToast] = useState('')
  const [edit, setEdit] = useState<{ id?: number; title: string; category: string; url: string; username: string; password: string; totp: string; note: string } | null>(null)
  const [showPw, setShowPw] = useState(false)
  const [panel, setPanel] = useState<'list' | 'users' | 'rekey'>('list')
  const [userIds, setUserIds] = useState<number[]>([])
  const [rk, setRk] = useState({ old: '', n1: '', n2: '' })
  const idleTimer = useRef<number | null>(null)

  const loadMeta = useCallback(() => api.get<Meta>('/vault/meta').then((m) => { setMeta(m); setUserIds((m.users || []).filter((u) => u.allowed).map((u) => u.id)) }).catch((e) => setPassErr((e as Error).message)), [])
  useEffect(() => { if (allowed && pinOk) loadMeta() }, [allowed, pinOk, loadMeta])

  const verifyPin = async () => {
    if (!/^\d{4}$/.test(pin)) { setPinErr('กรอก PIN 4 หลัก'); return }
    setChecking(true); setPinErr('')
    try { await api.post('/verify-pin', { pin }); setPinOk(true) } catch (e) { setPinErr((e as Error).message) } finally { setChecking(false) }
  }

  // ---- ล็อกอัตโนมัติเมื่อไม่ใช้งาน ----
  const lock = useCallback(() => {
    setKey(null); setSecrets({}); setEdit(null); setPass(''); setPanel('list')
    Object.values(revealed).forEach((t) => window.clearTimeout(t)); setRevealed({})
  }, [revealed])
  useEffect(() => {
    if (!key) return
    const bump = () => { if (idleTimer.current) window.clearTimeout(idleTimer.current); idleTimer.current = window.setTimeout(() => { lock(); setToast('ล็อกคลังอัตโนมัติ (ไม่มีการใช้งาน 10 นาที)') }, IDLE_LOCK_MS) }
    bump()
    const evs = ['mousemove', 'keydown', 'click', 'touchstart']
    evs.forEach((e) => window.addEventListener(e, bump))
    return () => { evs.forEach((e) => window.removeEventListener(e, bump)); if (idleTimer.current) window.clearTimeout(idleTimer.current) }
  }, [key, lock])
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(''), 3000); return () => window.clearTimeout(t) }, [toast])

  // ---- โหลดและถอดรหัสรายการ ----
  const loadEntries = useCallback(async (k: CryptoKey) => {
    const rows = await api.get<Entry[]>('/vault/entries')
    setEntries(rows)
    const out: Record<number, Secret> = {}; const bad = new Set<number>()
    for (const r of rows) { try { out[r.id] = await decryptJson<Secret>(k, r.enc) } catch { bad.add(r.id) } }
    setSecrets(out); setBroken(bad)
  }, [])

  const setup = async () => {
    setPassErr('')
    const st = passphraseStrength(pass)
    if (!st.ok) { setPassErr(st.msg); return }
    if (pass !== pass2) { setPassErr('รหัสผ่านหลักสองช่องไม่ตรงกัน'); return }
    setBusy(true)
    try {
      const salt = randomSalt()
      const k = await deriveKey(pass, salt)
      const check = await encryptJson(k, VAULT_CHECK_TEXT)
      await api.post('/vault/setup', { salt, check })
      setKey(k); setPass(''); setPass2(''); await loadMeta(); await loadEntries(k)
    } catch (e) { setPassErr((e as Error).message) } finally { setBusy(false) }
  }
  const unlock = async () => {
    if (!meta) return
    setPassErr(''); setBusy(true)
    try {
      const k = await deriveKey(pass, meta.salt)
      if (!(await verifyKey(k, meta.check))) { setPassErr('รหัสผ่านหลักไม่ถูกต้อง'); return }
      setKey(k); setPass(''); await loadEntries(k)
    } catch (e) { setPassErr((e as Error).message) } finally { setBusy(false) }
  }

  // ---- ดู / คัดลอก ----
  const reveal = (id: number) => {
    if (revealed[id]) { window.clearTimeout(revealed[id]); setRevealed((r) => { const n = { ...r }; delete n[id]; return n }); return }
    const t = window.setTimeout(() => setRevealed((r) => { const n = { ...r }; delete n[id]; return n }), REVEAL_MS)
    setRevealed((r) => ({ ...r, [id]: t }))
    api.post(`/vault/entries/${id}/log`, { action: 'view' }).catch(() => {})
  }
  const copy = async (id: number, text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setToast(`คัดลอก${what}แล้ว`) } catch { setToast('คัดลอกไม่ได้ — เบราว์เซอร์ไม่อนุญาต') }
    if (what === 'รหัสผ่าน') api.post(`/vault/entries/${id}/log`, { action: 'copy' }).catch(() => {})
  }

  // ---- เพิ่ม / แก้ / ลบ ----
  const openNew = () => { setEdit({ title: '', category: VAULT_CATS[0], url: '', username: '', password: '', totp: '', note: '' }); setShowPw(false) }
  const openEdit = (e: Entry) => { const s = secrets[e.id] || {}; setEdit({ id: e.id, title: e.title, category: e.category, url: e.url, username: s.username || '', password: s.password || '', totp: s.totp || '', note: s.note || '' }); setShowPw(false) }
  const save = async () => {
    if (!edit || !key) return
    if (!edit.title.trim()) { setToast('กรอกชื่อระบบ/บริการ'); return }
    setBusy(true)
    try {
      const enc = await encryptJson(key, { username: edit.username, password: edit.password, totp: edit.totp, note: edit.note } as Secret)
      const body = { title: edit.title.trim(), category: edit.category, url: edit.url.trim(), enc }
      if (edit.id) await api.put(`/vault/entries/${edit.id}`, body); else await api.post('/vault/entries', body)
      setEdit(null); await loadEntries(key); setToast('บันทึกแล้ว')
    } catch (e) { setToast((e as Error).message) } finally { setBusy(false) }
  }
  const remove = async (e: Entry) => {
    if (!key || !window.confirm(`ลบ "${e.title}" ออกจากคลัง?`)) return
    try { await api.del(`/vault/entries/${e.id}`); await loadEntries(key); setToast('ลบแล้ว') } catch (err) { setToast((err as Error).message) }
  }
  const genPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?'
    const a = crypto.getRandomValues(new Uint8Array(18))
    const p = Array.from(a, (x) => chars[x % chars.length]).join('')
    setEdit((e) => (e ? { ...e, password: p } : e)); setShowPw(true)
  }

  // ---- CEO: ผู้มีสิทธิ์ / เปลี่ยน passphrase / ส่งออก ----
  const saveUsers = async () => { try { await api.put('/vault/users', { ids: userIds }); await loadMeta(); setToast('บันทึกผู้มีสิทธิ์แล้ว') } catch (e) { setToast((e as Error).message) } }
  const rekey = async () => {
    if (!meta || !key) return
    setPassErr('')
    const st = passphraseStrength(rk.n1)
    if (!st.ok) { setPassErr(st.msg); return }
    if (rk.n1 !== rk.n2) { setPassErr('รหัสผ่านหลักใหม่สองช่องไม่ตรงกัน'); return }
    setBusy(true)
    try {
      const oldK = await deriveKey(rk.old, meta.salt)
      if (!(await verifyKey(oldK, meta.check))) { setPassErr('รหัสผ่านหลักเดิมไม่ถูกต้อง'); return }
      const rows = await api.get<Entry[]>('/vault/entries')
      const salt = randomSalt()
      const nk = await deriveKey(rk.n1, salt)
      const out: { id: number; enc: string }[] = []
      for (const r of rows) { const s = await decryptJson<Secret>(oldK, r.enc); out.push({ id: r.id, enc: await encryptJson(nk, s) }) }
      const check = await encryptJson(nk, VAULT_CHECK_TEXT)
      await api.post('/vault/rekey', { salt, check, entries: out })
      setKey(nk); setRk({ old: '', n1: '', n2: '' }); setPanel('list'); await loadMeta(); await loadEntries(nk); setToast('เปลี่ยนรหัสผ่านหลักแล้ว — แจ้งผู้มีสิทธิ์คนอื่นด้วย')
    } catch (e) { setPassErr((e as Error).message) } finally { setBusy(false) }
  }

  // ======================= UI =======================
  if (!allowed) return <div style={{ maxWidth: 900, margin: '0 auto', ...card, textAlign: 'center', padding: 40 }}>คลังรหัสผ่านบริษัทเข้าได้เฉพาะ <b>CEO</b> และผู้ที่ CEO กำหนดสิทธิ์เท่านั้น</div>
  if (!cryptoAvailable()) return <div style={{ maxWidth: 900, margin: '0 auto', ...card, textAlign: 'center', padding: 40 }}>เบราว์เซอร์ไม่อนุญาตให้เข้ารหัสบนหน้านี้ — ต้องเปิดผ่าน <b>http://localhost:3001</b> ที่เครื่องเซิร์ฟเวอร์ หรือผ่านลิงก์ <b>https://</b> (tunnel) เท่านั้น ลิงก์ http:// ผ่าน IP ในวงแลนใช้ไม่ได้</div>

  if (!pinOk) return (
    <div style={{ maxWidth: 420, margin: '48px auto', ...card, padding: 34, textAlign: 'center' }}>
      <div style={{ width: 52, height: 52, borderRadius: 13, background: '#F3F5F7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#30506A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#1C2730' }}>ยืนยันตัวตนก่อนเข้าคลังรหัสผ่าน</div>
      <div style={{ fontSize: 13, color: '#5C6770', marginTop: 6, marginBottom: 16 }}>กรุณาใส่ PIN ของคุณ ({user?.name})</div>
      <input type="password" inputMode="numeric" maxLength={4} value={pin} autoFocus onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && verifyPin()}
        placeholder="••••" style={{ width: 160, textAlign: 'center', letterSpacing: 8, fontSize: 22, fontFamily: 'inherit', color: '#1C2730', border: '1px solid #D2DAE1', borderRadius: 10, padding: '10px 12px', outline: 'none' }} />
      {pinErr && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 10 }}>{pinErr}</div>}
      <div><button onClick={verifyPin} disabled={checking} style={{ ...btnP, marginTop: 16 }}>{checking ? 'กำลังตรวจสอบ…' : 'ถัดไป'}</button></div>
    </div>
  )

  if (!meta) return <div style={{ maxWidth: 420, margin: '48px auto', ...card, textAlign: 'center', color: '#5C6770' }}>{passErr || 'กำลังโหลด…'}</div>

  if (!key && !meta.initialized) {
    if (!meta.is_ceo) return <div style={{ maxWidth: 520, margin: '48px auto', ...card, textAlign: 'center', padding: 34 }}>คลังรหัสผ่านยังไม่ได้ตั้งค่า — ต้องให้ <b>CEO</b> ตั้งรหัสผ่านหลักก่อน</div>
    const st = passphraseStrength(pass)
    return (
      <div style={{ maxWidth: 520, margin: '48px auto', ...card, padding: 30 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1C2730' }}>ตั้งรหัสผ่านหลักของคลัง (ครั้งแรก)</div>
        <div style={{ fontSize: 12.5, color: '#5C6770', marginTop: 6, lineHeight: 1.6 }}>
          รหัสนี้ใช้เข้ารหัสทุกรายการในเบราว์เซอร์ <b>ระบบไม่เก็บและกู้คืนให้ไม่ได้</b> ถ้าลืมจะเปิดคลังไม่ได้เลย
          จดเก็บไว้ในที่ปลอดภัยนอกระบบ (เช่น ซองปิดผนึกในตู้เซฟ) และบอกเฉพาะคนที่คุณให้สิทธิ์
        </div>
        <div style={{ marginTop: 16 }}><span style={lbl}>รหัสผ่านหลัก (อย่างน้อย 12 ตัวอักษร)</span><input type="password" style={field} value={pass} onChange={(e) => setPass(e.target.value)} autoFocus /></div>
        {pass && <div style={{ fontSize: 12, color: st.ok ? '#2E7D55' : '#C0852C', marginTop: 4 }}>{st.msg}</div>}
        <div style={{ marginTop: 12 }}><span style={lbl}>พิมพ์ซ้ำอีกครั้ง</span><input type="password" style={field} value={pass2} onChange={(e) => setPass2(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setup()} /></div>
        {passErr && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 10 }}>{passErr}</div>}
        <button onClick={setup} disabled={busy} style={{ ...btnP, marginTop: 18 }}>{busy ? 'กำลังตั้งค่า…' : 'ตั้งรหัสผ่านหลักและเปิดคลัง'}</button>
      </div>
    )
  }

  if (!key) return (
    <div style={{ maxWidth: 420, margin: '48px auto', ...card, padding: 34, textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#1C2730' }}>ใส่รหัสผ่านหลักของคลัง</div>
      <div style={{ fontSize: 12.5, color: '#5C6770', marginTop: 6, marginBottom: 14 }}>ถอดรหัสในเบราว์เซอร์นี้เท่านั้น ไม่ถูกส่งไปเซิร์ฟเวอร์</div>
      <input type="password" style={{ ...field, textAlign: 'center' }} value={pass} autoFocus onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && unlock()} placeholder="รหัสผ่านหลัก" />
      {passErr && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 10 }}>{passErr}</div>}
      <button onClick={unlock} disabled={busy || !pass} style={{ ...btnP, marginTop: 16 }}>{busy ? 'กำลังถอดรหัส…' : 'เปิดคลัง'}</button>
    </div>
  )

  // ---------- หน้าหลักหลังปลดล็อก ----------
  const list = entries.filter((e) => (!cat || e.category === cat) && (!q || `${e.title} ${e.url} ${secrets[e.id]?.username || ''} ${secrets[e.id]?.note || ''}`.toLowerCase().includes(q.toLowerCase())))
  const byCat = VAULT_CATS.concat(entries.map((e) => e.category).filter((c) => !VAULT_CATS.includes(c))).map((c) => ({ c, items: list.filter((e) => e.category === c) })).filter((g) => g.items.length)
  const mask = '••••••••'
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {toast && <div style={{ position: 'fixed', top: 76, right: 24, zIndex: 50, background: '#1C2730', color: '#fff', fontSize: 13, padding: '9px 14px', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,.2)' }}>{toast}</div>}
      <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <input style={{ ...field, width: 260 }} placeholder="ค้นหา ชื่อระบบ / URL / ชื่อผู้ใช้" value={q} onChange={(e) => setQ(e.target.value)} />
        <select style={{ ...field, width: 'auto' }} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">ทุกหมวด</option>{VAULT_CATS.map((c) => <option key={c}>{c}</option>)}</select>
        <span style={{ fontSize: 12, color: '#94A0A8' }}>{entries.length} รายการ · ถอดรหัสในเบราว์เซอร์ · ล็อกเองใน 10 นาทีถ้าไม่ใช้</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {meta.is_ceo && <button style={{ ...btnS, ...(panel === 'users' ? { background: '#EAF0F5' } : {}) }} onClick={() => setPanel(panel === 'users' ? 'list' : 'users')}>👥 ผู้มีสิทธิ์</button>}
          {meta.is_ceo && <button style={{ ...btnS, ...(panel === 'rekey' ? { background: '#EAF0F5' } : {}) }} onClick={() => { setPassErr(''); setPanel(panel === 'rekey' ? 'list' : 'rekey') }}>🔑 เปลี่ยนรหัสผ่านหลัก</button>}
          {meta.is_ceo && <button style={btnS} onClick={() => api.download('/vault/export').catch((e) => setToast((e as Error).message))} title="ไฟล์สำรองยังเข้ารหัสอยู่ เปิดได้ด้วยรหัสผ่านหลักเท่านั้น">⬇ ส่งออกสำรอง</button>}
          <button style={btnS} onClick={() => { lock(); setToast('ล็อกคลังแล้ว') }}>🔒 ล็อก</button>
          <button style={btnP} onClick={openNew}>+ เพิ่มรายการ</button>
        </div>
      </div>

      {panel === 'users' && meta.users && (
        <div style={{ ...card, marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>ผู้มีสิทธิ์เข้าคลังรหัสผ่าน</div>
          <div style={{ fontSize: 12.5, color: '#5C6770', marginBottom: 12 }}>คนที่ติ๊กจะเห็นเมนูและเปิดคลังได้ แต่ต้องรู้รหัสผ่านหลักด้วย (คุณต้องบอกเอง ระบบไม่ส่งให้) · CEO เข้าได้เสมอ</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
            {meta.users.map((u) => (
              <label key={u.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '7px 10px', border: '1px solid #EEF1F4', borderRadius: 9, opacity: u.ceo ? 0.6 : 1 }}>
                <input type="checkbox" disabled={u.ceo} checked={u.ceo || userIds.includes(u.id)} onChange={(e) => setUserIds((ids) => (e.target.checked ? [...ids, u.id] : ids.filter((x) => x !== u.id)))} />
                <span style={{ fontWeight: 500 }}>{u.name}</span><span style={{ color: '#94A0A8', fontSize: 11.5 }}>{u.ceo ? 'CEO' : u.position || u.role}</span>
              </label>
            ))}
          </div>
          <button style={{ ...btnP, marginTop: 12 }} onClick={saveUsers}>บันทึกผู้มีสิทธิ์</button>
        </div>
      )}

      {panel === 'rekey' && (
        <div style={{ ...card, marginBottom: 12, maxWidth: 560 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>เปลี่ยนรหัสผ่านหลัก</div>
          <div style={{ fontSize: 12.5, color: '#5C6770', marginBottom: 12 }}>ระบบจะถอดรหัสทุกรายการด้วยรหัสเดิมแล้วเข้ารหัสใหม่ในเบราว์เซอร์นี้ ({entries.length} รายการ) จากนั้นต้องแจ้งรหัสใหม่ให้ผู้มีสิทธิ์คนอื่น</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div><span style={lbl}>รหัสผ่านหลักเดิม</span><input type="password" style={field} value={rk.old} onChange={(e) => setRk({ ...rk, old: e.target.value })} /></div>
            <div><span style={lbl}>รหัสผ่านหลักใหม่</span><input type="password" style={field} value={rk.n1} onChange={(e) => setRk({ ...rk, n1: e.target.value })} /></div>
            <div><span style={lbl}>พิมพ์รหัสใหม่ซ้ำ</span><input type="password" style={field} value={rk.n2} onChange={(e) => setRk({ ...rk, n2: e.target.value })} /></div>
          </div>
          {passErr && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 10 }}>{passErr}</div>}
          <button style={{ ...btnP, marginTop: 12, background: '#C24036' }} disabled={busy} onClick={rekey}>{busy ? 'กำลังเข้ารหัสใหม่…' : 'ยืนยันเปลี่ยนรหัสผ่านหลัก'}</button>
        </div>
      )}

      {entries.length === 0 && <div style={{ ...card, textAlign: 'center', color: '#94A0A8', padding: 40 }}>ยังไม่มีรายการ กด "+ เพิ่มรายการ" เพื่อเริ่มเก็บรหัสผ่านของบริษัท</div>}
      {byCat.map((g) => (
        <div key={g.c} style={{ ...card, padding: 0, marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 18px', background: '#F7F9FB', borderBottom: '1px solid #EEF1F4', fontSize: 13, fontWeight: 700, color: '#30506A' }}>{g.c} <span style={{ fontWeight: 400, color: '#94A0A8' }}>({g.items.length})</span></div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left', color: '#5C6770', fontSize: 11.5 }}>
              <th style={{ padding: '8px 18px', fontWeight: 600 }}>ระบบ / บริการ</th><th style={{ padding: 8, fontWeight: 600 }}>ชื่อผู้ใช้</th><th style={{ padding: 8, fontWeight: 600 }}>รหัสผ่าน</th><th style={{ padding: 8, fontWeight: 600 }}>2FA / กู้คืน</th><th style={{ padding: 8, fontWeight: 600 }}>หมายเหตุ</th><th style={{ padding: 8, fontWeight: 600, textAlign: 'right' }}>แก้ล่าสุด</th><th style={{ padding: '8px 18px' }}></th>
            </tr></thead>
            <tbody>
              {g.items.map((e) => {
                const s = secrets[e.id]; const open = !!revealed[e.id]; const bad = broken.has(e.id)
                return (
                  <tr key={e.id} style={{ borderTop: '1px solid #F1F4F6' }}>
                    <td style={{ padding: '9px 18px' }}>
                      <div style={{ fontWeight: 600 }}>{e.title}</div>
                      {e.url && <a href={/^https?:/i.test(e.url) ? e.url : 'https://' + e.url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: '#30506A' }}>{e.url}</a>}
                    </td>
                    {bad ? <td colSpan={4} style={{ padding: 8, color: '#C24036', fontSize: 12.5 }}>ถอดรหัสไม่ได้ (เข้ารหัสด้วยรหัสผ่านหลักคนละชุด)</td> : (
                      <>
                        <td style={{ padding: 8 }} className="num">{s?.username ? <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{s.username}<button title="คัดลอกชื่อผู้ใช้" onClick={() => copy(e.id, s.username || '', 'ชื่อผู้ใช้')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94A0A8' }}>⧉</button></span> : <span style={{ color: '#C8CFD5' }}>-</span>}</td>
                        <td style={{ padding: 8 }} className="num">
                          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontFamily: open ? 'ui-monospace, Menlo, monospace' : 'inherit' }}>
                            {s?.password ? (open ? s.password : mask) : <span style={{ color: '#C8CFD5' }}>-</span>}
                            {s?.password && <button title={open ? 'ซ่อน' : 'แสดง 30 วินาที'} onClick={() => reveal(e.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94A0A8' }}>{open ? '🙈' : '👁'}</button>}
                            {s?.password && <button title="คัดลอกรหัสผ่าน" onClick={() => copy(e.id, s.password || '', 'รหัสผ่าน')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94A0A8' }}>⧉</button>}
                          </span>
                        </td>
                        <td style={{ padding: 8, fontSize: 12.5 }} className="num">{s?.totp ? (open ? <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', whiteSpace: 'pre-wrap' }}>{s.totp}</span> : mask) : <span style={{ color: '#C8CFD5' }}>-</span>}</td>
                        <td style={{ padding: 8, fontSize: 12.5, color: '#5C6770', maxWidth: 260, whiteSpace: 'pre-wrap' }}>{s?.note || ''}</td>
                      </>
                    )}
                    <td style={{ padding: 8, textAlign: 'right', fontSize: 11.5, color: '#94A0A8', whiteSpace: 'nowrap' }}>{e.updated}<br />{e.updated_by}</td>
                    <td style={{ padding: '8px 18px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {!bad && <button style={btnS} onClick={() => openEdit(e)}>แก้ไข</button>}
                      <button style={{ ...btnS, color: '#C24036', borderColor: '#F0C9C5', marginLeft: 6 }} onClick={() => remove(e)}>ลบ</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      {edit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.45)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 12px', overflow: 'auto' }} onClick={(ev) => { if (ev.target === ev.currentTarget) setEdit(null) }}>
          <div style={{ ...card, width: '100%', maxWidth: 560, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{edit.id ? 'แก้ไขรายการ' : 'เพิ่มรายการใหม่'}</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div><span style={lbl}>ชื่อระบบ / บริการ *</span><input style={field} value={edit.title} autoFocus onChange={(ev) => setEdit({ ...edit, title: ev.target.value })} placeholder="เช่น ธนาคารกสิกร บัญชีบริษัท" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><span style={lbl}>หมวด</span><select style={field} value={edit.category} onChange={(ev) => setEdit({ ...edit, category: ev.target.value })}>{VAULT_CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
                <div><span style={lbl}>URL (ไม่เข้ารหัส)</span><input style={field} value={edit.url} onChange={(ev) => setEdit({ ...edit, url: ev.target.value })} placeholder="https://" /></div>
              </div>
              <div><span style={lbl}>ชื่อผู้ใช้ / อีเมล / เลขบัญชี</span><input style={field} value={edit.username} onChange={(ev) => setEdit({ ...edit, username: ev.target.value })} autoComplete="off" /></div>
              <div>
                <span style={lbl}>รหัสผ่าน</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input style={{ ...field, fontFamily: showPw ? 'ui-monospace, Menlo, monospace' : 'inherit' }} type={showPw ? 'text' : 'password'} value={edit.password} onChange={(ev) => setEdit({ ...edit, password: ev.target.value })} autoComplete="new-password" />
                  <button style={btnS} onClick={() => setShowPw(!showPw)}>{showPw ? 'ซ่อน' : 'แสดง'}</button>
                  <button style={btnS} onClick={genPassword} title="สุ่มรหัสผ่านแข็งแรง 18 ตัว">สุ่ม</button>
                </div>
              </div>
              <div><span style={lbl}>รหัส 2FA / รหัสกู้คืน / คำถามลับ</span><textarea style={{ ...field, minHeight: 60 }} value={edit.totp} onChange={(ev) => setEdit({ ...edit, totp: ev.target.value })} /></div>
              <div><span style={lbl}>หมายเหตุ</span><textarea style={{ ...field, minHeight: 60 }} value={edit.note} onChange={(ev) => setEdit({ ...edit, note: ev.target.value })} placeholder="เช่น เบอร์ที่ผูก OTP, ใครถือบัตร, วันหมดอายุ" /></div>
            </div>
            <div style={{ fontSize: 11.5, color: '#94A0A8', marginTop: 10 }}>ชื่อผู้ใช้ รหัสผ่าน 2FA และหมายเหตุ ถูกเข้ารหัสก่อนส่ง · ชื่อระบบ หมวด URL เก็บแบบอ่านได้เพื่อค้นหา</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button style={btnS} onClick={() => setEdit(null)}>ยกเลิก</button>
              <button style={btnP} disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
