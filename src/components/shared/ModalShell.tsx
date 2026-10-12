import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'

// กรอบ modal กลางของระบบ — ใช้กับ modal ใหม่ทุกตัว
//  - ปุ่ม — ย่อพับไว้เป็นแถบเล็กมุมขวาล่าง (ข้อมูลที่กรอกค้างไว้ไม่หาย) · กดแถบเพื่อเปิดกลับ
//  - กด ESC = ย่อพับ modal ที่อยู่บนสุด (ไม่ใช่ปิด — กันข้อมูลหายเพราะกดพลาด)
//  - เปลี่ยนไปหน้าอื่นขณะ modal เปิดอยู่ = ย่อพับให้อัตโนมัติ · หน้าเดิมถูกเก็บไว้เบื้องหลัง (App.tsx)
//    กดแถบ = พากลับไปหน้าเดิมแล้วเปิด modal ต่อ
//  - ปิดจริงด้วยปุ่ม ✕ / ยกเลิก / คลิกพื้นหลัง
// ตัวอย่าง:
//   <ModalShell title="เพิ่มลูกค้า" sub="..." onClose={close} footer={<>…ปุ่ม…</>}>
//     …ช่องกรอก…
//   </ModalShell>
// หมายเหตุ: กด F5 / ปิดเบราว์เซอร์ ข้อมูลที่ยังไม่บันทึกหาย · ถ้า modal อยู่ในแท็บย่อยของหน้า ให้วาง modal ไว้นอกส่วนที่สลับแท็บ

const openStack: string[] = [] // modal ที่เปิดอยู่ (ไม่ได้ย่อ) — ตัวท้ายสุด = อยู่บนสุด รับ ESC

// ---- ให้ App รู้ว่าหน้าไหนมี modal ค้างอยู่ (ต้องเก็บหน้านั้นไว้ ไม่ปิดทิ้งตอนเปลี่ยนหน้า) ----
const owners = new Map<string, string>() // modal id → หน้าเจ้าของ
let ownerSnapshot: string[] = []
const ownerSubs = new Set<() => void>()
const emitOwners = () => { ownerSnapshot = [...new Set(owners.values())]; ownerSubs.forEach((f) => f()) }
/** รายชื่อหน้าที่มี modal ค้างอยู่ (เปิดหรือย่อ) */
export const useModalOwnerPages = () =>
  useSyncExternalStore((f) => { ownerSubs.add(f); return () => { ownerSubs.delete(f) } }, () => ownerSnapshot)

/** App ให้ค่า: หน้าที่แสดงอยู่ตอนนี้ + ฟังก์ชันพากลับไปหน้าเจ้าของ */
export const ModalHostContext = createContext<{ active: string; goTo: (page: string) => void }>({ active: '', goTo: () => {} })
/** App ครอบแต่ละหน้า: บอก modal ว่าตัวเองอยู่หน้าไหน */
export const ModalOwnerContext = createContext<string | undefined>(undefined)

// ---- ส่วนที่ "ซ่อนไว้แต่ไม่ปิดทิ้ง" (หน้า / แท็บย่อย) ----
// modal ในส่วนที่ถูกซ่อน = ย่อพับให้เอง · กดแถบ = เรียก show() ไล่ขึ้นไปทุกชั้น (เปิดหน้า → เปิดแท็บ) แล้วเปิด modal
const KeepAliveContext = createContext<{ visible: boolean; show: () => void }>({ visible: true, show: () => {} })
/** ครอบหน้า/แท็บที่ต้องการให้ modal ข้างในไม่หายตอนสลับไปที่อื่น — active=false จะซ่อน (display:none) แต่ยังไม่ปิดทิ้ง */
export function KeepAlive({ active, onShow, children }: { active: boolean; onShow: () => void; children: ReactNode }) {
  const parent = useContext(KeepAliveContext)
  const value = { visible: parent.visible && active, show: () => { parent.show(); onShow() } }
  return (
    <KeepAliveContext.Provider value={value}>
      <div style={{ display: active ? 'contents' : 'none' }}>{children}</div>
    </KeepAliveContext.Provider>
  )
}

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
  headerActions?: ReactNode // ปุ่มเพิ่มเติมบนหัว (อยู่ก่อนปุ่ม — / ✕) เช่น ปุ่มขยายเต็มจอ
  fullscreen?: boolean // เต็มจอ (ไม่มีขอบมน/ระยะขอบ)
  height?: number | string // ความสูงคงที่ของกล่อง (ปกติสูงตามเนื้อหา สูงสุด 90vh)
}

