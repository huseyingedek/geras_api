import { PrismaClient } from '@prisma/client';

const createPrismaClient = () => {
  let databaseUrl = process.env.DATABASE_URL;

  // Neon pooler için bağlantı havuzu ayarları:
  // pool_timeout   → Havuzdan bağlantı beklerken timeout (saniye)
  // connection_limit → Prisma'nın açacağı max bağlantı sayısı
  if (databaseUrl && databaseUrl.includes('neon.tech')) {
    const url = new URL(databaseUrl);
    if (!url.searchParams.has('pool_timeout'))    url.searchParams.set('pool_timeout',    '30');
    if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '5');
    databaseUrl = url.toString();
  }

  return new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
    log: ['error'],
    errorFormat: 'minimal',
  });
};

const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV === 'production') {
  globalForPrisma.prisma = prisma;
} else {
  globalForPrisma.prisma = prisma;
}

const gracefulDisconnect = async () => {
  try {
    await prisma.$disconnect();
    console.log('✅ Prisma client disconnected gracefully');
  } catch (error) {
    console.error('❌ Error during Prisma disconnect:', error);
    process.exit(1);
  }
};

process.on('beforeExit', gracefulDisconnect);
process.on('SIGINT', gracefulDisconnect);
process.on('SIGTERM', gracefulDisconnect);

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