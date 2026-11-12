// ชนิดข้อมูลของ server/takeoff-core.js สำหรับหน้าถอดแบบบน Cloudflare (src/cloud-takeoff) — ตัวสูตรอยู่ใน .js
export interface DxfSummary {
  units: string; unit_from_file: boolean; entity_count: number; paper_skipped: number; anon_wrappers: number; layers: string[]
  blocks: { name: string; layer: string; count: number; nested: number }[]
  lengths: { layer: string; length_m: number; segments: number }[]
  areas: { layer: string; area_m2: number; count: number; source: string }[]
  circles: { layer: string; diameter_m: number; count: number }[]
  texts: { text: string; layer: string; count: number }[]
}
export interface TakeoffRow { cat: string; desc: string; qty: number; unit: string; basis: string; confidence: string; floor: string; part?: string; sheet?: string }
export interface MatRef { id: number; name: string; unit: string; central: number; confidence?: string }
export interface MatPick extends MatRef { score: number; remembered?: boolean }
export const FLOOR_ALL: string
export const BOQ_CATS: string[]
export function summarizeDxf(text: string, unitOverride?: string): DxfSummary
export function rawItemsFromDxf(s: DxfSummary): TakeoffRow[]
export function normName(n: string): string
export function unitKey(u: string): string
export function matchMaterial(item: { desc: string; unit: string }, materials: MatRef[], aliases?: { mp_id: number; alias: string; nkey: string; unit: string }[]): { match: MatPick | null; alts: MatPick[] }
export function takeoffPrompt(o: { house: Record<string, unknown>; rates: unknown[]; dxfSummary: DxfSummary | null; files?: string[] }): string
export function cleanItems(list: unknown): TakeoffRow[]
export function cleanLabor(list: unknown, rates: unknown[]): unknown[]
export function flattenSections(parsed: unknown): { items: unknown[]; labor: unknown[]; work: unknown[] }
