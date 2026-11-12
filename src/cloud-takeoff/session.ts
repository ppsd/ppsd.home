// ผู้ใช้ที่ล็อกอิน + ค่าตั้งจาก ERP (รุ่น AI · ตารางราคา AI · รายชื่อร้านค้นราคา) — โหลดจาก GET /api/takeoff/me
export interface CloudUser { id: number; name: string; username: string; role: string; position: string; can_add_price: boolean }
export interface CloudConfig { model?: string; search_model?: string; prices?: Record<string, [number, number]>; shops?: string }
export interface CloudHouse { code: string; name: string; [k: string]: unknown }
export interface MeResponse { user: CloudUser; mode: 'live' | 'mirror'; last_sync: string; houses: CloudHouse[]; config: CloudConfig }

let cur: MeResponse | null = null
export const setSession = (m: MeResponse | null) => { cur = m }
export const me = () => cur
export const config = (): CloudConfig => cur?.config || {}
