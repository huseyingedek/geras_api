# 🔒 GÜVENLİ SUBSCRIPTION PLAN MİGRATION

## ⚠️ ÖNEMLİ: Canlı DB için Güvenli Migration

Bu migration, mevcut verilere **ZARAR VERMEDEN** subscriptionPlan alanını düzenler.

---

## 📊 MEVCUT DURUM ANALİZİ

### Adım 1: Mevcut Verileri Kontrol Et

```sql
-- Mevcut subscription plan değerlerini gör
SELECT 
  "AccountID",
  "BusinessName",
  "SubscriptionPlan",
  "IsDemoAccount",
  "IsActive"
FROM "Accounts"
ORDER BY "AccountID";

-- Kaç farklı değer var?
SELECT 
  "SubscriptionPlan", 
  COUNT(*) as count
FROM "Accounts"
GROUP BY "SubscriptionPlan";
```

**Muhtemel Sonuç:**
```
SubscriptionPlan | count
-----------------|------
NULL             | 5
premium          | 10
Premium          | 3
PREMIUM          | 2
professional     | 1
```

---

## 🛠️ MİGRATION STRATEJİSİ

### Seçenek 1: Tüm Mevcut Hesapları PROFESSIONAL Yap (Önerilen)

Bu en güvenli yöntem. Mevcut tüm hesaplar PROFESSIONAL olarak işaretlenir.

```sql
-- 1. Demo olmayan tüm hesapları PROFESSIONAL yap
UPDATE "Accounts"
SET "SubscriptionPlan" = 'PROFESSIONAL'
WHERE "IsDemoAccount" = false OR "IsDemoAccount" IS NULL;

-- 2. Demo hesapları DEMO yap
UPDATE "Accounts"
SET "SubscriptionPlan" = 'DEMO'
WHERE "IsDemoAccount" = true;

-- 3. Kontrol et
SELECT 
  "SubscriptionPlan", 
  COUNT(*) as count,
  "IsDemoAccount"
FROM "Accounts"
GROUP BY "SubscriptionPlan", "IsDemoAccount";
```

### Seçenek 2: Mevcut Değerlere Göre Akıllı Mapping

Eğer önceden bazı hesaplara özel planlar verdiyseniz:

```sql
-- 1. NULL olanları PROFESSIONAL yap
UPDATE "Accounts"
SET "SubscriptionPlan" = 'PROFESSIONAL'
WHERE "SubscriptionPlan" IS NULL;

-- 2. Küçük/büyük harf farketmeksizin normalize et
UPDATE "Accounts"
SET "SubscriptionPlan" = 'STARTER'
WHERE UPPER("SubscriptionPlan") = 'STARTER' 
   OR UPPER("SubscriptionPlan") = 'BASIC';

UPDATE "Accounts"
SET "SubscriptionPlan" = 'PROFESSIONAL'
WHERE UPPER("SubscriptionPlan") IN ('PROFESSIONAL', 'PRO');

UPDATE "Accounts"
SET "SubscriptionPlan" = 'PREMIUM'
WHERE UPPER("SubscriptionPlan") IN ('PREMIUM', 'ENTERPRISE', 'CORPORATE', 'KURUMSAL');

-- 3. Demo hesapları
UPDATE "Accounts"
SET "SubscriptionPlan" = 'DEMO'
WHERE "IsDemoAccount" = true;

-- 4. Hala NULL veya tanımsız olanları PROFESSIONAL yap
UPDATE "Accounts"
SET "SubscriptionPlan" = 'PROFESSIONAL'
WHERE "SubscriptionPlan" NOT IN ('STARTER', 'PROFESSIONAL', 'PREMIUM', 'DEMO');
```

---

## ✅ MİGRATION ADIMLARI

### 1. YEDEK AL (Çok Önemli!)

```bash
# PostgreSQL backup
pg_dump -h your-host -U your-user -d your-database -t Accounts > accounts_backup_$(date +%Y%m%d_%H%M%S).sql

# Veya sadece SubscriptionPlan sütunu
psql -h your-host -U your-user -d your-database -c "COPY (SELECT \"AccountID\", \"SubscriptionPlan\" FROM \"Accounts\") TO '/tmp/subscription_backup.csv' CSV HEADER;"
```

### 2. Transaction İçinde Test Et

```sql
BEGIN;

-- Migration komutlarını çalıştır (yukarıdaki seçeneklerden birini)
UPDATE "Accounts"
SET "SubscriptionPlan" = 'PROFESSIONAL'
WHERE "IsDemoAccount" = false OR "IsDemoAccount" IS NULL;

UPDATE "Accounts"
SET "SubscriptionPlan" = 'DEMO'
WHERE "IsDemoAccount" = true;

-- Kontrol et
SELECT 
  "SubscriptionPlan", 
  COUNT(*) as count
FROM "Accounts"
GROUP BY "SubscriptionPlan";

-- ✅ İyi görünüyorsa:
COMMIT;

-- ❌ Bir sorun varsa:
-- ROLLBACK;
```

### 3. Prisma Schema Güncellemesi

Schema'da subscriptionPlan zaten güncellendi:

```prisma
subscriptionPlan String? @default("PROFESSIONAL") @map("SubscriptionPlan")
```

### 4. Prisma Generate

