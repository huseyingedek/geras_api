import express from 'express';
import {
  verifyWebhook,
  receiveWebhook,
  testSendMessage,
  initWhatsAppConnect,
  handle360dialogCallbackEndpoint,
  getWhatsAppStatus,
  toggleWhatsApp,
  disconnectWhatsApp
} from '../controllers/whatsappController.js';
import { isAuthenticated } from '../middleware/authMiddleware.js';

const router = express.Router();

// ── Meta/360dialog webhook (public) ──────────────────────────────────────────
router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhook);

// ── 360dialog Connect callback (public — 360dialog yönlendirir) ───────────────
router.get('/360dialog/callback', handle360dialogCallbackEndpoint);

// ── Salon WhatsApp yönetimi (yetkili kullanıcılar) ───────────────────────────
router.get('/status',        isAuthenticated, getWhatsAppStatus);
router.get('/connect',       isAuthenticated, initWhatsAppConnect);
router.patch('/toggle',      isAuthenticated, toggleWhatsApp);
router.delete('/disconnect', isAuthenticated, disconnectWhatsApp);

// ── Test (sadece geliştirme) ──────────────────────────────────────────────────
router.post('/test-send', isAuthenticated, testSendMessage);

export default router;
