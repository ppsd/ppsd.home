// ข้อมูลกลางของ "สรุปวัสดุ" — ใช้ทั้งหน้าพิมพ์ PDF (MaterialSummaryPrint) และไฟล์ Excel (exportMaterialSummaryXlsx)
import { company } from '../../erpData'
import { exportXlsxBook, type XlsxSheet } from '../../exportCsv'
import { BOQ_CATS, type BoqItem } from './BoqTab'
import { FLOOR_ALL, sortFloors, type WorkSec } from './boqFloors'

export const floorOf = (it: BoqItem) => it.floor || FLOOR_ALL
export const isLabor = (it: BoqItem) => it.desc.startsWith('ค่าแรง:')
export const sumMat = (xs: BoqItem[]) => xs.reduce((s, it) => s + (it.qty || 0) * (it.mat || 0), 0)
export const sumLab = (xs: BoqItem[]) => xs.reduce((s, it) => s + (it.qty || 0) * (it.lab || 0), 0)
/** ชื่อที่แสดง: ไม่แสดงราคา = ชื่อ/สเปกตามแบบ · แสดงราคา = ชื่อตามราคากลางที่ผูกไว้ */
export const nameOf = (it: BoqItem, showPrice: boolean) => showPrice ? it.desc : it.spec || it.desc
/** รายการที่ใช้สรุป: ไม่แสดงราคา = วัสดุอย่างเดียว (แถวค่าแรงเป็นปริมาณงาน แสดงในหัวส่วนงานแล้ว) */
export const summaryItems = (items: BoqItem[], showPrice: boolean) => showPrice ? items : items.filter((it) => !isLabor(it))

// วัสดุชนิดเดียวกัน (ชื่อ + หน่วย) จากหลายชั้น → แถวเดียว · mat/lab = ยอดรวม (ราคา/หน่วย = mat ÷ qty)
export function mergeAcrossFloors(items: BoqItem[], name: (it: BoqItem) => string) {
  const m = new Map<string, { desc: string; unit: string; qty: number; mat: number; lab: number; floors: string[] }>()
  for (const it of items) {
    const k = name(it).trim() + '|' + (it.unit || '').trim()
    const o = m.get(k) || { desc: name(it), unit: it.unit, qty: 0, mat: 0, lab: 0, floors: [] }
    o.qty += it.qty || 0; o.mat += (it.qty || 0) * (it.mat || 0); o.lab += (it.qty || 0) * (it.lab || 0)
    if (!o.floors.includes(floorOf(it))) o.floors.push(floorOf(it))
    m.set(k, o)
  }
  return [...m.values()].map((o) => ({ ...o, floors: sortFloors(o.floors) }))
}
/** ปริมาณงานของ ชั้น × ประเภทงาน × ส่วนงาน เป็นข้อความเดียว */
export const workText = (work: WorkSec[], floor: string, cat: string, part: string) =>
  work.filter((w) => (w.floor || FLOOR_ALL) === floor && w.cat === cat && (w.part || '') === part).flatMap((w) => w.work).map((x) => `${x.desc} ${x.qty} ${x.unit}`).join(' · ')

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Excel สรุปวัสดุ — sheet: สรุป · รวมทั้งงาน · ข้อมูลทั้งหมด (กรอง/ทำ Pivot ได้) · แต่ละชั้น · แต่ละระบบงาน
 * showPrice = เพิ่มคอลัมน์ราคา/ค่าแรง (ตรงกับติ๊ก "แสดงราคา" ในหน้าสรุป)
 */
