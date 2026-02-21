import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { promisify } from 'util';
import crypto from 'crypto';
import AppError from '../utils/AppError.js';
import ErrorCodes from '../utils/errorCodes.js';
import prisma from '../lib/prisma.js';
import { sendPasswordResetEmail } from '../utils/emailService.js';
import { addBasicPermissionsToAccount } from '../utils/permissionUtils.js';
import { isPhoneVerified } from './verificationController.js';
import { sendDemoAccountNotification } from '../utils/smsService.js';

const signToken = (id) => {
  return jwt.sign(
    { id }, 
    process.env.JWT_SECRET || 'super-secret-jwt-development-key', 
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user.id);
  
  const userWithoutPassword = { ...user };
  delete userWithoutPassword.password;
  
  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user: userWithoutPassword
    }
  });
};


const createAdmin = async (req, res, next) => {
  try {
    const { username, email, password, phone } = req.body;
    
    if (!username || !email || !password) {
      return next(new AppError('Lütfen tüm zorunlu alanları doldurun', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
    
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });
    
    if (existingUser) {
      return next(new AppError('Bu email adresi zaten kullanılıyor', 400, ErrorCodes.USER_ALREADY_EXISTS));
    }
    
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const newAdmin = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        phone,
        role: 'ADMIN'
      }
    });
    
    createSendToken(newAdmin, 201, res);
  } catch (error) {
    next(error);
  }
};


const login = async (req, res, next) => {
  try {
    // Geriye dönük uyumluluk: email veya emailOrPhone parametresi
    const identifier = req.body.emailOrPhone || req.body.email;
    const { password } = req.body;
    
    // Email/telefon ve şifre kontrolü
    if (!identifier || !password) {
      return next(new AppError('Lütfen email/telefon ve şifre giriniz', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
    
    // Email veya telefon numarası ile kullanıcıyı bul
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { phone: identifier }
        ]
      },
      include: {
        account: true
      }
    });
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return next(new AppError('Hatalı email/telefon veya şifre', 401, ErrorCodes.USER_AUTHENTICATION_FAILED));
    }
    
    // 🎯 Hesap erişim kontrolleri (ADMIN hariç)
    if (user.role !== 'ADMIN' && user.accountId) {
      const account = user.account;

      if (!account) {
        return next(new AppError('İşletme hesabı bulunamadı. Lütfen yetkili kişi ile iletişime geçin.', 403, ErrorCodes.ACCOUNT_RESTRICTED));
      }

      // --- DEMO HESAP kontrolleri ---
      if (account.isDemoAccount) {
        const now = new Date();

        // Cron henüz çalışmamışsa anlık kontrol — süresi geçmişse askıya al
        if (account.demoStatus === 'ACTIVE' && account.demoExpiresAt && account.demoExpiresAt <= now) {
          await prisma.accounts.update({
            where: { id: user.accountId },
            data: { demoStatus: 'EXPIRED', isActive: false }
          });
          return next(new AppError('30 günlük demo süreniz dolmuştur. Devam etmek için lütfen yetkili kişi ile iletişime geçin.', 403, ErrorCodes.ACCOUNT_RESTRICTED));
        }

        if (account.demoStatus === 'EXPIRED' || account.demoStatus === 'PENDING_APPROVAL') {
          return next(new AppError('Demo süreniz sona ermiştir. Devam etmek için lütfen yetkili kişi ile iletişime geçin.', 403, ErrorCodes.ACCOUNT_RESTRICTED));
        }

        if (account.demoStatus === 'RESTRICTED' || account.isActive === false) {
          return next(new AppError('İşletmeniz kısıtlanmıştır. Lütfen yetkili kişi ile iletişime geçin.', 403, ErrorCodes.ACCOUNT_RESTRICTED));
        }
      } else {
        // --- ÜCRETLİ HESAP kontrolleri ---

        // Hesap pasif
        if (account.isActive === false) {
          // Abonelik süresi dolmuş mu?
          if (account.subscriptionStatus === 'EXPIRED') {
            return next(new AppError('Abonelik süreniz sona ermiştir. Lütfen yetkili kişi ile iletişime geçin.', 403, ErrorCodes.ACCOUNT_RESTRICTED));
          }
          return next(new AppError('İşletmeniz kısıtlanmıştır. Lütfen yetkili kişi ile iletişime geçin.', 403, ErrorCodes.ACCOUNT_RESTRICTED));
        }

        // Cron henüz çalışmamışsa anlık kontrol — abonelik süresi geçmişse askıya al
        if (account.subscriptionStatus === 'ACTIVE' && account.subscriptionEndDate && new Date(account.subscriptionEndDate) <= new Date()) {
          await prisma.accounts.update({
            where: { id: user.accountId },
            data: { subscriptionStatus: 'EXPIRED', isActive: false }
          });
          return next(new AppError('Abonelik süreniz sona ermiştir. Lütfen yetkili kişi ile iletişime geçin.', 403, ErrorCodes.ACCOUNT_RESTRICTED));
        }
      }
    }
    
    createSendToken(user, 200, res);
  } catch (error) {
    next(error);
  }
};


