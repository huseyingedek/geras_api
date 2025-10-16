import express from 'express';
import * as notificationController from '../controllers/notificationController.js';
import { testReminderService } from '../services/reminderService.js';
import { isAuthenticated, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// Tüm route'lar authentication gerektirir
router.use(isAuthenticated);

// İşletmenin randevu hatırlatma ayarlarını getir
router.get('/reminder-settings', 
  notificationController.getReminderSettings
);

// İşletmenin randevu hatırlatma ayarlarını güncelle (sadece OWNER/ADMIN)
router.put('/reminder-settings', 
  restrictTo('OWNER', 'ADMIN'),
  notificationController.updateReminderSettings
);

// Hatırlatma seçeneklerini getir (frontend için)
router.get('/reminder-options', 
  notificationController.getReminderOptions
);

// Test hatırlatma servisi (development/test için)
router.post('/test-reminders',
  restrictTo('OWNER', 'ADMIN'),
  testReminderService
);

export default router;
