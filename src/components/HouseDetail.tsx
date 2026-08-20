import { useState, useEffect } from 'react'
import {
  baht,
  statusStyle,
  prStyle,
  isStyle,
  catStyle,
} from '../data'
import { useApp } from '../store'
import type { ApiHouse } from '../store'
import { api } from '../api'
import FilesPanel from './FilesPanel'
import ContractorsPanel from './ContractorsPanel'
import InstallmentSection from './InstallmentSection'
import WorkOrders from './WorkOrders'
import Procurement from './Procurement'
import QcInspect from './QcInspect'
import SiteDocs from './SiteDocs'
import SiteReports from './SiteReports'
import Safety from './Safety'
import Handover from './Handover'
import BoqTab from './BoqTab'

function Cell({ label, value, color, sub, br, bb }: { label: string; value: string; color: string; sub?: string; br?: boolean; bb?: boolean }) {
  return (
    <div style={{ padding: '15px 18px', borderRight: br ? '1px solid #EEF1F4' : undefined, borderBottom: bb ? '1px solid #EEF1F4' : undefined }}>
      <div style={{ fontSize: 12, color: '#5C6770' }}>{label}</div>
      <div className="num" style={{ fontSize: 21, fontWeight: 700, marginTop: 4, color }}>{value}</div>
      {sub && <div className="num" style={{ fontSize: 11, color: '#94A0A8', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

interface HouseDetailProps {
  house: ApiHouse
  tab: string
  onSetTab: (id: string) => void
  onGoHouses: () => void
  onEditHouse: () => void
}

const th: React.CSSProperties = { padding: '9px 12px', fontWeight: 600, color: '#5C6770', fontSize: 12 }
const INST_CATS = [
  { key: 'house', label: 'ตัวบ้าน' },
  { key: 'carport', label: 'โรงจอดรถ' },
  { key: 'road', label: 'ถนน / รั้ว' },
]

export default function HouseDetail({ house, tab, onSetTab, onGoHouses, onEditHouse }: HouseDetailProps) {
  const { data, user } = useApp()
  // กำไรของบ้าน เห็นได้เฉพาะผู้จัดการ (และผู้ดูแล) เท่านั้น คนอื่นขึ้น "-"
  const canSeeProfit = !!user?.isManager
  const profitText = (v: number) => (canSeeProfit ? baht(v) : '-')
  const ss = statusStyle(house.status)
  const info = [
    { k: 'รหัสบ้าน', v: house.code },
    { k: 'แบบบ้าน', v: house.design || '-' },
    { k: 'พื้นที่ใช้สอย', v: house.area || '-' },
    { k: 'เริ่มก่อสร้าง', v: house.start_date || '-' },
    { k: 'กำหนดส่งมอบ', v: house.deliver_date || '-' },
    { k: 'ผู้จัดการโครงการ', v: house.manager || '-' },
  ]

  // live data for this house, from the API store
  const houseInst = data.installments.filter((r) => r.house_code === house.code)
  const instOf = (cat: string, side: string) => houseInst.filter((r) => (r.category || 'house') === cat && (r.side || 'customer') === side)

  // หัวข้อใหญ่ (หมวดงวดงาน) — 3 หมวดมาตรฐาน + ที่ผู้ใช้เพิ่มเองต่อบ้าน
  const [customCats, setCustomCats] = useState<{ id: number; label: string }[]>([])
  const [newCat, setNewCat] = useState('')
  const [catErr, setCatErr] = useState('')
  const loadCats = () => api.get<{ id: number; label: string }[]>('/houses/' + house.code + '/inst-cats').then(setCustomCats).catch(() => setCustomCats([]))
  useEffect(() => { loadCats() /* eslint-disable-next-line */ }, [house.code])
  const addCat = async () => {
    const label = newCat.trim()
    if (!label) return
    setCatErr('')
    try { await api.post('/houses/' + house.code + '/inst-cats', { label }); setNewCat(''); loadCats() }
    catch (e) { setCatErr((e as Error).message) }
  }
  const delCat = async (id: number, label: string) => {
    if (!window.confirm(`ลบหัวข้อ "${label}"?`)) return
    try { await api.del('/houses/' + house.code + '/inst-cats/' + id); loadCats() }
    catch (e) { alert((e as Error).message) }
  }
  // รวมหมวดที่จะแสดง: มาตรฐาน + เพิ่มเอง + หมวดเก่าที่มีงวดอยู่แต่ไม่อยู่ใน 2 กลุ่มแรก (กันข้อมูลหลุด)
  const cats: { key: string; label: string; id?: number }[] = [
    ...INST_CATS,
    ...customCats.map((c) => ({ key: c.label, label: c.label, id: c.id })),
  ]
  const known = new Set(cats.map((c) => c.key))
  for (const k of new Set(houseInst.map((r) => r.category || 'house'))) if (!known.has(k)) cats.push({ key: k, label: k })
  const houseIssues = data.issues.filter((r) => r.house_code === house.code)
  const houseExp = data.expenses.filter((r) => r.house_code === house.code)
  const expTotal = houseExp.reduce((s, e) => s + e.amount, 0)

  const detailTabsDef = [
    { id: 'installments', label: 'งวดงาน', count: String(houseInst.length) },
    { id: 'workorders', label: 'ใบสั่งงาน', count: '' },
    { id: 'contractors', label: 'ช่าง / ผู้รับเหมา', count: '' },
    { id: 'issues', label: 'ปัญหา', count: String(houseIssues.length) },
    { id: 'boq', label: 'BOQ', count: '' },
    { id: 'qc', label: 'QC ตรวจงาน', count: '' },
    { id: 'sitedocs', label: 'เอกสารหน้างาน', count: '' },
    { id: 'sitereport', label: 'รายงานหน้างาน', count: '' },
    { id: 'safety', label: 'ความปลอดภัย', count: '' },
    { id: 'handover', label: 'ส่งมอบงาน', count: '' },
    { id: 'procurement', label: 'จัดซื้อ', count: '' },
    { id: 'expenses', label: 'รายจ่าย', count: '' },
  ]

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* back + title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onGoHouses} className="hov-f3f5f7" style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontSize: 13, fontWeight: 500, color: '#5C6770', background: '#fff', border: '1px solid #E1E5EA', borderRadius: 9, padding: '8px 13px', cursor: 'pointer' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          กลับ
        </button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.1 }}>{house.name}</div>
          <div style={{ fontSize: 13, color: '#94A0A8' }}>{house.project} · ลูกค้า {house.customer} · <span style={{ fontFamily: 'monospace' }}>{house.code}</span></div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: ss.c, background: ss.bg, padding: '5px 13px', borderRadius: 20 }}>{house.status}</span>
        {house.kind === 'cm' && <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: '#C0852C', padding: '5px 13px', borderRadius: 20 }}>ควบคุมงาน (CM)</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 500, color: '#1C2730', background: '#fff', border: '1px solid #E1E5EA', borderRadius: 9, padding: '9px 14px', cursor: 'pointer' }}>พิมพ์สรุป</button>
          <button onClick={onEditHouse} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}>แก้ไขข้อมูล</button>
        </div>
      </div>

      {/* ข้อมูลสัญญา/ผู้เกี่ยวข้อง (CM) */}
      {house.kind === 'cm' && (house.contract_no || house.owner || house.supervisor || house.engineer || house.site_location || house.scope) && (
        <div style={{ background: '#FBF6EC', border: '1px solid #EAD9B6', borderRadius: 13, padding: '13px 18px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, fontSize: 12.5 }}>
          {[
            ['เลขที่สัญญา', house.contract_no],
            ['เจ้าของ / ผู้ว่าจ้าง', house.owner],
            ['ที่ตั้งโครงการ', house.site_location],
            ['ผู้ควบคุมงาน', house.supervisor],
            ['วิศวกรโครงการ', house.engineer],
            ['ขอบเขตงาน', house.scope],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k}><div style={{ color: '#8A6D3B', fontSize: 11 }}>{k}</div><div style={{ color: '#5A4A2A', fontWeight: 500 }}>{v}</div></div>
          ))}
        </div>
      )}

      {/* financial summary: customer vs contractor + profit */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 0, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 13, overflow: 'hidden' }}>
        <Cell label={house.kind === 'cm' ? 'ค่าบริการควบคุมงาน' : 'ขายลูกค้า (มูลค่าสัญญา)'} value={baht(house.value)} color="#1C2730" sub={house.area || undefined} br bb />
        <Cell label="เก็บจากลูกค้าแล้ว" value={baht(house.collected)} color="#2E7D55" sub={`ค้างเก็บ ${baht(house.remain)}`} br bb />
        <Cell label="กำไรโครงการ (ขาย − จ่ายช่าง)" value={canSeeProfit ? baht(house.value - (house.contractor_value || 0)) : '-'} color={!canSeeProfit ? '#94A0A8' : house.value - (house.contractor_value || 0) >= 0 ? '#2E7D55' : '#C24036'} sub={canSeeProfit && house.value ? `มาร์จิน ${Math.round(((house.value - (house.contractor_value || 0)) / house.value) * 100)}%` : canSeeProfit ? undefined : 'เฉพาะผู้จัดการ'} bb />
        <Cell label="ต้นทุนช่าง (รวมสัญญา)" value={baht(house.contractor_value || 0)} color="#C0852C" br />
        <Cell label="จ่ายช่างแล้ว" value={baht(house.paid || 0)} color="#30506A" sub={`ค้างจ่าย ${baht(Math.max(0, (house.contractor_value || 0) - (house.paid || 0)))}`} br />
        <div style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 12, color: '#5C6770' }}>ความคืบหน้า · รายจ่ายอื่น {baht(expTotal)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 7 }}>
            <div style={{ flex: 1, height: 9, background: '#EEF1F4', borderRadius: 20, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: house.pct + '%', background: '#30506A', borderRadius: 20 }} />
            </div>
            <span className="num" style={{ fontSize: 17, fontWeight: 700, color: '#30506A' }}>{house.pct}%</span>
          </div>
        </div>
      </div>

      {/* มูลค่าแยก 3 หมวด (ตัวบ้าน / โรงจอดรถ / ถนน-รั้ว) */}
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 13, overflow: 'hidden' }}>
        <div style={{ padding: '13px 18px', borderBottom: '1px solid #EEF1F4', fontSize: 13.5, fontWeight: 600 }}>มูลค่าแยกตามหมวดงาน</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
              <th style={{ ...th, padding: '9px 18px' }}>หมวดงาน</th>
              <th style={{ ...th, textAlign: 'right' }}>ขายลูกค้า</th>
              <th style={{ ...th, textAlign: 'right' }}>จ่ายช่าง</th>
              <th style={{ ...th, padding: '9px 18px', textAlign: 'right' }}>กำไร</th>
            </tr>
          </thead>
          <tbody>
            {(house.breakdown ?? []).map((c) => {
              const p = c.customer - c.contractor
              return (
                <tr key={c.key} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td style={{ padding: '10px 18px', fontWeight: 500 }}>{c.label}</td>
                  <td className="num" style={{ padding: '10px 12px', textAlign: 'right' }}>{baht(c.customer)}</td>
                  <td className="num" style={{ padding: '10px 12px', textAlign: 'right', color: '#C0852C' }}>{baht(c.contractor)}</td>
                  <td className="num" style={{ padding: '10px 18px', textAlign: 'right', fontWeight: 600, color: !canSeeProfit ? '#94A0A8' : p >= 0 ? '#2E7D55' : '#C24036' }}>{profitText(p)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #E1E5EA', background: '#F7F9FB' }}>
              <td style={{ padding: '11px 18px', fontWeight: 700, color: '#1C2730' }}>รวมทั้งหลัง <span style={{ fontSize: 11, fontWeight: 400, color: '#94A0A8' }}>(กำไรขั้นต้น)</span></td>
              <td className="num" style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 700 }}>{baht(house.value)}</td>
              <td className="num" style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 700, color: '#C0852C' }}>{baht(house.contractor_value || 0)}</td>
              <td className="num" style={{ padding: '11px 18px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: !canSeeProfit ? '#94A0A8' : (house.value - (house.contractor_value || 0)) >= 0 ? '#2E7D55' : '#C24036' }}>{profitText(house.value - (house.contractor_value || 0))}</td>
            </tr>
            <tr style={{ background: '#F7F9FB' }}>
              <td colSpan={3} style={{ padding: '10px 18px', fontWeight: 600, color: '#5C6770' }}>กำไรสุทธิ <span style={{ fontSize: 11, fontWeight: 400, color: '#94A0A8' }}>(หักค่าวัสดุจริง {canSeeProfit ? baht(expTotal) : '—'})</span></td>
              <td className="num" style={{ padding: '10px 18px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: !canSeeProfit ? '#94A0A8' : (house.value - (house.contractor_value || 0) - expTotal) >= 0 ? '#2E7D55' : '#C24036' }}>{profitText(house.value - (house.contractor_value || 0) - expTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* two columns: info+files / main tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>
        {/* left: info + files */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 13, overflow: 'hidden' }}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid #EEF1F4', fontSize: 13.5, fontWeight: 600 }}>ข้อมูลบ้าน</div>
            <div style={{ padding: '6px 16px 12px' }}>
              {info.map((row, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: '1px solid #F4F6F8', fontSize: 13 }}>
                  <span style={{ color: '#5C6770', flexShrink: 0 }}>{row.k}</span>
                  <span style={{ fontWeight: 500, textAlign: 'right', color: '#1C2730' }}>{row.v}</span>
                </div>
              ))}
            </div>
          </div>

          <FilesPanel houseCode={house.code} />
        </div>

        {/* right: tabbed panel */}
        <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 13, overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 2, padding: '10px 14px 0', borderBottom: '1px solid #EEF1F4' }}>
            {detailTabsDef.map((t) => {
              const active = tab === t.id
              return (
                <div key={t.id} onClick={() => onSetTab(t.id)} style={{ fontSize: 13.5, fontWeight: active ? 600 : 500, color: active ? '#30506A' : '#5C6770', padding: '10px 16px', borderBottom: `2.5px solid ${active ? '#30506A' : 'transparent'}`, cursor: 'pointer', marginBottom: -1 }}>
                  {t.label}
                  {t.count ? (
                    <span className="num" style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, color: active ? '#30506A' : '#94A0A8', background: active ? '#E2E9EF' : '#F1F4F6', borderRadius: 20, padding: '0 7px' }}>{t.count}</span>
                  ) : null}
                </div>
              )
            })}
          </div>

          {/* TAB: งวดงาน — หมวดมาตรฐาน + หัวข้อใหญ่ที่เพิ่มเอง × 2 ฝั่ง (ลูกค้า/ช่าง) */}
          {tab === 'installments' && (
            <>
              {cats.map((c) => (
                <div key={c.key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', background: '#F0F3F6', borderTop: '1px solid #E1E5EA', borderBottom: '1px solid #E1E5EA' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1E2E3B' }}>หมวด: {c.label}</span>
                    {c.id != null && (
                      <button onClick={() => delCat(c.id!, c.label)} title="ลบหัวข้อนี้ (ต้องไม่มีงวดค้างอยู่)" className="hov-f3f5f7" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#C24036', background: '#fff', border: '1px solid #E7CDC9', borderRadius: 7, padding: '3px 10px', cursor: 'pointer' }}>ลบหัวข้อ</button>
                    )}
                  </div>
                  <InstallmentSection houseCode={house.code} side="customer" category={c.key} rows={instOf(c.key, 'customer')} />
                  <InstallmentSection houseCode={house.code} side="contractor" category={c.key} rows={instOf(c.key, 'contractor')} />
                </div>
              ))}
              {/* เพิ่มหัวข้อใหญ่เอง */}
              <div style={{ padding: '14px 18px', background: '#FAFBFC', borderTop: '1px solid #E1E5EA', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#5C6770' }}>+ เพิ่มหัวข้อใหญ่:</span>
                <input value={newCat} onChange={(e) => { setNewCat(e.target.value); setCatErr('') }} onKeyDown={(e) => { if (e.key === 'Enter') addCat() }} placeholder="เช่น สระว่ายน้ำ / ศาลา / งานตกแต่ง" style={{ fontFamily: 'inherit', fontSize: 13, color: '#1C2730', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 11px', outline: 'none', minWidth: 260 }} />
                <button onClick={addCat} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 8, padding: '7px 15px', cursor: 'pointer' }}>เพิ่มหัวข้อ</button>
                {catErr && <span style={{ fontSize: 12, color: '#C24036' }}>{catErr}</span>}
              </div>
            </>
          )}

          {/* TAB: ใบสั่งงาน (เฉพาะบ้านนี้) */}
            {tab === 'workorders' && <div style={{ padding: 16 }}><WorkOrders houseCode={house.code} /></div>}

          {/* TAB: จัดซื้อ (เฉพาะบ้านนี้) */}
            {tab === 'procurement' && <div style={{ padding: 16 }}><Procurement houseCode={house.code} /></div>}

          {/* TAB: BOQ (เฉพาะบ้านนี้) */}
            {tab === 'boq' && <div style={{ padding: 16 }}><BoqTab houseCode={house.code} /></div>}

          {/* TAB: QC ตรวจงาน (เฉพาะบ้านนี้) */}
            {tab === 'qc' && <div style={{ padding: 16 }}><QcInspect houseCode={house.code} /></div>}

          {/* TAB: เอกสารหน้างาน (เฉพาะบ้านนี้) */}
            {tab === 'sitedocs' && <div style={{ padding: 16 }}><SiteDocs houseCode={house.code} /></div>}

          {/* TAB: รายงานหน้างาน (เฉพาะบ้านนี้) */}
            {tab === 'sitereport' && <div style={{ padding: 16 }}><SiteReports houseCode={house.code} /></div>}

          {/* TAB: ความปลอดภัย (เฉพาะบ้านนี้) */}
            {tab === 'safety' && <div style={{ padding: 16 }}><Safety houseCode={house.code} /></div>}

          {/* TAB: ส่งมอบงาน (เฉพาะบ้านนี้) */}
            {tab === 'handover' && <div style={{ padding: 16 }}><Handover houseCode={house.code} /></div>}

          {/* TAB: ช่าง/ผู้รับเหมา */}
            {tab === 'contractors' && <ContractorsPanel houseCode={house.code} />}

            {/* TAB: ปัญหา */}
          {tab === 'issues' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
                  <th style={{ ...th, padding: '10px 18px' }}>ปัญหา</th>
                  <th style={{ ...th, padding: '10px 12px' }}>ผู้แจ้ง</th>
                  <th style={{ ...th, padding: '10px 12px' }}>วันแจ้ง</th>
                  <th style={{ ...th, padding: '10px 12px', textAlign: 'center' }}>ความเร่งด่วน</th>
                  <th style={{ ...th, padding: '10px 18px', textAlign: 'center' }}>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {houseIssues.map((i, idx) => {
                  const p = prStyle(i.priority)
                  const s = isStyle(i.status)
                  return (
                    <tr key={idx} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                      <td style={{ padding: '11px 18px' }}>
                        <div style={{ fontWeight: 500 }}>{i.title}</div>
                        <div style={{ fontSize: 11.5, color: '#94A0A8' }}>{i.note}</div>
                      </td>
                      <td style={{ padding: '11px 12px', color: '#5C6770' }}>{i.by}</td>
                      <td className="num" style={{ padding: '11px 12px', color: '#5C6770' }}>{i.date}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: p.c, background: p.bg, padding: '3px 10px', borderRadius: 20 }}>{i.priority}</span>
                      </td>
                      <td style={{ padding: '11px 18px', textAlign: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: s.c, background: s.bg, padding: '3px 10px', borderRadius: 20 }}>{i.status}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {/* TAB: รายจ่าย */}
          {tab === 'expenses' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F7F9FB', textAlign: 'left' }}>
                  <th style={{ ...th, padding: '10px 18px' }}>วันที่</th>
                  <th style={{ ...th, padding: '10px 12px' }}>รายการ</th>
                  <th style={{ ...th, padding: '10px 12px' }}>หมวด</th>
                  <th style={{ ...th, padding: '10px 12px' }}>ผู้ขาย/ผู้รับ</th>
                  <th style={{ ...th, padding: '10px 18px', textAlign: 'right' }}>จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {houseExp.map((e, i) => {
                  const cs = catStyle(e.cat)
                  return (
                    <tr key={i} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6' }}>
                      <td className="num" style={{ padding: '10px 18px', color: '#5C6770' }}>{e.date}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 500 }}>{e.item}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: 11, fontWeight: 500, color: cs.c, background: cs.bg, padding: '2px 9px', borderRadius: 20 }}>{e.cat}</span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#5C6770' }}>{e.vendor}</td>
                      <td className="num" style={{ padding: '10px 18px', textAlign: 'right', fontWeight: 600 }}>{baht(e.amount)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #E1E5EA', background: '#F7F9FB' }}>
                  <td colSpan={4} style={{ padding: '11px 18px', fontWeight: 600, color: '#5C6770' }}>รวมรายจ่าย</td>
                  <td className="num" style={{ padding: '11px 18px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: '#C24036' }}>{baht(expTotal)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
