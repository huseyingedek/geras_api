-- ÖDEMELERİ KONTROL ET
-- Bu sorguyu çalıştırarak ödemelerin durumunu görelim

-- 1. Bu aydaki tüm ödemeler (durum fark etmeksizin)
SELECT 
  p."PaymentID",
  p."PaymentDate",
  p."AmountPaid",
  p."Status"::text as status,
  p."PaymentMethod"::text as method,
  c."FirstName" || ' ' || c."LastName" as client_name,
  s."ServiceName"
FROM "Payments" p
JOIN "Sales" sa ON sa."SaleID" = p."SaleID"
JOIN "Clients" c ON c."ClientID" = sa."ClientID"
JOIN "Services" s ON s."ServiceID" = sa."ServiceID"
WHERE sa."AccountID" = 1  -- Senin account ID'n
  AND p."PaymentDate" >= '2026-01-31'
  AND p."PaymentDate" <= '2026-02-07'
ORDER BY p."PaymentDate" DESC;

-- 2. Durum bazında özet
SELECT 
  p."Status"::text,
  COUNT(*) as adet,
  SUM(p."AmountPaid") as toplam
FROM "Payments" p
JOIN "Sales" sa ON sa."SaleID" = p."SaleID"
WHERE sa."AccountID" = 1
  AND p."PaymentDate" >= '2026-01-31'
  AND p."PaymentDate" <= '2026-02-07'
GROUP BY p."Status"::text;

-- 3. Toplam kontrol
SELECT 
  COUNT(*) as toplam_odeme_sayisi,
  SUM(p."AmountPaid") as toplam_tutar,
  SUM(CASE WHEN p."Status" = 'COMPLETED' THEN p."AmountPaid" ELSE 0 END) as completed_tutar,
  SUM(CASE WHEN p."Status" = 'PENDING' THEN p."AmountPaid" ELSE 0 END) as pending_tutar
FROM "Payments" p
JOIN "Sales" sa ON sa."SaleID" = p."SaleID"
WHERE sa."AccountID" = 1
  AND p."PaymentDate" >= '2026-01-31'
  AND p."PaymentDate" <= '2026-02-07';
