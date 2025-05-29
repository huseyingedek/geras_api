import express from 'express';
import * as authController from '../controllers/authController.js';
import { isAuthenticated } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/login', authController.login);

router.post('/create-admin', authController.createAdmin);

router.get('/me', isAuthenticated, authController.getMe);

export default router; 