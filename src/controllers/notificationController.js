import prisma from '../lib/prisma.js';
import AppError from '../utils/AppError.js';
import ErrorCodes from '../utils/errorCodes.js';

// İşletmenin randevu hatırlatma ayarlarını getir
export const getReminderSettings = async (req, res, next) => {
  try {
    const { accountId } = req.user;

    if (!accountId) {
      return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }

    // İşletmenin hatırlatma ayarlarını getir
    const account = await prisma.accounts.findUnique({
      where: { id: accountId },
      select: { 
        smsEnabled: true,
        reminderEnabled: true,
        reminderHours: true,
        businessName: true 
      }
    });

    if (!account) {
      return next(new AppError('İşletme bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
    }

    res.status(200).json({
      success: true,
      data: {
        smsEnabled: account.smsEnabled ?? true, // NULL ise varsayılan true
        reminderEnabled: account.reminderEnabled ?? true, // NULL ise varsayılan true
        reminderHours: account.reminderHours ?? 24, // NULL ise varsayılan 24
        businessName: account.businessName
      },
      message: 'Hatırlatma ayarları başarıyla getirildi'
    });

  } catch (error) {
    console.error('Hatırlatma ayarları getirme hatası:', error);
    next(new AppError('Hatırlatma ayarları getirilirken hata oluştu', 500, ErrorCodes.GENERAL_SERVER_ERROR));
  }
};

// İşletmenin randevu hatırlatma ayarlarını güncelle (sadece OWNER/ADMIN)
export const updateReminderSettings = async (req, res, next) => {
  try {
    const { accountId, role } = req.user;
    const { smsEnabled, reminderEnabled, reminderHours } = req.body;

    // Sadece OWNER ve ADMIN işletme ayarlarını değiştirebilir
    if (role !== 'OWNER' && role !== 'ADMIN') {
      return next(new AppError('Bu işlemi yapmaya yetkiniz yok', 403, ErrorCodes.GENERAL_FORBIDDEN));
    }

    if (!accountId) {
      return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }

    // reminderHours validasyonu
    if (reminderHours !== undefined) {
      if (reminderHours < 1 || reminderHours > 168) { // 1 saat - 1 hafta arası
        return next(new AppError('Hatırlatma süresi 1-168 saat arasında olmalıdır', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
      }
    }

    // İşletme hatırlatma ayarlarını güncelle
    const updateData = {};
    if (smsEnabled !== undefined) updateData.smsEnabled = smsEnabled;
    if (reminderEnabled !== undefined) updateData.reminderEnabled = reminderEnabled;
    if (reminderHours !== undefined) updateData.reminderHours = reminderHours;
    updateData.updatedAt = new Date();

    const updatedAccount = await prisma.accounts.update({
      where: { id: accountId },
      data: updateData,
      select: {
        id: true,
        businessName: true,
        smsEnabled: true,
        reminderEnabled: true,
        reminderHours: true,
        updatedAt: true
      }
    });

    res.status(200).json({
      success: true,
      data: updatedAccount,
      message: 'Hatırlatma ayarları başarıyla güncellendi'
    });

  } catch (error) {
    console.error('Hatırlatma ayarları güncelleme hatası:', error);
    next(new AppError('Hatırlatma ayarları güncellenirken hata oluştu', 500, ErrorCodes.GENERAL_SERVER_ERROR));
  }
};


// Hatırlatma seçeneklerini getir (frontend için)
export const getReminderOptions = async (req, res) => {
  try {
    const reminderOptions = [
      { value: 1, label: '1 saat önceden', description: 'Randevudan 1 saat önce hatırlatma' },
      { value: 2, label: '2 saat önceden', description: 'Randevudan 2 saat önce hatırlatma' },
      { value: 3, label: '3 saat önceden', description: 'Randevudan 3 saat önce hatırlatma' },
      { value: 6, label: '6 saat önceden', description: 'Randevudan 6 saat önce hatırlatma' },
      { value: 12, label: '12 saat önceden', description: 'Randevudan 12 saat önce hatırlatma' },
      { value: 24, label: '1 gün önceden', description: 'Randevudan 1 gün önce hatırlatma' },
      { value: 48, label: '2 gün önceden', description: 'Randevudan 2 gün önce hatırlatma' },
      { value: 72, label: '3 gün önceden', description: 'Randevudan 3 gün önce hatırlatma' },
      { value: 168, label: '1 hafta önceden', description: 'Randevudan 1 hafta önce hatırlatma' }
    ];

    res.status(200).json({
      success: true,
      data: {
        reminderOptions: reminderOptions
      },
      message: 'Hatırlatma seçenekleri başarıyla getirildi'
    });

  } catch (error) {
    console.error('Hatırlatma seçenekleri getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Hatırlatma seçenekleri getirilirken hata oluştu',
      error: error.message
    });
  }
};


// ============================================================
// 🔔 BİLDİRİM SİSTEMİ API'LERİ
// ============================================================

/**
 * Kullanıcının tüm bildirimlerini getir
 */
export const getAllNotifications = async (req, res) => {
  try {
    const { accountId, userId } = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { isRead, type } = req.query;

    let whereClause = {
      accountId: accountId,
      userId: userId
    };

    // isRead filtresi
    if (isRead === 'true') {
      whereClause.isRead = true;
    } else if (isRead === 'false') {
      whereClause.isRead = false;
    }

    // type filtresi
    if (type) {
      whereClause.type = type;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: whereClause,
        orderBy: {
          createdAt: 'desc'
        },
        skip: offset,
        take: limit
      }),
      prisma.notification.count({
        where: whereClause
      }),
      prisma.notification.count({
        where: {
          accountId: accountId,
          userId: userId,
          isRead: false
        }
      })
    ]);

    res.status(200).json({
      success: true,
      data: notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      summary: {
        unreadCount: unreadCount,
        totalCount: total
      }
    });

  } catch (error) {
    console.error('Bildirimler getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Bildirimler alınırken hata oluştu',
      error: error.message
    });
  }
};

