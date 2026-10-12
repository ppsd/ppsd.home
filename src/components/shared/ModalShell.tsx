import { useEffect, useId, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'

// กรอบ modal กลางของระบบ — ใช้กับ modal ใหม่ทุกตัว
//  - ปุ่ม — ย่อพับไว้เป็นแถบเล็กมุมขวาล่าง (ข้อมูลที่กรอกค้างไว้ไม่หาย) · กดแถบเพื่อเปิดกลับ
//  - กด ESC = ย่อพับ modal ที่อยู่บนสุด (ไม่ใช่ปิด — กันข้อมูลหายเพราะกดพลาด)
//  - ปิดจริงด้วยปุ่ม ✕ / ยกเลิก / คลิกพื้นหลัง
// ตัวอย่าง:
//   <ModalShell title="เพิ่มลูกค้า" sub="..." onClose={close} footer={<>…ปุ่ม…</>}>
//     …ช่องกรอก…
//   </ModalShell>
// หมายเหตุ: ถ้าเปลี่ยนไปหน้าอื่น หน้าที่เป็นเจ้าของ modal จะถูกปิด แถบที่ย่อไว้จะหายไปด้วย

const openStack: string[] = [] // modal ที่เปิดอยู่ (ไม่ได้ย่อ) — ตัวท้ายสุด = อยู่บนสุด รับ ESC

function dockEl() {
  let el = document.getElementById('modal-dock')
  if (!el) {
    el = document.createElement('div')
    el.id = 'modal-dock'
    Object.assign(el.style, { position: 'fixed', right: '12px', bottom: '12px', left: '12px', zIndex: '95', display: 'flex', flexWrap: 'wrap-reverse', justifyContent: 'flex-end', gap: '8px', pointerEvents: 'none' })
    document.body.appendChild(el)
  }
  return el
}

const iconBtn: CSSProperties = { width: 32, height: 32, flexShrink: 0, borderRadius: 8, border: 'none', background: '#F3F5F7', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }

interface ModalShellProps {
  title: ReactNode
  sub?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number | string // ค่าเริ่มต้น 520
  minimizable?: boolean // ค่าเริ่มต้น true · false = ESC ปิดเลย ไม่มีปุ่มย่อ
  closeOnBackdrop?: boolean // ค่าเริ่มต้น true
  bodyStyle?: CSSProperties
  zIndex?: number
}

export default function ModalShell({ title, sub, onClose, children, footer, width = 520, minimizable = true, closeOnBackdrop = true, bodyStyle, zIndex = 50 }: ModalShellProps) {
  const id = useId()
  const [min, setMin] = useState(false)

  // ลงทะเบียนเป็น modal บนสุดตอนเปิด/เปิดกลับ · ถอดออกตอนย่อ/ปิด
  useEffect(() => {
    if (min) return
    openStack.push(id)
    return () => { const i = openStack.lastIndexOf(id); if (i >= 0) openStack.splice(i, 1) }
  }, [id, min])

  useEffect(() => {
    if (min) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || openStack[openStack.length - 1] !== id) return
      e.preventDefault()
      e.stopPropagation()
      if (minimizable) setMin(true)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, min, minimizable, onClose])

  return (
    <>
      <div
        onClick={closeOnBackdrop ? onClose : undefined}
        style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.42)', display: min ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', zIndex, animation: 'fadeIn .15s ease', padding: 24 }}
      >
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          style={{ background: '#fff', borderRadius: 15, width, maxWidth: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 70px rgba(20,30,40,.3)', animation: 'modalIn .2s ease' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '18px 22px', borderBottom: '1px solid #EEF1F4', flexShrink: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
              {sub && <div style={{ fontSize: 12.5, color: '#94A0A8' }}>{sub}</div>}
            </div>
            {minimizable && (
              <button onClick={() => setMin(true)} title="ย่อพับไว้ (Esc)" className="hov-e7ebef" style={{ ...iconBtn, marginLeft: 'auto' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5C6770" strokeWidth="2" strokeLinecap="round"><path d="M6 17h12" /></svg>
              </button>
            )}
            <button onClick={onClose} title="ปิด" className="hov-e7ebef" style={{ ...iconBtn, marginLeft: minimizable ? 0 : 'auto' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5C6770" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>

          <div style={{ padding: '20px 22px', overflow: 'auto', flex: 1, ...bodyStyle }}>{children}</div>

          {footer && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '16px 22px', borderTop: '1px solid #EEF1F4', background: '#FAFBFC', borderRadius: '0 0 15px 15px', flexShrink: 0 }}>{footer}</div>
          )}
        </div>
      </div>

      {min && createPortal(
        <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 4, maxWidth: 'min(320px, 100%)', background: '#1E2E3B', color: '#fff', borderRadius: 10, padding: '6px 6px 6px 14px', boxShadow: '0 10px 30px rgba(10,18,26,.35)', animation: 'modalIn .18s ease' }}>
          <button onClick={() => setMin(false)} title="เปิดกลับ" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'none', color: 'inherit', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0', textAlign: 'left' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#AEBAC4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M18 15l-6-6-6 6" /></svg>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          </button>
          <button onClick={onClose} title="ปิด" style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 7, border: 'none', background: 'rgba(255,255,255,.08)', color: '#AEBAC4', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>,
        dockEl(),
      )}
    </>
  )
}
