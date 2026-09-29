# โครงสร้างไฟล์หน้าเว็บ (src/components) — แต่ละไฟล์ทำอะไร และเชื่อมกับไฟล์ไหน

อัปเดต: 29 ก.ย. 2569 · จำนวนไฟล์ใน `src/components`: 72 ไฟล์ (~14,000 บรรทัด)

## 1. วิธีอ่านเอกสารนี้

- **ใช้ไฟล์** = ไฟล์นี้ `import` อะไรเข้ามาใช้ (ลูกศรชี้ออก) ถ้าย้ายโฟลเดอร์ ต้องแก้ path ในบรรทัด import ของไฟล์นี้
- **ถูกใช้โดย** = ไฟล์ไหน `import` ไฟล์นี้ไปใช้ (ลูกศรชี้เข้า) ถ้าย้ายไฟล์นี้ ต้องแก้ path ในไฟล์เหล่านั้น
- **API** = เส้นทางบนเซิร์ฟเวอร์ (`server/index.js`) ที่ไฟล์นี้เรียกตรงๆ ผ่าน `api.ts`; ไฟล์ที่ไม่มี API แปลว่าอ่าน/เขียนข้อมูลผ่าน `store.tsx` (ข้อมูลกลาง) แทน
- **เปิดจาก** = ผู้ใช้เข้าถึงหน้านี้ทางไหน (เมนู = page id ใน `src/data.ts` และ `src/App.tsx`)

ไฟล์ใน components เป็น "หน้าจอ" ทั้งหมด ไม่เก็บข้อมูลเอง ข้อมูลจริงอยู่ที่ `server/data/ppsd.sqlite` และ logic ธุรกิจอยู่ใน `server/*.js` การย้ายโฟลเดอร์ของไฟล์เหล่านี้จึงไม่กระทบข้อมูลและ API

## 2. ไฟล์แกนกลางนอก components ที่ทุกหน้าพึ่งพา

| ไฟล์ | หน้าที่ | ใครใช้ |
|---|---|---|
| `src/main.tsx` | จุดเริ่มของแอป เลือกว่าจะเปิด แอปหลัก / หน้าเช็คอิน (`#checkin`) / หน้าดูเอกสาร (`#docview/`) / portal ลูกค้า (`/portal/<token>`) | เบราว์เซอร์ |
| `src/App.tsx` | โครงหน้าหลัก: Login, Sidebar, Topbar, สลับหน้าตาม page id, modal เพิ่มบ้าน/ปัญหา/รายจ่าย/ผู้ใช้, หน้าพิมพ์สลิป | main.tsx |
| `src/store.tsx` | ข้อมูลกลางของทั้งระบบ (บ้าน งวด PR PO พนักงาน ลูกค้า ฯลฯ) โหลด 2 เฟสตอนเปิดแอป + ฟังก์ชันเพิ่ม/แก้/ลบที่ยิง API ให้ + type ของข้อมูลทุกตัว (`ApiHouse`, `ApiPR`, …) + `useLiveRefresh` (รีเฟรชสดผ่าน SSE) | เกือบทุกไฟล์ใน components |
| `src/api.ts` | ตัวเรียก API (`api.get/post/put/del/upload/openFile`) แนบ token ให้อัตโนมัติ | ทุกหน้าที่เรียก API ตรง |
| `src/data.ts` | รายการเมนู 29 หน้า, ชื่อหัวข้อ, กลุ่มเมนูตามแผนก, สิทธิ์รายโมดูล, สี/สไตล์กลาง (`colors`, `card`, `btn`, `input`), หมวดค่าใช้จ่าย | ทุกหน้า |
| `src/erpData.ts` | ค่าคงที่/ตัวช่วยจัดรูปแบบ (`fmt`, `unMoney`, `thaiDate`, ข้อมูลบริษัท, ค่าตั้งต้นของเอกสาร) | หน้าเอกสารพิมพ์เกือบทุกใบ |
| `src/assets.ts` | โลโก้บริษัทแบบ base64 | เอกสารพิมพ์ทุกใบ, Sidebar |
| `src/money.ts` | คำนวณ VAT/ส่วนลด (`moneySummary`, `docMoney`, `VAT_MODE_LABEL`) คู่กับ `server/money.js` | PettyCash, Procurement, PoDoc, PrApprovalDoc, Sales |
| `src/exportCsv.tsx` | ส่งออกตารางเป็น Excel (.xlsx) | Accounting, BoqTab, Expenses, Installments, LedgerTab, Reports |
| `src/qcTemplates.ts` | เช็กลิสต์ QC ทุกชุดฟอร์มของ PPSD | QcInspect, QcPrint |
| `src/pmsTemplates.ts` | หัวข้อ KPI ประเมินผลรายเดือน | Pms |
| `src/DocView.tsx` | หน้าเอกสารเปล่าสำหรับให้เซิร์ฟเวอร์ถ่ายรูปใบ PR/PO ส่งเข้า LINE | main.tsx (ใช้ PoDoc, PrApprovalDoc) |
| `src/CheckIn.tsx` | หน้าเช็คอิน GPS ของโฟร์แมนจากมือถือ | main.tsx |
| `src/Portal.tsx` | portal ลูกค้า (ดูความคืบหน้า/แจ้งเคส) | main.tsx |
| `src/Login.tsx` | หน้าเข้าสู่ระบบ | App.tsx |

