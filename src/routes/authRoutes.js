import express from 'express';
import * as authController from '../controllers/authController.js';
import * as adminController from '../controllers/adminController.js';
import { isAuthenticated } from '../middleware/authMiddleware.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.post('/login', authLimiter, authController.login);

router.post('/create-admin', authLimiter, authController.createAdmin);

router.get('/me', isAuthenticated, authController.getMe);

router.post('/change-password', isAuthenticated, authController.changePassword);

// Oturum sahibinin izin matrisi
router.get('/my-permissions', isAuthenticated, authController.getMyPermissions);

router.put('/my-business', isAuthenticated, adminController.updateMyBusiness);

export default router; 