# 🚀 Geras API - Professional Salon Management System

Modern salon ve güzellik merkezleri için geliştirilmiş profesyonel yönetim sistemi API'si.

## ✨ Özellikler

- **Müşteri Yönetimi**: Kapsamlı müşteri profilleri ve geçmiş takibi
- **Randevu Sistemi**: Gelişmiş randevu planlama ve çakışma kontrolü  
- **Personel Yönetimi**: Rol tabanlı yetkilendirme ve çalışma saatleri
- **Hizmet Yönetimi**: Seans tabanlı ve tek seferlik hizmet desteği
- **Satış & Ödeme**: Detaylı satış takibi ve ödeme yönetimi
- **Dashboard & Raporlama**: Gerçek zamanlı istatistikler

## 🏗️ Teknik Mimari

- **Framework**: Express.js + Node.js
- **Database**: MySQL + Prisma ORM
- **Authentication**: JWT + bcrypt
- **Security**: Helmet, CORS, Rate Limiting
- **Monitoring**: Health checks, Error tracking

## 🚀 Quick Start

### 1. Kurulum
```bash
git clone https://github.com/huseyingedek/geras_api.git
cd geras_api
npm install
```

### 2. Environment Configuration
```bash
# .env dosyasını oluşturun
NODE_ENV=production
PORT=5000
DATABASE_URL="mysql://user:pass@host:port/db"
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

### 3. Database Setup
```bash
npx prisma generate
npx prisma db push
```

### 4. Start Application
```bash
# Production
npm start

# Development
npm run dev
```

## 📋 API Documentation

### Authentication
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}
```

### Health Check
```http
GET /health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": "5 minutes, 30 seconds",
  "memory": {
    "used": "45 MB",
    "total": "128 MB"
  },
  "database": {
    "status": "healthy"
  },
  "environment": "production"
}
```

## 🔧 Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | development | Application environment |
| `PORT` | No | 5000 | Server port |
| `DATABASE_URL` | Yes | - | MySQL connection string |
| `JWT_SECRET` | Yes | - | JWT signing secret (min 32 chars) |
| `ALLOWED_ORIGINS` | No | * | CORS allowed origins (comma-separated) |

### Database Connection Pool

Production ortamında optimize edilmiş connection pool ayarları:
- **Connection Limit**: 5
- **Pool Timeout**: 20 seconds
- **Connect Timeout**: 30 seconds
- **Transaction Timeout**: 15 seconds

## 🛡️ Security Features

- **CORS**: Environment-based origin control
- **Helmet**: Security headers
- **Rate Limiting**: API abuse protection
- **Data Sanitization**: XSS and injection prevention
- **JWT Authentication**: Secure token-based auth
- **Password Hashing**: bcrypt with salt rounds

## 📊 Monitoring & Health

### Health Check Endpoint
- **URL**: `/health`
- **Method**: GET
- **Response**: System status, memory usage, database health

### Error Handling
- Comprehensive error categorization
- Prisma-specific error handling
- Production-safe error responses
- Structured error logging

## 🚀 Deployment

### Render Deployment
```bash
# Render otomatik deployment için
git push origin main
```

### Environment Setup
```bash
# Production environment variables
NODE_ENV=production
DATABASE_URL=mysql://user:pass@host:port/db?connection_limit=5&pool_timeout=20
JWT_SECRET=production-jwt-secret-min-32-characters
ALLOWED_ORIGINS=https://yourdomain.com,https://api.yourdomain.com
```

### Database Migration
```bash
# Production'da database schema update
npx prisma db push
```

## 🐛 Troubleshooting

### Common Issues

#### 1. CORS Errors
```
❌ CORS policy violation: Origin not allowed
```
**Çözüm**: `ALLOWED_ORIGINS` environment variable'ında domain'inizi kontrol edin.

#### 2. Database Connection Issues  
```
❌ Database connection failed: ERROR 42000 (1203)
```
**Çözüm**: Connection pool limitleri kontrol edin, fazla client instance'ları kapatın.

#### 3. JWT Token Errors
```
❌ JsonWebTokenError: invalid token
```
**Çözüm**: Frontend'de token format ve Bearer prefix kontrol edin.

### Debug Mode
Development ortamında detaylı logging:
```bash
NODE_ENV=development npm run dev
```

### Performance Monitoring
- Memory usage: `/health` endpoint
- Database performance: Prisma query logs
- Request tracking: Morgan middleware

## 📈 Performance Optimization

### Database
- ✅ Connection pooling (max 5 connections)
- ✅ Transaction timeouts
- ✅ Query optimization
- ✅ Index usage

### Application
- ✅ Gzip compression
- ✅ Request size limits
- ✅ Caching headers
- ✅ Graceful shutdowns

### Security
- ✅ Helmet security headers
- ✅ CORS configuration
- ✅ Rate limiting
- ✅ Input validation

## 🤝 API Response Format

### Success Response
```json
{
  "status": "success",
  "data": { ... },
  "message": "Operation completed successfully"
}
```

### Error Response
```json
{
  "status": "error", 
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "data": { "field": "email" }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 📞 Support

- **Repository**: [GitHub](https://github.com/huseyingedek/geras_api)
- **Issues**: GitHub Issues
- **Documentation**: API docs

## 🔄 Version History

### v1.0.0 (Current)
- ✅ Professional connection pool management
- ✅ Enhanced CORS configuration  
- ✅ Comprehensive error handling
- ✅ Health monitoring
- ✅ Security hardening
- ✅ Performance optimization

---

**📝 Not**: Bu API profesyonel production kullanımı için optimize edilmiştir. Development ve production ortamları için farklı konfigürasyonlar mevcuttur. 