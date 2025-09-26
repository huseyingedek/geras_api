import { PrismaClient } from '@prisma/client';

const createPrismaClient = () => {
  const isProduction = process.env.NODE_ENV === 'production';

  const ENV_CONN_LIMIT = parseInt(process.env.DB_CONNECTION_LIMIT || (isProduction ? '1' : '3'));
  const ENV_POOL_TIMEOUT = parseInt(process.env.DB_POOL_TIMEOUT || (isProduction ? '120' : '30'));
  const ENV_CONNECT_TIMEOUT = parseInt(process.env.DB_CONNECT_TIMEOUT || (isProduction ? '120' : '30'));

  let databaseUrl = process.env.DATABASE_URL;

  if (isProduction && databaseUrl) {
    const hasQuery = databaseUrl.includes('?');
    const sep = hasQuery ? '&' : '?';

    if (!databaseUrl.includes('connection_limit')) {
      databaseUrl += `${sep}connection_limit=${ENV_CONN_LIMIT}`;
    }
    if (!databaseUrl.includes('pool_timeout')) {
      databaseUrl += `${databaseUrl.includes('?') ? '&' : '?'}pool_timeout=${ENV_POOL_TIMEOUT}`;
    }
    if (!databaseUrl.includes('connect_timeout')) {
      databaseUrl += `${databaseUrl.includes('?') ? '&' : '?'}connect_timeout=${ENV_CONNECT_TIMEOUT}`;
    }
    if (!databaseUrl.includes('max_connections')) {
      databaseUrl += `${databaseUrl.includes('?') ? '&' : '?'}max_connections=1`;
    }
    if (!databaseUrl.includes('wait_timeout')) {
      databaseUrl += `${databaseUrl.includes('?') ? '&' : '?'}wait_timeout=600`;
    }
    if (!databaseUrl.includes('interactive_timeout')) {
      databaseUrl += `${databaseUrl.includes('?') ? '&' : '?'}interactive_timeout=600`;
    }
    if (!databaseUrl.includes('autoReconnect')) {
      databaseUrl += `${databaseUrl.includes('?') ? '&' : '?'}autoReconnect=true`;
    }
  }

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

const isTransientDbError = (err) => {
  if (!err) return false;
  const code = err.code || '';
  const msg = (err.message || '').toLowerCase();
  return (
    code === 'P1001' ||
    code === 'P1010' ||
    code === 'P1011' ||
    code === 'P1017' ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('connection') ||
    msg.includes('socket hang up') ||
    msg.includes('server has gone away') ||
    msg.includes('lost connection')
  );
};

const MAX_ATTEMPTS = parseInt(process.env.DB_RETRY_ATTEMPTS || '1');
const BACKOFF_MS = parseInt(process.env.DB_RETRY_BACKOFF_MS || '1000');

if (!globalForPrisma.__retry_middleware_installed) {
  prisma.$use(async (params, next) => {
    let attempt = 0;
    while (true) {
      try {
        return await next(params);
      } catch (err) {
        if (attempt < MAX_ATTEMPTS && isTransientDbError(err)) {
          attempt += 1;
          const wait = BACKOFF_MS * attempt;
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`⚠️ Prisma transient error, retrying ${attempt}/${MAX_ATTEMPTS} in ${wait}ms:`, err.code || err.message);
          }
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        throw err;
      }
    }
  });
  globalForPrisma.__retry_middleware_installed = true;
}

export default prisma; 