## 3. แผนผังภาพรวม: หน้าหลักและชิ้นส่วนที่ประกอบกัน

```
App.tsx
├── Sidebar, Topbar, Modal, ForcePinChange, PrintDoc
├── Dashboard ── Icon
├── HouseList
├── HouseDetail ┬── FilesPanel
│               ├── ContractorsPanel ── LaborRates, MoneyInput
│               ├── InstallmentSection ── ReceiptDoc, AcceptanceModal, MoneyInput
│               ├── ImportInstallments
│               ├── BoqTab ── BoqPrint
│               ├── WorkOrders ── WorkOrderPrint
│               ├── Procurement (ดูด้านล่าง)
│               ├── QcInspect ── QcPrint
│               ├── SiteDocs ── SiteDocPrint
│               ├── SiteReports ── SiteReportPrint
│               ├── Safety ── SafetyPrint
│               └── Handover ── HandoverPrint
├── Procurement ┬── PrApprovalDoc ── ApproverSigns
│               ├── PoDoc ── ApproverSigns
│               ├── PaymentVoucher ── ApproverSigns
│               ├── WhtDoc
│               ├── GoodsReceipt
│               ├── ApprovalBar
│               ├── MaterialAutocomplete
│               ├── EfilingList
│               └── MoneyInput
├── MaterialPrices ── LaborRates
├── Stock
├── Installments
├── Expenses ── ExpenseVoucher ── ApproverSigns, ApprovalBar
├── Sales ── SalesDocPrint
├── Crm ── Pager
├── Accounting ── PettyCash ── MoneyInput
├── CostFinance ── BoqTab, CashflowTab, LedgerTab
├── ExpressExport
├── DocRegister
├── AuditCenter
├── Reports ── MonthlyReportDoc
├── Gantt
├── Issues
├── WorkOrders, QcInspect, SiteDocs, SiteReports, Safety, Handover (เปิดแบบข้ามบ้านได้ด้วย)
├── QcSummary
├── CeoVoice
├── HR ┬── WhtCertDoc, AllSlipsDoc, PayrollSummaryDoc, EfilingList
│      ├── EmpSignatureCell, LocationTrack
│      ├── MoneyInput, Pager
├── TimeKiosk ── PrintDoc
├── Pms ── PmsPrint
└── Users ── SignatureCell
```

## 4. รายละเอียดรายไฟล์ (จัดตามหมวดที่เสนอสำหรับโครงสร้างใหม่)

### 4.1 ui/ — ชิ้นส่วนใช้ร่วมกันหลายหน้า

