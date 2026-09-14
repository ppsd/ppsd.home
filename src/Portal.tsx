import { useEffect, useState } from 'react'

// ===== Customer Portal: หน้าลูกค้า (ไม่ต้องล็อกอิน) เปิดจากลิงก์ส่วนตัว <url>/portal/<token> ที่ส่งให้ทาง LINE =====
interface PInst { no: number; detail: string; amount: number; paid: number; due: string; status: string }
interface PCase { case_no: string | null; title: string; status: string; date: string; open: boolean; assignee: string }
interface PHouse { code: string; name: string; project: string; status: string; pct: number; deliver_date: string; manager: string; photo: string | null; photos: string[]; qc: { phases: { id: string; name: string; passed: boolean; fixing: boolean; started: boolean }[]; done: number; total: number; current: { id: string; name: string } | null }; installments: PInst[]; inst_paid: number; inst_total: number; next_due: PInst | null; cases: PCase[]; warranty: { start: string | null; delivered: boolean; items: { name: string; years: number; expires: string | null; days_left: number | null; active: boolean }[] } | null; last_qc: { date: string; type: string; status: string } | null }
interface PData { customer: { name: string; code: string; referral_code: string }; houses: PHouse[]; docs: { type: string; no: string; date: string; total: number; status: string }[]; contact: { phone: string; line: string }; company: string }

const baht = (n: number) => (Number(n) || 0).toLocaleString('en-US')
const card: React.CSSProperties = { background: '#fff', borderRadius: 14, boxShadow: '0 2px 10px rgba(20,30,40,.06)', padding: 16, marginBottom: 12 }

