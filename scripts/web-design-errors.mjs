// ดูเหตุผลที่ "ออกแบบบ้านให้ดูเลย" บนเว็บลูกค้า (ppsd-web.pages.dev) ล้ม ย้อนหลัง 30 วัน + จำนวนครั้งต่อวัน
// ใช้: node scripts/web-design-errors.mjs   (ต้องล็อกอิน wrangler ไว้แล้ว เหมือนตอนอัปเดตเว็บ)
import { execSync } from 'node:child_process'
const NS = '1048758dc3e64a0790fb4cef835eabf4' // KV "LIMITS" ใน cloudflare/ppsd-web/wrangler.toml
const w = (args) => execSync(`npx -y wrangler@4.20.0 kv ${args} --namespace-id ${NS} --remote`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const keys = JSON.parse(w('key list')).map((k) => k.name)
for (const k of keys.filter((k) => k.startsWith('d:')).sort()) console.log(`ออกแบบวันที่ ${k.slice(2)}: ${w(`key get "${k}"`).trim()} ครั้ง`)
const errs = keys.filter((k) => k.startsWith('err:')).sort()
console.log(errs.length ? `\nล้ม ${errs.length} ครั้ง:` : '\nไม่มีครั้งที่ล้มในช่วง 30 วัน')
for (const k of errs) {
  const e = JSON.parse(w(`key get "${k}"`))
  const tries = (e.tries || []).map((t, i) => `  รอบ ${i + 1}: ${t.sec ?? '-'} วิ · หยุดเพราะ ${t.stop || '-'} · token ${t.out ?? '-'} (คิด ${t.think ?? '-'})${t.why ? ' · ' + t.why : ''}`).join('\n')
  console.log(`- ${e.at} · ${e.floors || '?'} ชั้น ${e.beds} นอน ${e.baths} น้ำ · ห้องที่ระบุ ${e.rooms} · รูป ${e.imgs ?? 0} · รวม ${e.sec} วิ\n  เหตุผล: ${e.why}${tries ? '\n' + tries : ''}`)
}