| ไฟล์ | บรรทัด | หน้าที่ | ใช้ไฟล์ | ถูกใช้โดย | API |
|---|---|---|---|---|---|
| `Modal.tsx` | 100 | กล่องฟอร์มกลาง (เพิ่มบ้าน/ปัญหา/รายจ่าย/ผู้ใช้) เช็คช่องที่ต้องกรอก | data | App | – |
| `Pager.tsx` | 14 | ตัวแบ่งหน้าตาราง ซ่อนเองถ้าพอดีหน้าเดียว | – | Crm, HR | – |
| `Icon.tsx` | 33 | ไอคอน SVG จาก path ใน data.ts | – | Dashboard, Placeholder, Sidebar | – |
| `Placeholder.tsx` | 26 | หน้า "ยังไม่มีเนื้อหา" (ปัจจุบันไม่มีใครใช้แล้ว ลบได้) | Icon, data | – | – |
| `MoneyInput.tsx` | 31 | ช่องกรอกเงินมีลูกน้ำหลักพัน ทศนิยม 2 ตำแหน่ง แป้นตัวเลขบนมือถือ | data | ContractorsPanel, HR, Handover, InstallmentSection, LedgerTab, PettyCash, Procurement | – |
| `MaterialAutocomplete.tsx` | 62 | ช่องพิมพ์ชื่อวัสดุแบบเดาคำจากราคากลาง | store, data | Procurement | – |
| `SignatureCell.tsx` | 59 | รูปลายเซ็นผู้ใช้ + อัปโหลด/เปลี่ยน | store | Users | (ผ่าน store.setSignature) |
| `EmpSignatureCell.tsx` | 29 | รูปลายเซ็นพนักงานในตาราง HR | store | HR | (ผ่าน store.setEmpSignature) |
| `ApprovalBar.tsx` | 37 | แถบอนุมัติหลายขั้น ใช้ร่วม PR/PO/ใบจ่ายเงิน/ใบค่าใช้จ่าย | api, store | Expenses, Procurement | `/…/approve` ตามเอกสาร |
| `ApproverSigns.tsx` | 38 | บล็อกลายเซ็น 5 ช่อง (ผู้จัดทำ/ผู้ตรวจ/ผู้อนุมัติ) ดึงชื่อ-ลายเซ็น-วันที่จากผู้ที่กดอนุมัติจริง | store | ExpenseVoucher, PaymentVoucher, PoDoc, PrApprovalDoc | – |
| `PrintDoc.tsx` | 149 | กรอบเอกสารพิมพ์ A4 + สลิปเงินเดือน (`SlipBody`) รวมเงินประกันผลงานสะสม | erpData, assets, store | App, AllSlipsDoc, TimeKiosk | – |
| `FilesPanel.tsx` | 121 | แท็บไฟล์แนบของบ้าน: อัปโหลด จัดกลุ่มตามหมวด เปิดดู ลบ | api, store | HouseDetail | `/files?house=`, `/files/:id` |
| `ForcePinChange.tsx` | 50 | จอบังคับตั้ง PIN ใหม่หลังแอดมินรีเซ็ต | store | App | (ผ่าน store.changeMyPin) |

### 4.2 layout/ — โครงหน้า

| ไฟล์ | บรรทัด | หน้าที่ | ใช้ไฟล์ | ถูกใช้โดย | API |
|---|---|---|---|---|---|
| `Sidebar.tsx` | 116 | เมนูซ้าย จัดกลุ่มตามแผนก ซ่อนเมนูตามสิทธิ์ ป้ายเวอร์ชัน build เตือน+ปุ่มรีสตาร์ทเมื่อเซิร์ฟเวอร์เก่ากว่าไฟล์ | Icon, data, assets, store, api | App | `/version`, `/restart` |
| `Topbar.tsx` | 209 | แถบบน: ชื่อหน้า ค้นหาบ้าน/ลูกค้า แจ้งเตือน ปุ่มผูก LINE ของฉัน ออกจากระบบ | erpData, store, api | App | `/line-link/code` |

### 4.3 houses/ — บ้านและงวดงาน

