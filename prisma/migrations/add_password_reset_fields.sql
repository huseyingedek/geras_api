-- Migration: Add password reset fields to Users table
-- Kullanıcı şifre sıfırlama için gerekli alanları ekle

-- PasswordResetToken ve PasswordResetExpires alanlarını ekle
ALTER TABLE "Users" 
ADD COLUMN IF NOT EXISTS "PasswordResetToken" TEXT,
ADD COLUMN IF NOT EXISTS "PasswordResetExpires" TIMESTAMP(3);

-- Index ekle (performans için)
CREATE INDEX IF NOT EXISTS "idx_users_password_reset_token" ON "Users"("PasswordResetToken");
CREATE INDEX IF NOT EXISTS "idx_users_password_reset_expires" ON "Users"("PasswordResetExpires");
