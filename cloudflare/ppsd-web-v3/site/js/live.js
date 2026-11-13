/* PPSD HOME BUILDER — เชื่อมเว็บกับระบบ RQ "บ้านดี ดวงดี" (ฐานข้อมูลเดียวกับที่พนักงานใช้)
   ขั้น 1: แบบบ้าน (แก้แบบเดิม/เพิ่มแบบใหม่/ซ่อน/ราคา) และราคาแพ็กเกจ + ตารางวัสดุ มาจาก RQ
   - ผู้เข้าชม: ใช้ข้อมูลชุดล่าสุดที่จำไว้ทันที แล้วโหลดใหม่จาก RQ เบื้องหลัง · RQ ล่ม/ยังไม่มีข้อมูล = ใช้ข้อมูลในไฟล์เว็บ (data.js, designs.js)
   - พนักงาน: กดเมนู "🌐 แบบบ้านบนเว็บไซต์" ใน RQ → เปิดหน้า #admin ที่นี่ เข้าระบบด้วยบัญชี RQ → แก้แล้วบันทึกเข้า RQ ทันที (RQ ตรวจสิทธิ์และเก็บประวัติ)
   ตั้งค่าใน index.html: window.PPSD_RQ = ที่อยู่ระบบ RQ (ว่าง = ไม่เชื่อม ใช้ข้อมูลในไฟล์อย่างเดียว) */
