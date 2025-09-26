# 🔄 MySQL → PostgreSQL VERİ MİGRATION REHBERİ

## 🎯 DURUM ANALİZİ
- **Kaynak**: Natro MySQL (gerçek müşteri verileri)
- **Hedef**: Neon PostgreSQL
- **Risk**: Veri kaybı olmamalı
- **Downtime**: Minimum olmalı

## 📋 MİGRATION STRATEJİSİ

### Seçenek 1: 🏆 **Önerilen - Aşamalı Migration**
```
1. Neon PostgreSQL'i setup et
2. Verileri export et (MySQL)
3. Verileri transform et (MySQL → PostgreSQL)
4. Verileri import et (PostgreSQL)
5. Test et
6. Production'a geç
```

### Seçenek 2: ⚡ **Hızlı - Direct Migration**
```
1. Maintenance mode
2. Full export/import
3. Validation
4. Switch
```

## 🛠️ ADIM ADIM MİGRATION

### 1️⃣ **HAZIRLIK AŞAMASI**

#### A. Neon Database Hazırlığı
```bash
# Local'de test et
DATABASE_URL="postgresql://neondb_owner:npg_bxmZ3cFf2dlM@ep-twilight-water-ae9ki6rb-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Schema oluştur
npx prisma db push

# Boş tabloları kontrol et
npx prisma studio
```

#### B. MySQL Backup
```sql
-- Natro phpMyAdmin'de SQL export
-- Tüm tabloları seç
-- Structure + Data
-- Export type: SQL
```

### 2️⃣ **VERİ EXPORT AŞAMASI**

#### MySQL'den JSON Export (Önerilen)
```javascript
// scripts/export-mysql-data.js
import mysql from 'mysql2/promise';
import fs from 'fs';

const connection = await mysql.createConnection({
  host: 'your-natro-host',
  user: 'your-username', 
  password: 'your-password',
  database: 'your-database'
});

const tables = [
  'Accounts', 'Users', 'Clients', 'Staff', 'Services', 
  'Sales', 'Payments', 'Appointments', 'Sessions',
  'Permissions', 'StaffPermissions', 'WorkingHours',
  'Notifications', 'NotificationSettings', 'Reports', 'ReportTemplates'
];

const exportData = {};

for (const table of tables) {
  const [rows] = await connection.execute(`SELECT * FROM ${table}`);
  exportData[table] = rows;
  console.log(`✅ ${table}: ${rows.length} records`);
}

fs.writeFileSync('mysql-export.json', JSON.stringify(exportData, null, 2));
console.log('🎉 Export completed!');
```

### 3️⃣ **VERİ TRANSFORM AŞAMASI**

#### MySQL → PostgreSQL Dönüşümü
```javascript
// scripts/transform-data.js
import fs from 'fs';

const mysqlData = JSON.parse(fs.readFileSync('mysql-export.json', 'utf8'));
const transformedData = {};

// Enum değerlerini dönüştür
const transformEnums = (value, field) => {
  const enumMappings = {
    'BusinessType': {
      'SessionBased': 'SESSION_BASED',
      'NonSessionBased': 'NON_SESSION_BASED'
    },
    'UserRole': {
      'EMPLOYEE': 'EMPLOYEE',
      'OWNER': 'OWNER', 
      'ADMIN': 'ADMIN'
    }
    // Diğer enum'lar...
  };
  
  return enumMappings[field]?.[value] || value;
};

// Tarih formatlarını dönüştür
const transformDate = (dateStr) => {
  if (!dateStr) return null;
  return new Date(dateStr).toISOString();
};

// Her tablo için dönüşüm
for (const [tableName, records] of Object.entries(mysqlData)) {
  transformedData[tableName] = records.map(record => {
    const transformed = { ...record };
    
    // Tarih alanları
    if (transformed.CreatedAt) transformed.CreatedAt = transformDate(transformed.CreatedAt);
    if (transformed.UpdatedAt) transformed.UpdatedAt = transformDate(transformed.UpdatedAt);
    if (transformed.AppointmentDate) transformed.AppointmentDate = transformDate(transformed.AppointmentDate);
    if (transformed.SaleDate) transformed.SaleDate = transformDate(transformed.SaleDate);
    if (transformed.PaymentDate) transformed.PaymentDate = transformDate(transformed.PaymentDate);
    if (transformed.SessionDate) transformed.SessionDate = transformDate(transformed.SessionDate);
    
    // Enum dönüşümleri
    if (transformed.BusinessType) transformed.BusinessType = transformEnums(transformed.BusinessType, 'BusinessType');
    if (transformed.Role) transformed.Role = transformEnums(transformed.Role, 'UserRole');
    
    // Decimal alanları (string olarak kalsın, PostgreSQL otomatik parse eder)
    // Boolean alanları (MySQL: 0/1 → PostgreSQL: true/false)
    Object.keys(transformed).forEach(key => {
      if (typeof transformed[key] === 'number' && (transformed[key] === 0 || transformed[key] === 1)) {
        // Boolean olabilecek alanlar
        const booleanFields = ['IsActive', 'IsDeleted', 'IsWorking', 'IsSessionBased', 'IsRead', 'IsSystem', 'CanView', 'CanCreate', 'CanEdit', 'CanDelete', 'EmailEnabled', 'PushEnabled', 'SMSEnabled'];
        if (booleanFields.some(field => key.includes(field))) {
          transformed[key] = Boolean(transformed[key]);
        }
      }
    });
    
    return transformed;
  });
}

fs.writeFileSync('postgresql-data.json', JSON.stringify(transformedData, null, 2));
console.log('🎉 Transform completed!');
```

