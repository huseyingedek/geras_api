# 📋 REFERANS KAYNAKLARI - GÜVENLİ MİGRASYON PLANI

## ⚠️ MEVCUT DURUM
- ✅ `reference_sources` tablosu Neon.com'da mevcut
- ✅ `Sales.reference_id` kolonu var (nullable)
- ⚠️ Mevcut satışlarda `reference_id = NULL`
- ✅ Backend API'leri oluşturuldu

---

## 🎯 HEDEF
1. Mevcut satışlara **DOKUNMA** (NULL kalsın)
2. Yeni satışlarda reference opsiyonel olsun
3. Reference seçilmezse **"Manuel"** referansı otomatik oluşsun/seçilsin

---

## 📝 ADIM 1: DEFAULT "MANUEL" REFERANSI OLUŞTUR

Neon.com SQL Editor'de çalıştır:

```sql
-- Her işletme için "Manuel" referansı oluştur
INSERT INTO "reference_sources" (reference_type, reference_name, notes, accountid)
SELECT 
  'manual' as reference_type,
  'Manuel' as reference_name,
  'Sistem tarafından manuel eklenen kayıtlar' as notes,
  id as accountid
FROM "Accounts"
WHERE id NOT IN (
  SELECT DISTINCT accountid 
  FROM "reference_sources" 
  WHERE reference_type = 'manual' 
  AND accountid IS NOT NULL
);
```

Bu SQL:
- ✅ Her işletme için bir "Manuel" kaynağı oluşturur
- ✅ Eğer zaten varsa tekrar oluşturmaz
- ✅ Mevcut verilere dokunmaz

---

## 📝 ADIM 2: Backend'de Default Referans Kullan

`salesController.js` dosyasında yeni satış oluştururken:

```javascript
// Eğer reference_id gelmezse, "Manuel" referansını kullan
let finalReferenceId = reference_id;

if (!finalReferenceId) {
  // "Manuel" referansını bul veya oluştur
  let manualReference = await prisma.reference_sources.findFirst({
    where: {
      accountid: accountId,
      reference_type: 'manual'
    }
  });

  if (!manualReference) {
    manualReference = await prisma.reference_sources.create({
      data: {
        accountid: accountId,
        reference_type: 'manual',
        reference_name: 'Manuel',
        notes: 'Sistem tarafından otomatik oluşturuldu'
      }
    });
  }

  finalReferenceId = manualReference.id;
}

// Satış oluştururken
const sale = await prisma.sales.create({
  data: {
    accountId,
    clientId,
    serviceId,
    reference_id: finalReferenceId,  // Manuel veya seçilen
    // ...
  }
});
```

---

## 📊 KULLANIM ÖRNEKLERİ

### Yeni Satış - Referans Belirtilmiş
```json
POST /api/sales
{
  "clientId": 1,
  "serviceId": 2,
  "reference_id": 5,  ← Instagram'dan geldi
  "totalAmount": 5000
}
```

### Yeni Satış - Referans Belirtilmemiş
```json
POST /api/sales
{
  "clientId": 1,
  "serviceId": 2,
  // reference_id YOK!
  "totalAmount": 5000
}
```
→ Otomatik olarak `reference_id = "Manuel" referansının ID'si` olacak

---

## 🔍 REFERANS TİPLERİ

```javascript
const referenceTypes = [
  'manual',              // Manuel giriş (default)
  'social_media',        // Instagram, Facebook
  'friend_referral',     // Arkadaş tavsiyesi
  'google_ads',          // Google reklamı
  'website',             // Web sitesi
  'walk_in',             // Yoldan geldi
  'returning_customer',  // Eski müşteri
  'other'                // Diğer
];
```

---

## 🎨 FRONTEND'DE KULLANIM

```javascript
// Satış oluştururken dropdown
<Select 
  label="Müşteri Nereden Geldi?"
  optional={true}  // Opsiyonel!
  defaultValue={null}
>
  <Option value={null}>Manuel (Bilinmiyor)</Option>
  <Option value={1}>Instagram</Option>
  <Option value={2}>Facebook</Option>
  <Option value={3}>Arkadaş Tavsiyesi</Option>
  <Option value={4}>Google Reklamı</Option>
  <Option value={5}>Web Sitesi</Option>
</Select>

// API çağrısı
const saleData = {
  clientId: 1,
  serviceId: 2,
  totalAmount: 5000,
  reference_id: selectedReference || undefined  // Seçilmediyse gönderme
};
```

---

## ✅ GÜVENLİK
- ✅ Mevcut satışlar etkilenmez (reference_id NULL kalabilir)
- ✅ Yeni satışlarda referans opsiyonel
- ✅ Boş bırakılırsa "Manuel" otomatik seçilir
- ✅ Account isolation korunur

---

**İstersen bu planı uygulayayım mı?** 🚀

