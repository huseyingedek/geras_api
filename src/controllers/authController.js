import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { promisify } from 'util';
import AppError from '../utils/AppError.js';
import ErrorCodes from '../utils/errorCodes.js';
import prisma from '../lib/prisma.js';

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
    const { email, password } = req.body;
    
    if (!email || !password) {
      return next(new AppError('Lütfen email ve şifre giriniz', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
    
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        account: true
      }
    });
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return next(new AppError('Hatalı email veya şifre', 401, ErrorCodes.USER_AUTHENTICATION_FAILED));
    }
    
    if (user.role !== 'ADMIN' && user.accountId) {
      if (!user.account || user.account.isActive === false) {
        return next(new AppError('İşletmeniz kısıtlanmıştır. Lütfen yetkili kişi ile iletişime geçin.', 403, ErrorCodes.ACCOUNT_RESTRICTED));
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

export {
  createAdmin,
  login,
  getMe,
  changePassword
}; 