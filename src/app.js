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

// 🚀 Professional CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    console.log('🔍 CORS Request Origin:', origin);
    
    const allowedOrigins = process.env.NODE_ENV === 'production' 
      ? process.env.ALLOWED_ORIGINS?.split(',') || ['https://wisorsoft.xyz', 'http://wisorsoft.xyz', 'https://geras-api.onrender.com', 'http://geras-api.onrender.com', 'http://localhost:3000']
      : ['https://wisorsoft.xyz', 'http://wisorsoft.xyz', 'https://geras-api.onrender.com', 'http://geras-api.onrender.com', 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:8080', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173', 'http://localhost:5173'];
    
    console.log('✅ Allowed Origins:', allowedOrigins);
    console.log('🌍 NODE_ENV:', process.env.NODE_ENV || 'undefined');
    
    // Eğer origin undefined ise (Postman gibi) veya allowed origins listesinde varsa kabul et
    if (!origin || allowedOrigins.includes(origin)) {
      console.log('✅ Origin kabul edildi:', origin);
      callback(null, true);
    } else {
      console.log('❌ Origin reddedildi:', origin);
      callback(new Error('CORS tarafından reddedildi'), false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

// 🚀 Middleware stack - Professional order
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// 🚀 Security middleware - Combined helmet configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
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