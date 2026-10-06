// แบบประเมินผลรายเดือน (PMS) — KPI 70 + Competency 20 + Behavior 10 = 100
// ชุด KPI ตามตำแหน่งเก็บในฐานข้อมูล (ตาราง pms_kpi_sets · ค่าเริ่มต้นใน server/pms_seed.js) แก้ไขได้ที่หน้าประเมินผล → "ชุด KPI ตามตำแหน่ง"
// KPI วัดผลได้จริง: Target = % เป้าหมาย (เช่น 95) หรือ % ที่ต้องทำได้ (เช่น ลดต้นทุน ≥30 = target 30)
export interface KpiDef { name: string; weight: number; target: number }
export interface RateDef { name: string; weight: number }
export interface KpiSet { id: number; name: string; note: string; updated?: string; by?: string; kpi: KpiDef[]; competency: RateDef[]; behavior: RateDef[] }
export interface KpiSetsPayload {
  sets: KpiSet[]
  mapping: Record<string, number> // ตำแหน่ง → id ชุด KPI
  positions: string[]
  empCount: Record<string, number>
  overrides: { code: string; name: string; kpi_set_id: number }[]
}
// ข้อมูลหลักของพนักงานในหน้าประเมิน (GET /pms/employee/:code)
export interface PmsEmpInfo {
  code: string; name: string; prefix: string; nickname: string; position: string; dept: string; start: string; status: string; pay_type: string
  kpi_set_id: number | null; kpi_set: KpiSet | null; kpi_source: '' | 'position' | 'employee'
  history: { id: number; no: string; month: string; total: number; grade: string; template: string }[]
}
export const PMS_PART_MAX = { kpi: 70, competency: 20, behavior: 10 } as const

// เกณฑ์เกรด/โบนัส (คำนวณจากคะแนนรวม 100) — ต่ำกว่า 75 = ปัดตก (ไม่ได้โบนัส)
export const PMS_BONUS = [
  { min: 95, grade: 'A', bonus: 120, label: '95 ขึ้นไป' },
  { min: 90, grade: 'B', bonus: 100, label: '90 - 94' },
  { min: 80, grade: 'C', bonus: 80, label: '80 - 89' },
  { min: 75, grade: 'D', bonus: 50, label: '75 - 79 (ผ่านขั้นต่ำ)' },
  { min: 0, grade: 'F', bonus: 0, label: 'ต่ำกว่า 75 (ปัดตก)' },
]
// อัตราหักคะแนนวินัย (ต่อครั้ง/ต่อวัน)
export const PMS_PENALTY = { late: 1, absent: 3, leave: 0.5, wo_overdue: 3 }
export const RATING_MEANING: Record<number, string> = {
  5: 'ดีเยี่ยม (Excellent)', 4: 'ดีมาก (Very Good)', 3: 'ตามมาตรฐาน (Good)', 2: 'ต้องปรับปรุง', 1: 'ไม่ผ่าน (Poor)',
}
