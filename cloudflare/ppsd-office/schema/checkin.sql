-- ฐานข้อมูลของหน้าลงเวลาบน Cloudflare (D1) — เป็น "สาขาย่อย" ของ ERP: ERP ส่งรายชื่อ/บ้าน/ค่าตั้งค่าขึ้นมา แล้วดึงรายการลงเวลากลับไปเอง
CREATE TABLE IF NOT EXISTS emps (ref TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, hash TEXT, ord INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS houses (code TEXT PRIMARY KEY, name TEXT NOT NULL, ord INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, v TEXT);
-- สถานะเข้า/ออกของวัน (รวมที่ตอกในออฟฟิศ ซึ่ง ERP ส่งขึ้นมา) — ใช้กันตอกซ้ำ
CREATE TABLE IF NOT EXISTS att (ref TEXT NOT NULL, date TEXT NOT NULL, check_in TEXT DEFAULT '', check_out TEXT DEFAULT '', status TEXT DEFAULT '', PRIMARY KEY (ref, date));
-- รายการที่เกิดบน Cloudflare รอ ERP ดึงไป (synced=1 เมื่อ ERP ยืนยันรับแล้ว)
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, ref TEXT, code TEXT, name TEXT, date TEXT, time TEXT, kind TEXT, status TEXT,
  lat REAL, lng REAL, acc REAL, house TEXT, note TEXT, created TEXT, synced INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS events_synced ON events (synced, id);
-- ใส่ PIN ผิด → ล็อกชั่วคราว
CREATE TABLE IF NOT EXISTS fails (k TEXT PRIMARY KEY, n INTEGER DEFAULT 0, until INTEGER DEFAULT 0);
