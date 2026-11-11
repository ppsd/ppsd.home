// ชุดทดสอบ "ดู/คัดลอกกุญแจ AI" — แอดมินเท่านั้น ต้องใส่ PIN ซ้ำ · ใส่ผิด 5 ครั้งพัก 5 นาที (ฐานข้อมูลชั่วคราว ไม่แตะ server/data)
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 3352
const BASE = `http://localhost:${PORT}/api`
const serverDir = dirname(dirname(fileURLToPath(import.meta.url)))
let child, tmp, token
const call = async (method, path, body, tk = token) => {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: r.status, data: await r.json().catch(() => ({})) }
}
before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'ppsd-aikey-'))
  const env = { ...process.env, PORT: String(PORT), PPSD_DB: join(tmp, 'test.sqlite'), PPSD_NO_TUNNEL: '1' }
  delete env.ANTHROPIC_API_KEY
  child = spawn(process.execPath, [join(serverDir, 'index.js')], { env, stdio: 'ignore' })
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'thawat', pin: '1234' }) })
      const d = await r.json()
      if (r.status === 200 && d?.token) { token = d.token; return }
    } catch { /* ยังไม่ขึ้น */ }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error('เซิร์ฟเวอร์ทดสอบไม่ขึ้น')
})
after(() => { try { child?.kill('SIGKILL') } catch { /* */ } try { rmSync(tmp, { recursive: true, force: true }) } catch { /* */ } })

test('ไม่มีกุญแจ → 404 · ตั้งกุญแจแล้ว PIN ถูกเห็นกุญแจ · PIN ผิด 401 · ผิด 5 ครั้งพัก', async () => {
  assert.equal((await call('POST', '/ai-settings/reveal', { pin: '1234' })).status, 404)
  assert.equal((await call('POST', '/ai-settings', { api_key: 'sk-ant-test-0000' })).status, 200)
  const ok = await call('POST', '/ai-settings/reveal', { pin: '1234' })
  assert.equal(ok.status, 200); assert.equal(ok.data.key, 'sk-ant-test-0000')
  assert.equal((await call('POST', '/ai-settings/reveal', {})).status, 401)
  for (let i = 0; i < 4; i++) await call('POST', '/ai-settings/reveal', { pin: '0000' })
  assert.equal((await call('POST', '/ai-settings/reveal', { pin: '1234' })).status, 429)
  assert.equal((await call('POST', '/ai-settings/reveal', { pin: '1234' }, 'bad')).status, 401)
})