export function exportMaterialSummaryXlsx({ title, houseName, items, work = [], showPrice }: { title: string; houseName?: string; items: BoqItem[]; work?: WorkSec[]; showPrice: boolean }) {
  const list = summaryItems(items, showPrice)
  const nm = (it: BoqItem) => nameOf(it, showPrice)
  const floors = sortFloors(list.map(floorOf))
  const cats = BOQ_CATS.filter((cat) => list.some((it) => it.cat === cat))
  const priceHead = showPrice ? ['วัสดุ/หน่วย', 'ค่าวัสดุ', 'ค่าแรง', 'รวม'] : []
  const priceCols = showPrice ? [12, 13, 13, 14] : []
  const price = (qty: number, mat: number, lab: number) => showPrice ? [mat && qty ? r2(mat / qty) : '', r2(mat), r2(lab), r2(mat + lab)] : []
  const header = (sheet: string): (string | number)[][] => [
    [company.name], [`สรุปปริมาณวัสดุ${showPrice ? 'และค่าแรง' : ''} — ${sheet}`], [title + (houseName ? ' · ' + houseName : '')],
    [`วันที่ ${new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}`], [],
  ]
  const sheets: XlsxSheet[] = []

  // 1) สรุป: ชั้น × ประเภทงาน
  const cell = (xs: BoqItem[]) => showPrice ? r2(sumMat(xs) + sumLab(xs)) : xs.length
  sheets.push({
    name: 'สรุป',
    cols: [18, ...cats.map(() => 16), 14],
    rows: [
      ...header('ภาพรวม'),
      [showPrice ? 'มูลค่า (บาท) แยกชั้น × ประเภทงาน' : 'จำนวนรายการวัสดุ แยกชั้น × ประเภทงาน'],
      ['ชั้น', ...cats, 'รวม'],
      ...floors.map((f) => { const xs = list.filter((it) => floorOf(it) === f); return [f, ...cats.map((c) => cell(xs.filter((it) => it.cat === c))), cell(xs)] }),
      ['รวมทั้งงาน', ...cats.map((c) => cell(list.filter((it) => it.cat === c))), cell(list)],
      ...(showPrice ? [[], ['ค่าวัสดุรวม', r2(sumMat(list))], ['ค่าแรงรวม', r2(sumLab(list))], ['รวมต้นทุน', r2(sumMat(list) + sumLab(list))]] : []),
    ],
  })

  // 2) รวมทั้งงาน: วัสดุชนิดเดียวกันรวมทุกชั้น
  const allRows: (string | number)[][] = [...header('รวมทั้งงาน (รวมทุกชั้น)'), ['ประเภทงาน', '#', 'รายการวัสดุ', 'จำนวน', 'หน่วย', 'ใช้ที่ชั้น', ...priceHead]]
  for (const cat of cats) {
    mergeAcrossFloors(list.filter((it) => it.cat === cat), nm).forEach((r, i) => allRows.push([cat, i + 1, r.desc, r2(r.qty), r.unit, r.floors.join(', '), ...price(r.qty, r.mat, r.lab)]))
  }
  sheets.push({ name: 'รวมทั้งงาน', cols: [20, 5, 48, 10, 9, 28, ...priceCols], rows: allRows })

  // 3) ข้อมูลทั้งหมด (แถวละรายการ — ใช้กรอง/ทำ Pivot ใน Excel)
  sheets.push({
    name: 'ข้อมูลทั้งหมด',
    cols: [16, 20, 20, 9, 48, 10, 9, 50, ...priceCols],
    rows: [['ชั้น', 'ประเภทงาน', 'ส่วนงาน', 'แบบ', 'รายการวัสดุ', 'จำนวน', 'หน่วย', 'วิธีคิด', ...priceHead],
      ...list.map((it) => [floorOf(it), it.cat, it.part || '', it.sheet || '', nm(it), r2(it.qty || 0), it.unit || '', it.basis || '', ...price(it.qty || 0, (it.qty || 0) * (it.mat || 0), (it.qty || 0) * (it.lab || 0))])],
  })

  // แถวรายการของกลุ่มหนึ่ง (ใช้ทั้ง sheet ชั้น และ sheet ระบบงาน) — หัวส่วนงานมีปริมาณงาน
  const detail = (xs: BoqItem[], groupCol: (it: BoqItem) => string, first: string) => {
    const rows: (string | number)[][] = [[first, 'ส่วนงาน', 'แบบ', '#', 'รายการวัสดุ', 'จำนวน', 'หน่วย', 'วิธีคิด', ...priceHead]]
    const groups = [...new Set(xs.map(groupCol))]
    for (const g of groups) {
      const ys = xs.filter((it) => groupCol(it) === g)
      for (const pt of [...new Set(ys.map((it) => it.part || ''))]) {
        const zs = ys.filter((it) => (it.part || '') === pt)
        const wt = workText(work, floorOf(zs[0]), zs[0].cat, pt)
        if (wt) rows.push([g, pt, zs[0].sheet || '', '', 'ปริมาณงาน: ' + wt])
        zs.forEach((it, i) => rows.push([g, pt, it.sheet || '', i + 1, nm(it), r2(it.qty || 0), it.unit || '', it.basis || '', ...price(it.qty || 0, (it.qty || 0) * (it.mat || 0), (it.qty || 0) * (it.lab || 0))]))
      }
    }
    return rows
  }
  const cols = [20, 20, 9, 5, 48, 10, 9, 50, ...priceCols]

  // 4) แยกตามชั้น (ในชั้นเรียงตามประเภทงาน)
  for (const f of floors) {
    const xs = list.filter((it) => floorOf(it) === f).sort((a, b) => BOQ_CATS.indexOf(a.cat) - BOQ_CATS.indexOf(b.cat))
    sheets.push({ name: f, cols, rows: [...header(f), ...detail(xs, (it) => it.cat, 'ประเภทงาน')] })
  }
  // 5) แยกตามระบบงาน (ในระบบเรียงตามชั้น)
  for (const cat of cats) {
    const order = sortFloors(list.map(floorOf))
    const xs = list.filter((it) => it.cat === cat).sort((a, b) => order.indexOf(floorOf(a)) - order.indexOf(floorOf(b)))
    sheets.push({ name: 'งาน' + cat.replace(/^ระบบ/, ''), cols, rows: [...header(cat), ...detail(xs, floorOf, 'ชั้น')] })
  }

  return exportXlsxBook(`สรุปวัสดุ-${houseName || 'ถอดแบบ'}`.replace(/[\\/:*?"<>|]/g, '-'), sheets)
}
