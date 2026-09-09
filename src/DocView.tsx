import { useEffect, useState } from 'react'
import PrApprovalDoc from './components/PrApprovalDoc'
import type { ApiPR } from './store'

// หน้าเอกสารเปล่า <url>/#docview/<token> — ระบบเปิดด้วย Chrome ในเครื่องเพื่อถ่ายรูปใบ (PR) ส่งเข้า LINE · โทเคนอายุสั้น ไม่ต้องล็อกอิน
export default function DocView() {
  const token = window.location.hash.replace(/^#\/?docview\/?/i, '').trim()
  const [doc, setDoc] = useState<{ kind: string; doc: ApiPR } | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    fetch('/api/doc-view/' + encodeURIComponent(token)).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'เปิดเอกสารไม่ได้'); return r.json() }).then(setDoc).catch((e) => setErr((e as Error).message))
  }, [token])
  if (err) return <div style={{ padding: 20, fontFamily: "'Kanit',sans-serif" }}>{err}</div>
  if (!doc) return <div style={{ padding: 20, fontFamily: "'Kanit',sans-serif", color: '#94A0A8' }}>กำลังโหลดเอกสาร…</div>
  // ซ่อนแถบคำแนะนำ/ปุ่มที่ไม่ควรติดไปในรูปใบ
  if (doc.kind === 'pr') return <><style>{'.no-print{display:none!important}'}</style><PrApprovalDoc pr={doc.doc} onClose={() => {}} standalone /></>
  return <div style={{ padding: 20 }}>ชนิดเอกสารไม่รองรับ</div>
}
