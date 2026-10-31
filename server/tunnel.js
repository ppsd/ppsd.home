// ลิงก์สาธารณะอัตโนมัติ (Cloudflare quick tunnel) — ให้ LINE ยิง webhook เข้ามาถึงเครื่องออฟฟิศได้ตลอด โดยไม่ต้องเปิด tunnel.bat เอง
// - เซิร์ฟเวอร์รัน cloudflared เอง · ล้มแล้วเปิดใหม่ · เช็คสุขภาพทุก 5 นาที
// - ได้ URL ใหม่เมื่อไหร่ → เรียก onUrl(url) (index.js ใช้ตั้ง Webhook URL ใน LINE ผ่าน API ให้อัตโนมัติ)
// - ดาวน์โหลด cloudflared ให้เองถ้ายังไม่มี (Windows/Linux/macOS)
import { spawn } from 'node:child_process'
import { existsSync, createWriteStream, chmodSync, unlinkSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs'
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

// cloudflared รันแยกจากเซิร์ฟเวอร์ (detached) → รีสตาร์ตเซิร์ฟเวอร์แล้วลิงก์เดิมยังอยู่ (รูปที่ส่งเข้า LINE ไปแล้วยังเปิดได้)
//   จำ pid+url ไว้ที่ stateFile · เปิดเซิร์ฟเวอร์ใหม่ → ลิงก์เดิมยังตอบ = ใช้ต่อ ไม่เปิดใหม่
export function createTunnelManager({ port, appDir, stateFile, onUrl, onStatus, log = console.log }) {
  const state = { enabled: false, url: '', status: 'ปิด', msg: '', at: '', restarts: 0, binary: '' }
  const procFile = stateFile || join(appDir, 'cloudflared-proc.json')
  const logFile = procFile.replace(/\.json$/, '') + '.log'
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

  const readProc = () => { try { return JSON.parse(readFileSync(procFile, 'utf8')) } catch { return null } }
  const saveProc = (o) => { try { writeFileSync(procFile, JSON.stringify(o)) } catch { /* ignore */ } }
  const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }
  // pid นี้เป็น cloudflared จริงไหม (กันฆ่าโปรแกรมอื่นที่ได้ pid ซ้ำ)
  async function isCloudflared(pid) {
    if (!pid || !alive(pid)) return false
    return new Promise((resolve) => {
      const p = process.platform === 'win32' ? spawn('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { windowsHide: true }) : spawn('ps', ['-p', String(pid), '-o', 'comm='])
      let out = ''
      p.stdout.on('data', (d) => { out += d })
      p.on('error', () => resolve(false))
      p.on('close', () => resolve(/cloudflared/i.test(out)))
    })
  }
  async function urlOk(url) {
    try { return (await fetch(url + '/api/line/webhook', { signal: AbortSignal.timeout(10000) })).ok } catch { return false }
  }
  // ลิงก์จากรอบก่อนยังใช้ได้ → รับมาใช้ต่อ
  async function adopt() {
    const o = readProc()
    if (!o?.pid || !(await isCloudflared(o.pid))) return false
    if (!o.url || !(await urlOk(o.url))) { try { process.kill(o.pid) } catch { /* ignore */ } return false } // ตัวเก่าค้างแต่ใช้ไม่ได้ → ปิดทิ้ง
    child = { pid: o.pid, adopted: true }
    backoff = 15000; healthFails = 0
    set({ url: o.url, status: 'เปิดอยู่', msg: 'ใช้ลิงก์เดิมต่อ (ไม่เปลี่ยน URL)' })
    log(`[tunnel] ใช้ลิงก์เดิม ${o.url} (pid ${o.pid})`)
    try { onUrl?.(o.url) } catch { /* ignore */ }
    return true
  }

  async function launch() {
    if (child) return
    if (await adopt()) return
    const bin = await ensureBinary()
    state.binary = bin
    set({ status: 'กำลังเปิดลิงก์…', msg: '', url: '' })
    // เขียน log ลงไฟล์ (ไม่ผูก stdout กับเซิร์ฟเวอร์) → cloudflared อยู่ต่อได้แม้เซิร์ฟเวอร์ปิด
    const fd = openSync(logFile, 'w')
    const p = spawn(bin, ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'], { windowsHide: true, detached: true, stdio: ['ignore', fd, fd] })
    closeSync(fd)
    p.unref()
    child = p
    saveProc({ pid: p.pid, url: '' })
    let lastErr = '', found = false
    const poll = setInterval(() => {
      if (child !== p) return clearInterval(poll)
      let buf = ''
      try { buf = readFileSync(logFile, 'utf8') } catch { return }
      // เก็บบรรทัด error ล่าสุดไว้บอกสาเหตุ (เช่น เน็ตออกไม่ได้ / โดน firewall กัน)
      const errLine = buf.split(/\r?\n/).reverse().find((l) => /\bERR\b|error|failed/i.test(l))
      if (errLine) lastErr = errLine.replace(/^\S+\s+ERR\s+/, '').slice(0, 200)
      const m = buf.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
      if (m && !found) {
        found = true; clearInterval(poll)
        backoff = 15000; healthFails = 0
        saveProc({ pid: p.pid, url: m[0] })
        set({ url: m[0], status: 'เปิดอยู่', msg: '' })
        log(`[tunnel] ${m[0]}`)
        try { onUrl?.(m[0]) } catch { /* ignore */ }
      }
    }, 1000)
    p.on('error', (e) => { clearInterval(poll); if (child === p) child = null; set({ status: 'ผิดพลาด', msg: e.message, url: '' }); scheduleRestart('เปิด cloudflared ไม่ได้') })
    p.on('exit', (code) => { clearInterval(poll); if (child !== p) return; child = null; if (!stopping) { state.restarts++; set({ status: 'หลุด', url: '' }); scheduleRestart(`cloudflared ปิดตัว (code ${code})${lastErr ? ' · ' + lastErr : ''}`) } })
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
  function kill() { const pid = child?.pid; child = null; if (pid) { try { process.kill(pid) } catch { /* ignore */ } } saveProc({}) }

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
