import dotenv from 'dotenv';
import app from './app.js';
import prisma from './lib/prisma.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

async function main() {
  try {
    // 🚀 Professional connection handling
    console.log('🔌 Veritabanına bağlanılıyor...');
    
    await Promise.race([
      prisma.$connect(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database connection timeout')), 15000)
      )
    ]);
    
    console.log('✅ Veritabanına başarıyla bağlandı');
    
    // Server başlat
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server ${PORT} portunda çalışıyor`);
      console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Graceful shutdown için server referansını sakla
    process.server = server;
    
  } catch (error) {
    console.error('❌ Sunucu başlatılamadı:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error('❌ Ana fonksiyon hatası:', error);
  await prisma.$disconnect();
  process.exit(1);
});

// 🚀 Professional graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n📡 ${signal} sinyali alındı, güvenli kapatma başlatılıyor...`);
  
  try {
    // Server'ı durdur
    if (process.server) {
      process.server.close(() => {
        console.log('🔌 HTTP server kapatıldı');
      });
    }
    
    // Database bağlantısını kapat
    await prisma.$disconnect();
    console.log('💾 Veritabanı bağlantısı kapatıldı');
    
    console.log('✅ Güvenli kapatma tamamlandı');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Kapatma sırasında hata:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Uncaught exception handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
}); 