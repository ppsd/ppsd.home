/* PPSD HOME BUILDER — เครื่องคำนวณ (งบก่อสร้าง สินเชื่อ ความสามารถผ่อน แผนการเงิน งบรวม) + ตัวแสดง 3D */
(function (P) {
  'use strict';
  const { $, $$, esc, fmt, mil, up100, store, db, ref, I, consent, field, ph, subnav, opt, validate, formData, toast, monthly } = P;
  const R = P.R;
  const calcTabs = cur => subnav([['budget-calc', 'งบก่อสร้าง'], ['budget', 'งบรวมทั้งโครงการ'], ['loan', 'คำนวณสินเชื่อ'], ['afford', 'กู้ได้เท่าไหร่ / ผ่อนไหวไหม'], ['plan', 'วางแผนเงินสด']], cur);
  const head = (title, lead, en) => ph({ img: 'r/cream-vanilla-sky', crumb: '<a href="#home">หน้าแรก</a> / บริการของเรา', eyebrow: en, title, lead, cap: 'ภาพจำลองแนวคิด' });
  const numIn = (id, label, val, step, min = 0, extra = '') => field(id, label, `<input id="${id}" type="number" inputmode="decimal" min="${min}" step="${step}" value="${val}" ${extra}>`);
  const n = id => Math.max(0, Number(($('#' + id) || {}).value) || 0);

  /* ---------- 1) งบก่อสร้าง ---------- */
  R['budget-calc'] = () => ({ t: 'คำนวณงบประมาณก่อสร้าง', nav: 2, html: `${head('คำนวณงบประมาณก่อสร้าง', 'ประมาณค่าก่อสร้างจากพื้นที่ใช้สอย แพ็กเกจ และรายการเพิ่มเติม พร้อมรายละเอียดแยกรายการ', 'BUDGET CALCULATOR')}${calcTabs('budget-calc')}
<section class="sec-s"><div class="w"><div class="calc"><form class="panel form" id="bcF" data-noop>
<div class="two">${numIn('bcA', 'พื้นที่ใช้สอย (ตร.ม.)', 180, 5, 30, 'required')}${field('bcP', 'แพ็กเกจ', `<select id="bcP">${P.PKG.map(p => opt(p.rate, `${p.name} · ${fmt(p.rate)} บาท/ตร.ม. (ตัวอย่าง)`)).join('')}</select>`)}</div>
<div class="two">${field('bcFl', 'จำนวนชั้น', `<select id="bcFl">${opt('1', 'ชั้นเดียว')}${opt('2', '2 ชั้น (+5%)', true)}${opt('3', '3 ชั้น (+5%)')}</select>`)}${field('bcR', 'จังหวัด', `<select id="bcR">${P.REGIONS.map(([r, k]) => opt(k + '|' + r, r + (k > 1 ? ` (+${Math.round((k - 1) * 100)}%)` : ''))).join('')}</select>`)}</div>
<fieldset style="border:0;padding:0;margin:0"><legend class="lbl" style="margin-bottom:6px">รายการเพิ่มเติม</legend>${P.UPGRADES.map(([nm, pr, u], i) => `<div class="chk row-b"><label for="bcU${i}">${nm} <span class="fine">(${fmt(pr)} บาท/${u})</span></label><div class="counter" style="height:38px"><button type="button" data-st="-1" data-f="bcU${i}" aria-label="ลด${nm}">−</button><input id="bcU${i}" type="number" min="0" max="40" value="0"><button type="button" data-st="1" data-f="bcU${i}" aria-label="เพิ่ม${nm}">+</button></div></div>`).join('')}
${P.EXTRAS.map(([nm, pr, w], i) => `<label class="chk row-b"><span><input type="checkbox" id="bcE${i}"> ${nm} <span class="fine">· ${w}</span></span><span class="v">${fmt(pr)}</span></label>`).join('')}</fieldset></form>
<section class="res" aria-live="polite"><div class="sum"><p class="msg">งบก่อสร้างโดยประมาณ</p><div class="v" id="bcRange"></div><div class="nums"><div><div class="k">ค่าก่อสร้างตัวบ้าน</div><div class="v" id="bcBase"></div></div><div><div class="k">รายการเพิ่มเติม</div><div class="v" id="bcAdd"></div></div><div><div class="k">รวมทั้งหมด (ค่ากลาง)</div><div class="v" id="bcTot"></div></div><div><div class="k">ผ่อนโดยประมาณ*</div><div class="v" id="bcPay"></div></div></div></div>
<div class="panel" style="padding:20px 22px"><h3 class="h-s">รายละเอียด</h3><div class="scroll-x"><table class="tbl"><tbody id="bcRows"></tbody><tfoot><tr><td>รวม</td><td class="n" id="bcFoot"></td></tr></tfoot></table></div></div>
<details class="qa" style="background:#fff;padding:0 20px;border:1px solid var(--line)"><summary>สมมติฐานและสิ่งที่ไม่รวม</summary><div class="qa-in"><ul class="bul" style="margin:0"><li>อัตราต่อ ตร.ม. เป็นตัวอย่างจากเว็บเดิม รอยืนยัน (Premium 18,000 · Elite 23,000)</li><li>บ้าน 2–3 ชั้นบวก 5% · ต่างจังหวัดบวก 5–10% ตามระยะทาง</li><li>ช่วงราคา ±7% จากค่ากลาง เพราะยังไม่ได้สำรวจที่ดิน</li><li>ไม่รวมค่าที่ดิน เฟอร์นิเจอร์ลอยตัว เครื่องใช้ไฟฟ้า และงานที่ไม่ได้เลือก</li><li>*ผ่อนคิดจากวงเงินกู้ 90% ดอกเบี้ย 6% 30 ปี</li></ul></div></details>
<a class="btn block" id="bcQ" href="#quote">ขอใบเสนอราคาจากตัวเลขนี้</a><p class="fine" style="margin:0">เป็นการประมาณเบื้องต้น ไม่ใช่ใบเสนอราคา</p></section></div></div></section>
<section class="sec bg-2" id="estimate"><div class="w"><div class="calc"><div><span class="eyebrow">FREE ESTIMATE</span><h2 class="h-l">รับผลประเมินกับทีมงาน</h2><p class="muted" style="margin-top:12px">ตอบไม่ถึง 1 นาที เห็นช่วงราคาและยอดผ่อนทันที แล้วให้ทีมช่วยเช็กกับที่ดินจริง</p><div class="sum" style="margin-top:24px"><p class="msg">ช่วงราคาโดยประมาณ <b id="eRange"></b></p><div class="nums"><div><div class="k">ผ่อนต่อเดือนโดยประมาณ</div><div class="v" id="ePay"></div></div><div><div class="k">ควรเริ่มคุยแบบ</div><div class="v" id="eWhen"></div></div></div></div></div>
<form class="panel form" id="eF" novalidate data-noop data-name="eN" data-phone="eT"><div class="two">${field('eS', 'สไตล์บ้าน', `<select id="eS">${['โมเดิร์น', 'มินิมอล', 'คลาสสิก', 'ไทยร่วมสมัย'].map(s => opt(s, s)).join('')}</select>`)}${field('eFl', 'จำนวนชั้น', `<select id="eFl">${opt('1', 'ชั้นเดียว')}${opt('2', '2 ชั้น')}${opt('3', '3 ชั้น')}</select>`)}</div><div class="two">${numIn('eA', 'พื้นที่ใช้สอย (ตร.ม.)', 200, 10, 40, 'required')}${field('eP', 'แพ็กเกจ', `<select id="eP">${P.PKG.map(p => opt(p.rate, p.name)).join('')}</select>`)}</div><div class="two">${field('eR', 'จังหวัด', `<select id="eR">${P.REGIONS.map(([r, k]) => opt(k, r)).join('')}</select>`)}${field('eL', 'มีที่ดินแล้วหรือยัง', `<select id="eL">${opt('มีแล้ว', 'มีแล้ว')}${opt('กำลังหา', 'กำลังหา')}</select>`)}</div>${field('eW', 'อยากเข้าอยู่เมื่อไหร่', `<select id="eW">${['ภายใน 1 ปี', '1–2 ปี', 'มากกว่า 2 ปี'].map(s => opt(s, s)).join('')}</select>`)}${P.nameTel('eN', 'eT')}${consent('eOk')}<button class="btn" type="submit">รับผลประเมินกับทีมงาน</button></form></div></div></section>`,
    init() {
      const draw = () => {
        const area = n('bcA'), rate = Number($('#bcP').value), fl = Number($('#bcFl').value), [rk, rn] = $('#bcR').value.split('|'), k = Number(rk);
        const base = area * rate, flAdj = fl > 1 ? base * 0.05 : 0, regAdj = (base + flAdj) * (k - 1), build = base + flAdj + regAdj;
        let rows = `<tr><td>ค่าก่อสร้าง ${fmt(area)} ตร.ม. × ${fmt(rate)} บาท</td><td class="n">${fmt(base)}</td></tr>`;
        if (flAdj) rows += `<tr><td>ปรับบ้าน ${fl} ชั้น (+5%)</td><td class="n">${fmt(flAdj)}</td></tr>`;
        if (regAdj) rows += `<tr><td>ปรับตามพื้นที่ ${esc(rn)} (+${Math.round((k - 1) * 100)}%)</td><td class="n">${fmt(regAdj)}</td></tr>`;
        let add = 0;
        P.UPGRADES.forEach(([nm, pr, u], i) => { const q = n('bcU' + i); if (q) { add += q * pr; rows += `<tr><td>${nm} ${q} ${u}</td><td class="n">${fmt(q * pr)}</td></tr>`; } });
        P.EXTRAS.forEach(([nm, pr, w], i) => { if ($('#bcE' + i).checked) { add += pr; rows += `<tr><td>${nm} <span class="fine">(${w})</span></td><td class="n">${fmt(pr)}</td></tr>`; } });
        const tot = build + add;
        $('#bcRange').innerHTML = area ? `${mil(build * 0.93)}–${mil(build * 1.07)}<small>ล้านบาท</small>` : '—';
        $('#bcBase').innerHTML = fmt(build) + '<small>บาท</small>'; $('#bcAdd').innerHTML = fmt(add) + '<small>บาท</small>'; $('#bcTot').innerHTML = fmt(tot) + '<small>บาท</small>';
        $('#bcPay').innerHTML = fmt(up100(monthly(tot * 0.9, 6, 30))) + '<small>บาท/เดือน</small>';
        $('#bcRows').innerHTML = rows; $('#bcFoot').textContent = fmt(tot) + ' บาท';
      };
      const f = $('#bcF'); f.addEventListener('input', draw); f.addEventListener('change', draw);
      f.addEventListener('click', e => { const b = e.target.closest('[data-st]'); if (b) { const i = $('#' + b.dataset.f); i.value = Math.min(40, Math.max(0, (Number(i.value) || 0) + Number(b.dataset.st))); draw(); } });
      draw();
      const ed = () => { const base = n('eA') * Number($('#eP').value) * Number($('#eR').value) * ($('#eFl').value !== '1' ? 1.05 : 1); $('#eRange').textContent = mil(base * 0.93) + '–' + mil(base * 1.07) + ' ล้านบาท'; $('#ePay').innerHTML = fmt(up100(monthly(base * 0.9, 6, 30))) + '<small>บาท</small>'; $('#eWhen').textContent = { 'ภายใน 1 ปี': 'ทันที', '1–2 ปี': 'ภายใน 6 เดือน', 'มากกว่า 2 ปี': 'ภายใน 1 ปี' }[$('#eW').value]; };
      const ef = $('#eF'); ef.addEventListener('input', ed); ef.addEventListener('change', ed); ed();
      ef.onsubmit = e => { e.preventDefault(); const res = P.submitLead(e.target, 'estimate', 'ประเมินราคาฟรี', v => `${v.eS} · ${v.eFl} ชั้น · ${v.eA} ตร.ม. · ${$('#eP').selectedOptions[0].text} · ${$('#eR').selectedOptions[0].text} · ที่ดิน${v.eL} · ${v.eW} · ${$('#eRange').textContent}`); if (res) P.showDone(e.target, P.doneBox(res.ref, 'ส่งผลประเมินให้ทีมแล้ว', 'ทีมจะโทรกลับเพื่อเช็กตัวเลขกับที่ดินและแบบที่สนใจ')); };
    } });

  /* ---------- 2) งบรวมทั้งโครงการ (ต้นแบบเดิม) ---------- */
  R.budget = () => ({ t: 'งบรวมทั้งโครงการ', nav: 2, html: `${head('งบรวมทั้งโครงการ', 'รวมค่าก่อสร้างกับค่าใช้จ่ายที่มักนึกไม่ถึง เพื่อไม่ให้งบบานปลาย', 'TOTAL PROJECT BUDGET')}${calcTabs('budget')}
<section class="sec-s"><div class="w"><div class="calc"><form class="panel form" id="bF" data-noop>${field('bD', 'แบบบ้าน', `<select id="bD">${P.designs().map(d => opt(d.id, `${d.code} · ${d.name} · ${fmt(d.price)} บาท`, d.id === 19)).join('')}</select>`)}${numIn('bLand', 'ค่าที่ดิน ถ้ายังไม่มี (บาท)', 0, 50000)}<fieldset style="border:0;padding:0;margin:0"><legend class="lbl">รายการเพิ่มเติม (ราคาตัวอย่าง)</legend>${P.EXTRAS.map((e, i) => `<label class="chk row-b"><span><input type="checkbox" id="be${i}" checked> ${e[0]}</span><span class="v">${fmt(e[1])}</span></label>`).join('')}</fieldset></form>
<section class="res" aria-live="polite"><div class="sum"><p class="msg">งบรวมโดยประมาณ</p><div class="v" id="bTot"></div></div><div class="panel" style="padding:20px 22px"><div class="scroll-x"><table class="tbl"><thead><tr><th>รายการ</th><th>ใครจ่าย</th><th class="n">บาท</th></tr></thead><tbody id="bRows"></tbody></table></div></div><a class="btn block" href="#plan">วางแผนเงินสดจากงบนี้</a><p class="fine">ตัวเลขประมาณจนกว่าจะสำรวจที่ดิน</p></section></div></div></section>`,
    init() { const draw = () => { const d = P.byId($('#bD').value); let tot = d.price + n('bLand'); let rows = `<tr><td>ค่าก่อสร้าง ${esc(d.code)}</td><td>รวมในราคาบริษัท</td><td class="n">${fmt(d.price)}</td></tr>`; if (n('bLand')) rows += `<tr><td>ค่าที่ดิน</td><td>ลูกค้าจ่ายเอง</td><td class="n">${fmt(n('bLand'))}</td></tr>`; P.EXTRAS.forEach((e, i) => { if ($('#be' + i).checked) { tot += e[1]; rows += `<tr><td>${e[0]}</td><td>${e[2]}</td><td class="n">${fmt(e[1])}</td></tr>`; } }); $('#bRows').innerHTML = rows; $('#bTot').innerHTML = fmt(tot) + '<small>บาท</small>'; }; $('#bF').addEventListener('input', draw); $('#bF').addEventListener('change', draw); draw(); } });

  /* ---------- 3) คำนวณสินเชื่อ ---------- */
  R.loan = () => { const prm = store.get('ppsdLoan', { lp: 3000000, ld: 10, lr: 6, ly: 30 });
    return { t: 'คำนวณสินเชื่อบ้าน', nav: 2, html: `${head('คำนวณสินเชื่อบ้าน', 'ยอดผ่อนต่อเดือน ดอกเบี้ยรวม และยอดชำระทั้งหมด', 'HOME LOAN CALCULATOR')}${calcTabs('loan')}
<section class="sec-s"><div class="w"><div class="calc"><form class="panel form" id="lnF" data-noop>
${numIn('lp', 'ราคาบ้าน + ค่าก่อสร้าง (บาท)', prm.lp, 50000, 100000, 'required')}
<div class="two">${field('ld', 'เงินดาวน์ (%)', `<input id="ld" type="range" min="0" max="50" step="1" value="${prm.ld}" style="accent-color:var(--navy)"><span class="h" id="ldTx"></span>`)}${numIn('lda', 'หรือใส่เป็นบาท', 0, 10000)}</div>
<div class="two">${numIn('lr', 'อัตราดอกเบี้ยต่อปี (%)', prm.lr, 0.05, 0)}${numIn('ly', 'ระยะเวลาผ่อน (ปี)', prm.ly, 1, 1, 'max="40"')}</div>
<div class="note"><span>สมมติดอกเบี้ยคงที่ตลอดสัญญา คิดแบบลดต้นลดดอก ผ่อนเท่ากันทุกเดือน (สูตรมาตรฐาน PMT) · ธนาคารจริงมักมีดอกเบี้ยช่วงแรกต่างจากช่วงหลัง</span></div></form>
<section class="res" aria-live="polite"><div class="sum"><div class="k">ยอดผ่อนต่อเดือนโดยประมาณ</div><div class="v" id="lnPay" style="font-size:clamp(36px,4vw,52px)"></div><div class="nums"><div><div class="k">วงเงินกู้</div><div class="v" id="lnAmt"></div></div><div><div class="k">เงินดาวน์</div><div class="v" id="lnDown"></div></div><div><div class="k">ดอกเบี้ยรวม</div><div class="v" id="lnInt"></div></div><div><div class="k">ยอดชำระทั้งหมด</div><div class="v" id="lnTot"></div></div></div></div>
<div class="panel" style="padding:20px 22px"><h3 class="h-s">ยอดคงเหลือรายปี (5 ปีแรก)</h3><div class="scroll-x"><table class="tbl"><thead><tr><th>สิ้นปีที่</th><th class="n">จ่ายเงินต้น</th><th class="n">จ่ายดอกเบี้ย</th><th class="n">เงินต้นคงเหลือ</th></tr></thead><tbody id="lnAm"></tbody></table></div></div>
<a class="btn block" href="#afford">เช็กว่ากู้ได้เท่าไหร่จากรายได้</a><p class="fine" style="margin:0">ผลคำนวณเป็นการประมาณ ไม่ใช่การอนุมัติสินเชื่อหรือข้อเสนอจากธนาคาร ทีม PPSD ช่วยยื่นกู้ธนาคารให้ฟรี</p></section></div></div></section>`,
      init() {
        let src = 'pct';
        const draw = () => {
          const price = n('lp'); let pct = Number($('#ld').value), down = price * pct / 100;
          if (src === 'amt') { down = Math.min(price, n('lda')); pct = price ? down / price * 100 : 0; $('#ld').value = Math.round(pct); } else $('#lda').value = Math.round(down);
          $('#ldTx').textContent = pct.toFixed(src === 'amt' ? 1 : 0) + '% = ' + fmt(down) + ' บาท';
          const loan = Math.max(0, price - down), rate = n('lr'), yrs = Math.min(40, Math.max(1, n('ly'))), pay = monthly(loan, rate, yrs), total = pay * yrs * 12, int = total - loan;
          $('#lnPay').innerHTML = fmt(pay) + '<small>บาท</small>'; $('#lnAmt').innerHTML = fmt(loan) + '<small>บาท</small>'; $('#lnDown').innerHTML = fmt(down) + '<small>บาท</small>'; $('#lnInt').innerHTML = fmt(int) + '<small>บาท</small>'; $('#lnTot').innerHTML = fmt(total) + '<small>บาท</small>';
          let bal = loan, rows = ''; const r = rate / 1200;
          for (let y = 1; y <= Math.min(5, yrs); y++) { let pp = 0, ii = 0; for (let m = 0; m < 12; m++) { const it = bal * r, pr = pay - it; ii += it; pp += pr; bal = Math.max(0, bal - pr); } rows += `<tr><td>${y}</td><td class="n">${fmt(pp)}</td><td class="n">${fmt(ii)}</td><td class="n">${fmt(bal)}</td></tr>`; }
          $('#lnAm').innerHTML = rows; store.set('ppsdLoan', { lp: price, ld: Math.round(pct), lr: rate, ly: yrs });
        };
        $('#lda').addEventListener('input', () => { src = 'amt'; draw(); });
        $('#ld').addEventListener('input', () => { src = 'pct'; draw(); });
        ['lp', 'lr', 'ly'].forEach(id => $('#' + id).addEventListener('input', draw));
        draw();
      } };
  };
  P.loanMath = { monthly };

  /* ---------- 4) กู้ได้เท่าไหร่ / ผ่อนไหวไหม (ต้นแบบเดิม #loan) ---------- */
  const loanFromPay = (pay, ratePct, yrs) => { const r = ratePct / 100 / 12, nn = yrs * 12; return r > 0 ? pay / r * (1 - Math.pow(1 + r, -nn)) : pay * nn; };
  function afford(i) {
    const income = i.income + i.co, ratio = income <= 40000 ? 0.5 : 0.6, yrs = Math.min(30, Math.max(1, 70 - i.age));
    const canPay = Math.max(0, income * ratio - i.debt), maxLoan = Math.floor(loanFromPay(canPay, i.rate, yrs) / 10000) * 10000;
    const need = Math.max(0, i.price - i.down), pay = monthly(need, i.rate, yrs), payGap = Math.max(0, pay - canPay), loanGap = Math.max(0, need - maxLoan);
    let incomeNeed = (pay + i.debt) / 0.6; if ((pay + i.debt) / 0.5 <= 40000) incomeNeed = (pay + i.debt) / 0.5;
    return { yrs, canPay, maxLoan, need, pay, payGap, loanGap, addDown: loanGap, lowerPrice: maxLoan + i.down, incomeNeed };
  }
  P.afford = afford;
  R.afford = id => { const d = P.byId(id) || P.byId(19);
    return { t: 'กู้ได้เท่าไหร่ ผ่อนไหวไหม', nav: 2, html: `${head('บ้านหลังนี้ ผ่อนไหวไหม', 'กรอกตัวเลขของคุณ แล้วเทียบวงเงินที่กู้ไหวกับบ้านที่เลือกได้ทันที', 'AFFORDABILITY')}${calcTabs('afford')}
<section class="sec-s"><div class="w"><div class="calc"><form class="panel form" id="aF" data-noop>${field('aD', 'แบบบ้าน', `<select id="aD">${P.designs().map(x => opt(x.id, `${x.code} · ${x.name} · ${fmt(x.price)} บาท`, x.id === d.id)).join('')}</select>`)}
<div class="two">${numIn('aInc', 'รายได้ต่อเดือน', 50000, 1000)}${numIn('aDebt', 'ภาระหนี้ต่อเดือน', 5000, 500)}${numIn('aAge', 'อายุ (ปี)', 35, 1, 18, 'max="69"')}${numIn('aDown', 'เงินดาวน์', 500000, 10000)}${numIn('aCo', 'รายได้ผู้กู้ร่วม', 0, 1000)}${numIn('aRate', 'ดอกเบี้ย (%)', 6, 0.25)}</div><p class="fine" style="margin:0">คำนวณบนเครื่องของคุณ รายได้และหนี้จะไม่ถูกส่งให้บริษัท</p></form>
<section class="res" aria-live="polite"><div class="sum"><p class="msg" id="aMsg"></p><div class="nums"><div><div class="k">ยอดผ่อนของบ้านนี้</div><div class="v" id="aPay"></div></div><div><div class="k">ยอดที่ผ่อนไหว</div><div class="v" id="aCan"></div></div><div><div class="k">วงเงินที่ต้องกู้</div><div class="v" id="aNeed"></div></div><div><div class="k">วงเงินที่กู้ไหว</div><div class="v" id="aMax"></div></div></div></div><div id="aOpts"></div><a class="btn block" href="#appointment">ให้ทีมช่วยประเมินกับธนาคาร</a><p class="fine" style="margin:0">ประมาณเบื้องต้น ไม่ใช่ผลอนุมัติสินเชื่อ เกณฑ์ (สัดส่วนผ่อน 50–60% ของรายได้ ผ่อนได้ถึงอายุ 70 ปี สูงสุด 30 ปี) เป็นตัวอย่าง ต้องตรวจกับธนาคาร</p></section></div></div></section>`,
      init() { const draw = () => { const a = afford({ price: P.byId($('#aD').value).price, income: n('aInc'), debt: n('aDebt'), co: n('aCo'), age: n('aAge'), down: n('aDown'), rate: n('aRate') }); $('#aPay').innerHTML = fmt(up100(a.pay)) + '<small>บาท</small>'; $('#aCan').innerHTML = fmt(a.canPay) + '<small>บาท</small>'; $('#aNeed').innerHTML = fmt(a.need) + '<small>บาท</small>'; $('#aMax').innerHTML = fmt(a.maxLoan) + '<small>บาท</small>'; const over = a.payGap > 0; $('#aMsg').innerHTML = over ? `ยอดผ่อนสูงกว่าที่ประเมินไว้ประมาณ <b>${fmt(up100(a.payGap))} บาทต่อเดือน</b> ลองปรับแบบนี้ได้` : `<b>ผ่อนบ้านหลังนี้ได้</b> ตามตัวเลขที่กรอก ผ่อนได้สูงสุด ${a.yrs} ปี`; $('#aOpts').innerHTML = over ? `<div class="panel" style="padding:18px 22px"><table class="tbl"><tbody><tr><td>เพิ่มเงินดาวน์อีก</td><td class="n">${fmt(a.addDown)} บาท</td></tr><tr><td>หรือเลือกบ้านราคาไม่เกิน</td><td class="n">${fmt(a.lowerPrice)} บาท</td></tr><tr><td>หรือรายได้รวมกับผู้กู้ร่วมถึง</td><td class="n">${fmt(up100(a.incomeNeed))} บาท</td></tr></tbody></table></div>` : ''; }; $('#aF').addEventListener('input', draw); $('#aF').addEventListener('change', draw); draw(); } };
  };

  /* ---------- 5) วางแผนเงินสด (ต้นแบบเดิม #plan) ---------- */
  function cashPlan(i) {
    const DESIGN = 3, BUILD = 8, DEPOSIT = 50000, BRIDGE_PCT = 4;
    const own = Math.max(i.price - Math.round(i.price * i.ltv / 100), DEPOSIT), loan = i.price - own, bridge = Math.round(i.price * BRIDGE_PCT / 100), startM = i.moveIn - BUILD;
    const pays = [{ m: startM - DESIGN, t: 'จองแบบ', n: 'หักเป็นค่าก่อสร้าง', a: DEPOSIT }, { m: startM, t: 'เซ็นสัญญา จ่ายส่วนที่ธนาคารไม่ให้กู้', n: 'ราคาบ้าน ลบวงเงินกู้และเงินจอง', a: own - DEPOSIT }, { m: startM, t: 'ค่าใช้จ่ายนอกค่าก่อสร้าง', n: 'ก่อนเริ่มงานสนาม', a: i.extras }, { m: i.moveIn - 4, t: 'สำรองจ่ายงวดก่อนธนาคารเบิก', n: 'ได้คืนเมื่อธนาคารเบิกงวดถัดไป', a: bridge }].filter(p => p.a > 0);
    let cum = 0, worst = 0, worstM = null, needSave = 0, delay = 0;
    for (const p of pays) { cum += p.a; p.cum = cum; p.have = i.cash + i.save * p.m; p.gap = Math.max(0, cum - p.have); if (p.gap > worst) { worst = p.gap; worstM = p.m; } }
    for (const p of pays) { if (p.m > 0) needSave = Math.max(needSave, (p.cum - i.cash) / p.m); if (i.save > 0) delay = Math.max(delay, (p.cum - i.cash) / i.save - p.m); }
    return { pays, loan, peak: cum, short: worst, shortM: worstM, payment: monthly(loan, i.rate, i.yrs), needSave: Math.ceil(needSave / 100) * 100, delay: i.save > 0 ? Math.max(1, Math.ceil(delay)) : null };
  }
  R.plan = id => { const d = P.byId(id) || P.byId(19); const MAX = 96; let last, lastI;
    return { t: 'วางแผนเงินสด', nav: 2, html: `${head('ต้องเตรียมเงินเท่าไร เมื่อไร', 'เลือกบ้านและวันที่อยากเข้าอยู่ แล้วดูว่าแต่ละช่วงต้องใช้เงินเท่าไร เงินที่มีพอหรือยัง', 'CASH PLANNER')}${calcTabs('plan')}
<section class="sec-s"><div class="w"><div class="calc"><form class="panel form" id="pF" data-noop>${field('pD', 'แบบบ้าน', `<select id="pD">${P.designs().map(x => opt(x.id, `${x.code} · ${fmt(x.price)} บาท`, x.id === d.id)).join('')}</select>`)}${field('pM', 'อยากเข้าอยู่', '<select id="pM"></select>')}
<div class="two">${numIn('pC', 'มีเงินตอนนี้ (บาท)', 500000, 10000)}${numIn('pS', 'ออมได้ต่อเดือน (บาท)', 30000, 1000)}</div>
<fieldset style="border:0;padding:0;margin:0"><legend class="lbl">ค่าใช้จ่ายนอกค่าก่อสร้าง</legend>${[['x1', 'ถมดิน', 150000], ['x2', 'รั้ว', 200000], ['x3', 'ขอน้ำ ไฟ และใบอนุญาต', 50000]].map(([i2, a, b]) => `<label class="chk row-b"><span><input id="${i2}" type="checkbox" checked> ${a}</span><span class="v">${fmt(b)}</span></label>`).join('')}</fieldset>
<div class="three">${numIn('pL', 'กู้ได้ (%)', 90, 5, 0, 'max="100"')}${numIn('pR', 'ดอกเบี้ย (%)', 6, 0.25)}${numIn('pY', 'ผ่อน (ปี)', 30, 1, 1, 'max="40"')}</div></form>
<section class="res" aria-live="polite"><div class="sum"><p class="msg" id="pMsg"></p><div class="nums"><div><div class="k">เงินสดที่ต้องเตรียมสูงสุด</div><div class="v" id="pPeak"></div></div><div><div class="k">ผ่อนหลังรับบ้าน ต่อเดือน</div><div class="v" id="pPmt"></div></div></div></div>
<div class="panel" style="padding:20px 22px"><h3 class="h-s" style="margin-bottom:6px">เส้นทางเงินของบ้านหลังนี้</h3><ol class="tl" id="pTl"></ol></div>
<div id="pOpt" hidden class="panel" style="padding:20px 22px"><h3 class="h-s">ปรับแผนให้เงินพอ</h3><div class="row" style="justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)"><span>ออมเพิ่มเป็น <b id="o1"></b></span><button type="button" class="btn line sm" id="b1">ลองใช้ตัวเลขนี้</button></div><div class="row" style="justify-content:space-between;padding:10px 0"><span>หรือเลื่อนเข้าอยู่เป็น <b id="o2"></b></span><button type="button" class="btn line sm" id="b2">ลองใช้วันนี้</button></div></div>
<a class="btn block" href="#appointment">ให้ทีมช่วยวางแผนการเงิน</a><p class="fine" style="margin:0">ค่าสมมติ: เงินจองแบบ 50,000 บาท ออกแบบ 3 เดือน ก่อสร้าง 8 เดือน เงินสำรอง 4% ของราคาบ้าน · ไม่ใช่ผลอนุมัติสินเชื่อ</p></section></div></div></section>`,
      init() {
        for (let m = 12; m <= MAX; m++) $('#pM').insertAdjacentHTML('beforeend', opt(m, P.monthLabel(m) + ' (อีก ' + m + ' เดือน)', m === 24));
        const draw = () => {
          const i = { price: P.byId($('#pD').value).price, moveIn: n('pM'), cash: n('pC'), save: n('pS'), extras: ($('#x1').checked ? 150000 : 0) + ($('#x2').checked ? 200000 : 0) + ($('#x3').checked ? 50000 : 0), ltv: Math.min(100, n('pL')), rate: n('pR'), yrs: Math.min(40, n('pY')) || 1 };
          const p = cashPlan(i); last = p; lastI = i;
          $('#pPeak').innerHTML = fmt(p.peak) + '<small>บาท</small>'; $('#pPmt').innerHTML = fmt(up100(p.payment)) + '<small>บาท</small>';
          $('#pMsg').innerHTML = p.short > 0 ? `ตามแผนนี้ เงินยังขาดประมาณ <b>${fmt(p.short)} บาท</b> ช่วง ${P.monthLabel(p.shortM)}` : 'ตามแผนนี้ <b>เงินเพียงพอ</b> ในทุกช่วงก่อนรับบ้าน';
          const rows = p.pays.map(e => `<li class="${e.gap > 0 ? 'short' : ''}"><div class="d">${P.monthLabel(e.m)}</div><div class="dot"></div><div><div class="t">${e.t}</div><div class="n">${e.n}</div>${e.gap > 0 ? `<span class="badge bad">ยังขาด ${fmt(e.gap)}</span>` : '<span class="badge ok">เงินพอ</span>'}</div><div class="a">${fmt(e.a)}</div></li>`);
          rows.push(`<li class="end"><div class="d">${P.monthLabel(i.moveIn)}</div><div class="dot"></div><div><div class="t">รับบ้าน</div><div class="n">เซ็นใบส่งมอบ</div></div><div class="a"></div></li>`, `<li class="end"><div class="d">${P.monthLabel(i.moveIn + 1)}</div><div class="dot"></div><div><div class="t">เริ่มผ่อนเต็มยอด</div><div class="n">วงเงินกู้ ${fmt(p.loan)} บาท · ${i.yrs} ปี</div></div><div class="a">${fmt(up100(p.payment))}/ด.</div></li>`);
          $('#pTl').innerHTML = rows.join(''); $('#pOpt').hidden = !(p.short > 0);
          if (p.short > 0) { $('#o1').textContent = 'เดือนละ ' + fmt(p.needSave) + ' บาท'; const can = p.delay !== null && i.moveIn + p.delay <= MAX; $('#o2').textContent = can ? P.monthLabel(i.moveIn + p.delay) + ' (ช้าลง ' + p.delay + ' เดือน)' : 'ต้องเริ่มออมก่อน จึงจะคำนวณได้'; $('#b2').hidden = !can; }
        };
        $('#pF').addEventListener('input', draw); $('#pF').addEventListener('change', draw);
        $('#b1').onclick = () => { $('#pS').value = last.needSave; draw(); }; $('#b2').onclick = () => { $('#pM').value = lastI.moveIn + last.delay; draw(); };
        draw();
      } };
  };

  /* ---------- ตัวแสดงแปลน + 3D (house/viewer.js จาก ERP) ---------- */
  let viewerLoad;
  P.loadViewer = () => viewerLoad || (viewerLoad = new Promise((ok, no) => { if (window.PPSDHouse) return ok(); const sc = document.createElement('script'); sc.src = 'house/viewer.js'; sc.onload = ok; sc.onerror = () => { viewerLoad = null; no(new Error('โหลดตัวแสดงแบบไม่ได้')); }; document.head.appendChild(sc); }));

  /* ออกแบบบ้านให้ดูทันที (AI) — ใช้ได้เมื่อเว็บต่อกับระบบ PPSD (ERP หรือ Cloudflare functions) */
  P.houseGen = async (v, files) => {
    const go = $('#cGo'), box = $('#cGen'); if (!go || !box) return;
    /* note = ข้อความแจ้งว่าใช้ไม่ได้ (แสดงเฉพาะตอนกล่องว่าง หรือมีแต่ข้อความแจ้งเดิม — ไม่ทับผลออกแบบ/ข้อความล้มเหลว) */
    const canNote = () => box.hidden || box.dataset.note === '1';
    const note = (html) => { if (!canNote()) return; box.hidden = false; box.dataset.note = '1'; box.innerHTML = html; };
    /* ถามระบบก่อนว่าพร้อมไหม — ถ้าไม่พร้อมบอกเหตุผล (เดิมซ่อนปุ่มเฉยๆ ลูกค้าไม่รู้ว่าเกิดอะไร) */
    const check = async () => {
      let st; try { st = await fetch(P.API + '/public/house-concept/status', { cache: 'no-store' }).then(r => r.ok ? r.json() : null); } catch { st = null; }
      if (!st) { go.hidden = true; note(`<p class="muted" style="margin:0">⚠️ ตอนนี้เช็กระบบออกแบบอัตโนมัติไม่ได้ (อินเทอร์เน็ตอาจหลุด) — ไม่ต้องกังวล สถาปนิกได้รับความต้องการของคุณแล้ว</p><button type="button" class="btn line sm" id="cRe" style="margin-top:10px">ลองเช็กอีกครั้ง</button>`); $('#cRe').onclick = check; return; }
      if (!st.ok) { go.hidden = true; note('<p class="muted" style="margin:0">ℹ️ ระบบออกแบบอัตโนมัติปิดอยู่ชั่วคราว — สถาปนิก PPSD จะออกแบบและส่งแบบร่างให้คุณเอง</p>'); return; }
      if (!(st.left_today > 0)) { go.hidden = true; note('<p class="muted" style="margin:0">ℹ️ วันนี้มีคนใช้ระบบออกแบบอัตโนมัติครบจำนวนแล้ว ลองใหม่พรุ่งนี้ได้ หรือรอสถาปนิกติดต่อกลับพร้อมแบบร่าง</p>'); return; }
      go.hidden = false; go.textContent = `ออกแบบบ้านให้ดูเลย (AI) · วันนี้เหลือ ${st.left_today} ครั้ง`;
      if (box.dataset.note === '1') { box.hidden = true; box.innerHTML = ''; delete box.dataset.note; }
    };
    await check();
    /* ขั้นตอนที่ลูกค้าเห็น (เวลาเป็นค่าประมาณจากการใช้งานจริง 2–5 นาที) */
    const STEPS = [['ส่งความต้องการให้ระบบ', 0], ['AI อ่านความต้องการและข้อจำกัดของที่ดิน', 4], ['AI จัดผังห้องทีละชั้น', 30], ['ตรวจขนาดห้อง ทางเดิน แล้วปรับผังให้ลงตัว', 140], ['วาดแปลนและภาพ 3D', -1]];
    const EST = 240, mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    let run = 0;
    go.onclick = async () => {
      const me = ++run, [lo, hi] = v.wBud.split('-').map(Number), budT = (P.BUD_RANGES.find(r => r[0] === lo) || [, , ''])[2];
      const body = { floors: Number(v.wFl) || 0, bedrooms: Number(v.cBed), bathrooms: Number(v.cBath), budget: hi, price_per_sqm: Number(v.wPkg), land_w: Number(v.wLw), land_d: Number(v.wLd), parking: Number(v.cCar), style: v.wStyle === 'ยังไม่แน่ใจ' ? '' : v.wStyle, extras: [...P.ROOMS.slice(3).filter(([id]) => Number(v[id]) > 0).map(([id, t]) => `${t} ${v[id]} ห้อง`), ...(v.wNeed || []), v.wFs !== 'ไม่ต้องการ' ? 'ดูฮวงจุ้ยและทิศ' : ''].filter(Boolean).join(', '), images: files.filter(f => f.src).slice(0, 2).map(f => f.src), notes: [`งบค่าก่อสร้าง ${budT} (${fmt(lo)}–${fmt(hi)} บาท) ออกแบบให้ราคาอยู่ในช่วงนี้`, v.wMore].filter(Boolean).join(' · '), name: v.wName, phone: v.wTel };
      go.disabled = true; box.hidden = false; delete box.dataset.note;
      const t0 = Date.now(); let beat = Date.now(), phase = 0, timer = 0;
      box.innerHTML = `<div class="row" style="justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap"><h3 class="h-s" style="margin:0">กำลังออกแบบบ้านของคุณ</h3><span class="fine" id="cClock" style="font-variant-numeric:tabular-nums">0:00</span></div>
        <div style="height:8px;border-radius:99px;background:rgba(127,127,127,.18);overflow:hidden;margin:12px 0" role="progressbar" aria-label="ความคืบหน้าการออกแบบ" aria-valuemin="0" aria-valuemax="100" id="cBarW"><div id="cBar" style="height:100%;width:2%;background:var(--ok,#2E7D55);border-radius:99px;transition:width .8s ease"></div></div>
        <ol id="cSteps" style="list-style:none;margin:0;padding:0;display:grid;gap:6px"></ol>
        <p class="fine" id="cBeat" style="margin:12px 0 0" aria-live="polite"></p>
        <p class="fine" style="margin:4px 0 0">ใช้เวลาประมาณ 2–5 นาที · เปิดหน้านี้ค้างไว้ได้เลย (ย่อหรือสลับแอปได้ แต่อย่าปิดหน้า)</p>`;
      const drawSteps = (cur, doneAll) => { $('#cSteps').innerHTML = STEPS.map(([t], i) => { const done = doneAll || i < cur, now = !doneAll && i === cur; return `<li style="display:flex;gap:10px;align-items:center;${!done && !now ? 'opacity:.5' : ''}"><span aria-hidden="true" style="width:22px;text-align:center">${done ? '✅' : now ? '<span class="cSpin" style="display:inline-block;animation:cSpin 1s linear infinite">⏳</span>' : '○'}</span><span>${t}${now ? ' …' : ''}</span></li>`; }).join(''); };
      if (!document.getElementById('cSpinCss')) { const s = document.createElement('style'); s.id = 'cSpinCss'; s.textContent = '@keyframes cSpin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.cSpin{animation:none!important}}'; document.head.appendChild(s); }
      drawSteps(0);
      const tick = () => {
        if (me !== run || !document.body.contains(box)) return clearInterval(timer);
        const el = (Date.now() - t0) / 1000, quiet = (Date.now() - beat) / 1000;
        $('#cClock').textContent = mmss(el);
        if (phase === 1) { const k = STEPS.slice(1, 4).reduce((a, s, i) => el >= s[1] ? i + 1 : a, 1); drawSteps(Math.min(k, 3)); }
        const pct = phase >= 2 ? 100 : Math.min(94, 3 + 91 * (1 - Math.exp(-el / (EST * 0.75))));
        $('#cBar').style.width = pct + '%'; $('#cBarW').setAttribute('aria-valuenow', Math.round(pct));
        const b = $('#cBeat'); if (!b) return;
        if (phase !== 1) b.textContent = '';
        else if (quiet < 25) { b.style.color = 'var(--ok,#2E7D55)'; b.textContent = `🟢 ระบบยังทำงานอยู่ · ตอบกลับล่าสุด ${Math.round(quiet)} วินาทีที่แล้ว`; }
        else if (quiet < 60) { b.style.color = '#B7791F'; b.textContent = `🟡 การเชื่อมต่อช้า · ไม่ได้ยินจากระบบ ${Math.round(quiet)} วินาที (ยังรออยู่)`; }
        else { b.style.color = '#B3261E'; b.textContent = `🔴 ไม่ได้ยินจากระบบ ${Math.round(quiet)} วินาที — อินเทอร์เน็ตอาจหลุด`; }
        if (el > 70 && el < 72 && phase === 1 && $('#cSteps')) { /* นานกว่าปกติเล็กน้อยไม่ต้องตกใจ */ }
      };
      timer = setInterval(tick, 1000);
      const fail = (title, why, again = true) => {
        if (me !== run) return; clearInterval(timer); go.disabled = false;
        box.innerHTML = `<h3 class="h-s" style="margin:0 0 6px">❌ ${esc(title)}</h3><p class="muted" style="margin:0">${esc(why)}</p><p class="fine" style="margin:8px 0 0">ไม่ต้องกังวล สถาปนิก PPSD ได้รับความต้องการของคุณแล้ว และจะติดต่อกลับพร้อมแบบร่าง</p>${again ? '<button type="button" class="btn line sm" id="cRetry" style="margin-top:12px">ลองออกแบบใหม่อีกครั้ง</button>' : ''}`;
        const r = $('#cRetry'); if (r) r.onclick = () => go.click();
        check();
      };
      const ctl = new AbortController(); let watchdog = 0;
      try {
        const r = await fetch(P.API + '/public/house-concept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
        if (!r.ok) { const j = await r.json().catch(() => ({})); return fail(r.status === 429 ? 'ใช้ระบบออกแบบครบแล้ววันนี้' : 'ส่งความต้องการไม่สำเร็จ', j.error || `ระบบตอบกลับผิดปกติ (รหัส ${r.status}) ลองใหม่อีกครั้ง`, r.status !== 429 && r.status !== 503); }
        phase = 1; beat = Date.now(); drawSteps(1); tick();
        /* เซิร์ฟเวอร์ส่งช่องว่างทุก 10 วิระหว่างคิด แล้วต่อท้ายด้วยผล — อ่านทีละส่วนเพื่อรู้ว่ายังทำงานอยู่ */
        watchdog = setInterval(() => { if (Date.now() - beat > 120000) ctl.abort(); if (Date.now() - t0 > 900000) ctl.abort(); }, 5000);
        const rd = r.body.getReader(), dec = new TextDecoder(); let txt = '';
        for (;;) { const { value, done } = await rd.read(); if (done) break; beat = Date.now(); txt += dec.decode(value, { stream: true }); if (me !== run || !document.body.contains(box)) { ctl.abort(); return; } }
        clearInterval(watchdog);
        let x; try { x = JSON.parse(txt.trim()); } catch { return fail('ออกแบบไม่สำเร็จ', 'ได้คำตอบจากระบบไม่ครบ ลองใหม่อีกครั้ง'); }
        if (x.status !== 'done' || !x.layout) return fail('ออกแบบไม่สำเร็จ', x.error || 'ระบบจัดผังห้องไม่สำเร็จในรอบนี้ ลองใหม่อีกครั้ง');
        phase = 2; drawSteps(4); tick();
        const secs = (Date.now() - t0) / 1000, s = x.stats, title = `บ้าน ${x.layout.floors.length} ชั้น ${s.bedrooms} ห้องนอน ${s.bathrooms} ห้องน้ำ`;
        clearInterval(timer);
        box.innerHTML = `<p class="fine" style="margin:0 0 6px;color:var(--ok,#2E7D55)">✅ ออกแบบเสร็จใน ${mmss(secs)} นาที</p><h3 class="h-m">แบบร่างบ้านของคุณ</h3>${x.layout.summary ? `<p class="muted">${esc(x.layout.summary)}</p>` : ''}<div class="specs" style="margin:14px 0"><div><div class="k">พื้นที่รวม</div><div class="v">${fmt(s.total)} <small>ตร.ม.</small></div></div><div><div class="k">ราคาประมาณ</div><div class="v">${mil(s.estimate)} <small>ล้านบาท</small></div></div><div><div class="k">ห้องนอน · ห้องน้ำ</div><div class="v">${s.bedrooms} · ${s.bathrooms}</div></div></div><p class="fine" id="cDraw">⏳ กำลังวาดแปลนและภาพ 3D…</p><div id="cShot"></div><div id="cView" class="viewer"></div><p class="fine">แบบร่างเบื้องต้นจากระบบอัตโนมัติ ไม่ใช่แบบก่อสร้าง สถาปนิกจะปรับให้เหมาะกับที่ดินและงบจริงอีกครั้ง</p><button class="btn line sm" type="button" id="cAgain">ออกแบบใหม่</button>`;
        $('#cAgain').onclick = () => go.click(); go.disabled = false;
        try { await P.loadViewer(); try { const stl = window.PPSDHouse.still && window.PPSDHouse.still(x.layout, 1200, 800, 1); if (stl) { const im = new Image(); im.alt = 'ภาพจำลอง ' + title; im.src = stl.toDataURL('image/jpeg', 0.88); im.style.width = '100%'; $('#cShot').replaceChildren(im); } } catch { } window.PPSDHouse.mount($('#cView'), x.layout, title, body.land_w && body.land_d ? { w: body.land_w, d: body.land_d } : undefined); const d = $('#cDraw'); if (d) d.remove(); }
        catch { const d = $('#cDraw'); if (d) d.textContent = '⚠️ ออกแบบเสร็จแล้ว แต่เครื่องนี้เปิดภาพแปลนและ 3D ไม่ได้ ลองเปิดด้วยเบราว์เซอร์อื่น หรือรอสถาปนิกส่งแบบให้'; }
        check();
      } catch (e) {
        clearInterval(watchdog);
        if (me !== run || !document.body.contains(box)) return;
        const long = Date.now() - t0 > 900000;
        fail(long ? 'ใช้เวลานานเกินไป' : 'การเชื่อมต่อหลุด', long ? 'ระบบใช้เวลานานกว่าปกติ ลองใหม่อีกครั้งในอีกสักครู่' : 'อินเทอร์เน็ตหลุดหรือระบบไม่ตอบกลับระหว่างออกแบบ ตรวจสัญญาณแล้วลองใหม่อีกครั้ง');
      }
    };
  };
})(window.PPSD);
