import Database from 'better-sqlite3'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'
import * as seed from './seed.js'
import { hashPin, isHashed } from './security.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, 'data')
mkdirSync(dataDir, { recursive: true })

export const db = new Database(join(dataDir, 'ppsd.sqlite'))
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, username TEXT UNIQUE, pin TEXT, role TEXT, status TEXT, last_active TEXT,
    signature TEXT, position TEXT
  );
  CREATE TABLE IF NOT EXISTS houses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT, name TEXT, project TEXT, customer TEXT,
    value INTEGER, pct INTEGER, collected INTEGER, remain INTEGER, status TEXT
  );
  CREATE TABLE IF NOT EXISTS installments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    house_code TEXT, no INTEGER, detail TEXT, days TEXT, due TEXT,
    ontime TEXT, amount INTEGER, status TEXT
  );
  CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    house_code TEXT, title TEXT, note TEXT, by TEXT, date TEXT, priority TEXT, status TEXT
  );
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT, house_code TEXT, item TEXT, cat TEXT, vendor TEXT, amount INTEGER
  );
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT, name TEXT, role TEXT, dept TEXT, start TEXT, status TEXT,
    base INTEGER, ot INTEGER, sso INTEGER, tax INTEGER,
    pay_type TEXT, sick_quota INTEGER, sick_used INTEGER, personal_quota INTEGER, personal_used INTEGER,
    vacation_quota INTEGER, vacation_used INTEGER, pin TEXT, signature TEXT
  );
  CREATE TABLE IF NOT EXISTS ot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, date TEXT, hours TEXT, rate TEXT, amount INTEGER, status TEXT
  );
  CREATE TABLE IF NOT EXISTS vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, type TEXT, tax_id TEXT, total INTEGER, outstanding INTEGER
  );
  CREATE TABLE IF NOT EXISTS purchase_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    no TEXT, date TEXT, house TEXT, by TEXT, item TEXT, amount INTEGER, status TEXT,
    requester_sig TEXT, approver TEXT, approver_sig TEXT, approved_date TEXT, image TEXT
  );
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT, no TEXT, payee TEXT, type TEXT, gross INTEGER, wht_rate INTEGER, wht INTEGER, net INTEGER
  );
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, phone TEXT, email TEXT, address TEXT, project TEXT,
    status TEXT, note TEXT, created TEXT
  );
  CREATE TABLE IF NOT EXISTS customer_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER, date TEXT, channel TEXT, note TEXT, by TEXT
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    house_code TEXT, name TEXT, start TEXT, end TEXT, progress INTEGER, status TEXT
  );
  CREATE TABLE IF NOT EXISTS sales_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT, no TEXT, customer TEXT, date TEXT, items TEXT,
    subtotal INTEGER, vat INTEGER, total INTEGER, status TEXT
  );
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    house_code TEXT, name TEXT, mime TEXT, size INTEGER, data TEXT, uploaded TEXT, uploader TEXT
  );
  CREATE TABLE IF NOT EXISTS leaves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_code TEXT, emp_name TEXT, type TEXT, start_date TEXT, end_date TEXT, days INTEGER,
    reason TEXT, status TEXT, by TEXT, approver TEXT, approved_date TEXT
  );
  CREATE TABLE IF NOT EXISTS time_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_name TEXT, date TEXT, kind TEXT, time TEXT, reason TEXT,
    status TEXT, by TEXT, approver TEXT, approved_date TEXT
  );
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_code TEXT, emp_name TEXT, date TEXT, check_in TEXT, check_out TEXT, status TEXT
  );
  CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    no TEXT, date TEXT, vendor TEXT, item TEXT, amount INTEGER, status TEXT,
    image TEXT, pr_no TEXT, by TEXT
  );
  CREATE TABLE IF NOT EXISTS contractors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    house_code TEXT, name TEXT, role TEXT, type TEXT,
    advance INTEGER, deducted INTEGER, paid INTEGER, note TEXT
  );
  CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT, user TEXT, action TEXT, detail TEXT
  );
  CREATE TABLE IF NOT EXISTS payroll_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period TEXT UNIQUE, data TEXT, total INTEGER, created TEXT, by TEXT
  );
  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY, value TEXT
  );
  CREATE TABLE IF NOT EXISTS location_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_code TEXT, emp_name TEXT, lat REAL, lng REAL, accuracy REAL, ts TEXT, date TEXT, note TEXT
  );
