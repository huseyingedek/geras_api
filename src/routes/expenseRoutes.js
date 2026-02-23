import express from 'express';
import * as expenseController from '../controllers/expenseController.js';
import { isAuthenticated, restrictTo, requireAccountId } from '../middleware/authMiddleware.js';

const router = express.Router();

// 🔒 GİDER YÖNETİMİ - SADECE OWNER VE ADMIN ERİŞEBİLİR
// Finansal veriler kritik olduğu için sadece işletme sahibi erişebilir
router.use(isAuthenticated, requireAccountId);
router.use(restrictTo('OWNER'));

// ⚠️ ÖNEMLİ: /categories ve /vendors route'ları /:id'den ÖNCE olmalı
// Aksi halde Express "categories" ve "vendors" kelimelerini ID olarak algılar

// 📂 KATEGORİ ROUTE'LARI (/:id'den önce!)
router.route('/categories')
  .get(expenseController.getAllCategories)
  .post(expenseController.createCategory);

router.route('/categories/:id')
  .get(expenseController.getCategoryById)
  .put(expenseController.updateCategory)
  .delete(expenseController.deleteCategory);

// 🏢 TEDARİKÇİ ROUTE'LARI (/:id'den önce!)
router.route('/vendors')
  .get(expenseController.getAllVendors)
  .post(expenseController.createVendor);

router.route('/vendors/:id')
  .get(expenseController.getVendorById)
  .put(expenseController.updateVendor)
  .delete(expenseController.deleteVendor);

// 📊 RAPOR ROUTE'LARI (/:id'den önce!)
router.route('/reports/staff')
  .get(expenseController.getStaffExpenseReport);

router.route('/reports/vendor')
  .get(expenseController.getVendorExpenseReport);

// 💰 GİDER ROUTE'LARI
router.route('/')
  .get(expenseController.getAllExpenses)
  .post(expenseController.createExpense);

router.route('/:id')
  .put(expenseController.updateExpense)
  .delete(expenseController.deleteExpense);

export default router;

