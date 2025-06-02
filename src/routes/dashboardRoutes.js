import express from 'express';
import * as dashboardController from '../controllers/dashboardController.js';
import { isAuthenticated } from '../middleware/authMiddleware.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';

const router = express.Router();

router.use(isAuthenticated);

// Dashboard ana istatistikleri
router.route('/stats')
  .get(checkPermission('appointments', 'view'), dashboardController.getDashboardStats);

// Dashboard basit özet
router.route('/summary')
  .get(checkPermission('appointments', 'view'), dashboardController.getDashboardSummary);

export default router; 