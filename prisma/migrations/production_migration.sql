-- ============================================
-- GERAS SYSTEM - Production Database Migration
-- Tarih: 2025-10-16
-- Açıklama: SMS, Hatırlatma ve Notes alanları ekleniyor
-- ============================================

-- ÖNEMLI: Bu migration mevcut verilere ZARAR VERMEZ
-- Tüm yeni alanlar nullable veya default değerli

BEGIN;

-- ============================================
-- 1. SALES TABLOSUNA NOTES EKLENİYOR
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Sales' AND column_name = 'Notes'
    ) THEN
        ALTER TABLE "Sales" ADD COLUMN "Notes" TEXT;
        RAISE NOTICE 'Sales.Notes kolonu eklendi';
    ELSE
        RAISE NOTICE 'Sales.Notes kolonu zaten mevcut';
    END IF;
END $$;

-- ============================================
-- 2. APPOINTMENTS TABLOSUNA REMINDER SENT AT EKLENİYOR
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Appointments' AND column_name = 'ReminderSentAt'
    ) THEN
        ALTER TABLE "Appointments" ADD COLUMN "ReminderSentAt" TIMESTAMP(3);
        RAISE NOTICE 'Appointments.ReminderSentAt kolonu eklendi';
    ELSE
        RAISE NOTICE 'Appointments.ReminderSentAt kolonu zaten mevcut';
    END IF;
END $$;

-- ============================================
-- 3. ACCOUNTS TABLOSUNA SMS VE REMINDER AYARLARI EKLENİYOR
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Accounts' AND column_name = 'SMSEnabled'
    ) THEN
        ALTER TABLE "Accounts" ADD COLUMN "SMSEnabled" BOOLEAN NOT NULL DEFAULT true;
        RAISE NOTICE 'Accounts.SMSEnabled kolonu eklendi';
    ELSE
        RAISE NOTICE 'Accounts.SMSEnabled kolonu zaten mevcut';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Accounts' AND column_name = 'ReminderEnabled'
    ) THEN
        ALTER TABLE "Accounts" ADD COLUMN "ReminderEnabled" BOOLEAN NOT NULL DEFAULT true;
        RAISE NOTICE 'Accounts.ReminderEnabled kolonu eklendi';
    ELSE
        RAISE NOTICE 'Accounts.ReminderEnabled kolonu zaten mevcut';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Accounts' AND column_name = 'ReminderHours'
    ) THEN
        ALTER TABLE "Accounts" ADD COLUMN "ReminderHours" INTEGER NOT NULL DEFAULT 24;
        RAISE NOTICE 'Accounts.ReminderHours kolonu eklendi';
    ELSE
        RAISE NOTICE 'Accounts.ReminderHours kolonu zaten mevcut';
    END IF;
END $$;

-- ============================================
-- 4. NOTIFICATION SETTINGS TABLOSUNA REMINDER AYARLARI EKLENİYOR
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'NotificationSettings' AND column_name = 'ReminderEnabled'
    ) THEN
        ALTER TABLE "NotificationSettings" ADD COLUMN "ReminderEnabled" BOOLEAN NOT NULL DEFAULT false;
        RAISE NOTICE 'NotificationSettings.ReminderEnabled kolonu eklendi';
    ELSE
        RAISE NOTICE 'NotificationSettings.ReminderEnabled kolonu zaten mevcut';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'NotificationSettings' AND column_name = 'ReminderHours'
    ) THEN
        ALTER TABLE "NotificationSettings" ADD COLUMN "ReminderHours" INTEGER NOT NULL DEFAULT 24;
        RAISE NOTICE 'NotificationSettings.ReminderHours kolonu eklendi';
    ELSE
        RAISE NOTICE 'NotificationSettings.ReminderHours kolonu zaten mevcut';
    END IF;
END $$;

-- ============================================
-- 5. PERFORMANS İÇİN İNDEKSLER EKLENİYOR
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_accounts_sms_enabled'
    ) THEN
        CREATE INDEX "idx_accounts_sms_enabled" ON "Accounts"("SMSEnabled");
        RAISE NOTICE 'idx_accounts_sms_enabled index eklendi';
    ELSE
        RAISE NOTICE 'idx_accounts_sms_enabled index zaten mevcut';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_notification_settings_reminder'
    ) THEN
        CREATE INDEX "idx_notification_settings_reminder" ON "NotificationSettings"("ReminderEnabled", "ReminderHours");
        RAISE NOTICE 'idx_notification_settings_reminder index eklendi';
    ELSE
        RAISE NOTICE 'idx_notification_settings_reminder index zaten mevcut';
    END IF;
END $$;

-- ============================================
-- 6. MEVCUT VERİLER İÇİN VARSAYILAN DEĞERLER AYARLA
-- ============================================
UPDATE "Accounts" 
SET "SMSEnabled" = true 
WHERE "SMSEnabled" IS NULL;

UPDATE "Accounts" 
SET "ReminderEnabled" = true 
WHERE "ReminderEnabled" IS NULL;

UPDATE "Accounts" 
SET "ReminderHours" = 24 
WHERE "ReminderHours" IS NULL;

UPDATE "NotificationSettings" 
SET "ReminderEnabled" = false 
WHERE "ReminderEnabled" IS NULL;

UPDATE "NotificationSettings" 
SET "ReminderHours" = 24 
WHERE "ReminderHours" IS NULL;

COMMIT;

-- ============================================
-- MİGRATİON TAMAMLANDI ✅
-- ============================================
-- Tüm değişiklikler başarıyla uygulandı.
-- Rollback için: Bu SQL'i çalıştırmadan önce backup aldığınızdan emin olun!

