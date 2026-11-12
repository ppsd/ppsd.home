// ถอดแบบ + BOQ บน Cloudflare (ppsd-office.pages.dev/takeoff) ↔ ERP
//  ERP ส่งขึ้นทุก 1 นาที (เฉพาะชุดที่เปลี่ยน): ผู้ใช้ที่มีสิทธิ์ BOQ (+ รหัสตรวจ PIN) · บ้าน · ราคากลางวัสดุ · ชื่อเรียกอื่น · ราคากลางค่าแรง · ค่าตั้ง AI
//  ยังไม่เปิดใช้ (mirror): BOQ ใน ERP เป็นตัวหลัก ส่งขึ้นไปให้ดู
//  เปิดใช้แล้ว (live): BOQ บน Cloudflare เป็นตัวหลัก → ERP ดึงกลับทุก 1 นาที พร้อมงานที่ต้องทำใน ERP:
//    ราคากลางใหม่ (สร้างจริงแล้วตอบรหัสจริงกลับ) · ชื่อเรียกที่จำไว้ · ดัน BOQ เข้าราคาขายบ้าน · ประวัติการใช้งาน · ค่าใช้ AI
import { createHash } from 'node:crypto'

export function createCloudTakeoff(d) {
  // d: { db, getSetting, setSetting, isTakeoffUser(u), canAddPrice(u), aiConfig(), materials(), aliases(), laborRates(),
  //      addMaterialPrice({name,unit,central,note}, by) → id, upsertAlias(alias, unit, mpId, source), mergedTarget(id),
  //      pushBoqToHouse(boq, mode) → grand, audit(who, action, detail), logAiUsage(feature, model, by, ok, usage), notifyChange(keys) }
  const { db } = d
  db.exec(`CREATE TABLE IF NOT EXISTS cloud_takeoff_map (tmp_id INTEGER PRIMARY KEY, erp_id INTEGER, at TEXT);
    CREATE TABLE IF NOT EXISTS cloud_takeoff_seen (k TEXT PRIMARY KEY, at TEXT)`)
  const url = () => String(d.getSetting('cloud_takeoff_url', '') || '').replace(/\/+$/, '') // เช่น https://ppsd-office.pages.dev/takeoff
  const apiBase = () => { try { return new URL(url()).origin + '/api/takeoff' } catch { return '' } }
  const token = () => d.getSetting('cloud_takeoff_token', '')
  const mode = () => (d.getSetting('cloud_takeoff_mode', 'mirror') === 'live' ? 'live' : 'mirror')
  const sha = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex')
  const all = (sql, ...a) => db.prepare(sql).all(...a)
  let have = null, st = {}

  function datasets({ withBoqs }) {
    const pins = new Map(all('SELECT p.user_id, p.secret FROM cloud_user_pins p JOIN users u ON u.id=p.user_id AND u.pin=p.pin_ref').map((r) => [r.user_id, r.secret]))
    const out = {
      users: all("SELECT * FROM users WHERE status='ใช้งาน' ORDER BY id").filter((u) => d.isTakeoffUser(u))
        .map((u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, position: u.position || '', can_add_price: !!d.canAddPrice(u), hash: pins.get(u.id) || null })),
      houses: all('SELECT id, code, name FROM houses ORDER BY id'),
      materials: d.materials(),
      aliases: d.aliases().map((a) => ({ mp_id: a.mp_id, alias: a.alias, nkey: a.nkey, unit: a.unit })),
      labor_rates: d.laborRates(),
      config: d.aiConfig(),
    }
    if (withBoqs) out.boqs = all('SELECT * FROM boqs ORDER BY id')
    return out
  }
  async function post(path, body) {
    const r = await fetch(apiBase() + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status)
    return j
  }
  const seen = (k) => !!db.prepare('SELECT 1 FROM cloud_takeoff_seen WHERE k=?').get(k)
  const markSeen = (k) => db.prepare('INSERT OR IGNORE INTO cloud_takeoff_seen (k, at) VALUES (?, ?)').run(k, new Date().toISOString())
  const BOQ_COLS = ['id', 'no', 'house_code', 'title', 'markup_pct', 'vat_pct', 'items', 'work', 'by', 'date', 'created', 'root_id', 'rev', 'rev_note', 'locked', 'locked_at', 'locked_by']
  // BOQ จาก Cloudflare → ตาราง boqs (เฉพาะแถวที่เปลี่ยน · รหัสราคากลางชั่วคราว → รหัสจริง)
  function applyBoqs(rows, map) {
    const fix = (items) => {
      let list; try { list = JSON.parse(items || '[]') } catch { list = [] }
      for (const it of list) if (Number(it.ref) < 0 && map.has(Number(it.ref))) it.ref = map.get(Number(it.ref))
      return JSON.stringify(list)
    }
    const cur = new Map(all('SELECT * FROM boqs').map((r) => [r.id, r]))
    let n = 0
    for (const raw of rows) {
      const r = Object.fromEntries(BOQ_COLS.map((c) => [c, c === 'items' ? fix(raw.items) : raw[c] ?? null]))
      const old = cur.get(r.id); cur.delete(r.id)
      if (old && BOQ_COLS.every((c) => String(old[c] ?? '') === String(r[c] ?? ''))) continue
      db.prepare(`INSERT INTO boqs (${BOQ_COLS.join(',')}) VALUES (${BOQ_COLS.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${BOQ_COLS.slice(1).map((c) => `${c}=excluded.${c}`).join(',')}`).run(...BOQ_COLS.map((c) => r[c]))
      n++
    }
    for (const old of cur.values()) { db.prepare('DELETE FROM boqs WHERE id=?').run(old.id); n++ }
    return n
  }
  async function pullApply() {
    const p = await post('/pull', {})
    const ackMats = [], ack = { aliases: [], commands: [], audit: [], usage: [] }
    let changed = 0, pushed = 0
    db.transaction(() => {
      // 1) ราคากลางใหม่ → สร้างจริงใน ERP (ครั้งเดียวต่อรหัสชั่วคราว)
      for (const m of p.materials || []) {
        let row = db.prepare('SELECT erp_id FROM cloud_takeoff_map WHERE tmp_id=?').get(m.tmp_id)
        if (!row) {
          const id = d.addMaterialPrice({ name: m.name, unit: m.unit, central: m.central, note: m.note }, m.by || 'ถอดแบบออนไลน์')
          db.prepare('INSERT INTO cloud_takeoff_map (tmp_id, erp_id, at) VALUES (?, ?, ?)').run(m.tmp_id, id, new Date().toISOString())
          row = { erp_id: id }; changed++
        }
        ackMats.push({ tmp_id: m.tmp_id, erp_id: row.erp_id })
      }
      const map = new Map(all('SELECT tmp_id, erp_id FROM cloud_takeoff_map').map((r) => [r.tmp_id, r.erp_id]))
      // 2) ชื่อเรียกที่จำไว้
      for (const a of p.aliases || []) {
        ack.aliases.push(a.id)
        if (seen('alias:' + a.id)) continue
        const id = Number(a.mp_id) < 0 ? map.get(Number(a.mp_id)) : Number(a.mp_id)
        if (id && d.upsertAlias(a.alias, a.unit, d.mergedTarget(id), 'ถอดแบบ')) changed++
        markSeen('alias:' + a.id)
      }
      // 3) BOQ ทั้งหมด (Cloudflare เป็นตัวหลัก)
      if (Array.isArray(p.boqs) && p.mode === 'live') changed += applyBoqs(p.boqs, map)
      // 4) ดัน BOQ เข้าราคาขายบ้าน / งวดลูกค้า (ทำครั้งเดียวต่อคำสั่ง)
      for (const c of p.commands || []) {
        ack.commands.push(c.id)
        if (seen('cmd:' + c.id)) continue
        markSeen('cmd:' + c.id)
        const b = db.prepare('SELECT * FROM boqs WHERE id=?').get(c.boq_id)
        if (!b || c.kind !== 'push-to-house') continue
        try { const grand = d.pushBoqToHouse(b, c.mode); d.audit(c.by, 'ดัน BOQ เข้าราคาขาย (ถอดแบบออนไลน์)', `${b.no} R${b.rev || 1} → ${b.house_code} (${grand.toLocaleString()})`); pushed++ }
        catch (e) { d.audit(c.by, 'ดัน BOQ เข้าราคาขายไม่สำเร็จ (ถอดแบบออนไลน์)', `${b.no}: ${e.message}`) }
      }
      // 5) ประวัติ + ค่าใช้ AI
      for (const a of p.audit || []) { ack.audit.push(a.id); if (!seen('audit:' + a.id)) { d.audit(a.who, a.action + ' (ถอดแบบออนไลน์)', a.detail || ''); markSeen('audit:' + a.id) } }
      for (const u of p.usage || []) {
        ack.usage.push(u.id)
        if (seen('usage:' + u.id)) continue
        let usage = {}; try { usage = JSON.parse(u.data || '{}') } catch { /* ignore */ }
        d.logAiUsage(u.feature, u.model, u.by, !!u.ok, usage); markSeen('usage:' + u.id)
      }
    })()
    await post('/ack', { materials: ackMats, ...ack })
    if (changed || pushed) d.notifyChange(['boqs', 'materials', 'houses', 'installments'])
    return { changed, pushed, cloudMode: p.mode }
  }
  let running = false
  async function syncOnce({ withBoqs = false } = {}) {
    if (!url() || !token() || running) return { skipped: true }
    running = true
    try {
      let pulled = null
      if (mode() === 'live') pulled = await pullApply()
      if (!have) have = (await post('/sync', {})).have || {}
      const ds = datasets({ withBoqs: withBoqs || mode() !== 'live' })
      const changed = Object.entries(ds).map(([name, data]) => ({ name, sha: sha(data), data })).filter((x) => have[x.name] !== x.sha || (withBoqs && x.name === 'boqs'))
      let sent = 0, batch = [], size = 0
      const flush = async () => { if (!batch.length) return; have = (await post('/sync', { datasets: batch })).have || have; sent += batch.length; batch = []; size = 0 }
      for (const x of changed) { const n = JSON.stringify(x.data).length; if (size + n > 1.5e6) await flush(); batch.push(x); size += n }
      await flush()
      st = { ok: true, at: new Date().toISOString(), error: '', sent_last: sent, pulled }
      return { ok: true, sent, pulled }
    } catch (e) {
      have = null
      st = { ...st, ok: false, at: new Date().toISOString(), error: e.message }
      return { ok: false, error: e.message }
    } finally { running = false }
  }
  // live = ทำ BOQ/ถอดแบบบน Cloudflare (ERP ดูอย่างเดียว) · mirror = กลับมาทำใน ERP
  async function setMode(next) {
    if (!['live', 'mirror'].includes(next)) throw new Error('mode')
    if (next === 'live') {
      if (mode() !== 'live') { have = null; const r = await syncOnce({ withBoqs: true }); if (!r.ok) throw new Error(r.error || 'ส่งข้อมูลไม่สำเร็จ') } // ส่ง BOQ ล่าสุดขึ้นไปก่อน
      await post('/mode', { mode: 'live' })
      d.setSetting('cloud_takeoff_mode', 'live')
    } else {
      if (mode() === 'live') await pullApply() // ดึงงานล่าสุดบน Cloudflare กลับมาก่อน
      await post('/mode', { mode: 'mirror' })
      d.setSetting('cloud_takeoff_mode', 'mirror')
      have = null
    }
    return mode()
  }
  return { syncOnce, setMode, mode, pullApply, info: () => ({ url: url(), configured: !!(url() && token()), mode: mode(), ...st }) }
}
