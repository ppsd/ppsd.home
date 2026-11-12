// โมดูลถอดแบบ (BOQ takeoff) — อ่านไฟล์แบบ แล้วสรุปเป็นปริมาณงานให้ทำ BOQ ร่าง
//  - DXF: อ่านเองทั้งหมด (ไม่ใช้ไลบรารีนอก) → นับ Block · รวมความยาวเส้นตาม Layer · พื้นที่ Hatch/รูปปิดตาม Layer · ตัวหนังสือ
//  - PDF/รูป: ให้ AI อ่าน (เรียกจาก index.js)
//  - จับคู่รายการที่ถอดได้กับราคากลางวัสดุ/ค่าแรง (เทียบชื่อแบบหยาบ — ให้คนเลือกแก้ในหน้าจอ)

import { existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
export * from './takeoff-core.js'

// ---------- DWG → DXF (ODA File Converter) ----------
// DWG เป็นไฟล์ปิด อ่านเองไม่ได้ → ใช้ ODA File Converter (ฟรี) ที่ติดตั้งบนเครื่อง server แปลงเป็น DXF ก่อน
// หาโปรแกรมจาก PPSD_ODA หรือโฟลเดอร์ติดตั้งปกติ (C:\Program Files\ODA\ODAFileConverter x.y.z) — เลือกรุ่นใหม่สุด
export function odaPath() {
  if (process.env.PPSD_ODA && existsSync(process.env.PPSD_ODA)) return process.env.PPSD_ODA
  const base = 'C:\\Program Files\\ODA'
  try {
    const dirs = readdirSync(base).filter((n) => /^ODAFileConverter/i.test(n)).sort().reverse()
    for (const d of dirs) { const p = join(base, d, 'ODAFileConverter.exe'); if (existsSync(p)) return p }
  } catch { /* ไม่ได้ติดตั้ง */ }
  return ''
}
/** แปลง DWG (หรือ DXF แบบ binary) เป็น DXF ข้อความ — คืน Buffer ของ DXF */
export async function cadToDxf(buf, ext = 'dwg') {
  const exe = odaPath()
  if (!exe) throw new Error('เครื่อง server ยังไม่มีโปรแกรมแปลง DWG (ODA File Converter) — เปิดไฟล์ในโปรแกรม CAD แล้ว Save As เป็น DXF แทน')
  const dir = mkdtempSync(join(tmpdir(), 'ppsd-cad-'))
  const inDir = join(dir, 'in'), outDir = join(dir, 'out')
  try {
    mkdirSync(inDir); mkdirSync(outDir)
    writeFileSync(join(inDir, 'plan.' + ext), buf)
    // อาร์กิวเมนต์: โฟลเดอร์ต้นทาง ปลายทาง รุ่นไฟล์ ชนิด (DXF = ข้อความ) ไม่ทำโฟลเดอร์ย่อย ตรวจซ่อมไฟล์ ตัวกรอง
    await new Promise((ok, fail) => execFile(exe, [inDir, outDir, 'ACAD2018', 'DXF', '0', '1', '*.' + ext.toUpperCase()],
      { timeout: 180000, windowsHide: true }, (e) => e ? fail(e) : ok()))
    const out = join(outDir, 'plan.dxf')
    if (!existsSync(out)) {
      const errFile = readdirSync(outDir).find((n) => n.endsWith('.err'))
      const why = errFile ? readFileSync(join(outDir, errFile), 'utf8').split(/\r?\n/).filter(Boolean).slice(-1)[0] : ''
      throw new Error('แปลงไฟล์ DWG ไม่สำเร็จ' + (why ? ` (${why.trim()})` : '') + ' — ลอง Save As เป็น DXF จากโปรแกรม CAD')
    }
    return readFileSync(out)
  } finally {
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}