`)

// seed the default job positions (ตำแหน่งงาน) once — admins can add more later
if (db.prepare('SELECT COUNT(*) c FROM positions').get().c === 0) {
  const ins = db.prepare('INSERT INTO positions (name) VALUES (?)')
  for (const n of ['ดราฟแมน', 'โฟร์แมน', 'จัดซื้อ', 'บัญชี', 'การตลาด', 'เลขา', 'สถาปนิก', 'ผู้จัดการ', 'บุคคล']) ins.run(n)
}
// เพิ่มตำแหน่ง CEO / แม่บ้าน ให้ระบบที่ตั้งค่าไว้แล้ว (idempotent — ไม่ซ้ำ)
for (const n of ['CEO', 'แม่บ้าน']) db.prepare('INSERT OR IGNORE INTO positions (name) VALUES (?)').run(n)

// add a column to an existing table if it's missing (lightweight migration)
function ensureColumn(table, column, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all()
  if (cols.length === 0) return // ตารางยังไม่ถูกสร้าง (ฐานข้อมูลใหม่เอี่ยม) → ข้ามไปก่อน กันบูตครั้งแรกพัง
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
  }
}
ensureColumn('users', 'signature', 'TEXT')
ensureColumn('purchase_requests', 'requester_sig', 'TEXT')
ensureColumn('purchase_requests', 'approver', 'TEXT')
ensureColumn('purchase_requests', 'approver_sig', 'TEXT')
ensureColumn('purchase_requests', 'approved_date', 'TEXT')
ensureColumn('purchase_requests', 'image', 'TEXT')
ensureColumn('users', 'position', 'TEXT')
for (const c of ['pay_type']) ensureColumn('employees', c, 'TEXT')
for (const c of ['sick_quota', 'sick_used', 'personal_quota', 'personal_used', 'vacation_quota', 'vacation_used']) ensureColumn('employees', c, 'INTEGER')
ensureColumn('employees', 'pin', 'TEXT')
ensureColumn('employees', 'signature', 'TEXT')
ensureColumn('employees', 'spouse', 'INTEGER')
ensureColumn('employees', 'children', 'INTEGER')
for (const c of ['area', 'design', 'start_date', 'deliver_date', 'manager']) ensureColumn('houses', c, 'TEXT')
ensureColumn('ot', 'emp_code', 'TEXT')
ensureColumn('leaves', 'unpaid_days', 'INTEGER')
ensureColumn('leaves', 'hours', 'REAL') // ลารายชั่วโมง (0 = ลาเป็นวัน) · 8 ชม. = 1 วัน
// PO เงื่อนไขชำระ (เงินสด/เครดิต) + เครดิตประจำร้าน
ensureColumn('vendors', 'credit_days', 'INTEGER')
ensureColumn('purchase_orders', 'payment_type', 'TEXT')
ensureColumn('purchase_orders', 'credit_days', 'INTEGER')
ensureColumn('purchase_orders', 'due_date', 'TEXT')
// PO ผูกกับบ้าน + รายจ่ายที่สร้างจาก PO อัตโนมัติ
ensureColumn('purchase_orders', 'house_code', 'TEXT')
ensureColumn('expenses', 'po_id', 'INTEGER')
ensureColumn('expenses', 'date_iso', 'TEXT') // วันที่จ่าย (ISO) — ใช้เช็ก "กำหนดจ่าย" (ตั้งล่วงหน้า)
ensureColumn('ledger', 'date_iso', 'TEXT')   // วันที่ (ISO) — สำหรับกรองย้อนหลัง วัน/สัปดาห์/เดือน
ensureColumn('purchase_orders', 'due_iso', 'TEXT') // ISO due date for credit POs (for reminders)
ensureColumn('installments', 'contractor', 'TEXT') // งวดงานช่าง ผูกกับช่างคนไหน
ensureColumn('installments', 'paid', 'INTEGER') // ยอดที่จ่าย/เก็บแล้วของงวดนั้น (รองรับจ่ายบางส่วน)
ensureColumn('employees', 'track_token', 'TEXT') // โทเคนสำหรับลิงก์ติดตามตำแหน่งเบื้องหลัง (แอป GPS)
ensureColumn('employees', 'user_id', 'INTEGER') // ผูกพนักงานเข้ากับบัญชีผู้ใช้ (สร้างจากหน้าเพิ่มผู้ใช้)
ensureColumn('employees', 'retention', 'INTEGER')     // หัก retention รายเดือน (ค่าเริ่มต้น 500, ตั้ง 0 เมื่อหักครบ)
ensureColumn('employees', 'student_loan', 'INTEGER')  // หัก กยศ รายเดือน (เฉพาะคนที่มี)
ensureColumn('employees', 'retention_opening', 'INTEGER') // ยอด retention ที่หักสะสมมาก่อนใช้ระบบ (พนักงานเก่า) — บวกกับที่หักผ่านระบบ เพื่อดูยอดสะสมจริง
ensureColumn('employees', 'work_days', 'INTEGER') // จำนวนวันทำงานในงวด (สำหรับพนักงานรายวัน เช่น แม่บ้าน) — คิดเงิน = ค่าแรง/วัน × วันทำงาน
db.prepare('UPDATE employees SET retention=500 WHERE retention IS NULL').run() // ตั้ง 500 ให้พนักงานเดิมก่อน (แก้ได้)
db.prepare('UPDATE employees SET retention_opening=0 WHERE retention_opening IS NULL').run()
// เบิกเงินเดือนล่วงหน้า — สิ้นเดือนหักคืนจากยอดสุทธิ
db.exec(`CREATE TABLE IF NOT EXISTS salary_advances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_code TEXT, emp_name TEXT, period TEXT, date TEXT, amount INTEGER, note TEXT, by TEXT, created TEXT
)`)
ensureColumn('employees', 'bank_name', 'TEXT') // ธนาคารสำหรับโอนเงินเดือน
ensureColumn('employees', 'bank_acct', 'TEXT') // เลขบัญชีธนาคาร (ไฟล์จ่ายเงินเดือนผ่านธนาคาร)
ensureColumn('employees', 'tax_id', 'TEXT') // เลขประจำตัวผู้เสียภาษี (ภงด.1)
// งวดที่ปิดแล้ว (เก็บแล้ว/จ่ายแล้ว) ให้ paid = เต็มจำนวน · ที่เหลือ = 0
db.prepare("UPDATE installments SET paid=amount WHERE paid IS NULL AND status IN ('เก็บแล้ว','จ่ายแล้ว')").run()
db.prepare('UPDATE installments SET paid=0 WHERE paid IS NULL').run()
ensureColumn('sales_docs', 'house_code', 'TEXT') // ใบเสนอราคา/แจ้งหนี้ ผูกกับบ้าน
for (const c of ['house_code', 'category']) ensureColumn('purchase_requests', c, 'TEXT') // PR ผูกบ้าน/หมวด
ensureColumn('purchase_requests', 'items', 'TEXT') // PR หลายรายการในใบเดียว (JSON: [{desc,qty,unit,price}])
ensureColumn('purchase_requests', 'images', 'TEXT') // PR แนบได้หลายรูป (JSON array ของ data URL, สูงสุด 3)
// สมุดค่าของที่บริษัทออกให้ผู้รับเหมาก่อน แล้วหักจากงวด (advance = ออกให้, deduct = หักจากงวด)
db.exec(`CREATE TABLE IF NOT EXISTS contractor_advances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contractor_id INTEGER, house_code TEXT, date TEXT, type TEXT, item TEXT, amount INTEGER, by TEXT
)`)
// งวดงาน 2 ฝั่ง (ลูกค้า/ช่าง) + แยก 3 หมวด (house/carport/road) + ราคาต่อ ตร.ม. + ต้นทุนช่าง + ยอดจ่ายช่าง
ensureColumn('installments', 'side', 'TEXT')
ensureColumn('installments', 'category', 'TEXT')
db.prepare("UPDATE installments SET category='house' WHERE category IS NULL OR category=''").run()
for (const c of ['area_sqm', 'price_customer', 'price_contractor', 'contractor_value', 'paid']) ensureColumn('houses', c, 'INTEGER')
// มูลค่าแยก 3 หมวด (ตัวบ้าน/โรงจอดรถ/ถนน-รั้ว) ทั้งฝั่งลูกค้าและช่าง — ใส่เป็นยอดก้อน (ไม่ใช้ราคาต่อ ตร.ม.)
for (const c of ['carport_customer', 'carport_contractor', 'road_customer', 'road_contractor', 'house_customer', 'house_contractor']) ensureColumn('houses', c, 'INTEGER')
// ย้ายข้อมูลเก่าที่เคยคิดจากราคาต่อ ตร.ม. มาเป็นยอดก้อนของหมวด "ตัวบ้าน" (ทำครั้งเดียว)
db.prepare('UPDATE houses SET house_customer = area_sqm*price_customer WHERE (house_customer IS NULL OR house_customer=0) AND COALESCE(area_sqm,0)>0 AND COALESCE(price_customer,0)>0').run()
db.prepare('UPDATE houses SET house_contractor = area_sqm*price_contractor WHERE (house_contractor IS NULL OR house_contractor=0) AND COALESCE(area_sqm,0)>0 AND COALESCE(price_contractor,0)>0').run()
db.prepare("UPDATE installments SET side='customer' WHERE side IS NULL OR side=''").run()
// ===== CEO สั่งงานด้วยเสียง: คนสำรอง (work_orders columns ย้ายไปหลัง CREATE TABLE work_orders) =====
ensureColumn('employees', 'backup_code', 'TEXT') // คนสำรอง (รหัสพนักงาน) — งานด่วนถ้าคนหลักไม่รับ ไล่ไปหาคนนี้
// หัวข้อใหญ่ (หมวดงวดงาน) ที่ผู้ใช้เพิ่มเองต่อบ้าน — นอกเหนือจาก 3 หมวดมาตรฐาน (ตัวบ้าน/โรงจอดรถ/ถนน-รั้ว)
db.exec(`CREATE TABLE IF NOT EXISTS house_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  house_code TEXT, label TEXT, created TEXT
)`)

// ===== Phase 1: รองรับงาน "ควบคุมงานก่อสร้าง" (CM) + โมดูลใหม่ =====
// houses: ประเภทโครงการ (sale=ขายบ้าน / cm=ควบคุมงาน) + ข้อมูลสัญญา-ผู้เกี่ยวข้องแบบ CM
ensureColumn('houses', 'kind', 'TEXT')
db.prepare("UPDATE houses SET kind='sale' WHERE kind IS NULL OR kind=''").run()
ensureColumn('houses', 'owner', 'TEXT') // เจ้าของโครงการ / ผู้ว่าจ้าง
ensureColumn('houses', 'contract_no', 'TEXT') // เลขที่สัญญา
ensureColumn('houses', 'scope', 'TEXT') // ขอบเขตงาน (Scope of Work)
ensureColumn('houses', 'engineer', 'TEXT') // วิศวกรโครงการ
ensureColumn('houses', 'supervisor', 'TEXT') // ผู้ควบคุมงาน
ensureColumn('houses', 'service_fee', 'INTEGER') // ค่าบริการควบคุมงาน (เฉพาะ CM)
ensureColumn('houses', 'site_location', 'TEXT') // ที่ตั้งโครงการ
// tasks: น้ำหนักงาน (%) สำหรับคำนวณ S-Curve แผน vs จริง
ensureColumn('tasks', 'weight', 'INTEGER')
// ใบประเมินผู้รับเหมาช่วง (Subcontractor Performance Evaluation)
db.exec(`CREATE TABLE IF NOT EXISTS contractor_evals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contractor_id INTEGER, house_code TEXT, name TEXT,
  scores TEXT, avg REAL, grade TEXT, comment TEXT, by TEXT, date TEXT
)`)
// ใบเปรียบเทียบราคา (price comparison) ผูกกับใบขอซื้อ (PR)
db.exec(`CREATE TABLE IF NOT EXISTS pr_quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_id INTEGER, vendor TEXT, price INTEGER, terms TEXT, note TEXT, chosen INTEGER
)`)

// ===== ชั้นควบคุมภายใน / กันโกง (Internal Control) =====
// PR: อนุมัติ 2 ชั้น (สำหรับยอดสูง) — ผู้อนุมัติชั้นที่ 2 ต้องเป็นคนละคน
ensureColumn('purchase_requests', 'approver2', 'TEXT')
ensureColumn('purchase_requests', 'approver2_sig', 'TEXT')
ensureColumn('purchase_requests', 'approved2_date', 'TEXT')
// audit: เก็บค่าก่อน→หลัง สำหรับการแก้ไขข้อมูลการเงิน (immutable trail)
ensureColumn('audit', 'before', 'TEXT')
ensureColumn('audit', 'after', 'TEXT')
// การรับทราบ/เคลียร์สัญญาณเตือน (acknowledge red flags)
db.exec(`CREATE TABLE IF NOT EXISTS flag_acks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flag_key TEXT UNIQUE, by TEXT, date TEXT, note TEXT
)`)

// ===== ใบสั่งงาน + ควบคุมคุณภาพ (Work Order & QC) =====
db.exec(`CREATE TABLE IF NOT EXISTS work_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no TEXT, priority TEXT, issued_date TEXT, due_date TEXT, due_time TEXT, line_group TEXT,
  reviewer TEXT, executor TEXT, executor_code TEXT, project TEXT, house_code TEXT,
  scope TEXT, dod TEXT, budget TEXT,
  exec_start TEXT, exec_end TEXT, exec_total TEXT, obstacle TEXT, fix_note TEXT,
  qc TEXT, acceptance TEXT, acceptance_note TEXT,
  score INTEGER, commendation TEXT, lessons TEXT,
  status TEXT, ack INTEGER, ack_by TEXT, ack_date TEXT, by TEXT, created TEXT
)`)
// คอลัมน์งานด่วน + สั่งงานด้วยเสียง (ต่อจาก CREATE TABLE work_orders เพื่อให้ฐานข้อมูลใหม่ก็มีครบ)
for (const [c, t] of [
  ['urgent', 'INTEGER'],        // 1 = งานด่วน (ต้องรับภายในกำหนด)
  ['created_ts', 'TEXT'],       // เวลาสั่งงานแบบละเอียด (YYYY-MM-DD HH:MM:SS) สำหรับนับถอยหลัง
  ['deadline_min', 'INTEGER'],  // ต้องรับภายในกี่นาที (งานด่วน ค่าเริ่ม 5)
  ['seen', 'INTEGER'], ['seen_ts', 'TEXT'],   // ผู้รับ "เปิดดู" แล้วเมื่อไหร่
  ['ack_ts', 'TEXT'],           // เวลากดรับทราบแบบละเอียด
  ['esc_level', 'INTEGER'],     // ไล่ระดับถึงขั้นที่เท่าไหร่ (0 = คนหลัก)
  ['esc_code', 'TEXT'], ['esc_name', 'TEXT'], ['esc_ts', 'TEXT'], // ตอนนี้อยู่ที่ใคร
  ['esc_log', 'TEXT'],          // ประวัติการไล่ระดับ (JSON)
  ['source', 'TEXT'],           // 'voice' ถ้ามาจากสั่งงานด้วยเสียงของ CEO
  ['submit_ts', 'TEXT'],        // เวลาที่ผู้รับงาน "ส่งงาน" (YYYY-MM-DD HH:MM:SS)
  ['submit_date', 'TEXT'],      // วันส่งงาน (ISO) ใช้เทียบกับกำหนดส่งเพื่อคิด KPI
  ['submit_link', 'TEXT'],      // ลิงก์งานที่แนบมาตอนส่งงาน
  ['submit_files', 'TEXT'],     // ไฟล์งานที่แนบ (JSON: [{id,name}])
  ['submit_note', 'TEXT'],      // หมายเหตุตอนส่งงาน
  ['accept_ts', 'TEXT'],        // เวลาที่ผู้สั่งงาน "กดรับงาน"
  ['accept_by', 'TEXT'],        // ผู้สั่งงานที่กดรับ
  ['kpi_days', 'INTEGER'],      // ส่งก่อน(+)/หลัง(-) กำหนดกี่วัน (เก็บไว้อ้างอิง)
]) ensureColumn('work_orders', c, t)

// ===== ประเมินผลรายเดือน (PMS / KPI) =====
db.exec(`CREATE TABLE IF NOT EXISTS pms_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no TEXT, emp_code TEXT, emp_name TEXT, position TEXT, template TEXT, month TEXT, evaluator TEXT,
  kpi TEXT, competency TEXT, behavior TEXT,
  kpi_score REAL, comp_score REAL, beh_score REAL, total REAL, grade TEXT, bonus_pct INTEGER,
  strengths TEXT, improve TEXT, plan TEXT, by TEXT, created TEXT
)`)
// หักคะแนนวินัย: ขาด/ลา/มาสาย + คะแนนดิบก่อนหัก
ensureColumn('pms_reviews', 'att_absent', 'INTEGER')
ensureColumn('pms_reviews', 'att_leave', 'INTEGER')
ensureColumn('pms_reviews', 'att_late', 'INTEGER')
ensureColumn('pms_reviews', 'att_wo_overdue', 'INTEGER') // ใบสั่งงานเกินกำหนด → หักคะแนน KPI
ensureColumn('pms_reviews', 'penalty', 'REAL')
ensureColumn('pms_reviews', 'raw_total', 'REAL')

// ===== เฟส 4: BOQ/ตีราคา + Cash Flow Forecast + บัญชีรับ-จ่ายละเอียด =====
db.exec(`CREATE TABLE IF NOT EXISTS boqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no TEXT, house_code TEXT, title TEXT, markup_pct REAL, vat_pct REAL,
  items TEXT, by TEXT, date TEXT, created TEXT
)`)
db.exec(`CREATE TABLE IF NOT EXISTS cashflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no TEXT, house_code TEXT, title TEXT, opening INTEGER, months TEXT, rows TEXT, by TEXT, date TEXT, created TEXT
)`)
db.exec(`CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT, house_code TEXT, kind TEXT, category TEXT, item TEXT,
  amount INTEGER, budget INTEGER, method TEXT, party TEXT, note TEXT, by TEXT, created TEXT, date_iso TEXT
)`)

// ===== ระบบบัญชีคู่ (Double-entry General Ledger) — เฟส 1 =====
// ผังบัญชี (Chart of Accounts)
db.exec(`CREATE TABLE IF NOT EXISTS accounts (
  code TEXT PRIMARY KEY,
  name TEXT,
  type TEXT,          -- asset | liability | equity | revenue | cost | expense
  parent TEXT,        -- รหัสบัญชีแม่ (ถ้ามี)
  is_active INTEGER DEFAULT 1,
  builtin INTEGER DEFAULT 0
)`)
// สมุดรายวัน (Journal) — หัวรายการ
db.exec(`CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no TEXT, date TEXT, date_iso TEXT, memo TEXT, house_code TEXT,
  source TEXT,        -- manual | inst | exp | payroll | ... (ที่มาของรายการ)
  source_id TEXT,     -- อ้างอิงเอกสารต้นทาง (ใช้ลงบัญชีอัตโนมัติแบบไม่ซ้ำ)
  void INTEGER DEFAULT 0,
  by TEXT, created TEXT
)`)
// บรรทัดเดบิต/เครดิต (Journal lines) — ผลรวมเดบิต = เครดิตเสมอ
db.exec(`CREATE TABLE IF NOT EXISTS journal_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER, account TEXT, debit REAL DEFAULT 0, credit REAL DEFAULT 0, memo TEXT
)`)
db.exec('CREATE INDEX IF NOT EXISTS idx_jl_entry ON journal_lines(entry_id)')
db.exec('CREATE INDEX IF NOT EXISTS idx_jl_account ON journal_lines(account)')
db.exec('CREATE INDEX IF NOT EXISTS idx_je_source ON journal_entries(source, source_id)')
ensureColumn('journal_entries', 'ref', 'TEXT') // เลขที่เอกสารอ้างอิง (เช่น เลขบิลเงินสดย่อย)
ensureColumn('journal_lines', 'reconciled', 'INTEGER') // เฟส 3: 1 = กระทบยอดธนาคารแล้ว
ensureColumn('installments', 'due_iso', 'TEXT')        // เฟส 3: วันครบกำหนด (ISO) สำหรับ AR/AP aging
ensureColumn('files', 'category', 'TEXT')              // หมวดไฟล์แนบ (สัญญา/แบบ/ใบอนุญาต/รูป/อื่นๆ)
ensureColumn('files', 'path', 'TEXT')                  // ชื่อไฟล์บนดิสก์ (เก็บไฟล์จริงแทน base64 ในฐานข้อมูล)
ensureColumn('payments', 'house_code', 'TEXT')         // ผูกใบจ่ายเงิน/หัก ณ ที่จ่าย กับบ้าน (รวมเข้าต้นทุนบ้าน)
ensureColumn('payments', 'note', 'TEXT')               // หมายเหตุ/รายละเอียดค่าใช้จ่าย
ensureColumn('houses', 'photo', 'TEXT')                // รูปหน้าปกบ้าน (data URL ย่อขนาดแล้ว)

// ===== เฟส 4: สินทรัพย์ถาวร + ค่าเสื่อมราคา =====
db.exec(`CREATE TABLE IF NOT EXISTS fixed_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT, name TEXT, category TEXT, acquire_date TEXT, cost REAL, salvage REAL,
  life_years REAL, method TEXT, house_code TEXT, note TEXT,
  disposed INTEGER DEFAULT 0, dispose_date TEXT, by TEXT, created TEXT
)`)

// ผังบัญชีมาตรฐาน (ธุรกิจรับเหมาก่อสร้าง SME ไทย) — seed แบบ idempotent ตามรหัส
{
  const CHART = [
    // สินทรัพย์
    ['1010', 'เงินสด', 'asset'], ['1020', 'เงินฝากธนาคาร', 'asset'], ['1030', 'เงินสดย่อย', 'asset'],
    ['1140', 'ลูกหนี้การค้า', 'asset'], ['1160', 'ภาษีซื้อ', 'asset'],
    ['1170', 'งานระหว่างก่อสร้าง', 'asset'], ['1180', 'วัสดุคงเหลือ', 'asset'],
    ['1210', 'อาคารและอุปกรณ์', 'asset'], ['1220', 'ค่าเสื่อมราคาสะสม', 'asset'],
    // หนี้สิน
    ['2010', 'เจ้าหนี้การค้า', 'liability'], ['2020', 'เจ้าหนี้เงินประกันผลงาน', 'liability'],
    ['2030', 'ภาษีขาย', 'liability'], ['2040', 'ภาษีหัก ณ ที่จ่ายค้างนำส่ง', 'liability'],
    ['2050', 'ประกันสังคมค้างนำส่ง', 'liability'], ['2060', 'เงินเดือนค้างจ่าย', 'liability'],
    ['2070', 'เงินรับล่วงหน้าจากลูกค้า', 'liability'],
    // ส่วนของผู้ถือหุ้น
    ['3010', 'ทุนจดทะเบียน', 'equity'], ['3020', 'กำไรสะสม', 'equity'],
    // รายได้
    ['4010', 'รายได้จากการรับเหมาก่อสร้าง', 'revenue'], ['4090', 'รายได้อื่น', 'revenue'],
    // ต้นทุนงานก่อสร้าง
    ['5010', 'ต้นทุนค่าวัสดุ', 'cost'], ['5020', 'ต้นทุนค่าแรง', 'cost'],
    ['5030', 'ต้นทุนผู้รับเหมาช่วง', 'cost'], ['5040', 'ต้นทุนเครื่องจักร/อุปกรณ์', 'cost'],
    ['5090', 'ต้นทุนงานก่อสร้างอื่น', 'cost'],
    // ค่าใช้จ่ายดำเนินงาน
    ['6010', 'เงินเดือน (สำนักงาน)', 'expense'], ['6020', 'ค่าใช้จ่ายสำนักงาน', 'expense'],
    ['6030', 'ค่าขนส่ง/น้ำมัน', 'expense'], ['6040', 'ค่าธรรมเนียม/ค่าบริการวิชาชีพ', 'expense'],
    ['6050', 'ค่าเสื่อมราคา', 'expense'], ['6090', 'ค่าใช้จ่ายอื่น', 'expense'],
  ]
  const ins = db.prepare('INSERT OR IGNORE INTO accounts (code,name,type,builtin) VALUES (?,?,?,1)')
  const many = db.transaction((rows) => rows.forEach((r) => ins.run(r[0], r[1], r[2])))
  many(CHART)
}

// ===== เฟส 3: QC Checklist / รายงานหน้างาน / ตรวจรับงวด =====
db.exec(`CREATE TABLE IF NOT EXISTS qc_inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no TEXT, house_code TEXT, category TEXT, type TEXT, zone TEXT,
  inspector TEXT, date TEXT, status TEXT, items TEXT, remark TEXT, by TEXT, created TEXT
)`)
ensureColumn('qc_inspections', 'images', 'TEXT')      // รูปแนบ (JSON array ของ data URL สูงสุด 3 รูป)
ensureColumn('qc_inspections', 'start_date', 'TEXT')  // วันเริ่มตรวจ/เริ่มงาน (ISO)
ensureColumn('qc_inspections', 'end_date', 'TEXT')    // วันกำหนดเสร็จ (ISO) — ใช้เตือนเลยกำหนด
db.exec(`CREATE TABLE IF NOT EXISTS site_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT, no TEXT, house_code TEXT, date TEXT, data TEXT, by TEXT, created TEXT
)`)
db.exec(`CREATE TABLE IF NOT EXISTS inst_acceptance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  installment_id INTEGER, house_code TEXT, no TEXT, date TEXT, inspector TEXT,
  result TEXT, checklist TEXT, works TEXT, note TEXT, by TEXT, created TEXT
)`)

// ===== เอกสารหน้างาน (Site Documents): RFI / RFA / NCR / VO =====
db.exec(`CREATE TABLE IF NOT EXISTS site_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT, no TEXT, house_code TEXT, discipline TEXT,
  title TEXT, detail TEXT, status TEXT,
  by TEXT, date TEXT, assignee TEXT,
  response TEXT, responded_by TEXT, responded_date TEXT,
  cost_impact INTEGER, days_impact INTEGER, image TEXT, created TEXT
)`)

// ===== เฟส 5: ความปลอดภัย (PPE / Toolbox Talk / JHA) =====
db.exec(`CREATE TABLE IF NOT EXISTS safety_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT, no TEXT, house_code TEXT, date TEXT, title TEXT,
  data TEXT, by TEXT, created TEXT
)`)

// ===== เฟส 5: ใบส่งมอบงาน / หนังสือรับรองผลงาน =====
db.exec(`CREATE TABLE IF NOT EXISTS handover_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT, no TEXT, house_code TEXT, date TEXT, title TEXT,
  data TEXT, status TEXT, by TEXT, created TEXT
)`)

// ===== ทะเบียนควบคุมเอกสาร (สัญญา / แบบ / สเปก + revision) =====
db.exec(`CREATE TABLE IF NOT EXISTS doc_register (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no TEXT, category TEXT, title TEXT, doc_no TEXT, revision TEXT, rev_date TEXT,
  status TEXT, owner TEXT, house_code TEXT, note TEXT, revisions TEXT, expiry TEXT, by TEXT, created TEXT
)`)
ensureColumn('doc_register', 'expiry', 'TEXT') // วันหมดอายุ (ใบอนุญาต/เอกสารมีอายุ) — ISO YYYY-MM-DD
ensureColumn('users', 'must_change_pin', 'INTEGER') // 1 = ถูกรีเซ็ต PIN ต้องตั้งใหม่ตอนเข้าครั้งแรก
// คำขอรีเซ็ต PIN (ลืม PIN) — ผู้ใช้ส่งคำขอ แอดมินอนุมัติ/รีเซ็ตให้
db.exec(`CREATE TABLE IF NOT EXISTS pin_reset_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT, name TEXT, status TEXT, note TEXT,
  created TEXT, resolved_by TEXT, resolved_at TEXT
)`)

// วันหยุดบริษัท (ISO YYYY-MM-DD) — ไม่นับเป็น "ขาด" ในการลงเวลา
db.exec(`CREATE TABLE IF NOT EXISTS holidays (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT UNIQUE, name TEXT)`)
// ตั้งวันหยุดบริษัทปี 2569 (2026) ให้ครั้งแรกครั้งเดียว
if (db.prepare("SELECT value FROM settings WHERE key='holidays_seeded'").get() == null) {
  const H2026 = [
    ['2026-01-01', 'วันขึ้นปีใหม่'], ['2026-01-02', 'หยุดปีใหม่'], ['2026-01-03', 'หยุดปีใหม่'], ['2026-01-04', 'หยุดปีใหม่'],
    ['2026-02-17', 'วันเที่ยว (หลังไหว้เจ้า)'],
    ['2026-04-12', 'สงกรานต์'], ['2026-04-13', 'สงกรานต์'], ['2026-04-14', 'สงกรานต์'], ['2026-04-15', 'สงกรานต์'],
    ['2026-05-01', 'วันแรงงาน'],
    ['2026-08-28', 'หลังวันไหว้เจ้า'],
    ['2026-10-13', 'วันคล้ายวันสวรรคต ร.9'],
    ['2026-12-28', 'หยุดสิ้นปี'], ['2026-12-29', 'หยุดสิ้นปี'], ['2026-12-30', 'หยุดสิ้นปี'], ['2026-12-31', 'วันสิ้นปี'],
  ]
  const ins = db.prepare('INSERT OR IGNORE INTO holidays (date,name) VALUES (?,?)')
  db.transaction(() => H2026.forEach(([d, n]) => ins.run(d, n)))()
  db.prepare("INSERT INTO settings (key,value) VALUES ('holidays_seeded','1') ON CONFLICT(key) DO UPDATE SET value='1'").run()
}
// เติมการลงเวลาย้อนหลังให้ 1 ส.ค. 69 (เสาร์) และ 3 ส.ค. 69 (จันทร์) — ช่วงที่ระบบยังไม่ได้เปิด แต่พนักงานมาทำงานจริง
// ทำครั้งเดียว · ใส่ให้เฉพาะพนักงานที่ยังทำงานอยู่และยังไม่มีบันทึกในวันนั้น (ไม่ทับของเดิม)
if (db.prepare("SELECT value FROM settings WHERE key='att_backfill_aug2026'").get() == null) {
  const emps = db.prepare("SELECT code,name FROM employees WHERE COALESCE(status,'') != 'ลาออก'").all()
  const insAtt = db.prepare('INSERT INTO attendance (emp_code,emp_name,date,check_in,check_out,status) VALUES (?,?,?,?,?,?)')
  db.transaction(() => {
    for (const d of ['2026-08-01', '2026-08-03']) {
      for (const e of emps) {
        const has = db.prepare('SELECT id FROM attendance WHERE emp_code=? AND date=?').get(e.code, d)
        if (!has) insAtt.run(e.code, e.name, d, '08:00', '17:00', 'ปกติ')
      }
    }
  })()
  db.prepare("INSERT INTO settings (key,value) VALUES ('att_backfill_aug2026','1') ON CONFLICT(key) DO UPDATE SET value='1'").run()
}

function seedTable(table, rows, cols) {
  const count = db.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c
  if (count > 0) return
  const placeholders = cols.map((c) => `@${c}`).join(', ')
  const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`)
  const insertMany = db.transaction((items) => items.forEach((it) => stmt.run(it)))
  insertMany(rows)
}

