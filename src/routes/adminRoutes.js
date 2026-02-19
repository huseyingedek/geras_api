import express from 'express';
import * as adminController from '../controllers/adminController.js';
import * as planController from '../controllers/planController.js';
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

// 📋 ABONELİK YÖNETİMİ (Admin)
router.get('/subscriptions', adminController.getAllAccountsWithPlans);
router.patch('/accounts/:id/subscription', adminController.updateSubscriptionSettings);
router.get('/accounts/:id/subscription/history', adminController.getSubscriptionHistory);
router.post('/accounts/:id/subscription/payments', adminController.addSubscriptionPayment);
router.patch('/accounts/:id/subscription/payments/:paymentId/pay', adminController.markInstallmentPaid);
router.patch('/accounts/:id/demo-expiry', adminController.updateDemoExpiry);

// 📦 PLAN YÖNETİMİ (Admin)
router.get('/plans', planController.getAllPlans);
router.post('/plans', planController.createPlan);
router.get('/plans/:id', planController.getPlanById);
router.put('/plans/:id', planController.updatePlan);
router.delete('/plans/:id', planController.deletePlan);
router.patch('/plans/:id/toggle', planController.togglePlanStatus);

// 🎯 DEMO HESAP YÖNETİMİ (Admin)
router.get('/demo-accounts/pending', adminController.getPendingDemoAccounts);
router.get('/demo-accounts', adminController.getAllDemoAccounts);
router.post('/demo-accounts/:id/approve', adminController.approveDemoAccount);
router.post('/demo-accounts/:id/reject', adminController.rejectDemoAccount);

export default router; 