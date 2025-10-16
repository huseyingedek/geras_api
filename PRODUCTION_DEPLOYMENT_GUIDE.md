# 🚀 Production'a Migration Alma Rehberi

## Genel Bakış

Yeni eklenen alanlar:
- ✅ `Sales.Notes` (TEXT, nullable)
- ✅ `Appointments.ReminderSentAt` (TIMESTAMP, nullable)
- ✅ `Accounts.SMSEnabled` (BOOLEAN, default: true)
- ✅ `Accounts.ReminderEnabled` (BOOLEAN, default: true)
- ✅ `Accounts.ReminderHours` (INTEGER, default: 24)
- ✅ `NotificationSettings.ReminderEnabled` (BOOLEAN, default: false)
- ✅ `NotificationSettings.ReminderHours` (INTEGER, default: 24)

**ÖNEMLI:** Tüm alanlar nullable veya default değerli olduğu için mevcut verilere zarar vermez!

---

## 📋 Önkoşullar

1. ✅ Canlı veritabanının yedeği alınmış olmalı (Neon otomatik backup yapar)
2. ✅ Production DATABASE_URL'e erişim
3. ✅ Bakım penceresi belirlenmeli (opsiyonel, 2-3 dk sürer)

---

## 🎯 Yöntem 1: Neon Dashboard SQL Editor (ÖNERİLEN)

### Adım 1: Neon Dashboard'a Git
1. https://neon.tech adresine git
2. Projeyi seç
3. SQL Editor'ü aç

### Adım 2: Migration SQL'ini Çalıştır
1. `prisma/migrations/production_migration.sql` dosyasını aç
2. Tüm içeriği kopyala
3. Neon SQL Editor'e yapıştır
4. **Run** butonuna tıkla

### Adım 3: Doğrulama
Migration başarılı olduysa şu mesajları göreceksin:
```
Sales.Notes kolonu eklendi
Appointments.ReminderSentAt kolonu eklendi
Accounts.SMSEnabled kolonu eklendi
Accounts.ReminderEnabled kolonu eklendi
Accounts.ReminderHours kolonu eklendi
...
```

### Adım 4: Kontrol SQL'i Çalıştır
```sql
-- Tüm yeni kolonların eklendiğini doğrula
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name IN ('Sales', 'Appointments', 'Accounts', 'NotificationSettings')
  AND column_name IN ('Notes', 'ReminderSentAt', 'SMSEnabled', 'ReminderEnabled', 'ReminderHours')
ORDER BY table_name, column_name;
```

---

## 🎯 Yöntem 2: Prisma Migrate Deploy

### Adım 1: .env Dosyasını Güncelle
```bash
# Production DATABASE_URL'i ekle (GEÇİCİ)
DATABASE_URL="postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/gerasdb?sslmode=require"
```

### Adım 2: Migration'ları Deploy Et
```bash
# Production migration'ları uygula
npx prisma migrate deploy

# Prisma Client'ı güncelle
npx prisma generate
```

### Adım 3: .env'i Geri Al
```bash
# Local DATABASE_URL'e geri dön
DATABASE_URL="postgresql://localhost:5432/gerasdb"
```

---

## 🎯 Yöntem 3: Remote DB Connection (Terminal)

### Adım 1: Production DB'ye Bağlan
```bash
psql "postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/gerasdb?sslmode=require"
```

### Adım 2: SQL Dosyasını Çalıştır
```bash
\i prisma/migrations/production_migration.sql
```

### Adım 3: Bağlantıyı Kapat
```bash
\q
```

---

## ✅ Migration Sonrası Kontroller

### 1. Backend'i Test Et
```bash
# Local'de production DATABASE_URL ile test
npm start
```

### 2. API Endpoint'lerini Test Et
```bash
# Health check
curl https://your-api.com/api/health

# Sales endpoint (Notes alanı var mı?)
curl https://your-api.com/api/sales

# Appointments endpoint (ReminderSentAt var mı?)
curl https://your-api.com/api/appointments
```

### 3. SMS Reminder Servisini Test Et
```bash
# Reminder service'i manuel çalıştır
node src/services/reminderService.js
```

---

## 🔄 Rollback Planı

Eğer bir şeyler ters giderse:

```sql
BEGIN;

-- Yeni kolonları kaldır
ALTER TABLE "Sales" DROP COLUMN IF EXISTS "Notes";
ALTER TABLE "Appointments" DROP COLUMN IF EXISTS "ReminderSentAt";
ALTER TABLE "Accounts" DROP COLUMN IF EXISTS "SMSEnabled";
ALTER TABLE "Accounts" DROP COLUMN IF EXISTS "ReminderEnabled";
ALTER TABLE "Accounts" DROP COLUMN IF EXISTS "ReminderHours";
ALTER TABLE "NotificationSettings" DROP COLUMN IF EXISTS "ReminderEnabled";
ALTER TABLE "NotificationSettings" DROP COLUMN IF EXISTS "ReminderHours";

-- İndeksleri kaldır
DROP INDEX IF EXISTS "idx_accounts_sms_enabled";
DROP INDEX IF EXISTS "idx_notification_settings_reminder";

COMMIT;
```

---

## 📊 Beklenen Sonuç

Migration başarılı olduktan sonra:
- ✅ Tüm mevcut veriler korunur
- ✅ Yeni alanlar kullanıma hazır olur
- ✅ SMS reminder servisi çalışmaya başlar
- ✅ Sales'e not eklenebilir
- ✅ Randevulara hatırlatma gönderilir

---

## 🆘 Sorun Giderme

### Sorun 1: "column already exists" hatası
**Çözüm:** Normal, migration idempotent. Kolon zaten eklenmiş.

### Sorun 2: "permission denied"
**Çözüm:** Neon dashboard'dan admin kullanıcısıyla çalıştır.

### Sorun 3: "timeout error"
**Çözüm:** Migration tek transaction'da çalışıyor. BEGIN/COMMIT'i kaldırıp satır satır çalıştır.

---

## 📝 Checklist

- [ ] Neon dashboard'a giriş yapıldı
- [ ] SQL Editor açıldı
- [ ] `production_migration.sql` kopyalandı
- [ ] SQL çalıştırıldı
- [ ] Success mesajları görüldü
- [ ] Doğrulama SQL'i çalıştırıldı
- [ ] Backend restart edildi
- [ ] API test edildi
- [ ] SMS reminder test edildi
- [ ] Monitoring kontrol edildi

---

## 🎉 Tamamlandı!

Migration başarıyla uygulandı. Artık:
- SMS reminder sistemi aktif
- Satışlara not ekleyebilirsin
- Randevu hatırlatmaları takip ediliyor

**Sorular için:** huseyinxgedek@gmail.com

