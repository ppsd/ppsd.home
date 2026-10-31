// Thin fetch wrapper around the PPSD ERP REST API.
// The bearer token is kept in module scope and attached to every request.

let token: string | null = localStorage.getItem('ppsd_token')

export function setToken(t: string | null) {
  token = t
  if (t) localStorage.setItem('ppsd_token', t)
  else localStorage.removeItem('ppsd_token')
}
export function getToken() {
  return token
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// ข้อความผิดพลาดตอนอัปโหลด — ใช้ข้อความจาก server ถ้ามี ไม่งั้นบอกสาเหตุจากรหัส HTTP (เช่น ไฟล์ใหญ่เกิน / server ตอบช้าเกิน)
async function uploadError(res: Response) {
  let m = ''
  try { m = (await res.json()).error || '' } catch { /* ไม่ใช่ JSON */ }
  if (!m) m = res.status === 413 ? 'ไฟล์ใหญ่เกินกำหนด' : res.status === 502 || res.status === 504 ? 'server ตอบช้าเกินไป — ลองใหม่อีกครั้ง' : 'อัปโหลดไม่สำเร็จ'
  return new ApiError(res.status, `${m} (HTTP ${res.status})`)
}

// ชื่อไฟล์จาก Content-Disposition (รองรับ filename*=UTF-8'' ภาษาไทย และ filename="...")
function fileNameOf(res: Response, fallback: string) {
  const cd = res.headers.get('Content-Disposition') || ''
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd)
  if (star) { try { return decodeURIComponent(star[1]) } catch { /* ชื่อเพี้ยน */ } }
  return /filename="?([^";]+)"?/i.exec(cd)?.[1] || fallback
}
// บันทึก blob เป็นไฟล์ (ใช้ <a download> — คืน URL ทีหลัง ไม่งั้นบางเบราว์เซอร์ได้ไฟล์ว่าง)
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let msg = 'เกิดข้อผิดพลาด'
    try {
      msg = (await res.json()).error || msg
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b),
  put: <T>(p: string, b?: unknown) => request<T>('PUT', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
  // download a file (e-Filing) using the bearer token
  download: async (p: string) => {
    const res = await fetch('/api' + p, { headers: token ? { Authorization: 'Bearer ' + token } : {} })
    if (!res.ok) throw new ApiError(res.status, 'ดาวน์โหลดไม่สำเร็จ')
    saveBlob(await res.blob(), fileNameOf(res, 'download'))
  },
  // อัปโหลดไฟล์แบบ raw (ไม่แปลง base64) — ส่งไฟล์ตรงๆ ใน body พร้อม meta ใน query
  uploadFile: async <T>(file: File, meta: { house?: string; category?: string }) => {
    const q = new URLSearchParams({ name: file.name, mime: file.type || 'application/octet-stream', house: meta.house || '', category: meta.category || '' })
    const res = await fetch('/api/files?' + q.toString(), {
      method: 'POST',
      headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/octet-stream' },
      body: file,
    })
    if (!res.ok) throw await uploadError(res)
    return res.json() as Promise<T>
  },
  // อัปโหลดไฟล์ raw ไปยัง path ที่ระบุ (แนบ mime ใน query) แล้วคืน JSON
  uploadRaw: async <T>(path: string, file: File) => {
    const sep = path.includes('?') ? '&' : '?'
    const res = await fetch('/api' + path + sep + 'mime=' + encodeURIComponent(file.type || 'application/octet-stream'), {
      method: 'POST',
      headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/octet-stream' },
      body: file,
    })
    if (!res.ok) throw await uploadError(res)
    return res.json() as Promise<T>
  },
  // เปิดดูไฟล์ในเบราว์เซอร์ทันที (แท็บใหม่) — ไม่บังคับดาวน์โหลด
  openFile: async (p: string) => {
    const res = await fetch('/api' + p, { headers: token ? { Authorization: 'Bearer ' + token } : {} })
    if (!res.ok) throw new ApiError(res.status, 'เปิดไฟล์ไม่สำเร็จ')
    const blob = await res.blob()
    const name = fileNameOf(res, 'file')
    // เปิดในแท็บใหม่ได้เฉพาะ PDF/รูป/ข้อความ — ไฟล์อื่น (html/svg ฯลฯ) ถ้าเปิดจะรันในชื่อเว็บ ERP แล้วขโมยการล็อกอินได้ → ดาวน์โหลดแทน
    // มือถือ/เบราว์เซอร์ที่ไม่มีตัวดู PDF: เปิด blob ในแท็บใหม่แล้วได้ไฟล์ .txt ว่าง (Chrome Android) → ดาวน์โหลดพร้อมชื่อไฟล์แทน
    const isPdf = blob.type === 'application/pdf'
    const noPdfViewer = navigator.pdfViewerEnabled === false || /Android|iPhone|iPad|iPod|Line\//i.test(navigator.userAgent)
    if (/^(application\/pdf|image\/(png|jpe?g|gif|webp|bmp)|text\/plain)/.test(blob.type) && !(isPdf && noPdfViewer)) {
      const url = URL.createObjectURL(blob)
      const w = window.open(url, '_blank')
      if (!w) { URL.revokeObjectURL(url); saveBlob(blob, name); return } // ป๊อปอัปถูกบล็อก
      setTimeout(() => URL.revokeObjectURL(url), 30 * 60000) // เผื่อกดบันทึกจากตัวดู PDF ทีหลัง (ถ้าคืนเร็ว ไฟล์ที่บันทึกจะว่าง)
    } else saveBlob(blob, name)
  },
}
