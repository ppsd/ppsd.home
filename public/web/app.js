/* เว็บลูกค้า PPSD (ตัวอย่าง) — ทำงานบนเครื่องผู้ใช้ทั้งหมด ไม่ส่งข้อมูลเข้าระบบ */
const fmt = n => Math.round(n).toLocaleString('en-US');
const mil = n => (n / 1e6).toFixed(1);
const up100 = n => Math.ceil(n / 100) * 100;
const $ = id => document.getElementById(id);
const L = k => 'img/' + k + '.jpg';
const wx = (id, w = 900, h = 620) => `https://static.wixstatic.com/media/${id}/v1/fill/w_${w},h_${h},al_c,q_80/${id}`;
const TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const now = new Date();
const monthLabel = m => { const d = new Date(now.getFullYear(), now.getMonth() + m, 1); return TH[d.getMonth()] + ' ' + (d.getFullYear() + 543); };
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

/* แบบบ้านจากเว็บเดิม · ราคา พื้นที่ และที่ดินขั้นต่ำเป็นค่าตัวอย่าง */
const D = (id, style, floors, beds, name, price, area, land, desc, imgs) => ({ id, style, floors, beds, name, price, area, land, desc, imgs: imgs.map(x => 'a69bf9_' + x) });
const DESIGNS = [
  D(1, 'คลาสสิก', 1, 3, 'คลาสสิก ชั้นเดียว 3 ห้องนอน', 3800000, 180, 70, 'เรียบหรู ใช้งานสะดวก 3 ห้องนอน 2 ห้องน้ำ ครัวฝรั่ง หลังคาจั่วทำให้บ้านดูสูงโล่ง มีระเบียงหน้าบ้าน เหมาะกับครอบครัวขนาดกลางถึงใหญ่ที่มีผู้สูงอายุ', ['72478a0e14d04155be6b1b1b55ec3b9d~mv2.jpg', '037f3a1f9bd5496397bd6e4f2d8b2b5e~mv2.jpg', 'b36ab71482a74e3a92f0bd8da4e89861~mv2.jpg', 'b7fabe2cb0ca4d979ca74a2aed4b6b60~mv2.jpg']),
  D(2, 'คลาสสิก', 1, 4, 'คลาสสิก ชั้นเดียว 4 ห้องนอน', 4900000, 240, 90, '4 ห้องนอน ห้องน้ำในตัว 3 ห้อง ครัวฝรั่ง พื้นบ้านยกสูง มีระเบียงหน้าบ้านไว้นั่งพัก พื้นที่ใช้สอยเชื่อมถึงกัน', ['b150228c365a4620b79dad8911c1763d~mv2.jpg', 'f4bf7075eddc43ef81ef7891d2ec8845~mv2.jpg', '94ef766460e44dc2ac6e90ba966137c6~mv2.jpg', 'd76096ca10cd41d0a9589ca69b4004b6~mv2.jpg']),
  D(3, 'คลาสสิก', 2, 6, 'คลาสสิก 2 ชั้น 6 ห้องนอน', 9500000, 460, 130, 'โทนสีขาวตัดไม้ 6 ห้องนอน มีทั้งครัวไทยและครัวฝรั่ง เหมาะกับครอบครัวใหญ่ รองรับแขกหรือจัดประชุมได้', ['baf1a8d451024e9896b20136e62f17e0~mv2.png', '1dc488d2de7940dcbc6766c8cb983c61~mv2.png', '5dee43134f4e4e5ab13cf8319dd4fc4d~mv2.png', '8ee28318ac854e0ebcd0d4d12e848f6a~mv2.jpg']),
  D(4, 'คลาสสิก', 2, 0, 'คลาสสิก 2 ชั้น หน้าต่างทรงสูง', 6800000, 320, 100, 'ห้องนอนชั้นล่างติดห้องรับแขก ครัวฝรั่งพร้อมโต๊ะทานข้าว หน้าต่างทรงสูง เหมาะกับบ้านที่มีผู้สูงอายุอยู่ร่วมกัน', ['00a2f010123f415cab4d1e7bb8b56d04~mv2.jpg', 'f9177e9ca41647699fb174a48f3930d5~mv2.jpg', 'cc316f54d31643498e1bab544a73c86e~mv2.jpg', 'bb083f0c0530476a838bfc062ef52724~mv2.jpg']),
  D(5, 'คลาสสิก', 2, 0, 'คลาสสิก 2 ชั้น สระว่ายน้ำหน้าบ้าน', 8600000, 390, 140, 'ห้องนั่งเล่นติดสระว่ายน้ำหน้าบ้าน ครัวฝรั่งพร้อมโต๊ะทานข้าว ผสมความเรียบหรูกับความโมเดิร์น', ['25c59e808ed74d8ebd4131e922e46a5a~mv2.jpg', '3ce7f293331c4d2daad52b8ef6bec3c4~mv2.jpg', '8ddc4891b7f74b06881c09a849e8aaa2~mv2.jpg', '55840a2328b844a88636c6132d86bc7f~mv2.jpg']),
  D(6, 'โมเดิร์น', 1, 1, 'โมเดิร์น ชั้นเดียว ขนาดเล็ก', 1900000, 70, 40, 'บ้านขนาดเล็ก ครัวฝรั่งเชื่อมห้องรับแขก หลังคาเรียบ เหมาะกับครอบครัวเล็ก บ้านพักตากอากาศ หรือบ้านหลังเกษียณ', ['00efe284928d4536bfe7447be60d1670~mv2.jpg', 'd23de091c0af4e4e911fe7574b17a963~mv2.jpg', '0c2b8716ea0742fa9325b3a9abf3fa2f~mv2.jpg', 'f7558d0bb8cb42f58cbe68da9cb924b8~mv2.jpg']),
  D(7, 'โมเดิร์น', 1, 3, 'โมเดิร์น ชั้นเดียว ทรงตัว L', 5600000, 260, 120, '3 ห้องนอน 3 ห้องน้ำ โรงจอดรถติดตัวบ้าน 2 คัน มีสระว่ายน้ำด้านหน้า หน้าต่างกระจกหลากหลายรูปแบบ', ['8332bafb8cdf4b7c9daa7da8612e1111~mv2.jpg', '9fde3a8f171f41df8f7ee8b8520f810c~mv2.jpg', 'c9e14add0d3a4153b6cf929e5e958221~mv2.jpg', '354afcc006bf41f28e437ba8d2e33395~mv2.jpg']),
  D(8, 'โมเดิร์น', 2, 0, 'โมเดิร์น 2 ชั้น ระเบียงชั้นบน', 5200000, 240, 80, 'ห้องนอนอยู่ชั้นบนทั้งหมด หลังคาเรียบ บ้านสูงโปร่ง มีระเบียงชั้น 2 และที่จอดรถ 2 คัน', ['fc015c5a01084d0abcfd75e2e9202989~mv2.jpg', '3545f68d1f74430ead1f3f9125cb4bab~mv2.jpg', 'a17538a194464cadb2dbef217560d215~mv2.jpg', '537f23aaeade43bb9ba3db99e4d8a250~mv2.jpg']),
  D(9, 'โมเดิร์น', 2, 0, 'โมเดิร์น 2 ชั้น ระแนงไม้', 5900000, 270, 85, 'ห้องนอนชั้นล่าง 1 ห้อง หน้าบ้านตกแต่งไม้ระแนงโทนน้ำตาล เหมาะกับบ้านที่มีผู้สูงอายุ', ['385c97db90fe461db5a5fce00c5ee9dc~mv2.jpg', 'dc50aaf9231a4e00bb012a8dde035351~mv2.jpg', '319cb8965b5a43b7bd53f3700183c04d~mv2.jpg', '7369d027cae6490ba075521298fea562~mv2.jpg']),
  D(10, 'มินิมอล', 1, 3, 'มินิมอล ชั้นเดียว สไตล์ญี่ปุ่น', 3600000, 170, 70, 'โทนสีขาวอบอุ่น 3 ห้องนอน หลังคาจั่ว หน้าต่างทรงกลม เหมาะกับครอบครัวขนาดกลางที่เลี้ยงแมว', ['2a6f2b0e416e4a56857a86b34ec609cc~mv2.jpg', '899e8d8914e245a79676d5a880472c62~mv2.jpg', 'cd826f8539374d78ad0f920a9cbfa88d~mv2.jpg', 'f35c3c2e4a7d49bb822277a1c1dfd9be~mv2.jpg']),
  D(11, 'มินิมอล', 0, 0, 'มินิมอล No.02', 2900000, 150, 60, 'เน้นโครงสร้างแข็งแรงตั้งแต่เริ่มสร้าง ควบคุมโดยช่างผู้มีประสบการณ์', ['cd907ebcae3f49168e02e1f75d15e71f~mv2.jpg', '84619220bd0e4d82a35f14dffee97f66~mv2.jpg', 'c415b15afbcb4303956f0c2312405a7a~mv2.jpg', '7ee19d044b1d49fbb0d208e1a28437ea~mv2.jpg']),
  D(12, 'มินิมอล', 2, 2, 'มินิมอล 2 ชั้น ระแนงขาว', 3400000, 150, 55, '2 ห้องนอนชั้นบน หลังคาจั่ว ไม้ระแนงสีขาว ที่จอดรถ 2 คัน มีพื้นที่รอบบ้านให้เด็กทำกิจกรรม', ['6c9c3544ffe64b1e9c33e90179fcca16~mv2.jpg', '82faf1e61f7f498ea27749db39e0a8cc~mv2.jpg', '5559394387764169af06349b2fcf4329~mv2.jpg', '878e4bc5442d49baa06edd576f337f29~mv2.jpg'])
];
const floorText = d => d.floors ? (d.floors === 1 ? 'ชั้นเดียว' : d.floors + ' ชั้น') : 'รอข้อมูลจำนวนชั้น';
const bedText = d => d.beds ? ' · ' + d.beds + ' ห้องนอน' : '';
const byId = id => DESIGNS.find(d => d.id === Number(id));

