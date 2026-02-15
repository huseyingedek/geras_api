import express from 'express';
import * as adminController from '../controllers/adminController.js';
import { isAuthenticated, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(isAuthenticated, restrictTo('ADMIN'));

router.route('/accounts')
  .get(adminController.getAllAccounts)
  .post(adminController.createAccount);

router.route('/accounts/:id')
  .get(adminController.getAccountById)
  .put(adminController.updateAccount)
  .delete(adminController.deleteAccount);

// Detaylı işletme bilgileri (admin paneli için)
router.get('/accounts/:id/details', adminController.getAccountDetails);

// 🎯 DEMO HESAP YÖNETİMİ (Admin)
router.get('/demo-accounts/pending', adminController.getPendingDemoAccounts);
router.get('/demo-accounts', adminController.getAllDemoAccounts);
router.post('/demo-accounts/:id/approve', adminController.approveDemoAccount);
router.post('/demo-accounts/:id/reject', adminController.rejectDemoAccount);

export default router; 