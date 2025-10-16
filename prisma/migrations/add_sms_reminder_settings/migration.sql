-- ⚠️ DİKKAT: Bu migration dosyası henüz çalıştırılmamalı!
-- Neon.com canlı veritabanına uygulanmadan önce test edilmeli

-- 1. Accounts tablosuna SMS kontrolü ekle
ALTER TABLE "Accounts" ADD COLUMN "SMSEnabled" BOOLEAN NOT NULL DEFAULT true;

-- 2. NotificationSettings tablosuna hatırlatma ayarları ekle
ALTER TABLE "NotificationSettings" ADD COLUMN "ReminderEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "NotificationSettings" ADD COLUMN "ReminderHours" INTEGER NOT NULL DEFAULT 24;

-- 3. İndeksler ekle (performans için)
CREATE INDEX "idx_accounts_sms_enabled" ON "Accounts"("SMSEnabled");
CREATE INDEX "idx_notification_settings_reminder" ON "NotificationSettings"("ReminderEnabled", "ReminderHours");

-- 4. Mevcut kayıtlar için varsayılan değerler ayarla
UPDATE "Accounts" SET "SMSEnabled" = true WHERE "SMSEnabled" IS NULL;
UPDATE "NotificationSettings" SET "ReminderEnabled" = false WHERE "ReminderEnabled" IS NULL;
UPDATE "NotificationSettings" SET "ReminderHours" = 24 WHERE "ReminderHours" IS NULL;
