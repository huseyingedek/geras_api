import express from 'express';
import { getSubscription, completeOnboarding, getProfile, updateProfile } from '../controllers/accountController.js';
import { isAuthenticated, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/subscription',        isAuthenticated, restrictTo('OWNER'), getSubscription);
router.patch('/onboarding/complete',isAuthenticated, restrictTo('OWNER'), completeOnboarding);

// İşletme profili (kayıt bilgileri + güncelleme)
router.get('/profile',  isAuthenticated, restrictTo('OWNER', 'ADMIN'), getProfile);
router.patch('/profile',isAuthenticated, restrictTo('OWNER'), updateProfile);

export default router;
