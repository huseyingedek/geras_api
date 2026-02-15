# 🔒 CANLI DB'YE GÜVENLİ MİGRATION REHBERİ

## ⚠️ ÖNEMLİ: Canlı Production DB için

Bu rehber, **mevcut verilere ZARAR VERMEDEN** yeni özellikleri aktarır.

---

## 📊 MEVCUT DURUM

### Şu Anda DB'de Ne Var?

```sql
-- Mevcut durumu kontrol et
SELECT 
  "AccountID",
  "BusinessName",
  "SubscriptionPlan",
  "IsDemoAccount",
  "DemoExpiresAt",
  "DemoStatus"
FROM "Accounts"
LIMIT 10;
```

**Muhtemelen göreceksin:**
- `SubscriptionPlan`: NULL veya "premium" veya "Premium"
- `IsDemoAccount`: NULL (yeni alan yok)
- `DemoExpiresAt`: NULL (yeni alan yok)
- `DemoStatus`: NULL (yeni alan yok)

---

## 🎯 HEDEF

1. ✅ Yeni alanları ekle (IsDemoAccount, DemoExpiresAt, DemoStatus)
2. ✅ Mevcut SubscriptionPlan değerlerini koru
3. ✅ NULL olanları PROFESSIONAL yap
4. ✅ "premium" olanları PREMIUM olarak normalize et

---

## 🚀 ADIM ADIM MİGRATION

### ADIM 1: YEDEK AL (ÇOK ÖNEMLİ!) ⚠️

```bash
# PostgreSQL yedek
pg_dump -h your-host \
        -U your-user \
        -d your-database \
        -t Accounts \
        > accounts_backup_$(date +%Y%m%d_%H%M%S).sql

# Veya sadece önemli alanlar
psql -h your-host -U your-user -d your-database -c \
"COPY (SELECT \"AccountID\", \"SubscriptionPlan\", \"IsActive\" FROM \"Accounts\") 
TO '/tmp/subscription_backup.csv' CSV HEADER;"
```

**Windows için (PostgreSQL):**
```powershell
# pgAdmin veya:
pg_dump -h your-host -U your-user -d your-database -t Accounts > C:\backup\accounts_backup.sql
```

---

### ADIM 2: YENİ ALANLARI EKLE

```sql
-- Transaction başlat
BEGIN;

-- 1. IsDemoAccount alanı ekle (yoksa)
ALTER TABLE "Accounts" 
ADD COLUMN IF NOT EXISTS "IsDemoAccount" BOOLEAN DEFAULT false;

-- 2. DemoExpiresAt alanı ekle (yoksa)
ALTER TABLE "Accounts" 
ADD COLUMN IF NOT EXISTS "DemoExpiresAt" TIMESTAMP;

-- 3. DemoStatus alanı ekle (yoksa) - önce TEXT olarak
ALTER TABLE "Accounts" 
ADD COLUMN IF NOT EXISTS "DemoStatus" TEXT DEFAULT 'ACTIVE';

-- Kontrol et - yeni alanlar eklendi mi?
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'Accounts' 
  AND column_name IN ('IsDemoAccount', 'DemoExpiresAt', 'DemoStatus');

-- Her şey tamam görünüyorsa
COMMIT;

-- Sorun varsa
-- ROLLBACK;
```

---

### ADIM 3: MEVCUT VERİLERİ NORMALIZE ET