| ไฟล์ | บรรทัด | หน้าที่ | ใช้ไฟล์ | ถูกใช้โดย | API |
|---|---|---|---|---|---|
| `HouseList.tsx` | 159 | เมนู "บ้าน": การ์ดบ้านทั้งหมด ค้นหา/กรอง อัปโหลดรูปหน้าปก (ย่อรูปฝั่งเบราว์เซอร์ก่อน) | data, store | App | (ผ่าน store.updateHouse) |
| `HouseDetail.tsx` | 447 | หน้ารายละเอียดบ้าน 1 หลัง: หัวข้อกำไร (ผู้จัดการเท่านั้น) + แท็บ งวดงาน/ช่าง/ไฟล์/BOQ/ใบสั่งงาน/จัดซื้อ/QC/เอกสารหน้างาน/รายงาน/ความปลอดภัย/ส่งมอบ | data, store, api + 12 คอมโพเนนต์ย่อย | App | `/houses/:code` |
| `InstallmentSection.tsx` | 277 | ตารางงวดงานฝั่งลูกค้า (รับเงิน) หรือฝั่งช่าง (จ่ายเงิน): เพิ่ม/แก้/ลบ/เก็บเงินแล้ว ออกใบเสร็จ ตรวจรับงวด | data, store, api, ReceiptDoc, MoneyInput, AcceptanceModal | HouseDetail | `/acceptances?house_code=`, `/houses/:code/…` |
| `AcceptanceModal.tsx` | 100 | ฟอร์มตรวจรับงวดงาน (ผลผ่าน/ไม่ผ่าน รูป ลายเซ็น) | api, erpData, assets, store | InstallmentSection | `/installments/:id/acceptance` |
| `ImportInstallments.tsx` | 222 | นำเข้างวดงานเป็นชุด: อัปโหลดสัญญาให้ AI อ่าน หรือวางจาก Excel/ข้อความ | api, data, store | HouseDetail | `/ai-settings`, `/houses/:code/installments/import` |
| `Installments.tsx` | 118 | เมนู "งวดงาน" ข้ามบ้าน: ตารางรวมทุกงวด กรอง ส่งออก Excel | erpData, data, store, exportCsv | App | (อ่านจาก store) |
| `ContractorsPanel.tsx` | 360 | แท็บช่าง/ผู้รับเหมาของบ้าน: ทะเบียนช่าง ราคาจ้างเทียบราคากลางค่าแรง เบิกล่วงหน้า ประเมินช่าง | api, data, store, LaborRates, MoneyInput | HouseDetail | `/contractor-registry`, `/contractors/:id`, `/contractor-advances/…`, `/houses/:code/…` |
| `BoqTab.tsx` | 152 | BOQ (ประมาณราคา) ของบ้าน: รายการตามหมวด รวมยอด ส่งออก Excel พิมพ์ | api, data, store, exportCsv, BoqPrint | HouseDetail, CostFinance, BoqPrint (type) | `/boqs`, `/boqs/:id` |
| `BoqPrint.tsx` | 76 | แบบพิมพ์ BOQ | erpData, assets, data, BoqTab (type) | BoqTab | – |
| `Gantt.tsx` | 183 | เมนู "แผนงาน": ไทม์ไลน์งานทุกบ้าน + S-Curve แผน vs จริง | store | App | (อ่านจาก store.tasks) |

### 4.4 site/ — งานหน้างาน

| ไฟล์ | บรรทัด | หน้าที่ | ใช้ไฟล์ | ถูกใช้โดย | API |
|---|---|---|---|---|---|
| `Issues.tsx` | 84 | เมนู "ปัญหาหน้างาน": รายการปัญหา สถานะ รูป | erpData, data, store | App | (ผ่าน store.addIssue) |
| `WorkOrders.tsx` | 273 | ใบสั่งงาน (WO): ออกใบ กำหนดผู้ทำ/ผู้ตรวจ DoD ผลตรวจ QC ท้ายใบ คะแนน งานด่วนจาก CEO (บันทึก "เห็นแล้ว") แสดงเฉพาะบ้านเมื่อเปิดจากในบ้าน | api, store, WorkOrderPrint | App, HouseDetail, WorkOrderPrint (type) | `/work-orders`, `/work-orders/:id`, `/files/:id` |
| `WorkOrderPrint.tsx` | 87 | แบบพิมพ์ใบสั่งงาน | erpData, assets, WorkOrders (type) | WorkOrders | – |
| `QcInspect.tsx` | 336 | ตรวจงาน QC ตามเช็กลิสต์ชุดฟอร์ม PPSD: ผ่าน/ไม่ผ่าน/เหตุผล กำหนดแก้ไข ลายเซ็นผู้ตรวจ+ช่าง | api, store, qcTemplates, QcPrint | App, HouseDetail, QcPrint (type) | `/qc`, `/qc/:id` |
| `QcPrint.tsx` | 129 | แบบพิมพ์ใบ QC ตามฟอร์มกระดาษ รองรับใบเก่าก่อนเปลี่ยนฟอร์ม | erpData, assets, QcInspect (type), qcTemplates | QcInspect | – |
| `QcSummary.tsx` | 136 | สรุป QC สำหรับผู้บริหาร (ต้องยืนยัน PIN) อัตราผ่านรายช่าง/รายบ้าน ลิงก์ไป KPI | api, store | App | `/qc/summary`, `/verify-pin` |
| `SiteDocs.tsx` | 165 | เอกสารหน้างาน RFI/RFA/NCR/VO: สร้าง เปลี่ยนสถานะ พิมพ์ | api, data, store, SiteDocPrint | App, HouseDetail, SiteDocPrint (type) | `/site-docs`, `/site-docs/:id` |
| `SiteDocPrint.tsx` | 75 | แบบพิมพ์ RFI/RFA/NCR/VO | erpData, assets, data, SiteDocs (type) | SiteDocs | – |
| `SiteReports.tsx` | 142 | รายงานหน้างานรายวัน/รายสัปดาห์ ดึงแรงงานจากลงเวลา ความคืบหน้าจาก S-curve เอกสาร RFI/VO อัตโนมัติ | api, store, SiteReportPrint | App, HouseDetail, SiteReportPrint (type) | `/site-reports`, `/site-report-autofill` |
| `SiteReportPrint.tsx` | 62 | แบบพิมพ์รายงานหน้างาน | erpData, assets, SiteReports (type) | SiteReports | – |
| `Safety.tsx` | 162 | ความปลอดภัย: บันทึก PPE / Toolbox talk / JHA | api, store, SafetyPrint | App, HouseDetail, SafetyPrint (type) | `/safety-records` |
| `SafetyPrint.tsx` | 104 | แบบพิมพ์บันทึกความปลอดภัย | erpData, assets, Safety (type) | Safety | – |
| `Handover.tsx` | 162 | ใบส่งมอบงาน + หนังสือรับรองผลงาน ดึงงวดที่ตรวจรับผ่านและยอดจ่ายช่างอัตโนมัติ | api, data, store, MoneyInput, HandoverPrint | App, HouseDetail, HandoverPrint (type) | `/handovers`, `/handover-autofill` |
| `HandoverPrint.tsx` | 88 | แบบพิมพ์ใบส่งมอบ/หนังสือรับรอง | erpData, assets, data, Handover (type) | Handover | – |
| `CeoVoice.tsx` | 251 | CEO สั่งงานด้วยเสียง/พิมพ์ → ระบบเดาผู้รับ/บ้าน/ความด่วน → ออกใบสั่งงาน + ติดตามสถานะงานด่วน (ส่ง/เห็น/รับทราบ) ไล่ระดับหาคนสำรอง | api, store | App | `/verify-pin`, `/work-orders`, `/work-orders/ceo-feed`, `/settings/urgent` |

