/* PPSD HOME BUILDER — ระบบจัดการเนื้อหา (CMS) และโมดูลหลังบ้านเพิ่มเติม
   - ชั้นข้อมูล: ค่าที่แก้จากหลังบ้านทับข้อมูลในโค้ด (ข้อมูลบริษัท ผลงาน รีวิว FAQ ข้อความหน้าแรก หัวเพจ)
   - โมดูลหลังบ้าน: รออนุมัติ · ใบเสนอราคา · แคตตาล็อกแบบบ้าน · เนื้อหาเว็บไซต์ · ผลงานและรีวิว
   ต้นแบบ: ทั้งหมดเก็บในเบราว์เซอร์นี้เท่านั้น · ระบบจริงเก็บใน Web DB + R2 ผ่าน PPSD Web API และตรวจสิทธิ์ที่เซิร์ฟเวอร์ */
(function (P) {
  'use strict';
  const { $, $$, esc, fmt, db, ref, field, opt, validate, uploader, uploadBox, modal, toast, lineNotify, thDate, thTime } = P;
  const clone = o => JSON.parse(JSON.stringify(o));
  const BASE = { CO: clone(P.CO), WORKS: clone(P.WORKS), FAQ: clone(P.FAQ), TH: Object.assign({}, P.I18N.th) };
  const now = () => Date.now();

  /* ข้อความหัวข้อ: [คำ] = ตัวเอียงสีทอง · | = ขึ้นบรรทัดใหม่ */
  const em = s => esc(String(s || '').trim()).replace(/\[([^\]]+)\]/g, '<em>$1</em>').replace(/\s*\|\s*/g, '<br>');
  const dec = h => { const t = document.createElement('textarea'); t.innerHTML = h; return t.value; };
  const unem = h => dec(String(h || '').replace(/<br\s*\/?>/g, ' | ').replace(/<em[^>]*>([\s\S]*?)<\/em>/g, '[$1]').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  const content = () => db.get().content || {};
  const saveContent = c => { const d = db.get(); d.content = c; db.save(d); P.applyContent(); if (P.renderChrome) P.renderChrome(); };

  /* ---------- ชั้นข้อมูล: ค่าที่แก้จากหลังบ้านทับข้อมูลในโค้ด ---------- */
  const allWorks = () => { const c = content(), wo = c.works || {}; return BASE.WORKS.map(w => Object.assign(clone(w), wo[w.id] || {})).concat((c.customWorks || []).map(w => Object.assign(clone(w), wo[w.id] || {}))).filter(w => !w.deleted); };
  const baseFaq = () => BASE.FAQ.map(f => ({ cat: f[0], q: f[1], a: f[2], link: f[3] || '', linkL: f[4] || '' }));
  P.applyContent = () => {
    const c = content();
    /* ข้อมูลบริษัท */
    const co = clone(BASE.CO);
    if (c.company) {
      ['phone', 'hours', 'email', 'line', 'facebook', 'instagram', 'youtube'].forEach(k => { if (c.company[k]) co[k] = c.company[k]; });
      if (c.company.phone) co.tel = '+66' + c.company.phone.replace(/\D/g, '').replace(/^0/, '');
      (c.company.branches || []).forEach((b, i) => { if (co.branches[i] && b && b.addr) Object.assign(co.branches[i], { addr: b.addr, q: b.addr, verified: !!b.verified }); });
    }
    Object.keys(P.CO).forEach(k => delete P.CO[k]); Object.assign(P.CO, co);
    /* ข้อความหน้าแรก (ภาษาไทย) */
    Object.assign(P.I18N.th, BASE.TH, c.i18n || {});
    /* ผลงานและรีวิว */
    const ws = allWorks().filter(w => !w.hidden); P.WORKS.length = 0; ws.forEach(w => P.WORKS.push(w));
    /* คำถามที่พบบ่อย */
    const fq = (c.faq || baseFaq()).filter(f => !f.hidden && f.q); P.FAQ.length = 0; fq.forEach(f => P.FAQ.push([f.cat || 'ทั่วไป', esc(f.q), esc(f.a), f.link || 'contact', f.linkL || 'ติดต่อทีมงาน']));
  };
  /* หัวเพจที่แก้จากหลังบ้าน (core.js เรียกตอนสร้างหัวเพจ) */
  P.pageOv = () => { const p = (content().pages || {})[P._page]; if (!p) return null; return { title: p.title ? em(p.title) : '', lead: p.lead ? esc(p.lead) : '', img: p.img && p.img !== 'none' ? p.img : '', noImg: p.img === 'none' }; };
  P.pendingCount = d => { const pr = (d.reports || []).filter(r => r.status === 'pending'); return pr.length + (d.photos || []).filter(x => x.status === 'pending' && !(x.report && pr.some(r => r.id === x.report))).length + (d.docs || []).filter(x => x.status === 'pending').length; };

  /* ---------- ตัวช่วยฟอร์ม ---------- */
  const inp = (id, label, val, attrs = '', help = '') => field(id, label, `<input id="${id}" ${/\btype=/.test(attrs) ? '' : 'type="text" '}value="${esc(val ?? '')}" ${attrs}>`, help);
  const num = (id, label, val, attrs = '') => field(id, label, `<input id="${id}" type="number" value="${esc(val ?? '')}" ${attrs}>`);
  const area = (id, label, val, rows = 3, attrs = '', help = '') => field(id, label, `<textarea id="${id}" rows="${rows}" ${attrs}>${esc(val ?? '')}</textarea>`, help);
  const v = id => { const el = $('#' + id); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
  const pre = (src, name) => src ? [{ name: name || 'รูปปัจจุบัน', type: 'image/jpeg', src }] : [];
  const thumb = (src, alt = '') => src ? `<img class="cms-th" src="${esc(src)}" alt="${esc(alt)}" loading="lazy">` : '<span class="cms-th"></span>';
  const HEAD_TIP = 'ใส่คำใน [ ] เพื่อทำเป็นตัวเอียงสีทอง · ใช้ | เพื่อขึ้นบรรทัดใหม่';
  const confirmBox = (title, body, okLabel, onOk, danger) => modal(title, `<p>${body}</p><div class="row" style="margin-top:16px"><button type="button" class="btn${danger ? ' danger' : ''}" id="cfOk">${okLabel}</button><button type="button" class="btn line" data-close>ยกเลิก</button></div>`, b => { $('#cfOk', b).onclick = () => { onOk(); }; });
  P.ADMIN_EXT = P.ADMIN_EXT || {};

  /* ======================= รออนุมัติ: ERP → ตรวจ → บ้านของฉัน → LINE ======================= */
  const originBadge = x => x.origin === 'erp' ? '<span class="badge navy">จาก ERP (จำลอง)</span>' : '<span class="badge">อัปโหลดในหลังบ้าน</span>';
  const qcB = q => q === 'fix' ? '<span class="badge warn">พบจุดแก้ · แก้แล้ว</span>' : q === 'fail' ? '<span class="badge bad">ไม่ผ่าน · รอแก้</span>' : '<span class="badge ok">ตรวจผ่าน</span>';
  P.ADMIN_EXT.approve = {
    view(ctx) {
      const d = ctx.d, pn = id => { const p = d.projects.find(x => x.id === id); return p ? `${p.code} · ${esc(p.name)}` : '-'; };
      const reps = d.reports.filter(r => r.status === 'pending');
      const lone = d.photos.filter(x => x.status === 'pending' && !(x.report && reps.some(r => r.id === x.report)));
      const docs = d.docs.filter(x => x.status === 'pending');
      const hist = [...d.reports.map(x => ['รายงาน', x, x.title]), ...d.photos.map(x => ['รูป', x, x.cap]), ...d.docs.map(x => ['เอกสาร', x, x.name])].filter(([, x]) => x.decidedAt).sort((a, b) => b[1].decidedAt - a[1].decidedAt).slice(0, 8);
      const repCard = r => { const phs = d.photos.filter(x => x.report === r.id && x.status === 'pending'); return `<article class="card q-item" data-qr="${r.id}"><div class="q-h"><b>${pn(r.project)}</b>${originBadge(r)}</div><div class="fine">${esc(r.title)} · ส่งเมื่อ ${thTime(r.at)} · โดย ${esc(r.by || 'ทีมหน้างาน')}${r.erpRef ? ' · อ้างอิง ' + esc(r.erpRef) : ''}</div><div class="fine">ความคืบหน้า ${r.progress}% · ขั้นงาน ${esc(r.stage || '-')}${r.notify !== false ? ' · แจ้ง LINE หลังอนุมัติ' : ''}</div>
${area('qs-' + r.id, 'สรุปที่ลูกค้าจะเห็น (แก้ได้ก่อนอนุมัติ)', r.summary, 3, 'data-qsum')}${(r.qc || []).length ? `<div class="row" style="gap:6px;margin:4px 0 10px">${r.qc.map(([a, q]) => `<span class="fine">${esc(a)}</span>${qcB(q)}`).join('')}</div>` : ''}
${phs.length ? `<div class="q-phs">${phs.map(x => `<div class="q-ph" data-qph="${x.id}"><img src="${esc(x.src)}" alt=""><label class="chk"><input type="checkbox" data-qinc checked> ส่งรูปนี้</label><input type="text" class="inp" data-qcap value="${esc(x.cap)}" aria-label="คำบรรยายรูป"></div>`).join('')}</div>` : ''}
<div class="row" style="margin-top:12px"><button type="button" class="btn sm" data-qok="reports|${r.id}">อนุมัติและเผยแพร่</button><button type="button" class="btn line sm" data-qno="reports|${r.id}">ไม่อนุมัติ</button></div></article>`; };
      const phCard = x => `<article class="card q-item" data-qp="${x.id}"><div class="q-h"><b>${pn(x.project)}</b>${originBadge(x)}</div><div class="q-phs"><div class="q-ph"><img src="${esc(x.src)}" alt=""><input type="text" class="inp" data-qcap value="${esc(x.cap)}" aria-label="คำบรรยายรูป"></div></div><div class="fine">ส่งเมื่อ ${thTime(x.at)}</div><div class="row" style="margin-top:10px"><button type="button" class="btn sm" data-qok="photos|${x.id}">อนุมัติ</button><button type="button" class="btn line sm" data-qno="photos|${x.id}">ไม่อนุมัติ</button></div></article>`;
      const docCard = x => `<article class="card q-item${x.internal ? ' q-warn' : ''}"><div class="q-h"><b>📄 ${esc(x.name)}</b>${originBadge(x)}</div><div class="fine">${pn(x.project)} · หมวด ${esc(x.cat)} · ${x.visible ? 'ตั้งให้ลูกค้าเห็น' : 'ยังไม่ได้ตั้งให้ลูกค้าเห็น'}</div>${x.internal ? '<p class="q-alert">เอกสารภายใน (เช่น ใบเบิกค่าแรง) — ไม่ควรส่งถึงลูกค้า แนะนำ “ไม่อนุมัติ”</p>' : ''}<div class="row" style="margin-top:10px"><button type="button" class="btn sm" data-qok="docs|${x.id}">อนุมัติ</button><button type="button" class="btn line sm" data-qno="docs|${x.id}">ไม่อนุมัติ</button></div></article>`;
      const total = reps.length + lone.length + docs.length;
      return `<div class="note" style="margin-bottom:18px"><span><b>หลักการ:</b> รูป รายงาน และเอกสารจากหน้างานจะ<b>ยังไม่ถึงลูกค้า</b>จนกว่าผู้มีสิทธิ์อนุมัติที่นี่ · ไม่อนุมัติ = อยู่ในระบบภายในเท่านั้น · ข้อมูลต้นทางใน ERP ไม่ถูกแก้</span></div>
<div class="cols3"><div style="display:grid;gap:18px;align-content:start">
${total ? '' : '<div class="card empty"><p>ไม่มีรายการรออนุมัติ</p><p class="fine">ลองกด “จำลองข้อมูลเข้าจาก ERP” ด้านขวา</p></div>'}
${reps.length ? `<h3 class="q-sec">รายงานความคืบหน้า (${reps.length})</h3>${reps.map(repCard).join('')}` : ''}
${lone.length ? `<h3 class="q-sec">รูปหน้างาน (${lone.length})</h3><div class="q-grid">${lone.map(phCard).join('')}</div>` : ''}
${docs.length ? `<h3 class="q-sec">เอกสาร (${docs.length})</h3>${docs.map(docCard).join('')}` : ''}
</div><aside style="display:grid;gap:18px;align-content:start"><div class="card"><h3>จำลองข้อมูลเข้าจาก ERP</h3><p class="fine" style="margin-top:0">เหมือนพนักงานอัปโหลดรายงาน รูปหน้างาน และเอกสารในระบบ RQ แล้วข้อมูลไหลเข้ามาที่คิวนี้</p>${field('qsP', 'โครงการ', `<select id="qsP">${d.projects.filter(p => p.status === 'ก่อสร้าง').map(p => opt(p.id, p.code + ' · ' + p.name)).join('')}</select>`)}<button type="button" class="btn navy sm" id="qSim">ส่งข้อมูลตัวอย่างเข้ามา</button></div>
<div class="card"><h3>ตัดสินล่าสุด</h3>${hist.map(([k, x, t]) => `<p style="margin:0 0 10px;font-size:14px">${x.status === 'approved' ? '<span class="badge ok">อนุมัติ</span>' : '<span class="badge bad">ไม่อนุมัติ</span>'} ${k} · ${esc(String(t || '').slice(0, 40))}<br><span class="fine">${thTime(x.decidedAt)} · ${esc(x.decidedBy || '')}${x.reason ? ' · ' + esc(x.reason) : ''}</span></p>`).join('') || '<p class="muted">ยังไม่มีประวัติ</p>'}</div></aside></div>`;
    },
    init(ctx) {
      const main = $('.app-main'), who = ctx.roleName;
      const decide = (coll, id, ok, reason) => {
        const dd = db.get(), x = dd[coll].find(y => y.id === id); if (!x) return;
        const stamp = { decidedAt: now(), decidedBy: who };
        if (coll === 'reports') {
          const card = $(`[data-qr="${id}"]`), sum = card && $('[data-qsum]', card);
          if (ok && sum && sum.value.trim()) x.summary = sum.value.trim();
          const linked = dd.photos.filter(p => p.report === id && p.status === 'pending'), keep = [];
          linked.forEach(p => { const el = card && $(`[data-qph="${p.id}"]`, card), inc = ok && (!el || $('[data-qinc]', el).checked); if (el) p.cap = $('[data-qcap]', el).value.trim() || p.cap; Object.assign(p, stamp, inc ? { status: 'approved', upAt: p.upAt || p.at, at: now() } : { status: 'rejected', reason: ok ? 'ไม่เลือกส่งพร้อมรายงาน' : (reason || '') }); if (inc) keep.push(p.src); });
          if (linked.length) x.photos = keep;
          Object.assign(x, stamp, ok ? { status: 'approved', upAt: x.upAt || x.at, at: now() } : { status: 'rejected', reason: reason || '' });
          const p = dd.projects.find(y => y.id === x.project);
          if (ok && p) { p.week = x.week; p.progress = x.progress; if (x.stage) p.stage = x.stage; }
          db.save(dd);
          if (ok && p && x.notify !== false) lineNotify(`PPSD: รายงานความคืบหน้าสัปดาห์ที่ ${x.week} ของ${p.name} (${x.progress}%) พร้อมแล้ว แตะเพื่อดูในบ้านของฉัน`, p.customer, 'B');
          else toast(ok ? 'อนุมัติรายงานแล้ว' : 'ไม่อนุมัติรายงาน', ok ? 'ลูกค้าเห็นในบ้านของฉันแล้ว' : 'รายการนี้อยู่ในระบบภายในเท่านั้น');
        } else {
          if (coll === 'photos') { const el = $(`[data-qp="${id}"] [data-qcap]`); if (el && el.value.trim()) x.cap = el.value.trim(); }
          Object.assign(x, stamp, ok ? { status: 'approved', upAt: x.upAt || x.at, at: coll === 'photos' ? now() : x.at } : { status: 'rejected', reason: reason || '' });
          db.save(dd);
          const p = dd.projects.find(y => y.id === x.project);
          if (ok && coll === 'photos' && p) lineNotify(`PPSD: มีรูปหน้างานใหม่ของ${p.name} แตะเพื่อดูในบ้านของฉัน`, p.customer, 'B');
          else toast(ok ? 'อนุมัติแล้ว' : 'ไม่อนุมัติ', ok ? (coll === 'docs' && !x.visible ? 'เอกสารยังไม่แสดงต่อลูกค้า จนกว่าจะติ๊ก “อนุญาตให้ลูกค้าเห็น” ในเมนูเอกสาร' : 'ลูกค้าเห็นในบ้านของฉันแล้ว') : 'รายการนี้อยู่ในระบบภายในเท่านั้น');
        }
        P.route();
      };
      main.addEventListener('click', e => {
        const ok = e.target.closest('[data-qok]'), no = e.target.closest('[data-qno]');
        if (ok) { const [c, id] = ok.dataset.qok.split('|'); const x = db.get()[c].find(y => y.id === id); if (x && x.internal) return confirmBox('อนุมัติเอกสารภายใน?', 'เอกสารนี้ถูกระบุว่าเป็นเอกสารภายใน การอนุมัติจะทำให้แสดงต่อลูกค้าได้เมื่อเปิด “อนุญาตให้ลูกค้าเห็น” แน่ใจหรือไม่', 'อนุมัติต่อ', () => decide(c, id, true), true); return decide(c, id, true); }
        if (no) { const [c, id] = no.dataset.qno.split('|'); modal('ไม่อนุมัติรายการนี้', `<p>รายการจะไม่ถูกส่งถึงลูกค้า และยังอยู่ใน ERP ตามเดิม</p>${field('qRs', 'เหตุผล (ไม่บังคับ · ทีมหน้างานจะเห็น)', '<input id="qRs" type="text" placeholder="เช่น รูปไม่ชัด / มีข้อมูลภายใน">')}<div class="row" style="margin-top:14px"><button type="button" class="btn danger" id="qRsOk">ยืนยันไม่อนุมัติ</button><button type="button" class="btn line" data-close>ยกเลิก</button></div>`, b => { $('#qRsOk', b).onclick = () => decide(c, id, false, $('#qRs', b).value.trim()); }); }
      });
      const sim = $('#qSim'); if (sim) sim.onclick = () => {
        const dd = db.get(), p = dd.projects.find(x => x.id === $('#qsP').value); if (!p) return toast('ไม่มีโครงการที่กำลังก่อสร้าง');
        const st = (ctx.STAGES.find(([, at]) => at > p.progress) || ctx.STAGES[ctx.STAGES.length - 1])[0], er = 'RQ-' + (now() % 1e5);
        const r = { id: 'R-' + now().toString(36).toUpperCase(), project: p.id, at: now(), week: p.week + 1, progress: Math.min(100, p.progress + 4), stage: st, title: 'รายงานสัปดาห์ที่ ' + (p.week + 1), summary: 'งานสัปดาห์นี้ (ตัวอย่างจาก ERP): ' + st + ' คืบหน้าตามแผน ตรวจแนวและระดับแล้ว', qc: [['ตรวจแนวและระดับ', 'pass']], photos: [], by: 'ทีมหน้างาน (ERP)', status: 'pending', origin: 'erp', erpRef: er, notify: true };
        dd.reports.unshift(r);
        ['img/h5-b-s.jpg', 'img/h5-a-s.jpg'].forEach((src, i) => { dd.photos.unshift({ id: 'F-' + now() + i, project: p.id, src, cap: 'สัปดาห์ ' + r.week + ' · ' + st + ' (' + (2 - i) + ')', at: now(), status: 'pending', report: r.id, origin: 'erp', erpRef: er }); r.photos.unshift(src); });
        dd.docs.unshift({ id: 'D-' + now().toString(36).toUpperCase(), project: p.id, name: 'ใบเบิกค่าแรงช่าง งวดสัปดาห์ ' + r.week + ' (เอกสารภายใน)', cat: 'การเงิน', visible: false, status: 'pending', origin: 'erp', erpRef: er, internal: true, at: now() });
        db.save(dd); toast('ข้อมูลจาก ERP เข้าคิวแล้ว', `${p.code}: รายงาน 1 · รูป 2 · เอกสาร 1 (จำลอง)`); P.route();
      };
    }
  };

  /* ======================= ใบเสนอราคา ======================= */
  const Q_ST = ['ร่าง', 'ส่งให้ลูกค้าแล้ว', 'ลูกค้ายืนยัน', 'ไม่รับ'];
  const qTotal = q => Math.max(0, Math.round(q.area * q.rate + (q.extras || []).reduce((t, x) => t + (Number(x.amount) || 0), 0) - (Number(q.discount) || 0)));
  const quoteDoc = q => { const ds = P.byId(q.design), pk = P.PKG.find(x => x.id === q.pkg) || {}, b = P.CO.branches[0]; return `<div class="qdoc"><div class="qdoc-h"><img src="img/logo-h-gold.png" alt="PPSD"><div><b>${esc(P.CO.nameTh)}</b><span>${esc(b.addr)} · โทร ${esc(P.CO.phone)}</span></div></div>
<div class="row" style="justify-content:space-between;align-items:flex-end;margin:18px 0 12px"><div><span class="eyebrow" style="margin:0">QUOTATION · ฉบับร่าง</span><h3 class="h-m" style="margin:4px 0 0">ใบเสนอราคา ${esc(q.id)}</h3></div><div class="fine" style="text-align:right">วันที่ ${thDate(q.at)}<br>ลูกค้า ${esc(q.name)}${q.phone ? ' · ' + esc(q.phone) : ''}</div></div>
<table class="tbl"><thead><tr><th>รายการ</th><th class="n">จำนวนเงิน (บาท)</th></tr></thead><tbody><tr><td>ค่าก่อสร้าง ${ds ? esc(ds.code + ' ' + ds.name) : 'ตามแบบ'} · แพ็กเกจ ${esc(pk.name || '-')} · ${esc(q.region)}<br><span class="fine">${fmt(q.area)} ตร.ม. × ${fmt(q.rate)} บาท/ตร.ม.</span></td><td class="n">${fmt(q.area * q.rate)}</td></tr>${(q.extras || []).filter(x => x.label).map(x => `<tr><td>${esc(x.label)}</td><td class="n">${fmt(x.amount)}</td></tr>`).join('')}${Number(q.discount) ? `<tr><td>ส่วนลด</td><td class="n">−${fmt(q.discount)}</td></tr>` : ''}<tr class="qdoc-t"><td>รวมทั้งสิ้น (ประมาณการ)</td><td class="n">${fmt(qTotal(q))}</td></tr></tbody></table>
${q.note ? `<p style="margin:12px 0 0">${esc(q.note)}</p>` : ''}<p class="fine" style="margin-top:12px">ราคาประมาณการจากเว็บต้นแบบ · อัตราต่อ ตร.ม. รอยืนยันกับฝ่ายขาย · วัสดุยึดตามตารางรายละเอียดวัสดุและใบยืนยันวัสดุ · ใบเสนอราคาฉบับจริงออกจาก ERP ของบริษัท</p></div>`; };
  P.ADMIN_EXT.quotes = {
    view(ctx) {
      const d = ctx.d, qs = d.quotes || [], reqs = d.leads.filter(l => l.type === 'quote' && !qs.some(q => q.lead === l.id)), ds = P.designs(true);
      return `<div class="cols2"><div class="card"><h3>คำขอใบเสนอราคาจากเว็บไซต์ (${reqs.length})</h3>${reqs.length ? `<div class="scroll-x"><table class="tbl"><thead><tr><th>รหัส</th><th>วันที่</th><th>ลูกค้า</th><th>รายละเอียด</th><th></th></tr></thead><tbody>${reqs.map(l => `<tr><td>${esc(l.id)}</td><td>${thDate(l.at)}</td><td>${esc(l.name)}<br><span class="fine">${esc(l.phone)}</span></td><td style="max-width:240px">${esc(l.detail)}</td><td><button type="button" class="btn line sm" data-qfrom="${esc(l.id)}">สร้างใบเสนอราคา</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">ไม่มีคำขอค้าง</p>'}</div>
<form class="card form" id="qtF" novalidate data-noop><h3>สร้างใบเสนอราคา</h3><input type="hidden" id="qtL"><div class="two">${inp('qtN', 'ชื่อลูกค้า', '', 'required')}${inp('qtT', 'เบอร์โทร', '', 'inputmode="tel"')}</div>
${field('qtD', 'แบบบ้าน', `<select id="qtD">${ds.map(x => opt(x.id, x.code + ' · ' + x.name)).join('')}</select>`)}<div class="three">${field('qtP', 'แพ็กเกจ', `<select id="qtP">${P.PKG.map(p => opt(p.id, p.name)).join('')}</select>`)}${field('qtR', 'พื้นที่ก่อสร้าง', `<select id="qtR">${P.REGIONS.map(([r, k]) => opt(r, r + (k !== 1 ? ' (×' + k + ')' : ''))).join('')}</select>`)}${num('qtA', 'พื้นที่ใช้สอย (ตร.ม.)', '', 'min="30" required')}</div>
<div class="two">${num('qtRate', 'อัตรา (บาท/ตร.ม.)', '', 'min="0" required')}${num('qtDisc', 'ส่วนลด (บาท)', 0, 'min="0"')}</div>
<div class="f"><span class="lbl">รายการเพิ่มเติม</span>${[0, 1, 2].map(i => `<div class="two" style="gap:8px;margin-bottom:6px"><input id="qtX${i}" class="inp" type="text" placeholder="เช่น จุดไฟเพิ่ม 4 จุด"><input id="qtY${i}" class="inp" type="number" min="0" placeholder="จำนวนเงิน"></div>`).join('')}</div>
${area('qtNote', 'หมายเหตุถึงลูกค้า', '', 2)}<p class="qt-sum">รวมประมาณ <b id="qtTot">0</b> บาท</p><button class="btn" type="submit">บันทึกเป็นร่าง</button><p class="fine" style="margin:0">อัตราตั้งต้น = อัตราแพ็กเกจบนเว็บ × ตัวคูณพื้นที่ (ยังรอยืนยัน — Canva มีอัตราอีกชุด) · ระบบจริงสร้างใบเสนอราคาใน ERP แล้วหน้านี้แสดงสถานะและส่งให้ลูกค้า</p></form></div>
<div class="card" style="margin-top:18px"><h3>ใบเสนอราคา (${qs.length})</h3>${qs.length ? `<div class="scroll-x"><table class="tbl"><thead><tr><th>เลขที่</th><th>วันที่</th><th>ลูกค้า</th><th>แบบ / แพ็กเกจ</th><th class="n">ยอดรวม (บาท)</th><th>สถานะ</th><th></th></tr></thead><tbody>${qs.map(q => { const x = P.byId(q.design); return `<tr><td>${esc(q.id)}</td><td>${thDate(q.at)}</td><td>${esc(q.name)}</td><td>${x ? esc(x.code) : '-'} · ${esc((P.PKG.find(p => p.id === q.pkg) || {}).name || '')}</td><td class="n">${fmt(qTotal(q))}</td><td><select data-qst="${esc(q.id)}" aria-label="สถานะ ${esc(q.id)}">${Q_ST.map(s => opt(s, s, q.status === s)).join('')}</select></td><td><button type="button" class="btn line sm" data-qview="${esc(q.id)}">ดู / ส่ง</button></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">ยังไม่มีใบเสนอราคา</p>'}</div>`;
    },
    init(ctx) {
      const f = $('#qtF'), main = $('.app-main');
      const rate = () => { const pk = P.PKG.find(x => x.id === $('#qtP').value) || P.PKG[0], rg = (P.REGIONS.find(r => r[0] === $('#qtR').value) || [, 1])[1]; return Math.round(pk.rate * rg); };
      const read = () => ({ name: v('qtN'), phone: v('qtT'), design: Number(v('qtD')), pkg: v('qtP'), region: v('qtR'), area: Number(v('qtA')) || 0, rate: Number(v('qtRate')) || 0, discount: Number(v('qtDisc')) || 0, extras: [0, 1, 2].map(i => ({ label: v('qtX' + i), amount: Number(v('qtY' + i)) || 0 })).filter(x => x.label), note: v('qtNote'), lead: v('qtL') });
      const sum = () => { $('#qtTot').textContent = fmt(qTotal(read())); };
      const setD = () => { const x = P.byId(v('qtD')); if (x) $('#qtA').value = x.area; sum(); };
      $('#qtD').onchange = setD; ['qtP', 'qtR'].forEach(id => $('#' + id).onchange = () => { $('#qtRate').value = rate(); sum(); });
      f.addEventListener('input', sum); $('#qtRate').value = rate(); setD();
      f.onsubmit = e => {
        e.preventDefault(); if (!validate(f)) return;
        const q = Object.assign(read(), { id: ref('QT'), at: now(), status: 'ร่าง', by: ctx.roleName }), dd = db.get();
        dd.quotes = [q, ...(dd.quotes || [])]; if (q.lead) { const l = dd.leads.find(x => x.id === q.lead); if (l) l.status = 'เสนอราคา'; } db.save(dd);
        toast('บันทึกใบเสนอราคาแล้ว', q.id + ' · ' + fmt(qTotal(q)) + ' บาท'); P.route();
      };
      main.addEventListener('click', e => {
        const fr = e.target.closest('[data-qfrom]');
        if (fr) { const l = db.get().leads.find(x => x.id === fr.dataset.qfrom); if (!l) return; $('#qtL').value = l.id; $('#qtN').value = l.name; $('#qtT').value = l.phone; const m = String(l.detail).match(/PPSD-(\d+)/), x = m && P.byId(m[1]); if (x) $('#qtD').value = x.id; if (/elite/i.test(l.detail)) $('#qtP').value = 'elite'; else if (/premium/i.test(l.detail)) $('#qtP').value = 'premium'; $('#qtRate').value = rate(); setD(); f.scrollIntoView({ behavior: 'smooth', block: 'start' }); toast('ดึงข้อมูลจากคำขอแล้ว', l.id); return; }
        const vw = e.target.closest('[data-qview]');
        if (vw) { const q = (db.get().quotes || []).find(x => x.id === vw.dataset.qview); if (!q) return; modal('ใบเสนอราคา ' + q.id, `${quoteDoc(q)}<div class="row" style="margin-top:16px"><button type="button" class="btn" id="qSend" style="background:#06C755;border-color:#06C755">ส่งให้ลูกค้าทาง LINE OA (จำลอง)</button><button type="button" class="btn line" data-close>ปิด</button></div>`, b => { $('#qSend', b).onclick = () => { const dd = db.get(), x = dd.quotes.find(y => y.id === q.id); x.status = 'ส่งให้ลูกค้าแล้ว'; x.sentAt = now(); db.save(dd); lineNotify(`PPSD: ใบเสนอราคา ${q.id} ของคุณพร้อมแล้ว ทีมขายจะติดต่อเพื่ออธิบายรายละเอียด`, '', 'A'); P.route(); }; }); }
      });
      main.addEventListener('change', e => { const s = e.target.closest('[data-qst]'); if (!s) return; const dd = db.get(), q = dd.quotes.find(x => x.id === s.dataset.qst); q.status = s.value; if (q.lead) { const l = dd.leads.find(x => x.id === q.lead); if (l && s.value === 'ลูกค้ายืนยัน') l.status = 'ปิดการขาย'; } db.save(dd); toast('อัปเดตสถานะใบเสนอราคา', s.value); });
    }
  };

  /* ======================= แคตตาล็อกแบบบ้าน: เพิ่ม ลบ แก้ อัปโหลดรูป แปลน 3D ======================= */
  const ROOF = [['hip', 'ปั้นหยา'], ['gable', 'จั่ว'], ['flat', 'แบน/เพิงแหงน']];
  const COVER_L = ['ภาพจำลองแนวคิด', 'ภาพ 3D จากแปลนจริง', 'ภาพถ่ายบ้านจริง'];
  let ctQ = '';
  P.ADMIN_EXT.catalog = {
    view() {
      const all = P.designsAll(), live = all.filter(x => !x.deleted), trash = all.filter(x => x.deleted);
      const row = x => `<tr data-q="${esc((x.code + ' ' + x.name + ' ' + x.style).toLowerCase())}"${ctQ && !(x.code + ' ' + x.name + ' ' + x.style).toLowerCase().includes(ctQ) ? ' hidden' : ''}><td>${thumb(P.cover(x).src, x.code)}</td><td><a href="#design-${x.id}" class="link-u">${esc(x.code)}</a>${x.custom ? ' <span class="badge gold">ใหม่</span>' : ''}</td><td>${esc(x.name)}</td><td>${esc(x.style)}</td><td>${x.beds} นอน ${x.baths} น้ำ · ${x.floors} ชั้น</td><td class="n">${x.area}</td><td class="n"><input type="number" step="50000" min="0" value="${x.price}" data-price="${x.id}" class="inp" style="width:130px;text-align:right" aria-label="ราคา ${esc(x.code)}"></td><td><input type="checkbox" data-show="${x.id}" ${x.hidden ? '' : 'checked'} aria-label="แสดง ${esc(x.code)}"></td><td class="nowrap"><button type="button" class="btn line sm" data-ded="${x.id}">แก้ไข</button> <button type="button" class="btn ghost-d sm" data-ddel="${x.id}" aria-label="ลบ ${esc(x.code)}">ลบ</button></td></tr>`;
      return `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:12px"><h3 style="margin:0">แบบบ้าน (${live.length})</h3><div class="row"><input id="cdQ" type="search" class="inp" placeholder="ค้นหารหัส ชื่อ หรือสไตล์" value="${esc(ctQ)}" style="min-width:220px"><button type="button" class="btn sm" id="cdAdd">+ เพิ่มแบบบ้าน</button></div></div>
<div class="scroll-x"><table class="tbl"><thead><tr><th>รูป</th><th>รหัส</th><th>ชื่อแบบ</th><th>สไตล์</th><th>ห้อง</th><th class="n">ตร.ม.</th><th class="n">ราคาประมาณ (บาท)</th><th>แสดง</th><th></th></tr></thead><tbody id="cdB">${live.map(row).join('')}</tbody></table></div><p class="fine">แก้ราคาและติ๊ก “แสดง” มีผลกับหน้าเว็บทันที · แบบที่เพิ่มใหม่ยังไม่มีโมเดล 3D อัตโนมัติ อัปโหลดรูปแปลนและใส่ลิงก์ 3D/วิดีโอแทนได้ · ระบบจริงเก็บไฟล์ใน R2</p></div>
${trash.length ? `<div class="card" style="margin-top:18px"><h3>ถังขยะ (${trash.length})</h3><table class="tbl"><tbody>${trash.map(x => `<tr><td>${thumb(P.cover(x).src, x.code)}</td><td>${esc(x.code)} · ${esc(x.name)}</td><td class="n"><button type="button" class="btn line sm" data-drest="${x.id}">กู้คืน</button></td></tr>`).join('')}</tbody></table><p class="fine">แบบในถังขยะไม่แสดงบนเว็บ กู้คืนได้ทุกเมื่อ</p></div>` : ''}`;
    },
    init() {
      const main = $('.app-main');
      $('#cdQ').oninput = e => { ctQ = e.target.value.trim().toLowerCase(); $$('#cdB tr').forEach(tr => tr.hidden = !!ctQ && !tr.dataset.q.includes(ctQ)); };
      $('#cdAdd').onclick = () => designForm(null);
      main.addEventListener('click', e => {
        const ed = e.target.closest('[data-ded]'); if (ed) return designForm(P.designsAll().find(x => x.id === Number(ed.dataset.ded)));
        const dl = e.target.closest('[data-ddel]'); if (dl) { const x = P.designsAll().find(y => y.id === Number(dl.dataset.ddel)); return confirmBox('ลบแบบ ' + x.code + '?', 'แบบจะถูกย้ายไปถังขยะและหายจากหน้าเว็บทันที กู้คืนได้จากถังขยะด้านล่าง', 'ย้ายไปถังขยะ', () => { setOv(x.id, { deleted: true }); toast('ย้ายไปถังขยะแล้ว', x.code); P.route(); }, true); }
        const rs = e.target.closest('[data-drest]'); if (rs) { setOv(Number(rs.dataset.drest), { deleted: false }); toast('กู้คืนแบบแล้ว'); P.route(); }
      });
    }
  };
  const setOv = (id, patch) => { const dd = db.get(); dd.catalog = dd.catalog || {}; dd.catalog[id] = Object.assign({}, dd.catalog[id], patch); db.save(dd); };
  function designForm(x) {
    const isNew = !x, styles = [...new Set(P.DESIGNS.map(d => d.style))];
    const cur = x ? P.cover(x) : null;
    modal(isNew ? 'เพิ่มแบบบ้าน' : 'แก้ไขแบบ ' + x.code, `<form class="form" id="cdF" novalidate data-noop>
<div class="three">${inp('cdC', 'รหัสแบบ', x ? x.code : 'PPSD-', 'required')}${inp('cdN', 'ชื่อแบบ', x ? x.name : '', 'required')}${field('cdS', 'สไตล์', `<input id="cdS" type="text" list="cdSL" required value="${esc(x ? x.style : '')}"><datalist id="cdSL">${styles.map(s => `<option value="${esc(s)}">`).join('')}</datalist>`)}</div>
<div class="three">${field('cdF1', 'จำนวนชั้น', `<select id="cdF1">${[1, 2, 3].map(n => opt(n, n + ' ชั้น', x && x.floors === n)).join('')}</select>`)}${num('cdB1', 'ห้องนอน', x ? x.beds : 3, 'min="1" required')}${num('cdB2', 'ห้องน้ำ', x ? x.baths : 2, 'min="1" required')}</div>
<div class="three">${num('cdA', 'พื้นที่ใช้สอย (ตร.ม.)', x ? x.area : '', 'min="30" required')}${num('cdL', 'ที่ดินขั้นต่ำ (ตร.ว.)', x ? x.land : '', 'min="0"')}${num('cdP', 'ราคาประมาณ (บาท)', x ? x.price : '', 'min="0" step="10000" required')}</div>
<div class="two">${field('cdR', 'ทรงหลังคา', `<select id="cdR">${ROOF.map(([k, l]) => opt(k, l, x && x.roof === k)).join('')}</select>`)}${field('cdCL', 'ป้ายกำกับรูปปก', `<select id="cdCL">${COVER_L.map(l => opt(l, l, cur && cur.label === l)).join('')}</select>`, 'บอกลูกค้าตามจริงว่าเป็นภาพแบบไหน')}</div>
${area('cdDs', 'แนวคิดการออกแบบ', x ? x.desc : '', 4, 'required')}
<div class="two">${uploadBox('cdUC', 'รูปปก (1 รูป)', 'ภาพหลักบนการ์ดแบบบ้าน', 'image/*')}${uploadBox('cdUP', 'รูปแปลนพื้น', 'แสดงในหน้ารายละเอียดแบบ', 'image/*')}</div>
${uploadBox('cdUG', 'ภาพเพิ่มเติม (สูงสุด 4)', '', 'image/*')}
${inp('cdK', 'ลิงก์โมเดล 3D หรือวิดีโอ (ถ้ามี)', x ? x.link3d || '' : '', 'type="url" placeholder="https://"', 'เช่น ลิงก์ YouTube หรือไฟล์ 3D บน Google Drive ที่เปิดสาธารณะ')}
<label class="chk"><input type="checkbox" id="cdV" ${x && x.hidden ? '' : 'checked'}> แสดงบนเว็บไซต์</label>
<p class="mh-err" id="cdErr" role="alert"></p><div class="row"><button class="btn" type="submit">${isNew ? 'เพิ่มแบบบ้าน' : 'บันทึกการแก้ไข'}</button><button type="button" class="btn line" data-close>ยกเลิก</button></div></form>`, b => {
      const fc = uploader($('#cdUC', b), { max: 1, files: pre(cur && cur.src) }), fp = uploader($('#cdUP', b), { max: 1, files: pre(x && x.planImg, 'แปลนปัจจุบัน') }), fg = uploader($('#cdUG', b), { max: 4, files: (x && x.gallery || []).map(s => ({ name: 'ภาพเดิม', src: s })) });
      $('#cdF', b).onsubmit = e => {
        e.preventDefault(); const err = m => { $('#cdErr', b).textContent = m; };
        if (!validate(e.target)) return;
        const code = v('cdC').toUpperCase();
        if (P.designsAll().some(d => d.code.toUpperCase() === code && (!x || d.id !== x.id))) return err('รหัสแบบนี้มีอยู่แล้ว');
        if (!fc.length || !fc[0].src) return err('กรุณาใส่รูปปก 1 รูป');
        const link = v('cdK'); if (link && !/^https?:\/\//.test(link)) return err('ลิงก์ต้องขึ้นต้นด้วย https://');
        const data = { code, name: v('cdN'), style: v('cdS'), floors: Number(v('cdF1')), beds: Number(v('cdB1')), baths: Number(v('cdB2')), area: Number(v('cdA')), total: Number(v('cdA')), land: Number(v('cdL')) || 0, price: Number(v('cdP')), roof: v('cdR'), desc: v('cdDs'), coverLabel: v('cdCL'), planImg: fp.length && fp[0].src ? fp[0].src : '', gallery: fg.filter(f => f.src).map(f => f.src), link3d: link, hidden: !v('cdV') };
        if (!cur || fc[0].src !== cur.src) data.coverImg = fc[0].src;
        if (isNew) { const dd = db.get(), id = Math.max(1000, ...P.designsAll().map(d => d.id)) + 1; dd.customDesigns = [...(dd.customDesigns || []), Object.assign({ id, custom: true, wc: '#EFE6D2', rc: '#4A2C20' }, data, { coverImg: fc[0].src })]; db.save(dd); toast('เพิ่มแบบบ้านแล้ว', code + ' แสดงบนเว็บ' + (data.hidden ? 'เมื่อติ๊กแสดง' : 'แล้ว')); }
        else { setOv(x.id, data); toast('บันทึกแบบบ้านแล้ว', code); }
        P.route();
      };
    });
  }

  /* ======================= เนื้อหาเว็บไซต์: หน้าแรก · หัวเพจ · ข้อมูลบริษัท · FAQ ======================= */
  const PAGES = [['designs', 'แบบบ้านทั้งหมด'], ['works', 'ผลงานก่อสร้างจริง'], ['reviews', 'รีวิวจากลูกค้า'], ['custom-design', 'ออกแบบบ้านตามใจ'], ['modify', 'ปรับแบบบ้าน'], ['fengshui', 'ฮวงจุ้ยและการออกแบบ'], ['process', 'ขั้นตอนสร้างบ้าน'], ['materials', 'วัสดุและมาตรฐาน'], ['services', 'ต่อเติม รีโนเวท'], ['budget-calc', 'คำนวณงบก่อสร้าง'], ['loan', 'คำนวณสินเชื่อ'], ['about', 'เกี่ยวกับ PPSD'], ['why', 'ทำไมต้อง PPSD'], ['warranty', 'มาตรฐานและการรับประกัน'], ['knowledge', 'บทความและความรู้'], ['contact', 'ติดต่อเรา'], ['appointment', 'นัดหมาย'], ['quote', 'ขอใบเสนอราคา'], ['help', 'Help Center']];
  /* อ่านหัวเพจค่าเดิมจากหน้าจริง (ไม่รวมค่าที่แก้) */
  const pageDefault = name => { const keep = P._page; try { P._page = '__none'; const r = P.R[name] && P.R[name](); const box = document.createElement('div'); box.innerHTML = (r && r.html) || ''; const sec = box.querySelector('.ph'); if (!sec) return null; const im = sec.querySelector(':scope > img'); return { title: unem(sec.querySelector('h1').innerHTML), lead: sec.querySelector('.lead') ? dec(sec.querySelector('.lead').textContent).trim() : '', img: im ? im.getAttribute('src') : '' }; } catch (e) { return null; } finally { P._page = keep; } };
  let ctTab = 'home', cpPage = 'designs';
  const TH_KEYS = [['introH', 'หัวข้อแนะนำบริษัท', 1], ['introP', 'ข้อความแนะนำบริษัท', 0], ['featH', 'หัวข้อแบบบ้านแนะนำ', 1], ['whyH', 'หัวข้อเหตุผลที่ลูกค้าไว้วางใจ', 1]];
  P.ADMIN_EXT.content = {
    view() {
      const c = content(), tabs = [['home', 'หน้าแรก'], ['pages', 'หัวเพจแต่ละหน้า'], ['company', 'ข้อมูลบริษัท'], ['faq', 'คำถามที่พบบ่อย']];
      const T = {
        home: () => { const f = c.featured || [41, 49, 59], th = P.I18N.th; return `<form class="card form" id="cmH" novalidate data-noop style="max-width:860px"><h3>ภาพเปิดและข้อความหลัก</h3>${inp('cmH1', 'หัวข้อหลัก (คั่นคำด้วย " = " เพื่อแยกบรรทัด)', c.heroH1 || BASE.TH.heroH1, 'required')}${inp('cmH2', 'ข้อความรอง', c.heroSub || BASE.TH.heroSub)}${uploadBox('cmHI', 'ภาพเปิดหน้าแรก (ภาพแรกของสไลด์)', 'แนะนำภาพแนวนอนอย่างน้อย 1600 px · ภาพจะถูกย่อในเครื่อง', 'image/*')}
<h3 style="margin-top:12px">ข้อความส่วนอื่นในหน้าแรก</h3>${TH_KEYS.map(([k, l, h]) => h ? inp('cmT_' + k, l, unem(th[k]), '', HEAD_TIP) : area('cmT_' + k, l, unem(th[k]), 3)).join('')}
<div class="three">${[0, 1, 2].map(i => field('cmF' + i, 'แบบบ้านแนะนำ ' + (i + 1), `<select id="cmF${i}">${P.designs(true).map(x => opt(x.id, x.code, x.id === f[i])).join('')}</select>`)).join('')}</div>
<div class="row"><button class="btn" type="submit">บันทึกและเผยแพร่</button><a class="btn line" href="#home">ดูหน้าแรก</a></div><p class="fine">ต้นแบบเผยแพร่ทันที · ระบบจริงมีบันทึกร่าง ดูตัวอย่าง และประวัติการแก้ไขก่อนเผยแพร่</p></form>`; },
        pages: () => { const ov = (c.pages || {})[cpPage] || {}, df = pageDefault(cpPage) || { title: '', lead: '', img: '' }; return `<form class="card form" id="cmP" novalidate data-noop style="max-width:860px"><h3>หัวเพจ (ชื่อหน้า คำโปรย และภาพหัวเพจ)</h3>${field('cmPS', 'เลือกหน้า', `<select id="cmPS">${PAGES.map(([k, l]) => opt(k, l + ((c.pages || {})[k] ? ' · แก้แล้ว' : ''), k === cpPage)).join('')}</select>`)}
${inp('cmPT', 'ชื่อหน้า', ov.title || df.title, 'required', HEAD_TIP)}${area('cmPL', 'คำโปรยใต้ชื่อหน้า', ov.lead || df.lead, 2)}${uploadBox('cmPI', 'ภาพหัวเพจ', 'เว้นว่างได้ถ้าไม่ต้องการภาพ', 'image/*')}<input type="hidden" id="cmPD" value="${esc(df.img || '')}">
<div class="row"><button class="btn" type="submit">บันทึกหน้านี้</button><a class="btn line" href="#${cpPage}">ดูหน้า</a>${(c.pages || {})[cpPage] ? '<button type="button" class="btn line" id="cmPR">คืนค่าเดิมหน้านี้</button>' : ''}</div></form>`; },
        company: () => { const co = P.CO; return `<form class="card form" id="cmC" novalidate data-noop style="max-width:860px"><h3>ข้อมูลติดต่อ (แสดงทุกหน้า)</h3><div class="two">${inp('cmCP', 'เบอร์โทร', co.phone, 'required')}${inp('cmCE', 'อีเมล', co.email, 'type="email"')}</div>${inp('cmCH', 'เวลาทำการ', co.hours)}${inp('cmCL', 'ลิงก์ LINE OA', co.line, 'type="url" required')}
<div class="three">${inp('cmCF', 'Facebook', co.facebook, 'type="url"')}${inp('cmCI', 'Instagram', co.instagram, 'type="url"')}${inp('cmCY', 'YouTube', co.youtube, 'type="url"')}</div>
<h3 style="margin-top:12px">ที่อยู่สาขา</h3>${co.branches.map((b, i) => `<div class="f-grp">${area('cmB' + i, b.th, b.addr, 2, 'required')}<label class="chk"><input type="checkbox" id="cmBV${i}" ${b.verified ? 'checked' : ''}> ยืนยันที่อยู่เต็มแล้ว (ไม่แสดงป้าย “รอยืนยัน”)</label></div>`).join('')}
<div class="row"><button class="btn" type="submit">บันทึกข้อมูลบริษัท</button></div><p class="fine">ข้อมูลเหล่านี้ต้องเป็นข้อมูลจริงของบริษัทเท่านั้น</p></form>`; },
        faq: () => { const list = c.faq || baseFaq(); return `<div class="card" style="max-width:960px"><div class="row" style="justify-content:space-between;margin-bottom:10px"><h3 style="margin:0">คำถามที่พบบ่อย (${list.length})</h3><button type="button" class="btn line sm" id="cmQA">+ เพิ่มคำถาม</button></div><div id="cmQL">${list.map(faqRow).join('')}</div><div class="row" style="margin-top:14px"><button type="button" class="btn" id="cmQS">บันทึก FAQ</button><a class="btn line" href="#help">ดู Help Center</a></div><p class="fine">คำตอบใช้ทั้งในหน้า Help Center และหน้าความรู้</p></div>`; }
      };
      return `<div class="row cms-tabs" role="tablist" style="gap:8px;margin-bottom:18px">${tabs.map(([k, l]) => `<button type="button" role="tab" class="chip${k === ctTab ? ' on' : ''}" aria-selected="${k === ctTab}" data-ctt="${k}">${l}</button>`).join('')}</div>${T[ctTab]()}
<div class="row" style="margin-top:22px"><button type="button" class="btn ghost-d sm" id="cmReset">คืนค่าเนื้อหาทั้งหมดเป็นค่าเดิม</button></div>`;
    },
    init(ctx) {
      const main = $('.app-main');
      main.addEventListener('click', e => { const t = e.target.closest('[data-ctt]'); if (t) { ctTab = t.dataset.ctt; ctx.setTab('content'); } });
      $('#cmReset').onclick = () => confirmBox('คืนค่าเนื้อหาทั้งหมด?', 'ข้อความหน้าแรก หัวเพจ ข้อมูลบริษัท FAQ ผลงานและรีวิวที่แก้ไว้จะกลับเป็นค่าเดิม (แบบบ้านไม่เปลี่ยน)', 'คืนค่าเดิม', () => { saveContent({}); toast('คืนค่าเนื้อหาเดิมแล้ว'); P.route(); }, true);
      if (ctTab === 'home') {
        const c0 = content(), fh = uploader($('#cmHI'), { max: 1, files: pre(c0.heroImg || 'img/hero.jpg', c0.heroImg ? 'ภาพที่อัปโหลด' : 'ภาพเดิม') });
        $('#cmH').onsubmit = e => {
          e.preventDefault(); if (!validate(e.target)) return;
          const c = content(), i18n = Object.assign({}, c.i18n);
          TH_KEYS.forEach(([k, , h]) => { const val = v('cmT_' + k); if (!val || val === unem(BASE.TH[k])) delete i18n[k]; else i18n[k] = h ? em(val) : esc(val); });
          const hi = fh.length && fh[0].src && fh[0].src !== 'img/hero.jpg' ? fh[0].src : '';
          saveContent(Object.assign({}, c, { heroH1: v('cmH1'), heroSub: v('cmH2'), heroImg: hi, i18n, featured: [0, 1, 2].map(i => Number(v('cmF' + i))) }));
          toast('เผยแพร่หน้าแรกแล้ว', 'เปิดดูได้ที่หน้าแรก');
        };
      }
      if (ctTab === 'pages') {
        const ov = (content().pages || {})[cpPage] || {}, df = $('#cmPD').value, fi = uploader($('#cmPI'), { max: 1, files: pre(ov.img || df, ov.img ? 'ภาพที่อัปโหลด' : 'ภาพเดิม') });
        $('#cmPS').onchange = e => { cpPage = e.target.value; ctx.setTab('content'); };
        $('#cmP').onsubmit = e => {
          e.preventDefault(); if (!validate(e.target)) return;
          const c = content(), pages = Object.assign({}, c.pages), dft = pageDefault(cpPage) || {}, src = fi.length && fi[0].src ? fi[0].src : '';
          const t = v('cmPT'), l = v('cmPL'), entry = { title: t !== dft.title ? t : '', lead: l !== dft.lead ? l : '', img: src && src !== df ? src : '' };
          if (!src && df) entry.img = 'none';
          if (!entry.title && !entry.lead && !entry.img) delete pages[cpPage]; else pages[cpPage] = entry;
          saveContent(Object.assign({}, c, { pages })); toast('บันทึกหัวเพจแล้ว', (PAGES.find(p => p[0] === cpPage) || [, ''])[1]); P.route();
        };
        const r = $('#cmPR'); if (r) r.onclick = () => { const c = content(), pages = Object.assign({}, c.pages); delete pages[cpPage]; saveContent(Object.assign({}, c, { pages })); toast('คืนค่าหัวเพจเดิมแล้ว'); P.route(); };
      }
      if (ctTab === 'company') {
        $('#cmC').onsubmit = e => {
          e.preventDefault(); if (!validate(e.target)) return;
          const c = content();
          saveContent(Object.assign({}, c, { company: { phone: v('cmCP'), email: v('cmCE'), hours: v('cmCH'), line: v('cmCL'), facebook: v('cmCF'), instagram: v('cmCI'), youtube: v('cmCY'), branches: P.CO.branches.map((b, i) => ({ addr: v('cmB' + i), verified: v('cmBV' + i) })) } }));
          toast('บันทึกข้อมูลบริษัทแล้ว', 'ส่วนหัว ส่วนท้าย และปุ่มติดต่ออัปเดตแล้ว');
        };
      }
      if (ctTab === 'faq') {
        const L = $('#cmQL');
        $('#cmQA').onclick = () => { L.insertAdjacentHTML('afterbegin', faqRow({ cat: 'ทั่วไป', q: '', a: '' })); $('[data-fq]', L).focus(); };
        L.addEventListener('click', e => { const d = e.target.closest('[data-fdel]'); if (d) d.closest('.faq-row').remove(); });
        $('#cmQS').onclick = () => {
          const rows = $$('.faq-row', L).map(r => ({ cat: $('[data-fc]', r).value.trim() || 'ทั่วไป', q: $('[data-fq]', r).value.trim(), a: $('[data-fa]', r).value.trim(), link: r.dataset.link || '', linkL: r.dataset.linkl || '', hidden: !$('[data-fv]', r).checked })).filter(f => f.q && f.a);
          saveContent(Object.assign({}, content(), { faq: rows })); toast('บันทึก FAQ แล้ว', rows.length + ' คำถาม'); P.route();
        };
      }
    }
  };
  const faqRow = f => `<div class="faq-row" data-link="${esc(f.link || '')}" data-linkl="${esc(f.linkL || '')}"><div class="faq-g"><input class="inp" data-fc value="${esc(f.cat)}" aria-label="หมวด" placeholder="หมวด"><input class="inp" data-fq value="${esc(dec(f.q))}" aria-label="คำถาม" placeholder="คำถาม"></div><textarea class="inp" data-fa rows="2" aria-label="คำตอบ" placeholder="คำตอบ">${esc(dec(f.a))}</textarea><div class="row" style="justify-content:space-between"><label class="chk"><input type="checkbox" data-fv ${f.hidden ? '' : 'checked'}> แสดง</label><button type="button" class="btn ghost-d sm" data-fdel>ลบ</button></div></div>`;

  /* ======================= ผลงานและรีวิว ======================= */
  P.ADMIN_EXT.works = {
    view() {
      const ws = allWorks();
      return `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:12px"><h3 style="margin:0">ผลงาน (${ws.length})</h3><button type="button" class="btn sm" id="wkAdd">+ เพิ่มผลงาน</button></div>
<div class="scroll-x"><table class="tbl"><thead><tr><th>รูป</th><th>ชื่อผลงาน</th><th>ประเภท</th><th>สถานะ</th><th>รีวิว</th><th>แสดงผลงาน</th><th></th></tr></thead><tbody>${ws.map(w => `<tr><td>${thumb(P.src(w.img, '-s'), w.name)}</td><td>${esc(w.name)}${w.custom ? ' <span class="badge gold">ใหม่</span>' : ''}</td><td>${esc(w.type)}</td><td>${w.status === 'live' ? 'กำลังก่อสร้าง' : 'ส่งมอบแล้ว'}</td><td>${w.quote ? `${w.reviewHidden ? '<span class="badge">ซ่อนรีวิว</span>' : '<span class="badge ok">แสดงรีวิว</span>'} ${w.consent ? '<span class="badge ok">ได้รับอนุญาต</span>' : '<span class="badge warn">รอขออนุญาต</span>'}` : '<span class="fine">ไม่มี</span>'}</td><td><input type="checkbox" data-wshow="${w.id}" ${w.hidden ? '' : 'checked'} aria-label="แสดง ${esc(w.name)}"></td><td class="nowrap"><button type="button" class="btn line sm" data-wed="${w.id}">แก้ไข</button>${w.custom ? ` <button type="button" class="btn ghost-d sm" data-wdel="${w.id}">ลบ</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
<p class="fine">ผลงานในโค้ดเดิมลบไม่ได้ ซ่อนได้ด้วยการเอาติ๊ก “แสดงผลงาน” ออก · รีวิวควรแสดงเมื่อเจ้าของบ้านอนุญาตแล้วเท่านั้น · ไม่ใส่ชื่อจริงหรือบ้านเลขที่ของลูกค้า</p></div>`;
    },
    init() {
      const main = $('.app-main');
      $('#wkAdd').onclick = () => workForm(null);
      main.addEventListener('click', e => {
        const ed = e.target.closest('[data-wed]'); if (ed) return workForm(allWorks().find(w => w.id === Number(ed.dataset.wed)));
        const dl = e.target.closest('[data-wdel]'); if (dl) { const w = allWorks().find(x => x.id === Number(dl.dataset.wdel)); return confirmBox('ลบผลงานนี้?', esc(w.name) + ' จะหายจากหน้าเว็บ', 'ลบผลงาน', () => { const c = content(); saveContent(Object.assign({}, c, { customWorks: (c.customWorks || []).filter(x => x.id !== w.id) })); toast('ลบผลงานแล้ว'); P.route(); }, true); }
      });
      main.addEventListener('change', e => { const s = e.target.closest('[data-wshow]'); if (!s) return; setWork(Number(s.dataset.wshow), { hidden: !s.checked }); toast(s.checked ? 'แสดงผลงานแล้ว' : 'ซ่อนผลงานแล้ว'); });
    }
  };
  const setWork = (id, patch) => { const c = content(), cw = c.customWorks || [], i = cw.findIndex(w => w.id === id); if (i >= 0) { cw[i] = Object.assign({}, cw[i], patch); saveContent(Object.assign({}, c, { customWorks: cw })); } else { const wo = Object.assign({}, c.works); wo[id] = Object.assign({}, wo[id], patch); saveContent(Object.assign({}, c, { works: wo })); } };
  function workForm(w) {
    const isNew = !w, map = {};
    const pf = (k, size) => { if (!k) return null; const s = P.src(k, size); map[s] = k; return { name: 'รูปเดิม', src: s }; };
    modal(isNew ? 'เพิ่มผลงาน' : 'แก้ไขผลงาน', `<form class="form" id="wkF" novalidate data-noop>
${inp('wkN', 'ชื่อผลงาน', w ? w.name : '', 'required', 'ไม่ใส่ชื่อเจ้าของบ้านหรือบ้านเลขที่')}<div class="three">${field('wkT', 'ประเภท', `<input id="wkT" type="text" list="wkTL" required value="${esc(w ? w.type : 'ชั้นเดียว')}"><datalist id="wkTL"><option value="ชั้นเดียว"><option value="สองชั้น"><option value="สามชั้น"><option value="บ้านและโรงงาน"></datalist>`)}${field('wkS', 'สถานะ', `<select id="wkS">${opt('done', 'ส่งมอบแล้ว', !w || w.status !== 'live')}${opt('live', 'กำลังก่อสร้าง', w && w.status === 'live')}</select>`)}${num('wkW', 'สัปดาห์ที่ (ถ้ากำลังก่อสร้าง)', w ? w.week || '' : '', 'min="0"')}</div>
<div class="two">${inp('wkA', 'พื้นที่ (เช่น 509 ตร.ม.)', w ? w.area : '')}${inp('wkM', 'ระยะเวลาก่อสร้าง (เช่น 10 เดือน)', w ? w.months || '' : '')}</div>
<div class="three">${uploadBox('wkUI', 'รูปหลัก', 'ภาพถ่ายผลงานจริง', 'image/*')}${uploadBox('wkU3', 'ภาพ 3D ก่อนสร้าง', 'ถ้าไม่มี ใช้รูปหลักแทน', 'image/*')}${uploadBox('wkUG', 'รูปเพิ่มเติม (สูงสุด 6)', '', 'image/*')}</div>
${area('wkSp', 'จุดเด่นของหลังนี้ (บรรทัดละ 1 ข้อ)', w ? (w.spec || []).join('\n') : '', 3)}
<h3 style="margin:8px 0 0">รีวิวจากเจ้าของบ้าน</h3>${area('wkQ', 'ข้อความรีวิว', w ? w.quote || '' : '', 3)}${inp('wkWho', 'ผู้รีวิว (ไม่ใส่ชื่อเต็ม เช่น เจ้าของบ้าน · ราชบุรี)', w ? w.who || '' : 'เจ้าของบ้าน · ราชบุรี')}
<label class="chk"><input type="checkbox" id="wkC" ${w && w.consent ? 'checked' : ''}> เจ้าของบ้านอนุญาตให้เผยแพร่รูปและรีวิวแล้ว</label><label class="chk"><input type="checkbox" id="wkRV" ${w && w.reviewHidden ? '' : 'checked'}> แสดงรีวิวในหน้ารีวิว</label><label class="chk"><input type="checkbox" id="wkV" ${w && w.hidden ? '' : 'checked'}> แสดงผลงานบนเว็บไซต์</label>
<p class="mh-err" id="wkErr" role="alert"></p><div class="row"><button class="btn" type="submit">${isNew ? 'เพิ่มผลงาน' : 'บันทึก'}</button><button type="button" class="btn line" data-close>ยกเลิก</button></div></form>`, b => {
      const fi = uploader($('#wkUI', b), { max: 1, files: [pf(w && w.img)].filter(Boolean) }), f3 = uploader($('#wkU3', b), { max: 1, files: [pf(w && w.r3d)].filter(Boolean) }), fg = uploader($('#wkUG', b), { max: 6, files: (w ? w.gal || [] : []).map(k => pf(k, '-s')).filter(Boolean) });
      const back = f => f && f.src ? (map[f.src] || f.src) : '';
      $('#wkF', b).onsubmit = e => {
        e.preventDefault(); if (!validate(e.target)) return;
        if (!fi.length || !fi[0].src) return ($('#wkErr', b).textContent = 'กรุณาใส่รูปหลัก 1 รูป');
        const data = { name: v('wkN'), type: v('wkT'), status: v('wkS'), week: Number(v('wkW')) || 0, area: v('wkA'), months: v('wkM'), img: back(fi[0]), r3d: back(f3[0]) || back(fi[0]), gal: fg.map(back).filter(Boolean), spec: v('wkSp').split('\n').map(x => x.trim()).filter(Boolean), quote: v('wkQ'), who: v('wkWho'), consent: v('wkC'), reviewHidden: !v('wkRV'), hidden: !v('wkV') };
        if (!data.gal.length) data.gal = [data.img];
        if (data.quote && !data.consent && !data.reviewHidden) toast('รีวิวนี้ยังไม่ได้ติ๊กว่าเจ้าของบ้านอนุญาต', 'ควรขออนุญาตก่อนเผยแพร่');
        if (isNew) { const c = content(), id = Math.max(100, ...allWorks().map(x => x.id), ...(c.customWorks || []).map(x => x.id)) + 1; saveContent(Object.assign({}, c, { customWorks: [...(c.customWorks || []), Object.assign({ id, custom: true, tl: [] }, data)] })); toast('เพิ่มผลงานแล้ว'); }
        else { setWork(w.id, data); toast('บันทึกผลงานแล้ว'); }
        P.route();
      };
    });
  }
})(window.PPSD);
