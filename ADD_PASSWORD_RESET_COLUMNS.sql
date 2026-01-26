-- ============================================
-- GÜVENLI MİGRATION: Şifre Sıfırlama Kolonları
-- ============================================
-- Bu SQL sadece 2 kolon ekler, başka hiçbir değişiklik yapmaz
-- Mevcut verilere ZARAR VERMEZ
-- Kolon zaten varsa hata vermez

-- 1. PasswordResetToken kolonunu ekle (eğer yoksa)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'Users' 
        AND column_name = 'PasswordResetToken'
    ) THEN
        ALTER TABLE "Users" ADD COLUMN "PasswordResetToken" TEXT;
        RAISE NOTICE '✅ PasswordResetToken kolonu eklendi';
    ELSE
        RAISE NOTICE '⚠️ PasswordResetToken kolonu zaten mevcut';
    END IF;
END $$;

-- 2. PasswordResetExpires kolonunu ekle (eğer yoksa)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'Users' 
        AND column_name = 'PasswordResetExpires'
    ) THEN
        ALTER TABLE "Users" ADD COLUMN "PasswordResetExpires" TIMESTAMP(3);
        RAISE NOTICE '✅ PasswordResetExpires kolonu eklendi';
    ELSE
        RAISE NOTICE '⚠️ PasswordResetExpires kolonu zaten mevcut';
    END IF;
END $$;

-- 3. Index'leri ekle (performans için - eğer yoksa)
CREATE INDEX IF NOT EXISTS "idx_users_password_reset_token" 
ON "Users"("PasswordResetToken");

CREATE INDEX IF NOT EXISTS "idx_users_password_reset_expires" 
ON "Users"("PasswordResetExpires");

-- 4. Kontrol et
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'Users' 
AND column_name IN ('PasswordResetToken', 'PasswordResetExpires');

-- İşlem tamamlandı!
SELECT '✅ Migration başarıyla tamamlandı!' as result;