export default function Portal() {
  const token = (window.location.pathname.match(/\/portal\/([A-Za-z0-9]+)/) || window.location.hash.match(/portal\/([A-Za-z0-9]+)/))?.[1] || ''
  const [d, setD] = useState<PData | null>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<'progress' | 'money' | 'service' | 'docs'>('progress')
  const [cf, setCf] = useState({ house_code: '', title: '', note: '' })
  const [sent, setSent] = useState('')
  const load = () => fetch('/api/pub/portal/' + token).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'ลิงก์ไม่ถูกต้อง'); return r.json() }).then(setD).catch((e) => setErr(e.message))
  useEffect(() => { if (token) load(); else setErr('ไม่พบลิงก์') /* eslint-disable-next-line */ }, [token])
  const submitCase = async () => {
    if (!cf.title.trim()) { setSent('กรุณาระบุเรื่องที่ต้องการแจ้ง'); return }
    try {
      const r = await fetch('/api/pub/portal/' + token + '/case', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cf) })
      const j = await r.json(); if (!r.ok) throw new Error(j.error || 'ส่งไม่สำเร็จ')
      setSent(`✅ รับเรื่องแล้ว เลขเคส ${j.case_no} — ทีมงานจะติดต่อกลับภายใน ${j.sla_hours} ชม.`); setCf({ house_code: '', title: '', note: '' }); load()
    } catch (e) { setSent((e as Error).message) }
  }
  if (err) return <div style={{ fontFamily: 'system-ui, sans-serif', padding: 40, textAlign: 'center', color: '#C24036' }}>{err}<div style={{ fontSize: 13, color: '#5C6770', marginTop: 8 }}>ขอลิงก์ใหม่ได้จากทีมงาน PPSD ค่ะ</div></div>
  if (!d) return <div style={{ fontFamily: 'system-ui, sans-serif', padding: 40, textAlign: 'center', color: '#94A0A8' }}>กำลังโหลด…</div>
  const tabs = [['progress', '🏠 ความคืบหน้า'], ['money', '💰 งวดเงิน'], ['service', '🛠 แจ้งซ่อม / ประกัน'], ['docs', '📄 เอกสาร']] as const
  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', background: '#F3F5F7', minHeight: '100vh', color: '#1C2730' }}>
      <div style={{ background: '#30506A', color: '#fff', padding: '18px 16px 14px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ fontSize: 12, opacity: .8 }}>{d.company}</div>
          <div style={{ fontSize: 19, fontWeight: 700 }}>สวัสดีค่ะ {d.customer.name}</div>
          <div style={{ fontSize: 12, opacity: .85, marginTop: 2 }}>บ้านของคุณ · อัปเดตล่าสุดตอนนี้ · รหัสลูกค้า {d.customer.code}</div>
        </div>
      </div>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '12px 12px 40px' }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12 }}>
          {tabs.map(([id, l]) => <button key={id} onClick={() => setTab(id)} style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', padding: '8px 12px', borderRadius: 20, border: '1px solid ' + (tab === id ? '#30506A' : '#D2DAE1'), background: tab === id ? '#30506A' : '#fff', color: tab === id ? '#fff' : '#30506A', cursor: 'pointer' }}>{l}</button>)}
        </div>
        {d.houses.length === 0 && <div style={card}>ยังไม่มีบ้านที่ผูกกับบัญชีของคุณ — ติดต่อทีมงานได้เลยค่ะ</div>}

        {tab === 'progress' && d.houses.map((h) => {
          const pct = h.qc.total ? Math.round((h.qc.done / h.qc.total) * 100) : h.pct || 0
          return (
            <div key={h.code} style={card}>
              {h.photo && <img src={h.photo} alt="" style={{ width: '100%', borderRadius: 10, marginBottom: 10, maxHeight: 220, objectFit: 'cover' }} />}
              <div style={{ fontSize: 16, fontWeight: 700 }}>{h.name} <span style={{ fontSize: 12, color: '#5C6770', fontWeight: 400 }}>{h.code}{h.project ? ' · ' + h.project : ''}</span></div>
              <div style={{ fontSize: 12.5, color: '#5C6770' }}>สถานะ {h.status}{h.deliver_date ? ` · กำหนดส่งมอบ ${h.deliver_date}` : ''}{h.manager ? ` · ผู้ดูแลงาน ${h.manager}` : ''}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10 }}><span style={{ fontSize: 30, fontWeight: 800, color: '#2E7D55' }}>{pct}%</span><span style={{ fontSize: 12.5, color: '#5C6770' }}>ผ่านการตรวจคุณภาพ {h.qc.done}/{h.qc.total} ขั้นตอน</span></div>
              <div style={{ height: 10, background: '#EEF1F4', borderRadius: 20, overflow: 'hidden', margin: '6px 0 10px' }}><div style={{ width: pct + '%', height: '100%', background: 'linear-gradient(90deg,#2E7D55,#5DBB86)' }} /></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {h.qc.phases.map((p) => <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><span style={{ width: 22, height: 22, borderRadius: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: p.passed ? '#2E7D55' : p.fixing ? '#C24036' : p.started ? '#C0852C' : '#E1E5EA', color: p.passed || p.fixing || p.started ? '#fff' : '#94A0A8' }}>{p.passed ? '✓' : p.id}</span><span style={{ color: p.passed ? '#1C2730' : p.started ? '#1C2730' : '#94A0A8' }}>{p.name}</span><span style={{ marginLeft: 'auto', fontSize: 11, color: p.passed ? '#2E7D55' : p.fixing ? '#C24036' : p.started ? '#C0852C' : '#B9C6D0' }}>{p.passed ? 'ผ่านแล้ว' : p.fixing ? 'กำลังแก้ไข' : p.started ? 'กำลังทำ' : 'ยังไม่เริ่ม'}</span></div>)}
              </div>
              {h.last_qc && <div style={{ fontSize: 12, color: '#5C6770', marginTop: 8 }}>🔍 ตรวจงานล่าสุด: {h.last_qc.type} ({h.last_qc.status}) {h.last_qc.date}</div>}
              {h.photos.length > 0 && <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 10 }}>{h.photos.map((p, i) => <a key={i} href={p} target="_blank" rel="noreferrer"><img src={p} alt="" style={{ height: 96, borderRadius: 8, border: '1px solid #E1E5EA' }} /></a>)}</div>}
            </div>
          )
        })}

        {tab === 'money' && d.houses.map((h) => (
          <div key={h.code} style={card}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{h.name}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 6 }}><span>ชำระแล้ว</span><b>{baht(h.inst_paid)} / {baht(h.inst_total)} บาท</b></div>
            <div style={{ height: 8, background: '#EEF1F4', borderRadius: 20, overflow: 'hidden', margin: '5px 0 10px' }}><div style={{ width: (h.inst_total ? (h.inst_paid / h.inst_total) * 100 : 0) + '%', height: '100%', background: '#30506A' }} /></div>
            {h.next_due && <div style={{ background: '#FFF8E8', border: '1px solid #F1DFB5', borderRadius: 10, padding: '8px 12px', fontSize: 13, marginBottom: 8 }}>💰 งวดถัดไป: งวด {h.next_due.no} {h.next_due.detail} <b>{baht(h.next_due.amount - (h.next_due.paid || 0))} บาท</b>{h.next_due.due ? ` · ครบกำหนด ${h.next_due.due}` : ''}</div>}
            {h.installments.length === 0 && <div style={{ fontSize: 12.5, color: '#94A0A8' }}>ยังไม่มีตารางงวด</div>}
            {h.installments.map((i) => { const p = i.paid || 0; return <div key={i.no} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '6px 0', borderTop: '1px solid #F1F4F6' }}><span>{p >= i.amount ? '✅' : p > 0 ? '🟡' : '⬜'}</span><span style={{ flex: 1 }}>งวด {i.no} {i.detail}<div style={{ fontSize: 11, color: '#94A0A8' }}>{i.due ? 'ครบ ' + i.due : ''}{p > 0 && p < i.amount ? ` · จ่ายแล้ว ${baht(p)}` : ''}</div></span><b>{baht(i.amount)}</b></div> })}
          </div>
        ))}

        {tab === 'service' && (
          <>
            <div style={card}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>🛠 แจ้งซ่อม / แจ้งปัญหา</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {d.houses.length > 1 && <select value={cf.house_code} onChange={(e) => setCf({ ...cf, house_code: e.target.value })} style={{ fontFamily: 'inherit', fontSize: 14, padding: 10, borderRadius: 10, border: '1px solid #D2DAE1' }}><option value="">— เลือกบ้าน —</option>{d.houses.map((h) => <option key={h.code} value={h.code}>{h.name}</option>)}</select>}
                <input value={cf.title} onChange={(e) => setCf({ ...cf, title: e.target.value })} placeholder="เรื่องที่พบ เช่น ห้องน้ำชั้น 2 น้ำรั่ว" style={{ fontFamily: 'inherit', fontSize: 14, padding: 10, borderRadius: 10, border: '1px solid #D2DAE1' }} />
                <textarea value={cf.note} onChange={(e) => setCf({ ...cf, note: e.target.value })} placeholder="รายละเอียดเพิ่มเติม / เวลาที่สะดวกให้เข้าดู" style={{ fontFamily: 'inherit', fontSize: 14, padding: 10, borderRadius: 10, border: '1px solid #D2DAE1', minHeight: 70 }} />
                <button onClick={submitCase} style={{ fontFamily: 'inherit', fontSize: 15, fontWeight: 700, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 12, padding: 12, cursor: 'pointer' }}>ส่งเรื่อง</button>
                {sent && <div style={{ fontSize: 13, color: sent.startsWith('✅') ? '#2E7D55' : '#C24036' }}>{sent}</div>}
                <div style={{ fontSize: 12, color: '#94A0A8' }}>หรือพิมพ์ "แจ้งซ่อม …" พร้อมส่งรูปในไลน์ของบริษัทได้เลย</div>
              </div>
            </div>
            {d.houses.map((h) => (
              <div key={h.code} style={card}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{h.name}</div>
                {h.warranty?.delivered ? (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>🛡 การรับประกัน (ตั้งแต่ส่งมอบ {h.warranty.start})</div>
                    {h.warranty.items.map((w) => <div key={w.name} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '4px 0' }}><span>{w.active ? '🟢' : '⚪'}</span><span style={{ flex: 1 }}>{w.name} <span style={{ color: '#94A0A8' }}>({w.years} ปี)</span></span><span style={{ color: w.active ? (w.days_left != null && w.days_left <= 30 ? '#C0852C' : '#2E7D55') : '#94A0A8', fontSize: 12 }}>{w.active ? `เหลือ ${w.days_left} วัน` : 'หมดแล้ว'}</span></div>)}
                  </div>
                ) : <div style={{ fontSize: 12.5, color: '#94A0A8', marginTop: 4 }}>การรับประกันเริ่มนับตั้งแต่วันส่งมอบบ้าน</div>}
                <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 10 }}>เรื่องที่แจ้งไว้</div>
                {h.cases.length === 0 && <div style={{ fontSize: 12.5, color: '#94A0A8' }}>ยังไม่มี</div>}
                {h.cases.map((c, i) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '5px 0', borderTop: '1px solid #F1F4F6' }}><span>{c.open ? '🟡' : '✅'}</span><span style={{ flex: 1 }}>{c.title}<div style={{ fontSize: 11, color: '#94A0A8' }}>{c.case_no || ''} · {c.date}{c.assignee ? ' · ' + c.assignee : ''}</div></span><span style={{ fontSize: 12, color: c.open ? '#C0852C' : '#2E7D55' }}>{c.status}</span></div>)}
              </div>
            ))}
          </>
        )}

        {tab === 'docs' && (
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>📄 เอกสาร</div>
            {d.docs.length === 0 && <div style={{ fontSize: 12.5, color: '#94A0A8' }}>ยังไม่มีเอกสารในระบบ — ติดต่อทีมงานเพื่อขอสำเนาได้ค่ะ</div>}
            {d.docs.map((x, i) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '6px 0', borderTop: '1px solid #F1F4F6' }}><span style={{ flex: 1 }}>{x.type} <b>{x.no}</b><div style={{ fontSize: 11, color: '#94A0A8' }}>{x.date} · {x.status}</div></span><b>{baht(x.total)}</b></div>)}
          </div>
        )}

        <div style={{ ...card, background: '#E8EEF3' }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>📞 ติดต่อทีมงาน</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>{d.contact.phone ? <div>โทร <a href={'tel:' + d.contact.phone} style={{ color: '#30506A' }}>{d.contact.phone}</a></div> : null}{d.contact.line ? <div>LINE {d.contact.line}</div> : null}{!d.contact.phone && !d.contact.line ? <div style={{ color: '#5C6770' }}>ส่งข้อความในไลน์ของบริษัทได้เลยค่ะ</div> : null}</div>
          <div style={{ fontSize: 12, color: '#5C6770', marginTop: 6 }}>🤝 แนะนำเพื่อนมาสร้างบ้านกับเรา ใช้รหัส <b>{d.customer.referral_code}</b></div>
        </div>
      </div>
    </div>
  )
}
