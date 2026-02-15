# 🎯 DEMO HESAP SİSTEMİ - API DOKÜMANTASYONU

## 📋 Genel Bakış

GERAS System'de demo hesap sistemi, potansiyel müşterilerin 2 gün boyunca sistemi ücretsiz test etmesine olanak tanır. 2 günün sonunda hesap admin onayına düşer ve admin uygun paketi (Başlangıç/Standart/Premium) seçerek hesabı aktive eder.

---

## 🔄 DEMO HESAP İŞ AKIŞI

```
1. Tanıtım Sitesi → Demo Hesap Oluştur (2 günlük)
                     ↓
2. İşletme Sahibi → 2 gün sistemi test eder
                     ↓
3. 2 Gün Sonra → Hesap otomatik olarak "PENDING_APPROVAL" durumuna geçer
                     ↓
4. Admin Paneli → Admin hesabı inceler
                     ↓
5. Admin Karar → ✅ Onayla (Paket seç) | ❌ Reddet
                     ↓
6. Onaylanırsa → Hesap ücretli pakete geçer
   Reddedilirse → Hesap kısıtlanır
```

---

## 🎬 DEMO DURUMU (DemoStatus)

| Durum | Açıklama | isActive |
|-------|----------|----------|
| `ACTIVE` | Demo aktif, 2 gün içinde | ✅ true |
| `PENDING_APPROVAL` | 2 gün doldu, admin onayı bekliyor | ❌ false |
| `APPROVED` | Admin onayladı, ücretli pakete geçti | ✅ true |
| `EXPIRED` | Demo süresi doldu, onaylanmadı | ❌ false |
| `RESTRICTED` | Admin tarafından reddedildi | ❌ false |

---

## 📡 API ENDPOINTS

### 1️⃣ Demo Hesap Oluşturma (Public)

**Endpoint:** `POST /api/auth/create-demo`

**Açıklama:** Tanıtım sitesinden demo hesap oluşturur. 2 günlük test süresi verir.

**Authentication:** ❌ Gerekli değil (Public)

**Request Body:**
```json
{
  "businessName": "Güzellik Salonu A.Ş.",
  "contactPerson": "Ahmet Yılmaz",
  "email": "info@guzelliksalonu.com",
  "phone": "+90 532 123 45 67",
  "businessType": "SESSION_BASED",
  "ownerUsername": "ahmetyilmaz",
  "ownerEmail": "ahmet@example.com",
  "ownerPassword": "Sifre123!",
  "ownerPhone": "+90 532 999 88 77"
}
```

**Response (201 Created):**
```json
{
  "status": "success",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "data": {
    "user": {
      "id": 45,
      "username": "ahmetyilmaz",
      "email": "ahmet@example.com",
      "phone": "+90 532 999 88 77",
      "role": "OWNER",
      "accountId": 12
    }
  }
}
```

**İşleyiş:**
- İşletme hesabı oluşturulur (`isDemoAccount: true`)
- Demo süre sonu tarihi ayarlanır (`demoExpiresAt: şimdi + 2 gün`)
- Demo durumu `ACTIVE` olarak işaretlenir
- Owner kullanıcı oluşturulur
- JWT token döner, kullanıcı otomatik login olur

---

### 2️⃣ Onay Bekleyen Demo Hesapları Listele (Admin)

**Endpoint:** `GET /api/admin/demo-accounts/pending`

**Açıklama:** Admin onayı bekleyen demo hesapları listeler.

**Authentication:** ✅ Gerekli (ADMIN)

**Request:**
```http
GET /api/admin/demo-accounts/pending
Authorization: Bearer <admin-token>
```

**Response (200 OK):**
```json
{
  "status": "success",
  "results": 3,
  "data": [
    {
      "id": 12,
      "businessName": "Güzellik Salonu A.Ş.",
      "email": "info@guzelliksalonu.com",
      "phone": "+90 532 123 45 67",
      "businessType": "SESSION_BASED",
      "subscriptionPlan": "DEMO",
      "isDemoAccount": true,
      "demoExpiresAt": "2026-02-15T10:30:00.000Z",
      "demoStatus": "PENDING_APPROVAL",
      "isActive": false,
      "createdAt": "2026-02-13T10:30:00.000Z",
      "users": [
        {
          "id": 45,
          "username": "ahmetyilmaz",
          "email": "ahmet@example.com",
          "phone": "+90 532 999 88 77",
          "createdAt": "2026-02-13T10:30:00.000Z"
        }
      ],
      "_count": {
        "users": 1,
        "staff": 2,
        "clients": 15,
        "services": 8,
        "appointments": 23,
        "sales": 12
      }
    }
  ]
}
```

---

### 3️⃣ Tüm Demo Hesapları Listele (Admin)