/* ผลงานจาก Company profile · วันที่และไทม์ไลน์บางส่วนเป็นค่าสมมติ */
const WORKS = [
  { id: 1, status: 'done', type: 'ชั้นเดียว', name: 'บ้านโมเดิร์นชั้นเดียว พร้อมสระว่ายน้ำ', area: '509 ตร.ม.', months: '10 เดือน', img: 'h1-a', r3d: 'h1-3d', gal: ['h1-a', 'h1-b'], quote: 'สร้างบ้านกับ PPSD สบายใจมาก มองถึงปลายทางตอนผมเข้าอยู่ให้ผมแทบจะไม่ต้องดูแลอะไรมากเลย', who: 'เจ้าของบ้าน · ราชบุรี', spec: ['ผนังหินธรรมชาติ และระแนงไม้ด้านหน้า', 'สระว่ายน้ำในบ้าน ล้อมด้วยห้องพัก', 'ฝ้าสูง 2.8 ม. (Elite)'], tl: [['เดือน 1', 'ลงเสาเข็ม ฐานราก', 'ตรวจระดับและตำแหน่งเสาเข็มครบทุกต้น', 'pass'], ['เดือน 3', 'โครงสร้าง หลังคา', 'ตรวจรอยต่อเหล็ก พบ 2 จุดต้องเชื่อมเพิ่ม แก้แล้วตรวจซ้ำผ่าน', 'fix'], ['เดือน 5', 'ท่อประปา สายไฟ ก่อนปิดผนัง', 'ถ่ายเก็บทุกผนัง เจ้าของบ้านเปิดดูได้เมื่อจะเจาะหรือซ่อม', 'pass'], ['เดือน 10', 'ส่งมอบ', 'ตรวจรับร่วมกับเจ้าของบ้าน เริ่มนับรับประกัน', 'pass']] },
  { id: 2, status: 'done', type: 'สองชั้น', name: 'บ้านสองชั้นโมเดิร์น ระแนงไม้และเพอร์โกล่า', area: '', months: '12 เดือน', img: 'h2-a', r3d: 'h2-3d', gal: ['h2-a', 'h2-b', 'h2-d', 'h2-e', 'h2-c', 'h2-f', 'h2-g'], quote: 'ประทับใจ บ้านไม่มีแม้กระทั่งไอร้อน', who: 'เจ้าของบ้าน · ราชบุรี', spec: ['เพอร์โกล่าเหล็กกัลวาไนซ์ พ่นสีดำด้าน', 'ชานไม้ด้านหน้าห้องนั่งเล่น', 'ฝ้ามีช่องระบายอากาศรอบหลังคา ลดความร้อนสะสม'], tl: [['เดือน 2', 'ฐานราก คานคอดิน', '', 'pass'], ['เดือน 5', 'โครงสร้างชั้น 2 หลังคา', '', 'pass'], ['เดือน 8', 'งานระบบก่อนปิดผนัง', 'ท่อและสายไฟถ่ายเก็บไว้ในสมุดบ้าน', 'pass'], ['เดือน 12', 'ส่งมอบ', '', 'pass']] },
  { id: 3, status: 'live', week: 18, type: 'สองชั้น', name: 'Home & Factory หลังคาจั่วสูง', area: '', img: 'h3-c', r3d: 'h3-3d', gal: ['h3-a', 'h3-b', 'h3-c', 'h3-d', 'h3-e'], quote: 'PPSD ออกแบบฟังก์ชั่นภายใน ใช้สอยได้อย่างคุ้มค่าจริงๆ', who: 'เจ้าของบ้าน (ระหว่างก่อสร้าง)', spec: ['โครงหลังคาเหล็กเต็มโรงใหญ่', 'ผนังสูงโปร่ง รับแสงทางทิศเหนือ'], tl: [['สัปดาห์ 4', 'โครงหลังคาเหล็ก', 'ยกโครงจั่วสูงเสร็จ', 'pass'], ['สัปดาห์ 12', 'ก่อผนัง ฉาบ', 'ตรวจแนวดิ่งผนัง พบ 1 จุดเอียงเกินเกณฑ์ รื้อก่อใหม่แล้ว', 'fix'], ['สัปดาห์ 18', 'ล่าสุด', 'งานฉาบภายนอกและนั่งร้านด้านหน้า', 'pass']] },
  { id: 4, status: 'live', week: 22, type: 'สามชั้น', name: 'Production House 3 ชั้น', area: '', img: 'h4-b', r3d: 'h4-3d', gal: ['h4-a', 'h4-b'], quote: '', who: '', spec: ['โครงสร้าง คสล. 3 ชั้น', 'ผนังด้านหน้าแผ่นตกแต่งสีเทาเข้ม'], tl: [['สัปดาห์ 10', 'โครงสร้าง 3 ชั้น', '', 'pass'], ['สัปดาห์ 22', 'ล่าสุด', 'งานผนังและตาข่ายกันตก', 'pass']] },
  { id: 5, status: 'live', week: 9, type: 'ชั้นเดียว', name: 'บ้าน Modern Classic ชั้นเดียว', area: '4 นอน 3 น้ำ', img: 'h5-c', r3d: 'h5-3d', gal: ['h5-a', 'h5-b', 'h5-c'], quote: '', who: '', spec: ['หลังคาทรงปั้นหยา โครงเหล็ก', 'ระเบียงหน้าบ้านยาวรับลม'], tl: [['สัปดาห์ 2', 'เตรียมพื้นที่ เสาเข็ม', '', 'pass'], ['สัปดาห์ 6', 'โครงหลังคา', '', 'pass'], ['สัปดาห์ 9', 'ล่าสุด', 'มุงหลังคาเสร็จ เริ่มก่อผนัง', 'pass']] }
];

const FAQ = [
  ['ราคา', 'ราคารวมอะไรบ้าง', 'ค่าก่อสร้างตามแบบและสเปคที่ตกลงในใบเสนอราคา ค่าใช้จ่ายอื่น เช่น ถมดินหรือรั้ว ดูได้ในหน้างบรวมทั้งโครงการ', 'budget', 'ดูงบรวม'],
  ['ราคา', 'งบบานปลายได้ไหม', 'งานที่เพิ่มหรือเปลี่ยนจากสัญญาต้องตกลงกันเป็นเอกสารก่อนทำ คุณจะเห็นยอดก่อนตัดสินใจทุกครั้ง', 'spec', 'ดูสเปค'],
  ['ขั้นตอน', 'เริ่มสร้างบ้านต้องทำอะไรก่อน', 'เริ่มจากประเมินราคา แล้วนัดคุยและสำรวจที่ดิน จากนั้นจองแบบเพื่อเริ่มออกแบบ', 'process', 'ดูขั้นตอน'],
  ['ขั้นตอน', 'ส่งบ้านช้าทำอย่างไร', 'ถ้าบริษัทส่งมอบช้ากว่าสัญญา บริษัทจ่ายค่าปรับวันละ 1,000 บาท', 'process', 'ดูขั้นตอน'],
  ['เงิน', 'จ่ายเงินตอนไหน', 'จ่ายเป็นงวดหลังงานแต่ละขั้นเสร็จ จึงเบิกเงินตามงานจริง', 'plan', 'วางแผนการเงิน'],
  ['แบบบ้าน', 'ไม่อยากได้แบบสำเร็จรูป ออกแบบเองได้ไหม', 'ได้ บอกความต้องการ งบ และขนาดที่ดิน สถาปนิกออกแบบให้เฉพาะคุณ ค่าจองแบบ 30,000–40,000 บาท', 'custom', 'ออกแบบตามความต้องการ'],
  ['เงิน', 'เงินจองแบบหักค่าก่อสร้างไหม', 'หักเป็นค่าก่อสร้าง และหนังสือจองมีอายุ 1 ปี', 'plan', 'วางแผนการเงิน'],
  ['เงิน', 'จองแบบแล้วยกเลิกได้เงินคืนไหม', 'เงินมัดจำไม่คืนตามหนังสือจอง แต่แบบและใบเสร็จที่ได้ไปแล้วยังเปิดดูได้', 'contact', 'ปรึกษาทีม'],
  ['สินเชื่อ', 'กู้ได้เท่าไหร่', 'ลองกรอกรายได้และภาระหนี้เพื่อดูวงเงินโดยประมาณ ทีมช่วยยื่นกู้ธนาคารให้ฟรี', 'loan', 'ลองคำนวณ'],
  ['สินเชื่อ', 'ยังไม่มีเงินดาวน์เลยทำอย่างไร', 'หน้าวางแผนการเงินจะบอกว่าต้องออมเดือนละเท่าไหร่ หรือควรเลื่อนวันเริ่มสร้างเมื่อไหร่', 'plan', 'วางแผนการเงิน'],
  ['ที่ดิน', 'ไม่มีที่ดินสร้างได้มั้ย', 'ปรึกษาทีมได้ แต่ต้องมีที่ดินก่อนเริ่มออกแบบให้เข้ากับทิศและขนาดจริง', 'land', 'เช็กที่ดิน'],
  ['ที่ดิน', 'ใครขออนุญาตก่อสร้าง', 'บริษัทดูแลตั้งแต่ออกแบบ เขียนแบบ และขออนุญาตก่อสร้าง', 'process', 'ดูขั้นตอน'],
  ['แบบ', 'แก้แบบได้กี่ครั้ง', 'แพ็กเกจ Premium แก้ได้ 2 ครั้ง และ Elite แก้ได้ 4 ครั้ง', 'spec', 'เทียบแพ็กเกจ'],
  ['แบบ', 'เห็นบ้านก่อนสร้างได้ไหม', 'ได้ เราทำภาพ 3D ให้เห็นสัดส่วน แสง ทิศทางลม และวัสดุก่อนเริ่มก่อสร้าง', 'works', 'ดูผลงาน'],
  ['ฮวงจุ้ย', 'ดูฮวงจุ้ยให้ไหม', 'เราออกแบบอิงหลักฮวงจุ้ย ทั้งทิศ ตำแหน่งเจ้าบ้าน เตาไฟ และประตู', 'why', 'ทำไมต้อง PPSD'],
  ['ฮวงจุ้ย', 'หาฤกษ์ลงเสาเข็มให้ไหม', 'ทีมช่วยดูฤกษ์ลงเสาเข็มให้ และมีชุดพิธีให้เลือก', 'spec', 'ดูรายการอัปเกรด'],
  ['คุณภาพ', 'เห็นผลตรวจงานไหม', 'เห็นทุกครั้ง ทั้งงานที่ผ่านและจุดที่พบปัญหา พร้อมสถานะการแก้ไขและรูปก่อนหลัง', 'works', 'ดูตัวอย่าง'],
  ['คุณภาพ', 'เข้าไปดูหน้างานได้ไหม', 'นัดเข้าดูหน้างานได้ ทีมจะจัดเวลาและคนดูแลให้', 'contact', 'นัดหมาย'],
  ['หลังส่งมอบ', 'รับประกันกี่ปี', 'โครงสร้าง 5 ปี หลังคาและรั่วซึม 1 ปี ไฟฟ้าประปา 1 ปี สีและฝ้า 1 ปี นับจากวันส่งมอบ', 'homebook', 'ดูสมุดบ้าน'],
  ['หลังส่งมอบ', 'แจ้งซ่อมอย่างไร', 'ถ่ายรูปและบอกอาการผ่านปุ่มแจ้งซ่อม แล้วติดตามสถานะได้', 'homebook', 'ดูแจ้งซ่อม'],
  ['บริษัท', 'รับงานพื้นที่ไหน', 'ราชบุรี กาญจนบุรี เพชรบุรี นครปฐม กรุงเทพฯ และปริมณฑล', 'areas', 'ดูพื้นที่'],
  ['บริษัท', 'เปิดกี่โมง', 'จันทร์ถึงเสาร์ 8:00–18:00 น. วันอาทิตย์ตามการนัดหมาย', 'contact', 'ติดต่อเรา']
];

/* ---------- การคำนวณ ---------- */
function monthly(loan, ratePct, yrs) {
  const r = ratePct / 100 / 12, n = yrs * 12;
  if (n <= 0) return 0;
  return r > 0 ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n;
}
function loanFromPay(pay, ratePct, yrs) {
  const r = ratePct / 100 / 12, n = yrs * 12;
  return r > 0 ? pay / r * (1 - Math.pow(1 + r, -n)) : pay * n;
}
function afford(i) {
  const income = i.income + i.co;
  const ratio = income <= 40000 ? 0.5 : 0.6;
  const yrs = Math.min(30, Math.max(1, 70 - i.age));
  const canPay = Math.max(0, income * ratio - i.debt);
  const maxLoan = Math.floor(loanFromPay(canPay, i.rate, yrs) / 10000) * 10000;
  const need = Math.max(0, i.price - i.down);
  const pay = monthly(need, i.rate, yrs);
  const payGap = Math.max(0, pay - canPay), loanGap = Math.max(0, need - maxLoan);
  let incomeNeed = (pay + i.debt) / 0.6;
  if ((pay + i.debt) / 0.5 <= 40000) incomeNeed = (pay + i.debt) / 0.5;
  return { yrs, canPay, maxLoan, need, pay, payGap, loanGap, addDown: loanGap, lowerPrice: maxLoan + i.down, incomeNeed };
}
function cashPlan(i) {
  const DESIGN = 3, BUILD = 8, DEPOSIT = 50000, BRIDGE_PCT = 4;
  const own = Math.max(i.price - Math.round(i.price * i.ltv / 100), DEPOSIT);
  const loan = i.price - own, bridge = Math.round(i.price * BRIDGE_PCT / 100), startM = i.moveIn - BUILD;
  const pays = [
    { m: startM - DESIGN, t: 'จองแบบ', n: 'หักเป็นค่าก่อสร้าง', a: DEPOSIT },
    { m: startM, t: 'เซ็นสัญญา จ่ายส่วนที่ธนาคารไม่ให้กู้', n: 'ราคาบ้าน ลบวงเงินกู้และเงินจอง', a: own - DEPOSIT },
    { m: startM, t: 'ค่าใช้จ่ายนอกค่าก่อสร้าง', n: 'ก่อนเริ่มงานสนาม', a: i.extras },
    { m: i.moveIn - 4, t: 'สำรองจ่ายงวดก่อนธนาคารเบิก', n: 'ได้คืนเมื่อธนาคารเบิกงวดถัดไป', a: bridge }
  ].filter(p => p.a > 0);
  let cum = 0, worst = 0, worstM = null, needSave = 0, delay = 0;
  for (const p of pays) { cum += p.a; p.cum = cum; p.have = i.cash + i.save * p.m; p.gap = Math.max(0, cum - p.have); if (p.gap > worst) { worst = p.gap; worstM = p.m; } }
  for (const p of pays) { if (p.m > 0) needSave = Math.max(needSave, (p.cum - i.cash) / p.m); if (i.save > 0) delay = Math.max(delay, (p.cum - i.cash) / i.save - p.m); }
  return { pays, loan, peak: cum, short: worst, shortM: worstM, payment: monthly(loan, i.rate, i.yrs), needSave: Math.ceil(needSave / 100) * 100, delay: i.save > 0 ? Math.max(1, Math.ceil(delay)) : null };
}

