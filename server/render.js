// แปลงเอกสารในระบบ (หน้าเว็บ) เป็นรูป PNG ด้วย Chrome ที่ติดตั้งอยู่ในเครื่อง — ใช้ส่งใบ PR/PO เข้า LINE เป็นรูป
// ไม่ดาวน์โหลดเบราว์เซอร์เพิ่ม: ใช้ Google Chrome หรือ Microsoft Edge ที่มีอยู่แล้ว (ตั้ง PPSD_CHROME=path ได้ถ้าอยู่ที่อื่น)
import { existsSync } from 'node:fs'

let pw = null
async function playwright() {
  if (pw) return pw
  try { pw = await import('playwright-core') } catch (e) { throw new Error('ไม่พบแพ็กเกจ playwright-core — รัน npm install (update.bat) อีกครั้ง: ' + e.message) }
  return pw
}
// หาเบราว์เซอร์: PPSD_CHROME → chrome → msedge → chromium ที่ Playwright รู้จัก
async function launchBrowser() {
  const { chromium } = await playwright()
  const opts = { headless: true, args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'] }
  const custom = process.env.PPSD_CHROME
  if (custom && existsSync(custom)) return chromium.launch({ ...opts, executablePath: custom })
  const errors = []
  for (const channel of ['chrome', 'msedge', 'chromium']) {
    try { return await chromium.launch({ ...opts, channel }) } catch (e) { errors.push(`${channel}: ${String(e.message).split('\n')[0]}`) }
  }
  try { return await chromium.launch(opts) } catch (e) { errors.push('default: ' + String(e.message).split('\n')[0]) }
  throw new Error('ไม่พบ Google Chrome / Microsoft Edge ในเครื่องสำหรับสร้างรูปเอกสาร (ติดตั้ง Chrome หรือตั้ง PPSD_CHROME) · ' + errors.join(' · '))
}
// เปิด URL แล้วถ่ายรูปเฉพาะส่วน selector (รอจนโหลดเสร็จ + ฟอนต์พร้อม) → Buffer PNG
export async function renderElementPng(url, selector, { width = 900, scale = 1.5, timeoutMs = 45000 } = {}) {
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage({ viewport: { width, height: 1200 }, deviceScaleFactor: scale })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
    const el = page.locator(selector).first()
    await el.waitFor({ state: 'visible', timeout: timeoutMs })
    try { await page.evaluate(() => document.fonts && document.fonts.ready) } catch { /* ไม่มี font API */ }
    await page.waitForTimeout(300)
    return await el.screenshot({ type: 'png' })
  } finally {
    await browser.close().catch(() => {})
  }
}
