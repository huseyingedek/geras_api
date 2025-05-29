import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import app from './app.js';

dotenv.config();

const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

async function main() {
  try {
    await prisma.$connect();
    console.log('Veritabanına bağlandı');
    
    app.listen(PORT, () => {
      console.log(`Server ${PORT} portunda çalışıyor`);
    });
  } catch (error) {
    console.error('Sunucu başlatılamadı:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  console.log('Veritabanı bağlantısı kapatıldı');
  process.exit(0);
}); 