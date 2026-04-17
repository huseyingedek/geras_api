/**
 * bookingRoutes.js
 * ────────────────────────────────────────────────────────
 * Public online randevu endpoint'leri — JWT auth YOK.
 * Rate limiting ile spam koruması var.
 * ────────────────────────────────────────────────────────
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  getBookingInfo,
  getBookingServices,
  getBookingStaff,
  getAvailableSlots,
  createBookingRequest,
} from '../controllers/bookingController.js';

const router = express.Router();

// Randevu oluşturma için rate limiter (spam önleme)
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 10,                   // 15 dk'da max 10 istek
  message: { status: 'error', message: 'Çok fazla istek. Lütfen biraz bekleyin.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Genel okuma limiti
const readLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 dakika
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /api/booking/:accountId/info
router.get('/:accountId/info', readLimiter, getBookingInfo);

// GET /api/booking/:accountId/services
router.get('/:accountId/services', readLimiter, getBookingServices);

// GET /api/booking/:accountId/staff?serviceId=X
router.get('/:accountId/staff', readLimiter, getBookingStaff);

// GET /api/booking/:accountId/slots?staffId=X&date=YYYY-MM-DD
router.get('/:accountId/slots', readLimiter, getAvailableSlots);

// POST /api/booking/:accountId/request
router.post('/:accountId/request', bookingLimiter, createBookingRequest);

export default router;