### 4.5 procurement/ — จัดซื้อ

| ไฟล์ | บรรทัด | หน้าที่ | ใช้ไฟล์ | ถูกใช้โดย | API |
|---|---|---|---|---|---|
| `Procurement.tsx` | 1,130 | เมนู "จัดซื้อ/จ่าย" ทั้งกระบวนการ: PR (ขอซื้อ) → ใบเทียบราคา (รูปจากเว็บ/LINE, AI เทียบ, ประวัติเคยซื้อ) → PO (VAT/ส่วนลด) → รับของ → ใบจ่ายเงิน/หัก ณ ที่จ่าย → เจ้าหนี้ | erpData, data, api, store, money + 9 คอมโพเนนต์ย่อย | App, HouseDetail | `/purchase-requests/:id`, `/pr-quotes/…`, `/pr-quote-files/:id`, `/procurement/flow`, `/purchase-orders/:id`, `/payables`, `/controls` |
| `PrApprovalDoc.tsx` | 135 | ใบขอซื้อ/ขอจ้าง (PR) แบบพิมพ์ตามฟอร์มบริษัท โหมด standalone ให้ระบบถ่ายรูปส่ง LINE | erpData, assets, store, ApproverSigns, data, money | Procurement, DocView | – |
| `PoDoc.tsx` | 124 | ใบสั่งซื้อ (PO) แบบพิมพ์ ดึงที่อยู่/เลขภาษีผู้ขาย โหมด standalone | erpData, assets, data, money, store, ApproverSigns | Procurement, DocView | – |
| `PaymentVoucher.tsx` | 102 | ใบจ่ายเงิน (PS) จ่ายเจ้าหนี้/ช่าง | erpData, assets, data, store, ApproverSigns | Procurement | – |
| `WhtDoc.tsx` | 103 | หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) สำหรับผู้ขาย/ช่าง | erpData, data, store | Procurement | – |
| `GoodsReceipt.tsx` | 192 | ตรวจรับของ: อัปโหลดรูปใบส่งของ → AI อ่าน → เทียบกับ PO → ผ่าน/ไม่ผ่าน เก็บไฟล์ถาวร | store, api, data | Procurement | `/purchase-orders/:id/…`, `/goods-receipts/…`, `/files/:id` |
| `MaterialPrices.tsx` | 269 | เมนู "ราคากลาง": ราคากลางวัสดุจากประวัติซื้อจริง (เดาชิ้นต่อแพ็ค) + แท็บราคากลางค่าแรง | store, api, LaborRates | App | `/material-prices`, `/material-prices/recompute` |
| `LaborRates.tsx` | 201 | ตารางราคากลางค่าแรงช่าง + hook `useLaborRates` ให้หน้าอื่นเทียบราคา | store, api | ContractorsPanel, MaterialPrices | `/labor-rates` |
| `Stock.tsx` | 183 | เมนู "สต๊อกวัสดุ": คงเหลือ รับเข้าอัตโนมัติจาก PO ไม่ผูกบ้าน เบิกออกระบุบ้าน/คนเบิก | api, store | App | `/stock`, `/stock/moves`, `/stock/items/:id` |
| `EfilingList.tsx` | 57 | รายการไฟล์ยื่นสรรพากร/ประกันสังคม (ภ.ง.ด.3/53, สปส.) ให้ดาวน์โหลด | store, api | HR, Procurement | `/efiling/:id/download` |

