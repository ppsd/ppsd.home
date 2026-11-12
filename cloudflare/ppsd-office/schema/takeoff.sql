-- ถอดแบบ + BOQ บน Cloudflare (D1 ppsd-takeoff)
-- ds = ชุดข้อมูลที่ ERP ส่งขึ้นมา (JSON ทั้งก้อน + ลายนิ้วมือ sha): users, houses, materials, aliases, labor_rates, config, boqs (ช่วงยังไม่เปิดใช้)
-- เปิดใช้แล้ว (live): ตาราง boqs บนนี้เป็นตัวหลัก → ERP ดึงกลับไปเก็บทุก 1 นาที
CREATE TABLE IF NOT EXISTS ds (name TEXT PRIMARY KEY, sha TEXT NOT NULL, data TEXT NOT NULL, at TEXT);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS fails (k TEXT PRIMARY KEY, n INTEGER DEFAULT 0, until INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, who TEXT, action TEXT, detail TEXT, synced INTEGER DEFAULT 0);
-- BOQ (คอลัมน์เดียวกับตาราง boqs ใน ERP · items/work เป็น JSON)
CREATE TABLE IF NOT EXISTS boqs (id INTEGER PRIMARY KEY AUTOINCREMENT, no TEXT, house_code TEXT, title TEXT, markup_pct REAL, vat_pct REAL, items TEXT, work TEXT,
  by TEXT, date TEXT, created TEXT, root_id INTEGER, rev INTEGER, rev_note TEXT, locked INTEGER, locked_at TEXT, locked_by TEXT);
-- ราคากลางวัสดุที่เพิ่มจากหน้าถอดแบบ (รหัสชั่วคราวติดลบ) → ERP สร้างจริงแล้วตอบรหัสจริงกลับมา (erp_id)
CREATE TABLE IF NOT EXISTS new_materials (tmp_id INTEGER PRIMARY KEY, name TEXT, unit TEXT, central REAL, note TEXT, by TEXT, at TEXT, erp_id INTEGER);
-- ชื่อเรียกที่จำจากการจับคู่ → ERP ดึงไปลงตาราง material_aliases
CREATE TABLE IF NOT EXISTS new_aliases (id INTEGER PRIMARY KEY AUTOINCREMENT, alias TEXT, unit TEXT, mp_id INTEGER, by TEXT, at TEXT, synced INTEGER DEFAULT 0);
-- คำสั่งที่ต้องทำใน ERP (ดัน BOQ เข้าราคาขายบ้าน / งวดลูกค้า)
CREATE TABLE IF NOT EXISTS commands (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, boq_id INTEGER, mode TEXT, by TEXT, at TEXT, synced INTEGER DEFAULT 0);
-- ผลถอดแบบที่จำไว้ (ไฟล์เดิม + ข้อมูลบ้านเดิม = ไม่เรียก AI ซ้ำ)
CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, label TEXT, model TEXT, parsed TEXT, cost_usd REAL, created TEXT, hits INTEGER DEFAULT 0);
-- การใช้ AI (token) → ERP ดึงไปลงตาราง ai_usage (คิดค่าใช้จ่ายด้วยตารางราคาเดียวกับ ERP)
CREATE TABLE IF NOT EXISTS usage (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, feature TEXT, model TEXT, by TEXT, ok INTEGER, data TEXT, synced INTEGER DEFAULT 0);