export default function ModalShell({ title, sub, onClose, children, footer, width = 520, minimizable = true, closeOnBackdrop = true, bodyStyle, zIndex = 50, headerActions, fullscreen = false, height }: ModalShellProps) {
  const id = useId()
  const [min, setMin] = useState(false)
  const host = useContext(ModalHostContext)
  const owner = useContext(ModalOwnerContext)

  // ลงทะเบียนหน้าเจ้าของ — App จะเก็บหน้านี้ไว้เบื้องหลังจนกว่า modal จะปิด
  useEffect(() => {
    if (!owner) return
    owners.set(id, owner); emitOwners()
    return () => { owners.delete(id); emitOwners() }
  }, [id, owner])

  const leave = () => { if (minimizable) setMin(true); else onClose() }
  // หน้า/แท็บที่ modal อยู่ถูกซ่อน → ย่อพับให้เอง
  const keep = useContext(KeepAliveContext)
  useEffect(() => {
    if (!keep.visible && !min) leave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keep.visible])
  // modal ที่ไม่ได้อยู่ในหน้าใด (เช่นของ App เอง) → ย่อเมื่อเปลี่ยนหน้า
  const lastActive = useRef(host.active)
  useEffect(() => {
    const changed = host.active !== lastActive.current
    lastActive.current = host.active
    if (changed && !owner && !min) leave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host.active])
  const restore = () => {
    if (!keep.visible) keep.show()
    setMin(false)
  }

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
        style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,40,.42)', display: min ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', zIndex, animation: 'fadeIn .15s ease', padding: fullscreen ? 0 : 24 }}
      >
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          style={{ background: '#fff', borderRadius: fullscreen ? 0 : 15, width: fullscreen ? '100%' : width, maxWidth: '100%', height: fullscreen ? '100%' : height, maxHeight: fullscreen ? '100%' : '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 70px rgba(20,30,40,.3)', animation: 'modalIn .2s ease' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '18px 22px', borderBottom: '1px solid #EEF1F4', flexShrink: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
              {sub && <div style={{ fontSize: 12.5, color: '#94A0A8' }}>{sub}</div>}
            </div>
            <div style={{ marginLeft: 'auto' }} />
            {headerActions}
            {minimizable && (
              <button onClick={() => setMin(true)} title="ย่อพับไว้ (Esc)" className="hov-e7ebef" style={iconBtn}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5C6770" strokeWidth="2" strokeLinecap="round"><path d="M6 17h12" /></svg>
              </button>
            )}
            <button onClick={onClose} title="ปิด" className="hov-e7ebef" style={iconBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5C6770" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>

          <div style={{ padding: '20px 22px', overflow: 'auto', flex: 1, ...bodyStyle }}>{children}</div>

          {footer && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '16px 22px', borderTop: '1px solid #EEF1F4', background: '#FAFBFC', borderRadius: fullscreen ? 0 : '0 0 15px 15px', flexShrink: 0 }}>{footer}</div>
          )}
        </div>
      </div>

      {min && createPortal(
        <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 4, maxWidth: 'min(320px, 100%)', background: '#1E2E3B', color: '#fff', borderRadius: 10, padding: '6px 6px 6px 14px', boxShadow: '0 10px 30px rgba(10,18,26,.35)', animation: 'modalIn .18s ease' }}>
          <button onClick={restore} title="เปิดกลับ" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'none', color: 'inherit', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0', textAlign: 'left' }}>
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