/* ---------- ชิ้นส่วนหน้า ---------- */
const designCard = d => `<a class="hcard" href="#design/${d.id}"><img loading="lazy" src="${wx(d.imgs[0], 640, 430)}" alt="${d.name}"><div class="b"><h3>${d.name}</h3><div class="meta">${floorText(d)}${bedText(d)} · ${d.area} ตร.ม.</div><div class="price">ประมาณ ${mil(d.price)} ล้านบาท</div></div></a>`;
const workCard = h => `<a class="hcard" href="#work/${h.id}"><img loading="lazy" src="${L(h.img)}" alt="${h.name}"><div class="b"><span class="tag ${h.status === 'live' ? 'live' : 'ok'}">${h.status === 'live' ? 'กำลังสร้าง · สัปดาห์ที่ ' + h.week : 'ส่งมอบแล้ว'}</span><h3>${h.name}</h3><div class="meta">ราชบุรี · ${h.type}${h.area ? ' · ' + h.area : ''}</div></div></a>`;
const head = (crumb, title, lead) => `<div class="w sec tight"><div class="crumb">${crumb}</div><h1>${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}</div>`;
const tabs = (items, cur) => `<div class="w"><div class="tabs">${items.map(([h, t]) => `<a href="#${h}" class="${h === cur ? 'on' : ''}">${t}</a>`).join('')}</div></div>`;
const designTabs = cur => tabs([['designs', 'แบบสำเร็จรูป'], ['custom', 'ออกแบบตามความต้องการ']], cur);
const finTabs = cur => tabs([['loan', 'ประเมินสินเชื่อบ้าน'], ['plan', 'วางแผนการเงิน'], ['budget', 'งบรวมทั้งโครงการ']], cur);
const workTabs = cur => tabs([['works', 'ผลงานสร้างจริง'], ['works-3d', 'ผลงานออกแบบ'], ['works-live', 'บ้านที่กำลังสร้าง']], cur);
const homeTabs = cur => tabs([['myhome', 'บ้านของฉัน'], ['homebook', 'สมุดบ้านและแจ้งซ่อม']], cur);
const consent = id => `<label class="consent"><input id="${id}" type="checkbox" required><span>ยินยอมให้ PPSD เก็บข้อมูลเพื่อติดต่อกลับ อ่าน<a href="#privacy">นโยบายความเป็นส่วนตัว</a></span></label>`;
const sent = t => `<p class="sent" data-sent hidden>${t || 'ในเว็บจริงข้อมูลนี้จะส่งถึงทีมงาน หน้าตัวอย่างยังไม่ได้ส่งข้อมูลไปที่ใด'}</p>`;
const opt = (k, v) => `<div class="opt"><div class="k">${k}</div><div class="v">${v}</div></div>`;
const designOpts = sel => DESIGNS.map(d => `<option value="${d.id}" ${d.id === sel ? 'selected' : ''}>${d.name} · ${fmt(d.price)} บาท</option>`).join('');
const num = id => Math.max(0, Number($(id).value) || 0);
const callout = (t, h, b) => `<div class="band"><div class="w sec"><h2>${t}</h2><div><a class="btn" href="#${h}">${b}</a></div></div></div>`;

/* ---------- หน้าทั้งหมด ---------- */
const P = {};
P.home = () => ({ nav: 'home', t: 'หน้าแรก', html: `
<section class="hero"><div class="txt dark"><h1>บ้านดี ดวงดี</h1><p>สร้างบ้านโปร่ง โล่ง สบาย ออกแบบตามทิศ แสง ลม และฮวงจุ้ย</p><div class="row"><a class="btn gold" href="#designs">ดูแบบบ้าน</a><a class="btn line" href="#estimate">ประเมินราคาฟรี</a></div></div><img src="${L('h1-a')}" alt="บ้านโมเดิร์นชั้นเดียว ผลงาน PPSD"></section>
<div class="w sec"><h2>เริ่มจากตรงไหนดี</h2><div class="steps">
<a class="step" href="#designs"><b>เลือกแบบบ้าน</b><span>ดูตามสไตล์ ราคา และขนาดที่ดิน</span></a>
<a class="step" href="#loan"><b>เช็กงบและยอดผ่อน</b><span>รู้ว่ากู้ได้เท่าไหร่ ผ่อนไหวไหม</span></a>
<a class="step" href="#works-live"><b>ดูบ้านจริงที่กำลังสร้าง</b><span>งานจริงจากหน้างานทุกสัปดาห์</span></a>
<a class="step" href="#contact"><b>นัดคุยกับสถาปนิก</b><span>ฟรี ไม่มีข้อผูกมัด</span></a></div></div>
<div class="dark"><div class="w sec"><div class="stats"><div><b>10 ปี</b><span>ประสบการณ์สร้างบ้าน</span></div><div><b>100+</b><span>หลังที่สร้างแล้ว</span></div><div><b>${WORKS.filter(h => h.status === 'live').length} หลัง</b><span>กำลังสร้างตอนนี้</span></div></div></div></div>
<div class="w sec"><div class="sec-h"><h2>แบบบ้านแนะนำ</h2><a class="link" href="#designs">ดูทั้ง ${DESIGNS.length} แบบ</a></div><div class="cards">${[7, 1, 12].map(i => designCard(byId(i))).join('')}</div></div>
<div class="band"><div class="w sec"><div class="sec-h"><h2>บ้านที่กำลังสร้างตอนนี้</h2><a class="link" href="#works-live">ดูทั้งหมด</a></div><div class="cards">${WORKS.filter(h => h.status === 'live').map(workCard).join('')}</div></div></div>
<div class="w sec"><h2>ทำไมลูกค้าเลือก PPSD</h2><div class="why"><div><b>บ้านไม่ร้อน</b><span>วางผังตามทิศ แสง และลม</span></div><div><b>ฮวงจุ้ย</b><span>ดูตำแหน่งเจ้าบ้าน เตาไฟ และประตู</span></div><div><b>จ่ายตามงานจริง</b><span>งานเสร็จแต่ละขั้นจึงเบิกเงิน</span></div><div><b>เห็นผลตรวจงาน</b><span>เห็นทุกครั้ง รวมจุดที่พบแล้วแก้</span></div></div><div><a class="link" href="#why">อ่านเพิ่มเติม</a></div></div>
<div class="band"><div class="w sec"><p class="quote">“${WORKS[1].quote}”</p><p class="who">${WORKS[1].who}</p><div><a class="link" href="#reviews">ดูรีวิวทั้งหมด</a></div></div></div>
<div class="dark"><div class="w sec"><h2>อยากรู้ว่าบ้านในฝันราคาเท่าไหร่</h2><div><a class="btn gold" href="#estimate">ประเมินราคาบ้านฟรี</a></div></div></div>` });

P.designs = () => ({ nav: 'designs', t: 'แบบบ้าน', html: `${head('แบบบ้าน', 'เลือกแบบบ้านที่ใช่', 'เลือกจากแบบสำเร็จรูป หรือให้สถาปนิกออกแบบตามความต้องการและงบของคุณ')}${designTabs('designs')}
<div class="w sec"><form class="filters" id="fl" onsubmit="return false">
<div class="f"><label for="fStyle">สไตล์</label><select id="fStyle"><option value="">ทั้งหมด</option><option>คลาสสิก</option><option>โมเดิร์น</option><option>มินิมอล</option></select></div>
<div class="f"><label for="fFloor">จำนวนชั้น</label><select id="fFloor"><option value="">ทั้งหมด</option><option value="1">ชั้นเดียว</option><option value="2">2 ชั้น</option></select></div>
<div class="f"><label for="fBudget">งบไม่เกิน</label><select id="fBudget"><option value="">ไม่จำกัด</option><option value="3000000">3 ล้านบาท</option><option value="4000000">4 ล้านบาท</option><option value="6000000">6 ล้านบาท</option><option value="10000000">10 ล้านบาท</option></select></div>
<div class="f"><label for="fLand">ที่ดินที่มี (ตร.ว.)</label><input id="fLand" type="number" min="0" placeholder="ไม่ระบุ"></div>
<div class="f"><label for="fSort">เรียงตาม</label><select id="fSort"><option value="pa">ราคาน้อยไปมาก</option><option value="pd">ราคามากไปน้อย</option><option value="aa">ขนาดเล็กไปใหญ่</option><option value="ad">ขนาดใหญ่ไปเล็ก</option></select></div></form>
<p class="meta" id="count" aria-live="polite"></p><div class="cards" id="list"></div></div>`, init() {
    const draw = () => {
      const st = $('fStyle').value, fl = $('fFloor').value, bu = Number($('fBudget').value) || Infinity, la = Number($('fLand').value) || Infinity, so = $('fSort').value;
      const r = DESIGNS.filter(d => (!st || d.style === st) && (!fl || d.floors === Number(fl)) && d.price <= bu && d.land <= la);
      r.sort((a, b) => so === 'pa' ? a.price - b.price : so === 'pd' ? b.price - a.price : so === 'aa' ? a.area - b.area : b.area - a.area);
      $('count').textContent = 'พบ ' + r.length + ' แบบ';
      $('list').innerHTML = r.map(designCard).join('') || '<p>ยังไม่มีแบบที่ตรงเงื่อนไข ลองเพิ่มงบ หรือ<a href="#custom">ให้สถาปนิกออกแบบตามความต้องการของคุณ</a></p>';
    };
    $('fl').addEventListener('input', draw); $('fl').addEventListener('change', draw); draw();
  }
});

