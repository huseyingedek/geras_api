# 💰 GİDER YÖNETİMİ API DOKÜMANTASYONU

## 📋 İçindekiler
- [Gider İşlemleri](#gider-işlemleri)
- [Kategori İşlemleri](#kategori-işlemleri)
- [Tedarikçi İşlemleri](#tedarikçi-işlemleri)
- [Kullanım Örnekleri](#kullanım-örnekleri)

---

## 🔐 Authentication & Authorization

### Authentication
Tüm endpoint'ler **JWT token** gerektirir.

```http
Authorization: Bearer YOUR_JWT_TOKEN
```

### Authorization
⚠️ **ÖNEMLİ**: Gider yönetimi modülüne **SADECE OWNER VE ADMIN** erişebilir!

Finansal veriler kritik olduğu için, bu endpoint'ler sadece işletme sahipleri ve sistem yöneticileri tarafından kullanılabilir.

**Erişebilen Roller:**
- ✅ `OWNER` - İşletme sahibi
- ✅ `ADMIN` - Sistem yöneticisi
- ❌ `EMPLOYEE` - Çalışan (ERİŞEMEZ)

Bu güvenlik kısıtlaması `restrictTo` middleware ile sağlanmaktadır.

---

## 💸 GİDER İŞLEMLERİ

### 1. Tüm Giderleri Listele

```http
GET /api/expenses
```

#### Query Parameters:
| Parametre | Tip | Zorunlu | Açıklama |
|-----------|-----|---------|----------|
| `page` | number | Hayır | Sayfa numarası (default: 1) |
| `limit` | number | Hayır | Sayfa başına kayıt (default: 20) |
| `period` | string | Hayır | Hızlı tarih filtresi: `today`, `yesterday`, `thisWeek`, `thisMonth` |
| `startDate` | date | Hayır | Başlangıç tarihi (YYYY-MM-DD) - period yoksa |
| `endDate` | date | Hayır | Bitiş tarihi (YYYY-MM-DD) - period yoksa |
| `categoryId` | number | Hayır | Kategori ID filtresi |
| `paymentStatus` | string | Hayır | `pending` / `paid` |
| `expenseType` | string | Hayır | `staff` / `vendor` / `general` |

#### Örnek İstek:
```bash
curl -X GET "http://localhost:5000/api/expenses?startDate=2025-01-01&endDate=2025-01-31&paymentStatus=pending" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Başarılı Yanıt (200):
```json
{
  "success": true,
  "data": [
    {
      "ExpenseID": 1,
      "AccountID": 1,
      "CategoryID": 2,
      "ExpenseDate": "2025-01-15",
      "Amount": "1500.00",
      "CurrencyCode": "TRY",
      "Description": "Ocak ayı kira ödemesi",
      "ExpenseType": "general",
      "StaffID": null,
      "VendorID": 3,
      "PaymentStatus": "pending",
      "PaidAmount": "0.00",
      "PaymentDate": null,
      "CreatedAt": "2025-01-10T10:00:00.000Z",
      "ExpenseCategories": {
        "CategoryID": 2,
        "CategoryName": "Kira",
        "Description": "Mağaza kira ödemeleri"
      },
      "Staff": null,
      "Vendors": {
        "VendorID": 3,
        "VendorName": "ABC Gayrimenkul",
        "ContactPerson": "Ahmet Yılmaz",
        "Phone": "0532 123 4567"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  },
  "summary": {
    "totalExpenses": 45,
    "totalAmount": 25750.00,
    "totalPaid": 18500.00,
    "totalUnpaid": 7250.00
  },
  "filter": {
    "period": null,
    "startDate": "2025-01-01",
    "endDate": "2025-01-31",
    "categoryId": null,
    "paymentStatus": "pending",
    "expenseType": null
  },
  "dateRange": {
    "startDate": "2025-01-01T00:00:00.000Z",
    "endDate": "2025-01-31T23:59:59.999Z"
  }
}
```

---

### 2. Yeni Gider Ekle

```http
POST /api/expenses
```

#### Request Body:
```json
{
  "categoryId": 2,
  "expenseDate": "2025-01-15",
  "amount": 1500,
  "currencyCode": "TRY",
  "description": "Ocak ayı kira ödemesi",
  "expenseType": "general",
  "staffId": null,
  "vendorId": 3,
  "paymentStatus": "pending",
  "paidAmount": 0,
  "paymentDate": null
}
```

#### Zorunlu Alanlar:
- `categoryId` (number) - Kategori ID
- `amount` (number) - Tutar
- `expenseType` (string) - Gider tipi: `staff`, `vendor`, `general`

#### Opsiyonel Alanlar:
- `expenseDate` (date) - Gider tarihi (default: bugün)
- `currencyCode` (string) - Para birimi (default: "TRY")
- `description` (string) - Açıklama
- `staffId` (number) - Personel ID (expenseType=staff ise)
- `vendorId` (number) - Tedarikçi ID (expenseType=vendor ise)
- `paymentStatus` (string) - pending / paid (default: "pending")
- `paidAmount` (number) - Ödenen tutar (default: 0)
- `paymentDate` (date) - Ödeme tarihi

#### Başarılı Yanıt (201):
```json
{
  "success": true,
  "message": "Gider başarıyla eklendi",
  "data": {
    "ExpenseID": 46,
    "AccountID": 1,
    "CategoryID": 2,
    "ExpenseDate": "2025-01-15",
    "Amount": "1500.00",
    "CurrencyCode": "TRY",
    "Description": "Ocak ayı kira ödemesi",
    "ExpenseType": "general",
    "PaymentStatus": "pending",
    "PaidAmount": "0.00",
    "CreatedAt": "2025-01-15T14:30:00.000Z"
  }
}
```

---

### 3. Gider Güncelle

```http
PUT /api/expenses/:id
```

#### Request Body (Tüm alanlar opsiyonel):
```json
{
  "categoryId": 2,
  "expenseDate": "2025-01-15",
  "amount": 1600,
  "description": "Ocak ayı kira ödemesi - güncellendi",
  "paymentStatus": "paid",
  "paidAmount": 1600,
  "paymentDate": "2025-01-20"
}
```

#### Başarılı Yanıt (200):
```json
{
  "success": true,
  "message": "Gider başarıyla güncellendi",
  "data": { ... }
}
```

---

### 4. Gider Sil

```http
DELETE /api/expenses/:id
```

#### Başarılı Yanıt (200):
```json
{
  "success": true,
  "message": "Gider başarıyla silindi"
}
```

---

## 📂 KATEGORİ İŞLEMLERİ

### 1. Tüm Kategorileri Listele

```http
GET /api/expenses/categories
```

⚠️ **DİKKAT**: Route sıralaması önemli! Bu endpoint `/api/expenses/:id` ile çakışmasın.
Eğer çalışmazsa route'u şöyle değiştir:
```javascript
router.get('/categories', ...)  // ÖNCE
router.get('/:id', ...)         // SONRA
```

#### Başarılı Yanıt (200):
```json
{
  "success": true,
  "data": [
    {
      "CategoryID": 1,
      "AccountID": 1,
      "CategoryName": "Maaş",
      "Description": "Personel maaş ödemeleri",
      "IsActive": true,
      "CreatedAt": "2025-01-01T00:00:00.000Z",
      "_count": {
        "Expenses": 12
      }
    },
    {
      "CategoryID": 2,
      "CategoryName": "Kira",
      "Description": "Mağaza kira ödemeleri",
      "IsActive": true,
      "_count": {
        "Expenses": 6
      }
    }
  ]
}
```

---

### 2. Yeni Kategori Ekle

```http
POST /api/expenses/categories
```

#### Request Body:
```json
{
  "categoryName": "Elektrik",
  "description": "Elektrik fatura ödemeleri"
}
```

#### Zorunlu Alan:
- `categoryName` (string) - Kategori adı

---

## 🏢 TEDARİKÇİ İŞLEMLERİ

### 1. Tüm Tedarikçileri Listele

```http
GET /api/expenses/vendors
```

#### Başarılı Yanıt (200):
```json
{
  "success": true,
  "data": [
    {
      "VendorID": 1,
      "AccountID": 1,
      "VendorName": "ABC Gayrimenkul",
      "ContactPerson": "Ahmet Yılmaz",
      "Phone": "0532 123 4567",
      "Email": "info@abcgayrimenkul.com",
      "Address": "İstanbul, Türkiye",
      "CreatedAt": "2025-01-01T00:00:00.000Z",
      "_count": {
        "Expenses": 6
      }
    }
  ]
}
```

---

### 2. Yeni Tedarikçi Ekle

```http
POST /api/expenses/vendors
```

#### Request Body:
```json
{
  "vendorName": "XYZ Malzeme",
  "contactPerson": "Mehmet Demir",
  "phone": "0533 987 6543",
  "email": "info@xyzmalzeme.com",
  "address": "Ankara, Türkiye"
}
```

#### Zorunlu Alan:
- `vendorName` (string) - Tedarikçi adı

---

## 📝 KULLANIM ÖRNEKLERİ

### Örnek 1: Personel Maaşı Ekleme

```javascript
// 1. Önce kategori oluştur
const category = await fetch('http://localhost:5000/api/expenses/categories', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    categoryName: 'Maaş',
    description: 'Personel maaş ödemeleri'
  })
});

// 2. Gider ekle
const expense = await fetch('http://localhost:5000/api/expenses', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    categoryId: 1,
    amount: 15000,
    expenseType: 'staff',
    staffId: 5,
    description: 'Ocak 2025 maaş ödemesi',
    paymentStatus: 'paid',
    paidAmount: 15000,
    paymentDate: '2025-01-31'
  })
});
```

---

### Örnek 2: Aylık Gider Raporu

```javascript
const response = await fetch(
  'http://localhost:5000/api/expenses?startDate=2025-01-01&endDate=2025-01-31',
  {
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN'
    }
  }
);

