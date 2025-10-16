import cron from 'node-cron';
import prisma from '../lib/prisma.js';
import { sendSMS, prepareAppointmentReminderSMS } from '../utils/smsService.js';

/**
 * Hatırlatma gönderilecek randevuları bul ve SMS gönder
 */
const processAppointmentReminders = async () => {
  try {
    console.log('🔔 Hatırlatma kontrolü başlatıldı:', new Date().toISOString());

    // Tüm aktif işletmeleri getir
    const accounts = await prisma.accounts.findMany({
      where: {
        isActive: true,
        smsEnabled: true // SMS'i açık olan işletmeler
      },
      select: {
        id: true,
        businessName: true
      }
    });

    console.log(`📊 ${accounts.length} aktif işletme bulundu`);

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

    console.log(`✅ Hatırlatma kontrolü tamamlandı: ${successfulReminders}/${totalReminders} başarılı`);

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
  
  console.log(`🔍 İşletme ${accountId} için randevu aranıyor:`);
  console.log(`- Şu an: ${now.toISOString()}`);
  console.log(`- Max zaman: ${maxReminderTime.toISOString()}`);
  
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

  console.log(`📊 İşletme ${accountId} - ${appointments.length} randevu bulundu`);
  
  // Debug: Bulunan randevuları logla (Türkiye saati ile)
  appointments.forEach((apt, index) => {
    const turkeyTime = new Date(apt.appointmentDate.getTime() + (3 * 60 * 60 * 1000));
    console.log(`📅 Randevu ${index + 1}:`, {
      id: apt.id,
      customerName: `${apt.client?.firstName} ${apt.client?.lastName}`,
      appointmentDate_UTC: apt.appointmentDate.toISOString(),
      appointmentDate_Turkey: turkeyTime.toISOString(),
      turkeyTime_Formatted: turkeyTime.toLocaleString('tr-TR'),
      phone: apt.client?.phone ? 'VAR' : 'YOK',
      staffUserId: apt.staff?.userId ? 'VAR' : 'YOK'
    });
  });

  let total = 0;
  let successful = 0;

  for (const appointment of appointments) {
    try {
      // Müşteri telefonu yoksa atla
      if (!appointment.client?.phone) {
        console.log(`⏭️ Randevu ${appointment.id} atlandı: Müşteri telefonu yok`);
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

      if (!account) {
        console.log(`⚠️ İşletme ${accountId} bulunamadı`);
        continue;
      }

      // SMS servisi kapalıysa atla
      if (account.smsEnabled === false) {
        console.log(`ℹ️ İşletme ${accountId} SMS servisi kapalı`);
        continue;
      }

      // Hatırlatma servisi kapalıysa atla
      if (account.reminderEnabled === false) {
        console.log(`ℹ️ İşletme ${accountId} hatırlatma servisi kapalı`);
        continue;
      }

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

      console.log(`🕐 Randevu ${appointment.id} hatırlatma kontrolü:`, {
        customerName: `${appointment.client.firstName} ${appointment.client.lastName}`,
        appointmentTime: appointment.appointmentDate.toISOString(),
        reminderTime: reminderTime.toISOString(),
        reminderHours: reminderHours,
        now: now.toISOString(),
        hoursUntilAppointment: hoursUntilAppointment.toFixed(2),
        maxPastReminderTime: maxPastReminderTime.toISOString(),
        isLastChance: isLastChance,
        shouldSend: (reminderTime <= now && reminderTime >= maxPastReminderTime) || isLastChance
      });

      // Hatırlatma zamanı geçti MI (ama max 12 saat öncesine kadar)? VEYA son şans mı?
      if ((reminderTime <= now && reminderTime >= maxPastReminderTime) || isLastChance) {
        total++;

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

        if (smsResult.success) {
          // SMS başarıyla gönderildi - artık tekrar gönderilmemesi için kaydet
          await prisma.appointments.update({
            where: { id: appointment.id },
            data: { reminderSentAt: now }
          });
          
          successful++;
          if (isLastChance) {
            console.log(`✅ SON ŞANS Hatırlatma SMS gönderildi: ${appointment.client.firstName} ${appointment.client.lastName} (randevuya ${hoursUntilAppointment.toFixed(1)}h kaldı)`);
          } else {
            console.log(`✅ Hatırlatma SMS gönderildi: ${appointment.client.firstName} ${appointment.client.lastName} (${reminderHours}h önceden)`);
          }
        } else {
          console.error(`❌ Hatırlatma SMS hatası: ${appointment.client.firstName} ${appointment.client.lastName}`, smsResult.error);
        }
      } else if (reminderTime > now) {
        console.log(`⏰ Hatırlatma zamanı henüz gelmedi: ${appointment.client.firstName} ${appointment.client.lastName}`);
      } else {
        console.log(`⏭️ Hatırlatma zamanı çok eski (12+ saat geçmiş), atlandı: ${appointment.client.firstName} ${appointment.client.lastName}`);
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
    
    console.log('🧪 Test hatırlatma kontrolü başlatıldı');
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