P.custom = () => ({ nav: 'designs', t: 'ออกแบบตามความต้องการ', html: `${head('แบบบ้าน', 'เลือกแบบบ้านที่ใช่', 'เลือกจากแบบสำเร็จรูป หรือให้สถาปนิกออกแบบตามความต้องการและงบของคุณ')}${designTabs('custom')}
<div class="w sec"><div class="opts">${opt('แบบสำเร็จรูป', 'เลือกจากแบบที่มี ปรับเล็กน้อยได้ เห็นราคาเร็ว')}${opt('ออกแบบตามความต้องการ', 'สถาปนิกออกแบบใหม่ตามความต้องการ งบ และที่ดินของคุณ')}${opt('ค่าจองแบบ (ออกแบบตามความต้องการ)', '30,000–40,000 บาท')}</div>
<div class="split" style="margin-top:24px"><form class="panel" id="cf" data-demo><fieldset><legend>งบและที่ดิน</legend><div class="two"><div class="f"><label for="cBud">งบค่าก่อสร้าง (บาท)</label><input id="cBud" type="number" min="500000" step="100000" value="4000000"></div><div class="f"><label for="cLand">ที่ดินที่มี (ตร.ว.)</label><input id="cLand" type="number" min="0" placeholder="ไม่ระบุ"></div></div></fieldset><hr>
<fieldset><legend>บ้านที่อยากได้</legend><div class="two"><div class="f"><label for="cSty">สไตล์</label><select id="cSty"><option value="">ยังไม่แน่ใจ</option><option>คลาสสิก</option><option>โมเดิร์น</option><option>มินิมอล</option></select></div><div class="f"><label for="cFl">จำนวนชั้น</label><select id="cFl"><option value="">ยังไม่แน่ใจ</option><option value="1">ชั้นเดียว</option><option value="2">2 ชั้น</option><option value="3">3 ชั้น</option></select></div><div class="f"><label for="cBed">ห้องนอน</label><input id="cBed" type="number" min="1" max="10" value="3"></div><div class="f"><label for="cBath">ห้องน้ำ</label><input id="cBath" type="number" min="1" max="10" value="2"></div></div>
<div class="f"><span class="lbl">สิ่งที่อยากได้ (เลือกได้หลายข้อ)</span>${['ห้องนอนชั้นล่างสำหรับผู้สูงอายุ', 'ห้องพระ', 'ครัวไทยแยกจากครัวฝรั่ง', 'ห้องทำงาน', 'ที่จอดรถ 2 คันขึ้นไป', 'สระว่ายน้ำ', 'ดูฮวงจุ้ยและทิศ'].map((t, i) => `<div class="chk"><label><input type="checkbox" name="cNeed" value="${t}"> ${t}</label></div>`).join('')}</div>
<div class="f"><label for="cMore">เล่าเพิ่มเติม</label><textarea id="cMore" rows="3" placeholder="เช่น อยู่กัน 5 คน มีพ่อแม่สูงอายุ อยากได้บ้านไม่ร้อน"></textarea></div></fieldset><hr>
<div class="two"><div class="f"><label for="cName">ชื่อเล่น</label><input id="cName" autocomplete="given-name"></div><div class="f"><label for="cTel">เบอร์โทร</label><input id="cTel" type="tel" autocomplete="tel"></div></div>${consent('cOk')}
<button class="btn" type="submit">ส่งความต้องการให้สถาปนิก</button>${sent()}</form>
<section class="res" aria-live="polite"><div class="sum"><p class="msg" id="cMsg"></p><div class="nums"><div><div class="k">พื้นที่ใช้สอยที่งบนี้สร้างได้ (Premium)</div><div class="v" id="cAreaP"></div></div><div><div class="k">ถ้าเลือก Elite</div><div class="v" id="cAreaE"></div></div><div><div class="k">ผ่อนต่อเดือนโดยประมาณ</div><div class="v" id="cPay"></div></div></div></div>
<h2 style="font-size:22px">ตัวอย่างบ้านในงบใกล้เคียง</h2><p class="fine">ใช้เป็นภาพตั้งต้นคุยกับสถาปนิกได้ แบบจริงจะออกแบบใหม่ให้เข้ากับความต้องการและที่ดินของคุณ</p><div class="cards" id="cEx"></div>
<p class="fine">อัตราต่อ ตร.ม. เป็นตัวอย่าง (Premium 18,000 · Elite 23,000 บาท) คิดผ่อนจากวงเงิน 90% ดอกเบี้ย 6% 30 ปี · ค่าจองแบบตามหนังสือจองแบบ</p></section></div></div>
<div class="band"><div class="w sec"><h2>ออกแบบตามความต้องการ ทำอย่างไร</h2><ol class="proc">${[['บอกความต้องการและงบ', 'กรอกฟอร์มนี้ หรือนัดคุยกับสถาปนิก', 'ฟรี'], ['สำรวจที่ดิน', 'ทีมดูขนาด ทิศ แสง ลม', 'ฟรี'], ['จองแบบ', 'ชำระค่าจองแบบ', '30,000–40,000 บาท'], ['ออกแบบและแก้แบบ', 'ตรวจผังและภาพ 3D ปรับจนพอใจ', 'ตามสิทธิ์แก้แบบในหนังสือจอง'], ['สรุปราคาและเซ็นสัญญา', 'ยืนยันแบบ สเปค และงวดเงิน', 'ตามงวดในสัญญา']].map(([t, a, b]) => `<li><div><b>${t}</b><dl><div><dt>คุณต้องทำ: </dt><dd>${a}</dd></div><div><dt>เรื่องเงิน: </dt><dd>${b}</dd></div></dl></div></li>`).join('')}</ol><div><a class="btn" href="#contact">นัดคุยกับสถาปนิกฟรี</a></div></div></div>`, init() {
    const draw = () => {
      const bud = num('cBud'), land = Number($('cLand').value) || Infinity;
      $('cAreaP').textContent = fmt(Math.floor(bud / 18000)) + ' ตร.ม.'; $('cAreaE').textContent = fmt(Math.floor(bud / 23000)) + ' ตร.ม.';
      $('cPay').textContent = fmt(up100(monthly(bud * 0.9, 6, 30))) + ' บาท';
      $('cMsg').innerHTML = `งบ <b>${mil(bud)} ล้านบาท</b> สร้างบ้านได้ประมาณ <b>${fmt(Math.floor(bud / 23000))}–${fmt(Math.floor(bud / 18000))} ตร.ม.</b> ขึ้นกับสเปคที่เลือก`;
      const st = $('cSty').value, fl = Number($('cFl').value);
      const ex = DESIGNS.filter(d => d.land <= land).map(d => ({ d, s: Math.abs(d.price - bud) / bud + (st && d.style !== st ? 0.3 : 0) + (fl && d.floors !== fl ? 0.2 : 0) })).sort((a, b) => a.s - b.s).slice(0, 3);
      $('cEx').innerHTML = ex.map(x => designCard(x.d)).join('') || '<p>ยังไม่มีตัวอย่างที่ลงที่ดินขนาดนี้ได้ สถาปนิกออกแบบให้พอดีที่ดินได้</p>';
    };
    $('cf').addEventListener('input', draw); $('cf').addEventListener('change', draw); draw();
  }
});

P.design = id => {
  const d = byId(id); if (!d) return P.designs();
  return { nav: 'designs', t: d.name, html: `${head('<a href="#designs">แบบบ้าน</a> › ' + d.style, d.name, d.desc)}
<div class="w sec" style="padding-top:10px"><img class="bigimg" src="${wx(d.imgs[0], 1200, 720)}" alt="${d.name}">
<div class="facts"><div><b>${floorText(d)}</b><span>จำนวนชั้น</span></div><div><b>${d.area} ตร.ม.</b><span>พื้นที่ใช้สอย (ตัวอย่าง)</span></div><div><b>${d.land} ตร.ว.</b><span>ที่ดินขั้นต่ำ (ตัวอย่าง)</span></div><div><b>${mil(d.price)} ล้านบาท</b><span>ราคาประมาณ (ตัวอย่าง)</span></div><div><b>${fmt(up100(monthly(d.price * 0.9, 6, 30)))}</b><span>ผ่อนต่อเดือนโดยประมาณ</span></div></div>
<div class="gal">${d.imgs.slice(1).map(x => `<img loading="lazy" src="${wx(x, 640, 480)}" alt="${d.name}">`).join('')}</div>
<div class="row"><a class="btn" href="#estimate/${d.id}">อยากได้แบบนี้ ประเมินราคาให้หน่อย</a><a class="btn line" href="#loan/${d.id}">เช็กว่าผ่อนไหวไหม</a></div></div>` };
};

const workList = (crumb, title, lead, tab, list, pick) => ({ nav: 'works', t: title, html: `${head('ผลงาน', title, lead)}${workTabs(tab)}<div class="w sec"><div class="cards">${list.map(pick).join('')}</div></div>` });
P.works = () => workList('', 'ผลงานสร้างจริง', 'บ้านที่ส่งมอบแล้วและบ้านที่กำลังสร้าง พร้อมผลตรวจงานระหว่างทาง', 'works', WORKS, workCard);
P['works-live'] = () => workList('', 'บ้านที่กำลังสร้าง', 'ดูงานจริงจากหน้างาน ไม่แสดงชื่อเจ้าของและบ้านเลขที่', 'works-live', WORKS.filter(h => h.status === 'live'), workCard);
P['works-3d'] = () => workList('', 'ผลงานออกแบบ', 'ภาพ 3D ที่เจ้าของบ้านเห็นก่อนเริ่มก่อสร้าง', 'works-3d', WORKS, h => `<a class="hcard" href="#work/${h.id}"><img loading="lazy" src="${L(h.r3d)}" alt="ภาพ 3D ${h.name}"><div class="b"><h3>${h.name}</h3><div class="meta">${h.type}</div></div></a>`);
P.work = id => {
  const h = WORKS.find(x => x.id === Number(id)); if (!h) return P.works();
  const realLabel = h.status === 'live' ? 'หน้างานจริง' : 'บ้านจริง';
  return { nav: 'works', t: h.name, html: `${head('<a href="#works">ผลงาน</a>', h.name, 'ราชบุรี · ' + h.type + (h.area ? ' · ' + h.area : ''))}
<div class="w sec" style="padding-top:10px"><div class="cmp"><div class="tabs"><button type="button" id="tReal" class="on">${realLabel}</button><button type="button" id="t3d">ภาพ 3D</button></div><img class="bigimg" id="cmpImg" src="${L(h.img)}" alt="${h.name}"></div>
${h.quote ? `<div><p class="quote">“${h.quote}”</p><p class="who">${h.who}</p></div>` : ''}
<h2>รูป${realLabel}</h2><div class="gal">${h.gal.map(g => `<img loading="lazy" src="${L(g)}" alt="${h.name}">`).join('')}</div>
<h2>เส้นทางการสร้าง</h2><p class="fine">ไทม์ไลน์นี้เป็นตัวอย่าง ระบบจริงจะดึงจากรูปหน้างานและผลตรวจงาน</p>
<ol class="tl">${h.tl.map(([d, t, n, q]) => `<li class="${q === 'fix' ? 'short' : ''}"><div class="d">${d}</div><div class="dot"></div><div class="b"><div class="t">${t}</div>${n ? `<div class="n">${n}</div>` : ''}<span class="chip ${q === 'fix' ? 'no' : ''}">${q === 'fix' ? 'พบจุดแก้ แก้แล้ว' : 'ตรวจงานผ่าน'}</span></div><div class="a"></div></li>`).join('')}</ol>
<div class="panel"><h3>จุดเด่นของหลังนี้</h3><ul style="margin:0;padding-left:20px">${h.spec.map(s => `<li>${s}</li>`).join('')}</ul></div>
<div><a class="btn" href="#estimate">อยากได้บ้านแบบนี้ ประเมินราคาฟรี</a></div></div>`, init() {
      const set = r => { $('cmpImg').src = L(r ? h.img : h.r3d); $('tReal').classList.toggle('on', r); $('t3d').classList.toggle('on', !r); };
      $('tReal').onclick = () => set(true); $('t3d').onclick = () => set(false);
    } };
};

P.reviews = () => ({ nav: 'reviews', t: 'รีวิว', html: `${head('รีวิว', 'เสียงจากเจ้าของบ้าน', 'ทุกรีวิวคือความไว้วางใจที่ลูกค้ามอบให้เรา')}
<div class="w sec" style="padding-top:8px"><div class="reviews">${WORKS.filter(h => h.quote).map(h => `<article class="review"><img loading="lazy" src="${L(h.img)}" alt="${h.name}"><div><p class="quote">“${h.quote}”</p><p class="who">${h.who}</p></div></article>`).join('')}</div>
<p class="fine">ก่อนเปิดใช้จริงต้องยืนยันข้อความและขออนุญาตเจ้าของบ้านทุกท่าน</p>
<div><a class="link" href="https://www.facebook.com/ppsd195/reels/" target="_blank" rel="noopener">ดูคลิปรีวิวบน Facebook</a></div></div>` });

P.loan = id => {
  const d = byId(id) || byId(7);
  return { nav: 'finance', t: 'ประเมินสินเชื่อบ้าน', html: `${head('สินเชื่อและการเงิน', 'บ้านหลังนี้ ผ่อนไหวไหม', 'กรอกตัวเลขของคุณ แล้วเทียบวงเงินที่กู้ไหวกับบ้านที่เลือกได้ทันที')}${finTabs('loan')}
<div class="w sec"><div class="split"><form class="panel" id="lf" onsubmit="return false"><div class="f"><label for="lD">แบบบ้าน</label><select id="lD">${designOpts(d.id)}</select></div>
<div class="two"><div class="f"><label for="lInc">รายได้ต่อเดือน</label><input id="lInc" type="number" min="0" step="1000" value="50000"></div><div class="f"><label for="lDebt">ภาระหนี้ต่อเดือน</label><input id="lDebt" type="number" min="0" step="500" value="5000"></div>
<div class="f"><label for="lAge">อายุ (ปี)</label><input id="lAge" type="number" min="18" max="69" value="35"></div><div class="f"><label for="lDown">เงินดาวน์</label><input id="lDown" type="number" min="0" step="10000" value="500000"></div>
<div class="f"><label for="lCo">รายได้ผู้กู้ร่วม</label><input id="lCo" type="number" min="0" step="1000" value="0"></div><div class="f"><label for="lRate">ดอกเบี้ย (%)</label><input id="lRate" type="number" min="0" step="0.25" value="6"></div></div>
<p class="fine">คำนวณบนเครื่องของคุณ รายได้และหนี้จะไม่ถูกส่งให้บริษัท จนกว่าคุณจะกดส่งและยินยอมเอง</p></form>
<section class="res" aria-live="polite"><div class="sum"><p class="msg" id="lMsg"></p><div class="nums"><div><div class="k">ยอดผ่อนของบ้านนี้</div><div class="v" id="lPay"></div></div><div><div class="k">ยอดที่ผ่อนไหว</div><div class="v" id="lCan"></div></div><div><div class="k">วงเงินที่ต้องกู้</div><div class="v" id="lNeed"></div></div><div><div class="k">วงเงินที่กู้ไหว</div><div class="v" id="lMax"></div></div></div></div>
<div id="lOpts"></div><a class="btn block" href="#contact">ให้ทีมช่วยประเมินกับธนาคาร</a><p class="fine">เป็นการประมาณเบื้องต้น ไม่ใช่ผลอนุมัติสินเชื่อ เกณฑ์ที่ใช้เป็นตัวอย่างและต้องตรวจกับธนาคารก่อนใช้จริง</p></section></div></div>`, init() {
      const draw = () => {
        const a = afford({ price: byId($('lD').value).price, income: num('lInc'), debt: num('lDebt'), co: num('lCo'), age: num('lAge'), down: num('lDown'), rate: num('lRate') });
        $('lPay').textContent = fmt(up100(a.pay)) + ' บาท'; $('lCan').textContent = fmt(a.canPay) + ' บาท'; $('lNeed').textContent = fmt(a.need) + ' บาท'; $('lMax').textContent = fmt(a.maxLoan) + ' บาท';
        const over = a.payGap > 0;
        $('lMsg').innerHTML = over ? `ยอดผ่อนสูงกว่าที่ประเมินไว้ประมาณ <b>${fmt(up100(a.payGap))} บาทต่อเดือน</b> ลองปรับแบบนี้ได้` : `<b>ผ่อนบ้านหลังนี้ได้</b> ตามตัวเลขที่กรอก ผ่อนได้สูงสุด ${a.yrs} ปี`;
        $('lOpts').innerHTML = over ? `<div class="opts">${opt('เพิ่มเงินดาวน์อีก', fmt(a.addDown) + ' บาท')}${opt('หรือเลือกบ้านราคาไม่เกิน', fmt(a.lowerPrice) + ' บาท')}${opt('หรือรายได้รวมกับผู้กู้ร่วมถึง', fmt(up100(a.incomeNeed)) + ' บาท')}</div>` : '';
      };
      $('lf').addEventListener('input', draw); $('lf').addEventListener('change', draw); draw();
    } };
};

