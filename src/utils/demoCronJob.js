import cron from 'node-cron';
import prisma from '../lib/prisma.js';

/**
 * 1) Süresi dolan DEMO hesapları askıya al
 *    demoStatus: ACTIVE + demoExpiresAt geçmiş → isActive: false, demoStatus: EXPIRED
 */
const checkExpiredDemoAccounts = async () => {
  try {
    const now = new Date();

    const expiredDemos = await prisma.accounts.findMany({
      where: {
        isDemoAccount: true,
        demoStatus: 'ACTIVE',
        demoExpiresAt: { lte: now }
      },
      select: { id: true, businessName: true, email: true }
    });

    if (expiredDemos.length === 0) return;

    console.log(`⚠️ ${expiredDemos.length} demo hesabın süresi doldu — askıya alınıyor...`);

    for (const demo of expiredDemos) {
      await prisma.accounts.update({
        where: { id: demo.id },
        data: {
          demoStatus: 'EXPIRED',
          isActive: false
        }
      });
      console.log(`  📌 Demo askıya alındı: ${demo.businessName} (${demo.email})`);
    }

    console.log(`✅ ${expiredDemos.length} demo hesap askıya alındı`);
  } catch (error) {
    console.error('❌ Demo hesap süre kontrolü hatası:', error);
  }
};

/**
 * 2) Süresi dolan ÜCRETLİ abonelikleri askıya al
 *    subscriptionStatus: ACTIVE + subscriptionEndDate geçmiş → isActive: false, subscriptionStatus: EXPIRED
 */
const checkExpiredSubscriptions = async () => {
  try {
    const now = new Date();

    const expiredSubs = await prisma.accounts.findMany({
      where: {
        isDemoAccount: false,
        subscriptionStatus: 'ACTIVE',
        subscriptionEndDate: { lte: now }
      },
      select: { id: true, businessName: true, email: true, subscriptionPlan: true }
    });

    if (expiredSubs.length === 0) return;

    console.log(`⚠️ ${expiredSubs.length} aboneliğin süresi doldu — askıya alınıyor...`);

    for (const sub of expiredSubs) {
      await prisma.accounts.update({
        where: { id: sub.id },
        data: {
          subscriptionStatus: 'EXPIRED',
          isActive: false
        }
      });
      console.log(`  📌 Abonelik sona erdi: ${sub.businessName} (${sub.email}) — Plan: ${sub.subscriptionPlan}`);
    }

    console.log(`✅ ${expiredSubs.length} abonelik askıya alındı`);
  } catch (error) {
    console.error('❌ Ücretli abonelik süre kontrolü hatası:', error);
  }
};

/**
 * Her 6 saatte bir çalışır (00:00, 06:00, 12:00, 18:00)
 */
const startDemoCronJob = () => {
  cron.schedule('0 */6 * * *', async () => {
    console.log('⏰ Cron: Hesap süre kontrolleri başlatılıyor...');
    await checkExpiredDemoAccounts();
    await checkExpiredSubscriptions();
  });

  console.log('✅ Hesap süre kontrol cron job başlatıldı (Her 6 saatte bir)');
};

const initialCheck = async () => {
  console.log('🚀 İlk hesap süre kontrolü başlatılıyor...');
  await checkExpiredDemoAccounts();
  await checkExpiredSubscriptions();
};

export { startDemoCronJob, checkExpiredDemoAccounts, checkExpiredSubscriptions, initialCheck };
