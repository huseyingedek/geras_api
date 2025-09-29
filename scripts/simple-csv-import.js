import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';

const prisma = new PrismaClient();

console.log('🚀 Simple CSV Import Started');

// Sadece temel tabloları import et
const SIMPLE_IMPORT_ORDER = [
  { file: 'Accounts.csv', model: 'accounts' },
  { file: 'Users.csv', model: 'user' },
  { file: 'Clients.csv', model: 'clients' },
  { file: 'Staff.csv', model: 'staff' },
  { file: 'Services.csv', model: 'services' },
  { file: 'Sales.csv', model: 'sales' },
  { file: 'Payments.csv', model: 'payments' },
  { file: 'Appointments.csv', model: 'appointments' }
];

// CSV okuma fonksiyonu
const readCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    
    if (!fs.existsSync(filePath)) {
      console.log(`⏭️  ${path.basename(filePath)} not found`);
      resolve([]);
      return;
    }
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
};

// Basit field dönüştürme
const transformRecord = (record, tableName) => {
  const transformed = {};
  
  // Her field için dönüştürme
  Object.keys(record).forEach(key => {
    let value = record[key];
    let newKey = key;
    
    // Debug: İlk kayıt için field adlarını göster (sadece bir kez)
    // if (tableName === 'Users' && Object.keys(transformed).length === 0) {
    //   console.log(`🔍 CSV Fields for ${tableName}:`, Object.keys(record));
    // }
    
    // Boş değerleri null yap
    if (value === '' || value === 'NULL') {
      value = null;
    }
    
    // Field name mapping
    switch (key) {
      case 'AccountID':
      case 'accountid': // Küçük harfli versiyonu da handle et
      case 'accountId': // CSV'deki doğru format
        // Users tablosunda AccountID -> accountId
        if (tableName === 'Users') {
          newKey = 'accountId';
        } else {
          newKey = tableName === 'Accounts' ? 'id' : 'accountId';
        }
        break;
      case 'UserID':
        newKey = 'id';
        // Users tablosunda ID'yi skip et (autoincrement)
        if (tableName === 'Users') {
          return; // Bu field'ı skip et
        }
        break;
      case 'ClientID':
        newKey = tableName === 'Clients' ? 'id' : 'clientId';
        break;
      case 'StaffID':
        newKey = tableName === 'Staff' ? 'id' : 'staffId';
        break;
      case 'ServiceID':
        newKey = tableName === 'Services' ? 'id' : 'serviceId';
        break;
      case 'SaleID':
        newKey = tableName === 'Sales' ? 'id' : 'saleId';
        break;
      case 'PaymentID':
        newKey = 'id';
        break;
      case 'AppointmentID':
        newKey = 'id';
        break;
      case 'BusinessName':
        newKey = 'businessName';
        break;
      case 'ContactPerson':
        newKey = 'contactPerson';
        break;
      case 'BusinessType':
        newKey = 'businessType';
        // Enum dönüştürme
        if (value === 'SessionBased') value = 'SESSION_BASED';
        if (value === 'NonSessionBased') value = 'NON_SESSION_BASED';
        break;
      case 'SubscriptionPlan':
        newKey = 'subscriptionPlan';
        break;
      case 'CreatedAt':
        newKey = 'createdAt';
        if (value) value = new Date(value);
        break;
      case 'UpdatedAt':
        newKey = 'updatedAt';
        if (value) value = new Date(value);
        break;
      case 'IsActive':
        newKey = 'isActive';
        value = value === '1' || value === 'true';
        break;
      case 'FirstName':
        newKey = 'firstName';
        break;
      case 'LastName':
        newKey = 'lastName';
        break;
      case 'Email':
        newKey = 'email';
        break;
      case 'Phone':
        newKey = 'phone';
        break;
      case 'Role':
        newKey = 'role';
        break;
      case 'Password':
        newKey = 'password';
        break;
      case 'Username':
        newKey = 'username';
        break;
      case 'FullName':
        newKey = 'fullName';
        break;
      case 'ServiceName':
        newKey = 'serviceName';
        break;
      case 'Description':
        newKey = 'description';
        break;
      case 'Price':
        newKey = 'price';
        if (value) value = parseFloat(value);
        break;
      case 'DurationMinutes':
        newKey = 'durationMinutes';
        if (value) value = parseInt(value);
        break;
      case 'IsSessionBased':
        newKey = 'isSessionBased';
        value = value === '1' || value === 'true';
        break;
      case 'SessionCount':
        newKey = 'sessionCount';
        if (value) value = parseInt(value);
        break;
      case 'TotalAmount':
        newKey = 'totalAmount';
        if (value) value = parseFloat(value);
        break;
      case 'RemainingSessions':
        newKey = 'remainingSessions';
        if (value) value = parseInt(value);
        break;
      case 'IsDeleted':
        newKey = 'isDeleted';
        value = value === '1' || value === 'true';
        break;
      case 'SaleDate':
        newKey = 'saleDate';
        if (value) value = new Date(value);
        break;
      case 'AmountPaid':
        newKey = 'amountPaid';
        if (value) value = parseFloat(value);
        break;
      case 'PaymentMethod':
        newKey = 'paymentMethod';
        break;
      case 'PaymentDate':
        newKey = 'paymentDate';
        if (value) value = new Date(value);
        break;
      case 'Status':
        newKey = 'status';
        break;
      case 'Notes':
        newKey = 'notes';
        break;
      case 'CustomerName':
        newKey = 'customerName';
        break;
      case 'AppointmentDate':
        newKey = 'appointmentDate';
        if (value) value = new Date(value);
        break;
      default:
        // Sadece tamamen bilinmeyen field'lar için lowercase
        if (!key.includes('Id') && !key.includes('ID')) {
          newKey = key.toLowerCase();
        } else {
          newKey = key; // ID içeren field'ları olduğu gibi bırak
        }
    }
    
    // Integer field'ları dönüştür
    if (newKey.includes('id') || newKey.includes('Id')) {
      if (value && !isNaN(value)) {
        value = parseInt(value);
      }
    }
    
    transformed[newKey] = value;
  });
  
  return transformed;
};