seedTable('users', seed.users, ['name', 'username', 'pin', 'role', 'status', 'last_active', 'position'])
seedTable('houses', seed.houses, ['code', 'name', 'project', 'customer', 'value', 'pct', 'collected', 'remain', 'status'])
seedTable('installments', seed.installments, ['house_code', 'no', 'detail', 'days', 'due', 'ontime', 'amount', 'status'])
seedTable('issues', seed.issues, ['house_code', 'title', 'note', 'by', 'date', 'priority', 'status'])
seedTable('expenses', seed.expenses, ['date', 'house_code', 'item', 'cat', 'vendor', 'amount'])
seedTable('employees', seed.employees, ['code', 'name', 'role', 'dept', 'start', 'status', 'base', 'ot', 'sso', 'tax'])
seedTable('ot', seed.ot, ['name', 'date', 'hours', 'rate', 'amount', 'status'])
seedTable('vendors', seed.vendors, ['name', 'type', 'tax_id', 'total', 'outstanding'])
seedTable('purchase_requests', seed.purchaseRequests, ['no', 'date', 'house', 'by', 'item', 'amount', 'status'])
seedTable('payments', seed.payments, ['date', 'no', 'payee', 'type', 'gross', 'wht_rate', 'wht', 'net'])

// hash any plaintext PINs (users + employees) — runs once after seeding/migration
for (const u of db.prepare('SELECT id,pin FROM users').all())
  if (u.pin && !isHashed(u.pin)) db.prepare('UPDATE users SET pin=? WHERE id=?').run(hashPin(u.pin), u.id)