### 4.6 finance/ — บัญชีและการเงิน

| ไฟล์ | บรรทัด | หน้าที่ | ใช้ไฟล์ | ถูกใช้โดย | API |
|---|---|---|---|---|---|
| `Accounting.tsx` | 899 | เมนู "บัญชีแยกประเภท": งบกำไรขาดทุน งบดุล กระแสเงินสด งบทดลอง สมุดรายวัน แยกประเภท ผังบัญชี AR/AP aging กระทบยอด ทรัพย์สิน/ค่าเสื่อม ภาษี ปิดงวด + แท็บเงินสดย่อย | api, data, exportCsv, erpData, PettyCash | App | `/accounts`, `/journal`, `/gl/:code`, `/income-statement`, `/balance-sheet`, `/trial-balance`, `/ar-aging`, `/ap-aging`, `/reconcile`, `/assets`, `/closing/…`, `/accounting/…` |
| `PettyCash.tsx` | 454 | เงินสดย่อย 2 กอง (ทั่วไป/น้ำมัน): ตั้งวงเงิน เบิก (ร้าน รายการ+จำนวน ผู้เบิก บ้าน VAT/ส่วนลด อ้างอิง RR/OE/PS/PO) เติมเงิน แก้ไข/ลบ ใบสำคัญรับเงิน RV รายงาน อนุมัติเบิกน้ำมันจาก LINE | api, data, erpData, store, MoneyInput, money | Accounting | `/petty-cash/*`, `/fuel-requests/*` |
| `Expenses.tsx` | 112 | เมนู "รายจ่าย": ค่าใช้จ่ายอื่น (OE) เพิ่ม อนุมัติ พิมพ์ ส่งออก Excel | erpData, data, store, exportCsv, ExpenseVoucher, ApprovalBar | App | (ผ่าน store.addExpense) |
| `ExpenseVoucher.tsx` | 103 | ใบจ่ายค่าใช้จ่ายอื่น (OE) แบบพิมพ์ | erpData, assets, data, store, ApproverSigns | Expenses | – |
| `ReceiptDoc.tsx` | 67 | ใบเสร็จรับเงินตอนเก็บเงินงวดจากลูกค้า | erpData, assets, data, store | InstallmentSection | – |
| `CostFinance.tsx` | 29 | เมนู "ต้นทุน/การเงิน": รวม 3 แท็บ BOQ / กระแสเงินสด / สมุดบัญชี | store, BoqTab, CashflowTab, LedgerTab | App | – |
| `CashflowTab.tsx` | 147 | แผนกระแสเงินสดรายเดือนต่อบ้าน เทียบยอดจริงจากงวด/รายจ่าย | api, data, store | CostFinance | `/cashflows`, `/cashflow-actuals` |
| `LedgerTab.tsx` | 144 | สมุดรับ-จ่ายอย่างง่าย กรองช่วงเวลา สรุปงบ vs ใช้จริงตามหมวด | api, data, store, exportCsv, MoneyInput | CostFinance | `/ledger`, `/ledger/:id` |
| `ExpressExport.tsx` | 78 | เมนู "ส่งออกบัญชี (Express)": ดาวน์โหลด CSV ผังบัญชี/สมุดรายวัน/ลูกค้า/ผู้ขาย/เงินเดือน | api | App | `/export/express` |
| `DocRegister.tsx` | 180 | เมนู "ทะเบียนเอกสาร": ทะเบียนควบคุมสัญญา/แบบ/สเปก นำเข้าสัญญาจากบ้านอัตโนมัติ | api, store | App | `/doc-register`, `/doc-register/import-contracts` |
| `AuditCenter.tsx` | 246 | เมนู "ตรวจสอบ" (ผู้จัดการ ยืนยัน PIN): ข้อมูลแย้ง ซ่อมงวดงาน ตั้งค่าควบคุมภายใน audit log | api, data, store | App | `/audit-center`, `/controls`, `/audit-log`, `/repair/installments`, `/verify-pin` |

### 4.7 sales/ — การขายและลูกค้า

