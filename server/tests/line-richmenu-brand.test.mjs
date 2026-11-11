// ผังจุดกดของเมนูแบบกำหนดเอง: 7 จุด ไม่ทับกัน เต็มรูปพอดี และทุกปุ่มมีคำตอบ
import test from 'node:test'
import assert from 'node:assert/strict'
import { BRAND_MENUS, MENU_ACTIONS, brandMenuDef } from '../line-richmenu.js'

for (const kind of Object.keys(BRAND_MENUS)) {
  test(`เมนู ${kind}: 7 จุดกดเต็มรูป ไม่ทับกัน`, () => {
    const def = brandMenuDef(kind)
    assert.equal(def.areas.length, 7)
    assert.deepEqual(def.areas[0].bounds, { x: 0, y: 0, width: 2500, height: 562 })
    const area = def.areas.reduce((sum, a) => sum + a.bounds.width * a.bounds.height, 0)
    assert.equal(area, 2500 * 1686)
    const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
    def.areas.forEach((a, i) => def.areas.slice(i + 1).forEach((b) => assert.equal(overlap(a.bounds, b.bounds), false)))
  })

  test(`เมนู ${kind}: กดแล้วบอทตอบชื่อปุ่มที่ตรงกับจุดนั้น`, () => {
    brandMenuDef(kind).areas.forEach((a) => {
      const hint = MENU_ACTIONS[a.action.data.replace('menu:', '')]?.hint
      assert.ok(hint, a.action.data)
      assert.ok(hint.includes(a.action.displayText))
    })
  })
}
