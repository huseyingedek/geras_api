import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import hpp from 'hpp';
import xss from 'xss-clean';
import mongoSanitize from 'express-mongo-sanitize';

import routes from './routes/index.js';
import errorHandler from './middleware/errorHandler.js';
import notFoundHandler from './middleware/notFoundHandler.js';
import { checkDatabaseConnection } from './lib/prisma.js';

dotenv.config();

const app = express();

const corsOptions = {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin', 
    'X-Requested-With', 
    'Content-Type', 
    'Accept', 
    'Authorization',
    'Cache-Control',
    'Pragma'
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  maxAge: 86400
};

app.use((req, res, next) => {

  next();
});

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://wisorsoft.xyz', 'https://www.wisorsoft.xyz'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  } : false,

  crossOriginEmbedderPolicy: false,

  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  } : false,

  noSniff: true,
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'same-origin' }
}));

app.use(xss());
app.use(hpp());
app.use(mongoSanitize());

app.get('/health', async (req, res) => {
  try {
    const dbHealth = await checkDatabaseConnection();
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    
    res.status(dbHealth.status === 'healthy' ? 200 : 503).json({
      status: dbHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(uptime / 60)} minutes, ${Math.floor(uptime % 60)} seconds`,
      memory: {
        used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
        total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`
      },
      database: dbHealth,
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

app.use('/api', routes);

app.all('*', notFoundHandler);
app.use(errorHandler);

export default app; 