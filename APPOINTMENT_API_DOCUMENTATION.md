# 📅 Randevu API Dokümantasyonu

## Base URL
```
https://your-backend.onrender.com/api/appointments
```

## Authentication
Tüm endpoint'ler **JWT Token** gerektirir.

```http
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## 🚀 1. RANDEVU OLUŞTURMA (Quick Appointment)

### Endpoint
```http
POST /api/appointments/quick
```

### Request Body
```json
{
  "firstName": "Ahmet",
  "lastName": "Yılmaz",
  "phone": "05551234567",
  "email": "ahmet@example.com",
  "serviceId": 5,
  "staffId": 3,
  "appointmentDate": "2025-10-20T14:00:00.000Z",
  "totalAmount": 1500.00,
  "remainingSessions": 8,
  "notes": "İlk seans",
  "saleDate": "2025-10-16T10:00:00.000Z"
}
```

### Request Parametreleri
| Alan | Tip | Zorunlu | Açıklama |
|------|-----|---------|----------|
| `firstName` | string | ✅ | Müşteri adı |
| `lastName` | string | ✅ | Müşteri soyadı |
| `phone` | string | ❌ | Telefon numarası |
| `email` | string | ❌ | E-posta adresi |
| `serviceId` | integer | ✅ | Hizmet ID |
| `staffId` | integer | ✅ | Personel ID |
| `appointmentDate` | datetime | ✅ | Randevu tarihi (ISO 8601) |
| `totalAmount` | decimal | ❌ | Toplam tutar |
| `remainingSessions` | integer | ❌ | Kalan seans sayısı |
| `notes` | string | ❌ | Randevu notu |
| `saleDate` | datetime | ❌ | Satış tarihi |

### ✅ Başarılı Response (201 Created)
```json
{
  "success": true,
  "data": {
    "client": {
      "id": 42,
      "firstName": "Ahmet",
      "lastName": "Yılmaz",
      "phone": "05551234567",
      "email": "ahmet@example.com",
      "accountId": 1,
      "isActive": true,
      "createdAt": "2025-10-16T10:30:00.000Z",
      "updatedAt": "2025-10-16T10:30:00.000Z"
    },
    "sale": {
      "id": 128,
      "accountId": 1,
      "clientId": 42,
      "serviceId": 5,
      "saleDate": "2025-10-16T10:00:00.000Z",
      "totalAmount": "1500.00",
      "remainingSessions": 8,
      "isDeleted": false,
      "notes": null,
      "createdAt": "2025-10-16T10:30:00.000Z",
      "updatedAt": "2025-10-16T10:30:00.000Z"
    },
    "appointment": {
      "id": 256,
      "accountId": 1,
      "customerName": "Ahmet Yılmaz",
      "clientId": 42,
      "serviceId": 5,
      "staffId": 3,
      "saleId": 128,
      "appointmentDate": "2025-10-20T14:00:00.000Z",
      "status": "PLANNED",
      "notes": "İlk seans",
      "reminderSentAt": null,
      "createdAt": "2025-10-16T10:30:00.000Z",
      "updatedAt": "2025-10-16T10:30:00.000Z"
    }
  },
  "message": "Hızlı randevu başarıyla oluşturuldu"
}
```

### ❌ Hata Responses

#### 400 - Gerekli Alan Eksik
```json
{
  "success": false,
  "message": "Gerekli alanlar eksik: firstName, lastName, serviceId, staffId, appointmentDate"
}
```

#### 400 - Geçmiş Tarih
```json
{
  "success": false,
  "message": "Geçmiş tarihe randevu oluşturulamaz"
}
```

#### 404 - Hizmet Bulunamadı
```json
{
  "success": false,
  "message": "Hizmet bulunamadı"
}
```

#### 404 - Personel Bulunamadı
```json
{
  "success": false,
  "message": "Personel bulunamadı"
}
```

#### 400 - Personel Çalışmıyor
```json
{
  "success": false,
  "message": "Personel bu gün çalışmıyor"
}
```

#### 400 - Çalışma Saatleri Dışı
```json
{
  "success": false,
  "message": "Randevu çalışma saatleri dışında. Çalışma saatleri: 09:00 - 18:00"
}
```

#### 400 - Çakışan Randevu
```json
{
  "success": false,
  "message": "Bu saatte çakışan randevu var: 14:00 - 15:30 (Mehmet Demir)"
}
```

#### 500 - Sunucu Hatası
```json
{
  "success": false,
  "message": "Hızlı randevu oluşturulurken hata oluştu",
  "error": "Database connection failed"
}
```

---

## 📋 2. TÜM RANDEVULARI LİSTELE

### Endpoint
```http
GET /api/appointments
```

### Query Parameters
| Parametre | Tip | Açıklama | Örnek |
|-----------|-----|----------|-------|
| `page` | integer | Sayfa numarası (default: 1) | `?page=2` |
| `limit` | integer | Sayfa başına kayıt (default: 10) | `?limit=20` |
| `status` | string | Durum filtresi | `?status=PLANNED` |
| `staffId` | integer | Personel filtresi | `?staffId=3` |
| `period` | string | Hızlı tarih filtresi | `?period=today` |
| `startDate` | datetime | Başlangıç tarihi | `?startDate=2025-10-01` |
| `endDate` | datetime | Bitiş tarihi | `?endDate=2025-10-31` |

### Period Değerleri
- `today` - Bugün
- `yesterday` - Dün
- `thisWeek` - Bu hafta
- `nextWeek` - Gelecek hafta
- `thisMonth` - Bu ay
- `nextMonth` - Gelecek ay
- `custom` - Özel tarih aralığı (startDate ve endDate ile)

### Status Değerleri
- `PLANNED` - Planlandı
- `COMPLETED` - Tamamlandı
- `CANCELLED` - İptal edildi

### Örnek Request
```http
GET /api/appointments?page=1&limit=10&status=PLANNED&period=today
```

### ✅ Başarılı Response (200 OK)
```json
{
  "success": true,
  "data": {
    "appointments": [
      {
        "id": 256,
        "accountId": 1,
        "customerName": "Ahmet Yılmaz",
        "clientId": 42,
        "serviceId": 5,
        "staffId": 3,
        "saleId": 128,
        "appointmentDate": "2025-10-20T14:00:00.000Z",
        "status": "PLANNED",
        "notes": "İlk seans",
        "reminderSentAt": null,
        "createdAt": "2025-10-16T10:30:00.000Z",
        "updatedAt": "2025-10-16T10:30:00.000Z",
        "client": {
          "id": 42,
          "firstName": "Ahmet",
          "lastName": "Yılmaz",
          "phone": "05551234567",
          "email": "ahmet@example.com"
        },
        "service": {
          "id": 5,
          "serviceName": "Lazer Epilasyon",
          "price": "200.00",
          "durationMinutes": 60
        },
        "staff": {
          "id": 3,
          "fullName": "Dr. Ayşe Kaya",
          "role": "Uzman"
        },
        "sale": {
          "id": 128,
          "totalAmount": "1500.00",
          "remainingSessions": 8
        }
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 48,
      "itemsPerPage": 10,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  },
  "message": "Randevular başarıyla getirildi"
}
```

### ❌ Hata Response (500)
```json
{
  "success": false,
  "message": "Randevular getirilirken hata oluştu",
  "error": "Database query failed"
}
```

---

## 🔍 3. TEK RANDEVU DETAYI

### Endpoint
```http
GET /api/appointments/:id
```

### Örnek Request
```http
GET /api/appointments/256
```

### ✅ Başarılı Response (200 OK)
```json
{
  "success": true,
  "data": {
    "id": 256,
    "accountId": 1,
    "customerName": "Ahmet Yılmaz",
    "clientId": 42,
    "serviceId": 5,
    "staffId": 3,
    "saleId": 128,
    "appointmentDate": "2025-10-20T14:00:00.000Z",
    "status": "PLANNED",
    "notes": "İlk seans",
    "reminderSentAt": null,
    "createdAt": "2025-10-16T10:30:00.000Z",
    "updatedAt": "2025-10-16T10:30:00.000Z",
    "client": {
      "id": 42,
      "firstName": "Ahmet",
      "lastName": "Yılmaz",
      "phone": "05551234567",
      "email": "ahmet@example.com"
    },
    "service": {
      "id": 5,
      "serviceName": "Lazer Epilasyon",
      "description": "Full body lazer epilasyon paketi",
      "price": "200.00",
      "durationMinutes": 60,
      "isSessionBased": true,
      "sessionCount": 8
    },
    "staff": {
      "id": 3,
      "fullName": "Dr. Ayşe Kaya",
      "role": "Uzman",
      "phone": "05559876543",
      "email": "ayse.kaya@example.com"
    },
    "sale": {
      "id": 128,
      "saleDate": "2025-10-16T10:00:00.000Z",
      "totalAmount": "1500.00",
      "remainingSessions": 8,
      "notes": null
    }
  },
  "message": "Randevu başarıyla getirildi"
}
```

### ❌ Hata Responses

#### 404 - Randevu Bulunamadı
```json
{
  "success": false,
  "message": "Randevu bulunamadı"
}
```

#### 500 - Sunucu Hatası
```json
{
  "success": false,
  "message": "Randevu getirilirken hata oluştu",
  "error": "Database connection failed"
}
```

---

## ✏️ 4. RANDEVU GÜNCELLEME

### Endpoint
```http
PUT /api/appointments/:id
```

### Request Body
```json
{
  "staffId": 4,
  "appointmentDate": "2025-10-20T15:00:00.000Z",
  "status": "PLANNED",
  "notes": "Randevu saati değiştirildi"
}
```

### Güncellenebilir Alanlar
| Alan | Tip | Açıklama |
|------|-----|----------|
| `staffId` | integer | Personel değişikliği |
| `appointmentDate` | datetime | Tarih/saat değişikliği |
| `status` | string | Durum güncellemesi (PLANNED, COMPLETED, CANCELLED) |
| `notes` | string | Not güncelleme |

### Örnek Request
```http
PUT /api/appointments/256
Content-Type: application/json

{
  "staffId": 4,
  "appointmentDate": "2025-10-20T15:00:00.000Z",
  "notes": "Saat değişti"
}
```

### ✅ Başarılı Response (200 OK)
```json
{
  "success": true,
  "data": {
    "id": 256,
    "accountId": 1,
    "customerName": "Ahmet Yılmaz",
    "clientId": 42,
    "serviceId": 5,
    "staffId": 4,
    "saleId": 128,
    "appointmentDate": "2025-10-20T15:00:00.000Z",
    "status": "PLANNED",
    "notes": "Saat değişti",
    "reminderSentAt": null,
    "createdAt": "2025-10-16T10:30:00.000Z",
    "updatedAt": "2025-10-16T11:15:00.000Z",
    "client": {
      "id": 42,
      "firstName": "Ahmet",
      "lastName": "Yılmaz",
      "phone": "05551234567",
      "email": "ahmet@example.com"
    },
    "service": {
      "id": 5,
      "serviceName": "Lazer Epilasyon",
      "price": "200.00",
      "durationMinutes": 60
    },
    "staff": {
      "id": 4,
      "fullName": "Dr. Mehmet Öz",
      "role": "Uzman"
    }
  },
  "message": "Randevu başarıyla güncellendi"
}
```

### ❌ Hata Responses

#### 400 - Geçmiş Tarihe Güncellenemez
```json
{
  "success": false,
  "message": "Geçmiş tarihe randevu güncellenemez"
}
```

#### 404 - Randevu Bulunamadı
```json
{
  "success": false,
  "message": "Randevu bulunamadı"
}
```

#### 404 - Personel Bulunamadı
```json
{
  "success": false,
  "message": "Personel bulunamadı veya aktif değil"
}
```

#### 400 - Personel Çalışmıyor
```json
{
  "success": false,
  "message": "Personel bu gün çalışmıyor"
}
```

#### 400 - Çakışan Randevu
```json
{
  "success": false,
  "message": "Bu saatte personelin başka randevusu var: 15:00 - 16:00 (Ayşe Yıldız)"
}
```

#### 500 - Sunucu Hatası
```json
{
  "success": false,
  "message": "Randevu güncellenirken hata oluştu",
  "error": "Database update failed"
}
```

---

## 🗑️ 5. RANDEVU SİLME (Soft Delete)

### Endpoint
```http
DELETE /api/appointments/:id
```

### Örnek Request
```http
DELETE /api/appointments/256
```

### ✅ Başarılı Response (200 OK)
```json
{
  "success": true,
  "message": "Randevu başarıyla silindi"
}
```

### ❌ Hata Responses

#### 404 - Randevu Bulunamadı
```json
{
  "success": false,
  "message": "Randevu bulunamadı"
}
```

#### 500 - Sunucu Hatası
```json
{
  "success": false,
  "message": "Randevu silinirken hata oluştu",
  "error": "Database deletion failed"
}
```

---

## ✅ 6. RANDEVU TAMAMLAMA

### Endpoint
```http
POST /api/appointments/:id/complete
```

### Örnek Request
```http
POST /api/appointments/256/complete
Content-Type: application/json

{
  "notes": "Seans başarıyla tamamlandı"
}
```

### ✅ Başarılı Response (200 OK)
```json
{
  "success": true,
  "data": {
    "appointment": {
      "id": 256,
      "status": "COMPLETED",
      "notes": "Seans başarıyla tamamlandı",
      "updatedAt": "2025-10-20T15:30:00.000Z"
    },
    "sale": {
      "id": 128,
      "remainingSessions": 7
    }
  },
  "message": "Randevu tamamlandı ve seans sayısı güncellendi"
}
```

### ❌ Hata Responses

#### 404 - Randevu Bulunamadı
```json
{
  "success": false,
  "message": "Randevu bulunamadı"
}
```

#### 400 - Randevu Zaten Tamamlandı
```json
{
  "success": false,
  "message": "Bu randevu zaten tamamlanmış"
}
```

#### 500 - Sunucu Hatası
```json
{
  "success": false,
  "message": "Randevu tamamlanırken hata oluştu",
  "error": "Failed to update session count"
}
```

---

## 📅 7. BUGÜNKÜ RANDEVULAR

### Endpoint
```http
GET /api/appointments/today
```

### ✅ Başarılı Response (200 OK)
```json
{
  "success": true,
  "data": {
    "appointments": [
      {
        "id": 256,
        "customerName": "Ahmet Yılmaz",
        "appointmentDate": "2025-10-16T14:00:00.000Z",
        "status": "PLANNED",
        "client": {
          "firstName": "Ahmet",
          "lastName": "Yılmaz",
          "phone": "05551234567"
        },
        "service": {
          "serviceName": "Lazer Epilasyon",
          "durationMinutes": 60
        },
        "staff": {
          "fullName": "Dr. Ayşe Kaya"
        }
      }
    ],
    "summary": {
      "total": 12,
      "planned": 8,
      "completed": 3,
      "cancelled": 1
    }
  },
  "message": "Bugünkü randevular başarıyla getirildi"
}
```

---

## 📊 8. HAFTALIK RANDEVULAR

### Endpoint
```http
GET /api/appointments/weekly
```

### ✅ Başarılı Response (200 OK)
```json
{
  "success": true,
  "data": {
    "appointments": [
      // Randevu listesi
    ],
    "summary": {
      "total": 45,
      "planned": 30,
      "completed": 12,
      "cancelled": 3
    }
  },
  "message": "Bu haftanın randevuları başarıyla getirildi"
}
```

---

## 🔍 9. PERSONEL MÜSAİTLİK KONTROLÜ

### Endpoint
```http
GET /api/appointments/check-availability
```

### Query Parameters
```
?staffId=3&date=2025-10-20&duration=60
```

### ✅ Başarılı Response (200 OK)
```json
{
  "success": true,
  "data": {
    "isAvailable": true,
    "availableSlots": [
      {
        "startTime": "09:00",
        "endTime": "10:00"
      },
      {
        "startTime": "11:00",
        "endTime": "12:00"
      },
      {
        "startTime": "14:00",
        "endTime": "15:00"
      }
    ],
    "busySlots": [
      {
        "startTime": "10:00",
        "endTime": "11:00",
        "customerName": "Mehmet Demir"
      }
    ]
  },
  "message": "Müsaitlik durumu başarıyla getirildi"
}
```

---

## 🔐 Yetkilendirme

Tüm endpoint'ler için gerekli izinler:

| Endpoint | İzin | Roller |
|----------|------|--------|
| `POST /quick` | `appointments:create` | OWNER, ADMIN, EMPLOYEE |
| `GET /` | `appointments:view` | OWNER, ADMIN, EMPLOYEE |
| `GET /:id` | `appointments:view` | OWNER, ADMIN, EMPLOYEE |
| `PUT /:id` | `appointments:update` | OWNER, ADMIN, EMPLOYEE |
| `DELETE /:id` | `appointments:delete` | OWNER, ADMIN |
| `POST /:id/complete` | `appointments:update` | OWNER, ADMIN, EMPLOYEE |

---

## 📝 Notlar

1. **Tarih Formatı**: Tüm tarihler ISO 8601 formatında (`2025-10-20T14:00:00.000Z`)
2. **Timezone**: UTC kullanılıyor, frontend'de local timezone'a çevrilmeli
3. **Pagination**: Default sayfa başına 10 kayıt
4. **Soft Delete**: Silinen randevular veritabanından silinmez, status `CANCELLED` olur
5. **SMS Reminder**: `reminderSentAt` alanı SMS gönderim zamanını tutar
6. **Session Count**: Randevu tamamlandığında satıştaki `remainingSessions` otomatik azalır

---

## 🐛 Genel Hata Kodları

| HTTP Status | Açıklama |
|-------------|----------|
| `200` | Başarılı işlem |
| `201` | Kayıt oluşturuldu |
| `400` | Geçersiz istek |
| `401` | Yetkisiz erişim (Token geçersiz) |
| `403` | İzin yok |
| `404` | Kayıt bulunamadı |
| `500` | Sunucu hatası |

---

## 📞 Destek

Sorularınız için: huseyinxgedek@gmail.com