```sql
-- Transaction başlat
BEGIN;

-- 1. NULL olanları PROFESSIONAL yap
UPDATE "Accounts"
SET "SubscriptionPlan" = 'PROFESSIONAL'
WHERE "SubscriptionPlan" IS NULL;

-- 2. Küçük/büyük harf normalize et
UPDATE "Accounts"
SET "SubscriptionPlan" = 'PREMIUM'
WHERE UPPER("SubscriptionPlan") IN ('PREMIUM', 'PRO');

UPDATE "Accounts"
SET "SubscriptionPlan" = 'PROFESSIONAL'
WHERE UPPER("SubscriptionPlan") = 'PROFESSIONAL';

UPDATE "Accounts"
SET "SubscriptionPlan" = 'STARTER'
WHERE UPPER("SubscriptionPlan") IN ('STARTER', 'BASIC');

-- 3. Tanımsız veya eski değerleri PROFESSIONAL yap
UPDATE "Accounts"
SET "SubscriptionPlan" = 'PROFESSIONAL'
WHERE "SubscriptionPlan" NOT IN ('STARTER', 'PROFESSIONAL', 'PREMIUM', 'DEMO')
   OR "SubscriptionPlan" = '';

-- Kontrol et
SELECT 
  "SubscriptionPlan", 
  COUNT(*) as count
FROM "Accounts"
GROUP BY "SubscriptionPlan"
ORDER BY count DESC;

-- Sonuç böyle olmalı:
-- PROFESSIONAL | 15
-- PREMIUM      | 5
-- STARTER      | 2

-- Her şey tamam görünüyorsa
COMMIT;

-- Sorun varsa
-- ROLLBACK;
```

---

### ADIM 4: INDEX EKLE (Performans için)

```sql
-- Demo hesap index'i
CREATE INDEX IF NOT EXISTS "idx_accounts_demo" 
ON "Accounts"("IsDemoAccount", "DemoStatus");

-- SubscriptionPlan index'i (varsa zaten, hata vermez)
CREATE INDEX IF NOT EXISTS "idx_accounts_subscription" 
ON "Accounts"("SubscriptionPlan");
```

---

### ADIM 5: BACKEND KODUNU GÜNCELLE

```bash
cd "c:\Users\hgede\Desktop\GERAS SYSTEM\BACKEND"

# 1. Prisma generate (enum tanımları için)
npx prisma generate

# 2. Node modules temizle (opsiyonel)
# npm ci

# 3. Server'ı yeniden başlat
npm start
```

**Beklenen Log Çıktısı:**
```
✅ Database connection established with Neon PostgreSQL
✅ Demo hesap cron job başlatıldı (Her 6 saatte bir çalışacak)
🚀 İlk demo hesap kontrolü yapılıyor...
✅ Süresi dolmuş demo hesap bulunamadı
🚀 Server 5000 portunda çalışıyor
```

---

### ADIM 6: TEST ET

#### Test 1: Mevcut Hesapları Kontrol Et
```sql
-- Tüm hesapların planı olmalı
SELECT 
  "AccountID",
  "BusinessName",
  "SubscriptionPlan",
  "IsDemoAccount",
  "IsActive"
FROM "Accounts"
WHERE "SubscriptionPlan" IS NULL;

-- Sonuç: 0 satır (tümünün planı var)
```

#### Test 2: API Testi
```bash
# Mevcut bir kullanıcı ile login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "existing@user.com",
    "password": "password123"
  }'

# Response'da token gelmeli
# ✅ Başarılı ise API çalışıyor
```

#### Test 3: Demo Hesap Oluştur
```bash
curl -X POST http://localhost:5000/api/auth/create-demo \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Test Demo Salon",
    "businessType": "SESSION_BASED",
    "ownerUsername": "testdemo",
    "ownerEmail": "testdemo@example.com",
    "ownerPassword": "Demo123!"
  }'

# Response'da token gelmeli
# ✅ Başarılı ise demo sistemi çalışıyor
```

#### Test 4: Admin - Demo Listesi
```bash
# Admin token ile
curl -X GET http://localhost:5000/api/admin/demo-accounts \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

# Liste dönmeli (boş olabilir)
```

---

## 🔍 SORUN GİDERME

### Problem 1: "Column already exists" Hatası

```sql
-- Alanın var olup olmadığını kontrol et
SELECT column_name 
FROM information_schema.columns
WHERE table_name = 'Accounts' 
  AND column_name = 'IsDemoAccount';

-- Varsa ALTER TABLE'ı atla, yoksa ekle
```

### Problem 2: Prisma Generate Hatası

```bash
# Cache temizle
npx prisma generate --schema=./prisma/schema.prisma

# Veya node_modules temizle
rm -rf node_modules
npm install
npx prisma generate
```

### Problem 3: Server Başlamıyor

```bash
# Loglara bak
npm start

# Error varsa:
# - Prisma generate yapıldı mı?
# - DB bağlantısı var mı?
# - Port 5000 kullanılıyor mu?
```

### Problem 4: Bazı Hesaplarda Plan NULL

