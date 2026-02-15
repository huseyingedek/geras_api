# 🎯 DEMO HESAP SİSTEMİ - KURULUM REHBERİ

## 📋 Yapılan Değişiklikler Özeti

### 1️⃣ Database Değişiklikleri
- ✅ `Accounts` tablosuna 3 yeni alan eklendi:
  - `isDemoAccount` (Boolean) - Demo hesap mı?
  - `demoExpiresAt` (DateTime) - Demo süre sonu
  - `demoStatus` (Enum) - Demo durumu
- ✅ Yeni `DemoStatus` enum eklendi (5 durum)
- ✅ Index eklendi: `idx_accounts_demo`

### 2️⃣ Backend Değişiklikleri
- ✅ `authController.js` - Demo hesap oluşturma endpoint'i
- ✅ `adminController.js` - 4 yeni demo yönetim fonksiyonu
- ✅ `authRoutes.js` - Demo oluşturma route'u
- ✅ `adminRoutes.js` - Demo yönetim route'ları
- ✅ `demoCronJob.js` - Otomatik süre kontrolü
- ✅ `server.js` - Cron job başlatma

### 3️⃣ Dokümantasyon
- ✅ `DEMO_ACCOUNT_API_DOCUMENTATION.md` - Detaylı API dokümanı
- ✅ `demo-signup-form.html` - Demo kayıt formu örneği
- ✅ `DEMO_SYSTEM_SETUP.md` - Bu kurulum rehberi

---

## 🚀 KURULUM ADIMLARI

### Adım 1: Database Migration

```bash
# Prisma migration çalıştır
npx prisma db push

# Veya prisma generate
npx prisma generate
```

**Manuel SQL (Gerekirse):**
```sql
-- Accounts tablosuna yeni alanlar ekle
ALTER TABLE "Accounts" 
ADD COLUMN "IsDemoAccount" BOOLEAN DEFAULT false,
ADD COLUMN "DemoExpiresAt" TIMESTAMP,
ADD COLUMN "DemoStatus" TEXT DEFAULT 'ACTIVE';

-- Index ekle
CREATE INDEX "idx_accounts_demo" ON "Accounts"("IsDemoAccount", "DemoStatus");

-- DemoStatus enum oluştur (PostgreSQL için)
-- Not: Prisma otomatik oluşturacak, manual gerekmiyor
```

### Adım 2: Server Restart

```bash
# Server'ı yeniden başlat
npm start

# Log'larda şunları görmelisiniz:
# ✅ Database connection established
# ✅ Demo hesap cron job başlatıldı (Her 6 saatte bir çalışacak)
# 🚀 İlk demo hesap kontrolü yapılıyor...
```

### Adım 3: Test

#### Test 1: Demo Hesap Oluşturma (Postman/Curl)
```bash
curl -X POST http://localhost:5000/api/auth/create-demo \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Test Salon",
    "businessType": "SESSION_BASED",
    "ownerUsername": "testowner",
    "ownerEmail": "test@example.com",
    "ownerPassword": "Test123!",
    "phone": "+90 532 123 45 67"
  }'
```

**Beklenen Response:**
```json
{
  "status": "success",
  "token": "eyJhbGciOi...",
  "data": {
    "user": {
      "id": 1,
      "username": "testowner",
      "email": "test@example.com",
      "role": "OWNER",
      "accountId": 1
    }
  }
}
```

#### Test 2: Login Test
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!"
  }'
```

#### Test 3: Admin - Pending Demo Listesi
```bash
# Önce admin token alın, sonra:
curl -X GET http://localhost:5000/api/admin/demo-accounts/pending \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

---

## 🧪 DEMO SÜRESİNİ TEST ETMEK

### Seçenek 1: Süreyi Kısalt (Önerilen)

`authController.js` - `createDemoAccount` fonksiyonunda:

```javascript
// Değiştir (satır ~261):
const demoExpiresAt = new Date();
demoExpiresAt.setDate(demoExpiresAt.getDate() + 2); // 2 gün

// Test için 5 dakika:
const demoExpiresAt = new Date();
demoExpiresAt.setMinutes(demoExpiresAt.getMinutes() + 5); // 5 dakika
```

### Seçenek 2: Cron'u Sık Çalıştır

