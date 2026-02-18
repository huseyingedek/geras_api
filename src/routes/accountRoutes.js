import express from 'express';
import { getSubscription, completeOnboarding } from '../controllers/accountController.js';
import { isAuthenticated, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/subscription', isAuthenticated, restrictTo('OWNER'), getSubscription);
router.patch('/onboarding/complete', isAuthenticated, restrictTo('OWNER'), completeOnboarding);

export default router;
