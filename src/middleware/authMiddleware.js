import jwt from 'jsonwebtoken';
import { promisify } from 'util';
import bcrypt from 'bcryptjs';
import AppError from '../utils/AppError.js';
import ErrorCodes from '../utils/errorCodes.js';
import prisma from '../lib/prisma.js';

const signToken = (id) => {
  return jwt.sign(
    { id }, 
    process.env.JWT_SECRET || 'super-secret-jwt-development-key', 
    { expiresIn: process.env.JWT_EXPIRES_IN || '90d' }
  );
};

// Admin impersonation için kısa süreli token
const signImpersonationToken = (ownerId, adminId) => {
  return jwt.sign(
    { id: ownerId, isImpersonating: true, impersonatedBy: adminId },
    process.env.JWT_SECRET || 'super-secret-jwt-development-key',
    { expiresIn: '4h' }
  );
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user.id);
  
  user.password = undefined;
  
  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user
    }
  });
};

const isAuthenticated = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
      return next(new AppError('Giriş yapmadınız! Lütfen giriş yapın.', 401, ErrorCodes.GENERAL_UNAUTHORIZED));
    }
    
    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET || 'super-secret-jwt-development-key');
    
    const currentUser = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { account: true }
    });
    
    if (!currentUser) {
      return next(new AppError('Bu token\'a sahip kullanıcı artık mevcut değil.', 401, ErrorCodes.USER_NOT_FOUND));
    }
    
    req.user = currentUser;

    // Impersonation bilgisini req.user'a ekle
    if (decoded.isImpersonating) {
      req.user.isImpersonating = true;
      req.user.impersonatedBy  = decoded.impersonatedBy;
    }

    next();
  } catch (error) {
    next(error);
  }
};


const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('Bu işlemi yapmaya yetkiniz yok', 403, ErrorCodes.GENERAL_FORBIDDEN));
    }
    next();
  };
};

// Impersonation sırasında kritik işlemleri engelle
const preventImpersonation = (req, res, next) => {
  if (req.user?.isImpersonating) {
    return next(new AppError('Bu işlem yönetici girişi (impersonation) sırasında yapılamaz.', 403, ErrorCodes.GENERAL_FORBIDDEN));
  }
  next();
};

// İşletme endpoint'lerine erişim için accountId zorunluluğu
// ADMIN kullanıcısı impersonation token kullanmadan bu endpoint'lere erişemez
const requireAccountId = (req, res, next) => {
  if (!req.user?.accountId) {
    return next(new AppError('Bu işlem için bir işletme hesabına bağlı olmanız gerekmektedir.', 403, ErrorCodes.GENERAL_FORBIDDEN));
  }
  next();
};

export {
  isAuthenticated,
  restrictTo,
  signToken,
  signImpersonationToken,
  createSendToken,
  preventImpersonation,
  requireAccountId
}; 