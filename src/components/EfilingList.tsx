import { useState } from 'react'
import { useApp } from '../store'
import { api } from '../api'

// Lists the e-Filing exports available to the current user and lets them
// download the upload-ready files (generated server-side).
export default function EfilingList({ filter }: { filter?: string[] }) {
  const { data } = useApp()
  const [busy, setBusy] = useState('')
  const efilings = data.efilings

  if (!efilings) {
    return (
      <div style={{ fontSize: 12.5, color: '#5C6770', background: '#F7F9FB', border: '1px solid #EEF1F4', borderRadius: 9, padding: '11px 16px' }}>
        ไฟล์ e-Filing เปิดให้เฉพาะบทบาท <b>ผู้ดูแล</b> และ <b>บัญชี</b>
      </div>
    )
  }

  const items = filter ? efilings.filter((e) => filter.includes(e.id)) : efilings

  const download = async (id: string) => {
    setBusy(id)
    try {
      await api.download(`/efiling/${id}/download`)
    } finally {
      setBusy('')
    }
  }

  return (
    <div style={{ border: '1px solid #E1E5EA', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #EEF1F4', fontSize: 13.5, fontWeight: 600 }}>
        ไฟล์ยื่นภาษี / ประกันสังคม (e-Filing)
        <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 400, color: '#94A0A8' }}>สร้างไฟล์อัปโหลด — ระบบไม่ได้ยื่นแทน</span>
      </div>
      {items.map((e) => (
        <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderTop: '1px solid #F1F4F6' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{e.label}</div>
            <div style={{ fontSize: 11.5, color: '#94A0A8' }}>{e.agency} · {e.due}</div>
          </div>
          <button
            onClick={() => download(e.id)}
            disabled={busy === e.id}
            className="hov-f3f5f7"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M5 21h14" /></svg>
            {busy === e.id ? 'กำลังสร้าง…' : 'ดาวน์โหลด'}
          </button>
        </div>
      ))}
    </div>
  )
}
