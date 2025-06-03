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

dotenv.config();

const app = express();

// 🚀 Middleware stack - Professional order
app.use((req, res, next) => {
  console.log(`🌐 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
  next();
});

// TEST: CORS'u tamamen kapat
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://wisorsoft.xyz',
    'https://www.wisorsoft.xyz', // www'li versiyon eklendi
    'http://wisorsoft.xyz',
    'http://www.wisorsoft.xyz',
    'https://geras-client-rose.vercel.app' // Vercel domain'i eklendi
  ];
  
  const origin = req.headers.origin;
  console.log('🔍 Request Origin:', origin);
  console.log('✅ Allowed Origins:', allowedOrigins);
  
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    console.log('✅ Origin kabul edildi:', origin);
  } else {
    console.log('❌ Origin reddedildi:', origin);
  }
  
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// app.use(cors(corsOptions)); // Geçici olarak kapalı
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// 🚀 Security middleware - Combined helmet configuration
app.use(helmet({
  contentSecurityPolicy: false, // CSP'yi tamamen kapatıyoruz test için
  crossOriginEmbedderPolicy: false, // API için genellikle false
  hsts: {
    maxAge: 31536000, // 1 yıl
    includeSubDomains: true,
    preload: true
  }
}));

app.use(xss());
app.use(hpp());
app.use(mongoSanitize());

// 🚀 Routes
app.use('/api', routes);

// 🚀 Error handling - Professional order
app.all('*', notFoundHandler);
app.use(errorHandler);

export default app; 