// ย้าย ERP จากเครื่องออฟฟิศขึ้นเซิร์ฟเวอร์ออนไลน์ (รันบนเครื่องออฟฟิศ)
//   node scripts/vps/migrate.mjs setup    <IP> [โดเมน]  — ติดตั้งโปรแกรมบนเซิร์ฟเวอร์ (ครั้งแรก)
//   node scripts/vps/migrate.mjs code     <IP>           — ส่งโค้ด + dist ล่าสุด แล้วติดตั้งแพ็กเกจ (ใช้ตอนอัปเดตด้วย)
//   node scripts/vps/migrate.mjs files    <IP>           — ส่งไฟล์แนบทั้งหมด (ใหญ่ ทำก่อนวันย้ายได้ ระบบออฟฟิศยังใช้ต่อได้)
//   node scripts/vps/migrate.mjs cutover  <IP> <โดเมน>  — ย้ายจริง: หยุดออฟฟิศ → ส่งฐานข้อมูล+ไฟล์ใหม่ → เปิดบนเซิร์ฟเวอร์ → ตั้ง LINE webhook
// ใช้กุญแจ ~/.ssh/ppsd_vps (ไม่ใช้รหัสผ่าน) · ไม่แตะ/ไม่ลบข้อมูลในเครื่องออฟฟิศ (อ่านอย่างเดียว ยกเว้นตอน cutover ที่หยุดเซิร์ฟเวอร์ออฟฟิศ)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const [cmd, ip, domainArg] = process.argv.slice(2)
if (!cmd || !ip) { console.log('ใช้: node scripts/vps/migrate.mjs <setup|code|files|cutover> <IP> [โดเมน]'); process.exit(1) }
const KEY = join(homedir(), '.ssh', 'ppsd_vps')
const SSH = ['-i', KEY, '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ServerAliveInterval=30']
const APP = '/opt/ppsd-erp'
const tmp = mkdtempSync(join(tmpdir(), 'ppsd-vps-'))
const sh = (file, args, opts = {}) => execFileSync(file, args, { stdio: 'inherit', ...opts })
const ssh = (command) => sh('ssh', [...SSH, `root@${ip}`, command])
const scp = (local, remote) => sh('scp', [...SSH, local, `root@${ip}:${remote}`])
const tarFrom = (cwd, out, items, extra = []) => sh('tar', ['-czf', out, ...extra, ...items], { cwd })
const domainOf = (d) => d || ip.replace(/\./g, '-') + '.sslip.io'
const step = (t) => console.log('\n==> ' + t)

function sendCode() {
  if (!existsSync(join(ROOT, 'dist', 'index.html'))) throw new Error('ยังไม่มี dist — รัน npm run build ก่อน')
  step('แพ็กโค้ดที่ commit แล้ว (ไม่รวม server/data · .env · ไฟล์ที่ยังไม่ commit) + dist')
  sh('git', ['archive', '--format=tar.gz', '-o', join(tmp, 'code.tgz'), 'HEAD', '--', '.', ':(exclude)server/data'], { cwd: ROOT })
  tarFrom(ROOT, join(tmp, 'dist.tgz'), ['dist'])
  scp(join(tmp, 'code.tgz'), '/tmp/code.tgz'); scp(join(tmp, 'dist.tgz'), '/tmp/dist.tgz')
  step('แตกไฟล์ + ติดตั้งแพ็กเกจบนเซิร์ฟเวอร์')
  ssh(`set -e; mkdir -p ${APP}; cd ${APP}; rm -rf dist; tar -xzf /tmp/code.tgz; tar -xzf /tmp/dist.tgz; rm -f /tmp/code.tgz /tmp/dist.tgz; chown -R ppsd:ppsd ${APP}; sudo -u ppsd -H npm ci --omit=dev --no-audit --no-fund`)
}
function sendFiles(sinceMarker) {
  const dataDir = join(ROOT, 'server', 'data')
  step(sinceMarker ? 'ส่งไฟล์แนบที่เพิ่มใหม่' : 'ส่งไฟล์แนบทั้งหมด (1 GB+ ใช้เวลาตามความเร็วเน็ต)')
  const extra = sinceMarker ? [`--newer-mtime=${sinceMarker}`] : []
  tarFrom(dataDir, join(tmp, 'files.tgz'), ['files'], extra)
  scp(join(tmp, 'files.tgz'), '/tmp/files.tgz')
  ssh(`set -e; mkdir -p ${APP}/server/data; cd ${APP}/server/data; tar -xzf /tmp/files.tgz; rm /tmp/files.tgz; chown -R ppsd:ppsd ${APP}/server/data`)
  writeFileSync(join(ROOT, 'server', 'data', '.vps-files-sent'), new Date().toISOString())
}

