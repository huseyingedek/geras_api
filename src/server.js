import dotenv from 'dotenv';
import app from './app.js';
import prisma, { checkDatabaseConnection } from './lib/prisma.js';
import { startReminderService } from './services/reminderService.js';
import { startIncompleteAppointmentsService } from './services/incompleteAppointmentsService.js';
import { startDemoCronJob, initialCheck } from './utils/demoCronJob.js';
import { startInstallmentCronJob } from './utils/installmentCronJob.js';

dotenv.config();

process.env.TZ = 'Europe/Istanbul';

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';


// DB bağlantısını arka planda kontrol et (Neon cold-start'ta sunucuyu bloklamaz)
async function checkDatabaseInBackground() {
  const maxRetries = 5;
  const delayMs    = 5000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const dbHealth = await checkDatabaseConnection();
    if (dbHealth.status === 'healthy') {
      console.log('✅ Database connection established with Neon PostgreSQL');
      return;
    }
    if (attempt < maxRetries) {
      console.log(`⏳ Veritabanı bağlantısı bekleniyor... (${attempt}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  console.error('❌ Veritabanına bağlanılamadı. Gelen istekler DB gerektiren endpoint\'lerde hata alacak.');
}

async function startServer() {
  // HTTP sunucusunu hemen başlat — Render health-check bloklanmaz
  const server = app.listen(PORT, () => {
    console.log(`🚀 Server ${PORT} portunda çalışıyor`);
    console.log(`📝 Environment: ${NODE_ENV}`);
    console.log(`🌐 Health Check: http://localhost:${PORT}/health`);
    console.log(`📡 API Base URL: http://localhost:${PORT}/api`);
  });

  process.server = server;
  server.keepAliveTimeout = 61 * 1000;
  server.headersTimeout   = 65 * 1000;

  // DB kontrolü arka planda — cold-start'ta sunucuyu çöktürmez
  checkDatabaseInBackground().catch(err =>
    console.error('❌ Background DB check hatası:', err.message)
  );

  // Cron servislerini başlat
  startReminderService();
  startIncompleteAppointmentsService();
  startDemoCronJob();
  startInstallmentCronJob();

  return server;
}

const gracefulShutdown = async (signal) => {
  console.log(`\n📡 ${signal} sinyali alındı, güvenli kapatma başlatılıyor...`);
  
  const shutdownTimeout = setTimeout(() => {
    console.error('❌ Graceful shutdown timeout - forcing exit');
    process.exit(1);
  }, 15000); // 15 saniye timeout
  
  try {
    if (process.server) {
      await new Promise((resolve, reject) => {
        process.server.close((error) => {
          if (error) {
            console.error('❌ HTTP server close error:', error);
            reject(error);
          } else {
            console.log('🔌 HTTP server kapatıldı');
            resolve();
          }
        });
      });
    }
    
    console.log('⏳ Aktif bağlantılar sonlandırılıyor...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await prisma.$disconnect();
    console.log('💾 Veritabanı bağlantısı kapatıldı');
    
    clearTimeout(shutdownTimeout);
    console.log('✅ Güvenli kapatma tamamlandı');
    process.exit(0);
    
  } catch (error) {
    clearTimeout(shutdownTimeout);
    console.error('❌ Kapatma sırasında hata:', error);
    
    try {
      await prisma.$disconnect();
    } catch (disconnectError) {
      console.error('❌ Force disconnect error:', disconnectError);
    }
    
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('💥 Stack:', error.stack);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('💥 Reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

startServer().catch((error) => {
  console.error('❌ Server başlatılamadı:', error);
  process.exit(1);
}); 