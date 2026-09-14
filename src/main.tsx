import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import CheckIn from './CheckIn.tsx'
import DocView from './DocView.tsx'
import Portal from './Portal.tsx'
import { AppProvider } from './store.tsx'

// standalone employee check-in app at  <url>/#checkin  (no ERP login)
const isCheckIn = window.location.hash.replace(/^#\/?/, '').toLowerCase().startsWith('checkin')
// หน้าเอกสารเปล่าสำหรับถ่ายรูปใบส่งเข้า LINE  <url>/#docview/<token>
const isDocView = window.location.hash.replace(/^#\/?/, '').toLowerCase().startsWith('docview/')
// พอร์ทัลลูกค้า (ไม่ต้องล็อกอิน) <url>/portal/<token> หรือ #portal/<token>
const isPortal = /^\/portal\//i.test(window.location.pathname) || window.location.hash.replace(/^#\/?/, '').toLowerCase().startsWith('portal/')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPortal ? (
      <Portal />
    ) : isDocView ? (
      <DocView />
    ) : isCheckIn ? (
      <CheckIn />
    ) : (
      <AppProvider>
        <App />
      </AppProvider>
    )}
  </StrictMode>,
)

// register the service worker so the app is installable on phones (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore */ })
  })
}