```bash
cd "c:\Users\hgede\Desktop\GERAS SYSTEM\BACKEND"
npx prisma generate
```

**NOT:** `prisma db push` YAPMA! Sadece generate yeterli, zaten database manuel olarak güncellendi.

### 5. Server Restart

```bash
npm start
```

---

## 🧪 TEST SENARYOLARI

### Test 1: Mevcut Hesapların Planını Kontrol Et

```bash
# API ile kontrol
curl http://localhost:5000/api/admin/accounts \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

Tüm hesapların `subscriptionPlan` alanı dolu olmalı.

### Test 2: Frontend'de Plan Kontrolü

```javascript
// Frontend'de user bilgisi alındığında
const { account } = await getMe();

console.log('Subscription Plan:', account.subscriptionPlan);

// STARTER, PROFESSIONAL, PREMIUM veya DEMO olmalı
if (account.subscriptionPlan === 'STARTER') {
  // Starter özellikleri göster
} else if (account.subscriptionPlan === 'PROFESSIONAL') {
  // Professional özellikleri göster
} else if (account.subscriptionPlan === 'PREMIUM') {
  // Premium özellikleri göster
}
```

### Test 3: Demo Hesap Onaylama

```bash
# Demo hesap onayla ve plan seç
curl -X POST http://localhost:5000/api/admin/demo-accounts/1/approve \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"subscriptionPlan": "PROFESSIONAL"}'
```

### Test 4: Normal Hesap Güncelleme

```bash
# Hesap paketini değiştir
curl -X PUT http://localhost:5000/api/admin/accounts/1 \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"subscriptionPlan": "PREMIUM"}'
```

---

## 🚨 SORUN GİDERME

### Problem 1: Bazı Hesapların Planı Hala NULL

**Kontrol:**
```sql
SELECT "AccountID", "BusinessName", "SubscriptionPlan"
FROM "Accounts"
WHERE "SubscriptionPlan" IS NULL;
```

**Çözüm:**
```sql
-- Hepsini PROFESSIONAL yap
UPDATE "Accounts"
SET "SubscriptionPlan" = 'PROFESSIONAL'
WHERE "SubscriptionPlan" IS NULL;
```

### Problem 2: Frontend'de Plan Gösterilmiyor

**Kontrol:**
```javascript
// API response'u kontrol et
const response = await fetch('/api/auth/me');
const data = await response.json();
console.log('Account:', data.data.account);
```

**Çözüm:**
- Server restart yaptınız mı?
- Prisma generate çalıştırdınız mı?
- Cache temizleyin (browser + API)

### Problem 3: "Invalid enum value" Hatası

**Hata:**
```
Invalid value for enum SubscriptionPlan: 'premium'
```

**Çözüm:**
```sql
-- Geçersiz değerleri düzelt
UPDATE "Accounts"
SET "SubscriptionPlan" = 'PROFESSIONAL'
WHERE "SubscriptionPlan" NOT IN ('STARTER', 'PROFESSIONAL', 'PREMIUM', 'DEMO');
```

---

## 📋 MİGRATION CHECKLIST

Önce (Hazırlık):
- [ ] Mevcut verileri analiz et (`SELECT` sorguları)
- [ ] Yedek al (accounts_backup.sql)
- [ ] Test ortamında dene (varsa)

Migration:
- [ ] Transaction içinde test et (`BEGIN ... ROLLBACK`)
- [ ] Migration'ı uygula (`BEGIN ... COMMIT`)
- [ ] Verileri kontrol et (COUNT, GROUP BY)
- [ ] Prisma generate çalıştır
- [ ] Server restart

Sonra (Test):
- [ ] API endpoint'leri test et
- [ ] Frontend'de planlar görünüyor mu?
- [ ] Demo hesap onaylama test et
- [ ] Normal hesap güncelleme test et
- [ ] Login çalışıyor mu?

---

## 💾 ROLLBACK PLANI

Eğer bir şeyler ters giderse:

### Yedekten Geri Yükle

```bash
# SQL backup'ı geri yükle
psql -h your-host -U your-user -d your-database < accounts_backup_20260215_123456.sql
```

### Sadece SubscriptionPlan Geri Al

```sql
-- Eski haline döndür (CSV'den)
-- 1. CSV'yi import et
CREATE TEMP TABLE temp_subscription (
  account_id INT,
  old_plan TEXT
);

COPY temp_subscription FROM '/tmp/subscription_backup.csv' CSV HEADER;

-- 2. Geri yükle
UPDATE "Accounts" a
SET "SubscriptionPlan" = t.old_plan
FROM temp_subscription t
WHERE a."AccountID" = t.account_id;
```

---

## 🎯 SONUÇ

✅ Migration tamamlandıktan sonra:

1. **Tüm hesapların** `subscriptionPlan` değeri olacak
2. **Demo hesaplar** `DEMO` olarak işaretli olacak
2. **Normal hesaplar** `STARTER`, `PROFESSIONAL` veya `PREMIUM` paketinde olacak
4. **Frontend** bu plana göre özellikleri gösterecek
5. **Admin** demo onaylarken paket seçebilecek

---

**Hazırlayan:** GERAS Development Team  
**Tarih:** 15 Şubat 2026  
**Durum:** Canlı Production Hazır ✅
