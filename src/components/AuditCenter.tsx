import { useEffect, useState } from 'react'
import { api } from '../api'
import { baht } from '../data'
import { useApp } from '../store'

interface Flag { sev: 'high' | 'med'; type: string; key: string; title: string; detail: string; ref: string; acked: boolean; ackBy?: string; ackNote?: string }
interface Recon { label: string; a: string; av: number; b: string; bv: number; diff: number; ok: boolean }
interface AuditRow { id: number; ts: string; user: string; action: string; detail: string }
type Controls = Record<string, number | boolean>

const CTRL_LABELS: Record<string, string> = {
  approvers_required: 'จำนวนผู้อนุมัติเอกสาร (จัดซื้อ/จ่ายเงิน) 1–3 คน',
  overprice_warn_pct: 'เตือนเมื่อราคาต่อหน่วยสูงกว่าราคากลางเกิน (%) · 0 = ปิด',
  receipt_price_tol_pct: 'ตรวจรับของ: ราคา PO กับใบส่งของต่างกันได้ไม่เกิน (%)',
  block_self_approve: 'ห้ามอนุมัติใบขอซื้อที่ตัวเองเป็นผู้ขอ',
  two_step_above: 'ยอด PR ที่ต้องอนุมัติ 2 ชั้น (บาท)',
  quote_required_above: 'ยอด PO ที่ต้องมีใบเทียบราคา (บาท)',
  quote_min: 'จำนวนใบเทียบราคาขั้นต่ำ',
  split_threshold: 'ยอดรวมที่ถือว่าน่าสงสัยแตกใบ (บาท)',
  split_window_days: 'ช่วงวันตรวจแตกใบ (วัน)',
  near_threshold_pct: 'ยอดใกล้เพดาน (% ของเพดาน)',
  dup_window_days: 'ช่วงวันตรวจเอกสารซ้ำ (วัน)',
  require_acceptance: 'บังคับตรวจรับงวดงานให้ผ่านก่อน ถึงเก็บเงินงวด (ฝั่งลูกค้า) ได้',
  enforce_po_over_pr: 'บล็อกจริง: ห้ามออก PO เกินยอดที่อนุมัติใน PR',
  enforce_quote: 'บล็อกจริง: PO ยอดสูงต้องมีใบเทียบราคาครบ + เลือกผู้ขายก่อน',
  enforce_split: 'บล็อกจริง: สงสัยแตกใบเลี่ยงเกณฑ์ (ปิดไว้ถ้าซื้อหลายใบจากเจ้าเดียวเป็นปกติ)',
  block_dup_pay: 'บล็อกจริง: จ่ายเงินซ้ำ (ผู้รับ + ยอดเท่ากัน)',
  enforce_approval_flow: 'บล็อกจริง: ต้องอนุมัติ PR ครบก่อนออก PO และอนุมัติ PO ครบก่อนตรวจรับของ',
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #E1E5EA', borderRadius: 13, overflow: 'hidden' }
const th: React.CSSProperties = { padding: '9px 14px', fontWeight: 600, color: '#5C6770', fontSize: 12, textAlign: 'left' }
const td: React.CSSProperties = { padding: '10px 14px', fontSize: 13 }

export default function AuditCenter() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
  const isManager = !!user?.isManager // เข้าได้เฉพาะผู้จัดการ (และผู้ดูแล)
  const [flags, setFlags] = useState<Flag[]>([])
  const [recon, setRecon] = useState<Recon[]>([])
  const [counts, setCounts] = useState<{ high: number; med: number }>({ high: 0, med: 0 })
  const [ctrl, setCtrl] = useState<Controls | null>(null)
  const [log, setLog] = useState<AuditRow[]>([])
  const [tab, setTab] = useState<'flags' | 'reconcile' | 'log' | 'rules'>('flags')
  const [showAcked, setShowAcked] = useState(false)
  const [denied, setDenied] = useState(false)
  // ต้องยืนยัน PIN ก่อนเข้า
  const [unlocked, setUnlocked] = useState(false)
  const [pin, setPin] = useState('')
  const [pinErr, setPinErr] = useState('')
  const [checking, setChecking] = useState(false)

  // งวดงานข้อมูลแย้ง (สถานะเก็บแล้วแต่ยอดไม่ครบ) — ให้คนยืนยันความจริงแล้วระบบซ่อมให้
  interface FixRow { id: number; house_code: string; house?: string; no: number; detail: string; amount: number; paid?: number; status: string; side?: string }
  const [fixRows, setFixRows] = useState<FixRow[]>([])
  const fixInst = async (r: FixRow, action: 'confirm' | 'reset') => {
    const q = action === 'confirm'
      ? `ยืนยันว่างวดนี้เก็บ/จ่ายเงินจริงแล้ว ${baht(r.amount)}?\nระบบจะตั้งยอดเต็ม + ลงบัญชีให้ (วันที่วันนี้)`
      : 'ยืนยันว่ายังไม่ได้เก็บ/จ่ายจริง? สถานะจะถูกแก้กลับตามยอดเงินในระบบ'
    if (!window.confirm(q)) return
    try { await api.post(`/repair/installments/${r.id}`, { action }); load() } catch (e) { window.alert((e as Error).message) }
  }
  const load = () => {
    api.get<{ flags: Flag[]; reconcile: Recon[]; counts: { high: number; med: number } }>('/audit-center')
      .then((r) => { setFlags(r.flags); setRecon(r.reconcile); setCounts(r.counts) })
      .catch(() => setDenied(true))
    api.get<Controls>('/controls').then(setCtrl).catch(() => {})
    api.get<AuditRow[]>('/audit-log').then(setLog).catch(() => {})
    api.get<FixRow[]>('/repair/installments').then(setFixRows).catch(() => setFixRows([]))
  }
  useEffect(() => { if (unlocked) load() /* eslint-disable-next-line */ }, [unlocked])

  const verify = async () => {
    if (!/^\d{4}$/.test(pin)) { setPinErr('กรอก PIN 4 หลัก'); return }
    setChecking(true); setPinErr('')
    try { await api.post('/verify-pin', { pin }); setUnlocked(true) } catch (e) { setPinErr((e as Error).message) } finally { setChecking(false) }
  }

  const ack = async (key: string) => {
    const note = window.prompt('บันทึกเหตุผล/ผลการตรวจสอบ (ถ้ามี):', '') ?? ''
    await api.post('/audit-center/ack', { key, note })
    load()
  }
  const saveCtrl = async () => { if (ctrl) { await api.put('/controls', ctrl); alert('บันทึกกติกาแล้ว'); load() } }

  // เข้าได้เฉพาะผู้จัดการ
  if (!isManager) return <div style={{ maxWidth: 1320, margin: '0 auto', ...card, padding: 40, textAlign: 'center' }}>หน้าตรวจสอบเปิดให้เฉพาะ <b>ผู้จัดการ</b> เท่านั้น</div>

  // ล็อกด้วย PIN ก่อนเข้า
  if (!unlocked) return (
    <div style={{ maxWidth: 420, margin: '48px auto', ...card, padding: 34, textAlign: 'center' }}>
      <div style={{ width: 52, height: 52, borderRadius: 13, background: '#F3F5F7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#30506A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#1C2730' }}>ยืนยันตัวตนก่อนเข้าหน้าตรวจสอบ</div>
      <div style={{ fontSize: 13, color: '#5C6770', marginTop: 6, marginBottom: 16 }}>กรุณาใส่ PIN ของคุณ ({user?.name})</div>
      <input type="password" inputMode="numeric" maxLength={4} value={pin} autoFocus
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && verify()}
        placeholder="••••" style={{ width: 160, textAlign: 'center', letterSpacing: 8, fontSize: 22, fontFamily: 'inherit', color: '#1C2730', border: '1px solid #D2DAE1', borderRadius: 10, padding: '10px 12px', outline: 'none' }} />
      {pinErr && <div style={{ fontSize: 12.5, color: '#C24036', marginTop: 10 }}>{pinErr}</div>}
      <div><button onClick={verify} disabled={checking} className="btn-primary" style={{ marginTop: 16, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 10, padding: '10px 28px', cursor: 'pointer' }}>{checking ? 'กำลังตรวจสอบ…' : 'เข้าสู่หน้าตรวจสอบ'}</button></div>
    </div>
  )

  if (denied) return <div style={{ maxWidth: 1320, margin: '0 auto', ...card, padding: 40, textAlign: 'center', color: '#94A0A8' }}>ไม่มีสิทธิ์เข้าถึงศูนย์ตรวจสอบ</div>

  const shownFlags = flags.filter((f) => showAcked || !f.acked)
  const sevPill = (s: string) => s === 'high'
    ? { c: '#C24036', bg: '#FBEEEC', t: 'เสี่ยงสูง' }
    : { c: '#B7791F', bg: '#F6ECD6', t: 'ควรตรวจ' }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }} className="print-area page-print">
      {/* summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        <div style={{ ...card, padding: '15px 18px' }}><div style={{ fontSize: 12.5, color: '#5C6770' }}>สัญญาณเสี่ยงสูง (ยังไม่เคลียร์)</div><div className="num" style={{ fontSize: 26, fontWeight: 700, marginTop: 5, color: counts.high ? '#C24036' : '#2E7D55' }}>{counts.high}</div></div>
        <div style={{ ...card, padding: '15px 18px' }}><div style={{ fontSize: 12.5, color: '#5C6770' }}>ควรตรวจสอบ</div><div className="num" style={{ fontSize: 26, fontWeight: 700, marginTop: 5, color: counts.med ? '#B7791F' : '#2E7D55' }}>{counts.med}</div></div>
        <div style={{ ...card, padding: '15px 18px' }}><div style={{ fontSize: 12.5, color: '#5C6770' }}>กระทบยอดไม่ตรง</div><div className="num" style={{ fontSize: 26, fontWeight: 700, marginTop: 5, color: recon.some((r) => !r.ok) ? '#C24036' : '#2E7D55' }}>{recon.filter((r) => !r.ok).length}</div></div>
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', gap: 2, background: '#fff', border: '1px solid #E1E5EA', borderRadius: 11, padding: '6px 8px', flexWrap: 'wrap' }} className="no-print">
        {([['flags', 'สัญญาณเตือน'], ['reconcile', 'กระทบยอด'], ['log', 'ประวัติการใช้งาน'], ['rules', 'กติกาควบคุม']] as const).map(([id, label]) => (
          <div key={id} onClick={() => setTab(id)} style={{ fontSize: 13, fontWeight: tab === id ? 600 : 500, color: tab === id ? '#fff' : '#5C6770', background: tab === id ? '#30506A' : 'transparent', padding: '7px 14px', borderRadius: 7, cursor: 'pointer' }}>{label}</div>
        ))}
        <button onClick={() => window.print()} className="hov-f3f5f7" style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 12.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>🖨 พิมพ์รายงานตรวจสอบ</button>
      </div>

      {/* FLAGS */}
      {tab === 'flags' && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid #EEF1F4' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>สัญญาณเตือนความผิดปกติ</span>
            <label style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5C6770', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={showAcked} onChange={(e) => setShowAcked(e.target.checked)} /> แสดงที่เคลียร์แล้วด้วย
            </label>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#F7F9FB' }}><th style={{ ...th, paddingLeft: 18 }}>ระดับ</th><th style={th}>รายการ</th><th style={th}>รายละเอียด</th><th style={th}>อ้างอิง</th><th style={{ ...th, textAlign: 'center' }}>จัดการ</th></tr></thead>
            <tbody>
              {shownFlags.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#2E7D55', fontSize: 13 }}>✓ ไม่พบความผิดปกติ</td></tr>}
              {shownFlags.map((f) => {
                const p = sevPill(f.sev)
                return (
                  <tr key={f.key} className="hov-fafbfc" style={{ borderTop: '1px solid #F1F4F6', opacity: f.acked ? 0.55 : 1 }}>
                    <td style={{ ...td, paddingLeft: 18 }}><span style={{ fontSize: 11, fontWeight: 600, color: p.c, background: p.bg, padding: '2px 10px', borderRadius: 20 }}>{p.t}</span></td>
                    <td style={{ ...td, fontWeight: 500 }}>{f.title}</td>
                    <td style={{ ...td, color: '#5C6770' }}>{f.detail}</td>
                    <td style={{ ...td, color: '#94A0A8', fontFamily: 'monospace', fontSize: 11.5 }}>{f.ref}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {f.acked ? <span title={f.ackNote} style={{ fontSize: 11.5, color: '#2E7D55' }}>✓ เคลียร์โดย {f.ackBy}</span>
                        : <button onClick={() => ack(f.key)} className="no-print" style={{ fontFamily: 'inherit', fontSize: 11.5, color: '#30506A', background: '#fff', border: '1px solid #D2DAE1', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>รับทราบ/เคลียร์</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* RECONCILE */}
      {tab === 'reconcile' && (
        <div style={card}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #EEF1F4', fontSize: 14, fontWeight: 600 }}>กระทบยอด (Reconciliation)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#F7F9FB' }}><th style={{ ...th, paddingLeft: 18 }}>รายการ</th><th style={{ ...th, textAlign: 'right' }}>ยอดฝั่ง A</th><th style={{ ...th, textAlign: 'right' }}>ยอดฝั่ง B</th><th style={{ ...th, textAlign: 'right' }}>ผลต่าง</th><th style={{ ...th, textAlign: 'center' }}>ผล</th></tr></thead>
            <tbody>
              {recon.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td style={{ ...td, paddingLeft: 18, fontWeight: 500 }}>{r.label}</td>
                  <td className="num" style={{ ...td, textAlign: 'right' }}>{baht(r.av)}<div style={{ fontSize: 10.5, color: '#94A0A8' }}>{r.a}</div></td>
                  <td className="num" style={{ ...td, textAlign: 'right' }}>{baht(r.bv)}<div style={{ fontSize: 10.5, color: '#94A0A8' }}>{r.b}</div></td>
                  <td className="num" style={{ ...td, textAlign: 'right', fontWeight: 600, color: r.ok ? '#2E7D55' : '#C24036' }}>{baht(r.diff)}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{r.ok ? <span style={{ color: '#2E7D55', fontWeight: 600 }}>✓ ตรง</span> : <span style={{ color: '#C24036', fontWeight: 600 }}>✕ ไม่ตรง</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '10px 18px', fontSize: 11.5, color: '#94A0A8' }}>ยอดควรตรงกันทั้งสองฝั่ง ถ้าไม่ตรงแปลว่ามีการแก้ข้อมูลนอกระบบงวดงาน/PO ควรตรวจสอบ</div>

          {/* ซ่อมข้อมูลแย้ง: งวดงานที่สถานะบอก "เก็บ/จ่ายแล้ว" แต่ยอดเงินจริงยังไม่ครบ (ข้อมูลยุคเก่า) */}
          {fixRows.length > 0 && (
            <div style={{ borderTop: '8px solid #F3F5F7' }}>
              <div style={{ padding: '12px 18px', borderBottom: '1px solid #EEF1F4', fontSize: 13.5, fontWeight: 600, color: '#C24036' }}>
                🔧 งวดงานข้อมูลแย้ง {fixRows.length} งวด — สถานะบอกเก็บ/จ่ายแล้ว แต่ยอดเงินในระบบยังไม่ครบ
                <span style={{ fontWeight: 400, color: '#94A0A8', fontSize: 11.5, marginLeft: 8 }}>เลือกให้ระบบว่าความจริงคืออะไร แล้วยอดบ้าน/บัญชีจะถูกซ่อมตาม</span>
              </div>
              {fixRows.map((r) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', borderTop: '1px solid #F1F4F6', fontSize: 12.5, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, minWidth: 160 }}>{r.house || r.house_code} · งวด {r.no}</span>
                  <span style={{ color: '#5C6770', flex: 1, minWidth: 120 }}>{r.detail}</span>
                  <span style={{ fontSize: 11, color: '#C24036', background: '#FBEEEC', padding: '2px 9px', borderRadius: 20 }}>{r.status}</span>
                  <span className="num" style={{ color: '#5C6770' }}>ยอด {baht(r.amount)} · ในระบบ {baht(r.paid || 0)}</span>
                  <button onClick={() => fixInst(r, 'confirm')} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#fff', background: '#2E7D55', border: 'none', borderRadius: 7, padding: '5px 11px', cursor: 'pointer' }} title="เงินเข้า/ออกจริงแล้ว — ตั้งยอดเต็ม + ลงบัญชีให้">✓ เก็บ/จ่ายจริงแล้ว</button>
                  <button onClick={() => fixInst(r, 'reset')} className="hov-f3f5f7" style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: '#C24036', background: '#fff', border: '1px solid #E7CDC9', borderRadius: 7, padding: '5px 11px', cursor: 'pointer' }} title="ยังไม่มีเงินจริง — แก้สถานะกลับตามยอด">ยังไม่เก็บ</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* LOG */}
      {tab === 'log' && (
        <div style={card}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #EEF1F4', fontSize: 14, fontWeight: 600 }}>ประวัติการใช้งาน (Audit Log) — ล่าสุด 300 รายการ</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#F7F9FB' }}><th style={{ ...th, paddingLeft: 18 }}>เวลา</th><th style={th}>ผู้ใช้</th><th style={th}>การกระทำ</th><th style={th}>รายละเอียด</th></tr></thead>
            <tbody>
              {log.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid #F1F4F6' }}>
                  <td style={{ ...td, color: '#94A0A8', fontSize: 11.5, whiteSpace: 'nowrap' }}>{new Date(r.ts).toLocaleString('th-TH')}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{r.user}</td>
                  <td style={{ ...td, color: '#30506A' }}>{r.action}</td>
                  <td style={{ ...td, color: '#5C6770' }}>{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* RULES */}
      {tab === 'rules' && ctrl && (
        <div style={{ ...card, padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>กติกาควบคุมภายใน</div>
          <div style={{ fontSize: 12, color: '#94A0A8', marginBottom: 14 }}>{isAdmin ? 'ปรับค่าแล้วกด “บันทึกกติกา”' : 'ดูได้อย่างเดียว — แก้ไขได้เฉพาะผู้ดูแลระบบ'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
            {Object.keys(CTRL_LABELS).map((k) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, fontSize: 13, color: '#3C4750' }}>{CTRL_LABELS[k]}</span>
                {typeof ctrl[k] === 'boolean'
                  ? <input type="checkbox" disabled={!isAdmin} checked={ctrl[k] as boolean} onChange={(e) => setCtrl({ ...ctrl, [k]: e.target.checked })} />
                  : <input type="number" disabled={!isAdmin} value={String(ctrl[k])} onChange={(e) => setCtrl({ ...ctrl, [k]: Number(e.target.value) })} style={{ width: 130, fontFamily: 'inherit', fontSize: 13, textAlign: 'right', border: '1px solid #D2DAE1', borderRadius: 8, padding: '7px 10px', outline: 'none' }} />}
              </div>
            ))}
          </div>
          {isAdmin && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}><button onClick={saveCtrl} className="btn-primary" style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#fff', background: '#30506A', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer' }}>บันทึกกติกา</button></div>}
        </div>
      )}
    </div>
  )
}
