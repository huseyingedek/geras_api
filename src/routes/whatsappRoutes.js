import express from 'express';
import { verifyWebhook, receiveWebhook, testSendMessage } from '../controllers/whatsappController.js';
import { isAuthenticated } from '../middleware/authMiddleware.js';

const router = express.Router();

// Meta webhook doğrulama (GET) + mesaj alma (POST) — public, auth yok
router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhook);

// Test endpoint — sadece yetkili kullanıcılar
router.post('/test-send', isAuthenticated, testSendMessage);

export default router;
