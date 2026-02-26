import cron from 'node-cron';
import prisma from '../lib/prisma.js';
import { sendSMS, prepareAppointmentReminderSMS } from '../utils/smsService.js';

/**
 * Neon cold-start için basit retry yardımcısı
 */
const withRetry = async (fn, retries = 3, delayMs = 5000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isConnectionError = err?.code === 'P1001' || err?.code === 'P1002';
      if (isConnectionError && attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        throw err;
      }
    }
  }
};

/**
 * Hatırlatma gönderilecek randevuları bul ve SMS gönder
 */
const processAppointmentReminders = async () => {
  try {
    // Tüm aktif işletmeleri getir (Neon cold-start için retry ile)
    const accounts = await withRetry(() => prisma.accounts.findMany({
      where: {
        isActive: true,
        smsEnabled: true
      },
      select: {
        id: true,
        businessName: true
      }
    }));

    let totalReminders = 0;
    let successfulReminders = 0;

    // Her işletme için hatırlatma kontrolü
    for (const account of accounts) {
      try {
        const accountReminders = await processAccountReminders(account.id, account.businessName);
        totalReminders += accountReminders.total;
        successfulReminders += accountReminders.successful;
      } catch (accountError) {
        console.error(`❌ İşletme ${account.id} hatırlatma hatası:`, accountError);
      }
    }

  } catch (error) {
    console.error('❌ Hatırlatma servisi genel hatası:', error);
  }
};

/**
 * Belirli bir işletme için hatırlatma işlemi
 */
const processAccountReminders = async (accountId, businessName) => {
  const now = new Date();
  
  // Gelecek 48 saat içindeki planlanmış randevuları getir
  const maxReminderTime = new Date(now.getTime() + (48 * 60 * 60 * 1000));
  
  const appointments = await prisma.appointments.findMany({
    where: {
      accountId: accountId,
      appointmentDate: {
        gte: now,
        lte: maxReminderTime
      },
      status: 'PLANNED',
      reminderSentAt: null  // Sadece henüz hatırlatma gönderilmemiş randevular
    },
    include: {
      client: {
        select: {
          firstName: true,
          lastName: true,
          phone: true
        }
      },
      service: {
        select: {
          serviceName: true
        }
      },
      staff: {
        select: {
          fullName: true,
          userId: true
        }
      }
    }
  });

  let total = 0;
  let successful = 0;

  for (const appointment of appointments) {
    try {
      // Müşteri telefonu yoksa atla
      if (!appointment.client?.phone) {
        continue;
      }

      // ⚠️ staffUserId kontrolü kaldırıldı - işletme ayarları yeterli

      // ✅ İşletme hatırlatma ayarlarını kontrol et (tek kaynak)
      const account = await prisma.accounts.findUnique({
        where: { id: accountId },
        select: { 
          smsEnabled: true,
          reminderEnabled: true,
          reminderHours: true
        }
      });

      if (!account) continue;
      if (account.smsEnabled === false) continue;
      if (account.reminderEnabled === false) continue;

      // reminderHours: NULL ise varsayılan 24, false ise 24, yoksa değerini kullan
      const reminderHours = account.reminderHours ?? 24;

      // Hatırlatma zamanı geldi mi kontrol et
      const reminderTime = new Date(
        appointment.appointmentDate.getTime() - (reminderHours * 60 * 60 * 1000)
      );

      // Randevuya kalan süre (saat cinsinden)
      const hoursUntilAppointment = (appointment.appointmentDate.getTime() - now.getTime()) / (60 * 60 * 1000);

      // Hatırlatma zamanı geçmişse de gönder (randevu henüz gelmemişse)
      // Ama çok eski hatırlatmaları göndermemek için max 12 saat geriye bak
      const maxPastReminderTime = new Date(now.getTime() - (12 * 60 * 60 * 1000));

      // SON ŞANS: Eğer hatırlatma çok eski ama randevuya 3-6 saat kaldıysa yine de gönder
      const isLastChance = reminderTime < maxPastReminderTime && hoursUntilAppointment >= 3 && hoursUntilAppointment <= 6;

      // Hatırlatma zamanı geçti MI (ama max 12 saat öncesine kadar)? VEYA son şans mı?
      if ((reminderTime <= now && reminderTime >= maxPastReminderTime) || isLastChance) {
        total++;

        // SMS göndermeden ÖNCE işaretle — çift gönderimi ve sonsuz retry'ı önler
        await prisma.appointments.update({
          where: { id: appointment.id },
          data: { reminderSentAt: now }
        });

        // SMS mesajını hazırla
        const smsData = {
          customerName: `${appointment.client.firstName} ${appointment.client.lastName}`,
          serviceName: appointment.service.serviceName,
          appointmentDate: appointment.appointmentDate,
          staffName: appointment.staff.fullName,
          businessName: businessName
        };

        const smsMessage = prepareAppointmentReminderSMS(smsData);
        const smsResult = await sendSMS(appointment.client.phone, smsMessage);

        if (smsResult.success || smsResult.skipped) {
          successful++;
        } else {
          console.error(`❌ Hatırlatma SMS hatası: ${appointment.client.firstName} ${appointment.client.lastName}`, smsResult.error);
          // reminderSentAt zaten işaretlendi — tekrar denenmeyecek
        }
      }

    } catch (appointmentError) {
      console.error(`❌ Randevu ${appointment.id} hatırlatma hatası:`, appointmentError);
    }
  }

  return { total, successful };
};

/**
 * Hatırlatma servisini başlat
 */
export const startReminderService = () => {
  // Her 10 dakikada bir hatırlatma kontrolü yap
  cron.schedule('*/10 * * * *', () => {
    processAppointmentReminders();
  }, {
    scheduled: true,
    timezone: "Europe/Istanbul"
  });

  console.log('🔔 Hatırlatma servisi başlatıldı - Her 10 dakikada kontrol edilecek');
};

/**
 * Test için manuel hatırlatma kontrolü
 */
export const testReminderService = async (req, res) => {
  try {
    const { accountId } = req.user;
    
    const result = await processAccountReminders(accountId, 'Test İşletme');
    
    res.status(200).json({
      success: true,
      data: {
        totalChecked: result.total,
        remindersSent: result.successful,
        testTime: new Date().toISOString()
      },
      message: `Test hatırlatma tamamlandı: ${result.successful}/${result.total} başarılı`
    });

  } catch (error) {
    console.error('Test hatırlatma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Test hatırlatma sırasında hata oluştu',
      error: error.message
    });
  }
};
