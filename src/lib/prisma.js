import { PrismaClient } from '@prisma/client';

// 🚀 Professional Prisma Configuration with Connection Pool
const createPrismaClient = () => {
  // Production ve development için farklı ayarlar
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Database URL düzenleme - connection pool parametreleri
  let databaseUrl = process.env.DATABASE_URL;
  
  if (isProduction && databaseUrl && !databaseUrl.includes('?')) {
    // Production için connection pool ayarları ekle
    databaseUrl += '?pool_timeout=20&connect_timeout=30&connection_limit=5';
  } else if (isProduction && databaseUrl && databaseUrl.includes('?')) {
    // Eğer zaten parametre varsa, pool ayarlarını kontrol et
    if (!databaseUrl.includes('connection_limit')) {
      databaseUrl += '&connection_limit=5';
    }
    if (!databaseUrl.includes('pool_timeout')) {
      databaseUrl += '&pool_timeout=20';
    }
  }

  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    
    // Log seviyesi - production'da daha az verbose
    log: isProduction 
      ? ['error'] 
      : ['query', 'error', 'warn'],
    
    errorFormat: 'minimal',
    
    // 🚀 Transaction timeout ayarları
    transactionOptions: {
      timeout: isProduction ? 15000 : 30000, // Production'da daha hızlı
      maxWait: isProduction ? 3000 : 5000,   // Production'da daha hızlı
      isolationLevel: 'ReadCommitted'
    }
  });
};

// Singleton pattern - Global connection reuse
const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma || createPrismaClient();

// Production'da global'e kaydet (hot reload'dan korun)
if (process.env.NODE_ENV === 'production') {
  globalForPrisma.prisma = prisma;
} else {
  // Development'ta her zaman global'e ata
  globalForPrisma.prisma = prisma;
}

// 🚀 Professional Graceful Shutdown Handler
const gracefulDisconnect = async () => {
  try {
    await prisma.$disconnect();
    console.log('✅ Prisma client disconnected gracefully');
  } catch (error) {
    console.error('❌ Error during Prisma disconnect:', error);
    process.exit(1);
  }
};

// Signal handlers
process.on('beforeExit', gracefulDisconnect);
process.on('SIGINT', gracefulDisconnect);
process.on('SIGTERM', gracefulDisconnect);

// 🚀 Connection health check function
export const checkDatabaseConnection = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', timestamp: new Date().toISOString() };
  } catch (error) {
    console.error('❌ Database connection check failed:', error);
    return { status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() };
  }
};

export default prisma; 