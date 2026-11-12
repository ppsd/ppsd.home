// หน้าลงเวลาบน Cloudflare (ppsd-checkin.pages.dev) — ทำงานได้แม้คอมออฟฟิศปิด
// ERP ในออฟฟิศเป็นระบบหลัก: ส่งรายชื่อ/บ้าน/ค่าตั้งค่า/สถานะวันนี้ขึ้นมา (POST /api/sync) แล้วดึงรายการลงเวลากลับไปบันทึกเอง
// PIN: ตรวจด้วยกุญแจลับเฉพาะลงเวลา (CLOUD_KEY) — ไม่ใช่กุญแจหลักของ ERP · คนที่ยังไม่มี PIN บนนี้ ต้องตอกที่ระบบในออฟฟิศ 1 ครั้งก่อน
const J = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
const err = (msg, status = 400) => J({ error: msg }, status)
// เวลาไทย (UTC+7)
const bkk = () => { const d = new Date(Date.now() + 7 * 3600e3); return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16), ts: d.toISOString().slice(0, 19).replace('T', ' ') } }
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)))
}
const eq = (a, b) => { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0 }
function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000, r = (x) => (x * Math.PI) / 180
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
async function config(db) {
  const rows = (await db.prepare('SELECT k, v FROM config').all()).results || []
  return Object.fromEntries(rows.map((r) => [r.k, r.v]))
}
// ตรวจ PIN + ล็อก 5 นาทีเมื่อผิด 5 ครั้ง
async function checkPin(env, emp, pin) {
  const key = 'emp:' + emp.ref
  const f = await env.DB.prepare('SELECT n, until FROM fails WHERE k=?').bind(key).first()
  if (f && f.until > Date.now()) return 'ใส่ PIN ผิดหลายครั้ง — ล็อกชั่วคราว ลองใหม่ใน 5 นาที'
  if (!emp.hash) return 'ยังเปิดลงเวลาออนไลน์ให้คุณไม่ได้ — ลงเวลาที่เครื่องในออฟฟิศ (หรือลิงก์ในออฟฟิศ) 1 ครั้งก่อน แล้วใช้หน้านี้ได้เลย'
  if (!/^\d{4,8}$/.test(String(pin || '')) || !eq(await hmac(env.CLOUD_KEY, emp.code + ':' + pin), emp.hash)) {
    const n = (f?.n || 0) + 1
    await env.DB.prepare('INSERT INTO fails (k, n, until) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET n=excluded.n, until=excluded.until')
      .bind(key, n >= 5 ? 0 : n, n >= 5 ? Date.now() + 5 * 60e3 : 0).run()
    return 'PIN ไม่ถูกต้อง'
  }
  if (f) await env.DB.prepare('DELETE FROM fails WHERE k=?').bind(key).run()
  return null
}
const numOrNull = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null)

