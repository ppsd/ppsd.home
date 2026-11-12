// เงินเดือนบน Cloudflare (ppsd-office.pages.dev/payroll) — สูตรคำนวณใช้ไฟล์เดียวกับ ERP (_lib/payroll-core.js คัดลอกจาก server/payroll-core.js ตอน deploy)
// ERP ↔ ที่นี่: POST /api/payroll/sync (ERP ส่งชุดข้อมูลขึ้น) · POST /api/payroll/compare (เทียบตัวเลข) — ต้องมี PAY_SYNC_TOKEN
// ผู้ใช้: POST /login (ชื่อผู้ใช้ + PIN เดิม) → โทเคน 12 ชม. · สิทธิ์เหมือน ERP (ดู = แอดมิน/บัญชี/ผู้จัดการ-CEO/บุคคล · แก้ = แอดมิน/บัญชี)
// PIN: ตรวจด้วย PIN_KEY (รหัสตรวจเฉพาะเงินเดือน สร้างตอนล็อกอิน ERP สำเร็จ) — ไม่ใช่กุญแจหลักของ ERP
import * as core from '../../_lib/payroll-core.js'

const J = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
const err = (msg, status = 400) => J({ error: msg }, status)
const eq = (a, b) => { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0 }
const bkkTs = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace('T', ' ')
const bkkPeriod = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7)
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const b64u = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64u = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)))
}
const isSync = (env, req) => !!env.PAY_SYNC_TOKEN && eq((req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''), env.PAY_SYNC_TOKEN)

async function getDs(db, name) { const r = await db.prepare('SELECT data FROM ds WHERE name=?').bind(name).first(); return r ? JSON.parse(r.data) : null }
// ข้อมูลที่สูตรเงินเดือนต้องใช้ของงวดหนึ่ง (รูปแบบเดียวกับ payrollData() ใน ERP)
async function payrollData(db, period) {
  const names = ['employees', 'att:' + period, 'time_adjustments', 'leaves', 'holidays', 'ot', 'payroll_inputs', 'salary_advances', 'deductions', 'other_income', 'payroll_runs']
  const d = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await getDs(db, n)])))
  const { from, to } = core.periodBounds(period)
  const inP = (x) => x.period === period
  return {
    employees: d.employees || [], attendance: d['att:' + period] || [], time_adjustments: d.time_adjustments || [], leaves: d.leaves || [],
    holidays: (d.holidays || []).filter((h) => h.date >= from && h.date <= to), ot: d.ot || [],
    payroll_inputs: (d.payroll_inputs || []).filter(inP), salary_advances: (d.salary_advances || []).filter(inP),
    deductions: (d.deductions || []).filter(inP), other_income: (d.other_income || []).filter(inP),
    runs: (d.payroll_runs || []).map((r) => ({ period: r.period, rows: r.rows || [] })),
  }
}
// แถวเงินเดือนทั้งงวด: คนที่ทำจ่ายแล้ว = snapshot ของรอบนั้น · คนที่ยังไม่จ่าย = คำนวณสด (เหมือน periodRows() ใน ERP)
async function periodRows(db, period) {
  const batches = ((await getDs(db, 'payroll_batches')) || []).filter((b) => b.period === period)
  const paid = new Map()
  for (const b of batches.filter((x) => x.status === 'closed').sort((a, c) => a.seq - c.seq)) for (const row of b.data || []) paid.set(row.code, { b, row })
  const done = [...paid.values()].map(({ b, row }) => ({ ...row, paid: true, batch_id: b.id, batch_no: b.no, pay_date: b.pay_date, batch_note: b.note || '' }))
  const live = core.computePayroll(await payrollData(db, period), period).filter((r) => !paid.has(r.code)).map((r) => ({ ...r, paid: false }))
  const rows = [...done, ...live].sort((a, c) => (a.id || 0) - (c.id || 0)).map((r) => ({ ...r, net: core.r2(core.netOf(r)) }))
  const info = batches.sort((a, c) => a.seq - c.seq).map((b) => ({ id: b.id, period: b.period, seq: b.seq, no: b.no, pay_date: b.pay_date, note: b.note || '', status: b.status, count: (b.data || []).length,
    total: core.r2((b.data || []).reduce((s, p) => s + core.netOf(p), 0)), closed_at: b.closed_at, closed_by: b.closed_by }))
  return { rows, batches: info }
}

