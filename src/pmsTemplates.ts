// เทมเพลตแบบประเมินผลรายเดือน (PMS) ตามตำแหน่ง — KPI 70 + Competency 20 + Behavior 10 = 100
// KPI วัดผลได้จริง: Target = % เป้าหมาย (เช่น 95) หรือ % ที่ต้องทำได้ (เช่น ลดต้นทุน ≥30 = target 30)
export interface KpiDef { name: string; weight: number; target: number }
export interface RateDef { name: string; weight: number }
export interface PmsTemplate { position: string; kpi: KpiDef[]; competency: RateDef[]; behavior: RateDef[] }

// พฤติกรรม (Behavior) มาตรฐานเหมือนกันทุกตำแหน่ง = 10 คะแนน
const B: RateDef[] = [
  { name: 'วินัยและตรงต่อเวลา', weight: 3 },
  { name: 'ความรับผิดชอบ', weight: 3 },
  { name: 'ปฏิบัติตามระบบงาน', weight: 2 },
  { name: 'ความคิดริเริ่ม', weight: 2 },
]

export const PMS_TEMPLATES: PmsTemplate[] = [
  {
    position: 'ผู้จัดการ',
    kpi: [
      { name: 'ผลงานรวมของทีม/โครงการตามเป้า', weight: 20, target: 95 },
      { name: 'คุมงบประมาณ/กำไรตามแผน', weight: 15, target: 95 },
      { name: 'ส่งมอบงานตรงเวลาตามสัญญา', weight: 12, target: 95 },
      { name: 'การพัฒนาและรักษาทีมงาน', weight: 10, target: 90 },
      { name: 'ความพึงพอใจลูกค้า/เจ้าของงาน', weight: 8, target: 90 },
      { name: 'การรายงานและตัดสินใจทันเวลา', weight: 5, target: 95 },
    ],
    competency: [
      { name: 'ภาวะผู้นำ', weight: 6 }, { name: 'การวางแผนเชิงกลยุทธ์', weight: 5 },
      { name: 'การบริหารทีม', weight: 4 }, { name: 'การแก้ปัญหา/ตัดสินใจ', weight: 3 }, { name: 'การสื่อสาร', weight: 2 },
    ],
    behavior: B,
  },
  {
    position: 'วิศวกรโครงการ / ผู้ควบคุมงาน',
    kpi: [
      { name: 'ความคืบหน้างานตามแผน (Actual vs Plan)', weight: 15, target: 100 },
      { name: 'ควบคุมงบประมาณโครงการไม่เกินแผน', weight: 15, target: 95 },
      { name: 'คุณภาพงานผ่าน QC ครั้งแรก', weight: 12, target: 95 },
      { name: 'ปิด NCR / แก้ไขงานทันกำหนด', weight: 10, target: 95 },
      { name: 'ความปลอดภัย (ไม่มีอุบัติเหตุหยุดงาน)', weight: 10, target: 100 },
      { name: 'จัดทำรายงาน/เอกสารควบคุมงานครบตรงเวลา', weight: 8, target: 95 },
    ],
    competency: [
      { name: 'ความรู้ทางวิศวกรรม', weight: 5 }, { name: 'การบริหารงานก่อสร้าง', weight: 5 },
      { name: 'การแก้ปัญหาหน้างาน', weight: 5 }, { name: 'ภาวะผู้นำ/คุมทีม', weight: 3 }, { name: 'การสื่อสาร', weight: 2 },
    ],
    behavior: B,
  },
  {
    position: 'โฟร์แมน (หัวหน้าหน่วยงาน)',
    kpi: [
      { name: 'งานเสร็จตามแผนรายวัน/สัปดาห์', weight: 15, target: 95 },
      { name: 'คุณภาพงานผ่านการตรวจ (QC/วิศวกร)', weight: 15, target: 95 },
      { name: 'ควบคุมการใช้วัสดุไม่เกิน BOQ (ลดของเสีย)', weight: 12, target: 95 },
      { name: 'ความปลอดภัยหน้างาน (ไม่มีอุบัติเหตุ)', weight: 10, target: 100 },
      { name: 'ควบคุมแรงงาน/ผู้รับเหมาช่วงตามแผน', weight: 10, target: 95 },
      { name: 'ความสะอาดเรียบร้อยหน้างาน (5ส)', weight: 8, target: 90 },
    ],
    competency: [
      { name: 'ความชำนาญงานก่อสร้าง', weight: 5 }, { name: 'การควบคุมทีมช่าง', weight: 5 },
      { name: 'การแก้ปัญหาหน้างาน', weight: 5 }, { name: 'การสื่อสาร', weight: 3 }, { name: 'ความรับผิดชอบ', weight: 2 },
    ],
    behavior: B,
  },
  {
    position: 'สถาปนิก',
    kpi: [
      { name: 'ส่งมอบแบบตรงเวลา', weight: 15, target: 95 },
      { name: 'ความถูกต้องของแบบ (ไม่ต้องแก้)', weight: 15, target: 98 },
      { name: 'Productivity งานออกแบบ (ทำได้/แผน)', weight: 12, target: 100 },
      { name: 'คุณภาพงานออกแบบ / 3D ผ่านมาตรฐาน', weight: 10, target: 95 },
      { name: 'สนับสนุนงานขาย / Present สำเร็จ', weight: 10, target: 95 },
      { name: 'ความพึงพอใจลูกค้า', weight: 8, target: 90 },
    ],
    competency: [
      { name: 'ความคิดสร้างสรรค์ในการออกแบบ', weight: 5 }, { name: 'ความละเอียดรอบคอบ', weight: 5 },
      { name: 'การแก้ปัญหา', weight: 5 }, { name: 'การสื่อสารและ Present', weight: 3 }, { name: 'การทำงานร่วมทีม', weight: 2 },
    ],
    behavior: B,
  },
  {
    position: 'ดราฟแมน (เขียนแบบ)',
    kpi: [
      { name: 'ส่ง Shop Drawing ตรงเวลา', weight: 15, target: 95 },
      { name: 'ความถูกต้องของแบบ (แก้ไขน้อย)', weight: 15, target: 95 },
      { name: 'Productivity (จำนวนแผ่นแบบต่อแผน)', weight: 12, target: 100 },
      { name: 'ความครบถ้วนของรายละเอียดในแบบ', weight: 10, target: 95 },
      { name: 'แก้ไขแบบตาม RFI/คอมเมนต์ทันเวลา', weight: 10, target: 95 },
      { name: 'จัดเก็บ/ควบคุมเวอร์ชันแบบครบถ้วน', weight: 8, target: 100 },
    ],
    competency: [
      { name: 'ความชำนาญโปรแกรมเขียนแบบ', weight: 5 }, { name: 'ความละเอียดรอบคอบ', weight: 5 },
      { name: 'ความรู้ด้านงานก่อสร้าง', weight: 4 }, { name: 'การสื่อสาร', weight: 3 }, { name: 'การทำงานร่วมทีม', weight: 3 },
    ],
    behavior: B,
  },
  {
    position: 'จัดซื้อ',
    kpi: [
      { name: 'ลดต้นทุนจัดซื้อวัสดุ ≥30% (เทียบราคากลาง/เดิม)', weight: 20, target: 30 },
      { name: 'เปิด/ดำเนินการ PO ภายใน SLA', weight: 12, target: 95 },
      { name: 'เทียบราคา ≥3 เจ้าก่อนสั่งซื้อ', weight: 12, target: 95 },
      { name: 'ความถูกต้องของ PO (ตรงสเปค/จำนวน)', weight: 10, target: 98 },
      { name: 'ผู้ขายส่งของตรงกำหนด (On-time)', weight: 10, target: 95 },
      { name: 'ไม่มีของขาด/หยุดงานเพราะจัดซื้อ', weight: 6, target: 98 },
    ],
    competency: [
      { name: 'ทักษะการเจรจาต่อรอง', weight: 6 }, { name: 'ความรู้ตลาดวัสดุ/ราคา', weight: 5 },
      { name: 'ความละเอียดรอบคอบ', weight: 4 }, { name: 'การประสานงาน', weight: 3 }, { name: 'ความซื่อสัตย์/โปร่งใส', weight: 2 },
    ],
    behavior: B,
  },
  {
    position: 'จัดจ้าง (จัดซื้อจัดจ้างผู้รับเหมา)',
    kpi: [
      { name: 'ลดต้นทุนจัดจ้าง ≥30% (เทียบราคากลาง/เดิม)', weight: 20, target: 30 },
      { name: 'เปรียบเทียบราคาผู้รับเหมา ≥3 ราย', weight: 12, target: 95 },
      { name: 'จัดทำ/ส่งสัญญาจ้างภายใน SLA', weight: 12, target: 95 },
      { name: 'คุณภาพผู้รับเหมาที่จ้าง (คะแนนประเมิน)', weight: 10, target: 90 },
      { name: 'ผู้รับเหมาส่งงานตรงเวลา', weight: 10, target: 95 },
      { name: 'ความถูกต้องของเอกสารจ้าง', weight: 6, target: 98 },
    ],
    competency: [
      { name: 'ทักษะการเจรจาต่อรอง', weight: 6 }, { name: 'การประเมิน/คัดเลือกผู้รับเหมา', weight: 5 },
      { name: 'ความละเอียดรอบคอบ', weight: 4 }, { name: 'การประสานงาน', weight: 3 }, { name: 'ความซื่อสัตย์/โปร่งใส', weight: 2 },
    ],
    behavior: B,
  },
  {
    position: 'เจ้าหน้าที่ประสานงานเอกสารและจัดซื้อจัดจ้าง',
    kpi: [
      { name: 'จัดทำร่างสัญญาภายใน SLA', weight: 15, target: 95 },
      { name: 'เปิด PR ภายใน SLA', weight: 15, target: 95 },
      { name: 'ความถูกต้องของข้อมูลเอกสาร', weight: 15, target: 98 },
      { name: 'ขอใบเสนอราคาและอัปเดตสถานะ', weight: 10, target: 95 },
      { name: 'บันทึกและจัดเก็บเอกสารครบ', weight: 10, target: 100 },
      { name: 'การติดตามงานและประสานงาน', weight: 5, target: 95 },
    ],
    competency: [
      { name: 'ความรู้เรื่องการจัดซื้อจัดจ้าง', weight: 5 }, { name: 'การจัดการเอกสารและระบบงาน', weight: 5 },
      { name: 'การสื่อสารและประสานงาน', weight: 4 }, { name: 'การวิเคราะห์และแก้ปัญหา', weight: 3 }, { name: 'การบริหารเวลาและลำดับงาน', weight: 3 },
    ],
    behavior: B,
  },
  {
    position: 'เจ้าหน้าที่บัญชี',
    kpi: [
      { name: 'ความถูกต้องของข้อมูลบัญชี', weight: 20, target: 98 },
      { name: 'ความครบถ้วนของเอกสารบัญชี', weight: 15, target: 95 },
      { name: 'การบันทึกบัญชีทันเวลา', weight: 10, target: 95 },
      { name: 'การยื่นภาษีถูกต้องและทันเวลา', weight: 10, target: 100 },
      { name: 'การเตรียมข้อมูลปิดงบ', weight: 10, target: 95 },
      { name: 'การควบคุมค่าใช้จ่าย / วิเคราะห์ต้นทุน', weight: 5, target: 95 },
    ],
    competency: [
      { name: 'ความรู้ด้านบัญชีและภาษี', weight: 5 }, { name: 'ความละเอียดรอบคอบ', weight: 5 },
      { name: 'การวิเคราะห์ข้อมูล', weight: 4 }, { name: 'การจัดการเอกสาร', weight: 3 }, { name: 'การสื่อสารและประสานงาน', weight: 3 },
    ],
    behavior: B,
  },
  {
    position: 'เจ้าหน้าที่การเงิน',
    kpi: [
      { name: 'จัดทำแผน/ประมาณการกระแสเงินสดตรงเวลา', weight: 15, target: 95 },
      { name: 'ความถูกต้องของข้อมูลการเงิน', weight: 15, target: 98 },
      { name: 'ควบคุมลูกหนี้/เก็บเงินงวดตามกำหนด', weight: 15, target: 95 },
      { name: 'จ่ายเจ้าหนี้/ผู้รับเหมาตรงกำหนด', weight: 10, target: 95 },
      { name: 'บริหารสภาพคล่อง (เงินสดไม่ติดลบ)', weight: 10, target: 100 },
      { name: 'รายงานการเงินผู้บริหารตรงเวลา', weight: 5, target: 95 },
    ],
    competency: [
      { name: 'ความรู้ด้านการเงิน', weight: 5 }, { name: 'การวิเคราะห์ข้อมูล', weight: 5 },
      { name: 'ความละเอียดรอบคอบ', weight: 4 }, { name: 'การประสานงาน', weight: 3 }, { name: 'ความซื่อสัตย์', weight: 3 },
    ],
    behavior: B,
  },
  {
    position: 'การตลาด / งานขาย',
    kpi: [
      { name: 'ยอดขาย/เซ็นสัญญาตามเป้า', weight: 20, target: 100 },
      { name: 'จำนวนลูกค้าใหม่/Lead ตามเป้า', weight: 12, target: 100 },
      { name: 'อัตราปิดการขายตามเป้า', weight: 12, target: 100 },
      { name: 'ความพึงพอใจลูกค้า', weight: 10, target: 90 },
      { name: 'ติดตามลูกค้า/อัปเดต CRM ครบ', weight: 8, target: 95 },
      { name: 'กิจกรรมการตลาด/นำเสนอตามแผน', weight: 8, target: 95 },
    ],
    competency: [
      { name: 'ทักษะการขาย/นำเสนอ', weight: 6 }, { name: 'ความรู้ผลิตภัณฑ์', weight: 5 },
      { name: 'การเจรจาต่อรอง', weight: 4 }, { name: 'การสื่อสาร', weight: 3 }, { name: 'การประสานงาน', weight: 2 },
    ],
    behavior: B,
  },
  {
    position: 'เลขานุการ',
    kpi: [
      { name: 'ความถูกต้องงานเอกสาร', weight: 15, target: 98 },
      { name: 'ติดตามงาน/นัดหมายไม่ตกหล่น', weight: 15, target: 95 },
      { name: 'Responsiveness (ตอบกลับทันเวลา)', weight: 12, target: 95 },
      { name: 'จัดเก็บเอกสารครบถ้วน ค้นหาได้', weight: 10, target: 98 },
      { name: 'ประสานงานภายใน-ภายนอกสำเร็จ', weight: 10, target: 95 },
      { name: 'สนับสนุนผู้บริหารตามที่มอบหมาย', weight: 8, target: 95 },
    ],
    competency: [
      { name: 'การจัดการเอกสาร', weight: 5 }, { name: 'การบริหารเวลา', weight: 5 },
      { name: 'การสื่อสาร', weight: 4 }, { name: 'ความละเอียดรอบคอบ', weight: 3 }, { name: 'การทำงานร่วมทีม', weight: 3 },
    ],
    behavior: B,
  },
  {
    position: 'ฝ่ายบุคคล (HR)',
    kpi: [
      { name: 'สรรหาพนักงานได้ตามแผน/ทันเวลา', weight: 15, target: 95 },
      { name: 'จัดทำเงินเดือน/สวัสดิการถูกต้องตรงเวลา', weight: 15, target: 98 },
      { name: 'รักษาพนักงาน (Turnover ไม่เกินเป้า)', weight: 12, target: 100 },
      { name: 'อบรม/พัฒนาพนักงานตามแผน', weight: 10, target: 95 },
      { name: 'ความถูกต้องเอกสาร HR/ประกันสังคม/ภาษี', weight: 10, target: 98 },
      { name: 'ความพึงพอใจพนักงานต่องาน HR', weight: 8, target: 85 },
    ],
    competency: [
      { name: 'ความรู้กฎหมายแรงงาน', weight: 5 }, { name: 'การสรรหา/สัมภาษณ์', weight: 5 },
      { name: 'การสื่อสาร', weight: 4 }, { name: 'ความละเอียดรอบคอบ', weight: 3 }, { name: 'การประสานงาน', weight: 3 },
    ],
    behavior: B,
  },
  {
    position: 'เจ้าหน้าที่ควบคุมคุณภาพ (QC)',
    kpi: [
      { name: 'ตรวจงานครบตามแผน/ทันเวลา', weight: 15, target: 95 },
      { name: 'ตรวจพบข้อบกพร่องก่อนส่งมอบ (ไม่หลุด)', weight: 15, target: 95 },
      { name: 'ปิด NCR/ติดตามแก้ไขทันกำหนด', weight: 12, target: 95 },
      { name: 'ความถูกต้องของรายงานผลตรวจ', weight: 10, target: 98 },
      { name: 'งานผ่านการตรวจของผู้ว่าจ้างครั้งแรก', weight: 10, target: 90 },
      { name: 'จัดเก็บเอกสาร QC ครบถ้วน', weight: 8, target: 95 },
    ],
    competency: [
      { name: 'ความรู้มาตรฐานงานก่อสร้าง', weight: 5 }, { name: 'ความละเอียดรอบคอบ', weight: 5 },
      { name: 'การจัดทำรายงาน', weight: 4 }, { name: 'การสื่อสาร', weight: 3 }, { name: 'ความเที่ยงตรง', weight: 3 },
    ],
    behavior: B,
  },
  {
    position: 'เจ้าหน้าที่ความปลอดภัย (จป.)',
    kpi: [
      { name: 'ไม่มีอุบัติเหตุถึงขั้นหยุดงาน', weight: 20, target: 100 },
      { name: 'อบรมความปลอดภัย/Toolbox ตามแผน', weight: 12, target: 95 },
      { name: 'ตรวจความปลอดภัยหน้างาน/แก้ไขจุดเสี่ยง', weight: 12, target: 95 },
      { name: 'พนักงานสวม PPE ครบ', weight: 10, target: 95 },
      { name: 'จัดทำ JHA/เอกสารความปลอดภัยครบ', weight: 10, target: 95 },
      { name: 'รายงาน Near Miss และปิดประเด็น', weight: 6, target: 90 },
    ],
    competency: [
      { name: 'ความรู้ด้านความปลอดภัย', weight: 6 }, { name: 'การตรวจ/ประเมินความเสี่ยง', weight: 5 },
      { name: 'การสื่อสาร/อบรม', weight: 4 }, { name: 'ความเด็ดขาด', weight: 3 }, { name: 'การประสานงาน', weight: 2 },
    ],
    behavior: B,
  },
]

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
