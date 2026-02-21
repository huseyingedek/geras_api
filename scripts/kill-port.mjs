/**
 * npm run dev öncesinde otomatik çalışır.
 * Port 5000'i tutan process varsa öldürür.
 */
import { exec } from 'child_process';

const PORT = 5000;

exec(`netstat -ano | findstr :${PORT}`, (err, stdout) => {
  if (!stdout) {
    console.log(`✅ Port ${PORT} boş, başlatılıyor...`);
    return;
  }

  const pids = new Set();
  stdout.trim().split('\n').forEach(line => {
    const parts = line.trim().split(/\s+/);
    // Sadece LISTENING durumundaki process'i al
    if (parts[3] === 'LISTENING' && parts[4]) {
      pids.add(parts[4]);
    }
  });

  if (pids.size === 0) {
    console.log(`✅ Port ${PORT} boş, başlatılıyor...`);
    return;
  }

  let killed = 0;
  pids.forEach(pid => {
    exec(`taskkill /F /PID ${pid}`, (killErr) => {
      if (!killErr) {
        console.log(`🔪 Port ${PORT} temizlendi (PID: ${pid})`);
      }
      killed++;
      if (killed === pids.size) {
        console.log(`✅ Temizlik tamamlandı, sunucu başlatılıyor...`);
      }
    });
  });
});
