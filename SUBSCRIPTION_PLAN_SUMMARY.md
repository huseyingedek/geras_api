# 🎯 SUBSCRIPTION PLAN SİSTEMİ - ÖZET DOKÜMANTASYON

## ✅ YAPILAN DEĞİŞİKLİKLER

### 1. Database (Prisma Schema)
- ✅ `SubscriptionPlan` enum eklendi (DEMO, STARTER, PROFESSIONAL, PREMIUM)
- ✅ `Accounts.subscriptionPlan` varsayılan değer: `PROFESSIONAL`
- ✅ Mevcut veriler korundu (String tipinde kaldı)

### 2. Backend Controller'lar
- ✅ `adminController.js` - Paket validasyonu eklendi
  - `createAccount`: Varsayılan PROFESSIONAL, paket seçilebilir
  - `updateAccount`: Paket değiştirilebilir
  - `approveDemoAccount`: Demo onayında paket seçimi zorunlu
- ✅ `authController.js` - Demo hesap oluşturma (DEMO paketi)

### 3. Validasyonlar
```javascript
// Geçerli paketler
['STARTER', 'PROFESSIONAL', 'PREMIUM', 'DEMO']

// Varsayılan paket
subscriptionPlan: subscriptionPlan || 'PROFESSIONAL'
```

---

## 📦 PAKET PLANLARI

| Paket | Fiyat | Personel | Müşteri | SMS | Özel Özellikler |
|-------|-------|----------|---------|-----|-----------------|
| **DEMO** | Ücretsiz (2 gün) | 2 | 100 | 50 | - |
| **STARTER** | 499 TL/ay | 2 | 100 | 50 | Temel özellikler |
| **PROFESSIONAL** ⭐ | 899 TL/ay | 5 | Sınırsız | 200 | Yetkilendirme, Gelir-Gider, Referans Takibi |
| **PREMIUM** | 1.499 TL/ay | Sınırsız | Sınırsız | 500 | Çoklu Şube, API, Özel Destek |

---

## 🔄 MİGRATION PLANI (Canlı DB için)

### ADIM 1: Yedek Al ⚠️
```bash
pg_dump -h host -U user -d db -t Accounts > backup.sql
```

### ADIM 2: Mevcut Verileri Güncelle
```sql
-- Transaction başlat
BEGIN;

-- Demo olmayan tüm hesapları PROFESSIONAL yap
UPDATE "Accounts"
SET "SubscriptionPlan" = 'PROFESSIONAL'
WHERE "IsDemoAccount" = false OR "IsDemoAccount" IS NULL;

-- Demo hesapları DEMO yap
UPDATE "Accounts"
SET "SubscriptionPlan" = 'DEMO'
WHERE "IsDemoAccount" = true;

-- Kontrol et
SELECT "SubscriptionPlan", COUNT(*) FROM "Accounts" GROUP BY "SubscriptionPlan";

-- Sorun yoksa commit
COMMIT;
```

### ADIM 3: Prisma Generate
```bash
npx prisma generate
```

### ADIM 4: Server Restart
```bash
npm start
```

**Detaylı migration dokümantasyonu:** `SAFE_SUBSCRIPTION_PLAN_MIGRATION.md`

---

## 🎨 FRONTEND KULLANIMI

### Paket Kontrolü

```javascript
import { hasFeature, checkLimit, SUBSCRIPTION_PLANS } from './subscriptionPlans';

// Kullanıcı bilgisi
const { account } = await getMe();
const plan = account.subscriptionPlan; // "PROFESSIONAL"

// 1. Özellik kontrolü
if (hasFeature(plan, 'permissions')) {
  // Personel yetkilendirme özelliğini göster
  showStaffPermissions();
}

if (hasFeature(plan, 'reports.advanced')) {
  // Gelişmiş raporları göster
  showAdvancedReports();
}

// 2. Limit kontrolü
const currentStaff = 3;
if (!checkLimit(plan, 'maxStaff', currentStaff)) {
  alert('Personel limitiniz doldu! Paketi yükseltin.');
}

// 3. Paket bilgilerini göster
const planInfo = SUBSCRIPTION_PLANS[plan];
console.log('Paket:', planInfo.displayName); // "⭐ Profesyonel Paket"
console.log('Fiyat:', planInfo.price, 'TL/ay'); // 899 TL/ay
console.log('Dahil SMS:', planInfo.features.sms); // 200
```

### Özellik Bazlı UI Render

```javascript
// React örneği
function Dashboard() {
  const { account } = useAuth();
  const plan = account.subscriptionPlan;

  return (
    <div>
      <h1>Dashboard</h1>
      
      {/* Temel özellikler - herkeste var */}
      <AppointmentList />
      <ClientList />
      
      {/* Gelir-Gider - sadece PROFESSIONAL ve PREMIUM */}
      {hasFeature(plan, 'expenseManagement') && (
        <FinancialReports />
      )}
      
      {/* Personel Yetkilendirme - sadece PROFESSIONAL ve PREMIUM */}
      {hasFeature(plan, 'permissions') && (
        <StaffPermissions />
      )}
      
      {/* Çoklu Şube - sadece PREMIUM */}
      {hasFeature(plan, 'multipleLocations') && (
        <MultiLocationManagement />
      )}
    </div>
  );
}
```

### Paket Yükseltme Önerisi

