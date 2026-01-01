import express from 'express';
import * as salesController from '../controllers/salesController.js';
import { isAuthenticated } from '../middleware/authMiddleware.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';

const router = express.Router();

router.use(isAuthenticated);

// Tek istekte satış + randevu oluşturma
router.route('/with-appointment')
  .post(
    checkPermission('sales', 'create'),
    checkPermission('appointments', 'create'),
    salesController.createSaleWithAppointment
  );

router.route('/')
  .get(checkPermission('sales', 'view'), salesController.getAllSales)
  .post(checkPermission('sales', 'create'), salesController.createSale);

router.route('/payments')
  .get(checkPermission('payments', 'view'), salesController.getAllPayments);

router.route('/payments/:paymentId')
  .get(checkPermission('payments', 'view'), salesController.getPaymentById)
  .patch(checkPermission('payments', 'update'), salesController.updatePaymentStatus);

router.route('/:id')
  .get(checkPermission('sales', 'view'), salesController.getSaleById)
  .put(checkPermission('sales', 'update'), salesController.updateSale)
  .delete(checkPermission('sales', 'delete'), salesController.deleteSale); 

router.route('/:id/hard')
  .delete(checkPermission('sales', 'delete'), salesController.hardDeleteSale); 

router.route('/:id/payments')
  .get(checkPermission('sales', 'view'), salesController.getSalePayments)
  .post(checkPermission('sales', 'create'), salesController.addPaymentToSale);

router.route('/:id/sessions')
  .get(checkPermission('sales', 'view'), salesController.getSaleSessions)
  .post(checkPermission('sales', 'create'), salesController.createSession);
  
router.route('/:id/add-sessions')
  .put(checkPermission('sales', 'update'), salesController.addSessionsToSale);

export default router; 