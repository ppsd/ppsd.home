// งานถอดแบบในเบราว์เซอร์ (แทน takeoffCore / web-prices ใน server/index.js) — ผลรูปแบบเดียวกับ ERP ทุกช่อง
//  DWG → DXF + อ่าน DXF ทำใน Web Worker (dwg-worker.ts) · จับคู่ราคากลางใช้สูตรกลาง server/takeoff-core.js
//  AI: ส่งผ่าน /api/takeoff/ai (Cloudflare ถือกุญแจ AI) แบบสตรีม — แบบหลายหน้าอ่านได้นานถึง 10 นาที
import * as core from '../../server/takeoff-core.js'
import { api, ApiError, BASE, authHeader } from './api'
import { config } from './session'

const MAX_AI_BYTES = 24 * 1024 * 1024 // เท่ากับ TAKEOFF_MAX_BYTES ใน ERP
const AI_NO_KEY = 'ยังไม่ได้ตั้งค่ากุญแจ AI'

// ---------- งาน (หน้าจอถามผลทุก 3 วินาทีเหมือน ERP) ----------
type Job = { started: number; status: 'running' | 'done' | 'failed'; code?: number; result?: unknown; error?: string }
const jobs = new Map<string, Job>()
class Fail extends Error { code: number; constructor(code: number, msg: string) { super(msg); this.code = code } }

export function start(file: File, opt: { units: string; house: string; fresh: boolean }) {
  const id = Math.random().toString(16).slice(2) + Date.now().toString(16)
  const j: Job = { started: Date.now(), status: 'running' }
  jobs.set(id, j)
  run(file, opt).then((r) => { j.status = 'done'; j.result = r }).catch((e) => { j.status = 'failed'; j.code = e instanceof Fail ? e.code : e instanceof ApiError ? e.status : 500; j.error = e instanceof Fail || e instanceof ApiError ? e.message : 'ถอดแบบไม่สำเร็จ: ' + (e as Error).message })
  return { job: id }
}
export function job(id: string) {
  const j = jobs.get(id)
  if (!j) throw new ApiError(404, 'ไม่พบงานถอดแบบนี้ — กดถอดแบบใหม่')
  if (j.status === 'running') return { status: 'running', seconds: Math.round((Date.now() - j.started) / 1000), attempts: 1 }
  if (j.status === 'failed') throw new ApiError(j.code || 500, j.error || 'ถอดแบบไม่สำเร็จ')
  return { status: 'done', result: j.result }
}

// ---------- ชนิดไฟล์ (เหมือน takeoffKind ใน ERP) ----------
function kindOf(name: string, mime: string, buf: Uint8Array) {
  const n = name.toLowerCase()
  const head = String.fromCharCode(...buf.subarray(0, 32))
  if (n.endsWith('.dwg') || head.startsWith('AC10')) return 'dwg'
  if (n.endsWith('.dxf')) return head.startsWith('AutoCAD Binary DXF') ? 'dxfbin' : 'dxf'
  if (mime.includes('pdf') || n.endsWith('.pdf')) return 'pdf'
  if (/^image\/(png|jpeg|webp|gif)$/.test(mime) || /\.(png|jpe?g|webp|gif)$/.test(n)) return 'image'
  return ''
}
const imageMime = (name: string, mime: string) => /^image\//.test(mime) ? mime : /\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : /\.gif$/i.test(name) ? 'image/gif' : 'image/jpeg'
const sha256 = async (data: BufferSource | string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? new TextEncoder().encode(data) : data))].map((b) => b.toString(16).padStart(2, '0')).join('')
const base64Of = (file: Blob) => new Promise<string>((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, '')); r.onerror = () => fail(r.error); r.readAsDataURL(file) })

