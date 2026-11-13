/* PPSD HOME BUILDER — หน้าเว็บสาธารณะ */
(function (P) {
  'use strict';
  const { $, $$, esc, fmt, mil, up100, img, src, rimg, store, db, ref, t, I, consent, field, ph, istrip, subnav, opt, validate, formData, uploader, uploadBox, modal, toast, go } = P;
  const R = P.R;
  const monthly = (loan, ratePct, yrs) => { const r = ratePct / 100 / 12, n = yrs * 12; if (n <= 0) return 0; return r > 0 ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n; };
  P.monthly = monthly;

  /* ---------- แบบบ้าน ---------- */
  const overrides = () => db.get().catalog || {};
  /* แบบบ้านทั้งหมด = ชุดในโค้ด + แบบที่เพิ่มจากหลังบ้าน แล้วทับด้วยค่าที่แก้จากหลังบ้าน (รวมแบบที่อยู่ในถังขยะ) */
  const designsAll = () => { const o = overrides(); return [...P.DESIGNS, ...(db.get().customDesigns || [])].map(d => Object.assign({}, d, o[d.id] || {})); };
  const designs = (all) => designsAll().filter(d => !d.deleted && (all || !d.hidden));
  P.designsAll = designsAll;
  const byId = id => designs(true).find(d => d.id === Number(id));
  P.designs = designs; P.byId = byId;
  const featuredIds = () => { const c = db.get().content || {}; const ok = (c.featured || []).filter(id => byId(id)); return ok.length ? ok : [41, 49, 59]; };
  const floorTx = d => d.floors === 1 ? 'ชั้นเดียว' : d.floors + ' ชั้น';
  const roofTx = { hip: 'ปั้นหยา', gable: 'จั่ว', flat: 'แบน/เพิงแหงน' };
  const cover = (d, small = true) => d.coverImg ? { src: d.coverImg, label: d.coverLabel || 'ภาพจำลองแนวคิด' } : d.cover ? { src: `img/r/${d.cover}${small ? '-s' : ''}.jpg`, label: 'ภาพจำลองแนวคิด' } : { src: `img/plans/ppsd-${d.id}${small ? '-s' : ''}.jpg`, label: 'ภาพ 3D จากแปลนจริง' };
  const fav = () => { const v = store.get('ppsdFav', []); return Array.isArray(v) ? v : []; };
  const cmp = () => { const v = store.get('ppsdCmp', []); return Array.isArray(v) ? v : []; };
  P.fav = fav; P.cover = cover;
  const card = d => { const c = cover(d), f = fav().includes(d.id), m = cmp().includes(d.id);
    return `<article class="hc rv"><a href="#design-${d.id}" aria-label="${esc(d.name)}"><div class="ratio${d.cover ? '' : ' shot'}"><img src="${c.src}" alt="${esc(c.label + ' ' + d.name)}" loading="lazy" decoding="async"><span class="tag-c">${c.label}</span></div></a>
<div class="hc-acts"><button type="button" class="ic-btn${f ? ' on' : ''}" data-fav="${d.id}" aria-pressed="${f}" aria-label="${f ? 'เอาออกจากที่บันทึก' : 'บันทึกแบบบ้าน'} ${esc(d.code)}">${I.heart}</button><button type="button" class="ic-btn${m ? ' on' : ''}" data-cmp="${d.id}" aria-pressed="${m}" aria-label="${m ? 'เอาออกจากการเปรียบเทียบ' : 'เพิ่มในการเปรียบเทียบ'} ${esc(d.code)}">${I.cmp}</button></div>
<a href="#design-${d.id}" class="hc-b"><div class="hc-top"><span class="hc-code">${d.code}</span><span class="hc-tag">${d.style}</span></div><h3>${esc(d.name)}</h3><div class="hc-meta"><span class="ico">${I.area}${d.area} ตร.ม.</span><span class="ico">${I.bed}${d.beds} นอน</span><span class="ico">${I.bath}${d.baths} น้ำ</span><span class="ico">${I.layers}${floorTx(d)}</span></div><div class="hc-foot"><span class="hc-price">ราคาประมาณ<b>${mil(d.price)}</b>ล้านบาท</span><span class="hc-go" aria-hidden="true">${I.arrow}</span></div></a></article>`; };
  P.card = card;

  /* บันทึก / เปรียบเทียบ (ใช้ทุกหน้า) */
  function drawCmpBar() {
    let bar = $('#cmpBar'); const ids = cmp();
    if (!bar) { bar = document.createElement('div'); bar.id = 'cmpBar'; bar.className = 'cmp-bar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'แบบที่เลือกเปรียบเทียบ'); document.body.appendChild(bar); }
    const ds = ids.map(byId).filter(Boolean);
    bar.innerHTML = `<div class="ims">${ds.map(d => `<img src="${cover(d).src}" alt="${esc(d.code)}">`).join('')}</div><span>เลือกเปรียบเทียบ ${ds.length}/3</span><button type="button" class="btn gold sm" data-cmp-open ${ds.length < 2 ? 'disabled' : ''}>เปรียบเทียบ</button><button type="button" class="btn ghost-l sm" data-cmp-clear>ล้าง</button>`;
    bar.classList.toggle('show', ds.length > 0 && !document.body.classList.contains('app-mode'));
  }
  function compareModal(ids) {
    const ds = (ids || cmp()).map(byId).filter(Boolean);
    const rows = [['รหัสแบบ', d => d.code], ['สไตล์', d => d.style], ['จำนวนชั้น', floorTx], ['ห้องนอน', d => d.beds], ['ห้องน้ำ', d => d.baths], ['พื้นที่ใช้สอย', d => d.area + ' ตร.ม.'], ['ที่ดินขั้นต่ำ', d => d.land + ' ตร.ว.'], ['หลังคา', d => roofTx[d.roof] || '-'], ['ราคาประมาณ', d => fmt(d.price) + ' บาท'], ['ผ่อนต่อเดือนโดยประมาณ*', d => fmt(up100(monthly(d.price * 0.9, 6, 30))) + ' บาท']];
    modal('เปรียบเทียบแบบบ้าน', `<div class="scroll-x"><table class="tbl" style="min-width:${180 + ds.length * 200}px"><thead><tr><th></th>${ds.map(d => `<th><a href="#design-${d.id}" data-close><img src="${cover(d).src}" alt="" style="aspect-ratio:4/3;object-fit:cover;width:100%"><span style="display:block;margin-top:8px;color:var(--navy);font-size:14.5px">${esc(d.name)}</span></a></th>`).join('')}</tr></thead><tbody>${rows.map(([k, f]) => `<tr><th scope="row">${k}</th>${ds.map(d => `<td>${f(d)}</td>`).join('')}</tr>`).join('')}<tr><th></th>${ds.map(d => `<td><a class="btn sm" href="#quote-${d.id}" data-close>ขอใบเสนอราคา</a></td>`).join('')}</tr></tbody></table></div><p class="fine" style="margin-top:14px">*คิดจากวงเงินกู้ 90% ดอกเบี้ย 6% 30 ปี · ราคาและพื้นที่เป็นค่าประมาณ รอยืนยันจากทีม</p>`);
  }
  P.compareModal = compareModal;
  document.addEventListener('click', e => {
    const f = e.target.closest('[data-fav]');
    if (f) { e.preventDefault(); const id = Number(f.dataset.fav); let l = fav(); const on = !l.includes(id); l = on ? [...l, id] : l.filter(x => x !== id); store.set('ppsdFav', l); $$(`[data-fav="${id}"]`).forEach(b => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); if (b.dataset.label) b.querySelector('span').textContent = on ? 'บันทึกแล้ว' : 'บันทึกแบบนี้'; }); toast(on ? 'บันทึกแบบบ้านแล้ว' : 'เอาออกจากที่บันทึกแล้ว', on ? 'ดูได้ที่ เมนู บ้านของเรา › แบบบ้านที่บันทึกไว้' : ''); if (P.onFav) P.onFav(); return; }
    const c = e.target.closest('[data-cmp]');
    if (c) { e.preventDefault(); const id = Number(c.dataset.cmp); let l = cmp(); if (l.includes(id)) l = l.filter(x => x !== id); else if (l.length >= 3) { toast('เปรียบเทียบได้สูงสุด 3 แบบ', 'เอาแบบเดิมออกก่อน'); return; } else l = [...l, id]; store.set('ppsdCmp', l); $$(`[data-cmp="${id}"]`).forEach(b => { const on = l.includes(id); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); drawCmpBar(); return; }
    if (e.target.closest('[data-cmp-open]')) return compareModal();
    if (e.target.closest('[data-cmp-clear]')) { store.set('ppsdCmp', []); $$('[data-cmp].on').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); }); drawCmpBar(); }
  });
  window.addEventListener('hashchange', () => setTimeout(drawCmpBar, 0));
  setTimeout(drawCmpBar, 0);

  /* ส่งคำขอเข้าระบบบริษัท (RQ "บ้านดี ดวงดี" → เมนู 🌐 คำขอจากเว็บไซต์ + แจ้งกลุ่ม LINE ทันที)
     เปิดใช้เมื่อตั้ง window.PPSD_LEAD_API ใน index.html · ถ้าไม่ตั้ง = แบบเดิม (เก็บในเบราว์เซอร์อย่างเดียว ต้นแบบ) */
  P.LEAD_API = window.PPSD_LEAD_API || '';
  let leadPending = null;
  function leadOut(type, name, phone, detail) {
    if (!P.LEAD_API) return;
    const body = { type, name, phone: String(phone || '').replace(/\D/g, ''), detail: String(detail || '').slice(0, 1500), design: (String(detail || '').match(/PPSD-\d+/) || [''])[0], page: String(location.hash || '#home').slice(0, 120), consent: true };
    const send = () => fetch(P.LEAD_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(r => r.json().catch(() => ({})).then(j => { if (!r.ok || !j.ok) throw new Error(j.error || 'ระบบไม่ตอบรับ (' + r.status + ')'); return j; }));
    leadPending = { send, p: send() };
  }
  /* หน้ายืนยัน: ระหว่างส่งขึ้น "กำลังส่ง…" → ได้เลขที่จากระบบ หรือแจ้งว่าส่งไม่สำเร็จ พร้อมปุ่มลองใหม่ / ทัก LINE */
  function leadWatch(L) {
    const box = [...$$('.done-box')].pop(); if (!box) return;
    const st = $('[data-lead-st]', box), fine = $('.fine', box), h = $('h3', box), title = h ? h.textContent : '', msg = $('p.muted', box);
    const ok = j => { st.style.color = 'var(--ok)'; st.textContent = 'ส่งเรียบร้อย · เลขที่ ' + j.ref; if (h) h.textContent = title; if (msg) msg.hidden = false; if (fine) fine.textContent = 'ทีมงาน PPSD ได้รับเรื่องแล้ว และจะติดต่อกลับตามเบอร์ที่คุณให้ไว้'; };
    const bad = e => { st.style.color = '#B3261E'; st.textContent = 'ส่งไม่สำเร็จ · ' + (e instanceof TypeError ? 'เชื่อมต่อระบบไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง' : (e && e.message) || 'เชื่อมต่อไม่ได้'); if (h) h.textContent = 'ยังส่งคำขอไม่สำเร็จ'; if (msg) msg.hidden = true; if (fine) fine.innerHTML = `ข้อมูลยังไม่ถึงทีมงาน <button type="button" class="btn" data-lead-retry style="margin:8px 8px 0 0">ลองส่งอีกครั้ง</button><a class="btn line" href="${esc(P.CO.line)}" target="_blank" rel="noopener" style="margin-top:8px">ทักทาง LINE</a>`; const b = $('[data-lead-retry]', box); if (b) b.onclick = () => { b.disabled = true; st.style.color = ''; st.textContent = 'กำลังส่ง…'; L.send().then(ok, bad); }; };
    L.p.then(ok, bad);
  }
  /* ฟอร์มที่ส่งเข้า CRM: บันทึกแล้วแสดงหน้ายืนยัน */
  function submitLead(form, type, source, detail, extra) {
    if (!validate(form)) return null;
    const v = formData(form);
    const name = v[form.dataset.name] || '', phone = v[form.dataset.phone] || '', det = typeof detail === 'function' ? detail(v) : detail;
    const r = ref({ quote: 'Q', appointment: 'AP', fengshui: 'FS', custom: 'CD', modify: 'MD', estimate: 'ES', land: 'LD', service: 'SV', aftercare: 'AS' }[type] || 'L');
    db.add('leads', Object.assign({ id: r, type, source: 'เว็บไซต์ · ' + source, name, phone, detail: det, status: 'ใหม่', seg: 'A' }, extra || {}));
    leadOut(type, name, phone, det);
    return { ref: r, v };
  }
  P.submitLead = submitLead; P.leadOut = leadOut;
  const showDone0 = (form, html) => { form.outerHTML = html; const b = $('.done-box'); if (b) { b.focus(); b.scrollIntoView({ behavior: 'smooth', block: 'center' }); } };
  const doneBox = (r, title, body, cta) => `<div class="done-box" role="status" tabindex="-1"><span class="eyebrow" style="color:var(--ok)" data-lead-st>${leadPending ? 'กำลังส่ง…' : 'ส่งเรียบร้อย · ' + r}</span><h3 class="h-m">${title}</h3><p class="muted" style="margin-top:8px">${body}</p><p class="fine">ทีมงาน PPSD จะติดต่อกลับตามช่องทางที่คุณให้ไว้</p>${cta || `<div class="row" style="margin-top:14px"><a class="btn" href="#appointment">นัดปรึกษาสถาปนิก</a><a class="btn line" href="#designs">ดูแบบบ้าน</a></div>`}</div>`;
  P.doneBox = doneBox;
  const leadDone = () => { if (leadPending) { const L = leadPending; leadPending = null; leadWatch(L); } };
  const showDone = (form, html) => { showDone0(form, html); leadDone(); };
  P.showDone = showDone;
  const nameTel = (n, tl) => `<div class="two">${field(n, 'ชื่อ–นามสกุล หรือชื่อเล่น', `<input id="${n}" type="text" required autocomplete="name">`)}${field(tl, 'เบอร์โทร', `<input id="${tl}" type="tel" required autocomplete="tel" inputmode="tel" placeholder="08x xxx xxxx">`)}</div>`;
  P.nameTel = nameTel;

  /* ---------- หน้าแรก ---------- */
  const VIDEO_POSTER = 'r/sea-reflection';
  const film = (big) => `<section class="film" id="film" aria-label="${t('filmH')}"><div class="film-frame">${rimg('sea-reflection', 'ภาพตัวอย่างประกอบวิดีโอ')}<div class="film-ov"><span class="eyebrow" style="color:var(--gold-2)">${t('filmEyebrow')}</span><h2 class="${big ? 'h-xl' : 'h-l'}" style="color:#fff">${t('filmH')}</h2><button type="button" class="play" data-play aria-label="${t('play')}">${I.play}</button><span class="film-note">ภาพนี้เป็นภาพตัวอย่าง (ไม่ใช่ภาพจากวิดีโอ) · แตะเพื่อเล่นวิดีโอจาก YouTube</span></div></div><div class="film-bar"><span>PPSD Construction · วิดีโอแนะนำบริษัท</span><a href="https://www.youtube.com/watch?v=${P.CO.video}" target="_blank" rel="noopener">${t('openYt')}</a></div></section>`;
  document.addEventListener('click', e => { const b = e.target.closest('[data-play]'); if (!b) return; const fr = b.closest('.film-frame'); fr.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${P.CO.video}?autoplay=1&rel=0&modestbranding=1" title="วิดีโอแนะนำบริษัท PPSD" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`; });

  R.home = () => {
    const c = db.get().content || {}, en = P.getLang() === 'en';
    const h1 = (!en && c.heroH1) || t('heroH1'), sub = (!en && c.heroSub) || t('heroSub');
    /* ภาษาไทยแสดงแค่ “สร้างบ้าน = PPSD บ้านดี ดวงดี” ไม่มี “By PPSD” ต่อท้าย (สั่ง 13 พ.ย. 2569) · EN ยังคงไว้จนกว่าจะได้ข้อความจากเว็บเก่า */
    const by = en ? t('heroBy') : '';
    const feats = [['house', 'f1'], ['shield', 'f2'], ['team', 'f3'], ['pin', 'f4']];
    const feat = featuredIds().map(byId).filter(Boolean).slice(0, 3);
    const why = [['shield', 'w1', 'w1d'], ['coin', 'w2', 'w2d'], ['inspect', 'w3', 'w3d'], ['team', 'w4', 'w4d'], ['key', 'w5', 'w5d']];
    const heroSrc = c.heroImg || 'img/hero.jpg';
    const slides = [{ src: heroSrc }, ...[41, 49, 56, 59, 63].map(byId).filter(d => d && !d.hidden).map(d => ({ src: cover(d, false).src, d }))];
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let intro = false; try { intro = !reduce && !sessionStorage.getItem('ppsdIntro'); sessionStorage.setItem('ppsdIntro', '1'); } catch (e) { intro = false; }
    const big = P.WORKS.find(h => h.status !== 'live') || P.WORKS[0], side = P.WORKS.filter(h => h !== big).slice(0, 3);
    return { t: en ? 'Home' : 'หน้าแรก', over: true, html: `
<section class="hero motion${intro ? ' has-intro' : ''}" id="hero" aria-label="PPSD HOME BUILDER" aria-roledescription="ภาพสไลด์">
<div class="hero-media" id="heroMedia" aria-hidden="true"><img class="hero-img kb" id="heroImg" src="${heroSrc}" alt="" fetchpriority="high"></div><div class="hero-tiles" id="heroTiles" aria-hidden="true"></div>
${intro ? '<div class="hero-intro" aria-hidden="true"><img src="img/logo-mark.png" alt=""><i></i></div>' : ''}
<div class="hero-c" id="heroC"><span class="eyebrow rise" style="--d:0">${t('heroEyebrow')}</span><h1><span class="sr">${esc(h1)}${by ? ' ' + by : ''}</span><span aria-hidden="true">${esc(h1).split(' = ').map((x, i) => `<span class="nw rise" style="--d:${1 + i * 2}">${x}</span>`).join(' <span class="rise eq" style="--d:2">=</span> ')}${by ? `<em class="rise" style="--d:4">${by}</em>` : ''}</span></h1><p class="hero-sub rise" style="--d:5">${esc(sub)}</p>
<div class="feats">${feats.map(([i, k], n) => `<div class="feat rise" style="--d:${6 + n * .6}">${I[i]}<div>${t(k)}</div></div>`).join('')}</div>
<div class="hero-cta rise" style="--d:9"><a class="btn" href="#designs">${t('ctaDesigns')} <span class="ar" aria-hidden="true">›</span></a><a class="sec-link" href="#appointment">${t('consult')}</a></div></div>
<div class="hero-ui rise" style="--d:10"><div class="hero-dots" role="group" aria-label="เลือกภาพสไลด์">${slides.map((x, i) => `<button type="button" data-hs="${i}" aria-label="ภาพที่ ${i + 1}"${i ? '' : ' aria-current="true"'}><i></i></button>`).join('')}</div><span class="hero-count"><b id="hsN">01</b> / ${String(slides.length).padStart(2, '0')}</span><button type="button" class="hero-pause" id="hsP" aria-pressed="false" aria-label="หยุดเลื่อนภาพ"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="pa" d="M8 5v14M16 5v14"/><path class="pl" d="M7 4l13 8-13 8z"/></svg></button><a class="hero-cap" id="hsCap" href="#designs">ภาพจำลองแนวคิด</a></div>
<a class="scroll-ind" href="#intro" data-scroll aria-label="เลื่อนลง"><span>${t('scroll')}</span><i></i></a></section>
<section class="sec bg-ivory" id="intro"><div class="w"><div class="split wide-l"><div class="rv"><span class="eyebrow">${t('introEyebrow')}</span><h2 class="h-l">${t('introH')}</h2><p class="lead" style="margin-top:22px">${t('introP')}</p><a class="link-u" href="#about" style="margin-top:12px">${t('introLink')} ${I.arrow.replace('<svg', '<svg width="16" height="16" stroke="currentColor" fill="none" stroke-width="1.5"')}</a>
<div class="stats"><div><b data-count="10" data-suf="+">10+</b><span>${en ? 'years building homes' : 'ปีแห่งประสบการณ์'}</span></div><div><b data-count="100" data-suf="+">100+</b><span>${en ? 'homes delivered' : 'หลังที่สร้างแล้ว'}</span></div><div><b data-count="5">5</b><span>${en ? 'year structural warranty' : 'ปี รับประกันโครงสร้าง'}</span></div></div></div>
<figure class="rv frame-g" style="margin:0"><div class="ratio r-45">${rimg('cream-courtyard', 'บ้านโมเดิร์นโทนครีม สวนหน้าบ้าน')}</div><figcaption class="cap">ภาพจำลองแนวคิดงานออกแบบ PPSD</figcaption></figure></div></div></section>
${film()}
<section class="sec dk glow"><div class="w"><div class="sh center"><span class="eyebrow">${t('featEyebrow')}</span><h2 class="h-l">${t('featH')}</h2><p class="lead">${en ? 'Every design comes with a real 3D model, roof-off view and floor plans.' : 'ทุกแบบมีโมเดล 3D จากแปลนจริง ซ่อนหลังคาดูภายใน และแปลนทุกชั้น'}</p></div>
<div class="g3">${feat.map(card).join('')}</div><div class="row" style="justify-content:center;margin-top:clamp(32px,4vw,48px)"><a class="btn line" href="#designs">${t('viewAll')} (${designs().length}) <span class="ar" aria-hidden="true">›</span></a></div></div></section>
${big ? `<section class="sec dk" style="padding-top:0"><div class="w"><div class="sh"><div><span class="eyebrow">OUR PROJECTS</span><h2 class="h-l">${en ? 'Homes that <em>speak for us</em>' : 'ผลงานที่<em>สะท้อนตัวตน</em>'}</h2></div><a class="link-u" href="#works">${en ? 'All projects' : 'ดูผลงานทั้งหมด'}</a></div>
<div class="wf"><a class="wf-big rv" href="#work-${big.id}">${img(big.img, big.name)}<div class="t"><div><span>REAL PROJECT · ราชบุรี · ${big.type}${big.area ? ' · ' + big.area : ''}</span><h3>${esc(big.name)}</h3></div><span class="hc-go" aria-hidden="true">${I.arrow}</span></div></a>
<div class="wf-side">${side.map(h => `<a class="wf-sm rv" href="#work-${h.id}"><div class="ratio">${img(h.img, h.name, '', '-s')}</div><div><b>${esc(h.name)}</b><span>ราชบุรี · ${h.type}${h.area ? ' · ' + h.area : ''}</span><br><span class="badge">${h.status === 'live' ? 'หน้างานจริง · กำลังก่อสร้าง' : 'ภาพถ่ายผลงานจริง'}</span></div></a>`).join('')}</div></div></div></section>` : ''}
<section class="sec bg-2"><div class="w"><div class="sh"><div><span class="eyebrow">${t('whyEyebrow')}</span><h2 class="h-l">${t('whyH')}</h2></div><p class="muted" style="margin:0;max-width:520px">${en ? 'Every promise is backed by process — documented inspections, staged payments and a written warranty.' : 'ทุกคำสัญญามีระบบรองรับ ตั้งแต่ผลตรวจงานทุกขั้น การจ่ายเงินตามงวดงานจริง ไปจนถึงการรับประกันเป็นลายลักษณ์อักษร'} <a class="link-u" href="#why" style="margin-left:6px">${en ? 'Learn more' : 'อ่านเพิ่มเติม'}</a></p></div>
<div class="why5">${why.map(([ic, a, b], i) => `<div class="rv"><span class="wi">${I[ic]}</span><span class="n">0${i + 1}</span><b>${t(a)}</b><span>${t(b)}</span></div>`).join('')}</div></div></section>`,
      init(app) { const s = $('[data-scroll]', app); if (s) s.onclick = e => { e.preventDefault(); $('#intro').scrollIntoView({ behavior: 'smooth' }); }; heroMotion(slides, reduce); countUp(app, reduce); } };
  };

  /* หน้าเปิดแบบเคลื่อนไหว: ภาพซูมช้า เปลี่ยนภาพแบบบล็อกประกอบ ปุ่มหยุดได้ */
  const KB = [['-2%', '-1.5%'], ['2%', '-2%'], ['-1.5%', '1.5%'], ['1.8%', '1.2%'], ['0%', '-2.5%'], ['-2%', '0%']];
  function heroMotion(slides, reduce) {
    const hero = $('#hero'), img0 = $('#heroImg'), tiles = $('#heroTiles'), media = $('#heroMedia'), hc = $('#heroC');
    if (!hero) return;
    let i = 0, busy = false, paused = reduce, timer = 0, raf = 0, visible = true; const DUR = 6500;
    const setKB = n => { const [x, y] = KB[n % KB.length]; img0.style.setProperty('--kx', x); img0.style.setProperty('--ky', y); img0.classList.remove('kb'); void img0.offsetWidth; if (!reduce) img0.classList.add('kb'); };
    const ui = n => { $$('[data-hs]', hero).forEach((b, k) => { if (k === n) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); const it = $('i', b); it.style.animation = 'none'; void it.offsetWidth; it.style.animation = ''; }); $('#hsN').textContent = String(n + 1).padStart(2, '0'); const d = slides[n].d, cap = $('#hsCap'); cap.innerHTML = d ? `ภาพจำลองแนวคิด · <b>${d.code}</b> ${esc(d.style)} <span aria-hidden="true">›</span>` : 'ภาพจำลองแนวคิด'; cap.href = d ? '#design-' + d.id : '#designs'; };
    const schedule = () => { clearTimeout(timer); if (!paused && visible) timer = setTimeout(() => go(i + 1), DUR); };
    const cover = (W, H, iw, ih) => { const k = Math.max(W / iw, H / ih), bw = iw * k, bh = ih * k; return { bw, bh, ox: (W - bw) / 2, oy: (H - bh) * (W < 720 ? .78 : .7) }; };
    async function go(n) {
      if (busy) return; n = (n + slides.length) % slides.length; if (n === i) return schedule(); busy = true; clearTimeout(timer);
      const s = slides[n], pic = new Image(); pic.src = s.src;
      try { await pic.decode(); } catch (e) { /* แสดงต่อได้แม้ถอดรหัสไม่ทัน */ }
      if (!$('#hero')) return;
      const finish = () => { img0.src = s.src; setKB(n); tiles.innerHTML = ''; tiles.classList.remove('go'); i = n; busy = false; schedule(); };
      ui(n);
      if (reduce) { finish(); return; }
      const W = hero.clientWidth, H = hero.clientHeight, C = W < 720 ? 4 : 8, R = W < 720 ? 6 : 5, tw = W / C, th = H / R, cv = cover(W, H, pic.naturalWidth || 1600, pic.naturalHeight || 900);
      let html = ''; for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { const x = c * tw, y = r * th, dl = ((c + r) * 55 + (r % 2 ? 30 : 0)); html += `<i style="left:${x}px;top:${y}px;width:${Math.ceil(tw) + 1}px;height:${Math.ceil(th) + 1}px;background-image:url(${s.src});background-size:${cv.bw}px ${cv.bh}px;background-position:${cv.ox - x}px ${cv.oy - y}px;--td:${dl}ms"></i>`; }
      tiles.innerHTML = html; void tiles.offsetWidth; tiles.classList.add('go');
      setTimeout(finish, (C + R) * 55 + 1100);
    }
    $$('[data-hs]', hero).forEach(b => b.onclick = () => go(Number(b.dataset.hs)));
    const pb = $('#hsP'); const setPause = v => { paused = v; hero.classList.toggle('paused', v); pb.setAttribute('aria-pressed', String(v)); pb.setAttribute('aria-label', v ? 'เล่นภาพสไลด์ต่อ' : 'หยุดเลื่อนภาพ'); if (v) clearTimeout(timer); else schedule(); };
    pb.onclick = () => setPause(!paused); if (reduce) setPause(true);
    const onVis = () => { if (document.hidden) clearTimeout(timer); else schedule(); };
    document.addEventListener('visibilitychange', onVis);
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { visible = es[0].isIntersecting; hero.classList.toggle('off', !visible); if (visible) schedule(); else clearTimeout(timer); }) : null; if (io) io.observe(hero);
    const onS = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const y = window.scrollY, h = window.innerHeight; if (y > h * 1.3) return; media.style.transform = `translate3d(0,${(y * .3).toFixed(1)}px,0)`; hc.style.transform = `translate3d(0,${(y * .14).toFixed(1)}px,0)`; hc.style.opacity = String(Math.max(0, 1 - y / (h * .62)).toFixed(3)); }); };
    if (!reduce) window.addEventListener('scroll', onS, { passive: true });
    setKB(0); ui(0); slides.slice(1, 2).forEach(x => { const p = new Image(); p.src = x.src; });
    timer = setTimeout(schedule, hero.classList.contains('has-intro') ? 1800 : 0);
    P._leave = () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('scroll', onS); if (io) io.disconnect(); };
  }
  /* ตัวเลขวิ่งนับขึ้นเมื่อเลื่อนมาถึง */
  function countUp(root, reduce) {
    const els = $$('[data-count]', root); if (reduce || !els.length || !('IntersectionObserver' in window)) return;
    const ob = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; ob.unobserve(e.target); const el = e.target, n = Number(el.dataset.count), suf = el.dataset.suf || '', t0 = performance.now(); const step = now => { const k = Math.min(1, (now - t0) / 1500), v = Math.round(n * (1 - Math.pow(1 - k, 3))); el.textContent = v + suf; if (k < 1) requestAnimationFrame(step); }; el.textContent = '0' + suf; requestAnimationFrame(step); }), { threshold: .6 });
    els.forEach(e => ob.observe(e));
  }

  /* ---------- แคตตาล็อกแบบบ้าน ---------- */
  const designTabs = cur => subnav([['designs', 'แบบบ้านทั้งหมด'], ['saved', 'ที่บันทึกไว้'], ['custom-design', 'ออกแบบตามใจ']], cur);
  const AREA_R = [['', 'ทุกขนาด'], ['0-100', 'ไม่เกิน 100 ตร.ม.'], ['100-150', '100–150 ตร.ม.'], ['150-200', '150–200 ตร.ม.'], ['200-300', '200–300 ตร.ม.'], ['300-9999', 'มากกว่า 300 ตร.ม.']];
  const BUD_R = [['', 'ทุกงบ'], ['0-2000000', 'ไม่เกิน 2 ล้านบาท'], ['2000000-3000000', '2–3 ล้านบาท'], ['3000000-4000000', '3–4 ล้านบาท'], ['4000000-6000000', '4–6 ล้านบาท'], ['6000000-99000000', 'มากกว่า 6 ล้านบาท']];
  R.designs = () => ({ t: 'แบบบ้านทั้งหมด', nav: 0, html: `${ph({ img: 'r/luxury-green', crumb: '<a href="#home">หน้าแรก</a> / บ้านของเรา', eyebrow: 'HOME COLLECTION', title: 'แบบบ้าน<em>ทั้งหมด</em>', cta: [['#appointment', 'ปรึกษาเลือกแบบบ้าน']], lead: `แบบบ้าน ${designs().length} แบบ ออกแบบโดยทีม PPSD ทุกแบบมีโมเดล 3D หมุนดูได้ ซ่อนหลังคาดูภายใน และแปลนทุกชั้น`, cap: 'ภาพจำลองแนวคิด' })}${designTabs('designs')}
<section class="sec-s dk glow"><div class="w"><form class="cat-bar" id="flt" data-noop role="search" aria-label="ค้นหาและกรองแบบบ้าน">
<div class="f search"><label for="q">ค้นหาชื่อหรือรหัสแบบ</label>${I.search}<input id="q" type="search" placeholder="เช่น PPSD-37 หรือ โมเดิร์น 2 ชั้น" autocomplete="off"></div>
<div class="f"><label for="fSt">สไตล์</label><select id="fSt">${opt('', 'ทุกสไตล์')}${['โมเดิร์น', 'มินิมอล', 'คลาสสิก', 'ไทยร่วมสมัย'].map(s => opt(s, s)).join('')}</select></div>
<div class="f"><label for="fFl">จำนวนชั้น</label><select id="fFl">${opt('', 'ทั้งหมด')}${opt('1', 'ชั้นเดียว')}${opt('2', '2 ชั้น')}${opt('3', '3 ชั้น')}</select></div>
<div class="f"><label for="fAr">พื้นที่ใช้สอย</label><select id="fAr">${AREA_R.map(([v, l]) => opt(v, l)).join('')}</select></div>
<div class="f"><label for="fBu">งบประมาณ (ราคาประมาณ)</label><select id="fBu">${BUD_R.map(([v, l]) => opt(v, l)).join('')}</select></div><button type="button" class="btn go" id="fGo">${I.search}<span>ค้นหาแบบบ้าน</span></button></form>
<div class="stabs" role="group" aria-label="เลือกสไตล์บ้าน">${[['', 'ทั้งหมด'], ['โมเดิร์น', 'โมเดิร์น'], ['มินิมอล', 'มินิมอล'], ['คลาสสิก', 'คลาสสิก'], ['ไทยร่วมสมัย', 'ไทยร่วมสมัย']].map(([v, l]) => `<button type="button" data-st="${v}" aria-pressed="false">${l}</button>`).join('')}</div>
<div class="cat-meta"><span id="cnt" aria-live="polite"></span><div class="row"><label for="fLa" class="fine">ที่ดินที่มี (ตร.ว.)</label><input id="fLa" type="number" min="0" placeholder="ไม่ระบุ" style="width:110px;min-height:38px;border:1px solid var(--line-2);padding:4px 10px"><label for="fSo" class="fine">เรียงตาม</label><select id="fSo">${opt('pa', 'ราคาน้อยไปมาก')}${opt('pd', 'ราคามากไปน้อย')}${opt('aa', 'พื้นที่เล็กไปใหญ่')}${opt('ad', 'พื้นที่ใหญ่ไปเล็ก')}${opt('code', 'รหัสแบบ')}</select><button type="button" class="btn line sm" id="fReset">ล้างตัวกรอง</button></div></div>
<div class="g3" id="list"></div><p class="fine" style="margin-top:36px">ราคา พื้นที่ และที่ดินขั้นต่ำเป็นค่าประมาณจากระบบออกแบบของ PPSD รอยืนยันกับใบเสนอราคาจริง · ภาพที่ติดป้าย “ภาพจำลองแนวคิด” เป็นภาพประกอบแนวทางสไตล์ ไม่ใช่ภาพถ่ายบ้านหลังนั้น ดูรูปทรงจริงได้จากโมเดล 3D ในหน้ารายละเอียด</p>
<div class="cta-band rv" style="margin-top:clamp(44px,6vw,72px)"><img src="img/r/villa-arches-s.jpg" alt="" loading="lazy"><div class="tx"><h2>ยังไม่แน่ใจว่า<em>แบบไหน</em>เหมาะกับคุณ?</h2><p>ให้ PPSD ช่วยแนะนำแบบบ้านที่เข้ากับที่ดิน งบประมาณ และไลฟ์สไตล์ของคุณ</p></div><div class="ac"><a class="btn" href="#appointment">${I.chat}<span>นัดปรึกษาสร้างบ้านฟรี</span></a></div></div></div></section>`,
    init() {
      const saved = store.get('ppsdFilter', {}); ['q', 'fSt', 'fFl', 'fAr', 'fBu', 'fLa', 'fSo'].forEach(k => { if (saved[k] != null && $('#' + k)) $('#' + k).value = saved[k]; });
      const draw = () => {
        const q = $('#q').value.trim().toLowerCase(), st = $('#fSt').value, fl = $('#fFl').value, [a0, a1] = ($('#fAr').value || '0-99999').split('-').map(Number), [b0, b1] = ($('#fBu').value || '0-999999999').split('-').map(Number), la = Number($('#fLa').value) || Infinity, so = $('#fSo').value;
        store.set('ppsdFilter', { q: $('#q').value, fSt: st, fFl: fl, fAr: $('#fAr').value, fBu: $('#fBu').value, fLa: $('#fLa').value, fSo: so });
        const r = designs().filter(d => (!q || (d.code + ' ' + d.name + ' ' + d.style).toLowerCase().includes(q)) && (!st || d.style === st) && (!fl || d.floors === Number(fl)) && d.area >= a0 && d.area <= a1 && d.price >= b0 && d.price <= b1 && d.land <= la);
        r.sort((a, b) => so === 'pa' ? a.price - b.price : so === 'pd' ? b.price - a.price : so === 'aa' ? a.area - b.area : so === 'ad' ? b.area - a.area : a.id - b.id);
        $('#cnt').textContent = `พบ ${r.length} แบบ จาก ${designs().length} แบบ`;
        $$('.stabs [data-st]').forEach(b => { const on = b.dataset.st === st; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
        $('#list').innerHTML = r.map(card).join('') || `<div class="empty" style="grid-column:1/-1"><p>ยังไม่มีแบบที่ตรงเงื่อนไข</p><div class="row" style="justify-content:center"><button type="button" class="btn line" id="fReset2">ล้างตัวกรอง</button><a class="btn" href="#custom">ให้สถาปนิกออกแบบตามความต้องการ</a></div></div>`;
        P.reveal($('#list')); const r2 = $('#fReset2'); if (r2) r2.onclick = reset;
      };
      const reset = () => { ['q', 'fLa'].forEach(k => $('#' + k).value = ''); ['fSt', 'fFl', 'fAr', 'fBu'].forEach(k => $('#' + k).value = ''); $('#fSo').value = 'pa'; draw(); };
      $('#fReset').onclick = reset;
      $$('.stabs [data-st]').forEach(b => b.onclick = () => { $('#fSt').value = b.dataset.st; draw(); });
      $('#fGo').onclick = () => { draw(); $('#cnt').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      ['input', 'change'].forEach(ev => { $('#flt').addEventListener(ev, draw); $('#fLa').addEventListener(ev, draw); $('#fSo').addEventListener(ev, draw); });
      draw();
    } });

  /* ---------- รายละเอียดแบบบ้าน + 3D ---------- */
  R.design = id => {
    const d = byId(id) || designs()[0]; const c = cover(d, false), f = fav().includes(d.id);
    const gal = [c, ...(!d.custom && (d.cover || d.coverImg) ? [{ src: `img/plans/ppsd-${d.id}.jpg`, label: 'ภาพ 3D จากแปลนจริง' }] : []), ...(d.gallery || []).map(x => ({ src: x, label: 'ภาพเพิ่มเติม' })), ...(d.planImg ? [{ src: d.planImg, label: 'แปลนพื้น' }] : [])];
    const link3d = /^https?:\/\//.test(d.link3d || '') ? d.link3d : '';
    const pay = up100(monthly(d.price * 0.9, 6, 30));
    const sim = designs().filter(x => x.id !== d.id).map(x => ({ x, s: Math.abs(x.price - d.price) / d.price + (x.style === d.style ? 0 : 0.4) + (x.floors === d.floors ? 0 : 0.2) })).sort((a, b) => a.s - b.s).slice(0, 3).map(o => o.x);
    return { t: d.name, nav: 0, html: `${ph({ crumb: `<a href="#home">หน้าแรก</a> / <a href="#designs">แบบบ้าน</a> / ${d.code}`, eyebrow: d.code + ' · ' + d.style, title: esc(d.name) })}
<section class="sec-s"><div class="w"><div class="split at dgrid">
<div><div class="gal-main" id="galMain"><img src="${gal[0].src}" alt="${esc(gal[0].label + ' ' + d.name)}"><span class="tag-c" id="galLbl">${gal[0].label}</span></div>${gal.length > 1 ? `<div class="gal-th" role="tablist" aria-label="รูปแบบบ้าน">${gal.map((g, i) => `<button type="button" role="tab" class="${i ? '' : 'on'}" aria-selected="${!i}" data-g="${i}"><img src="${/^data:/.test(g.src) ? g.src : g.src.replace('.jpg', '-s.jpg').replace('-s-s', '-s')}" alt="${esc(g.label)}"></button>`).join('')}</div>` : ''}
<div class="specs" style="margin-top:28px">${[['จำนวนชั้น', floorTx(d)], ['ห้องนอน', d.beds + ' <small>ห้อง</small>'], ['ห้องน้ำ', d.baths + ' <small>ห้อง</small>'], ['พื้นที่ใช้สอย', d.area + ' <small>ตร.ม.</small>'], ['ที่ดินขั้นต่ำ', d.land + ' <small>ตร.ว.</small>'], ['ทรงหลังคา', roofTx[d.roof] || '-']].map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}</div>
<h2 class="h-m" style="margin-top:36px">แนวคิดการออกแบบ</h2><p class="muted" style="margin-top:10px">${esc(d.desc)}</p></div>
<aside><div class="sticky-box panel"><span class="eyebrow">ESTIMATED PRICE</span><div class="num" style="font-size:40px;color:var(--navy);line-height:1.1">${mil(d.price)} <small style="font-family:var(--sans);font-size:15px;color:var(--muted)">ล้านบาท</small></div><p class="fine" style="margin:6px 0 18px">ราคาประมาณ รอยืนยันกับใบเสนอราคา · ผ่อนโดยประมาณ ${fmt(pay)} บาท/เดือน (กู้ 90% ดอกเบี้ย 6% 30 ปี)</p>
<div class="form" style="gap:10px"><a class="btn block" href="#quote-${d.id}">ขอใบเสนอราคาแบบนี้</a><a class="btn line block" href="#modify-${d.id}">ปรับแบบบ้านนี้ให้เป็นของคุณ</a><div class="two" style="gap:10px"><button type="button" class="btn line sm${f ? ' on' : ''}" data-fav="${d.id}" data-label="1" aria-pressed="${f}">${I.heart}<span>${f ? 'บันทึกแล้ว' : 'บันทึกแบบนี้'}</span></button><button type="button" class="btn line sm" data-cmp="${d.id}">${I.cmp}<span>เปรียบเทียบ</span></button></div><a class="link-u" href="#afford-${d.id}" style="justify-self:start;margin-top:6px">เช็กว่าผ่อนไหวไหม</a></div>
<hr class="rule"><p class="fine" style="margin:0">วัสดุตามแพ็กเกจ Premium หรือ Elite · <a href="#materials" style="border-bottom:1px solid var(--gold)">ดูวัสดุและมาตรฐาน</a></p></div></aside></div></div></section>
<section class="sec-s bg-2" id="viewer3d"><div class="w"><div class="split" style="align-items:end;margin-bottom:22px"><div><span class="eyebrow">3D MODEL · FLOOR PLANS</span><h2 class="h-l">โมเดล <em class="en">3D</em> และแปลนพื้น</h2></div><p class="muted" style="margin:0">โมเดลสร้างจากแปลนจริงของแบบนี้ ลากเพื่อหมุน ล้อเมาส์หรือหยิกนิ้วเพื่อซูม กด “ซ่อนหลังคา” เพื่อดูการจัดห้องภายใน หรือเลือกดูทีละชั้นและแปลนพื้นพร้อมขนาดห้อง</p></div>
${d.custom ? `<div class="viewer" id="dView">${d.planImg ? `<img src="${d.planImg}" alt="แปลนพื้น ${esc(d.name)}" style="width:100%;height:100%;object-fit:contain;background:#fff">` : '<p class="muted">ทีมกำลังจัดทำโมเดล 3D และแปลนของแบบนี้ · ขอดูแปลนได้ทาง LINE OA</p>'}</div>` : '<div class="viewer" id="dView" aria-live="polite"><p class="muted">กำลังโหลดโมเดล 3D และแปลน…</p></div>'}${link3d ? `<div class="row" style="margin-top:14px"><a class="btn line sm" href="${esc(link3d)}" target="_blank" rel="noopener">ดูโมเดล 3D / วิดีโอเพิ่มเติม</a></div>` : ''}<p class="fine" style="margin-top:12px">โมเดลเพื่อประกอบการตัดสินใจ ไม่ใช่แบบก่อสร้าง ขนาดห้องปรับได้ตอนออกแบบจริงให้เข้ากับที่ดินและทิศ</p></div></section>
<section class="sec dk glow"><div class="w"><div class="row" style="justify-content:space-between;margin-bottom:28px"><h2 class="h-l">แบบบ้าน<em>ใกล้เคียง</em></h2><a class="link-u" href="#designs">ดูทั้งหมด</a></div><div class="g3">${sim.map(card).join('')}</div></div></section>`,
      init() {
        $$('.gal-th [data-g]').forEach(b => b.onclick = () => { const g = gal[Number(b.dataset.g)]; $('#galMain img').src = g.src; $('#galMain img').alt = g.label + ' ' + d.name; $('#galLbl').textContent = g.label; $$('.gal-th [data-g]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', String(x === b)); }); });
        if (!d.custom) fetch(`plans/ppsd-${d.id}.json`).then(r => { if (!r.ok) throw 0; return r.json(); }).then(async x => { await P.loadViewer(); const v = $('#dView'); if (!v) return; v.innerHTML = ''; window.PPSDHouse.mount(v, x.layout, d.name); })
          .catch(() => { const v = $('#dView'); if (v) v.innerHTML = '<p class="muted">เปิดโมเดล 3D ไม่ได้ในเครื่องนี้ (ต้องใช้เบราว์เซอร์ที่รองรับ WebGL) · ดูภาพ 3D จากแปลนด้านบนแทนได้</p>'; });
      } };
  };

  R.saved = () => ({ t: 'แบบบ้านที่บันทึกไว้', nav: 0, html: `${ph({ crumb: '<a href="#home">หน้าแรก</a> / บ้านของเรา', eyebrow: 'SAVED HOMES', title: 'แบบบ้าน<em>ที่บันทึกไว้</em>', lead: 'แบบที่คุณกด ♡ ไว้ จำในเบราว์เซอร์นี้ เลือกได้สูงสุด 3 แบบเพื่อเปรียบเทียบ' })}${designTabs('saved')}
<section class="sec-s dk glow"><div class="w"><div class="row" style="justify-content:space-between;margin-bottom:24px"><span id="svCnt" class="muted"></span><div class="row"><button type="button" class="btn line sm" id="svCmp">เปรียบเทียบแบบที่บันทึก (สูงสุด 3)</button><a class="btn sm" href="#quote">ขอใบเสนอราคา</a></div></div><div class="g3" id="svList"></div></div></section>`,
    init() { const draw = () => { const l = fav().map(byId).filter(Boolean); $('#svCnt').textContent = `บันทึกไว้ ${l.length} แบบ`; $('#svCmp').disabled = l.length < 2; $('#svList').innerHTML = l.map(card).join('') || `<div class="empty" style="grid-column:1/-1"><p>ยังไม่มีแบบที่บันทึก กด ♡ ที่การ์ดแบบบ้านเพื่อบันทึก</p><a class="btn" href="#designs">ดูแบบบ้านทั้งหมด</a></div>`; P.reveal($('#svList')); }; P.onFav = () => { if ($('#svList')) draw(); }; $('#svCmp').onclick = () => compareModal(fav().slice(0, 3)); draw(); } });

  /* ---------- ผลงานจริง / รีวิว ---------- */
  const workTabs = cur => subnav([['works', 'ผลงานทั้งหมด'], ['works-live', 'กำลังก่อสร้าง'], ['works-3d', 'ภาพออกแบบ 3D'], ['reviews', 'รีวิวจากลูกค้า']], cur);
  const workCard = h => `<a class="hc rv" href="#work-${h.id}"><div class="ratio">${img(h.img, h.name, '', '-s')}<span class="tag-c">${h.status === 'live' ? 'หน้างานจริง · สัปดาห์ที่ ' + h.week : 'ภาพถ่ายผลงานจริง'}</span></div><div class="hc-b"><div class="hc-top"><span class="hc-code">REAL PROJECT</span><span class="hc-tag">${h.status === 'live' ? 'กำลังก่อสร้าง' : 'ส่งมอบแล้ว'}</span></div><h3>${esc(h.name)}</h3><div class="hc-meta"><span class="ico">${I.pin}ราชบุรี</span><span class="ico">${I.layers}${h.type}</span>${h.area ? `<span class="ico">${I.area}${h.area}</span>` : ''}</div><div class="hc-foot"><span class="hc-price">ดูรูปหน้างานและผลตรวจงาน</span><span class="hc-go" aria-hidden="true">${I.arrow}</span></div></div></a>`;
  const workList = (key, title, lead, list, pick) => ({ t: title, nav: 0, html: `${ph({ img: 'h1-a', crumb: '<a href="#home">หน้าแรก</a> / บ้านของเรา', eyebrow: 'BUILT BY PPSD', title, lead, cap: 'ภาพถ่ายผลงานจริง' })}${workTabs(key)}<section class="sec-s dk glow"><div class="w"><div class="g3">${list.map(pick).join('')}</div><p class="fine" style="margin-top:32px">ภาพถ่ายจากหน้างานจริง ไม่แสดงชื่อเจ้าของและบ้านเลขที่ · ไทม์ไลน์บางส่วนเป็นตัวอย่าง ระบบจริงดึงจากรายงานหน้างาน</p></div></section>` });
  R.works = () => workList('works', 'ผลงาน<em>ก่อสร้างจริง</em>', 'บ้านที่ส่งมอบแล้วและบ้านที่กำลังสร้าง พร้อมผลตรวจงานระหว่างทาง', P.WORKS, workCard);
  R['works-live'] = () => workList('works-live', 'บ้านที่<em>กำลังก่อสร้าง</em>', 'ดูงานจริงจากหน้างาน อัปเดตตามรายงานประจำสัปดาห์', P.WORKS.filter(h => h.status === 'live'), workCard);
  R['works-3d'] = () => workList('works-3d', 'ภาพออกแบบ <em class="en">3D</em>', 'ภาพ 3D ที่เจ้าของบ้านเห็นก่อนเริ่มก่อสร้าง เทียบกับบ้านจริงได้ในหน้าผลงาน', P.WORKS, h => `<a class="hc rv" href="#work-${h.id}"><div class="ratio" style="background:#F3EFE8">${img(h.r3d || h.img, 'ภาพ 3D ' + h.name, '', '-s')}<span class="tag-c">ภาพ 3D ก่อนสร้าง</span></div><div class="hc-b"><div class="hc-top"><span class="hc-code">3D DESIGN</span><span class="hc-tag">${h.type}</span></div><h3>${esc(h.name)}</h3><div class="hc-foot"><span class="hc-price">เทียบภาพ 3D กับบ้านจริง</span><span class="hc-go" aria-hidden="true">${I.arrow}</span></div></div></a>`);
  R.work = id => {
    const h = P.WORKS.find(x => x.id === Number(id)) || P.WORKS[0]; const lbl = h.status === 'live' ? 'หน้างานจริง' : 'บ้านจริง';
    return { t: h.name, nav: 0, html: `${ph({ crumb: '<a href="#home">หน้าแรก</a> / <a href="#works">ผลงาน</a>', eyebrow: h.status === 'live' ? 'UNDER CONSTRUCTION · WEEK ' + h.week : 'COMPLETED' + (h.months ? ' · ' + h.months : ''), title: esc(h.name), lead: 'ราชบุรี · ' + h.type + (h.area ? ' · ' + h.area : '') })}
<section class="sec-s"><div class="w"><div class="row" role="tablist" style="margin-bottom:14px"><button type="button" class="chip on" id="tReal" role="tab" aria-selected="true">${lbl}</button><button type="button" class="chip" id="t3d" role="tab" aria-selected="false">ภาพ 3D ก่อนสร้าง</button></div><div class="gal-main"><img id="cmpImg" src="${src(h.img)}" alt="${esc(h.name)}"></div>
${h.quote ? `<div class="w-n center" style="padding:56px 0 24px"><p class="quote">“${esc(h.quote)}”</p><p class="who">${esc(h.who)}</p></div>` : ''}
<h2 class="h-m" style="margin:36px 0 18px">รูป${lbl}</h2><div class="photos">${(h.gal || []).map(g => `<figure>${img(g, h.name, '', '-s')}</figure>`).join('')}</div>
<div class="split at" style="margin-top:48px"><div>${(h.tl || []).length ? `<h2 class="h-m" style="margin-bottom:12px">เส้นทางการสร้างและผลตรวจงาน</h2><ol class="tl">${h.tl.map(([dd, tt, n, q]) => `<li class="${q === 'fix' ? 'short' : ''}"><div class="d">${dd}</div><div class="dot"></div><div><div class="t">${tt}</div>${n ? `<div class="n">${n}</div>` : ''}</div><div class="a"><span class="badge ${q === 'fix' ? 'warn' : 'ok'}">${q === 'fix' ? 'พบจุดแก้ · แก้แล้ว' : 'ตรวจผ่าน'}</span></div></li>`).join('')}</ol><p class="fine">ไทม์ไลน์นี้เป็นตัวอย่าง ระบบจริงจะดึงจากรูปหน้างานและผลตรวจงาน</p>` : ''}</div>
<div class="panel"><h3 class="h-s">จุดเด่นของหลังนี้</h3><ul class="bul">${(h.spec || []).map(s => `<li>${esc(s)}</li>`).join('')}</ul><a class="btn" href="#budget-calc" style="margin-top:22px">อยากได้บ้านแบบนี้ ประเมินงบ</a></div></div></div></section>`,
      init() { const set = r => { $('#cmpImg').src = src(r ? h.img : (h.r3d || h.img)); $('#tReal').classList.toggle('on', r); $('#t3d').classList.toggle('on', !r); $('#tReal').setAttribute('aria-selected', String(r)); $('#t3d').setAttribute('aria-selected', String(!r)); }; $('#tReal').onclick = () => set(true); $('#t3d').onclick = () => set(false); } };
  };
  R.reviews = () => ({ t: 'รีวิวจากลูกค้า', nav: 0, html: `${ph({ img: 'h2-d', cap: 'ภาพถ่ายผลงานจริง', crumb: '<a href="#home">หน้าแรก</a> / บ้านของเรา', eyebrow: 'CLIENT STORIES', title: 'เสียงจาก<em>เจ้าของบ้าน</em>', lead: 'ทุกรีวิวคือความไว้วางใจที่ลูกค้ามอบให้เรา' })}${workTabs('reviews')}
<section class="sec"><div class="w" style="display:grid;gap:clamp(48px,7vw,96px)">${P.WORKS.filter(h => h.quote && !h.reviewHidden).map((h, i) => `<article class="split rv"${i % 2 ? ' style="direction:rtl"' : ''}><div class="ratio r-43" style="direction:ltr">${img(h.img, h.name)}</div><div style="direction:ltr"><span class="eyebrow">${esc(h.type)} · ราชบุรี</span><p class="quote">“${esc(h.quote)}”</p><p class="who">${esc(h.who)} · ${esc(h.name)}</p><a class="link-u" href="#work-${h.id}" style="margin-top:14px">ดูผลงานหลังนี้</a></div></article>`).join('')}
<div class="note"><span>ก่อนเปิดใช้จริงต้องยืนยันข้อความและขออนุญาตเจ้าของบ้านทุกท่าน · <a href="${P.CO.reels}" target="_blank" rel="noopener" style="color:var(--navy);border-bottom:1px solid var(--gold)">ดูคลิปรีวิวบน Facebook</a></span></div></div></section>` });

  const API = window.PPSD_API || (location.pathname.startsWith('/web/') ? '../api' : '/api');
  P.API = API;

  /* ---------- ออกแบบบ้านตามใจ (หน้าบริการ) ---------- */
  R['custom-design'] = () => ({ t: 'ออกแบบบ้านตามใจ', nav: 1, html: `${ph({ img: 'r/villa-arches', crumb: '<a href="#home">หน้าแรก</a> / รับออกแบบบ้าน', eyebrow: 'BESPOKE DESIGN', title: 'ออกแบบบ้าน<em>ตามใจ</em>', lead: 'สถาปนิก PPSD ออกแบบใหม่ทั้งหลังจากความต้องการ งบ ที่ดิน และหลักฮวงจุ้ยของครอบครัวคุณ', cap: 'ภาพจำลองแนวคิด' })}${designTabs('custom-design')}
<section class="sec"><div class="w"><div class="split at"><div class="rv"><span class="eyebrow">HOW IT WORKS</span><h2 class="h-l">บ้านที่ออกแบบจากชีวิตของคุณ</h2><p class="lead" style="margin-top:18px">เริ่มจากบอกความต้องการ 7 ขั้นตอนสั้น ๆ หรือนัดคุยกับสถาปนิกโดยตรง ทีมจะสำรวจที่ดินฟรี แล้วออกแบบผัง ภาพ 3D และสรุปราคาให้ก่อนตัดสินใจ</p><div class="row" style="margin-top:26px"><a class="btn" href="#custom">ส่งความต้องการออกแบบ</a><a class="btn line" href="#appointment">นัดปรึกษาสถาปนิก</a></div>
<div class="g2" style="margin-top:44px">${[['แบบสำเร็จรูป', 'เลือกจากแบบที่มี ปรับเล็กน้อยได้ เห็นราคาเร็ว', 'designs', 'ดูแบบบ้าน'], ['ปรับแบบที่มีอยู่', 'เลือกแบบที่ชอบ แล้วขอเพิ่มห้อง ขยาย หรือปรับให้เข้ากับที่ดิน', 'modify', 'ขอปรับแบบ']].map(([a, b, h, l]) => `<div style="border-top:1px solid var(--line-2);padding-top:18px"><b style="font-weight:500;color:var(--navy)">${a}</b><p class="muted" style="font-size:14.5px;margin:6px 0 10px">${b}</p><a class="link-u" href="#${h}">${l}</a></div>`).join('')}</div></div>
<div class="panel rv"><h3 class="h-s" style="margin-bottom:6px">ขั้นตอนออกแบบตามใจ</h3><ol class="tl">${[['บอกความต้องการและงบ', 'ผ่านแบบฟอร์ม 7 ขั้นตอน หรือนัดคุย', 'ฟรี'], ['สำรวจที่ดิน', 'ทีมดูขนาด ทิศ แสง ลม และฮวงจุ้ย', 'ฟรี'], ['จองแบบ', 'ชำระค่าจองแบบ หักเป็นค่าก่อสร้าง หนังสือจองมีอายุ 1 ปี', '30,000–40,000 บาท'], ['ออกแบบและแก้แบบ', 'ตรวจผังและภาพ 3D ปรับจนพอใจ', 'ตามสิทธิ์แพ็กเกจ'], ['สรุปราคาและเซ็นสัญญา', 'ยืนยันแบบ สเปค และงวดเงิน', 'ตามงวดในสัญญา']].map(([a, b, c], i) => `<li><div class="d">ขั้น ${i + 1}</div><div class="dot"></div><div><div class="t">${a}</div><div class="n">${b}</div></div><div class="a">${c}</div></li>`).join('')}</ol></div></div></div></section>` });

  /* ---------- ออกแบบตามใจ: ส่งความต้องการ 7 ขั้นตอน ---------- */
  const roofSvg = k => ({
    'โมเดิร์น': '<svg viewBox="0 0 96 64" fill="none" stroke="#0C2340" stroke-width="1.4"><rect x="8" y="16" width="80" height="4"/><rect x="14" y="20" width="44" height="36"/><rect x="58" y="30" width="24" height="26"/><path d="M22 30h12v10H22zM64 38h12v10H64z"/><path d="M4 56h88"/></svg>',
    'มินิมอล': '<svg viewBox="0 0 96 64" fill="none" stroke="#0C2340" stroke-width="1.4"><path d="M14 26L82 14v6L14 32z"/><rect x="20" y="30" width="56" height="26"/><path d="M42 40h12v16H42z"/><path d="M4 56h88"/></svg>',
    'คลาสสิก': '<svg viewBox="0 0 96 64" fill="none" stroke="#0C2340" stroke-width="1.4"><path d="M10 28L28 12h40l18 16z"/><rect x="16" y="28" width="64" height="28"/><path d="M26 34v22M70 34v22M42 40h12v16H42z"/><path d="M4 56h88"/></svg>',
    'ไทยร่วมสมัย': '<svg viewBox="0 0 96 64" fill="none" stroke="#0C2340" stroke-width="1.4"><path d="M12 30L48 6l36 24"/><path d="M8 32L48 10l40 22"/><rect x="18" y="30" width="60" height="18"/><path d="M18 48v8M78 48v8M30 48v8M66 48v8M42 34h12v14H42z"/><path d="M4 56h88"/></svg>',
    'ยังไม่แน่ใจ': '<svg viewBox="0 0 96 64" fill="none" stroke="#0C2340" stroke-width="1.4"><path d="M18 30L48 12l30 18v26H18z" stroke-dasharray="3 3"/><path d="M44 30c0-3 2-5 5-5s5 2 5 5c0 3-4 3-4 7M49 41v1"/><path d="M4 56h88"/></svg>'
  })[k];
  const STYLES = [['โมเดิร์น', 'เส้นสายเรียบ หลังคาแบนหรือจั่วต่ำ ช่องเปิดกว้าง'], ['มินิมอล', 'เรียบง่าย สีอ่อน วัสดุธรรมชาติ'], ['คลาสสิก', 'หลังคาปั้นหยา สัดส่วนสมมาตร งานบัว'], ['ไทยร่วมสมัย', 'หลังคาสูง ชายคายื่น ใต้ถุน ระบายลมดี'], ['ยังไม่แน่ใจ', 'ให้สถาปนิกช่วยเสนอแนวทาง']];
  const FS_ITEMS = ['ทิศหน้าบ้านและทางเข้า', 'ตำแหน่งประตูหลัก', 'ตำแหน่งห้องนอนเจ้าบ้าน', 'ตำแหน่งครัวและเตาไฟ', 'ตำแหน่งห้องพระ', 'หาฤกษ์ลงเสาเข็ม'];
  const STEPS = ['สไตล์บ้าน', 'ที่ดินและพื้นที่', 'ห้องและที่จอดรถ', 'งบประมาณ', 'รูปและแปลนอ้างอิง', 'ความต้องการด้านฮวงจุ้ย', 'ตรวจทานและส่ง'];
  R.custom = () => {
    const W = store.get('ppsdWizard', {});
    const wv = (k, d = '') => esc(W[k] != null ? W[k] : d);
    return { t: 'ส่งความต้องการออกแบบ', nav: 1, html: `${ph({ crumb: '<a href="#home">หน้าแรก</a> / <a href="#custom-design">รับออกแบบบ้าน</a>', eyebrow: 'DESIGN BRIEF', title: 'ส่งความต้องการ<em>ออกแบบบ้าน</em>', lead: '7 ขั้นตอน ใช้เวลาประมาณ 3–5 นาที ระบบจำคำตอบไว้ในเบราว์เซอร์นี้จนกว่าจะส่ง' })}
<section class="sec-s"><div class="w"><div class="wiz"><ol class="wiz-steps" id="wSteps" aria-label="ขั้นตอน">${STEPS.map((s, i) => `<li data-s="${i}">${s}</li>`).join('')}</ol>
<form id="wiz" novalidate data-noop data-name="wName" data-phone="wTel"><div class="prog" role="progressbar" aria-valuemin="1" aria-valuemax="7" aria-label="ความคืบหน้า"><i></i></div>
<div class="wiz-p" data-p="0"><span class="eyebrow">STEP 1 / 7</span><h2 class="h-m">เลือกสไตล์สถาปัตยกรรมที่ชอบ</h2><p class="muted">เลือก 1 แบบ เปลี่ยนภายหลังได้</p>
<div class="style-pick" role="radiogroup" aria-label="สไตล์บ้าน" style="margin-top:20px">${STYLES.map(([s, d], i) => `<label><input class="sr" type="radio" name="wStyle" value="${s}" ${(W.wStyle || '') === s ? 'checked' : ''} ${i === 0 ? 'required' : ''}><span class="card">${roofSvg(s)}<b>${s}</b><span>${d}</span></span></label>`).join('')}</div>
<div class="f" style="margin-top:24px;max-width:320px"><label for="wFl">จำนวนชั้น</label><select id="wFl">${[['', 'ยังไม่แน่ใจ'], ['1', 'ชั้นเดียว'], ['2', '2 ชั้น'], ['3', '3 ชั้น']].map(([v, l]) => opt(v, l, (W.wFl || '') === v)).join('')}</select></div><span class="msg-err" id="wStyleErr" style="color:var(--bad);font-size:13px"></span></div>
<div class="wiz-p" data-p="1"><span class="eyebrow">STEP 2 / 7</span><h2 class="h-m">ขนาดที่ดินและพื้นที่ใช้สอย</h2><p class="muted">ถ้ายังไม่ทราบขนาดแน่นอน ใส่ค่าประมาณได้</p>
<div class="form" style="margin-top:20px"><div class="two">${field('wLw', 'หน้ากว้างที่ดิน (เมตร)', `<input id="wLw" type="number" min="1" step="0.5" value="${wv('wLw')}" inputmode="decimal" required>`)}${field('wLd', 'ความลึกที่ดิน (เมตร)', `<input id="wLd" type="number" min="1" step="0.5" value="${wv('wLd')}" inputmode="decimal" required>`)}</div>
<p class="note" id="wLandNote" style="margin:0"></p>
<div class="two">${field('wArea', 'พื้นที่ใช้สอยที่ต้องการ (ตร.ม.)', `<input id="wArea" type="number" min="30" step="5" value="${wv('wArea')}" inputmode="numeric" required>`, 'รวมทุกชั้น เช่น 180')}${field('wFace', 'ทิศหน้าที่ดิน', `<select id="wFace">${['ยังไม่ทราบ', 'เหนือ', 'ใต้', 'ตะวันออก', 'ตะวันตก', 'ตะวันออกเฉียงเหนือ', 'ตะวันออกเฉียงใต้', 'ตะวันตกเฉียงเหนือ', 'ตะวันตกเฉียงใต้'].map(s => opt(s, s, W.wFace === s)).join('')}</select>`)}</div>
${field('wProv', 'จังหวัดที่จะสร้าง', `<select id="wProv">${P.REGIONS.map(([r]) => opt(r, r, W.wProv === r)).concat(opt('อื่น ๆ', 'จังหวัดอื่น', W.wProv === 'อื่น ๆ')).join('')}</select>`)}</div></div>
<div class="wiz-p" data-p="2"><span class="eyebrow">STEP 3 / 7</span><h2 class="h-m">ห้องนอน ห้องน้ำ และที่จอดรถ</h2><p class="muted">กด + หรือ − (0 = ไม่ต้องการ)</p>
<div class="rooms" style="margin-top:18px">${P.ROOMS.map(([id, t2, v, max]) => `<div class="room"><label for="${id}">${t2}${['cBed', 'cBath', 'cCar'].includes(id) ? ' <span class="gold">*</span>' : ''}</label><div class="counter"><button type="button" data-step="-1" data-for="${id}" aria-label="ลด${t2}">−</button><input id="${id}" type="number" min="0" max="${max}" value="${W[id] != null ? esc(W[id]) : v}" inputmode="numeric"><button type="button" data-step="1" data-for="${id}" aria-label="เพิ่ม${t2}">+</button></div></div>`).join('')}</div>
<div class="f" style="margin-top:26px"><span class="lbl">สิ่งที่อยากได้เพิ่ม (เลือกได้หลายข้อ)</span><div class="chips">${P.NEEDS.map((n, i) => `<label><input class="peer" type="checkbox" name="wNeed" value="${n}" id="wN${i}" ${(W.wNeed || []).includes(n) ? 'checked' : ''}><span class="chip">${n}</span></label>`).join('')}</div></div>
${field('wMore', 'เล่าเพิ่มเติม', `<textarea id="wMore" rows="3" placeholder="เช่น อยู่กัน 5 คน มีพ่อแม่สูงอายุ อยากได้บ้านไม่ร้อน">${wv('wMore')}</textarea>`)}</div>
<div class="wiz-p" data-p="3"><span class="eyebrow">STEP 4 / 7</span><h2 class="h-m">งบประมาณค่าก่อสร้าง</h2>
<div class="form" style="margin-top:18px"><div class="two">${field('wBud', 'งบค่าก่อสร้าง', `<select id="wBud" required>${P.BUD_RANGES.map(([lo, hi, l]) => opt(lo + '-' + hi, l, (W.wBud || '3000000-4000000') === lo + '-' + hi)).join('')}</select>`)}${field('wPkg', 'สเปควัสดุ', `<select id="wPkg">${P.PKG.map(p => opt(p.rate, p.name + ' (ตัวอย่าง ' + fmt(p.rate) + ' บาท/ตร.ม.)', String(W.wPkg || 18000) === String(p.rate))).join('')}</select>`)}</div>
<div class="sum" aria-live="polite"><p class="msg" id="wBudMsg"></p><div class="nums"><div><div class="k">พื้นที่ที่งบนี้สร้างได้ (Premium)</div><div class="v" id="wAP"></div></div><div><div class="k">ถ้าเลือก Elite</div><div class="v" id="wAE"></div></div><div><div class="k">ผ่อนต่อเดือนโดยประมาณ</div><div class="v" id="wPay"></div></div></div></div>
<p class="fine">อัตราต่อ ตร.ม. เป็นตัวอย่างจากเว็บเดิม (Premium 18,000 · Elite 23,000 บาท) รอยืนยัน · คิดผ่อนจากวงเงิน 90% ดอกเบี้ย 6% 30 ปี · ไม่รวมค่าที่ดินและงานนอกตัวบ้าน <a href="#budget-calc" style="border-bottom:1px solid var(--gold)">คำนวณงบละเอียด</a></p></div></div>
<div class="wiz-p" data-p="4"><span class="eyebrow">STEP 5 / 7</span><h2 class="h-m">รูปบ้านที่ชอบ หรือแปลนเดิม</h2><p class="muted">ไม่บังคับ · สูงสุด 5 ไฟล์ รูปถูกย่อในเครื่องของคุณก่อนส่ง</p>
<div style="margin-top:18px">${uploadBox('wUp', 'แนบรูปตัวอย่างหรือแปลน', 'รูปบ้าน ภาพภายใน หรือแปลนที่ดิน/แปลนบ้านเดิม')}</div></div>
<div class="wiz-p" data-p="5"><span class="eyebrow">STEP 6 / 7</span><h2 class="h-m">ความต้องการด้านฮวงจุ้ย</h2><p class="muted">PPSD ออกแบบอิงหลักฮวงจุ้ยควบคู่กับแสง ลม และการใช้งานจริง</p>
<div class="chips" role="radiogroup" aria-label="ระดับความต้องการ" style="margin:18px 0">${['ต้องการให้ออกแบบตามหลักฮวงจุ้ย', 'ไม่ต้องการ', 'ยังไม่แน่ใจ ขอคำแนะนำ'].map((s, i) => `<label><input class="peer" type="radio" name="wFs" value="${s}" ${(W.wFs || 'ต้องการให้ออกแบบตามหลักฮวงจุ้ย') === s ? 'checked' : ''}><span class="chip">${s}</span></label>`).join('')}</div>
<div class="f"><span class="lbl">เรื่องที่อยากให้ดูเป็นพิเศษ</span><div class="chips">${FS_ITEMS.map((s, i) => `<label><input class="peer" type="checkbox" name="wFsI" value="${s}" ${(W.wFsI || []).includes(s) ? 'checked' : ''}><span class="chip">${s}</span></label>`).join('')}</div></div>
<div class="two" style="margin-top:18px">${field('wBirth', 'ปีเกิดเจ้าบ้าน (พ.ศ.) — ไม่บังคับ', `<input id="wBirth" type="number" min="2470" max="2569" value="${wv('wBirth')}" inputmode="numeric" placeholder="เช่น 2527">`, 'ใช้ประกอบการวางตำแหน่งและหาฤกษ์เท่านั้น')}${field('wFsNote', 'หมายเหตุ', `<input id="wFsNote" type="text" value="${wv('wFsNote')}" placeholder="เช่น มีศาลพระภูมิเดิม">`)}</div></div>
<div class="wiz-p" data-p="6"><span class="eyebrow">STEP 7 / 7</span><h2 class="h-m">ตรวจทานความต้องการ</h2><div class="revw" id="wRev" style="margin:18px 0 28px"></div>
<h3 class="h-s">ข้อมูลติดต่อกลับ</h3><div class="form" style="margin-top:14px">${nameTel('wName', 'wTel')}<div class="two">${field('wMail', 'อีเมล (ไม่บังคับ)', '<input id="wMail" type="email" autocomplete="email">')}${field('wCh', 'ช่องทางที่สะดวก', `<select id="wCh">${['โทรศัพท์', 'LINE', 'อีเมล'].map(s => opt(s, s)).join('')}</select>`)}</div>${consent('wOk')}</div></div>
<div class="wiz-nav"><button type="button" class="btn line" id="wBack">ย้อนกลับ</button><button type="button" class="btn" id="wNext">ถัดไป</button></div></form></div>
<div id="wDone"></div></div></section>`,
      init() {
        let step = Math.min(Number(W._step) || 0, 6), files = [];
        const form = $('#wiz'), panes = $$('.wiz-p'), lis = $$('#wSteps li');
        const save = () => { const v = formData(form); v.wStyle = (form.querySelector('[name=wStyle]:checked') || {}).value || ''; v.wNeed = $$('[name=wNeed]:checked').map(x => x.value); v.wFs = (form.querySelector('[name=wFs]:checked') || {}).value || ''; v.wFsI = $$('[name=wFsI]:checked').map(x => x.value); v._step = step; delete v.wOk; store.set('ppsdWizard', v); return v; };
        const bud = () => { const [lo, hi] = $('#wBud').value.split('-').map(Number); return { lo, hi, t: (P.BUD_RANGES.find(r => r[0] === lo) || [, , ''])[2] }; };
        const live = () => {
          const lw = Number($('#wLw').value), ld = Number($('#wLd').value);
          $('#wLandNote').innerHTML = lw && ld ? `ที่ดินประมาณ <b>${fmt(lw * ld)} ตร.ม. (${(lw * ld / 4).toFixed(1)} ตร.ว.)</b> · แบบสำเร็จรูปที่น่าจะลงได้ ${designs().filter(d => d.land <= lw * ld / 4).length} แบบ` : 'ใส่หน้ากว้างและความลึกเพื่อคำนวณขนาดที่ดิน';
          const { lo, hi, t: bt } = bud(), ar = p => fmt(Math.floor(lo / p)) + '–' + fmt(Math.floor(hi / p));
          $('#wAP').innerHTML = ar(18000) + '<small>ตร.ม.</small>'; $('#wAE').innerHTML = ar(23000) + '<small>ตร.ม.</small>';
          $('#wPay').innerHTML = fmt(up100(monthly(lo * 0.9, 6, 30))) + '–' + fmt(up100(monthly(hi * 0.9, 6, 30))) + '<small>บาท</small>';
          const want = Number($('#wArea').value), maxA = Math.floor(hi / Number($('#wPkg').value));
          $('#wBudMsg').innerHTML = want ? (want > maxA ? `พื้นที่ที่ต้องการ <b>${fmt(want)} ตร.ม.</b> มากกว่าที่งบ ${bt} สร้างได้ (ประมาณ ${fmt(maxA)} ตร.ม.) ลองเพิ่มงบ ลดพื้นที่ หรือให้สถาปนิกช่วยปรับ` : `งบ <b>${bt}</b> เพียงพอสำหรับพื้นที่ประมาณ <b>${fmt(want)} ตร.ม.</b> ตามสเปคที่เลือก`) : `งบ <b>${bt}</b> สร้างบ้านได้ประมาณ ${ar(23000)}–${fmt(Math.floor(hi / 18000))} ตร.ม.`;
        };
        const review = () => {
          const v = save(), [lo, hi] = v.wBud.split('-').map(Number), rows = [
            [0, 'สไตล์ · จำนวนชั้น', (v.wStyle || '-') + ' · ' + ({ '1': 'ชั้นเดียว', '2': '2 ชั้น', '3': '3 ชั้น' }[v.wFl] || 'ยังไม่แน่ใจ')],
            [1, 'ที่ดิน', `${v.wLw} × ${v.wLd} ม. (${(v.wLw * v.wLd / 4).toFixed(1)} ตร.ว.) · หน้า${v.wFace} · ${v.wProv}`],
            [1, 'พื้นที่ใช้สอย', fmt(v.wArea) + ' ตร.ม.'],
            [2, 'ห้อง', P.ROOMS.filter(([id]) => Number(v[id]) > 0).map(([id, n]) => n + ' ' + v[id]).join(' · ') + (v.wNeed.length ? ' · ' + v.wNeed.join(', ') : '')],
            [3, 'งบประมาณ', (P.BUD_RANGES.find(r => r[0] === lo) || [, , ''])[2] + ' · ' + (P.PKG.find(p => String(p.rate) === String(v.wPkg)) || {}).name],
            [4, 'ไฟล์แนบ', files.length ? files.length + ' ไฟล์' : 'ไม่มี'],
            [5, 'ฮวงจุ้ย', v.wFs + (v.wFsI.length ? ' · ' + v.wFsI.join(', ') : '')]
          ];
          $('#wRev').innerHTML = rows.map(([s, k, val]) => `<div><span class="k">${k}</span><span>${esc(val)}</span><button type="button" data-goto="${s}">แก้ไข</button></div>`).join('');
        };
        const check = s => {
          if (s === 0) { const ok = !!form.querySelector('[name=wStyle]:checked'); $('#wStyleErr').textContent = ok ? '' : 'กรุณาเลือกสไตล์ (เลือก “ยังไม่แน่ใจ” ได้)'; if (!ok) $('.style-pick input').focus(); return ok; }
          return validate(panes[s]);
        };
        const show = s => {
          step = s; panes.forEach((p, i) => p.classList.toggle('on', i === s));
          lis.forEach((l, i) => { l.classList.toggle('on', i === s); l.classList.toggle('done', i < s); l.setAttribute('aria-current', i === s ? 'step' : 'false'); });
          $('.prog i').style.width = ((s + 1) / 7 * 100) + '%'; $('.prog').setAttribute('aria-valuenow', s + 1);
          $('#wBack').style.visibility = s ? 'visible' : 'hidden'; $('#wNext').textContent = s === 6 ? 'ส่งความต้องการให้สถาปนิก' : 'ถัดไป';
          if (s === 6) review(); if (s === 3) live(); save();
          const top = $('.wiz'); if (top.getBoundingClientRect().top < 0) top.scrollIntoView({ behavior: 'smooth' });
        };
        $('#wNext').onclick = () => {
          if (!check(step)) return;
          if (step < 6) return show(step + 1);
          if (!validate(panes[6])) return;
          const v = save(), [lo, hi] = v.wBud.split('-').map(Number);
          const res = submitLead(form, 'custom', 'ส่งความต้องการออกแบบ', `${v.wStyle} ${v.wFl ? v.wFl + ' ชั้น' : ''} · ${v.cBed} นอน ${v.cBath} น้ำ · ${fmt(v.wArea)} ตร.ม. · งบ ${(P.BUD_RANGES.find(r => r[0] === lo) || [, , ''])[2]} · ที่ดิน ${v.wLw}×${v.wLd} ม. · ฮวงจุ้ย: ${v.wFs} · ไฟล์ ${files.length}`, { files: files.length });
          if (!res) return;
          store.del('ppsdWizard');
          const ex = designs().filter(d => d.land <= (v.wLw * v.wLd / 4 || Infinity)).map(d => ({ d, s: (d.price < lo ? lo - d.price : d.price > hi ? d.price - hi : 0) / hi + (v.wStyle && d.style !== v.wStyle ? 0.3 : 0) + (v.wFl && d.floors !== Number(v.wFl) ? 0.2 : 0) + Math.abs(d.beds - v.cBed) * 0.08 })).sort((a, b) => a.s - b.s).slice(0, 3);
          $('.wiz').hidden = true;
          $('#wDone').innerHTML = `${doneBox(res.ref, 'ได้รับความต้องการของคุณแล้ว', `สถาปนิก PPSD จะติดต่อกลับทาง${esc(v.wCh)}ภายใน 1–2 วันทำการ เพื่อนัดคุยและสำรวจที่ดินฟรี`, `<div class="row" style="margin-top:14px"><a class="btn" href="#appointment">นัดปรึกษาสถาปนิกเลย</a><button type="button" class="btn line" id="cGo" hidden>ออกแบบบ้านให้ดูเลย (AI)</button></div><div id="cGen" class="panel" hidden style="margin-top:18px"></div>`)}<h2 class="h-m" style="margin:48px 0 8px">ตัวอย่างแบบในงบใกล้เคียง</h2><p class="fine">ใช้เป็นภาพตั้งต้นคุยกับสถาปนิก แบบจริงจะออกแบบใหม่ให้เข้ากับความต้องการและที่ดินของคุณ</p><div class="g3" style="margin-top:20px">${ex.map(x => card(x.d)).join('')}</div>`;
          $('.done-box').focus(); leadDone(); window.scrollTo({ top: $('#wDone').offsetTop - 120, behavior: 'smooth' }); P.reveal($('#wDone'));
          if (P.houseGen) P.houseGen(v, files);
        };
        $('#wBack').onclick = () => show(Math.max(0, step - 1));
        $('#wSteps').onclick = e => { const l = e.target.closest('li.done'); if (l) show(Number(l.dataset.s)); };
        $('#wRev').onclick = e => { const b = e.target.closest('[data-goto]'); if (b) show(Number(b.dataset.goto)); };
        form.addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b) { const inp = $('#' + b.dataset.for); inp.value = Math.min(Number(inp.max), Math.max(0, (Number(inp.value) || 0) + Number(b.dataset.step))); save(); } });
        form.addEventListener('input', () => { save(); if (step === 1 || step === 3) live(); });
        form.addEventListener('change', () => { save(); live(); });
        files = uploader($('#wUp'), { max: 5 });
        live(); show(step);
      } };
  };

  /* ---------- ปรับแบบบ้าน ---------- */
  const CHANGES = ['เพิ่ม/ลดจำนวนห้อง', 'ขยายหรือลดพื้นที่', 'ปรับให้เข้ากับขนาดที่ดิน', 'เปลี่ยนรูปแบบภายนอก/สี', 'เปลี่ยนวัสดุหรือแพ็กเกจ', 'ปรับตามหลักฮวงจุ้ย', 'เพิ่มห้องผู้สูงอายุชั้นล่าง'];
  R.modify = id => { const d = byId(id);
    return { t: 'ปรับแบบบ้าน', nav: 1, html: `${ph({ crumb: '<a href="#home">หน้าแรก</a> / รับออกแบบบ้าน', eyebrow: 'MODIFY A DESIGN', title: 'ปรับแบบบ้าน<em>ให้เป็นของคุณ</em>', lead: 'เลือกแบบที่ชอบ บอกสิ่งที่อยากเปลี่ยน สถาปนิกจะประเมินความเป็นไปได้และราคาให้' })}
<section class="sec-s"><div class="w"><div class="calc"><form class="panel form" id="mf" novalidate data-noop data-name="mN" data-phone="mT">
${field('mD', 'แบบบ้านที่ต้องการปรับ', `<select id="mD" required>${opt('', 'เลือกแบบบ้าน')}${designs().map(x => opt(x.id, x.code + ' · ' + x.name, d && x.id === d.id)).join('')}</select>`)}
<div class="f"><span class="lbl">สิ่งที่อยากปรับ</span><div class="chips">${CHANGES.map((c, i) => `<label><input class="peer" type="checkbox" name="mC" value="${c}"><span class="chip">${c}</span></label>`).join('')}</div></div>
${field('mNote', 'รายละเอียด', '<textarea id="mNote" rows="4" required placeholder="เช่น อยากเพิ่มห้องนอนชั้นล่าง 1 ห้อง และขยายห้องนั่งเล่น"></textarea>')}
${uploadBox('mUp', 'แนบรูปหรือแปลนที่ดิน (ไม่บังคับ)', '')}${nameTel('mN', 'mT')}${consent('mOk')}<button class="btn" type="submit">ส่งคำขอปรับแบบ</button></form>
<aside class="res" id="mPrev"></aside></div></div></section>`,
      init() {
        const files = uploader($('#mUp'), { max: 3 });
        const prev = () => { const x = byId($('#mD').value); $('#mPrev').innerHTML = x ? `<a class="hc" href="#design-${x.id}"><div class="ratio">${`<img src="${cover(x).src}" alt="${esc(x.name)}">`}<span class="tag-c">${cover(x).label}</span></div><div class="hc-b"><span class="hc-code">${x.code}</span><h3>${esc(x.name)}</h3><div class="hc-meta"><span>${x.beds} นอน ${x.baths} น้ำ</span><span>${x.area} ตร.ม.</span><span>${mil(x.price)} ล้านบาท</span></div></div></a>` : '<div class="empty">เลือกแบบบ้านเพื่อดูตัวอย่าง</div>'; };
        $('#mD').onchange = prev; prev();
        $('#mf').onsubmit = e => { e.preventDefault(); const res = submitLead(e.target, 'modify', 'ปรับแบบบ้าน', v => `${(byId(v.mD) || {}).code} · ${$$('[name=mC]:checked').map(x => x.value).join(', ')} · ${v.mNote} · ไฟล์ ${files.length}`); if (res) showDone(e.target, doneBox(res.ref, 'ได้รับคำขอปรับแบบแล้ว', 'สถาปนิกจะประเมินความเป็นไปได้และติดต่อกลับภายใน 1–2 วันทำการ')); };
      } };
  };

  /* ---------- ฮวงจุ้ย ---------- */
  const compassSvg = () => { const dirs = ['เหนือ', 'ตอ.น.', 'ตะวันออก', 'ตอ.ต.', 'ใต้', 'ตต.ต.', 'ตะวันตก', 'ตต.น.']; const tri = [[1, 1, 1], [0, 0, 1], [1, 0, 1], [0, 1, 1], [0, 0, 0], [1, 1, 0], [0, 1, 0], [1, 0, 0]];
    let s = '<svg viewBox="-110 -110 220 220" fill="none" stroke="#C9A247" aria-hidden="true">';
    [96, 78, 56, 30, 8].forEach((r, i) => s += `<circle r="${r}" stroke-width="${i === 0 ? 1.2 : .6}" opacity="${i === 4 ? 1 : .8}"/>`);
    for (let i = 0; i < 72; i++) { const a = i * 5 * Math.PI / 180, r1 = i % 9 === 0 ? 86 : 91; s += `<line x1="${Math.sin(a) * r1}" y1="${-Math.cos(a) * r1}" x2="${Math.sin(a) * 96}" y2="${-Math.cos(a) * 96}" stroke-width=".5" opacity=".7"/>`; }
    dirs.forEach((d, i) => { const a = i * 45 * Math.PI / 180; s += `<line x1="${Math.sin(a) * 30}" y1="${-Math.cos(a) * 30}" x2="${Math.sin(a) * 78}" y2="${-Math.cos(a) * 78}" stroke-width=".5" opacity=".5"/>`; const ta = a + 22.5 * Math.PI / 180, x = Math.sin(ta) * 67, y = -Math.cos(ta) * 67; s += `<g transform="translate(${x} ${y}) rotate(${i * 45 + 22.5})">${tri[i].map((b, j) => b ? `<line x1="-7" y1="${-5 + j * 5}" x2="7" y2="${-5 + j * 5}" stroke-width="1.4"/>` : `<line x1="-7" y1="${-5 + j * 5}" x2="-2" y2="${-5 + j * 5}" stroke-width="1.4"/><line x1="2" y1="${-5 + j * 5}" x2="7" y2="${-5 + j * 5}" stroke-width="1.4"/>`).join('')}</g>`; const lx = Math.sin(a) * 43, ly = -Math.cos(a) * 43 + 3; s += `<text x="${lx}" y="${ly}" fill="#F2E8D9" stroke="none" font-size="${d.length > 5 ? 6.5 : 7.5}" text-anchor="middle" font-family="Noto Sans Thai">${d}</text>`; });
    s += '<path d="M0 -24 L5 0 L0 24 L-5 0Z" fill="#C9A247" opacity=".85" stroke="none"/><path d="M0 -24 L5 0 L-5 0Z" fill="#F2E8D9" stroke="none"/></svg>'; return s; };
  R.fengshui = () => ({ t: 'ฮวงจุ้ยและการออกแบบ', nav: 2, html: `${ph({ img: 'r/vanilla-evening', crumb: '<a href="#home">หน้าแรก</a> / บริการของเรา', eyebrow: 'FENG SHUI BY PPSD', title: 'ฮวงจุ้ย เพื่อ<em>บ้านดี ดวงดี</em>', lead: 'ศาสตร์การวางทิศและพื้นที่ ที่ PPSD ใช้ควบคู่กับแสง ลม และการใช้งานจริง โดยผู้บริหารที่เป็นที่ปรึกษาด้านศาสตร์ฮวงจุ้ย', cap: 'ภาพจำลองแนวคิด' })}
<nav class="subnav" aria-label="บริการฮวงจุ้ย"><div class="w"><a href="#fengshui" class="on">รับดูฮวงจุ้ย</a><a href="#fengshui-design">ออกแบบบ้านตามหลักฮวงจุ้ย</a><a href="#fs-form" data-jump>ขอรับคำปรึกษา</a></div></nav>
<section class="sec" id="svc-a"><div class="w"><div class="fs-sec"><figure class="fs-art rv" style="margin:0">${compassSvg()}<span class="cap2">ภาพประกอบ (Illustration) · ไม่ใช่ภาพถ่าย</span></figure><div class="rv"><span class="eyebrow">SERVICE A</span><h2 class="h-l">รับดูฮวงจุ้ย</h2><p class="lead" style="margin-top:16px">ประเมินบ้านเดิม ที่ดินก่อนซื้อ หรือแบบบ้านที่มีอยู่ ด้วยการอ่านทิศจากเข็มทิศและผังจริง เพื่อแนะนำตำแหน่งสำคัญที่ส่งผลต่อการอยู่อาศัย</p>
<ul class="bul"><li>อ่านทิศหน้าที่ดิน ทางเข้า และประตูหลัก</li><li>ตรวจตำแหน่งห้องนอนเจ้าบ้าน เตาไฟ และห้องพระ</li><li>แนะนำการปรับแก้ที่ทำได้จริงกับบ้านเดิม</li><li>หาฤกษ์ลงเสาเข็ม และมีชุดพิธีให้เลือก</li></ul>
<div class="row" style="margin-top:26px"><a class="btn" href="#fs-form" data-jump data-svc="A">ขอรับดูฮวงจุ้ย</a><a class="link-u" href="#team">ที่ปรึกษาของเรา</a></div><p class="fine" style="margin-top:14px">ขั้นตอน ระยะเวลา และค่าบริการ รอทีมยืนยันก่อนเผยแพร่</p></div></div></div></section>
<section class="sec bg-2" id="svc-b"><div class="w"><div class="fs-sec rev"><figure class="fs-art light rv" style="margin:0" id="fsPlan"><span class="cap2">ภาพประกอบ: แปลนแบบ PPSD-16 ซ้อนตาราง 9 ช่อง</span></figure><div class="rv"><span class="eyebrow">SERVICE B</span><h2 class="h-l">ออกแบบบ้านตามหลักฮวงจุ้ย</h2><p class="lead" style="margin-top:16px">สถาปนิกวางผังบ้านใหม่ทั้งหลังโดยใช้หลักฮวงจุ้ยตั้งแต่วันแรก แบ่งพื้นที่ตามทิศ แล้ววางห้องให้ลงตัวทั้งฮวงจุ้ย แสงธรรมชาติ และการระบายลม</p>
<ul class="bul"><li>วางผังตามทิศของที่ดินจริง ด้วยตาราง 9 ช่อง</li><li>กำหนดตำแหน่งประตู ห้องนอนเจ้าบ้าน ครัว และบันได</li><li>บ้านโปร่ง โล่ง สบาย ลดความร้อนสะสม</li><li>เห็นผลลัพธ์เป็นแปลนและภาพ 3D ก่อนก่อสร้าง</li></ul>
<div class="row" style="margin-top:26px"><a class="btn" href="#fs-form" data-jump data-svc="B">ขอออกแบบตามหลักฮวงจุ้ย</a><a class="link-u" href="#custom">ส่งความต้องการออกแบบ</a></div></div></div></div></section>
<section class="sec-s" id="fs-pkg"><div class="w"><div class="split at"><div><span class="eyebrow">INCLUDED WITH EVERY BUILD</span><h2 class="h-l">ฤกษ์ พิธี และฮวงจุ้ย<em>ที่รวมในแพ็กเกจ</em></h2><p class="muted" style="margin-top:14px">เมื่อสร้างบ้านกับ PPSD ทุกแพ็กเกจได้กำหนดฤกษ์ยามสำคัญ และกำหนดตำแหน่งเจ้าบ้าน เตาไฟ และประตูมงคล · ดูฤกษ์ยามตามศาสตร์ไทย จีน และพราหมณ์</p><a class="link-u" href="#materials" style="margin-top:10px">ดูตารางวัสดุทุกหมวด</a></div>
<div>${specTable(P.SPEC[0][2])}<div style="margin-top:22px">${specTable(P.SPEC[2][2].filter(r => r[0] === 'ฮวงจุ้ย'))}</div></div></div></div></section>
<section class="sec" id="fs-form"><div class="w-n"><div class="center" style="margin-bottom:32px"><span class="eyebrow">CONSULTATION</span><h2 class="h-l">ขอรับคำปรึกษาฮวงจุ้ย</h2><p class="lead">แนบแปลนบ้านหรือแผนที่ที่ดิน (ถ้ามี) ทีมจะติดต่อกลับเพื่อนัดหมาย</p></div>
<form class="panel form" id="fsF" novalidate data-noop data-name="fsN" data-phone="fsT"><div class="two">${field('fsS', 'บริการที่สนใจ', `<select id="fsS" required>${opt('A', 'รับดูฮวงจุ้ย')}${opt('B', 'ออกแบบบ้านตามหลักฮวงจุ้ย')}${opt('AB', 'ทั้งสองบริการ')}</select>`)}${field('fsP', 'สิ่งที่ต้องการให้ดู', `<select id="fsP">${['บ้านที่อยู่ปัจจุบัน', 'ที่ดินก่อนซื้อ/ก่อนสร้าง', 'แบบบ้านที่มีอยู่', 'อาคารสำนักงาน/โรงงาน'].map(s => opt(s, s)).join('')}</select>`)}</div>
<div class="two">${field('fsD', 'ทิศหน้าที่ดิน/หน้าบ้าน', `<select id="fsD">${['ยังไม่ทราบ', 'เหนือ', 'ใต้', 'ตะวันออก', 'ตะวันตก', 'ตะวันออกเฉียงเหนือ', 'ตะวันออกเฉียงใต้', 'ตะวันตกเฉียงเหนือ', 'ตะวันตกเฉียงใต้'].map(s => opt(s, s)).join('')}</select>`)}${field('fsL', 'จังหวัด', `<select id="fsL">${P.REGIONS.map(([r]) => opt(r, r)).join('')}${opt('อื่น ๆ', 'จังหวัดอื่น')}</select>`)}</div>
${uploadBox('fsUp', 'แนบแปลนบ้าน แผนที่ หรือรูปที่ดิน (ไม่บังคับ)', 'สูงสุด 5 ไฟล์')}${field('fsM', 'รายละเอียดเพิ่มเติม', '<textarea id="fsM" rows="3"></textarea>')}${nameTel('fsN', 'fsT')}${consent('fsOk')}<button class="btn" type="submit">ส่งคำขอรับคำปรึกษา</button></form></div></section>`,
    init() {
      const files = uploader($('#fsUp'), { max: 5 });
      $$('[data-jump]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); if (a.dataset.svc) $('#fsS').value = a.dataset.svc; $('#fs-form').scrollIntoView({ behavior: 'smooth' }); }));
      fetch('plans/ppsd-44.json').then(r => r.json()).then(x => {
        const f = x.layout.floors[0], rs = f.rooms; let W = 0, D = 0; rs.forEach(r => { W = Math.max(W, r.x + r.w); D = Math.max(D, r.y + r.d); });
        const S = 300 / Math.max(W, D), ox = (360 - W * S) / 2, oy = (360 - D * S) / 2;
        let s = `<svg viewBox="0 0 360 360" aria-hidden="true"><g font-family="Noto Sans Thai" font-size="9" fill="#0C2340">`;
        rs.forEach(r => { s += `<rect x="${ox + r.x * S}" y="${oy + r.y * S}" width="${r.w * S}" height="${r.d * S}" fill="${/bed/.test(r.type) ? '#EFE6D2' : /kitchen|dining/.test(r.type) ? '#F3EADB' : '#fff'}" stroke="#0C2340" stroke-width="1.1"/>`; if (r.w * S > 40 && r.d * S > 22) s += `<text x="${ox + (r.x + r.w / 2) * S}" y="${oy + (r.y + r.d / 2) * S + 3}" text-anchor="middle">${esc(r.name).slice(0, 14)}</text>`; });
        const lab = [['ตต.น.', 'เหนือ', 'ตอ.น.'], ['ตะวันตก', 'ศูนย์กลาง', 'ตะวันออก'], ['ตต.ต.', 'ใต้', 'ตอ.ต.']];
        for (let i = 1; i < 3; i++) { s += `<line x1="${ox + W * S * i / 3}" y1="${oy - 8}" x2="${ox + W * S * i / 3}" y2="${oy + D * S + 8}" stroke="#C9A247" stroke-width="1.2" stroke-dasharray="5 4"/><line x1="${ox - 8}" y1="${oy + D * S * i / 3}" x2="${ox + W * S + 8}" y2="${oy + D * S * i / 3}" stroke="#C9A247" stroke-width="1.2" stroke-dasharray="5 4"/>`; }
        lab.forEach((row, j) => row.forEach((l, i) => { s += `<text x="${ox + W * S * (i + .5) / 3}" y="${oy + D * S * j / 3 + 12}" text-anchor="middle" fill="#9A7A2E" font-size="8.5">${l}</text>`; }));
        s += `<rect x="${ox}" y="${oy}" width="${W * S}" height="${D * S}" fill="none" stroke="#C9A247" stroke-width="1.6"/><text x="${ox + W * S / 2}" y="${oy - 14}" text-anchor="middle" font-size="10" fill="#9A7A2E">▲ ทิศเหนือ (ภาพประกอบ)</text></g></svg>`;
        $('#fsPlan').insertAdjacentHTML('afterbegin', s);
      }).catch(() => { });
      $('#fsF').onsubmit = e => { e.preventDefault(); const res = submitLead(e.target, 'fengshui', 'รับดูฮวงจุ้ย/ออกแบบตามหลักฮวงจุ้ย', v => `${{ A: 'รับดูฮวงจุ้ย', B: 'ออกแบบตามหลักฮวงจุ้ย', AB: 'ทั้งสองบริการ' }[v.fsS]} · ${v.fsP} · หน้า${v.fsD} · ${v.fsL} · ไฟล์ ${files.length}${v.fsM ? ' · ' + v.fsM : ''}`); if (res) showDone(e.target, doneBox(res.ref, 'ได้รับคำขอปรึกษาฮวงจุ้ยแล้ว', 'ทีมจะติดต่อกลับเพื่อนัดหมายภายใน 1–2 วันทำการ')); };
    } });

  /* ---------- ขั้นตอนสร้างบ้าน 6 ขั้น ---------- */
  const planSketch = () => `<svg viewBox="0 0 400 300" style="width:100%;height:100%;background:#F4EFE6" aria-hidden="true"><g fill="none" stroke="#0C2340" stroke-width="1.2"><rect x="60" y="50" width="280" height="200"/><path d="M60 140h120v110M180 50v60h160M260 110v140M180 190h80"/><path d="M110 250v-10M230 140h-10" stroke-width="3" stroke="#FAF7F2"/></g><g fill="none" stroke="#C9A247" stroke-width=".8" stroke-dasharray="3 3"><path d="M40 50h-10v200h10M60 30v-10h280v10"/></g><g font-family="Noto Sans Thai" font-size="11" fill="#0C2340" text-anchor="middle"><text x="120" y="98">ห้องนั่งเล่น</text><text x="260" y="85">ครัว</text><text x="120" y="200">ห้องนอน 1</text><text x="220" y="225">ห้องนอน 2</text><text x="300" y="185">ห้องน้ำ</text></g><g font-family="Noto Sans Thai" font-size="9" fill="#9A7A2E" text-anchor="middle"><text x="200" y="16">แปลนตัวอย่างประกอบการปรึกษา</text></g><path d="M368 30v26M362 40l6-10 6 10" stroke="#C9A247" fill="none"/><text x="368" y="70" font-size="9" fill="#9A7A2E" text-anchor="middle" font-family="Noto Sans Thai">N</text></svg>`;
  const SIX = [
    ['ปรึกษาและวางแผน', 'PLAN', null, 'แปลนตัวอย่างประกอบการปรึกษา (ภาพประกอบ)', ['ทักผ่าน LINE เว็บ หรือโทร เล่าความต้องการ', 'ประเมินราคาและงบรวมเบื้องต้นฟรี', 'นัดคุยกับสถาปนิกและสำรวจที่ดินฟรี'], 'ฟรี ยังไม่มีค่าใช้จ่าย'],
    ['ออกแบบบ้าน', 'DESIGN', 'h3-3d', 'ภาพ 3D ก่อนสร้าง ผลงานจริงของ PPSD', ['จองแบบ เริ่มออกแบบผังตามทิศและฮวงจุ้ย', 'ตรวจภาพ 3D ยืนยันวัสดุและสเปค', 'แก้แบบตามสิทธิ์ Premium 2 ครั้ง / Elite 4 ครั้ง'], 'ค่าจองแบบ 30,000–40,000 บาท หักเป็นค่าก่อสร้าง (หนังสือจองอายุ 1 ปี)'],
    ['ทำสัญญาและเตรียมงาน', 'CONTRACT', 'h5-a', 'การเตรียมพื้นที่ก่อสร้างจริง', ['ทีมช่วยยื่นกู้ธนาคารให้ฟรี', 'บริษัทดูแลเขียนแบบและขออนุญาตก่อสร้าง', 'เซ็นสัญญา ตรวจแบบ สเปค และงวดเงิน · หาฤกษ์ลงเสาเข็ม'], 'ชำระตามงวดในสัญญา · <a href="#documents" style="border-bottom:1px solid var(--gold)">เช็กเอกสารที่ต้องเตรียม</a>'],
    ['ดำเนินการก่อสร้าง', 'BUILD', 'h4-b', 'หน้างานก่อสร้างจริง โครงสร้าง 3 ชั้น', ['ตรวจงานทุกขั้น พบจุดแก้ แก้แล้วตรวจซ้ำ', 'ติดตามรูปหน้างานและรายงานใน “บ้านของฉัน” และ LINE', 'ถ่ายเก็บท่อและสายไฟทุกผนังก่อนปิด'], 'จ่ายตามงวดหลังงานแต่ละขั้นเสร็จ · ส่งช้า บริษัทจ่ายค่าปรับวันละ 1,000 บาท'],
    ['ตรวจสอบและส่งมอบ', 'HANDOVER', 'h2-b', 'บ้านที่ส่งมอบแล้ว ผลงานจริง', ['ตรวจบ้านร่วมกับเจ้าของบ้านทีละจุด', 'แก้ไขรายการที่พบก่อนเซ็นใบส่งมอบ', 'ส่งมอบสมุดบ้านดิจิทัลและเริ่มนับรับประกัน'], 'งวดสุดท้ายเมื่อตรวจรับเรียบร้อย'],
    ['ดูแลหลังส่งมอบ', 'AFTERCARE', 'h1-b', 'บ้านที่เจ้าของเข้าอยู่แล้ว ผลงานจริง', ['แจ้งซ่อมผ่านบ้านของฉันหรือ LINE ติดตามสถานะได้', 'นัดตรวจบ้าน 6 และ 12 เดือน', 'รับประกันโครงสร้าง 5 ปี หลังคา ไฟฟ้า ประปา สี ฝ้า 1 ปี'], 'ตามเงื่อนไขรับประกัน · <a href="#warranty" style="border-bottom:1px solid var(--gold)">ดูรายละเอียด</a>']
  ];
  R.process = () => ({ t: 'ขั้นตอนสร้างบ้าน', nav: 2, html: `${ph({ img: 'r/cream-vanilla-sky', crumb: '<a href="#home">หน้าแรก</a> / บริการของเรา', eyebrow: 'CONSTRUCTION PROCESS', title: 'สร้างบ้านกับ PPSD <em>6 ขั้นตอน</em>', lead: 'รู้ล่วงหน้าว่าแต่ละขั้นคุณต้องทำอะไร ทีมทำอะไร และจ่ายเงินตอนไหน', cta: [['#appointment', 'นัดคุยกับสถาปนิกฟรี']], cap: 'ภาพจำลองแนวคิด' })}
<section class="istrip" aria-label="ภาพรวม 6 ขั้นตอน"><div class="w"><div class="p6">${SIX.map(([tt, en], i) => `<button type="button" data-jump="st${i + 1}"><span class="n">0${i + 1}</span>${I[['talk', 'pen', 'doc', 'helmet', 'inspect', 'key'][i]]}<b>${tt}</b><small>${en}</small></button>`).join('')}</div></div></section>
<section class="sec-s"><div class="w"><div class="steps6">${SIX.map(([tt, en, im, cap, li, money], i) => `<article class="st" id="st${i + 1}"><div class="no">0${i + 1}</div><div><span class="eyebrow" style="margin-bottom:8px">${en}</span><h2 class="h-m">${tt}</h2><ul>${li.map(x => `<li>${x}</li>`).join('')}</ul><p class="money"><b>เรื่องเงิน:</b> ${money}</p></div><figure class="st-img" style="margin:0"><div class="ratio r-32">${im ? img(im, cap) : planSketch()}</div><figcaption class="cap">${cap}</figcaption></figure></article>`).join('')}</div>
<div class="row" style="margin-top:40px;justify-content:center"><a class="btn" href="#appointment">นัดคุยกับสถาปนิกฟรี</a><a class="btn line" href="#budget-calc">ประเมินงบประมาณ</a></div><p class="fine center" style="margin-top:16px">ระยะเวลาแต่ละขั้นขึ้นกับขนาดบ้าน รอทีมยืนยันตารางมาตรฐาน</p></div></section>`,
    init() { $$('[data-jump]').forEach(b => b.onclick = () => { const el = document.getElementById(b.dataset.jump); if (el) { el.classList.add('in'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }); } });

  /* ---------- วัสดุและมาตรฐาน ---------- */
  const MATS = [
    ['ระบบโครงสร้าง', 'Structure', 'h4-a', 'งานโครงสร้าง คสล. หน้างานจริง', 'เสาเข็ม ฐานราก เสา คาน และพื้น', ['ตรวจระดับและตำแหน่งเสาเข็มครบทุกต้น', 'ตรวจรอยต่อเหล็กและรอยเชื่อม แก้แล้วตรวจซ้ำ', 'รับประกันโครงสร้าง 5 ปี']],
    ['หลังคา', 'Roofing', 'h5-b', 'โครงหลังคาเหล็กหน้างานจริง', 'โครงหลังคา วัสดุมุง ฉนวน และชายคา', ['หลังคา PU ช่วยกันความร้อนเข้าสู่ตัวบ้าน', 'ชายคายื่นกันแดดฝนตามแบบ', 'รับประกันหลังคาและรั่วซึม 1 ปี']],
    ['ผนัง', 'Walls', 'h3-b', 'งานผนังก่อและฉาบหน้างานจริง', 'ผนังก่อ ฉาบ และผนังตกแต่ง', ['ตรวจแนวดิ่งผนัง เกินเกณฑ์รื้อก่อใหม่', 'ช่องระบายอากาศรอบหลังคาลดความร้อนสะสม']],
    ['พื้น', 'Flooring', 'h2-f', 'ชานไม้และพื้นผลงานจริง', 'พื้นภายในและภายนอก', ['กระเบื้อง 60×120 ร่องน้อย ทำความสะอาดง่าย', 'ชานไม้ภายนอกตามแบบ']],
    ['ประตูและหน้าต่าง', 'Doors & Windows', 'r/crop-windows', 'ภาพจำลองแนวคิด', 'ประตู หน้าต่าง ช่องแสง และราวระเบียง', ['วางช่องเปิดตรงข้ามกันให้ลมพัดผ่าน', 'ราวกัลวาไนซ์ ไม่เป็นสนิม ดูแลง่าย']],
    ['ระบบไฟฟ้า', 'Electrical', 'r/crop-lighting', 'ภาพจำลองแนวคิด', 'สายไฟ จุดไฟ จุดแอร์ และแสงสว่าง', ['ถ่ายเก็บแนวสายไฟทุกผนังก่อนปิด เก็บในสมุดบ้าน', 'อัปเกรดจุดไฟเพิ่ม 1,700 บาท/จุด · จุดแอร์ 2,700 บาท/จุด', 'รับประกันระบบไฟฟ้า 1 ปี']],
    ['ระบบประปา', 'Plumbing', 'h2-g', 'งานระบบน้ำและพื้นที่เปียกผลงานจริง', 'ท่อน้ำดี น้ำทิ้ง และปั๊มน้ำ', ['ถ่ายเก็บแนวท่อทุกผนังก่อนปิด', 'อัปเกรดปั๊มน้ำ 27,000 บาท/ชุด', 'รับประกันระบบประปา 1 ปี']],
    ['งานตกแต่งภายใน', 'Interior Finishing', 'r/crop-interior', 'ภาพจำลองแนวคิด', 'ฝ้า สี บัว และงานตกแต่ง', ['ฝ้าสูง 2.8 ม. ในแพ็กเกจ Elite', 'รับประกันสีและฝ้า 1 ปี']]
  ];
  /* ตารางรายละเอียดวัสดุ Premium / Elite (ข้อมูลจากเอกสารวัสดุของบริษัท) */
  const specCell = x => x === '✓' ? '<span class="sp-ok" aria-label="รวมในแพ็กเกจ">✓</span>' : x === '—' ? '<span class="sp-no" aria-label="ไม่รวม">—</span>' : esc(x);
  const specRows = rows => rows.map(([g, dsc, a, b, n], i) => `<tr><th scope="row">${i && rows[i - 1][0] === g ? '' : esc(g)}</th><td>${esc(dsc)}</td>${b === '=' ? `<td colspan="2" class="sp-both">${specCell(a)}</td>` : `<td>${specCell(a)}</td><td class="sp-e">${specCell(b)}</td>`}<td class="fine">${n ? esc(n) : ''}</td></tr>`).join('');
  const specTable = (rows, note) => `<div class="scroll-x"><table class="tbl sp-t"><thead><tr><th>หมวดงาน</th><th>รายละเอียด</th><th>Premium</th><th class="sp-e">Elite</th><th>หมายเหตุ</th></tr></thead><tbody>${specRows(rows)}</tbody></table></div>${note ? `<p class="fine" style="margin:8px 0 0">${esc(note)}</p>` : ''}`;
  P.specTable = specTable;
  R.materials = () => ({ t: 'วัสดุและมาตรฐาน', nav: 2, html: `${ph({ img: 'h3-d', cap: 'ภาพถ่ายหน้างานจริง', crumb: '<a href="#home">หน้าแรก</a> / บริการของเรา', eyebrow: 'MATERIALS & STANDARDS', title: 'วัสดุและ<em>มาตรฐาน</em>งานก่อสร้าง', lead: 'สิ่งที่เราเลือกใช้ และวิธีที่เราตรวจงานแต่ละหมวด' })}
<section class="sec-s"><div class="w"><div class="note" style="margin-bottom:36px"><span><b>สเปควัสดุจากเอกสารของบริษัท</b> · ตารางเทียบ Premium / Elite ทุกหมวดอยู่ด้านล่าง การยืนยันวัสดุของแต่ละโครงการยึดใบยืนยันวัสดุเป็นหลัก <a href="#spec" data-spec style="border-bottom:1px solid var(--gold)">ดูตารางวัสดุ</a></span></div>
<div class="mat">${MATS.map(([th, en, im, cap, d, li]) => `<article class="rv"><div class="ratio">${im.startsWith('r/') ? `<img src="img/${im}.jpg" alt="${esc(th)}" loading="lazy">` : img(im, th, '', '-s')}<span class="tag-c">${cap.includes('จำลอง') ? 'ภาพจำลองแนวคิด' : 'ภาพจริง'}</span></div><span class="eyebrow" style="margin:16px 0 0">${en}</span><h3 style="margin-top:4px">${th}</h3><p>${d}</p><ul>${li.map(x => `<li>${x}</li>`).join('')}</ul></article>`).join('')}</div></div></section>
<section class="sec bg-2"><div class="w"><div class="split at"><div><span class="eyebrow">PACKAGES</span><h2 class="h-l">เทียบแพ็กเกจ <em class="en">Premium</em> และ <em class="en">Elite</em></h2><p class="muted" style="margin-top:14px">อัตราต่อ ตร.ม. เป็นตัวอย่างจากเว็บเดิม รอยืนยันกับใบเสนอราคา</p></div>
<div class="scroll-x"><table class="tbl" style="background:#fff"><thead><tr><th>รายการ</th><th>Premium</th><th>Elite</th></tr></thead><tbody><tr><td>อัตราค่าก่อสร้าง (ตัวอย่าง)</td><td>${fmt(18000)} บาท/ตร.ม.</td><td>${fmt(23000)} บาท/ตร.ม.</td></tr><tr><td>สิทธิ์แก้แบบ</td><td>2 ครั้ง</td><td>4 ครั้ง</td></tr><tr><td>ภาพ 3D</td><td>5 รูป</td><td>10 รูป</td></tr><tr><td>ภาพเรนเดอร์เสมือนจริง</td><td>—</td><td>✓</td></tr><tr><td>ฝ้าเพดาน (ห้องทั่วไป)</td><td>สูง 2.7 ม.</td><td>สูง 2.8 ม.</td></tr><tr><td>ความสูงพื้นบ้าน</td><td>50 ซม.</td><td>90 ซม.</td></tr><tr><td>ตู้ไฟ</td><td>14 ช่อง</td><td>18 ช่อง · ไฟ 3 เฟสฟรี</td></tr><tr><td>สุขภัณฑ์</td><td>งบ 12,000 บาท/ห้อง</td><td>งบ 15,000 บาท/ห้อง</td></tr><tr><td>รายละเอียดทุกหมวด</td><td colspan="2"><a href="#spec" data-spec class="link-u">ดูตารางวัสดุด้านล่าง</a></td></tr></tbody></table></div></div>
<div class="split at" style="margin-top:56px"><div><span class="eyebrow">UPGRADES</span><h2 class="h-m">รายการอัปเกรด</h2></div><div class="scroll-x"><table class="tbl" style="background:#fff"><thead><tr><th>รายการ</th><th class="n">ราคา (บาท)</th></tr></thead><tbody>${[['จุดไฟเพิ่ม', '1,700 / จุด'], ['จุดแอร์เพิ่ม', '2,700 / จุด'], ['ปั๊มน้ำ', '27,000'], ['ชุดพิธี', '15,000 / 35,000 / 50,000']].map(r => `<tr><td>${r[0]}</td><td class="n">${r[1]}</td></tr>`).join('')}</tbody></table><div class="row" style="margin-top:20px"><a class="btn" href="#budget-calc">คำนวณงบตามแพ็กเกจ</a><a class="btn line" href="#quote">ขอใบเสนอราคา</a></div></div></div></div></section>
<section class="sec" id="spec"><div class="w"><div class="sh"><div><span class="eyebrow">MATERIAL SPECIFICATION</span><h2 class="h-l">ตารางรายละเอียดวัสดุ <em class="en">Premium</em> และ <em class="en">Elite</em></h2></div><p class="muted" style="margin:0;max-width:520px">ทุกหมวดตั้งแต่ฤกษ์ งานออกแบบ โครงสร้าง ไปจนถึงงานระบบ · ✓ = รวมในแพ็กเกจ · — = ไม่รวม</p></div>
<div class="sp-acc">${P.SPEC.map(([th, en, rows, note], i) => `<details class="sp-cat"${i ? '' : ' open'}><summary><span class="num gold">${String(i + 1).padStart(2, '0')}</span><span><b>${th}</b><small>${en}</small></span></summary><div class="sp-in">${specTable(rows, note)}</div></details>`).join('')}</div>
<p class="fine" style="margin-top:18px">ที่มา: ตารางรายละเอียดวัสดุของ PPSD · การยืนยันวัสดุ รวมถึงข้อตกลงต่างๆ ยึดใบยืนยันวัสดุของแต่ละโครงการเป็นหลัก · ภาพในเอกสารเป็นภาพตัวอย่าง</p></div></section>`,
    init() { $$('[data-spec]').forEach(a => a.onclick = e => { e.preventDefault(); $('#spec').scrollIntoView({ behavior: 'smooth' }); }); } });

  /* ---------- เกี่ยวกับ PPSD ---------- */
  R.about = () => ({ t: 'เกี่ยวกับ PPSD', nav: 3, html: `${ph({ img: 'h2-a', crumb: '<a href="#home">หน้าแรก</a> / รู้จัก PPSD', eyebrow: 'ABOUT PPSD', title: 'บ้านที่ดี เริ่มต้นจาก<em>ความไว้วางใจ</em>', lead: P.CO.nameTh + ' รับสร้างบ้านอิงหลักฮวงจุ้ย ราชบุรีและกรุงเทพฯ', cta: [['#works', 'ดูผลงานของเรา'], ['#appointment', 'นัดคุยกับทีม', 'line']], cap: 'ภาพถ่ายผลงานจริง' })}${istrip([['compass', 'ออกแบบอิงหลักฮวงจุ้ย', 'Feng shui design'], ['shield', 'มาตรฐานงานก่อสร้าง', 'Construction standard'], ['team', 'ทีมงานมืออาชีพ', 'Professional team'], ['gem', 'ไม่มีประวัติทิ้งงาน', 'Trust & reliability']])}
<nav class="subnav"><div class="w"><a href="#about" class="on">เกี่ยวกับบริษัท</a><a href="#team">ผู้บริหารและทีมงาน</a><a href="#video">วิดีโอแนะนำบริษัท</a><a href="#warranty">มาตรฐานและการรับประกัน</a><a href="#knowledge">บทความและความรู้</a></div></nav>
<section class="sec"><div class="w"><div class="split at"><div class="rv"><span class="eyebrow">OUR STORY</span><h2 class="h-l">จากความรักในงานก่อสร้าง สู่<em>บ้านกว่าร้อยหลัง</em></h2></div><div class="rv"><p class="lead" style="max-width:none">PPSD เริ่มต้นจากผู้บริหารที่มีใจรักงานก่อสร้าง ผ่านประสบการณ์ธุรกิจตกแต่งบ้านกว่า 10 สาขามาตลอดกว่า 10 ปี จนได้สร้างบ้านพักอาศัยของตัวเองมูลค่ากว่า 20 ล้านบาท ประสบการณ์ครั้งนั้นคือแรงบันดาลใจในการเปิดบริษัทรับสร้างบ้าน</p><p class="muted">วันนี้ PPSD ออกแบบอิงหลักฮวงจุ้ย เป็นเจ้าแรกในราชบุรีที่โดดเด่นเรื่องความโปร่ง โล่ง สบายของตัวบ้าน และยึดหลักจ่ายตามงานจริง ตรวจสอบได้ทุกขั้น</p>
<div class="stats"><div><b>${P.CO.founded}</b><span>ปีที่เริ่มต้น</span></div><div><b>100+</b><span>หลังที่สร้างแล้ว</span></div><div><b>2</b><span>สาขา ราชบุรี · กรุงเทพฯ</span></div></div></div></div>
<div class="story" style="margin-top:clamp(56px,7vw,96px)">${P.STORY.map(([y, a, b]) => `<div class="rv"><span class="y">${y}</span><b>${a}</b><span>${b}</span></div>`).join('')}</div></div></section>
<section class="sec bg-2"><div class="w"><span class="eyebrow">PHILOSOPHY</span><h2 class="h-l" style="max-width:720px">ปรัชญาการสร้างบ้าน<em>ของเรา</em></h2><div class="g3" style="margin-top:40px">${[['ออกแบบอิงฮวงจุ้ย', 'วางผังให้เหมาะกับทิศ แสง ลม และบริบทของที่ดิน ดูตำแหน่งเจ้าบ้าน เตาไฟ และประตู'], ['บ้านโปร่ง โล่ง สบาย', 'ลดความร้อนสะสมด้วยการวางทิศ ช่องลมตรงข้าม และช่องระบายอากาศรอบหลังคา'], ['โปร่งใส ตรวจสอบได้', 'เห็นบ้านเป็นภาพ 3D ก่อนสร้าง จ่ายตามงานจริง เห็นผลตรวจงานทุกครั้ง']].map(([a, b], i) => `<div class="rv" style="border-top:1px solid var(--line-2);padding-top:22px"><span class="num gold" style="font-size:22px">0${i + 1}</span><h3 class="h-m" style="margin:8px 0">${a}</h3><p class="muted">${b}</p></div>`).join('')}</div></div></section>
<section class="sec" id="team"><div class="w"><div class="center" style="margin-bottom:clamp(40px,6vw,72px)"><span class="eyebrow">LEADERSHIP</span><h2 class="h-l">ทีม<em>ผู้บริหาร</em></h2></div>
<div style="display:grid;gap:clamp(56px,8vw,104px)">${P.EXECS.map((e, i) => `<article class="exec rv"${i % 2 ? ' style="direction:rtl"' : ''}><div class="ratio r-45" style="direction:ltr;max-width:440px;${i % 2 ? 'margin-left:auto' : ''}"><img src="img/${e.img}.jpg" alt="${esc(e.name)} ${esc(e.role)}" loading="lazy"></div><div style="direction:ltr"><span class="eyebrow">${e.roleEn.toUpperCase()}</span><h3 class="h-l">${e.name}</h3><p class="muted" style="margin-top:6px">${e.role} · ${e.nameEn}</p><ul>${e.bio.map(b => `<li>${b}</li>`).join('')}</ul></div></article>`).join('')}</div>
<div class="panel" style="margin-top:clamp(56px,7vw,96px)"><div class="split"><div><span class="eyebrow">OUR TEAM</span><h3 class="h-m">ทีมงานประจำและเครือข่ายช่าง</h3><p class="muted" style="margin-top:10px">ทีมสถาปนิก วิศวกร โฟร์แมน และฝ่ายบริการลูกค้า ร่วมกับเครือข่ายช่างในพื้นที่ภาคตะวันตก (ข้อมูลปี 2564: พนักงานประจำเกือบ 15 คน ช่างในเครือข่ายเกือบ 200 คน)</p></div><p class="fine" style="margin:0">รูปทีมงานจริงจะเพิ่มเมื่อทีมส่งไฟล์ — เว็บนี้ไม่ใช้รูปหรือชื่อพนักงานที่แต่งขึ้น</p></div></div></div></section>
${film()}
<section class="sec"><div class="w"><div class="split"><div><span class="eyebrow">QUALITY & TRUST</span><h2 class="h-l">คุณภาพที่ตรวจสอบได้ และ<em>การดูแลระยะยาว</em></h2><p class="muted" style="margin-top:14px">ตรวจงานทุกขั้นพร้อมรูปก่อน–หลังแก้ จ่ายตามงวดงานจริง และรับประกันเป็นลายลักษณ์อักษร</p><div class="row" style="margin-top:20px"><a class="btn" href="#warranty">มาตรฐานและการรับประกัน</a><a class="btn line" href="#works">ดูผลงานจริง</a></div></div>
<div><h3 class="h-s" style="margin-bottom:10px">สาขา</h3>${P.CO.branches.map(b => `<div style="padding:16px 0;border-top:1px solid var(--line)"><b style="font-weight:500;color:var(--navy)">${b.th}</b><p class="muted" style="margin:4px 0 0">${b.addr}${b.verified ? '' : ' · <span class="badge warn">รอยืนยันที่อยู่เต็ม</span>'}</p></div>`).join('')}<a class="link-u" href="#contact" style="margin-top:12px">แผนที่และช่องทางติดต่อ</a></div></div></div></section>` });

  R.video = () => ({ t: 'วิดีโอแนะนำบริษัท', nav: 3, html: `${ph({ crumb: '<a href="#home">หน้าแรก</a> / <a href="#about">รู้จัก PPSD</a>', eyebrow: 'COMPANY FILM', title: 'วิดีโอแนะนำบริษัท <em class="en">PPSD</em>' })}${film(true)}<section class="sec-s"><div class="w-n center"><p class="lead">ทำความรู้จักทีมงาน วิธีคิด และผลงานของ PPSD ผ่านวิดีโอแนะนำบริษัท</p><div class="row" style="justify-content:center;margin-top:20px"><a class="btn line" href="${P.CO.youtube}" target="_blank" rel="noopener">ช่อง YouTube ของ PPSD</a><a class="btn" href="#appointment">นัดคุยกับทีม</a></div></div></section>` });

  R.warranty = () => ({ t: 'มาตรฐานและการรับประกัน', nav: 3, html: `${ph({ crumb: '<a href="#home">หน้าแรก</a> / รู้จัก PPSD', eyebrow: 'STANDARDS & WARRANTY', title: 'มาตรฐานและ<em>การรับประกัน</em>', lead: 'สร้างบ้านในฝัน กับบริษัทที่ไม่มีประวัติทิ้งงาน' })}
<section class="sec"><div class="w"><div class="split at"><div><span class="eyebrow">WARRANTY</span><h2 class="h-l">การรับประกันหลังส่งมอบ</h2><p class="muted" style="margin-top:12px">นับจากวันส่งมอบบ้าน</p></div><table class="tbl"><tbody>${P.WARRANTY.map(([a, b]) => `<tr><td>${a}</td><td class="n num" style="font-size:22px;color:var(--navy)">${b}</td></tr>`).join('')}</tbody></table></div>
<div class="g3" style="margin-top:72px">${[['ตรวจงานทุกขั้น', 'ทุกขั้นงานมีผลตรวจ ทั้งงานที่ผ่านและจุดที่พบปัญหา พร้อมรูปก่อน–หลังแก้ เห็นได้ในบ้านของฉัน'], ['ส่งช้า บริษัทรับผิดชอบ', 'ถ้าบริษัทส่งมอบช้ากว่าสัญญา บริษัทจ่ายค่าปรับวันละ 1,000 บาท'], ['จ่ายตามงานจริง', 'งานเสร็จแต่ละขั้นจึงเบิกเงินงวด งานเพิ่มหรือเปลี่ยนต้องตกลงเป็นเอกสารก่อนทำ'], ['สมุดบ้านดิจิทัล', 'เก็บรูปงานในผนัง สเปควัสดุ แบบ สัญญา และประวัติซ่อม ติดตัวบ้านตลอดอายุ'], ['นัดตรวจบ้าน 6 และ 12 เดือน', 'ทีมนัดตรวจบ้านหลังส่งมอบ เพื่อดูแลก่อนปัญหาเล็กกลายเป็นใหญ่'], ['แจ้งซ่อมง่าย', 'ถ่ายรูปและบอกอาการผ่านบ้านของฉันหรือ LINE แล้วติดตามสถานะได้']].map(([a, b]) => `<div class="rv" style="border-top:1px solid var(--line-2);padding-top:20px"><h3 class="h-s">${a}</h3><p class="muted" style="margin-top:8px;font-size:15px">${b}</p></div>`).join('')}</div>
<div class="row" style="margin-top:44px"><a class="btn" href="#aftercare">บริการหลังส่งมอบ</a><a class="btn line" href="#process">ขั้นตอนสร้างบ้าน</a></div></div></section>` });

  R.knowledge = () => ({ t: 'บทความและความรู้', nav: 3, html: `${ph({ crumb: '<a href="#home">หน้าแรก</a> / รู้จัก PPSD', eyebrow: 'JOURNAL', title: 'บทความและความรู้<em>ก่อนสร้างบ้าน</em>' })}
<section class="sec-s"><div class="w"><div class="g2">${P.KNOW.map(([a, b, h, l], i) => `<article class="rv" style="border-top:1px solid var(--line-2);padding:24px 0"><span class="num gold">0${i + 1}</span><h2 class="h-m" style="margin:6px 0 10px">${a}</h2><p class="muted">${b}</p><a class="link-u" href="#${h}">${l}</a></article>`).join('')}</div></div></section>
<section class="sec bg-2" id="faq"><div class="w-n"><span class="eyebrow">FAQ</span><h2 class="h-l">คำถามที่พบบ่อย</h2><div class="f search" style="margin:24px 0 10px"><label for="fq">ค้นหาคำถาม (พิมพ์ภาษาพูดได้ เช่น ไม่มีที่ดินสร้างได้มั้ย)</label>${I.search}<input id="fq" type="search" autocomplete="off"></div><div id="fqL"></div></div></section>`,
    init() { const draw = () => { const q = $('#fq').value.trim(); const r = P.FAQ.filter(f => !q || (f[0] + f[1] + f[2]).includes(q)); $('#fqL').innerHTML = r.map(f => `<details class="qa"><summary>${f[1]}</summary><div class="qa-in"><p>${f[2]}</p><a class="link-u" href="#${f[3]}">${f[4]}</a></div></details>`).join('') || '<p class="muted" style="padding:20px 0">ยังไม่พบคำตอบ ลอง<a href="#contact" style="border-bottom:1px solid var(--gold)">ติดต่อทีมงาน</a></p>'; }; $('#fq').oninput = draw; draw(); } });

  /* ---------- Help Center (แทนผู้ช่วยแชท: ค้นคำตอบเอง หรือคุยกับทีมทาง LINE OA) ---------- */
  R.help = () => {
    const cats = [...new Set(P.FAQ.map(f => f[0]))];
    const acts = [[P.CO.line, I.line, 'คุยกับทีมทาง LINE OA', 'ตอบในเวลาทำการ ส่งรูปแปลนหรือที่ดินได้เลย', 1], ['tel:' + P.CO.tel, I.phone, 'โทร ' + P.CO.phone, P.CO.hours], ['#appointment', I.chat, 'นัดปรึกษาสถาปนิก', 'ที่สาขาหรือหน้างาน'], ['#myhome', I.house, 'ติดตามงานก่อสร้าง', 'สำหรับเจ้าของบ้าน · บ้านของฉัน'], ['#aftercare', I.shield, 'แจ้งซ่อม / บริการหลังส่งมอบ', 'บ้านที่ส่งมอบแล้ว'], ['#documents', I.doc, 'เอกสารที่ต้องเตรียม', 'ก่อนเซ็นสัญญาและขออนุญาต']];
    return { t: 'Help Center', nav: 4, html: `${ph({ crumb: '<a href="#home">หน้าแรก</a> / ติดต่อเรา', eyebrow: 'HELP CENTER', title: 'ศูนย์<em>ช่วยเหลือ</em>', lead: 'ค้นคำตอบเรื่องราคา ขั้นตอน สินเชื่อ ฮวงจุ้ย และการรับประกัน ถ้ายังไม่เจอคำตอบ คุยกับทีมทาง LINE OA ได้เลย' })}
<section class="sec-s"><div class="w-n"><div class="f search" style="margin:0 0 14px"><label for="hq">ค้นหาคำถาม (พิมพ์ภาษาพูดได้ เช่น ไม่มีที่ดินสร้างได้มั้ย)</label>${I.search}<input id="hq" type="search" autocomplete="off"></div>
<div class="row" role="group" aria-label="หมวดคำถาม" style="gap:8px;margin-bottom:8px"><button type="button" class="chip on" data-hc="">ทั้งหมด</button>${cats.map(c => `<button type="button" class="chip" data-hc="${esc(c)}">${esc(c)}</button>`).join('')}</div>
<div id="hqL" aria-live="polite"></div></div></section>
<section class="sec-s bg-2"><div class="w"><span class="eyebrow">CONTACT &amp; SERVICES</span><h2 class="h-l" style="margin-bottom:28px">ช่องทาง<em>ช่วยเหลือ</em></h2><div class="g3 help-acts">${acts.map(([h, ic, a, b, ext]) => `<a class="panel help-act" href="${esc(h)}"${ext ? ' target="_blank" rel="noopener"' : ''}><span class="wi">${ic}</span><b>${esc(a)}</b><span class="muted">${esc(b)}</span></a>`).join('')}</div>
<p class="fine" style="margin-top:22px">PPSD ไม่มีแชทบนเว็บไซต์ · การพูดคุยกับทีมทั้งหมดอยู่ใน LINE OA บัญชีเดียวของบริษัท</p></div></section>`,
      init() {
        let cat = '';
        const draw = () => { const q = $('#hq').value.trim(); const r = P.FAQ.filter(f => (!cat || f[0] === cat) && (!q || (f[0] + f[1] + f[2]).includes(q))); $('#hqL').innerHTML = r.map(f => `<details class="qa"><summary>${f[1]}</summary><div class="qa-in"><p>${f[2]}</p>${f[3] ? `<a class="link-u" href="#${f[3]}">${f[4] || 'อ่านเพิ่ม'}</a>` : ''}</div></details>`).join('') || `<div class="empty"><p>ยังไม่พบคำตอบสำหรับ “${esc(q)}”</p><a class="btn" href="${P.CO.line}" target="_blank" rel="noopener">ถามทีมทาง LINE OA</a></div>`; };
        $('#hq').oninput = draw;
        $$('[data-hc]').forEach(b => b.onclick = () => { cat = b.dataset.hc; $$('[data-hc]').forEach(x => x.classList.toggle('on', x === b)); draw(); });
        draw();
      } };
  };

  /* ---------- ติดต่อ / นัดหมาย / ใบเสนอราคา ---------- */
  const mapFrame = b => `<div class="map-box" data-q="${encodeURIComponent(b.q)}" data-z="${b.verified ? 15 : 13}" data-t="${esc(b.th)}"><div class="map-fb">${I.pin}<b style="font-weight:500;color:var(--navy)">${esc(b.th)}</b><span>${esc(b.addr)}</span><div class="row" style="justify-content:center"><button type="button" class="btn sm" data-showmap>แสดงแผนที่</button><a class="btn line sm" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.q)}" target="_blank" rel="noopener">เปิดใน Google Maps</a></div><span class="fine">แผนที่ Google โหลดเมื่อกด “แสดงแผนที่” เท่านั้น</span></div></div>`;
  document.addEventListener('click', e => { const bt = e.target.closest('[data-showmap]'); if (!bt) return; const box = bt.closest('.map-box'); box.insertAdjacentHTML('beforeend', `<iframe loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="แผนที่ ${box.dataset.t}" src="https://maps.google.com/maps?q=${box.dataset.q}&z=${box.dataset.z}&output=embed"></iframe>`); bt.textContent = 'กำลังโหลดแผนที่…'; });
  const contactTabs = cur => subnav([['contact', 'สาขาและแผนที่'], ['appointment', 'นัดหมาย'], ['quote', 'ขอใบเสนอราคา'], ['channels', 'ช่องทางติดต่อ']], cur);
  R.contact = () => ({ t: 'ติดต่อเรา', nav: 4, html: `${ph({ img: 'r/pool-sunset', crumb: '<a href="#home">หน้าแรก</a>', eyebrow: 'CONTACT', title: 'ติดต่อ <em class="en">PPSD</em>', lead: 'นัดคุยเรื่องบ้าน ดูผลงานจริง หรือเลือกช่องทางที่สะดวก', cap: 'ภาพจำลองแนวคิด' })}${contactTabs('contact')}
<section class="sec" id="maps"><div class="w"><div class="g2">${P.CO.branches.map(b => `<article class="rv">${mapFrame(b)}<span class="eyebrow" style="margin-top:22px">${b.en.toUpperCase()}</span><h2 class="h-m">${b.th}</h2><p class="muted" style="margin:6px 0">${esc(b.addr)}</p><p class="fine">${b.note}${b.verified ? '' : ' · <span class="badge warn">รอยืนยัน</span>'}</p><div class="row"><a class="link-u" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.q)}" target="_blank" rel="noopener">นำทาง</a><a class="link-u" href="#appointment">นัดหมายที่สาขานี้</a></div></article>`).join('')}</div><p class="fine" style="margin-top:20px">ถ้าแผนที่ไม่แสดง (เช่น เปิดในหน้าตัวอย่าง) กด “เปิดใน Google Maps” · แผนที่สาขากรุงเทพฯ แสดงตามชื่ออาคาร รอยืนยันตำแหน่งชั้นและห้อง</p></div></section>
<section class="sec bg-2" id="channels"><div class="w"><div class="split at"><div><span class="eyebrow">CHANNELS</span><h2 class="h-l">ช่องทางติดต่อ</h2><p class="muted" style="margin-top:12px">${P.CO.hours}</p></div>
<div>${[['โทรศัพท์', `<a href="tel:${P.CO.tel}">${P.CO.phone}</a>`], ['LINE Official Account', `<a href="${P.CO.line}" target="_blank" rel="noopener">LINE ศูนย์สร้างบ้าน PPSD</a>`], ['อีเมล', `<a href="mailto:${P.CO.email}">${P.CO.email}</a>`], ['Facebook', `<a href="${P.CO.facebook}" target="_blank" rel="noopener">facebook.com/ppsd195</a>`], ['Instagram', `<a href="${P.CO.instagram}" target="_blank" rel="noopener">@ppsd.home</a>`], ['YouTube', `<a href="${P.CO.youtube}" target="_blank" rel="noopener">ช่อง PPSD</a>`]].map(([k, v]) => `<div class="row" style="justify-content:space-between;padding:16px 0;border-bottom:1px solid var(--line)"><span class="muted">${k}</span><span style="color:var(--navy)">${v}</span></div>`).join('')}
<div class="row" style="margin-top:24px"><a class="btn" href="#appointment">นัดหมาย</a><a class="btn line" href="#quote">ขอใบเสนอราคา</a></div></div></div></div></section>` });

  R.appointment = () => { const min = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    return { t: 'นัดหมาย', nav: 4, html: `${ph({ crumb: '<a href="#home">หน้าแรก</a> / ติดต่อเรา', eyebrow: 'APPOINTMENT', title: 'นัดปรึกษา<em>สถาปนิก</em>', lead: 'ฟรี ไม่มีข้อผูกมัด · คุยที่สาขา ที่หน้างาน หรือออนไลน์' })}${contactTabs('appointment')}
<section class="sec-s"><div class="w"><div class="calc"><form class="panel form" id="apF" novalidate data-noop data-name="apN" data-phone="apT"><div class="two">${field('apB', 'สถานที่', `<select id="apB">${['สำนักงานใหญ่ ราชบุรี', 'สาขากรุงเทพฯ (CDC รามอินทรา)', 'ออนไลน์ (วิดีโอคอล)', 'ที่ดิน/หน้างานของฉัน'].map(s => opt(s, s)).join('')}</select>`)}${field('apW', 'หัวข้อ', `<select id="apW">${['คุยแบบบ้าน', 'ออกแบบตามใจ', 'ฮวงจุ้ย', 'สำรวจที่ดิน', 'ปรึกษาสินเชื่อ', 'ดูบ้านจริง/หน้างาน'].map(s => opt(s, s)).join('')}</select>`)}</div>
<div class="two">${field('apD', 'วันที่', `<input id="apD" type="date" min="${min}" required>`)}${field('apH', 'เวลา', `<select id="apH">${['9:00', '11:00', '13:00', '15:00', '17:00'].map(s => opt(s, s + ' น.')).join('')}</select>`)}</div>${nameTel('apN', 'apT')}${field('apM', 'สิ่งที่อยากคุย (ไม่บังคับ)', '<textarea id="apM" rows="3"></textarea>')}${consent('apOk')}<button class="btn" type="submit">ยืนยันนัดหมาย</button></form>
<aside class="res"><div class="sum"><span class="eyebrow" style="color:var(--gold-2)">OPENING HOURS</span><p class="msg">${P.CO.hours}</p><p class="msg" style="margin:0">โทร <b>${P.CO.phone}</b></p></div><div class="ratio r-43">${rimg('cream-carport', 'บ้านโมเดิร์นโทนครีม', true)}<span class="tag-c">ภาพจำลองแนวคิด</span></div></aside></div></div></section>`,
      init() { $('#apF').onsubmit = e => { e.preventDefault(); const res = submitLead(e.target, 'appointment', 'นัดหมาย', v => `${v.apW} · ${v.apB} · ${v.apD} ${v.apH}`); if (!res) return; const v = res.v; db.add('appts', { id: res.ref, at: new Date(v.apD + 'T' + v.apH.padStart(5, '0')).getTime(), topic: v.apW, branch: v.apB, name: v.apN, phone: v.apT, status: 'รอยืนยัน', from: 'web' }); showDone(e.target, doneBox(res.ref, 'รับนัดหมายแล้ว', `${esc(v.apW)} · ${esc(v.apB)} · ${P.thDate(v.apD)} เวลา ${v.apH} น. — ทีมจะโทรยืนยันนัดก่อนวันนัด`)); }; } };
  };

  R.quote = id => { const d = byId(id);
    return { t: 'ขอใบเสนอราคา', nav: 4, html: `${ph({ crumb: '<a href="#home">หน้าแรก</a> / ติดต่อเรา', eyebrow: 'QUOTATION', title: 'ขอ<em>ใบเสนอราคา</em>', lead: 'บอกแบบและสเปคที่สนใจ ทีมจะจัดทำใบเสนอราคาหลังสำรวจที่ดิน' })}${contactTabs('quote')}
<section class="sec-s"><div class="w"><div class="calc"><form class="panel form" id="qF" novalidate data-noop data-name="qN" data-phone="qT">
${field('qD', 'แบบบ้าน', `<select id="qD">${opt('', 'ยังไม่เลือก / ออกแบบตามใจ')}${designs().map(x => opt(x.id, x.code + ' · ' + x.name, d && d.id === x.id)).join('')}</select>`)}
<div class="two">${field('qA', 'พื้นที่ใช้สอยโดยประมาณ (ตร.ม.)', `<input id="qA" type="number" min="30" step="5" value="${d ? d.area : ''}" required>`)}${field('qP', 'แพ็กเกจ', `<select id="qP">${P.PKG.map(p => opt(p.name, p.name)).join('')}${opt('ยังไม่แน่ใจ', 'ยังไม่แน่ใจ')}</select>`)}</div>
<div class="two">${field('qR', 'จังหวัด', `<select id="qR">${P.REGIONS.map(([r]) => opt(r, r)).join('')}</select>`)}${field('qL', 'ที่ดิน', `<select id="qL">${['มีแล้ว', 'กำลังหา'].map(s => opt(s, s)).join('')}</select>`)}</div>
${field('qW', 'อยากเข้าอยู่เมื่อไหร่', `<select id="qW">${['ภายใน 1 ปี', '1–2 ปี', 'มากกว่า 2 ปี'].map(s => opt(s, s)).join('')}</select>`)}${nameTel('qN', 'qT')}${field('qE', 'อีเมล (ไม่บังคับ)', '<input id="qE" type="email">')}${consent('qOk')}<button class="btn" type="submit">ส่งคำขอใบเสนอราคา</button></form><aside class="res" id="qPrev"></aside></div></div></section>`,
      init() { const prev = () => { const x = byId($('#qD').value); if (x && !$('#qA').dataset.touched) $('#qA').value = x.area; $('#qPrev').innerHTML = x ? `<div class="hc"><div class="ratio"><img src="${cover(x).src}" alt="${esc(x.name)}"><span class="tag-c">${cover(x).label}</span></div><div class="hc-b"><span class="hc-code">${x.code}</span><h3>${esc(x.name)}</h3><div class="hc-price">ราคาประมาณ ${mil(x.price)} ล้านบาท</div></div></div>` : `<div class="sum"><p class="msg">ยังไม่ได้เลือกแบบ ทีมจะช่วยแนะนำแบบที่เหมาะกับงบและที่ดิน</p><a class="btn gold sm" href="#designs">ดูแบบบ้าน</a></div>`; };
        $('#qA').addEventListener('input', () => $('#qA').dataset.touched = '1'); $('#qD').onchange = prev; prev();
        $('#qF').onsubmit = e => { e.preventDefault(); const res = submitLead(e.target, 'quote', 'ขอใบเสนอราคา', v => `${(byId(v.qD) || { code: 'ไม่ระบุแบบ' }).code} · ${v.qA} ตร.ม. · ${v.qP} · ${v.qR} · ที่ดิน${v.qL} · ${v.qW}`); if (res) showDone(e.target, doneBox(res.ref, 'ได้รับคำขอใบเสนอราคาแล้ว', 'ทีมขายจะติดต่อกลับภายใน 1 วันทำการ เพื่อนัดสำรวจที่ดินและจัดทำใบเสนอราคา')); }; } };
  };

  /* ---------- หน้าเดิมที่คงไว้ ---------- */
  R.land = () => ({ t: 'เช็กที่ดินเบื้องต้น', nav: 0, html: `${ph({ crumb: '<a href="#home">หน้าแรก</a> / บ้านของเรา', eyebrow: 'LAND CHECK', title: 'ที่ดินของคุณ <em>สร้างแบบไหนได้</em>', lead: 'กรอกขนาดที่ดินเพื่อดูแบบบ้านที่น่าจะลงได้' })}
<section class="sec-s"><div class="w"><div class="calc"><form class="panel form" id="laF" novalidate data-noop data-name="laN" data-phone="laT"><div class="two">${field('laP', 'จังหวัด', `<select id="laP">${P.REGIONS.map(([r]) => opt(r, r)).join('')}</select>`)}${field('laA', 'ขนาดที่ดิน (ตร.ว.)', '<input id="laA" type="number" min="1" value="80" required>')}</div><div class="two">${field('laD', 'ทิศหน้าที่ดิน', `<select id="laD">${['เหนือ', 'ใต้', 'ตะวันออก', 'ตะวันตก', 'ยังไม่ทราบ'].map(s => opt(s, s)).join('')}</select>`)}${field('laF2', 'ถมแล้วหรือยัง', `<select id="laF2">${['ถมแล้ว', 'ยังไม่ถม', 'ไม่แน่ใจ'].map(s => opt(s, s)).join('')}</select>`)}</div>${nameTel('laN', 'laT')}${consent('laOk')}<button class="btn" type="submit">นัดสำรวจที่ดินฟรี</button></form>
<section><h2 class="h-m" id="laC" aria-live="polite"></h2><div class="g2" id="laL" style="margin-top:20px"></div><p class="fine" style="margin-top:16px">เป็นการดูเบื้องต้น ต้องให้ทีมสำรวจยืนยัน รวมถึงระยะร่น ทางเข้า และตำแหน่งตามฮวงจุ้ย</p></section></div></div></section>`,
    init() { const draw = () => { const a = Number($('#laA').value) || 0, r = designs().filter(d => d.land <= a); $('#laC').textContent = 'แบบที่น่าจะลงได้ ' + r.length + ' แบบ'; $('#laL').innerHTML = r.slice(0, 4).map(card).join(''); P.reveal($('#laL')); }; $('#laA').oninput = draw; draw(); $('#laF').onsubmit = e => { e.preventDefault(); const res = submitLead(e.target, 'land', 'เช็กที่ดิน', v => `${v.laA} ตร.ว. · ${v.laP} · หน้า${v.laD} · ${v.laF2}`); if (res) showDone(e.target, doneBox(res.ref, 'รับคำขอสำรวจที่ดินแล้ว', 'ทีมจะโทรนัดวันสำรวจที่ดินฟรี')); }; } });

  R.documents = () => ({ t: 'เอกสารที่ต้องเตรียม', nav: 2, html: `${ph({ crumb: '<a href="#home">หน้าแรก</a> / <a href="#process">ขั้นตอนสร้างบ้าน</a>', eyebrow: 'CHECKLIST', title: 'เอกสาร<em>ที่ต้องเตรียม</em>', lead: 'ติ๊กรายการที่เตรียมแล้ว ระบบจะจำไว้ในเครื่องของคุณ' })}
<section class="sec-s"><div class="w"><div class="g3">${P.DOCS.map(([g, it], i) => `<div class="panel"><h3 class="h-s" style="margin-bottom:10px">${g}</h3>${it.map((x, j) => `<label class="chk" style="padding:7px 0"><input type="checkbox" data-doc="${i}-${j}"><span>${x}</span></label>`).join('')}</div>`).join('')}</div><p class="fine" style="margin-top:20px">รายการนี้เป็นร่าง ต้องให้ฝ่ายขายและสินเชื่อยืนยันก่อนใช้จริง</p></div></section>`,
    init() { const s = store.get('ppsdDocs', {}); $$('[data-doc]').forEach(c => { c.checked = !!s[c.dataset.doc]; c.onchange = () => { s[c.dataset.doc] = c.checked; store.set('ppsdDocs', s); }; }); } });

  R.areas = () => ({ t: 'พื้นที่ให้บริการ', nav: 3, html: `${ph({ crumb: '<a href="#home">หน้าแรก</a> / รู้จัก PPSD', eyebrow: 'SERVICE AREAS', title: 'พื้นที่<em>ให้บริการ</em>' })}<section class="sec-s"><div class="w"><div class="g3">${P.AREAS.map(([a, b]) => `<div class="panel"><h3 class="h-m">${a}</h3><p class="muted">${b}</p><a class="link-u" href="#budget-calc">ประเมินงบในพื้นที่นี้</a></div>`).join('')}</div><p class="fine" style="margin-top:20px">ราคาต่อ ตร.ม. และผลงานแยกจังหวัดรอทีมเตรียมข้อมูล</p></div></section>` });

  R.services = () => ({ t: 'ต่อเติม บิ้วอิน รีโนเวท', nav: 2, html: `${ph({ crumb: '<a href="#home">หน้าแรก</a> / บริการของเรา', eyebrow: 'RENOVATION', title: 'ต่อเติม บิ้วอิน <em>รีโนเวท</em>', lead: 'ส่งรูปบ้านและบอกสิ่งที่อยากปรับ ทีมจะติดต่อกลับเพื่อประเมิน' })}
<section class="sec-s"><div class="w"><div class="g3">${[['ต่อเติม', 'เพิ่มพื้นที่ใช้สอยให้เหมาะกับครอบครัว'], ['บิ้วอิน', 'ออกแบบเฟอร์นิเจอร์ให้พอดีกับพื้นที่'], ['รีโนเวท', 'ปรับบ้านเดิมให้โปร่งและใช้งานสะดวกขึ้น']].map(([a, b]) => `<div style="border-top:1px solid var(--line-2);padding-top:18px"><h3 class="h-m">${a}</h3><p class="muted">${b}</p></div>`).join('')}</div>
<form class="panel form" id="svF" novalidate data-noop data-name="svN" data-phone="svT" style="max-width:640px;margin-top:40px">${field('svD', 'งานที่ต้องการ', '<textarea id="svD" rows="3" required></textarea>')}${uploadBox('svUp', 'แนบรูปบ้าน (ไม่บังคับ)', '')}${nameTel('svN', 'svT')}${consent('svOk')}<button class="btn" type="submit">ขอประเมินงาน</button></form></div></section>`,
    init() { const f = uploader($('#svUp'), { max: 3 }); $('#svF').onsubmit = e => { e.preventDefault(); const res = submitLead(e.target, 'service', 'ต่อเติม บิ้วอิน รีโนเวท', v => v.svD + ' · ไฟล์ ' + f.length); if (res) showDone(e.target, doneBox(res.ref, 'รับคำขอประเมินงานแล้ว', 'ทีมจะติดต่อกลับเพื่อนัดดูหน้างาน')); }; } });

  R.why = () => ({ t: 'ทำไมต้อง PPSD', nav: 3, html: `${ph({ img: 'h2-e', cap: 'ภาพถ่ายผลงานจริง', crumb: '<a href="#home">หน้าแรก</a> / รู้จัก PPSD', eyebrow: 'WHY PPSD', title: 'ทำไมต้องสร้างบ้าน<em>กับ PPSD</em>' })}
<section class="sec"><div class="w" style="display:grid;gap:clamp(48px,6vw,88px)">${[['ออกแบบอิงฮวงจุ้ย', 'วางผังให้เหมาะกับทิศ แสง ลม และบริบทของที่ดิน ดูตำแหน่งเจ้าบ้าน เตาไฟ และประตู', 'h1-3d', 'fengshui'], ['บ้านโปร่ง โล่ง สบาย', 'ลดความร้อนสะสมด้วยการวางทิศและช่องระบายอากาศรอบหลังคา', 'h2-c', 'materials'], ['เห็นบ้านก่อนสร้างจริง', 'ภาพ 3D จำลองสัดส่วน แสง ทิศทางลม และวัสดุ เพื่อให้ตัดสินใจแม่นยำตั้งแต่ต้นทาง', 'h2-3d', 'designs'], ['จ่ายตามงานจริง ตรวจสอบได้', 'งานเสร็จแต่ละขั้นจึงเบิกเงิน เห็นรูปหน้างานและผลตรวจทุกครั้ง ส่งช้าบริษัทจ่ายวันละ 1,000 บาท', 'h3-e', 'process'], ['สมุดบ้านดิจิทัล', 'เก็บรูปงานในผนัง สเปควัสดุ แบบ สัญญา และประวัติซ่อม ติดตัวบ้านตลอดอายุ', 'h5-3d', 'aftercare']].map(([a, b, im, h], i) => `<article class="split rv"${i % 2 ? ' style="direction:rtl"' : ''}><div class="ratio r-32" style="direction:ltr;background:#F3EFE8">${img(im, a)}</div><div style="direction:ltr"><span class="num gold" style="font-size:22px">0${i + 1}</span><h2 class="h-l" style="margin:6px 0 14px">${a}</h2><p class="lead">${b}</p><a class="link-u" href="#${h}">ดูเพิ่มเติม</a></div></article>`).join('')}<div class="center"><a class="btn" href="#budget-calc">ประเมินงบประมาณบ้านฟรี</a></div></div></section>` });

  R.offer = () => { const d = byId(featuredIds()[0]) || designs()[0];
    return { t: 'ข้อเสนอเฉพาะคุณ', nav: '', html: `${ph({ crumb: 'ตัวอย่างลิงก์ที่เซลส์ส่งให้ลูกค้า', eyebrow: 'PERSONAL PROPOSAL', title: 'บ้านของครอบครัวคุณสมมติ', lead: '“สร้างให้พ่อแม่อยู่สบาย”' })}
<section class="sec-s"><div class="w"><div class="calc"><div><div class="gal-main"><img src="${cover(d, false).src}" alt="${esc(d.name)}"><span class="tag-c">${cover(d).label}</span></div><div class="specs" style="margin-top:20px"><div><div class="k">แบบที่เลือก</div><div class="v" style="font-size:18px">${d.code}</div></div><div><div class="k">พื้นที่ใช้สอย</div><div class="v">${d.area} <small>ตร.ม.</small></div></div><div><div class="k">แพ็กเกจ</div><div class="v">Premium</div></div></div></div>
<div><form class="panel" id="ofF" data-noop><h3 class="h-s">อัปเกรดที่แนะนำ</h3>${[['จุดไฟเพิ่ม 4 จุด', 6800], ['จุดแอร์เพิ่ม 2 จุด', 5400], ['ปั๊มน้ำ', 27000], ['ชุดพิธี', 35000]].map((u, i) => `<label class="chk row-b"><span><input data-up="${u[1]}" type="checkbox"> ${u[0]}</span><span class="v">${fmt(u[1])}</span></label>`).join('')}</form><div class="sum" style="margin-top:16px"><p class="msg">ราคารวม <b id="oTot"></b></p><div class="nums"><div><div class="k">ผ่อนต่อเดือนโดยประมาณ</div><div class="v" id="oPay"></div></div><div><div class="k">ราคานี้ใช้ได้ถึง</div><div class="v">${P.monthLabel(1)}</div></div></div></div><a class="btn block" href="#appointment" style="margin-top:16px">นัดสำรวจที่ดินฟรี</a><p class="fine">ลิงก์จริงใส่สเปคและราคาล่วงหน้าได้ แต่จะไม่ฝังรายได้ของลูกค้า</p></div></div></div></section>`,
      init() { const draw = () => { let tt = d.price; $$('[data-up]').forEach(c => { if (c.checked) tt += Number(c.dataset.up); }); $('#oTot').textContent = fmt(tt) + ' บาท'; $('#oPay').innerHTML = fmt(up100(monthly(tt * 0.9, 6, 30))) + '<small>บาท</small>'; }; $('#ofF').onchange = draw; draw(); } };
  };

  R.privacy = () => ({ t: 'นโยบายความเป็นส่วนตัว', nav: '', html: `${ph({ crumb: '<a href="#home">หน้าแรก</a>', eyebrow: 'PRIVACY', title: 'นโยบายความเป็นส่วนตัว', lead: 'ร่างนี้ต้องให้ผู้บริหารและฝ่ายกฎหมายตรวจก่อนใช้จริง' })}
<section class="sec-s"><div class="w-n">${[['ข้อมูลที่เก็บ', 'ชื่อ เบอร์โทร อีเมล ไฟล์ที่แนบ และข้อมูลบ้านที่คุณกรอกในฟอร์ม เครื่องคำนวณรายได้และการเงินทำงานบนเครื่องของคุณ และไม่ส่งข้อมูลเข้าระบบหากคุณไม่กดส่ง'], ['ใช้ทำอะไร', 'ติดต่อกลับ ประเมินราคา นัดหมาย ส่งรายงานความคืบหน้าผ่าน LINE OA สำหรับลูกค้าที่ยินยอม และให้บริการหลังการขาย'], ['สิทธิ์ของคุณ', 'ขอดู แก้ไข ลบข้อมูล หรือเลิกรับข่าวสารได้ โดยติดต่อ ' + P.CO.phone], ['ระยะเวลาการเก็บ', 'รอผู้บริหารกำหนด'], ['คุกกี้และข้อมูลในเบราว์เซอร์', 'คุกกี้ที่จำเป็นใช้จำการตั้งค่าคุกกี้ แบบบ้านที่บันทึก และรายการเอกสารที่คุณติ๊กไว้ คุกกี้วิเคราะห์และการตลาดจะเปิดใช้เมื่อคุณยินยอมเท่านั้น วิดีโอ YouTube และแผนที่ Google โหลดเมื่อคุณเปิดใช้ ผู้ให้บริการอาจเห็นหมายเลขเครือข่ายของคุณ']].map(([a, b]) => `<h2 class="h-s" style="margin-top:28px">${a}</h2><p class="muted" style="margin-top:6px">${b}</p>`).join('')}<button type="button" class="btn line" data-cookie style="margin-top:20px">ตั้งค่าคุกกี้</button></div></section>` });

  /* บริการหลังส่งมอบ (หน้าสาธารณะ) */
  R.aftercare = () => ({ t: 'บริการหลังส่งมอบ', nav: 2, html: `${ph({ crumb: '<a href="#home">หน้าแรก</a> / บริการของเรา', eyebrow: 'AFTERCARE', title: 'บริการ<em>หลังส่งมอบ</em>', lead: 'แจ้งซ่อม ดูการรับประกัน และสมุดบ้านดิจิทัล ตลอดอายุบ้าน' })}
<section class="sec-s"><div class="w"><div class="calc"><div><h2 class="h-m">ในสมุดบ้านมีอะไร</h2><div class="g2" style="margin-top:20px">${[['รูปงานที่ปิดไปแล้ว', 'ท่อน้ำและสายไฟในผนัง พื้น และฝ้า'], ['สเปคบ้านของฉัน', 'ยี่ห้อ รุ่น สี และขนาดวัสดุทุกจุด'], ['แบบ สัญญา ใบอนุญาต', 'ใช้ต่อเติม ขอเลขที่บ้าน หรือขายบ้าน'], ['งวดเงินและใบเสร็จ', 'ใช้กับธนาคารและภาษี'], ['ผลตรวจงานทุกครั้ง', 'รวมจุดที่พบแล้วแก้ไข'], ['ประวัติแจ้งซ่อม', 'ดูว่าเคยซ่อมอะไร เมื่อไหร่']].map(([a, b]) => `<div style="border-top:1px solid var(--line-2);padding-top:14px"><b style="font-weight:500;color:var(--navy)">${a}</b><p class="muted" style="font-size:14.5px;margin:4px 0 0">${b}</p></div>`).join('')}</div>
<h2 class="h-m" style="margin-top:44px">การรับประกัน</h2><table class="tbl" style="margin-top:10px"><tbody>${P.WARRANTY.map(([a, b]) => `<tr><td>${a}</td><td class="n">${b}</td></tr>`).join('')}</tbody></table><p class="fine">นับจากวันส่งมอบ · นัดตรวจบ้าน 6 และ 12 เดือน · <a href="#myhome" style="border-bottom:1px solid var(--gold)">เจ้าของบ้าน PPSD เข้าสู่บ้านของฉัน</a></p></div>
<form class="panel form" id="afF" novalidate data-noop data-name="afN" data-phone="afT"><h2 class="h-m">แจ้งซ่อม</h2>${field('afI', 'อาการที่พบ', '<textarea id="afI" rows="4" required placeholder="เช่น น้ำซึมบริเวณฝ้าห้องน้ำชั้น 2"></textarea>')}${field('afC', 'รหัสโครงการ/บ้าน (ถ้ามี)', '<input id="afC" type="text" placeholder="เช่น PPSD-6410">')}${uploadBox('afUp', 'แนบรูป', 'ช่วยให้ทีมประเมินได้เร็วขึ้น', 'image/*')}${nameTel('afN', 'afT')}${consent('afOk')}<button class="btn" type="submit">ส่งเรื่องแจ้งซ่อม</button></form></div></div></section>`,
    init() { const f = uploader($('#afUp'), { max: 4 }); $('#afF').onsubmit = e => { e.preventDefault(); if (!validate(e.target)) return; const v = formData(e.target), r = ref('AS'); db.add('after', { id: r, project: '', code: v.afC, issue: v.afI, status: 'รับเรื่องแล้ว', name: v.afN, phone: v.afT, photos: f.length }); leadOut('aftercare', v.afN, v.afT, `แจ้งซ่อมหลังส่งมอบ · รหัสบ้าน/โครงการ: ${v.afC || '-'} · ${v.afI || ''}${f.length ? ` · แนบรูป ${f.length} รูป (รูปยังไม่ถูกส่งเข้าระบบ ขอลูกค้าทาง LINE)` : ''}`); showDone(e.target, doneBox(r, 'รับเรื่องแจ้งซ่อมแล้ว', 'ทีมบริการหลังการขายจะติดต่อกลับเพื่อนัดตรวจ ติดตามสถานะได้ในบ้านของฉัน')); }; } });
})(window.PPSD);