async function punch(env, b) {
  const emp = await env.DB.prepare('SELECT * FROM emps WHERE ref=?').bind(String(b.ref || '')).first()
  if (!emp) return err('ไม่พบชื่อนี้ — รีเฟรชหน้าแล้วเลือกใหม่', 404)
  const bad = await checkPin(env, emp, b.pin); if (bad) return err(bad, bad.includes('ล็อก') ? 429 : 403)
  const cfg = await config(env.DB)
  const lat = numOrNull(b.lat), lng = numOrNull(b.lng), acc = numOrNull(b.accuracy)
  if (cfg.geofence === '1' && cfg.lat && cfg.lng) {
    if (lat == null || lng == null) return err('กรุณาเปิดตำแหน่ง (GPS) เพื่อลงเวลา')
    const d = distanceM(Number(cfg.lat), Number(cfg.lng), lat, lng), radius = Number(cfg.radius) || 200
    if (d > radius) return err(`อยู่นอกพื้นที่ออฟฟิศ — ห่าง ${Math.round(d)} ม. (อนุญาตในรัศมี ${radius} ม.)`, 403)
  }
  const { date, time, ts } = bkk()
  const row = await env.DB.prepare('SELECT * FROM att WHERE ref=? AND date=?').bind(emp.ref, date).first()
  let status = row?.status || ''
  if (b.kind === 'in') {
    if (row?.check_in) return err(`${emp.name} เข้างานแล้วเมื่อ ${row.check_in}`)
    status = time > (cfg.late || '08:05') ? 'สาย' : 'ปกติ'
    await env.DB.prepare("INSERT INTO att (ref, date, check_in, check_out, status) VALUES (?, ?, ?, '', ?) ON CONFLICT(ref, date) DO UPDATE SET check_in=excluded.check_in, status=excluded.status").bind(emp.ref, date, time, status).run()
  } else if (b.kind === 'out') {
    if (!row?.check_in) return err(`${emp.name} ยังไม่ได้เข้างานวันนี้`)
    await env.DB.prepare('UPDATE att SET check_out=? WHERE ref=? AND date=?').bind(time, emp.ref, date).run()
  } else return err('เลือก เข้างาน หรือ ออกงาน')
  await env.DB.prepare("INSERT INTO events (type, ref, code, name, date, time, kind, status, lat, lng, acc, created) VALUES ('punch', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(emp.ref, emp.code, emp.name, date, time, b.kind, status, lat, lng, acc, ts).run()
  return J({ name: emp.name, kind: b.kind, time, status })
}
async function site(env, b) {
  const emp = await env.DB.prepare('SELECT * FROM emps WHERE ref=?').bind(String(b.ref || '')).first()
  if (!emp) return err('ไม่พบชื่อนี้ — รีเฟรชหน้าแล้วเลือกใหม่', 404)
  const bad = await checkPin(env, emp, b.pin); if (bad) return err(bad, bad.includes('ล็อก') ? 429 : 403)
  const lat = numOrNull(b.lat), lng = numOrNull(b.lng), acc = numOrNull(b.accuracy)
  if (lat == null || lng == null) return err('ต้องเปิดตำแหน่ง (GPS) เพื่อเช็คอินหน้างาน')
  const h = await env.DB.prepare('SELECT * FROM houses WHERE code=?').bind(String(b.house || '')).first()
  if (!h) return err('เลือกบ้าน / หน้างาน')
  const { date, time, ts } = bkk()
  await env.DB.prepare("INSERT INTO events (type, ref, code, name, date, time, kind, lat, lng, acc, house, note, created) VALUES ('site', ?, ?, ?, ?, ?, 'site', ?, ?, ?, ?, ?, ?)")
    .bind(emp.ref, emp.code, emp.name, date, time, lat, lng, acc, h.code, String(b.note || '').slice(0, 120), ts).run()
  return J({ name: emp.name, house: h.name, time })
}
// ส่งตำแหน่งงาน (โฟร์แมน) — ทุก 5 นาทีระหว่างเปิดหน้าค้าง
async function track(env, b) {
  const emp = await env.DB.prepare('SELECT * FROM emps WHERE ref=?').bind(String(b.ref || '')).first()
  if (!emp) return err('ไม่พบชื่อนี้ — รีเฟรชหน้าแล้วเลือกใหม่', 404)
  const bad = await checkPin(env, emp, b.pin); if (bad) return err(bad, bad.includes('ล็อก') ? 429 : 403)
  const lat = numOrNull(b.lat), lng = numOrNull(b.lng), acc = numOrNull(b.accuracy)
  if (lat == null || lng == null) return err('อ่านตำแหน่งไม่ได้')
  const { date, time, ts } = bkk()
  await env.DB.prepare("INSERT INTO events (type, ref, code, name, date, time, kind, lat, lng, acc, note, created) VALUES ('track', ?, ?, ?, ?, ?, 'track', ?, ?, ?, ?, ?)")
    .bind(emp.ref, emp.code, emp.name, date, time, lat, lng, acc, String(b.note || 'ติดตามงาน').slice(0, 60), ts).run()
  return J({ ok: true, time })
}
// ตรวจชื่อ + PIN ก่อนเปิดตัวเลือกหน้างาน
async function verify(env, b) {
  const emp = await env.DB.prepare('SELECT * FROM emps WHERE ref=?').bind(String(b.ref || '')).first()
  if (!emp) return err('ไม่พบชื่อนี้ — รีเฟรชหน้าแล้วเลือกใหม่', 404)
  const bad = await checkPin(env, emp, b.pin); if (bad) return err(bad, bad.includes('ล็อก') ? 429 : 403)
  return J({ ok: true, name: emp.name })
}
// ERP ↔ Cloudflare: ส่งข้อมูลขึ้น + รับรายการใหม่กลับ (ต้องมี SYNC_TOKEN)
async function sync(env, req, b) {
  const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!env.SYNC_TOKEN || !eq(auth, env.SYNC_TOKEN)) return err('unauthorized', 401)
  const db = env.DB, st = []
  if (Array.isArray(b.ack) && b.ack.length) for (const id of b.ack.slice(0, 500)) st.push(db.prepare('UPDATE events SET synced=1 WHERE id=?').bind(Number(id)))
  if (Array.isArray(b.employees)) {
    st.push(db.prepare('DELETE FROM emps'))
    b.employees.forEach((e, i) => st.push(db.prepare('INSERT INTO emps (ref, code, name, hash, ord) VALUES (?, ?, ?, ?, ?)').bind(String(e.ref), String(e.code), String(e.name), e.hash || null, i)))
  }
  if (Array.isArray(b.houses)) {
    st.push(db.prepare('DELETE FROM houses'))
    b.houses.forEach((h, i) => st.push(db.prepare('INSERT INTO houses (code, name, ord) VALUES (?, ?, ?)').bind(String(h.code), String(h.name), i)))
  }
  if (b.config && typeof b.config === 'object') for (const [k, v] of Object.entries(b.config)) st.push(db.prepare('INSERT INTO config (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').bind(k, String(v ?? '')))
  // สถานะวันนี้จาก ERP (ตอกในออฟฟิศ) — รวมกับที่ตอกบนนี้ (เอาเวลาเข้าแรกสุด · เวลาออกล่าสุด)
  if (Array.isArray(b.today)) for (const a of b.today) st.push(db.prepare(`INSERT INTO att (ref, date, check_in, check_out, status) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(ref, date) DO UPDATE SET check_in=CASE WHEN att.check_in='' OR (excluded.check_in<>'' AND excluded.check_in<att.check_in) THEN excluded.check_in ELSE att.check_in END,
    check_out=CASE WHEN excluded.check_out>att.check_out THEN excluded.check_out ELSE att.check_out END, status=CASE WHEN att.status='' THEN excluded.status ELSE att.status END`)
    .bind(String(a.ref), String(a.date), a.check_in || '', a.check_out || '', a.status || ''))
  st.push(db.prepare("DELETE FROM att WHERE date < date('now', '-7 days')"))
  st.push(db.prepare("DELETE FROM events WHERE synced=1 AND created < datetime('now', '-30 days')"))
  for (let i = 0; i < st.length; i += 90) await db.batch(st.slice(i, i + 90))
  await db.prepare("INSERT INTO config (k, v) VALUES ('last_sync', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(bkk().ts).run()
  const events = (await db.prepare('SELECT * FROM events WHERE synced=0 ORDER BY id LIMIT 300').all()).results || []
  return J({ ok: true, events })
}

export async function onRequest({ request, env, params }) {
  const path = '/' + [].concat(params.path || []).join('/')
  const m = request.method
  try {
    if (m === 'GET' && path === '/employees') return J(((await env.DB.prepare('SELECT ref, name FROM emps ORDER BY ord').all()).results) || [])
    if (m === 'GET' && path === '/config') {
      const c = await config(env.DB)
      const houses = (await env.DB.prepare('SELECT code, name FROM houses ORDER BY ord').all()).results || []
      return J({ geofence: c.geofence === '1', radius: Number(c.radius) || 200, late: c.late || '08:05', company: c.company || 'PPSD Construction', last_sync: c.last_sync || '', houses })
    }
    if (m === 'POST') {
      let b = {}
      try { b = await request.json() } catch { return err('ข้อมูลไม่ถูกต้อง') }
      if (path === '/punch') return punch(env, b)
      if (path === '/site') return site(env, b)
      if (path === '/track') return track(env, b)
      if (path === '/verify') return verify(env, b)
      if (path === '/sync') return sync(env, request, b)
    }
    return err('ไม่พบ', 404)
  } catch (e) { return err('ระบบขัดข้อง: ' + (e?.message || e), 500) }
}