/**
 * Okunmamış bildirim sayısını getir
 */
export const getUnreadCount = async (req, res) => {
  try {
    const { accountId, userId } = req.user;

    const unreadCount = await prisma.notification.count({
      where: {
        accountId: accountId,
        userId: userId,
        isRead: false
      }
    });

    res.status(200).json({
      success: true,
      data: {
        unreadCount: unreadCount
      }
    });

  } catch (error) {
    console.error('Okunmamış bildirim sayısı hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Okunmamış bildirim sayısı alınırken hata oluştu',
      error: error.message
    });
  }
};

/**
 * Bildirimi okundu olarak işaretle
 */
export const markAsRead = async (req, res) => {
  try {
    const { accountId, userId } = req.user;
    const { id } = req.params;

    const notification = await prisma.notification.findFirst({
      where: {
        id: parseInt(id),
        accountId: accountId,
        userId: userId
      }
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Bildirim bulunamadı'
      });
    }

    const updatedNotification = await prisma.notification.update({
      where: {
        id: parseInt(id)
      },
      data: {
        isRead: true,
        updatedAt: new Date()
      }
    });

    res.status(200).json({
      success: true,
      message: 'Bildirim okundu olarak işaretlendi',
      data: updatedNotification
    });

  } catch (error) {
    console.error('Bildirim okundu işaretleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Bildirim okundu işaretlenemedi',
      error: error.message
    });
  }
};

/**
 * Tüm bildirimleri okundu olarak işaretle
 */
export const markAllAsRead = async (req, res) => {
  try {
    const { accountId, userId } = req.user;

    const result = await prisma.notification.updateMany({
      where: {
        accountId: accountId,
        userId: userId,
        isRead: false
      },
      data: {
        isRead: true,
        updatedAt: new Date()
      }
    });

    res.status(200).json({
      success: true,
      message: 'Tüm bildirimler okundu olarak işaretlendi',
      data: {
        updatedCount: result.count
      }
    });

  } catch (error) {
    console.error('Tüm bildirimleri okundu işaretleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Bildirimler okundu işaretlenemedi',
      error: error.message
    });
  }
};

/**
 * Bildirimi sil
 */
export const deleteNotification = async (req, res) => {
  try {
    const { accountId, userId } = req.user;
    const { id } = req.params;

    const notification = await prisma.notification.findFirst({
      where: {
        id: parseInt(id),
        accountId: accountId,
        userId: userId
      }
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Bildirim bulunamadı'
      });
    }

    await prisma.notification.delete({
      where: {
        id: parseInt(id)
      }
    });

    res.status(200).json({
      success: true,
      message: 'Bildirim başarıyla silindi'
    });

  } catch (error) {
    console.error('Bildirim silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Bildirim silinemedi',
      error: error.message
    });
  }
};

/**
 * Tüm bildirimleri sil
 */
export const deleteAllNotifications = async (req, res) => {
  try {
    const { accountId, userId } = req.user;

    const result = await prisma.notification.deleteMany({
      where: {
        accountId: accountId,
        userId: userId
      }
    });

    res.status(200).json({
      success: true,
      message: 'Tüm bildirimler başarıyla silindi',
      data: {
        deletedCount: result.count
      }
    });

  } catch (error) {
    console.error('Tüm bildirimleri silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Bildirimler silinemedi',
      error: error.message
    });
  }
};