import express from 'express';
import { sendMessage, clearSession, getChatStatus } from '../controllers/chatController.js';
import { isAuthenticated } from '../middleware/authMiddleware.js';

const router = express.Router();

// Tüm chat route'ları giriş gerektirir
router.use(isAuthenticated);

// Mesaj gönder
router.post('/', sendMessage);

// Konuşma geçmişini sıfırla
router.delete('/session', clearSession);

// AI servis durumu (sadece OWNER/ADMIN)
router.get('/status', getChatStatus);

export default router;
