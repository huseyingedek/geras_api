-- Migration: add_onboarding_completed
-- Yeni hesaplarda false, mevcut hesaplarda true olacak şekilde güvenli migration

-- 1. Kolonu ekle (default false — yeni kayıtlar için)
ALTER TABLE "Accounts" ADD COLUMN "IsOnboardingCompleted" BOOLEAN NOT NULL DEFAULT false;

-- 2. Mevcut kayıtları true yap (onboarding öncesi oluşturuldu, etkilenmesin)
UPDATE "Accounts" SET "IsOnboardingCompleted" = true;
