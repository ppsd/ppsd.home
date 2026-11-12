// Web Worker: DWG → DXF (LibreDWG WebAssembly · แทนโปรแกรม ODA ที่ ERP ใช้บนเครื่องออฟฟิศ) แล้วสรุปปริมาณด้วยสูตรกลาง
// ทำแยกจากหน้าจอ — แบบใหญ่ใช้เวลาหลายวินาทีถึงนาที หน้าจอไม่ค้าง
import { summarizeDxf } from '../../server/takeoff-core.js'

const MAX_DXF = 400 * 1048576 // เท่ากับ ERP

self.onmessage = async (e: MessageEvent<{ buf: ArrayBuffer; kind: string; units: string }>) => {
  const { buf, kind, units } = e.data
  try {
    let bytes: Uint8Array = new Uint8Array(buf)
    let fromDwg = false
    if (kind === 'dwg') {
      const { LibreDwg } = await import('@mlightcad/libredwg-web')
      const lib = await LibreDwg.create() // ไฟล์ .wasm รวมไปกับหน้าเว็บ (Vite ใส่ชื่อ hash ให้)
      const out = lib.dwg_write_dxf(buf)
      if (!out || !out.length) throw new Error('แปลงไฟล์ DWG ไม่สำเร็จ — ลอง Save As เป็น DXF จากโปรแกรม CAD')
      bytes = out; fromDwg = true
    }
    if (bytes.length > MAX_DXF) throw new Error(`แบบไฟล์นี้ใหญ่เกินไปหลังแปลงเป็น DXF (${Math.round(bytes.length / 1048576)} MB) — แยกเป็นทีละชั้น/ทีละแผ่น`)
    // DXF รุ่นใหม่เป็น UTF-8 · รุ่นเก่าภาษาไทยเป็น ANSI_874 (TIS-620) · ที่แปลงจาก DWG เป็น UTF-8 เสมอ
    let text = new TextDecoder('utf-8').decode(bytes)
    if (!fromDwg && text.includes('�')) { try { text = new TextDecoder('windows-874').decode(bytes) } catch { /* ใช้ utf8 ต่อ */ } }
    const summary = summarizeDxf(text, units || 'auto')
    ;(self as unknown as Worker).postMessage({ ok: true, summary })
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ ok: false, error: (err as Error).message || String(err) })
  }
}
