import { PrismaClient } from '@prisma/client';

const createPrismaClient = () => {
  let databaseUrl = process.env.DATABASE_URL;

  // Neon serverless pooler için gerekli parametreler:
  // pgbouncer=true  → PgBouncer uyumluluğu (prepared statement desteği)
  // connect_timeout → Cold-start bekleme süresi (saniye)
  if (databaseUrl && databaseUrl.includes('neon.tech')) {
    const url = new URL(databaseUrl);
    if (!url.searchParams.has('pgbouncer'))      url.searchParams.set('pgbouncer',      'true');
    if (!url.searchParams.has('connect_timeout')) url.searchParams.set('connect_timeout', '30');
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