| ไฟล์ | บรรทัด | หน้าที่ | ใช้ไฟล์ | ถูกใช้โดย | API |
|---|---|---|---|---|---|
| `Sales.tsx` | 251 | เมนู "เอกสารขาย": ใบเสนอราคา → ใบแจ้งหนี้ → ใบเสร็จ (ต่อสาย) เลือกโหมด VAT อัปโหลดใบเก่าให้ AI อ่าน แนบไฟล์ ลบ | money, store, api, data, SalesDocPrint | App | `/sales-docs/extract`, `/files/:id/view` + ผ่าน store.addSalesDoc/deleteSalesDoc |
| `SalesDocPrint.tsx` | 86 | แบบพิมพ์ใบเสนอราคา/แจ้งหนี้/ใบเสร็จ | erpData, assets, data, store | Sales | – |
| `Crm.tsx` | 611 | เมนู "ลูกค้า (CRM)": ลูกค้า 360° ผู้ติดต่อ Lead/Pipeline (Kanban) เคส/SLA รับประกัน NPS automation รายงาน CRM ตั้งค่า | api, data, store, Pager | App | `/crm/*`, `/customers` |

### 4.8 hr/ — บุคลากร

| ไฟล์ | บรรทัด | หน้าที่ | ใช้ไฟล์ | ถูกใช้โดย | API |
|---|---|---|---|---|---|
| `HR.tsx` | 1,103 | เมนู "บุคลากร/HR": ทะเบียนพนักงาน ตำแหน่ง ลงเวลารายเดือน/รายวัน ลา OT ปรับเวลา เงินเดือน (ปิดงวด สลิป สรุปจ่าย) หัก ณ ที่จ่ายรายปี e-Filing ติดตามตำแหน่ง ลายเซ็น PIN | api, erpData, data, store, MoneyInput, Pager, WhtCertDoc, AllSlipsDoc, PayrollSummaryDoc, EfilingList, EmpSignatureCell, LocationTrack | App | ผ่าน store (addEmployee, addLeave, addOT, addTimeAdj, approveOt, closePayroll, decideLeave, decideTimeAdj, setEmpPin, viewPayrollPeriod …) |
| `TimeKiosk.tsx` | 263 | เมนู "ลงเวลา" (kiosk): ตอกบัตรด้วย PIN ดูสลิปตัวเอง ยื่นปรับเวลา geofence | store, api, PrintDoc | App | `/kiosk/employees`, `/kiosk/my-slip`, `/kiosk/time-adjust`, `/settings/attendance` + ตอกบัตรผ่าน store.punch |
| `LocationTrack.tsx` | 113 | แผนที่/ประวัติตำแหน่ง GPS ของโฟร์แมน ออกลิงก์ติดตาม ตั้งค่าติดตาม | api | HR | `/location-log`, `/employees/:id/track-token`, `/track-config` |
| `Pms.tsx` | 295 | เมนู "ประเมินผล KPI" (ยืนยัน PIN): คะแนนรายเดือน ดึงขาด/ลา/สาย ใบสั่งงานเกินกำหนด สถิติ QC มาคำนวณให้ | api, store, pmsTemplates, PmsPrint | App, PmsPrint (type) | `/pms`, `/pms/:id`, `/work-orders/executor-stats`, `/qc/inspector-stats`, `/verify-pin` |
| `PmsPrint.tsx` | 86 | แบบพิมพ์ใบประเมินผล | erpData, assets, Pms (type) | Pms | – |
| `PayrollSummaryDoc.tsx` | 158 | ใบสรุปการจ่ายค่าจ้างทั้งบริษัท 1 งวด (แนวนอน) | erpData, store | HR | – |
| `AllSlipsDoc.tsx` | 28 | สลิปเงินเดือนทุกคนในเอกสารเดียว คนละหน้า | store, PrintDoc | HR | – |
| `WhtCertDoc.tsx` | 98 | หนังสือรับรองหัก ณ ที่จ่าย 50 ทวิ ฉบับพนักงานรายปี | erpData | HR | – |

### 4.9 reports/ — ภาพรวมและรายงาน

| ไฟล์ | บรรทัด | หน้าที่ | ใช้ไฟล์ | ถูกใช้โดย | API |
|---|---|---|---|---|---|
| `Dashboard.tsx` | 371 | เมนู "หน้าสรุป": แถบสุขภาพระบบ (สำรองข้อมูล/LINE/AI) กำไรรวมบริษัท (ผู้จัดการ) งานค้าง งวดครบกำหนด ปัญหา ลิงก์เข้าบ้าน | Icon, api, data, store | App | `/health` |
| `Reports.tsx` | 220 | เมนู "รายงาน": กราฟสรุป รายงานผู้บริหารประจำเดือน พิมพ์ A4 / ส่ง LINE ส่งออก Excel | store, api, data, exportCsv, MonthlyReportDoc | App | `/reports/monthly`, `/reports/monthly/send-line` |
| `MonthlyReportDoc.tsx` | 98 | แบบพิมพ์รายงานผู้บริหารประจำเดือน | erpData, data | Reports | – |