const getMe = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        role: true,
        accountId: true
      }
    });
    
    if (!user) {
      return next(new AppError('Kullanıcı bulunamadı', 404, ErrorCodes.USER_NOT_FOUND));
    }
    
    let account = null;
    if (user.accountId) {
      account = await prisma.accounts.findUnique({
        where: { id: user.accountId }
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        user,
        account
      }
    });
  } catch (error) {
    next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Validasyon kontrolü
    if (!currentPassword || !newPassword) {
      return next(new AppError('Mevcut şifre ve yeni şifre gereklidir', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }

    // Yeni şifre güçlü mü kontrol et
    if (newPassword.length < 6) {
      return next(new AppError('Yeni şifre en az 6 karakter olmalıdır', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }

    // Kullanıcıyı ve mevcut şifresini getir
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        password: true
      }
    });

    if (!user) {
      return next(new AppError('Kullanıcı bulunamadı', 404, ErrorCodes.USER_NOT_FOUND));
    }

    // Mevcut şifreyi doğrula
    const isCurrentPasswordCorrect = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordCorrect) {
      return next(new AppError('Mevcut şifre hatalı', 400, ErrorCodes.USER_AUTHENTICATION_FAILED));
    }

    // Yeni şifre eskisiyle aynı mı kontrol et
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return next(new AppError('Yeni şifre mevcut şifrenizle aynı olamaz', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }

    // Yeni şifreyi hash'le
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Şifreyi güncelle
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword }
    });

    res.status(200).json({
      status: 'success',
      message: 'Şifreniz başarıyla değiştirildi'
    });

  } catch (error) {
    console.error('Şifre değiştirme hatası:', error);
    next(new AppError('Şifre değiştirilirken bir hata oluştu', 500, ErrorCodes.GENERAL_SERVER_ERROR));
  }
};

// 📧 Şifre Sıfırlama Talebi (Forgot Password)
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    // ✅ GÜVENLİK: Email validasyonu
    if (!email) {
      return next(new AppError('Lütfen email adresinizi giriniz', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }

    // Email formatı kontrolü
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return next(new AppError('Geçersiz email formatı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }

    // Kullanıcıyı bul
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        username: true
      }
    });

    // ✅ GÜVENLİK: Kullanıcı yoksa bile başarılı mesaj göster (enumeration attack'i önlemek için)
    if (!user) {
      return res.status(200).json({
        status: 'success',
        message: 'Eğer bu email adresine kayıtlı bir hesap varsa, şifre sıfırlama linki gönderildi'
      });
    }

    // ✅ Rastgele token oluştur (crypto ile güvenli)
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Token'ı hash'le (veritabanında şifrelenmiş sakla)
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    // Token süresini 1 saat sonra ayarla
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 saat

    // Veritabanını güncelle
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashedToken,
        passwordResetExpires: resetExpires
      }
    });

    // Email gönder
    try {
      await sendPasswordResetEmail(user.email, resetToken, user.username);

      res.status(200).json({
        status: 'success',
        message: 'Şifre sıfırlama linki email adresinize gönderildi'
      });

    } catch (emailError) {
      // Email gönderilemezse token'ı temizle
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: null,
          passwordResetExpires: null
        }
      });

      console.error('Email gönderme hatası:', emailError);
      return next(new AppError('Email gönderilemedi. Lütfen daha sonra tekrar deneyiniz', 500, ErrorCodes.GENERAL_SERVER_ERROR));
    }

  } catch (error) {
    console.error('Forgot password hatası:', error);
    next(new AppError('Şifre sıfırlama işlemi başlatılamadı', 500, ErrorCodes.GENERAL_SERVER_ERROR));
  }
};

