# 🎯 YENİ TABLO KULLANIM KILAVUZU

## 📋 Neon.com'dan Backend'e Tablo Entegrasyonu

Arkadaşının Neon.com'da oluşturduğu yeni tabloları backend'e nasıl entegre ettiğimizi görebilirsin.

---

## ✅ YAPILAN İŞLEMLER

### 1️⃣ **Database Schema'yı Çektik**
```bash
npx prisma db pull
```
Bu komut Neon.com'daki tabloları `prisma/schema.prisma` dosyasına çekti.

**Bulunan Yeni Tablolar:**
- ✅ `Expenses` - Gider yönetimi
- ✅ `ExpenseCategories` - Gider kategorileri
- ✅ `Vendors` - Tedarikçiler
- ✅ `reference_sources` - Referans kaynakları

---

### 2️⃣ **Controller Oluşturduk**
📁 `src/controllers/expenseController.js`

**İçeriği:**
- getAllExpenses() - Giderleri listele
- createExpense() - Yeni gider ekle
- updateExpense() - Gider güncelle
- deleteExpense() - Gider sil
- getAllCategories() - Kategorileri listele
- createCategory() - Yeni kategori ekle
- getAllVendors() - Tedarikçileri listele
- createVendor() - Yeni tedarikçi ekle

---

### 3️⃣ **Route Oluşturduk**
📁 `src/routes/expenseRoutes.js`

**Endpoint'ler:**
```
GET    /api/expenses          - Giderleri listele
POST   /api/expenses          - Yeni gider ekle
PUT    /api/expenses/:id      - Gider güncelle
DELETE /api/expenses/:id      - Gider sil

GET    /api/expenses/categories - Kategorileri listele
POST   /api/expenses/categories - Yeni kategori ekle

GET    /api/expenses/vendors    - Tedarikçileri listele
POST   /api/expenses/vendors    - Yeni tedarikçi ekle
```

---

### 4️⃣ **Ana Route'a Ekledik**
📁 `src/routes/index.js`

```javascript
import expenseRoutes from './expenseRoutes.js';
router.use('/expenses', expenseRoutes);
```

---

## 🚀 KULLANIM

### Server'ı Yeniden Başlat

```bash
npm start
```

Server otomatik olarak Prisma Client'ı generate edecek.

---

### API Test Et

#### 1. Kategori Ekle
```bash
curl -X POST http://localhost:5000/api/expenses/categories \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryName": "Kira",
    "description": "Mağaza kira ödemeleri"
  }'
```

#### 2. Tedarikçi Ekle
```bash
curl -X POST http://localhost:5000/api/expenses/vendors \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vendorName": "ABC Gayrimenkul",
    "contactPerson": "Ahmet Yılmaz",
    "phone": "0532 123 4567"
  }'
```

#### 3. Gider Ekle
```bash
curl -X POST http://localhost:5000/api/expenses \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryId": 1,
    "amount": 15000,
    "expenseType": "general",
    "description": "Ocak ayı kira",
    "vendorId": 1
  }'
```

#### 4. Giderleri Listele
```bash
curl -X GET "http://localhost:5000/api/expenses?startDate=2025-01-01&endDate=2025-01-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📚 İLERİ SEVİYE

### Prisma Studio ile İnceleme

Tarayıcıda tablolarınızı görsel olarak inceleyin:

```bash
npx prisma studio
```

Bu komut http://localhost:5555 adresinde bir web arayüzü açar.

---

### Database Şemasını Görmek

```bash
npx prisma format
```

Schema dosyanızı düzgün formatlar ve gösterir.

---

## 🎯 GELECEKTE YENİ TABLO EKLENİRSE

### Adımlar:

1. **Schema'yı Çek**
```bash
npx prisma db pull
```

2. **Prisma Client'ı Generate Et**
```bash
npx prisma generate
```

3. **Controller Oluştur**
```bash
# src/controllers/yeniTabloController.js
```

4. **Route Oluştur**
```bash
# src/routes/yeniTabloRoutes.js
```

5. **Ana Route'a Ekle**
```javascript
// src/routes/index.js
import yeniTabloRoutes from './yeniTabloRoutes.js';
router.use('/yenitablo', yeniTabloRoutes);
```

6. **Server'ı Restart Et**
```bash
npm start
```

---

## ⚠️ ÖNEMLİ NOTLAR

### 1. Production'da Dikkat Et!
```bash
# SADECE okuma yapar, güvenli:
npx prisma db pull

# Database'i değiştirir, DİKKATLİ:
npx prisma db push
npx prisma migrate deploy
```

### 2. Schema Yedekleme
Her `db pull` öncesi yedek alın:
```bash
copy prisma\schema.prisma prisma\schema.prisma.backup
```

### 3. Permission Ekle
Yeni tablo için permission eklemeyi unutma:
```sql
INSERT INTO "Permissions" ("AccountID", "Name", "Description", "Resource")
VALUES (1, 'expenses_view', 'Giderleri görüntüleme', 'expenses');

INSERT INTO "Permissions" ("AccountID", "Name", "Description", "Resource")
VALUES (1, 'expenses_create', 'Gider ekleme', 'expenses');
```

---

## 🔍 SORUN GİDERME

### "Prisma Client not generated" Hatası
```bash
npx prisma generate
npm start
```

### "Table not found" Hatası
```bash
npx prisma db pull
npx prisma generate
```

### Route Çalışmıyor
Route sıralamasını kontrol et:
```javascript
// ✅ Doğru sıra:
router.get('/categories', ...)  // Önce özel route'lar
router.get('/:id', ...)          // Sonra parametreli route'lar

// ❌ Yanlış sıra:
router.get('/:id', ...)          // "categories" kelimesi ID olarak algılanır!
router.get('/categories', ...)
```

---

## 📖 DOKÜMANTASYON

Detaylı API dokümantasyonu için:
📄 `EXPENSE_API_DOCUMENTATION.md`

---

**Hazırlayan**: AI Assistant 🤖
**Tarih**: 06 Kasım 2025
**Proje**: Geras Salon Yönetim Sistemi

