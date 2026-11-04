// ===== ศูนย์วิเคราะห์ธุรกิจ (Business Intelligence) — เฉพาะ CEO + ผู้จัดการ (หน้าเว็บต้องยืนยัน PIN) =====
//  1) ตรวจการเงิน/บัญชี (ไม่ใช้ AI · คำนวณสดจากข้อมูลจริง): กำไรต่อหลัง · ลูกค้าค้างจ่าย · หนี้ผู้ขายเลยกำหนด · เงินสดพอจ่ายไหม ฯลฯ
//  2) รายงาน AI 5 หัวข้อ (ค้นเว็บเองได้):
//     world = เศรษฐกิจโลก/ไทย/วิกฤต · materials = วัสดุก่อสร้าง · competitors = คู่แข่ง
//     critic = "ลูกค้าที่ฉลาดที่สุดในโลก" จับผิดบริษัทเรา · tycoon = มุมมองนักธุรกิจระดับโลก (แบบ ลี กาชิง / CK Group + กรอบการค้าโลกแบบ WTO) + สิ่งที่ควรปรับ
//     sales = กลยุทธ์การตลาด/การขาย (ทำท้ายสุด ใช้ผลทุกหัวข้อ + ข้อมูล CRM) → แผนให้ฝ่ายขายหาลูกค้า + ปิดการขาย
//  3) แจ้งเตือน: ข้อเตือนจาก AI (เก็บในตาราง intel_alerts) + ข้อเตือนการเงิน → ส่ง LINE ผู้บริหารเมื่อมีเรื่องด่วน
//  รันอัตโนมัติวันละครั้ง (ตั้งเวลา/ปิดได้) + กดสั่งเองได้ · ข้อมูลที่ส่งให้ AI ใช้รหัสบ้าน ไม่ส่งชื่อ/เบอร์ลูกค้า

export const INTEL_KINDS = {
  world: { label: 'เศรษฐกิจโลก / วิกฤต', web: true, maxUses: 6 },
  materials: { label: 'วัสดุก่อสร้าง', web: true, maxUses: 6 },
  competitors: { label: 'คู่แข่ง', web: true, maxUses: 8 },
  critic: { label: 'ลูกค้าที่ฉลาดที่สุดในโลก', web: false },
  tycoon: { label: 'มุมมองนักธุรกิจระดับโลก', web: false },
  sales: { label: 'กลยุทธ์การตลาด/การขาย', web: true, maxUses: 6 },
}
// sales ทำท้ายสุด — ใช้ผลทุกหัวข้อก่อนหน้ามาวางแผนให้ฝ่ายขายหาลูกค้า + ปิดการขาย
const ORDER = ['world', 'materials', 'competitors', 'critic', 'tycoon', 'sales']
const SEVS = ['high', 'med', 'low']

// ดึง JSON ก้อนสุดท้ายจากคำตอบ AI (รองรับ ```json ... ``` และข้อความนำหน้าจากการค้นเว็บ)
export function parseAiJson(text) {
  if (!text) return null
  const fences = [...String(text).matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1])
  for (const f of fences.reverse()) { try { return JSON.parse(f) } catch { /* ลองแบบถัดไป */ } }
  const s = String(text)
  // ลองจากวงเล็บ { ตัวแรกที่ parse ได้ถึง } ตัวสุดท้าย
  const end = s.lastIndexOf('}')
  for (let i = s.indexOf('{'); i >= 0 && i < end; i = s.indexOf('{', i + 1)) {
    try { return JSON.parse(s.slice(i, end + 1)) } catch { /* ลองตำแหน่งถัดไป */ }
  }
  return null
}

const str = (v, n = 600) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const num = (v) => Number(v) || 0
const daysBetween = (aIso, bIso) => Math.round((Date.parse(bIso) - Date.parse(aIso)) / 86400000)