// 🔐 Şifre Sıfırlama (Reset Password)
const resetPassword = async (req, res, next) => {
  try {
    // 🔍 DEBUG - Frontend'den gelen veriyi logla
    console.log('===============================');
    console.log('📥 RESET PASSWORD REQUEST');
    console.log('Method:', req.method);
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Body Keys:', Object.keys(req.body));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('===============================');
    
    const { token, newPassword } = req.body;

    // ✅ GÜVENLİK: Validasyon
    if (!token || !newPassword) {
      console.log('❌ VALIDATION FAILED:');
      console.log('  - Token var mı?:', !!token, '| Değer:', token);
      console.log('  - NewPassword var mı?:', !!newPassword, '| Değer:', newPassword);
      console.log('  - Body.token type:', typeof req.body.token);
      console.log('  - Body.newPassword type:', typeof req.body.newPassword);
      return next(new AppError('Token ve yeni şifre gereklidir', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }

    // Şifre uzunluk kontrolü
    if (newPassword.length < 6) {
      return next(new AppError('Şifre en az 6 karakter olmalıdır', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }

    // Token'ı hash'le (veritabanındaki ile karşılaştırmak için)
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Token'ı ve süresini kontrol et
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpires: {
          gte: new Date() // Token süresi dolmamış olmalı
        }
      }
    });

    if (!user) {
      return next(new AppError('Geçersiz veya süresi dolmuş token', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }

    // ✅ Yeni şifreyi hash'le
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Şifreyi güncelle ve token'ı temizle
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedNewPassword,
        passwordResetToken: null,
        passwordResetExpires: null
      }
    });

    res.status(200).json({
      status: 'success',
      message: 'Şifreniz başarıyla sıfırlandı. Şimdi yeni şifrenizle giriş yapabilirsiniz'
    });

  } catch (error) {
    console.error('Reset password hatası:', error);
    next(new AppError('Şifre sıfırlanamadı', 500, ErrorCodes.GENERAL_SERVER_ERROR));
  }
};

