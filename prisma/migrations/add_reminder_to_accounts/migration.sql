-- AlterTable: Accounts tablosuna hatırlatma ayarları ekleniyor
ALTER TABLE "Accounts" ADD COLUMN "ReminderEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Accounts" ADD COLUMN "ReminderHours" INTEGER NOT NULL DEFAULT 24;

-- Mevcut tüm işletmeler için varsayılan değerleri ayarla
UPDATE "Accounts" 
SET "ReminderEnabled" = true, 
    "ReminderHours" = 24 
WHERE "ReminderEnabled" IS NULL OR "ReminderHours" IS NULL;