(function (P) {
  'use strict';
  const { $, $$, esc, store, db, toast, go } = P;
  const RQ = String(window.PPSD_RQ || '').replace(/\/+$/, '');
  P.RQ = RQ;
  const clone = o => JSON.parse(JSON.stringify(o));
  const BASE = { PKG: clone(P.PKG), REGIONS: clone(P.REGIONS), SPEC: clone(P.SPEC) };
  const fill = (arr, v) => { arr.length = 0; v.forEach(x => arr.push(x)); };
  const SITE_KEY = 'ppsdSite', SYNC_KEYS = ['catalog', 'customDesigns'];

  /* ---------- ราคาแพ็กเกจ + ตารางวัสดุจากเมนู "แพ็กเกจ" ใน RQ → รูปแบบที่หน้าเว็บใช้ ---------- */
  const shortName = n => String(n || '').replace(/\s*\(.*\)\s*$/, '').trim();
  const fromSpec = ps => {
    const pk = (ps.packages || []).filter(p => p.price && p.price.rbr > 0);
    if (!pk.length) return null;
    const PKG = pk.map(p => { const b = BASE.PKG.find(x => x.id === p.id) || {}; return Object.assign({}, b, { id: p.id, name: shortName(p.name) || b.name, rate: p.price.rbr, rates: p.price }); });
    /* ราคาต่อ ตร.ม. ต่างกันตามพื้นที่ (ราชบุรี / กรุงเทพฯ / อื่นๆ) → ตัวคูณของแต่ละจังหวัดในเครื่องคำนวณ (อิงแพ็กเกจแรก) */
    const p0 = pk[0].price, f = k => Math.round((p0[k] || p0.rbr) / p0.rbr * 1000) / 1000;
    const REGIONS = BASE.REGIONS.map(([n]) => [n, /ราชบุรี/.test(n) ? 1 : /กรุงเทพ/.test(n) ? f('bkk') : f('other')]);
    const ids = [(pk.find(p => p.id === 'premium') || pk[0]).id, (pk.find(p => p.id === 'elite') || pk[1] || pk[0]).id];
    const cell = v => { v = String(v == null ? '' : v).trim(); return v === '✗' || v === '' ? '—' : v; };
    const SPEC = (ps.cats || []).filter(c => c.items && c.items.length).map((c, i) => {
      const b = BASE.SPEC.find(x => x[0] === c.name || x[0].replace(/^งาน/, '') === c.name.replace(/^งาน/, '')) || BASE.SPEC[i] || [];
      const rows = [];
      c.items.forEach(it => {
        const nm = String(it.name || ''), cut = nm.indexOf(' — '), g = cut > 0 ? nm.slice(0, cut) : nm, dsc = cut > 0 ? nm.slice(cut + 3) : '';
        const r = [g, dsc, cell((it.values || {})[ids[0]]), cell((it.values || {})[ids[1]])]; if (it.note) r.push(it.note);
        /* แถวเดียวกันที่แยกเป็น 2 บรรทัด (Premium ✗ / Elite ✗) → รวมเป็นบรรทัดเดียว */
        const last = rows[rows.length - 1], empty = v => !v || v === '—';
        if (last && last[0] === r[0] && last[1] === r[1] && (empty(last[2]) || empty(r[2])) && (empty(last[3]) || empty(r[3]))) { if (empty(last[2])) last[2] = r[2]; if (empty(last[3])) last[3] = r[3]; if (r[4] && !last[4]) last[4] = r[4]; }
        else rows.push(r);
      });
      return [c.name, b[1] || '', rows, b[3]];
    });
    return { PKG, REGIONS, SPEC: SPEC.length ? SPEC : null, date: ps.at || 0, notes: ps.priceNotes || [] };
  };

  /* ข้อความราคาแพ็กเกจที่หน้าเว็บใช้ (จาก RQ = ราคาจริงของบริษัท · ไม่มี = ค่าตัวอย่างในไฟล์) */
  P.PKG_LIVE = false;
  P.pkgRate = id => (P.PKG.find(p => p.id === id) || P.PKG[0] || {}).rate || 0;
  P.pkgRegionText = id => { const p = P.PKG.find(x => x.id === id) || {}, r = p.rates || {}; return r.bkk ? `${P.fmt(r.bkk)} / ${P.fmt(r.other || r.bkk)} บาท/ตร.ม.` : '—'; };
  P.pkgLine = () => P.PKG_LIVE
    ? `ราคาต่อ ตร.ม. ของบริษัท (ราชบุรี): ${P.PKG.map(p => `${esc(p.name)} ${P.fmt(p.rate)}`).join(' · ')} บาท · กรุงเทพฯ และจังหวัดอื่นสูงกว่าเล็กน้อย · ราคาจริงยึดใบเสนอราคา`
    : `อัตราต่อ ตร.ม. เป็นตัวอย่างจากเว็บเดิม (${P.PKG.map(p => `${esc(p.name)} ${P.fmt(p.rate)}`).join(' · ')} บาท) รอยืนยัน`;
  P.pkgCaption = () => P.PKG_LIVE
    ? `ราคาต่อ ตร.ม. จากระบบบริษัท${P.SPEC_DATE ? ' (ปรับปรุง ' + P.thDate(P.SPEC_DATE) + ')' : ''}${(P.PRICE_NOTES || []).length ? ' · ' + P.PRICE_NOTES.map(n => esc(String(n).replace(/^หมายเหตุ\s*/, ''))).join(' · ') : ''} · ราคาสุดท้ายยึดใบเสนอราคา`
    : 'อัตราต่อ ตร.ม. เป็นตัวอย่างจากเว็บเดิม รอยืนยันกับใบเสนอราคา';

  /* ---------- ข้อมูลจาก RQ → หน้าเว็บ ---------- */
  let siteV = '';
  P.applySite = snap => {
    snap = snap || {};
    const d = db.get();
    d.catalog = snap.catalog && typeof snap.catalog === 'object' ? snap.catalog : {};
    d.customDesigns = Array.isArray(snap.customDesigns) ? snap.customDesigns : [];
    saveRaw(d);
    let pk = {}; try { pk = (snap.pkgspec && fromSpec(snap.pkgspec)) || {}; } catch (e) { pk = {}; }
    fill(P.PKG, Array.isArray(pk.PKG) && pk.PKG.length ? pk.PKG : BASE.PKG);
    fill(P.REGIONS, Array.isArray(pk.REGIONS) && pk.REGIONS.length ? pk.REGIONS : BASE.REGIONS);
    fill(P.SPEC, Array.isArray(pk.SPEC) && pk.SPEC.length ? pk.SPEC : BASE.SPEC);
    P.SPEC_DATE = pk.date || ''; P.PRICE_NOTES = pk.notes || []; P.PKG_LIVE = !!(Array.isArray(pk.PKG) && pk.PKG.length);
    siteV = JSON.stringify(snap);
    synced = Object.fromEntries(SYNC_KEYS.map(k => [k, JSON.stringify(d[k])]));
  };
  P.siteLoad = async (rerender, fresh) => {
    if (!RQ) return;
    try {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
      /* หลังบ้านต้องได้ข้อมูลล่าสุดเสมอ (ไม่ใช้สำเนาที่เบราว์เซอร์จำไว้ 60 วิ) ไม่งั้นแก้ทับของเก่า */
      const r = await fetch(RQ + '/api/web/site' + (fresh ? '?t=' + Date.now() : ''), { signal: ctl.signal, cache: fresh ? 'no-store' : 'default' }); clearTimeout(tm);
      if (!r.ok) return;
      const snap = await r.json();
      /* สำเนาที่เก่ากว่าชุดที่มีอยู่ (เช่น เบราว์เซอร์จำไว้ 60 วิ) ไม่ใช้ทับของใหม่ */
      const have = store.get(SITE_KEY, null); if (have && +have.v > +snap.v) return;
      store.set(SITE_KEY, snap);
      if (JSON.stringify(snap) !== siteV) { P.applySite(snap); if (rerender && !/^#admin/.test(location.hash)) P.route(); }
    } catch (e) { /* ใช้ข้อมูลเดิมต่อ */ }
  };

  /* ---------- หลังบ้านเว็บ: เข้าจาก RQ · บันทึกเข้า RQ ---------- */
  const STAFF_KEY = 'ppsdStaff';
  const staff = {
    get() { try { const v = JSON.parse(sessionStorage.getItem(STAFF_KEY) || 'null'); return v && v.exp > Date.now() ? v : null; } catch (e) { return null; } },
    set(v) { try { sessionStorage.setItem(STAFF_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ } },
    del() { try { sessionStorage.removeItem(STAFF_KEY); } catch (e) { /* ignore */ } }
  };
  P.staff = staff;
  const api = async (path, opt) => {
    const s = staff.get(); if (!s) throw new Error('หมดเวลาเข้าใช้ — กดเมนูใน RQ อีกครั้ง');
    const r = await fetch(RQ + path, Object.assign({}, opt, { headers: Object.assign({ authorization: 'Bearer ' + s.token }, (opt || {}).headers || {}) }));
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { staff.del(); }
    if (!r.ok || j.error) throw new Error(j.error || 'บันทึกไม่สำเร็จ (' + r.status + ')');
    return j;
  };
  /* รูปที่แนบในหน้าแก้ไข (data:image) → อัปโหลดเข้า RQ แล้วใช้ลิงก์แทน */
  const upImg = async du => {
    const m = /^data:(image\/[a-z+]+);base64,(.*)$/.exec(du); if (!m) throw new Error('รูปไม่ถูกต้อง');
    const bin = atob(m[2]), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return (await api('/api/web/admin/img', { method: 'POST', headers: { 'content-type': m[1] }, body: u8 })).url;
  };
  const swapImgs = async v => {
    if (typeof v === 'string') return /^data:image\//.test(v) ? upImg(v) : v;
    if (Array.isArray(v)) { const o = []; for (const x of v) o.push(await swapImgs(x)); return o; }
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = await swapImgs(v[k]); return o; }
    return v;
  };
  /* db.save ของต้นแบบเก็บในเบราว์เซอร์ — ตอนพนักงานแก้ ให้ส่งส่วนที่เปลี่ยนเข้า RQ ด้วย */
  const saveRaw = db.save.bind(db);
  let synced = {}, syncing = Promise.resolve();
  db.save = d => {
    saveRaw(d);
    const s = staff.get(); if (!RQ || !s || !/^#admin/.test(location.hash)) return;
    const ch = SYNC_KEYS.filter(k => (s.edit || []).includes(k) && JSON.stringify(d[k]) !== synced[k]);
    if (!ch.length) return;
    syncing = syncing.then(async () => {
      for (const k of ch) {
        const cur = db.get()[k], val = await swapImgs(cur === undefined ? null : cur);
        await api('/api/web/admin/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: k, value: val }) });
        const d2 = db.get(); d2[k] = val; saveRaw(d2); synced[k] = JSON.stringify(val);
      }
      store.del(SITE_KEY);
      toast('บันทึกเข้าระบบ RQ แล้ว', 'หน้าเว็บของลูกค้าเปลี่ยนตามภายใน 1–2 นาที');
      if (/^#admin/.test(location.hash)) P.route();
    }).catch(e => { toast('บันทึกเข้า RQ ไม่สำเร็จ', e.message); P.siteLoad(false, true).then(() => { if (/^#admin/.test(location.hash)) P.route(); }); });
  };

  const MODS = [['catalog', 'แบบบ้านบนเว็บไซต์', ['catalog', 'customDesigns']]];
  const ROLE_TH = { owner: 'ผู้บริหาร', pageadmin: 'แอดมินเพจ', design: 'ฝ่ายออกแบบ' };
  const sideLogo = sub => `<div class="logo"><a href="#home" aria-label="กลับหน้าเว็บไซต์"><img src="img/logo-h-gold.png" alt="PPSD"></a><small>${sub}</small></div>`;
  const outPage = (msg, err) => ({ t: 'หลังบ้านเว็บไซต์', mode: 'app', html: `<section class="sec"><div class="w" style="max-width:620px;text-align:center;padding:80px 0"><h1 class="h-l">หลังบ้านเว็บไซต์</h1><p class="${err ? 'mh-err' : 'muted'}" style="margin:18px 0">${msg}</p><p class="muted">พนักงานเข้าได้จากเมนู <b>🌐 แบบบ้านบนเว็บไซต์</b> ในระบบ RQ “บ้านดี ดวงดี” เท่านั้น (ใช้บัญชี RQ เดิม ไม่ต้องจำรหัสใหม่)</p><div class="row" style="justify-content:center;margin-top:22px">${RQ ? `<a class="btn" href="${esc(RQ)}/">เปิดระบบ RQ</a>` : ''}<a class="btn line" href="#home">กลับหน้าเว็บไซต์</a></div></div></section>` });
  let adTab = 'catalog';
  const prevAdmin = P.R.admin;
  P.R.admin = () => {
    if (!RQ) return prevAdmin ? prevAdmin() : outPage('ยังไม่ได้เชื่อมระบบ RQ');
    const q = new URLSearchParams((location.hash.split('?')[1] || ''));
    if (q.get('h')) {
      const h = q.get('h'); history.replaceState(null, '', '#admin');
      fetch(RQ + '/api/web/admin/redeem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ h }) })
        .then(r => r.json().then(j => ({ ok: r.ok, j }))).then(({ ok, j }) => { if (!ok || !j.token) throw new Error(j.error || 'เข้าระบบไม่สำเร็จ'); staff.set(j); return P.siteLoad(false, true); })
        .then(() => P.route()).catch(e => { P._adErr = e.message; P.route(); });
      return outPage('กำลังเข้าระบบด้วยบัญชี RQ…');
    }
    const s = staff.get();
    if (!s) { const m = P._adErr; P._adErr = ''; return outPage(m || 'ยังไม่ได้เข้าระบบ หรือหมดเวลาใช้งานแล้ว (12 ชั่วโมง)', !!m); }
    /* เข้าหลังบ้านครั้งแรกของหน้านี้ → โหลดข้อมูลล่าสุดจาก RQ ก่อนแก้ */
    if (!P._adFresh) { P._adFresh = true; P.siteLoad(false, true).then(() => { if (/^#admin/.test(location.hash)) P.route(); }); }
    const mods = MODS.filter(([, , keys]) => keys.some(k => (s.edit || []).includes(k)));
    if (!mods.some(m => m[0] === adTab)) adTab = mods[0] ? mods[0][0] : '';
    const ext = (P.ADMIN_EXT || {})[adTab], ctx = { d: db.get(), role: s.role, roleName: s.name };
    return { t: 'หลังบ้านเว็บไซต์', mode: 'app', html: `<div class="app"><aside class="app-side">${sideLogo('WEBSITE · RQ')}<nav aria-label="เมนูหลังบ้านเว็บไซต์">${mods.map(([k, l]) => `<button type="button" data-mod="${k}" class="${k === adTab ? 'on' : ''}">${l}</button>`).join('')}</nav><div class="side-f"><span style="color:rgba(255,255,255,.6)">${esc(s.name || '')} · ${esc(ROLE_TH[s.role] || s.role)}</span><a href="#home">← ดูหน้าเว็บไซต์</a><a href="${esc(RQ)}/">กลับระบบ RQ</a><button type="button" id="adOut">ออกจากระบบ</button></div></aside>
<div class="app-main"><div class="app-top"><h1>${esc((mods.find(m => m[0] === adTab) || [, ''])[1])}</h1><div class="note"><span>บันทึกเข้าระบบ RQ ทันที · ลูกค้าเห็นภายใน 1–2 นาที · ทุกการแก้ไขเก็บประวัติใน RQ (ประวัติการใช้งาน)</span></div></div>${ext && mods.length ? ext.view(ctx) : '<p class="muted">ตำแหน่งนี้ยังไม่มีส่วนที่แก้ได้</p>'}</div></div>`,
      init() {
        const app = $('.app');
        app.addEventListener('click', e => { const b = e.target.closest('[data-mod]'); if (b) { adTab = b.dataset.mod; P.route(); } });
        $('#adOut').onclick = () => { staff.del(); go('home'); toast('ออกจากหลังบ้านแล้ว'); };
        /* แก้ราคา / ติ๊กแสดง ในตารางแบบบ้าน */
        app.addEventListener('change', e => {
          const el = e.target; if (!(el.dataset.price || el.dataset.show)) return;
          const dd = db.get(), id = el.dataset.price || el.dataset.show, c = dd.catalog || {};
          c[id] = Object.assign({}, c[id], el.dataset.price ? { price: Math.max(0, Number(el.value) || 0) } : { hidden: !el.checked });
          dd.catalog = c; db.save(dd);
        });
        if (ext && ext.init) ext.init(ctx);
      } };
  };

  /* ใช้ชุดที่จำไว้ทันที (ก่อน boot) ให้หน้าแรกแสดงข้อมูลล่าสุดโดยไม่ต้องรอ */
  if (RQ) { const c = store.get(SITE_KEY, null); if (c) { try { P.applySite(c); } catch (e) { store.del(SITE_KEY); } } }
})(window.PPSD);
