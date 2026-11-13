/* PPSD HOME BUILDER — แกนกลาง: ตัวช่วย ที่เก็บข้อมูลตัวอย่าง ภาษา เส้นทาง ส่วนหัว ส่วนท้าย และหน้าต่างลอย */
(function (P) {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
  const fmt = n => Math.round(Number(n) || 0).toLocaleString('en-US');
  const mil = n => (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, '');
  const up100 = n => Math.ceil(n / 100) * 100;
  const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const now = new Date();
  const monthLabel = m => { const d = new Date(now.getFullYear(), now.getMonth() + m, 1); return TH_M[d.getMonth()] + ' ' + (d.getFullYear() + 543); };
  const thDate = d => { d = new Date(d); return d.getDate() + ' ' + TH_M[d.getMonth()] + ' ' + (d.getFullYear() + 543); };
  const thTime = d => { d = new Date(d); return thDate(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ' น.'; };
  const num = (id, root) => { const el = (root || document).querySelector('#' + id); return Math.max(0, Number(el && el.value) || 0); };
  /* แหล่งรูป: คีย์รูปในโฟลเดอร์ img/ หรือรูปที่อัปโหลดจากหลังบ้าน (data URL / path เต็ม) */
  const src = (k, size = '') => /^(data:|https?:|img\/|\/)/.test(String(k || '')) ? k : `img/${k}${size}.jpg`;
  const img = (k, alt, cls = '', size = '') => `<img src="${src(k, size)}" alt="${esc(alt)}" loading="lazy" decoding="async"${cls ? ` class="${cls}"` : ''}>`;
  const rimg = (k, alt, small) => `<img src="img/r/${k}${small ? '-s' : ''}.jpg" alt="${esc(alt)}" loading="lazy" decoding="async">`;

  /* ---------- ที่เก็บข้อมูลในเบราว์เซอร์ (มีสำรองในหน่วยความจำ) ---------- */
  const mem = {};
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? (k in mem ? mem[k] : d) : JSON.parse(v); } catch { return k in mem ? mem[k] : d; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { delete mem[k]; try { localStorage.removeItem(k); } catch { } }
  };

  /* ---------- ฐานข้อมูลตัวอย่าง (CRM / โครงการ / รายงาน / LINE) — ทำงานในเครื่องผู้ใช้เท่านั้น ---------- */
  const DBK = 'ppsdDemoDB.v1';
  const seed = () => ({
    leads: [
      { id: 'L-2401', at: Date.now() - 86400000 * 3, type: 'quote', source: 'เว็บไซต์ · ขอใบเสนอราคา', name: 'คุณเอ (ตัวอย่าง)', phone: '08x-xxx-1111', detail: 'แบบ PPSD-19 · Premium · มีที่ดินแล้ว', status: 'ใหม่', seg: 'A' },
      { id: 'L-2402', at: Date.now() - 86400000 * 6, type: 'fengshui', source: 'เว็บไซต์ · รับดูฮวงจุ้ย', name: 'คุณบี (ตัวอย่าง)', phone: '08x-xxx-2222', detail: 'ขอดูผังบ้านเดิมก่อนรีโนเวท', status: 'ติดต่อแล้ว', seg: 'A' },
      { id: 'L-2403', at: Date.now() - 86400000 * 9, type: 'custom', source: 'เว็บไซต์ · ออกแบบตามใจ', name: 'คุณซี (ตัวอย่าง)', phone: '08x-xxx-3333', detail: 'โมเดิร์น 2 ชั้น 4 นอน งบ 4–5 ล้าน', status: 'นัดหมาย', seg: 'A' }
    ],
    customers: [
      { id: 'C-101', name: 'ลูกค้าตัวอย่าง ก', phone: '08x-xxx-4444', seg: 'B', project: 'P-5' },
      { id: 'C-102', name: 'ลูกค้าตัวอย่าง ข', phone: '08x-xxx-5555', seg: 'B', project: 'P-3' },
      { id: 'C-103', name: 'ลูกค้าตัวอย่าง ค', phone: '08x-xxx-6666', seg: 'C', project: 'P-1' }
    ],
    projects: [
      { id: 'P-5', code: 'PPSD-6634', name: 'บ้าน Modern Classic ชั้นเดียว', customer: 'C-101', week: 9, progress: 38, stage: 'ก่อผนัง ฉาบ', status: 'ก่อสร้าง', start: Date.now() - 86400000 * 63 },
      { id: 'P-3', code: 'PPSD-6521', name: 'Home & Factory หลังคาจั่วสูง', customer: 'C-102', week: 18, progress: 61, stage: 'ฉาบภายนอก', status: 'ก่อสร้าง', start: Date.now() - 86400000 * 126 },
      { id: 'P-1', code: 'PPSD-6410', name: 'บ้านโมเดิร์นชั้นเดียว พร้อมสระว่ายน้ำ', customer: 'C-103', week: 44, progress: 100, stage: 'ส่งมอบแล้ว', status: 'หลังส่งมอบ', start: Date.now() - 86400000 * 420 }
    ],
    reports: [
      { id: 'R-1', project: 'P-5', at: Date.now() - 86400000 * 7, week: 8, progress: 33, title: 'รายงานสัปดาห์ที่ 8', summary: 'มุงหลังคาเสร็จ เริ่มก่อผนังด้านทิศเหนือ', qc: [['โครงหลังคา', 'pass'], ['แนวผนังทิศใต้', 'fix']], photos: ['h5-b'], by: 'ทีมหน้างาน' },
      { id: 'R-0', project: 'P-5', at: Date.now() - 86400000 * 21, week: 6, progress: 24, title: 'รายงานสัปดาห์ที่ 6', summary: 'ติดตั้งโครงหลังคาเหล็กครบ ตรวจรอยเชื่อมผ่าน', qc: [['รอยเชื่อมโครงหลังคา', 'pass']], photos: ['h5-a'], by: 'ทีมหน้างาน' }
    ],
    photos: [
      { id: 'F-1', project: 'P-5', src: 'img/h5-c-s.jpg', cap: 'สัปดาห์ 9 · มุงหลังคาเสร็จ', at: Date.now() - 86400000 * 2 },
      { id: 'F-2', project: 'P-5', src: 'img/h5-b-s.jpg', cap: 'สัปดาห์ 8 · โครงหลังคา', at: Date.now() - 86400000 * 8 },
      { id: 'F-3', project: 'P-5', src: 'img/h5-a-s.jpg', cap: 'สัปดาห์ 2 · เตรียมพื้นที่', at: Date.now() - 86400000 * 50 }
    ],
    docs: [
      { id: 'D-1', project: 'P-5', name: 'สัญญาก่อสร้าง (ตัวอย่าง).pdf', cat: 'สัญญา', visible: true },
      { id: 'D-2', project: 'P-5', name: 'แบบก่อสร้าง ชุดยื่นขออนุญาต (ตัวอย่าง).pdf', cat: 'แบบบ้าน', visible: true },
      { id: 'D-3', project: 'P-5', name: 'ใบอนุญาตก่อสร้าง (ตัวอย่าง).pdf', cat: 'ใบอนุญาต', visible: true },
      { id: 'D-4', project: 'P-5', name: 'ใบเสร็จงวด 1–3 (ตัวอย่าง).pdf', cat: 'การเงิน', visible: true },
      { id: 'D-5', project: 'P-5', name: 'ใบยืนยันวัสดุ (ตัวอย่าง).pdf', cat: 'สเปค', visible: false }
    ],
    appts: [
      { id: 'A-1', at: Date.now() + 86400000 * 4, project: 'P-5', topic: 'ตรวจงานโครงสร้างร่วมกับเจ้าของบ้าน', branch: 'หน้างาน', name: 'ลูกค้าตัวอย่าง ก', status: 'ยืนยันแล้ว', from: 'portal' }
    ],
    after: [
      { id: 'S-1', at: Date.now() - 86400000 * 12, project: 'P-1', issue: 'รอยแตกลายงาบริเวณผนังห้องนั่งเล่น', status: 'นัดตรวจแล้ว', name: 'ลูกค้าตัวอย่าง ค' }
    ],
    line: [
      { at: Date.now() - 86400000 * 7, to: 'C-101', seg: 'B', text: 'PPSD: รายงานความคืบหน้าสัปดาห์ที่ 8 ของบ้านคุณพร้อมแล้ว แตะเพื่อดูในบ้านของฉัน' }
    ],
    content: {},
    catalog: {},
    perms: null
  });
  const db = {
    get() { let d = store.get(DBK, null); if (!d || !d.leads) { d = seed(); store.set(DBK, d); } return d; },
    save(d) { if (!store.set(DBK, d) && Date.now() - (db._warn || 0) > 8000) { db._warn = Date.now(); toast('พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม', 'ข้อมูลล่าสุดอยู่ได้จนกว่าจะรีเฟรช ลองลบรูปเก่าในหลังบ้าน หรือใช้รูปขนาดเล็กลง (ระบบจริงเก็บไฟล์บนเซิร์ฟเวอร์)'); } },
    reset() { store.del(DBK); return db.get(); },
    add(coll, item) { const d = db.get(); item.id = item.id || (coll.slice(0, 1).toUpperCase() + '-' + Date.now().toString(36).toUpperCase()); item.at = item.at || Date.now(); d[coll].unshift(item); db.save(d); return item; },
    update(coll, id, patch) { const d = db.get(); const x = d[coll].find(y => y.id === id); if (x) Object.assign(x, patch); db.save(d); return x; }
  };
  const ref = p => p + '-' + (Date.now() % 1e6).toString().padStart(6, '0');

  /* ---------- ภาษา ---------- */
  let lang = store.get('ppsdLang', 'th');
  const t = k => (P.I18N[lang] && P.I18N[lang][k]) || P.I18N.th[k] || k;

  /* ---------- ไอคอน ---------- */
  const I = {
    chev: '<svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M14 6l6 6-6 6"/></svg>',
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18M3 12h18M9 17h12"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>',
    plus: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1v12M1 7h12"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    house: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 15L16 5l12 10M7 13v14h18V13M13 27v-8h6v8"/></svg>',
    shield: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3l10 4v8c0 7-4.5 11.5-10 14C10.5 26.5 6 22 6 15V7z"/><path d="M11.5 16l3 3 6-6.5"/></svg>',
    team: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="11" r="4"/><circle cx="7.5" cy="13" r="3"/><circle cx="24.5" cy="13" r="3"/><path d="M9 26c.8-4.5 3.5-7 7-7s6.2 2.5 7 7M2.5 25c.5-3 2.3-5 5-5M29.5 25c-.5-3-2.3-5-5-5"/></svg>',
    pin: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 29s9-8.5 9-15.5a9 9 0 10-18 0C7 20.5 16 29 16 29z"/><circle cx="16" cy="13.5" r="3.2"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-9.2-9.3C1.6 7.3 3.7 4 7.1 4c2 0 3.6 1.1 4.9 2.9C13.3 5.1 14.9 4 16.9 4c3.4 0 5.5 3.3 4.3 6.7C19.5 15.4 12 20 12 20z"/></svg>',
    cmp: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="7" height="16"/><rect x="14" y="4" width="7" height="16"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>',
    upload: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 21V5M10 11l6-6 6 6M5 21v6h22v-6"/></svg>',
    line: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.5 3 2 6.6 2 11c0 3.9 3.5 7.2 8.3 7.9.3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.6 1.1-.5 6-3.5 8.2-6.1C21.7 14 22 12.6 22 11c0-4.4-4.5-8-10-8zM7.9 13.4H6V9.3c0-.3-.2-.5-.5-.5s-.5.2-.5.5v4.6c0 .3.2.5.5.5h2.4c.3 0 .5-.2.5-.5s-.2-.5-.5-.5zm2-4.1c0-.3-.2-.5-.5-.5s-.5.2-.5.5v4.6c0 .3.2.5.5.5s.5-.2.5-.5zm5.6 0c0-.3-.2-.5-.5-.5s-.5.2-.5.5v2.9l-2.4-3.2c-.1-.1-.2-.2-.4-.2-.3 0-.5.2-.5.5v4.6c0 .3.2.5.5.5s.5-.2.5-.5V11l2.4 3.2c.1.1.3.2.4.2.3 0 .5-.2.5-.5zm3.9.5c.3 0 .5-.2.5-.5s-.2-.5-.5-.5H17c-.3 0-.5.2-.5.5v4.6c0 .3.2.5.5.5h2.4c.3 0 .5-.2.5-.5s-.2-.5-.5-.5h-1.9v-1.3h1.9c.3 0 .5-.2.5-.5s-.2-.5-.5-.5h-1.9V9.8z"/></svg>',
    fb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 21v-7.5H16l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21z"/></svg>',
    ig: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.3A4.7 4.7 0 1012 16.7 4.7 4.7 0 0012 7.3zm0 7.7a3 3 0 110-6 3 3 0 010 6zm6-7.9a1.1 1.1 0 11-2.2 0 1.1 1.1 0 012.2 0zM21 8c-.1-1.5-.4-2.8-1.5-3.9S17.5 2.7 16 2.6C14.5 2.5 9.5 2.5 8 2.6 6.5 2.7 5.2 3 4.1 4.1S2.7 6.5 2.6 8c-.1 1.5-.1 6.5 0 8 .1 1.5.4 2.8 1.5 3.9s2.4 1.4 3.9 1.5c1.5.1 6.5.1 8 0 1.5-.1 2.8-.4 3.9-1.5s1.4-2.4 1.5-3.9c.1-1.5.1-6.5 0-8zm-2 9.7a3.2 3.2 0 01-1.8 1.8c-1.3.5-4.3.4-5.2.4s-3.9.1-5.2-.4a3.2 3.2 0 01-1.8-1.8c-.5-1.3-.4-4.3-.4-5.7s-.1-4.4.4-5.7A3.2 3.2 0 016.8 4.5c1.3-.5 4.3-.4 5.2-.4s3.9-.1 5.2.4a3.2 3.2 0 011.8 1.8c.5 1.3.4 4.3.4 5.7s.1 4.4-.4 5.7z"/></svg>',
    yt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 8.2s-.2-1.4-.8-2c-.8-.8-1.6-.8-2-.9C16.4 5 12 5 12 5s-4.4 0-7.2.3c-.4.1-1.2.1-2 .9-.6.6-.8 2-.8 2S2 9.8 2 11.4v1.5c0 1.6.2 3.2.2 3.2s.2 1.4.8 2c.8.8 1.8.8 2.2.8 1.6.2 6.8.2 6.8.2s4.4 0 7.2-.3c.4-.1 1.2-.1 2-.9.6-.6.8-2 .8-2s.2-1.6.2-3.2v-1.5c0-1.6-.2-3.2-.2-3.2zM10 14.8V9.2l5.4 2.8z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 006 6L16 13l5 2v4a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2z"/></svg>',
    area: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>',
    bed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18V6M3 14h18v4M21 14v-2a3 3 0 00-3-3h-7v5"/><circle cx="7" cy="11" r="1.6"/></svg>',
    bath: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16v2a5 5 0 01-5 5H9a5 5 0 01-5-5zM6 12V6a2 2 0 014 0M7 19l-1 2M17 19l1 2"/></svg>',
    layers: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1L5 21l4.2-2.3c.9.2 1.8.3 2.8.3 5.5 0 10-3.6 10-8s-4.5-8-10-8z"/></svg>',
    talk: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 7h22v14H14l-6 5v-5H5z"/><path d="M10 12h12M10 16h8"/></svg>',
    pen: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 27l3-9L21 5l6 6L14 24z"/><path d="M18 8l6 6M8 18l6 6"/></svg>',
    doc: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 3h11l6 6v20H8z"/><path d="M19 3v6h6M12 15h9M12 19h9M12 23h6"/></svg>',
    helmet: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 22a11 11 0 0122 0"/><path d="M3 22h26v3H3zM13 12V8h6v4M16 8v6"/></svg>',
    inspect: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="14" cy="14" r="8"/><path d="M20 20l7 7M10.5 14l2.5 2.5 4.5-5"/></svg>',
    key: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="10" cy="16" r="5"/><path d="M15 16h13M23 16v4M27 16v3"/></svg>',
    coin: '<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="9" rx="9" ry="4"/><path d="M7 9v7c0 2.2 4 4 9 4s9-1.8 9-4V9M7 16v7c0 2.2 4 4 9 4s9-1.8 9-4v-7"/></svg>',
    compass: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12"/><path d="M20.5 11.5l-2.8 6.2-6.2 2.8 2.8-6.2z"/></svg>',
    gem: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 5h14l5 7-12 15L4 12z"/><path d="M4 12h24M12 5l-2 7 6 15 6-15-2-7"/></svg>'
  };

  /* ---------- ส่วนประกอบหน้า ---------- */
  const consent = id => `<label class="consent"><input id="${id}" type="checkbox" required><span>ยินยอมให้ PPSD เก็บข้อมูลเพื่อติดต่อกลับ อ่าน<a href="#privacy">นโยบายความเป็นส่วนตัว</a></span></label>`;
  const field = (id, label, input, help) => `<div class="f" data-f="${id}"><label for="${id}">${label}</label>${input}${help ? `<span class="h">${help}</span>` : ''}<span class="msg-err" id="${id}-e"></span></div>`;
  const ph = (o) => { const ov = P.pageOv ? P.pageOv() : null; if (ov) o = Object.assign({}, o, ov.title ? { title: ov.title } : {}, ov.lead ? { lead: ov.lead } : {}, ov.img ? { img: ov.img, cap: '' } : {}, ov.noImg ? { img: '', cap: '' } : {}); return `<section class="ph${o.img ? ' img' : ''}">${o.img ? `<img src="${src(o.img)}" alt="" fetchpriority="high">` : ''}<div class="w">${o.crumb ? `<div class="crumb">${o.crumb}</div>` : ''}${o.eyebrow ? `<span class="eyebrow">${o.eyebrow}</span>` : ''}<h1>${o.title}</h1>${o.lead ? `<p class="lead">${o.lead}</p>` : ''}${o.cta ? `<div class="ph-cta">${o.cta.map(([h, l, c]) => `<a class="btn${c ? ' ' + c : ''}" href="${h}">${l}${c ? '' : ' <span class="ar" aria-hidden="true">›</span>'}</a>`).join('')}</div>` : ''}</div>${o.cap ? `<span class="img-cap">${o.cap}</span>` : ''}</section>`; };
  /* แถบไอคอนทอง: [[icon, ไทย, English], ...] */
  const istrip = (items) => `<section class="istrip" aria-label="จุดเด่น PPSD"><div class="w"><div class="is-g" style="--n:${items.length}">${items.map(([i, th, en]) => `<div class="is">${I[i] || ''}<b>${th}</b>${en ? `<small>${en}</small>` : ''}</div>`).join('')}</div></div></section>`;
  const subnav = (items, cur) => `<nav class="subnav" aria-label="หน้าย่อย"><div class="w">${items.map(([h, l]) => `<a href="#${h}"${h === cur ? ' class="on" aria-current="page"' : ''}>${l}</a>`).join('')}</div></nav>`;
  const opt = (v, l, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(l)}</option>`;

  /* ตรวจฟอร์ม: คืน true ถ้าผ่าน แสดงข้อความใต้ช่องที่ผิด */
  function validate(form) {
    let ok = true, first = null;
    $$('.f.err', form).forEach(f => f.classList.remove('err'));
    $$('[required]', form).forEach(el => {
      let bad = false, m = 'กรุณากรอกข้อมูล';
      if (el.type === 'checkbox') { bad = !el.checked; m = 'กรุณายืนยัน'; }
      else if (!String(el.value).trim()) bad = true;
      else if (el.type === 'tel' && !/^0\d[\d\s-]{7,11}$/.test(el.value.trim())) { bad = true; m = 'เบอร์โทรไม่ถูกต้อง (เช่น 089 999 2474)'; }
      else if (el.type === 'email' && !/^\S+@\S+\.\S+$/.test(el.value.trim())) { bad = true; m = 'อีเมลไม่ถูกต้อง'; }
      else if (el.type === 'number' && el.min !== '' && Number(el.value) < Number(el.min)) { bad = true; m = 'ค่าต่ำกว่าที่กำหนด'; }
      if (bad) {
        ok = false; first = first || el;
        const f = el.closest('.f');
        if (f) { f.classList.add('err'); const e = f.querySelector('.msg-err'); if (e) e.textContent = m; }
        else if (el.type === 'checkbox') { const c = el.closest('.consent'); if (c) { c.style.color = 'var(--bad)'; setTimeout(() => (c.style.color = ''), 2600); } }
      }
    });
    if (first) { first.focus({ preventScroll: true }); first.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    return ok;
  }
  const formData = form => { const o = {}; $$('input,select,textarea', form).forEach(el => { if (!el.id) return; if (el.type === 'checkbox') o[el.id] = el.checked; else if (el.type !== 'file') o[el.id] = el.value; }); return o; };

  /* ย่อรูปที่แนบในเครื่อง (ไม่อัปโหลดไปที่ใด) */
  const shrinkImg = (file, max = 1280) => new Promise(ok => {
    if (!/^image\//.test(file.type)) return ok({ name: file.name, type: file.type, size: file.size });
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok({ name: file.name, type: 'image/jpeg', src: c.toDataURL('image/jpeg', 0.8) }); };
    im.onerror = () => { URL.revokeObjectURL(u); ok({ name: file.name, type: file.type }); };
    im.src = u;
  });
  /* กล่องแนบไฟล์ที่ใช้ซ้ำได้: แสดงตัวอย่างรูป ลบได้ จำกัดจำนวน */
  function uploader(root, opts) {
    const max = opts.max || 3, files = opts.files || [];
    const box = $('.thumbs', root), inp = $('input[type=file]', root), drop = $('.drop', root);
    const draw = () => { box.innerHTML = files.map((f, i) => `<div class="thumb">${f.src ? `<img src="${f.src}" alt="${esc(f.name)}">` : `<span>📄<br>${esc(f.name)}</span>`}<button type="button" data-rm="${i}" aria-label="ลบไฟล์ ${esc(f.name)}">×</button></div>`).join(''); drop.hidden = files.length >= max; if (opts.onChange) opts.onChange(files); };
    const add = async list => { for (const f of [...list].slice(0, max - files.length)) { if (f.size > 15e6) { toast('ไฟล์ใหญ่เกิน 15 MB', f.name); continue; } files.push(await shrinkImg(f)); } draw(); };
    inp.addEventListener('change', e => { add(e.target.files); e.target.value = ''; });
    drop.addEventListener('click', () => inp.click());
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
    ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); if (ev === 'drop') add(e.dataTransfer.files); }));
    box.addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { files.splice(Number(b.dataset.rm), 1); draw(); } });
    draw();
    return files;
  }
  const uploadBox = (id, label, help, accept = 'image/jpeg,image/png,image/webp,application/pdf') => `<div class="f up" id="${id}"><span class="lbl">${label}</span>${help ? `<span class="h">${help}</span>` : ''}<div class="drop" role="button" tabindex="0">${I.upload}<div>ลากไฟล์มาวาง หรือ <u>เลือกไฟล์</u></div><div class="fine">JPG, PNG, WEBP หรือ PDF ไม่เกิน 15 MB</div></div><input type="file" accept="${accept}" multiple hidden><div class="thumbs"></div></div>`;

  /* ---------- หน้าต่างลอย / แจ้งเตือน ---------- */
  let lastFocus = null;
  function modal(title, html, onOpen) {
    const m = $('#modal'); lastFocus = document.activeElement;
    $('#modalT').textContent = title; $('#modalB').innerHTML = html;
    m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden';
    setTimeout(() => { const b = $('[data-close]', m); if (b) b.focus(); }, 60);
    if (onOpen) onOpen($('#modalB'));
  }
  function closeModal() { const m = $('#modal'); if (!m.classList.contains('open')) return; m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; $('#modalB').innerHTML = ''; if (lastFocus) lastFocus.focus({ preventScroll: true }); }
  function toast(title, body, kind) {
    const el = document.createElement('div'); el.className = 'toast' + (kind === 'line' ? ' line' : '');
    el.innerHTML = `${kind === 'line' ? '<span class="ic">LINE</span>' : ''}<div><b>${esc(title)}</b>${body ? `<span class="fine">${esc(body)}</span>` : ''}</div>`;
    $('#toasts').appendChild(el); setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; setTimeout(() => el.remove(), 400); }, kind === 'line' ? 6000 : 4200);
  }
  /* แจ้ง LINE จำลอง: บันทึกใน log + แสดง toast */
  function lineNotify(text, to, seg) { const d = db.get(); d.line.unshift({ at: Date.now(), to: to || '', seg: seg || '', text }); db.save(d); toast('LINE OA (จำลอง)', text, 'line'); }

  /* ---------- ส่วนหัว ---------- */
  function renderHeader() {
    const top = $('#top');
    const grp = (g, i) => `<div class="nav-g" data-g="${i}"><button type="button" class="nav-b" aria-expanded="false" aria-haspopup="true" aria-controls="dd${i}">${t(g.k)} ${I.chev}</button><div class="dd" id="dd${i}" role="menu">${g.items.map(([h, th, en]) => `<a role="menuitem" href="#${h}">${lang === 'en' ? en : th}</a>`).join('')}</div></div>`;
    top.innerHTML = `<div class="bar"><a class="brand" href="#home" aria-label="PPSD HOME BUILDER หน้าแรก"><img src="img/logo-h-gold.png" alt="PPSD" width="640" height="225"></a>
<nav class="nav" aria-label="เมนูหลัก">${P.NAV.map(grp).join('')}</nav>
<div class="tools"><div class="lang" role="group" aria-label="ภาษา"><button type="button" data-lang="th" class="${lang === 'th' ? 'on' : ''}" aria-pressed="${lang === 'th'}">TH</button><span>/</span><button type="button" data-lang="en" class="${lang === 'en' ? 'on' : ''}" aria-pressed="${lang === 'en'}">EN</button></div>
<a class="me-link" href="#myhome">${I.user}<span>${t('myhome')}</span></a><a class="tel-top" href="tel:${P.CO.tel}" aria-label="โทร ${P.CO.phone}">${I.phone}<span>${P.CO.phone}</span></a><a class="cta-top" href="#appointment">${I.chat}<span>${t('consult')}</span></a>
<button type="button" class="burger" id="burger" aria-label="${t('menu')}" aria-expanded="false" aria-controls="drawer">${I.menu}</button></div></div>`;
    const dr = $('#drawer');
    dr.innerHTML = `<div class="drawer-h"><img src="img/logo-h-gold.png" alt="PPSD"><button type="button" class="burger" style="display:flex" data-dclose aria-label="${t('close')}">${I.x}</button></div>
<div class="drawer-b">${P.NAV.map((g, i) => `<div class="acc"><button type="button" aria-expanded="false" aria-controls="acc${i}">${t(g.k)} ${I.plus}</button><div class="acc-p" id="acc${i}"><div>${g.items.map(([h, th, en]) => `<a href="#${h}">${lang === 'en' ? en : th}</a>`).join('')}</div></div></div>`).join('')}
<div class="acc"><a href="#myhome" style="display:block;padding:18px 0;font-size:18px">${t('myhome')}</a></div></div>
<div class="drawer-f"><div class="lang" style="justify-content:center;font-size:14px"><button type="button" data-lang="th" class="${lang === 'th' ? 'on' : ''}">ภาษาไทย</button><span>/</span><button type="button" data-lang="en" class="${lang === 'en' ? 'on' : ''}">English</button></div><a class="btn gold" href="#appointment">${t('consult')}</a></div>`;
  }
  function closeMenus() { $$('.nav-g.open').forEach(g => { g.classList.remove('open'); delete g.dataset.hov; $('.nav-b', g).setAttribute('aria-expanded', 'false'); }); }
  function openDrawer(o) { const d = $('#drawer'); d.classList.toggle('open', o); d.setAttribute('aria-hidden', String(!o)); document.body.style.overflow = o ? 'hidden' : ''; const b = $('#burger'); if (b) b.setAttribute('aria-expanded', String(o)); if (o) setTimeout(() => $('[data-dclose]', d).focus(), 50); }

  /* ---------- ส่วนท้าย ---------- */
  function renderFooter() {
    const C = P.CO;
    const sm = [['designs', 'แบบบ้าน'], ['works', 'ผลงาน'], ['reviews', 'รีวิว'], ['custom', 'ออกแบบตามใจ'], ['fengshui', 'ฮวงจุ้ย'], ['process', 'ขั้นตอน'], ['materials', 'วัสดุ'], ['budget-calc', 'คำนวณงบ'], ['loan', 'สินเชื่อ'], ['plan', 'วางแผนการเงิน'], ['land', 'เช็กที่ดิน'], ['documents', 'เอกสาร'], ['services', 'ต่อเติม รีโนเวท'], ['about', 'เกี่ยวกับเรา'], ['why', 'ทำไมต้อง PPSD'], ['areas', 'พื้นที่บริการ'], ['knowledge', 'ความรู้'], ['faq', 'คำถามที่พบบ่อย'], ['help', 'Help Center'], ['contact', 'ติดต่อเรา'], ['myhome', 'บ้านของฉัน']];
    $('#foot').innerHTML = `<img src="img/footer-mono.jpg" alt="" loading="lazy"><div class="foot-in">
<h2>${t('footH').replace('ความไว้วางใจ', '<span class="nw">ความไว้วางใจ</span>')}</h2><p class="en">${t('footEn')}</p><a class="fcta" href="#appointment">${t('footCta')}</a><hr>
<div class="fcontact"><a href="tel:${C.tel}">โทร ${C.phone}</a><a href="mailto:${C.email}">${C.email}</a><a href="${C.line}" target="_blank" rel="noopener">LINE ศูนย์สร้างบ้าน PPSD</a></div>
<div class="fbr">${C.branches.map(b => `<div><b>${lang === 'en' ? b.en : b.th}</b>${esc(lang === 'en' ? b.addrEn : b.addr)}${b.verified ? '' : ' <span style="opacity:.6">(รอยืนยันที่อยู่เต็ม)</span>'}</div>`).join('')}</div>
<div class="social"><a href="${C.facebook}" target="_blank" rel="noopener" aria-label="Facebook">${I.fb}</a><a href="${C.instagram}" target="_blank" rel="noopener" aria-label="Instagram">${I.ig}</a><a href="${C.youtube}" target="_blank" rel="noopener" aria-label="YouTube">${I.yt}</a><a href="${C.line}" target="_blank" rel="noopener" aria-label="LINE">${I.line}</a></div>
<nav class="fmap" aria-label="${t('sitemap')}">${sm.map(([h, l]) => `<a href="#${h}">${l}</a>`).join('')}<a href="#privacy">${t('privacy')}</a><button type="button" data-cookie>${t('cookie')}</button></nav>
<div class="fcopy"><span>© ${now.getFullYear() + 543} ${C.nameTh} · ${C.nameEn}</span><span>${t('proto')}</span></div></div>`;
  }

  /* ---------- ปุ่มลอย: Help Center + LINE OA (ไม่มีแชทในเว็บ — คุยกับทีมผ่าน LINE OA เท่านั้น) ---------- */
  function renderFab() {
    $('#fab').innerHTML = `<div class="greet" id="greet" hidden role="status"><button type="button" class="greet-x" data-greet-x aria-label="ปิดข้อความ">×</button><a class="greet-b" href="#help" data-greet-go><span class="greet-av"><img src="img/logo-mark.png" alt=""></span><span><b>ให้ PPSD ดูแลคุณ</b><span>ค้นคำตอบใน Help Center หรือคุยกับทีมทาง LINE OA</span></span></a></div>
<div class="fab-col"><a class="fab-btn line" href="${P.CO.line}" target="_blank" rel="noopener" aria-label="คุยกับทีม PPSD ทาง LINE OA">${I.line}<span class="fab-tip">LINE OA</span></a><a class="fab-btn help" href="#help" aria-label="Help Center ศูนย์ช่วยเหลือ"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2"/><path d="M9.4 9.3a2.7 2.7 0 015.2 1c0 1.8-2.6 2.3-2.6 3.9M12 17.2v.3"/></svg><span class="fab-tip">Help Center</span></a></div>`;
    /* ข้อความทักทาย: แสดงหลังเข้าเว็บ 2.5 วินาที ปิดแล้วไม่แสดงซ้ำ 1 วัน */
    const g = store.get('ppsdGreet', 0);
    if (Date.now() - g > 86400000) setTimeout(() => { if (!document.body.classList.contains('app-mode') && cur.name !== 'help') $('#greet').hidden = false; }, 2500);
  }
  const hideGreet = () => { const g = $('#greet'); if (g) g.hidden = true; store.set('ppsdGreet', Date.now()); };

  /* ---------- คุกกี้ ---------- */
  const CK = 'ppsdCookieConsent';
  function renderCookie() {
    const c = store.get(CK, null); window.ppsdConsent = c;
    const el = $('#ck'); el.hidden = !!c;
    el.innerHTML = `<p>เราใช้คุกกี้ที่จำเป็นให้เว็บทำงาน ส่วนคุกกี้วิเคราะห์และการตลาดจะใช้เมื่อคุณยินยอมเท่านั้น อ่าน<a href="#privacy">นโยบายความเป็นส่วนตัว</a></p><div class="row"><button type="button" class="btn line sm" data-cookie>ตั้งค่า</button><button type="button" class="btn line sm" data-ck="0">ปฏิเสธที่ไม่จำเป็น</button><button type="button" class="btn sm" data-ck="1">ยอมรับทั้งหมด</button></div>`;
  }
  function saveConsent(a, m) { const c = { v: 1, analytics: a, marketing: m, at: new Date().toISOString() }; store.set(CK, c); window.ppsdConsent = c; $('#ck').hidden = true; closeModal(); }
  function cookieDialog() {
    const c = store.get(CK, null) || {};
    modal('ตั้งค่าคุกกี้', `<div class="form"><div class="chk row-b"><span><b style="font-weight:500">คุกกี้ที่จำเป็น</b><br><span class="fine">จำการตั้งค่านี้ แบบบ้านที่บันทึก และรายการเอกสารที่ติ๊กไว้</span></span><span class="badge ok">เปิดเสมอ</span></div>
<label class="chk row-b"><span><b style="font-weight:500">วิเคราะห์การใช้งาน</b><br><span class="fine">ช่วยให้รู้ว่าหน้าไหนมีคนใช้มาก เพื่อปรับเว็บให้ดีขึ้น</span></span><input type="checkbox" id="ckA" ${c.analytics ? 'checked' : ''}></label>
<label class="chk row-b"><span><b style="font-weight:500">การตลาด</b><br><span class="fine">ช่วยวัดผลโฆษณาและแสดงโฆษณาที่เกี่ยวข้อง</span></span><input type="checkbox" id="ckM" ${c.marketing ? 'checked' : ''}></label>
<div class="row" style="justify-content:flex-end"><button type="button" class="btn line" data-close>ยกเลิก</button><button type="button" class="btn" id="ckSave">บันทึกการตั้งค่า</button></div></div>`, b => $('#ckSave', b).onclick = () => saveConsent($('#ckA').checked, $('#ckM').checked));
  }

  /* ---------- เส้นทาง ---------- */
  P.R = P.R || {};
  /* เมนูย่อยที่ชี้ไปส่วนหนึ่งของหน้า [หน้า, id ส่วน] */
  const ALIAS = { 'fengshui-design': ['fengshui', 'svc-b'], team: ['about', 'team'], map: ['contact', 'maps'], channels: ['contact', 'channels'], faq: ['knowledge', 'faq'], homebook: ['myhome', ''], estimate: ['budget-calc', 'estimate'], ideas: ['designs', ''] };
  let cur = { name: '', arg: '' };
  function parse() {
    let h = decodeURIComponent(location.hash.slice(1) || 'home').split('?')[0] || 'home';   /* #admin?h=… = ลิงก์เข้าหลังบ้านจาก RQ */
    let [name, arg] = h.split('/');
    if (!P.R[name] && !ALIAS[name]) { const m = name.match(/^(.+?)-(\d+)$/); if (m && (P.R[m[1]] || ALIAS[m[1]])) { name = m[1]; arg = m[2]; } }
    return { name, arg };
  }
  function route() {
    let { name, arg } = parse(), anchor = '';
    if (ALIAS[name]) { [name, anchor] = ALIAS[name]; }
    const fn = P.R[name] || P.R.home;
    if (!P.R[name]) name = 'home';
    closeModal(); openDrawer(false); closeMenus();
    if (P._leave) { const f = P._leave; P._leave = null; try { f(); } catch (e) { /* ignore */ } }
    P._page = name;
    const page = fn(arg) || {};
    cur = { name, arg };
    const app = $('#app');
    const appMode = page.mode === 'app';
    document.body.classList.toggle('app-mode', appMode);
    $('#top').style.display = appMode ? 'none' : '';
    $('#foot').style.display = appMode ? 'none' : '';
    app.innerHTML = page.html || '';
    document.title = (page.t ? String(page.t).replace(/<[^>]+>/g, '') + ' | ' : '') + 'PPSD HOME BUILDER';
    document.documentElement.lang = lang;
    const top = $('#top'); top.classList.remove('hide');
    top.dataset.over = page.over ? '1' : '';
    onScroll(true);
    $$('.nav-b').forEach(b => b.classList.toggle('on', page.nav != null && b.parentElement.dataset.g === String(page.nav)));
    if (anchor) { requestAnimationFrame(() => { const el = document.getElementById(anchor); if (el) el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -(appMode ? 0 : 90)); }); }
    else window.scrollTo({ top: 0, behavior: 'instant' });
    if (page.init) { try { page.init(app); } catch (e) { console.error(e); } }
    reveal(app);
    app.focus({ preventScroll: true });
  }
  const go = h => { if (location.hash === '#' + h) route(); else location.hash = h; };

  /* ส่วนหัวโปร่งใสบนภาพเปิด แล้วเป็นสีกรมท่าเมื่อเลื่อน · เลื่อนลงซ่อน เลื่อนขึ้นแสดง */
  let lastY = 0;
  function onScroll(force) {
    const top = $('#top'), y = window.scrollY;
    top.classList.toggle('solid', !top.dataset.over || y > 60);
    if (force === true) { lastY = y; return; }
    if ($('#drawer').classList.contains('open') || Math.abs(y - lastY) < 8) return;
    top.classList.toggle('hide', y > lastY && y > 240 && !$('.nav-g.open'));
    lastY = y;
  }
  let io;
  function reveal(root) {
    if (!('IntersectionObserver' in window)) { $$('.rv,.st', root).forEach(e => e.classList.add('in')); return; }
    io = io || new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    $$('.rv,.st', root).forEach(e => io.observe(e));
  }

  /* ---------- เริ่มทำงาน ---------- */
  P.boot = function () {
    if (P.applyContent) { try { P.applyContent(); } catch (e) { console.error(e); } }
    renderHeader(); renderFooter(); renderFab(); renderCookie();
    window.addEventListener('hashchange', route);
    window.addEventListener('scroll', () => onScroll(), { passive: true });
    document.addEventListener('click', e => {
      const nb = e.target.closest('.nav-b');
      /* เมนูที่เพิ่งเปิดเพราะเมาส์ชี้ (hover) ให้คงเปิดเมื่อคลิกครั้งแรก — เดิมคลิกแล้วปิดทันที */
      if (nb) { const g = nb.parentElement, o = g.dataset.hov === '1' || !g.classList.contains('open'); closeMenus(); g.classList.toggle('open', o); nb.setAttribute('aria-expanded', String(o)); return; }
      if (!e.target.closest('.nav-g')) closeMenus();
      const lb = e.target.closest('[data-lang]');
      if (lb) { lang = lb.dataset.lang; store.set('ppsdLang', lang); renderHeader(); renderFooter(); route(); toast(lang === 'en' ? 'English selected' : 'เปลี่ยนเป็นภาษาไทย', lang === 'en' ? 'Menus, homepage and key headings are translated. Detailed content is in Thai for this prototype.' : ''); return; }
      if (e.target.closest('#burger')) return openDrawer(true);
      if (e.target.closest('[data-dclose]')) return openDrawer(false);
      const acc = e.target.closest('.acc>button');
      if (acc) { const a = acc.parentElement, o = !a.classList.contains('open'); a.classList.toggle('open', o); acc.setAttribute('aria-expanded', String(o)); return; }
      if (e.target.closest('#drawer a')) openDrawer(false);
      if (e.target.closest('[data-close]') || e.target.id === 'modal') return closeModal();
      if (e.target.closest('[data-greet-x]')) return hideGreet();
      if (e.target.closest('[data-greet-go]') || e.target.closest('.fab-btn')) hideGreet();
      if (e.target.closest('[data-cookie]')) return cookieDialog();
      const ck = e.target.closest('[data-ck]'); if (ck) return saveConsent(ck.dataset.ck === '1', ck.dataset.ck === '1');
      const a = e.target.closest('a[href^="#"]');
      if (a && a.getAttribute('href') === location.hash && !e.defaultPrevented) { e.preventDefault(); route(); }
    });
    document.addEventListener('mouseover', e => { if (window.matchMedia('(hover:hover) and (min-width:1181px)').matches) { const g = e.target.closest('.nav-g'); if (g && !g.classList.contains('open')) { closeMenus(); g.classList.add('open'); g.dataset.hov = '1'; $('.nav-b', g).setAttribute('aria-expanded', 'true'); } } });
    document.addEventListener('mouseout', e => { if (window.matchMedia('(hover:hover) and (min-width:1181px)').matches) { const g = e.target.closest('.nav-g'); if (g && !g.contains(e.relatedTarget)) { g.classList.remove('open'); delete g.dataset.hov; $('.nav-b', g).setAttribute('aria-expanded', 'false'); } } });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeMenus(); closeModal(); openDrawer(false); }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.closest('.nav-g')) { const g = e.target.closest('.nav-g'), items = $$('.dd a', g); if (!g.classList.contains('open')) { g.classList.add('open'); $('.nav-b', g).setAttribute('aria-expanded', 'true'); } e.preventDefault(); const i = items.indexOf(document.activeElement); const n = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1); items[n].focus(); }
    });
    document.addEventListener('submit', e => { if (e.target.matches('[data-noop]')) e.preventDefault(); });
    route();
  };

  P.renderChrome = () => { renderHeader(); renderFooter(); renderFab(); };
  Object.assign(P, { $, $$, esc, fmt, mil, up100, monthLabel, thDate, thTime, num, img, src, rimg, store, db, ref, t, I, consent, field, ph, istrip, subnav, opt, validate, formData, uploader, uploadBox, modal, closeModal, toast, lineNotify, go, route, reveal, getLang: () => lang, TH_M });
})(window.PPSD);
