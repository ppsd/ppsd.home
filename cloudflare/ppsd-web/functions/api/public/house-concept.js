import { normalizeReq, normalizeLayout, analyze, buildPrompt, parsePublicImages, seriousIssues, buildRepairPrompt, readAiStream, DESIGN_MAX_TOKENS, retryableDesignError } from '../../_lib/house-concept.js'
import { json, enabled, day, limits, count, bump } from '../../_house.js'

// ลูกค้ากรอกความต้องการ → AI จัดผังห้อง → ส่งผังกลับในคำตอบเดียว (ใช้เวลา 1–3 นาที)
// ระหว่างรอ ส่งช่องว่างทุก 10 วิ ให้การเชื่อมต่อไม่หลุด แล้วต่อท้ายด้วย JSON ผลลัพธ์ (หน้าเว็บอ่านด้วย JSON.parse ได้ตามปกติ)
// แบบที่ลูกค้ากดชอบในห้องรวมไอเดีย — อ่านจาก /ideas.json (ส่งออกจาก ERP ตอนอัปเดตเว็บ · scripts/deploy-web.mjs)
const IMG_HOST = /^https:\/\/(live\.staticflickr\.com|(upload|thumb)\.wikimedia\.org|images\.pexels\.com)\//
async function loadIdeas(env, request, ids) {
  const want = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => n > 0))].slice(0, 3)
  if (!want.length || !env.ASSETS) return []
  const list = await env.ASSETS.fetch(new URL('/ideas.json', request.url)).then((r) => (r.ok ? r.json() : [])).catch(() => [])
  return want.map((id) => list.find((x) => x.id === id)).filter(Boolean)
}
const ideaText = (rows) => rows.length ? 'แบบที่ลูกค้าชอบ (ใช้เป็นแนวทาง ไม่ต้องลอกแบบ): ' + rows.map((r) => [r.title, r.style && 'สไตล์' + r.style, r.country, r.note].filter(Boolean).join(' · ')).join(' / ') : ''
async function ideaImages(rows, max = 2) {
  const out = []
  for (const r of rows) {
    if (out.length >= max || !IMG_HOST.test(r.image_url || '')) continue
    try {
      const res = await fetch(r.image_url, { signal: AbortSignal.timeout(20000) })
      const type = (res.headers.get('content-type') || '').split(';')[0]
      if (!res.ok || !IMG_HOST.test(res.url) || !/^image\/(jpeg|png|webp|gif)$/.test(type)) continue
      const buf = new Uint8Array(await res.arrayBuffer())
      if (buf.length > 4500000) continue
      let bin = ''; for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 32768))
      out.push({ type: 'image', source: { type: 'base64', media_type: type, data: btoa(bin) } })
    } catch { /* รูปต้นทางหาย — ข้าม */ }
  }
  return out
}

async function askLayout(env, q, ideas = [], own = [], trace = {}) {
  if (env.MOCK_LAYOUT) { // ทดสอบในเครื่องเท่านั้น (wrangler pages dev --binding MOCK_LAYOUT=...)
    await new Promise((ok) => setTimeout(ok, 12000))
    return normalizeLayout(JSON.parse(env.MOCK_LAYOUT), q)
  }
  const model = env.AI_MODEL || 'claude-sonnet-5-5'
  const imgs = [...own, ...(own.length < 3 ? await ideaImages(ideas, Math.min(2, 3 - own.length)) : [])]
  const t0 = Date.now()
  trace.imgs = imgs.length; trace.tries = []
  const ask = async (content, ms) => {
    const t = { at: Math.round((Date.now() - t0) / 1000) }; trace.tries.push(t)
    const body = { model, max_tokens: DESIGN_MAX_TOKENS, messages: [{ role: 'user', content }], stream: true }
    if (!/haiku/.test(model)) body.output_config = { effort: 'medium' }
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) })
    if (!r.ok) { const e = await r.json().catch(() => ({})); t.why = 'HTTP ' + r.status + ' ' + (e?.error?.message || ''); throw new Error(t.why) }
    const x = await readAiStream(r) // อ่านแบบทยอย — งานคิดนานไม่หลุด
    Object.assign(t, { sec: Math.round((Date.now() - t0) / 1000) - t.at, stop: x.stop_reason, out: x.usage?.output_tokens, think: x.usage?.output_tokens_details?.thinking_tokens })
    if (x.error || x.stop_reason === 'refusal') { t.why = x.error || 'refusal'; throw new Error(t.why) }
    const cut = x.stop_reason === 'max_tokens' ? ' · ชนเพดาน max_tokens' : ''
    const m = x.text.match(/\{[\s\S]*\}/)
    let raw = null
    try { raw = m ? JSON.parse(m[0]) : null } catch { t.why = 'อ่านคำตอบ AI ไม่ออก (JSON)' + cut; throw new Error(t.why) }
    const L = normalizeLayout(raw, q)
    if (!L.floors.length) { t.why = 'AI ตอบผังห้องไม่ครบ' + cut; throw new Error(t.why) }
    return L
  }
  const first = [...imgs, { type: 'text', text: buildPrompt(q, imgs.length > 0) }]
  let layout
  try { layout = await ask(first, 540000) } catch (e) {
    // ล้มแบบชั่วคราว (คำตอบถูกตัด/อ่านไม่ออก · AI คนใช้เยอะ) → ลองใหม่เองอีก 1 รอบ ถ้ายังมีเวลาพอ (หน้าเว็บรอได้ 15 นาที)
    const used = Date.now() - t0
    if (!retryableDesignError(e.message) || used > 360000) throw e
    layout = await ask(first, Math.max(120000, 840000 - used))
  }
  // ผังมีปัญหาร้ายแรง → ให้ AI แก้อีก 1 รอบ (ใช้ผลใหม่ถ้าปัญหาน้อยลง) · ถ้าเวลาเหลือน้อย ส่งผลที่มีไปก่อน
  const issues = layout.floors.length ? seriousIssues(analyze(layout, q)) : []
  if (issues.length && Date.now() - t0 < 480000) {
    const l2 = await ask([{ type: 'text', text: buildRepairPrompt(q, layout, issues) }], Math.max(60000, 840000 - (Date.now() - t0))).catch(() => null)
    if (l2?.floors.length && seriousIssues(analyze(l2, q)).length < issues.length) layout = l2
  }
  return layout
}