P.plan = id => {
  const d = byId(id) || byId(7); let last, lastI; const MAX = 96;
  return { nav: 'finance', t: 'วางแผนการเงิน', html: `${head('สินเชื่อและการเงิน', 'ต้องเตรียมเงินเท่าไร เมื่อไร', 'เลือกบ้านและวันที่อยากเข้าอยู่ แล้วดูว่าแต่ละช่วงต้องใช้เงินเท่าไร เงินที่มีพอหรือยัง')}${finTabs('plan')}
<div class="w sec"><div class="split"><form class="panel" id="pf" onsubmit="return false"><fieldset><legend>บ้านที่อยากสร้าง</legend><div class="f"><label for="pD">แบบบ้าน</label><select id="pD">${designOpts(d.id)}</select></div><div class="f"><label for="pM">อยากเข้าอยู่</label><select id="pM"></select></div></fieldset><hr>
<fieldset><legend>เงินของคุณ</legend><div class="two"><div class="f"><label for="pC">มีเงินตอนนี้ (บาท)</label><input id="pC" type="number" min="0" step="10000" value="500000"></div><div class="f"><label for="pS">ออมได้ต่อเดือน (บาท)</label><input id="pS" type="number" min="0" step="1000" value="30000"></div></div></fieldset><hr>
<fieldset><legend>ค่าใช้จ่ายนอกค่าก่อสร้าง</legend><div class="chk"><label><input id="x1" type="checkbox" checked> ถมดิน</label><span>150,000</span></div><div class="chk"><label><input id="x2" type="checkbox" checked> รั้ว</label><span>200,000</span></div><div class="chk"><label><input id="x3" type="checkbox" checked> ขอน้ำ ไฟ และใบอนุญาต</label><span>50,000</span></div></fieldset><hr>
<fieldset><legend>เงื่อนไขสินเชื่อ</legend><div class="three"><div class="f"><label for="pL">กู้ได้ (%)</label><input id="pL" type="number" min="0" max="100" step="5" value="90"></div><div class="f"><label for="pR">ดอกเบี้ย (%)</label><input id="pR" type="number" min="0" step="0.25" value="6"></div><div class="f"><label for="pY">ผ่อน (ปี)</label><input id="pY" type="number" min="1" max="40" value="30"></div></div></fieldset>
<p class="fine">คำนวณบนเครื่องของคุณ ข้อมูลจะไม่ถูกส่งให้บริษัท จนกว่าคุณจะกดส่งและยินยอมเอง</p></form>
<section class="res" aria-live="polite"><div class="sum"><p class="msg" id="msg"></p><div class="nums"><div><div class="k">เงินสดที่ต้องเตรียมสูงสุด</div><div class="v" id="peak"></div></div><div><div class="k">ผ่อนหลังรับบ้าน ต่อเดือน</div><div class="v" id="pmt"></div></div></div></div>
<h2 style="font-size:20px">เส้นทางเงินของบ้านหลังนี้</h2><ol class="tl" id="tl"></ol>
<div id="optW" hidden><h2 style="font-size:20px;margin-bottom:10px">ปรับแผนให้เงินพอ</h2><div class="opts"><div class="opt"><div class="k">ออมเพิ่มเป็น</div><div class="v" id="o1"></div><button type="button" class="btn line" id="b1">ลองใช้ตัวเลขนี้</button></div><div class="opt"><div class="k">หรือเลื่อนเข้าอยู่เป็น</div><div class="v" id="o2"></div><button type="button" class="btn line" id="b2">ลองใช้วันนี้</button></div></div></div>
<a class="btn block" href="#contact">ให้ทีมช่วยวางแผนการเงิน</a><p class="fine">เป็นการประมาณเบื้องต้น ค่าสมมติ: เงินจองแบบ 50,000 บาท ออกแบบ 3 เดือน ก่อสร้าง 8 เดือน เงินสำรอง 4% ของราคาบ้าน ไม่ใช่ผลอนุมัติสินเชื่อ</p></section></div></div>`, init() {
      for (let m = 12; m <= MAX; m++) { const o = document.createElement('option'); o.value = m; o.textContent = monthLabel(m) + ' (อีก ' + m + ' เดือน)'; if (m === 24) o.selected = true; $('pM').appendChild(o); }
      const draw = () => {
        const i = { price: byId($('pD').value).price, moveIn: num('pM'), cash: num('pC'), save: num('pS'), extras: ($('x1').checked ? 150000 : 0) + ($('x2').checked ? 200000 : 0) + ($('x3').checked ? 50000 : 0), ltv: Math.min(100, num('pL')), rate: num('pR'), yrs: Math.min(40, num('pY')) || 1 };
        const p = cashPlan(i); last = p; lastI = i;
        $('peak').textContent = fmt(p.peak) + ' บาท'; $('pmt').textContent = 'ประมาณ ' + fmt(up100(p.payment)) + ' บาท';
        $('msg').innerHTML = p.short > 0 ? `ตามแผนนี้ เงินยังขาดประมาณ <b>${fmt(p.short)} บาท</b> ช่วง ${monthLabel(p.shortM)}` : 'ตามแผนนี้ <b>เงินเพียงพอ</b> ในทุกช่วงก่อนรับบ้าน';
        const rows = p.pays.map(e => `<li class="${e.gap > 0 ? 'short' : ''}"><div class="d">${monthLabel(e.m)}</div><div class="dot"></div><div class="b"><div class="t">${e.t}</div><div class="n">${e.n}</div>${e.gap > 0 ? `<span class="chip no">ยังขาด ${fmt(e.gap)}</span>` : '<span class="chip">เงินพอ</span>'}</div><div class="a">${fmt(e.a)}</div></li>`);
        rows.push(`<li class="end"><div class="d">${monthLabel(i.moveIn)}</div><div class="dot"></div><div class="b"><div class="t">รับบ้าน</div><div class="n">ลูกค้าเซ็นใบส่งมอบ</div></div><div class="a"></div></li>`);
        rows.push(`<li class="end"><div class="d">${monthLabel(i.moveIn + 1)}</div><div class="dot"></div><div class="b"><div class="t">เริ่มผ่อนเต็มยอด</div><div class="n">วงเงินกู้ ${fmt(p.loan)} บาท · ${i.yrs} ปี</div></div><div class="a">${fmt(up100(p.payment))} /เดือน</div></li>`);
        $('tl').innerHTML = rows.join('');
        $('optW').hidden = !(p.short > 0);
        if (p.short > 0) { $('o1').textContent = 'เดือนละ ' + fmt(p.needSave) + ' บาท'; const can = p.delay !== null && i.moveIn + p.delay <= MAX; $('o2').textContent = can ? monthLabel(i.moveIn + p.delay) + ' (ช้าลง ' + p.delay + ' เดือน)' : 'ต้องเริ่มออมก่อน จึงจะคำนวณได้'; $('b2').hidden = !can; }
      };
      $('pf').addEventListener('input', draw); $('pf').addEventListener('change', draw);
      $('b1').onclick = () => { $('pS').value = last.needSave; draw(); };
      $('b2').onclick = () => { $('pM').value = lastI.moveIn + last.delay; draw(); };
      draw();
    } };
};

const EXTRAS = [['ถมดิน', 150000, 'แล้วแต่หน้างาน'], ['รั้ว', 200000, 'เลือกเพิ่มได้'], ['ขอน้ำและไฟ', 30000, 'ลูกค้าจ่ายเอง'], ['ค่าขออนุญาตก่อสร้าง', 20000, 'แล้วแต่หน้างาน'], ['ชุดพิธี', 35000, 'เลือกเพิ่มได้']];
P.budget = () => ({ nav: 'finance', t: 'งบรวมทั้งโครงการ', html: `${head('สินเชื่อและการเงิน', 'งบรวมทั้งโครงการ', 'รวมค่าก่อสร้างกับค่าใช้จ่ายที่มักนึกไม่ถึง เพื่อไม่ให้งบบานปลาย')}${finTabs('budget')}
<div class="w sec"><div class="split"><form class="panel" id="bf" onsubmit="return false"><div class="f"><label for="bD">แบบบ้าน</label><select id="bD">${designOpts(7)}</select></div><div class="f"><label for="bLand">ค่าที่ดิน ถ้ายังไม่มี (บาท)</label><input id="bLand" type="number" min="0" step="50000" value="0"></div><fieldset><legend>รายการเพิ่มเติม (ราคาตัวอย่าง)</legend>${EXTRAS.map((e, i) => `<div class="chk"><label><input id="e${i}" type="checkbox" checked> ${e[0]}</label><span>${fmt(e[1])}</span></div>`).join('')}</fieldset></form>
<section class="res" aria-live="polite"><div class="sum"><p class="msg">งบรวมโดยประมาณ <b id="bTot"></b></p></div><div class="scroll"><table><thead><tr><th>รายการ</th><th>ใครจ่าย</th><th class="n">บาท</th></tr></thead><tbody id="bRows"></tbody></table></div><a class="btn block" href="#plan">วางแผนการเงินจากงบนี้</a><p class="fine">ตัวเลขประมาณจนกว่าจะสำรวจที่ดิน</p></section></div></div>`, init() {
    const draw = () => {
      const d = byId($('bD').value); let tot = d.price + num('bLand');
      let rows = `<tr><td>ค่าก่อสร้าง ${d.name}</td><td>รวมในราคาบริษัท</td><td class="n">${fmt(d.price)}</td></tr>`;
      if (num('bLand')) rows += `<tr><td>ค่าที่ดิน</td><td>ลูกค้าจ่ายเอง</td><td class="n">${fmt(num('bLand'))}</td></tr>`;
      EXTRAS.forEach((e, i) => { if ($('e' + i).checked) { tot += e[1]; rows += `<tr><td>${e[0]}</td><td>${e[2]}</td><td class="n">${fmt(e[1])}</td></tr>`; } });
      $('bRows').innerHTML = rows; $('bTot').textContent = fmt(tot) + ' บาท';
    };
    $('bf').addEventListener('input', draw); $('bf').addEventListener('change', draw); draw();
  }
});

