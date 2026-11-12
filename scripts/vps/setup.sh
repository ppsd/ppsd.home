#!/usr/bin/env bash
# ติดตั้ง PPSD ERP บนเซิร์ฟเวอร์ออนไลน์ (Ubuntu 24.04) — รันครั้งเดียวในฐานะ root
# ได้: Node 24 + Chrome (สร้างรูปเอกสารส่ง LINE) + ฟอนต์ไทย + Caddy (https อัตโนมัติ) + บริการ ppsd-erp ที่เปิดเองหลังรีบูต
# ใช้: bash setup.sh <ชื่อโดเมน เช่น erp.example.com หรือ เว้นว่าง = ใช้ <IP>.sslip.io>
set -euo pipefail
DOMAIN="${1:-}"
IP="$(curl -fsS4 https://api.ipify.org || hostname -I | awk '{print $1}')"
[ -z "$DOMAIN" ] && DOMAIN="${IP//./-}.sslip.io"
APP=/opt/ppsd-erp
export DEBIAN_FRONTEND=noninteractive

echo "==> แพ็กเกจพื้นฐาน + ฟอนต์ไทย/อีโมจิ"
apt-get update -y
apt-get install -y curl ca-certificates gnupg ufw sqlite3 unzip fonts-thai-tlwg fonts-noto-color-emoji fonts-noto-cjk build-essential python3

echo "==> เวลาไทย"
timedatectl set-timezone Asia/Bangkok || true

echo "==> Node 24"
if ! node -v 2>/dev/null | grep -q '^v24'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

echo "==> Google Chrome (สร้างรูป PR/PO/สลิปส่ง LINE)"
if ! command -v google-chrome >/dev/null; then
  curl -fsSL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  apt-get install -y /tmp/chrome.deb
fi

echo "==> ฟอนต์ Kanit (ฟอนต์ของระบบ)"
mkdir -p /usr/share/fonts/truetype/kanit
for w in Regular Medium SemiBold Bold; do
  curl -fsSL -o "/usr/share/fonts/truetype/kanit/Kanit-$w.ttf" "https://github.com/google/fonts/raw/main/ofl/kanit/Kanit-$w.ttf" || true
done
fc-cache -f >/dev/null

echo "==> Caddy (https อัตโนมัติ)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
  encode gzip
  request_body { max_size 60MB }
  reverse_proxy 127.0.0.1:3001 {
    flush_interval -1
  }
}
EOF
systemctl reload caddy || systemctl restart caddy

echo "==> ผู้ใช้ระบบ + โฟลเดอร์"
id ppsd >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin ppsd
mkdir -p "$APP"
chown -R ppsd:ppsd "$APP"

echo "==> บริการ ppsd-erp (เปิดเองหลังรีบูต · ล่มแล้วเปิดใหม่ใน 5 วิ)"
cat > /etc/systemd/system/ppsd-erp.service <<EOF
[Unit]
Description=PPSD Construction ERP
After=network-online.target
Wants=network-online.target

[Service]
User=ppsd
WorkingDirectory=$APP
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=PPSD_NO_TUNNEL=1
Environment=PPSD_CHROME=/usr/bin/google-chrome
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable ppsd-erp >/dev/null

echo "==> ไฟร์วอลล์: เปิดเฉพาะ SSH + เว็บ"
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

echo "==> สำรองฐานข้อมูลทุกคืน 02:30 (เก็บ 14 วัน)"
cat > /etc/cron.d/ppsd-backup <<EOF
30 2 * * * ppsd mkdir -p $APP/server/data/backups/nightly && sqlite3 $APP/server/data/ppsd.sqlite ".backup '$APP/server/data/backups/nightly/ppsd-\$(date +\%F).sqlite'" && find $APP/server/data/backups/nightly -name '*.sqlite' -mtime +14 -delete
EOF

echo "DONE https://$DOMAIN"
