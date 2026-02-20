# Pazarlama & Kampanya Sistemi — Frontend API Dokümantasyonu

> Son güncelleme: 18 Şubat 2026

> **Tüm endpoint'ler** `Authorization: Bearer <token>` header'ı gerektirir (PUBLIC olarak işaretlenenler hariç).

---

## İçindekiler

1. [KVKK SMS Onay Akışı](#1-kvkk-sms-onay-akışı)
2. [Onay Geri Alma](#2-onay-geri-alma)
3. [Müşteri Sadakat & Sıcaklık Analizi](#3-müşteri-sadakat--sıcaklık-analizi)
4. [Kampanya Listesi](#4-kampanya-listesi)
5. [Kullanım Senaryoları](#5-kullanım-senaryoları)
6. [Önemli Kurallar (KVKK)](#6-önemli-kurallar-kvkk)

---

## 1. KVKK SMS Onay Akışı

> ✅ **Bu, onay almanın tek geçerli yöntemidir.** Personel müşteri adına onay işaretleyemez — backend 400 döner.

### Akış Diyagramı

```
Personel → "SMS ile Onay İste" butonuna basar
         ↓
POST /api/clients/:id/consent/request
(48 saatlik tek kullanımlık token üretilir, SMS gönderilir)
         ↓
Müşterinin telefonuna SMS gelir:
  "...onay için: https://app.geras.com/consent/abc-uuid-xyz"
         ↓
Müşteri linke tıklar
  → GET /api/clients/consent/page/:token
    (frontend onay sayfasını bu response ile doldurur)
         ↓
    ┌────────────────────────────────────┐
    │  Evet, onaylıyorum                 │  → POST /api/clients/consent/approve/:token
    │  Hayır, istemiyorum                │  → POST /api/clients/consent/decline/:token
    └────────────────────────────────────┘
         ↓
Müşteriye otomatik SMS gönderilir (onay veya red konfirmasyonu)
marketingConsent güncellenir, token silinir
```

---

### 1.1 Onay SMS'i Gönder

**Kimin yapacağı:** Personel  
**Auth:** Gerekli

```
POST /api/clients/:id/consent/request
Authorization: Bearer <token>
```

**Body:** Yok

**Response (başarılı):**
```json
{
  "status": "success",
  "message": "Onay SMS'i gönderildi",
  "smsDelivered": true,
  "expiresAt": "2026-02-20T07:30:00.000Z"
}
```

**Hata Durumları:**

| HTTP | Durum | Mesaj |
|------|-------|-------|
| 400 | Telefon numarası yok | `"Müşterinin telefon numarası kayıtlı değil"` |
| 400 | Zaten onaylı | `"Müşteri zaten pazarlama onayı vermiş"` |
| 429 | SMS zaten gönderildi (token aktif) | `"Onay SMS'i zaten gönderildi. X dakika sonra tekrar gönderebilirsiniz."` |

> **UX Notu:** Token 48 saat geçerlidir. Süre dolmadan tekrar gönderilemez — spam koruması.

---

### 1.2 Onay Sayfası Bilgisi

**Kimin kullanacağı:** Frontend (onay sayfası açıldığında)  
**Auth:** PUBLIC — token yeterli, giriş gerekmez

```
GET /api/clients/consent/page/:token
```

**Response — onay bekliyor:**
```json
{
  "status": "pending",
  "firstName": "Ayşe",
  "businessName": "Güzellik Salonu XYZ",
  "expiresAt": "2026-02-20T07:30:00.000Z"
}
```

**Response — zaten onaylamış:**
```json
{
  "status": "already_consented",
  "message": "Pazarlama onayınız zaten kayıtlıdır.",
  "businessName": "Güzellik Salonu XYZ"
}
```

**Hata — token süresi dolmuş (HTTP 410):**
```json
{
  "status": "fail",
  "message": "Bu onay bağlantısının süresi dolmuştur. Lütfen salonunuzla iletişime geçin."
}
```

---

### 1.3 Müşteri Onaylar

**Kimin kullanacağı:** Müşteri (onay sayfasındaki "Evet" butonu)  
**Auth:** PUBLIC

```
POST /api/clients/consent/approve/:token
```

**Body:** Yok

**Response:**
```json
{
  "status": "success",
  "message": "Güzellik Salonu XYZ tarafından gönderilecek kampanya ve fırsatlara onay verdiniz. Teşekkürler!"
}
```

> **Otomatik SMS:** Müşterinin telefonuna teşekkür SMS'i gönderilir:  
> *"Sayın Ayşe, pazarlama mesajlarımıza izin verdiğiniz için teşekkür ederiz. Size özel kampanya ve fırsatlardan ilk siz haberdar olacaksınız. Güzellik Salonu XYZ ekibi."*

---

### 1.4 Müşteri Reddeder

**Kimin kullanacağı:** Müşteri (onay sayfasındaki "Hayır" butonu)  
**Auth:** PUBLIC

```
POST /api/clients/consent/decline/:token
```

**Body:** Yok

**Response:**
```json
{
  "status": "success",
  "message": "Pazarlama izni talebini reddettiniz. Tercihleriniz kaydedildi."
}
```

> **Otomatik SMS:** Müşterinin telefonuna ret konfirmasyonu gönderilir:  
> *"Sayın Ayşe, pazarlama mesajlarına ilişkin izin talebimizi reddettiniz. Tercihleriniz kaydedildi. İleride fikriniz değişirse bizi aramanız yeterlidir. Güzellik Salonu XYZ ekibi."*

---

### Frontend'de Onay Sayfası Nasıl Yapılır?

Route: `https://app.geras.com/consent/:token`

```
1. Sayfa açılır → GET /api/clients/consent/page/:token
   - status: "pending"   → Onay formunu göster
   - status: "already_consented" → "Zaten onayladınız" mesajı
   - HTTP 410 → "Bağlantı süresi dolmuş" mesajı

2. "Evet, izin veriyorum" butonu:
   POST /api/clients/consent/approve/:token
   → Başarılı olunca "Teşekkürler!" ekranı göster

3. "Hayır, istemiyorum" butonu:
   POST /api/clients/consent/decline/:token
   → "Tercihleriniz kaydedildi" ekranı göster
```

---

## 2. Onay Geri Alma

> ⚠️ **Kritik:** Bu endpointler **yalnızca `marketingConsent: false`** kabul eder.  
> `true` gönderilirse **HTTP 400** döner. Onay verme yetkisi yalnızca müşterinin kendisindedir.

### 2.1 Tekil Müşteri — Onayı Geri Al

```
PATCH /api/clients/:id/consent
Authorization: Bearer <token>
```

**Body:**
```json
{ "marketingConsent": false }
```

**Response:**
```json
{
  "status": "success",
  "message": "Pazarlama onayı geri alındı",
  "data": {
    "id": 12,
    "firstName": "Ayşe",
    "lastName": "Yılmaz",
    "marketingConsent": false,
    "consentDate": null
  }
}
```

**`true` gönderilirse (HTTP 400):**
```json
{
  "status": "fail",
  "message": "Pazarlama onayı personel tarafından verilemez. KVKK gereği onay yalnızca müşterinin kendi SMS linkini onaylamasıyla alınabilir. Onay talep etmek için POST /api/clients/:id/consent/request kullanın."
}
```

---

### 2.2 Toplu — Onayları Geri Al

```
PATCH /api/clients/bulk/consent
Authorization: Bearer <token>
```

**Body:**
```json
{
  "clientIds": [1, 5, 12, 45],
  "marketingConsent": false
}
```

**Response:**
```json
{
  "status": "success",
  "updatedCount": 4,
  "message": "4 müşterinin pazarlama onayı geri alındı"
}
```

**`true` gönderilirse (HTTP 400):**
```json
{
  "status": "fail",
  "message": "Toplu pazarlama onayı verilemez. KVKK gereği onay yalnızca müşterinin kendi SMS linkini onaylamasıyla alınabilir."
}
```

---

### 2.3 Müşteri Listesinde Consent Durumu

`GET /api/clients` response'unda her müşteri nesnesinde:

```json
{
  "id": 12,
  "firstName": "Ayşe",
  "lastName": "Yılmaz",
  "phone": "05551234567",
  "gender": "FEMALE",
  "marketingConsent": true,
  "consentDate": "2026-02-18T10:30:00.000Z"
}
```

> `marketingConsent: false` olan müşteriler için "SMS ile Onay İste" butonu gösterin.

---

### 2.4 Müşteri Oluştururken Onay Talebi

`POST /api/clients` body'inde `marketingConsent: true` gönderilirse **direkt onay verilmez**. Bunun yerine:

1. Müşteri `marketingConsent: false` olarak kaydedilir
2. Otomatik olarak KVKK onay SMS'i tetiklenir (48 saatlik link)
3. Müşteri linke tıklayıp onaylarsa `marketingConsent: true` olur

**Request:**
```json
{
  "firstName": "Ayşe",
  "lastName": "Yılmaz",
  "phone": "05551234567",
  "gender": "FEMALE",
  "marketingConsent": true
}
```

**Response (SMS gönderildi):**
```json
{
  "status": "success",
  "data": { "client": { "id": 12, "marketingConsent": false, "..." : "..." }, "note": null },
  "consentSms": {
    "requested": true,
    "sent": true,
    "note": "Müşteri, SMS'teki linke tıklayıp onayladığında marketingConsent aktif olacak"
  },
  "message": "Müşteri başarıyla oluşturuldu. KVKK onay SMS'i gönderildi."
}
```

**Response (telefon yok, SMS gönderilemedi):**
```json
{
  "status": "success",
  "data": { "client": { "id": 12, "marketingConsent": false }, "note": null },
  "consentSms": {
    "requested": true,
    "sent": false,
    "error": "Telefon numarası olmadığı için onay SMS'i gönderilemedi"
  },
  "message": "Müşteri başarıyla oluşturuldu. Onay SMS'i gönderilemedi: Telefon numarası olmadığı için..."
}
```

> **Not:** `marketingConsent: false` veya hiç gönderilmezse normal kayıt yapılır, SMS çıkmaz.

---

### 2.5 Müşteri Güncellerken Onay Talebi

`PUT /api/clients/:id` içinde `marketingConsent: true` gönderilirse aynı SMS akışı tetiklenir:

1. Mevcut müşteri diğer alanlarıyla güncellenir (`marketingConsent` değişmez)
2. Otomatik KVKK onay SMS'i gönderilir
3. Müşteri linke tıklayıp onaylarsa `marketingConsent: true` olur

**Request:**
```json
{
  "firstName": "Ayşe",
  "phone": "05551234567",
  "marketingConsent": true
}
```

**Response (SMS gönderildi):**
```json
{
  "status": "success",
  "data": { "id": 12, "marketingConsent": false, "firstName": "Ayşe" },
  "consentSms": {
    "requested": true,
    "sent": true,
    "note": "Müşteri, SMS'teki linke tıklayıp onayladığında marketingConsent aktif olacak"
  },
  "message": "Müşteri güncellendi. KVKK onay SMS'i gönderildi."
}
```

`marketingConsent: false` gönderilirse — onay direkt geri alınır, SMS çıkmaz.

---

## 3. Müşteri Sadakat & Sıcaklık Analizi

```
GET /api/reports/customer-loyalty
Authorization: Bearer <token>
```

### Query Parametreleri

| Parametre | Değerler | Açıklama |
|---|---|---|
| `sortBy` | `loyaltyScore`, `ltv`, `purchases`, `last_purchase`, `urgency` | Sıralama kriteri |
| `temperature` | `HOT`, `WARM`, `COLD`, `LOST` | Sıcaklık filtresi |
| `segment` | `VIP`, `LOYAL`, `REGULAR`, `OCCASIONAL`, `AT_RISK`, `LOST`, `NEW` | Segment filtresi |
| `minPurchases` | Sayı (örn: `2`) | Minimum alışveriş sayısı |

**Örnek İstekler:**
```
GET /api/reports/customer-loyalty
GET /api/reports/customer-loyalty?temperature=COLD
GET /api/reports/customer-loyalty?segment=AT_RISK&sortBy=urgency
GET /api/reports/customer-loyalty?temperature=LOST&sortBy=ltv
GET /api/reports/customer-loyalty?sortBy=urgency&minPurchases=1
```

---

### Response

```json
{
  "success": true,

  "data": [
    {
      "clientId": 12,
      "clientName": "Ayşe Yılmaz",
      "firstName": "Ayşe",
      "phone": "05551234567",
      "email": "ayse@gmail.com",
      "gender": "FEMALE",

      "marketingConsent": true,
      "consentDate": "2026-02-10",

      "temperature": {
        "key": "WARM",
        "label": "Ilık",
        "color": "#F59E0B"
      },
      "segment": {
        "key": "AT_RISK",
        "label": "Risk Altında",
        "priority": 2
      },

      "loyaltyScore": 48.5,
      "purchaseCount": 4,
      "totalSpent": 2400.00,
      "averageOrderValue": 600.00,
      "purchaseFrequencyDays": 28,

      "favoriteService": "Lazer Epilasyon",
      "lastService": "Cilt Bakımı",

      "firstPurchaseDate": "2025-06-15",
      "lastPurchaseDate": "2025-11-20",
      "daysSinceLastPurchase": 90,
      "customerAgeInDays": 248,

      "campaign": {
        "type": "WIN_BACK",
        "title": "Geri Kazanma Kampanyası",
        "message": "Sayın Ayşe Hanım, Güzellik Salonu XYZ olarak uzun süredir sizi göremedik. Memnuniyetiniz bizim için en öncelikli konudur; varsa bir eksikliğimizi duymak isteriz. Sizi yeniden ağırlamak için özel bir teklifimiz mevcut, bizi arayın.",
        "action": "CALL_OR_SMS",
        "urgency": "HIGH",
        "discountSuggestion": "%20 indirim — aciliyet hissi yarat"
      },

      "hasNoSales": false
    }
  ],

  "campaigns": [ "... (aşağıya bakın)" ],

  "summary": {
    "totalCustomers": 120,
    "filteredCount": 18,
    "customersWithSales": 95,
    "customersWithNoSales": 25,
    "totalLTV": 280000.00,
    "averageLTV": 2947.37,
    "byTemperature": {
      "HOT": 35,
      "WARM": 42,
      "COLD": 28,
      "LOST": 15
    },
    "bySegment": {
      "VIP": 8,
      "LOYAL": 22,
      "REGULAR": 35,
      "OCCASIONAL": 12,
      "AT_RISK": 18,
      "LOST": 15,
      "NEW": 10
    },
    "consentStats": {
      "total": 120,
      "consented": 45,
      "notConsented": 75
    },
    "topCustomer": "Ayşe Yılmaz"
  },

  "meta": {
    "sortedBy": "loyaltyScore",
    "filterTemperature": null,
    "filterSegment": null,
    "minPurchases": null
  }
}
```

---

## 4. Kampanya Listesi

`campaigns` array'i, `GET /api/reports/customer-loyalty` response'unun içinde hazır gelir. Ayrı bir endpoint gerekmez.

> **Kural:** `campaigns` array'inde **yalnızca `marketingConsent: true` olan müşteriler** yer alır. Onaysız müşteriler otomatik filtrelenmiştir.

### campaigns Array'i

```json
"campaigns": [
  {
    "clientId": 12,
    "clientName": "Ayşe Yılmaz",
    "firstName": "Ayşe",
    "gender": "FEMALE",
    "phone": "05551234567",
    "consentDate": "2026-02-10",

    "temperature": { "key": "COLD", "label": "Soğuk", "color": "#6B7280" },
    "segment": { "key": "AT_RISK", "label": "Risk Altında", "priority": 2 },

    "campaign": {
      "type": "WIN_BACK",
      "title": "Geri Kazanma Kampanyası",
      "message": "Sayın Ayşe Hanım, Güzellik Salonu XYZ olarak uzun süredir sizi göremedik. Memnuniyetiniz bizim için en öncelikli konudur; varsa bir eksikliğimizi duymak isteriz. Sizi yeniden ağırlamak için özel bir teklifimiz mevcut, bizi arayın.",
      "action": "CALL_OR_SMS",
      "urgency": "HIGH",
      "discountSuggestion": "%20 indirim — aciliyet hissi yarat"
    },

    "loyaltyScore": 48.5,
    "totalSpent": 2400.00,
    "daysSinceLastPurchase": 95,
    "favoriteService": "Lazer Epilasyon"
  }
]
```

### Kampanya Mesajları Hakkında

- **Cinsiyete göre selamlama:** `gender: FEMALE` → "Sayın Ayşe **Hanım**", `gender: MALE` → "Sayın Mehmet **Bey**", `UNISEX` → "Sayın Ayşe"
- **Salon adı** her mesaja otomatik eklenir (DB'den çekilir)
- **Favori hizmet** adı mesaj içinde kullanılır (varsa)
- **3 mesaj varyantı:** Aynı segment içinde bile her müşteriye müşteri ID'sine göre farklı bir varyant seçilir — seri mesaj hissi oluşmaz
- **SMS'e hazır format:** `campaign.message` doğrudan SMS olarak gönderilebilir

---

### Referans Tablolar

#### Sıcaklık Sistemi

| Renk Kodu | Key | Label | Kriter |
|---|---|---|---|
| `#EF4444` (kırmızı) | `HOT` | Sıcak | Son alışveriş ≤ 30 gün |
| `#F59E0B` (sarı) | `WARM` | Ilık | Son alışveriş 31–90 gün |
| `#6B7280` (gri) | `COLD` | Soğuk | Son alışveriş 91–180 gün |
| `#374151` (koyu) | `LOST` | Kayıp | Son alışveriş > 180 gün veya hiç alışveriş yok |

#### Segment Sistemi

| Key | Label | Kriter |
|---|---|---|
| `VIP` | VIP | Sadakat skoru ≥ 75 |
| `LOYAL` | Sadık | Sadakat skoru ≥ 50 |
| `REGULAR` | Düzenli | 2+ alışveriş, aktif |
| `OCCASIONAL` | Ara Sıra | Az alışveriş, düzensiz |
| `AT_RISK` | Risk Altında | 90+ gün görünmüyor |
| `LOST` | Kayıp | 180+ gün görünmüyor |
| `NEW` | Yeni Kayıt | Hiç alışveriş yapmamış |

#### Kampanya Tipleri (`campaign.type`)

| Type | Müşteri Profili | Öneri |
|---|---|---|
| `LOYALTY_REWARD` | VIP, aktif | Sadakat ödülü, sürpriz indirim |
| `VIP_WINBACK` | VIP, uzaklaşmış | Kişisel arama + özel teklif |
| `UPSELL` | Sadık, aktif | Premium hizmet veya paket öner |
| `RE_ENGAGEMENT` | Sadık, uzaklaşmış | Hatırlatma + hafif indirim |
| `WIN_BACK` | Risk altında | %20 indirim kampanyası |
| `AGGRESSIVE_WIN_BACK` | Kayıp | %25–30 indirim + hediye |
| `CROSS_SELL` | Düzenli, aktif | Farklı hizmet tanıtımı |
| `FREQUENCY_BOOST` | Ara sıra | Düzenli gelmeye teşvik |
| `WELCOME_OFFER` | Yeni kayıt | İlk alışveriş indirimi |

#### Aksiyon Tipleri (`campaign.action`)

| Action | Frontend'de Ne Gösterilmeli |
|---|---|
| `SEND_SMS` | "SMS Gönder" butonu |
| `CALL_OR_SMS` | "Ara" + "SMS Gönder" butonları |
| `CALL_FIRST_THEN_SMS` | "Önce Ara" vurgulu + SMS butonu |

#### Aciliyet Seviyeleri (`campaign.urgency`)

| Urgency | Renk Önerisi | Badge |
|---|---|---|
| `LOW` | Yeşil | Düşük Öncelik |
| `MEDIUM` | Sarı | Orta Öncelik |
| `HIGH` | Turuncu | Yüksek Öncelik |
| `VERY_HIGH` | Kırmızı | Acil |

---

## 5. Kullanım Senaryoları

### Senaryo 1: Müşteriden KVKK Onayı Alma

```
1. Müşteri detay sayfasında marketingConsent: false ise
   → "SMS ile Onay İste" butonu göster

2. Personel butona basar:
   POST /api/clients/:id/consent/request

3. Müşterinin telefonuna link gelir, linke tıklar

4. Frontend /consent/:token sayfası açılır:
   GET /api/clients/consent/page/:token
   → İsim ve salon adını göster

5. "Evet" → POST /api/clients/consent/approve/:token
   "Hayır" → POST /api/clients/consent/decline/:token

6. Her iki durumda müşteriye otomatik SMS gönderilir

7. Onay verirse o müşteri campaigns listesine girer
```

### Senaryo 2: Kampanya Ekranı

```
GET /api/reports/customer-loyalty?sortBy=urgency

→ response.campaigns array'ini listele (yalnızca onaylılar)

Her kart için göster:
  - İsim + telefon
  - Sıcaklık rozeti (renk: temperature.color)
  - Segment etiketi
  - campaign.message (SMS'e hazır metin)
  - Aksiyon butonları (campaign.action'a göre)
  - discountSuggestion (indirim notu)
  - Favori hizmet
```

### Senaryo 3: Soğuk Müşteri Listesi

```
GET /api/reports/customer-loyalty?temperature=COLD

→ response.data içinde COLD müşteriler gelir
→ marketingConsent: false olanlar campaigns'e GİRMEZ

Her müşteri kartında:
  - marketingConsent: false → "SMS ile Onay İste" butonu
  - marketingConsent: true  → campaigns listesinde zaten var
```

### Senaryo 4: Dashboard Consent Özeti

```json
response.summary.consentStats → {
  "total": 120,
  "consented": 45,
  "notConsented": 75
}
```

→ "Kampanyaya Onay Verenler: 45 / 120" şeklinde göster

### Senaryo 5: Onayı Geri Alma

```
Müşteri "Artık SMS istemiyorum" derse:
PATCH /api/clients/:id/consent
Body: { "marketingConsent": false }

Toplu geri alma:
PATCH /api/clients/bulk/consent
Body: { "clientIds": [1, 5, 12], "marketingConsent": false }
```

---

## 6. Önemli Kurallar (KVKK)

| Kural | Açıklama |
|---|---|
| **Onay verme** | Yalnızca müşteri verebilir (SMS → link → approve) |
| **Onay geri alma** | Personel veya müşteri yapabilir |
| **`true` ile PATCH** | Her iki endpoint de 400 döner |
| **Toplu onay verme** | Yasak, 400 döner |
| **Token süresi** | 48 saat, tek kullanımlık |
| **Spam koruması** | Aktif token varken tekrar SMS gönderilemez |
| **Otomatik SMS** | Onay ve ret işlemlerinde müşteriye konfirmasyon SMS'i gider |
| **`consentDate`** | KVKK logu için tutulur; onay geri alınca `null` yapılır |

---

## Endpoint Özeti

### Onay Akışı

| Method | URL | Auth | Açıklama |
|--------|-----|------|----------|
| `POST` | `/api/clients/:id/consent/request` | Gerekli | Müşteriye manuel onay SMS'i gönder |
| `GET` | `/api/clients/consent/page/:token` | **PUBLIC** | Onay sayfası bilgisi (token ile) |
| `POST` | `/api/clients/consent/approve/:token` | **PUBLIC** | Müşteri onaylar → `marketingConsent: true` |
| `POST` | `/api/clients/consent/decline/:token` | **PUBLIC** | Müşteri reddeder → `marketingConsent: false` |

### Onay Geri Alma (Personel)

| Method | URL | Auth | Açıklama |
|--------|-----|------|----------|
| `PATCH` | `/api/clients/:id/consent` | Gerekli | Tekil onay geri al (yalnızca `false`) |
| `PATCH` | `/api/clients/bulk/consent` | Gerekli | Toplu onay geri al (yalnızca `false`) |

### Müşteri CRUD — marketingConsent Davranışı

| Method | URL | `true` gönderilirse | `false` gönderilirse |
|--------|-----|---------------------|----------------------|
| `POST` | `/api/clients` | Müşteri `false` kaydedilir + otomatik SMS | Normal kayıt |
| `PUT` | `/api/clients/:id` | DB değişmez + otomatik SMS | Onay direkt geri alınır |
| `PATCH` | `/api/clients/:id/consent` | **400 Hata** | Onay geri alınır |
| `PATCH` | `/api/clients/bulk/consent` | **400 Hata** | Toplu onay geri alınır |

### Raporlama

| Method | URL | Auth | Açıklama |
|--------|-----|------|----------|
| `GET` | `/api/reports/customer-loyalty` | Gerekli | Sadakat analizi + kampanya listesi |