// ---- ลงชื่อเข้าใช้ ----
async function users(db) { return (await getDs(db, 'users')) || [] }
async function signToken(env, uid) { const body = b64u(JSON.stringify({ uid, exp: Date.now() + 12 * 3600e3 })); return body + '.' + await hmac(env.SESSION_KEY, body) }
async function authUser(env, req) {
  const t = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const [body, sig] = t.split('.')
  if (!body || !sig || !eq(await hmac(env.SESSION_KEY, body), sig)) return null
  let p; try { p = JSON.parse(unb64u(body)) } catch { return null }
  if (!p.exp || p.exp < Date.now()) return null
  const u = (await users(env.PAY_DB)).find((x) => x.id === p.uid)
  return u && u.can_view ? u : null // ถูกปิดบัญชี/ถอดสิทธิ์ใน ERP → หลุดภายใน 1 นาที
}
async function login(env, b) {
  const uname = String(b.username || '').trim().toLowerCase(), pin = String(b.pin || '')
  const key = 'login:' + uname
  const f = await env.PAY_DB.prepare('SELECT n, until FROM fails WHERE k=?').bind(key).first()
  if (f && f.until > Date.now()) return err('ใส่ PIN ผิดหลายครั้ง — ล็อกชั่วคราว ลองใหม่ใน 5 นาที', 429)
  const u = (await users(env.PAY_DB)).find((x) => String(x.username || '').toLowerCase() === uname)
  const ok = u && u.can_view && u.hash && /^\d{4,8}$/.test(pin) && eq(await hmac(env.PIN_KEY, uname + ':' + pin), u.hash)
  if (!ok) {
    const n = (f?.n || 0) + 1
    await env.PAY_DB.prepare('INSERT INTO fails (k, n, until) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET n=excluded.n, until=excluded.until').bind(key, n >= 5 ? 0 : n, n >= 5 ? Date.now() + 5 * 60e3 : 0).run()
    if (u && u.can_view && !u.hash) return err('ยังเปิดใช้เงินเดือนออนไลน์ให้บัญชีนี้ไม่ได้ — ล็อกอิน ERP ในออฟฟิศ 1 ครั้งก่อน แล้วกลับมาล็อกอินที่นี่', 403)
    return err('ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง (หรือบัญชีนี้ไม่มีสิทธิ์ดูเงินเดือน)', 401)
  }
  if (f) await env.PAY_DB.prepare('DELETE FROM fails WHERE k=?').bind(key).run()
  await env.PAY_DB.prepare('INSERT INTO audit (at, who, action, detail) VALUES (?, ?, ?, ?)').bind(bkkTs(), u.name, 'ล็อกอินเงินเดือนออนไลน์', '').run()
  return J({ token: await signToken(env, u.id), user: pub(u) })
}
const pub = (u) => ({ id: u.id, name: u.name, username: u.username, can_edit: !!u.can_edit })

async function sync(env, b) {
  const st = [], now = bkkTs()
  for (const x of Array.isArray(b.datasets) ? b.datasets : []) {
    if (!x || typeof x.name !== 'string' || typeof x.sha !== 'string') continue
    if (x.data === null) { st.push(env.PAY_DB.prepare('DELETE FROM ds WHERE name=?').bind(x.name)); continue }
    st.push(env.PAY_DB.prepare('INSERT INTO ds (name, sha, data, at) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET sha=excluded.sha, data=excluded.data, at=excluded.at').bind(x.name, x.sha, JSON.stringify(x.data), now))
  }
  for (let i = 0; i < st.length; i += 50) await env.PAY_DB.batch(st.slice(i, i + 50))
  await env.PAY_DB.prepare("INSERT INTO meta (k, v) VALUES ('last_sync', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(now).run()
  const have = Object.fromEntries(((await env.PAY_DB.prepare('SELECT name, sha FROM ds').all()).results || []).map((r) => [r.name, r.sha]))
  return J({ ok: true, have, received: st.length })
}

export async function onRequest({ request, env, params }) {
  const path = '/' + [].concat(params.path || []).join('/')
  const m = request.method
  try {
    let b = {}
    if (m === 'POST') { try { b = await request.json() } catch { return err('ข้อมูลไม่ถูกต้อง') } }
    // ---- ERP ↔ Cloudflare ----
    if (m === 'POST' && (path === '/sync' || path === '/compare')) {
      if (!isSync(env, request)) return err('unauthorized', 401)
      if (path === '/sync') return sync(env, b)
      if (!/^\d{4}-\d{2}$/.test(String(b.period || ''))) return err('ระบุงวด')
      return J({ period: b.period, rows: core.computePayroll(await payrollData(env.PAY_DB, b.period), b.period) })
    }
    if (m === 'GET' && path === '/health') return J({ ok: true, last_sync: (await env.PAY_DB.prepare("SELECT v FROM meta WHERE k='last_sync'").first())?.v || '' })
    if (m === 'POST' && path === '/login') return login(env, b)
    // ---- ต้องล็อกอิน ----
    const u = await authUser(env, request)
    if (!u) return err('กรุณาล็อกอินใหม่', 401)
    if (m === 'GET' && path === '/me') return J({ user: pub(u), last_sync: (await env.PAY_DB.prepare("SELECT v FROM meta WHERE k='last_sync'").first())?.v || '', mode: (await env.PAY_DB.prepare("SELECT v FROM meta WHERE k='mode'").first())?.v || 'mirror' })
    if (m === 'GET' && path === '/payroll') {
      const url = new URL(request.url)
      const period = /^\d{4}-\d{2}$/.test(url.searchParams.get('period') || '') ? url.searchParams.get('period') : bkkPeriod()
      const { rows, batches } = await periodRows(env.PAY_DB, period)
      const paidCount = rows.filter((r) => r.paid).length
      return J({ period, periodLabel: core.periodLabelTH(period), days_in_month: core.periodBounds(period).dim, locked: rows.length > 0 && paidCount === rows.length, paid_count: paidCount, batches, rows,
        total: core.r2(rows.reduce((s, r) => s + r.net, 0)) })
    }
    return err('ไม่พบ', 404)
  } catch (e) { return err('ระบบขัดข้อง: ' + (e?.message || e), 500) }
}
