import express from 'express';
import * as reportController from '../controllers/reportController.js';
import { isAuthenticated, restrictTo, requireAccountId } from '../middleware/authMiddleware.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';

const router = express.Router();

// 🔒 Tüm rapor endpoint'leri authentication ve işletme hesabı gerektirir
router.use(isAuthenticated, requireAccountId);

/**
 * 📊 GELİR-GİDER ÖZET RAPORU
 * GET /api/reports/income-expense-summary
 * 
 * Query Params:
 * - period: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_year'
 * - startDate: YYYY-MM-DD (custom tarih aralığı başlangıcı)
 * - endDate: YYYY-MM-DD (custom tarih aralığı bitişi)
 * 
 * İzin: reports_view
 * 
 * Örnek:
 * /api/reports/income-expense-summary?period=this_month
 * /api/reports/income-expense-summary?startDate=2026-01-01&endDate=2026-01-31
 */
router.route('/income-expense-summary')
  .get(checkPermission('reports', 'view'), reportController.getIncomeExpenseSummary);

/**
 * 📈 DETAYLI FİNANSAL RAPOR (Timeline)
 * GET /api/reports/detailed-financial
 * 
 * Query Params:
 * - period, startDate, endDate (yukarıdaki gibi)
 * - groupBy: 'day' | 'week' | 'month' (varsayılan: 'day')
 * 
 * İzin: reports_view
 * 
 * Günlük/haftalık/aylık gelir-gider-kar grafiği için
 * 
 * Örnek:
 * /api/reports/detailed-financial?period=this_month&groupBy=day
 */
router.route('/detailed-financial')
  .get(checkPermission('reports', 'view'), reportController.getDetailedFinancialReport);

/**
 * 🔍 DEBUG: Ödemeleri Kontrol Et
 * GET /api/reports/debug-payments
 * 
 * İzin: reports_view
 * 
 * Tarih aralığındaki tüm ödemeleri status bazında gösterir
 * Neden bazı ödemeler eksik diye kontrol için
 */
router.route('/debug-payments')
  .get(checkPermission('reports', 'view'), reportController.debugPayments);

/**
 * 💎 MÜŞTERİ SADAKAT RAPORU
 * GET /api/reports/customer-loyalty
 * 
 * Query Params:
 * - minPurchases: Minimum satın alma sayısı filtresi (örn: 3)
 * - sortBy: 'ltv' | 'purchases' | 'loyalty_score' | 'last_purchase' (varsayılan: 'ltv')
 * 
 * İzin: reports_view
 * 
 * Müşteri sadakati, LTV, churn risk analizi
 * 
 * Örnek:
 * /api/reports/customer-loyalty?sortBy=ltv
 * /api/reports/customer-loyalty?minPurchases=3&sortBy=loyalty_score
 */
router.route('/customer-loyalty')
  .get(checkPermission('reports', 'view'), reportController.getCustomerLoyaltyReport);

/**
 * 💸 BORÇ RAPORU
 * GET /api/reports/debt
 *
 * Query Params:
 * - sortBy: 'debt' | 'date' (varsayılan: 'debt')
 * - minDebt: minimum kalan borç (varsayılan: 0.01)
 * - search: müşteri adı / telefon
 * - page, limit: sayfalama
 */
router.route('/debt')
  .get(checkPermission('reports', 'view'), reportController.getDebtReport);

export default router;
