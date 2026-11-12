-- เงินเดือนบน Cloudflare (D1 ppsd-payroll)
-- ds = ชุดข้อมูลที่ ERP ส่งขึ้นมา (JSON ทั้งก้อน + ลายนิ้วมือ sha) เช่น employees, att:2026-10, leaves, payroll_batches
-- ช่วงก่อนเปิดใช้จริง (mirror): ERP เป็นตัวหลักทุกตาราง · หลังเปิดใช้: ตารางเงินเดือนย้ายมาเป็นตัวหลักบนนี้
CREATE TABLE IF NOT EXISTS ds (name TEXT PRIMARY KEY, sha TEXT NOT NULL, data TEXT NOT NULL, at TEXT);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
-- ใส่ PIN ผิด → ล็อกชั่วคราว · บันทึกการใช้งาน (ล็อกอิน/แก้ไข) — ERP ดึงไปเก็บในประวัติ
CREATE TABLE IF NOT EXISTS fails (k TEXT PRIMARY KEY, n INTEGER DEFAULT 0, until INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, who TEXT, action TEXT, detail TEXT, synced INTEGER DEFAULT 0);
