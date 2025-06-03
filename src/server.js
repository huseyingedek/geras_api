import dotenv from 'dotenv';
import app from './app.js';
import prisma, { checkDatabaseConnection } from './lib/prisma.js';

// Environment variables yükle
dotenv.config();

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * 🚀 Professional Server Startup
 */
async function startServer() {
  try {
    // 1. Database connection test
    console.log('🔌 Veritabanı bağlantısı test ediliyor...');
    const dbHealth = await Promise.race([
      checkDatabaseConnection(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database health check timeout')), 10000)
      )
    ]);

    if (dbHealth.status !== 'healthy') {
      throw new Error(`Database connection failed: ${dbHealth.error}`);
    }
    
    console.log('✅ Veritabanı bağlantısı başarılı');
    
    // 2. Start HTTP Server
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server ${PORT} portunda çalışıyor`);
      console.log(`📝 Environment: ${NODE_ENV}`);
      console.log(`🌐 Health Check: http://localhost:${PORT}/health`);
      console.log(`📡 API Base URL: http://localhost:${PORT}/api`);
      
      if (NODE_ENV === 'development') {
        console.log('🔧 Development mode - Extra logging enabled');
      }
    });

    // Global server reference için
    process.server = server;
    
    // Keep-alive timeout (for cloud platforms)
    server.keepAliveTimeout = 61 * 1000; // 61 seconds
    server.headersTimeout = 65 * 1000; // 65 seconds
    
    return server;
    
  } catch (error) {
    console.error('❌ Server başlatılamadı:', error.message);
    console.error('🔍 Error details:', error);
    
    // Cleanup ve exit
    try {
      await prisma.$disconnect();
    } catch (disconnectError) {
      console.error('❌ Prisma disconnect error:', disconnectError);
    }
    
    process.exit(1);
  }
}

/**
 * 🚀 Professional Graceful Shutdown
 */
const gracefulShutdown = async (signal) => {
  console.log(`\n📡 ${signal} sinyali alındı, güvenli kapatma başlatılıyor...`);
  
  const shutdownTimeout = setTimeout(() => {
    console.error('❌ Graceful shutdown timeout - forcing exit');
    process.exit(1);
  }, 15000); // 15 saniye timeout
  
  try {
    // 1. HTTP Server'ı durdur
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
    
    // 2. Aktif bağlantıları bekle
    console.log('⏳ Aktif bağlantılar sonlandırılıyor...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 3. Database bağlantısını kapat
    await prisma.$disconnect();
    console.log('💾 Veritabanı bağlantısı kapatıldı');
    
    clearTimeout(shutdownTimeout);
    console.log('✅ Güvenli kapatma tamamlandı');
    process.exit(0);
    
  } catch (error) {
    clearTimeout(shutdownTimeout);
    console.error('❌ Kapatma sırasında hata:', error);
    
    // Force disconnect
    try {
      await prisma.$disconnect();
    } catch (disconnectError) {
      console.error('❌ Force disconnect error:', disconnectError);
    }
    
    process.exit(1);
  }
};

// 🚀 Signal handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// 🚀 Unhandled exception handlers
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

// 🚀 Start the server
startServer().catch((error) => {
  console.error('❌ Server startup failed:', error);
  process.exit(1);
}); 