-- Appointments tablosuna saleItemId ekle (paket satış hizmet takibi için)
-- serviceId nullable yap (paket satışlarda serviceId saleItem'dan gelecek)
ALTER TABLE "Appointments" ADD COLUMN IF NOT EXISTS "SaleItemID" INT REFERENCES "SaleItems"("SaleItemID") ON DELETE SET NULL;
ALTER TABLE "Appointments" ALTER COLUMN "ServiceID" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_appointments_sale_item_id" ON "Appointments" ("SaleItemID");