// ทำให้ผลจาก AI อยู่ในรูปที่หน้าเว็บแสดงได้แน่นอน
export function normalizeReport(p) {
  const o = p && typeof p === 'object' ? p : {}
  const sections = (Array.isArray(o.sections) ? o.sections : []).slice(0, 12).map((s) => ({
    title: str(s?.title, 150), points: (Array.isArray(s?.points) ? s.points : []).slice(0, 12).map((x) => str(x, 700)).filter(Boolean),
  })).filter((s) => s.title || s.points.length)
  const alerts = (Array.isArray(o.alerts) ? o.alerts : []).slice(0, 12).map((a) => ({
    sev: SEVS.includes(a?.sev) ? a.sev : 'med', title: str(a?.title, 200), detail: str(a?.detail, 800), action: str(a?.action, 600),
  })).filter((a) => a.title)
  const sources = (Array.isArray(o.sources) ? o.sources : []).slice(0, 20).map((s) => ({ title: str(s?.title, 200), url: str(s?.url, 500) }))
    .filter((s) => /^https?:\/\//.test(s.url))
  const competitors = (Array.isArray(o.competitors) ? o.competitors : []).slice(0, 15).map((c) => ({
    name: str(c?.name, 120), area: str(c?.area, 120), website: /^https?:\/\//.test(String(c?.website || '')) ? str(c.website, 300) : '',
    price_range: str(c?.price_range, 200), strengths: str(c?.strengths, 500), weaknesses: str(c?.weaknesses, 500), vs_us: str(c?.vs_us, 500),
  })).filter((c) => c.name)
  const score = Number.isFinite(Number(o.score)) && o.score !== '' && o.score != null ? Math.max(0, Math.min(100, Math.round(Number(o.score)))) : null
  return { summary: str(o.summary, 1500), score, sections, alerts, sources, competitors }
}

export function createIntel({ db, aiAsk, aiKey, audit, nowTS, todayISO, getSetting, setSetting, linePush, cashBalance, managersWithLine, notifyChange, baht }) {
  db.exec(`CREATE TABLE IF NOT EXISTS intel_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, created TEXT, by TEXT, ok INTEGER,
    summary TEXT, score INTEGER, body TEXT, error TEXT, model TEXT, cost_usd REAL
  )`)
  db.exec('CREATE INDEX IF NOT EXISTS idx_intel_reports_kind ON intel_reports(kind, id)')
  db.exec(`CREATE TABLE IF NOT EXISTS intel_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, report_id INTEGER, sev TEXT, title TEXT, detail TEXT, action TEXT,
    status TEXT DEFAULT 'open', created TEXT, ack_by TEXT, ack_at TEXT, ack_note TEXT
  )`)
  db.exec('CREATE INDEX IF NOT EXISTS idx_intel_alerts_status ON intel_alerts(status)')
  db.exec(`CREATE TABLE IF NOT EXISTS intel_competitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, area TEXT, website TEXT, note TEXT, source TEXT, active INTEGER DEFAULT 1, created TEXT, by TEXT
  )`)

  const safe = (fn, fb) => { try { return fn() } catch { return fb } }

  // ---------- 1) ภาพรวมข้อมูลบริษัท (ใช้ทั้งตรวจการเงินและส่งให้ AI) ----------
  function snapshot() {
    const today = todayISO()
    const ago = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)
    const houses = safe(() => db.prepare("SELECT code, name, status, kind, value, collected, remain, contractor_value, paid, pct, start_date, deliver_date, area_sqm FROM houses WHERE COALESCE(status,'') != 'test' AND COALESCE(kind,'') != 'test'").all(), [])
    const expByHouse = new Map(safe(() => db.prepare("SELECT house_code c, COALESCE(SUM(amount),0) a FROM expenses WHERE house_code IS NOT NULL AND house_code != '' AND COALESCE(status,'') NOT IN ('ปฏิเสธ','ยกเลิก') GROUP BY house_code").all(), []).map((r) => [r.c, r.a]))
    const houseRows = houses.map((h) => {
      const value = num(h.value), plan = num(h.contractor_value), exp = num(expByHouse.get(h.code))
      const cost = plan + exp
      const margin = value - cost
      return {
        code: h.code, name: h.name, status: h.status || '', kind: h.kind || '', value, contractor_plan: plan, contractor_paid: num(h.paid), other_expense: exp,
        est_margin: margin, est_margin_pct: value > 0 ? Math.round((margin / value) * 1000) / 10 : null,
        collected: num(h.collected), remain: num(h.remain), pct: num(h.pct), start_date: h.start_date || '', deliver_date: h.deliver_date || '', area_sqm: num(h.area_sqm),
        overpaid_contractor: plan > 0 && num(h.paid) > plan ? num(h.paid) - plan : 0,
      }
    })
    const active = houseRows.filter((h) => h.status !== 'ส่งมอบแล้ว' && h.status !== 'after-service')
    // ลูกค้าค้างจ่าย (งวดเลยกำหนด)
    const arRows = safe(() => db.prepare("SELECT house_code, no, amount, COALESCE(paid,0) paid, due_iso FROM installments WHERE side != 'contractor' AND status != 'เก็บแล้ว' AND due_iso IS NOT NULL AND due_iso != '' AND due_iso < ? AND COALESCE(paid,0) < amount").all(today), [])
      .map((r) => ({ house_code: r.house_code, no: r.no, due: r.due_iso, owed: num(r.amount) - num(r.paid), days: daysBetween(r.due_iso, today) }))
    const arDue30 = safe(() => db.prepare("SELECT COALESCE(SUM(amount - COALESCE(paid,0)),0) a FROM installments WHERE side != 'contractor' AND COALESCE(paid,0) < amount AND due_iso >= ? AND due_iso <= ?").get(today, new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)).a, 0)
    // เจ้าหนี้: PO เครดิตค้างจ่าย + งวดช่างที่ถึงกำหนดใน 30 วัน
    let apOver = 0, apOverN = 0, apNext30 = 0
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    for (const po of safe(() => db.prepare("SELECT id, amount, due_iso FROM purchase_orders WHERE payment_type='credit' AND status IN ('รับของแล้ว','ปิดงาน')").all(), [])) {
      const paid = safe(() => db.prepare("SELECT COALESCE(SUM(gross),0) a FROM payments WHERE po_id=? AND COALESCE(status,'') != 'ปฏิเสธ'").get(po.id).a, 0)
      const rem = Math.max(0, num(po.amount) - paid)
      if (!rem) continue
      if (po.due_iso && po.due_iso < today) { apOver += rem; apOverN++ }
      else if (!po.due_iso || po.due_iso <= in30) apNext30 += rem
    }
    const conNext30 = safe(() => db.prepare("SELECT COALESCE(SUM(amount - COALESCE(paid,0)),0) a FROM installments WHERE side='contractor' AND COALESCE(paid,0) < amount AND due_iso IS NOT NULL AND due_iso != '' AND due_iso <= ?").get(in30).a, 0)
    // รายจ่ายรายเดือน 6 เดือนล่าสุด + หมวดใหญ่ 12 เดือน
    const expMonthly = safe(() => db.prepare("SELECT substr(date_iso,1,7) m, COALESCE(SUM(amount),0) a FROM expenses WHERE date_iso >= ? AND COALESCE(status,'') NOT IN ('ปฏิเสธ','ยกเลิก') GROUP BY m ORDER BY m").all(ago(186)), [])
    const expByCat = safe(() => db.prepare("SELECT COALESCE(NULLIF(cat,''),'ไม่ระบุ') cat, COALESCE(SUM(amount),0) a FROM expenses WHERE date_iso >= ? AND COALESCE(status,'') NOT IN ('ปฏิเสธ','ยกเลิก') GROUP BY cat ORDER BY a DESC LIMIT 10").all(ago(365)), [])
    const noTaxInvoice = safe(() => db.prepare("SELECT COUNT(*) n, COALESCE(SUM(amount),0) a FROM expenses WHERE date_iso >= ? AND amount >= 1000 AND COALESCE(tax_invoice_no,'') = '' AND COALESCE(status,'') NOT IN ('ปฏิเสธ','ยกเลิก')").get(ago(90)), { n: 0, a: 0 })
    // หน้างาน / คุณภาพ
    const issuesOpen = safe(() => db.prepare("SELECT COALESCE(priority,'') p, COUNT(*) n FROM issues WHERE COALESCE(status,'') NOT IN ('แก้แล้ว','ปิด','เสร็จ','เสร็จแล้ว') GROUP BY p").all(), [])
    const issueTitles = safe(() => db.prepare("SELECT house_code, title, priority, date FROM issues WHERE COALESCE(status,'') NOT IN ('แก้แล้ว','ปิด','เสร็จ','เสร็จแล้ว') ORDER BY id DESC LIMIT 25").all(), [])
    const siteDocs = safe(() => db.prepare("SELECT kind, status, COUNT(*) n, COALESCE(SUM(cost_impact),0) cost, COALESCE(SUM(days_impact),0) days FROM site_docs GROUP BY kind, status").all(), [])
    const ncrOpen = safe(() => db.prepare("SELECT house_code, title, date, created FROM site_docs WHERE kind='ncr' AND COALESCE(status,'') NOT IN ('ปิด','ปิดแล้ว','แก้ไขแล้ว') ORDER BY id DESC LIMIT 20").all(), [])
    const qc = safe(() => db.prepare("SELECT COALESCE(status,'') s, COUNT(*) n FROM qc_inspections WHERE COALESCE(created,'') >= ? GROUP BY s").all(ago(180)), [])
    const woLate = safe(() => db.prepare("SELECT COUNT(*) n FROM work_orders WHERE due_date IS NOT NULL AND due_date != '' AND due_date < ? AND COALESCE(status,'') NOT IN ('เสร็จ','ปิดงาน','ยกเลิก','ผ่าน')").get(today).n, 0)
    const lateHouses = houseRows.filter((h) => h.deliver_date && /^\d{4}-\d{2}-\d{2}$/.test(h.deliver_date) && h.deliver_date < today && h.status !== 'ส่งมอบแล้ว' && h.status !== 'after-service')
      .map((h) => ({ code: h.code, deliver_date: h.deliver_date, pct: h.pct, days_late: daysBetween(h.deliver_date, today) }))
    // ลูกค้า / การขาย
    const leadStages = safe(() => db.prepare("SELECT COALESCE(stage,'') stage, COUNT(*) n FROM leads WHERE COALESCE(created,'') >= ? GROUP BY stage").all(ago(365)), [])
    const lostReasons = safe(() => db.prepare("SELECT lost_reason r, COUNT(*) n FROM leads WHERE COALESCE(lost_reason,'') != '' GROUP BY r ORDER BY n DESC LIMIT 10").all(), [])
    const leads30 = safe(() => db.prepare('SELECT COUNT(*) n FROM leads WHERE COALESCE(created,\'\') >= ?').get(ago(30)).n, 0)
    const leadSources = safe(() => db.prepare("SELECT COALESCE(NULLIF(source,''),'ไม่ระบุ') s, COUNT(*) n FROM leads WHERE COALESCE(created,'') >= ? GROUP BY s ORDER BY n DESC LIMIT 8").all(ago(365)), [])
    // ช่องทางไหนได้ลูกค้าจริง (12 เดือน) · ใช้เวลาปิดกี่วัน · Lead ที่ไม่ได้ติดต่อเกิน 7 วัน · มูลค่าในท่อขาย
    const bySource = safe(() => db.prepare("SELECT COALESCE(NULLIF(source,''),'ไม่ระบุ') source, COUNT(*) leads, SUM(CASE WHEN stage='เซ็นสัญญา' THEN 1 ELSE 0 END) won, SUM(CASE WHEN stage='ยกเลิก' THEN 1 ELSE 0 END) lost FROM leads WHERE COALESCE(created,'') >= ? GROUP BY source ORDER BY leads DESC LIMIT 12").all(ago(365)), [])
    const daysToWin = safe(() => db.prepare("SELECT AVG(julianday(substr(won_at,1,10)) - julianday(substr(created,1,10))) d FROM leads WHERE won_at IS NOT NULL AND created IS NOT NULL AND won_at >= ?").get(ago(365)).d, null)
    const openLeads = safe(() => db.prepare("SELECT stage, budget, value, COALESCE(contacted_at, updated, created) last FROM leads WHERE stage NOT IN ('เซ็นสัญญา','ยกเลิก')").all(), [])
    const idle7 = openLeads.filter((l) => l.last && daysBetween(String(l.last).slice(0, 10), today) >= 7).length
    const pipeValue = openLeads.reduce((a, l) => a + num(l.value || l.budget), 0)
    const leadProfile = safe(() => db.prepare("SELECT COALESCE(NULLIF(house_type,''),'ไม่ระบุ') type, COALESCE(NULLIF(area,''),'ไม่ระบุ') area, COUNT(*) n, ROUND(AVG(NULLIF(budget,0))) avg_budget FROM leads WHERE COALESCE(created,'') >= ? GROUP BY type, area ORDER BY n DESC LIMIT 12").all(ago(365)), [])
    const nps = safe(() => db.prepare('SELECT COUNT(*) n, AVG(score) avg, SUM(CASE WHEN score <= 6 THEN 1 ELSE 0 END) detract FROM nps WHERE score IS NOT NULL').get(), null)
    const npsComments = safe(() => db.prepare("SELECT score, comment FROM nps WHERE COALESCE(comment,'') != '' ORDER BY id DESC LIMIT 15").all(), [])
    // ราคาวัสดุที่เราซื้อจริง: เปลี่ยนแปลงมากใน 180 วัน
    const priceMoves = safe(() => db.prepare("SELECT name, unit, old_price, new_price, at FROM material_price_history WHERE old_price > 0 AND new_price > 0 AND COALESCE(at,'') >= ? ORDER BY id DESC LIMIT 400").all(ago(180)), [])
      .map((r) => ({ name: r.name, unit: r.unit, old: r.old_price, new: r.new_price, pct: Math.round(((r.new_price - r.old_price) / r.old_price) * 1000) / 10, at: String(r.at || '').slice(0, 10) }))
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 25)
    const topMaterials = safe(() => db.prepare('SELECT name, unit, central, latest, po_count FROM material_prices WHERE active=1 ORDER BY COALESCE(qty_total,0) * COALESCE(central,0) DESC LIMIT 25').all(), [])
    const cash = safe(() => cashBalance(), null)
    const sum = (arr, k) => arr.reduce((s, x) => s + num(x[k]), 0)
    return {
      today, cash,
      houses: { total: houseRows.length, active: active.length, delivered: houseRows.filter((h) => h.status === 'ส่งมอบแล้ว').length, value_active: sum(active, 'value'), value_all: sum(houseRows, 'value'), collected_all: sum(houseRows, 'collected'), remain_active: sum(active, 'remain'), rows: houseRows },
      ar: { overdue_n: arRows.length, overdue_amt: sum(arRows, 'owed'), over30_n: arRows.filter((r) => r.days > 30).length, over30_amt: sum(arRows.filter((r) => r.days > 30), 'owed'), oldest_days: arRows.reduce((m, r) => Math.max(m, r.days), 0), due_next30: arDue30, rows: arRows.sort((a, b) => b.days - a.days).slice(0, 20) },
      ap: { overdue_n: apOverN, overdue_amt: apOver, po_next30: apNext30, contractor_next30: conNext30 },
      expenses: { monthly: expMonthly, by_cat_12m: expByCat, no_tax_invoice_90d: noTaxInvoice },
      site: { issues_open: issuesOpen, issue_titles: issueTitles, site_docs: siteDocs, ncr_open: ncrOpen, qc_180d: qc, wo_late: woLate, late_houses: lateHouses },
      sales: { leads_30d: leads30, stages_12m: leadStages, lost_reasons: lostReasons, sources_12m: leadSources, by_source_12m: bySource, avg_days_to_win: daysToWin == null ? null : Math.round(daysToWin), open_leads: openLeads.length, idle_7d: idle7, pipeline_value: pipeValue, lead_profile_12m: leadProfile, nps, nps_comments: npsComments },
      materials: { price_moves_180d: priceMoves, top_used: topMaterials },
    }
  }

  // ---------- 2) ตรวจการเงิน/บัญชี (กติกาตายตัว ไม่ใช้ AI) ----------
  function financeCheck(snap = snapshot()) {
    const f = []
    const add = (sev, key, title, detail, action) => f.push({ sev, key: 'intel:fin:' + key, kind: 'finance', title, detail, action })
    for (const h of snap.houses.rows) {
      if (!h.value || (!h.contractor_plan && !h.other_expense)) continue
      if (h.est_margin < 0) add('high', 'loss:' + h.code, `บ้าน ${h.code} ต้นทุนเกินราคาขาย (ขาดทุนประมาณ ${baht(-h.est_margin)})`, `ราคาขาย ${baht(h.value)} · ค่าช่างตามสัญญา ${baht(h.contractor_plan)} · รายจ่ายอื่น ${baht(h.other_expense)}`, 'ตรวจรายจ่ายที่ลงบ้านนี้ว่าถูกบ้านไหม / เจรจา VO เพิ่มเงินกับลูกค้า / คุมรายจ่ายที่เหลือ')
      else if (h.est_margin_pct != null && h.est_margin_pct < 10) add('med', 'thin:' + h.code, `บ้าน ${h.code} กำไรบาง ${h.est_margin_pct}%`, `ราคาขาย ${baht(h.value)} · ต้นทุนรวมประมาณ ${baht(h.contractor_plan + h.other_expense)}`, 'ทบทวนต้นทุนวัสดุ/ค่าแรงก่อนจ่ายงวดถัดไป')
      if (h.overpaid_contractor > 0) add('high', 'overpaid:' + h.code, `บ้าน ${h.code} จ่ายช่างเกินสัญญา ${baht(h.overpaid_contractor)}`, `จ่ายช่างแล้ว ${baht(h.contractor_paid)} · ตามสัญญา ${baht(h.contractor_plan)}`, 'ตรวจว่ามีงานเพิ่ม (VO) รองรับหรือลงงวดผิด')
      if (h.contractor_plan > 0 && h.value > 0 && h.collected > 0 && h.contractor_paid > h.collected * 1.0 && h.pct < 100) add('med', 'prepay:' + h.code, `บ้าน ${h.code} จ่ายช่างมากกว่าเงินที่เก็บจากลูกค้า`, `เก็บลูกค้าแล้ว ${baht(h.collected)} · จ่ายช่างแล้ว ${baht(h.contractor_paid)}`, 'เร่งเก็บงวดลูกค้า / ชะลอจ่ายช่างให้ตรงความคืบหน้า')
    }
    if (snap.ar.over30_n) add('high', 'ar30', `ลูกค้าค้างจ่ายเกิน 30 วัน ${snap.ar.over30_n} งวด รวม ${baht(snap.ar.over30_amt)}`, `ค้างนานสุด ${snap.ar.oldest_days} วัน`, 'โทรตาม/ส่งหนังสือทวงถาม และพิจารณาชะลองานบ้านที่ค้างนาน')
    else if (snap.ar.overdue_n) add('med', 'ar', `ลูกค้าค้างจ่าย (เลยกำหนด) ${snap.ar.overdue_n} งวด รวม ${baht(snap.ar.overdue_amt)}`, '', 'ส่งข้อความเตือนลูกค้าก่อนเกิน 30 วัน')
    if (snap.ap.overdue_n) add('med', 'ap', `หนี้ผู้ขายเลยกำหนด ${snap.ap.overdue_n} ใบ รวม ${baht(snap.ap.overdue_amt)}`, '', 'จ่ายหรือขอเลื่อนกับร้าน — ค้างนานเสียเครดิตและส่วนลด')
    const need30 = snap.ap.overdue_amt + snap.ap.po_next30 + snap.ap.contractor_next30
    if (snap.cash != null) {
      const inflow = snap.ar.overdue_amt + snap.ar.due_next30
      if (snap.cash < 0) add('high', 'cashneg', `เงินสด+ธนาคารตามบัญชีติดลบ ${baht(snap.cash)}`, '', 'ตรวจว่าลงบัญชีรับเงินครบ หรือหาเงินทุนหมุนเวียนด่วน')
      else if (need30 > 0 && snap.cash + inflow < need30) add('high', 'cash30', 'เงินอาจไม่พอจ่ายใน 30 วันข้างหน้า', `เงินสดตามบัญชี ${baht(snap.cash)} + คาดว่าจะเก็บได้ ${baht(inflow)} · ต้องจ่าย ${baht(need30)}`, 'เร่งเก็บงวดลูกค้า เลื่อนการซื้อที่ไม่ด่วน คุยวงเงิน OD กับธนาคาร')
      else if (need30 > 0 && snap.cash < need30) add('med', 'cashtight', 'เงินสดในมือน้อยกว่ายอดที่ต้องจ่าย 30 วัน (ต้องรอเก็บเงินลูกค้า)', `เงินสด ${baht(snap.cash)} · ต้องจ่าย ${baht(need30)}`, 'ติดตามงวดลูกค้าที่จะครบกำหนดให้เข้าตรงเวลา')
    }
    const big = snap.houses.rows.filter((h) => h.status !== 'ส่งมอบแล้ว').sort((a, b) => b.value - a.value)[0]
    if (big && snap.houses.value_active > 0 && snap.houses.active >= 3 && big.value / snap.houses.value_active > 0.4) add('med', 'concentration', `รายได้กระจุกที่บ้าน ${big.code} (${Math.round((big.value / snap.houses.value_active) * 100)}% ของงานที่กำลังทำ)`, '', 'ถ้าบ้านนี้มีปัญหา กระทบเงินทั้งบริษัท — ดูแลการเก็บเงินบ้านนี้เป็นพิเศษ')
    if (snap.expenses.no_tax_invoice_90d?.n >= 5) add('low', 'notaxinv', `รายจ่าย ≥1,000 บาทที่ไม่มีเลขใบกำกับภาษี ${snap.expenses.no_tax_invoice_90d.n} รายการ (90 วัน)`, `รวม ${baht(snap.expenses.no_tax_invoice_90d.a)}`, 'ขอใบกำกับภาษีจากร้าน — ใช้ขอคืน VAT และหักเป็นค่าใช้จ่ายได้')
    if (snap.sales.open_leads >= 3 && snap.sales.idle_7d / snap.sales.open_leads >= 0.3) add('med', 'idleleads', `ลูกค้าที่กำลังคุย ${snap.sales.idle_7d} จาก ${snap.sales.open_leads} ราย ไม่ได้ติดต่อเกิน 7 วัน`, `มูลค่าในท่อขายรวม ${baht(snap.sales.pipeline_value)}`, 'ฝ่ายขายโทรตามภายในสัปดาห์นี้ — ลูกค้าบ้านที่ไม่ได้ติดต่อเกิน 2 สัปดาห์มักไปเลือกเจ้าอื่น')
    if (snap.sales.leads_30d === 0) add('med', 'noleads', 'ไม่มีลูกค้าใหม่ (Lead) เข้าระบบใน 30 วัน', '', 'ตรวจว่าทีมขายบันทึก Lead ในระบบ หรือช่องทางการตลาดหยุดทำงาน')
    if (snap.site.late_houses.length) add('med', 'late', `บ้านเลยกำหนดส่งมอบ ${snap.site.late_houses.length} หลัง`, snap.site.late_houses.slice(0, 5).map((h) => `${h.code} (${h.days_late} วัน)`).join(', '), 'แจ้งลูกค้าล่วงหน้าพร้อมแผนใหม่ — ส่งช้าเป็นข้อตำหนิอันดับต้นของลูกค้า')
    const order = { high: 0, med: 1, low: 2 }
    return f.sort((a, b) => order[a.sev] - order[b.sev])
  }

  // ---------- 3) รายงาน AI ----------
  // ย่อข้อมูลบริษัทให้ AI อ่าน (ไม่มีชื่อลูกค้า/เบอร์โทร)
  function aiFacts(snap) {
    const s = JSON.parse(JSON.stringify(snap))
    s.houses.rows = s.houses.rows.map(({ name: _n, ...r }) => r).slice(0, 40)
    return JSON.stringify(s)
  }
  const COMPANY = 'PPSD Construction — บริษัทรับสร้างบ้านเดี่ยว (ราคาประมาณหลักล้าน–หลายล้านบาท) สำนักงานใหญ่ จ.ราชบุรี + สาขากรุงเทพฯ รับสร้างบ้านบนที่ดินลูกค้า และรับควบคุมงาน (CM) บางโครงการ'
  const FORMAT = `ตอบเป็น JSON อย่างเดียวในบล็อก \`\`\`json ... \`\`\` ภาษาไทยทั้งหมด รูปแบบ:
{"summary":"สรุปสั้น 2-4 ประโยค","score":0-100,"sections":[{"title":"หัวข้อ","points":["ประเด็น (ระบุตัวเลข/แหล่งที่มาเมื่อมี)"]}],"alerts":[{"sev":"high|med|low","title":"เรื่องที่ต้องระวัง","detail":"ทำไม","action":"ควรทำอะไร ใครทำ ภายในเมื่อไหร่"}],"sources":[{"title":"ชื่อแหล่ง","url":"https://..."}]}
กติกา: alerts ใส่เฉพาะเรื่องที่บริษัทควรทำอะไรจริง (high = ต้องทำภายใน 1-2 สัปดาห์) ไม่เกิน 8 ข้อ · ห้ามแต่งตัวเลขหรือข่าวขึ้นเอง ถ้าไม่แน่ใจให้บอกว่าไม่แน่ใจ · ใช้ปี พ.ศ.`

  function competitorList() {
    return db.prepare('SELECT * FROM intel_competitors WHERE active=1 ORDER BY source DESC, id').all()
  }
  function latest(kind) {
    const r = db.prepare('SELECT * FROM intel_reports WHERE kind=? AND ok=1 ORDER BY id DESC LIMIT 1').get(kind)
    return r ? { ...r, body: safe(() => JSON.parse(r.body || '{}'), {}) } : null
  }

  function promptFor(kind, snap, prior) {
    const dateTH = `${snap.today} (ปี พ.ศ. ${Number(snap.today.slice(0, 4)) + 543})`
    const head = `วันนี้ ${dateTH} · บริษัทของเรา: ${COMPANY}\n`
    if (kind === 'world') return head + `คุณเป็นนักวิเคราะห์เศรษฐกิจมหภาคที่ดูแลธุรกิจรับสร้างบ้านในไทย ค้นข่าวล่าสุด (ไม่เกิน 30 วัน) แล้ววิเคราะห์:
1) เศรษฐกิจโลก: ดอกเบี้ยสหรัฐ/จีน สงครามการค้า ภาษีนำเข้า ราคาน้ำมัน วิกฤตที่กำลังเกิดหรือเสี่ยงจะเกิด และกติกาการค้าโลกแบบที่ WTO รายงาน (ภาษี การกีดกันการค้า ห่วงโซ่อุปทาน)
2) เศรษฐกิจไทย: GDP ดอกเบี้ยนโยบาย กนง. หนี้ครัวเรือน การปล่อยสินเชื่อบ้านของธนาคาร (อัตราปฏิเสธสินเชื่อ) มาตรการ LTV/อสังหา ค่าแรงขั้นต่ำ แรงงานต่างด้าว
3) ตลาดรับสร้างบ้าน/อสังหาในราชบุรี-ภาคตะวันตก และกรุงเทพฯ
4) สรุปผลกระทบต่อ "บริษัทเรา" ทีละข้อ: ลูกค้าจะกู้ผ่านยากขึ้นไหม ต้นทุนจะขึ้นไหม ควรปรับราคา/โปรโมชัน/เงื่อนไขงวดอย่างไร
score = คะแนนสภาพแวดล้อมธุรกิจตอนนี้ (100 = ดีมาก)
` + FORMAT
    if (kind === 'materials') return head + `คุณเป็นผู้เชี่ยวชาญจัดซื้อวัสดุก่อสร้างในไทย ค้นราคา/ข่าวล่าสุด: เหล็กเส้น เหล็กรูปพรรณ ปูนซีเมนต์ คอนกรีตผสมเสร็จ ไม้/ไม้เทียม กระเบื้อง หลังคา สายไฟ/ทองแดง ท่อ PVC สี กระจก/อลูมิเนียม รวมทั้งดัชนีราคาวัสดุก่อสร้างของกระทรวงพาณิชย์ และปัจจัยโลก (ราคาเหล็กจีน ถ่านหิน พลังงาน ค่าขนส่ง ค่าเงินบาท)
ข้อมูลราคาที่บริษัทเราซื้อจริง (ราคากลางในระบบ + การเปลี่ยนแปลง 180 วัน): ${JSON.stringify(snap.materials)}
วิเคราะห์: วัสดุไหนแนวโน้มขึ้น/ลงใน 3-6 เดือน · ราคาที่เราซื้อแพงกว่าตลาดไหม (เทียบเฉพาะที่มั่นใจ) · ควรกักตุน/ล็อกราคา/ทำสัญญาราคาคงที่กับร้านตัวไหน · วัสดุทางเลือกที่ถูกกว่าแต่คุณภาพเท่ากัน · ความเสี่ยงต่อสัญญาบ้านที่เซ็นราคาไว้แล้ว
score = ความเสี่ยงต้นทุนวัสดุกลับด้าน (100 = ต้นทุนนิ่ง/ปลอดภัย)
` + FORMAT
    if (kind === 'competitors') {
      const list = competitorList().map((c) => `${c.name}${c.area ? ' (' + c.area + ')' : ''}${c.website ? ' ' + c.website : ''}`)
      return head + `คุณเป็นที่ปรึกษากลยุทธ์ที่วิเคราะห์คู่แข่งธุรกิจรับสร้างบ้าน ค้นเว็บหาบริษัทรับสร้างบ้านที่แข่งกับเรา ทั้งรายใหญ่ระดับประเทศที่มีสาขาภาคตะวันตก/กรุงเทพฯ และรายท้องถิ่นในราชบุรี นครปฐม กาญจนบุรี เพชรบุรี สมุทรสงคราม
${list.length ? 'คู่แข่งที่เจ้าของให้ดูแน่ๆ: ' + list.join(' · ') + '\n' : ''}ข้อมูลของเรา (ย่อ): บ้านที่กำลังทำ ${snap.houses.active} หลัง มูลค่า ${baht(snap.houses.value_active)} · ที่มาลูกค้า ${JSON.stringify(snap.sales.sources_12m)} · เหตุผลที่ลูกค้าไม่เลือกเรา ${JSON.stringify(snap.sales.lost_reasons)}
วิเคราะห์แต่ละรายเท่าที่หาได้: ราคาต่อ ตร.ม. แบบบ้าน การรับประกัน โปรโมชัน ช่องทางการตลาด รีวิว/ข้อร้องเรียนลูกค้า จุดแข็ง จุดอ่อน แล้วสรุปว่าเราแพ้/ชนะตรงไหน และควรปรับอะไร
เพิ่ม key "competitors":[{"name":"","area":"","website":"https://...","price_range":"","strengths":"","weaknesses":"","vs_us":"เทียบกับเรา"}] ไว้ใน JSON ด้วย
score = ความสามารถแข่งขันของเรา (100 = เหนือคู่แข่งชัดเจน)
` + FORMAT
    }
    if (kind === 'critic') return head + `สวมบทเป็น "ลูกค้าที่ฉลาดและจับผิดเก่งที่สุดในโลก" — เป็นวิศวกร+นักกฎหมาย+นักบัญชี กำลังจะจ้างสร้างบ้านหลังละหลายล้าน และเคยโดนผู้รับเหมาโกงมาก่อน จึงตรวจทุกอย่าง
อ่านข้อมูลการทำงานจริงของบริษัทเรา (JSON): ${aiFacts(snap)}
จากข้อมูลนี้ (และความรู้ว่าลูกค้ารับสร้างบ้านในไทยมักร้องเรียนเรื่องอะไร) ให้ชี้ทุกข้อตำหนิที่ลูกค้าแบบนี้จะเจอหรือถาม: งานล่าช้า คุณภาพ/NCR งานแก้ ความโปร่งใสของงวดเงิน การสื่อสาร การรับประกัน สัญญา ราคาเพิ่ม (VO) ความปลอดภัย การบริการหลังการขาย
เขียนแต่ละข้อในมุมลูกค้า ("ฉันเห็นว่า... ฉันกังวลว่า...") พร้อมหลักฐานจากข้อมูล แล้วบอกบริษัทว่าแก้อย่างไร
score = ความพึงพอใจที่ลูกค้าคนนี้น่าจะให้ (100 = ประทับใจมาก)
` + FORMAT
    const priorTxt = Object.entries(prior || {}).map(([k, r]) => r ? `【${INTEL_KINDS[k].label}】 ${r.body?.summary || r.summary || ''} | ข้อเตือน: ${(r.body?.alerts || []).map((a) => a.title).join(' / ')}` : '').filter(Boolean).join('\n')
    if (kind === 'sales') return head + `คุณเป็นหัวหน้าฝ่ายการตลาดและการขายมือหนึ่งของธุรกิจรับสร้างบ้านในไทย หน้าที่: วางแผนให้ทีมขายของเรา "หาลูกค้าได้มากขึ้น" และ "ปิดการขายได้มากขึ้น" ในเดือนหน้า
ข้อมูลการขายจริงของเรา (CRM 12 เดือน): ${JSON.stringify(snap.sales)}
บ้านที่กำลังทำ ${snap.houses.active} หลัง · ส่งมอบแล้ว ${snap.houses.delivered} หลัง · มูลค่างานในมือ ${baht(snap.houses.value_active)}
${priorTxt ? 'ผลวิเคราะห์หัวข้ออื่น (เศรษฐกิจ วัสดุ คู่แข่ง ข้อตำหนิลูกค้า มุมมองผู้บริหาร):\n' + priorTxt + '\n' : ''}ค้นเว็บเพิ่มได้เรื่อง: พฤติกรรมคนสร้างบ้านปีนี้ ช่องทางโฆษณาที่ได้ผล (Facebook/TikTok/Google/งานบ้านและสวน/ป้ายหน้างาน) โปรโมชันคู่แข่ง สินเชื่อสร้างบ้านของธนาคาร
ส่งแผนที่ทีมขายเอาไปทำได้ทันที โดยใช้ sections ต่อไปนี้ (เรียงตามนี้):
1) "ลูกค้าเป้าหมาย" — กลุ่มไหนน่าขายที่สุดตอนนี้ (อาชีพ งบ พื้นที่ แบบบ้าน) พร้อมเหตุผลจากข้อมูล
2) "ช่องทางหาลูกค้า" — ช่องทางไหนได้ผลจริงจากข้อมูลเรา ควรเพิ่ม/ลด/ทดลองช่องทางไหน งบประมาณคร่าวๆ ต่อเดือน
3) "ไอเดียแคมเปญ/โปรโมชัน 30 วัน" — 3-5 ไอเดียที่สู้คู่แข่งได้โดยไม่ทำลายกำไร
4) "สคริปต์ปิดการขาย + ตอบข้อโต้แย้ง" — ประโยคพูดจริงสำหรับข้อกังวลยอดฮิต (แพงกว่าเจ้าอื่น / กลัวทิ้งงาน / กลัวงบบาน / กู้ไม่ผ่าน / ขอคิดก่อน) โดยใช้จุดแข็งของเราที่เห็นจากข้อมูล
5) "แผนติดตามลูกค้าที่ค้างอยู่" — ลูกค้าแต่ละขั้น (สนใจ นัดคุย เสนอราคา ต่อรอง) ควรทำอะไรต่อ ภายในกี่วัน
6) "สิ่งที่ทีมขายต้องทำสัปดาห์นี้" — เช็คลิสต์ 5-10 ข้อ ระบุว่าใครควรทำ
7) "ตัวชี้วัดที่ต้องติดตาม" — เป้าจำนวน Lead / อัตราปิด / เวลาปิดการขาย ที่สมเหตุสมผลจากตัวเลขปัจจุบัน
alerts = สิ่งที่ทำให้เสียยอดขายอยู่ตอนนี้ (เช่น Lead ค้างไม่ได้ติดต่อ ช่องทางที่เสียเงินแต่ไม่ได้ลูกค้า)
score = ความพร้อมของระบบขายเรา (100 = หาลูกค้าและปิดการขายได้ดีมาก)
` + FORMAT
    return head + `คุณคือที่ปรึกษาระดับโลกที่คิดแบบนักธุรกิจอย่าง ลี กาชิง (CK Group: คุมกระแสเงินสด หนี้ต่ำ กระจายความเสี่ยง มองยาว เตรียมรับวิกฤตก่อนเกิด) และมองภาพการค้าโลกแบบรายงานของ WTO
ข้อมูลการเงินและการทำงานจริงของบริษัทเรา (JSON): ${aiFacts(snap)}
ผลตรวจการเงินอัตโนมัติ: ${JSON.stringify(financeCheck(snap).map((x) => x.title))}
${priorTxt ? 'สรุปจากรายงานหัวข้ออื่นวันนี้:\n' + priorTxt + '\n' : ''}วิเคราะห์บริษัทเราแบบตรงไปตรงมา:
1) สุขภาพการเงิน: กระแสเงินสด กำไรต่อหลัง การพึ่งพาลูกค้าไม่กี่ราย ความเสี่ยงหนี้
2) จุดอ่อนที่ใหญ่ที่สุด 5 อันดับ (เรียงตามความเสียหายที่อาจเกิด)
3) สิ่งที่ต้องเปลี่ยน: ทำทันที (30 วัน) / ภายใน 3 เดือน / ภายใน 1 ปี
4) โอกาสที่ควรคว้า และวิกฤตที่ต้องเตรียมรับ
score = คะแนนสุขภาพธุรกิจโดยรวม (100 = แข็งแรงมาก)
` + FORMAT
  }

  const searchModel = () => process.env.PPSD_AI_SEARCH_MODEL || 'claude-sonnet-5'
  let running = null // { kinds, done:[], current, started, by }

  async function runKind(kind, snap, prior, by) {
    const def = INTEL_KINDS[kind]
    const ai = await aiAsk({
      feature: 'วิเคราะห์ธุรกิจ: ' + def.label, by, prompt: promptFor(kind, snap, prior), maxTokens: 16000, timeoutMs: 360000,
      effort: def.web ? 'low' : 'medium',
      ...(def.web ? { model: searchModel(), tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: def.maxUses }] } : {}),
    })
    const created = nowTS()
    if (!ai.ok) {
      db.prepare('INSERT INTO intel_reports (kind,created,by,ok,error,model,cost_usd) VALUES (?,?,?,?,?,?,?)').run(kind, created, by, 0, ai.error || 'ผิดพลาด', ai.model || '', ai.cost_usd || 0)
      return null
    }
    const parsed = parseAiJson(ai.text)
    if (!parsed) {
      db.prepare('INSERT INTO intel_reports (kind,created,by,ok,error,model,cost_usd) VALUES (?,?,?,?,?,?,?)').run(kind, created, by, 0, 'AI ตอบไม่อยู่ในรูปแบบที่อ่านได้ — ลองกดอัปเดตใหม่', ai.model || '', ai.cost_usd || 0)
      return null
    }
    const rep = normalizeReport(parsed)
    const info = db.prepare('INSERT INTO intel_reports (kind,created,by,ok,summary,score,body,model,cost_usd) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(kind, created, by, 1, rep.summary, rep.score, JSON.stringify(rep), ai.model || '', ai.cost_usd || 0)
    const reportId = Number(info.lastInsertRowid)
    // ข้อเตือนชุดเก่าของหัวข้อนี้ที่ยังไม่มีใครรับทราบ → ถูกแทนด้วยชุดใหม่ (เก็บไว้ในประวัติ ไม่ลบ)
    db.prepare("UPDATE intel_alerts SET status='replaced' WHERE kind=? AND status='open'").run(kind)
    const ins = db.prepare("INSERT INTO intel_alerts (kind,report_id,sev,title,detail,action,status,created) VALUES (?,?,?,?,?,?,'open',?)")
    for (const a of rep.alerts) ins.run(kind, reportId, a.sev, a.title, a.detail, a.action, created)
    if (kind === 'competitors') {
      const has = new Set(db.prepare('SELECT name FROM intel_competitors').all().map((r) => r.name.trim().toLowerCase()))
      const addC = db.prepare("INSERT INTO intel_competitors (name,area,website,note,source,active,created,by) VALUES (?,?,?,?,'ai',1,?,'AI')")
      for (const c of rep.competitors) if (!has.has(c.name.trim().toLowerCase())) { addC.run(c.name, c.area, c.website, c.vs_us || c.strengths, created); has.add(c.name.trim().toLowerCase()) }
    }
    return { ...rep, id: reportId, created }
  }

  async function runAll(kinds, by = 'ระบบ (อัตโนมัติ)') {
    if (running) return { ok: false, error: 'กำลังทำรายงานอยู่ — รอให้เสร็จก่อน' }
    if (!aiKey()) return { ok: false, error: 'ยังไม่ได้ตั้งค่ากุญแจ AI — ผู้ดูแลระบบตั้งได้ที่เมนู ผู้ใช้งาน → ตั้งค่า AI' }
    const list = ORDER.filter((k) => !kinds?.length || kinds.includes(k))
    running = { kinds: list, done: [], failed: [], current: list[0], started: nowTS(), by }
    ;(async () => {
      const prior = {}
      let snap
      try { snap = snapshot() } catch (e) { running = null; console.error('[intel] snapshot', e.message); return }
      for (const k of list) {
        running.current = k
        try {
          if (k === 'tycoon' || k === 'sales') for (const pk of ['world', 'materials', 'competitors', 'critic', ...(k === 'sales' ? ['tycoon'] : [])]) prior[pk] = prior[pk] || latest(pk)
          const r = await runKind(k, snap, prior, by)
          if (r) { prior[k] = { body: r }; running.done.push(k) } else running.failed.push(k)
        } catch (e) { console.error('[intel]', k, e.message); running.failed.push(k) }
        try { notifyChange?.(['intel']) } catch { /* ignore */ }
      }
      const summary = { at: nowTS(), by, done: running.done, failed: running.failed }
      setSetting('intel_last_run', JSON.stringify(summary))
      try { audit({ user: { name: by } }, 'ศูนย์วิเคราะห์ธุรกิจ: ทำรายงาน AI', `สำเร็จ ${running.done.map((k) => INTEL_KINDS[k].label).join(', ') || '-'}${running.failed.length ? ' · ไม่สำเร็จ ' + running.failed.map((k) => INTEL_KINDS[k].label).join(', ') : ''}`) } catch { /* ignore */ }
      running = null
      await pushAlerts().catch((e) => console.error('[intel] line', e.message))
    })()
    return { ok: true, kinds: list }
  }

  // ส่ง LINE ผู้บริหาร: เฉพาะเรื่องด่วน (high) ที่ยังไม่เคยแจ้ง
  async function pushAlerts() {
    if (getSetting('intel_line', '1') !== '1' || !getSetting('line_token', '')) return 0
    const sent = new Set(safe(() => JSON.parse(getSetting('intel_line_sent', '[]')), []))
    const fin = financeCheck().filter((x) => x.sev === 'high' && !sent.has(x.key))
    const acked = new Set(db.prepare("SELECT flag_key FROM flag_acks WHERE flag_key LIKE 'intel:%'").all().map((r) => r.flag_key))
    const finNew = fin.filter((x) => !acked.has(x.key))
    const ai = db.prepare("SELECT * FROM intel_alerts WHERE status='open' AND sev='high' ORDER BY id DESC LIMIT 20").all().filter((a) => !sent.has('intel:ai:' + a.id))
    if (!finNew.length && !ai.length) return 0
    const lines = [...finNew.map((x) => '🔴 [การเงิน] ' + x.title), ...ai.map((a) => `🔴 [${INTEL_KINDS[a.kind]?.label || a.kind}] ${a.title}${a.action ? '\n   → ' + a.action : ''}`)]
    const text = `📊 ศูนย์วิเคราะห์ธุรกิจ — เรื่องด่วน ${lines.length} เรื่อง\n\n${lines.slice(0, 12).join('\n')}${lines.length > 12 ? `\n…และอีก ${lines.length - 12} เรื่อง` : ''}\n\nดูรายละเอียด: เมนู ศูนย์วิเคราะห์ธุรกิจ`
    let n = 0
    for (const u of managersWithLine()) { if (await linePush(u.line_uid, text)) n++ }
    if (n) {
      for (const x of finNew) sent.add(x.key)
      for (const a of ai) sent.add('intel:ai:' + a.id)
      setSetting('intel_line_sent', JSON.stringify([...sent].slice(-500)))
    }
    return n
  }

  // อัตโนมัติวันละครั้ง (ค่าเริ่มต้น 07:00) — ตรวจทุก 10 นาที
  function tick() {
    try {
      if (getSetting('intel_auto', '1') !== '1' || !aiKey() || running) return
      const hv = Number(getSetting('intel_hour', '7'))
      const hour = Number.isFinite(hv) ? Math.max(0, Math.min(23, hv)) : 7
      const today = todayISO()
      if (new Date().getHours() < hour || getSetting('intel_auto_day', '') === today) return
      setSetting('intel_auto_day', today)
      runAll(null, 'ระบบ (อัตโนมัติ)')
    } catch (e) { console.error('[intel] tick', e.message) }
  }

  function settings() {
    return {
      auto: getSetting('intel_auto', '1') === '1', hour: Number(getSetting('intel_hour', '7')) || 7, line: getSetting('intel_line', '1') === '1',
      last_run: safe(() => JSON.parse(getSetting('intel_last_run', '') || 'null'), null), has_key: !!aiKey(),
    }
  }

  function register(api, guard) {
    api.get('/intel', guard, (_req, res) => {
      const snap = snapshot()
      const acks = new Map(db.prepare("SELECT flag_key, by, date, note FROM flag_acks WHERE flag_key LIKE 'intel:%'").all().map((r) => [r.flag_key, r]))
      const finance = financeCheck(snap).map((x) => ({ ...x, acked: acks.has(x.key), ackBy: acks.get(x.key)?.by, ackNote: acks.get(x.key)?.note }))
      const alerts = db.prepare("SELECT * FROM intel_alerts WHERE status IN ('open','ack') ORDER BY CASE sev WHEN 'high' THEN 0 WHEN 'med' THEN 1 ELSE 2 END, id DESC LIMIT 200").all()
      const reports = Object.fromEntries(ORDER.map((k) => [k, latest(k)]))
      const lastErr = Object.fromEntries(ORDER.map((k) => {
        const e = db.prepare('SELECT created, error FROM intel_reports WHERE kind=? ORDER BY id DESC LIMIT 1').get(k)
        return [k, e && e.error ? e : null]
      }))
      const cost30 = safe(() => db.prepare("SELECT COALESCE(SUM(cost_usd),0) c FROM intel_reports WHERE created >= ?").get(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)).c, 0)
      const s = snap
      const kpis = {
        cash: s.cash, houses_active: s.houses.active, value_active: s.houses.value_active, remain_active: s.houses.remain_active,
        ar_overdue: s.ar.overdue_amt, ar_overdue_n: s.ar.overdue_n, ap_overdue: s.ap.overdue_amt, need_30d: s.ap.overdue_amt + s.ap.po_next30 + s.ap.contractor_next30,
        inflow_30d: s.ar.overdue_amt + s.ar.due_next30, leads_30d: s.sales.leads_30d, late_houses: s.site.late_houses.length,
      }
      const houses = s.houses.rows.filter((h) => h.value > 0).sort((a, b) => (a.est_margin_pct ?? 999) - (b.est_margin_pct ?? 999))
      res.json({ kinds: INTEL_KINDS, order: ORDER, kpis, finance, alerts, reports, lastErr, houses, competitors: competitorList(), settings: settings(), running, cost30_usd: Math.round(cost30 * 100) / 100 })
    })
    api.get('/intel/history/:kind', guard, (req, res) => {
      if (!INTEL_KINDS[req.params.kind]) return res.status(404).json({ error: 'ไม่พบหัวข้อ' })
      res.json(db.prepare('SELECT id, kind, created, by, ok, summary, score, error, cost_usd FROM intel_reports WHERE kind=? ORDER BY id DESC LIMIT 60').all(req.params.kind))
    })
    api.get('/intel/report/:id', guard, (req, res) => {
      const r = db.prepare('SELECT * FROM intel_reports WHERE id=?').get(Number(req.params.id))
      if (!r) return res.status(404).json({ error: 'ไม่พบรายงาน' })
      res.json({ ...r, body: safe(() => JSON.parse(r.body || '{}'), {}) })
    })
    api.get('/intel/status', guard, (_req, res) => res.json({ running }))
    api.post('/intel/run', guard, (req, res) => {
      const kinds = (Array.isArray(req.body?.kinds) ? req.body.kinds : []).filter((k) => INTEL_KINDS[k])
      const r = runAll(kinds, req.user?.name || 'ผู้ใช้')
      r.then((x) => {
        if (!x.ok) return res.status(400).json({ error: x.error })
        audit(req, 'ศูนย์วิเคราะห์ธุรกิจ: สั่งทำรายงาน', x.kinds.map((k) => INTEL_KINDS[k].label).join(', '))
        res.json(x)
      })
    })
    api.post('/intel/alerts/:id/ack', guard, (req, res) => {
      const a = db.prepare('SELECT * FROM intel_alerts WHERE id=?').get(Number(req.params.id))
      if (!a) return res.status(404).json({ error: 'ไม่พบข้อเตือน' })
      const reopen = !!req.body?.reopen
      db.prepare('UPDATE intel_alerts SET status=?, ack_by=?, ack_at=?, ack_note=? WHERE id=?').run(reopen ? 'open' : 'ack', reopen ? null : req.user.name, reopen ? null : nowTS(), reopen ? null : str(req.body?.note, 500), a.id)
      audit(req, reopen ? 'ศูนย์วิเคราะห์ธุรกิจ: เปิดข้อเตือนใหม่' : 'ศูนย์วิเคราะห์ธุรกิจ: รับทราบข้อเตือน', a.title)
      res.json({ ok: true })
    })
    api.post('/intel/finance/ack', guard, (req, res) => {
      const key = String(req.body?.key || '')
      if (!key.startsWith('intel:fin:')) return res.status(400).json({ error: 'missing key' })
      if (req.body?.reopen) db.prepare('DELETE FROM flag_acks WHERE flag_key=?').run(key)
      else db.prepare('INSERT INTO flag_acks (flag_key,by,date,note) VALUES (?,?,?,?) ON CONFLICT(flag_key) DO UPDATE SET by=excluded.by,date=excluded.date,note=excluded.note').run(key, req.user.name, nowTS().slice(0, 10), str(req.body?.note, 500))
      audit(req, req.body?.reopen ? 'ศูนย์วิเคราะห์ธุรกิจ: เปิดข้อเตือนการเงินใหม่' : 'ศูนย์วิเคราะห์ธุรกิจ: รับทราบข้อเตือนการเงิน', key)
      res.json({ ok: true })
    })
    api.post('/intel/competitors', guard, (req, res) => {
      const name = str(req.body?.name, 120)
      if (!name) return res.status(400).json({ error: 'ใส่ชื่อบริษัทคู่แข่ง' })
      const website = /^https?:\/\//.test(String(req.body?.website || '')) ? str(req.body.website, 300) : ''
      const info = db.prepare("INSERT INTO intel_competitors (name,area,website,note,source,active,created,by) VALUES (?,?,?,?,'user',1,?,?)").run(name, str(req.body?.area, 120), website, str(req.body?.note, 500), nowTS(), req.user.name)
      audit(req, 'ศูนย์วิเคราะห์ธุรกิจ: เพิ่มคู่แข่ง', name)
      res.json({ ok: true, id: Number(info.lastInsertRowid) })
    })
    // ไม่ลบจริง — ซ่อน (active=0) ให้ดูย้อนได้ในประวัติ
    api.delete('/intel/competitors/:id', guard, (req, res) => {
      const c = db.prepare('SELECT * FROM intel_competitors WHERE id=?').get(Number(req.params.id))
      if (!c) return res.status(404).json({ error: 'ไม่พบ' })
      db.prepare('UPDATE intel_competitors SET active=0 WHERE id=?').run(c.id)
      audit(req, 'ศูนย์วิเคราะห์ธุรกิจ: เอาคู่แข่งออกจากรายการ', c.name)
      res.json({ ok: true })
    })
    api.put('/intel/settings', guard, (req, res) => {
      const b = req.body || {}
      if (b.auto != null) setSetting('intel_auto', b.auto ? '1' : '0')
      if (b.line != null) setSetting('intel_line', b.line ? '1' : '0')
      if (b.hour != null) { const h = Math.max(0, Math.min(23, Math.round(Number(b.hour) || 0))); setSetting('intel_hour', String(h)) }
      audit(req, 'ศูนย์วิเคราะห์ธุรกิจ: ตั้งค่า', JSON.stringify(settings()))
      res.json(settings())
    })
  }

  return { register, tick, snapshot, financeCheck, runAll, pushAlerts }
}
