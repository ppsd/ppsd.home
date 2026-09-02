// สคริปต์สำเนาไฟล์สำรองไปโฟลเดอร์นอกเครื่อง — รันเป็น "process ลูก" แยกจากเซิร์ฟเวอร์หลัก
// เหตุผล: ถ้าปลายทางค้าง (network drive หลุด / ไดรฟ์เสีย) การเขียนแบบ sync จะแช่แข็งทั้งระบบ
// รันแยก + มี timeout ฝั่งแม่ → อย่างแย่สุดคือสำรองไม่สำเร็จ (มีธงเตือน) ไม่ใช่ระบบทั้งออฟฟิศค้าง
// วิธีใช้: node mirror-copy.js <ไฟล์สำรอง.sqlite> <โฟลเดอร์ไฟล์แนบ> <โฟลเดอร์ปลายทาง> <YYYY-MM-DD>
import { mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const [, , srcFile, uploadsDir, destDir, day] = process.argv
mkdirSync(destDir, { recursive: true })
writeFileSync(join(destDir, `ppsd-auto-${day}.sqlite`), readFileSync(srcFile))

// ไฟล์แนบ (เขียนครั้งเดียวไม่แก้ — ก๊อปเฉพาะที่ปลายทางยังไม่มี)
let copied = 0
const destFiles = join(destDir, 'files')
mkdirSync(destFiles, { recursive: true })
if (uploadsDir && existsSync(uploadsDir)) {
  const have = new Set(readdirSync(destFiles))
  for (const f of readdirSync(uploadsDir)) {
    if (have.has(f)) continue
    try { writeFileSync(join(destFiles, f), readFileSync(join(uploadsDir, f))); copied++ } catch { /* ข้ามไฟล์ที่อ่านไม่ได้ */ }
  }
}

// เกณฑ์เก็บเหมือนในเครื่อง: รายวัน 30 วัน + ไฟล์วันที่ 1 เก็บ 12 เดือน
const cutDaily = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
const cutMonthly = new Date(Date.now() - 366 * 86400000).toISOString().slice(0, 10)
for (const f of readdirSync(destDir).filter((f) => /^ppsd-auto-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f))) {
  const d = f.slice(10, 20)
  const keepMonthly = d.endsWith('-01') && d >= cutMonthly
  if (d < cutDaily && !keepMonthly) { try { unlinkSync(join(destDir, f)) } catch { /* ignore */ } }
}

console.log(JSON.stringify({ ok: true, files_copied: copied }))
