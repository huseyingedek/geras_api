import express from 'express';
import * as authController from '../controllers/authController.js';
import * as adminController from '../controllers/adminController.js';
import * as verificationController from '../controllers/verificationController.js';
import { isAuthenticated, restrictTo, preventImpersonation } from '../middleware/authMiddleware.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.post('/login', authLimiter, authController.login);

// Sadece mevcut ADMIN kullanıcısı başka admin oluşturabilir
router.post('/create-admin', isAuthenticated, restrictTo('ADMIN'), authController.createAdmin);

// 📱 SMS DOĞRULAMA (Public)
router.post('/send-verification-code', authLimiter, verificationController.sendVerificationCode);
router.post('/verify-code', authLimiter, verificationController.verifyCode);

// 🎯 DEMO HESAP OLUŞTURMA (Public - Tanıtım sitesinden)
router.post('/create-demo', authLimiter, authController.createDemoAccount);

router.get('/me', isAuthenticated, authController.getMe);

router.post('/change-password', isAuthenticated, preventImpersonation, authController.changePassword);

// 📧 Şifre sıfırlama (login gerektirmez)
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authLimiter, authController.resetPassword);

// Oturum sahibinin izin matrisi
router.get('/my-permissions', isAuthenticated, authController.getMyPermissions);

router.put('/my-business', isAuthenticated, preventImpersonation, adminController.updateMyBusiness);

export default router; 