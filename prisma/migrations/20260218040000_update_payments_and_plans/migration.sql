-- ============================================================
-- 1. YENİ ENUM'LAR
-- ============================================================

CREATE TYPE "SubPaymentMethod" AS ENUM ('CASH', 'IYZICO', 'BANK_TRANSFER', 'OTHER');
CREATE TYPE "SubPaymentStatus" AS ENUM ('PAID', 'PENDING', 'OVERDUE');

-- ============================================================
-- 2. SubscriptionPayments TABLO GÜNCELLEMESİ
-- ============================================================

-- Yeni kolonlar ekle
ALTER TABLE "SubscriptionPayments"
  ADD COLUMN IF NOT EXISTS "TotalAmount"       DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "InstallmentAmount" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "PaymentMethod"     "SubPaymentMethod" NOT NULL DEFAULT 'CASH',
  ADD COLUMN IF NOT EXISTS "InstallmentNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "TotalInstallments" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "DueDate"           TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "Status"            "SubPaymentStatus" NOT NULL DEFAULT 'PAID';

-- Mevcut "Amount" kolonunu koru, TotalAmount ve InstallmentAmount ile senkronize et
UPDATE "SubscriptionPayments"
SET
  "TotalAmount"       = "Amount",
  "InstallmentAmount" = "Amount"
WHERE "TotalAmount" IS NULL;

-- Amount kolonunu NOT NULL olmayan hale getir (geriye dönük uyumluluk)
ALTER TABLE "SubscriptionPayments" ALTER COLUMN "Amount" DROP NOT NULL;

-- BillingCycle nullable yap
ALTER TABLE "SubscriptionPayments" ALTER COLUMN "BillingCycle" DROP NOT NULL;

-- PeriodStart ve PeriodEnd nullable yap
ALTER TABLE "SubscriptionPayments" ALTER COLUMN "PeriodStart" DROP NOT NULL;
ALTER TABLE "SubscriptionPayments" ALTER COLUMN "PeriodEnd"   DROP NOT NULL;

-- PaidAt nullable yap (bekleyen taksitler için)
ALTER TABLE "SubscriptionPayments" ALTER COLUMN "PaidAt" DROP NOT NULL;

-- ============================================================
-- 3. PLANS TABLO — Feature listesi güncellemesi
--    features → [{label, enabled}] formatına geçiş
--    limits   → smsCredits alanı eklendi
-- ============================================================

-- DEMO planı
UPDATE "Plans" SET
  "Features" = '[
    {"label": "Sınırsız personel", "enabled": true},
    {"label": "Sınırsız müşteri", "enabled": true},
    {"label": "Sınırsız randevu", "enabled": true},
    {"label": "Sınırsız hizmet", "enabled": true},
    {"label": "Gelişmiş raporlar", "enabled": true},
    {"label": "Personel yetkilendirme", "enabled": true},
    {"label": "Gelir-Gider yönetimi", "enabled": true},
    {"label": "Referans takibi", "enabled": true},
    {"label": "Seans bazlı hizmetler", "enabled": true},
    {"label": "50 SMS hediye", "enabled": true},
    {"label": "30 gün ücretsiz deneme", "enabled": true}
  ]'::jsonb,
  "Limits" = '{
    "maxStaff": null,
    "maxClients": null,
    "maxAppointmentsPerMonth": null,
    "maxServices": null,
    "smsCredits": 50
  }'::jsonb
WHERE "Key" = 'DEMO';

-- STARTER planı
UPDATE "Plans" SET
  "Features" = '[
    {"label": "1 işletme hesabı", "enabled": true},
    {"label": "2 personel kullanıcısı", "enabled": true},
    {"label": "100 müşteri limiti", "enabled": true},
    {"label": "Sınırsız randevu", "enabled": true},
    {"label": "Sınırsız hizmet", "enabled": true},
    {"label": "Randevu yönetimi", "enabled": true},
    {"label": "Müşteri yönetimi", "enabled": true},
    {"label": "Satış takibi", "enabled": true},
    {"label": "Temel raporlar", "enabled": true},
    {"label": "100 SMS hediye", "enabled": true},
    {"label": "Email destek", "enabled": true},
    {"label": "30 gün ücretsiz deneme", "enabled": true},
    {"label": "Personel yetkilendirme", "enabled": false},
    {"label": "Gelir-Gider yönetimi", "enabled": false},
    {"label": "Gelişmiş raporlar", "enabled": false}
  ]'::jsonb,
  "Limits" = '{
    "maxStaff": 2,
    "maxClients": 100,
    "maxAppointmentsPerMonth": null,
    "maxServices": null,
    "smsCredits": 100
  }'::jsonb
WHERE "Key" = 'STARTER';

-- PROFESSIONAL planı
UPDATE "Plans" SET
  "Features" = '[
    {"label": "1 işletme hesabı", "enabled": true},
    {"label": "5 personel kullanıcısı", "enabled": true},
    {"label": "Sınırsız müşteri", "enabled": true},
    {"label": "Sınırsız randevu", "enabled": true},
    {"label": "Sınırsız hizmet", "enabled": true},
    {"label": "Gelişmiş randevu yönetimi", "enabled": true},
    {"label": "Personel yetkilendirme sistemi", "enabled": true},
    {"label": "Seans bazlı hizmetler", "enabled": true},
    {"label": "Gelir-Gider takibi", "enabled": true},
    {"label": "Gider kategorileri", "enabled": true},
    {"label": "Referans kaynağı takibi", "enabled": true},
    {"label": "Detaylı raporlama", "enabled": true},
    {"label": "Müşteri notları sistemi", "enabled": true},
    {"label": "200 SMS hediye", "enabled": true},
    {"label": "Öncelikli email destek", "enabled": true},
    {"label": "30 gün ücretsiz deneme", "enabled": true}
  ]'::jsonb,
  "Limits" = '{
    "maxStaff": 5,
    "maxClients": null,
    "maxAppointmentsPerMonth": null,
    "maxServices": null,
    "smsCredits": 200
  }'::jsonb
WHERE "Key" = 'PROFESSIONAL';

-- PREMIUM planı
UPDATE "Plans" SET
  "Features" = '[
    {"label": "Sınırsız işletme/şube", "enabled": true},
    {"label": "Sınırsız personel kullanıcısı", "enabled": true},
    {"label": "Sınırsız müşteri", "enabled": true},
    {"label": "Sınırsız randevu", "enabled": true},
    {"label": "Sınırsız hizmet", "enabled": true},
    {"label": "Tüm Profesyonel özellikleri", "enabled": true},
    {"label": "Multi-tenant sistem", "enabled": true},
    {"label": "Özel API erişimi", "enabled": true},
    {"label": "Gelişmiş finansal analiz", "enabled": true},
    {"label": "Şube bazlı raporlama", "enabled": true},
    {"label": "Özel bildirim sistemi", "enabled": true},
    {"label": "500 SMS hediye", "enabled": true},
    {"label": "Öncelikli 7/24 destek", "enabled": true},
    {"label": "Özel eğitim (2 saat)", "enabled": true},
    {"label": "Haftalık otomatik yedekleme", "enabled": true},
    {"label": "Özel özellik talepleri", "enabled": true},
    {"label": "30 gün ücretsiz deneme", "enabled": true}
  ]'::jsonb,
  "Limits" = '{
    "maxStaff": null,
    "maxClients": null,
    "maxAppointmentsPerMonth": null,
    "maxServices": null,
    "smsCredits": 500,
    "maxLocations": null
  }'::jsonb
WHERE "Key" = 'PREMIUM';
