// ลิงก์สาธารณะอัตโนมัติ (Cloudflare quick tunnel) — ให้ LINE ยิง webhook เข้ามาถึงเครื่องออฟฟิศได้ตลอด โดยไม่ต้องเปิด tunnel.bat เอง
// - เซิร์ฟเวอร์รัน cloudflared เอง · ล้มแล้วเปิดใหม่ · เช็คสุขภาพทุก 5 นาที
// - ได้ URL ใหม่เมื่อไหร่ → เรียก onUrl(url) (index.js ใช้ตั้ง Webhook URL ใน LINE ผ่าน API ให้อัตโนมัติ)
// - ดาวน์โหลด cloudflared ให้เองถ้ายังไม่มี (Windows/Linux/macOS)
import { spawn } from 'node:child_process'
import { existsSync, createWriteStream, chmodSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const RELEASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download/'
function assetName() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
  if (process.platform === 'win32') return `cloudflared-windows-${arch}.exe`
  if (process.platform === 'darwin') return `cloudflared-darwin-${arch}.tgz` // macOS แจกเป็น tgz — ให้ผู้ใช้ติดตั้งเองผ่าน brew
  return `cloudflared-linux-${arch}`
}

export function createTunnelManager({ port, appDir, onUrl, onStatus, log = console.log }) {
  const state = { enabled: false, url: '', status: 'ปิด', msg: '', at: '', restarts: 0, binary: '' }
  let child = null, backoff = 15000, healthTimer = null, restartTimer = null, healthFails = 0, stopping = false

  const now = () => new Date().toLocaleString('th-TH', { hour12: false })
  const set = (patch) => { Object.assign(state, patch, { at: now() }); try { onStatus?.({ ...state }) } catch { /* ignore */ } }

  function localBinary() {
    const name = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
    return join(appDir, name)
  }
  async function whichSystem() {
    return new Promise((resolve) => {
      const p = spawn(process.platform === 'win32' ? 'where' : 'which', ['cloudflared'])
      let out = ''
      p.stdout.on('data', (d) => { out += d })
      p.on('error', () => resolve(''))
      p.on('close', (code) => resolve(code === 0 ? out.split(/\r?\n/)[0].trim() : ''))
    })
  }
  async function download() {
    const name = assetName()
    if (name.endsWith('.tgz')) throw new Error('macOS: ติดตั้งด้วย  brew install cloudflared  แล้วเปิดใหม่')
    const dest = localBinary()
    set({ status: 'กำลังดาวน์โหลด cloudflared…', msg: RELEASE + name })
    const r = await fetch(RELEASE + name, { redirect: 'follow', signal: AbortSignal.timeout(180000) })
    if (!r.ok || !r.body) throw new Error('ดาวน์โหลด cloudflared ไม่สำเร็จ HTTP ' + r.status)
    const tmp = dest + '.part'
    await pipeline(Readable.fromWeb(r.body), createWriteStream(tmp))
    try { unlinkSync(dest) } catch { /* ignore */ }
    const { renameSync } = await import('node:fs')
    renameSync(tmp, dest)
    if (process.platform !== 'win32') chmodSync(dest, 0o755)
    return dest
  }
  async function ensureBinary() {
    const local = localBinary()
    if (existsSync(local)) return local
    const sys = await whichSystem()
    if (sys) return sys
    return download()
  }

  function scheduleRestart(reason) {
    if (!state.enabled || stopping) return
    clearTimeout(restartTimer)
    set({ status: 'รอเปิดใหม่', msg: `${reason} — เปิดใหม่ใน ${Math.round(backoff / 1000)} วิ` })
    restartTimer = setTimeout(() => { backoff = Math.min(backoff * 2, 120000); launch().catch((e) => set({ status: 'ผิดพลาด', msg: e.message })) }, backoff)
  }

  async function launch() {
    if (child) return
    const bin = await ensureBinary()
    state.binary = bin
    set({ status: 'กำลังเปิดลิงก์…', msg: '', url: '' })
    const p = spawn(bin, ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'], { windowsHide: true })
    child = p
    let buf = '', lastErr = ''
    const onData = (d) => {
      buf += String(d)
      // เก็บบรรทัด error ล่าสุดไว้บอกสาเหตุ (เช่น เน็ตออกไม่ได้ / โดน firewall กัน)
      const errLine = String(d).split(/\r?\n/).reverse().find((l) => /\bERR\b|error|failed/i.test(l))
      if (errLine) lastErr = errLine.replace(/^\S+\s+ERR\s+/, '').slice(0, 200)
      const m = buf.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
      if (m && m[0] !== state.url) {
        backoff = 15000; healthFails = 0
        set({ url: m[0], status: 'เปิดอยู่', msg: '' })
        log(`[tunnel] ${m[0]}`)
        try { onUrl?.(m[0]) } catch { /* ignore */ }
        buf = ''
      }
      if (buf.length > 20000) buf = buf.slice(-5000)
    }
    p.stdout.on('data', onData); p.stderr.on('data', onData)
    p.on('error', (e) => { child = null; set({ status: 'ผิดพลาด', msg: e.message, url: '' }); scheduleRestart('เปิด cloudflared ไม่ได้') })
    p.on('close', (code) => { child = null; if (!stopping) { state.restarts++; set({ status: 'หลุด', url: '' }); scheduleRestart(`cloudflared ปิดตัว (code ${code})${lastErr ? ' · ' + lastErr : ''}`) } })
  }

  async function health() {
    if (!state.enabled || !state.url || !child) return
    try {
      const r = await fetch(state.url + '/api/line/webhook', { signal: AbortSignal.timeout(10000) })
      if (r.ok) { healthFails = 0; return }
      throw new Error('HTTP ' + r.status)
    } catch (e) {
      healthFails++
      if (healthFails >= 2) { set({ status: 'ลิงก์ไม่ตอบ', msg: e.message }); kill(); scheduleRestart('ลิงก์ไม่ตอบ 2 ครั้ง') }
    }
  }
  function kill() { try { child?.kill() } catch { /* ignore */ } child = null }

  return {
    state,
    async start() {
      if (process.env.PPSD_NO_TUNNEL) { set({ enabled: true, status: 'ปิดไว้ด้วยตัวแปรระบบ PPSD_NO_TUNNEL', msg: '' }); return }
      state.enabled = true; stopping = false
      clearInterval(healthTimer); healthTimer = setInterval(health, 5 * 60 * 1000)
      await launch()
    },
    stop() {
      stopping = true; state.enabled = false
      clearTimeout(restartTimer); clearInterval(healthTimer)
      kill(); set({ status: 'ปิด', url: '', msg: '' })
    },
    async restart() { stopping = true; kill(); clearTimeout(restartTimer); stopping = false; backoff = 15000; await launch() },
  }
}