P.estimate = id => {
  const d = byId(id);
  return { nav: 'finance', t: 'ประเมินราคาฟรี', html: `${head('ประเมินราคา', 'ประเมินราคาบ้านฟรี', 'ตอบไม่ถึง 1 นาที เห็นช่วงราคาและยอดผ่อนทันที')}
<div class="w sec" style="padding-top:8px"><div class="split"><form class="panel" id="ef" data-demo><div class="f"><label for="eS">สไตล์บ้าน</label><select id="eS"><option>คลาสสิก</option><option>โมเดิร์น</option><option>มินิมอล</option></select></div><div class="two"><div class="f"><label for="eF">จำนวนชั้น</label><select id="eF"><option value="1">ชั้นเดียว</option><option value="2">2 ชั้น</option></select></div><div class="f"><label for="eA">พื้นที่ใช้สอย (ตร.ม.)</label><input id="eA" type="number" min="40" step="10" value="${d ? d.area : 200}"></div><div class="f"><label for="eP">แพ็กเกจ</label><select id="eP"><option value="18000">Premium</option><option value="23000">Elite</option></select></div><div class="f"><label for="eR">จังหวัด</label><select id="eR"><option value="1">ราชบุรี</option><option value="1.05">กาญจนบุรี</option><option value="1.05">เพชรบุรี</option><option value="1.05">นครปฐม</option><option value="1.1">กรุงเทพฯ และปริมณฑล</option></select></div></div><div class="f"><label for="eL">มีที่ดินแล้วหรือยัง</label><select id="eL"><option>มีแล้ว</option><option>กำลังหา</option></select></div><div class="f"><label for="eW">อยากเข้าอยู่เมื่อไหร่</label><select id="eW"><option>ภายใน 1 ปี</option><option>1–2 ปี</option><option>มากกว่า 2 ปี</option></select></div><hr><div class="two"><div class="f"><label for="eN">ชื่อเล่น</label><input id="eN" type="text" required></div><div class="f"><label for="eT">เบอร์โทร</label><input id="eT" type="tel" required></div></div>${consent('eC')}<button class="btn block">รับผลประเมินกับทีมงาน</button>${sent()}</form>
<section class="res" aria-live="polite"><div class="sum"><p class="msg">ช่วงราคาโดยประมาณ <b id="eRange"></b></p><div class="nums"><div><div class="k">ผ่อนต่อเดือนโดยประมาณ</div><div class="v" id="ePay"></div></div><div><div class="k">ควรเริ่มคุยแบบ</div><div class="v" id="eWhen"></div></div></div></div><p class="fine">อัตราต่อ ตร.ม. ในหน้านี้เป็นตัวอย่าง คิดผ่อนจากวงเงิน 90% ดอกเบี้ย 6% 30 ปี</p><a class="btn line block" href="#contact">นัดคุยกับสถาปนิกฟรี</a></section></div></div>`, init() {
      if (d) { $('eS').value = d.style; if (d.floors) $('eF').value = d.floors; }
      const draw = () => { const base = num('eA') * Number($('eP').value) * Number($('eR').value) * ($('eF').value === '2' ? 1.05 : 1); $('eRange').textContent = mil(base * 0.93) + '–' + mil(base * 1.07) + ' ล้านบาท'; $('ePay').textContent = fmt(up100(monthly(base * 0.9, 6, 30))) + ' บาท'; $('eWhen').textContent = { 'ภายใน 1 ปี': 'ทันที', '1–2 ปี': 'ภายใน 6 เดือน', 'มากกว่า 2 ปี': 'ภายใน 1 ปี' }[$('eW').value]; };
      $('ef').addEventListener('input', draw); $('ef').addEventListener('change', draw); draw();
    } };
};

P.land = () => ({ nav: 'designs', t: 'เช็กที่ดินเบื้องต้น', html: `${head('เช็กที่ดิน', 'ที่ดินของคุณ สร้างแบบไหนได้', 'กรอกขนาดที่ดินเพื่อดูแบบบ้านที่น่าจะลงได้')}
<div class="w sec" style="padding-top:8px"><div class="split"><form class="panel" id="lanf" data-demo><div class="f"><label for="laP">จังหวัด</label><select id="laP"><option>ราชบุรี</option><option>กาญจนบุรี</option><option>เพชรบุรี</option><option>นครปฐม</option><option>กรุงเทพฯ และปริมณฑล</option></select></div><div class="two"><div class="f"><label for="laA">ขนาดที่ดิน (ตร.ว.)</label><input id="laA" type="number" min="1" value="80"></div><div class="f"><label for="laD">ทิศหน้าที่ดิน</label><select id="laD"><option>เหนือ</option><option>ใต้</option><option>ตะวันออก</option><option>ตะวันตก</option><option>ยังไม่ทราบ</option></select></div></div><div class="f"><label for="laF">ถมแล้วหรือยัง</label><select id="laF"><option>ถมแล้ว</option><option>ยังไม่ถม</option><option>ไม่แน่ใจ</option></select></div><hr><div class="two"><div class="f"><label for="laN">ชื่อเล่น</label><input id="laN" type="text" required></div><div class="f"><label for="laT">เบอร์โทร</label><input id="laT" type="tel" required></div></div>${consent('laC')}<button class="btn block">นัดสำรวจที่ดินฟรี</button>${sent()}</form>
<section class="res"><h2 style="font-size:20px" id="laCount" aria-live="polite"></h2><div class="cards" id="laList"></div><p class="fine">เป็นการดูเบื้องต้น ต้องให้ทีมสำรวจยืนยัน รวมถึงระยะร่น ทางเข้า และตำแหน่งตามฮวงจุ้ย</p></section></div></div>`, init() {
    const draw = () => { const a = num('laA'), r = DESIGNS.filter(d => d.land <= a); $('laCount').textContent = 'แบบที่น่าจะลงได้ ' + r.length + ' แบบ'; $('laList').innerHTML = r.slice(0, 6).map(designCard).join(''); };
    $('lanf').addEventListener('input', draw); draw();
  }
});

P.why = () => ({ nav: 'home', t: 'ทำไมต้อง PPSD', html: `${head('รู้จัก PPSD', 'ทำไมต้องสร้างบ้านกับ PPSD')}
<div class="w sec" style="padding-top:8px">${[['ออกแบบอิงฮวงจุ้ย', 'วางผังให้เหมาะกับทิศ แสง ลม และบริบทของที่ดิน ดูตำแหน่งเจ้าบ้าน เตาไฟ และประตู', 'h1-3d'], ['บ้านโปร่ง โล่ง สบาย', 'ลดความร้อนสะสมด้วยการวางทิศและช่องระบายอากาศรอบหลังคา', 'h2-b'], ['เห็นบ้านก่อนสร้างจริง', 'ภาพ 3D จำลองสัดส่วน แสง ทิศทางลม และวัสดุ เพื่อให้ตัดสินใจแม่นยำตั้งแต่ต้นทาง', 'h2-3d'], ['จ่ายตามงานจริง ตรวจสอบได้', 'งานเสร็จแต่ละขั้นจึงเบิกเงิน เห็นรูปหน้างานและผลตรวจทุกครั้ง ส่งช้าบริษัทจ่ายวันละ 1,000 บาท', 'h3-b'], ['สมุดบ้านดิจิทัล', 'เก็บรูปงานในผนัง สเปควัสดุ แบบ สัญญา และประวัติซ่อม ติดตัวบ้านตลอดอายุ', 'h5-b']].map(([t, b, i]) => `<article class="review"><img loading="lazy" src="${L(i)}" alt="${t}"><div class="stack"><h2>${t}</h2><p class="lead">${b}</p></div></article>`).join('')}<div><a class="btn" href="#estimate">ประเมินราคาบ้านฟรี</a></div></div>` });

P.spec = () => ({ nav: 'home', t: 'สเปคและวัสดุ', html: `${head('รู้จัก PPSD', 'สเปคและวัสดุ', 'เทียบ Premium กับ Elite พร้อมเหตุผลที่เราเลือกใช้')}
<div class="w sec" style="padding-top:8px"><div class="scroll"><table><thead><tr><th>รายการ</th><th>Premium</th><th>Elite</th></tr></thead><tbody><tr><td>แก้แบบ</td><td>2 ครั้ง</td><td>4 ครั้ง</td></tr><tr><td>ฝ้าเพดาน</td><td>รอตารางจริง</td><td>สูง 2.8 ม.</td></tr><tr><td>วัสดุอีก 17 หมวด</td><td colspan="2">รอนำตารางวัสดุจริงเข้า</td></tr></tbody></table></div>
<h2>ทำไมเราใช้แบบนี้</h2><div class="why"><div><b>หลังคา PU</b><span>ช่วยกันความร้อนเข้าสู่ตัวบ้าน</span></div><div><b>ราวกัลวาไนซ์</b><span>ไม่เป็นสนิม ดูแลง่าย</span></div><div><b>กระเบื้อง 60×120</b><span>ร่องน้อย ทำความสะอาดง่าย</span></div></div>
<h2>รายการอัปเกรด</h2><div class="scroll"><table><thead><tr><th>รายการ</th><th class="n">ราคา (บาท)</th></tr></thead><tbody>${[['จุดไฟเพิ่ม', '1,700'], ['จุดแอร์เพิ่ม', '2,700'], ['ปั๊มน้ำ', '27,000'], ['ชุดพิธี', '15,000 / 35,000 / 50,000']].map(r => `<tr><td>${r[0]}</td><td class="n">${r[1]}</td></tr>`).join('')}</tbody></table></div><div><a class="btn" href="#estimate">ประเมินราคาตามแพ็กเกจ</a></div></div>` });

P.process = () => ({ nav: 'home', t: 'ขั้นตอนสร้างบ้าน', html: `${head('เริ่มสร้างบ้าน', 'ขั้นตอนสร้างบ้านกับ PPSD', 'รู้ล่วงหน้าว่าแต่ละขั้นคุณต้องทำอะไร และจ่ายเงินตอนไหน')}
<div class="w sec" style="padding-top:8px"><ol class="proc">${[['ทักมา', 'ทักผ่าน LINE เว็บ หรือโทร', 'ยังไม่ต้องจ่าย'], ['ประเมินราคา', 'เลือกสไตล์และขนาดบ้าน', 'ฟรี'], ['นัดคุยและสำรวจที่ดิน', 'เตรียมขนาดที่ดินและความต้องการ', 'ฟรี'], ['จองแบบ', 'ชำระมัดจำจองแบบ', 'มัดจำนับเป็นงวดแรก และหักเป็นค่าก่อสร้าง'], ['ออกแบบและแก้แบบ', 'ตรวจภาพ 3D และยืนยันวัสดุ', 'แก้แบบตามสิทธิ์ของแพ็กเกจ'], ['ยื่นกู้และขออนุญาต', 'เตรียมเอกสารตามรายการ', 'ทีมช่วยยื่นกู้ธนาคารให้ฟรี'], ['เซ็นสัญญา', 'ตรวจแบบ สเปค และงวดเงิน', 'ตามงวดในสัญญา'], ['ก่อสร้าง', 'ติดตามรูปและผลตรวจในบ้านของฉัน', 'จ่ายตามงวดหลังงานแต่ละขั้นเสร็จ'], ['ตรวจรับและเซ็นใบส่งมอบ', 'ตรวจบ้านร่วมกับทีม', 'งวดสุดท้าย'], ['ดูแลหลังส่งมอบ', 'แจ้งซ่อมและดูสมุดบ้านได้ตลอด', 'ตามเงื่อนไขรับประกัน']].map(([t, a, b]) => `<li><div><b>${t}</b><dl><div><dt>คุณต้องทำ: </dt><dd>${a}</dd></div><div><dt>เรื่องเงิน: </dt><dd>${b}</dd></div></dl></div></li>`).join('')}</ol><p class="fine">ระยะเวลาของแต่ละขั้นรอทีมยืนยัน</p><div><a class="btn" href="#contact">นัดคุยกับสถาปนิกฟรี</a></div></div>` });

const DOCS = [['จองแบบ', ['บัตรประชาชน', 'สำเนาโฉนดที่ดิน']], ['ยื่นกู้ พนักงานประจำ', ['บัตรประชาชนและทะเบียนบ้าน', 'หนังสือรับรองเงินเดือน', 'สลิปเงินเดือนล่าสุด', 'รายการเดินบัญชี 6 เดือน', 'สำเนาโฉนดที่ดิน']], ['ยื่นกู้ เจ้าของกิจการ', ['บัตรประชาชนและทะเบียนบ้าน', 'หนังสือจดทะเบียนธุรกิจ', 'รายการเดินบัญชี 6–12 เดือน', 'สำเนาโฉนดที่ดิน']], ['ขออนุญาตก่อสร้าง', ['สำเนาโฉนดที่ดิน', 'บัตรประชาชนเจ้าของที่ดิน', 'หนังสือยินยอม ถ้าใช้ที่ดินผู้อื่น']], ['เซ็นสัญญา', ['บัตรประชาชนผู้ทำสัญญา', 'ใบยืนยันแบบและวัสดุ']]];
P.documents = () => ({ nav: 'home', t: 'เอกสารที่ต้องเตรียม', html: `${head('เริ่มสร้างบ้าน', 'เอกสารที่ต้องเตรียม', 'ติ๊กรายการที่เตรียมแล้ว ระบบจะจำไว้ในเครื่องของคุณ')}
<div class="w sec" style="padding-top:8px"><div class="split even">${DOCS.map(([g, it], i) => `<div class="panel"><h3>${g}</h3><div>${it.map((x, j) => `<label class="check"><input type="checkbox" data-doc="${i}-${j}"><span>${x}</span></label>`).join('')}</div></div>`).join('')}</div><p class="fine">รายการนี้เป็นร่าง ต้องให้ฝ่ายขายและสินเชื่อยืนยันก่อนใช้จริง</p></div>`, init() {
    const s = store.get('ppsdDocs', {});
    document.querySelectorAll('[data-doc]').forEach(c => { c.checked = !!s[c.dataset.doc]; c.addEventListener('change', () => { s[c.dataset.doc] = c.checked; store.set('ppsdDocs', s); }); });
  }
});

