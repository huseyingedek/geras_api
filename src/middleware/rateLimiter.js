import rateLimit from 'express-rate-limit';

// 🚀 Genel API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 100, // IP başına 15 dakikada 100 request
  message: {
    status: 'error',
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Çok fazla istek gönderdiniz. Lütfen daha sonra tekrar deneyin.',
      data: { retryAfter: '15 minutes' }
    },
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

// 🚀 Auth endpoint'leri için sıkı limiter
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika  
  max: 30, // IP başına 15 dakikada 5 login denemesi
  message: {
    status: 'error',
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Çok fazla giriş denemesi. Lütfen 15 dakika sonra tekrar deneyin.',
      data: { retryAfter: '15 minutes' }
    },
    timestamp: new Date().toISOString()
  },
  skipSuccessfulRequests: true, // Başarılı girişleri sayma
  skipFailedRequests: false
});

// 🚀 Hassas işlemler için ultra sıkı limiter
export const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 saat
  max: 10, // IP başına 1 saatte 10 request
  message: {
    status: 'error',
    error: {
      code: 'STRICT_RATE_LIMIT_EXCEEDED',
      message: 'Bu işlem için çok fazla istek gönderdiniz. Lütfen 1 saat sonra tekrar deneyin.',
      data: { retryAfter: '1 hour' }
    },
    timestamp: new Date().toISOString()
  }
});