`demoCronJob.js` - `startDemoCronJob` fonksiyonunda:

```javascript
// Değiştir (satır ~84):
cron.schedule('0 */6 * * *', async () => { // Her 6 saatte bir

// Test için her dakika:
cron.schedule('* * * * *', async () => { // Her dakika
```

### Seçenek 3: Manuel Çalıştır

```javascript
// Server console'da:
import { checkExpiredDemoAccounts } from './src/utils/demoCronJob.js';
await checkExpiredDemoAccounts();
```

---

## 📊 DATABASE KONTROL

### Demo Hesapları Görüntüle
```sql
SELECT 
  "AccountID",
  "BusinessName",
  "Email",
  "IsDemoAccount",
  "DemoStatus",
  "DemoExpiresAt",
  "CreatedAt"
FROM "Accounts"
WHERE "IsDemoAccount" = true
ORDER BY "CreatedAt" DESC;
```

### Demo Süresini Manuel Değiştir (Test)
```sql
-- Süreyi geçmişe al (hemen dolsun)
UPDATE "Accounts"
SET "DemoExpiresAt" = NOW() - INTERVAL '1 hour'
WHERE "AccountID" = 1;

-- Cron'u manuel tetikle veya login dene
```

### Demo Durumunu Kontrol Et
```sql
SELECT 
  "DemoStatus", 
  COUNT(*) as count
FROM "Accounts"
WHERE "IsDemoAccount" = true
GROUP BY "DemoStatus";
```

---

## 🎨 FRONTEND ENTEGRASYONU

### 1. Demo Kayıt Formu

Hazır HTML formu kullanabilirsiniz:
```
demo-signup-form.html
```

**API URL'ini güncelleyin:**
```javascript
const API_URL = 'https://your-api-url.com/api';
```

### 2. Login Kontrolü

Demo süresi dolmuş kullanıcılar için özel mesaj gösterin:

```javascript
try {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const data = await response.json();

  if (!response.ok) {
    if (data.error.code === 'ACCOUNT_RESTRICTED') {
      // Demo süresi dolmuş veya kısıtlı
      if (data.error.message.includes('Demo süreniz dolmuştur')) {
        // Özel mesaj göster
        alert('⏰ Demo süreniz doldu. Admin onayı bekleniyor.');
      } else if (data.error.message.includes('sona ermiştir')) {
        // Kısıtlı hesap
        alert('❌ Hesabınız kısıtlandı. Destek ile iletişime geçin.');
      }
    }
  }
} catch (error) {
  console.error('Login error:', error);
}
```

### 3. Dashboard - Demo Uyarısı

Aktif demo kullanıcıları için kalan süreyi gösterin:

```javascript
// Dashboard'da kullanıcı bilgisini çek
const response = await fetch('/api/auth/me', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { user, account } = await response.json();

// Demo kontrolü
if (account.isDemoAccount && account.demoStatus === 'ACTIVE') {
  const now = new Date();
  const expiresAt = new Date(account.demoExpiresAt);
  const hoursLeft = Math.floor((expiresAt - now) / (1000 * 60 * 60));

  if (hoursLeft < 24) {
    // 24 saat kaldıysa uyarı göster
    showBanner(`⏰ Demo süreniz ${hoursLeft} saat içinde dolacak!`);
  }
}
```

---

## 🔧 ADMIN PANELİ ENTEGRASYONU

### 1. Pending Demo Listesi

```javascript
// Admin dashboard'da
const getPendingDemos = async () => {
  const response = await fetch('/api/admin/demo-accounts/pending', {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });

  const { data, results } = await response.json();
  
  // Badge göster
  setBadge('pendingDemos', results); // 3 onay bekliyor
  
  return data;
};
```

### 2. Demo Onaylama

```javascript
const approveDemo = async (accountId, plan) => {
  const response = await fetch(`/api/admin/demo-accounts/${accountId}/approve`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      subscriptionPlan: plan // 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'
    })
  });

  if (response.ok) {
    alert('✅ Demo hesap onaylandı!');
    refreshDemoList();
  }
};
```

### 3. Demo Reddetme

```javascript
const rejectDemo = async (accountId, reason) => {
  const response = await fetch(`/api/admin/demo-accounts/${accountId}/reject`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reason })
  });

  if (response.ok) {
    alert('❌ Demo hesap reddedildi.');
    refreshDemoList();
  }
};
```