// Ana import fonksiyonu
async function simpleImport() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to PostgreSQL');
    
    const csvDir = path.join(process.cwd(), 'csv-exports');
    let totalImported = 0;
    
    for (const { file, model } of SIMPLE_IMPORT_ORDER) {
      console.log(`\n📥 Processing ${file}...`);
      
      const filePath = path.join(csvDir, file);
      const rawData = await readCSV(filePath);
      
      if (rawData.length === 0) {
        console.log(`   ⏭️  No data found`);
        continue;
      }
      
      console.log(`   📊 Found ${rawData.length} records`);
      
      let imported = 0;
      let errors = 0;
      
      // Tek tek import (daha güvenli)
      for (const record of rawData) {
        try {
          const tableName = file.replace('.csv', '');
          const transformed = transformRecord(record, tableName);
          
          // ID handling
          if (transformed.id === null || tableName === 'Users') {
            delete transformed.id; // Autoincrement için ID'yi kaldır
          }
          
          // Tüm tablolarda duplicate ID'leri skip et
          if (transformed.id && ['Accounts', 'Clients', 'Services', 'Sales', 'Payments', 'Staff', 'Appointments'].includes(tableName)) {
            try {
              const existing = await prisma[model].findUnique({
                where: { id: transformed.id }
              });
              if (existing) {
                continue; // Skip duplicate
              }
            } catch (error) {
              // ID field yoksa devam et
            }
          }
          
          await prisma[model].create({ data: transformed });
          imported++;
          
          if (imported % 10 === 0) {
            console.log(`   📈 Progress: ${imported}/${rawData.length}`);
          }
          
        } catch (error) {
          errors++;
          if (errors <= 3) { // İlk 3 hatayı göster
            console.log(`   ❌ Error: ${error.message}`);
          }
        }
      }
      
      totalImported += imported;
      console.log(`   ✅ Imported: ${imported}/${rawData.length} (${errors} errors)`);
    }
    
    console.log(`\n🎉 Total Imported: ${totalImported} records`);
    
    // Final validation
    console.log('\n📊 Final Counts:');
    for (const { model } of SIMPLE_IMPORT_ORDER) {
      try {
        const count = await prisma[model].count();
        console.log(`   ${model.padEnd(15)}: ${count} records`);
      } catch (error) {
        console.log(`   ${model.padEnd(15)}: Error`);
      }
    }
    
  } catch (error) {
    console.error('💥 Fatal error:', error.message);
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Disconnected');
  }
}

simpleImport();
