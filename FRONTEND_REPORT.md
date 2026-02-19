# GERAS SYSTEM — Frontend Değişiklik Raporu
**Tarih:** 19 Şubat 2026  
**Versiyon:** Backend v2.1

---

## İÇİNDEKİLER
1. [Yeni: Dinamik Plan Yönetimi](#1-dinamik-plan-yönetimi)
2. [Güncellendi: Owner Abonelik Sayfası](#2-owner-abonelik-sayfası)
3. [Güncellendi: Admin Abonelik Paneli](#3-admin-abonelik-paneli)
4. [Yeni: Ödeme Yöntemi ve Taksit Sistemi](#4-ödeme-yöntemi-ve-taksit-sistemi)
5. [Güncellendi: Demo Hesap Akışı](#5-demo-hesap-akışı)
6. [Güncellendi: Login Hata Mesajları](#6-login-hata-mesajları)
7. [Tüm Endpoint Listesi](#7-tüm-endpoint-listesi)

---

## 1. Dinamik Plan Yönetimi

Abonelik planları artık kodda sabit değil, veritabanında yönetiliyor. Admin panelinden plan eklenebilir, düzenlenebilir, silinebilir.

### Public — Fiyatlandırma Sayfası

**`GET /api/plans`** — Auth gerektirmez

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "key": "DEMO",
      "name": "Demo",
      "displayName": "Demo Paketi",
      "price": 0,
      "yearlyPrice": null,
      "currency": "TRY",
      "color": "#95a5a6",
      "icon": "🎁",
      "popular": false,
      "isActive": true,
      "isDemo": true,
      "trialDays": 30,
      "sortOrder": 0,
      "features": { "appointments": true, "sms": 50, ... },
      "limits": { "maxStaff": null, "maxClients": null, ... }
    },
    {
      "id": 2,
      "key": "STARTER",
      "name": "Başlangıç",
      "displayName": "Başlangıç Paketi",
      "price": 799,
      "yearlyPrice": 7990,
      "currency": "TRY",
      "color": "#3498db",
      "icon": "🚀",
      "popular": false,
      "isDemo": false,
      "trialDays": null,
      "features": { ... },
      "limits": { "maxStaff": 2, "maxClients": 100, ... }
    },
    {
      "id": 3,
      "key": "PROFESSIONAL",
      "name": "Profesyonel",
      "displayName": "Profesyonel Paket",
      "price": 1299,
      "yearlyPrice": 12990,
      "popular": true,
      ...
    },
    {
      "id": 4,
      "key": "PREMIUM",
      "name": "Premium",
      "displayName": "Premium Paket",
      "price": 2199,
      "yearlyPrice": 21990,
      ...
    }
  ]
}
```

> **Not:** Yıllık fiyat = `yearlyPrice` alanından oku. Yoksa `price * 10` hesaplanabilir (2 ay hediye mantığı).

---

### Admin — Plan Yönetimi Endpointleri

Tümü `Authorization: Bearer <token>` + ADMIN rolü gerektirir.

| Method | URL | Açıklama |
|--------|-----|----------|
| `GET` | `/api/admin/plans` | Tüm planları listele (aktif+pasif, kaç hesap kullandığıyla) |
| `GET` | `/api/admin/plans/:id` | Tek plan detayı |
| `POST` | `/api/admin/plans` | Yeni plan oluştur |
| `PUT` | `/api/admin/plans/:id` | Planı güncelle |
| `DELETE` | `/api/admin/plans/:id` | Planı sil (kullanan hesap yoksa) |
| `PATCH` | `/api/admin/plans/:id/toggle` | Aktif/Pasif yap |

#### `GET /api/admin/plans` Response
```json
{
  "status": "success",
  "results": 4,
  "data": [
    {
      "id": 1,
      "key": "DEMO",
      "name": "Demo",
      "price": 0,
      "accountCount": 8,
      ...
    }
  ]
}
```

#### `POST /api/admin/plans` — Yeni Plan Oluştur
```json
{
  "key": "ENTERPRISE",
  "name": "Kurumsal",
  "displayName": "Kurumsal Paket",
  "price": 3999,
  "yearlyPrice": 39990,
  "currency": "TRY",
  "color": "#2c3e50",
  "icon": "🏢",
  "popular": false,
  "isActive": true,
  "sortOrder": 4,
  "features": {
    "appointments": true,
    "sms": 1000,
    "permissions": true,
    "multipleLocations": true,
    "prioritySupport": true
  },
  "limits": {
    "maxStaff": null,
    "maxClients": null,
    "maxAppointmentsPerMonth": null,
    "maxServices": null
  }
}
```

#### `PUT /api/admin/plans/:id` — Plan Güncelle
Sadece değiştirilecek alanları gönder:
```json
{
  "price": 899,
  "yearlyPrice": 8990,
  "features": { "sms": 100, ... }
}
```

#### `PATCH /api/admin/plans/:id/toggle` — Aktif/Pasif
Body gerektirmez. Mevcut durumu tersine çevirir.

---

## 2. Owner Abonelik Sayfası

**`GET /api/accounts/subscription`** — OWNER rolü gerektirir

### Yeni Response Yapısı
```json
{
  "status": "success",
  "data": {
    "currentPlan": {
      "key": "PROFESSIONAL",
      "name": "Profesyonel",
      "displayName": "Profesyonel Paket",
      "price": 1299,
      "yearlyPrice": 12990,
      "currency": "TRY",
      "duration": "Yıllık",
      "color": "#9b59b6",
      "icon": "⭐",
      "popular": true,
      "isDemo": false
    },
    "billing": {
      "billingCycle": "YEARLY",
      "billingCycleLabel": "Yıllık",
      "subscriptionStartDate": "2026-01-01T00:00:00.000Z",
      "subscriptionEndDate": "2027-01-01T00:00:00.000Z",
      "subscriptionStatus": "ACTIVE",
      "remainingDays": 316,
      "isExpired": false
    },
    "features": {
      "appointments": true,
      "sms": 200,
      "permissions": true,
      "reports": { "basic": true, "advanced": true, "export": true }
    },
    "limits": {
      "maxStaff": 5,
      "maxClients": null,
      "maxAppointmentsPerMonth": null,
      "maxServices": null
    },
    "usage": {
      "staff": { "current": 3, "limit": 5, "isUnlimited": false },
      "clients": { "current": 266, "limit": null, "isUnlimited": true },
      "services": { "current": 18, "limit": null, "isUnlimited": true },
      "appointmentsThisMonth": { "current": 86, "limit": null, "isUnlimited": true }
    },
    "demo": null,
    "suggestedUpgrade": {
      "key": "PREMIUM",
      "name": "Premium",
      "displayName": "Premium Paket",
      "price": 2199,
      "yearlyPrice": 21990,
      "icon": "💎",
      "color": "#e74c3c"
    }
  }
}
```

### Demo hesap ise `demo` objesi:
```json
"demo": {
  "isDemoAccount": true,
  "demoStatus": "ACTIVE",
  "demoExpiresAt": "2026-03-19T00:00:00.000Z",
  "trialDays": 30,
  "remainingHours": 672,
  "remainingDays": 28,
  "isExpired": false
}
```

### Önemli Değişiklikler
- `currentPlan.duration` → artık hesabın gerçek `billingCycle`'ına göre `"Yıllık"` veya `"Aylık"` döner
- `currentPlan.yearlyPrice` → yeni alan, yıllık fiyat
- `billing` objesi → tüm fatura detayları burada, önceden yoktu
- `suggestedUpgrade` → artık DB'deki bir sonraki aktif planı gösteriyor
- `demo.trialDays` → kaç günlük deneme olduğunu gösteriyor (DB'den, sabit 30 değil)

---

## 3. Admin Abonelik Paneli

**`GET /api/admin/subscriptions`** — ADMIN rolü

### Hesap Objesi (data[])
```json
{
  "id": 1,
  "businessName": "Göksum Güzellik Merkezi",
  "contactPerson": "Elif Dartar",
  "email": "ornek@gmail.com",
  "phone": "05XXXXXXXXX",
  "isActive": true,
  "businessType": "SESSION_BASED",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "billingCycle": "YEARLY",
  "subscriptionStartDate": "2026-01-01T00:00:00.000Z",
  "subscriptionEndDate": "2027-01-01T00:00:00.000Z",
  "subscriptionStatus": "ACTIVE",
  "owner": { "id": 1, "username": "elif", "email": "...", "phone": "..." },
  "counts": { "staff": 4, "clients": 266, "services": 18, "appointments": 520 },
  "subscription": {
    "key": "PREMIUM",
    "name": "Premium",
    "displayName": "Premium Paket",
    "price": 2199,
    "yearlyPrice": 21990,
    "currency": "TRY",
    "color": "#e74c3c",
    "icon": "💎",
    "isDemoAccount": false,
    "demo": null
  }
}
```

### Summary Objesi (summary)
```json
{
  "DEMO": { "count": 8, "name": "Demo", "price": 0, "icon": "🎁", "color": "#95a5a6", "isActive": true, "isDemo": true },
  "STARTER": { "count": 1, "name": "Başlangıç", "price": 799, "yearlyPrice": 7990, ... },
  "PROFESSIONAL": { "count": 0, "name": "Profesyonel", "price": 1299, ... },
  "PREMIUM": { "count": 7, "name": "Premium", "price": 2199, ... }
}
```

> **Not:** Admin yeni plan oluşturduğunda `summary`'e otomatik dahil olur. Frontend sabit plan listesi kullanmamalı, `summary`'den dinamik okumalı.

### Abonelik Ayarları Güncelle

**`PATCH /api/admin/accounts/:id/subscription`**

```json
{
  "subscriptionPlan": "PROFESSIONAL",
  "billingCycle": "YEARLY",
  "subscriptionStartDate": "2026-02-18T00:00:00.000Z",
  "subscriptionEndDate": "2027-02-18T00:00:00.000Z",
  "subscriptionStatus": "ACTIVE"
}
```

> `subscriptionPlan` artık DB'deki herhangi bir plan key'i olabilir (STARTER, PROFESSIONAL, PREMIUM veya admin'in eklediği özel planlar).

---

## 4. Ödeme Yöntemi ve Taksit Sistemi

### Ödeme Yöntemleri

| Değer | Görünen Ad |
|-------|-----------|
| `CASH` | Nakit |
| `IYZICO` | iyzico Online Ödeme |
| `BANK_TRANSFER` | IBAN / Havale |
| `OTHER` | Diğer |

### Tek Ödeme Ekle

**`POST /api/admin/accounts/:id/subscription/payments`**

```json
{
  "totalAmount": 1299,
  "billingCycle": "MONTHLY",
  "periodStart": "2026-02-18T00:00:00.000Z",
  "periodEnd": "2026-03-18T00:00:00.000Z",
  "paymentMethod": "IYZICO",
  "paidAt": "2026-02-18T00:00:00.000Z",
  "notes": "Şubat ayı ödemesi"
}
```

Response:
```json
{
  "status": "success",
  "message": "Ödeme kaydedildi — 18.03.2026 tarihine kadar aktif",
  "data": {
    "payments": [
      {
        "id": 1,
        "plan": "PROFESSIONAL",
        "totalAmount": "1299.00",
        "installmentAmount": "1299.00",
        "paymentMethod": "IYZICO",
        "installmentNumber": 1,
        "totalInstallments": 1,
        "status": "PAID",
        "paidAt": "2026-02-18T00:00:00.000Z",
        "periodEnd": "2026-03-18T00:00:00.000Z"
      }
    ],
    "summary": {
      "totalInstallments": 1,
      "paidInstallments": 1,
      "pendingInstallments": 0,
      "totalAmount": 1299,
      "remainingDays": 28
    }
  }
}
```

### Taksitli Ödeme Ekle

Örnek: Yıllık 21.000 TL, 3 taksit (ilki nakit ödendi, diğerleri bekliyor)

**`POST /api/admin/accounts/:id/subscription/payments`**

```json
{
  "totalAmount": 21000,
  "billingCycle": "YEARLY",
  "periodStart": "2026-01-01T00:00:00.000Z",
  "periodEnd": "2027-01-01T00:00:00.000Z",
  "notes": "Yıllık anlaşma, 3 taksit",
  "installments": [
    {
      "amount": 7000,
      "dueDate": "2026-01-01T00:00:00.000Z",
      "paymentMethod": "CASH",
      "status": "PAID",
      "paidAt": "2026-01-01T00:00:00.000Z"
    },
    {
      "amount": 7000,
      "dueDate": "2026-04-01T00:00:00.000Z"
    },
    {
      "amount": 7000,
      "dueDate": "2026-07-01T00:00:00.000Z"
    }
  ]
}
```

Response:
```json
{
  "status": "success",
  "message": "3 taksit kaydedildi (1 ödendi, 2 bekliyor)",
  "data": {
    "payments": [
      { "id": 1, "installmentNumber": 1, "totalInstallments": 3, "installmentAmount": "7000.00", "status": "PAID", "paidAt": "2026-01-01" },
      { "id": 2, "installmentNumber": 2, "totalInstallments": 3, "installmentAmount": "7000.00", "status": "PENDING", "dueDate": "2026-04-01" },
      { "id": 3, "installmentNumber": 3, "totalInstallments": 3, "installmentAmount": "7000.00", "status": "PENDING", "dueDate": "2026-07-01" }
    ],
    "summary": {
      "totalInstallments": 3,
      "paidInstallments": 1,
      "pendingInstallments": 2,
      "totalAmount": 21000,
      "remainingDays": 316
    }
  }
}
```

### Bekleyen Taksiti Öde

**`PATCH /api/admin/accounts/:id/subscription/payments/:paymentId/pay`**

```json
{
  "paymentMethod": "BANK_TRANSFER",
  "paidAt": "2026-04-01T00:00:00.000Z"
}
```

Response:
```json
{
  "status": "success",
  "message": "2. taksit ödendi",
  "data": { "id": 2, "status": "PAID", "paymentMethod": "BANK_TRANSFER", "paidAt": "2026-04-01" }
}
```

### Ödeme Geçmişi

**`GET /api/admin/accounts/:id/subscription/history`**

```json
{
  "data": {
    "account": { "id": 1, "businessName": "...", "remainingDays": 316, "isExpired": false },
    "payments": [
      { "id": 1, "installmentNumber": 1, "totalInstallments": 3, "installmentAmount": "7000.00", "totalAmount": "21000.00", "paymentMethod": "CASH", "status": "PAID" },
      { "id": 2, "installmentNumber": 2, "totalInstallments": 3, "installmentAmount": "7000.00", "status": "PENDING", "dueDate": "2026-04-01" }
    ],
    "summary": {
      "totalPayments": 3,
      "paidCount": 1,
      "pendingCount": 2,
      "overdueCount": 0,
      "totalPaid": 7000,
      "totalPending": 14000,
      "currency": "TRY"
    }
  }
}
```

---

## 4b. Plan Özellikleri — Fiyatlandırma Sayfası İçin

### Features Array Yapısı (Değişti!)

`GET /api/plans` ve `GET /api/admin/plans`'tan gelen plan objelerinde `features` artık **array** formatında:

```json
"features": [
  { "label": "5 personel kullanıcısı", "enabled": true },
  { "label": "Sınırsız müşteri", "enabled": true },
  { "label": "Gelir-Gider takibi", "enabled": true },
  { "label": "Gelişmiş raporlar", "enabled": false }
]
```

**Fiyatlandırma sayfasında** her özelliği listele:
- `enabled: true` → yeşil tik ✅
- `enabled: false` → gri çarpı ❌ (veya gösterme)

### Limits Yapısı (Backend Limitleri)

```json
"limits": {
  "maxStaff": 5,
  "maxClients": null,
  "maxAppointmentsPerMonth": null,
  "maxServices": null,
  "smsCredits": 200
}
```

- `null` → Sınırsız
- Sayı → O kadar limit var

### Admin Panel — Yeni Plan Oluştururken

**`POST /api/admin/plans`**

```json
{
  "key": "ENTERPRISE",
  "name": "Kurumsal",
  "displayName": "Kurumsal Paket",
  "price": 2499,
  "yearlyPrice": 24990,
  "color": "#2c3e50",
  "icon": "🏢",
  "popular": false,
  "sortOrder": 4,
  "features": [
    { "label": "Sınırsız işletme/şube", "enabled": true },
    { "label": "Sınırsız personel", "enabled": true },
    { "label": "Multi-tenant sistem", "enabled": true },
    { "label": "Özel API erişimi", "enabled": true },
    { "label": "Öncelikli 7/24 destek", "enabled": true },
    { "label": "30 gün ücretsiz deneme", "enabled": true }
  ],
  "limits": {
    "maxStaff": null,
    "maxClients": null,
    "maxAppointmentsPerMonth": null,
    "maxServices": null,
    "smsCredits": 1000
  }
}
```

> **Önemli:** Admin yeni özellik eklediğinde `features` array'ine yeni `{label, enabled}` objesi ekler. Eklenen özellikler anında web sitesinin fiyatlandırma sayfasında görünür.

---

## 5. Demo Hesap Akışı

### Durum Değişikliği (ÖNEMLİ)

| Eski | Yeni |
|------|------|
| Süre dolunca `demoStatus: "PENDING_APPROVAL"` | Süre dolunca `demoStatus: "EXPIRED"` |

Frontend'de `demoStatus` kontrolü yapılan her yerde `"PENDING_APPROVAL"` yerine `"EXPIRED"` kullan.

### Demo Hesap Onaylama

**`POST /api/admin/demo-accounts/:id/approve`**

```json
{
  "subscriptionPlan": "PROFESSIONAL",
  "billingCycle": "YEARLY",
  "subscriptionStartDate": "2026-02-18T00:00:00.000Z",
  "subscriptionEndDate": "2027-02-18T00:00:00.000Z"
}
```

- `subscriptionPlan` → **zorunlu**
- `billingCycle`, `subscriptionStartDate`, `subscriptionEndDate` → opsiyonel
- **Demo gün sayısı artık istenmez** — demodan plana geçince demo tamamen kapanır

Response:
```json
{
  "status": "success",
  "message": "Hesap aktifleştirildi — PROFESSIONAL paketine geçildi",
  "data": {
    "id": 1,
    "businessName": "...",
    "subscriptionPlan": "PROFESSIONAL",
    "billingCycle": "YEARLY",
    "subscriptionStartDate": "2026-02-18T00:00:00.000Z",
    "subscriptionEndDate": "2027-02-18T00:00:00.000Z",
    "subscriptionStatus": "ACTIVE",
    "isDemoAccount": false,
    "demoStatus": "APPROVED",
    "isActive": true
  }
}
```

### Demo Süresini Uzat (Demo kalacak, hesap askıya alınmayacak)

**`PATCH /api/admin/accounts/:id/demo-expiry`**

```json
{ "durationDays": 15 }
```
veya
```json
{ "expiresAt": "2026-04-01T00:00:00.000Z" }
```

### Demo Hesabı Reddet / Askıya Al

**`POST /api/admin/demo-accounts/:id/reject`** — Body gerekmez

---

## 5. Login Hata Mesajları

Hesap erişim engeli durumunda HTTP `403` + `errorCode: "ACCOUNT_RESTRICTED"`:

| Durum | Mesaj |
|-------|-------|
| Demo süresi doldu | `"30 günlük demo süreniz dolmuştur. Devam etmek için lütfen yetkili kişi ile iletişime geçin."` |
| Demo kısıtlandı | `"İşletmeniz kısıtlanmıştır. Lütfen yetkili kişi ile iletişime geçin."` |
| Ücretli abonelik süresi doldu | `"Abonelik süreniz sona ermiştir. Lütfen yetkili kişi ile iletişime geçin."` |

---

## 6. Tüm Endpoint Listesi

### Public (Auth gerektirmez)
| Method | URL | Açıklama |
|--------|-----|----------|
| `GET` | `/api/plans` | Aktif planları listele |

### Owner (OWNER rolü)
| Method | URL | Açıklama |
|--------|-----|----------|
| `GET` | `/api/accounts/subscription` | Abonelik ve kullanım detayı |
| `PATCH` | `/api/accounts/onboarding/complete` | Onboarding tamamla |

### Admin (ADMIN rolü)
| Method | URL | Açıklama |
|--------|-----|----------|
| `GET` | `/api/admin/plans` | Tüm planları yönet |
| `POST` | `/api/admin/plans` | Yeni plan oluştur |
| `PUT` | `/api/admin/plans/:id` | Planı güncelle |
| `DELETE` | `/api/admin/plans/:id` | Planı sil |
| `PATCH` | `/api/admin/plans/:id/toggle` | Aktif/Pasif yap |
| `GET` | `/api/admin/subscriptions` | Tüm hesaplar + plan detayları |
| `PATCH` | `/api/admin/accounts/:id/subscription` | Hesabın abonelik ayarlarını güncelle |
| `GET` | `/api/admin/accounts/:id/subscription/history` | Abonelik geçmişi |
| `POST` | `/api/admin/accounts/:id/subscription/payments` | Manuel ödeme / taksit ekle |
| `PATCH` | `/api/admin/accounts/:id/subscription/payments/:paymentId/pay` | Bekleyen taksiti öde |
| `PATCH` | `/api/admin/accounts/:id/demo-expiry` | Demo süresini uzat |
| `GET` | `/api/admin/demo-accounts` | Tüm demo hesaplar |
| `GET` | `/api/admin/demo-accounts/pending` | Süresi dolmuş demolar |
| `POST` | `/api/admin/demo-accounts/:id/approve` | Demo hesabı onayla + plan ata |
| `POST` | `/api/admin/demo-accounts/:id/reject` | Demo hesabı askıya al |

---

## Sunucu Güncelleme Adımları (Backend Ekibi İçin)

```bash
# 1. Migration uygula
npx prisma migrate deploy

# 2. Prisma client yenile
npx prisma generate

# 3. Sunucuyu yeniden başlat
pm2 restart all
```
