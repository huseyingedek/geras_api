import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';

const prisma = new PrismaClient();

// CSV dosya adları ve Prisma model mapping
const CSV_MAPPINGS = {
  'Accounts.csv': 'accounts',
  'Users.csv': 'user',
  'Clients.csv': 'clients',
  'Staff.csv': 'staff',
  'Services.csv': 'services',
  'Sales.csv': 'sales',
  'Payments.csv': 'payments',
  'Appointments.csv': 'appointments',
  'Sessions.csv': 'sessions',
  'WorkingHours.csv': 'workingHours',
  'Permissions.csv': 'permission',
  'StaffPermissions.csv': 'staffPermission',
  'Notifications.csv': 'notification',
  'NotificationSettings.csv': 'notificationSetting',
  'Reports.csv': 'report',
  'ReportTemplates.csv': 'reportTemplate'
};

// Import sırası (foreign key dependencies)
const IMPORT_ORDER = [
  'Accounts.csv',
  'Users.csv',
  'Clients.csv',
  'Staff.csv',
  'Services.csv',
  'Sales.csv',
  'Payments.csv',
  'Appointments.csv',
  'Sessions.csv',
  'WorkingHours.csv',
  'Permissions.csv',
  'StaffPermissions.csv',
  'Notifications.csv',
  'NotificationSettings.csv',
  'Reports.csv',
  'ReportTemplates.csv'
];

