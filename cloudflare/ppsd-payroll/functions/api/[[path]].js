// เงินเดือนบน Cloudflare (ppsd-payroll.pages.dev) — สูตรคำนวณใช้ไฟล์เดียวกับ ERP (_lib/payroll-core.js คัดลอกจาก server/payroll-core.js ตอน deploy)
// ขั้น 2: รับข้อมูลจาก ERP (POST /api/sync) + คำนวณเทียบกับ ERP (POST /api/compare) — ทั้งคู่ต้องมี SYNC_TOKEN
import * as core from '../_lib/payroll-core.js'

const J = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
const err = (msg, status = 400) => J({ error: msg }, status)
const eq = (a, b) => { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0 }
const isSync = (env, req) => !!env.SYNC_TOKEN && eq((req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''), env.SYNC_TOKEN)
const bkkTs = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace('T', ' ')

// โหลดชุดข้อมูลจาก ds (ชื่อ → ข้อมูล JSON)
async function loadDs(db, names) {
  const out = {}
  for (const n of names) {
    const r = await db.prepare('SELECT data FROM ds WHERE name=?').bind(n).first()
    out[n] = r ? JSON.parse(r.data) : null
  }
  return out
}
// ข้อมูลที่สูตรเงินเดือนต้องใช้ของงวดหนึ่ง (รูปแบบเดียวกับ payrollData() ใน ERP)
async function payrollData(db, period) {
  const d = await loadDs(db, ['employees', 'att:' + period, 'time_adjustments', 'leaves', 'holidays', 'ot', 'payroll_inputs', 'salary_advances', 'deductions', 'other_income', 'payroll_runs'])
  const { from, to } = core.periodBounds(period)
  return {
    employees: d.employees || [],
    attendance: d['att:' + period] || [],
    time_adjustments: d.time_adjustments || [],
    leaves: d.leaves || [],
    holidays: (d.holidays || []).filter((h) => h.date >= from && h.date <= to),
    ot: d.ot || [],
    payroll_inputs: (d.payroll_inputs || []).filter((x) => x.period === period),
    salary_advances: (d.salary_advances || []).filter((x) => x.period === period),
    deductions: (d.deductions || []).filter((x) => x.period === period),
    other_income: (d.other_income || []).filter((x) => x.period === period),
    runs: (d.payroll_runs || []).map((r) => ({ period: r.period, rows: r.rows || [] })),
  }
}

async function sync(env, b) {
  const st = []
  const now = bkkTs()
  for (const x of Array.isArray(b.datasets) ? b.datasets : []) {
    if (!x || typeof x.name !== 'string' || typeof x.sha !== 'string') continue
    if (x.data === null) { st.push(env.DB.prepare('DELETE FROM ds WHERE name=?').bind(x.name)); continue }
    st.push(env.DB.prepare('INSERT INTO ds (name, sha, data, at) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET sha=excluded.sha, data=excluded.data, at=excluded.at').bind(x.name, x.sha, JSON.stringify(x.data), now))
  }
  for (let i = 0; i < st.length; i += 50) await env.DB.batch(st.slice(i, i + 50))
  await env.DB.prepare("INSERT INTO meta (k, v) VALUES ('last_sync', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(now).run()
  const have = Object.fromEntries(((await env.DB.prepare('SELECT name, sha FROM ds').all()).results || []).map((r) => [r.name, r.sha]))
  return J({ ok: true, have, received: st.length })
}

export async function onRequest({ request, env, params }) {
  const path = '/' + [].concat(params.path || []).join('/')
  try {
    if (request.method === 'POST' && (path === '/sync' || path === '/compare')) {
      if (!isSync(env, request)) return err('unauthorized', 401)
      let b = {}
      try { b = await request.json() } catch { return err('ข้อมูลไม่ถูกต้อง') }
      if (path === '/sync') return sync(env, b)
      if (!/^\d{4}-\d{2}$/.test(String(b.period || ''))) return err('ระบุงวด')
      return J({ period: b.period, rows: core.computePayroll(await payrollData(env.DB, b.period), b.period) })
    }
    if (request.method === 'GET' && path === '/health') return J({ ok: true, last_sync: (await env.DB.prepare("SELECT v FROM meta WHERE k='last_sync'").first())?.v || '' })
    return err('ไม่พบ', 404)
  } catch (e) { return err('ระบบขัดข้อง: ' + (e?.message || e), 500) }
}
