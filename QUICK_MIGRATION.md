# ⚡ CANLI DB MİGRATION - HIZLI REHBER

## 🎯 3 ADIMDA MİGRATION

### 1️⃣ YEDEK AL (2 dk)
```bash
pg_dump -h host -U user -d database -t Accounts > backup.sql
```

### 2️⃣ SQL ÇALIŞTIR (2 dk)
```sql
BEGIN;

-- Yeni alanlar ekle
ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "IsDemoAccount" BOOLEAN DEFAULT false;
ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "DemoExpiresAt" TIMESTAMP;
ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "DemoStatus" TEXT DEFAULT 'ACTIVE';

-- Verileri normalize et
UPDATE "Accounts" SET "SubscriptionPlan" = 'PROFESSIONAL' WHERE "SubscriptionPlan" IS NULL;
UPDATE "Accounts" SET "SubscriptionPlan" = 'PREMIUM' WHERE UPPER("SubscriptionPlan") = 'PREMIUM';
UPDATE "Accounts" SET "SubscriptionPlan" = 'PROFESSIONAL' WHERE "SubscriptionPlan" NOT IN ('STARTER', 'PROFESSIONAL', 'PREMIUM', 'DEMO');

-- Index ekle
CREATE INDEX IF NOT EXISTS "idx_accounts_demo" ON "Accounts"("IsDemoAccount", "DemoStatus");

COMMIT;
```

### 3️⃣ BACKEND BAŞLAT (1 dk)
```bash
npx prisma generate
npm start
```

---

## ✅ KONTROL

```sql
-- Tümünün planı var mı?
SELECT COUNT(*) FROM "Accounts" WHERE "SubscriptionPlan" IS NULL;
-- Sonuç: 0 olmalı

-- Yeni alanlar var mı?
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'Accounts' 
AND column_name IN ('IsDemoAccount', 'DemoExpiresAt', 'DemoStatus');
-- Sonuç: 3 satır
```

---

## 🚨 SORUN OLURSA

```bash
# Geri yükle
psql -h host -U user -d database < backup.sql

# Server restart
npm start
```

---

## ⏱️ TOPLAM SÜRE: 5-10 dakika

**Detaylı Rehber:** `PRODUCTION_MIGRATION_GUIDE.md`