export async function onRequestPost({ request, env, waitUntil }) {
  if (!enabled(env)) return json({ error: 'ระบบออกแบบอัตโนมัติยังไม่เปิดใช้ กรุณาส่งความต้องการให้สถาปนิกแทน' }, 503)
  const ip = request.headers.get('cf-connecting-ip') || '-', d = day(), lim = limits(env)
  if (await count(env, `ip:${d}:${ip}`) >= lim.perIp) return json({ error: `วันนี้ออกแบบครบ ${lim.perIp} ครั้งแล้ว ส่งความต้องการให้สถาปนิกช่วยต่อได้เลย` }, 429)
  if (await count(env, 'd:' + d) >= lim.perDay) return json({ error: 'วันนี้มีคนใช้ระบบออกแบบเต็มแล้ว ส่งความต้องการให้สถาปนิกแทนได้' }, 429)
  const b = await request.json().catch(() => ({}))
  const q = normalizeReq({ ...b, images: undefined })
  const ideas = await loadIdeas(env, request, b.idea_ids)
  const own = parsePublicImages(b.images) // รูปตัวอย่างที่ลูกค้าแนบเอง (ส่งให้ AI ดูอย่างเดียว ไม่เก็บ)
  if (own.length) q.notes = [q.notes, `ลูกค้าแนบรูปตัวอย่าง ${own.length} รูป`].filter(Boolean).join(' · ').slice(0, 1500)
  if (ideas.length) q.notes = [q.notes, ideaText(ideas)].filter(Boolean).join(' · ').slice(0, 1500)
  if (!q.bedrooms && !q.bathrooms) return json({ error: 'ระบุจำนวนห้องนอนหรือห้องน้ำอย่างน้อย 1 อย่าง' }, 400)
  await bump(env, `ip:${d}:${ip}`); await bump(env, 'd:' + d)

  const { readable, writable } = new TransformStream()
  const w = writable.getWriter(), enc = new TextEncoder()
  const beat = setInterval(() => { w.write(enc.encode(' ')).catch(() => {}) }, 10000)
  waitUntil((async () => {
    let out
    const trace = {}, t0 = Date.now()
    try {
      const layout = await askLayout(env, q, ideas, own, trace)
      if (!layout.floors.length) throw new Error('ผังห้องไม่ครบ')
      const a = analyze(layout, q)
      out = { status: 'done', layout, stats: { total: a.total, indoor: a.indoor, outdoor: a.outdoor, estimate: a.estimate, bedrooms: a.bedrooms, bathrooms: a.bathrooms, footprint: a.footprint } }
    } catch (e) {
      console.log('house-concept error: ' + e.message)
      // เก็บเหตุผลที่ล้มไว้ดูย้อนหลัง 30 วัน (ไม่มีชื่อ/เบอร์ลูกค้า) · ดูด้วย node scripts/web-design-errors.mjs
      if (env.LIMITS) await env.LIMITS.put('err:' + d + ':' + Date.now(), JSON.stringify({ at: new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 19).replace('T', ' '), why: String(e.message || e).slice(0, 300), sec: Math.round((Date.now() - t0) / 1000), floors: q.floors, beds: q.bedrooms, baths: q.bathrooms, rooms: (q.program || []).length, facing: q.facing, ...trace }), { expirationTtl: 30 * 86400 }).catch(() => {})
      out = { status: 'error', error: 'ออกแบบไม่สำเร็จ ลองใหม่อีกครั้ง หรือส่งความต้องการให้สถาปนิก' }
    }
    clearInterval(beat)
    await w.write(enc.encode(JSON.stringify(out))).catch(() => {})
    await w.close().catch(() => {})
  })())
  return new Response(readable, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}