### 4️⃣ **VERİ IMPORT AŞAMASI**

#### PostgreSQL'e Import
```javascript
// scripts/import-postgresql-data.js
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://neondb_owner:npg_bxmZ3cFf2dlM@ep-twilight-water-ae9ki6rb-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
    }
  }
});

const data = JSON.parse(fs.readFileSync('postgresql-data.json', 'utf8'));

// Import sırası önemli (foreign key constraints)
const importOrder = [
  'Accounts',
  'Users', 
  'Clients',
  'Staff',
  'Services',
  'Sales',
  'Payments',
  'Appointments',
  'Sessions',
  'WorkingHours',
  'Permissions',
  'StaffPermissions',
  'Notifications',
  'NotificationSettings', 
  'Reports',
  'ReportTemplates'
];

for (const tableName of importOrder) {
  if (!data[tableName]) continue;
  
  console.log(`📥 Importing ${tableName}...`);
  
  const modelName = tableName.toLowerCase();
  
  try {
    // Batch insert (PostgreSQL efficient)
    await prisma[modelName].createMany({
      data: data[tableName],
      skipDuplicates: true
    });
    
    console.log(`✅ ${tableName}: ${data[tableName].length} records imported`);
  } catch (error) {
    console.error(`❌ ${tableName} import failed:`, error.message);
    
    // Tek tek import dene
    for (const record of data[tableName]) {
      try {
        await prisma[modelName].create({ data: record });
      } catch (recordError) {
        console.error(`❌ Failed record in ${tableName}:`, record, recordError.message);
      }
    }
  }
}

await prisma.$disconnect();
console.log('🎉 Import completed!');
```

### 5️⃣ **VALIDATION AŞAMASI**

#### Veri Doğrulama
```javascript
// scripts/validate-migration.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const validateTables = async () => {
  const tables = [
    'accounts', 'users', 'clients', 'staff', 'services',
    'sales', 'payments', 'appointments', 'sessions'
  ];
  
  console.log('📊 VALIDATION REPORT:');
  console.log('='.repeat(50));
  
  for (const table of tables) {
    const count = await prisma[table].count();
    console.log(`${table.padEnd(20)}: ${count} records`);
  }
  
  // Kritik kontroller
  const totalAccounts = await prisma.accounts.count();
  const totalUsers = await prisma.users.count();
  const totalSales = await prisma.sales.count();
  
  console.log('\n🔍 CRITICAL CHECKS:');
  console.log(`Total Accounts: ${totalAccounts}`);
  console.log(`Total Users: ${totalUsers}`);
  console.log(`Total Sales: ${totalSales}`);
  
  // Relationship kontrolü
  const salesWithClients = await prisma.sales.count({
    where: { client: { isNot: null } }
  });
  
  console.log(`Sales with Clients: ${salesWithClients}/${totalSales}`);
};

validateTables();
```

## 🚀 DEPLOYMENT STRATEJİSİ

### A. Test Environment
1. Local'de migration test et
2. Neon staging database kullan
3. Validation scriptlerini çalıştır

### B. Production Migration
```bash
# 1. Maintenance mode
echo "Maintenance başlat"

# 2. Final MySQL export
node scripts/export-mysql-data.js

# 3. Transform & Import
node scripts/transform-data.js
node scripts/import-postgresql-data.js

# 4. Validate
node scripts/validate-migration.js

# 5. Update environment variables
# Render dashboard'da DATABASE_URL güncelle

# 6. Deploy new code
git push origin main

# 7. Test production
curl https://your-app.onrender.com/health

# 8. Maintenance mode kapat
```

## ⚠️ RİSK YÖNETİMİ

### Backup Strategy
- MySQL full export sakla
- PostgreSQL snapshot al (Neon otomatik)
- Rollback planı hazır olsun

### Downtime Minimization
- Migration'ı off-peak hours'da yap
- Maintenance page hazırla
- Status page güncellemesi

### Validation Checklist
- [ ] Tüm tablolar import edildi
- [ ] Record sayıları eşleşiyor
- [ ] Foreign key relationships çalışıyor
- [ ] Enum değerleri doğru
- [ ] Tarih formatları doğru
- [ ] Boolean değerleri doğru
- [ ] API endpoints çalışıyor
- [ ] Authentication çalışıyor
- [ ] Core functionality test edildi

## 🎯 SONUÇ
Bu plan ile müşteri verilerini güvenli şekilde MySQL'den PostgreSQL'e aktarabilirsin. Önce test environment'da dene, sonra production'a geç.

**Tahmini Süre**: 2-4 saat (veri miktarına göre)
**Downtime**: 30-60 dakika
**Risk**: Düşük (full backup + validation)
