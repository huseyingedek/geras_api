import express from 'express';
import {
  verifyWebhook,
  receiveWebhook,
  connectWhatsApp,
  getWhatsAppStatus,
  toggleWhatsApp,
  disconnectWhatsApp,
  testSendMessage
} from '../controllers/whatsappController.js';
import { isAuthenticated } from '../middleware/authMiddleware.js';

const router = express.Router();

// Meta webhook (public — Meta doğrulama ve mesaj gönderimi için)
router.get('/webhook',  verifyWebhook);
router.post('/webhook', receiveWebhook);

// Salon WhatsApp yönetimi (giriş yapmış kullanıcılar)
router.post('/connect',      isAuthenticated, connectWhatsApp);
router.get('/status',        isAuthenticated, getWhatsAppStatus);
router.patch('/toggle',      isAuthenticated, toggleWhatsApp);
router.delete('/disconnect', isAuthenticated, disconnectWhatsApp);

// Test — yalnızca geliştirme ortamında kullan
router.post('/test-send', isAuthenticated, testSendMessage);

export default router;