for (const e of db.prepare('SELECT id,pin FROM employees').all())
  if (e.pin && !isHashed(e.pin)) db.prepare('UPDATE employees SET pin=? WHERE id=?').run(hashPin(e.pin), e.id)

// เชื่อมผู้ใช้เดิม ↔ พนักงาน HR: สร้างพนักงานให้ผู้ใช้ที่ยังไม่มีชื่อตรงกันใน HR (idempotent — ทำครั้งเดียวต่อคน)
{
  const usersNoEmp = db.prepare('SELECT * FROM users u WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.name = u.name)').all()
  if (usersNoEmp.length) {
    let maxNum = db.prepare("SELECT code FROM employees WHERE code LIKE 'EMP-%'").all()
      .reduce((m, r) => Math.max(m, parseInt(String(r.code).slice(4), 10) || 0), 0)
    const ins = db.prepare(`INSERT INTO employees (code,name,role,dept,start,status,base,ot,sso,tax,pay_type,
      sick_quota,sick_used,personal_quota,personal_used,vacation_quota,vacation_used,pin,signature,spouse,children,user_id)
      VALUES (?,?,?,?,?,?,0,0,0,0,'รายเดือน',30,0,3,0,3,0,?,NULL,0,0,?)`)
    for (const u of usersNoEmp) {
      maxNum += 1
      ins.run('EMP-' + String(maxNum).padStart(3, '0'), u.name, u.position || '', u.position || '', '', 'ทดลองงาน', u.pin || null, u.id)
    }
  }
  // ผูก user_id ให้พนักงานที่ชื่อตรงกับผู้ใช้ (ยังไม่ผูก)
  db.prepare("UPDATE employees SET user_id=(SELECT id FROM users u WHERE u.name=employees.name) WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM users u WHERE u.name=employees.name)").run()
  // PIN ลงเวลา = PIN ผู้ใช้: ให้พนักงานที่ผูกกับบัญชีใช้ PIN เดียวกับผู้ใช้
  db.prepare("UPDATE employees SET pin=(SELECT pin FROM users u WHERE u.id=employees.user_id) WHERE user_id IS NOT NULL AND (SELECT pin FROM users u WHERE u.id=employees.user_id) IS NOT NULL").run()
}
