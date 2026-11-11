import { json, enabled, day, limits, count } from '../../../_house.js'
// หน้าเว็บถามก่อนว่าเปิดใช้ได้ไหม (ไม่มีกุญแจ AI = ซ่อนปุ่ม)
export async function onRequestGet({ env }) {
  return json({ ok: enabled(env), left_today: Math.max(0, limits(env).perDay - await count(env, 'd:' + day())) })
}
