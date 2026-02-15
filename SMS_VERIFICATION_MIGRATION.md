# 🔄 SMS DOĞRULAMA SİSTEMİ MİGRATION GUIDE

## GENEL BAKIŞ

Bu guide, mevcut sisteme **telefon numarası SMS doğrulama** özelliğini eklemek için gerekli adımları içerir.

---

## 📋 YAPILAN DEĞİŞİKLİKLER

### 1. Database Schema
- Yeni tablo: `PhoneVerification`
- Alanlar: phone, code, expiresAt, isVerified, verifiedAt

### 2. Backend Files
- `src/utils/smsService.js` - SMS fonksiyonları eklendi
- `src/controllers/verificationController.js` - Yeni controller
- `src/controllers/authController.js` - SMS kontrolü eklendi
- `src/routes/authRoutes.js` - Yeni route'lar

### 3. API Endpoints
- `POST /api/auth/send-verification-code` - SMS gönder
- `POST /api/auth/verify-code` - Kodu doğrula
- `POST /api/auth/create-demo` - Artık SMS doğrulaması gerektirir

---

## 🚀 MIGRATION ADIMLARI

### Adım 1: Database Migration

```bash
# 1. Schema değişikliklerini uygula
npx prisma db push

# 2. Prisma client'ı yeniden oluştur
npx prisma generate
```

**Kontrol:**
```sql
-- PhoneVerification tablosunun oluştuğunu kontrol et
SELECT * FROM "PhoneVerification" LIMIT 1;
```

---

### Adım 2: Environment Variables Kontrolü

`.env` dosyasında SMS servisinin aktif olduğundan emin olun:

```env
# SMS Service (İletiBilgi)
SMS_ENABLED=true
ILETIBILGI_ENABLED=true
ILETIBILGI_API_URL=https://api.iletibilgi.com/api/v1/sms/send
ILETIBILGI_USERNAME=your_username
ILETIBILGI_PASSWORD=your_password
ILETIBILGI_SENDER=your_sender_name
```

**Not:** Development'ta test etmek için `SMS_ENABLED=false` yapabilirsiniz. Bu durumda SMS gönderilmez ama kod response'da görünür.

---

### Adım 3: Server Restart

```bash
# Server'ı yeniden başlat
npm run dev
```

**Kontrol:**
```
✅ İletiBilgi SMS servisi aktif
Server running on port 5000
```

---

## 🧪 TEST

### 1. Manuel Test (Postman/Thunder Client)

#### Test 1: SMS Kodu Gönder
```bash
curl -X POST http://localhost:5000/api/auth/send-verification-code \
  -H "Content-Type: application/json" \
  -d '{"phone": "+905551234567"}'
```

**Beklenen Response:**
```json
{
  "status": "success",
  "message": "Doğrulama kodu telefonunuza gönderildi",
  "data": {
    "phone": "+905551234567",
    "expiresAt": "2026-02-15T12:35:00.000Z",
    "code": "123456"  // Development'ta görünür
  }
}
```

#### Test 2: Kodu Doğrula
```bash
curl -X POST http://localhost:5000/api/auth/verify-code \
  -H "Content-Type: application/json" \
  -d '{"phone": "+905551234567", "code": "123456"}'
```

**Beklenen Response:**
```json
{
  "status": "success",
  "message": "Telefon numarası başarıyla doğrulandı",
  "data": {
    "phone": "+905551234567",
    "verified": true
  }
}
```

#### Test 3: Demo Hesap Oluştur (SMS Doğrulamalı)
```bash
curl -X POST http://localhost:5000/api/auth/create-demo \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Test Salon",
    "contactPerson": "Test User",
    "email": "test@salon.com",
    "phone": "+905551234567",
    "ownerUsername": "testowner",
    "ownerEmail": "owner@test.com",
    "ownerPassword": "Test123!",
    "ownerPhone": "+905551234567"
  }'
```

