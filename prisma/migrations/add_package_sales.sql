-- ============================================================
-- ÇOKLU HİZMET SATIŞI (PAKET SATIŞ) MİGRASYONU
-- Additive only — mevcut veriye dokunulmaz
-- ============================================================

-- 1. Sales.ServiceID nullable yap (mevcut satırlarda değer dolu kalır)
ALTER TABLE "Sales" ALTER COLUMN "ServiceID" DROP NOT NULL;

-- 2. Sales.IsPackage kolonu ekle (mevcut satırlarda false olur)
ALTER TABLE "Sales" ADD COLUMN IF NOT EXISTS "IsPackage" BOOLEAN NOT NULL DEFAULT false;

-- 3. SaleItems tablosu oluştur
CREATE TABLE IF NOT EXISTS "SaleItems" (
  "SaleItemID"        SERIAL PRIMARY KEY,
  "SaleID"            INT NOT NULL REFERENCES "Sales"("SaleID") ON DELETE CASCADE,
  "ServiceID"         INT NOT NULL REFERENCES "Services"("ServiceID") ON DELETE CASCADE,
  "SessionCount"      INT NOT NULL DEFAULT 1,
  "RemainingSessions" INT NOT NULL DEFAULT 1,
  "UnitPrice"         DECIMAL(10, 2) NOT NULL,
  "Notes"             TEXT,
  "CreatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "UpdatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Sessions.SaleItemID kolonu ekle (mevcut kayıtlarda NULL kalır)
ALTER TABLE "Sessions" ADD COLUMN IF NOT EXISTS "SaleItemID" INT REFERENCES "SaleItems"("SaleItemID") ON DELETE SET NULL;

-- 5. SaleItems için index
CREATE INDEX IF NOT EXISTS "idx_sale_items_sale_id"    ON "SaleItems" ("SaleID");
CREATE INDEX IF NOT EXISTS "idx_sale_items_service_id" ON "SaleItems" ("ServiceID");
CREATE INDEX IF NOT EXISTS "idx_sessions_sale_item_id" ON "Sessions"  ("SaleItemID");
