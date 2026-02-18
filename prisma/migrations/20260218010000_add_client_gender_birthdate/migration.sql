-- Migration: add_client_gender_birthdate
-- Mevcut müşterilere UNISEX atanır, yeni kayıtlarda cinsiyet zorunlu (default UNISEX)

-- 1. Gender enum tipini oluştur
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'UNISEX');

-- 2. Gender kolonunu ekle (mevcut kayıtlar için DEFAULT UNISEX)
ALTER TABLE "Clients" ADD COLUMN "Gender" "Gender" NOT NULL DEFAULT 'UNISEX';

-- 3. BirthDate kolonunu ekle (opsiyonel, nullable)
ALTER TABLE "Clients" ADD COLUMN "BirthDate" DATE;
