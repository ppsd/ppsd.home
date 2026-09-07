// Seed data for the PPSD ERP database.
// Clean slate: a single admin user, no sample operational data.
// (เริ่มระบบเปล่า — ผู้ใช้ผู้ดูแลคนเดียว ไม่มีข้อมูลตัวอย่าง)

export const users = [
  { name: 'ธวัช วรรณสุข', username: 'thawat', pin: '1234', role: 'admin', status: 'ใช้งาน', last_active: 'ออนไลน์', position: 'ผู้จัดการ' },
]

export const houses = []
export const installments = []
export const issues = []
export const expenses = []
export const employees = []
export const ot = []
export const vendors = []
export const purchaseRequests = []
export const payments = []
