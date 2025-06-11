import express from 'express';
import * as authController from '../controllers/authController.js';
import * as adminController from '../controllers/adminController.js';
import { isAuthenticated } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/login', authController.login);

router.post('/create-admin', authController.createAdmin);

router.get('/me', isAuthenticated, authController.getMe);

router.post('/change-password', isAuthenticated, authController.changePassword);

router.put('/my-business', isAuthenticated, adminController.updateMyBusiness);

export default router; 