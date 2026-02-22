import cron from 'node-cron';
import prisma from '../lib/prisma.js';

/**
 * 📊 TAMAMLANMAMIŞ RANDEVU BİLDİRİM SERVİSİ
 * 
 * Her gün saat 22:00'de çalışır ve o günkü tamamlanmamış randevular için
 * işletmeye bildirim gönderir.
 */

/**
 * O günün tamamlanmamış randevularını kontrol et ve bildirim gönder
 */
const checkIncompleteAppointments = async () => {
  try {
    // Tüm aktif işletmeleri getir
    const accounts = await prisma.accounts.findMany({
      where: {
        isActive: true
      },
      select: {
        id: true,
        businessName: true
      }
    });

    let totalNotifications = 0;

    // Her işletme için kontrol yap
    for (const account of accounts) {
      try {
        const result = await processAccountIncompleteAppointments(account.id, account.businessName);
        totalNotifications += result.notificationsSent;
      } catch (accountError) {
        console.error(`❌ İşletme ${account.id} kontrol hatası:`, accountError);
      }
    }

  } catch (error) {
    console.error('❌ Tamamlanmamış randevu servisi genel hatası:', error);
  }
};

/**
 * Belirli bir işletme için tamamlanmamış randevuları kontrol et
 */
const processAccountIncompleteAppointments = async (accountId, businessName) => {
  const now = new Date();
  
  // Bugünün başlangıç ve bitiş saatleri
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  // Son 7 gün için başlangıç tarihi
  const last7DaysStart = new Date(now);
  last7DaysStart.setDate(last7DaysStart.getDate() - 7);
  last7DaysStart.setHours(0, 0, 0, 0);

  // Dünün bitiş tarihi (bugün hariç son 7 gün için)
  const yesterdayEnd = new Date(todayStart);
  yesterdayEnd.setMilliseconds(-1);

  // 1️⃣ BUGÜNÜN TAMAMLANMAMIŞ RANDEVULARı (sadece PLANNED)
  const todayIncomplete = await prisma.appointments.findMany({
    where: {
      accountId: accountId,
      appointmentDate: {
        gte: todayStart,
        lte: todayEnd
      },
      status: 'PLANNED' // Sadece bekleyen randevular
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
          fullName: true
        }
      }
    },
    orderBy: {
      appointmentDate: 'asc'
    }
  });

  // 2️⃣ SON 7 GÜNÜN TAMAMLANMAMIŞ RANDEVULARı (bugün hariç, sadece PLANNED)
  const last7DaysIncomplete = await prisma.appointments.findMany({
    where: {
      accountId: accountId,
      appointmentDate: {
        gte: last7DaysStart,
        lte: yesterdayEnd
      },
      status: 'PLANNED' // Sadece bekleyen randevular
    },
    include: {
      client: {
        select: {
          firstName: true,
          lastName: true
        }
      },
      service: {
        select: {
          serviceName: true
        }
      }
    },
    orderBy: {
      appointmentDate: 'desc'
    }
  });

  if (todayIncomplete.length === 0 && last7DaysIncomplete.length === 0) {
    return { notificationsSent: 0 };
  }

  // 📋 BİLDİRİM MESAJINI HAZIRLA
  let notificationMessage = '';
  let notificationTitle = '';

  // BUGÜNÜN RANDEVULARı
  if (todayIncomplete.length > 0) {
    notificationTitle = `⚠️ ${todayIncomplete.length} Randevu Tamamlanmadı`;
    notificationMessage += `📋 **BUGÜN** (${todayIncomplete.length} randevu):\n\n`;
    
    todayIncomplete.forEach((apt, index) => {
      const time = new Date(apt.appointmentDate).toLocaleTimeString('tr-TR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      notificationMessage += `${index + 1}. ${time} - ${apt.client.firstName} ${apt.client.lastName} - ${apt.service.serviceName} ⏳\n`;
    });
  }

  // SON 7 GÜNÜN ÖZETİ
  if (last7DaysIncomplete.length > 0) {
    if (todayIncomplete.length > 0) {
      notificationMessage += `\n${'─'.repeat(40)}\n\n`;
      notificationTitle = `⚠️ ${todayIncomplete.length} Bugün, ${last7DaysIncomplete.length} Geçmiş Randevu`;
    } else {
      notificationTitle = `⚠️ ${last7DaysIncomplete.length} Geçmiş Randevu Tamamlanmadı`;
    }
    
    notificationMessage += `📊 **SON 7 GÜN** (${last7DaysIncomplete.length} randevu):\n\n`;
    
    // İlk 10 tanesini göster
    const displayCount = Math.min(10, last7DaysIncomplete.length);
    last7DaysIncomplete.slice(0, displayCount).forEach((apt, index) => {
      const date = new Date(apt.appointmentDate).toLocaleDateString('tr-TR', { 
        day: '2-digit',
        month: '2-digit'
      });
      notificationMessage += `${index + 1}. ${date} - ${apt.client.firstName} ${apt.client.lastName} - ${apt.service.serviceName} ⏳\n`;
    });

    if (last7DaysIncomplete.length > 10) {
      notificationMessage += `\n... ve ${last7DaysIncomplete.length - 10} randevu daha\n`;
    }
  }

  notificationMessage += `\n💡 Lütfen randevuların durumunu güncelleyin.`;

  // İşletmenin OWNER ve ADMIN kullanıcılarını bul
  const adminUsers = await prisma.user.findMany({
    where: {
      accountId: accountId,
      role: {
        in: ['OWNER', 'ADMIN']
      }
    },
    select: {
      id: true,
      username: true,
      role: true
    }
  });

  // Her yöneticiye bildirim gönder
  let notificationsSent = 0;
  for (const user of adminUsers) {
    try {
      await prisma.notification.create({
        data: {
          accountId: accountId,
          userId: user.id,
          title: notificationTitle,
          message: notificationMessage,
          type: 'SYSTEM',
          isRead: false,
          referenceType: 'INCOMPLETE_APPOINTMENTS',
          referenceId: null // Birden fazla randevu olduğu için ID yok
        }
      });
      
      notificationsSent++;
    } catch (notificationError) {
      console.error(`❌ Bildirim gönderme hatası (User ${user.id}):`, notificationError);
    }
  }

  return { notificationsSent };
};

/**
 * Tamamlanmamış randevu bildirim servisini başlat
 */
export const startIncompleteAppointmentsService = () => {
  // Her gün saat 22:30'da çalış
  cron.schedule('30 22 * * *', () => {
    checkIncompleteAppointments();
  }, {
    scheduled: true,
    timezone: "Europe/Istanbul"
  });

  console.log('📊 Tamamlanmamış randevu bildirim servisi başlatıldı - Her gün 22:30\'da çalışacak');

  setTimeout(() => {
    checkIncompleteAppointments();
  }, 5000); // 5 saniye sonra
};

/**
 * Manuel kontrol endpoint'i (debug için)
 */
export const manualCheckIncomplete = async (req, res) => {
  try {
    const { accountId } = req.user;
    
    const account = await prisma.accounts.findUnique({
      where: { id: accountId },
      select: { businessName: true }
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'İşletme bulunamadı'
      });
    }

    const result = await processAccountIncompleteAppointments(accountId, account.businessName);
    
    res.status(200).json({
      success: true,
      data: {
        notificationsSent: result.notificationsSent,
        checkTime: new Date().toISOString()
      },
      message: `Manuel kontrol tamamlandı: ${result.notificationsSent} bildirim gönderildi`
    });

  } catch (error) {
    console.error('Manuel kontrol hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Manuel kontrol sırasında hata oluştu',
      error: error.message
    });
  }
};
