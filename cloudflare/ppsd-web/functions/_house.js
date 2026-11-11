// ส่วนกลางของ "ออกแบบบ้านให้ดูทันที" บนเว็บ Cloudflare (ppsd-web.pages.dev) — เรียก AI จาก Cloudflare เอง ไม่ผ่านเซิร์ฟเวอร์ออฟฟิศ
// ใช้กติกาเดียวกับ ERP: ไฟล์ _lib/house-concept.js ถูกคัดลอกจาก server/house-concept.js ตอนอัปเดตเว็บ (scripts/deploy-web.mjs)
// ค่าที่ต้องตั้งในหน้า Cloudflare (Settings → Variables and Secrets): ANTHROPIC_API_KEY (Secret)
//   ไม่บังคับ: AI_MODEL (ค่าเริ่ม claude-sonnet-5-5) · PER_IP (3) · PER_DAY (40) · ปิดชั่วคราว: HOUSE_OFF = 1
// ตัวนับจำนวนครั้งเก็บใน KV ชื่อ LIMITS (ผูกใน wrangler.toml)
export const BY = 'เว็บลูกค้า (Cloudflare)'
export const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
export const enabled = (env) => !!env.ANTHROPIC_API_KEY && !env.HOUSE_OFF
export const day = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10) // วันตามเวลาไทย
export const limits = (env) => ({ perIp: Number(env.PER_IP) || 3, perDay: Number(env.PER_DAY) || 40 })
export async function count(env, key) { return env.LIMITS ? Number(await env.LIMITS.get(key)) || 0 : 0 }
export async function bump(env, key) { if (env.LIMITS) await env.LIMITS.put(key, String((await count(env, key)) + 1), { expirationTtl: 172800 }) }
