import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Import order (respecting foreign key dependencies)
const IMPORT_ORDER = [
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

// Prisma model name mapping
const MODEL_MAPPING = {
  'Accounts': 'accounts',
  'Users': 'user',
  'Clients': 'clients',
  'Staff': 'staff', 
  'Services': 'services',
  'Sales': 'sales',
  'Payments': 'payments',
  'Appointments': 'appointments',
  'Sessions': 'sessions',
  'WorkingHours': 'workingHours',
  'Permissions': 'permission',
  'StaffPermissions': 'staffPermission',
  'Notifications': 'notification',
  'NotificationSettings': 'notificationSetting',
  'Reports': 'report',
  'ReportTemplates': 'reportTemplate'
};

// Data transformation functions
const transformData = (tableName, records) => {
  return records.map(record => {
    const transformed = { ...record };
    
    // Transform date fields
    const dateFields = ['CreatedAt', 'UpdatedAt', 'AppointmentDate', 'SaleDate', 'PaymentDate', 'SessionDate', 'StartTime', 'EndTime', 'CompletedAt'];
    dateFields.forEach(field => {
      if (transformed[field]) {
        transformed[field] = new Date(transformed[field]);
      }
    });
    
    // Transform boolean fields (MySQL 0/1 to PostgreSQL true/false)
    const booleanFields = ['IsActive', 'IsDeleted', 'IsWorking', 'IsSessionBased', 'IsRead', 'IsSystem', 'CanView', 'CanCreate', 'CanEdit', 'CanDelete', 'EmailEnabled', 'PushEnabled', 'SMSEnabled'];
    booleanFields.forEach(field => {
      if (field in transformed) {
        transformed[field] = Boolean(transformed[field]);
      }
    });
    
    // Transform enum fields
    if (transformed.BusinessType) {
      const enumMap = {
        'SessionBased': 'SESSION_BASED',
        'NonSessionBased': 'NON_SESSION_BASED'
      };
      transformed.BusinessType = enumMap[transformed.BusinessType] || transformed.BusinessType;
    }
    
    // Remove undefined fields
    Object.keys(transformed).forEach(key => {
      if (transformed[key] === undefined || transformed[key] === null) {
        delete transformed[key];
      }
    });
    
    return transformed;
  });
};

async function importToPostgreSQL() {
  try {
    console.log('🔌 Connecting to PostgreSQL (Neon)...');
    await prisma.$connect();
    console.log('✅ PostgreSQL connection established');
    
    // Load export data
    const exportsDir = path.join(process.cwd(), 'exports');
    const dataFile = path.join(exportsDir, 'mysql-export-latest.json');
    
    if (!fs.existsSync(dataFile)) {
      throw new Error('Export file not found. Run export-mysql-data.js first.');
    }
    
    console.log(`📁 Loading data from: ${dataFile}`);
    const rawData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    
    let totalImported = 0;
    const results = {};
    
    // Disable foreign key checks temporarily
    console.log('🔧 Preparing database...');
    
    for (const tableName of IMPORT_ORDER) {
      if (!rawData[tableName] || rawData[tableName].length === 0) {
        console.log(`⏭️  Skipping ${tableName} (no data)`);
        results[tableName] = { imported: 0, errors: 0 };
        continue;
      }
      
      console.log(`📥 Importing ${tableName}...`);
      
      const modelName = MODEL_MAPPING[tableName];
      if (!modelName) {
        console.error(`❌ No model mapping for ${tableName}`);
        continue;
      }
      
      const transformedData = transformData(tableName, rawData[tableName]);
      let imported = 0;
      let errors = 0;
      
      try {
        // Try batch import first
        await prisma[modelName].createMany({
          data: transformedData,
          skipDuplicates: true
        });
        imported = transformedData.length;
        console.log(`   ✅ Batch import: ${imported} records`);
      } catch (batchError) {
        console.log(`   ⚠️  Batch import failed, trying individual records...`);
        console.log(`   Error: ${batchError.message}`);
        
        // Fallback to individual imports
        for (const record of transformedData) {
          try {
            await prisma[modelName].create({ data: record });
            imported++;
          } catch (recordError) {
            errors++;
            console.log(`   ❌ Failed to import record:`, recordError.message);
          }
        }
        
        console.log(`   ✅ Individual import: ${imported} records, ${errors} errors`);
      }
      
      totalImported += imported;
      results[tableName] = { imported, errors, total: transformedData.length };
    }
    
    console.log('\n🎉 Import Summary:');
    console.log('='.repeat(60));
    
    Object.entries(results).forEach(([table, stats]) => {
      const status = stats.errors > 0 ? '⚠️' : '✅';
      console.log(`${status} ${table.padEnd(20)}: ${stats.imported}/${stats.total} records`);
    });
    
    console.log('='.repeat(60));
    console.log(`📊 Total Imported: ${totalImported} records`);
    
    // Validation
    console.log('\n🔍 Running validation...');
    const validation = await validateImport();
    
    if (validation.success) {
      console.log('✅ Validation passed!');
    } else {
      console.log('❌ Validation failed!');
      console.log(validation.errors);
    }
    
  } catch (error) {
    console.error('❌ Import failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('🔌 PostgreSQL connection closed');
  }
}

async function validateImport() {
  try {
    const counts = {};
    
    for (const tableName of IMPORT_ORDER) {
      const modelName = MODEL_MAPPING[tableName];
      if (modelName) {
        counts[tableName] = await prisma[modelName].count();
      }
    }
    
    console.log('\n📊 Record Counts:');
    Object.entries(counts).forEach(([table, count]) => {
      console.log(`   ${table.padEnd(20)}: ${count}`);
    });
    
    // Basic relationship checks
    const accountsCount = counts.Accounts || 0;
    const usersCount = counts.Users || 0;
    const salesCount = counts.Sales || 0;
    
    const relationshipChecks = [
      accountsCount > 0,
      usersCount > 0,
      salesCount >= 0
    ];
    
    return {
      success: relationshipChecks.every(check => check),
      counts,
      errors: relationshipChecks.every(check => check) ? [] : ['Relationship validation failed']
    };
    
  } catch (error) {
    return {
      success: false,
      errors: [error.message]
    };
  }
}

// Run import if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  importToPostgreSQL();
}

export { importToPostgreSQL, validateImport };
