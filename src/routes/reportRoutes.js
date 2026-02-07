import express from 'express';
import * as reportController from '../controllers/reportController.js';
import { isAuthenticated, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// 🔒 RAPOR YÖNETİMİ - SADECE OWNER VE ADMIN ERİŞEBİLİR
// Finansal veriler kritik olduğu için sadece yetkililer erişebilir
router.use(isAuthenticated);
router.use(restrictTo('OWNER', 'ADMIN'));

/**
 * 📊 GELİR-GİDER ÖZET RAPORU
 * GET /api/reports/income-expense-summary
 * 
 * Query Params:
 * - period: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_year'
 * - startDate: YYYY-MM-DD (custom tarih aralığı başlangıcı)
 * - endDate: YYYY-MM-DD (custom tarih aralığı bitişi)
 * 
 * Örnek:
 * /api/reports/income-expense-summary?period=this_month
 * /api/reports/income-expense-summary?startDate=2026-01-01&endDate=2026-01-31
 */
router.route('/income-expense-summary')
  .get(reportController.getIncomeExpenseSummary);

/**
 * 📈 DETAYLI FİNANSAL RAPOR (Timeline)
 * GET /api/reports/detailed-financial
 * 
 * Query Params:
 * - period, startDate, endDate (yukarıdaki gibi)
 * - groupBy: 'day' | 'week' | 'month' (varsayılan: 'day')
 * 
 * Günlük/haftalık/aylık gelir-gider-kar grafiği için
 * 
 * Örnek:
 * /api/reports/detailed-financial?period=this_month&groupBy=day
 */
router.route('/detailed-financial')
  .get(reportController.getDetailedFinancialReport);

/**
 * 🔍 DEBUG: Ödemeleri Kontrol Et
 * GET /api/reports/debug-payments
 * 
 * Tarih aralığındaki tüm ödemeleri status bazında gösterir
 * Neden bazı ödemeler eksik diye kontrol için
 */
router.route('/debug-payments')
  .get(reportController.debugPayments);

export default router;
