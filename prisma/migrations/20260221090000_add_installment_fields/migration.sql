-- Satışlara taksit alanları ekleniyor
ALTER TABLE "Sales" ADD COLUMN IF NOT EXISTS "IsInstallment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Sales" ADD COLUMN IF NOT EXISTS "InstallmentCount" INTEGER;
ALTER TABLE "Sales" ADD COLUMN IF NOT EXISTS "SmsReminderEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Ödemelere taksit ve hatırlatma alanları ekleniyor
ALTER TABLE "Payments" ADD COLUMN IF NOT EXISTS "DueDate" TIMESTAMP(3);
ALTER TABLE "Payments" ADD COLUMN IF NOT EXISTS "InstallmentNumber" INTEGER;
ALTER TABLE "Payments" ADD COLUMN IF NOT EXISTS "ReminderSentAt" TIMESTAMP(3);