// DWG/DXF → สรุปปริมาณ (ทำใน Worker ไม่ให้หน้าจอค้าง)
function cadSummary(buf: ArrayBuffer, kind: string, units: string) {
  return new Promise<ReturnType<typeof core.summarizeDxf>>((ok, fail) => {
    const w = new Worker(new URL('./dwg-worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e) => { w.terminate(); e.data.ok ? ok(e.data.summary) : fail(new Fail(400, e.data.error)) }
    w.onerror = (e) => { w.terminate(); fail(new Fail(400, 'อ่านไฟล์แบบไม่สำเร็จ (' + (e.message || 'หน่วยความจำไม่พอ') + ') — ลอง Save As เป็น DXF หรือแยกเป็นทีละแผ่น')) }
    w.postMessage({ buf, kind, units }, [buf])
  })
}

// ---------- AI ----------
type Usage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; server_tool_use?: { web_search_requests?: number } }
function costUsd(model: string, u: Usage) {
  const prices = config().prices || {}
  const key = prices[model] ? model : Object.keys(prices).find((k) => model.startsWith(k)) || ''
  const [pi, po] = prices[key] || [5, 25]
  const t = (n?: number) => Number(n) || 0
  const c = (t(u.input_tokens) * pi + t(u.cache_read_input_tokens) * pi * 0.1 + t(u.cache_creation_input_tokens) * pi * 1.25 + t(u.output_tokens) * po) / 1e6 + t(u.server_tool_use?.web_search_requests) * 0.01
  return Math.round(c * 10000) / 10000
}
export async function aiAsk(o: { prompt: string; media?: string; maxTokens?: number; model?: string; tools?: unknown[]; effort?: string; feature: string; timeoutMs?: number }) {
  const meta = { prompt: o.prompt, max_tokens: o.maxTokens || 16000, model: o.model || '', tools: o.tools || [], effort: o.effort || 'low' }
  let res: Response
  try {
    res = await fetch(BASE + '/ai', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...authHeader() }, body: new Blob([JSON.stringify(meta) + '\n', o.media || '']), signal: AbortSignal.timeout(o.timeoutMs || 600000) })
  } catch (e) { return { ok: false as const, code: 502, error: (e as Error).name === 'TimeoutError' ? `AI ตอบไม่ทันใน ${Math.round((o.timeoutMs || 600000) / 60000)} นาที — แบบอาจยาวเกินไป ลองแยกเป็นทีละแผ่น` : 'ต่อ AI ไม่ได้: ' + (e as Error).message } }
  const model = res.headers.get('X-Model') || meta.model
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    return { ok: false as const, code: res.status === 409 || res.status === 401 ? res.status : 502, error: j.error && typeof j.error === 'string' ? j.error : 'AI: ' + (j.error?.message || 'HTTP ' + res.status) }
  }
  // อ่านสตรีม (SSE): ข้อความ + จำนวน token
  let text = '', stop = '', usage: Usage = {}, streamErr = '', refusal = ''
  const reader = res.body!.getReader(), dec = new TextDecoder()
  let buf = ''
  const onEvent = (raw: string) => {
    const line = raw.split('\n').find((l) => l.startsWith('data:'))
    if (!line) return
    let ev: { type: string; message?: { usage?: Usage }; delta?: { type?: string; text?: string; stop_reason?: string; stop_details?: { category?: string } }; usage?: Usage; error?: { message?: string } }
    try { ev = JSON.parse(line.slice(5)) } catch { return }
    if (ev.type === 'message_start') usage = { ...ev.message?.usage }
    else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') text += ev.delta.text || ''
    else if (ev.type === 'message_delta') { usage = { ...usage, ...ev.usage }; stop = ev.delta?.stop_reason || stop; if (stop === 'refusal') refusal = ev.delta?.stop_details?.category || 'refusal' }
    else if (ev.type === 'error') streamErr = ev.error?.message || 'AI ขัดข้อง'
  }
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let k
      while ((k = buf.indexOf('\n\n')) >= 0) { onEvent(buf.slice(0, k)); buf = buf.slice(k + 2) }
    }
    if (buf.trim()) onEvent(buf)
  } catch (e) { streamErr = streamErr || 'การเชื่อมต่อกับ AI หลุดกลางคัน (' + (e as Error).message + ') — ลองใหม่อีกครั้ง' }
  const ok = !streamErr && !refusal
  if (usage.input_tokens || usage.output_tokens) api.post('/usage', { feature: o.feature, model, ok, usage }).catch(() => {})
  const cost = costUsd(model, usage)
  if (streamErr) return { ok: false as const, code: 502, error: 'AI: ' + streamErr }
  if (refusal) return { ok: false as const, code: 502, error: 'AI ปฏิเสธคำขอนี้ (' + refusal + ')' }
  if (!text && stop === 'max_tokens') return { ok: false as const, code: 502, error: 'AI ใช้ token หมดก่อนตอบ (เอกสารยาวเกินไป) — ลองแยกเป็นทีละแผ่น' }
  return { ok: true as const, text, model, cost_usd: cost }
}
function extractJsonBlock(text: string) {
  const m = text && text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

// ---------- ถอดแบบ (เหมือน takeoffCore ใน ERP) ----------
type Rate = { id: number; name: string; variant: string; price_min: number; price_max: number; unit: string }
async function run(file: File, opt: { units: string; house: string; fresh: boolean }) {
  let house: Record<string, unknown> = {}
  try { house = JSON.parse(opt.house || '{}') || {} } catch { house = {} }
  const ab = await file.arrayBuffer()
  const bytes = new Uint8Array(ab)
  const kind = kindOf(file.name, file.type || '', bytes)
  if (!kind) throw new Fail(400, `“${file.name || 'ไฟล์นี้'}” ไม่ใช่ไฟล์ที่ถอดแบบได้ — รองรับ DWG, DXF, PDF หรือรูปภาพ (JPG/PNG)`)
  const isDxf = kind === 'dwg' || kind.startsWith('dxf')
  if (!isDxf && file.size > MAX_AI_BYTES) throw new Fail(400, `ไฟล์ใหญ่เกินไป (${(file.size / 1048576).toFixed(1)} MB · ส่งให้ AI ได้ไม่เกิน ${MAX_AI_BYTES / 1048576} MB ต่อครั้ง) — แยกเป็นทีละชุด`)
  if (kind === 'dxfbin') throw new Fail(400, 'ไฟล์นี้เป็น DXF แบบ binary — เปิดในโปรแกรม CAD แล้ว Save As เป็น DXF (ASCII) หรือส่งไฟล์ DWG แทน')
  const label = file.name
  const fileSha = await sha256(ab)
  const rates = await api.get<Rate[]>('/labor-rates')
  let dxf: ReturnType<typeof core.summarizeDxf> | null = null
  if (isDxf) dxf = await cadSummary(ab.slice(0), kind, opt.units)

  let parsed: unknown = null, usedAi = false, model = '', cached: { at: string; cost_usd: number } | null = null, costUsdNow = 0
  const notes: string[] = []
  const cacheKey = await sha256(JSON.stringify({ files: [fileSha], house: house || {}, units: opt.units || 'auto' }))
  const hit = !opt.fresh ? await api.get<{ parsed: unknown; model: string; created: string; cost_usd: number } | null>('/cache/' + cacheKey).catch(() => null) : null
  if (hit && hit.parsed) {
    parsed = hit.parsed; usedAi = true; model = hit.model
    cached = { at: hit.created, cost_usd: hit.cost_usd }
    notes.push(`ใช้ผลถอดแบบเดิมของไฟล์นี้ (${hit.created}) — ไม่ได้เรียก AI ซ้ำ · ถ้าต้องการให้ AI อ่านใหม่ กด “ให้ AI อ่านใหม่”`)
  } else {
    const prompt = core.takeoffPrompt({ house, rates, dxfSummary: dxf, files: isDxf ? [] : [file.name] })
    const media = isDxf ? '' : JSON.stringify(kind === 'pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: '@@' } }
      : { type: 'image', source: { type: 'base64', media_type: imageMime(file.name, file.type || ''), data: '@@' } }).replace('"@@"', '"' + await base64Of(file) + '"')
    const ai = await aiAsk({ feature: 'ถอดแบบ', media, prompt, maxTokens: 48000, timeoutMs: 600000 })
    if (!ai.ok) {
      if (!isDxf) throw new Fail(ai.code || 502, ai.error)
      notes.push(ai.error.startsWith(AI_NO_KEY) ? 'ยังไม่ได้ตั้งค่า AI — แสดงรายการดิบตาม Block/Layer ให้ตั้งชื่อเอง' : 'AI ตั้งชื่อรายการไม่สำเร็จ (' + ai.error + ') — แสดงรายการดิบตาม Block/Layer แทน')
    } else {
      parsed = extractJsonBlock(ai.text); usedAi = !!parsed; model = ai.model; costUsdNow = ai.cost_usd || 0
      if (parsed) await api.put('/cache/' + cacheKey, { label, model, parsed, cost_usd: costUsdNow }).catch(() => {})
    }
  }
  const p = parsed as { notes?: unknown[]; drawing?: string } | null
  const flat = p ? core.flattenSections(p) : { items: [], labor: [], work: [] }
  const items = p ? core.cleanItems(flat.items) : dxf ? core.rawItemsFromDxf(dxf) : []
  if (p && Array.isArray(p.notes)) notes.push(...p.notes.map(String))
  const materials = (await api.get<{ id: number; name: string; unit: string; central: number; confidence: string; active: number }[]>('/material-prices')).map((m) => ({ id: m.id, name: m.name, unit: m.unit, central: m.central, confidence: m.confidence }))
  const aliases = (await api.get<{ mp_id: number; alias: string; nkey: string; unit: string }[]>('/material-aliases')).map((a) => ({ ...a, nkey: a.nkey || core.normName(a.alias) }))
  const out = items.map((it: { desc: string; unit: string }) => { const m = core.matchMaterial(it, materials, aliases); return { ...it, mat_match: m.match, mat_alts: m.alts } })
  const labor = p ? core.cleanLabor(flat.labor, rates) : []
  api.post('/audit', { action: 'ถอดแบบเป็น BOQ ร่าง', detail: `${label || '-'} · วัสดุ ${out.length} · ค่าแรง ${labor.length}${usedAi ? ' (AI)' : ''}` }).catch(() => {})
  return { source: isDxf ? 'dxf' : kind, files: [file.name], ai: usedAi, model, drawing: String(p?.drawing || ''), items: out, labor, work: flat.work, notes, dxf, cached, cost_usd: costUsdNow }
}

// ---------- ราคาจากอินเทอร์เน็ต (เหมือน /boq-takeoff/web-prices ใน ERP) ----------
export async function webPrices(input: { desc: string; unit: string }[]) {
  const list = (Array.isArray(input) ? input : []).map((it) => ({ desc: String(it.desc || '').trim().slice(0, 200), unit: String(it.unit || '').trim().slice(0, 30) })).filter((it) => it.desc).slice(0, 60)
  if (!list.length) throw new ApiError(400, 'ไม่มีรายการที่ต้องหาราคา')
  const num = (v: unknown) => Number(String(v ?? '').replace(/,/g, '')) || 0
  const batches: typeof list[] = []
  for (let i = 0; i < list.length; i += 8) batches.push(list.slice(i, i + 8))
  const shops = config().shops || 'Lazada, Shopee, HomePro, ไทวัสดุ (Thai Watsadu), Global House, DoHome, บุญถาวร'
  const ask = async (batch: typeof list) => {
    const want = batch.map((it, i) => `${i + 1}. ${it.desc} — ราคาต่อ "${it.unit || 'หน่วย'}"`).join('\n')
    const prompt = `คุณเป็นผู้ประมาณราคาของบริษัทรับสร้างบ้านในไทย ใช้เครื่องมือค้นเว็บหา "ราคาตลาดปัจจุบัน" ของวัสดุต่อไปนี้จากร้านวัสดุก่อสร้างในไทย (${shops}) เพื่อใช้เป็นราคากลางชั่วคราวในการทำ BOQ
รายการ:
${want}

ต่อรายการ ให้ดูราคาจากหลายร้าน (2–3 ร้านถ้าหาได้) แล้วสรุปเป็นราคากลางต่อ "หน่วยที่ขอ" (ถ้าร้านขายคนละหน่วย ให้แปลงเป็นหน่วยที่ขอ เช่น ราคาต่อกล่อง ÷ จำนวนชิ้น และบอกวิธีแปลงใน note) ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น:
{"items":[{"no":1,"price":0,"unit":"หน่วยที่ขอ","low":0,"high":0,"shop":"ร้านที่ใช้อ้างอิงหลัก","url":"ลิงก์หน้าสินค้าจริงจากผลค้น","sources":2,"note":"สินค้าที่เทียบ/สเปก/วิธีแปลงหน่วย"}]}
กติกา: price = ราคากลาง (ค่ากลางของราคาที่พบ) บาทต่อหน่วยที่ขอ ตัวเลขไม่มีคอมม่า · low/high = ต่ำสุด/สูงสุดที่พบ · sources = จำนวนร้านที่เห็นราคา · ถ้าหาไม่เจอหรือไม่แน่ใจสเปกให้ price=0 และบอกเหตุผลใน note · ห้ามเดาราคาโดยไม่มีผลค้นรองรับ`
    const ai = await aiAsk({ feature: 'หาราคาจากเว็บ', prompt, maxTokens: 8000, model: config().search_model || 'claude-sonnet-5', tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: Math.min(16, batch.length * 2 + 2) }] })
    if (!ai.ok) throw new ApiError(ai.code || 502, ai.error)
    return (extractJsonBlock(ai.text) || {}) as { items?: Record<string, unknown>[] }
  }
  const results = await Promise.all(batches.map(ask))
  const out: { desc: string; unit: string; price: number; low: number; high: number; shop: string; url: string; sources: number; note: string }[] = []
  batches.forEach((batch, b) => {
    const got = Array.isArray(results[b]?.items) ? results[b].items! : []
    batch.forEach((it, i) => {
      const r = got.find((x) => Number(x.no) === i + 1) || got[i] || {}
      const url = /^https?:\/\//i.test(String(r.url || '')) ? String(r.url).trim() : ''
      out.push({ desc: it.desc, unit: it.unit, price: Math.round(num(r.price) * 100) / 100, low: num(r.low), high: num(r.high), shop: String(r.shop || '').trim(), url, sources: Math.max(0, Math.round(num(r.sources))), note: String(r.note || '').trim() })
    })
  })
  api.post('/audit', { action: 'AI หาราคาวัสดุจากอินเทอร์เน็ต (ถอดแบบ)', detail: `${out.length} รายการ · ได้ราคา ${out.filter((x) => x.price > 0).length}` }).catch(() => {})
  return { items: out }
}
