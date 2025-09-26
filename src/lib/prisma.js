import { PrismaClient } from '@prisma/client';

const createPrismaClient = () => {
  const isProduction = process.env.NODE_ENV === 'production';

  let databaseUrl = process.env.DATABASE_URL;

  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },

    log: isProduction ? ['error'] : ['query', 'error', 'warn'],

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