**Endpoint:** `GET /api/admin/demo-accounts`

**Açıklama:** Tüm demo hesapları listeler (filtre ile).

**Authentication:** ✅ Gerekli (ADMIN)

**Query Parameters:**
- `demoStatus` (optional): `ACTIVE`, `PENDING_APPROVAL`, `APPROVED`, `EXPIRED`, `RESTRICTED`

**Request:**
```http
GET /api/admin/demo-accounts?demoStatus=PENDING_APPROVAL
Authorization: Bearer <admin-token>
```

**Response:** (Yukarıdaki ile aynı format)

---

### 4️⃣ Demo Hesap Onaylama (Admin)

**Endpoint:** `POST /api/admin/demo-accounts/:id/approve`

**Açıklama:** Demo hesabı onaylar ve paket atar.

**Authentication:** ✅ Gerekli (ADMIN)

**Request Body:**
```json
{
  "subscriptionPlan": "PROFESSIONAL"
}
```

**Paket Seçenekleri:**
- `STARTER` - Başlangıç paketi (499 TL/ay)
- `PROFESSIONAL` - Profesyonel paketi (899 TL/ay)
- `ENTERPRISE` - Kurumsal paketi (1.499 TL/ay)

**Request:**
```http
POST /api/admin/demo-accounts/12/approve
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "subscriptionPlan": "PROFESSIONAL"
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "id": 12,
    "businessName": "Güzellik Salonu A.Ş.",
    "subscriptionPlan": "PROFESSIONAL",
    "demoStatus": "APPROVED",
    "isActive": true,
    "demoExpiresAt": null
  },
  "message": "Demo hesap onaylandı ve PROFESSIONAL paketine yükseltildi"
}
```

**İşleyiş:**
- `demoStatus` → `APPROVED` olur
- `subscriptionPlan` → Seçilen paket atanır
- `isActive` → `true` olur
- `demoExpiresAt` → `null` olur (artık süre sınırı yok)
- Hesap normal işletme olarak devam eder

---

### 5️⃣ Demo Hesap Reddetme (Admin)

**Endpoint:** `POST /api/admin/demo-accounts/:id/reject`

**Açıklama:** Demo hesabı reddeder ve kısıtlar.

**Authentication:** ✅ Gerekli (ADMIN)

**Request Body (Optional):**
```json
{
  "reason": "Şüpheli aktivite tespit edildi"
}
```

**Request:**
```http
POST /api/admin/demo-accounts/12/reject
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "reason": "Test hesabı olduğu tespit edildi"
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "id": 12,
    "businessName": "Güzellik Salonu A.Ş.",
    "demoStatus": "RESTRICTED",
    "isActive": false
  },
  "message": "Demo hesap reddedildi ve kısıtlandı"
}
```

**İşleyiş:**
- `demoStatus` → `RESTRICTED` olur
- `isActive` → `false` olur
- Kullanıcı login olamaz

---

## 🤖 OTOMATIK SÜRE KONTROLÜ (Cron Job)

### Nasıl Çalışır?

Sistem, **her 6 saatte bir** otomatik olarak:

1. Süresi dolmuş aktif demo hesapları bulur (`demoStatus: ACTIVE` ve `demoExpiresAt <= şimdi`)
2. Bu hesapları `PENDING_APPROVAL` durumuna alır
3. Hesapları geçici olarak kısıtlar (`isActive: false`)
4. Admin panelinde bildirim gösterir

**Cron Schedule:** `0 */6 * * *` (00:00, 06:00, 12:00, 18:00)

**Kod:**
```javascript
// src/utils/demoCronJob.js
cron.schedule('0 */6 * * *', async () => {
  await checkExpiredDemoAccounts();
});
```

**Log Örneği:**
```
⏰ Cron Job çalışıyor: Demo hesap süre kontrolü
🔍 Demo hesap süre kontrolü başlatılıyor...
⚠️ 3 demo hesabın süresi doldu!
  📌 Demo Hesap: Güzellik Salonu A.Ş. (info@salon.com) - ONAY BEKLİYOR
  📌 Demo Hesap: Kuaför XYZ (info@kuafor.com) - ONAY BEKLİYOR
✅ 3 demo hesap 'PENDING_APPROVAL' durumuna alındı
```

---

## 🔐 LOGIN KONTROLLERI

Demo hesaplar için login sırasında özel kontroller yapılır:

### 1. Demo Süresi Dolmuş (PENDING_APPROVAL)
```json
{
  "status": "error",
  "error": {
    "code": "ACCOUNT_RESTRICTED",
    "message": "Demo süreniz dolmuştur. Hesabınız admin onayı bekliyor. Lütfen bekleyiniz."
  }
}
```