// CSV'den veri okuma fonksiyonu
const readCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    
    if (!fs.existsSync(filePath)) {
      console.log(`⏭️  Skipping ${path.basename(filePath)} (file not found)`);
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

// Veri dönüştürme fonksiyonu
const transformCSVData = (csvFileName, records) => {
  return records.map(record => {
    const transformed = { ...record };
    
    // Boş string'leri null'a çevir
    Object.keys(transformed).forEach(key => {
      if (transformed[key] === '' || transformed[key] === 'NULL') {
        transformed[key] = null;
      }
    });
    
    // ID alanlarını integer'a çevir
    const idFields = ['AccountID', 'UserID', 'ClientID', 'StaffID', 'ServiceID', 'SaleID', 'PaymentID', 'AppointmentID', 'SessionID', 'PermissionID', 'StaffPermissionID', 'NotificationID', 'SettingID', 'ReportID', 'TemplateID', 'WorkingHourID'];
    idFields.forEach(field => {
      if (transformed[field] && !isNaN(transformed[field])) {
        transformed[field] = parseInt(transformed[field]);
      }
    });
    
    // Boolean alanları dönüştür (1/0 → true/false)
    const booleanFields = ['IsActive', 'IsDeleted', 'IsWorking', 'IsSessionBased', 'IsRead', 'IsSystem', 'CanView', 'CanCreate', 'CanEdit', 'CanDelete', 'EmailEnabled', 'PushEnabled', 'SMSEnabled'];
    booleanFields.forEach(field => {
      if (field in transformed) {
        transformed[field] = transformed[field] === '1' || transformed[field] === 'true' || transformed[field] === true;
      }
    });
    
    // Decimal alanları dönüştür
    const decimalFields = ['TotalAmount', 'AmountPaid', 'Price'];
    decimalFields.forEach(field => {
      if (transformed[field] && !isNaN(transformed[field])) {
        transformed[field] = parseFloat(transformed[field]);
      }
    });
    
    // Tarih alanları dönüştür
    const dateFields = ['CreatedAt', 'UpdatedAt', 'AppointmentDate', 'SaleDate', 'PaymentDate', 'SessionDate', 'StartTime', 'EndTime', 'CompletedAt'];
    dateFields.forEach(field => {
      if (transformed[field] && transformed[field] !== null) {
        try {
          transformed[field] = new Date(transformed[field]);
        } catch (error) {
          console.warn(`⚠️  Invalid date format for ${field}: ${transformed[field]}`);
          transformed[field] = null;
        }
      }
    });
    
    // Enum alanları dönüştür
    if (transformed.BusinessType) {
      const enumMap = {
        'SessionBased': 'SESSION_BASED',
        'NonSessionBased': 'NON_SESSION_BASED'
      };
      transformed.BusinessType = enumMap[transformed.BusinessType] || transformed.BusinessType;
    }
    
    // Prisma field mapping (MySQL column names → Prisma field names)
    const fieldMapping = {
      // ID mappings
      'AccountID': 'id',
      'UserID': 'id', 
      'ClientID': 'id',
      'StaffID': csvFileName === 'StaffPermissions.csv' ? 'staffId' : 'id',
      'ServiceID': 'id',
      'SaleID': 'id',
      'PaymentID': 'id',
      'AppointmentID': 'id',
      'SessionID': 'id',
      'PermissionID': csvFileName === 'StaffPermissions.csv' ? 'permissionId' : 'id',
      'StaffPermissionID': 'id',
      'NotificationID': 'id',
      'SettingID': 'id',
      'ReportID': 'id',
      'TemplateID': 'id',
      'WorkingHourID': 'id',
      
      // Foreign key mappings
      'AccountID': csvFileName !== 'Accounts.csv' ? 'accountId' : 'id',
      'BusinessName': 'businessName',
      'ContactPerson': 'contactPerson',
      'Email': 'email',
      'Phone': 'phone',
      'BusinessType': 'businessType',
      'SubscriptionPlan': 'subscriptionPlan',
      'CreatedAt': 'createdAt',
      'UpdatedAt': 'updatedAt',
      'IsActive': 'isActive',
      'FirstName': 'firstName',
      'LastName': 'lastName',
      'CustomerName': 'customerName',
      'ServiceName': 'serviceName',
      'FullName': 'fullName',
      'Role': 'role',
      'TotalAmount': 'totalAmount',
      'RemainingSessions': 'remainingSessions',
      'IsDeleted': 'isDeleted',
      'AmountPaid': 'amountPaid',
      'PaymentMethod': 'paymentMethod',
      'PaymentDate': 'paymentDate',
      'AppointmentDate': 'appointmentDate',
      'SaleDate': 'saleDate',
      'SessionDate': 'sessionDate',
      'DurationMinutes': 'durationMinutes',
      'IsSessionBased': 'isSessionBased',
      'SessionCount': 'sessionCount'
    };
    
    // Field mapping uygula
    const mappedRecord = {};
    Object.keys(transformed).forEach(key => {
      const mappedKey = fieldMapping[key] || key.toLowerCase();
      mappedRecord[mappedKey] = transformed[key];
    });
    
    return mappedRecord;
  });
};

// Ana import fonksiyonu
async function importCSVToPostgreSQL() {
  console.log('🚀 Starting CSV import process...');
  console.log('📁 Looking for csv-exports directory...');
  
  try {
    console.log('🔌 Connecting to Neon PostgreSQL...');
    await prisma.$connect();
    console.log('✅ PostgreSQL connection established');
    
    const csvDir = path.join(process.cwd(), 'csv-exports');
    
    if (!fs.existsSync(csvDir)) {
      console.error(`❌ CSV directory not found: ${csvDir}`);
      console.log('💡 Create a "csv-exports" folder and put your CSV files there');
      process.exit(1);
    }
    
    let totalImported = 0;
    const results = {};
    
    console.log('\n📁 Available CSV files:');
    const availableFiles = fs.readdirSync(csvDir).filter(f => f.endsWith('.csv'));
    availableFiles.forEach(file => console.log(`   - ${file}`));
    
    for (const csvFile of IMPORT_ORDER) {
      const filePath = path.join(csvDir, csvFile);
      const modelName = CSV_MAPPINGS[csvFile];
      
      if (!modelName) {
        console.log(`⏭️  Skipping ${csvFile} (no model mapping)`);
        continue;
      }
      
      console.log(`\n📥 Processing ${csvFile}...`);
      
      try {
        const rawData = await readCSV(filePath);
        
        if (rawData.length === 0) {
          console.log(`   ⏭️  No data found`);
          results[csvFile] = { imported: 0, errors: 0, total: 0 };
          continue;
        }
        
        const transformedData = transformCSVData(csvFile, rawData);
        let imported = 0;
        let errors = 0;
        
        console.log(`   📊 Found ${transformedData.length} records`);
        
        // Batch import dene
        try {
          await prisma[modelName].createMany({
            data: transformedData,
            skipDuplicates: true
          });
          imported = transformedData.length;
          console.log(`   ✅ Batch import successful: ${imported} records`);
        } catch (batchError) {
          console.log(`   ⚠️  Batch import failed, trying individual records...`);
          console.log(`   Error: ${batchError.message}`);
          
          // Tek tek import
          for (const record of transformedData) {
            try {
              await prisma[modelName].create({ data: record });
              imported++;
            } catch (recordError) {
              errors++;
              console.log(`   ❌ Failed record: ${recordError.message}`);
            }
          }
          
          console.log(`   ✅ Individual import: ${imported} success, ${errors} errors`);
        }
        
        totalImported += imported;
        results[csvFile] = { imported, errors, total: transformedData.length };
        
      } catch (fileError) {
        console.error(`   ❌ Error processing ${csvFile}:`, fileError.message);
        results[csvFile] = { imported: 0, errors: 1, total: 0 };
      }
    }
    
    // Summary
    console.log('\n🎉 Import Summary:');
    console.log('='.repeat(60));
    
    Object.entries(results).forEach(([file, stats]) => {
      const status = stats.errors > 0 ? '⚠️' : '✅';
      console.log(`${status} ${file.padEnd(25)}: ${stats.imported}/${stats.total} records`);
    });
    
    console.log('='.repeat(60));
    console.log(`📊 Total Imported: ${totalImported} records`);
    
    // Validation
    console.log('\n🔍 Running validation...');
    await validateImport();
    
  } catch (error) {
    console.error('❌ Import failed:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
    console.log('🔌 PostgreSQL connection closed');
  }
}

// Validation fonksiyonu
async function validateImport() {
  try {
    const models = ['accounts', 'user', 'clients', 'staff', 'services', 'sales'];
    
    console.log('\n📊 Record Counts:');
    for (const model of models) {
      try {
        const count = await prisma[model].count();
        console.log(`   ${model.padEnd(15)}: ${count} records`);
      } catch (error) {
        console.log(`   ${model.padEnd(15)}: Error - ${error.message}`);
      }
    }
    
    console.log('\n✅ Validation completed!');
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
  }
}

// Script çalıştırma
console.log('🎯 CSV Import Script Started');
console.log('📂 Current directory:', process.cwd());

// ES module check fix
const isMainModule = process.argv[1] && process.argv[1].endsWith('import-csv-to-postgresql.js');

if (isMainModule) {
  console.log('🔄 Starting import process...');
  importCSVToPostgreSQL().catch(error => {
    console.error('💥 Fatal error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  });
} else {
  console.log('📝 Module loaded but not executed directly');
}

export default importCSVToPostgreSQL;
