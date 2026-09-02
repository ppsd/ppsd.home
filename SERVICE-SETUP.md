# รัน PPSD ERP เป็น Service (เปิดเองตอนบูต · ล่มแล้วฟื้นเอง)

ทำครั้งเดียวบนเครื่องเซิร์ฟเวอร์ (เครื่องที่รันระบบให้ทั้งออฟฟิศ)

## Windows — วิธีแนะนำ (ง่ายสุด)

1. คลิกขวา `install-service.bat` → **Run as administrator**
2. รอจนขึ้น "เสร็จแล้ว!" — ระบบจะอยู่ที่ http://localhost:3001 และ
   - เปิดเครื่องใหม่ → ระบบเปิดเองอัตโนมัติ
   - โปรแกรมล่ม → เปิดใหม่เองใน 3 วินาที
   - log อยู่ที่ `server/data/logs/`

### คำสั่งที่ใช้บ่อย (เปิด Command Prompt)

| คำสั่ง | ทำอะไร |
|---|---|
| `pm2 status` | ดูว่าระบบทำงานอยู่ไหม |
| `pm2 logs ppsd-erp` | ดู log สด (Ctrl+C ออก) |
| `pm2 restart ppsd-erp` | รีสตาร์ท — ใช้หลังอัปเดตโปรแกรม |
| `pm2 stop ppsd-erp` | หยุดระบบชั่วคราว |

### อัปเดตโปรแกรมเวอร์ชันใหม่

แตกไฟล์ zip ทับโฟลเดอร์เดิม (โฟลเดอร์ `server/data` คือข้อมูลจริง — **ห้ามลบ/ทับ**) แล้ว:

```
npm install
npm run build
pm2 restart ppsd-erp
```

## Windows — วิธีสำรอง (ไม่อยากลง PM2)

ใช้ Task Scheduler:

1. เปิด **Task Scheduler** → Create Task
2. General: ตั้งชื่อ `PPSD ERP` · เลือก **Run whether user is logged on or not**
3. Triggers: New → **At startup**
4. Actions: New → Program: `node` · Arguments: `server\index.js` · Start in: `C:\พาธ\ไปยัง\โฟลเดอร์โปรแกรม`
5. Settings: ติ๊ก **If the task fails, restart every 1 minute** (attempt 999 ครั้ง)

## Linux (ถ้าย้ายไปเครื่อง Linux/NAS)

```bash
sudo tee /etc/systemd/system/ppsd-erp.service <<'EOF'
[Unit]
Description=PPSD Construction ERP
After=network.target

[Service]
WorkingDirectory=/opt/ppsd.home
ExecStart=/usr/bin/node server/index.js
Environment=PORT=3001
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl enable --now ppsd-erp
```

## Log เมื่อระบบล่ม

ทุกครั้งที่โปรแกรม crash ระบบเขียนสาเหตุลง `server/data/logs/error-YYYY-MM-DD.log`
ก่อนปิดตัว (แล้ว PM2 เปิดใหม่ให้เอง) — ถ้าล่มบ่อยให้ส่งไฟล์นี้มาดูได้เลย