### 4.10 admin/ — ตั้งค่าระบบ

| ไฟล์ | บรรทัด | หน้าที่ | ใช้ไฟล์ | ถูกใช้โดย | API |
|---|---|---|---|---|---|
| `Users.tsx` | 679 | เมนู "ผู้ใช้งาน": บัญชีผู้ใช้/สิทธิ์/โมดูล รีเซ็ต PIN ลายเซ็น ตั้งค่า LINE + tunnel + webhook ตั้งค่า AI กติกาอนุมัติ สำรองข้อมูล/กู้คืน/mirror นอกเครื่อง audit | erpData, data, store, api, SignatureCell | App | `/backups`, `/pin-resets`, `/line-settings`, `/tunnel`, `/ai-settings`, `/procurement/flow`, `/backup-mirror`, `/audit` |

## 5. ตารางสรุป: ไฟล์ที่ถูกใช้ร่วมกันมากที่สุด (ย้ายแล้วต้องแก้ import หลายจุด)

| ไฟล์ | ถูกใช้โดยกี่ไฟล์ | ใคร |
|---|---|---|
| `MoneyInput.tsx` | 7 | ContractorsPanel, HR, Handover, InstallmentSection, LedgerTab, PettyCash, Procurement |
| `ApproverSigns.tsx` | 4 | ExpenseVoucher, PaymentVoucher, PoDoc, PrApprovalDoc |
| `PrintDoc.tsx` | 3 | App, AllSlipsDoc, TimeKiosk |
| `Icon.tsx` | 3 | Dashboard, Placeholder, Sidebar |
| `BoqTab.tsx` | 3 | HouseDetail, CostFinance, BoqPrint |
| `Procurement.tsx` | 2 | App, HouseDetail |
| `WorkOrders / QcInspect / SiteDocs / SiteReports / Safety / Handover` | 2–3 แต่ละไฟล์ | App, HouseDetail, ไฟล์ Print ของตัวเอง |
| `LaborRates.tsx` | 2 | ContractorsPanel, MaterialPrices |
| `EfilingList.tsx` | 2 | HR, Procurement |
| `ApprovalBar.tsx` | 2 | Expenses, Procurement |
| `Pager.tsx` | 2 | Crm, HR |

ไฟล์นอก components ที่ import คอมโพเนนต์: `App.tsx` (35 ไฟล์) และ `DocView.tsx` (PoDoc, PrApprovalDoc) ต้องแก้ path ในสองไฟล์นี้ด้วยเมื่อย้าย

## 6. ข้อสังเกตจากการไล่โครงสร้าง

- **คู่ "หน้า + Print"** (WorkOrders/WorkOrderPrint, QcInspect/QcPrint, SiteDocs/SiteDocPrint, SiteReports/SiteReportPrint, Safety/SafetyPrint, Handover/HandoverPrint, Pms/PmsPrint, BoqTab/BoqPrint) import กันไปมา (หน้าใช้ Print เพื่อแสดง, Print ใช้ type จากหน้า) ต้องย้ายไปอยู่โฟลเดอร์เดียวกันเสมอ
- **`Placeholder.tsx`** ไม่มีใครใช้แล้ว ลบได้ตอนจัดโครงสร้าง
- **ไฟล์ใหญ่ที่ควรแยกในอนาคต** (ไม่จำเป็นต้องทำพร้อมการย้ายโฟลเดอร์): `Procurement.tsx` 1,130 บรรทัด (PR / เทียบราคา / PO / จ่ายเงิน แยกเป็น 4 ไฟล์ได้), `HR.tsx` 1,103 บรรทัด (พนักงาน / ลงเวลา / ลา-OT / เงินเดือน), `Accounting.tsx` 899 บรรทัด (งบ / สมุดรายวัน / ปิดงวด / ทรัพย์สิน)
- **`HouseDetail.tsx` คือจุดรวมของ "house-first"** เกือบทุกหน้าหน้างานถูกเรียกซ้ำจากในบ้านด้วย prop `houseCode` การย้ายจึงต้องแก้ import ในไฟล์นี้มากที่สุด (12 บรรทัด)
