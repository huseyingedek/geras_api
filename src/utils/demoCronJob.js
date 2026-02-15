import cron from 'node-cron';
import prisma from '../lib/prisma.js';

/**
 * DEMO HESAP SURE KONTROLU - CRON JOB
 * 
 * Her 6 saatte bir calisir ve:
 * 1. Suresi dolan aktif demo hesaplari bulur
 * 2. Durumunu PENDING_APPROVAL yapar (admin onayi icin)
 * 3. Admin panelinde bildirim gosterir
 */

const checkExpiredDemoAccounts = async () => {
  try {
    console.log('🔍 Demo hesap süre kontrolü başlatılıyor...');
    
    const now = new Date();
    
    // Süresi dolmuş aktif demo hesapları bul
    const expiredDemos = await prisma.accounts.findMany({
      where: {
        isDemoAccount: true,
        demoStatus: 'ACTIVE',
        demoExpiresAt: {
          lte: now // Süre dolmuş
        }
      },
      include: {
        users: {
          where: { role: 'OWNER' },
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      }
    });

    if (expiredDemos.length === 0) {
      console.log('✅ Süresi dolmuş demo hesap bulunamadı');
      return;
    }

    console.log(`⚠️ ${expiredDemos.length} demo hesabın süresi doldu!`);

    // Her birini 'PENDING_APPROVAL' durumuna al
    for (const demo of expiredDemos) {
      await prisma.accounts.update({
        where: { id: demo.id },
        data: {
          demoStatus: 'PENDING_APPROVAL',
          isActive: false // Geçici olarak kısıtla, admin onaylayana kadar
        }
      });

      console.log(`  📌 Demo Hesap: ${demo.businessName} (${demo.email}) - ONAY BEKLİYOR`);
      
      // TODO: Admin'e email/bildirim gönder
      // TODO: Owner'a "demo süresi doldu, devam etmek için lütfen bekleyin" maili gönder
    }

    console.log(`✅ ${expiredDemos.length} demo hesap 'PENDING_APPROVAL' durumuna alındı`);

  } catch (error) {
    console.error('❌ Demo hesap süre kontrolü hatası:', error);
  }
};

/**
 * CRON JOB AYARLARI
 * 
 * Cron pattern: 0 (star)(star)/6 (star) (star) (star)
 * Dakika: 0
 * Saat: Her 6 saatte bir (0, 6, 12, 18)
 * Gun: Her gun
 * 
 * Test icin daha sik calistirmak isterseniz:
 * Pattern: (star)(star)/5 (star) (star) (star) (star) = Her 5 dakikada bir
 * Pattern: 0 (star) (star) (star) (star) = Her saat basi
 */

const startDemoCronJob = () => {
  // Her 6 saatte bir çalışır (00:00, 06:00, 12:00, 18:00)
  cron.schedule('0 */6 * * *', async () => {
    console.log('⏰ Cron Job çalışıyor: Demo hesap süre kontrolü');
    await checkExpiredDemoAccounts();
  });

  console.log('✅ Demo hesap cron job başlatıldı (Her 6 saatte bir çalışacak)');
};

// İlk başlatmada bir kez manuel kontrol (opsiyonel)
const initialCheck = async () => {
  console.log('🚀 İlk demo hesap kontrolü yapılıyor...');
  await checkExpiredDemoAccounts();
};

export { startDemoCronJob, checkExpiredDemoAccounts, initialCheck };