**Beklenen Response:**
```json
{
  "status": "success",
  "message": "Demo hesabınız başarıyla oluşturuldu...",
  "data": {
    "token": "...",
    "account": {...},
    "owner": {...}
  }
}
```

---

### 2. Hata Senaryolarını Test Et

#### Test 4: Doğrulanmamış Telefon ile Demo Oluşturma
```bash
curl -X POST http://localhost:5000/api/auth/create-demo \
  -H "Content-Type: application/json" \
  -d '{
    "ownerPhone": "+905559999999",
    ...
  }'
```

**Beklenen Hata:**
```json
{
  "status": "error",
  "message": "Telefon numarası doğrulanmamış. Lütfen önce SMS doğrulaması yapın",
  "code": "GENERAL_VALIDATION_ERROR"
}
```

#### Test 5: Yanlış Kod
```bash
curl -X POST http://localhost:5000/api/auth/verify-code \
  -H "Content-Type: application/json" \
  -d '{"phone": "+905551234567", "code": "999999"}'
```

**Beklenen Hata:**
```json
{
  "status": "error",
  "message": "Geçersiz doğrulama kodu",
  "code": "GENERAL_VALIDATION_ERROR"
}
```

#### Test 6: Süresi Dolmuş Kod (5 dakika sonra)
```bash
# 5 dakika bekle, sonra verify et
curl -X POST http://localhost:5000/api/auth/verify-code \
  -H "Content-Type: application/json" \
  -d '{"phone": "+905551234567", "code": "123456"}'
```

**Beklenen Hata:**
```json
{
  "status": "error",
  "message": "Doğrulama kodu süresi dolmuş. Lütfen yeni kod isteyin",
  "code": "GENERAL_VALIDATION_ERROR"
}
```

---

## 📊 DATABASE KONTROL

### Verification Kayıtlarını Görüntüle
```sql
SELECT 
  "VerificationID",
  "Phone",
  "Code",
  "ExpiresAt",
  "IsVerified",
  "VerifiedAt",
  "CreatedAt"
FROM "PhoneVerification"
ORDER BY "CreatedAt" DESC
LIMIT 10;
```

### Doğrulanmış Numaraları Listele
```sql
SELECT 
  "Phone",
  "VerifiedAt"
FROM "PhoneVerification"
WHERE "IsVerified" = true
ORDER BY "VerifiedAt" DESC;
```

### Süresi Dolmuş Kodları Bul
```sql
SELECT 
  "Phone",
  "Code",
  "ExpiresAt",
  "IsVerified"
FROM "PhoneVerification"
WHERE "ExpiresAt" < NOW()
  AND "IsVerified" = false;
```

---

## 🔧 ROLLBACK (GERİ ALMA)

Eğer bir sorun çıkarsa:

### 1. Backend Rollback
```bash
# authController.js'de SMS kontrolünü comment'le
# Line ~415-420
/*
const phoneVerified = await isPhoneVerified(ownerPhone);
if (!phoneVerified) {
  return next(new AppError('Telefon numarası doğrulanmamış...'));
}
*/
```

### 2. Database Rollback
```sql
-- PhoneVerification tablosunu sil
DROP TABLE "PhoneVerification";
```

### 3. Routes Rollback
```bash
# authRoutes.js'de SMS route'larını comment'le
/*
router.post('/send-verification-code', authLimiter, verificationController.sendVerificationCode);
router.post('/verify-code', authLimiter, verificationController.verifyCode);
*/
```

---

## ⚠️ ÖNEMLİ NOTLAR

### Production'a Geçiş
1. **SMS Servisi**: İletiBilgi credentials'larının doğru olduğundan emin olun
2. **Rate Limiting**: `authLimiter` aktif - IP başına 5 istek/saat
3. **Development Kodu**: Response'da kod göstermeyi kaldırın:
   ```javascript
   // verificationController.js - Line ~61
   // ...(process.env.NODE_ENV === 'development' && { code: code }) 
   // Bu satırı comment'le veya sil
   ```

