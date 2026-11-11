import { normalizeReq, normalizeLayout, analyze, buildPrompt } from '../../_lib/house-concept.js'
import { json, enabled, day, limits, count, bump } from '../../_house.js'

// ลูกค้ากรอกความต้องการ → AI จัดผังห้อง → ส่งผังกลับในคำตอบเดียว (ใช้เวลา 1–3 นาที)
// ระหว่างรอ ส่งช่องว่างทุก 10 วิ ให้การเชื่อมต่อไม่หลุด แล้วต่อท้ายด้วย JSON ผลลัพธ์ (หน้าเว็บอ่านด้วย JSON.parse ได้ตามปกติ)
async function askLayout(env, q) {
  if (env.MOCK_LAYOUT) { // ทดสอบในเครื่องเท่านั้น (wrangler pages dev --binding MOCK_LAYOUT=...)
    await new Promise((ok) => setTimeout(ok, 12000))
    return normalizeLayout(JSON.parse(env.MOCK_LAYOUT))
  }
  const model = env.AI_MODEL || 'claude-sonnet-5-5'
  const body = { model, max_tokens: 32000, messages: [{ role: 'user', content: [{ type: 'text', text: buildPrompt(q, false) }] }] }
  if (!/haiku/.test(model)) body.output_config = { effort: 'medium' }
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(300000) })
  const data = await r.json().catch(() => ({}))
  if (!r.ok || data.stop_reason === 'refusal') throw new Error(data?.error?.message || 'HTTP ' + r.status)
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text || '').join('')
  const m = text.match(/\{[\s\S]*\}/)
  return normalizeLayout(m ? JSON.parse(m[0]) : null)
}

export async function onRequestPost({ request, env, waitUntil }) {
  if (!enabled(env)) return json({ error: 'ระบบออกแบบอัตโนมัติยังไม่เปิดใช้ กรุณาส่งความต้องการให้สถาปนิกแทน' }, 503)
  const ip = request.headers.get('cf-connecting-ip') || '-', d = day(), lim = limits(env)
  if (await count(env, `ip:${d}:${ip}`) >= lim.perIp) return json({ error: `วันนี้ออกแบบครบ ${lim.perIp} ครั้งแล้ว ส่งความต้องการให้สถาปนิกช่วยต่อได้เลย` }, 429)
  if (await count(env, 'd:' + d) >= lim.perDay) return json({ error: 'วันนี้มีคนใช้ระบบออกแบบเต็มแล้ว ส่งความต้องการให้สถาปนิกแทนได้' }, 429)
  const b = await request.json().catch(() => ({}))
  const q = normalizeReq({ ...b, images: undefined })
  if (!q.bedrooms && !q.bathrooms) return json({ error: 'ระบุจำนวนห้องนอนหรือห้องน้ำอย่างน้อย 1 อย่าง' }, 400)
  await bump(env, `ip:${d}:${ip}`); await bump(env, 'd:' + d)

  const { readable, writable } = new TransformStream()
  const w = writable.getWriter(), enc = new TextEncoder()
  const beat = setInterval(() => { w.write(enc.encode(' ')).catch(() => {}) }, 10000)
  waitUntil((async () => {
    let out
    try {
      const layout = await askLayout(env, q)
      if (!layout.floors.length) throw new Error('ผังห้องไม่ครบ')
      const a = analyze(layout, q)
      out = { status: 'done', layout, stats: { total: a.total, indoor: a.indoor, outdoor: a.outdoor, estimate: a.estimate, bedrooms: a.bedrooms, bathrooms: a.bathrooms, footprint: a.footprint } }
    } catch (e) {
      console.log('house-concept error: ' + e.message)
      out = { status: 'error', error: 'ออกแบบไม่สำเร็จ ลองใหม่อีกครั้ง หรือส่งความต้องการให้สถาปนิก' }
    }
    clearInterval(beat)
    await w.write(enc.encode(JSON.stringify(out))).catch(() => {})
    await w.close().catch(() => {})
  })())
  return new Response(readable, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}
