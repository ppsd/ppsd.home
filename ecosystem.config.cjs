// PM2 config — รัน PPSD ERP เป็น service: เปิดเองตอนบูตเครื่อง ล่มแล้วฟื้นเอง เก็บ log ให้
// ติดตั้งตามขั้นตอนใน SERVICE-SETUP.md (Windows ใช้ install-service.bat ได้เลย)
module.exports = {
  apps: [
    {
      name: 'ppsd-erp',
      script: 'server/index.js',
      cwd: __dirname,
      env: { PORT: 3001, NODE_ENV: 'production' },
      autorestart: true,          // ล่มแล้วเปิดใหม่เอง
      max_restarts: 50,           // กันลูปพังรัวๆ ไม่รู้จบ
      restart_delay: 3000,        // รอ 3 วิ ก่อนเปิดใหม่
      max_memory_restart: '600M', // กันหน่วยความจำรั่วสะสม
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: 'server/data/logs/pm2-out.log',
      error_file: 'server/data/logs/pm2-error.log',
      merge_logs: true,
    },
  ],
}
