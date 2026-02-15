import prisma from '../lib/prisma.js';
import AppError from '../utils/AppError.js';
import ErrorCodes from '../utils/errorCodes.js';
import { sendVerificationSMS, generateVerificationCode } from '../utils/smsService.js';

const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * SMS DOGRULAMA KODU GONDER
 * POST /api/auth/send-verification-code
 */
export const sendVerificationCode = catchAsync(async (req, res, next) => {
  const { phone } = req.body;

  if (!phone) {
    return next(new AppError('Telefon numarası gereklidir', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  // Telefon numarası validasyonu
  const phoneRegex = /^[0-9\s\-\+\(\)]+$/;
  const cleanPhone = phone.replace(/\s/g, '');
  
  if (!phoneRegex.test(phone)) {
    return next(new AppError('Geçersiz telefon numarası formatı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  if (cleanPhone.length < 10 || cleanPhone.length > 15) {
    return next(new AppError('Telefon numarası 10-15 rakam arasında olmalıdır', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  // 6 haneli kod oluştur
  const code = generateVerificationCode();
  
  // Kod süre sonu: 5 dakika
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 5);

  // Eski kodları temizle (aynı telefon için)
  await prisma.phoneVerification.deleteMany({
    where: {
      phone: phone,
      isVerified: false
    }
  });

  // Yeni kod kaydet
  await prisma.phoneVerification.create({
    data: {
      phone: phone,
      code: code,
      expiresAt: expiresAt,
      isVerified: false
    }
  });

  // SMS gönder
  const smsResult = await sendVerificationSMS(phone, code);

  if (!smsResult.success && !smsResult.skipped) {
    console.error('SMS gönderimi başarısız:', smsResult);
    // SMS gönderilemese bile kod kaydedildi, devam et
  }

  res.status(200).json({
    status: 'success',
    message: 'Doğrulama kodu telefonunuza gönderildi',
    data: {
      phone: phone,
      expiresAt: expiresAt,
      // Development için (production'da kaldır!)
      ...(process.env.NODE_ENV === 'development' && { code: code })
    }
  });
});

/**
 * SMS KODUNU DOGRULA
 * POST /api/auth/verify-code
 */
export const verifyCode = catchAsync(async (req, res, next) => {
  const { phone, code } = req.body;

  if (!phone || !code) {
    return next(new AppError('Telefon numarası ve kod gereklidir', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  // Kod 6 haneli mi?
  if (code.length !== 6 || !/^\d+$/.test(code)) {
    return next(new AppError('Geçersiz kod formatı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  // Kodu bul
  const verification = await prisma.phoneVerification.findFirst({
    where: {
      phone: phone,
      code: code,
      isVerified: false
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  if (!verification) {
    return next(new AppError('Geçersiz doğrulama kodu', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  // Süre kontrolü
  const now = new Date();
  if (verification.expiresAt < now) {
    return next(new AppError('Doğrulama kodu süresi dolmuş. Lütfen yeni kod isteyin', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  // Kodu doğrulandı olarak işaretle
  await prisma.phoneVerification.update({
    where: { id: verification.id },
    data: {
      isVerified: true,
      verifiedAt: now
    }
  });

  res.status(200).json({
    status: 'success',
    message: 'Telefon numarası başarıyla doğrulandı',
    data: {
      phone: phone,
      verified: true
    }
  });
});

/**
 * TELEFON NUMARASI DOGRULANMIS MI KONTROL ET
 * Helper fonksiyon
 */
export const isPhoneVerified = async (phone) => {
  const verification = await prisma.phoneVerification.findFirst({
    where: {
      phone: phone,
      isVerified: true
    },
    orderBy: {
      verifiedAt: 'desc'
    }
  });

  return !!verification;
};