```javascript
import { suggestUpgrade, SUBSCRIPTION_PLANS } from './subscriptionPlans';

function UpgradePrompt({ currentPlan, feature }) {
  const suggestedPlan = suggestUpgrade(currentPlan);
  
  if (!suggestedPlan) return null;
  
  const nextPlan = SUBSCRIPTION_PLANS[suggestedPlan];
  
  return (
    <div className="upgrade-prompt">
      <h3>🚀 Bu özellik {nextPlan.displayName} paketinde!</h3>
      <p>Sadece {nextPlan.price} TL/ay ile yükseltin.</p>
      <button>Paketi Yükselt</button>
    </div>
  );
}
```

---

## 📡 API ENDPOINT'LERİ

### 1. Demo Hesap Oluştur (Public)
```http
POST /api/auth/create-demo
```
- subscriptionPlan otomatik: `DEMO`

### 2. Normal Hesap Oluştur (Admin)
```http
POST /api/admin/accounts
{
  "subscriptionPlan": "PROFESSIONAL" // STARTER, PROFESSIONAL, PREMIUM
}
```

### 3. Hesap Güncelle (Admin)
```http
PUT /api/admin/accounts/:id
{
  "subscriptionPlan": "PREMIUM" // Paket değiştir
}
```

### 4. Demo Onayla (Admin)
```http
POST /api/admin/demo-accounts/:id/approve
{
  "subscriptionPlan": "PROFESSIONAL" // Zorunlu
}
```

---

## 🎯 ÖZEL DURUMLAR

### Demo Hesap İşleyişi

1. **Demo Oluşturma:**
   - subscriptionPlan: `DEMO`
   - isDemoAccount: `true`
   - demoExpiresAt: `şimdi + 2 gün`
   - demoStatus: `ACTIVE`

2. **2 Gün Sonra (Cron):**
   - demoStatus: `PENDING_APPROVAL`
   - isActive: `false`

3. **Admin Onayı:**
   - subscriptionPlan: `STARTER` / `PROFESSIONAL` / `PREMIUM` (admin seçer)
   - demoStatus: `APPROVED`
   - isActive: `true`
   - isDemoAccount: `true` kalır (takip için)
   - demoExpiresAt: `null`

### Paket Değiştirme (Upgrade/Downgrade)

```javascript
// Admin panelinde
async function changePlan(accountId, newPlan) {
  const response = await fetch(`/api/admin/accounts/${accountId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      subscriptionPlan: newPlan // "PREMIUM"
    })
  });

  if (response.ok) {
    alert('Paket başarıyla güncellendi!');
  }
}
```

---

## 🔐 GÜVENLİK

### Paket Kontrolü Middleware (Önerilen)

```javascript
// middleware/subscriptionMiddleware.js
export const requirePlan = (requiredPlan) => {
  return async (req, res, next) => {
    const { accountId } = req.user;
    
    const account = await prisma.accounts.findUnique({
      where: { id: accountId }
    });

    const planHierarchy = {
      DEMO: 0,
      STARTER: 1,
      PROFESSIONAL: 2,
      PREMIUM: 3
    };

    const userPlanLevel = planHierarchy[account.subscriptionPlan] || 0;
    const requiredLevel = planHierarchy[requiredPlan] || 0;

    if (userPlanLevel < requiredLevel) {
      return res.status(403).json({
        status: 'error',
        message: `Bu özellik ${requiredPlan} veya üzeri paket gerektirir`,
        upgrade: true
      });
    }

    next();
  };
};

// Kullanım
router.post('/expense', isAuthenticated, requirePlan('PROFESSIONAL'), createExpense);
router.post('/branch', isAuthenticated, requirePlan('PREMIUM'), createBranch);
```

---

## 📊 RAPORLAMA

### Paket Bazlı İstatistikler (Admin Dashboard)

```sql
-- Paket dağılımı
SELECT 
  "SubscriptionPlan" as plan,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM "Accounts"
WHERE "IsActive" = true
GROUP BY "SubscriptionPlan";

-- Aylık gelir tahmini
SELECT 
  SUM(CASE 
    WHEN "SubscriptionPlan" = 'STARTER' THEN 499
    WHEN "SubscriptionPlan" = 'PROFESSIONAL' THEN 899
    WHEN "SubscriptionPlan" = 'PREMIUM' THEN 1499
    ELSE 0
  END) as monthly_revenue
FROM "Accounts"
WHERE "IsActive" = true AND "IsDemoAccount" = false;
```

---

## ✅ TEST CHECKLIST

Backend:
- [ ] Demo hesap oluşturma (DEMO paketi)
- [ ] Normal hesap oluşturma (varsayılan PROFESSIONAL)
- [ ] Admin hesap oluşturma (paket seçimi)
- [ ] Hesap güncelleme (paket değiştirme)
- [ ] Demo onaylama (paket seçimi)
- [ ] Geçersiz paket hatası

Database:
- [ ] Mevcut veriler güncellendi
- [ ] Tüm hesaplarda subscriptionPlan var
- [ ] Demo hesaplar DEMO paketinde

Frontend:
- [ ] Paket kontrolü çalışıyor
- [ ] Limit kontrolü çalışıyor
- [ ] Özellikler pakete göre gösteriliyor
- [ ] Yükseltme önerileri görünüyor

---

## 📞 DESTEK

- **Dokümantasyon:** Bu klasördeki `.md` dosyaları
- **Paket Özellikleri:** `subscriptionPlans.js`
- **Migration:** `SAFE_SUBSCRIPTION_PLAN_MIGRATION.md`
- **Demo Sistem:** `DEMO_ACCOUNT_API_DOCUMENTATION.md`

---

**Son Güncelleme:** 15 Şubat 2026  
**Durum:** ✅ Canlı Production Hazır  
**Versiyon:** 2.0
