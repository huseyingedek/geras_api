-- ============================================================
-- ✅ GÜVENLİ MİGRATION — Sadece yeni tablo ekler
-- ✅ Mevcut hiçbir tabloya, sütuna veya veriye DOKUNMAZ
-- ✅ IF NOT EXISTS ile idempotent — 2 kez çalıştırılsa bile güvenli
--
-- Canlı DB'ye uygulamadan önce bir kez test ortamında dene.
-- Neon.com SQL editöründen veya psql ile uygula.
-- ============================================================

-- 1. StaffServices junction tablosu
--    Hangi personelin hangi hizmeti yapabileceğini tanımlar.
--    Mevcut Appointments, Staff, Services tablolarına dokunulmaz.
CREATE TABLE IF NOT EXISTS "StaffServices" (
  "StaffServiceID" SERIAL PRIMARY KEY,
  "StaffID"        INTEGER NOT NULL,
  "ServiceID"      INTEGER NOT NULL,
  "CreatedAt"      TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Aynı personel-hizmet çifti 2 kez eklenemez
  CONSTRAINT "StaffServices_StaffID_ServiceID_key"
    UNIQUE ("StaffID", "ServiceID"),

  -- Personel silinirse ilişkili kayıtlar da silinir (CASCADE)
  CONSTRAINT "StaffServices_StaffID_fkey"
    FOREIGN KEY ("StaffID")
    REFERENCES "Staff"("StaffID")
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  -- Hizmet silinirse ilişkili kayıtlar da silinir (CASCADE)
  CONSTRAINT "StaffServices_ServiceID_fkey"
    FOREIGN KEY ("ServiceID")
    REFERENCES "Services"("ServiceID")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

-- 2. Performans indeksleri
CREATE INDEX IF NOT EXISTS "idx_staff_services_staff"
  ON "StaffServices"("StaffID");

CREATE INDEX IF NOT EXISTS "idx_staff_services_service"
  ON "StaffServices"("ServiceID");

-- ============================================================
-- TAMAMLANDI. Kontrol sorgusu:
--   SELECT COUNT(*) FROM "StaffServices";  -- 0 dönmeli (boş tablo)
-- ============================================================
