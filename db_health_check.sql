-- 🔍 CANLI DB DURUM KONTROLÜ
-- Bu script'i migration öncesi ve sonrası çalıştır

-- ==========================================
-- MIGRATION ÖNCESİ KONTROL
-- ==========================================

-- 1. Accounts tablosunda kaç kayıt var?
SELECT COUNT(*) as total_accounts FROM "Accounts";

-- 2. Aktif hesap sayısı?
SELECT COUNT(*) as active_accounts FROM "Accounts" WHERE "IsActive" = true;

-- 3. Mevcut SubscriptionPlan değerleri neler?
SELECT 
  "SubscriptionPlan", 
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM "Accounts"
GROUP BY "SubscriptionPlan"
ORDER BY count DESC;

-- 4. NULL plan olanlar var mı?
SELECT COUNT(*) as null_plans FROM "Accounts" WHERE "SubscriptionPlan" IS NULL;

-- 5. Yeni alanlar var mı? (migration öncesi yoksa normal)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'Accounts' 
  AND column_name IN ('IsDemoAccount', 'DemoExpiresAt', 'DemoStatus')
ORDER BY column_name;

-- ==========================================
-- MIGRATION SONRASI KONTROL
-- ==========================================

-- 6. Tüm hesapların planı var mı? (0 olmalı)
SELECT COUNT(*) as accounts_without_plan
FROM "Accounts"
WHERE "SubscriptionPlan" IS NULL 
   OR "SubscriptionPlan" = '';

-- 7. Plan dağılımı (STARTER, PROFESSIONAL, PREMIUM olmalı)
SELECT 
  "SubscriptionPlan", 
  COUNT(*) as count
FROM "Accounts"
GROUP BY "SubscriptionPlan"
ORDER BY count DESC;

-- 8. Yeni alanlar eklendi mi? (3 satır dönmeli)
SELECT 
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'Accounts' 
  AND column_name IN ('IsDemoAccount', 'DemoExpiresAt', 'DemoStatus')
ORDER BY column_name;

-- 9. Index'ler eklendi mi?
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'Accounts'
  AND indexname IN ('idx_accounts_demo', 'idx_accounts_subscription');

-- 10. Demo hesap var mı? (ilk başta 0 olmalı)
SELECT 
  COUNT(*) as demo_accounts,
  COUNT(*) FILTER (WHERE "DemoStatus" = 'ACTIVE') as active_demos,
  COUNT(*) FILTER (WHERE "DemoStatus" = 'PENDING_APPROVAL') as pending_demos
FROM "Accounts"
WHERE "IsDemoAccount" = true;

-- ==========================================
-- VERİ BÜTÜNLÜĞÜ KONTROLLERI
-- ==========================================

-- 11. IsActive ama plan NULL olanlar? (0 olmalı)
SELECT COUNT(*) as active_without_plan
FROM "Accounts"
WHERE "IsActive" = true 
  AND ("SubscriptionPlan" IS NULL OR "SubscriptionPlan" = '');

-- 12. Geçersiz SubscriptionPlan değerleri? (0 olmalı)
SELECT COUNT(*) as invalid_plans
FROM "Accounts"
WHERE "SubscriptionPlan" NOT IN ('DEMO', 'STARTER', 'PROFESSIONAL', 'PREMIUM')
  AND "SubscriptionPlan" IS NOT NULL
  AND "SubscriptionPlan" != '';

-- 13. Demo flag var ama status NULL? (0 olmalı)
SELECT COUNT(*) as demo_without_status
FROM "Accounts"
WHERE "IsDemoAccount" = true 
  AND "DemoStatus" IS NULL;

-- ==========================================
-- İSTATİSTİKLER
-- ==========================================

-- 14. Paket bazlı özet
SELECT 
  "SubscriptionPlan",
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE "IsActive" = true) as active,
  COUNT(*) FILTER (WHERE "IsActive" = false) as inactive,
  COUNT(*) FILTER (WHERE "IsDemoAccount" = true) as demo_accounts
FROM "Accounts"
GROUP BY "SubscriptionPlan"
ORDER BY total DESC;

-- 15. Aylık gelir tahmini (varsayımsal)
SELECT 
  SUM(CASE 
    WHEN "SubscriptionPlan" = 'STARTER' THEN 499
    WHEN "SubscriptionPlan" = 'PROFESSIONAL' THEN 899
    WHEN "SubscriptionPlan" = 'PREMIUM' THEN 1499
    ELSE 0
  END) as estimated_monthly_revenue_tl
FROM "Accounts"
WHERE "IsActive" = true AND "IsDemoAccount" = false;

-- ==========================================
-- ÖRNEK KAYITLAR
-- ==========================================

-- 16. İlk 5 hesap (kontrol için)
SELECT 
  "AccountID",
  "BusinessName",
  "SubscriptionPlan",
  "IsDemoAccount",
  "DemoStatus",
  "DemoExpiresAt",
  "IsActive",
  "CreatedAt"
FROM "Accounts"
ORDER BY "AccountID"
LIMIT 5;

-- 17. Son eklenen 5 hesap
SELECT 
  "AccountID",
  "BusinessName",
  "SubscriptionPlan",
  "IsDemoAccount",
  "CreatedAt"
FROM "Accounts"
ORDER BY "CreatedAt" DESC
LIMIT 5;

-- ==========================================
-- SONUÇ ÖZETİ
-- ==========================================

-- 18. Tek sorguda özet
SELECT 
  COUNT(*) as total_accounts,
  COUNT(*) FILTER (WHERE "IsActive" = true) as active,
  COUNT(*) FILTER (WHERE "IsDemoAccount" = true) as demos,
  COUNT(*) FILTER (WHERE "SubscriptionPlan" IS NULL) as null_plans,
  COUNT(*) FILTER (WHERE "SubscriptionPlan" = 'STARTER') as starter,
  COUNT(*) FILTER (WHERE "SubscriptionPlan" = 'PROFESSIONAL') as professional,
  COUNT(*) FILTER (WHERE "SubscriptionPlan" = 'PREMIUM') as premium,
  COUNT(*) FILTER (WHERE "SubscriptionPlan" = 'DEMO') as demo_plan
FROM "Accounts";

-- ==========================================
-- BEKLENEN SONUÇLAR (Migration Sonrası)
-- ==========================================
/*
✅ null_plans = 0
✅ Tüm accounts STARTER, PROFESSIONAL veya PREMIUM'da
✅ Yeni alanlar mevcut (IsDemoAccount, DemoExpiresAt, DemoStatus)
✅ Index'ler eklendi
✅ İlk başta demo_accounts = 0 (henüz demo oluşturulmadı)
*/