---

## 📧 EMAIL BİLDİRİMLERİ (Opsiyonel)

### Demo Süre Doldu - Owner Email

`demoCronJob.js` - `checkExpiredDemoAccounts` fonksiyonuna ekleyin:

```javascript
// TODO kısmına:
import { sendEmail } from './emailService.js';

// Her expired demo için
for (const demo of expiredDemos) {
  // ...
  
  // Owner'a email gönder
  const ownerEmail = demo.users[0]?.email;
  if (ownerEmail) {
    await sendEmail({
      to: ownerEmail,
      subject: '⏰ GERAS Demo Süreniz Doldu',
      html: `
        <h2>Merhaba ${demo.businessName},</h2>
        <p>2 günlük demo süreniz sona erdi.</p>
        <p>Hesabınız şu anda admin onayı bekliyor.</p>
        <p>En kısa sürede size dönüş yapacağız.</p>
      `
    });
  }
}
```

### Demo Onaylandı - Owner Email

`adminController.js` - `approveDemoAccount` fonksiyonuna ekleyin:

```javascript
// Onay sonrası
const owner = await prisma.user.findFirst({
  where: { accountId: parseInt(id), role: 'OWNER' }
});

if (owner?.email) {
  await sendEmail({
    to: owner.email,
    subject: '🎉 GERAS Hesabınız Onaylandı!',
    html: `
      <h2>Tebrikler!</h2>
      <p>Demo hesabınız onaylandı.</p>
      <p>Paketiniz: <strong>${subscriptionPlan}</strong></p>
      <p>Şimdi giriş yaparak devam edebilirsiniz.</p>
    `
  });
}
```

---

## 🐛 SORUN GİDERME

### Problem 1: Cron Job Çalışmıyor

**Kontrol:**
```bash
# Server log'larına bakın
npm start

# Görmeli:
✅ Demo hesap cron job başlatıldı
```

**Çözüm:**
```javascript
// server.js - cron import kontrolü
import { startDemoCronJob } from './utils/demoCronJob.js';
```

### Problem 2: Demo Hesap Oluşturulamıyor

**Error:** `addBasicPermissionsToAccount is not a function`

**Çözüm:**
```javascript
// authController.js başına ekle
import { addBasicPermissionsToAccount } from '../utils/permissionUtils.js';
```

### Problem 3: Enum Hatası

**Error:** `Invalid value for enum DemoStatus`

**Çözüm:**
```bash
# Prisma'yı yeniden generate et
npx prisma generate
npx prisma db push
```

### Problem 4: Demo Süresi Dolmuyor

**Kontrol:**
```sql
-- Süreyi kontrol et
SELECT "DemoExpiresAt", NOW() FROM "Accounts" WHERE "AccountID" = 1;

-- Süre dolmuş mu?
SELECT 
  CASE 
    WHEN "DemoExpiresAt" <= NOW() THEN 'EXPIRED'
    ELSE 'ACTIVE'
  END as status
FROM "Accounts" 
WHERE "AccountID" = 1;
```

---

## ✅ CHECKLIST

Backend:
- [ ] Prisma schema güncellendi
- [ ] Database migration yapıldı
- [ ] authController.js güncellendi
- [ ] adminController.js güncellendi
- [ ] Routes eklendi
- [ ] Cron job eklendi
- [ ] Server restart edildi

Test:
- [ ] Demo hesap oluşturma çalışıyor
- [ ] Login çalışıyor
- [ ] Admin demo listesi görünüyor
- [ ] Demo onaylama çalışıyor
- [ ] Demo reddetme çalışıyor
- [ ] Cron job çalışıyor (süre kontrolü)

Frontend:
- [ ] Demo kayıt formu hazır
- [ ] API URL güncellendi
- [ ] Login demo kontrolü eklendi
- [ ] Admin paneli entegre edildi

---

## 📞 DESTEK

Sorularınız için:
- Email: info@gerasyonetim.com
- Dokümantasyon: `DEMO_ACCOUNT_API_DOCUMENTATION.md`

---

**Hazırlayan:** GERAS Development Team  
**Tarih:** 15 Şubat 2026  
**Versiyon:** 1.0