// 🎯 DEMO HESAP OLUŞTURMA (Tanıtım Sitesinden)
const createDemoAccount = async (req, res, next) => {
  try {
    const { 
      businessName, 
      contactPerson, 
      email, 
      phone, 
      businessType,
      ownerUsername,
      ownerEmail,
      ownerPassword,
      ownerPhone
    } = req.body;
    
    // ✅ Validasyonlar
    if (!businessName) {
      return next(new AppError('İşletme adı gereklidir', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
    
    if (!ownerUsername || !ownerEmail || !ownerPassword) {
      return next(new AppError('İşletme sahibi bilgileri eksik', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
    
    if (!ownerPhone) {
      return next(new AppError('Telefon numarası gereklidir', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
    
    // 🔐 Telefon numarası doğrulanmış mı kontrol et
    const phoneVerified = await isPhoneVerified(ownerPhone);
    if (!phoneVerified) {
      return next(new AppError('Telefon numarası doğrulanmamış. Lütfen önce SMS doğrulaması yapın', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
    
    // Email kontrolü - işletme
    if (email) {
      const existingAccount = await prisma.accounts.findUnique({
        where: { email }
      });
      
      if (existingAccount) {
        return next(new AppError('Bu email adresi zaten kullanılmaktadır', 400, ErrorCodes.DB_DUPLICATE_ENTRY));
      }
    }
    
    // Email kontrolü - kullanıcı
    const existingUser = await prisma.user.findUnique({
      where: { email: ownerEmail }
    });
    
    if (existingUser) {
      return next(new AppError('Bu kullanıcı email adresi zaten kullanılmaktadır', 400, ErrorCodes.USER_ALREADY_EXISTS));
    }
    
    // 🎯 30 gün sonrasını hesapla (demo süre sonu)
    const demoExpiresAt = new Date();
    demoExpiresAt.setDate(demoExpiresAt.getDate() + 30);
    
    // Transaction ile oluştur
    const result = await prisma.$transaction(async (tx) => {
      // 1. Demo işletme hesabı oluştur
      const newAccount = await tx.accounts.create({
        data: {
          businessName,
          contactPerson,
          email,
          phone,
          businessType: businessType || 'SESSION_BASED',
          subscriptionPlan: 'DEMO', // Demo planı
          isActive: true,
          isDemoAccount: true, // 🎯 Demo işareti
          demoExpiresAt: demoExpiresAt, // 30 gün sonra
          demoStatus: 'ACTIVE', // Aktif demo
          smsEnabled: true,
          reminderEnabled: true,
          reminderHours: 24
        }
      });
      
      // 2. Temel izinleri ekle
      await addBasicPermissionsToAccount(newAccount.id, tx);
      
      // 3. Owner kullanıcı oluştur
      const hashedPassword = await bcrypt.hash(ownerPassword, 12);
      
      const owner = await tx.user.create({
        data: {
          username: ownerUsername,
          email: ownerEmail,
          password: hashedPassword,
          phone: ownerPhone,
          role: 'OWNER',
          accountId: newAccount.id
        }
      });
      
      owner.password = undefined;
      
      return { account: newAccount, owner };
    }, {
      timeout: 30000,
    });
    
    // 🎯 Admin'e SMS bildirimi gönder
    try {
      await sendDemoAccountNotification({
        accountId:     result.account.id,
        businessName:  result.account.businessName,
        contactPerson: result.account.contactPerson,
        phone:         result.account.phone,
        email:         result.account.email,
        demoExpiresAt: result.account.demoExpiresAt
      });
      console.log('✅ Admin bildirim SMS gönderildi');
    } catch (smsError) {
      // SMS hatası demo hesap oluşturmayı engellemez
      console.warn('⚠️ Admin bildirim SMS gönderilemedi:', smsError.message);
    }
    
    // Token oluştur ve gönder
    createSendToken(result.owner, 201, res);
    
  } catch (error) {
    console.error('Demo hesap oluşturma hatası:', error);
    next(error);
  }
};

export {
  createAdmin,
  login,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
  createDemoAccount // 🎯 YENİ
}; 

// Oturum sahibinin izinlerini döner
export const getMyPermissions = async (req, res, next) => {
  try {
    const { role, accountId, id: userId } = req.user;

    // ADMIN: tüm sistem erişimi
    if (role === 'ADMIN') {
      return res.status(200).json({
        status: 'success',
        data: {
          role,
          accountId: null,
          allAccess: true,
          permissions: {}
        }
      });
    }

    // OWNER: hesap kapsamındaki tüm kaynaklara erişim
    if (role === 'OWNER') {
      // Hesaba tanımlı permission kaynaklarını çekip hepsini true işaretle
      const defs = await prisma.permission.findMany({
        where: { accountId },
        select: { resource: true }
      });
      const resources = Array.from(new Set(defs.map(d => d.resource)));
      const matrix = {};
      for (const r of resources) {
        matrix[r] = { canView: true, canCreate: true, canEdit: true, canDelete: true };
      }
      return res.status(200).json({
        status: 'success',
        data: {
          role,
          accountId,
          allAccess: true,
          permissions: matrix
        }
      });
    }

    // EMPLOYEE: StaffPermission üzerinden derle
    if (role === 'EMPLOYEE') {
      if (!accountId) {
        return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
      }

      const staff = await prisma.staff.findFirst({
        where: { userId: userId, accountId: accountId }
      });

      if (!staff) {
        return next(new AppError('Personel kaydı bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
      }

      const staffPerms = await prisma.staffPermission.findMany({
        where: { staffId: staff.id },
        include: { permission: true }
      });

      const permissions = {};
      for (const sp of staffPerms) {
        const resource = sp.permission.resource;
        if (!permissions[resource]) {
          permissions[resource] = { canView: false, canCreate: false, canEdit: false, canDelete: false };
        }
        if (sp.permission.name.endsWith('_view')) permissions[resource].canView = sp.canView;
        if (sp.permission.name.endsWith('_create')) permissions[resource].canCreate = sp.canCreate;
        if (sp.permission.name.endsWith('_update')) permissions[resource].canEdit = sp.canEdit;
        if (sp.permission.name.endsWith('_delete')) permissions[resource].canDelete = sp.canDelete;
      }

      return res.status(200).json({
        status: 'success',
        data: {
          role,
          accountId,
          allAccess: false,
          permissions
        }
      });
    }

    // Diğer durumlar
    return res.status(200).json({
      status: 'success',
      data: { role, accountId, allAccess: false, permissions: {} }
    });

  } catch (error) {
    next(error);
  }
};