const data = await response.json();

console.log('Ocak Ayı Gider Raporu:');
console.log('Toplam Gider:', data.summary.totalAmount, 'TL');
console.log('Ödenen:', data.summary.totalPaid, 'TL');
console.log('Ödenmemiş:', data.summary.totalUnpaid, 'TL');
```

---

## 🔒 YETKİLENDİRME

### Rol Tabanlı Erişim Kontrolü

Gider yönetimi modülü **`restrictTo`** middleware ile korunmaktadır.

**Erişim Politikası:**
- ✅ **OWNER** - Tam erişim (işletme sahibi)
- ✅ **ADMIN** - Tam erişim (sistem yöneticisi)
- ❌ **EMPLOYEE** - ERİŞİM YOK

**Neden Sadece OWNER ve ADMIN?**
- 💰 Finansal veriler hassas bilgidir
- 📊 Maaş bilgileri gizli tutulmalıdır
- 🔒 İşletme giderleri sadece yönetim görmeli
- 📈 Kar-zarar analizi stratejik bilgidir

**Diğer Modüllerle Karşılaştırma:**
- `Sales` - Permission bazlı (EMPLOYEE erişebilir)
- `Appointments` - Permission bazlı (EMPLOYEE erişebilir)
- `Clients` - Permission bazlı (EMPLOYEE erişebilir)
- `Expenses` - **Rol bazlı** (Sadece OWNER/ADMIN) ⚠️

---

## ⚠️ HATA KODLARI

| Kod | Açıklama | Örnek Mesaj |
|-----|----------|-------------|
| 400 | Geçersiz istek / Eksik alan | "Gerekli alanlar: categoryId, amount, expenseType" |
| 401 | Yetkisiz erişim / Token geçersiz | "Giriş yapmadınız! Lütfen giriş yapın." |
| 403 | **İzin yok / Rol yetkisi yok** | "Bu işlemi yapmaya yetkiniz yok" (EMPLOYEE erişirse) |
| 404 | Kayıt bulunamadı | "Gider bulunamadı" |
| 500 | Sunucu hatası | "Giderler listelenemedi" |

**403 Hatası Özel Durum:**
EMPLOYEE rolündeki kullanıcılar gider endpoint'lerine erişmeye çalışırsa `403 Forbidden` alırlar.

---

## 🎯 ÖNEMLİ NOTLAR

1. **Tarih Formatı**: Tüm tarihler `YYYY-MM-DD` formatında olmalı
2. **Para Birimi**: Default olarak `TRY` kullanılır
3. **Pagination**: Default limit 20, maksimum 100
4. **Gider Tipleri**:
   - `staff` - Personel gideri (maaş, prim vb.)
   - `vendor` - Tedarikçi gideri (malzeme, kira vb.)
   - `general` - Genel gider (fatura, vergi vb.)

---

## 🚀 GELECEK ÖZELLİKLER (TODO)

- [ ] Tekrarlayan giderler (aylık kira vb.)
- [ ] Gider onay sistemi
- [ ] Fatura dosya yükleme
- [ ] Excel export
- [ ] Grafik ve raporlama
- [ ] Kategori güncelleme/silme endpoint'leri
- [ ] Tedarikçi güncelleme/silme endpoint'leri

---

**Son Güncelleme**: 06 Kasım 2025
**Versiyon**: 1.0.0

