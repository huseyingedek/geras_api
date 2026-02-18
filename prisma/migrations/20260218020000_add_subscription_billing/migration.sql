-- Migration: add_subscription_billing
-- Abonelik dönem takibi ve ödeme geçmişi

-- 1. Enum tipleri oluştur
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED', 'SUSPENDED');

-- 2. Accounts tablosuna yeni alanlar ekle
ALTER TABLE "Accounts" ADD COLUMN "BillingCycle"          "BillingCycle";
ALTER TABLE "Accounts" ADD COLUMN "SubscriptionStartDate" TIMESTAMP(3);
ALTER TABLE "Accounts" ADD COLUMN "SubscriptionEndDate"   TIMESTAMP(3);
ALTER TABLE "Accounts" ADD COLUMN "SubscriptionStatus"    "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE';

-- 3. Mevcut aktif hesapları ACTIVE, pasif olanları SUSPENDED yap
UPDATE "Accounts" SET "SubscriptionStatus" = 'ACTIVE'    WHERE "IsActive" = true;
UPDATE "Accounts" SET "SubscriptionStatus" = 'SUSPENDED' WHERE "IsActive" = false;

-- 4. SubscriptionPayments tablosunu oluştur
CREATE TABLE "SubscriptionPayments" (
  "PaymentID"    SERIAL PRIMARY KEY,
  "AccountID"    INTEGER NOT NULL,
  "Plan"         VARCHAR(50) NOT NULL,
  "BillingCycle" "BillingCycle" NOT NULL,
  "Amount"       DECIMAL(10, 2) NOT NULL,
  "Currency"     VARCHAR(10) NOT NULL DEFAULT 'TRY',
  "PeriodStart"  TIMESTAMP(3) NOT NULL,
  "PeriodEnd"    TIMESTAMP(3) NOT NULL,
  "PaidAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "Notes"        TEXT,
  "CreatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_sub_payment_account"
    FOREIGN KEY ("AccountID") REFERENCES "Accounts"("AccountID") ON DELETE CASCADE
);

CREATE INDEX "idx_sub_payment_account" ON "SubscriptionPayments"("AccountID");
