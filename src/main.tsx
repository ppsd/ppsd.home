import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import CheckIn from './CheckIn.tsx'
import { AppProvider } from './store.tsx'

// standalone employee check-in app at  <url>/#checkin  (no ERP login)
const isCheckIn = window.location.hash.replace(/^#\/?/, '').toLowerCase().startsWith('checkin')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isCheckIn ? (
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
