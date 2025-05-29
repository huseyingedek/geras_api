import express from 'express';
import * as appointmentController from '../controllers/appointmentController.js';
import { isAuthenticated } from '../middleware/authMiddleware.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';

const router = express.Router();

router.use(isAuthenticated);

// Hızlı randevu oluşturma (müşteri + satış + randevu)
router.route('/quick')
  .post(checkPermission('appointments', 'create'), appointmentController.createQuickAppointment);

// Tarihe göre randevu çekme endpoint'leri
router.route('/by-date')
  .get(checkPermission('appointments', 'view'), appointmentController.getAppointmentsByDate);

router.route('/today')
  .get(checkPermission('appointments', 'view'), appointmentController.getTodayAppointments);

router.route('/weekly')
  .get(checkPermission('appointments', 'view'), appointmentController.getWeeklyAppointments);

// Personel müsaitlik kontrolü
router.route('/staff-availability')
  .get(checkPermission('appointments', 'view'), appointmentController.checkStaffAvailability);

// Randevu saati doğrulama
router.route('/validate-time')
  .post(checkPermission('appointments', 'create'), appointmentController.validateAppointmentTime);

// Normal randevu işlemleri
router.route('/')
  .get(checkPermission('appointments', 'view'), appointmentController.getAllAppointments)
  .post(checkPermission('appointments', 'create'), appointmentController.createAppointment);

router.route('/:id')
  .get(checkPermission('appointments', 'view'), appointmentController.getAppointmentById)
  .put(checkPermission('appointments', 'update'), appointmentController.updateAppointment)
  .delete(checkPermission('appointments', 'delete'), appointmentController.deleteAppointment);

export default router; 