P.faq = () => ({ nav: 'home', t: 'คำถามที่พบบ่อย', html: `${head('ช่วยเหลือ', 'คำถามที่พบบ่อย', 'พิมพ์ภาษาพูดได้ เช่น ไม่มีที่ดินสร้างได้มั้ย')}
<div class="w sec" style="padding-top:8px"><div class="f"><label for="fq">ค้นหาคำถาม</label><input id="fq" autocomplete="off"></div><div class="stack" id="fl2"></div></div>`, init() {
    const draw = () => { const q = $('fq').value.trim(); const r = FAQ.filter(f => !q || (f[0] + f[1] + f[2]).includes(q)); $('fl2').innerHTML = r.map(f => `<details><summary>${f[1]}</summary><div class="in"><p>${f[2]}</p><div><a class="link" href="#${f[3]}">${f[4]}</a></div></div></details>`).join('') || '<p>ยังไม่พบคำตอบ ลอง<a href="#contact">ติดต่อทีมงาน</a></p>'; };
    $('fq').addEventListener('input', draw); draw();
  }
});

P.about = () => ({ nav: 'home', t: 'เกี่ยวกับเรา', html: `${head('รู้จัก PPSD', 'เกี่ยวกับเรา', 'บริษัท พีพีเอสดี คอนสตรัคชั่น จำกัด รับสร้างบ้านอิงหลักฮวงจุ้ย ก่อตั้งปี 2557')}
<div class="w sec" style="padding-top:8px"><img class="bigimg" src="${L('h2-a')}" alt="ผลงาน PPSD"><div class="split even"><div class="panel"><h3>ผู้บริหาร</h3><p>คุณณัฐพล เทพวีระ · กรรมการผู้จัดการ</p><p>คุณลลดา เทพวีระ · รองกรรมการผู้จัดการ</p></div><div class="panel"><h3>สาขา</h3><p><b style="font-weight:500">ราชบุรี</b> 126 ม.9 ถ.เพชรเกษม ต.บ้านสิงห์ อ.โพธาราม จ.ราชบุรี 70120</p><p><b style="font-weight:500">กรุงเทพฯ</b> CDC รามอินทรา</p></div></div><div class="panel"><h3>เอกสารรับรอง</h3><p>หนังสือรับรองบริษัทและ ภ.พ.20 จะแสดงที่นี่เมื่อทีมเตรียมไฟล์แล้ว</p></div></div>` });

P.areas = () => ({ nav: 'home', t: 'พื้นที่ให้บริการ', html: `${head('รู้จัก PPSD', 'พื้นที่ให้บริการ')}
<div class="w sec" style="padding-top:8px"><div class="cards">${[['ราชบุรี', 'สำนักงานใหญ่ที่โพธาราม มีผลงานจริงให้นัดดู'], ['กาญจนบุรี', 'ดูแลจากทีมราชบุรี'], ['เพชรบุรี', 'ดูแลจากทีมราชบุรี'], ['นครปฐม', 'ดูแลจากทีมราชบุรี'], ['กรุงเทพฯ และปริมณฑล', 'สาขา CDC รามอินทรา']].map(([t, b]) => `<div class="panel"><h3>${t}</h3><p class="meta">${b}</p><a class="link" href="#estimate">ประเมินราคาในพื้นที่นี้</a></div>`).join('')}</div><p class="fine">ราคาต่อ ตร.ม. และผลงานแยกจังหวัดรอทีมเตรียมข้อมูล</p></div>` });

P.services = () => ({ nav: 'home', t: 'ต่อเติม บิ้วอิน รีโนเวท', html: `${head('บริการอื่น', 'ต่อเติม บิ้วอิน รีโนเวท', 'ส่งรูปบ้านและบอกสิ่งที่อยากปรับ ทีมจะติดต่อกลับเพื่อประเมิน')}
<div class="w sec" style="padding-top:8px"><div class="cards">${[['ต่อเติม', 'เพิ่มพื้นที่ใช้สอยให้เหมาะกับครอบครัว'], ['บิ้วอิน', 'ออกแบบเฟอร์นิเจอร์ให้พอดีกับพื้นที่'], ['รีโนเวท', 'ปรับบ้านเดิมให้โปร่งและใช้งานสะดวกขึ้น']].map(([t, b]) => `<div class="panel"><h3>${t}</h3><p class="meta">${b}</p></div>`).join('')}</div><form class="panel" data-demo style="max-width:560px"><div class="f"><label for="sD">งานที่ต้องการ</label><textarea id="sD" rows="3" required></textarea></div><div class="two"><div class="f"><label for="sN">ชื่อเล่น</label><input id="sN" type="text" required></div><div class="f"><label for="sT">เบอร์โทร</label><input id="sT" type="tel" required></div></div>${consent('sC')}<button class="btn">ขอประเมินงาน</button>${sent()}</form></div>` });

P.knowledge = () => ({ nav: 'home', t: 'ความรู้ก่อนสร้างบ้าน', html: `${head('ช่วยเหลือ', 'ต้องรู้ก่อนสร้างบ้าน')}
<div class="w sec" style="padding-top:8px"><div class="stack">${[['เตรียมเงินสร้างบ้านอย่างไร', 'นอกจากค่าก่อสร้าง ควรเผื่อเงินจอง เงินดาวน์ ค่าถมดิน รั้ว น้ำไฟ และเงินสำรองก่อนธนาคารเบิก', 'plan', 'วางแผนการเงิน'], ['เลือกวัสดุอย่างไรให้คุ้ม', 'ดูอายุการใช้งาน ความร้อน และการดูแลรักษา ไม่ดูแค่ราคาเริ่มต้น', 'spec', 'ดูสเปค'], ['ฮวงจุ้ยกับการวางผังบ้าน', 'เริ่มจากทิศหน้าที่ดิน แล้วดูตำแหน่งประตู เจ้าบ้าน และเตาไฟ ควบคู่กับแสงและลม', 'why', 'ดูแนวทางของเรา'], ['กันโดนทิ้งงานต้องดูอะไร', 'ดูผลงานจริง จ่ายเงินตามงานที่เสร็จ และมีเอกสารแบบกับสเปคชัดเจน', 'works-live', 'ดูบ้านที่กำลังสร้าง'], ['ก่อนปิดผนังควรถ่ายอะไร', 'ถ่ายท่อน้ำและสายไฟทุกผนัง เพื่อใช้ตอนเจาะหรือซ่อมในอนาคต', 'homebook', 'ดูสมุดบ้าน']].map(([t, b, h, l]) => `<details><summary>${t}</summary><div class="in"><p>${b}</p><div><a class="btn line" href="#${h}">${l}</a></div></div></details>`).join('')}</div></div>` });

P.privacy = () => ({ nav: '', t: 'นโยบายความเป็นส่วนตัว', html: `${head('ช่วยเหลือ', 'นโยบายความเป็นส่วนตัว', 'ร่างนี้ต้องให้ผู้บริหารและฝ่ายกฎหมายตรวจก่อนใช้จริง')}
<div class="w sec" style="padding-top:8px;max-width:800px"><div class="stack"><h3>ข้อมูลที่เก็บ</h3><p>ชื่อ เบอร์โทร และข้อมูลบ้านที่คุณกรอกในฟอร์ม เครื่องคำนวณรายได้และการเงินทำงานบนเครื่องของคุณ และไม่ส่งข้อมูลเข้าระบบหากคุณไม่กดส่ง</p><h3>ใช้ทำอะไร</h3><p>ติดต่อกลับ ประเมินราคา นัดหมาย และให้บริการหลังการขาย</p><h3>สิทธิ์ของคุณ</h3><p>ขอดู แก้ไข ลบข้อมูล หรือเลิกรับข่าวสารได้ โดยติดต่อ 089 999 2474</p><h3>ระยะเวลาการเก็บ</h3><p>รอผู้บริหารกำหนด</p><h3>คุกกี้และข้อมูลในเบราว์เซอร์</h3><p>คุกกี้ที่จำเป็นใช้จำการตั้งค่าคุกกี้และรายการเอกสารที่คุณติ๊กไว้ คุกกี้วิเคราะห์และการตลาดจะเปิดใช้เมื่อคุณยินยอมเท่านั้น เว็บนี้โหลดฟอนต์จาก Google และรูปบางส่วนจาก Wix ซึ่งผู้ให้บริการอาจเห็นหมายเลขเครือข่ายของคุณ</p><div><button type="button" class="btn line" data-cookie-settings>ตั้งค่าคุกกี้</button></div></div></div>` });

const STAGES = [['ฐานราก', 1], ['โครงสร้าง', 1], ['หลังคา', 1], ['ก่อผนัง ฉาบ', 0.4], ['งานระบบ', 0], ['ฝ้า พื้น กระเบื้อง', 0], ['สี สุขภัณฑ์', 0], ['ตรวจรับ', 0], ['ส่งมอบ', 0]];
const PAYS = [['งวด 1 จองแบบและเซ็นสัญญา', 550000, 1], ['งวด 2 ฐานราก', 800000, 1], ['งวด 3 โครงสร้างและหลังคา', 1100000, 1], ['งวด 4 ก่อผนัง ฉาบ', 1000000, 0], ['งวด 5 งานระบบและพื้น', 1100000, 0], ['งวด 6 ส่งมอบ', 950000, 0]];
P.myhome = () => ({ nav: 'myhome', t: 'บ้านของฉัน', html: `${head('สำหรับลูกค้า', 'บ้านของฉัน', 'ตัวอย่างหน้าที่เจ้าของบ้านเห็น เข้าผ่านลิงก์ส่วนตัวหรือเมนู LINE')}${homeTabs('myhome')}
<div class="w sec dash"><div class="sum"><p class="msg">บ้าน Modern Classic ชั้นเดียว · <b>สัปดาห์ที่ 9</b></p><div class="bar-w" role="img" aria-label="ความคืบหน้า 38 เปอร์เซ็นต์"><i style="width:38%"></i></div><div class="nums"><div><div class="k">ความคืบหน้า</div><div class="v">38%</div></div><div><div class="k">เทียบแผน</div><div class="v">ตรงแผน</div></div></div></div>
<div class="split even"><div class="panel"><h3>ขั้นงาน</h3><ol class="tl">${STAGES.map(([s, p]) => `<li class="${p === 1 ? '' : 'end'}"><div class="d">${p === 1 ? 'ตรวจผ่าน' : p ? 'กำลังทำ' : 'รอคิว'}</div><div class="dot"></div><div class="b"><div class="t">${s}</div></div><div class="a"></div></li>`).join('')}</ol></div>
<div class="panel"><h3>งวดเงิน</h3><div class="scroll"><table style="min-width:0"><tbody>${PAYS.map(([t, a, d]) => `<tr><td>${t}<br><span class="tag ${d ? 'ok' : ''}">${d ? 'จ่ายแล้ว ดูใบเสร็จ' : 'ยังไม่ถึงกำหนด'}</span></td><td class="n">${fmt(a)}</td></tr>`).join('')}</tbody></table></div><button type="button" class="btn line" data-note>ส่งสลิป</button>${sent('ในเว็บจริงลูกค้าแนบสลิปได้ แล้วฝ่ายบัญชียืนยันยอด')}</div></div>
<h2>รูปหน้างานล่าสุด</h2><div class="gal">${['h5-c', 'h5-b', 'h5-a'].map(g => `<img loading="lazy" src="${L(g)}" alt="รูปหน้างาน">`).join('')}</div>
<div class="split even"><div class="panel"><h3>ผลตรวจงาน</h3><p><span class="tag ok">ผ่าน</span> เสาเข็มและฐานราก</p><p><span class="tag ok">ผ่าน</span> โครงหลังคา</p><p><span class="tag warn">พบจุดแก้ · แก้แล้ว</span> แนวผนังด้านทิศใต้ พร้อมรูปก่อนและหลังแก้</p></div>
<div class="panel"><h3>เอกสารและสเปค</h3><p>สัญญา · แบบบ้าน · ใบอนุญาตก่อสร้าง · ใบเสร็จ</p><p>หลังคาทรงปั้นหยา โครงเหล็ก · อัปเกรดจุดไฟ 4 จุด</p><h3>ทีมผู้ดูแล</h3><p>เซลส์ · โฟร์แมน · สถาปนิก</p><a class="btn" href="#contact">นัดดูหน้างาน</a></div></div></div>` });

