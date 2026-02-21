import cron from 'node-cron';
import prisma from '../lib/prisma.js';
import { sendSMS } from './smsService.js';

/**
 * Vadesi 1, 2 veya 3 gün kalmış PENDING taksitler için hatırlatma SMS'i gönderir.
 * - smsReminderEnabled = true olan satışlar için çalışır
 * - Son 23 saatte reminderSentAt güncellenmediyse SMS gönderilir (tekrarlama önlemi)
 */
const sendInstallmentReminders = async () => {
  try {
    const now = new Date();

    // Vade aralığı: bugünden 3 gün sonrasına kadar (geçmiş vadeler de dahil)
    const rangeEnd = new Date(now);
    rangeEnd.setDate(rangeEnd.getDate() + 3);
    rangeEnd.setHours(23, 59, 59, 999);

    // 23 saat önce — bu süreden daha eski reminderSentAt olanlar tekrar alabilir
    const reminderCooldown = new Date(now);
    reminderCooldown.setHours(reminderCooldown.getHours() - 23);

    const pendingInstallments = await prisma.payments.findMany({
      where: {
        status: 'PENDING',
        installmentNumber: { not: null },
        dueDate: { lte: rangeEnd },
        sale: {
          isDeleted: false,
          smsReminderEnabled: true
        },
        OR: [
          { reminderSentAt: null },
          { reminderSentAt: { lt: reminderCooldown } }
        ]
      },
      include: {
        sale: {
          include: {
            client: { select: { firstName: true, lastName: true, phone: true, gender: true } },
            service: { select: { serviceName: true } },
            account: { select: { businessName: true } }
          }
        }
      },
      orderBy: { dueDate: 'asc' }
    });

    if (pendingInstallments.length === 0) {
      console.log('✅ Cron: Hatırlatma gereken taksit bulunamadı');
      return;
    }

    console.log(`⏰ Cron: ${pendingInstallments.length} taksit için hatırlatma SMS'i gönderilecek...`);

    let successCount = 0;
    let failCount = 0;

    for (const payment of pendingInstallments) {
      const client = payment.sale.client;
      if (!client?.phone) {
        console.warn(`  ⚠️ Taksit #${payment.id}: Müşteri telefonu yok, atlanıyor`);
        continue;
      }

      const dueDate = new Date(payment.dueDate);
      const diffMs = dueDate - now;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      let dueDateLabel;
      if (diffDays <= 0) {
        dueDateLabel = 'bugün (vadesi geçti)';
      } else if (diffDays === 1) {
        dueDateLabel = 'yarın';
      } else {
        dueDateLabel = `${diffDays} gun icinde`;
      }

      const salutation = client.gender === 'FEMALE' ? 'Sayin Hanim' : client.gender === 'MALE' ? 'Sayin Bey' : 'Sayin';
      const clientName = `${client.firstName} ${client.lastName}`;
      const businessName = payment.sale.account?.businessName || 'Salonumuz';
      const serviceName = payment.sale.service?.serviceName || 'hizmet';
      const amount = parseFloat(payment.amountPaid).toFixed(2);
      const dueDateStr = dueDate.toLocaleDateString('tr-TR');

      const message =
        `${salutation} ${clientName},\n` +
        `${businessName} - ${serviceName} icin ${payment.installmentNumber}. taksitinizin ` +
        `(${amount} TL) vadesi ${dueDateLabel} (${dueDateStr}).\n` +
        `Lutfen odemenizi zamaninda gerceklestirin.\n` +
        `Iyi gunler dileriz.`;

      try {
        const result = await sendSMS(client.phone, message);
        if (result?.success || result?.skipped) {
          await prisma.payments.update({
            where: { id: payment.id },
            data: { reminderSentAt: now }
          });
          successCount++;
          console.log(`  ✅ SMS gönderildi: ${clientName} (Taksit ${payment.installmentNumber}, Vade: ${dueDateStr})`);
        } else {
          failCount++;
          console.warn(`  ⚠️ SMS gönderilemedi: ${clientName} — ${result?.error}`);
        }
      } catch (smsErr) {
        failCount++;
        console.error(`  ❌ SMS hatası: ${clientName} — ${smsErr.message}`);
      }
    }

    console.log(`✅ Taksit hatırlatma tamamlandı: ${successCount} başarılı, ${failCount} başarısız`);
  } catch (error) {
    console.error('❌ Taksit hatırlatma cron hatası:', error);
  }
};

/**
 * Her gün sabah 09:00'da çalışır
 */
const startInstallmentCronJob = () => {
  cron.schedule('0 9 * * *', async () => {
    console.log('⏰ Cron: Taksit hatırlatma SMS kontrolü başlatılıyor...');
    await sendInstallmentReminders();
  }, {
    timezone: 'Europe/Istanbul'
  });

  console.log('✅ Taksit hatırlatma cron job başlatıldı (Her gün 09:00)');
};

export { startInstallmentCronJob, sendInstallmentReminders };
