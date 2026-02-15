import prisma from '../lib/prisma.js';
import cron from 'node-cron';

/**
 * Süresi dolmuş ve eski verification kayıtlarını temizle
 * 1 günden eski kayıtları siler
 */
export const cleanupExpiredVerifications = async () => {
  try {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const deleted = await prisma.phoneVerification.deleteMany({
      where: {
        createdAt: {
          lt: oneDayAgo
        }
      }
    });

    console.log(`🧹 ${deleted.count} eski verification kaydı temizlendi`);
    return deleted.count;
  } catch (error) {
    console.error('❌ Verification cleanup hatası:', error.message);
    return 0;
  }
};

/**
 * Her gün gece 03:00'te otomatik temizlik yap
 */
export const startCleanupCron = () => {
  // Cron format: dakika saat gün ay haftanın-günü
  // '0 3 * * *' = Her gün 03:00
  cron.schedule('0 3 * * *', async () => {
    console.log('🧹 Verification cleanup başlatıldı... (03:00)');
    await cleanupExpiredVerifications();
  });

  console.log('✅ Verification cleanup cron job başlatıldı (Her gün 03:00)');
};

/**
 * İlk açılışta cleanup yap (optional)
 */
export const initialCleanup = async () => {
  console.log('🧹 Initial verification cleanup...');
  await cleanupExpiredVerifications();
};
