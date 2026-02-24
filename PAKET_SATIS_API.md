# Paket Satış (Çoklu Hizmet) API Dokümantasyonu

**Base URL:** `/api/sales`  
**Auth:** `Authorization: Bearer <token>` — tüm endpoint'lerde zorunlu

---

## İçindekiler

1. [Paket Satış Oluştur](#1-paket-satış-oluştur)
2. [Satış Listesi](#2-satış-listesi)
3. [Satış Detayı](#3-satış-detayı)
4. [Satış Kalemleri](#4-satış-kalemleri)
5. [Seans Kullan](#5-seans-kullan)
6. [Taksit Planı Oluştur](#6-taksit-planı-oluştur)
7. [Frontend Mantığı ve Önemli Notlar](#7-frontend-mantığı)

---

## 1. Paket Satış Oluştur

**`POST /api/sales/package`**

Tek veya birden fazla hizmet içeren paket satış oluşturur.
Tek hizmet satmak için de bu endpoint kullanılabilir (`items` dizisinde 1 eleman).

### Request Body

```json
{
  "clientId": 631,
  "saleDate": "2026-02-24",
  "notes": "İsteğe bağlı not",
  "referenceId": null,
  "isInstallment": false,
  "installmentCount": null,
  "items": [
    {
      "serviceId": 84,
      "sessionCount": 12,
      "unitPrice": 12000,
      "notes": "İsteğe bağlı kalem notu"
    },
    {
      "serviceId": 85,
      "sessionCount": 6,
      "unitPrice": 6000
    },
    {
      "serviceId": 90,
      "sessionCount": 1,
      "unitPrice": 3500
    }
  ],
  "payments": [
    {
      "paymentMethod": "CASH",
      "amountPaid": 21500,
      "paymentDate": "2026-02-24"
    }
  ]
}
```

### Alan Açıklamaları

| Alan | Tip | Zorunlu | Açıklama |
|------|-----|---------|----------|
| `clientId` | number | ✅ | Müşteri ID |
| `saleDate` | string | ❌ | Satış tarihi. Boş bırakılırsa şu an kullanılır |
| `notes` | string | ❌ | Satış geneli notu |
| `referenceId` | number | ❌ | Referans kaynağı ID |
| `isInstallment` | boolean | ❌ | Taksitli mi? Default: `false` |
| `installmentCount` | number | ❌ | Planlanan taksit sayısı |
| `items` | array | ✅ | Min 1 eleman olmalı |
| `items[].serviceId` | number | ✅ | Hizmet ID |
| `items[].sessionCount` | number | ✅ | Seans veya adet sayısı (min 1) |
| `items[].unitPrice` | number | ✅ | **O hizmet için TOPLAM fiyat** (seans başına değil!) |
| `items[].notes` | string | ❌ | Kalem özel notu |
| `payments` | array | ❌ | Satış anında ödeme eklemek için. Boş bırakılabilir |
| `payments[].paymentMethod` | string | ✅ | `CASH`, `CREDIT_CARD`, `TRANSFER`, `OTHER` |
| `payments[].amountPaid` | number | ✅ | Ödenen tutar |
| `payments[].paymentDate` | string | ❌ | Ödeme tarihi. Boş bırakılırsa şu an |

> ⚠️ **ÖNEMLİ — `unitPrice` nasıl girilmeli:**
> `unitPrice` = o hizmet için toplam ücret (seans sayısıyla çarpılmaz).
>
> Örnek: 6 seans Cilt Bakımı → toplam 6.000 TL ise `unitPrice: 6000` gönder.
> Toplam satış tutarı = tüm `unitPrice` değerlerinin toplamı.

### Response `201`

```json
{
  "success": true,
  "message": "Paket satış başarıyla oluşturuldu.",
  "data": {
    "id": 519,
    "isPackage": true,
    "totalAmount": "21500",
    "remainingSessions": 19,
    "totalRemainingSessions": 19,
    "paidAmount": 21500,
    "remainingAmount": 0,
    "client": {
      "id": 631,
      "firstName": "Hüseyin",
      "lastName": "Gedek",
      "phone": "5354676801",
      "email": "hgedek1881@gmail.com"
    },
    "saleItems": [
      {
        "id": 1,
        "serviceId": 84,
        "sessionCount": 12,
        "remainingSessions": 12,
        "unitPrice": "12000",
        "notes": null,
        "service": {
          "id": 84,
          "serviceName": "LAZER EPİLASYON",
          "isSessionBased": true,
          "durationMinutes": 60
        }
      },
      {
        "id": 2,
        "serviceId": 85,
        "sessionCount": 6,
        "remainingSessions": 6,
        "unitPrice": "6000",
        "notes": null,
        "service": {
          "id": 85,
          "serviceName": "CİLT BAKIMI",
          "isSessionBased": true,
          "durationMinutes": 60
        }
      },
      {
        "id": 3,
        "serviceId": 90,
        "sessionCount": 1,
        "remainingSessions": 1,
        "unitPrice": "3500",
        "notes": null,
        "service": {
          "id": 90,
          "serviceName": "PROTEZ TIRNAK",
          "isSessionBased": false,
          "durationMinutes": 90
        }
      }
    ],
    "payments": [
      {
        "id": 101,
        "amountPaid": "21500",
        "paymentMethod": "CASH",
        "paymentDate": "2026-02-24T00:00:00.000Z"
      }
    ]
  }
}
```

### Hata Yanıtları

| HTTP | Mesaj |
|------|-------|
| 400 | `"Müşteri seçilmelidir."` |
| 400 | `"En az bir hizmet eklemelisiniz."` |
| 400 | `"1. hizmet için serviceId gereklidir."` |
| 400 | `"1. hizmet için birim fiyat gereklidir."` |
| 400 | `"1. hizmet için seans sayısı en az 1 olmalıdır."` |
| 404 | `"Müşteri bulunamadı."` |
| 404 | `"Bir veya daha fazla hizmet bulunamadı."` |

---

## 2. Satış Listesi

**`GET /api/sales?period=today&page=1&limit=10`**

Mevcut endpoint. Paket satışlar artık `saleItems` ve `displayServiceName` alanlarıyla gelir.

### Yeni Alanlar (paket satış için)

| Alan | Tip | Açıklama |
|------|-----|----------|
| `isPackage` | boolean | `true` ise paket satış |
| `displayServiceName` | string | Her zaman dolu gelen hizmet adı (aşağıya bak) |
| `saleItems` | array | Paket satış kalemleri. Tek hizmetli satışlarda `[]` |

### Paket Satışta Randevu Açma

Paket satışta randevu açarken **hangi hizmet için** açıldığı belirtilmeli.

```
POST /api/appointments
{
  "saleId": 519,
  "saleItemId": 2,          ← zorunlu (paket satışlarda)
  "staffId": 3,
  "appointmentDate": "2026-03-10T10:00:00"
}
```

- `saleItemId` = `saleItems[].id` değeri (hangi hizmet için randevu)
- Her hizmet kendi seans sayısıyla bağımsız kontrol edilir
  - Cilt bakımı 5 seans → cilt için max 5 randevu
  - Lazer 12 seans → lazer için max 12 randevu
- `saleItemId` gönderilmezse hata döner:
  `"Paket satışlarda hangi hizmet için randevu açıldığını belirtmelisiniz (saleItemId)."`

**Randevu formu akışı:**
```
1. Müşteri seç
2. GET /api/sales?clientId={id} → satışları listele
3. Satış seç (sale.isPackage ise dropdown'da hizmetler listele)
4. Paketse → saleItems dizisinden hizmet seç (saleItemId)
5. POST /api/appointments ile randevu oluştur
```

---

### Randevu Formu — Satış Seçimi (Dropdown)

Müşteri seçildikten sonra o müşterinin satışlarını listelemek için:

```
GET /api/sales?clientId=631&isDeleted=false
```

Her satışta `displayServiceName` ve `remainingSessions` kullan:

```js
// Dropdown seçeneği oluşturmak için
const label = `${sale.displayServiceName} — ${sale.remainingSessions} seans kaldı`;

// Kalan seansı olmayan satışları grile veya filtrele:
const hasSessions = sale.remainingSessions > 0;
```

---

### `displayServiceName` Değerleri

| Durum | Değer |
|-------|-------|
| Eski tek hizmetli satış | `"LAZER EPİLASYON"` |
| Paket — 1 hizmet | `"CİLT BAKIMI"` |
| Paket — 2 veya daha fazla hizmet | `"Paket (3 hizmet)"` |
| Bilinmeyen | `"Paket Satış"` |

> ✅ Listede hizmet adı göstermek için her zaman `displayServiceName` kullan, `service.serviceName` değil.

### Response Örneği

```json
{
  "success": true,
  "data": [
    {
      "id": 519,
      "isPackage": true,
      "serviceId": null,
      "service": null,
      "displayServiceName": "Paket (3 hizmet)",
      "totalAmount": "21500",
      "remainingSessions": 19,
      "saleItems": [
        {
          "id": 1,
          "serviceId": 84,
          "sessionCount": 12,
          "remainingSessions": 12,
          "unitPrice": "12000",
          "service": {
            "id": 84,
            "serviceName": "LAZER EPİLASYON",
            "isSessionBased": true,
            "sessionCount": 12,
            "durationMinutes": 60
          }
        },
        {
          "id": 2,
          "serviceId": 85,
          "sessionCount": 6,
          "remainingSessions": 6,
          "unitPrice": "6000",
          "service": {
            "id": 85,
            "serviceName": "CİLT BAKIMI",
            "isSessionBased": true,
            "sessionCount": 6,
            "durationMinutes": 60
          }
        }
      ]
    },
    {
      "id": 50,
      "isPackage": false,
      "serviceId": 82,
      "service": {
        "id": 82,
        "serviceName": "MANIKÜR",
        "isSessionBased": false
      },
      "displayServiceName": "MANIKÜR",
      "saleItems": []
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 2,
    "totalPages": 1
  },
  "summary": {
    "totalSalesAmount": 21550,
    "totalRevenue": 21500,
    "sessionBased": 2,
    "activeSessions": 2
  }
}
```

---

## 3. Satış Detayı

**`GET /api/sales/:id`**

Mevcut endpoint. Paket satışlarda `saleItems` ve her kalemin seansları dahil gelir.

### Response Örneği (paket satış)

```json
{
  "success": true,
  "data": {
    "id": 519,
    "isPackage": true,
    "serviceId": null,
    "service": null,
    "displayServiceName": "Paket (3 hizmet)",
    "totalAmount": "21500",
    "remainingSessions": 17,
    "saleItems": [
      {
        "id": 1,
        "serviceId": 84,
        "sessionCount": 12,
        "remainingSessions": 10,
        "unitPrice": "12000",
        "notes": null,
        "service": {
          "id": 84,
          "serviceName": "LAZER EPİLASYON",
          "isSessionBased": true,
          "sessionCount": 12,
          "durationMinutes": 60
        },
        "sessions": [
          {
            "id": 15,
            "sessionDate": "2026-02-20T10:00:00.000Z",
            "status": "COMPLETED",
            "notes": null,
            "staff": { "id": 2, "fullName": "Merve Hanım" }
          },
          {
            "id": 16,
            "sessionDate": "2026-02-24T11:00:00.000Z",
            "status": "SCHEDULED",
            "notes": null,
            "staff": { "id": 2, "fullName": "Merve Hanım" }
          }
        ]
      },
      {
        "id": 2,
        "serviceId": 85,
        "sessionCount": 6,
        "remainingSessions": 6,
        "unitPrice": "6000",
        "service": { "serviceName": "CİLT BAKIMI" },
        "sessions": []
      },
      {
        "id": 3,
        "serviceId": 90,
        "sessionCount": 1,
        "remainingSessions": 1,
        "unitPrice": "3500",
        "service": { "serviceName": "PROTEZ TIRNAK" },
        "sessions": []
      }
    ],
    "payments": [...],
    "paymentStatus": {
      "totalAmount": "21500.00",
      "completedAmount": "10000.00",
      "pendingAmount": "0.00",
      "remainingDebt": "11500.00",
      "isPaid": false,
      "totalPaid": "10000.00",
      "remainingPayment": "11500.00"
    }
  }
}
```

---

## 4. Satış Kalemleri

**`GET /api/sales/:id/items`**

Hem paket hem eski tek hizmetli satışlar için çalışır.

### Paket Satış Response

```json
{
  "success": true,
  "data": {
    "isPackage": true,
    "totalSessionCount": 19,
    "totalRemainingSessions": 17,
    "items": [
      {
        "id": 1,
        "serviceId": 84,
        "serviceName": "LAZER EPİLASYON",
        "isSessionBased": true,
        "durationMinutes": 60,
        "sessionCount": 12,
        "remainingSessions": 10,
        "usedSessions": 2,
        "unitPrice": "12000",
        "notes": null,
        "sessions": [
          {
            "id": 15,
            "sessionDate": "2026-02-20T10:00:00.000Z",
            "status": "COMPLETED",
            "notes": null,
            "staff": { "id": 2, "fullName": "Merve Hanım" }
          }
        ]
      },
      {
        "id": 2,
        "serviceId": 85,
        "serviceName": "CİLT BAKIMI",
        "isSessionBased": true,
        "durationMinutes": 60,
        "sessionCount": 6,
        "remainingSessions": 6,
        "usedSessions": 0,
        "unitPrice": "6000",
        "sessions": []
      }
    ]
  }
}
```

### Eski Tek Hizmetli Satış Response

```json
{
  "success": true,
  "data": {
    "isPackage": false,
    "service": {
      "id": 82,
      "serviceName": "MANIKÜR",
      "isSessionBased": false,
      "sessionCount": 1
    },
    "remainingSessions": 1,
    "items": []
  }
}
```

---

## 5. Seans Kullan

**`PATCH /api/sales/items/:itemId/use-session`**

Paket içindeki belirli bir hizmetten 1 seans kullanır.
`itemId` = `saleItems[].id` değeri.

### Request Body

```json
{
  "staffId": 2,
  "sessionDate": "2026-02-24T11:00:00",
  "notes": "İsteğe bağlı not"
}
```

> Tüm alanlar isteğe bağlıdır.

### Response `200`

```json
{
  "success": true,
  "message": "Seans kullanıldı.",
  "data": {
    "session": {
      "id": 25,
      "saleId": 519,
      "saleItemId": 2,
      "sessionDate": "2026-02-24T11:00:00.000Z",
      "status": "SCHEDULED"
    },
    "remainingSessions": 5,
    "serviceName": "CİLT BAKIMI"
  }
}
```

### Hata Yanıtları

| HTTP | Mesaj |
|------|-------|
| 404 | `"Satış kalemi bulunamadı."` |
| 400 | `"CİLT BAKIMI için kalan seans yok."` |

> ⚠️ Paket satışlarda seans kullanmak için bu endpoint kullanılır.
> Eski `/api/sales/:id/sessions` endpoint'i **yalnızca tek hizmetli satışlar** içindir.

---

## 6. Taksit Planı Oluştur

**`POST /api/sales/:id/installments`**

Paket satışlarda da tam çalışır. Satış oluşturduktan sonra dönen `id` ile taksit planı bağlanır.

### Request Body

```json
{
  "smsReminderEnabled": true,
  "installments": [
    { "amount": 3583.33, "dueDate": "2026-03-01", "paymentMethod": "CASH" },
    { "amount": 3583.33, "dueDate": "2026-04-01", "paymentMethod": "CASH" },
    { "amount": 3583.33, "dueDate": "2026-05-01", "paymentMethod": "CASH" },
    { "amount": 3583.33, "dueDate": "2026-06-01", "paymentMethod": "CASH" },
    { "amount": 3583.33, "dueDate": "2026-07-01", "paymentMethod": "CASH" },
    { "amount": 3583.35, "dueDate": "2026-08-01", "paymentMethod": "CASH" }
  ]
}
```

> - Taksit toplamı satış tutarını **aşamaz** (validation var).
> - `paymentMethod`: `CASH`, `CREDIT_CARD`, `TRANSFER`, `OTHER`
> - Onay SMS'i otomatik gönderilir (işletme SMS ayarı açıksa).

### Response `201`

```json
{
  "success": true,
  "message": "Taksit planı başarıyla oluşturuldu",
  "data": {
    "saleId": 519,
    "installmentCount": 6,
    "totalAmount": 21500,
    "smsReminderEnabled": true,
    "smsSent": true,
    "installments": [...]
  }
}
```

---

## 7. Frontend Mantığı

### Satış tipini belirle

```js
if (sale.isPackage) {
  // Paket satış — saleItems dizisini kullan
} else {
  // Eski tek hizmetli satış — service alanını kullan
}
```

### Hizmet adı göster (her zaman güvenli)

```js
// Her iki satış tipinde de çalışır
const name = sale.displayServiceName;

// Örnekler:
// "LAZER EPİLASYON"    → tek hizmetli veya tek itemlı paket
// "Paket (3 hizmet)"   → çoklu hizmet
// "Paket Satış"        → fallback
```

### Seans kullan butonu mantığı

```js
if (sale.isPackage) {
  // Her item için ayrı "Seans Kullan" butonu
  // item.remainingSessions > 0 ise buton aktif
  // PATCH /api/sales/items/:item.id/use-session
} else {
  // Eski tek hizmetli satış için
  // POST /api/sales/:saleId/sessions
}
```

### Örnek akış: 3 hizmet sat, 6 taksit yap

```
1. POST /api/sales/package
   {
     clientId: 631,
     items: [
       { serviceId: 84, sessionCount: 12, unitPrice: 12000 },
       { serviceId: 85, sessionCount: 6,  unitPrice: 6000  },
       { serviceId: 90, sessionCount: 1,  unitPrice: 3500  }
     ]
   }
   → sale.id: 519 döner, toplam: 21.500 TL

2. POST /api/sales/519/installments
   { installments: [6 taksit × ~3583 TL, vade tarihleri farklı] }
   → Taksit planı oluşur, SMS gönderilir

3. GET /api/sales/519        → Satış detayı
4. GET /api/sales/519/items  → Kalem bazlı seans takibi

5. Seans kullanmak için:
   PATCH /api/sales/items/1/use-session  → Lazer seansı kullan
   PATCH /api/sales/items/2/use-session  → Cilt bakımı seansı kullan
```

### Kalem bazlı ilerleme gösterimi

```js
// Her item için ilerleme çubuğu
const progress = (item.sessionCount - item.remainingSessions) / item.sessionCount;
// 0.0 → 1.0 arası (0% → 100%)

const label = `${item.sessionCount - item.remainingSessions} / ${item.sessionCount} seans`;
```

### Ödeme durumu kontrolü

```js
// getSaleById veya getAllSales'dan gelen veriyle
const isPaid = sale.paymentStatus?.isPaid ?? false;
const remainingDebt = parseFloat(sale.paymentStatus?.remainingDebt ?? 0);
```

---

## Session Durumları

| Değer | Açıklama |
|-------|----------|
| `SCHEDULED` | Planlandı |
| `COMPLETED` | Tamamlandı |
| `CANCELLED` | İptal edildi |
| `NO_SHOW` | Müşteri gelmedi |

---

## 8. Satış Düzenleme

### 8a. Satış Geneli Güncelle

**`PUT /api/sales/:id`**

Hem tek hizmetli hem paket satışlar için çalışır.

| Alan | Tip | Açıklama |
|------|-----|----------|
| `notes` | string | Satış notu |
| `totalAmount` | number | Toplam tutar (dikkatli kullan) |
| `remainingSessions` | number | Kalan seans (dikkatli kullan) |
| `reference_id` | number | Referans kaynağı |

> - Paket satışta `serviceId` göndermek **hata döner** (kalem düzenlemek için aşağıyı kullan).
> - **Paket satış:** 7 gün içinde düzenlenebilir.
> - **Tek hizmetli satış:** 2 gün içinde düzenlenebilir.

---

### 8b. Kalem Fiyat/Seans Güncelle

**`PATCH /api/sales/items/:itemId`**

`itemId` = `saleItems[].id` değeri.

```json
{
  "unitPrice": 7000,
  "sessionCount": 8,
  "notes": "Fiyat güncellendi"
}
```

> - Tüm alanlar isteğe bağlı, en az biri gönderilmeli.
> - `sessionCount` kullanılmış seans sayısının altına **düşürülemez**.
> - Değişiklik otomatik olarak `Sales.totalAmount` ve `Sales.remainingSessions` alanlarına yansır.

**Response `200`:**

```json
{
  "success": true,
  "message": "Kalem başarıyla güncellendi.",
  "data": {
    "id": 2,
    "sessionCount": 8,
    "remainingSessions": 6,
    "unitPrice": "7000",
    "usedSessions": 2,
    "service": { "id": 85, "serviceName": "CİLT BAKIMI" }
  }
}
```

**Hata Yanıtları:**

| HTTP | Mesaj |
|------|-------|
| 400 | `"Güncellenecek alan belirtilmelidir."` |
| 400 | `"Bu kalemde 2 seans kullanılmış. Seans sayısı bunun altına düşürülemez."` |
| 404 | `"Satış kalemi bulunamadı."` |

---

### 8c. Pakete Yeni Hizmet Ekle

**`POST /api/sales/:id/items`**

```json
{
  "serviceId": 92,
  "sessionCount": 4,
  "unitPrice": 4000,
  "notes": "İsteğe bağlı"
}
```

> - Yalnızca `isPackage: true` olan satışlara eklenebilir.
> - `totalAmount` ve `remainingSessions` otomatik artar.

**Response `201`:**

```json
{
  "success": true,
  "message": "Hizmet pakete eklendi.",
  "data": {
    "id": 4,
    "serviceId": 92,
    "sessionCount": 4,
    "remainingSessions": 4,
    "unitPrice": "4000",
    "service": { "id": 92, "serviceName": "KAŞ DİZAYN", "isSessionBased": true }
  }
}
```

---

### 8d. Paketten Hizmet Çıkar

**`DELETE /api/sales/:id/items/:itemId`**

> - Kullanılmış seansı olan kalem **silinemez**.
> - Pakette yalnızca 1 kalem kalıyorsa silinemez (paketi tamamen silmek için satış silme kullanılır).
> - `totalAmount` ve `remainingSessions` otomatik azalır.

**Response `200`:**

```json
{
  "success": true,
  "message": "CİLT BAKIMI paketten çıkarıldı."
}
```

**Hata Yanıtları:**

| HTTP | Mesaj |
|------|-------|
| 400 | `"CİLT BAKIMI için 2 seans kullanılmış. Kullanılmış seansı olan kalem silinemez."` |
| 400 | `"Pakette en az 1 hizmet olmalıdır."` |
| 404 | `"Kalem bulunamadı."` |

---

## Endpoint Özeti

| Method | URL | Açıklama |
|--------|-----|----------|
| `POST` | `/api/sales` | Tek hizmetli satış oluştur |
| `POST` | `/api/sales/package` | Paket satış oluştur |
| `GET` | `/api/sales` | Satış listesi (saleItems dahil) |
| `GET` | `/api/sales/:id` | Satış detayı (saleItems dahil) |
| `PUT` | `/api/sales/:id` | Satış güncelle (not, tarih, referans) |
| `DELETE` | `/api/sales/:id` | Satış sil (soft) |
| `GET` | `/api/sales/:id/items` | Kalem bazlı seans durumu |
| `POST` | `/api/sales/:id/items` | Pakete yeni hizmet ekle |
| `DELETE` | `/api/sales/:id/items/:itemId` | Paketten hizmet çıkar |
| `PATCH` | `/api/sales/items/:itemId` | Kalem fiyat/seans güncelle |
| `PATCH` | `/api/sales/items/:itemId/use-session` | Paketten seans kullan |
| `POST` | `/api/sales/:id/installments` | Taksit planı oluştur |
| `GET` | `/api/sales/:id/installments` | Taksit planını getir |
| `PATCH` | `/api/sales/payments/:paymentId/installment` | Taksit güncelle |
| `GET` | `/api/sales/:id/payments` | Satış ödemelerini getir |
| `POST` | `/api/sales/:id/payments` | Satışa ödeme ekle |

---

## Güvenlik ve Korumalar

| Kural | Açıklama |
|-------|----------|
| Paket satışta serviceId değiştirilemez | `PUT /api/sales/:id` içinde engellendi |
| Tekil satış 2 gün, paket satış 7 gün düzenlenebilir | `updateSale` içinde kontrol var |
| Kullanılmış seansı olan kalem silinemez | `removeSaleItem` içinde kontrol var |
| Seans sayısı kullanılan seansın altına düşürülemez | `updateSaleItem` içinde kontrol var |
| Pakette son kalem silinemez | `removeSaleItem` içinde kontrol var |
| Paket olmayan satışa kalem eklenemez | `addSaleItem` içinde kontrol var |
| totalAmount her kalem değişikliğinde otomatik güncellenir | Transaction içinde yapılıyor |

---

*Son güncelleme: 24 Şubat 2026*
