import { useEffect, useState } from 'react'
import PrApprovalDoc from './components/procurement/PrApprovalDoc'
import PoDoc from './components/procurement/PoDoc'
import { SlipBody } from './components/shared/PrintDoc'
import type { ApiPR, ApiPO, ApiVendor, ApiPayroll } from './store'

// หน้าเอกสารเปล่า <url>/#docview/<token> — ระบบเปิดด้วย Chrome ในเครื่องเพื่อถ่ายรูปใบ (PR) ส่งเข้า LINE · โทเคนอายุสั้น ไม่ต้องล็อกอิน
export default function DocView() {
  const token = window.location.hash.replace(/^#\/?docview\/?/i, '').trim()
  const [doc, setDoc] = useState<{ kind: string; doc: ApiPR | ApiPO; vendor?: ApiVendor | null; house_name?: string; slip?: ApiPayroll; periodLabel?: string } | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    fetch('/api/doc-view/' + encodeURIComponent(token)).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'เปิดเอกสารไม่ได้'); return r.json() }).then(setDoc).catch((e) => setErr((e as Error).message))
  }, [token])
  if (err) return <div style={{ padding: 20, fontFamily: "'Kanit',sans-serif" }}>{err}</div>
  if (!doc) return <div style={{ padding: 20, fontFamily: "'Kanit',sans-serif", color: '#94A0A8' }}>กำลังโหลดเอกสาร…</div>
  // ซ่อนแถบคำแนะนำ/ปุ่มที่ไม่ควรติดไปในรูปใบ
  if (doc.kind === 'pr') return <><style>{'.no-print{display:none!important}'}</style><PrApprovalDoc pr={doc.doc as ApiPR} onClose={() => {}} standalone /></>
  if (doc.kind === 'po') return <><style>{'.no-print{display:none!important}'}</style><PoDoc po={doc.doc as ApiPO} houseName={doc.house_name} vendorInfo={doc.vendor || null} onClose={() => {}} standalone /></>
  // สลิปเงินเดือนรายคน (ส่งเข้า LINE พนักงาน) — หน้าตาเดียวกับสลิปที่พิมพ์
  if (doc.kind === 'slip' && doc.slip) return <div style={{ background: '#E9EEF2', padding: 12 }}><div id="doc-sheet" style={{ maxWidth: 780, margin: '0 auto', background: '#fff', color: '#1C2730', borderRadius: 4, padding: '26px 30px', fontFamily: "'Kanit',sans-serif" }}><SlipBody slip={{ ...doc.slip, period: doc.periodLabel }} /></div></div>
  return <div style={{ padding: 20 }}>ชนิดเอกสารไม่รองรับ</div>
}
