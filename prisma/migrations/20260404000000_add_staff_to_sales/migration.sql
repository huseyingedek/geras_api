-- Sales tablosuna satışı yapan personeli tutan StaffID kolonu ekleniyor
ALTER TABLE "Sales" ADD COLUMN "StaffID" INTEGER;

-- Foreign key: Personel silinirse satış kaydı korunur (SetNull)
ALTER TABLE "Sales" ADD CONSTRAINT "fk_sales_staff"
  FOREIGN KEY ("StaffID") REFERENCES "Staff"("StaffID")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Performans için index
CREATE INDEX "idx_sales_staff" ON "Sales"("StaffID");