```sql
-- Hızlı düzeltme
UPDATE "Accounts"
SET "SubscriptionPlan" = 'PROFESSIONAL'
WHERE "SubscriptionPlan" IS NULL 
   OR "SubscriptionPlan" = '';
```

---

## 🎯 SON KONTROLLER

```sql
-- 1. Tüm hesapların planı var mı?
SELECT COUNT(*) as total_without_plan
FROM "Accounts"
WHERE "SubscriptionPlan" IS NULL 
   OR "SubscriptionPlan" = '';
-- Sonuç: 0

-- 2. Yeni alanlar var mı?
SELECT 
  COUNT(*) as has_demo_fields
FROM information_schema.columns
WHERE table_name = 'Accounts' 
  AND column_name IN ('IsDemoAccount', 'DemoExpiresAt', 'DemoStatus');
-- Sonuç: 3

-- 3. Kaç farklı plan var?
SELECT 
  "SubscriptionPlan", 
  COUNT(*) as count
FROM "Accounts"
GROUP BY "SubscriptionPlan";
-- STARTER, PROFESSIONAL, PREMIUM olmalı

-- 4. Demo hesap var mı?
SELECT COUNT(*) as demo_accounts
FROM "Accounts"
WHERE "IsDemoAccount" = true;
-- Sonuç: 0 veya test ettiysen 1+
```

---

## ✅ MİGRATION BAŞARILI!

Eğer tüm kontroller geçtiyse:

- ✅ Mevcut veriler korundu
- ✅ Yeni alanlar eklendi
- ✅ SubscriptionPlan normalize edildi
- ✅ API çalışıyor
- ✅ Demo sistemi hazır

---

## 🔄 ROLLBACK (Geri Alma)

Bir sorun olursa:

```bash
# 1. SQL backup'ı geri yükle
psql -h your-host -U your-user -d your-database < accounts_backup_20260215_123456.sql

# 2. Veya sadece SubscriptionPlan'ı geri al
psql -h your-host -U your-user -d your-database -c "
UPDATE \"Accounts\" 
SET \"SubscriptionPlan\" = backup.old_plan
FROM (
  SELECT \"AccountID\", \"SubscriptionPlan\" as old_plan 
  FROM temp_backup
) backup
WHERE \"Accounts\".\"AccountID\" = backup.\"AccountID\";
"

# 3. Yeni alanları sil (gerekliyse)
ALTER TABLE "Accounts" DROP COLUMN IF EXISTS "IsDemoAccount";
ALTER TABLE "Accounts" DROP COLUMN IF EXISTS "DemoExpiresAt";
ALTER TABLE "Accounts" DROP COLUMN IF EXISTS "DemoStatus";
```

---

## 📋 CHECKLIST

**Öncesi (Hazırlık):**
- [ ] Yedek alındı (SQL dump)
- [ ] Test ortamında denendi (varsa)
- [ ] Downtime planlandı (gerekirse)

**Migration:**
- [ ] Transaction içinde test edildi
- [ ] Yeni alanlar eklendi
- [ ] Veriler normalize edildi
- [ ] Index'ler eklendi
- [ ] Veriler kontrol edildi

**Sonrası (Test):**
- [ ] Prisma generate çalıştırıldı
- [ ] Server başarıyla başladı
- [ ] Login çalışıyor
- [ ] API endpoint'leri test edildi
- [ ] Demo hesap oluşturuldu (test)

---

## ⏱️ TAHMİNİ SÜRE

- Yedek alma: 2-5 dakika
- Migration SQL: 1-2 dakika
- Prisma generate: 30 saniye
- Server restart: 10 saniye
- Test: 5 dakika

**Toplam:** ~10-15 dakika

---

## 🚨 ACİL DURUM

Bir şeyler ters giderse:

1. **Server'ı durdur** → `Ctrl+C`
2. **Backup'ı geri yükle** → `psql < backup.sql`
3. **Eski kodu deploy et** → Git revert
4. **Bizi ara** → Debug yapalım

---

**Hazırlayan:** Backend Team  
**Tarih:** 15 Şubat 2026  
**Durum:** ✅ Production-Ready  
**Test Edildi:** Lokal + Staging
