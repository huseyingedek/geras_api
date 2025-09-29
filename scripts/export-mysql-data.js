import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

// Natro MySQL connection configuration
const MYSQL_CONFIG = {
  host: process.env.NATRO_MYSQL_HOST || 'your-natro-mysql-host',
  user: process.env.NATRO_MYSQL_USER || 'your-mysql-username', 
  password: process.env.NATRO_MYSQL_PASSWORD || 'your-mysql-password',
  database: process.env.NATRO_MYSQL_DATABASE || 'your-database-name',
  port: parseInt(process.env.NATRO_MYSQL_PORT || '3306')
};

// Tables to export (in dependency order)
const TABLES = [
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

async function exportMySQLData() {
  let connection;
  
  try {
    console.log('🔌 Connecting to MySQL...');
    connection = await mysql.createConnection(MYSQL_CONFIG);
    console.log('✅ MySQL connection established');
    
    const exportData = {};
    let totalRecords = 0;
    
    for (const tableName of TABLES) {
      try {
        console.log(`📤 Exporting ${tableName}...`);
        
        const [rows] = await connection.execute(`SELECT * FROM \`${tableName}\``);
        exportData[tableName] = rows;
        totalRecords += rows.length;
        
        console.log(`   ✅ ${tableName}: ${rows.length} records`);
      } catch (error) {
        console.error(`   ❌ Error exporting ${tableName}:`, error.message);
        exportData[tableName] = [];
      }
    }
    
    // Create exports directory if it doesn't exist
    const exportsDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir);
    }
    
    // Save export data
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = path.join(exportsDir, `mysql-export-${timestamp}.json`);
    
    fs.writeFileSync(filename, JSON.stringify(exportData, null, 2));
    
    console.log('\n🎉 Export Summary:');
    console.log('='.repeat(50));
    console.log(`📁 File: ${filename}`);
    console.log(`📊 Total Tables: ${TABLES.length}`);
    console.log(`📈 Total Records: ${totalRecords}`);
    console.log(`💾 File Size: ${(fs.statSync(filename).size / 1024 / 1024).toFixed(2)} MB`);
    
    // Create latest symlink
    const latestFile = path.join(exportsDir, 'mysql-export-latest.json');
    if (fs.existsSync(latestFile)) {
      fs.unlinkSync(latestFile);
    }
    fs.copyFileSync(filename, latestFile);
    
    console.log('✅ Export completed successfully!');
    
  } catch (error) {
    console.error('❌ Export failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 MySQL connection closed');
    }
  }
}

// Run export if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  exportMySQLData();
}

export default exportMySQLData;