P.homebook = () => ({ nav: 'myhome', t: 'สมุดบ้านและแจ้งซ่อม', html: `${head('สำหรับลูกค้า', 'สมุดบ้านและแจ้งซ่อม', 'ข้อมูลบ้านทั้งหมดอยู่ที่นี่ตลอดอายุบ้าน')}${homeTabs('homebook')}
<div class="w sec dash"><div class="split"><form class="panel" data-demo><h3>แจ้งซ่อม</h3><div class="f"><label for="rT">อาการ</label><textarea id="rT" rows="3" required></textarea></div><div class="f"><label for="rF">แนบรูป</label><input id="rF" type="file" accept="image/*"></div><button class="btn block">แจ้งซ่อม</button>${sent()}</form>
<div class="panel"><h3>รับประกัน (ตัวอย่างบ้านที่ส่งมอบ 6 เดือน)</h3><div class="scroll"><table style="min-width:0"><tbody>${[['โครงสร้าง', '54 เดือน'], ['หลังคาและรั่วซึม', '6 เดือน'], ['ไฟฟ้าและประปา', '6 เดือน'], ['สีและฝ้า', '6 เดือน']].map(r => `<tr><td>${r[0]}</td><td class="n">เหลือ ${r[1]}</td></tr>`).join('')}</tbody></table></div><a class="link" href="#contact">นัดตรวจบ้าน 6 และ 12 เดือน</a></div></div>
<h2>ในสมุดบ้านมีอะไร</h2><div class="why">${[['รูปงานที่ปิดไปแล้ว', 'ท่อน้ำและสายไฟในผนัง พื้น และฝ้า'], ['สเปคบ้านของฉัน', 'ยี่ห้อ รุ่น สี และขนาดวัสดุทุกจุด'], ['แบบ สัญญา ใบอนุญาต', 'ใช้ต่อเติม ขอเลขที่บ้าน หรือขายบ้าน'], ['งวดเงินและใบเสร็จ', 'ใช้กับธนาคารและภาษี'], ['ผลตรวจงานทุกครั้ง', 'รวมจุดที่พบแล้วแก้ไข'], ['ประวัติแจ้งซ่อม', 'ดูว่าเคยซ่อมอะไร เมื่อไหร่']].map(([a, b]) => `<div><b>${a}</b><span>${b}</span></div>`).join('')}</div>
<div class="panel" style="max-width:520px"><h3>แนะนำเพื่อน</h3><p class="meta">รหัสแนะนำของคุณ (ตัวอย่าง)</p><p class="price" style="font-size:22px">REF-PPSD01</p></div></div>` });

P.offer = () => { const d = byId(7); return { nav: '', t: 'ข้อเสนอเฉพาะคุณ', html: `${head('ตัวอย่างลิงก์ที่เซลส์ส่งให้ลูกค้า', 'บ้านของครอบครัวคุณสมมติ', '“สร้างให้พ่อแม่อยู่สบาย”')}
<div class="w sec" style="padding-top:8px"><img class="bigimg" src="${wx(d.imgs[0], 1200, 720)}" alt="${d.name}"><div class="facts"><div><b>${d.name}</b><span>แบบที่เลือก</span></div><div><b>${d.area} ตร.ม.</b><span>พื้นที่ใช้สอย</span></div><div><b>Premium</b><span>แพ็กเกจ</span></div></div>
<div class="split even"><form class="panel" id="of" onsubmit="return false"><h3>อัปเกรดที่แนะนำ</h3>${[['จุดไฟเพิ่ม 4 จุด', 6800], ['จุดแอร์เพิ่ม 2 จุด', 5400], ['ปั๊มน้ำ', 27000], ['ชุดพิธี', 35000]].map((u, i) => `<div class="chk"><label><input data-up="${u[1]}" id="u${i}" type="checkbox"> ${u[0]}</label><span>${fmt(u[1])}</span></div>`).join('')}</form>
<div class="sum"><p class="msg">ราคารวม <b id="oTot"></b></p><div class="nums"><div><div class="k">ผ่อนต่อเดือนโดยประมาณ</div><div class="v" id="oPay"></div></div><div><div class="k">ราคานี้ใช้ได้ถึง</div><div class="v">${monthLabel(1)}</div></div></div></div></div>
<div class="row"><a class="btn" href="#contact">นัดสำรวจที่ดินฟรี</a></div><p class="fine">ลิงก์จริงใส่สเปคและราคาล่วงหน้าได้ แต่จะไม่ฝังรายได้ของลูกค้า</p></div>`, init() { const draw = () => { let t = d.price; document.querySelectorAll('[data-up]').forEach(c => { if (c.checked) t += Number(c.dataset.up); }); $('oTot').textContent = fmt(t) + ' บาท'; $('oPay').textContent = fmt(up100(monthly(t * 0.9, 6, 30))) + ' บาท'; }; $('of').addEventListener('change', draw); draw(); } }; };

P.contact = () => ({ nav: 'contact', t: 'ติดต่อเรา', html: `${head('ติดต่อเรา', 'คุยกับทีม PPSD', 'นัดคุยเรื่องบ้าน หรือเลือกช่องทางที่สะดวก')}
<div class="w sec" style="padding-top:8px"><div class="split"><form class="panel" data-demo><h2 style="font-size:22px">นัดคุยเพื่อติดต่องาน</h2><div class="two"><div class="f"><label for="cB">สาขา</label><select id="cB"><option>ราชบุรี</option><option>กรุงเทพฯ</option><option>ออนไลน์</option></select></div><div class="f"><label for="cW">หัวข้อ</label><select id="cW"><option>คุยแบบบ้าน</option><option>ดูที่ดิน</option><option>ปรึกษาสินเชื่อ</option><option>ดูบ้านจริง</option></select></div><div class="f"><label for="cD">วันที่</label><input id="cD" type="date" required></div><div class="f"><label for="cH">เวลา</label><select id="cH"><option>9:00</option><option>11:00</option><option>13:00</option><option>15:00</option><option>17:00</option></select></div><div class="f"><label for="cN">ชื่อเล่น</label><input id="cN" type="text" required></div><div class="f"><label for="cT">เบอร์โทร</label><input id="cT" type="tel" required></div></div>${consent('cC')}<button class="btn block">ยืนยันนัดหมาย</button>${sent()}</form>
<div class="stack"><div class="panel"><h2 style="font-size:22px">ช่องทางติดต่อ</h2><p><b style="font-weight:500">โทร</b> 089 999 2474</p><p><a href="https://page.line.me/tcm4774v" target="_blank" rel="noopener">LINE ศูนย์สร้างบ้าน PPSD</a></p><p><a href="https://www.facebook.com/ppsd195" target="_blank" rel="noopener">Facebook</a> · <a href="https://www.instagram.com/ppsd.home/" target="_blank" rel="noopener">Instagram</a> · <a href="https://www.youtube.com/channel/UCYndun07bzWZTo-ORw09fhQ/videos" target="_blank" rel="noopener">YouTube</a></p><p><b style="font-weight:500">อีเมล</b> ppsd.home@gmail.com</p><p><b style="font-weight:500">เวลาทำการ</b> จันทร์–เสาร์ 8:00–18:00 น. · อาทิตย์ตามนัดหมาย</p></div>
<div class="panel"><h3>สาขา</h3><p><b style="font-weight:500">ราชบุรี</b> 126 ม.9 ถ.เพชรเกษม ต.บ้านสิงห์ อ.โพธาราม จ.ราชบุรี 70120</p><a class="link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('126 ม.9 ถ.เพชรเกษม ตำบลบ้านสิงห์ อำเภอโพธาราม ราชบุรี')}" target="_blank" rel="noopener">เปิดแผนที่</a><p><b style="font-weight:500">กรุงเทพฯ</b> CDC รามอินทรา</p></div></div></div></div>` });

/* ---------- เส้นทางและฟอร์ม ---------- */
function route() {
  const [name, arg] = (location.hash.slice(1) || 'home').split('/');
  const page = (P[name] || P.home)(arg);
  const app = $('app');
  app.innerHTML = page.html;
  document.title = page.t + ' | PPSD บ้านดี ดวงดี';
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === page.nav));
  $('mainNav').classList.remove('open'); $('menuBtn').setAttribute('aria-expanded', 'false');
  document.querySelectorAll('[data-dock]').forEach(a => a.classList.toggle('on', a.dataset.dock.split(' ').includes(name)));
  document.querySelector('.top').classList.remove('hide');
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (page.init) page.init();
  app.focus({ preventScroll: true });
}
window.addEventListener('hashchange', route);
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.matches('[data-demo]')) { e.preventDefault(); const s = f.querySelector('[data-sent]'); if (s) s.hidden = false; }
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-note]');
  if (b) { const s = b.parentElement.querySelector('[data-sent]'); if (s) s.hidden = false; }
});
$('menuBtn').addEventListener('click', () => { const o = $('mainNav').classList.toggle('open'); $('menuBtn').setAttribute('aria-expanded', String(o)); });

/* แถบเมนูลอย: เลื่อนลงซ่อนเมนูบน เลื่อนขึ้นแสดง */
let lastY = window.scrollY;
window.addEventListener('scroll', () => {
  const y = window.scrollY, top = document.querySelector('.top');
  if ($('mainNav').classList.contains('open') || Math.abs(y - lastY) < 6) return;
  top.classList.toggle('hide', y > lastY && y > 160);
  lastY = y;
}, { passive: true });

/* ความยินยอมคุกกี้: สคริปต์วิเคราะห์หรือโฆษณาที่เพิ่มในอนาคตต้องเช็ก window.ppsdConsent ก่อนโหลด */
const CK = 'ppsdCookieConsent';
const consentNow = () => store.get(CK, null);
function saveConsent(analytics, marketing) {
  const c = { v: 1, analytics, marketing, at: new Date().toISOString() };
  store.set(CK, c); window.ppsdConsent = c;
  $('ckBar').hidden = true;
  if ($('ckDlg').open) $('ckDlg').close();
}
function openCookie() { const c = consentNow(); $('ckA').checked = !!(c && c.analytics); $('ckM').checked = !!(c && c.marketing); $('ckDlg').showModal(); }
window.ppsdConsent = consentNow();
$('ckBar').hidden = !!window.ppsdConsent;
$('ckYes').addEventListener('click', () => saveConsent(true, true));
$('ckNo').addEventListener('click', () => saveConsent(false, false));
$('ckSet').addEventListener('click', openCookie);
$('ckSave').addEventListener('click', () => saveConsent($('ckA').checked, $('ckM').checked));
$('ckCancel').addEventListener('click', () => $('ckDlg').close());
document.addEventListener('click', e => { if (e.target.closest('[data-cookie-settings]')) openCookie(); });

/* ผู้ช่วยตัวอย่าง: ค้นจากคำถามที่พบบ่อยเท่านั้น ไม่เดาคำตอบ */
const addMsg = (t, u) => { const p = document.createElement('p'); if (u) p.className = 'u'; p.textContent = t; $('chatLog').appendChild(p); $('chatLog').scrollTop = 1e6; };
$('chatBtn').addEventListener('click', () => { $('chat').hidden = false; $('chatBtn').hidden = true; if (!$('chatLog').children.length) addMsg('สวัสดีครับ ผมเป็นผู้ช่วยอัตโนมัติ ถามเรื่องราคา ขั้นตอน สินเชื่อ หรือรับประกันได้เลย'); $('chatQ').focus(); });
$('chatClose').addEventListener('click', () => { $('chat').hidden = true; $('chatBtn').hidden = false; });
$('chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const q = $('chatQ').value.trim(); if (!q) return;
  addMsg(q, true); $('chatQ').value = '';
  if (/คุยกับคน|เจ้าหน้าที่/.test(q)) return addMsg('รับทราบครับ ในเว็บจริงระบบจะส่งต่อให้เจ้าหน้าที่ทันที หรือโทร 089 999 2474');
  let best = null, score = 0;
  for (const f of FAQ) { const w = f[1] + f[0]; let s = 0; for (let i = 0; i < q.length - 1; i++) if (w.includes(q.slice(i, i + 2))) s++; if (s > score) { score = s; best = f; } }
  addMsg(best && score >= 3 ? best[2] : 'เรื่องนี้ขอให้เจ้าหน้าที่ตอบนะครับ โทร 089 999 2474');
});
route();
