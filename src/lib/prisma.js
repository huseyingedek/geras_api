import { PrismaClient } from '@prisma/client';

// Singleton pattern - tek instance kullan
const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma || new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  errorFormat: 'minimal',
  
  // 🚀 Professional Connection Pool Settings
  transactionOptions: {
    timeout: 30000, // 30 saniye transaction timeout
    maxWait: 10000, // 10 saniye max wait
    isolationLevel: 'ReadCommitted'
  }
});

// Production ortamında connection pool ayarları
if (process.env.NODE_ENV === 'production') {
  // Production'da daha sıkı ayarlar
  globalForPrisma.prisma = prisma;
} else {
  // Development'ta global'e ata (hot reload için)
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown için cleanup
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma; 