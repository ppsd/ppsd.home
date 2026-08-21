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
    const blob = await res.blob()
    const cd = res.headers.get('Content-Disposition') || ''
    const name = /filename="?([^"]+)"?/.exec(cd)?.[1] || 'download.txt'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  },
  // อัปโหลดไฟล์แบบ raw (ไม่แปลง base64) — ส่งไฟล์ตรงๆ ใน body พร้อม meta ใน query
  uploadFile: async <T>(file: File, meta: { house?: string; category?: string }) => {
    const q = new URLSearchParams({ name: file.name, mime: file.type || 'application/octet-stream', house: meta.house || '', category: meta.category || '' })
    const res = await fetch('/api/files?' + q.toString(), {
      method: 'POST',
      headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/octet-stream' },
      body: file,
    })
    if (!res.ok) { let m = 'อัปโหลดไม่สำเร็จ'; try { m = (await res.json()).error || m } catch { /* ignore */ } throw new ApiError(res.status, m) }
    return res.json() as Promise<T>
  },
  // เปิดดูไฟล์ในเบราว์เซอร์ทันที (แท็บใหม่) — ไม่บังคับดาวน์โหลด
  openFile: async (p: string) => {
    const res = await fetch('/api' + p, { headers: token ? { Authorization: 'Bearer ' + token } : {} })
    if (!res.ok) throw new ApiError(res.status, 'เปิดไฟล์ไม่สำเร็จ')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  },
}
