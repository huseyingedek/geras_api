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