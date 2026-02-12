import express from 'express';
import * as notificationController from '../controllers/notificationController.js';
import { testReminderService } from '../services/reminderService.js';
import { manualCheckIncomplete } from '../services/incompleteAppointmentsService.js';
import { isAuthenticated, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// Tüm route'lar authentication gerektirir
router.use(isAuthenticated);

// ============================================================
// 🔔 BİLDİRİM SİSTEMİ API'LERİ
// ============================================================

// Tüm bildirimleri getir
router.get('/', 
  notificationController.getAllNotifications
);

// Okunmamış bildirim sayısı
router.get('/unread-count', 
  notificationController.getUnreadCount
);

// Bildirimi okundu işaretle
router.put('/:id/read', 
  notificationController.markAsRead
);

// Tüm bildirimleri okundu işaretle
router.put('/mark-all-read', 
  notificationController.markAllAsRead
);

// Bildirim sil
router.delete('/:id', 
  notificationController.deleteNotification
);

// Tüm bildirimleri sil
router.delete('/', 
  notificationController.deleteAllNotifications
);

// ============================================================
// ⚙️ HATIRLATMA AYARLARI
// ============================================================

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

// 🧪 Manuel tamamlanmamış randevu kontrolü (debug)
router.post('/check-incomplete',
  restrictTo('OWNER', 'ADMIN'),
  manualCheckIncomplete
);

export default router;
