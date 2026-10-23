// ชั้นของรายการ BOQ — ใช้แบ่งสรุปวัสดุ "แยกชั้น × ประเภทงาน" (ชื่อต้องตรงกับ cleanFloor ใน server/takeoff.js)
export const FLOOR_ALL = 'ทั้งหลัง'
const BASE = ['ฐานราก/ใต้ดิน', 'ชั้น 1', 'ชั้น 2', 'ชั้น 3', 'หลังคา', 'ภายนอก', FLOOR_ALL]

// ลำดับแสดงผล: ฐานราก → ชั้น 1, 2, ... → ชั้นอื่น (เช่น ชั้นลอย) → หลังคา → ภายนอก → ทั้งหลัง
const rank = (f: string) => {
  if (f === 'ฐานราก/ใต้ดิน') return 0
  const n = /^ชั้น (\d+)$/.exec(f)
  if (n) return Number(n[1])
  return f === 'หลังคา' ? 900 : f === 'ภายนอก' ? 901 : f === FLOOR_ALL ? 902 : 500
}
export const sortFloors = (fs: string[]) => [...new Set(fs)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'th'))
/** ตัวเลือกชั้นในช่องเลือก = ชั้นมาตรฐาน + ชั้นที่มีอยู่ในรายการแล้ว */
export const floorOptions = (present: string[]) => sortFloors([...BASE, ...present.filter(Boolean)])

/** ปริมาณงานของหมวดหนึ่ง (ชั้น × ประเภทงาน × ส่วนงาน) ที่ AI วัดจากแบบ เช่น พื้นที่พื้น 25.5 ตร.ม. · คานยาว 42 ม. */
export interface WorkSec { floor: string; cat: string; part: string; sheet: string; work: { desc: string; qty: number; unit: string }[] }