if (cmd === 'setup') {
  scp(join(ROOT, 'scripts', 'vps', 'setup.sh'), '/root/setup.sh')
  ssh(`bash /root/setup.sh ${domainArg || ''}`)
} else if (cmd === 'code') {
  sendCode()
  ssh('systemctl is-active --quiet ppsd-erp && systemctl restart ppsd-erp || true')
} else if (cmd === 'files') {
  sendFiles(null)
} else if (cmd === 'cutover') {
  const domain = domainOf(domainArg)
  const marker = join(ROOT, 'server', 'data', '.vps-files-sent')
  step('หยุดเซิร์ฟเวอร์ออฟฟิศ (ลูป run-server.bat + node พอร์ต 3001 + ลิงก์ trycloudflare) — กันข้อมูลแยกสองที่')
  try { sh('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'run-server.bat' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; $p=(Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -First 1; if ($p) { Stop-Process -Id $p -Force }; Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force"]) } catch { /* ไม่ได้รันอยู่ */ }
  step('ถ่ายสำเนาฐานข้อมูลแบบสมบูรณ์')
  const Database = createRequire(join(ROOT, 'package.json'))('better-sqlite3')
  const src = new Database(join(ROOT, 'server', 'data', 'ppsd.sqlite'), { readonly: true })
  await src.backup(join(tmp, 'ppsd.sqlite')); src.close()
  tarFrom(tmp, join(tmp, 'db.tgz'), ['ppsd.sqlite'])
  tarFrom(join(ROOT, 'server', 'data'), join(tmp, 'key.tgz'), ['secret.key'])
  scp(join(tmp, 'db.tgz'), '/tmp/db.tgz'); scp(join(tmp, 'key.tgz'), '/tmp/key.tgz')
  sendFiles(existsSync(marker) ? new Date(statSync(marker).mtimeMs - 10 * 60 * 1000).toISOString() : null)
  step('วางฐานข้อมูล + ตั้งค่าลิงก์ใหม่ + ปิดลิงก์ trycloudflare')
  ssh(`set -e; systemctl stop ppsd-erp || true; cd ${APP}/server/data; tar -xzf /tmp/db.tgz; tar -xzf /tmp/key.tgz; chmod 600 secret.key; rm -f /tmp/db.tgz /tmp/key.tgz ppsd.sqlite-wal ppsd.sqlite-shm; chown -R ppsd:ppsd ${APP}/server/data
sqlite3 ${APP}/server/data/ppsd.sqlite "INSERT INTO settings(key,value) VALUES('public_url','https://${domain}') ON CONFLICT(key) DO UPDATE SET value=excluded.value; INSERT INTO settings(key,value) VALUES('tunnel_auto','0') ON CONFLICT(key) DO UPDATE SET value=excluded.value; INSERT INTO settings(key,value) VALUES('tunnel_url','https://${domain}') ON CONFLICT(key) DO UPDATE SET value=excluded.value;"
systemctl start ppsd-erp; sleep 6; systemctl is-active ppsd-erp`)
  step('ตั้ง LINE webhook ไปที่เซิร์ฟเวอร์ใหม่')
  ssh(`cd ${APP} && sudo -u ppsd node -e "
const D=require('better-sqlite3');const db=new D('server/data/ppsd.sqlite',{readonly:true});
const t=(db.prepare(\\"SELECT value FROM settings WHERE key='line_token'\\").get()||{}).value;
if(!t){console.log('ไม่มี LINE token — ข้าม');process.exit(0)}
fetch('https://api.line.me/v2/bot/channel/webhook/endpoint',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify({endpoint:'https://${domain}/api/line/webhook'})}).then(async r=>console.log('LINE webhook',r.status,r.ok?'OK':await r.text()))"`)
  console.log(`\nเสร็จ — เปิดใช้ที่ https://${domain}\nเครื่องออฟฟิศหยุดแล้ว (ข้อมูลเดิมยังอยู่ครบในเครื่อง ไม่ได้ลบ) · อย่าเปิด run-server.bat / start.bat ที่ออฟฟิศอีก ไม่งั้นข้อมูลจะแยกสองที่`)
} else { console.log('ไม่รู้จักคำสั่ง ' + cmd); process.exit(1) }
