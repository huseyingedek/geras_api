-- Müşteri pazarlama onayı alanları ekleniyor
-- Mevcut müşterilere zarar vermez, default false atanır
ALTER TABLE "Clients" ADD COLUMN "MarketingConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Clients" ADD COLUMN "ConsentDate" TIMESTAMP(3);