### Güvenlik
1. Kodlar 5 dakika sonra otomatik geçersiz olur
2. Aynı numara için yeni kod istenirse eski kod silinir
3. Doğrulanmış kodlar tekrar kullanılamaz
4. Rate limiting ile spam korunması

### Performance
1. `idx_phone_verification` index'i hızlı sorgu için
2. `idx_verification_expiry` index'i süresi dolmuş kayıtlar için
3. Eski kayıtlar için otomatik cleanup yapılabilir (cron job)

---

## 🧹 MAINTENANCE (Optional)

Eski verification kayıtlarını temizlemek için cron job:

```javascript
// src/utils/cleanupVerificationCron.js
import prisma from '../lib/prisma.js';
import cron from 'node-cron';

export const cleanupExpiredVerifications = async () => {
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  const deleted = await prisma.phoneVerification.deleteMany({
    where: {
      createdAt: { lt: oneDayAgo }
    }
  });

  console.log(`🧹 ${deleted.count} eski verification kaydı temizlendi`);
};

export const startCleanupCron = () => {
  // Her gün gece 03:00'te çalış
  cron.schedule('0 3 * * *', async () => {
    console.log('🧹 Verification cleanup başlatıldı...');
    await cleanupExpiredVerifications();
  });
  
  console.log('🧹 Verification cleanup cron job başlatıldı');
};
```

`server.js`'e ekle:
```javascript
import { startCleanupCron } from './utils/cleanupVerificationCron.js';

// Server başlatıldığında
startCleanupCron();
```

---

## ✅ MIGRATION CHECKLIST

- [ ] `npx prisma db push` çalıştırıldı
- [ ] `npx prisma generate` çalıştırıldı
- [ ] `.env` SMS credentials kontrol edildi
- [ ] Server restart edildi
- [ ] SMS gönderme test edildi
- [ ] Kod doğrulama test edildi
- [ ] Demo hesap oluşturma test edildi
- [ ] Hata senaryoları test edildi
- [ ] Database kayıtları kontrol edildi
- [ ] Frontend'e API dökümantasyonu iletildi

---

## 📚 İLGİLİ DÖKÜMANLAR

- `SMS_VERIFICATION_API.md` - API dökümantasyonu (frontend için)
- `DEMO_POSTMAN_COLLECTION.json` - Güncellenmiş Postman collection
- `prisma/schema.prisma` - Database schema
- `src/controllers/verificationController.js` - Controller kodu
- `src/utils/smsService.js` - SMS servisi

---

## ❓ SORUN GİDERME

### Sorun: SMS gönderilmiyor
**Çözüm:**
1. `.env` dosyasında `ILETIBILGI_ENABLED=true` kontrolü
2. Credentials'ların doğru olduğunu kontrol et
3. İletiBilgi API durumunu kontrol et
4. Console log'lara bak: `❌ İletiBilgi SMS hatası`

### Sorun: "Telefon numarası doğrulanmamış" hatası
**Çözüm:**
1. Önce `/send-verification-code` endpoint'ini çağır
2. SMS'i doğrula `/verify-code` endpoint'i ile
3. Sonra `/create-demo` endpoint'ini çağır

### Sorun: "Geçersiz doğrulama kodu"
**Çözüm:**
1. Kodu doğru girdiğinden emin ol (6 haneli)
2. Kodun süresi dolmamış olmalı (5 dakika)
3. Development'ta response'daki `code` değerini kullan

### Sorun: Database migration hatası
**Çözüm:**
```bash
# Prisma cache temizle
rm -rf node_modules/.prisma
npx prisma generate
npx prisma db push
```

---

## 🎉 BAŞARILI MIGRATION!

Tüm adımları tamamladıysan:
- ✅ SMS doğrulama sistemi aktif
- ✅ Demo hesap oluşturma SMS gerektirir
- ✅ Tüm testler başarılı
- ✅ Production'a hazır

Frontend'e `SMS_VERIFICATION_API.md` dökümanını ilet ve entegrasyonu başlatsınlar! 🚀
