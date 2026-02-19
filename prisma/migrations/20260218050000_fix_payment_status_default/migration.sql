-- Fix: SubscriptionPayments status default değeri PAID'den PENDING'e çekiliyor
ALTER TABLE "SubscriptionPayments" ALTER COLUMN "Status" SET DEFAULT 'PENDING'::"SubPaymentStatus";
