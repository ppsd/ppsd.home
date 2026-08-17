import { useRef, useState } from 'react'
import { useApp } from '../store'

// Shows a user's signature thumbnail and lets you upload/replace it.
// The image is read in the browser as a base64 data URL and stored via the API.
export default function SignatureCell({ userId, signature }: { userId: number; signature?: string | null }) {
  const { setSignature } = useApp()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErr('ต้องเป็นไฟล์รูปภาพ')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setErr('ไฟล์ใหญ่เกิน 2MB')
      return
    }
    setErr('')
    setBusy(true)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await setSignature(userId, String(reader.result))
      } catch (ex) {
        setErr((ex as Error).message || 'อัปโหลดไม่สำเร็จ')
      } finally {
        setBusy(false)
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
      {signature ? (
        <img src={signature} alt="ลายเซ็น" style={{ height: 30, maxWidth: 90, objectFit: 'contain', border: '1px solid #E1E5EA', borderRadius: 6, background: '#fff', padding: 2 }} />
      ) : (
        <span style={{ fontSize: 11.5, color: '#94A0A8' }}>ยังไม่มี</span>
      )}
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="hov-f3f5f7"
        style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 500, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}
      >
        {busy ? '...' : signature ? 'เปลี่ยน' : 'อัปโหลด'}
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
      {err && <span style={{ fontSize: 11, color: '#C24036' }}>{err}</span>}
    </div>
  )
}
