import { useEffect, useState } from 'react'
import { api } from '../api'

interface ExportKind { id: string; label: string; count: number }

const KIND_META: Record<string, { icon: string; note: string; menu: string }> = {
  sales: { icon: '🧾', note: 'ใบแจ้งหนี้ / ใบเสร็จ พร้อมภาษีขาย 7%', menu: 'Express: ขาย → นำเข้าเอกสารขาย / รายงานภาษีขาย' },
  purchase: { icon: '📦', note: 'ใบสั่งซื้อ/รายจ่าย แยกมูลค่าก่อนภาษี + ภาษีซื้อ 7%', menu: 'Express: ซื้อ → นำเข้าเอกสารซื้อ / รายงานภาษีซื้อ' },
  wht: { icon: '✂️', note: 'รายการหัก ณ ที่จ่าย ภงด.3 / ภงด.53', menu: 'Express: การเงิน → ภาษีหัก ณ ที่จ่าย' },
  payroll: { icon: '💰', note: 'เงินเดือน + ประกันสังคม + ภาษี ภงด.1 + เลขบัญชีธนาคาร', menu: 'Express: เงินเดือน / นำเข้าข้อมูลพนักงาน' },
}

export default function ExpressExport() {
  const [kinds, setKinds] = useState<ExportKind[]>([])
  const [busy, setBusy] = useState('')

  useEffect(() => { api.get<ExportKind[]>('/export/express').then(setKinds).catch(() => setKinds([])) }, [])

  const download = async (id: string) => {
    setBusy(id)
    try { await api.download('/export/express/' + id + '/download') }
    catch (e) { alert((e as Error).message) } finally { setBusy('') }
  }
  const downloadAll = async () => {
    for (const k of kinds) { setBusy(k.id); try { await api.download('/export/express/' + k.id + '/download') } catch { /* skip */ } }
    setBusy('')
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 14, padding: '18px 20px' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1C2730' }}>ส่งออกบัญชีเข้าโปรแกรม Express</div>
        <div style={{ fontSize: 13, color: '#5C6770', marginTop: 6, lineHeight: 1.7 }}>
          ดาวน์โหลดข้อมูลจาก PPSD เป็นไฟล์ CSV (เปิดด้วย Excel ได้ ภาษาไทยไม่เพี้ยน) เพื่อให้บัญชี <b>นำเข้า Express ทีเดียว ไม่ต้องคีย์ซ้ำ</b><br />
          ไฟล์จัดคอลัมน์ตามมาตรฐานบัญชีไทย (วันที่ · เลขที่เอกสาร · คู่ค้า · เลขผู้เสียภาษี · มูลค่าก่อนภาษี · ภาษี · รวม) — บัญชีตรวจแล้วนำเข้าตามเมนูของ Express ได้เลย
        </div>
        <div style={{ marginTop: 12 }}>
          <button onClick={downloadAll} disabled={!!busy} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '10px 18px', cursor: 'pointer' }}>{busy ? 'กำลังดาวน์โหลด…' : '⬇ ดาวน์โหลดทั้งหมด'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
        {kinds.map((k) => {
          const m = KIND_META[k.id] || { icon: '📄', note: '', menu: '' }
          return (
            <div key={k.id} style={{ background: '#fff', border: '1px solid #E1E5EA', borderRadius: 13, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{m.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1C2730' }}>{k.label}</div>
                  <div style={{ fontSize: 11.5, color: '#94A0A8' }}>{m.note}</div>
                </div>
                <span className="num" style={{ fontSize: 12, fontWeight: 600, color: k.count ? '#30506A' : '#94A0A8', background: k.count ? '#E9EFF3' : '#F3F5F7', padding: '3px 10px', borderRadius: 20 }}>{k.count} รายการ</span>
              </div>
              <div style={{ fontSize: 11, color: '#B7791F', background: '#FBF6EC', borderRadius: 7, padding: '6px 9px' }}>นำเข้าที่ → {m.menu}</div>
              <button onClick={() => download(k.id)} disabled={busy === k.id || k.count === 0} className="hov-f3f5f7" style={{ alignSelf: 'flex-start', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: k.count === 0 ? '#B4BCC3' : '#30506A', background: '#fff', border: '1px solid ' + (k.count === 0 ? '#E1E5EA' : '#D2DAE1'), borderRadius: 8, padding: '7px 14px', cursor: k.count === 0 ? 'not-allowed' : 'pointer' }}>{busy === k.id ? 'กำลังดาวน์โหลด…' : '⬇ ดาวน์โหลด CSV'}</button>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 11.5, color: '#94A0A8', lineHeight: 1.7, padding: '0 4px' }}>
        หมายเหตุ: Express เป็นโปรแกรมเดสก์ท็อป การเชื่อมทำผ่านการนำเข้าไฟล์ (ไม่ใช่เชื่อมสด) — ไฟล์นี้เป็น CSV มาตรฐาน
        หากรูปแบบนำเข้าของ Express เวอร์ชันที่ใช้ต้องการคอลัมน์เฉพาะ ส่งรูปแบบมาได้ เดี๋ยวปรับให้ตรงเป๊ะนำเข้าอัตโนมัติได้เลย
      </div>
    </div>
  )
}
