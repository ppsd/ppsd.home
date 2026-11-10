// เมนูกด LINE (Rich Menu) + ปุ่มตอบด่วน — ทดสอบส่วนที่ไม่ต้องเรียก LINE จริง
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RICH_MENUS, MENU_ACTIONS, menuDef, autoQuickReply } from '../line-richmenu.js'

test('เมนูทุกแบบ: 6 ปุ่ม · ทุกปุ่มมีการทำงาน · พื้นที่กดครอบเต็มรูป 2500×1686 ไม่ซ้อนกัน', () => {
  for (const [kind, btns] of Object.entries(RICH_MENUS)) {
    assert.equal(btns.length, 6, kind)
    for (const b of btns) assert.ok(MENU_ACTIONS[b.key], `${kind}: ปุ่ม ${b.key} ไม่มีการทำงาน`)
    const def = menuDef(kind)
    assert.ok(def.chatBarText.length <= 14)
    const area = def.areas.reduce((s, a) => s + a.bounds.width * a.bounds.height, 0)
    assert.equal(area, 2500 * 1686, kind + ' พื้นที่กดต้องเต็มรูปพอดี')
    for (const a of def.areas) { assert.match(a.action.data, /^menu:/); assert.ok(a.bounds.x + a.bounds.width <= 2500 && a.bounds.y + a.bounds.height <= 1686) }
  }
  for (const a of Object.values(MENU_ACTIONS)) if (a.choose) for (const [, k] of a.choose[1]) assert.ok(MENU_ACTIONS[k], 'ตัวเลือกต้องมีการทำงาน: ' + k)
})

test('ปุ่มตอบด่วนอัตโนมัติ: ตอบตัวเลข → ปุ่มเลข · ถาม ตกลง → ปุ่มตกลง/ยกเลิก · ข้อความทั่วไป → ไม่ใส่', () => {
  const num = autoQuickReply([{ type: 'text', text: 'รับของของใบไหนคะ? ตอบตัวเลข\n1. PO-69-0001 ร้านเอ\n2. PO-69-0002 ร้านบี' }])
  const items = num[0].quickReply.items
  assert.deepEqual(items.map((x) => x.action.text), ['1', '2'])
  assert.ok(items.every((x) => x.action.label.length <= 20))
  const ok = autoQuickReply([{ type: 'text', text: "สรุปรายการ\n1. ปูน 50 ถุง\nถูกต้องไหมคะ? ตอบ 'ตกลง' หรือ 'ยกเลิก'" }])
  assert.deepEqual(ok[0].quickReply.items.map((x) => x.action.text), ['ตกลง', 'ยกเลิก'], 'รายการสินค้าแบบมีเลข ไม่ใช่ตัวเลือก')
  const plain = autoQuickReply([{ type: 'text', text: 'สวัสดีค่ะ' }])
  assert.equal(plain[0].quickReply, undefined)
  const card = { type: 'flex', altText: 'x', contents: {} }
  assert.equal(autoQuickReply([card])[0], card, 'การ์ดไม่แตะ')
  const keep = { type: 'text', text: "ตอบ 'ตกลง'", quickReply: { items: [] } }
  assert.equal(autoQuickReply([keep])[0], keep, 'มีปุ่มอยู่แล้วไม่ทับ')
  const many = autoQuickReply([{ type: 'text', text: 'เลือกบ้าน ตอบตัวเลข\n' + Array.from({ length: 20 }, (_, i) => `${i + 1}. บ้าน ${i + 1}`).join('\n') }])
  assert.ok(many[0].quickReply.items.length <= 13, 'LINE รับได้ไม่เกิน 13 ปุ่ม')
})
