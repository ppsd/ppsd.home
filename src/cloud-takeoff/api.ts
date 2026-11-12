// แทน src/api.ts เมื่อรวมหน้าถอดแบบ/BOQ ไปไว้บน Cloudflare (ppsd-office.pages.dev/takeoff) — ดู vite.takeoff.config.ts
// หน้าจอ (src/components/cost/*) เรียก api ชื่อเดิมทุกตัว → ที่นี่ส่งไป /api/takeoff/... บน Cloudflare
// ยกเว้นงานถอดแบบ (/boq-takeoff...) ที่ทำในเบราว์เซอร์ (engine.ts) แล้วเรียก AI ผ่าน Cloudflare
import * as engine from './engine'

const TOKEN_KEY = 'ppsd_takeoff_token'
let token: string | null = (() => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } })()
export function setToken(t: string | null) {
  token = t
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY) } catch { /* โหมดส่วนตัว */ }
}
export const getToken = () => token

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
export const BASE = '/api/takeoff'
export const authHeader = (): Record<string, string> => (token ? { Authorization: 'Bearer ' + token } : {})

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // งานถอดแบบ → ทำในเบราว์เซอร์
  if (path.startsWith('/boq-takeoff/jobs/')) return engine.job(path.split('/').pop() || '') as T
  if (path === '/boq-takeoff/web-prices') return engine.webPrices((body as { items: { desc: string; unit: string }[] }).items) as Promise<T>
  if (path.startsWith('/boq-takeoff')) throw new ApiError(400, 'บนเว็บนี้ให้อัปโหลดไฟล์แบบจากเครื่อง (ยังเลือกจากเอกสารของบ้านใน ERP ไม่ได้)')
  if (path.startsWith('/files?')) return [] as T // ไฟล์ของบ้านอยู่ที่เครื่อง ERP ในออฟฟิศ
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...authHeader() }, body: body != null ? JSON.stringify(body) : undefined })
  if (!res.ok) {
    let msg = 'เกิดข้อผิดพลาด'
    try { msg = (await res.json()).error || msg } catch { /* ไม่ใช่ JSON */ }
    if (res.status === 401) window.dispatchEvent(new Event('ppsd:logout'))
    throw new ApiError(res.status, msg)
  }
  return res.json()
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b),
  put: <T>(p: string, b?: unknown) => request<T>('PUT', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
  // อัปโหลดไฟล์แบบ → เริ่มงานถอดแบบในเบราว์เซอร์ (คืนเลขงาน แล้วหน้าจอถามผลซ้ำเหมือน ERP)
  uploadRaw: async <T>(path: string, file: File): Promise<T> => {
    if (!path.startsWith('/boq-takeoff')) throw new ApiError(400, 'ใช้ไม่ได้บนเว็บนี้')
    const q = new URLSearchParams(path.split('?')[1] || '')
    return engine.start(file, { units: q.get('units') || 'auto', house: q.get('house') || '{}', fresh: q.get('fresh') === '1' }) as T
  },
}
