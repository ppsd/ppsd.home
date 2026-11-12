// แทน src/store.tsx สำหรับหน้าถอดแบบ/BOQ บน Cloudflare — มีเฉพาะที่หน้าจอ BOQ ใช้ (รายชื่อบ้าน · ผู้ใช้)
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { CloudHouse, CloudUser } from './session'
export type { ApiLaborRate, ApiMaterialPrice } from '../store'

export const laborLabel = (r: { name: string; variant?: string }) => r.name + (r.variant ? ` (${r.variant})` : '')

interface Ctx { data: { houses: (CloudHouse & { id: number | string })[] }; user: CloudUser | null; reloadData: (key: string, path: string) => Promise<void> }
const AppCtx = createContext<Ctx>({ data: { houses: [] }, user: null, reloadData: async () => {} })
export const useApp = () => useContext(AppCtx)
export function CloudAppProvider({ houses, user, children }: { houses: CloudHouse[]; user: CloudUser; children: ReactNode }) {
  const value: Ctx = { data: { houses: houses.map((h) => ({ ...h, id: (h.id as number | undefined) ?? h.code })) }, user, reloadData: async () => {} }
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