### 2. Demo Reddedilmiş (RESTRICTED/EXPIRED)
```json
{
  "status": "error",
  "error": {
    "code": "ACCOUNT_RESTRICTED",
    "message": "Demo süreniz sona ermiştir. Devam etmek için lütfen yetkili kişi ile iletişime geçin."
  }
}
```

### 3. Aktif Demo Ama Süre Dolmuş
Login sırasında kontrol edilir ve otomatik olarak `PENDING_APPROVAL` durumuna alınır.

---

## 🗃️ DATABASE SCHEMA

### Accounts Tablosu - Yeni Alanlar

```prisma
model Accounts {
  // ... mevcut alanlar
  
  isDemoAccount    Boolean    @default(false) @map("IsDemoAccount")
  demoExpiresAt    DateTime?  @map("DemoExpiresAt")
  demoStatus       DemoStatus @default(ACTIVE) @map("DemoStatus")
  
  @@index([isDemoAccount, demoStatus], map: "idx_accounts_demo")
}

enum DemoStatus {
  ACTIVE           // Demo aktif (ilk 2 gün)
  PENDING_APPROVAL // 2 gün doldu, admin onayı bekliyor
  APPROVED         // Admin onayladı, ücretli pakete geçti
  EXPIRED          // Demo süresi doldu ve devam etmedi
  RESTRICTED       // Hesap kısıtlandı
}
```

---

## 📊 ÖRNEK KULLANIM SENARYOSU

### Senaryo: Yeni Bir İşletme Demo Hesap Oluşturuyor

1. **Tanıtım sitesinden form doldurulur**
   ```bash
   POST /api/auth/create-demo
   # İşletme adı: "Güzellik Merkezi"
   # Email: info@guzellik.com
   # Owner: Ayşe Demir
   ```

2. **Hesap oluşturulur**
   - `isDemoAccount: true`
   - `demoExpiresAt: 2026-02-17 10:00:00` (2 gün sonra)
   - `demoStatus: ACTIVE`
   - `subscriptionPlan: DEMO`

3. **İşletme sahibi 2 gün sistemi test eder**
   - Müşteri ekler
   - Randevu oluşturur
   - Satış yapar
   - Raporları inceler

4. **2 gün sonra (2026-02-17 12:00 - cron çalışır)**
   ```
   ⏰ Cron Job çalışıyor: Demo hesap süre kontrolü
   ⚠️ Güzellik Merkezi demo süresi doldu!
   ✅ Hesap 'PENDING_APPROVAL' durumuna alındı
   ```

5. **İşletme sahibi login olmaya çalışır**
   ```
   ❌ "Demo süreniz dolmuştur. Hesabınız admin onayı bekliyor."
   ```

6. **Admin panelinde görünür**
   ```
   📋 Onay Bekleyen Demo Hesaplar: 1
   - Güzellik Merkezi (15 müşteri, 23 randevu, 12 satış)
   ```

7. **Admin karar verir**
   
   **A) Onaylarsa:**
   ```bash
   POST /api/admin/demo-accounts/12/approve
   { "subscriptionPlan": "PROFESSIONAL" }
   ```
   ✅ Hesap aktif olur, PROFESSIONAL paketine geçer
   
   **B) Reddederse:**
   ```bash
   POST /api/admin/demo-accounts/12/reject
   { "reason": "Uygun görülmedi" }
   ```
   ❌ Hesap kısıtlanır, login olunamaz

---

## ⚙️ KURULUM TALİMATLARI

### 1. Database Migration
```bash
npx prisma db push
```

### 2. Server Başlatma
Cron job otomatik başlar:
```bash
npm start

# Log çıktısı:
✅ Demo hesap cron job başlatıldı (Her 6 saatte bir çalışacak)
🚀 İlk demo hesap kontrolü yapılıyor...
```

### 3. Manuel Test (Geliştirme)
```javascript
// Cron'u daha sık çalıştırmak için (test amaçlı)
// src/utils/demoCronJob.js - 84. satır:

// Her 5 dakikada bir:
cron.schedule('*/5 * * * *', async () => {
  await checkExpiredDemoAccounts();
});
```

---

## 🎯 ÖNEMLİ NOTLAR

1. **Demo Süre:** 2 gün (48 saat)
2. **Cron Çalışma:** Her 6 saatte bir
3. **Admin Rolü:** Sadece ADMIN rolü demo yönetimi yapabilir
4. **Otomatik Kısıtlama:** Demo süresi dolan hesaplar otomatik kısıtlanır
5. **Geri Yükleme:** Admin onayladıktan sonra hesap tekrar aktif olur
6. **Veri Korunur:** Demo hesap reddedilse bile veriler silinmez (soft delete)

---

## 📞 DESTEK

Sorularınız için: info@gerasyonetim.com
